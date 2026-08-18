/** Shared tangent-frame operators. Currents backlog `vecop`. */

import { NBR, DIR, EAST, NORTH, AREA } from '../sphere.js';

export function neighbourEN(c, k) {
  const nb = NBR[c * 4 + k];
  const dx = DIR[nb * 3] - DIR[c * 3];
  const dy = DIR[nb * 3 + 1] - DIR[c * 3 + 1];
  const dz = DIR[nb * 3 + 2] - DIR[c * 3 + 2];
  return {
    nb,
    e: dx * EAST[c * 3] + dy * EAST[c * 3 + 1] + dz * EAST[c * 3 + 2],
    n: dx * NORTH[c * 3] + dy * NORTH[c * 3 + 1] + dz * NORTH[c * 3 + 2],
  };
}

/** Geographic gradient of a scalar → (east, north). Area-weighted. */
export function gradEN(field, c) {
  let de = 0, dn = 0, w = 0;
  for (let k = 0; k < 4; k++) {
    const { nb, e, n } = neighbourEN(c, k);
    const a = AREA[nb] || 1;
    const d = field[nb] - field[c];
    de += d * e * a;
    dn += d * n * a;
    w += a;
  }
  const s = w > 0 ? 1 / w : 0.25;
  return [de * s, dn * s];
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

/** Divergence of a geographic vector pair. Area-weighted; scale matches the old 4-neighbour sum. */
export function divUV(uArr, vArr, c) {
  let s = 0, w = 0;
  for (let k = 0; k < 4; k++) {
    const nb = NBR[c * 4 + k];
    const an = AREA[nb] || 1;
    s += ((uArr[nb] - uArr[c]) + (vArr[nb] - vArr[c])) * an;
    w += an;
  }
  return w > 0 ? (s * 4) / w : 0;
}

/** Stress-curl sketch in the tangent frame. */
export function curlTau(tauE, tauN, c) {
  let curl = 0;
  for (let k = 0; k < 4; k++) {
    const { nb, e, n } = neighbourEN(c, k);
    curl += (tauN[nb] - tauN[c]) * e - (tauE[nb] - tauE[c]) * n;
  }
  return curl;
}

export function eastNeighbour(c) {
  let best = NBR[c * 4], bestE = -1;
  for (let k = 0; k < 4; k++) {
    const { nb, e } = neighbourEN(c, k);
    if (e > bestE) { bestE = e; best = nb; }
  }
  return best;
}

export function westNeighbour(c) {
  let best = NBR[c * 4], bestE = 1;
  for (let k = 0; k < 4; k++) {
    const { nb, e } = neighbourEN(c, k);
    if (e < bestE) { bestE = e; best = nb; }
  }
  return best;
}

export function upwindNeighbour(c, u, v) {
  let best = NBR[c * 4], bestAlong = 1;
  for (let k = 0; k < 4; k++) {
    const { nb, e, n } = neighbourEN(c, k);
    const along = u * e + v * n;
    if (along < bestAlong) { bestAlong = along; best = nb; }
  }
  return best;
}
