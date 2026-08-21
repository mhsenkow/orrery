/** Shared tangent-frame operators. Currents backlog `vecop`. */

import { NBR, NBR_E, NBR_N, NBR_IWE, NBR_IWN, AREA } from '../sphere.js';

/** Tangent neighbour. Reuses one slot — copy fields out, do not hold the object.
 *  Internal now: `NBR_E` / `NBR_N` / `NBR_CHORD` on `sphere.js` are precomputed,
 *  so a tick loop should index those directly rather than come through here. */
const _en = { nb: 0, e: 0, n: 0 };

function neighbourEN(c, k) {
  const i = c * 4 + k;
  _en.nb = NBR[i];
  _en.e = NBR_E[i];
  _en.n = NBR_N[i];
  return _en;
}

/**
 * Geographic gradient of a scalar → (east, north), per planet radius.
 *
 * Was area-weighted and divided by the summed area, which returns the gradient
 * multiplied by the square of the cell width — a number that shrinks as 1/N² as
 * resolution rises, and is not a gradient in any unit. Least squares through the
 * four neighbours is the same arithmetic and is exact for a linear field; the
 * weights are static geometry, precomputed on `sphere.js`. Same fix as the
 * operators in `swe.js`, which is where this one's twin used to live.
 */
export function gradEN(field, c) {
  let de = 0, dn = 0;
  for (let k = 0; k < 4; k++) {
    const { nb, e, n } = neighbourEN(c, k);
    const d = field[nb] - field[c];
    de += d * e;
    dn += d * n;
  }
  return [de * NBR_IWE[c], dn * NBR_IWN[c]];
}

/** Area-weighted neighbour mean — stops cube-sphere diffusion pumping toward face centres. */
export function neighbourMean(field, c) {
  let sum = 0, w = 0;
  for (let k = 0; k < 4; k++) {
    const nb = NBR[c * 4 + k];
    const a = AREA[nb] || 1;
    sum += field[nb] * a;
    w += a;
  }
  return w > 0 ? sum / w : field[c];
}





/** Most upwind of the four neighbours. Called per sea cell per advected field,
 *  so it reads the precomputed tangent arrays rather than going via
 *  `neighbourEN`. */
export function upwindNeighbour(c, u, v) {
  const b4 = c * 4;
  let best = NBR[b4], bestAlong = 1;
  for (let k = 0; k < 4; k++) {
    const i = b4 + k;
    const along = u * NBR_E[i] + v * NBR_N[i];
    if (along < bestAlong) { bestAlong = along; best = NBR[i]; }
  }
  return best;
}
