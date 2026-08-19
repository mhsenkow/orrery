/** Atmosphere: gases, greenhouse, circulation, clouds, dust, seasons. */

import { clamp, lerp } from '../math.js';
import { NC, NBR, DIR, AREA, N as SIM_N } from '../sphere.js';
import { greenhouseFromGases, totalPressure } from '../rulesets.js';
import { circumbinaryBeat } from './exophysics.js';
import { neighbourEN, neighbourMean } from './vecop.js';
import { groundAlbedo, thermalInertiaAt, livePressureBar } from './substrateField.js';

/**
 * Daily-mean TOA cosine factor. `sLat` and `sDec` are sin(φ) and sin(δ).
 * Polar night is 0; polar day is sin φ sin δ. Equator, equinox is 1/π.
 */
export function dailyMeanMu(sLat, sDec) {
  const cLat = Math.sqrt(Math.max(0, 1 - sLat * sLat));
  const cDec = Math.sqrt(Math.max(0, 1 - sDec * sDec));
  const x = -sLat * sDec / Math.max(1e-8, cLat * cDec);
  if (x >= 1) return 0;
  if (x <= -1) return Math.max(0, sLat * sDec);
  const H0 = Math.acos(clamp(x, -1, 1));
  return Math.max(0, (H0 * sLat * sDec + cLat * cDec * Math.sin(H0)) / Math.PI);
}

/** Geometric insolation (season × day) before solar constant and greenhouse extras.
 *  Unlocked: daily-mean declination envelope × local sun angle.
 *  Locked: substellar cosine only — no zonal bands. fitted equator ≈ old 0.55. */
export function geometricInsolation(W, c, sunDir) {
  const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
  const obl = W.obliquity || 0;
  const season = W.season || 0;
  const mu = x * sunDir[0] + y * sunDir[1] + z * sunDir[2];
  const day = Math.max(0, mu);
  const Pbar = livePressureBar(W);
  const atm = Pbar != null
    ? Math.min(1, Math.log10(Pbar + 1) / 2)
    : Math.min(1, totalPressure(W.gases || {}, W.rule));
  if (W.rule?.tidallyLocked) {
    const e = W.eccentricity || W.rule?.eccentricity || 0;
    const lib = e * Math.sin(season) * 0.35;
    const sub = Math.max(0, mu + lib);
    const redist = W.rule.redistribution ?? (atm > 0.3 ? 0.45 : 0.05);
    return lerp(sub, 0.5, redist);
  }
  const dec = Math.sin(obl) * Math.sin(season);
  // fitted: dailyMeanMu(0,0)=1/π → 0.08 + 1.48/π ≈ 0.55, matching the old equator.
  const seasonal = 0.08 + dailyMeanMu(y, dec) * 1.48;
  let diurnal = lerp(0.5 + 0.5 * day, day, 1 - atm * 0.85);
  if (W.rule && !W.rule.earthLike) {
    const I = thermalInertiaAt(W, c);
    const k = Math.sqrt(Math.max(50, I) / 1200);
    diurnal = lerp(0.5, diurnal, clamp(1 / k, 0.25, 1.55));
  }
  return seasonal * (0.35 + 0.65 * diurnal);
}

/**
 * Insolation with obliquity (seasons) + diurnal term from sun angle.
 * sunPhase in radians: orbital day angle for terminator.
 */
export function insolation(W, c, sunDir) {
  const heating = W.rule?.star?.heating;
  let extra = 1;
  if (heating === 'particle') extra = 0.4; // pulsar wind — albedo-irrelevant floor
  if (heating === 'none' || W.rule?.freeFloater) extra = 0;
  const intern = 1 + (W.rule?.internalHeat || 0);
  const tidal = 1 + Math.min(2, (W.rule?.tidalHeat || 0) * 0.4);
  let beat = 1;
  if (W.rule?.binaryBeat) {
    const b = W.rule.binaryBeat;
    beat = circumbinaryBeat(b.L1, b.L2, b.Pbin, W.rule.orbitalPeriodDays, (W.ageYr || 0) * 365.25);
  }
  if (heating === 'none') return (W.rule?.tidalHeat || 0) * 0.05;
  return W.solar * (W._solarMod || 1) * geometricInsolation(W, c, sunDir) * extra * intern * tidal * beat;
}

/** Advect a scalar by a geographic (east, north) velocity pair.
 *  Flux-form, area-weighted: mass `field * AREA` is conserved to the limiter. */
const _flux = [0, 0, 0, 0];

export function advectField(field, uArr, vArr, scratch, rate) {
  scratch.fill(0);
  const flux = _flux;
  for (let c = 0; c < NC; c++) {
    const u = uArr[c] || 0, v = vArr[c] || 0;
    if (u * u + v * v < 1e-12) continue;
    const ac = AREA[c] || 1;
    const mass = field[c] * ac;
    if (!(mass > 0)) continue;
    let out = 0;
    flux[0] = flux[1] = flux[2] = flux[3] = 0;
    for (let k = 0; k < 4; k++) {
      const en = neighbourEN(c, k);
      const e = en.e, n = en.n;
      const chord = Math.hypot(e, n) || 1e-6;
      const along = (u * e + v * n) / chord;
      if (along <= 0) continue;
      const f = Math.min(0.22, rate * along);
      flux[k] = f;
      out += f;
    }
    if (out <= 0) continue;
    const scale = out > 0.45 ? 0.45 / out : 1;
    for (let k = 0; k < 4; k++) {
      if (flux[k] <= 0) continue;
      const amt = mass * flux[k] * scale;
      scratch[c] -= amt;
      scratch[NBR[c * 4 + k]] += amt;
    }
  }
  for (let c = 0; c < NC; c++) field[c] += scratch[c] / (AREA[c] || 1);
}

/** Advect a scalar field by wind (upwind, geographic frame). */
export function advect(field, W, rate) {
  advectField(field, W.windU, W.windV, W._adv, rate);
}

export function cloudsTick(W) {
  const { clouds, moist, temp, precip, ash, gases } = W;
  const earth = !!W.rule.earthLike && !W.rule.deepTime;
  const formScale = earth ? 0.62 : 1;
  const retain = earth ? 0.76 : 0.82;
  const ashCloud = earth ? 0.08 : 0.2;
  const vap = W.vapour;
  const h2o = gases.H2O || 0.01;
  for (let c = 0; c < NC; c++) {
    const conv = W.converg?.[c] || 0;
    const localV = vap?.[c] ?? moist[c];
    const sat = h2o * Math.exp((temp[c] - 0.5) * 1.8);
    const rh = localV / Math.max(1e-5, sat);
    let form = clamp(rh - 0.4, 0, 1) * 0.72 + precip[c] * 0.28;
    form += Math.max(0, conv) * 0.55;
    form *= 1 - clamp(-conv, 0, 1) * (earth ? 0.7 : 0.5);
    const wind = Math.hypot(W.windU?.[c] || 0, W.windV?.[c] || 0);
    form += localV * wind * 0.18;
    form += (W.front?.[c] || 0) * 0.32;
    if (W.h[c] < W.seaLevel && temp[c] < 0.48 && conv < 0 && rh > 0.5) {
      form += 0.12;
    }
    form *= formScale;
    clouds[c] = clamp(clouds[c] * retain + form * 0.55 + ash[c] * ashCloud, 0, 1);
    if (clouds[c] > 0.55 && conv > 0.15) {
      W.precip[c] = Math.max(W.precip[c] || 0, clouds[c] * 0.45);
    }
  }
  // Global dust lofting (Ares signature)
  if (W.rule.signature === 'dust') {
    let loft = 0;
    for (let c = 0; c < NC; c++) {
      if (W.h[c] >= W.seaLevel && Math.abs(W.windU[c]) > 0.55 && moist[c] < 0.15) {
        loft += AREA[c] * 0.00008;
        W.dust[c] = clamp(W.dust[c] + 0.02, 0, 1);
      } else W.dust[c] *= 0.985;
    }
    gases.dust = clamp(gases.dust + loft - 0.002, 0, 0.35);
    if (gases.dust > 0.12) {
      for (let c = 0; c < NC; c++) W.dust[c] = Math.max(W.dust[c], gases.dust * 0.8);
    }
  } else {
    gases.dust *= 0.995;
    for (let c = 0; c < NC; c++) W.dust[c] *= 0.99;
  }
  // Stratospheric sulphate clears in years–decades; tick decay was too slow
  // vs eruption recharge, so Earth locked into aerosol winter.
  gases.sulphate *= W.rule.earthLike ? 0.96 : 0.992;
}

/** Non-field atmosphere bookkeeping (ozone, escape, Milankovitch). */
export function atmoMetaTick(W) {
  const R = W.rule;
  const gases = W.gases;
  if (R.gravity < 0.5 || R.magnetosphere < 0.2) {
    const leak = (1 - R.magnetosphere) * (1.2 - R.gravity) * 0.00002;
    gases.H2O = Math.max(0, gases.H2O - leak * 2);
    gases.N2 = Math.max(0, gases.N2 - leak * 0.5);
    gases.O2 = Math.max(0, gases.O2 - leak);
  }
  W.ozone = clamp(gases.O2 * 2.5, 0, 1);
  // Season is advanced in simTick (phenology); only orbital wobble here
  W.obliquity = (W._baseObliquity ?? R.obliquity) * (1 + 0.04 * Math.sin(W.year * 0.00002));
  if (W._baseSolar == null) W._baseSolar = W.solar;
  // Elliptical insolation: F ∝ 1/r² with r/a = (1−e²)/(1+e cos ν).
  // Old form `1 + e cos ν` goes negative for e > 1 and understates HD 80606 b.
  {
    const e = Math.min(0.99, Math.max(0, R.eccentricity || 0));
    const nu = W.season || 0;
    const roa = (1 - e * e) / Math.max(0.02, 1 + e * Math.cos(nu));
    W._solarMod = 1 / (roa * roa);
  }
  W.greenhouse = greenhouseFromGases(gases, R, livePressureBar(W));
}

export function atmoTick(W, sunDir) {
  const R = W.rule;
  const { temp, moist, ice, clouds, h, seaLevel, gases, _t, ash } = W;
  const Plive = livePressureBar(W);
  const gh = greenhouseFromGases(gases, R, Plive);
  W.greenhouse = gh;
  // Winds come from geostrophicWind / SWE (called before this tick).

  const lapse = 0.45 * R.gravity;
  const Ptot = totalPressure(gases, R);

  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const cloudAlb = R.earthLike && !R.deepTime ? 0.2 : 0.28;
    const iceAlb = W._spinup ? 0 : ice[c];
    const ground = groundAlbedo(W, c, isSea);
    const alb = R.earthLike
      ? clamp(
        iceAlb * 0.42 +
        clouds[c] * cloudAlb +
        W.dust[c] * 0.22 +
        ground,
        0, 0.85)
      : clamp(
        iceAlb * 0.55 +
        clouds[c] * cloudAlb +
        W.dust[c] * 0.22 +
        ground * (1 - iceAlb * 0.7),
        0, 0.92);
    const insol = insolation(W, c, sunDir);
    const above = Math.max(0, h[c] - seaLevel);
    const polarCool = (R.earthLike && !R.deepTime)
      ? clamp(0.18 - insol, 0, 0.12) * 0.28
      : 0;
    const eq = insol * (1 - alb) * 0.95 + gh * 1.4 - above * lapse * 0.35 + 0.12 - polarCool;
    const c4 = c * 4;
    const dT = neighbourMean(temp, c) - temp[c];
    let maritime = isSea ? 1 : 0;
    if (!isSea) {
      for (let k = 0; k < 4; k++) if (h[NBR[c4 + k]] < seaLevel) maritime += 0.2;
    }
    const inland = isSea ? 0 : clamp((W.cont?.[c] || 0) / 1400, 0, 1);
    const thermalMass = (isSea ? 0.032 : lerp(0.16, 0.09, clamp(maritime, 0, 1)) * (1 + inland * 0.35))
      * (Plive != null ? clamp(0.4 + Math.log10((Plive || 1) + 0.01) * 0.35, 0.08, 2.5) : 1)
      * (R.earthLike ? 1 : clamp(1200 / Math.max(50, thermalInertiaAt(W, c)), 0.22, 2.4));
    const mix0 = (R.earthLike && !R.deepTime) ? 0.11 : 0.18;
    const mix = mix0 * Math.min(2.5, Math.max(1, SIM_N / 64));
    let t = temp[c] + (eq - temp[c]) * thermalMass + dT * mix;
    if (R.airless || Ptot < 0.01) t = lerp(temp[c], eq, 0.45);
    _t[c] = clamp(t, 0, 1.6);
  }
  temp.set(_t);
  advect(temp, W, 0.08);
  advect(moist, W, 0.12);
  advect(ash, W, 0.1);
  cloudsTick(W);
  atmoMetaTick(W);
}

/** Inject sulphate / dust / gases — shared by tools and volcanoes. */
export function injectGas(W, key, amount) {
  if (!(key in W.gases)) return;
  W.gases[key] = clamp(W.gases[key] + amount, 0, key === 'N2' ? 1.2 : 0.8);
}
