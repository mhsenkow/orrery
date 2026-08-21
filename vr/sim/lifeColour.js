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
    { id: 'focus', label: 'focus', rgb: [232, 200, 120], swatch: 'frame', where: 'map', lock: false,
      tip: 'Watched cell', why: 'Gold frame — the cell this patch is reading.' },
    { id: 'hover', label: 'hover', rgb: [255, 220, 140], swatch: 'frame', where: 'map', lock: false,
      tip: 'Pointer', why: 'Brighter outline under the cursor.' },
    { id: 'hole', label: 'hole', rgb: [8, 10, 16], swatch: 'hole', where: 'map', lock: false,
      tip: 'Empty corner', why: 'Cube-sphere hole. Not ocean — the unwrap cannot fill it.' },
    { id: 'daisyBlack', label: 'black daisy', rgb: KIND_RGB[12], where: 'both',
      tip: 'Black daisy', why: 'Daisyworld — dark albedo, warms the cell.' },
    { id: 'daisyWhite', label: 'white daisy', rgb: KIND_RGB[13], where: 'both',
      tip: 'White daisy', why: 'Daisyworld — light albedo, cools the cell.' },
    { id: 'stromatolite', label: 'strom', rgb: [110, 130, 90], where: 'map',
      tip: 'Stromatolite', why: 'Layered microbial mound stamp.' },
  ];
}

/** Six things everyone needs before the catalogue. */
export function legendPrimer() {
  return [
    { id: 'primerCover', label: 'fill', rgb: [40, 120, 70], swatch: 'block', where: 'both', lock: false,
      tip: 'Square fill', why: 'Colour of the cell — ice, sea, forest, desert. Same on globe and map.' },
    { id: 'primerTree', label: 'trees', rgb: [40, 110, 55], swatch: 'tree', where: 'map', lock: false,
      tip: 'Trees on the map', why: 'Little canopy sprites mean plants growing there — not a separate biome chip.' },
    { id: 'primerHerd', label: 'herd', rgb: [140, 240, 120], swatch: 'cross', where: 'globe', lock: false,
      tip: 'Green cross', why: 'A herd or pod moving together. Read from orbit.' },
    { id: 'primerTown', label: 'town', rgb: [255, 184, 90], swatch: 'light', where: 'both', lock: false,
      tip: 'Amber lights / roofs', why: 'Settlements. Night lights on the globe; roofs on the map.' },
    { id: 'primerRim', label: 'rim', rgb: [255, 210, 90], swatch: 'rim', where: 'globe', lock: false,
      tip: 'Gold rim', why: 'The map’s window drawn on the sphere.' },
    { id: 'primerHunt', label: 'hunt', rgb: [255, 70, 55], swatch: 'wedge', where: 'map', lock: false,
      tip: 'Red wedge', why: 'That body is hunting right now.' },
  ];
}

/** Orbit-readable marks — herds, lights, the map patch rim. */
export function legendGlobeMarks() {
  return [
    { id: 'herdCross', label: 'herd', rgb: [140, 240, 120], swatch: 'cross', where: 'globe', lock: false,
      tip: 'Herd / pod', why: 'Green pulsing cross for a herd or pod of four+. Off on pinned Earth.' },
    { id: 'carcassMark', label: 'carcass', rgb: [160, 120, 90], swatch: 'cross', where: 'globe', lock: false,
      tip: 'Carcass', why: 'Smaller, quieter cross — a body large enough to matter from orbit.' },
    { id: 'nightLights', label: 'lights', rgb: [255, 184, 90], swatch: 'light', where: 'globe', lock: false,
      tip: 'Night lights', why: 'Amber on the dark side = built land. Day hides them.' },
    { id: 'patchRim', label: 'map rim', rgb: [255, 210, 90], swatch: 'rim', where: 'globe', lock: false,
      tip: 'Map rim', why: 'Gold outline = exactly what the flat map shows.' },
    { id: 'lifeNight', label: 'glow', rgb: [50, 200, 140], swatch: 'light', where: 'globe', lock: false,
      tip: 'Life glow', why: 'Cool green on the night side where life is dense — not cities.' },
    { id: 'flowStreak', label: 'flow', rgb: [115, 224, 242], swatch: 'streak', where: 'globe', lock: false,
      tip: 'Currents', why: 'Cyan streaks = ocean motion; white when Wind overlay is on.' },
    { id: 'orbitSprite', label: 'close-in', rgb: KIND_RGB[7], swatch: 'dot', where: 'globe', lock: false,
      tip: 'Zoom bodies', why: 'Sprites hide at far orbit; zoom in and they match the map.' },
  ];
}

/** Map living layer — what stampLife / beings actually draw. */
export function legendMapLife() {
  return [
    { id: 'stampCanopy', label: 'trees', rgb: [40, 110, 55], swatch: 'tree', where: 'map', lock: false,
      tip: 'Canopy trees', why: 'Blocky tree / crown sprites on a green square. Forest cover you can count.' },
    { id: 'stampScrub', label: 'scrub', rgb: [90, 150, 50], swatch: 'scrub', where: 'map', lock: false,
      tip: 'Scrub & grass', why: 'Short stalks and scrub sprites — open cover, not closed canopy.' },
    { id: 'stampReef', label: 'reef life', rgb: [30, 190, 170], swatch: 'glyph-ell', where: 'map', lock: false,
      tip: 'Reef & fish', why: 'Teal polyps and fish in shallow water cells.' },
    { id: 'buildings', label: 'roofs', rgb: [200, 160, 110], swatch: 'roof', where: 'map', lock: false,
      tip: 'Roofs & paths', why: 'Little buildings and roads. Same places light up amber on the night globe.' },
    { id: 'glyphSettler', label: 'settler', rgb: KIND_RGB[5], swatch: 'glyph-sq', where: 'map', lock: false,
      tip: 'Settler body', why: 'Moving square — a person, not the roof stamp.' },
    { id: 'glyphFauna', label: 'animal', rgb: KIND_RGB[7], swatch: 'glyph-circ', where: 'map', lock: false,
      tip: 'Animal body', why: 'Disc or soft shape — grazer, hunter, worm. Moves between cells.' },
    { id: 'glyphMarine', label: 'marine', rgb: KIND_RGB[15], swatch: 'glyph-ell', where: 'map', lock: false,
      tip: 'Marine body', why: 'Flat ellipse swimming — distinct from reef cover colour.' },
    { id: 'actHunt', label: 'hunt', rgb: [255, 70, 55], swatch: 'wedge', where: 'map', lock: false,
      tip: 'Hunting', why: 'Red wedge beside a body.' },
    { id: 'actFlee', label: 'flee', rgb: [255, 170, 70], swatch: 'dashes', where: 'map', lock: false,
      tip: 'Fleeing', why: 'Orange dashes — panic from fire or predators.' },
    { id: 'actForage', label: 'forage', rgb: [120, 230, 110], swatch: 'leaf', where: 'map', lock: false,
      tip: 'Foraging', why: 'Green leaf-dot — browsing. Second dot = already fed.' },
    { id: 'actTend', label: 'tend', rgb: [240, 210, 80], swatch: 'tend', where: 'map', lock: false,
      tip: 'Tending', why: 'Gold open square — settler at camp or crops.' },
    { id: 'actSurface', label: 'surface', rgb: [80, 200, 255], swatch: 'arc', where: 'map', lock: false,
      tip: 'Surfacing', why: 'Cyan arc — marine body rising into light.' },
    { id: 'sparkBirth', label: 'birth', rgb: [140, 255, 180], swatch: 'spark', where: 'map', lock: false,
      tip: 'Birth ring', why: 'Expanding green ring — just born.' },
    { id: 'sparkHunt', label: 'strike', rgb: [255, 90, 70], swatch: 'spark', where: 'map', lock: false,
      tip: 'Hunt ring', why: 'Expanding red ring — a strike just landed.' },
    { id: 'sparkOther', label: 'event', rgb: [200, 120, 255], swatch: 'spark', where: 'map', lock: false,
      tip: 'Event ring', why: 'Purple ring — dispersal or flock join.' },
  ];
}

function bodyEntries() {
  return [
    { id: 'bodies', label: 'bodies', rgb: KIND_RGB[2], swatch: 'dot', where: 'map', lock: false,
      tip: 'Open morphospace', why: 'Bodies are genomes (symmetry, organs), not a fixed stamp set.' },
    { id: 'pigmentRetinal', label: 'retinal', rgb: [180, 50, 140], where: 'both',
      tip: 'Retinal', why: 'Planet-wide purple — not chlorophyll.' },
    { id: 'pigmentBchl', label: 'BChl', rgb: [120, 45, 110], where: 'both',
      tip: 'BChl', why: 'Anoxygenic green/purple wash.' },
    { id: 'pigmentChla', label: 'Chl a', rgb: [30, 120, 70], where: 'both',
      tip: 'Chl a', why: 'Oxygenic green — free O₂ guild.' },
  ];
}

function shortCover(e) {
  const tip = e.tip || e.label;
  const why = (e.why || '').split(/[.—]/)[0].trim();
  return { ...e, tip, why: why.length > 72 ? `${why.slice(0, 70)}…` : why, where: 'both' };
}

function shortGuild(e) {
  const tip = e.tip || e.label;
  const why = (e.why || '').replace(/\s*Same palette as Seed guild\.?/i, '').trim();
  return { ...e, tip, why, where: 'both' };
}

/** Full glossary — primer first, then each display, then catalogues. */
export function legendGlossary(W) {
  const kind = W?._planetKind;
  const alien = !usesWhittakerCover(kind, W);
  return [
    {
      id: 'primer', title: 'Start here', highlight: true, grid: 'primer',
      blurb: 'Same language on the sphere and the patch. Gold rim = map window. Hover a coloured row to light matching cells.',
      entries: legendPrimer(),
    },
    {
      id: 'globe', title: 'On the globe', highlight: true, grid: 'marks',
      blurb: 'Marks you can read from orbit.',
      entries: legendGlobeMarks(),
    },
    {
      id: 'maplife', title: 'On the map', highlight: true, grid: 'marks',
      blurb: 'Stamps on the squares, then moving bodies and what they are doing.',
      entries: legendMapLife(),
    },
    {
      id: 'cover', title: alien ? 'Surface colour' : 'Cover colour', highlight: true,
      blurb: alien
        ? `Cell fill on globe and map — ${kind} geology and ices, not Earth biomes.`
        : 'Cell fill on globe and map — ice, sea, Whittaker cover, settlements.',
      entries: coverEntries(W).map(shortCover),
    },
    {
      id: 'guild', title: 'Metabolisms', highlight: true, grid: 'guilds',
      blurb: 'Which redox couple won the cell. Seed guild uses this palette.',
      entries: guildEntries().map(shortGuild),
    },
    {
      id: 'bodies', title: 'Pigments', highlight: true, grid: 'marks',
      blurb: 'Planet-wide washes and the body grammar.',
      entries: bodyEntries(),
    },
    {
      id: 'marks', title: 'Chrome', highlight: true, grid: 'marks',
      blurb: 'Frames, holes, Daisyworld.',
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
  if (key === 'stampCanopy' || key === 'primerTree') {
    return (W.life[c] || 0) > 0.08 && W.h[c] >= W.seaLevel && (W.ice[c] || 0) < 0.45;
  }
  if (key === 'buildings' || key === 'primerTown') return (W.build?.[c] || 0) > 0.12;
  if (key === 'bodies') return (W.life[c] || 0) > 0.08 || !!dominantGuildAt(W, c);
  if (key === 'pigmentRetinal') return W.dominantPigment === 'retinal';
  if (key === 'pigmentBchl') return W.dominantPigment === 'bchl';
  if (key === 'pigmentChla') return W.dominantPigment === 'chla' || !W.dominantPigment;
  return false;
}

export { GUILD_RGB };
