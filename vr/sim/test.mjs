#!/usr/bin/env node
/** Pure-function unit tests — next backlog item 62. */

import { makeRng, forkRng, hashTag, attachWorldRng } from './rng.js';
import { adaptiveTickYears, faintYoungSun } from './time.js';
import { greenhouseFromGases } from '../rulesets.js';
import { classifyBiome } from './ecology.js';
import { kleiberDensity, nodeOf, addLineage, createTree, lineageAt, blankTraits, cellLifeSignal } from './evolve.js';
import { deriveLifeClass } from './lifeclass.js';
import { isModernEarth, isDeepTimeEarth, mergeRunRule } from './ruleMode.js';
import { currentEraId, eraPatch } from './timePanel.js';
import { isSubmerged, isLand, localSeaLevel } from './cellSurface.js';
import { thermoCost } from './god/economy.js';
import { goldenRun } from './headless.mjs';
import { calibrateEarth } from './calibrate.mjs';
import { hash2, presentAdvance, presentTime, stampPhase, tidePhase, noteWear, wearAt, wearTick, isOutNow } from './present.js';
import { qrot } from '../math.js';
import { createChronicle, logEvent, whatHappenedHere } from '../chronicle.js';
import { NBR, NC, setResolution } from '../sphere.js';

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

console.log('present / chronicle');
{
  ok('hash2 stable', hash2(17, 0x11fe) === hash2(17, 0x11fe));
  ok('hash2 mixes', hash2(1, 2) !== hash2(2, 1));
  presentAdvance(0.016);
  presentAdvance(0.016);
  ok('present clock advances', presentTime() > 0);
  const p0 = stampPhase(10, 0);
  const p1 = stampPhase(10, 1);
  ok('stamp phases differ', p0 !== p1);
  ok('tide phase in 0–1', tidePhase(0) >= 0 && tidePhase(0) <= 1);
  noteWear(3, 0.25);
  ok('wear notes a cell', wearAt(3) > 0.2);
  wearTick(0.4);
  ok('wear decays', wearAt(3) < 0.2);
  ok('settlers are out in daylight', typeof isOutNow(5, 0, 1) === 'boolean');
  const qr = qrot([0, 0, 0, 1], 1, 0, 0);
  ok('qrot identity', Math.abs(qr[0] - 1) + Math.abs(qr[1]) + Math.abs(qr[2]) < 1e-6);
  const chron = createChronicle();
  logEvent(chron, 100, 'bloom', 0, 1, 'here');
  const nbr = NBR[0];
  logEvent(chron, 101, 'bloom', nbr, 1, 'next door');
  logEvent(chron, 102, 'bloom', NC / 2 | 0, 1, 'far side');
  const near = whatHappenedHere(chron, 0, 2).map((e) => e.label);
  ok('whatHappenedHere finds the cell', near.includes('here'));
  ok('whatHappenedHere finds a neighbour', near.includes('next door'));
  ok('whatHappenedHere skips the far side', !near.includes('far side'));
}

console.log('mode / surface');
{
  ok('isModernEarth holocene', isModernEarth({ earthLike: true, deepTime: false }));
  ok('isDeepTimeEarth', isDeepTimeEarth({ earthLike: true, deepTime: true }));
  ok('catalogue clears modern', !isModernEarth({ earthLike: true, deepTime: false, catalogueId: 42 }));
  const base = { earthLike: true, deepTime: false, gases: { O2: 0.2 } };
  const merged = mergeRunRule(base, { deepTime: true });
  ok('mergeRunRule preserves clone', merged.deepTime && base.deepTime === false && base.gases !== merged.gases);
  ok('currentEra present', currentEraId({ earthLike: true, deepTime: false }) === 'present');
  ok('currentEra origin', currentEraId({ earthLike: true, deepTime: true, startAgeGa: 0 }) === 'origin');
  ok('eraPatch cambrian', eraPatch('cambrian')?.startAgeGa === 0.541);
  setResolution(32);
  const { W, generate, RULESETS } = await import('../world.js');
  generate(7, RULESETS[0]);
  W.tideHeight[0] = 0.05;
  ok('localSea includes tide', localSeaLevel(W, 0) > W.seaLevel);
  W.h[0] = W.seaLevel - 0.01;
  W.tideHeight[0] = 0.02;
  ok('isSubmerged with tide', isSubmerged(W, 0) && !isLand(W, 0));
}

console.log('fluids / tangent frame');
{
  const { EAST, NORTH, DIR, NC, NBR, AREA, setResolution } = await import('../sphere.js');
  setResolution(32);
  let ortho = true, unit = true;
  for (let c = 0; c < NC; c += 17) {
    const e = EAST[c * 3] * EAST[c * 3] + EAST[c * 3 + 1] * EAST[c * 3 + 1] + EAST[c * 3 + 2] * EAST[c * 3 + 2];
    const n = NORTH[c * 3] * NORTH[c * 3] + NORTH[c * 3 + 1] * NORTH[c * 3 + 1] + NORTH[c * 3 + 2] * NORTH[c * 3 + 2];
    const d = EAST[c * 3] * NORTH[c * 3] + EAST[c * 3 + 1] * NORTH[c * 3 + 1] + EAST[c * 3 + 2] * NORTH[c * 3 + 2];
    const upE = EAST[c * 3] * DIR[c * 3] + EAST[c * 3 + 1] * DIR[c * 3 + 1] + EAST[c * 3 + 2] * DIR[c * 3 + 2];
    if (Math.abs(e - 1) > 0.02 || Math.abs(n - 1) > 0.02) unit = false;
    if (Math.abs(d) > 0.05 || Math.abs(upE) > 0.05) ortho = false;
  }
  ok('east/north unit length', unit);
  ok('east ⊥ north ⊥ up', ortho);

  const { advect } = await import('./atmo.js');
  const field = new Float32Array(NC);
  const scratch = new Float32Array(NC);
  const windU = new Float32Array(NC);
  const windV = new Float32Array(NC);
  windU.fill(0.45);
  const mid = (NC / 2) | 0;
  field[mid] = 1;
  let mass0 = 0;
  for (let c = 0; c < NC; c++) mass0 += field[c] * AREA[c];
  const Wadv = { windU, windV, _adv: scratch };
  for (let i = 0; i < 8; i++) advect(field, Wadv, 0.2);
  let mass1 = 0;
  for (let c = 0; c < NC; c++) mass1 += field[c] * AREA[c];
  ok('advect moves the blob', field[mid] < 0.999 && mass1 > 0.2);
  ok('advect mass held', Math.abs(mass1 - mass0) / mass0 < 0.05, `mass ${mass0.toFixed(3)} → ${mass1.toFixed(3)}`);
  const ones = new Float32Array(NC);
  ones.fill(1);
  const { neighbourMean, gradEN } = await import('./vecop.js');
  ok('neighbourMean of 1 is 1', Math.abs(neighbourMean(ones, mid) - 1) < 1e-6);
  const { W } = await import('../world.js');
  ok('ocean velocity field exists', !!(W.oceanU && W.oceanV && W.oceanU.length === NC));
  ok('glossary has Ekman', !!(await import('./glossary.js')).GLOSSARY.Ekman);
  ok('glossary has ENSO', !!(await import('./glossary.js')).GLOSSARY.ENSO);
  const [ge, gn] = gradEN(ones, 0);
  ok('grad of constant ~0', Math.abs(ge) + Math.abs(gn) < 0.05);
  const { ensoLabel } = await import('./ocean.js');
  ok('ensoLabel neutral at rest', ensoLabel({ _ensoIndex: 0 }) === 'neutral');
  ok('drain tree exists', !!(W.drainTo && W.drainTo.length === NC));
  ok('mantle field exists', !!(W.mantleU && W.dynTopo));
  void NBR;
}

console.log('evolve / lifeclass');
{
  const tree = createTree();
  const traits = blankTraits();
  const node = addLineage(tree, null, traits, 0, 'test');
  ok('nodeOf round-trip', nodeOf(tree, node.id) === node);
  ok('byId size matches nodes', tree.byId.size === tree.nodes.length);
  const W = { tree, popId: new Int32Array(NC), life: new Float32Array(NC), lifeClass: new Uint8Array(NC), h: new Float32Array(NC), seaLevel: 0, transitions: {}, rule: {} };
  W.popId[0] = 999;
  ok('lineageAt empty when missing', lineageAt(W, 0) === null);
  W.popId[0] = node.id;
  W.life[0] = 0.5;
  ok('lineageAt finds node', lineageAt(W, 0)?.id === node.id);
  deriveLifeClass(W);
  const again = W.lifeClass.slice();
  deriveLifeClass(W);
  ok('deriveLifeClass idempotent', again.every((v, i) => v === W.lifeClass[i]));
  const deep = { rule: { earthLike: true, deepTime: true }, life: new Float32Array(NC), guildDens: { purpleSulfur: new Float32Array(NC) } };
  deep.guildDens.purpleSulfur[1] = 0.2;
  ok('cellLifeSignal guild proxy', cellLifeSignal(deep, 1) > cellLifeSignal(deep, 0));
}

console.log('redox / species');
{
  setResolution(32);
  const { W, generate, simTick, RULESETS } = await import('../world.js');
  generate(42, { ...(RULESETS.find((r) => r.id === 'terra') || RULESETS[0]), deepTime: true });
  for (let i = 0; i < 20; i++) simTick(true);
  let bad = '';
  for (const [key, arr] of Object.entries(W.species || {})) {
    for (let c = 0; c < NC; c++) {
      const v = arr[c];
      if (!Number.isFinite(v) || v < -1e-6 || v > 1 + 1e-6) bad = `${key}[${c}]=${v}`;
    }
  }
  ok('species fields in [0,1] after 20 ticks', !bad, bad);
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
