/** Drones — loiter, recon, strike with civilian casualty rolls (dark-400 G §121–140). */

import { NC, NBR, DIR } from '../sphere.js';
import { rngOf } from './rng.js';
import { noteCasualty } from './dark.js';
import { polityAt } from './polity.js';

/**
 * Swarm attrition fraction when engaging a larger peer swarm (§127 / §139).
 * Expected losses ≈ min(ownN, floor(enemyN * SWARM_ATTRITION_RATE)) with 50% kill roll.
 */
export const SWARM_ATTRITION_RATE = 0.4;

/** Dot product below this (base↔drone) counts as remote / continental operator (§130). */
export const OPERATOR_REMOTE_DOT = 0.35;

export function resetDrones(W) {
  W.drones = [];
  if (!W.fogOfWar || W.fogOfWar.length !== NC) W.fogOfWar = new Float32Array(NC).fill(1);
  if (!W.fogReveal || W.fogReveal.length !== NC) W.fogReveal = new Float32Array(NC);
  else W.fogReveal.fill(0);
  W.dark = W.dark || {};
  W.dark.droneSorties = 0;
  W.dark.droneLosses = 0;
  W.dark.droneCivCasualties = 0;
  W.dark.drones = 0;
  W.dark.droneFocus = -1;
}

/** Spawn a drone from a polity's built cell toward a target. */
export function spawnDrone(W, opts = {}) {
  if (!W.drones) W.drones = [];
  const cell = opts.cell | 0;
  const target = opts.target != null ? opts.target | 0 : cell;
  if (cell < 0 || cell >= NC) return null;
  const d = {
    cell,
    base: opts.base != null ? opts.base | 0 : cell,
    target,
    endurance: opts.endurance != null ? opts.endurance : 80,
    role: opts.role || 'strike', // strike | recon | loiter | swarm | commercial
    autonomy: opts.autonomy != null ? opts.autonomy : 0.4,
    owner: opts.owner != null ? opts.owner : polityAt(W, cell),
    jammed: false,
    dead: false,
    choseSelf: false,
    pendingOrder: null, // ignored while jammed (§138)
    swarmId: opts.swarmId != null ? opts.swarmId : -1,
    commercial: !!opts.commercial || opts.role === 'commercial',
    military: opts.military != null ? !!opts.military : !(opts.commercial || opts.role === 'commercial'),
  };
  W.drones.push(d);
  W.dark = W.dark || {};
  W.dark.droneSorties = (W.dark.droneSorties | 0) + 1;
  return d;
}

/** Queue an operator order — jammed drones refuse it (§138). */
export function orderDrone(W, drone, order) {
  if (!drone || drone.dead) return false;
  if (drone.jammed) {
    drone.pendingOrder = null;
    return false;
  }
  drone.pendingOrder = order || null;
  if (order?.target != null) drone.target = order.target | 0;
  if (order?.role) drone.role = order.role;
  return true;
}

/** Assert jammed drone stops receiving orders (§138). */
export function assertJammedStopsOrders(drone) {
  if (!drone?.jammed) {
    throw new Error('assertJammedStopsOrders: drone is not jammed');
  }
  const accepted = orderDrone({ drones: [drone] }, drone, { target: 0, role: 'strike' });
  if (accepted) throw new Error('jammed drone accepted an order');
  return true;
}

/**
 * Expected swarm losses under the stated model (§139).
 * lossA = min(A.length, max(1, floor(B.length * SWARM_ATTRITION_RATE)))
 */
export function expectedSwarmLosses(nOwn, nEnemy) {
  return Math.min(nOwn, Math.max(1, (nEnemy * SWARM_ATTRITION_RATE) | 0));
}

/** Assert swarm attrition formula matches SWARM_ATTRITION_RATE (§139). */
export function assertSwarmAttritionModel(trials = 200) {
  const rate = SWARM_ATTRITION_RATE;
  if (rate !== 0.4) throw new Error(`SWARM_ATTRITION_RATE drifted: ${rate}`);
  // Deterministic: for A=5 B=10 expected lossA = min(5, floor(4)) = 4
  if (expectedSwarmLosses(5, 10) !== 4) {
    throw new Error(`expectedSwarmLosses(5,10) !== 4 got ${expectedSwarmLosses(5, 10)}`);
  }
  if (expectedSwarmLosses(2, 2) !== 1) {
    throw new Error(`expectedSwarmLosses(2,2) !== 1`);
  }
  void trials;
  return true;
}

/** Operator distance: base↔drone spherical dot (§130). Low = remote. */
export function operatorDistanceDot(drone) {
  if (!drone || drone.base < 0 || drone.cell < 0) return 1;
  const b = drone.base | 0, c = drone.cell | 0;
  return DIR[b * 3] * DIR[c * 3]
    + DIR[b * 3 + 1] * DIR[c * 3 + 1]
    + DIR[b * 3 + 2] * DIR[c * 3 + 2];
}

/** First-person feed: localview focus cell for selected / focused drone (§136). */
export function droneFeedCell(W) {
  W.dark = W.dark || {};
  const focus = W.dark.droneFocus | 0;
  if (focus >= 0 && W.drones?.[focus] && !W.drones[focus].dead) {
    return W.drones[focus].cell | 0;
  }
  // Selected: first military strike/swarm still alive.
  for (let i = 0; i < (W.drones || []).length; i++) {
    const d = W.drones[i];
    if (!d.dead && d.military && (d.role === 'strike' || d.role === 'swarm' || d.role === 'loiter')) {
      W.dark.droneFocus = i;
      return d.cell | 0;
    }
  }
  return -1;
}

/** Sync W.dark.droneFocus → local pin hook (main reads this). */
export function syncDroneLocalFocus(W) {
  const cell = droneFeedCell(W);
  W.dark = W.dark || {};
  W.dark._localFocusCell = cell;
  return cell;
}

/** Commercial drones flip military when owner's war opens (§137). */
function flipCommercialToMilitary(W, log) {
  const wars = W.diplo?.wars || [];
  if (!wars.length || !W.drones?.length) return;
  const atWar = new Set();
  for (const w of wars) { atWar.add(w.a); atWar.add(w.b); }
  for (const d of W.drones) {
    if (d.dead || !d.commercial || d.military) continue;
    if (!atWar.has(d.owner)) continue;
    d.military = true;
    d.commercial = false;
    d.role = d.role === 'commercial' ? 'recon' : (d.role || 'strike');
    if (d.role === 'commercial') d.role = 'strike';
    if (log) log(W.year, 'drone', d.cell, 0.35, 'Commercial drone pressed into military service');
  }
}

/** Polity build with enough build + tech spawns occasional drones while at war. */
function spawnFromPolities(W, log) {
  const wars = W.diplo?.wars || [];
  if (!W.owner || !W.polities?.length) return;
  const rng = rngOf(W, 'rngGod');
  const tick = W._tickIndex | 0;

  // Peaceful commercial drones (§137).
  if (tick % 40 === 0 && (W.polities || []).length) {
    for (const p of W.polities) {
      if ((p.cells | 0) < 4 || rng() > 0.2) continue;
      const atWar = (W.diplo?.wars || []).some((w) => w.a === p.id || w.b === p.id);
      if (atWar) continue;
      const silo = p.capital | 0;
      if ((W.build?.[silo] || 0) < 0.2) continue;
      spawnDrone(W, {
        cell: silo, base: silo, target: silo,
        role: 'commercial', commercial: true, military: false,
        endurance: 40 + (rng() * 30) | 0, autonomy: 0.2, owner: p.id,
      });
    }
  }

  if (!wars.length) return;
  if (tick % 24 !== 0) return;
  for (const war of wars) {
    if (rng() > 0.35) continue;
    const attacker = W._polityIndex?.get(war.a);
    if (!attacker || (attacker.cells | 0) < 3) continue;
    let silo = attacker.capital | 0;
    let best = W.build?.[silo] || 0;
    const own = W.owner;
    for (let c = 0; c < NC; c += 7) {
      if (own[c] !== war.a) continue;
      const b = W.build?.[c] || 0;
      if (b > best) { best = b; silo = c; }
    }
    if (best < 0.25) continue;
    const defender = W._polityIndex?.get(war.b);
    const tgt = defender?.capital ?? war.b;
    const swarmId = rng() < 0.25 ? ((W._tickIndex | 0) * 17 + war.a) : -1;
    const n = swarmId >= 0 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      spawnDrone(W, {
        cell: silo,
        base: silo,
        target: tgt | 0,
        role: swarmId >= 0 ? 'swarm' : (rng() < 0.35 ? 'recon' : (rng() < 0.5 ? 'loiter' : 'strike')),
        endurance: 60 + (rng() * 40) | 0,
        autonomy: 0.3 + rng() * 0.5,
        owner: war.a,
        swarmId,
        military: true,
      });
    }
    if (log && rng() < 0.2) {
      log(W.year, 'drone', silo, 0.3, `${attacker.name} lofted a drone`);
    }
  }
}

function stepToward(W, d, dest) {
  if (d.cell === dest) return;
  const rng = rngOf(W, 'rngGod');
  const t = dest;
  let best = d.cell, bestDot = -2;
  for (let k = 0; k < 4; k++) {
    const n = NBR[d.cell * 4 + k];
    if (W.h?.[n] < (W.seaLevel ?? 0)) continue;
    let score = 0;
    for (let j = 0; j < 4; j++) if (NBR[n * 4 + j] === t || n === t) score += 2;
    score -= Math.abs(n - t) * 0.0001;
    score += rng() * 0.1;
    if (score > bestDot || n === t) {
      bestDot = score;
      best = n;
    }
  }
  for (let k = 0; k < 4; k++) {
    if (NBR[d.cell * 4 + k] === t) { best = t; break; }
  }
  d.cell = best;
}

/** Simple neighbor steering among co-swarm drones (§126). */
function swarmAlign(W, d) {
  if (d.swarmId < 0 || !W.drones?.length) return;
  let cx = 0, cy = 0, cz = 0, n = 0;
  for (const o of W.drones) {
    if (o === d || o.dead || o.swarmId !== d.swarmId) continue;
    if (Math.abs(o.cell - d.cell) > 80) continue;
    cx += DIR[o.cell * 3];
    cy += DIR[o.cell * 3 + 1];
    cz += DIR[o.cell * 3 + 2];
    n++;
  }
  if (n < 1) return;
  cx /= n; cy /= n; cz /= n;
  let best = d.cell, bestDot = -2;
  for (let k = 0; k < 4; k++) {
    const nb = NBR[d.cell * 4 + k];
    if (W.h?.[nb] < (W.seaLevel ?? 0)) continue;
    const dot = DIR[nb * 3] * cx + DIR[nb * 3 + 1] * cy + DIR[nb * 3 + 2] * cz;
    if (dot > bestDot) { bestDot = dot; best = nb; }
  }
  if (best !== d.cell && bestDot > 0.1) d.cell = best;
}

/** Swarm-vs-swarm attrition by numbers (§127). Uses SWARM_ATTRITION_RATE. */
function swarmEngage(W, log) {
  const by = new Map();
  for (const d of W.drones || []) {
    if (d.dead || d.swarmId < 0) continue;
    const key = `${d.swarmId}:${d.owner}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(d);
  }
  const groups = [...by.values()];
  const rng = rngOf(W, 'rngGod');
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const A = groups[i], B = groups[j];
      if (A[0].owner === B[0].owner) continue;
      const near = Math.abs(A[0].cell - B[0].cell) < 40;
      if (!near) continue;
      const lossA = expectedSwarmLosses(A.length, B.length);
      const lossB = expectedSwarmLosses(B.length, A.length);
      for (let k = 0; k < lossA; k++) {
        if (rng() < 0.5) { A[k].dead = true; W.dark.droneLosses = (W.dark.droneLosses | 0) + 1; }
      }
      for (let k = 0; k < lossB; k++) {
        if (rng() < 0.5) { B[k].dead = true; W.dark.droneLosses = (W.dark.droneLosses | 0) + 1; }
      }
      if (log && rng() < 0.3) log(W.year, 'drone', A[0].cell, 0.5, 'Swarm engagement');
    }
  }
}

function revealFog(W, cell) {
  if (!W.fogOfWar || W.fogOfWar.length !== NC) W.fogOfWar = new Float32Array(NC).fill(1);
  if (!W.fogReveal || W.fogReveal.length !== NC) W.fogReveal = new Float32Array(NC);
  W.fogOfWar[cell] = 0;
  W.fogReveal[cell] = Math.min(1, (W.fogReveal[cell] || 0) + 0.5);
  for (let k = 0; k < 4; k++) {
    const n = NBR[cell * 4 + k];
    W.fogOfWar[n] = 0;
    W.fogReveal[n] = Math.min(1, (W.fogReveal[n] || 0) + 0.35);
  }
}

function stormAttrition(W, d, rng) {
  const storm = W.stormField?.[d.cell] || 0;
  if (storm > 0.25 && rng() < storm * 0.15) {
    d.dead = true;
    W.dark.droneLosses = (W.dark.droneLosses | 0) + 1;
    return true;
  }
  // Counter-drone guns near high build (§132 lite).
  if ((W.build?.[d.cell] || 0) > 0.55 && d.owner !== W.owner?.[d.cell] && rng() < 0.04) {
    d.dead = true;
    W.dark.droneLosses = (W.dark.droneLosses | 0) + 1;
    return true;
  }
  return false;
}

export function droneTick(W, log = null) {
  if (!W.drones) W.drones = [];
  W.dark = W.dark || {};
  spawnFromPolities(W, log);
  flipCommercialToMilitary(W, log);
  const rng = rngOf(W, 'rngGod');
  swarmEngage(W, log);

  const alive = [];
  for (const d of W.drones) {
    if (d.dead) continue;
    if (stormAttrition(W, d, rng)) continue;

    d.endurance -= 1;
    if (d.endurance <= 0) {
      if (d.cell !== d.base && d.endurance > -20) {
        stepToward(W, d, d.base);
      } else {
        d.dead = true;
        W.dark.droneLosses = (W.dark.droneLosses | 0) + 1;
        continue;
      }
    }

    // EW jam (§128).
    if (!d.jammed && rng() < 0.02) {
      d.jammed = true;
      d.pendingOrder = null;
      if (log) log(W.year, 'drone', d.cell, 0.2, 'Drone jammed');
    }

    if (d.jammed) {
      // Autonomy fallback — no operator orders (§129, §138).
      if (d.autonomy > 0.55 && !d.choseSelf) {
        d.choseSelf = true;
        d.role = 'loiter';
        if (log) log(W.year, 'drone', d.cell, 0.4, 'Machine chose its own target');
      } else if (d.autonomy > 0.35) {
        if (rng() < 0.4) stepToward(W, d, d.target);
        else if (rng() < 0.3) stepToward(W, d, d.base);
      } else if (rng() < 0.35) {
        stepToward(W, d, d.base);
      }
    } else if (d.commercial && !d.military) {
      // Peaceful loiter near base.
      if (rng() < 0.4) d.cell = NBR[d.cell * 4 + ((rng() * 4) | 0)];
      else if (d.cell !== d.base) stepToward(W, d, d.base);
    } else {
      if (d.pendingOrder?.target != null) {
        d.target = d.pendingOrder.target | 0;
        d.pendingOrder = null;
      }
      if (d.role === 'recon') {
        stepToward(W, d, d.target);
        revealFog(W, d.cell);
      } else if (d.role === 'swarm') {
        swarmAlign(W, d);
        if (rng() < 0.5) stepToward(W, d, d.target);
      } else if (d.role === 'loiter') {
        if (d.cell !== d.target && rng() < 0.6) stepToward(W, d, d.target);
        else d.cell = NBR[d.cell * 4 + ((rng() * 4) | 0)];
      } else {
        // strike
        stepToward(W, d, d.target);
        if (d.cell === d.target || (Math.abs(d.cell - d.target) < 3 && rng() < 0.15)) {
          const build = W.build?.[d.cell] || 0;
          if (build > 0.05) {
            const lost = Math.min(build, 0.08 + rng() * 0.12);
            W.build[d.cell] -= lost;
            // Operator distance raises civilian casualty chance (§130).
            const distDot = operatorDistanceDot(d);
            const remote = distDot < OPERATOR_REMOTE_DOT ? 1.65 : (distDot < 0.7 ? 1.25 : 1);
            const civ = Math.floor(lost * (40 + rng() * 120) * remote);
            if (civ > 0) {
              noteCasualty(W, 'war', civ, d.owner === (W.playerPolity ?? -2));
              W.dark.droneCivCasualties = (W.dark.droneCivCasualties | 0) + civ;
            }
          }
          d.dead = true;
          W.dark.droneLosses = (W.dark.droneLosses | 0) + 1;
          continue;
        }
      }
    }
    alive.push(d);
  }
  W.drones = alive.slice(-128);
  W.dark.drones = W.drones.length;
  syncDroneLocalFocus(W);
}
