#!/usr/bin/env node
/** World-parameter unit tests — exoparams critical path. */

import {
  makeWorldRecord,
  gravityFromRm,
  densityFromRm,
  escapeVelocity,
  insolationFromLa,
  luminosityFromRT,
  teqFromInsolAlbedo,
  periodFromAM,
  tidalLockTimescaleYr,
  spectralClassFromTeff,
  formatField,
  validateRecord,
  coverageOf,
  HOSTS,
  CONTESTED,
  GAP_POLICY,
  ARCHIVE_CITATION,
  SCHEMA_VERSION,
} from './worldRecord.js';
import { starFromCatalogueItem, starFromHost, applyStarToRule, makeStar } from './star.js';
import { SEED_WORLDS, seedByName, seedForCatalogueItem } from '../worldParams.js';
import {
  rulesetFromCatalogue,
  validateCatalogueWorlds,
  catalogueCoverageReport,
  recordForCatalogueItem,
  CATALOGUE_WORLDS,
} from '../catalogue-rules.js';
import {
  compositionFromDensity,
  massClass,
  cosmicShoreline,
  parseWorldCsv,
  blackbodyRgb,
  orbitsStable,
} from './exophysics.js';

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name, detail); }
}

console.log('worldRecord physics');
{
  ok('schema version', SCHEMA_VERSION === 1);
  ok('Earth gravity 1 g', Math.abs(gravityFromRm(1, 1) - 1) < 1e-9);
  ok('Earth density ~5.51', Math.abs(densityFromRm(1, 1) - 5.514) < 0.01);
  ok('Earth escape ~11.2 km/s', Math.abs(escapeVelocity(1, 1) - 11.186) < 0.05);
  const L = luminosityFromRT(1, 5772);
  ok('Sol luminosity 1', Math.abs(L - 1) < 1e-6);
  ok('insolation at 1 AU', Math.abs(insolationFromLa(1, 1) - 1) < 1e-9);
  const teq = teqFromInsolAlbedo(1, 0);
  ok('teq A=0 ~278 K', teq > 270 && teq < 285);
  const P = periodFromAM(1, 1);
  ok('Kepler year ~365 d', Math.abs(P - 365.25) < 0.1);
  ok('spectral G from 5772', spectralClassFromTeff(5772).startsWith('G'));
  ok('TRAPPIST lock fast', tidalLockTimescaleYr(0.029, 0.09, 0.92, 0.69) < 1e8);
  ok('gap policy stated', GAP_POLICY.preferHole === true && GAP_POLICY.defaultAlbedo === 0.3);
  ok('archive citation present', ARCHIVE_CITATION.includes('NASA Exoplanet Archive'));
}

console.log('seed table');
{
  ok('120 seeded bodies', SEED_WORLDS.length === 120, `got ${SEED_WORLDS.length}`);
  ok('Earth seed', seedByName('Earth')?.r === 1 && seedByName('Earth')?.m === 1);
  ok('TRAPPIST-1 e seed', seedByName('TRAPPIST-1 e')?.teff === 2566);
  const rec = makeWorldRecord(seedByName('Venus'));
  ok('Venus record', rec && rec.key === 'venus');
  ok('Venus gravity from rm', Math.abs(rec.gravity.v - (0.815 / (0.9499 ** 2))) < 0.01);
  ok('Venus pressure 92 bar', rec.press.v === 92);
  ok('Venus albedo measured', rec.albedo.tier === 'measured' && rec.albedo.v === 0.76);
  ok('Venus retro rot', rec.rot.v < 0);
  const prox = makeWorldRecord(seedByName('Proxima Cen b'));
  ok('Proxima mass is Msini', prox.massProv === 'Msini');
  const kap = makeWorldRecord(seedByName('Kapteyn c'));
  ok('Kapteyn contested', kap.confidence === 'contested' && kap.contested);
  ok('contested table non-empty', CONTESTED.length >= 4);
}

console.log('TRAPPIST host fix');
{
  const item = { b: 'TRAPPIST-1 e', t: 'TRAPPIST-1 e', p: [], c: 'temperate' };
  const star = starFromCatalogueItem(item);
  ok('TRAPPIST name matches (not trapist)', star.teff === HOSTS.trappist1.teff, `teff=${star.teff}`);
  const hostStar = starFromHost(HOSTS.trappist1);
  ok('shared TRAPPIST host', hostStar.id === 'trappist1' && hostStar.lum > 0 && hostStar.lum < 0.001);
}

console.log('catalogue wiring');
{
  const earthItem = CATALOGUE_WORLDS.find((x) => x.b === 'Earth');
  ok('Earth in catalogue', !!earthItem);
  const earth = rulesetFromCatalogue(earthItem);
  ok('Earth ruleset has record', !!earth.worldRecord);
  ok('Earth pressure ~1 bar', Math.abs(earth.surfacePressureBar - 1.013) < 0.02);
  ok('Earth teqK set', earth.teqK > 250 && earth.teqK < 320);

  const trapItem = CATALOGUE_WORLDS.find((x) => x.b === 'TRAPPIST-1 e');
  const trap = trapItem && rulesetFromCatalogue(trapItem);
  ok('TRAPPIST-1 e ruleset', !!trap);
  ok('TRAPPIST locked', trap?.tidallyLocked === true);
  ok('TRAPPIST uses real a', trap?.semiMajorAu > 0.02 && trap?.semiMajorAu < 0.04);
  ok('TRAPPIST host shared id', trap?.star?.id === 'trappist1' || trap?.star?.teff === 2566);
  ok('TRAPPIST panel tilt disabled', trap?.panelRanges?.disabledTilt === true);

  const venItem = CATALOGUE_WORLDS.find((x) => x.b === 'Venus');
  const ven = venItem && rulesetFromCatalogue(venItem);
  ok('Venus retro day', ven?.rotationPeriod < 0);
  ok('Venus 92 bar', ven?.surfacePressureBar === 92);

  const bad = validateCatalogueWorlds();
  ok('all BODY rulesets build', bad.length === 0, bad.slice(0, 8).join(','));

  const cov = catalogueCoverageReport();
  const seeded = cov.filter((r) => r.seeded).length;
  ok('most worlds seeded', seeded >= 100, `seeded=${seeded}/${cov.length}`);

  // Fuzzy seed match
  const fuzzy = seedForCatalogueItem({ b: 'TRAPPIST-1 e' });
  ok('seedForCatalogueItem', fuzzy?.b === 'TRAPPIST-1 e');
}

console.log('derive consistency');
{
  const rec = recordForCatalogueItem(CATALOGUE_WORLDS.find((x) => x.b === 'Earth'));
  const problems = validateRecord(rec);
  ok('Earth validates', problems.length === 0, problems.join(','));
  const cov = coverageOf(rec);
  ok('Earth mostly measured', cov.measured >= 8);
  ok('formatField', formatField(rec.radius).includes('R⊕'));
  const rule = { solar: 1 };
  applyStarToRule(rule, makeStar({ teff: 5772, mass: 1, radius: 1 }), 1);
  ok('applyStar insolation ~1', Math.abs(rule.solarTrue - 1) < 0.01);
}

console.log('exophysics');
{
  const iron = compositionFromDensity(10.2, 0.72);
  ok('GJ 367-like iron-rich', iron.label === 'iron-rich' && iron.iron > 0.5);
  const puff = compositionFromDensity(0.17, 18);
  ok('puffball envelope', puff.envelope > 0.5);
  ok('KELT-1 is brown dwarf', massClass(8500).kind === 'brown-dwarf');
  ok('Earth below shoreline of airless', cosmicShoreline(1, 11.2) != null);
  const csv = parseWorldCsv('name,radius,mass,a\nFoo b,1.1,2.0,0.05\n');
  ok('CSV parse', csv[0]?.b === 'Foo b' && csv[0].r === 1.1);
  const rgb = blackbodyRgb(2566);
  ok('M dwarf sky redder', rgb[0] >= rgb[2] * 0.5);
  const stab = orbitsStable([
    { name: 'b', a: 0.01, e: 0, m: 1, mStar: 1 },
    { name: 'c', a: 0.02, e: 0, m: 1, mStar: 1 },
  ]);
  ok('stability helper runs', typeof stab.ok === 'boolean');
}

console.log('derived record extras');
{
  const gj = makeWorldRecord(seedByName('GJ 367 b'));
  ok('composition vector', gj.composition?.iron > 0.5);
  ok('scale height finite', gj.scaleH?.v > 0);
  ok('xuv dose', gj.xuv?.v > 0);
  const io = makeWorldRecord(seedByName('Io'));
  ok('Io moon parent Jupiter', io.moonParent?.parent === 'Jupiter');
  ok('Io tidal heat > 0', io.tidalHeatWm2?.v > 0);
  const mer = makeWorldRecord(seedByName('Mercury'));
  ok('Mercury 3:2', mer.spinOrbit?.p === 3);
  const hd = makeWorldRecord(seedByName('HD 80606 b / HD 20782 b / Kepler-1704 b'));
  ok('split members', hd.members?.length >= 2);
  const pso = makeWorldRecord(seedByName('PSO J318.5-22'));
  ok('free-floater null orbit', pso.a?.v === 0);
  const lhs = makeWorldRecord(seedByName('LHS 3844 b'));
  ok('measured-absent atmosphere', lhs.atmosphereState === 'measured-absent' || lhs.press?.v === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
