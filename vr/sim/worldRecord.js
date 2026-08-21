/** World parameter record — measured / derived / assumed tiers.
 *  Exoparams backlog critical path: record, tier, rm, grav, escape, insol, teq,
 *  host, elements, press, gap, system, cite, contested. */

import {
  compositionFromDensity,
  radiusValleySide,
  massClass,
  interiorFromComposition,
  reliefFromGravity,
  isNonHydrostatic,
  scaleHeightKm,
  meanMolecularWeight,
  integratedXuvDose,
  retainsAtmosphere,
  cosmicShoreline,
  rocheLimitAu,
  tidalHeatFluxWm2,
  radiogenicHeat,
  internalHeatFraction,
  daysideNightside,
  redistributionGuess,
  flareRateFromAge,
  whiteDwarfHzWindow,
  spinOrbitResonance,
  orbitalDecayLifetimeYr,
  observabilityScore,
  densityLabel,
  greenhouseKelvin,
  snowLineAu,
  MOON_PARENTS,
  PDOT,
  OBSERVED_ATMO,
  discoveryGuess,
  splitMembers,
} from './exophysics.js';

export const SCHEMA_VERSION = 1;

/** NASA Exoplanet Archive acknowledgement (required when shipping archive data). */
export const ARCHIVE_CITATION =
  'This research has made use of the NASA Exoplanet Archive, which is operated by the ' +
  'California Institute of Technology, under contract with the National Aeronautics and ' +
  'Space Administration under the Exoplanet Exploration Program.';

/** Refresh cadence — stated so staleness is honest. */
export const REFRESH_CADENCE = 'on-demand (committed snapshot; re-run scripts/fetch-exoarchive.mjs)';

export const TIERS = Object.freeze({
  measured: 'measured',
  derived: 'derived',
  assumed: 'assumed',
  limit: 'limit',
  missing: 'missing',
});

/** SI / astronomical units attached to every numeric field. */
export const UNITS = Object.freeze({
  radius: 'R⊕',
  mass: 'M⊕',
  msini: 'M⊕',
  a: 'AU',
  P: 'd',
  e: '',
  obl: 'deg',
  rot: 'h',
  S: 'S⊕',
  teq: 'K',
  teff: 'K',
  density: 'g/cm³',
  gravity: 'g⊕',
  escape: 'km/s',
  press: 'bar',
  albedo: '',
  ageGyr: 'Gyr',
  distPc: 'pc',
  stMass: 'M☉',
  stRad: 'R☉',
  stLum: 'L☉',
  xuv: 'Earth-atm',
  scaleH: 'km',
  mu: 'g/mol',
});

/** Gap policy — one decision applied everywhere. */
export const GAP_POLICY = Object.freeze({
  /** Prefer showing a hole over a silent default. */
  preferHole: true,
  /** Fill only when a published relation exists, and flag as assumed/derived. */
  allowEstimate: true,
  /** Default Bond albedo when unknown (Earth convention — flagged assumed). */
  defaultAlbedo: 0.3,
  /** Default eccentricity when missing (literature convention — flagged assumed). */
  defaultEcc: 0,
  /** Default exoplanet obliquity when unknown — flagged assumed. */
  defaultOblDeg: 0,
  /** Exclude rows that lack both radius and mass from playable validation. */
  requireRm: false,
});

const R_EARTH_M = 6.371e6;
const M_EARTH_KG = 5.972e24;
const G = 6.6743e-11;

/** Contested / retracted / disputed detections — keyed by display name substring. */
export const CONTESTED = [
  { match: /kapteyn/i, status: 'contested', note: 'Claimed then argued to be a stellar-rotation artefact.' },
  { match: /tau cet/i, status: 'contested', note: 'Several claimed planets in this system have not survived reanalysis.' },
  { match: /koi-55|koi 55/i, status: 'contested', note: 'May be pulsation artefacts rather than planets.' },
  { match: /kepler-452/i, status: 'contested', note: 'Detection validation has been questioned.' },
  { match: /k2-18|toi-270 d/i, status: 'contested', note: 'DMS claim contested; CH₄/CO₂ detections more secure.' },
  { match: /kepler-1625/i, status: 'contested', note: 'Exomoon claim contested.' },
];

/** Known mixing ratios where measured. Envelope worlds use H2/He, not N2. */
export const GASES = {
  Earth: { N2: 0.7808, O2: 0.2095, CO2: 0.00042, CH4: 0.0000019, H2O: 0.01, dust: 0, sulphate: 0 },
  Venus: { N2: 0.035, O2: 0, CO2: 0.965, CH4: 0, H2O: 0.00003, dust: 0, sulphate: 0.08 },
  Mars: { N2: 0.027, O2: 0.0013, CO2: 0.953, CH4: 0, H2O: 0.0003, dust: 0.05, sulphate: 0 },
  Titan: { N2: 0.95, O2: 0, CO2: 0.01, CH4: 0.05, H2O: 0.001, dust: 0, sulphate: 0 },
  Pluto: { N2: 0.99, O2: 0, CO2: 0, CH4: 0.005, H2O: 0, dust: 0, sulphate: 0 },
  Triton: { N2: 0.99, O2: 0, CO2: 0, CH4: 0.01, H2O: 0, dust: 0, sulphate: 0 },
};

/** Distances (pc) for observability. Hosts already carry some. */
export const DIST_PC = {
  'Proxima Cen b': 1.302, 'Proxima Cen d': 1.302,
  'Barnard b–e': 1.83, 'Ross 128 b': 3.37, 'GJ 273 b': 3.79,
  'Teegarden b, c, d': 3.83, 'tau Cet f': 3.65,
  'Gliese 12 b': 12.0, 'TRAPPIST-1 e': 12.43, 'LHS 1140 b': 14.99,
  'Kepler-186 f': 179, 'Kepler-452 b': 430, 'Kepler-22 b': 180,
  'WISE 0855-0714': 2.2, 'Luhman 16 AB': 2.0,
};

/** System ages (Gyr) when known. */
export const AGE_GYR = {
  Earth: 4.54, Venus: 4.54, Mars: 4.54, Mercury: 4.54,
  'V1298 Tau b / K2-33 b': 0.023, 'AU Mic b': 0.022,
  'HR 8799': 0.030, 'beta Pic b, c': 0.023,
  'Kepler-444 / Kepler-1625 b': 11.2, 'PSR B1620-26 b': 12.7,
  'TRAPPIST-1 e': 7.6, 'Kapteyn c': 11,
};

/** Known Bond albedos (measured where possible). */
export const ALBEDO = {
  Earth: 0.306,
  Venus: 0.76,
  Mars: 0.25,
  Mercury: 0.088,
  Jupiter: 0.503,
  Saturn: 0.342,
  Uranus: 0.300,
  Neptune: 0.290,
  Pluto: 0.49,
  Luna: 0.12,
  Titan: 0.22,
  Europa: 0.67,
  Io: 0.63,
  Ganymede: 0.43,
  Callisto: 0.22,
  Enceladus: 0.81,
  Triton: 0.76,
  'TrES-2 b': 0.01,
  'WASP-12 b': 0.06,
  'LTT 9779 b': 0.8,
};

/** Surface pressure in bar for bodies where it is known. */
export const PRESSURE = {
  Earth: 1.013,
  Venus: 92,
  Mars: 0.00636,
  Mercury: 0,
  Jupiter: null, // no surface
  Saturn: null,
  Uranus: null,
  Neptune: null,
  Pluto: 1e-5,
  Titan: 1.5,
  Luna: 0,
  Io: 0,
  Europa: 0,
  Ganymede: 0,
  Callisto: 0,
  Enceladus: 0,
  Triton: 1.4e-5,
  'LHS 3844 b': 0, // measured absent
};

/** Mass provenance overrides when seed mass is M sin i or model-dependent. */
export const MASS_PROV = {
  'Proxima Cen b': 'Msini',
  'Proxima Cen d': 'Msini',
  'Ross 128 b': 'Msini',
  'GJ 273 b': 'Msini',
  'GJ 357 d': 'Msini',
  'Teegarden b, c, d': 'Msini',
  'tau Cet f': 'Msini',
  'Kapteyn c': 'Msini',
  'Barnard b–e': 'Msini',
  'HR 8799': 'Model',
  'beta Pic b, c': 'Model',
  '51 Eri b': 'Model',
  'HIP 65426 b': 'Model',
  'GJ 504 b / HD 106906 b': 'Model',
};

/** Shared host-star records — one object referenced by many planets. */
export const HOSTS = {
  sol: {
    id: 'sol', name: 'Sun', teff: 5772, mass: 1, radius: 1, ageGyr: 4.6,
    met: 0, distPc: 0, spectral: 'G2V', synthetic: false,
  },
  trappist1: {
    id: 'trappist1', name: 'TRAPPIST-1', teff: 2566, mass: 0.0898, radius: 0.1192,
    ageGyr: 7.6, met: 0.04, distPc: 12.43, spectral: 'M8V', synthetic: false,
  },
  proxima: {
    id: 'proxima', name: 'Proxima Centauri', teff: 3042, mass: 0.122, radius: 0.1542,
    ageGyr: 4.85, met: 0.21, distPc: 1.302, spectral: 'M5.5V', synthetic: false, flare: true,
  },
  lhs1140: {
    id: 'lhs1140', name: 'LHS 1140', teff: 3096, mass: 0.179, radius: 0.2139,
    ageGyr: 5, met: -0.24, distPc: 14.99, spectral: 'M4.5V', synthetic: false,
  },
  toi700: {
    id: 'toi700', name: 'TOI-700', teff: 3480, mass: 0.416, radius: 0.42,
    ageGyr: 1.5, met: -0.07, distPc: 31.1, spectral: 'M2V', synthetic: false, quiet: true,
  },
};

/** Map body name → host id when the name implies a shared star. */
export function hostIdForName(name) {
  const n = (name || '').toLowerCase();
  if (/^(earth|venus|mars|mercury|jupiter|saturn|uranus|neptune|pluto|ceres|luna|io|europa|ganymede|callisto|titan|enceladus|triton|miranda|iapetus|mimas|charon|phobos|deimos|arrokoth|eris|uranian)/i.test(n)
    || n.includes('rhea') || n.includes('sedna') || n.includes('bennu')) return 'sol';
  if (n.includes('trappist')) return 'trappist1';
  if (n.includes('proxima')) return 'proxima';
  if (n.includes('lhs 1140')) return 'lhs1140';
  if (n.includes('toi-700') || n.includes('toi 700')) return 'toi700';
  return null;
}

/** Stable slug id from a display name. */
export function bodyKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

/** Alias table — alternate catalogue designations. */
export const ALIASES = {
  'kepler-1520': ['kic 12557548', 'kic12557548'],
  'k2-141': ['epic 246393474'],
  'gliese 12 b': ['gj 12 b', 'wolf 1821 b'],
  'gj 273 b': ["luyten's star b", 'luyten b'],
  'wolf 1061 c': ['gj 628 c'],
};

/** Wrap a value with tier + unit + optional errors / source. */
export function field(value, tier, unit, opts = {}) {
  const out = {
    v: value,
    tier: tier || (value == null || !Number.isFinite(value) ? TIERS.missing : TIERS.measured),
    unit: unit || '',
  };
  if (opts.err1 != null) out.err1 = opts.err1;
  if (opts.err2 != null) out.err2 = opts.err2;
  if (opts.limit) out.limit = opts.limit; // 'upper' | 'lower'
  if (opts.source) out.source = opts.source;
  if (opts.note) out.note = opts.note;
  return out;
}

export function val(f) {
  if (f == null) return null;
  if (typeof f === 'object' && 'v' in f) return f.v;
  return f;
}

/** Mean density in g/cm³ from mass and radius in Earth units. */
export function densityFromRm(mEarth, rEarth) {
  if (!(mEarth > 0) || !(rEarth > 0)) return null;
  // Earth mean density ≈ 5.514 g/cm³
  return 5.514 * mEarth / (rEarth * rEarth * rEarth);
}

/** Surface gravity in Earth-g from mass and radius. */
export function gravityFromRm(mEarth, rEarth) {
  if (!(mEarth > 0) || !(rEarth > 0)) return null;
  return mEarth / (rEarth * rEarth);
}

/** Escape velocity in km/s. */
export function escapeVelocity(mEarth, rEarth) {
  if (!(mEarth > 0) || !(rEarth > 0)) return null;
  const M = mEarth * M_EARTH_KG;
  const R = rEarth * R_EARTH_M;
  return Math.sqrt(2 * G * M / R) / 1000;
}

/** Stellar luminosity from radius (R☉) and Teff (K). L = R² (T/T☉)⁴ */
export function luminosityFromRT(rSolar, teff) {
  if (!(rSolar > 0) || !(teff > 0)) return 0;
  return rSolar * rSolar * Math.pow(teff / 5772, 4);
}

/** Insolation in Earth units: S = L★ / a² */
export function insolationFromLa(lumSolar, aAu) {
  if (!(aAu > 0)) return 0;
  return (lumSolar || 0) / (aAu * aAu);
}

/**
 * Equilibrium temperature (K).
 * T_eq = 278.5 * S^¼ * (1−A)^¼   (Earth-normalised; 278.5 K at S=1, A=0)
 * Equivalent to T★ √(R★/(2a)) (1−A)^¼ when L comes from a blackbody star.
 */
export function teqFromInsolAlbedo(S, albedo = GAP_POLICY.defaultAlbedo) {
  if (!(S > 0)) return 0;
  const A = Number.isFinite(albedo) ? clamp01(albedo) : GAP_POLICY.defaultAlbedo;
  return 278.5 * Math.pow(S, 0.25) * Math.pow(1 - A, 0.25);
}

/** Kepler III: P (days) from a (AU) and M★ (M☉). */
export function periodFromAM(aAu, mStar) {
  if (!(aAu > 0) || !(mStar > 0)) return null;
  return 365.256898 * Math.sqrt(aAu * aAu * aAu / mStar);
}

/** Kepler III: a (AU) from P (days) and M★ (M☉). */
export function aFromPeriod(Pdays, mStar) {
  if (!(Pdays > 0) || !(mStar > 0)) return null;
  return Math.pow((Pdays / 365.256898) ** 2 * mStar, 1 / 3);
}

/** Rough tidal locking timescale (yr) — scales ~ a⁶ / (M★² R³). Order-of-magnitude. */
export function tidalLockTimescaleYr(aAu, mStar, rEarth, mEarth) {
  if (!(aAu > 0) || !(mStar > 0) || !(rEarth > 0) || !(mEarth > 0)) return Infinity;
  // Normalise so Earth at 1 AU ~ 1e12 yr; close-in worlds lock fast.
  const a6 = aAu ** 6;
  const dens = densityFromRm(mEarth, rEarth) || 5.5;
  return 1e10 * a6 / (mStar * mStar) * (dens / 5.5);
}

/** True if locking timescale is shorter than system age (default 5 Gyr). */
export function isTidallyLocked(aAu, mStar, rEarth, mEarth, ageGyr = 5) {
  const t = tidalLockTimescaleYr(aAu, mStar, rEarth, mEarth);
  return t < ageGyr * 1e9;
}

/** Spectral class label from Teff. */
export function spectralClassFromTeff(teff) {
  if (!(teff > 0)) return '—';
  const bins = [
    [30000, 'O'], [10000, 'B'], [7500, 'A'], [6000, 'F'],
    [5200, 'G'], [3700, 'K'], [2400, 'M'], [1300, 'L'], [600, 'T'], [0, 'Y'],
  ];
  for (const [lo, letter] of bins) {
    if (teff >= lo) {
      // subclass 0–9 within the bin toward the next hotter edge
      const hi = bins.find((b) => b[0] > lo)?.[0] ?? lo * 2;
      const frac = hi > lo ? (teff - lo) / (hi - lo) : 0;
      const sub = Math.max(0, Math.min(9, Math.floor((1 - frac) * 10)));
      return `${letter}${sub}`;
    }
  }
  return 'Y';
}

/** Main-sequence lifetime (Gyr) ≈ 10 * M^-2.5 */
export function stellarLifetimeGyr(mStar) {
  if (!(mStar > 0)) return Infinity;
  return 10 * Math.pow(mStar, -2.5);
}

/** Habitable-zone approximate edges in AU (Kopparapu-like scaling). */
export function habitableZoneAu(lumSolar, teff = 5772) {
  const L = Math.max(0, lumSolar || 0);
  // Simple Seff scaling; inner runaway / outer max-greenhouse rough Earth values.
  let sinn = 1.107, sout = 0.356;
  if (teff < 4000) { sinn = 0.99; sout = 0.24; }
  else if (teff > 7000) { sinn = 1.2; sout = 0.4; }
  const s = Math.sqrt(L);
  return { inner: s / Math.sqrt(sinn), outer: s / Math.sqrt(sout) };
}

/** Solar day (hours) from sidereal rotation (hours) and orbital period (days). */
export function solarDayHours(rotHours, Pdays) {
  if (!Number.isFinite(rotHours) || !Number.isFinite(Pdays) || Pdays === 0) return null;
  const Phours = Pdays * 24;
  if (Math.abs(rotHours) < 1e-9) return null;
  // 1/t_sol = 1/t_sid − 1/P  (signed rot: negative = retrograde)
  const inv = 1 / rotHours - 1 / Phours;
  if (Math.abs(inv) < 1e-12) return Infinity;
  return 1 / inv;
}

/**
 * Freeze-point proxy 0–1 from teq (K) for ruleset.freeze.
 *
 * On the temperature scale everything else in the sim uses, one unit is 160 K
 * and a cell's absolute temperature is the world's mean plus `(s − meanS)·160`
 * (`cellTK`). This function used to spread 400 K over that unit and anchor
 * water's freezing point at 0.3, so a world's ice line sat some 25 K below where
 * its own thermometer said ice should be — the two scales disagreed, and the
 * thresholds always lost.
 */
export function freezeFromTeq(teqK) {
  if (!(teqK > 0)) return 0.9;
  return clamp01(0.5 + (273.15 - teqK) / 160);
}

/** Zeng-like rocky mass–radius estimate (Earth units) when one side is missing. */
export function estimateMassFromRadius(rEarth) {
  if (!(rEarth > 0)) return null;
  // Rough Earth-like composition: M ≈ R^3.7 for rocky worlds below ~1.6 R⊕
  if (rEarth < 1.6) return Math.pow(rEarth, 3.7);
  // Above radius valley — volatile-rich; very uncertain
  return Math.pow(rEarth, 3.7) * 0.5;
}

export function estimateRadiusFromMass(mEarth) {
  if (!(mEarth > 0)) return null;
  if (mEarth < 2) return Math.pow(mEarth, 1 / 3.7);
  return Math.pow(mEarth / 0.5, 1 / 3.7);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function primaryName(b) {
  return String(b || '').split(/\s*\/\s*/)[0].replace(/,.*/, '').trim();
}

/**
 * Build a full WorldRecord from a seed row (+ optional archive overlay).
 * Seed shape: { b, c, r, m, a, P, e, obl, rot, S, teq, teff, note, ... }
 */
export function makeWorldRecord(seed, opts = {}) {
  const name = seed.b || seed.name || 'Unknown';
  const key = bodyKey(name);
  const primary = primaryName(name);
  const hostId = seed.hostId || hostIdForName(name);
  const host = opts.host || (hostId ? HOSTS[hostId] : null);

  const gaps = [];
  const assumptions = [];

  let r = seed.r;
  let m = seed.m;
  let massProv = seed.massProv || MASS_PROV[name] || MASS_PROV[primary] || 'Mass';
  let rTier = TIERS.measured;
  let mTier = massProv === 'Msini' ? TIERS.measured : TIERS.measured;

  if (!(r > 0) && m > 0 && GAP_POLICY.allowEstimate) {
    r = estimateRadiusFromMass(m);
    rTier = TIERS.assumed;
    gaps.push('radius');
    assumptions.push('radius-from-mass');
  }
  if (!(m > 0) && r > 0 && GAP_POLICY.allowEstimate) {
    m = estimateMassFromRadius(r);
    mTier = TIERS.assumed;
    massProv = 'R-estimate';
    gaps.push('mass');
    assumptions.push('mass-from-radius');
  }

  const dens = densityFromRm(m, r);
  const grav = gravityFromRm(m, r);
  const vesc = escapeVelocity(m, r);

  let e = seed.e;
  let eTier = TIERS.measured;
  if (e == null || !Number.isFinite(e)) {
    e = GAP_POLICY.defaultEcc;
    eTier = TIERS.assumed;
    assumptions.push('e=0');
  }

  let obl = seed.obl;
  let oblTier = seed.c === 'sol' || seed.c === 'moons' ? TIERS.measured : TIERS.assumed;
  if (obl == null || !Number.isFinite(obl)) {
    obl = GAP_POLICY.defaultOblDeg;
    oblTier = TIERS.assumed;
    assumptions.push('obliquity-default');
  }

  const teff = host?.teff ?? seed.teff ?? null;
  const stRad = host?.radius ?? seed.stRad ?? null;
  const stMass = host?.mass ?? seed.stMass ?? (teff > 0 ? estimateStellarMass(teff) : null);
  const stLum = host
    ? luminosityFromRT(host.radius, host.teff)
    : (teff > 0 && stRad > 0 ? luminosityFromRT(stRad, teff) : null);

  let a = seed.a;
  let P = seed.P;
  if (!(a > 0) && P > 0 && stMass > 0) {
    a = aFromPeriod(P, stMass);
    assumptions.push('a-from-Kepler');
  }
  if (!(P > 0) && a > 0 && stMass > 0) {
    P = periodFromAM(a, stMass);
    assumptions.push('P-from-Kepler');
  }

  let S = seed.S;
  let STier = TIERS.measured;
  if (stLum != null && a > 0) {
    const derived = insolationFromLa(stLum, a);
    if (!(S > 0) || Math.abs(Math.log10((S || 1) / (derived || 1))) > 0.5) {
      // Prefer derived when seed S missing or wildly off for free-floaters etc.
      if (!(S > 0)) {
        S = derived;
        STier = TIERS.derived;
      }
    }
    if (!(S > 0)) {
      S = derived;
      STier = TIERS.derived;
    }
  }
  if (!(S >= 0)) {
    S = 0;
    STier = TIERS.assumed;
    assumptions.push('S=0');
  }

  const albKey = ALBEDO[name] ?? ALBEDO[primary];
  let albedo = seed.albedo ?? albKey;
  let albTier = albKey != null ? TIERS.measured : TIERS.assumed;
  if (albedo == null) {
    albedo = GAP_POLICY.defaultAlbedo;
    albTier = TIERS.assumed;
    assumptions.push('albedo=0.3');
  }

  let teq = seed.teq;
  let teqTier = TIERS.measured;
  const teqDerived = teqFromInsolAlbedo(S, albedo);
  if (!(teq > 0)) {
    teq = teqDerived;
    teqTier = TIERS.derived;
  }

  const pressKey = PRESSURE[name] ?? PRESSURE[primary];
  let press = seed.press ?? pressKey;
  let pressTier = pressKey !== undefined ? TIERS.measured : TIERS.missing;
  if (press === undefined) press = null;

  let rot = seed.rot;
  let rotTier = TIERS.measured;
  let tidallyLocked = false;
  if (rot === 'lock' || rot === 'sync') {
    tidallyLocked = true;
    rot = P > 0 ? P * 24 : 40 * 24; // hours ≈ orbital period
    rotTier = TIERS.assumed;
    assumptions.push('sync-rotation');
  } else if (rot == null && a > 0 && stMass > 0 && r > 0 && m > 0) {
    const age = host?.ageGyr ?? 5;
    if (isTidallyLocked(a, stMass, r, m, age)) {
      tidallyLocked = true;
      rot = P > 0 ? P * 24 : 40 * 24;
      rotTier = TIERS.assumed;
      assumptions.push('lock-from-timescale');
    }
  }

  const contested = CONTESTED.find((c) => c.match.test(name));
  const confidence = seed.confidence
    || (contested ? contested.status : 'confirmed');

  const synthetic = seed.synthetic === true;
  const members = splitMembers(name);
  const moonParent = MOON_PARENTS[name] || MOON_PARENTS[primary] || null;
  const freeFloater = (a == null || a === 0) && (P == null || P === 0)
    && /pso |wise |simp |ots 44|ogle-2016|free/.test(name.toLowerCase());
  if (freeFloater) {
    a = 0;
    P = 0;
  }

  const distPc = seed.distPc ?? DIST_PC[name] ?? DIST_PC[primary] ?? host?.distPc ?? null;
  const ageGyr = seed.ageGyr ?? AGE_GYR[name] ?? AGE_GYR[primary] ?? host?.ageGyr ?? null;
  const disc = discoveryGuess(name, seed.c);
  const gasesKnown = GASES[name] || GASES[primary] || null;
  const observed = OBSERVED_ATMO[name] || OBSERVED_ATMO[primary] || null;

  const comp = compositionFromDensity(dens, r);
  const valley = radiusValleySide(r);
  const klass = massClass(m);
  const interior = interiorFromComposition(comp, dens, r, m, teq);
  const relief = reliefFromGravity(grav);
  const nonHydro = isNonHydrostatic(r);
  const mu = meanMolecularWeight(gasesKnown || {}, comp.envelope);
  const scaleH = scaleHeightKm(teq, grav, mu);
  const xuv = integratedXuvDose({
    teff, aAu: moonParent ? moonParent.aPlanetAu : a, ageGyr: ageGyr || 5, lum: stLum,
  });
  const retain = retainsAtmosphere({ vescKmS: vesc, teqK: teq, xuvDose: xuv, pressBar: press });
  const shore = cosmicShoreline(S, vesc);
  const roche = rocheLimitAu(stMass, dens);
  const parentMass = moonParent?.parentMass ?? (stMass > 0 ? stMass * 332946 : 1);
  const tideHeat = tidalHeatFluxWm2({
    rEarth: r, e, Pdays: P, dens, parentMassEarth: parentMass,
  });
  const radio = radiogenicHeat(ageGyr, m);
  const intern = internalHeatFraction(name, r, teq);
  const redist = redistributionGuess({
    pressBar: press, envelope: comp.envelope, airless: press === 0,
  });
  const dn = tidallyLocked ? daysideNightside(teq, redist) : { dayside: teq, nightside: teq, redistribution: 1 };
  const ghK = greenhouseKelvin(gasesKnown || {}, press);
  const tSurf = teq + ghK + (intern * teq * 0.15);
  const res = spinOrbitResonance(name, e);
  const pdot = PDOT[name] || PDOT[primary];
  const decayYr = pdot ? orbitalDecayLifetimeYr(P, pdot) : null;
  const obs = observabilityScore({ rEarth: r, stRad, scaleH, distPc, teqK: teq });
  const snow = snowLineAu(stLum);
  const wdWin = /wd |white dwarf/i.test(name) || seed.c === 'dark' && /wd /i.test(name)
    ? whiteDwarfHzWindow(teff, a) : null;
  const flare = flareRateFromAge(teff, ageGyr);

  const record = {
    schema: SCHEMA_VERSION,
    key,
    name,
    primary,
    members: members.length > 1 ? members : [primary],
    category: seed.c || seed.category || 'temperate',
    synthetic,
    confidence,
    contested: contested ? { status: contested.status, note: contested.note } : null,
    note: seed.note || '',
    hostId,
    host: host ? { ...host, lum: luminosityFromRT(host.radius, host.teff) } : null,
    radius: field(r, rTier, UNITS.radius, { source: opts.source || 'seed' }),
    mass: field(m, mTier, massProv === 'Msini' ? UNITS.msini : UNITS.mass, {
      source: opts.source || 'seed',
      note: massProv === 'Msini' ? 'minimum mass M sin i' : massProv === 'Model' ? 'evolutionary-model mass' : null,
    }),
    massProv,
    a: field(freeFloater ? 0 : a, freeFloater ? TIERS.measured : TIERS.measured, UNITS.a, {
      source: opts.source || 'seed',
      note: freeFloater ? 'no orbit — free-floating' : moonParent ? `planetocentric about ${moonParent.parent}` : null,
    }),
    P: field(freeFloater ? 0 : P, TIERS.measured, UNITS.P, { source: opts.source || 'seed' }),
    e: field(e, eTier, UNITS.e),
    obl: field(obl, oblTier, UNITS.obl, {
      note: oblTier === TIERS.assumed ? 'unmeasured for exoplanets' : null,
    }),
    rot: field(rot, rotTier, UNITS.rot),
    S: field(S, STier, UNITS.S),
    teq: field(teq, teqTier, UNITS.teq),
    teqDerived: field(teqDerived, TIERS.derived, UNITS.teq, { source: 'S,A' }),
    tSurf: field(tSurf, TIERS.derived, UNITS.teq, { source: 'teq+greenhouse+internal' }),
    albedo: field(albedo, albTier, UNITS.albedo),
    press: field(press, pressTier, UNITS.press, {
      note: press === 0 ? 'measured absent or airless' : press == null ? 'no surface / unknown' : null,
    }),
    density: field(dens, TIERS.derived, UNITS.density, { source: 'M,R' }),
    gravity: field(grav, TIERS.derived, UNITS.gravity, { source: 'M,R' }),
    escape: field(vesc, TIERS.derived, UNITS.escape, { source: 'M,R' }),
    teff: field(teff, host ? TIERS.measured : TIERS.measured, UNITS.teff),
    stMass: field(stMass, host ? TIERS.measured : TIERS.assumed, UNITS.stMass),
    stRad: field(stRad, host ? TIERS.measured : TIERS.assumed, UNITS.stRad),
    stLum: field(stLum, TIERS.derived, UNITS.stLum, { source: 'R,Teff' }),
    distPc: field(distPc, distPc != null ? TIERS.measured : TIERS.missing, UNITS.distPc),
    ageGyr: field(ageGyr, ageGyr != null ? TIERS.measured : TIERS.missing, UNITS.ageGyr),
    tidallyLocked,
    gaps,
    assumptions,
    composition: comp,
    valley,
    massClass: klass,
    interior,
    relief,
    nonHydrostatic: nonHydro,
    mu: field(mu, TIERS.derived, UNITS.mu),
    scaleH: field(scaleH, TIERS.derived, UNITS.scaleH, { source: 'kT/μg' }),
    xuv: field(xuv, TIERS.derived, UNITS.xuv, { source: 'age,teff,a' }),
    retain,
    shoreline: field(shore, TIERS.derived, '', { source: 'S / vesc^4' }),
    rocheAu: field(roche, TIERS.derived, UNITS.a),
    tidalHeatWm2: field(tideHeat, TIERS.derived, 'W/m²'),
    radiogenic: field(radio, TIERS.derived, 'Earth=1'),
    internalHeat: intern,
    daysideK: field(dn.dayside, TIERS.derived, UNITS.teq),
    nightsideK: field(dn.nightside, TIERS.derived, UNITS.teq),
    redistribution: redist,
    greenhouseK: field(ghK, TIERS.derived, 'K'),
    spinOrbit: res,
    decayYr: field(decayYr, TIERS.derived, 'yr'),
    observability: field(obs, TIERS.derived, ''),
    densityPhrase: densityLabel(dens),
    snowLineAu: field(snow, TIERS.derived, UNITS.a),
    wdWindow: wdWin,
    flareRate: flare,
    moonParent,
    gases: gasesKnown,
    atmosphereState: press === 0 ? 'measured-absent'
      : gasesKnown ? 'measured'
        : observed?.result || (press == null ? 'unmeasured' : 'assumed'),
    observed,
    discovery: { method: seed.method || disc.method, year: seed.year || disc.year },
    provenance: {
      seed: true,
      archive: !!opts.archive,
      queryDate: opts.queryDate || null,
      citation: opts.archive ? ARCHIVE_CITATION : 'Hand seed in scripts/exoparams.mjs — cross-check before treating as authoritative.',
      solarSystemSource: seed.c === 'sol' ? 'JPL planetary fact sheets / SSD' : null,
      moonSource: seed.c === 'moons' ? 'mission papers + JPL' : null,
    },
  };

  if (Number.isFinite(rot) && Number.isFinite(P) && P !== 0) {
    let solH = solarDayHours(rot, P);
    if (res.p === 3 && P > 0) solH = P * 24 * res.solarDayFactor;
    record.solarDay = field(solH, TIERS.derived, 'h', { source: 'rot,P' });
  }

  return record;
}

function estimateStellarMass(teff) {
  // Very rough main-sequence mass from Teff
  if (teff < 2800) return 0.1;
  if (teff < 3500) return 0.3;
  if (teff < 4500) return 0.6;
  if (teff < 5500) return 0.85;
  if (teff < 6500) return 1.05;
  if (teff < 8000) return 1.5;
  return 2.2;
}

/**
 * Apply a WorldRecord onto a playable ruleset (mutates rule).
 * Record is authoritative for physical quantities; visual templates remain.
 */
export function applyRecordToRule(rule, record) {
  if (!rule || !record) return rule;
  rule.worldRecord = record;
  rule.paramsKey = record.key;
  rule.semiMajorAu = val(record.a) ?? rule.semiMajorAu;
  rule.orbitalPeriodDays = val(record.P) ?? rule.orbitalPeriodDays;
  rule.eccentricity = val(record.e) ?? rule.eccentricity ?? 0;

  const oblDeg = val(record.obl);
  if (Number.isFinite(oblDeg)) rule.obliquity = (oblDeg * Math.PI) / 180;

  const rotH = val(record.rot);
  if (Number.isFinite(rotH)) {
    // ruleset.rotationPeriod is in Earth-days (1 = 24 h)
    rule.rotationPeriod = rotH / 24;
  }

  const S = val(record.S);
  if (Number.isFinite(S)) {
    rule.solarTrue = S;
    // Span the real range — KELT-9 is ~44,000. Climate tick uses a softer cap.
    rule.solar = Math.min(80, Math.max(0, S > 80 ? 80 : S));
  }

  const grav = val(record.gravity);
  if (Number.isFinite(grav)) {
    rule.gravity = grav; // derived, read-only — no authored override
    rule.gravityLocked = true;
  }

  const teq = val(record.teq);
  if (Number.isFinite(teq)) {
    rule.teqK = teq;
    rule.tSurfK = val(record.tSurf) ?? teq;
    rule.freeze = freezeFromTeq(teq);
  }

  const press = val(record.press);
  if (press != null && Number.isFinite(press)) {
    rule.surfacePressureBar = press;
    if (press <= 0) {
      rule.airless = true;
      rule.atmoStrength = 0.08;
    } else {
      rule.airless = false;
      rule.atmoStrength = Math.min(2.2, Math.max(0.1, 0.35 + Math.log10(press + 1e-6) * 0.35 + 0.65));
    }
  } else if (record.atmosphereState === 'unmeasured') {
    rule.atmosphereUnknown = true;
  }

  if (record.gases) {
    rule.gases = { ...rule.gases, ...record.gases };
  } else if (record.composition?.envelope > 0.3) {
    rule.gases = { N2: 0, O2: 0, CO2: 0.02, CH4: 0.002, H2O: 0.01, dust: 0, sulphate: 0, H2: 0.9 };
    rule.envelope = true;
  }

  const alb = val(record.albedo);
  if (Number.isFinite(alb)) rule.albedo = alb;

  if (record.tidallyLocked) {
    rule.tidallyLocked = true;
    if (record.spinOrbit?.p === 1) rule.obliquity = 0;
  }
  if (record.spinOrbit?.p === 3) {
    rule.tidallyLocked = false; // 3:2 is not 1:1
    rule.spinOrbit = record.spinOrbit;
  }

  if (record.interior) {
    rule.interior = { ...record.interior };
    rule.coreMassFrac = record.interior.coreMassFrac;
    rule.coreRadiusFrac = record.interior.coreRadiusFrac;
    rule.heatFlow = record.interior.heatFlow;
    rule.lidMode = record.interior.lidMode;
  }
  if (Number.isFinite(record.relief)) rule.relief = record.relief;
  if (record.nonHydrostatic) rule.nonHydrostatic = true;

  const th = val(record.tidalHeatWm2);
  if (Number.isFinite(th)) rule.tidalHeat = Math.min(2.5, th / 2); // Io ~2 W/m² → ~1

  rule.radiusEarth = val(record.radius);
  rule.massEarth = val(record.mass);
  rule.densityGcm3 = val(record.density);
  rule.escapeKmS = val(record.escape);
  rule.scaleHeightKm = val(record.scaleH);
  rule.mu = val(record.mu);
  rule.xuvDose = val(record.xuv);
  rule.retain = record.retain;
  rule.daysideK = val(record.daysideK);
  rule.nightsideK = val(record.nightsideK);
  rule.greenhouseK = val(record.greenhouseK);
  rule.internalHeat = record.internalHeat || 0;
  rule.radiogenic = val(record.radiogenic);
  rule.observability = val(record.observability);
  rule.densityPhrase = record.densityPhrase;
  rule.composition = record.composition;
  rule.valley = record.valley;
  rule.massClass = record.massClass;
  rule.atmosphereState = record.atmosphereState;
  rule.observed = record.observed;
  rule.discovery = record.discovery;
  rule.distPc = val(record.distPc);
  rule.ageGyr = val(record.ageGyr);
  rule.orbitalPeriodDays = val(record.P) ?? rule.orbitalPeriodDays;
  rule.solarDayHours = val(record.solarDay);
  rule.moonParent = record.moonParent;
  rule.freeFloater = val(record.a) === 0 && val(record.P) === 0;
  rule.confidence = record.confidence;
  rule.contested = record.contested;
  rule.gaps = record.gaps;
  rule.assumptions = record.assumptions;
  rule.massProv = record.massProv;
  rule.synthetic = record.synthetic;
  rule.members = record.members;
  rule.heating = record.host?.heating;

  if (record.composition?.water > 0.25) {
    rule.totalWater = Math.max(rule.totalWater || 0, 0.9);
  }
  if (record.retain?.retain === false && record.atmosphereState !== 'measured') {
    rule.airless = true;
  }
  if (record.category === 'giant' || (val(record.radius) || 0) > 6) {
    rule.noSurface = press === null && (record.category === 'giant' || (val(record.radius) || 0) > 8);
  }
  if (record.observed?.result === 'no-thick-atmosphere') {
    rule.airless = true;
    rule.surfacePressureBar = 0;
  }

  return rule;
}

/** Coverage summary for one record. */
export function coverageOf(record) {
  const fields = ['radius', 'mass', 'a', 'P', 'e', 'obl', 'rot', 'S', 'teq', 'albedo', 'press', 'teff'];
  const out = { measured: 0, derived: 0, assumed: 0, missing: 0, fields: {} };
  for (const k of fields) {
    const f = record[k];
    const tier = f?.tier || TIERS.missing;
    out.fields[k] = tier;
    if (out[tier] != null) out[tier]++;
    else out.missing++;
  }
  return out;
}

/** Validate a record — returns list of problems. */
export function validateRecord(record) {
  const problems = [];
  if (!record || record.schema !== SCHEMA_VERSION) problems.push('bad-schema');
  if (!record.key) problems.push('no-key');
  if (record.synthetic) return problems;
  const r = val(record.radius);
  const m = val(record.mass);
  if (GAP_POLICY.requireRm && !(r > 0) && !(m > 0)) problems.push('missing-rm');
  if (r > 0 && m > 0) {
    const d = val(record.density);
    if (d != null && (d < 0.05 || d > 20)) problems.push(`density-outlier:${d?.toFixed?.(2)}`);
  }
  return problems;
}

/** Format a field for UI: "1.02 ±0.03 R⊕" or "—" for missing. */
export function formatField(f, digits = 2) {
  if (f == null || f.tier === TIERS.missing || f.v == null || !Number.isFinite(f.v)) return '—';
  const n = Math.abs(f.v) >= 100 ? f.v.toFixed(0) : f.v.toPrecision
    ? Number(f.v.toPrecision(digits + 1)).toString()
    : f.v.toFixed(digits);
  let s = n;
  if (f.err1 != null || f.err2 != null) {
    const e1 = f.err1 != null ? `+${f.err1}` : '';
    const e2 = f.err2 != null ? `${f.err2}` : '';
    s += ` ${e1}/${e2}`;
  }
  if (f.limit === 'upper') s = `< ${n}`;
  if (f.limit === 'lower') s = `> ${n}`;
  if (f.unit) s += ` ${f.unit}`;
  if (f.tier === TIERS.assumed) s += ' ~';
  if (f.tier === TIERS.derived) s += ' †';
  return s;
}

/** Panel day/tilt ranges informed by the record. */
export function panelRanges(record) {
  if (!record) {
    return {
      dayMin: 0.15, dayMax: 8, day: 1,
      tiltMin: 0, tiltMax: 90, tilt: 23,
      locked: false, retro: false, disabledTilt: false,
    };
  }
  const rotH = val(record.rot);
  const day = Number.isFinite(rotH) ? Math.abs(rotH) / 24 : 1;
  const obl = val(record.obl) ?? 0;
  const locked = !!record.tidallyLocked;
  const retro = Number.isFinite(rotH) && rotH < 0;
  // Per-world slider window around the measured value
  const dayMin = locked ? day : Math.max(0.05, day / 20);
  const dayMax = locked ? day : Math.min(400, Math.max(day * 8, 8));
  return {
    dayMin,
    dayMax,
    day: retro ? -day : day,
    tiltMin: 0,
    tiltMax: locked ? 0 : 180,
    tilt: locked ? 0 : obl,
    locked,
    retro,
    disabledTilt: locked,
    disabledDay: locked,
  };
}
