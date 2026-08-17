/** Derived exoplanet physics — composition, XUV, tides, atmospheres, class.
 *  Consumed by worldRecord.js; keeps the record module from growing unbounded. */

import { clamp } from '../math.js';

const R_EARTH_M = 6.371e6;
const M_EARTH_KG = 5.972e24;
const R_JUP_RE = 11.21;
const M_JUP_ME = 317.8;
const AU_M = 1.496e11;
const M_SUN_KG = 1.989e30;

/** Iron / rock / water / H–He composition brackets from bulk density (g/cm³). */
export function compositionFromDensity(dens, rEarth) {
  if (!(dens > 0) || !(rEarth > 0)) {
    return { iron: 0.3, silicate: 0.7, water: 0, envelope: 0, label: 'unknown' };
  }
  if (rEarth > 8 || dens < 0.4) {
    const env = clamp(1 - dens / 1.3, 0.6, 0.99);
    return { iron: 0.02, silicate: 0.05, water: 0.03, envelope: env, label: 'H/He envelope' };
  }
  if (rEarth > 2.4 && dens < 2.5) {
    const env = clamp((2.5 - dens) / 2.5, 0.05, 0.4);
    const water = clamp(0.35 - env, 0.1, 0.5);
    return { iron: 0.1, silicate: 1 - env - water - 0.1, water, envelope: env, label: 'sub-Neptune' };
  }
  if (dens > 8) {
    const iron = clamp((dens - 5.5) / 7, 0.5, 0.95);
    return { iron, silicate: 1 - iron, water: 0, envelope: 0, label: 'iron-rich' };
  }
  if (dens < 3.2 && rEarth < 2.2) {
    const water = clamp((3.5 - dens) / 3, 0.15, 0.7);
    return { iron: 0.15, silicate: 1 - water - 0.15, water, envelope: 0, label: 'water-rich' };
  }
  // Earth-like rock mix, iron rises with density
  const iron = clamp(0.15 + (dens - 4) * 0.12, 0.08, 0.55);
  const water = dens < 4.5 ? clamp((4.5 - dens) * 0.08, 0, 0.2) : 0;
  return { iron, silicate: clamp(1 - iron - water, 0.2, 0.85), water, envelope: 0, label: 'rocky' };
}

/** Radius-valley side: rocky floor vs envelope. */
export function radiusValleySide(rEarth) {
  if (!(rEarth > 0)) return 'unknown';
  if (rEarth < 1.5) return 'super-Earth';
  if (rEarth < 1.8) return 'valley';
  if (rEarth < 4) return 'sub-Neptune';
  if (rEarth < 8) return 'Neptune';
  return 'giant';
}

/** Planet / brown-dwarf / star boundary from mass (M⊕). */
export function massClass(mEarth) {
  if (!(mEarth > 0)) return { kind: 'unknown', note: 'no mass' };
  const mj = mEarth / M_JUP_ME;
  if (mj < 13) return { kind: 'planet', mj, note: 'below deuterium burning' };
  if (mj < 80) return { kind: 'brown-dwarf', mj, note: 'deuterium-burning; radius-degenerate' };
  return { kind: 'star', mj, note: 'hydrogen-burning' };
}

/** Interior from density rather than a name. */
export function interiorFromComposition(comp, dens, rEarth, mEarth, teqK = 255) {
  if (comp.envelope > 0.4 || rEarth > 8) {
    return {
      coreMassFrac: 0.05, coreRadiusFrac: 0.15, heatFlow: 1.6, conductivity: 1.8,
      lidMode: 'none', note: 'Metallic-H dynamo · no rocky plates', derived: true,
    };
  }
  if (comp.water > 0.25 && rEarth < 3) {
    return {
      coreMassFrac: 0.08, coreRadiusFrac: 0.25, heatFlow: 0.2, conductivity: 0.15,
      lidMode: 'ice', note: 'Rock kernel under ice/ocean · little dynamo', derived: true,
    };
  }
  const coreMass = clamp(comp.iron * 0.95, 0.04, 0.85);
  const coreRadius = clamp(Math.pow(coreMass, 0.33) * 0.7, 0.15, 0.88);
  const heat = clamp(0.25 + (mEarth || 1) * 0.35 + (teqK > 1500 ? 0.4 : 0), 0.05, 2.2);
  const cond = clamp(coreMass * 1.1, 0.05, 1.6);
  const lid = heat > 0.55 && rEarth > 0.4 ? 'mobile' : 'stagnant';
  return {
    coreMassFrac: coreMass,
    coreRadiusFrac: coreRadius,
    heatFlow: heat,
    conductivity: cond,
    lidMode: lid,
    note: `From density ${dens?.toFixed?.(2) || '?'} g/cm³ · ${comp.label} · ${lid} lid`,
    derived: true,
  };
}

/** Relief ceiling scales inversely with gravity (Olympus Mons on 0.38 g). */
export function reliefFromGravity(gEarth) {
  if (!(gEarth > 0)) return 0.05;
  return clamp(0.028 * (1 / Math.pow(gEarth, 0.7)), 0.006, 0.14);
}

/** Non-hydrostatic if smaller than ~400 km (0.063 R⊕). */
export function isNonHydrostatic(rEarth) {
  return rEarth > 0 && rEarth < 0.063;
}

/** Scale height H = kT / μg  in km. μ in g/mol, T in K, g in Earth-g. */
export function scaleHeightKm(teqK, gEarth, mu = 28) {
  if (!(teqK > 0) || !(gEarth > 0)) return null;
  const k = 1.381e-23;
  const m = (mu * 1.661e-27);
  const g = gEarth * 9.81;
  return (k * teqK) / (m * g) / 1000;
}

/** Mean molecular weight from mixing ratios. */
export function meanMolecularWeight(gases = {}, envelopeFrac = 0) {
  if (envelopeFrac > 0.2) return 2.3;
  const keys = { H2: 2, He: 4, N2: 28, O2: 32, CO2: 44, CH4: 16, H2O: 18 };
  let w = 0, s = 0;
  for (const [k, mu] of Object.entries(keys)) {
    const x = gases[k] || 0;
    w += x * mu; s += x;
  }
  return s > 0.05 ? w / s : 28;
}

/** XUV saturation lifetime (Gyr) — M dwarfs stay high for hundreds of Myr. */
export function xuvSaturationGyr(teff) {
  if (!(teff > 0)) return 0;
  if (teff < 2800) return 0.7;
  if (teff < 3500) return 0.4;
  if (teff < 4500) return 0.15;
  if (teff < 6000) return 0.05;
  return 0.02;
}

/** Integrated XUV dose in Earth-atmosphere-stripping units (~1 = strip 1 bar Earth air). */
export function integratedXuvDose({ teff, aAu, ageGyr, lum }) {
  if (!(aAu > 0) || !(teff > 0)) return 0;
  const sat = xuvSaturationGyr(teff);
  const age = ageGyr || 5;
  const satYears = Math.min(age, sat);
  const later = Math.max(0, age - sat);
  // Saturated XUV ~ 100–1000× modern Sun at 1 AU for M dwarfs; scale as L / a²
  const S = (lum || 1) / (aAu * aAu);
  const satRate = (teff < 4000 ? 400 : 40) * S;
  const laterRate = (teff < 4000 ? 8 : 1) * S;
  return satRate * satYears + laterRate * later;
}

/** Jeans / hydrodynamic retention: true if a substantial atmosphere is expected. */
export function retainsAtmosphere({ vescKmS, teqK, xuvDose, pressBar }) {
  if (pressBar === 0) return { retain: false, why: 'measured-absent' };
  if (pressBar == null && (vescKmS == null || teqK == null)) {
    return { retain: null, why: 'unmeasured' };
  }
  const T = teqK || 255;
  const v = vescKmS || 11;
  // Cosmic shoreline-ish: I_∝ / v_esc^4
  const shoreline = Math.pow(v / 11.2, 4) / Math.max(0.01, (T / 255));
  const stripped = (xuvDose || 0) > 30 && v < 15;
  const jeans = T / (v * v) > 8; // hot + low escape
  if (stripped || jeans || shoreline < 0.15) {
    return { retain: false, why: stripped ? 'xuv-stripped' : 'jeans', shoreline };
  }
  return { retain: true, why: 'bound', shoreline };
}

/** Cosmic shoreline parameter: insolation vs v_esc^4. Atmospheres above ~1. */
export function cosmicShoreline(S, vescKmS) {
  if (!(vescKmS > 0)) return null;
  return (S || 0) / Math.pow(vescKmS / 11.2, 4);
}

/** Roche limit in AU for a planet around a star (fluid, density-based). */
export function rocheLimitAu(stMassSolar, densGcm3) {
  if (!(stMassSolar > 0) || !(densGcm3 > 0)) return null;
  // a_R ≈ 2.44 R★ * (ρ★/ρp)^(1/3); use solar mean density 1.41 g/cm³, R★ from mass^0.8
  const rStarAu = 0.00465 * Math.pow(stMassSolar, 0.8);
  return 2.44 * rStarAu * Math.pow(1.41 / densGcm3, 1 / 3);
}

/** Tidal heating flux (W/m²) — Io-normalised order-of-magnitude.
 *  Ė ∝ (R^5 e² n^5) / Q ; n = 2π/P. */
export function tidalHeatFluxWm2({ rEarth, e, Pdays, dens, parentMassEarth = 317.8 }) {
  if (!(rEarth > 0) || !(Pdays > 0) || !(e > 0)) return 0;
  const n = (2 * Math.PI) / (Pdays * 86400);
  const R = rEarth * R_EARTH_M;
  const rho = (dens || 3) * 1000;
  const Mp = parentMassEarth * M_EARTH_KG;
  const k2Q = 0.015; // Io-ish dissipation
  // Peale–Cassen–Reynolds sketch
  const flux = (21 / 2) * k2Q * (Mp * Mp) * Math.pow(R, 5) * (n ** 5) * (e * e)
    / (Math.pow(rho, 1) * 4 * Math.PI * R * R);
  // Normalise so Io (~e=0.004, P=1.77d, R=0.286, parent=Jupiter) ~ 2 W/m²
  return Math.max(0, flux * 2e-28);
}

/** Radiogenic heat vs Earth today. ²³⁸U, ²³²Th, ⁴⁰K half-lives. */
export function radiogenicHeat(ageGyr, mEarth = 1) {
  const now = 4.5;
  const t = ageGyr ?? now;
  // Heat production ~ e^(λ(now-t)); older worlds cooler
  const u238 = Math.exp(-Math.LOG2E * (now - t) / 4.47);
  const th232 = Math.exp(-Math.LOG2E * (now - t) / 14.0);
  const k40 = Math.exp(-Math.LOG2E * (now - t) / 1.25);
  const mix = 0.4 * u238 + 0.4 * th232 + 0.2 * k40;
  return mix * (mEarth || 1);
}

/** Internal heat as fraction of absorbed insolation. Giants emit more than they receive. */
export function internalHeatFraction(name, rEarth, teqK) {
  const n = (name || '').toLowerCase();
  if (n.includes('jupiter')) return 0.7;
  if (n.includes('saturn')) return 0.8;
  if (n.includes('neptune')) return 1.6;
  if (n.includes('uranus')) return 0.06;
  if (rEarth > 8 && teqK < 400) return 0.5;
  return 0;
}

/** Dayside / nightside brightness temperatures for a locked world. */
export function daysideNightside(teqK, redistribution = 0.3) {
  if (!(teqK > 0)) return { dayside: null, nightside: null, redistribution };
  const f = clamp(redistribution, 0, 1);
  // f=0 → dayside (2)^(1/4) hotter, nightside ~0; f=1 → both = teq
  const day = teqK * Math.pow(2 - f, 0.25);
  const night = teqK * Math.pow(Math.max(0.02, f), 0.25);
  return { dayside: day, nightside: night, redistribution: f };
}

/** Redistribution efficiency guess: bare rock ~0, thick H/He ~0.7. */
export function redistributionGuess({ pressBar, envelope, airless }) {
  if (airless || pressBar === 0) return 0;
  if (envelope > 0.2) return 0.65;
  if (pressBar == null) return 0.3;
  if (pressBar > 10) return 0.8;
  if (pressBar > 0.5) return 0.45;
  if (pressBar > 0.01) return 0.15;
  return 0.02;
}

/** Flare rate from gyrochronology-ish age + Teff. Young + cool = active. */
export function flareRateFromAge(teff, ageGyr) {
  if (!(teff > 0)) return 0;
  const age = ageGyr || 5;
  const cool = teff < 3800 ? 1 : teff < 5000 ? 0.25 : 0.05;
  const youth = age < 0.1 ? 4 : age < 1 ? 1.5 : age < 5 ? 1 : 0.4;
  return clamp(cool * youth * 0.25, 0, 1);
}

/** White-dwarf cooling: Teff drops, HZ moves in. Habitable window remaining (Gyr). */
export function whiteDwarfHzWindow(teff, aAu) {
  if (!(teff > 0) || !(aAu > 0)) return null;
  // Crude: L ∝ T^4 R^2 with R~0.01; HZ inner ~ sqrt(L)
  const lum = (0.01 ** 2) * Math.pow(teff / 5772, 4);
  const inner = Math.sqrt(lum / 1.1);
  const remaining = aAu < inner ? 0 : Math.max(0, (teff - 4000) / 8000 * 4);
  return { inner, remainingGyr: remaining, closing: remaining < 1 };
}

/** Circumbinary flux beat: two stars, period Pbin, planet P. Amplitude ~ 2 L1 L2 / (L1+L2)^2. */
export function circumbinaryBeat(L1, L2, PbinDays, PplanetDays, tDays) {
  const L = (L1 || 1) + (L2 || 0.5);
  const amp = 2 * (L1 || 1) * (L2 || 0.5) / (L * L);
  const phase = (2 * Math.PI * (tDays || 0)) / Math.max(0.1, PbinDays || 41);
  return 1 + amp * Math.cos(phase);
}

/** Binary insolation: sum of two L/a² terms. */
export function binaryInsolation(L1, a1, L2, a2) {
  const s1 = a1 > 0 ? (L1 || 0) / (a1 * a1) : 0;
  const s2 = a2 > 0 ? (L2 || 0) / (a2 * a2) : 0;
  return s1 + s2;
}

/** Mercury-style 3:2 spin–orbit: solar day = 2 P. */
export function spinOrbitResonance(name, e) {
  const n = (name || '').toLowerCase();
  if (n.includes('mercury')) return { p: 3, q: 2, solarDayFactor: 2 };
  if ((e || 0) > 0.2 && n.includes('lock')) return { p: 3, q: 2, solarDayFactor: 2 };
  return { p: 1, q: 1, solarDayFactor: 1 };
}

/** Remaining lifetime (yr) from measured P-dot (ms/yr) — WASP-12 b ~29 ms/yr. */
export function orbitalDecayLifetimeYr(Pdays, pdotMsPerYr) {
  if (!(Pdays > 0) || !(pdotMsPerYr > 0)) return null;
  const Pms = Pdays * 86400 * 1000;
  return (Pms / pdotMsPerYr) / 3; // inspiral ~ P / (3 |Ṗ|)
}

/** TSM-like observability: (Rp/R★)² * H * 10^(-m_J/5) sketch using distance. */
export function observabilityScore({ rEarth, stRad, scaleH, distPc, teqK }) {
  if (!(rEarth > 0) || !(stRad > 0) || !(distPc > 0)) return null;
  const depth = (rEarth * 0.009168 / stRad) ** 2;
  const H = scaleH || 10;
  const bright = 1 / Math.max(1, distPc);
  const hot = Math.sqrt(Math.max(100, teqK || 255) / 255);
  return depth * (H / 8) * bright * hot * 1e6;
}

/** Density compared to a reference phrase. */
export function densityLabel(dens) {
  if (!(dens > 0)) return '—';
  if (dens > 8) return `${dens.toFixed(2)} g/cm³ — iron-rich`;
  if (dens > 4.5) return `${dens.toFixed(2)} g/cm³ — Earth-like rock`;
  if (dens > 2.5) return `${dens.toFixed(2)} g/cm³ — rock + volatiles`;
  if (dens > 1.0) return `${dens.toFixed(2)} g/cm³ — ice / water-rich`;
  if (dens > 0.3) return `${dens.toFixed(2)} g/cm³ — envelope`;
  return `${dens.toFixed(2)} g/cm³ — mostly nothing`;
}

/** Greenhouse that still does something at 92 bar. Earth ~ +33 K, Venus hundreds. */
export function greenhouseKelvin(gases, pressBar, ghBias = 0) {
  const P = pressBar != null ? pressBar : (gases ? 1 : 0);
  if (!(P > 0)) return 0;
  const co2 = gases?.CO2 ?? 0;
  const ch4 = gases?.CH4 ?? 0;
  const h2o = gases?.H2O ?? 0;
  const dust = (gases?.dust || 0) + (gases?.sulphate || 0) * 2;
  const col = Math.log1p(P * 10);
  const gas = 12 * Math.log1p(co2 * 40) + 8 * Math.log1p(ch4 * 80) + 18 * h2o;
  return Math.max(0, (gas + ghBias * 80) * col * 0.55 - 4 * dust);
}

/** Mean-temp scalar (0–1.6) from kelvin, Earth 288 K → 0.5. */
export function tempScalarFromK(k) {
  if (!(k > 0)) return 0.3;
  return clamp(0.5 + (k - 288) / 160, 0.02, 1.6);
}

export function kelvinFromTempScalar(s) {
  return 288 + ((s ?? 0.5) - 0.5) * 160;
}

/** Snow-line AU in a young disk ≈ 2.7 * sqrt(L). */
export function snowLineAu(lumSolar) {
  return 2.7 * Math.sqrt(Math.max(0, lumSolar || 1));
}

/** Hill radius in AU. */
export function hillRadiusAu(aAu, mPlanet, mStar) {
  if (!(aAu > 0) || !(mPlanet > 0) || !(mStar > 0)) return null;
  return aAu * Math.pow(mPlanet / (3 * mStar * 332946), 1 / 3);
}

/** Crossing / Hill-violation check for siblings. */
export function orbitsStable(planets) {
  const bad = [];
  const sorted = planets.filter((p) => p.a > 0).slice().sort((a, b) => a.a - b.a);
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const peri = p.a * (1 - (p.e || 0));
    const ap = p.a * (1 + (p.e || 0));
    if (i > 0) {
      const prev = sorted[i - 1];
      const prevAp = prev.a * (1 + (prev.e || 0));
      if (peri < prevAp) bad.push(`${p.name} crosses ${prev.name}`);
    }
    const hill = hillRadiusAu(p.a, p.m, p.mStar || 1);
    if (hill && i > 0) {
      const sep = p.a - sorted[i - 1].a;
      if (sep < 3.5 * hill) bad.push(`${p.name} Hill-packed vs ${sorted[i - 1].name}`);
    }
    void ap;
  }
  return { ok: bad.length === 0, bad };
}

/** Parent planet for Solar System moons. */
export const MOON_PARENTS = {
  Luna: { parent: 'Earth', parentMass: 1, aPlanetAu: 1 },
  Io: { parent: 'Jupiter', parentMass: 317.8, aPlanetAu: 5.204 },
  Europa: { parent: 'Jupiter', parentMass: 317.8, aPlanetAu: 5.204 },
  Ganymede: { parent: 'Jupiter', parentMass: 317.8, aPlanetAu: 5.204 },
  Callisto: { parent: 'Jupiter', parentMass: 317.8, aPlanetAu: 5.204 },
  Titan: { parent: 'Saturn', parentMass: 95.16, aPlanetAu: 9.583 },
  Enceladus: { parent: 'Saturn', parentMass: 95.16, aPlanetAu: 9.583 },
  Iapetus: { parent: 'Saturn', parentMass: 95.16, aPlanetAu: 9.583 },
  Mimas: { parent: 'Saturn', parentMass: 95.16, aPlanetAu: 9.583 },
  'Rhea / Dione / Tethys / Hyperion': { parent: 'Saturn', parentMass: 95.16, aPlanetAu: 9.583 },
  Triton: { parent: 'Neptune', parentMass: 17.15, aPlanetAu: 30.07 },
  Miranda: { parent: 'Uranus', parentMass: 14.54, aPlanetAu: 19.19 },
  'Uranian moons': { parent: 'Uranus', parentMass: 14.54, aPlanetAu: 19.19 },
  Charon: { parent: 'Pluto', parentMass: 0.00218, aPlanetAu: 39.48 },
  'Phobos / Deimos': { parent: 'Mars', parentMass: 0.107, aPlanetAu: 1.524 },
};

/** Known orbital decay (ms/yr). */
export const PDOT = {
  'WASP-12 b': 29,
  'TOI-2109 b': 10,
  'Kepler-78 b': 0.5,
};

/** JWST / Spitzer results as first-class constraints. */
export const OBSERVED_ATMO = {
  'TRAPPIST-1 b, c': { result: 'no-thick-atmosphere', note: 'JWST dayside 503 K / 380 K — no thick CO₂' },
  'TRAPPIST-1 e': { result: 'unmeasured', note: 'Best HZ rocky target; atmosphere unknown' },
  'LHS 3844 b': { result: 'no-thick-atmosphere', note: 'Spitzer: no heat redistribution — bare rock' },
  'GJ 486 b': { result: 'ambiguous', note: 'JWST: water vs unocculted starspots' },
  'GJ 1214 b': { result: 'metal-rich-haze', note: 'JWST: metal-rich hazy envelope, day–night contrast' },
  'K2-18 b / TOI-270 d': { result: 'ch4-co2', note: 'CH₄ and CO₂; DMS contested' },
  '55 Cnc e': { result: 'secondary-co', note: 'JWST: CO/CO₂ over magma ocean (2024)' },
  'LHS 1140 b': { result: 'nitrogen-hint', note: 'JWST nitrogen hint; water-world vs rock' },
};

/** Discovery method guesses from category / name when archive is silent. */
export function discoveryGuess(name, category) {
  const n = (name || '').toLowerCase();
  if (/psr |pulsar/.test(n)) return { method: 'timing', year: 1992 };
  if (/ogle|moa-|blg/.test(n)) return { method: 'microlensing', year: null };
  if (/hr 8799|beta pic|51 eri|hip 65426|gj 504|2m1207|pso j|wise |simp |ots 44|luhman/.test(n)) {
    return { method: 'imaging', year: null };
  }
  if (category === 'sol' || category === 'moons') return { method: 'imaging', year: null };
  if (/proxima|ross 128|gj 273|teegarden|barnard|tau cet|kapteyn/.test(n)) {
    return { method: 'radial velocity', year: null };
  }
  return { method: 'transit', year: null };
}

/** Split bundled display names into member keys. */
export function splitMembers(name) {
  if (!name) return [];
  const parts = [];
  for (const chunk of name.split(/\s*\/\s*/)) {
    const m = chunk.match(/^(.*?)(\s+[a-z](?:\s*,\s*[a-z])+)$/i);
    if (m) {
      const base = m[1].trim();
      const letters = m[2].match(/[a-z]/gi) || [];
      for (const L of letters) parts.push(`${base} ${L.toLowerCase()}`);
    } else if (/,/.test(chunk) && /[a-z]\s*,/i.test(chunk)) {
      const base = chunk.replace(/\s+[a-z](?:\s*,\s*[a-z])+$/i, '').trim();
      const letters = chunk.match(/\b[a-z]\b/gi) || [];
      for (const L of letters) parts.push(`${base} ${L.toLowerCase()}`);
    } else {
      parts.push(chunk.trim());
    }
  }
  return parts.filter(Boolean);
}

/** Parse a player-supplied CSV into seed-shaped rows. */
export function parseWorldCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const alias = {
    name: 'b', pl_name: 'b', body: 'b',
    radius: 'r', pl_rade: 'r',
    mass: 'm', pl_bmasse: 'm',
    a: 'a', pl_orbsmax: 'a', sma: 'a',
    p: 'P', period: 'P', pl_orbper: 'P',
    e: 'e', ecc: 'e', pl_orbeccen: 'e',
    s: 'S', insol: 'S', pl_insol: 'S',
    teq: 'teq', pl_eqt: 'teq',
    teff: 'teff', st_teff: 'teff',
    obl: 'obl', rot: 'rot',
    cat: 'c', category: 'c',
  };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const o = { c: 'temperate' };
    for (let j = 0; j < headers.length; j++) {
      const key = alias[headers[j]] || headers[j];
      let v = cols[j]?.trim();
      if (v === '' || v == null) continue;
      if (key === 'b' || key === 'c' || key === 'rot' || key === 'note') o[key] = v;
      else o[key] = Number(v);
    }
    if (o.b) rows.push(o);
  }
  return rows;
}

/** Compact column store: typed arrays + name list. */
export function packColumnStore(records) {
  const n = records.length;
  const names = records.map((r) => r.name);
  const keys = ['radius', 'mass', 'a', 'P', 'e', 'obl', 'rot', 'S', 'teq', 'albedo', 'press', 'teff'];
  const cols = {};
  for (const k of keys) {
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const v = records[i][k]?.v;
      a[i] = Number.isFinite(v) ? v : NaN;
    }
    cols[k] = a;
  }
  return { n, names, cols, bytes: n * keys.length * 8 };
}

/** Blackbody xy → rough RGB for surface illumination (replaces skyFromTeff). */
export function blackbodyRgb(teff) {
  if (!(teff > 0)) return [0.008, 0.008, 0.015];
  // CIE-ish piecewise (Tanner Helland / approximation)
  const T = clamp(teff, 1000, 15000) / 100;
  let r, g, b;
  if (T <= 66) {
    r = 255;
    g = clamp(99.47 * Math.log(T) - 161.12, 0, 255);
  } else {
    r = clamp(329.7 * Math.pow(T - 60, -0.133), 0, 255);
    g = clamp(288.1 * Math.pow(T - 60, -0.0755), 0, 255);
  }
  if (T >= 66) b = 255;
  else if (T <= 19) b = 0;
  else b = clamp(138.5 * Math.log(T - 10) - 305.04, 0, 255);
  return [r / 255 * 0.12, g / 255 * 0.1, b / 255 * 0.14];
}

/** Faint-young-star curve for arbitrary mass. Sun: 70% at 4.5 Ga, +1%/110 Myr. */
export function faintYoungStar(ageYr, mStar = 1, ageGyrNow = 4.6) {
  const t0 = (ageGyrNow || 4.6) * 1e9;
  const t = clamp(ageYr / t0, 0, 1.2);
  // Lower-mass stars brighten less; higher-mass more
  const amp = 0.4 * Math.pow(mStar || 1, 0.8);
  return 1 / (1 + amp * (1 - t));
}

export { R_EARTH_M, M_EARTH_KG, R_JUP_RE, M_JUP_ME, AU_M, M_SUN_KG };
