/** Stamp fixtures — the old hand-written heightfields kept as validation cases.
 *
 *  Production uses stampApply.js + stamps.json. These functions exist so a
 *  regression can assert data ≈ fixture without deleting the knowledge. */

import { clamp, lerp, fbm, ridged, mulberry32 } from '../math.js';
import { NC, DIR } from '../sphere.js';
import { stampCraters, dryWorld } from './stampApply.js';

function randomUnit(rng) {
  const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
  return [r * Math.cos(th), u, r * Math.sin(th)];
}
function norm3(x, y, z) {
  const L = Math.hypot(x, y, z) || 1;
  return [x / L, y / L, z / L];
}
function dotDir(c, p) {
  return DIR[c * 3] * p[0] + DIR[c * 3 + 1] * p[1] + DIR[c * 3 + 2] * p[2];
}
function bowl(d, rim, floor) {
  if (d < floor) return 1;
  if (d > rim) return 0;
  const t = (d - floor) / Math.max(1e-6, rim - floor);
  return (1 - t) * (1 - t);
}
function ring(d, inner, outer) {
  if (d < inner || d > outer) return 0;
  const mid = (inner + outer) * 0.5;
  const w = (outer - inner) * 0.5;
  return 1 - Math.abs(d - mid) / Math.max(1e-6, w);
}
function addVent(W, cell, opts = {}) {
  if (!W.volcanoes) W.volcanoes = [];
  W.volcanoes.push({
    cell, magma: opts.magma ?? 0.9, next: opts.next ?? 8,
    silica: opts.silica ?? 0.48, hotspot: !!opts.hotspot,
  });
}

export function fixtureMars(W, seed) {
  const h = W.h, crust = W.crust, age = W.age, rock = W.rock;
  const dich = norm3(0.10, 0.985, 0.14);
  const tharsis = norm3(0.18, 0.06, 0.982);
  const olympus = norm3(0.42, 0.12, 0.90);
  const hellas = norm3(-0.38, -0.78, 0.50);
  const vallesB = norm3(-0.55, 0.02, 0.83);
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const north = dotDir(c, dich);
    const high = clamp((-north + 0.08) * 0.55, -0.22, 0.28);
    let elev = 0.06 + high;
    crust[c] = north > 0.04 ? 0.32 + (1 - north) * 0.12 : 0.62 + (-north) * 0.18;
    age[c] = north > 0.04 ? 800 + (1 - north) * 400 : 2200 + (-north) * 900;
    rock[c] = 0;
    const tb = bowl(dotDir(c, tharsis), 0.55, 0.97);
    elev += tb * 0.22;
    crust[c] = Math.max(crust[c], 0.55 + tb * 0.55);
    elev += bowl(dotDir(c, olympus), 0.965, 0.994) * 0.48;
    const he = bowl(dotDir(c, hellas), 0.82, 0.955);
    elev -= he * 0.38;
    if (he > 0.15) { crust[c] *= 0.55; age[c] = Math.min(age[c], 900); }
    const along = dotDir(c, tharsis) * 0.45 + dotDir(c, vallesB) * 0.55;
    const off = Math.hypot(y * vallesB[2] - z * vallesB[1], z * vallesB[0] - x * vallesB[2], x * vallesB[1] - y * vallesB[0]);
    if (along > 0.15 && along < 0.82 && off < 0.055 && Math.abs(y) < 0.22) {
      elev -= (0.055 - off) / 0.055 * 0.16;
    }
    const polar = y * y;
    if (polar > 0.78) elev += (polar - 0.78) * 0.12;
    elev += (fbm(x * 2.4, y * 2.4, z * 2.4, seed ^ 0x4d617273, 3, 2, 0.5) - 0.5) * 0.05;
    h[c] = clamp(elev, -1.2, 1.2);
  }
  stampCraters(h, seed, { nLarge: 5, nMid: 22, depth: 0.16, micro: 0.35 });
  dryWorld(W, -0.72);
  let best = 0, bd = -2;
  for (let c = 0; c < NC; c++) {
    const d = dotDir(c, olympus);
    if (d > bd) { bd = d; best = c; }
  }
  addVent(W, best, { magma: 1.8, next: 2, hotspot: true, silica: 0.47 });
  W.hotspots = [{ pos: olympus, strength: 0.55, fixed: true }];
}

export function fixtureMercury(W, seed) {
  const h = W.h, crust = W.crust, age = W.age, rock = W.rock;
  const caloris = norm3(0.55, 0.15, 0.82);
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    let elev = 0.06 + (fbm(x * 1.8, y * 1.8, z * 1.8, seed, 3, 2, 0.5) - 0.5) * 0.04;
    crust[c] = 0.36; age[c] = 4000; rock[c] = 0;
    elev -= bowl(dotDir(c, caloris), 0.80, 0.95) * 0.26;
    const anti = bowl(-dotDir(c, caloris), 0.88, 0.97);
    if (anti > 0) elev += (ridged(x * 9, y * 9, z * 9, seed ^ 0x616e7469, 3) - 0.4) * anti * 0.08;
    const sc = Math.sin(x * 7.5 + z * 4.2) * Math.cos(y * 5.5);
    if (sc > 0.62) elev += (sc - 0.62) * 0.07;
    h[c] = clamp(elev, -1.2, 1.2);
  }
  stampCraters(h, seed, { nLarge: 6, nMid: 32, depth: 0.24, micro: 0.55 });
  dryWorld(W, -0.9);
}

export function fixtureMoon(W, seed) {
  const h = W.h, crust = W.crust, age = W.age, rock = W.rock;
  const spa = norm3(-0.82, -0.35, 0.45);
  const maria = [
    norm3(0.92, 0.22, 0.32), norm3(0.88, -0.18, 0.44),
    norm3(0.78, 0.48, -0.40), norm3(0.70, -0.42, -0.58),
  ];
  for (let c = 0; c < NC; c++) {
    const nearside = clamp(DIR[c * 3], -1, 1);
    let elev = 0.08 + (-nearside) * 0.07;
    crust[c] = 0.42 + (-nearside) * 0.22;
    age[c] = 3900 + (-nearside) * 400;
    rock[c] = 2;
    const he = bowl(dotDir(c, spa), 0.78, 0.94);
    elev -= he * 0.22;
    if (he > 0.2) crust[c] *= 0.7;
    for (const m of maria) {
      const k = bowl(dotDir(c, m), 0.88, 0.97);
      if (k > 0.12 && nearside > -0.15) {
        elev = lerp(elev, 0.02, k);
        rock[c] = 0;
        age[c] = Math.min(age[c], 3200);
        crust[c] = Math.min(crust[c], 0.38);
      }
    }
    h[c] = clamp(elev, -1.2, 1.2);
  }
  stampCraters(h, seed, { nLarge: 8, nMid: 40, depth: 0.28, micro: 0.7 });
  dryWorld(W, -0.9);
}

export const FIXTURES = Object.freeze({
  mars: fixtureMars,
  mercury: fixtureMercury,
  moon: fixtureMoon,
});
