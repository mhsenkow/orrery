/** Industrial poison — smog, lead, PFAS, accidents, regulation (dark-400 M §241–260).
 *  Also nuclear fuel-cycle signatures and reactor accidents (§75–76). */

import { NC, NBR } from '../sphere.js';
import { rngOf } from './rng.js';
import { pourToxin, irradiate } from './anthro.js';
import { noteCasualty } from './dark.js';

/** Forever-chemical half-life in ticks — longer than any practical run (§249). */
export const PFAS_HALF_LIFE = 1e9;

export function resetIndustry(W) {
  W.regulation = W.regulation || 0;
  W.smog = 0;
  W.lead = 0;
  W.pfas = 0;
  W.microplastics = 0;
  if (!W.toxinIndustry || W.toxinIndustry.length !== NC) {
    W.toxinIndustry = new Float32Array(NC);
  } else {
    W.toxinIndustry.fill(0);
  }
  W.dark = W.dark || {};
  W.dark.industryPoison = 0;
  W.dark.industrialAccidents = 0;
  W.dark.reactorAccidents = 0;
  W.dark.contamWar = 0;
  W.dark.contamIndustry = 0;
  W.dark.tailingsFails = 0;
  W.dark.discoveryKnown = false;
  W.dark.regulation = 0;
  W._tailings = [];
}

/** Verb: raise regulation, reducing contamination at a build-growth cost (§257). */
export function regulateIndustry(W, amount = 0.1) {
  W.regulation = Math.min(1, (W.regulation || 0) + amount);
  // Regulation slows industrial build growth (§257).
  W._regBuildPenalty = Math.min(0.85, (W._regBuildPenalty || 0) + amount * 0.35);
  W.dark = W.dark || {};
  W.dark.regulation = W.regulation;
  return W.regulation;
}

/** Effective build growth multiplier under regulation. */
export function industryBuildGrowth(W) {
  return Math.max(0.15, 1 - (W._regBuildPenalty || 0));
}

function ensureFields(W) {
  if (!W.toxinIndustry || W.toxinIndustry.length !== NC) {
    W.toxinIndustry = new Float32Array(NC);
  }
  if (!W._tailings) W._tailings = [];
}

/** Register a mine-tailings dam that can fail later (§241 / dam-fail path). */
export function placeTailingsDam(W, cell, load = 0.6) {
  ensureFields(W);
  const c = cell | 0;
  if (c < 0 || c >= NC) return null;
  const dam = { cell: c, load: Math.min(1, load), age: 0 };
  W._tailings.push(dam);
  return dam;
}

/** Tailings dam failure → toxin flood downhill (§256 adjacent). */
export function failTailingsDam(W, dam, log = null) {
  if (!dam || dam._failed) return 0;
  dam._failed = true;
  const c = dam.cell | 0;
  const load = dam.load || 0.5;
  pourToxin(W, c, 0.55 + load * 0.4, 2);
  if (W.toxinIndustry) {
    W.toxinIndustry[c] = Math.min(1, (W.toxinIndustry[c] || 0) + 0.5 + load * 0.4);
  }
  const h0 = W.h?.[c] ?? 0;
  let flooded = 0;
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    if ((W.h?.[n] ?? 1) <= h0 + 0.03) {
      pourToxin(W, n, 0.35 + load * 0.25, 1);
      if (W.toxinIndustry) {
        W.toxinIndustry[n] = Math.min(1, (W.toxinIndustry[n] || 0) + 0.3);
      }
      if (W.life?.[n] > 0) W.life[n] = Math.max(0, W.life[n] - 0.25);
      flooded++;
    }
  }
  noteCasualty(W, 'poison', 40 + ((load * 120) | 0));
  W.dark = W.dark || {};
  W.dark.tailingsFails = (W.dark.tailingsFails | 0) + 1;
  if (log) log(W.year, 'industry', c, 0.85, `Tailings dam failed — ${flooded} cells flooded`);
  return flooded;
}

/** Assert regulation reduces contamination rates (§259). */
export function assertRegulationReducesContamination(lowRegRate, highRegRate) {
  if (!(highRegRate < lowRegRate * 0.85)) {
    throw new Error(
      `regulation should cut contamination: lowReg=${lowRegRate} highReg=${highRegRate}`,
    );
  }
}

export function industryTick(W, log = null) {
  if (!W.ore || !W.toxin) return;
  ensureFields(W);
  W.dark = W.dark || {};
  const rng = rngOf(W, 'rngGod');
  const tick = W._tickIndex | 0;
  const reg = Math.max(0, Math.min(1, W.regulation || 0));
  const rateScale = 1 - reg * 0.75; // regulation measurably reduces rates (§259)
  const growth = industryBuildGrowth(W);

  // Apply regulation build-growth cost sparsely (§257).
  if (tick % 48 === 0 && growth < 0.99 && W.build) {
    for (let c = 0; c < NC; c += 17) {
      const b = W.build[c] || 0;
      if (b > 0.3 && b < 0.95 && (W.ore[c] || 0) > 0.2) {
        W.build[c] = Math.max(0.05, b * (0.998 + growth * 0.002));
      }
    }
  }

  if (tick % 32 !== 0) {
    W.dark.industryPoison = W.dark.industryPoison || 0;
    W.dark.regulation = reg;
    return;
  }

  let contaminated = 0;
  let industryCells = 0;
  let warCells = 0;
  const tech = Math.max(0, ((W.unlockedClass || 0) - 4) / 3);
  const sulph = W.gases?.sulphate || 0;

  // Scalar accumulators from ore+build (§241–249, 255).
  let oreBuild = 0;
  let nSample = 0;
  for (let c = 0; c < NC; c += 11) {
    const ore = W.ore[c] || 0;
    const build = W.build?.[c] || 0;
    if (ore > 0.2 && build > 0.15) {
      oreBuild += ore * build;
      nSample++;
    }
  }
  const emit = (nSample ? oreBuild / nSample : 0) * rateScale;
  W.smog = Math.min(1, (W.smog || 0) * 0.995 + emit * 0.08);
  W.lead = Math.min(1, (W.lead || 0) * 0.998 + emit * 0.04);
  // PFAS barely decays (§249).
  const pfasDecay = Math.pow(0.5, 32 / PFAS_HALF_LIFE);
  W.pfas = Math.min(1, (W.pfas || 0) * pfasDecay + emit * 0.025);
  W.microplastics = Math.min(1, (W.microplastics || 0) * 0.999 + emit * 0.03);

  // Microplastics into trophic chain (§248).
  if (W.trophic && (W.microplastics || 0) > 0.02) {
    const hit = W.microplastics * 0.01;
    W.trophic.herb = Math.max(0, (W.trophic.herb || 0) * (1 - hit));
    W.trophic.carn = Math.max(0, (W.trophic.carn || 0) * (1 - hit * 1.4));
  }

  for (let c = 0; c < NC; c += 13) {
    const ore = W.ore[c] || 0;
    const build = W.build?.[c] || 0;
    if (ore < 0.35 || build < 0.25) continue;

    // Smelter / mine tailings (§241–242).
    const leak = (0.012 + ore * 0.02) * rateScale;
    W.toxin[c] = Math.min(1, (W.toxin[c] || 0) + leak);
    W.toxinIndustry[c] = Math.min(1, (W.toxinIndustry[c] || 0) + leak);
    pourToxin(W, c, leak * 2, 0);
    contaminated++;
    industryCells++;

    // Register occasional tailings dams near heavy mines.
    if (ore > 0.55 && build > 0.4 && rng() < 0.04 * rateScale && W._tailings.length < 24) {
      placeTailingsDam(W, c, 0.4 + ore * 0.4);
    }

    // Groundwater contamination — invisible, slow (§245).
    if (W.groundW && rng() < 0.2 * rateScale) {
      W.groundW[c] = Math.min(1, (W.groundW[c] || 0) + leak * 0.15);
      // Seeps into toxin later via moist cells.
      if ((W.moist?.[c] || 0) > 0.3) {
        W.toxin[c] = Math.min(1, (W.toxin[c] || 0) + leak * 0.08);
      }
    }

    // River-borne contamination follows flow downhill (§244).
    if (W.flow && (W.flow[c] || 0) > 0.15 && rng() < 0.35 * rateScale) {
      let best = c, bestFlow = W.flow[c] || 0;
      const h0 = W.h?.[c] ?? 0;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        const fn = W.flow[n] || 0;
        if (fn >= bestFlow && (W.h?.[n] ?? 1) <= h0 + 0.02) {
          bestFlow = fn;
          best = n;
        }
      }
      if (best !== c) {
        W.toxin[best] = Math.min(1, (W.toxin[best] || 0) + leak * 0.6);
        W.toxinIndustry[best] = Math.min(1, (W.toxinIndustry[best] || 0) + leak * 0.5);
      }
    }

    // Fuel-cycle signatures when industry is nuclear-capable (§76).
    if (tech > 0.15 && build > 0.35) {
      if (rng() < 0.25 * rateScale) {
        irradiate(W, c, 0.04 + ore * 0.03, 0);
      }
      if (build > 0.55 && rng() < 0.12 * rateScale) {
        irradiate(W, c, 0.18 + build * 0.12, 1);
      }
    }

    // Reactor accident — rare, separate from weapons (§75).
    if (tech > 0.3 && build > 0.55 && ore > 0.4 && rng() < 0.0006 * rateScale) {
      irradiate(W, c, 0.7 + rng() * 0.5, 2);
      noteCasualty(W, 'fallout', 80 + ((rng() * 200) | 0));
      W.dark.reactorAccidents = (W.dark.reactorAccidents | 0) + 1;
      if (log) log(W.year, 'industry', c, 0.85, 'Reactor accident');
    }

    // Lead / air-quality mortality in dense industry (§254–255).
    if (build > 0.4 && rng() < 0.15 * rateScale) {
      const aq = 1 + ((build * 4 + (W.smog || 0) * 6 + (W.lead || 0) * 4) | 0);
      noteCasualty(W, 'poison', aq);
    }

    // Downwind heavy metals / smog (§242).
    if (W.windU && rng() < 0.3 * rateScale) {
      let best = c, bestAlong = -1;
      const u = W.windU[c] || 0, v = W.windV?.[c] || 0;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        // Prefer neighbour aligned with wind vector magnitude as proxy.
        const along = Math.abs(u) + Math.abs(v) + (k * 0.01);
        if (along > bestAlong) { bestAlong = along; best = n; }
      }
      if (best !== c) {
        W.toxin[best] = Math.min(1, (W.toxin[best] || 0) + leak * 0.5);
        W.toxinIndustry[best] = Math.min(1, (W.toxinIndustry[best] || 0) + leak * 0.4);
      }
    }

    // Rare Bhopal-scale accident (§256).
    if (rng() < 0.0008 * rateScale && build > 0.5) {
      pourToxin(W, c, 0.9, 2);
      W.toxinIndustry[c] = Math.min(1, (W.toxinIndustry[c] || 0) + 0.8);
      noteCasualty(W, 'poison', 200 + ((rng() * 400) | 0));
      W.dark.industrialAccidents = (W.dark.industrialAccidents | 0) + 1;
      if (log) log(W.year, 'industry', c, 0.9, 'Industrial accident');
    }
  }

  // Acid rain from sulphate — forests and lakes near industry (§243).
  if (sulph > 0.01 && tick % 64 === 0) {
    for (let c = 0; c < NC; c += 19) {
      const ind = W.toxinIndustry[c] || 0;
      if (ind < 0.05 && (W.ore[c] || 0) < 0.3) continue;
      const acid = sulph * (0.3 + ind) * rateScale;
      if (W.life?.[c] > 0.1) {
        // Forests (high life on land) and lakes (moist/lake) hit harder.
        const lake = (W.lake?.[c] || 0) > 0.1 || (W.moist?.[c] || 0) > 0.55;
        const hit = acid * (lake ? 0.08 : 0.04);
        W.life[c] = Math.max(0, W.life[c] - hit);
      }
    }
  }

  // Age and occasionally fail tailings dams.
  for (const dam of W._tailings) {
    if (dam._failed) continue;
    dam.age = (dam.age | 0) + 1;
    const failP = 0.0004 * rateScale * (1 + (dam.load || 0)) * (1 + dam.age / 2000);
    if (rng() < failP) failTailingsDam(W, dam, log);
  }
  W._tailings = W._tailings.filter((d) => !d._failed).slice(-32);

  // War vs industry contamination split for probe (§260).
  if (W.toxin) {
    for (let c = 0; c < NC; c += 7) {
      const t = W.toxin[c] || 0;
      if (t < 0.08) continue;
      const ind = W.toxinIndustry?.[c] || 0;
      if (ind > t * 0.4) industryCells++;
      else if ((W.rad?.[c] || 0) > 0.1 || (W.fought?.[c] || 0) > 0) warCells++;
    }
  }

  // Discovery moment: contamination that existed becomes *known* (§258).
  if (!W.dark.discoveryKnown && (W.pfas || 0) > 0.08 && (W.smog || 0) > 0.1) {
    W.dark.discoveryKnown = true;
    if (log) {
      log(W.year, 'industry', 0, 0.7,
        `Contamination discovered — PFAS half-life ${PFAS_HALF_LIFE} ticks (longer than the run)`);
    }
  }

  W.dark.industryPoison = contaminated;
  W.dark.contamIndustry = industryCells;
  W.dark.contamWar = warCells;
  W.dark.regulation = reg;
  W.dark.smog = W.smog || 0;
  W.dark.lead = W.lead || 0;
  W.dark.pfas = W.pfas || 0;
  W.dark.microplastics = W.microplastics || 0;
}
