/** Geostrophic wind + persistent pressure + Rhines-ish banding.
 *  Spin reorganises cell count, not just wind speed. */

import { NC, DIR, NBR } from '../sphere.js';
import { clamp } from '../math.js';

/** Number of meridional cells from rotation (Rhines / Held–Hou sketch). */
export function circulationCellCount(rotationPeriod = 1) {
  const rot = Math.max(0.12, Math.abs(rotationPeriod || 1));
  // Earth ~1 → 3 cells/hemisphere; fast → more narrow bands; slow → 1 wide Hadley
  if (rot > 2.2) return 1;
  if (rot > 1.35) return 2;
  if (rot > 0.55) return 3;
  if (rot > 0.28) return 5;
  return 7;
}

/** Overwrite windU/windV from pressure + Coriolis; store W.press. */
export function geostrophicWind(W) {
  if (!W.windU) return;
  if (!W.press || W.press.length !== NC) W.press = new Float32Array(NC);
  if (!W.converg || W.converg.length !== NC) W.converg = new Float32Array(NC);

  const rot = W.rotationPeriod || 1;
  const fScale = clamp(1 / Math.max(0.2, Math.abs(rot)), 0.15, 4);
  const nCells = circulationCellCount(rot);
  W._windCells = nCells;
  // Seasonal ITCZ offset — thermal equator follows insolation with lag
  const season = W.season || 0;
  const itczLat = Math.sin(season) * Math.sin(W.obliquity || 0) * 0.28;
  W._itczLat = itczLat;

  // Pressure: cold/high ice → high; warm → low; land heats faster (continentality)
  for (let c = 0; c < NC; c++) {
    const isLand = W.h[c] >= W.seaLevel;
    const landHeat = isLand ? (W.temp[c] - 0.5) * 0.12 : 0;
    const p = (1 - W.temp[c]) * 0.55
      + Math.max(0, W.h[c] - W.seaLevel) * 0.22
      + (W.ice[c] || 0) * 0.18
      - landHeat;
    W.press[c] = clamp(p, 0, 1.4);
    W._t[c] = W.press[c];
  }

  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const f = Math.sin(Math.asin(clamp(lat, -1, 1))) * fScale;
    let dpx = 0, dpy = 0;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      const dp = W.press[nb] - W.press[c];
      dpx += dp * (DIR[nb * 3] - DIR[c * 3]);
      dpy += dp * (DIR[nb * 3 + 2] - DIR[c * 3 + 2]);
    }
    dpx *= 0.25; dpy *= 0.25;

    // Geostrophic: wind ⊥ ∇p (stronger off-equator)
    const cor = 0.35 + Math.abs(f);
    let u = -dpy * cor;
    let v = dpx * cor;

    // Rhines banding — cell count from rotation
    const band = Math.sin((lat - itczLat) * Math.PI * nCells) * (0.12 + 0.04 * nCells);
    u += band;
    // Surface Hadley return toward ITCZ
    const toItcz = itczLat - lat;
    v += clamp(toItcz * 0.55, -0.45, 0.45) * (0.5 + 0.5 * (1 - Math.abs(lat)));

    // Trades / westerlies residual by band
    const abs = Math.abs(lat - itczLat);
    if (abs < 0.35) u += -0.35 * fScale * 0.25; // trades
    else if (abs < 0.7) u += 0.4 * fScale * 0.2; // westerlies

    if (W.h[c] > W.seaLevel + 0.08) {
      u *= 0.72; v *= 0.72;
    }
    // Katabatic nudge off ice sheets
    if ((W.ice[c] || 0) > 0.55 && W.h[c] > W.seaLevel + 0.05) {
      v += -Math.sign(lat || 1) * 0.15;
    }

    if (W.rule?.tidallyLocked && W._sunDir) {
      const day = DIR[c * 3] * W._sunDir[0] + DIR[c * 3 + 1] * W._sunDir[1] + DIR[c * 3 + 2] * W._sunDir[2];
      u += -day * 0.22;
    }
    W.windU[c] = clamp(u, -1.6, 1.6);
    W.windV[c] = clamp(v, -1.6, 1.6);
  }

  // Convergence for ITCZ / storm seeding (∇·wind ≈ 0 when converging)
  for (let c = 0; c < NC; c++) {
    let div = 0;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      div += (W.windU[nb] - W.windU[c]) + (W.windV[nb] - W.windV[c]);
    }
    W.converg[c] = clamp(-div * 0.15, -1, 1); // positive = converging
  }

  // Name the regime for HUD
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
