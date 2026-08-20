/** Moving entities / light agents on the cube-sphere.
 *  Density tracks life so forests fill in as blooms spread.
 *  Settlers (kind 5) raise visible builds on living land — watch towns grow. */

import { mulberry32 } from './math.js';
import { NC, DIR, NBR } from './sphere.js';
import { W } from './world.js';
import { logEvent } from './chronicle.js';
import { KIND_RGB, cladeRGB } from './sim/lifeColour.js';
import { rngOf } from './sim/rng.js';
import { bodyPlanFromTraits, passesSilhouette, planOf } from './sim/morphology.js';
import { lineageAt, cellLifeSignal } from './sim/evolve.js';
import { isSubmerged, isLand, localSeaLevel } from './sim/cellSurface.js';
import { isModernEarth, isPinnedEarth } from './sim/ruleMode.js';
import { settleCities, cityLights } from './sim/city.js';
import { presentTime, noteWear, isOutNow } from './sim/present.js';
import { morphTileOf, resetMorphAtlas } from './sprites.js';

export const MAX_ENT = 1400;
export const ENT = {
  n: 0,
  data: new Float32Array(MAX_ENT * 8),
  meta: new Array(MAX_ENT),
};
let _idSeq = 1;
let _occ = null;

/** Drop population state — call before repopulating (world generate / load). */
export function resetAgents() {
  ENT.n = 0;
  _idSeq = 1;
  for (let i = 0; i < MAX_ENT; i++) ENT.meta[i] = null;
}

const NAMES_A = ['Ash', 'Bri', 'Cor', 'Del', 'Fen', 'Gri', 'Hel', 'Jor', 'Kel', 'Lum', 'Mor', 'Nyx', 'Orn', 'Pyx', 'Quin', 'Ryn', 'Sol', 'Tor', 'Ulm', 'Vex'];
const NAMES_B = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'or', 'en', 'an'];

function nameFrom(seed, i) {
  const rng = mulberry32(seed + i * 9973);
  return NAMES_A[(rng() * NAMES_A.length) | 0] + NAMES_B[(rng() * NAMES_B.length) | 0];
}

/** Sprite kinds that are animals, not vegetation. Morph tiles (>= 16, see
 *  MORPH_BASE in sprites.js) are always expressed bodies, so always animals. */
function isAnimalKind(kind) {
  return kind === 5 || kind === 6 || kind === 7 || kind === 8
    || kind === 14 || kind === 15 || kind >= 16;
}

function kindForCell(c, rng) {
  const R = W.rule;
  const e = (W.h[c] - W.seaLevel) / (1 - W.seaLevel + 1e-6);
  if (R.daisyworld) {
    if (W.blackDaisy[c] > 0.15) return 12;
    if (W.whiteDaisy[c] > 0.15) return 13;
    return -1;
  }
  if (R.signature === 'worms' && isSubmerged(W, c)) return rng() < 0.35 ? 7 : 8;
  if (isSubmerged(W, c)) {
    /* Reef used to win every productive cell, so 47% of all beings on Earth
       were sessile coral sprites and nothing swam. Where the clock runs, give
       productive water swimmers — which is also where the plume belongs. */
    if (!isPinnedEarth(R) && W.lifeClass[c] >= 4
      && (W.npp?.[c] || 0) > 0.22 && rng() < 0.4) return 15;
    if (W.reef[c] > 0.25 || cellLifeSignal(W, c) > 0.35) return 14;
    return W.lifeClass[c] >= 4 ? 15 : -1;
  }
  if (W.ice[c] > 0.45) return 6;
  if (!R.airless && W.unlockedClass >= 1 && W.life[c] > 0.28 && W.ice[c] < 0.25) {
    /* Two throttles used to hide settlement on every Earth-like world: this
       0.03 chance and the ×0.12 build rate below. Both exist to keep the pinned
       calibration Earth from drifting, and both now apply only there. */
    const settleChance = isPinnedEarth(R)
      ? 0.03 + W.build[c] * 0.2
      : 0.14 + W.build[c] * 0.55 + (W.life[c] > 0.5 ? 0.18 : 0);
    if (rng() < settleChance) return 5;
  }
  /* Large land fauna. The kind table only has a moving land animal where there
     is ice (kind 6) or on Vermis (kind 7), so on Earth every land cell resolves
     to vegetation and nothing on land walks. Where animals are unlocked and the
     clock runs, put grazers on the open ground — kind 7 is the large-body slot
     (`writeEnt` gives it the biggest base scale) and its terrain-chewing side
     effect in `agentsTick` is gated on the Vermis signature, so it stays off. */
  if (W.unlockedClass >= 6 && W.life[c] > 0.18 && W.ice[c] < 0.3 && !isPinnedEarth(R)) {
    const open = W.moist[c] > 0.18 && W.moist[c] < 0.6 ? 0.24 : 0.08;
    if (rng() < open) return 7;
  }
  if (W.life[c] > 0.45) return W.moist[c] > 0.4 ? 0 : 1;
  if (W.life[c] > 0.18) return 2;
  if (W.life[c] > 0.08) return 9;
  if (W.moist[c] < 0.2 && W.life[c] < 0.05) return 3;
  if (e > 0.65) return 4;
  if (W.lifeClass[c] >= 6 && W.life[c] > 0.35) return 5;
  if (R.airless) return rng() < 0.5 ? 10 : (rng() < 0.05 ? 11 : -1);
  return -1;
}

function writeEnt(n, c, kind, rng) {
  const jx = (rng() - 0.5) * 0.012;
  const jy = (rng() - 0.5) * 0.012;
  const jz = (rng() - 0.5) * 0.012;
  let x = DIR[c * 3] + jx, y = DIR[c * 3 + 1] + jy, z = DIR[c * 3 + 2] + jz;
  const l = Math.hypot(x, y, z) || 1;
  x /= l; y /= l; z /= l;
  const buildLift = (W.build[c] || 0) * (isModernEarth(W.rule) ? 0.0035 : 0.012);
  const sea = localSeaLevel(W, c);
  const rel = isModernEarth(W.rule) ? Math.min(W.rule.relief, 0.018) : W.rule.relief;
  const rr = 1 + (Math.max(W.h[c], sea) - sea) * rel + buildLift;
  const o = n * 8;
  ENT.data[o] = x * rr; ENT.data[o + 1] = y * rr; ENT.data[o + 2] = z * rr;
  const lifeBoost = 0.85 + W.life[c] * 0.45;
  // Morphology from live phylogeny via popId (not arithmetic clade assignment)
  let plan = null;
  let node = null;
  if (W.tree?.living?.length) {
    node = lineageAt(W, c);
    if (node?.traits) {
      // Genome first — the body on screen is expressed from the lineage's own modules,
      // and falls back to the trait shim only for a node that predates the grammar.
      plan = planOf(node, {
        O2: W.gases?.O2 ?? 0.21,
        gravity: W.rule?.gravity ?? 1,
      });
      if (!passesSilhouette(plan)) plan = null;
      else kind = morphTileOf(plan) ?? plan.spriteKind ?? kind;
    }
  }
  const base = kind === 7 ? 0.036 : kind === 5 ? 0.02 : kind <= 2 ? 0.013 : 0.015;
  const morphScale = plan ? plan.size * 0.014 : base;
  const scale = morphScale
    * (0.75 + rng() * 0.4) * (W.bodyScale || 1) * Math.min(1.12, lifeBoost)
    * (W.rule.earthLike ? 0.78 : 1);
  ENT.data[o + 3] = scale;
  ENT.data[o + 4] = kind;
  // Clade tint from lineage id when plan exists
  const rgb = KIND_RGB[kind] || [200, 200, 200];
  let v = 0.85 + rng() * 0.2;
  let cr = rgb[0], cg = rgb[1], cb = rgb[2];
  if (plan && node) {
    const warm = plan.pigmentBias || 0.5;
    cr = cr * (0.85 + warm * 0.3);
    cb = cb * (1.1 - warm * 0.25);
    v *= 0.9 + (plan.armour || 0) * 0.2;
    const [hr, hg, hb] = cladeRGB(node.id);
    cr = cr * 0.55 + hr * 0.45;
    cg = cg * 0.55 + hg * 0.45;
    cb = cb * 0.55 + hb * 0.45;
  }
  ENT.data[o + 5] = (cr / 255) * v;
  ENT.data[o + 6] = (cg / 255) * v;
  ENT.data[o + 7] = (cb / 255) * v;
  ENT.meta[n] = {
    id: _idSeq++,
    cell: c, kind, age: 0,
    name: kind === 5 || kind === 7 || kind >= 6 ? nameFrom(W.seed, _idSeq) : null,
    born: W.year,
    bornCell: c,
    plan,
    popId: node?.id ?? 0,
    cladeName: node?.name ?? null,
    stride: plan?.stride || 1,
    heading: 0,
    // Heading as a tangent vector, not the scalar `heading` above (which is only
    // a sprite flip in localview). Alignment needs a direction to average.
    hx: 0, hy: 0, hz: 0,
    herd: 0,
    prevCell: c,
    arriveAt: null,
    behav: kind === 5 ? 'tend' : (kind <= 2 ? 'rest' : 'forage'),
    dead: false,
    cause: null,
  };
}

/** Drop every individual. A new world must not inherit the last one's
 *  population, its name counter or its plumes — `ENT` is a module singleton and
 *  a second `generate()` in one process used to carry all three across. */
export function resetEntities() {
  ENT.n = 0;
  ENT.meta.length = 0;
  ENT.meta.length = MAX_ENT;
  _idSeq = 1;
  _plumeTouched.clear();
  resetMorphAtlas();
}

/** Grazers arrive as a group.
 *
 *  Cohesion only sees a cell and its four neighbours, and 560 beings over 24 576
 *  cells is a 2% density — a herd seeded one animal at a time never finds
 *  itself. Seeded together, the alignment term in `agentsTick` keeps it together.
 *  Returns how many slots were consumed, including the founder. */
function writeHerd(n, c, kind, rng, cap) {
  let w = 0;
  writeEnt(n + w++, c, kind, rng);
  const size = 4 + ((rng() * 5) | 0);
  for (let k = 0; k < size && n + w < cap; k++) {
    const nb = rng() < 0.45 ? c : NBR[c * 4 + ((rng() * 4) | 0)];
    if (W.h[nb] < W.seaLevel || W.ice[nb] > 0.35) continue;
    writeEnt(n + w++, nb, kind, rng);
  }
  return w;
}

export function respawnEntities() {
  resetAgents();
  resetMorphAtlas();
  const rng = rngOf(W, 'rngAgents');
  let n = 0;
  const living = [];
  for (let c = 0; c < NC; c++) {
    if (W.life[c] > 0.08 || W.reef[c] > 0.2 || W.rule.daisyworld || W.build[c] > 0.1) living.push(c);
  }
  const cap = W.rule.earthLike ? Math.min(MAX_ENT, 560) : MAX_ENT;
  const pool = living.length > 200 ? living : null;
  if (pool) {
    const stride = Math.max(1, Math.floor(pool.length / (cap * 0.85)));
    for (let i = 0; i < pool.length && n < cap; i += stride) {
      const c = pool[i];
      const kind = kindForCell(c, rng);
      if (kind < 0) continue;
      if (W.rule.earthLike && (kind === 2 || kind === 9) && rng() > 0.35) continue;
      if (W.rule.earthLike && kind <= 1 && rng() > 0.55) continue;
      if (isPinnedEarth(W.rule) && kind === 5 && rng() > 0.4) continue;
      if (kind === 6 || kind === 7) { n += writeHerd(n, c, kind, rng, cap); continue; }
      writeEnt(n++, c, kind, rng);
    }
  } else {
    const stride = Math.max(1, Math.floor(NC / (cap * 2.2)));
    for (let c = 0; c < NC && n < cap; c += stride) {
      const kind = kindForCell(c, rng);
      if (kind < 0) continue;
      writeEnt(n++, c, kind, rng);
    }
  }
  ENT.n = n;
}

function capForWorld() {
  return W.rule.earthLike ? Math.min(MAX_ENT, 560) : MAX_ENT;
}

/** Fill empty slots without wiping living individuals. */
function topUpEntities() {
  const rng = rngOf(W, 'rngAgents');
  const cap = capForWorld();
  if (ENT.n >= cap * 0.85) return;
  if (!_occ || _occ.length !== NC) _occ = new Uint8Array(NC);
  _occ.fill(0);
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (m && !m.dead) _occ[m.cell] = 1;
  }
  const stride = Math.max(3, (NC / (cap * 2)) | 0);
  for (let c = 0; c < NC && ENT.n < cap; c += stride) {
    if (_occ[c]) continue;
    if (W.life[c] < 0.12 && (W.reef[c] || 0) < 0.2 && (W.build[c] || 0) < 0.1) continue;
    const kind = kindForCell(c, rng);
    if (kind < 0) continue;
    if (kind === 6 || kind === 7) { ENT.n += writeHerd(ENT.n, c, kind, rng, cap); continue; }
    writeEnt(ENT.n++, c, kind, rng);
  }
}

function compactDead() {
  let w = 0;
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    if (w !== i) {
      ENT.meta[w] = m;
      ENT.data.copyWithin(w * 8, i * 8, i * 8 + 8);
    }
    w++;
  }
  ENT.n = w;
}

let _head = null;
let _next = null;
function rebuildBuckets() {
  if (!_head || _head.length !== NC) {
    _head = new Int32Array(NC);
    _next = new Int32Array(MAX_ENT);
  }
  _head.fill(-1);
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    const c = m.cell;
    _next[i] = _head[c];
    _head[c] = i;
  }
}

function eachNearby(c, fn) {
  let i = _head[c];
  while (i >= 0) { fn(i); i = _next[i]; }
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    i = _head[n];
    while (i >= 0) { fn(i); i = _next[i]; }
  }
}

function cellDot(a, b) {
  return DIR[a * 3] * DIR[b * 3] + DIR[a * 3 + 1] * DIR[b * 3 + 1] + DIR[a * 3 + 2] * DIR[b * 3 + 2];
}

function headingOf(from, to) {
  // Sign of eastward component in a crude local frame
  return DIR[to * 3] - DIR[from * 3];
}

function pickBehav(m, c, rng) {
  const ash = W.ash?.[c] || 0;
  const dust = W.dust?.[c] || 0;
  const storm = W.stormField?.[c] || 0;
  const fire = W.fire?.[c] || 0;
  // Fire routes through the flee branch that already existed for ash and dust —
  // the herd does not need a new behaviour, only a new reason.
  if (fire > 0.05 || ash > 0.18 || dust > 0.28 || storm > 0.35 || W.ice[c] > 0.55) return 'flee';
  if (m.kind === 5) return W.build[c] > 0.3 ? 'tend' : 'forage';
  /* Surface feeding: a whale-scale marine animal working a productive patch.
     Distinct from `forage` because it is where the nutrient plume is written.
     Kind 15 is the swimmer; kind 14 is reef and stays put. */
  if (m.kind === 15 && (W.npp?.[c] || 0) > 0.22) {
    return rng() < 0.55 ? 'surface' : 'forage';
  }
  if (m.kind <= 2) return 'rest';
  if (!isOutNow(m.kind, c, m.id || 0) && rng() < 0.72) return 'rest';
  const roll = rng();
  if (roll < 0.18) return 'rest';
  if (roll < 0.28) return 'travel';
  return 'forage';
}

function writePos(n, c) {
  const o = n * 8;
  const rel = W.rule.earthLike ? Math.min(W.rule.relief, 0.018) : W.rule.relief;
  const buildLift = (W.build[c] || 0) * (W.rule.earthLike ? 0.0035 : 0.012);
  const rr = 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * rel + buildLift;
  ENT.data[o] = DIR[c * 3] * rr;
  ENT.data[o + 1] = DIR[c * 3 + 1] * rr;
  ENT.data[o + 2] = DIR[c * 3 + 2] * rr;
}

/** Interpolate beings between cells on the presentation clock. */
export function presentAgents() {
  const t = presentTime();
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    const o = i * 8;
    const rel = W.rule.earthLike ? Math.min(W.rule.relief, 0.018) : W.rule.relief;
    const lift = (c) => (W.build[c] || 0) * (W.rule.earthLike ? 0.0035 : 0.012);
    const rrAt = (c) => 1 + (Math.max(W.h[c], W.seaLevel) - W.seaLevel) * rel + lift(c);
    let x = DIR[m.cell * 3], y = DIR[m.cell * 3 + 1], z = DIR[m.cell * 3 + 2];
    let rr = rrAt(m.cell);
    if (m.prevCell >= 0 && m.arriveAt != null && t < m.arriveAt) {
      const span = Math.max(0.18, 0.28 / Math.max(0.4, m.stride || 1));
      const u = Math.max(0, Math.min(1, 1 - (m.arriveAt - t) / span));
      const e = u * u * (3 - 2 * u);
      const pc = m.prevCell;
      x = DIR[pc * 3] + (x - DIR[pc * 3]) * e;
      y = DIR[pc * 3 + 1] + (y - DIR[pc * 3 + 1]) * e;
      z = DIR[pc * 3 + 2] + (z - DIR[pc * 3 + 2]) * e;
      const l = Math.hypot(x, y, z) || 1;
      x /= l; y /= l; z /= l;
      rr = rrAt(pc) + (rr - rrAt(pc)) * e;
    }
    ENT.data[o] = x * rr;
    ENT.data[o + 1] = y * rr;
    ENT.data[o + 2] = z * rr;
  }
}

/** Cells carrying a live plume — kept so decay is sparse, not a field sweep. */
const _plumeTouched = new Set();

/** Surface-feed fertilisation. `nutrientPlume` is a visible marker with a
 *  half-life; the N and P bumps are the part `nppField` actually reads. */
function bumpNutrient(c, amt) {
  if (c < 0 || c >= NC) return;
  if (W.h[c] >= W.seaLevel) return;
  if (W.nutrientN) W.nutrientN[c] = Math.min(1, W.nutrientN[c] + amt);
  if (W.nutrientP) W.nutrientP[c] = Math.min(1, W.nutrientP[c] + amt * 0.85);
  if (W.nutrientPlume) {
    W.nutrientPlume[c] = Math.min(1, W.nutrientPlume[c] + amt * 14);
    _plumeTouched.add(c);
  }
  // A small direct pulse so the bloom shows up this tick, not three ticks later.
  W.life[c] = Math.min(1, W.life[c] + amt * 0.25);
}

/** Plumes fade. Sparse: only the cells a plume was written to are visited. */
function plumeDecay() {
  if (!W.nutrientPlume) { _plumeTouched.clear(); return; }
  let live = 0;
  for (const c of _plumeTouched) {
    const v = W.nutrientPlume[c] * 0.94;
    if (v > 0.004) { W.nutrientPlume[c] = v; live++; }
    else { W.nutrientPlume[c] = 0; _plumeTouched.delete(c); }
  }
  W.plumeCells = live;
}

function stageLabel(b) {
  if (b >= 0.85) return 'city';
  if (b >= 0.55) return 'town';
  if (b >= 0.3) return 'village';
  return 'camp';
}

export function agentsTick(log = null) {
  const rng = rngOf(W, 'rngAgents');
  if (ENT.n === 0) {
    respawnEntities();
    return;
  }
  /* Cadence used to be `W.year % 4000` and `W.year % 40`, which on the pinned
     Earth is a constant divisible by both — so top-up and the settlement scan
     ran every single tick, and on a fast clock they ran never. A tick counter
     costs one integer and means the same thing on every world. */
  const tick = (W._agentTick = (W._agentTick | 0) + 1);
  if (tick % 64 === 0) topUpEntities();
  compactDead();
  rebuildBuckets();

  let buildsDirty = false;
  let built = 0;
  let plumeFed = 0;
  let herdBest = 0, herdCell = -1, herdKind = -1;

  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    m.age++;
    let c = m.cell;
    m.behav = pickBehav(m, c, rng);

    if (m.kind === 5 && W.h[c] >= W.seaLevel && W.ice[c] < 0.35 && W.life[c] > 0.15) {
      const before = W.build[c];
      const rate = (0.022 + W.life[c] * 0.035 + (W.unlockedClass >= 5 ? 0.015 : 0))
        * (isPinnedEarth(W.rule) ? 0.12 : 1);
      // The 0.55 ceiling is what kept an Earth-like world from ever reaching the
      // 0.85 `city` stage. It belongs to the pinned Earth, not to Earth.
      W.build[c] = Math.min(isPinnedEarth(W.rule) ? 0.55 : 1, before + rate);
      if (W.build[c] - before > 0.001) {
        buildsDirty = true;
        built++;
        m.age = Math.max(m.age, 1);
      }
      const stages = [0.3, 0.55, 0.85];
      for (const t of stages) {
        if (before < t && W.build[c] >= t) {
          const who = m.name || 'Settlers';
          logEvent(W.chron, W.year, 'build', c, W.build[c],
            `${who} founded a ${stageLabel(W.build[c])}`);
        }
      }
    } else if (W.h[c] >= W.seaLevel && W.life[c] < 0.08 && W.build[c] > 0) {
      W.build[c] = Math.max(0, W.build[c] - 0.004);
      if (W.build[c] > 0) buildsDirty = true;
    }

    /* Colonisation front. The old settler score was `build × 1.2`, so a settler
       standing in a finished city had the best cell on the planet and never
       left: settled area stopped growing about twenty ticks after the first
       village and the night side stopped changing. Once a cell is built out the
       attractive neighbour is the unbuilt fertile one — which is a frontier
       rather than a permanent camp, and is what makes the lights spread. */
    const buildCap = isPinnedEarth(W.rule) ? 0.55 : 1;
    const frontier = m.kind === 5 && W.build[c] > buildCap * 0.85;
    let best = c;
    let score = m.kind === 5
      ? (frontier
        ? W.life[c] * 1.2 + W.moist[c] * 0.3 - W.ice[c] - W.build[c] * 0.9
        : W.build[c] * 1.2 + W.life[c] * 0.5 - W.ice[c])
      : W.life[c] + W.moist[c] * 0.3 - W.ice[c] * 0.5;

    /* Cohesion, separation and — new — alignment. Without an alignment term a
       clump has no heading: eight animals in one cell each step toward the
       centroid and the group mills. Averaging neighbours' heading vectors gives
       the group one direction, which is what reads on screen as a herd rather
       than as a crowd. Kinds 6 and 7 are the large land animals; 14 and 15 are
       marine. `herd` is published so the chronicle can name a big one. */
    if (m.kind === 6 || m.kind === 14 || m.kind === 15 || m.kind === 7) {
      let cx = 0, cy = 0, cz = 0, nF = 0;
      let sx = 0, sy = 0, sz = 0, nS = 0;
      let ax = 0, ay = 0, az = 0;
      eachNearby(c, (j) => {
        if (j === i || nF >= 8) return;
        const o = ENT.meta[j];
        if (!o || o.dead || o.kind !== m.kind) return;
        if (cellDot(c, o.cell) < 0.92) return;
        cx += DIR[o.cell * 3]; cy += DIR[o.cell * 3 + 1]; cz += DIR[o.cell * 3 + 2];
        ax += o.hx || 0; ay += o.hy || 0; az += o.hz || 0;
        nF++;
        if (o.cell === c) {
          sx += DIR[o.cell * 3]; sy += DIR[o.cell * 3 + 1]; sz += DIR[o.cell * 3 + 2];
          nS++;
        }
      });
      m.herd = nF + 1;
      if (nF > 0) {
        cx /= nF; cy /= nF; cz /= nF;
        if (nS > 1) { cx -= sx * 0.35; cy -= sy * 0.35; cz -= sz * 0.35; }
        // Cohesion as a tangent: where the centroid is relative to me, not
        // where it is on the sphere. Alignment is already a tangent.
        let gx = cx - DIR[c * 3], gy = cy - DIR[c * 3 + 1], gz = cz - DIR[c * 3 + 2];
        const al = Math.hypot(ax, ay, az);
        if (al > 1e-6) {
          const w = (m.kind === 6 || m.kind === 7) ? 1.5 : 0.9;
          gx += (ax / al) * w * 0.02;
          gy += (ay / al) * w * 0.02;
          gz += (az / al) * w * 0.02;
        }
        // Panic overrides the flock: run away from the fire, together.
        if (m.behav === 'flee') {
          gx += (m.hx || 0) * 1.2; gy += (m.hy || 0) * 1.2; gz += (m.hz || 0) * 1.2;
        }
        let bestF = c, bestDot = -2;
        for (let k = 0; k < 4; k++) {
          const nb = NBR[c * 4 + k];
          const dot = (DIR[nb * 3] - DIR[c * 3]) * gx
            + (DIR[nb * 3 + 1] - DIR[c * 3 + 1]) * gy
            + (DIR[nb * 3 + 2] - DIR[c * 3 + 2]) * gz;
          if (dot > bestDot) { bestDot = dot; bestF = nb; }
        }
        const stride = m.stride || 1;
        const urge = m.behav === 'flee' ? 0.85 : 0.25;
        if (bestF !== c && bestDot > 0 && rng() < urge * Math.min(2, stride)) best = bestF;
        if (m.herd > herdBest) { herdBest = m.herd; herdCell = c; herdKind = m.kind; }
      }
    }

    /* Surface feeding writes a nutrient plume. A whale-scale animal working a
       productive patch fertilises it: iron and nitrogen brought up from depth
       and released at the surface where the light is. Small bump, small
       neighbourhood, decayed by `plumeDecay` — enough for a brief bloom. */
    if (m.behav === 'surface' && W.h[c] < W.seaLevel) {
      const mass = m.plan ? Math.min(2.5, m.plan.size || 1) : 1.2;
      const amt = 0.012 * mass;
      bumpNutrient(c, amt);
      for (let k = 0; k < 4; k++) bumpNutrient(NBR[c * 4 + k], amt * 0.45);
      plumeFed++;
    }

    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      let s = m.kind === 5
        ? (frontier
          ? W.life[n] * 1.2 + W.moist[n] * 0.3 - W.ice[n] - W.build[n] * 0.9 + rng() * 0.08
          : W.build[n] * 1.2 + W.life[n] * 0.5 - W.ice[n] + rng() * 0.08)
        : W.life[n] + W.moist[n] * 0.3 - W.ice[n] * 0.5 + rng() * 0.05;
      if (m.behav === 'flee') s -= (W.ash?.[n] || 0) * 2 + (W.dust?.[n] || 0) * 1.5 + (W.stormField?.[n] || 0);
      if (m.behav === 'rest') s -= 0.4;
      if (s > score) { score = s; best = n; }
    }
    // A stampede is a herd that moves faster than it forages. Fire in the cell
    // or in reach pushes the whole clump, because they share a heading.
    const nearFire = (W.fire?.[c] || 0)
      + (W.fire ? Math.max(
        W.fire[NBR[c * 4]], W.fire[NBR[c * 4 + 1]],
        W.fire[NBR[c * 4 + 2]], W.fire[NBR[c * 4 + 3]],
      ) * 0.6 : 0);
    const panic = m.behav === 'flee' || nearFire > 0.08;
    const moveChance = m.behav === 'rest' ? 0.06
      : panic ? (m.herd > 3 ? 0.92 : 0.7)
      : m.kind === 5 ? (frontier ? 0.45 : W.build[c] > 0.25 ? 0.12 : 0.35)
      : m.behav === 'surface' ? 0.22
      : 0.4;
    if (best !== c && rng() < moveChance) {
      noteWear(c, 0.09);
      noteWear(best, 0.05);
      m.prevCell = c;
      m.heading = headingOf(c, best);
      // Tangent heading, smoothed so a herd keeps a direction across a turn.
      const dx = DIR[best * 3] - DIR[c * 3];
      const dy = DIR[best * 3 + 1] - DIR[c * 3 + 1];
      const dz = DIR[best * 3 + 2] - DIR[c * 3 + 2];
      const dl = Math.hypot(dx, dy, dz) || 1;
      m.hx = (m.hx || 0) * 0.55 + (dx / dl) * 0.45;
      m.hy = (m.hy || 0) * 0.55 + (dy / dl) * 0.45;
      m.hz = (m.hz || 0) * 0.55 + (dz / dl) * 0.45;
      m.arriveAt = presentTime() + Math.max(0.18, 0.28 / Math.max(0.4, m.stride || 1));
      m.cell = best;
      c = best;
      const destNode = lineageAt(W, c);
      const prevPopId = m.popId ?? 0;
      if (destNode?.id !== prevPopId) {
        m.popId = destNode?.id ?? 0;
        m.cladeName = destNode?.name ?? null;
      }
      /* Kind used to be re-derived from the destination cell on every step, so a
         grazer that walked into a forest cell was redrawn as a tree and the herd
         dissolved into scenery within a few ticks. Vegetation sprites should
         track the biome they stand in; an animal is an animal wherever it goes. */
      let kind = m.kind;
      if (!isAnimalKind(m.kind)) {
        const nk = kindForCell(c, rng);
        if (nk >= 0) kind = nk;
        m.kind = kind;
      }
      writePos(i, c);
      ENT.data[i * 8 + 4] = kind;
      if (destNode?.id !== prevPopId && destNode?.traits) {
        const env = { O2: W.gases?.O2 ?? 0.21, gravity: W.rule?.gravity ?? 1 };
        const newPlan = planOf(destNode, env);
        if (passesSilhouette(newPlan)) {
          m.plan = newPlan;
          m.stride = newPlan.stride || 1;
        }
      }
    } else if (m.kind === 5) {
      writePos(i, c);
    }

    if (m.kind === 7 && W.rule.signature === 'worms') {
      W.h[c] = Math.max(-1, W.h[c] - 0.002);
      W.sediment[NBR[c * 4]] = Math.min(1, W.sediment[NBR[c * 4]] + 0.01);
    }

    if (W.life[c] < 0.04 && m.kind < 10 && rng() < 0.12) {
      m.dead = true;
      m.cause = W.ice[c] > 0.4 ? 'ice' : (W.temp[c] > 0.75 ? 'heat' : 'starved');
      m.died = W.year;
      if (m.name) {
        logEvent(W.chron, W.year, 'death', c, 0.2,
          `${m.name} ${m.cause}`, { who: m.name, cause: m.cause, born: m.born });
      }
    }
  }

  W.buildersActive = built;
  W.surfaceFeeders = plumeFed;
  W.herdMax = herdBest;
  if (buildsDirty) W._buildsDirty = true;
  plumeDecay();
  if (tick % 4 === 0) {
    settleCities(W);
    // Night lights are sim state now, not something the renderer computes on a
    // frame the sim did not run. `render.js` reads `W._cityLights`.
    W._cityLights = cityLights(W);
  }
  /* Name a big group once. A herd worth naming is a herd the chronicle can
     refer to later; below the threshold it is just animals standing near
     animals and does not deserve a line. */
  if (log && herdBest >= 8 && herdCell >= 0 && tick - (W._herdNamedTick | 0) > 120) {
    W._herdNamedTick = tick;
    const what = herdKind === 14 || herdKind === 15 ? 'pod' : 'herd';
    log(W.year, 'herd', herdCell, herdBest / 20,
      `A ${what} of ${herdBest} moves together`);
  }
  if (ENT.n < capForWorld() * 0.45) topUpEntities();
}

export function followTarget() {
  for (let i = 0; i < ENT.n; i++) {
    if (ENT.meta[i]?.kind === 5 && ENT.meta[i]?.name && !ENT.meta[i].dead) return ENT.meta[i];
  }
  for (let i = 0; i < ENT.n; i++) {
    if (ENT.meta[i]?.name && !ENT.meta[i].dead) return ENT.meta[i];
  }
  return null;
}

/** Save every live individual — cell, kind, age, lineage, name, behaviour. */
export function packEntities() {
  const list = [];
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    list.push({
      id: m.id,
      cell: m.cell,
      kind: m.kind,
      age: m.age,
      name: m.name,
      popId: m.popId,
      cladeName: m.cladeName,
      behav: m.behav,
      hx: m.hx,
      hy: m.hy,
      hz: m.hz,
      herd: m.herd,
      born: m.born,
      bornCell: m.bornCell,
      heading: m.heading,
      stride: m.stride,
      prevCell: m.prevCell,
    });
  }
  return { seq: _idSeq, list };
}

/** Reload a packed population after `generate` + terrain restore. */
export function restoreEntities(packed) {
  resetAgents();
  if (!packed?.list?.length) return 0;
  let maxId = packed.seq || 0;
  let n = 0;
  for (const rec of packed.list) {
    if (n >= MAX_ENT) break;
    ENT.meta[n] = {
      id: rec.id,
      cell: rec.cell,
      kind: rec.kind,
      age: rec.age ?? 0,
      name: rec.name ?? null,
      born: rec.born ?? W.year,
      bornCell: rec.bornCell ?? rec.cell,
      plan: null,
      popId: rec.popId ?? 0,
      cladeName: rec.cladeName ?? null,
      stride: rec.stride ?? 1,
      heading: rec.heading ?? 0,
      hx: rec.hx ?? 0,
      hy: rec.hy ?? 0,
      hz: rec.hz ?? 0,
      herd: rec.herd ?? 0,
      prevCell: rec.prevCell ?? rec.cell,
      arriveAt: null,
      behav: rec.behav ?? 'forage',
      dead: false,
      cause: null,
    };
    writePos(n, rec.cell);
    const o = n * 8;
    const rgb = KIND_RGB[rec.kind] || [200, 200, 200];
    ENT.data[o + 3] = rec.kind === 7 ? 0.036 : rec.kind === 5 ? 0.02 : 0.015;
    ENT.data[o + 4] = rec.kind;
    ENT.data[o + 5] = rgb[0] / 255;
    ENT.data[o + 6] = rgb[1] / 255;
    ENT.data[o + 7] = rgb[2] / 255;
    maxId = Math.max(maxId, rec.id || 0);
    n++;
  }
  ENT.n = n;
  _idSeq = maxId + 1;
  return n;
}
