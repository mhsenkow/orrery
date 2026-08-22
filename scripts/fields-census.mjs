#!/usr/bin/env node
/** Field census — quality-400 H2.
 *
 *   node scripts/fields-census.mjs
 *   npm run fields:census --prefix vr
 *
 * Walks vr JS/MJS for W.name accesses, writes vr/data/fields/census.json
 * and a draft classification into vr/data/fields/draft.json.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VR = join(ROOT, 'vr');
const OUT = join(ROOT, 'vr', 'data', 'fields');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function guessKind(name) {
  if (name.startsWith('_')) return 'derived';
  if (
    /^(temp|moist|precip|clouds|ice|iceLand|iceSea|h|crust|life|fire|build|windU|windV|ash|dust|frost|flow|lake|soil|toxin|rad)$/.test(
      name,
    )
  ) {
    return 'field';
  }
  if (
    /^(meanTemp|meanLife|iceFrac|landFrac|health|seaLevel|solar|year|ageYr|dtYr|seed)$/.test(name)
  ) {
    return 'scalar';
  }
  if (/^(rule|chron|tree|gases|plates|volcanoes|cities|polities|dark|entities)$/.test(name)) {
    return 'record';
  }
  if (/^(rng|rngState|autopilot|pausedSolar|state)$/.test(name)) return 'flag';
  return 'uncurated';
}

const files = walk(VR);
const counts = new Map();
const re = /\bW\.([A-Za-z_][A-Za-z0-9_]*)/g;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(re)) {
    const name = m[1];
    if (name === 'prototype' || name === 'constructor') continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
}

const rows = [...counts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([name, refs]) => ({
    name,
    refs,
    kind: guessKind(name),
    curated: guessKind(name) !== 'uncurated',
  }));

mkdirSync(OUT, { recursive: true });
const census = {
  generated: new Date().toISOString(),
  fileCount: files.length,
  nameCount: rows.length,
  names: Object.fromEntries(rows.map((r) => [r.name, r.refs])),
};
writeFileSync(join(OUT, 'census.json'), JSON.stringify(census, null, 2) + '\n');

const draft = {
  generated: census.generated,
  note: 'H2 draft — curate into vr/sim/fields.js. uncurated rows are census-only.',
  nameCount: rows.length,
  curated: rows.filter((r) => r.curated).length,
  uncurated: rows.filter((r) => !r.curated).length,
  rows,
};
writeFileSync(join(OUT, 'draft.json'), JSON.stringify(draft, null, 2) + '\n');

console.log(
  `fields-census · ${rows.length} names · ${draft.curated} curated guess · ${draft.uncurated} uncurated`,
);
console.log(`wrote ${relative(ROOT, join(OUT, 'census.json'))}`);
console.log(`wrote ${relative(ROOT, join(OUT, 'draft.json'))}`);
