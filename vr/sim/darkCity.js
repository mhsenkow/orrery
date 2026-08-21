/** Cities under attack — rubble, refugees, memorials, casualty conservation (dark-400 J §181–200). */

import { NC } from '../sphere.js';
import { noteCasualty } from './dark.js';

export function resetCityDark(W) {
  if (!W.rubble || W.rubble.length !== NC) W.rubble = new Float32Array(NC);
  else W.rubble.fill(0);
  W.memorials = [];
  W.dark = W.dark || {};
  W.dark.rubble = 0;
  W.dark.refugees = 0;
}

/** Ensure each settlement has a pop that can die separately from build (§181). */
export function ensureCityPop(W) {
  for (const city of W.cities || []) {
    if (city.pop == null || city.pop <= 0) {
      const b = W.build?.[city.cell] || 0.3;
      city.pop = Math.max(10, Math.floor(80 + b * 4000));
    }
    if (city._pop0 == null) city._pop0 = city.pop;
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
  const d = Math.min(before, Math.floor(deaths));
  city.pop = before - d;
  noteCasualty(W, cause, d, playerAttributed);
  assertCasualtyConservation(W, before, d, city.pop);
  if (city.pop <= 0 && before > 0) {
    // Memorial (§191).
    if (!W.memorials) W.memorials = [];
    W.memorials.push({
      cell: city.cell | 0,
      name: city.name || 'unnamed',
      year: W.ageYr || W.year || 0,
      tick: W._tickIndex | 0,
    });
    if (W.memorials.length > 64) W.memorials.splice(0, W.memorials.length - 48);
  }
  return d;
}

export function cityDarkTick(W, log = null) {
  ensureCityPop(W);
  if (!W.rubble || W.rubble.length !== NC) W.rubble = new Float32Array(NC);
  if (!W.fought || W.fought.length !== NC) {
    W.dark = W.dark || {};
    W.dark.rubble = 0;
    return;
  }

  let rubble = 0;
  let refugees = W.dark?.refugees || 0;

  for (const city of W.cities || []) {
    const c = city.cell | 0;
    const build = W.build?.[c] || 0;
    const fought = W.fought[c] || 0;
    const rad = W.rad?.[c] || 0;

    // Strike damage → pop loss + rubble (§185).
    if (fought > 2 || rad > 0.25) {
      const hit = Math.floor((fought * 3 + rad * 80) * (city.pop > 0 ? 1 : 0));
      if (hit > 0 && city.pop > 0) {
        const fled = Math.floor(Math.min(city.pop * 0.05, hit * 0.4));
        const died = Math.max(0, hit - fled);
        if (died > 0) applyCityCasualties(W, city, died, rad > 0.25 ? 'fallout' : 'war');
        if (fled > 0 && city.pop >= fled) {
          refugees += fled;
          city.pop -= fled;
          let dest = -1;
          let best = 0;
          for (const other of W.cities || []) {
            if (other.cell === c) continue;
            const b = W.build?.[other.cell] || 0;
            if (b > best && (W.rad?.[other.cell] || 0) < 0.15) {
              best = b;
              dest = other.cell | 0;
            }
          }
          if (dest >= 0 && W.build) {
            W.build[dest] = Math.min(1, (W.build[dest] || 0) + fled * 1e-5);
            const destCity = (W.cities || []).find((x) => x.cell === dest);
            if (destCity) destCity.pop = (destCity.pop | 0) + fled;
          }
        }
      }
      W.rubble[c] = Math.min(1, (W.rubble[c] || 0) + 0.02);
    }

    // Reconstruction slow vs destruction (§186).
    if ((W.rubble[c] || 0) > 0.05 && build < 0.5) {
      W.rubble[c] *= 0.997; // slow clear
      if (W.build) W.build[c] = Math.min(1, build + 0.0008); // slow rebuild
    }

    if ((W.rubble[c] || 0) > 0.1) rubble++;
  }

  // Also count fought low-build cells as rubble.
  for (let c = 0; c < NC; c += 5) {
    if ((W.fought[c] || 0) > 3 && (W.build?.[c] || 0) < 0.1) {
      W.rubble[c] = Math.max(W.rubble[c] || 0, 0.3);
      rubble++;
    }
  }

  W.dark = W.dark || {};
  W.dark.rubble = rubble;
  W.dark.refugees = refugees;
  W.dark.memorials = (W.memorials || []).length;
}
