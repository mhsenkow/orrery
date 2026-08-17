#!/usr/bin/env node
/**
 * Fetch NASA Exoplanet Archive pscomppars for catalogue body names,
 * commit a reproducible snapshot, print a diff against the previous file,
 * and write a coverage report.
 *
 *   node scripts/fetch-exoarchive.mjs
 *   node scripts/fetch-exoarchive.mjs --dry   # query but do not write
 *
 * Offline builds use the committed snapshot only — never a live fetch at runtime.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_WORLDS } from '../vr/worldParams.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'vr', 'data');
const SNAPSHOT = join(OUT_DIR, 'exoarchive-snapshot.json');
const COVERAGE = join(OUT_DIR, 'param-coverage.json');
const OVERRIDES = join(OUT_DIR, 'param-overrides.json');

const ARCHIVE_CITATION =
  'This research has made use of the NASA Exoplanet Archive, which is operated by the ' +
  'California Institute of Technology, under contract with the National Aeronautics and ' +
  'Space Administration under the Exoplanet Exploration Program.';

const COLUMNS = [
  'pl_name', 'pl_rade', 'pl_radeerr1', 'pl_radeerr2',
  'pl_bmasse', 'pl_bmasseerr1', 'pl_bmasseerr2', 'pl_bmassprov',
  'pl_orbsmax', 'pl_orbsmaxerr1', 'pl_orbsmaxerr2',
  'pl_orbper', 'pl_orbpererr1', 'pl_orbpererr2',
  'pl_orbeccen', 'pl_orbeccenerr1', 'pl_orbeccenerr2',
  'pl_insol', 'pl_eqt',
  'st_teff', 'st_tefferr1', 'st_tefferr2',
  'st_rad', 'st_raderr1', 'st_raderr2',
  'st_mass', 'st_masserr1', 'st_masserr2',
  'st_age', 'st_met', 'sy_dist', 'disc_year', 'discoverymethod',
];

/** Extract queryable planet names from the seed (skip pure Solar System / multi-packs). */
function queryNames() {
  const skip = new Set(['sol', 'moons']);
  const names = [];
  for (const w of SEED_WORLDS) {
    if (skip.has(w.c)) continue;
    // Split multi-body rows into primary names where possible
    const parts = w.b.split(/\s*\/\s*/);
    for (const part of parts) {
      const n = part.replace(/,.*/, '').trim();
      // Skip system-level rows
      if (/system$/i.test(n)) continue;
      // Keep first lettered planet if "TRAPPIST-1 g, h"
      const single = n.replace(/\s+[a-z](,\s*[a-z])+$/i, (m) => {
        const letters = m.match(/[a-z]/gi);
        return letters ? ` ${letters[0]}` : m;
      }).trim();
      if (single && !names.includes(single)) names.push(single);
    }
  }
  return names;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const raw = cols[j];
      const num = raw === '' || raw == null ? null : Number(raw);
      obj[headers[j]] = raw === '' || raw == null ? null
        : Number.isFinite(num) && /^-?\d/.test(raw) ? num : raw;
    }
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

async function fetchNames(names) {
  // Batch OR queries — archive TAP limits URL length; chunk ~25 names
  const chunks = [];
  for (let i = 0; i < names.length; i += 25) chunks.push(names.slice(i, i + 25));
  const all = [];
  for (const chunk of chunks) {
    const where = chunk.map((n) => `pl_name='${n.replace(/'/g, "''")}'`).join(' OR ');
    const query = `select ${COLUMNS.join(',')} from pscomppars where ${where}`;
    const url = new URL('https://exoplanetarchive.ipac.caltech.edu/TAP/sync');
    url.searchParams.set('format', 'csv');
    url.searchParams.set('query', query);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TAP ${res.status}: ${await res.text()}`);
    const text = await res.text();
    all.push(...parseCsv(text));
  }
  return all;
}

function diffSnapshots(prev, next) {
  const changes = [];
  const prevMap = new Map((prev?.rows || []).map((r) => [r.pl_name, r]));
  const nextMap = new Map((next.rows || []).map((r) => [r.pl_name, r]));
  for (const [name, row] of nextMap) {
    const old = prevMap.get(name);
    if (!old) { changes.push({ name, type: 'added' }); continue; }
    for (const k of ['pl_rade', 'pl_bmasse', 'pl_orbsmax', 'pl_orbper', 'pl_insol', 'pl_eqt', 'st_teff']) {
      if (old[k] !== row[k] && (old[k] != null || row[k] != null)) {
        changes.push({ name, field: k, from: old[k], to: row[k] });
      }
    }
  }
  for (const name of prevMap.keys()) {
    if (!nextMap.has(name)) changes.push({ name, type: 'removed' });
  }
  return changes;
}

function coverageFromSeedAndArchive(archiveRows) {
  const byName = new Map(archiveRows.map((r) => [r.pl_name, r]));
  return SEED_WORLDS.map((w) => {
    const hit = byName.get(w.b) || byName.get(w.b.split(/[/,]/)[0].trim());
    const fields = {
      radius: w.r != null ? 'seed' : 'missing',
      mass: w.m != null ? 'seed' : 'missing',
      a: w.a != null ? 'seed' : 'missing',
      P: w.P != null ? 'seed' : 'missing',
      S: w.S != null ? 'seed' : 'missing',
      teq: w.teq != null ? 'seed' : 'missing',
      teff: w.teff != null ? 'seed' : 'missing',
    };
    if (hit) {
      if (hit.pl_rade != null) fields.radius = 'archive';
      if (hit.pl_bmasse != null) fields.mass = 'archive';
      if (hit.pl_bmassprov) fields.massProv = hit.pl_bmassprov;
      if (hit.pl_orbsmax != null) fields.a = 'archive';
      if (hit.pl_orbper != null) fields.P = 'archive';
      if (hit.pl_insol != null) fields.S = 'archive';
      if (hit.pl_eqt != null) fields.teq = 'archive';
      if (hit.st_teff != null) fields.teff = 'archive';
    }
    return { name: w.b, category: w.c, archiveHit: !!hit, fields };
  });
}

const dry = process.argv.includes('--dry');

await mkdir(OUT_DIR, { recursive: true });

// Ensure overrides file exists (per-field citations)
try {
  await readFile(OVERRIDES, 'utf8');
} catch {
  await writeFile(OVERRIDES, JSON.stringify({
    _comment: 'Per-field overrides with citations. Applied after archive fetch.',
    _cadence: 'on-demand — re-run scripts/fetch-exoarchive.mjs; commit the snapshot.',
    overrides: {},
  }, null, 2) + '\n');
}

let prev = null;
try {
  prev = JSON.parse(await readFile(SNAPSHOT, 'utf8'));
} catch { /* first run */ }

const names = queryNames();
console.log(`fetch-exoarchive: querying ${names.length} names in pscomppars…`);

let rows = [];
try {
  rows = await fetchNames(names);
  console.log(`  got ${rows.length} archive rows`);
} catch (err) {
  console.error('  network fetch failed:', err.message);
  if (prev) {
    console.log('  falling back to committed snapshot (offline-safe)');
    rows = prev.rows || [];
  } else {
    console.log('  no snapshot yet — writing seed-only coverage');
  }
}

const snapshot = {
  queryDate: new Date().toISOString(),
  source: 'NASA Exoplanet Archive TAP pscomppars',
  citation: ARCHIVE_CITATION,
  cadence: 'on-demand',
  columns: COLUMNS,
  namesQueried: names,
  rows,
};

const changes = diffSnapshots(prev, snapshot);
if (changes.length) {
  console.log(`\ndiff (${changes.length} changes):`);
  for (const c of changes.slice(0, 40)) {
    if (c.type) console.log(`  ${c.type}  ${c.name}`);
    else console.log(`  ${c.name}: ${c.field}  ${c.from} → ${c.to}`);
  }
  if (changes.length > 40) console.log(`  … ${changes.length - 40} more`);
} else {
  console.log('\ndiff: no numeric changes vs previous snapshot');
}

const coverage = {
  generated: snapshot.queryDate,
  citation: ARCHIVE_CITATION,
  bodies: coverageFromSeedAndArchive(rows),
};

if (!dry) {
  await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n');
  await writeFile(COVERAGE, JSON.stringify(coverage, null, 2) + '\n');
  console.log(`\nwrote ${SNAPSHOT}`);
  console.log(`wrote ${COVERAGE}`);
} else {
  console.log('\n--dry: no files written');
}

console.log(`\n${ARCHIVE_CITATION}`);
