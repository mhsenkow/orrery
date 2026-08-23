/** World field schema — quality-400 H1.
 *  Curated core of W; full census lives in vr/data/fields/ (H2).
 *  New field checklist: name, kind, type, unit?, owner, saved, derived.
 *  @provenance look
 */

/** @typedef {'field'|'scalar'|'record'|'flag'|'derived'|'meta'} FieldKind */

/**
 * @typedef {object} FieldRow
 * @property {string} name
 * @property {FieldKind} kind
 * @property {string} type  float32[] | uint8[] | number | object | …
 * @property {string} [unit]
 * @property {string} owner  module that may write — enforced when W.debugAssert === 'throw' (P21)
 * @property {string[]} [handoff]  ordered modules allowed to mutate (P24/P26); owner is primary
 * @property {boolean} saved
 * @property {boolean} [derived]
 * @property {string} [why]
 */

/**
 * G24 — structural type for curated W field names (checkJs / IDEs).
 * Not exhaustive of every runtime key; use fields census for the full set.
 * @typedef {object} WorldFieldsCore
 * @property {Float32Array} [h]
 * @property {Float32Array} [temp]
 * @property {Float32Array} [moist]
 * @property {Float32Array} [life]
 * @property {Float32Array} [clouds]
 * @property {number} [meanTemp]
 * @property {number} [meanLife]
 * @property {number} [seaLevel]
 * @property {number} [ageYr]
 */

/** Curated rows — source of truth for allocate / document / save planning. */
export const FIELDS = Object.freeze([
  {
    name: 'h',
    kind: 'field',
    type: 'float32[]',
    unit: 'relief',
    owner: 'tectonics',
    handoff: ['world', 'tectonics', 'earth', 'earthTerrain', 'god/sculpt', 'hydro'],
    saved: true,
    why: 'heightfield',
  },
  {
    name: 'temp',
    kind: 'field',
    type: 'float32[]',
    unit: 'mapT',
    owner: 'atmo',
    handoff: ['atmo', 'gpgpu', 'earth', 'god/climate', 'iceshell'],
    saved: false,
    why: 'surface temperature map',
  },
  {
    name: 'moist',
    kind: 'field',
    type: 'float32[]',
    unit: '0-1',
    owner: 'hydro',
    handoff: ['hydro', 'earth', 'gpgpu', 'god/climate', 'god/brush'],
    saved: false,
  },
  { name: 'precip', kind: 'field', type: 'float32[]', unit: '0-1', owner: 'hydro', saved: false },
  { name: 'clouds', kind: 'field', type: 'float32[]', unit: '0-1', owner: 'atmo', saved: false },
  {
    name: 'ice',
    kind: 'field',
    type: 'float32[]',
    unit: '0-1',
    owner: 'hydro',
    handoff: ['hydro', 'earth', 'iceshell', 'gpgpu', 'god/climate', 'god/sculpt'],
    saved: false,
  },
  { name: 'iceLand', kind: 'field', type: 'float32[]', unit: '0-1', owner: 'hydro', saved: false },
  { name: 'iceSea', kind: 'field', type: 'float32[]', unit: '0-1', owner: 'hydro', saved: false },
  {
    name: 'life',
    kind: 'field',
    type: 'float32[]',
    unit: '0-1',
    owner: 'bio',
    handoff: ['bio', 'redox', 'fire', 'evolve', 'extinction', 'god/life', 'earth'],
    saved: false,
    why: 'biomass density; bio owns modern Earth',
  },
  { name: 'fire', kind: 'field', type: 'float32[]', unit: '0-1', owner: 'fire', saved: false },
  {
    name: 'build',
    kind: 'field',
    type: 'float32[]',
    unit: '0-1',
    owner: 'city',
    handoff: ['city', 'anthro', 'dark'],
    saved: true,
  },
  { name: 'windU', kind: 'field', type: 'float32[]', unit: 'map', owner: 'wind', saved: false },
  { name: 'windV', kind: 'field', type: 'float32[]', unit: 'map', owner: 'wind', saved: false },
  { name: 'frost', kind: 'field', type: 'float32[]', unit: '0-1', owner: 'cover', saved: false },
  {
    name: 'ash',
    kind: 'field',
    type: 'float32[]',
    unit: '0-1',
    owner: 'atmo',
    handoff: ['atmo', 'tectonics', 'fire', 'god/disaster', 'ordnance'],
    saved: false,
  },
  {
    name: 'crust',
    kind: 'field',
    type: 'float32[]',
    unit: '0-1',
    owner: 'tectonics',
    saved: false,
  },
  { name: 'substrate', kind: 'field', type: 'uint8[]', owner: 'substrateField', saved: true },

  { name: 'meanTemp', kind: 'scalar', type: 'number', unit: 'mapT', owner: 'atmo', saved: false },
  { name: 'meanLife', kind: 'scalar', type: 'number', unit: '0-1', owner: 'bio', saved: false },
  { name: 'iceFrac', kind: 'scalar', type: 'number', unit: '0-1', owner: 'hydro', saved: false },
  { name: 'landFrac', kind: 'scalar', type: 'number', unit: '0-1', owner: 'hydro', saved: false },
  {
    name: 'seaLevel',
    kind: 'scalar',
    type: 'number',
    unit: 'relief',
    owner: 'hydro',
    handoff: ['hydro', 'earth', 'epoch', 'iceshell', 'god/sculpt'],
    saved: true,
  },
  { name: 'solar', kind: 'scalar', type: 'number', unit: 'S⊕', owner: 'atmo', saved: false },
  { name: 'year', kind: 'scalar', type: 'number', unit: 'a', owner: 'world', saved: true },
  { name: 'ageYr', kind: 'scalar', type: 'number', unit: 'a', owner: 'world', saved: true },
  { name: 'dtYr', kind: 'scalar', type: 'number', unit: 'a/tick', owner: 'world', saved: false },
  { name: 'seed', kind: 'meta', type: 'number', owner: 'world', saved: true },
  { name: 'health', kind: 'scalar', type: 'number', unit: '0-1', owner: 'gaia', saved: false },
  { name: 'resilience', kind: 'scalar', type: 'number', unit: '0-1', owner: 'gaia', saved: false },
  { name: 'energy', kind: 'scalar', type: 'number', owner: 'economy', saved: false },
  { name: 'waterDrift', kind: 'scalar', type: 'number', owner: 'assert', saved: false },

  {
    name: 'gases',
    kind: 'record',
    type: 'object',
    owner: 'atmo',
    handoff: ['atmo', 'carbon', 'epoch', 'god/climate'],
    saved: true,
  },
  { name: 'rule', kind: 'meta', type: 'object', owner: 'world', saved: true },
  { name: 'chron', kind: 'record', type: 'object', owner: 'chronicle', saved: true },
  { name: 'tree', kind: 'record', type: 'object', owner: 'evolve', saved: true },
  { name: 'transitions', kind: 'record', type: 'object', owner: 'redox', saved: true },
  { name: 'carbon', kind: 'record', type: 'object', owner: 'carbon', saved: false },
  {
    name: 'dark',
    kind: 'record',
    type: 'object',
    owner: 'dark',
    handoff: ['dark', 'world'],
    saved: true,
    why: 'optional ?dark=1 layer',
  },

  { name: 'autopilot', kind: 'flag', type: 'boolean', owner: 'gaiaDrive', saved: false },
  { name: 'gaiaDrive', kind: 'flag', type: 'string', owner: 'gaiaDrive', saved: false },
  { name: 'scarcityMode', kind: 'flag', type: 'string', owner: 'economy', saved: false },
  {
    name: '_atmScale',
    kind: 'derived',
    type: 'number',
    owner: 'cover',
    saved: false,
    derived: true,
  },
  {
    name: '_tropPole',
    kind: 'derived',
    type: 'number',
    owner: 'wind',
    saved: false,
    derived: true,
  },
  {
    name: '_degraded',
    kind: 'derived',
    type: 'string[]',
    owner: 'scheduler',
    saved: false,
    derived: true,
  },
  {
    name: '_waterMass0',
    kind: 'derived',
    type: 'number',
    owner: 'assert',
    saved: false,
    derived: true,
  },

  {
    name: 'bodies',
    kind: 'record',
    type: 'object',
    owner: 'sky',
    saved: true,
    why: 'lights + sats elements',
  },
  {
    name: 'sky',
    kind: 'record',
    type: 'object',
    owner: 'sky',
    saved: false,
    why: 'derived geometry per tick',
  },
  { name: 'spinPhase', kind: 'scalar', type: 'number', unit: 'rad', owner: 'sky', saved: true },
  { name: 'spinAxis', kind: 'scalar', type: 'number[]', unit: 'dir', owner: 'sky', saved: true },
  {
    name: 'precessionPhase',
    kind: 'scalar',
    type: 'number',
    unit: 'rad',
    owner: 'sky',
    saved: true,
  },
  { name: 'season', kind: 'scalar', type: 'number', unit: 'rad', owner: 'sky', saved: true },
  {
    name: 'obliquity',
    kind: 'scalar',
    type: 'number',
    unit: 'rad',
    owner: 'sky',
    handoff: ['god/climate', 'world'],
    saved: true,
  },
  {
    name: 'rotationPeriod',
    kind: 'scalar',
    type: 'number',
    unit: 'd⊕',
    owner: 'sky',
    handoff: ['god/climate', 'world', 'wind'],
    saved: true,
  },
  {
    name: 'moon',
    kind: 'record',
    type: 'object',
    owner: 'sky',
    handoff: ['god/climate', 'god/genesis'],
    saved: true,
    derived: true,
  },
  {
    name: '_moonDir',
    kind: 'derived',
    type: 'number[]',
    owner: 'sky',
    saved: false,
    derived: true,
  },
  { name: '_sunDir', kind: 'derived', type: 'number[]', owner: 'sky', saved: false, derived: true },
]);

export const FIELD_BY_NAME = Object.freeze(Object.fromEntries(FIELDS.map((r) => [r.name, r])));

export function fieldCount() {
  return FIELDS.length;
}

export function fieldsByKind(kind) {
  return FIELDS.filter((r) => r.kind === kind);
}

export function savedFields() {
  return FIELDS.filter((r) => r.saved);
}

/** Schema hash stub for saves (H37 / D37). */
export function fieldsSchemaHash() {
  let h = 0;
  for (const r of FIELDS) {
    const s = `${r.name}:${r.kind}:${r.saved ? 1 : 0}`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
