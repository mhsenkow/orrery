/** Build playable rulesets from catalogue BODY entries.
 *  Approximations so every catalogue world can be held today; tags drive regime. */

import { clamp, lerp } from './math.js';
import { RULESETS } from './rulesets.js';
import { CATALOGUE } from './catalogue.js';

export const CATALOGUE_WORLDS = CATALOGUE.filter((x) => x.k === 'BODY');

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

function sanitize(rule) {
  rule.relief = clamp(Number(rule.relief) || 0.05, 0.005, 0.15);
  rule.solar = clamp(Number(rule.solar) || 1, 0.02, 8);
  rule.freeze = clamp(Number(rule.freeze) || 0.3, 0.01, 0.95);
  rule.aridity = clamp(Number(rule.aridity) || 0.05, 0, 1);
  rule.rotationPeriod = Number.isFinite(rule.rotationPeriod) ? rule.rotationPeriod : 1;
  if (Math.abs(rule.rotationPeriod) < 0.05) rule.rotationPeriod = 0.05;
  rule.obliquity = Number.isFinite(rule.obliquity) ? rule.obliquity : 0;
  rule.eccentricity = clamp(Number(rule.eccentricity) || 0, 0, 0.98);
  rule.gravity = clamp(Number(rule.gravity) || 1, 0.05, 3);
  rule.magnetosphere = clamp(Number(rule.magnetosphere) || 0, 0, 2);
  rule.totalWater = clamp(Number(rule.totalWater) || 0.5, 0.01, 2.5);
  rule.continentFrac = clamp(Number(rule.continentFrac) || 0.3, 0.02, 1);
  rule.nPlates = Math.max(3, Math.min(16, (rule.nPlates | 0) || 8));
  rule.atmoStrength = clamp(Number(rule.atmoStrength) || 1, 0.05, 2.2);
  rule.gases = normalizeGases(rule.gases || {});
  if (!Array.isArray(rule.atmo) || rule.atmo.length < 3) rule.atmo = [0.4, 0.55, 0.9];
  if (!Array.isArray(rule.sky) || rule.sky.length < 3) rule.sky = [0.02, 0.03, 0.06];
  if (typeof rule.land !== 'function') rule.land = byId('terra').land;
  if (typeof rule.ocean !== 'function') rule.ocean = byId('terra').ocean;
  return rule;
}

function templateFor(item) {
  const needs = new Set(item.p || []);
  const name = (item.b || item.t || '').toLowerCase();
  if (item.c === 'sol') {
    if (name.includes('venus')) return byId('ares');
    if (name.includes('mars')) return byId('ares');
    if (name.includes('mercury') || name === 'the moon' || name.includes('moon,')) return byId('selene');
    if (/jupiter|saturn|uranus|neptune/.test(name)) return byId('vermis');
    return byId('terra');
  }
  if (item.c === 'moons') return byId('selene');
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

function applyNeeds(rule, item) {
  const needs = new Set(item.p || []);
  const name = (item.b || item.t || '').toLowerCase();
  const hue = ((item.id * 47) % 360);

  if (needs.has('airless') || name.includes('mercury')) {
    rule.airless = true;
    rule.atmoStrength = 0.12;
    rule.gases = { N2: 0, O2: 0, CO2: 0, CH4: 0, H2O: 0, dust: 0, sulphate: 0 };
    rule.totalWater = 0.02;
    rule.aridity = 1;
  }

  if (item.c === 'moons') {
    if (name.includes('titan')) {
      rule.airless = false;
      rule.atmoStrength = 0.55;
      rule.gases = { N2: 0.95, O2: 0, CO2: 0.01, CH4: 0.05, H2O: 0.001, dust: 0, sulphate: 0 };
      rule.totalWater = 0.7;
      rule.freeze = 0.55;
      rule.solar = 0.12;
      rule.land = tintLand(rule.land, [180, 140, 70], 0.5);
      rule.ocean = () => [40, 55, 70];
    } else if (name.includes('triton') || name.includes('pluto') || name.includes('charon')) {
      rule.airless = false;
      rule.atmoStrength = 0.18;
      rule.solar = 0.08;
      rule.freeze = 0.78;
      rule.land = tintLand(rule.land, [200, 190, 210], 0.45);
    } else if (needs.has('iceshell') || /europa|enceladus|ganymede|callisto/.test(name)) {
      rule.airless = true;
      rule.atmoStrength = 0.1;
      rule.solar = 0.18;
      rule.freeze = 0.74;
      rule.totalWater = 0.95;
      rule.continentFrac = 0.08;
      rule.land = tintLand(rule.land, [210, 228, 245], 0.65);
    } else if (name.includes('io')) {
      rule.airless = true;
      rule.solar = 0.35;
      rule.aridity = 1;
      rule.totalWater = 0.01;
      rule.land = tintLand(rule.land, [220, 160, 40], 0.55);
      rule.gases = { ...rule.gases, sulphate: 0.12 };
    } else {
      rule.airless = true;
      rule.atmoStrength = 0.1;
      rule.solar = 0.22;
    }
  }

  if (needs.has('lock') || needs.has('eyeball') || needs.has('ucd')) {
    rule.rotationPeriod = Math.max(Math.abs(rule.rotationPeriod), 40);
    rule.obliquity = 0;
  }
  if (needs.has('retro')) rule.rotationPeriod = -243;
  if (needs.has('ecc')) rule.eccentricity = Math.max(rule.eccentricity, 0.55);
  if (needs.has('obliq')) rule.obliquity = 98 * Math.PI / 180;

  if (needs.has('magma') || needs.has('rockvapour') || item.c === 'furnace') {
    rule.solar = Math.max(rule.solar, 2.2);
    rule.freeze = 0.04;
    rule.aridity = 0.6;
    rule.totalWater = Math.min(rule.totalWater, 0.12);
    rule.continentFrac = Math.max(rule.continentFrac, 0.7);
    rule.atmo = [1.0, 0.32, 0.14];
    rule.land = tintLand(rule.land, [230, 70, 25], 0.45);
    rule.ocean = (d) => [80 + 40 * d, 20 + 10 * d, 10];
  }

  if (needs.has('iceshell') || needs.has('n2glacier') || /europa|enceladus|pluto|hoth/.test(name)) {
    rule.solar = Math.min(rule.solar, 0.32);
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
      rule.solar = Math.max(rule.solar, 3.2);
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
      rule.solar = 1.85;
      rule.freeze = 0.02;
      rule.airless = false;
      rule.atmoStrength = 1.8;
      rule.totalWater = 0.05;
      rule.continentFrac = 1;
      rule.rotationPeriod = -243;
      rule.land = tintLand(byId('ares').land, [210, 170, 60], 0.35);
    }
  }

  if (needs.has('flare') || needs.has('xuv') || needs.has('ucd')) {
    rule.solar = clamp(rule.solar * (needs.has('ucd') ? 0.5 : 0.7), 0.15, 1.4);
    rule.magnetosphere = Math.min(rule.magnetosphere, 0.25);
  }
  if (needs.has('nostar') || needs.has('pulsar') || needs.has('bd')) {
    rule.solar = 0.06;
    rule.sky = [0.008, 0.008, 0.015];
    rule.atmoStrength = Math.min(rule.atmoStrength, 0.35);
    rule.land = tintLand(rule.land, [40, 50, 80], 0.35);
  }
  if (needs.has('wd') || needs.has('sdb')) {
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
    rule.solar = 0.72;
    rule.airless = false;
    rule.atmoStrength = 0.5;
    rule.continentFrac = 0.95;
    rule.totalWater = 0.12;
  }
  if (item.c === 'temperate') {
    rule.solar = clamp(rule.solar || 0.8, 0.4, 1.2);
    rule.totalWater = Math.max(rule.totalWater, 0.65);
    rule.airless = false;
    // slight per-world tint so TRAPPIST worlds aren't identical
    const tint = [
      40 + (hue % 80),
      160 + ((hue * 3) % 60),
      60 + ((hue * 5) % 40),
    ];
    rule.land = tintLand(rule.land, tint, 0.18);
  }
  if (item.c === 'arch') {
    rule.eccentricity = Math.max(rule.eccentricity, 0.25);
    rule.solar = clamp(rule.solar, 0.3, 2.5);
  }
  if (item.c === 'dark' && needs.has('binary')) {
    rule.solar = 0.55;
    rule.sky = [0.04, 0.03, 0.05];
  }

  // Stable flavour from id
  rule.gravity = clamp(rule.gravity * (0.85 + ((item.id * 17) % 40) / 100), 0.08, 2.8);
  rule.nPlates = Math.max(3, Math.min(14, rule.nPlates + (item.id % 5) - 2));
  rule.relief = clamp(rule.relief * (0.9 + (item.id % 7) * 0.03), 0.008, 0.12);
  return rule;
}

export function rulesetFromCatalogue(item) {
  if (!item || item.k !== 'BODY') return null;
  const base = cloneRule(templateFor(item));
  const name = (item.b || item.t).replace(/\s+/g, ' ').trim();
  const short = name.length > 28 ? name.slice(0, 26) + '…' : name;
  base.id = `w${item.id}`;
  base.name = short;
  base.blurb = item.d.length > 110 ? item.d.slice(0, 108) + '…' : item.d;
  base.catalogueId = item.id;
  base.catalogueNeeds = item.p || [];
  base.signature = base.signature || 'catalogue';
  applyNeeds(base, item);
  return sanitize(base);
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
