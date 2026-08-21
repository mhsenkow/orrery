/** Naval units — ocean-only ships, SLBM reveal, mines, sea lanes (dark-400 H §141–160). */

import { NC, NBR } from '../sphere.js';
import { rngOf } from './rng.js';
import { pourToxin } from './anthro.js';
import { noteCasualty } from './dark.js';
import { polityAt } from './polity.js';

export function resetNaval(W) {
  W.ships = [];
  W.seaLanes = [];
  W.dark = W.dark || {};
  W.dark.seaControl = 0;
  W.dark.tonnageSunk = 0;
}

export function isOceanCell(W, c) {
  return c >= 0 && c < NC && (W.h?.[c] ?? 1) < (W.seaLevel ?? 0.5);
}

export function isLandCell(W, c) {
  return c >= 0 && c < NC && (W.h?.[c] ?? 0) >= (W.seaLevel ?? 0.5);
}

/** Assert land unit cannot enter water (§158). */
export function assertLandNotInWater(W, cell) {
  if (isOceanCell(W, cell)) {
    throw new Error(`land unit cannot enter water cell ${cell}`);
  }
}

/** Assert ship cannot enter land (§158). */
export function assertShipNotOnLand(W, cell) {
  if (isLandCell(W, cell)) {
    throw new Error(`ship cannot enter land cell ${cell}`);
  }
}

export function spawnShip(W, opts = {}) {
  if (!W.ships) W.ships = [];
  let cell = opts.cell | 0;
  if (!isOceanCell(W, cell)) {
    // Find nearby ocean.
    for (let k = 0; k < 4; k++) {
      const n = NBR[cell * 4 + k];
      if (isOceanCell(W, n)) { cell = n; break; }
    }
  }
  if (!isOceanCell(W, cell)) return null;
  const ship = {
    cell,
    kind: opts.kind || 'escort', // carrier | sub | escort | mine
    owner: opts.owner != null ? opts.owner : polityAt(W, cell),
    detected: opts.kind !== 'sub',
    hp: opts.kind === 'carrier' ? 3 : 1,
    dead: false,
  };
  W.ships.push(ship);
  return ship;
}

/** Coastal high-build pairs → sea lanes (§146). */
function refreshSeaLanes(W) {
  const ports = [];
  const sea = W.seaLevel ?? 0.5;
  for (let c = 0; c < NC; c++) {
    if ((W.build?.[c] || 0) < 0.45) continue;
    if (W.h[c] < sea || W.h[c] > sea + 0.06) continue;
    // Must touch ocean.
    let coast = false;
    for (let k = 0; k < 4; k++) {
      if (W.h[NBR[c * 4 + k]] < sea) { coast = true; break; }
    }
    if (coast) ports.push(c);
  }
  const lanes = [];
  for (let i = 0; i < ports.length; i++) {
    for (let j = i + 1; j < ports.length; j++) {
      if (ports.length > 12 && ((i + j) % 3) !== 0) continue;
      lanes.push({ a: ports[i], b: ports[j], cut: false });
    }
  }
  W.seaLanes = lanes.slice(0, 48);
}

/** SLBM launch from a sub reveals it (§145). */
export function noteSlbmLaunch(W, ship) {
  if (!ship || ship.kind !== 'sub') return;
  ship.detected = true;
  ship._revealUntil = (W._tickIndex | 0) + 40;
}

export function navalTick(W, log = null) {
  if (!W.ships) W.ships = [];
  const rng = rngOf(W, 'rngGod');
  const tick = W._tickIndex | 0;

  if (tick % 64 === 0) refreshSeaLanes(W);

  // Spawn a few ships for coastal polities at war.
  if (tick % 48 === 0 && (W.diplo?.wars || []).length && W.polities?.length) {
    for (const war of W.diplo.wars) {
      if (rng() > 0.4) continue;
      const p = W._polityIndex?.get(war.a);
      if (!p) continue;
      let ocean = -1;
      for (let c = 0; c < NC; c += 11) {
        if (W.owner?.[c] !== war.a) continue;
        for (let k = 0; k < 4; k++) {
          const n = NBR[c * 4 + k];
          if (isOceanCell(W, n)) { ocean = n; break; }
        }
        if (ocean >= 0) break;
      }
      if (ocean < 0) continue;
      const roll = rng();
      const kind = roll < 0.15 ? 'carrier' : roll < 0.35 ? 'sub' : roll < 0.5 ? 'mine' : 'escort';
      spawnShip(W, { cell: ocean, kind, owner: war.a });
    }
  }

  const alive = [];
  let control = 0;
  for (const s of W.ships) {
    if (s.dead) continue;
    try { assertShipNotOnLand(W, s.cell); } catch { s.dead = true; continue; }

    if (s.kind === 'mine') {
      // Persistent toxin (§148).
      pourToxin(W, s.cell, 0.15, 0);
      alive.push(s);
      continue;
    }

    if (s.kind === 'sub' && s.detected && (s._revealUntil | 0) < tick) {
      s.detected = false;
    }

    // Drift along ocean neighbors.
    const opts = [];
    for (let k = 0; k < 4; k++) {
      const n = NBR[s.cell * 4 + k];
      if (isOceanCell(W, n)) opts.push(n);
    }
    if (opts.length && rng() < 0.55) {
      s.cell = opts[(rng() * opts.length) | 0];
    }

    if (s.kind === 'carrier') control += 3;
    else if (s.kind === 'escort') control += 1;
    else if (s.kind === 'sub' && s.detected) control += 1;

    // Rare sink → oil spill (§152).
    if (rng() < 0.002) {
      pourToxin(W, s.cell, 0.6, 1);
      noteCasualty(W, 'poison', 5);
      W.dark = W.dark || {};
      W.dark.tonnageSunk = (W.dark.tonnageSunk | 0) + 1;
      s.dead = true;
      if (log) log(W.year, 'naval', s.cell, 0.4, `${s.kind} sunk`);
      continue;
    }
    alive.push(s);
  }
  W.ships = alive.slice(-96);
  W.dark = W.dark || {};
  W.dark.seaControl = control;
  W.dark.ships = W.ships.length;

  // Cut lanes near contested coasts.
  for (const lane of W.seaLanes || []) {
    lane.cut = false;
    for (const s of W.ships) {
      if (s.kind === 'mine' && (s.cell === lane.a || s.cell === lane.b)) lane.cut = true;
    }
  }
}
