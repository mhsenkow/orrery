/** Shared lifeform colour language — guilds, classes, pigments.
 *  One palette for local map, globe canopy, and entity tints. */

import { GUILDS } from './redox.js';
import { LIFE_CLASSES } from './bio.js';
import { BIOMES } from './ecology.js';
import { usesWhittakerCover } from './planetKind.js';
import { surfaceKeyAt, planetCoverEntries } from './planetLook.js';

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

const GUILD_SHORT = {
  fermenter: 'ferment', methanogen: 'methane', sulfateReducer: 'SO₄ red',
  ironReducer: 'Fe red', anammox: 'anammox', denitrifier: 'denitr',
  methanotroph: 'CH₄ ox', ironOxidizer: 'Fe ox', photoferrotroph: 'photoFe',
  purpleSulfur: 'purple', greenSulfur: 'green S', cyanobacteria: 'cyano',
  aerobe: 'aerobe', nFixer: 'N-fix', nitrifier: 'nitrif',
  decomposer: 'decomp', chemolithotroph: 'litho',
};

const MAT_GUILDS = new Set([
  'cyanobacteria', 'purpleSulfur', 'greenSulfur', 'photoferrotroph',
  'chemolithotroph', 'methanogen', 'ironOxidizer',
]);

function chem(s) {
  return String(s)
    .replace(/orgC/g, 'org C')
    .replace(/H2O/g, 'H₂O').replace(/H2S/g, 'H₂S').replace(/H2/g, 'H₂')
    .replace(/CO2/g, 'CO₂').replace(/O2/g, 'O₂').replace(/CH4/g, 'CH₄')
    .replace(/SO4/g, 'SO₄').replace(/NO3/g, 'NO₃').replace(/NO2/g, 'NO₂')
    .replace(/NH4/g, 'NH₄').replace(/N2/g, 'N₂')
    .replace(/Fe3/g, 'Fe³⁺').replace(/Fe2/g, 'Fe²⁺');
}

function guildWhy(g) {
  const pair = g.acceptor === 'none' ? `${chem(g.donor)} (fermentation)` : `${chem(g.donor)} → ${chem(g.acceptor)}`;
  const extra = g.oxygenic ? ' Oxygenic — free O₂.' : g.vent ? ' Vent specialist.' : g.nFix ? ' Pays the N₂ bill.' : g.makes ? ` Makes ${chem(g.makes)}.` : '';
  return `${pair}.${extra} Same palette as Seed guild.`;
}

const SEA_RGB = { shallows: [18, 48, 68], shelf: [10, 28, 48], ocean: [26, 74, 108] };
const GROUND_RGB = {
  tundra: [142, 148, 140], boreal: [22, 40, 32],
  tropRainforest: [14, 36, 22], vent: [72, 58, 64],
  upwelling: [12, 48, 68], gyre: [10, 32, 58], deep: [6, 14, 24],
};

function coverEntries(W) {
  const kind = W?._planetKind;
  if (!usesWhittakerCover(kind, W)) return planetCoverEntries(kind);
  return earthCoverEntries();
}

function earthCoverEntries() {
  return [
    { id: 'canopy', label: 'canopy', rgb: CLASS_RGB[2],
      tip: 'Closed plant cover',
      why: 'Forest or any land cell whose biomass reads as a canopy rather than grass. Darker albedo.' },
    { id: 'rain', label: 'rain', rgb: BIOME_LIFE.tropRainforest,
      tip: 'Rainforest',
      why: 'Closed wet canopy — tropical or temperate rainforest. Darker than deciduous cover.' },
    { id: 'boreal', label: 'boreal', rgb: BIOME_LIFE.boreal,
      tip: 'Boreal',
      why: 'Cold-forest cover. Needle canopy, dark, slow.' },
    { id: 'tundra', label: 'tundra', rgb: GROUND_RGB.tundra,
      tip: 'Tundra',
      why: 'Low plant cover above the tree line. Not ice — just too cold for a canopy.' },
    { id: 'grass', label: 'grass', rgb: BIOME_LIFE.grassland,
      tip: 'Grassland',
      why: 'Open photosynthetic cover. Wet enough for plants, not a closed canopy.' },
    { id: 'savanna', label: 'savanna', rgb: BIOME_LIFE.savanna || [130, 140, 45],
      tip: 'Savanna',
      why: 'Grass–tree bistability. Wet enough for trees, dry enough that grass can hold.' },
    { id: 'desert', label: 'desert', rgb: BIOME_LIFE.desert,
      tip: 'Desert',
      why: 'Moisture below the plant gate. Sand and rock — not empty of all life.' },
    { id: 'barren', label: 'barren', rgb: [106, 100, 88],
      tip: 'Barren rock / soil',
      why: 'Land with too little life to paint. Rock, soil, recently sterilised ground.' },
    { id: 'ice', label: 'ice', rgb: [216, 228, 240],
      tip: 'Ice / snow',
      why: 'Ice or snow cover above ~0.45. Albedo, not habitat.' },
    { id: 'shallows', label: 'shallows', rgb: SEA_RGB.shallows,
      tip: 'Shallows',
      why: 'Lit water over a shelf. The square is the photic sea, not the abyss.' },
    { id: 'shelf', label: 'shelf', rgb: SEA_RGB.shelf,
      tip: 'Shelf',
      why: 'Deeper than the shallows, still a shelf. Light falling, not gone.' },
    { id: 'ocean', label: 'ocean', rgb: SEA_RGB.ocean,
      tip: 'Open ocean',
      why: 'Open water without a named mat. The square is the sea surface.' },
    { id: 'deep', label: 'deep', rgb: GROUND_RGB.deep,
      tip: 'Deep ocean',
      why: 'Aphotic water. If anything lives here it is not painted as a bloom.' },
    { id: 'gyre', label: 'gyre', rgb: GROUND_RGB.gyre,
      tip: 'Gyre',
      why: 'Ocean desert — the spinning basin where nutrients do not return.' },
    { id: 'upwelling', label: 'upwell', rgb: GROUND_RGB.upwelling,
      tip: 'Upwelling',
      why: 'Nutrient-rich water rising. Productive coasts, not the same as a reef.' },
    { id: 'vent', label: 'vent', rgb: GROUND_RGB.vent,
      tip: 'Vent field',
      why: 'Hydrothermal heat. Chemolithotrophs live here; the square is the chimney, not the biome around it.' },
    { id: 'reef', label: 'reef', rgb: [30, 190, 170],
      tip: 'Reef',
      why: 'Shallow photic carbonate builders. Warm, lit, not too deep.' },
    { id: 'fauna', label: 'fauna', rgb: CLASS_RGB[7],
      tip: 'Fauna',
      why: 'Macroscopic animals on land. The square follows that lineage’s own body, not a planet-wide ladder.' },
    { id: 'settler', label: 'settler', rgb: KIND_RGB[5],
      tip: 'Settlements',
      why: 'Built land. Cities and farms that raise the surface above the cover beneath.' },
  ];
}

function guildEntries() {
  return GUILDS.map((g) => ({
    id: g.id,
    label: GUILD_SHORT[g.id] || g.id.slice(0, 8),
    rgb: g.color,
    tip: g.id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    why: guildWhy(g),
  }));
}

export function legendEntries(W) {
  return coverEntries(W).concat(guildEntries());
}

export function legendMarks() {
  return [
    { id: 'focus', label: 'focus', rgb: [232, 200, 120], swatch: 'frame',
      tip: 'Gold frame on the watched cell',
      why: 'Gold inner frame. The cell this patch is looking at — the crosshair, not a biome.' },
    { id: 'hole', label: 'corner hole', rgb: [8, 10, 16], swatch: 'hole',
      tip: 'Cube-sphere corner the unwrap cannot fill',
      why: 'Dark square with a tan edge. A cube-sphere corner the flat unwrap cannot fill. Not ocean — empty.' },
    { id: 'daisyBlack', label: 'black daisy', rgb: KIND_RGB[12],
      tip: 'Black daisies',
      why: 'Daisyworld. Dark albedo, warms the cell. A tutorial metabolism, not a guild.' },
    { id: 'daisyWhite', label: 'white daisy', rgb: KIND_RGB[13],
      tip: 'White daisies',
      why: 'Daisyworld. Light albedo, cools the cell. The pair is the lesson.' },
    { id: 'stromatolite', label: 'strom', rgb: [110, 130, 90],
      tip: 'Stromatolites',
      why: 'Layered microbial mounds stamped on the square. A structure, not a cover class.' },
  ];
}

function bodyEntries() {
  return [
    { id: 'bodies', label: 'bodies', rgb: KIND_RGB[2], swatch: 'dot',
      tip: 'Open morphospace',
      why: 'Sprites on the square are genomes from the open morphospace — symmetry, organs, receptor bands — not sixteen stamps. A pentaradial body is five of whatever it has. 1.6×10²⁸ distinguishable plans; this planet visits a handful.' },
    { id: 'pigmentRetinal', label: 'retinal', rgb: [180, 50, 140],
      tip: 'Retinal pigment',
      why: 'Planet-wide purple. Bacteriorhodopsin / retinal, not chlorophyll. An Archean ocean can be this colour.' },
    { id: 'pigmentBchl', label: 'BChl', rgb: [120, 45, 110],
      tip: 'Bacteriochlorophyll',
      why: 'Anoxygenic green/purple. The phototrophs that do not split water.' },
    { id: 'pigmentChla', label: 'Chl a', rgb: [30, 120, 70],
      tip: 'Chlorophyll a',
      why: 'Oxygenic green. The pigment of the guild that invents free O₂.' },
  ];
}

/** Full map-square glossary — cover, the redox tower, grammar bodies, marks. */
export function legendGlossary(W) {
  const kind = W?._planetKind;
  const alien = !usesWhittakerCover(kind, W);
  return [
    {
      id: 'cover', title: alien ? 'Surface' : 'Cover', highlight: true,
      blurb: alien
        ? `This world’s own ground — not Whittaker biomes. ${kind} squares are geology and ices, the same paint the globe uses.`
        : 'The square fill: ice, rock, water, Whittaker plant cover, built land. Same cell on every world.',
      entries: coverEntries(W),
    },
    {
      id: 'guild', title: 'Metabolisms', highlight: true, grid: 'guilds',
      blurb: 'The universal system. Colour is which redox couple won the cell — not a kingdom, not an Earth biome. Seventeen guilds; Seed guild and the Guild overlay use this palette.',
      entries: guildEntries(),
    },
    {
      id: 'bodies', title: 'Bodies', highlight: true, grid: 'marks',
      blurb: 'Drawn on top of the square when you zoom in. The grammar, not the cover.',
      entries: bodyEntries(),
    },
    {
      id: 'marks', title: 'Marks', highlight: true, grid: 'marks',
      blurb: 'Frames and tutorial overlays. Not biomes.',
      entries: legendMarks(),
    },
  ];
}

/** Which legend key a cell maps to (for hover ↔ key). */
export function legendKeyAt(W, c) {
  if (c < 0) return null;
  if (!usesWhittakerCover(W._planetKind, W)) return surfaceKeyAt(W, c);
  if (W.ice[c] > 0.45) return 'ice';
  if ((W.blackDaisy?.[c] || 0) > 0.15) return 'daisyBlack';
  if ((W.whiteDaisy?.[c] || 0) > 0.15) return 'daisyWhite';
  if (W.h[c] < W.seaLevel) {
    if ((W.reef?.[c] || 0) > 0.2) return 'reef';
    const g = dominantGuildAt(W, c);
    if (g) return g;
    const biome = W.biome ? BIOMES[W.biome[c]] : null;
    if (biome === 'vent' || biome === 'upwelling' || biome === 'gyre' || biome === 'deep') return biome;
    const depth = (W.seaLevel - W.h[c]) || 0;
    if (depth < 0.06) return 'shallows';
    if (depth < 0.15) return 'shelf';
    return 'ocean';
  }
  if ((W.build?.[c] || 0) > 0.15) return 'settler';
  const life = W.life[c] || 0;
  if (life > 0.08) {
    const g = dominantGuildAt(W, c);
    if (g && ((W.unlockedClass || 0) < 2 || (W.lifeClass[c] || 0) < 2 || MAT_GUILDS.has(g))) return g;
    const biome = W.biome ? BIOMES[W.biome[c]] : null;
    if (biome === 'grassland' || biome === 'savanna') return biome === 'savanna' ? 'savanna' : 'grass';
    if (biome === 'tundra' || biome === 'boreal') return biome;
    if (biome === 'tropRainforest' || biome === 'tempRainforest') return 'rain';
    if ((W.unlockedClass || 0) >= 2 && (W.lifeClass[c] || 0) >= 3) return 'fauna';
    return 'canopy';
  }
  const biome = W.biome ? BIOMES[W.biome[c]] : null;
  if (biome === 'desert') return 'desert';
  if (biome === 'savanna' || biome === 'grassland') return biome === 'savanna' ? 'savanna' : 'grass';
  if (biome === 'tundra' || biome === 'boreal') return biome;
  return 'barren';
}

/** Hover a glossary row → which cells stay lit. Cover, guild, daisy, pigment. */
export function cellMatchesLegend(W, c, key) {
  if (!key || c < 0) return false;
  if (legendKeyAt(W, c) === key) return true;
  if (dominantGuildAt(W, c) === key) return true;
  if (key === 'daisyBlack') return (W.blackDaisy?.[c] || 0) > 0.1;
  if (key === 'daisyWhite') return (W.whiteDaisy?.[c] || 0) > 0.1;
  if (key === 'stromatolite') return (W.stromatolite?.[c] || 0) > 0.15;
  if (key === 'bodies') return (W.life[c] || 0) > 0.08 || !!dominantGuildAt(W, c);
  if (key === 'pigmentRetinal') return W.dominantPigment === 'retinal';
  if (key === 'pigmentBchl') return W.dominantPigment === 'bchl';
  if (key === 'pigmentChla') return W.dominantPigment === 'chla' || !W.dominantPigment;
  return false;
}

export { GUILD_RGB };
