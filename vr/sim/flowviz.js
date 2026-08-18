/** Advected tracers so wind and current read as motion, not a colour ramp. */

import { NC, DIR, EAST, NORTH, dirToCell } from '../sphere.js';
import { W } from '../world.js';
import { reducedMotion } from './present.js';

const NPART = 1600;
const pos = new Float32Array(NPART * 3);
const prev = new Float32Array(NPART * 3);
const kind = new Uint8Array(NPART); // 0 ocean, 1 wind
let _seeded = false;
let _n = 0;

function spawn(i, oceanOnly) {
  const c = (Math.random() * NC) | 0;
  const sea = W.h[c] < W.seaLevel;
  if (oceanOnly && !sea) {
    for (let t = 0; t < 24; t++) {
      const n = ((c + t * 97) % NC);
      if (W.h[n] < W.seaLevel) {
        kind[i] = 0;
        const j = i * 3;
        pos[j] = DIR[n * 3];
        pos[j + 1] = DIR[n * 3 + 1];
        pos[j + 2] = DIR[n * 3 + 2];
        prev[j] = pos[j]; prev[j + 1] = pos[j + 1]; prev[j + 2] = pos[j + 2];
        return;
      }
    }
  }
  kind[i] = sea && Math.random() < 0.72 ? 0 : 1;
  const j = i * 3;
  pos[j] = DIR[c * 3];
  pos[j + 1] = DIR[c * 3 + 1];
  pos[j + 2] = DIR[c * 3 + 2];
  prev[j] = pos[j]; prev[j + 1] = pos[j + 1]; prev[j + 2] = pos[j + 2];
}

export function resetFlow() {
  _seeded = false;
}

export function stepFlow(dt) {
  if (reducedMotion() || !W.h) return;
  if (!_seeded) {
    _n = NPART;
    for (let i = 0; i < NPART; i++) spawn(i, false);
    _seeded = true;
  }
  const step = Math.min(0.08, dt) * 0.55;
  for (let i = 0; i < _n; i++) {
    const j = i * 3;
    prev[j] = pos[j]; prev[j + 1] = pos[j + 1]; prev[j + 2] = pos[j + 2];
    const c = dirToCell(pos[j], pos[j + 1], pos[j + 2]);
    const sea = W.h[c] < W.seaLevel;
    let u = 0, v = 0;
    if (kind[i] === 0) {
      if (!sea) { spawn(i, true); continue; }
      u = W.oceanU?.[c] || 0;
      v = W.oceanV?.[c] || 0;
    } else {
      u = W.windU?.[c] || 0;
      v = W.windV?.[c] || 0;
    }
    const spd = Math.hypot(u, v);
    if (spd < 0.02 && Math.random() < 0.04) { spawn(i, kind[i] === 0); continue; }
    pos[j] += (EAST[c * 3] * u + NORTH[c * 3] * v) * step;
    pos[j + 1] += (EAST[c * 3 + 1] * u + NORTH[c * 3 + 1] * v) * step;
    pos[j + 2] += (EAST[c * 3 + 2] * u + NORTH[c * 3 + 2] * v) * step;
    const L = Math.hypot(pos[j], pos[j + 1], pos[j + 2]) || 1;
    pos[j] /= L; pos[j + 1] /= L; pos[j + 2] /= L;
  }
}

/** Fill a LINES buffer: 2 verts per particle. Returns vertex count. */
export function fillFlowStreaks(out, mode = 'all') {
  if (!_seeded || reducedMotion()) return 0;
  let m = 0;
  const liftO = 1.004, liftW = 1.012;
  for (let i = 0; i < _n; i++) {
    const ocean = kind[i] === 0;
    if (mode === 'ocean' && !ocean) continue;
    if (mode === 'wind' && ocean) continue;
    const j = i * 3;
    const lift = ocean ? liftO : liftW;
    out[m++] = prev[j] * lift;
    out[m++] = prev[j + 1] * lift;
    out[m++] = prev[j + 2] * lift;
    out[m++] = pos[j] * lift;
    out[m++] = pos[j + 1] * lift;
    out[m++] = pos[j + 2] * lift;
  }
  return m / 3;
}

export function flowKindAt(i) { return kind[i]; }
export function flowCount() { return _n; }
