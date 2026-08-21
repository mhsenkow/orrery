/** Live geology that the stamps implied but the tick never did.
 *  Io resurfaces and builds burial mountains; Venus traps heat then overturns;
 *  Mars abrades by wind; ridges and ice vents feed hydrothermal chemistry. */

import { clamp } from '../math.js';
import { NC, NBR, AREA } from '../sphere.js';
import { isGasKind } from './planetKind.js';

const DIV = 0;

export function planetGeoTick(W, log) {
  if (W._canvasMode) return;
  const kind = W._planetKind;
  if (!kind || kind === 'earth' || kind === 'daisy' || isGasKind(kind)) {
    hydrothermalTick(W);
    return;
  }
  if (kind === 'io') ioBurialTick(W, log);
  else if (kind === 'venus') venusOverturnTick(W, log);
  else if (kind === 'mars') marsWindTick(W);
  else if (kind === 'pluto' && W._iceShell) plutoConvectionTick(W);
  hydrothermalTick(W);
}

/** Lava piles into a thin lid; the lid fails in compression → mountains.
 *  Paterae stay young; craters never accumulate. */
function ioBurialTick(W, log) {
  const h = W.h, age = W.age, lava = W.lava, crust = W.crust;
  if (!lava) return;
  W._ioBurial = (W._ioBurial || 0) + 0.035 * Math.max(0.4, W.interior?.heatFlow || 1);
  let resurfaced = 0;
  for (let c = 0; c < NC; c++) {
    const bury = (lava[c] || 0) * 0.08;
    if (bury > 0.002) {
      h[c] = clamp(h[c] + bury * 0.15, -1.2, 1.2);
      crust[c] = Math.min(1.4, crust[c] + bury * 0.2);
      age[c] = Math.max(0.2, age[c] * 0.4);
      resurfaced++;
    } else {
      age[c] = Math.min(20, age[c] + 0.02);
    }
  }
  if (W._ioBurial > 1.15) {
    W._ioBurial = 0;
    let best = 0, score = -1;
    for (let c = 0; c < NC; c++) {
      const s = crust[c] * (0.6 + lava[c]) - Math.abs(h[c]);
      if (s > score && h[c] > -0.05) { score = s; best = c; }
    }
    raiseBurialMountain(W, best, 0.14);
    if (log) log(W.year, 'orogeny', best, 1, 'Burial mountain');
  }
  W._ioResurface = resurfaced;
}

function raiseBurialMountain(W, cell, amp) {
  const seen = new Set([cell]);
  let ring = [cell];
  for (let d = 0; d <= 3; d++) {
    const next = [];
    const k = 1 - d / 4;
    for (const c of ring) {
      W.h[c] = clamp(W.h[c] + amp * k * k, -1.2, 1.2);
      W.crust[c] = Math.min(1.6, W.crust[c] + amp * 0.4 * k);
      W.rock[c] = 2;
      for (let i = 0; i < 4; i++) {
        const n = NBR[c * 4 + i];
        if (!seen.has(n)) { seen.add(n); next.push(n); }
      }
    }
    ring = next;
  }
}

/** Heat trapped under an episodic lid, then a foundering resurfacing. */
function venusOverturnTick(W, log) {
  const heat = W.interior?.heatFlow || 1;
  W._lidHeat = (W._lidHeat || 0.35) + 0.012 * heat;
  if (W._lidHeat < 1) return;
  W._lidHeat = 0.08;
  const h = W.h, age = W.age, rock = W.rock, crust = W.crust;
  let n = 0;
  for (let c = 0; c < NC; c++) {
    if (rock[c] === 2) continue; // tesserae survive
    h[c] = clamp(h[c] * 0.35 + 0.10, -0.4, 0.45);
    crust[c] = clamp(crust[c] * 0.7 + 0.12, 0.28, 0.7);
    age[c] = 8 + (c % 40);
    rock[c] = 0;
    n++;
  }
  W._venusOverturns = (W._venusOverturns || 0) + 1;
  if (log) log(W.year, 'overturn', 0, n / NC, 'Global resurfacing');
}

/** Wind abrasion + hillslope creep. Dichotomy is thick enough to survive. */
function marsWindTick(W) {
  const h = W.h, _h = W._h, dust = W.dust;
  if (!_h) return;
  const windU = W.windU, windV = W.windV;
  for (let c = 0; c < NC; c++) {
    let s = h[c], n = 1;
    for (let k = 0; k < 4; k++) {
      s += h[NBR[c * 4 + k]];
      n++;
    }
    const creep = (s / n - h[c]) * 0.012;
    const wu = windU?.[c] || 0, wv = windV?.[c] || 0;
    const spd = Math.sqrt(wu * wu + wv * wv);
    /* Saltation has a threshold — sand does not move until the wind can lift it —
       but a hard `spd > 0.35` on a continuous field is a cliff, and a cell sitting
       within a rounding error of it flips between eroding and not. That matters
       more than it sounds: this writes to terrain, so the discontinuity got
       amplified into permanent topography and the same seed stopped producing the
       same planet. A ramp over the threshold keeps the physics — nothing moves in
       a light breeze — without the cliff. Damp ground still pins the grains. */
    const lift = clamp((spd - 0.3) / 0.12, 0, 1);
    const dryness = clamp((0.2 - (W.moist[c] || 0)) / 0.08, 0, 1);
    const abrade = lift * dryness * spd * 0.004;
    _h[c] = clamp(h[c] + creep - abrade, -1.2, 1.2);
    if (dust && abrade > 0.001) dust[c] = Math.min(1, (dust[c] || 0) + abrade * 8);
  }
  h.set(_h);
}

/** Cellular nitrogen ice — Sputnik stays young and level. */
function plutoConvectionTick(W) {
  const h = W.h;
  for (let c = 0; c < NC; c++) {
    if (h[c] > 0.1) continue;
    let s = 0;
    for (let k = 0; k < 4; k++) s += h[NBR[c * 4 + k]];
    h[c] = clamp(h[c] * 0.92 + s * 0.02, -0.2, 0.18);
    if (W.age) W.age[c] = Math.min(W.age[c], 12);
  }
}

/** Ridges, ice vents and Io paterae feed H₂S / H₂ for redox. */
export function hydrothermalTick(W) {
  if (W.rule?.daisyworld) return;
  if (!W.hydrotherm || W.hydrotherm.length !== NC) W.hydrotherm = new Float32Array(NC);
  const ht = W.hydrotherm;
  const sea = W.seaLevel;
  const kind = W._planetKind;
  let mean = 0;
  for (let c = 0; c < NC; c++) {
    const ridge = W.bound?.[c] === DIV && W.h[c] < sea;
    const iceV = (W.shellVent?.[c] || 0) > 0.25;
    const patera = kind === 'io' && W.h[c] < 0.02 && (W.lava?.[c] || 0) > 0.08;
    const want = ridge || iceV || patera ? 0.72 : 0;
    ht[c] = ht[c] * 0.92 + want * 0.08;
    mean += ht[c] * (AREA[c] || 1);
    if (ht[c] > 0.2 && W.species) {
      if (W.species.H2S) W.species.H2S[c] = Math.min(1, (W.species.H2S[c] || 0) + ht[c] * 0.04);
      if (W.species.H2) W.species.H2[c] = Math.min(1, (W.species.H2[c] || 0) + ht[c] * 0.03);
      if (W.temp) W.temp[c] = Math.max(W.temp[c], 0.42 + ht[c] * 0.2);
      if (W.nutrientP) {
        W.nutrientP[c] = Math.min(1, (W.nutrientP[c] || 0) + ht[c] * 0.02);
        W.nutrientN[c] = Math.min(1, (W.nutrientN[c] || 0) + ht[c] * 0.015);
      }
    }
  }
  W._hydroMean = mean / 12.566;
}

/** Spread an eruption into a shield, cone or caldera instead of one cell. */
export function paintEdifice(W, cell, power, visc, caldera) {
  const h = W.h;
  const reach = caldera ? 2 : Math.min(5, Math.max(1, Math.round(3.4 / Math.max(0.35, visc))));
  const amp = caldera ? -power * 0.055 : power * 0.032 / Math.max(0.45, visc);
  const seen = new Set([cell]);
  let ring = [cell];
  for (let d = 0; d <= reach; d++) {
    const next = [];
    const k = 1 - d / (reach + 1);
    for (const c of ring) {
      h[c] = clamp(h[c] + amp * k * k, -1.2, 1.2);
      if (W.lava && amp > 0) W.lava[c] = Math.min(1, (W.lava[c] || 0) + power * 0.22 * k);
      if (W.ash && amp < 0) W.ash[c] = Math.min(1, (W.ash[c] || 0) + power * 0.35 * k);
      for (let i = 0; i < 4; i++) {
        const n = NBR[c * 4 + i];
        if (!seen.has(n)) { seen.add(n); next.push(n); }
      }
    }
    ring = next;
  }
}
