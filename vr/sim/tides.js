/** Lunar/solar tidal potential + breathing shore + basin range.
 *  Moon phase is shared with the renderer. */

import { NC, DIR, NBR } from '../sphere.js';
import { clamp } from '../math.js';
import { localSeaLevel, cellElev } from './cellSurface.js';

/** Allocate tidal fields once. */
export function initTides(W) {
  if (!W.tideRange || W.tideRange.length !== NC) {
    W.tideRange = new Float32Array(NC);
    W.tideHeight = new Float32Array(NC);
    W.intertidal = new Float32Array(NC);
    W.tideWet = new Float32Array(NC);
    W.tideU = new Float32Array(NC); // tidal current proxies
    W.tideV = new Float32Array(NC);
  }
}

/**
 * Two-bulge equilibrium tide; range amplified on shelves.
 * Sets W.moonPhase / W.moonAngle for renderer sync.
 */
export function tidesTick(W) {
  initTides(W);
  const moon = W.moon;
  const sun = W._sunDir || [1, 0, 0];

  if ((W.clockFace || 'years') === 'now' && W._livedActive) {
    // Moon angle owned by livedTick.
  } else if (W.seasonHold != null && (W.clockFace || 'years') === 'years'
    && (W.moonAngleHold != null || W.moonPhaseHold != null)) {
    W.moonAngle = W.moonAngleHold ?? W.moonAngle ?? 0;
    W.moonPhase = W.moonPhaseHold ?? W.moonPhase ?? 0;
    const a = W.moonAngle;
    W._moonDir = [Math.cos(a), 0, Math.sin(a)];
  } else {
    const lunarOrb = (W.ageYr || 0) * Math.PI * 2 * 13.4;
    const lunarDay = lunarOrb * 0.966;
    W.moonAngle = lunarDay;
    W.moonPhase = (lunarOrb / (Math.PI * 2)) % 1;
    const mx = Math.cos(lunarDay), mz = Math.sin(lunarDay);
    W._moonDir = [mx, 0, mz];
  }
  const mx = W._moonDir?.[0] ?? 1;
  const mz = W._moonDir?.[2] ?? 0;

  if (!moon || moon.mass < 0.05) {
    const solarAmp = 0.008;
    let meanRange = 0, wetN = 0;
    for (let c = 0; c < NC; c++) {
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      const cosS = x * sun[0] + y * sun[1] + z * sun[2];
      const h = solarAmp * (1.5 * cosS * cosS - 0.5);
      W.tideHeight[c] = h;
      W.tideRange[c] = basinRange(W, c, Math.abs(h) * 2.2);
      meanRange += W.tideRange[c];
      W.tideU[c] = W.tideV[c] = 0;
      if (updateShoreCell(W, c)) wetN++;
    }
    W.meanTideRange = meanRange / NC;
    W.tidePhase = 'solar-only';
    W.springsInDays = null;
    W.intertidalFrac = wetN / NC;
    return;
  }

  const mass = clamp(moon.mass || 1, 0.05, 3);
  const dist = clamp(moon.distance || 1, 0.35, 3);
  const amp = (0.018 * mass) / (dist * dist * dist);
  const solarAmp = amp * 0.46;

  const moonDotSun = mx * sun[0] + mz * sun[2];
  // Phase fraction for lit crescent: 0 new, 0.5 full
  const phaseAng = Math.acos(clamp(moonDotSun, -1, 1));
  W.moonIllum = 0.5 + 0.5 * moonDotSun; // 0..1 lit fraction approx
  const springFactor = 0.55 + 0.45 * Math.abs(moonDotSun);
  const isSpring = Math.abs(moonDotSun) > 0.85;
  const isNeap = Math.abs(moonDotSun) < 0.25;
  W.tidePhase = isSpring ? 'springs' : isNeap ? 'neaps' : 'mean';
  const ang = Math.acos(clamp(Math.abs(moonDotSun), 0, 1));
  W.springsInDays = ((Math.PI / 2 - ang) / Math.PI) * 14.8;

  let meanRange = 0, wetN = 0;
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const cosM = x * mx + z * mz;
    const lunar = amp * (1.5 * cosM * cosM - 0.5);
    const cosS = x * sun[0] + y * sun[1] + z * sun[2];
    const solar = solarAmp * (1.5 * cosS * cosS - 0.5);
    const h = (lunar + solar) * springFactor;
    W.tideHeight[c] = h;
    const raw = Math.abs(h) * 2.2;
    W.tideRange[c] = basinRange(W, c, raw);
    meanRange += W.tideRange[c];

    // Tidal currents ~ ∇height (proxy)
    let du = 0, dv = 0;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      const dh = W.tideHeight[nb] - h;
      du += dh * (DIR[nb * 3] - x);
      dv += dh * (DIR[nb * 3 + 2] - z);
    }
    W.tideU[c] = clamp(du * 8, -1, 1);
    W.tideV[c] = clamp(dv * 8, -1, 1);

    if (updateShoreCell(W, c)) wetN++;
  }
  W.meanTideRange = meanRange / NC;
  W.intertidalFrac = wetN / NC;

  if (isSpring && W._lastSpringLog !== (W.ageYr / 0.04 | 0)) {
    W._lastSpringLog = W.ageYr / 0.04 | 0;
    W._springEvent = true;
  } else {
    W._springEvent = false;
  }

  if (W._seaBase == null) W._seaBase = W.seaLevel;
  // Do not overwrite hydro's ice/thermal sea level — tideHeight adds on top locally
}

/** Shelf / basin amplification — Fundy-ish vs Mediterranean-ish. */
function basinRange(W, c, raw) {
  const sea = W._seaBase ?? W.seaLevel;
  const elev = W.h[c] - sea;
  // Shallow shelf: amplify; deep basin / enclosed-ish: damp
  let factor = 1;
  if (elev > -0.08 && elev < 0.05) {
    // Count ocean neighbours — embayment proxy
    let oceanN = 0, landN = 0;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      if (W.h[nb] < sea) oceanN++; else landN++;
    }
    if (landN >= 2 && oceanN >= 1) factor = 2.4; // funnel / bay
    else if (elev > -0.04) factor = 1.55; // shelf
  } else if (elev < -0.2) {
    factor = 0.45; // deep ocean — small surface range
  }
  return raw * factor;
}

function updateShoreCell(W, c) {
  const elev = cellElev(W, c);
  const range = W.tideRange[c] || 0;
  W.tideWet[c] = elev < 0 ? 1 : 0;
  const near = elev > -0.06 && elev < 0.05 && range > 0.0025;
  W.intertidal[c] = near ? clamp(range * 50, 0, 1) : 0;
  if (near && W.moist) {
    W.moist[c] = Math.max(W.moist[c], 0.35 + W.intertidal[c] * 0.4);
  }
  if (near && range > 0.012 && Math.abs(elev) < 0.018) {
    W.intertidal[c] = Math.min(1, W.intertidal[c] + 0.3);
  }
  // Hours wet proxy (0–1) for inspect
  if (near) {
    W.tideWet[c] = clamp(0.5 - elev / Math.max(0.01, range), 0, 1);
  }
  return near;
}

/** UI / instrument readout. */
export function tideBudget(W) {
  const m = W.moon;
  if (!m || m.mass < 0.05) {
    return {
      amp: '—',
      meanRange: (W.meanTideRange || 0).toFixed(4),
      phase: W.tidePhase || 'solar-only',
      note: 'Solar tide only (~⅓ lunar range) · strip the Moon and the intertidal narrows',
      springsInDays: null,
      highInHours: null,
      illum: null,
    };
  }
  const phase = W.moonAngle || 0;
  const highInHours = ((Math.PI - (phase % Math.PI)) / Math.PI) * 12.4;
  const illum = W.moonIllum != null ? (W.moonIllum * 100).toFixed(0) + '%' : null;
  return {
    amp: ((0.018 * m.mass) / (m.distance ** 3)).toFixed(4),
    meanRange: (W.meanTideRange || 0).toFixed(4),
    phase: W.tidePhase || 'mean',
    springsInDays: W.springsInDays != null ? W.springsInDays.toFixed(1) : null,
    highInHours: highInHours.toFixed(1),
    illum,
    note: `Two-bulge · ${W.tidePhase || 'mean'} · intertidal ${((W.intertidalFrac || 0) * 100).toFixed(1)}% · moon ${illum || '—'} lit`,
  };
}

export const ROCHE_DISTANCE = 0.38;
