/** Rulesets — content units with chemistry, orbit, and signature phenomena.
 *  Synthetic Type worlds (terra/vermis/selene/ares/venus/titan/europa/daisy)
 *  are exempt from the real-data WorldRecord schema. Catalogue BODY entries pull
 *  measured parameters from vr/worldParams.js instead of these templates.
 *
 *  Physics dials for Earth live in terraParams.js (A8). Palette functions below
 *  are look, not science.
 *  @provenance look
 */

import { clamp, lerp } from './math.js';
import {
  GAS_N2, GAS_O2, GAS_CO2, GAS_CH4, GAS_H2O,
  EARTH_OBLIQUITY_DEG, EARTH_ECC, EARTH_LAND_FRAC,
  EARTH_CORE_MASS, EARTH_CORE_RAD,
  EARTH_FREEZE, EARTH_SOLAR, EARTH_RELIEF, EARTH_ARIDITY,
  EARTH_GH_BIAS, EARTH_MIN_CO2, EARTH_TOTAL_WATER, EARTH_CONTINENT,
  EARTH_N_PLATES, EARTH_TARGET_TEMP, EARTH_ATMO_STRENGTH,
  THRIVE_START_AGE_GA,
} from './sim/terraParams.js';

/** Earth land: pleasant NASA-ish biomes that still separate cleanly from orbit. */
const landTerra = (t, m, l, e, ice, extra) => {
  if (ice > 0.5 && l < 0.18) return [240, 245, 250];
  const rock = clamp((e - 0.48) * 2.2, 0, 1);
  const elevCool = rock * 0.35;

  if (l > 0.05) {
    const k = clamp((l - 0.05) / 0.55, 0, 1);
    let r, g, b;
    if (m < 0.20) {
      // Sahel / scrub — olive that still beats desert gold
      r = lerp(118, 78, k); g = lerp(108, 88, k); b = lerp(58, 38, k);
    } else if (t > 0.52 && m > 0.42) {
      // Tropical canopy — albedo ~0.12, nearly black from DSCOVR
      r = lerp(22, 10, k); g = lerp(48, 26, k); b = lerp(28, 16, k);
    } else if (t < 0.36) {
      // Boreal — albedo ~0.08, cooler and darker than the tropics
      r = lerp(16, 8, k); g = lerp(36, 22, k); b = lerp(28, 18, k);
    } else {
      // Temperate forest / meadow
      r = lerp(28, 12, k); g = lerp(52, 30, k); b = lerp(24, 16, k);
    }
    if (ice > 0.28) {
      const frost = clamp((ice - 0.28) / 0.5, 0, 1);
      return [
        lerp(r, 220, frost * 0.55),
        lerp(g, 232, frost * 0.45),
        lerp(b, 242, frost * 0.6),
      ];
    }
    return [
      lerp(r, 118, elevCool),
      lerp(g, 110, elevCool * 0.9),
      lerp(b, 98, elevCool * 0.85),
    ];
  }

  // Barren — Sahara pale, Australian red, Gobi grey
  let r, g, b;
  const rockKind = extra?.rock ?? 0;
  const lat = extra?.lat ?? 0.3;
  const dust = extra?.dust ?? 0;
  if (m < 0.14) {
    if (t < 0.36 || lat > 0.55) { r = 176; g = 168; b = 152; } // Gobi / rain-shadow grey
    else if (rockKind === 0 && t > 0.52) { r = 196; g = 118; b = 72; } // Australian red earth
    else { r = 226; g = 192; b = 118; } // Sahara pale
  }
  else if (m < 0.22) { r = 200; g = 166; b = 108; }
  else if (t < 0.34) { r = 158; g = 152; b = 142; }
  else { r = 146; g = 128; b = 100; }
  if (t < 0.36) {
    const k = clamp((0.36 - t) * 2.8, 0, 1);
    r = lerp(r, 168, k); g = lerp(g, 164, k); b = lerp(b, 158, k);
  }
  if (dust > 0.12) {
    const k = clamp(dust, 0, 1) * 0.4;
    r = lerp(r, 198, k); g = lerp(g, 152, k); b = lerp(b, 98, k);
  }
  if (ice > 0.38) return [234, 240, 248];
  return [lerp(r, 128, rock), lerp(g, 120, rock), lerp(b, 108, rock)];
};

/** Calibration target: 1 bar, 78/21, ~288 K, ~71% ocean, 23.4° obliquity.
 *  Named so the demo Earth below can inherit it without a second copy. */
const TERRA = {
  id: 'terra', name: 'Earth', blurb: 'Modern Earth — calibration basis for life, time, tectonics.',
  synthetic: true, earthLike: true,
  /* `freeze` is the ice line on the same scale the thermometer uses: 288 K at
     0.5, 160 K to the unit, so water's 273 K is 0.406. It was 0.28 — 243 K, or
     −30 °C — which is why an Earth at 281 K carried no ice at all, sea or land,
     and why the calibration harness could report a temperate planet with empty
     poles for as long as it did. */
  relief: EARTH_RELIEF, solar: EARTH_SOLAR, freeze: EARTH_FREEZE, aridity: EARTH_ARIDITY,
  rotationPeriod: 1.0, obliquity: EARTH_OBLIQUITY_DEG * Math.PI / 180, eccentricity: EARTH_ECC,
  gravity: 1.0, magnetosphere: 1.0,
  interior: {
    coreMassFrac: EARTH_CORE_MASS, coreRadiusFrac: EARTH_CORE_RAD,
    heatFlow: 1.0, conductivity: 1.0, lidMode: 'mobile',
    note: 'Fe–Ni core · active dynamo · mobile-lid plates',
  },
  // Volume mixing ratios; CO₂ ~420 ppm. Greenhouse bias stands in for residual GHG.
  gases: {
    N2: GAS_N2, O2: GAS_O2, CO2: GAS_CO2, CH4: GAS_CH4, H2O: GAS_H2O,
    dust: 0.0, sulphate: 0,
  },
  /* Refitted residual greenhouse — see terraParams EARTH_GH_BIAS citation trail. */
  ghBias: EARTH_GH_BIAS, minCO2: EARTH_MIN_CO2,
  totalWater: EARTH_TOTAL_WATER, continentFrac: EARTH_CONTINENT, nPlates: EARTH_N_PLATES,
  targetLandFrac: EARTH_LAND_FRAC, targetMeanTemp: EARTH_TARGET_TEMP,
  atmo: [0.28, 0.50, 0.92], atmoStrength: EARTH_ATMO_STRENGTH, sky: [0.012, 0.035, 0.08],
  signature: 'glacial',
  // Open-ocean albedo ~0.06; the blue is sky. `d` is shallowness.
  ocean: (d) => [4 + 16 * d, 10 + 28 * d, 18 + 38 * d],
  land: landTerra,
};

/** Demo Earth. Identical physics, palette and seeded Holocene biosphere to
 *  `terra`; the clock starts 2 Ma before the present so it actually advances,
 *  and `isPinnedEarth` is false here so the ×0.12 settlement throttle and the
 *  0.55 build ceiling lift. This is the world the living-planet demo opens.
 *  Never calibrate against it — `terra` is the pinned target. */
const EARTH_THRIVE = {
  ...TERRA,
  gases: { ...TERRA.gases },
  interior: { ...TERRA.interior },
  atmo: TERRA.atmo.slice(),
  sky: TERRA.sky.slice(),
  id: 'thrive', name: 'Earth Thrive',
  blurb: 'Earth with the clock running — settlements light up, forests burn, herds run.',
  thrive: true,
  // 2.0 Ma BP → adaptiveTickYears gives 200 yr/tick, so ~11 ticks/s of real
  // time is ~2 kyr/s and a ten-minute session never reaches the present clamp.
  startAgeGa: THRIVE_START_AGE_GA,
};

export const RULESETS = [
  TERRA,
  {
    id: 'vermis', name: 'Vermis', blurb: 'Silicate, no free water. Megafauna reshape terrain.',
    synthetic: true,
    relief: 0.075, solar: 1.16, freeze: 0.12, aridity: 0.30,
    rotationPeriod: 1.2, obliquity: 12 * Math.PI / 180, eccentricity: 0.04,
    gravity: 0.9, magnetosphere: 0.6,
    interior: { coreMassFrac: 0.28, coreRadiusFrac: 0.48, heatFlow: 1.1, conductivity: 0.7, lidMode: 'mobile', note: 'Silicate mobile lid · modest dynamo' },
    gases: { N2: 0.85, O2: 0.0, CO2: 0.08, CH4: 0.01, H2O: 0.001, dust: 0.05, sulphate: 0 },
    totalWater: 0.08, continentFrac: 0.85, nPlates: 9,
    atmo: [1.0, 0.66, 0.30], atmoStrength: 1.25, sky: [0.05, 0.035, 0.02],
    signature: 'worms',
    ocean: (d) => [176 + 30 * d, 132 + 22 * d, 74 + 18 * d],
    land: (t, m, l, e, ice) => {
      if (ice > 0.5) return [214, 206, 196];
      const rock = clamp((e - 0.5) * 2.0, 0, 1);
      if (l > 0.1) {
        const k = clamp(l, 0, 1);
        return [
          lerp(120, 40, k),
          lerp(60, 20, k),
          lerp(200, 255, k),
        ];
      }
      let r = lerp(214, 172, m), g = lerp(160, 116, m), b = lerp(88, 62, m);
      return [lerp(r, 150, rock), lerp(g, 116, rock), lerp(b, 86, rock)];
    },
  },
  {
    id: 'selene', name: 'Selene', blurb: 'Airless. Thermal shock and impact history.',
    synthetic: true,
    relief: 0.048, solar: 1.0, freeze: 0.28, aridity: 1.0,
    rotationPeriod: 27, obliquity: 1.5 * Math.PI / 180, eccentricity: 0.05,
    gravity: 0.16, magnetosphere: 0.0,
    interior: { coreMassFrac: 0.02, coreRadiusFrac: 0.20, heatFlow: 0.08, conductivity: 0.05, lidMode: 'stagnant', note: 'Tiny core · dynamo dead · frozen lithosphere' },
    gases: { N2: 0, O2: 0, CO2: 0, CH4: 0, H2O: 0, dust: 0, sulphate: 0 },
    totalWater: 0.02, continentFrac: 1.0, nPlates: 6, airless: true,
    atmo: [0.55, 0.60, 0.70], atmoStrength: 0.16, sky: [0.005, 0.006, 0.012],
    signature: 'impacts',
    ocean: () => [70, 70, 78],
    land: (t, m, l, e, ice) => {
      const g = 96 + 96 * clamp(e * 0.9 + 0.15, 0, 1);
      const w = 1 + 0.06 * Math.sin(e * 57.0);
      if (ice > 0.6) return [214, 222, 232];
      return [g * 0.98 * w, g * 0.98 * w, g * 1.06 * w];
    },
  },
  {
    id: 'ares', name: 'Ares', blurb: 'Thin CO₂. Dust storms that eat a hemisphere.',
    synthetic: true,
    // B48 — no spontaneous biosphere; Life tools may still seed deliberately.
    sterile: true,
    // B46 — thin column must be explicit or gas sum ≈ 1 bar and the world cooks.
    surfacePressureBar: 0.006, teqK: 210,
    relief: 0.068, solar: 0.43, freeze: 0.28, aridity: 0.55,
    rotationPeriod: 1.03, obliquity: 25 * Math.PI / 180, eccentricity: 0.09,
    gravity: 0.38, magnetosphere: 0.05,
    interior: { coreMassFrac: 0.18, coreRadiusFrac: 0.45, heatFlow: 0.25, conductivity: 0.15, lidMode: 'stagnant', note: 'Partly solid core · no global dynamo · stagnant lid' },
    gases: { N2: 0.03, O2: 0.001, CO2: 0.95, CH4: 0, H2O: 0.0003, dust: 0.02, sulphate: 0 },
    totalWater: 0.12, continentFrac: 0.95, nPlates: 8,
    atmo: [1.0, 0.52, 0.36], atmoStrength: 0.55, sky: [0.03, 0.018, 0.016],
    signature: 'dust',
    ocean: () => [96, 58, 42],
    land: (t, m, l, e, ice) => {
      if (ice > 0.42) return [232, 236, 244];
      const high = clamp((e - 0.42) * 1.8, 0, 1);
      let r = lerp(118, 168, high), g = lerp(72, 96, high), b = lerp(48, 58, high);
      if (l > 0.18) {
        const k = clamp((l - 0.18) / 0.6, 0, 1);
        r = lerp(r, 36, k); g = lerp(g, 72, k); b = lerp(b, 28, k);
      }
      return [r, g, b];
    },
  },
  {
    id: 'venus', name: 'Venus', blurb: '92 bar CO₂ runaway. Near-isothermal hellscape.',
    synthetic: true,
    sterile: true,
    surfacePressureBar: 92, teqK: 735,
    relief: 0.04, solar: 1.91, freeze: 0.02, aridity: 0.95,
    rotationPeriod: -243, obliquity: 177.4 * Math.PI / 180, eccentricity: 0.007,
    gravity: 0.9, magnetosphere: 0.0,
    interior: { coreMassFrac: 0.30, coreRadiusFrac: 0.52, heatFlow: 0.9, conductivity: 0.4, lidMode: 'episodic', note: 'Earth-mass core · slow spin kills dynamo · episodic lid' },
    gases: { N2: 0.035, O2: 0, CO2: 0.965, CH4: 0, H2O: 0.00003, dust: 0, sulphate: 0.08 },
    totalWater: 0.02, continentFrac: 1.0, nPlates: 6,
    atmo: [1.0, 0.82, 0.32], atmoStrength: 1.8, sky: [0.08, 0.06, 0.03],
    signature: 'runaway',
    ocean: () => [120, 90, 50],
    land: (t, m, l, e, ice) => {
      const high = clamp((e - 0.4) * 1.6, 0, 1);
      let r = lerp(168, 210, high), g = lerp(120, 170, high), b = lerp(48, 70, high);
      return [r, g, b];
    },
  },
  {
    id: 'titan', name: 'Titan', blurb: '1.5 bar N₂. Methane lakes, tholin haze, ice shell.',
    synthetic: true,
    sterile: true,
    methaneSolvent: true,
    iceShell: true,
    surfacePressureBar: 1.5, teqK: 94,
    relief: 0.03, solar: 0.11, freeze: 0.62, aridity: 0.2,
    rotationPeriod: 16, obliquity: 27 * Math.PI / 180, eccentricity: 0.029,
    gravity: 0.14, magnetosphere: 0.0,
    interior: { coreMassFrac: 0.04, coreRadiusFrac: 0.18, heatFlow: 0.12, conductivity: 0.1, lidMode: 'ice', note: 'Rock kernel under ice · little or no dynamo' },
    gases: { N2: 0.95, O2: 0, CO2: 0.01, CH4: 0.05, H2O: 0.001, dust: 0, sulphate: 0 },
    totalWater: 0.7, continentFrac: 0.55, nPlates: 4,
    atmo: [0.95, 0.55, 0.22], atmoStrength: 0.7, sky: [0.06, 0.04, 0.02],
    signature: 'methane',
    ocean: () => [40, 55, 70],
    land: (t, m, l, e, ice) => {
      if (ice > 0.5) return [220, 210, 190];
      const dune = clamp(m * 0.5 + e * 0.3, 0, 1);
      return [
        lerp(180, 132, dune),
        lerp(140, 68, dune),
        lerp(70, 36, dune),
      ];
    },
  },
  {
    id: 'europa', name: 'Europa', blurb: 'Ice lid over a hidden ocean. Airless; vents only.',
    synthetic: true,
    sterile: true,
    airless: true,
    iceShell: true,
    tidalHeat: 0.35,
    surfacePressureBar: 0, teqK: 102,
    relief: 0.02, solar: 0.18, freeze: 0.78, aridity: 1.0,
    rotationPeriod: 3.55, obliquity: 0.1 * Math.PI / 180, eccentricity: 0.009,
    gravity: 0.13, magnetosphere: 0.05,
    interior: { coreMassFrac: 0.04, coreRadiusFrac: 0.18, heatFlow: 0.2, conductivity: 0.15, lidMode: 'ice', note: 'Ice–ocean stack · induced field sketch' },
    gases: { N2: 0, O2: 0, CO2: 0, CH4: 0, H2O: 0, dust: 0, sulphate: 0 },
    totalWater: 0.95, continentFrac: 0.08, nPlates: 3,
    atmo: [0.55, 0.62, 0.75], atmoStrength: 0.08, sky: [0.002, 0.003, 0.008],
    signature: 'iceshell',
    ocean: () => [40, 60, 90],
    land: (t, m, l, e, ice) => {
      const crack = clamp(Math.abs(e - 0.5) * 2, 0, 1);
      const g = 200 + 30 * crack;
      return [g * 0.92, g * 0.96, g];
    },
  },
  {
    id: 'daisy', name: 'Daisyworld', blurb: 'Tutorial: two-species feedback proof — not a planet beside Europa.',
    synthetic: true,
    tutorial: true,
    relief: 0.02, solar: 0.85, freeze: 0.22, aridity: 0.02,
    rotationPeriod: 1.0, obliquity: 0, eccentricity: 0,
    gravity: 1.0, magnetosphere: 1.0,
    interior: { coreMassFrac: 0.32, coreRadiusFrac: 0.55, heatFlow: 0.5, conductivity: 1.0, lidMode: 'mobile', note: 'Tutorial world · mild interior' },
    gases: { N2: 0.8, O2: 0.1, CO2: 0.05, CH4: 0, H2O: 0.02, dust: 0, sulphate: 0 },
    totalWater: 0.4, continentFrac: 1.0, nPlates: 4, daisyworld: true,
    atmo: [0.45, 0.7, 0.9], atmoStrength: 0.7, sky: [0.03, 0.04, 0.07],
    signature: 'daisies',
    ocean: (d) => [30 + 40 * d, 80 + 60 * d, 120 + 80 * d],
    land: (t, m, l, e, ice, extra) => {
      if (ice > 0.5) return [240, 245, 250];
      const black = extra?.black || 0, white = extra?.white || 0;
      const bare = clamp(1 - black - white, 0, 1);
      // Near-pure black / white so orbital climate wash can't hide daisy bands
      const r = bare * 110 + black * 8 + white * 255;
      const g = bare * 100 + black * 10 + white * 252;
      const b = bare * 78 + black * 14 + white * 248;
      return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
    },
  },
  EARTH_THRIVE,
];

/** The water-vapour column's contribution, given a mixing ratio. */
export function vapourGreenhouse(h2o) {
  return 0.097 * Math.log1p(Math.max(0, h2o) * 60);
}

export function greenhouseFromGases(g, rule, liveP) {
  const co2 = Math.max(1e-6, g.CO2);
  const ch4 = Math.max(0, g.CH4);
  const h2o = Math.max(0, g.H2O);
  const dust = Math.max(0, g.dust + g.sulphate * 2);
  /* Water vapour, with the band saturation the other gases already had.
   *
   * This was linear at 0.12·h2o, which for Earth's 0.03 came to 0.004 — about
   * half a kelvin, against the sixteen or so that water vapour actually
   * contributes. The whole column was instead standing inside `ghBias`, a
   * constant, which meant the strongest feedback in the climate system was
   * missing: warming could not moisten the air and moistening could not warm it
   * back. It matters most exactly where it was most missed — a cooling planet
   * dries out, loses its vapour greenhouse and cools further, which is the
   * mechanism that took Earth to a 63%-frozen −28 °C once the water cycle
   * started working and there was a real vapour field to lose. */
  let gh = 0.04 * Math.log1p(co2 * 40) + 0.08 * Math.log1p(ch4 * 80)
    + vapourGreenhouse(h2o) - 0.18 * dust
    + (rule?.ghBias || 0);
  const P = liveP != null && Number.isFinite(liveP) ? liveP : rule?.surfacePressureBar;
  if (P != null && Number.isFinite(P)) {
    if (P > 2) gh += 0.28 * Math.log10(P); // Venus-scale column
    else if (P < 0.05) gh *= Math.max(0.04, P / 0.05); // Mars-thin
  }
  if (rule?.envelope) gh += 0.08; // H₂ CIA sketch
  return gh;
}

export function totalPressure(g, rule) {
  if (rule?.surfacePressureBar != null && Number.isFinite(rule.surfacePressureBar)) {
    return Math.max(0, rule.surfacePressureBar);
  }
  return g.N2 + g.O2 + g.CO2 + g.CH4 + g.H2O + g.dust * 0.1;
}
