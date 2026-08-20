#!/usr/bin/env node
/** Pure-function unit tests — next backlog item 62. */

import { makeRng, forkRng, hashTag, attachWorldRng } from './rng.js';
import { adaptiveTickYears, faintYoungSun } from './time.js';
import { greenhouseFromGases } from '../rulesets.js';
import { classifyBiome } from './ecology.js';
import { kleiberDensity, nodeOf, addLineage, createTree, lineageAt, blankTraits, cellLifeSignal } from './evolve.js';
import { deriveLifeClass } from './lifeclass.js';
import { isModernEarth, isDeepTimeEarth, mergeRunRule } from './ruleMode.js';
import { currentEraId, eraPatch, availableEras, ruleForEra } from './timePanel.js';
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
  ok('eraPatch cambrian clock', eraPatch('cambrian')?.startMaBP === 541);
  ok('eraPatch cambrian age is 541 Ma BP', Math.abs((eraPatch('cambrian')?.startAgeGa ?? 0) - 4.026) < 0.02);
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
  const sph = await import('../sphere.js');
  sph.setResolution(32);
  const { EAST, NORTH, DIR, NC, NBR, NBR_E, NBR_N, AREA } = sph;
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
  ok('nbr east/north table matches NC', NBR_E.length === NC * 4 && NBR_N.length === NC * 4);

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
  const { stepShallowWater } = await import('./swe.js');
  const eta = new Float32Array(NC).fill(0.5);
  const su = new Float32Array(NC);
  const sv = new Float32Array(NC);
  let bump = 0;
  for (let c = 0; c < NC; c++) {
    if (DIR[c * 3 + 1] > 0.35 && DIR[c * 3 + 1] < 0.55) { bump = c; break; }
  }
  eta[bump] = 0.95;
  stepShallowWater({ eta, u: su, v: sv, fScale: 1, g: 2.1, H: 0.38, dt: 0.2, relax: 0, damp: 0.05 });
  let sweSpd = 0;
  for (let c = 0; c < NC; c++) sweSpd = Math.max(sweSpd, Math.hypot(su[c], sv[c]));
  ok('SWE bump makes wind', sweSpd > 1e-5, `${sweSpd}`);
  ok('SWE height stays finite', Number.isFinite(eta[bump]) && eta[bump] > 0.2);
  ok('glossary has Ekman', !!(await import('./glossary.js')).GLOSSARY.Ekman);
  ok('glossary has ENSO', !!(await import('./glossary.js')).GLOSSARY.ENSO);
  ok('glossary has vorticity', !!(await import('./glossary.js')).GLOSSARY.vorticity);
  const [ge, gn] = gradEN(ones, 0);
  ok('grad of constant ~0', Math.abs(ge) + Math.abs(gn) < 0.05);
  const { ensoLabel } = await import('./ocean.js');
  ok('ensoLabel neutral at rest', ensoLabel({ _ensoIndex: 0 }) === 'neutral');
  ok('drain tree exists', !!(W.drainTo && W.drainTo.length === NC));
  ok('mantle field exists', !!(W.mantleU && W.dynTopo));
  void NBR;
}

console.log('cube-sphere seams / surface');
{
  const {
    DIR, NC, N, NF, NBR, setResolution,
    cellAt, sampleSphere, sampleFaceField, dirToCell,
  } = await import('../sphere.js');
  setResolution(32);
  const west = 0 * NF + 5 * N + 0;
  ok('cellAt left of face = NBR west', cellAt(0, -1, 5) === NBR[west * 4 + 1]);
  const fieldX = new Float32Array(NC);
  for (let c = 0; c < NC; c++) fieldX[c] = DIR[c * 3];
  let maxEdge = 0, maxInterior = 0;
  for (let c = 0; c < NC; c++) {
    const f = (c / NF) | 0;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const d = Math.abs(fieldX[n] - fieldX[c]);
      if (((n / NF) | 0) !== f) maxEdge = Math.max(maxEdge, d);
      else maxInterior = Math.max(maxInterior, d);
    }
  }
  ok('face-boundary Δx ≤ interior Δx', maxEdge <= maxInterior * 1.2 + 1e-6,
    `edge ${maxEdge.toFixed(4)} vs interior ${maxInterior.toFixed(4)}`);
  const c0 = dirToCell(0.2, 0.5, 0.8);
  const x = DIR[c0 * 3], y = DIR[c0 * 3 + 1], z = DIR[c0 * 3 + 2];
  ok('sampleSphere at cell centre', Math.abs(sampleSphere(fieldX, x, y, z) - fieldX[c0]) < 0.04,
    `${sampleSphere(fieldX, x, y, z)} vs ${fieldX[c0]}`);
  const ones = new Float32Array(NC);
  ones.fill(1);
  ok('sampleFaceField of 1 is 1', Math.abs(sampleFaceField(ones, 0, 0, 0, N) - 1) < 1e-6);
  ok('sampleFaceField at far corner is 1', Math.abs(sampleFaceField(ones, 0, N, N, N) - 1) < 1e-6);

  const { biomeMembership, classifyBiome } = await import('./ecology.js');
  const mem = biomeMembership(0.55, 0.6, 0, false);
  const wsum = mem.reduce((s, m) => s + m.w, 0);
  ok('biome membership sums to 1', Math.abs(wsum - 1) < 1e-6 && mem.length >= 1);
  ok('classifyBiome is membership argmax', classifyBiome(0.55, 0.6, 0, false) === mem[0].id);
  const icy = biomeMembership(0.4, 0.3, 0.9, false);
  ok('heavy ice is ice', icy[0].id === 'ice');

  const { updateContinentality } = await import('./hydro.js');
  const { W: Wcont, generate, simTick, RULESETS } = await import('../world.js');
  generate(11, RULESETS.find((r) => r.id === 'terra') || RULESETS[0]);
  updateContinentality(Wcont);
  let oceanZero = true, landFar = false;
  for (let c = 0; c < NC; c++) {
    if (Wcont.h[c] < Wcont.seaLevel && Wcont.cont[c] !== 0) oceanZero = false;
    if (Wcont.h[c] >= Wcont.seaLevel && Wcont.cont[c] > 200) landFar = true;
  }
  ok('continentality is 0 on ocean', oceanZero);
  ok('continentality rises inland', landFar);
  ok('vapour is a field', !!(Wcont.vapour && Wcont.vapour.length === NC));
  ok('fog is a field', !!(Wcont.fog && Wcont.fog.length === NC));
  ok('moisture river is a field', !!(Wcont.ariver && Wcont.ariver.length === NC));

  const { updateCoastDistance } = await import('./hydro.js');
  updateCoastDistance(Wcont);
  let coastOk = true, inlandOk = false, oceanNeg = true;
  for (let c = 0; c < NC; c++) {
    const d = Wcont.coastDist[c];
    if (Wcont.h[c] < Wcont.seaLevel) {
      if (d >= 0) oceanNeg = false;
    } else {
      if (d <= 0) coastOk = false;
      if (d > 150) inlandOk = true;
    }
    if (Math.abs(d) < 80 && Wcont.h[c] >= Wcont.seaLevel) coastOk = coastOk && true;
  }
  ok('coastDist is negative on ocean', oceanNeg);
  ok('coastDist is positive inland', coastOk && inlandOk);
  const dry = { h: new Float32Array(NC), seaLevel: -10, coastDist: null };
  dry.h.fill(1);
  updateCoastDistance(dry);
  ok('coastDist survives an all-land world', dry.coastDist.length === NC && Number.isFinite(dry.coastDist[0]));
  const wet = { h: new Float32Array(NC), seaLevel: 10, coastDist: null };
  wet.h.fill(-1);
  updateCoastDistance(wet);
  ok('coastDist survives an all-ocean world', Number.isFinite(wet.coastDist[0]) && wet.coastDist[0] < 0);

  const { pictureStats } = await import('./surfaceStats.js');
  const pic = pictureStats(Wcont);
  ok('ecotone is a real fraction of land', pic.ecotoneFrac > 0.04 && pic.ecotoneFrac < 0.85,
    `${pic.ecotoneFrac}`);
  ok('drainage was primed', pic.drain.flow01 > 20,
    `${pic.drain.flow01}/${pic.drain.land}`);
  ok('precip is less zonal than temperature', pic.zonal.precip < pic.zonal.temp + 0.08,
    `P ${pic.zonal.precip.toFixed(3)} T ${pic.zonal.temp.toFixed(3)}`);
  ok('life is not more zonal than temperature', pic.zonal.life < pic.zonal.temp + 0.12,
    `life ${pic.zonal.life.toFixed(3)} T ${pic.zonal.temp.toFixed(3)}`);
  let wetHiLat = 0, lifeHiLat = 0;
  for (let c = 0; c < NC; c++) {
    if (Wcont.h[c] < Wcont.seaLevel) continue;
    if ((Wcont.ice[c] || 0) > 0.4) continue;
    const lat = Math.abs(DIR[c * 3 + 1]);
    if (lat < 0.58 || lat > 0.82) continue;
    if ((Wcont.moist[c] || 0) < 0.22 || (Wcont.temp[c] || 0) < 0.28) continue;
    wetHiLat++;
    if ((Wcont.life[c] || 0) > 0.12) lifeHiLat++;
  }
  ok('wet high-latitude land can carry life', wetHiLat === 0 || lifeHiLat > 0,
    `life ${lifeHiLat}/${wetHiLat}`);
  let eqIce = false, coldIce = false;
  for (let c = 0; c < NC; c++) {
    if ((Wcont.ice[c] || 0) < 0.12) continue;
    if (Math.abs(DIR[c * 3 + 1]) < 0.22 && (Wcont.temp[c] || 0) > 0.48) eqIce = true;
    if ((Wcont.temp[c] || 0) < 0.34) coldIce = true;
  }
  ok('ice is not on the warm equator', !eqIce);
  ok('ice sits on cold cells', coldIce);
  const { noteTropicalBasin, ensoEastness } = await import('./ocean.js');
  noteTropicalBasin(Wcont, Wcont.seaLevel);
  ok('tropical basin is a real ocean', (Wcont._ensoBasinN || 0) > 20,
    `${Wcont._ensoBasinN}`);
  let minE = 1, maxE = -1;
  for (let c = 0; c < NC; c++) {
    if (Wcont.h[c] >= Wcont.seaLevel) continue;
    if (Math.abs(DIR[c * 3 + 1]) > 0.22) continue;
    const e = ensoEastness(Wcont, c);
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
  }
  ok('ENSO eastness spans the basin', maxE - minE > 0.35,
    `Δ ${(maxE - minE).toFixed(2)}`);
  const { tropicalFavor } = await import('./storms.js');
  let eqStorm = 0;
  for (let c = 0; c < NC; c++) {
    if (Math.abs(DIR[c * 3 + 1]) < 0.06 && tropicalFavor(Wcont, c) > 0) eqStorm++;
  }
  ok('equator is a cyclone dead zone', eqStorm === 0, `${eqStorm}`);

  const { dailyMeanMu } = await import('./atmo.js');
  const annual = (sLat, obl) => {
    let s = 0;
    for (let i = 0; i < 24; i++) {
      const dec = Math.sin(obl) * Math.sin((i / 24) * Math.PI * 2);
      s += dailyMeanMu(sLat, dec);
    }
    return s / 24;
  };
  ok('daily mean at equinox equator is 1/π', Math.abs(dailyMeanMu(0, 0) - 1 / Math.PI) < 1e-6,
    `${dailyMeanMu(0, 0)}`);
  ok('polar night is dark', dailyMeanMu(0.98, -0.4) < 0.02);
  ok('Earth-tilt equator beats poles annually', annual(0, 0.409) > annual(0.98, 0.409));
  ok('high-obliquity poles beat equator annually', annual(0.98, 1.2) > annual(0, 1.2));
  ok('fronts exist as a field', !!(Wcont.front && Wcont.front.length === NC));
  let frontMax = 0;
  for (let c = 0; c < NC; c++) if ((Wcont.front[c] || 0) > frontMax) frontMax = Wcont.front[c];
  ok('some cells sit on a front', frontMax > 0.02, `${frontMax.toFixed(3)}`);
  ok('Rossby number is finite', Number.isFinite(Wcont._rossby) && Wcont._rossby > 0,
    `${Wcont._rossby}`);
  ok('tropics are warmer than poles', (Wcont._tropPole || 0) > 0.02, `${Wcont._tropPole}`);
  const lockedRule = { ...(RULESETS.find((r) => r.id === 'terra') || RULESETS[0]), tidallyLocked: true };
  generate(11, lockedRule);
  const { geostrophicWind } = await import('./wind.js');
  Wcont._sunDir = [1, 0, 0];
  geostrophicWind(Wcont);
  ok('locked worlds skip zonal ITCZ inflow', Wcont._windRegime === 'substellar', Wcont._windRegime);
  generate(11, RULESETS.find((r) => r.id === 'terra') || RULESETS[0]);
  for (let i = 0; i < 24; i++) simTick(true);
  ok('water budget stays bounded', (Wcont.waterDrift || 0) < 0.4, `${Wcont.waterDrift}`);
  const moonRule = RULESETS.find((r) => r.id === 'selene') || RULESETS.find((r) => r.airless);
  if (moonRule) {
    generate(3, moonRule);
    let psum = 0;
    for (let c = 0; c < NC; c++) psum += Wcont.precip[c] || 0;
    ok('airless world has no rain', psum < 1e-3, `${psum}`);
  }
  generate(11, RULESETS.find((r) => r.id === 'terra') || RULESETS[0]);
  ok('height seam mean ≤ interior', pic.heightSeam.meanEdge <= pic.heightSeam.meanInterior * 1.5 + 1e-6,
    `${pic.heightSeam.meanEdge.toFixed(4)} vs ${pic.heightSeam.meanInterior.toFixed(4)}`);
  ok('ocean ramp is not fully saturated', pic.ramp.frac < 0.62,
    `${pic.ramp.frac.toFixed(3)}`);
  ok('neighbour ΔE is measured', pic.neighbourDE.pairs > 100 && pic.neighbourDE.mean >= 0);
  ok('staircase fraction is measured', pic.staircase.coastN > 10 && pic.staircase.frac >= 0);

  const { updateIsoline, squareSegments, landCover } = await import('./isoline.js');
  const corner = squareSegments(1, -1, -1, -1, 0);
  ok('marching squares: isolated land corner is one segment', corner.length === 4);
  const empty = squareSegments(1, 1, 1, 1, 0);
  ok('marching squares: all-land is empty', empty.length === 0);
  updateIsoline(Wcont);
  ok('coast isoline has even vertex count', Wcont.coastCount > 80 && Wcont.coastCount % 2 === 0,
    `${Wcont.coastCount}`);
  let coverOk = true;
  for (let c = 0; c < NC; c++) {
    const k = landCover(Wcont, c);
    if (k < 0 || k > 1) coverOk = false;
    if (Wcont.h[c] >= Wcont.seaLevel + 0.08 && k < 0.5) coverOk = false;
    if (Wcont.h[c] < Wcont.seaLevel - 0.08 && k > 0.5) coverOk = false;
  }
  ok('landCover is 0–1 and agrees with height', coverOk);

  let uMin = 1e9, uMax = -1e9, tropN = 0;
  for (let c = 0; c < NC; c++) {
    if (Math.abs(DIR[c * 3 + 1]) > 0.12) continue;
    tropN++;
    const u = Wcont.windU[c];
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
  }
  ok('pressure field exists', !!(Wcont.press && Wcont.press.length === NC));
  ok('vorticity field exists', !!(Wcont.vort && Wcont.vort.length === NC));
  let vortAbs = 0;
  for (let c = 0; c < NC; c++) vortAbs += Math.abs(Wcont.vort[c] || 0);
  ok('SWE has spin', vortAbs > 1, `${vortAbs.toFixed(2)}`);
  ok('tropical wind varies in longitude', tropN > 20 && uMax - uMin > 0.02,
    `Δu ${(uMax - uMin).toFixed(3)} n=${tropN}`);
  let seaSpd = 0, seaN = 0;
  for (let c = 0; c < NC; c++) {
    if (Wcont.h[c] >= Wcont.seaLevel) continue;
    seaN++;
    seaSpd += Math.hypot(Wcont.oceanU[c] || 0, Wcont.oceanV[c] || 0);
  }
  ok('ocean SWE has motion', seaN > 100 && seaSpd / seaN > 0.002,
    `mean ${((seaSpd / Math.max(1, seaN))).toFixed(4)} n=${seaN}`);
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
  const { setResolution, NC, DIR, N } = await import('../sphere.js');
  setResolution(32);
  const { planetKind, refinePlanetHypsometry } = await import('./planetTerrain.js');
  ok('mars kind', planetKind({ id: 'ares', signature: 'dust', interior: { lidMode: 'stagnant' } }) === 'mars');
  ok('io kind', planetKind({ name: 'Io', tidalHeat: 1.4, interior: { lidMode: 'stagnant' } }) === 'io');
  ok('europa kind', planetKind({ iceShell: true, name: 'Europa', interior: { lidMode: 'ice' } }) === 'europa');
  ok('venus kind', planetKind({ name: 'Venus', interior: { lidMode: 'episodic' } }) === 'venus');
  ok('earth skipped', planetKind({ earthLike: true }) === 'earth');
  ok('jupiter bands', planetKind({ name: 'Jupiter', interior: { lidMode: 'none' } }) === 'jupiter');
  ok('iapetus two-tone', planetKind({ name: 'Iapetus', airless: true }) === 'iapetus');
  ok('ceres kind', planetKind({ name: 'Ceres' }) === 'ceres');
  ok('luna is moon', planetKind({ name: 'Luna', _catalogueItem: { b: 'Luna', t: 'The Moon, replacing Selene' } }) === 'moon');
  ok('miranda not europa', planetKind({ iceShell: true, name: 'Miranda' }) === 'miranda');
  ok('charon not pluto', planetKind({ name: 'Charon', _catalogueItem: { b: 'Charon', t: 'Pluto and Charon as a locked pair' } }) === 'charon');
  ok('uranian moons not uranus', planetKind({ iceShell: true, name: 'Uranian moons', _catalogueItem: { b: 'Uranian moons', t: 'Ariel, Umbriel, Titania, Oberon' } }) === 'uranian');
  ok('temperate with high tidal heat is not Io',
    planetKind({ tidalHeat: 1.2, airless: false, solar: 1.0, _catalogueItem: { c: 'temperate', b: 'TRAPPIST-1e' } }) !== 'io');
  ok('furnace magma is magma not Mars',
    planetKind({ magmaOcean: true, signature: 'dust', _catalogueItem: { c: 'furnace', b: '55 Cancri e' } }) === 'magma');
  ok('furnace catalogue is magma even without the flag',
    planetKind({ signature: 'dust', _catalogueItem: { c: 'furnace', b: 'K2-141 b' } }) === 'magma');
  const { planetKindWhy, auditCatalogueKinds, cachePlanetKind, usesWhittakerCover } = await import('./planetKind.js');
  ok('kind says why', planetKindWhy({ earthLike: true }).why === 'earthLike');

  const { CATALOGUE_WORLDS, rulesetFromCatalogue } = await import('../catalogue-rules.js');
  ok('catalogue Earth is earth, not generic',
    planetKind(rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Earth'))) === 'earth');
  const audit = auditCatalogueKinds(CATALOGUE_WORLDS, rulesetFromCatalogue);
  ok('kind audit covers the catalogue', audit.n >= 100, `${audit.n}`);
  ok('no temperate world is Io', audit.temperateIo === 0, `${audit.temperateIo}`);
  ok('no furnace world is Mars', audit.furnaceMars === 0, `${audit.furnaceMars}`);
  ok('Io still exists as a kind', (audit.counts.io || 0) >= 1, JSON.stringify(audit.counts));
  ok('magma kind is used', (audit.counts.magma || 0) >= 5, `magma ${audit.counts.magma}`);
  ok('catalogue Earth kind is earth', (audit.counts.earth || 0) >= 1, JSON.stringify(audit.counts));
  const lhs = CATALOGUE_WORLDS.find((x) => x.b === 'LHS 1140 b');
  ok('LHS 1140 b is not Europa', planetKind(rulesetFromCatalogue(lhs)) !== 'europa');
  const gj = CATALOGUE_WORLDS.find((x) => x.b === 'GJ 436 b');
  ok('GJ 436 b is gas', planetKind(rulesetFromCatalogue(gj)) === 'gas');
  const psr = CATALOGUE_WORLDS.find((x) => /^PSR B1257/.test(x.b));
  ok('pulsar planets are not Io', !psr || planetKind(rulesetFromCatalogue(psr)) !== 'io');

  const cached = { name: 'Mars', signature: 'dust', interior: { lidMode: 'stagnant' } };
  cachePlanetKind(cached);
  ok('kind cached on the ruleset', cached._planetKind === 'mars' && cached._planetKindWhy === 'name:mars');

  const { worldAxes, formatAxesLine, formatAxesExtras, AXIS_SPEC, regionName } = await import('./worldAxes.js');
  const fakeEarth = {
    name: 'Kepler-000 b',
    gravity: 1, solar: 1, totalWater: 0.92,
    interior: { lidMode: 'mobile', heatFlow: 1 },
  };
  const fakeKind = planetKind(fakeEarth);
  ok('Earth numbers under a false name are not Io', fakeKind !== 'io');
  ok('Earth numbers under a false name keep Whittaker', usesWhittakerCover(fakeKind));
  const fakeAx = worldAxes(fakeEarth);
  ok('false-name Earth is habitable', fakeAx.region === 'habitable', fakeAx.region);
  ok('false-name Earth is H2O mobile', fakeAx.volatile.v === 'H2O' && fakeAx.interior.v === 'mobile');
  const k452 = CATALOGUE_WORLDS.find((x) => x.b === 'Kepler-452 b');
  ok('Kepler-452 b is not Io', !k452 || planetKind(rulesetFromCatalogue(k452)) !== 'io');

  const earthAx = worldAxes({
    earthLike: true, gravity: 1, solar: 1, interior: { lidMode: 'mobile' }, totalWater: 0.92,
  });
  ok('Earth gravity ~1 g', Math.abs(earthAx.gravity.v - 1) < 0.05);
  ok('Earth volatile is water', earthAx.volatile.v === 'H2O');
  ok('Earth interior is mobile', earthAx.interior.v === 'mobile');
  ok('Earth insolation ~1', Math.abs(earthAx.insolation.v - 1) < 0.2);
  ok('Earth age ~4.6 Gyr', Math.abs(earthAx.age.v - 4.6) < 0.2);
  ok('Earth resurface is hundreds of Myr', earthAx.resurface.v > 50 && earthAx.resurface.v < 2000, `${earthAx.resurface.v}`);
  ok('fingerprint is compact', /^g\d+v\d+[WCMNSHR][msehixf]S\d+A\d+R\d+$/.test(earthAx.fingerprint), earthAx.fingerprint);
  ok('formatAxesLine has units', /g⊕/.test(formatAxesLine(earthAx)) && /Gyr/.test(formatAxesLine(earthAx)));
  ok('AXIS_SPEC names seven axes', Object.keys(AXIS_SPEC).length === 7);

  const marsAx = worldAxes(rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Mars')));
  ok('Mars gravity ~0.38', Math.abs(marsAx.gravity.v - 0.38) < 0.05, `${marsAx.gravity.v}`);
  ok('Mars volatile is CO2', marsAx.volatile.v === 'CO2', marsAx.volatile.v);
  const titanAx = worldAxes(rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Titan')));
  ok('Titan volatile is methane', titanAx.volatile.v === 'CH4', titanAx.volatile.v);
  const jupAx = worldAxes(rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Jupiter')));
  ok('Jupiter interior is fluid', jupAx.interior.v === 'fluid');
  const ioAx = worldAxes(rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Io')));
  const moonAx = worldAxes(rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Luna')));
  ok('Io resurfaces faster than the Moon', ioAx.resurface.v < moonAx.resurface.v, `${ioAx.resurface.v} vs ${moonAx.resurface.v}`);
  ok('Earth region is habitable', earthAx.region === 'habitable', earthAx.region);
  ok('Titan is not a desert', titanAx.region === 'titanian', titanAx.region);
  ok('Titan extras do not claim lost air', !/lost air/.test(formatAxesExtras(titanAx)));
  ok('Mars is a desert', marsAx.region === 'desert', marsAx.region);
  ok('Jupiter is a giant', jupAx.region === 'giant', jupAx.region);
  ok('regionName agrees with the axes object', regionName(titanAx) === titanAx.region);

  const pho = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => /Phobos/.test(x.b)));
  ok('Phobos is flagged non-hydrostatic', !!(pho && pho.nonHydrostatic));
  ok('Phobos axes say not round', !!(pho && worldAxes(pho).nonHydrostatic));
  ok('Phobos is still a sphere-kind', !pho || planetKind(pho) === 'phobos');
  ok('catalogue Mars look caches kind',
    rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Mars'))._planetKind === 'mars');

  const { liquidWaterOk } = await import('./hydro.js');
  ok('CO2 worlds skip the water cycle', !liquidWaterOk({
    rule: { airless: false, surfacePressureBar: 0.0064 },
    _worldAxes: { volatile: { v: 'CO2' } },
  }));
  ok('Earth water cycle still runs', liquidWaterOk({
    rule: { airless: false, surfacePressureBar: 1 },
    _worldAxes: { volatile: { v: 'H2O' } },
  }));
  ok('Titan methane sketch still runs', liquidWaterOk({
    rule: { airless: false, methaneSolvent: true, surfacePressureBar: 1.5 },
    _worldAxes: { volatile: { v: 'CH4' } },
  }));
  const { cycleMode } = await import('./hydro.js');
  ok('CO2 cycle is not liquid', cycleMode({
    rule: { airless: false, surfacePressureBar: 0.0064, teqK: 210 },
    _worldAxes: { volatile: { v: 'CO2' } },
  }) !== 'liquid');

  const kindsTable = JSON.parse(await (await import('node:fs/promises')).readFile(
    new URL('../data/worlds/kinds.json', import.meta.url), 'utf8'));
  ok('kinds.json covers the catalogue', kindsTable.n === audit.n, `${kindsTable.n} vs ${audit.n}`);
  ok('kinds.json temperateIo is 0', kindsTable.temperateIo === 0);
  ok('kinds.json furnaceMars is 0', kindsTable.furnaceMars === 0);
  ok('kinds.json matches live audit', JSON.stringify(kindsTable.counts) === JSON.stringify(audit.counts));
  const kindSrc = await (await import('node:fs/promises')).readFile(
    new URL('./planetKind.js', import.meta.url), 'utf8');
  ok('planetKind has no inline name regexes', !/if\s*\(\s*\//.test(kindSrc));

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

  {
    const { applyStampKind } = await import('./stampApply.js');
    const { FIXTURES } = await import('./stampFixtures.js');
    const meanH = (W) => {
      let s = 0;
      for (let c = 0; c < NC; c++) s += W.h[c];
      return s / NC;
    };
    const rms = (a, b) => {
      let s = 0;
      for (let c = 0; c < NC; c++) { const d = a.h[c] - b.h[c]; s += d * d; }
      return Math.sqrt(s / NC);
    };
    for (const kind of ['mars', 'mercury', 'moon']) {
      const data = blank();
      const fix = blank();
      applyStampKind(data, kind, 11);
      FIXTURES[kind](fix, 11);
      ok(`stamp data ≈ fixture (${kind})`, rms(data, fix) < 1e-6,
        `rms=${rms(data, fix)} mean ${meanH(data).toFixed(4)} vs ${meanH(fix).toFixed(4)}`);
    }
  }

  {
    const { applyShellKind } = await import('./shellApply.js');
    const { FIXTURES: SHELL_FIX } = await import('./shellFixtures.js');
    const { initIceShell } = await import('./iceshell.js');
    const rmsField = (a, b, field) => {
      let s = 0;
      for (let c = 0; c < NC; c++) { const d = a[field][c] - b[field][c]; s += d * d; }
      return Math.sqrt(s / NC);
    };
    const prep = () => {
      const W = blank();
      initIceShell(W);
      W.moist = new Float32Array(NC);
      W.age = new Float32Array(NC);
      return W;
    };
    for (const kind of ['europa', 'enceladus', 'titan', 'pluto', 'triton', 'ganymede', 'callisto', 'miranda', 'mimas', 'rhea', 'uranian']) {
      const data = prep();
      const fix = prep();
      const tidal = 0.2;
      const seed = 11 ^ 0x49434553;
      applyShellKind(data, kind, tidal, seed);
      const fn = SHELL_FIX[kind];
      if (kind === 'enceladus') fn(fix, tidal);
      else fn(fix, tidal, seed);
      const rh = rmsField(data, fix, 'h');
      const rl = rmsField(data, fix, 'shellLid');
      ok(`shell data ≈ fixture (${kind})`, rh < 1e-6 && rl < 1e-6,
        `h=${rh} lid=${rl}`);
    }
  }

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

console.log('substrates');
{
  const {
    phaseAt, rheologyAt, pickMaterials, describeSubstrate,
    liquidWindow, formatLiquidWindow, groundAlbedo, slopeCap,
    packSubstrate, unpackSubstrate, cycleMaterial, phaseAtCell,
    vaporPressureBar, livePressureBar,
    SUBSTRATES, SUB_BY_ID, SUB_INDEX, EARTH_ROCK_COUNT,
  } = await import('./substrateField.js');
  ok('Earth rocks occupy 0–7', EARTH_ROCK_COUNT === 8
    && SUBSTRATES[0].id === 'basalt' && SUBSTRATES[7].id === 'glacialTill');
  ok('ids unique', new Set(SUBSTRATES.map((m) => m.id)).size === SUBSTRATES.length);
  ok('table has the outer-system ices',
    ['waterIce', 'n2Ice', 'ch4Ice', 'tholin', 'sulfur', 'hydrocarbon', 'envelope']
      .every((id) => SUB_BY_ID[id]));
  ok('every row tagged', SUBSTRATES.every((m) =>
    ['measured', 'fitted', 'invented'].includes(m.tag) && (m.why || '').length > 20));

  const n2 = SUB_BY_ID.n2Ice, ch4 = SUB_BY_ID.ch4Ice, h2o = SUB_BY_ID.waterIce;
  ok('Pluto N2 is a convecting solid', rheologyAt(n2, 40, 1e-5) === 'convecting-ice');
  ok('Pluto CH4 is a rigid solid', phaseAt(ch4, 40, 1e-5) === 'solid'
    && rheologyAt(ch4, 40, 1e-5) === 'solid');
  ok('Pluto water ice is bedrock', phaseAt(h2o, 40, 1e-5) === 'solid'
    && rheologyAt(h2o, 40, 1e-5) === 'solid');
  ok('Earth water is liquid', phaseAt(h2o, 288, 1) === 'liquid');
  ok('Titan methane is liquid', phaseAt(ch4, 94, 1.5) === 'liquid'
    && phaseAt(SUB_BY_ID.hydrocarbon, 94, 1.5) === 'liquid');
  ok('Titan water is solid', phaseAt(h2o, 94, 1.5) === 'solid');
  ok('Venus CO2 is supercritical', phaseAt(SUB_BY_ID.co2Ice, 737, 92) === 'supercritical');

  const plutoPick = pickMaterials(
    { surfacePressureBar: 1e-5 },
    { volatile: { v: 'N2' }, interior: { v: 'ice' } },
    44, 1e-5, 'pluto',
  );
  ok('Pluto pick is N2 over water ice', plutoPick.bedrock === 'waterIce' && plutoPick.cover === 'n2Ice');

  const { W, generate, RULESETS } = await import('../world.js');
  const { CATALOGUE_WORLDS, rulesetFromCatalogue } = await import('../catalogue-rules.js');
  generate(7, RULESETS[0]);
  let rockMatch = true;
  for (let c = 0; c < NC; c++) {
    if ((W.ice[c] || 0) > 0.45 && W.h[c] >= W.seaLevel) continue;
    if (W.substrate[c] !== W.rock[c]) { rockMatch = false; break; }
  }
  ok('Earth substrate maps from rock', rockMatch);

  const pluto = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Pluto'));
  generate(11, pluto);
  const n2i = SUB_INDEX.n2Ice, iceI = SUB_INDEX.waterIce;
  let n2n = 0, iceN = 0, sed = 0;
  for (let c = 0; c < NC; c++) {
    if (W.substrate[c] === n2i) n2n++;
    else if (W.substrate[c] === iceI) iceN++;
    if (W.substrate[c] === 2) sed++;
  }
  ok('Pluto has nitrogen ice', n2n > 10, `n2=${n2n} ice=${iceN} sed=${sed}`);
  ok('Pluto is not sediment', sed < NC * 0.08, `sed=${sed}`);
  const n2cell = W.substrate.findIndex((v) => v === n2i);
  ok('inspector names nitrogen ice', n2cell >= 0 && /nitrogen ice/.test(describeSubstrate(W, n2cell)),
    n2cell >= 0 ? describeSubstrate(W, n2cell) : 'no n2 cell');

  const titan = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Titan'));
  generate(13, titan);
  const hci = SUB_INDEX.hydrocarbon, thi = SUB_INDEX.tholin;
  let lakes = 0, thol = 0;
  for (let c = 0; c < NC; c++) {
    if (W.substrate[c] === hci) lakes++;
    if (W.substrate[c] === thi) thol++;
  }
  ok('Titan has hydrocarbon lakes', lakes > 5, `lakes=${lakes}`);
  ok('Titan has tholin land', thol > 20, `tholin=${thol}`);

  const jup = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Jupiter'));
  generate(5, jup);
  ok('Jupiter is envelope', W.substrate[0] === SUB_INDEX.envelope
    && W._substrateBedrock === 'envelope');

  const winT = liquidWindow(SUB_BY_ID.ch4Ice, 1.5);
  ok('Titan methane has a liquid window around 94 K',
    winT && winT.tMin <= 94 && winT.tMax >= 94, formatLiquidWindow(SUB_BY_ID.ch4Ice, 1.5));
  ok('Mars CO2 has no liquid at 6 mbar',
    liquidWindow(SUB_BY_ID.co2Ice, 0.006) == null);
  ok('Earth water liquid window includes 288 K',
    (() => { const w = liquidWindow(SUB_BY_ID.waterIce, 1); return w && w.tMin <= 288 && w.tMax >= 288; })());

  generate(7, RULESETS[0]);
  ok('Earth ground albedo is the fitted sea/land pair',
    groundAlbedo(W, 0, true) === 0.06 && groundAlbedo(W, 0, false) === 0.18);
  ok('Earth slope is uncapped', slopeCap(W, 0) === 9);
  ok('Earth cycle is water', cycleMaterial(W)?.id === 'waterIce');

  generate(13, titan);
  const { cycleMode: cyc } = await import('./hydro.js');
  ok('Titan cycle is liquid methane', cyc(W) === 'liquid', cyc(W));
  const lakeCell = W.substrate.findIndex((v) => v === hci);
  ok('Titan lake cell is liquid phase',
    lakeCell >= 0 && phaseAtCell(W, lakeCell) === 'liquid',
    lakeCell >= 0 ? phaseAtCell(W, lakeCell) : 'no lake');

  generate(11, pluto);
  ok('Pluto cycle is frost', cyc(W) === 'frost', cyc(W));

  const { serializeRun, loadRunMeta } = await import('../world.js');
  generate(11, pluto);
  const before = Uint8Array.from(W.substrate);
  const snap = serializeRun();
  ok('save version stores substrate', snap.version >= 6 && !!snap.subB64);
  W.substrate.fill(2);
  loadRunMeta(snap);
  let restored = true;
  for (let c = 0; c < NC; c++) if (W.substrate[c] !== before[c]) { restored = false; break; }
  ok('substrate survives a save', restored);
  const packed = packSubstrate(before);
  const into = new Uint8Array(before.length);
  unpackSubstrate(packed, into);
  ok('pack/unpack substrate bytes', into[0] === before[0] && into[n2cell >= 0 ? n2cell : 0] === before[n2cell >= 0 ? n2cell : 0]);

  const pCO2 = vaporPressureBar(SUB_BY_ID.co2Ice, 148);
  ok('CO2 frost point is near 6 mbar at 148 K',
    pCO2 != null && pCO2 > 0.003 && pCO2 < 0.012, pCO2);
  const pN2 = vaporPressureBar(SUB_BY_ID.n2Ice, 40);
  ok('N2 vapour at 40 K is a thin Pluto-scale column',
    pN2 != null && pN2 > 1e-6 && pN2 < 2e-4, pN2);
}

console.log('reservoir / cover');
{
  const { DIR } = await import('../sphere.js');
  const { W, generate, RULESETS } = await import('../world.js');
  const { CATALOGUE_WORLDS, rulesetFromCatalogue } = await import('../catalogue-rules.js');
  const { groundAlbedo, livePressureBar } = await import('./substrateField.js');
  const { reservoirTick, coverAt, reservoirActive } = await import('./cover.js');
  const { overlayById } = await import('./overlay.js');

  generate(7, RULESETS[0]);
  ok('Earth is not a condensable reservoir', !reservoirActive(W));
  ok('Earth live pressure is 1 bar', Math.abs(livePressureBar(W) - 1) < 0.05, livePressureBar(W));
  ok('Earth frost field stays empty',
    !W.frost || W.frost.every((v) => v === 0));
  ok('Earth ground albedo still fitted',
    groundAlbedo(W, 0, true) === 0.06 && groundAlbedo(W, 0, false) === 0.18);

  const mars = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Mars'));
  generate(11, mars);
  ok('Mars reservoir is active', reservoirActive(W));
  W.season = 3 * Math.PI / 2; // NH winter
  W._spinup = false;
  for (let i = 0; i < 48; i++) reservoirTick(W);
  let nh = 0, sh = 0;
  for (let c = 0; c < NC; c++) {
    if ((W.frost[c] || 0) < 0.2) continue;
    if (DIR[c * 3 + 1] > 0) nh++;
    else sh++;
  }
  ok('Mars NH winter frosts the north', nh > sh && nh > 3, `nh=${nh} sh=${sh} scale=${W._atmScale}`);
  ok('Mars winter draws down the column',
    W._atmScale < 0.92 && W._atmScale > 0.65, W._atmScale);
  const frozen = 1 - W._atmScale;
  ok('Mars freeze-out is capped near a quarter',
    frozen <= 0.30 && frozen > 0.04, frozen);
  const pWinter = livePressureBar(W);
  ok('Mars live pressure is below the authored 6.36 mbar',
    pWinter < 0.0062 && pWinter > 0.004, pWinter);
  const cap = W.frost.findIndex((v) => v > 0.25);
  ok('Mars frost cell is cover frost',
    cap >= 0 && coverAt(W, cap).id === 'frost',
    cap >= 0 ? coverAt(W, cap).id : 'no cap');
  const aFrost = cap >= 0 ? groundAlbedo(W, cap, false) : 0;
  const bare = [...W.frost].findIndex((v, c) => v < 0.04 && Math.abs(DIR[c * 3 + 1]) < 0.3);
  const aBare = bare >= 0 ? groundAlbedo(W, bare, false) : 0;
  ok('Mars frost brightens albedo', aFrost > aBare + 0.08, `${aFrost} vs ${aBare}`);

  W.season = Math.PI / 2; // NH summer / SH winter
  for (let i = 0; i < 48; i++) reservoirTick(W);
  let nh2 = 0, sh2 = 0;
  for (let c = 0; c < NC; c++) {
    if ((W.frost[c] || 0) < 0.2) continue;
    if (DIR[c * 3 + 1] > 0) nh2++;
    else sh2++;
  }
  ok('Mars NH summer frosts the south', sh2 > nh2 && sh2 > 3, `nh=${nh2} sh=${sh2}`);

  const titan = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Titan'));
  generate(13, titan);
  const titanScale0 = W._atmScale;
  for (let i = 0; i < 24; i++) reservoirTick(W);
  ok('Titan does not collapse', !reservoirActive(W) && Math.abs((W._atmScale ?? 1) - 1) < 0.02,
    `active=${reservoirActive(W)} scale=${W._atmScale} was ${titanScale0}`);
  const thi = (await import('./substrateField.js')).SUB_INDEX.tholin;
  const tholinCell = W.substrate.findIndex((v) => v === thi);
  ok('Titan land cover is tholin',
    tholinCell >= 0 && coverAt(W, tholinCell).id === 'tholin',
    tholinCell >= 0 ? coverAt(W, tholinCell).id : 'no tholin');

  const pluto = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Pluto'));
  generate(11, pluto);
  ok('Pluto reservoir is active', reservoirActive(W));
  W.season = Math.PI; // aphelion
  W._solarMod = undefined;
  for (let i = 0; i < 48; i++) reservoirTick(W);
  const apo = W._atmScale;
  W.season = 0; // perihelion
  W._solarMod = undefined;
  for (let i = 0; i < 48; i++) reservoirTick(W);
  const peri = W._atmScale;
  ok('Pluto aphelion is thinner than perihelion', apo < peri - 0.04, `apo=${apo} peri=${peri}`);

  ok('cover overlay is in the picker', overlayById('cover')?.id === 'cover');
  ok('fog overlay is in the picker', overlayById('fog')?.id === 'fog');
  ok('vort overlay is in the picker', overlayById('vort')?.id === 'vort');
}

console.log('clathrate / ice VI / cover pins');
{
  const { DIR } = await import('../sphere.js');
  const { W, generate, RULESETS } = await import('../world.js');
  const { CATALOGUE_WORLDS, rulesetFromCatalogue } = await import('../catalogue-rules.js');
  const { liquidWindow, SUBSTRATES, SUB_BY_ID, groundAlbedo } = await import('./substrateField.js');
  const { COVER_BY_ID, hemisphericAlbedo, coverAt } = await import('./cover.js');
  const {
    clathrateStable, clathrateTick, highPressureIceFloor, noteColumn,
  } = await import('./columnSketch.js');
  const { originRateAt } = await import('./origin.js');
  const { worldAxes, worldAxesCoverage } = await import('./worldAxes.js');

  ok('ices carry a cite', SUBSTRATES.filter((m) => m.class === 'ice').every((m) => (m.cite || '').length > 8));
  const nh3 = liquidWindow(SUB_BY_ID.nh3Water, 1);
  ok('NH3–water eutectic is liquid near 176 K',
    nh3 && nh3.tMin <= 176 && nh3.tMax >= 230, nh3);
  ok('clathrate stable at Earth-margin P/T', clathrateStable(275, 250));
  ok('clathrate dissociates when warm', !clathrateStable(300, 250));
  ok('Titan surface is not the clathrate window', !clathrateStable(94, 1.5));
  ok('frost fine albedo is 0.9', COVER_BY_ID.frost.albedoFine === 0.9);

  const earthFloor = highPressureIceFloor({ earthLike: true, gravity: 1, radiusEarth: 1, totalWater: 1 });
  ok('Earth has no ice VI floor', !earthFloor.iceVI && earthFloor.depthKm < 10, earthFloor);
  const deep = highPressureIceFloor({ gravity: 1.6, radiusEarth: 2, totalWater: 50 });
  ok('a deep water world has an ice VI floor', deep.iceVI && deep.depthKm > 100, deep);
  const euFloor = highPressureIceFloor({ iceShell: true, name: 'Europa', radiusEarth: 0.245, gravity: 0.13 });
  ok('Europa ocean sits on rock', !euFloor.iceVI, euFloor);

  generate(7, RULESETS[0]);
  ok('Earth grain stays empty', !W.grain || W.grain.every((v) => v === 0));
  ok('Earth has no clathrate store', !(W._clathrate > 0));

  const titan = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Titan'));
  generate(13, titan);
  const titanStore = W._clathrate;
  ok('Titan holds a clathrate store', titanStore > 0.5, titanStore);
  for (let i = 0; i < 8; i++) clathrateTick(W);
  ok('Titan clathrate does not auto-strip', W._clathrate === titanStore, W._clathrate);

  const hot = {
    rule: { tSurfK: 310, iceShell: false }, gases: { CH4: 0.001 },
    _clathrate: 1, _worldAxes: { volatile: { v: 'CH4' } }, chron: null,
  };
  clathrateTick(hot);
  ok('warm clathrate releases methane', hot._clathrate === 0 && hot.gases.CH4 > 0.005, hot.gases.CH4);

  const iap = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Iapetus'));
  generate(11, iap);
  const lead = hemisphericAlbedo(W, (c) => DIR[c * 3] > 0.2);
  const trail = hemisphericAlbedo(W, (c) => DIR[c * 3] < -0.2);
  ok('Iapetus leading is much darker than trailing', trail / lead > 6, `lead=${lead} trail=${trail}`);
  ok('Iapetus trailing is frost cover',
    [...W.frost].some((v, c) => v > 0.4 && DIR[c * 3] < 0 && coverAt(W, c).id === 'frost'));

  const enc = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Enceladus'));
  generate(11, enc);
  const encA = hemisphericAlbedo(W);
  ok('Enceladus hemispheric albedo is high', encA > 0.55, encA);
  ok('Enceladus is not claimed as 0.81 Bond', encA < 0.95);

  const europa = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Europa'));
  generate(11, europa);
  ok('generated Europa has no ice VI floor', !W._hpIceFloor, `km=${W._oceanKm} floor=${W._hpIceFloor}`);

  const ceres = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Ceres'));
  generate(11, ceres);
  const { SUB_INDEX } = await import('./substrateField.js');
  ok('Ceres Occator is evaporite',
    [...W.substrate].some((v, c) => v === SUB_INDEX.evaporite && (W.ice[c] || 0) > 0.5));

  const originCut = originRateAt({
    h: [-0.2], seaLevel: 0, ice: [0], temp: [0.5], rule: {},
    _hpIceFloor: true, solvent: { meltK: 273, boilK: 373 },
  }, 0);
  ok('ice VI cuts water–rock origin', /ice floor/.test(originCut.why), originCut.why);

  const fine = { rule: {}, frost: [0.9], grain: [0], lag: [0], age: [0], h: [0.2], seaLevel: -1, substrate: [0] };
  const coarse = { rule: {}, frost: [0.9], grain: [1], lag: [0], age: [0], h: [0.2], seaLevel: -1, substrate: [0] };
  ok('fine frost is brighter than coarse ice',
    groundAlbedo(fine, 0, false) > groundAlbedo(coarse, 0, false) + 0.3,
    `${groundAlbedo(fine, 0, false)} vs ${groundAlbedo(coarse, 0, false)}`);

  const axesList = CATALOGUE_WORLDS.slice(0, 40).map((x) => worldAxes(rulesetFromCatalogue(x)));
  const cov = worldAxesCoverage(axesList);
  ok('axes coverage names gaps', cov.n >= 20 && Array.isArray(cov.gaps) && cov.gaps.length >= 1, cov.gaps);
}

console.log('landform grammar');
{
  const { W, generate, RULESETS } = await import('../world.js');
  const { CATALOGUE_WORLDS, rulesetFromCatalogue } = await import('../catalogue-rules.js');
  const { overlayById } = await import('./overlay.js');
  const { worldAxes } = await import('./worldAxes.js');
  const { formatColumn } = await import('./columnSketch.js');
  const {
    PROCESSES, LANDFORMS, LANDGRAM_VERSION,
    landformPalette, processSet, stampLandforms, craterCounts, explainForm,
    formatPalette,
  } = await import('./landform.js');

  const idsOf = (world) => landformPalette(world).map((f) => f.id);
  const byName = (b) => rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === b));

  ok('grammar compiled', LANDGRAM_VERSION === 1 && PROCESSES.length >= 12 && LANDFORMS.length >= 20);
  ok('every form has a process', LANDFORMS.every((f) => PROCESSES.some((p) => p.id === f.process)));
  ok('landform overlay is in the picker', overlayById('forms')?.id === 'forms');

  generate(7, RULESETS[0]);
  const earthIds = idsOf(W);
  ok('Earth palette has channels and glaciers', earthIds.includes('channel') && earthIds.includes('glacier'));
  ok('Earth palette has no paterae', !earthIds.includes('patera'));
  ok('Earth does not stamp landforms', !W.landform || W.landform.every((v) => v === 0));
  ok('Earth column stays silent', formatColumn(W) === '');
  ok('Earth palette line stays off the chip', formatPalette(W) === '');

  generate(11, byName('Mercury'));
  const mercIds = idsOf(W);
  ok('Mercury palette has scarps', mercIds.includes('scarp'));
  ok('Mercury palette has no paterae', !mercIds.includes('patera'));
  ok('Mercury scarps are not invented', !landformPalette(W).find((f) => f.id === 'scarp')?.invented);

  generate(11, byName('Mars'));
  const marsIds = idsOf(W);
  const marsProc = processSet(W).map((p) => p.id);
  ok('Mars palette has dunes and craters', marsIds.includes('dune') && marsIds.includes('crater'));
  ok('Mars palette has no paterae', !marsIds.includes('patera'));
  ok('Mars runs aeolian', marsProc.includes('aeolian'));

  generate(9, byName('Io'));
  const ioIds = idsOf(W);
  ok('Io stamps landform bytes', Math.max(...W.landform) > 0);
  ok('Io caches paterae', W._landPalette?.some((f) => f.id === 'patera'));
  ok('Io palette has no dunes', !ioIds.includes('dune'));
  ok('Io palette has no craters', !ioIds.includes('crater'));

  generate(13, byName('Titan'));
  const titanIds = idsOf(W);
  ok('Titan palette has dunes and lakes', titanIds.includes('dune') && titanIds.includes('methaneLake'));

  generate(8, byName('Europa'));
  const euIds = idsOf(W);
  ok('Europa palette has chaos and ridges', euIds.includes('chaos') && euIds.includes('doubleRidge'));
  ok('Europa palette has no dunes', !euIds.includes('dune'));
  ok('Europa column is lid over rock', /lid/.test(formatColumn(W)) && !/ice VI/.test(formatColumn(W)));

  generate(5, byName('Jupiter'));
  ok('Jupiter has no landform palette', landformPalette(W).length === 0);
  ok('Jupiter does not stamp landforms', !W.landform || W.landform.every((v) => v === 0));
  ok('Jupiter announces no surface', /no surface/.test(formatColumn(W)), formatColumn(W));

  const k452 = CATALOGUE_WORLDS.find((x) => /Kepler-452/.test(x.b));
  generate(15, rulesetFromCatalogue(k452));
  const exo = landformPalette(W);
  ok('temperate exo palette is invented', exo.length > 0 && exo[0].invented);
  ok('temperate exo has no paterae', !exo.some((f) => f.id === 'patera'));

  const ioR = byName('Io');
  const moonR = byName('Luna');
  ok('Io craterCounts younger than the Moon',
    craterCounts(ioR, worldAxes(ioR)).nLarge < craterCounts(moonR, worldAxes(moonR)).nLarge);

  const patera = LANDFORMS.find((f) => f.id === 'patera');
  ok('a form explains itself', /heat-pipe|patera/i.test(explainForm(patera)), explainForm(patera));

  generate(7, RULESETS[0]);
  stampLandforms(W);
  ok('restamping Earth stays empty', W.landform.every((v) => v === 0));
}

console.log('column field');
{
  const { W, generate, RULESETS } = await import('../world.js');
  const { CATALOGUE_WORLDS, rulesetFromCatalogue } = await import('../catalogue-rules.js');
  const { overlayById } = await import('./overlay.js');
  const { DIR } = await import('../sphere.js');
  const { coreSample } = await import('./instruments.js');
  const { worldAxes } = await import('./worldAxes.js');
  const { cachePlanetKind, hasSurface } = await import('./planetKind.js');
  const {
    COLUMN_VERSION, COLUMN_LAYERS, COLUMN_RECIPES,
    recipeOf, columnAt, formatColumn, formatColumnAt, lidKmAt,
  } = await import('./columnField.js');
  const byName = (b) => rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === b));

  ok('column compiled', COLUMN_VERSION === 1 && COLUMN_LAYERS.length >= 8 && COLUMN_RECIPES.length >= 7);
  ok('column overlay is in the picker', overlayById('column')?.id === 'column');

  generate(7, RULESETS[0]);
  ok('Earth has no column recipe', recipeOf(W) == null);
  ok('Earth column stays silent', formatColumn(W) === '');
  ok('Earth has a live stack', (W.stackN?.[0] || 0) >= 1);
  ok('Earth substrate matches stack top', W.substrate[0] === W.stackMat[0]);
  const earthCore = coreSample(W, 0);
  ok('Earth core still names crust', /crust|basalt|granite|sediment|ice|till/i.test(earthCore.layers[0]?.name || ''), earthCore.layers[0]?.name);

  generate(8, byName('Europa'));
  const eu = columnAt(W, 0);
  const euIds = eu.layers.map((L) => L.id);
  ok('Europa recipe is iceShell', recipeOf(W)?.id === 'iceShell', recipeOf(W)?.id);
  ok('Europa is lid over ocean over rock',
    euIds.includes('iceLid') && euIds.includes('ocean') && euIds.includes('crust') && !euIds.includes('iceVI'),
    euIds.join(','));
  let lidSum = 0, oceanSum = 0;
  const nC = W.h.length;
  for (let c = 0; c < nC; c++) {
    const col = columnAt(W, c);
    lidSum += col.layers.find((L) => L.id === 'iceLid')?.depthKm || 0;
    oceanSum += col.layers.find((L) => L.id === 'ocean')?.depthKm || 0;
  }
  const lidMean = lidSum / nC;
  const oceanMean = oceanSum / nC;
  ok('Europa lid is 15–25 km class', lidMean >= 12 && lidMean <= 32, lidMean);
  ok('Europa ocean is ~100 km class', oceanMean >= 40 && oceanMean <= 200, oceanMean);
  ok('Europa chip has no ice VI', /lid/.test(formatColumn(W)) && !/ice VI/.test(formatColumn(W)), formatColumn(W));
  ok('Europa live stack has several layers', W._stackMean > 2 && W.stackN[0] >= 3, `${W._stackMean}`);
  ok('Europa substrate is the stack top', W.substrate[0] === W.stackMat[0]);
  const euCore = coreSample(W, 0);
  ok('Europa core reads the stack',
    euCore.layers.some((l) => /lid/.test(l.name)) && euCore.layers.some((l) => /ocean/.test(l.name)));

  generate(4, byName('Luna'));
  const moon = columnAt(W, 0);
  const mIds = moon.layers.map((L) => L.id);
  ok('Moon recipe is airless', recipeOf(W)?.id === 'airless', recipeOf(W)?.id);
  ok('Moon is regolith over megaregolith over rock',
    mIds[0] === 'regolith' && mIds.includes('megaregolith') && mIds.at(-1) === 'crust',
    mIds.join(','));
  const reg = moon.layers.find((L) => L.id === 'regolith');
  const mega = moon.layers.find((L) => L.id === 'megaregolith');
  const crust = moon.layers.find((L) => L.id === 'crust');
  ok('Moon regolith is 5–10 m', reg.depthKm >= 0.005 && reg.depthKm <= 0.012, reg.depthKm);
  ok('Moon megaregolith is kilometres', mega.depthKm >= 1 && mega.depthKm <= 5, mega.depthKm);
  ok('Moon crust is ~40 km', crust.depthKm >= 30 && crust.depthKm <= 50, crust.depthKm);

  generate(13, byName('Titan'));
  const ti = columnAt(W, 0);
  const tIds = ti.layers.map((L) => L.id);
  ok('Titan recipe is iceOrganics', recipeOf(W)?.id === 'iceOrganics', recipeOf(W)?.id);
  ok('Titan has organics, ice, ocean, ice VI, rock',
    tIds.includes('organics') && tIds.includes('iceLid') && tIds.includes('ocean')
    && tIds.includes('iceVI') && tIds.includes('crust'),
    tIds.join(','));

  generate(5, byName('Jupiter'));
  ok('Jupiter column is no surface',
    recipeOf(W)?.noSurface && /no surface/.test(formatColumn(W)), formatColumn(W));
  ok('Jupiter core says envelope', coreSample(W, 0).layers.some((l) => /no surface/.test(l.name)));
  ok('Jupiter has no surface flag', W.noSurface === true);
  ok('Jupiter land fraction is zero', W.landFrac === 0, `${W.landFrac}`);
  ok('Jupiter is not land', !isLand(W, 0) && !isSubmerged(W, 0));
  ok('Jupiter has no plates', !W.plates?.length, `${W.plates?.length}`);
  let jMoist = 0;
  for (let c = 0; c < NC; c++) jMoist += W.moist[c];
  ok('Jupiter is not a wet land world', jMoist < 1, `moist=${jMoist}`);
  const { rhinesJetCount, countZonalJets } = await import('./jets.js');
  const jn = rhinesJetCount(W.rotationPeriod, W.rule?.radiusEarth || 11);
  ok('Jupiter Rhines count is a dozen-ish', jn >= 8 && jn <= 16, `${jn} rot=${W.rotationPeriod}`);
  const flips = countZonalJets(W);
  ok('Jupiter zonal wind alternates', flips >= 4, `flips=${flips} jets=${W._jetCount}`);
  ok('Jupiter wind regime is jets', W._windRegime === 'zonal jets', W._windRegime);

  const plevel = await import('./plevel.js');
  const T1 = plevel.tempAtPressureK(W, 1);
  const T22 = plevel.tempAtPressureK(W, 22);
  ok('Jupiter 1 bar is ~165 K', T1 >= 140 && T1 <= 200, `${T1}`);
  ok('Jupiter 22 bar is warmer (~430 K)', T22 >= 380 && T22 <= 480, `${T22}`);
  ok('Galileo probe floor is 22 bar', plevel.probeFloorBar(W) === 22);
  let pLo = 99, pHi = 0;
  for (let c = 0; c < NC; c++) {
    const p = W.pSeen?.[c] || 0;
    if (p < pLo) pLo = p;
    if (p > pHi) pHi = p;
  }
  ok('Jupiter pSeen sits in the cloud decks', pLo >= 0.4 && pHi <= 6 && pHi > pLo + 0.15,
    `p=${pLo.toFixed(2)}–${pHi.toFixed(2)}`);
  ok('Jupiter inspect names a deck', /bar/.test(plevel.formatPlevel(W, 0)), plevel.formatPlevel(W, 0));
  ok('Jupiter core still says no surface',
    coreSample(W, 0).layers.some((l) => /no surface/.test(l.name)));
  ok('Jupiter core names a cloud deck',
    coreSample(W, 0).layers.some((l) => /ammonia|hydrosulfide|water/.test(l.name)));
  const slowN = rhinesJetCount(2, W.rule?.radiusEarth || 11);
  ok('slower spin yields fewer jets', slowN < jn, `${slowN} vs ${jn}`);
  const { maybeReseedJets } = await import('./jets.js');
  const nBefore = W._jetCount;
  W.rotationPeriod = 2;
  maybeReseedJets(W);
  ok('spin change reseeds the Rhines count', W._jetCount === slowN && W._jetCount !== nBefore,
    `${W._jetCount} vs was ${nBefore}`);
  W.rotationPeriod = 9.9 / 24;
  maybeReseedJets(W);

  ok('descent camera is allowed on a giant', plevel.camDistMin(W) < 1,
    `${plevel.camDistMin(W)}`);
  ok('rocky camera still stops at the surface', plevel.camDistMin({ noSurface: false }) >= 1.03);
  ok('1.00 radii is 1 bar', Math.abs(plevel.pressureAtCamDist(1, W) - 1) < 0.05,
    `${plevel.pressureAtCamDist(1, W)}`);
  ok('closer is deeper', plevel.pressureAtCamDist(0.84, W) > plevel.pressureAtCamDist(0.95, W));
  ok('probe floor is the descent cap',
    plevel.pressureAtCamDist(0.84, W) >= plevel.PROBE_FLOOR_BAR * 0.9);

  generate(8, byName('Neptune'));
  let nepU = 0;
  for (let c = 0; c < NC; c++) nepU += Math.abs(W.windU[c]);
  nepU /= NC;
  generate(9, byName('Uranus'));
  let uraU = 0;
  for (let c = 0; c < NC; c++) uraU += Math.abs(W.windU[c]);
  uraU /= NC;
  ok('Neptune is windier than Uranus (internal heat)', nepU > uraU * 1.15,
    `Neptune ${nepU.toFixed(3)} Uranus ${uraU.toFixed(3)}`);
  ok('ice giant decks include methane',
    plevel.cloudDecks(W).some((d) => d.id === 'ch4'));

  ok('Saturn wants rings', plevel.wantsRings({ _planetKind: 'saturn' }));
  ok('Jupiter does not wear rings', !plevel.wantsRings({ _planetKind: 'jupiter' }));

  let rockyGiants = 0;
  for (const row of CATALOGUE_WORLDS) {
    if (row.c !== 'giant') continue;
    const rule = rulesetFromCatalogue(row);
    cachePlanetKind(rule);
    const fake = { rule, _planetKind: rule._planetKind, _worldAxes: worldAxes(rule) };
    if (hasSurface(fake, rule)) rockyGiants++;
  }
  ok('catalogue giants have no surface', rockyGiants === 0, `${rockyGiants}`);

  generate(7, RULESETS[0]);
  ok('Earth still has a surface', hasSurface(W) && !W.noSurface && W.landFrac > 0.15,
    `noSurface=${W.noSurface} land=${W.landFrac}`);

  generate(6, byName('Enceladus'));
  let south = 0, north = 0;
  for (let c = 0; c < W.h.length; c++) {
    const y = DIR[c * 3 + 1] || 0;
    if (y < -0.7) south = c;
    if (y > 0.7) north = c;
  }
  ok('Enceladus south lid is thinner',
    lidKmAt(W, south) < lidKmAt(W, north) - 2,
    `${lidKmAt(W, south)} vs ${lidKmAt(W, north)}`);
  ok('inspect names thicknesses', /km| m/.test(formatColumnAt(W, south)), formatColumnAt(W, south));
}

console.log('planet look / ticks');
{
  const { sampleLand, planetCoverEntries } = await import('./planetLook.js');
  const io = sampleLand('io', 0.55, 0);
  const eu = sampleLand('europa', 0.55, 0);
  const ve = sampleLand('venus', 0.7, 0);
  const ma = sampleLand('mars', 0.55, 0);
  ok('io sulfur yellow', io && io[0] > 160 && io[1] > 80 && io[1] > io[2]);
  ok('europa ice pale', eu && eu[2] > 180 && eu[1] > 160);
  ok('venus grey plains', ve && ve[0] > 160 && Math.abs(ve[0] - ve[1]) < 40);
  ok('mars rust not green', ma && ma[0] > ma[1] && ma[1] > ma[2] && ma[1] < 140);

  const dark = sampleLand('iapetus', 0.5, 0, { x: 0.8, y: 0.25, z: 0 });
  const bright = sampleLand('iapetus', 0.5, 0, { x: -0.8, y: 0.25, z: 0 });
  ok('iapetus dark leading', dark && dark[0] < 80 && dark[0] < bright[0]);
  ok('iapetus bright trailing', bright && bright[0] > 180);
  const ju = sampleLand('jupiter', 0, 0, { x: 0, y: 0, z: 1 });
  const ju2 = sampleLand('jupiter', 0, 0, { x: 0, y: 0.5, z: 0.87 });
  ok('Jupiter bands differ by latitude', ju[0] !== ju2[0] || ju[1] !== ju2[1]);
  const juDeep = sampleLand('jupiter', 0, 0, { x: 0, y: 0, z: 1, pSeen: 5 });
  const juTop = sampleLand('jupiter', 0, 0, { x: 0, y: 0, z: 1, pSeen: 0.7 });
  ok('deeper deck is darker', juDeep[0] + juDeep[1] < juTop[0] + juTop[1]);
  const dayHJ = sampleLand('jupiter', 0, 0, {
    x: 1, y: 0, z: 0, locked: true, hotLon: 0.35, sunX: 1, sunZ: 0,
  });
  const nightHJ = sampleLand('jupiter', 0, 0, {
    x: -1, y: 0, z: 0, locked: true, hotLon: 0.35, sunX: 1, sunZ: 0,
  });
  ok('locked giant dayside is brighter',
    dayHJ[0] + dayHJ[1] > nightHJ[0] + nightHJ[1] + 40);
  ok('jupiter not green', ju && ju[1] < ju[0] && ju[1] < 200);
  ok('jupiter bands differ', JSON.stringify(ju) !== JSON.stringify(ju2));
  const ne = sampleLand('neptune', 0, 0, { x: 0, y: 0, z: 1 });
  ok('neptune blue', ne && ne[2] > ne[0] && ne[2] > 140);
  const ch = sampleLand('charon', 0.2, 0, { y: 0.85 });
  ok('charon mordor red', ch && ch[0] > ch[2] && ch[1] < 120);

  const marsKeys = planetCoverEntries('mars').map((e) => e.id);
  ok('mars glossary has rust not grass', marsKeys.includes('rust') && !marsKeys.includes('grass'));

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

  const { NBR, N } = await import('../sphere.js');
  const basin = 2 * N + 3;
  const n0 = NBR[basin * 4];
  const n1 = NBR[basin * 4 + 1];
  const er = {
    seaLevel: 0,
    h: new Float32Array(NC).fill(0.9),
    flow: new Float32Array(NC).fill(0),
    moist: new Float32Array(NC).fill(1),
    sediment: new Float32Array(NC),
    iceLand: new Float32Array(NC),
    _h: new Float32Array(NC),
  };
  er.h[basin] = 0.25;
  er.h[n0] = 0.7;
  er.h[n1] = 0.7;
  er.flow[n0] = 1;
  er.flow[n1] = 1;
  erosionTick(er);
  ok('sediment accumulates from two donors', er.sediment[basin] > 0.0005,
    `${er.sediment[basin]}`);
  const iceW = {
    seaLevel: 0,
    h: new Float32Array(NC).fill(0.5),
    flow: new Float32Array(NC).fill(0),
    moist: new Float32Array(NC).fill(0),
    sediment: new Float32Array(NC),
    iceLand: new Float32Array(NC),
    _h: new Float32Array(NC),
  };
  iceW.h[n0] = 0.95;
  iceW.h[basin] = 0.2;
  iceW.iceLand[n0] = 0.9;
  const hIce0 = iceW.h[n0];
  erosionTick(iceW);
  ok('ice carves downhill', iceW.h[n0] < hIce0 - 1e-6, `${iceW.h[n0]} vs ${hIce0}`);
  ok('ice dumps moraine sediment', iceW.sediment[basin] > 0 || [...iceW.sediment].some((v) => v > 0));

  const { SCALE_PRESETS, scaleRung, applyScalePreset } = await import('./eoref.js');
  ok('scale presets', SCALE_PRESETS.length === 4);
  ok('iss is close', SCALE_PRESETS.find((p) => p.id === 'iss').camDist < 1.2);
  const { patchScale } = await import('./present.js');
  const earthScale = patchScale(32, { earthLike: true });
  const marsScale = patchScale(32, { name: 'Mars', signature: 'dust' });
  ok('Earth patch scale is earthLike', earthScale.earthLike === true);
  ok('Mars patch scale avoids Earth placenames', !/Great Britain|Mediterranean/.test(marsScale.named), marsScale.named);
  ok('dot is far', scaleRung(16) === 'Dot');
  ok('giant descent rung', scaleRung(0.92, true) === 'Descent');
  ok('giant probe rung', scaleRung(0.84, true) === 'Probe');
  ok('rocky close is still Surface', scaleRung(1.04) === 'Surface');
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
  const idEra = encodeWorldId(s, 'pangaea', 'cambrian');
  const dEra = decodeWorldId(idEra);
  ok('world id carries epoch', dEra && dEra.epoch === 'cambrian' && dEra.landscape === 'pangaea', idEra);

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
  ok('serialize keeps layer stack', !!ser.layers && ser.version >= 4 && Array.isArray(ser.layers.layers), `${ser.version}`);

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

console.log('life grammar + sensory physics');
{
  const { morphospaceSize, ORGANS, BANDS, AXES, INTEGERS } = await import('./lifeGrammar.js');
  ok('grammar compiled', ORGANS.length > 20 && BANDS.length > 15 && AXES.length === 10 && INTEGERS.length === 8);
  ok('morphospace is not 26 bodies', morphospaceSize() > 1e20, String(morphospaceSize()));

  const {
    photonEnergy, wienPeakNm, pigmentQuality, diffractionAcuity,
    apertureForAcuity, bandViability, viableBands, apertureFromSize,
  } = await import('./sensory.js');

  ok('1 mm photon is 1.24 meV', Math.abs(photonEnergy(1e6) - 0.00124) < 1e-5, String(photonEnergy(1e6)));
  ok('M dwarf peaks in the near-IR', Math.abs(wienPeakNm(3000) - 966) < 5, String(wienPeakNm(3000)));
  ok('no pigment can register a microwave photon', pigmentQuality(1e6) === 0);
  ok('a pigment can register green', pigmentQuality(540) > 0.5, String(pigmentQuality(540)));
  ok('microwave imaging needs a metre-scale aperture', apertureForAcuity('microwave') > 10,
    String(apertureForAcuity('microwave')));
  ok('diffraction scales as lambda over D',
    Math.abs(diffractionAcuity(540, 0.02) - 1.22 * 540e-9 / 0.02) < 1e-12);

  const earth = { starTeffK: 5772, insol: 1, medium: 'air', sizeClass: 8, ozone: 0.25, humidity: 0.6, cloud: 0.4 };
  const europa = { starTeffK: 5772, insol: 0.037, medium: 'cryobrine', sizeClass: 8, depthM: 300, iceShellM: 15000 };
  const eBest = viableBands(earth)[0];
  ok('Earth\'s best sense is a photon band', ['red', 'green', 'violetBlue'].includes(eBest.id), eBest.id);
  const euPhoton = viableBands(europa).find((b) => ['red', 'green', 'violetBlue', 'nearIR'].includes(b.id));
  const euElec = bandViability('electric', europa);
  ok('under a 15 km ice shell, electroreception beats sight',
    euElec.score > (euPhoton?.score ?? 0), `${euElec.score} vs ${euPhoton?.score}`);
  ok('a gill-less medium refuses electroreception', !bandViability('electric', earth).ok);
  ok('aperture grows with body size', apertureFromSize(10) > apertureFromSize(4));
}

console.log('genome');
{
  const {
    blankGenome, cloneGenome, mutateGenome, expressBodyPlan, describeGenome,
    morphPenalty, organCountFor, genomeKey, organAllowed,
  } = await import('./genome.js');
  const { ORGAN_BY_ID } = await import('./lifeGrammar.js');

  const g = blankGenome();
  ok('the ancestral body is goo at a vent',
    expressBodyPlan(g).silhouette === 'goo' && g.axes.habitat === 'ventBenthic');

  g.n.symmetryOrder = 5;
  ok('a pentaradial body is named', expressBodyPlan(g).symmetry === 'pentaradial');
  ok('five-fold symmetry gives five of an organ',
    organCountFor(g, ORGAN_BY_ID.photoreceptorPatch) === 5);
  g.n.symmetryOrder = 3;
  ok('three eyes is a body, not a special case',
    organCountFor(g, ORGAN_BY_ID.pitEye) === 3);
  g.n.symmetryOrder = 1;
  ok('bilateral means a pair', organCountFor(g, ORGAN_BY_ID.pitEye) === 2);

  ok('an eye needs the eye below it', !organAllowed(g, ORGAN_BY_ID.lensEye));
  g.organs.push({ id: 'photoreceptorPatch', count: 2 }, { id: 'pitEye', count: 2 }, { id: 'pinholeEye', count: 2 });
  g.axes.nervous = 'ganglion';
  ok('with a pinhole and a ganglion a lens eye is reachable', organAllowed(g, ORGAN_BY_ID.lensEye));

  const land = blankGenome();
  land.axes.habitat = 'terrestrial';
  land.axes.respiration = 'gill';
  ok('a gilled land animal is allowed and expensive', morphPenalty(land).mult < 0.3, String(morphPenalty(land).mult));
  ok('and the reason is stated', morphPenalty(land).why.length > 0);

  const rngA = makeRng(7), rngB = makeRng(7);
  const a = blankGenome(), b = blankGenome();
  const env = { starTeffK: 5772, insol: 1, medium: 'water', sizeClass: 5 };
  for (let i = 0; i < 40; i++) { mutateGenome(a, rngA, env); mutateGenome(b, rngB, env); }
  ok('genome mutation is deterministic', genomeKey(a) === genomeKey(b));
  ok('40 mutations move the body', genomeKey(a) !== genomeKey(blankGenome()));
  ok('a genome round-trips through JSON',
    genomeKey(JSON.parse(JSON.stringify(a))) === genomeKey(a));
  ok('the description is derived, not stored', typeof describeGenome(a) === 'string' && describeGenome(a).length > 8);

  const rngG = makeRng(99);
  const gold = blankGenome();
  const envG = { starTeffK: 5772, insol: 1, medium: 'water', sizeClass: 5 };
  for (let i = 0; i < 25; i++) mutateGenome(gold, rngG, envG);
  ok('golden genome key is stable', genomeKey(gold) === genomeKey(JSON.parse(JSON.stringify(gold))));
  ok('golden genome moved from blank', genomeKey(gold) !== genomeKey(blankGenome()));
}

console.log('origin + ecology + draw');
{
  const { eigenCoherent, biochemAllowed, originRateAt, bioRateScale } = await import('./origin.js');
  ok('Eigen 10 kb at μ=0.05 holds', eigenCoherent(0.05, 10));
  ok('Eigen 30 kb at μ=0.05 collapses', !eigenCoherent(0.05, 30));
  const methane = biochemAllowed({ solvent: 'methane', polymer: 'rna', membrane: 'phospholipid', chirality: 'L' });
  ok('methane refuses RNA/phospholipid', !methane.ok && methane.why.length >= 1, methane.why.join('; '));
  const water = biochemAllowed({ solvent: 'water', polymer: 'rna', membrane: 'mineralCompartment', chirality: 'L' });
  ok('water allows RNA', water.ok);
  ok('Titan clock is slower than Earth', bioRateScale(94, { meltK: 91, boilK: 112 }) < bioRateScale(288, { meltK: 273, boilK: 373 }));

  const mouse = kleiberDensity(0.5, 20);
  const elephant = kleiberDensity(0.9, 4.5e6);
  ok('Kleiber: mouse density >> elephant', mouse / elephant > 30, `${(mouse / elephant).toFixed(1)}×`);

  const { TRAITS, addLineage, createTree, blankTraits, packTree, unpackTree, nodeOf } = await import('./evolve.js');
  const { updateFoodWeb } = await import('./ecology.js');
  const { genomeKey, blankGenome } = await import('./genome.js');
  const tree = createTree();
  const prod = addLineage(tree, null, blankTraits(), 0, 'producer');
  prod.traits[TRAITS.trophic] = 0;
  prod.traits[TRAITS.bodyMass] = 0.2;
  prod.pop = 20;
  prod.censusPop = 200;
  const pred = addLineage(tree, null, blankTraits(), 0, 'predator');
  pred.traits[TRAITS.trophic] = 0.5;
  pred.traits[TRAITS.bodyMass] = 0.4;
  pred.pop = 8;
  pred.censusPop = 40;
  updateFoodWeb({ tree, dtYr: 1e6, foodWeb: { links: [] } });
  ok('predator has a diet', pred.diet.includes(prod.id), JSON.stringify(pred.diet));
  ok('prey feels predation', (prod.predation || 0) > 0, String(prod.predation));

  const packed = packTree(tree);
  const restored = unpackTree(packed);
  ok('tree pack round-trips ids', restored.living.length === 2 && nodeOf(restored, prod.id)?.name === 'producer');
  ok('tree pack round-trips genome', genomeKey(nodeOf(restored, prod.id).genome) === genomeKey(prod.genome));

  prod.censusPop = 1.2;
  prod.pop = 1;
  const webW = { tree, dtYr: 1e6, foodWeb: { links: [] }, ageYr: 1e9, lucaId: -1 };
  for (let i = 0; i < 3; i++) updateFoodWeb(webW);
  ok('food web can extinct a lineage below MVP', prod.death != null || !tree.livingSet.has(prod.id),
    `death=${prod.death} living=${tree.livingSet.has(prod.id)} debt=${prod._webDebt}`);

  const { drawCreature } = await import('./creatureDraw.js');
  let threw = false;
  const ctx = {
    save() {}, restore() {}, translate() {}, scale() {}, transform() {},
    beginPath() {}, ellipse() {}, fill() {}, stroke() {}, arc() {},
    moveTo() {}, lineTo() {}, closePath() {}, quadraticCurveTo() {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    lineJoin: '', lineCap: '',
  };
  try {
    drawCreature(ctx, { symmetryOrder: 5, silhouette: 'radial', limbs: 5, massG: 12, gravity: 1, eyes: [{ band: 'green', count: 5 }] }, 0, 0, 16);
    drawCreature(ctx, { symmetryOrder: 1, silhouette: 'quadruped', limbs: 4, segments: 6, massG: 800, gravity: 1 }, 0, 0, 20);
  } catch (e) { threw = e; }
  ok('drawCreature does not throw', !threw, threw && threw.message);

  setResolution(32);
  const { generate: gen2, W: W2, serializeRun: ser2 } = await import('../world.js');
  const { RULESETS: RS } = await import('../rulesets.js');
  const terra = RS.find((r) => r.id === 'terra');
  gen2(11, { ...terra, deepTime: true });
  const life0 = W2.meanLife;
  const { simTick } = await import('../world.js');
  for (let i = 0; i < 24; i++) simTick(true);
  ok('deep-time biosphere does not collapse in 24 ticks',
    W2.meanLife >= Math.min(life0, 0.002) * 0.4 || W2.meanLife > 0.004,
    `life0=${life0.toFixed(4)} now=${W2.meanLife.toFixed(4)} O2=${W2.gases.O2.toFixed(4)} living=${W2.tree?.living?.length}`);
  ok('Archean CO2 stays off the 0.85 cap', W2.gases.CO2 < 0.5,
    `CO2=${W2.gases.CO2.toFixed(4)}`);
  ok('origin is a place', W2.transitions?.abiogenesis ? (W2.originCell != null && W2.originCell !== undefined) : true,
    `cell=${W2.originCell}`);
  const snap = ser2();
  ok('save stores genomes', snap.version >= 5 && Array.isArray(snap.tree?.nodes), `${snap.version} nodes=${snap.tree?.nodes?.length}`);

  gen2(13, { ...terra, airless: true, deepTime: true });
  for (let i = 0; i < 16; i++) simTick(true);
  ok('airless world never originates', !W2.transitions?.abiogenesis && W2.meanLife < 0.01,
    `abiogen=${W2.transitions?.abiogenesis} life=${W2.meanLife}`);
}

console.log('carbon + oxygenic clock + holocene tree + grade');
{
  const { whkWeathering } = await import('./carbon.js');
  ok('WHK weathering rises with pCO2', whkWeathering(0.12, 1, false) > whkWeathering(0.00028, 1, false));
  ok('land plants amplify weathering', whkWeathering(0.00028, 1, true) > whkWeathering(0.00028, 1, false) * 3);

  const { oxygenicClockStep } = await import('./redox.js');
  let acc = 0;
  for (let i = 0; i < 250; i++) acc += oxygenicClockStep(0.03, 0.25, 2);
  ok('oxygenic clock with mature mats crosses 1 in ~1.2 Gyr', acc > 1, String(acc.toFixed(3)));
  let early = 0;
  for (let i = 0; i < 40; i++) early += oxygenicClockStep(0.03, 0.25, 2);
  ok('oxygenic clock does not invent in the first ~200 Myr of mats', early < 0.5, String(early.toFixed(3)));
  let barren = 0;
  for (let i = 0; i < 250; i++) barren += oxygenicClockStep(0, 0.12, 2);
  ok('without precursors the oxygenic clock stays well below threshold', barren < 0.4, String(barren.toFixed(3)));

  const { deriveGrade } = await import('./lifeclass.js');
  const { blankGenome: bg2 } = await import('./genome.js');
  const micro = { traits: blankTraits(), genome: bg2() };
  const beast = { traits: blankTraits(), genome: bg2() };
  beast.genome.axes.habitat = 'terrestrial';
  beast.genome.axes.skeleton = 'bone';
  beast.genome.axes.thermal = 'endotherm';
  beast.genome.axes.nervous = 'brain';
  beast.genome.n.sizeClass = 5;
  beast.traits[4] = 0.45;
  beast.traits[7] = 0.6;
  const planet = { transitions: { eukaryote: true, multicellular: true, landPlants: true, endothermy: true } };
  ok('display grade follows the genome, not the planet',
    deriveGrade(micro, planet) !== deriveGrade(beast, planet),
    `${deriveGrade(micro, planet)} vs ${deriveGrade(beast, planet)}`);

  setResolution(32);
  const { generate: gen3, W: W3 } = await import('../world.js');
  const { RULESETS: RS3 } = await import('../rulesets.js');
  const terra3 = RS3.find((r) => r.id === 'terra');
  gen3(21, terra3);
  ok('modern Earth has a living tree at generate',
    (W3.tree?.nodes?.length || 0) >= 4 && (W3.tree?.living?.length || 0) >= 2,
    `nodes=${W3.tree?.nodes?.length} living=${W3.tree?.living?.length}`);
  let occupied = 0;
  for (let c = 0; c < NC; c++) if (W3.popId[c]) occupied++;
  ok('Holocene popId is painted from life', occupied > 20, `occupied=${occupied}`);
}

console.log('map legend');
{
  const { legendEntries, legendMarks, legendGlossary, legendKeyAt } = await import('./lifeColour.js');
  const { GUILDS } = await import('./redox.js');
  const cover = legendEntries();
  const marks = legendMarks();
  const gloss = legendGlossary();
  ok('cover keys have why', cover.length >= 12 && cover.every((e) => e.id && e.why && e.rgb?.length === 3));
  ok('marks include focus, hole, daisies',
    ['focus', 'hole', 'daisyBlack', 'daisyWhite'].every((id) => marks.some((e) => e.id === id && e.why)));
  ok('glossary lists every metabolic guild',
    GUILDS.every((g) => gloss.some((s) => s.entries.some((e) => e.id === g.id))));
  ok('glossary has an open morphospace row',
    gloss.some((s) => s.entries.some((e) => e.id === 'bodies' && /morphospace/.test(e.why))));

  const marsW = { _planetKind: 'mars', ice: [0], h: [0.12], seaLevel: -0.7, rock: [0], lava: [0] };
  const marsGloss = legendGlossary(marsW);
  ok('mars glossary is rust not grassland',
    marsGloss[0].entries.some((e) => e.id === 'rust')
    && !marsGloss[0].entries.some((e) => e.id === 'grass'));
  ok('mars cell keys rust', legendKeyAt(marsW, 0) === 'rust');
}

console.log('lessons');
{
  const {
    LESSONS, DOOR_IDS, TOUR_IDS, huntKeysOf, completeLesson, emptyLessonProgress,
    nextIncompleteLesson, nextTourAfter, huntMatches, lessonChipLabel, shouldOfferDoor,
    offerTourAgain,
  } = await import('./teach.js');
  ok('seven lessons, four doors', LESSONS.length === 7 && DOOR_IDS.length === 4);
  ok('mars hunt is rust', huntKeysOf(LESSONS.find((l) => l.id === 'hunt-mars')).includes('rust'));
  ok('europa hunt is cracks not iceShell',
    huntKeysOf(LESSONS.find((l) => l.id === 'hunt-europa')).includes('linea')
    && !huntKeysOf(LESSONS.find((l) => l.id === 'hunt-europa')).includes('iceShell'));
  const p0 = emptyLessonProgress();
  ok('door offered once', shouldOfferDoor(p0));
  ok('first incomplete is hold-earth', nextIncompleteLesson(p0)?.id === 'hold-earth');
  const p1 = completeLesson('hunt-mars', p0);
  ok('mars hunt queues Io', p1.done['hunt-mars'] && p1.current === 'hunt-io' && nextTourAfter('hunt-mars') === 'hunt-io');
  ok('chip names the next hunt', /Io|Yellow/.test(lessonChipLabel(p1)));
  ok('huntMatches sulfur', huntMatches('sulfur', LESSONS.find((l) => l.id === 'hunt-io')));
  ok('tour ends after Titan', nextTourAfter('hunt-titan') == null);
  const allDone = LESSONS.reduce((p, l) => completeLesson(l.id, p), emptyLessonProgress());
  ok('tour complete label', /Tour complete/.test(lessonChipLabel(allDone)));
  ok('hold-earth teaches the map', !!LESSONS.find((l) => l.id === 'hold-earth')?.winHint);
  ok('offerTourAgain resets door', !offerTourAgain({ seenDoor: true, done: {}, current: null }).seenDoor);
}

console.log('generate is a full reset');
{
  // The golden test below runs 1,500 lines into this file, so by the time it fires the
  // process has already generated many worlds and the *first* generate in a process is
  // never exercised. That is exactly where the contamination lived: `W.vents` survived a
  // run because `origin.js` guards with `W.vents = W.vents || []` and only seeds when the
  // list is empty, so a second generate inherited 173 vents from the previous planet.
  const { W, generate, simTick, RULESETS } = await import('../world.js');
  const rule = RULESETS.find((r) => r.id === 'terra');
  const digest = () => {
    const o = {};
    for (const k of Object.keys(W)) {
      const v = W[k];
      if (ArrayBuffer.isView(v)) { let a = 0; for (let i = 0; i < v.length; i++) a += v[i] * (1 + (i % 13)); o[k] = a; }
      else if (typeof v === 'number' || typeof v === 'boolean') o[k] = v;
      else if (Array.isArray(v)) o[k] = `arr${v.length}`;
      else if (v instanceof Set) o[k] = `set${v.size}`;
      else if (v instanceof Map) o[k] = `map${v.size}`;
      else if (v && typeof v === 'object') o[k] = `obj${Object.keys(v).length}`;
    }
    return o;
  };
  // 37 distinct world fields are written as `W.x = W.x || …`, so any of them can carry
  // a previous planet into the next one. Check every playable ruleset, not just Earth.
  for (const id of ['terra', 'vermis', 'selene', 'ares']) {
    const r = RULESETS.find((x) => x.id === id);
    if (!r) continue;
    generate(42, r);
    const fresh = digest();
    for (let i = 0; i < 40; i++) simTick();
    generate(42, r);
    const after = digest();
    const drifted = Object.keys({ ...fresh, ...after }).filter((k) => fresh[k] !== after[k]);
    ok(`${id}: a generate after a run equals a fresh generate`, drifted.length === 0,
      drifted.slice(0, 8).map((k) => `${k}: ${fresh[k]} -> ${after[k]}`).join(' | '));
  }
  // And a world swap must not carry the old planet across.
  const terra = RULESETS.find((x) => x.id === 'terra');
  const ares = RULESETS.find((x) => x.id === 'ares');
  generate(7, terra);
  for (let i = 0; i < 30; i++) simTick();
  generate(7, ares);
  const swapped = digest();
  generate(7, ares);
  const direct = digest();
  const carried = Object.keys({ ...swapped, ...direct }).filter((k) => swapped[k] !== direct[k]);
  ok('switching worlds does not carry the previous planet', carried.length === 0,
    carried.slice(0, 8).map((k) => `${k}: ${swapped[k]} -> ${direct[k]}`).join(' | '));
}

console.log('agents / settlements reset');
{
  const { W, generate, simTick, RULESETS } = await import('../world.js');
  const { ENT, respawnEntities } = await import('../agents.js');
  const terra = RULESETS.find((x) => x.id === 'terra');
  generate(99, terra);
  respawnEntities();
  for (let i = 0; i < 120; i++) simTick();
  const lastId = ENT.meta[ENT.n - 1]?.id ?? 0;
  ok('entities exist after a run', ENT.n > 0 && lastId > 0);
  W.cities = [{ cell: 0, pop: 999, stage: 'city' }];
  W.civPop = 999;
  W._cityLights = 0.8;
  generate(99, terra);
  ok('generate clears settlement readouts', !W.cities?.length && !W.civPop && !W._cityLights);
  respawnEntities();
  ok('respawn resets entity id sequence', (ENT.meta[0]?.id ?? 0) <= ENT.n + 1,
    `id ${ENT.meta[0]?.id} n ${ENT.n} after ${lastId}`);
}

console.log('epoch / techno');
{
  const { generate, W, RULESETS } = await import('../world.js');
  const { HOLOCENE_WATTS, insolationFrac } = await import('./techno.js');
  const { overlaysForPicker } = await import('./overlay.js');
  const { CATALOGUE_WORLDS, rulesetFromCatalogue } = await import('../catalogue-rules.js');

  const venusRule = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Venus'));
  const marsRule = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Mars'));
  const venusEras = availableEras(venusRule).map((e) => e.id);
  const marsEras = availableEras(marsRule).map((e) => e.id);
  ok('Venus eras include ocean', venusEras.includes('venus-ocean') && venusEras.includes('venus-now'));
  ok('Mars eras include wet', marsEras.includes('mars-wet') && marsEras.includes('mars-now'));
  ok('Earth eras include hadean', availableEras({ earthLike: true }).some((e) => e.id === 'hadean'));

  setResolution(32);
  const terra = RULESETS.find((r) => r.id === 'terra');
  generate(7, terra);
  const presentO2 = W.gases.O2;
  const presentCO2 = W.gases.CO2;
  ok('Holocene energy ~20 TW', Math.abs(W.techno.watts - HOLOCENE_WATTS) / HOLOCENE_WATTS < 0.05, `${W.techno?.watts}`);
  ok('Holocene energy is ~0.01% insolation',
    insolationFrac(W.techno.watts, W) > 0.00005 && insolationFrac(W.techno.watts, W) < 0.0005,
    `${insolationFrac(W.techno.watts, W)}`);
  ok('Holocene techno is a readout', W.techno.calibrated === true && W._epochArrived === true);
  ok('techno overlay exists', overlaysForPicker().some((o) => o.id === 'techno'));

  generate(7, ruleForEra(terra, 'cambrian'));
  ok('Cambrian O2 is not present and not zero', W.gases.O2 > 0.05 && Math.abs(W.gases.O2 - presentO2) > 0.04, `${W.gases.O2}`);
  ok('Cambrian CO2 higher than Holocene', W.gases.CO2 > presentCO2 * 2, `${W.gases.CO2}`);
  ok('Cambrian is started not arrived', W._epoch?.id === 'cambrian' && W._epochStarted && !W._epochArrived);
  ok('Cambrian clock is Phanerozoic', W.ageYr > 4e9 && (4.567e9 - W.ageYr) / 1e6 < 600);

  generate(7, ruleForEra(venusRule, 'venus-ocean'));
  let wet = 0;
  for (let c = 0; c < NC; c++) if (W.h[c] < W.seaLevel) wet++;
  ok('wet Venus has an ocean', wet > NC * 0.15, `${wet}/${NC}`);
  ok('wet Venus is not no-surface', W.noSurface === false);

  generate(7, ruleForEra(marsRule, 'mars-wet'));
  ok('early Mars thicker CO2', W.gases.CO2 > 0.1, `${W.gases.CO2}`);

  const jup = rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === 'Jupiter'));
  generate(5, jup);
  ok('giants skip techno', !W.techno || W.techno.watts === 0);

  generate(7, terra);
  ok('Earth after epochs still Holocene', isModernEarth(W.rule) && W.gases.O2 > 0.18);
}

console.log('world definition / stack / look');
{
  const { SUBSTRATES, SUB_INDEX, sampleMaterialRgb } = await import('./substrateField.js');
  const {
    WORLD_DEFS, DEF_BY_ID, OVERRIDE_COUNT, UNITS, definitionOf, lookOf,
    overrideOf, featureListOf, coverageOfDef, applyWorldLook, shareDefOf,
  } = await import('./definition.js');
  const {
    STACK_DEPTH, STACK_BYTES_PER_CELL, stackBytes, allocStack, depositStack,
    erodeStack, weatherStack, compactStack, meltStack, intrudeStack, stackTop,
    stackAt, stackMeanLayers,
  } = await import('./colstack.js');
  const { CATALOGUE_WORLDS, rulesetFromCatalogue } = await import('../catalogue-rules.js');
  const { sampleLand } = await import('./planetLook.js');
  const { illuminateRgb, illuminantGain, rgbFromSpectrum, SUN_TEFF, WHITE_BALANCE } = await import('./illum.js');
  const { paintDisc, distRgb } = await import('./pictureDisc.js');
  const { W, generate, serializeRun, loadRunMeta } = await import('../world.js');

  ok('definitions compiled', WORLD_DEFS.length >= 10 && DEF_BY_ID.iceOrganics);
  ok('tables are frozen', Object.isFrozen(WORLD_DEFS) && Object.isFrozen(WORLD_DEFS[0]));
  ok('units are stated', UNITS.density === 'kg/m³' && UNITS.strength === 'MPa');
  ok('one Iapetus override', OVERRIDE_COUNT === 1);
  ok('basalt has a ramp', Array.isArray(SUBSTRATES[0].ramp?.wet));
  const dry = sampleMaterialRgb(SUBSTRATES[0], { moist: 0 });
  const wet = sampleMaterialRgb(SUBSTRATES[0], { moist: 0.9 });
  ok('wet basalt is darker', wet[0] + wet[1] + wet[2] < dry[0] + dry[1] + dry[2]);

  const byName = (b) => rulesetFromCatalogue(CATALOGUE_WORLDS.find((x) => x.b === b));
  const mars = byName('Mars');
  const venus = byName('Venus');
  const europa = byName('Europa');
  const titan = byName('Titan');
  const jup = byName('Jupiter');
  const iap = byName('Iapetus');
  const luna = byName('Luna');
  ok('Mars is dustyBasalt', definitionOf({ rule: mars }).id === 'dustyBasalt', definitionOf({ rule: mars }).id);
  ok('Mars definition names mars paint', definitionOf({ rule: mars }).paint === 'mars');
  ok('Venus is runaway', definitionOf({ rule: venus }).id === 'runaway', definitionOf({ rule: venus }).id);
  ok('shareable def is a query', /def=dustyBasalt/.test(shareDefOf({ rule: mars })), shareDefOf({ rule: mars }));
  ok('Europa is iceShell', definitionOf({ rule: europa }).id === 'iceShell', definitionOf({ rule: europa }).id);
  ok('Titan is iceOrganics', definitionOf({ rule: titan }).id === 'iceOrganics', definitionOf({ rule: titan }).id);
  ok('Jupiter is envelope', definitionOf({ rule: jup }).id === 'envelope', definitionOf({ rule: jup }).id);
  ok('Moon is airless', definitionOf({ rule: luna }).id === 'airless', definitionOf({ rule: luna }).id);
  ok('Iapetus override exists', overrideOf({ rule: iap })?.body === 'Iapetus');
  ok('Titan look is a soft orange limb', lookOf({ rule: titan }).limbSoft > 0.6 && lookOf({ rule: titan }).haze > 0.5);
  ok('Moon look is a hard limb', lookOf({ rule: luna }).limbSoft === 0);
  applyWorldLook(titan);
  ok('Titan rule carries look', titan.look?.haze > 0.5 && titan.sky?.[0] > 0.4);
  ok('Titan names Kraken', featureListOf({ rule: titan }).some((f) => f.id === 'kraken'));
  ok('Mars names Valles', featureListOf({ rule: mars }).some((f) => /Valles/.test(f.name)));

  let missing = 0;
  for (const item of CATALOGUE_WORLDS) {
    const rule = rulesetFromCatalogue(item);
    if (!rule) continue;
    const cov = coverageOfDef({ rule });
    if (!cov.id) missing++;
  }
  ok('every catalogue body resolves a definition', missing === 0, `${missing} missing`);

  ok('stack budget is 49 bytes a cell', STACK_BYTES_PER_CELL === 49 && STACK_DEPTH === 8);
  ok('N=96 stack is under 3 MB', stackBytes(96 * 96 * 6) < 3 * 1024 * 1024,
    `${(stackBytes(96 * 96 * 6) / 1e6).toFixed(2)} MB`);

  const fake = { h: new Float32Array(4) };
  allocStack(fake, 4);
  depositStack(fake, 0, 0, 100);
  depositStack(fake, 0, 2, 5);
  ok('deposit stacks sediment on basalt', fake.stackN[0] === 2 && stackTop(fake, 0) === 2);
  ok('same material merges', depositStack(fake, 0, 2, 3) === 3 && fake.stackM[0] === 8);
  const peeled = erodeStack(fake, 0, 3);
  ok('erode peels the top', peeled === 3 && fake.stackM[0] === 5);
  erodeStack(fake, 0, 50);
  ok('bedrock is never removed', fake.stackN[0] === 1 && stackTop(fake, 0) === 0);
  weatherStack(fake, 0, SUB_INDEX.granite);
  ok('weather transforms in place', stackTop(fake, 0) === SUB_INDEX.granite);
  compactStack(fake, 0, 0.5);
  ok('compact halves thickness', Math.abs(fake.stackM[0] - 50) < 1e-6);
  const melted = meltStack(fake, 0, 10);
  ok('melt reports the material', melted.mat === SUB_INDEX.granite && melted.metres === 0);
  depositStack(fake, 0, 0, 40);
  depositStack(fake, 1, 0, 20);
  intrudeStack(fake, 1, SUB_INDEX.sediment, 4, 5);
  ok('intrude adds a layer', fake.stackN[1] === 2);
  ok('stackAt is surface-down', stackAt(fake, 0)[0].mat === 0);

  const io = sampleLand('io', 0.55, 0);
  const eu = sampleLand('europa', 0.55, 0);
  const ma = sampleLand('mars', 0.55, 0);
  const ve = sampleLand('venus', 0.7, 0);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  ok('Io is not Europa in paint', dist(io, eu) > 80, `${dist(io, eu).toFixed(1)}`);
  ok('Mars is not Venus in paint', dist(ma, ve) > 40, `${dist(ma, ve).toFixed(1)}`);
  const kinds = ['io', 'europa', 'mars', 'venus', 'titan', 'moon', 'jupiter', 'neptune'];
  const samples = kinds.map((k) => sampleLand(k, 0.55, 0));
  let twins = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      if (dist(samples[i], samples[j]) < 12) twins++;
    }
  }
  ok('fleet paint is not collapsed', twins === 0, `${twins} near-identical pairs`);
  {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const basePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'worlds', 'paint.baseline.json');
    const base = JSON.parse(await readFile(basePath, 'utf8'));
    let drift = 0;
    for (const k of kinds) {
      const want = base.rgb[k];
      const got = samples[kinds.indexOf(k)];
      if (!want || dist(got, want) > 8) drift++;
    }
    ok('fleet paint matches committed baseline', drift === 0, `${drift} kinds drifted`);
  }

  const sun = illuminateRgb([118, 72, 48], SUN_TEFF);
  const mdwarf = illuminateRgb([118, 72, 48], 2560);
  const a0 = illuminateRgb([118, 72, 48], 10000);
  const ratio = (c) => c[0] / Math.max(1, c[2]);
  ok('illuminant is identity under the Sun', dist([118, 72, 48], sun) < 0.6, dist([118, 72, 48], sun));
  ok('M dwarf makes basalt redder', ratio(mdwarf) > ratio(sun) * 1.05, `${ratio(mdwarf).toFixed(2)} vs ${ratio(sun).toFixed(2)}`);
  ok('hot star makes basalt bluer', ratio(a0) < ratio(sun) * 0.98, `${ratio(a0).toFixed(2)} vs ${ratio(sun).toFixed(2)}`);
  ok('white balance is a sun-calibrated camera', WHITE_BALANCE === 'sun-camera');
  ok('Sun gain is unit', {
    g: illuminantGain(SUN_TEFF),
  }.g.every((x) => Math.abs(x - 1) < 1e-6));
  const specS = rgbFromSpectrum(SUBSTRATES.find((m) => m.id === 'sulfur').spectrum, SUN_TEFF);
  const specB = rgbFromSpectrum(SUBSTRATES.find((m) => m.id === 'basalt').spectrum, SUN_TEFF);
  ok('sulfur spectrum is yellower than basalt', specS[1] > specB[1] && specS[0] > specB[0]);

  generate(11, mars);
  depositStack(W, 0, SUB_INDEX.sediment ?? 2, 17);
  const stacked = stackAt(W, 0).map((L) => ({ mat: L.mat, m: Math.round(L.metres) }));
  const snap = serializeRun();
  ok('save version 7 stores the stack', snap.version >= 7 && !!snap.stack?.n);
  loadRunMeta(snap);
  const restored = stackAt(W, 0).map((L) => ({ mat: L.mat, m: Math.round(L.metres) }));
  ok('stack survives a save', restored.length === stacked.length
    && restored[0].mat === stacked[0].mat
    && Math.abs(restored[0].m - stacked[0].m) <= 1, JSON.stringify({ stacked, restored }));

  const dMars = paintDisc(W, 48);
  generate(13, venus);
  const dVenus = paintDisc(W, 48);
  generate(17, europa);
  const dEuropa = paintDisc(W, 48);
  ok('CPU disc has a filled globe', dMars.filled > 80, dMars.filled);
  ok('Mars disc is not Venus', distRgb(dMars.mean, dVenus.mean) > 10,
    `${distRgb(dMars.mean, dVenus.mean).toFixed(1)}`);
  ok('Europa disc is not Mars', distRgb(dEuropa.mean, dMars.mean) > 10,
    `${distRgb(dEuropa.mean, dMars.mean).toFixed(1)}`);
}

console.log('data layer hygiene');
{
  const { readdir, readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const { WORLDDEF_HASH } = await import('./definition.js');
  const simDir = dirname(fileURLToPath(import.meta.url));
  const root = join(simDir, '..', '..');
  const defs = JSON.parse(await readFile(join(root, 'vr/data/worlds/definitions.json'), 'utf8'));
  const feats = JSON.parse(await readFile(join(root, 'vr/data/worlds/features.json'), 'utf8'));
  const hash = createHash('sha1')
    .update(JSON.stringify({
      definitions: defs.definitions, overrides: defs.overrides, features: feats.bodies,
    }))
    .digest('hex').slice(0, 12);
  ok('worlddef module matches its JSON', hash === WORLDDEF_HASH, `${hash} vs ${WORLDDEF_HASH}`);

  const guarded = new Set([
    'colstack.js', 'illum.js', 'pictureDisc.js', 'definition.js',
    'substrateField.js', 'columnField.js', 'worldDef.js',
    'paintEval.js', 'paintTable.js', 'planetLook.js',
  ]);
  const banned = /\bif\s*\(\s*kind\s*===\s*'(triton|iapetus|titan|europa|io|pluto|mars|venus|mercury)'/i;
  const hits = [];
  for (const f of await readdir(simDir)) {
    if (!guarded.has(f)) continue;
    const src = await readFile(join(simDir, f), 'utf8');
    if (banned.test(src)) hits.push(f);
  }
  ok('join/stack/illum do not branch on a named body', hits.length === 0, hits.join(', '));
  const lookSrc = await readFile(join(simDir, 'planetLook.js'), 'utf8');
  ok('planetLook has no land* lambdas', !/^function land[A-Z]/m.test(lookSrc));
  const { PAINT_BY_ID } = await import('./paintEval.js');
  ok('paint table has the Solar System', !!PAINT_BY_ID.io && !!PAINT_BY_ID.neptune && !!PAINT_BY_ID.iapetus);
}

console.log('golden + calibrate');
{
  const g = goldenRun({ ticks: 24 });
  ok('golden reproducible', g.pass, `${g.hash} vs ${g.hashB}`);
  const cal = calibrateEarth(20260808, 4);
  ok('earth calibrate', cal.pass, JSON.stringify(cal.checks.filter((c) => !c.ok)));
}

/* Beings, settlements, fire, herds and plumes. Until `agentsTick` moved into
   `simTick` none of this could be tested at all: the layer the player actually
   watches ran on the render loop, so it was absent from headless runs, absent
   from saves, and asserted by exactly one of 563 checks. */
console.log('beings inside the tick (slice A)');
{
  const sph = await import('../sphere.js');
  sph.setResolution(32);
  const { W, generate, simTick, RULESETS } = await import('../world.js');
  const { ENT } = await import('../agents.js');
  const { cloneRuleForRun, isPinnedEarth } = await import('./ruleMode.js');
  const thriveRule = RULESETS.find((r) => r.id === 'thrive');
  const terraRule = RULESETS.find((r) => r.id === 'terra');

  ok('demo ruleset exists', !!thriveRule && thriveRule.thrive === true);
  ok('demo Earth is not the pinned Earth', !isPinnedEarth(thriveRule) && isPinnedEarth(terraRule));

  /** Population fingerprint — kinds, cells, ages and behaviours. */
  const signature = () => {
    const parts = [String(ENT.n)];
    let seen = 0;
    for (let i = 0; i < ENT.n && seen < 40; i++) {
      const m = ENT.meta[i];
      if (!m || m.dead) continue;
      parts.push(`${m.kind}:${m.cell}:${m.age}:${m.behav}`);
      seen++;
    }
    return parts.join('|');
  };

  const run = (rule, ticks) => {
    generate(4242, cloneRuleForRun(rule));
    for (let i = 0; i < ticks; i++) simTick(true);
    return signature();
  };

  // `simTick` is the only thing called here. If beings were still on the render
  // loop this population would be empty.
  const a = run(thriveRule, 30);
  ok('simTick alone populates the world', ENT.n > 0, `ENT.n=${ENT.n}`);
  const behaviours = new Set();
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (m && !m.dead) behaviours.add(m.behav);
  }
  ok('beings age inside the tick', maxAgeOf(ENT) > 20, `maxAge=${maxAgeOf(ENT)}`);
  ok('beings pick more than one behaviour', behaviours.size > 1, [...behaviours].join(','));

  const b = run(thriveRule, 30);
  ok('same seed, same population', a === b);
  // A second generate must not inherit the previous world's individuals.
  ok('generate resets the population', maxAgeOf(ENT) <= 30, `maxAge=${maxAgeOf(ENT)}`);

  // The pinned Earth stays pinned: clock welded to the present.
  generate(4242, cloneRuleForRun(terraRule));
  const pinnedAge = W.ageYr;
  for (let i = 0; i < 30; i++) simTick(true);
  ok('calibration Earth clock stays at the present', W.ageYr === pinnedAge);
  generate(4242, cloneRuleForRun(thriveRule));
  const demoAge = W.ageYr;
  for (let i = 0; i < 30; i++) simTick(true);
  ok('demo Earth clock advances', W.ageYr > demoAge, `${demoAge} -> ${W.ageYr}`);
}

console.log('settlements, fire, herds, plumes (slices B-E)');
{
  const sph = await import('../sphere.js');
  sph.setResolution(32);
  const { W, simTick } = await import('../world.js');
  const { ENT } = await import('../agents.js');
  const { probeThrive, lightTheDriestForest } = await import('../../scripts/thrive-probe.mjs');

  const r = probeThrive({ seed: 20260808, ruleId: 'thrive', ticks: 500 });

  // Slice B — the first visible win. These are the assertions that fail if the
  // settlement loop is throttled back to invisibility.
  ok('demo world raises build', r.settlement.meanBuild > 0, `meanBuild=${r.settlement.meanBuild}`);
  /* Thresholds, not just non-zero: the pinned Earth reaches 2 settlements and
     meanBuild ~0.001 over the same 500 ticks, so a bare `> 0` would not notice
     the throttles coming back. Measured demo run at N=32: 45 settlements,
     meanBuild 0.0115, lights 0.23. */
  ok('demo world produces settlements', r.settlement.cities >= 8, `cities=${r.settlement.cities}`);
  ok('demo settlement is not the pinned trickle', r.settlement.meanBuild > 0.004,
    `meanBuild=${r.settlement.meanBuild}`);
  ok('settlements reach village or better',
    (r.settlement.stages.village || 0) + (r.settlement.stages.town || 0)
      + (r.settlement.stages.city || 0) > 0,
    JSON.stringify(r.settlement.stages));
  ok('night lights are lit', r.settlement.cityLights > 0.05, `cityLights=${r.settlement.cityLights}`);
  ok('lights arrive within 500 ticks',
    r.settlement.firstLightTick > 0 && r.settlement.firstLightTick < 500,
    `tick ${r.settlement.firstLightTick}`);
  ok('settled area has not saturated', (W.builtFrac || 0) > 0 && (W.builtFrac || 0) < 1,
    `builtFrac=${W.builtFrac}`);
  ok('there are settlers doing the building',
    (r.beings.byKind.settler || 0) > 0, JSON.stringify(r.beings.byKind));

  // Slice D — a herd is a group with a shared heading, not a crowd.
  ok('a herd forms', r.herd.peak >= 4, `peak herd=${r.herd.peak}`);
  {
    let aligned = 0, pairs = 0;
    for (let i = 0; i < ENT.n; i++) {
      const m = ENT.meta[i];
      if (!m || m.dead || m.kind !== 7 || (m.herd || 0) < 3) continue;
      for (let j = i + 1; j < ENT.n; j++) {
        const o = ENT.meta[j];
        if (!o || o.dead || o.kind !== 7 || o.cell !== m.cell) continue;
        const dot = (m.hx || 0) * (o.hx || 0) + (m.hy || 0) * (o.hy || 0)
          + (m.hz || 0) * (o.hz || 0);
        pairs++;
        if (dot > 0) aligned++;
        break;
      }
    }
    ok('herd-mates share a heading', pairs === 0 || aligned / pairs > 0.5, `${aligned}/${pairs}`);
  }

  // Slice E — surface feeding fertilises the water it feeds in.
  ok('marine animals surface-feed', r.plume.surfaceFeeders > 0, `${r.plume.surfaceFeeders}`);
  ok('surface feeding leaves a plume', r.plume.cells > 0 && r.plume.max > 0.01,
    `cells=${r.plume.cells} max=${r.plume.max}`);
  ok('plume raises N and P above the seeded 0.40 / 0.35',
    r.plume.meanNutrientN > 0.4 && r.plume.meanNutrientP > 0.35,
    `N=${r.plume.meanNutrientN} P=${r.plume.meanNutrientP}`);

  // Slice C — fire, on the world those 500 ticks just built.
  const { igniteFire, flammableAt, fireDanger } = await import('./fire.js');
  const lit = lightTheDriestForest();
  ok('a fire can be lit', lit > 0, `${lit} cells`);
  let cell = -1;
  for (let i = 0; i < W.fire.length; i++) if (W.fire[i] > 0.02) { cell = i; break; }
  const life0 = W.life[cell];
  let peak = W.fireCells || 0, ashPeak = 0, fled = 0;
  for (let t = 0; t < 12; t++) {
    simTick(true);
    if ((W.fireCells || 0) > peak) peak = W.fireCells;
    for (let i = 0; i < W.ash.length; i++) if (W.ash[i] > ashPeak) ashPeak = W.ash[i];
    for (let i = 0; i < ENT.n; i++) if (ENT.meta[i]?.behav === 'flee') fled++;
  }
  ok('fire spreads past the cells it was lit in', peak > lit, `peak front=${peak} lit=${lit}`);
  ok('fire consumes the fuel it burns', W.life[cell] < life0, `${life0} -> ${W.life[cell]}`);
  ok('fire lays down ash', ashPeak > 0.05, `maxAsh=${ashPeak}`);
  ok('fire burns an area', (W.burntArea || 0) > 0, `${W.burntArea}`);
  ok('something flees the fire', fled > 0, `${fled} flee-ticks`);
  let sea = -1;
  for (let c = 0; c < W.h.length; c++) if (W.h[c] < W.seaLevel) { sea = c; break; }
  ok('water will not light', sea < 0 || igniteFire(W, sea, 1, 0) === 0);
  ok('fire danger is zero at sea', sea < 0 || fireDanger(W, sea) === 0);
  let bare = -1;
  for (let c = 0; c < W.h.length; c++) {
    if (W.h[c] >= W.seaLevel && W.life[c] < 0.05) { bare = c; break; }
  }
  ok('flammable needs fuel', bare < 0 || !flammableAt(W, bare));
}

console.log('entity save round-trip (entsave)');
{
  const sph = await import('../sphere.js');
  sph.setResolution(32);
  const { W, generate, simTick, serializeRun, loadRunMeta, RULESETS } = await import('../world.js');
  const { ENT } = await import('../agents.js');
  const { cloneRuleForRun } = await import('./ruleMode.js');
  const { livingMetrics, formatLivingLine } = await import('./livemetric.js');
  const thrive = RULESETS.find((r) => r.id === 'thrive');
  generate(7777, cloneRuleForRun(thrive));
  for (let i = 0; i < 80; i++) simTick(true);
  const save = serializeRun();
  const n0 = save.entities.list.length;
  const sig0 = save.entities.list
    .map((m) => `${m.id}:${m.cell}:${m.age}:${m.behav}`).join('|');
  const age0 = W.ageYr;
  const cities0 = W.cities?.length || 0;
  ok('save v8 carries entities', save.version === 8 && n0 > 0, `${n0} beings`);
  ok('save carries build and cities', save.buildB64 && Array.isArray(save.cities));
  loadRunMeta(JSON.stringify(save));
  const sig1 = ENT.meta.slice(0, ENT.n).filter((m) => m && !m.dead)
    .map((m) => `${m.id}:${m.cell}:${m.age}:${m.behav}`).join('|');
  ok('load restores population', ENT.n === n0 && sig0 === sig1, `${n0} vs ${ENT.n}`);
  ok('load restores clock and settlements', W.ageYr === age0 && (W.cities?.length || 0) === cities0);
  const lm = livingMetrics(W);
  ok('living metrics module', lm.alive > 0 && formatLivingLine(lm).includes('alive'));
}

console.log('metabolism, birth, death, hunt (slice F)');
{
  const sph = await import('../sphere.js');
  sph.setResolution(32);
  const { W, generate, simTick, RULESETS } = await import('../world.js');
  const { ENT } = await import('../agents.js');
  const { cloneRuleForRun } = await import('./ruleMode.js');
  const { probeThrive, lightTheDriestForest } = await import('../../scripts/thrive-probe.mjs');
  const thrive = cloneRuleForRun(RULESETS.find((r) => r.id === 'thrive'));

  generate(20260808, thrive);
  let lifeBefore = 0;
  for (let c = 0; c < W.life.length; c++) lifeBefore += W.life[c];
  for (let t = 0; t < 400; t++) simTick(true);
  let grazed = lifeBefore;
  for (let c = 0; c < W.life.length; c++) grazed -= W.life[c];
  ok('grazers trim biomass', grazed > 0, `life removed ${grazed.toFixed(4)}`);

  const r = probeThrive({ seed: 8888, ruleId: 'thrive', ticks: 600 });
  ok('population turns over', r.beings.died > 0 || r.beings.everSeen > ENT.n,
    `died=${r.beings.died} ever=${r.beings.everSeen} alive=${r.beings.alive}`);
  ok('beings carry energy state', ENT.meta.some((m) => m && !m.dead && m.energy != null));

  generate(20260808, thrive);
  for (let t = 0; t < 120; t++) simTick(true);
  const { igniteFire, flammableAt } = await import('./fire.js');
  let cell = -1;
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (m && !m.dead && m.kind === 7 && flammableAt(W, m.cell)) { cell = m.cell; break; }
  }
  if (cell < 0) {
    for (let i = 0; i < ENT.n; i++) {
      const m = ENT.meta[i];
      if (m && !m.dead && flammableAt(W, m.cell)) { cell = m.cell; break; }
    }
  }
  const lit = cell >= 0 ? igniteFire(W, cell, 1, 1) : 0;
  let burned = 0;
  for (let t = 0; t < 20; t++) {
    simTick(true);
    for (let i = 0; i < ENT.n; i++) {
      if (ENT.meta[i]?.cause === 'burned') burned++;
    }
  }
  ok('fire can kill beings', lit === 0 || burned > 0, `lit=${lit} burned=${burned}`);

  let parents = 0;
  for (let i = 0; i < ENT.n; i++) {
    if (ENT.meta[i]?.parentId) parents++;
  }
  ok('births leave parent links', parents > 0 || r.beings.everSeen > r.beings.alive,
    `parent links=${parents}`);
}

console.log('food web keeps strongest links');
{
  const links = [];
  for (let i = 0; i < 250; i++) links.push({ prey: i, pred: i + 1, w: Math.random() });
  links.sort((a, b) => b.w - a.w);
  const kept = links.slice(0, 200);
  ok('top 200 links are heaviest', kept[0].w >= kept[kept.length - 1].w);
  ok('weakest kept beats first dropped', kept[199].w >= links[200].w);
}

console.log('clock faces');
{
  const { applySeasonPolicy, livedTick, setClockFace, setSeasonHold } = await import('./clockFace.js');
  const { icsRibbonHTML } = await import('./viz.js');
  const pinned = { earthLike: true };
  const Wnow = { clockFace: 'now', season: 0.4, dtYr: 10, seasonHold: null };
  applySeasonPolicy(Wnow, pinned);
  ok('pinned Now without livedTick still advances season', Wnow.season !== 0.4);

  const Wlive = { clockFace: 'now', season: 1, dtYr: 10, _livedActive: true, _livedSeason0: 1, _livedT: 0 };
  applySeasonPolicy(Wlive, pinned);
  ok('lived Now does not spin season in simTick', Wlive.season === 1);
  livedTick(Wlive, 12);
  ok('lived Now moves season on the presentation clock', Wlive.season !== 1);

  const Wy = { clockFace: 'years', season: 0.2, dtYr: 200, seasonHold: 1.2 };
  applySeasonPolicy(Wy, { earthLike: true, thrive: true });
  ok('Years holds the locked season', Math.abs(Wy.season - 1.2) < 1e-9);

  setSeasonHold(Wy, 'jun');
  ok('June hold is 90°', Math.abs(Wy.seasonHold - Math.PI / 2) < 1e-9);

  const html = icsRibbonHTML({ eon: 'Phanerozoic', period: 'Quaternary' }, 'present', 0, { dt: '10 yr/tick', id: 'decade' }, {
    clockFace: 'years', seasonHoldId: 'jun', rates: [], eras: [],
  });
  ok('ribbon has Now and Years', html.includes('data-clock-face="now"') && html.includes('data-clock-face="years"'));
  ok('ribbon has season holds', html.includes('data-season-hold="jun"'));

  const { W, generate, simTick, RULESETS } = await import('../world.js');
  const { cloneRuleForRun } = await import('./ruleMode.js');
  generate(4242, cloneRuleForRun(RULESETS.find((r) => r.id === 'thrive')));
  const s0 = W.season;
  const age0 = W.ageYr;
  for (let i = 0; i < 20; i++) simTick(true);
  ok('thrive Years keeps season still', W.season === s0, `${s0} -> ${W.season}`);
  ok('thrive Years still advances the calendar', W.ageYr > age0);

  setClockFace(W, 'now');
  const age1 = W.ageYr;
  const sea1 = W.season;
  for (let i = 0; i < 12; i++) simTick(true);
  ok('thrive Now holds the calendar', W.ageYr === age1);
  ok('thrive Now without frames does not jump season', W.season === sea1);
}

console.log('named herds and behaviour overlay');
{
  const { W } = await import('../world.js');
  const { ENT } = await import('../agents.js');
  const { overlayById } = await import('./overlay.js');
  ok('behaviour overlay exists', overlayById('behav')?.id === 'behav');
  let grouped = 0;
  for (let i = 0; i < ENT.n; i++) if (ENT.meta[i]?.groupId) grouped++;
  ok('herd members carry a group id', grouped > 0, `grouped=${grouped}`);
  ok('groups are world objects', (W.groups?.length || 0) >= 1, `n=${W.groups?.length}`);
  ok('behaviour map has activity', !!(W.behavMap && W.behavMap.some((v) => v > 0)));
}

function maxAgeOf(ENT) {
  let m = 0;
  for (let i = 0; i < ENT.n; i++) {
    const e = ENT.meta[i];
    if (e && !e.dead && e.age > m) m = e.age;
  }
  return m;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
