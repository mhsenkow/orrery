/** Post-process Earth hypsometry — continental structure, shelves, ranges, abyss. */

import { clamp, lerp, fbm, ridged } from '../math.js';
import { NC, NBR, DIR } from '../sphere.js';
import { naturalizeHypsometry } from './terrainShape.js';

const CONV = 1;
const DIV = 0;

/** Shape elevation after plate isostasy so coastlines and relief read like Earth. */
export function refineEarthHypsometry(W, seed, rule) {
  if (!rule?.earthLike) return;
  const { h, bound, age, plateId, plates, strain } = W;

  for (let c = 0; c < NC; c++) {
    const pl = plates[plateId[c]];
    const oceanic = pl.oceanic;
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    let elev = h[c];

    if (!oceanic) {
      const macro = fbm(x * 1.15, y * 1.15, z * 1.15, seed ^ 0x4e617468, 4, 2, 0.52);
      elev += (macro - 0.48) * 0.14;
      const craton = ridged(x * 2.2, y * 2.2, z * 2.2, seed ^ 0x63726174, 3);
      if (age[c] > 400 && craton > 0.55) elev += (craton - 0.55) * 0.12;
    }

    if (bound[c] === CONV && !oceanic) {
      elev += 0.06 + (strain?.[c] || 0) * 0.18;
      elev += ridged(x * 8, y * 8, z * 8, seed + c, 2) * 0.04;
    } else if (bound[c] === CONV && oceanic) {
      elev -= 0.05;
    }

    if (oceanic) {
      if (bound[c] === DIV) elev += 0.025;
      elev -= clamp((age[c] - 40) / 320, 0, 1) * 0.06;
    }

    elev += (fbm(x * 5, y * 5, z * 5, seed ^ 0x636f6173, 3, 2, 0.5) - 0.5) * (oceanic ? 0.04 : 0.07);
    h[c] = clamp(elev, -1.2, 1.2);
  }

  const sl = W.seaLevel ?? 0;
  const shelfEps = 0.03;
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 0; c < NC; c++) {
      const pl = plates[plateId[c]];
      let elev = h[c];
      if (!pl.oceanic && elev > sl - shelfEps) {
        let seaN = 0;
        for (let k = 0; k < 4; k++) if (h[NBR[c * 4 + k]] < sl + shelfEps) seaN++;
        if (seaN) elev -= 0.015 * seaN;
      } else if (elev < sl + shelfEps) {
        let landN = 0;
        for (let k = 0; k < 4; k++) {
          const n = NBR[c * 4 + k];
          if (h[n] > sl - shelfEps && !plates[plateId[n]].oceanic) landN++;
        }
        if (landN) elev = Math.max(elev, sl - 0.06 - 0.03 * (4 - landN));
      }
      h[c] = clamp(elev, -1.2, 1.2);
    }
  }

  naturalizeHypsometry(W, seed, { seaLevel: W.seaLevel, coastAmp: 0.13, macroAmp: 0.08, passes: 4, band: 0.3 });
  paintContinentalShelf(W);
}

/** A shallow terrace oceanward of the coast — the missing hypsometric shoulder.
 *  Painted after naturalize so Laplacian blending cannot flatten it back into a cliff. */
function paintContinentalShelf(W) {
  const sl = W.seaLevel ?? 0;
  const dist = new Int16Array(NC);
  dist.fill(99);
  const q = [];
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < sl) continue;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (n >= 0 && W.h[n] < sl && dist[n] > 0) {
        dist[n] = 0;
        q.push(n);
      }
    }
  }
  let qi = 0;
  while (qi < q.length) {
    const c = q[qi++];
    if (dist[c] >= 3) continue;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (n >= 0 && W.h[n] < sl && dist[n] > dist[c] + 1) {
        dist[n] = dist[c] + 1;
        q.push(n);
      }
    }
  }
  for (let c = 0; c < NC; c++) {
    if (dist[c] > 3) continue;
    const t = dist[c] / 3;
    const shelf = sl - 0.016 - t * 0.055;
    if (W.h[c] < shelf) W.h[c] = lerp(W.h[c], shelf, 0.7);
    else if (W.h[c] < sl) W.h[c] = lerp(W.h[c], shelf, 0.3);
  }
}
