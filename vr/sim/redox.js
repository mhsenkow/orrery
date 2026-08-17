/** Redox-tower biosphere — metabolic guilds before morphology.
 *  Backlog items 13–28. */

import { clamp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { maybeCaptureMoment } from './time.js';

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
  { id: 'nFixer', donor: 'N2', acceptor: 'ATP', yield: 0.1, pigment: null, color: [45, 85, 55] },
  { id: 'nitrifier', donor: 'NH4', acceptor: 'O2', yield: 0.15, pigment: null, color: [70, 90, 50] },
  { id: 'decomposer', donor: 'lignin', acceptor: 'O2', yield: 0.2, pigment: null, color: [90, 70, 40] },
  { id: 'chemolithotroph', donor: 'H2', acceptor: 'CO2', yield: 0.1, pigment: null, color: [55, 55, 50], vent: true },
];

const DONORS = ['H2', 'H2S', 'Fe2', 'CH4', 'NH4', 'orgC', 'N2', 'H2O', 'lignin'];
const ACCEPTORS = ['O2', 'NO3', 'NO2', 'SO4', 'Fe3', 'CO2', 'light', 'none', 'ATP'];

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

export function initRedox(W) {
  W.species = createSpeciesFields();
  W.guildDens = createGuildDensity();
  W.guilds = {}; // global mean per guild
  for (const g of GUILDS) W.guilds[g.id] = 0;
  W.fe2Ocean = 0.45; // Archean dissolved iron
  W.stromatolite = new Float32Array(NC);
  W.bifRock = new Float32Array(NC); // banded iron formation deposit
  W.matCover = new Float32Array(NC);
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

function seedVentChemistry(W) {
  const { species, h, seaLevel, bound } = W;
  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    // Baseline ocean chemistry
    species.H2[c] = isSea ? 0.02 : 0.001;
    species.H2S[c] = isSea ? 0.03 : 0.002;
    species.Fe2[c] = isSea ? (W.fe2Ocean || 0.3) : 0.01;
    species.Fe3[c] = isSea ? 0.05 : 0.1;
    species.CH4[c] = isSea ? (W.gases.CH4 || 0) * 10 : 0;
    species.NH4[c] = 0.04;
    species.NO3[c] = W.gases.O2 > 0.01 ? 0.08 : 0.001;
    species.NO2[c] = W.gases.O2 > 0.01 ? 0.02 : 0.001;
    species.SO4[c] = W.gases.O2 > 0.005 ? 0.15 : 0.01;
    species.CO2[c] = W.gases.CO2 * 20;
    species.O2[c] = isSea ? W.gases.O2 * 0.7 : W.gases.O2;
    species.orgC[c] = W.life[c] * 0.3;
    species.N2[c] = W.gases.N2;
    species.H2O[c] = isSea || W.moist[c] > 0.2 ? 1 : W.moist[c];
    species.lignin[c] = W.transitions?.landPlants ? W.life[c] * 0.2 : 0;
    species.light[c] = isSea
      ? Math.max(0, 1 - (seaLevel - h[c]) * 8) * Math.max(0.1, W.temp[c])
      : Math.max(0.15, W.temp[c]);
    species.none[c] = 1;
    species.ATP[c] = 0.5;

    // Serpentinization / vents — abiotic H₂. Item 16.
    if (bound[c] === 0 && isSea) {
      species.H2[c] = Math.min(1, species.H2[c] + 0.45);
      species.H2S[c] = Math.min(1, species.H2S[c] + 0.25);
      species.Fe2[c] = Math.min(1, species.Fe2[c] + 0.2);
    }
  }
}

function guildViable(g, sp, c, W) {
  if (g.oxygenic && !W.transitions.oxygenicPhotosynthesis) return 0;
  if (g.id === 'aerobe' && !W.transitions.aerobicRespiration) return 0;
  if (g.id === 'decomposer' && !W.transitions.landPlants) return 0;
  if (g.vent && W.bound[c] !== 0) return 0.15; // weak away from vents

  const donor = sp[g.donor]?.[c] ?? 0;
  const acc = g.acceptor === 'none' ? 1 : (sp[g.acceptor]?.[c] ?? 0);
  if (donor < 0.01 || acc < 0.01) return 0;

  // Nitrogenase poisoned by O₂. Item 21.
  if (g.id === 'nFixer' && sp.O2[c] > 0.05) return donor * acc * 0.05;

  // Free-energy style yield under local T. Item 15.
  const T = W.temp[c];
  const maint = 0.04 + Math.max(0, 0.5 - T) * 0.08;
  const energy = g.yield * donor * acc * (0.6 + T * 0.5);
  return Math.max(0, energy - maint);
}

export function redoxTick(W, chronLog) {
  if (W.rule.daisyworld || W.rule.airless) return;
  if (!W.species) initRedox(W);

  seedVentChemistry(W);
  const { species, guildDens, life, h, seaLevel, gases, rng } = W;
  const dt = Math.min(1.5, (W.dtYr || 200) / 5e5);
  const roll = rng || (() => 0.5);

  // Contigent inventions
  maybeInvent(W, chronLog, roll);

  const means = {};
  for (const g of GUILDS) means[g.id] = 0;

  let photosynthProxy = 0;
  let ch4Prod = 0;
  let totalLife = 0;

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

      const growth = fit * 0.15 * dt;
      const neigh = Math.max(
        guildDens[g.id][NBR[c * 4]], guildDens[g.id][NBR[c * 4 + 1]],
        guildDens[g.id][NBR[c * 4 + 2]], guildDens[g.id][NBR[c * 4 + 3]]
      );
      let d = guildDens[g.id][c];
      d = clamp(d + growth + neigh * fit * 0.04 * dt - 0.02 * dt, 0, 1);
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

    const target = clamp(cellBio * 0.45 + W.matCover[c] * 0.3, 0, 1);
    const modern = W.rule.earthLike && !W.rule.deepTime;
    if (W.transitions.abiogenesis || modern) {
      // Modern Earth: gentle nudge so seeded biomes persist
      life[c] = lerpLife(life[c], modern ? Math.max(life[c] * 0.98, target) : target,
        modern ? 0.04 * dt : 0.15 * dt);
    } else {
      life[c] *= Math.max(0, 1 - 0.01 * dt); // sterile until origin
    }
    totalLife += life[c] * AREA[c];

    // Legacy class index from dominant complexity
    W.lifeClass[c] = classFromTransitions(W, bestId, isSea);
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

  // Organic carbon field
  for (let c = 0; c < NC; c++) {
    species.orgC[c] = clamp(life[c] * 0.4 + species.orgC[c] * 0.9, 0, 1);
  }

  if (photosynthProxy > 1) {
    maybeCaptureMoment(W, 'firstPhotosynthesis', 'First photosynthesis');
  }
  if (gases.O2 > 0.001) {
    maybeCaptureMoment(W, 'firstOxygen', 'First free oxygen');
  }

  W.meanLife = totalLife / NC;
  W.dominantPigment = dominantPigment(W);
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

function classFromTransitions(W, bestId, isSea) {
  const T = W.transitions;
  if (T.language || T.endothermy) return 7;
  if (T.landPlants && !isSea) return 2;
  if (T.biomineral && isSea) return 4;
  if (T.multicellular) return isSea ? 4 : 3;
  if (T.eukaryote) return 1;
  if (bestId === 'cyanobacteria' || bestId === 'aerobe') return 0;
  return 0;
}

function maybeInvent(W, chronLog, roll) {
  const T = W.transitions;
  const dt = Math.min(2, (W.dtYr || 200) / 1e6);
  const ma = (4.567e9 - W.ageYr) / 1e6;

  // Abiogenesis — probabilistic. Item 30.
  if (!T.abiogenesis) {
    let chance = 0;
    for (let c = 0; c < NC; c++) {
      if (W.bound[c] !== 0) continue;
      if (W.h[c] >= W.seaLevel) continue;
      const t = W.temp[c];
      if (t > 0.35 && t < 0.95) chance += 0.00002 * dt;
    }
    if (W.rule.earthLike && !W.rule.deepTime) {
      T.abiogenesis = true; // modern Earth already has life
    } else if (roll() < chance || (ma < 4000 && ma > 3500 && roll() < 0.08 * dt) || (ma < 3800 && roll() < 0.03 * dt)) {
      T.abiogenesis = true;
      // Seed chemolithotrophs at vents. Item 16.
      for (let c = 0; c < NC; c++) {
        if (W.bound[c] === 0 && W.h[c] < W.seaLevel) {
          W.guildDens.chemolithotroph[c] = 0.4;
          W.guildDens.methanogen[c] = 0.25;
          W.guildDens.fermenter[c] = 0.3;
          W.life[c] = Math.max(W.life[c], 0.35);
        }
      }
      if (chronLog) chronLog(W.year, 'origin', 0, 1, 'Abiogenesis');
      maybeCaptureMoment(W, 'firstCell', 'First cell');
      T.luca = true;
      T.rnaWorld = true;
    }
    return;
  }

  // Oxygenic photosynthesis — once, hard. Item 19.
  if (!T.oxygenicPhotosynthesis && T.abiogenesis) {
    const pre = (W.guilds.purpleSulfur || 0) + (W.guilds.greenSulfur || 0);
    const p = pre > 0.02 ? 0.0008 * dt : 0.00005 * dt;
    if (W.rule.earthLike && !W.rule.deepTime) T.oxygenicPhotosynthesis = true;
    else if (ma < 3000 && roll() < p) {
      T.oxygenicPhotosynthesis = true;
      if (chronLog) chronLog(W.year, 'evolution', 0, 1, 'Oxygenic photosynthesis invented');
    }
  }

  if (T.oxygenicPhotosynthesis && W.gases.O2 > 0.01 && !T.aerobicRespiration) {
    if (roll() < 0.01 * dt || (W.rule.earthLike && !W.rule.deepTime)) {
      T.aerobicRespiration = true;
      if (chronLog) chronLog(W.year, 'evolution', 0, 1, 'Aerobic respiration');
    }
  }

  // Eukaryote / mitochondrion — singular hard gate. Item 34.
  if (!T.eukaryote && T.aerobicRespiration && W.gases.O2 > 0.005) {
    const p = 0.0003 * dt;
    if (W.rule.earthLike && !W.rule.deepTime) T.eukaryote = true;
    else if (ma < 2100 && roll() < p) {
      T.eukaryote = true;
      T.bacteriaArchaea = true;
      if (chronLog) chronLog(W.year, 'evolution', 0, 1, 'Endosymbiosis: mitochondrion');
      maybeCaptureMoment(W, 'firstEukaryote', 'First eukaryote');
    }
  }

  if (T.eukaryote && T.oxygenicPhotosynthesis && !T.plastid) {
    if (roll() < 0.0005 * dt || (W.rule.earthLike && !W.rule.deepTime)) {
      T.plastid = true;
      if (chronLog) chronLog(W.year, 'evolution', 0, 1, 'Primary plastid');
    }
  }

  if (T.eukaryote && !T.sex && roll() < 0.001 * dt) T.sex = true;

  if (!T.multicellular && T.eukaryote && W.gases.O2 > 0.03) {
    const p = 0.0004 * dt;
    if (W.rule.earthLike && !W.rule.deepTime) T.multicellular = true;
    else if (ma < 800 && roll() < p) {
      T.multicellular = true;
      if (chronLog) chronLog(W.year, 'evolution', 0, 1, 'Multicellularity');
      maybeCaptureMoment(W, 'firstMulticellular', 'First multicellular body');
    }
  }

  if (!T.biomineral && T.multicellular && W.gases.O2 > 0.08 && W.carbon?.omegaAragonite > 1.5) {
    if (roll() < 0.002 * dt || (W.rule.earthLike && !W.rule.deepTime)) {
      T.biomineral = true;
      if (chronLog) chronLog(W.year, 'evolution', 0, 1, 'Biomineralization / Cambrian skeletons');
    }
  }

  // Terrestrialization — four conditions. Item 40.
  if (!T.landPlants && T.multicellular && W.ozone > 0.15) {
    let soilOk = 0;
    for (let c = 0; c < NC; c++) if (W.h[c] >= W.seaLevel && W.soil[c] > 0.1) soilOk++;
    if (soilOk > NC * 0.02 || (W.rule.earthLike && !W.rule.deepTime)) {
      if (roll() < 0.001 * dt || (W.rule.earthLike && !W.rule.deepTime)) {
        T.landPlants = true;
        if (chronLog) chronLog(W.year, 'evolution', 0, 1, 'Land plants');
        maybeCaptureMoment(W, 'firstLandPlant', 'First land plant');
      }
    }
  }

  if (T.landPlants && !T.endothermy && W.gases.O2 > 0.12 && roll() < 0.0003 * dt) {
    T.endothermy = true;
  }
  if (T.endothermy && !T.language && W.unlockedClass >= 6 && roll() < 0.0001 * dt) {
    T.language = true;
    if (chronLog) chronLog(W.year, 'evolution', 0, 1, 'Language — last transition');
  }

  // Sync unlockedClass for agents / sprites
  W.unlockedClass = 0;
  if (T.eukaryote) W.unlockedClass = 1;
  if (T.multicellular) W.unlockedClass = 2;
  if (T.biomineral) W.unlockedClass = 4;
  if (T.landPlants) W.unlockedClass = 5;
  if (T.endothermy) W.unlockedClass = 7;
  if (W.rule.earthLike && !W.rule.deepTime) W.unlockedClass = Math.max(W.unlockedClass, 6);
}
