/** Shared land/ocean surface — one sea level + tide height everywhere. */

export function seaBase(W) {
  return W._seaBase ?? W.seaLevel ?? 0;
}

/** Instantaneous local sea surface at cell c (meters-ish hypsometry units). */
export function localSeaLevel(W, c) {
  return seaBase(W) + (W.tideHeight?.[c] || 0);
}

/** Height above local sea (negative = submerged). */
export function cellElev(W, c) {
  return W.h[c] - localSeaLevel(W, c);
}

export function isSubmerged(W, c) {
  if (W?.noSurface) return false;
  return cellElev(W, c) < 0;
}

export function isLand(W, c) {
  if (W?.noSurface) return false;
  return !isSubmerged(W, c);
}
