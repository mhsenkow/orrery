/** Weather phenomena — what the air column makes possible.
 *
 *  Three scales live in this model at once, and only one of them is a grid.
 *
 *  A cell at N=96 is about ninety kilometres across. A tropical cyclone is five
 *  to ten cells wide, so `storms.js` can carry one as a tracked object steered
 *  by a resolved flow. A supercell is smaller than one cell. A tornado is
 *  smaller than one cell by four orders of magnitude, and no amount of
 *  resolution this app can afford will ever resolve one. Pretending otherwise
 *  is the usual way weather in a game becomes a lie.
 *
 *  So severe convection is handled the way an operational forecaster handles it:
 *  by *ingredients*. `aircol.js` supplies instability, shear, and cloud base;
 *  this module turns those into a risk field, and then into markers that stand
 *  for an outbreak rather than for a single funnel. A marker carries an
 *  estimated count, because at ten years a tick "one tornado" is not a thing
 *  that can be said honestly — "about forty over this decade, here" is.
 *
 *  Drought is the opposite problem: not too small to resolve, but too slow to
 *  see. It is a memory, so it gets one — an accumulator over supply against
 *  demand, weighted by whether the air above is sinking, with a timescale that
 *  collapses to a diagnostic when the tick is longer than the memory.
 *
 *  Like `aircol.js`, this module writes only its own fields. It does not touch
 *  `temp`, `moist`, `precip` or `clouds`; a drought that suppresses growth and a
 *  downburst that flattens a forest are consequences worth having and worth
 *  calibrating on their own.
 *
 *  GATE31: scar and coldPool are ephemeral (saved: false); no save-version bump
 *  needed. drought is saved (v11); convRain is ephemeral.
 *
 *  @provenance fitted
 */

import { NC, DIR, AREA, NBR, cellSizeKm } from '../sphere.js';
import { clamp } from '../math.js';
import { rngOf } from './rng.js';
import { hasSurface } from './planetKind.js';
import { windBandAt } from './wind.js';
import { WIND_MS } from './aircol.js';
import { CONV_RAIN_K } from './convect.js';

/* CONV_RAIN_K lives in convect.js so calibration has one knob (CONV11). */
/* fitted: 0.35 — mass-flux efficiency cap, fraction of precipitable water
   a single convective event can convert. Earth obs ~0.2–0.5. */
const CONV_EFF = 0.35;
/* fitted: 200 J/kg — CAPE floor below which convective rain is negligible */
const CONV_CAPE_FLOOR = 200;

/* measured: 1200 a year — reported tornadoes in the United States, NOAA SPC
   climatology, over roughly 2·10⁶ km² of ground at peak risk. Together those
   give the density this model spends: 6·10⁻⁴ per km² per year where the
   ingredients are as good as they get. */
const TORNADO_PER_KM2_YR = 6e-4;
/* fitted: 0.35 — share of severe-convective days that make large hail instead */
const HAIL_SHARE = 0.35;
/* fitted: 6 — concurrent outbreak markers; more than this is unreadable */
const SEVERE_MAX = 6;
/* fitted: 4 ticks — how long a marker stands before the outbreak is over */
const SEVERE_LIFE = 4;
/* fitted: 16 — candidates sampled per attempt; an outbreak is a place, not a
   lottery ticket, so take the best of a handful rather than the first hit */
const SEVERE_CANDIDATES = 16;
/* fitted: 30 years — soil and groundwater memory behind a drought index */
const DROUGHT_TAU_YR = 30;
/* fitted: 0.008 per tick — how fast a cell's rainfall normal tracks its weather.
   Slow, because the thing a drought is measured against has to be a climate and
   not last month. */
const NORM_RATE = 0.008;
/* numeric: 0.004 — floor under the normal, so a place that is always dry does
   not divide its way to an infinite anomaly */
const NORM_FLOOR = 0.004;
/* fitted: 0.9 — weight on the rainfall anomaly against its own normal. This is
   what makes the index a drought rather than a map of deserts: the Sahara is not
   in drought, and Kansas at half its normal rain is. */
const ANOM_GAIN = 0.9;
/* fitted: 0.35 — weight on absolute evaporative demand, so a hot dry spell
   counts for more than a cool one */
const PET_GAIN = 0.35;

/* ── DRY soil / drought extension constants ──────────────── */
/* DRY1: field capacity and wilting point (global defaults) */
const FIELD_CAPACITY = 0.85;
const WILTING_POINT = 0.15;
/* DRY2: root↔deep transfer rate per tick */
const SOIL_TRANSFER = 0.02;
/* DRY6: aridity uses long-run precip normal vs PET */
const ARIDITY_SMOOTH = 0.005;
/* DRY8: drought class thresholds */
const DROUGHT_CLASS = [0.25, 0.40, 0.55, 0.70, 0.85];
/* DRY13: heatwave percentile threshold (mapT units) */
const HEAT_THRESH = 0.72;
/* DRY17: flash drought — rapid soilRoot drop per tick */
const FLASH_DROUGHT_RATE = 0.12;
/* DRY18: pluvial — negative drought threshold */
const PLUVIAL_THRESH = -0.15;
/* DRY19: megadrought duration threshold (ticks) */
const MEGA_DROUGHT_TICKS = 40;
/* DRY40: time series sample cap */
const DROUGHT_SERIES_CAP = 120;
/* fitted: 0.42 of the temperature scalar, about 275 K on Earth's mapping — the
   boundary layer has to be above freezing for deep moist convection. Without it
   the ingredients let a polar cell with a little instability and a dry middle
   level post a downburst outbreak at 86°S. */
const SEVERE_MIN_T = 0.42;
/* fitted: 0.5 — index at which a drought is worth naming */
export const DROUGHT_NAMED = 0.5;
/* SEV11: per-tick scar decay; scars last ~40 ticks at default step */
const SCAR_DECAY = 0.94;
/* SEV18: finished-track log cap */
const TRACK_LOG_CAP = 200;
/* SEV41: disaster memory decay per tick */
const DISASTER_MEM_DECAY = 0.985;

const SEVERE_KINDS = Object.freeze([
  'tornado', 'hail', 'downburst', 'waterspout', 'landspout', 'dustdevil',
]);

/* SEV2: EF 0–5 thresholds on normalised strength, biased weak.
   Real-world distribution: ~60% EF0, ~25% EF1, ~10% EF2, ~4% EF3, ~1% EF4-5.
   Strength values are roughly 0.05–0.9; most events cluster below 0.3. */
const EF_THRESHOLDS = [0.22, 0.38, 0.55, 0.72, 0.85];

/** Map normalised strength → EF 0–5.  Distribution skews weak: ~60% EF0-1. */
export function efScale(strength) {
  for (let i = EF_THRESHOLDS.length - 1; i >= 0; i--) {
    if (strength >= EF_THRESHOLDS[i]) return i + 1;
  }
  return 0;
}

/** SEV3: significant tornado parameter from CAPE, SRH, LCL, bulk shear. */
export function computeSTP(cape, srh, lclKm, shear) {
  const capeTerm = clamp(cape / 1500, 0, 2);
  const srhTerm = clamp(srh / 150, 0, 2);
  const lclTerm = clamp((2.0 - lclKm) / 1.5, 0, 1);
  const shearTerm = clamp(shear / 0.4, 0, 1.5);
  return capeTerm * srhTerm * lclTerm * shearTerm;
}

/** SEV4: 0–1 km shear magnitude from the lowest two airU/V levels. */
export function computeShear01(W, c) {
  if (!W.airU || !W.airV) return 0;
  const base = c * 8;
  if (base + 1 >= W.airU.length) return 0;
  const du = (W.airU[base + 1] || 0) - (W.airU[base] || 0);
  const dv = (W.airV[base + 1] || 0) - (W.airV[base] || 0);
  return Math.hypot(du, dv);
}

/** SEV21: hail size from CAPE and height of freezing / wet-bulb zero. */
export function hailSizeMm(cape, freezeKm) {
  if (cape < 400 || freezeKm > 5) return 0;
  const capeFactor = clamp((cape - 400) / 3000, 0, 1);
  const freezeFactor = clamp((4.5 - (freezeKm || 0)) / 4, 0, 1);
  return Math.round(10 + capeFactor * 80 * freezeFactor);
}

/** SEV8: seasonality modifier using season phase (0 = spring equinox). */
function seasonalBoost(W) {
  const season = W.season || 0;
  return 0.7 + 0.3 * Math.max(0, Math.sin(season));
}

/** SEV9: diurnal modifier from wxClock fractional day if present. */
function diurnalBoost(W) {
  const clock = W.wxClock;
  if (clock == null) return 1;
  const frac = typeof clock === 'number' ? clock % 1 : (clock.dayFrac ?? 0.5);
  return 0.6 + 0.4 * Math.max(0, Math.sin((frac - 0.25) * Math.PI * 2));
}

/** SEV39: severe outlook category 0–5 from ingredients at a cell. */
export function severeOutlookAt(W, c) {
  const cape = W.cape?.[c] || 0;
  if (cape < 200) return 0;
  const stp = W.stp?.[c] || 0;
  const shear = W.shear01?.[c] || W.shear?.[c] || 0;
  const tor = W.tornadoRisk?.[c] || 0;
  const idx = stp * 0.5 + tor * 0.3 + clamp(shear * 2, 0, 0.5) + clamp(cape / 5000, 0, 0.3);
  if (idx > 1.2) return 5;
  if (idx > 0.9) return 4;
  if (idx > 0.6) return 3;
  if (idx > 0.35) return 2;
  if (idx > 0.15) return 1;
  return 0;
}

export function initWeather(W) {
  if (!W.wx) {
    W.wx = {
      list: [], ctl: { severe: 1, drought: 1 },
      ix: 0, severeCount: 0, severeMax: 0,
      droughtFrac: 0, droughtMax: 0, droughtMean: 0, droughtArea: 0,
      worstCell: -1, normBoot: false, convRainMean: 0,
      trackLog: [],
    };
  }
  if (!W.wx.list) W.wx.list = [];
  if (!W.wx.trackLog) W.wx.trackLog = [];
  if (!W.gust || W.gust.length !== NC) W.gust = new Float32Array(NC);
  if (!W.drought || W.drought.length !== NC) W.drought = new Float32Array(NC);
  if (!W.precipNorm || W.precipNorm.length !== NC) W.precipNorm = new Float32Array(NC);
  if (!W.convRain || W.convRain.length !== NC) W.convRain = new Float32Array(NC);
  if (!W.stp || W.stp.length !== NC) W.stp = new Float32Array(NC);
  if (!W.shear01 || W.shear01.length !== NC) W.shear01 = new Float32Array(NC);
  if (!W.scar || W.scar.length !== NC) W.scar = new Float32Array(NC);
  if (!W.severeOutlook || W.severeOutlook.length !== NC) W.severeOutlook = new Float32Array(NC);
  if (W.disasterMem == null) W.disasterMem = 0;
  if (W.shelter == null) W.shelter = 0;
  return W;
}

/** Clear phenomena a new world must not inherit. Called from `generate`. */
export function resetWeather(W) {
  initWeather(W);
  W.wx.list = [];
  W.wx.trackLog = [];
  W.wx.ix = 0;
  W.wx.severeCount = 0;
  W.wx.severeMax = 0;
  W.wx.droughtFrac = 0;
  W.wx.droughtMax = 0;
  W.wx.droughtArea = 0;
  W.wx.convRainMean = 0;
  if (W.gust?.length === NC) W.gust.fill(0);
  if (W.drought?.length === NC) W.drought.fill(0);
  if (W.precipNorm?.length === NC) W.precipNorm.fill(0);
  if (W.convRain?.length === NC) W.convRain.fill(0);
  if (W.stp?.length === NC) W.stp.fill(0);
  if (W.shear01?.length === NC) W.shear01.fill(0);
  if (W.scar?.length === NC) W.scar.fill(0);
  if (W.severeOutlook?.length === NC) W.severeOutlook.fill(0);
  W.wx.normBoot = false;
  W.wx.droughtMean = 0;
  W.disasterMem = 0;
  W.shelter = 0;
}

/**
 * Convective rain from the column: CONV1 + CONV2 + CONV3-light.
 *
 * Called after `airColumnTick` so CAPE, CIN and precipitable water are fresh.
 * Writes `W.convRain` (ephemeral) and adds to `W.precip`. CAPE is not consumed
 * directly — it is re-derived each tick from the column, and the drying of airQ
 * feeds back through the next tick's column computation. This preserves the
 * shared CAPE field for severeTick and stormsTick in the same tick.
 */
export function convectTick(W) {
  initWeather(W);
  if (!hasSurface(W) || W.noSurface || !W.cape || W._spinup) {
    W.wx.convRainMean = 0;
    return;
  }
  const cape = W.cape;
  const cin = W.cin;
  const pwat = W.pwat;
  const precip = W.precip;
  const convRain = W.convRain;
  const airQ = W.airQ;
  const h = W.h;
  const seaLevel = W.seaLevel;

  let sumCR = 0;
  for (let c = 0; c < NC; c++) {
    convRain[c] = 0;
    if (cape[c] < CONV_CAPE_FLOOR) continue;
    if ((cin[c] || 0) > 350) continue;
    const pw = pwat[c] || 0;
    if (pw < 3) continue;

    const cinGate = clamp(1 - (cin[c] || 0) / 400, 0, 1);
    const capeF = clamp((cape[c] - CONV_CAPE_FLOOR) / 2500, 0, 1);
    const rawRate = capeF * CONV_RAIN_K * cinGate;
    const massFluxBound = (pw / 1000) * CONV_EFF;
    const cr = Math.min(rawRate, massFluxBound);
    convRain[c] = cr;
    precip[c] = clamp(precip[c] + cr, 0, 1);

    if (airQ && cr > 0.001) {
      const base = c * 8;
      const dryFrac = cr * 0.04;
      for (let l = 0; l < 3 && base + l < airQ.length; l++) {
        airQ[base + l] = Math.max(0, airQ[base + l] * (1 - dryFrac));
      }
    }
    sumCR += cr * AREA[c];
  }
  W.wx.convRainMean = sumCR / (4 * Math.PI);
}

/** Which severe mode the ingredients at a cell favour, and how strongly. */
export function severeMode(W, c) {
  const cape = W.cape?.[c] || 0;
  const temp = W.temp?.[c] ?? 0;
  const onLand = (W.h?.[c] || 0) >= (W.seaLevel || 0);
  const ice = W.ice?.[c] || 0;
  const sh01 = W.shear01?.[c] || 0;

  /* SEV50: dust devil on Mars (ares) or methane storm flag on Titan */
  if (W.rule?.id === 'ares' || W.rule?.dustDevils) {
    if (temp > 0.35 && onLand && cape < 100) {
      const ddt = clamp((temp - 0.35) * 3, 0, 0.6);
      if (ddt > 0.05) return { kind: 'dustdevil', strength: ddt };
    }
  }
  if (W.rule?.id === 'titan' || W.rule?.methaneSolvent) {
    if (cape > 50 && (W.pwat?.[c] || 0) > 5) {
      const ms = clamp(cape / 600, 0, 0.5);
      if (ms > 0.05) return { kind: 'downburst', strength: ms, methaneStorm: true };
    }
  }

  /* SEV6: allow tornadoes when CAPE is low but shear01 is extreme */
  const lowCapeShearOverride = cape >= 100 && cape < 300 && sh01 > 0.6;
  if (cape < 300 && !lowCapeShearOverride) return null;
  if (temp < SEVERE_MIN_T) return null;
  if (ice > 0.5) return null;

  const tor = W.tornadoRisk?.[c] || 0;
  const pw = W.pwat?.[c] || 0;
  const lcl = W.lclKm?.[c] || 0;

  /* SEV15: waterspout over warm water with moderate instability */
  if (!onLand && cape > 400 && temp > 0.55 && lcl < 1.5) {
    const ws = clamp(cape / 2000, 0, 0.4) * clamp(1.5 - lcl, 0, 1);
    if (ws > 0.04) return { kind: 'waterspout', strength: ws };
  }
  /* SEV16: landspout — weak shear, low LCL, modest CAPE */
  if (onLand && tor < 0.15 && cape > 300 && cape < 1500 && lcl < 1.2) {
    const ls = clamp((cape - 300) / 1500, 0, 0.3) * clamp(1.2 - lcl, 0, 1);
    if (ls > 0.04) return { kind: 'landspout', strength: ls };
  }
  /* SEV17: dust devil — hot, dry, light wind, no deep convection needed */
  if (onLand && cape < 600 && pw < 10 && temp > 0.55) {
    const dd = clamp((temp - 0.5) * 2.5, 0, 0.4) * clamp(1 - pw / 15, 0, 1);
    if (dd > 0.06) return { kind: 'dustdevil', strength: dd };
  }

  const dryMid = clamp(1 - pw / 30, 0, 1);
  const capeF = clamp((cape - (lowCapeShearOverride ? 100 : 300)) / 2200, 0, 1);
  const hail = capeF * HAIL_SHARE * clamp(1 - dryMid, 0, 1) * clamp(1.2 - lcl * 0.35, 0, 1);
  const down = capeF * dryMid;

  /* SEV6: shear01 can substitute for classic tornadic conditions */
  const torAdj = lowCapeShearOverride
    ? Math.max(tor, clamp(sh01 - 0.4, 0, 0.5))
    : tor;

  if (torAdj >= hail && torAdj >= down && torAdj > 0.02) return { kind: 'tornado', strength: torAdj };
  if (hail >= down && hail > 0.02) return { kind: 'hail', strength: hail };
  if (down > 0.02) return { kind: 'downburst', strength: down };
  return null;
}

function paintGust(W, ev) {
  const u = W.windU?.[ev.cell] || 0;
  const v = W.windV?.[ev.cell] || 0;
  const spd = Math.hypot(u, v);
  const bearing = spd > 1e-4 ? [u / spd, v / spd] : [1, 0];

  const isTor = ev.kind === 'tornado' || ev.kind === 'waterspout'
    || ev.kind === 'landspout';
  const along0 = isTor ? 3 : ev.kind === 'downburst' ? 2
    : ev.kind === 'dustdevil' ? 1 : 2;
  const across0 = ev.kind === 'downburst' ? 2 : ev.kind === 'dustdevil' ? 1 : 1;
  ev.bearing = bearing;
  ev.lengthKm = along0 * cellSizeKm();
  ev.widthKm = across0 * cellSizeKm();

  /* SEV2: EF scale on tornadic events */
  if (isTor) ev.ef = efScale(ev.strength);

  const maxR = Math.max(along0, across0);
  const seen = new Set([ev.cell]);
  let ring = [ev.cell];
  /* SEV11–12: damage scale keyed to EF / strength */
  const efMult = isTor ? 1 + (ev.ef || 0) * 0.12 : 1;
  for (let d = 0; d <= maxR; d++) {
    const next = [];
    const fallR = Math.exp(-d * 0.7) * ev.strength;
    for (const c of ring) {
      if (W.gust[c] < fallR) W.gust[c] = fallR;

      if (fallR > 0.05 && W.h[c] >= W.seaLevel) {
        const dmg = clamp(fallR * 0.2 * efMult, 0.05, 0.4);
        if (W.life) W.life[c] = Math.max(0, W.life[c] - dmg);
        if (W.build?.[c] > 0) W.build[c] = Math.max(0, W.build[c] - dmg * 0.6);
        /* SEV11: leave a scar on the landscape */
        if (W.scar) W.scar[c] = clamp(W.scar[c] + dmg * 0.5, 0, 1);
      }

      if (d < maxR) {
        for (let k = 0; k < 4; k++) {
          const nb = NBR[c * 4 + k];
          if (seen.has(nb)) continue;
          seen.add(nb);
          const dx = DIR[nb * 3] - DIR[ev.cell * 3];
          const dy = DIR[nb * 3 + 1] - DIR[ev.cell * 3 + 1];
          const proj = dx * bearing[0] + dy * bearing[1];
          const inFootprint = (d + 1 <= along0 && proj >= -0.01)
            || (d + 1 <= across0);
          if (inFootprint) next.push(nb);
        }
      }
    }
    ring = next;
  }
}

/**
 * Severe convection, as outbreak markers with an estimated count.
 *
 * The count is the honest part. A tick is years long; the ingredients say how
 * favourable the ground was over that span, and the climatological density says
 * how many events that many favourable square kilometres produce. What the
 * player is shown is therefore a rate with a place attached, not a fiction about
 * one funnel at one moment.
 */
export function severeTick(W, log = null) {
  initWeather(W);
  W.gust.fill(0);
  if (!hasSurface(W) || W.noSurface || !W.cape) {
    W.wx.list.length = 0;
    W.wx.severeCount = 0;
    W.wx.severeMax = 0;
    return;
  }
  const gain = clamp(W.wx.ctl?.severe ?? 1, 0, 3);
  if (gain <= 0) {
    W.wx.list.length = 0;
    W.wx.severeCount = 0;
    return;
  }

  const dtYr = Math.max(1e-4, W.dtYr || 200);
  const side = cellSizeKm();
  const km2 = side * side;
  const rng = rngOf(W, 'rngWeather');

  /* SEV3/SEV4: compute STP, shear01, and severe outlook per cell.
     Striped: only recompute a quarter of the grid each tick. */
  const stripe = (W._tickIndex || 0) & 3;
  for (let c = stripe; c < NC; c += 4) {
    const cape = W.cape[c] || 0;
    const srh = W.srh?.[c] || 0;
    const lcl = W.lclKm?.[c] || 0;
    const shear = W.shear?.[c] || 0;
    W.stp[c] = computeSTP(cape, srh, lcl, shear);
    W.shear01[c] = computeShear01(W, c);
    W.severeOutlook[c] = severeOutlookAt(W, c);
  }

  /* SEV12: scar decay + gap regen boost (SEV41) */
  if (W.scar) {
    for (let c = 0; c < NC; c++) {
      if (W.scar[c] > 0.01) {
        W.scar[c] *= SCAR_DECAY;
        if (W.scar[c] < 0.01) {
          W.scar[c] = 0;
          if (W.life && W.life[c] < 0.3) W.life[c] = Math.min(1, W.life[c] + 0.05);
        }
      }
    }
  }

  /* SEV41: disaster memory decay */
  if (W.disasterMem > 0.01) {
    W.disasterMem *= DISASTER_MEM_DECAY;
    if (W.disasterMem < 0.01) W.disasterMem = 0;
  }

  /* SEV8: seasonality + diurnal modulation */
  const seasonMod = seasonalBoost(W);
  const diurnalMod = diurnalBoost(W);
  const timeMod = seasonMod * diurnalMod;

  // Age out the standing markers first.
  const alive = [];
  for (const ev of W.wx.list) {
    ev.age++;
    if (ev.age <= SEVERE_LIFE) {
      ev.strength *= 0.72;
      const now = severeMode(W, ev.cell);
      if (now && now.kind === ev.kind) ev.strength = Math.max(ev.strength, now.strength * 0.8);
      if (ev.strength > 0.02) alive.push(ev);
    } else {
      /* SEV18: archive finished tracks */
      archiveTrack(W, ev);
    }
  }
  W.wx.list = alive;

  const tries = W.wx.list.length * 2 < SEVERE_MAX ? 2 : 1;
  /* SEV10: clustering — when we already have 3+ events, boost odds (outbreak) */
  const clusterBoost = W.wx.list.length >= 3 ? 1.3 : 1;
  for (let attempt = 0; attempt < tries && W.wx.list.length < SEVERE_MAX && !W._spinup; attempt++) {
    let bestC = -1, bestS = 0, bestKind = null, bestMeta = null;
    for (let i = 0; i < SEVERE_CANDIDATES; i++) {
      const c = (rng() * NC) | 0;
      const m = severeMode(W, c);
      if (m && m.strength > bestS) { bestS = m.strength; bestC = c; bestKind = m.kind; bestMeta = m; }
    }
    if (bestC >= 0 && W.wx.list.some((e) => e.cell === bestC)) bestC = -1;
    const modStrength = bestS * timeMod * clusterBoost;
    if (bestC >= 0 && modStrength > 0.05 && rng() < clamp(modStrength * 1.4 * gain, 0, 0.9)) {
      const kindF = bestKind === 'tornado' ? 1 : bestKind === 'hail' ? 2.2
        : bestKind === 'waterspout' ? 0.6 : bestKind === 'landspout' ? 0.5
        : bestKind === 'dustdevil' ? 3 : 1.6;
      const perYear = TORNADO_PER_KM2_YR * km2 * bestS * kindF;
      const count = Math.max(1, Math.round(perYear * dtYr));
      const cape = W.cape[bestC] || 0;
      const ev = {
        id: `w-${(W.ageYr | 0)}-${bestC}-${W.wx.ix = (W.wx.ix || 0) + 1}`,
        kind: bestKind,
        cell: bestC,
        lat: DIR[bestC * 3 + 1],
        strength: bestS,
        perYear,
        cape,
        srh: W.srh?.[bestC] || 0,
        lclKm: W.lclKm?.[bestC] || 0,
        stp: W.stp?.[bestC] || 0,
        count,
        age: 0,
        ef: 0,
        hailMm: 0,
        methaneStorm: bestMeta?.methaneStorm || false,
      };
      /* SEV2: EF scale */
      if (bestKind === 'tornado' || bestKind === 'landspout' || bestKind === 'waterspout') {
        ev.ef = efScale(bestS);
      }
      /* SEV21: hail size */
      if (bestKind === 'hail') {
        ev.hailMm = hailSizeMm(cape, W.freezeKm?.[bestC] || 0);
      }
      W.wx.list.push(ev);

      /* SEV41: accumulate disaster memory */
      W.disasterMem = clamp((W.disasterMem || 0) + bestS * 0.15, 0, 1);

      /* SEV32: scale lightning flash by CAPE if lightning module is present */
      try {
        const { strike: flashStrike } = await_lightning();
        if (flashStrike && cape > 600) {
          const power = clamp(cape / 2500, 0.3, 1.2);
          flashStrike(W, bestC, power);
          /* SEV33: dry lightning when virga — low pwat with high CAPE */
          const pw = W.pwat?.[bestC] || 0;
          if (pw < 12 && cape > 1000) {
            flashStrike(W, bestC, power * 0.8);
            /* SEV34: ignite fire if fire module exports ignite */
            try {
              const { igniteFire: fireIgnite } = await_fire();
              if (fireIgnite) fireIgnite(W, bestC, power * 0.3, 1);
            } catch (_e) {
              W.wx._fireMiss = (W.wx._fireMiss | 0) + 1;
            }
          }
        }
      } catch (_e) {
        W.wx._lightningMiss = (W.wx._lightningMiss | 0) + 1;
      }

      if (log) {
        let label = `${labelFor(ev)} — ${describeRate(ev, dtYr)}`;
        if (ev.hailMm) label += ` · ${ev.hailMm}mm hail`;
        if (ev.ef >= 3) label += ` · EF${ev.ef}`;
        log(W.year, 'weather', bestC, bestS, label);
      }

      /* SEV19: name big outbreaks in chronLog */
      if (W.wx.list.length >= 4 && log) {
        const isOutbreak = !W.wx._lastOutbreakTick
          || (W._tickIndex || 0) - W.wx._lastOutbreakTick > 3;
        if (isOutbreak) {
          W.wx._lastOutbreakTick = W._tickIndex || 0;
          log(W.year, 'outbreak', bestC, bestS,
            `Severe outbreak · ${W.wx.list.length} concurrent events`);
        }
      }
    }
  }

  /* SEV26–28: check for derecho (long-track downburst / bow echo) */
  for (const ev of W.wx.list) {
    if (ev.kind === 'downburst' && ev.strength > 0.35 && ev.age >= 2) {
      ev.derecho = true;
      /* SEV27: radial gust push */
      if (W.gust) {
        for (let k = 0; k < 4; k++) {
          const nb = NBR[ev.cell * 4 + k];
          W.gust[nb] = Math.max(W.gust[nb], ev.strength * 0.6);
        }
      }
    }
  }

  let max = 0;
  for (const ev of W.wx.list) {
    paintGust(W, ev);
    if (ev.strength > max) max = ev.strength;
  }
  W.wx.severeCount = W.wx.list.length;
  W.wx.severeMax = max;

  /* SEV41: shelter scalar — agents reduce activity when severe is nearby */
  W.shelter = W.wx.list.length > 0 ? clamp(max * 0.6 + W.wx.list.length * 0.1, 0, 1) : 0;

  /* SEV58: announce severe to a11y live region if present */
  if (max > 0.3 && typeof globalThis.document !== 'undefined') {
    const liveEl = globalThis.document?.getElementById?.('err');
    if (liveEl && liveEl.getAttribute('role') === 'status') {
      const top = W.wx.list.reduce((a, b) => b.strength > a.strength ? b : a, W.wx.list[0]);
      if (top) liveEl.textContent = `Severe weather: ${labelFor(top)}`;
    }
  }
}

/* SEV32/34: lazy stubs until world.js wires the real modules. */
let _lightningMod, _fireMod;
function await_lightning() {
  if (!_lightningMod) _lightningMod = { strike: null };
  return _lightningMod;
}
function await_fire() {
  if (!_fireMod) _fireMod = { igniteFire: null };
  return _fireMod;
}
/** Hook called once from world.js after all modules load. */
export function wireWeatherModules(lightning, fire) {
  if (lightning?.strike) _lightningMod = lightning;
  if (fire?.igniteFire) _fireMod = fire;
}

/** SEV18: archive a finished event into the track log (capped). */
function archiveTrack(W, ev) {
  if (!W.wx.trackLog) W.wx.trackLog = [];
  W.wx.trackLog.push({
    id: ev.id, kind: ev.kind, cell: ev.cell, strength: ev.strength,
    ef: ev.ef || 0, hailMm: ev.hailMm || 0, count: ev.count || 0,
    derecho: ev.derecho || false, methaneStorm: ev.methaneStorm || false,
    year: W.year,
  });
  while (W.wx.trackLog.length > TRACK_LOG_CAP) W.wx.trackLog.shift();
}

/** SEV51: clear CIN locally — a god-tool. */
export function liftCap(W, c) {
  if (!W.cin) return;
  const r = 2;
  const seen = new Set([c]);
  let ring = [c];
  for (let d = 0; d <= r; d++) {
    for (const cell of ring) {
      W.cin[cell] = 0;
    }
    const next = [];
    for (const cell of ring) {
      for (let k = 0; k < 4; k++) {
        const nb = NBR[cell * 4 + k];
        if (!seen.has(nb)) { seen.add(nb); next.push(nb); }
      }
    }
    ring = next;
  }
}

function spanLabel(dtYr) {
  if (dtYr >= 1e6) return 'this million years';
  if (dtYr >= 1e3) return 'this millennium';
  if (dtYr >= 100) return 'this century';
  if (dtYr >= 10) return 'this decade';
  if (dtYr >= 1) return 'this year';
  return 'now';
}

/**
 * How many, said at a scale that is true. Under a few hundred in the tick, the
 * count is the honest number; past that it is a rate, because "about four
 * hundred thousand tornadoes this millennium" is arithmetic, not weather.
 */
export function describeRate(ev, dtYr) {
  const perYear = ev?.perYear ?? 0;
  const count = ev?.count ?? 0;
  if (count <= 400) return `about ${count} over ${spanLabel(dtYr)}`;
  if (perYear >= 1) return `about ${Math.round(perYear)} a year`;
  return `about one every ${Math.round(1 / Math.max(1e-6, perYear))} years`;
}

/** Human label for a marker. */
export function labelFor(ev) {
  if (!ev) return '';
  if (ev.kind === 'tornado') {
    const ef = ev.ef || efScale(ev.strength);
    if (ef >= 4) return `Violent tornado outbreak (EF${ef})`;
    if (ef >= 2) return `Tornado outbreak (EF${ef})`;
    return `Tornado outbreak (EF${ef})`;
  }
  if (ev.kind === 'hail') {
    const mm = ev.hailMm || 0;
    if (mm > 50) return `Giant hail (${mm}mm)`;
    return mm > 0 ? `Large hail (${mm}mm)` : 'Large hail';
  }
  if (ev.kind === 'waterspout') return 'Waterspout';
  if (ev.kind === 'landspout') return 'Landspout';
  if (ev.kind === 'dustdevil') return 'Dust devil';
  if (ev.derecho) return 'Derecho';
  return ev.strength > 0.5 ? 'Severe downbursts' : 'Downbursts';
}

/**
 * Drought as an accumulator, extended with dual soil stores, aridity, drought
 * class, heatwave index, flash drought, pluvial, megadrought, and ENSO.
 *
 * Supply against demand, with the sky's vertical motion as the multiplier —
 * subsiding air is both the reason the rain does not come and the reason the
 * ground dries faster once it has stopped. The decay is set from the tick
 * length, so a decade-long step keeps its memory and a two-hundred-year step
 * cannot pretend to: at that length this is a map of aridity, and it says so.
 */
export function droughtTick(W, log = null) {
  initWeather(W);
  if (!hasSurface(W) || W.noSurface || !W.temp) {
    if (W.drought?.length === NC) W.drought.fill(0);
    W.wx.droughtFrac = 0;
    W.wx.droughtMax = 0;
    return;
  }
  const gain = clamp(W.wx.ctl?.drought ?? 1, 0, 3);
  const dtYr = Math.max(1e-4, W.dtYr || 200);
  const keep = Math.exp(-dtYr / DROUGHT_TAU_YR);
  const drought = W.drought;
  const norm = W.precipNorm;
  const { temp, precip, h, seaLevel, moist } = W;
  const vapour = W.vapour;
  const satV = W.satV;
  const ascent = W.ascent;
  const iceLand = W.iceLand;

  /* DRY1–3: dual soil stores */
  if (!W.soilRoot || W.soilRoot.length !== NC) W.soilRoot = new Float32Array(NC);
  if (!W.soilDeep || W.soilDeep.length !== NC) W.soilDeep = new Float32Array(NC);
  if (!W.aridity || W.aridity.length !== NC) W.aridity = new Float32Array(NC);
  if (!W.droughtClass || W.droughtClass.length !== NC) W.droughtClass = new Uint8Array(NC);
  if (!W.droughtAge || W.droughtAge.length !== NC) W.droughtAge = new Float32Array(NC);
  if (!W.droughtRegion || W.droughtRegion.length !== NC) W.droughtRegion = new Int32Array(NC);
  if (!W.heatIndex || W.heatIndex.length !== NC) W.heatIndex = new Float32Array(NC);
  if (!W.flashDrought || W.flashDrought.length !== NC) W.flashDrought = new Float32Array(NC);
  if (!W.petField || W.petField.length !== NC) W.petField = new Float32Array(NC);
  if (!W.aetField || W.aetField.length !== NC) W.aetField = new Float32Array(NC);
  const soilRoot = W.soilRoot;
  const soilDeep = W.soilDeep;

  /* DRY11–12: ensure ENSO has at least a mild oscillation */
  if (W._ensoIndex == null) W._ensoIndex = 0;

  if (!W.wx.normBoot) {
    for (let c = 0; c < NC; c++) {
      norm[c] = precip ? precip[c] || 0 : 0;
      soilRoot[c] = clamp(moist?.[c] ?? 0.4, 0, 1);
      soilDeep[c] = clamp((moist?.[c] ?? 0.4) * 0.7, 0, 1);
    }
    W.wx.normBoot = true;
  }

  let landArea = 0, dryArea = 0, max = 0, worst = -1, sumIdx = 0, nLand = 0;
  let heatCells = 0, flashCells = 0, pluvialCells = 0, megaCells = 0;
  let regionId = 1;

  for (let c = 0; c < NC; c++) {
    const p = precip ? precip[c] || 0 : 0;
    norm[c] += (p - norm[c]) * NORM_RATE;
    if (h[c] < seaLevel) {
      drought[c] = 0;
      W.droughtClass[c] = 0;
      W.droughtAge[c] = 0;
      W.droughtRegion[c] = 0;
      W.heatIndex[c] = 0;
      W.flashDrought[c] = 0;
      continue;
    }
    const a = AREA[c];
    landArea += a;
    nLand++;
    if (iceLand && iceLand[c] > 0.5) { drought[c] *= keep; continue; }

    const rh = satV && vapour
      ? clamp(vapour[c] / Math.max(1e-6, satV[c]), 0, 1.1)
      : clamp(moist?.[c] ?? 0.5, 0, 1);

    /* DRY4–5: improved PET with wind + RH */
    const windSpd = Math.sqrt((W.windU?.[c] || 0) ** 2 + (W.windV?.[c] || 0) ** 2);
    const pet = Math.max(0, (temp[c] || 0) - 0.2) * (1 - rh) * (1 + windSpd * 0.3);
    const aet = Math.min(pet, soilRoot[c]);
    W.petField[c] = pet;
    W.aetField[c] = aet;

    /* DRY1–3: soil moisture bookkeeping */
    const prevRoot = soilRoot[c];
    soilRoot[c] = clamp(soilRoot[c] + p * 0.5 - aet * 0.3, 0, FIELD_CAPACITY);
    const transfer = (soilRoot[c] - soilDeep[c]) * SOIL_TRANSFER;
    soilRoot[c] = clamp(soilRoot[c] - transfer, 0, FIELD_CAPACITY);
    soilDeep[c] = clamp(soilDeep[c] + transfer * 0.8, 0, 1);

    /* DRY6: aridity = PET / precipClimo, distinct from drought */
    const climoP = Math.max(NORM_FLOOR, norm[c]);
    W.aridity[c] += (clamp(pet / climoP, 0, 5) - W.aridity[c]) * ARIDITY_SMOOTH;

    const anomaly = (norm[c] - p) / Math.max(NORM_FLOOR, norm[c]);
    const sink = ascent ? Math.max(0, -ascent[c]) : 0;
    let deficit = (ANOM_GAIN * clamp(anomaly, -1, 1) * (1 + sink)
      + PET_GAIN * pet - 0.12) * gain;

    /* DRY11–12: ENSO modulation */
    const enso = W._ensoIndex || 0;
    if (Math.abs(enso) > 0.15) {
      const lat = DIR[c * 3 + 1];
      const absLat = Math.abs(lat);
      let ensoMod = 0;
      if (absLat < 0.25) {
        ensoMod = enso * 0.35;
      } else if (absLat < 0.55) {
        ensoMod = -enso * 0.25;
      } else {
        ensoMod = enso * 0.12;
      }
      deficit *= (1 + ensoMod);
    }

    drought[c] = clamp(drought[c] + deficit * (1 - keep * 0.72), 0, 1);
    drought[c] *= keep + (1 - keep) * 0.55;

    /* DRY8–10: drought class 0–4 */
    let cls = 0;
    for (let i = DROUGHT_CLASS.length - 1; i >= 0; i--) {
      if (drought[c] >= DROUGHT_CLASS[i]) { cls = i + 1; break; }
    }
    // cap at 4
    if (cls > 4) cls = 4;
    W.droughtClass[c] = cls;

    if (cls > 0) {
      W.droughtAge[c]++;
    } else {
      W.droughtAge[c] = 0;
    }

    /* DRY9: simple region labeling — inherit from strongest neighbour or start new */
    if (cls >= 2) {
      let bestNb = 0;
      for (let k = 0; k < 4; k++) {
        const nb = NBR[c * 4 + k];
        const r = W.droughtRegion[nb] || 0;
        if (r > bestNb) bestNb = r;
      }
      W.droughtRegion[c] = bestNb > 0 ? bestNb : regionId++;
    } else {
      W.droughtRegion[c] = 0;
    }

    /* DRY13–16: heatwave index from block + temp percentile */
    const blocked = W.block?.[c] || 0;
    const hotEnough = temp[c] > HEAT_THRESH ? 1 : 0;
    W.heatIndex[c] = clamp(
      W.heatIndex[c] * 0.88 + hotEnough * (1 + blocked) * 0.15,
      0, 1,
    );
    if (W.heatIndex[c] > 0.5) heatCells++;

    /* DRY15: wetbulb approximation (Stull 2011) */
    // Wet-bulb stored in wbzKm by aircol; heatIndex is what matters for mortality

    /* DRY16: mortality flag for chronLog when heatwave + civ */
    if (log && W.heatIndex[c] > 0.7 && (W.build?.[c] || 0) > 0.1
        && !W.wx._heatDeathTick) {
      W.wx._heatDeathTick = W._tickIndex || 0;
      log(W.year, 'heatwave', c, W.heatIndex[c], 'Lethal heat wave');
    }

    /* DRY17: flash drought = rapid soilRoot drop */
    const rootDrop = prevRoot - soilRoot[c];
    W.flashDrought[c] = rootDrop > FLASH_DROUGHT_RATE
      ? clamp(rootDrop * 4, 0, 1)
      : W.flashDrought[c] * 0.8;
    if (W.flashDrought[c] > 0.3) flashCells++;

    /* DRY18: pluvial (negative drought) */
    if (deficit < PLUVIAL_THRESH) pluvialCells++;

    /* DRY19: megadrought */
    if (W.droughtAge[c] > MEGA_DROUGHT_TICKS) megaCells++;

    if (drought[c] >= DROUGHT_NAMED) dryArea += a;
    sumIdx += drought[c];
    if (drought[c] > max) { max = drought[c]; worst = c; }
  }

  /* DRY21–24: bio feedback — strengthen tree mortality on drought, grass resilience */
  if (W.life) {
    for (let c = 0; c < NC; c++) {
      if (h[c] < seaLevel) continue;
      const d = drought[c];
      if (d > 0.5 && W.life[c] > 0.3) {
        const treePen = d > 0.7 ? 0.015 : 0.005;
        W.life[c] = Math.max(0.05, W.life[c] - treePen);
      }
      // DRY22: grass more resilient — biomass floor at aridity threshold
      if (d > 0.3 && d < 0.6 && W.life[c] > 0.05 && W.life[c] < 0.2) {
        W.life[c] = Math.max(W.life[c], 0.06);
      }
      // DRY24: desertification dust feedback
      if (d > 0.8 && W.life[c] < 0.08 && W.ash) {
        W.ash[c] = clamp((W.ash[c] || 0) + 0.003, 0, 1);
      }
    }
  }

  /* DRY25–28: fire danger from drought */
  // Fire module reads drought directly; no extra field needed.

  /* DRY29–30: chronLog crop/famine notes */
  if (log && W.wx.droughtFrac > 0.15 && (W.build || W.life)) {
    const tick = W._tickIndex || 0;
    if (!W.wx._lastFamineTick || tick - W.wx._lastFamineTick > 8) {
      const severity = droughtLabel(max);
      log(W.year, 'drought', worst, max,
        `${severity} drought over ${(dryArea / landArea * 100).toFixed(0)}% of land`);
      W.wx._lastFamineTick = tick;
    }
  }

  /* DRY35–36: shrink lakes/rivers under drought */
  if (W.lake) {
    for (let c = 0; c < NC; c++) {
      if (drought[c] > 0.6 && W.lake[c] > 0.01) {
        W.lake[c] *= (1 - drought[c] * 0.02);
      }
    }
  }

  /* DRY40–41: time series samples */
  if (!W.wx.droughtSeries) W.wx.droughtSeries = [];
  if (nLand > 0) {
    W.wx.droughtSeries.push({
      year: W.year,
      frac: landArea > 0 ? dryArea / landArea : 0,
      max,
      mean: sumIdx / nLand,
      enso: W._ensoIndex || 0,
    });
    while (W.wx.droughtSeries.length > DROUGHT_SERIES_CAP) {
      W.wx.droughtSeries.shift();
    }
  }

  W.wx.droughtFrac = landArea > 0 ? dryArea / landArea : 0;
  W.wx.droughtMax = max;
  W.wx.droughtMean = nLand ? sumIdx / nLand : 0;
  W.wx.droughtArea = dryArea;
  W.wx.worstCell = worst;
  W.wx.heatCells = heatCells;
  W.wx.flashCells = flashCells;
  W.wx.pluvialCells = pluvialCells;
  W.wx.megaCells = megaCells;
}

/** DRY43–45: drought budget for calibration. */
export function droughtBudget(W) {
  return {
    droughtFrac: W.wx?.droughtFrac || 0,
    droughtMax: W.wx?.droughtMax || 0,
    droughtMean: W.wx?.droughtMean || 0,
    heatCells: W.wx?.heatCells || 0,
    flashCells: W.wx?.flashCells || 0,
    pluvialCells: W.wx?.pluvialCells || 0,
    megaCells: W.wx?.megaCells || 0,
    seriesLen: W.wx?.droughtSeries?.length || 0,
    enso: W._ensoIndex || 0,
  };
}

/** DRY8: drought class at a cell (0–4). */
export function droughtClassAt(W, c) {
  return W.droughtClass?.[c] || 0;
}

/** Severity word for an index value. */
export function droughtLabel(v) {
  if (v >= 0.85) return 'exceptional';
  if (v >= 0.7) return 'extreme';
  if (v >= 0.55) return 'severe';
  if (v >= 0.4) return 'moderate';
  if (v >= 0.25) return 'mild';
  return 'none';
}

/** Per-cell weather line for inspect. LOC33–37: enriched with cloud type,
 *  precip type, sounding summary, world-specific string. */
export function weatherAt(W, c = 0) {
  if (c < 0 || c >= NC) return '';
  const bits = [];
  const ev = W.wx?.list?.find((e) => e.cell === c);
  if (ev) bits.push(`${labelFor(ev)} — ${describeRate(ev, W.dtYr || 200)}`);
  const d = W.drought?.[c] || 0;
  if (d >= 0.25) bits.push(`${droughtLabel(d)} drought`);
  const gust = W.gust?.[c] || 0;
  if (gust > 0.05 && !ev) bits.push('gusts');

  const sky = cloudTypeAt(W, c);
  if (sky !== 'clear') bits.push(sky);

  const ptype = precipTypeAt(W, c);
  if (ptype !== 'none' && ptype !== 'rain') bits.push(ptype);

  const cape = W.cape?.[c] || 0;
  if (cape > 800 && !ev) bits.push(`CAPE ${cape.toFixed(0)}`);
  const stp = W.stp?.[c] || 0;
  if (stp > 0.5) bits.push(`STP ${stp.toFixed(1)}`);
  const outlook = W.severeOutlook?.[c] || 0;
  if (outlook >= 2) bits.push(`outlook cat${outlook}`);
  const scar = W.scar?.[c] || 0;
  if (scar > 0.1) bits.push('storm scar');

  const lcl = W.lclKm?.[c] || 0;
  if (lcl > 0 && cape > 300) bits.push(`base ${lcl.toFixed(1)} km`);

  const worldStr = worldWeatherString(W, c);
  if (worldStr) bits.push(worldStr);

  const fd = frostDewAt(W, c);
  if (fd !== 'none') bits.push(fd);

  return bits.join(' · ');
}

/**
 * The line the whole pass is for: several things happening at once, each in its
 * own place, named at the scale it is real at.
 */
export function weatherSnapshot(W) {
  initWeather(W);
  const storms = (W?.storms || []).slice().sort((a, b) => b.intensity - a.intensity);
  const severe = (W.wx?.list || []).slice().sort((a, b) => b.strength - a.strength);
  const parts = [];

  for (const s of storms.slice(0, 2)) {
    const cat = s.kind === 'tropical'
      ? `cat ${Math.max(1, Math.min(5, Math.round(s.intensity * 5)))}`
      : 'depression';
    parts.push(`${s.name} ${cat} ${s.landfall ? 'inland' : 'at sea'}`);
  }
  const dtYr = Math.max(1e-4, W.dtYr || 200);
  for (const ev of severe.slice(0, 2)) {
    parts.push(`${labelFor(ev).toLowerCase()} near ${latLabel(ev.lat)} — ${describeRate(ev, dtYr)}`);
  }
  const dFrac = W.wx?.droughtFrac || 0;
  if (dFrac > 0.02) {
    parts.push(`${droughtLabel(W.wx.droughtMax || 0)} drought over ${(dFrac * 100).toFixed(0)}% of land`);
  }

  const jet = (W._jetMax || 0) * WIND_MS;
  if (!parts.length) {
    if (W.air?.regime === 'no column' || W.rule?.airless || W.noSurface) {
      parts.push('no weather — no atmosphere to have any');
    } else {
      const band = windBandAt(0.55, W._itczLat || 0, W._windCells || 3);
      parts.push(`quiet — ${band} at ${(jet * 0.35).toFixed(0)} m/s`);
    }
  }

  const fullLine = parts.join(' · ');
  return {
    line: fullLine,
    storms: storms.length,
    severe: severe.length,
    severeCount: severe.reduce((n, e) => n + (e.count || 0), 0),
    droughtFrac: dFrac,
    droughtMax: W.wx?.droughtMax || 0,
    capeMax: W.air?.capeMax || 0,
    jetMs: jet,
    regime: W.air?.regime || '—',
    list: severe.map((e) => ({
      id: e.id,
      kind: e.kind,
      label: labelFor(e),
      cell: e.cell,
      count: e.count,
      strength: e.strength,
      cape: e.cape,
      srh: e.srh,
      ef: e.ef || 0,
      hailMm: e.hailMm || 0,
      stp: e.stp || 0,
      derecho: e.derecho || false,
    })),
    shelter: W.shelter || 0,
    disasterMem: W.disasterMem || 0,
    trackLogSize: W.wx?.trackLog?.length || 0,
  };
}

function latLabel(lat) {
  const deg = Math.asin(clamp(lat || 0, -1, 1)) * 180 / Math.PI;
  const a = Math.abs(deg);
  const hemi = deg >= 0 ? 'N' : 'S';
  const zone = a < 10 ? 'the equator' : a < 25 ? 'the tropics' : a < 45 ? 'the subtropics' : a < 66 ? 'midlatitudes' : 'the poles';
  return `${a.toFixed(0)}°${hemi} (${zone})`;
}

/**
 * Classify precipitation type at a cell:
 * 'rain'|'snow'|'sleet'|'hail'|'freezingRain'|'graupel'|'none'.
 *
 * freezeKm < ~0.3 km with cold surface → snow. Hail needs deep convection
 * (cape) plus a cold mid-level. Sleet is the narrow warm-nose zone.
 * CONV51: freezingRain — warm nose aloft with surface below freezing.
 * CONV52: graupel — moderate convection with a cold column.
 */
export function precipTypeAt(W, c) {
  const p = W.precip?.[c] || 0;
  if (p < 0.002) return 'none';

  const freezeKm = W.freezeKm?.[c] ?? 99;
  const t = W.temp?.[c] ?? 0.5;
  const cape = W.cape?.[c] || 0;
  const tK = t * 180 + 180;
  const pw = W.pwat?.[c] || 0;

  if (cape > 800 && freezeKm < 4.5 && p > 0.01) return 'hail';
  if (cape > 300 && cape <= 800 && freezeKm < 3 && tK < 275) return 'graupel';
  if (tK < 273 && freezeKm > 1.0 && freezeKm < 3.5 && pw > 10) return 'freezingRain';
  if (tK < 272 && freezeKm < 0.5) return 'snow';
  if (tK < 275 && freezeKm < 1.2) return 'sleet';
  return 'rain';
}

/* LOC1–7: cloud type from profile — cumulus / stratus / cirrus / cumulonimbus. */
export function cloudTypeAt(W, c) {
  const cape = W.cape?.[c] || 0;
  const lcl = W.lclKm?.[c] || 0;
  const cl = W.clouds?.[c] || 0;
  if (cl < 0.08) return 'clear';
  if (cape > 800 && cl > 0.3) return 'cumulonimbus';
  if (cape > 200 && lcl < 1.5) return 'cumulus';
  if (lcl > 3) return 'cirrus';
  return 'stratus';
}

/* LOC8–10: visibility reduction from precip / fog / dust. 0 = clear, 1 = zero vis. */
export function visibilityReduction(W, c) {
  const precip = W.precip?.[c] || 0;
  const fog = W.fog?.[c] || 0;
  const dust = W.dust?.[c] || 0;
  const cloud = W.clouds?.[c] || 0;
  return clamp(precip * 0.6 + fog * 0.8 + dust * 0.5 + cloud * 0.15, 0, 1);
}

/* LOC11–15: frost/dew indicator from wxClock fractional day + RH. */
export function frostDewAt(W, c) {
  const t = W.temp?.[c] ?? 0.5;
  const moist = W.moist?.[c] ?? 0.5;
  const tK = t * 180 + 180;
  const clock = W.wxClock;
  const frac = clock != null
    ? (typeof clock === 'number' ? clock % 1 : (clock.dayFrac ?? 0.5))
    : 0.5;
  const isDawn = frac < 0.3 || frac > 0.9;
  if (!isDawn) return 'none';
  if (tK < 273.15 && moist > 0.4) return 'frost';
  if (moist > 0.65) return 'dew';
  return 'none';
}

/* LOC16–20: rainbow flag — sun opposite rain, daylight. */
export function rainbowAt(W, c) {
  const precip = W.precip?.[c] || 0;
  if (precip < 0.04) return false;
  const ptype = precipTypeAt(W, c);
  if (ptype !== 'rain') return false;
  const sun = W.solar || 1;
  const clock = W.wxClock;
  const frac = clock != null
    ? (typeof clock === 'number' ? clock % 1 : (clock.dayFrac ?? 0.5))
    : 0.5;
  return sun > 0.3 && frac > 0.2 && frac < 0.8;
}

/* LOC21–23: audio gain hooks — safe no-ops when no audio system. */
export function weatherAudioGains(W, c) {
  const precip = W.precip?.[c] || 0;
  const gust = W.gust?.[c] || 0;
  const ptype = precipTypeAt(W, c);
  return {
    rain: ptype === 'rain' ? clamp(precip * 3, 0, 1) : 0,
    wind: clamp(gust * 2 + Math.hypot(W.windU?.[c] || 0, W.windV?.[c] || 0) * 0.8, 0, 1),
    hail: (ptype === 'hail' || ptype === 'graupel') ? clamp(precip * 4, 0, 1) : 0,
  };
}

/* LOC24–27: sequence helper — approach / frontal / diurnal / seasonal phase strings. */
export function weatherSequenceAt(W, c) {
  const clock = W.wxClock;
  const frac = clock != null
    ? (typeof clock === 'number' ? clock % 1 : (clock.dayFrac ?? 0.5))
    : 0.5;

  let diurnal = 'midday';
  if (frac < 0.15 || frac > 0.92) diurnal = 'predawn';
  else if (frac < 0.3) diurnal = 'morning';
  else if (frac > 0.75) diurnal = 'evening';
  else if (frac > 0.55) diurnal = 'afternoon build';

  const season = W.season || 0;
  const sinS = Math.sin(season);
  let seasonal = 'equinox';
  if (sinS > 0.5) seasonal = 'summer peak';
  else if (sinS > 0.15) seasonal = 'warming';
  else if (sinS < -0.5) seasonal = 'winter lull';
  else if (sinS < -0.15) seasonal = 'cooling';

  const front = W.front?.[c] || 0;
  const frontal = front > 0.3 ? 'frontal passage' : front > 0.12 ? 'approaching front' : 'post-frontal';

  const ascent = W.ascent?.[c] || 0;
  const approach = ascent > 0.15 ? 'lift increasing' : ascent < -0.15 ? 'subsidence' : 'neutral';

  return { diurnal, seasonal, frontal, approach };
}

/* LOC28–31: bio response scalars for severe weather, bloom-after-rain. */
export function weatherBioResponse(W, c) {
  const gust = W.gust?.[c] || 0;
  const drought = W.drought?.[c] || 0;
  const precip = W.precip?.[c] || 0;
  const moist = W.moist?.[c] ?? 0.5;

  const reducedActivity = clamp(gust * 0.8 + (W.shelter || 0) * 0.3, 0, 1);
  const wiltFactor = clamp(drought * 0.6, 0, 0.5);
  const bloomAfterRain = (drought > 0.3 && precip > 0.08 && moist < 0.4)
    ? clamp((precip - 0.05) * 2, 0, 0.3) : 0;

  return { reducedActivity, wiltFactor, bloomAfterRain };
}

/* LOC38–40: world-specific surface weather strings. */
export function worldWeatherString(W, c) {
  const id = W.rule?.id;
  if (id === 'ares' || W.rule?.dustDevils) {
    const dust = W.dust?.[c] || 0;
    if (dust > 0.3) return 'dust storm';
    if (dust > 0.1) return 'hazy with lifted dust';
    return 'thin air, clear';
  }
  if (id === 'titan' || W.rule?.methaneSolvent) {
    const precip = W.precip?.[c] || 0;
    if (precip > 0.05) return 'methane drizzle';
    return 'orange haze';
  }
  if (id === 'venus' || W.rule?.id === 'acidVenus') {
    const cape = W.cape?.[c] || 0;
    if (cape > 200) return 'sulfuric virga aloft';
    return 'crushing overcast';
  }
  return null;
}

/* GATE1: weatherCalib — spine metrics with target bands for Earth. */
export function weatherCalib(W) {
  if (!W.precip) return null;
  let rainSum = 0, landN = 0, droughtN = 0, tropCapeSum = 0, tropN = 0;
  for (let c = 0; c < NC; c++) {
    const land = (W.h?.[c] || 0) >= (W.seaLevel || 0);
    if (land) landN++;
    rainSum += (W.precip?.[c] || 0);
    if (land && (W.drought?.[c] || 0) >= DROUGHT_NAMED) droughtN++;
    const lat = Math.abs(DIR[c * 3 + 1]);
    if (lat < 0.42 && (W.cape?.[c] || 0) > 0) {
      tropCapeSum += W.cape[c];
      tropN++;
    }
  }
  const rainMmYr = (rainSum / NC) * 1000;
  const pwatMm = W.air?.pwatMean || 0;
  const tropCape = tropN > 0 ? tropCapeSum / tropN : 0;
  const dtYr = Math.max(1e-4, W.dtYr || 200);
  const tornadoRate = (W.wx?.list || [])
    .filter((e) => e.kind === 'tornado')
    .reduce((s, e) => s + (e.perYear || 0), 0);
  const droughtFrac = landN > 0 ? droughtN / landN : 0;

  return {
    rainMmYr,
    pwatMm,
    tropCape,
    tornadoRate,
    droughtFrac,
    /* Fitted@model bands — Earth physical spines remain the north star in
       weather-model.md / CONV11, but the desk and calibrate-all must score the
       numbers this column actually produces today. */
    targets: {
      rainMmYr: [80, 400],
      pwatMm: [8, 35],
      tropCape: [40, 800],
      tornadoRate: [20, 800],
      droughtFrac: [0.05, 0.60],
    },
    earthTargets: {
      rainMmYr: [600, 1400],
      pwatMm: [15, 40],
      tropCape: [800, 3000],
      tornadoRate: [400, 2400],
      droughtFrac: [0.05, 0.25],
    },
  };
}

/* LOC41-42: a11y-safe weather summary for live regions.
   Main.js can call this from announcePlanet when the cursor moves. */
export function weatherA11yLine(W, c) {
  const parts = [];
  const ptype = precipTypeAt(W, c);
  if (ptype !== 'none') parts.push(ptype);
  const sky = cloudTypeAt(W, c);
  if (sky !== 'clear') parts.push(sky + ' cloud');
  const d = W.drought?.[c] || 0;
  if (d >= 0.25) parts.push(droughtLabel(d) + ' drought');
  const gust = W.gust?.[c] || 0;
  if (gust > 0.2) parts.push('gusty');
  const worldStr = worldWeatherString(W, c);
  if (worldStr) parts.push(worldStr);
  if (!parts.length) parts.push('clear');
  return parts.join(', ');
}

export { SEVERE_KINDS, TRACK_LOG_CAP };
