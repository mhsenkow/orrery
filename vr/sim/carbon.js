/** Carbon cycle — organic/inorganic reservoirs, O₂ from burial, proxies, acidification.
 *  @provenance tagged-module
 */

import { clamp } from '../math.js';
import { NC, AREA } from '../sphere.js';
import { UNIT_MAP } from './units.js';
export { UNIT_MAP };

/* fitted: 100 — mixing-ratio → reservoir scale */
const ATM_SCALE = 100;
/* fitted: 40 — ocean DIC / atmosphere ratio at init */
const OCEAN_DIC_MULT = 40;
/* invented: 5000 — vast geologic rock stock (relative) */
const ROCK_STOCK0 = 5000;
/* measured: 8.1 — modern surface ocean pH order */
const PH0 = 8.1;
/* measured: 3.5 — aragonite saturation order */
const OMEGA0 = 3.5;
/* measured: 0.00028 — preindustrial pCO₂ (Walker WHK) */
const PCO2_REF = 0.00028;
/* measured: 0.3 — WHK pCO₂ exponent (Walker 1981 shape) */
const WHK_ALPHA = 0.3;
/* fitted: 4 — vascular-plant weathering gain (Berner-ish, not 8×) */
const WHK_PLANT = 4;
/* fitted: 0.00045 — modern-plant outgassing counterpart */
const WHK_KVOLC = 0.00045;
/* numeric: 1e5 — years; dtYr / this → carbon rate norm */
const CARBON_DT_REF_YR = 1e5;
/* fitted: 0.12 — NPP draw rate into biomass path */
const NPP_DRAW = 0.12;
/* fitted: 0.0004 — biomass burial fraction scale */
const BURY_BIO = 0.0004;
/* fitted: 0.0002 — soil burial fraction scale */
const BURY_SOIL = 0.0002;
/* fitted: 0.004 — marine export burial scale */
const BURY_SEA = 0.004;

/** Partition atmospheric CO₂ into playable reservoirs (dimensionless mass units). */
export function createCarbonState(gases) {
  const atmC = (gases.CO2 || 0.0004) * ATM_SCALE;
  return {
    atmosphere: atmC,
    oceanDIC: atmC * OCEAN_DIC_MULT,
    biomass: 0.01,
    soil: 0.05,
    marineSediment: 2,
    rock: ROCK_STOCK0,
    buriedOrg: 0.5,
    methaneClathrate: 0.2,
    coal: 0,
    oil: 0,
    d13C: 0,
    d18O: 0,
    d34S: 0,
    sr87: 0.704,
    surfacePH: PH0,
    omegaAragonite: OMEGA0,
    burialFlux: 0,
    weatheringFlux: 0,
  };
}

export function syncGasesFromCarbon(W) {
  const C = W.carbon;
  if (!C) return;
  W.gases.CO2 = clamp(C.atmosphere / ATM_SCALE, W.rule.minCO2 ?? 0.00005, 0.85);
}

/** Walker–Hays–Kasting silicate weathering in reservoir units per dt=1. */
export function whkWeathering(pCO2, landT, plantsOn) {
  const pFac = Math.pow(Math.max(1e-6, pCO2) / PCO2_REF, WHK_ALPHA);
  const plantGain = plantsOn ? WHK_PLANT : 1;
  return WHK_KVOLC * pFac * Math.max(0.05, landT) * plantGain;
}

export function carbonTick(W, chronLog) {
  const C = W.carbon;
  if (!C || W.rule.daisyworld) return;

  const dt = Math.min(1, (W.dtYr || 200) / CARBON_DT_REF_YR);
  const { life, h, seaLevel, temp, moist, gases } = W;

  // Volcanoes, impacts and the Hadean write gases.CO2; the reservoir is the owner.
  const mapped = C.atmosphere / ATM_SCALE;
  if (gases.CO2 > mapped + 1e-7) {
    C.atmosphere += (gases.CO2 - mapped) * ATM_SCALE;
  }

  // Area-weighted means so rates do not scale with N. AREA is already mean-1.
  const invNC = 1 / Math.max(1, NC);
  let nppW = 0, landBio = 0, seaBio = 0, landRunoffT = 0;
  for (let c = 0; c < NC; c++) {
    const a = AREA[c] * invNC;
    const bio = life[c] * a;
    nppW += bio * (W.npp?.[c] ?? life[c]);
    if (h[c] >= seaLevel) {
      landBio += bio;
      const Tfac = Math.exp(clamp((temp[c] - 0.55) * 4, -4, 4));
      landRunoffT += Tfac * moist[c] * a;
    } else {
      seaBio += bio;
    }
  }

  // Fast cycle is conserved against the biomass pool — life[] is density, not carbon.
  const draw = Math.min(C.atmosphere * 0.2, nppW * NPP_DRAW * dt);
  const release = Math.min(C.biomass * 0.9, C.biomass * 0.1 * dt);
  C.atmosphere = Math.max(0.001, C.atmosphere - draw * 0.3);
  C.oceanDIC = Math.max(0.1, C.oceanDIC - draw * 0.7);
  C.biomass = Math.max(0.001, C.biomass + draw - release);
  C.atmosphere += release * 0.4;
  C.oceanDIC += release * 0.5;
  C.soil += release * 0.1 + landBio * 0.02 * dt;
  C.soil = Math.max(0, C.soil - C.soil * 0.002 * dt);

  // Burial: fraction of biomass + soil escapes reoxidation → O₂ accumulates
  const anoxia = clamp(1 - gases.O2 * 4, 0.05, 1);
  const bury = (C.biomass * BURY_BIO + C.soil * BURY_SOIL + seaBio * BURY_SEA) * anoxia * dt;
  C.burialFlux = bury;
  C.biomass = Math.max(0.001, C.biomass - bury);
  C.buriedOrg += bury;
  C.marineSediment += bury * 0.6;
  C.rock += bury * 0.4;

  // Free O₂ from net organic burial (not from photosynthesis directly)
  // Only after oxygenic photosynthesis exists — otherwise burial has no O₂ source. Item 99.
  const o2Gain = W.transitions?.oxygenicPhotosynthesis ? bury * 0.08 : 0;
  gases.O2 = clamp(gases.O2 + o2Gain - release * 0.0004, 0, 0.4);

  // Reduced sinks: Fe²⁺ ocean consumes O₂ until the reservoir is exhausted (GOE).
  if (!W.transitions?.oxygenicPhotosynthesis) {
    gases.O2 *= 0.999;
  } else if ((W.fe2Ocean || 0) > 0.002) {
    const fe = W.fe2Ocean;
    const sink = Math.min(gases.O2 + 0.002, fe * 0.012 * dt + 0.0004 * dt);
    gases.O2 = Math.max(0, gases.O2 - sink);
    W.fe2Ocean = Math.max(0, fe - sink * 0.8);
  }

  // Silicate weathering thermostat (Walker–Hays–Kasting). Item 105.
  // landRunoffT ≈ 0.12 on a temperate vegetated Earth (land×runoff×Tfac).
  const landT = landRunoffT / 0.12;
  const plantsOn = !!W.transitions?.landPlants;
  const pNow = Math.max(1e-6, C.atmosphere / ATM_SCALE);
  let weather = whkWeathering(pNow, landT, plantsOn) * dt;
  weather += 0.4 * 0.00045 * Math.pow(pNow / 0.00028, 0.3) * dt; // seafloor basalt. provenance: fitted
  const outgas = 0.00045 * 4 * dt; // modern-plant reference volcanic return. provenance: fitted
  C.weatheringFlux = weather;
  C.atmosphere = Math.max(0.001, C.atmosphere - weather * 0.35);
  C.oceanDIC = Math.max(0.1, C.oceanDIC - weather * 0.65);
  C.rock += weather;
  C.atmosphere += outgas;
  C.rock = Math.max(0, C.rock - outgas);
  // Subduction return (Item 107) — slow leak from rock → atmosphere via arcs
  const trenchFrac = countTrenches(W) / Math.max(1, NC);
  const arcReturn = C.marineSediment * 0.00001 * trenchFrac * dt * 50;
  C.marineSediment = Math.max(0, C.marineSediment - arcReturn);
  C.atmosphere += arcReturn;

  // Henry-style ocean ↔ air exchange. Ocean holds ~40× the air inventory.
  const henry = (C.atmosphere - C.oceanDIC / 40) * 0.08 * dt;
  C.atmosphere = Math.max(0.001, C.atmosphere - henry);
  C.oceanDIC = Math.max(0.1, C.oceanDIC + henry);

  // Ocean acidification from atm CO₂. Item 110.
  const pCO2 = gases.CO2;
  C.surfacePH = clamp(8.2 - Math.log10(Math.max(1e-6, pCO2 / 0.00028)) * 0.35, 6.5, 8.4);
  C.omegaAragonite = clamp(3.5 * Math.pow(0.00028 / Math.max(1e-6, pCO2), 0.4)
    * Math.pow(10, (C.surfacePH - 8.1) * 0.3), 0.2, 6);

  // Biological pump / CCD sketch. Item 108.
  const pump = seaBio * 0.0001 * dt;
  C.oceanDIC = Math.max(0.1, C.oceanDIC - pump);
  C.marineSediment += pump * (C.omegaAragonite > 1 ? 1 : 0.2);

  // Coal window (Carboniferous) & oil (Jurassic–Cretaceous anoxia). Item 111.
  const ma = (4.567e9 - W.ageYr) / 1e6;
  const noLigninDecay = W.guilds?.decomposer < 0.05;
  if (ma < 360 && ma > 290 && noLigninDecay && landBio > 0.5) {
    C.coal += landBio * 0.00005 * dt;
  }
  if (((ma < 200 && ma > 140) || (ma < 100 && ma > 65)) && anoxia > 0.5) {
    C.oil += seaBio * 0.00003 * dt;
  }

  // Clathrate release under rapid warming (PETM-style). Item 109.
  if (W.meanTemp > 0.7 && C.methaneClathrate > 0.01) {
    const releaseCH4 = Math.min(C.methaneClathrate, (W.meanTemp - 0.7) * 0.02 * dt);
    C.methaneClathrate -= releaseCH4;
    gases.CH4 = Math.min(0.01, (gases.CH4 || 0) + releaseCH4 * 0.01);
    C.atmosphere += releaseCH4 * 0.5;
    if (chronLog && releaseCH4 > 0.005) {
      chronLog(W.year, 'carbon', 0, releaseCH4, 'Clathrate methane release');
    }
  }
  gases.CH4 = Math.max(0, (gases.CH4 || 0) * (1 - 0.002 * dt)); // oxidize

  // Isotope proxies. Item 112.
  const buryFrac = bury / Math.max(1e-9, draw + bury);
  C.d13C = clamp(-1 + buryFrac * 6, -6, 8); // higher burial → heavier DIC
  C.d18O = clamp((0.45 - W.meanTemp) * 8 + W.iceFrac * 4, -5, 5);
  C.d34S = clamp((W.guilds?.sulfateReducer || 0) * 20 - 5, -10, 30);
  C.sr87 = 0.704 + C.weatheringFlux * 0.5;

  // Lomagundi-ish excursion tracking
  if (C.d13C > 5 && !W._lomagundi) {
    W._lomagundi = true;
    if (chronLog) chronLog(W.year, 'isotope', 0, C.d13C, 'Lomagundi-scale δ¹³C excursion');
  }

  syncGasesFromCarbon(W);
  // Modern Earth: soft CO₂ thermostat toward the ruleset target so the toy
  // carbon reservoirs don't wander into multi-thousand ppm over a play session.
  // Player CO₂ inject sets `_playerCO2HoldYr` — while that hold is live we do
  // *not* slam back to ≤1200 ppm (that made the CO₂ tool look broken after one
  // click). Weathering still drains via WHK above; this only skips the Holocene
  // soft restore.
  if (W.rule.earthLike && !W.rule.deepTime) {
    const target = W.rule.gases?.CO2 ?? W.rule.minCO2 ?? 0.00042;
    const floor = W.rule.minCO2 ?? 0.00038;
    const hold = W._playerCO2HoldYr != null && W.ageYr < W._playerCO2HoldYr;
    if (hold) {
      gases.CO2 = clamp(gases.CO2, floor, 0.08);
      C.atmosphere = gases.CO2 * 100;
    } else {
      const pull = 0.04; // ~few-dozen-tick restore
      gases.CO2 = clamp(gases.CO2 + (target - gases.CO2) * pull, floor, 0.0012);
      C.atmosphere = gases.CO2 * 100;
    }
  }
  // Seasonal Keeling sawtooth from land NPP × NH season (fitted amplitude)
  if ((W.landLifeFrac || 0) > 0.08 && (W.meanLife || 0) > 0.05) {
    const nh = Math.sin(W.season || 0); // + = NH warm / drawdown
    const amp = 0.000004 * Math.min(1, W.landLifeFrac * 2); // invented for legibility
    gases.CO2 = Math.max(1e-6, gases.CO2 - nh * amp);
  }
  W.keelingHistory = W.keelingHistory || [];
  if (W.keelingHistory.length > 2000) W.keelingHistory.shift();
  W.keelingHistory.push({ t: W.ageYr, co2: gases.CO2, d13C: C.d13C });
}

function countTrenches(W) {
  if (!W.bound) return 1;
  let n = 0;
  for (let c = 0; c < NC; c++) if (W.bound[c] === 1) n++; // CONV
  return n;
}
