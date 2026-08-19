/** Prognostic wind: rotating shallow water + heating target.
 *  Currents backlog: progatm. Height relaxes toward a thermal η_eq;
 *  momentum is stepped — geostrophy emerges, the field has memory. */

import { NC, DIR, AREA, NBR } from '../sphere.js';
import { clamp } from '../math.js';
import { ensoEastness } from './ocean.js';
import { stepShallowWater, geostrophyOf, divEN, curlEN } from './swe.js';

let _etaEq = null;
let _drag = null;
let _fE = null;
let _fN = null;

function bufs() {
  if (!_etaEq || _etaEq.length !== NC) {
    _etaEq = new Float32Array(NC);
    _drag = new Float32Array(NC);
    _fE = new Float32Array(NC);
    _fN = new Float32Array(NC);
  }
}

/** Number of meridional cells from rotation (Rhines / Held–Hou sketch). */
export function circulationCellCount(rotationPeriod = 1) {
  const rot = Math.max(0.12, Math.abs(rotationPeriod || 1));
  if (rot > 2.2) return 1;
  if (rot > 1.35) return 2;
  if (rot > 0.55) return 3;
  if (rot > 0.28) return 5;
  return 7;
}

/** Step windU/windV as shallow water. `press` is the free-surface height. */
export function geostrophicWind(W) {
  if (!W.windU) return;
  if (!W.press || W.press.length !== NC) W.press = new Float32Array(NC);
  if (!W.converg || W.converg.length !== NC) W.converg = new Float32Array(NC);
  bufs();

  const rot = W.rotationPeriod || 1;
  const fScale = clamp(1 / Math.max(0.2, Math.abs(rot)), 0.15, 4);
  const nCells = circulationCellCount(rot);
  W._windCells = nCells;
  const season = W.season || 0;
  const locked = !!W.rule?.tidallyLocked;
  let heatLat = 0, heatW = 0;
  for (let i = 0; i < NC; i++) {
    const y = DIR[i * 3 + 1];
    if (Math.abs(y) > 0.55) continue;
    const w = Math.max(0, (W.temp[i] || 0) - 0.38);
    heatLat += y * w;
    heatW += w;
  }
  const thermalEq = heatW > 1e-6 ? heatLat / heatW : 0;
  const seasonal = Math.sin(season) * Math.sin(W.obliquity || 0) * 0.28;
  const itczLat = locked ? 0 : clamp(seasonal * 0.35 + thermalEq * 0.65, -0.4, 0.4);
  W._itczLat = itczLat;

  const enso = W._ensoIndex || 0;
  const walkerSST = W._walkerSST || 0;

  let tropLandT = 0, tropSeaT = 0, nLand = 0, nSea = 0;

  for (let c = 0; c < NC; c++) {
    const isLand = W.h[c] >= W.seaLevel;
    if ((W.temp[c] || 0) > 0.32) {
      if (isLand) { tropLandT += W.temp[c]; nLand++; }
      else { tropSeaT += W.temp[c]; nSea++; }
    }
  }

  const monsoonPush = (nLand && nSea)
    ? clamp((tropLandT / nLand - tropSeaT / nSea) * 2.2, -0.55, 0.55)
    : 0;
  W._monsoon = locked ? 0 : clamp(0.35 + Math.abs(monsoonPush), 0, 1);

  if (!W.front || W.front.length !== NC) W.front = new Float32Array(NC);

  const etaEq = _etaEq;
  const drag = _drag;
  const fE = _fE;
  const fN = _fN;
  fE.fill(0); fN.fill(0);

  for (let c = 0; c < NC; c++) {
    const isLand = W.h[c] >= W.seaLevel;
    const lat = DIR[c * 3 + 1];
    const landHeat = isLand ? (W.temp[c] - 0.5) * 0.12 : 0;
    let eq = (1 - W.temp[c]) * 0.55
      + Math.max(0, W.h[c] - W.seaLevel) * 0.22
      + (W.ice[c] || 0) * 0.18
      - landHeat;

    if (!locked) {
      const dItcz = Math.abs(lat - itczLat);
      eq -= Math.max(0, 0.22 - dItcz) * 0.48;
      if (Math.abs(lat) < 0.28) {
        eq -= walkerSST * ensoEastness(W, c) * 0.1;
        eq += enso * ensoEastness(W, c) * 0.06;
      }
      if (isLand && W.temp[c] > 0.36) {
        const summer = Math.sin(season) * lat;
        if (summer > 0.05) eq -= monsoonPush * 0.08;
      }
    } else if (W._sunDir) {
      const day = DIR[c * 3] * W._sunDir[0] + DIR[c * 3 + 1] * W._sunDir[1]
        + DIR[c * 3 + 2] * W._sunDir[2];
      eq -= day * 0.12;
    }

    etaEq[c] = clamp(eq, 0, 1.4);
    const elev = Math.max(0, W.h[c] - W.seaLevel);
    drag[c] = 0.045 + (isLand ? 0.09 : 0) + elev * 0.28 + ((W.ice[c] || 0) > 0.55 ? 0.06 : 0);

    if ((W.ice[c] || 0) > 0.55 && elev > 0.05) {
      fN[c] = -Math.sign(lat || 1) * 0.12;
    }
    if (elev > 0.04) {
      fN[c] += -Math.sign(lat || 1) * elev * 0.08;
    }
  }

  if (!W._sweBoot) {
    for (let c = 0; c < NC; c++) {
      W.press[c] = etaEq[c];
      const [u0, v0] = geostrophyOf(etaEq, c, fScale);
      W.windU[c] = clamp(u0, -1.85, 1.85);
      W.windV[c] = clamp(v0, -1.85, 1.85);
    }
    W._sweBoot = true;
  }

  const steps = 2;
  for (let s = 0; s < steps; s++) {
    stepShallowWater({
      eta: W.press, u: W.windU, v: W.windV,
      fScale, g: 2.35, H: 0.4, dt: 0.2,
      drag, forceE: fE, forceN: fN,
      etaEq, relax: 0.15, umax: 1.85, damp: 0.07, advect: 0.55,
    });
  }

  let spdSum = 0, fAbs = 0, tropT = 0, tropA = 0, poleT = 0, poleA = 0, flux = 0;
  let jetU = 0, jetLat = 0, jetN = 0;

  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const f = lat * fScale;
    let tJump = 0;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      tJump = Math.max(tJump, Math.abs((W.temp[nb] || 0) - (W.temp[c] || 0)));
    }
    W.front[c] = clamp(tJump * 14, 0, 1);
    const spd = Math.hypot(W.windU[c], W.windV[c]);
    spdSum += spd;
    fAbs += Math.abs(f);
    const a = AREA[c];
    if (Math.abs(lat) < 0.32) { tropT += W.temp[c] * a; tropA += a; }
    if (Math.abs(lat) > 0.72) { poleT += W.temp[c] * a; poleA += a; }
    if (Math.abs(lat) > 0.28 && Math.abs(lat) < 0.42) {
      flux += W.windV[c] * W.temp[c] * a * Math.sign(lat || 1);
    }
    const abs = Math.abs(lat - itczLat);
    if (!locked && abs > 0.28 && abs < 0.72) {
      jetU += Math.abs(W.windU[c]);
      jetLat += lat * Math.abs(W.windU[c]);
      jetN += Math.abs(W.windU[c]);
    }
  }

  if (!W.vort || W.vort.length !== NC) W.vort = new Float32Array(NC);

  for (let c = 0; c < NC; c++) {
    W.converg[c] = clamp(-divEN(W.windU, W.windV, c) * 0.18, -1, 1);
    W.vort[c] = clamp(curlEN(W.windU, W.windV, c) * 6, -1, 1);
  }

  const U = spdSum / NC;
  const fMean = fAbs / NC;
  W._rossby = U / Math.max(0.08, fMean);
  W._rossbyNote = W._rossby < 0.35
    ? 'Ro low — rotation-dominated, bands expected'
    : W._rossby > 1.1
      ? 'Ro high — slow rotator, no zonal bands expected'
      : 'Ro transitional';
  W._tropPole = tropA && poleA ? tropT / tropA - poleT / poleA : 0;
  W._heatPole = flux;
  void jetU;

  W._jetLat = jetN > 1e-6 ? jetLat / jetN : 0.5 * Math.sign(itczLat || 1);
  W._windRegime = locked ? 'substellar'
    : nCells <= 1 ? 'single-cell'
    : nCells <= 2 ? 'wide Hadley'
    : nCells <= 3 ? 'three-cell'
    : nCells <= 5 ? 'multi-band'
    : 'Jovian bands';
}

/** Band name at a latitude for instruments. */
export function windBandAt(lat, itczLat = 0, nCells = 3) {
  const a = Math.abs(lat - itczLat);
  if (a < 0.08) return 'ITCZ / doldrums';
  if (a < 0.35) return 'trades';
  if (a < 0.42) return 'horse latitudes';
  if (a < 0.72) return 'westerlies';
  return 'polar easterlies';
}
