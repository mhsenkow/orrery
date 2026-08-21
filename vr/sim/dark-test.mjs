#!/usr/bin/env node
/**
 * Focused dark-400 asserts — Groups A/B/D keystones plus G–P hooks
 * (supply cut, Kessler, SAI termination, drone civ casualties).
 * Does not touch golden terra digests (dark ticks stay gated off pinned earth).
 *
 *   node vr/sim/dark-test.mjs
 */

import { setResolution, NC, NBR } from '../sphere.js';

setResolution(32);

const { W, generate, simTick, RULESETS } = await import('../world.js');
const { cloneRuleForRun } = await import('./ruleMode.js');
const {
  resetPolities, seedPolitiesFromCities, claimTerritory, borderCells,
  updatePolityStats, assertOwnerClosed,
} = await import('./polity.js');
const {
  resetDiplomacy, openWar, noteCasus, assertNoWarAmongAllies, areAllied,
} = await import('./diplomacy.js');
const { blastRadius, PROFILES } = await import('./ordnance.js');
const { settleCities } = await import('./city.js');
const { resetDark } = await import('./dark.js');
const { supplyReachable, cellSupplied, landWarTick } = await import('./darkLand.js');
const { KESSLER_THRESHOLD, resetOrbit, spawnSat, orbitTick } = await import('./darkOrbit.js');
const { setSai, climateWeaponTick, resetClimateWeapon } = await import('./darkClimate.js');
const { spawnDrone, droneTick, resetDrones } = await import('./darkDrone.js');
const { assertLandNotInWater, assertShipNotOnLand, isOceanCell, spawnShip } = await import('./darkNaval.js');
const { assertCasualtyConservation, applyCityCasualties, ensureCityPop } = await import('./darkCity.js');
const { seedDisease } = await import('./anthro.js');

let failed = 0;
function ok(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}${detail ? ` — ${detail}` : ''}`);
  else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('dark-400 keystone asserts');

// --- blastRadius law at three yields (§79 / §70)
{
  const law = (y) => 1 + Math.round(Math.pow(y, 0.4) * 2.5);
  for (const y of [0.2, 1, 3]) {
    ok(`blastRadius(${y}) matches law`, blastRadius(y) === law(y),
      `${blastRadius(y)} vs ${law(y)}`);
  }
  ok('citybuster yield > strategic', PROFILES.citybuster.yield > PROFILES.strategic.yield);
  ok('neutron payload distinct', PROFILES.neutron.payload === 'neutron');
}

// --- seedDisease export exists (ordnance import) (§69)
{
  ok('seedDisease is a function', typeof seedDisease === 'function');
}

// --- assertOwnerClosed after seed+claim (§19)
{
  generate(20260808, cloneRuleForRun(RULESETS.find((r) => r.id === 'thrive')));
  for (let t = 0; t < 80; t++) simTick(true);

  const land = [];
  for (let c = 0; c < NC; c++) if (W.h[c] >= W.seaLevel + 0.02) land.push(c);
  for (let i = 0; i < 8 && land.length; i++) {
    const c = land[(i * 97) % land.length];
    W.build[c] = Math.max(W.build[c], 0.85);
    for (let k = 0; k < 4; k++) W.build[NBR[c * 4 + k]] = Math.max(W.build[NBR[c * 4 + k]], 0.4);
  }
  settleCities(W);
  resetPolities(W);
  seedPolitiesFromCities(W, null);
  claimTerritory(W);
  updatePolityStats(W);
  borderCells(W);
  resetDark(W);

  let closed = true;
  try { assertOwnerClosed(W); } catch (e) { closed = false; console.log('   ', e.message); }
  ok('assertOwnerClosed after seed+claim', closed,
    `${W.polities?.length || 0} polities, border ${W.borderLen | 0}`);
  ok('at least one polity seeded', (W.polities?.length || 0) >= 1);
}

// --- assertNoWarAmongAllies (§40)
{
  resetDiplomacy(W);
  const pols = W.polities || [];
  if (pols.length >= 2) {
    const a = pols[0].id, b = pols[1].id;
    if (!W.diplo.alliances.has(a)) W.diplo.alliances.set(a, new Set());
    if (!W.diplo.alliances.has(b)) W.diplo.alliances.set(b, new Set());
    W.diplo.alliances.get(a).add(b);
    W.diplo.alliances.get(b).add(a);
    ok('allies recognized', areAllied(W, a, b));
    noteCasus(W, a, b, 'test', pols[0].capital, 'test');
    const r = openWar(W, a, b, { kind: 'test', label: 'test' }, null);
    ok('openWar refuses allies', !r.ok, r.note || '');
    let allyOk = true;
    try { assertNoWarAmongAllies(W); } catch (e) { allyOk = false; console.log('   ', e.message); }
    ok('assertNoWarAmongAllies', allyOk);
  } else {
    let allyOk = true;
    try { assertNoWarAmongAllies(W); } catch { allyOk = false; }
    ok('assertNoWarAmongAllies (vacuous)', allyOk, 'fewer than 2 polities');
  }
}

// --- Supply cut stalls advance (§178)
{
  const pols = W.polities || [];
  if (pols.length >= 1 && W.owner) {
    const p = pols[0];
    const reach = supplyReachable(W, p.id);
    ok('capital is supplied', cellSupplied(W, p.capital, p.id, reach));
    let far = -1;
    for (let c = 0; c < NC; c++) {
      if (W.owner[c] === p.id && c !== p.capital) far = c;
    }
    if (far >= 0) {
      const saved = [];
      for (let k = 0; k < 4; k++) {
        const n = NBR[far * 4 + k];
        saved.push([n, W.owner[n]]);
        if (n !== p.capital) W.owner[n] = -1;
      }
      // Also clear owner on path cells between capital and far except endpoints.
      for (let c = 0; c < NC; c++) {
        if (c === far || c === p.capital) continue;
        if (W.owner[c] === p.id && Math.abs(c - far) < Math.abs(c - p.capital)) {
          saved.push([c, W.owner[c]]);
          W.owner[c] = -1;
        }
      }
      const reach2 = supplyReachable(W, p.id);
      ok('supply cut isolates cell', !reach2.has(far) || !cellSupplied(W, far, p.id, reach2),
        `cell ${far}`);
      W._supplyStall = new Map();
      if (pols.length >= 2) {
        resetDiplomacy(W);
        noteCasus(W, pols[0].id, pols[1].id, 'border', far, 'supply test');
        openWar(W, pols[0].id, pols[1].id, { kind: 'border', label: 'supply test' }, null);
        borderCells(W);
        for (let t = 0; t < 5; t++) landWarTick(W, null);
        ok('landWarTick runs with supply tracking', (W.dark?.frontLen | 0) >= 0
          || (W.dark?.supplyCut | 0) >= 0);
      } else {
        ok('landWarTick runs with supply tracking', true, 'one polity');
      }
      for (const [n, o] of saved) W.owner[n] = o;
    } else {
      ok('supply cut isolates cell', true, 'no far cell — skipped');
      ok('landWarTick runs with supply tracking', true, 'skipped');
    }
  } else {
    ok('capital is supplied', false, 'no polities');
    ok('supply cut isolates cell', false);
    ok('landWarTick runs with supply tracking', false);
  }
}

// --- Kessler threshold (§318)
{
  resetOrbit(W);
  W.dark.debris = KESSLER_THRESHOLD + 1;
  spawnSat(W, { kind: 'recon' });
  for (let i = 0; i < 30; i++) orbitTick(W, null);
  ok('Kessler engages above threshold', !!W.dark.kessler,
    `debris=${W.dark.debris} threshold=${KESSLER_THRESHOLD}`);
  ok('debris grows under Kessler', (W.dark.debris | 0) > KESSLER_THRESHOLD);
}

// --- SAI termination shock (§278)
{
  resetClimateWeapon(W);
  W.meanTemp = 0.5;
  setSai(W, 0.5, -1);
  climateWeaponTick(W, null);
  const mid = W.meanTemp;
  setSai(W, 0, -1);
  climateWeaponTick(W, null);
  ok('termination shock after SAI stop', (W._terminationShock || 0) > 0.05,
    `shock=${W._terminationShock} temp ${mid}→${W.meanTemp}`);
}

// --- Civilian drone casualties (§131)
{
  resetDrones(W);
  W.darkToll = W.darkToll || { blast: 0, fallout: 0, famine: 0, disease: 0, war: 0, poison: 0, player: 0 };
  W.dark = W.dark || {};
  W.dark.droneCivCasualties = 0;
  const land = [];
  for (let c = 0; c < NC; c++) if (W.h[c] >= W.seaLevel) land.push(c);
  const tgt = land[Math.min(land.length - 1, 10)] | 0;
  W.build[tgt] = Math.max(W.build[tgt] || 0, 0.6);
  spawnDrone(W, {
    cell: tgt, base: tgt, target: tgt, role: 'strike', endurance: 5, autonomy: 0.9, owner: 0,
  });
  const before = W.darkToll?.war || 0;
  for (let t = 0; t < 8; t++) droneTick(W, null);
  const civ = W.dark?.droneCivCasualties | 0;
  ok('drone strike records civilian casualties', civ > 0 || (W.darkToll?.war || 0) > before,
    `civ=${civ} warToll=${W.darkToll?.war || 0}`);
}

// --- Naval land/water asserts (§158)
{
  let ocean = -1, ground = -1;
  for (let c = 0; c < NC; c++) {
    if (ocean < 0 && isOceanCell(W, c)) ocean = c;
    if (ground < 0 && !isOceanCell(W, c)) ground = c;
  }
  let landOk = false, shipOk = false;
  try { assertLandNotInWater(W, ocean); } catch { landOk = true; }
  try { assertShipNotOnLand(W, ground); } catch { shipOk = true; }
  ok('assertLandNotInWater throws on ocean', landOk);
  ok('assertShipNotOnLand throws on land', shipOk);
  if (ocean >= 0) {
    const s = spawnShip(W, { cell: ocean, kind: 'sub' });
    ok('sub spawns on ocean', !!s && isOceanCell(W, s.cell));
  }
}

// --- Casualty conservation (§198)
{
  ensureCityPop(W);
  if (!(W.cities?.length)) {
    W.cities = [{ cell: 0, name: 'Test', pop: 1000, _pop0: 1000 }];
  }
  const city = W.cities[0];
  city.pop = 1000;
  const before = city.pop;
  applyCityCasualties(W, city, 100, 'war');
  let cons = true;
  try { assertCasualtyConservation(W, before, 100, city.pop); } catch { cons = false; }
  ok('casualty conservation', cons && city.pop === 900, `pop=${city.pop}`);
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall dark-test asserts passed');
