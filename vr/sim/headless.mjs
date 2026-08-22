#!/usr/bin/env node
/** Headless runner — arbitrary ruleset, duration, structured output.
 *  Next backlog items 59, 66. */

import { W, generate, simTick, RULESETS, serializeRun } from '../world.js';
import { assertBudgets } from './assert.js';
import { NC } from '../sphere.js';
import { formatLivingLine, livingMetrics } from './livemetric.js';
import { hashFields } from './hashFields.js';

export { hashFields };

export function runHeadless({
  seed = 20260808,
  ruleId = 'terra',
  ticks = 100,
  deepTime = false,
  assertEvery = 0,
  profile = false,
} = {}) {
  const base = RULESETS.find((r) => r.id === ruleId) || RULESETS[0];
  const rule = { ...base, deepTime };
  generate(seed, rule);
  // D16 — golden / headless pin the CPU climate path.
  W._gpgpuOff = true;
  W._profileTicks = !!profile;
  const budgets = [];
  for (let i = 0; i < ticks; i++) {
    simTick(true);
    if (assertEvery && i % assertEvery === 0) {
      budgets.push(assertBudgets(W));
    }
  }
  if (!assertEvery) budgets.push(assertBudgets(W));
  const living = (base.thrive || ruleId === 'thrive') ? livingMetrics(W) : null;
  const out = {
    seed,
    ruleId,
    ticks,
    cells: NC,
    ageYr: W.ageYr,
    meanTemp: W.meanTemp,
    meanLife: W.meanLife,
    landFrac: W.landFrac,
    iceFrac: W.iceFrac,
    O2: W.gases.O2,
    CO2: W.gases.CO2,
    health: W.health,
    habitability: W.habitability,
    inhabitance: W.inhabitance,
    hash: hashFields(W),
    budgets,
    save: serializeRun(),
  };
  if (W._ms) out.ms = W._ms;
  if (living) {
    out.living = living;
    out.livingLine = formatLivingLine(living);
  }
  return out;
}

/** Golden-run: fixed seed + ticks → stable hash. Item 59. */
export function goldenRun(opts = {}) {
  const a = runHeadless({ seed: 42, ruleId: 'terra', ticks: 40, ...opts });
  const b = runHeadless({ seed: 42, ruleId: 'terra', ticks: 40, ...opts });
  return {
    pass: a.hash === b.hash,
    hash: a.hash,
    hashB: b.hash,
    snapshot: {
      meanTemp: a.meanTemp,
      meanLife: a.meanLife,
      O2: a.O2,
      ageYr: a.ageYr,
    },
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
  || process.argv[1]?.includes('headless');

if (typeof process !== 'undefined' && process.argv?.[1]?.includes('headless')) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v === undefined ? true : (/^\d+$/.test(v) ? +v : v)];
    }),
  );
  if (args.golden) {
    const g = goldenRun({ ticks: args.ticks || 40 });
    console.log(JSON.stringify(g, null, 2));
    process.exitCode = g.pass ? 0 : 1;
  } else {
    const report = runHeadless({
      seed: args.seed || 20260808,
      ruleId: args.rule || 'terra',
      ticks: args.ticks || 100,
      deepTime: !!args.deep,
    });
    console.log(JSON.stringify(report, null, 2));
  }
}
