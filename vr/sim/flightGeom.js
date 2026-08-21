/** Elevated flight / interceptor line geometry for render (dark-400 §82, 321–322, 330).
 *
 *  Returns a packed Float32Array of xyz line segments (pairs of vertices).
 *  Render may upload this to a LINE buffer; until wired, overlays still use
 *  `W.tracer`. Call `flightArcPoints(W)` once per frame when `W.inFlight > 0`.
 */

import { DIR } from '../sphere.js';
import { flightAltitude, flightProgress } from './ordnance.js';

function pushElevated(out, cell, alt) {
  const i = cell * 3;
  const s = 1 + alt;
  out.push(DIR[i] * s, DIR[i + 1] * s, DIR[i + 2] * s);
}

/**
 * Line segments for every live flight and interceptor, elevated by altitude.
 * Warhead positions are duplicated as zero-length micro-segments (bright point
 * can be sampled from the last vertex of each arc in the shader/CPU path).
 *
 * @returns {{ segments: Float32Array, warheads: Float32Array, count: number }}
 */
export function flightArcPoints(W) {
  const segs = [];
  const heads = [];

  for (const f of W.flight || []) {
    if (f.dead || !f.path?.length) continue;
    const path = f.path;
    const len = path.length - 1;
    for (let i = 0; i < len; i++) {
      const t0 = i / Math.max(1, len);
      const t1 = (i + 1) / Math.max(1, len);
      pushElevated(segs, path[i], flightAltitude(f, t0));
      pushElevated(segs, path[i + 1], flightAltitude(f, t1));
    }
    const t = flightProgress(f);
    const idx = Math.min(path.length - 1, Math.floor(f.at || 0));
    pushElevated(heads, path[idx], flightAltitude(f, t));
  }

  for (const ix of W.interceptors || []) {
    if (ix.dead || !ix.path?.length) continue;
    const path = ix.path;
    const len = path.length - 1;
    for (let i = 0; i < len; i++) {
      // Interceptors climb steeply — low-mid altitude curve.
      const a0 = 0.02 + 0.12 * Math.sin(Math.PI * (i / Math.max(1, len)));
      const a1 = 0.02 + 0.12 * Math.sin(Math.PI * ((i + 1) / Math.max(1, len)));
      pushElevated(segs, path[i], a0);
      pushElevated(segs, path[i + 1], a1);
    }
  }

  return {
    segments: new Float32Array(segs),
    warheads: new Float32Array(heads),
    count: segs.length / 6,
  };
}
