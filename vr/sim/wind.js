/** Prognostic wind: diagnosed geostrophy + memory + Walker + monsoon.
 *  Currents backlog: progatm, walker, jet, monsoon. */

import { NC, DIR, AREA } from '../sphere.js';
import { clamp } from '../math.js';
import { gradEN, divUV, neighbourEN } from './vecop.js';
import { ensoEastness } from './ocean.js';

/** Number of meridional cells from rotation (Rhines / Held–Hou sketch). */
export function circulationCellCount(rotationPeriod = 1) {
  const rot = Math.max(0.12, Math.abs(rotationPeriod || 1));
  if (rot > 2.2) return 1;
  if (rot > 1.35) return 2;
  if (rot > 0.55) return 3;
  if (rot > 0.28) return 5;
  return 7;
}

/** Overwrite windU/windV from pressure + Coriolis, then blend with last tick. */
export function geostrophicWind(W) {
  if (!W.windU) return;
  if (!W.press || W.press.length !== NC) W.press = new Float32Array(NC);
  if (!W.converg || W.converg.length !== NC) W.converg = new Float32Array(NC);

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
  const walkerSST = W._walkerSST || 0; // west minus east tropical SST

  let tropLandT = 0, tropSeaT = 0, nLand = 0, nSea = 0;
  let jetU = 0, jetLat = 0.45, jetN = 0;

  for (let c = 0; c < NC; c++) {
    const isLand = W.h[c] >= W.seaLevel;
    const landHeat = isLand ? (W.temp[c] - 0.5) * 0.12 : 0;
    const diag = (1 - W.temp[c]) * 0.55
      + Math.max(0, W.h[c] - W.seaLevel) * 0.22
      + (W.ice[c] || 0) * 0.18
      - landHeat;
    const prevC = W.converg[c] || 0;
    W.press[c] = clamp((W.press[c] || diag) * 0.7 + diag * 0.3 - prevC * 0.05, 0, 1.4);

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

  let spdSum = 0, fAbs = 0, tropT = 0, tropA = 0, poleT = 0, poleA = 0, flux = 0;

  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const f = lat * fScale;
    const [dpe, dpn] = gradEN(W.press, c);
    const [dte, dtn] = gradEN(W.temp, c);
    let tJump = 0;
    for (let k = 0; k < 4; k++) {
      const nb = neighbourEN(c, k).nb;
      tJump = Math.max(tJump, Math.abs((W.temp[nb] || 0) - (W.temp[c] || 0)));
    }

    const cor = 0.35 + Math.abs(f);
    let u = -dpn * cor;
    let v = dpe * cor;

    // Thermal-wind meander: the jet follows the temperature gradient, not a parallel.
    v += dte * 0.42;
    u += -dtn * 0.18;

    const elev = Math.max(0, W.h[c] - W.seaLevel);
    if (elev > 0.04) {
      u *= 1 / (1 + elev * 1.8);
      v += -Math.sign(lat || 1) * elev * Math.abs(u) * 0.55;
    }

    const abs = Math.abs(lat - itczLat);

    if (!locked) {
      const toItcz = itczLat - lat;
      v += clamp(toItcz * 0.55, -0.45, 0.45) * (0.5 + 0.5 * (1 - Math.abs(lat)));
      if (Math.abs(lat) < 0.28) {
        u += -walkerSST * 0.45;
        u += enso * 0.32;
        v += walkerSST * ensoEastness(W, c) * 0.12;
      }
      if (W.h[c] >= W.seaLevel && W.temp[c] > 0.36) {
        const summer = Math.sin(season) * lat;
        if (summer > 0.05) {
          v += -Math.sign(lat || 1) * monsoonPush * 0.35;
          u += monsoonPush * 0.12;
        }
      }
      if (abs > 0.28 && abs < 0.72) u += enso * 0.1;
    }

    if (W.h[c] > W.seaLevel + 0.08) {
      u *= 0.72; v *= 0.72;
    }
    if ((W.ice[c] || 0) > 0.55 && W.h[c] > W.seaLevel + 0.05) {
      v += -Math.sign(lat || 1) * 0.15;
    }

    if (locked && W._sunDir) {
      const day = DIR[c * 3] * W._sunDir[0] + DIR[c * 3 + 1] * W._sunDir[1]
        + DIR[c * 3 + 2] * W._sunDir[2];
      u += -day * 0.28;
      v += -day * lat * 0.12;
    }

    u = (W.windU[c] || 0) * 0.76 + u * 0.24;
    v = (W.windV[c] || 0) * 0.76 + v * 0.24;
    W.windU[c] = clamp(u, -1.6, 1.6);
    W.windV[c] = clamp(v, -1.6, 1.6);

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

    if (!locked && abs > 0.28 && abs < 0.72) {
      jetU += Math.abs(W.windU[c]);
      jetLat += lat * Math.abs(W.windU[c]);
      jetN += Math.abs(W.windU[c]);
    }
  }

  for (let c = 0; c < NC; c++) {
    W.converg[c] = clamp(-divUV(W.windU, W.windV, c) * 0.15, -1, 1);
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
