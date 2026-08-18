/** Hydrosphere: conserved water, sea level, rivers, lakes, ice. */

import { clamp } from '../math.js';
import { NC, NBR, NBR8, DIR, AREA, EAST, NORTH } from '../sphere.js';
import { totalPressure } from '../rulesets.js';
import { rejectBrine } from './ocean.js';
import { neighbourMean } from './vecop.js';

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

/** Triple-point gate: below ~0.006 bar, water won't pool. */
export function liquidWaterOk(W) {
  if (W.rule.airless) return false;
  const P = W.rule.surfacePressureBar != null
    ? W.rule.surfacePressureBar
    : totalPressure(W.gases, W.rule);
  if (W.rule.methaneSolvent) return P > 0.02; // Titan methane triple-point sketch
  return P > 0.006;
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

  for (let i = 0; i < NC; i++) {
    const c = order[i];
    if (h[c] < seaLevel) {
      lake[c] *= 0.9;
      continue;
    }
    const gw = W.groundW[c] || 0;
    W.groundW[c] = clamp(gw * 0.97 + (W.precip[c] || 0) * 0.14 + (W.moist[c] || 0) * 0.02, 0, 1);
    flow[c] += AREA[c] * (0.35 + (W.moist[c] || 0) * 0.45 + (W.precip[c] || 0) * 0.5) + gw * 0.14;

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
  // Seasonal snow line migration. Item 141.
  const season = W.season || 0;
  const snowline = rule.freeze + 0.05 + Math.sin(season) * 0.04;
  const earth = !!rule.earthLike && !rule.deepTime;
  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const lat = DIR[c * 3 + 1];
    const absLat = Math.abs(lat);
    // Keep Holocene polar caps: high latitudes stay below snowline even when
    // heat diffusion flattens the global mean.
    const polar = earth ? clamp((absLat - 0.72) / 0.28, 0, 1) : 0;
    const seasonalCold = Math.sin(season) * lat; // NH winter when season~3π/2
    if (isSea) {
      iceLand[c] = 0;
      const seaFreeze = rule.freeze - seasonalCold * 0.03 - polar * 0.1;
      if (temp[c] < seaFreeze && liquidWaterOk(W)) {
        const grow = 0.06 + polar * 0.04;
        iceSea[c] = clamp(iceSea[c] + grow, 0, 1);
        rejectBrine(W, c, grow);
      } else {
        const melt = earth && polar > 0.4 ? 0.035 : 0.1;
        iceSea[c] = Math.max(0, iceSea[c] - melt * (1 - polar * 0.8));
      }
      if (earth && absLat > 0.88) {
        iceSea[c] = Math.max(iceSea[c], 0.2 + (absLat - 0.88) * 3);
      }
    } else {
      iceSea[c] = 0;
      const elev = h[c] - seaLevel;
      const cold = temp[c] < snowline - elev * 0.15 - seasonalCold * 0.05 - polar * 0.14;
      const canopy = W.life[c] > 0.45 ? 0.55 : W.life[c] > 0.2 ? 0.8 : 1;
      if (cold) {
        iceLand[c] = clamp(iceLand[c] + (precip[c] * 0.06 + 0.015 + polar * 0.02) * canopy, 0, 1);
      } else {
        const melt = Math.max(0.04, (temp[c] - snowline) * 0.35) * (2 - canopy) * (1 - polar * 0.85);
        iceLand[c] = Math.max(0, iceLand[c] - melt);
      }
      // Holocene residual ice sheet — Antarctica / Greenland scale floor
      if (earth && absLat > 0.86 && h[c] - seaLevel > 0.02) {
        iceLand[c] = Math.max(iceLand[c], 0.25 + (absLat - 0.86) * 2.5);
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

/**
 * Closed water budget: evaporate → atmospheric H2O → precip → moist/runoff.
 * Conserves total water mass (ocean column + moist + ice + vapour).
 */
export function hydroTick(W) {
  const { h, temp, moist, precip, seaLevel, windU, windV, rule, gases, _m } = W;
  const canLiquid = liquidWaterOk(W);
  let vapour = gases.H2O;

  // Evaporation from ocean / wet land into vapour (tracked globally + locally)
  let evap = 0;
  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    if (isSea && canLiquid) {
      const e = Math.max(0, temp[c] - 0.2) * 0.002 * AREA[c];
      evap += e;
    } else if (moist[c] > 0.05) {
      const e = moist[c] * Math.max(0, temp[c] - 0.25) * rule.aridity * 0.0015 * AREA[c];
      moist[c] = Math.max(0, moist[c] - e / (AREA[c] + 1e-6));
      evap += e;
    }
  }
  vapour = Math.min(0.25, vapour + evap * 0.15);

  // Orographic + wind-advected precip
  let precipTotal = 0;
  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    let p = vapour * (0.4 + 0.6 * (1 - Math.abs(Math.abs(lat) - 0.3))) * 0.08;
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
    p += upslope * vapour * 2.4;
    p *= 1 / (1 + lee * 10);
    if (W._monsoon > 0.45 && Math.abs(lat) < 0.48 && h[c] >= seaLevel) {
      const summer = Math.sin(W.season || 0) * lat;
      if (summer > 0.08) p += W._monsoon * vapour * 0.22;
    }
    const enso = W._ensoIndex || 0;
    if (Math.abs(enso) > 0.15 && Math.abs(lat) < 0.32) {
      const x = DIR[c * 3];
      if (enso > 0) p *= x > 0.1 ? 1.22 : x < -0.1 ? 0.78 : 1;
      else p *= x < -0.1 ? 1.12 : x > 0.1 ? 0.88 : 1;
    }
    if (!canLiquid) p *= 0.15;
    precip[c] = clamp(p, 0, 1);
    precipTotal += precip[c] * AREA[c];
  }

  // Remove precipitated vapour
  const remove = Math.min(vapour, precipTotal * 0.08);
  vapour = Math.max(0, vapour - remove);
  // Earth column H₂O is ~1%; the 0.25 cap was a steam greenhouse floor.
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
  updateSeaLevel(W);

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
