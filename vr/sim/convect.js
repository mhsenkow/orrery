/** Organised convection + water accounting.
 *
 *  `convectTick` in weather.js adds CAPE-driven rain with a mass-flux bound.
 *  `hydro.js` owns stratiform precip. This module classifies cells by
 *  convective organisation, propagates cold pools, handles virga, shallow/deep
 *  split, the convective-vs-stratiform partition, rain rate, flash flood risk,
 *  canopy interception, infiltration, fog/dew enhancement, freezing rain /
 *  graupel extension, and a water-budget audit.
 *
 *  @provenance fitted
 */

import { NC, DIR, AREA, NBR } from '../sphere.js';
import { clamp } from '../math.js';
import { hasSurface } from './planetKind.js';
import { WIND_MS } from './aircol.js';

/* ── soft calib knobs (CONV11-light) ──────────────────────────── */

/** Rain multiplier — scales all convective precip before it reaches the grid.
 *  Earth = 1; raise to push tropical totals higher, lower to dry a planet. */
export const RAIN_GAIN = 1.0;
/** Mass-flux efficiency used in weather.js's convectTick. Documented here so
 *  calibration scripts can reference it. Earth obs 0.2–0.5. */
export const CONV_RAIN_K = 0.0008;

/* ── classification thresholds ────────────────────────────────── */
const CAPE_SHALLOW   = 400;
const CAPE_DEEP      = 800;
const SHEAR_MULTI    = 0.25;
const SHEAR_SQUALL   = 0.45;
const EHI_SUPER      = 1.5;
const ORG_MCS_AREA   = 6;

/* ── cold-pool parameters ─────────────────────────────────────── */
const COLD_POOL_SEED = 0.35;
const COLD_POOL_SPREAD = 0.72;
const COLD_POOL_DECAY = 0.55;

/* ── virga / interception / infiltration ──────────────────────── */
const VIRGA_PWAT_THRESH = 15;
const CANOPY_FACTOR = 0.12;
const INFILT_MAX = 0.08;

/* ── flood risk ───────────────────────────────────────────────── */
const FLOOD_TERRAIN_K = 2.5;
const FLOOD_SOIL_K = 1.8;

/* ── Bunkers storm motion (CONV32) ────────────────────────────── */
const BUNKERS_DEV = 7.5;

/* ── conv class enum ──────────────────────────────────────────── */
export const CONV_NONE = 0;
export const CONV_CELL = 1;
export const CONV_MULTI = 2;
export const CONV_SQUALL = 3;
export const CONV_SUPERCELL = 4;
export const CONV_MCS = 5;

const CONV_LABELS = Object.freeze([
  'none', 'cell', 'multicell', 'squall', 'supercell', 'MCS',
]);
export { CONV_LABELS };

/* ── helpers ──────────────────────────────────────────────────── */

function ensureField(W, name, Ctor = Float32Array) {
  if (!W[name] || W[name].length !== NC) W[name] = new Ctor(NC);
  return W[name];
}

/* ── main tick ────────────────────────────────────────────────── */

/**
 * Organised convection tick — runs after `convectTick` in world.js.
 * Classifies cells, propagates cold pools, handles virga/shallow/deep split,
 * rain-rate field, flood risk, canopy interception, infiltration, fog/dew,
 * and conv/strat precip partition.
 */
export function orgConvectionTick(W) {
  if (!hasSurface(W) || W.noSurface || !W.cape || W._spinup) return;

  const convClass   = ensureField(W, 'convClass', Uint8Array);
  const convOrg     = ensureField(W, 'convOrg');
  const coldPool    = ensureField(W, 'coldPool');
  const virga       = ensureField(W, 'virga');
  const precipConv  = ensureField(W, 'precipConv');
  const precipStrat = ensureField(W, 'precipStrat');
  const rainMmHr    = ensureField(W, 'rainMmHr');
  const floodRisk   = ensureField(W, 'floodRisk');
  const stormMotionU = ensureField(W, 'stormMotionU');
  const stormMotionV = ensureField(W, 'stormMotionV');

  const cape = W.cape;
  const cin  = W.cin;
  const shear = W.shear;
  const ehi  = W.ehi;
  const ascent = W.ascent;
  const pwat = W.pwat;
  const precip = W.precip;
  const convRain = W.convRain;
  const clouds = W.clouds;
  const life = W.life;
  const moist = W.moist;
  const h = W.h;
  const seaLevel = W.seaLevel;
  const airQ = W.airQ;
  const windU = W.windU;
  const windV = W.windV;
  const jetU = W.jetU;
  const jetV = W.jetV;
  const front = W.front;

  /* ── pass 1: classify + cold-pool seed + storm motion + virga ── */

  let orgSum = 0, orgN = 0;
  let classCount = new Uint32Array(6);

  for (let c = 0; c < NC; c++) {
    const cp = cape[c] || 0;
    const sh = shear?.[c] || 0;
    const eh = ehi?.[c] || 0;
    const asc = ascent?.[c] || 0;
    const pw = pwat?.[c] || 0;
    const cr = convRain?.[c] || 0;

    let cls = CONV_NONE;
    let org = 0;

    if (cp >= CAPE_SHALLOW && (cin?.[c] || 0) < 400) {
      if (cp < CAPE_DEEP) {
        // CONV5: shallow — moistens mid without much precip
        cls = CONV_CELL;
        org = 0.15;
        if (airQ && cr > 0) {
          const base = c * 8;
          for (let l = 2; l < 5 && base + l < airQ.length; l++) {
            airQ[base + l] = Math.min(1, airQ[base + l] + cr * 0.02);
          }
        }
      } else {
        cls = CONV_CELL;
        org = clamp((cp - CAPE_DEEP) / 2000, 0.2, 1);

        if (sh >= SHEAR_MULTI) {
          cls = CONV_MULTI;
          org = clamp(org + sh * 0.3, 0.3, 1);
        }
        // CONV23: squall lines — strong shear + linear lift
        if (sh >= SHEAR_SQUALL && (front?.[c] || 0) > 0.15 && asc > 0.05) {
          cls = CONV_SQUALL;
          org = clamp(org + 0.2, 0.5, 1);
          if (precip) precip[c] = clamp((precip[c] || 0) * 1.25, 0, 1);
          coldPool[c] = Math.max(coldPool[c], COLD_POOL_SEED * cr * 4);
        }
        // CONV25: supercells — high EHI
        if (eh > EHI_SUPER) {
          cls = CONV_SUPERCELL;
          org = clamp(org + 0.3, 0.6, 1);
        }
      }
    }

    convClass[c] = cls;
    convOrg[c] = org;
    if (cls > CONV_NONE) { orgSum += org; orgN++; }
    classCount[cls]++;

    // CONV32: Bunkers storm motion from mean-wind + shear deviation
    if (jetU && windU) {
      const meanU = (windU[c] + (jetU[c] || 0)) * 0.5;
      const meanV = (windV[c] + (jetV?.[c] || 0)) * 0.5;
      const sU = ((jetU[c] || 0) - windU[c]) * WIND_MS;
      const sV = ((jetV?.[c] || 0) - windV[c]) * WIND_MS;
      const sMag = Math.sqrt(sU * sU + sV * sV) || 1;
      stormMotionU[c] = meanU + BUNKERS_DEV * (sV / sMag) / WIND_MS;
      stormMotionV[c] = meanV - BUNKERS_DEV * (sU / sMag) / WIND_MS;
    }

    // CONV37: virga — mid-level dry air evaporates falling rain
    const pr = precip?.[c] || 0;
    if (pw < VIRGA_PWAT_THRESH && pr > 0.005 && cp > 200) {
      const dryFrac = clamp(1 - pw / VIRGA_PWAT_THRESH, 0, 0.6);
      const reduction = pr * dryFrac * 0.4;
      virga[c] = reduction;
      if (precip) precip[c] = Math.max(0, pr - reduction);
    } else {
      virga[c] = 0;
    }
  }

  /* ── pass 2: cold-pool propagation (CONV23 squall advance) ───── */

  const cpOld = new Float32Array(NC);
  cpOld.set(coldPool);
  for (let c = 0; c < NC; c++) {
    if (cpOld[c] < 0.01) continue;
    const spread = cpOld[c] * COLD_POOL_SPREAD;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      coldPool[nb] = Math.max(coldPool[nb], spread * 0.5);
      if (coldPool[nb] > 0.05 && (ascent?.[nb] || 0) < 0.1) {
        const lift = coldPool[nb] * 0.15;
        if (precip) precip[nb] = clamp((precip[nb] || 0) + lift * 0.08, 0, 1);
      }
    }
    coldPool[c] = cpOld[c] * COLD_POOL_DECAY;
  }

  /* ── pass 3: MCS promotion (CONV23 cont.) ────────────────────── */

  for (let c = 0; c < NC; c++) {
    if (convClass[c] < CONV_MULTI) continue;
    let contiguous = 0;
    for (let k = 0; k < 4; k++) {
      if (convClass[NBR[c * 4 + k]] >= CONV_MULTI) contiguous++;
    }
    if (contiguous >= 3) {
      convClass[c] = CONV_MCS;
      convOrg[c] = clamp(convOrg[c] + 0.15, 0.7, 1);
      classCount[CONV_MCS]++;
      classCount[convClass[c] === CONV_MULTI ? CONV_MULTI : CONV_SQUALL]--;
    }
  }

  /* ── CONV34: anvil — boost clouds downshear for class >= supercell ── */

  if (clouds && jetU) {
    for (let c = 0; c < NC; c++) {
      if (convClass[c] < CONV_SUPERCELL) continue;
      const sU = (jetU[c] || 0) - (windU?.[c] || 0);
      const sV = (jetV?.[c] || 0) - (windV?.[c] || 0);
      const mag = Math.sqrt(sU * sU + sV * sV);
      if (mag < 0.05) continue;
      const nU = sU / mag, nV = sV / mag;
      for (let k = 0; k < 4; k++) {
        const nb = NBR[c * 4 + k];
        const dx = DIR[nb * 3] - DIR[c * 3];
        const dy = DIR[nb * 3 + 1] - DIR[c * 3 + 1];
        const proj = dx * nU + dy * nV;
        if (proj > 0) {
          clouds[nb] = Math.min(1, clouds[nb] + 0.08 * convOrg[c]);
        }
      }
    }
  }

  /* ── pass 4: conv/strat split + rain rate + flood + interception ─ */

  let totalEvap = 0, totalPrecip = 0, totalRunoff = 0;

  for (let c = 0; c < NC; c++) {
    const pr = precip?.[c] || 0;
    const cr = convRain?.[c] || 0;
    const isLand = h[c] >= seaLevel;

    // CONV6: convective vs stratiform split
    if (pr > 0.001) {
      const convFrac = clamp(cr / Math.max(0.001, pr), 0, 1);
      precipConv[c]  = pr * convFrac;
      precipStrat[c] = pr * (1 - convFrac);
    } else {
      precipConv[c] = 0;
      precipStrat[c] = 0;
    }

    // CONV41: rain rate field (mm/hr equivalent mapped from 0–1 precip)
    rainMmHr[c] = pr * 120 * RAIN_GAIN;

    // CONV43: flash flood risk — precip * terrain steepness * soil saturation
    if (isLand && pr > 0.01) {
      let slope = 0;
      for (let k = 0; k < 4; k++) {
        slope = Math.max(slope, Math.abs(h[NBR[c * 4 + k]] - h[c]));
      }
      const soilSat = clamp((moist?.[c] || 0) / 0.8, 0, 1);
      floodRisk[c] = clamp(pr * slope * FLOOD_TERRAIN_K + pr * soilSat * FLOOD_SOIL_K, 0, 1);
    } else {
      floodRisk[c] = 0;
    }

    // CONV47: canopy interception — trees intercept rainfall
    if (isLand && (life?.[c] || 0) > 0.1 && pr > 0.003) {
      const intercept = clamp(life[c] * CANOPY_FACTOR * pr, 0, pr * 0.35);
      if (moist) moist[c] = Math.max(0, (moist[c] || 0) - intercept * 0.5);
    }

    // CONV48: infiltration clamp — soil uptake has a ceiling
    if (isLand && moist) {
      moist[c] = Math.min(1, moist[c]);
      const soilGain = pr * 0.075;
      if (soilGain > INFILT_MAX) {
        const excess = soilGain - INFILT_MAX;
        totalRunoff += excess * AREA[c];
      }
    }

    // CONV50: fog/dew enhancement from column saturation
    if (isLand && (pwat?.[c] || 0) > 25 && (W.fog?.[c] || 0) > 0.1) {
      if (moist) moist[c] = Math.min(1, (moist[c] || 0) + 0.003);
    }

    // Water budget accumulation
    totalPrecip += pr * AREA[c];
    if (isLand) {
      const evap = clamp((W.temp?.[c] || 0.5) * 0.08 * (1 - (moist?.[c] || 0)), 0, 0.1);
      totalEvap += evap * AREA[c];
    }
  }

  // CONV44: strengthen existing atmospheric river overlay
  if (W.ariver) {
    for (let c = 0; c < NC; c++) {
      if (precipConv[c] > 0.02 && (W.ariver[c] || 0) > 0.1) {
        W.ariver[c] = Math.min(1, W.ariver[c] + precipConv[c] * 0.15);
      }
    }
  }

  // Store summary on W for climatePanel
  if (!W._conv) W._conv = {};
  W._conv.classCounts = Array.from(classCount);
  W._conv.meanOrg = orgN > 0 ? orgSum / orgN : 0;
}

/* ── CONV51/52: precipTypeAt extension ────────────────────────── */

/**
 * Extended precip type: adds 'freezingRain' and 'graupel' to the original
 * set of rain / snow / sleet / hail / none.
 */
export function extendedPrecipType(W, c) {
  const p = W.precip?.[c] || 0;
  if (p < 0.002) return 'none';

  const freezeKm = W.freezeKm?.[c] ?? 99;
  const t = W.temp?.[c] ?? 0.5;
  const cape = W.cape?.[c] || 0;
  const tK = t * 180 + 180;
  const pw = W.pwat?.[c] || 0;

  if (cape > 800 && freezeKm < 4.5 && p > 0.01) return 'hail';
  // CONV52: graupel — moderate convection + cold + some moisture
  if (cape > 300 && cape <= 800 && freezeKm < 3 && tK < 275) return 'graupel';
  // CONV51: freezing rain — warm nose aloft, surface below freezing
  if (tK < 273 && freezeKm > 1.0 && freezeKm < 3.5 && pw > 10) return 'freezingRain';
  if (tK < 272 && freezeKm < 0.5) return 'snow';
  if (tK < 275 && freezeKm < 1.2) return 'sleet';
  return 'rain';
}

/* ── CONV53: water budget audit ───────────────────────────────── */

/**
 * Returns a one-tick water budget: { evap, precip, runoff, residual }.
 * All in area-integrated units (the sphere is 4π).
 */
export function waterBudget(W) {
  if (!hasSurface(W) || W.noSurface) {
    return { evap: 0, precip: 0, runoff: 0, residual: 0 };
  }

  let evap = 0, precip = 0, runoff = 0;
  const seaLevel = W.seaLevel;

  for (let c = 0; c < NC; c++) {
    const a = AREA[c];
    const pr = W.precip?.[c] || 0;
    precip += pr * a;

    const isLand = W.h[c] >= seaLevel;
    if (isLand) {
      const t = W.temp?.[c] || 0.5;
      const m = W.moist?.[c] || 0;
      evap += clamp(t * 0.08 * (1 - m), 0, 0.1) * a;
      const flow = W.flow?.[c] || 0;
      runoff += flow * 0.01 * a;
    } else {
      const t = W.temp?.[c] || 0.5;
      evap += clamp(t * 0.12, 0, 0.15) * a;
    }
  }

  const residual = precip - evap - runoff;
  return {
    evap: +evap.toFixed(6),
    precip: +precip.toFixed(6),
    runoff: +runoff.toFixed(6),
    residual: +residual.toFixed(6),
  };
}

/* ── CONV60: fast-assert helpers ──────────────────────────────── */

/** True when convClass exists and is well-formed. */
export function convClassOk(W) {
  if (!W.convClass || W.convClass.length !== NC) return false;
  for (let c = 0; c < NC; c++) {
    if (W.convClass[c] > 5) return false;
  }
  return true;
}

/** True when virga actually reduced precip where mid-level air is dry. */
export function virgaReducesPrecip(W) {
  if (!W.virga) return false;
  let reduced = 0, dryWithPrecip = 0;
  for (let c = 0; c < NC; c++) {
    const pw = W.pwat?.[c] || 0;
    const pr = W.precip?.[c] || 0;
    if (pw < VIRGA_PWAT_THRESH && pr > 0.003) {
      dryWithPrecip++;
      if (W.virga[c] > 0) reduced++;
    }
  }
  return dryWithPrecip === 0 || reduced > 0;
}
