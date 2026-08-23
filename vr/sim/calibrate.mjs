/** Earth / world calibration harness — earth-fidelity B1, B86, B41.
 *  Item 197 + generalised ladder. */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { W, generate, simTick, RULESETS, changeResolution } from '../world.js';
import { NC } from '../sphere.js';
import { zonalFraction } from './surfaceStats.js';
import { skyCalibration } from './sky.js';
import { weatherCalib } from './weather.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINES = join(HERE, '../data/baselines');
const EARTH_REF = JSON.parse(readFileSync(join(HERE, '../data/earth-reference.json'), 'utf8'));

/** Legacy TOL — tightened B21–B25 from earth-reference (also in baselines/earth.json). */
export const TOL = {
  meanTemp: [0.42, 0.58],
  landFrac: [0.248, 0.336],
  iceFrac: [0.02, 0.12],
  O2: [0.18, 0.24],
  CO2ppm: [315, 525],
  meanLife: [0.08, 0.24],
  zonalTemp: [0.20, 0.70],
  zonalPrecip: [0.15, 0.75],
  tropPole: [0.08, 0.24],
  meanPrecip: [0.02, 0.20],
};

export { EARTH_REF };

/**
 * Does Earth's biosphere hold up over a long run?
 * (unchanged contract — see prior comment)
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
  const growsSomewhere = marks.some((m) => m.grown > 0);
  return {
    pass: growsSomewhere && ratio >= 0.72 && late.meanLife >= 0.06 && late.seaLife >= 0.02,
    ruleId, seed, ticks, ratio, growsSomewhere, marks, late,
  };
}

function meanPrecip(Wref) {
  let s = 0;
  for (let c = 0; c < NC; c++) s += Wref.precip[c] || 0;
  return s / NC;
}

function snapshotOf(Wref) {
  const co2ppm = (Wref.gases?.CO2 || 0) * 1e6;
  return {
    meanTemp: Wref.meanTemp,
    landFrac: Wref.landFrac,
    iceFrac: Wref.iceFrac,
    O2: Wref.gases?.O2,
    CO2ppm: co2ppm,
    meanLife: Wref.meanLife,
    zonalTemp: zonalFraction(Wref.temp),
    zonalPrecip: zonalFraction(Wref.precip),
    tropPole: Wref._tropPole,
    meanPrecip: meanPrecip(Wref),
    rossby: Wref._rossby,
    health: Wref.health,
  };
}

/** B86 — name world, seed, N, tick, field, value, band, source. */
export function check(name, value, band, ctx = {}) {
  const lo = Array.isArray(band) ? band[0] : band.lo;
  const hi = Array.isArray(band) ? band[1] : band.hi;
  const ok = Number.isFinite(value) && value >= lo && value <= hi;
  const row = {
    name, value, lo, hi, ok,
    world: ctx.world || ctx.ruleId || '?',
    ruleId: ctx.ruleId,
    seed: ctx.seed,
    n: ctx.n ?? NC,
    tick: ctx.tick,
    source: band?.source || band?.why || ctx.source || '',
    tag: band?.tag || '',
  };
  if (!ok) {
    row.message = [
      `FAIL ${row.world}`,
      `rule=${row.ruleId}`,
      `seed=${row.seed}`,
      `N=${row.n}`,
      `tick=${row.tick}`,
      `${name}=${formatVal(value)}`,
      `band=[${lo}, ${hi}]`,
      row.source ? `source=${row.source}` : null,
    ].filter(Boolean).join(' · ');
  }
  return row;
}

function formatVal(v) {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a >= 100 || (a > 0 && a < 0.001)) return v.toExponential(3);
  return (+v.toFixed(5)).toString();
}

/**
 * Parameterised calibration (B1).
 * `tolerances` is either TOL-shaped { field: [lo,hi] } or baseline early/late maps.
 */
export function calibrateWorld(ruleId, seed = 20260808, ticks = 8, tolerances = TOL, opts = {}) {
  const rule = RULESETS.find((r) => r.id === ruleId);
  if (!rule) {
    return {
      pass: false,
      ruleId,
      seed,
      ticks,
      checks: [check('ruleId', NaN, [0, 0], { ruleId, seed, world: ruleId, tick: 0, source: 'unknown ruleset' })],
      error: `unknown ruleset ${ruleId}`,
    };
  }
  if (opts.n && opts.n !== NC) {
    try { changeResolution(opts.n); } catch { /* headless may pin N */ void 0; }
  }
  generate(seed, { ...rule, deepTime: !!opts.deepTime, climateAnchor: opts.climateAnchor !== false });
  for (let i = 0; i < ticks; i++) simTick(true);
  delete W._climateAnchor;

  const snap = snapshotOf(W);
  const ctx = {
    world: opts.world || rule.name || ruleId,
    ruleId,
    seed,
    n: NC,
    tick: ticks,
    source: opts.source || '',
  };
  const checks = [];
  for (const [name, band] of Object.entries(tolerances)) {
    if (snap[name] === undefined && name !== 'CO2ppm') continue;
    const value = name === 'CO2ppm' ? snap.CO2ppm : snap[name];
    checks.push(check(name, value, band, ctx));
  }
  const pass = checks.every((c) => c.ok);
  return { pass, ruleId, seed, ticks, n: NC, checks, snapshot: snap, world: ctx.world };
}

export function calibrateEarth(seed = 20260808, ticks = 8) {
  return calibrateWorld('terra', seed, ticks, TOL, {
    world: 'Earth',
    source: 'earth-reference / legacy TOL',
  });
}

export function loadBaseline(id) {
  const path = join(BASELINES, `${id}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function listBaselines() {
  return readdirSync(BASELINES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

/** Sky spine calibration (GATE14). */
export function calibrateSky(ruleId = 'terra', seed = 20260808, tolerances = {}, opts = {}) {
  const rule = RULESETS.find((r) => r.id === ruleId);
  if (!rule) {
    return { pass: false, ruleId, seed, checks: [], error: `unknown ruleset ${ruleId}` };
  }
  if (opts.n && opts.n !== NC) {
    try { changeResolution(opts.n); } catch { void 0; }
  }
  generate(seed, { ...rule, deepTime: !!opts.deepTime });
  simTick(true);
  const snap = skyCalibration(W);
  const ctx = {
    world: opts.world || rule.name || ruleId,
    ruleId,
    seed,
    n: NC,
    tick: 1,
    source: opts.source || '',
  };
  const checks = [];
  for (const [name, band] of Object.entries(tolerances)) {
    checks.push(check(name, snap[name], band, ctx));
  }
  return { pass: checks.every((c) => c.ok), ruleId, seed, checks, snapshot: snap, world: ctx.world };
}

/** Run one baseline file (early + optional late). */
export function calibrateBaseline(id, opts = {}) {
  const bl = typeof id === 'string' ? loadBaseline(id) : id;
  const ruleId = bl.ruleId;
  if (!RULESETS.some((r) => r.id === ruleId)) {
    return { pass: false, skipped: true, reason: `no ruleset ${ruleId}`, world: bl.world, ruleId };
  }
  const skyKeys = ['obliquityDeg', 'siderealDayH', 'terminatorKmh', 'lunarInclDeg'];
  const isSky = bl.early && skyKeys.some((k) => k in bl.early);
  if (isSky) {
    const seed = opts.seed ?? bl.seeds?.[0] ?? 20260808;
    const early = calibrateSky(ruleId, seed, bl.early, {
      world: bl.world,
      source: bl.source,
      n: bl.n || 32,
    });
    return {
      pass: early.pass,
      world: bl.world,
      ruleId,
      seed,
      early,
      failures: early.checks.filter((c) => !c.ok),
      messages: early.checks.filter((c) => !c.ok).map((f) => f.message),
    };
  }
  const seed = opts.seed ?? bl.seeds?.[0] ?? 20260808;
  const n = bl.n || 32;
  const earlyTicks = bl.ticks?.early ?? 8;
  const lateTicks = bl.ticks?.late ?? earlyTicks;

  const early = calibrateWorld(ruleId, seed, earlyTicks, bl.early || TOL, {
    world: bl.world,
    source: bl.source,
    n,
  });

  let late = null;
  if (bl.late && lateTicks > earlyTicks) {
    // Continue from same generate by running more ticks
    const more = lateTicks - earlyTicks;
    for (let i = 0; i < more; i++) simTick(true);
    const snap = snapshotOf(W);
    const ctx = {
      world: bl.world, ruleId, seed, n: NC, tick: lateTicks, source: bl.source,
    };
    const checks = [];
    for (const [name, band] of Object.entries(bl.late)) {
      const value = name === 'CO2ppm' ? snap.CO2ppm : snap[name];
      checks.push(check(name, value, band, ctx));
    }
    late = { pass: checks.every((c) => c.ok), checks, snapshot: snap, ticks: lateTicks };
  }

  /* GATE1: optional weather spine after the late (or early) tick count. */
  let weather = null;
  if (bl.weather) {
    const weatherTicks = bl.ticks?.weather ?? Math.max(lateTicks, earlyTicks, 40);
    const have = late ? lateTicks : earlyTicks;
    for (let i = have; i < weatherTicks; i++) simTick(true);
    const cal = weatherCalib(W);
    const ctx = {
      world: bl.world, ruleId, seed, n: NC, tick: weatherTicks, source: bl.source || 'weatherCalib',
    };
    const checks = [];
    if (cal) {
      for (const [name, band] of Object.entries(bl.weather)) {
        checks.push(check(name, cal[name], band, ctx));
      }
    } else {
      checks.push(check('weatherCalib', NaN, [0, 0], { ...ctx, source: 'no column' }));
    }
    weather = { pass: checks.every((c) => c.ok), checks, snapshot: cal, ticks: weatherTicks };
  }

  const pass = early.pass && (!late || late.pass) && (!weather || weather.pass);
  const failures = [
    ...early.checks.filter((c) => !c.ok),
    ...(late?.checks || []).filter((c) => !c.ok),
    ...(weather?.checks || []).filter((c) => !c.ok),
  ];
  return {
    pass,
    world: bl.world,
    ruleId,
    seed,
    early,
    late,
    weather,
    failures,
    messages: failures.map((f) => f.message),
  };
}

/** CLI: node vr/sim/calibrate.mjs */
const isCalibrateCli = typeof process !== 'undefined'
  && /calibrate\.mjs$/.test(process.argv?.[1]?.replace(/\\/g, '/') || '');
if (isCalibrateCli) {
  const report = calibrateEarth();
  console.log(JSON.stringify(report, null, 2));
  for (const c of report.checks.filter((x) => !x.ok)) console.error(c.message);
  if (!report.pass) process.exitCode = 1;
}
