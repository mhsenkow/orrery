/** Geologic clock — CAI-anchored deep time, adaptive ticks, ICS chart, faint Sun.
 *  Backlog items 1–12 (clock, logtime, chart, faint, Hadean, day length, moments). */

import { clamp, lerp } from '../math.js';

/** Calcium–aluminium-rich inclusion age of the Solar System (years). */
export const CAI_AGE_YR = 4.567e9;
export const PRESENT_YR = CAI_AGE_YR;

/** ICS eon/era/period ribbon for Earth (Ma before present → years since CAI). */
export const ICS_CHART = [
  { name: 'Hadean', rank: 'eon', startMa: 4567, endMa: 4000 },
  { name: 'Archean', rank: 'eon', startMa: 4000, endMa: 2500 },
  { name: 'Eoarchean', rank: 'era', startMa: 4000, endMa: 3600 },
  { name: 'Paleoarchean', rank: 'era', startMa: 3600, endMa: 3200 },
  { name: 'Mesoarchean', rank: 'era', startMa: 3200, endMa: 2800 },
  { name: 'Neoarchean', rank: 'era', startMa: 2800, endMa: 2500 },
  { name: 'Proterozoic', rank: 'eon', startMa: 2500, endMa: 541 },
  { name: 'Paleoproterozoic', rank: 'era', startMa: 2500, endMa: 1600 },
  { name: 'Mesoproterozoic', rank: 'era', startMa: 1600, endMa: 1000 },
  { name: 'Neoproterozoic', rank: 'era', startMa: 1000, endMa: 541 },
  { name: 'Cryogenian', rank: 'period', startMa: 720, endMa: 635 },
  { name: 'Ediacaran', rank: 'period', startMa: 635, endMa: 541 },
  { name: 'Phanerozoic', rank: 'eon', startMa: 541, endMa: 0 },
  { name: 'Paleozoic', rank: 'era', startMa: 541, endMa: 252 },
  { name: 'Cambrian', rank: 'period', startMa: 541, endMa: 485 },
  { name: 'Ordovician', rank: 'period', startMa: 485, endMa: 444 },
  { name: 'Silurian', rank: 'period', startMa: 444, endMa: 419 },
  { name: 'Devonian', rank: 'period', startMa: 419, endMa: 359 },
  { name: 'Carboniferous', rank: 'period', startMa: 359, endMa: 299 },
  { name: 'Permian', rank: 'period', startMa: 299, endMa: 252 },
  { name: 'Mesozoic', rank: 'era', startMa: 252, endMa: 66 },
  { name: 'Triassic', rank: 'period', startMa: 252, endMa: 201 },
  { name: 'Jurassic', rank: 'period', startMa: 201, endMa: 145 },
  { name: 'Cretaceous', rank: 'period', startMa: 145, endMa: 66 },
  { name: 'Cenozoic', rank: 'era', startMa: 66, endMa: 0 },
  { name: 'Paleogene', rank: 'period', startMa: 66, endMa: 23 },
  { name: 'Neogene', rank: 'period', startMa: 23, endMa: 2.58 },
  { name: 'Quaternary', rank: 'period', startMa: 2.58, endMa: 0 },
  { name: 'Holocene', rank: 'epoch', startMa: 0.0117, endMa: 0 },
];

export function maToAgeYr(maBP) {
  return PRESENT_YR - maBP * 1e6;
}

export function ageYrToMaBP(ageYr) {
  return Math.max(0, (PRESENT_YR - ageYr) / 1e6);
}

/** Solar luminosity relative to today. L(t)/L₀ ≈ 1/(1+0.4(1−t/t₀)). Item 7.
 *  Optional stellar mass: M dwarfs brighten less, massive stars more. */
export function faintYoungSun(ageYr, mStar = 1) {
  const t = clamp(ageYr / PRESENT_YR, 0, 1.05);
  const amp = 0.4 * Math.pow(Math.max(0.08, mStar || 1), 0.8);
  return 1 / (1 + amp * (1 - t));
}

/**
 * Adaptive tick length (years). Log-scaled by geologic age. Item 2.
 * Hadean ~10 Myr/tick → Phanerozoic ~100 kyr → Holocene ~10 yr.
 */
export function adaptiveTickYears(ageYr, opts = {}) {
  if (opts.fixedDt != null) return opts.fixedDt;
  const maBP = ageYrToMaBP(ageYr);
  if (maBP > 4000) return 1e7;       // Hadean
  if (maBP > 2500) return 5e6;       // Archean
  if (maBP > 1000) return 2e6;       // early Proterozoic / Boring Billion
  if (maBP > 541) return 5e5;        // Neoproterozoic
  if (maBP > 66) return 1e5;         // Paleozoic–Mesozoic
  if (maBP > 2.58) return 2e4;       // Cenozoic
  if (maBP > 0.0117) return 200;     // Pleistocene
  return 10;                         // Holocene
}

/** Sidereal day length in Earth-days. Moon recession ~3.8 cm/yr → longer days. Item 10. */
export function dayLengthDays(ageYr) {
  const maBP = ageYrToMaBP(ageYr);
  // ~6 h at 4.5 Ga → 24 h now (rough tidal-evolution sketch)
  const frac = clamp(1 - maBP / 4500, 0, 1);
  return lerp(0.25, 1.0, Math.pow(frac, 0.85));
}

/** Late heavy bombardment flux multiplier. Item 6 — contested; two modes. */
export function bombardmentFlux(ageYr, mode = 'spiky') {
  const maBP = ageYrToMaBP(ageYr);
  if (maBP < 3500 || maBP > 4500) return 0;
  const t = (maBP - 3500) / 1000; // 0 at 3.5 Ga, 1 at 4.5
  if (mode === 'smooth') return Math.pow(t, 2) * 0.4;
  // Spiky terminal cataclysm near 3.9 Ga
  const spike = Math.exp(-Math.pow((maBP - 3900) / 80, 2));
  return Math.pow(t, 1.5) * 0.15 + spike * 0.85;
}

export function icsAt(ageYr) {
  const ma = ageYrToMaBP(ageYr);
  let eon = '—', era = '—', period = '—', epoch = '—';
  for (const b of ICS_CHART) {
    if (ma <= b.startMa + 1e-9 && ma >= b.endMa - 1e-9) {
      if (b.rank === 'eon') eon = b.name;
      else if (b.rank === 'era') era = b.name;
      else if (b.rank === 'period') period = b.name;
      else if (b.rank === 'epoch') epoch = b.name;
    }
  }
  // Present day falls in Holocene / Quaternary / Cenozoic / Phanerozoic
  if (ma <= 0.0117) epoch = epoch === '—' ? 'Holocene' : epoch;
  return { eon, era, period, epoch, maBP: ma };
}

export function formatAge(ageYr) {
  const ma = ageYrToMaBP(ageYr);
  if (ma <= 0.00005) return 'present';
  if (ma >= 100) return `${(ma / 1000).toFixed(2)} Ga`;
  if (ma >= 1) return `${ma.toFixed(0)} Ma`;
  if (ma >= 0.001) return `${(ma * 1000).toFixed(0)} ka`;
  return `${Math.max(0, (ma * 1e6)) | 0} yr BP`;
}

/**
 * Derive planetary era name from state transitions, not a timer. Item 4.
 * Returns a name when a significant boundary is crossed.
 */
export function eraFromState(W, prev) {
  const snap = {
    O2: W.gases.O2,
    CH4: W.gases.CH4 || 0,
    ice: W.iceFrac,
    life: W.meanLife,
    state: W.state,
    multi: W.transitions?.multicellular || false,
    landLife: W.landLifeFrac || 0,
    oxyphoto: W.transitions?.oxygenicPhotosynthesis || false,
    euk: W.transitions?.eukaryote || false,
  };
  if (!prev) return { name: null, snap };

  let name = null;
  if (!prev.oxyphoto && snap.oxyphoto) name = 'The Great Oxidation';
  else if (prev.O2 < 0.01 && snap.O2 >= 0.01) name = 'The Oxygen Dawn';
  else if (!prev.euk && snap.euk) name = 'The Complex Cell';
  else if (!prev.multi && snap.multi) name = 'The Multicellular Turn';
  else if (prev.landLife < 0.02 && snap.landLife >= 0.05 && snap.multi) name = 'The Green Invasion';
  else if (prev.state !== 'snowball' && snap.state === 'snowball') name = 'The Long Freeze';
  else if (prev.state === 'snowball' && snap.state !== 'snowball') name = 'The Thaw';
  else if (prev.CH4 < 0.0005 && snap.CH4 >= 0.0005 && snap.O2 < 0.01) name = 'The Methane Haze';
  else if (prev.ice < 0.5 && snap.ice >= 0.55) name = 'The Ice Advance';
  else if (W._extinctionPulse && W._extinctionPulse > (prev._extinctionPulse || 0)) {
    name = W._lastExtinctionName || 'The Great Dying';
  }

  return { name, snap };
}

/** Auto-capture first-occurrence moments. Item 11. */
export const MOMENT_KEYS = [
  'firstCell', 'firstPhotosynthesis', 'firstOxygen', 'firstEukaryote',
  'firstMulticellular', 'firstLandPlant', 'firstFlower', 'firstFrostAfterThaw',
];

export function maybeCaptureMoment(W, key, label, cell = 0) {
  if (!W.moments) W.moments = {};
  if (W.moments[key]) return null;
  W.moments[key] = {
    key, label, ageYr: W.ageYr, year: W.year, cell,
    gases: { ...W.gases },
    meanTemp: W.meanTemp, meanLife: W.meanLife, iceFrac: W.iceFrac,
  };
  return W.moments[key];
}

export function initDeepTime(W, rule) {
  const startGa = rule.startAgeGa != null
    ? rule.startAgeGa
    : (rule.earthLike && !rule.deepTime ? PRESENT_YR / 1e9 : 0);
  W.ageYr = startGa * 1e9;
  W.year = W.ageYr; // keep year as absolute age for chronicle compatibility
  const fixedDt = W.fixedDtYr != null ? W.fixedDtYr : rule.fixedDtYr;
  W.dtYr = adaptiveTickYears(W.ageYr, { fixedDt });
  W.bombardMode = rule.bombardMode || 'spiky';
  W.moments = {};
  W._eraSnap = null;
  W.planetChart = []; // independently derived boundaries
  W.ics = icsAt(W.ageYr);

  const mStar = rule.star?.mass || 1;
  const faint = faintYoungSun(W.ageYr, mStar);
  W._baseSolar = rule.solar;
  W.solar = rule.solar * faint;
  W.rotationPeriod = spinPeriod(rule);
}

function spinPeriod(rule) {
  const base = rule.rotationPeriod || 1;
  // Lunar tidal evolution of the day is an Earth story — don't stretch Venus or TRAPPIST.
  if (rule.earthLike && !rule.worldRecord) return base * dayLengthDays(rule._ageYr || PRESENT_YR);
  if (rule.earthLike && !rule.deepTime) return base;
  return base;
}

export function advanceClock(W, rule) {
  // Player clock override (W.fixedDtYr) wins over ruleset fixedDtYr; null → adaptive.
  const fixedDt = W.fixedDtYr != null ? W.fixedDtYr : rule.fixedDtYr;
  W.dtYr = adaptiveTickYears(W.ageYr, { fixedDt });
  // Cap so a single tick never jumps an entire eon on modern Earth —
  // unless the player explicitly chose a geologic fixed rate.
  // `thrive` is the demo Earth: same physics, but the clock is not welded shut.
  if (rule.earthLike && !rule.deepTime && !rule.thrive && W.fixedDtYr == null) {
    W.dtYr = Math.min(W.dtYr, 200);
    // Stay at the present for the calibration Earth
    if (W.ageYr >= PRESENT_YR) {
      W.ageYr = PRESENT_YR;
      W.year = W.ageYr;
      W.ics = icsAt(W.ageYr);
      W.dtYr = fixedDt != null ? fixedDt : 10;
      const faint = faintYoungSun(W.ageYr, rule.star?.mass || 1);
      if (!W.pausedSolar) {
        // Eccentricity modulation applied in insolation / GPGPU — not here.
        W.solar = (W._baseSolar ?? rule.solar) * faint;
      }
      W.rotationPeriod = rule.rotationPeriod || 1;
      return W.dtYr;
    }
  }

  W.ageYr = Math.min(PRESENT_YR, W.ageYr + W.dtYr);
  W.year = W.ageYr;
  W.ics = icsAt(W.ageYr);

  const faint = faintYoungSun(W.ageYr, rule.star?.mass || 1);
  if (!W.pausedSolar) {
    W.solar = (W._baseSolar ?? rule.solar) * faint;
  }
  W.rotationPeriod = (rule.earthLike && !rule.worldRecord)
    ? (rule.rotationPeriod || 1) * dayLengthDays(W.ageYr)
    : (rule.rotationPeriod || 1);
  return W.dtYr;
}

/** Hadean playable opening helpers. Item 5. */
export function hadeanTick(W, chronLog) {
  const ma = ageYrToMaBP(W.ageYr);
  if (ma > 4560 || ma < 4000) return;

  // Magma ocean cooling early Hadean
  if (ma > 4500) {
    for (let c = 0; c < (W.h?.length || 0); c++) {
      W.temp[c] = Math.max(W.temp[c], 1.1 + (ma - 4500) / 200);
    }
  }

  // Moon-forming impact ~4.51 Ga — once
  if (!W._moonImpact && ma <= 4510 && ma >= 4500) {
    W._moonImpact = true;
    W.gases.dust = Math.min(0.8, (W.gases.dust || 0) + 0.4);
    W.gases.CO2 = Math.min(0.6, W.gases.CO2 + 0.15);
    if (chronLog) chronLog(W.year, 'impact', 0, 10, 'Moon-forming impact');
    maybeCaptureMoment(W, 'moonForming', 'Moon-forming impact');
  }

  // Jack Hills zircons argument — liquid water by 4.4 Ga
  if (!W._zirconWater && ma <= 4400) {
    W._zirconWater = true;
    if (chronLog) chronLog(W.year, 'climate', 0, 1, 'Jack Hills: liquid water possible');
    maybeCaptureMoment(W, 'firstWater', 'First liquid water (zircon evidence)');
  }

  // Bombardment
  const flux = bombardmentFlux(W.ageYr, W.bombardMode);
  if (flux > 0.05 && W.rng && W.rng() < flux * 0.02) {
    const cell = (W.rng() * (W.h?.length || 1)) | 0;
    if (chronLog) chronLog(W.year, 'impact', cell, flux, 'Late bombardment impact');
  }
}
