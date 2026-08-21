/** Cities under attack — rubble, refugees, memorials, casualty conservation (dark-400 J §181–200). */

import { NC, NBR } from '../sphere.js';
import { rngOf } from './rng.js';
import { noteCasualty } from './dark.js';

export function resetCityDark(W) {
  if (!W.rubble || W.rubble.length !== NC) W.rubble = new Float32Array(NC);
  else W.rubble.fill(0);
  if (!W.casualty || W.casualty.length !== NC) W.casualty = new Float32Array(NC);
  else W.casualty.fill(0);
  if (!W.shelter || W.shelter.length !== NC) W.shelter = new Float32Array(NC);
  else W.shelter.fill(0);
  W.memorials = [];
  W.refugees = [];
  W.ghostTowns = [];
  W._capitalFell = false;
  W.dark = W.dark || {};
  W.dark.rubble = 0;
  W.dark.refugees = 0;
  W.dark.ghostTowns = 0;
  W.dark.firestorms = 0;
  W.dark.strata = 0;
  W.dark.pyramids = W.dark.pyramids || null;
}

/** Ensure each settlement has a pop that can die separately from build (§181). */
export function ensureCityPop(W) {
  for (const city of W.cities || []) {
    if (city.pop == null || city.pop <= 0) {
      const b = W.build?.[city.cell] || 0.3;
      city.pop = Math.max(10, Math.floor(80 + b * 4000));
    }
    if (city._pop0 == null) city._pop0 = city.pop;
    if (city.ghost == null) city.ghost = false;
  }
}

/**
 * Casualties conserved: deaths leave the population count (§198).
 * Returns true if conserved within epsilon.
 */
export function assertCasualtyConservation(W, beforePop, deaths, afterPop, eps = 2) {
  const expected = Math.max(0, beforePop - deaths);
  if (Math.abs(expected - afterPop) > eps) {
    throw new Error(
      `casualty conservation failed: before=${beforePop} deaths=${deaths} after=${afterPop}`,
    );
  }
  return true;
}

export function applyCityCasualties(W, city, deaths, cause = 'blast', playerAttributed = false) {
  if (!city || deaths <= 0) return 0;
  ensureCityPop(W);
  const before = city.pop | 0;
  // Shelter + early warning reduce casualties (§187).
  const sh = W.shelter?.[city.cell] || 0;
  const warned = city._earlyWarning || W._earlyWarning || 0;
  const factor = Math.max(0.25, 1 - sh * 0.5 - warned * 0.3);
  const d = Math.min(before, Math.floor(deaths * factor));
  city.pop = before - d;
  noteCasualty(W, cause, d, playerAttributed);
  if (!W.casualty || W.casualty.length !== NC) W.casualty = new Float32Array(NC);
  W.casualty[city.cell | 0] = Math.min(1, (W.casualty[city.cell | 0] || 0) + d * 1e-4);
  assertCasualtyConservation(W, before, d, city.pop);
  if (city.pop <= 0 && before > 0) {
    if (!W.memorials) W.memorials = [];
    W.memorials.push({
      cell: city.cell | 0,
      name: city.name || 'unnamed',
      year: W.ageYr || W.year || 0,
      tick: W._tickIndex | 0,
      permanent: true,
    });
    if (W.memorials.length > 64) W.memorials.splice(0, W.memorials.length - 48);
  }
  return d;
}

/** Verb: dig shelters / set early warning (§187). */
export function setShelter(W, cell, amount = 0.5) {
  if (!W.shelter || W.shelter.length !== NC) W.shelter = new Float32Array(NC);
  if (cell < 0 || cell >= NC) return 0;
  W.shelter[cell] = Math.min(1, Math.max(W.shelter[cell] || 0, amount));
  return W.shelter[cell];
}

export function setEarlyWarning(W, cityOrFlag = true) {
  if (typeof cityOrFlag === 'object' && cityOrFlag) {
    cityOrFlag._earlyWarning = 1;
    return;
  }
  W._earlyWarning = cityOrFlag ? 1 : 0;
}

function spawnRefugeeAgents(W, fromCell, count) {
  if (!W.refugees) W.refugees = [];
  const rng = rngOf(W, 'rngGod');
  let dest = -1;
  let best = 0;
  for (const other of W.cities || []) {
    if (other.cell === fromCell) continue;
    const b = W.build?.[other.cell] || 0;
    if (b > best && (W.rad?.[other.cell] || 0) < 0.15
      && !(W.exclusion?.[other.cell] > 0)) {
      best = b;
      dest = other.cell | 0;
    }
  }
  if (dest < 0) dest = fromCell;
  const n = Math.min(8, Math.max(1, (count / 20) | 0));
  for (let i = 0; i < n; i++) {
    W.refugees.push({
      cell: fromCell,
      dest,
      heads: Math.ceil(count / n),
      dead: false,
    });
  }
  return dest;
}

function stepRefugees(W) {
  if (!W.refugees?.length) return;
  const rng = rngOf(W, 'rngGod');
  const alive = [];
  for (const r of W.refugees) {
    if (r.dead) continue;
    if (r.cell === r.dest) {
      if (W.build) W.build[r.dest] = Math.min(1, (W.build[r.dest] || 0) + r.heads * 1e-5);
      const destCity = (W.cities || []).find((x) => x.cell === r.dest);
      if (destCity) {
        destCity.pop = (destCity.pop | 0) + r.heads;
        destCity._refugeeTension = (destCity._refugeeTension || 0) + r.heads * 0.001;
      }
      continue;
    }
    // Walk toward dest.
    let best = r.cell;
    let bestD = Math.abs(r.cell - r.dest);
    for (let k = 0; k < 4; k++) {
      const n = NBR[r.cell * 4 + k];
      if ((W.h?.[n] ?? 1) < (W.seaLevel ?? 0)) continue;
      if (W.exclusion?.[n] > 0.5) continue;
      const d = Math.abs(n - r.dest);
      if (d < bestD || (d === bestD && rng() < 0.3)) {
        bestD = d;
        best = n;
      }
    }
    r.cell = best;
    alive.push(r);
  }
  W.refugees = alive.slice(-96);
}

export function cityDarkTick(W, log = null) {
  ensureCityPop(W);
  if (!W.rubble || W.rubble.length !== NC) W.rubble = new Float32Array(NC);
  if (!W.casualty || W.casualty.length !== NC) W.casualty = new Float32Array(NC);
  if (!W.shelter || W.shelter.length !== NC) W.shelter = new Float32Array(NC);
  if (!W.ghostTowns) W.ghostTowns = [];

  stepRefugees(W);

  if (!W.fought || W.fought.length !== NC) {
    W.dark = W.dark || {};
    W.dark.rubble = 0;
    W.dark.refugees = (W.refugees || []).reduce((s, r) => s + (r.heads | 0), 0);
    return;
  }

  const rng = rngOf(W, 'rngGod');
  let rubble = 0;
  let refugees = (W.refugees || []).reduce((s, r) => s + (r.heads | 0), 0);
  let firestorms = 0;

  for (const city of W.cities || []) {
    const c = city.cell | 0;
    const build = W.build?.[c] || 0;
    const fought = W.fought[c] || 0;
    const rad = W.rad?.[c] || 0;
    const onFire = (W.fire?.[c] || 0) > 0.2;

    // Capital fall ceremony (§196).
    const polity = W._polityIndex?.get(W.owner?.[c]);
    if (polity && (polity.capital | 0) === c
      && (fought > 5 || rad > 0.5)
      && !W._capitalFell
      && (W.owner[c] !== polity.id || city.pop < (city._pop0 || 1) * 0.2)) {
      W._capitalFell = true;
      if (log) log(W.year, 'capital', c, 1, `The capital ${city.name || ''} has fallen`);
    }

    // Firestorm: high build + fire (§188).
    if (build > 0.55 && onFire) {
      firestorms++;
      const burn = Math.min(build, 0.04);
      W.build[c] -= burn;
      W.rubble[c] = Math.min(1, (W.rubble[c] || 0) + 0.05);
      if (city.pop > 0) applyCityCasualties(W, city, Math.floor(burn * 400), 'war');
    }

    // Strike damage → pop loss + rubble (§185).
    if (fought > 2 || rad > 0.25) {
      const hit = Math.floor((fought * 3 + rad * 80) * (city.pop > 0 ? 1 : 0));
      if (hit > 0 && city.pop > 0) {
        const fled = Math.floor(Math.min(city.pop * 0.05, hit * 0.4));
        const died = Math.max(0, hit - fled);
        if (died > 0) applyCityCasualties(W, city, died, rad > 0.25 ? 'fallout' : 'war');
        if (fled > 0 && city.pop >= fled) {
          city.pop -= fled;
          refugees += fled;
          spawnRefugeeAgents(W, c, fled);
        }
      }
      W.rubble[c] = Math.min(1, (W.rubble[c] || 0) + 0.02);
    }

    // Reconstruction slow vs destruction (§186) — assert asymmetry in rates.
    if ((W.rubble[c] || 0) > 0.05 && build < 0.5) {
      W.rubble[c] *= 0.997;
      if (W.build) W.build[c] = Math.min(1, build + 0.0008);
      // Rebuilt-on-top strata counter (§193).
      if ((W.build[c] || 0) > build + 0.0005) {
        city.strata = (city.strata | 0) + 1;
      }
    }

    // Ghost towns — abandoned but not destroyed (§192).
    if (!city.ghost && city.pop > 0 && city.pop < (city._pop0 || city.pop) * 0.05
      && build > 0.15 && (W.rubble[c] || 0) < 0.4) {
      city.ghost = true;
      W.ghostTowns.push({ cell: c, name: city.name, year: W.ageYr || W.year || 0 });
      if (log) log(W.year, 'ghost', c, 0.4, `${city.name || 'A town'} emptied`);
    }

    if ((W.rubble[c] || 0) > 0.1) rubble++;
  }

  for (let c = 0; c < NC; c += 5) {
    if ((W.fought[c] || 0) > 3 && (W.build?.[c] || 0) < 0.1) {
      W.rubble[c] = Math.max(W.rubble[c] || 0, 0.3);
      rubble++;
    }
  }

  // Memorial cells stay marked (§191).
  for (const m of W.memorials || []) {
    if (m.permanent && W.rubble) W.rubble[m.cell | 0] = Math.max(W.rubble[m.cell | 0] || 0, 0.15);
  }

  W.dark = W.dark || {};
  W.dark.rubble = rubble;
  W.dark.refugees = refugees;
  W.dark.memorials = (W.memorials || []).length;
  W.dark.ghostTowns = (W.ghostTowns || []).length;
  W.dark.firestorms = firestorms;
  // Aggregate strata + pyramid stub (§193, §197).
  let strata = 0;
  const pyramids = W.dark.pyramids || {};
  for (const city of W.cities || []) {
    strata += city.strata | 0;
    const oid = W.owner?.[city.cell | 0];
    if (oid == null || oid < 0) continue;
    if (!pyramids[oid]) pyramids[oid] = { youth: 0.34, adult: 0.48, elder: 0.18, pop: 0 };
    pyramids[oid].pop = (pyramids[oid].pop | 0) + (city.pop | 0);
  }
  W.dark.strata = strata;
  W.dark.pyramids = pyramids;
  void rng;
}
