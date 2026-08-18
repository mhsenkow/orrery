/** Human-readable world ids — four words encode a Uint32, a suffix names the land.
 *
 *  `ember-coral-dune-frost.shattered` is a complete starting world: the same
 *  seed and the same archetype, shareable as text or as `?world=`. Numbers and
 *  `orrery:` genesis strings still decode so old links keep working.
 */

import { hashTag } from './rng.js';

const WORDS = [
  'ember', 'coral', 'dune', 'frost', 'gale', 'haven', 'iris', 'jade',
  'kelp', 'loom', 'mist', 'nimbus', 'onyx', 'pearl', 'quartz', 'reef',
  'sage', 'tide', 'umbra', 'vale', 'willow', 'xenon', 'yarrow', 'zephyr',
  'amber', 'basalt', 'cinder', 'delta', 'eddy', 'fjord', 'grove', 'harbor',
  'inlet', 'jasper', 'knoll', 'lagoon', 'meadow', 'notch', 'oasis', 'pine',
  'quay', 'raven', 'silt', 'thorn', 'upland', 'verdant', 'wold', 'xeric',
  'yew', 'zinnia', 'alder', 'brook', 'canyon', 'drift', 'estuary', 'firn',
  'glade', 'heath', 'islet', 'jetty', 'karst', 'ledge', 'marsh', 'narrows',
  'oxbow', 'playa', 'spire', 'tarn', 'vent', 'wash', 'atoll', 'bluff',
  'cairn', 'dale', 'esker', 'firth', 'gorge', 'holm', 'isle', 'kame',
  'loch', 'mesa', 'ness', 'outcrop', 'pass', 'quarry', 'rill', 'scree',
  'arroyo', 'bight', 'fell', 'gully', 'howe', 'icefall', 'kloof', 'llyn',
  'moraine', 'nunatak', 'overhang', 'pothole', 'runnel', 'shoal', 'tombolo',
  'uvala', 'wharf', 'apex', 'butte', 'col', 'draw', 'echo', 'fault',
  'graben', 'horst', 'isthmus', 'joint', 'knick', 'levee', 'massif', 'nickpoint',
  'plunge', 'cuesta', 'ravine', 'scarp', 'talus', 'upwarp', 'anticline', 'bench',
  'cirque', 'doline', 'facies', 'geyser', 'hoodoo', 'insel', 'klippe', 'lapilli',
  'mogote', 'nivation', 'outlier', 'patera', 'roche', 'sill', 'tephra', 'varve',
  'wacke', 'aa', 'breccia', 'chert', 'dacite', 'felsite', 'gabbro', 'latite',
  'norite', 'obsidian', 'rhyolite', 'schist', 'trachyte', 'andesite', 'diabase',
  'fluvial', 'glacial', 'hotspot', 'orogen', 'pediment', 'regolith', 'till',
  'alluvium', 'clastic', 'eolian', 'foredune', 'hummock', 'loess', 'moulin',
  'outwash', 'pingo', 'qanat', 'serac', 'uplift', 'valley', 'ablation', 'crevasse',
  'erratic', 'iceberg', 'laminar', 'neve', 'rockfall', 'wave', 'yard', 'berg',
  'grounding', 'hanging', 'kettles', 'laterite', 'nival', 'soliflu', 'unaka',
  'ventifact', 'backreef', 'deflation', 'gossan', 'icewedge', 'thermokar',
  'quicksand', 'interflu', 'juvenile', 'monadnock', 'carbonat', 'eclogite',
  'harzburg', 'ignimbrite', 'kimberlite', 'migmatite', 'peridot', 'quartzite',
  'ultramafic', 'vesicle', 'welded', 'xenolith', 'andesine', 'biotite',
  'cordierite', 'dolomite', 'epidote', 'fluorite', 'garnet', 'hornblend',
  'illite', 'jadeite', 'kyanite', 'leucite', 'muscovite', 'nepheline',
  'olivine', 'pyroxene', 'quartzose', 'rutile', 'sanidine', 'tourmaline',
  'uralite', 'vesuvian', 'wollaston', 'zircon', 'anorthite', 'bytownite',
  'chlorite', 'diopside', 'enstatite', 'forsterite', 'grossular', 'hypersthene',
  'ilmenite', 'jadeitite', 'kaolinite', 'labrador', 'magnetite', 'natrolite',
  'orthoclase',
];

const LAND_IDS = new Set([
  'auto', 'pangaea', 'twoworlds', 'shattered', 'archipelago', 'ocean',
  'belt', 'polar', 'dichotomy', 'inland', 'highland', 'ridge', 'crater',
]);

if (WORDS.length !== 256) {
  throw new Error(`seedword list must be 256, got ${WORDS.length}`);
}

const INDEX = new Map(WORDS.map((w, i) => [w, i]));

export function seedToWords(seed) {
  const s = seed >>> 0;
  return [
    WORDS[s & 255],
    WORDS[(s >>> 8) & 255],
    WORDS[(s >>> 16) & 255],
    WORDS[(s >>> 24) & 255],
  ];
}

export function wordsToSeed(parts) {
  if (!parts || parts.length !== 4) return null;
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const ix = INDEX.get(String(parts[i]).toLowerCase());
    if (ix == null) return null;
    s |= ix << (i * 8);
  }
  return s >>> 0;
}

export function encodeWorldId(seed, landscape = 'auto') {
  const body = seedToWords(seed).join('-');
  const land = landscape && landscape !== 'auto' ? `.${landscape}` : '';
  return body + land;
}

export function decodeWorldId(str) {
  if (!str) return null;
  let raw = String(str).trim().toLowerCase();
  raw = raw.replace(/^orrery:\/\//, '');
  let landscape = 'auto';
  const suffix = raw.match(/^(.*)[./]([a-z]+)$/);
  if (suffix && LAND_IDS.has(suffix[2])) {
    raw = suffix[1];
    landscape = suffix[2];
  }
  const parts = raw.split(/[-_\s]+/).filter(Boolean);
  const seed = wordsToSeed(parts);
  if (seed == null) return null;
  return { seed, landscape };
}

/** Name, number, word-id, URL, or `orrery:` genesis string. */
export function parseWorldInput(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;
  if (s.startsWith('orrery:')) return { encoded: s };

  try {
    const u = new URL(s, 'https://orrery.local');
    const world = u.searchParams.get('world');
    if (world) return decodeWorldId(world) || parseWorldInput(world);
    const seedParam = u.searchParams.get('seed');
    const land = u.searchParams.get('land');
    if (seedParam && /^\d+$/.test(seedParam)) {
      return {
        seed: parseInt(seedParam, 10) >>> 0,
        landscape: land && LAND_IDS.has(land) ? land : 'auto',
      };
    }
  } catch { /* not a URL */ }

  if (/^\d+$/.test(s)) return { seed: parseInt(s, 10) >>> 0, landscape: 'auto' };
  const decoded = decodeWorldId(s);
  if (decoded) return decoded;
  // Short text — deterministic hash, same string always same world
  if (/^[a-z0-9._-]+$/i.test(s) && s.length <= 64) {
    return { seed: hashTag(s.toLowerCase()), landscape: 'auto', label: s };
  }
  return null;
}

export function worldIdOf(W) {
  const seed = (W.landSeed ?? W.seed) >>> 0;
  return encodeWorldId(seed, W._landscape || W.rule?.landscape || 'auto');
}
