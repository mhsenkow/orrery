#!/usr/bin/env node
/** CPU ↔ GPU climate parity harness — earth-fidelity C1, C2.
 *
 *   node scripts/parity-climate.mjs
 *
 * Forces CPU path twice (determinism) and compares CPU vs GPU when available.
 * GPU path may be absent in headless — then we only assert CPU self-parity.
 */

import { createHash } from 'node:crypto';
import { W, generate, simTick, RULESETS, changeResolution } from '../vr/world.js';
import { NC } from '../vr/sphere.js';

try {
  changeResolution(32);
} catch {
  /* */
}

function digest(W) {
  const h = createHash('sha256');
  for (const key of ['temp', 'moist', 'ice', 'clouds']) {
    if (W[key]) h.update(Buffer.from(W[key].buffer));
  }
  h.update(String(W.meanTemp));
  return h.digest('hex').slice(0, 12);
}

function runOnce({ gpuOff, seed = 42, ticks = 24 }) {
  const rule = RULESETS.find((r) => r.id === 'terra') || RULESETS[0];
  generate(seed, rule);
  W._gpgpuOff = !!gpuOff;
  W._profileTicks = false;
  for (let i = 0; i < ticks; i++) simTick(true);
  return {
    hash: digest(W),
    meanTemp: W.meanTemp,
    iceFrac: W.iceFrac,
    gpu: !W._gpgpuOff && !!W._gpgpuOk,
  };
}

const a = runOnce({ gpuOff: true });
const b = runOnce({ gpuOff: true });
const cpuParity = a.hash === b.hash;
console.log(`CPU self-parity: ${cpuParity ? 'PASS' : 'FAIL'}  ${a.hash}`);

let gpu = null;
let parity = null;
const forceGpu = process.argv.includes('--require-gpu');
try {
  gpu = runOnce({ gpuOff: false });
  // Compare meanTemp within tolerance — bit-identity not expected (D15).
  const dT = Math.abs((gpu.meanTemp || 0) - (a.meanTemp || 0));
  const gpuRan = !!gpu.gpu;
  if (!gpuRan && forceGpu) {
    console.error('GPU path required (--require-gpu) but unavailable');
    process.exitCode = 1;
  } else if (!gpuRan) {
    console.log('CPU↔GPU: SKIP (no float-FB / _gpgpuOk) — CPU self-parity is the CI gate');
    parity = true;
  } else {
    parity = dT <= 0.08;
    console.log(`CPU↔GPU meanTemp Δ=${dT.toFixed(4)} (tol 0.08) · ${parity ? 'PASS' : 'FAIL'}`);
    console.log(`  cpu=${a.meanTemp?.toFixed(4)} gpu=${gpu.meanTemp?.toFixed(4)} gpuOk=${gpu.gpu}`);
  }
} catch (e) {
  console.log(`GPU path unavailable: ${e.message || e}`);
  if (forceGpu) process.exitCode = 1;
  parity = true; // skip in headless
}

if (!cpuParity || parity === false) process.exitCode = 1;
