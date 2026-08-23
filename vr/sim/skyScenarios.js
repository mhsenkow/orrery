/** Fantasy sky scenarios — multi-star and multi-moon presets.
 *  @provenance tagged-module
 */

import { SOL } from './star.js';
import {
  initSky, skyTick, makeMoonView, LUNAR_INCL, LUNAR_ECC, YEAR_D, ensureHostStar, anchorLivedOrbits,
} from './sky.js';
import { setClockFace } from './clockFace.js';
import { logEvent } from '../chronicle.js';
import { issueReceipt } from './god/receipt.js';
import { tidesTick } from './tides.js';

/** measured: Kepler-16 A/B luminosities and 41-day binary period */
const K16_L1 = 0.36;
const K16_L2 = 0.04;
const K16_PBIN_D = 41.08;
/* measured: Kepler-16 binary separation ~0.22 AU */
const K16_SEP_AU = 0.22;

export const FANTASY_SCENARIOS = [
  {
    id: 'twin-moons',
    title: 'Twin moons',
    blurb: 'One Sun, two moons at different distances — beat tides and messy phases.',
    lights: 1,
    sats: 2,
    measured: false,
  },
  {
    id: 'tatooine',
    title: 'Two suns (Kepler-16)',
    blurb: 'Circumbinary pair on a 41-day beat — two shadows, two sunset colours.',
    lights: 2,
    sats: 1,
    measured: true,
  },
  {
    id: 'triple-dawn',
    title: 'Triple dawn',
    blurb: 'Close binary plus a distant red dwarf — three lights, two moons, never quite still.',
    lights: 3,
    sats: 2,
    measured: false,
  },
];

function makeLight(id, name, teff, lum, mass = 1, radius = 1, extra = {}) {
  return {
    id, name, teff, mass, radius, lum,
    a: 1, e: 0, incl: 0, node: 0, argp: 0, M0: 0,
    heating: 'photon',
    ...extra,
  };
}

function makeSat(id, name, mass, a, extra = {}) {
  return {
    id, name, mass, radius: 1, dens: 3.34, albedo: 0.12,
    a, e: LUNAR_ECC, incl: LUNAR_INCL, node: 0, argp: 0, M0: 0,
    retro: false, formedYr: 4.5e9, _distNow: a,
    ...extra,
  };
}

function syncBodies(W) {
  W.sky.nLights = W.bodies.lights.length;
  W.sky.nSats = W.bodies.sats.length;
  W.moon = makeMoonView(W.bodies.sats[0] || null);
  skyTick(W);
  tidesTick(W);
}

export function applySkyScenario(Wref, id) {
  if (!Wref) return { ok: false, reason: 'no world' };
  const scen = FANTASY_SCENARIOS.find((s) => s.id === id);
  if (!scen) return { ok: false, reason: 'unknown scenario' };
  const rule = Wref.rule;
  ensureHostStar(Wref, rule);
  Wref.bodies = Wref.bodies || { lights: [], sats: [] };

  if (id === 'twin-moons') {
    const host = rule.star || SOL;
    Wref.bodies.lights = [host];
    delete rule.binaryBeat;
    Wref.bodies.sats = [
      makeSat('moon0', 'Luna', 1.0, 1.0, { radius: 1.0, M0: 0, seed: 3.7 }),
      makeSat('moon1', 'Companion', 0.35, 1.55, {
        radius: 0.72, M0: 1.8, node: 0.9, incl: LUNAR_INCL * 1.35, seed: 11, albedo: 0.14,
      }),
    ];
  } else if (id === 'tatooine') {
    const aAu = rule.worldRecord?.a?.v || 0.7;
    Wref.bodies.lights = [
      makeLight('starA', 'Kepler-16 A', 6000, K16_L1, 0.88, 0.85, {
        a: aAu, role: 'primary',
      }),
      makeLight('starB', 'Kepler-16 B', 3700, K16_L2, 0.2, 0.35, {
        a: aAu,
        role: 'companion',
        binarySepAu: K16_SEP_AU,
        periodDays: K16_PBIN_D,
        M0: 0.5,
        teff: 3700,
      }),
    ];
    rule.binaryBeat = { L1: K16_L1, L2: K16_L2, Pbin: K16_PBIN_D };
    rule.star = Wref.bodies.lights[0];
    const insol = (K16_L1 + K16_L2) / (aAu * aAu);
    rule.solar = Math.min(50, insol);
    Wref.solar = rule.solar;
    Wref.bodies.sats = [makeSat('moon0', 'Moon', 0.8, 1.1)];
  } else if (id === 'triple-dawn') {
    const aAu = 1;
    Wref.bodies.lights = [
      makeLight('starA', 'Primary', 5800, 1.0, 1.0, 1.0, { a: aAu, role: 'primary' }),
      makeLight('starB', 'Companion', 5200, 0.55, 0.75, 0.9, {
        a: aAu, role: 'companion', binarySepAu: 0.18, periodDays: 55, M0: 0,
      }),
      makeLight('starC', 'Distant dwarf', 3200, 0.08, 0.25, 0.35, {
        a: aAu, role: 'tertiary', binarySepAu: 0.45, periodDays: 180, M0: 2.1,
      }),
    ];
    rule.binaryBeat = { L1: 1.0, L2: 0.55, Pbin: 55 };
    rule.star = Wref.bodies.lights[0];
    rule.solar = Math.min(50, 1.45);
    Wref.solar = rule.solar;
    Wref.bodies.sats = [
      makeSat('moon0', 'Inner moon', 0.9, 0.85, { radius: 0.88, M0: 0, seed: 2 }),
      makeSat('moon1', 'Outer moon', 0.4, 1.7, { radius: 0.65, M0: 2.4, node: 0.4, seed: 9 }),
    ];
  }

  Wref.skyScenario = id;
  syncBodies(Wref);
  setClockFace(Wref, 'now');
  anchorLivedOrbits(Wref);
  skyTick(Wref);
  issueReceipt({
    tool: 'sky',
    cell: 0,
    intent: scen.title,
    expected: `${scen.lights} light${scen.lights > 1 ? 's' : ''} · ${scen.sats} moon${scen.sats > 1 ? 's' : ''} — ${scen.blurb}`,
  });
  logEvent(Wref.chron, Wref.year, 'tool', 0, scen.lights, `Sky scenario: ${scen.title}`);
  return { ok: true, scenario: scen };
}

/** Catalogue hook — binary-tagged worlds get a second light. */
export function applyCatalogueSky(Wref, rule = Wref?.rule) {
  if (!rule) return;
  ensureHostStar(Wref, rule);
  const needs = new Set(rule.catalogueNeeds || []);
  const name = `${rule.name || ''} ${rule.blurb || ''}`.toLowerCase();
  if (needs.has('binary') || /kepler-16|tatooine|circumbinary|toi-1338|kepler-47/i.test(name)) {
    if (Wref.skyScenario) return;
    applySkyScenario(Wref, 'tatooine');
    return;
  }
  if (!Wref.bodies?.lights?.length) {
    initSky(Wref, rule);
    skyTick(Wref);
  }
}

/** Patch a body field from the System desk. */
export function patchSkyBody(Wref, id, patch = {}) {
  const light = Wref.bodies?.lights?.find((l) => l.id === id);
  const sat = Wref.bodies?.sats?.find((s) => s.id === id);
  const body = light || sat;
  if (!body) return { ok: false };
  Object.assign(body, patch);
  if (sat && patch.a != null) sat._distNow = patch.a;
  if (light && patch.a != null) light.a = patch.a;
  syncBodies(Wref);
  return { ok: true, body };
}

export function scenarioForCatalogueItem(item) {
  if (!item?.p) return null;
  const p = new Set(item.p);
  if (p.has('binary') && /kepler-16/i.test(item.b || item.t || '')) return 'tatooine';
  if (p.has('binary')) return 'tatooine';
  if (p.has('nostar') || p.has('ffp')) return null;
  return null;
}
