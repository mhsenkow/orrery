/** Body-plan grammar from trait vectors.
 *  Next backlog items 30–33, 41 (mesh/grammar foundation). */

import { TRAITS } from './evolve.js';
import { clamp } from '../math.js';

/**
 * Derive a compact body plan from traits.
 * Returns parameters a renderer can turn into impostors / sprites.
 */
export function bodyPlanFromTraits(traits, opts = {}) {
  const mass = traits?.[TRAITS.bodyMass] ?? 0.4;
  const trop = traits?.[TRAITS.trophic] ?? 0.2;
  const disp = traits?.[TRAITS.dispersal] ?? 0.3;
  const o2 = traits?.[TRAITS.o2Affinity] ?? 0.3;
  const therm = traits?.[TRAITS.thermalOpt] ?? 0.5;
  const defence = traits?.[TRAITS.defence] ?? 0.2;

  const O2 = opts.O2 ?? 0.21;
  const grav = opts.gravity ?? 1;

  // Size from Kleiber-ish + O₂ + gravity (item 33 / 170)
  let size = Math.pow(Math.max(0.05, mass), 0.35);
  size *= clamp(0.55 + O2 * 1.4, 0.5, 1.6);
  size *= clamp(1.15 / Math.sqrt(Math.max(0.2, grav)), 0.7, 1.8);

  const limbs = mass < 0.25 ? 0 : mass < 0.45 ? 4 : trop > 0.55 ? 4 : 6;
  const segments = mass < 0.3 ? 1 : 1 + ((mass * 4) | 0);
  const symmetry = mass < 0.2 ? 'radial' : 'bilateral';
  const appendage = trop > 0.6 ? 'jaw' : trop > 0.35 ? 'limb' : 'frond';

  // Stride frequency ~ mass^(-1/6)
  const stride = Math.pow(Math.max(0.05, mass), -1 / 6) * (0.7 + disp);

  // Silhouette score — reject mush (item 41)
  const silhouette = limbs >= 2 || symmetry === 'radial' || appendage === 'frond' ? 1 : 0.4;

  return {
    size: clamp(size, 0.25, 3.5),
    limbs,
    segments: clamp(segments, 1, 8),
    symmetry,
    appendage,
    stride: clamp(stride, 0.3, 4),
    pigmentBias: therm,
    armour: defence,
    silhouette,
    spriteKind: spriteFromPlan({ mass, trop, limbs, appendage }),
  };
}

function spriteFromPlan({ mass, trop, limbs, appendage }) {
  if (mass < 0.2) return 9; // sparse / micro
  if (appendage === 'frond') return trop > 0.3 ? 2 : 0;
  if (trop > 0.65) return 15; // predator-ish / fish
  if (limbs >= 6) return 3;
  if (mass > 0.7) return 5;
  return 1;
}

/** Inherit morphology down phylogeny; harden with clade age. Item 32. */
export function inheritMorphology(parentPlan, ageMyr, mutateFn) {
  const hard = clamp(ageMyr / 200, 0, 0.85);
  const child = mutateFn ? mutateFn({ ...parentPlan }) : { ...parentPlan };
  // Locked axes
  child.limbs = parentPlan.limbs;
  child.symmetry = parentPlan.symmetry;
  child.segments = Math.round(parentPlan.segments * hard + child.segments * (1 - hard));
  return child;
}

/** Three-pixel silhouette rule — fail soft. Item 41. */
export function passesSilhouette(plan) {
  return (plan.silhouette || 0) >= 0.5 && plan.size >= 0.2;
}
