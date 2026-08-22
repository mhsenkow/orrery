/** Intent dispatch — architecture-400 R42.
 *  Keyboard, pointer, touch, and XR should all call dispatchIntent.
 *  Handlers are registered by the UI layer (main / input).
 */

/** @typedef {'spin'|'zoom'|'cursor'|'act'|'descend'|'recenter'|'localNudge'|'arm'|'pan'|'close'|'meta'} IntentType */

/**
 * @typedef {object} Intent
 * @property {IntentType} type
 * @property {object} [payload]
 * @property {'keyboard'|'pointer'|'touch'|'xr'|'ui'} [source]
 */

/** @type {Map<IntentType, Set<function(Intent): void>>} */
const handlers = new Map();

/** @type {Intent[]} */
const LOG = [];
const LOG_MAX = 64;

export function onIntent(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type)?.delete(fn);
}

/** Clear all handlers (tests). */
export function resetIntents() {
  handlers.clear();
  LOG.length = 0;
}

/**
 * @param {IntentType} type
 * @param {object} [payload]
 * @param {'keyboard'|'pointer'|'touch'|'xr'|'ui'} [source]
 */
export function dispatchIntent(type, payload = {}, source = 'ui') {
  /** @type {Intent} */
  const intent = { type, payload, source };
  LOG.push(intent);
  if (LOG.length > LOG_MAX) LOG.shift();
  const set = handlers.get(type);
  if (!set || !set.size) return false;
  for (const fn of set) fn(intent);
  return true;
}

export function recentIntents() {
  return LOG.slice();
}
