/** Sensor physics — which senses a planet can actually evolve, and how good they get.
 *
 *  Nothing here asks what kind of world it is. It asks what the photon energy is,
 *  what the medium conducts, what the aperture can resolve, and whether the signal
 *  clears the thermal noise. A red-dwarf world grows near-IR eyes because Wien's law
 *  put the photons there, not because a ruleset said "alien".
 *
 *  Units: wavelength nm, energy eV, temperature K, aperture m, angles rad.
 */

import { BANDS, BAND_BY_ID, SENSE_CONST } from './lifeGrammar.js';
import { clamp } from '../math.js';

const HC_eV_nm = 1239.841984;      // h·c in eV·nm
const WIEN_nm_K = 2.897771955e6;   // Wien displacement, nm·K

/** Photon energy of a wavelength, in electron-volts. */
export function photonEnergy(lamNm) {
  return HC_eV_nm / Math.max(1e-6, lamNm);
}

/** Wavelength where a blackbody peaks in flux per wavelength. */
export function wienPeakNm(teffK) {
  return WIEN_nm_K / Math.max(1, teffK);
}

/** kT in eV. The number every "can a receptor hear this?" question is measured against. */
export function thermalEnergy(tempK) {
  return SENSE_CONST.kB_eV_K * Math.max(1, tempK);
}

/** Rayleigh limit: the smallest angle an aperture of D metres can resolve at this wavelength. */
export function diffractionAcuity(lamNm, apertureM) {
  const lamM = lamNm * 1e-9;
  return 1.22 * lamM / Math.max(1e-4, apertureM);
}

/** Aperture a lineage of this body size can afford to devote to one sensor.
 *  sizeClass is log10 grams offset by 4; body length ~ mass^(1/3) at unit density;
 *  an eye is roughly a tenth of body length across at the large end. */
export function apertureFromSize(sizeClass) {
  const grams = Math.pow(10, clamp(sizeClass, 0, 14) - 4);
  const lengthM = Math.cbrt(Math.max(1e-9, grams) * 1e-6) * 3.2; // 1 g ≈ 3.2 cm
  return clamp(lengthM * 0.09, 1e-5, 6);
}

/** Can a chemical pigment register this photon at all?
 *  Below the isomerisation energy the answer is no at any intensity, and the
 *  spontaneous-isomerisation noise floor climbs exponentially as you approach it.
 *  provenance: energy threshold measured (retinal ≈ 1.5 eV); noise slope fitted. */
export function pigmentQuality(lamNm, bodyTempK = 300) {
  const E = photonEnergy(lamNm);
  const Emin = SENSE_CONST.photoisomerisation_eV;
  if (E < Emin * 0.82) return 0;                  // ~1000 nm hard floor
  const kT = thermalEnergy(bodyTempK);
  const barrier = 0.7 * E;                         // Barlow: thermal activation over ~0.7 E
  const darkNoise = Math.exp(-barrier / (kT * 26)); // scaled so 500 nm at 300 K is quiet
  return clamp(1 - darkNoise, 0, 1);
}

/** Fraction of a blackbody's *photon* flux (not energy flux) that lands inside a band.
 *  Numerically integrated over the Planck photon distribution, because the Gaussian
 *  approximation this replaced put a red-dwarf world's red band four orders of
 *  magnitude too low and quietly made vision impossible on every M-dwarf planet.
 *
 *  n_lambda ∝ lambda^-4 / (exp(hc / lambda k T) - 1)
 */
const _shareCache = new Map();

function planckPhotonDensity(lamNm, teffK) {
  const x = HC_eV_nm / (lamNm * SENSE_CONST.kB_eV_K * teffK);
  if (x > 700) return 0;
  const denom = Math.expm1(x);
  if (!(denom > 0)) return 0;
  return 1 / (Math.pow(lamNm, 4) * denom);
}

/** Simpson over log-lambda, which is the natural variable for a spectrum. */
function photonIntegral(loNm, hiNm, teffK, steps = 96) {
  const a = Math.log(loNm), b = Math.log(hiNm);
  const h = (b - a) / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const lam = Math.exp(a + i * h);
    const w = i === 0 || i === steps ? 1 : i % 2 ? 4 : 2;
    sum += w * planckPhotonDensity(lam, teffK) * lam; // × lambda for d(log lambda)
  }
  return sum * h / 3;
}

export function bandPhotonShare(band, teffK) {
  if (band.lamMinNm == null) return 1;
  const T = Math.max(200, Math.min(60000, teffK));
  const key = `${band.id}|${Math.round(T)}`;
  const hit = _shareCache.get(key);
  if (hit !== undefined) return hit;
  const total = photonIntegral(20, 5e6, T, 256);
  const inBand = photonIntegral(Math.max(1, band.lamMinNm), band.lamMaxNm, T);
  const share = total > 0 ? clamp(inBand / total, 0, 1) : 0;
  if (_shareCache.size > 4000) _shareCache.clear();
  _shareCache.set(key, share);
  return share;
}

/** The best photon share any band achieves on this star — the yardstick a band's
 *  own share is scored against, so "well lit" means well lit *for this sky*. */
const _peakCache = new Map();
export function bandBrightness(band, teffK) {
  if (band.lamMinNm == null) return 0;
  // Per log-octave, so a wide band is not rewarded for being wide. Without this the
  // 740–2500 nm bin beats 500–580 nm on the Sun purely by covering more spectrum.
  const width = Math.log(band.lamMaxNm / Math.max(1, band.lamMinNm));
  return bandPhotonShare(band, teffK) / Math.max(0.05, width);
}

export function peakBandShare(teffK) {
  const T = Math.round(Math.max(200, Math.min(60000, teffK)));
  const hit = _peakCache.get(T);
  if (hit !== undefined) return hit;
  let best = 1e-9;
  for (const b of BANDS) {
    const v = bandBrightness(b, T);
    if (v > best) best = v;
  }
  _peakCache.set(T, best);
  return best;
}

/** How much of a band survives the atmosphere and the medium above the animal.
 *  provenance: window positions measured, opacities fitted. */
export function mediumTransmission(band, env) {
  const medium = env.medium || 'air';
  if (!band.needsMedium.includes(medium) && !band.needsMedium.includes('any')) return 0;

  if (band.lamMinNm == null) {
    if (band.id === 'electric') return medium === 'water' || medium === 'cryobrine' ? 1 : 0;
    if (band.id === 'magnetic') return env.magnetic > 0.05 ? 1 : 0.05;
    if (band.id === 'acoustic') {
      // Impedance and speed of sound: a dense atmosphere or a liquid carries sound well.
      const dens = medium === 'air' ? clamp(env.pressureBar ?? 1, 0.001, 100) / 1 : 800;
      return clamp(Math.log10(1 + dens) * 0.55, 0.02, 1);
    }
    return 1;
  }

  const mid = Math.sqrt(band.lamMinNm * band.lamMaxNm);
  let t = 1;

  if (medium === 'air') {
    const h2o = clamp(env.humidity ?? 0.5, 0, 1);
    const co2 = clamp(env.co2 ?? 0.0004, 0, 1);
    const ozone = clamp(env.ozone ?? 0.2, 0, 1);
    const haze = clamp(env.haze ?? 0, 0, 1);
    if (mid < 315) t *= Math.exp(-ozone * 9);                 // ozone cuts UV
    if (mid > 2500 && mid < 1e6) {
      // Thermal IR: the 8–13 µm window is the only wide one, and vapour closes it.
      const inWindow = mid > 8000 && mid < 13000;
      t *= inWindow ? Math.exp(-h2o * 1.6) : Math.exp(-(h2o * 3.2 + co2 * 6));
    }
    if (mid >= 1e6) t *= 0.95;                                 // radio window is wide open
    t *= 1 - haze * 0.85;
    t *= 1 - clamp(env.cloud ?? 0, 0, 1) * (mid < 1e6 ? 0.7 : 0.05);
  } else if (medium === 'water' || medium === 'cryobrine') {
    // Seawater is a blue-green filter and everything else is gone in metres.
    const depth = Math.max(0, env.depthM ?? 5);
    const kd = mid < 380 ? 0.35 : mid < 500 ? 0.045 : mid < 580 ? 0.09
      : mid < 740 ? 0.45 : 12;                                  // 1/m attenuation
    t *= Math.exp(-kd * depth);
    if (env.iceShellM > 0) t *= Math.exp(-0.02 * env.iceShellM);
  } else if (medium === 'rock') {
    t = mid > 1e6 ? 0.1 : 0;
  }
  return clamp(t, 0, 1);
}

/** Full viability of one band on one world for one body.
 *  Returns { ok, score, acuityRad, imaging, detector, why }. */
export function bandViability(bandId, env = {}) {
  const band = BAND_BY_ID[bandId];
  if (!band) return { ok: false, score: 0, why: 'no such band' };

  const teff = env.starTeffK ?? 5772;
  const bodyT = env.bodyTempK ?? 295;
  const aperture = env.apertureM ?? apertureFromSize(env.sizeClass ?? 4);

  const trans = mediumTransmission(band, env);
  if (trans <= 0.01) {
    return { ok: false, score: 0, acuityRad: Infinity, imaging: false, detector: band.detector,
      why: `${band.id}: the medium does not deliver it` };
  }

  // Photon bands are scored against the best-lit band of this same sky, so a red
  // dwarf's near-IR is "bright" and its blue is "starved" without either being
  // measured against the Sun. Insolation enters sub-linearly: an eye adapts.
  let flux = 0.6;
  if (band.lamMinNm != null) {
    const rel = bandBrightness(band, teff) / peakBandShare(teff);
    flux = clamp(rel, 0, 1) * Math.pow(clamp(env.insol ?? 1, 0.001, 40), 0.3);
  }

  const mid = band.lamMinNm == null ? null : Math.sqrt(band.lamMinNm * band.lamMaxNm);
  let quality = 1;
  let why = '';

  if (band.detector === 'pigment') {
    quality = pigmentQuality(mid, bodyT);
    if (quality <= 0) {
      return { ok: false, score: 0, acuityRad: Infinity, imaging: false, detector: band.detector,
        why: `${band.id}: ${photonEnergy(mid).toFixed(2)} eV is below the ${SENSE_CONST.photoisomerisation_eV} eV a pigment needs — no chemistry, at any brightness` };
    }
  } else if (band.detector === 'bolometer') {
    // A heat detector competes with the body's own emission: ΔT sensitivity ~ mK.
    const contrast = clamp((env.targetDeltaK ?? 5) / 200, 0, 1);
    quality = clamp(0.25 + contrast, 0, 0.75);
    why = 'thermal difference organ, not an eye';
  } else if (band.detector === 'antenna') {
    // Coherent detection: works at any energy, pays in aperture.
    quality = clamp(0.2 + (env.radioQuiet ?? 0.5) * 0.5, 0, 0.8);
    why = 'coherent detection — aperture is the whole cost';
  }

  let acuity = Infinity;
  if (band.imaging) {
    acuity = mid == null
      ? (band.id === 'electric' ? 0.05 : band.id === 'pressure' ? 0.15 : band.id === 'acoustic' ? 0.02 : 0.3)
      : diffractionAcuity(mid, aperture);
  }

  const acuityScore = acuity === Infinity ? 0.25 : clamp(SENSE_CONST.humanAcuity_rad / acuity, 0.02, 1);
  // `utility` is how much of a life can be run on this sense at all: an imaging photon
  // band is 1, a gravity sense tells you one thing. It is the one fitted number here.
  const utility = band.utility ?? 0.5;
  const score = clamp(trans * flux * quality * utility * (0.35 + 0.65 * acuityScore), 0, 1);

  if (!why) {
    if (band.imaging && acuity < SENSE_CONST.humanAcuity_rad * 3) why = 'images well at this body size';
    else if (band.imaging) why = `blurred: ${(acuity * 1e3).toFixed(2)} mrad at a ${(aperture * 100).toFixed(1)} cm aperture`;
    else why = 'non-imaging';
  }

  return {
    ok: score > 0.02, score, acuityRad: acuity, imaging: !!band.imaging,
    detector: band.detector, transmission: trans, quality, why: `${band.id}: ${why}`,
  };
}

/** Every band this world can support for this body, best first. */
export function viableBands(env = {}) {
  return BANDS
    .map((b) => ({ id: b.id, ...bandViability(b.id, env) }))
    .filter((r) => r.ok)
    .sort((a, b) => b.score - a.score);
}

/** Aperture needed to image at a stated acuity in a stated band — the "how big must
 *  a microwave-eyed animal be?" question, answered in metres. */
export function apertureForAcuity(bandId, acuityRad = SENSE_CONST.humanAcuity_rad) {
  const band = BAND_BY_ID[bandId];
  if (!band?.lamMinNm) return null;
  const mid = Math.sqrt(band.lamMinNm * band.lamMaxNm);
  return 1.22 * mid * 1e-9 / acuityRad;
}

/** Build the sensory environment for one cell of a running world. */
export function sensoryEnvAt(W, c, opts = {}) {
  const sea = W.h?.[c] < W.seaLevel;
  const R = W.rule || {};
  const teff = R.starTeff || R.star?.teff || 5772;
  return {
    starTeffK: teff,
    insol: R.solar ?? W.solar ?? 1,
    medium: opts.medium || (R.iceShell ? 'cryobrine' : sea ? 'water' : 'air'),
    depthM: sea ? Math.max(1, (W.seaLevel - W.h[c]) * 6000) : 0,
    iceShellM: R.iceShell ? (R.iceShellKm || 15) * 1000 : 0,
    bodyTempK: 173 + (W.temp?.[c] ?? 0.5) * 200,
    humidity: W.moist?.[c] ?? 0.5,
    co2: W.gases?.CO2 ?? 0.0004,
    ozone: W.ozone ?? 0.2,
    haze: R.hazeOpacity ?? (W.gases?.dust ?? 0),
    cloud: W.clouds?.[c] ?? 0.4,
    pressureBar: R.surfacePressure ?? 1,
    magnetic: R.magnetosphere ?? 1,
    radioQuiet: R.flareStar ? 0.15 : 0.7,
    sizeClass: opts.sizeClass ?? 4,
    apertureM: opts.apertureM,
    targetDeltaK: opts.targetDeltaK ?? 5,
  };
}
