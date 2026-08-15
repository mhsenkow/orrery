/** Biosphere: evolutionary ladder, tolerances, carbon coupling, Daisyworld.
 *  Tuned for LEGIBLE growth — blooms you can see spreading within a minute. */

import { clamp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { totalPressure } from '../rulesets.js';

/** Life classes in evolutionary order. */
export const LIFE_CLASSES = [
  { id: 'prokaryote', minO2: 0, maxO2: 1, tMin: 0.1, tMax: 0.99, mMin: 0.14, needUV: false, trophic: 0 },
  { id: 'eukaryote', minO2: 0.005, maxO2: 1, tMin: 0.15, tMax: 0.95, mMin: 0.16, needUV: false, trophic: 0 },
  { id: 'multicellular', minO2: 0.015, maxO2: 1, tMin: 0.18, tMax: 0.92, mMin: 0.18, needUV: false, trophic: 0 },
  { id: 'arthropod', minO2: 0.06, maxO2: 1, tMin: 0.26, tMax: 0.88, mMin: 0.1, needUV: true, trophic: 1 },
  { id: 'fish', minO2: 0.04, maxO2: 1, tMin: 0.28, tMax: 0.82, mMin: 0.35, aquatic: true, needUV: false, trophic: 1 },
  { id: 'amphibian', minO2: 0.08, maxO2: 1, tMin: 0.3, tMax: 0.8, mMin: 0.22, needUV: true, trophic: 1 },
  { id: 'reptile', minO2: 0.1, maxO2: 1, tMin: 0.32, tMax: 0.94, mMin: 0.08, needUV: true, trophic: 2 },
  { id: 'mammal', minO2: 0.12, maxO2: 1, tMin: 0.28, tMax: 0.78, mMin: 0.12, needUV: true, trophic: 2 },
];

function envelopeOk(cls, t, m, O2, uvOk, isSea) {
  if (t < cls.tMin || t > cls.tMax) return 0;
  if (m < (cls.mMin || 0)) return 0;
  if (O2 < cls.minO2 || O2 > cls.maxO2) return 0;
  if (cls.needUV && !uvOk) return 0;
  if (cls.aquatic && !isSea) return 0;
  if (!cls.aquatic && isSea && cls.id !== 'prokaryote' && cls.id !== 'eukaryote' && cls.id !== 'fish') return 0.2;
  return 1;
}

export function carryingCapacity(W, c) {
  const insol = Math.max(0.15, W.temp[c]);
  const water = W.h[c] < W.seaLevel ? 1 : Math.max(0.2, W.moist[c]);
  const nut = Math.min(W.nutrientN[c], W.nutrientP[c]);
  // Floor high enough that forests read as solid canopy, not mid-green sludge
  const raw = insol * water * (0.5 + nut * 0.55);
  return clamp(0.55 + raw * 0.45, 0.55, 1);
}

export function bioTick(W, chronLog) {
  const R = W.rule;
  if (R.daisyworld) return daisyTick(W, chronLog);

  const { life, lifeClass, temp, moist, h, seaLevel, gases, _l, ash } = W;
  const O2 = gases.O2;

  let photosynth = 0, respir = 0;
  let grown = 0, died = 0;
  const prevMean = W.meanLife || 0;

  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const landUV = isSea || W.ozone > 0.15;
    const cap = Math.max(0.35, carryingCapacity(W, c));
    let best = 0, fit = 0;
    for (let i = 0; i < LIFE_CLASSES.length; i++) {
      const f = envelopeOk(LIFE_CLASSES[i], temp[c], moist[c], O2, landUV, isSea);
      if (f > 0 && i <= W.unlockedClass) {
        best = i;
        fit = f;
      }
    }
    // Chemosynthesis at vents
    if (W.bound[c] === 0 && isSea) {
      fit = Math.max(fit, 0.55);
      best = Math.max(best, 0);
    }
    // Reef / shallow shelf favour
    if (isSea && (seaLevel - h[c]) < 0.1 && temp[c] > 0.4) fit = Math.max(fit, 0.5);

    // Light ice slows growth but doesn't instantly sterilize canopy
    const icePen = isSea ? 1 : (1 - clamp(W.ice[c] - 0.25, 0, 1) * 0.7);
    const hab = fit * (1 - ash[c] * 0.55) * icePen;
    const c4 = c * 4;
    const depth = isSea ? (seaLevel - h[c]) : 0;
    const seaCap = isSea ? (depth < 0.1 ? 0.85 : depth < 0.2 ? 0.25 : 0.05) : 1;
    // Arid cells stay barren unless already colonized — keeps brown contrast
    const aridGate = (!isSea && moist[c] < 0.16 && life[c] < 0.12) ? 0 : 1;
    const maxL = Math.min(1, (cap + 0.1) * seaCap) * (aridGate ? 1 : 0);
    if (hab > 0.02 && temp[c] > 0.12 && maxL > 0.05 && aridGate) {
      const nl = Math.max(life[NBR[c4]], life[NBR[c4 + 1]], life[NBR[c4 + 2]], life[NBR[c4 + 3]]);
      // Frontier fills empties next to canopy — visible spread over ~30–60 ticks
      const frontier = nl > 0.2 && life[c] < 0.35 ? 0.28 : 0.1;
      const growth = hab * frontier + nl * hab * 0.14;
      const before = life[c];
      _l[c] = clamp(life[c] + growth, 0, maxL);
      if (_l[c] > before + 0.015) grown++;
      lifeClass[c] = best;
      const bio = _l[c] * AREA[c];
      photosynth += bio * 0.00000008;
      respir += bio * 0.000000025;
    } else {
      const before = life[c];
      const die = aridGate ? 0.035 : 0.06;
      _l[c] = Math.max(0, life[c] - die);
      if (_l[c] < before - 0.01) died++;
      if (_l[c] < 0.02) lifeClass[c] = 0;
    }

    if (!isSea) {
      W.soil[c] = clamp(W.soil[c] + life[c] * 0.004 - (1 - moist[c]) * 0.001, 0, 1);
      W.nutrientN[c] = clamp(0.35 + W.soil[c] * 0.4 + W.sediment[c] * 0.3 + (W.bound[c] === 1 ? 0.2 : 0), 0, 1);
      W.nutrientP[c] = clamp(0.3 + W.ore[c] * 0.3 + W.sediment[c] * 0.4, 0, 1);
      // Mild local moistening — helps fronts creep, doesn't erase deserts
      if (_l[c] > 0.5 && moist[c] > 0.18) {
        moist[c] = Math.min(0.75, moist[c] + 0.012);
      }
    }

    // Phytoplankton / reef signal in shallow seas
    if (isSea && depth > 0 && depth < 0.12 && temp[c] > 0.35 && temp[c] < 0.85) {
      W.reef[c] = clamp(Math.max(W.reef[c], _l[c] * 1.1), 0, 1);
    } else {
      W.reef[c] *= 0.92;
    }
  }
  life.set(_l);

  gases.CO2 = clamp(gases.CO2 - photosynth + respir, 0.0008, 0.6);
  gases.O2 = clamp(gases.O2 + photosynth * 0.9 - respir * 0.5, 0, 0.35);

  if (W.unlockedClass < LIFE_CLASSES.length - 1) {
    const next = LIFE_CLASSES[W.unlockedClass + 1];
    const yearsNeeded = (W.unlockedClass + 1) * 5000;
    if (O2 >= next.minO2 && (W.meanLife || 0) > 0.12 && W.year >= yearsNeeded) {
      W.unlockedClass++;
      if (chronLog) chronLog(W.year, 'evolution', 0, W.unlockedClass, `Evolution: ${next.id}`);
    }
  }

  if (gases.O2 > 0.05 && !W._oxEvent && photosynth > respir * 2) {
    W._oxEvent = true;
    for (let c = 0; c < NC; c++) {
      if (lifeClass[c] === 0) life[c] *= 0.35;
    }
    if (chronLog) chronLog(W.year, 'oxygenation', 0, gases.O2, 'Great Oxygenation Event');
  }

  W.herbivore = W.herbivore ?? 0.2;
  W.carnivore = W.carnivore ?? 0.05;
  const prod = W.meanLife || 0.1;
  W.herbivore = clamp(W.herbivore + 0.05 * W.herbivore * (prod - W.carnivore * 0.8), 0.01, 1);
  W.carnivore = clamp(W.carnivore + 0.04 * W.carnivore * (W.herbivore - 0.15), 0.01, 0.8);
  W.bodyScale = 0.7 + gases.O2 * 2.5;

  if (W.plague > 0) {
    for (let c = 0; c < NC; c++) {
      if (life[c] > 0.2 && Math.random() < W.plague * 0.03) life[c] *= 0.55;
    }
    W.plague *= 0.97;
  }

  // Discernible bloom / dieback events for chronicle + HUD
  W.lifeGrown = grown;
  W.lifeDied = died;
  const delta = (W.meanLife || 0) - prevMean;
  if (chronLog && Math.abs(delta) > 0.04) {
    chronLog(W.year, delta > 0 ? 'bloom' : 'dieback', 0, Math.abs(delta),
      delta > 0 ? 'Biosphere bloom' : 'Biosphere dieback');
  }
}

function daisyTick(W, chronLog) {
  const { temp, blackDaisy, whiteDaisy, life } = W;
  const lumin = W.solar;
  let sumT = 0, sumLife = 0;
  let grown = 0;
  for (let c = 0; c < NC; c++) {
    const bare = clamp(1 - blackDaisy[c] - whiteDaisy[c], 0, 1);
    const alb = blackDaisy[c] * 0.15 + whiteDaisy[c] * 0.85 + bare * 0.5;
    const lat = DIR[c * 3 + 1];
    // Latitude gradient → cool poles (black) vs warm tropics (white)
    const latInsol = 0.62 + 0.48 * (1 - lat * lat);
    const local = lumin * latInsol * (1 - alb) * 1.1;
    temp[c] = clamp(temp[c] * 0.5 + local * 0.75, 0, 1.5);
    sumT += temp[c] * AREA[c];

    const tb = temp[c];
    const growB = clamp(1 - Math.abs(tb - 0.3) / 0.28, 0, 1);
    const growW = clamp(1 - Math.abs(tb - 0.72) / 0.28, 0, 1);
    const spreadB = Math.max(blackDaisy[NBR[c * 4]], blackDaisy[NBR[c * 4 + 1]],
      blackDaisy[NBR[c * 4 + 2]], blackDaisy[NBR[c * 4 + 3]]);
    const spreadW = Math.max(whiteDaisy[NBR[c * 4]], whiteDaisy[NBR[c * 4 + 1]],
      whiteDaisy[NBR[c * 4 + 2]], whiteDaisy[NBR[c * 4 + 3]]);
    const canB = blackDaisy[c] > 0.02 || spreadB > 0.12;
    const canW = whiteDaisy[c] > 0.02 || spreadW > 0.12;
    const before = blackDaisy[c] + whiteDaisy[c];
    if (canB) {
      blackDaisy[c] = clamp(blackDaisy[c] + growB * bare * 0.1 + spreadB * growB * 0.07 - 0.016, 0, 0.92);
    } else {
      blackDaisy[c] = Math.max(0, blackDaisy[c] - 0.012);
    }
    if (canW) {
      whiteDaisy[c] = clamp(whiteDaisy[c] + growW * bare * 0.1 + spreadW * growW * 0.07 - 0.016, 0, 0.92);
    } else {
      whiteDaisy[c] = Math.max(0, whiteDaisy[c] - 0.012);
    }
    // Competitive exclusion — one daisy type dominates a cell
    if (blackDaisy[c] > 0.2 && whiteDaisy[c] > 0.2) {
      if (growB >= growW) whiteDaisy[c] *= 0.85;
      else blackDaisy[c] *= 0.85;
    }
    life[c] = blackDaisy[c] + whiteDaisy[c];
    if (life[c] > before + 0.02) grown++;
    sumLife += life[c] * AREA[c];
  }
  W.meanTemp = sumT / NC;
  W.meanLife = sumLife / NC;
  W.lifeGrown = grown;
  if (!W.pausedSolar) W.rule.solar = Math.min(1.85, W.rule.solar + 0.00035);
  W.solar = W.rule.solar;
  W._baseSolar = W.solar;
}

/** Paint a visible life bloom — used by seed tool and Finger of God. */
export function seedLife(W, cell, classIndex) {
  const cls = Math.min(classIndex ?? W.unlockedClass, W.unlockedClass);
  const cx = DIR[cell * 3], cy = DIR[cell * 3 + 1], cz = DIR[cell * 3 + 2];
  const thresh = Math.cos(0.2); // ~11.5° blotch — obvious from orbit
  for (let c = 0; c < NC; c++) {
    const d = DIR[c * 3] * cx + DIR[c * 3 + 1] * cy + DIR[c * 3 + 2] * cz;
    if (d > thresh) {
      const f = (d - thresh) / (1 - thresh + 1e-6);
      W.life[c] = Math.max(W.life[c], 0.7 + f * 0.3);
      W.lifeClass[c] = cls;
      if (W.h[c] >= W.seaLevel) {
        W.moist[c] = Math.max(W.moist[c], 0.45 + f * 0.35);
        W.ice[c] *= 0.35;
        W.iceLand[c] *= 0.35;
      }
      if (W.rule.daisyworld) {
        if (Math.random() < 0.5) W.blackDaisy[c] = Math.max(W.blackDaisy[c], 0.75 * f);
        else W.whiteDaisy[c] = Math.max(W.whiteDaisy[c], 0.75 * f);
        W.life[c] = W.blackDaisy[c] + W.whiteDaisy[c];
      }
    }
  }
}
