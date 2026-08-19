/** Column sketch: ice VI floor and methane clathrate.
 *
 *  Ice-shell moons below 0.8 R⊕ keep a rock floor — Europa's ocean sits
 *  on rock; a 2 R⊕ water world does not. Clathrate is a 0–1 store.
 *  The stack itself lives in columnField.js. Earth Holocene does not enter.
 *  Titan's 1.5 bar surface is not the dissociation window — interior P is
 *  the sketch. */

import { logEvent } from '../chronicle.js';
import { livePressureBar, surfaceTK } from './substrateField.js';

function radiusEarthOf(rule) {
  if (Number(rule?.radiusEarth) > 0) return rule.radiusEarth;
  return rule?.iceShell ? 0.25 : 1;
}

/** Ocean column thickness in km. Ice-shell mean is Europa-normalised. */
export function oceanColumnKm(rule, W) {
  const r = radiusEarthOf(rule);
  if (rule?.iceShell) {
    let mean = 0.7;
    if (W?.shellOcean?.length) {
      let s = 0;
      const n = W.shellOcean.length;
      for (let c = 0; c < n; c++) s += W.shellOcean[c];
      mean = s / (n || 1);
    }
    return 100 * (mean / 0.7) * (r / 0.245);
  }
  const inv = W?._worldAxes?.volatiles?.v ?? rule?.totalWater ?? 1;
  return 3.7 * inv * r;
}

/** Seafloor pressure. ρ g d with g in Earth units, d in km. Ice VI ~0.62 GPa. */
export function seafloorPressureGPa(rule, depthKm) {
  const r = radiusEarthOf(rule);
  const g = Number(rule?.gravity) > 0 ? rule.gravity : r;
  return 0.00981 * g * Math.max(0, depthKm || 0);
}

/**
 * High-pressure ice floor. Small ice-shell moons stay on rock even when
 * the reported ocean is ~100 km — g is too low for ice VI.
 */
export function highPressureIceFloor(rule, W) {
  const depthKm = oceanColumnKm(rule, W);
  const r = radiusEarthOf(rule);
  const g = Number(rule?.gravity) > 0 ? rule.gravity : r;
  const seafloorGPa = 0.00981 * g * Math.max(0, depthKm || 0);
  const smallShell = !!(rule?.iceShell && r < 0.8);
  return { depthKm, seafloorGPa, iceVI: !smallShell && seafloorGPa > 0.62 };
}

/** Q1 ~272 K at 25 bar; Tdiss rises slowly with P. Surface Titan (94 K, 1.5 bar) is not this window. */
export function clathrateStable(TK, Pbar) {
  if (!(Pbar >= 25) || !(TK > 120)) return false;
  const Tdiss = 272 + 8 * Math.log10(Math.max(25, Pbar) / 25);
  return TK < Tdiss && TK < 320;
}

export function noteColumn(W) {
  const rule = W?.rule || {};
  const hit = highPressureIceFloor(rule, W);
  W._oceanKm = hit.depthKm;
  W._seafloorGPa = hit.seafloorGPa;
  W._hpIceFloor = hit.iceVI;
  if (rule.earthLike || rule.daisyworld) {
    W._clathrate = 0;
    return hit;
  }
  const vol = W._worldAxes?.volatile?.v;
  if (vol === 'CH4' || (rule.iceShell && vol !== 'SO2' && vol !== 'H2')) {
    if (!(W._clathrate > 0) && W._clathrate !== 0) W._clathrate = 1;
  } else if (W._clathrate == null) {
    W._clathrate = 0;
  }
  return hit;
}

/** Dissociate the store when T/P leave the cage window. Does not strip Titan at 94 K. */
export function clathrateTick(W) {
  if (!W || W.rule?.earthLike || W.rule?.daisyworld) return;
  if (!(W._clathrate > 0)) return;
  const T = surfaceTK(W.rule, W);
  const Psurf = livePressureBar(W);
  const ice = !!W.rule?.iceShell;
  const Pint = ice ? Math.max(80, Psurf) : Math.max(Psurf, 25);
  const Tint = ice ? T + 40 : T;
  if (clathrateStable(Tint, Pint)) return;
  const amt = W._clathrate;
  W._clathrate = 0;
  if (W.gases) W.gases.CH4 = Math.min(0.08, (W.gases.CH4 || 0) + 0.012 * amt);
  if (W.chron && W._clathrateNote !== 'released') {
    W._clathrateNote = 'released';
    logEvent(W.chron, W.year || 0, 'phase', 0, 1,
      'Methane clathrate dissociated — the cage ice gave up its gas');
  }
}

export { columnLayers, columnRecipe, formatColumn } from './columnField.js';
