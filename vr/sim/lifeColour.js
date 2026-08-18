/** Shared lifeform colour language — guilds, classes, pigments.
 *  One palette for local map, globe canopy, and entity tints. */

import { GUILDS } from './redox.js';
import { LIFE_CLASSES } from './bio.js';
import { BIOMES } from './ecology.js';

/** Stable clade tint from lineage id (golden-ratio hash). */
export function cladeRGB(id) {
  const h = (id * 2654435761) >>> 0;
  return [
    (h >> 0) & 255,
    (h >> 8) & 255,
    (h >> 16) & 255,
  ];
}

/** Morphology ladder colours (legacy lifeClass). */
export const CLASS_RGB = [
  [40, 160, 90],    // prokaryote — deep teal-green
  [70, 190, 110],   // eukaryote
  [50, 140, 70],    // multicellular — forest
  [180, 120, 50],   // arthropod — amber
  [40, 130, 190],   // fish — blue
  [90, 160, 70],    // amphibian
  [160, 140, 60],   // reptile — olive
  [200, 150, 120],  // mammal — warm
];

/** Entity kind → RGB (sprites on globe / local dots). */
export const KIND_RGB = {
  0: [30, 170, 70],    // canopy
  1: [90, 150, 50],    // scrub
  2: [50, 200, 80],    // grass
  3: [180, 140, 70],   // desert flora
  4: [140, 130, 110],  // alpine
  5: [255, 200, 120],  // settler
  6: [200, 220, 240],  // ice fauna
  7: [180, 80, 200],   // worms
  8: [120, 60, 160],
  9: [100, 180, 60],   // sparse plant
  10: [160, 160, 170],
  11: [220, 100, 60],
  12: [20, 20, 25],    // black daisy
  13: [250, 250, 255], // white daisy
  14: [40, 200, 180],  // reef
  15: [50, 140, 220],  // fish
};

const GUILD_RGB = Object.fromEntries(GUILDS.map((g) => [g.id, g.color]));

export function dominantGuildAt(W, c) {
  if (!W.guildDens) return null;
  let best = null, v = 0.08;
  for (const g of GUILDS) {
    const d = W.guildDens[g.id]?.[c] || 0;
    if (d > v) { v = d; best = g.id; }
  }
  return best;
}

export function lifeRGB(W, c, life = W.life[c]) {
  if (life < 0.05) return null;
  const k = Math.min(1, (life - 0.05) / 0.55);

  // Pigment chemistry first (Archean purple / green)
  const pig = W.dominantPigment;
  if (pig === 'bchl' || pig === 'retinal') {
    const base = pig === 'retinal' ? [180, 50, 140] : [120, 45, 110];
    return shade(base, k);
  }

  const guild = dominantGuildAt(W, c);
  if (guild && GUILD_RGB[guild]) {
    return shade(GUILD_RGB[guild], k);
  }

  // Biome-tinted canopy when modern / no guild signal
  if (W.biome && W.h[c] >= W.seaLevel) {
    const b = BIOMES[W.biome[c]];
    const biomeCol = BIOME_LIFE[b];
    if (biomeCol) return shade(biomeCol, k);
  }

  const cls = W.lifeClass[c] & 7;
  return shade(CLASS_RGB[cls] || CLASS_RGB[0], k);
}

const BIOME_LIFE = {
  tundra: [90, 120, 90],
  boreal: [30, 90, 70],
  tempDeciduous: [40, 140, 55],
  tempRainforest: [20, 110, 60],
  grassland: [120, 150, 50],
  desert: [140, 130, 60],
  savanna: [130, 140, 45],
  tropSeasonal: [35, 130, 50],
  tropRainforest: [15, 100, 45],
  reef: [30, 180, 160],
  upwelling: [20, 140, 120],
  gyre: [40, 100, 130],
  vent: [160, 90, 50],
  deep: [30, 60, 90],
};

function shade(rgb, k) {
  // Darker when sparse, richer when dense
  const t = 0.35 + k * 0.65;
  return [
    Math.min(255, (rgb[0] * t) | 0),
    Math.min(255, (rgb[1] * t) | 0),
    Math.min(255, (rgb[2] * t) | 0),
  ];
}

export function oceanLifeRGB(W, c, bloom) {
  const guild = dominantGuildAt(W, c);
  if (guild === 'purpleSulfur') return shade([140, 45, 110], Math.max(0.35, bloom));
  if (guild === 'greenSulfur') return shade([35, 110, 70], Math.max(0.35, bloom));
  if (guild === 'photoferrotroph') return shade([110, 55, 95], Math.max(0.3, bloom));
  if (W.reef[c] > 0.2) return shade([30, 190, 170], bloom);
  if (guild === 'cyanobacteria') return shade([15, 170, 105], Math.max(0.4, bloom));
  if (guild && GUILD_RGB[guild]) return shade(GUILD_RGB[guild], bloom * 0.85);
  return shade([20, 150, 140], bloom);
}

/** Colour chip for first-occurrence moments (matches map language). */
export const MOMENT_RGB = {
  firstCell: [55, 55, 50],
  firstPhotosynthesis: [120, 40, 90],
  firstOxygen: [30, 120, 70],
  firstEukaryote: [70, 190, 110],
  firstMulticellular: [50, 140, 70],
  firstLandPlant: [40, 160, 90],
  firstFlower: [220, 120, 160],
  firstFrostAfterThaw: [180, 210, 240],
};

export function momentRGB(key) {
  if (MOMENT_RGB[key]) return MOMENT_RGB[key];
  if (key?.startsWith('era:')) return [91, 140, 255];
  return [200, 180, 120];
}

export function lifeLabel(W, c) {
  const life = W.life[c] || 0;
  const guild = dominantGuildAt(W, c);
  if (life < 0.05 && !guild) return 'barren';
  if (guild && life < 0.15) return guild;
  const cls = LIFE_CLASSES[W.lifeClass[c]]?.id;
  if (life < 0.08) return guild || 'trace';
  // Prefer guild for microbes; class for complex
  if ((W.unlockedClass || 0) < 2 || (W.lifeClass[c] || 0) < 2) {
    return guild || cls || 'microbe';
  }
  return cls || guild || 'life';
}

export function legendEntries() {
  return [
    { id: 'canopy', label: 'canopy', rgb: CLASS_RGB[2] },
    { id: 'grass', label: 'grass', rgb: BIOME_LIFE.grassland },
    { id: 'cyanobacteria', label: 'cyano', rgb: GUILD_RGB.cyanobacteria },
    { id: 'purpleSulfur', label: 'purple', rgb: GUILD_RGB.purpleSulfur },
    { id: 'reef', label: 'reef', rgb: [30, 190, 170] },
    { id: 'ocean', label: 'ocean', rgb: [26, 74, 108] },
    { id: 'barren', label: 'barren', rgb: [106, 100, 88] },
    { id: 'savanna', label: 'savanna', rgb: BIOME_LIFE.savanna || [130, 140, 45] },
    { id: 'desert', label: 'desert', rgb: BIOME_LIFE.desert },
    { id: 'ice', label: 'ice', rgb: [216, 228, 240] },
    { id: 'fauna', label: 'fauna', rgb: CLASS_RGB[7] },
    { id: 'settler', label: 'settler', rgb: KIND_RGB[5] },
  ];
}

/** Which legend key a cell maps to (for hover ↔ key). */
export function legendKeyAt(W, c) {
  if (c < 0) return null;
  if (W.ice[c] > 0.45) return 'ice';
  if (W.h[c] < W.seaLevel) {
    if ((W.reef?.[c] || 0) > 0.2) return 'reef';
    const g = dominantGuildAt(W, c);
    if (g === 'cyanobacteria') return 'cyanobacteria';
    if (g === 'purpleSulfur') return 'purpleSulfur';
    if ((W.life[c] || 0) > 0.12) return g === 'greenSulfur' ? 'cyanobacteria' : 'ocean';
    return 'ocean';
  }
  if ((W.build?.[c] || 0) > 0.15) return 'settler';
  const life = W.life[c] || 0;
  if (life > 0.08) {
    const g = dominantGuildAt(W, c);
    if (g === 'cyanobacteria') return 'cyanobacteria';
    if (g === 'purpleSulfur') return 'purpleSulfur';
    const biome = W.biome ? BIOMES[W.biome[c]] : null;
    if (biome === 'grassland' || biome === 'savanna') return biome === 'savanna' ? 'savanna' : 'grass';
    if ((W.unlockedClass || 0) >= 2 && (W.lifeClass[c] || 0) >= 3) return 'fauna';
    return 'canopy';
  }
  const biome = W.biome ? BIOMES[W.biome[c]] : null;
  if (biome === 'desert') return 'desert';
  if (biome === 'savanna' || biome === 'grassland') return biome === 'savanna' ? 'savanna' : 'grass';
  return 'barren';
}

export { GUILD_RGB };
