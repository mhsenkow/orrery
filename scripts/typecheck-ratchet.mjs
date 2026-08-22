#!/usr/bin/env node
/** Typecheck error-count ratchet — quality-400 G22/G23. */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(ROOT, 'vr/data/typecheck-baseline.json');
const WRITE = process.argv.includes('--write');
const tscJs = join(ROOT, 'node_modules/typescript/bin/tsc');

const r = spawnSync(
  process.execPath,
  [tscJs, '-p', 'jsconfig.json', '--noEmit', '--pretty', 'false'],
  {
    cwd: ROOT,
    encoding: 'utf8',
  },
);
const out = `${r.stdout || ''}${r.stderr || ''}`;
const errors = out.split('\n').filter((l) => /error TS\d+/.test(l)).length;

if (WRITE || !existsSync(BASE)) {
  writeFileSync(
    BASE,
    JSON.stringify(
      {
        errors,
        updated: new Date().toISOString().slice(0, 10),
        note: 'G22/G23 — new errors fail CI; use --write only when lowering',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`typecheck-baseline · wrote errors=${errors}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASE, 'utf8'));
console.log(`typecheck · errors=${errors} · baseline=${baseline.errors}`);
if (errors > baseline.errors) {
  console.error(`typecheck ratchet failed: ${errors} > ${baseline.errors}`);
  process.exit(1);
}
if (errors < baseline.errors) {
  console.warn(
    `typecheck improved (${errors} < ${baseline.errors}) — re-run with --write to lower baseline`,
  );
}
process.exit(0);
