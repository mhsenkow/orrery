/** Moving entities / light agents on the cube-sphere.
 *  Density tracks life so forests fill in as blooms spread.
 *  Settlers (kind 5) raise visible builds on living land — watch towns grow. */

import { mulberry32 } from './math.js';
import { NC, DIR, NBR } from './sphere.js';
import { W } from './world.js';
import { logEvent } from './chronicle.js';
import { KIND_RGB } from './sim/lifeColour.js';
import { rngOf } from './sim/rng.js';
import { bodyPlanFromTraits, passesSilhouette } from './sim/morphology.js';
import { settleCities } from './sim/city.js';

export const MAX_ENT = 1400;
export const ENT = {
  n: 0,
  data: new Float32Array(MAX_ENT * 8),
  meta: new Array(MAX_ENT),
};

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
  if (R.signature === 'worms' && W.h[c] < W.seaLevel) return rng() < 0.35 ? 7 : 8;
  if (W.h[c] < W.seaLevel) {
    if (W.reef[c] > 0.25 || W.life[c] > 0.35) return 14;
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
  const buildLift = (W.build[c] || 0) * (W.rule.earthLike ? 0.0035 : 0.012);
  const rr = 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * (W.rule.earthLike ? Math.min(W.rule.relief, 0.018) : W.rule.relief) + buildLift;
  const o = n * 8;
  ENT.data[o] = x * rr; ENT.data[o + 1] = y * rr; ENT.data[o + 2] = z * rr;
  const lifeBoost = 0.85 + W.life[c] * 0.45;
  // Morphology from live phylogeny traits when available (grammar)
  let plan = null;
  if (W.tree?.living?.length) {
    const id = W.tree.living[(c + n) % W.tree.living.length];
    const node = W.tree.nodes.find((x) => x.id === id);
    if (node?.traits) {
      plan = bodyPlanFromTraits(node.traits, {
        O2: W.gases?.O2 ?? 0.21,
        gravity: W.rule?.gravity ?? 1,
      });
      if (!passesSilhouette(plan)) plan = null;
      else kind = plan.spriteKind ?? kind;
    }
  }
  const base = kind === 7 ? 0.036 : kind === 5 ? 0.02 : kind <= 2 ? 0.013 : 0.015;
  const morphScale = plan ? plan.size * 0.014 : base;
  const scale = morphScale
    * (0.75 + rng() * 0.4) * (W.bodyScale || 1) * Math.min(1.12, lifeBoost)
    * (W.rule.earthLike ? 0.78 : 1);
  ENT.data[o + 3] = scale;
  ENT.data[o + 4] = kind;
  // Clade tint from lineage id hash when plan exists
  const rgb = KIND_RGB[kind] || [200, 200, 200];
  let v = 0.85 + rng() * 0.2;
  let cr = rgb[0], cg = rgb[1], cb = rgb[2];
  if (plan) {
    const warm = plan.pigmentBias || 0.5;
    cr = cr * (0.85 + warm * 0.3);
    cb = cb * (1.1 - warm * 0.25);
    v *= 0.9 + (plan.armour || 0) * 0.2;
    // Stable clade colour from living node id
    if (W.tree?.living?.length) {
      const id = W.tree.living[(c + n) % W.tree.living.length];
      const h = (id * 2654435761) >>> 0;
      cr = (cr * 0.55 + ((h >> 0) & 255) * 0.45);
      cg = (cg * 0.55 + ((h >> 8) & 255) * 0.45);
      cb = (cb * 0.55 + ((h >> 16) & 255) * 0.45);
    }
  }
  ENT.data[o + 5] = (cr / 255) * v;
  ENT.data[o + 6] = (cg / 255) * v;
  ENT.data[o + 7] = (cb / 255) * v;
  ENT.meta[n] = {
    cell: c, kind, age: 0,
    name: kind === 5 || kind === 7 || kind >= 14 ? nameFrom(W.seed, n) : null,
    born: W.year,
    plan,
    stride: plan?.stride || 1,
  };
}

export function respawnEntities() {
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

function stageLabel(b) {
  if (b >= 0.85) return 'city';
  if (b >= 0.55) return 'town';
  if (b >= 0.3) return 'village';
  return 'camp';
}

export function agentsTick() {
  const rng = rngOf(W, 'rngAgents');
  if ((W.lifeGrown || 0) > 80 || (W.year % 2000 < 250)) {
    respawnEntities();
  }
  if (ENT.n === 0) {
    respawnEntities();
    return;
  }

  let buildsDirty = false;
  let built = 0;

  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m) continue;
    m.age++;
    let c = m.cell;

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

    // Flocking / schools — cohesion for fauna (kinds 6,14,15,7)
    if (m.kind === 6 || m.kind === 14 || m.kind === 15 || m.kind === 7) {
      let cx = 0, cy = 0, cz = 0, nF = 0;
      for (let j = 0; j < ENT.n && nF < 8; j++) {
        if (j === i) continue;
        const o = ENT.meta[j];
        if (!o || o.kind !== m.kind) continue;
        const dcell = Math.abs(o.cell - c);
        if (dcell > 40 && dcell < NC - 40) continue;
        cx += DIR[o.cell * 3]; cy += DIR[o.cell * 3 + 1]; cz += DIR[o.cell * 3 + 2];
        nF++;
      }
      if (nF > 0) {
        cx /= nF; cy /= nF; cz /= nF;
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
      const s = m.kind === 5
        ? W.build[n] * 1.2 + W.life[n] * 0.5 - W.ice[n] + rng() * 0.08
        : W.life[n] + W.moist[n] * 0.3 - W.ice[n] * 0.5 + rng() * 0.05;
      if (s > score) { score = s; best = n; }
    }
    const moveChance = m.kind === 5 ? (W.build[c] > 0.25 ? 0.12 : 0.35) : 0.4;
    if (best !== c && rng() < moveChance) {
      m.cell = best;
      c = best;
      const nk = kindForCell(c, rng);
      const kind = nk >= 0 ? nk : m.kind;
      m.kind = kind;
      const o = i * 8;
      const buildLift = (W.build[c] || 0) * (W.rule.earthLike ? 0.0035 : 0.012);
      const rel = W.rule.earthLike ? Math.min(W.rule.relief, 0.018) : W.rule.relief;
      const rr = 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * rel + buildLift;
      ENT.data[o] = DIR[c * 3] * rr;
      ENT.data[o + 1] = DIR[c * 3 + 1] * rr;
      ENT.data[o + 2] = DIR[c * 3 + 2] * rr;
      ENT.data[o + 4] = kind;
    } else if (m.kind === 5) {
      const o = i * 8;
      const buildLift = (W.build[c] || 0) * (W.rule.earthLike ? 0.0035 : 0.012);
      const rel = W.rule.earthLike ? Math.min(W.rule.relief, 0.018) : W.rule.relief;
      const rr = 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * rel + buildLift;
      ENT.data[o] = DIR[c * 3] * rr;
      ENT.data[o + 1] = DIR[c * 3 + 1] * rr;
      ENT.data[o + 2] = DIR[c * 3 + 2] * rr;
    }

    if (m.kind === 7 && W.rule.signature === 'worms') {
      W.h[c] = Math.max(-1, W.h[c] - 0.002);
      W.sediment[NBR[c * 4]] = Math.min(1, W.sediment[NBR[c * 4]] + 0.01);
    }

    if (W.life[c] < 0.04 && m.kind < 10 && rng() < 0.12) {
      const nc = (rng() * NC) | 0;
      if (W.life[nc] > 0.25) {
        m.cell = nc;
        m.born = W.year;
        m.name = nameFrom(W.seed, i + W.year);
        const k2 = kindForCell(nc, rng);
        writeEnt(i, nc, k2 >= 0 ? k2 : m.kind, rng);
      }
    }
  }

  W.buildersActive = built;
  if (buildsDirty) W._buildsDirty = true;
  if ((W.year | 0) % 40 === 0) settleCities(W);
}

export function followTarget() {
  for (let i = 0; i < ENT.n; i++) {
    if (ENT.meta[i]?.kind === 5 && ENT.meta[i]?.name) return ENT.meta[i];
  }
  for (let i = 0; i < ENT.n; i++) {
    if (ENT.meta[i]?.name) return ENT.meta[i];
  }
  return null;
}
