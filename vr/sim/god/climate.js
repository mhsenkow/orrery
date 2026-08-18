/** Climate levers that reach causes.
 *  Backlog clim 30–43. */

import { clamp } from '../../math.js';
import { NC, DIR } from '../../sphere.js';
import { W, chronLog } from '../../world.js';
import { injectGas } from '../atmo.js';
import { paintBrush, beginStroke } from './brush.js';
import { issueReceipt } from './receipt.js';
import { tidesTick } from '../tides.js';
import { rngOf } from '../rng.js';
import { ROCHE_DISTANCE } from '../tides.js';

/** Orbital element editor. Item 30 / 31. */
export function setOrbit(opts = {}) {
  if (opts.solar != null) {
    W.solar = clamp(opts.solar, 0.2, 2.5);
    W._baseSolar = W.solar;
  }
  if (opts.obliquity != null) {
    W.obliquity = clamp(opts.obliquity, 0, 1.2);
    W._baseObliquity = W.obliquity;
    if (W.rule) W.rule.obliquity = W.obliquity;
  }
  if (opts.eccentricity != null) {
    W.eccentricity = clamp(opts.eccentricity, 0, 0.4);
    if (W.rule) W.rule.eccentricity = W.eccentricity;
  }
  if (opts.precession != null) W.precession = opts.precession;
  issueReceipt({
    tool: 'solar',
    cell: 0,
    intent: 'Orbit edit',
    expected: `S=${W.solar.toFixed(2)} · ε=${((W.obliquity || 0) * 180 / Math.PI).toFixed(1)}° · e=${(W.eccentricity || 0).toFixed(3)}`,
    delayYr: 1e4,
    delayLabel: 'Orbital climate response settling',
  });
  chronLog(W.year, 'tool', 0, W.solar, 'Orbit elements set');
  return { ok: true, solar: W.solar, obliquity: W.obliquity, eccentricity: W.eccentricity };
}

/** Aerosol with decay curve. Item 32. */
export function injectAerosol(amount = 0.04, hemi = 0) {
  W.gases.sulphate = Math.min(0.4, (W.gases.sulphate || 0) + amount);
  W.aerosolPulse = {
    peakAt: W.ageYr + 0.25,
    fadeYr: 2.5,
    hemi,
    amount,
    born: W.ageYr,
  };
  issueReceipt({
    tool: 'aerosol',
    cell: 0,
    intent: 'Stratospheric aerosol',
    expected: `Injection ${(amount * 100).toFixed(1)}% · peaks in a season · fades ~2–3 yr`,
    delayYr: 3,
    delayLabel: 'Aerosol pulse faded',
  });
  chronLog(W.year, 'tool', 0, amount, 'Aerosol injection');
  return { ok: true };
}

export function aerosolTick(W) {
  const p = W.aerosolPulse;
  if (!p) {
    if (W.gases.sulphate > 0) W.gases.sulphate *= 0.992;
    return;
  }
  const age = W.ageYr - p.born;
  const rise = Math.max(0.01, p.peakAt - p.born);
  if (age < rise) {
    W.gases.sulphate = Math.min(0.4, p.amount * (age / rise));
  } else {
    const fade = Math.exp(-(age - rise) / p.fadeYr);
    W.gases.sulphate = p.amount * fade;
    if (fade < 0.02) W.aerosolPulse = null;
  }
}

/** Paint albedo. Item 33. */
export function paintAlbedo(cell, albedo = 0.7) {
  if (!W.albedoPaint) W.albedoPaint = new Float32Array(NC);
  beginStroke(['albedoPaint', 'temp']);
  paintBrush(cell, (c, f) => {
    W.albedoPaint[c] = albedo;
    W.temp[c] = clamp(W.temp[c] + (0.3 - albedo) * 0.15 * f, 0, 1.5);
  });
  issueReceipt({
    tool: 'albedo',
    cell,
    intent: albedo > 0.5 ? 'Whiten surface' : 'Blacken surface',
    expected: `Albedo → ${albedo.toFixed(2)} · ice–albedo may runaway`,
    delayYr: 500,
    delayLabel: 'Albedo feedback unfolding',
  });
  return { ok: true };
}

/** Solar shade at L1. Item 34. */
export function setSolarShade(fraction = 0.02) {
  W.solarShade = clamp(fraction, 0, 0.3);
  W.solar = clamp((W._baseSolar || W.solar) * (1 - W.solarShade), 0.2, 2.5);
  issueReceipt({
    tool: 'shade',
    cell: 0,
    intent: 'L1 solar shade',
    expected: `${(fraction * 100).toFixed(1)}% insolation removed · no chemistry`,
  });
  chronLog(W.year, 'tool', 0, fraction, `Solar shade ${(fraction * 100).toFixed(1)}%`);
  return { ok: true, shade: W.solarShade };
}

/** Greenhouse mixing board. Item 35. */
export function setGreenhouseMix(mix) {
  for (const [k, v] of Object.entries(mix)) {
    if (k in W.gases) W.gases[k] = clamp(v, 0, k === 'N2' ? 0.99 : 0.5);
  }
  issueReceipt({
    tool: 'co2',
    cell: 0,
    intent: 'Greenhouse board',
    expected: `CO₂ ${(W.gases.CO2 * 1e6).toFixed(0)} ppm · CH₄ ${((W.gases.CH4 || 0) * 1e6).toFixed(1)} ppm`,
  });
  return { ok: true, gases: { ...W.gases } };
}

/** Weak cloud seeding. Item 36. */
export function seedClouds(cell) {
  paintBrush(cell, (c, f) => {
    W.clouds[c] = Math.min(1, W.clouds[c] + 0.08 * f);
  });
  issueReceipt({
    tool: 'cloud',
    cell,
    intent: 'Cloud seed',
    expected: 'Honestly weak — cloud feedbacks are uncertain',
  });
  return { ok: true };
}

/** Re-route current / freshen conveyor. Item 37. */
export function tripOceanConveyor(fresh = true) {
  if (fresh) {
    for (let c = 0; c < NC; c++) {
      if (DIR[c * 3 + 1] > 0.4 && W.h[c] < W.seaLevel) {
        if (W.oceanSalt) W.oceanSalt[c] = Math.max(0.05, W.oceanSalt[c] * 0.72);
        W.moist[c] = Math.min(1, W.moist[c] + 0.15);
      }
    }
    W.conveyor = Math.max(0.05, (W.conveyor ?? 1) * 0.45);
  } else {
    W.conveyor = Math.min(1, (W.conveyor ?? 0.4) + 0.35);
  }
  W._amoc = W.conveyor;
  W.thermohaline = W.conveyor < 0.28 ? 'shutdown' : 'on';
  issueReceipt({
    tool: 'current',
    cell: 0,
    intent: fresh ? 'Freshen conveyor' : 'Restart conveyor',
    expected: `Overturning → ${W.thermohaline} (${(W.conveyor * 17).toFixed(0)} Sv sketch)`,
    delayYr: 200,
    delayLabel: 'Ocean circulation regime shift',
  });
  chronLog(W.year, 'tool', 0, 1, `Thermohaline ${W.thermohaline}`);
  return { ok: true, state: W.thermohaline, conveyor: W.conveyor };
}

/** Magnetosphere lever — also nudges interior conductivity so field has a cause. */
export function setMagnetosphere(v) {
  W.magnetosphere = clamp(v, 0, 2);
  if (W.rule) {
    W.rule.magnetosphere = W.magnetosphere;
    W.rule.magnetosphereLocked = true;
  }
  if (W.interior) {
    // Back-solve a conductivity that roughly yields this dynamo at current spin
    const spin = Math.abs(W.rotationPeriod || 1);
    const spinFactor = spin < 0.15 ? 0.15 : spin > 40 ? clamp(8 / spin, 0.02, 0.25)
      : clamp(1.2 / (0.4 + spin * 0.6), 0.08, 1.35);
    const denom = Math.max(0.05, W.interior.coreRadiusFrac * Math.sqrt(Math.max(0.05, W.interior.heatFlow)) * spinFactor * 1.15);
    W.interior.conductivity = clamp(v / denom, 0.02, 2);
    W.interior.dynamo = v;
  }
  issueReceipt({
    tool: 'magnet',
    cell: 0,
    intent: 'Set magnetosphere',
    expected: `M=${W.magnetosphere.toFixed(2)} · atmosphere escape responds over Myr`,
    delayYr: 1e7,
    delayLabel: 'Atmospheric escape from weak field visible',
    irreversible: v < 0.05,
  });
  return { ok: true };
}

/** Moon as tidal/stability lever. Item 40.
 *  opts.soft — update mass/distance without compounding day-length rescale (panel sliders). */
export function setMoon(mass = 1, distance = 1, opts = {}) {
  let dist = distance;
  let note = '';
  if (dist < ROCHE_DISTANCE) {
    dist = ROCHE_DISTANCE;
    note = ` · clamped to Roche floor (${ROCHE_DISTANCE})`;
  }
  const wasGone = !(W.moon && W.moon.mass > 0.1);
  W.moon = { mass, distance: dist, formed: W.moon?.formed ?? W.ageYr };
  if (mass < 0.1) {
    W.obliquityWander = true;
    if (wasGone === false && !opts.soft) {
      W.obliquity = clamp(W.obliquity + (rngOf(W, 'rngGod')() - 0.5) * 0.15, 0, 1.2);
      W._baseObliquity = W.obliquity;
    }
  } else {
    W.obliquityWander = false;
  }
  if (!opts.soft) {
    // One-shot day nudge from lunar distance (not on every slider tick)
    W.rotationPeriod = clamp(W.rotationPeriod * (0.85 + 0.15 * dist), 0.2, 40);
  }
  issueReceipt({
    tool: 'moon',
    cell: 0,
    intent: 'Moon lever',
    expected: mass < 0.1
      ? 'Obliquity will wander chaotically · tide range → solar-only'
      : `Axis stabilised · equilibrium tides raise intertidal zones${note}`,
  });
  chronLog(W.year, 'tool', 0, mass, mass < 0.1 ? 'Moon stripped' : `Moon set @ ${dist.toFixed(2)}${note}`);
  tidesTick(W);
  return { ok: true, moon: W.moon, rocheClamped: distance < ROCHE_DISTANCE };
}

/** Slow obliquity chaos when the Moon is gone. */
export function moonTick(W) {
  if (!W.obliquityWander) return;
  W.obliquity = clamp(
    (W._baseObliquity ?? W.obliquity) + Math.sin(W.ageYr * 1e-7) * 0.12 + Math.sin(W.ageYr * 3.1e-7) * 0.08,
    0, 1.2
  );
}

/** Thermostat cheat. Item 41. */
export function setThermostat(pin = null) {
  W.thermostatPin = pin;
  W.thermostatCheat = pin != null;
  issueReceipt({
    tool: 'thermostat',
    cell: 0,
    intent: pin == null ? 'Thermostat off' : `Pin T=${pin}`,
    expected: 'CHEAT — run will not count toward scenarios',
  });
  return { ok: true, pin };
}

export function thermostatTick(W) {
  if (W.thermostatPin == null) return;
  const d = W.thermostatPin - W.meanTemp;
  W.solar = clamp(W.solar + d * 0.01, 0.3, 2);
}

/** Local weather. Item 42. */
export function localWeather(cell, kind = 'rain') {
  paintBrush(cell, (c, f) => {
    if (kind === 'rain') {
      W.moist[c] = Math.min(1, W.moist[c] + 0.25 * f);
      W.clouds[c] = Math.min(1, W.clouds[c] + 0.3 * f);
    } else if (kind === 'frost') {
      W.temp[c] = Math.max(0, W.temp[c] - 0.2 * f);
      W.iceLand[c] = Math.min(1, W.iceLand[c] + 0.3 * f);
      W.ice[c] = Math.max(W.ice[c], W.iceLand[c]);
    } else if (kind === 'drought') {
      W.moist[c] *= 1 - 0.4 * f;
      W.clouds[c] *= 1 - 0.5 * f;
    }
  }, { radiusRad: 0.04 });
  issueReceipt({
    tool: 'weather',
    cell,
    intent: `Local ${kind}`,
    expected: 'Settling time: weather days–years',
  });
  return { ok: true, kind };
}

/** Settling-time label. Item 43. */
export function settlingTime(tool) {
  const map = {
    weather: 'days–years', cloud: 'days', aerosol: '1–3 years',
    albedo: 'years–decades', co2: 'decades · 10⁵ yr weathering',
    solar: 'decades', ice: 'millennia', sealevel: 'millennia',
    tilt: '10⁴–10⁵ yr', shade: 'immediate · decades response',
  };
  return map[tool] || 'varies';
}

export { injectGas };
