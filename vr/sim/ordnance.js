/** Things in flight.
 *
 *  Nothing in this simulation has ever travelled. Storms move, fronts move, herds
 *  move — but every act a player could take landed instantly on the cell they
 *  clicked. A missile is the first object with a *journey*: it launches from one
 *  place, crosses the globe over a dozen ticks leaving a visible track, and may
 *  never arrive, because something shot it down.
 *
 *  That gap between launch and landing is the whole point. It is the only
 *  mechanic here where the player commits and then watches, unable to intervene,
 *  and where a defence can win.
 *
 *  Paths walk the cube-sphere's four-connected grid toward the target along a
 *  DIR-dot geodesic approximation (great-circle on the discrete sphere). Paths
 *  are cached per (from,to). `W.tracer` remains the cell-field track; elevated
 *  arcs live in `flightGeom.js`. Everything is sparse — an empty sky costs one
 *  array-length check.
 */

import { clamp } from '../math.js';
import { NC, NBR, DIR } from '../sphere.js';
import { rngOf } from './rng.js';
import { igniteFire } from './fire.js';
import { irradiate, pourToxin, seedDisease } from './anthro.js';
import { strike as flashAt } from './lightning.js';
import {
  noteCasualty, spawnMushroom, spawnShockwave, spawnBlastFlash,
} from './dark.js';
import { polityAt } from './polity.js';
import {
  spawnWeaponSignature, spawnInterceptBurst, queueDarkMoment,
} from './darkSpectacle.js';
import { darkAudioCue } from './darkAudio.js';

const TRACER_KEEP = 0.72;
const GONE = 0.02;
/** A launch that cannot find its way in this many steps is a dud. */
const MAX_PATH = 220;
/** Simultaneous objects in the air. A saturation attack, not a screensaver. */
const MAX_FLIGHT = 48;
/** Partial failure: scatter rad without a full burst (§71). */
const FIZZLE_P = 0.025;
/** Complete failure on arming — recoverable tech at W._dudAt (§72). */
const DUD_P = 0.015;
/** Default interceptor magazine per battery cell. */
const MAG_DEFAULT = 6;
/** Point-defence magazine bonus around capitals (§106). */
const MAG_CAPITAL = 10;
const MAG_RELOAD = 0.04;
/** Layered defence kill multipliers by flight phase (§105). */
const PHASE_KILL = { boost: 0.45, midcourse: 1.0, reentry: 1.75 };
/** Chance an intercept also knocks out the silo (§109). */
const COUNTER_BATTERY_P = 0.22;
/** Interceptor costs more than the missile it stops (§117). */
const IX_COST_RATIO = 3.2;

/**
 * Flight profiles. Speed is cells per tick; `stealth` cuts interception odds.
 * `range` is max path length (cells). `cep` is miss probability onto a neighbour.
 * Nuclear yield variants and exotic payloads are first-class kinds (§61–69).
 */
export const PROFILES = {
  icbm: {
    speed: 3.0, stealth: 0.0, label: 'ICBM', payload: 'nuclear', yield: 1.0,
    range: 200, cep: 0.04, ballistic: true,
  },
  slbm: {
    speed: 4.5, stealth: 0.45, label: 'SLBM', payload: 'nuclear', yield: 0.75,
    range: 160, cep: 0.06, ballistic: true,
  },
  cruise: {
    speed: 1.6, stealth: 0.62, label: 'cruise missile', payload: 'conventional', yield: 0.5,
    range: 90, cep: 0.12, ballistic: false,
  },
  drone: {
    speed: 1.1, stealth: 0.78, label: 'drone', payload: 'conventional', yield: 0.22,
    range: 50, cep: 0.18, ballistic: false,
  },
  tactical: {
    speed: 2.8, stealth: 0.1, label: 'tactical nuke', payload: 'nuclear', yield: 0.25,
    range: 80, cep: 0.08, ballistic: true,
  },
  strategic: {
    speed: 3.0, stealth: 0.0, label: 'strategic nuke', payload: 'nuclear', yield: 1.0,
    range: 200, cep: 0.04, ballistic: true,
  },
  citybuster: {
    speed: 2.6, stealth: 0.0, label: 'city-buster', payload: 'nuclear', yield: 3.0,
    range: 200, cep: 0.05, ballistic: true,
  },
  neutron: {
    speed: 3.0, stealth: 0.05, label: 'neutron bomb', payload: 'neutron', yield: 0.6,
    range: 140, cep: 0.06, ballistic: true,
  },
  salted: {
    speed: 2.8, stealth: 0.0, label: 'salted warhead', payload: 'salted', yield: 0.8,
    range: 180, cep: 0.05, ballistic: true,
  },
  bunker: {
    speed: 3.2, stealth: 0.15, label: 'bunker-buster', payload: 'bunker', yield: 0.9,
    range: 120, cep: 0.03, ballistic: true,
  },
  emp: {
    speed: 3.5, stealth: 0.2, label: 'EMP burst', payload: 'emp', yield: 0.5,
    range: 200, cep: 0.1, ballistic: true,
  },
  dirty: {
    speed: 1.8, stealth: 0.4, label: 'dirty bomb', payload: 'dirty', yield: 0.35,
    range: 70, cep: 0.15, ballistic: false, unlockedClass: 2,
  },
  thermobaric: {
    speed: 1.7, stealth: 0.35, label: 'thermobaric', payload: 'thermobaric', yield: 0.7,
    range: 80, cep: 0.1, ballistic: false,
  },
  cluster: {
    speed: 1.9, stealth: 0.3, label: 'cluster munition', payload: 'cluster', yield: 0.55,
    range: 85, cep: 0.2, ballistic: false,
  },
  chem_persist: {
    speed: 1.5, stealth: 0.5, label: 'persistent chemical', payload: 'chem_persist', yield: 0.6,
    range: 70, cep: 0.12, ballistic: false,
  },
  chem_brief: {
    speed: 1.6, stealth: 0.55, label: 'brief chemical', payload: 'chem_brief', yield: 0.5,
    range: 65, cep: 0.14, ballistic: false,
  },
  bio: {
    speed: 1.4, stealth: 0.7, label: 'biological', payload: 'bio', yield: 0.4,
    range: 60, cep: 0.16, ballistic: false,
  },
  hypersonic: {
    speed: 5.5, stealth: 0.55, label: 'hypersonic glide', payload: 'nuclear', yield: 0.7,
    range: 180, cep: 0.1, ballistic: true, hypersonic: true, rcs: 0.6,
  },
  'drone-ix': {
    speed: 2.4, stealth: 0.2, label: 'drone interceptor', payload: 'conventional', yield: 0,
    range: 40, cep: 0, ballistic: false, interceptor: true,
  },
};

/** Path cache: `${from},${to}` → cell array. Cleared on reset. */
const pathCache = new Map();

function ensure(W) {
  if (!W.tracer || W.tracer.length !== NC) {
    W.tracer = new Float32Array(NC);
    W._tracerCells = [];
  }
  if (!W._tracerCells) W._tracerCells = [];
  if (!W.radar || W.radar.length !== NC) W.radar = new Float32Array(NC);
  if (!W.flight) W.flight = [];
  if (!W.interceptors) W.interceptors = [];
  if (!W.batteries) W.batteries = new Map();
  if (!W._battFatigue) W._battFatigue = new Map();
  if (!W.arsenalFired) W.arsenalFired = Object.create(null);
  if (!W.defenceStats) {
    W.defenceStats = { shots: 0, intercepts: 0, leaks: 0, salvoLog: [] };
  }
}

export function resetOrdnance(W) {
  if (W.tracer?.length === NC) W.tracer.fill(0);
  else W.tracer = null;
  if (W.radar?.length === NC) W.radar.fill(0);
  else W.radar = null;
  W._tracerCells = [];
  W.flight = [];
  W.interceptors = [];
  W.batteries = new Map();
  W._battFatigue = new Map();
  pathCache.clear();
  W.launched = 0;
  W.intercepted = 0;
  W.detonated = 0;
  W.inFlight = 0;
  W._empUntil = 0;
  W._defFatigue = 0;
  W._dudAt = -1;
  W.arsenalFired = Object.create(null);
  W.defenceStats = { shots: 0, intercepts: 0, leaks: 0, salvoLog: [] };
  if (W.dark) W.dark.defence = [];
}

/** Write the visible track. Exported because an incoming rock is also a thing in
 *  flight, and `strikeImpact` should not carry a second copy of this field. */
export function markTrace(W, c, amt) {
  ensure(W);
  mark(W, c, amt);
}

function mark(W, c, amt) {
  if (c < 0 || c >= NC) return;
  const was = W.tracer[c];
  W.tracer[c] = Math.min(1.3, was + amt);
  if (was <= GONE && W.tracer[c] > GONE) W._tracerCells.push(c);
}

/**
 * Crater / blast-ring radius from continuous yield (§70).
 * Law: `1 + round(yield^0.4 * 2.5)`. Documented and asserted in dark-test.
 */
export function blastRadius(yld) {
  const y = Math.max(0, yld || 0);
  return 1 + Math.round(Math.pow(y, 0.4) * 2.5);
}

/** Progress 0..1 along path. */
export function flightProgress(f) {
  const len = Math.max(1, (f.path?.length || 1) - 1);
  return clamp((f.at || 0) / len, 0, 1);
}

/**
 * Altitude above unit sphere (§81, 89, 93). Ballistic peaks mid-path; cruise/drone
 * hug terrain from `W.h`; depressed arcs stay flatter.
 */
export function flightAltitude(f, t = flightProgress(f), W = null) {
  const cruise = f.kind === 'cruise' || f.kind === 'drone'
    || f.payload === 'conventional' || f.payload === 'dirty'
    || f.payload === 'thermobaric' || f.payload === 'cluster'
    || f.payload === 'chem_persist' || f.payload === 'chem_brief'
    || f.payload === 'bio'
    || (PROFILES[f.kind] && PROFILES[f.kind].ballistic === false);
  if (cruise) {
    let base = 0.015;
    if (W?.h && f.path?.length) {
      const idx = Math.min(f.path.length - 1, Math.max(0, Math.floor(f.at || 0)));
      const c = f.path[idx];
      const sea = W.seaLevel || 0;
      base = 0.008 + Math.max(0, ((W.h[c] || 0) - sea) * 0.025);
    }
    return base + 0.02 * Math.sin(Math.PI * t);
  }
  if (f.depressed) return 0.025 + 0.14 * Math.sin(Math.PI * t);
  return 0.04 + 0.38 * Math.sin(Math.PI * t);
}

/** boost / midcourse / reentry from path progress (§83–85). */
export function flightPhase(f, t = flightProgress(f)) {
  if (t < 0.12) return 'boost';
  if (t < 0.72) return 'midcourse';
  return 'reentry';
}

/** Effective stealth from profile + radar cross-section / chaff (§88). */
export function stealthFromRcs(baseStealth, rcs, chaff = false) {
  // High RCS → easier to track → lower stealth. Chaff briefly inflates RCS.
  const r = Math.max(0.05, (rcs || 1) * (chaff ? 2.2 : 1));
  return clamp((baseStealth || 0) * (1 / (0.55 + r * 0.45)), 0, 0.95);
}

/** Far cell roughly antipodal to the midpoint of from→to (FOB waypoint). */
function farWaypoint(from, to) {
  const mx = -(DIR[from * 3] + DIR[to * 3]);
  const my = -(DIR[from * 3 + 1] + DIR[to * 3 + 1]);
  const mz = -(DIR[from * 3 + 2] + DIR[to * 3 + 2]);
  let best = from, bestDot = -2;
  const step = Math.max(1, (NC / 400) | 0);
  for (let c = 0; c < NC; c += step) {
    const dot = DIR[c * 3] * mx + DIR[c * 3 + 1] * my + DIR[c * 3 + 2] * mz;
    if (dot > bestDot) { bestDot = dot; best = c; }
  }
  return best;
}

/**
 * Great-circle approximation on the cube-sphere: iterative neighbour steps that
 * maximise DIR·target, never revisiting a cell (seam oscillation already
 * prevented). Cached per (from,to[,L]). `longWay` walks via a far waypoint (§91).
 */
export function greatCirclePath(from, to, opts = {}) {
  if (from === to) return [from];
  const longWay = !!opts.longWay;
  const key = `${from},${to},${longWay ? 'L' : 'S'}`;
  const hit = pathCache.get(key);
  if (hit) return hit;

  if (longWay) {
    const via = farWaypoint(from, to);
    const a = greatCirclePath(from, via);
    const b = greatCirclePath(via, to);
    const path = a.concat(b.slice(1));
    // Cap so saturation attacks still terminate.
    const capped = path.length > MAX_PATH * 2
      ? path.filter((_, i) => i % 2 === 0 || i === path.length - 1)
      : path;
    pathCache.set(key, capped);
    return capped;
  }

  const path = [from];
  let c = from;
  const tx = DIR[to * 3], ty = DIR[to * 3 + 1], tz = DIR[to * 3 + 2];
  const seen = new Set([from]);
  for (let step = 0; step < MAX_PATH; step++) {
    let best = -1, bestDot = -2;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const dot = DIR[n * 3] * tx + DIR[n * 3 + 1] * ty + DIR[n * 3 + 2] * tz;
      if (seen.has(n) || dot <= bestDot) continue;
      bestDot = dot; best = n;
    }
    if (best < 0) break;
    c = best;
    seen.add(c);
    path.push(c);
    if (c === to) break;
  }
  pathCache.set(key, path);
  return path;
}

/**
 * Local air defence.
 *
 * Not a field: it is whatever is built nearby, scaled by how advanced the planet
 * is, masked by radar coverage and killed by EMP / grid blackout (§107, 116).
 */
export function defenceAt(W, c) {
  if (gridDown(W)) return 0;
  const tech = clamp(((W.unlockedClass || 0) - 4) / 3, 0, 1);
  if (tech <= 0) return 0;
  let b = W.build?.[c] || 0;
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    const v = W.build?.[n] || 0;
    if (v > b) b = v;
  }
  const rad = W.radar?.[c] ?? b;
  const cover = Math.max(rad, b * 0.4);
  return clamp(b, 0, 1) * tech * (0.3 + 0.7 * clamp(cover, 0, 1));
}

/** Rebuild radar coverage from build/tech with terrain horizon mask (§107). */
export function updateRadar(W) {
  ensure(W);
  const tech = clamp(((W.unlockedClass || 0) - 4) / 3, 0, 1);
  if (tech <= 0) {
    W.radar.fill(0);
    return;
  }
  const h = W.h;
  const build = W.build;
  for (let c = 0; c < NC; c++) {
    let cov = (build?.[c] || 0) * tech;
    if (cov < 0.02) { W.radar[c] = 0; continue; }
    if (h) {
      const hc = h[c] || 0;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if ((h[n] || 0) > hc + 0.03) cov *= 0.72;
      }
    }
    W.radar[c] = clamp(cov, 0, 1);
  }
}

/** Player verb: boost battery magazine + local radar at a cell (§115). */
export function defendCell(W, cell, amount = 1) {
  ensure(W);
  if (cell < 0 || cell >= NC) return { ok: false, note: 'No cell' };
  const batt = batteryNear(W, cell);
  const add = Math.max(1, Math.round(2 * amount));
  const cur = magStock(W, batt);
  const cap = magCeiling(W, batt);
  W.batteries.set(batt, Math.min(cap + 4, cur + add));
  if (W.radar) {
    W.radar[cell] = Math.min(1, (W.radar[cell] || 0) + 0.25 * amount);
    for (let k = 0; k < 4; k++) {
      const n = NBR[cell * 4 + k];
      W.radar[n] = Math.min(1, (W.radar[n] || 0) + 0.12 * amount);
    }
  }
  return { ok: true, cell: batt, stock: W.batteries.get(batt) };
}

/** Battery cell: densest build near the defended ground. */
function batteryNear(W, c) {
  let best = c, bestB = W.build?.[c] || 0;
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    const v = W.build?.[n] || 0;
    if (v > bestB) { bestB = v; best = n; }
  }
  return best;
}

function isCapitalCell(W, cell) {
  for (const p of W.polities || []) {
    if ((p.capital | 0) === cell) return true;
    for (let k = 0; k < 4; k++) {
      if (NBR[cell * 4 + k] === (p.capital | 0)) return true;
    }
  }
  return false;
}

function magCeiling(W, cell) {
  return isCapitalCell(W, cell) ? MAG_CAPITAL : MAG_DEFAULT;
}

function magStock(W, cell) {
  ensure(W);
  if (!W.batteries.has(cell)) W.batteries.set(cell, magCeiling(W, cell));
  return W.batteries.get(cell);
}

function takeMagazine(W, cell) {
  const s = magStock(W, cell);
  if (s < 1) return false;
  W.batteries.set(cell, s - 1);
  return true;
}

function battFatigue(W, cell) {
  ensure(W);
  return W._battFatigue.get(cell) || 0;
}

function addBattFatigue(W, cell, amt) {
  ensure(W);
  W._battFatigue.set(cell, Math.min(1.4, battFatigue(W, cell) + amt));
}

function spawnInterceptor(W, from, to, chase, opts = {}) {
  ensure(W);
  let path = from === to ? [from, to] : greatCirclePath(from, to);
  if (!path || path.length < 2) path = [from, to];
  const drone = !!opts.drone || opts.kind === 'drone-ix';
  const ix = {
    from, to, path, at: 0,
    speed: drone ? 2.8 : 8.0,
    chase,
    kind: drone ? 'drone-ix' : 'interceptor',
    dead: false,
  };
  // §118: cannot hit something faster than itself.
  if (chase && (chase.speed || 0) >= ix.speed) {
    ix._outrun = true;
  }
  W.interceptors.push(ix);
  mark(W, from, drone ? 0.55 : 0.9);
  return ix;
}

/** Prefer a live decoy near the aimed flight for the interceptor (§87). */
function preferDecoyChase(W, primary) {
  if (!primary || primary.decoy) return primary;
  const idx = Math.min(primary.path.length - 1, Math.floor(primary.at || 0));
  const here = primary.path[idx];
  for (const f of W.flight) {
    if (f.dead || !f.decoy || f === primary) continue;
    const j = Math.min(f.path.length - 1, Math.floor(f.at || 0));
    const c = f.path[j];
    if (c === here) return f;
    for (let k = 0; k < 4; k++) if (NBR[here * 4 + k] === c) return f;
  }
  return primary;
}

/**
 * Put something in the air.
 *
 * Returns the flight object so a tool can report the journey rather than the
 * arrival — flight time is the interesting number, because it is how long the
 * defender has.
 */
export function launch(W, from, to, kind = 'icbm', opts = {}) {
  ensure(W);
  if (W.flight.length >= MAX_FLIGHT) return { ok: false, note: 'Sky is full' };
  const prof = PROFILES[kind] || PROFILES.icbm;
  const rng = rngOf(W, 'rngGod');

  // CEP miss: offset aim onto a neighbour (§90). Depressed arcs are less accurate (§89).
  // GPS denial worsens CEP (§310 / dark-400 O§288).
  let aim = to;
  let cep = opts.cep ?? prof.cep ?? 0;
  if (opts.depressed) cep = Math.min(0.55, cep + 0.18);
  if ((W.gpsDenied || 0) > 0) cep = Math.min(0.75, cep + W.gpsDenied * 0.35);
  if (cep > 0 && aim >= 0) {
    if (rng() < cep) {
      aim = NBR[aim * 4 + ((rng() * 4) | 0)];
    }
  }

  const longWay = !!(opts.fob || opts.longWay);
  let path = greatCirclePath(from, aim, { longWay });
  if (!path || path.length < 2) return { ok: false, note: 'No route to target' };

  // Depressed: shorter chord, less warning (§89).
  if (opts.depressed && path.length > 5) {
    const short = [];
    for (let i = 0; i < path.length; i += 2) short.push(path[i]);
    if (short[short.length - 1] !== path[path.length - 1]) short.push(path[path.length - 1]);
    path = short;
  }

  // Hypersonic glide: manoeuvre midpoints (§92).
  const hypersonic = !!(opts.hypersonic || prof.hypersonic);
  if (hypersonic && path.length > 6) {
    path = path.slice();
    for (let i = 2; i < path.length - 2; i++) {
      if (rng() < 0.4) path[i] = NBR[path[i] * 4 + ((rng() * 4) | 0)];
    }
  }

  const range = opts.range ?? (longWay ? MAX_PATH * 2 : (prof.range ?? MAX_PATH));
  if (path.length > range) return { ok: false, note: 'Out of range' };

  const ownerPolity = opts.ownerPolity ?? polityAt(W, from);
  const targetPolity = opts.targetPolity ?? polityAt(W, aim);

  const rcs = opts.rcs ?? prof.rcs ?? 1;
  const chaff = !!opts.chaff;
  const baseStealth = opts.stealth ?? prof.stealth;
  const stealth = stealthFromRcs(baseStealth, rcs, chaff)
    + (hypersonic ? 0.12 : 0);

  const decoy = !!opts.decoy;
  const f = {
    kind,
    from,
    to: aim,
    path,
    at: 0,
    speed: opts.speed ?? (opts.depressed ? prof.speed * 1.15 : prof.speed),
    stealth: clamp(stealth, 0, 0.95),
    rcs: rcs * (chaff ? 2.2 : 1),
    payload: decoy ? 'conventional' : (opts.payload || prof.payload),
    yield: decoy ? 0 : (opts.yield ?? prof.yield),
    mirv: decoy ? 0 : (opts.mirv | 0),
    mirvSeparate: decoy ? false : !!(opts.mirvSeparate ?? ((opts.mirv | 0) > 0)),
    label: decoy ? `${prof.label} decoy` : prof.label,
    dead: false,
    detected: false,
    ownerPolity,
    targetPolity,
    phase: 'boost',
    plume: decoy ? 0.4 : 1.0,
    alt: 0,
    decoy,
    depressed: !!opts.depressed,
    hypersonic,
    fob: longWay,
    chaff,
    _split: false,
  };
  W.flight.push(f);
  W.launched = (W.launched | 0) + 1;
  if (!decoy) {
    W.arsenalFired[kind] = (W.arsenalFired[kind] || 0) + 1;
    W.defenceStats.shots = (W.defenceStats.shots | 0) + 1;
    // Cinematic follow + moment — the journey is the point.
    W.dark = W.dark || {};
    W.dark.followFlight = W.flight.length - 1;
    W.dark.followUntil = (W._tickIndex | 0) + 80;
    darkAudioCue('launch', {
      cell: from,
      peak: 0.55 + (f.yield || 0.3) * 0.35,
      player: ownerPolity === (W.playerPolity ?? -2),
    });
    f._audioLaunch = true;
    const ticks = Math.ceil((path.length - 1) / f.speed);
    queueDarkMoment(W, f.label || 'Launch',
      `${ticks} ticks out · watch the arc`,
      decoy ? 'decoy' : (f.payload || kind));
  }
  mark(W, from, decoy ? 0.6 : 1.1);
  // Boost plume at the silo (§83).
  if (f.plume > 0) mark(W, from, 0.5 + f.plume * 0.5);

  // Penetration aids: decoy flights that never detonate (§87).
  const nDecoy = decoy ? 0 : (opts.decoys | 0);
  for (let d = 0; d < nDecoy && W.flight.length < MAX_FLIGHT; d++) {
    const dAim = NBR[aim * 4 + (d & 3)];
    launch(W, from, dAim, kind, {
      decoy: true,
      decoys: 0,
      mirv: 0,
      ownerPolity,
      targetPolity,
      depressed: opts.depressed,
      hypersonic: opts.hypersonic,
      fob: opts.fob,
      longWay: opts.longWay,
      chaff: true,
      rcs: rcs * 1.8,
      speed: f.speed * (0.95 + rng() * 0.1),
    });
  }

  return {
    ok: true,
    flight: f,
    ticks: Math.ceil((path.length - 1) / f.speed),
    cells: path.length - 1,
  };
}

/** Ring walk applying `fn(c, fall, d)` out to radius r. */
function forBlastRing(cell, r, fn) {
  const seen = new Set([cell]);
  let ring = [cell];
  for (let d = 0; d <= r; d++) {
    const fall = Math.pow(0.55, d);
    for (const c of ring) fn(c, fall, d);
    const nextRing = [];
    for (const c of ring) {
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if (!seen.has(n)) { seen.add(n); nextRing.push(n); }
      }
    }
    ring = nextRing;
    if (!ring.length) break;
  }
}

/** What a warhead does where it lands. */
export function detonate(W, cell, payload = 'nuclear', power = 1, log = null) {
  ensure(W);
  const rng = rngOf(W, 'rngGod');

  // First strike on sensors: zero radar at the aim cell (§108).
  if (W.radar && cell >= 0 && cell < NC) W.radar[cell] = 0;

  // Dud: no effect, mark for recovery (§72).
  if (rng() < DUD_P && payload !== 'conventional' && payload !== 'bio'
      && payload !== 'chem_brief' && payload !== 'chem_persist') {
    W._dudAt = cell;
    if (log) log(W.year, 'war', cell, 0.1, 'Warhead is a dud');
    return { ok: false, dud: true };
  }

  // Fizzle: radiation only (§71).
  if (rng() < FIZZLE_P && (payload === 'nuclear' || payload === 'neutron'
      || payload === 'salted' || payload === 'bunker' || payload === 'strategic'
      || payload === 'tactical' || payload === 'citybuster' || payload === 'emp'
      || payload === 'dirty')) {
    irradiate(W, cell, 0.45 + power * 0.25, 1);
    noteCasualty(W, 'fallout', Math.floor(80 + power * 200));
    if (log) log(W.year, 'war', cell, power * 0.3, 'Warhead fizzles — rad only');
    W.detonated = (W.detonated | 0) + 1;
    return { ok: true, fizzle: true };
  }

  W.detonated = (W.detonated | 0) + 1;
  flashAt(W, cell, 1.2 + power * 0.4);
  mark(W, cell, 1.3);

  if (payload === 'bio') {
    seedDisease(W, cell, { virulence: 0.55 + power * 0.25, transmit: 0.65, engineered: true });
    noteCasualty(W, 'disease', Math.floor(100 + power * 400));
    spawnWeaponSignature(W, cell, 'bio', power);
    darkAudioCue('siren', { cell, peak: 0.4 });
    queueDarkMoment(W, 'Biological strike', 'A bloom takes the settlements', 'engineered');
    if (log) log(W.year, 'plague', cell, power, 'Biological warhead seeds disease');
    return { ok: true };
  }

  if (payload === 'chem_persist' || payload === 'chemical') {
    pourToxin(W, cell, 0.85 + power * 0.55, 2);
    noteCasualty(W, 'poison', Math.floor(150 + power * 300));
    spawnWeaponSignature(W, cell, payload, power);
    darkAudioCue('siren', { cell, peak: 0.35 });
    queueDarkMoment(W, 'Chemical strike', 'A stain that will not lift', 'persistent');
    if (log) log(W.year, 'war', cell, power, 'Persistent chemical warhead');
    return { ok: true };
  }

  if (payload === 'chem_brief') {
    pourToxin(W, cell, 0.45 + power * 0.25, 1);
    noteCasualty(W, 'poison', Math.floor(60 + power * 120));
    spawnWeaponSignature(W, cell, 'chem_brief', power);
    queueDarkMoment(W, 'Chemical strike', 'A brief cloud, then wind', 'non-persistent');
    if (log) log(W.year, 'war', cell, power, 'Brief chemical warhead');
    return { ok: true };
  }

  if (payload === 'conventional' || payload === 'thermobaric' || payload === 'cluster') {
    const buildMul = payload === 'thermobaric' ? 0.85
      : payload === 'cluster' ? 0.4 : 0.55;
    const lifeMul = payload === 'thermobaric' ? 0.45
      : payload === 'cluster' ? 0.55 : 0.25;
    const r = payload === 'cluster' ? 2 : 1;
    forBlastRing(cell, r, (c, fall) => {
      if (W.build?.[c] > 0) W.build[c] = Math.max(0, W.build[c] - power * buildMul * fall);
      if (W.life[c] > 0) W.life[c] = Math.max(0, W.life[c] - power * lifeMul * fall);
      if (fall > 0.4) igniteFire(W, c, 0.5 + power * 0.35 * fall, 0);
    });
    W.temp[cell] = Math.min(1.5, W.temp[cell] + power * (payload === 'thermobaric' ? 0.06 : 0.03));
    noteCasualty(W, 'blast', Math.floor(40 + power * 180));
    spawnWeaponSignature(W, cell, payload, power);
    darkAudioCue('detonate', { cell, peak: 0.35 + power * 0.2, delayMs: 80 });
    W._darkAudioDetSkip = true;
    W._darkAudioDetSeen = W.detonated | 0;
    queueDarkMoment(W, 'Strike', payload === 'thermobaric' ? 'Air burns' : 'Impact', payload);
    if (log) log(W.year, 'war', cell, power, 'Strike lands');
    return { ok: true };
  }

  if (payload === 'dirty') {
    if (W.build?.[cell] > 0) W.build[cell] = Math.max(0, W.build[cell] - power * 0.4);
    igniteFire(W, cell, 0.55 + power * 0.3, 1);
    irradiate(W, cell, 0.55 + power * 0.35, 1);
    noteCasualty(W, 'blast', Math.floor(30 + power * 100));
    noteCasualty(W, 'fallout', Math.floor(80 + power * 250));
    spawnWeaponSignature(W, cell, 'dirty', power);
    darkAudioCue('detonate', { cell, peak: 0.4, delayMs: 60 });
    W._darkAudioDetSkip = true;
    W._darkAudioDetSeen = W.detonated | 0;
    // One-shot click at impact — ambient geiger takes over sparsely.
    darkAudioCue('geiger', { cell, peak: 0.28 });
    queueDarkMoment(W, 'Dirty bomb', 'Blast, then the click of fallout', 'radiological');
    if (log) log(W.year, 'war', cell, power, 'Dirty bomb');
    return { ok: true };
  }

  if (payload === 'emp') {
    // High-altitude EMP: almost no ground effect, long blackout (§65).
    W._empUntil = Math.max(W._empUntil || 0, (W._tickIndex | 0) + Math.round(80 + power * 120));
    irradiate(W, cell, 0.08 * power, 0);
    spawnWeaponSignature(W, cell, 'emp', power);
    spawnBlastFlash(W, power * 0.4);
    darkAudioCue('empSilence', { cell, peak: 0.9 });
    queueDarkMoment(W, 'EMP', 'The night side goes quiet', 'grid down');
    if (log) log(W.year, 'war', cell, power, 'EMP burst — grid dark');
    return { ok: true };
  }

  if (payload === 'neutron') {
    // Low blast, high rad; buildings largely stand (§62).
    const r = Math.max(1, blastRadius(power) - 1);
    forBlastRing(cell, r, (c, fall, d) => {
      W.life[c] = Math.max(0, (W.life[c] || 0) - power * 1.4 * fall);
      if (W.build?.[c] > 0) W.build[c] = Math.max(0, W.build[c] - power * 0.12 * fall);
      if (d <= 1) W.temp[c] = Math.min(1.4, (W.temp[c] || 0.5) + power * 0.05 * fall);
    });
    irradiate(W, cell, 1.2 + power * 0.7, 3);
    noteCasualty(W, 'fallout', Math.floor(400 + power * 1500));
    spawnMushroom(W, cell, power * 0.45);
    spawnBlastFlash(W, power * 0.5);
    darkAudioCue('detonate', { cell, peak: 0.5, delayMs: 40 });
    W._darkAudioDetSkip = true;
    W._darkAudioDetSeen = W.detonated | 0;
    darkAudioCue('geiger', { cell, peak: 0.3 });
    queueDarkMoment(W, 'Neutron', 'Buildings stand. Nothing else does.', 'enhanced radiation');
    if (log) log(W.year, 'war', cell, power, 'Neutron warhead');
    return { ok: true };
  }

  if (payload === 'salted') {
    const r = blastRadius(power * 0.7);
    forBlastRing(cell, r, (c, fall, d) => {
      W.life[c] = Math.max(0, (W.life[c] || 0) - power * 0.9 * fall);
      if (W.build?.[c] > 0) W.build[c] = Math.max(0, W.build[c] - power * 0.55 * fall);
      W.ash[c] = Math.min(1, (W.ash[c] || 0) + power * 0.4 * fall);
      if (d <= 1) W.h[c] -= power * 0.006 * fall;
    });
    irradiate(W, cell, 1.6 + power * 0.9, 3);
    noteCasualty(W, 'blast', Math.floor(200 + power * 800));
    noteCasualty(W, 'fallout', Math.floor(600 + power * 2500));
    if (log) log(W.year, 'war', cell, power, 'Salted warhead');
    return { ok: true };
  }

  if (payload === 'bunker') {
    // Deep crater, small surface ring (§64).
    W.h[cell] -= power * 0.045;
    if (W.build?.[cell] > 0) W.build[cell] = 0;
    W.life[cell] = Math.max(0, (W.life[cell] || 0) - power * 1.1);
    for (let k = 0; k < 4; k++) {
      const n = NBR[cell * 4 + k];
      if (W.build?.[n] > 0) W.build[n] = Math.max(0, W.build[n] - power * 0.35);
    }
    irradiate(W, cell, 0.5 + power * 0.3, 1);
    flashAt(W, cell, 0.9);
    noteCasualty(W, 'blast', Math.floor(150 + power * 500));
    if (log) log(W.year, 'war', cell, power, 'Bunker-buster');
    return { ok: true };
  }

  /* Nuclear (and tactical / strategic / citybuster aliases). Layered signature:
     flash → fire ring → crater → ash → fallout → EMP. Radius from blastRadius. */
  const r = blastRadius(power);
  forBlastRing(cell, r, (c, fall, d) => {
    W.life[c] = Math.max(0, (W.life[c] || 0) - power * 1.2 * fall);
    if (W.build?.[c] > 0) W.build[c] = Math.max(0, W.build[c] - power * fall);
    W.temp[c] = Math.min(1.6, (W.temp[c] || 0.5) + power * 0.22 * fall);
    W.ash[c] = Math.min(1, (W.ash[c] || 0) + power * 0.7 * fall);
    // Stratospheric soot on the dust field — albedo path actually reads this.
    if (W.dust) W.dust[c] = Math.min(1, (W.dust[c] || 0) + power * 0.45 * fall);
    if (d <= 1) W.h[c] -= power * 0.012 * fall;
    if (d > 0 && d < r) igniteFire(W, c, power * fall, 0);
  });
  irradiate(W, cell, 0.9 + power * 0.5, 2);
  // Firestorm loft — stronger than the old gesture so winter can bite.
  W.gases.dust = Math.min(0.55, (W.gases.dust || 0) + power * 0.028);
  W.gases.sulphate = Math.min(0.35, (W.gases.sulphate || 0) + power * 0.012);
  W.exchangesLaunched = (W.exchangesLaunched | 0) + 1;
  W.dark = W.dark || {};
  W.dark.winter = Math.min(1, Math.max(W.dark.winter || 0, 0.15 + power * 0.22));
  W._empUntil = Math.max(W._empUntil || 0, (W._tickIndex | 0) + Math.round(20 + power * 40));
  // Visual signature (§323–327): white flash, expanding ring, mushroom, smoke.
  spawnMushroom(W, cell, power);
  spawnBlastFlash(W, power);
  spawnShockwave(W, cell, power);
  flashAt(W, cell, 1.6 + power * 0.5);
  mark(W, cell, 1.45);
  for (let k = 0; k < 4; k++) mark(W, NBR[cell * 4 + k], 0.85);
  W._lastDetCell = cell | 0;
  W._lastDetDist = r;
  noteCasualty(W, 'blast', Math.floor(300 + power * 2000));
  noteCasualty(W, 'fallout', Math.floor(200 + power * 1000));
  darkAudioCue('detonate', {
    cell,
    peak: 0.7 + power * 0.4,
    delayMs: 120 + Math.round(power * 80),
  });
  // Mark so darkAudioFromWorld doesn't double the boom.
  W._darkAudioDetSkip = true;
  W._darkAudioDetSeen = W.detonated | 0;
  darkAudioCue('siren', { cell, peak: 0.45 });
  queueDarkMoment(W, 'Detonation',
    `${(power * 100).toFixed(0)}-scale · the light arrives first`,
    'nuclear');
  // Stop following once it lands.
  if (W.dark) W.dark.followFlight = -1;
  if (log) log(W.year, 'war', cell, power, `Warhead detonates · ${(power * 100).toFixed(0)}-scale`);
  return { ok: true };
}

function killFlight(W, chase, c, log, ix) {
  chase.dead = true;
  W.intercepted = (W.intercepted | 0) + 1;
  W.defenceStats.intercepts = (W.defenceStats.intercepts | 0) + 1;
  flashAt(W, c, 1.35);
  mark(W, c, 1.35);
  for (let k = 0; k < 4; k++) mark(W, NBR[c * 4 + k], 0.65);
  spawnInterceptBurst(W, c, 0.7 + (chase.yield || 0.3) * 0.4);
  darkAudioCue('interceptSnap', { cell: c, peak: 0.7 });
  queueDarkMoment(W, 'Intercept',
    `${chase.label || 'missile'} dies short of target`,
    'defence');
  // Intercept debris still falls contaminated (§112).
  irradiate(W, c, 0.12 + (chase.yield || 0) * 0.05, 0);
  // Counter-battery: chance to wreck the silo (§109).
  const rng = rngOf(W, 'rngGod');
  if (chase.from >= 0 && rng() < COUNTER_BATTERY_P && W.build) {
    W.build[chase.from] = Math.max(0, (W.build[chase.from] || 0) - 0.45);
    if (W.radar) W.radar[chase.from] = 0;
    if (log) {
      log(W.year, 'war', chase.from, 0.4, 'Counter-battery wrecks the silo');
    }
  }
  if (log) {
    log(W.year, 'war', c, 0.3,
      `Interceptor takes down ${chase.label || 'missile'} short of target`);
    // Cost asymmetry: stopping costs more than launching (§117).
    log(W.year, 'war', c, 0.15,
      `Defence spent ~${IX_COST_RATIO.toFixed(1)}× the missile cost to stop it`);
  }
  void ix;
}

function advanceInterceptors(W, log) {
  ensure(W);
  if (!W.interceptors.length) return;
  const aliveIx = [];
  const deadFlights = new Set();
  // Fratricide: two interceptors same cell same tick both die (§113).
  const cellHits = new Map();
  const arriving = [];

  for (const ix of W.interceptors) {
    if (ix.dead) continue;
    ix.at += ix.speed;
    const idx = Math.min(ix.path.length - 1, Math.floor(ix.at));
    const c = ix.path[idx];
    mark(W, c, ix.kind === 'drone-ix' ? 0.45 : 0.7);
    if (idx >= ix.path.length - 1) {
      arriving.push({ ix, c });
      const n = (cellHits.get(c) || 0) + 1;
      cellHits.set(c, n);
      continue;
    }
    aliveIx.push(ix);
  }

  for (const { ix, c } of arriving) {
    if ((cellHits.get(c) || 0) >= 2) {
      ix.dead = true;
      flashAt(W, c, 0.6);
      mark(W, c, 0.8);
      if (log) log(W.year, 'war', c, 0.2, 'Interceptor fratricide');
      continue;
    }
    const chase = ix.chase;
    if (ix._outrun) {
      // §118: target outran the interceptor.
      continue;
    }
    if (chase && !chase.dead && W.flight.includes(chase)) {
      killFlight(W, chase, c, log, ix);
      deadFlights.add(chase);
    }
  }

  W.interceptors = aliveIx;
  if (deadFlights.size) {
    W.flight = W.flight.filter((f) => !deadFlights.has(f) && !f.dead);
  }
}

/**
 * Advance everything in the air.
 *
 * Interception rolls spawn interceptor objects (§101–104); they kill when they
 * reach the missile cell. Magazines are per-battery; global `_defFatigue` remains
 * as a decaying fallback for pinned / legacy paths. Layered odds by phase (§105).
 */
export function ordnanceTick(W, log = null) {
  ensure(W);

  // Fade the tracks first so this tick's marks are the brightest thing in frame.
  const live = W._tracerCells;
  if (live.length) {
    const next = [];
    for (let i = 0; i < live.length; i++) {
      const c = live[i];
      const v = W.tracer[c] * TRACER_KEEP;
      if (v > GONE) { W.tracer[c] = v; next.push(c); } else W.tracer[c] = 0;
    }
    W._tracerCells = next;
  }

  // Radar rebuild is sparse — every 8 ticks is enough (§107).
  if (((W._tickIndex | 0) % 8) === 0) updateRadar(W);

  // Interceptor stocks recover between waves; per-battery fatigue decays.
  if (W._defFatigue > 0.001) W._defFatigue *= 0.965;
  else if (W._defFatigue) W._defFatigue = 0;
  for (const [cell, fat] of W._battFatigue) {
    const n = fat * 0.96;
    if (n < 0.01) W._battFatigue.delete(cell);
    else W._battFatigue.set(cell, n);
  }
  for (const [cell, stock] of W.batteries) {
    const cap = magCeiling(W, cell);
    if (stock < cap) {
      W.batteries.set(cell, Math.min(cap, stock + MAG_RELOAD));
    }
  }

  advanceInterceptors(W, log);

  const flight = W.flight;
  if (!flight.length && !W.interceptors.length) {
    W.inFlight = 0;
    updateDefenceReadout(W);
    return;
  }
  const rng = rngOf(W, 'rngGod');
  const alive = [];
  let leakedThisWave = 0;
  for (const f of flight) {
    if (f.dead) continue;
    f.at += f.speed;
    const t = flightProgress(f);
    f.alt = flightAltitude(f, t, W);
    f.phase = flightPhase(f, t);
    // Boost plume fades at the silo (§83, 323); midcourse goes cold (§84).
    // markTrace bright at silo — render also boosts cell colour for f.plume.
    if (f.phase === 'boost' && f.plume > 0.02) {
      markTrace(W, f.from, 0.5 + f.plume * 0.55);
      f.plume *= 0.82;
    } else if (f.phase !== 'boost') {
      f.plume = 0;
    }

    // MIRV separation at apex (§86).
    if (f.mirvSeparate && f.mirv > 0 && !f._split && t >= 0.48) {
      f._split = true;
      const apexIdx = Math.min(f.path.length - 1, Math.floor(f.at));
      for (let m = 0; m < f.mirv && W.flight.length + alive.length < MAX_FLIGHT; m++) {
        const aim = NBR[f.to * 4 + (m & 3)];
        const childPath = greatCirclePath(f.path[apexIdx], aim);
        if (!childPath || childPath.length < 2) continue;
        alive.push({
          kind: f.kind,
          from: f.path[apexIdx],
          to: aim,
          path: childPath,
          at: 0,
          speed: f.speed * 1.05,
          stealth: f.stealth,
          rcs: f.rcs,
          payload: f.payload,
          yield: f.yield * 0.7,
          mirv: 0,
          mirvSeparate: false,
          label: f.label,
          dead: false,
          detected: f.detected,
          ownerPolity: f.ownerPolity,
          targetPolity: polityAt(W, aim),
          phase: 'midcourse',
          plume: 0,
          alt: f.alt,
          decoy: false,
          depressed: f.depressed,
          hypersonic: f.hypersonic,
          fob: false,
          chaff: false,
          _split: true,
        });
      }
      f.mirv = 0;
    }

    const idx = Math.min(f.path.length - 1, Math.floor(f.at));
    const c = f.path[idx];
    // Reentry brightens the streak (§85); midcourse is dim.
    const markAmt = f.phase === 'reentry' ? 1.35
      : f.phase === 'boost' ? 1.1
        : 0.7;
    mark(W, c, markAmt);
    for (let b = 1; b <= 2; b++) {
      const j = idx - b;
      if (j >= 0) mark(W, f.path[j], (f.phase === 'reentry' ? 0.65 : 0.4) / b);
    }

    const def = defenceAt(W, c);
    if (def > 0.05 && !f.decoy) {
      const batt = batteryNear(W, c);
      const localFat = clamp(battFatigue(W, batt), 0, 0.92);
      const globalFat = clamp(W._defFatigue || 0, 0, 0.92);
      const fatigue = Math.max(localFat, globalFat * 0.5);
      const stock = magStock(W, batt);
      const phaseMul = PHASE_KILL[f.phase] || 1;
      let pKill = def * 0.19 * phaseMul * (1 - f.stealth) * (1 - fatigue)
        * (stock >= 1 ? 1 : 0.15);
      if (f.hypersonic) pKill *= 0.45;
      // Decoys nearby draw fire (§87).
      const bait = preferDecoyChase(W, f);
      if (bait !== f) pKill *= 1.25;
      if (rng() < pKill && takeMagazine(W, batt)) {
        addBattFatigue(W, batt, 0.28);
        W._defFatigue = Math.min(1.4, (W._defFatigue || 0) + 0.12);
        const useDrone = f.phase === 'reentry' && rng() < 0.25;
        spawnInterceptor(W, batt, c, bait, { drone: useDrone });
        alive.push(f);
        continue;
      }
    } else if (def > 0.05 && f.decoy) {
      // Decoys are preferred targets — high intercept chance, no payload (§87).
      const batt = batteryNear(W, c);
      const stock = magStock(W, batt);
      const pKill = def * 0.35 * (1 - f.stealth * 0.5) * (stock >= 1 ? 1 : 0.2);
      if (rng() < pKill && takeMagazine(W, batt)) {
        addBattFatigue(W, batt, 0.18);
        spawnInterceptor(W, batt, c, f);
        alive.push(f);
        continue;
      }
    }

    if (f.dead) continue;

    if (idx >= f.path.length - 1) {
      if (f.decoy) {
        // Decoys never damage anything (§87, §99).
        continue;
      }
      detonate(W, f.to, f.payload, f.yield, log);
      W.defenceStats.leaks = (W.defenceStats.leaks | 0) + 1;
      leakedThisWave++;
      /* Legacy MIRV fallback when mirvSeparate was off: land around aim point. */
      for (let m = 0; m < f.mirv; m++) {
        const n = NBR[f.to * 4 + (m & 3)];
        detonate(W, n, f.payload, f.yield * 0.7, null);
        W.defenceStats.leaks = (W.defenceStats.leaks | 0) + 1;
      }
      continue;
    }
    alive.push(f);
  }
  W.flight = alive;
  W.inFlight = alive.length + W.interceptors.length;

  // Leakage vs salvo size curve (§120).
  if (leakedThisWave > 0 || ((W._tickIndex | 0) % 16) === 0) {
    const salvo = (W.launched | 0);
    const ixN = W.defenceStats.intercepts | 0;
    const leakN = W.defenceStats.leaks | 0;
    if (salvo > 0) {
      const sLog = W.defenceStats.salvoLog;
      sLog.push({
        salvo, intercepts: ixN, leaks: leakN,
        rate: leakN / Math.max(1, leakN + ixN),
      });
      if (sLog.length > 32) sLog.splice(0, sLog.length - 24);
    }
  }
  updateDefenceReadout(W);
}

/** Per-polity defence readout for HUD / probe (§114). */
function updateDefenceReadout(W) {
  W.dark = W.dark || {};
  const pols = W.polities || [];
  if (!pols.length) { W.dark.defence = []; return; }
  const out = [];
  for (const p of pols) {
    let mag = 0, cov = 0, n = 0;
    const cap = p.capital | 0;
    if (W.batteries) {
      for (const [cell, stock] of W.batteries) {
        if (W.owner && W.owner[cell] === p.id) mag += stock;
      }
    }
    if (W.radar && W.owner) {
      for (let c = 0; c < NC; c += 11) {
        if (W.owner[c] !== p.id) continue;
        cov += W.radar[c] || 0;
        n++;
      }
    }
    const shots = W.defenceStats?.shots || 0;
    const leaks = W.defenceStats?.leaks || 0;
    out.push({
      id: p.id,
      name: p.name,
      magazines: +mag.toFixed(1),
      coverage: n ? +(cov / n).toFixed(3) : 0,
      capitalMag: cap >= 0 ? (W.batteries?.get(batteryNear(W, cap)) || 0) : 0,
      expectedLeak: shots ? +(leaks / Math.max(1, shots)).toFixed(3) : 0,
    });
  }
  W.dark.defence = out;
}

/** True while the grid is down from an EMP or a flare. */
export function gridDown(W) {
  return (W._empUntil || 0) > (W._tickIndex | 0);
}

/**
 * Pick the most valuable target — prefer an enemy capital when polities exist
 * (§12). `notNear` is a cell to stay away from; `fromPolity` skips friendlies.
 */
export function richestTarget(W, notNear = -1, fromPolity = -1) {
  const pols = W.polities || [];
  if (pols.length && W.owner) {
    let best = -1, bestV = -1;
    for (const p of pols) {
      if (fromPolity >= 0 && p.id === fromPolity) continue;
      const cap = p.capital | 0;
      if (cap < 0 || cap >= NC) continue;
      if (notNear >= 0) {
        const dot = DIR[cap * 3] * DIR[notNear * 3]
          + DIR[cap * 3 + 1] * DIR[notNear * 3 + 1]
          + DIR[cap * 3 + 2] * DIR[notNear * 3 + 2];
        if (dot > 0.85) continue;
      }
      const v = (p.build || 0) + (W.build?.[cap] || 0) * 2;
      if (v > bestV) { bestV = v; best = cap; }
    }
    if (best >= 0) return best;
  }

  let best = -1, bestV = 0;
  for (let c = 0; c < NC; c++) {
    const v = W.build?.[c] || 0;
    if (v <= bestV) continue;
    if (fromPolity >= 0 && W.owner && W.owner[c] === fromPolity) continue;
    if (notNear >= 0) {
      const dot = DIR[c * 3] * DIR[notNear * 3] + DIR[c * 3 + 1] * DIR[notNear * 3 + 1]
        + DIR[c * 3 + 2] * DIR[notNear * 3 + 2];
      if (dot > 0.85) continue;
    }
    bestV = v; best = c;
  }
  return best;
}

/**
 * Silo inside the launching polity — highest build toward the target (§13).
 * Falls back to the old far-away heuristic when there are no polities.
 */
export function pickLaunchSite(W, forPolity, towardCell, kind = 'icbm') {
  const wantSea = kind === 'slbm';
  if (forPolity >= 0 && W.owner) {
    let best = -1, bestScore = -1;
    for (let c = 0; c < NC; c++) {
      if (W.owner[c] !== forPolity) continue;
      const sea = W.h[c] < W.seaLevel;
      if (wantSea !== sea) continue;
      let score = W.build?.[c] || 0;
      for (let k = 0; k < 4; k++) score = Math.max(score, (W.build?.[NBR[c * 4 + k]] || 0) * 0.5);
      if (towardCell >= 0) {
        const dot = DIR[c * 3] * DIR[towardCell * 3]
          + DIR[c * 3 + 1] * DIR[towardCell * 3 + 1]
          + DIR[c * 3 + 2] * DIR[towardCell * 3 + 2];
        score *= 0.5 + 0.5 * (1 - dot);
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best >= 0 && (wantSea || bestScore >= 0.05)) return best;
  }

  // Legacy: most built-up place far enough away to be somebody else.
  let best = -1, bestScore = 0;
  const target = towardCell | 0;
  for (let c = 0; c < NC; c++) {
    const dot = DIR[c * 3] * DIR[target * 3] + DIR[c * 3 + 1] * DIR[target * 3 + 1]
      + DIR[c * 3 + 2] * DIR[target * 3 + 2];
    if (dot > 0.6) continue;
    const sea = W.h[c] < W.seaLevel;
    if (wantSea !== sea) continue;
    let near = 0;
    for (let k = 0; k < 4; k++) near = Math.max(near, W.build?.[NBR[c * 4 + k]] || 0);
    const score = wantSea ? (0.4 + near) * (1 - dot) : (W.build?.[c] || 0) + near * 0.5;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (best < 0 || (!wantSea && bestScore < 0.05)) return -1;
  return best;
}
