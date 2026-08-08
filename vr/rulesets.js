/** Rulesets — content units with chemistry, orbit, and signature phenomena. */

import { clamp, lerp } from './math.js';

const landTerra = (t, m, l, e, ice) => {
  if (ice > 0.45) return [232, 240, 248];
  const rock = clamp((e - 0.55) * 2.4, 0, 1);
  let r, g, b;
  if (m < 0.30) { r = 196; g = 172; b = 118; }
  else if (l > 0.55) { r = lerp(64, 32, l); g = lerp(122, 86, l); b = lerp(58, 44, l); }
  else { r = lerp(150, 96, m); g = lerp(158, 140, m); b = lerp(96, 74, m); }
  if (t < 0.40) {
    const k = clamp((0.40 - t) * 3.2, 0, 1);
    r = lerp(r, 140, k); g = lerp(g, 146, k); b = lerp(b, 132, k);
  }
  return [lerp(r, 128, rock), lerp(g, 126, rock), lerp(b, 124, rock)];
};

export const RULESETS = [
  {
    id: 'terra', name: 'Terra', blurb: 'Water / carbon. Glacial cycles.',
    relief: 0.055, solar: 1.00, freeze: 0.30, aridity: 0.045,
    rotationPeriod: 1.0, obliquity: 23.5 * Math.PI / 180, eccentricity: 0.016,
    gravity: 1.0, magnetosphere: 1.0,
    gases: { N2: 0.78, O2: 0.01, CO2: 0.04, CH4: 0.002, H2O: 0.01, dust: 0.0, sulphate: 0 },
    totalWater: 1.0, continentFrac: 0.32, nPlates: 11,
    atmo: [0.32, 0.55, 1.0], atmoStrength: 1.0, sky: [0.02, 0.03, 0.06],
    signature: 'glacial',
    ocean: (d) => [12 + 38 * d, 40 + 72 * d, 86 + 110 * d],
    land: landTerra,
  },
  {
    id: 'vermis', name: 'Vermis', blurb: 'Silicate, no free water. Megafauna reshape terrain.',
    relief: 0.075, solar: 1.16, freeze: 0.12, aridity: 0.30,
    rotationPeriod: 1.2, obliquity: 12 * Math.PI / 180, eccentricity: 0.04,
    gravity: 0.9, magnetosphere: 0.6,
    gases: { N2: 0.85, O2: 0.0, CO2: 0.08, CH4: 0.01, H2O: 0.001, dust: 0.05, sulphate: 0 },
    totalWater: 0.08, continentFrac: 0.85, nPlates: 9,
    atmo: [1.0, 0.66, 0.30], atmoStrength: 1.25, sky: [0.05, 0.035, 0.02],
    signature: 'worms',
    ocean: (d) => [176 + 30 * d, 132 + 22 * d, 74 + 18 * d],
    land: (t, m, l, e, ice) => {
      const rock = clamp((e - 0.5) * 2.0, 0, 1);
      let r = lerp(214, 172, m), g = lerp(160, 116, m), b = lerp(88, 62, m);
      if (l > 0.35) {
        const k = clamp((l - 0.35) * 1.7, 0, 1);
        r = lerp(r, 92, k); g = lerp(g, 62, k); b = lerp(b, 104, k);
      }
      if (ice > 0.5) return [214, 206, 196];
      return [lerp(r, 150, rock), lerp(g, 116, rock), lerp(b, 86, rock)];
    },
  },
  {
    id: 'selene', name: 'Selene', blurb: 'Airless. Thermal shock and impact history.',
    relief: 0.048, solar: 1.0, freeze: 0.28, aridity: 1.0,
    rotationPeriod: 27, obliquity: 1.5 * Math.PI / 180, eccentricity: 0.05,
    gravity: 0.16, magnetosphere: 0.0,
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
    relief: 0.068, solar: 0.72, freeze: 0.20, aridity: 0.42,
    rotationPeriod: 1.03, obliquity: 25 * Math.PI / 180, eccentricity: 0.09,
    gravity: 0.38, magnetosphere: 0.05,
    gases: { N2: 0.03, O2: 0.001, CO2: 0.95, CH4: 0, H2O: 0.0003, dust: 0.02, sulphate: 0 },
    totalWater: 0.12, continentFrac: 0.95, nPlates: 8,
    atmo: [1.0, 0.52, 0.36], atmoStrength: 0.55, sky: [0.03, 0.018, 0.016],
    signature: 'dust',
    ocean: () => [112, 66, 48],
    land: (t, m, l, e, ice) => {
      if (ice > 0.42) return [226, 232, 240];
      const rock = clamp((e - 0.48) * 2.2, 0, 1);
      let r = lerp(196, 146, m), g = lerp(104, 78, m), b = lerp(66, 58, m);
      if (l > 0.3) {
        const k = clamp((l - 0.3) * 1.5, 0, 1);
        r = lerp(r, 110, k); g = lerp(g, 102, k); b = lerp(b, 72, k);
      }
      return [lerp(r, 128, rock), lerp(g, 90, rock), lerp(b, 74, rock)];
    },
  },
  {
    id: 'daisy', name: 'Daisyworld', blurb: 'Lovelock’s daisies regulating temperature vs a brightening sun.',
    relief: 0.02, solar: 0.85, freeze: 0.22, aridity: 0.02,
    rotationPeriod: 1.0, obliquity: 0, eccentricity: 0,
    gravity: 1.0, magnetosphere: 1.0,
    gases: { N2: 0.8, O2: 0.1, CO2: 0.05, CH4: 0, H2O: 0.02, dust: 0, sulphate: 0 },
    totalWater: 0.4, continentFrac: 1.0, nPlates: 4, daisyworld: true,
    atmo: [0.45, 0.7, 0.9], atmoStrength: 0.7, sky: [0.03, 0.04, 0.07],
    signature: 'daisies',
    ocean: (d) => [30 + 40 * d, 80 + 60 * d, 120 + 80 * d],
    land: (t, m, l, e, ice, extra) => {
      if (ice > 0.5) return [240, 245, 250];
      const black = extra?.black || 0, white = extra?.white || 0;
      const bare = 1 - black - white;
      return [
        lerp(lerp(110, 40, black), 240, white),
        lerp(lerp(120, 50, black), 242, white),
        lerp(lerp(70, 45, black), 248, white) * bare + lerp(50, 245, white) * (1 - bare) * 0.3 + 80 * bare,
      ].map((v) => clamp(v, 0, 255));
    },
  },
];

export function greenhouseFromGases(g) {
  // Log radiative forcing approximation — better than a constant.
  const co2 = Math.max(1e-6, g.CO2);
  const ch4 = Math.max(0, g.CH4);
  const h2o = Math.max(0, g.H2O);
  const dust = Math.max(0, g.dust + g.sulphate * 2);
  return 0.04 * Math.log1p(co2 * 40) + 0.08 * Math.log1p(ch4 * 80) + 0.12 * h2o - 0.18 * dust;
}

export function totalPressure(g) {
  return g.N2 + g.O2 + g.CO2 + g.CH4 + g.H2O + g.dust * 0.1;
}
