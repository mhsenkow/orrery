/** Climate as a weapon — SAI, termination shock, ENMOD, water wars (dark-400 N §261–280). */

import { NC, NBR } from '../sphere.js';
import { rngOf } from './rng.js';
import { igniteFire } from './fire.js';
import { releaseClathrate } from './god/disaster.js';
import { noteCasualty, noteWarCrime } from './dark.js';
import { relationOf, setRelation, noteCasus, openWar } from './diplomacy.js';

/** Stated rebound fraction of prior SAI level (§278). */
export const TERMINATION_REBOUND = 0.8;

export function resetClimateWeapon(W) {
  W.sai = 0;
  W._saiPrev = 0;
  W._terminationShock = 0;
  W.enmodBan = true;
  W.dark = W.dark || {};
  W.dark.sai = 0;
  W.dark.terminationShock = 0;
  W.dark.enmodBan = true;
  W.dark.climateRefugees = 0;
  W.dark.damBreaks = 0;
  W.dark.cloudSeeds = 0;
  W.dark.waterWars = 0;
  W.dark.freeRider = 0;
  W.dark.forcingAnthro = 0;
  W.dark.forcingNatural = 0;
  W.dark.geoCrisis = 0;
}

/** Unilateral stratospheric aerosol injection (§261). Triggers diplomatic crisis (§263). */
export function setSai(W, level, actorId = -1) {
  const prev = W.sai || 0;
  W.sai = Math.max(0, Math.min(1, level));
  W._saiActor = actorId;
  if (W.enmodBan && W.sai > 0.05 && actorId >= 0) {
    noteWarCrime(W, 'ENMOD — environmental modification', W._polityIndex?.get(actorId)?.capital ?? 0, actorId);
  }
  // Diplomatic crisis: one polity geoengineers for all (§263).
  if (W.sai > 0.15 && actorId >= 0 && (W.polities || []).length >= 2) {
    W.dark = W.dark || {};
    W.dark.geoCrisis = (W.dark.geoCrisis | 0) + 1;
    for (const p of W.polities) {
      if (p.id === actorId) continue;
      setRelation(W, actorId, p.id, relationOf(W, actorId, p.id) - 0.08);
    }
  }
  return { prev, sai: W.sai };
}

/** Cloud seeding over a rival's harvest — precip/life hit (§264). */
export function cloudSeed(W, cell, actorId = -1, log = null) {
  const c = cell | 0;
  if (c < 0 || c >= NC) return 0;
  if (W.precip) W.precip[c] = Math.max(0, (W.precip[c] || 0) * 0.35);
  if (W.moist) W.moist[c] = Math.max(0, (W.moist[c] || 0) * 0.55);
  if (W.life?.[c] > 0) W.life[c] = Math.max(0, W.life[c] - 0.18);
  // Neighbours share the drought.
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    if (W.precip) W.precip[n] = Math.max(0, (W.precip[n] || 0) * 0.6);
    if (W.life?.[n] > 0) W.life[n] = Math.max(0, W.life[n] - 0.08);
  }
  if (W.enmodBan && actorId >= 0) {
    noteWarCrime(W, 'ENMOD — cloud seeding', c, actorId);
  }
  W.dark = W.dark || {};
  W.dark.cloudSeeds = (W.dark.cloudSeeds | 0) + 1;
  if (log) log(W.year, 'climate', c, 0.55, 'Cloud seeding over rival harvest');
  return 1;
}

/** Dam destruction → flood neighbors downhill (§266). */
export function damBreak(W, cell, actorId = -1, log = null) {
  const c = cell | 0;
  if (c < 0 || c >= NC) return 0;
  let flooded = 0;
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
      if (W.life?.[n] > 0) W.life[n] = Math.max(0, W.life[n] - 0.12);
    }
  }
  if (W.build?.[c] > 0) W.build[c] *= 0.4;
  if (W.enmodBan && actorId >= 0) {
    noteWarCrime(W, 'dam destruction', c, actorId);
  }
  if (log) log(W.year, 'flood', c, 0.7, `Dam break — ${flooded} districts flooded`);
  W.dark = W.dark || {};
  W.dark.damBreaks = (W.dark.damBreaks | 0) + 1;
  return flooded;
}

/** Deliberate deforestation to deny cover (§267). */
export function deforestDeny(W, cell, actorId = -1, log = null) {
  const c = cell | 0;
  if (c < 0 || c >= NC) return false;
  if (W.life?.[c] > 0) W.life[c] = Math.max(0, W.life[c] - 0.45);
  igniteFire(W, c, 0.55, 0);
  if (W.enmodBan && actorId >= 0) {
    noteWarCrime(W, 'ENMOD — deliberate deforestation', c, actorId);
  }
  if (log) log(W.year, 'climate', c, 0.5, 'Deliberate deforestation');
  return true;
}

/** Methane clathrate as an attack, not feedback (§269). */
export function clathrateAttack(W, actorId = -1, gtC = 800, log = null) {
  releaseClathrate(gtC);
  if (W.enmodBan && actorId >= 0) {
    noteWarCrime(W, 'ENMOD — clathrate release', 0, actorId);
  }
  W.dark = W.dark || {};
  W.dark.forcingAnthro = (W.dark.forcingAnthro || 0) + gtC * 1e-4;
  if (log) log(W.year, 'climate', 0, 0.8, `Clathrate attack — ${gtC} Gt C`);
  return true;
}

/**
 * Upstream polity denies flow to a downstream rival (§274 / §279).
 * Returns moist/life delta at the downstream cell.
 */
export function upstreamHarm(W, upCell, downCell, actorId = -1, log = null) {
  const up = upCell | 0, down = downCell | 0;
  if (up < 0 || down < 0 || up >= NC || down >= NC) return 0;
  const moist0 = W.moist?.[down] || 0;
  const life0 = W.life?.[down] || 0;
  if (W.flow) {
    W.flow[up] = Math.max(0, (W.flow[up] || 0) * 0.2);
    W.flow[down] = Math.max(0, (W.flow[down] || 0) * 0.35);
  }
  if (W.moist) W.moist[down] = Math.max(0, moist0 * 0.45);
  if (W.life?.[down] > 0) W.life[down] = Math.max(0, life0 - 0.15);
  if (W.precip) W.precip[down] = Math.max(0, (W.precip[down] || 0) * 0.5);
  W.dark = W.dark || {};
  W.dark.waterWars = (W.dark.waterWars | 0) + 1;
  if (actorId >= 0 && W.owner) {
    const victim = W.owner[down];
    if (victim >= 0 && victim !== actorId) {
      noteCasus(W, victim, actorId, 'water', down, 'upstream diversion');
      setRelation(W, actorId, victim, relationOf(W, actorId, victim) - 0.1);
    }
  }
  if (log) log(W.year, 'climate', down, 0.6, 'Upstream water diversion');
  return (moist0 - (W.moist?.[down] || 0)) + (life0 - (W.life?.[down] || 0));
}

/** Assert termination shock rebound (§278). */
export function assertTerminationShock(prevSai, shock) {
  const expected = prevSai * TERMINATION_REBOUND;
  if (!(shock >= expected * 0.9)) {
    throw new Error(`termination shock ${shock} < stated rebound ${expected}`);
  }
}

/** Assert upstream diversion harms downstream (§279). */
export function assertUpstreamHarm(delta) {
  if (!(delta > 0.05)) {
    throw new Error(`upstream harm delta ${delta} too small`);
  }
}

export function climateWeaponTick(W, log = null) {
  W.dark = W.dark || {};
  const sai = W.sai || 0;
  const prev = W._saiPrev || 0;
  const rng = rngOf(W, 'rngGod');
  const tick = W._tickIndex | 0;

  // Active SAI cools via dust / shade (§261).
  if (sai > 0.01) {
    if (W.gases) W.gases.dust = Math.min(0.45, (W.gases.dust || 0) + sai * 0.002);
    if (W.meanTemp != null) W.meanTemp = Math.max(0.05, W.meanTemp - sai * 0.0003);
    if (W.solarShade != null) W.solarShade = Math.min(0.3, (W.solarShade || 0) * 0.98 + sai * 0.02);
    else W.solarShade = sai * 0.05;
    W.dark.forcingAnthro = (W.dark.forcingAnthro || 0) + sai * 0.001;
  }

  // Termination shock when SAI stops (§262, §278) — stated rebound.
  if (prev > 0.15 && sai < 0.05) {
    const rebound = prev * TERMINATION_REBOUND;
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

  // Natural forcing proxy (volcanic sulphate already in gases).
  W.dark.forcingNatural = (W.gases?.sulphate || 0) + (W.gases?.dust || 0) * 0.1;

  const wars = W.diplo?.wars || [];

  // Rare AI dam break in high-weariness wars.
  if (wars.length && rng() < 0.001 && W.polities?.length) {
    const war = wars[0];
    const p = W._polityIndex?.get(war.a);
    if (p && p.capital >= 0) damBreak(W, p.capital, war.a, log);
  }

  // Cloud seeding over rival harvest during war (§264).
  if (wars.length && rng() < 0.008) {
    const war = wars[(rng() * wars.length) | 0];
    const victim = W._polityIndex?.get(war.b);
    const cell = victim?.capital ?? -1;
    if (cell >= 0) cloudSeed(W, cell, war.a, log);
  }

  // Deforestation denial of cover (§267).
  if (tick % 80 === 0 && wars.length && rng() < 0.2) {
    for (let c = 0; c < NC; c += 29) {
      if ((W.warFront?.[c] || 0) > 0.3 && (W.life?.[c] || 0) > 0.2) {
        deforestDeny(W, c, wars[0].a, log);
        break;
      }
    }
  }

  // Occasional clathrate attack when escalation is high (§269).
  if (wars.length && (W.escalationRung | 0) >= 3 && rng() < 0.0008) {
    clathrateAttack(W, wars[0].a, 400 + ((rng() * 600) | 0), log);
  }

  // Water wars via shared flow catchments (§274).
  if (wars.length && tick % 60 === 0 && W.flow && W.owner && rng() < 0.25) {
    const war = wars[0];
    let up = -1, down = -1;
    for (let c = 0; c < NC; c += 5) {
      if (W.owner[c] !== war.a || (W.flow[c] || 0) < 0.2) continue;
      const h0 = W.h?.[c] ?? 0;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if (W.owner[n] === war.b && (W.h?.[n] ?? 1) <= h0) {
          up = c; down = n; break;
        }
      }
      if (up >= 0) break;
    }
    if (up >= 0) upstreamHarm(W, up, down, war.a, log);
  }

  // Climate refugees — distinct from war refugees (§273).
  if (tick % 40 === 0 && ((W._terminationShock || 0) > 0.1 || sai > 0.3 || (W.meanTemp || 0.5) > 0.72)) {
    const n = 20 + ((rng() * 80) | 0);
    W.dark.climateRefugees = (W.dark.climateRefugees | 0) + n;
    // Push into refugee system with a climate tag when available.
    if (W.refugees) {
      let dest = 0;
      for (let c = 0; c < NC; c += 11) {
        if ((W.build?.[c] || 0) > 0.4 && (W.h?.[c] || 0) >= (W.seaLevel || 0)) {
          dest = c; break;
        }
      }
      W.refugees.push({
        cell: dest, dest, heads: n, dead: false, climate: true,
      });
      if (W.refugees.length > 96) W.refugees.splice(0, W.refugees.length - 96);
    }
  }

  // Free-rider AI: polities skip costly abatement while others regulate (§277).
  if (tick % 100 === 0 && (W.polities || []).length >= 2 && (W.regulation || 0) > 0.1) {
    for (const p of W.polities) {
      // Free-riders keep ore-heavy industry without matching regulation.
      const freeRide = (p.cells | 0) > 5 && rng() < 0.4;
      if (freeRide) {
        p._freeRider = true;
        W.dark.freeRider = (W.dark.freeRider | 0) + 1;
        // Slight extra local emission via capital cell toxin.
        const cap = p.capital | 0;
        if (cap >= 0 && W.toxin) {
          W.toxin[cap] = Math.min(1, (W.toxin[cap] || 0) + 0.02);
        }
      }
    }
  }

  // ENMOD break → casus / war if relations already bad (§265).
  if ((W.warCrimes || []).some((c) => String(c.name || '').startsWith('ENMOD'))
      && wars.length === 0 && (W.polities || []).length >= 2 && rng() < 0.002) {
    const crime = W.warCrimes.find((c) => String(c.name || '').startsWith('ENMOD'));
    const actor = crime?.actor;
    const victim = (W.polities || []).find((p) => p.id !== actor);
    if (actor != null && victim) {
      noteCasus(W, victim.id, actor, 'enmod', crime.cell || 0, 'ENMOD breach');
      openWar(W, victim.id, actor, { kind: 'enmod', label: 'ENMOD breach' }, log);
    }
  }
}
