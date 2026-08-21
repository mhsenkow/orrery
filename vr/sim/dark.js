/** Dark umbrella — consequence, accounting, and ticks for G–T.
 *
 *  Groups A–C own countries, diplomacy and deterrence. This file is the rest:
 *  death tolls you cannot clear, war-crimes that keep their names, contested
 *  cells that remember how often they were fought over, and real module ticks
 *  for drones, naval, land supply, cities, industry, climate weapons, cyber,
 *  orbit and thin audio hooks.
 *
 *  dark-400 groups G–T.
 */

import { NC } from '../sphere.js';
import { polityAt } from './polity.js';
import { droneTick, resetDrones } from './darkDrone.js';
import { navalTick, resetNaval } from './darkNaval.js';
import { landWarTick, resetLand } from './darkLand.js';
import { cityDarkTick, resetCityDark } from './darkCity.js';
import { industryTick, resetIndustry } from './darkIndustry.js';
import { climateWeaponTick, resetClimateWeapon } from './darkClimate.js';
import { infoTick, resetInfo } from './darkInfo.js';
import { orbitTick, resetOrbit } from './darkOrbit.js';
import { darkAudioFromWorld } from './darkAudio.js';

const TOLL_KEYS = ['blast', 'fallout', 'famine', 'disease', 'war', 'poison', 'player'];

function emptyToll() {
  const o = Object.create(null);
  for (const k of TOLL_KEYS) o[k] = 0;
  return o;
}

export function resetDark(W) {
  W.darkToll = emptyToll();
  W.warCrimes = [];
  if (W.fought?.length === NC) W.fought.fill(0);
  else W.fought = null;
  W.dark = {
    drones: [],
    naval: [],
    fronts: [],
    rubble: 0,
    refugees: 0,
    exclusion: 0,
    winter: 0,
    cyber: 0,
    satellites: 0,
    debris: 0,
    audioMuted: false,
    tribunal: null,
    uninhabitable: false,
  };
  W._darkLogTick = 0;
  resetDrones(W);
  resetNaval(W);
  resetLand(W);
  resetCityDark(W);
  resetIndustry(W);
  resetClimateWeapon(W);
  resetInfo(W);
  resetOrbit(W);
}

function ensureFought(W) {
  if (!W.fought || W.fought.length !== NC) W.fought = new Float32Array(NC);
}

/**
 * Attribute casualties. `cause` is one of the toll keys; player acts always
 * increment `player` as well when `playerAttributed` is true (§361–362).
 */
export function noteCasualty(W, cause, n, playerAttributed = false) {
  if (!W.darkToll) W.darkToll = emptyToll();
  const k = TOLL_KEYS.includes(cause) ? cause : 'war';
  const amt = Math.max(0, n || 0);
  W.darkToll[k] = (W.darkToll[k] || 0) + amt;
  if (playerAttributed) W.darkToll.player = (W.darkToll.player || 0) + amt;
  if (W.attribution) {
    W.attribution.acts = (W.attribution.acts | 0) + 1;
    if (playerAttributed) {
      W.attribution.player = Math.min(1, (W.attribution.player || 0) + amt * 1e-6);
    }
  }
  return W.darkToll[k];
}

/** Acts a treaty forbade — listed by name and date (§364). */
export function noteWarCrime(W, name, cell, actorId) {
  if (!W.warCrimes) W.warCrimes = [];
  W.warCrimes.push({
    name,
    cell: cell | 0,
    actor: actorId ?? W.playerPolity ?? -1,
    year: W.ageYr || W.year || 0,
    tick: W._tickIndex | 0,
  });
  if (W.warCrimes.length > 128) W.warCrimes.splice(0, W.warCrimes.length - 96);
}

/** Contested cell: bump fight count (§374). */
export function noteFought(W, c, n = 1) {
  if (c < 0 || c >= NC) return;
  ensureFought(W);
  W.fought[c] = Math.min(255, (W.fought[c] || 0) + n);
}

/** Harvest casualties from existing hazard fields into the toll. */
function attributeHazards(W) {
  const plague = W.plagueDeaths || 0;
  const prev = W._darkPlagueSeen || 0;
  if (plague > prev) {
    noteCasualty(W, 'disease', Math.floor((plague - prev) * 1000));
    W._darkPlagueSeen = plague;
  }
  if ((W.radPeak || 0) > 0.5 && (W._tickIndex | 0) % 16 === 0) {
    let hot = 0;
    const list = W._radCells || [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if ((W.rad[c] || 0) > 0.2 && (W.build?.[c] || 0) > 0.05) hot++;
    }
    if (hot) noteCasualty(W, 'fallout', hot * 2);
  }
  const ruin = W.warRuin || 0;
  const prevR = W._darkWarSeen || 0;
  if (ruin > prevR) {
    noteCasualty(W, 'war', Math.floor((ruin - prevR) * 500));
    W._darkWarSeen = ruin;
  }
  if ((W.toxinCells || 0) > 20 && (W._tickIndex | 0) % 32 === 0) {
    noteCasualty(W, 'poison', W.toxinCells >> 2);
  }
}

/** Nuclear winter from dust after exchanges (§K / §207). */
function aftermathTick(W) {
  W.dark = W.dark || {};
  const dust = W.gases?.dust || 0;
  if (dust > 0.02 && (W.exchangesLaunched || 0) > 0) {
    W.dark.winter = Math.min(1, dust * 4);
    if (W.dark.winter > 0.2 && (W._tickIndex | 0) % 20 === 0) {
      noteCasualty(W, 'famine', Math.floor(W.dark.winter * 50));
      if (W.meanTemp != null) W.meanTemp = Math.max(0.05, W.meanTemp - 0.0004 * W.dark.winter);
    }
  } else {
    W.dark.winter = Math.max(0, (W.dark.winter || 0) * 0.99);
  }
  let excl = 0;
  const list = W._radCells || [];
  for (let i = 0; i < list.length; i++) {
    if ((W.rad[list[i]] || 0) > 0.35) excl++;
  }
  W.dark.exclusion = excl;
}

export function darkTick(W, log = null) {
  if (!W.darkToll) resetDark(W);
  attributeHazards(W);
  landWarTick(W, log);
  aftermathTick(W);
  droneTick(W, log);
  navalTick(W, log);
  cityDarkTick(W, log);
  industryTick(W, log);
  climateWeaponTick(W, log);
  infoTick(W, log);
  orbitTick(W, log);
  darkAudioFromWorld(W);

  W.dark = W.dark || {};
  W.dark.tickBudgetMs = W.dark.tickBudgetMs || 2;

  if ((W.meanLife || 0) < 0.002 && (W.darkToll?.blast || 0) + (W.darkToll?.fallout || 0) > 1000) {
    if (!W.dark.uninhabitable) {
      W.dark.uninhabitable = true;
      if (log) log(W.year, 'end', 0, 1, 'The surface no longer holds life');
    }
  }

  for (const f of W.flight || []) {
    if (f._darkNoted || f.at < (f.path?.length || 0) - 1) continue;
    if ((W.build?.[f.to] || 0) > 0.5 && (f.payload === 'nuclear' || f.kind === 'icbm')) {
      f._darkNoted = true;
      const actor = polityAt(W, f.from);
      noteWarCrime(W, 'nuclear strike on a city', f.to, actor);
      noteCasualty(W, 'blast', 500 + Math.floor((f.yield || 1) * 2000),
        actor === (W.playerPolity ?? -2));
    }
  }
}

/** Snapshot for scripts/dark-probe.mjs (§381). */
export function darkProbeSnapshot(W) {
  const pols = W.polities || [];
  let largest = 0, totalCells = 0;
  let arsenal = 0;
  for (const p of pols) {
    totalCells += p.cells | 0;
    if ((p.cells | 0) > largest) largest = p.cells | 0;
    arsenal += p.arsenal || 0;
  }
  const toll = W.darkToll || emptyToll();
  const tollSum = TOLL_KEYS.reduce((s, k) => s + (toll[k] || 0), 0);
  return {
    polities: pols.length,
    largestShare: totalCells ? largest / totalCells : 0,
    borderLen: W.borderLen || 0,
    arsenals: arsenal,
    arsenalByPolity: pols.map((p) => ({
      id: p.id, name: p.name, arsenal: +(p.arsenal || 0).toFixed(2),
      doctrine: p.doctrine, cells: p.cells | 0,
    })),
    exchanges: {
      considered: W.exchangesConsidered | 0,
      launched: W.exchangesLaunched | 0,
      retaliated: W.exchangesRetaliated | 0,
      declined: W.exchangesDeclined | 0,
    },
    doomsday: W.doomsday || 0,
    darkToll: { ...toll, total: tollSum },
    warCrimes: (W.warCrimes || []).length,
    foughtCells: (() => {
      if (!W.fought) return 0;
      let n = 0;
      for (let i = 0; i < W.fought.length; i++) if (W.fought[i] > 0) n++;
      return n;
    })(),
    dark: {
      frontLen: W.dark?.frontLen || 0,
      rubble: W.dark?.rubble || 0,
      exclusion: W.dark?.exclusion || 0,
      winter: W.dark?.winter || 0,
      satellites: W.dark?.satellites || 0,
      debris: W.dark?.debris || 0,
      kessler: !!W.dark?.kessler,
      sai: W.dark?.sai || 0,
      terminationShock: W.dark?.terminationShock || 0,
      supplyCut: W.dark?.supplyCut || 0,
      supplyCutStalls: W.dark?.supplyCutStalls || 0,
      droneCivCasualties: W.dark?.droneCivCasualties || 0,
      uninhabitable: !!W.dark?.uninhabitable,
    },
  };
}
