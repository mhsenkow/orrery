/** Drones — loiter, recon, strike with civilian casualty rolls (dark-400 G §121–140). */

import { NC, NBR } from '../sphere.js';
import { rngOf } from './rng.js';
import { noteCasualty } from './dark.js';
import { polityAt } from './polity.js';

export function resetDrones(W) {
  W.drones = [];
  W.dark = W.dark || {};
  W.dark.droneSorties = 0;
  W.dark.droneCivCasualties = 0;
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
    role: opts.role || 'strike', // strike | recon | loiter
    autonomy: opts.autonomy != null ? opts.autonomy : 0.4,
    owner: opts.owner != null ? opts.owner : polityAt(W, cell),
    jammed: false,
    dead: false,
    choseSelf: false,
  };
  W.drones.push(d);
  W.dark = W.dark || {};
  W.dark.droneSorties = (W.dark.droneSorties | 0) + 1;
  return d;
}

/** Polity build with enough build + tech spawns occasional drones while at war. */
function spawnFromPolities(W, log) {
  const wars = W.diplo?.wars || [];
  if (!wars.length || !W.owner || !W.polities?.length) return;
  if (((W._tickIndex | 0) % 24) !== 0) return;
  const rng = rngOf(W, 'rngGod');
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
    spawnDrone(W, {
      cell: silo,
      base: silo,
      target: tgt | 0,
      role: rng() < 0.35 ? 'recon' : (rng() < 0.5 ? 'loiter' : 'strike'),
      endurance: 60 + (rng() * 40) | 0,
      autonomy: 0.3 + rng() * 0.5,
      owner: war.a,
    });
    if (log && rng() < 0.2) {
      log(W.year, 'drone', silo, 0.3, `${attacker.name} lofted a drone`);
    }
  }
}

function stepToward(W, d, dest) {
  if (d.cell === dest) return;
  let best = d.cell, bestDot = -2;
  const tx = W._dirX ? 0 : 0; // unused; use NBR walk
  void tx;
  // Greedy neighbor toward target via build-weighted random among closer cells.
  const rng = rngOf(W, 'rngGod');
  const t = dest;
  let bestDist = 1e9;
  for (let k = 0; k < 4; k++) {
    const n = NBR[d.cell * 4 + k];
    // Chebyshev-ish via shared-owner preference: prefer land for drones.
    if (W.h?.[n] < (W.seaLevel ?? 0)) continue;
    const dist = Math.abs(n - t); // crude but stable; sphere walk is expensive
    // Prefer neighbors that share more NBR with target neighborhood.
    let score = 0;
    for (let j = 0; j < 4; j++) if (NBR[n * 4 + j] === t || n === t) score += 2;
    score -= dist * 0.0001;
    score += rng() * 0.1;
    if (score > bestDot || (n === t)) {
      bestDot = score;
      best = n;
      bestDist = dist;
    }
  }
  // If target is a neighbor, go there.
  for (let k = 0; k < 4; k++) {
    if (NBR[d.cell * 4 + k] === t) { best = t; break; }
  }
  void bestDist;
  d.cell = best;
}

export function droneTick(W, log = null) {
  if (!W.drones) W.drones = [];
  spawnFromPolities(W, log);
  const rng = rngOf(W, 'rngGod');
  const alive = [];
  for (const d of W.drones) {
    if (d.dead) continue;
    d.endurance -= 1;
    if (d.endurance <= 0) {
      // Return to base or crash.
      if (d.cell !== d.base && d.endurance > -20) {
        stepToward(W, d, d.base);
        d.endurance -= 0; // already spent
      } else {
        d.dead = true;
        continue;
      }
    }
    // EW jam chance (§128).
    if (!d.jammed && rng() < 0.02) {
      d.jammed = true;
      if (log) log(W.year, 'drone', d.cell, 0.2, 'Drone jammed');
    }
    if (d.jammed) {
      // Fallback: loiter in place or return (§138).
      if (d.autonomy > 0.55 && !d.choseSelf) {
        d.choseSelf = true;
        d.role = 'loiter';
        if (log) log(W.year, 'drone', d.cell, 0.4, 'Machine chose its own target');
      } else if (rng() < 0.3) {
        stepToward(W, d, d.base);
      }
    } else if (d.role === 'recon') {
      stepToward(W, d, d.target);
      // Reveal fog of war around cell.
      if (W.fogOfWar) {
        W.fogOfWar[d.cell] = 0;
        for (let k = 0; k < 4; k++) W.fogOfWar[NBR[d.cell * 4 + k]] = 0;
      }
    } else if (d.role === 'loiter') {
      if (d.cell !== d.target && rng() < 0.6) stepToward(W, d, d.target);
      else {
        // Circle: random neighbor.
        d.cell = NBR[d.cell * 4 + ((rng() * 4) | 0)];
      }
    } else {
      // strike
      stepToward(W, d, d.target);
      if (d.cell === d.target || (Math.abs(d.cell - d.target) < 3 && rng() < 0.15)) {
        const build = W.build?.[d.cell] || 0;
        if (build > 0.05) {
          const lost = Math.min(build, 0.08 + rng() * 0.12);
          W.build[d.cell] -= lost;
          // Civilian casualty roll (§131).
          const civ = Math.floor(lost * (40 + rng() * 120));
          if (civ > 0) {
            noteCasualty(W, 'war', civ, d.owner === (W.playerPolity ?? -2));
            W.dark = W.dark || {};
            W.dark.droneCivCasualties = (W.dark.droneCivCasualties | 0) + civ;
          }
        }
        d.dead = true;
        continue;
      }
    }
    alive.push(d);
  }
  W.drones = alive.slice(-128);
  W.dark = W.dark || {};
  W.dark.drones = W.drones.length;
}
