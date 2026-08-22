#!/usr/bin/env node
/** Architecture ratchets — architecture-400 R61 / R22 / R12 / P14 / S17.
 *  Fail when the measured numbers grow. Lower baselines with --write after intentional shrinks.
 *
 *  Usage:
 *    node scripts/architecture-ratchet.mjs
 *    node scripts/architecture-ratchet.mjs --write
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(ROOT, 'vr/data/architecture-baseline.json');
const WRITE = process.argv.includes('--write');

function lineCount(path) {
  return readFileSync(path, 'utf8').split(/\r?\n/).length;
}

function countIds(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  return (html.match(/\bid="/g) || []).length;
}

function cssBytesUnder(dir) {
  let n = 0;
  let bytes = 0;
  function walk(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.css')) {
        n++;
        bytes += st.size;
      }
    }
  }
  if (existsSync(dir)) walk(dir);
  return { files: n, bytes };
}

/** Bare catch: empty body or comment-only; also `.catch(() => {})`. */
function countBareCatches() {
  const root = join(ROOT, 'vr');
  let count = 0;
  const sites = [];

  function walk(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'vendor' || name === 'models') continue;
        walk(p);
        continue;
      }
      if (!/\.(js|mjs)$/.test(name)) continue;
      const text = readFileSync(p, 'utf8');
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\.catch\(\s*\(?[^)]*\)?\s*=>\s*\{\s*\}/.test(line)) {
          count++;
          sites.push(`${relative(ROOT, p)}:${i + 1}`);
          continue;
        }
        if (!/\bcatch\b/.test(line)) continue;
        // Gather a short window and see if the catch body is comment-only.
        const window = lines.slice(i, i + 10).join('\n');
        const m = window.match(/catch\s*(?:\([^)]*\))?\s*\{/);
        if (!m) continue;
        const start = window.indexOf(m[0]) + m[0].length;
        let depth = 1;
        let body = '';
        for (let k = start; k < window.length; k++) {
          const ch = window[k];
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) break;
          }
          if (depth >= 1) body += ch;
        }
        const stripped = body
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/[^\n]*/g, '')
          .trim();
        if (stripped === '') {
          count++;
          sites.push(`${relative(ROOT, p)}:${i + 1}`);
        }
      }
    }
  }
  walk(root);
  return { count, sites };
}

function inlineStyleLines(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!m) return 0;
  return m[1].split(/\r?\n/).length;
}

const htmlPath = join(ROOT, 'vr/index.html');
const census = JSON.parse(readFileSync(join(ROOT, 'vr/data/fields/census.json'), 'utf8'));
const css = cssBytesUnder(join(ROOT, 'vr/styles'));
const tokensBytes = existsSync(join(ROOT, 'shared/tokens.css'))
  ? statSync(join(ROOT, 'shared/tokens.css')).size
  : 0;
const bare = countBareCatches();

const measured = {
  updated: new Date().toISOString().slice(0, 10),
  mainJsLines: lineCount(join(ROOT, 'vr/main.js')),
  renderJsLines: lineCount(join(ROOT, 'vr/render.js')),
  indexHtmlLines: lineCount(htmlPath),
  indexHtmlIds: countIds(htmlPath),
  inlineCssLines: inlineStyleLines(htmlPath),
  stylesCssFiles: css.files,
  stylesCssBytes: css.bytes + tokensBytes,
  censusNames: census.nameCount,
  bareCatches: bare.count,
};

if (WRITE || !existsSync(BASE)) {
  writeFileSync(
    BASE,
    JSON.stringify({ ...measured, note: 'architecture-400 ratchets — growth fails CI' }, null, 2) +
      '\n',
  );
  writeFileSync(
    join(ROOT, 'vr/data/bare-catches.json'),
    JSON.stringify({ updated: measured.updated, count: bare.count, sites: bare.sites }, null, 2) +
      '\n',
  );
  console.log('architecture-baseline · wrote', measured);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASE, 'utf8'));
const checks = [
  ['mainJsLines', 'R61 main.js'],
  ['renderJsLines', 'R61 render.js'],
  ['indexHtmlLines', 'R61 index.html'],
  ['indexHtmlIds', 'R22 ids'],
  ['inlineCssLines', 'R12 inline CSS'],
  ['stylesCssBytes', 'R12 total CSS bytes'],
  ['censusNames', 'P14 census names'],
  ['bareCatches', 'S17 bare catches'],
];

let failed = 0;
for (const [key, label] of checks) {
  const now = measured[key];
  const lim = base[key];
  const ok = now <= lim;
  console.log(`${ok ? 'ok' : 'FAIL'} ${label}: ${now} ≤ ${lim}`);
  if (!ok) failed++;
}

// Always refresh the published bare-catch list (S1) so the number stays honest.
writeFileSync(
  join(ROOT, 'vr/data/bare-catches.json'),
  JSON.stringify({ updated: measured.updated, count: bare.count, sites: bare.sites }, null, 2) +
    '\n',
);

// S21 — every report()/expected() code must be in ERROR_CODES
{
  const reportSrc = readFileSync(join(ROOT, 'vr/sim/report.js'), 'utf8');
  const codeTable = new Set([...reportSrc.matchAll(/'(ORR-[A-Z0-9-]+)'\s*:/g)].map((m) => m[1]));
  const used = new Set();
  function scanCodes(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (name === 'node_modules') continue;
        scanCodes(p);
        continue;
      }
      if (!/\.(js|mjs)$/.test(name)) continue;
      const text = readFileSync(p, 'utf8');
      for (const m of text.matchAll(
        /\b(?:report\s*\(\s*['"][^'"]+['"]\s*,\s*|expected\s*\(\s*)['"](ORR-[A-Z0-9-]+)['"]/g,
      )) {
        used.add(m[1]);
      }
      for (const m of text.matchAll(
        /\breport\s*\(\s*['"][^'"]+['"]\s*,\s*['"](ORR-[A-Z0-9-]+)['"]/g,
      )) {
        used.add(m[1]);
      }
    }
  }
  scanCodes(join(ROOT, 'vr'));
  let missing = 0;
  for (const c of used) {
    if (!codeTable.has(c)) {
      console.error(`S21 missing ERROR_CODES entry: ${c}`);
      missing++;
    }
  }
  console.log(`S21 codes · used=${used.size} · table=${codeTable.size} · missing=${missing}`);
  if (missing) failed++;
}

if (failed) {
  console.error(`architecture ratchet failed (${failed} growth(s))`);
  process.exit(1);
}

// Soft: suggest lowering if improved.
for (const [key, label] of checks) {
  if (measured[key] < base[key]) {
    console.warn(`improved ${label}: ${measured[key]} < ${base[key]} — re-run with --write`);
  }
}
console.log('architecture ratchet ok');
