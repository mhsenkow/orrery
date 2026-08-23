/** Atmosphere: gases, greenhouse, circulation, clouds, dust, seasons.
 *  @provenance tagged-module
 */

import { clamp, lerp } from '../math.js';
import { NC, NBR, NBR_E, NBR_N, NBR_ICHORD, DIR, AREA, N as SIM_N } from '../sphere.js';
import { greenhouseFromGases, vapourGreenhouse, totalPressure } from '../rulesets.js';
import { circumbinaryBeat } from './exophysics.js';
import { neighbourMean } from './vecop.js';
import { groundAlbedo, thermalInertiaAt, livePressureBar } from './substrateField.js';

/* fitted: 0.45 — dry adiabatic lapse dial × gravity */
const LAPSE_PER_G = 0.45;
/* fitted: 0.20 — Earth modern cloud albedo contribution */
const CLOUD_ALB_EARTH = 0.20;
/* fitted: 0.28 — non-Earth / deep-time cloud albedo */
const CLOUD_ALB_OTHER = 0.28;
/* fitted: 0.135 — Earth cloud longwave trap (balances SW reflect) */
const CLOUD_GH_EARTH = 0.135;
/* fitted: 0.16 — non-Earth cloud greenhouse */
const CLOUD_GH_OTHER = 0.16;
/* fitted: 0.08 + 1.48/π — daily-mean equator match to old 0.55 */
const INSOL_SEASON_BIAS = 0.08;
/* fitted: 1.48 — dailyMeanMu scale so equator ≈ 0.55 */
const INSOL_SEASON_GAIN = 1.48;
/* numeric: 0.95 — absorbed shortwave factor after albedo */
const SW_ABSORB = 0.95;
/* numeric: 1.4 — greenhouse → eq-temp gain */
const GH_EQ_GAIN = 1.4;

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
  // fitted: dailyMeanMu(0,0)=1/π → INSOL_SEASON_BIAS + INSOL_SEASON_GAIN/π ≈ 0.55
  const seasonal = INSOL_SEASON_BIAS + dailyMeanMu(y, dec) * INSOL_SEASON_GAIN;
  if (W.sky?.orbitAveraged) return seasonal;
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
  if (heating === 'particle') extra = 0.4;
  if (heating === 'none' || W.rule?.freeFloater) extra = 0;
  const intern = 1 + (W.rule?.internalHeat || 0);
  const tidal = 1 + Math.min(2, (W.rule?.tidalHeat || 0) * 0.4);
  let beat = 1;
  if (W.rule?.binaryBeat && (sky?.nLights || 0) <= 1) {
    const b = W.rule.binaryBeat;
    beat = circumbinaryBeat(b.L1, b.L2, b.Pbin, W.rule.orbitalPeriodDays, (W.ageYr || 0) * 365.25);
  }
  if (heating === 'none') return (W.rule?.tidalHeat || 0) * 0.05;

  const sky = W.sky;
  const nL = sky?.nLights || 0;
  if (nL > 1 && sky.lights) {
    let fluxSum = 0;
    let geoFlux = 0;
    for (let i = 0; i < nL; i++) {
      const body = W.bodies?.lights?.[i];
      if (body?.heating === 'none') continue;
      const L = sky.lights[i];
      const flux = L.flux || 0;
      const occ = 1 - (L.occluded || 0);
      fluxSum += flux;
      geoFlux += flux * occ * geometricInsolation(W, c, L.dir || sunDir);
    }
    const geo = fluxSum > 1e-8
      ? geoFlux / fluxSum
      : geometricInsolation(W, c, sunDir);
    return W.solar * (W._solarMod || 1) * geo * extra * intern * tidal * beat;
  }
  const occ = 1 - (sky?.lights?.[0]?.occluded || 0);
  return W.solar * (W._solarMod || 1) * geometricInsolation(W, c, sunDir) * extra * intern * tidal * beat * occ;
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
    const b4 = c * 4;
    for (let k = 0; k < 4; k++) {
      const i = b4 + k;
      const along = (u * NBR_E[i] + v * NBR_N[i]) * NBR_ICHORD[i];
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
      scratch[NBR[b4 + k]] += amt;
    }
  }
  for (let c = 0; c < NC; c++) field[c] += scratch[c] / (AREA[c] || 1);
}

/**
 * Advect three intensive fields through one pass of the grid.
 *
 * The ocean carries a temperature, a salinity and a phosphate concentration on
 * the same velocity field, and each `advectScalar` call re-walked all 24 576
 * cells re-reading the same neighbour indices, chords and tangent components to
 * compute the same four weights three times over. The geometry reads dominate
 * this loop, so sharing them is most of the cost of two of the three passes.
 * Identical arithmetic per field — each still relaxes toward its own upwind
 * neighbours and is written from its own scratch.
 */
export function advectScalar3(fa, fb, fc, uArr, vArr, rate) {
  const n = fa.length;
  if (!_s3a || _s3a.length !== n) {
    _s3a = new Float32Array(n);
    _s3b = new Float32Array(n);
    _s3c = new Float32Array(n);
  }
  for (let c = 0; c < n; c++) {
    const u = uArr[c] || 0, v = vArr[c] || 0;
    if (u * u + v * v < 1e-12) { _s3a[c] = fa[c]; _s3b[c] = fb[c]; _s3c[c] = fc[c]; continue; }
    let aa = 0, ab = 0, ac = 0, w = 0;
    const b4 = c * 4;
    for (let k = 0; k < 4; k++) {
      const i = b4 + k;
      const along = (u * NBR_E[i] + v * NBR_N[i]) * NBR_ICHORD[i];
      if (along >= 0) continue;
      const f = Math.min(0.24, rate * -along);
      const nb = NBR[i];
      aa += f * fa[nb];
      ab += f * fb[nb];
      ac += f * fc[nb];
      w += f;
    }
    if (w > 0) {
      const keep = 1 - w;
      _s3a[c] = fa[c] * keep + aa;
      _s3b[c] = fb[c] * keep + ab;
      _s3c[c] = fc[c] * keep + ac;
    } else { _s3a[c] = fa[c]; _s3b[c] = fb[c]; _s3c[c] = fc[c]; }
  }
  fa.set(_s3a); fb.set(_s3b); fc.set(_s3c);
}
let _s3a = null, _s3b = null, _s3c = null;

/**
 * Advect an *intensive* field — a temperature, a concentration — upwind.
 *
 * `advectField` above conserves `field × AREA`. That is exactly right for an
 * amount: ash, dust, a column of vapour. It is exactly wrong for an intensive
 * quantity, because piling mass into a convergence zone then dividing by that
 * cell's area *manufactures* the quantity. Temperature was being advected that
 * way, and once the wind field was strong enough for advection to do anything at
 * all the artefact was enormous: the ITCZ ran 20 K hot and the subtropics 10 K
 * cold, a 30 K meridional kink that no radiation term could account for.
 *
 * Relaxing each cell toward whatever is blowing into it transports without
 * inventing. The weights sum to less than one, so the result is a convex
 * combination of values that already existed — bounded, and stable at any wind
 * speed, which is also why the limiter can stay generous.
 */
export function advectScalar(field, uArr, vArr, scratch, rate) {
  for (let c = 0; c < NC; c++) {
    const u = uArr[c] || 0, v = vArr[c] || 0;
    if (u * u + v * v < 1e-12) { scratch[c] = field[c]; continue; }
    let acc = 0, w = 0;
    const b4 = c * 4;
    for (let k = 0; k < 4; k++) {
      const i = b4 + k;
      // Negative `along` means the wind at this cell points away from that
      // neighbour — so that is the side the air is arriving from.
      const along = (u * NBR_E[i] + v * NBR_N[i]) * NBR_ICHORD[i];
      if (along >= 0) continue;
      const f = Math.min(0.24, rate * -along);
      acc += f * field[NBR[i]];
      w += f;
    }
    scratch[c] = w > 0 ? field[c] * (1 - w) + acc : field[c];
  }
  field.set(scratch);
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
  // One definition of saturation, cached by the hydrosphere this tick.
  const satF = W.satV?.length === NC ? W.satV : null;
  for (let c = 0; c < NC; c++) {
    const conv = W.converg?.[c] || 0;
    const localV = vap?.[c] ?? moist[c];
    const sat = satF ? satF[c] : h2o * Math.exp((temp[c] - 0.5) * 1.8);
    const rh = localV / Math.max(1e-5, sat);
    let form = clamp(rh - 0.4, 0, 1) * 0.72 + precip[c] * 0.28;
    form += Math.max(0, conv) * 0.55;
    form *= 1 - clamp(-conv, 0, 1) * (earth ? 0.7 : 0.5);
    const wu = W.windU?.[c] || 0, wv = W.windV?.[c] || 0;
    form += localV * Math.sqrt(wu * wu + wv * wv) * 0.18;
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

/** Dust / sulphate decay only — run on the GPGPU climate path too so war soot clears. */
export function aerosolDecayTick(W) {
  const gases = W.gases;
  if (!gases) return;
  if (W.rule?.signature === 'dust') {
    // Full lofting lives in cloudsTick; on GPU path just settle gently.
    gases.dust = clamp((gases.dust || 0) * 0.997, 0, 0.5);
    if (W.dust) for (let c = 0; c < NC; c++) W.dust[c] *= 0.992;
  } else {
    gases.dust = clamp((gases.dust || 0) * 0.995, 0, 0.5);
    if (W.dust) for (let c = 0; c < NC; c++) W.dust[c] *= 0.99;
  }
  gases.sulphate = clamp((gases.sulphate || 0) * (W.rule?.earthLike ? 0.96 : 0.992), 0, 0.4);
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
  // Nuclear / volcanic ozone hit — applied after the O2-derived baseline.
  const ozHit = Math.min(0.45, (W.dark?.winter || 0) * 0.22 + (gases.sulphate || 0) * 0.35);
  if (ozHit > 0.01) W.ozone = Math.max(0.02, W.ozone * (1 - ozHit));

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
  // War soot + L1 shade applied in simTick after advanceClock (see applyWarShade).
  W.greenhouse = greenhouseFromGases(gases, R, livePressureBar(W));
}

/** Dim insolation from war soot / L1 shade. Call after advanceClock, before climate. */
export function applyWarShade(W) {
  if (!W?.gases || W.pausedSolar) {
    W._warShade = 0;
    return 0;
  }
  const gases = W.gases;
  const warShade = Math.min(0.22,
    (W.dark?.winter || 0) * 0.16 + (gases.dust || 0) * 0.28 + (gases.sulphate || 0) * 0.2);
  const geoShade = Math.min(0.3, W.solarShade || 0);
  const shade = Math.max(warShade, geoShade);
  W._warShade = warShade;
  if (shade > 0.001) {
    W.solar = Math.max(0.2, (W.solar || 1) * (1 - shade));
  }
  return shade;
}

export function atmoTick(W, sunDir) {
  const R = W.rule;
  const { temp, moist, ice, clouds, h, seaLevel, gases, _t, ash } = W;
  const Plive = livePressureBar(W);
  const gh = greenhouseFromGases(gases, R, Plive);
  W.greenhouse = gh;
  /* Water vapour is a *local* greenhouse gas, and treating it as a global mean
   * was costing the model its pole-to-equator gradient.
   *
   * `greenhouseFromGases` works off `gases.H2O`, the planetary mean, so every
   * cell got the same water-vapour blanket — the same 16 K over Antarctica in
   * midwinter as over the warm pool. The real polar greenhouse is weak precisely
   * because cold air holds almost no water: that is a large part of why the poles
   * are fifty kelvin colder than the tropics rather than twenty. With the
   * hydrosphere now carrying a real vapour field, the local column is available,
   * so use it: `ghDry` is everything except water, and each cell adds its own.
   * The consequence is a gradient that comes from the physics instead of from a
   * `polarCool` fudge — and a water-vapour feedback that acts where the water
   * actually is. */
  const ghDry = gh - vapourGreenhouse(gases.H2O || 0);
  const vapF = W.vapour?.length === NC ? W.vapour : null;
  // Winds come from geostrophicWind / SWE (called before this tick).

  const lapse = LAPSE_PER_G * R.gravity;
  const Ptot = totalPressure(gases, R);

  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const cloudAlb = R.earthLike && !R.deepTime ? CLOUD_ALB_EARTH : CLOUD_ALB_OTHER;
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
    /* Clouds do not only reflect. They also trap outgoing infrared, and on
       Earth the two effects very nearly cancel: about −45 W/m² of shortwave
       against about +30 of longwave. Only the reflecting half was modelled here,
       which was harmless while the cloud field was empty — relative humidity was
       defined against the global vapour mass, so it sat near 0.1 and almost
       nothing ever formed — and became a 0.13 cold bias with an ice-albedo
       runaway behind it the moment the water cycle started working. Trapping is
       also what makes the pattern right: clouds cool the tropics, where there is
       sunlight to reflect, and warm the poles, where there is mostly only
       infrared to keep. */
    const cloudGh = R.earthLike && !R.deepTime ? CLOUD_GH_EARTH : CLOUD_GH_OTHER;
    const ghHere = vapF ? ghDry + vapourGreenhouse(vapF[c]) : gh;
    const eq = insol * (1 - alb) * SW_ABSORB + ghHere * GH_EQ_GAIN + clouds[c] * cloudGh
      - above * lapse * 0.35 + 0.12 - polarCool;
    const c4 = c * 4;
    const dT = neighbourMean(temp, c) - temp[c];
    let maritime = isSea ? 1 : 0;
    if (!isSea) {
      for (let k = 0; k < 4; k++) if (h[NBR[c4 + k]] < seaLevel) maritime += 0.2;
    }
    const inland = isSea ? 0 : clamp((W.cont?.[c] || 0) / 1400, 0, 1);
    const thickAir = Plive != null && Plive > 10; // Venus-class column (B49)
    const thermalMass = (isSea ? 0.032 : lerp(0.16, 0.09, clamp(maritime, 0, 1)) * (1 + inland * 0.35))
      * (Plive != null ? clamp(0.4 + Math.log10((Plive || 1) + 0.01) * 0.35, 0.08, 2.5) : 1)
      * (R.earthLike ? 1 : clamp(1200 / Math.max(50, thermalInertiaAt(W, c)), 0.22, 2.4))
      * (thickAir ? 0.35 : 1); // thick air: slower cell memory, faster homogenisation
    let mix0 = (R.earthLike && !R.deepTime) ? 0.11 : 0.18;
    if (thickAir) mix0 = 0.72; // near-isothermal surface under a deep column
    const mix = mix0 * Math.min(2.5, Math.max(1, SIM_N / 64));
    let t = temp[c] + (eq - temp[c]) * thermalMass + dT * mix;
    if (R.airless || Ptot < 0.01) t = lerp(temp[c], eq, 0.45);
    if (thickAir) t = lerp(t, W.meanTemp || t, 0.12); // damp equator–pole contrast
    _t[c] = clamp(t, 0, 1.6);
  }
  temp.set(_t);
  // Temperature and soil moisture are intensive; ash is an amount.
  advectScalar(temp, W.windU, W.windV, W._adv, 0.35);
  advectScalar(moist, W.windU, W.windV, W._adv, 0.3);
  advect(ash, W, 0.1);
  cloudsTick(W);
  atmoMetaTick(W);
}

/** Inject sulphate / dust / gases — shared by tools and volcanoes. */
export function injectGas(W, key, amount) {
  if (!(key in W.gases)) return;
  /* CO₂ shares a hard ceiling with `syncGasesFromCarbon` (0.85). The old 0.8
     cap was fine for toys, but player injects that crossed it looked like the
     tool had stopped working. N₂ stays slightly over 1 so a thick air world
     can still breathe as mostly nitrogen. */
  const cap = key === 'N2' ? 1.2 : key === 'CO2' ? 0.85 : 0.8;
  W.gases[key] = clamp(W.gases[key] + amount, 0, cap);
  // Carbon reservoir owns Holocene CO₂ — keep it in step or the next tick erases the inject.
  if (key === 'CO2' && W.carbon) {
    W.carbon.atmosphere = Math.max(W.carbon.atmosphere || 0, W.gases.CO2 * 100);
  }
}
