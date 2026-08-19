/** Derived lifeClass and unlockedClass — single writer for display ladder.
 *  Phase 0 shim; Phase 1 swaps deriveGrade body to read node.slots/flags. */

import { NC, NBR } from '../sphere.js';
import { dominantGuildAt } from './lifeColour.js';

/** Mirror of bio.js LIFE_CLASSES ids — kept here to avoid import cycle. */
export const GRADE_IDS = [
  'prokaryote', 'eukaryote', 'multicellular', 'arthropod',
  'fish', 'amphibian', 'reptile', 'mammal',
];
export const GRADES = GRADE_IDS.map((id, index) => ({ id, index }));

/** Grade from this lineage's genome / plan, not from planet-wide flags.
 *  LIFE_CLASSES stays as a legend; unlockedClassFromPool remains an agent cap. */
export function deriveGrade(node, W) {
  if (!node) return 0;
  const g = node.genome;
  const plan = node.plan;
  const mass = node.traits?.[4] ?? 0.15;
  const trop = node.traits?.[7] ?? 0;
  const habitat = g?.axes?.habitat || plan?.habitat || '';
  const skeleton = g?.axes?.skeleton || plan?.skeleton || 'none';
  const thermal = g?.axes?.thermal;
  const nervous = g?.axes?.nervous;
  const loco = g?.axes?.locomotion || '';
  const sizeClass = g?.n?.sizeClass ?? 0;
  const limbs = plan?.limbs ?? 0;
  const marine = /pelagic|ventBenthic|shelfBenthic|abyssal|nekton/.test(habitat)
    || habitat === 'marine';

  if (thermal === 'endotherm' || nervous === 'cortex' || (thermal === 'endotherm' && sizeClass >= 4)) return 7;
  if ((habitat === 'terrestrial' || habitat === 'fossorial') && (skeleton === 'bone' || skeleton === 'pneumaticBone') && trop > 0.25) return 6;
  if (habitat === 'terrestrial' && sizeClass >= 3 && trop > 0.15 && skeleton !== 'lignin') return 5;
  if (marine && sizeClass >= 3 && skeleton !== 'none' && trop > 0.2) return 4;
  if (skeleton === 'chitinExo' || limbs >= 6 || loco === 'ambulacral') return 3;
  if (sizeClass >= 2 || (g?.n?.segments || 0) > 1 || plan?.silhouette === 'sessile') return 2;
  if (g?.axes?.nervous && g.axes.nervous !== 'none') return 1;
  if (mass > 0.32) return 1;
  const T = W?.transitions || {};
  if (T.eukaryote && !g) return 1;
  return 0;
}

function guildGrade(W, c) {
  const T = W.transitions || {};
  const gid = dominantGuildAt(W, c);
  if (T.language || T.endothermy) return 7;
  if (T.landPlants && W.h[c] >= W.seaLevel) return 2;
  if (T.biomineral && W.h[c] < W.seaLevel) return 4;
  if (T.multicellular) return W.h[c] < W.seaLevel ? 4 : 3;
  if (T.eukaryote) return 1;
  if (gid === 'cyanobacteria' || gid === 'aerobe') return 0;
  return 0;
}

/** Only function that writes W.lifeClass. */
export function deriveLifeClass(W) {
  if (!W.lifeClass || !W.tree?.byId) return;
  for (let c = 0; c < NC; c++) {
    const id = W.popId?.[c];
    const node = id ? W.tree.byId.get(id) : null;
    if (node && W.life[c] > 0.05) {
      W.lifeClass[c] = deriveGrade(node, W);
    } else if (W.life[c] > 0.05) {
      W.lifeClass[c] = guildGrade(W, c);
    } else {
      W.lifeClass[c] = 0;
    }
  }
}

/** Legacy 0–7 integer from transitions / modulePool shim. */
export function unlockedClassFromPool(W) {
  const T = W.transitions || {};
  let u = 0;
  if (T.eukaryote) u = 1;
  if (T.multicellular) u = 2;
  if (T.biomineral) u = 4;
  if (T.landPlants) u = 5;
  if (T.endothermy) u = 7;
  if (W.rule?.earthLike && !W.rule?.deepTime) u = Math.max(u, 6);
  return u;
}
