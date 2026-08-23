/** Synoptic fronts, jet streaks, blocking, mesoscale boundaries.
 *
 *  FRONT1–50.  This module diagnoses frontal features from the prognostic wind
 *  and temperature fields and writes per-cell markers that weather.js, storms.js
 *  and overlays can consume.  Nothing here is prognostic — every field is
 *  re-derived each tick from the state that wind.js and atmo.js own.
 *
 *  @provenance fitted
 */

import { NC, DIR, NBR, AREA, NBR_E, NBR_N, NBR_IWE, NBR_IWN } from '../sphere.js';
import { clamp } from '../math.js';
import { hasSurface } from './planetKind.js';

/* ── tuning constants ──────────────────────────────────────────── */

/** FRONT1: frontogenesis sensitivity — deformation × |∇T| product gain */
const FGEN_GAIN = 18;
/** FRONT1: moisture gradient contribution weight */
const FGEN_MOIST = 6;
/** FRONT7: precip boost along strong fronts */
const FRONT_PRECIP_BOOST = 0.06;
/** FRONT14: Eady growth rate gain */
const EADY_GAIN = 2.2;
/** FRONT15: jet speed threshold for streak detection (normalised) */
const JET_STREAK_THRESH = 0.55;
/** FRONT20: blocking persistence decay per tick */
const BLOCK_DECAY = 0.92;
/** FRONT20: press anomaly threshold for ridge detection */
const BLOCK_PRESS_THRESH = 0.08;
/** FRONT25: cold tongue ΔT threshold */
const COLD_TONGUE_DT = 0.12;
/** FRONT13: storm track accumulation rate */
const TRACK_RATE = 0.04;
/** FRONT13: storm track decay */
const TRACK_DECAY = 0.96;
/** FRONT31: sea-breeze ΔT threshold */
const BREEZE_DT = 0.06;

/* ── helpers ───────────────────────────────────────────────────── */

function ensure(W, name, Ctor) {
  if (!W[name] || W[name].length !== NC) W[name] = new Ctor(NC);
  return W[name];
}

/** Gradient of a scalar field at cell c → [dE, dN]. */
function gradEN(field, c) {
  let dE = 0, dN = 0;
  const i0 = c * 4;
  for (let k = 0; k < 4; k++) {
    const i = i0 + k;
    const d = field[NBR[i]] - field[c];
    dE += d * NBR_E[i];
    dN += d * NBR_N[i];
  }
  return [dE * NBR_IWE[c], dN * NBR_IWN[c]];
}

/** Simple deformation proxy: |∂u/∂x - ∂v/∂y| + |∂u/∂y + ∂v/∂x|. */
function deformationAt(W, c) {
  const windU = W.windU, windV = W.windV;
  let dUe = 0, dUn = 0, dVe = 0, dVn = 0;
  const i0 = c * 4;
  for (let k = 0; k < 4; k++) {
    const i = i0 + k;
    const nb = NBR[i];
    dUe += (windU[nb] - windU[c]) * NBR_E[i];
    dUn += (windU[nb] - windU[c]) * NBR_N[i];
    dVe += (windV[nb] - windV[c]) * NBR_E[i];
    dVn += (windV[nb] - windV[c]) * NBR_N[i];
  }
  dUe *= NBR_IWE[c]; dUn *= NBR_IWN[c];
  dVe *= NBR_IWE[c]; dVn *= NBR_IWN[c];
  const stretch = Math.abs(dUe - dVn);
  const shearing = Math.abs(dUn + dVe);
  return stretch + shearing;
}

/* ── main tick ─────────────────────────────────────────────────── */

/**
 * Diagnose fronts, jet streaks, blocking, mesoscale boundaries.
 * Called once per tick after geostrophicWind, before/with weather.
 */
export function frontsTick(W) {
  if (!hasSurface(W) || W.noSurface || !W.windU || !W.temp) return;

  const frontStrength = ensure(W, 'frontStrength', Float32Array);
  const frontKind     = ensure(W, 'frontKind', Uint8Array);
  const windShift     = ensure(W, 'windShift', Float32Array);
  const dryline       = ensure(W, 'dryline', Float32Array);
  const stormTrack    = ensure(W, 'stormTrack', Float32Array);
  const eady          = ensure(W, 'eady', Float32Array);
  const block         = ensure(W, 'block', Float32Array);
  const coldTongue    = ensure(W, 'coldTongue', Float32Array);

  const { temp, windU, windV, h, seaLevel, press, precip, moist } = W;
  const jetU = W.jetU, jetV = W.jetV;
  const shear = W.shear;
  const vapour = W.vapour;
  const ascent = W.ascent;
  const wxClock = W.wxClock;

  let jetMaxSpd = 0, jetMaxLat = 0, jetSpdSum = 0, jetN = 0;
  let frontCells = 0, blockCells = 0;

  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const isLand = h[c] >= seaLevel;

    /* ── FRONT1: frontogenesis ≈ deformation × |∇T| ─────────── */
    const [dTe, dTn] = gradEN(temp, c);
    const gradT = Math.sqrt(dTe * dTe + dTn * dTn);
    const def = deformationAt(W, c);
    let qGrad = 0;
    if (vapour) {
      const [dQe, dQn] = gradEN(vapour, c);
      qGrad = Math.sqrt(dQe * dQe + dQn * dQn);
    }
    const fStr = clamp(def * gradT * FGEN_GAIN + qGrad * FGEN_MOIST, 0, 1);
    frontStrength[c] = fStr;
    W.front[c] = Math.max(W.front[c], fStr);
    if (fStr > 0.2) frontCells++;

    /* ── FRONT2–5: classify cold/warm/occluded/stationary ───── */
    let kind = 0; // 0=none
    if (fStr > 0.15) {
      const gradMag = gradT + 1e-8;
      const nTe = dTe / gradMag, nTn = dTn / gradMag;
      const vDotN = windU[c] * nTe + windV[c] * nTn;
      if (Math.abs(vDotN) < 0.04 * gradMag) {
        kind = 4; // stationary
      } else if (vDotN < 0) {
        kind = 1; // cold — wind into cold air
      } else {
        kind = 2; // warm — wind into warm air
      }
      // FRONT3: occluded where shear is high and both T-sides are cool
      if (kind > 0 && (shear?.[c] || 0) > 0.5 && gradT > 0.04) {
        let nbCold = 0;
        for (let k = 0; k < 4; k++) {
          if (temp[NBR[c * 4 + k]] < temp[c] - 0.02) nbCold++;
        }
        if (nbCold >= 3) kind = 3; // occluded
      }
    }
    frontKind[c] = kind;

    /* ── FRONT8: wind shift — cross-front velocity change ───── */
    let maxDV = 0;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      const du = windU[nb] - windU[c];
      const dv = windV[nb] - windV[c];
      maxDV = Math.max(maxDV, Math.sqrt(du * du + dv * dv));
    }
    windShift[c] = clamp(maxDV * 2, 0, 1);

    /* ── FRONT11: dryline — moisture jump without big T jump ── */
    if (vapour || moist) {
      const moistField = vapour || moist;
      let maxMJ = 0, maxTJ = 0;
      for (let k = 0; k < 4; k++) {
        const nb = NBR[c * 4 + k];
        maxMJ = Math.max(maxMJ, Math.abs(moistField[nb] - moistField[c]));
        maxTJ = Math.max(maxTJ, Math.abs(temp[nb] - temp[c]));
      }
      dryline[c] = (maxMJ > 0.04 && maxTJ < 0.03)
        ? clamp(maxMJ * 10, 0, 1)
        : 0;
    } else {
      dryline[c] = 0;
    }

    /* ── FRONT13: storm track accumulation ─────────────────── */
    const activity = fStr + (W.vort ? Math.abs(W.vort[c]) * 0.5 : 0);
    stormTrack[c] = clamp(stormTrack[c] * TRACK_DECAY + activity * TRACK_RATE, 0, 1);

    /* ── FRONT14: Eady growth rate ≈ shear × |∇T| ──────────── */
    const sh = shear?.[c] || 0;
    eady[c] = clamp(sh * gradT * EADY_GAIN, 0, 1);

    /* ── FRONT15–16: jet streak detection ──────────────────── */
    if (jetU && jetV) {
      const jSpd = Math.sqrt(jetU[c] * jetU[c] + jetV[c] * jetV[c]);
      if (jSpd > JET_STREAK_THRESH && Math.abs(lat) > 0.2) {
        jetSpdSum += jSpd;
        jetN++;
        if (jSpd > jetMaxSpd) { jetMaxSpd = jSpd; jetMaxLat = lat; }
        // FRONT16: exit-region ascent boost
        if (ascent) {
          let isExitSide = false;
          for (let k = 0; k < 4; k++) {
            const nb = NBR[c * 4 + k];
            const nbSpd = Math.sqrt((jetU[nb] || 0) ** 2 + (jetV[nb] || 0) ** 2);
            if (nbSpd < jSpd * 0.75) { isExitSide = true; break; }
          }
          if (isExitSide) {
            ascent[c] = clamp((ascent[c] || 0) + 0.04, -1, 1);
          }
        }
      }
    }

    /* ── FRONT20: blocking high ────────────────────────────── */
    if (press) {
      const pAnom = press[c] - 0.5;
      if (pAnom > BLOCK_PRESS_THRESH && Math.abs(lat) > 0.3 && Math.abs(lat) < 0.8) {
        block[c] = clamp(block[c] * BLOCK_DECAY + 0.08, 0, 1);
        if (block[c] > 0.3) blockCells++;
      } else {
        block[c] *= BLOCK_DECAY;
        if (block[c] < 0.01) block[c] = 0;
      }
    }

    /* ── FRONT25: cold outbreak tongue ─────────────────────── */
    {
      let coldNb = 0, warmNb = 0;
      for (let k = 0; k < 4; k++) {
        const nb = NBR[c * 4 + k];
        if (temp[nb] - temp[c] > COLD_TONGUE_DT) warmNb++;
        if (temp[c] - temp[nb] > COLD_TONGUE_DT) coldNb++;
      }
      coldTongue[c] = (coldNb >= 2 && warmNb === 0 && windV[c] * Math.sign(lat) < -0.05)
        ? clamp(gradT * 6, 0, 1)
        : coldTongue[c] * 0.85;
    }

    /* ── FRONT7: boost precip along strong fronts ──────────── */
    if (precip && fStr > 0.25) {
      precip[c] = clamp(precip[c] + fStr * FRONT_PRECIP_BOOST, 0, 1);
    }
  }

  /* ── FRONT26–28: terrain-driven mesoscale ────────────────── */
  for (let c = 0; c < NC; c++) {
    const isLand = h[c] >= seaLevel;
    if (!isLand) continue;
    const elev = h[c] - seaLevel;

    // FRONT26: lee trough — wind descent on downwind side of terrain
    if (elev > 0.06) {
      const [dHe, dHn] = gradEN(h, c);
      const downwind = windU[c] * dHe + windV[c] * dHn;
      if (downwind < -0.01) {
        if (press) press[c] = clamp(press[c] - 0.008, 0.05, 1.4);
      }
    }

    // FRONT27: foehn warm spike — descending air warms
    if (elev > 0.04) {
      let hasHigherNb = false;
      for (let k = 0; k < 4; k++) {
        if (h[NBR[c * 4 + k]] > h[c] + 0.03) { hasHigherNb = true; break; }
      }
      if (hasHigherNb) {
        const [dHe, dHn] = gradEN(h, c);
        const downslope = windU[c] * dHe + windV[c] * dHn;
        if (downslope < -0.005) {
          temp[c] = clamp(temp[c] + 0.008, 0, 1.2);
          if (moist) moist[c] = Math.max(0, moist[c] - 0.006);
        }
      }
    }

    // FRONT28: katabatic — cold dense air flowing downhill off ice
    if ((W.ice?.[c] || 0) > 0.3 && elev > 0.03) {
      const [dHe, dHn] = gradEN(h, c);
      const slopeMag = Math.sqrt(dHe * dHe + dHn * dHn);
      if (slopeMag > 0.01) {
        const boost = clamp(slopeMag * (W.ice[c] || 0) * 0.15, 0, 0.08);
        windU[c] -= dHe / (slopeMag + 1e-8) * boost;
        windV[c] -= dHn / (slopeMag + 1e-8) * boost;
      }
    }
  }

  /* ── FRONT31–32: sea/land breeze from diurnal land–sea ΔT ── */
  if (wxClock?.enabled) {
    const daySide = wxClock.diurnal || 0;
    for (let c = 0; c < NC; c++) {
      const isLand = h[c] >= seaLevel;
      if (!isLand) continue;
      let hasSeaNb = false;
      for (let k = 0; k < 4; k++) {
        if (h[NBR[c * 4 + k]] < seaLevel) { hasSeaNb = true; break; }
      }
      if (!hasSeaNb) continue;
      // Day: land heats → sea breeze (onshore); night: land cools → land breeze
      const dT = daySide * BREEZE_DT;
      if (Math.abs(dT) > 0.01) {
        const [dHe, dHn] = gradEN(h, c);
        const coastDir = Math.sqrt(dHe * dHe + dHn * dHn) + 1e-8;
        const sign = dT > 0 ? 1 : -1; // sea breeze vs land breeze
        windU[c] += sign * (dHe / coastDir) * 0.02;
        windV[c] += sign * (dHn / coastDir) * 0.02;
      }
    }
  }

  /* ── FRONT9–10: pressure trough hint & temp tendency ─────── */
  if (press) {
    for (let c = 0; c < NC; c++) {
      if (frontStrength[c] > 0.3 && frontKind[c] === 1) {
        press[c] = clamp(press[c] - 0.005, 0.05, 1.4);
      }
    }
  }

  /* ── budget scalars ──────────────────────────────────────── */
  W._frontCells = frontCells;
  W._blockCells = blockCells;
  W._jetStreakMax = jetMaxSpd;
  W._jetStreakLat = jetMaxLat;
  W._jetStreakMean = jetN > 0 ? jetSpdSum / jetN : 0;
}

/* ── queries ───────────────────────────────────────────────────── */

const KIND_NAMES = ['none', 'cold', 'warm', 'occluded', 'stationary'];

/** Return the front classification at a cell. */
export function frontTypeAt(W, c) {
  const k = W.frontKind?.[c] || 0;
  return {
    kind: k,
    name: KIND_NAMES[k] || 'none',
    strength: W.frontStrength?.[c] || 0,
    dryline: W.dryline?.[c] || 0,
    eady: W.eady?.[c] || 0,
    block: W.block?.[c] || 0,
    coldTongue: W.coldTongue?.[c] || 0,
    windShift: W.windShift?.[c] || 0,
    stormTrack: W.stormTrack?.[c] || 0,
  };
}

/** FRONT43–44: budget record for calibration. */
export function frontBudget(W) {
  return {
    frontCells: W._frontCells || 0,
    blockCells: W._blockCells || 0,
    jetStreakMax: W._jetStreakMax || 0,
    jetStreakLat: W._jetStreakLat || 0,
    jetStreakMean: W._jetStreakMean || 0,
    jetCoreLat: W._jetCoreLat || 0,
    jetCoreU: W._jetCoreU || 0,
  };
}
