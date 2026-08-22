#!/usr/bin/env node
/** Golden corpus check / update — earth-fidelity D76.
 *
 *   node scripts/golden-corpus.mjs
 *   node scripts/golden-corpus.mjs --update
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHeadless } from '../vr/sim/headless.mjs';
import { changeResolution } from '../vr/world.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATH = join(ROOT, 'vr', 'data', 'golden.json');

try {
  changeResolution(32);
} catch {
  /* */
}

const corpus = JSON.parse(readFileSync(PATH, 'utf8'));
const update = process.argv.includes('--update');
let fail = 0;

console.log(`golden corpus · ${corpus.entries.length} entries`);
for (const e of corpus.entries) {
  const out = runHeadless({
    seed: e.seed,
    ruleId: e.ruleId,
    ticks: e.ticks,
    deepTime: !!e.deepTime,
  });
  if (update || !e.hash) {
    e.hash = out.hash;
    console.log(`  SET   ${e.id} → ${e.hash}`);
  } else if (e.hash !== out.hash) {
    fail++;
    console.log(`  FAIL  ${e.id} expected ${e.hash} got ${out.hash}`);
  } else {
    console.log(`  PASS  ${e.id} ${e.hash}`);
  }
}

if (update || corpus.entries.some((e) => !e.hash)) {
  corpus.generated = new Date().toISOString();
  writeFileSync(PATH, JSON.stringify(corpus, null, 2) + '\n');
  console.log('wrote vr/data/golden.json');
}

if (fail) process.exitCode = 1;
