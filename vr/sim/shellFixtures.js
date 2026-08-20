/** Ice-shell fixtures — the old hand-written paint* kept as validation cases.
 *
 *  Production uses shellApply.js + iceshell.json. These exist so a regression
 *  can assert data ≈ fixture without deleting the knowledge. */

import { clamp, fbm, ridged } from '../math.js';
import { NC, DIR } from '../sphere.js';

export function fixtureEuropa(W, tidal, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const pole = y * y;
    const cycloid = Math.sin(x * 14 + z * 9 + Math.sin(y * 11) * 1.8);
    const linea = cycloid > 0.72 ? (cycloid - 0.72) : 0;
    const chaos = Math.max(0, Math.sin(x * 8 + z * 6) * (1 - pole) - 0.35) * 0.55;
    W.shellLid[c] = clamp(0.52 + pole * 0.22 - chaos * 0.35 - linea * 0.12, 0.22, 0.92);
    W.shellOcean[c] = clamp(0.78 - pole * 0.18 + chaos * 0.25, 0.35, 0.95);
    W.shellMantle[c] = clamp(tidal * (0.6 + (1 - pole) * 0.7 + chaos * 0.4), 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = 0.14 + (linea > 0 ? linea * 0.03 : 0) - chaos * 0.035
      + (fbm(x * 3, y * 3, z * 3, seed, 2, 2, 0.5) - 0.5) * 0.01;
  }
}

export function fixtureEnceladus(W, tidal) {
  for (let c = 0; c < NC; c++) {
    const y = DIR[c * 3 + 1];
    const south = y < -0.62;
    const stripe = south && (c % 47 === 0 || c % 53 === 1 || c % 41 === 3);
    W.shellLid[c] = clamp(south ? 0.32 : 0.72, 0.18, 0.94);
    W.shellOcean[c] = clamp(south ? 0.88 : 0.55, 0.3, 0.95);
    W.shellMantle[c] = clamp(tidal * (south ? 1.15 : 0.35), 0, 1);
    W.shellVent[c] = stripe ? 0.85 : 0;
    W.h[c] = south ? 0.08 + (stripe ? 0.02 : 0) : 0.15;
  }
}

export function fixtureTitan(W, tidal, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const pole = y * y;
    const dunes = Math.abs(y) < 0.35 ? Math.sin(x * 22 + z * 3) * 0.025 : 0;
    const xanadu = Math.max(0, x * 0.4 + z * 0.85 - 0.55);
    const lake = pole > 0.72 ? (pole - 0.72) * 0.55 : 0;
    W.shellLid[c] = clamp(0.6 - lake * 0.4 + xanadu * 0.15, 0.22, 0.9);
    W.shellOcean[c] = 0.4;
    W.shellMantle[c] = clamp(tidal * 0.45, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = 0.12 + dunes + xanadu * 0.08 - lake * 0.07
      + (fbm(x * 2, y * 2, z * 2, seed, 3, 2, 0.5) - 0.5) * 0.03;
    if (W.moist) W.moist[c] = lake > 0 ? 0.9 : (Math.abs(y) < 0.35 ? 0.08 : 0.25);
  }
}

export function fixturePluto(W, tidal, seed) {
  const p = [0.15, 0.08, 0.985];
  const sl = Math.hypot(p[0], p[1], p[2]) || 1;
  p[0] /= sl; p[1] /= sl; p[2] /= sl;
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const d = x * p[0] + y * p[1] + z * p[2];
    const basin = d > 0.72 ? (d - 0.72) / 0.28 : 0;
    const cells = basin > 0.15 ? Math.sin(x * 28) * Math.sin(z * 26) * 0.012 : 0;
    const mtn = basin < 0.08 && d > 0.55 ? ridged(x * 4, y * 4, z * 4, seed, 3) * 0.09 : 0;
    W.shellLid[c] = clamp(0.7 - basin * 0.25, 0.3, 0.92);
    W.shellOcean[c] = clamp(0.5 + basin * 0.3, 0.3, 0.9);
    W.shellMantle[c] = clamp(tidal * 0.35 + basin * 0.2, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = 0.13 - basin * 0.08 + cells + mtn;
  }
}

export function fixtureTriton(W, tidal, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const cant = ridged(x * 3.4, y * 3.4, z * 3.4, seed ^ 0x63616e74, 3);
    const south = y < -0.7;
    W.shellLid[c] = clamp(0.58 - cant * 0.12, 0.28, 0.9);
    W.shellOcean[c] = 0.55;
    W.shellMantle[c] = clamp(tidal * (south ? 0.9 : 0.4), 0, 1);
    W.shellVent[c] = south && (c % 61 === 0) ? 0.7 : 0;
    W.h[c] = 0.13 - (cant - 0.45) * 0.05 + (south ? -0.02 : 0);
  }
}

export function fixtureGanymede(W, tidal, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const dark = fbm(x * 1.2, y * 1.2, z * 1.2, seed, 3, 2, 0.5) < 0.46;
    const groove = !dark ? Math.abs(Math.sin(x * 16 + z * 12)) * 0.02 : 0;
    W.shellLid[c] = dark ? 0.7 : 0.5;
    W.shellOcean[c] = 0.6;
    W.shellMantle[c] = clamp(tidal * 0.5, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = (dark ? 0.15 : 0.12) + groove;
    if (W.age) W.age[c] = dark ? 4000 : 1200;
  }
}

export function fixtureCallisto(W, tidal, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const cr = ridged(x * 3.6, y * 3.6, z * 3.6, seed, 3);
    W.shellLid[c] = 0.8;
    W.shellOcean[c] = 0.35;
    W.shellMantle[c] = clamp(tidal * 0.2, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = 0.14 - (cr > 0.72 ? (cr - 0.72) * 0.55 : 0);
    if (W.age) W.age[c] = 4500;
  }
}

export function fixtureMiranda(W, tidal, seed) {
  const coronae = [
    [0.88, 0.22, 0.42],
    [-0.62, 0.58, 0.53],
    [0.12, -0.86, 0.49],
    [-0.18, 0.28, -0.94],
  ];
  for (const p of coronae) {
    const L = Math.hypot(p[0], p[1], p[2]) || 1;
    p[0] /= L; p[1] /= L; p[2] /= L;
  }
  const cliff = [0.22, 0.12, 0.97];
  const cL = Math.hypot(cliff[0], cliff[1], cliff[2]) || 1;
  cliff[0] /= cL; cliff[1] /= cL; cliff[2] /= cL;
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    let elev = 0.11 + (fbm(x * 2, y * 2, z * 2, seed, 2, 2, 0.5) - 0.5) * 0.02;
    let patch = 0;
    for (const p of coronae) {
      const d = x * p[0] + y * p[1] + z * p[2];
      if (d > 0.78) patch = Math.max(patch, (d - 0.78) / 0.22);
    }
    elev += patch * 0.08;
    const face = x * cliff[0] + y * cliff[1] + z * cliff[2];
    if (face > -0.08 && face < 0.08) elev -= 0.12 * (1 - Math.abs(face) / 0.08);
    W.shellLid[c] = clamp(0.55 - patch * 0.1, 0.28, 0.88);
    W.shellOcean[c] = 0.5;
    W.shellMantle[c] = clamp(tidal * 0.35, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = elev;
  }
}

export function fixtureMimas(W, tidal, seed) {
  const herschel = [0.82, 0.22, 0.53];
  const L = Math.hypot(herschel[0], herschel[1], herschel[2]) || 1;
  herschel[0] /= L; herschel[1] /= L; herschel[2] /= L;
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const d = x * herschel[0] + y * herschel[1] + z * herschel[2];
    const pit = d > 0.72 ? (d - 0.72) / 0.28 : 0;
    const cr = ridged(x * 4, y * 4, z * 4, seed, 3);
    W.shellLid[c] = 0.7;
    W.shellOcean[c] = 0.45;
    W.shellMantle[c] = clamp(tidal * 0.25, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = 0.12 - pit * 0.22 - (cr > 0.78 ? (cr - 0.78) * 0.4 : 0);
  }
}

export function fixtureRhea(W, tidal, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const cr = ridged(x * 3.2, y * 3.2, z * 3.2, seed, 3);
    const chasma = Math.abs(y) < 0.12 && Math.abs(Math.sin(x * 8 + z * 8)) > 0.35;
    W.shellLid[c] = 0.72;
    W.shellOcean[c] = 0.4;
    W.shellMantle[c] = clamp(tidal * 0.22, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = 0.13 - (cr > 0.74 ? (cr - 0.74) * 0.45 : 0) - (chasma ? 0.08 : 0);
  }
}

export function fixtureUranian(W, tidal, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const cr = ridged(x * 3, y * 3, z * 3, seed, 3);
    const grab = Math.abs(Math.sin(x * 11 + z * 7)) > 0.82;
    W.shellLid[c] = 0.68;
    W.shellOcean[c] = 0.42;
    W.shellMantle[c] = clamp(tidal * 0.2, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = 0.12 - (cr > 0.75 ? (cr - 0.75) * 0.4 : 0) - (grab ? 0.06 : 0);
    if (W.age) W.age[c] = grab ? 1200 : 4000;
  }
}

export const FIXTURES = {
  europa: fixtureEuropa,
  enceladus: fixtureEnceladus,
  titan: fixtureTitan,
  pluto: fixturePluto,
  triton: fixtureTriton,
  ganymede: fixtureGanymede,
  callisto: fixtureCallisto,
  miranda: fixtureMiranda,
  mimas: fixtureMimas,
  rhea: fixtureRhea,
  uranian: fixtureUranian,
};
