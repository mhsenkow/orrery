/** Air column — the sim's third dimension.
 *
 *  Everything about the weather in this model used to happen on one surface.
 *  `atmo.js` carries a temperature and a vapour amount per cell, `wind.js`
 *  solves a shallow-water layer and infers the flow aloft from thermal wind,
 *  and `storms.js` reads those two numbers and a shear magnitude. That is
 *  enough for a circulation and for cyclones, and it is not enough for anything
 *  that depends on how the air is stacked: whether a parcel lifted off the
 *  surface keeps rising, how much water the column is holding, whether the air
 *  aloft is sinking and drying the ground beneath it, or how the wind turns
 *  with height. Convection, hail, tornadoes and drought are all questions about
 *  the *profile*, and a single level cannot be asked them.
 *
 *  So: eight sigma levels of temperature and specific humidity per cell, built
 *  hydrostatically from the surface fields, and the parcel diagnostics that
 *  follow — CAPE, CIN, LCL, precipitable water, storm-relative helicity, and a
 *  mass-continuity vertical velocity. Same idea as `colstack.js` does for rock:
 *  a fixed shallow stack per cell, read by whoever needs the third dimension.
 *
 *  Two things this module deliberately is not.
 *
 *  It is not a free-running atmosphere. The column relaxes onto a profile
 *  derived from the surface state each pass, with a memory whose timescale is
 *  three days — so at ten or two hundred years a tick it is fully diagnostic,
 *  which is the honest thing at that step size, and only a lived-time clock
 *  short enough to resolve weather would give it a life of its own. The
 *  prognostic path is written and costs nothing until a tick is short enough to
 *  engage it.
 *
 *  And it writes nothing the climate reads. `temp`, `moist`, `precip`, `clouds`
 *  and the winds all stay owned by their existing modules; this module only
 *  adds fields. Wiring convection into precipitation is a real change to the
 *  water cycle and belongs behind its own calibration, not smuggled in with the
 *  layer that makes it possible.
 *
 *  Memory: 5 fields × 8 levels × 4 B = 160 B a cell for the stack, plus thirteen
 *  single-level diagnostics — ~11.7 MB at N=96, against `colstack`'s
 *  2.58 MB for the rock. Cost is held down by striping: a quarter of the grid
 *  is rebuilt each tick, which is invisible in fields this smooth.
 *
 *  @provenance measured
 */

import { NC, DIR, AREA } from '../sphere.js';
import { clamp } from '../math.js';
import { divEN } from './swe.js';
import { meanMolecularWeight } from './exophysics.js';
/* One definition of a cell's temperature in kelvin. `origin.js` already owned
   it, and it is the only form that can say 94 K: the plain scalar mapping
   bottoms out at 208 K, so Titan came through as a temperate world and its
   tropopause floor sat forty kelvin above the parcel. */
import { tempKOf } from './origin.js';
import { livePressureBar } from './substrateField.js';
import { hasSurface } from './planetKind.js';
import { liquidWaterOk } from './hydro.js';

/** Levels, as fractions of surface pressure. Eight gives the boundary layer two
 *  levels for mixed-layer diagnosis, three in the mid-troposphere, and two above
 *  the tropopause (COL1). */
export const AIR_LEVELS = 8;
export const SIGMA = Object.freeze([0.98, 0.95, 0.90, 0.80, 0.65, 0.55, 0.45, 0.25]);

/** How many ticks one full rebuild of the grid is spread over.
 *
 *  A full pass is 18 ms at N=64 against a soft tick budget of 8, and these
 *  fields change on the timescale of the temperature field that feeds them —
 *  which at ten years a tick is not per-tick at all. Eight stripes puts the
 *  module at about 2 ms a tick with a complete refresh every eight, and it sits
 *  last in the degradation order so a loaded frame sheds it first. Must stay a
 *  power of two: the stripe test is a bitmask. */
export const AIR_STRIPES = 8;

/* log(p_below / p_level) per level — the hypsometric thickness factor. The ratio
   is a constant of the sigma grid, so the logarithm belongs here and not six
   times a cell on the hottest loop in the module. */
const LOG_RATIO = new Float64Array(AIR_LEVELS);
for (let i = 0; i < AIR_LEVELS; i++) {
  LOG_RATIO[i] = Math.log((i === 0 ? 1 : SIGMA[i - 1]) / SIGMA[i]);
}

/* measured: 9.80665 m/s² — standard gravity, CGPM 1901 */
const G0 = 9.80665;
/* measured: 8314.46 J/(kmol·K) — universal gas constant × 1000 */
const R_UNIV = 8314.46;
/* measured: 2.501e6 J/kg — latent heat of vaporisation of water at 273.15 K */
const LV = 2.501e6;
/* derived: 0.622 — ratio of the molar masses of water and dry air */
const EPS_W = 0.622;
/* derived: cp = 7/2 · R for a diatomic gas — 1004 J/(kg·K) at Earth's R */
const CP_OVER_R = 3.5;
/* fitted: 0.92 — the dry *environmental* limit as a share of the dry adiabat
   g/cp. Earth's 9.76 K/km adiabat gives 9.0 K/km, which is the steepest lapse a
   real sounding holds over any depth. Hard-coding the 9.0 was hard-coding
   Earth's gravity and Earth's air: on Mars the dry adiabat is 4.5 K/km, so an
   environment forced to cool at 9 K/km was steeper than any parcel could climb
   and every column on the planet reported CAPE it did not have. */
const LAPSE_DRY_FRAC = 0.92;
/* derived: 0.2 — floor on the environmental lapse, as a share of the dry adiabat
   g/cp. On Earth that is the 2 K/km an inversion-capped sounding holds, which is
   where this number came from as a constant; as a constant it was also four
   times Titan's *entire* dry adiabat, so the floor beat the ceiling, the
   environment was forced to cool faster than any parcel could, and a methane
   world with no water in it posted eight thousand joules of CAPE. Every lapse
   limit in this file is a fraction of g/cp for that reason. */
const LAPSE_FLOOR_FRAC = 0.2;
/* fitted: 1.2 K/km — how much subsiding air stabilises the profile it warms */
const SUBSIDENCE_STABILISE = 1.2e-3;
/* measured: 0.75 — tropopause temperature as a share of surface temperature.
   Earth 288 K → 216 K and Titan 94 K → 70 K both land on it, which is why it is
   a ratio and not the 70 K subtraction it replaced: subtracting Earth's contrast
   from Titan's 94 K surface put the tropopause at 24 K, forty kelvin below the
   parcel, and reported fifteen thousand joules of CAPE on a world whose
   troposphere is two hundred times more stable than ours. */
const TROPOPAUSE_FRAC = 0.75;
/* measured: 2.2 km — e-folding height of water vapour in Earth's troposphere */
const VAPOUR_SCALE_M = 2200;
/* numeric: 2e-6 kg/kg — stratospheric humidity floor, keeps logs finite */
const Q_FLOOR = 2e-6;
/* fitted: 694 mm per vapour unit — the hydrosphere's `vapour` field is in units
   whose Earth-mean value is 0.036 (`SATREF` in `hydro.js`), and Earth's mean
   precipitable water is 25 mm. One constant, anchored once, is all it takes to
   make this column carry the *same* water as the module that owns water. The
   alternative was reading `gases.H2O` as a mixing ratio, which it is not — it
   comes through as 24.7 on Titan — and inventing a second water inventory that
   would then have to be reconciled with the first. */
const PWAT_PER_VAPOUR_MM = 694;
/* fitted: 1.08 — CAPE an eight-level layer-mean march misses against a sounding
   integrated at 25 hPa; eight levels resolve the LFC layer better than six, so
   the correction drops from 1.18 to 1.08 (COL1) */
const CAPE_GAIN = 1.08;
/* fitted: 0.5 — no inhibition is counted above this sigma. Above the middle of
   the troposphere a parcel that has not found its level of free convection is
   not going to, and integrating further turns "no convection" into a number in
   the thousands that reads like a measurement. */
const CIN_SIGMA_LIMIT = 0.5;
/* fitted: 800 J/kg — cap on reported inhibition; past this it is a lid, and how
   much of a lid stops being interesting */
const CIN_MAX = 800;
/* fitted: 35 m/s — wind unit of the shallow-water solver, set so its 1.85
   ceiling is a jet-stream core and a midlatitude westerly is ~14 m/s */
export const WIND_MS = 35;
/* fitted: 0.45 — share of the surface-to-jet shear realised by 3 km */
const SHEAR_FRAC_3KM = 0.45;
/* measured: 7.5 m/s — Bunkers et al. 2000 right-mover deviation from the shear */
const BUNKERS_DEV_MS = 7.5;
/* measured: 160000 — the divisor in the energy–helicity index */
const EHI_DIVISOR = 160000;
/* fitted: 0.06 — divergence per planet radius → the 0–1 fields the sim reads */
const ASCENT_K = 0.06;
/* fitted: 3 days — memory of the column against the diagnostic profile */
const COLUMN_TAU_DAYS = 3;
/* COL5: entrainment dilution rate per level — small so CAPE falls in dry mid-levels */
const ENTRAIN_RATE = 0.03;
/* COL8: lapse rate threshold for tropopause detection (K/km) */
const TROP_LAPSE_THRESH = 2e-3;
/* fitted: 0.02 of the temperature scalar, about 3 K on Earth's mapping — how far
   a cell's surface can move before its column is rebuilt out of turn. Striping
   is only invisible while the surface is quiet: the boot pass runs inside
   `generate`, before the atmosphere has settled, and without this the transient
   it captured stood for a full eight-tick cycle — a Titan reporting 2 675 J/kg
   of convective energy for eight ticks after it had cooled to two. An impact, a
   war winter or an epoch change would each have done the same. */
const AIR_STALE_T = 0.02;

/* Saturation vapour pressure, tabulated. Bolton (1980) eq. 10 over water:
   e_s = 611.2 · exp(17.67 (T − 273.15) / (T − 29.65)) Pa.
   Magnus over ice: e_si = 611.2 · exp(22.46 (T − 273.15) / (T − 0.53)) Pa.
   Tables because the parcel march evaluates them eight times a cell and an exp
   on that path costs more than the whole rest of the loop (COL42). */
const ES_T0 = 180;
const ES_DT = 0.5;
const ES_N = 321;
const ES_WATER = new Float32Array(ES_N);
const ES_ICE = new Float32Array(ES_N);
for (let i = 0; i < ES_N; i++) {
  const T = ES_T0 + i * ES_DT;
  ES_WATER[i] = 611.2 * Math.exp((17.67 * (T - 273.15)) / (T - 29.65));
  ES_ICE[i] = 611.2 * Math.exp((22.46 * (T - 273.15)) / (T - 0.53));
}

/** Saturation vapour pressure, Pa. Ice below 268 K, water above 273.15 K,
 *  linear blend in the supercooled belt (COL42 / COL43 light). */
export function esatPa(tK) {
  const x = (tK - ES_T0) / ES_DT;
  if (!(x > 0)) return ES_ICE[0];
  if (x >= ES_N - 1) return ES_WATER[ES_N - 1];
  const i = x | 0;
  const f = x - i;
  if (tK <= 268) return ES_ICE[i] + (ES_ICE[i + 1] - ES_ICE[i]) * f;
  if (tK >= 273.15) return ES_WATER[i] + (ES_WATER[i + 1] - ES_WATER[i]) * f;
  const ew = ES_WATER[i] + (ES_WATER[i + 1] - ES_WATER[i]) * f;
  const ei = ES_ICE[i] + (ES_ICE[i + 1] - ES_ICE[i]) * f;
  const blend = (tK - 268) / 5.15;
  return ei + (ew - ei) * blend;
}

/* COL31–34: methane saturation (Clausius–Clapeyron with L=510 kJ/kg, M=16 g/mol)
   and CO2 saturation stub for Mars polar (L=571 kJ/kg, M=44 g/mol). */
const CH4_L = 510e3;
const CH4_M = 0.016;
const CH4_T_REF = 111.7;
const CH4_P_REF = 101325;
const CO2_L = 571e3;
const CO2_M = 0.044;
const CO2_T_REF = 194.65;
const CO2_P_REF = 101325;

/** Clausius–Clapeyron esat for methane, Pa (COL31). */
export function esatCH4(tK) {
  if (tK <= 0) return 0;
  return CH4_P_REF * Math.exp((CH4_L / (R_UNIV / (CH4_M * 1000))) * (1 / CH4_T_REF - 1 / tK));
}

/** Clausius–Clapeyron esat for CO2, Pa (COL32 stub). */
export function esatCO2(tK) {
  if (tK <= 0) return 0;
  return CO2_P_REF * Math.exp((CO2_L / (R_UNIV / (CO2_M * 1000))) * (1 / CO2_T_REF - 1 / tK));
}

/** Determine column solvent from rule flags and substrates (COL33). */
export function solventOf(W) {
  if (W.rule?.methaneSolvent || W._worldAxes?.volatile?.v === 'CH4') return 'methane';
  if (W.rule?.co2Solvent) return 'co2';
  return 'water';
}

/**
 * Saturation specific humidity, kg/kg.
 *
 * Written as the mixing ratio folded into `w/(1+w)` rather than the usual
 * `εe/(p − 0.378e)`, because the two are the same expression on Earth and only
 * one of them survives Mars. At six hundred pascals the saturation vapour
 * pressure of water passes the surface pressure outright, the denominator goes
 * through zero, and the direct form returned kilograms of water per kilogram of
 * air — twenty-eight million joules of CAPE and sixteen metres of precipitable
 * water on a planet whose whole atmosphere holds about twenty microns.
 */
export function qsat(tK, pPa) {
  const es = esatPa(tK);
  if (!(pPa > es * 1.0001)) return 1;
  const w = (EPS_W * es) / (pPa - es);
  return w / (1 + w);
}

/** Dewpoint from temperature and relative humidity, K. Bolton inverted. */
export function dewpointK(tK, rh) {
  const e = Math.max(1, esatPa(tK) * clamp(rh, 0.001, 1));
  const l = Math.log(e / 611.2);
  return 273.15 + (243.5 * l) / Math.max(0.05, 17.67 - l);
}

/** Saturated adiabatic lapse rate at (T, p), K/m. Approaches the dry adiabat as
 *  the air cools and the water runs out, which is the correct answer on a cold
 *  world and the reason this cannot be a constant. */
function lapseMoist(tK, pPa, g, Rd, cp) {
  const qs = qsat(tK, pPa);
  const num = 1 + (LV * qs) / (Rd * tK);
  const den = cp + (LV * LV * qs * EPS_W) / (Rd * tK * tK);
  return (g * num) / den;
}

/**
 * The two ends of the environmental lapse rate for a given world, K/m.
 *
 * Both are fractions of that planet's own dry adiabat g/cp, and they have to be:
 * as Earth constants (9.0 and 2.0 K/km) the *floor* was four times Titan's
 * entire dry adiabat, so the floor beat the ceiling, every environment was
 * forced to cool faster than any parcel could climb, and a methane world with no
 * water in it reported eight thousand joules of convective energy.
 */
export function lapseBounds(gravityG = 1, muGmol = 28.96) {
  const g = G0 * clamp(gravityG || 1, 0.05, 4);
  const cp = CP_OVER_R * (R_UNIV / Math.max(2, muGmol || 28.96));
  const adiabat = g / cp;
  return { adiabat, dry: LAPSE_DRY_FRAC * adiabat, floor: LAPSE_FLOOR_FRAC * adiabat };
}

export function allocAir(W, n = NC) {
  if (!W.air) {
    W.air = {
      boot: false, stripe: 0, fresh: null,
      capeMax: 0, capeMean: 0, ehiMax: 0, pwatMean: 0, ascentMean: 0,
      subsidentFrac: 0, regime: 'none', calibrated: false, solvent: 'water',
      freezeMean: 0, elMean: 0, builtAt: -1, debug: 0,
    };
  }
  const need = n * AIR_LEVELS;
  if (!W.airT || W.airT.length !== need) {
    W.airT = new Float32Array(need);
    W.airQ = new Float32Array(need);
    W.airU = new Float32Array(need);
    W.airV = new Float32Array(need);
    W.airZ = new Float32Array(need);
  }
  if (!W.air.fresh || W.air.fresh.length !== n) {
    W.air.fresh = new Float32Array(n);
  }
  if (!W.tropKm || W.tropKm.length !== n) {
    if (!W.cape || W.cape.length !== n) W.cape = new Float32Array(n);
    if (!W.cin || W.cin.length !== n) W.cin = new Float32Array(n);
    if (!W.pwat || W.pwat.length !== n) W.pwat = new Float32Array(n);
    if (!W.lclKm || W.lclKm.length !== n) W.lclKm = new Float32Array(n);
    if (!W.srh || W.srh.length !== n) W.srh = new Float32Array(n);
    if (!W.ehi || W.ehi.length !== n) W.ehi = new Float32Array(n);
    if (!W.ascent || W.ascent.length !== n) W.ascent = new Float32Array(n);
    if (!W.tornadoRisk || W.tornadoRisk.length !== n) W.tornadoRisk = new Float32Array(n);
    if (!W.mlDepthKm || W.mlDepthKm.length !== n) W.mlDepthKm = new Float32Array(n);
    if (!W.freezeKm || W.freezeKm.length !== n) W.freezeKm = new Float32Array(n);
    if (!W.elKm || W.elKm.length !== n) W.elKm = new Float32Array(n);
    if (!W.mlCape || W.mlCape.length !== n) W.mlCape = new Float32Array(n);
    if (!W.sbCape || W.sbCape.length !== n) W.sbCape = new Float32Array(n);
    W.muCape = new Float32Array(n);
    W.tropKm = new Float32Array(n);
    W.capK = new Float32Array(n);
    W.wbzKm = new Float32Array(n);
  }
  return W;
}

/** Drop the column state a new world must not inherit. Called from `generate`. */
export function resetAir(W) {
  allocAir(W);
  if (W.airT) W.airT.fill(0);
  if (W.airQ) W.airQ.fill(0);
  if (W.airU) W.airU.fill(0);
  if (W.airV) W.airV.fill(0);
  if (W.airZ) W.airZ.fill(0);
  if (W.air.fresh) W.air.fresh.fill(-99);
  for (const k of ['cape', 'cin', 'pwat', 'lclKm', 'srh', 'ehi', 'ascent', 'tornadoRisk',
    'mlDepthKm', 'freezeKm', 'elKm', 'mlCape', 'sbCape', 'muCape', 'tropKm', 'capK', 'wbzKm']) {
    if (W[k]?.length === NC) W[k].fill(0);
  }
  W.air.boot = false;
  W.air.stripe = 0;
  W.air.capeMax = 0;
  W.air.capeMean = 0;
  W.air.ehiMax = 0;
  W.air.pwatMean = 0;
  W.air.freezeMean = 0;
  W.air.elMean = 0;
  W.air.regime = 'none';
  W.air.builtAt = -1;
  W.air.debug = 0;
}

function zeroAir(W) {
  allocAir(W);
  resetAir(W);
  W.air.boot = true;
  W.air.regime = 'no column';
}

/**
 * Build the column and its diagnostics.
 *
 * One pass over a stripe of the grid; six levels a cell. Marching upward from
 * the surface keeps the hydrostatic thickness and the parcel ascent on the same
 * loop, which is the only reason this is affordable — the environment profile
 * and the parcel that is being lifted through it are computed together, level by
 * level, and neither is stored twice.
 */
export function airColumnTick(W) {
  if (!W.temp || W.noSurface || W.rule?.airless || !hasSurface(W)) {
    if (!W.air.boot) zeroAir(W);
    return;
  }
  allocAir(W);

  const pbar = livePressureBar(W);
  /* COL40: if gravity too low or pressure negligible, refuse column */
  if (!(pbar > 1e-4) || (W.rule?.gravity || 1) < 0.02) {
    if (!W.air.boot) zeroAir(W);
    return;
  }

  /* COL59: URL debug flag */
  if (typeof globalThis !== 'undefined' && globalThis.location?.search?.includes('air=1')) {
    W.air.debug = 1;
  }

  const g = G0 * clamp(W.rule?.gravity || 1, 0.05, 4);
  const mu = Math.max(2, meanMolecularWeight(W.gases || {}, 0) || 28.96);
  const Rd = R_UNIV / mu;
  /* COL38: cp from composition — CO2-dominated atmospheres have higher cp/R ratio.
     For linear molecules (CO2) cp = 7/2 R; for diatomics (N2/O2) cp = 7/2 R; but
     CO2 at relevant T has vibrational modes → effective factor ~4.5. Use a blend. */
  const co2Frac = clamp(W.gases?.CO2 || 0, 0, 1);
  const cpFactor = CP_OVER_R + co2Frac * 1.0;
  const cp = cpFactor * Rd;
  const psfc = pbar * 1e5;
  const lapseDry = LAPSE_DRY_FRAC * (g / cp);
  const lapseFloor = LAPSE_FLOOR_FRAC * (g / cp);
  /* Whether the absolute temperatures below mean anything. `tempKOf` can only
     state a real kelvin where the ruleset carries `tSurfK`; everywhere else it
     places the world on Earth's scalar mapping, which bottoms out at 208 K. The
     *relative* diagnostics — stability, shear, where the air is rising — hold
     either way; CAPE in joules does not, and the readout has to say which it is
     looking at. */
  /* COL41: ensure all rulesets with surfaces get a calibrated column — if no
     tSurfK is set but teqK exists, use it as a fallback anchor. */
  W.air.calibrated = !!(W.rule?.tSurfK != null || W.rule?.teqK != null || W.rule?.earthLike);
  /* COL31–34: solvent detection — methane columns use dry path for now */
  const methane = !!(W.rule?.methaneSolvent || W._worldAxes?.volatile?.v === 'CH4');
  const moistOk = liquidWaterOk(W) && !methane;
  W.air.solvent = solventOf(W);
  const dtDays = (W.dtYr || 200) * 365.25;
  /* Memory. `exp(−Δt/τ)` is zero to float precision for any tick longer than a
     month, so the blend below is skipped outright rather than multiplied by a
     number that is not there.
     COL21: when the lived weather clock is on, shrink the effective dt the
     blend sees so the column remembers across frames even if geology is paused
     at a long `dtYr`. One sim tick advances the clock by ~1/60 s of real time
     (see `weatherClockTick` in world.js). */
  const wx = W.wxClock;
  let keep;
  if (wx?.enabled && (wx.hoursPerSec || 0) > 0) {
    const wxDaysPerTick = (wx.hoursPerSec / 24) * (1 / 60);
    keep = Math.exp(-wxDaysPerTick / COLUMN_TAU_DAYS);
  } else {
    keep = dtDays > 40 ? 0 : Math.exp(-dtDays / COLUMN_TAU_DAYS);
  }
  const cinBoost = wx?.cinBoost || 0;
  const shearBoost = 1 + (wx?.shearBoost || 0);
  const diurnalHeat = wx?.diurnal > 0 ? 1 + 0.04 * wx.diurnal : 1;

  const full = !W.air.boot;
  const stripe = full ? -1 : (W.air.stripe | 0) % AIR_STRIPES;
  W.air.stripe = ((W.air.stripe | 0) + 1) % AIR_STRIPES;

  const temp = W.temp;
  const vapour = W.vapour;
  const satV = W.satV;
  const windU = W.windU;
  const windV = W.windV;
  const jetU = W.jetU || windU;
  const jetV = W.jetV || windV;
  const converg = W.converg;
  const iceSea = W.iceSea;

  const airT = W.airT;
  const airQ = W.airQ;
  const oAirU = W.airU;
  const oAirV = W.airV;
  const oAirZ = W.airZ;
  /* Locals for every array the loop touches. Reading them off `W` inside the
     inner loop is a property load on the largest object in the program, eight
     times a cell — measured at four fifths of this module's cost. */
  const oCape = W.cape;
  const oCin = W.cin;
  const oPwat = W.pwat;
  const oLcl = W.lclKm;
  const oSrh = W.srh;
  const oEhi = W.ehi;
  const oAsc = W.ascent;
  const oTor = W.tornadoRisk;
  const oMlDepth = W.mlDepthKm;
  const oFreeze = W.freezeKm;
  const oElKm = W.elKm;
  const oMlCape = W.mlCape;
  const oSbCape = W.sbCape;
  const oMuCape = W.muCape;
  const oTropKm = W.tropKm;
  const oCapK = W.capK;
  const oWbzKm = W.wbzKm;
  const hF = W.h;
  const fresh = W.air.fresh;
  const seaLevel = W.seaLevel;
  const moistF = W.moist;
  /* COL55–57: polar night / snowball — read insolation and ice fields */
  const solar = W.solar || 1;

  let capeSum = 0, capeMax = 0, ehiMax = 0, pwatSum = 0, nSeen = 0;
  let ascentSum = 0, subsideArea = 0, landArea = 0;
  let freezeSum = 0, elSum = 0;

  for (let c = 0; c < NC; c++) {
    if (stripe >= 0 && (c & (AIR_STRIPES - 1)) !== stripe
        && Math.abs(temp[c] - fresh[c]) <= AIR_STALE_T) {
      // Not this tick's stripe, and its surface has not moved — the standing
      // values stand, and still count toward the means.
      capeSum += oCape[c];
      pwatSum += oPwat[c];
      freezeSum += oFreeze[c];
      elSum += oElKm[c];
      if (oCape[c] > capeMax) capeMax = oCape[c];
      if (oEhi[c] > ehiMax) ehiMax = oEhi[c];
      nSeen++;
      continue;
    }

    const base = c * AIR_LEVELS;
    fresh[c] = temp[c];
    const tSfc = tempKOf(W, c);
    const rh = satV && vapour
      ? clamp(vapour[c] / Math.max(1e-6, satV[c]), 0.01, 1.02)
      : clamp(moistF ? moistF[c] : 0.5, 0.02, 1);

    /* Vertical velocity from mass continuity: low-level convergence under
       upper-level divergence is ascent. `converg` already carries −div at the
       surface on this scale, so the upper divergence is the only new gradient. */
    const divUp = divEN(jetU, jetV, c) * ASCENT_K;
    const ascent = clamp((converg ? converg[c] : 0) + divUp, -1, 1);
    oAsc[c] = ascent;

    /* How stable the environment is, as a fraction between its two limits. The
       saturated limit is not a constant: the moist adiabat is about 4 K/km in
       warm tropical air, where a kilogram of air is carrying sixteen grams of
       water, and steepens toward the dry value as it cools and the water runs
       out. Holding it at one mid-latitude number was worth several thousand
       joules of imaginary CAPE over every warm ocean, because it made the
       environment far steeper than the adiabat the parcel was climbing. */
    const stability = clamp(1 - rh, 0, 1);
    const subsidence = Math.max(0, -ascent) * SUBSIDENCE_STABILISE;

    const tTrop = TROPOPAUSE_FRAC * tSfc;
    /* Surface humidity from the column water the hydrosphere is carrying, not
       from saturation alone. For an exponential profile q(z) = q₀·e^(−z/Hq) on an
       isothermal pressure scale height Hp, the column integrates to
       PW = q₀·p·Hq / (g·(Hq+Hp)), so inverting it gives the q₀ that reproduces
       exactly the water `hydro.js` says is there. Saturation is then a ceiling
       on top, never the source. */
    const hp = (Rd * tSfc) / g;
    const pwatTarget = (vapour ? vapour[c] : 0) * PWAT_PER_VAPOUR_MM;
    const q0 = (pwatTarget * g * (VAPOUR_SCALE_M + hp)) / (psfc * VAPOUR_SCALE_M);
    const condensableSfc = moistOk && esatPa(tSfc) < psfc;
    const qSfc = condensableSfc ? Math.min(q0, qsat(tSfc, psfc)) : Math.min(q0, 0.05);

    // Parcel state — a surface parcel, lifted.
    let tp = tSfc;
    let qp = qSfc;
    let saturated = condensableSfc && qSfc >= qsat(tSfc, psfc) * 0.999;
    let cape = 0, cin = 0, lfc = false;
    let freezeZ = tSfc <= 273.15 ? 0 : -1;
    let elZ = -1;
    /* COL8: tropopause — first level where lapse < threshold */
    let tropZ = -1;
    /* COL10: cap inversion — warming with height in low levels */
    let capInvK = 0;

    let zPrev = 0, tPrev = tSfc, pPrev = psfc, qPrevEnv = qSfc, pwat = 0;
    let buoyPrev = 0;

    for (let l = 0; l < AIR_LEVELS; l++) {
      const p = psfc * SIGMA[l];
      const dz = ((Rd * tPrev) / g) * LOG_RATIO[l];
      const z = zPrev + dz;

      /* Environment. Its lapse sits between the local moist adiabat and the dry
         one, by how far the air is from saturation — and where the solvent
         cannot condense at this pressure, the moist limit *is* the dry one.
         Evaluated at the bottom of the layer, which is where the lapse across it
         is set. */
      const condensableBelow = moistOk && esatPa(tPrev) < pPrev;
      const lapseSat = condensableBelow ? lapseMoist(tPrev, pPrev, g, Rd, cp) : lapseDry;
      const lapse = clamp(
        lapseSat + stability * (lapseDry - lapseSat) - subsidence,
        lapseFloor,
        lapseDry,
      );
      let tEnv = tPrev - lapse * dz;
      if (tEnv < tTrop) tEnv = tTrop;
      let qEnv = qSfc * Math.exp(-z / VAPOUR_SCALE_M);
      const condensable = moistOk && esatPa(tEnv) < p;
      if (condensable) {
        const qSatEnv = qsat(tEnv, p);
        if (qEnv > qSatEnv) qEnv = qSatEnv;
      }
      if (qEnv < Q_FLOOR) qEnv = Q_FLOOR;

      // Parcel, lifted through it.
      if (!saturated) {
        tp -= (g / cp) * dz;
        if (condensable && qp >= qsat(tp, p)) saturated = true;
      } else if (condensable) {
        tp -= lapseMoist(tp, p, g, Rd, cp) * dz;
        qp = qsat(tp, p);
      } else {
        saturated = false;
        tp -= (g / cp) * dz;
      }
      /* COL5: entrainment — dilute parcel toward environment */
      tp += (tEnv - tp) * ENTRAIN_RATE;
      qp += (qEnv - qp) * ENTRAIN_RATE;
      if (qp < Q_FLOOR) qp = Q_FLOOR;

      const tvp = tp * (1 + 0.61 * qp);
      const tve = tEnv * (1 + 0.61 * qEnv);
      const buoy = (g * (tvp - tve)) / tve;
      const bMean = (buoy + buoyPrev) * 0.5;
      if (bMean > 0) {
        cape += bMean * dz;
        lfc = true;
      } else if (!lfc && SIGMA[l] >= CIN_SIGMA_LIMIT) {
        cin += -bMean * dz;
      }

      // Freezing level (COL11)
      if (freezeZ < 0 && tPrev > 273.15 && tEnv <= 273.15) {
        const fr = (tPrev - 273.15) / Math.max(0.01, tPrev - tEnv);
        freezeZ = zPrev + fr * dz;
      }
      // Equilibrium level (COL13) — top of buoyant layer
      if (lfc && buoy <= 0 && buoyPrev > 0 && elZ < 0) {
        const fr = buoyPrev / Math.max(0.001, buoyPrev - buoy);
        elZ = zPrev + fr * dz;
      }
      /* COL8: tropopause — level where environment approaches tTrop or lapse < threshold */
      if (tropZ < 0 && dz > 0) {
        const lapseHere = (tPrev - tEnv) / dz;
        if (lapseHere < TROP_LAPSE_THRESH || tEnv <= tTrop * 1.02) tropZ = z;
      }
      /* COL10: cap inversion — warming with height in lowest two levels */
      if (l <= 1 && tEnv > tPrev) {
        capInvK += (tEnv - tPrev);
      }

      buoyPrev = buoy;

      // Precipitable water over the layer just crossed, kg/m² = mm.
      pwat += (((qPrevEnv + qEnv) * 0.5) * (pPrev - p)) / g;

      if (keep > 0) {
        airT[base + l] = airT[base + l] * keep + tEnv * (1 - keep);
        airQ[base + l] = airQ[base + l] * keep + qEnv * (1 - keep);
      } else {
        airT[base + l] = tEnv;
        airQ[base + l] = qEnv;
      }

      // Wind per level (COL17) — linear in sigma from surface to jet
      const wFrac = (1 - SIGMA[l]) / (1 - SIGMA[0]);
      oAirU[base + l] = (windU[c] + wFrac * (jetU[c] - windU[c])) * WIND_MS;
      oAirV[base + l] = (windV[c] + wFrac * (jetV[c] - windV[c])) * WIND_MS;
      // Geopotential height (COL7)
      oAirZ[base + l] = z;

      zPrev = z;
      tPrev = tEnv;
      pPrev = p;
      qPrevEnv = qEnv;
    }

    // SBCAPE (COL3)
    cape *= CAPE_GAIN;
    const sbCapeVal = cape;

    /* COL55–57: polar night / snowball — if insolation ≈ 0 or ice > 0.9, force cape ≈ 0 */
    const cellIce = iceSea ? iceSea[c] : 0;
    const lat = Math.abs(DIR[c * 3 + 1]);
    const insolFactor = solar * clamp(1 - lat * 0.7, 0, 1);
    if (insolFactor < 0.01 || cellIce > 0.9) {
      oSbCape[c] = 0;
      oCin[c] = 0;
    } else {
      oSbCape[c] = sbCapeVal * diurnalHeat;
      /* COL24: dawn CIN boost from the weather clock. */
      oCin[c] = Math.min(CIN_MAX, cin * (1 + cinBoost) + cinBoost * 40);
    }
    oPwat[c] = pwat;
    if (lfc && elZ < 0) elZ = zPrev;
    oFreeze[c] = freezeZ >= 0 ? freezeZ / 1000 : 0;
    oElKm[c] = elZ >= 0 ? elZ / 1000 : 0;
    oTropKm[c] = tropZ > 0 ? tropZ / 1000 : 0;
    oCapK[c] = capInvK;
    /* COL12: wet-bulb zero — approximate as freezeKm minus a humidity offset */
    const wbzOffset = clamp((1 - rh) * 0.4, 0, 0.8);
    oWbzKm[c] = freezeZ >= 0 ? Math.max(0, freezeZ / 1000 - wbzOffset) : 0;

    // Mixed-layer depth (COL2) — needed before MUCAPE
    let mlTop = 0;
    if (airT[base] > 0 && tSfc > airT[base]) mlTop = 1;
    if (mlTop > 0 && airT[base + 1] > 0 && tSfc > airT[base + 1]) mlTop = 2;
    const sfcWind = Math.sqrt(windU[c] * windU[c] + windV[c] * windV[c]) * WIND_MS;
    if (sfcWind > 5 && mlTop < 1) mlTop = 1;

    /* COL4: MUCAPE — search lowest 3 levels for max θe parcel */
    let muCapeVal = sbCapeVal;
    if (mlTop >= 1) {
      for (let src = 0; src < Math.min(3, AIR_LEVELS); src++) {
        const tSrc = airT[base + src];
        const qSrc = airQ[base + src];
        if (!(tSrc > 0)) continue;
        const pSrc = psfc * SIGMA[src];
        const thetaE = tSrc * Math.exp((LV * qSrc) / (cp * tSrc));
        const thetaESfc = tSfc * Math.exp((LV * qSfc) / (cp * tSfc));
        if (thetaE <= thetaESfc) continue;
        let mTp = tSrc, mQp = qSrc, mSat = condensableSfc && mQp >= qsat(mTp, pSrc) * 0.999;
        let mCape = 0, mBuoyP = 0, mZp = oAirZ[base + src] || 0;
        let mTprev = tSrc, mPprev = pSrc;
        for (let l2 = src + 1; l2 < AIR_LEVELS; l2++) {
          const pL2 = psfc * SIGMA[l2];
          const dzL2 = ((Rd * mTprev) / g) * LOG_RATIO[l2];
          const condL2 = moistOk && esatPa(mTp) < pL2;
          if (!mSat || !condL2) {
            mSat = mSat && condL2;
            mTp -= (g / cp) * dzL2;
            if (condL2 && mQp >= qsat(mTp, pL2)) mSat = true;
          } else {
            mTp -= lapseMoist(mTp, pL2, g, Rd, cp) * dzL2;
            mQp = qsat(mTp, pL2);
          }
          mTp += (airT[base + l2] - mTp) * ENTRAIN_RATE;
          const tvpM = mTp * (1 + 0.61 * mQp);
          const tveM = airT[base + l2] * (1 + 0.61 * airQ[base + l2]);
          const bM = (g * (tvpM - tveM)) / tveM;
          const bAvg = (bM + mBuoyP) * 0.5;
          if (bAvg > 0) mCape += bAvg * dzL2;
          mBuoyP = bM;
          mTprev = airT[base + l2]; mPprev = pL2;
        }
        mCape *= CAPE_GAIN;
        if (mCape > muCapeVal) muCapeVal = mCape;
      }
    }
    oMuCape[c] = (insolFactor < 0.01 || cellIce > 0.9) ? 0 : muCapeVal;

    oMlDepth[c] = mlTop > 0 ? oAirZ[base + mlTop - 1] / 1000 : 0;

    // MLCAPE (COL3)
    let mlCapeVal = 0;
    if (mlTop > 0) {
      let tMl = tSfc, qMl = qSfc, wt = 1;
      for (let i = 0; i < mlTop; i++) { tMl += airT[base + i]; qMl += airQ[base + i]; wt++; }
      tMl /= wt; qMl /= wt;
      let mlTp = tMl, mlQp = qMl;
      let mlSat = condensableSfc && mlQp >= qsat(mlTp, psfc) * 0.999;
      let mlBuoyPrev = 0, mlZp = 0, mlTprev = tMl, mlPprev = psfc;
      for (let l = 0; l < AIR_LEVELS; l++) {
        const pL = psfc * SIGMA[l];
        const dzL = ((Rd * mlTprev) / g) * LOG_RATIO[l];
        const zL = mlZp + dzL;
        const tEnvL = airT[base + l], qEnvL = airQ[base + l];
        const condL = moistOk && esatPa(tEnvL) < pL;
        if (!mlSat || !condL) {
          mlSat = mlSat && condL;
          mlTp -= (g / cp) * dzL;
          if (condL && mlQp >= qsat(mlTp, pL)) mlSat = true;
        } else {
          mlTp -= lapseMoist(mlTp, pL, g, Rd, cp) * dzL;
          mlQp = qsat(mlTp, pL);
        }
        const tvpM = mlTp * (1 + 0.61 * mlQp);
        const tveM = tEnvL * (1 + 0.61 * qEnvL);
        const bM = (g * (tvpM - tveM)) / tveM;
        const bMeanM = (bM + mlBuoyPrev) * 0.5;
        if (bMeanM > 0) mlCapeVal += bMeanM * dzL;
        mlBuoyPrev = bM;
        mlZp = zL; mlTprev = tEnvL; mlPprev = pL;
      }
      mlCapeVal *= CAPE_GAIN;
    } else {
      mlCapeVal = sbCapeVal;
    }
    /* COL55–57: polar night / snowball clamp on MLCAPE too */
    if (insolFactor < 0.01 || cellIce > 0.9) mlCapeVal = 0;
    else mlCapeVal *= diurnalHeat;
    oMlCape[c] = mlCapeVal;
    const cellCape = mlTop > 0 ? mlCapeVal : oSbCape[c];
    oCape[c] = cellCape;

    /* Cloud base, Espy's rule — 125 m of lift per kelvin of dewpoint depression.
       Cheaper and steadier than reading it off an eight-level march, and it is the
       number that matters for whether a rotating updraught can reach the
       ground. */
    const td = dewpointK(tSfc, rh);
    const lclKm = clamp(0.125 * Math.max(0, tSfc - td), 0, 6);
    oLcl[c] = lclKm;

    /* COL19: curved SRH from 3 wind levels (surface, mid, jet) — the straight
       hodograph base (Bunkers deviation × shear magnitude) plus a curved
       component from the hodograph triangle area via trapezoid. */
    const sfcU = windU[c] * WIND_MS;
    const sfcV = windV[c] * WIND_MS;
    const midU = oAirU[base + 3] || sfcU;
    const midV = oAirV[base + 3] || sfcV;
    const topU = oAirU[base + AIR_LEVELS - 1] || jetU[c] * WIND_MS;
    const topV = oAirV[base + AIR_LEVELS - 1] || jetV[c] * WIND_MS;
    const hemi = DIR[c * 3 + 1] >= 0 ? 1 : -1;
    const sU = (jetU[c] - windU[c]) * WIND_MS * SHEAR_FRAC_3KM;
    const sV = (jetV[c] - windV[c]) * WIND_MS * SHEAR_FRAC_3KM;
    /* COL25: nocturnal low-level shear boost from the weather clock. */
    const shear3 = Math.sqrt(sU * sU + sV * sV) * shearBoost;
    const srhStraight = BUNKERS_DEV_MS * shear3;
    const cross = Math.abs(
      (sfcU * midV - midU * sfcV) +
      (midU * topV - topU * midV) +
      (topU * sfcV - sfcU * topV),
    ) * 0.5;
    const srh = hemi * (srhStraight + cross * 0.03);
    oSrh[c] = srh;

    const ehi = (cellCape * Math.abs(srh)) / EHI_DIVISOR;
    oEhi[c] = ehi;

    /* Tornado potential, as a field rather than an event: supercells need EHI
       past about 1, and it takes a low cloud base for one to put a circulation
       on the ground. Ocean cells keep a value — waterspouts are real — at a
       fraction of the land rate. */
    const lclFactor = clamp(1.6 - lclKm, 0, 1);
    const land = hF[c] >= seaLevel;
    const iced = iceSea ? iceSea[c] : 0;
    oTor[c] = clamp((ehi - 1) * 0.5, 0, 1) * lclFactor * (land ? 1 : 0.25) * (1 - iced);

    capeSum += cellCape;
    pwatSum += pwat;
    freezeSum += oFreeze[c];
    elSum += oElKm[c];
    if (cellCape > capeMax) capeMax = cellCape;
    if (ehi > ehiMax) ehiMax = ehi;
    nSeen++;

    const a = AREA[c];
    ascentSum += ascent * a;
    if (land) {
      landArea += a;
      if (ascent < -0.05) subsideArea += a;
    }
  }

  W.air.boot = true;
  W.air.capeMean = nSeen ? capeSum / nSeen : 0;
  W.air.capeMax = capeMax;
  W.air.ehiMax = ehiMax;
  W.air.pwatMean = nSeen ? pwatSum / nSeen : 0;
  W.air.ascentMean = ascentSum;
  W.air.subsidentFrac = landArea > 0 ? subsideArea / landArea : 0;
  W.air.freezeMean = nSeen ? freezeSum / nSeen : 0;
  W.air.elMean = nSeen ? elSum / nSeen : 0;
  W.air.regime = capeMax > 2500
    ? 'deep convection'
    : capeMax > 800
      ? 'convective'
      : W.air.subsidentFrac > 0.45
        ? 'subsident'
        : 'stable';
  /* COL14: timestamp so readers know the column's age */
  W.air.builtAt = W.tick || W._tickIndex || W.ageYr || 0;
}

/**
 * The sounding at one cell — the thing an instrument face should be able to
 * draw. Levels from the stored column, parcel temperature re-marched so the
 * CAPE area can be shaded.
 */
export function soundingAt(W, c = 0) {
  if (!W?.airT || !W.air || c < 0 || c >= NC) return null;
  const pbar = livePressureBar(W);
  if (!(pbar > 1e-4)) return null;
  const psfc = pbar * 1e5;
  const g = G0 * clamp(W.rule?.gravity || 1, 0.05, 4);
  const mu = Math.max(2, meanMolecularWeight(W.gases || {}, 0) || 28.96);
  const Rd = R_UNIV / mu;
  const cp = CP_OVER_R * Rd;
  const base = c * AIR_LEVELS;
  /* The parcel starts at the *surface*, not at the first stored level — which is
     already 170 m up. Starting it a level too high cooled it by two kelvin and
     made the drawn sounding disagree with the CAPE the tick had computed from
     the same column. */
  const tSfc = tempKOf(W, c);
  const hp = (Rd * tSfc) / g;
  const pwatTarget = (W.vapour ? W.vapour[c] : 0) * PWAT_PER_VAPOUR_MM;
  const q0 = (pwatTarget * g * (VAPOUR_SCALE_M + hp)) / (psfc * VAPOUR_SCALE_M);
  const methaneS = !!(W.rule?.methaneSolvent || W._worldAxes?.volatile?.v === 'CH4');
  const moistOk = liquidWaterOk(W) && !methaneS;
  const condensableSfc = moistOk && esatPa(tSfc) < psfc;
  const qSfc = condensableSfc ? Math.min(q0, qsat(tSfc, psfc)) : Math.min(q0, 0.05);

  let tp = tSfc;
  let qp = qSfc;
  let saturated = condensableSfc && qSfc >= qsat(tSfc, psfc) * 0.999;
  let zPrev = 0, tPrev = tSfc, pPrev = psfc;
  const levels = [];

  for (let l = 0; l < AIR_LEVELS; l++) {
    const p = psfc * SIGMA[l];
    const dz = ((Rd * tPrev) / g) * LOG_RATIO[l];
    const z = zPrev + dz;
    const tEnv = W.airT[base + l];
    const qEnv = W.airQ[base + l];
    const condensable = moistOk && esatPa(tEnv) < p;
    if (!saturated || !condensable) {
      saturated = saturated && condensable;
      tp -= (g / cp) * dz;
      if (condensable && qp >= qsat(tp, p)) saturated = true;
    } else {
      tp -= lapseMoist(tp, p, g, Rd, cp) * dz;
      qp = qsat(tp, p);
    }
    const rhL = condensable ? qEnv / Math.max(1e-9, qsat(tEnv, p)) : 0;
    const storedZ = W.airZ ? W.airZ[base + l] : z;
    levels.push({
      sigma: SIGMA[l],
      pHPa: p / 100,
      zKm: z / 1000,
      geoZ: storedZ,
      tK: tEnv,
      tdK: dewpointK(tEnv, clamp(rhL, 0.001, 1)),
      q: qEnv,
      rh: clamp(rhL, 0, 1.2),
      parcelK: tp,
      uMs: W.airU ? W.airU[base + l] : 0,
      vMs: W.airV ? W.airV[base + l] : 0,
    });
    zPrev = z;
    tPrev = tEnv;
    pPrev = p;
  }

  return {
    cell: c,
    surfaceK: tSfc,
    cape: W.cape?.[c] ?? 0,
    sbCape: W.sbCape?.[c] ?? 0,
    mlCape: W.mlCape?.[c] ?? 0,
    cin: W.cin?.[c] ?? 0,
    pwatMm: W.pwat?.[c] ?? 0,
    lclKm: W.lclKm?.[c] ?? 0,
    srh: W.srh?.[c] ?? 0,
    ehi: W.ehi?.[c] ?? 0,
    ascent: W.ascent?.[c] ?? 0,
    freezeKm: W.freezeKm?.[c] ?? 0,
    elKm: W.elKm?.[c] ?? 0,
    mlDepthKm: W.mlDepthKm?.[c] ?? 0,
    levels,
  };
}

/** One line of sounding, for inspect and the instrument face. */
export function formatSounding(W, c = 0) {
  const s = soundingAt(W, c);
  if (!s) return 'no column';
  const cap = s.cape > 2500 ? 'explosive' : s.cape > 1000 ? 'unstable' : s.cape > 300 ? 'marginal' : 'stable';
  return `CAPE ${s.cape.toFixed(0)} J/kg (${cap}) · CIN ${s.cin.toFixed(0)} · `
    + `PW ${s.pwatMm.toFixed(0)} mm · base ${s.lclKm.toFixed(1)} km · `
    + `SRH ${s.srh.toFixed(0)} m²/s² · ${s.ascent > 0.05 ? 'rising' : s.ascent < -0.05 ? 'sinking' : 'neutral'}`;
}

/** Instrument summary for the Sky dock. Safe on a world that has not built a
 *  column yet — the panel can open before the first tick, and did. */
export function airBudget(W) {
  const a = W?.air || {};
  return {
    regime: a.regime || '—',
    capeMax: a.capeMax || 0,
    capeMean: a.capeMean || 0,
    pwatMean: a.pwatMean || 0,
    ehiMax: a.ehiMax || 0,
    subsidentLandFrac: a.subsidentFrac || 0,
    freezeMean: a.freezeMean || 0,
    elMean: a.elMean || 0,
    levels: AIR_LEVELS,
    calibrated: !!a.calibrated,
    solvent: a.solvent || 'water',
    note: `${AIR_LEVELS}-level column · peak CAPE ${(a.capeMax || 0).toFixed(0)} J/kg · `
      + `mean precipitable water ${(a.pwatMean || 0).toFixed(0)} mm · `
      + `freeze ${(a.freezeMean || 0).toFixed(1)} km · EL ${(a.elMean || 0).toFixed(1)} km`
      + (a.calibrated ? '' : ' · no measured surface temperature: joules are a sketch'),
  };
}
