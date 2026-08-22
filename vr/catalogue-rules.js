/** Build playable rulesets from catalogue BODY entries.
 *  Prefer measured world records (vr/worldParams.js + worldRecord.js);
 *  fall back to template + tag overlays when no seed exists. */

import { clamp, lerp } from './math.js';
import { RULESETS } from './rulesets.js';
import { CATALOGUE } from './catalogue.js';
import { seedForCatalogueItem } from './worldParams.js';
import {
  makeWorldRecord,
  applyRecordToRule,
  validateRecord,
  coverageOf,
  panelRanges,
  HOSTS,
} from './sim/worldRecord.js';
import { attachSystem } from './sim/systemRecord.js';
import { starForWorld, applyStarToRule, SOL } from './sim/star.js';
import { interiorProfileFor, dynamoFromInterior } from './sim/core.js';
import { applyPlanetLook } from './sim/planetLook.js';
import { applyWorldLook } from './sim/definition.js';

export const CATALOGUE_WORLDS = CATALOGUE.filter((x) => x.k === 'BODY');

/** Five invented rulesets — synthetic, not forced into the real-data schema. */
export const SYNTHETIC_RULESET_IDS = new Set([
  'terra', 'vermis', 'selene', 'ares', 'venus', 'titan', 'europa', 'daisy',
]);

function cloneRule(base) {
  return { ...base, gases: { ...base.gases }, atmo: base.atmo?.slice?.() || [...base.atmo], sky: base.sky?.slice?.() || [...base.sky] };
}

function tintLand(baseLand, tint, amt = 0.35) {
  return (t, m, l, e, ice, extra) => {
    const c = baseLand(t, m, l, e, ice, extra);
    return [
      lerp(c[0], tint[0], amt),
      lerp(c[1], tint[1], amt),
      lerp(c[2], tint[2], amt),
    ];
  };
}

function byId(id) {
  return RULESETS.find((r) => r.id === id) || RULESETS[0];
}

function normalizeGases(g) {
  const keys = ['N2', 'O2', 'CO2', 'CH4', 'H2O', 'dust', 'sulphate'];
  for (const k of keys) {
    if (!Number.isFinite(g[k]) || g[k] < 0) g[k] = 0;
  }
  const sum = g.N2 + g.O2 + g.CO2 + g.CH4 + g.H2O;
  if (sum > 1.6) {
    const s = 1.2 / sum;
    g.N2 *= s; g.O2 *= s; g.CO2 *= s; g.CH4 *= s; g.H2O *= s;
  }
  return g;
}

function sanitize(rule, opts = {}) {
  // When a world record is present, do not silently invent gravity/solar from clamps alone —
  // still clamp for numerical safety but preserve solarTrue.
  const hasRecord = !!rule.worldRecord && !rule.worldRecord.synthetic;
  rule.relief = clamp(Number(rule.relief) || 0.05, 0.005, 0.15);
  if (hasRecord && Number.isFinite(rule.solarTrue)) {
    rule.solar = clamp(rule.solarTrue, 0, 50);
  } else {
    rule.solar = clamp(Number(rule.solar) || 1, 0.02, 8);
  }
  rule.freeze = clamp(Number(rule.freeze) || 0.3, 0.01, 0.95);
  rule.aridity = clamp(Number(rule.aridity) || 0.05, 0, 1);
  rule.rotationPeriod = Number.isFinite(rule.rotationPeriod) ? rule.rotationPeriod : 1;
  if (Math.abs(rule.rotationPeriod) < 0.05 && !rule.tidallyLocked) rule.rotationPeriod = 0.05;
  rule.obliquity = Number.isFinite(rule.obliquity) ? rule.obliquity : 0;
  rule.eccentricity = clamp(Number(rule.eccentricity) || 0, 0, 0.98);
  if (hasRecord && Number.isFinite(rule.gravity)) {
    rule.gravity = clamp(rule.gravity, 0.01, 5);
  } else {
    rule.gravity = clamp(Number(rule.gravity) || 1, 0.05, 3);
  }
  rule.magnetosphere = clamp(Number(rule.magnetosphere) || 0, 0, 2);
  rule.totalWater = clamp(Number(rule.totalWater) || 0.5, 0.01, 2.5);
  rule.continentFrac = clamp(Number(rule.continentFrac) || 0.3, 0.02, 1);
  rule.nPlates = Math.max(3, Math.min(16, (rule.nPlates | 0) || 8));
  rule.atmoStrength = clamp(Number(rule.atmoStrength) || 1, 0.05, 2.2);
  rule.gases = normalizeGases(rule.gases || {});
  if (rule.targetLandFrac != null) rule.targetLandFrac = clamp(rule.targetLandFrac, 0.05, 0.95);
  if (rule.targetMeanTemp != null) rule.targetMeanTemp = clamp(rule.targetMeanTemp, 0.15, 1.2);
  if (rule.ghBias != null) rule.ghBias = clamp(Number(rule.ghBias) || 0, 0, 0.25);
  if (rule.minCO2 != null) rule.minCO2 = clamp(Number(rule.minCO2) || 0, 0, 0.05);
  if (!Array.isArray(rule.atmo) || rule.atmo.length < 3) rule.atmo = [0.4, 0.55, 0.9];
  if (!Array.isArray(rule.sky) || rule.sky.length < 3) rule.sky = [0.02, 0.03, 0.06];
  if (typeof rule.land !== 'function') rule.land = byId('terra').land;
  if (typeof rule.ocean !== 'function') rule.ocean = byId('terra').ocean;
  // Catalogue / exo worlds must not inherit Holocene-Earth biosphere shortcuts
  if (rule.catalogueId && rule.id !== 'terra' && !rule.name?.startsWith?.('Earth')) {
    rule.earthLike = false;
  } else if (rule.worldRecord && rule.id !== 'terra' && rule.catalogueId) {
    rule.earthLike = false;
  }
  if (opts.failMissing && hasRecord) {
    const r = rule.worldRecord.radius?.v;
    const m = rule.worldRecord.mass?.v;
    if (!(r > 0) && !(m > 0)) rule._paramError = 'missing-rm';
  }
  return rule;
}

function templateFor(item) {
  const needs = new Set(item.p || []);
  const name = (item.b || item.t || '').toLowerCase();
  if (item.b === 'Earth' || /^earth\b/i.test(item.t || '')) return byId('terra');
  if (item.c === 'sol') {
    if (name.includes('venus')) return byId('venus') || byId('ares');
    if (name.includes('mars')) return byId('ares');
    if (name.includes('mercury') || name === 'the moon' || name.includes('moon,')) return byId('selene');
    if (/jupiter|saturn|uranus|neptune/.test(name)) return byId('vermis');
    return byId('terra');
  }
  if (item.c === 'moons') {
    if (name.includes('titan')) return byId('titan') || byId('selene');
    if (name.includes('europa')) return byId('europa') || byId('selene');
    return byId('selene');
  }
  if (item.c === 'furnace') return byId('ares');
  if (item.c === 'giant') return byId('vermis');
  if (item.c === 'dark') {
    if (needs.has('nostar') || needs.has('pulsar') || needs.has('bd') || needs.has('wd')) return byId('selene');
    return byId('terra');
  }
  if (item.c === 'arch') return byId('vermis');
  if (item.c === 'temperate') return byId('terra');
  return byId('terra');
}

/** Tag-driven flavour — runs after record so it does not overwrite measured anchors. */
function applyNeeds(rule, item, { hasRecord = false } = {}) {
  const needs = new Set(item.p || []);
  const name = (item.b || item.t || '').toLowerCase();
  const hue = ((item.id * 47) % 360);

  if (needs.has('airless') || name.includes('mercury')) {
    if (!hasRecord || rule.surfacePressureBar == null) {
      rule.airless = true;
      rule.atmoStrength = 0.12;
      rule.gases = { N2: 0, O2: 0, CO2: 0, CH4: 0, H2O: 0, dust: 0, sulphate: 0 };
      rule.totalWater = 0.02;
      rule.aridity = 1;
    }
  }

  if (item.c === 'moons') {
    if (name.includes('titan')) {
      rule.airless = false;
      rule.atmoStrength = 0.55;
      rule.gases = { N2: 0.95, O2: 0, CO2: 0.01, CH4: 0.05, H2O: 0.001, dust: 0, sulphate: 0 };
      rule.totalWater = 0.7;
      if (!hasRecord) { rule.freeze = 0.55; rule.solar = 0.12; }
      rule.land = tintLand(rule.land, [180, 140, 70], 0.5);
      rule.ocean = () => [40, 55, 70];
    } else if (name.includes('triton') || name.includes('pluto') || name.includes('charon')) {
      rule.airless = false;
      rule.atmoStrength = 0.18;
      if (!hasRecord) { rule.solar = 0.08; rule.freeze = 0.78; }
      rule.land = tintLand(rule.land, [200, 190, 210], 0.45);
    } else if (needs.has('iceshell') || /europa|enceladus|ganymede|callisto/.test(name)) {
      rule.airless = true;
      rule.atmoStrength = 0.1;
      if (!hasRecord) { rule.solar = 0.18; rule.freeze = 0.74; }
      rule.totalWater = 0.95;
      rule.continentFrac = 0.08;
      rule.land = tintLand(rule.land, [210, 228, 245], 0.65);
    } else if (name.includes('io')) {
      rule.airless = true;
      if (!hasRecord) rule.solar = 0.35;
      rule.aridity = 1;
      rule.totalWater = 0.01;
      rule.land = tintLand(rule.land, [220, 160, 40], 0.55);
      rule.gases = { ...rule.gases, sulphate: 0.12 };
    } else if (!hasRecord) {
      rule.airless = true;
      rule.atmoStrength = 0.1;
      rule.solar = 0.22;
    }
  }

  // Rotation / lock / retro — skip when record already set them
  if (!hasRecord) {
    if (needs.has('lock') || needs.has('eyeball') || needs.has('ucd')) {
      rule.rotationPeriod = Math.max(Math.abs(rule.rotationPeriod), 40);
      rule.obliquity = 0;
    }
    if (needs.has('retro')) rule.rotationPeriod = -243;
    if (needs.has('ecc')) rule.eccentricity = Math.max(rule.eccentricity, 0.55);
    if (needs.has('obliq')) rule.obliquity = 98 * Math.PI / 180;
  }

  if (needs.has('magma') || needs.has('rockvapour') || item.c === 'furnace') {
    if (!hasRecord) rule.solar = Math.max(rule.solar, 2.2);
    rule.freeze = Math.min(rule.freeze, 0.04);
    rule.aridity = 0.6;
    rule.totalWater = Math.min(rule.totalWater, 0.12);
    rule.continentFrac = Math.max(rule.continentFrac, 0.7);
    rule.atmo = [1.0, 0.32, 0.14];
    rule.land = tintLand(rule.land, [230, 70, 25], 0.45);
    rule.ocean = (d) => [80 + 40 * d, 20 + 10 * d, 10];
  }

  if (needs.has('iceshell') || needs.has('n2glacier') || /europa|enceladus|pluto|hoth/.test(name)) {
    if (!hasRecord) rule.solar = Math.min(rule.solar, 0.32);
    rule.freeze = Math.max(rule.freeze, 0.68);
    rule.totalWater = Math.max(rule.totalWater, 0.85);
    rule.continentFrac = Math.min(rule.continentFrac, 0.2);
    rule.land = tintLand(rule.land, [200, 220, 240], 0.5);
  }

  if (needs.has('h2') || item.c === 'giant') {
    rule.continentFrac = 0.04;
    rule.totalWater = 1.3;
    rule.nPlates = 4;
    rule.relief = 0.015;
    rule.atmoStrength = 1.7;
    rule.airless = false;
    rule.gases = { N2: 0.08, O2: 0, CO2: 0.02, CH4: 0.18, H2O: 0.06, dust: 0.03, sulphate: 0 };
    const warm = needs.has('jet') || needs.has('ironrain') || /wasp|kelt|hat-p|hd 189|hd 209|51 peg/i.test(name);
    if (warm) {
      if (!hasRecord) rule.solar = Math.max(rule.solar, 3.2);
      rule.freeze = 0.02;
      rule.ocean = (d) => [60 + 40 * d, 40 + 20 * d, 20 + 10 * d];
      rule.land = tintLand(rule.land, [255, 140, 40], 0.4);
      rule.atmo = [1.0, 0.55, 0.25];
    } else {
      rule.ocean = (d) => [30 + 20 * d, 50 + 40 * d, 110 + 70 * d];
      rule.land = tintLand(rule.land, [160, 110, 50], 0.3);
    }
  }

  if (needs.has('sulfur') || name.includes('venus') || name.includes('io')) {
    rule.gases = { ...rule.gases, CO2: Math.max(rule.gases.CO2, 0.85), sulphate: Math.max(rule.gases.sulphate, 0.08), O2: 0 };
    rule.atmo = [1.0, 0.82, 0.32];
    if (name.includes('venus')) {
      if (!hasRecord) {
        rule.solar = 1.85;
        rule.rotationPeriod = -243;
      }
      rule.freeze = 0.02;
      rule.airless = false;
      rule.atmoStrength = 1.8;
      rule.totalWater = 0.05;
      rule.continentFrac = 1;
      rule.interior = interiorProfileFor({ ...rule, id: 'venus', name: 'Venus' }, item);
      rule.magnetosphere = dynamoFromInterior(rule.interior, rule.rotationPeriod);
      rule.land = tintLand(byId('ares').land, [210, 170, 60], 0.35);
    }
  }

  if (!hasRecord && (needs.has('flare') || needs.has('xuv') || needs.has('ucd'))) {
    rule.solar = clamp(rule.solar * (needs.has('ucd') ? 0.5 : 0.7), 0.15, 1.4);
    rule.magnetosphere = Math.min(rule.magnetosphere, 0.25);
  }
  if (!hasRecord && (needs.has('nostar') || needs.has('pulsar') || needs.has('bd'))) {
    rule.solar = 0.06;
    rule.sky = [0.008, 0.008, 0.015];
    rule.atmoStrength = Math.min(rule.atmoStrength, 0.35);
    rule.land = tintLand(rule.land, [40, 50, 80], 0.35);
  }
  if (!hasRecord && (needs.has('wd') || needs.has('sdb'))) {
    rule.solar = 3.8;
    rule.sky = [0.04, 0.05, 0.14];
    rule.atmo = [0.45, 0.55, 1.0];
  }
  if (needs.has('waterworld') || needs.has('hycean') || name.includes('ocean')) {
    rule.continentFrac = 0.06;
    rule.totalWater = 1.5;
    rule.aridity = 0.01;
    rule.airless = false;
  }
  if (needs.has('dust') || name.includes('mars')) {
    rule.gases = { ...rule.gases, dust: Math.max(rule.gases.dust, 0.05), CO2: Math.max(rule.gases.CO2, 0.88) };
    rule.signature = 'dust';
    if (!hasRecord) rule.solar = 0.72;
    rule.airless = false;
    rule.atmoStrength = 0.5;
    rule.continentFrac = 0.95;
    rule.totalWater = 0.12;
    rule.interior = interiorProfileFor({ ...rule, id: 'ares', name: 'Mars' }, item);
    rule.magnetosphere = dynamoFromInterior(rule.interior, rule.rotationPeriod || 1);
  }
  if (item.c === 'temperate') {
    if (!hasRecord) rule.solar = clamp(rule.solar || 0.8, 0.4, 1.2);
    rule.totalWater = Math.max(rule.totalWater, 0.65);
    rule.airless = false;
    const tint = [
      40 + (hue % 80),
      160 + ((hue * 3) % 60),
      60 + ((hue * 5) % 40),
    ];
    rule.land = tintLand(rule.land, tint, 0.18);
  }
  if (!hasRecord && item.c === 'arch') {
    rule.eccentricity = Math.max(rule.eccentricity, 0.25);
    rule.solar = clamp(rule.solar, 0.3, 2.5);
  }
  if (!hasRecord && item.c === 'dark' && needs.has('binary')) {
    rule.solar = 0.55;
    rule.sky = [0.04, 0.03, 0.05];
  }

  // Stable flavour from id — only when no measured gravity/relief
  if (!hasRecord) {
    rule.gravity = clamp(rule.gravity * (0.85 + ((item.id * 17) % 40) / 100), 0.08, 2.8);
    rule.relief = clamp(rule.relief * (0.9 + (item.id % 7) * 0.03), 0.008, 0.12);
  }
  rule.nPlates = Math.max(3, Math.min(14, rule.nPlates + (item.id % 5) - 2));
  return rule;
}

/** Resolve seed → WorldRecord for a catalogue BODY item. */
export function recordForCatalogueItem(item) {
  const seed = seedForCatalogueItem(item);
  if (!seed) return null;
  return attachSystem(makeWorldRecord(seed, { source: 'seed' }));
}

export function rulesetFromCatalogue(item) {
  if (!item || item.k !== 'BODY') return null;
  const record = recordForCatalogueItem(item);
  const hasRecord = !!record;

  // Earth is the calibration ruleset — attach record but keep terra physics
  if (item.b === 'Earth' || /^Earth,/i.test(item.t || '')) {
    const earth = cloneRule(byId('terra'));
    earth.id = `w${item.id}`;
    earth.name = 'Earth';
    earth.blurb = item.d.length > 110 ? item.d.slice(0, 108) + '…' : item.d;
    earth.catalogueId = item.id;
    earth.catalogueNeeds = item.p || [];
    earth._catalogueItem = item;
    earth.synthetic = false;
    if (record) applyRecordToRule(earth, record);
    earth.interior = interiorProfileFor(earth, item);
    earth.magnetosphere = dynamoFromInterior(earth.interior, earth.rotationPeriod || 1);
    const star = starForWorld(item, record);
    applyStarToRule(earth, star, record?.a?.v || 1);
    earth.panelRanges = panelRanges(record);
    return sanitize(earth);
  }

  const base = cloneRule(templateFor(item));
  const name = (item.b || item.t).replace(/\s+/g, ' ').trim();
  const short = name.length > 28 ? name.slice(0, 26) + '…' : name;
  base.id = `w${item.id}`;
  base.name = short;
  base.blurb = item.d.length > 110 ? item.d.slice(0, 108) + '…' : item.d;
  base.catalogueId = item.id;
  base.catalogueNeeds = item.p || [];
  base.signature = base.signature || 'catalogue';
  base._catalogueItem = item;
  base.synthetic = false;

  if (record) applyRecordToRule(base, record);
  applyNeeds(base, item, { hasRecord });

  const aAu = record?.a?.v || base.semiMajorAu || (base.solar ? Math.sqrt(1 / Math.max(0.05, base.solar)) : 1);
  const star = starForWorld(item, record);
  applyStarToRule(base, star, aAu > 0 ? aAu : 1);
  // Re-assert record insolation after star apply (authoritative when present)
  if (record && Number.isFinite(record.S?.v)) {
    base.solarTrue = record.S.v;
    base.solar = Math.min(80, Math.max(0, record.S.v));
  }

  const needs = new Set(item.p || []);
  if (record?.spinOrbit?.p === 3) {
    base.tidallyLocked = false;
  } else if (record?.tidallyLocked || needs.has('lock') || needs.has('eyeball') || needs.has('ucd')) {
    base.tidallyLocked = true;
    if (!record) {
      base.rotationPeriod = Math.max(Math.abs(base.rotationPeriod || 1), 40);
      base.obliquity = 0;
    }
  }
  if (needs.has('iceshell')) {
    const teq = record?.teq?.v ?? base.teqK;
    // Temperate "iceshell" tags mean a water layer, not Europa. Only freeze
    // the lid when the world is actually cold or is an outer-system body.
    if (!(teq > 180) || item.c === 'moons' || item.c === 'sol') base.iceShell = true;
  }
  if (/titan/i.test(name)) base.methaneSolvent = true;
  if (/venus/i.test(name)) base.aerialBio = true;
  if (/mars/i.test(name)) base.obliquityWander = true;
  if (/kepler-16/i.test(name)) {
    base.binaryBeat = { L1: 0.36, L2: 0.04, Pbin: 41.08 };
  }
  if (record?.teq?.v > 1700) base.magmaOcean = true;

  base.interior = interiorProfileFor(base, item);
  base.magnetosphere = dynamoFromInterior(base.interior, base.rotationPeriod || 1);
  base.panelRanges = panelRanges(record);
  applyPlanetLook(base);
  applyWorldLook(base);
  return sanitize(base, { failMissing: true });
}

/** Step through playable catalogue worlds. */
export function adjacentCatalogueWorld(currentId, dir = 1) {
  const list = CATALOGUE_WORLDS;
  if (!list.length) return null;
  let idx = list.findIndex((x) => x.id === currentId);
  if (idx < 0) idx = dir > 0 ? -1 : 0;
  idx = (idx + dir + list.length * 10) % list.length;
  return list[idx];
}

/** Smoke-test every BODY ruleset builds cleanly. */
export function validateCatalogueWorlds() {
  const bad = [];
  for (const item of CATALOGUE_WORLDS) {
    try {
      const r = rulesetFromCatalogue(item);
      if (!r || !Number.isFinite(r.solar) || typeof r.land !== 'function') bad.push(item.id);
    } catch {
      bad.push(item.id);
    }
  }
  return bad;
}

/** Coverage report across all seeded catalogue worlds. */
export function catalogueCoverageReport() {
  const rows = [];
  for (const item of CATALOGUE_WORLDS) {
    const rec = recordForCatalogueItem(item);
    if (!rec) {
      rows.push({ id: item.id, name: item.b, seeded: false });
      continue;
    }
    const cov = coverageOf(rec);
    const problems = validateRecord(rec);
    rows.push({
      id: item.id,
      name: item.b,
      seeded: true,
      key: rec.key,
      confidence: rec.confidence,
      ...cov,
      problems,
      assumptions: rec.assumptions,
    });
  }
  return rows;
}

export { SOL, HOSTS, panelRanges };
