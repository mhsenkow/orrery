/** Body-plan grammar from trait vectors.
 *
 *  Deprecated as the source of a body: a lineage's shape now comes from its genome via
 *  `expressBodyPlan` in genome.js, and this file is the shim for the callers that only
 *  ever hold an 11-float trait vector (mesh.js, and agents.js before a tree exists).
 *  Prefer `planOf(node)`.
 */

import { TRAITS } from './evolve.js';
import { clamp } from '../math.js';
import { expressBodyPlan, genomeFromTraits } from './genome.js';

/** The body of a phylogeny node, expressed from its genome and cached on the node. */
export function planOf(node, opts = {}) {
  if (!node) return null;
  if (node.plan) return node.plan;
  if (node.genome) {
    node.plan = expressBodyPlan(node.genome, opts);
    return node.plan;
  }
  return node.traits ? bodyPlanFromTraits(node.traits, opts) : null;
}

/**
 * Derive a compact body plan from traits.
 * Returns parameters a renderer can turn into impostors / sprites.
 */
export function bodyPlanFromTraits(traits, opts = {}) {
  const mass = traits?.[TRAITS.bodyMass] ?? 0.4;
  const trop = traits?.[TRAITS.trophic] ?? 0.2;
  const disp = traits?.[TRAITS.dispersal] ?? 0.3;
  const o2 = traits?.[TRAITS.o2Affinity] ?? 0.3;
  // Was `TRAITS.thermalOpt`, which is not a key of TRAITS — so this read `traits[undefined]`
  // and every creature in the product has had a pigment bias of exactly 0.5 since it was written.
  const therm = traits?.[TRAITS.tOpt] ?? 0.5;
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

  // Silhouette score — reject mush (item 41). The old test was
  // `limbs >= 2 || symmetry === 'radial' || appendage === 'frond'`, which every reachable
  // body passes, so it rejected nothing across 20,736 sampled trait vectors.
  let silhouette = 0.3;
  if (limbs >= 2) silhouette += 0.35;
  if (segments >= 3) silhouette += 0.15;
  if (defence > 0.4) silhouette += 0.1;
  if (appendage === 'jaw') silhouette += 0.15;
  silhouette = clamp(silhouette * clamp(size / 0.6, 0.4, 1.2), 0, 1);

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
