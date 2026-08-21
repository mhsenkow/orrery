/** Deterrence and escalation — arsenals, doctrine, early warning.
 *
 *  A launch today is a tool click. This module is the decision *not* to click:
 *  arsenal growth, doctrine branches, detected flights, launch-on-warning,
 *  dead-hand after a capital falls, and a doomsday clock you can read.
 *
 *  dark-400 group C (41–60). Several later rungs are stubbed with TODOs.
 */

import { NC } from '../sphere.js';
import { rngOf } from './rng.js';
import { launch } from './ordnance.js';
import { capitalOf, polityAt } from './polity.js';
import { relationOf, noteCasus, openWar, areAllied } from './diplomacy.js';
import { earlyWarnDelayBonus } from './darkOrbit.js';

export function resetDeterrence(W) {
  W.doomsday = 0;
  W.exchangesConsidered = 0;
  W.exchangesLaunched = 0;
  W.exchangesRetaliated = 0;
  W.exchangesDeclined = 0;
  W._deterrenceLog = [];
  W.crisisStability = 0.5;
  W.hotline = false;
  // TODO(44): named escalation ladder rungs as decisions, not a slider.
  W.escalationRung = 0;
}

function ensureCounters(W) {
  if (W.exchangesConsidered == null) W.exchangesConsidered = 0;
  if (W.exchangesLaunched == null) W.exchangesLaunched = 0;
  if (W.exchangesRetaliated == null) W.exchangesRetaliated = 0;
  if (W.exchangesDeclined == null) W.exchangesDeclined = 0;
  if (W.doomsday == null) W.doomsday = 0;
}

/** Grow arsenals from build + unlockedClass (§41). Public estimate lags (§42). */
function growArsenals(W) {
  const tech = Math.max(0, ((W.unlockedClass || 0) - 4) / 3);
  if (tech <= 0) return;
  for (const p of W.polities || []) {
    if ((p.cells | 0) < 4) continue;
    const growth = (p.build || 0) * 0.002 * tech;
    if (growth < 0.0005) continue;
    p.arsenal = Math.min(200, (p.arsenal || 0) + growth);
    // Public figure drifts toward truth slowly — rivals never know exact count.
    const pub = p.arsenalPublic ?? p.arsenal;
    p.arsenalPublic = pub + (p.arsenal - pub) * 0.08;
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
      const believe = 0.35 - (W.hotline ? 0.2 : 0) - ((defender.reputation || 0.5) - 0.5) * 0.2;
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

  const from = W._polityIndex?.get(fromPolity);
  const to = W._polityIndex?.get(toPolity);
  if (!from || !to || fromPolity === toPolity) {
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    return 'declined';
  }
  if (areAllied(W, fromPolity, toPolity)) {
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    return 'declined';
  }
  if ((from.arsenal || 0) < 1) {
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
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
    return 'declined';
  }

  // Crisis stability: how much is gained by striking first (§51).
  const firstStrikeGain = Math.max(0, -rel) * 0.4 + (opts.falseAlarm ? 0.15 : 0)
    + (atWar ? 0.35 : 0) + (doctrine === 'retaliate' && atWar ? 0.25 : 0);
  W.crisisStability = Math.max(0, Math.min(1, 1 - firstStrikeGain));
  const hotlineCut = W.hotline ? 0.25 : 0;
  const rng = rngOf(W, 'rngGod');
  const pLaunch = retaliate
    ? (doctrine === 'retaliate' ? 0.92 : doctrine === 'warning' ? 0.7 : 0.15)
    : Math.max(0.05, Math.min(0.9, firstStrikeGain - hotlineCut - (from.reputation || 0.5) * 0.05));

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
    return 'declined';
  }

  const fromCell = pickSilo(W, fromPolity);
  const toCell = opts.aim >= 0 ? opts.aim : pickEnemyTarget(W, fromPolity, toPolity);
  if (fromCell < 0 || toCell < 0) {
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    return 'declined';
  }

  const result = launch(W, fromCell, toCell, 'icbm', { yield: 0.9 });
  if (!result.ok) {
    W.exchangesDeclined = (W.exchangesDeclined | 0) + 1;
    return 'declined';
  }
  from.arsenal = Math.max(0, (from.arsenal || 0) - 1);
  from.arsenalPublic = Math.max(0, (from.arsenalPublic || 0) - 0.7);
  W.exchangesLaunched = (W.exchangesLaunched | 0) + 1;
  if (retaliate) W.exchangesRetaliated = (W.exchangesRetaliated | 0) + 1;

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
    if (log) {
      log(W.year, 'deter', cap, 1,
        `${p.name} dead-hand fires after the capital falls`);
    }
    p.deadHand = false;
    considerLaunch(W, p.id, foe, log, { retaliate: true, cause: 'deadhand' });
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
  earlyWarning(W, log);
  deadHand(W, log);
  updateDoomsday(W);

  // TODO(47): second-strike subs that survive a first strike.
  // TODO(52): hotline as a verb that lowers accidental-exchange odds (flag exists).
  // TODO(53): accidental launch + recall attempt.
  // TODO(54): nuclear testing fallout + diplomatic cost.
  // TODO(55): proliferation of arsenals to non-builders.
  // TODO(56): disarmament treaties with verification / cheating.
  // TODO(58): exchange timeline panel after the fact.
}
