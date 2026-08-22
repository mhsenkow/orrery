#!/usr/bin/env node
/** Hot-loop alloc lint — earth-fidelity E9/E46 guardrail.
 *
 *  Static: fail if known tick bodies allocate fresh NC-sized buffers each call
 *  without the reuse/`W._` pattern. Not a runtime count — that needs a browser
 *  profiler — but it catches the regressions that moved golden hashes before.
 *
 *   node scripts/alloc-lint.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Patterns that usually mean per-tick garbage on the hot path. */
const BAD = [
  {
    file: 'vr/sim/meta.js',
    re: /Array\.from\(\s*\{\s*length:\s*NC\s*\}/,
    why: 'E49 — preallocate NC fossil slots',
  },
  {
    file: 'vr/sim/redox.js',
    re: /const plan = \[\];/,
    why: 'E46 — reuse W._relaxPlan instead of new [] each relax',
  },
];

let fail = 0;
console.log('alloc-lint');
for (const row of BAD) {
  const src = readFileSync(join(ROOT, row.file), 'utf8');
  if (row.re.test(src)) {
    console.error(`  FAIL  ${row.file} — ${row.why}`);
    fail++;
  } else {
    console.log(`  PASS  ${row.file}`);
  }
}
if (!fail) console.log('  ok — known hot-path alloc regressions absent');
process.exitCode = fail ? 1 : 0;
