/** What a civilisation does to its own planet.
 *
 *  Everything in the Strike desk is something a *planet* does: a rock arrives, a
 *  plume rises, a fault slips. None of it has an author. This module is the other
 *  half — harm with a return address. Four fields, each of which behaves
 *  differently on purpose, because "damage" is not one thing:
 *
 *    `toxin`   chemical contamination. Kills slowly, creeps downhill and
 *              downwind, and takes centuries to break down. The land looks fine.
 *    `rad`     radiation: fallout, waste, a breached core. Kills fast, then
 *              refuses to leave — half-life measured in thousands of ticks — and
 *              makes ground uninhabitable long after it stops being lethal.
 *    `disease` an epidemic. Needs hosts, travels between *settlements* rather
 *              than across ground, and burns out where it has run through the
 *              susceptible. The only one of the four that can end on its own.
 *    `war`     contested ground. Destroys what is built, sets fires, and moves.
 *
 *  All four are sparse: a clean planet costs four array-length checks a tick. The
 *  cost of a poisoned one is proportional to the poisoned area, not to the world.
 *
 *  Coupling is deliberately through fields the rest of the simulation already
 *  reads — `life`, `build`, `fire`, `nutrientN/P` — so nothing else needed
 *  teaching. `pickBehav` in agents.js flees toxin and radiation the same way it
 *  already fled ash.
 */

import { clamp } from '../math.js';
import { NC, NBR, DIR } from '../sphere.js';
import { rngOf } from './rng.js';
import { igniteFire } from './fire.js';

/** Below this a cell is clean and leaves the active list. */
const GONE = 0.004;

/* Per-tick survival fractions. These are the character of each hazard and the
   reason they do not feel alike: toxin outlasts a human life, radiation outlasts
   the civilisation that made it, a war ends, and an epidemic ends fastest of all. */
const TOXIN_KEEP = 0.9985;   // half-life ~460 ticks
const RAD_KEEP = 0.99975;    // half-life ~2 770 ticks
const WAR_KEEP = 0.982;      // half-life ~38 ticks
const DISEASE_KEEP = 0.972;  // half-life ~24 ticks in a cell, but it reinfects

function ensure(W) {
  if (!W.toxin || W.toxin.length !== NC) {
    W.toxin = new Float32Array(NC);
    W.rad = new Float32Array(NC);
    W.disease = new Float32Array(NC);
    W.warFront = new Float32Array(NC);
    W.immune = new Float32Array(NC);
    W._toxinCells = [];
    W._radCells = [];
    W._diseaseCells = [];
    W._warCells = [];
  }
  if (!W._toxinCells) W._toxinCells = [];
  if (!W._radCells) W._radCells = [];
  if (!W._diseaseCells) W._diseaseCells = [];
  if (!W._warCells) W._warCells = [];
}

export function resetAnthro(W) {
  if (W.toxin?.length === NC) {
    W.toxin.fill(0); W.rad.fill(0); W.disease.fill(0);
    W.warFront.fill(0); W.immune.fill(0);
  } else {
    W.toxin = W.rad = W.disease = W.warFront = W.immune = null;
  }
  W._toxinCells = [];
  W._radCells = [];
  W._diseaseCells = [];
  W._warCells = [];
  W.wars = [];
  W.toxinCells = 0;
  W.radCells = 0;
  W.diseaseCells = 0;
  W.warCells = 0;
  W.plagueDeaths = 0;
  W.warRuin = 0;
  W.radPeak = 0;
  W._anthroLogged = 0;
}

function add(W, field, list, c, amt, cap = 1) {
  if (c < 0 || c >= NC) return;
  const was = field[c];
  field[c] = Math.min(cap, was + amt);
  if (was <= GONE && field[c] > GONE) list.push(c);
}

/** Chemical contamination at a cell and its ring. */
export function pourToxin(W, cell, amount = 0.8, radius = 1) {
  ensure(W);
  add(W, W.toxin, W._toxinCells, cell, amount);
  for (let k = 0; k < 4 && radius > 0; k++) {
    add(W, W.toxin, W._toxinCells, NBR[cell * 4 + k], amount * 0.55);
  }
  return { ok: true, cell, amount };
}

/** Radiation: fallout from a burst, or a waste dump that was never going to move. */
export function irradiate(W, cell, amount = 0.9, radius = 1) {
  ensure(W);
  add(W, W.rad, W._radCells, cell, amount);
  for (let k = 0; k < 4 && radius > 0; k++) {
    add(W, W.rad, W._radCells, NBR[cell * 4 + k], amount * 0.5);
    if (radius > 1) {
      const n = NBR[cell * 4 + k];
      for (let j = 0; j < 4; j++) add(W, W.rad, W._radCells, NBR[n * 4 + j], amount * 0.22);
    }
  }
  if (amount > (W.radPeak || 0)) W.radPeak = amount;
  return { ok: true, cell, amount };
}

/** Start an epidemic where there are hosts to carry it. */
export function seedDisease(W, cell, opts = {}) {
  ensure(W);
  const virulence = clamp(opts.virulence ?? 0.6, 0.05, 1);
  const transmit = clamp(opts.transmit ?? 0.6, 0.05, 1);
  W.epidemic = {
    virulence, transmit,
    born: W.ageYr,
    engineered: !!opts.engineered,
    name: opts.name || 'outbreak',
  };
  add(W, W.disease, W._diseaseCells, cell, 0.85);
  for (let k = 0; k < 4; k++) add(W, W.disease, W._diseaseCells, NBR[cell * 4 + k], 0.3);
  return { ok: true, cell, virulence, transmit };
}

/**
 * Open a war between two places.
 *
 * A war is a moving front, not a stamp: it is seeded at both ends and each tick
 * it consumes what is built where it sits, sets fires, and pushes toward the
 * other side. It ends because `WAR_KEEP` runs it down, or because there is
 * nothing left to fight over.
 */
export function openWar(W, a, b, intensity = 0.9) {
  ensure(W);
  W.wars = W.wars || [];
  if (W.wars.length >= 6) return { ok: false, note: 'Six fronts is already too many' };
  const war = { a, b, at: a, toward: b, intensity: clamp(intensity, 0.1, 1), age: 0 };
  W.wars.push(war);
  add(W, W.warFront, W._warCells, a, intensity);
  add(W, W.warFront, W._warCells, b, intensity * 0.8);
  return { ok: true, war };
}

/** Where a hazard would be worst — used by the tools to explain themselves. */
export function hazardAt(W, c) {
  return {
    toxin: W.toxin?.[c] || 0,
    rad: W.rad?.[c] || 0,
    disease: W.disease?.[c] || 0,
    war: W.warFront?.[c] || 0,
  };
}

/** Total harm at a cell, for the movement scorer and the settlement gate. */
export function harmAt(W, c) {
  if (!W.toxin) return 0;
  return (W.toxin[c] || 0) * 0.7 + (W.rad[c] || 0) + (W.warFront[c] || 0) * 1.2;
}

function stepToxin(W) {
  const list = W._toxinCells;
  if (!list.length) { W.toxinCells = 0; return; }
  const tox = W.toxin;
  const next = [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    let v = tox[c];
    if (v <= GONE) { tox[c] = 0; continue; }
    // Poison kills without looking like anything. Soil holds it; nutrients go.
    if (W.life[c] > 0) W.life[c] = Math.max(0, W.life[c] - v * 0.05);
    if (W.nutrientN) W.nutrientN[c] = Math.max(0, W.nutrientN[c] - v * 0.01);
    if (W.nutrientP) W.nutrientP[c] = Math.max(0, W.nutrientP[c] - v * 0.008);
    // Creep: downhill, and downwind on land. Water carries it much further.
    if (v > 0.12) {
      const wet = W.h[c] < W.seaLevel ? 2.2 : 1;
      let lowest = -1, drop = 0;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        const d = W.h[c] - W.h[n];
        if (d > drop) { drop = d; lowest = n; }
      }
      const give = v * 0.02 * wet;
      if (lowest >= 0) { tox[c] -= give; add(W, tox, next, lowest, give); }
    }
    v = tox[c] * TOXIN_KEEP;
    if (v > GONE) { tox[c] = v; next.push(c); } else tox[c] = 0;
  }
  W._toxinCells = next;
  W.toxinCells = next.length;
}

function stepRad(W) {
  const list = W._radCells;
  if (!list.length) { W.radCells = 0; return; }
  const rad = W.rad;
  const next = [];
  const windU = W.windU, windV = W.windV;
  /* Fallout drifts with wind — small fraction to the downwind neighbour (§201). */
  const drift = [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    let v = rad[c];
    if (v <= GONE) { rad[c] = 0; continue; }
    // Acute dose first, then a long refusal to leave.
    if (W.life[c] > 0) W.life[c] = Math.max(0, W.life[c] - v * 0.11);
    // Nobody maintains a building in a hot zone.
    if (W.build?.[c] > 0) W.build[c] = Math.max(0, W.build[c] - v * 0.03);

    if (windU && v > 0.05) {
      const u = windU[c] || 0, wv = windV?.[c] || 0;
      if (u * u + wv * wv > 1e-6) {
        let best = -1, bestAlong = 0;
        const b4 = c * 4;
        for (let k = 0; k < 4; k++) {
          const n = NBR[b4 + k];
          // Prefer the neighbor index offset matching wind sign roughly.
          const along = (u > 0 ? 1 : -1) * ((n - c) || 1) + Math.abs(wv) * 0.1;
          // Use chord-free proxy: pick neighbor with max |u|+|v| alignment via k.
          const score = (k === 0 ? u : k === 1 ? wv : k === 2 ? -u : -wv);
          if (score > bestAlong) { bestAlong = score; best = n; }
          void along;
        }
        if (best >= 0 && bestAlong > 0.02) {
          const amt = v * 0.04;
          rad[c] = v - amt;
          drift.push(best, amt);
          v = rad[c];
        }
      }
    }

    v = rad[c] * RAD_KEEP;
    if (v > GONE) { rad[c] = v; next.push(c); } else rad[c] = 0;
  }
  for (let i = 0; i < drift.length; i += 2) {
    const n = drift[i], amt = drift[i + 1];
    const nv = (rad[n] || 0) + amt;
    rad[n] = nv;
    if (nv > GONE) next.push(n);
  }
  W._radCells = next;
  W.radCells = next.length;
}

/**
 * Epidemic step.
 *
 * Travels along hosts, not across ground: a cell infects its neighbours in
 * proportion to how populated *they* are, so an outbreak follows the settled
 * corridors and stalls at empty country. `immune` is the burnt-through
 * susceptible pool, which is what actually ends an epidemic — and it decays, so
 * a disease can come back a few centuries later.
 */
function stepDisease(W, log) {
  const list = W._diseaseCells;
  if (!list.length) { W.diseaseCells = 0; return; }
  const ep = W.epidemic || { virulence: 0.5, transmit: 0.5 };
  const dis = W.disease;
  const imm = W.immune;
  const rng = rngOf(W, 'rngGod');
  const next = [];
  let killed = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    let v = dis[c];
    if (v <= GONE) { dis[c] = 0; continue; }
    const hosts = (W.build?.[c] || 0) * 0.7 + (W.beingDens?.[c] || 0) * 0.5;
    // Mortality hits what is built (people) and the animals sharing the cell.
    if (hosts > 0.02) {
      const bite = v * ep.virulence * 0.045;
      if (W.build?.[c] > 0) {
        const lost = Math.min(W.build[c], bite);
        W.build[c] -= lost;
        killed += lost;
      }
      if (W.life[c] > 0) W.life[c] = Math.max(0, W.life[c] - bite * 0.25);
    }
    imm[c] = Math.min(1, imm[c] + v * 0.03);
    /* Spread toward hosts, damped by what is already immune there. Two rings,
       because one ring plus a per-cell burnout meant an outbreak died inside
       forty ticks having reached thirty-one cells — a settled continent is
       connected by trade and travel, not only by adjacency. */
    if (v > 0.06) {
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        const hostN = (W.build?.[n] || 0) * 0.8 + (W.beingDens?.[n] || 0) * 0.4;
        if (hostN < 0.02) continue;
        const p = v * ep.transmit * (0.35 + hostN) * (1 - imm[n]) * 1.1;
        if (rng() < p) add(W, dis, next, n, v * 0.7);
        // A jump: the far side of a trade route, not the next field over.
        if (v > 0.4 && rng() < ep.transmit * 0.05) {
          const far = NBR[n * 4 + ((rng() * 4) | 0)];
          if ((W.build?.[far] || 0) > 0.1) add(W, dis, next, far, v * 0.45);
        }
      }
    }
    // Burns out where the susceptible are gone.
    v = dis[c] * DISEASE_KEEP * (1 - imm[c] * 0.55);
    if (v > GONE) { dis[c] = v; next.push(c); } else dis[c] = 0;
  }
  W._diseaseCells = next;
  W.diseaseCells = next.length;
  W.plagueDeaths = (W.plagueDeaths || 0) + killed;
  if (log && next.length > 40 && !W._epiLogged) {
    W._epiLogged = true;
    log(W.year, 'plague', next[0], next.length / 100,
      `${W.epidemic?.engineered ? 'Engineered ' : ''}epidemic across ${next.length} districts`);
  }
  if (!next.length) W._epiLogged = false;
}

/** Immunity fades, so an epidemic is survivable but not solved. */
function fadeImmunity(W) {
  if (!W.immune) return;
  // Once every sixteen ticks; a full sweep is cheap and a strided one stripes.
  if (((W._tickIndex | 0) & 15) !== 0) return;
  const imm = W.immune;
  for (let c = 0; c < NC; c++) {
    if (imm[c] > 0.004) imm[c] *= 0.97;
    else if (imm[c]) imm[c] = 0;
  }
}

function stepWar(W, log) {
  const wars = W.wars;
  const front = W.warFront;
  if (wars?.length) {
    const rng = rngOf(W, 'rngGod');
    const alive = [];
    for (const war of wars) {
      war.age++;
      // The front walks toward the other side, preferring what is worth taking.
      let best = war.at, bestScore = -1e9;
      const tx = DIR[war.toward * 3], ty = DIR[war.toward * 3 + 1], tz = DIR[war.toward * 3 + 2];
      for (let k = 0; k < 4; k++) {
        const n = NBR[war.at * 4 + k];
        const toward = DIR[n * 3] * tx + DIR[n * 3 + 1] * ty + DIR[n * 3 + 2] * tz;
        const prize = (W.build?.[n] || 0) * 1.5;
        const s = toward * 2 + prize + rng() * 0.3 - (W.h[n] < W.seaLevel ? 1.2 : 0);
        if (s > bestScore) { bestScore = s; best = n; }
      }
      if (best !== war.at && rng() < 0.5) war.at = best;
      add(W, front, W._warCells, war.at, war.intensity * 0.5);
      // Reaching the objective ends this front and starts the counter-push.
      if (war.at === war.toward) {
        war.toward = war.a === war.toward ? war.b : war.a;
        war.intensity *= 0.78;
      }
      war.intensity *= 0.994;
      if (war.intensity > 0.12 && war.age < 900) alive.push(war);
      else if (log) log(W.year, 'war', war.at, 0.2, 'The front goes quiet');
    }
    W.wars = alive;
  }

  const list = W._warCells;
  if (!list.length) { W.warCells = 0; return; }
  const next = [];
  const rng = rngOf(W, 'rngGod');
  let ruin = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    let v = front[c];
    if (v <= GONE) { front[c] = 0; continue; }
    // What war does: unbuilds, burns, and salts the ground a little.
    if (W.build?.[c] > 0) {
      const lost = Math.min(W.build[c], v * 0.06);
      W.build[c] -= lost;
      ruin += lost;
    }
    if (W.life[c] > 0) W.life[c] = Math.max(0, W.life[c] - v * 0.02);
    if (v > 0.35 && rng() < v * 0.08) igniteFire(W, c, 0.6 + v * 0.4, 0);
    if (v > 0.5 && rng() < 0.02) add(W, W.toxin, W._toxinCells, c, v * 0.25);
    v = front[c] * WAR_KEEP;
    if (v > GONE) { front[c] = v; next.push(c); } else front[c] = 0;
  }
  W._warCells = next;
  W.warCells = next.length;
  W.warRuin = (W.warRuin || 0) + ruin;
}

/** One step of every anthropogenic hazard. Sparse: clean planets are free. */
export function anthroTick(W, log = null) {
  ensure(W);
  if (!W._toxinCells.length && !W._radCells.length
    && !W._diseaseCells.length && !W._warCells.length && !W.wars?.length) {
    W.toxinCells = W.radCells = W.diseaseCells = W.warCells = 0;
    return;
  }
  stepToxin(W);
  stepRad(W);
  stepDisease(W, log);
  fadeImmunity(W);
  stepWar(W, log);
}
