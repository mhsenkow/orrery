/** Industrial poison — smog, lead, accidents, regulation (dark-400 M §241–260). */

import { NC, NBR } from '../sphere.js';
import { rngOf } from './rng.js';
import { pourToxin } from './anthro.js';
import { noteCasualty } from './dark.js';

export function resetIndustry(W) {
  W.regulation = W.regulation || 0;
  W.dark = W.dark || {};
  W.dark.industryPoison = 0;
  W.dark.industrialAccidents = 0;
}

/** Verb: raise regulation, reducing contamination rates (§257). */
export function regulateIndustry(W, amount = 0.1) {
  W.regulation = Math.min(1, (W.regulation || 0) + amount);
  return W.regulation;
}

export function industryTick(W, log = null) {
  if (!W.ore || !W.toxin) return;
  W.dark = W.dark || {};
  const rng = rngOf(W, 'rngGod');
  const tick = W._tickIndex | 0;
  const reg = Math.max(0, Math.min(1, W.regulation || 0));
  const rateScale = 1 - reg * 0.75; // regulation measurably reduces rates (§259)

  if (tick % 32 !== 0) {
    W.dark.industryPoison = W.dark.industryPoison || 0;
    return;
  }

  let contaminated = 0;
  for (let c = 0; c < NC; c += 13) {
    const ore = W.ore[c] || 0;
    const build = W.build?.[c] || 0;
    if (ore < 0.35 || build < 0.25) continue;

    // Smelter / mine tailings (§241–242).
    const leak = (0.012 + ore * 0.02) * rateScale;
    W.toxin[c] = Math.min(1, (W.toxin[c] || 0) + leak);
    pourToxin(W, c, leak * 2, 0);
    contaminated++;

    // Lead / air-quality mortality in dense industry (§254–255).
    if (build > 0.4 && rng() < 0.15 * rateScale) {
      noteCasualty(W, 'poison', 1 + ((build * 4) | 0));
    }

    // Downwind heavy metals.
    if (W.windU && rng() < 0.3 * rateScale) {
      let best = c, bestAlong = 0;
      const u = W.windU[c] || 0, v = W.windV?.[c] || 0;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        // Prefer any neighbor when wind is strong.
        const along = Math.abs(u) + Math.abs(v);
        if (along > bestAlong) { bestAlong = along; best = n; }
      }
      if (best !== c) W.toxin[best] = Math.min(1, (W.toxin[best] || 0) + leak * 0.5);
    }

    // Rare Bhopal-scale accident (§256).
    if (rng() < 0.0008 * rateScale && build > 0.5) {
      pourToxin(W, c, 0.9, 2);
      noteCasualty(W, 'poison', 200 + ((rng() * 400) | 0));
      W.dark.industrialAccidents = (W.dark.industrialAccidents | 0) + 1;
      if (log) log(W.year, 'industry', c, 0.9, 'Industrial accident');
    }
  }

  W.dark.industryPoison = contaminated;
  W.dark.regulation = reg;
}
