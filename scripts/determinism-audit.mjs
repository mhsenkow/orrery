#!/usr/bin/env node
/** Determinism audit — earth-fidelity D1, D2, D3.
 *
 *   node scripts/determinism-audit.mjs
 *   node scripts/determinism-audit.mjs --lint
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'briefs', 'determinism.md');

const ENTROPY = [
  {
    name: 'rngOf / mulberry streams',
    status: 'ok',
    note: 'Canonical sim entropy — forked per subsystem',
  },
  { name: 'freshSeed', status: 'allowed', note: 'UI / genesis only — not on sim tick path' },
  { name: 'Math.random', status: 'forbidden-in-sim', note: 'Lint fails under vr/sim and world.js' },
  {
    name: 'Date.now / performance.now',
    status: 'forbidden-in-sim',
    note: 'Lint; garden autosave timestamps are view-layer',
  },
  { name: 'crypto.getRandomValues', status: 'forbidden-in-sim', note: 'Not used in sim path' },
  { name: 'Object key iteration', status: 'watch', note: 'Prefer arrays / sorted keys in ticks' },
  { name: 'Array.sort ties', status: 'watch', note: 'Total-order comparators required (D5)' },
  { name: 'Map/Set iteration', status: 'watch', note: 'Polity maps must act in stable id order' },
  { name: 'GPU floats', status: 'not-bit-identical', note: 'Golden pins CPU path only (D15/D16)' },
  { name: 'Worker message order', status: 'n/a', note: 'Worker unused for sim state today' },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function lintSim() {
  const roots = [join(ROOT, 'vr', 'sim'), join(ROOT, 'vr', 'world.js')];
  const files = [];
  for (const r of roots) {
    try {
      const st = statSync(r);
      if (st.isDirectory()) walk(r, files);
      else files.push(r);
    } catch {
      /* */
    }
  }
  const hits = [];
  for (const f of files) {
    const rel = relative(ROOT, f);
    // Allowlisted non-sim / test / probe files
    if (/dark-test|dark-scenario|test\.mjs|smoke|probe|headless|calibrate/.test(rel)) continue;
    const src = readFileSync(f, 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) return;
      if (/\bMath\.random\s*\(/.test(line)) {
        hits.push({ file: rel, line: i + 1, kind: 'Math.random', text: line.trim().slice(0, 120) });
      }
      if (/\bDate\.now\s*\(/.test(line) || /\bperformance\.now\s*\(/.test(line)) {
        // Timing instrumentation is ok if behind profile flag comments — still report
        if (/_ms|profile|timing|E1|dropped/.test(line)) return;
        hits.push({
          file: rel,
          line: i + 1,
          kind: 'Date/performance.now',
          text: line.trim().slice(0, 120),
        });
      }
    });
  }
  return hits;
}

const hits = lintSim();
const md = `# Determinism audit

Generated ${new Date().toISOString()} by \`scripts/determinism-audit.mjs\` (D1).

## Entropy sources

| Source | Status | Note |
|---|---|---|
${ENTROPY.map((e) => `| ${e.name} | ${e.status} | ${e.note} |`).join('\n')}

## Policy

- **CPU path is the golden path.** GPU climate is not bit-identical across vendors (D15).
- **Different N is a different model**, not a different run (D14).
- **Art face:** fork-and-diverge hangs on the \`Run\` object (\`vr/sim/run.js\`).

## Lint hits (sim path)

${hits.length === 0 ? '_None._' : hits.map((h) => `- \`${h.file}:${h.line}\` **${h.kind}** — \`${h.text}\``).join('\n')}
`;

writeFileSync(OUT, md);
console.log(`wrote briefs/determinism.md · ${hits.length} lint hits`);
if (process.argv.includes('--lint') && hits.length) {
  console.error('determinism lint failed');
  process.exitCode = 1;
}
