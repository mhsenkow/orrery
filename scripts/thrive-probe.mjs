#!/usr/bin/env node
/**
 * thrive-probe — measure the layer the player actually watches.
 *
 * Every claim in the thrive backlog about beings, herds, settlements and fire
 * was measured with an ad-hoc script that then got thrown away. This is that
 * script, committed, so the next claim can be checked instead of believed.
 *
 *   node scripts/thrive-probe.mjs                       # demo world, 500 ticks
 *   node scripts/thrive-probe.mjs --rule=terra           # pinned Earth, for contrast
 *   node scripts/thrive-probe.mjs --ticks=2000 --json
 *   node scripts/thrive-probe.mjs --fire                 # light one and watch it run
 *
 * It reports: beings by kind, behaviours, births, deaths and causes, max age,
 * meanBuild, settlements by stage, city lights, herd size, fire front, burnt
 * area, surface feeders and the nutrient plume — plus the clock, because a
 * world where `ageYr` does not move cannot grow anything.
 */

import { W, generate, simTick, RULESETS } from '../vr/world.js';
import { ENT } from '../vr/agents.js';
import { NC, NBR } from '../vr/sphere.js';
import { cityLights } from '../vr/sim/city.js';
import { igniteFire, fireDanger } from '../vr/sim/fire.js';
import { cloneRuleForRun } from '../vr/sim/ruleMode.js';
import { formatAge } from '../vr/sim/time.js';

/** Sprite-kind names, from KIND_RGB in sim/lifeColour.js. Morph tiles ≥16. */
const KIND_NAME = {
  0: 'canopy', 1: 'scrub', 2: 'grass', 3: 'desertFlora', 4: 'alpine',
  5: 'settler', 6: 'iceFauna', 7: 'worm', 8: 'worm2', 9: 'sparsePlant',
  10: 'regolith', 11: 'relic', 12: 'blackDaisy', 13: 'whiteDaisy',
  14: 'reef', 15: 'fish',
};

function kindLabel(k) {
  return KIND_NAME[k] || `morph${k}`;
}

function census() {
  const kinds = Object.create(null);
  const behav = Object.create(null);
  const causes = Object.create(null);
  let maxAge = 0, alive = 0, named = 0, herdMax = 0, oldest = null;
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    alive++;
    kinds[kindLabel(m.kind)] = (kinds[kindLabel(m.kind)] || 0) + 1;
    behav[m.behav || 'none'] = (behav[m.behav || 'none'] || 0) + 1;
    if (m.name) named++;
    if ((m.herd || 0) > herdMax) herdMax = m.herd;
    if (m.age > maxAge) { maxAge = m.age; oldest = m; }
  }
  return { alive, kinds, behav, causes, maxAge, named, herdMax, oldest };
}

function stages(W) {
  const out = { camp: 0, village: 0, town: 0, city: 0 };
  for (const c of W.cities || []) out[c.stage] = (out[c.stage] || 0) + 1;
  return out;
}

function fieldMax(a) {
  if (!a) return 0;
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
  return m;
}

function fieldCount(a, above) {
  if (!a) return 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > above) n++;
  return n;
}

/**
 * Generate a world and run it, tracking births and deaths as they happen —
 * a census taken only at the end cannot tell a population that turned over
 * from one that never moved.
 */
export function probeThrive({
  seed = 20260808,
  ruleId = 'thrive',
  ticks = 500,
  fireAt = -1,
  onTick = null,
} = {}) {
  const base = RULESETS.find((r) => r.id === ruleId);
  if (!base) throw new Error(`no ruleset '${ruleId}' — have ${RULESETS.map((r) => r.id).join(', ')}`);
  const rule = cloneRuleForRun(base);
  generate(seed, rule);

  const startAge = W.ageYr;
  const seenIds = new Set();
  const deaths = Object.create(null);
  let born = 0, died = 0;
  const registerLiving = () => {
    for (let i = 0; i < ENT.n; i++) {
      const m = ENT.meta[i];
      if (!m) continue;
      if (!seenIds.has(m.id)) { seenIds.add(m.id); born++; }
      if (m.dead && !m._counted) {
        m._counted = true;
        died++;
        deaths[m.cause || 'unknown'] = (deaths[m.cause || 'unknown'] || 0) + 1;
      }
    }
  };

  let firstCityTick = -1, firstLightTick = -1, firstFireTick = -1;
  let peakFire = 0, peakHerd = 0;
  let ignited = 0;

  for (let t = 1; t <= ticks; t++) {
    simTick(true);
    registerLiving();
    if (t === fireAt) ignited = lightTheDriestForest();
    if (firstCityTick < 0 && (W.cities?.length || 0) > 0) firstCityTick = t;
    if (firstLightTick < 0 && cityLights(W) > 0.01) firstLightTick = t;
    if (firstFireTick < 0 && (W.fireCells || 0) > 0) firstFireTick = t;
    if ((W.fireCells || 0) > peakFire) peakFire = W.fireCells;
    if ((W.herdMax || 0) > peakHerd) peakHerd = W.herdMax;
    if (onTick) onTick(t);
  }
  registerLiving();

  const c = census();
  return {
    ruleId,
    ruleName: rule.name,
    seed,
    ticks,
    cells: NC,
    clock: {
      startAge: formatAge(startAge),
      endAge: formatAge(W.ageYr),
      yearsElapsed: W.ageYr - startAge,
      dtYr: W.dtYr,
      advanced: W.ageYr - startAge > 0,
    },
    beings: {
      alive: c.alive,
      byKind: c.kinds,
      byBehaviour: c.behav,
      named: c.named,
      everSeen: born,
      died,
      deathCauses: deaths,
      maxAge: c.maxAge,
      oldest: c.oldest ? { name: c.oldest.name, kind: kindLabel(c.oldest.kind), age: c.oldest.age } : null,
    },
    herd: { max: c.herdMax, peak: peakHerd },
    settlement: {
      meanBuild: W.meanBuild || 0,
      maxBuild: fieldMax(W.build),
      builtCells: fieldCount(W.build, 0.05),
      cities: W.cities?.length || 0,
      stages: stages(W),
      civPop: W.civPop || 0,
      cityLights: cityLights(W),
      buildersActive: W.buildersActive || 0,
      firstCityTick,
      firstLightTick,
    },
    fire: {
      ignitedByProbe: ignited,
      front: W.fireCells || 0,
      peakFront: peakFire,
      burntArea: W.burntArea || 0,
      litTotal: W._fireLit || 0,
      ashCells: fieldCount(W.ash, 0.05),
      firstFireTick,
    },
    plume: {
      surfaceFeeders: W.surfaceFeeders || 0,
      cells: fieldCount(W.nutrientPlume, 0.01),
      max: fieldMax(W.nutrientPlume),
      meanNutrientN: mean(W.nutrientN),
      meanNutrientP: mean(W.nutrientP),
    },
    biosphere: {
      meanLife: W.meanLife,
      meanTemp: W.meanTemp,
      lineages: W.tree?.living?.length || 0,
      unlockedClass: W.unlockedClass,
    },
    polity: (() => {
      const pols = W.polities || [];
      if (!pols.length) return null;
      let largest = 0;
      for (const p of pols) largest = Math.max(largest, p.cells | 0);
      return {
        count: pols.length,
        largestShare: NC > 0 ? largest / NC : 0,
        borderLen: W.borderLen | 0,
      };
    })(),
  };
}

function mean(a) {
  if (!a) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

/** Find the most flammable *neighbourhood* and light it — the demo's Strike button.
 *
 *  Scoring the cell alone picks isolated fuel: the single driest cell on the demo
 *  Earth is often a shrub with wet or bare neighbours, so the fire has nowhere to
 *  go and dies in two cells. A player aims at a forest, and so should this: the
 *  cell's own danger plus what surrounds it. Measured over the twelve best cells
 *  with fuel restored between strikes, reach is 2–18 cells scored alone and
 *  9–18 scored with the neighbourhood. */
export function lightTheDriestForest() {
  let best = -1, bestScore = 0;
  for (let c = 0; c < NC; c++) {
    const d = fireDanger(W, c);
    if (d <= 0) continue;
    let around = 0;
    for (let k = 0; k < 4; k++) around += fireDanger(W, NBR[c * 4 + k]);
    const score = d + around * 0.5;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (best < 0) return 0;
  return igniteFire(W, best, 1, 1);
}

function fmt(x, n = 5) {
  return typeof x === 'number' ? x.toFixed(n) : String(x);
}

function report(r) {
  const L = [];
  L.push(`${r.ruleName} (${r.ruleId})  seed ${r.seed}  ${r.ticks} ticks  ${r.cells} cells`);
  L.push('');
  L.push(`clock        ${r.clock.startAge} → ${r.clock.endAge}`);
  L.push(`             ${r.clock.yearsElapsed.toLocaleString()} yr elapsed · dt ${r.clock.dtYr} yr/tick`
    + (r.clock.advanced ? '' : '   ⚠ CLOCK DID NOT MOVE'));
  L.push('');
  L.push(`beings       ${r.beings.alive} alive · ${r.beings.everSeen} ever · ${r.beings.died} died · max age ${r.beings.maxAge}`);
  L.push(`  by kind    ${Object.entries(r.beings.byKind).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`).join('  ') || '—'}`);
  L.push(`  behaviour  ${Object.entries(r.beings.byBehaviour).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`).join('  ') || '—'}`);
  L.push(`  deaths     ${Object.entries(r.beings.deathCauses)
    .map(([k, v]) => `${k}=${v}`).join('  ') || 'none'}`);
  if (r.beings.oldest) {
    L.push(`  oldest     ${r.beings.oldest.name || '(unnamed)'} · ${r.beings.oldest.kind} · ${r.beings.oldest.age} ticks`);
  }
  L.push('');
  L.push(`herd         max ${r.herd.max} together (peak over run ${r.herd.peak})`);
  L.push('');
  L.push(`settlement   meanBuild ${fmt(r.settlement.meanBuild)} · max ${fmt(r.settlement.maxBuild, 3)}`
    + ` · ${r.settlement.builtCells} built cells`);
  L.push(`             ${r.settlement.cities} settlements  ${Object.entries(r.settlement.stages)
    .filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('  ') || '—'}`);
  L.push(`             pop ${r.settlement.civPop.toLocaleString()} · cityLights ${fmt(r.settlement.cityLights, 4)}`
    + ` · builders ${r.settlement.buildersActive}`);
  L.push(`             first settlement at tick ${r.settlement.firstCityTick} · first lights at tick ${r.settlement.firstLightTick}`);
  L.push('');
  L.push(`fire         front ${r.fire.front} · peak ${r.fire.peakFront} · lit ${r.fire.litTotal}`
    + ` · burnt ${fmt(r.fire.burntArea, 2)} · ash cells ${r.fire.ashCells}`
    + ` · first at tick ${r.fire.firstFireTick}`);
  L.push('');
  L.push(`plume        ${r.plume.surfaceFeeders} surface feeders · ${r.plume.cells} plume cells`
    + ` · max ${fmt(r.plume.max, 3)}`);
  L.push(`             mean N ${fmt(r.plume.meanNutrientN)} · mean P ${fmt(r.plume.meanNutrientP)}`);
  L.push('');
  L.push(`biosphere    meanLife ${fmt(r.biosphere.meanLife)} · meanTemp ${fmt(r.biosphere.meanTemp)}`
    + ` · ${r.biosphere.lineages} lineages · class ${r.biosphere.unlockedClass}`);
  if (r.polity) {
    L.push('');
    L.push(`polities     ${r.polity.count}  largest share ${fmt(r.polity.largestShare * 100, 1)}%`
      + `  border ${r.polity.borderLen}`);
  }
  return L.join('\n');
}

if (process.argv[1] && process.argv[1].includes('thrive-probe')) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v === undefined ? true : (/^-?\d+$/.test(v) ? +v : v)];
    }),
  );
  const ticks = args.ticks || 500;
  const r = probeThrive({
    seed: args.seed || 20260808,
    ruleId: args.rule || 'thrive',
    ticks,
    fireAt: args.fire ? (args.fire === true ? Math.max(1, Math.floor(ticks * 0.4)) : args.fire) : -1,
  });
  console.log(args.json ? JSON.stringify(r, null, 2) : report(r));
}
