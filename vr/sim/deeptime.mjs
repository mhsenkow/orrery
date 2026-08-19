#!/usr/bin/env node
/** Deep-time probe — headless evolution witness (biosphere plan P0-02…P0-07). */

import { setResolution } from '../sphere.js';

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    out[k] = v === undefined ? true : (/^\d+$/.test(v) ? +v : v === 'true' ? true : v === 'false' ? false : v);
  }
  return out;
}

function lifeClassHist(W, NC) {
  const h = {};
  for (let c = 0; c < NC; c++) {
    const k = W.lifeClass[c] | 0;
    h[k] = (h[k] || 0) + 1;
  }
  return h;
}

function topGuilds(W, n = 3) {
  const rows = Object.entries(W.guilds || {})
    .map(([id, v]) => [id, v])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
  return rows.map(([id, v]) => `${id}:${v.toFixed(3)}`).join(' ');
}

function bodyMassRange(tree, nodeOf) {
  let min = Infinity, max = -Infinity, tropMax = 0;
  for (const id of tree.living) {
    const node = nodeOf(tree, id);
    if (!node) continue;
    const m = node.traits[4];
    const t = node.traits[7];
    if (m < min) min = m;
    if (m > max) max = m;
    if (t > tropMax) tropMax = t;
  }
  return {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
    tropMax,
  };
}

function transitionsList(T) {
  if (!T) return '';
  return Object.entries(T).filter(([, v]) => v).map(([k]) => k).join(',');
}

const { describeGenome } = await import('./genome.js');

function treeStatsMax(tree) {
  if (!tree?.nodes?.length) return 0;
  const byId = tree.byId;
  let max = 0;
  for (const n of tree.nodes) {
    let d = 0, cur = n;
    while (cur?.parentId != null && d < 64) {
      cur = byId?.get(cur.parentId);
      d++;
    }
    if (d > max) max = d;
  }
  return max;
}

function printRow(tick, W, NC, nodeOf, rangeContiguity) {
  const ma = (4.567e9 - W.ageYr) / 1e6;
  const tree = W.tree || { living: [], nodes: [] };
  const bm = bodyMassRange(tree, nodeOf);
  const hist = lifeClassHist(W, NC);
  const histStr = Object.entries(hist).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k}:${v}`).join(' ');
  const contig = rangeContiguity != null ? ` contig=${rangeContiguity.toFixed(3)}` : '';
  console.log([
    `tick=${tick}`,
    `maBP=${ma.toFixed(1)}`,
    `dtYr=${W.dtYr}`,
    `meanLife=${W.meanLife.toFixed(4)}`,
    `O2=${(W.gases?.O2 ?? 0).toFixed(4)}`,
    `CO2=${(W.gases?.CO2 ?? 0).toFixed(5)}`,
    `living=${tree.living?.length ?? 0}`,
    `total=${tree.nodes?.length ?? 0}`,
    `depth=${treeStatsMax(tree)}`,
    `unlockedClass=${W.unlockedClass ?? 0}`,
    `lifeClass={${histStr}}`,
    `bodyMass=${bm.min.toFixed(3)}–${bm.max.toFixed(3)}`,
    `trophicMax=${bm.tropMax.toFixed(3)}`,
    `convergences=${tree.convergences?.length ?? 0}`,
    `transitions=[${transitionsList(W.transitions)}]`,
    `guilds=${topGuilds(W)}`,
    `bodies=${W.morphospaceOccupied ?? 0}`,
    `sense=${W.topSense || '—'}`,
    contig,
  ].join(' '));
  const dom = dominantBody(tree);
  if (dom) console.log(`         body: ${dom}`);
}

function dominantBody(tree) {
  if (!tree.living?.length) return null;
  let best = null;
  for (const id of tree.living) {
    const n = tree.byId?.get(id);
    if (n?.genome && (!best || n.pop > best.pop)) best = n;
  }
  return best ? `${best.name} — ${describeGenome(best.genome)}` : null;
}

const args = parseArgs(process.argv);
const n = args.n || 32;
const ticks = args.ticks || 500;
const every = args.every || 500;
const seed = args.seed ?? 20260808;
const ruleId = args.rule || 'terra';

async function runOneSeed(runSeed, runTicks) {
  setResolution(n);
  const { W, generate, simTick, RULESETS } = await import('../world.js');
  const { nodeOf } = await import('./evolve.js');
  const { rangeContiguity } = await import('./meta.js');
  const { NC } = await import('../sphere.js');

  const base = RULESETS.find((r) => r.id === ruleId) || RULESETS[0];
  generate(runSeed, { ...base, deepTime: true });

  const t0 = performance.now();
  for (let i = 0; i < runTicks; i++) {
    simTick(true);
    if (every && !args.seeds && (i === 0 || (i + 1) % every === 0 || i === runTicks - 1)) {
      printRow(i, W, NC, nodeOf, rangeContiguity(W));
    }
  }
  const elapsed = performance.now() - t0;

  if (args.wall && !args.seeds) {
    console.log(`wall=${elapsed.toFixed(1)}ms msPerTick=${(elapsed / runTicks).toFixed(2)} NC=${NC}`);
  }

  const T = W.transitions || {};
  return {
    seed: runSeed,
    elapsed,
    msPerTick: elapsed / runTicks,
    transitions: T,
    oxy: !!T.oxygenicPhotosynthesis,
    multi: !!T.multicellular,
    living: W.tree?.living?.length ?? 0,
    O2: W.gases?.O2 ?? 0,
    guilds: topGuilds(W),
  };
}

if (args.seeds) {
  const seedList = args.seeds === true
    ? [1, 2, 3, 4, 5]
    : String(args.seeds).split(',').map((s) => +s.trim());
  const runTicks = ticks;
  console.log(`# five-seed gate n=${n} ticks=${runTicks}`);
  console.log('seed\toxy\tmulti\tliving\tO2\tguilds');
  const rows = [];
  for (const s of seedList) {
    const row = await runOneSeed(s, runTicks);
    rows.push(row);
    console.log([row.seed, row.oxy ? 1 : 0, row.multi ? 1 : 0, row.living, row.O2.toFixed(4), row.guilds].join('\t'));
  }
  const oxyCount = rows.filter((r) => r.oxy).length;
  const multiCount = rows.filter((r) => r.multi).length;
  console.log(`\n# summary oxy=${oxyCount}/${rows.length} multi=${multiCount}/${rows.length}`);
  if (args.firsts) {
    for (const row of rows) {
      console.log(`\n# seed=${row.seed} firsts`);
      setResolution(n);
      const { W, generate, simTick, RULESETS } = await import('../world.js');
      const base = RULESETS.find((r) => r.id === ruleId) || RULESETS[0];
      generate(row.seed, { ...base, deepTime: true });
      for (let i = 0; i < runTicks; i++) simTick(true);
      for (const e of W.chron?.events || []) {
        if (['evolution', 'origin', 'oxygenation', 'massext', 'moment'].includes(e.kind)) {
          console.log(`${row.seed}\t${e.kind}\t${e.label}`);
        }
      }
    }
  }
  process.exit(0);
}

setResolution(n);

const { W, generate, simTick, RULESETS } = await import('../world.js');
const { nodeOf, treeStats } = await import('./evolve.js');
const { rangeContiguity } = await import('./meta.js');
const { NC } = await import('../sphere.js');

const base = RULESETS.find((r) => r.id === ruleId) || RULESETS[0];
generate(seed, { ...base, deepTime: true });

const t0 = performance.now();
for (let i = 0; i < ticks; i++) {
  simTick(true);
  if (every && (i === 0 || (i + 1) % every === 0 || i === ticks - 1)) {
    printRow(i, W, NC, nodeOf, rangeContiguity(W));
  }
}
const elapsed = performance.now() - t0;

if (args.wall) {
  console.log(`wall=${elapsed.toFixed(1)}ms msPerTick=${(elapsed / ticks).toFixed(2)} NC=${NC}`);
}

if (args.firsts) {
  console.log('\n# chron firsts');
  for (const e of W.chron?.events || []) {
    if (['evolution', 'origin', 'oxygenation', 'massext', 'moment'].includes(e.kind)) {
      const age = e.year ?? e.ageYr ?? W.ageYr;
      console.log(`${e.kind}\t${e.label}\tage=${age}`);
    }
  }
  if (W.transitionAge) {
    console.log('\n# transitionAge');
    for (const [k, v] of Object.entries(W.transitionAge)) {
      console.log(`${k}\t${v}`);
    }
  }
}

if (args.tree) {
  const stats = treeStats(W.tree);
  console.log('\n# treeStats', JSON.stringify(stats));
  console.log('id\tparentId\tname\tbirth\tdeath\tpop\tbodyMass\ttrophic');
  for (const node of W.tree?.nodes || []) {
    console.log([
      node.id,
      node.parentId ?? '',
      node.name,
      node.birth,
      node.death ?? '',
      node.pop,
      node.traits[4].toFixed(4),
      node.traits[7].toFixed(4),
    ].join('\t'));
  }
}

if (args.json) {
  console.log(JSON.stringify({
    seed, ticks, NC, elapsed,
    msPerTick: elapsed / ticks,
    ageYr: W.ageYr,
    meanLife: W.meanLife,
    living: W.tree?.living?.length,
    transitions: W.transitions,
    rangeContiguity: rangeContiguity(W),
  }, null, 2));
}
