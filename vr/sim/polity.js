/** Countries — who owns which cell.
 *
 *  The Evil desk launches at "somebody else" by dot product. That is not a
 *  country. This module is the keystone: `W.owner` and `W.polities`, grown from
 *  settlement clusters, claimed by proximity-to-capital plus build. Everything
 *  in the dark-400 backlog keys off these two fields.
 *
 *  Cadence is the caller's: seed and claim with `settleCities`, not every tick.
 *  A clean planet costs one array-length check; a settled one pays for its map.
 */

import { NC, NBR, DIR, AREA } from '../sphere.js';
import { hashTag } from './rng.js';
import { seedToWords } from './seedword.js';

const DOCTRINES = ['nofirst', 'warning', 'retaliate'];

function titleWord(w) {
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : 'Vale';
}

/** Seed-stable name from world seed + capital cell (dark-400 §6). */
export function namePolity(seed, capital) {
  const h = hashTag(`${(seed >>> 0)}:${capital | 0}`);
  const [a, b] = seedToWords(h);
  return `${titleWord(a)}-${titleWord(b)}`;
}

function colourOf(id, seed) {
  const h = hashTag(`polity-col:${(seed >>> 0)}:${id}`);
  // Distinct hues; avoid near-black so borders read on the night side.
  const r = 0.25 + ((h & 255) / 255) * 0.7;
  const g = 0.25 + (((h >>> 8) & 255) / 255) * 0.7;
  const b = 0.25 + (((h >>> 16) & 255) / 255) * 0.7;
  return [r, g, b];
}

function doctrineOf(id, seed) {
  const h = hashTag(`doctrine:${(seed >>> 0)}:${id}`);
  return DOCTRINES[h % DOCTRINES.length];
}

/** Allocate / resize `W.owner`. New buffers start at −1; existing ones keep values. */
export function ensureOwner(W) {
  if (!W.owner || W.owner.length !== NC) {
    W.owner = new Int16Array(NC);
    W.owner.fill(-1);
  }
  return W.owner;
}

export function resetPolities(W) {
  ensureOwner(W);
  W.owner.fill(-1);
  if (W.border?.length === NC) W.border.fill(0);
  else W.border = null;
  W.polities = [];
  W._polityIndex = new Map();
  W.playerPolity = -1;
  W.polityCount = 0;
  W.borderLen = 0;
}

function indexPolities(W) {
  const m = new Map();
  for (const p of W.polities || []) m.set(p.id, p);
  W._polityIndex = m;
  W.polityCount = W.polities.length;
}

function nextId(W) {
  let max = -1;
  for (const p of W.polities) if (p.id > max) max = p.id;
  return max + 1;
}

function makePolity(W, capital, opts = {}) {
  const id = opts.id != null ? opts.id : nextId(W);
  const seed = (W.landSeed ?? W.seed) >>> 0;
  const p = {
    id,
    name: opts.name || namePolity(seed, capital),
    capital: capital | 0,
    color: opts.color || colourOf(id, seed),
    founded: opts.founded ?? (W.ageYr || W.year || 0),
    cells: 0,
    build: 0,
    pop: 0,
    watts: 0,
    land: 0,
    arsenal: opts.arsenal | 0,
    arsenalPublic: opts.arsenalPublic ?? (opts.arsenal | 0),
    doctrine: opts.doctrine || doctrineOf(id, seed),
    reputation: opts.reputation ?? 0.5,
    weariness: opts.weariness ?? 0,
    relations: opts.relations instanceof Map
      ? opts.relations
      : new Map(Object.entries(opts.relations || {}).map(([k, v]) => [+k, v])),
    deadHand: !!opts.deadHand,
    embargoed: new Set(opts.embargoed || []),
  };
  W.polities.push(p);
  indexPolities(W);
  return p;
}

/** O(1) owner lookup. */
export function polityAt(W, c) {
  if (!W.owner || c < 0 || c >= NC) return -1;
  return W.owner[c];
}

/** O(1) capital cell for a polity id. */
export function capitalOf(W, id) {
  const p = W._polityIndex?.get(id) || (W.polities || []).find((x) => x.id === id);
  return p ? p.capital : -1;
}

export function playerPolityId(W) {
  return W.playerPolity ?? -1;
}

export function setPlayerPolity(W, id) {
  W.playerPolity = id | 0;
  return W.playerPolity;
}

/**
 * One polity per isolated city cluster (dark-400 §3).
 * Uses `W.cities` from `settleCities` — each city's cell becomes a capital if
 * it is not already inside another polity's seed flood.
 * Prior polities are reused when their capital is still the city cell or nearby,
 * so a rescan does not mint 48 new countries every cadence.
 */
export function seedPolitiesFromCities(W, log = null) {
  ensureOwner(W);
  const cities = W.cities || [];
  const prev = W.polities || [];
  W.polities = [];
  W.owner.fill(-1);
  indexPolities(W);
  if (!cities.length) return W.polities;

  const reused = new Set();
  for (const city of cities) {
    const c = city.cell | 0;
    if (c < 0 || c >= NC) continue;
    if (W.owner[c] >= 0) continue;

    let prior = prev.find((p) => p.capital === c && !reused.has(p.id));
    if (!prior) {
      let best = null, bestDot = 0.85;
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      for (const p of prev) {
        if (reused.has(p.id)) continue;
        const d = x * DIR[p.capital * 3] + y * DIR[p.capital * 3 + 1]
          + z * DIR[p.capital * 3 + 2];
        if (d > bestDot) { bestDot = d; best = p; }
      }
      prior = best;
    }

    let p;
    if (prior) {
      reused.add(prior.id);
      prior.capital = c;
      W.polities.push(prior);
      indexPolities(W);
      p = prior;
    } else {
      p = makePolity(W, c, { founded: W.ageYr || W.year || 0 });
      if (log) log(W.year, 'polity', c, 1, `${p.name} founded`);
    }
    W.owner[c] = p.id;
  }
  if (W.playerPolity >= 0 && !W._polityIndex.has(W.playerPolity)) {
    W.playerPolity = W.polities[0]?.id ?? -1;
  }
  indexPolities(W);
  return W.polities;
}

/**
 * Claim cells by proximity-to-capital + build (dark-400 §4).
 * Same cadence as settleCities — caller decides when.
 */
export function claimTerritory(W) {
  ensureOwner(W);
  const polities = W.polities || [];
  if (!polities.length) return;

  const caps = polities.map((p) => ({
    id: p.id,
    cx: DIR[p.capital * 3],
    cy: DIR[p.capital * 3 + 1],
    cz: DIR[p.capital * 3 + 2],
    // Stronger capitals reach further.
    reach: 0.35 + Math.min(0.55, (W.build?.[p.capital] || 0) * 0.5),
  }));

  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) {
      W.owner[c] = -1;
      continue;
    }
    const b = W.build?.[c] || 0;
    let best = -1, bestScore = 0;
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    for (let i = 0; i < caps.length; i++) {
      const cap = caps[i];
      const dot = x * cap.cx + y * cap.cy + z * cap.cz;
      if (dot < 1 - cap.reach) continue;
      // Require some build, or be close enough that empty hinterland still fills in.
      const close = dot > 0.92;
      if (b < 0.04 && !close) continue;
      const score = (dot - (1 - cap.reach)) * (0.15 + b) * (0.4 + (W.build?.[polities[i].capital] || 0));
      if (score > bestScore) { bestScore = score; best = cap.id; }
    }
    // Capitals always keep their polity even if the score dips.
    for (let i = 0; i < polities.length; i++) {
      if (polities[i].capital === c) { best = polities[i].id; break; }
    }
    W.owner[c] = best;
  }
  updatePolityStats(W);
  borderCells(W);
}

/** Mark / count border cells — owner differs from any neighbour. */
export function borderCells(W) {
  ensureOwner(W);
  if (!W.border || W.border.length !== NC) W.border = new Float32Array(NC);
  else W.border.fill(0);
  const own = W.owner;
  let n = 0;
  for (let c = 0; c < NC; c++) {
    const o = own[c];
    if (o < 0) continue;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      if (own[nb] !== o) {
        W.border[c] = 1;
        n++;
        break;
      }
    }
  }
  W.borderLen = n;
  return n;
}

/** Per-polity build, pop, watts, land (dark-400 §10). */
export function updatePolityStats(W) {
  const polities = W.polities || [];
  if (!polities.length || !W.owner) return;
  for (const p of polities) {
    p.cells = 0; p.build = 0; p.pop = 0; p.watts = 0; p.land = 0;
  }
  const byId = W._polityIndex || new Map(polities.map((p) => [p.id, p]));
  const own = W.owner;
  const sea = W.seaLevel;
  for (let c = 0; c < NC; c++) {
    const id = own[c];
    if (id < 0) continue;
    const p = byId.get(id);
    if (!p) continue;
    p.cells++;
    const b = W.build?.[c] || 0;
    p.build += b;
    p.pop += b * 800; // relative heads from build density
    if (W.h[c] >= sea) p.land += AREA[c];
  }
  // Watts from techno: share of global by build share.
  const totalBuild = polities.reduce((s, p) => s + p.build, 0) || 1;
  const globalW = W.techno?.watts || 0;
  for (const p of polities) {
    p.watts = globalW * (p.build / totalBuild);
    p.pop = Math.floor(p.pop);
  }
}

/**
 * Absorb b into a. Last-cell conquest (dark-400 §8).
 */
export function mergePolities(W, aId, bId, log = null) {
  if (aId === bId || aId < 0 || bId < 0) return null;
  const a = W._polityIndex?.get(aId);
  const b = W._polityIndex?.get(bId);
  if (!a || !b || !W.owner) return null;
  for (let c = 0; c < NC; c++) {
    if (W.owner[c] === bId) W.owner[c] = aId;
  }
  a.arsenal = (a.arsenal | 0) + (b.arsenal | 0);
  a.arsenalPublic = (a.arsenalPublic | 0) + (b.arsenalPublic | 0);
  a.build += b.build;
  a.pop += b.pop;
  a.weariness = Math.max(a.weariness || 0, b.weariness || 0) * 0.5;
  W.polities = W.polities.filter((p) => p.id !== bId);
  if (W.playerPolity === bId) W.playerPolity = aId;
  indexPolities(W);
  if (log) log(W.year, 'polity', a.capital, 1, `${a.name} absorbs ${b.name}`);
  updatePolityStats(W);
  return a;
}

/**
 * Split a polity whose territory is disconnected from its capital (dark-400 §9).
 */
export function splitDisconnected(W, log = null) {
  ensureOwner(W);
  const born = [];
  for (const p of [...(W.polities || [])]) {
    const cap = p.capital;
    if (cap < 0 || W.owner[cap] !== p.id) continue;
    const seen = new Uint8Array(NC);
    const stack = [cap];
    seen[cap] = 1;
    let reach = 0;
    while (stack.length) {
      const x = stack.pop();
      reach++;
      for (let k = 0; k < 4; k++) {
        const n = NBR[x * 4 + k];
        if (seen[n] || W.owner[n] !== p.id) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (reach >= p.cells) continue;

    // Orphan components → new polities (civil war falls out of geography).
    for (let c = 0; c < NC; c++) {
      if (W.owner[c] !== p.id || seen[c]) continue;
      // Seed a breakaway at the densest cell in this component.
      const stack2 = [c];
      seen[c] = 1;
      let best = c, bestB = W.build?.[c] || 0;
      const cells = [c];
      while (stack2.length) {
        const x = stack2.pop();
        const bx = W.build?.[x] || 0;
        if (bx > bestB) { bestB = bx; best = x; }
        for (let k = 0; k < 4; k++) {
          const n = NBR[x * 4 + k];
          if (seen[n] || W.owner[n] !== p.id) continue;
          seen[n] = 1;
          stack2.push(n);
          cells.push(n);
        }
      }
      const child = makePolity(W, best, {
        founded: W.ageYr || W.year || 0,
        arsenal: Math.floor((p.arsenal || 0) * (cells.length / Math.max(1, p.cells)) * 0.5),
        weariness: (p.weariness || 0) + 0.2,
      });
      for (const x of cells) W.owner[x] = child.id;
      born.push(child);
      if (log) {
        log(W.year, 'polity', best, 1,
          `${child.name} breaks from ${p.name}`);
      }
    }
  }
  if (born.length) {
    updatePolityStats(W);
    borderCells(W);
  }
  return born;
}

/**
 * Capital destroyed → succession to densest remaining cell (dark-400 §7).
 */
export function succeedCapital(W, id, log = null) {
  const p = W._polityIndex?.get(id);
  if (!p || !W.owner) return null;
  let best = -1, bestB = -1;
  for (let c = 0; c < NC; c++) {
    if (W.owner[c] !== id) continue;
    const b = W.build?.[c] || 0;
    if (b > bestB) { bestB = b; best = c; }
  }
  if (best < 0) {
    // No land left — dissolve.
    W.polities = W.polities.filter((x) => x.id !== id);
    if (W.playerPolity === id) W.playerPolity = -1;
    indexPolities(W);
    if (log) log(W.year, 'polity', p.capital, 1, `${p.name} falls`);
    return null;
  }
  const old = p.capital;
  p.capital = best;
  if (log && old !== best) {
    log(W.year, 'polity', best, 1, `${p.name} capital succeeds`);
  }
  return p;
}

/** Every cell has exactly one owner id or −1; no invalid ids (dark-400 §19). */
export function assertOwnerClosed(W) {
  if (!W.owner || W.owner.length !== NC) {
    throw new Error('assertOwnerClosed: owner missing or wrong length');
  }
  const ids = new Set((W.polities || []).map((p) => p.id));
  for (let c = 0; c < NC; c++) {
    const o = W.owner[c];
    if (o === -1) continue;
    if (!ids.has(o)) {
      throw new Error(`assertOwnerClosed: cell ${c} owner ${o} not in polities`);
    }
  }
  return true;
}

export function packPolities(W) {
  return {
    owner: W.owner ? Array.from(W.owner) : null,
    playerPolity: W.playerPolity ?? -1,
    polities: (W.polities || []).map((p) => ({
      id: p.id,
      name: p.name,
      capital: p.capital,
      color: [...(p.color || [0.5, 0.5, 0.5])],
      founded: p.founded,
      cells: p.cells,
      build: p.build,
      pop: p.pop,
      watts: p.watts,
      land: p.land,
      arsenal: p.arsenal | 0,
      arsenalPublic: p.arsenalPublic | 0,
      doctrine: p.doctrine,
      reputation: p.reputation,
      weariness: p.weariness,
      deadHand: !!p.deadHand,
      relations: Object.fromEntries(
        (p.relations instanceof Map ? p.relations : new Map(Object.entries(p.relations || {})))
          .entries(),
      ),
      embargoed: [...(p.embargoed || [])],
    })),
  };
}

export function unpackPolities(W, data) {
  if (!data) return;
  ensureOwner(W);
  if (data.owner?.length === NC) {
    for (let i = 0; i < NC; i++) W.owner[i] = data.owner[i] | 0;
  }
  W.polities = [];
  for (const raw of data.polities || []) {
    makePolity(W, raw.capital, {
      id: raw.id,
      name: raw.name,
      color: raw.color,
      founded: raw.founded,
      arsenal: raw.arsenal,
      arsenalPublic: raw.arsenalPublic,
      doctrine: raw.doctrine,
      reputation: raw.reputation,
      weariness: raw.weariness,
      deadHand: raw.deadHand,
      relations: raw.relations,
      embargoed: raw.embargoed,
    });
    const p = W._polityIndex.get(raw.id);
    if (p) {
      p.cells = raw.cells | 0;
      p.build = raw.build || 0;
      p.pop = raw.pop | 0;
      p.watts = raw.watts || 0;
      p.land = raw.land || 0;
    }
  }
  W.playerPolity = data.playerPolity ?? -1;
  indexPolities(W);
  borderCells(W);
}

/**
 * Remap owner across a resolution change (dark-400 §18).
 * Nearest old cell on the same face — discrete labels, no bilinear blend.
 */
export function remapOwner(oldOwner, oldN, newN) {
  const newNC = 6 * newN * newN;
  const out = new Int16Array(newNC);
  out.fill(-1);
  if (!oldOwner || oldN <= 0 || newN <= 0) return out;
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j < newN; j++) {
      for (let i = 0; i < newN; i++) {
        const ni = f * newN * newN + j * newN + i;
        const oi = Math.min(oldN - 1, Math.floor((i + 0.5) * oldN / newN));
        const oj = Math.min(oldN - 1, Math.floor((j + 0.5) * oldN / newN));
        out[ni] = oldOwner[f * oldN * oldN + oj * oldN + oi] ?? -1;
      }
    }
  }
  return out;
}
