/** Rulesets — content units with chemistry, orbit, and signature phenomena.
 *  The five invented worlds (terra/vermis/selene/ares/daisy) are synthetic —
 *  exempt from the real-data WorldRecord schema. Catalogue BODY entries pull
 *  measured parameters from vr/worldParams.js instead of these templates. */

import { clamp, lerp } from './math.js';

/** Earth land: pleasant NASA-ish biomes that still separate cleanly from orbit. */
const landTerra = (t, m, l, e, ice) => {
  if (ice > 0.5 && l < 0.18) return [240, 245, 250];
  const rock = clamp((e - 0.48) * 2.2, 0, 1);
  const elevCool = rock * 0.35;

  if (l > 0.05) {
    const k = clamp((l - 0.05) / 0.55, 0, 1);
    let r, g, b;
    if (m < 0.20) {
      // Sahel / scrub — olive that still beats desert gold
      r = lerp(148, 108, k); g = lerp(142, 128, k); b = lerp(78, 52, k);
    } else if (t > 0.52 && m > 0.42) {
      // Tropical canopy — deep emerald, saturated enough to read from orbit
      r = lerp(42, 18, k); g = lerp(138, 105, k); b = lerp(62, 48, k);
    } else if (t < 0.36) {
      // Boreal — cooler blue-green
      r = lerp(58, 36, k); g = lerp(122, 100, k); b = lerp(90, 72, k);
    } else {
      // Temperate forest / meadow
      r = lerp(62, 32, k); g = lerp(148, 118, k); b = lerp(64, 46, k);
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

  // Barren — warm deserts vs cool highlands (slightly brighter from orbit)
  let r, g, b;
  if (m < 0.14) { r = 226; g = 192; b = 118; }
  else if (m < 0.22) { r = 200; g = 166; b = 108; }
  else if (t < 0.34) { r = 158; g = 152; b = 142; }
  else { r = 146; g = 128; b = 100; }
  if (t < 0.36) {
    const k = clamp((0.36 - t) * 2.8, 0, 1);
    r = lerp(r, 168, k); g = lerp(g, 164, k); b = lerp(b, 158, k);
  }
  if (ice > 0.38) return [234, 240, 248];
  return [lerp(r, 128, rock), lerp(g, 120, rock), lerp(b, 108, rock)];
};

export const RULESETS = [
  {
    // Calibration target: 1 bar, 78/21, ~288 K, ~71% ocean, 23.4° obliquity
    id: 'terra', name: 'Earth', blurb: 'Modern Earth — calibration basis for life, time, tectonics.',
    synthetic: true, earthLike: true,
    relief: 0.028, solar: 1.04, freeze: 0.28, aridity: 0.05,
    rotationPeriod: 1.0, obliquity: 23.4 * Math.PI / 180, eccentricity: 0.0167,
    gravity: 1.0, magnetosphere: 1.0,
    interior: { coreMassFrac: 0.32, coreRadiusFrac: 0.55, heatFlow: 1.0, conductivity: 1.0, lidMode: 'mobile', note: 'Fe–Ni core · active dynamo · mobile-lid plates' },
    // Volume mixing ratios; CO₂ ~420 ppm. Greenhouse bias stands in for H₂O/GHG column.
    gases: { N2: 0.7808, O2: 0.2095, CO2: 0.00042, CH4: 0.0000019, H2O: 0.01, dust: 0.0, sulphate: 0 },
    ghBias: 0.085, minCO2: 0.00038,
    totalWater: 0.92, continentFrac: 0.40, nPlates: 8,
    targetLandFrac: 0.29, targetMeanTemp: 0.50,
    atmo: [0.28, 0.50, 0.92], atmoStrength: 0.92, sky: [0.012, 0.035, 0.08],
    signature: 'glacial',
    // Shallow shelves read brighter; deep basins stay ink-blue
    ocean: (d) => [10 + 42 * d, 48 + 72 * d, 96 + 100 * d],
    land: landTerra,
  },
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
    relief: 0.068, solar: 0.72, freeze: 0.20, aridity: 0.42,
    rotationPeriod: 1.03, obliquity: 25 * Math.PI / 180, eccentricity: 0.09,
    gravity: 0.38, magnetosphere: 0.05,
    interior: { coreMassFrac: 0.18, coreRadiusFrac: 0.45, heatFlow: 0.25, conductivity: 0.15, lidMode: 'stagnant', note: 'Partly solid core · no global dynamo · stagnant lid' },
    gases: { N2: 0.03, O2: 0.001, CO2: 0.95, CH4: 0, H2O: 0.0003, dust: 0.02, sulphate: 0 },
    totalWater: 0.12, continentFrac: 0.95, nPlates: 8,
    atmo: [1.0, 0.52, 0.36], atmoStrength: 0.55, sky: [0.03, 0.018, 0.016],
    signature: 'dust',
    ocean: () => [112, 66, 48],
    land: (t, m, l, e, ice) => {
      if (ice > 0.42) return [226, 232, 240];
      const rock = clamp((e - 0.48) * 2.2, 0, 1);
      if (l > 0.08) {
        const k = clamp(l, 0, 1);
        return [lerp(80, 20, k), lerp(220, 140, k), lerp(30, 18, k)];
      }
      let r = lerp(196, 146, m), g = lerp(104, 78, m), b = lerp(66, 58, m);
      return [lerp(r, 128, rock), lerp(g, 90, rock), lerp(b, 74, rock)];
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
];

export function greenhouseFromGases(g, rule) {
  const co2 = Math.max(1e-6, g.CO2);
  const ch4 = Math.max(0, g.CH4);
  const h2o = Math.max(0, g.H2O);
  const dust = Math.max(0, g.dust + g.sulphate * 2);
  let gh = 0.04 * Math.log1p(co2 * 40) + 0.08 * Math.log1p(ch4 * 80) + 0.12 * h2o - 0.18 * dust
    + (rule?.ghBias || 0);
  const P = rule?.surfacePressureBar;
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
