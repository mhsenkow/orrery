/** Per-cell material stack: a history, not a recipe.
 *
 *  Fixed eight layers of (material byte, thickness metres). At N=96 that is
 *  49 bytes a cell — 2.58 MB at N=96 — which is the budget this file is written to.
 *  Index 0 is the surface. The column recipe stamps the initial condition;
 *  erode / deposit / weather / compact / melt / intrude then change it.
 *  W.substrate is derived from layer zero after every write. */

import { NC } from '../sphere.js';
import { SUBSTRATES, SUB_INDEX, EARTH_ROCK_COUNT } from './substrates.js';
import { COLUMN_BY_ID, COLUMN_LAYERS } from './columnTable.js';

const LAYER_INDEX = Object.freeze(Object.fromEntries(
  COLUMN_LAYERS.map((L, i) => [L.id, i]),
));

export const STACK_DEPTH = 8;
export const STACK_EMPTY = 255;
/** One material byte + one float32 metres, times depth, plus a count byte. */
export const STACK_BYTES_PER_CELL = STACK_DEPTH * 6 + 1;
export const STACK_BUDGET_N96 = 96 * 96 * 6 * STACK_BYTES_PER_CELL;

const HEIGHT_M = 10000;
const MAX_MOVE_M = 80;
const MIN_M = 0.002;

function finite(x) { return typeof x === 'number' && Number.isFinite(x); }

export function stackBytes(n) {
  return n * STACK_BYTES_PER_CELL;
}

function at(c, i) {
  return c * STACK_DEPTH + i;
}

export function allocStack(W, n = W?.h?.length || NC) {
  const need = n * STACK_DEPTH;
  if (!W.stackMat || W.stackMat.length !== need) {
    W.stackMat = new Uint8Array(need);
    W.stackSrc = new Uint8Array(need);
    W.stackM = new Float32Array(need);
    W.stackN = new Uint8Array(n);
  }
  W.stackMat.fill(STACK_EMPTY);
  W.stackSrc.fill(STACK_EMPTY);
  W.stackM.fill(0);
  W.stackN.fill(0);
  return W;
}

function pushTop(W, c, mat, metres) {
  const n = W.stackN[c];
  if (n >= STACK_DEPTH) mergeBottom(W, c);
  const n2 = W.stackN[c];
  for (let i = n2; i > 0; i--) {
    W.stackMat[at(c, i)] = W.stackMat[at(c, i - 1)];
    W.stackM[at(c, i)] = W.stackM[at(c, i - 1)];
    if (W.stackSrc) W.stackSrc[at(c, i)] = W.stackSrc[at(c, i - 1)];
  }
  W.stackMat[at(c, 0)] = mat;
  W.stackM[at(c, 0)] = metres;
  if (W.stackSrc) W.stackSrc[at(c, 0)] = STACK_EMPTY;
  W.stackN[c] = n2 + 1;
}

function dropTop(W, c) {
  const n = W.stackN[c];
  if (n <= 0) return;
  for (let i = 0; i < n - 1; i++) {
    W.stackMat[at(c, i)] = W.stackMat[at(c, i + 1)];
    W.stackM[at(c, i)] = W.stackM[at(c, i + 1)];
    if (W.stackSrc) W.stackSrc[at(c, i)] = W.stackSrc[at(c, i + 1)];
  }
  W.stackMat[at(c, n - 1)] = STACK_EMPTY;
  W.stackM[at(c, n - 1)] = 0;
  if (W.stackSrc) W.stackSrc[at(c, n - 1)] = STACK_EMPTY;
  W.stackN[c] = n - 1;
}

function mergeBottom(W, c) {
  const n = W.stackN[c];
  if (n < 2) return;
  const a = n - 2;
  const b = n - 1;
  if (W.stackMat[at(c, a)] === W.stackMat[at(c, b)]) {
    W.stackM[at(c, a)] += W.stackM[at(c, b)];
  } else {
    W.stackM[at(c, a)] += W.stackM[at(c, b)];
  }
  W.stackMat[at(c, b)] = STACK_EMPTY;
  W.stackM[at(c, b)] = 0;
  if (W.stackSrc) W.stackSrc[at(c, b)] = STACK_EMPTY;
  W.stackN[c] = n - 1;
}

export function stackTop(W, c) {
  if (!W?.stackN || !W.stackN[c]) return STACK_EMPTY;
  return W.stackMat[at(c, 0)];
}

export function syncSubstrateCell(W, c) {
  const top = stackTop(W, c);
  if (top === STACK_EMPTY || !W.substrate) return;
  W.substrate[c] = top;
}

export function syncSubstrate(W) {
  if (!W?.stackN || !W.substrate) return;
  const n = W.stackN.length;
  for (let c = 0; c < n; c++) syncSubstrateCell(W, c);
}

/** Erode takes from the top. Never removes the last layer. Returns metres peeled. */
export function erodeStack(W, c, metres) {
  if (!W?.stackN || !(metres > 0) || !W.stackN[c]) return 0;
  let left = metres;
  let peeled = 0;
  while (left > MIN_M && W.stackN[c] > 1) {
    const topM = W.stackM[at(c, 0)];
    if (topM <= left) {
      left -= topM;
      peeled += topM;
      dropTop(W, c);
    } else {
      W.stackM[at(c, 0)] = topM - left;
      peeled += left;
      left = 0;
    }
  }
  return peeled;
}

/** Deposit adds to the top. Same material merges. Returns metres added. */
export function depositStack(W, c, mat, metres) {
  if (!W?.stackN || !(metres > 0) || mat == null || mat === STACK_EMPTY) return 0;
  const i = mat & 255;
  if (W.stackN[c] > 0 && W.stackMat[at(c, 0)] === i) {
    W.stackM[at(c, 0)] += metres;
    return metres;
  }
  if (W.stackN[c] === 0) {
    W.stackMat[at(c, 0)] = i;
    W.stackM[at(c, 0)] = metres;
    if (W.stackSrc) W.stackSrc[at(c, 0)] = STACK_EMPTY;
    W.stackN[c] = 1;
    return metres;
  }
  pushTop(W, c, i, metres);
  return metres;
}

/** Weather transforms the top layer in place. */
export function weatherStack(W, c, newMat) {
  if (!W?.stackN || !W.stackN[c] || newMat == null) return false;
  W.stackMat[at(c, 0)] = newMat & 255;
  return true;
}

/** Compact reduces every thickness. */
export function compactStack(W, c, factor) {
  if (!W?.stackN || !W.stackN[c] || !(factor > 0)) return;
  const k = factor < 1 ? factor : 1 / factor;
  const n = W.stackN[c];
  for (let i = 0; i < n; i++) W.stackM[at(c, i)] *= k;
}

/** Melt removes from the top (same as erode) and returns the material taken. */
export function meltStack(W, c, metres) {
  const mat = stackTop(W, c);
  const peeled = erodeStack(W, c, metres);
  return { mat, metres: peeled };
}

/** Intrude inserts a layer at a depth in metres from the surface. */
export function intrudeStack(W, c, mat, metres, depthM) {
  if (!W?.stackN || !(metres > 0) || mat == null) return false;
  const i = mat & 255;
  const n = W.stackN[c];
  if (n === 0 || !(depthM > 0)) {
    depositStack(W, c, i, metres);
    return true;
  }
  let acc = 0;
  let slot = n;
  for (let k = 0; k < n; k++) {
    acc += W.stackM[at(c, k)];
    if (acc >= depthM) { slot = k + 1; break; }
  }
  if (n >= STACK_DEPTH) mergeBottom(W, c);
  const n2 = W.stackN[c];
  const atSlot = Math.min(slot, n2);
  for (let k = n2; k > atSlot; k--) {
    W.stackMat[at(c, k)] = W.stackMat[at(c, k - 1)];
    W.stackM[at(c, k)] = W.stackM[at(c, k - 1)];
    if (W.stackSrc) W.stackSrc[at(c, k)] = W.stackSrc[at(c, k - 1)];
  }
  W.stackMat[at(c, atSlot)] = i;
  W.stackM[at(c, atSlot)] = metres;
  if (W.stackSrc) W.stackSrc[at(c, atSlot)] = STACK_EMPTY;
  W.stackN[c] = n2 + 1;
  return true;
}

export function stackAt(W, c = 0) {
  if (!W?.stackN || !W.stackN[c]) return [];
  const out = [];
  let topM = 0;
  const n = W.stackN[c];
  for (let i = 0; i < n; i++) {
    const mat = W.stackMat[at(c, i)];
    const m = W.stackM[at(c, i)];
    const src = W.stackSrc?.[at(c, i)] ?? STACK_EMPTY;
    const col = src !== STACK_EMPTY ? COLUMN_LAYERS[src] : null;
    const row = SUBSTRATES[mat];
    out.push({
      mat,
      id: col?.id || row?.id || `mat${mat}`,
      name: col?.name || row?.name || `mat ${mat}`,
      rgb: col?.rgb || row?.rgb || [80, 80, 80],
      metres: m,
      topM,
      topKm: topM / 1000,
      depthKm: m / 1000,
    });
    topM += m;
  }
  return out;
}

export function stackMeanLayers(W) {
  if (!W?.stackN) return 0;
  let s = 0;
  const n = W.stackN.length;
  for (let c = 0; c < n; c++) s += W.stackN[c];
  return n ? s / n : 0;
}

function idxOf(id) {
  const i = SUB_INDEX[id];
  return i == null ? 0 : i;
}

function depthKmOf(spec, W, cell) {
  let km = spec.depthKm;
  if (spec.vary === 'lid') {
    const lid = W.shellLid?.[cell];
    km = spec.depthKm * ((lid ?? 0.55) / 0.55);
  } else if (spec.vary === 'ocean') {
    const base = W._oceanKm > 0 ? W._oceanKm : spec.depthKm;
    const o = W.shellOcean?.[cell];
    km = o != null ? base * (o / 0.7) : base;
  }
  return km < 0 ? 0 : km;
}

function includeSpec(spec, W) {
  if (spec.when === 'hpIce' && !W._hpIceFloor) return false;
  if (spec.when === 'clathrate' && !((W._clathrate || 0) > 0.05)) return false;
  return true;
}

function stampRecipeCell(W, c, rec) {
  if (!rec || rec.noSurface) return;
  let n = 0;
  for (const spec of rec.layers) {
    if (!includeSpec(spec, W)) continue;
    const row = COLUMN_BY_ID[spec.id];
    if (!row) continue;
    const km = depthKmOf(spec, W, c);
    const metres = Math.max(MIN_M, km * 1000);
    const mat = row.substrate ? idxOf(row.substrate) : 0;
    if (n >= STACK_DEPTH) break;
    W.stackMat[at(c, n)] = mat;
    W.stackM[at(c, n)] = metres;
    if (W.stackSrc) {
      const si = LAYER_INDEX[spec.id];
      W.stackSrc[at(c, n)] = si == null ? STACK_EMPTY : si;
    }
    n++;
  }
  W.stackN[c] = n;
}

function stampEarthCell(W, c) {
  let rock = W.rock?.[c] ?? 0;
  if (rock >= EARTH_ROCK_COUNT) rock = 0;
  const ice = (W.ice?.[c] || 0) > 0.45 && W.h[c] >= (W.seaLevel || 0);
  W.stackMat[at(c, ice ? 1 : 0)] = rock;
  W.stackM[at(c, ice ? 1 : 0)] = 35000;
  if (ice) {
    W.stackMat[at(c, 0)] = idxOf('waterIce');
    W.stackM[at(c, 0)] = 80;
    W.stackN[c] = 2;
  } else {
    W.stackN[c] = 1;
  }
}

/** Stamp the stack from the recipe (or Earth rock). Then overlay lava. */
export function stampStack(W) {
  const n = W.h?.length || NC;
  allocStack(W, n);
  const rec = W._columnRecipe;
  const earth = !!(W.rule?.earthLike || W.rule?.daisyworld);
  if (earth) {
    for (let c = 0; c < n; c++) stampEarthCell(W, c);
  } else if (rec?.noSurface) {
    // empty on purpose
  } else if (rec) {
    for (let c = 0; c < n; c++) stampRecipeCell(W, c, rec);
  } else {
    const bed = idxOf(W._substrateBedrock || 'basalt');
    for (let c = 0; c < n; c++) {
      W.stackMat[at(c, 0)] = W.substrate?.[c] ?? bed;
      W.stackM[at(c, 0)] = 35000;
      W.stackN[c] = 1;
    }
  }

  const sil = idxOf('silicate');
  if (W.lava && !earth) {
    for (let c = 0; c < n; c++) {
      if ((W.lava[c] || 0) > 0.12 && W.stackN[c] > 0) {
        depositStack(W, c, sil, 12);
      }
    }
  }

  // Cover that stampSubstrate already chose, if it is not the recipe top.
  if (W.substrate && !earth && rec && !rec.noSurface) {
    for (let c = 0; c < n; c++) {
      const want = W.substrate[c];
      const top = stackTop(W, c);
      if (want !== top && want !== STACK_EMPTY && W.stackN[c] > 0) {
        depositStack(W, c, want, 4);
      }
    }
  }

  syncSubstrate(W);
  W._stackMean = stackMeanLayers(W);
  let live = false;
  for (let c = 0; c < n; c++) {
    if (W.stackN[c]) { live = true; break; }
  }
  W._stackLive = live;
  return rec;
}

/** Height-field delta → metres of stack. Caps so a tick cannot bury the column. */
export function heightToMetres(dh) {
  if (!finite(dh) || !(dh > 0)) return 0;
  const m = dh * HEIGHT_M;
  return m > MAX_MOVE_M ? MAX_MOVE_M : m;
}

export function formatStackAt(W, c = 0) {
  const layers = stackAt(W, c);
  if (!layers.length) return '';
  return layers.map((L) => {
    const m = L.metres;
    const d = m >= 1000 ? `${(m / 1000) >= 20 ? (m / 1000).toFixed(0) : (m / 1000).toFixed(1)} km`
      : m >= 1 ? `${Math.round(m)} m`
      : `${Math.max(1, Math.round(m * 1000))} mm`;
    return `${L.name} ${d}`;
  }).join(' · ');
}

function btoaU8(src) {
  if (!src || !src.length) return '';
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < src.length; i += CH) {
    s += String.fromCharCode.apply(null, src.subarray(i, i + CH));
  }
  return btoa(s);
}

function atobU8(b64) {
  if (!b64) return new Uint8Array(0);
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/** Metres as little-endian uint16. 65 km ceiling covers ice lids; sub-metre rounds to 1. */
export function packStack(W) {
  if (!W?.stackN?.length) return null;
  const m16 = new Uint16Array(W.stackM.length);
  for (let i = 0; i < W.stackM.length; i++) {
    const v = Math.round(W.stackM[i]);
    m16[i] = v < 0 ? 0 : v > 65535 ? 65535 : v;
  }
  return {
    cells: W.stackN.length,
    depth: STACK_DEPTH,
    n: btoaU8(W.stackN),
    mat: btoaU8(W.stackMat),
    src: W.stackSrc ? btoaU8(W.stackSrc) : '',
    m: btoaU8(new Uint8Array(m16.buffer, m16.byteOffset, m16.byteLength)),
  };
}

export function unpackStack(W, packed) {
  if (!packed?.n || !W) return W;
  const n = packed.cells || W.h?.length || NC;
  allocStack(W, n);
  const sn = atobU8(packed.n);
  const mat = atobU8(packed.mat);
  const src = packed.src ? atobU8(packed.src) : null;
  const m8 = atobU8(packed.m);
  const take = Math.min(W.stackN.length, sn.length);
  W.stackN.set(sn.subarray(0, take));
  const layers = Math.min(W.stackMat.length, mat.length);
  W.stackMat.set(mat.subarray(0, layers));
  if (src && W.stackSrc) W.stackSrc.set(src.subarray(0, Math.min(W.stackSrc.length, src.length)));
  const mCount = Math.min(W.stackM.length, (m8.length / 2) | 0);
  for (let i = 0; i < mCount; i++) {
    const metres = m8[i * 2] | (m8[i * 2 + 1] << 8);
    W.stackM[i] = metres;
  }
  let live = false;
  for (let c = 0; c < take; c++) {
    if (W.stackN[c]) { live = true; break; }
  }
  W._stackLive = live;
  syncSubstrate(W);
  return W;
}
