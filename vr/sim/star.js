/** Host star as a first-class object.
 *  Exoparams: host from record when available; regex fallback fixed (TRAPPIST). */

import {
  luminosityFromRT,
  spectralClassFromTeff,
  stellarLifetimeGyr,
  habitableZoneAu,
  HOSTS,
} from './worldRecord.js';
import { blackbodyRgb, flareRateFromAge } from './exophysics.js';

/** Blackbody peak wavelength (nm) — Wien. measured */
export function wienPeakNm(teff) {
  return 2.897e6 / Math.max(1000, teff || 1000);
}

/** Rough photosynthetic photon fraction of blackbody (400–750 nm). fitted */
export function photonUsableFraction(teff) {
  if (!(teff > 0)) return 0;
  const T = Math.max(2000, Math.min(12000, teff));
  if (T < 2800) return 0.12;
  if (T < 3500) return 0.28;
  if (T < 4500) return 0.45;
  if (T < 6000) return 0.55;
  if (T < 7500) return 0.5;
  return 0.4;
}

/**
 * Integrate Planck B_λ fraction in 400–750 nm (photosynthetic band).
 * Cheap Riemann sum in wavelength space — replaces the lookup table when desired.
 */
export function photonUsableFractionPlanck(teff, n = 80) {
  if (!(teff > 500)) return 0;
  const h = 6.626e-34, c = 2.998e8, k = 1.381e-23;
  const planck = (nm) => {
    const lam = nm * 1e-9;
    const x = (h * c) / (lam * k * teff);
    if (x > 700) return 0;
    return (2 * h * c * c) / (lam ** 5 * (Math.exp(Math.min(x, 100)) - 1));
  };
  let band = 0, total = 0;
  const lo = 200, hi = 3000, d = (hi - lo) / n;
  for (let i = 0; i < n; i++) {
    const nm = lo + (i + 0.5) * d;
    const B = planck(nm);
    total += B;
    if (nm >= 400 && nm <= 750) band += B;
  }
  return total > 0 ? band / total : 0;
}

/** RGB sky tint from stellar Teff (very rough). invented for legibility */
export function skyFromTeff(teff) {
  if (!(teff > 0)) return [0.008, 0.008, 0.015];
  const t = (teff - 2500) / 7500;
  const r = 0.02 + (1 - t) * 0.08;
  const g = 0.03 + t * 0.04;
  const b = 0.04 + t * 0.1;
  return [r, g, b];
}

/** Angular diameter of star from planet (degrees). measured geometry */
export function starAngularDeg(starRadiusSolar, aAu) {
  return 0.533 * (starRadiusSolar || 1) / Math.max(0.01, aAu || 1);
}

export function makeStar(opts = {}) {
  const teff = opts.teff ?? 5772;
  const mass = opts.mass ?? 1;
  const radius = opts.radius ?? 1;
  const ageGyr = opts.ageGyr ?? 4.6;
  // Always derive luminosity from R,T when not explicitly forced — avoids made-up lum.
  const lum = opts.forceLum != null
    ? opts.forceLum
    : (opts.lum != null && opts.keepLum)
      ? opts.lum
      : luminosityFromRT(radius, teff);
  const flareRate = opts.flareRate != null
    ? opts.flareRate
    : opts.flare ? 0.55
      : opts.quiet ? 0.01
        : flareRateFromAge(teff, ageGyr);
  return {
    id: opts.id || null,
    name: opts.name || null,
    teff,
    mass,
    radius,
    ageGyr,
    lum,
    met: opts.met ?? null,
    distPc: opts.distPc ?? null,
    spectral: opts.spectral || spectralClassFromTeff(teff),
    lifetimeGyr: stellarLifetimeGyr(mass),
    photonFrac: teff > 0 ? photonUsableFractionPlanck(teff) : 0,
    photonFracPlanck: teff > 0 ? photonUsableFractionPlanck(teff) : 0,
    peakNm: teff > 0 ? wienPeakNm(teff) : Infinity,
    sky: blackbodyRgb(teff),
    flareRate,
    xuv: opts.xuv ?? (teff > 0 && teff < 4000 ? 1.8 : teff > 0 ? 1 : 0),
    hz: habitableZoneAu(lum, teff),
    heating: opts.heating || 'photon', // 'photon' | 'particle' | 'none' | 'infrared'
  };
}

/** Sol. */
export const SOL = makeStar({
  id: 'sol', name: 'Sun', teff: 5772, mass: 1, radius: 1, ageGyr: 4.6, met: 0, distPc: 0, spectral: 'G2V',
});

/** Build star from a shared HOSTS entry or world-record host block. */
export function starFromHost(host) {
  if (!host) return SOL;
  if (!(host.teff > 0) && !(host.mass > 0)) {
    return makeStar({
      id: host.id, name: host.name, teff: 0, mass: host.mass || 0, radius: host.radius || 0,
      ageGyr: host.ageGyr ?? 5, forceLum: 0, heating: 'none',
    });
  }
  return makeStar({
    id: host.id,
    name: host.name,
    teff: host.teff,
    mass: host.mass,
    radius: host.radius,
    ageGyr: host.ageGyr,
    met: host.met,
    distPc: host.distPc,
    spectral: host.spectral,
    flare: host.flare,
    quiet: host.quiet,
    heating: host.heating,
  });
}

/**
 * Attach star + derived insolation to a ruleset.
 * When `physical` is true, do not soft-clamp solar (caller stores solarTrue separately).
 */
export function applyStarToRule(rule, star, aAu = 1, opts = {}) {
  rule.star = star;
  const insol = (star.lum || 0) / Math.max(1e-8, aAu * aAu);
  rule.solarTrue = insol;
  if (opts.physical) {
    rule.solar = insol;
  } else {
    // Soft clamp for playability — true extremes still extreme
    rule.solar = Math.min(50, Math.max(0, insol));
  }
  rule.sky = star.sky.slice();
  rule.photonUsable = star.photonFrac;
  rule.starAngDeg = aAu > 0 ? starAngularDeg(star.radius, aAu) : 0;
  rule.flareRate = star.flareRate;
  rule.hz = star.hz;
  return rule;
}

/** Guess Teff from catalogue tags / class — fallback when no world record. */
export function starFromCatalogueItem(item) {
  const needs = new Set(item.p || []);
  const name = `${item.b || ''} ${item.t || ''}`.toLowerCase();
  if (needs.has('nostar') || needs.has('ffp')) {
    return makeStar({ teff: 0, mass: 0, radius: 0, forceLum: 0, ageGyr: 5, heating: 'none' });
  }
  if (needs.has('wd') || name.includes('white dwarf')) {
    return makeStar({ teff: 8000, mass: 0.6, radius: 0.01, ageGyr: 2, heating: 'photon' });
  }
  if (needs.has('bd') || name.includes('brown dwarf')) {
    return makeStar({ teff: 1200, mass: 0.04, radius: 0.1, ageGyr: 1, heating: 'infrared' });
  }
  if (needs.has('pulsar') || name.includes('psr ')) {
    return makeStar({
      teff: 1e6, mass: 1.4, radius: 1e-5, forceLum: 0.01, ageGyr: 0.1, heating: 'particle',
    });
  }
  // Fixed: was /trapist/ (one P) — never matched TRAPPIST by name.
  if (needs.has('ucd') || needs.has('mdwarf') || /trappist|proxima|gj |gliese/.test(name)) {
    if (name.includes('trappist')) return starFromHost(HOSTS.trappist1);
    if (name.includes('proxima')) return starFromHost(HOSTS.proxima);
    return makeStar({ teff: 2566, mass: 0.09, radius: 0.12, ageGyr: 7 });
  }
  if (item.c === 'sol' || name.includes('earth') || name.includes('mars') || name.includes('venus')) {
    return SOL;
  }
  if (item.c === 'furnace') return makeStar({ teff: 6200, mass: 1.2, radius: 1.3, ageGyr: 2 });
  if (item.c === 'dark') return makeStar({ teff: 3200, mass: 0.4, radius: 0.45, ageGyr: 5 });
  return makeStar({ teff: 5200, mass: 0.9, radius: 0.9, ageGyr: 4 });
}

/** Prefer world-record host, else catalogue guess. */
export function starForWorld(item, record) {
  if (record?.host) return starFromHost(record.host);
  if (record && !(record.teff?.v > 0) && (record.S?.v === 0 || record.category === 'dark')) {
    const needs = new Set(item?.p || []);
    if (needs.has('pulsar') || /psr /i.test(record.name || '')) {
      return makeStar({ teff: 1e6, mass: 1.4, radius: 1e-5, forceLum: 0.01, heating: 'particle' });
    }
    return makeStar({ teff: 0, mass: 0, radius: 0, forceLum: 0, heating: 'none' });
  }
  if (record?.teff?.v > 0) {
    return makeStar({
      teff: record.teff.v,
      mass: record.stMass?.v ?? undefined,
      radius: record.stRad?.v ?? undefined,
      ageGyr: record.host?.ageGyr,
    });
  }
  return starFromCatalogueItem(item);
}
