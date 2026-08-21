/** Dark spectacle — per-weapon signatures and elevated 3D FX.
 *
 *  Nukes already own flash → ring → mushroom. Everything else was a white
 *  streak. This module gives each payload a silhouette that reads from orbit,
 *  and packs extra elevated geometry (mushroom caps, EMP rings, intercept
 *  bursts) for the LINE/POINT path in render.
 */

import { NC, NBR, DIR } from '../sphere.js';
import { clamp } from '../math.js';

function ensureField(W, key) {
  if (!W[key] || W[key].length !== NC) W[key] = new Float32Array(NC);
  return W[key];
}

function paintRing(field, cell, radius, peak) {
  const q = [[cell | 0, 0]];
  const seen = new Set([cell | 0]);
  while (q.length) {
    const [c, d] = q.shift();
    const fall = Math.max(0, 1 - d / (radius + 0.01));
    field[c] = Math.max(field[c], peak * fall);
    if (d >= radius) continue;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (!seen.has(n)) { seen.add(n); q.push([n, d + 1]); }
    }
  }
}

/** Spawn the visual signature for a landed payload. */
export function spawnWeaponSignature(W, cell, payload, power = 1) {
  const p = Math.max(0.25, power);
  if (payload === 'bio') {
    paintRing(ensureField(W, 'bioBloom'), cell, 2 + Math.round(p), 0.85 + p * 0.3);
    W._bioPulse = Math.min(1.6, (W._bioPulse || 0) + 0.7);
    return 'bio';
  }
  if (payload === 'chem_persist' || payload === 'chemical' || payload === 'chem_brief') {
    const r = payload === 'chem_brief' ? 1 : 2 + Math.round(p);
    paintRing(ensureField(W, 'chemPlume'), cell, r, 0.9 + p * 0.25);
    W._chemPulse = Math.min(1.6, (W._chemPulse || 0) + 0.6);
    return 'chem';
  }
  if (payload === 'emp') {
    // Cold blue wash — hemisphere-scale intent, painted as a wide ring.
    paintRing(ensureField(W, 'empHalo'), cell, 5 + Math.round(p * 3), 1.1);
    W._empPulse = Math.min(2.2, (W._empPulse || 0) + 0.9 + p * 0.4);
    // Elevated expanding ring for the 3D path.
    if (!W._empRings) W._empRings = [];
    W._empRings.push({ cell: cell | 0, age: 0, power: p, maxR: 0.18 + p * 0.08 });
    if (W._empRings.length > 6) W._empRings.shift();
    return 'emp';
  }
  if (payload === 'conventional' || payload === 'thermobaric' || payload === 'cluster' || payload === 'dirty') {
    paintRing(ensureField(W, 'strikeScorch'), cell, payload === 'cluster' ? 2 : 1, 0.7 + p * 0.3);
    return 'strike';
  }
  return 'nuclear';
}

/** Intercept burst at the meeting point — gold flash + elevated sparks. */
export function spawnInterceptBurst(W, cell, power = 0.6) {
  if (!W._ixBursts) W._ixBursts = [];
  W._ixBursts.push({ cell: cell | 0, age: 0, power: Math.max(0.3, power) });
  if (W._ixBursts.length > 16) W._ixBursts.shift();
  ensureField(W, 'ixFlash');
  W.ixFlash[cell | 0] = Math.min(1.5, (W.ixFlash[cell | 0] || 0) + 1.0);
  for (let k = 0; k < 4; k++) {
    const n = NBR[(cell | 0) * 4 + k];
    W.ixFlash[n] = Math.min(1.5, (W.ixFlash[n] || 0) + 0.55);
  }
}

/** Queue a UI moment for main.js to drain (no DOM on the tick path). */
export function queueDarkMoment(W, title, body, sub = '') {
  if (!W._darkMoments) W._darkMoments = [];
  W._darkMoments.push({ title, body, sub, t: W._tickIndex | 0 });
  if (W._darkMoments.length > 8) W._darkMoments.shift();
}

export function drainDarkMoment(W) {
  if (!W._darkMoments?.length) return null;
  return W._darkMoments.shift();
}

/** Per-tick fade for signature fields + elevated EMP rings. */
export function spectacleTick(W) {
  fadeField(W.chemPlume, 0.965);
  fadeField(W.bioBloom, 0.97);
  fadeField(W.empHalo, 0.94);
  fadeField(W.strikeScorch, 0.98);
  fadeField(W.ixFlash, 0.82);

  if (W._chemPulse > 0.01) W._chemPulse *= 0.9;
  else W._chemPulse = 0;
  if (W._bioPulse > 0.01) W._bioPulse *= 0.9;
  else W._bioPulse = 0;
  if (W._empPulse > 0.01) W._empPulse *= 0.85;
  else W._empPulse = 0;

  if (W._empRings?.length) {
    const keep = [];
    for (const r of W._empRings) {
      r.age = (r.age || 0) + 1;
      if (r.age < 28) keep.push(r);
    }
    W._empRings = keep;
  }
  if (W._ixBursts?.length) {
    const keep = [];
    for (const b of W._ixBursts) {
      b.age = (b.age || 0) + 1;
      if (b.age < 14) keep.push(b);
    }
    W._ixBursts = keep;
  }
}

function fadeField(field, keep) {
  if (!field) return;
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    if (v > 0.01) field[i] = v * keep;
    else if (v) field[i] = 0;
  }
}

export function resetSpectacle(W) {
  W.chemPlume = null;
  W.bioBloom = null;
  W.empHalo = null;
  W.strikeScorch = null;
  W.ixFlash = null;
  W._empRings = [];
  W._ixBursts = [];
  W._chemPulse = 0;
  W._bioPulse = 0;
  W._empPulse = 0;
  W._darkMoments = [];
}

/**
 * Extra elevated geometry: mushroom caps as point rings, EMP halos,
 * intercept spark bursts. Appended to flightArcPoints in render.
 */
export function spectacleArcPoints(W) {
  const segs = [];
  const pts = [];

  // Mushroom caps — elevated rings that grow with age.
  for (const m of W.mushrooms || []) {
    const c = m.cell | 0;
    if (c < 0 || c >= NC) continue;
    const age = m.age || 0;
    const pow = Math.max(0.4, m.power || 1);
    const grow = Math.min(1, age / 6);
    const fade = age < 30 ? 1 : Math.max(0, 1 - (age - 30) / 26);
    if (fade < 0.05) continue;
    const stemH = 0.02 + grow * 0.055 * pow;
    const capH = stemH + 0.025 + grow * 0.03;
    const capR = 0.012 + grow * 0.028 * Math.sqrt(pow);
    // Stem tip
    pushElev(pts, c, stemH);
    // Cap ring — sample neighbours as a crude circle in DIR-space.
    const cx = DIR[c * 3], cy = DIR[c * 3 + 1], cz = DIR[c * 3 + 2];
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const nx = DIR[n * 3], ny = DIR[n * 3 + 1], nz = DIR[n * 3 + 2];
      // Blend toward neighbour then elevate — reads as a disk from orbit.
      const bx = cx * (1 - capR * 18) + nx * (capR * 18);
      const by = cy * (1 - capR * 18) + ny * (capR * 18);
      const bz = cz * (1 - capR * 18) + nz * (capR * 18);
      const len = Math.hypot(bx, by, bz) || 1;
      const s = (1 + capH) / len;
      pts.push(bx * s, by * s, bz * s);
      // Cap rim as a short segment from stem tip to rim.
      pushElev(segs, c, stemH);
      segs.push(bx * s, by * s, bz * s);
    }
  }

  // EMP elevated rings — expand in altitude-space.
  for (const r of W._empRings || []) {
    const c = r.cell | 0;
    const t = clamp((r.age || 0) / 24, 0, 1);
    const h = 0.04 + t * (r.maxR || 0.2);
    const spread = 0.008 + t * 0.05;
    pushElev(pts, c, h);
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const cx = DIR[c * 3], cy = DIR[c * 3 + 1], cz = DIR[c * 3 + 2];
      const nx = DIR[n * 3], ny = DIR[n * 3 + 1], nz = DIR[n * 3 + 2];
      const bx = cx * (1 - spread * 12) + nx * (spread * 12);
      const by = cy * (1 - spread * 12) + ny * (spread * 12);
      const bz = cz * (1 - spread * 12) + nz * (spread * 12);
      const len = Math.hypot(bx, by, bz) || 1;
      const s = (1 + h) / len;
      segs.push(DIR[c * 3] * (1 + h * 0.6), DIR[c * 3 + 1] * (1 + h * 0.6), DIR[c * 3 + 2] * (1 + h * 0.6));
      segs.push(bx * s, by * s, bz * s);
      pts.push(bx * s, by * s, bz * s);
    }
  }

  // Intercept sparks — short elevated spikes.
  for (const b of W._ixBursts || []) {
    const c = b.cell | 0;
    const t = 1 - clamp((b.age || 0) / 12, 0, 1);
    if (t < 0.05) continue;
    const h = 0.03 + t * 0.08 * (b.power || 0.6);
    pushElev(pts, c, h);
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      pushElev(segs, c, h * 0.3);
      pushElev(segs, n, h * 0.7);
      pushElev(pts, n, h * 0.55);
    }
  }

  return {
    segments: new Float32Array(segs),
    points: new Float32Array(pts),
    segCount: segs.length / 3,
    ptCount: pts.length / 3,
  };
}

function pushElev(out, cell, alt) {
  const i = (cell | 0) * 3;
  const s = 1 + alt;
  out.push(DIR[i] * s, DIR[i + 1] * s, DIR[i + 2] * s);
}
