/** Genesis toolkit — author a world before play.
 *  Backlog gen 59–71. */

import { clamp } from '../../math.js';
import { W } from '../../world.js';
import { RULESETS } from '../../rulesets.js';
import { freshSeed, makeRng } from '../rng.js';

export function blankGenesis() {
  return {
    name: 'Unnamed',
    seed: freshSeed(),
    rulesetId: 'terra',
    landscape: 'auto',
    deepTime: false,
    startAgeGa: null,
    star: { teff: 5772, mass: 1, radius: 1, ageGyr: 4.6 },
    ironFrac: 0.32,
    waterInventory: 1,
    volatileBudget: 1,
    nPlates: 12,
    continentFrac: 0.4,
    moons: [{ mass: 1, distance: 1 }],
    magnetosphere: 1,
    solar: 1.04,
    obliquityDeg: 23.4,
    eccentricity: 0.0167,
    habitabilityBias: true,
    difficulty: 'nominal',
    preset: null,
  };
}

export const PRESETS = [
  {
    id: 'no-moon',
    name: 'Earth without the Moon',
    apply: (g) => { g.moons = []; g.obliquityDeg = 45; },
  },
  {
    id: 'hi-o2',
    name: 'Earth with 35% O₂',
    apply: (g) => { g._gasOverride = { O2: 0.35, N2: 0.63 }; },
  },
  {
    id: 'no-plates',
    name: 'Earth with no plate tectonics',
    apply: (g) => { g.nPlates = 1; g.continentFrac = 0.3; },
  },
  {
    id: 'dim-star',
    name: 'Dimmer star (difficulty)',
    apply: (g) => { g.solar = 0.85; g.difficulty = 'hard'; g.star.teff = 5200; },
  },
  {
    id: 'thin-air',
    name: 'Thin atmosphere',
    apply: (g) => { g.volatileBudget = 0.35; g.magnetosphere = 0.4; g.difficulty = 'hard'; },
  },
  {
    id: 'cambrian',
    name: 'Start at the Cambrian',
    apply: (g) => { g.deepTime = true; g.startAgeGa = 0.541; },
  },
  {
    id: 'permian',
    name: 'Start at the Permian boundary',
    apply: (g) => { g.deepTime = true; g.startAgeGa = 0.252; },
  },
  {
    id: 'holocene',
    name: 'Ten thousand years before present',
    apply: (g) => { g.deepTime = true; g.startAgeGa = 0.00001; },
  },
];

export function applyPreset(genesis, presetId) {
  const p = PRESETS.find((x) => x.id === presetId);
  if (!p) return genesis;
  p.apply(genesis);
  genesis.preset = presetId;
  return genesis;
}

/** Randomise within constraints. Item 65. */
export function randomizeGenesis(opts = {}) {
  const g = blankGenesis();
  g.seed = freshSeed();
  const rng = makeRng(g.seed);
  g.name = opts.name || `World-${(g.seed % 10000).toString(16)}`;
  if (opts.habitable !== false) {
    g.solar = 0.85 + rng() * 0.35;
    g.waterInventory = 0.5 + rng() * 1.2;
    g.volatileBudget = 0.6 + rng() * 0.8;
    g.magnetosphere = 0.5 + rng() * 0.8;
    g.habitabilityBias = true;
  } else {
    g.solar = 0.3 + rng() * 2;
    g.waterInventory = rng() * 2;
    g.volatileBudget = rng() * 1.5;
    g.magnetosphere = rng();
    g.habitabilityBias = false;
  }
  g.nPlates = 4 + (rng() * 10) | 0;
  g.continentFrac = 0.18 + rng() * 0.38;
  g.landFrac = g.continentFrac;
  const lands = ['shattered', 'twoworlds', 'archipelago', 'pangaea', 'inland', 'belt', 'polar', 'highland', 'ridge'];
  g.landscape = lands[(rng() * lands.length) | 0];
  g.ironFrac = 0.15 + rng() * 0.4;
  g.star.teff = 3500 + rng() * 4000;
  return g;
}

import { parseWorldInput } from '../seedword.js';

/** Resolve genesis seed field — number, world id, URL, or memorable text like "caty". */
export function resolveGenesisSeed(raw, fallback = freshSeed()) {
  const parsed = parseWorldInput(raw);
  if (parsed?.encoded) return { seed: fallback, encoded: parsed.encoded };
  if (parsed?.seed != null) {
    return {
      seed: parsed.seed >>> 0,
      landscape: parsed.landscape,
      label: parsed.label || null,
    };
  }
  return { seed: fallback >>> 0 };
}

/** Read genesis panel values into a genesis object. */
export function genesisFromPanel(doc = document, base = null) {
  const g = base ? { ...base } : blankGenesis();
  g.name = doc.getElementById('genesisname')?.value?.trim() || '';
  const raw = doc.getElementById('genesisseed')?.value?.trim() || '';
  const resolved = resolveGenesisSeed(raw, g.seed);
  if (resolved.encoded) {
    const dec = decodeSeedString(resolved.encoded);
    if (dec?.g) Object.assign(g, dec.g);
  } else {
    g.seed = resolved.seed;
    if (resolved.label) g.seedLabel = resolved.label;
    if (resolved.landscape && resolved.landscape !== 'auto') g.landscape = resolved.landscape;
  }
  const preset = doc.getElementById('genesispreset')?.value;
  g.landscape = doc.getElementById('genesisland')?.value || g.landscape || 'auto';
  g.nPlates = +(doc.getElementById('genesisplates')?.value || g.nPlates);
  g.waterInventory = (+(doc.getElementById('genesiswater')?.value || 100)) / 100;
  g.landFrac = clamp((+(doc.getElementById('genesislandfrac')?.value || 29)) / 100, 0.05, 0.85);
  // Preset last so "no plates" actually gets one plate, not the leftover slider.
  if (preset) applyPreset(g, preset);
  return g;
}

/** Build a ruleset overlay from genesis. */
export function rulesetFromGenesis(genesis) {
  const base = RULESETS.find((r) => r.id === genesis.rulesetId) || RULESETS[0];
  const rule = {
    ...base,
    deepTime: !!genesis.deepTime,
    landscape: genesis.landscape || 'auto',
    startAgeGa: genesis.startAgeGa,
    nPlates: genesis.nPlates,
    continentFrac: genesis.continentFrac,
    targetLandFrac: genesis.landFrac ?? genesis.continentFrac ?? base.targetLandFrac,
    magnetosphere: genesis.magnetosphere,
    solar: genesis.solar,
    obliquity: (genesis.obliquityDeg || 23.4) * Math.PI / 180,
    eccentricity: genesis.eccentricity ?? 0.0167,
    totalWater: (base.totalWater || 0.9) * (genesis.waterInventory || 1),
    worldName: genesis.name,
    _genesisWater: genesis.waterInventory ?? 1,
  };
  if (genesis.difficulty === 'hard') {
    rule.solar = (rule.solar || 1) * 0.9;
    rule.magnetosphere = (rule.magnetosphere || 1) * 0.5;
  }
  if (genesis._gasOverride) {
    rule.gases = { ...rule.gases, ...genesis._gasOverride };
  }
  if (!genesis.moons?.length) {
    rule.obliquity = (45 * Math.PI) / 180;
  }
  return rule;
}

/** Compact seed string. Item 67 / 175. */
export function encodeSeedString(genesis, interventions = []) {
  const payload = {
    v: 1,
    g: genesis,
    i: interventions.slice(-50).map((e) => [e.tool, e.cell, e.t]),
  };
  try {
    return 'orrery:' + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch {
    return 'orrery:' + JSON.stringify(payload);
  }
}

export function decodeSeedString(str) {
  const raw = str.replace(/^orrery:/, '');
  try {
    const json = decodeURIComponent(escape(atob(raw)));
    return JSON.parse(json);
  } catch {
    try { return JSON.parse(raw); } catch { return null; }
  }
}

export function applyGenesisToWorld(W, genesis) {
  W.worldName = genesis.name || 'Unnamed';
  W.genesis = { ...genesis };
  W.moon = genesis.moons?.[0] || null;
  W.magnetosphere = genesis.magnetosphere;
  if (genesis.star) W.star = { ...genesis.star };
}
