/** Carbon cycle — organic/inorganic reservoirs, O₂ from burial, proxies, acidification.
 *  Backlog items 98–112. */

import { clamp } from '../math.js';
import { NC, AREA } from '../sphere.js';

/** Partition atmospheric CO₂ into playable reservoirs (dimensionless mass units). */
export function createCarbonState(gases) {
  const atmC = (gases.CO2 || 0.0004) * 100; // scale mixing ratio → reservoir units
  return {
    atmosphere: atmC,
    oceanDIC: atmC * 40,      // ocean holds far more DIC than air
    biomass: 0.01,
    soil: 0.05,
    marineSediment: 2,
    rock: 5000,             // vast geologic stock
    buriedOrg: 0.5,         // organic carbon in rock (O₂ source when buried)
    methaneClathrate: 0.2,
    coal: 0,
    oil: 0,
    d13C: 0,                // δ¹³C proxy (‰)
    d18O: 0,
    d34S: 0,
    sr87: 0.704,
    surfacePH: 8.1,
    omegaAragonite: 3.5,    // carbonate saturation
    burialFlux: 0,
    weatheringFlux: 0,
  };
}

export function syncGasesFromCarbon(W) {
  const C = W.carbon;
  if (!C) return;
  // Map atmosphere reservoir back to mixing ratio (keep other gases)
  W.gases.CO2 = clamp(C.atmosphere / 100, W.rule.minCO2 ?? 0.00005, 0.85);
}

/**
 * Photosynthesis / respiration cancel; free O₂ only from organic burial. Item 99.
 * dtYr scales rates so deep-time ticks still conserve sense.
 */
export function carbonTick(W, chronLog) {
  const C = W.carbon;
  if (!C || W.rule.daisyworld) return;

  const dt = Math.min(1, (W.dtYr || 200) / 1e5); // normalize to ~100 kyr reference
  const { life, h, seaLevel, temp, moist, gases } = W;

  let npp = 0, respir = 0, landBio = 0, seaBio = 0;
  for (let c = 0; c < NC; c++) {
    const bio = life[c] * AREA[c];
    npp += bio * (W.npp?.[c] ?? life[c]) * 0.02;
    respir += bio * 0.018;
    if (h[c] >= seaLevel) landBio += bio;
    else seaBio += bio;
  }

  // Fast cycle: NPP draws DIC/atm → biomass; respiration returns it
  const draw = npp * dt;
  const release = respir * dt;
  const fromAtm = draw * 0.3;
  const fromOcean = draw * 0.7;
  C.atmosphere = Math.max(0.001, C.atmosphere - fromAtm);
  C.oceanDIC = Math.max(0.1, C.oceanDIC - fromOcean);
  C.biomass += draw - release;
  C.atmosphere += release * 0.4;
  C.oceanDIC += release * 0.5;
  C.soil += release * 0.1 + landBio * 0.0002 * dt;
  C.soil = Math.max(0, C.soil - C.soil * 0.002 * dt); // soil respiration

  // Burial: fraction of biomass + soil escapes reoxidation → O₂ accumulates
  const anoxia = clamp(1 - gases.O2 * 4, 0.05, 1);
  const bury = (C.biomass * 0.0004 + C.soil * 0.0002 + seaBio * 0.00015) * anoxia * dt;
  C.burialFlux = bury;
  C.biomass = Math.max(0.001, C.biomass - bury);
  C.buriedOrg += bury;
  C.marineSediment += bury * 0.6;
  C.rock += bury * 0.4;

  // Free O₂ from net organic burial (not from photosynthesis directly)
  // Only after oxygenic photosynthesis exists — otherwise burial has no O₂ source. Item 99.
  const o2Gain = W.transitions?.oxygenicPhotosynthesis ? bury * 0.08 : 0;
  gases.O2 = clamp(gases.O2 + o2Gain - release * 0.00002, 0, 0.4);

  // Reduced sinks early: Fe²⁺, volcanics consume O₂ until overwhelmed (GOE)
  if (!W.transitions?.oxygenicPhotosynthesis) {
    gases.O2 *= 0.999;
  } else if (gases.O2 < 0.02) {
    const sink = (W.fe2Ocean || 0.3) * 0.0003 * dt;
    gases.O2 = Math.max(0, gases.O2 - sink);
    W.fe2Ocean = Math.max(0, (W.fe2Ocean || 0.3) - sink * 2);
  }

  // Silicate weathering thermostat (Walker–Hays–Kasting). Item 105.
  let weather = 0;
  const plantGain = (W.transitions?.landPlants ? 8 : 1); // Item 106
  for (let c = 0; c < NC; c++) {
    if (h[c] < seaLevel) continue;
    const runoff = moist[c];
    const Tfac = Math.exp(clamp((temp[c] - 0.45) * 4, -3, 3));
    weather += Tfac * runoff * AREA[c] * 0.000012 * plantGain;
  }
  weather *= dt;
  C.weatheringFlux = weather;
  C.atmosphere = Math.max(0.001, C.atmosphere - weather);
  C.oceanDIC += weather * 0.9;
  // Subduction return (Item 107) — slow leak from rock → atmosphere via arcs
  const trenchFrac = countTrenches(W) / Math.max(1, NC);
  const arcReturn = C.marineSediment * 0.00001 * trenchFrac * dt * 50;
  C.marineSediment = Math.max(0, C.marineSediment - arcReturn);
  C.atmosphere += arcReturn;

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
  if (W.rule.earthLike && !W.rule.deepTime) {
    const target = W.rule.gases?.CO2 ?? W.rule.minCO2 ?? 0.00042;
    const floor = W.rule.minCO2 ?? 0.00038;
    const pull = 0.04; // ~few-dozen-tick restore
    gases.CO2 = clamp(gases.CO2 + (target - gases.CO2) * pull, floor, 0.0012);
    C.atmosphere = gases.CO2 * 100;
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

/** SI calibration map for HUD / docs. Item 198. */
export const UNIT_MAP = {
  temp: { sim: '0–1.6 field', si: 'approx °C via (T−0.5)*80+15 on Earth', note: 'fitted' },
  life: { sim: '0–1 density', si: 'relative biomass / carrying capacity', note: 'invented' },
  ageYr: { sim: 'years since CAI', si: 'a (years)', note: 'measured' },
  CO2: { sim: 'volume mixing ratio', si: 'mol/mol', note: 'measured' },
  carbon: { sim: 'reservoir units', si: '~relative GtC', note: 'fitted' },
  dtYr: { sim: 'years per tick', si: 'a/tick', note: 'invented for legibility' },
};
