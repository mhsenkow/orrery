/** Play-facing landscape defaults — separate from archetype masks so cache busts stay small. */

export const EARTH_PLAY_LANDSCAPE = 'familiar';

/** Resolve a landscape id for play — keeps golden/calibrate on bare `auto` (no mask). */
export function resolvePlayLandscape(id, { earthLike } = {}) {
  const land = id || 'auto';
  if (land !== 'auto') return land;
  return earthLike ? EARTH_PLAY_LANDSCAPE : 'auto';
}
