/** Ecology & biogeography — NPP, trophic structure, Whittaker biomes.
 *  Backlog items 59–85. */

import { clamp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { kleiberDensity, TRAITS } from './evolve.js';

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
      const up = W.upwelling?.[c] || 0;
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
  const { windU, windV, h, seaLevel } = W;
  for (let c = 0; c < NC; c++) {
    if (h[c] >= seaLevel) { W.upwelling[c] = 0; continue; }
    let div = 0;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      div += (windU[n] - windU[c]) + (windV[n] - windV[c]);
    }
    // Eastern-boundary / equatorial divergence → upwelling
    const lat = DIR[c * 3 + 1];
    const eq = 1 - Math.abs(lat) * 2;
    W.upwelling[c] = clamp((-div) * 2 + Math.max(0, eq) * 0.15, 0, 1);
  }
}

/** Whittaker classification. Item 73. */
export function classifyBiome(t, m, ice, isSea, extras = {}) {
  if (ice > 0.55) return 'ice';
  if (isSea) {
    if (extras.vent) return 'vent';
    if (extras.reef > 0.2) return 'reef';
    if (extras.upwelling > 0.35) return 'upwelling';
    if (extras.depth > 0.25) return 'deep';
    return 'gyre';
  }
  const tC = (t - 0.5) * 80 + 15;
  const ppt = m * 2000;
  if (tC < -5) return 'tundra';
  if (tC < 5 && ppt > 400) return 'boreal';
  if (tC < 5) return 'tundra';
  if (ppt < 250) return 'desert';
  if (ppt < 600 && tC > 18) return 'savanna';
  if (ppt < 600) return 'grassland';
  if (tC > 20 && ppt > 2000) return 'tropRainforest';
  if (tC > 20 && ppt > 1000) return 'tropSeasonal';
  if (ppt > 1500) return 'tempRainforest';
  return 'tempDeciduous';
}

export function ecologyTick(W, chronLog) {
  if (W.rule.daisyworld) return;

  computeUpwelling(W);
  nppField(W);

  if (!W.biome) W.biome = new Uint8Array(NC);
  let landLife = 0, landN = 0;
  const counts = Object.create(null);

  for (let c = 0; c < NC; c++) {
    const isSea = W.h[c] < W.seaLevel;
    const b = classifyBiome(W.temp[c], W.moist[c], W.ice[c], isSea, {
      reef: W.reef[c],
      upwelling: W.upwelling[c],
      depth: isSea ? W.seaLevel - W.h[c] : 0,
      vent: W.bound[c] === 0 && isSea,
    });
    W.biome[c] = BIOMES.indexOf(b);
    counts[b] = (counts[b] || 0) + 1;

    // Altitudinal zonation: lapse cools high land. Item 82 — already in atmo;
    // reclassify peaks toward tundra/boreal when elev high & moist.
    if (!isSea && W.h[c] > W.seaLevel + 0.35 && W.temp[c] < 0.4) {
      W.biome[c] = BIOMES.indexOf(W.moist[c] > 0.25 ? 'boreal' : 'tundra');
    }

    if (!isSea) {
      landN++;
      if (W.life[c] > 0.1) landLife++;
    }

    // Ecosystem engineers. Item 70.
    if (b === 'reef' && W.life[c] > 0.2) {
      W.h[c] = Math.min(W.seaLevel - 0.01, W.h[c] + 0.00002);
    }
    if (!isSea && W.life[c] > 0.5 && W.transitions?.landPlants) {
      W.soil[c] = clamp(W.soil[c] + 0.002, 0, 1);
    }
  }
  W.landLifeFrac = landN ? landLife / landN : 0;
  W.biomeCounts = counts;

  // Trophic pyramid from transfer efficiency ~10%. Item 60.
  const nppMean = meanNpp(W);
  W.trophic = W.trophic || { prod: 0, herb: 0, carn: 0, decomp: 0 };
  W.trophic.prod = nppMean;
  W.trophic.herb = nppMean * 0.1;
  W.trophic.carn = nppMean * 0.01;
  W.trophic.decomp = nppMean * 0.3;
  W.herbivore = clamp(W.trophic.herb * 2, 0.01, 1);
  W.carnivore = clamp(W.trophic.carn * 4, 0.01, 0.8);

  // Food-web link sketch from lineages. Item 61.
  updateFoodWeb(W);

  // Biome bistability forest/savanna. Item 85.
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) continue;
    const m = W.moist[c];
    if (m > 0.22 && m < 0.4) {
      if (W.life[c] > 0.45) {
        W.moist[c] = Math.min(0.55, m + 0.002); // trees make rain
        W.biome[c] = BIOMES.indexOf('tropSeasonal');
      } else if (W.life[c] < 0.2) {
        W.biome[c] = BIOMES.indexOf('savanna');
      }
    }
  }

  // Herbivory arms race. Item 71.
  if (W.tree?.living?.length > 1) {
    for (const id of W.tree.living) {
      const n = W.tree.nodes.find((x) => x.id === id);
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

function updateFoodWeb(W) {
  W.foodWeb = W.foodWeb || { links: [] };
  if (!W.tree?.living?.length) return;
  const nodes = W.tree.living.map((id) => W.tree.nodes.find((x) => x.id === id)).filter(Boolean);
  const links = [];
  for (const a of nodes) {
    for (const b of nodes) {
      if (a.id === b.id) continue;
      const ta = a.traits[TRAITS.trophic];
      const tb = b.traits[TRAITS.trophic];
      const ma = a.traits[TRAITS.bodyMass];
      const mb = b.traits[TRAITS.bodyMass];
      // Predator larger than prey, higher trophic
      if (ta > tb + 0.15 && ma > mb - 0.1) {
        const wgt = 0.1 * (1 - Math.abs(ma - mb - 0.2));
        if (wgt > 0.02) links.push({ pred: a.id, prey: b.id, w: wgt });
      }
    }
  }
  W.foodWeb.links = links.slice(0, 200);
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
