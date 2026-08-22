#!/usr/bin/env node
/** Determinism guard — quality-400 G14/G15.
 *  Fail if Math.random / Date.now appear in sim tick owners outside an allowlist.
 *
 *   node scripts/determinism-lint.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIM = join(ROOT, 'vr/sim');

/** Files that may use wall-clock / Math.random (UI, Dark pause, seeds, reports). */
const ALLOW = new Set([
  'rng.js', // freshSeed only
  'report.js',
  'run.js',
  'hooks.js',
  'finale.js',
  'darkOrbit.js',
  'darkIndustry.js',
  'darkWar.js',
  'darkHud.js',
  'darkGate.js',
  'darkSpectacle.js',
  'god/observe.js',
  'god/shelf.js',
  'god/tips.js',
  'playtest.js',
  'teach.js',
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'gpgpu' || name === 'node_modules') continue;
      walk(p, out);
    } else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

const files = walk(SIM);
let fail = 0;
console.log('determinism-lint (G14/G15)');
for (const file of files) {
  const rel = relative(SIM, file).replace(/\\/g, '/');
  if (ALLOW.has(rel) || ALLOW.has(rel.split('/').pop())) continue;
  if (/^test/.test(rel.split('/').pop()) || /probe|calibrate|headless|smoke|deeptime|sweep/.test(rel)) continue;
  const src = readFileSync(file, 'utf8');
  const hits = [];
  if (/Math\.random\s*\(/.test(src)) hits.push('Math.random');
  // Date.now in tick owners is the D3 class; allow comments.
  const dateHits = [...src.matchAll(/Date\.now\s*\(/g)];
  if (dateHits.length) hits.push('Date.now');
  if (!hits.length) continue;
  console.error(`  FAIL  vr/sim/${rel} — ${hits.join(', ')}`);
  fail++;
}
if (!fail) console.log('  PASS  no unexpected Math.random / Date.now in sim/');
process.exit(fail ? 1 : 0);
