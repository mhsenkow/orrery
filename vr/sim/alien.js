/** Non-Earth biospheres — photon gates, chemo, exotic solvents.
 *  Backlog items 123–137. */

import { clamp } from '../math.js';
import { NC, DIR } from '../sphere.js';
import { nodeOf } from './evolve.js';

/**
 * Usable photon fraction for oxygenic photosynthesis.
 * Falls off past ~750 nm — M dwarfs are photon-poor in the PAR band. Item 123.
 */
export function photonUsable(rule) {
  if (rule.photonUsable != null) return rule.photonUsable;
  if (rule.star?.photonFrac != null) return rule.star.photonFrac / 0.55;
  const teff = rule.starTeff || rule.star?.teff || 5772;
  if (teff >= 5000) return 1;
  if (teff >= 3500) return 0.55 + (teff - 3500) / 1500 * 0.45;
  if (teff >= 2600) return 0.15 + (teff - 2600) / 900 * 0.4;
  return 0.08;
}

/** Red-edge / purple-Earth pigment mode from star + guild. Items 124–125. */
export function surfacePigmentMode(W) {
  if (W.dominantPigment === 'retinal' || W.rule.purpleEarth) return 'purple';
  if (W.dominantPigment === 'bchl') return 'anoxygenic';
  if ((W.photonUsable || 1) < 0.35 && W.transitions?.oxygenicPhotosynthesis) return 'redEdgeShift';
  if (W.dominantPigment === 'chla') return 'green';
  return 'none';
}

export function alienTick(W, chronLog) {
  const R = W.rule;
  W.photonUsable = photonUsable(R);

  // Chemosynthetic darkness budget. Item 126.
  W.chemoPower = 0;
  if (R.chemoOnly || R.iceShell || R.signature === 'vents') {
    // Radiolysis + serpentinization — tiny but nonzero
    W.chemoPower = (R.tidalHeat || 0.05) + 0.02 + (R.radiogenic || 0) * 0.01;
    for (let c = 0; c < NC; c++) {
      if (W.bound[c] === 0 || R.iceShell) {
        if (!W.guildDens) continue;
        W.guildDens.chemolithotroph[c] = Math.max(W.guildDens.chemolithotroph[c], 0.2 * W.chemoPower);
        if (W.transitions?.abiogenesis) {
          W.life[c] = Math.max(W.life[c], 0.08 * W.chemoPower);
        }
      }
    }
  }

  // Ice-shell sparse biosphere. Item 127.
  if (R.iceShell) {
    for (let c = 0; c < NC; c++) {
      W.life[c] = Math.min(W.life[c], 0.15 * (W.chemoPower || 0.05));
      W.ice[c] = Math.max(W.ice[c], 0.85);
    }
  }

  // Titan-like methane solvent. Item 128.
  if (R.methaneSolvent) {
    W.photonUsable = 0;
    W.chemoPower = 0.01;
    // Slow, cold, sparse
    for (let c = 0; c < NC; c++) {
      if (W.temp[c] > 0.2) W.life[c] *= 0.5;
      W.life[c] = Math.min(W.life[c], 0.12);
    }
  }

  // Aerial biosphere (Venus cloud deck). Item 129.
  if (R.aerialBio) {
    for (let c = 0; c < NC; c++) {
      W.life[c] = 0; // no surface life
    }
    W.cloudLife = clamp((W.clouds ? avg(W.clouds) : 0.3) * 0.2, 0, 0.3);
    W.meanLife = W.cloudLife;
  }

  // Terminator ring on tidally locked worlds. Item 135.
  if (R.tidallyLocked && W._sunDir) {
    const [sx, sy, sz] = W._sunDir;
    for (let c = 0; c < NC; c++) {
      const mu = DIR[c * 3] * sx + DIR[c * 3 + 1] * sy + DIR[c * 3 + 2] * sz;
      const term = 1 - Math.abs(mu); // peak at terminator
      const ring = clamp(term * 2.2, 0, 1);
      if (ring < 0.35) W.life[c] *= 0.3; // too hot or too cold
      else W.life[c] = Math.max(W.life[c], ring * 0.4 * (W.meanLife || 0.2));
      W.terminatorHab[c] = ring;
    }
  } else if (!W.terminatorHab) {
    W.terminatorHab = new Float32Array(NC);
  }

  // No ozone → no land life. Item 134.
  if (W.ozone < 0.05 && W.gases.O2 < 0.02) {
    for (let c = 0; c < NC; c++) {
      if (W.h[c] >= W.seaLevel) W.life[c] *= 0.85;
    }
    W.marineOnly = true;
  } else W.marineOnly = false;

  // Sulfur ecosystems on volcanic worlds. Item 133.
  if (R.signature === 'dust' || R.sulfurSurface) {
    for (let c = 0; c < NC; c++) {
      if (W.ash[c] > 0.2 || W.bound[c] === 1) {
        if (W.guildDens?.sulfateReducer) {
          W.guildDens.sulfateReducer[c] = Math.max(W.guildDens.sulfateReducer[c], 0.15);
        }
        W.sulfurPaint = W.sulfurPaint || new Float32Array(NC);
        W.sulfurPaint[c] = clamp(W.temp[c], 0, 1);
      }
    }
  }

  // Radiation-hardened selection. Item 136.
  if ((R.flareStar || (R.starTeff && R.starTeff < 3500)) && W.tree) {
    for (const id of W.tree.living) {
      const n = nodeOf(W.tree, id);
      if (n) n.traits[10] = Math.min(1, n.traits[10] + 0.002); // radiation trait
    }
  }

  // Dead-world diagnosis. Item 137.
  W.sterileWhy = diagnoseSterile(W);
}

function avg(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function diagnoseSterile(W) {
  if (W.meanLife > 0.02 || W.transitions?.abiogenesis) return null;
  if (W.rule.airless) return 'no atmosphere / no solvent';
  if (W.meanTemp < 0.15) return 'too cold — no liquid window';
  if (W.meanTemp > 1.1) return 'too hot — runaway / steam';
  if ((W.photonUsable || 1) < 0.1 && !(W.chemoPower > 0.01)) return 'no usable photons or chemo gradient';
  if (W.ageYr < 1e8) return 'not enough time';
  if (W.habitability < 0.3) return 'uninhabitable envelope';
  return 'habitable but sterile — no origin yet';
}

/** Daisyworld demotion helpers + N-species mutable albedo. Items 113–114. */
export function daisyNSpeciesTick(W) {
  // Extend classic two-daisy with mutable albedo variants
  if (!W.daisyAlbedo) {
    W.daisyAlbedo = { black: 0.15, white: 0.85 };
  }
  // Mutation of albedo. Item 114.
  if (W.rng && W.rng() < 0.002) {
    W.daisyAlbedo.black = clamp(W.daisyAlbedo.black + (W.rng() - 0.5) * 0.02, 0.05, 0.4);
    W.daisyAlbedo.white = clamp(W.daisyAlbedo.white + (W.rng() - 0.5) * 0.02, 0.6, 0.95);
  }
}
