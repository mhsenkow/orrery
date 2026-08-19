/** Seed guild, designer, transplant, refuge, cull, refusals.
 *  Backlog life 44–58. */

import { clamp } from '../../math.js';
import { NC, DIR } from '../../sphere.js';
import { W, chronLog } from '../../world.js';
import { GUILDS } from '../redox.js';
import { TRAITS, addLineage, blankTraits, nodeOf, removeLiving } from '../evolve.js';
import { blankGenome } from '../genome.js';
import { LIFE_CLASSES, seedLife } from '../bio.js';
import { paintBrush, beginStroke } from './brush.js';
import { issueReceipt, causalChain } from './receipt.js';

export let selectedGuild = 'cyanobacteria';
export let designerTraits = null;

export function setSelectedGuild(id) {
  if (GUILDS.some((g) => g.id === id)) selectedGuild = id;
}

export function defaultTraits() {
  return blankTraits();
}

/** Why a seed fails here. Item 58. */
export function seedRefusal(cell, guildId = selectedGuild) {
  const reasons = [];
  const g = GUILDS.find((x) => x.id === guildId);
  if (!g) return { ok: false, reasons: ['unknown guild'] };
  const T = W.temp[cell];
  const moist = W.moist[cell];
  const o2 = W.gases.O2;
  const flux = (W.solar || 1) * Math.max(0, DIR[cell * 3 + 1] * 0.3 + 0.7); // crude

  if (g.pigment && flux < 0.25) reasons.push('photon flux too low for phototrophy');
  if (g.oxygenic && o2 < 0.001 && !(W.transitions?.oxygenicPhotosynthesis)) {
    // ok — cyano invents O2
  }
  if (g.acceptor === 'O2' && o2 < 0.02) reasons.push('oxidant (O₂) scarce');
  if (g.donor === 'H2O' && W.h[cell] < W.seaLevel - 0.3 && moist < 0.1) {
    reasons.push('no liquid water donor');
  }
  if (T < 0.15) reasons.push('too cold');
  if (T > 0.92) reasons.push('too hot');
  if ((W.uv || 0) > 0.8 && (designerTraits?.[TRAITS.radiation] ?? 0.1) < 0.3) {
    reasons.push('UV lethal without radiation defence');
  }
  if (W.sterileCause) reasons.push(W.sterileCause);
  // alienTick sterility
  if (W.alienSterile?.[cell]) reasons.push(W.alienSterile[cell]);

  return { ok: reasons.length === 0, reasons, guild: guildId };
}

/** Seed a metabolic guild, not a class index. Item 44. */
export function seedGuildAt(cell, guildId = selectedGuild, radiusRad = null) {
  const check = seedRefusal(cell, guildId);
  if (!check.ok) {
    return {
      ok: false,
      refused: true,
      reasons: check.reasons,
      note: `Life refused: ${check.reasons[0]}`,
    };
  }
  const g = GUILDS.find((x) => x.id === guildId);
  beginStroke(['life', 'guildDens']);
  if (!W.guildDens) W.guildDens = {};
  if (!W.guildDens[guildId]) W.guildDens[guildId] = new Float32Array(NC);

  const touched = [];
  const r = paintBrush(cell, (c, f) => {
    W.life[c] = Math.min(1, W.life[c] + 0.35 * f);
    W.guildDens[guildId][c] = Math.min(1, (W.guildDens[guildId][c] || 0) + 0.5 * f);
    touched.push(c);
  }, radiusRad != null ? { radiusRad } : {});

  // Ensure phylogeny knows
  if (W.tree && !W.tree.living.length) {
    const traits = designerTraits ? designerTraits.slice() : defaultTraits();
    if (g.pigment === 'bchl') traits[TRAITS.pigment] = 0.2;
    if (g.pigment === 'chla') traits[TRAITS.pigment] = 0.7;
    const genome = blankGenome();
    if (W.planetBiochem) genome.biochem = { ...W.planetBiochem };
    addLineage(W.tree, null, traits, W.ageYr, `${guildId}-seed`, genome);
  }

  const receipt = issueReceipt({
    tool: 'seedGuild',
    cell,
    cells: touched.slice(0, 40),
    intent: `Seed ${guildId}`,
    expected: `${guildId} bloom · ${r.cells} cells · ${(r.areaKm2 / 1e3).toFixed(0)}×10³ km²`,
    delta: r.meanFalloff,
    units: 'guild density',
    delayYr: 1e5,
    delayLabel: `${guildId} community established (or failed)`,
  });

  chronLog(W.year, 'seed', cell, 1, `Seeded ${guildId}`);
  return { ok: true, guild: guildId, brush: r, receipt, refusal: check };
}

/** Organism designer release. Item 45. */
export function releaseDesign(cell, traits = designerTraits || defaultTraits(), name = 'designed') {
  designerTraits = traits;
  if (!W.tree) return { ok: false, note: 'No phylogeny yet' };
  const genome = blankGenome();
  if (W.planetBiochem) genome.biochem = { ...W.planetBiochem };
  const node = addLineage(W.tree, null, traits.slice(), W.ageYr, name, genome);
  beginStroke(['life']);
  paintBrush(cell, (c, f) => {
    W.life[c] = Math.min(1, W.life[c] + 0.4 * f);
    if (W.popId) W.popId[c] = node.id;
  });
  issueReceipt({
    tool: 'design',
    cell,
    intent: `Release ${name}`,
    expected: `clade #${node.id} · mass ${traits[TRAITS.bodyMass].toFixed(2)} · Topt ${traits[TRAITS.tOpt].toFixed(2)}`,
  });
  chronLog(W.year, 'seed', cell, 1, `Designed organism ${name}`);
  return { ok: true, node };
}

/** Transplant lineage. Item 46 / 51. */
export function transplantClade(fromCell, toCell, invasive = false) {
  const id = W.popId?.[fromCell];
  if (id == null && !W.tree?.living?.length) return { ok: false, note: 'No lineage at source' };
  const cladeId = id ?? W.tree.living[0];
  beginStroke(['life']);
  paintBrush(toCell, (c, f) => {
    W.life[c] = Math.min(1, W.life[c] + (invasive ? 0.55 : 0.3) * f);
    if (W.popId) W.popId[c] = cladeId;
  });
  if (invasive) {
    // Generalist boost
    const node = nodeOf(W.tree, cladeId);
    if (node) {
      node.traits[TRAITS.dispersal] = Math.min(1, node.traits[TRAITS.dispersal] + 0.2);
      node.traits[TRAITS.defence] = Math.min(1, node.traits[TRAITS.defence] + 0.15);
    }
  }
  issueReceipt({
    tool: 'transplant',
    cell: toCell,
    intent: invasive ? 'Introduce invasive' : 'Transplant lineage',
    expected: causalChain([
      `clade ${cladeId}`,
      invasive ? 'no local predators' : 'relocated',
      'web restructures',
    ]),
    delayYr: 5e4,
    delayLabel: invasive ? 'Invasive impact visible in endemics' : 'Transplant established',
  });
  chronLog(W.year, 'seed', toCell, 1, invasive ? 'Invasive introduced' : 'Lineage transplanted');
  return { ok: true, cladeId, invasive };
}

/** Refuge — suppress extinction. Item 49. */
export function declareRefuge(cell) {
  if (!W.refuge) W.refuge = new Float32Array(NC);
  beginStroke(['refuge']);
  paintBrush(cell, (c, f) => {
    W.refuge[c] = Math.min(1, (W.refuge[c] || 0) + 0.7 * f);
  });
  issueReceipt({ tool: 'refuge', cell, intent: 'Declare refuge', expected: 'Extinction suppressed in region' });
  chronLog(W.year, 'tool', cell, 1, 'Refuge declared');
  return { ok: true };
}

/** Cull a clade by id. Item 50. */
export function cullClade(cladeId) {
  if (!W.tree) return { ok: false };
  const node = nodeOf(W.tree, cladeId);
  if (!node) return { ok: false, note: 'Unknown clade' };
  let killed = 0;
  for (let c = 0; c < NC; c++) {
    if (W.popId?.[c] === cladeId) {
      W.life[c] *= 0.05;
      W.popId[c] = 0;
      killed++;
    }
  }
  node.pop = 0;
  if (node.death == null) node.death = W.ageYr;
  removeLiving(W.tree, cladeId);
  W.extinctionDebt = (W.extinctionDebt || 0) + killed;
  issueReceipt({
    tool: 'cull',
    cell: 0,
    intent: `Cull ${node.name}`,
    expected: `${killed} cells cleared · food web hole`,
    irreversible: true,
  });
  chronLog(W.year, 'plague', 0, killed, `Culled ${node.name}`);
  return { ok: true, killed, name: node.name };
}

/** Force major transition at a price. Item 47. */
export function forceTransition(key) {
  if (!W.transitions) W.transitions = {};
  const readiness = {
    oxygenicPhotosynthesis: (W.guilds?.cyanobacteria || 0) + (W.meanLife || 0),
    eukaryote: W.gases.O2,
    multicellular: W.unlockedClass / 8,
    landPlant: W.unlockedClass / 8 + (W.ozone || 0),
  };
  const ready = readiness[key] ?? 0.2;
  const priceMult = clamp(1.5 - ready, 0.3, 2.5);
  W.transitions[key] = true;
  W.modulePool?.add(key);
  W.transitionAge = W.transitionAge || {};
  W.transitionAge[key] = W.ageYr;
  issueReceipt({
    tool: 'transition',
    cell: 0,
    intent: `Force ${key}`,
    expected: `Transition forced · readiness ${(ready * 100) | 0}% · surcharge ×${priceMult.toFixed(1)}`,
    delta: priceMult,
  });
  chronLog(W.year, 'moment', 0, 1, `Forced transition: ${key}`);
  return { ok: true, key, priceMult };
}

/** Directed selection on living clade. Item 48. */
export function pushTrait(cladeId, traitIndex, delta) {
  const node = nodeOf(W.tree, cladeId);
  if (!node) return { ok: false };
  const before = node.traits[traitIndex];
  node.traits[traitIndex] = clamp(before + delta, 0, 1);
  // Correlated cost
  if (traitIndex === TRAITS.bodyMass) node.traits[TRAITS.repro] = clamp(node.traits[TRAITS.repro] - Math.abs(delta) * 0.4, 0, 1);
  if (traitIndex === TRAITS.dispersal) node.traits[TRAITS.defence] = clamp(node.traits[TRAITS.defence] - Math.abs(delta) * 0.3, 0, 1);
  if (traitIndex === TRAITS.tBreadth) node.traits[TRAITS.tOpt] *= 1; // breadth costs specialization — noop visual
  issueReceipt({
    tool: 'mutate',
    cell: 0,
    intent: 'Directed selection',
    expected: `trait ${traitIndex} ${before.toFixed(2)} → ${node.traits[traitIndex].toFixed(2)}`,
  });
  return { ok: true, traits: node.traits };
}

export function setMutationRate(rate) {
  W.mutationRate = clamp(rate, 0.05, 8);
  issueReceipt({ tool: 'mutate', cell: 0, intent: 'Set mutation rate', expected: `μ → ${W.mutationRate.toFixed(2)}` });
  return { ok: true, rate: W.mutationRate };
}

/** Biome terraform diagnosis. Item 52. */
export function diagnoseBiome(cell, target = 'tempDeciduous') {
  const gaps = [];
  const t = W.temp[cell];
  const m = W.moist[cell];
  const soil = W.soil?.[cell] || 0;
  if (target.includes('Rainforest') || target === 'tropRainforest') {
    if (m < 0.5) gaps.push('not enough rainfall');
    if (t < 0.48) gaps.push('too cold');
  }
  if (target === 'tempDeciduous') {
    if (m < 0.28) gaps.push('not enough rainfall');
    if (t < 0.32 || t > 0.7) gaps.push('temperature out of range');
  }
  if (soil < 0.15) gaps.push('wrong soil / thin regolith');
  if ((W.ozone || 0) < 0.15 && target.includes('land')) gaps.push('no ozone shield');
  if ((W.unlockedClass || 0) < 2) gaps.push('no lineage in range with right traits');
  return { target, gaps, ready: gaps.length === 0 };
}

/** Legacy class seed still available. */
export function seedClassAt(cell) {
  const cls = W.unlockedClass | 0;
  beginStroke(['life']);
  const r = paintBrush(cell, (c, f) => {
    W.life[c] = Math.min(1, W.life[c] + 0.4 * f);
  });
  seedLife(W, cell, cls);
  issueReceipt({
    tool: 'seed',
    cell,
    intent: 'Seed class',
    expected: `${LIFE_CLASSES[cls]?.id || 'life'} · ${r.cells} cells`,
  });
  chronLog(W.year, 'seed', cell, 1, `Seeded class ${LIFE_CLASSES[cls]?.id || cls}`);
  return { ok: true, brush: r };
}
