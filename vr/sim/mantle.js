/** Mantle convection under the plates. Currents backlog `mantleflow`. */

import { NC, DIR, LON, dirToCell } from '../sphere.js';
import { clamp, mulberry32 } from '../math.js';

export function initMantle(W, seed) {
  const rng = mulberry32((seed ?? W.seed ?? 1) ^ 0x4d414e54);
  W._mantle = [];
  for (let i = 0; i < 4; i++) {
    W._mantle.push({
      kx: 1 + (rng() * 3 | 0),
      ky: 1 + (rng() * 2 | 0),
      phase: rng() * Math.PI * 2,
      amp: 0.22 + rng() * 0.4,
      spin: (rng() - 0.5) * 0.006,
    });
  }
  if (!W.mantleU || W.mantleU.length !== NC) W.mantleU = new Float32Array(NC);
  if (!W.mantleV || W.mantleV.length !== NC) W.mantleV = new Float32Array(NC);
  if (!W.dynTopo || W.dynTopo.length !== NC) W.dynTopo = new Float32Array(NC);
  sampleMantle(W);
  W._mantleDrift = 0;
  W._mantleSampled = true;
  W._dyn0 = Float32Array.from(W.dynTopo);
}

function sampleMantle(W) {
  const modes = W._mantle;
  if (!modes?.length) return;
  const heat = W.interior?.heatFlow || 1;
  const vigor = W.interior?.vigor ?? 1;
  for (let c = 0; c < NC; c++) {
    const y = DIR[c * 3 + 1];
    const lon = LON[c];
    let up = 0, ue = 0, un = 0;
    for (const m of modes) {
      const arg = m.kx * lon + m.phase;
      const s = Math.sin(arg) * Math.cos(m.ky * y);
      up += s * m.amp;
      ue += Math.cos(arg) * m.amp * 0.45;
      un += -Math.sin(m.ky * y + m.phase * 0.4) * m.amp * 0.28;
    }
    W.dynTopo[c] = clamp(up * 0.55 * heat, -1, 1);
    W.mantleU[c] = clamp(ue * vigor, -1.2, 1.2);
    W.mantleV[c] = clamp(un * vigor, -1.2, 1.2);
  }
}

function drivePlates(W) {
  const plates = W.plates;
  const lid = W.interior?.lidMode || 'mobile';
  if (!plates?.length || (lid !== 'mobile' && lid !== 'episodic')) return;
  const vigor = W.interior?.vigor ?? 1;
  const nP = plates.length;
  const conv = new Float32Array(nP);
  const divn = new Float32Array(nP);
  const nC = new Float32Array(nP);
  for (let c = 0; c < NC; c++) {
    const p = W.plateId[c];
    if (p < 0 || p >= nP) continue;
    nC[p]++;
    if (W.bound[c] === 1 && plates[p].oceanic) conv[p]++;
    if (W.bound[c] === 0) divn[p]++;
  }
  for (let i = 0; i < nP; i++) {
    const pl = plates[i];
    const cell = dirToCell(pl.centre[0], pl.centre[1], pl.centre[2]);
    const u = W.mantleU[cell] || 0;
    const slab = (conv[i] / (nC[i] + 1)) * 0.035 * vigor * (pl.oceanic ? 1.35 : 0.45);
    const ridge = (divn[i] / (nC[i] + 1)) * 0.012 * vigor;
    const sign = Math.sign(pl.omega || u || 1);
    const target = u * 0.018 + sign * (slab + ridge);
    pl.omega = clamp(pl.omega * 0.94 + target * 0.06, -0.16, 0.16);
  }
}

/** How far the mode phases may drift before the field is worth resampling.
 *  `spin` is ±0.003 rad/tick, so this resamples every ~7 ticks at most — the
 *  field it produces varies on a 10-Myr timescale and was being rebuilt every
 *  tick with four modes × three trig calls per cell, ~300 000 sin/cos a tick at
 *  N=64 for a result that had barely moved. Phases still advance every tick, so
 *  nothing drifts out of step; only the sampling is coarse. */
const RESAMPLE_RAD = 0.02;

/** Slow convection, slab-pull speeds, dynamic topography. */
export function mantleTick(W) {
  if (!W._mantle) return;
  const vigor = W.interior?.vigor ?? 1;
  let moved = 0;
  for (const m of W._mantle) {
    const d = m.spin * vigor;
    m.phase += d;
    const a = d < 0 ? -d : d;
    if (a > moved) moved = a;
  }
  W._mantleDrift = (W._mantleDrift || 0) + moved;
  if (W._mantleDrift >= RESAMPLE_RAD || !W._mantleSampled) {
    W._mantleDrift = 0;
    W._mantleSampled = true;
    sampleMantle(W);
  }
  drivePlates(W);

  if (!W._dyn0 || W._dyn0.length !== NC || !W.h) return;
  for (let c = 0; c < NC; c++) {
    const dh = (W.dynTopo[c] - W._dyn0[c]) * 0.035;
    if (Math.abs(dh) < 1e-5) continue;
    W.h[c] = clamp(W.h[c] + dh, -1.2, 1.2);
    W._dyn0[c] += dh;
  }
}
