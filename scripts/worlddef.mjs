#!/usr/bin/env node
// Compiles vr/data/worlds/definitions.json + features.json into vr/sim/worldDef.js.
//
//   node scripts/worlddef.mjs
//
// The join that five vocabulary tables were missing. Gates are axes and flags,
// not a body-name regex. Overrides require a why. Features attach to
// surfaceKeyAt ids.

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'vr', 'data', 'worlds');
const OUT = join(ROOT, 'vr', 'sim', 'worldDef.js');

const TAGS = new Set(['measured', 'fitted', 'invented']);
const CONF = new Set(['measured', 'inferred', 'invented']);
const INTERIORS = new Set(['mobile', 'stagnant', 'episodic', 'heatpipe', 'ice', 'magma', 'fluid']);
const VOLATILES = new Set(['H2O', 'CO2', 'CH4', 'N2', 'SO2', 'H2', 'silicate', 'NH3']);
const NEED_DEFS = [
  'earth', 'envelope', 'magma', 'iceOrganics', 'n2Ice', 'iceShell',
  'heatpipe', 'runaway', 'dustyBasalt', 'airless', 'rocky',
];

const read = async (f) => JSON.parse(await readFile(join(SRC, f), 'utf8'));

const src = await read('definitions.json');
const features = await read('features.json');
const columns = await read('columns.json');
const substrates = await read('substrates.json');

const problems = [];
const defs = src.definitions || [];
const overrides = src.overrides || [];
const recipeIds = new Set((columns.recipes || []).map((r) => r.id));
const subIds = new Set((substrates.materials || []).map((m) => m.id));
const ids = new Set();

if (!(src.version >= 1)) problems.push('definitions: version must be ≥ 1');
if (!src.why || src.why.length < 20) problems.push('definitions: why must be a sentence');
if (!src.units || typeof src.units !== 'object') problems.push('definitions: units map is required');

for (const d of defs) {
  const at = d?.id || 'row';
  if (!d?.id) problems.push('definition missing id');
  else if (ids.has(d.id)) problems.push(`duplicate definition "${d.id}"`);
  else ids.add(d.id);
  if (!TAGS.has(d?.tag)) problems.push(`${at}: tag "${d?.tag}"`);
  if (!CONF.has(d?.confidence)) problems.push(`${at}: confidence "${d?.confidence}"`);
  if (!d?.why || d.why.length < 20) problems.push(`${at}: why must be a sentence`);
  if (d.column != null && !recipeIds.has(d.column)) {
    problems.push(`${at}: unknown column recipe "${d.column}"`);
  }
  if (d.bedrock != null && !subIds.has(d.bedrock)) {
    problems.push(`${at}: unknown bedrock "${d.bedrock}"`);
  }
  if (d.cover != null && !subIds.has(d.cover)) {
    problems.push(`${at}: unknown cover "${d.cover}"`);
  }
  const n = d.needs || {};
  for (const v of n.interior || []) {
    if (!INTERIORS.has(v)) problems.push(`${at}: unknown interior "${v}"`);
  }
  for (const v of n.volatile || []) {
    if (!VOLATILES.has(v)) problems.push(`${at}: unknown volatile "${v}"`);
  }
  const look = d.look || {};
  for (const k of ['exposureBias', 'limbSoft', 'haze']) {
    if (look[k] != null && !Number.isFinite(look[k])) problems.push(`${at}: look.${k} not finite`);
  }
  for (const rgbK of ['skyRgb', 'hazeRgb']) {
    const rgb = look[rgbK];
    if (rgb && (!Array.isArray(rgb) || rgb.length !== 3
      || rgb.some((c) => !Number.isInteger(c) || c < 0 || c > 255))) {
      problems.push(`${at}: look.${rgbK} must be three integers 0–255`);
    }
  }
}

for (const id of NEED_DEFS) {
  if (!ids.has(id)) problems.push(`missing required definition "${id}"`);
}

for (const o of overrides) {
  if (!o?.body) problems.push('override missing body');
  if (!o?.why || o.why.length < 20) problems.push(`${o?.body || 'override'}: why must be a sentence`);
}

const featBodies = features.bodies || {};
const featOut = {};
for (const [body, list] of Object.entries(featBodies)) {
  if (!Array.isArray(list) || !list.length) {
    problems.push(`features.${body}: empty`);
    continue;
  }
  const rows = [];
  const fids = new Set();
  for (const f of list) {
    if (!f?.id) problems.push(`features.${body}: missing id`);
    else if (fids.has(f.id)) problems.push(`features.${body}: duplicate "${f.id}"`);
    else fids.add(f.id);
    if (!f?.name) problems.push(`features.${body}.${f?.id}: missing name`);
    if (!f?.key) problems.push(`features.${body}.${f?.id}: missing key`);
    if (f.tag && !TAGS.has(f.tag)) problems.push(`features.${body}.${f.id}: tag "${f.tag}"`);
    rows.push({
      id: f.id,
      name: f.name,
      key: f.key,
      ...(f.kind ? { kind: f.kind } : {}),
      ...(Number.isFinite(f.lat) ? { lat: f.lat } : {}),
      ...(Number.isFinite(f.lon) ? { lon: f.lon } : {}),
      ...(Number.isFinite(f.rDeg) ? { rDeg: f.rDeg } : {}),
      ...(f.tag ? { tag: f.tag } : {}),
      ...(f.why ? { why: f.why } : {}),
    });
  }
  featOut[body] = rows;
}

if (problems.length) {
  console.error(problems.map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}

const slimDefs = defs.map((d) => ({
  id: d.id,
  tag: d.tag,
  confidence: d.confidence,
  why: d.why,
  needs: d.needs || {},
  ...(d.column != null ? { column: d.column } : {}),
  ...(d.bedrock != null ? { bedrock: d.bedrock } : {}),
  ...(d.cover != null ? { cover: d.cover } : {}),
  look: d.look || {},
  ...(d.paint ? { paint: d.paint } : {}),
}));

const slimOvr = overrides.map((o) => ({
  body: o.body,
  why: o.why,
  ...(o.look ? { look: o.look } : {}),
  ...(o.column ? { column: o.column } : {}),
  ...(o.bedrock ? { bedrock: o.bedrock } : {}),
}));

const L = [];
L.push('/** GENERATED by scripts/worlddef.mjs from vr/data/worlds/definitions.json + features.json — do not edit. */');
L.push('');
L.push(`export const WORLDDEF_VERSION = ${src.version | 0 || 1};`);
L.push(`export const WORLDDEF_HASH = '${createHash('sha1').update(JSON.stringify({
  definitions: src.definitions, overrides: src.overrides, features: features.bodies,
})).digest('hex').slice(0, 12)}';`);
L.push(`export const OVERRIDE_COUNT = ${slimOvr.length};`);
L.push('');
L.push('/** Selection rules. First match wins. Gates are axes and flags. */');
L.push(`export const WORLD_DEFS = Object.freeze(${JSON.stringify(slimDefs)}.map((d) => Object.freeze(d)));`);
L.push('');
L.push('export const DEF_BY_ID = Object.freeze(Object.fromEntries(');
L.push('  WORLD_DEFS.map((d) => [d.id, d]),');
L.push('));');
L.push('');
L.push('/** Per-body exceptions. Each carries a why. */');
L.push(`export const WORLD_OVERRIDES = Object.freeze(${JSON.stringify(slimOvr)}.map((o) => Object.freeze(o)));`);
L.push('');
L.push('export const OVERRIDE_BY_BODY = Object.freeze(Object.fromEntries(');
L.push('  WORLD_OVERRIDES.map((o) => [o.body, o]),');
L.push('));');
L.push('');
L.push('/** Named features keyed on catalogue body name. Match is surfaceKeyAt. */');
L.push(`export const FEATURES_BY_BODY = Object.freeze(Object.fromEntries(`);
L.push(`  Object.entries(${JSON.stringify(featOut)}).map(([k, v]) => [k, Object.freeze(v.map((f) => Object.freeze(f)))]),`);
L.push('));');
L.push('');
L.push(`export const UNITS = Object.freeze(${JSON.stringify(src.units || {})});`);
L.push('');

await writeFile(OUT, L.join('\n'));
const nFeat = Object.values(featOut).reduce((n, a) => n + a.length, 0);
console.log(`worlddef: ${slimDefs.length} definitions, ${slimOvr.length} overrides, ${nFeat} named features`);
console.log('wrote vr/sim/worldDef.js');
