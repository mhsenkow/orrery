/** Layered ocean proxy — surface / thermocline / deep.
 *  Next backlog ocean3d foundation. */

import { NC, DIR, AREA } from '../sphere.js';
import { clamp } from '../math.js';

export function initOcean(W) {
  W.oceanSurf = new Float32Array(NC); // temperature proxy
  W.oceanDeep = new Float32Array(NC);
  W.oceanSalt = new Float32Array(NC);
  W.upwell = new Float32Array(NC);
  W.conveyor = W.conveyor ?? 1; // 1 on, 0 collapsed
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) {
      W.oceanSurf[c] = W.temp[c];
      W.oceanDeep[c] = 0.28;
      W.oceanSalt[c] = 0.35;
    }
  }
}

/** Wind-divergence upwelling + simple conveyor. */
export function oceanTick(W) {
  if (!W.oceanSurf) initOcean(W);
  const sea = W.seaLevel;
  let freshPulse = 0;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= sea) {
      W.upwell[c] = 0;
      continue;
    }
    // Divergence proxy from wind
    const u = W.windU?.[c] || 0, v = W.windV?.[c] || 0;
    const lat = DIR[c * 3 + 1];
    // Equatorial / eastern-boundary-ish upwelling
    const div = Math.abs(u) * 0.4 + (Math.abs(lat) < 0.15 ? 0.35 : 0);
    W.upwell[c] = clamp(div * (0.5 + (1 - Math.abs(lat))), 0, 1);

    // Surface warms toward air; deep mixes slowly
    W.oceanSurf[c] += (W.temp[c] - W.oceanSurf[c]) * 0.08;
    const mix = 0.01 + W.upwell[c] * 0.06 * W.conveyor;
    W.oceanSurf[c] = W.oceanSurf[c] * (1 - mix) + W.oceanDeep[c] * mix;
    W.oceanDeep[c] += (0.25 - W.oceanDeep[c]) * 0.002;

    // Freshening from ice melt / precip
    if ((W.iceSea?.[c] || 0) < 0.1 && (W.precip?.[c] || 0) > 0.5) {
      W.oceanSalt[c] *= 0.998;
      freshPulse += AREA[c];
    } else {
      W.oceanSalt[c] = clamp(W.oceanSalt[c] + 0.0002, 0.05, 0.8);
    }

    // Nutrients from upwelling → NPP boost hook
    if (W.nutrientP && W.upwell[c] > 0.3) {
      W.nutrientP[c] = Math.min(1, (W.nutrientP[c] || 0) + W.upwell[c] * 0.02);
    }
  }

  // Conveyor collapse if high-latitude freshening (AMOC toy)
  if (freshPulse > NC * 0.002 && W.conveyor > 0.2) {
    W.conveyor = Math.max(0, W.conveyor - 0.02);
    W._conveyorNote = 'overturning weakening';
  } else if (W.conveyor < 1) {
    W.conveyor = Math.min(1, W.conveyor + 0.001);
  }
}
