/** CPU orthographic disc of a world — the picture without a GPU.
 *
 *  Vertex colour is what the globe ships. This splat of sampleLand onto a
 *  48px disc is that colour path, not a shader reimplementation. Metrics
 *  (mean RGB, uniqueness, axis-aligned edge runs) run in Node on every
 *  commit. Headless GL remains a separate command when a GPU is present. */

import { DIR, NC } from '../sphere.js';
import { sampleLand } from './planetLook.js';
import { illuminateRgb, starTeffOf, SUN_TEFF } from './illum.js';

function clampByte(x) {
  const n = x < 0 ? 0 : x > 255 ? 255 : x + 0.5;
  return n | 0;
}

function kindOfWorld(W) {
  return W._planetKind || W.rule?._planetKind || W.rule?.id || 'rocky';
}

/** Cheap land colour at a cell — the same function the globe vertices read. */
export function cellPaintRgb(W, c) {
  const kind = kindOfWorld(W);
  const sea = W.seaLevel || 0;
  const e = (W.h[c] - sea) / (1 - sea + 1e-6);
  const ice = W.ice?.[c] || 0;
  const extra = {
    lat: Math.abs(DIR[c * 3 + 1]),
    x: DIR[c * 3],
    y: DIR[c * 3 + 1],
    z: DIR[c * 3 + 2],
    lava: W.lava?.[c] || 0,
    dust: W.dust?.[c] || 0,
    rock: W.rock?.[c] || 0,
    pSeen: W.pSeen?.[c],
  };
  return sampleLand(kind, e, ice, extra) || [80, 80, 80];
}

/**
 * Orthographic disc looking down +Z. Front-facing cells win a z-buffer.
 * Returns RGBA bytes plus mean colour and axis-aligned edge-run counts.
 */
export function paintDisc(W, size = 48) {
  const rgba = new Uint8Array(size * size * 4);
  const zbuf = new Float32Array(size * size);
  zbuf.fill(-1);
  const teff = starTeffOf(W.rule);
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    if (z <= 0.04) continue;
    const px = ((x * 0.5 + 0.5) * size) | 0;
    const py = ((0.5 - y * 0.5) * size) | 0;
    if (px < 0 || py < 0 || px >= size || py >= size) continue;
    const i = py * size + px;
    if (z < zbuf[i]) continue;
    zbuf[i] = z;
    let col = cellPaintRgb(W, c);
    if (teff !== SUN_TEFF) col = illuminateRgb(col, teff);
    const o = i * 4;
    rgba[o] = clampByte(col[0]);
    rgba[o + 1] = clampByte(col[1]);
    rgba[o + 2] = clampByte(col[2]);
    rgba[o + 3] = 255;
    sr += rgba[o]; sg += rgba[o + 1]; sb += rgba[o + 2];
    n++;
  }
  const mean = n ? [sr / n, sg / n, sb / n] : [0, 0, 0];
  const edges = countEdgeRuns(rgba, size);
  return { rgba, size, mean, filled: n, ...edges };
}

/** Consecutive same-ish pixels on a row or column. Cube seams are straight. */
export function countEdgeRuns(rgba, size, { minRun = 10, maxDe = 10 } = {}) {
  let hRuns = 0, vRuns = 0, hMax = 0, vMax = 0;
  const at = (x, y) => {
    const o = (y * size + x) * 4;
    return rgba[o + 3] < 16 ? null : [rgba[o], rgba[o + 1], rgba[o + 2]];
  };
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= maxDe;

  for (let y = 0; y < size; y++) {
    let run = 0, prev = null;
    for (let x = 0; x < size; x++) {
      const p = at(x, y);
      if (p && prev && close(p, prev)) run++;
      else {
        if (run >= minRun) { hRuns++; if (run > hMax) hMax = run; }
        run = p ? 1 : 0;
      }
      prev = p;
    }
    if (run >= minRun) { hRuns++; if (run > hMax) hMax = run; }
  }
  for (let x = 0; x < size; x++) {
    let run = 0, prev = null;
    for (let y = 0; y < size; y++) {
      const p = at(x, y);
      if (p && prev && close(p, prev)) run++;
      else {
        if (run >= minRun) { vRuns++; if (run > vMax) vMax = run; }
        run = p ? 1 : 0;
      }
      prev = p;
    }
    if (run >= minRun) { vRuns++; if (run > vMax) vMax = run; }
  }
  return { hRuns, vRuns, hMax, vMax, edgeRuns: hRuns + vRuns };
}

export function distRgb(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** CSS colour for a contact-sheet chip. */
export function meanCss(mean) {
  const r = clampByte(mean[0]), g = clampByte(mean[1]), b = clampByte(mean[2]);
  return `rgb(${r},${g},${b})`;
}
