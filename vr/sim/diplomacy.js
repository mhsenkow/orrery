/** Rivalry and diplomacy — relations between polities.
 *
 *  Without this, a launch has no reason and a border is just a colour. Pairwise
 *  relation −1..1, sparse; wars need a casus belli; alliances drag neighbours
 *  in; weariness sues for peace and redraws the map.
 *
 *  dark-400 group B (21–40). Items 31–36 (UN, treaty bans, proxy, clients,
 *  refugees, matrix panel) are stubbed with TODOs where noted.
 */

import { NC, NBR } from '../sphere.js';
import { rngOf } from './rng.js';
import {
  capitalOf, mergePolities, updatePolityStats, borderCells, claimTerritory,
} from './polity.js';

function pairKey(a, b) {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return `${lo},${hi}`;
}

function ensure(W) {
  if (!W.diplo) {
    W.diplo = {
      relations: new Map(),   // `${min},${max}` → −1..1
      casus: [],              // { a, b, kind, cell, year, label }
      wars: [],               // { a, b, casus, year, name, age }
      alliances: new Map(),   // id → Set of ally ids
      naps: [],               // { a, b, until, broken }
      warNames: new Map(),    // pairKey → count for "Second X–Y War"
      trade: new Map(),       // pairKey → strength 0..1
    };
  }
  if (!(W.diplo.relations instanceof Map)) {
    W.diplo.relations = new Map(Object.entries(W.diplo.relations || {}));
  }
  if (!(W.diplo.alliances instanceof Map)) {
    const m = new Map();
    for (const [k, v] of Object.entries(W.diplo.alliances || {})) {
      m.set(+k, new Set(v));
    }
    W.diplo.alliances = m;
  }
  return W.diplo;
}

export function resetDiplomacy(W) {
  W.diplo = {
    relations: new Map(),
    casus: [],
    wars: [],
    alliances: new Map(),
    naps: [],
    warNames: new Map(),
    trade: new Map(),
  };
}

export function relationOf(W, a, b) {
  if (a === b || a < 0 || b < 0) return 1;
  const d = ensure(W);
  const v = d.relations.get(pairKey(a, b));
  return v == null ? 0 : v;
}

export function setRelation(W, a, b, v) {
  if (a === b || a < 0 || b < 0) return;
  const d = ensure(W);
  const clamped = Math.max(-1, Math.min(1, v));
  d.relations.set(pairKey(a, b), clamped);
  // Mirror onto polity.relations for inspect panels.
  const pa = W._polityIndex?.get(a);
  const pb = W._polityIndex?.get(b);
  if (pa) {
    if (!(pa.relations instanceof Map)) pa.relations = new Map();
    pa.relations.set(b, clamped);
  }
  if (pb) {
    if (!(pb.relations instanceof Map)) pb.relations = new Map();
    pb.relations.set(a, clamped);
  }
}

export function areAllied(W, a, b) {
  if (a === b) return true;
  const d = ensure(W);
  return !!(d.alliances.get(a)?.has(b) || d.alliances.get(b)?.has(a));
}

function addAlliance(W, a, b) {
  const d = ensure(W);
  if (!d.alliances.has(a)) d.alliances.set(a, new Set());
  if (!d.alliances.has(b)) d.alliances.set(b, new Set());
  d.alliances.get(a).add(b);
  d.alliances.get(b).add(a);
  setRelation(W, a, b, Math.max(relationOf(W, a, b), 0.55));
}

function addNap(W, a, b, ticks = 80) {
  const d = ensure(W);
  const until = (W._tickIndex | 0) + ticks;
  d.naps.push({ a, b, until, broken: false });
  setRelation(W, a, b, Math.max(relationOf(W, a, b), 0.2));
}

/** Record a casus belli — border taken, strike, resource denied. */
export function noteCasus(W, a, b, kind, cell, label) {
  const d = ensure(W);
  d.casus.push({
    a, b, kind, cell: cell | 0,
    year: W.ageYr || W.year || 0,
    label: label || kind,
  });
  // Cap the list — a syslog is not a chronicle.
  if (d.casus.length > 64) d.casus.splice(0, d.casus.length - 48);
  setRelation(W, a, b, relationOf(W, a, b) - 0.15);
}

function hasCasus(W, a, b) {
  const d = ensure(W);
  return d.casus.some((c) =>
    (c.a === a && c.b === b) || (c.a === b && c.b === a));
}

function warName(W, a, b) {
  const d = ensure(W);
  const pa = W._polityIndex?.get(a);
  const pb = W._polityIndex?.get(b);
  const left = pa?.name?.split('-')[0] || `P${a}`;
  const right = pb?.name?.split('-')[0] || `P${b}`;
  const key = pairKey(a, b);
  const n = (d.warNames.get(key) || 0) + 1;
  d.warNames.set(key, n);
  const ord = n === 1 ? '' : n === 2 ? 'Second ' : n === 3 ? 'Third ' : `${n}th `;
  return `the ${ord}${left}–${right} War`;
}

function underNap(W, a, b) {
  const d = ensure(W);
  const t = W._tickIndex | 0;
  return d.naps.some((n) =>
    !n.broken && n.until > t
    && ((n.a === a && n.b === b) || (n.a === b && n.b === a)));
}

/**
 * Declare war — requires a casus belli (dark-400 §25).
 * Allies of the defender are dragged in (§26).
 */
export function openWar(W, a, b, casus, log = null) {
  const d = ensure(W);
  if (a === b || a < 0 || b < 0) return { ok: false, note: 'Same polity' };
  if (areAllied(W, a, b)) {
    return { ok: false, note: 'Allies cannot declare on each other' };
  }
  if (d.wars.some((w) =>
    (w.a === a && w.b === b) || (w.a === b && w.b === a))) {
    return { ok: false, note: 'Already at war' };
  }
  if (!casus && !hasCasus(W, a, b)) {
    return { ok: false, note: 'No casus belli' };
  }
  if (casus && !hasCasus(W, a, b)) {
    noteCasus(W, a, b, casus.kind || 'dispute', casus.cell || capitalOf(W, b),
      casus.label || casus.kind || 'dispute');
  }
  // Breaking a NAP costs reputation (§27–28).
  if (underNap(W, a, b)) {
    for (const n of d.naps) {
      if (!n.broken && ((n.a === a && n.b === b) || (n.a === b && n.b === a))) {
        n.broken = true;
      }
    }
    const pa = W._polityIndex?.get(a);
    if (pa) pa.reputation = Math.max(0, (pa.reputation || 0.5) - 0.35);
    setRelation(W, a, b, -0.85);
  }

  const reason = casus?.label
    || d.casus.find((c) =>
      (c.a === a && c.b === b) || (c.a === b && c.b === a))?.label
    || 'a border dispute';
  const name = warName(W, a, b);
  const war = {
    a, b,
    casus: reason,
    year: W.ageYr || W.year || 0,
    name,
    age: 0,
  };
  d.wars.push(war);
  setRelation(W, a, b, Math.min(relationOf(W, a, b), -0.7));

  if (log) {
    const pa = W._polityIndex?.get(a);
    const pb = W._polityIndex?.get(b);
    log(W.year, 'war', capitalOf(W, a), 1,
      `${pa?.name || a} declares on ${pb?.name || b} over ${reason} — ${name}`);
  }

  // Alliance cascade: attack on one → allies join against the attacker.
  const defenders = [...(d.alliances.get(b) || [])];
  for (const ally of defenders) {
    if (ally === a || areAllied(W, ally, a)) continue;
    if (!d.wars.some((w) =>
      (w.a === ally && w.b === a) || (w.a === a && w.b === ally))) {
      noteCasus(W, ally, a, 'alliance', capitalOf(W, b), 'honouring an alliance');
      openWar(W, ally, a, { kind: 'alliance', label: 'honouring an alliance' }, log);
    }
  }

  return { ok: true, war };
}

function sueForPeace(W, war, log) {
  const d = ensure(W);
  const winner = (W._polityIndex?.get(war.a)?.weariness || 0)
    <= (W._polityIndex?.get(war.b)?.weariness || 0) ? war.a : war.b;
  const loser = winner === war.a ? war.b : war.a;
  // Peace redraws owner: border cells of the loser flip if contested (§39).
  if (W.owner && W.border) {
    for (let c = 0; c < NC; c++) {
      if (W.owner[c] !== loser) continue;
      if (!(W.border[c] > 0)) continue;
      // Transfer a rim of border cells to the winner.
      let touch = false;
      for (let k = 0; k < 4; k++) {
        if (W.owner[NBR[c * 4 + k]] === winner) { touch = true; break; }
      }
      if (touch) W.owner[c] = winner;
    }
  }
  setRelation(W, war.a, war.b, -0.15);
  const pa = W._polityIndex?.get(war.a);
  const pb = W._polityIndex?.get(war.b);
  if (pa) pa.weariness = Math.max(0, (pa.weariness || 0) * 0.4);
  if (pb) pb.weariness = Math.max(0, (pb.weariness || 0) * 0.4);
  if (log) log(W.year, 'war', capitalOf(W, winner), 0.5, `Peace ends ${war.name}`);
  d.wars = d.wars.filter((w) => w !== war);
  // Empty loser merges into winner.
  const loserP = W._polityIndex?.get(loser);
  if (loserP && (loserP.cells | 0) === 0) mergePolities(W, winner, loser, log);
  updatePolityStats(W);
  borderCells(W);
}

/** Adjacency tension: shared borders cool relations (§23). */
function adjacencyTension(W) {
  if (!W.owner || !W.border) return;
  const seen = new Set();
  const own = W.owner;
  for (let c = 0; c < NC; c++) {
    if (!(W.border[c] > 0)) continue;
    const a = own[c];
    if (a < 0) continue;
    for (let k = 0; k < 4; k++) {
      const b = own[NBR[c * 4 + k]];
      if (b < 0 || b === a) continue;
      const key = pairKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      if (areAllied(W, a, b) || underNap(W, a, b)) continue;
      setRelation(W, a, b, relationOf(W, a, b) - 0.008);
      // Border cell taken → casus (§24).
      if (relationOf(W, a, b) < -0.4 && !hasCasus(W, a, b)) {
        noteCasus(W, a, b, 'border', c, 'a contested border');
      }
    }
  }
}

/** Embargo: slow the target's build growth (§30). Trade stub (§29). */
function applyEmbargoPenalty(W) {
  for (const p of W.polities || []) {
    if (!p.embargoed?.size) continue;
    // Measurable: strip a thin slice of build at the capital each tick under embargo.
    const c = p.capital;
    if (c >= 0 && W.build?.[c] > 0.05) {
      W.build[c] *= 0.9985;
    }
  }
}

export function diplomacyTick(W, log = null) {
  const d = ensure(W);
  const polities = W.polities || [];
  if (polities.length < 2) return;

  // Decay relations toward neutral (§22).
  for (const [key, v] of d.relations) {
    if (Math.abs(v) < 0.001) {
      d.relations.set(key, 0);
      continue;
    }
    d.relations.set(key, v * 0.997);
  }

  adjacencyTension(W);
  applyEmbargoPenalty(W);

  // Expire NAPs.
  const t = W._tickIndex | 0;
  d.naps = d.naps.filter((n) => !n.broken && n.until > t);

  // Age wars; weariness → sue for peace (§38).
  const rng = rngOf(W, 'rngGod');
  for (const war of [...d.wars]) {
    war.age = (war.age | 0) + 1;
    const pa = W._polityIndex?.get(war.a);
    const pb = W._polityIndex?.get(war.b);
    if (pa) pa.weariness = Math.min(1, (pa.weariness || 0) + 0.004);
    if (pb) pb.weariness = Math.min(1, (pb.weariness || 0) + 0.004);
    const tired = (pa?.weariness || 0) > 0.72 || (pb?.weariness || 0) > 0.72;
    if (tired && war.age > 12) sueForPeace(W, war, log);
  }

  // Opportunistic diplomacy among peaceful pairs.
  if (polities.length >= 2 && (t % 7) === 0) {
    const a = polities[(rng() * polities.length) | 0];
    const b = polities[(rng() * polities.length) | 0];
    if (a && b && a.id !== b.id && !d.wars.some((w) =>
      (w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id))) {
      const rel = relationOf(W, a.id, b.id);
      // Reputation gates pacts (§28).
      const trust = Math.min(a.reputation || 0.5, b.reputation || 0.5);
      if (rel > 0.35 && trust > 0.35 && rng() < 0.08) {
        addAlliance(W, a.id, b.id);
        if (log) log(W.year, 'diplo', a.capital, 0.3, `${a.name} allies with ${b.name}`);
      } else if (rel > 0.1 && trust > 0.25 && rng() < 0.1) {
        addNap(W, a.id, b.id, 60 + ((rng() * 40) | 0));
      } else if (rel > 0 && rng() < 0.12) {
        d.trade.set(pairKey(a.id, b.id), Math.min(1, (d.trade.get(pairKey(a.id, b.id)) || 0) + 0.05));
      }
      // UN-ish body once several polities exist (§31).
      if (polities.length >= 4 && (t % 21) === 0 && rng() < 0.15) {
        d.un = d.un || { votes: [], bans: new Set() };
        const target = polities[(rng() * polities.length) | 0];
        const action = rng() < 0.4 ? 'condemn' : rng() < 0.7 ? 'sanction' : 'authorise';
        d.un.votes.push({ year: W.year, action, target: target.id, name: target.name });
        if (d.un.votes.length > 24) d.un.votes.splice(0, 8);
        if (action === 'sanction') {
          if (!(target.embargoed instanceof Set)) target.embargoed = new Set();
          target.embargoed.add(-1); // UN sanction marker
          setRelation(W, a.id, target.id, relationOf(W, a.id, target.id) - 0.05);
        }
        if (log) log(W.year, 'diplo', target.capital, 0.2, `Assembly votes to ${action} ${target.name}`);
      }
      // Weapon-class ban treaty (§32) — nuclear banned when doomsday high.
      if ((W.doomsday || 0) > 0.55 && !(d.un?.bans?.has?.('nuclear'))) {
        d.un = d.un || { votes: [], bans: new Set() };
        if (!(d.un.bans instanceof Set)) d.un.bans = new Set(d.un.bans || []);
        d.un.bans.add('nuclear');
        if (log) log(W.year, 'diplo', 0, 0.4, 'Treaty bans nuclear weapons');
      }
      // Proxy: two large fund a front inside a third (§33).
      if (polities.length >= 3 && rel > 0.2 && rng() < 0.04) {
        const c = polities.find((p) => p.id !== a.id && p.id !== b.id);
        if (c && (a.cells | 0) > 40 && (b.cells | 0) > 40) {
          d.proxies = d.proxies || [];
          d.proxies.push({ sponsors: [a.id, b.id], host: c.id, year: W.year });
          noteCasus(W, a.id, c.id, 'proxy', c.capital, `proxy front in ${c.name}`);
          if (log) log(W.year, 'war', c.capital, 0.3, `${a.name} and ${b.name} fund a front in ${c.name}`);
        }
      }
      // Client states (§34): weak polity follows strong neighbour.
      if ((a.cells | 0) > (b.cells | 0) * 3 && relationOf(W, a.id, b.id) > 0.2) {
        b.clientOf = a.id;
        if (rng() < 0.02 && (b.reputation || 0.5) > 0.4) {
          b.clientOf = null;
          setRelation(W, a.id, b.id, relationOf(W, a.id, b.id) - 0.25);
          if (log) log(W.year, 'diplo', b.capital, 0.4, `${b.name} stops taking instruction from ${a.name}`);
        }
      }
      // Refugee pressure across a shared border (§35).
      if (rel < -0.2 && (a.weariness || 0) > 0.3) {
        W.dark = W.dark || {};
        W.dark.refugees = (W.dark.refugees | 0) + 2;
        const cap = capitalOf(W, b.id);
        if (cap >= 0 && W.build?.[cap] != null) {
          W.build[cap] = Math.min(1, W.build[cap] + 0.0004);
          setRelation(W, a.id, b.id, relationOf(W, a.id, b.id) - 0.01);
        }
      }
      // Casus + bad relations → possible declaration.
      if (rel < -0.55 && hasCasus(W, a.id, b.id) && rng() < 0.06) {
        openWar(W, a.id, b.id, null, log);
      }
    }
  }

  // Embargo verb: cut trade when relations crash (§29–30).
  for (const [key, strength] of d.trade) {
    const [a, b] = key.split(',').map(Number);
    if (relationOf(W, a, b) < -0.5) {
      d.trade.delete(key);
      const pb = W._polityIndex?.get(b);
      if (pb) {
        if (!(pb.embargoed instanceof Set)) pb.embargoed = new Set(pb.embargoed || []);
        pb.embargoed.add(a);
      }
    } else if (strength > 0) {
      // Peaceful trade slightly raises build at both capitals.
      const ca = capitalOf(W, a);
      const cb = capitalOf(W, b);
      if (ca >= 0 && W.build?.[ca] != null) W.build[ca] = Math.min(1, W.build[ca] + 0.00015 * strength);
      if (cb >= 0 && W.build?.[cb] != null) W.build[cb] = Math.min(1, W.build[cb] + 0.00015 * strength);
    }
  }
}

/** Allies must not be at war (dark-400 §40). */
export function assertNoWarAmongAllies(W) {
  const d = ensure(W);
  for (const war of d.wars) {
    if (areAllied(W, war.a, war.b)) {
      throw new Error(`assertNoWarAmongAllies: ${war.a} vs ${war.b} while allied`);
    }
  }
  return true;
}

/** Optional: claim on diplo cadence when polities exist but owner is stale. */
export function diplomacyResettle(W) {
  if ((W.polities || []).length) claimTerritory(W);
}
