/** First-class run object — earth-fidelity D46.
 *  Fork-and-diverge hangs here; seed+intervention tape is the art face. */

import { forkWorldSeed } from './evolve.js';
import { W, serializeRun, loadRunMeta } from '../world.js';

let _runs = [];
let _seq = 0;

export function listRuns() {
  return _runs.slice();
}

export function clearRuns() {
  _runs = [];
}

/** Capture a run snapshot from the live world. */
export function captureRun(label = 'run') {
  const id = `run-${++_seq}-${Date.now().toString(36)}`;
  const data = serializeRun();
  const run = {
    id,
    label,
    parentId: null,
    seed: data.seed,
    ruleId: data.ruleId,
    ageYr: data.ageYr,
    tick: W._tickIndex | 0,
    constantsHash: data.unitsHash || null,
    interventions: (data.interventions || []).slice(),
    snapshot: data,
    createdAt: Date.now(),
  };
  _runs.push(run);
  if (_runs.length > 48) _runs.shift();
  return run;
}

/**
 * Fork at current state with a new seed label (D46/D50).
 * Same terrain / tape; RNG seed diverges so future ticks branch.
 * Returns a new Run; call applyRun to load it into the live world.
 */
export function forkRunObject(label = 'fork', parent = null) {
  const base = parent || captureRun('parent');
  const newSeed = forkWorldSeed(base.seed, label + (base.ageYr || 0));
  const landSeed = base.snapshot?.landSeed ?? base.seed;
  const rngBase = base.snapshot?.rngState ?? base.seed;
  const child = {
    id: `run-${++_seq}-${Date.now().toString(36)}`,
    label,
    parentId: base.id,
    seed: newSeed,
    ruleId: base.ruleId,
    ageYr: base.ageYr,
    tick: base.tick,
    constantsHash: base.constantsHash,
    interventions: (base.interventions || []).slice(),
    snapshot: {
      ...base.snapshot,
      seed: newSeed,
      // Keep landSeed so load restores the same continents; only RNG forks.
      landSeed,
      rngState: forkWorldSeed(rngBase >>> 0, label),
    },
    createdAt: Date.now(),
  };
  _runs.push(child);
  return child;
}

/** Load a run's snapshot into the live world. */
export function applyRun(run) {
  if (!run?.snapshot) throw new Error('applyRun: missing snapshot');
  return loadRunMeta(run.snapshot);
}

/** Divergence metric stub — field L1 over shared keys (D53). */
export function divergenceMetric(a, b) {
  if (!a?.snapshot || !b?.snapshot) return null;
  let score = 0;
  const ga = a.snapshot.gases || {};
  const gb = b.snapshot.gases || {};
  for (const k of new Set([...Object.keys(ga), ...Object.keys(gb)])) {
    score += Math.abs((ga[k] || 0) - (gb[k] || 0));
  }
  score += Math.abs((a.snapshot.ageYr || 0) - (b.snapshot.ageYr || 0)) * 1e-9;
  return score;
}
