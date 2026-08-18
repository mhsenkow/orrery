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

/** Grade from traits + global transitions (Phase 0); accepts future node.slots/flags. */
export function deriveGrade(node, W) {
  if (!node) return 0;
  const T = W?.transitions || {};
  const mass = node.traits?.[4] ?? 0.15;
  const trop = node.traits?.[7] ?? 0;
  if (T.language || T.endothermy) return 7;
  if (T.landPlants && mass > 0.18) return 2;
  if (T.biomineral) return 4;
  if (T.multicellular) return trop > 0.5 ? 3 : 4;
  if (T.eukaryote) return 1;
  if (mass > 0.32) return 1;
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
