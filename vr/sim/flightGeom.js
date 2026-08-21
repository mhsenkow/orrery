/** Elevated flight / interceptor / spectacle geometry (dark-400 §82, 321–322, 330).
 *
 *  Returns packed Float32Arrays for LINE and POINT draws. Payload tints the
 *  trail so a chem arc is not an ICBM arc. Interceptors get their own heads.
 */

import { DIR } from '../sphere.js';
import { flightAltitude, flightProgress } from './ordnance.js';
import { spectacleArcPoints } from './darkSpectacle.js';

function pushElevated(out, cell, alt) {
  const i = cell * 3;
  const s = 1 + alt;
  out.push(DIR[i] * s, DIR[i + 1] * s, DIR[i + 2] * s);
}

/** Payload → RGB for trail colouring in render (0–1). */
export function payloadTrailRGB(payload, kind) {
  if (payload === 'bio') return [0.75, 0.35, 0.28];
  if (payload === 'chem_persist' || payload === 'chemical' || payload === 'chem_brief') {
    return [0.55, 0.85, 0.25];
  }
  if (payload === 'emp') return [0.45, 0.75, 1.0];
  if (payload === 'dirty') return [0.7, 0.85, 0.35];
  if (kind === 'drone' || kind === 'cruise') return [0.95, 0.75, 0.35];
  if (kind === 'drone-ix' || kind === 'interceptor') return [1.0, 0.55, 0.2];
  return [0.45, 0.92, 1.0]; // nuclear / default cyan
}

/**
 * @returns {{
 *   segments: Float32Array, warheads: Float32Array,
 *   ixHeads: Float32Array, specterSegs: Float32Array, specterPts: Float32Array,
 *   count: number, trailRGB: [number,number,number]
 * }}
 */
export function flightArcPoints(W) {
  const segs = [];
  const heads = [];
  const ixHeads = [];
  let trailRGB = [0.45, 0.92, 1.0];

  for (const f of W.flight || []) {
    if (f.dead || !f.path?.length) continue;
    trailRGB = payloadTrailRGB(f.payload, f.kind);
    const path = f.path;
    const len = path.length - 1;
    // Draw only the travelled arc brightly + a faint future ghost.
    const at = Math.min(len, Math.floor(f.at || 0));
    for (let i = 0; i < len; i++) {
      const t0 = i / Math.max(1, len);
      const t1 = (i + 1) / Math.max(1, len);
      // Past the warhead: full elev; ahead: slightly lower ghost.
      const past = i <= at;
      const a0 = flightAltitude(f, t0) * (past ? 1 : 0.45);
      const a1 = flightAltitude(f, t1) * (past ? 1 : 0.45);
      if (!past && i > at + 12) continue; // don't draw the whole future
      pushElevated(segs, path[i], a0);
      pushElevated(segs, path[i + 1], a1);
    }
    const t = flightProgress(f);
    const idx = Math.min(path.length - 1, Math.floor(f.at || 0));
    pushElevated(heads, path[idx], flightAltitude(f, t));
    // Small bloom ring around the warhead.
    pushElevated(heads, path[idx], flightAltitude(f, t) + 0.008);
  }

  for (const ix of W.interceptors || []) {
    if (ix.dead || !ix.path?.length) continue;
    const path = ix.path;
    const len = path.length - 1;
    const at = Math.min(len, Math.floor(ix.at || 0));
    for (let i = 0; i < len; i++) {
      if (i > at + 4) break;
      const a0 = 0.02 + 0.14 * Math.sin(Math.PI * (i / Math.max(1, len)));
      const a1 = 0.02 + 0.14 * Math.sin(Math.PI * ((i + 1) / Math.max(1, len)));
      pushElevated(segs, path[i], a0);
      pushElevated(segs, path[i + 1], a1);
    }
    const idx = Math.min(path.length - 1, Math.floor(ix.at || 0));
    const h = 0.02 + 0.14 * Math.sin(Math.PI * (idx / Math.max(1, len)));
    pushElevated(ixHeads, path[idx], h);
  }

  const spec = spectacleArcPoints(W);

  return {
    segments: new Float32Array(segs),
    warheads: new Float32Array(heads),
    ixHeads: new Float32Array(ixHeads),
    specterSegs: spec.segments,
    specterPts: spec.points,
    count: segs.length / 6,
    trailRGB,
  };
}
