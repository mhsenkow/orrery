/** Marching squares on the cube-sphere height field.
 *  Sea-level contour as line segments, stitched across faces via cellAt. */

import { N, NC, DIR, cellAt, cellSizeKm } from '../sphere.js';

/** Edge pairs for the 16 marching-squares cases. Corners: 0 SW, 1 SE, 2 NE, 3 NW. */
const CASES = [
  [],
  [[0, 3]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [[0, 3], [1, 2]],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [[0, 1], [2, 3]],
  [[1, 2]],
  [[1, 3]],
  [[0, 1]],
  [[0, 3]],
  [],
];
const EDGE_CORNERS = [[0, 1], [1, 2], [2, 3], [3, 0]];
const CORNER_XY = [[0, 0], [1, 0], [1, 1], [0, 1]];

function edgeT(h0, h1, level) {
  const t = (level - h0) / ((h1 - h0) || 1e-9);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Unit-square contour segments for one 2×2 of samples. Corners: SW, SE, NE, NW. */
export function squareSegments(h0, h1, h2, h3, level) {
  const hs = [h0, h1, h2, h3];
  let bits = 0;
  for (let k = 0; k < 4; k++) if (hs[k] >= level) bits |= 1 << k;
  const segs = CASES[bits];
  const out = [];
  for (let s = 0; s < segs.length; s++) {
    const e0 = segs[s][0], e1 = segs[s][1];
    for (const e of [e0, e1]) {
      const a = EDGE_CORNERS[e][0], b = EDGE_CORNERS[e][1];
      const u = edgeT(hs[a], hs[b], level);
      out.push(
        CORNER_XY[a][0] + (CORNER_XY[b][0] - CORNER_XY[a][0]) * u,
        CORNER_XY[a][1] + (CORNER_XY[b][1] - CORNER_XY[a][1]) * u,
      );
    }
  }
  return out;
}

function lerpDir(c0, c1, h0, h1, level, out, o) {
  const t = (level - h0) / ((h1 - h0) || 1e-9);
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  let x = DIR[c0 * 3] + (DIR[c1 * 3] - DIR[c0 * 3]) * u;
  let y = DIR[c0 * 3 + 1] + (DIR[c1 * 3 + 1] - DIR[c0 * 3 + 1]) * u;
  let z = DIR[c0 * 3 + 2] + (DIR[c1 * 3 + 2] - DIR[c0 * 3 + 2]) * u;
  const l = Math.hypot(x, y, z) || 1;
  const lift = 1.004;
  out[o] = (x / l) * lift;
  out[o + 1] = (y / l) * lift;
  out[o + 2] = (z / l) * lift;
}

/**
 * Rebuild W.coastLine (xyz xyz per segment) at sea level.
 * Returns vertex count for gl.LINES.
 */
export function updateIsoline(W) {
  const { h, seaLevel } = W;
  const maxFloats = 6 * N * N * 2 * 6;
  if (!W.coastLine || W.coastLine.length < maxFloats) W.coastLine = new Float32Array(maxFloats);
  const out = W.coastLine;
  const level = seaLevel;
  const corners = [0, 0, 0, 0];
  let m = 0;
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        corners[0] = cellAt(f, i, j);
        corners[1] = cellAt(f, i + 1, j);
        corners[2] = cellAt(f, i + 1, j + 1);
        corners[3] = cellAt(f, i, j + 1);
        let bits = 0;
        for (let k = 0; k < 4; k++) {
          if (h[corners[k]] >= level) bits |= 1 << k;
        }
        if (bits === 0 || bits === 15) continue;
        const segs = CASES[bits];
        for (let s = 0; s < segs.length; s++) {
          const e0 = segs[s][0], e1 = segs[s][1];
          const a0 = EDGE_CORNERS[e0][0], a1 = EDGE_CORNERS[e0][1];
          const b0 = EDGE_CORNERS[e1][0], b1 = EDGE_CORNERS[e1][1];
          lerpDir(corners[a0], corners[a1], h[corners[a0]], h[corners[a1]], level, out, m);
          lerpDir(corners[b0], corners[b1], h[corners[b0]], h[corners[b1]], level, out, m + 3);
          m += 6;
        }
      }
    }
  }
  W.coastCount = m / 3;
  W._isoTick = W._tickIndex || 0;
  W._isoSea = seaLevel;
  return W.coastCount;
}

/** Drain-tree polylines for cells with real discharge. Vertex count for gl.LINES. */
export function fillRiverLines(W, out, maxSegs = 4000) {
  const { h, seaLevel, flow, drainTo } = W;
  if (!flow || !drainTo) return 0;
  const scored = [];
  for (let c = 0; c < NC; c++) {
    if (h[c] < seaLevel) continue;
    const f = flow[c] || 0;
    if (f < 0.22) continue;
    const d = drainTo[c];
    if (d < 0) continue;
    scored.push(c);
  }
  scored.sort((a, b) => flow[b] - flow[a]);
  const n = Math.min(scored.length, maxSegs);
  let m = 0;
  const lift = 1.0035;
  for (let i = 0; i < n; i++) {
    const c = scored[i];
    const d = drainTo[c];
    out[m++] = DIR[c * 3] * lift;
    out[m++] = DIR[c * 3 + 1] * lift;
    out[m++] = DIR[c * 3 + 2] * lift;
    out[m++] = DIR[d * 3] * lift;
    out[m++] = DIR[d * 3 + 1] * lift;
    out[m++] = DIR[d * 3 + 2] * lift;
  }
  return m / 3;
}

/** Fractional land coverage of one cell from signed coast distance. */
export function landCover(W, c) {
  const km = cellSizeKm();
  const d = W.coastDist?.[c];
  if (d == null || !Number.isFinite(d)) return W.h[c] >= W.seaLevel ? 1 : 0;
  const x = 0.5 + d / km;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
