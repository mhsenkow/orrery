#!/usr/bin/env node
/** Contrast audit — architecture-400 T41.
 *  Measures solid token pairs (WCAG relative luminance). Translucent panel
 *  over a bright globe is called out as a risk without pixel sampling.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function lin(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function lum([r, g, b]) {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg, bg) {
  const L1 = lum(fg);
  const L2 = lum(bg);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

const tokens = {
  ink: '#e6eef8',
  mute: '#a8b6cc',
  faint: '#8a96aa',
  bg: '#03050a',
  panelSolid: '#080c14', // opaque approximation of --orr-panel
  accent: '#6ea0ff',
  ok: '#6fd6a4',
  amber: '#e4b86a',
  gold: '#c4a35a',
  // prefers-contrast: more
  inkHi: '#f4f7fc',
  muteHi: '#c5d0e0',
  faintHi: '#aeb8c8',
};

const pairs = [
  ['ink', 'bg', 'AA body'],
  ['mute', 'bg', 'AA secondary'],
  ['faint', 'bg', 'AA tertiary'],
  ['ink', 'panelSolid', 'AA on panel'],
  ['mute', 'panelSolid', 'AA dim on panel'],
  ['faint', 'panelSolid', 'AA faint on panel'],
  ['accent', 'bg', 'non-text 3:1'],
  ['ok', 'bg', 'non-text 3:1'],
  ['amber', 'bg', 'non-text 3:1'],
  ['gold', 'bg', 'focus ring'],
  ['inkHi', 'bg', 'hi-contrast ink'],
  ['muteHi', 'bg', 'hi-contrast mute'],
  ['faintHi', 'bg', 'hi-contrast faint'],
];

const rows = pairs.map(([fg, bg, role]) => {
  const ratio = contrast(hexToRgb(tokens[fg]), hexToRgb(tokens[bg]));
  const aa = ratio >= 4.5;
  const aaLarge = ratio >= 3;
  const nonText = ratio >= 3;
  return {
    fg: `--orr-${fg.replace(/Hi$/, '')}${/Hi$/.test(fg) ? ' (prefers-contrast)' : ''}`,
    bg: bg === 'panelSolid' ? '--orr-panel (opaque approx #080c14)' : `--orr-${bg}`,
    role,
    ratio: +ratio.toFixed(2),
    aa,
    aaLarge,
    nonText,
    pass: role.includes('non-text') || role.includes('focus') ? nonText : aa,
  };
});

const failures = rows.filter((r) => !r.pass);
const report = {
  updated: new Date().toISOString().slice(0, 10),
  note: 'T41 — solid pairs only. Translucent --orr-panel (0.78) over bright globe/ocean can drop effective contrast; prefer prefers-contrast denser panel or higher --orr-faint on those surfaces (T42).',
  failures: failures.length,
  rows,
};

writeFileSync(join(ROOT, 'vr/data/contrast-audit.json'), JSON.stringify(report, null, 2) + '\n');

let md = `# Contrast audit — architecture-400 T41\n\nGenerated ${report.updated}. Solid-token WCAG ratios.\n\n`;
md += `| FG | BG | Role | Ratio | Pass |\n|---|---|---|---:|:---:|\n`;
for (const r of rows) {
  md += `| \`${r.fg}\` | \`${r.bg}\` | ${r.role} | ${r.ratio}:1 | ${r.pass ? '✓' : '✗'} |\n`;
}
md += `\n**Failures:** ${failures.length}\n\n`;
md += `${report.note}\n`;
writeFileSync(join(ROOT, 'briefs/contrast-audit.md'), md);

console.log(`contrast-audit · ${rows.length} pairs · failures=${failures.length}`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f.fg} on ${f.bg} = ${f.ratio}`);
  process.exitCode = 1;
}
