/** One ephemeris — lights, satellites, spin, and derived sky geometry.
 *
 * Two-clock contract (see briefs/sky-model.md):
 *   *Now* — instantaneous phase; season, moon and terminator advance on the presentation clock.
 *   *Years* — orbit-averaged insolation; season and moon phase held unless scrubbed.
 *
 * Planet-fixed frame: the body rotates; light directions are fixed in the sky frame;
 * the surface hour angle comes from spinPhase.
 *
 * @provenance tagged-module
 */

import { clamp } from '../math.js';
import { SOL, makeStar, applyStarToRule } from './star.js';
import { faintYoungSun } from './time.js';

function isLivedClock(W) {
  return (W.clockFace || 'years') === 'now';
}

export { isLivedClock };

/* measured: 23.44° — IAU Earth obliquity */
export const EARTH_OBLIQUITY = 23.44 * Math.PI / 180;
/* measured: 5.145° — lunar inclination to ecliptic */
export const LUNAR_INCL = 5.145 * Math.PI / 180;
/* measured: 27.321661 d — sidereal month */
export const SIDEREAL_MONTH_D = 27.321661;
/* measured: 29.530588 d — synodic month */
export const SYNODIC_MONTH_D = 29.530588;
/* measured: 365.256 d — tropical year */
export const YEAR_D = 365.256;
/* measured: 23h 56m 04s — sidereal day */
export const SIDEREAL_DAY_H = 23 + 56 / 60 + 4 / 3600;
/* fitted: 48 s — lived-clock year length for legibility */
export const LIVED_YEAR_SEC = 48;
/* derived: lunar orbits per sidereal year */
export const LUNAR_ORBITS_YR = YEAR_D / SIDEREAL_MONTH_D;
/* measured: 0.0549 — lunar eccentricity */
export const LUNAR_ECC = 0.0549;
/* measured: 6371 km — Earth equatorial radius */
const EARTH_RADIUS_KM = 6371;
/* measured: 1361 W/m² — solar constant at 1 AU */
export const SOLAR_CONSTANT_WM2 = 1361;
/* measured: 3.8 cm/yr — lunar recession */
export const LUNAR_RECESSION_CM_YR = 3.8;
/* measured: 0.533° — solar angular diameter at 1 AU */
const SUN_ANG_DEG = 0.533;
/* measured: 0.518° — lunar angular diameter at mean distance */
const MOON_ANG_DEG = 0.518;

const _dir = [0, 0, 0];
const _scratch = [0, 0, 0];

/** @typedef {object} LightBody
 *  @property {string} id
 *  @property {string} name
 *  @property {number} teff
 *  @property {number} mass
 *  @property {number} radius
 *  @property {number} lum
 *  @property {number} a
 *  @property {number} e
 *  @property {number} incl
 *  @property {number} node
 *  @property {number} argp
 *  @property {number} M0
 *  @property {string} heating
 */

/** @typedef {object} SatelliteBody
 *  @property {string} id
 *  @property {string} name
 *  @property {number} mass
 *  @property {number} radius
 *  @property {number} dens
 *  @property {number} albedo
 *  @property {number} a
 *  @property {number} e
 *  @property {number} incl
 *  @property {number} node
 *  @property {number} argp
 *  @property {number} M0
 *  @property {boolean} retro
 *  @property {number} formedYr
 */

/** @typedef {object} SkyLightPayload
 *  @property {number[]} dir
 *  @property {number} flux
 *  @property {number} teff
 *  @property {number} angRad
 *  @property {number} occluded
 */

/** @typedef {object} SkySatPayload
 *  @property {number[]} dir
 *  @property {number} phase
 *  @property {number} illum
 *  @property {number} angRad
 *  @property {boolean} inShadow
 *  @property {number} distNow
 */

function makeLightPayload() {
  return { dir: [1, 0, 0], flux: 1, teff: 5772, angRad: 0, occluded: 0 };
}

function makeSatPayload() {
  return { dir: [1, 0, 0], phase: 0, illum: 0.5, angRad: 0, inShadow: false, distNow: 1 };
}

/** Eccentric anomaly — Newton iteration. fitted: 3 passes, e ≤ 0.4 */
export function keplerE(e, M) {
  const ee = clamp(e, 0, 0.4);
  let E = M;
  /* numeric: 3 — Kepler Newton iterations */
  for (let i = 0; i < 3; i++) {
    E = E - (E - ee * Math.sin(E) - M) / (1 - ee * Math.cos(E));
  }
  return E;
}

/** True anomaly from mean anomaly — single implementation (EPH10). */
export function trueFromMean(e, M) {
  const E = keplerE(e, M);
  const s = Math.sqrt(1 - e * e) * Math.sin(E);
  const c = Math.cos(E) - e;
  return Math.atan2(s, c);
}

function companionDirection(primary, body, ageYr, spinAxis, out = _dir) {
  const sepAu = body.binarySepAu || 0.2;
  const aAu = body.a || 1;
  const sepRad = Math.atan(sepAu / Math.max(0.05, aAu));
  const periodYr = (body.periodDays || 41) / YEAR_D;
  const phase = phaseFromAge(ageYr || 0, periodYr, body.M0 || 0);
  const swing = sepRad * Math.cos(phase);
  const ax = spinAxis?.[0] ?? 0;
  const ay = spinAxis?.[1] ?? 1;
  const az = spinAxis?.[2] ?? 0;
  const px = ay * primary[2] - az * primary[1];
  const py = az * primary[0] - ax * primary[2];
  const pz = ax * primary[1] - ay * primary[0];
  const pl = Math.hypot(px, py, pz) || 1;
  const ux = px / pl;
  const uy = py / pl;
  const uz = pz / pl;
  const cp = Math.cos(swing);
  const sp = Math.sin(swing);
  const dot = primary[0] * ux + primary[1] * uy + primary[2] * uz;
  out[0] = primary[0] * cp + (ux * dot) * (1 - cp) + uy * sp;
  out[1] = primary[1] * cp + (uy * dot) * (1 - cp) - ux * sp;
  out[2] = primary[2] * cp + (uz * dot) * (1 - cp);
  return norm3(out[0], out[1], out[2], out);
}

function norm3(x, y, z, out = _dir) {
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l;
  out[1] = y / l;
  out[2] = z / l;
  return out;
}

/** Ensure host star exists on rulesets that never got catalogue star wiring. */
export function ensureHostStar(W, rule = W?.rule) {
  if (!rule) return null;
  if (rule.star?.teff > 0 || rule.star?.heating === 'particle') return rule.star;
  if ((rule.solar || 0) <= 0 && rule.freeFloater) return null;
  const star = makeStar({ teff: 5772, mass: 1, radius: 1, id: 'sol', name: 'Sun' });
  applyStarToRule(rule, star, rule.worldRecord?.a?.v || 1);
  return rule.star;
}

/** Phase from absolute epoch — never accumulate with += (EPH8). */
export function phaseFromAge(ageYr, periodYr, M0 = 0) {
  if (!(periodYr > 0)) return M0;
  const cycles = ageYr / periodYr;
  const tau = Math.PI * 2;
  return ((M0 + cycles * tau) % tau + tau) % tau;
}

export function spinPhaseFromAge(ageYr, rotationPeriod) {
  const periodDays = Math.abs(rotationPeriod || 1);
  const sign = (rotationPeriod || 1) < 0 ? -1 : 1;
  const days = ageYr * YEAR_D;
  const tau = Math.PI * 2;
  return sign * (((days / periodDays) * tau) % tau);
}

export function seasonFromAge(ageYr, orbitalPeriodYr = 1, M0 = 0) {
  return phaseFromAge(ageYr, orbitalPeriodYr, M0);
}

/** Sub-solar declination from obliquity and season. */
export function subsolarDeclination(obliquity, season) {
  return Math.asin(clamp(Math.sin(obliquity) * Math.sin(season), -1, 1));
}

/** Sun direction from obliquity, season and spin phase (EPH15/16). */
export function sunDirection(obliquity, season, spinPhase, out = _dir) {
  const dec = subsolarDeclination(obliquity, season);
  const lat = dec;
  const lon = spinPhase;
  const cl = Math.cos(lat);
  return norm3(cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon), out);
}

/** Element → direction; node / incl / argp composed once per body per tick (EPH11). */
export function dirFromOrbit(body, ageYr, periodYr, out = _dir, meanM = null) {
  const M = meanM != null ? meanM : phaseFromAge(ageYr, periodYr, body.M0 || 0);
  const nu = trueFromMean(body.e || 0, M);
  const r = (body.a || 1) * (1 - (body.e || 0) ** 2) / (1 + (body.e || 0) * Math.cos(nu));
  const u = (body.argp || 0) + nu;
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const cosI = Math.cos(body.incl || 0);
  const sinI = Math.sin(body.incl || 0);
  const cosN = Math.cos(body.node || 0);
  const sinN = Math.sin(body.node || 0);
  const xo = r * cosU;
  const yo = r * sinU;
  const x = xo * cosN - yo * cosI * sinN;
  const y = xo * sinN + yo * cosI * cosN;
  const z = yo * sinI;
  body._distNow = r;
  const sign = body.retro ? -1 : 1;
  return norm3(x, sign * y, z, out);
}

/** Illuminated fraction from elongation (MOON8). */
export function illumFromElongation(sunDir, satDir) {
  const dot = clamp(
    sunDir[0] * satDir[0] + sunDir[1] * satDir[1] + sunDir[2] * satDir[2],
    -1,
    1,
  );
  const elong = Math.acos(dot);
  return (1 + Math.cos(elong)) / 2;
}

/** Pairwise occultation magnitude 0–1 (EPH29). */
export function occultationMag(angSep, rOcc, rLight) {
  const sum = rOcc + rLight;
  if (angSep >= sum) return 0;
  if (angSep <= Math.abs(rOcc - rLight)) return 1;
  return clamp(1 - angSep / sum, 0, 1);
}

function angularSep(a, b) {
  const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  return Math.acos(dot);
}

export function terminatorSpeedKmh(rotationPeriod, radiusEarth = 1) {
  const periodH = Math.abs(rotationPeriod || 1) * 24;
  const circKm = 2 * Math.PI * EARTH_RADIUS_KM * (radiusEarth || 1);
  return circKm / periodH;
}

function adaptStarToLight(star, rule) {
  const aAu = rule?.worldRecord?.a?.v || 1;
  return {
    id: star?.id || 'host',
    name: star?.name || 'Star',
    teff: star?.teff || 5772,
    mass: star?.mass ?? 1,
    radius: star?.radius ?? 1,
    lum: star?.lum ?? 1,
    a: aAu,
    e: rule?.eccentricity || 0,
    incl: 0,
    node: 0,
    argp: 0,
    M0: 0,
    heating: star?.heating || 'photon',
  };
}

function defaultSatellite(moon, formedYr) {
  if (!moon) return null;
  return {
    id: 'moon0',
    name: 'Moon',
    mass: moon.mass ?? 1,
    radius: 1,
    dens: 3.34,
    albedo: 0.12,
    a: moon.distance ?? 1,
    e: LUNAR_ECC,
    incl: LUNAR_INCL,
    node: 0,
    argp: 0,
    M0: 0,
    retro: false,
    formedYr: formedYr ?? moon.formed ?? 0,
    _distNow: 1,
  };
}

/** W.moon adapter view over bodies.sats[0] (EPH6). */
export function makeMoonView(sat) {
  if (!sat) return null;
  return {
    get mass() { return sat.mass; },
    set mass(v) { sat.mass = v; },
    get distance() { return sat.a; },
    set distance(v) { sat.a = v; },
    get formed() { return sat.formedYr; },
    set formed(v) { sat.formedYr = v; },
  };
}

function ensureSkyFrame(W) {
  if (!W.sky) {
    W.sky = {
      lights: [makeLightPayload()],
      sats: [makeSatPayload()],
      nLights: 1,
      nSats: 0,
      eclipse: { nextSolarYr: null, type: null, magnitude: 0 },
      orbitAveraged: false,
      terminatorKmh: 0,
    };
  }
  if (!W.bodies) {
    W.bodies = { lights: [], sats: [] };
  }
}

/** Allocate bodies and sky frame at generate. */
export function initSky(W, rule) {
  ensureSkyFrame(W);
  ensureHostStar(W, rule);
  const star = rule?.star;
  const lights = [];
  if (star && (star.teff > 0 || star.heating === 'particle')) {
    if (star.a == null) star.a = rule?.worldRecord?.a?.v || 1;
    if (star.e == null) star.e = rule?.eccentricity || 0;
    if (star.incl == null) star.incl = 0;
    if (star.node == null) star.node = 0;
    if (star.argp == null) star.argp = 0;
    if (star.M0 == null) star.M0 = 0;
    if (star.heating == null) star.heating = 'photon';
    lights.push(star);
  }
  W.bodies.lights = lights;
  W.bodies.sats = [];
  const sats = [];
  if (W._moonRaw) {
    const sat = defaultSatellite(W._moonRaw, W._moonRaw.formed);
    if (sat) sats.push(sat);
  } else if (W.moon && typeof W.moon === 'object' && W.moon.mass > 0.05) {
    const sat = defaultSatellite(W.moon, W.moon.formed);
    if (sat) sats.push(sat);
  }
  W.bodies.sats = sats;
  W.sky.nLights = lights.length;
  W.sky.nSats = sats.length;
  while (W.sky.lights.length < Math.max(1, lights.length)) W.sky.lights.push(makeLightPayload());
  while (W.sky.sats.length < Math.max(1, sats.length)) W.sky.sats.push(makeSatPayload());
  W.moon = makeMoonView(sats[0] || null);
  W.spinAxis = W.spinAxis || [0, 1, 0];
  W.spinPhase = spinPhaseFromAge(W.ageYr || 0, W.rotationPeriod || 1);
  W.precessionPhase = W.precessionPhase || 0;
  W._livedSeason = W.season || 0;
  W._livedMoon = W.moonAngle || 0;
  W._livedSpin = W.spinPhase || 0;
}

export function packOrbital(W) {
  return {
    obliquity: W.obliquity,
    rotationPeriod: W.rotationPeriod,
    season: W.season,
    spinPhase: W.spinPhase,
    spinAxis: W.spinAxis ? [...W.spinAxis] : [0, 1, 0],
    precessionPhase: W.precessionPhase ?? 0,
    eccentricity: W.eccentricity,
    seasonHold: W.seasonHold ?? null,
    lights: (W.bodies?.lights || []).map((l) => ({ ...l })),
    sats: (W.bodies?.sats || []).map((s) => ({ ...s })),
    stripped: !W.bodies?.sats?.length,
  };
}

export function unpackOrbital(W, block) {
  if (!block) return;
  if (block.obliquity != null) W.obliquity = block.obliquity;
  if (block.rotationPeriod != null) {
    W.rotationPeriod = block.rotationPeriod;
    if (W.rule) W.rule.rotationPeriod = block.rotationPeriod;
  }
  if (block.eccentricity != null) W.eccentricity = block.eccentricity;
  if (block.seasonHold != null) W.seasonHold = block.seasonHold;
  if (block.spinAxis) W.spinAxis = block.spinAxis;
  if (block.precessionPhase != null) W.precessionPhase = block.precessionPhase;
  if (block.lights?.length) W.bodies.lights = block.lights.map((l) => ({ ...l }));
  if (block.stripped) {
    W.bodies.sats = [];
  } else if (block.sats) {
    W.bodies.sats = block.sats.map((s) => ({ ...s, _distNow: s.a || 1 }));
  }
  W.moon = makeMoonView(W.bodies.sats[0] || null);
  W.sky.nLights = W.bodies.lights.length;
  W.sky.nSats = W.bodies.sats.length;
  if (block.season != null) W.season = block.season;
  if (block.spinPhase != null) W.spinPhase = block.spinPhase;
}

export function migrateOrbitalFromRuleset(W, rule) {
  W.obliquity = W.obliquity ?? rule.obliquity;
  W.rotationPeriod = W.rotationPeriod ?? rule.rotationPeriod ?? 1;
  W.eccentricity = W.eccentricity ?? rule.eccentricity ?? 0;
  if (W.seasonHold != null) W.season = W.seasonHold;
  initSky(W, rule);
}

function resolveSeason(W, rule) {
  if (W._livedActive && isLivedClock(W)) return W._livedSeason ?? 0;
  if (W.seasonHold != null && !isLivedClock(W)) return W.seasonHold;
  return seasonFromAge(W.ageYr || 0, 1, 0);
}

function resolveSpinPhase(W) {
  if (W._livedActive && isLivedClock(W)) return W._livedSpin ?? 0;
  if (!isLivedClock(W) && W.seasonHold != null && W.spinPhaseHold != null) return W.spinPhaseHold;
  return spinPhaseFromAge(W.ageYr || 0, W.rotationPeriod || 1);
}

/** Sidereal month in years — scales with semi-major axis (Kepler). */
function siderealPeriodYr(body) {
  const base = SIDEREAL_MONTH_D / YEAR_D;
  return base * Math.pow(Math.max(0.35, body.a || 1), 1.5);
}

/** Calendar age for binary companions on the lived presentation clock. */
function livedOrbitAgeYr(W) {
  if (!isLivedClock(W) || !W._livedActive) return W.ageYr || 0;
  return (W._livedT || 0) / LIVED_YEAR_SEC;
}

/** Mean anomaly (rad) for a satellite — advances on Now, frozen on Years hold. */
function livedMeanAnomaly(W, body, satIndex) {
  const periodYr = siderealPeriodYr(body);
  const M0 = body.M0 || 0;
  if (!isLivedClock(W)) {
    if (body._heldM != null) return body._heldM;
    if (satIndex === 0 && W.moonAngleHold != null) return W.moonAngleHold;
    return phaseFromAge(W.ageYr || 0, periodYr, M0);
  }
  if (W._livedActive) {
    const t = W._livedT || 0;
    const tau = Math.PI * 2;
    const monthSec = LIVED_YEAR_SEC / LUNAR_ORBITS_YR;
    const aScale = Math.pow(Math.max(0.35, body.a || 1), 1.5);
    const anchor = body._livedM ?? (satIndex === 0 ? (W._livedMoon0 ?? M0) : M0);
    return ((anchor + t * tau / (monthSec * aScale)) % tau + tau) % tau;
  }
  return phaseFromAge(W.ageYr || 0, periodYr, M0);
}

/** Snapshot moon phases for the Years face (season hold). */
export function snapshotHeldOrbits(W) {
  for (let i = 0; i < (W.bodies?.sats?.length || 0); i++) {
    const body = W.bodies.sats[i];
    const periodYr = siderealPeriodYr(body);
    body._heldM = phaseFromAge(W.ageYr || 0, periodYr, body.M0 || 0);
  }
  W.moonAngleHold = W.bodies?.sats?.[0]?._heldM ?? W.moonAngle ?? 0;
  W.moonPhaseHold = W.moonPhase ?? 0;
  W.spinPhaseHold = W.spinPhase ?? 0;
}

/** Snapshot orbital phases when switching to the lived clock. */
export function anchorLivedOrbits(W) {
  for (let i = 0; i < (W.bodies?.sats?.length || 0); i++) {
    const body = W.bodies.sats[i];
    const periodYr = siderealPeriodYr(body);
    body._livedM = phaseFromAge(W.ageYr || 0, periodYr, body.M0 || 0);
  }
  W._livedMoon0 = W.bodies?.sats?.[0]?._livedM ?? W.moonAngle ?? 0;
}

function fillGeometry(W, rule) {
  const sky = W.sky;
  const obl = W.obliquity ?? rule?.obliquity ?? EARTH_OBLIQUITY;
  W.season = resolveSeason(W, rule);
  W.spinPhase = resolveSpinPhase(W);
  sky.orbitAveraged = !isLivedClock(W) && !W._climateAnchor;
  sky.terminatorKmh = terminatorSpeedKmh(W.rotationPeriod, rule?.radiusEarth || 1);

  const sunDir = sunDirection(obl, W.season, W.spinPhase, _scratch);
  W._sunDir = sunDir;

  const nL = W.bodies.lights.length;
  sky.nLights = nL;
  while (sky.lights.length < nL) sky.lights.push(makeLightPayload());
  let primarySun = sunDir;
  for (let i = 0; i < nL; i++) {
    const body = W.bodies.lights[i];
    const pay = sky.lights[i];
    if (i === 0 || body.role === 'primary') {
      pay.dir[0] = sunDir[0];
      pay.dir[1] = sunDir[1];
      pay.dir[2] = sunDir[2];
    } else if (body.role === 'companion' || body.role === 'tertiary') {
      companionDirection(sunDir, body, livedOrbitAgeYr(W), W.spinAxis, pay.dir);
    } else {
      dirFromOrbit(body, W.ageYr || 0, 1, pay.dir);
    }
    pay.flux = (body.lum || 1) / Math.max(1e-8, (body.a || 1) ** 2);
    pay.teff = body.teff || 5772;
    pay.angRad = (SUN_ANG_DEG * Math.PI / 180) * (body.radius || 1) / Math.max(0.01, body.a || 1);
    pay.occluded = 0;
    if (i === 0) primarySun = pay.dir;
  }

  const nS = W.bodies.sats.length;
  sky.nSats = nS;
  while (sky.sats.length < nS) sky.sats.push(makeSatPayload());
  let moonDir = null;
  let moonIllum = 0;
  let moonAngle = 0;
  let moonPhase = 0;
  let bestEclipse = 0;

  for (let i = 0; i < nS; i++) {
    const body = W.bodies.sats[i];
    const pay = sky.sats[i];
    const periodYr = siderealPeriodYr(body);
    const M = livedMeanAnomaly(W, body, i);
    dirFromOrbit(body, W.ageYr || 0, periodYr, pay.dir, M);
    pay.distNow = body._distNow || body.a || 1;
    const moonRad = body.radius || 1;
    pay.angRad = (MOON_ANG_DEG * Math.PI / 180) * moonRad / Math.max(0.35, pay.distNow);
    pay.illum = illumFromElongation(primarySun, pay.dir);
    pay.phase = Math.acos(clamp(
      primarySun[0] * pay.dir[0] + primarySun[1] * pay.dir[1] + primarySun[2] * pay.dir[2],
      -1, 1,
    )) / Math.PI;
    pay.inShadow = pay.illum < 0.05;
    const sep = angularSep(primarySun, pay.dir);
    const occ = occultationMag(sep, pay.angRad, sky.lights[0]?.angRad || 0);
    if (occ > bestEclipse) bestEclipse = occ;
    if (i === 0) {
      moonDir = pay.dir;
      moonIllum = pay.illum;
      moonAngle = M;
      moonPhase = moonAngle / (Math.PI * 2);
    }
  }

  if (sky.lights[0]) sky.lights[0].occluded = bestEclipse;
  sky.eclipse.magnitude = bestEclipse;

  if (moonDir) {
    W._moonDir = moonDir;
    W.moonIllum = moonIllum;
    W.moonAngle = moonAngle;
    W.moonPhase = ((moonPhase % 1) + 1) % 1;
  } else {
    W._moonDir = null;
    W.moonIllum = 0;
    W.moonAngle = 0;
    W.moonPhase = 0;
  }
  syncStarClimate(W);
}

/** Push host-star bodies → ruleset insolation + W.solar (inverse-square from lum and a). */
export function syncStarClimate(W) {
  const rule = W.rule;
  if (!rule) return;
  const lights = W.bodies?.lights || [];
  if (!lights.length) return;

  const primary = lights.find((l) => l.role === 'primary') || lights[0];

  let insol = 0;
  for (const l of lights) {
    if (l.heating === 'none') continue;
    insol += (l.lum || 0) / Math.max(1e-8, (l.a || 1) ** 2);
  }
  if (!(insol > 0)) {
    insol = (primary.lum || 1) / Math.max(1e-8, (primary.a || 1) ** 2);
  }

  const derived = makeStar({
    teff: primary.teff || 5772,
    mass: primary.mass || 1,
    radius: primary.radius || 1,
    lum: primary.lum,
    keepLum: true,
    heating: primary.heating || 'photon',
    id: primary.id,
    name: primary.name,
  });

  applyStarToRule(rule, derived, primary.a || 1);
  rule.star = primary;
  rule.solarTrue = insol;
  rule.solar = Math.min(50, Math.max(0, insol));
  rule.starTeff = primary.teff || derived.teff || 5772;
  rule.sky = derived.sky.slice();

  const faint = faintYoungSun(W.ageYr || 0, primary.mass || 1);
  W._baseSolar = rule.solar;
  if (!W.pausedSolar) W.solar = rule.solar * faint;
}

/** Sim-tick entry — geometry before atmo/tides (EPH18). */
export function skyTick(W) {
  ensureSkyFrame(W);
  fillGeometry(W, W.rule);
}

/** Effective presentation-clock year length (seconds) — lower = faster seasons. */
export function livedYearSec(W) {
  const base = W.livedYearSec ?? LIVED_YEAR_SEC;
  const rate = clamp(W.livedRate ?? 1, 0.25, 8);
  return base / rate;
}

/** Day spin multiplier on the lived clock (independent of year/moon rate). */
export function livedDayMul(W) {
  return clamp(W.livedDayRate ?? 1, 0.25, 8);
}

/** Set sky animation rate (season, moon, default day coupling). */
export function setLivedSkyRate(W, rate) {
  const tau = Math.PI * 2;
  const t = W._livedT || 0;
  const oldYearSec = livedYearSec(W);
  const season = (W._livedSeason0 || 0) + t * tau / oldYearSec;
  W.livedRate = clamp(rate, 0.25, 8);
  const newYearSec = livedYearSec(W);
  W._livedSeason0 = season - t * tau / newYearSec;
  return W.livedRate;
}

/** Set day-length multiplier on the lived clock. */
export function setLivedDayRate(W, rate) {
  const tau = Math.PI * 2;
  const t = W._livedT || 0;
  const yearSec = livedYearSec(W);
  const rotPeriod = Math.abs(W.rotationPeriod || 1);
  const sign = (W.rotationPeriod || 1) < 0 ? -1 : 1;
  const oldDaySec = yearSec * rotPeriod / YEAR_D / livedDayMul(W);
  const spin = (W._livedSpin0 || 0) + t * tau / oldDaySec * sign;
  W.livedDayRate = clamp(rate, 0.25, 8);
  const newDaySec = yearSec * rotPeriod / YEAR_D / livedDayMul(W);
  W._livedSpin0 = spin - t * tau / newDaySec * sign;
  return W.livedDayRate;
}

/** Scrub season on *Now* without switching clock faces. */
export function scrubLivedSeason(W, seasonRad) {
  const tau = Math.PI * 2;
  const rad = ((seasonRad % tau) + tau) % tau;
  const t = W._livedT || 0;
  const yearSec = livedYearSec(W);
  W._livedSeason0 = rad - t * tau / yearSec;
  W.season = rad;
  if (isLivedClock(W)) fillGeometry(W, W.rule);
  return rad;
}
/** Frame-rate entry for the lived clock (EPH19). */
export function skyFrame(W, dtSec) {
  if (!isLivedClock(W)) return;
  const dt = Math.max(0, dtSec || 0);
  if (dt) W._livedActive = true;
  W._livedT = (W._livedT || 0) + dt;
  const t = W._livedT;
  const tau = Math.PI * 2;
  const yearSec = livedYearSec(W);
  W._livedSeason = (W._livedSeason0 || 0) + t * tau / yearSec;
  const monthSec = yearSec / LUNAR_ORBITS_YR;
  W._livedMoon = (W._livedMoon0 || 0) + t * tau / monthSec;
  const rotPeriod = Math.abs(W.rotationPeriod || 1);
  const daySec = yearSec * rotPeriod / YEAR_D / livedDayMul(W);
  W._livedSpin = (W._livedSpin0 || 0) + t * tau / daySec * ((W.rotationPeriod || 1) < 0 ? -1 : 1);
  fillGeometry(W, W.rule);
}

/** Policy hook for clockFace — season hold only, no writes (EPH24). */
export function applySkySeasonPolicy(W) {
  if (W._livedActive && isLivedClock(W)) return false;
  if (W.seasonHold != null && !isLivedClock(W)) return false;
  return true;
}

/** Sky calibration metrics for GATE14. */
export function skyCalibration(W) {
  const oblDeg = (W.obliquity || 0) * 180 / Math.PI;
  const siderealDayH = Math.abs(W.rotationPeriod || 1) * 24 * (SIDEREAL_DAY_H / 24);
  const periodYr = SIDEREAL_MONTH_D / YEAR_D;
  const synodic = SIDEREAL_MONTH_D / (1 - YEAR_D / (LUNAR_ORBITS_YR * YEAR_D));
  return {
    obliquityDeg: oblDeg,
    insolation: (W.solar || 1) * SOLAR_CONSTANT_WM2,
    siderealDayH,
    yearD: YEAR_D,
    siderealMonthD: SIDEREAL_MONTH_D,
    synodicMonthD: synodic,
    lunarInclDeg: LUNAR_INCL * 180 / Math.PI,
    recessionCmYr: LUNAR_RECESSION_CM_YR,
    terminatorKmh: terminatorSpeedKmh(W.rotationPeriod, W.rule?.radiusEarth || 1),
    moonIllum: W.moonIllum,
  };
}

/** One honest sentence for inspect/HUD (EPH56). */
export function describeSky(W) {
  const nL = W.bodies?.lights?.length || 0;
  const nS = W.bodies?.sats?.length || 0;
  const dayH = Math.abs(W.rotationPeriod || 1) * 24;
  const kmh = (W.sky?.terminatorKmh || 0).toFixed(0);
  return `${nL} light${nL === 1 ? '' : 's'} · ${nS} satellite${nS === 1 ? '' : 's'} · day ${dayH.toFixed(1)} h · terminator ${kmh} km/h`;
}

/** Body list for System desk (PANEL41). */
export function systemBodyList(W) {
  const rows = [];
  for (const l of W.bodies?.lights || []) {
    const insol = (l.lum || 0) / Math.max(1e-8, (l.a || 1) ** 2);
    rows.push({
      kind: 'light',
      id: l.id,
      name: l.name || l.id,
      teff: l.teff,
      lum: l.lum,
      a: l.a,
      radius: l.radius,
      insol,
    });
  }
  for (const s of W.bodies?.sats || []) {
    const ix = W.bodies.sats.indexOf(s);
    const pay = W.sky?.sats?.[ix];
    rows.push({
      kind: 'sat',
      id: s.id,
      name: s.name || s.id,
      mass: s.mass,
      a: s.a,
      radius: s.radius,
      albedo: s.albedo,
      inclDeg: (s.incl || 0) * 180 / Math.PI,
      angDeg: pay?.angRad ? pay.angRad * 180 / Math.PI : null,
      illum: pay?.illum,
    });
  }
  return rows;
}
