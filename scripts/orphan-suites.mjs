#!/usr/bin/env node
/** O11 — no orphan *test*.mjs entry points.
 *  Every vr/sim/*test*.mjs (and named harnesses) must appear in vr/package.json scripts.
 *
 *   node scripts/orphan-suites.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIM = join(ROOT, 'vr/sim');
const pkg = JSON.parse(readFileSync(join(ROOT, 'vr/package.json'), 'utf8'));
const scriptBlob = JSON.stringify(pkg.scripts || {});

const REQUIRED = readdirSync(SIM)
  .filter((f) => /test.*\.mjs$/.test(f) || /^(smoke|deeptime|origin-sketch-test|dark-test|dark-scenario)\.mjs$/.test(f))
  .sort();

/** Dark suites are wired but paused from default CI — still must have a script name. */
const ALLOW_MANUAL = new Set([]);

let fail = 0;
console.log('orphan-suites (O11)');
for (const file of REQUIRED) {
  if (ALLOW_MANUAL.has(file)) {
    console.log(`  SKIP  ${file} (manual)`);
    continue;
  }
  if (!scriptBlob.includes(file)) {
    console.error(`  FAIL  ${file} not referenced in vr/package.json scripts`);
    fail++;
  } else {
    console.log(`  PASS  ${file}`);
  }
}
process.exit(fail ? 1 : 0);
