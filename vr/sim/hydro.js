/** Hydrosphere: conserved water, sea level, rivers, lakes, ice. */

import { clamp } from '../math.js';
import { NC, NBR, NBR8, DIR, AREA } from '../sphere.js';
import { totalPressure } from '../rulesets.js';

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
  // Base from ruleset water inventory; land ice locks water out of the ocean
  const base = -0.05 + rule.totalWater * 0.42;
  const iceDrawdown = Math.min(0.25, iceVol * 0.08);
  const thermal = (meanOceanT - 0.45) * 0.035;
  W.seaLevel = clamp(base - iceDrawdown + thermal, -0.55, 0.45);
}

/** Triple-point gate: below ~0.006 bar, water won't pool. */
export function liquidWaterOk(W) {
  if (W.rule.airless) return false;
  return totalPressure(W.gases) > 0.006;
}

/**
 * Flow accumulation (D8 steepest descent) + simple depression fill for lakes.
 */
export function computeRivers(W) {
  const { h, seaLevel, flow, lake } = W;
  flow.fill(0);
  lake.fill(0);
  if (!liquidWaterOk(W)) return;

  // Each cell contributes its area, routed downhill
  const order = W._order;
  for (let c = 0; c < NC; c++) order[c] = c;
  order.sort((a, b) => h[b] - h[a]);

  for (let i = 0; i < NC; i++) {
    const c = order[i];
    if (h[c] < seaLevel) continue;
    flow[c] += AREA[c];
    let best = -1, bestH = h[c];
    for (let k = 0; k < 8; k++) {
      const n = NBR8[c * 8 + k];
      if (h[n] < bestH) { bestH = h[n]; best = n; }
    }
    if (best < 0) {
      lake[c] = 1; // local sink → lake
      continue;
    }
    if (h[best] >= seaLevel) flow[best] += flow[c];
  }
}

/** Ice mass balance: accumulate above snowline, ablate below; separate sea/land. */
export function iceTick(W) {
  const { h, temp, iceLand, iceSea, seaLevel, moist, precip, rule } = W;
  const snowline = rule.freeze + 0.05;
  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    if (isSea) {
      iceLand[c] = 0;
      if (temp[c] < rule.freeze && liquidWaterOk(W)) {
        iceSea[c] = clamp(iceSea[c] + 0.08, 0, 1);
      } else {
        iceSea[c] = Math.max(0, iceSea[c] - 0.1);
      }
    } else {
      iceSea[c] = 0;
      const elev = h[c] - seaLevel;
      const cold = temp[c] < snowline - elev * 0.15;
      if (cold) {
        iceLand[c] = clamp(iceLand[c] + precip[c] * 0.06 + 0.015, 0, 1);
      } else {
        const melt = Math.max(0.04, (temp[c] - snowline) * 0.35);
        iceLand[c] = Math.max(0, iceLand[c] - melt);
      }
      // downhill ice flow (simple)
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
    // Base from vapour and latitude (ITC / midlat)
    let p = vapour * (0.4 + 0.6 * (1 - Math.abs(Math.abs(lat) - 0.3))) * 0.08;
    // Orographic: upslope relative to wind
    let maxUp = 0;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const slope = h[c] - h[n];
      if (slope > maxUp) maxUp = slope;
    }
    p += maxUp * vapour * 0.5;
    // Rain shadow: leeward drying approximated by lowering moist diffusion later
    if (!canLiquid) p *= 0.15;
    precip[c] = clamp(p, 0, 1);
    precipTotal += precip[c] * AREA[c];
  }

  // Remove precipitated vapour
  const remove = Math.min(vapour, precipTotal * 0.08);
  vapour = Math.max(0, vapour - remove);
  gases.H2O = vapour;

  // Land moisture from precip; seas stay saturated
  for (let c = 0; c < NC; c++) {
    if (h[c] < seaLevel) {
      _m[c] = canLiquid ? 1 : 0.05;
    } else {
      const dM = (moist[NBR[c * 4]] + moist[NBR[c * 4 + 1]] + moist[NBR[c * 4 + 2]] + moist[NBR[c * 4 + 3]]) * 0.25;
      // wind bias: pull from upwind neighbour (simplified via windU as lat band)
      _m[c] = clamp(moist[c] * 0.92 + precip[c] * 0.55 + (dM - moist[c]) * 0.2 - rule.aridity * 0.08, 0, 1);
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
    gases.H2O = clamp(gases.H2O - drift * 0.002, 0, 0.25);
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
