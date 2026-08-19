/** Redox-tower biosphere — metabolic guilds before morphology.
 *  Backlog items 13–28. */

import { clamp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { maybeCaptureMoment } from './time.js';
import { isModernEarth } from './ruleMode.js';
import { rngOf } from './rng.js';
import {
  initOrigin, originTick, bioRateScale, tempKOf, solventOf, diagnoseOriginFailure,
} from './origin.js';

/**
 * Guilds ordered by approximate reduction potential / energy yield.
 * Viable when donor + acceptor present and ΔG clears maintenance.
 */
export const GUILDS = [
  { id: 'fermenter', donor: 'orgC', acceptor: 'none', yield: 0.05, pigment: null, color: [80, 70, 50] },
  { id: 'methanogen', donor: 'H2', acceptor: 'CO2', yield: 0.08, pigment: null, color: [60, 50, 40], makes: 'CH4' },
  { id: 'sulfateReducer', donor: 'orgC', acceptor: 'SO4', yield: 0.12, pigment: null, color: [70, 60, 45] },
  { id: 'ironReducer', donor: 'orgC', acceptor: 'Fe3', yield: 0.15, pigment: null, color: [90, 55, 40] },
  { id: 'anammox', donor: 'NH4', acceptor: 'NO2', yield: 0.18, pigment: null, color: [55, 65, 70] },
  { id: 'denitrifier', donor: 'orgC', acceptor: 'NO3', yield: 0.25, pigment: null, color: [50, 70, 60] },
  { id: 'methanotroph', donor: 'CH4', acceptor: 'O2', yield: 0.3, pigment: null, color: [65, 75, 55] },
  { id: 'ironOxidizer', donor: 'Fe2', acceptor: 'O2', yield: 0.2, pigment: null, color: [140, 80, 40] },
  { id: 'photoferrotroph', donor: 'Fe2', acceptor: 'light', yield: 0.22, pigment: 'bchl', color: [100, 60, 90] },
  { id: 'purpleSulfur', donor: 'H2S', acceptor: 'light', yield: 0.28, pigment: 'bchl', color: [120, 40, 90] },
  { id: 'greenSulfur', donor: 'H2S', acceptor: 'light', yield: 0.26, pigment: 'bchl', color: [40, 90, 50] },
  { id: 'cyanobacteria', donor: 'H2O', acceptor: 'light', yield: 0.55, pigment: 'chla', color: [30, 120, 70], oxygenic: true },
  { id: 'aerobe', donor: 'orgC', acceptor: 'O2', yield: 1.0, pigment: null, color: [50, 100, 60] },
  // 16 ATP/N2 and O2-poisoned — yield is the leftover after that bill. provenance: measured-shape
  { id: 'nFixer', donor: 'N2', acceptor: 'ATP', yield: 0.04, pigment: null, color: [45, 85, 55], nFix: true },
  { id: 'nitrifier', donor: 'NH4', acceptor: 'O2', yield: 0.15, pigment: null, color: [70, 90, 50] },
  { id: 'decomposer', donor: 'lignin', acceptor: 'O2', yield: 0.2, pigment: null, color: [90, 70, 40] },
  { id: 'chemolithotroph', donor: 'H2', acceptor: 'CO2', yield: 0.1, pigment: null, color: [55, 55, 50], vent: true },
];

const DONORS = ['H2', 'H2S', 'Fe2', 'CH4', 'NH4', 'orgC', 'N2', 'H2O', 'lignin'];
const ACCEPTORS = ['O2', 'NO3', 'NO2', 'SO4', 'Fe3', 'CO2', 'light', 'none', 'ATP'];
const SPECIES_KEYS = [...DONORS, ...ACCEPTORS.filter((a) => !DONORS.includes(a))];

export function createSpeciesFields() {
  const fields = {};
  for (const d of DONORS) fields[d] = new Float32Array(NC);
  for (const a of ACCEPTORS) {
    if (!fields[a]) fields[a] = new Float32Array(NC);
  }
  return fields;
}

export function createGuildDensity() {
  const g = {};
  for (const guild of GUILDS) g[guild.id] = new Float32Array(NC);
  return g;
}

/** Per-species relaxation toward abiotic equilibrium (provenance: fitted). */
const RELAX = {
  H2S: 0.05, Fe2: 0.02, orgC: 0.10, SO4: 0.03, NO3: 0.15, NH4: 0.15, CH4: 0.20,
  H2: 0.08, Fe3: 0.06, NO2: 0.12, lignin: 0.04,
  light: 1.0, O2: 1.0, CO2: 1.0, H2O: 1.0, N2: 1.0, none: 1.0, ATP: 0.5,
};

/** Photolithotroph maintenance scale — they do not respire organics (provenance: fitted). */
const MAINT_SCALE = {
  purpleSulfur: 0.5,
  greenSulfur: 0.5,
  photoferrotroph: 0.55,
  cyanobacteria: 0.6,
};

/** Global means of the slowest-relaxing species fields (chemistry memory readout). */
export function speciesMemoryReadout(W) {
  if (!W.species) return [];
  const skip = new Set(['light', 'O2', 'CO2', 'H2O', 'N2', 'none', 'ATP']);
  const keys = Object.keys(W.species).filter((k) => !skip.has(k));
  keys.sort((a, b) => (RELAX[a] ?? 0.1) - (RELAX[b] ?? 0.1));
  return keys.slice(0, 3).map((k) => {
    const arr = W.species[k];
    let s = 0;
    for (let c = 0; c < NC; c++) s += arr[c];
    return { id: k, mean: s / NC, relax: RELAX[k] ?? 0.1 };
  });
}

export function initRedox(W) {
  W.species = createSpeciesFields();
  W.guildDens = createGuildDensity();
  W.guilds = {}; // global mean per guild
  for (const g of GUILDS) W.guilds[g.id] = 0;
  W.fe2Ocean = 0.45; // Archean dissolved iron
  W.stromatolite = new Float32Array(NC);
  W.bifRock = new Float32Array(NC); // banded iron formation deposit
  W.matCover = new Float32Array(NC);
  W.detritus = new Float32Array(NC);
  W.modulePool = new Set();
  W.transitionAge = {};
  initOrigin(W);
  W.transitions = {
    abiogenesis: false,
    rnaWorld: false,
    luca: false,
    bacteriaArchaea: false,
    oxygenicPhotosynthesis: false,
    aerobicRespiration: false,
    eukaryote: false,
    plastid: false,
    sex: false,
    multicellular: false,
    biomineral: false,
    landPlants: false,
    eusocial: false,
    endothermy: false,
    language: false,
  };
}

/** Match guild densities to an already-painted modern biosphere. */
export function seedModernGuilds(W) {
  if (!W.guildDens) return;
  for (let c = 0; c < NC; c++) {
    const L = W.life[c];
    if (L < 0.05) continue;
    const isSea = W.h[c] < W.seaLevel;
    if (isSea) {
      W.guildDens.cyanobacteria[c] = L * 0.6;
      W.guildDens.aerobe[c] = L * 0.4;
      if (W.reef[c] > 0.2) W.matCover[c] = W.reef[c] * 0.5;
    } else {
      W.guildDens.cyanobacteria[c] = L * 0.35;
      W.guildDens.aerobe[c] = L * 0.5;
      W.guildDens.decomposer[c] = L * 0.25;
      W.guildDens.nFixer[c] = L * 0.15;
    }
  }
  W.dominantPigment = 'chla';
}

/** One-time species field seed (called from initRedox). */
export function initSpeciesFields(W) {
  relaxSpeciesFields(W, 1.5, true);
}

function speciesEquilibrium(W, c) {
  const { h, seaLevel, bound, gases, moist, temp, life } = W;
  const isSea = h[c] < seaLevel;
  const shallow = isSea && (seaLevel - h[c]) < 0.12;
  const lit = isSea
    ? Math.max(0, 1 - (seaLevel - h[c]) * 8) * Math.max(0.1, temp[c])
    : Math.max(0.15, temp[c]);
  const eq = {};
  // Serpentinisation: olivine + water → H2. provenance: measured-shape
  const ultra = (W.rock?.[c] === 0) ? 1 : 0.25;
  eq.H2 = isSea ? 0.02 * (0.6 + ultra) : 0.001;
  // provenance: fitted — anoxygenic photosynthesis viable on lit shelves (yield 0.28, maint 0.04)
  eq.H2S = (shallow && lit > 0.5) ? 0.22 : (isSea ? 0.03 : 0.002);
  eq.Fe2 = isSea ? (W.fe2Ocean || 0.3) : 0.01;
  eq.Fe3 = isSea ? 0.05 : 0.1;
  eq.CH4 = isSea ? clamp((gases.CH4 || 0) * 10, 0, 1) : 0;
  eq.NH4 = 0.04;
  eq.NO3 = gases.O2 > 0.01 ? 0.08 : 0.001;
  eq.NO2 = gases.O2 > 0.01 ? 0.02 : 0.001;
  eq.SO4 = gases.O2 > 0.005 ? 0.15 : 0.01;
  // saturation sketch: atmospheric CO₂ mapped to dissolved 0–1
  eq.CO2 = clamp(gases.CO2 * 20, 0, 1);
  eq.O2 = isSea ? gases.O2 * 0.7 : gases.O2;
  eq.orgC = life[c] * 0.3;
  eq.N2 = gases.N2;
  eq.H2O = isSea || moist[c] > 0.2 ? 1 : moist[c];
  eq.lignin = W.transitions?.landPlants ? life[c] * 0.2 : 0;
  eq.light = lit;
  eq.none = 1;
  eq.ATP = 0.5;
  return eq;
}

function seedVentChemistry(W) {
  relaxSpeciesFields(W, 1.5, true);
}

/** Relax toward equilibrium + vent flux + lateral diffusion — chemistry has memory. */
export function relaxSpeciesFields(W, dt, init = false) {
  const { species, h, seaLevel, bound } = W;
  const diffuseRate = init ? 0 : 0.04 * dt;
  const scratch = init ? null : Object.fromEntries(SPECIES_KEYS.map((k) => [k, new Float32Array(NC)]));
  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const eq = speciesEquilibrium(W, c);
    for (const key of SPECIES_KEYS) {
      const arr = species[key];
      if (!arr) continue;
      const r = RELAX[key] ?? 0.1;
      let v = init ? eq[key] ?? 0 : arr[c] + ((eq[key] ?? 0) - arr[c]) * r * dt;
      if (!init && diffuseRate > 0 && key !== 'orgC' && key !== 'lignin') {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += arr[NBR[c * 4 + k]];
        v += (sum / 4 - v) * diffuseRate * (r > 0.5 ? 0.8 : 0.15);
      }
      if (bound[c] === 0 && isSea) {
        if (key === 'H2') v = Math.min(1, v + 0.08 * dt);
        if (key === 'H2S') v = Math.min(1, v + 0.05 * dt);
        if (key === 'Fe2') v = Math.min(1, v + 0.04 * dt);
      }
      v = clamp(v, 0, 1);
      if (init) arr[c] = v;
      else scratch[key][c] = v;
    }
  }
  if (!init) {
    for (const key of SPECIES_KEYS) {
      const arr = species[key];
      if (arr) arr.set(scratch[key]);
    }
  }
}

function markTransition(W, key, chronLog, label) {
  W.transitions[key] = true;
  W.transitionAge[key] = W.ageYr;
  W.modulePool?.add(key);
  if (chronLog && label) chronLog(W.year, 'evolution', 0, 1, label);
}

function guildViable(g, sp, c, W) {
  if (g.oxygenic && !W.transitions.oxygenicPhotosynthesis) return 0;
  if (g.id === 'aerobe' && !W.transitions.aerobicRespiration) return 0;
  if (g.id === 'decomposer' && !W.transitions.landPlants) return 0;

  const donor = sp[g.donor]?.[c] ?? 0;
  const acc = g.acceptor === 'none' ? 1 : (sp[g.acceptor]?.[c] ?? 0);
  if (donor < 0.01 || acc < 0.01) return 0;

  // Nitrogenase is poisoned by oxygen and costs 16 ATP/N2. provenance: measured
  if (g.nFix && (sp.O2[c] || 0) > 0.05) return donor * acc * 0.02;

  const T = W.temp[c];
  const TK = tempKOf(W, c);
  const rate = bioRateScale(TK, W.solvent || solventOf(W.rule));
  const maintScale = MAINT_SCALE[g.id] ?? 1;
  const maint = (0.04 + Math.max(0, 0.5 - T) * 0.08) * maintScale;
  // ΔG sketch: yield × Q, Q from concentrations already on the cell. provenance: fitted
  const Q = Math.max(1e-4, donor * acc);
  let energy = g.yield * Q * (0.6 + T * 0.5) * rate;
  if (g.nFix) energy *= 0.45; // ATP bill
  let ventPenalty = 1;
  if (g.vent) {
    const hot = W.bound[c] === 0
      || (W.hydrotherm?.[c] || 0) > 0.2
      || (W.shellVent?.[c] || 0) > 0.2;
    ventPenalty = hot ? 1 : 0.15;
  }
  return Math.max(0, energy * ventPenalty - maint);
}

export function redoxTick(W, chronLog) {
  if (W.rule.daisyworld || W.rule.airless) return;
  if (!W.species) initRedox(W);

  const dtRelax = Math.min(1.5, (W.dtYr || 200) / 5e5);
  const modern = isModernEarth(W.rule);
  // init=false always — modern uses faster relaxation, not hard reset each tick
  relaxSpeciesFields(W, dtRelax * (modern ? 2.5 : 1), false);
  const { species, guildDens, life, h, seaLevel, gases, rng } = W;
  const dt = dtRelax;
  const roll = rng || (() => 0.5);

  originTick(W, chronLog);
  maybeInvent(W, chronLog, roll);

  const means = {};
  for (const g of GUILDS) means[g.id] = 0;

  let photosynthProxy = 0;
  let ch4Prod = 0;
  let totalLife = 0;
  let produced = 0, died = 0;

  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    let bestFit = 0, bestId = 'fermenter';
    let cellBio = 0;

    for (const g of GUILDS) {
      let fit = guildViable(g, species, c, W);
      if (fit <= 0) {
        guildDens[g.id][c] *= Math.max(0, 1 - 0.08 * dt);
        continue;
      }
      // Syntrophy: AOM needs methanotroph + sulfateReducer nearby. Item 27.
      if (g.id === 'methanotroph' && gases.O2 < 0.01) {
        const syn = guildDens.sulfateReducer[c];
        fit *= 0.3 + syn * 2;
      }

      // Logistic colonisation: a viable guild must be able to grow from a seed.
      // The old `+ fit*0.15*dt − 0.02*dt` was net-negative for every anoxygenic
      // phototroph (fit ≈ 0.02), which is why meanLife fell for 3 Gyr.
      // provenance: fitted
      const neigh = Math.max(
        guildDens[g.id][NBR[c * 4]], guildDens[g.id][NBR[c * 4 + 1]],
        guildDens[g.id][NBR[c * 4 + 2]], guildDens[g.id][NBR[c * 4 + 3]]
      );
      let d = guildDens[g.id][c];
      const colonise = (0.07 + d * 0.55 + neigh * 0.12) * fit * dt;
      const death = (0.006 + (fit <= 0 ? 0.1 : 0)) * d * dt;
      d = clamp(d + colonise - death, 0, 1);
      produced += colonise * AREA[c];
      died += death * AREA[c];
      guildDens[g.id][c] = d;
      means[g.id] += d * AREA[c];
      cellBio += d * g.yield;

      if (fit > bestFit) { bestFit = fit; bestId = g.id; }

      // Consume donors / produce products
      if (d > 0.05) {
        if (species[g.donor]) species[g.donor][c] = Math.max(0, species[g.donor][c] - d * 0.02 * dt);
        if (g.makes === 'CH4') ch4Prod += d * AREA[c] * 0.00001 * dt;
        if (g.oxygenic) photosynthProxy += d * AREA[c];
        if (g.id === 'purpleSulfur' || g.id === 'greenSulfur') {
          species.H2S[c] = Math.max(0, species.H2S[c] - d * 0.03 * dt);
        }
        if (g.id === 'ironOxidizer' || g.id === 'photoferrotroph') {
          // BIF deposition. Item 24.
          const drop = d * species.Fe2[c] * 0.04 * dt;
          W.bifRock[c] = clamp(W.bifRock[c] + drop, 0, 1);
          species.Fe2[c] = Math.max(0, species.Fe2[c] - drop);
          W.fe2Ocean = Math.max(0, (W.fe2Ocean || 0) - drop * 0.00001);
          if (W.rock && drop > 0.01) W.rock[c] = 4; // BIF rock type
        }
        if (g.id === 'nFixer') {
          W.nutrientN[c] = clamp(W.nutrientN[c] + d * 0.02 * dt, 0, 1);
        }
        if (g.id === 'nitrifier') {
          species.NO3[c] = clamp(species.NO3[c] + d * 0.02 * dt, 0, 1);
          species.NH4[c] = Math.max(0, species.NH4[c] - d * 0.02 * dt);
        }
        if (g.id === 'denitrifier' || g.id === 'anammox') {
          species.NO3[c] = Math.max(0, species.NO3[c] - d * 0.02 * dt);
        }
        if (g.id === 'sulfateReducer' && gases.O2 < 0.05) {
          // Canfield ocean euxinia. Item 23.
          species.H2S[c] = clamp(species.H2S[c] + d * 0.03 * dt, 0, 1);
        }
      }
    }

    // Mats / stromatolites in shallow lit seas. Item 26.
    const shallow = isSea && (seaLevel - h[c]) < 0.1;
    const matGuild = guildDens.cyanobacteria[c] + guildDens.purpleSulfur[c] + guildDens.greenSulfur[c];
    if (shallow && matGuild > 0.15) {
      W.matCover[c] = clamp(W.matCover[c] + matGuild * 0.05 * dt, 0, 1);
      W.stromatolite[c] = clamp(W.stromatolite[c] + matGuild * 0.02 * dt, 0, 1);
    } else {
      W.matCover[c] *= 0.995;
    }

  // Map guild biomass onto legacy life[] for rendering / agents
    // Arrhenius metabolic rate ~ e^{-E/kT}. Item 64.
    const arrhenius = Math.exp(0.65 * (W.temp[c] - 0.5));
    cellBio *= clamp(0.5 + arrhenius * 0.5, 0.3, 2);

    const target = clamp(cellBio * 0.55 + W.matCover[c] * 0.35, 0, 1);
    if (modern) {
      // Holocene Earth: bio.js + seedEarth own life[]; redox only tracks guilds + chemistry
      species.orgC[c] = clamp(life[c] * 0.4 + species.orgC[c] * 0.92, 0, 1);
      totalLife += life[c] * AREA[c];
    } else if (W.transitions.abiogenesis) {
      const before = life[c];
      life[c] = lerpLife(life[c], target, clamp(0.28 * dt, 0, 0.6));
      if (life[c] > before) produced += (life[c] - before) * AREA[c];
      else died += (before - life[c]) * AREA[c];
      totalLife += life[c] * AREA[c];
    } else {
      life[c] *= Math.max(0, 1 - 0.01 * dt);
      totalLife += life[c] * AREA[c];
    }
    if (W.detritus) {
      W.detritus[c] = clamp((W.detritus[c] || 0) * 0.92 + life[c] * 0.04, 0, 1);
    }
  }

  for (const g of GUILDS) W.guilds[g.id] = means[g.id] / NC;

  // Methanogen haze. Item 17.
  if (ch4Prod > 0) {
    gases.CH4 = clamp((gases.CH4 || 0) + ch4Prod, 0, 0.005);
    const co = Math.max(1e-6, gases.CO2);
    W.hazeAntiGreenhouse = (gases.CH4 / co > 0.1 && gases.O2 < 0.01)
      ? clamp(gases.CH4 * 40, 0, 0.15) : 0;
  } else {
    W.hazeAntiGreenhouse = (W.hazeAntiGreenhouse || 0) * 0.99;
  }

  // Organic carbon field (modern handled inline above)
  if (!isModernEarth(W.rule)) {
    for (let c = 0; c < NC; c++) {
      species.orgC[c] = clamp(life[c] * 0.4 + species.orgC[c] * 0.9, 0, 1);
    }
  }

  if (photosynthProxy > 1) {
    maybeCaptureMoment(W, 'firstPhotosynthesis', 'First photosynthesis');
  }
  if (gases.O2 > 0.001) {
    maybeCaptureMoment(W, 'firstOxygen', 'First free oxygen');
  }

  W.meanLife = totalLife / NC;
  W.dominantPigment = dominantPigment(W);
  W.originBudget = {
    produced,
    respired: died,
    buried: (W.carbon?.burialFlux || 0),
    clamped: 0,
    net: produced - died,
  };
  W.sterileWhy = W.transitions?.abiogenesis ? null : diagnoseOriginFailure(W);

  // Oxygenic guilds leak O₂ once invented — burial still owns the long-term rise.
  const cyano = W.guilds.cyanobacteria || 0;
  if (W.transitions.oxygenicPhotosynthesis && cyano > 0.01 && !modern) {
    const leak = cyano * 0.0008 * dt;
    gases.O2 = clamp(gases.O2 + leak, 0, 0.4);
  }
}

function lerpLife(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function dominantPigment(W) {
  const g = W.guilds;
  if ((g.cyanobacteria || 0) > 0.05) return 'chla';
  if ((g.purpleSulfur || 0) + (g.greenSulfur || 0) > 0.05) return 'bchl';
  if ((g.photoferrotroph || 0) > 0.03) return 'retinal';
  return null;
}

/** Surface colour bias from pigment. Item 28. */
export function pigmentLandTint(pigment, base) {
  if (!pigment) return base;
  const [r, g, b] = base;
  if (pigment === 'chla') return [r * 0.7, Math.min(255, g * 1.15), b * 0.75];
  if (pigment === 'bchl') return [Math.min(255, r * 1.1), g * 0.7, Math.min(255, b * 1.05)]; // purple-ish
  if (pigment === 'retinal') return [Math.min(255, r * 1.2), g * 0.65, Math.min(255, b * 1.15)]; // magenta
  return base;
}

function litShelfFraction(W) {
  let lit = 0, total = 0;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= W.seaLevel) continue;
    const depth = W.seaLevel - W.h[c];
    if (depth > 0.15) continue;
    total++;
    const light = W.species?.light?.[c] ?? 0;
    if (light > 0.5) lit++;
  }
  return total > 0 ? lit / total : 0;
}

/** Integrated oxygenic-invention progress per tick.
 *  Fitted so anoxygenic shelf mats invent ~2.4–3.0 Ga, not in the first 200 Myr. */
export function oxygenicClockStep(pre, shelf, dt) {
  return (pre * 0.25 + 0.00008) * (0.04 + Math.max(0, shelf)) * Math.max(0, dt);
}

function maybeInvent(W, chronLog, roll) {
  const T = W.transitions;
  const dt = Math.min(2, (W.dtYr || 200) / 1e6);

  // Abiogenesis is owned by originTick (rate × surface × inventory). This branch
  // only still plants modern Earth, which never runs the Hadean clock.
  if (!T.abiogenesis) {
    if (isModernEarth(W.rule)) {
      T.abiogenesis = true;
      T.luca = true;
      T.rnaWorld = true;
    }
    return;
  }

  // Oxygenic photosynthesis — accumulated invention clock, not a Bernoulli roll.
  // Two photosystems had to sit in one cell; anoxygenic mats are the precursor stock.
  // Fitted so a typical Earth-like with shelf phototrophs crosses ~2.4–3.0 Ga.
  if (!T.oxygenicPhotosynthesis && T.abiogenesis) {
    const pre = (W.guilds.purpleSulfur || 0) + (W.guilds.greenSulfur || 0)
      + (W.guilds.photoferrotroph || 0);
    const shelf = litShelfFraction(W);
    if (isModernEarth(W.rule)) {
      markTransition(W, 'oxygenicPhotosynthesis', chronLog, 'Oxygenic photosynthesis invented');
    } else {
      if (W.oxyThresh == null) {
        W.oxyThresh = 0.9 + rngOf(W, 'rngBio')() * 0.5; // 0.9–1.4. provenance: invented jitter
      }
      W.oxyInvent = (W.oxyInvent || 0) + oxygenicClockStep(pre, shelf, dt);
      if (W.oxyInvent >= W.oxyThresh && pre > 0.004 && shelf > 0.04) {
        markTransition(W, 'oxygenicPhotosynthesis', chronLog, 'Oxygenic photosynthesis invented');
        for (let c = 0; c < NC; c++) {
          const anox = (W.guildDens.purpleSulfur[c] || 0) + (W.guildDens.greenSulfur[c] || 0)
            + (W.guildDens.photoferrotroph[c] || 0);
          if (anox > 0.04) {
            W.guildDens.cyanobacteria[c] = Math.max(W.guildDens.cyanobacteria[c], 0.1);
          }
        }
      }
    }
  }

  if (T.oxygenicPhotosynthesis && W.gases.O2 > 0.01 && !T.aerobicRespiration) {
    if (roll() < 0.01 * dt || (isModernEarth(W.rule))) {
      markTransition(W, 'aerobicRespiration', chronLog, 'Aerobic respiration');
    }
  }

  if (!T.eukaryote && T.aerobicRespiration && W.gases.O2 > 0.005) {
    const o2 = W.gases.O2;
    // provenance: fitted — once O₂ is well above GOE threshold, endosymbiosis is likely
    const p = o2 > 0.2 ? 0.012 * dt : o2 > 0.05 ? 0.004 * dt : 0.0003 * dt;
    if (isModernEarth(W.rule)) {
      markTransition(W, 'eukaryote', chronLog, 'Endosymbiosis: mitochondrion');
      T.bacteriaArchaea = true;
      maybeCaptureMoment(W, 'firstEukaryote', 'First eukaryote');
    } else if (o2 > 0.008 && roll() < p) {
      markTransition(W, 'eukaryote', chronLog, 'Endosymbiosis: mitochondrion');
      T.bacteriaArchaea = true;
      maybeCaptureMoment(W, 'firstEukaryote', 'First eukaryote');
    }
  }

  if (T.eukaryote && T.oxygenicPhotosynthesis && !T.plastid) {
    if (roll() < 0.0005 * dt || (isModernEarth(W.rule))) {
      markTransition(W, 'plastid', chronLog, 'Primary plastid');
    }
  }

  if (T.eukaryote && !T.sex && roll() < 0.001 * dt) T.sex = true;

  if (!T.multicellular && T.eukaryote && W.gases.O2 > 0.03) {
    const o2 = W.gases.O2;
    // provenance: fitted — multicellularity follows once O₂ supports larger bodies
    const p = o2 > 0.08 ? 0.003 * dt : 0.0004 * dt;
    if (isModernEarth(W.rule)) {
      markTransition(W, 'multicellular', chronLog, 'Multicellularity');
      maybeCaptureMoment(W, 'firstMulticellular', 'First multicellular body');
    } else if (o2 > 0.035 && roll() < p) {
      markTransition(W, 'multicellular', chronLog, 'Multicellularity');
      maybeCaptureMoment(W, 'firstMulticellular', 'First multicellular body');
    }
  }

  if (!T.biomineral && T.multicellular && W.gases.O2 > 0.08 && W.carbon?.omegaAragonite > 1.5) {
    if (roll() < 0.002 * dt || (isModernEarth(W.rule))) {
      markTransition(W, 'biomineral', chronLog, 'Biomineralization / Cambrian skeletons');
    }
  }

  if (!T.landPlants && T.multicellular && W.ozone > 0.15) {
    let soilOk = 0;
    for (let c = 0; c < NC; c++) if (W.h[c] >= W.seaLevel && W.soil[c] > 0.1) soilOk++;
    if (soilOk > NC * 0.02 || (isModernEarth(W.rule))) {
      if (roll() < 0.001 * dt || (isModernEarth(W.rule))) {
        markTransition(W, 'landPlants', chronLog, 'Land plants');
        maybeCaptureMoment(W, 'firstLandPlant', 'First land plant');
      }
    }
  }

  if (T.landPlants && !T.endothermy && W.gases.O2 > 0.12 && roll() < 0.0003 * dt) {
    markTransition(W, 'endothermy', chronLog, null);
  }
  if (T.endothermy && !T.language && (W.transitions?.landPlants || W.unlockedClass >= 5) && roll() < 0.0001 * dt) {
    markTransition(W, 'language', chronLog, 'Language — last transition');
  }
}
