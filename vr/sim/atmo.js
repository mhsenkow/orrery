/** Atmosphere: gases, greenhouse, circulation, clouds, dust, seasons. */

import { clamp, lerp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { greenhouseFromGases, totalPressure } from '../rulesets.js';

/**
 * Insolation with obliquity (seasons) + diurnal term from sun angle.
 * sunPhase in radians: orbital day angle for terminator.
 */
export function insolation(W, c, sunDir) {
  const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
  const obl = W.obliquity;
  const season = W.season;
  const dec = Math.sin(obl) * Math.sin(season);
  const lat = y; // already ~sin(lat) on unit sphere
  // Instantaneous + orbit-averaged mix so the planet doesn't freeze in shadow
  const day = Math.max(0, x * sunDir[0] + y * sunDir[1] + z * sunDir[2]);
  const seasonal = Math.max(0.05, 0.55 + 0.45 * (lat * dec)); // mild seasonal nudge
  const atm = Math.min(1, totalPressure(W.gases));
  const diurnal = lerp(0.5 + 0.5 * day, day, 1 - atm * 0.85);
  return W.solar * (W._solarMod || 1) * seasonal * (0.35 + 0.65 * diurnal);
}

/** Three-cell Hadley/Ferrel/polar wind field + Coriolis from rotation. */
export function computeWinds(W) {
  const { windU, windV, temp, rotationPeriod, h, seaLevel } = W;
  const cor = 1 / Math.max(0.15, rotationPeriod);
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

/** Advect a scalar field by wind (upwind, area-aware). */
export function advect(field, W, rate) {
  const { windU, _adv } = W;
  for (let c = 0; c < NC; c++) {
    const u = windU[c];
    // Pick neighbour along approximate wind (use NBR 0/1 as E/W proxy via face — imperfect but ok)
    const upwind = u > 0 ? NBR[c * 4 + 1] : NBR[c * 4];
    _adv[c] = field[c] + (field[upwind] - field[c]) * rate * Math.min(1, Math.abs(u));
  }
  field.set(_adv);
}

export function cloudsTick(W) {
  const { clouds, moist, temp, precip, ash, gases } = W;
  for (let c = 0; c < NC; c++) {
    const form = moist[c] * clamp(1.1 - temp[c], 0, 1) * 0.7 + precip[c] * 0.4;
    clouds[c] = clamp(clouds[c] * 0.85 + form * 0.5 + ash[c] * 0.2, 0, 1);
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
  gases.sulphate *= 0.992; // volcanic winter decays over years
}

export function atmoTick(W, sunDir) {
  const R = W.rule;
  const { temp, moist, ice, clouds, h, seaLevel, gases, _t, ash } = W;
  const gh = greenhouseFromGases(gases);
  W.greenhouse = gh;
  computeWinds(W);

  const lapse = 0.45 * R.gravity;
  const Ptot = totalPressure(gases);

  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const alb = clamp(
      ice[c] * 0.42 +
      clouds[c] * 0.28 +
      W.dust[c] * 0.22 +
      (isSea ? 0.06 : 0.18),
      0, 0.85
    );
    const insol = insolation(W, c, sunDir);
    const above = Math.max(0, h[c] - seaLevel);
    // Target equilibrium in ~0.2–1.0 band for Terra-like solar≈1, gh≈0.1
    const eq = insol * (1 - alb) * 0.95 + gh * 1.4 - above * lapse * 0.35 + 0.12;
    const c4 = c * 4;
    const dT = (temp[NBR[c4]] + temp[NBR[c4 + 1]] + temp[NBR[c4 + 2]] + temp[NBR[c4 + 3]]) * 0.25 - temp[c];
    const thermalMass = isSea ? 0.06 : 0.14;
    let t = temp[c] + (eq - temp[c]) * thermalMass + dT * 0.18;
    if (R.airless || Ptot < 0.01) t = lerp(temp[c], eq, 0.45);
    _t[c] = clamp(t, 0, 1.6);
  }
  temp.set(_t);
  advect(temp, W, 0.08);
  advect(moist, W, 0.12);
  advect(ash, W, 0.1);
  cloudsTick(W);

  // Atmospheric escape on low-g / weak magnetosphere
  if (R.gravity < 0.5 || R.magnetosphere < 0.2) {
    const leak = (1 - R.magnetosphere) * (1.2 - R.gravity) * 0.00002;
    gases.H2O = Math.max(0, gases.H2O - leak * 2);
    gases.N2 = Math.max(0, gases.N2 - leak * 0.5);
    gases.O2 = Math.max(0, gases.O2 - leak);
  }

  // Ozone proxy from O2
  W.ozone = clamp(gases.O2 * 2.5, 0, 1);

  // Milankovitch-lite: slow eccentricity / obliquity wobble on top of player solar
  W.season += 0.02 * (1 / Math.max(0.5, R.rotationPeriod));
  W.obliquity = (W._baseObliquity ?? R.obliquity) * (1 + 0.04 * Math.sin(W.year * 0.00002));
  // W.solar is the player/ruleset lever; apply mild orbital modulation without clobbering it
  if (W._baseSolar == null) W._baseSolar = W.solar;
  // Keep W.solar as the control; insolation reads it directly with eccentricity baked here:
  W._solarMod = 1 + R.eccentricity * Math.cos(W.season);
}

/** Inject sulphate / dust / gases — shared by tools and volcanoes. */
export function injectGas(W, key, amount) {
  if (!(key in W.gases)) return;
  W.gases[key] = clamp(W.gases[key] + amount, 0, key === 'N2' ? 1.2 : 0.8);
}
