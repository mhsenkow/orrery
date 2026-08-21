/** Information & infrastructure — cyber, fog of war, propaganda (dark-400 O §281–300). */

import { NC } from '../sphere.js';
import { rngOf } from './rng.js';
import { relationOf, setRelation } from './diplomacy.js';

export function resetInfo(W) {
  W._gridDown = 0;
  if (!W.fogOfWar || W.fogOfWar.length !== NC) W.fogOfWar = new Float32Array(NC);
  W.fogOfWar.fill(0.85);
  W.dark = W.dark || {};
  W.dark.cyber = 0;
  W.dark.cyberIncidents = 0;
  W.dark.unattributed = 0;
}

/** Cyber attack: EMP-like blackout without a warhead (§281–282). */
export function cyberAttack(W, targetCell, opts = {}) {
  const tick = W._tickIndex | 0;
  const dur = opts.duration != null ? opts.duration : 40;
  W._empUntil = Math.max(W._empUntil || 0, tick + dur);
  W._gridDown = Math.max(W._gridDown || 0, tick + dur);
  W.dark = W.dark || {};
  W.dark.cyberIncidents = (W.dark.cyberIncidents | 0) + 1;

  const attributed = opts.attributed !== false && opts.actor != null;
  if (!attributed) {
    W.dark.unattributed = (W.dark.unattributed | 0) + 1;
    // Unattributed: do not change relations with actual author (§299).
  } else if (opts.actor != null && opts.victim != null) {
    setRelation(W, opts.actor, opts.victim, relationOf(W, opts.actor, opts.victim) - 0.12);
  }

  if (targetCell >= 0 && W.build?.[targetCell] > 0) {
    // Disable function without destroying (§281).
    W.build[targetCell] = Math.max(0.05, W.build[targetCell] * 0.92);
  }
  return { empUntil: W._empUntil, attributed };
}

/** Propaganda shifts willingness to fight (§285). */
export function propaganda(W, fromId, toId, amount = 0.05) {
  const p = W._polityIndex?.get(toId);
  if (!p) return;
  p.willingness = Math.max(0, Math.min(1, (p.willingness ?? 0.5) - amount));
  setRelation(W, fromId, toId, relationOf(W, fromId, toId) - amount * 0.5);
}

export function infoTick(W, log = null) {
  if (!W.fogOfWar || W.fogOfWar.length !== NC) {
    W.fogOfWar = new Float32Array(NC);
    W.fogOfWar.fill(0.85);
  }
  W.dark = W.dark || {};
  const rng = rngOf(W, 'rngGod');
  const tick = W._tickIndex | 0;

  if ((W._empUntil || 0) > tick || (W._gridDown || 0) > tick) {
    W.dark.cyber = (W.dark.cyber | 0) + 1;
  }

  // Reveal own territory; fog elsewhere.
  if (W.owner && (tick % 16) === 0) {
    const player = W.playerPolity ?? -1;
    for (let c = 0; c < NC; c += 3) {
      if (player >= 0 && W.owner[c] === player) W.fogOfWar[c] = 0;
      else W.fogOfWar[c] = Math.min(1, (W.fogOfWar[c] || 0.85) + 0.002);
    }
  }

  // Occasional cyber during war.
  const wars = W.diplo?.wars || [];
  if (wars.length && rng() < 0.01) {
    const war = wars[(rng() * wars.length) | 0];
    const victim = W._polityIndex?.get(war.b);
    const cell = victim?.capital ?? 0;
    const unattr = rng() < 0.4;
    cyberAttack(W, cell, {
      actor: war.a,
      victim: war.b,
      attributed: !unattr,
      duration: 30 + ((rng() * 40) | 0),
    });
    if (log) {
      log(W.year, 'cyber', cell, 0.5,
        unattr ? 'Unattributed grid attack' : 'Cyber attack on grid');
    }
  }

  // Propaganda drip.
  if (wars.length && rng() < 0.02) {
    const war = wars[0];
    propaganda(W, war.a, war.b, 0.03);
  }
}
