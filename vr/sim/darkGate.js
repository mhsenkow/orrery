/** Opt-in gate for the Dark / Evil war layer.
 *  Off by default — PURPOSE: not one of the four faces.
 *  Unlock: ?dark=1  or  localStorage orrery.dark = "1"
 *  Force off: ?dark=0
 */

let _cached = null;

export function darkEnabled() {
  if (_cached !== null) return _cached;
  try {
    const loc = globalThis.location;
    if (loc && typeof loc.search === 'string') {
      const q = new URLSearchParams(loc.search);
      const v = q.get('dark');
      if (v === '0' || v === 'false') return (_cached = false);
      if (v === '1' || v === 'true') return (_cached = true);
    }
    if (typeof globalThis.localStorage !== 'undefined') {
      return (_cached = globalThis.localStorage.getItem('orrery.dark') === '1');
    }
  } catch (_) {
    /* non-browser / denied */
  }
  return (_cached = false);
}

/** Persist preference and clear memo (reload recommended for UI tabs). */
export function setDarkEnabled(on) {
  _cached = !!on;
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem('orrery.dark', on ? '1' : '0');
    }
  } catch (_) {
    /* ignore */
  }
}

/** Test helper — bypass URL/storage. */
export function _resetDarkGateCache() {
  _cached = null;
}
