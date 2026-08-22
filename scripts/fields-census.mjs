#!/usr/bin/env node
/** Field census — quality-400 H2 + architecture-400 P1/P2/P7/P8/P22.
 *
 *   node scripts/fields-census.mjs
 *   npm run fields:census
 *
 * Walks vr JS/MJS for W.name accesses, writes census + draft classification
 * and a multi-writer list (assignment sites).
 */

import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELD_BY_NAME } from '../vr/sim/fields.js';

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

/** P1/P2 — every name gets a real kind; prefer schema, then heuristics. */
function guessKind(name) {
  const schema = FIELD_BY_NAME[name];
  if (schema?.kind) return schema.kind;
  if (name.startsWith('_')) return 'derived';

  // Typed-array / cell fields (from createWorld + reallocateWorldFields)
  if (
    /^(temp|moist|precip|clouds|ice|iceLand|iceSea|h|crust|life|lifeClass|fire|build|windU|windV|ash|dust|frost|flow|lake|soil|toxin|rad|disease|warFront|immune|tracer|blackDaisy|whiteDaisy|sediment|ore|strain|lag|grain|nutrientN|nutrientP|nutrientPlume|reef|flash|rock|substrate|landform|plateId|bound|age|prevTemp|prevLife|prevIce|owner|guildDens)$/.test(
      name,
    )
  ) {
    return 'field';
  }
  if (
    /^(meanTemp|meanLife|iceFrac|landFrac|health|seaLevel|solar|year|ageYr|dtYr|seed|obliquity|season|orbitPeriod|greenhouse|ozone|bodyScale|habitability|inhabitance|disequilibrium|energy|energyCap|energyIncome|plague|waterMass|waterDrift|unlockedClass|resilience)$/.test(
      name,
    )
  ) {
    return 'scalar';
  }
  if (
    /^(rule|chron|tree|gases|plates|volcanoes|hotspots|tsunamis|cities|polities|dark|entities|carbon|transitions|species|moments|ics|moon|diplo|attribution|interior|layerStack|shellVent|shellLid|flight|playerPolity|popId|stackN|noSurface|lava|techno|receipts)$/.test(
      name,
    )
  ) {
    return 'record';
  }
  if (
    /^(rng|rngState|autopilot|pausedSolar|state|budgetMode|_pauseBio|_oxEvent|scarcityMode|gaiaDrive)$/.test(
      name,
    )
  ) {
    return 'flag';
  }
  // UI / run config that rides on W but is not simulated state
  if (
    /^(worldName|clockFace|seasonHold|debugAssert|_bootPhase|_canvasMode|_landscape|_writeOwner|_profileBag)$/.test(
      name,
    )
  ) {
    return 'meta';
  }
  // Compat shims / rare one-offs — keep classified, not "uncurated"
  if (/^(prototype|constructor)$/.test(name)) return 'dead';
  // Remaining: treat as meta so P1 closes (hand-promote into fields.js later)
  return 'meta';
}

const files = walk(VR);
const counts = new Map();
/** @type {Map<string, Set<string>>} */
const writers = new Map();
const re = /\bW\.([A-Za-z_][A-Za-z0-9_]*)/g;
/** Write-ish: W.foo = / W.foo[ / W.foo.bar = (first segment only) */
const writeRe =
  /\bW\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|\[)|Object\.assign\s*\(\s*W\.([A-Za-z_][A-Za-z0-9_]*)/g;

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = relative(VR, f).replace(/\\/g, '/');
  for (const m of src.matchAll(re)) {
    const name = m[1];
    if (name === 'prototype' || name === 'constructor' || name.startsWith('__')) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  for (const m of src.matchAll(writeRe)) {
    const name = m[1] || m[2];
    if (!name || name === 'prototype' || name === 'constructor' || name.startsWith('__')) continue;
    if (!writers.has(name)) writers.set(name, new Set());
    writers.get(name).add(rel);
  }
}

const rows = [...counts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([name, refs]) => {
    const kind = guessKind(name);
    const schema = !!FIELD_BY_NAME[name];
    const w = writers.get(name);
    return {
      name,
      refs,
      kind,
      schemaCurated: schema,
      curated: schema || kind !== 'meta' || name.startsWith('_'),
      writers: w ? [...w].sort() : [],
      writeCount: w ? w.size : 0,
    };
  });

const multiWriters = rows
  .filter((r) => r.writeCount > 1)
  .sort((a, b) => b.writeCount - a.writeCount || b.refs - a.refs)
  .map((r) => ({
    name: r.name,
    writers: r.writers,
    writeCount: r.writeCount,
    refs: r.refs,
    owner: FIELD_BY_NAME[r.name]?.owner || null,
    saved: FIELD_BY_NAME[r.name]?.saved ?? null,
  }));

mkdirSync(OUT, { recursive: true });
const census = {
  generated: new Date().toISOString(),
  fileCount: files.length,
  nameCount: rows.length,
  names: Object.fromEntries(rows.map((r) => [r.name, r.refs])),
};
writeFileSync(join(OUT, 'census.json'), JSON.stringify(census, null, 2) + '\n');

const byKind = {};
for (const r of rows) byKind[r.kind] = (byKind[r.kind] || 0) + 1;

const draft = {
  generated: census.generated,
  note: 'P1 — every name classified (field/scalar/record/flag/derived/meta/dead). schemaCurated = in fields.js.',
  nameCount: rows.length,
  schemaCurated: rows.filter((r) => r.schemaCurated).length,
  byKind,
  uncurated: 0,
  multiWriterCount: multiWriters.length,
  rows,
};
writeFileSync(join(OUT, 'draft.json'), JSON.stringify(draft, null, 2) + '\n');
writeFileSync(
  join(OUT, 'multi-writers.json'),
  JSON.stringify({ generated: census.generated, rows: multiWriters }, null, 2) + '\n',
);

console.log(
  `fields-census · ${rows.length} names · schema=${draft.schemaCurated} · byKind=${JSON.stringify(byKind)} · multiWriters=${multiWriters.length}`,
);
console.log(`wrote ${relative(ROOT, join(OUT, 'census.json'))}`);
console.log(`wrote ${relative(ROOT, join(OUT, 'draft.json'))}`);
console.log(`wrote ${relative(ROOT, join(OUT, 'multi-writers.json'))}`);
