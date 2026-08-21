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

/**
 * Does Earth's biosphere hold up over a long run?
 *
 * `calibrateEarth` looks eight ticks in and accepts `meanLife` anywhere in
 * [0.04, 0.45], which is wide enough to pass a dying planet. It did: `bioTick`
 * and `redoxTick` each deferred ownership of `life[]` to the other on modern
 * Earth, so nothing grew it, and the cap-only branch decayed the deep ocean 5% a
 * tick. Measured on the pinned calibration Earth before the fix — sea life
 * 0.090 -> 0.013, land 0.259 -> 0.051, `meanLife` 0.139 -> 0.023 over 3 500 ticks
 * and still falling — with 675 tests green throughout, because nothing looked
 * past tick eight.
 *
 * Runs at the caller's resolution; use N=32 for tests. Reports rather than
 * throws, like the rest of this harness.
 */
export function biosphereHolds(seed = 20260808, ticks = 750, ruleId = 'terra') {
  const rule = RULESETS.find((r) => r.id === ruleId) || RULESETS[0];
  generate(seed, rule);
  const marks = [];
  const sample = (t) => {
    let sea = 0, sn = 0, land = 0, ln = 0;
    for (let c = 0; c < NC; c++) {
      if (W.h[c] < W.seaLevel) { sea += W.life[c]; sn++; } else { land += W.life[c]; ln++; }
    }
    marks.push({
      tick: t, meanLife: W.meanLife,
      seaLife: sn ? sea / sn : 0, landLife: ln ? land / ln : 0,
      grown: W.lifeGrown | 0,
    });
  };
  const step = Math.max(1, Math.round(ticks / 3));
  for (let t = 0; t <= ticks; t++) {
    if (t) simTick(true);
    if (t % step === 0) sample(t);
  }
  const early = marks[1] || marks[0];
  const late = marks[marks.length - 1];
  const ratio = early.meanLife > 1e-9 ? late.meanLife / early.meanLife : 0;
  // Something has to be growing life, or the only possible trend is downward.
  const growsSomewhere = marks.some((m) => m.grown > 0);
  return {
    pass: growsSomewhere && ratio >= 0.72 && late.meanLife >= 0.06 && late.seaLife >= 0.02,
    ruleId, seed, ticks, ratio, growsSomewhere, marks, late,
  };
}

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
