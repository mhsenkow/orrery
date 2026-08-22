#!/usr/bin/env node
/** Sweep tier — quality-400 F13.
 *  Long holds that must not sit in the edit loop. */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VR = join(dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;

function run(label, args) {
  console.log(`\n—— sweep · ${label} ——`);
  const r = spawnSync(node, args, { cwd: VR, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

// Biosphere hold (the classic 750-tick cost in full suite).
run('biosphereHolds 750', [
  '--input-type=module',
  '-e',
  `
  import { biosphereHolds } from './sim/calibrate.mjs';
  const b = biosphereHolds(20260808, 750, 'terra');
  if (!b.pass) { console.error(b); process.exit(1); }
  console.log('biosphereHolds ok', b);
  `,
]);

// Thrive probe if present.
run('thrive probe 200', [
  join(VR, '../scripts/thrive-probe.mjs'),
  '--ticks=200',
]);

console.log('\nsweep · ok');
