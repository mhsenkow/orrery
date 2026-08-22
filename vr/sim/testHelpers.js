/** Shared test helpers — quality-400 F19 / F25. */

import { W, generate, RULESETS } from '../world.js';
import { hashFields } from './hashFields.js';

export { hashFields };

/**
 * Generate a known world, run `fn(W)`, return the result.
 * Always forces CPU climate so headless stays deterministic.
 */
export function withWorld(opts, fn) {
  const {
    seed = 20260808,
    ruleId = 'terra',
    deepTime = false,
    landscape = 'auto',
  } = typeof opts === 'function' ? { seed: 20260808 } : opts;
  const body = typeof opts === 'function' ? opts : fn;
  const base = RULESETS.find((r) => r.id === ruleId) || RULESETS[0];
  generate(seed, { ...base, deepTime, landscape });
  W._gpgpuOff = true;
  return body(W);
}
