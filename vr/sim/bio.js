/** Biosphere tick — redox-aware growth, NPP carrying capacity, Daisyworld.
 *  Legacy LIFE_CLASSES kept for agents/sprites; chemistry lives in redox.js. */

import { clamp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { carryingCapacityNPP } from './ecology.js';
import { daisyNSpeciesTick } from './alien.js';
import { updateLifeFront, disperseLife } from './lifeFront.js';
import { rngOf } from './rng.js';
import { isModernEarth } from './ruleMode.js';

/** Life classes in evolutionary order — display / agent ladder. */
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
  let k;
  if (W.npp) {
    k = carryingCapacityNPP(W, c);
  } else {
    const insol = Math.max(0.15, W.temp[c]);
    const water = W.h[c] < W.seaLevel ? 1 : Math.max(0.2, W.moist[c]);
    const nut = Math.min(W.nutrientN[c], W.nutrientP[c]);
    const raw = insol * water * (0.5 + nut * 0.55);
    k = clamp(0.55 + raw * 0.45, 0.55, 1);
  }
  if (W.drought) {
    const d = W.drought[c] || 0;
    if (d > 0.01) k *= (1 - 0.55 * d);
  }
  return k;
}

export function bioTick(W, chronLog) {
  const R = W.rule;
  if (R.daisyworld) return daisyTick(W, chronLog);
  if (R.airless) {
    if (W.life) W.life.fill(0);
    W.meanLife = 0;
    return;
  }
  // B48 — sterile rulesets (Ares) do not grow a biosphere unless Life tools
  // already marked abiogenesis / left biomass. Empty sterile worlds stay empty.
  if (R.sterile && !W.transitions?.abiogenesis) {
    let any = 0;
    if (W.life) {
      for (let c = 0; c < NC; c++) any += W.life[c];
      if (any < 1e-6) {
        W.life.fill(0);
        W.meanLife = 0;
        return;
      }
    } else {
      W.meanLife = 0;
      return;
    }
  }

  /* Who owns `life[]`.
   *
   * This was `!!W.guildDens && W.transitions?.abiogenesis`, which is true on
   * modern Earth — and `redoxTick`'s modern branch says the opposite: "bio.js +
   * seedEarth own life[]". Both deferred to the other, so on Holocene Earth
   * *nothing grew life*, and the cap-only branch below fell through to a 5%
   * per-tick decay wherever the cap was under 0.05 — which is the whole deep
   * ocean (`seaCap` is 0.05 below 0.2 depth). Measured on the pinned calibration
   * Earth over 3 500 ticks: sea life 0.090 → 0.013, land life 0.259 → 0.051,
   * `meanLife` 0.139 → 0.023 and still falling, with nothing to grow it back.
   * `calibrateEarth` never saw it because it runs eight ticks and its `meanLife`
   * band is [0.04, 0.45].
   *
   * Redox owns life where redox is actually simulating it — the deep-time path,
   * from abiogenesis forward. On modern Earth the seeded biosphere is bio.js's,
   * and this pass grows and kills it. */
  const useRedox = !!W.guildDens && W.transitions?.abiogenesis && !isModernEarth(R);

  const { life, lifeClass, temp, moist, h, seaLevel, gases, _l, ash } = W;
  const O2 = gases.O2;
  const rng = W.rng || (() => 0.5);

  let photosynth = 0, respir = 0;
  let grown = 0, died = 0;
  const prevMean = W.meanLife || 0;

  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const landUV = isSea || W.ozone > 0.15;
    const cap = Math.max(0.2, carryingCapacity(W, c));
    let fit = 0.3;
    for (let i = 0; i < LIFE_CLASSES.length; i++) {
      const f = envelopeOk(LIFE_CLASSES[i], temp[c], moist[c], O2, landUV, isSea);
      if (f > 0 && i <= W.unlockedClass) fit = Math.max(fit, f);
    }
    if (W.bound[c] === 0 && isSea) {
      fit = Math.max(fit, 0.55);
    }
    if (isSea && (seaLevel - h[c]) < 0.1 && temp[c] > 0.4) fit = Math.max(fit, 0.5);

    const icePen = isSea ? 1 : (1 - clamp(W.ice[c] - 0.25, 0, 1) * 0.7);
    /* A cell that is on fire is not growing, and fresh ash suppresses recovery.
       Without the first clause, frontier growth here (up to 0.28 a tick) exceeded
       fire's consumption (0.14 a tick), so a burning forest *gained* biomass
       within the same tick and the burn never appeared in `life` — the one field
       the globe, the local grid, the NPP overlay and every animal read. Ash
       damping went from 0.55 to 0.8 for the same reason: post-fire recovery has a
       lag, and without one the scar closed before it could be seen. */
    const burning = (W.fire?.[c] || 0) > 0.02;
    const hab = burning ? 0 : fit * (1 - ash[c] * 0.8) * icePen;
    const c4 = c * 4;
    const depth = isSea ? (seaLevel - h[c]) : 0;
    const seaCap = isSea ? (depth < 0.1 ? 0.85 : depth < 0.2 ? 0.25 : 0.05) : 1;
    const nl = Math.max(life[NBR[c4]], life[NBR[c4 + 1]], life[NBR[c4 + 2]], life[NBR[c4 + 3]]);
    /* `… && nl < 0.2` is the new clause. The gate used to read "dry and empty",
       and dryness plus emptiness is self-sustaining: growth needs `life >= 0.12`
       and the gate blocks growth below it, so any dry cell driven to zero was
       dead forever. Harmless while nothing drove cells to zero; now fire does,
       and every burn on dry ground became permanent desert. A dry cell with a
       living neighbour can be recolonised from the edge, which is both true and
       the more interesting thing to watch. */
    const aridGate = (!isSea && moist[c] < 0.16 && life[c] < 0.12 && nl < 0.2) ? 0 : 1;
    const maxL = Math.min(1, (cap + 0.1) * seaCap) * (aridGate ? 1 : 0);

    if (useRedox) {
      // Redox owns life[] here; do not 5%-decay the deep ocean every tick.
      // Morphology envelopes still cap absurd blooms on land.
      _l[c] = isSea ? life[c] : clamp(life[c], 0, Math.max(maxL, life[c] * 0.98));
      const bio = _l[c] * AREA[c];
      // provenance: fitted — residual gas coupling; burial owns O₂ in carbon.js
      photosynth += bio * 0.00000002;
      respir += bio * 0.00000001;
    } else if (hab > 0.02 && temp[c] > 0.12 && maxL > 0.05 && aridGate) {
      const frontier = nl > 0.2 && life[c] < 0.35 ? 0.28 : 0.1;
      const growth = hab * frontier + nl * hab * 0.14;
      const before = life[c];
      _l[c] = clamp(life[c] + growth, 0, maxL);
      if (_l[c] > before + 0.015) grown++;
      const bio = _l[c] * AREA[c];
      // provenance: invented for legibility — prefer carbon.js burial path when present
      photosynth += bio * 0.00000008;
      respir += bio * 0.000000025;
    } else {
      const before = life[c];
      const die = aridGate ? 0.035 : 0.06;
      _l[c] = Math.max(0, life[c] - die);
      if (_l[c] < before - 0.01) died++;
    }

    if (!isSea) {
      W.soil[c] = clamp(W.soil[c] + life[c] * 0.004 - (1 - moist[c]) * 0.001, 0, 1);
      W.nutrientN[c] = clamp(0.35 + W.soil[c] * 0.4 + W.sediment[c] * 0.3 + (W.bound[c] === 1 ? 0.2 : 0), 0, 1);
      // Phosphorus: continental weathering minus burial. provenance: fitted-shape
      const weather = (1 - moist[c]) * 0.05 + W.ore[c] * 0.25 + W.sediment[c] * 0.2;
      const bury = life[c] * 0.08;
      W.nutrientP[c] = clamp(0.18 + weather - bury + (W.bound[c] === 1 ? 0.12 : 0), 0, 1);
      if (_l[c] > 0.5 && moist[c] > 0.18) {
        moist[c] = Math.min(0.75, moist[c] + 0.012);
      }
    }

    if (isSea && depth > 0 && depth < 0.12 && temp[c] > 0.35 && temp[c] < 0.85) {
      W.reef[c] = clamp(Math.max(W.reef[c], _l[c] * 1.1), 0, 1);
      // Reef bleaching. Item 147.
      const summerMax = 0.72;
      if (temp[c] > summerMax + 0.02) W.reef[c] *= 0.92;
    } else {
      W.reef[c] *= 0.92;
    }
  }
  life.set(_l);

  // Prefer carbon-module gas path; weak legacy coupling otherwise
  if (!W.carbon) {
    gases.CO2 = clamp(gases.CO2 - photosynth + respir, W.rule.minCO2 ?? 0.0008, 0.6);
    gases.O2 = clamp(gases.O2 + photosynth * 0.9 - respir * 0.5, 0, 0.35);
  }

  // Year-gated ladder only if transitions system inactive
  if (!W.transitions && W.unlockedClass < LIFE_CLASSES.length - 1) {
    const next = LIFE_CLASSES[W.unlockedClass + 1];
    const yearsNeeded = (W.unlockedClass + 1) * 5000;
    if (O2 >= next.minO2 && (W.meanLife || 0) > 0.12 && W.year >= yearsNeeded) {
      W.unlockedClass++;
      if (chronLog) chronLog(W.year, 'evolution', 0, W.unlockedClass, `Evolution: ${next.id}`);
    }
  }

  if (!W.carbon && gases.O2 > 0.05 && !W._oxEvent && photosynth > respir * 2) {
    W._oxEvent = true;
    for (let c = 0; c < NC; c++) {
      if (lifeClass[c] === 0) life[c] *= 0.35;
    }
    if (chronLog) chronLog(W.year, 'oxygenation', 0, gases.O2, 'Great Oxygenation Event');
  }

  W.bodyScale = W.bodyScale || (W.rule.earthLike ? 0.85 : clamp(0.7 + gases.O2 * 1.2, 0.7, 1.35));

  if (W.plague > 0) {
    for (let c = 0; c < NC; c++) {
      if (life[c] > 0.2 && rng() < W.plague * 0.03) life[c] *= 0.55;
    }
    W.plague *= 0.97;
  }

  W.lifeGrown = grown;
  W.lifeDied = died;
  disperseLife(W, rngOf(W, 'rngBio'));
  updateLifeFront(W);
  const delta = (W.meanLife || 0) - prevMean;
  if (chronLog && Math.abs(delta) > 0.04) {
    chronLog(W.year, delta > 0 ? 'bloom' : 'dieback', 0, Math.abs(delta),
      delta > 0 ? 'Biosphere bloom' : 'Biosphere dieback',
      { cause: delta > 0 ? 'growth > mortality' : diagnoseDieback(W) });
  }
}

function diagnoseDieback(W) {
  if (W.iceFrac > 0.5) return 'ice advance';
  if (W.meanTemp > 0.9) return 'heat stress';
  if (W.gases.O2 < 0.01) return 'hypoxia';
  if (W.gases.dust > 0.1) return 'aerosol shading';
  return 'habitat / resource collapse';
}

function daisyTick(W, chronLog) {
  daisyNSpeciesTick(W);
  const albB = W.daisyAlbedo?.black ?? 0.15;
  const albW = W.daisyAlbedo?.white ?? 0.85;
  const { temp, blackDaisy, whiteDaisy, life } = W;
  const lumin = W.solar;
  let sumT = 0, sumLife = 0;
  let grown = 0;
  for (let c = 0; c < NC; c++) {
    const bare = clamp(1 - blackDaisy[c] - whiteDaisy[c], 0, 1);
    const alb = blackDaisy[c] * albB + whiteDaisy[c] * albW + bare * 0.5;
    const lat = DIR[c * 3 + 1];
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
  updateLifeFront(W);
  // Tutorial framing. Item 113.
  W.gaiaMode = 'tutorial-feedback';
  if (!W.pausedSolar) W.rule.solar = Math.min(1.85, W.rule.solar + 0.00035);
  W.solar = W.rule.solar;
  W._baseSolar = W.solar;
}

/** Paint a visible life bloom — used by seed tool and Finger of God. */
export function seedLife(W, cell, classIndex) {
  const cls = Math.min(classIndex ?? W.unlockedClass, W.unlockedClass);
  const cx = DIR[cell * 3], cy = DIR[cell * 3 + 1], cz = DIR[cell * 3 + 2];
  const thresh = Math.cos(0.2);
  const rng = W.rng || (() => 0.5);
  for (let c = 0; c < NC; c++) {
    const d = DIR[c * 3] * cx + DIR[c * 3 + 1] * cy + DIR[c * 3 + 2] * cz;
    if (d > thresh) {
      const f = (d - thresh) / (1 - thresh + 1e-6);
      W.life[c] = Math.max(W.life[c], 0.7 + f * 0.3);
      W.lifeClass[c] = cls; // derived-field override: recomputed next evolveTick
      if (W.h[c] >= W.seaLevel) {
        W.moist[c] = Math.max(W.moist[c], 0.45 + f * 0.35);
        W.ice[c] *= 0.35;
        W.iceLand[c] *= 0.35;
      }
      if (W.rule.daisyworld) {
        if (rng() < 0.5) W.blackDaisy[c] = Math.max(W.blackDaisy[c], 0.75 * f);
        else W.whiteDaisy[c] = Math.max(W.whiteDaisy[c], 0.75 * f);
        W.life[c] = W.blackDaisy[c] + W.whiteDaisy[c];
      }
      if (W.transitions && !W.transitions.abiogenesis) {
        W.transitions.abiogenesis = true;
        W.transitions.luca = true;
      }
    }
  }
}
