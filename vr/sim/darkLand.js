/** Land war — supply lines, encirclement, forts, scorched earth (dark-400 I §161–180). */

import { NC, NBR } from '../sphere.js';
import { rngOf } from './rng.js';
import { igniteFire } from './fire.js';
import { noteCasualty, noteFought } from './dark.js';

export function resetLand(W) {
  W.fort = W.fort?.length === NC ? W.fort : new Float32Array(NC);
  W.fort.fill(0);
  W.dark = W.dark || {};
  W.dark.supplyCut = 0;
  W.dark.frontLen = 0;
  W._supplyStall = W._supplyStall || new Map();
}

/** BFS along owner cells from capital — returns reachable set. */
export function supplyReachable(W, polityId) {
  const p = W._polityIndex?.get(polityId);
  if (!p || p.capital < 0 || !W.owner) return new Set();
  const own = W.owner;
  const seen = new Set();
  const q = [p.capital | 0];
  seen.add(p.capital | 0);
  while (q.length) {
    const c = q.pop();
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (seen.has(n)) continue;
      if (own[n] !== polityId) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return seen;
}

/** Cell is supplied if it can reach capital along owner cells (§161). */
export function cellSupplied(W, cell, polityId, reach = null) {
  const r = reach || supplyReachable(W, polityId);
  return r.has(cell | 0);
}

function nearestCityName(W, cell) {
  let best = null, bestD = 1e9;
  for (const city of W.cities || []) {
    const d = Math.abs((city.cell | 0) - (cell | 0));
    if (d < bestD) { bestD = d; best = city; }
  }
  return best?.name || 'the frontier';
}

export function landWarTick(W, log = null) {
  const wars = W.diplo?.wars || [];
  if (!W.fort || W.fort.length !== NC) W.fort = new Float32Array(NC);
  W.dark = W.dark || {};
  if (!wars.length || !W.owner || !W.border) {
    W.dark.frontLen = 0;
    return;
  }

  const rng = rngOf(W, 'rngGod');
  const stall = W._supplyStall || (W._supplyStall = new Map());
  let frontLen = 0;
  let cutCount = 0;

  for (const war of wars) {
    const reachA = supplyReachable(W, war.a);
    const reachB = supplyReachable(W, war.b);

    for (let c = 0; c < NC; c++) {
      if (!(W.border[c] > 0)) continue;
      const o = W.owner[c];
      if (o !== war.a && o !== war.b) continue;
      let enemy = false;
      let enemyN = -1;
      for (let k = 0; k < 4; k++) {
        const n = W.owner[NBR[c * 4 + k]];
        if ((n === war.a || n === war.b) && n !== o) {
          enemy = true;
          enemyN = NBR[c * 4 + k];
          break;
        }
      }
      if (!enemy) continue;
      frontLen++;
      noteFought(W, c, 1);

      const supplied = o === war.a ? reachA.has(c) : reachB.has(c);
      const key = `${war.a}:${war.b}:${c}`;
      if (!supplied) {
        cutCount++;
        stall.set(key, (stall.get(key) | 0) + 1);
      } else {
        stall.set(key, 0);
      }

      const fort = W.fort[c] || 0;
      const stalled = (stall.get(key) | 0) >= 3; // halt advance within 3 ticks (§178)
      W.dark.supplyCutStalls = W.dark.supplyCutStalls || 0;

      // Attrition.
      if (W.build?.[c] > 0) {
        const lost = Math.min(W.build[c], 0.004 * (1 - fort * 0.5));
        W.build[c] -= lost;
        noteCasualty(W, 'war', Math.floor(lost * 200));
      }

      // Advance only if supplied and not heavily fortified.
      if (!stalled && supplied && enemyN >= 0 && fort < 0.6 && rng() < 0.08) {
        W.owner[enemyN] = o;
        if (W.build?.[enemyN] > 0) W.build[enemyN] *= 0.85;
      } else if (stalled) {
        W.dark.supplyCutStalls = (W.dark.supplyCutStalls | 0) + 1;
      }

      // Encirclement: cell whose all land neighbors are enemy (§165).
      let landN = 0, enemyRing = 0;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if ((W.h?.[n] ?? 1) < (W.seaLevel ?? 0)) continue;
        landN++;
        const no = W.owner[n];
        if (no !== o && no >= 0) enemyRing++;
      }
      if (landN >= 3 && enemyRing >= landN) {
        const flipTo = o === war.a ? war.b : war.a;
        W.owner[c] = flipTo;
        noteCasualty(W, 'war', 80);
        if (log && rng() < 0.3) {
          log(W.year, 'battle', c, 0.7,
            `Battle of ${nearestCityName(W, c)} — encirclement`);
        }
      }

      // Fortify slowly on defended borders (§164).
      if (rng() < 0.05) W.fort[c] = Math.min(1, fort + 0.04);

      // Scorched earth on retreat when weariness high (§169).
      const polity = W._polityIndex?.get(o);
      const wear = polity?.weariness || 0;
      if (wear > 0.6 && rng() < 0.04 && (W.build?.[c] || 0) > 0.1) {
        igniteFire(W, c, 0.7, 1);
        W.build[c] *= 0.5;
        if (log) log(W.year, 'war', c, 0.5, `Scorched earth near ${nearestCityName(W, c)}`);
      }
    }

    // Named battle chronicle occasionally (§177).
    if (log && frontLen > 0 && rng() < 0.02) {
      const sample = (W.border && wars.length)
        ? ((W._tickIndex * 97) % NC)
        : 0;
      log(W.year, 'battle', sample, 0.5, `Battle of ${nearestCityName(W, sample)}`);
    }
  }

  W.dark.frontLen = frontLen;
  W.dark.supplyCut = cutCount;
  if (log && frontLen > 0 && (W._tickIndex | 0) - (W._darkLogTick | 0) > 40) {
    W._darkLogTick = W._tickIndex | 0;
    log(W.year, 'war', 0, frontLen / NC, `Front length ${frontLen}`);
  }
}
