/** Open-ended evolution — traits, speciation, phylogenetic tree, transitions.
 *  Backlog items 29–58, plus tree-dependent ecology hooks. */

import { clamp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { horizontalGeneTransfer, flagEndemics, climateRangeShift, latitudinalDiversity } from './meta.js';
import { isModernEarth, isDeepTimeEarth } from './ruleMode.js';
import { deriveLifeClass, unlockedClassFromPool } from './lifeclass.js';
import { isSubmerged, isLand } from './cellSurface.js';
import {
  blankGenome, cloneGenome, mutateGenome, expressBodyPlan, describeGenome,
  morphPenalty, hardenGenome, genomeKey, recombineGenomes, transferOrgan,
  genomeCopyCost,
} from './genome.js';
import { sensoryEnvAt, viableBands } from './sensory.js';
import { rngOf } from './rng.js';
import { biochemForWorld } from './origin.js';

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

export function addLineage(tree, parentId, traits, ageYr, name, genome) {
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
    /** The body. Everything visible about this lineage is expressed from here. */
    genome: genome || blankGenome(),
    morphMult: 1,
    plan: null,
    diet: [],
    isolation: 0,
    censusPop: 0,
    Ne: 1,
    load: 0,
    variance: 0.05,
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
  luca.genome.biochem = W.planetBiochem || biochemForWorld(W.rule, rngOf(W, 'rngBio'));
  W.lucaId = luca.id;
  const prefer = W.originCell != null ? [W.originCell, ...rootCells] : rootCells;
  const seen = new Set();
  for (const c of prefer) {
    if (seen.has(c) || c == null) continue;
    seen.add(c);
    W.popId[c] = luca.id;
    W.life[c] = Math.max(W.life[c], cellLifeSignal(W, c), 0.08);
    luca.cells.push(c);
    luca.pop++;
  }
  if (chronLog) chronLog(W.year, 'origin', W.originCell ?? luca.cells[0] ?? 0, 1, 'LUCA rooted');
}

function holoceneGenome(kind) {
  const g = blankGenome();
  g.biochem = {
    solvent: 'water', polymer: 'dna', carrier: 'phosphate',
    chirality: 'L', membrane: 'phospholipid',
  };
  if (kind === 'plant') {
    g.axes.habitat = 'terrestrial';
    g.axes.trophic = 'phototroph';
    g.axes.skeleton = 'lignin';
    g.axes.locomotion = 'sessile';
    g.axes.respiration = 'airSac';
    g.n.sizeClass = 6;
    g.n.symmetryOrder = 1;
    g.n.segments = 1;
  } else if (kind === 'animal') {
    g.axes.habitat = 'terrestrial';
    g.axes.trophic = 'predator';
    g.axes.skeleton = 'bone';
    g.axes.locomotion = 'limbed';
    g.axes.nervous = 'brain';
    g.axes.thermal = 'endotherm';
    g.axes.respiration = 'lung';
    g.n.sizeClass = 5;
    g.n.symmetryOrder = 1;
    g.n.appendagePairs = 2;
    g.n.segments = 8;
    g.n.expressingSegments = 4;
  } else if (kind === 'fish') {
    g.axes.habitat = 'pelagic';
    g.axes.trophic = 'predator';
    g.axes.skeleton = 'bone';
    g.axes.locomotion = 'pairedFin';
    g.axes.respiration = 'gill';
    g.n.sizeClass = 4;
    g.n.symmetryOrder = 1;
    g.n.segments = 6;
  }
  return g;
}

/** Plant a living Holocene clade set on modern Earth at generate, so inspect and
 *  the Lab tree have bodies at tick 0 instead of waiting on phylogeny. */
export function seedHoloceneTree(W, chronLog) {
  if (!isModernEarth(W.rule)) return;
  if (W.tree?.nodes?.length) return;
  if (W.transitions) W.transitions.abiogenesis = true;
  ensureLuca(W, chronLog);
  if (!W.tree?.nodes?.length) return;

  const env = { O2: W.gases?.O2 ?? 0.21, gravity: W.rule?.gravity ?? 1 };
  const luca = nodeOf(W.tree, W.lucaId);
  const plants = addLineage(W.tree, luca.id, luca.traits, W.ageYr, 'Plantae', holoceneGenome('plant'));
  const animals = addLineage(W.tree, luca.id, luca.traits, W.ageYr, 'Metazoa', holoceneGenome('animal'));
  const fish = addLineage(W.tree, luca.id, luca.traits, W.ageYr, 'Pisces', holoceneGenome('fish'));
  plants.traits[TRAITS.bodyMass] = 0.35;
  plants.traits[TRAITS.trophic] = 0.05;
  animals.traits[TRAITS.bodyMass] = 0.45;
  animals.traits[TRAITS.trophic] = 0.65;
  fish.traits[TRAITS.bodyMass] = 0.38;
  fish.traits[TRAITS.trophic] = 0.55;
  plants.plan = expressBodyPlan(plants.genome, env);
  animals.plan = expressBodyPlan(animals.genome, env);
  fish.plan = expressBodyPlan(fish.genome, env);

  plants.cells.length = 0; plants.pop = 0;
  animals.cells.length = 0; animals.pop = 0;
  fish.cells.length = 0; fish.pop = 0;
  luca.cells.length = 0; luca.pop = 0;

  for (let c = 0; c < NC; c++) {
    if (cellLifeSignal(W, c) <= lifeFloor(W)) continue;
    const sea = isSubmerged(W, c);
    let id = luca.id;
    if (sea && (W.reef[c] > 0.2 || W.life[c] > 0.18)) id = fish.id;
    else if (!sea && W.life[c] > 0.45) id = plants.id;
    else if (!sea && W.life[c] > 0.28) id = animals.id;
    W.popId[c] = id;
    const n = nodeOf(W.tree, id);
    n.cells.push(c);
    n.pop++;
  }
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

function fitness(traits, W, c, node) {
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
  let biotic = 1;
  if (node) {
    if ((node.preyAvail || 0) > 0) biotic *= 1 + Math.min(0.6, node.preyAvail);
    if ((node.predation || 0) > 0) {
      biotic *= clamp(1 - node.predation * (1 - (traits[TRAITS.defence] || 0)), 0.2, 1.2);
    }
    if ((node.compete || 0) > 0) biotic *= clamp(1 - node.compete * 0.35, 0.4, 1);
    const copy = genomeCopyCost(node.genome || { organs: [], n: { segments: 1 } });
    biotic *= clamp(1 - copy, 0.4, 1);
    if (node.plan && node.plan.viable === false) biotic *= 0.15;
  }
  const chir = node?.genome?.biochem?.chirality;
  if (chir && W.planetBiochem?.chirality && chir !== W.planetBiochem.chirality && chir !== 'racemic') {
    biotic *= 0.25;
  }
  W.bioticTerm = (W.bioticTerm || 0) * 0.9 + (biotic !== 1 ? 0.1 : 0);
  return therm * water * oxy * (node?.morphMult ?? 1) * biotic;
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
 * Kleiber: B ∝ M^0.75 → density ∝ M^-0.75.
 * `massG` in grams when known; otherwise the old 0–1 trait.
 */
export function kleiberDensity(bodyMassTrait, massG) {
  const M = massG != null ? massG : Math.pow(10, bodyMassTrait * 6 - 2);
  return Math.pow(Math.max(1e-12, M), -0.75);
}

function cellKm2(c, radiusKm = 6371) {
  return (AREA[c] || 1) * (4 * Math.PI * radiusKm * radiusKm) / NC;
}


/* ------------------------------------------------------------- morphology -- */

/** One sensory environment per medium per tick — bandViability integrates a Planck
 *  spectrum, so it is cached rather than recomputed per lineage. */
function morphEnv(W, node) {
  const c = node.cells?.[0] ?? 0;
  const medium = W.rule?.iceShell ? 'cryobrine' : (W.h?.[c] < W.seaLevel ? 'water' : 'air');
  W._morphEnvCache = W._morphEnvCache || new Map();
  const key = `${medium}|${(W.gases?.O2 ?? 0).toFixed(2)}`;
  let env = W._morphEnvCache.get(key);
  if (!env) {
    env = sensoryEnvAt(W, c, { medium });
    env.bands = viableBands(env);
    env.O2 = W.gases?.O2 ?? 0.21;
    env.gravity = W.rule?.gravity ?? 1;
    W._morphEnvCache.set(key, env);
  }
  return env;
}

/**
 * Bodies change. Once per phylogeny tick a lineage may gain, lose, duplicate or
 * retune one module; old lineages harden and stop being able to.
 *
 * There is no ladder here and no list of Earth events. What a lineage can become is
 * whatever the grammar allows, and what it is *worth* becoming is decided by the
 * incompatibility rules and by whether this planet delivers the band a sensor needs.
 */
export function morphTick(W, chronLog, dtMyr) {
  const tree = W.tree;
  if (!tree) return;
  const rng = rngOf(W, 'rngBio');
  W._morphEnvCache = null;
  W.morphFirsts = W.morphFirsts || new Set();
  let changed = 0;

  for (const id of tree.living) {
    const node = nodeOf(tree, id);
    if (!node || node.pop < 1 || !node.genome) continue;
    const env = morphEnv(W, node);
    const ageMyr = Math.max(0, (W.ageYr - node.birth) / 1e6);

    // One module event per lineage per tick, scaled by how long the tick was.
    const p = clamp(0.06 * Math.max(0.1, dtMyr), 0, 0.5);
    if (rng() < p) {
      const before = genomeKey(node.genome);
      const op = mutateGenome(node.genome, rng, env);
      if (op && genomeKey(node.genome) !== before) {
        changed++;
        node.plan = null;
        // A planet-first is a moment, whoever gets there.
        const first = `${op}:${node.genome.axes.locomotion}:${node.genome.n.symmetryOrder}`;
        if (op === 'gain' && !W.morphFirsts.has(genomeKey(node.genome).split(':')[3] || first)) {
          const last = node.genome.organs[node.genome.organs.length - 1];
          const tag = `organ:${last?.id}`;
          if (last && !W.morphFirsts.has(tag)) {
            W.morphFirsts.add(tag);
            node.genome.firsts.push(last.id);
            if (chronLog) {
              chronLog(W.year, 'evolution', node.cells?.[0] ?? 0, 1,
                `First ${last.id}: ${node.name}`, { body: describeGenome(node.genome) });
            }
          }
        }
      }
    }
    hardenGenome(node.genome, ageMyr, Math.max(1, node.pop), rng);

    const pen = morphPenalty(node.genome);
    node.morphMult = pen.mult;
    node.morphWhy = pen.why;
    if (!node.plan) node.plan = expressBodyPlan(node.genome, env);
  }

  W.morphChanged = changed;
  W.morphospaceOccupied = countMorphs(tree);

  // What this sky and this medium actually deliver, for the HUD and for the god layer.
  // Prefer the most abundant living body's own eyes — that is the world's sense, not a catalogue.
  let topNode = null, topPop = 0;
  for (const id of tree.living) {
    const n = nodeOf(tree, id);
    if ((n?.pop || 0) > topPop) { topPop = n.pop; topNode = n; }
  }
  const anyEnv = W._morphEnvCache?.values().next().value;
  W.topSense = topNode?.plan?.eyes?.[0]?.band || anyEnv?.bands?.[0]?.id || null;
  W.senseBands = anyEnv?.bands?.slice(0, 5) || [];
}

/** How many structurally distinct bodies are alive right now. */
export function countMorphs(tree) {
  const seen = new Set();
  for (const id of tree.living) {
    const n = nodeOf(tree, id);
    if (n?.genome) seen.add(genomeKey(n.genome));
  }
  return seen.size;
}

/** The body of whatever lives in this cell, expressed. */
export function planAt(W, c) {
  const node = lineageAt(W, c);
  if (!node?.genome) return null;
  if (!node.plan) node.plan = expressBodyPlan(node.genome, { O2: W.gases?.O2 ?? 0.21, gravity: W.rule?.gravity ?? 1 });
  return node.plan;
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
    if (n) { n.pop = 0; n.cells.length = 0; n.censusPop = 0; }
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
    const massG = n.plan?.massG ?? Math.pow(10, (n.traits[TRAITS.bodyMass] ?? 0.15) * 6 - 2);
    n.censusPop = (n.censusPop || 0) + kleiberDensity(n.traits[TRAITS.bodyMass], massG)
      * Math.max(0.02, cellLifeSignal(W, c)) * cellKm2(c);
    const grade = n.traits[TRAITS.bodyMass] > 0.25 && (W.transitions?.multicellular)
      ? clamp(n.traits[TRAITS.bodyMass], 0, 1) : 0;
    W.macroDens[c] = grade;
  }

  const livingNodes = tree.living.map((id) => nodeOf(tree, id)).filter(Boolean);
  for (const n of livingNodes) {
    n.Ne = Math.max(1, (n.censusPop || n.pop) * 0.35);
  }

  for (const node of livingNodes) {
    if (!node || node.pop < 1) continue;

    const Ne = Math.max(1, node.Ne || node.pop);
    // Drift is random change that overwhelms weak selection when Ne is small —
    // not a mutation-rate bonus. provenance: measured-shape
    const driftSigma = 1 / Math.sqrt(Ne);
    const genYr = Math.max(1e-4, Math.pow(10, (node.traits[TRAITS.bodyMass] || 0.15) * 2 - 2));
    const gens = clamp((W.dtYr || 200) / (genYr * 365), 0.01, 1e4);
    const mutP = clamp(0.02 * dt * (node.genome?.biochem?.polymer === 'rna' ? 2 : 1), 0, 0.4);
    if (rng() < mutP) {
      const next = mutate(node.traits, rng, node.locked);
      // Neutral / nearly-neutral: most steps stick; strong selection needs s > 1/Ne
      for (let k = 0; k < TRAITS.COUNT; k++) {
        const s = Math.abs(next[k] - node.traits[k]);
        if (s * Ne < 1 && rng() < 0.7) {
          next[k] = clamp(node.traits[k] + (rng() * 2 - 1) * driftSigma * 0.05, 0, 1);
        }
      }
      node.traits = next;
    }
    node.substitutions += 0.01 * dt; // neutral: rate = μ, independent of N
    node.load = (node.load || 0) + (W.transitions?.sex ? 0 : 0.002 * dt * driftSigma);
    if (W.transitions?.sex) node.load = Math.max(0, (node.load || 0) - 0.004 * dt);
    void gens;

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

  morphTick(W, chronLog, dt);
  maybeRecombine(W, rng, dt);
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
        const radGenome = cloneGenome(parent.genome || blankGenome());
        mutateGenome(radGenome, rng, morphEnv(W, parent));
        const child = addLineage(tree, parent.id, mutate(parent.traits, rng), W.ageYr, null, radGenome);
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
        const f = fitness(node.traits, W, c, node);
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

function maybeRecombine(W, rng, dt) {
  if (!W.transitions?.sex) return;
  const living = W.tree.living.map((id) => nodeOf(W.tree, id)).filter(Boolean);
  if (living.length < 2) return;
  if (rng() > 0.04 * dt) return;
  const a = living[(rng() * living.length) | 0];
  const b = living[(rng() * living.length) | 0];
  if (!a?.genome || !b?.genome || a.id === b.id) return;
  if (a.genome.biochem?.chirality !== b.genome.biochem?.chirality) return;
  if (Math.abs((a.traits[TRAITS.bodyMass] || 0) - (b.traits[TRAITS.bodyMass] || 0)) > 0.25) return;
  a.genome = recombineGenomes(a.genome, b.genome, rng);
  a.plan = null;
  a.load = Math.max(0, (a.load || 0) * 0.5);
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
    if (!node || node.pop < 3) continue;

    const comps = connectedComponents(node.cells, W);
    if (comps.length >= 2) node.isolation = clamp((node.isolation || 0) + 0.18 * dt, 0, 1);
    else node.isolation = (node.isolation || 0) * 0.88;

    // Allopatry once isolation has actually accumulated.
    if (comps.length >= 2 && (node.isolation || 0) > 0.35) {
      for (let i = 1; i < comps.length; i++) {
        if (comps[i].length < 2) continue;
        if (rng() > 0.04 * dt) continue;
        splitOff(W, node, comps[i], chronLog, rng, 'allopatry');
        node.isolation = 0.1;
        break;
      }
    }

    // Sympatric: large, variable population on a productivity gradient.
    if (node.pop >= 6 && rng() < 0.006 * dt * Math.min(2, node.variance || 0.05) * 8) {
      const half = node.cells.slice(Math.ceil(node.cells.length / 2));
      if (half.length >= 2) splitOff(W, node, half, chronLog, rng, 'sympatry');
    }

    // Polyploid instant speciation — WGD founds a species.
    if (node.genome?.n?.ploidy > (node._lastPloidy || 1) && rng() < 0.5) {
      const founder = node.cells.slice(0, Math.max(2, (node.cells.length / 4) | 0));
      if (founder.length) splitOff(W, node, founder, chronLog, rng, 'polyploid');
    }
    node._lastPloidy = node.genome?.n?.ploidy || 1;
  }
}

function splitOff(W, parent, cells, chronLog, rng, how) {
  const childTraits = mutate(parent.traits, rng);
  if (how === 'sympatry' && rng() < 0.5) {
    childTraits[TRAITS.trophic] = clamp(childTraits[TRAITS.trophic] + 0.18, 0, 1);
  }
  const childGenome = cloneGenome(parent.genome || blankGenome());
  const env = morphEnv(W, parent);
  const kicks = how === 'polyploid' ? 0 : 1 + ((rng() * 3) | 0);
  for (let k = 0; k < kicks; k++) mutateGenome(childGenome, rng, env);
  const child = addLineage(W.tree, parent.id, childTraits, W.ageYr, null, childGenome);
  child.plan = expressBodyPlan(childGenome, env);
  const pen = morphPenalty(childGenome);
  child.morphMult = pen.mult;
  child.morphWhy = pen.why;
  child.isolation = 1;
  for (const c of cells) W.popId[c] = child.id;
  if (chronLog) {
    chronLog(W.year, 'speciation', cells[0], 1, `Speciation (${how}): ${child.name}`,
      { body: describeGenome(childGenome), how });
  }
  child.locked = child.locked || new Uint8Array(TRAITS.COUNT);
  if (parent.traits[TRAITS.bodyMass] > 0.4) child.locked[TRAITS.bodyMass] = 1;
  return child;
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
          const elevGap = Math.abs((W.h[c] || 0) - (W.h[n] || 0));
          const mountain = !landA && !landB ? false : elevGap > 0.28;
          const deep = (W.seaLevel - Math.min(W.h[c], W.h[n])) > 0.35 && landA !== landB;
          if (mountain || deep) continue;
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
      const ka = a.genome ? genomeKey(a.genome).split(':').slice(0, 3).join(':') : '';
      const kb = b.genome ? genomeKey(b.genome).split(':').slice(0, 3).join(':') : '';
      let d = 0;
      for (let k = 0; k < TRAITS.COUNT; k++) d += Math.abs(a.traits[k] - b.traits[k]);
      const bodyHit = ka && ka === kb;
      if (d < 0.45 || bodyHit) {
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
  if (!tree) return { living: 0, total: 0, extinct: 0, maxDepth: 0 };
  const st = treeStats(tree);
  return {
    living: tree.living.length,
    total: tree.nodes.length,
    extinct: tree.nodes.length - tree.living.length,
    convergences: tree.convergences.length,
    maxDepth: st.maxDepth,
  };
}

/** Compact phylogeny for save files. Cells are occupancy, rebuilt on tick. */
export function packTree(tree) {
  if (!tree) return null;
  return {
    nextId: _nextId,
    living: [...(tree.living || [])],
    nodes: (tree.nodes || []).map((n) => ({
      id: n.id,
      parentId: n.parentId,
      birth: n.birth,
      death: n.death,
      traits: Array.from(n.traits || []),
      name: n.name,
      substitutions: n.substitutions || 0,
      genome: n.genome || null,
      pop: n.pop || 0,
      censusPop: n.censusPop || 0,
      Ne: n.Ne || 1,
      diet: n.diet || [],
      isolation: n.isolation || 0,
      load: n.load || 0,
      endemic: !!n.endemic,
      morphMult: n.morphMult ?? 1,
      morphWhy: n.morphWhy || [],
    })),
    convergences: (tree.convergences || []).slice(-40),
    extinctions: (tree.extinctions || []).slice(-40),
  };
}

export function unpackTree(data) {
  const tree = createTree();
  if (!data?.nodes?.length) return tree;
  _nextId = Math.max(data.nextId || 1, data.nodes.reduce((m, n) => Math.max(m, n.id || 0), 0) + 1);
  for (const n of data.nodes) {
    const node = {
      id: n.id,
      parentId: n.parentId ?? null,
      birth: n.birth || 0,
      death: n.death ?? null,
      traits: Float32Array.from(n.traits?.length ? n.traits : blankTraits()),
      name: n.name || cladeName(blankTraits(), n.id),
      substitutions: n.substitutions || 0,
      cells: [],
      pop: n.pop || 0,
      endemic: !!n.endemic,
      genome: n.genome || blankGenome(),
      morphMult: n.morphMult ?? 1,
      morphWhy: n.morphWhy || [],
      plan: null,
      diet: n.diet || [],
      isolation: n.isolation || 0,
      censusPop: n.censusPop || 0,
      Ne: n.Ne || 1,
      load: n.load || 0,
      variance: 0.05,
    };
    tree.nodes.push(node);
    tree.byId.set(node.id, node);
  }
  tree.living = (data.living || []).filter((id) => tree.byId.has(id));
  tree.livingSet = new Set(tree.living);
  tree.convergences = data.convergences || [];
  tree.extinctions = data.extinctions || [];
  return tree;
}
