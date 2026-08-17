#!/usr/bin/env node
/** Pure-function unit tests — next backlog item 62. */

import { makeRng, forkRng, hashTag, attachWorldRng } from './rng.js';
import { adaptiveTickYears, faintYoungSun } from './time.js';
import { greenhouseFromGases } from '../rulesets.js';
import { classifyBiome } from './ecology.js';
import { kleiberDensity } from './evolve.js';
import { thermoCost } from './god/economy.js';
import { goldenRun } from './headless.mjs';
import { calibrateEarth } from './calibrate.mjs';

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name, detail); }
}

console.log('rng');
{
  const a = makeRng(42);
  const b = makeRng(42);
  ok('same seed same stream', a() === b() && a() === b());
  const c = forkRng(99, 'bio');
  const d = forkRng(99, 'bio');
  ok('fork stable', c() === d());
  const e = forkRng(99, 'geo');
  ok('forks diverge', e() !== forkRng(99, 'bio')());
  ok('hashTag stable', hashTag('bio') === hashTag('bio'));
  const W = {};
  attachWorldRng(W, 12345);
  ok('attach streams', typeof W.rng === 'function' && typeof W.rngBio === 'function');
}

console.log('time / climate helpers');
{
  ok('faint young sun at CAI ~0.7', faintYoungSun(0) > 0.65 && faintYoungSun(0) < 0.8);
  ok('faint young sun now ~1', Math.abs(faintYoungSun(4.567e9) - 1) < 0.08);
  const dt = adaptiveTickYears(4e9, {});
  ok('adaptive tick positive', dt > 0);
}

console.log('ecology / economy');
{
  const b = classifyBiome(0.55, 0.6, 0, false);
  ok('classifyBiome returns', b != null);
  const d = kleiberDensity(0.5);
  ok('kleiber density', d > 0 && Number.isFinite(d));
  const c = thermoCost('solar', 1);
  ok('thermoCost number', typeof c === 'number' && c >= 0);
}

console.log('greenhouse');
{
  const g = greenhouseFromGases({ CO2: 0.0004, CH4: 0.000002, H2O: 0.01, dust: 0, sulphate: 0 });
  ok('greenhouse finite', Number.isFinite(g));
}

console.log('golden + calibrate');
{
  const g = goldenRun({ ticks: 24 });
  ok('golden reproducible', g.pass, `${g.hash} vs ${g.hashB}`);
  const cal = calibrateEarth(20260808, 4);
  ok('earth calibrate', cal.pass, JSON.stringify(cal.checks.filter((c) => !c.ok)));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
