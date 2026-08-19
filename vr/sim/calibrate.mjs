/** Earth calibration harness — assert modern Earth within stated tolerances.
 *  Item 197. */

import { W, generate, simTick, RULESETS } from '../world.js';
import { NC } from '../sphere.js';
import { zonalFraction } from './surfaceStats.js';

const TOL = {
  meanTemp: [0.38, 0.62],
  landFrac: [0.22, 0.38],
  iceFrac: [0.0, 0.30],
  O2: [0.15, 0.28],
  CO2ppm: [200, 800],
  meanLife: [0.04, 0.45],
  zonalTemp: [0.12, 0.92],
  zonalPrecip: [0, 0.85],
  tropPole: [0.02, 0.55],
  meanPrecip: [0.0005, 0.25],
};

export function calibrateEarth(seed = 20260808, ticks = 8) {
  const rule = RULESETS.find((r) => r.id === 'terra') || RULESETS[0];
  generate(seed, rule);
  for (let i = 0; i < ticks; i++) simTick(true);

  const co2ppm = W.gases.CO2 * 1e6;
  const checks = [
    check('meanTemp', W.meanTemp, TOL.meanTemp),
    check('landFrac', W.landFrac, TOL.landFrac),
    check('iceFrac', W.iceFrac, TOL.iceFrac),
    check('O2', W.gases.O2, TOL.O2),
    check('CO2ppm', co2ppm, TOL.CO2ppm),
    check('meanLife', W.meanLife, TOL.meanLife),
    check('zonalTemp', zonalFraction(W.temp), TOL.zonalTemp),
    check('zonalPrecip', zonalFraction(W.precip), TOL.zonalPrecip),
    check('tropPole', W._tropPole ?? 0, TOL.tropPole),
    check('meanPrecip', meanPrecip(W), TOL.meanPrecip),
  ];
  const pass = checks.every((c) => c.ok);
  return {
    pass,
    seed,
    checks,
    snapshot: {
      meanTemp: W.meanTemp,
      landFrac: W.landFrac,
      iceFrac: W.iceFrac,
      O2: W.gases.O2,
      CO2ppm: co2ppm,
      meanLife: W.meanLife,
      zonalTemp: zonalFraction(W.temp),
      zonalPrecip: zonalFraction(W.precip),
      tropPole: W._tropPole,
      rossby: W._rossby,
      health: W.health,
      ics: W.ics,
    },
  };
}

function meanPrecip(Wref) {
  let s = 0;
  for (let c = 0; c < NC; c++) s += Wref.precip[c] || 0;
  return s / NC;
}

function check(name, value, [lo, hi]) {
  const ok = value >= lo && value <= hi;
  return { name, value, lo, hi, ok };
}

/** CLI: node --input-type=module vr/sim/calibrate.js */
if (typeof process !== 'undefined' && process.argv?.[1]?.includes('calibrate')) {
  const report = calibrateEarth();
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}
