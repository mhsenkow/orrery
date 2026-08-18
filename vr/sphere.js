/** Cube-sphere substrate: mapping, neighbours, area weights.
 *  N is runtime-settable via setResolution() — live ES bindings. */

import { TAU4, clamp, lerp } from './math.js';

export let N = 64;
export let NF = N * N;
export let NC = 6 * NF;
export let NV = 6 * (N + 1) * (N + 1);
export let VPF = (N + 1) * (N + 1);

export const N_ALLOWED = [32, 48, 64, 96, 128, 192];

/** Bilinear sample of a per-cell field on cube face f at globe grid (gi, gj) / gn. */
export function sampleFaceField(field, f, gi, gj, gn, n = N) {
  const ci = (gi / gn) * n;
  const cj = (gj / gn) * n;
  const i0 = Math.floor(ci);
  const j0 = Math.floor(cj);
  const fu = ci - i0;
  const fv = cj - j0;
  const i1 = Math.min(i0 + 1, n - 1);
  const j1 = Math.min(j0 + 1, n - 1);
  const at = (i, j) => field[f * n * n + clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)];
  const h00 = at(i0, j0);
  const h10 = at(i1, j0);
  const h01 = at(i0, j1);
  const h11 = at(i1, j1);
  return lerp(lerp(h00, h10, fu), lerp(h01, h11, fu), fv);
}

/** Cell index on cube face grid, or -1 if out of range. */
export function cellAtFace(f, ci, cj, n = N) {
  if (ci < 0 || ci >= n || cj < 0 || cj >= n) return -1;
  return f * n * n + cj * n + ci;
}

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

function buildNeighbours() {
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

function buildAreas() {
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
  console.log(`[orrery] N=${N} Σ area = ${sum.toFixed(6)}  (rel err ${(err * 100).toExponential(2)}%)`);
  const mean = sum / NC;
  let mn = Infinity, mx = 0;
  for (let c = 0; c < NC; c++) {
    const r = a[c] / mean;
    if (r < mn) mn = r;
    if (r > mx) mx = r;
    a[c] = r;
  }
  return a;
}

function buildDirections() {
  const dir = new Float32Array(NC * 3);
  const p = [0, 0, 0];
  for (let f = 0; f < 6; f++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const s = (i + 0.5) / N * 2 - 1, t = (j + 0.5) / N * 2 - 1;
    facePoint(f, warp(s), warp(t), p);
    const c = f * NF + j * N + i;
    dir[c * 3] = p[0]; dir[c * 3 + 1] = p[1]; dir[c * 3 + 2] = p[2];
  }
  return dir;
}

function buildNbr8() {
  const nbr = new Int32Array(NC * 8);
  const p = [0, 0, 0], q = [0, 0, 0];
  const steps = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  for (let f = 0; f < 6; f++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = f * NF + j * N + i;
    for (let k = 0; k < 8; k++) {
      const ni = i + steps[k][0], nj = j + steps[k][1];
      if (ni >= 0 && ni < N && nj >= 0 && nj < N) {
        nbr[c * 8 + k] = f * NF + nj * N + ni;
        continue;
      }
      const s = (ni + 0.5) / N * 2 - 1, t = (nj + 0.5) / N * 2 - 1;
      facePoint(f, Math.tan(clamp(s, -1.5, 1.5) * TAU4), Math.tan(clamp(t, -1.5, 1.5) * TAU4), q);
      nbr[c * 8 + k] = dirToCell(q[0], q[1], q[2]);
    }
  }
  return nbr;
}

function buildBasis() {
  const east = new Float32Array(NC * 3);
  const north = new Float32Array(NC * 3);
  for (let c = 0; c < NC; c++) {
    const ux = DIR[c * 3], uy = DIR[c * 3 + 1], uz = DIR[c * 3 + 2];
    // east = normalize(up × Ŷ); near the poles Ŷ is parallel to up so fall back to X̂
    let ex = -uz, ey = 0, ez = ux;
    let el = Math.hypot(ex, ey, ez);
    if (el < 1e-4) {
      ex = 0; ey = uz; ez = -uy;
      el = Math.hypot(ex, ey, ez) || 1;
    }
    ex /= el; ey /= el; ez /= el;
    // north = up × east
    let nx = uy * ez - uz * ey;
    let ny = uz * ex - ux * ez;
    let nz = ux * ey - uy * ex;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    east[c * 3] = ex; east[c * 3 + 1] = ey; east[c * 3 + 2] = ez;
    north[c * 3] = nx; north[c * 3 + 1] = ny; north[c * 3 + 2] = nz;
  }
  return { east, north };
}

export let NBR = buildNeighbours();
export let AREA = buildAreas();
export let DIR = buildDirections();
export let NBR8 = buildNbr8();
let _basis = buildBasis();
export let EAST = _basis.east;
export let NORTH = _basis.north;

/** Rebuild topology for a new face resolution. Call before generate/remesh. */
export function setResolution(n) {
  const nn = N_ALLOWED.includes(n) ? n : 64;
  if (nn === N && NBR && NBR.length === NC * 4) return { N, NC, NF, NV };
  N = nn;
  NF = N * N;
  NC = 6 * NF;
  NV = 6 * (N + 1) * (N + 1);
  VPF = (N + 1) * (N + 1);
  NBR = buildNeighbours();
  AREA = buildAreas();
  DIR = buildDirections();
  NBR8 = buildNbr8();
  _basis = buildBasis();
  EAST = _basis.east;
  NORTH = _basis.north;
  return { N, NC, NF, NV };
}

/** ~km across a cell at Earth radius. */
export function cellKm(n = N) {
  return (40075 / (n * 4)).toFixed(0); // rough equator / (4N) faces
}
