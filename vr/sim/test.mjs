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

console.log('planet terrain');
{
  const { setResolution, NC, DIR } = await import('../sphere.js');
  setResolution(32);
  const { planetKind, refinePlanetHypsometry } = await import('./planetTerrain.js');
  ok('mars kind', planetKind({ id: 'ares', signature: 'dust', interior: { lidMode: 'stagnant' } }) === 'mars');
  ok('io kind', planetKind({ name: 'Io', tidalHeat: 1.4, interior: { lidMode: 'stagnant' } }) === 'io');
  ok('europa kind', planetKind({ iceShell: true, name: 'Europa', interior: { lidMode: 'ice' } }) === 'europa');
  ok('venus kind', planetKind({ name: 'Venus', interior: { lidMode: 'episodic' } }) === 'venus');
  ok('earth skipped', planetKind({ earthLike: true }) === 'earth');

  function blank() {
    const W = {
      h: new Float32Array(NC).fill(0.1),
      crust: new Float32Array(NC).fill(0.4),
      age: new Float32Array(NC).fill(200),
      rock: new Uint8Array(NC),
      ice: new Float32Array(NC),
      iceLand: new Float32Array(NC),
      iceSea: new Float32Array(NC),
      plateId: new Int16Array(NC),
      bound: new Int8Array(NC).fill(-1),
      plates: [{ oceanic: true, density: 3.0, baseThick: 0.25, omega: 0.04 }],
      volcanoes: [],
      hotspots: [],
      seaLevel: 0,
      interior: { lidMode: 'stagnant', heatFlow: 0.25 },
    };
    return W;
  }
  const mars = blank();
  refinePlanetHypsometry(mars, 7, { id: 'ares', signature: 'dust', interior: mars.interior });
  let nSum = 0, nN = 0, sSum = 0, sN = 0;
  for (let c = 0; c < NC; c++) {
    const y = DIR[c * 3 + 1];
    if (y > 0.25) { nSum += mars.h[c]; nN++; }
    if (y < -0.25) { sSum += mars.h[c]; sN++; }
  }
  ok('mars south highlands', nN > 10 && sN > 10 && sSum / sN > nSum / nN + 0.04, `${sSum / sN} vs ${nSum / nN}`);
  ok('mars dry sea', mars.seaLevel < -0.4);
  ok('mars plates continental', mars.plates.every((p) => !p.oceanic));

  const io = blank();
  io.interior.heatFlow = 2.2;
  refinePlanetHypsometry(io, 3, { name: 'Io', tidalHeat: 1.5, interior: io.interior });
  ok('io many vents', io.volcanoes.length > 20, String(io.volcanoes.length));
  ok('io young crust', io.age[0] < 20);

  const { applyIceShell } = await import('./iceshell.js');
  const eu = blank();
  eu.seed = 11;
  eu.moist = new Float32Array(NC);
  eu.life = new Float32Array(NC);
  eu.temp = new Float32Array(NC);
  applyIceShell(eu, { iceShell: true, name: 'Europa', tidalHeat: 0.2, interior: { lidMode: 'ice' } });
  ok('europa shell kind', eu._shellKind === 'europa');
  ok('europa ice lid', eu.shellLid && eu.shellLid[0] > 0.2);

  const enc = blank();
  enc.seed = 9;
  enc.moist = new Float32Array(NC);
  enc.life = new Float32Array(NC);
  enc.temp = new Float32Array(NC);
  applyIceShell(enc, { iceShell: true, name: 'Enceladus', tidalHeat: 0.4, interior: { lidMode: 'ice' } });
  let southV = 0, northV = 0;
  for (let c = 0; c < NC; c++) {
    if (enc.shellVent[c] > 0.3) {
      if (DIR[c * 3 + 1] < 0) southV++;
      else northV++;
    }
  }
  ok('enceladus south vents', southV > northV && southV > 3, `${southV} vs ${northV}`);
}

console.log('planet look / ticks');
{
  const { sampleLand } = await import('./planetLook.js');
  const io = sampleLand('io', 0.55, 0);
  const eu = sampleLand('europa', 0.55, 0);
  const ve = sampleLand('venus', 0.7, 0);
  const ma = sampleLand('mars', 0.55, 0);
  ok('io sulfur yellow', io && io[0] > 160 && io[1] > 80 && io[1] > io[2]);
  ok('europa ice pale', eu && eu[2] > 180 && eu[1] > 160);
  ok('venus grey plains', ve && ve[0] > 160 && Math.abs(ve[0] - ve[1]) < 40);
  ok('mars rust not green', ma && ma[0] > ma[1] && ma[1] > ma[2] && ma[1] < 140);

  const { land: landTerra, ocean } = (await import('../rulesets.js')).RULESETS.find((r) => r.id === 'terra');
  const canopy = landTerra(0.7, 0.6, 0.8, 0.3, 0);
  const sea = ocean(0);
  ok('earth canopy dark', canopy[1] < 80, JSON.stringify(canopy));
  ok('earth ocean dark', sea[2] < 70, JSON.stringify(sea));

  const { erosionTick } = await import('./tectonics.js');
  const dry = {
    _planetKind: 'venus',
    seaLevel: 0.4,
    h: new Float32Array(NC).fill(0.8),
    flow: new Float32Array(NC).fill(1),
    moist: new Float32Array(NC).fill(1),
    sediment: new Float32Array(NC),
    _h: new Float32Array(NC),
  };
  const h0 = dry.h[10];
  erosionTick(dry);
  ok('venus skips fluvial', dry.h[10] === h0);

  const { SCALE_PRESETS, scaleRung, applyScalePreset } = await import('./eoref.js');
  ok('scale presets', SCALE_PRESETS.length === 4);
  ok('iss is close', SCALE_PRESETS.find((p) => p.id === 'iss').camDist < 1.2);
  ok('dot is far', scaleRung(16) === 'Dot');
  const fakeS = { camDist: 3, sunAng: 0.6, dayWatch: true };
  applyScalePreset(fakeS, 'disc');
  ok('disc sun behind camera', Math.abs(fakeS.sunAng - Math.PI / 2) < 0.01 && fakeS.dayWatch === false);
}

console.log('picking');
{
  const { lookRay } = await import('../math.js');
  const { pickCell } = await import('../tools.js');
  const center = lookRay(0, 0, [0, 0, 3], [0, 0, 0], [0, 1, 0], Math.PI / 2, 1);
  ok('center look is -Z', Math.abs(center.dir[0]) < 1e-6 && Math.abs(center.dir[1]) < 1e-6 && center.dir[2] < -0.99);
  const lifted = lookRay(0, 0, [0, 0.28, 3.1], [0, 0, 0], [0, 1, 0], 50 * Math.PI / 180, 1);
  ok('lifted camera looks at origin', lifted.dir[1] < -0.05 && lifted.dir[2] < 0);
  const hit = pickCell(lifted.origin, lifted.dir, [0, 0, 0], 1, [0, 0, 0, 1]);
  ok('center click hits a cell', hit >= 0, `${hit}`);
}

console.log('planet processes / editor');
{
  const { planetGeoTick, paintEdifice, hydrothermalTick } = await import('./planetTick.js');
  const { NBR: nbr } = await import('../sphere.js');

  const io = {
    _planetKind: 'io',
    interior: { heatFlow: 2 },
    h: new Float32Array(NC).fill(0.05),
    age: new Float32Array(NC).fill(40),
    crust: new Float32Array(NC).fill(0.3),
    lava: new Float32Array(NC).fill(0.4),
    rock: new Uint8Array(NC),
    _ioBurial: 1.2,
  };
  const hPeak0 = io.h[0];
  planetGeoTick(io, null);
  let ioMax = -99;
  for (let c = 0; c < NC; c++) if (io.h[c] > ioMax) ioMax = io.h[c];
  ok('io burial mountain', ioMax > hPeak0 + 0.05, `max ${ioMax}`);
  ok('io resurfaces young', io.age[10] < 20);

  const venus = {
    _planetKind: 'venus',
    interior: { heatFlow: 1.2 },
    h: new Float32Array(NC).fill(0.4),
    age: new Float32Array(NC).fill(400),
    crust: new Float32Array(NC).fill(0.7),
    rock: new Uint8Array(NC),
    _lidHeat: 1,
  };
  venus.rock[3] = 2;
  venus.h[3] = 0.85;
  planetGeoTick(venus, null);
  ok('venus plains resurface', venus.h[10] < 0.3 && venus.age[10] < 80);
  ok('venus tesserae survive', venus.h[3] > 0.8 && venus.rock[3] === 2);

  const cell = 80;
  const ed = {
    h: new Float32Array(NC).fill(0.4),
    lava: new Float32Array(NC),
    ash: new Float32Array(NC),
  };
  paintEdifice(ed, cell, 1.2, 0.4, false);
  ok('shield raises vent', ed.h[cell] > 0.42);
  let nRaise = 0;
  for (let k = 0; k < 4; k++) if (ed.h[nbr[cell * 4 + k]] > 0.4) nRaise++;
  ok('shield spreads to neighbours', nRaise >= 2, `${nRaise}`);

  const ht = {
    hydrotherm: new Float32Array(NC),
    bound: new Int8Array(NC),
    h: new Float32Array(NC).fill(-0.2),
    seaLevel: 0.3,
    species: { H2S: new Float32Array(NC), H2: new Float32Array(NC) },
  };
  ht.bound[12] = 0;
  hydrothermalTick(ht);
  ok('ridge feeds hydrothermal', ht.hydrotherm[12] > 0.02, `${ht.hydrotherm[12]}`);

  const { land: landTerra2 } = (await import('../rulesets.js')).RULESETS.find((r) => r.id === 'terra');
  const sahara = landTerra2(0.6, 0.05, 0, 0.2, 0, { rock: 1, lat: 0.2, dust: 0 });
  const oz = landTerra2(0.62, 0.05, 0, 0.2, 0, { rock: 0, lat: 0.2, dust: 0 });
  const gobi = landTerra2(0.3, 0.05, 0, 0.2, 0, { rock: 1, lat: 0.7, dust: 0 });
  ok('sahara paler than australia', sahara[0] > oz[0] && oz[0] > oz[1], `${sahara} vs ${oz}`);
  ok('gobi greyer than sahara', gobi[0] < sahara[0] && Math.abs(gobi[0] - gobi[1]) < 30);
}

console.log('landscape / seedword / brush');
{
  const { seedToWords, wordsToSeed, encodeWorldId, decodeWorldId, parseWorldInput } = await import('./seedword.js');
  const s = 20260808;
  ok('seedword roundtrip', wordsToSeed(seedToWords(s)) === s);
  const id = encodeWorldId(s, 'shattered');
  const d = decodeWorldId(id);
  ok('world id roundtrip', d && d.seed === s && d.landscape === 'shattered', id);
  ok('parse integer seed', parseWorldInput('42')?.seed === 42);
  const caty = parseWorldInput('caty');
  ok('text seed caty', caty?.label === 'caty' && caty.seed === parseWorldInput('caty')?.seed);

  setResolution(32);
  const { landmassReport } = await import('./landscapes.js');
  const { generate, W } = await import('../world.js');
  const { RULESETS } = await import('../rulesets.js');
  const base = RULESETS.find((r) => r.id === 'terra');
  generate(12345, { ...base, landscape: 'twoworlds', targetLandFrac: 0.55, _genesisWater: 1 });
  const rep55 = landmassReport(W);
  ok('genesis land slider beats archetype', rep55.landFrac > 0.48 && rep55.landFrac < 0.62, `${rep55.landFrac}`);
  generate(12345, { ...base, landscape: 'twoworlds', nPlates: 3, targetLandFrac: 0.3 });
  ok('nPlates reaches generate', W.plates?.length === 3, `${W.plates?.length}`);
  generate(12345, { ...base, landscape: 'twoworlds', nPlates: 14, targetLandFrac: 0.3 });
  ok('nPlates 14 distinct', W.plates?.length === 14 && new Set(W.plateId).size === 14, `${W.plates?.length}`);
  W.h.fill(-0.4);
  W.seaLevel = 0;
  for (let c = 0; c < 180; c++) W.h[c] = 0.25;
  const rep = landmassReport(W);
  ok('landmass counts land', rep.count >= 1 && rep.landFrac > 0.01, JSON.stringify({ count: rep.count, landFrac: rep.landFrac }));

  const { BRUSH, paintBrush, brushWalkBudget, falloff } = await import('./god/brush.js');
  BRUSH.radiusRad = 0.12;
  BRUSH.pinpoint = false;
  BRUSH.mask = null;
  BRUSH.snap = null;
  BRUSH.symmetry = null;
  BRUSH.rate = 1;
  BRUSH.hardness = 0;
  const walked = brushWalkBudget(0);
  ok('brush walk is a cap, not the planet', walked > 8 && walked < NC, `${walked} of ${NC}`);
  const r = paintBrush(0, () => {});
  ok('paintBrush visited << NC', r.visited > 8 && r.visited < NC && r.cells > 0, `${r.visited} visited, ${r.cells} painted`);
  const centreF = falloff(1, Math.cos(0.12), 0.12);
  const edgeF = falloff(Math.cos(0.11), Math.cos(0.12), 0.12);
  ok('cosine falloff centre > edge', centreF > edgeF && centreF > 0.85, `${centreF} vs ${edgeF}`);

  const { serializeRun } = await import('../world.js');
  W.rule = { id: 'terra', name: 'Earth', landscape: 'shattered', gases: { N2: 0.78, O2: 0.21, CO2: 0.0004, CH4: 0, H2O: 0.01, dust: 0, sulphate: 0 } };
  W._landscape = 'shattered';
  W.landSeed = s;
  W.seed = s;
  W.worldName = 'Test';
  W.chron = { events: [] };
  W.moments = {};
  W.tree = { living: [], nodes: [], convergences: [] };
  W.transitions = {};
  const ser = serializeRun();
  ok('serialize keeps landscape', ser.landscape === 'shattered' && ser.worldId.includes('shattered') && ser.hB64, ser.worldId);
  ok('serialize keeps layer stack', !!ser.layers && ser.version === 4 && Array.isArray(ser.layers.layers), `${ser.version}`);

  const {
    addHeight, setLayerVisible, setLayerOpacity, compositeLayers, packLayerStack, unpackLayerStack, flattenLayers,
  } = await import('./layers.js');
  generate(12345, { ...base, landscape: 'twoworlds', targetLandFrac: 0.3 });
  ok('generate builds a layer stack', W.layerStack && W.layerStack.layers.length >= 1 && W.layerStack.base.length === W.h.length);
  const c0 = 0;
  const h0 = W.h[c0];
  addHeight(W, c0, 0.2);
  ok('addHeight raises composite', W.h[c0] > h0 + 0.15, `${W.h[c0]} vs ${h0}`);
  const painted = W.h[c0];
  setLayerVisible(W, W.layerStack.activeId, false);
  ok('hide paint restores generated land', Math.abs(W.h[c0] - h0) < 1e-4, `${W.h[c0]} vs ${h0}`);
  setLayerVisible(W, W.layerStack.activeId, true);
  ok('show paint restores stroke', Math.abs(W.h[c0] - painted) < 1e-4, `${W.h[c0]} vs ${painted}`);
  setLayerOpacity(W, W.layerStack.activeId, 0.5);
  ok('opacity scales the stroke', Math.abs(W.h[c0] - (h0 + 0.1)) < 1e-3, `${W.h[c0]}`);
  setLayerOpacity(W, W.layerStack.activeId, 1);
  const packed = packLayerStack(W.layerStack);
  const keep = W.h[c0];
  flattenLayers(W);
  ok('flatten bakes and resets paints', Math.abs(W.h[c0] - keep) < 1e-3 && W.layerStack.layers.length === 1);
  unpackLayerStack(W, packed);
  compositeLayers(W);
  ok('unpack restores the stroke', Math.abs(W.h[c0] - keep) < 0.01, `${W.h[c0]} vs ${keep}`);
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
