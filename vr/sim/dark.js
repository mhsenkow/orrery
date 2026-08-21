/** Dark umbrella — consequence, accounting, visuals, and ticks for G–T.
 *
 *  Groups A–C own countries, diplomacy and deterrence. This file is the rest:
 *  death tolls you cannot clear, war-crimes that keep their names, contested
 *  cells that remember how often they were fought over, visual stubs (Q),
 *  thin audio hooks (R), and real module ticks for drones through CBR.
 *
 *  Tick budget: war layer targets ≤2 ms (`W.dark.tickBudgetMs`).
 *  Geom budget: flight arcs + mushrooms ≤1.5 ms (`W.dark.geomBudgetMs`).
 *  Audio budget: cue scan ≤0.5 ms (`W.dark.audioBudgetMs`).
 *
 *  dark-400 groups G–T.
 */

import { NC, NBR } from '../sphere.js';
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
import { cbrTick, resetCbr } from './darkCbr.js';
import { spectacleTick, resetSpectacle } from './darkSpectacle.js';
import { isExcluded } from './anthro.js';

const TOLL_KEYS = ['blast', 'fallout', 'famine', 'disease', 'war', 'poison', 'player'];

/** Seeded given-name for struck civilians (§369). Fitted syllable tables @ N=32. */
const NAMES_A = ['Ash', 'Bri', 'Cor', 'Del', 'Fen', 'Gri', 'Hel', 'Jor', 'Kel', 'Lum',
  'Mor', 'Nyx', 'Orn', 'Pyx', 'Quin', 'Ryn', 'Sol', 'Tor', 'Ulm', 'Vex'];
const NAMES_B = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'or', 'en', 'an'];

function seedName(seed, i) {
  const x = ((seed + i * 9973) >>> 0) || 1;
  const a = (x % NAMES_A.length);
  const b = ((x / 17) | 0) % NAMES_B.length;
  return NAMES_A[a] + NAMES_B[b];
}

function emptyToll() {
  const o = Object.create(null);
  for (const k of TOLL_KEYS) o[k] = 0;
  return o;
}

export function resetDark(W) {
  W.darkToll = emptyToll();
  W.warCrimes = [];
  /* The extinction attributor's memory of last tick's biosphere. Left behind, it
     carried one planet's meanLife into the next one's first comparison — which is
     how the reset test caught it: generate, run, generate, and this one number
     did not match a fresh world. */
  W._darkMeanLife = null;
  W._darkExtSeen = 0;
  if (W.fought?.length === NC) W.fought.fill(0);
  else W.fought = null;
  W.mushrooms = [];
  // Allocate empty arrays in reset for honesty (§383) — spawn paths may refill.
  W.shockwave = new Float32Array(NC);
  W.smoke = new Float32Array(NC);
  W.fireball = new Float32Array(NC);
  W._shockEvents = [];
  W._blastFlash = 0;
  W._blastPunch = 0;
  resetSpectacle(W);
  W.dark = {
    drones: 0,
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
    audioLayers: null,
    audioBudgetMs: 0.5,
    tickBudgetMs: 2,
    geomBudgetMs: 1.5,
    geomBudget: 1.5,
    tribunal: null,
    counterfactual: null,
    benefited: null,
    legacy: null,
    recoveryNotes: 0,
    archiveLoss: 0,
    namedDeaths: 0,
    testimonies: 0,
    extinctAttributed: 0,
    polityHistories: [],
    uninhabitable: false,
    droneSorties: 0,
    droneLosses: 0,
    droneCivCasualties: 0,
    seaControl: 0,
    tonnageSunk: 0,
    lanesCut: 0,
    droneFocus: -1,
    timelapse: false,
    followFlight: -1,
    pyramids: null,
    strata: 0,
    conscripted: 0,
    chokeHeld: 0,
    ports: 0,
    convoys: 0,
    wrecks: 0,
    medical: 0,
    dualUseResearch: 0,
  };
  W._darkLogTick = 0;
  W._darkLogCount = 0;
  W._darkBaseline = null;
  W._lastDetCell = -1;
  W._lastDetDist = 0;
  resetDrones(W);
  resetNaval(W);
  resetLand(W);
  resetCityDark(W);
  resetIndustry(W);
  resetClimateWeapon(W);
  resetInfo(W);
  resetOrbit(W);
  resetCbr(W);
}

function ensureFought(W) {
  if (!W.fought || W.fought.length !== NC) W.fought = new Float32Array(NC);
}

/**
 * Attribute casualties. `cause` is one of the toll keys; player acts always
 * increment `player` as well when `playerAttributed` is true (§361–362).
 * Death toll is never cleared except by `resetDark` / generate.
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

/** Mark an Evil-desk act on W.attribution (§363, 379). Fingerprint only. */
export function noteAttribution(W, tool, cell = -1) {
  if (!W.attribution) W.attribution = { player: 0, planet: 1, acts: 0 };
  W.attribution.lastTool = tool;
  W.attribution.lastCell = cell | 0;
  W.attribution.lastTick = W._tickIndex | 0;
  return W.attribution;
}

/** Assert every Evil act left an attribution fingerprint (§379). */
export function assertEvilAttributed(W, tool) {
  if (W.attribution?.lastTool !== tool) {
    throw new Error(`Evil act not attributed: expected ${tool}, got ${W.attribution?.lastTool}`);
  }
  return true;
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

/**
 * Rate-limited war chronicle (§378). Settlement-style: ≤1 war line per 4 ticks
 * unless severity ≥ 0.8.
 */
export function darkWarLog(W, log, cell, severity, text) {
  if (!log) return false;
  const tick = W._tickIndex | 0;
  if (severity < 0.8) {
    if (tick - (W._darkLogTick | 0) < 4) return false;
  }
  W._darkLogTick = tick;
  W._darkLogCount = (W._darkLogCount | 0) + 1;
  log(W.year, 'war', cell | 0, severity, text);
  return true;
}

/** Spawn mushroom cloud — long-lived stem + expanding cap (§325). */
export function spawnMushroom(W, cell, power = 1) {
  if (!W.mushrooms) W.mushrooms = [];
  W.mushrooms.push({
    cell: cell | 0,
    age: 0,
    power: Math.max(0.35, power),
    // Fireball lingers so the first frames are white-hot, not a brown smudge.
    fireball: Math.min(1.4, 0.7 + power * 0.45),
  });
  if (W.mushrooms.length > 24) W.mushrooms.splice(0, W.mushrooms.length - 16);
  // Ground scorch at ground zero.
  if (!W.fireball || W.fireball.length !== NC) W.fireball = new Float32Array(NC);
  W.fireball[cell | 0] = Math.min(1.5, (W.fireball[cell | 0] || 0) + 0.9 + power * 0.5);
  for (let k = 0; k < 4; k++) {
    const n = NBR[(cell | 0) * 4 + k];
    W.fireball[n] = Math.min(1.5, (W.fireball[n] || 0) + 0.55 + power * 0.25);
  }
}

/**
 * Expanding shockwave — stores a wavefront that grows each tick (§327).
 * `spawnShockwave` seeds the event; `darkVisualTick` paints the ring.
 */
export function spawnShockwave(W, cell, power = 1) {
  if (!W._shockEvents) W._shockEvents = [];
  W._shockEvents.push({
    cell: cell | 0,
    power: Math.max(0.4, power),
    age: 0,
    maxR: Math.min(10, 3 + Math.round(Math.pow(power, 0.45) * 4)),
  });
  if (W._shockEvents.length > 12) W._shockEvents.shift();
  // Immediate bright flash at ground zero so the first frame is not empty.
  if (!W.shockwave || W.shockwave.length !== NC) W.shockwave = new Float32Array(NC);
  W.shockwave[cell | 0] = Math.max(W.shockwave[cell | 0], 1.2);
}

/** Blast flash: a short, local overexposure — not a full-frame whiteout (§326). */
export function spawnBlastFlash(W, power = 1) {
  const p = Math.max(0.2, Math.min(2.2, power));
  W._blastFlash = Math.min(1.15, (W._blastFlash || 0) + 0.45 + p * 0.28);
  // Mild flareGlow only — stellar flares own the disc wash; nukes stay local.
  W.flareGlow = Math.min(0.55, (W.flareGlow || 0) + 0.12 + p * 0.08);
  W._blastPunch = Math.min(0.55, (W._blastPunch || 0) + 0.18 + p * 0.12);
}

/** Named death via seedword on a struck city (§369). */
export function noteNamedDeath(W, city, cause = 'blast') {
  if (!city) return null;
  W.dark = W.dark || {};
  const i = (W.dark.namedDeaths | 0) + 1;
  W.dark.namedDeaths = i;
  const name = seedName((W.seed | 0) ^ (city.cell | 0), i);
  const entry = { name, city: city.name || 'unnamed', cell: city.cell | 0, cause, year: W.ageYr || 0 };
  if (!W.dark.namedDeathList) W.dark.namedDeathList = [];
  W.dark.namedDeathList.push(entry);
  if (W.dark.namedDeathList.length > 32) W.dark.namedDeathList.shift();
  return entry;
}

/** First-person survivor testimony into chronicle (§370). */
export function noteSurvivorTestimony(W, log, cell, cityName) {
  if (!log) return;
  W.dark = W.dark || {};
  if ((W.dark.testimonies | 0) > 12) return;
  W.dark.testimonies = (W.dark.testimonies | 0) + 1;
  const who = seedName(W.seed | 0, (W.dark.testimonies | 0) + 400);
  const place = cityName || 'the city';
  log(W.year, 'testimony', cell | 0, 0.5,
    `I am ${who}. I was in ${place} when the light came.`);
}

/** Museum / archive loss as distinct destruction (§373). */
export function noteArchiveLoss(W, cell, amount = 1) {
  W.dark = W.dark || {};
  W.dark.archiveLoss = (W.dark.archiveLoss | 0) + amount;
  if (!W.dark.archiveSites) W.dark.archiveSites = [];
  W.dark.archiveSites.push({ cell: cell | 0, year: W.ageYr || 0 });
  if (W.dark.archiveSites.length > 48) W.dark.archiveSites.shift();
}

/** Per-polity history that outlives the polity (§372). */
export function notePolityHistory(W, polityId, event) {
  W.dark = W.dark || {};
  if (!W.dark.polityHistories) W.dark.polityHistories = [];
  const name = W._polityIndex?.get(polityId)?.name || `polity-${polityId}`;
  W.dark.polityHistories.push({
    id: polityId, name, event, year: W.ageYr || 0, tick: W._tickIndex | 0,
  });
  if (W.dark.polityHistories.length > 64) W.dark.polityHistories.shift();
}

/** Species extinction attributed to a dark act (§371). */
export function noteExtinctAttributed(W, speciesName, cause, log = null) {
  W.dark = W.dark || {};
  W.dark.extinctAttributed = (W.dark.extinctAttributed | 0) + 1;
  if (!W.dark.extinctList) W.dark.extinctList = [];
  W.dark.extinctList.push({ name: speciesName, cause, year: W.ageYr || 0 });
  if (W.dark.extinctList.length > 24) W.dark.extinctList.shift();
  if (log) {
    darkWarLog(W, log, 0, 0.9, `${speciesName} gone — ${cause}`);
  }
}

/** Who benefited after a war ends (§367). */
export function noteWarBenefit(W, winnerId, loserId, warName) {
  W.dark = W.dark || {};
  const wName = W._polityIndex?.get(winnerId)?.name || `polity-${winnerId}`;
  const lName = W._polityIndex?.get(loserId)?.name || `polity-${loserId}`;
  W.dark.benefited = {
    winner: winnerId, winnerName: wName,
    loser: loserId, loserName: lName,
    war: warName || '', year: W.ageYr || 0,
  };
  notePolityHistory(W, winnerId, `prevailed in ${warName || 'war'}`);
  notePolityHistory(W, loserId, `lost ${warName || 'war'}`);
}

/** Snapshot baseline for counterfactual (§366) — call once after generate settle. */
export function captureCounterfactualBaseline(W) {
  W._darkBaseline = {
    meanLife: W.meanLife || 0,
    meanBuild: W.meanBuild || 0,
    civPop: W.civPop || 0,
    iceFrac: W.iceFrac || 0,
    year: W.ageYr || 0,
  };
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

/**
 * Nuclear winter + ozone + exclusion aftermath (§K / §207–210).
 * Couples soot into cell cooling + insolation shade (via applyWarShade).
 * Triggers on dust / detonations — not only deterrence exchange counters.
 */
function aftermathTick(W) {
  W.dark = W.dark || {};
  const dust = W.gases?.dust || 0;
  const sulphate = W.gases?.sulphate || 0;
  const warSoot = dust + sulphate * 0.8;
  const warSignal = warSoot > 0.012
    || (W.detonated | 0) > 0
    || (W.exchangesLaunched | 0) > 0
    || (W.dark.winter || 0) > 0.02;

  if (warSignal && warSoot > 0.008) {
    W.dark.winter = Math.min(1, Math.max(W.dark.winter || 0, warSoot * 3.2));
    // Cool the surface toward a soot-shaded equilibrium — gaia reads cells next tick.
    const cool = 0.00035 + (W.dark.winter || 0) * 0.0018;
    if (W.temp && cool > 0 && (W._tickIndex | 0) % 2 === 0) {
      for (let c = 0; c < NC; c++) {
        const ash = W.ash?.[c] || 0;
        const local = cool * (0.55 + ash * 0.9 + (W.dust?.[c] || 0) * 0.7);
        if (local > 1e-5) W.temp[c] = Math.max(0.05, (W.temp[c] || 0.5) - local);
      }
    }
    if (W.dark.winter > 0.18 && (W._tickIndex | 0) % 20 === 0) {
      noteCasualty(W, 'famine', Math.floor(W.dark.winter * 50));
    }
  } else {
    W.dark.winter = Math.max(0, (W.dark.winter || 0) * 0.988);
  }
  W.dark.warShade = W._warShade || 0;

  if (!W.exclusion || W.exclusion.length !== NC) W.exclusion = new Float32Array(NC);
  let excl = 0;
  let peakDose = 0;
  const list = W._radCells || [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const dose = (W.rad[c] || 0) + (W.radShort?.[c] || 0);
    if (dose > peakDose) peakDose = dose;
    if (dose > 0.35) {
      W.exclusion[c] = Math.max(W.exclusion[c] || 0, Math.min(1, dose));
      excl++;
    }
  }
  W.dark.contamAg = W._contamAg | 0;
  W.dark.exclusion = excl;
  W.dark.peakDose = peakDose;
  W.dark.radShortCells = W.radShortCells | 0;
  W.dark.exclusionBlocks = excl;
}

/** Visual FX tick — mushrooms, expanding shock rings, smoke, flash fade (§Q). */
function darkVisualTick(W, log) {
  // Mushrooms grow then fade (§325) — live longer so the cap is readable.
  if (W.mushrooms?.length) {
    const keep = [];
    for (const m of W.mushrooms) {
      m.age = (m.age || 0) + 1;
      if (m.fireball > 0.02) m.fireball *= 0.82;
      else m.fireball = 0;
      if (m.age < 56) keep.push(m);
    }
    W.mushrooms = keep;
  }

  // Fireball ground glow fades (§325).
  if (W.fireball?.length === NC) {
    for (let c = 0; c < NC; c++) {
      const v = W.fireball[c];
      if (v > 0.01) W.fireball[c] = v * 0.88;
      else if (v) W.fireball[c] = 0;
    }
  }

  // Expanding shockwave ring: paint only the current wavefront (§327).
  if (!W.shockwave || W.shockwave.length !== NC) W.shockwave = new Float32Array(NC);
  else {
    for (let c = 0; c < NC; c++) {
      if (W.shockwave[c] > 0.01) W.shockwave[c] *= 0.72;
      else if (W.shockwave[c]) W.shockwave[c] = 0;
    }
  }
  if (W._shockEvents?.length) {
    const keep = [];
    for (const ev of W._shockEvents) {
      ev.age = (ev.age || 0) + 1;
      const r = Math.min(ev.maxR, ev.age);
      const queue = [[ev.cell, 0]];
      const seen = new Set([ev.cell]);
      while (queue.length) {
        const [c, d] = queue.shift();
        if (d === r) {
          const bright = (0.7 + ev.power * 0.4) * Math.max(0.15, 1 - ev.age / (ev.maxR + 10));
          W.shockwave[c] = Math.max(W.shockwave[c], bright);
        }
        if (d >= r) continue;
        for (let k = 0; k < 4; k++) {
          const n = NBR[c * 4 + k];
          if (!seen.has(n)) { seen.add(n); queue.push([n, d + 1]); }
        }
      }
      if (ev.age <= ev.maxR + 6) keep.push(ev);
    }
    W._shockEvents = keep;
  }

  // Smoke columns from fire+build, light wind advection (§328).
  if (!W.smoke || W.smoke.length !== NC) W.smoke = new Float32Array(NC);
  const fires = W._fireCells || [];
  for (let i = 0; i < fires.length; i++) {
    const c = fires[i];
    if ((W.fire?.[c] || 0) > 0.2 && (W.build?.[c] || 0) > 0.05) {
      W.smoke[c] = Math.min(1, (W.smoke[c] || 0) + 0.14);
    }
  }
  for (const m of W.mushrooms || []) {
    if ((m.age || 0) < 24) {
      const c = m.cell | 0;
      if (c >= 0 && c < NC) W.smoke[c] = Math.min(1, (W.smoke[c] || 0) + 0.2);
    }
  }
  if (((W._tickIndex | 0) & 1) === 0 && W.windU && W.windV) {
    for (let c = 0; c < NC; c += 3) {
      const s = W.smoke[c];
      if (s < 0.04) continue;
      const u = W.windU[c] || 0;
      const v = W.windV[c] || 0;
      let best = c;
      let bestDot = -1;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        const d = (u + v) * ((k & 1) ? 1 : -1);
        if (d > bestDot) { bestDot = d; best = n; }
      }
      if (best !== c) {
        const move = s * 0.18;
        W.smoke[c] = s - move;
        W.smoke[best] = Math.min(1, (W.smoke[best] || 0) + move * 0.85);
      }
      W.smoke[c] *= 0.955;
    }
  }

  if (W._blastFlash > 0.01) W._blastFlash *= 0.78;
  else W._blastFlash = 0;
  if (W._blastPunch > 0.01) W._blastPunch *= 0.7;
  else W._blastPunch = 0;

  // Recovery narrative when rad heals (§375).
  const prevHot = W._darkRadHot | 0;
  let hot = 0;
  for (const c of (W._radCells || [])) {
    if ((W.rad[c] || 0) > 0.15) hot++;
  }
  W._darkRadHot = hot;
  if (prevHot > 8 && hot < prevHot - 4 && hot < 6) {
    W.dark = W.dark || {};
    W.dark.recoveryNotes = (W.dark.recoveryNotes | 0) + 1;
    if (log && W.dark.recoveryNotes <= 6) {
      log(W.year, 'recovery', 0, 0.3, 'A scar cools — fallout thins enough to notice');
    }
  }

  // Legacy: still-contaminated cells (§368).
  W.dark = W.dark || {};
  W.dark.legacy = {
    contaminated: exclCount(W),
    mushrooms: (W.mushrooms || []).length,
    archiveLoss: W.dark.archiveLoss | 0,
    year: W.ageYr || 0,
  };
}

function exclCount(W) {
  let n = 0;
  if (W.exclusion) {
    for (let i = 0; i < W.exclusion.length; i++) if (W.exclusion[i] > 0.2) n++;
  }
  return n;
}

/** Attribute recent tree extinctions to dark acts when war/rad is hot (§371).
 *  Also fires when meanLife drops enough to imply a clade collapse. */
function attributeExtinctions(W, log) {
  const list = W.tree?.extinctions;
  const warHot = (W.exchangesLaunched | 0) > 0 || (W.radPeak || 0) > 0.4
    || (W.darkToll?.blast || 0) > 0;

  // meanLife drop → extinct attribution hook (§371 leftover / S).
  const prevLife = W._darkMeanLife;
  const life = W.meanLife || 0;
  if (prevLife != null && prevLife > 0.05 && life < prevLife * 0.7 && warHot) {
    noteExtinctAttributed(W, 'surface clade', 'meanLife collapse after war', log);
  }
  W._darkMeanLife = life;

  if (!list?.length) return;
  const seen = W._darkExtSeen | 0;
  if (list.length <= seen) return;
  for (let i = seen; i < list.length; i++) {
    const x = list[i];
    if (warHot) {
      noteExtinctAttributed(W, x.name || 'unnamed clade', x.reason || 'aftermath', log);
    }
  }
  W._darkExtSeen = list.length;
}

/** Build tribunal summary at end-ish conditions (§365). */
function refreshTribunal(W) {
  W.dark = W.dark || {};
  const crimes = W.warCrimes || [];
  const toll = W.darkToll || emptyToll();
  const total = TOLL_KEYS.reduce((s, k) => s + (toll[k] || 0), 0);
  if (!crimes.length && total < 100) {
    W.dark.tribunal = null;
    return;
  }
  W.dark.tribunal = {
    crimes: crimes.length,
    entries: crimes.slice(-12).map((c) => ({
      name: c.name, actor: c.actor, year: c.year, cell: c.cell,
    })),
    toll: { ...toll, total },
    archiveLoss: W.dark.archiveLoss | 0,
    extinctAttributed: W.dark.extinctAttributed | 0,
    uninhabitable: !!W.dark.uninhabitable,
    year: W.ageYr || 0,
  };
}

/** Counterfactual sketch vs baseline (§366). */
function refreshCounterfactual(W) {
  W.dark = W.dark || {};
  const b = W._darkBaseline;
  if (!b) {
    W.dark.counterfactual = 'No baseline captured — planet unchanged by measure.';
    return;
  }
  const dLife = (b.meanLife || 0) - (W.meanLife || 0);
  const dPop = (b.civPop || 0) - (W.civPop || 0);
  const dBuild = (b.meanBuild || 0) - (W.meanBuild || 0);
  if (dLife < 0.01 && dPop < 10 && dBuild < 0.01) {
    W.dark.counterfactual = 'Had you not acted, little would differ yet.';
  } else {
    W.dark.counterfactual = `Without your hand: life ~${(dLife * 100).toFixed(1)}% higher,`
      + ` ~${Math.max(0, dPop | 0)} more alive in cities,`
      + ` build denser by ${(dBuild * 100).toFixed(1)}%.`;
  }
}

export function darkTick(W, log = null) {
  if (!W.darkToll) resetDark(W);
  if (!W._darkBaseline && (W.meanLife || 0) > 0.01) captureCounterfactualBaseline(W);

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
  cbrTick(W, log);
  darkVisualTick(W, log);
  spectacleTick(W);
  attributeExtinctions(W, log);
  darkAudioFromWorld(W);

  W.dark = W.dark || {};
  W.dark.tickBudgetMs = W.dark.tickBudgetMs || 2;
  W.dark.geomBudgetMs = W.dark.geomBudgetMs || 1.5;
  W.dark.geomBudget = W.dark.geomBudgetMs; // alias §340
  W.dark.audioBudgetMs = W.dark.audioBudgetMs || 0.5;

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
      const city = (W.cities || []).find((c) => c.cell === f.to);
      if (city) {
        noteNamedDeath(W, city, 'blast');
        noteSurvivorTestimony(W, log, f.to, city.name);
        if ((W.build[f.to] || 0) > 0.7) noteArchiveLoss(W, f.to, 1);
      }
    }
  }

  if (((W._tickIndex | 0) % 32) === 0) {
    refreshTribunal(W);
    refreshCounterfactual(W);
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
      fissile: +(p.fissile || 0).toFixed(2),
      doctrine: p.doctrine, cells: p.cells | 0,
    })),
    arsenalFired: { ...(W.arsenalFired || {}) },
    defenceStats: {
      shots: W.defenceStats?.shots | 0,
      intercepts: W.defenceStats?.intercepts | 0,
      leaks: W.defenceStats?.leaks | 0,
      leakageRate: (() => {
        const ix = W.defenceStats?.intercepts | 0;
        const lk = W.defenceStats?.leaks | 0;
        return (lk + ix) ? +(lk / (lk + ix)).toFixed(3) : 0;
      })(),
      salvoLog: (W.defenceStats?.salvoLog || []).slice(-8),
    },
    defence: W.dark?.defence || [],
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
    mushrooms: (W.mushrooms || []).length,
    blastFlash: W._blastFlash || 0,
    shockwaveCells: (() => {
      if (!W.shockwave) return 0;
      let n = 0;
      for (let i = 0; i < W.shockwave.length; i++) if (W.shockwave[i] > 0.05) n++;
      return n;
    })(),
    flights: (W.flight || []).filter((f) => !f.dead).length,
    attribution: W.attribution ? { ...W.attribution } : null,
    budgets: {
      tickMs: W.dark?.tickBudgetMs || 2,
      geomMs: W.dark?.geomBudgetMs || 1.5,
      audioMs: W.dark?.audioBudgetMs || 0.5,
      audioSpentMs: W.dark?._audioSpentMs || 0,
    },
    dark: {
      frontLen: W.dark?.frontLen || 0,
      rubble: W.dark?.rubble || 0,
      refugees: W.dark?.refugees || 0,
      exclusion: W.dark?.exclusion || 0,
      peakDose: W.dark?.peakDose || 0,
      winter: W.dark?.winter || 0,
      satellites: W.dark?.satellites || 0,
      debris: W.dark?.debris || 0,
      kessler: !!W.dark?.kessler,
      sai: W.dark?.sai || 0,
      terminationShock: W.dark?.terminationShock || 0,
      supplyCut: W.dark?.supplyCut || 0,
      supplyCutStalls: W.dark?.supplyCutStalls || 0,
      droneSorties: W.dark?.droneSorties || 0,
      droneLosses: W.dark?.droneLosses || 0,
      droneCivCasualties: W.dark?.droneCivCasualties || 0,
      drones: W.dark?.drones || 0,
      seaControl: W.dark?.seaControl || 0,
      tonnageSunk: W.dark?.tonnageSunk || 0,
      lanesCut: W.dark?.lanesCut || 0,
      sieges: W.dark?.sieges || 0,
      warEconomy: W.dark?.warEconomy || 0,
      ghostTowns: W.dark?.ghostTowns || 0,
      contamAg: W.dark?.contamAg || 0,
      radShortCells: W.dark?.radShortCells || 0,
      cbr: W.dark?.cbr || null,
      capitalFell: !!W._capitalFell,
      uninhabitable: !!W.dark?.uninhabitable,
      tribunal: W.dark?.tribunal || null,
      counterfactual: W.dark?.counterfactual || null,
      benefited: W.dark?.benefited || null,
      legacy: W.dark?.legacy || null,
      archiveLoss: W.dark?.archiveLoss || 0,
      namedDeaths: W.dark?.namedDeaths || 0,
      testimonies: W.dark?.testimonies || 0,
      extinctAttributed: W.dark?.extinctAttributed || 0,
      recoveryNotes: W.dark?.recoveryNotes || 0,
      polityHistories: (W.dark?.polityHistories || []).length,
      // M — industrial poison (§260)
      industryPoison: W.dark?.industryPoison || 0,
      contamWar: W.dark?.contamWar || 0,
      contamIndustry: W.dark?.contamIndustry || 0,
      regulation: W.dark?.regulation ?? W.regulation ?? 0,
      smog: W.dark?.smog ?? W.smog ?? 0,
      lead: W.dark?.lead ?? W.lead ?? 0,
      pfas: W.dark?.pfas ?? W.pfas ?? 0,
      microplastics: W.dark?.microplastics ?? W.microplastics ?? 0,
      // N — climate weapon (§280)
      climateRefugees: W.dark?.climateRefugees || 0,
      damBreaks: W.dark?.damBreaks || 0,
      waterWars: W.dark?.waterWars || 0,
      freeRider: W.dark?.freeRider || 0,
      forcingAnthro: W.dark?.forcingAnthro || 0,
      forcingNatural: W.dark?.forcingNatural || 0,
      enmodBan: W.dark?.enmodBan !== false,
      // O — info (§300)
      cyberIncidents: W.dark?.cyberIncidents || 0,
      blackoutTicks: W.dark?.blackoutTicks || 0,
      unattributed: W.dark?.unattributed || 0,
      attributionAccuracy: W.dark?.attributionAccuracy ?? 1,
      comms: W.dark?.comms ?? W.comms ?? 1,
      gpsDenied: W.gpsDenied || 0,
      // P — orbit (§320)
      orbitClosed: !!W.dark?.orbitClosed,
      orbitAccess: W.dark?.orbitAccess !== false && !W.dark?.orbitClosed,
      debrisRing: W.dark?.debrisRing ?? W.debrisRing ?? 0,
      launchSites: W.dark?.launchSites || 0,
    },
  };
}

/** Fields that must survive reallocate / reset (§383). */
export const DARK_W_FIELDS = Object.freeze([
  'darkToll', 'warCrimes', 'fought', 'mushrooms', 'shockwave', 'smoke',
  'dark', '_blastFlash', 'attribution',
]);

export { isExcluded, TOLL_KEYS, seedName };
