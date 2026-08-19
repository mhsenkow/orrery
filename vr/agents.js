/** Moving entities / light agents on the cube-sphere.
 *  Density tracks life so forests fill in as blooms spread.
 *  Settlers (kind 5) raise visible builds on living land — watch towns grow. */

import { mulberry32 } from './math.js';
import { NC, DIR, NBR } from './sphere.js';
import { W } from './world.js';
import { logEvent } from './chronicle.js';
import { KIND_RGB, cladeRGB } from './sim/lifeColour.js';
import { rngOf } from './sim/rng.js';
import { bodyPlanFromTraits, passesSilhouette, planOf } from './sim/morphology.js';
import { lineageAt, cellLifeSignal } from './sim/evolve.js';
import { isSubmerged, isLand, localSeaLevel } from './sim/cellSurface.js';
import { isModernEarth } from './sim/ruleMode.js';
import { settleCities } from './sim/city.js';
import { presentTime, noteWear, isOutNow } from './sim/present.js';
import { morphTileOf, resetMorphAtlas } from './sprites.js';

export const MAX_ENT = 1400;
export const ENT = {
  n: 0,
  data: new Float32Array(MAX_ENT * 8),
  meta: new Array(MAX_ENT),
};
let _idSeq = 1;

const NAMES_A = ['Ash', 'Bri', 'Cor', 'Del', 'Fen', 'Gri', 'Hel', 'Jor', 'Kel', 'Lum', 'Mor', 'Nyx', 'Orn', 'Pyx', 'Quin', 'Ryn', 'Sol', 'Tor', 'Ulm', 'Vex'];
const NAMES_B = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'or', 'en', 'an'];

function nameFrom(seed, i) {
  const rng = mulberry32(seed + i * 9973);
  return NAMES_A[(rng() * NAMES_A.length) | 0] + NAMES_B[(rng() * NAMES_B.length) | 0];
}

function kindForCell(c, rng) {
  const R = W.rule;
  const e = (W.h[c] - W.seaLevel) / (1 - W.seaLevel + 1e-6);
  if (R.daisyworld) {
    if (W.blackDaisy[c] > 0.15) return 12;
    if (W.whiteDaisy[c] > 0.15) return 13;
    return -1;
  }
  if (R.signature === 'worms' && isSubmerged(W, c)) return rng() < 0.35 ? 7 : 8;
  if (isSubmerged(W, c)) {
    if (W.reef[c] > 0.25 || cellLifeSignal(W, c) > 0.35) return 14;
    return W.lifeClass[c] >= 4 ? 15 : -1;
  }
  if (W.ice[c] > 0.45) return 6;
  if (!R.airless && W.unlockedClass >= 1 && W.life[c] > 0.28 && W.ice[c] < 0.25) {
    const settleChance = R.earthLike
      ? 0.03 + W.build[c] * 0.2
      : 0.14 + W.build[c] * 0.55 + (W.life[c] > 0.5 ? 0.18 : 0);
    if (rng() < settleChance) return 5;
  }
  if (W.life[c] > 0.45) return W.moist[c] > 0.4 ? 0 : 1;
  if (W.life[c] > 0.18) return 2;
  if (W.life[c] > 0.08) return 9;
  if (W.moist[c] < 0.2 && W.life[c] < 0.05) return 3;
  if (e > 0.65) return 4;
  if (W.lifeClass[c] >= 6 && W.life[c] > 0.35) return 5;
  if (R.airless) return rng() < 0.5 ? 10 : (rng() < 0.05 ? 11 : -1);
  return -1;
}

function writeEnt(n, c, kind, rng) {
  const jx = (rng() - 0.5) * 0.012;
  const jy = (rng() - 0.5) * 0.012;
  const jz = (rng() - 0.5) * 0.012;
  let x = DIR[c * 3] + jx, y = DIR[c * 3 + 1] + jy, z = DIR[c * 3 + 2] + jz;
  const l = Math.hypot(x, y, z) || 1;
  x /= l; y /= l; z /= l;
  const buildLift = (W.build[c] || 0) * (isModernEarth(W.rule) ? 0.0035 : 0.012);
  const sea = localSeaLevel(W, c);
  const rel = isModernEarth(W.rule) ? Math.min(W.rule.relief, 0.018) : W.rule.relief;
  const rr = 1 + (Math.max(W.h[c], sea) - sea) * rel + buildLift;
  const o = n * 8;
  ENT.data[o] = x * rr; ENT.data[o + 1] = y * rr; ENT.data[o + 2] = z * rr;
  const lifeBoost = 0.85 + W.life[c] * 0.45;
  // Morphology from live phylogeny via popId (not arithmetic clade assignment)
  let plan = null;
  let node = null;
  if (W.tree?.living?.length) {
    node = lineageAt(W, c);
    if (node?.traits) {
      // Genome first — the body on screen is expressed from the lineage's own modules,
      // and falls back to the trait shim only for a node that predates the grammar.
      plan = planOf(node, {
        O2: W.gases?.O2 ?? 0.21,
        gravity: W.rule?.gravity ?? 1,
      });
      if (!passesSilhouette(plan)) plan = null;
      else kind = morphTileOf(plan) ?? plan.spriteKind ?? kind;
    }
  }
  const base = kind === 7 ? 0.036 : kind === 5 ? 0.02 : kind <= 2 ? 0.013 : 0.015;
  const morphScale = plan ? plan.size * 0.014 : base;
  const scale = morphScale
    * (0.75 + rng() * 0.4) * (W.bodyScale || 1) * Math.min(1.12, lifeBoost)
    * (W.rule.earthLike ? 0.78 : 1);
  ENT.data[o + 3] = scale;
  ENT.data[o + 4] = kind;
  // Clade tint from lineage id when plan exists
  const rgb = KIND_RGB[kind] || [200, 200, 200];
  let v = 0.85 + rng() * 0.2;
  let cr = rgb[0], cg = rgb[1], cb = rgb[2];
  if (plan && node) {
    const warm = plan.pigmentBias || 0.5;
    cr = cr * (0.85 + warm * 0.3);
    cb = cb * (1.1 - warm * 0.25);
    v *= 0.9 + (plan.armour || 0) * 0.2;
    const [hr, hg, hb] = cladeRGB(node.id);
    cr = cr * 0.55 + hr * 0.45;
    cg = cg * 0.55 + hg * 0.45;
    cb = cb * 0.55 + hb * 0.45;
  }
  ENT.data[o + 5] = (cr / 255) * v;
  ENT.data[o + 6] = (cg / 255) * v;
  ENT.data[o + 7] = (cb / 255) * v;
  ENT.meta[n] = {
    id: _idSeq++,
    cell: c, kind, age: 0,
    name: kind === 5 || kind === 7 || kind >= 6 ? nameFrom(W.seed, _idSeq) : null,
    born: W.year,
    bornCell: c,
    plan,
    popId: node?.id ?? 0,
    cladeName: node?.name ?? null,
    stride: plan?.stride || 1,
    heading: 0,
    prevCell: c,
    arriveAt: null,
    behav: kind === 5 ? 'tend' : (kind <= 2 ? 'rest' : 'forage'),
    dead: false,
    cause: null,
  };
}

export function respawnEntities() {
  resetMorphAtlas();
  const rng = rngOf(W, 'rngAgents');
  let n = 0;
  const living = [];
  for (let c = 0; c < NC; c++) {
    if (W.life[c] > 0.08 || W.reef[c] > 0.2 || W.rule.daisyworld || W.build[c] > 0.1) living.push(c);
  }
  const cap = W.rule.earthLike ? Math.min(MAX_ENT, 560) : MAX_ENT;
  const pool = living.length > 200 ? living : null;
  if (pool) {
    const stride = Math.max(1, Math.floor(pool.length / (cap * 0.85)));
    for (let i = 0; i < pool.length && n < cap; i += stride) {
      const c = pool[i];
      const kind = kindForCell(c, rng);
      if (kind < 0) continue;
      if (W.rule.earthLike && (kind === 2 || kind === 9) && rng() > 0.35) continue;
      if (W.rule.earthLike && kind <= 1 && rng() > 0.55) continue;
      if (W.rule.earthLike && kind === 5 && rng() > 0.4) continue;
      writeEnt(n++, c, kind, rng);
    }
  } else {
    const stride = Math.max(1, Math.floor(NC / (cap * 2.2)));
    for (let c = 0; c < NC && n < cap; c += stride) {
      const kind = kindForCell(c, rng);
      if (kind < 0) continue;
      writeEnt(n++, c, kind, rng);
    }
  }
  ENT.n = n;
}

function capForWorld() {
  return W.rule.earthLike ? Math.min(MAX_ENT, 560) : MAX_ENT;
}

/** Fill empty slots without wiping living individuals. */
function topUpEntities() {
  const rng = rngOf(W, 'rngAgents');
  const cap = capForWorld();
  if (ENT.n >= cap * 0.85) return;
  const occupied = new Set();
  for (let i = 0; i < ENT.n; i++) {
    if (ENT.meta[i] && !ENT.meta[i].dead) occupied.add(ENT.meta[i].cell);
  }
  const stride = Math.max(3, (NC / (cap * 2)) | 0);
  for (let c = 0; c < NC && ENT.n < cap; c += stride) {
    if (occupied.has(c)) continue;
    if (W.life[c] < 0.12 && (W.reef[c] || 0) < 0.2 && (W.build[c] || 0) < 0.1) continue;
    const kind = kindForCell(c, rng);
    if (kind < 0) continue;
    writeEnt(ENT.n++, c, kind, rng);
  }
}

function compactDead() {
  let w = 0;
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    if (w !== i) {
      ENT.meta[w] = m;
      ENT.data.copyWithin(w * 8, i * 8, i * 8 + 8);
    }
    w++;
  }
  ENT.n = w;
}

let _head = null;
let _next = null;
function rebuildBuckets() {
  if (!_head || _head.length !== NC) {
    _head = new Int32Array(NC);
    _next = new Int32Array(MAX_ENT);
  }
  _head.fill(-1);
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    const c = m.cell;
    _next[i] = _head[c];
    _head[c] = i;
  }
}

function eachNearby(c, fn) {
  let i = _head[c];
  while (i >= 0) { fn(i); i = _next[i]; }
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    i = _head[n];
    while (i >= 0) { fn(i); i = _next[i]; }
  }
}

function cellDot(a, b) {
  return DIR[a * 3] * DIR[b * 3] + DIR[a * 3 + 1] * DIR[b * 3 + 1] + DIR[a * 3 + 2] * DIR[b * 3 + 2];
}

function headingOf(from, to) {
  // Sign of eastward component in a crude local frame
  return DIR[to * 3] - DIR[from * 3];
}

function pickBehav(m, c, rng) {
  const ash = W.ash?.[c] || 0;
  const dust = W.dust?.[c] || 0;
  const storm = W.stormField?.[c] || 0;
  if (ash > 0.18 || dust > 0.28 || storm > 0.35 || W.ice[c] > 0.55) return 'flee';
  if (m.kind === 5) return W.build[c] > 0.3 ? 'tend' : 'forage';
  if (m.kind <= 2) return 'rest';
  if (!isOutNow(m.kind, c, m.id || 0) && rng() < 0.72) return 'rest';
  const roll = rng();
  if (roll < 0.18) return 'rest';
  if (roll < 0.28) return 'travel';
  return 'forage';
}

function writePos(n, c) {
  const o = n * 8;
  const rel = W.rule.earthLike ? Math.min(W.rule.relief, 0.018) : W.rule.relief;
  const buildLift = (W.build[c] || 0) * (W.rule.earthLike ? 0.0035 : 0.012);
  const rr = 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * rel + buildLift;
  ENT.data[o] = DIR[c * 3] * rr;
  ENT.data[o + 1] = DIR[c * 3 + 1] * rr;
  ENT.data[o + 2] = DIR[c * 3 + 2] * rr;
}

/** Interpolate beings between cells on the presentation clock. */
export function presentAgents() {
  const t = presentTime();
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    const o = i * 8;
    const rel = W.rule.earthLike ? Math.min(W.rule.relief, 0.018) : W.rule.relief;
    const lift = (c) => (W.build[c] || 0) * (W.rule.earthLike ? 0.0035 : 0.012);
    const rrAt = (c) => 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * rel + lift(c);
    let x = DIR[m.cell * 3], y = DIR[m.cell * 3 + 1], z = DIR[m.cell * 3 + 2];
    let rr = rrAt(m.cell);
    if (m.prevCell >= 0 && m.arriveAt != null && t < m.arriveAt) {
      const span = Math.max(0.18, 0.28 / Math.max(0.4, m.stride || 1));
      const u = Math.max(0, Math.min(1, 1 - (m.arriveAt - t) / span));
      const e = u * u * (3 - 2 * u);
      const pc = m.prevCell;
      x = DIR[pc * 3] + (x - DIR[pc * 3]) * e;
      y = DIR[pc * 3 + 1] + (y - DIR[pc * 3 + 1]) * e;
      z = DIR[pc * 3 + 2] + (z - DIR[pc * 3 + 2]) * e;
      const l = Math.hypot(x, y, z) || 1;
      x /= l; y /= l; z /= l;
      rr = rrAt(pc) + (rr - rrAt(pc)) * e;
    }
    ENT.data[o] = x * rr;
    ENT.data[o + 1] = y * rr;
    ENT.data[o + 2] = z * rr;
  }
}

function stageLabel(b) {
  if (b >= 0.85) return 'city';
  if (b >= 0.55) return 'town';
  if (b >= 0.3) return 'village';
  return 'camp';
}

export function agentsTick() {
  const rng = rngOf(W, 'rngAgents');
  if (ENT.n === 0) {
    respawnEntities();
    return;
  }
  if ((W.year | 0) % 4000 === 0) topUpEntities();
  compactDead();
  rebuildBuckets();

  let buildsDirty = false;
  let built = 0;

  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    m.age++;
    let c = m.cell;
    m.behav = pickBehav(m, c, rng);

    if (m.kind === 5 && W.h[c] >= W.seaLevel && W.ice[c] < 0.35 && W.life[c] > 0.15) {
      const before = W.build[c];
      const rate = (0.022 + W.life[c] * 0.035 + (W.unlockedClass >= 5 ? 0.015 : 0))
        * (W.rule.earthLike ? 0.12 : 1);
      W.build[c] = Math.min(W.rule.earthLike ? 0.55 : 1, before + rate);
      if (W.build[c] - before > 0.001) {
        buildsDirty = true;
        built++;
        m.age = Math.max(m.age, 1);
      }
      const stages = [0.3, 0.55, 0.85];
      for (const t of stages) {
        if (before < t && W.build[c] >= t) {
          const who = m.name || 'Settlers';
          logEvent(W.chron, W.year, 'build', c, W.build[c],
            `${who} founded a ${stageLabel(W.build[c])}`);
        }
      }
    } else if (W.h[c] >= W.seaLevel && W.life[c] < 0.08 && W.build[c] > 0) {
      W.build[c] = Math.max(0, W.build[c] - 0.004);
      if (W.build[c] > 0) buildsDirty = true;
    }

    let best = c;
    let score = m.kind === 5
      ? W.build[c] * 1.2 + W.life[c] * 0.5 - W.ice[c]
      : W.life[c] + W.moist[c] * 0.3 - W.ice[c] * 0.5;

    if (m.kind === 6 || m.kind === 14 || m.kind === 15 || m.kind === 7) {
      let cx = 0, cy = 0, cz = 0, nF = 0;
      let sx = 0, sy = 0, sz = 0, nS = 0;
      eachNearby(c, (j) => {
        if (j === i || nF >= 8) return;
        const o = ENT.meta[j];
        if (!o || o.dead || o.kind !== m.kind) return;
        if (cellDot(c, o.cell) < 0.92) return;
        cx += DIR[o.cell * 3]; cy += DIR[o.cell * 3 + 1]; cz += DIR[o.cell * 3 + 2];
        nF++;
        if (o.cell === c) {
          sx += DIR[o.cell * 3]; sy += DIR[o.cell * 3 + 1]; sz += DIR[o.cell * 3 + 2];
          nS++;
        }
      });
      if (nF > 0) {
        cx /= nF; cy /= nF; cz /= nF;
        if (nS > 1) { cx -= sx * 0.35; cy -= sy * 0.35; cz -= sz * 0.35; }
        let bestF = c, bestDot = -2;
        for (let k = 0; k < 4; k++) {
          const nb = NBR[c * 4 + k];
          const dot = DIR[nb * 3] * cx + DIR[nb * 3 + 1] * cy + DIR[nb * 3 + 2] * cz;
          if (dot > bestDot) { bestDot = dot; bestF = nb; }
        }
        const stride = m.stride || 1;
        if (bestF !== c && rng() < 0.25 * Math.min(2, stride)) best = bestF;
      }
    }

    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      let s = m.kind === 5
        ? W.build[n] * 1.2 + W.life[n] * 0.5 - W.ice[n] + rng() * 0.08
        : W.life[n] + W.moist[n] * 0.3 - W.ice[n] * 0.5 + rng() * 0.05;
      if (m.behav === 'flee') s -= (W.ash?.[n] || 0) * 2 + (W.dust?.[n] || 0) * 1.5 + (W.stormField?.[n] || 0);
      if (m.behav === 'rest') s -= 0.4;
      if (s > score) { score = s; best = n; }
    }
    const moveChance = m.behav === 'rest' ? 0.06
      : m.behav === 'flee' ? 0.7
      : m.kind === 5 ? (W.build[c] > 0.25 ? 0.12 : 0.35)
      : 0.4;
    if (best !== c && rng() < moveChance) {
      noteWear(c, 0.09);
      noteWear(best, 0.05);
      m.prevCell = c;
      m.heading = headingOf(c, best);
      m.arriveAt = presentTime() + Math.max(0.18, 0.28 / Math.max(0.4, m.stride || 1));
      m.cell = best;
      c = best;
      const destNode = lineageAt(W, c);
      const prevPopId = m.popId ?? 0;
      if (destNode?.id !== prevPopId) {
        m.popId = destNode?.id ?? 0;
        m.cladeName = destNode?.name ?? null;
      }
      const nk = kindForCell(c, rng);
      const kind = nk >= 0 ? nk : m.kind;
      m.kind = kind;
      writePos(i, c);
      ENT.data[i * 8 + 4] = kind;
      if (destNode?.id !== prevPopId && destNode?.traits) {
        const env = { O2: W.gases?.O2 ?? 0.21, gravity: W.rule?.gravity ?? 1 };
        const newPlan = planOf(destNode, env);
        if (passesSilhouette(newPlan)) {
          m.plan = newPlan;
          m.stride = newPlan.stride || 1;
        }
      }
    } else if (m.kind === 5) {
      writePos(i, c);
    }

    if (m.kind === 7 && W.rule.signature === 'worms') {
      W.h[c] = Math.max(-1, W.h[c] - 0.002);
      W.sediment[NBR[c * 4]] = Math.min(1, W.sediment[NBR[c * 4]] + 0.01);
    }

    if (W.life[c] < 0.04 && m.kind < 10 && rng() < 0.12) {
      m.dead = true;
      m.cause = W.ice[c] > 0.4 ? 'ice' : (W.temp[c] > 0.75 ? 'heat' : 'starved');
      m.died = W.year;
      if (m.name) {
        logEvent(W.chron, W.year, 'death', c, 0.2,
          `${m.name} ${m.cause}`, { who: m.name, cause: m.cause, born: m.born });
      }
    }
  }

  W.buildersActive = built;
  if (buildsDirty) W._buildsDirty = true;
  if ((W.year | 0) % 40 === 0) settleCities(W);
  if (ENT.n < capForWorld() * 0.45) topUpEntities();
}

export function followTarget() {
  for (let i = 0; i < ENT.n; i++) {
    if (ENT.meta[i]?.kind === 5 && ENT.meta[i]?.name && !ENT.meta[i].dead) return ENT.meta[i];
  }
  for (let i = 0; i < ENT.n; i++) {
    if (ENT.meta[i]?.name && !ENT.meta[i].dead) return ENT.meta[i];
  }
  return null;
}
