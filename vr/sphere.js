/** Cube-sphere substrate: mapping, neighbours, area weights. */

import { TAU4, clamp } from './math.js';

export const N = 64;
export const NF = N * N;
export const NC = 6 * NF;
export const NV = 6 * (N + 1) * (N + 1);
export const VPF = (N + 1) * (N + 1);

export function warp(s) {
  return s >= 1 ? 1 : s <= -1 ? -1 : Math.tan(s * TAU4);
}

export function facePoint(f, u, v, o) {
  switch (f) {
    case 0: o[0] = 1; o[1] = v; o[2] = -u; break;
    case 1: o[0] = -1; o[1] = v; o[2] = u; break;
    case 2: o[0] = u; o[1] = 1; o[2] = -v; break;
    case 3: o[0] = u; o[1] = -1; o[2] = v; break;
    case 4: o[0] = u; o[1] = v; o[2] = 1; break;
    default: o[0] = -u; o[1] = v; o[2] = -1; break;
  }
  const l = Math.hypot(o[0], o[1], o[2]);
  o[0] /= l; o[1] /= l; o[2] /= l;
  return o;
}

export function dirToCell(x, y, z, n = N) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let f, u, v;
  if (ax >= ay && ax >= az) {
    if (x > 0) { f = 0; u = -z / ax; v = y / ax; }
    else { f = 1; u = z / ax; v = y / ax; }
  } else if (ay >= az) {
    if (y > 0) { f = 2; u = x / ay; v = -z / ay; }
    else { f = 3; u = x / ay; v = z / ay; }
  } else {
    if (z > 0) { f = 4; u = x / az; v = y / az; }
    else { f = 5; u = -x / az; v = y / az; }
  }
  const su = Math.atan(u) / TAU4, sv = Math.atan(v) / TAU4;
  const nf = n * n;
  const i = clamp(Math.floor((su + 1) * 0.5 * n), 0, n - 1);
  const j = clamp(Math.floor((sv + 1) * 0.5 * n), 0, n - 1);
  return f * nf + j * n + i;
}

export function buildNeighbours() {
  const nbr = new Int32Array(NC * 4);
  const p = [0, 0, 0];
  for (let f = 0; f < 6; f++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = f * NF + j * N + i;
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let k = 0; k < 4; k++) {
      const ni = i + steps[k][0], nj = j + steps[k][1];
      if (ni >= 0 && ni < N && nj >= 0 && nj < N) {
        nbr[c * 4 + k] = f * NF + nj * N + ni;
        continue;
      }
      const s = (ni + 0.5) / N * 2 - 1, t = (nj + 0.5) / N * 2 - 1;
      facePoint(f, Math.tan(s * TAU4), Math.tan(t * TAU4), p);
      nbr[c * 4 + k] = dirToCell(p[0], p[1], p[2]);
    }
  }
  return nbr;
}

export function buildAreas() {
  const a = new Float32Array(NC);
  const ds = 2 / N;
  let sum = 0;
  for (let f = 0; f < 6; f++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const s = (i + 0.5) / N * 2 - 1, t = (j + 0.5) / N * 2 - 1;
    const u = Math.tan(s * TAU4), v = Math.tan(t * TAU4);
    const du = TAU4 * (1 + u * u) * ds, dv = TAU4 * (1 + v * v) * ds;
    const w = (du * dv) / Math.pow(1 + u * u + v * v, 1.5);
    a[f * NF + j * N + i] = w;
    sum += w;
  }
  const err = Math.abs(sum - 4 * Math.PI) / (4 * Math.PI);
  console.log(`[orrery] Σ cell area = ${sum.toFixed(6)}  (4π = ${(4 * Math.PI).toFixed(6)}, rel err ${(err * 100).toExponential(2)}%)`);
  const mean = sum / NC;
  let mn = Infinity, mx = 0;
  for (let c = 0; c < NC; c++) {
    const r = a[c] / mean;
    if (r < mn) mn = r;
    if (r > mx) mx = r;
    a[c] = r;
  }
  console.log(`[orrery] cell-area distortion ${mn.toFixed(3)}× … ${mx.toFixed(3)}×`);
  return a;
}

export function buildDirections() {
  const DIR = new Float32Array(NC * 3);
  const p = [0, 0, 0];
  for (let f = 0; f < 6; f++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const s = (i + 0.5) / N * 2 - 1, t = (j + 0.5) / N * 2 - 1;
    facePoint(f, warp(s), warp(t), p);
    const c = f * NF + j * N + i;
    DIR[c * 3] = p[0]; DIR[c * 3 + 1] = p[1]; DIR[c * 3 + 2] = p[2];
  }
  return DIR;
}

export const NBR = buildNeighbours();
export const AREA = buildAreas();
export const DIR = buildDirections();

/** D8-ish: 4 face neighbours + diagonals via 3D step (approx). */
export function buildNbr8() {
  const nbr = new Int32Array(NC * 8);
  const p = [0, 0, 0], q = [0, 0, 0];
  const steps = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  for (let f = 0; f < 6; f++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = f * NF + j * N + i;
    facePoint(f, warp((i + 0.5) / N * 2 - 1), warp((j + 0.5) / N * 2 - 1), p);
    for (let k = 0; k < 8; k++) {
      const ni = i + steps[k][0], nj = j + steps[k][1];
      if (ni >= 0 && ni < N && nj >= 0 && nj < N) {
        nbr[c * 8 + k] = f * NF + nj * N + ni;
        continue;
      }
      // tangent step in cube space then reproject
      const s = (ni + 0.5) / N * 2 - 1, t = (nj + 0.5) / N * 2 - 1;
      facePoint(f, Math.tan(clamp(s, -1.5, 1.5) * TAU4), Math.tan(clamp(t, -1.5, 1.5) * TAU4), q);
      nbr[c * 8 + k] = dirToCell(q[0], q[1], q[2]);
    }
  }
  return nbr;
}

export const NBR8 = buildNbr8();
