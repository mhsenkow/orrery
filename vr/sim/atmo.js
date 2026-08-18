/** Atmosphere: gases, greenhouse, circulation, clouds, dust, seasons. */

import { clamp, lerp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { greenhouseFromGases, totalPressure } from '../rulesets.js';
import { circumbinaryBeat } from './exophysics.js';
import { neighbourEN, neighbourMean } from './vecop.js';

/**
 * Insolation with obliquity (seasons) + diurnal term from sun angle.
 * sunPhase in radians: orbital day angle for terminator.
 */
export function insolation(W, c, sunDir) {
  const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
  const obl = W.obliquity;
  const season = W.season;
  const dec = Math.sin(obl) * Math.sin(season);
  const lat = y;
  const day = Math.max(0, x * sunDir[0] + y * sunDir[1] + z * sunDir[2]);
  const seasonal = Math.max(0.05, 0.55 + 0.45 * (lat * dec));
  const Pbar = W.rule?.surfacePressureBar;
  const atm = Pbar != null ? Math.min(1, Math.log10(Pbar + 1) / 2) : Math.min(1, totalPressure(W.gases, W.rule));
  let diurnal = lerp(0.5 + 0.5 * day, day, 1 - atm * 0.85);
  // Locked worlds: permanent dayside / nightside; libration sweeps the terminator when e > 0
  if (W.rule?.tidallyLocked) {
    const e = W.eccentricity || W.rule?.eccentricity || 0;
    const lib = e * Math.sin(season) * 0.35;
    const sub = Math.max(0, x * sunDir[0] + y * sunDir[1] + z * sunDir[2] + lib);
    const redist = W.rule.redistribution ?? (atm > 0.3 ? 0.45 : 0.05);
    diurnal = lerp(sub, 0.5, redist);
  }
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
  const S = W.solar * (W._solarMod || 1) * seasonal * (0.35 + 0.65 * diurnal) * extra * intern * tidal * beat;
  return heating === 'none' ? (W.rule?.tidalHeat || 0) * 0.05 : S;
}

/** Three-cell Hadley/Ferrel/polar wind field + Coriolis from rotation. */
export function computeWinds(W) {
  const { windU, windV, temp, rotationPeriod, h, seaLevel } = W;
  const cor = 1 / Math.max(0.15, Math.abs(rotationPeriod) || 1);
  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1]; // -1..1 ~ sin(lat)
    const abs = Math.abs(lat);
    // Meridional cells: Hadley 0–0.5, Ferrel 0.5–0.75, Polar 0.75–1
    let v = 0; // toward pole positive in N
    if (abs < 0.45) v = -Math.sign(lat || 1) * 0.6; // equatorward surface return? Hadley surface = equatorward... actually Hadley surface flow is equatorward
    else if (abs < 0.75) v = Math.sign(lat || 1) * 0.35;
    else v = -Math.sign(lat || 1) * 0.25;

    // Zonal: trades easterly in tropics, westerlies midlat
    let u = abs < 0.4 ? -0.7 : abs < 0.75 ? 0.85 : -0.3;
    u *= cor;
    v *= cor * 0.6;

    // Terrain deflection
    let gradX = 0;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      gradX += (temp[n] - temp[c]);
    }
    u += gradX * 0.05;
    // Continent drag
    if (h[c] >= seaLevel) { u *= 0.7; v *= 0.7; }
    windU[c] = u;
    windV[c] = v;
  }
}

/** Advect a scalar by a geographic (east, north) velocity pair.
 *  Flux-form, area-weighted: mass `field * AREA` is conserved to the limiter. */
export function advectField(field, uArr, vArr, scratch, rate) {
  scratch.fill(0);
  for (let c = 0; c < NC; c++) {
    const u = uArr[c] || 0, v = vArr[c] || 0;
    if (u * u + v * v < 1e-12) continue;
    const ac = AREA[c] || 1;
    const mass = field[c] * ac;
    if (!(mass > 0)) continue;
    let out = 0;
    const flux = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const { e, n } = neighbourEN(c, k);
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
  const itcz = W._itczLat || 0;
  const earth = !!W.rule.earthLike && !W.rule.deepTime;
  // Earth mean cloud fraction is ~0.67; prior coeffs locked ~0.80 and whitened the globe.
  const formScale = earth ? 0.62 : 1;
  const retain = earth ? 0.76 : 0.82;
  const ashCloud = earth ? 0.08 : 0.2;
  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const abs = Math.abs(lat - itcz);
    // ITCZ: deep convection band; subtropics: descending dry
    const itczBand = Math.exp(-((lat - itcz) * (lat - itcz)) / 0.018);
    const subtropDry = Math.exp(-((abs - 0.38) * (abs - 0.38)) / 0.02);
    const conv = Math.max(0, W.converg?.[c] || 0);
    let form = moist[c] * clamp(1.1 - temp[c], 0, 1) * 0.55 + precip[c] * 0.35;
    form += itczBand * moist[c] * 0.55 + conv * 0.4;
    form *= 1 - subtropDry * (earth ? 0.7 : 0.55); // horse latitudes clear
    // Midlatitude storm belt — moist + strong wind shear proxy
    const wind = Math.hypot(W.windU?.[c] || 0, W.windV?.[c] || 0);
    if (abs > 0.4 && abs < 0.75) form += moist[c] * wind * 0.2;
    form *= formScale;
    clouds[c] = clamp(clouds[c] * retain + form * 0.55 + ash[c] * ashCloud, 0, 1);
    // Rain shafts under thick convective cloud
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
  W.greenhouse = greenhouseFromGases(gases, R);
}

export function atmoTick(W, sunDir) {
  const R = W.rule;
  const { temp, moist, ice, clouds, h, seaLevel, gases, _t, ash } = W;
  const gh = greenhouseFromGases(gases, R);
  W.greenhouse = gh;
  // Winds come from geostrophicWind (called before this tick). The old
  // three-band computeWinds field was overwritten every tick and never advected.

  const lapse = 0.45 * R.gravity;
  const Ptot = totalPressure(gases, R);

  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const lat = DIR[c * 3 + 1];
    const absLat = Math.abs(lat);
    const cloudAlb = R.earthLike && !R.deepTime ? 0.2 : 0.28;
    const alb = clamp(
      ice[c] * 0.42 +
      clouds[c] * cloudAlb +
      W.dust[c] * 0.22 +
      (isSea ? 0.06 : 0.18),
      0, 0.85
    );
    const insol = insolation(W, c, sunDir);
    const above = Math.max(0, h[c] - seaLevel);
    // Poles run cold on Earth even after heat diffusion — without this, caps vanish.
    const polarCool = (R.earthLike && !R.deepTime) ? absLat * absLat * 0.16 : 0;
    const eq = insol * (1 - alb) * 0.95 + gh * 1.4 - above * lapse * 0.35 + 0.12 - polarCool;
    const c4 = c * 4;
    const dT = neighbourMean(temp, c) - temp[c];
    let maritime = isSea ? 1 : 0;
    if (!isSea) {
      for (let k = 0; k < 4; k++) if (h[NBR[c4 + k]] < seaLevel) maritime += 0.2;
    }
    const thermalMass = (isSea ? 0.035 : lerp(0.18, 0.08, clamp(maritime, 0, 1)))
      * (R.surfacePressureBar != null ? clamp(0.4 + Math.log10((R.surfacePressureBar || 1) + 0.01) * 0.35, 0.08, 2.5) : 1);
    // Less poleward heat bleed on Earth so polar cooling sticks
    const mix = (R.earthLike && !R.deepTime) ? 0.12 + (1 - absLat) * 0.06 : 0.18;
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
