/** Colonisation front + life flux — where the biosphere is *changing*.
 *  Occupancy alone is a still life; the front is the moving edge. */

import { clamp } from '../math.js';
import { NC, NBR, DIR } from '../sphere.js';
import { isPinnedEarth } from './ruleMode.js';

function ensure(W) {
  if (!W.lifeFront || W.lifeFront.length !== NC) {
    W.lifeFront = new Float32Array(NC);
    W.lifeFlux = new Float32Array(NC);
    W.lifePrevTick = new Float32Array(NC);
  }
}

/** Call at end of bioTick after `life` is written. */
export function updateLifeFront(W) {
  ensure(W);
  const life = W.life;
  const front = W.lifeFront;
  const flux = W.lifeFlux;
  const prev = W.lifePrevTick;
  let frontSum = 0, frontN = 0, maxF = 0;
  for (let c = 0; c < NC; c++) {
    const cur = life[c] || 0;
    const d = cur - (prev[c] || 0);
    flux[c] = clamp(d * 8, -1, 1);
    prev[c] = cur;

    /* Edge: sparse cell next to lush neighbour — the leading rim. */
    let nl = 0;
    for (let k = 0; k < 4; k++) nl = Math.max(nl, life[NBR[c * 4 + k]] || 0);
    const edge = nl > 0.22 && cur < nl * 0.72 ? (nl - cur) : 0;
    const advancing = d > 0.008 ? d * 4 : 0;
    const deepIce = (W.ice?.[c] || 0) > 0.55;
    const deepSea = W.h[c] < W.seaLevel && (W.seaLevel - W.h[c]) > 0.25;
    const arid = !deepSea && (W.moist?.[c] || 0) < 0.08 && cur < 0.05;
    const barrier = deepIce || deepSea ? 0.12 : arid ? 0.35 : 1;
    front[c] = clamp((edge * 1.4 + advancing) * barrier, 0, 1);
    if (front[c] > 0.08) { frontSum += front[c]; frontN++; }
    if (front[c] > maxF) maxF = front[c];
  }
  W.frontCells = frontN;
  W.frontMean = frontN ? frontSum / frontN : 0;
  W.frontMax = maxF;
}

/** Long-range dispersal: wind / flow can seed a cell two hops away. */
/* `rng` is required. It used to default to `Math.random`, which meant one
   forgetful caller anywhere would silently make every run irreproducible — the
   seed string, the twin-world control and rewind-the-tape all depend on this
   never happening. `bio.js` passes `rngOf(W, 'rngBio')`. */
export function disperseLife(W, rng) {
  if (!W.life || isPinnedEarth(W.rule)) return 0;
  const life = W.life;
  let seeds = 0;
  const tries = Math.min(48, Math.max(8, (NC / 512) | 0));
  for (let t = 0; t < tries; t++) {
    if (rng() > 0.35) continue;
    const c = (rng() * NC) | 0;
    if ((life[c] || 0) < 0.28) continue;
    const wind = Math.hypot(W.windU?.[c] || 0, W.windV?.[c] || 0);
    const flow = W.flow?.[c] || 0;
    if (wind < 0.08 && flow < 0.15) continue;
    const n1 = NBR[c * 4 + ((rng() * 4) | 0)];
    const n2 = NBR[n1 * 4 + ((rng() * 4) | 0)];
    if (n2 === c) continue;
    if ((W.ice?.[n2] || 0) > 0.5) continue;
    if ((life[n2] || 0) > 0.12) continue;
    const fromSea = W.h[c] < W.seaLevel;
    const toSea = W.h[n2] < W.seaLevel;
    if (fromSea !== toSea && rng() > 0.2) continue;
    if (!toSea && (W.moist?.[n2] || 0) < 0.1 && rng() > 0.25) continue;
    life[n2] = Math.min(0.35, (life[n2] || 0) + life[c] * 0.08);
    seeds++;
    if (W.lifeFront) W.lifeFront[n2] = Math.max(W.lifeFront[n2] || 0, 0.55);
  }
  W.disperseSeeds = (W.disperseSeeds | 0) + seeds;
  return seeds;
}

/** Globe swarm / hunt / carcass marks — biology that moves from orbit. */
export function updateSwarmMarks(W) {
  const marks = [];
  for (const g of W.groups || []) {
    if ((g.n || 0) < 4 || g.cell < 0) continue;
    marks.push({
      cell: g.cell,
      n: g.n,
      kind: g.kind,
      name: g.name,
      route: g.route || null,
      type: 'swarm',
    });
  }
  for (const car of W.carcasses || []) {
    if ((car.mass || 0) < 0.15 || car.cell < 0) continue;
    marks.push({ cell: car.cell, n: 1, type: 'carcass', mass: car.mass });
  }
  W.swarmMarks = marks;
  W.swarmCount = marks.filter((m) => m.type === 'swarm').length;
}

/** Push a short-lived spark for local view / rate pulse. */
export function noteLifeSpark(W, cell, kind) {
  if (cell < 0) return;
  if (!W.lifeSparks) W.lifeSparks = [];
  W.lifeSparks.push({ cell, kind, t: 0 });
  if (W.lifeSparks.length > 96) W.lifeSparks.splice(0, W.lifeSparks.length - 96);
}

export function ageLifeSparks(W) {
  const list = W.lifeSparks;
  if (!list?.length) return;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].t = (list[i].t || 0) + 1;
    if (list[i].t > 28) list.splice(i, 1);
  }
}

/** Fill a line buffer with swarm blobs + migration ticks for the flat drawer. */
export function fillLifeMarks(out, W) {
  let n = 0;
  const marks = W.swarmMarks || [];
  const rel = W.rule?.earthLike ? Math.min(W.rule.relief || 0.02, 0.018) : (W.rule?.relief || 0.02);
  const sea = W.seaLevel || 0;
  const lift = (c) => {
    const rr = 1 + (Math.max(W.h?.[c] || 0, sea) - sea) * rel + ((W.build?.[c] || 0) * 0.004);
    return rr * 1.012;
  };
  for (const m of marks) {
    if (n + 12 >= out.length) break;
    const c = m.cell | 0;
    if (c < 0 || c >= NC) continue;
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const rr = lift(c);
    const rad = m.type === 'swarm' ? 0.022 + Math.min(0.05, (m.n || 4) * 0.0035) : 0.014;
    /* Small cross on the sphere — readable as a moving biological mark. */
    const ux = -y, uy = x, uz = 0;
    const ul = Math.hypot(ux, uy, uz) || 1;
    const rx = ux / ul * rad, ry = uy / ul * rad, rz = uz / ul * rad;
    const vx = y * rz - z * ry, vy = z * rx - x * rz, vz = x * ry - y * rx;
    out[n++] = (x - rx) * rr; out[n++] = (y - ry) * rr; out[n++] = (z - rz) * rr;
    out[n++] = (x + rx) * rr; out[n++] = (y + ry) * rr; out[n++] = (z + rz) * rr;
    out[n++] = (x - vx) * rr; out[n++] = (y - vy) * rr; out[n++] = (z - vz) * rr;
    out[n++] = (x + vx) * rr; out[n++] = (y + vy) * rr; out[n++] = (z + vz) * rr;
  }
  return (n / 3) | 0;
}
