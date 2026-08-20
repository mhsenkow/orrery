/** Distinctive geology per active world.
 *
 *  generateTectonics always builds Voronoi plates; this pass overwrites the
 *  heightfield from authored stamp ops (stamps.json → stampApply.js). Ice
 *  worlds are owned by iceshell.js. Fixtures of the old hand-written stamps
 *  live in stampFixtures.js for regression. */

import { kindOf, isGasKind, isIceShellKind } from './planetKind.js';
import { applyStampKind } from './stampApply.js';
import { STAMP_BY_ID } from './stampTable.js';

export { planetKind, planetKindWhy, cachePlanetKind, kindOf, usesWhittakerCover, isGasKind, isIceShellKind, hasSurface } from './planetKind.js';
export { applyStampKind, stampCraters, dryWorld } from './stampApply.js';
export { FIXTURES } from './stampFixtures.js';

/**
 * Overwrite Voronoi-Earth hypsometry with the landforms this world actually has.
 * No-op for Earth, Daisyworld, and ice-shell worlds (iceshell.js owns those).
 */
export function refinePlanetHypsometry(W, seed, rule) {
  const { kind, why } = kindOf(W, rule);
  W._planetKind = kind;
  W._planetKindWhy = why;
  if (kind === 'earth' || kind === 'daisy') return kind;
  if (isIceShellKind(kind)) return kind;
  if (isGasKind(kind)) {
    applyStampKind(W, 'gas', seed);
    return kind;
  }
  if (STAMP_BY_ID[kind]) {
    applyStampKind(W, kind, seed);
    return kind;
  }
  // Unknown solid world: stagnant lid is the honest default.
  applyStampKind(W, 'stagnant', seed);
  return kind;
}
