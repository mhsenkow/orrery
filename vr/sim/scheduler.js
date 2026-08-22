/** Tick scheduler + timing — earth-fidelity E1, E2, E21, E22.
 *  simTick still owns call order; this module times subsystems and can skip
 *  droppable work when over budget. */

import { multiRateMask } from './meta.js';

/** Published degradation order — drop first when over budget (E22). */
export const DEGRADATION_ORDER = Object.freeze([
  'alien',
  'techno',
  'gaia',
  'god',
  'storms',
  'lightning',
  'tides',
  'phylogeny',
  'dark',
  'agents',
]);

/** Never drop these — conserved / structural (E23). */
export const NON_DROPPABLE = Object.freeze([
  'clock', 'atmo', 'hydro', 'carbon', 'bio', 'redox', 'ecology', 'fire', 'assert',
]);

const RING = 32;
const _rings = new Map();

function ringFor(name) {
  let r = _rings.get(name);
  if (!r) {
    r = { name, samples: new Float64Array(RING), i: 0, n: 0, sum: 0, max: 0 };
    _rings.set(name, r);
  }
  return r;
}

export function profileEnabled(W) {
  return !!(W && (W._profileTicks || W.debugProfile));
}

/** Record one sample in ms. */
export function recordMs(name, ms) {
  const r = ringFor(name);
  const old = r.samples[r.i];
  if (r.n >= RING) r.sum -= old;
  else r.n++;
  r.samples[r.i] = ms;
  r.i = (r.i + 1) % RING;
  r.sum += ms;
  if (ms > r.max) r.max = ms;
}

export function timed(name, W, fn) {
  if (!profileEnabled(W)) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    recordMs(name, performance.now() - t0);
  }
}

/** p50 / p99 / max / mean for Lab and headless (E2/E5). */
export function msTable() {
  const out = {};
  for (const [name, r] of _rings) {
    if (!r.n) continue;
    const sorted = Array.from(r.samples.subarray(0, r.n)).sort((a, b) => a - b);
    const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
    out[name] = {
      mean: r.sum / r.n,
      p50: p(0.5),
      p99: p(0.99),
      max: r.max,
    };
  }
  return out;
}

export function publishMs(W) {
  W._ms = msTable();
  let total = 0;
  for (const v of Object.values(W._ms)) total += v.mean;
  W._msTick = total;
  return W._ms;
}

/** Soft budget in ms for one sim tick (desktop). */
export function tickBudgetMs(W) {
  return W._tickBudgetMs || 8;
}

/**
 * Should this named subsystem run under current budget pressure?
 * Conserving systems always run. Others follow DEGRADATION_ORDER.
 */
export function shouldRun(W, name) {
  if (NON_DROPPABLE.includes(name)) return true;
  const budget = tickBudgetMs(W);
  const used = W._msTickAcc || 0;
  if (used < budget * 0.85) return true;
  const idx = DEGRADATION_ORDER.indexOf(name);
  if (idx < 0) return true;
  // Deeper in the list drops first when over budget.
  const pressure = used / budget;
  const cutoff = Math.floor((pressure - 0.85) / 0.05);
  const dropFrom = Math.max(0, DEGRADATION_ORDER.length - 1 - cutoff);
  if (idx >= dropFrom) {
    W._degraded = W._degraded || [];
    if (!W._degraded.includes(name)) W._degraded.push(name);
    return false;
  }
  return true;
}

export function beginTickProfile(W) {
  W._msTickAcc = 0;
  W._degraded = [];
  return multiRateMask(W);
}

export function addTickAcc(W, ms) {
  W._msTickAcc = (W._msTickAcc || 0) + ms;
}

/** Test helper — degradation order is honourable (E22). */
export function degradationHonoursConserved() {
  for (const n of NON_DROPPABLE) {
    if (DEGRADATION_ORDER.includes(n)) return false;
  }
  return true;
}
