/** Information & infrastructure — cyber, fog of war, propaganda (dark-400 O §281–300). */

import { NC } from '../sphere.js';
import { rngOf } from './rng.js';
import { relationOf, setRelation } from './diplomacy.js';

export function resetInfo(W) {
  W._gridDown = 0;
  W._commsSevered = false;
  W.comms = 1; // 1 = intact, 0 = severed
  W.gpsDenied = 0;
  if (!W._cyberMask || W._cyberMask.length !== NC) {
    W._cyberMask = new Float32Array(NC);
  } else {
    W._cyberMask.fill(0);
  }
  if (!W.buildEfficiency || W.buildEfficiency.length !== NC) {
    W.buildEfficiency = new Float32Array(NC);
  }
  W.buildEfficiency.fill(1);
  if (!W.fogOfWar || W.fogOfWar.length !== NC) W.fogOfWar = new Float32Array(NC);
  W.fogOfWar.fill(0.85);
  W.dark = W.dark || {};
  W.dark.cyber = 0;
  W.dark.cyberIncidents = 0;
  W.dark.unattributed = 0;
  W.dark.blackoutTicks = 0;
  W.dark.cableCuts = 0;
  W.dark.financialHits = 0;
  W.dark.attributionHits = 0;
  W.dark.attributionMisses = 0;
  W.dark.comms = 1;
}

/** Effective build function under cyber mask (§281) — does not destroy build. */
export function buildFunction(W, cell) {
  const c = cell | 0;
  if (c < 0 || c >= NC) return 0;
  const b = W.build?.[c] || 0;
  const mask = W._cyberMask?.[c] || 0;
  const eff = W.buildEfficiency?.[c] ?? 1;
  return b * Math.max(0, (1 - mask) * eff);
}

/** Cyber attack: disable function / grid without warhead (§281–282). */
export function cyberAttack(W, targetCell, opts = {}) {
  const tick = W._tickIndex | 0;
  const dur = opts.duration != null ? opts.duration : 40;
  const kind = opts.kind || 'grid';

  if (kind === 'grid' || kind === 'emp') {
    W._empUntil = Math.max(W._empUntil || 0, tick + dur);
    W._gridDown = Math.max(W._gridDown || 0, tick + dur);
  }

  W.dark = W.dark || {};
  W.dark.cyberIncidents = (W.dark.cyberIncidents | 0) + 1;

  const attributed = opts.attributed !== false && opts.actor != null;
  if (!attributed) {
    W.dark.unattributed = (W.dark.unattributed | 0) + 1;
    W.dark.attributionMisses = (W.dark.attributionMisses | 0) + 1;
    // Unattributed: do not change relations with actual author (§299).
  } else if (opts.actor != null && opts.victim != null) {
    const before = relationOf(W, opts.actor, opts.victim);
    setRelation(W, opts.actor, opts.victim, before - 0.12);
    W.dark.attributionHits = (W.dark.attributionHits | 0) + 1;
  }

  if (targetCell >= 0 && targetCell < NC) {
    // Disable function without destroying (§281).
    if (!W._cyberMask || W._cyberMask.length !== NC) W._cyberMask = new Float32Array(NC);
    if (!W.buildEfficiency || W.buildEfficiency.length !== NC) {
      W.buildEfficiency = new Float32Array(NC);
      W.buildEfficiency.fill(1);
    }
    W._cyberMask[targetCell] = Math.min(1, (W._cyberMask[targetCell] || 0) + 0.55);
    W.buildEfficiency[targetCell] = Math.max(0.05,
      (W.buildEfficiency[targetCell] ?? 1) * 0.55);
  }

  if (kind === 'water' || kind === 'rail' || kind === 'port') {
    // Control-system hits also cut local efficiency (§283).
    if (targetCell >= 0 && W.buildEfficiency) {
      W.buildEfficiency[targetCell] = Math.max(0.05,
        (W.buildEfficiency[targetCell] ?? 1) * 0.4);
    }
  }

  return { empUntil: W._empUntil, attributed, kind };
}

/** Sever communications — breaks command & control / launch odds (§284 / §298). */
export function severComms(W, untilTick = null) {
  W.comms = 0;
  W._commsSevered = true;
  W._commsUntil = untilTick != null
    ? untilTick
    : (W._tickIndex | 0) + 60;
  W.dark = W.dark || {};
  W.dark.comms = 0;
  return true;
}

/** Launch probability multiplier when comms are down (§298). */
export function commsLaunchFactor(W) {
  if ((W.comms ?? 1) <= 0.15 || W._commsSevered) return 0.35;
  return 0.55 + (W.comms || 1) * 0.45;
}

/** Propaganda shifts willingness / weariness (§285). */
export function propaganda(W, fromId, toId, amount = 0.05) {
  const p = W._polityIndex?.get(toId);
  if (!p) return;
  p.willingness = Math.max(0, Math.min(1, (p.willingness ?? 0.5) - amount));
  p.weariness = Math.max(0, Math.min(1, (p.weariness ?? 0) + amount * 0.8));
  setRelation(W, fromId, toId, relationOf(W, fromId, toId) - amount * 0.5);
}

/** Misinformation that triggers a false early-warning decision (§287). */
export function misinfoFalseWarning(W, defenderId, suspectId, log = null) {
  W._falseWarning = {
    defender: defenderId,
    suspect: suspectId,
    tick: W._tickIndex | 0,
  };
  W.dark = W.dark || {};
  W.dark.misinfo = (W.dark.misinfo | 0) + 1;
  if (log) {
    const d = W._polityIndex?.get(defenderId);
    log(W.year, 'cyber', d?.capital ?? 0, 0.45,
      `${d?.name || defenderId} acts on false early-warning`);
  }
  return W._falseWarning;
}

/** Undersea cable cut — deniable (§289). */
export function cableCut(W, opts = {}) {
  W.comms = Math.max(0, (W.comms ?? 1) - 0.4);
  if ((W.comms || 0) < 0.2) {
    W._commsSevered = true;
    W._commsUntil = (W._tickIndex | 0) + (opts.duration || 50);
  }
  W.dark = W.dark || {};
  W.dark.cableCuts = (W.dark.cableCuts | 0) + 1;
  const attributed = opts.attributed === true && opts.actor != null;
  if (attributed && opts.victim != null) {
    setRelation(W, opts.actor, opts.victim, relationOf(W, opts.actor, opts.victim) - 0.06);
    W.dark.attributionHits = (W.dark.attributionHits | 0) + 1;
  } else {
    W.dark.unattributed = (W.dark.unattributed | 0) + 1;
    W.dark.attributionMisses = (W.dark.attributionMisses | 0) + 1;
  }
  return { attributed };
}

/** Financial attack hitting build growth (§290). */
export function financialAttack(W, polityId, severity = 0.15) {
  const p = W._polityIndex?.get(polityId);
  if (!p) return 0;
  p._finShock = Math.min(1, (p._finShock || 0) + severity);
  W.dark = W.dark || {};
  W.dark.financialHits = (W.dark.financialHits | 0) + 1;
  // Soften build at capital without destroying.
  const cap = p.capital | 0;
  if (cap >= 0 && W.buildEfficiency) {
    if (!W.buildEfficiency || W.buildEfficiency.length !== NC) {
      W.buildEfficiency = new Float32Array(NC);
      W.buildEfficiency.fill(1);
    }
    W.buildEfficiency[cap] = Math.max(0.1,
      (W.buildEfficiency[cap] ?? 1) * (1 - severity));
  }
  return p._finShock;
}

/** GPS denial worsens CEP (§288 / §310 via W.gpsDenied). */
export function denyGps(W, level = 0.5, duration = 80) {
  W.gpsDenied = Math.max(W.gpsDenied || 0, Math.min(1, level));
  W._gpsUntil = (W._tickIndex | 0) + duration;
  return W.gpsDenied;
}

/** Assert severed comms degrade launch odds (§298). */
export function assertCommsDegradeLaunch(factorSevered, factorOk) {
  if (!(factorSevered < factorOk * 0.7)) {
    throw new Error(`comms factor ${factorSevered} should be << intact ${factorOk}`);
  }
}

/** Assert unattributed attack leaves author relations unchanged (§299). */
export function assertUnattributedNoRelationChange(before, after) {
  if (Math.abs(before - after) > 1e-9) {
    throw new Error(`unattributed attack changed relation ${before}→${after}`);
  }
}

export function infoTick(W, log = null) {
  if (!W.fogOfWar || W.fogOfWar.length !== NC) {
    W.fogOfWar = new Float32Array(NC);
    W.fogOfWar.fill(0.85);
  }
  if (!W._cyberMask || W._cyberMask.length !== NC) W._cyberMask = new Float32Array(NC);
  if (!W.buildEfficiency || W.buildEfficiency.length !== NC) {
    W.buildEfficiency = new Float32Array(NC);
    W.buildEfficiency.fill(1);
  }
  W.dark = W.dark || {};
  const rng = rngOf(W, 'rngGod');
  const tick = W._tickIndex | 0;

  // Restore comms after timeout.
  if (W._commsUntil != null && tick >= W._commsUntil) {
    W._commsSevered = false;
    W.comms = Math.min(1, (W.comms || 0) + 0.5);
    W._commsUntil = null;
  }
  if ((W.comms ?? 1) < 1 && !W._commsSevered) {
    W.comms = Math.min(1, (W.comms || 0) + 0.01);
  }
  W.dark.comms = W.comms ?? 1;

  // GPS denial expires.
  if (W._gpsUntil != null && tick >= W._gpsUntil) {
    W.gpsDenied = Math.max(0, (W.gpsDenied || 0) * 0.5);
    if (W.gpsDenied < 0.05) { W.gpsDenied = 0; W._gpsUntil = null; }
  }

  if ((W._empUntil || 0) > tick || (W._gridDown || 0) > tick) {
    W.dark.cyber = (W.dark.cyber | 0) + 1;
    W.dark.blackoutTicks = (W.dark.blackoutTicks | 0) + 1;
  }

  // Decay cyber mask / recover efficiency slowly.
  if (tick % 8 === 0) {
    for (let c = 0; c < NC; c += 5) {
      if (W._cyberMask[c] > 0) W._cyberMask[c] *= 0.97;
      if (W.buildEfficiency[c] < 1) {
        W.buildEfficiency[c] = Math.min(1, W.buildEfficiency[c] + 0.01);
      }
    }
  }

  // Fog of war over owner/arsenals — reveal own, hide others (§297).
  if (W.owner && (tick % 16) === 0) {
    const player = W.playerPolity ?? -1;
    for (let c = 0; c < NC; c += 3) {
      if (player >= 0 && W.owner[c] === player) W.fogOfWar[c] = 0;
      else W.fogOfWar[c] = Math.min(1, (W.fogOfWar[c] || 0.85) + 0.002);
    }
    // Obscure rival arsenalPublic under fog.
    for (const p of W.polities || []) {
      if (player >= 0 && p.id === player) {
        p.arsenalPublic = p.arsenal || 0;
      } else {
        const fog = 0.4 + rng() * 0.5;
        p.arsenalPublic = Math.max(0, (p.arsenal || 0) * fog);
      }
    }
  }

  // Recon sats lift fog (§302 hook via orbit kinds).
  if (W.sats?.length) {
    let recon = 0;
    for (const s of W.sats) if (s.alive && s.kind === 'recon') recon++;
    if (recon > 0 && tick % 20 === 0) {
      for (let c = 0; c < NC; c += Math.max(3, 11 - recon)) {
        W.fogOfWar[c] = Math.max(0, (W.fogOfWar[c] || 0.85) - 0.04 * recon);
      }
    }
  }

  const wars = W.diplo?.wars || [];
  if (wars.length && rng() < 0.01) {
    const war = wars[(rng() * wars.length) | 0];
    const victim = W._polityIndex?.get(war.b);
    const cell = victim?.capital ?? 0;
    const unattr = rng() < 0.4;
    const kind = rng() < 0.5 ? 'grid' : 'cyber';
    cyberAttack(W, cell, {
      actor: war.a,
      victim: war.b,
      attributed: !unattr,
      duration: 30 + ((rng() * 40) | 0),
      kind,
    });
    if (log) {
      log(W.year, 'cyber', cell, 0.5,
        unattr ? 'Unattributed grid attack' : 'Cyber attack on grid');
    }
  }

  // Cable cuts during war (§289).
  if (wars.length && rng() < 0.004) {
    const war = wars[0];
    cableCut(W, { actor: war.a, victim: war.b, attributed: rng() < 0.35 });
    if (log) log(W.year, 'cyber', 0, 0.4, 'Undersea cable cut');
  }

  // Financial attacks (§290).
  if (wars.length && rng() < 0.006) {
    financialAttack(W, wars[0].b, 0.12 + rng() * 0.2);
  }

  // GPS denial during high-tech war (§288).
  if (wars.length && (W.unlockedClass || 0) >= 5 && rng() < 0.005) {
    denyGps(W, 0.4 + rng() * 0.5, 40 + ((rng() * 40) | 0));
  }

  // Propaganda drip (§285).
  if (wars.length && rng() < 0.02) {
    const war = wars[0];
    propaganda(W, war.a, war.b, 0.03);
  }

  // Misinformation → false early warning (§287).
  if (wars.length && rng() < 0.003) {
    const war = wars[0];
    misinfoFalseWarning(W, war.b, war.a, log);
  }

  // Attribution accuracy for probe (§300).
  const hits = W.dark.attributionHits | 0;
  const misses = W.dark.attributionMisses | 0;
  W.dark.attributionAccuracy = (hits + misses)
    ? hits / (hits + misses)
    : 1;
}
