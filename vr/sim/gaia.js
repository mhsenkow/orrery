/** Gaia: weathering thermostat, runaway states, health metric, autopilot. */

import { clamp } from '../math.js';
import { NC, AREA } from '../sphere.js';
import { greenhouseFromGases } from '../rulesets.js';

export function gaiaTick(W, chronLog) {
  const { temp, ice, life, h, seaLevel, gases, moist } = W;

  // Silicate weathering: warmer + wetter → draw down CO2 (slow)
  if (!W.rule.daisyworld) {
    let weather = 0;
    for (let c = 0; c < NC; c++) {
      if (h[c] < seaLevel) continue;
      weather += Math.max(0, temp[c] - 0.3) * moist[c] * AREA[c] * 0.0000004;
    }
    gases.CO2 = Math.max(0.0008, gases.CO2 - weather);
  }

  // Planetary means
  let tSum = 0, iceSum = 0, lifeSum = 0, land = 0;
  for (let c = 0; c < NC; c++) {
    tSum += temp[c] * AREA[c];
    iceSum += ice[c] * AREA[c];
    lifeSum += life[c] * AREA[c];
    if (h[c] >= seaLevel) land += AREA[c];
  }
  W.meanTemp = tSum / NC;
  W.iceFrac = iceSum / NC;
  W.meanLife = lifeSum / NC;
  W.landFrac = land / NC;

  // Resilience: diversity of life classes + distance from terminals
  let classBits = 0;
  for (let c = 0; c < NC; c++) if (life[c] > 0.1) classBits |= (1 << (W.lifeClass[c] & 7));
  const diversity = Math.min(1, popcount(classBits) / 5);
  W.resilience = clamp(
    diversity * 0.4 + W.meanLife * 0.3 + (1 - Math.abs(W.meanTemp - 0.55)) * 0.3,
    0, 1
  );

  // Health orb colour driver: regulating vs failing
  const gh = greenhouseFromGases(gases);
  const regulating = W.resilience > 0.45 && W.meanTemp > 0.25 && W.meanTemp < 0.85;
  W.health = clamp(W.resilience * (regulating ? 1.1 : 0.6), 0, 1);

  // Runaway states with hysteresis
  if (W.iceFrac > 0.72 && W.meanTemp < 0.35) {
    if (W.state !== 'snowball') {
      W.state = 'snowball';
      if (chronLog) chronLog(W.year, 'runaway', 0, W.iceFrac, 'Snowball planet');
    }
  } else if (W.state === 'snowball') {
    // Need strong greenhouse to escape
    if (gh > 0.22 && W.meanTemp > 0.42) {
      W.state = 'recovering';
      if (chronLog) chronLog(W.year, 'recovery', 0, gh, 'Snowball breaking');
    }
  } else if (W.meanTemp > 1.05 && gases.H2O > 0.08) {
    if (W.state !== 'moist-greenhouse') {
      W.state = 'moist-greenhouse';
      if (chronLog) chronLog(W.year, 'runaway', 0, W.meanTemp, 'Moist greenhouse');
    }
  } else if (W.state === 'moist-greenhouse' && W.meanTemp < 0.9) {
    W.state = 'stable';
  } else if (W.state === 'recovering' && W.iceFrac < 0.4) {
    W.state = 'stable';
  } else if (!W.state || W.state === 'recovering') {
    W.state = W.state || 'stable';
  }

  // Snowball hysteresis: lock ice only once deeply frozen (harder to escape)
  if (W.state === 'snowball') {
    for (let c = 0; c < NC; c++) {
      if (temp[c] < 0.38) W.ice[c] = Math.max(W.ice[c], 0.8);
    }
  }

  // Autopilot: gentle nudges toward habitability
  if (W.autopilot) {
    if (W.meanTemp < 0.35) W.solar = Math.min(1.4, W.solar + 0.002);
    if (W.meanTemp > 0.85) W.solar = Math.max(0.5, W.solar - 0.002);
    if (gases.CO2 < 0.005 && W.meanTemp < 0.4) gases.CO2 += 0.0005;
    if (gases.CO2 > 0.15 && W.meanTemp > 0.7) gases.CO2 *= 0.998;
  }

  // Energy income from biosphere health (for budgeted mode)
  W.energyIncome = 0.5 + W.health * 1.5 + W.meanLife;
  if (W.budgetMode) W.energy = Math.min(W.energyCap, W.energy + W.energyIncome * 0.05);
}

function popcount(x) {
  let n = 0;
  while (x) { n += x & 1; x >>= 1; }
  return n;
}
