/** Ecology & biogeography — NPP, trophic structure, Whittaker biomes.
 *  Backlog items 59–85. */

import { clamp } from '../math.js';
import { divEN } from './swe.js';
import { NC, DIR, AREA } from '../sphere.js';
import { kleiberDensity, TRAITS, nodeOf, removeLiving } from './evolve.js';
import { shannonDiversity } from './lifeGuide.js';
import { usesWhittakerCover } from './planetKind.js';
import { trophicTick } from './trophicField.js';

export const BIOMES = [
  'tundra', 'boreal', 'tempDeciduous', 'tempRainforest', 'grassland',
  'desert', 'savanna', 'tropSeasonal', 'tropRainforest', 'ice',
  'reef', 'upwelling', 'gyre', 'vent', 'deep',
];

/** Miami-model style NPP from temp + precip. Item 59. */
export function nppField(W) {
  if (!W.npp) W.npp = new Float32Array(NC);
  const { temp, moist, precip, h, seaLevel, gases } = W;
  for (let c = 0; c < NC; c++) {
    const tC = (temp[c] - 0.5) * 80 + 15; // rough °C
    const ppt = (precip?.[c] ?? moist[c]) * 2000; // mm/yr sketch
    const nppT = 3000 / (1 + Math.exp(1.315 - 0.119 * tC));
    const nppP = 3000 * (1 - Math.exp(-0.000664 * ppt));
    let npp = Math.min(nppT, nppP) / 3000; // normalize 0–1
    if (h[c] < seaLevel) {
      // Ocean: light + nutrients; upwelling boost. Item 68.
      const depth = seaLevel - h[c];
      const light = Math.max(0, 1 - depth * 6);
      const up = W.upwell?.[c] || W.upwelling?.[c] || 0;
      npp = light * (0.15 + W.nutrientN[c] * 0.4 + W.nutrientP[c] * 0.3 + up * 0.5);
      // Tidal nutrient pump — shallow + high range
      const tide = W.tideRange?.[c] || 0;
      if (tide > 0.005 && depth < 0.08) {
        npp *= 1 + tide * 8;
        if (W.nutrientP) W.nutrientP[c] = Math.min(1, W.nutrientP[c] + tide * 0.015);
        if (W.nutrientN) W.nutrientN[c] = Math.min(1, W.nutrientN[c] + tide * 0.01);
      }
      // Redfield limitation. Item 66–67.
      const N = Math.max(1e-6, W.nutrientN[c]);
      const P = Math.max(1e-6, W.nutrientP[c]);
      const lim = Math.min(N / (16 / 106), P); // relative to C:N:P
      npp *= clamp(lim * 3, 0.15, 1);
    } else {
      // Green wave — leaf-out sweeps poleward with season × latitude
      const lat = DIR[c * 3 + 1];
      const season = W.season || 0;
      const spring = Math.max(0, Math.sin(season) * lat); // NH spring when season~π/2
      const phenology = 0.72 + 0.28 * clamp(0.55 + spring * 0.9 + Math.sin(season) * 0.15, 0, 1);
      npp *= phenology;
    }
    // Photon gate for exotic stars. Item 123.
    if (W.photonUsable != null) npp *= W.photonUsable;
    W.npp[c] = clamp(npp, 0, 1);
  }
  return W.npp;
}

/** Wind-driven upwelling proxy from divergence of wind field. Item 68. */
export function computeUpwelling(W) {
  if (!W.upwelling) W.upwelling = new Float32Array(NC);
  if (W.upwell) {
    W.upwelling.set(W.upwell);
    return;
  }
  /* Fallback path, for worlds that never ran `oceanTick`. The divergence here
     was a plain sum of neighbour differences — `Δu + Δv` with no direction in
     it, which is not a divergence in any frame — so it reported upwelling
     wherever the wind field happened to be uneven. `divEN` is the real
     operator and is already used for the ocean's own version. */
  const { windU, windV, h, seaLevel } = W;
  for (let c = 0; c < NC; c++) {
    if (h[c] >= seaLevel) { W.upwelling[c] = 0; continue; }
    const div = divEN(windU, windV, c) * 0.07;
    const lat = DIR[c * 3 + 1];
    const eq = 1 - Math.abs(lat) * 2;
    W.upwelling[c] = clamp((-div) * 2 + Math.max(0, eq) * 0.15, 0, 1);
  }
}

/** Whittaker classification. Item 73. */
export function classifyBiome(t, m, ice, isSea, extras = {}) {
  return biomeMembership(t, m, ice, isSea, extras)[0].id;
}

const LAND_CENTRES = [
  { id: 'tundra', tC: -12, ppt: 280, ts: 14, ps: 420 },
  { id: 'boreal', tC: 0, ppt: 650, ts: 8, ps: 480 },
  { id: 'tempDeciduous', tC: 10, ppt: 950, ts: 8, ps: 450 },
  { id: 'tempRainforest', tC: 9, ppt: 1900, ts: 8, ps: 700 },
  { id: 'grassland', tC: 12, ppt: 420, ts: 10, ps: 280 },
  { id: 'desert', tC: 22, ppt: 90, ts: 14, ps: 180 },
  { id: 'savanna', tC: 24, ppt: 520, ts: 8, ps: 280 },
  { id: 'tropSeasonal', tC: 25, ppt: 1400, ts: 7, ps: 500 },
  { id: 'tropRainforest', tC: 26, ppt: 2500, ts: 7, ps: 900 },
];

/** `BIOMES` id → index. `BIOMES.indexOf` ran twice a cell every tick — a linear
 *  string search over fifteen entries, 50 000 times a tick at N=64. */
export const BIOME_INDEX = Object.freeze(Object.fromEntries(BIOMES.map((b, i) => [b, i])));

const LAND_IDX = LAND_CENTRES.map((row) => BIOME_INDEX[row.id]);
const I_VENT = BIOME_INDEX.vent, I_REEF = BIOME_INDEX.reef,
  I_UPWELLING = BIOME_INDEX.upwelling, I_DEEP = BIOME_INDEX.deep,
  I_GYRE = BIOME_INDEX.gyre, I_ICE = BIOME_INDEX.ice,
  I_TUNDRA = BIOME_INDEX.tundra, I_BOREAL = BIOME_INDEX.boreal,
  I_DESERT = BIOME_INDEX.desert, I_TROPSEASONAL = BIOME_INDEX.tropSeasonal,
  I_SAVANNA = BIOME_INDEX.savanna;

/** Per-biome cell tally, reused. `biomeCounts` is rebuilt from it once a tick
 *  instead of doing a string-keyed object write per cell. */
const _counts = new Int32Array(BIOMES.length);

/* Allocation-free core.
 *
 * `biomeMembership` used to build nine or ten `{id, s}` objects, an array to hold
 * them, then a second array of up to three `{id, w}` — per cell, every tick. At
 * N=64 that is ~300 000 short-lived objects a tick and it was the single largest
 * source of garbage in the simulation, plus a sort per cell. The maths is
 * unchanged: same Gaussians, same 1.8 exponent, same ice candidate, same 0.04
 * keep rule, same renormalisation over the kept entries. Candidates live in two
 * preallocated arrays and the top three are found by three scans instead of a
 * sort, which for n ≤ 10 is cheaper as well as garbage-free.
 *
 * Results are read from `_memI` / `_memW` / `_memN` immediately after the call.
 * Not reentrant, and it does not need to be: nothing here yields.
 */
const CAND_MAX = 10;
const _candI = new Int32Array(CAND_MAX);
const _candS = new Float64Array(CAND_MAX);
let _candN = 0;
/** Top three, most-weighted first. `_memN` is how many survived the keep rule. */
const _memI = new Int32Array(3);
const _memW = new Float64Array(3);
let _memN = 0;

function pushCand(i, s) {
  _candI[_candN] = i;
  _candS[_candN] = s;
  _candN++;
}

function classifyCore(t, m, ice, isSea, reef, up, depth, vent) {
  _candN = 0;
  if (isSea) {
    if (vent) pushCand(I_VENT, 4);
    if (reef > 0.05) pushCand(I_REEF, reef * 8);
    if (up > 0.12) pushCand(I_UPWELLING, up * 6);
    pushCand(I_DEEP, Math.max(0.15, depth * 4));
    pushCand(I_GYRE, 1.1);
  } else {
    const tC = (t - 0.5) * 80 + 15;
    const ppt = m * 2000;
    for (let i = 0; i < LAND_CENTRES.length; i++) {
      const row = LAND_CENTRES[i];
      const dt = (tC - row.tC) / row.ts;
      const dp = (ppt - row.ppt) / row.ps;
      const g = Math.exp(-0.5 * (dt * dt + dp * dp));
      pushCand(LAND_IDX[i], Math.pow(g > 1e-12 ? g : 1e-12, 1.8));
    }
  }
  if (ice > 0.25) {
    pushCand(I_ICE, Math.pow(clamp((ice - 0.25) / 0.45, 0, 1), 1.4) * 6);
  }

  let sum = 0;
  for (let i = 0; i < _candN; i++) sum += _candS[i];
  if (!(sum > 0)) {
    _memI[0] = _candN > 0 ? _candI[0] : I_GYRE;
    _memW[0] = 1;
    _memN = 1;
    return;
  }

  /* Top three by scan. Strict `>` keeps the first of an exact tie, which is what
     V8's stable sort did — the degenerate all-1e-12 land case must still pick
     tundra, the first `LAND_CENTRES` row. */
  _memN = 0;
  let wsum = 0;
  let prev = -1;
  for (let rank = 0; rank < 3 && rank < _candN; rank++) {
    let best = -1, bestS = -Infinity;
    for (let i = 0; i < _candN; i++) {
      if (i === prev || _candS[i] === -Infinity) continue;
      if (_candS[i] > bestS) { bestS = _candS[i]; best = i; }
    }
    if (best < 0) break;
    const w = bestS / sum;
    if (w < 0.04 && rank > 0) break;
    _memI[rank] = _candI[best];
    _memW[rank] = w;
    _memN = rank + 1;
    wsum += w;
    _candS[best] = -Infinity; // taken
  }
  for (let i = 0; i < _memN; i++) _memW[i] /= wsum || 1;
}

/** Soft membership in Whittaker space. Weights sum to 1.
 *  Object-returning wrapper for callers outside the tick — panels, tests,
 *  Inspect. `ecologyTick` uses `classifyCore` and reads the scratch directly. */
export function biomeMembership(t, m, ice, isSea, extras = {}) {
  classifyCore(t, m, ice, isSea,
    extras.reef || 0, extras.upwelling || 0, extras.depth || 0, !!extras.vent);
  const out = [];
  for (let i = 0; i < _memN; i++) out.push({ id: BIOMES[_memI[i]], w: _memW[i] });
  return out;
}

export function ecologyTick(W, chronLog) {
  if (W.rule.daisyworld) return;
  if (W.noSurface) {
    if (W.npp) W.npp.fill(0);
    W.biomeCounts = Object.create(null);
    W.ecotoneFrac = 0;
    return;
  }

  computeUpwelling(W);
  nppField(W);

  if (!W.biome) W.biome = new Uint8Array(NC);
  if (!W.biome2 || W.biome2.length !== NC) W.biome2 = new Uint8Array(NC);
  if (!W.biomeMix || W.biomeMix.length !== NC) W.biomeMix = new Float32Array(NC);
  let landLife = 0, landN = 0;
  const counts = Object.create(null);
  const whittaker = usesWhittakerCover(W._planetKind, W);

  _counts.fill(0);
  const upA = W.upwell || W.upwelling;
  const landPlants = !!W.transitions?.landPlants;
  for (let c = 0; c < NC; c++) {
    const isSea = W.h[c] < W.seaLevel;
    let topI, secondI, topW;
    if (whittaker) {
      classifyCore(
        W.temp[c],
        clamp((W.moist[c] || 0) * 0.82 + Math.min(1, (W.precip[c] || 0) * 6) * 0.18, 0, 1),
        W.ice[c], isSea,
        W.reef[c], upA?.[c] || 0,
        isSea ? W.seaLevel - W.h[c] : 0,
        W.bound[c] === 0 && isSea,
      );
      topI = _memI[0];
      topW = _memW[0];
      secondI = _memN > 1 ? _memI[1] : topI;
      if (!isSea && W.h[c] > W.seaLevel + 0.35 && W.temp[c] < 0.4) {
        // Alpine override: the lapse rate beats the Whittaker cell.
        secondI = topI;
        topI = W.moist[c] > 0.25 ? I_BOREAL : I_TUNDRA;
        topW = 0.7;
      }
    } else {
      topI = W.ice[c] > 0.55 ? I_ICE : (isSea ? I_DEEP : I_DESERT);
      secondI = topI;
      topW = 1;
    }
    W.biome[c] = topI;
    W.biome2[c] = secondI;
    W.biomeMix[c] = topW;
    _counts[topI]++;

    if (!isSea) {
      landN++;
      if (W.life[c] > 0.1) landLife++;
    }

    // Ecosystem engineers. Item 70.
    if (whittaker && topI === I_REEF && W.life[c] > 0.2) {
      W.h[c] = Math.min(W.seaLevel - 0.01, W.h[c] + 0.00002);
    }
    if (whittaker && !isSea && W.life[c] > 0.5 && landPlants) {
      W.soil[c] = clamp(W.soil[c] + 0.002, 0, 1);
    }
  }
  W.landLifeFrac = landN ? landLife / landN : 0;
  for (let i = 0; i < BIOMES.length; i++) {
    if (_counts[i]) counts[BIOMES[i]] = _counts[i];
  }
  W.biomeCounts = counts;
  let ecoN = 0;
  if (landN) {
    for (let c = 0; c < NC; c++) {
      if (W.h[c] < W.seaLevel) continue;
      if ((W.biomeMix[c] || 1) < 0.7) ecoN++;
    }
  }
  W.ecotoneFrac = landN ? ecoN / landN : 0;

  const nppMean = meanNpp(W);
  W.biosphereWatts = nppMean * 1.2e14; // order-of-magnitude Earth NPP ~ 100 TW. provenance: fitted scale

  if (!W.detritus || W.detritus.length !== NC) W.detritus = new Float32Array(NC);
  for (let c = 0; c < NC; c++) {
    const rain = (W.life[c] || 0) * 0.012 + (W.npp?.[c] || 0) * 0.008;
    W.detritus[c] = clamp((W.detritus[c] || 0) * 0.97 + rain, 0, 1);
  }
  trophicTick(W);

  // Food-web link sketch from lineages. Item 61.
  updateFoodWeb(W, chronLog);
  W.shannon = shannonDiversity(W);

  // Biome bistability forest/savanna. Item 85.
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) continue;
    const m = W.moist[c];
    if (m > 0.22 && m < 0.4) {
      if (W.life[c] > 0.45) {
        W.moist[c] = Math.min(0.55, m + 0.002); // trees make rain
        W.biome[c] = I_TROPSEASONAL;
      } else if (W.life[c] < 0.2) {
        W.biome[c] = I_SAVANNA;
      }
    }
  }

  // Herbivory arms race. Item 71.
  if (W.tree?.living?.length > 1) {
    for (const id of W.tree.living) {
      const n = nodeOf(W.tree, id);
      if (!n) continue;
      if (n.traits[TRAITS.trophic] < 0.2) {
        // plants escalate defence
        n.traits[TRAITS.defence] = clamp(n.traits[TRAITS.defence] + 0.0005, 0, 1);
      } else if (n.traits[TRAITS.trophic] > 0.35) {
        // herbivores escalate detox (inverse of defence cost)
        n.traits[TRAITS.defence] = clamp(n.traits[TRAITS.defence] + 0.0003, 0, 1);
      }
    }
  }

  // Habitability vs inhabitance. Item 118.
  W.habitability = scoreHabitability(W);
  W.inhabitance = clamp(W.meanLife * 1.2, 0, 1);

  // Free-energy disequilibrium biosignature. Item 119.
  const o2 = W.gases.O2 || 0;
  const ch4 = W.gases.CH4 || 0;
  W.disequilibrium = clamp(Math.sqrt(o2 * ch4) * 200, 0, 1);
}

function meanNpp(W) {
  let s = 0, aSum = 0;
  for (let c = 0; c < NC; c++) {
    s += (W.npp[c] || 0) * AREA[c];
    aSum += AREA[c];
  }
  return aSum > 0 ? s / aSum : 0;
}

export function updateFoodWeb(W, chronLog) {
  W.foodWeb = W.foodWeb || { links: [] };
  if (!W.tree?.living?.length) return;
  const nodes = W.tree.living.map((id) => nodeOf(W.tree, id)).filter(Boolean);
  const links = [];
  for (const n of nodes) {
    n.diet = [];
    n.preyAvail = 0;
    n.predation = 0;
    n.compete = 0;
  }
  for (const a of nodes) {
    const ta = a.traits[TRAITS.trophic];
    const ma = a.traits[TRAITS.bodyMass];
    const prey = [];
    for (const b of nodes) {
      if (a.id === b.id) continue;
      const tb = b.traits[TRAITS.trophic];
      const mb = b.traits[TRAITS.bodyMass];
      const chirA = a.genome?.biochem?.chirality;
      const chirB = b.genome?.biochem?.chirality;
      if (chirA && chirB && chirA !== chirB && chirA !== 'racemic' && chirB !== 'racemic') continue;
      if (Math.abs(ta - tb) < 0.08) {
        a.compete += 0.04 * Math.min(1, (b.pop || 1) / Math.max(1, a.pop || 1));
      }
      if (ta > tb + 0.12 && ma > mb - 0.15 && ma < mb + 0.55) {
        const wgt = 0.12 * (1 - Math.abs(ma - mb - 0.2));
        if (wgt > 0.02) {
          prey.push({ id: b.id, w: wgt });
          links.push({ pred: a.id, prey: b.id, w: wgt });
        }
      }
    }
    prey.sort((x, y) => y.w - x.w);
    a.diet = prey.slice(0, 3).map((p) => p.id);
    a.preyAvail = prey.slice(0, 3).reduce((s, p) => s + p.w, 0);
  }
  for (const L of links) {
    const prey = nodeOf(W.tree, L.prey);
    if (prey) prey.predation = (prey.predation || 0) + L.w;
  }
  links.sort((a, b) => b.w - a.w);
  const dropped = Math.max(0, links.length - 200);
  W.foodWeb.links = links.slice(0, 200);
  W.foodWeb.dropped = dropped;
  // Lotka–Volterra on census: predators eat, prey shrink. provenance: fitted
  const dt = Math.min(1, (W.dtYr || 200) / 1e6);
  for (const n of nodes) {
    const K = Math.max(10, (n.pop || 1) * kleiberDensity(n.traits[TRAITS.bodyMass]) * 50);
    const N = n.censusPop || n.pop || 1;
    const grow = 0.08 * dt * N * (1 - N / K);
    const eaten = (n.predation || 0) * 0.15 * dt * N;
    const fed = (n.preyAvail || 0) * 0.08 * dt * N;
    n.censusPop = Math.max(0, N + grow - eaten + fed);
  }
  W.redQueen = nodes.some((n) => (n.predation || 0) > 0.05 || (n.preyAvail || 0) > 0.05);

  // Trophic collapse: a lineage eaten below minimum viable census is gone.
  // Cheap — already walked living; skip LUCA so the tree cannot be emptied.
  const lucaId = W.lucaId;
  for (const n of nodes) {
    if (n.id === lucaId || n.death != null) continue;
    const mvp = 2;
    const collapsed = n.censusPop < mvp && (n.pop || 0) <= 2 && (n.predation || 0) > 0.08;
    if (collapsed) {
      n._webDebt = (n._webDebt || 0) + dt;
      if (n._webDebt > 1) {
        n.death = W.ageYr;
        n.extReason = 'trophic collapse';
        removeLiving(W.tree, n.id);
        W.tree.extinctions.push({ id: n.id, name: n.name, t: W.ageYr, reason: 'foodweb' });
        if (chronLog) chronLog(W.year, 'extinction', n.cells?.[0] ?? 0, 1, `Eaten out: ${n.name}`);
      }
    } else {
      n._webDebt = 0;
    }
  }
}

function scoreHabitability(W) {
  const t = W.meanTemp;
  const liquid = t > 0.25 && t < 0.9;
  const pressure = !W.rule.airless;
  const solvent = (W.landFrac < 0.98);
  return clamp((liquid ? 0.4 : 0) + (pressure ? 0.3 : 0) + (solvent ? 0.3 : 0), 0, 1);
}

/** Carrying capacity from NPP — replaces crude product in bio.js. */
export function carryingCapacityNPP(W, c) {
  const npp = W.npp?.[c] ?? 0.3;
  const icePen = 1 - clamp(W.ice[c] - 0.25, 0, 1) * 0.7;
  return clamp(0.2 + npp * 0.75, 0.05, 1) * icePen;
}
