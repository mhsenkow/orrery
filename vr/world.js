/** World state: fields, generation, coupled tick. */

import { clamp, mulberry32 } from './math.js';
import { NC, AREA, DIR } from './sphere.js';
import { RULESETS } from './rulesets.js';
import { createChronicle, logEvent, maybeNameEra } from './chronicle.js';
import { generateTectonics, tectonicsTick, erosionTick } from './sim/tectonics.js';
import { hydroTick, tsunamiTick, liquidWaterOk, startTsunami } from './sim/hydro.js';
import { atmoTick } from './sim/atmo.js';
import { bioTick, seedLife, LIFE_CLASSES } from './sim/bio.js';
import { gaiaTick } from './sim/gaia.js';

function buf() { return new Float32Array(NC); }
function ibuf() { return new Int32Array(NC); }
function u8() { return new Uint8Array(NC); }

export function createWorld() {
  const W = {
    h: buf(), crust: buf(), age: buf(), rock: u8(), plateId: ibuf(), bound: new Int8Array(NC),
    strain: buf(), ore: buf(), sediment: buf(), ash: buf(), dust: buf(),
    temp: buf(), moist: buf(), precip: buf(), clouds: buf(),
    ice: buf(), iceLand: buf(), iceSea: buf(),
    flow: buf(), lake: buf(),
    windU: buf(), windV: buf(),
    life: buf(), lifeClass: u8(), soil: buf(), nutrientN: buf(), nutrientP: buf(), reef: buf(),
    blackDaisy: buf(), whiteDaisy: buf(),
    _t: buf(), _m: buf(), _l: buf(), _h: buf(), _adv: buf(), _order: new Int32Array(NC),

    gases: { N2: 0.78, O2: 0.01, CO2: 0.04, CH4: 0, H2O: 0.01, dust: 0, sulphate: 0 },
    seaLevel: 0.0, solar: 1, obliquity: 0.4, season: 0, rotationPeriod: 1, greenhouse: 0.1,
    year: 0, seed: 0, rule: RULESETS[0],
    unlockedClass: 0, ozone: 0, bodyScale: 1,
    meanTemp: 0.5, meanLife: 0, iceFrac: 0, landFrac: 0.3, health: 0.5, resilience: 0.5,
    state: 'stable', autopilot: false, plague: 0,
    energy: 100, energyCap: 100, budgetMode: false, energyIncome: 1,
    plates: null, volcanoes: [], hotspots: [], tsunamis: [],
    chron: createChronicle(),
    _waterMass0: null, waterMass: 0, waterDrift: 0,
    _oxEvent: false, pausedSolar: false,
    // render interpolation
    prevTemp: buf(), prevLife: buf(), prevIce: buf(),
  };
  return W;
}

export const W = createWorld();

function chronLog(year, kind, cell, mag, label) {
  logEvent(W.chron, year, kind, cell, mag, label);
}

export function generate(seed, rule) {
  W.seed = seed;
  W.rule = rule;
  W.year = 0;
  W.chron = createChronicle();
  W._waterMass0 = null;
  W._oxEvent = false;
  W.unlockedClass = rule.daisyworld ? 0 : 0;
  W.state = 'stable';
  W.plague = 0;
  W.solar = rule.solar;
  W._baseSolar = rule.solar;
  W._baseObliquity = rule.obliquity;
  W.obliquity = rule.obliquity;
  W._solarMod = 1;
  W.rotationPeriod = rule.rotationPeriod;
  W.season = 0;
  W.gases = { ...rule.gases };
  W.energy = W.energyCap;
  W.ash.fill(0); W.dust.fill(0); W.sediment.fill(0);
  W.soil.fill(0); W.reef.fill(0);
  W.blackDaisy.fill(0); W.whiteDaisy.fill(0);
  W.life.fill(0); W.lifeClass.fill(0);
  W.iceLand.fill(0); W.iceSea.fill(0); W.ice.fill(0);
  W.clouds.fill(0); W.precip.fill(0); W.flow.fill(0); W.lake.fill(0);

  generateTectonics(W, seed, rule);

  // Initial climate guess — warm enough that warmup doesn't snowball
  W.seaLevel = -0.05 + rule.totalWater * 0.42;
  for (let c = 0; c < NC; c++) {
    const lat = Math.abs(DIR[c * 3 + 1]);
    W.temp[c] = clamp(rule.solar * (0.42 + 0.55 * (1 - lat)) + 0.08, 0.15, 1.2);
    W.moist[c] = W.h[c] < W.seaLevel ? 1 : 0.25;
    W.nutrientN[c] = 0.4; W.nutrientP[c] = 0.35;
    // Polar ice seed only
    if (lat > 0.82 && W.temp[c] < rule.freeze + 0.1) {
      W.iceLand[c] = W.h[c] >= W.seaLevel ? 0.6 : 0;
      W.iceSea[c] = W.h[c] < W.seaLevel ? 0.7 : 0;
      W.ice[c] = Math.max(W.iceLand[c], W.iceSea[c]);
    }
  }

  if (rule.daisyworld) {
    const rng = mulberry32(seed);
    for (let c = 0; c < NC; c++) {
      if (rng() < 0.15) W.blackDaisy[c] = 0.3 + rng() * 0.3;
      if (rng() < 0.15) W.whiteDaisy[c] = 0.3 + rng() * 0.3;
      W.life[c] = W.blackDaisy[c] + W.whiteDaisy[c];
      W.h[c] = 0.15 + (mulberry32(seed + c)() - 0.5) * 0.1;
    }
    W.seaLevel = -0.5;
  } else {
    // Seed prokaryotes in habitable cells
    let seeded = 0;
    for (let c = 0; c < NC && seeded < 200; c += 5) {
      if (W.temp[c] > 0.25 && W.temp[c] < 0.85 && (W.h[c] < W.seaLevel || W.moist[c] > 0.15)) {
        W.life[c] = 0.8;
        W.lifeClass[c] = 0;
        seeded++;
      }
    }
  }

  // Geologic + climate warmup so first frame has history
  const warm = rule.daisyworld ? 40 : 55;
  for (let i = 0; i < warm; i++) simTick(true);
  W._waterMass0 = null; // reset drift baseline after warmup
  hydroTick(W);
  W._waterMass0 = W.waterMass;

  chronLog(0, 'genesis', 0, 1, `${rule.name} forms (seed ${seed})`);
  W.prevTemp.set(W.temp);
  W.prevLife.set(W.life);
  W.prevIce.set(W.ice);
}

let _sunDir = [1, 0.3, 0];

export function setSunDir(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  _sunDir = [x / l, y / l, z / l];
}

export function simTick(silent = false) {
  W.prevTemp.set(W.temp);
  W.prevLife.set(W.life);
  W.prevIce.set(W.ice);

  const log = silent ? null : chronLog;

  if (!W.rule.daisyworld && !W.rule.airless) {
    tectonicsTick(W, W.chron, log);
    erosionTick(W);
  }

  atmoTick(W, _sunDir);
  hydroTick(W);
  tsunamiTick(W);
  bioTick(W, log);
  gaiaTick(W, log);

  if (!silent) {
    maybeNameEra(W.chron, W.year, {
      iceFrac: W.iceFrac,
      lifeFrac: W.meanLife,
      O2: W.gases.O2,
      state: W.state,
    });
  }

  W.year += W.rule.daisyworld ? 10 : 200;
}

export function applyImpact(cell, power, log = chronLog) {
  const r = Math.max(1, power * 4);
  for (let c = 0; c < NC; c++) {
    const d = Math.acos(clamp(
      DIR[c * 3] * DIR[cell * 3] + DIR[c * 3 + 1] * DIR[cell * 3 + 1] + DIR[c * 3 + 2] * DIR[cell * 3 + 2],
      -1, 1
    ));
    if (d < r * 0.05) {
      const f = 1 - d / (r * 0.05);
      W.h[c] -= power * 0.12 * f;
      W.temp[c] = Math.min(1.5, W.temp[c] + power * 0.3 * f);
      W.life[c] *= 1 - 0.8 * f;
      W.dust[c] = Math.min(1, W.dust[c] + power * 0.4 * f);
    }
  }
  W.gases.dust = Math.min(0.5, W.gases.dust + power * 0.05);
  W.gases.CO2 = Math.min(0.5, W.gases.CO2 + power * 0.01);
  if (liquidWaterOk(W)) startTsunami(W, cell, power);
  if (log) log(W.year, 'impact', cell, power, `Impact (E=${power.toFixed(2)})`);
}

export { RULESETS, LIFE_CLASSES, seedLife, chronLog };
