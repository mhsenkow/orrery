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
    /* The snowball is an authored epoch, not a hand-rolled state.
     *
     * This used to force `W.ice`, `W.temp` and 2 000 ppm of CO₂ onto a deep-time
     * Earth after generate. Two things went wrong. `W.ice` is derived — `iceTick`
     * rebuilds it from `iceLand` and `iceSea` — so the ice vanished on the first
     * tick; and the deep-time era schedule wants roughly a tenth of an atmosphere
     * of CO₂ at 0.7 Ga, so it overwrote the forced value within a few ticks and
     * warmed the planet straight out of the crisis. Measured: the player did
     * nothing and the ice was broken by tick 100, then the world cooked to 51 °C.
     *
     * `epochs.json` already carries a Cryogenian snowball — 720 Ma, ice to the
     * equator, 120 ppm, O₂ at a fifth of a percent — with the note "volcanic CO₂
     * is the way out. Push CO₂ or albedo to break the ice." That is this lesson,
     * authored, cited and consistent with the era machinery. */
    epochId: 'snowball',
    /* And a tick short enough that the player is the fast mechanism. Ice shuts
       down silicate weathering, so volcanic CO₂ accumulates and the planet
       escapes on its own — correctly — but at millions of years a tick that took
       seventy-five ticks, about a minute, which is a challenge you win by
       watching. At twenty thousand years the natural escape is thousands of ticks
       away and an injection, a shade or an albedo brush act within a few. */
    fixedDtYr: 20000,
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
    id: 'keep-venus-wet',
    title: 'Keep Venus wet',
    blurb: 'A wet world under a bright star — the runaway is the default. Catalogue Venus has its own ocean epoch; this is the playable analog.',
    ruleId: 'terra',
    deepTime: true,
    startAgeGa: 1.0,
    landscape: 'ocean',
    setup(W) {
      W.solar = Math.max(W.solar, 1.45);
      W._baseSolar = Math.max(W._baseSolar || 1, 1.45);
    },
    objective: 'Keep an ocean against a brightening star',
    score(W) {
      return report(W, {
        land: W._landReport?.landFrac,
        temp: W.meanTemp,
        wet: (W._landReport?.landFrac || 1) < 0.85 && W.state !== 'moist-greenhouse',
      });
    },
    fail: (W) => W.state === 'moist-greenhouse' || (W._landReport?.landFrac || 0) > 0.92,
  },
  {
    id: 'permian-doorstep',
    title: 'Get through the Permian',
    blurb: 'One supercontinent, stressed climate. Keep the biosphere through the extinction window.',
    ruleId: 'terra',
    deepTime: true,
    epochId: 'permian',
    objective: 'Keep meanLife above 0.08 while Pangaea sits in the heat',
    score(W) {
      return report(W, { life: W.meanLife, o2: W.gases?.O2, landscape: W._landscape });
    },
    fail: (W) => W.meanLife < 0.01,
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
      /* `_baseSolar` as well as `solar`: `advanceClock` rewrites `W.solar` from
         `_baseSolar × faintYoungSun` every tick, so a bare assignment here was
         undone before the scenario's first tick finished — the brightened star
         this scenario is *about* lasted no time at all. */
      W.solar = 1.3;
      W._baseSolar = 1.3;
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
  /* A scenario cannot have failed before it has run.
   *
   * `setup` writes the world's opening state and the derived summaries — meanLife
   * above all — are only recomputed on the next tick, so a predicate that reads
   * them sees zeros. The snowball's fail test is "no life left on a frozen
   * planet", which is exactly what a freshly set-up snowball looks like: the
   * crisis lesson announced "the run ended" the instant the player opened it.
   * A few ticks of grace and the predicate reads the world it was written about. */
  const graceYr = Math.max(1, (W.dtYr || 200) * 6);
  const ranEnough = (W.ageYr - (activeScenario?.startedAt ?? W.ageYr)) >= graceYr;
  if (ranEnough && s.fail?.(W)) {
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
