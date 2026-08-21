/** Earth calibration helpers — land fraction, polar ice, Holocene-ish biosphere. */

import { clamp } from '../math.js';
import { NC, AREA, NBR } from '../sphere.js';
import { rngOf } from './rng.js';
import { updateContinentality } from './hydro.js';

/** Binary-search sea level so area-weighted land fraction ≈ target (Earth ≈ 0.29). */
export function fitSeaLevel(W, targetLand = 0.29) {
  let lo = -0.65, hi = 0.95;
  for (let iter = 0; iter < 18; iter++) {
    const mid = (lo + hi) * 0.5;
    let land = 0;
    for (let c = 0; c < NC; c++) if (W.h[c] >= mid) land += AREA[c];
    if (land / NC > targetLand) lo = mid;
    else hi = mid;
  }
  W.seaLevel = (lo + hi) * 0.5;
  W._seaBase = W.seaLevel;
}

/** Modest ice caps where it is already cold, not a snowball and not a parallel. */
/**
 * Lay down the caps a generated Earth starts with.
 *
 * The threshold used to be `freeze + 0.10` over a 0.22 ramp, so ice was seeded
 * anywhere below `freeze + 0.067`. That was tolerable while `freeze` was 0.28 —
 * an ice line at 243 K, which is 30 K too cold and meant this seeded almost
 * nothing. With `freeze` corrected to water's actual freezing point the same
 * expression seeds ice at 285 K: subtropical ocean, and glaciers on any
 * equatorial mountain. Ice belongs below freezing, and the ramp is the ~19 K
 * over which a cap goes from patchy to permanent.
 */
export function seedPolarIce(W, rule) {
  const freeze = rule.freeze ?? 0.30;
  for (let c = 0; c < NC; c++) {
    const elev = Math.max(0, W.h[c] - W.seaLevel);
    const t = (W.temp[c] || 0.5) - elev * 0.12;
    const coldness = clamp((freeze - t) / 0.12, 0, 1);
    if (coldness < 0.15) {
      W.iceLand[c] = 0;
      W.iceSea[c] = 0;
      W.ice[c] = 0;
      continue;
    }
    if (W.h[c] >= W.seaLevel) {
      W.iceLand[c] = clamp(0.28 + coldness * 0.62, 0, 0.95);
      W.iceSea[c] = 0;
    } else {
      W.iceSea[c] = clamp(0.18 + coldness * 0.62, 0, 0.9);
      W.iceLand[c] = 0;
    }
    W.ice[c] = Math.max(W.iceLand[c], W.iceSea[c]);
  }
}

/** Coastal + continentality moisture so biomes can establish. No latitude bands. */
export function primeEarthMoisture(W) {
  const rng = rngOf(W, 'rngBio');
  updateContinentality(W);
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) {
      W.moist[c] = 1;
      continue;
    }
    let nearSea = false;
    for (let k = 0; k < 4; k++) {
      if (W.h[NBR[c * 4 + k]] < W.seaLevel) { nearSea = true; break; }
    }
    const inland = (W.cont?.[c] || 0) > 700;
    if (inland && !nearSea) {
      W.moist[c] = Math.min(W.moist[c], 0.08 + rng() * 0.07);
      continue;
    }
    const maritime = Math.exp(-(W.cont[c] || 0) / 900);
    let target = (nearSea ? 0.42 : 0.26) * (0.55 + 0.45 * maritime);
    if ((W.temp[c] || 0) < 0.28) target *= 0.75;
    W.moist[c] = Math.max(W.moist[c], target * (0.85 + rng() * 0.2));
  }
}

/**
 * Established modern biosphere from temperature, moisture and ice — not latitude belts.
 * Not neon sparse nuclei; land should already read as Earth from orbit.
 */
export function seedEarthBiosphere(W) {
  const rng = rngOf(W, 'rngBio');
  W.unlockedClass = Math.max(W.unlockedClass, 6);
  if (W.gases.O2 < 0.20) W.gases.O2 = 0.21;
  if (W.gases.N2 < 0.70) W.gases.N2 = 0.78;

  for (let c = 0; c < NC; c++) {
    const t = W.temp[c];
    const m = W.moist[c];
    const isSea = W.h[c] < W.seaLevel;

    if (isSea) {
      const depth = W.seaLevel - W.h[c];
      if (depth < 0.09 && t > 0.40 && t < 0.78) {
        W.reef[c] = 0.25 + rng() * 0.45;
        W.life[c] = 0.22 + rng() * 0.28;
      } else if (depth < 0.2 && t > 0.28) {
        W.life[c] = 0.06 + rng() * 0.1;
      }
      continue;
    }

    if (W.ice[c] > 0.45) {
      W.life[c] = 0;
      continue;
    }

    const inland = (W.cont?.[c] || 0) > 800;
    if (m < 0.11 || (inland && m < 0.22)) {
      W.moist[c] = Math.min(W.moist[c], 0.10 + rng() * 0.06);
      W.life[c] = rng() < 0.12 ? 0.04 + rng() * 0.06 : 0;
      continue;
    }

    if (m > 0.35 && t > 0.42) {
      W.life[c] = 0.62 + rng() * 0.28;
      W.moist[c] = Math.max(m, 0.55);
      continue;
    }

    if (m > 0.20 && t > 0.32 && t < 0.78) {
      const lush = m > 0.34;
      W.life[c] = (lush ? 0.50 : 0.30) + rng() * 0.28;
      continue;
    }

    if (t > 0.20 && t < 0.50 && m > 0.16) {
      W.life[c] = 0.30 + rng() * 0.32;
      continue;
    }

    if (t > 0.16 && m > 0.12) {
      W.life[c] = 0.08 + rng() * 0.14;
    }
  }
}
