/** Moving entities / light agents on the cube-sphere.
 *  Density tracks life so forests fill in as blooms spread.
 *  Settlers (kind 5) raise visible builds on living land — watch towns grow. */

import { mulberry32 } from './math.js';
import { NC, DIR, NBR } from './sphere.js';
import { W } from './world.js';
import { logEvent } from './chronicle.js';

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

function kindForCell(c) {
  const R = W.rule;
  const e = (W.h[c] - W.seaLevel) / (1 - W.seaLevel + 1e-6);
  if (R.daisyworld) {
    if (W.blackDaisy[c] > 0.15) return 12;
    if (W.whiteDaisy[c] > 0.15) return 13;
    return -1;
  }
  if (R.signature === 'worms' && W.h[c] < W.seaLevel) return Math.random() < 0.35 ? 7 : 8;
  if (W.h[c] < W.seaLevel) {
    if (W.reef[c] > 0.25 || W.life[c] > 0.35) return 14;
    return W.lifeClass[c] >= 4 ? 15 : -1;
  }
  if (W.ice[c] > 0.45) return 6;
  // Settlers — once eukaryotes exist; cluster on existing camps
  if (!R.airless && W.unlockedClass >= 1 && W.life[c] > 0.28 && W.ice[c] < 0.25) {
    const settleChance = 0.14 + W.build[c] * 0.55 + (W.life[c] > 0.5 ? 0.18 : 0);
    if (Math.random() < settleChance) return 5;
  }
  if (W.life[c] > 0.45) return W.moist[c] > 0.4 ? 0 : 1;
  if (W.life[c] > 0.18) return 2;
  if (W.life[c] > 0.08) return 9;
  if (W.moist[c] < 0.2 && W.life[c] < 0.05) return 3;
  if (e > 0.65) return 4;
  if (W.lifeClass[c] >= 6 && W.life[c] > 0.35) return 5;
  if (R.airless) return Math.random() < 0.5 ? 10 : (Math.random() < 0.05 ? 11 : -1);
  return -1;
}

function writeEnt(n, c, kind) {
  const jx = (Math.random() - 0.5) * 0.012;
  const jy = (Math.random() - 0.5) * 0.012;
  const jz = (Math.random() - 0.5) * 0.012;
  let x = DIR[c * 3] + jx, y = DIR[c * 3 + 1] + jy, z = DIR[c * 3 + 2] + jz;
  const l = Math.hypot(x, y, z) || 1;
  x /= l; y /= l; z /= l;
  const buildLift = (W.build[c] || 0) * 0.12;
  const rr = 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * W.rule.relief + buildLift;
  const o = n * 8;
  ENT.data[o] = x * rr; ENT.data[o + 1] = y * rr; ENT.data[o + 2] = z * rr;
  const lifeBoost = 0.85 + W.life[c] * 0.6;
  // Settlers stand taller so you can spot them working
  const scale = (kind === 7 ? 0.055 : kind === 5 ? 0.032 : 0.022)
    * (0.75 + Math.random() * 0.55) * (W.bodyScale || 1) * lifeBoost;
  ENT.data[o + 3] = scale;
  ENT.data[o + 4] = kind;
  const v = 0.9 + Math.random() * 0.25;
  ENT.data[o + 5] = v * (kind <= 2 ? 0.85 : kind === 5 ? 1.05 : 1);
  ENT.data[o + 6] = v * (kind <= 2 ? 1.15 : kind === 5 ? 0.95 : 1);
  ENT.data[o + 7] = v * (kind <= 2 ? 0.75 : kind === 5 ? 0.7 : 1);
  ENT.meta[n] = {
    cell: c, kind, age: 0,
    name: kind === 5 || kind === 7 || kind >= 14 ? nameFrom(W.seed, n) : null,
    born: W.year,
  };
}

export function respawnEntities() {
  let n = 0;
  const living = [];
  for (let c = 0; c < NC; c++) {
    if (W.life[c] > 0.08 || W.reef[c] > 0.2 || W.rule.daisyworld || W.build[c] > 0.1) living.push(c);
  }
  const pool = living.length > 200 ? living : null;
  if (pool) {
    const stride = Math.max(1, Math.floor(pool.length / (MAX_ENT * 0.9)));
    for (let i = 0; i < pool.length && n < MAX_ENT; i += stride) {
      const c = pool[i];
      const kind = kindForCell(c);
      if (kind < 0) continue;
      writeEnt(n++, c, kind);
    }
  } else {
    const stride = Math.max(1, Math.floor(NC / (MAX_ENT * 2.2)));
    for (let c = 0; c < NC && n < MAX_ENT; c += stride) {
      const kind = kindForCell(c);
      if (kind < 0) continue;
      writeEnt(n++, c, kind);
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

    // --- builders raise settlements ---
    if (m.kind === 5 && W.h[c] >= W.seaLevel && W.ice[c] < 0.35 && W.life[c] > 0.15) {
      const before = W.build[c];
      const rate = 0.022 + W.life[c] * 0.035 + (W.unlockedClass >= 5 ? 0.015 : 0);
      W.build[c] = Math.min(1, before + rate);
      if (W.build[c] - before > 0.001) {
        buildsDirty = true;
        built++;
        // Prefer to stay and keep building
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
      // Abandoned camps slowly crumble
      W.build[c] = Math.max(0, W.build[c] - 0.004);
      if (W.build[c] > 0) buildsDirty = true;
    }

    // Wander — settlers stick to camps; others chase life
    let best = c;
    let score = m.kind === 5
      ? W.build[c] * 1.2 + W.life[c] * 0.5 - W.ice[c]
      : W.life[c] + W.moist[c] * 0.3 - W.ice[c] * 0.5;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const s = m.kind === 5
        ? W.build[n] * 1.2 + W.life[n] * 0.5 - W.ice[n] + Math.random() * 0.08
        : W.life[n] + W.moist[n] * 0.3 - W.ice[n] * 0.5 + Math.random() * 0.05;
      if (s > score) { score = s; best = n; }
    }
    // Settlers move less once a camp exists
    const moveChance = m.kind === 5 ? (W.build[c] > 0.25 ? 0.12 : 0.35) : 0.4;
    if (best !== c && Math.random() < moveChance) {
      m.cell = best;
      c = best;
      const nk = kindForCell(c);
      const kind = nk >= 0 ? nk : m.kind;
      m.kind = kind;
      const o = i * 8;
      const buildLift = (W.build[c] || 0) * 0.12;
      const rr = 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * W.rule.relief + buildLift;
      ENT.data[o] = DIR[c * 3] * rr;
      ENT.data[o + 1] = DIR[c * 3 + 1] * rr;
      ENT.data[o + 2] = DIR[c * 3 + 2] * rr;
      ENT.data[o + 4] = kind;
    } else if (m.kind === 5) {
      // Keep settler sprite perched on rising build
      const o = i * 8;
      const buildLift = (W.build[c] || 0) * 0.12;
      const rr = 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * W.rule.relief + buildLift;
      ENT.data[o] = DIR[c * 3] * rr;
      ENT.data[o + 1] = DIR[c * 3 + 1] * rr;
      ENT.data[o + 2] = DIR[c * 3 + 2] * rr;
    }

    if (m.kind === 7 && W.rule.signature === 'worms') {
      W.h[c] = Math.max(-1, W.h[c] - 0.002);
      W.sediment[NBR[c * 4]] = Math.min(1, W.sediment[NBR[c * 4]] + 0.01);
    }

    if (W.life[c] < 0.04 && m.kind < 10 && Math.random() < 0.12) {
      const nc = (Math.random() * NC) | 0;
      if (W.life[nc] > 0.25) {
        m.cell = nc;
        m.born = W.year;
        m.name = nameFrom(W.seed, i + W.year);
        writeEnt(i, nc, kindForCell(nc) >= 0 ? kindForCell(nc) : m.kind);
      }
    }
  }

  W.buildersActive = built;
  if (buildsDirty) W._buildsDirty = true;
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
