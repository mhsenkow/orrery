#!/usr/bin/env node
/** Calibration ladder — earth-fidelity B6, B86.
 *
 *   node scripts/calibrate-all.mjs
 *   npm run calibrate:all --prefix vr
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listBaselines, calibrateBaseline } from '../vr/sim/calibrate.mjs';
import { changeResolution } from '../vr/world.js';
import { N } from '../vr/sphere.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Prefer N=32 for speed (B7).
try {
  if (N !== 32) changeResolution(32);
} catch (e) {
  console.warn('resolution pin:', e.message || e);
}

const ids = listBaselines();
const rows = [];
let fail = 0;
let skip = 0;

console.log(`calibrate-all · ${ids.length} baselines · N=${N}`);
for (const id of ids) {
  const r = calibrateBaseline(id);
  if (r.skipped) {
    skip++;
    console.log(`  SKIP  ${id} — ${r.reason}`);
    rows.push({ id, pass: null, skipped: true, reason: r.reason });
    continue;
  }
  const mark = r.pass ? 'PASS' : 'FAIL';
  if (!r.pass) fail++;
  console.log(`  ${mark}  ${r.world || id} (${r.ruleId}) seed=${r.seed}`);
  for (const m of r.messages || []) console.log(`         ${m}`);
  rows.push({
    id,
    world: r.world,
    ruleId: r.ruleId,
    pass: r.pass,
    failures: (r.failures || []).map((f) => f.message),
  });
}

const md = `# Calibration report

Generated ${new Date().toISOString()}

| World | Rule | Result |
|---|---|---|
${rows.map((r) => `| ${r.world || r.id} | ${r.ruleId || '—'} | ${r.skipped ? 'skip' : r.pass ? 'pass' : '**fail**'} |`).join('\n')}

${
  fail
    ? `\n## Failures\n\n${rows
        .filter((r) => r.pass === false)
        .flatMap((r) => r.failures || [])
        .map((m) => `- ${m}`)
        .join('\n')}\n`
    : ''
}
`;
writeFileSync(join(ROOT, 'briefs', 'calibration.md'), md);
console.log(
  `\nwrote briefs/calibration.md · ${fail} fail · ${skip} skip · ${ids.length - fail - skip} pass`,
);
if (fail) process.exitCode = 1;
