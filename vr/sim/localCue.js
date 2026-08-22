/** Cheap local-map payoff — motion orbit already promised (NEXT).
 *  Pulse + sprite motion land in `localview.js` when `cueKind` is set. */

import { ENT } from '../agents.js';
import { NC, NBR } from '../sphere.js';

/** Prefer cue kinds from the act that caused the descent. */
export const ACT_KIND = {
  ignite: 'fire',
  meteor: 'smoke',
  nuke: 'smoke',
  raise: 'place',
  lower: 'place',
  seed: 'life',
  herd: 'herd',
};

export const CUE_KINDS = Object.freeze(['fire', 'smoke', 'herd', 'life', 'place']);

/**
 * Scan near `cell` for fire / smoke / herd motion the local map can show.
 * @param {string} [prefer] act tool id or cue kind — biases which line wins.
 */
export function localMotionCue(W, cell, radius = 3, prefer = null) {
  if (cell == null || cell < 0 || cell >= NC) return null;
  const preferKind = ACT_KIND[prefer] || prefer;
  const seen = new Set([cell]);
  let q = [cell];
  for (let d = 0; d < radius; d++) {
    const next = [];
    for (const c of q) {
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if (n < 0 || seen.has(n)) continue;
        seen.add(n);
        next.push(n);
      }
    }
    q = next;
  }

  let fire = 0, smoke = 0, ash = 0;
  for (const c of seen) {
    if ((W.fire?.[c] || 0) > 0.08) fire++;
    if ((W.smoke?.[c] || 0) > 0.05) smoke++;
    if ((W.ash?.[c] || 0) > 0.08) ash++;
  }

  let herds = 0;
  if (ENT?.n) {
    for (let i = 0; i < ENT.n; i++) {
      const c = ENT.cell?.[i];
      if (c == null || !seen.has(c)) continue;
      const m = ENT.meta?.[i];
      if (m && (m.kind === 7 || (m.herd | 0) > 0)) herds++;
    }
  }

  const cues = [];
  if (fire > 0) cues.push({ kind: 'fire', line: 'Flame on the squares — smoke drifting downwind.', score: fire + 2 });
  if (smoke > 2 || ash > 2) cues.push({ kind: 'smoke', line: 'Ash and smoke still moving across the map.', score: smoke + ash });
  if (herds > 0) cues.push({ kind: 'herd', line: 'A herd is on the move in this frame.', score: herds + 1 });
  if ((W.life?.[cell] || 0) > 0.2) cues.push({ kind: 'life', line: 'Green on the grid — the same life the disc showed.', score: 1 });

  if (preferKind === 'fire' && fire === 0 && (W.ash?.[cell] || 0) > 0.02) {
    cues.push({ kind: 'fire', line: 'Char and heat on the squares where you lit.', score: 3 });
  }
  if (preferKind === 'smoke' && smoke === 0 && ash === 0) {
    cues.push({ kind: 'smoke', line: 'Dust still settling from the strike.', score: 3 });
  }
  if (preferKind === 'herd') {
    cues.push({ kind: 'herd', line: 'Look for animals leaving the scar.', score: 2 });
  }

  if (!cues.length) {
    return { kind: 'place', line: 'The map holds the place you struck — look for change.' };
  }

  if (preferKind) {
    const hit = cues.find((c) => c.kind === preferKind);
    if (hit) return hit;
  }
  cues.sort((a, b) => b.score - a.score);
  return cues[0];
}
