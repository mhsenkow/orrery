#!/usr/bin/env node
/**
 * dark-probe — measure polities, arsenals, exchanges and death toll.
 *
 * Companion to thrive-probe. Until world.js wires the dark tick, this script
 * drives polity / diplomacy / deterrence / dark itself after settlements exist.
 *
 *   node scripts/dark-probe.mjs
 *   node scripts/dark-probe.mjs --ticks=800 --json
 *   node scripts/dark-probe.mjs --rule=thrive --seed=20260808
 */

import { W, generate, simTick, RULESETS } from '../vr/world.js';
import { NC, NBR } from '../vr/sphere.js';
import { cloneRuleForRun } from '../vr/sim/ruleMode.js';
import { formatAge } from '../vr/sim/time.js';
import { settleCities } from '../vr/sim/city.js';
import {
  resetPolities, seedPolitiesFromCities, claimTerritory, borderCells,
  updatePolityStats, splitDisconnected, assertOwnerClosed,
} from '../vr/sim/polity.js';
import {
  resetDiplomacy, diplomacyTick, openWar, noteCasus, assertNoWarAmongAllies,
} from '../vr/sim/diplomacy.js';
import {
  resetDeterrence, deterrenceTick, considerLaunch,
} from '../vr/sim/deterrence.js';
import {
  resetDark, darkTick, darkProbeSnapshot, noteCasualty,
} from '../vr/sim/dark.js';

/** Dense a few land cells so headless runs always have polities to measure. */
function forceSettlements(n = 8) {
  const land = [];
  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= W.seaLevel + 0.02) land.push(c);
  }
  if (!land.length) return 0;
  const step = Math.max(1, (land.length / n) | 0);
  let made = 0;
  for (let i = 0; i < n && i * step < land.length; i++) {
    const c = land[(i * step + i * 97) % land.length];
    W.build[c] = Math.max(W.build[c], 0.82);
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      W.build[nb] = Math.max(W.build[nb], 0.4);
    }
    made++;
  }
  settleCities(W);
  return made;
}

function standUpPolities() {
  if (!(W.cities?.length)) settleCities(W);
  if (!(W.cities?.length)) return false;
  seedPolitiesFromCities(W, null);
  claimTerritory(W);
  updatePolityStats(W);
  borderCells(W);
  return (W.polities || []).length > 0;
}

/** Pick two polities that actually share a border — otherwise the front never forms. */
function pickBorderPair() {
  const own = W.owner;
  if (!own || !W.border) return null;
  for (let c = 0; c < NC; c++) {
    if (!(W.border[c] > 0)) continue;
    const a = own[c];
    if (a < 0) continue;
    for (let k = 0; k < 4; k++) {
      const b = own[NBR[c * 4 + k]];
      if (b >= 0 && b !== a) return [a, b, c];
    }
  }
  const pols = W.polities || [];
  if (pols.length >= 2) return [pols[0].id, pols[1].id, pols[0].capital];
  return null;
}

export function probeDark({
  seed = 20260808,
  ruleId = 'thrive',
  ticks = 400,
  forceCities = true,
} = {}) {
  const base = RULESETS.find((r) => r.id === ruleId);
  if (!base) throw new Error(`no ruleset '${ruleId}'`);
  const rule = cloneRuleForRun(base);
  generate(seed, rule);

  resetPolities(W);
  resetDiplomacy(W);
  resetDeterrence(W);
  resetDark(W);

  const startAge = W.ageYr;
  let seededAt = -1;
  let firstWar = -1;

  for (let t = 1; t <= ticks; t++) {
    simTick(true);

    if (seededAt < 0) {
      if (forceCities && t === Math.max(20, (ticks * 0.15) | 0)) forceSettlements(8);
      if ((W.cities?.length || 0) >= 1 || (forceCities && t > 25)) {
        if (standUpPolities()) seededAt = t;
      }
    } else if ((t - seededAt) % 4 === 0) {
      seedPolitiesFromCities(W, null);
      claimTerritory(W);
      splitDisconnected(W, null);
    }

    if ((W.polities || []).length >= 2) {
      diplomacyTick(W, null);
      deterrenceTick(W, null);
      darkTick(W, null);

      if (firstWar < 0 && seededAt > 0 && t === seededAt + 40) {
        const pair = pickBorderPair();
        if (pair) {
          const [a, b, cell] = pair;
          const pa = W._polityIndex.get(a);
          const pb = W._polityIndex.get(b);
          if (pa) { pa.doctrine = 'warning'; pa.arsenal = Math.max(pa.arsenal || 0, 5); }
          if (pb) { pb.doctrine = 'retaliate'; pb.arsenal = Math.max(pb.arsenal || 0, 5); }
          noteCasus(W, a, b, 'border', cell, 'a contested border');
          const r = openWar(W, a, b, { kind: 'border', label: 'a contested border' }, null);
          if (r.ok) firstWar = t;
          // Retaliate-doctrine polity fires while at war.
          considerLaunch(W, b, a, null, { retaliate: false });
          noteCasualty(W, 'war', 120, false);
        }
      }
    }
  }

  let ownerOk = true, allyOk = true;
  try { assertOwnerClosed(W); } catch { ownerOk = false; }
  try { assertNoWarAmongAllies(W); } catch { allyOk = false; }

  const snap = darkProbeSnapshot(W);
  return {
    ruleId,
    ruleName: rule.name,
    seed,
    ticks,
    cells: NC,
    clock: {
      startAge: formatAge(startAge),
      endAge: formatAge(W.ageYr),
      yearsElapsed: W.ageYr - startAge,
    },
    seededAt,
    firstWar,
    asserts: { ownerClosed: ownerOk, noWarAmongAllies: allyOk },
    ...snap,
  };
}

function fmt(x, n = 4) {
  return typeof x === 'number' ? x.toFixed(n) : String(x);
}

function report(r) {
  const L = [];
  L.push(`dark-probe  ${r.ruleName} (${r.ruleId})  seed ${r.seed}  ${r.ticks} ticks  ${r.cells} cells`);
  L.push(`clock       ${r.clock.startAge} → ${r.clock.endAge}  (${r.clock.yearsElapsed.toLocaleString()} yr)`);
  L.push('');
  L.push(`polities    ${r.polities}  largest share ${fmt(r.largestShare * 100, 1)}%  border ${r.borderLen}`);
  L.push(`            seeded at tick ${r.seededAt}  first war at ${r.firstWar}`);
  L.push(`arsenals    total ${fmt(r.arsenals, 2)}`);
  for (const p of (r.arsenalByPolity || []).slice(0, 8)) {
    L.push(`            ${p.name}  cells=${p.cells}  arsenal=${p.arsenal}  ${p.doctrine}`);
  }
  L.push(`exchanges   considered ${r.exchanges.considered}  launched ${r.exchanges.launched}`
    + `  retaliated ${r.exchanges.retaliated}  declined ${r.exchanges.declined}`);
  L.push(`doomsday    ${fmt(r.doomsday, 3)}`);
  L.push(`death toll  total ${fmt(r.darkToll.total, 0)}`
    + `  blast=${fmt(r.darkToll.blast, 0)} fallout=${fmt(r.darkToll.fallout, 0)}`
    + ` famine=${fmt(r.darkToll.famine, 0)} disease=${fmt(r.darkToll.disease, 0)}`
    + ` war=${fmt(r.darkToll.war, 0)} poison=${fmt(r.darkToll.poison, 0)}`
    + ` player=${fmt(r.darkToll.player, 0)}`);
  L.push(`war crimes  ${r.warCrimes}  fought cells ${r.foughtCells}`);
  L.push(`front       ${r.dark.frontLen}  rubble ${r.dark.rubble}`
    + `  exclusion ${r.dark.exclusion}  winter ${fmt(r.dark.winter, 3)}`);
  L.push(`            supplyCut ${r.dark.supplyCut || 0}  stalls ${r.dark.supplyCutStalls || 0}`
    + `  sats ${r.dark.satellites || 0}  debris ${r.dark.debris || 0}`
    + `  kessler ${!!r.dark.kessler}  sai ${fmt(r.dark.sai || 0, 3)}`
    + `  shock ${fmt(r.dark.terminationShock || 0, 3)}`
    + `  droneCiv ${r.dark.droneCivCasualties || 0}`);
  L.push(`asserts     ownerClosed=${r.asserts.ownerClosed}  noWarAmongAllies=${r.asserts.noWarAmongAllies}`);
  return L.join('\n');
}

if (process.argv[1] && process.argv[1].includes('dark-probe')) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v === undefined ? true : (/^-?\d+$/.test(v) ? +v : v)];
    }),
  );
  const r = probeDark({
    seed: args.seed || 20260808,
    ruleId: args.rule || 'thrive',
    ticks: args.ticks || 400,
    forceCities: args.force !== false,
  });
  console.log(args.json ? JSON.stringify(r, null, 2) : report(r));
}
