/** Hydrosphere: conserved water, sea level, rivers, lakes, ice. */

import { clamp } from '../math.js';
import { NC, NBR, NBR8, DIR, AREA, EAST, NORTH, cellSizeKm } from '../sphere.js';
import { totalPressure } from '../rulesets.js';
import { rejectBrine, noteTropicalBasin, ensoEastness } from './ocean.js';
import { neighbourMean } from './vecop.js';
import { advect } from './atmo.js';
import { updateIsoline } from './isoline.js';
import { logEvent } from '../chronicle.js';
import {
  cycleMaterial, phaseAt, rheologyAt, cellTK, surfacePbar, surfaceTK, livePressureBar,
} from './substrateField.js';
import { coverTick, reservoirTick } from './cover.js';
import { clathrateTick } from './columnSketch.js';

/** Recompute global sea level from land ice + thermal expansion. */
export function updateSeaLevel(W) {
  const { iceLand, temp, h, rule } = W;
  let iceVol = 0, oceanHeat = 0, oceanW = 0;
  for (let c = 0; c < NC; c++) {
    iceVol += iceLand[c] * AREA[c];
    if (h[c] < W.seaLevel) {
      oceanHeat += temp[c] * AREA[c];
      oceanW += AREA[c];
    }
  }
  const meanOceanT = oceanW > 0 ? oceanHeat / oceanW : 0.5;
  // Base from fitted Earth sea level, or ruleset water inventory
  const base = W._seaBase != null ? W._seaBase : (-0.05 + rule.totalWater * 0.42);
  // Fitted worlds keep land fraction stable — hypsometry is steep near the shelf
  if (W._seaBase != null) {
    const thermal = (meanOceanT - 0.45) * 0.006;
    const iceDrawdown = Math.min(0.006, iceVol * 0.0008);
    W.seaLevel = clamp(base - iceDrawdown + thermal, -0.55, 0.85);
    return;
  }
  const iceDrawdown = Math.min(0.25, iceVol * 0.08);
  const thermal = (meanOceanT - 0.45) * 0.035;
  W.seaLevel = clamp(base - iceDrawdown + thermal, -0.55, 0.85);
}

/** Triple-point gate. Non-water volatiles do not run the water cycle.
 *  Methane keeps Titan's sketch; CO₂ / SO₂ / N₂ / H₂ / silicate skip it.
 *  Frost / sublimation for those species is `cycleMode`, not this gate. */
export function liquidWaterOk(W) {
  if (W.rule.airless) return false;
  const vol = W._worldAxes?.volatile?.v;
  const methane = W.rule.methaneSolvent || vol === 'CH4';
  if (vol && vol !== 'H2O' && !methane) return false;
  const P = W.rule.surfacePressureBar != null
    ? W.rule.surfacePressureBar
    : totalPressure(W.gases, W.rule);
  if (methane) return P > 0.02;
  return P > 0.006;
}

/** What the hydro machinery is doing: liquid rain, frost/sublimation, or nothing. */
export function cycleMode(W) {
  if (liquidWaterOk(W)) return 'liquid';
  const mat = cycleMaterial(W);
  if (!mat) return 'none';
  const T = surfaceTK(W.rule, W);
  const P = livePressureBar(W);
  const ph = phaseAt(mat, T, P);
  const rheo = rheologyAt(mat, T, P);
  if (ph === 'solid' || rheo === 'convecting-ice') return 'frost';
  return 'none';
}

function noteCycleShift(W, mode) {
  if (W._cycleMode === mode) return;
  const prev = W._cycleMode;
  W._cycleMode = mode;
  if (!prev || !W.chron) return;
  const mat = cycleMaterial(W);
  const name = mat?.name || 'volatile';
  let label = null;
  if (mode === 'frost' && (prev === 'liquid' || prev === 'none')) {
    label = `The atmosphere has begun to freeze out (${name})`;
  } else if (mode === 'liquid' && prev === 'frost') {
    label = `${name} has melted`;
  } else if (mode === 'none' && prev === 'frost') {
    label = `${name} has sublimated into vapour`;
  }
  if (label) logEvent(W.chron, W.year || 0, 'phase', 0, 1, label);
}

/** Distance-to-sea in km. 0 on ocean, rising inland. Cheap BFS, rebuilt with the drain tree. */
let _contQ = null;
export function updateContinentality(W) {
  if (!W.cont || W.cont.length !== NC) W.cont = new Float32Array(NC);
  if (!_contQ || _contQ.length !== NC) _contQ = new Int32Array(NC);
  const dist = W.cont;
  const q = _contQ;
  const { h, seaLevel } = W;
  dist.fill(1e6);
  let qt = 0;
  for (let c = 0; c < NC; c++) {
    if (h[c] < seaLevel) {
      dist[c] = 0;
      q[qt++] = c;
    }
  }
  const km = cellSizeKm();
  let qh = 0;
  while (qh < qt) {
    const c = q[qh++];
    const d = dist[c];
    if (d > 4000) continue;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (n < 0 || n >= NC) continue;
      const nd = d + km;
      if (dist[n] < 1e5) continue;
      dist[n] = nd;
      q[qt++] = n;
    }
  }
  W._contTick = W._tickIndex || 0;
}

/** Scratch queue for the coast BFS — length NC, so it cannot grow without bound. */
let _coastQ = null;

/**
 * Signed distance to the shoreline in km: + inland, − ocean.
 * Uniform-cost BFS from cells that already neighbour the other phase.
 * Each cell is enqueued at most once (the first visit is shortest).
 */
export function updateCoastDistance(W) {
  if (!W.coastDist || W.coastDist.length !== NC) W.coastDist = new Float32Array(NC);
  if (!_coastQ || _coastQ.length !== NC) _coastQ = new Int32Array(NC);
  const dist = W.coastDist;
  const q = _coastQ;
  const { h, seaLevel } = W;
  const isSea = (c) => h[c] < seaLevel;
  dist.fill(1e9);
  const km = cellSizeKm();
  let qt = 0;
  for (let c = 0; c < NC; c++) {
    const s = isSea(c);
    for (let k = 0; k < 4; k++) {
      if (isSea(NBR[c * 4 + k]) !== s) {
        dist[c] = 0.5 * km;
        q[qt++] = c;
        break;
      }
    }
  }
  let qh = 0;
  while (qh < qt) {
    const c = q[qh++];
    const d = dist[c];
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (n < 0 || n >= NC || dist[n] < 1e8) continue;
      dist[n] = d + km;
      q[qt++] = n;
    }
  }
  for (let c = 0; c < NC; c++) {
    const mag = dist[c] > 1e8 ? 4000 : dist[c];
    dist[c] = isSea(c) ? -mag : mag;
  }
  W._coastTick = W._tickIndex || 0;
  W._coastSea = seaLevel;
}

/**
 * Grow the water table and D8 discharge so the opening world has rivers,
 * not eight wet cells. Climate warmup already set rain; this only routes it.
 */
export function primeDrainage(W, passes = 1) {
  if (!liquidWaterOk(W)) return;
  if (!W.groundW || W.groundW.length !== NC) W.groundW = new Float32Array(NC);
  const { h, seaLevel, moist, precip, groundW } = W;
  for (let c = 0; c < NC; c++) {
    if (h[c] < seaLevel) continue;
    const wet = Math.max(moist[c] || 0, precip[c] || 0);
    // Springs fire above 0.64. One route is enough — extra passes *decay*
    // the table (×0.984 per tick) and the last one would have no seep.
    groundW[c] = Math.max(groundW[c] || 0, 0.76 + wet * 0.12);
  }
  W._hydroDirty = true;
  for (let i = 0; i < passes; i++) computeRivers(W);
}

/**
 * Persistent D8/D∞ drainage tree + depression lakes + groundwater baseflow.
 * Rebuilds the tree when terrain has moved; flow accumulates every tick.
 */
export function computeRivers(W) {
  const { h, seaLevel, flow, lake } = W;
  if (!liquidWaterOk(W)) {
    flow.fill(0);
    lake.fill(0);
    return;
  }
  if (!W.drainTo || W.drainTo.length !== NC) W.drainTo = new Int32Array(NC);
  if (!W.drainTo2 || W.drainTo2.length !== NC) W.drainTo2 = new Int32Array(NC);
  if (!W.groundW || W.groundW.length !== NC) W.groundW = new Float32Array(NC);

  const tick = W._tickIndex || 0;
  const rebuild = W._hydroDirty || W._drainTick == null || (tick - W._drainTick) > 7;
  if (rebuild) {
    W._drainTick = tick;
    W._hydroDirty = false;
    for (let c = 0; c < NC; c++) {
      if (h[c] < seaLevel) {
        W.drainTo[c] = -2;
        W.drainTo2[c] = -2;
        continue;
      }
      let b1 = -1, h1 = h[c], b2 = -1, h2 = h[c];
      for (let k = 0; k < 8; k++) {
        const n = NBR8[c * 8 + k];
        if (h[n] < h1) { h2 = h1; b2 = b1; h1 = h[n]; b1 = n; }
        else if (h[n] < h2) { h2 = h[n]; b2 = n; }
      }
      W.drainTo[c] = b1;
      W.drainTo2[c] = (b2 >= 0 && h2 < h[c] - 0.002) ? b2 : -1;
    }
  }

  flow.fill(0);
  const order = W._order;
  for (let c = 0; c < NC; c++) order[c] = c;
  order.sort((a, b) => h[b] - h[a]);

  // `flow` is surface discharge (throughput), not ponded volume. A 0.35 floor on
  // every land cell used to make the whole continent a river after D8 pile-up.
  // Runoff is now the water that cannot infiltrate; groundwater stays underground
  // until the table is high enough to seep (springs in valleys).
  for (let i = 0; i < NC; i++) {
    const c = order[i];
    if (h[c] < seaLevel) {
      lake[c] *= 0.9;
      W.groundW[c] = (W.groundW[c] || 0) * 0.96;
      continue;
    }
    const rain = W.precip[c] || 0;
    const soil = W.moist[c] || 0;
    const table = W.groundW[c] || 0;
    const wet = clamp((soil - 0.18) / 0.55, 0, 1);
    const rainRunoff = rain * (0.08 + 0.72 * wet);
    const satExcess = Math.max(0, soil - 0.58) * 0.18;
    W.groundW[c] = clamp(
      table * 0.984 + rain * (0.22 - wet * 0.12) + soil * 0.025 - rainRunoff * 0.06,
      0, 1
    );
    const seep = W.groundW[c] > 0.64 ? (W.groundW[c] - 0.64) * 0.2 : 0;
    flow[c] += AREA[c] * (rainRunoff + satExcess) + seep;

    let d1 = W.drainTo[c];
    if (d1 < 0) {
      lake[c] = clamp((lake[c] || 0) * 0.92 + flow[c] * 0.05 + (W.precip[c] || 0) * 0.18, 0, 1);
      if (lake[c] > 0.32) {
        let rim = -1, rimH = 9;
        for (let k = 0; k < 8; k++) {
          const n = NBR8[c * 8 + k];
          if (h[n] < rimH) { rimH = h[n]; rim = n; }
        }
        if (rim >= 0) {
          W.drainTo[c] = rim;
          d1 = rim;
        }
      } else continue;
    } else {
      lake[c] *= 0.88;
    }
    const d2 = W.drainTo2[c];
    const share = d2 >= 0 ? 0.74 : 1;
    if (d1 >= 0 && h[d1] >= seaLevel) flow[d1] += flow[c] * share;
    if (d2 >= 0 && h[d2] >= seaLevel) flow[d2] += flow[c] * (1 - share);
  }
}

/** Ice mass balance: accumulate above snowline, ablate below; separate sea/land. */
export function iceTick(W) {
  const { h, temp, iceLand, iceSea, seaLevel, moist, precip, rule } = W;
  if (!rule.earthLike) {
    reservoirTick(W);
    coverTick(W);
    clathrateTick(W);
    if (W._spinup) return;
    const mat = cycleMaterial(W);
    const vol = W._worldAxes?.volatile?.v;
    if (mat && vol && vol !== 'H2O') {
      if (vol !== 'CO2' && vol !== 'N2') iceTickFromPhase(W, mat);
      return;
    }
  }
  if (W._spinup) return;
  // Seasonal snow line migration. Item 141.
  const season = W.season || 0;
  const snowline = rule.freeze + 0.05 + Math.sin(season) * 0.04;
  const earth = !!rule.earthLike && !rule.deepTime;
  const freeze = rule.freeze ?? 0.30;
  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const lat = DIR[c * 3 + 1];
    const elev = Math.max(0, h[c] - seaLevel);
    const coldness = earth
      ? clamp((freeze + 0.08 - temp[c] + elev * 0.12) / 0.28, 0, 1)
      : 0;
    const seasonalCold = Math.sin(season) * lat; // NH winter when season~3π/2
    if (isSea) {
      iceLand[c] = 0;
      const seaFreeze = freeze - seasonalCold * 0.03 - coldness * 0.1;
      if (temp[c] < seaFreeze && liquidWaterOk(W)) {
        const grow = 0.06 + coldness * 0.04;
        iceSea[c] = clamp(iceSea[c] + grow, 0, 1);
        rejectBrine(W, c, grow);
      } else {
        const melt = earth && coldness > 0.4 ? 0.035 : 0.1;
        iceSea[c] = Math.max(0, iceSea[c] - melt * (1 - coldness * 0.8));
      }
      if (earth && coldness > 0.78) {
        iceSea[c] = Math.max(iceSea[c], 0.15 + coldness * 0.35);
      }
    } else {
      iceSea[c] = 0;
      const cold = temp[c] < snowline - elev * 0.15 - seasonalCold * 0.05 - coldness * 0.14;
      const canopy = W.life[c] > 0.45 ? 0.55 : W.life[c] > 0.2 ? 0.8 : 1;
      if (cold) {
        iceLand[c] = clamp(iceLand[c] + precip[c] * 0.10 * canopy, 0, 1);
      } else {
        const melt = Math.max(0.04, (temp[c] - snowline) * 0.35) * (2 - canopy) * (1 - coldness * 0.85);
        iceLand[c] = Math.max(0, iceLand[c] - melt);
      }
      if (earth && coldness > 0.72 && elev > 0.02) {
        iceLand[c] = Math.max(iceLand[c], 0.2 + coldness * 0.4);
      }
      if (iceLand[c] > 0.3) {
        for (let k = 0; k < 4; k++) {
          const n = NBR[c * 4 + k];
          if (h[n] < h[c] && h[n] >= seaLevel) {
            const move = (iceLand[c] - iceLand[n]) * 0.02;
            if (move > 0) {
              iceLand[c] -= move;
              iceLand[n] = Math.min(1, iceLand[n] + move);
            }
          }
        }
      }
    }
    W.ice[c] = Math.max(iceLand[c], iceSea[c]);
  }
}

/** Non-Earth ice: freeze / melt / sublimate from the cycle species' phase. */
function iceTickFromPhase(W, mat) {
  const { h, iceLand, iceSea, seaLevel } = W;
  const P = livePressureBar(W);
  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const ph = phaseAt(mat, cellTK(W, c), P);
    const rheo = rheologyAt(mat, cellTK(W, c), P);
    const solid = ph === 'solid' || rheo === 'convecting-ice';
    if (isSea) {
      iceLand[c] = 0;
      if (solid) iceSea[c] = clamp((iceSea[c] || 0) + 0.05, 0, 1);
      else iceSea[c] = Math.max(0, (iceSea[c] || 0) - (ph === 'liquid' ? 0.12 : 0.08));
    } else {
      iceSea[c] = 0;
      if (solid) {
        iceLand[c] = clamp((iceLand[c] || 0) + 0.04 + (W.precip[c] || 0) * 0.08, 0, 1);
      } else {
        iceLand[c] = Math.max(0, (iceLand[c] || 0) - (ph === 'liquid' ? 0.1 : 0.07));
      }
    }
    W.ice[c] = Math.max(iceLand[c], iceSea[c]);
  }
}

/**
 * Closed water budget: evaporate → atmospheric H2O → precip → moist/runoff.
 * Conserves total water mass (ocean column + moist + ice + vapour).
 */
export function hydroTick(W) {
  const { h, temp, moist, precip, seaLevel, windU, windV, rule, gases, _m } = W;
  const canLiquid = liquidWaterOk(W);
  noteCycleShift(W, cycleMode(W));
  if (!W.vapour || W.vapour.length !== NC) W.vapour = new Float32Array(NC);
  if (!W._vapourInit) {
    W.vapour.fill(gases.H2O || 0.01);
    W._vapourInit = true;
  }
  if (!W.cont || W.cont.length !== NC || W._hydroDirty || W._contTick == null) {
    updateContinentality(W);
  }
  if (!W.coastDist || W.coastDist.length !== NC || W._hydroDirty
      || W._coastTick == null || Math.abs((W._coastSea ?? seaLevel) - seaLevel) > 0.002) {
    updateCoastDistance(W);
    updateIsoline(W);
  }
  noteTropicalBasin(W, seaLevel);
  const vapourF = W.vapour;

  // Evaporation from ocean / wet land into a per-cell vapour field
  let evap = 0;
  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const wind = Math.hypot(windU?.[c] || 0, windV?.[c] || 0);
    const sat = (gases.H2O || 0.01) * Math.exp((temp[c] - 0.5) * 1.8);
    const deficit = Math.max(0, sat - vapourF[c]);
    let e = 0;
    if (isSea && canLiquid) {
      e = Math.max(0, temp[c] - 0.2) * 0.002 * AREA[c] * (0.65 + 0.35 * wind) * (0.4 + deficit * 8);
    } else if ((W.lake?.[c] || 0) > 0.25 && canLiquid) {
      e = W.lake[c] * Math.max(0, temp[c] - 0.2) * 0.0022 * AREA[c]
        * (0.65 + 0.35 * wind) * (0.4 + deficit * 8);
    } else if (moist[c] > 0.05) {
      e = moist[c] * Math.max(0, temp[c] - 0.25) * rule.aridity * 0.0015 * AREA[c]
        * (0.7 + 0.3 * wind);
      moist[c] = Math.max(0, moist[c] - e / (AREA[c] + 1e-6));
    }
    if (!isSea && (W.life[c] || 0) > 0.35) {
      e += W.life[c] * 0.00035 * AREA[c] * moist[c];
    }
    vapourF[c] = Math.min(0.25, vapourF[c] + e * 0.15 / (AREA[c] + 1e-6));
    evap += e;
  }
  void evap;
  if (W._adv && windU && windV) advect(vapourF, W, 0.28);

  // Orographic + advected precip from the local column, not a global pool
  let precipTotal = 0;
  let vapourMass = 0;
  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const localV = vapourF[c];
    const maritime = Math.exp(-(W.cont[c] || 0) / 900);
    let p = localV * (0.45 + 0.55 * maritime) * 0.08;
    const wu = W.windU?.[c] || 0;
    const wv = W.windV?.[c] || 0;
    let upslope = 0, lee = 0;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const dx = DIR[n * 3] - DIR[c * 3];
      const dy = DIR[n * 3 + 1] - DIR[c * 3 + 1];
      const dz = DIR[n * 3 + 2] - DIR[c * 3 + 2];
      const e = dx * EAST[c * 3] + dy * EAST[c * 3 + 1] + dz * EAST[c * 3 + 2];
      const nn = dx * NORTH[c * 3] + dy * NORTH[c * 3 + 1] + dz * NORTH[c * 3 + 2];
      const along = wu * e + wv * nn;
      const slope = h[c] - h[n];
      if (along < 0 && slope > 0) upslope = Math.max(upslope, slope * (-along));
      if (along < 0 && slope < 0) lee = Math.max(lee, -slope * (-along));
    }
    p += upslope * localV * 2.4;
    p *= 1 / (1 + lee * 10);
    const conv = W.converg?.[c] || 0;
    p *= 1 + conv * 0.85;
    p += (W.front?.[c] || 0) * localV * 0.32;
    if (W._monsoon > 0.45 && h[c] >= seaLevel && temp[c] > 0.40) {
      const summer = Math.sin(W.season || 0) * lat;
      if (summer > 0.08) p += W._monsoon * localV * 0.22 * maritime;
    }
    const enso = W._ensoIndex || 0;
    if (Math.abs(enso) > 0.15 && h[c] < seaLevel && temp[c] > 0.48) {
      const east = ensoEastness(W, c);
      if (enso > 0) p *= east > 0.15 ? 1.22 : east < -0.15 ? 0.78 : 1;
      else p *= east < -0.15 ? 1.12 : east > 0.15 ? 0.88 : 1;
    }
    if (!canLiquid) {
      if (!rule.earthLike) {
        const mat = cycleMaterial(W);
        if (mat) {
          const ph = phaseAt(mat, cellTK(W, c), surfacePbar(rule));
          p *= ph === 'solid' || ph === 'liquid' ? 0.45 : 0.04;
        } else {
          const vol = W._worldAxes?.volatile?.v;
          p *= (!vol || vol === 'H2O') ? 0.15 : 0;
        }
      } else {
        const vol = W._worldAxes?.volatile?.v;
        p *= (!vol || vol === 'H2O') ? 0.15 : 0;
      }
    }
    precip[c] = clamp(p, 0, 1);
    precipTotal += precip[c] * AREA[c];
    vapourMass += vapourF[c] * AREA[c];
  }

  // Rain removes local vapour; global H2O is the mean of the field
  for (let c = 0; c < NC; c++) {
    vapourF[c] = Math.max(0, vapourF[c] - precip[c] * 0.08);
  }
  let vapour = vapourMass / NC;
  const remove = Math.min(vapour, precipTotal * 0.08);
  vapour = Math.max(0, vapour - remove);
  if (rule.earthLike && !rule.deepTime) {
    vapour = Math.min(0.025, vapour);
  }
  gases.H2O = vapour;

  // Land moisture from precip; seas stay saturated
  for (let c = 0; c < NC; c++) {
    if (h[c] < seaLevel) {
      _m[c] = canLiquid ? 1 : 0.05;
    } else {
      const dM = neighbourMean(moist, c);
      _m[c] = clamp(moist[c] * 0.92 + precip[c] * 0.55 + (dM - moist[c]) * 0.2 - rule.aridity * 0.08, 0, 1);
      const wu = windU?.[c] || 0, wv = windV?.[c] || 0;
      let lee = 0;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        const dx = DIR[n * 3] - DIR[c * 3];
        const dy = DIR[n * 3 + 1] - DIR[c * 3 + 1];
        const dz = DIR[n * 3 + 2] - DIR[c * 3 + 2];
        const e = dx * EAST[c * 3] + dy * EAST[c * 3 + 1] + dz * EAST[c * 3 + 2];
        const nn = dx * NORTH[c * 3] + dy * NORTH[c * 3 + 1] + dz * NORTH[c * 3 + 2];
        const along = wu * e + wv * nn;
        const slope = h[c] - h[n];
        if (along < 0 && slope < 0) lee = Math.max(lee, -slope * (-along));
      }
      if (lee > 0.01) _m[c] *= 1 / (1 + lee * 6);
    }
  }
  moist.set(_m);

  computeRivers(W);
  iceTick(W);
  const seaBefore = W.seaLevel;
  updateSeaLevel(W);
  if (Math.abs(W.seaLevel - seaBefore) > 0.002) {
    updateCoastDistance(W);
    updateIsoline(W);
  }

  // Water mass bookkeeping (normalized units)
  let mass = gases.H2O * 50;
  for (let c = 0; c < NC; c++) {
    mass += moist[c] * AREA[c] * 0.1;
    mass += W.iceLand[c] * AREA[c] * 0.35;
    mass += W.iceSea[c] * AREA[c] * 0.08;
    if (h[c] < W.seaLevel) mass += (W.seaLevel - h[c]) * AREA[c] * 0.5;
  }
  if (W._waterMass0 == null) W._waterMass0 = mass;
  // Soft conservation: bleed excess into/out of vapour rather than inventing water
  const drift = mass - W._waterMass0;
  if (Math.abs(drift) > 0.5) {
    const h2oCap = (rule.earthLike && !rule.deepTime) ? 0.025 : 0.25;
    gases.H2O = clamp(gases.H2O - drift * 0.002, 0, h2oCap);
    mass = W._waterMass0 + drift * 0.85;
  }
  W.waterMass = mass;
  W.waterDrift = Math.abs(mass - W._waterMass0) / (W._waterMass0 + 1e-6);
}

/** Tsunami wavefront from a quake/impact energy spike. */
export function startTsunami(W, cell, power) {
  W.tsunamis = W.tsunamis || [];
  W.tsunamis.push({ origin: cell, r: 0, power, maxR: 8 + power * 12 });
}

export function tsunamiTick(W) {
  if (!W.tsunamis || !W.tsunamis.length) return;
  const next = [];
  for (const t of W.tsunamis) {
    t.r += 1.2;
    // mark coastal cells near wavefront
    for (let c = 0; c < NC; c++) {
      const d = Math.acos(clamp(
        DIR[c * 3] * DIR[t.origin * 3] + DIR[c * 3 + 1] * DIR[t.origin * 3 + 1] + DIR[c * 3 + 2] * DIR[t.origin * 3 + 2],
        -1, 1
      ));
      if (Math.abs(d - t.r * 0.04) < 0.03 && W.h[c] < W.seaLevel + 0.05 && W.h[c] > W.seaLevel - 0.15) {
        W.moist[c] = 1;
        if (W.h[c] >= W.seaLevel) W.h[c] = Math.max(W.seaLevel - 0.02, W.h[c] - t.power * 0.01);
      }
    }
    if (t.r < t.maxR) next.push(t);
  }
  W.tsunamis = next;
}
