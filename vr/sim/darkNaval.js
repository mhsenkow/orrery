/** Naval units — ocean-only ships, SLBM reveal, mines, sea lanes (dark-400 H §141–160). */

import { NC, NBR, DIR } from '../sphere.js';
import { rngOf } from './rng.js';
import { pourToxin, irradiate } from './anthro.js';
import { noteCasualty } from './dark.js';
import { polityAt } from './polity.js';
import { spawnDrone } from './darkDrone.js';
import { noteWear } from './present.js';

export function resetNaval(W) {
  W.ships = [];
  W.seaLanes = [];
  W.chokePoints = [];
  W.ports = [];
  W.convoys = [];
  W.wrecks = [];
  W.dark = W.dark || {};
  W.dark.seaControl = 0;
  W.dark.tonnageSunk = 0;
  W.dark.lanesCut = 0;
  W.dark.ships = 0;
  W.dark.chokeHeld = 0;
  W.dark.ports = 0;
  W.dark.convoys = 0;
  W.dark.wrecks = 0;
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
    for (let k = 0; k < 4; k++) {
      const n = NBR[cell * 4 + k];
      if (isOceanCell(W, n)) { cell = n; break; }
    }
  }
  if (!isOceanCell(W, cell)) return null;
  const kind = opts.kind || 'escort';
  const ship = {
    cell,
    kind, // carrier | sub | escort | mine | tanker | asw
    owner: opts.owner != null ? opts.owner : polityAt(W, cell),
    detected: kind !== 'sub',
    detectP: kind === 'sub' ? 0.08 : 1,
    hp: kind === 'carrier' ? 3 : 1,
    airRadius: kind === 'carrier' ? 6 : 0,
    asw: kind === 'asw' || kind === 'escort',
    dead: false,
  };
  W.ships.push(ship);
  return ship;
}

/** Coastal high-build → ports (§151). */
function refreshPorts(W) {
  const ports = [];
  const sea = W.seaLevel ?? 0.5;
  for (let c = 0; c < NC; c++) {
    if ((W.build?.[c] || 0) < 0.4) continue;
    if (W.h[c] < sea || W.h[c] > sea + 0.08) continue;
    let coast = false;
    for (let k = 0; k < 4; k++) {
      if (W.h[NBR[c * 4 + k]] < sea) { coast = true; break; }
    }
    if (!coast) continue;
    ports.push({
      cell: c,
      owner: W.owner?.[c] ?? -1,
      build: W.build[c],
      alive: true,
      supply: 1,
    });
  }
  W.ports = ports.slice(0, 64);
  W.dark = W.dark || {};
  W.dark.ports = W.ports.length;
}

/** Destroyed ports cut polity supply watts (§151). */
function applyPortLoss(W) {
  const cut = new Map();
  for (const p of W.ports || []) {
    const b = W.build?.[p.cell] || 0;
    if (b < 0.12 || (W.rubble?.[p.cell] || 0) > 0.55) {
      p.alive = false;
      p.supply = 0;
      if (p.owner >= 0) cut.set(p.owner, (cut.get(p.owner) | 0) + 1);
    } else {
      p.alive = true;
      p.supply = Math.min(1, b);
      p.build = b;
    }
  }
  for (const [id, n] of cut) {
    const pol = W._polityIndex?.get(id);
    if (!pol) continue;
    pol.watts = (pol.watts || 0) * (1 - Math.min(0.5, n * 0.15));
    pol._portStarve = n;
  }
}

/** Narrow ocean corridors between land — choke points (§147). */
function refreshChokePoints(W) {
  const chokes = [];
  for (let c = 0; c < NC; c++) {
    if (!isOceanCell(W, c)) continue;
    let landN = 0, oceanN = 0;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (isLandCell(W, n)) landN++;
      else if (isOceanCell(W, n)) oceanN++;
    }
    // Corridor: ocean with ≥2 land neighbors and ≤2 ocean neighbors.
    if (landN >= 2 && oceanN <= 2) {
      chokes.push({ cell: c, holder: -1 });
    }
  }
  W.chokePoints = chokes.slice(0, 48);
}

/** Holding a choke raises seaControl (§147). */
function applyChokeControl(W) {
  let held = 0;
  let bonus = 0;
  for (const ch of W.chokePoints || []) {
    let holder = -1;
    for (const s of W.ships || []) {
      if (s.dead || s.kind === 'mine') continue;
      if (s.cell === ch.cell || Math.abs(s.cell - ch.cell) < 3) {
        holder = s.owner;
        break;
      }
    }
    ch.holder = holder;
    if (holder >= 0) {
      held++;
      bonus += 2;
    }
  }
  W.dark = W.dark || {};
  W.dark.chokeHeld = held;
  return bonus;
}

/** Coastal high-build pairs → sea lanes (§146). */
function refreshSeaLanes(W) {
  refreshPorts(W);
  const ports = (W.ports || []).map((p) => p.cell);
  const lanes = [];
  for (let i = 0; i < ports.length; i++) {
    for (let j = i + 1; j < ports.length; j++) {
      if (ports.length > 12 && ((i + j) % 3) !== 0) continue;
      const oa = W.owner?.[ports[i]];
      const ob = W.owner?.[ports[j]];
      lanes.push({ a: ports[i], b: ports[j], cut: false, polity: oa === ob ? oa : -1 });
    }
  }
  W.seaLanes = lanes.slice(0, 48);
}

/** Cutting sea lanes starves polity watts (§146). */
function applyLaneStarvation(W) {
  const cutByPolity = new Map();
  let lanesCut = 0;
  for (const lane of W.seaLanes || []) {
    if (!lane.cut) continue;
    lanesCut++;
    if (lane.polity >= 0) {
      cutByPolity.set(lane.polity, (cutByPolity.get(lane.polity) | 0) + 1);
    }
  }
  for (const [id, n] of cutByPolity) {
    const p = W._polityIndex?.get(id);
    if (!p) continue;
    const starve = Math.min(0.6, n * 0.12);
    p.watts = (p.watts || 0) * (1 - starve);
    p._laneStarve = starve;
  }
  W.dark = W.dark || {};
  W.dark.lanesCut = lanesCut;
}

/** Convoys along sea lanes with escort / loss (§149). */
function stepConvoys(W, log) {
  if (!W.convoys) W.convoys = [];
  const rng = rngOf(W, 'rngGod');
  const tick = W._tickIndex | 0;

  if (tick % 28 === 0 && (W.seaLanes || []).length) {
    const lane = W.seaLanes[(rng() * W.seaLanes.length) | 0];
    if (lane && !lane.cut) {
      W.convoys.push({
        cell: lane.a,
        dest: lane.b,
        owner: lane.polity >= 0 ? lane.polity : (W.owner?.[lane.a] ?? -1),
        escorted: false,
        cargo: 1,
        dead: false,
      });
    }
  }

  // Escort attachment: nearby escort ships cover convoys.
  for (const cv of W.convoys) {
    if (cv.dead) continue;
    cv.escorted = false;
    for (const s of W.ships || []) {
      if (s.dead || (s.kind !== 'escort' && s.kind !== 'asw' && s.kind !== 'carrier')) continue;
      if (s.owner !== cv.owner) continue;
      if (Math.abs(s.cell - cv.cell) < 10) { cv.escorted = true; break; }
    }
  }

  const alive = [];
  for (const cv of W.convoys) {
    if (cv.dead) continue;
    // Step toward dest along ocean.
    const opts = [];
    for (let k = 0; k < 4; k++) {
      const n = NBR[cv.cell * 4 + k];
      if (isOceanCell(W, n)) opts.push(n);
    }
    if (opts.length) {
      let best = opts[0], bestD = Math.abs(opts[0] - cv.dest);
      for (const n of opts) {
        const d = Math.abs(n - cv.dest);
        if (d < bestD) { bestD = d; best = n; }
      }
      cv.cell = best;
    }

    // Hostile contact → loss chance; escorts reduce it.
    let threat = 0;
    for (const s of W.ships || []) {
      if (s.dead || s.owner === cv.owner) continue;
      if (Math.abs(s.cell - cv.cell) < 6) threat += s.kind === 'sub' && !s.detected ? 0.08 : 0.2;
    }
    for (const lane of W.seaLanes || []) {
      if (lane.cut && (Math.abs(cv.cell - lane.a) < 8 || Math.abs(cv.cell - lane.b) < 8)) threat += 0.15;
    }
    const lossP = threat * (cv.escorted ? 0.25 : 1);
    if (threat > 0 && rng() < lossP) {
      cv.dead = true;
      pourToxin(W, cv.cell, 0.35, 1);
      noteCasualty(W, 'war', 8);
      W.dark.tonnageSunk = (W.dark.tonnageSunk | 0) + 1;
      spawnWreck(W, cv.cell, 'convoy');
      if (log) log(W.year, 'naval', cv.cell, 0.45, 'Convoy lost');
      continue;
    }
    if (cv.cell === cv.dest || Math.abs(cv.cell - cv.dest) < 3) {
      // Arrived — deliver supply bump.
      if (W.build?.[cv.dest] != null) {
        W.build[cv.dest] = Math.min(1, (W.build[cv.dest] || 0) + 0.01 * cv.cargo);
      }
      continue;
    }
    alive.push(cv);
  }
  W.convoys = alive.slice(-32);
  W.dark.convoys = W.convoys.length;
}

/** Sunk wreck contamination that leaks for centuries (§153). */
export function spawnWreck(W, cell, kind = 'ship') {
  if (!W.wrecks) W.wrecks = [];
  W.wrecks.push({
    cell: cell | 0,
    kind,
    age: 0,
    leak: kind === 'tanker' || kind === 'sub' ? 0.08 : 0.04,
    rad: kind === 'sub' ? 0.03 : 0,
  });
  if (W.wrecks.length > 48) W.wrecks.splice(0, W.wrecks.length - 40);
  W.dark = W.dark || {};
  W.dark.wrecks = W.wrecks.length;
}

function stepWrecks(W) {
  if (!W.wrecks?.length) return;
  const keep = [];
  for (const w of W.wrecks) {
    w.age = (w.age | 0) + 1;
    // Leak for centuries of ticks — half-life ~2000 ticks.
    const strength = w.leak * Math.exp(-w.age / 2000);
    if (strength > 0.002) {
      pourToxin(W, w.cell, strength, 0);
      if (w.rad > 0) irradiate(W, w.cell, w.rad * Math.exp(-w.age / 3000), 0);
    }
    if (w.age < 8000) keep.push(w);
  }
  W.wrecks = keep;
  W.dark = W.dark || {};
  W.dark.wrecks = W.wrecks.length;
}

/**
 * ASW searchers raise nearby sub detection (§144).
 * Returns boosted detect probability for a sub.
 */
export function aswDetectBoost(W, sub) {
  let boost = 0;
  for (const s of W.ships || []) {
    if (s.dead || s === sub) continue;
    if (!(s.asw || s.kind === 'asw' || s.kind === 'escort' || s.kind === 'carrier')) continue;
    if (s.owner === sub.owner) continue;
    const dist = Math.abs(s.cell - sub.cell);
    if (dist < 8) boost += 0.25;
    else if (dist < 16) boost += 0.1;
  }
  return boost;
}

/** Sonar scatters marine pods (ENT kind 15) near ASW (§155). */
function sonarScatterPods(W) {
  let ENT;
  try {
    // Lazy — agents may not load in headless without full boot.
    ENT = globalThis.__SIMEARTH_ENT;
  } catch { /* ignore */ }
  // Import path: dynamic sync via W._entRef set by agents if present.
  const ent = W._ent || ENT;
  if (!ent?.meta || !ent.n) return;
  const aswCells = [];
  for (const s of W.ships || []) {
    if (s.dead) continue;
    if (s.asw || s.kind === 'asw' || s.kind === 'escort') aswCells.push(s.cell);
  }
  if (!aswCells.length) return;
  const rng = rngOf(W, 'rngGod');
  for (let i = 0; i < ent.n; i++) {
    const m = ent.meta[i];
    if (!m || m.dead || m.kind !== 15) continue;
    let near = false;
    for (const ac of aswCells) {
      if (Math.abs(m.cell - ac) < 12) { near = true; break; }
    }
    if (!near) continue;
    // Scatter: jump to a random ocean neighbor away from ASW.
    const opts = [];
    for (let k = 0; k < 4; k++) {
      const n = NBR[m.cell * 4 + k];
      if (isOceanCell(W, n)) opts.push(n);
    }
    if (opts.length) {
      m.cell = opts[(rng() * opts.length) | 0];
      m.fear = Math.min(1, (m.fear || 0) + 0.4);
      m.behav = 'flee';
    }
  }
}

/** SLBM launch from a sub reveals it (§145). */
export function noteSlbmLaunch(W, ship) {
  if (!ship || ship.kind !== 'sub') return;
  ship.detected = true;
  ship._revealUntil = (W._tickIndex | 0) + 40;
}

/**
 * Amphibious invasion: only way to flip owner across water (§150).
 */
export function amphibiousInvade(W, fromLand, toLand, attackerId) {
  if (!isLandCell(W, fromLand) || !isLandCell(W, toLand)) return false;
  if (W.owner?.[fromLand] !== attackerId) return false;
  let linked = false;
  const seaA = [], seaB = [];
  for (let k = 0; k < 4; k++) {
    const n = NBR[fromLand * 4 + k];
    if (isOceanCell(W, n)) seaA.push(n);
    if (n === toLand) linked = true;
  }
  for (let k = 0; k < 4; k++) {
    const n = NBR[toLand * 4 + k];
    if (isOceanCell(W, n)) seaB.push(n);
  }
  if (!linked) {
    for (const a of seaA) {
      for (const b of seaB) {
        if (a === b) { linked = true; break; }
        for (let k = 0; k < 4; k++) if (NBR[a * 4 + k] === b) { linked = true; break; }
      }
      if (linked) break;
    }
  }
  if (!linked) return false;
  W.owner[toLand] = attackerId;
  if (W.build?.[toLand] > 0) W.build[toLand] *= 0.7;
  noteCasualty(W, 'war', 40);
  return true;
}

/** Carrier projects air power: spawn recon/strike drones within radius (§142). */
function carrierAirOps(W, ship, log) {
  if (ship.kind !== 'carrier' || ship.airRadius <= 0) return;
  if (((W._tickIndex | 0) % 20) !== 0) return;
  const rng = rngOf(W, 'rngGod');
  if (rng() > 0.4) return;
  let cell = ship.cell;
  for (let hop = 0; hop < ship.airRadius; hop++) {
    const opts = [];
    for (let k = 0; k < 4; k++) opts.push(NBR[cell * 4 + k]);
    cell = opts[(rng() * opts.length) | 0];
  }
  let tgt = cell;
  if (isOceanCell(W, tgt)) {
    for (let k = 0; k < 4; k++) {
      const n = NBR[tgt * 4 + k];
      if (isLandCell(W, n)) { tgt = n; break; }
    }
  }
  spawnDrone(W, {
    cell: isLandCell(W, tgt) ? tgt : ship.cell,
    base: ship.cell,
    target: tgt,
    role: rng() < 0.4 ? 'recon' : 'strike',
    endurance: 40 + (rng() * 30) | 0,
    autonomy: 0.45,
    owner: ship.owner,
    military: true,
  });
  if (log && rng() < 0.15) log(W.year, 'naval', ship.cell, 0.3, 'Carrier air sortie');
}

export function navalTick(W, log = null) {
  if (!W.ships) W.ships = [];
  const rng = rngOf(W, 'rngGod');
  const tick = W._tickIndex | 0;

  if (tick % 64 === 0) {
    refreshSeaLanes(W);
    refreshChokePoints(W);
  }
  if (tick % 32 === 0) applyPortLoss(W);

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
      const kind = roll < 0.12 ? 'carrier' : roll < 0.28 ? 'sub'
        : roll < 0.4 ? 'asw' : roll < 0.52 ? 'mine'
          : roll < 0.62 ? 'tanker' : 'escort';
      spawnShip(W, { cell: ocean, kind, owner: war.a });
    }
  }

  const alive = [];
  let control = 0;
  for (const s of W.ships) {
    if (s.dead) continue;
    try { assertShipNotOnLand(W, s.cell); } catch { s.dead = true; continue; }

    if (s.kind === 'mine') {
      pourToxin(W, s.cell, 0.15, 0);
      alive.push(s);
      continue;
    }

    // Sub detection — ASW raises detectP (§143, §144, §159).
    if (s.kind === 'sub') {
      if (s.detected && (s._revealUntil | 0) < tick) s.detected = false;
      const pDetect = (s.detectP || 0.08) + aswDetectBoost(W, s);
      if (!s.detected && rng() < pDetect) {
        s.detected = true;
        s._revealUntil = tick + 12;
      }
    }

    const opts = [];
    for (let k = 0; k < 4; k++) {
      const n = NBR[s.cell * 4 + k];
      if (isOceanCell(W, n)) opts.push(n);
    }
    if (opts.length && rng() < 0.55) {
      s.cell = opts[(rng() * opts.length) | 0];
      noteWear(s.cell, 0.04);
    }

    if (s.kind === 'carrier') {
      control += 3;
      carrierAirOps(W, s, log);
    } else if (s.kind === 'escort' || s.kind === 'asw') control += 1;
    else if (s.kind === 'sub' && s.detected) control += 1;
    else if (s.kind === 'tanker') control += 0.5;

    // Sink → oil spill + wreck (§152, §153).
    if (rng() < 0.002) {
      pourToxin(W, s.cell, s.kind === 'tanker' ? 0.9 : 0.6, 1);
      noteCasualty(W, 'poison', s.kind === 'tanker' ? 15 : 5);
      W.dark = W.dark || {};
      W.dark.tonnageSunk = (W.dark.tonnageSunk | 0) + 1;
      spawnWreck(W, s.cell, s.kind);
      s.dead = true;
      if (log) log(W.year, 'naval', s.cell, 0.4, `${s.kind} sunk`);
      continue;
    }
    alive.push(s);
  }
  W.ships = alive.slice(-96);
  W.dark = W.dark || {};
  control += applyChokeControl(W);
  W.dark.seaControl = control;
  W.dark.ships = W.ships.length;

  // Cut lanes near mines / hostile ships (§146).
  for (const lane of W.seaLanes || []) {
    lane.cut = false;
    for (const s of W.ships) {
      if (s.kind === 'mine' && (s.cell === lane.a || s.cell === lane.b
        || Math.abs(s.cell - lane.a) < 5 || Math.abs(s.cell - lane.b) < 5)) {
        lane.cut = true;
      }
      if (s.kind !== 'mine' && lane.polity >= 0 && s.owner !== lane.polity
        && (Math.abs(s.cell - lane.a) < 8 || Math.abs(s.cell - lane.b) < 8)) {
        lane.cut = true;
      }
    }
  }
  applyLaneStarvation(W);
  stepConvoys(W, log);
  stepWrecks(W);
  sonarScatterPods(W);

  // Occasional amphibious attempt during wars (§150).
  if (tick % 36 === 0 && (W.diplo?.wars || []).length && rng() < 0.25) {
    const war = W.diplo.wars[(rng() * W.diplo.wars.length) | 0];
    let from = -1, to = -1;
    for (let c = 0; c < NC; c += 9) {
      if (W.owner?.[c] !== war.a || !isLandCell(W, c)) continue;
      for (let k = 0; k < 4; k++) {
        const sea = NBR[c * 4 + k];
        if (!isOceanCell(W, sea)) continue;
        for (let j = 0; j < 4; j++) {
          const land = NBR[sea * 4 + j];
          if (isLandCell(W, land) && W.owner[land] === war.b) {
            from = c; to = land; break;
          }
        }
        if (from >= 0) break;
      }
      if (from >= 0) break;
    }
    if (from >= 0) {
      amphibiousInvade(W, from, to, war.a);
      if (log) log(W.year, 'naval', to, 0.6, 'Amphibious landing');
    }
  }
  void DIR;
}
