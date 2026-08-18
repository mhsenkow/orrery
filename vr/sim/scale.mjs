#!/usr/bin/env node
/** Synthetic scale test — 250 lineages, measure evolveTick cost. P0-26. */

import { setResolution } from '../sphere.js';

const n = +(process.argv.find((a) => a.startsWith('--n='))?.split('=')[1] || 64);
const lineages = +(process.argv.find((a) => a.startsWith('--lineages='))?.split('=')[1] || 250);
const ticks = +(process.argv.find((a) => a.startsWith('--ticks='))?.split('=')[1] || 50);

setResolution(n);

const { W, generate, RULESETS } = await import('../world.js');
const { NC } = await import('../sphere.js');
const { addLineage, blankTraits, evolveTick } = await import('./evolve.js');

generate(42, { ...RULESETS[0], deepTime: true });
W.transitions.abiogenesis = true;

for (let i = 0; i < lineages; i++) {
  const traits = blankTraits();
  traits[4] = 0.1 + (i % 10) * 0.03;
  traits[7] = (i % 5) * 0.05;
  addLineage(W.tree, i > 0 ? 1 : null, traits, W.ageYr, `scale-${i}`);
}

for (let c = 0; c < NC; c++) {
  if (W.life[c] > 0.05) {
    W.popId[c] = W.tree.living[c % W.tree.living.length];
  }
}

const t0 = performance.now();
for (let i = 0; i < ticks; i++) evolveTick(W, null);
const elapsed = performance.now() - t0;

console.log(JSON.stringify({
  N: n,
  NC,
  lineages: W.tree.living.length,
  ticks,
  msTotal: elapsed,
  msPerTick: elapsed / ticks,
}, null, 2));
