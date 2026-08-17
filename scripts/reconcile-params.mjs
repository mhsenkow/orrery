#!/usr/bin/env node
/**
 * Reconcile hand seed (vr/worldParams.js) against the committed archive snapshot.
 * Prints disagreements — does not auto-overwrite (a human chooses which is right).
 *
 *   node scripts/reconcile-params.mjs
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_WORLDS } from '../vr/worldParams.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(ROOT, 'vr', 'data', 'exoarchive-snapshot.json');

function near(a, b, frac = 0.15) {
  if (a == null || b == null) return true;
  if (!(a > 0) && !(b > 0)) return true;
  const mid = (Math.abs(a) + Math.abs(b)) / 2 || 1;
  return Math.abs(a - b) / mid <= frac;
}

let snap;
try {
  snap = JSON.parse(await readFile(SNAPSHOT, 'utf8'));
} catch {
  console.error('No snapshot at', SNAPSHOT, '— run node scripts/fetch-exoarchive.mjs first');
  process.exit(1);
}

const byName = new Map((snap.rows || []).map((r) => [r.pl_name, r]));
const disagreements = [];
let compared = 0;

for (const w of SEED_WORLDS) {
  if (w.c === 'sol' || w.c === 'moons') continue;
  const primary = w.b.split(/\s*\/\s*/)[0].replace(/,.*/, '').trim()
    .replace(/\s+[a-z](,\s*[a-z])+$/i, (m) => ` ${m.match(/[a-z]/i)[0]}`);
  const row = byName.get(w.b) || byName.get(primary);
  if (!row) continue;
  compared++;
  const checks = [
    ['r', 'pl_rade', w.r, row.pl_rade],
    ['m', 'pl_bmasse', w.m, row.pl_bmasse],
    ['a', 'pl_orbsmax', w.a, row.pl_orbsmax],
    ['P', 'pl_orbper', w.P, row.pl_orbper],
    ['S', 'pl_insol', w.S, row.pl_insol],
    ['teq', 'pl_eqt', w.teq, row.pl_eqt],
    ['teff', 'st_teff', w.teff, row.st_teff],
  ];
  for (const [sk, ak, sv, av] of checks) {
    if (av == null || sv == null) continue;
    if (!near(sv, av)) {
      disagreements.push({
        name: w.b,
        field: sk,
        seed: sv,
        archive: av,
        massProv: row.pl_bmassprov || null,
      });
    }
  }
}

console.log(`reconcile: compared ${compared} seeded exoplanets to snapshot ${snap.queryDate}`);
console.log(`disagreements (>15%): ${disagreements.length}`);
for (const d of disagreements.slice(0, 50)) {
  console.log(`  ${d.name}: ${d.field}  seed=${d.seed}  archive=${d.archive}${d.massProv ? `  (${d.massProv})` : ''}`);
}
if (disagreements.length > 50) console.log(`  … ${disagreements.length - 50} more`);
console.log('\nCadence: on-demand. Citation:', snap.citation?.slice(0, 80) + '…');
