/** Open-ended evolution — traits, speciation, phylogenetic tree, transitions.
 *  Backlog items 29–58, plus tree-dependent ecology hooks. */

import { clamp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { horizontalGeneTransfer, flagEndemics, climateRangeShift, latitudinalDiversity } from './meta.js';
import { isModernEarth, isDeepTimeEarth } from './ruleMode.js';
import { deriveLifeClass, unlockedClassFromPool } from './lifeclass.js';
import { isSubmerged, isLand } from './cellSurface.js';

function guildBiomass(W, c) {
  const d = W.guildDens;
  if (!d) return 0;
  let s = 0;
  for (const id of Object.keys(d)) s += d[id]?.[c] || 0;
  return s;
}

/** Deep time: guild mats count as occupancy even when life[] is still catching up. */
export function cellLifeSignal(W, c) {
  const life = W.life[c] || 0;
  if (!isDeepTimeEarth(W.rule)) return life;
  return Math.max(life, guildBiomass(W, c) * 0.4);
}

const lifeFloor = (W) => (isDeepTimeEarth(W.rule) ? 0.008 : 0.05);

function cellOccupied(W, c, id) {
  if (!id) return false;
  const sig = cellLifeSignal(W, c);
  if (sig >= lifeFloor(W)) return true;
  return isDeepTimeEarth(W.rule) && guildBiomass(W, c) > 0.02;
}

/** Trait indices into population vectors. Item 43. */
export const TRAITS = {
  tOpt: 0,        // thermal optimum
  tBreadth: 1,    // thermal breadth
  desiccation: 2,
  o2Affinity: 3,
  bodyMass: 4,    // log-ish 0–1
  dispersal: 5,
  repro: 6,       // reproductive investment
  trophic: 7,     // 0 producer → 1 herbivore → 1 consumer
  defence: 8,
  pigment: 9,
  radiation: 10,
  COUNT: 11,
};

const MUT_RATE = [0.04, 0.03, 0.03, 0.02, 0.008, 0.03, 0.025, 0.01, 0.02, 0.05, 0.02];

export function blankTraits() {
  const t = new Float32Array(TRAITS.COUNT);
  t[TRAITS.tOpt] = 0.5;
  t[TRAITS.tBreadth] = 0.25;
  t[TRAITS.desiccation] = 0.3;
  t[TRAITS.o2Affinity] = 0.1;
  t[TRAITS.bodyMass] = 0.15;
  t[TRAITS.dispersal] = 0.3;
  t[TRAITS.repro] = 0.5;
  t[TRAITS.trophic] = 0;
  t[TRAITS.defence] = 0.2;
  t[TRAITS.pigment] = 0.4;
  t[TRAITS.radiation] = 0.1;
  return t;
}

let _nextId = 1;

export function createTree() {
  _nextId = 1;
  return {
    nodes: [],
    living: [],
    livingSet: new Set(),
    byId: new Map(),
    diversityHistory: [],
    extinctions: [],
    convergences: [],
    backgroundRate: 0,
    massRate: 0,
  };
}

export function nodeOf(tree, id) {
  return tree?.byId?.get(id) || null;
}

export function addLineage(tree, parentId, traits, ageYr, name) {
  const id = _nextId++;
  const node = {
    id,
    parentId: parentId ?? null,
    birth: ageYr,
    death: null,
    traits: traits.slice ? traits.slice() : Float32Array.from(traits),
    name: name || cladeName(traits, id),
    substitutions: 0,
    cells: [],
    pop: 0,
    endemic: false,
  };
  tree.nodes.push(node);
  tree.byId.set(id, node);
  tree.living.push(id);
  tree.livingSet.add(id);
  return node;
}

export function removeLiving(tree, id) {
  if (!tree.livingSet.has(id)) return;
  tree.livingSet.delete(id);
  tree.living = tree.living.filter((x) => x !== id);
}

export function lineageAt(W, c) {
  if (!W?.tree || !W.popId) return null;
  return nodeOf(W.tree, W.popId[c]) || null;
}

export function treeStats(tree) {
  if (!tree) return { nodes: 0, living: 0, extinct: 0, maxDepth: 0, meanBranchLen: 0 };
  let maxDepth = 0;
  let branchSum = 0;
  for (const node of tree.nodes) {
    let d = 0;
    let p = node;
    while (p?.parentId) {
      d++;
      p = nodeOf(tree, p.parentId);
    }
    if (d > maxDepth) maxDepth = d;
    if (node.parentId) {
      const parent = nodeOf(tree, node.parentId);
      if (parent) {
        let dist = 0;
        for (let k = 0; k < TRAITS.COUNT; k++) dist += Math.abs(node.traits[k] - parent.traits[k]);
        branchSum += dist;
      }
    }
  }
  const branches = Math.max(1, tree.nodes.length - 1);
  return {
    nodes: tree.nodes.length,
    living: tree.living.length,
    extinct: tree.nodes.length - tree.living.length,
    maxDepth,
    meanBranchLen: branchSum / branches,
  };
}

/** Pronounceable clade name from traits. Item 52. */
export function cladeName(traits, id) {
  const roots = ['Thal', 'Chor', 'Pyr', 'Aer', 'Lith', 'Hydr', 'Phyt', 'Zo', 'Myc', 'Rhiz'];
  const suffixes = ['ia', 'iformes', 'acea', 'idae', 'ina', 'otes', 'phyta', 'zoa'];
  const mass = traits[TRAITS.bodyMass] || 0;
  const troph = traits[TRAITS.trophic] || 0;
  const r = roots[((mass * 10 + id) | 0) % roots.length];
  const s = suffixes[((troph * 8 + id * 3) | 0) % suffixes.length];
  return r + s;
}

export function initEvolution(W) {
  W.tree = createTree();
  W.popId = new Int32Array(NC); // lineage id per cell (0 = empty)
  W.popId.fill(0);
  if (!W.macroDens) W.macroDens = new Float32Array(NC);
  if (!W.cladeCount) W.cladeCount = new Uint8Array(NC);
}

export function ensureLuca(W, chronLog) {
  if (!W.tree) initEvolution(W);
  if (W.tree.nodes.length) return;
  if (!W.transitions?.abiogenesis && !isModernEarth(W.rule)) return;

  const traits = blankTraits();
  if (W.transitions?.oxygenicPhotosynthesis) traits[TRAITS.pigment] = 0.7;

  const rootCells = [];
  const floor = lifeFloor(W);
  for (let c = 0; c < NC; c++) {
    if (cellLifeSignal(W, c) > floor) rootCells.push(c);
  }
  if (!rootCells.length && W.transitions?.abiogenesis) {
    for (let c = 0; c < NC; c++) {
      if (W.bound[c] === 0 && isSubmerged(W, c) && guildBiomass(W, c) > 0.06) {
        rootCells.push(c);
      }
    }
  }
  if (!rootCells.length) return;

  const luca = addLineage(W.tree, null, traits, W.ageYr, 'LUCA');
  W.lucaId = luca.id;
  for (const c of rootCells) {
    W.popId[c] = luca.id;
    W.life[c] = Math.max(W.life[c], cellLifeSignal(W, c), 0.08);
    luca.cells.push(c);
    luca.pop++;
  }
  if (chronLog) chronLog(W.year, 'origin', 0, 1, 'LUCA rooted');
}

function mutate(traits, rng, locked = null) {
  const out = traits.slice();
  for (let i = 0; i < TRAITS.COUNT; i++) {
    if (locked && locked[i]) continue;
    const sigma = MUT_RATE[i];
    const step = (rng() * 2 - 1) * sigma;
    const large = Math.abs(step) > sigma * 1.5;
    if (large && rng() < 0.7) continue;
    out[i] = clamp(out[i] + step, 0, 1);
  }
  return out;
}

function fitness(traits, W, c) {
  const t = W.temp[c];
  const m = isLand(W, c) ? W.moist[c] : 1;
  const o2 = W.gases.O2;
  const dT = Math.abs(t - traits[TRAITS.tOpt]);
  const therm = Math.max(0, 1 - dT / Math.max(0.05, traits[TRAITS.tBreadth]));
  let water = m >= (1 - traits[TRAITS.desiccation]) * 0.3 ? 1 : m * 2;
  const inter = W.intertidal?.[c] || 0;
  if (inter > 0.15) {
    const need = inter;
    water *= clamp(traits[TRAITS.desiccation] / Math.max(0.15, need), 0.2, 1.4);
  }
  const oxy = o2 >= traits[TRAITS.o2Affinity] * 0.3 ? 1 : o2 / 0.3;
  return therm * water * oxy;
}

function neighbourLineage(W, c) {
  const floor = lifeFloor(W);
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    const id = W.popId[n];
    if (id && cellLifeSignal(W, n) > floor && W.tree.livingSet.has(id)) return id;
  }
  return 0;
}

/**
 * Kleiber: B ∝ M^0.75 → density ∝ M^-0.75. Item 63.
 */
export function kleiberDensity(bodyMassTrait) {
  const M = Math.pow(10, bodyMassTrait * 6 - 2);
  return Math.pow(M, -0.75);
}

export function evolveTick(W, chronLog) {
  if (W.rule.daisyworld || W.rule.airless) return;
  if (!W.tree) initEvolution(W);
  ensureLuca(W, chronLog);
  if (!W.tree.nodes.length) return;

  const rng = W.rng || (() => 0.5);
  const dt = Math.min(2, (W.dtYr || 200) / 1e6);
  const tree = W.tree;

  for (const id of tree.living) {
    const n = nodeOf(tree, id);
    if (n) { n.pop = 0; n.cells.length = 0; }
  }
  for (let c = 0; c < NC; c++) {
    const id = W.popId[c];
    if (!cellOccupied(W, c, id)) {
      W.popId[c] = 0;
      W.macroDens[c] = 0;
      continue;
    }
    const n = nodeOf(tree, id);
    if (!n || n.death != null) {
      W.popId[c] = tree.living[0] || 0;
      continue;
    }
    n.pop++;
    n.cells.push(c);
    const grade = n.traits[TRAITS.bodyMass] > 0.25 && (W.transitions?.multicellular)
      ? clamp(n.traits[TRAITS.bodyMass], 0, 1) : 0;
    W.macroDens[c] = grade;
  }

  const livingNodes = tree.living.map((id) => nodeOf(tree, id)).filter(Boolean);

  for (const node of livingNodes) {
    if (!node || node.pop < 1) continue;

    const Ne = Math.max(1, node.pop);
    const drift = 1 / Math.sqrt(Ne);
    if (rng() < 0.05 * dt + drift * 0.02) {
      node.traits = mutate(node.traits, rng, node.locked);
    }
    node.substitutions += 0.01 * dt * Ne;

    const complexity = node.traits[TRAITS.bodyMass] + (node.traits[TRAITS.trophic] > 0.3 ? 0.2 : 0);
    if (complexity > 0.5 && W.meanLife < 0.1) {
      node.traits[TRAITS.bodyMass] *= 0.99;
    }

    const hazard = 0.0002 * dt * (1 + (W._extinctionPulse || 0));
    const guildAlive = isDeepTimeEarth(W.rule)
      && W.transitions?.abiogenesis
      && Object.values(W.guilds || {}).some((v) => v > 0.001);
    if (node.pop < 1) continue;
    if (node.pop < 3 && rng() < hazard * 5 && !guildAlive) {
      extinguish(tree, node, W.ageYr, 'demographic', chronLog, W);
    } else if (rng() < hazard / Math.max(1, node.pop)) {
      extinguish(tree, node, W.ageYr, 'background', chronLog, W);
    }
  }

  horizontalGeneTransfer(W, chronLog);
  flagEndemics(W);
  climateRangeShift(W);
  W.latDiversity = latitudinalDiversity(W);

  maybeSpeciate(W, chronLog, rng, dt);

  if (W._recoveryBoost > 0) {
    W._recoveryBoost *= 0.99;
    if (rng() < 0.02 * dt * W._recoveryBoost && tree.living.length) {
      const parent = nodeOf(tree, tree.living[0]);
      if (parent) {
        const child = addLineage(tree, parent.id, mutate(parent.traits, rng), W.ageYr);
        child.name = cladeName(child.traits, child.id);
        if (chronLog) chronLog(W.year, 'speciation', 0, 1, `Radiation: ${child.name}`);
      }
    }
  }

  detectConvergence(tree, W.ageYr, W._tickIndex || 0);

  tree.diversityHistory.push({ t: W.ageYr, n: tree.living.length });
  if (tree.diversityHistory.length > 3000) tree.diversityHistory.shift();

  let massSum = 0, nPop = 0;
  for (const node of livingNodes) {
    if (!node) continue;
    massSum += node.traits[TRAITS.bodyMass] * node.pop;
    nPop += node.pop;
  }
  const meanMass = nPop ? massSum / nPop : 0.2;
  const o2 = W.gases.O2;
  const g = W.rule.gravity || 1;
  W.bodyScale = clamp(0.55 + meanMass * 0.8 + o2 * 0.9 - (g - 1) * 0.3, 0.45, 1.8);

  for (let c = 0; c < NC; c++) {
    if (cellLifeSignal(W, c) > 0.1 && !W.popId[c] && tree.living.length) {
      const neighId = neighbourLineage(W, c);
      if (neighId) {
        W.popId[c] = neighId;
        continue;
      }
      let best = tree.living[0], bestF = -1;
      for (const node of livingNodes) {
        if (!node) continue;
        const f = fitness(node.traits, W, c);
        if (f > bestF) { bestF = f; best = node.id; }
      }
      W.popId[c] = best;
    }
  }

  if (W.cladeCount) {
    for (let c = 0; c < NC; c++) {
      const ids = new Set();
      if (W.popId[c]) ids.add(W.popId[c]);
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if (W.popId[n]) ids.add(W.popId[n]);
      }
      W.cladeCount[c] = Math.min(255, ids.size);
    }
  }

  deriveLifeClass(W);
  W.unlockedClass = unlockedClassFromPool(W);
}

function extinguish(tree, node, ageYr, reason, chronLog, W) {
  node.death = ageYr;
  node.extReason = reason;
  removeLiving(tree, node.id);
  tree.extinctions.push({ id: node.id, name: node.name, t: ageYr, reason });
  if (W) {
    for (const c of node.cells || []) {
      if (W.fossils || true) {
        if (!W.fossils) W.fossils = Array.from({ length: NC }, () => []);
        const slot = W.fossils[c];
        slot.push({ name: node.name, id: node.id, ageYr, traits: Array.from(node.traits), reason });
        if (slot.length > 8) slot.shift();
      }
    }
  }
  if (chronLog) chronLog(ageYr, 'extinction', 0, 1, `Extinct: ${node.name} (${reason})`);
}

function maybeSpeciate(W, chronLog, rng, dt) {
  const tree = W.tree;
  for (const id of [...tree.living]) {
    const node = nodeOf(tree, id);
    if (!node || node.pop < 8) continue;

    const comps = connectedComponents(node.cells, W);
    if (comps.length < 2) continue;

    for (let i = 1; i < comps.length; i++) {
      if (comps[i].length < 3) continue;
      if (rng() > 0.01 * dt) continue;
      const childTraits = mutate(node.traits, rng);
      if (rng() < 0.3) childTraits[TRAITS.trophic] = clamp(childTraits[TRAITS.trophic] + 0.15, 0, 1);
      const child = addLineage(tree, node.id, childTraits, W.ageYr);
      for (const c of comps[i]) W.popId[c] = child.id;
      if (chronLog) chronLog(W.year, 'speciation', comps[i][0], 1, `Speciation: ${child.name}`);
      child.locked = child.locked || new Uint8Array(TRAITS.COUNT);
      if (node.traits[TRAITS.bodyMass] > 0.4) child.locked[TRAITS.bodyMass] = 1;
      break;
    }
  }
}

function connectedComponents(cells, W) {
  if (!cells.length) return [];
  const set = new Set(cells);
  const seen = new Set();
  const comps = [];
  for (const start of cells) {
    if (seen.has(start)) continue;
    const stack = [start];
    const comp = [];
    seen.add(start);
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if (set.has(n) && !seen.has(n)) {
          const landA = isLand(W, c);
          const landB = isLand(W, n);
          if (landA === landB || W.life[n] > 0.05) {
            seen.add(n);
            stack.push(n);
          }
        }
      }
    }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length);
  return comps;
}

const MAX_CONV_PAIRS = 60;

function detectConvergence(tree, ageYr, tickIndex) {
  const living = tree.living.map((id) => nodeOf(tree, id)).filter(Boolean);
  const n = living.length;
  if (n < 2) return;
  const totalPairs = (n * (n - 1)) / 2;
  const stride = Math.max(1, Math.floor(totalPairs / MAX_CONV_PAIRS));
  const offset = (tickIndex * 7) % Math.max(1, totalPairs);
  let checked = 0;
  let pairIdx = 0;
  for (let i = 0; i < n && checked < MAX_CONV_PAIRS; i++) {
    for (let j = i + 1; j < n && checked < MAX_CONV_PAIRS; j++, pairIdx++) {
      if (pairIdx % stride !== offset % stride) continue;
      checked++;
      const a = living[i], b = living[j];
      if (related(tree, a, b, 3)) continue;
      let d = 0;
      for (let k = 0; k < TRAITS.COUNT; k++) d += Math.abs(a.traits[k] - b.traits[k]);
      if (d < 0.45) {
        const key = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
        if (!tree._convSeen) tree._convSeen = new Set();
        if (!tree._convSeen.has(key)) {
          tree._convSeen.add(key);
          tree.convergences.push({ a: a.name, b: b.name, t: ageYr, dist: d });
        }
      }
    }
  }
}

function related(tree, a, b, depth) {
  let pa = a, pb = b;
  for (let i = 0; i < depth; i++) {
    if (!pa || !pb) return false;
    if (pa.id === pb.id) return true;
    if (pa.parentId === b.id || pb.parentId === a.id) return true;
    pa = pa.parentId ? nodeOf(tree, pa.parentId) : null;
    pb = pb.parentId ? nodeOf(tree, pb.parentId) : null;
  }
  return false;
}

/** Fork RNG stream for rewind-the-tape. Item 12. */
export function forkWorldSeed(seed, label = 'fork') {
  let h = seed >>> 0;
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x9e3779b1);
  return (h >>> 0) || 1;
}

export function treeSummary(tree) {
  if (!tree) return { living: 0, total: 0, extinct: 0 };
  return {
    living: tree.living.length,
    total: tree.nodes.length,
    extinct: tree.nodes.length - tree.living.length,
    convergences: tree.convergences.length,
  };
}
