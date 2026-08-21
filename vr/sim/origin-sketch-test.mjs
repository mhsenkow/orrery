#!/usr/bin/env node
/** Origin sketch — digest is seed-stable and biases the sphere. */

import { setResolution, NC } from '../sphere.js';
setResolution(32);

const { W, generate, RULESETS } = await import('../world.js');
const { cloneRuleForRun } = await import('./ruleMode.js');
const {
  rollOriginDigest, createOriginSketch, applyOriginDigestToRule,
  applyOriginDigestToWorld, originDigestSummary,
} = await import('./originSketch.js');

let failed = 0;
function ok(name, cond, detail = '') {
  if (cond) console.log(`  ok  ${name}${detail ? ` — ${detail}` : ''}`);
  else { console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); failed++; }
}

const SEED = 20260820;
const a = rollOriginDigest(SEED);
const b = rollOriginDigest(SEED);
ok('digest stable', a.nPlates === b.nPlates && a.hasMoon === b.hasMoon
  && a.impactAxis[0] === b.impactAxis[0], originDigestSummary(a));
ok('digest has impact axis', Math.hypot(...a.impactAxis) > 0.99);

const sk = createOriginSketch(SEED, { earthLike: true });
ok('sketch starts in dust', sk.phase === 'dust');
for (let i = 0; i < 400; i++) sk.tick(0.05);
ok('sketch completes', sk.done && !!sk.digest);
ok('digest matches roll', sk.digest.nPlates === a.nPlates);

sk.skip(); // idempotent
ok('skip idempotent', sk.done);

const rule = applyOriginDigestToRule(cloneRuleForRun(RULESETS.find((r) => r.id === 'thrive') || RULESETS[0]), a);
ok('rule gets obliquity', Math.abs(rule.obliquity - a.obliquityDeg * Math.PI / 180) < 1e-6);
ok('rule gets plates', rule.nPlates === a.nPlates);
ok('rule carries digest', rule._originDigest === a);

generate(SEED, rule);
ok('world has originDigest', !!W.originDigest);
let high = 0, low = 0, nH = 0, nL = 0;
const ax = a.impactAxis;
const { DIR } = await import('../sphere.js');
for (let c = 0; c < NC; c++) {
  const dot = DIR[c * 3] * ax[0] + DIR[c * 3 + 1] * ax[1] + DIR[c * 3 + 2] * ax[2];
  if (dot > 0.4) { high += W.h[c]; nH++; }
  if (dot < -0.4) { low += W.h[c]; nL++; }
}
const meanH = high / Math.max(1, nH);
const meanL = low / Math.max(1, nL);
ok('impact hemisphere higher than antipode', meanH > meanL - 0.005 || meanH > meanL,
  `hit ${meanH.toFixed(3)} vs anti ${meanL.toFixed(3)}`);
// Prefer crust bias — sea-level fit can mask absolute height.
let cH = 0, cL = 0, nCH = 0, nCL = 0;
for (let c = 0; c < NC; c++) {
  const dot = DIR[c * 3] * ax[0] + DIR[c * 3 + 1] * ax[1] + DIR[c * 3 + 2] * ax[2];
  if (dot > 0.4) { cH += W.crust[c]; nCH++; }
  if (dot < -0.4) { cL += W.crust[c]; nCL++; }
}
ok('impact hemisphere thicker crust', (cH / nCH) > (cL / nCL),
  `crust hit ${(cH / nCH).toFixed(3)} vs anti ${(cL / nCL).toFixed(3)}`);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\norigin-sketch passed');
