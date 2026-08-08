/** Moving entities / light agents on the cube-sphere. */

import { clamp, mulberry32 } from './math.js';
import { NC, DIR, NBR, NBR8 } from './sphere.js';
import { W } from './world.js';

export const MAX_ENT = 900;
export const ENT = {
  n: 0,
  data: new Float32Array(MAX_ENT * 8), // pos3, scale, tile, tint3
  meta: new Array(MAX_ENT), // {cell, kind, age, name?}
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
    if (W.blackDaisy[c] > 0.2) return 12;
    if (W.whiteDaisy[c] > 0.2) return 13;
    return -1;
  }
  if (R.signature === 'worms' && W.h[c] < W.seaLevel) return Math.random() < 0.35 ? 7 : 8;
  if (W.h[c] < W.seaLevel) {
    if (W.reef[c] > 0.4) return 14;
    return W.lifeClass[c] >= 4 ? 15 : -1;
  }
  if (W.ice[c] > 0.45) return 6;
  if (W.life[c] > 0.62) return W.moist[c] > 0.55 ? 0 : 1;
  if (W.life[c] > 0.3) return 2;
  if (W.moist[c] < 0.24) return 3;
  if (e > 0.6) return 4;
  if (W.lifeClass[c] >= 6 && W.life[c] > 0.4) return 5; // hut / settlement stub
  if (R.airless) return Math.random() < 0.5 ? 10 : (Math.random() < 0.05 ? 11 : -1);
  if (W.life[c] > 0.2) return 9;
  return -1;
}

function writeEnt(n, c, kind) {
  const jx = (Math.random() - 0.5) * 0.012;
  const jy = (Math.random() - 0.5) * 0.012;
  const jz = (Math.random() - 0.5) * 0.012;
  let x = DIR[c * 3] + jx, y = DIR[c * 3 + 1] + jy, z = DIR[c * 3 + 2] + jz;
  const l = Math.hypot(x, y, z) || 1;
  x /= l; y /= l; z /= l;
  const rr = 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * W.rule.relief;
  const o = n * 8;
  ENT.data[o] = x * rr; ENT.data[o + 1] = y * rr; ENT.data[o + 2] = z * rr;
  const scale = (kind === 7 ? 0.055 : 0.02) * (0.72 + Math.random() * 0.62) * (W.bodyScale || 1);
  ENT.data[o + 3] = scale;
  ENT.data[o + 4] = kind;
  const v = 0.86 + Math.random() * 0.28;
  ENT.data[o + 5] = v; ENT.data[o + 6] = v; ENT.data[o + 7] = v;
  ENT.meta[n] = {
    cell: c, kind, age: 0,
    name: kind === 5 || kind === 7 || kind >= 14 ? nameFrom(W.seed, n) : null,
    born: W.year,
  };
}

export function respawnEntities() {
  let n = 0;
  const stride = Math.max(1, Math.floor(NC / (MAX_ENT * 2.2)));
  for (let c = 0; c < NC && n < MAX_ENT; c += stride) {
    const kind = kindForCell(c);
    if (kind < 0) continue;
    writeEnt(n++, c, kind);
  }
  ENT.n = n;
}

/** Agents move, breed, die; Vermis worms reshape terrain. */
export function agentsTick() {
  if (ENT.n === 0) {
    respawnEntities();
    return;
  }
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m) continue;
    m.age++;
    let c = m.cell;
    // Prefer higher life / better moisture
    let best = c, score = W.life[c] + W.moist[c] * 0.3 - W.ice[c] * 0.5;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const s = W.life[n] + W.moist[n] * 0.3 - W.ice[n] * 0.5 + Math.random() * 0.05;
      if (s > score) { score = s; best = n; }
    }
    if (best !== c && Math.random() < 0.35) {
      m.cell = best;
      c = best;
      const nk = kindForCell(c);
      const kind = nk >= 0 ? nk : m.kind;
      m.kind = kind;
      const o = i * 8;
      const rr = 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * W.rule.relief;
      ENT.data[o] = DIR[c * 3] * rr;
      ENT.data[o + 1] = DIR[c * 3 + 1] * rr;
      ENT.data[o + 2] = DIR[c * 3 + 2] * rr;
      ENT.data[o + 4] = kind;
    }

    // Vermis worms dig
    if (m.kind === 7 && W.rule.signature === 'worms') {
      W.h[c] = Math.max(-1, W.h[c] - 0.002);
      W.sediment[NBR[c * 4]] = Math.min(1, W.sediment[NBR[c * 4]] + 0.01);
    }

    // Die if uninhabitable
    if (W.life[c] < 0.05 && m.kind < 10 && Math.random() < 0.08) {
      // respawn elsewhere
      const nc = (Math.random() * NC) | 0;
      if (W.life[nc] > 0.2) {
        m.cell = nc;
        m.born = W.year;
        m.name = nameFrom(W.seed, i + W.year);
        writeEnt(i, nc, kindForCell(nc) >= 0 ? kindForCell(nc) : m.kind);
      }
    }
  }
}

export function followTarget() {
  // Return first named entity for follow-cam hook
  for (let i = 0; i < ENT.n; i++) {
    if (ENT.meta[i]?.name) return ENT.meta[i];
  }
  return null;
}
