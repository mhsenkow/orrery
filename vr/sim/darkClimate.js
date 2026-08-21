/** Climate as a weapon — SAI, termination shock, dam break, ENMOD (dark-400 N §261–280). */

import { NC, NBR } from '../sphere.js';
import { rngOf } from './rng.js';
import { igniteFire } from './fire.js';
import { noteCasualty, noteWarCrime } from './dark.js';

export function resetClimateWeapon(W) {
  W.sai = 0;
  W._saiPrev = 0;
  W._terminationShock = 0;
  W.enmodBan = true;
  W.dark = W.dark || {};
  W.dark.sai = 0;
  W.dark.terminationShock = 0;
}

/** Unilateral stratospheric aerosol injection (§261). */
export function setSai(W, level, actorId = -1) {
  const prev = W.sai || 0;
  W.sai = Math.max(0, Math.min(1, level));
  W._saiActor = actorId;
  if (W.enmodBan && W.sai > 0.05 && actorId >= 0) {
    noteWarCrime(W, 'ENMOD — environmental modification', W._polityIndex?.get(actorId)?.capital ?? 0, actorId);
  }
  return { prev, sai: W.sai };
}

/** Dam destruction → flood neighbors downhill (§266). */
export function damBreak(W, cell, actorId = -1, log = null) {
  const c = cell | 0;
  if (c < 0 || c >= NC) return;
  let flooded = 0;
  const sea = W.seaLevel ?? 0.5;
  const h0 = W.h?.[c] ?? 0;
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    if ((W.h?.[n] ?? 1) < h0 + 0.02) {
      if (W.build?.[n] > 0) {
        const lost = Math.min(W.build[n], 0.35);
        W.build[n] -= lost;
        noteCasualty(W, 'war', Math.floor(lost * 400), actorId === (W.playerPolity ?? -2));
        flooded++;
      }
      if (W.moist) W.moist[n] = Math.min(1, (W.moist[n] || 0) + 0.4);
    }
  }
  // Reservoir cell becomes wetter / lower effective build.
  if (W.build?.[c] > 0) W.build[c] *= 0.4;
  if (W.enmodBan && actorId >= 0) {
    noteWarCrime(W, 'dam destruction', c, actorId);
  }
  if (log) log(W.year, 'flood', c, 0.7, `Dam break — ${flooded} districts flooded`);
  W.dark = W.dark || {};
  W.dark.damBreaks = (W.dark.damBreaks | 0) + 1;
  return flooded;
}

export function climateWeaponTick(W, log = null) {
  W.dark = W.dark || {};
  const sai = W.sai || 0;
  const prev = W._saiPrev || 0;

  // Active SAI cools slightly via dust (§261).
  if (sai > 0.01) {
    if (W.gases) W.gases.dust = Math.min(0.45, (W.gases.dust || 0) + sai * 0.002);
    if (W.meanTemp != null) W.meanTemp = Math.max(0.05, W.meanTemp - sai * 0.0003);
    if (W.solarShade != null) W.solarShade = Math.min(0.3, (W.solarShade || 0) * 0.98 + sai * 0.02);
    else W.solarShade = sai * 0.05;
  }

  // Termination shock when SAI stops (§262, §278).
  if (prev > 0.15 && sai < 0.05) {
    const rebound = prev * 0.8;
    W._terminationShock = Math.max(W._terminationShock || 0, rebound);
    if (W.meanTemp != null) W.meanTemp = Math.min(1, W.meanTemp + rebound * 0.02);
    if (W.gases) W.gases.dust = Math.max(0, (W.gases.dust || 0) * 0.5);
    if (log) log(W.year, 'climate', 0, rebound, 'Termination shock — SAI stopped');
  }
  if ((W._terminationShock || 0) > 0) {
    W._terminationShock *= 0.98;
    if (W.meanTemp != null) W.meanTemp = Math.min(1, W.meanTemp + W._terminationShock * 0.0004);
  }

  W._saiPrev = sai;
  W.dark.sai = sai;
  W.dark.terminationShock = W._terminationShock || 0;
  W.dark.enmodBan = !!W.enmodBan;

  // Rare AI dam break in high-weariness wars.
  const rng = rngOf(W, 'rngGod');
  if ((W.diplo?.wars || []).length && rng() < 0.001 && W.polities?.length) {
    const war = W.diplo.wars[0];
    const p = W._polityIndex?.get(war.a);
    if (p && p.capital >= 0) damBreak(W, p.capital, war.a, log);
  }

  // Deforestation denial of cover (§267).
  if ((W._tickIndex | 0) % 80 === 0 && (W.diplo?.wars || []).length && rng() < 0.2) {
    for (let c = 0; c < NC; c += 29) {
      if ((W.warFront?.[c] || 0) > 0.3 && (W.life?.[c] || 0) > 0.2) {
        igniteFire(W, c, 0.5, 0);
        break;
      }
    }
  }
}
