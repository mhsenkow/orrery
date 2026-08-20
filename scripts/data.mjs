#!/usr/bin/env node
// One build for the world data layer.
//
//   node scripts/data.mjs
//   node scripts/data.mjs --dry-run   # validate + scoreboard, skip HTML
//
// Runs every compiler, prints the data-to-code ratio and the sites a new
// world still needs, and writes site/world-data.html (palette + schema).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');

const COMPILERS = [
  ['lifegrammar.mjs', 'life grammar'],
  ['substrates.mjs', 'substrates'],
  ['cover.mjs', 'cover'],
  ['landgram.mjs', 'landforms'],
  ['columns.mjs', 'columns'],
  ['epochs.mjs', 'epochs'],
  ['techno.mjs', 'technosphere'],
  ['worlddef.mjs', 'world definitions'],
  ['kindrules.mjs', 'named kinds'],
  ['paint.mjs', 'surface paint'],
  ['stamps.mjs', 'hypsometry stamps'],
  ['iceshell-data.mjs', 'ice shell params'],
];

function run(name) {
  const t0 = Date.now();
  execFileSync(process.execPath, [join(ROOT, 'scripts', name)], {
    stdio: 'inherit', cwd: ROOT,
  });
  return Date.now() - t0;
}

const times = [];
let failed = 0;
for (const [file, label] of COMPILERS) {
  try {
    const ms = run(file);
    times.push({ file, label, ms, ok: true });
  } catch (err) {
    failed++;
    times.push({ file, label, ms: 0, ok: false });
    console.error(`data: ${file} failed`);
    if (err.status) process.exitCode = err.status;
  }
}
if (failed) {
  console.error(`data: ${failed} compiler(s) failed`);
  process.exit(process.exitCode || 1);
}

const read = async (p) => readFile(join(ROOT, p), 'utf8');
const readJSON = async (p) => JSON.parse(await read(p));

const [lookSrc, terrainSrc, iceSrc, kindSrc, applySrc, shellApplySrc] = await Promise.all([
  read('vr/sim/planetLook.js'),
  read('vr/sim/planetTerrain.js'),
  read('vr/sim/iceshell.js'),
  read('vr/sim/planetKind.js'),
  read('vr/sim/stampApply.js'),
  read('vr/sim/shellApply.js'),
]);

const countRe = (src, re) => (src.match(re) || []).length;
const paintFns = countRe(lookSrc, /^function land[A-Z]\w*/gm);
const paintOcean = countRe(lookSrc, /^function ocean[A-Z]\w*/gm);
const lerpCalls = countRe(lookSrc, /\blerp\(/g);
const stampFns = countRe(terrainSrc, /^function stamp[A-Z]\w*/gm);
const stampApplyOps = countRe(applySrc, /if \(type === '/g);
const paintIce = countRe(iceSrc, /^function paint[A-Z]\w*/gm);
const shellApplyOps = countRe(shellApplySrc, /if \(type === '/g);
const codeFns = paintFns + stampFns + paintIce;
const namedRegex = countRe(kindSrc, /if\s*\(\s*\//g);

const sub = await readJSON('vr/data/worlds/substrates.json');
const cover = await readJSON('vr/data/worlds/cover.json');
const procs = await readJSON('vr/data/worlds/processes.json');
const forms = await readJSON('vr/data/worlds/landforms.json');
const cols = await readJSON('vr/data/worlds/columns.json');
const defs = await readJSON('vr/data/worlds/definitions.json');
const feats = await readJSON('vr/data/worlds/features.json');
const epochs = await readJSON('vr/data/worlds/epochs.json');
const paint = await readJSON('vr/data/worlds/paint.json');
const stamps = await readJSON('vr/data/worlds/stamps.json');
const shells = await readJSON('vr/data/worlds/iceshell.json');
const kindRules = await readJSON('vr/data/worlds/kindRules.json');

const nPaint = (paint.kinds || []).filter((k) => !k.alias).length;
const nStamp = (stamps.kinds || []).length;
const nShell = (shells.kinds || []).length;
const nNamed = (kindRules.named || []).length;
const authored = (sub.materials?.length || 0)
  + (cover.kinds?.length || 0)
  + (procs.processes?.length || 0)
  + (forms.forms?.length || 0)
  + (cols.layers?.length || 0)
  + (cols.recipes?.length || 0)
  + (defs.definitions?.length || 0)
  + nPaint + nStamp + nShell + nNamed;
const nFeat = Object.values(feats.bodies || {}).reduce((n, a) => n + a.length, 0);
const nRamp = (sub.materials || []).filter((m) => m.ramp).length;
const nSpec = (sub.materials || []).filter((m) => m.spectrum).length;
const nOvr = (defs.overrides || []).length;
const ratio = authored / Math.max(1, codeFns);

// Named kinds, paint, stamps and ice maps are data. Axis fallbacks stay in planetKind.
const newWorldCost = namedRegex > 0 ? 1 : 0;

const n96 = 96 * 96 * 6;
const stackBytes = n96 * (8 * 6 + 1);
const stackMB = stackBytes / (1024 * 1024);

console.log('');
console.log(`dataratio  ${authored} authored rows / ${codeFns} per-body functions = ${ratio.toFixed(2)}`);
console.log(`            ${paintFns} land* + ${paintOcean} ocean* in planetLook (${lerpCalls} lerp), ${stampFns} stamp* in planetTerrain, ${paintIce} paint*, ${stampApplyOps} stamp ops, ${shellApplyOps} shell ops`);
console.log(`newworldcost ${newWorldCost} code sites (named-kind regexes in planetKind) — drive this to 0`);
console.log(`overrides  ${nOvr}  features ${nFeat}  ramps ${nRamp}  spectra ${nSpec}  paint ${nPaint}  stamps ${nStamp}  shell ${nShell}  named ${nNamed}  defs ${defs.definitions.length}`);
console.log(`stackbudget ${stackMB.toFixed(2)} MB at N=96 (${n96} cells × 49 bytes)`);
console.log(`compile    ${times.reduce((s, t) => s + t.ms, 0)} ms`);

if (DRY) {
  console.log('dry-run: skipped site/world-data.html');
  process.exit(0);
}

const swatches = (sub.materials || []).map((m) => {
  const rgb = m.rgb.join(',');
  const ramp = m.ramp
    ? Object.entries(m.ramp).map(([k, v]) =>
      `<span class="chip" style="background:rgb(${v.join(',')})" title="${k}"></span>`).join('')
    : '';
  return `<div class="sw"><i style="background:rgb(${rgb})"></i><b>${m.name}</b><small>${m.tag} · ${m.class}</small>${ramp}</div>`;
}).join('\n');

const defRows = (defs.definitions || []).map((d) =>
  `<tr><td><code>${d.id}</code></td><td>${d.confidence}</td><td>${d.column || '—'}</td><td>${d.bedrock || '—'}</td><td>${d.paint || '—'}</td><td>${d.why}</td></tr>`).join('\n');

const unitRows = Object.entries(defs.units || {}).map(([k, v]) =>
  `<tr><td><code>${k}</code></td><td>${v}</td></tr>`).join('\n');

let paintChips = '';
let starChips = '';
try {
  const { sampleLand } = await import('../vr/sim/planetLook.js');
  const { illuminateRgb } = await import('../vr/sim/illum.js');
  const kinds = ['io', 'europa', 'mars', 'venus', 'titan', 'moon', 'jupiter', 'neptune'];
  paintChips = kinds.map((k) => {
    const rgb = sampleLand(k, 0.55, 0) || [80, 80, 80];
    return `<div class="sw"><i style="background:rgb(${rgb.map((n) => n | 0).join(',')})"></i><b>${k}</b><small>PAINT · G2V</small></div>`;
  }).join('\n');
  const basalt = [118, 72, 48];
  starChips = [[5772, 'G2V Sun'], [2560, 'M dwarf'], [10000, 'A0']].map(([T, lab]) => {
    const rgb = illuminateRgb(basalt, T);
    return `<div class="sw"><i style="background:rgb(${rgb.map((n) => n | 0).join(',')})"></i><b>${lab}</b><small>same basalt · ${T} K</small></div>`;
  }).join('\n');
} catch (err) {
  paintChips = `<p>Paint contact skipped (${err.message}).</p>`;
}

let coverageRows = '';
let coverageGaps = 0;
let nBodies = 120;
try {
  const { CATALOGUE_WORLDS, rulesetFromCatalogue } = await import('../vr/catalogue-rules.js');
  const { definitionOf, coverageOfDef } = await import('../vr/sim/definition.js');
  nBodies = CATALOGUE_WORLDS.length;
  coverageRows = CATALOGUE_WORLDS.map((item) => {
    const rule = rulesetFromCatalogue(item);
    const def = definitionOf({ rule });
    const cov = coverageOfDef({ rule });
    const gaps = [];
    if (!cov.column && !rule?.earthLike) gaps.push('column');
    if (!cov.paint && !rule?.earthLike) gaps.push('paint');
    if (!cov.look) gaps.push('look');
    if (gaps.length) coverageGaps++;
    return `<tr><td>${item.b}</td><td><code>${cov.id || '—'}</code></td><td>${cov.paint || '—'}</td><td>${cov.column || '—'}</td><td>${cov.features || 0}</td><td>${gaps.join(', ') || '—'}</td></tr>`;
  }).join('\n');
} catch (err) {
  coverageRows = `<tr><td colspan="6">Coverage skipped (${err.message})</td></tr>`;
}

const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ORRERY — world data</title>
<style>
:root{ --ground:#0c0f16; --panel:#151a24; --rule:#252d3d; --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688; --accent:#c69a4f;
  --sans:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif; --mono:ui-monospace,Menlo,monospace; }
body{margin:0;background:var(--ground);color:var(--text);font:400 16px/1.55 var(--sans);}
.wrap{max-width:1080px;margin:0 auto;padding:40px 26px 90px;}
.eyebrow{font:500 10.5px/1 var(--mono);letter-spacing:.24em;text-transform:uppercase;color:var(--accent);}
h1{font:700 42px/1.05 var(--sans);letter-spacing:-.03em;margin:12px 0 0;}
.sub{color:var(--dim);max-width:56ch;margin-top:14px;}
.nav{margin-top:18px;font:400 12.5px/1.7 var(--mono);color:var(--faint);}
.nav a{color:var(--dim);}
.tally{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1px;background:var(--rule);
  border:1px solid var(--rule);border-radius:8px;margin-top:28px;}
.tally>div{background:var(--panel);padding:14px 16px;}
.tally dt{font:500 9.5px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--faint);}
.tally dd{margin:8px 0 0;font:600 24px/1 var(--sans);}
.tally small{display:block;font:400 11px/1.4 var(--mono);color:var(--faint);margin-top:6px;}
h2{font:650 20px/1.2 var(--sans);border-bottom:1px solid var(--rule);padding-bottom:8px;margin:40px 0 14px;}
p{color:var(--dim);max-width:74ch;font-size:14.5px;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;}
.sw{background:var(--panel);border:1px solid var(--rule);border-radius:8px;padding:10px;}
.sw i{display:block;height:36px;border-radius:5px;margin-bottom:8px;}
.sw b{font-size:13px;}
.sw small{display:block;color:var(--faint);font:400 11px/1.4 var(--mono);margin-top:3px;}
.chip{display:inline-block;width:12px;height:12px;border-radius:3px;margin:6px 3px 0 0;border:1px solid var(--rule);}
table{width:100%;border-collapse:collapse;font-size:13.5px;}
td,th{border-top:1px solid var(--rule);padding:8px 10px;vertical-align:top;color:var(--dim);}
th{color:var(--faint);font:500 11px/1 var(--mono);text-align:left;}
code{font:500 12px var(--mono);color:var(--accent);}
footer{margin-top:48px;color:var(--faint);font:400 12px var(--mono);}
</style>
<div class="wrap">
<p class="eyebrow">ORRERY · world data</p>
<h1>The join</h1>
<p class="sub">Five vocabulary tables, one definition that ties them to a world, a palette with ramps, and the scoreboard for moving appearance out of code.</p>
<p class="nav">
  <a href="fleet.html">Fleet contact</a> ·
  <a href="thrive.html">Thrive</a> ·
  <a href="openworld.html">Open world backlog</a> ·
  <a href="worldspace.html">World space</a> ·
  <a href="../vr/">Prototype</a>
</p>
<div class="tally">
  <div><dt>Authored rows</dt><dd>${authored}<small>materials, cover, processes, forms, layers, recipes, defs</small></dd></div>
  <div><dt>Per-body functions</dt><dd>${codeFns}<small>${paintFns} land* · ${stampFns} stamp* · ${paintIce} paint*</small></dd></div>
  <div><dt>Data / code</dt><dd>${ratio.toFixed(2)}<small>dataratio — the migration scoreboard</small></dd></div>
  <div><dt>New-world cost</dt><dd>${newWorldCost}<small>code sites a Pluto still needs</small></dd></div>
  <div><dt>Stack at N=96</dt><dd>${stackMB.toFixed(2)} MB<small>8 layers × 49 bytes × ${n96.toLocaleString()} cells</small></dd></div>
  <div><dt>Overrides</dt><dd>${nOvr}<small>${nFeat} named features · ${nRamp} ramps</small></dd></div>
</div>

<h2>Palette</h2>
<p>Each material is a triple plus, where authored, a wet/dry/ice ramp and (for a few rocks) band reflectance. The overlay samples the ramp. Surface paint lives in <code>paint.json</code> and is evaluated, not lambdas in <code>planetLook.js</code>. Colour is reflectance × illuminant — the same basalt under three stars is the strip below. White balance is a camera calibrated to the Sun.</p>
<div class="grid">
${swatches}
</div>

<h2>Paint contact</h2>
<p>CPU chips from <code>sampleLand</code>, not a GPU framebuffer. Eight kinds that must not collapse; three illuminants of one rock. The artefact this programme exists to catch is a catalogue that paints as one world.</p>
<div class="grid">
${paintChips}
${starChips}
</div>

<h2>Catalogue coverage</h2>
<p>${nBodies} bodies resolved through the join. ${coverageGaps} with a stated gap (missing column, paint, or look). Named features are optional.</p>
<table>
<thead><tr><th>body</th><th>definition</th><th>paint</th><th>column</th><th>features</th><th>gaps</th></tr></thead>
<tbody>
${coverageRows}
</tbody>
</table>

<h2>Definitions</h2>
<p>First match wins. Gates are axes and flags, not a body name. ${nOvr} override${nOvr === 1 ? '' : 's'} — the count is how well the rules work. Coverage is the join fields that exist: column, bedrock, look, paint.</p>
<table>
<thead><tr><th>id</th><th>confidence</th><th>column</th><th>bedrock</th><th>paint</th><th>why</th></tr></thead>
<tbody>
${defRows}
</tbody>
</table>

<h2>Units</h2>
<table>
<thead><tr><th>field</th><th>unit</th></tr></thead>
<tbody>
${unitRows}
</tbody>
</table>

<h2>Authored vs generated</h2>
<p><code>substrates.json</code>, <code>cover.json</code>, <code>processes.json</code>, <code>landforms.json</code>, <code>columns.json</code>, <code>epochs.json</code>, <code>definitions.json</code>, <code>features.json</code> and <code>paint.json</code> are authored. <code>kinds.json</code> is a generated audit — do not edit it. Compiled modules live in <code>vr/sim/*Table.js</code> and <code>worldDef.js</code>. Nothing in <code>vr/sim/</code> may name a specific body except as a validation case or an override with a <code>why</code>.</p>
<p>Compile: <code>node scripts/data.mjs</code> (${times.reduce((s, t) => s + t.ms, 0)} ms this run). Epochs ${epochs.epochs?.length || 0}. Spectra ${nSpec}. Named kinds ${nNamed}. Named-kind regexes in planetKind: ${namedRegex}.</p>
<footer>Generated from <code>scripts/data.mjs</code> — edit the source, not this file.</footer>
</div>
`;

await mkdir(join(ROOT, 'site'), { recursive: true });
await writeFile(join(ROOT, 'site', 'world-data.html'), html);
console.log('wrote site/world-data.html');

try {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'fleet.mjs')], {
    stdio: 'inherit', cwd: ROOT,
  });
} catch (err) {
  console.error('data: fleet.mjs failed');
  process.exit(process.exitCode || 1);
}
