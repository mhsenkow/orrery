/** Deterrence and escalation — arsenals, doctrine, early warning.
 *
 *  A launch today is a tool click. This module is the decision *not* to click:
 *  arsenal growth, doctrine branches, detected flights, launch-on-warning,
 *  dead-hand after a capital falls, and a doomsday clock you can read.
 *
 *  dark-400 group C (41–60).
 */

import { NC, DIR } from '../sphere.js';
import { rngOf } from './rng.js';
import { launch, pickLaunchSite } from './ordnance.js';
import { capitalOf, polityAt } from './polity.js';
import { relationOf, setRelation, noteCasus, openWar, areAllied } from './diplomacy.js';
import { earlyWarnDelayBonus } from './darkOrbit.js';
import { irradiate } from './anthro.js';
import { noteWarCrime } from './dark.js';
import { noteSlbmLaunch } from './darkNaval.js';

/** Named escalation ladder rungs (§44). Index stored in W.escalationRung. */
export const ESCALATION_RUNGS = Object.freeze([
  'diplomatic', 'conventional', 'limited_nuke', 'strategic',
]);
const RUNG_LIMITED_NUKE = 2;

export function resetDeterrence(W) {
  W.doomsday = 0;
  W.exchangesConsidered = 0;
  W.exchangesLaunched = 0;
  W.exchangesRetaliated = 0;
  W.exchangesDeclined = 0;
  W._deterrenceLog = [];
  W.crisisStability = 0.5;
  W.hotline = false;
  W.escalationRung = 0;
  W._ladderShots = 0;
  W._ladderQuiet = 0;
  W.exchangeTimeline = [];
  W.accidentalLaunches = 0;
  W.accidentalRecalls = 0;
  W.nuclearTests = 0;
  W.proliferations = 0;
  W.disarmamentCaught = 0;
  if (W.diplo) {
    W.diplo.hotlines = new Set();
  }
}

function ensureCounters(W) {
  if (W.exchangesConsidered == null) W.exchangesConsidered = 0;
  if (W.exchangesLaunched == null) W.exchangesLaunched = 0;
  if (W.exchangesRetaliated == null) W.exchangesRetaliated = 0;
  if (W.exchangesDeclined == null) W.exchangesDeclined = 0;
  if (W.doomsday == null) W.doomsday = 0;
  if (!W.exchangeTimeline) W.exchangeTimeline = [];
  if (W.accidentalLaunches == null) W.accidentalLaunches = 0;
  if (W.accidentalRecalls == null) W.accidentalRecalls = 0;
  if (W.nuclearTests == null) W.nuclearTests = 0;
  if (W.proliferations == null) W.proliferations = 0;
  if (W.disarmamentCaught == null) W.disarmamentCaught = 0;
  if (W.escalationRung == null) W.escalationRung = 0;
}

function pairKey(a, b) {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

function ensureHotlines(W) {
  if (!W.diplo) {
    W.diplo = {
      relations: new Map(), casus: [], wars: [], alliances: new Map(),
      naps: [], warNames: new Map(), trade: new Map(), hotlines: new Set(),
    };
  }
  if (!(W.diplo.hotlines instanceof Set)) {
    W.diplo.hotlines = new Set(W.diplo.hotlines || []);
  }
  return W.diplo.hotlines;
}

/** True if a global hotline flag or a pairwise hotline exists (§52). */
export function hasHotline(W, a, b) {
  if (W.hotline) return true;
  const set = W.diplo?.hotlines;
  if (!set) return false;
  if (a == null || b == null || a < 0 || b < 0) return set.size > 0;
  return set.has(pairKey(a, b));
}

/** Open a direct line between two polities — lowers accidental-exchange odds (§52). */
export function openHotline(W, a, b) {
  if (a == null || b == null || a < 0 || b < 0 || a === b) return false;
  const set = ensureHotlines(W);
  set.add(pairKey(a, b));
  W.hotline = true;
  return true;
}

/** Append to the exchange timeline; capped at 64 (§58). */
function noteExchange(W, kind, from, to, note) {
  if (!W.exchangeTimeline) W.exchangeTimeline = [];
  W.exchangeTimeline.push({
    tick: W._tickIndex | 0,
    year: W.year ?? W.ageYr ?? 0,
    kind,
    from: from ?? -1,
    to: to ?? -1,
    note: note || kind,
  });
  if (W.exchangeTimeline.length > 64) {
    W.exchangeTimeline.splice(0, W.exchangeTimeline.length - 64);
  }
}

/**
 * Advance the escalation ladder one rung toward `toRung` (§44).
 * `toRung` may be a name or index. Returns the new rung index, or -1 if no-op.
 */
export function escalate(W, fromPolity, toRung, log = null) {
  ensureCounters(W);
  let target = typeof toRung === 'string'
    ? ESCALATION_RUNGS.indexOf(toRung)
    : (toRung | 0);
  if (target < 0) target = 0;
  if (target >= ESCALATION_RUNGS.length) target = ESCALATION_RUNGS.length - 1;

  const cur = W.escalationRung | 0;
  if (target <= cur) return cur;

  // One rung at a time — a decision, not a slider.
  W.escalationRung = cur + 1;
  const name = ESCALATION_RUNGS[W.escalationRung];
  const from = W._polityIndex?.get(fromPolity);
  const label = from?.name || (fromPolity >= 0 ? `polity ${fromPolity}` : 'powers');
  if (log) {
    log(W.year, 'deter', from?.capital ?? 0, 0.45,
      `${label} escalates to ${name.replace('_', ' ')}`);
  }
  noteExchange(W, 'escalate', fromPolity, -1, `escalates to ${name}`);
  return W.escalationRung;
}

/** Grow arsenals from build + unlockedClass (§41). Public estimate lags (§42).
 *  Stockpile decays without maintenance (§73). Growth gated on fissile (§74). */
function growArsenals(W) {
  const tech = Math.max(0, ((W.unlockedClass || 0) - 4) / 3);
  const own = W.owner;
  for (const p of W.polities || []) {
    if ((p.cells | 0) < 4) continue;

    // Plutonium / enrichment from ore on owned cells (§74).
    let oreSum = 0, oreN = 0;
    if (own && W.ore) {
      for (let c = 0; c < NC; c += 7) {
        if (own[c] !== p.id) continue;
        oreSum += W.ore[c] || 0;
        oreN++;
      }
    }
    const oreMean = oreN ? oreSum / oreN : 0;
    p.fissile = Math.min(100, (p.fissile || 0) + oreMean * (p.build || 0) * 0.015 * Math.max(0.2, tech));

    // Decay when industry cannot maintain the stockpile (§73).
    const maintain = (p.build || 0);
    if (maintain < 0.25 && (p.arsenal || 0) > 0) {
      const decay = (0.25 - maintain) * 0.008 * (p.arsenal || 0);
      p.arsenal = Math.max(0, (p.arsenal || 0) - decay);
      p.arsenalPublic = Math.max(0, (p.arsenalPublic || 0) - decay * 0.5);
      continue;
    }

    if (tech <= 0) continue;
    // Arsenal growth consumes fissile (§74).
    const fissileGate = Math.min(1, (p.fissile || 0) / 3);
    const growth = (p.build || 0) * 0.002 * tech * fissileGate;
    if (growth < 0.0005) continue;
    const add = Math.min(growth, (p.fissile || 0) * 0.1);
    p.arsenal = Math.min(200, (p.arsenal || 0) + add);
    p.fissile = Math.max(0, (p.fissile || 0) - add * 0.8);
    const pub = p.arsenalPublic ?? p.arsenal;
    p.arsenalPublic = pub + (p.arsenal - pub) * 0.08;
  }
}

/** Stockpile decay without build maintenance (§73). */
function stockpileDecay(W) {
  for (const p of W.polities || []) {
    const stock = p.arsenal || 0;
    if (stock <= 0) continue;
    const maint = Math.min(0.004, (p.build || 0) * 0.0008);
    const decay = 0.003 - maint;
    if (decay > 0) {
      p.arsenal = Math.max(0, stock - decay);
      if (p.arsenalPublic != null) {
        p.arsenalPublic = Math.max(0, p.arsenalPublic - decay * 0.6);
      }
    }
  }
}

/** Surviving SSBNs for a polity (§47). */
function survivingSubs(W, polityId) {
  return (W.ships || []).filter((s) =>
    !s.dead && s.kind === 'sub' && s.owner === polityId);
}

/** Flag second-strike when a polity fields a sub (§47). */
function markSecondStrike(W) {
  for (const p of W.polities || []) {
    p.secondStrike = survivingSubs(W, p.id).length > 0;
  }
}

/** Mark inbound flights detected some ticks before impact (§45). */
function earlyWarning(W, log) {
  const flights = W.flight || [];
  if (!flights.length) return;
  const rng = rngOf(W, 'rngGod');
  const ewBonus = earlyWarnDelayBonus(W); // early-warn sats detect sooner (§303)
  for (const f of flights) {
    if (f.dead) continue;
    const remain = (f.path?.length || 0) - 1 - Math.floor(f.at || 0);
    // Detect once the warhead is midcourse and not fully stealthy.
    // EW sats raise the remain ceiling so detection happens with more lead time.
    if (!f.detected && remain > 2 && remain < (18 + ewBonus)) {
      const pDet = 0.55 + (1 - (f.stealth || 0)) * 0.4 + ewBonus * 0.02;
      if (rng() < pDet) {
        f.detected = true;
        f.detectedAt = W._tickIndex | 0;
        const toId = polityAt(W, f.to);
        const fromId = polityAt(W, f.from);
        if (log && toId >= 0) {
          const p = W._polityIndex?.get(toId);
          log(W.year, 'warn', f.to, 0.6,
            `${p?.name || toId} detects inbound ${f.label || 'missile'}`);
        }
        if (toId >= 0 && fromId >= 0 && toId !== fromId) {
          maybeLaunchOnWarning(W, toId, fromId, f, log);
        }
      }
    }
  }

  // Rare false positive when no real inbound (§46).
  if (!flights.some((f) => f.detected) && (W.polities || []).length >= 2 && rng() < 0.0015) {
    const pols = W.polities;
    const defender = pols[(rng() * pols.length) | 0];
    const suspect = pols[(rng() * pols.length) | 0];
    if (defender && suspect && defender.id !== suspect.id && defender.doctrine === 'warning') {
      // Belief check: reputation + hotline lower the odds of believing a ghost.
      const line = hasHotline(W, defender.id, suspect.id);
      const believe = 0.35 - (line ? 0.2 : 0) - ((defender.reputation || 0.5) - 0.5) * 0.2;
      if (rng() < believe) {
        if (log) {
          log(W.year, 'warn', defender.capital, 0.4,
            `${defender.name} false alarm — launch-on-warning`);
        }
        considerLaunch(W, defender.id, suspect.id, log, { retaliate: true, falseAlarm: true });
      } else if (log) {
        log(W.year, 'warn', defender.capital, 0.2,
          `${defender.name} dismisses a false warning`);
      }
    }
  }
}

function pickSilo(W, fromId) {
  // Prefer a built cell inside the launching polity, not a global max (§13).
  let best = -1, bestB = 0;
  const own = W.owner;
  if (!own) return capitalOf(W, fromId);
  for (let c = 0; c < NC; c++) {
    if (own[c] !== fromId) continue;
    const b = W.build?.[c] || 0;
    if (b > bestB) { bestB = b; best = c; }
  }
  return best >= 0 ? best : capitalOf(W, fromId);
}

function pickEnemyTarget(W, fromId, toId) {
  const cap = capitalOf(W, toId);
  if (cap >= 0) return cap;
  let best = -1, bestB = 0;
  const own = W.owner;
  if (!own) return -1;
  for (let c = 0; c < NC; c++) {
    if (own[c] !== toId) continue;
    const b = W.build?.[c] || 0;
    if (b > bestB) { bestB = b; best = c; }
  }
  return best;
}

function maybeLaunchOnWarning(W, defenderId, attackerId, flight, log) {
  const p = W._polityIndex?.get(defenderId);
  if (!p) return;
  if (p.doctrine === 'nofirst') {
    // No-first-use does not fire on warning alone (§59).
    if (log) {
      log(W.year, 'deter', p.capital, 0.2,
        `${p.name} holds — no-first-use`);
    }
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    noteExchange(W, 'decline', defenderId, attackerId, `${p.name} holds — no-first-use`);
    return;
  }
  if (p.doctrine === 'warning' || p.doctrine === 'retaliate') {
    considerLaunch(W, defenderId, attackerId, log, {
      retaliate: true,
      cause: 'warning',
      aim: flight?.from,
    });
  }
}

/**
 * Decide whether to launch. Returns 'declined' | 'launched'.
 * Counts W.exchangesConsidered / Launched / Retaliated (§50).
 */
export function considerLaunch(W, fromPolity, toPolity, log = null, opts = {}) {
  ensureCounters(W);
  W.exchangesConsidered = (W.exchangesConsidered | 0) + 1;
  noteExchange(W, 'consider', fromPolity, toPolity, 'considers launch');

  const from = W._polityIndex?.get(fromPolity);
  const to = W._polityIndex?.get(toPolity);
  if (!from || !to || fromPolity === toPolity) {
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    noteExchange(W, 'decline', fromPolity, toPolity, 'invalid pair');
    return 'declined';
  }
  if (areAllied(W, fromPolity, toPolity)) {
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    noteExchange(W, 'decline', fromPolity, toPolity, 'allied');
    return 'declined';
  }
  if ((from.arsenal || 0) < 1) {
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    noteExchange(W, 'decline', fromPolity, toPolity, 'no arsenal');
    return 'declined';
  }

  const doctrine = from.doctrine || 'nofirst';
  const retaliate = !!opts.retaliate;
  const rel = relationOf(W, fromPolity, toPolity);
  const atWar = (W.diplo?.wars || []).some((w) =>
    (w.a === fromPolity && w.b === toPolity) || (w.a === toPolity && w.b === fromPolity));

  // Doctrine gate (§43, §59).
  if (doctrine === 'nofirst' && !retaliate) {
    if (log) {
      log(W.year, 'deter', from.capital, 0.3,
        `${from.name} declines — no-first-use`);
    }
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    noteExchange(W, 'decline', fromPolity, toPolity, 'no-first-use');
    return 'declined';
  }

  // AI considers nuclear launch only at limited_nuke+ (§44).
  if (!opts.accidental && !retaliate && (W.escalationRung | 0) < RUNG_LIMITED_NUKE) {
    if (log) {
      log(W.year, 'deter', from.capital, 0.25,
        `${from.name} holds — below nuclear rung`);
    }
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    noteExchange(W, 'decline', fromPolity, toPolity, 'below nuclear rung');
    return 'declined';
  }

  // Crisis stability: how much is gained by striking first (§51).
  const firstStrikeGain = Math.max(0, -rel) * 0.4 + (opts.falseAlarm ? 0.15 : 0)
    + (atWar ? 0.35 : 0) + (doctrine === 'retaliate' && atWar ? 0.25 : 0);
  W.crisisStability = Math.max(0, Math.min(1, 1 - firstStrikeGain));
  const hotlineCut = hasHotline(W, fromPolity, toPolity) ? 0.25 : 0;
  const rng = rngOf(W, 'rngGod');
  let pLaunch = retaliate
    ? (doctrine === 'retaliate' ? 0.92 : doctrine === 'warning' ? 0.7 : 0.15)
    : Math.max(0.05, Math.min(0.9, firstStrikeGain - hotlineCut - (from.reputation || 0.5) * 0.05));
  // Severed comms break command & control — launch odds collapse (§284 / §298).
  if ((W.comms ?? 1) < 0.2 || W._commsSevered) {
    pLaunch *= 0.35;
  }

  if (rng() > pLaunch) {
    if (log) {
      log(W.year, 'deter', from.capital, 0.25,
        `${from.name} considers a launch at ${to.name} — declines`);
    }
    // Choosing not to retaliate is itself chronicle-worthy (§49).
    if (retaliate && log) {
      log(W.year, 'deter', from.capital, 0.5,
        `${from.name} chooses not to retaliate`);
    }
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    noteExchange(W, 'decline', fromPolity, toPolity,
      retaliate ? 'chooses not to retaliate' : 'declines launch');
    return 'declined';
  }

  const fromCell = pickSilo(W, fromPolity);
  const toCell = opts.aim >= 0 ? opts.aim : pickEnemyTarget(W, fromPolity, toPolity);
  if (fromCell < 0 || toCell < 0) {
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    noteExchange(W, 'decline', fromPolity, toPolity, 'no silo or target');
    return 'declined';
  }

  const result = launch(W, fromCell, toCell, 'icbm', { yield: 0.9 });
  if (!result.ok) {
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    noteExchange(W, 'decline', fromPolity, toPolity, result.note || 'launch failed');
    return 'declined';
  }
  from.arsenal = Math.max(0, (from.arsenal || 0) - 1);
  from.arsenalPublic = Math.max(0, (from.arsenalPublic || 0) - 0.7);
  W.exchangesLaunched = (W.exchangesLaunched | 0) + 1;
  if (retaliate) {
    W.exchangesRetaliated = (W.exchangesRetaliated | 0) + 1;
    noteExchange(W, 'retaliate', fromPolity, toPolity, `${from.name} retaliates at ${to.name}`);
  } else {
    noteExchange(W, 'launch', fromPolity, toPolity, `${from.name} launches at ${to.name}`);
  }

  noteCasus(W, toPolity, fromPolity, 'strike', toCell, 'a nuclear strike');
  if (!opts.skipWar) {
    openWar(W, toPolity, fromPolity, {
      kind: 'strike', cell: toCell, label: 'a nuclear strike',
    }, log);
  }
  if (log) {
    log(W.year, 'war', fromCell, 1,
      `${from.name} launches at ${to.name}`
      + (retaliate ? ' (retaliation)' : ''));
  }
  return 'launched';
}

/** Second-strike SLBM from a surviving sub (§47). */
function launchSecondStrike(W, p, foeId, log) {
  const subs = survivingSubs(W, p.id);
  if (!subs.length || (p.arsenal || 0) < 1) return false;
  const foe = W._polityIndex?.get(foeId);
  if (!foe) return false;
  const toCell = pickEnemyTarget(W, p.id, foeId);
  if (toCell < 0) return false;

  const sub = subs[0];
  let fromCell = sub.cell | 0;
  // Prefer pickLaunchSite toward the target when the sub cell is awkward.
  const site = pickLaunchSite(W, p.id, toCell, 'slbm');
  if (site >= 0) fromCell = site;
  else fromCell = sub.cell | 0;

  const result = launch(W, fromCell, toCell, 'slbm', {
    yield: 0.75,
    ownerPolity: p.id,
    targetPolity: foeId,
  });
  if (!result.ok) return false;

  noteSlbmLaunch(W, sub);
  p.arsenal = Math.max(0, (p.arsenal || 0) - 1);
  p.arsenalPublic = Math.max(0, (p.arsenalPublic || 0) - 0.5);
  p.secondStrike = true;
  ensureCounters(W);
  W.exchangesLaunched = (W.exchangesLaunched | 0) + 1;
  W.exchangesRetaliated = (W.exchangesRetaliated | 0) + 1;
  noteExchange(W, 'retaliate', p.id, foeId, `${p.name} second-strike from sub`);
  noteCasus(W, foeId, p.id, 'strike', toCell, 'a second-strike SLBM');
  openWar(W, foeId, p.id, {
    kind: 'strike', cell: toCell, label: 'a second-strike SLBM',
  }, log);
  if (log) {
    log(W.year, 'war', fromCell, 1,
      `${p.name} second-strike SLBM at ${foe.name}`);
  }
  return true;
}

/** Dead-hand: capital gone but arsenal remains → retaliate (§48). */
function deadHand(W, log) {
  for (const p of W.polities || []) {
    if ((p.arsenal || 0) < 1) continue;
    const cap = p.capital;
    const capGone = cap < 0
      || (W.build?.[cap] || 0) < 0.05
      || (W.rad?.[cap] || 0) > 0.4
      || (W.owner && W.owner[cap] !== p.id);
    if (!capGone) continue;
    if (p.doctrine !== 'retaliate' && !p.deadHand) continue;
    // Find who hurt them — worst relation at war, else worst relation.
    let foe = -1, worst = 0;
    const wars = W.diplo?.wars || [];
    for (const w of wars) {
      if (w.a === p.id) { foe = w.b; break; }
      if (w.b === p.id) { foe = w.a; break; }
    }
    if (foe < 0) {
      for (const q of W.polities) {
        if (q.id === p.id) continue;
        const r = relationOf(W, p.id, q.id);
        if (r < worst) { worst = r; foe = q.id; }
      }
    }
    if (foe < 0) continue;

    // Prefer surviving SSBNs when the capital is gone (§47).
    if (survivingSubs(W, p.id).length) {
      if (log) {
        log(W.year, 'deter', cap, 1,
          `${p.name} second-strike after the capital falls`);
      }
      p.deadHand = false;
      if (launchSecondStrike(W, p, foe, log)) continue;
    }

    if (log) {
      log(W.year, 'deter', cap, 1,
        `${p.name} dead-hand fires after the capital falls`);
    }
    p.deadHand = false;
    considerLaunch(W, p.id, foe, log, { retaliate: true, cause: 'deadhand' });
  }
}

/** Rare accidental launch + recall attempt (§53). Hotline lowers odds. */
function accidentalLaunch(W, log) {
  const pols = W.polities || [];
  if (pols.length < 2) return;
  const rng = rngOf(W, 'rngGod');
  const doom = W.doomsday || 0;
  let pAcc = 0.0008 * doom;
  // Any open hotline (global or pairwise) reduces accidental odds.
  if (W.hotline || (W.diplo?.hotlines?.size | 0) > 0) pAcc *= 0.35;
  if (rng() >= pAcc) return;

  const from = pols[(rng() * pols.length) | 0];
  let to = pols[(rng() * pols.length) | 0];
  if (!from || !to || from.id === to.id) return;
  if ((from.arsenal || 0) < 1) return;

  const fromCell = pickSilo(W, from.id);
  const toCell = pickEnemyTarget(W, from.id, to.id);
  if (fromCell < 0 || toCell < 0) return;

  const result = launch(W, fromCell, toCell, 'icbm', {
    yield: 0.6,
    ownerPolity: from.id,
    targetPolity: to.id,
  });
  if (!result.ok) return;

  from.arsenal = Math.max(0, (from.arsenal || 0) - 1);
  W.accidentalLaunches = (W.accidentalLaunches | 0) + 1;
  W.exchangesLaunched = (W.exchangesLaunched | 0) + 1;
  noteExchange(W, 'launch', from.id, to.id, `accidental launch ${from.name}→${to.name}`);
  if (log) {
    log(W.year, 'war', fromCell, 0.9,
      `Accidental launch from ${from.name} toward ${to.name}`);
  }

  // 40% chance of recall (§53).
  if (rng() < 0.4 && result.flight) {
    result.flight.dead = true;
    W.accidentalRecalls = (W.accidentalRecalls | 0) + 1;
    noteExchange(W, 'recall', from.id, to.id, 'recalled');
    if (log) {
      log(W.year, 'deter', fromCell, 0.7,
        `${from.name} recalls an accidental launch`);
    }
  } else {
    noteCasus(W, to.id, from.id, 'strike', toCell, 'an accidental nuclear launch');
    openWar(W, to.id, from.id, {
      kind: 'strike', cell: toCell, label: 'an accidental nuclear launch',
    }, log);
  }
}

/** Pick a remote low-build cell for a nuclear test (§54). */
function pickRemoteTestSite(W, polityId) {
  const cap = capitalOf(W, polityId);
  let best = -1, bestScore = -1e9;
  const own = W.owner;
  for (let c = 0; c < NC; c++) {
    if (own && own[c] !== polityId) continue;
    const build = W.build?.[c] || 0;
    if (build > 0.25) continue;
    let score = 1 - build;
    if (cap >= 0) {
      const dot = DIR[c * 3] * DIR[cap * 3]
        + DIR[c * 3 + 1] * DIR[cap * 3 + 1]
        + DIR[c * 3 + 2] * DIR[cap * 3 + 2];
      score += (1 - dot) * 2; // prefer antipodal / remote
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (best >= 0) return best;
  // Fallback: any low-build cell on the globe.
  for (let c = 0; c < NC; c++) {
    if ((W.build?.[c] || 0) < 0.1) return c;
  }
  return capitalOf(W, polityId);
}

/** Conduct a visible nuclear test — fallout + diplomatic cost (§54). */
export function conductTest(W, polityId, log = null) {
  ensureCounters(W);
  const p = W._polityIndex?.get(polityId);
  if (!p || (p.arsenal || 0) <= 2) return { ok: false, note: 'insufficient arsenal' };
  if ((W.unlockedClass || 0) < 5) return { ok: false, note: 'tech too low' };

  const cell = pickRemoteTestSite(W, polityId);
  if (cell < 0) return { ok: false, note: 'no test site' };

  irradiate(W, cell, 0.55, 1);
  p.arsenal = Math.max(0, (p.arsenal || 0) - 0.15);
  p.arsenalPublic = Math.max(p.arsenalPublic ?? 0, (p.arsenal || 0) + 0.5);
  W.nuclearTests = (W.nuclearTests | 0) + 1;

  // Relation penalty with all neighbours (other polities).
  for (const q of W.polities || []) {
    if (q.id === polityId) continue;
    setRelation(W, polityId, q.id, relationOf(W, polityId, q.id) - 0.08);
  }

  noteExchange(W, 'test', polityId, -1, `${p.name} nuclear test`);
  if (log) {
    log(W.year, 'deter', cell, 0.55,
      `${p.name} conducts a nuclear test`);
  }
  return { ok: true, cell };
}

function maybeNuclearTests(W, log) {
  if (((W._tickIndex | 0) % 80) !== 0) return;
  if ((W.unlockedClass || 0) < 5) return;
  const rng = rngOf(W, 'rngGod');
  for (const p of W.polities || []) {
    if ((p.arsenal || 0) <= 2) continue;
    if (rng() < 0.12) conductTest(W, p.id, log);
  }
}

/** Arsenals leak along trade links to low-arsenal partners (§55). */
function proliferation(W, log) {
  const trade = W.diplo?.trade;
  if (!trade || !(trade instanceof Map) || !trade.size) return;
  const rng = rngOf(W, 'rngGod');
  for (const [key, strength] of trade) {
    if ((strength || 0) < 0.15) continue;
    const [a, b] = key.split(',').map(Number);
    const pa = W._polityIndex?.get(a);
    const pb = W._polityIndex?.get(b);
    if (!pa || !pb) continue;

    const tryLeak = (donor, recv) => {
      const da = donor.arsenal || 0;
      const ra = recv.arsenal || 0;
      if (da < 3 || ra >= da * 0.6 || ra >= 4) return;
      if (rng() >= 0.04 * strength) return;
      const leak = Math.min(0.35, da * 0.02 * strength);
      donor.arsenal = Math.max(0, da - leak * 0.25);
      recv.arsenal = Math.min(200, ra + leak);
      recv.arsenalPublic = (recv.arsenalPublic ?? ra) + leak * 0.4;
      W.proliferations = (W.proliferations | 0) + 1;
      if (log) {
        log(W.year, 'deter', recv.capital, 0.35,
          `${recv.name} acquires weapons know-how via trade with ${donor.name}`);
      }
    };
    tryLeak(pa, pb);
    tryLeak(pb, pa);
  }
}

/** UN nuclear ban → faster decay; cheaters risk verification (§56). */
function disarmament(W, log) {
  const bans = W.diplo?.un?.bans;
  if (!bans || !(bans.has?.('nuclear'))) return;
  const rng = rngOf(W, 'rngGod');
  for (const p of W.polities || []) {
    const stock = p.arsenal || 0;
    if (stock <= 0) continue;
    if (p.cheating) {
      // Hidden stockpile decays slowly; verification may catch them.
      p.arsenal = Math.max(0, stock - 0.001);
      if (rng() < 0.008) {
        p.cheating = false;
        W.disarmamentCaught = (W.disarmamentCaught | 0) + 1;
        noteWarCrime(W, 'nuclear treaty cheating', p.capital | 0, p.id);
        for (const q of W.polities || []) {
          if (q.id === p.id) continue;
          setRelation(W, p.id, q.id, relationOf(W, p.id, q.id) - 0.2);
        }
        if (log) {
          log(W.year, 'diplo', p.capital, 0.7,
            `${p.name} caught cheating a nuclear ban`);
        }
      }
    } else {
      // Compliant arsenals decay faster under the ban.
      p.arsenal = Math.max(0, stock - 0.012);
      if (p.arsenalPublic != null) {
        p.arsenalPublic = Math.max(0, p.arsenalPublic - 0.01);
      }
    }
  }
}

/**
 * Climb and unwind the escalation ladder.
 *
 * `escalate` has been exported since the ladder was written and nothing ever
 * called it, so `W.escalationRung` sat at 0 for the life of every world. Two
 * things depended on it and therefore never happened: the AI's own gate on
 * deliberate first use (`rung < limited_nuke` declines, so the only nuclear use
 * on any planet was an accident or a reply to one), and nuclear winter, which
 * `darkClimate` gates on `rung >= 3`. A ladder nobody climbs is not restraint,
 * it is a disconnected wire.
 *
 * The rungs are now driven by what is actually happening: a war between powers
 * that hold arsenals is conventional; a war that has run long enough to have
 * cost cities, or the first detonation, is limited nuclear; a sustained exchange
 * is strategic. One rung per call at most, on a roll, so escalation takes years
 * rather than a tick — and quiet unwinds it, so a world that survives a crisis
 * can come back down instead of living for ever at the top of the ladder.
 */
function ladderTick(W, log) {
  const pols = W.polities || [];
  const wars = W.diplo?.wars || [];
  const rng = rngOf(W, 'rngGod');
  const armed = (id) => ((W._polityIndex?.get(id)?.arsenal) || 0) >= 1;
  let hotWar = 0, oldWar = 0;
  for (const w of wars) {
    if (!armed(w.a) && !armed(w.b)) continue;
    hotWar++;
    if ((w.age | 0) > 24) oldWar++;
  }
  const shots = (W.detonated | 0) + (W.exchangesRetaliated | 0);
  const prevShots = W._ladderShots | 0;
  W._ladderShots = shots;
  const freshShots = shots > prevShots;
  const rung = W.escalationRung | 0;

  if (freshShots) {
    // A warhead has gone off. That is the rung, not a step toward it.
    escalate(W, wars[0]?.a ?? -1, shots > 3 ? 'strategic' : 'limited_nuke', log);
    W._ladderQuiet = 0;
    return;
  }
  if (hotWar) {
    W._ladderQuiet = 0;
    if (rung < 1 && rng() < 0.08) escalate(W, wars[0].a, 'conventional', log);
    else if (rung === 1 && oldWar && pols.length > 1 && rng() < 0.015) {
      escalate(W, wars[0].a, 'limited_nuke', log);
    }
    return;
  }
  /* Nobody is shooting. Ladders come down slower than they go up — a decade of
     quiet a rung — which is also what keeps a single accident from leaving a
     planet permanently one roll away from a strategic exchange. */
  const quiet = (W._ladderQuiet = (W._ladderQuiet | 0) + 1);
  if (rung > 0 && quiet > 40) {
    W._ladderQuiet = 0;
    W.escalationRung = rung - 1;
    noteExchange(W, 'deescalate', -1, -1,
      `powers step back to ${ESCALATION_RUNGS[W.escalationRung]}`);
    if (log) {
      log(W.year, 'deter', 0, 0.3,
        `The powers step back to ${ESCALATION_RUNGS[W.escalationRung].replace('_', ' ')}`);
    }
  }
}

/** Doomsday clock 0–1 from arsenals, relations, recent launches (§57). */
function updateDoomsday(W) {
  const pols = W.polities || [];
  let arsenal = 0;
  let hostility = 0;
  let pairs = 0;
  for (const p of pols) arsenal += p.arsenal || 0;
  for (let i = 0; i < pols.length; i++) {
    for (let j = i + 1; j < pols.length; j++) {
      const r = relationOf(W, pols[i].id, pols[j].id);
      if (r < 0) hostility += -r;
      pairs++;
    }
  }
  const launched = W.exchangesLaunched || 0;
  const inFlight = (W.flight || []).filter((f) =>
    f.payload === 'nuclear' || f.kind === 'icbm' || f.kind === 'slbm').length;
  const aTerm = Math.min(1, arsenal / 40);
  const hTerm = pairs ? Math.min(1, hostility / pairs) : 0;
  const lTerm = Math.min(1, (launched * 0.08) + inFlight * 0.15);
  W.doomsday = Math.max(0, Math.min(1, aTerm * 0.35 + hTerm * 0.35 + lTerm * 0.3));
}

export function deterrenceTick(W, log = null) {
  ensureCounters(W);
  if (!(W.polities || []).length) {
    W.doomsday = 0;
    return;
  }
  growArsenals(W);
  stockpileDecay(W);
  ladderTick(W, log);
  markSecondStrike(W);
  earlyWarning(W, log);
  deadHand(W, log);
  accidentalLaunch(W, log);
  maybeNuclearTests(W, log);
  proliferation(W, log);
  disarmament(W, log);
  updateDoomsday(W);
}
