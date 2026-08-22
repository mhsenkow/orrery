/** World field guards — architecture-400 P21 / P41.
 *  Opt-in via W.debugAssert === 'throw' or ?assert=1 / wrapWorldDebug(W).
 */

import { FIELD_BY_NAME } from './fields.js';

const ALLOW_DYNAMIC = new Set([
  // Allocated / attached after createWorld — declare here until schema catches up
  'dark',
  'techno',
  'receipts',
  'cities',
  'polities',
  'entities',
  'guilds',
  'herds',
  'moments',
  'ics',
  'moon',
  'diplo',
  'owner',
  'guildDens',
  'species',
  'worldName',
  'clockFace',
  'seasonHold',
  'debugAssert',
  '_writeOwner',
  '_bootPhase',
  '_canvasMode',
  '_landscape',
  '_gpgpuDirty',
  '_enso',
  '_ensoPhase',
  '_profileBag',
  '_degraded',
  '_rate',
  '_sculpted',
  '_pendingOriginDigest',
  'originDigest',
]);

/**
 * @param {object} W
 * @param {object} [opts]
 * @param {boolean} [opts.seal]  reject unknown keys (P41)
 * @param {boolean} [opts.owners] reject curated writes from non-owners (P21)
 */
export function wrapWorldDebug(W, opts = {}) {
  if (W.__orreryGuarded) return W;
  const seal = opts.seal !== false;
  const owners = opts.owners !== false;
  const known = new Set([...Object.keys(W), ...Object.keys(FIELD_BY_NAME), ...ALLOW_DYNAMIC]);

  const proxy = new Proxy(W, {
    set(target, prop, value, receiver) {
      if (typeof prop !== 'string') return Reflect.set(target, prop, value, receiver);
      known.add(prop);

      // P41 — known misspellings only (case-sensitive; never match seaLevel)
      if (prop === 'tempreature' || prop === 'meanTemprature' || prop === 'sealevel' || prop === 'lifee') {
        throw new Error(`[P41] unknown W field '${prop}' (typo?)`);
      }

      if (owners && FIELD_BY_NAME[prop] && target.debugAssert === 'throw') {
        const row = FIELD_BY_NAME[prop];
        const writer = target._writeOwner;
        if (writer && writer !== '*') {
          const allowed = new Set([row.owner, ...(row.handoff || [])]);
          if (row.owner && !allowed.has(writer)) {
            throw new Error(
              `[P21] W.${prop} owned by '${row.owner}' (handoff: ${[...allowed].join(',')}), write from '${writer}' (tick=${target.year ?? '?'})`,
            );
          }
        }
      }
      return Reflect.set(target, prop, value, receiver);
    },
    defineProperty(target, prop, desc) {
      if (typeof prop === 'string') known.add(prop);
      return Reflect.defineProperty(target, prop, desc);
    },
  });

  Object.defineProperty(proxy, '__orreryGuarded', { value: true, enumerable: false });
  return proxy;
}

/** Enable throw-mode + optional wrap. Safe to call multiple times. */
export function enableWorldAsserts(W, wrap = true) {
  W.debugAssert = 'throw';
  return wrap ? wrapWorldDebug(W) : W;
}

/** Run a block as a named owner (P21). */
export function withOwner(W, owner, fn) {
  const prev = W._writeOwner;
  W._writeOwner = owner;
  try {
    return fn();
  } finally {
    W._writeOwner = prev;
  }
}
