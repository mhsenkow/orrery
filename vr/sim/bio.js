/** Biosphere: evolutionary ladder, tolerances, carbon coupling, Daisyworld. */

import { clamp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { totalPressure } from '../rulesets.js';

/** Life classes in evolutionary order. */
export const LIFE_CLASSES = [
  { id: 'prokaryote', minO2: 0, maxO2: 1, tMin: 0.15, tMax: 0.95, mMin: 0.05, needUV: false, trophic: 0 },
  { id: 'eukaryote', minO2: 0.01, maxO2: 1, tMin: 0.2, tMax: 0.9, mMin: 0.08, needUV: false, trophic: 0 },
  { id: 'multicellular', minO2: 0.02, maxO2: 1, tMin: 0.25, tMax: 0.88, mMin: 0.1, needUV: false, trophic: 0 },
  { id: 'arthropod', minO2: 0.08, maxO2: 1, tMin: 0.28, tMax: 0.85, mMin: 0.12, needUV: true, trophic: 1 },
  { id: 'fish', minO2: 0.05, maxO2: 1, tMin: 0.3, tMax: 0.8, mMin: 0.5, aquatic: true, needUV: false, trophic: 1 },
  { id: 'amphibian', minO2: 0.1, maxO2: 1, tMin: 0.32, tMax: 0.78, mMin: 0.35, needUV: true, trophic: 1 },
  { id: 'reptile', minO2: 0.12, maxO2: 1, tMin: 0.35, tMax: 0.92, mMin: 0.1, needUV: true, trophic: 2 },
  { id: 'mammal', minO2: 0.15, maxO2: 1, tMin: 0.3, tMax: 0.75, mMin: 0.15, needUV: true, trophic: 2 },
];

function envelopeOk(cls, t, m, O2, uvOk, isSea) {
  if (t < cls.tMin || t > cls.tMax) return 0;
  if (m < (cls.mMin || 0)) return 0;
  if (O2 < cls.minO2 || O2 > cls.maxO2) return 0;
  if (cls.needUV && !uvOk) return 0;
  if (cls.aquatic && !isSea) return 0;
  if (!cls.aquatic && isSea && cls.id !== 'prokaryote' && cls.id !== 'eukaryote' && cls.id !== 'fish') return 0.15;
  return 1;
}

export function carryingCapacity(W, c) {
  const insol = Math.max(0.05, W.temp[c]); // proxy already includes insolation history
  const water = W.h[c] < W.seaLevel ? 1 : W.moist[c];
  const nut = Math.min(W.nutrientN[c], W.nutrientP[c]);
  return clamp(insol * water * (0.3 + nut * 0.7), 0, 1);
}

export function bioTick(W, chronLog) {
  const R = W.rule;
  if (R.daisyworld) return daisyTick(W, chronLog);

  const { life, lifeClass, temp, moist, h, seaLevel, gases, _l, ash } = W;
  const O2 = gases.O2;
  const uvOk = W.ozone > 0.25 || h[0] < seaLevel; // land needs ozone
  const Ptot = totalPressure(gases);

  let photosynth = 0, respir = 0;
  let maxClass = 0;

  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const landUV = isSea || W.ozone > 0.25;
    const cap = carryingCapacity(W, c);
    // Highest class that fits
    let best = 0, fit = 0;
    for (let i = 0; i < LIFE_CLASSES.length; i++) {
      const f = envelopeOk(LIFE_CLASSES[i], temp[c], moist[c], O2, landUV, isSea);
      if (f > 0 && i <= W.unlockedClass) {
        best = i;
        fit = f;
      }
    }
    // Chemosynthesis at hotspots / vents (divergent)
    if (W.bound[c] === 0 && isSea) {
      fit = Math.max(fit, 0.4);
      best = Math.max(best, 0);
    }

    const hab = fit * cap * (1 - ash[c] * 0.5);
    const c4 = c * 4;
    if (hab > 0.02) {
      const nl = Math.max(life[NBR[c4]], life[NBR[c4 + 1]], life[NBR[c4 + 2]], life[NBR[c4 + 3]]);
      _l[c] = clamp(life[c] + hab * 0.04 + nl * hab * 0.05, 0, cap);
      lifeClass[c] = best;
      maxClass = Math.max(maxClass, best);
      // Carbon coupling (slow — geologic + biological timescales compressed carefully)
      const bio = _l[c] * AREA[c];
      photosynth += bio * 0.00000004;
      respir += bio * 0.000000015;
    } else {
      _l[c] = Math.max(0, life[c] - 0.06);
      if (_l[c] < 0.02) lifeClass[c] = 0;
    }

    // Soil builds from life, lost to low moisture
    if (!isSea) {
      W.soil[c] = clamp(W.soil[c] + life[c] * 0.002 - (1 - moist[c]) * 0.001, 0, 1);
      W.nutrientN[c] = clamp(0.3 + W.soil[c] * 0.4 + W.sediment[c] * 0.3 + (W.bound[c] === 1 ? 0.2 : 0), 0, 1);
      W.nutrientP[c] = clamp(0.25 + W.ore[c] * 0.3 + W.sediment[c] * 0.4, 0, 1);
    }
  }
  life.set(_l);

  gases.CO2 = clamp(gases.CO2 - photosynth + respir, 0.0008, 0.6);
  gases.O2 = clamp(gases.O2 + photosynth * 0.9 - respir * 0.5, 0, 0.35);

  // Unlock next class when conditions hold globally (paced)
  if (W.unlockedClass < LIFE_CLASSES.length - 1) {
    const next = LIFE_CLASSES[W.unlockedClass + 1];
    const yearsNeeded = (W.unlockedClass + 1) * 8000;
    if (O2 >= next.minO2 && (W.meanLife || 0) > 0.1 && W.year >= yearsNeeded) {
      W.unlockedClass++;
      if (chronLog) chronLog(W.year, 'evolution', 0, W.unlockedClass, `Evolution: ${next.id}`);
    }
  }

  // Great Oxygenation: rapid O2 rise kills anaerobes
  if (gases.O2 > 0.05 && !W._oxEvent && photosynth > respir * 2) {
    W._oxEvent = true;
    for (let c = 0; c < NC; c++) {
      if (lifeClass[c] === 0) life[c] *= 0.3;
    }
    if (chronLog) chronLog(W.year, 'oxygenation', 0, gases.O2, 'Great Oxygenation Event');
  }

  // Predator–prey oscillation on herbivore/carnivore biomass scalars
  W.herbivore = W.herbivore ?? 0.2;
  W.carnivore = W.carnivore ?? 0.05;
  const prod = W.meanLife || 0.1;
  const dH = 0.04 * W.herbivore * (prod - W.carnivore * 0.8);
  const dC = 0.03 * W.carnivore * (W.herbivore - 0.15);
  W.herbivore = clamp(W.herbivore + dH, 0.01, 1);
  W.carnivore = clamp(W.carnivore + dC, 0.01, 0.8);

  // Body size scaling with O2 (Carboniferous)
  W.bodyScale = 0.7 + gases.O2 * 2.5;

  // Reef band
  for (let c = 0; c < NC; c++) {
    const depth = W.seaLevel - h[c];
    W.reef[c] = depth > 0 && depth < 0.08 && temp[c] > 0.45 && temp[c] < 0.75 && gases.O2 > 0.05
      ? clamp(life[c] * 1.2, 0, 1) : W.reef[c] * 0.95;
  }

  // Disease flash
  if (W.plague > 0) {
    for (let c = 0; c < NC; c++) {
      if (life[c] > 0.2 && Math.random() < W.plague * 0.02) {
        life[c] *= 0.7;
        for (let k = 0; k < 4; k++) {
          if (Math.random() < 0.3) W.plague = Math.min(1, W.plague + 0.001);
        }
      }
    }
    W.plague *= 0.98;
  }
}

function daisyTick(W, chronLog) {
  // Classic Daisyworld: black/white daisies regulate albedo vs solar
  const { temp, blackDaisy, whiteDaisy, _l, life } = W;
  const lumin = W.solar;
  let sumT = 0;
  for (let c = 0; c < NC; c++) {
    const bare = clamp(1 - blackDaisy[c] - whiteDaisy[c], 0, 1);
    const alb = blackDaisy[c] * 0.25 + whiteDaisy[c] * 0.75 + bare * 0.5;
    const local = lumin * (1 - alb);
    temp[c] = clamp(temp[c] * 0.7 + local * 0.55, 0, 1.4);
    sumT += temp[c] * AREA[c];

    // Growth: black prefer cool, white prefer warm
    const tb = temp[c];
    const growB = clamp(1 - Math.abs(tb - 0.4) / 0.3, 0, 1) * bare;
    const growW = clamp(1 - Math.abs(tb - 0.7) / 0.3, 0, 1) * bare;
    blackDaisy[c] = clamp(blackDaisy[c] + growB * 0.08 - 0.03, 0, 0.9);
    whiteDaisy[c] = clamp(whiteDaisy[c] + growW * 0.08 - 0.03, 0, 0.9);
    life[c] = blackDaisy[c] + whiteDaisy[c];
    _l[c] = life[c];
  }
  W.meanTemp = sumT / NC;
  // Brightening sun scenario
  if (!W.pausedSolar) W.rule.solar = Math.min(1.6, W.rule.solar + 0.00015);
}

export function seedLife(W, cell, classIndex) {
  const cls = Math.min(classIndex, W.unlockedClass);
  W.life[cell] = 1;
  W.lifeClass[cell] = cls;
  for (let k = 0; k < 4; k++) {
    const n = NBR[cell * 4 + k];
    W.life[n] = Math.max(W.life[n], 0.6);
    W.lifeClass[n] = cls;
  }
}
