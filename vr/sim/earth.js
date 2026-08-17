/** Earth calibration helpers — land fraction, polar ice, Holocene-ish biosphere. */

import { clamp } from '../math.js';
import { NC, AREA, DIR, NBR } from '../sphere.js';
import { rngOf } from './rng.js';

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

/** Modest polar caps (Antarctic / Arctic scale), not a snowball. */
export function seedPolarIce(W, rule) {
  const freeze = rule.freeze ?? 0.30;
  for (let c = 0; c < NC; c++) {
    const lat = Math.abs(DIR[c * 3 + 1]);
    if (lat < 0.78) {
      W.iceLand[c] = 0;
      W.iceSea[c] = 0;
      W.ice[c] = 0;
      continue;
    }
    const polar = clamp((lat - 0.78) / 0.22, 0, 1);
    const cold = W.temp[c] < freeze + 0.12 + polar * 0.08;
    if (!cold) {
      W.iceLand[c] *= 0.3;
      W.iceSea[c] *= 0.3;
      W.ice[c] = Math.max(W.iceLand[c], W.iceSea[c]);
      continue;
    }
    if (W.h[c] >= W.seaLevel) {
      W.iceLand[c] = clamp(0.35 + polar * 0.55, 0, 0.95);
      W.iceSea[c] = 0;
    } else {
      W.iceSea[c] = clamp(0.25 + polar * 0.55, 0, 0.9);
      W.iceLand[c] = 0;
    }
    W.ice[c] = Math.max(W.iceLand[c], W.iceSea[c]);
  }
}

/** Latitude + coastal moisture so biomes can establish. */
export function primeEarthMoisture(W) {
  const rng = rngOf(W, 'rngBio');
  for (let c = 0; c < NC; c++) {
    const lat = Math.abs(DIR[c * 3 + 1]);
    if (W.h[c] < W.seaLevel) {
      W.moist[c] = 1;
      continue;
    }
    let nearSea = false;
    for (let k = 0; k < 4; k++) {
      if (W.h[NBR[c * 4 + k]] < W.seaLevel) { nearSea = true; break; }
    }
    const desertBelt = lat > 0.28 && lat < 0.50;
    if (desertBelt && !nearSea) {
      W.moist[c] = Math.min(W.moist[c], 0.08 + rng() * 0.07);
      continue;
    }
    let target = 0.22;
    if (lat < 0.28) target = 0.55;
    else if (lat < 0.55) target = nearSea ? 0.36 : 0.26;
    else if (lat < 0.75) target = 0.34;
    else target = 0.22;
    if (nearSea) target = Math.max(target, 0.4);
    W.moist[c] = Math.max(W.moist[c], target * (0.85 + rng() * 0.2));
  }
}

/**
 * Established modern biosphere by climate belt — forests, grasslands, deserts, reefs.
 * Not neon sparse nuclei; land should already read as Earth from orbit.
 */
export function seedEarthBiosphere(W) {
  const rng = rngOf(W, 'rngBio');
  W.unlockedClass = Math.max(W.unlockedClass, 6);
  if (W.gases.O2 < 0.20) W.gases.O2 = 0.21;
  if (W.gases.N2 < 0.70) W.gases.N2 = 0.78;

  for (let c = 0; c < NC; c++) {
    const lat = Math.abs(DIR[c * 3 + 1]);
    const t = W.temp[c];
    const m = W.moist[c];
    const isSea = W.h[c] < W.seaLevel;

    if (isSea) {
      const depth = W.seaLevel - W.h[c];
      if (depth < 0.09 && t > 0.40 && t < 0.78 && lat < 0.55) {
        W.reef[c] = 0.25 + rng() * 0.45;
        W.life[c] = 0.22 + rng() * 0.28;
        W.lifeClass[c] = 4;
      } else if (depth < 0.2 && t > 0.28) {
        W.life[c] = 0.06 + rng() * 0.1;
        W.lifeClass[c] = 0;
      }
      continue;
    }

    if (W.ice[c] > 0.45) {
      W.life[c] = 0;
      continue;
    }

    const desertBelt = lat > 0.26 && lat < 0.52 && m < 0.22;
    if (m < 0.11 || desertBelt) {
      W.moist[c] = Math.min(W.moist[c], 0.10 + rng() * 0.06);
      W.life[c] = rng() < 0.12 ? 0.04 + rng() * 0.06 : 0;
      W.lifeClass[c] = 0;
      continue;
    }

    if (lat < 0.32 && m > 0.35 && t > 0.42) {
      W.life[c] = 0.62 + rng() * 0.28;
      W.lifeClass[c] = 2;
      W.moist[c] = Math.max(m, 0.55);
      continue;
    }

    if (lat < 0.70 && m > 0.20 && t > 0.32 && t < 0.78) {
      const lush = m > 0.34;
      W.life[c] = (lush ? 0.50 : 0.30) + rng() * 0.28;
      W.lifeClass[c] = lush ? 2 : 1;
      continue;
    }

    if (lat < 0.86 && t > 0.20 && t < 0.50 && m > 0.16) {
      W.life[c] = 0.30 + rng() * 0.32;
      W.lifeClass[c] = 1;
      continue;
    }

    if (lat < 0.90 && t > 0.16 && m > 0.12) {
      W.life[c] = 0.08 + rng() * 0.14;
      W.lifeClass[c] = 0;
    }
  }
}
