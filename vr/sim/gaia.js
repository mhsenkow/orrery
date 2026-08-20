/** Gaia: weathering thermostat, tipping elements, regulation metrics.
 *  Items 105–106 (via carbon), 113–122. */

import { clamp } from '../math.js';
import { NC, AREA } from '../sphere.js';
import { greenhouseFromGases } from '../rulesets.js';
import { daisyNSpeciesTick } from './alien.js';

/** Named tipping elements. Item 116. */
export const TIPPING = [
  { id: 'iceSheet', label: 'Polar ice sheets', threshold: 0.55, field: 'iceFrac', hysteresis: 0.15 },
  { id: 'amoc', label: 'Overturning circulation', threshold: 0.25, field: '_amoc', hysteresis: 0.1 },
  { id: 'amazon', label: 'Tropical forest dieback', threshold: 0.2, field: '_forestFrac', hysteresis: 0.12 },
  { id: 'boreal', label: 'Boreal forest shift', threshold: 0.35, field: '_borealStress', hysteresis: 0.1 },
  { id: 'permafrost', label: 'Permafrost carbon', threshold: 0.6, field: 'meanTemp', hysteresis: 0.08 },
  { id: 'coral', label: 'Coral reefs', threshold: 0.7, field: 'meanTemp', hysteresis: 0.05 },
  { id: 'monsoon', label: 'Monsoon systems', threshold: 0.2, field: '_monsoon', hysteresis: 0.1 },
];

export function gaiaTick(W, chronLog) {
  const { temp, ice, life, h, seaLevel, gases, moist } = W;

  if (W.rule.daisyworld) daisyNSpeciesTick(W);

  // Legacy one-line weathering kept as weak backup when carbon module absent
  if (!W.rule.daisyworld && !W.carbon) {
    let weather = 0;
    for (let c = 0; c < NC; c++) {
      if (h[c] < seaLevel) continue;
      // provenance: fitted — Walker et al. sketch scaled for tick rate
      weather += Math.max(0, temp[c] - 0.3) * moist[c] * AREA[c] * 0.0000004;
    }
    const floor = W.rule.minCO2 ?? 0.0008;
    const rate = W.rule.earthLike ? 0.12 : 1;
    gases.CO2 = Math.max(floor, gases.CO2 - weather * rate);
  }

  let tSum = 0, iceSum = 0, lifeSum = 0, land = 0, forest = 0;
  for (let c = 0; c < NC; c++) {
    tSum += temp[c] * AREA[c];
    iceSum += ice[c] * AREA[c];
    lifeSum += life[c] * AREA[c];
    if (h[c] >= seaLevel) {
      land += AREA[c];
      if (life[c] > 0.45 && moist[c] > 0.3) forest += AREA[c];
    }
  }
  W.meanTemp = tSum / NC;
  W.iceFrac = iceSum / NC;
  W.meanLife = lifeSum / NC;
  W.landFrac = W.noSurface ? 0 : land / NC;
  W._forestFrac = land > 0 ? forest / land : 0;
  W._amoc = W.conveyor ?? W._amoc ?? 0.7;
  W._monsoon = W._monsoon ?? 0.5;
  W._borealStress = clamp(W.meanTemp - 0.4, 0, 1);

  // Rate of change tolerance. Item 117.
  const dT = W.meanTemp - (W._prevMeanTemp ?? W.meanTemp);
  W._prevMeanTemp = W.meanTemp;
  W.dTempDt = dT / Math.max(1, (W.dtYr || 200) / 1e4);
  W.rateStress = clamp(Math.abs(W.dTempDt) * 2, 0, 1);

  // Anti-greenhouse from haze
  const gh = greenhouseFromGases(gases, W.rule) - (W.hazeAntiGreenhouse || 0);

  // Resilience
  let classBits = 0;
  for (let c = 0; c < NC; c++) if (life[c] > 0.1) classBits |= (1 << (W.lifeClass[c] & 7));
  const diversity = Math.min(1, popcount(classBits) / 5);
  const treeDiv = W.tree ? Math.min(1, W.tree.living.length / 12) : diversity;
  const tIdeal = W.rule.targetMeanTemp ?? 0.55;
  W.resilience = clamp(
    treeDiv * 0.35 + W.meanLife * 0.25 + (1 - Math.abs(W.meanTemp - tIdeal)) * 0.25
      + (1 - W.rateStress) * 0.15,
    0, 1
  );

  // Split habitability / inhabitance. Item 118.
  W.habitability = W.habitability ?? clamp(
    (W.meanTemp > 0.25 && W.meanTemp < 0.9 ? 0.5 : 0.1) + (W.rule.airless ? 0 : 0.3),
    0, 1
  );
  W.inhabitance = clamp(W.meanLife * 1.2, 0, 1);

  const regulating = W.resilience > 0.45 && W.meanTemp > 0.25 && W.meanTemp < 0.85;
  W.health = clamp(W.resilience * (regulating ? 1.1 : 0.6), 0, 1);

  // Feedback gain estimate. Item 122.
  W.feedbackGain = clamp((W.carbon?.weatheringFlux || 0) * 20 - (W.rateStress || 0), -1, 1);

  // Tipping elements. Item 116.
  W.tips = W.tips || {};
  for (const tip of TIPPING) {
    const val = W[tip.field] ?? 0;
    const was = W.tips[tip.id];
    let on = was?.on || false;
    if (!on && val > tip.threshold) on = true;
    if (on && val < tip.threshold - tip.hysteresis) on = false;
    if (on && !was?.on && chronLog) {
      chronLog(W.year, 'tipping', 0, val, `Tipping: ${tip.label}`);
    }
    W.tips[tip.id] = { on, val, label: tip.label };
  }

  // Runaway states with hysteresis
  if (W.iceFrac > 0.72 && W.meanTemp < 0.35) {
    if (W.state !== 'snowball') {
      W.state = 'snowball';
      if (chronLog) chronLog(W.year, 'runaway', 0, W.iceFrac, 'Snowball planet');
    }
  } else if (W.state === 'snowball') {
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

  // Sequential selection wording — survivorship not purpose. Item 115.
  if (W.rule.daisyworld) W.gaiaMode = 'tutorial-feedback';
  else W.gaiaMode = regulating ? 'survivorship' : 'transient';

  // Medea: biosphere self-harm score. Item 120.
  W.medeaScore = clamp(
    (W._extinctionPulse || 0) * 0.15
      + (W.transitions?.oxygenicPhotosynthesis && W.gases.O2 < 0.05 ? 0.2 : 0)
      + (W.carbon && W.carbon.surfacePH < 7.6 ? 0.2 : 0),
    0, 1
  );

  const fireFrac = Math.min(1, (W.fireCells || 0) / Math.max(8, NC * 0.02));
  const valence = clamp(
    W.meanLife * 1.1
      - W.iceFrac * 0.7
      - Math.abs(W.meanTemp - 0.55) * 0.9
      - fireFrac * 0.8
      - W.medeaScore * 0.4,
    -1, 1
  );
  const arousal = clamp(fireFrac * 1.2 + (W.rateStress || 0) * 0.8 + Math.abs(W.dTempDt || 0) * 0.4, 0, 1);
  let moodLabel = 'calm';
  if (fireFrac > 0.12) moodLabel = 'burning';
  else if (W.state === 'snowball' || W.iceFrac > 0.55) moodLabel = 'frozen';
  else if (W.meanTemp > 0.82) moodLabel = 'fever';
  else if (W.meanLife > 0.22 && valence > 0.15) moodLabel = 'bloom';
  else if (arousal > 0.35) moodLabel = 'restless';
  W.mood = { valence, arousal, label: moodLabel };

  if (W.state === 'snowball') {
    for (let c = 0; c < NC; c++) {
      if (temp[c] < 0.38) W.ice[c] = Math.max(W.ice[c], 0.8);
    }
  }

  if (W.autopilot) {
    // Handled by god/observe gaiaPolicyTick — keeps a visible policy log.
  }

  // Economy income handled in god/economy when present; keep fallback.
  if (!W.receipts) {
    W.energyIncome = 0.5 + W.health * 1.5 + W.meanLife;
    if (W.budgetMode) W.energy = Math.min(W.energyCap, W.energy + W.energyIncome * 0.05);
  }
}

function popcount(x) {
  let n = 0;
  while (x) { n += x & 1; x >>= 1; }
  return n;
}
