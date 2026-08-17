/** Scenario format + starter scenarios.
 *  Backlog goal 112–125. */

import { W } from '../../world.js';
import { formatAge } from '../time.js';
import { restraintStats } from './receipt.js';
import { rngOf } from '../rng.js';

/**
 * Scenario schema. Item 112.
 * { id, title, blurb, ruleId, deepTime, startAgeGa, tools?,
 *   timeLimitYr?, objective, score(W)->report, fail(W)->bool }
 */
export const SCENARIOS = [
  {
    id: 'hands-off',
    title: 'Hands off',
    blurb: 'Set initial conditions and let go — 4.5 Gyr, no interventions.',
    ruleId: 'terra',
    deepTime: true,
    startAgeGa: 0,
    tools: [],
    timeLimitYr: 4.5e9,
    objective: 'Reach a living world without touching it',
    score(W) {
      return report(W, {
        life: W.meanLife,
        diversity: W.tree?.living?.length || 0,
        interventions: 0,
      });
    },
    fail: () => false,
  },
  {
    id: 'save-snowball',
    title: 'Save a snowball',
    blurb: 'Arrive at a world locked in ice. Find the intervention that works.',
    ruleId: 'terra',
    deepTime: true,
    startAgeGa: 0.7,
    setup(W) {
      W.state = 'snowball';
      for (let c = 0; c < W.ice.length; c++) {
        W.ice[c] = 0.9;
        W.temp[c] = Math.min(W.temp[c], 0.28);
      }
      W.meanTemp = 0.28;
      W.gases.CO2 = 0.002;
    },
    objective: 'Break the snowball without sterilising the world',
    score(W) {
      return report(W, {
        ice: W.iceFrac,
        temp: W.meanTemp,
        life: W.meanLife,
        broken: W.iceFrac < 0.4 && W.meanTemp > 0.4,
      });
    },
    fail: (W) => W.meanLife < 0.01 && W.iceFrac > 0.8,
  },
  {
    id: 'daisy-tutorial',
    title: 'Daisyworld feedback',
    blurb: 'Learn ice–albedo with black and white daisies. Campaign step 1.',
    ruleId: 'daisy',
    deepTime: false,
    objective: 'Keep mean temperature regulated as the star brightens',
    score(W) {
      return report(W, { temp: W.meanTemp, regulated: Math.abs(W.meanTemp - 0.5) < 0.15 });
    },
    fail: () => false,
  },
  {
    id: 'grow-hostile',
    title: 'Grow a biosphere on a hostile world',
    blurb: 'Vermis — silicate, no free water. Find a metabolism that sticks.',
    ruleId: 'vermis',
    deepTime: false,
    tools: ['inspect', 'seedGuild', 'seed', 'co2', 'o2', 'core'],
    objective: 'Establish meanLife > 0.15',
    score(W) {
      return report(W, { life: W.meanLife, guilds: W.guilds });
    },
    fail: () => false,
  },
  {
    id: 'climate-only',
    title: 'Climate levers only',
    blurb: 'No impacts, no seeding. Nudge orbit and gases only. Weather forecasts are chaos-limited to ~2 weeks.',
    ruleId: 'terra',
    deepTime: false,
    tools: ['inspect', 'solar', 'co2', 'o2', 'tilt', 'spin', 'shade', 'aerosol', 'albedo', 'core', 'moon'],
    objective: 'Hold temperate conditions for 10⁶ yr of model time',
    score(W) {
      return report(W, { temp: W.meanTemp, life: W.meanLife });
    },
    fail: () => false,
  },
  {
    id: 'weather-sandbox',
    title: 'Weather sandbox',
    blurb: 'Fixed geology & biology — only spin, tilt, moon and aerosols. Watch tides and winds respond. Predictability ceiling ~2 weeks.',
    ruleId: 'terra',
    deepTime: false,
    tools: ['inspect', 'tilt', 'spin', 'moon', 'aerosol', 'shade', 'solar'],
    objective: 'Produce spring tides and named wind bands without touching life',
    score(W) {
      return report(W, { tide: W.meanTideRange, phase: W.tidePhase });
    },
    fail: () => false,
  },
  {
    id: 'recreate-earth',
    title: 'Recreate Earth',
    blurb: 'Start at 4.5 Ga. Land GOE, Cambrian, K–Pg within tolerance.',
    ruleId: 'terra',
    deepTime: true,
    startAgeGa: 0,
    objective: 'Hit major Earth milestones within tolerance',
    score(W) {
      const o2 = W.gases.O2;
      const goe = o2 > 0.01;
      const complex = (W.unlockedClass || 0) >= 2;
      return report(W, { goe, complex, o2, age: formatAge(W.ageYr) });
    },
    fail: () => false,
  },
  {
    id: 'moist-rescue',
    title: 'Rescue a moist greenhouse',
    blurb: 'The world is boiling. Shade, aerosols, or pray.',
    ruleId: 'terra',
    setup(W) {
      W.state = 'moist-greenhouse';
      W.meanTemp = 0.95;
      W.gases.CO2 = 0.12;
      W.solar = 1.3;
      for (let c = 0; c < W.temp.length; c++) W.temp[c] = 0.9 + rngOf(W, 'rngGod')() * 0.2;
    },
    objective: 'Bring meanTemp below 0.7 without killing all life',
    score(W) {
      return report(W, {
        temp: W.meanTemp,
        life: W.meanLife,
        saved: W.meanTemp < 0.7 && W.meanLife > 0.05,
      });
    },
    fail: (W) => W.meanLife < 0.001,
  },
];

function report(W, extra = {}) {
  const r = restraintStats(W);
  return {
    ...extra,
    worldName: W.worldName || W.rule?.name,
    age: formatAge(W.ageYr),
    playerFrac: r.playerFrac,
    style: r.style,
    cheat: !!W.thermostatCheat,
    // Scoring that is not a score. Item 121.
    summary: describeOutcome(W, extra),
  };
}

function describeOutcome(W, extra) {
  const bits = [];
  if (extra.broken) bits.push('snowball broken');
  if (extra.saved) bits.push('world rescued');
  if (extra.goe) bits.push('oxygen rose');
  if (extra.regulated) bits.push('temperature regulated');
  if ((W.tree?.living?.length || 0) > 3) bits.push(`${W.tree.living.length} living clades`);
  if ((W.attribution?.acts || 0) < 3) bits.push('restraint');
  if (!bits.length) bits.push(`life ${(W.meanLife || 0).toFixed(2)}, T ${(W.meanTemp || 0).toFixed(2)}`);
  return bits.join(' · ');
}

export let activeScenario = null;

export function startScenario(id) {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) return null;
  activeScenario = {
    ...s,
    startedAt: W.ageYr,
    startedYear: W.year,
  };
  if (s.setup) s.setup(W);
  W.scenarioId = id;
  W.scenarioReport = null;
  return activeScenario;
}

export function evaluateScenario(W) {
  const s = activeScenario || SCENARIOS.find((x) => x.id === W.scenarioId);
  if (!s) return null;
  if (s.fail?.(W)) {
    W.scenarioReport = { failed: true, ...s.score(W), ending: failureEnding(W) };
    return W.scenarioReport;
  }
  if (s.timeLimitYr && W.ageYr - (activeScenario?.startedAt || 0) > s.timeLimitYr) {
    W.scenarioReport = { complete: true, ...s.score(W) };
    return W.scenarioReport;
  }
  W.scenarioReport = { live: true, ...s.score(W) };
  return W.scenarioReport;
}

/** Failure states worth reaching. Item 122. */
export function failureEnding(W) {
  if (W.state === 'moist-greenhouse') {
    return { id: 'runaway', title: 'Runaway greenhouse', epitaph: 'The oceans left as steam.' };
  }
  if (W.state === 'snowball' || (W.iceFrac || 0) > 0.85) {
    return { id: 'snowball', title: 'Hard snowball', epitaph: 'White, forever, almost.' };
  }
  if ((W.meanLife || 0) < 0.01) {
    return { id: 'sterile', title: 'Sterile world', epitaph: 'Nothing moved but the wind.' };
  }
  return { id: 'ended', title: 'The run ended', epitaph: formatAge(W.ageYr) };
}

/** Daily world seed from date. Item 124. */
export function dailySeed(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return ((y * 372 + m * 31 + d) * 2654435761) >>> 0;
}

export const CAMPAIGN = [
  'daisy-tutorial',
  'climate-only',
  'weather-sandbox',
  'grow-hostile',
  'save-snowball',
  'recreate-earth',
  'hands-off',
];
