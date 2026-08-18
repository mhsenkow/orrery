/** Prognostic wind: diagnosed geostrophy + memory + Walker + monsoon.
 *  Currents backlog: progatm, walker, jet, monsoon. */

import { NC, DIR } from '../sphere.js';
import { clamp } from '../math.js';
import { gradEN, divUV } from './vecop.js';

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
  const itczLat = Math.sin(season) * Math.sin(W.obliquity || 0) * 0.28;
  W._itczLat = itczLat;

  const enso = W._ensoIndex || 0;
  const walkerSST = W._walkerSST || 0; // west minus east tropical SST

  let tropLandT = 0, tropSeaT = 0, nLand = 0, nSea = 0;
  let jetU = 0, jetLat = 0.45, jetN = 0;

  for (let c = 0; c < NC; c++) {
    const isLand = W.h[c] >= W.seaLevel;
    const lat = DIR[c * 3 + 1];
    const landHeat = isLand ? (W.temp[c] - 0.5) * 0.12 : 0;
    const diag = (1 - W.temp[c]) * 0.55
      + Math.max(0, W.h[c] - W.seaLevel) * 0.22
      + (W.ice[c] || 0) * 0.18
      - landHeat;
    const prevC = W.converg[c] || 0;
    W.press[c] = clamp((W.press[c] || diag) * 0.7 + diag * 0.3 - prevC * 0.05, 0, 1.4);

    if (Math.abs(lat) < 0.35) {
      if (isLand) { tropLandT += W.temp[c]; nLand++; }
      else { tropSeaT += W.temp[c]; nSea++; }
    }
  }

  const monsoonPush = (nLand && nSea)
    ? clamp((tropLandT / nLand - tropSeaT / nSea) * 2.2, -0.55, 0.55)
    : 0;
  W._monsoon = clamp(0.35 + Math.abs(monsoonPush), 0, 1);

  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const f = lat * fScale;
    const [dpe, dpn] = gradEN(W.press, c);

    const cor = 0.35 + Math.abs(f);
    let u = -dpn * cor;
    let v = dpe * cor;

    const band = Math.sin((lat - itczLat) * Math.PI * nCells) * (0.12 + 0.04 * nCells);
    u += band;
    const toItcz = itczLat - lat;
    v += clamp(toItcz * 0.55, -0.45, 0.45) * (0.5 + 0.5 * (1 - Math.abs(lat)));

    const abs = Math.abs(lat - itczLat);
    if (abs < 0.35) u += -0.35 * fScale * 0.25;
    else if (abs < 0.7) u += 0.4 * fScale * 0.2;

    if (W.h[c] > W.seaLevel + 0.08) {
      u *= 0.72; v *= 0.72;
    }
    if ((W.ice[c] || 0) > 0.55 && W.h[c] > W.seaLevel + 0.05) {
      v += -Math.sign(lat || 1) * 0.15;
    }

    // Walker: zonal SST gradient drives tropical east–west cell
    if (Math.abs(lat) < 0.28) {
      u += -walkerSST * 0.45;
      u += enso * 0.32; // El Niño: westerly anomaly
      const x = DIR[c * 3];
      v += walkerSST * x * 0.12; // rise over warm west, sink over east
    }

    // Monsoon: summer continent inhales from the adjacent sea
    if (Math.abs(lat) < 0.5 && W.h[c] >= W.seaLevel) {
      const summer = Math.sin(season) * lat;
      if (summer > 0.05) {
        v += -Math.sign(lat || 1) * monsoonPush * 0.35;
        u += monsoonPush * 0.12;
      }
    }

    // ENSO teleconnection — jet shifts a little
    if (abs > 0.28 && abs < 0.72) u += enso * 0.1;

    if (W.rule?.tidallyLocked && W._sunDir) {
      const day = DIR[c * 3] * W._sunDir[0] + DIR[c * 3 + 1] * W._sunDir[1] + DIR[c * 3 + 2] * W._sunDir[2];
      u += -day * 0.22;
    }

    // Prognostic momentum: the atmosphere remembers last tick
    u = (W.windU[c] || 0) * 0.76 + u * 0.24;
    v = (W.windV[c] || 0) * 0.76 + v * 0.24;
    W.windU[c] = clamp(u, -1.6, 1.6);
    W.windV[c] = clamp(v, -1.6, 1.6);

    if (abs > 0.28 && abs < 0.72) {
      const sp = Math.abs(W.windU[c]);
      jetU += sp;
      jetLat += lat * sp;
      jetN += sp;
    }
  }

  for (let c = 0; c < NC; c++) {
    W.converg[c] = clamp(-divUV(W.windU, W.windV, c) * 0.15, -1, 1);
  }

  W._jetLat = jetN > 1e-6 ? jetLat / jetN : 0.5 * Math.sign(itczLat || 1);
  W._windRegime = nCells <= 1 ? 'single-cell'
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
