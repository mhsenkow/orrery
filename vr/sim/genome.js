/** The genome: an open, serialisable description of a body, and the operators that change it.
 *
 *  A genome is plain JSON. It holds categorical axes, counted axes (integers, so a body can
 *  be pentaradial or thirty-one-segmented rather than picking from an enum somebody wrote),
 *  a variable-length list of organs with counts and receptor bands, and a biochemistry.
 *  Expression turns that into a body plan; nothing downstream of expression may decide what a
 *  creature is.
 *
 *  The mutation operators are the ones that actually generate morphological novelty in the
 *  record — duplication, divergence, loss, and whole-genome duplication — not a Gaussian on
 *  a fixed-length vector.
 */

import { AXES, INTEGERS, ORGANS, ORGAN_BY_ID, BANDS, BAND_BY_ID, BIOCHEM, GRAMMAR_VERSION } from './lifeGrammar.js';
import { bandViability, apertureFromSize, viableBands } from './sensory.js';
import { clamp } from '../math.js';

const AXIS_BY_ID = Object.fromEntries(AXES.map((a) => [a.id, a]));
const INT_BY_ID = Object.fromEntries(INTEGERS.map((a) => [a.id, a]));

/** The ancestral body: goo at a vent. Every genome on every world starts here. */
export function blankGenome() {
  const axes = {};
  for (const a of AXES) axes[a.id] = a.ancestral;
  const n = {};
  for (const a of INTEGERS) n[a.id] = a.ancestral;
  return {
    v: GRAMMAR_VERSION,
    axes,
    n,
    organs: [],
    biochem: { solvent: 'water', polymer: 'rna', carrier: 'protonGradient', chirality: 'L', membrane: 'mineralCompartment' },
    locks: { axes: {}, n: {} },
    firsts: [],
    // Development lives next to the genome because the same DNA makes different
    // bodies when the clock and the Hox map change.
    devo: blankDevo(),
    load: 0,
    neutralClock: 0,
  };
}

export function blankDevo() {
  return {
    somitePeriod: 1,
    wavefront: 1,
    hox: ['head'],
    appendageOf: ['none'],
    heterochrony: 1,
    canalisation: 0.5,
    regul: [0.5, 0.5, 0.5],
    larval: 'direct',
  };
}

export function cloneGenome(g) {
  return {
    v: g.v,
    axes: { ...g.axes },
    n: { ...g.n },
    organs: g.organs.map((o) => ({ ...o })),
    biochem: { ...g.biochem },
    locks: { axes: { ...g.locks.axes }, n: { ...g.locks.n } },
    firsts: g.firsts.slice(),
    devo: g.devo ? {
      ...g.devo,
      hox: (g.devo.hox || []).slice(),
      appendageOf: (g.devo.appendageOf || []).slice(),
      regul: (g.devo.regul || [0.5, 0.5, 0.5]).slice(),
    } : blankDevo(),
    load: g.load || 0,
    neutralClock: g.neutralClock || 0,
  };
}

/* ------------------------------------------------------------ requirements -- */

export function hasOrgan(g, id) {
  return g.organs.some((o) => o.id === id && o.count > 0);
}

export function organCount(g, id) {
  return g.organs.find((o) => o.id === id)?.count || 0;
}

/** Can this genome carry this organ at all — prerequisites only, no environment. */
export function organAllowed(g, organ) {
  const need = organ.needs || {};
  for (const dep of need.organs || []) if (!hasOrgan(g, dep)) return false;
  for (const [axis, allowed] of Object.entries(need.axes || {})) {
    if (!allowed.includes(g.axes[axis])) return false;
  }
  for (const [key, [lo, hi]] of Object.entries(need.integers || {})) {
    const v = g.n[key] ?? 0;
    if (v < lo || v > hi) return false;
  }
  return true;
}

/** How many copies of an organ this body's own geometry gives it. Three eyes is not a
 *  special case here — it is what a triradial body with one eye per ray has. */
export function organCountFor(g, organ) {
  if (organ.countFrom === 'fixed') return organ.count || 1;
  if (organ.countFrom === 'symmetry') {
    const s = g.n.symmetryOrder | 0;
    const base = s === 0 ? 1 : s === 1 ? 2 : s;      // bilateral means a pair
    return Math.min(organ.countMax || 12, base);
  }
  if (organ.countFrom === 'segments') {
    const seg = Math.max(1, g.n.expressingSegments || g.n.segments || 1);
    return Math.min(organ.countMax || 64, seg);
  }
  return 1;
}

/* ---------------------------------------------------------------- mutation -- */

const pick = (rng, arr) => arr[Math.min(arr.length - 1, (rng() * arr.length) | 0)];

/** Lock probability rises with clade age and falls with population size —
 *  drift can still break a constraint in a small population. */
export function lockChance(tauMyr, ageMyr, popN) {
  if (!tauMyr) return 0;
  return clamp(ageMyr / tauMyr, 0, 0.95) * (1 - 1 / Math.sqrt(Math.max(1, popN)));
}

export function hardenGenome(g, ageMyr, popN, rng) {
  for (const a of AXES) {
    if (g.locks.axes[a.id]) continue;
    if (rng() < lockChance(a.lockTauMyr, ageMyr, popN) * 0.02) g.locks.axes[a.id] = 1;
  }
  for (const a of INTEGERS) {
    if (g.locks.n[a.id] || !a.lockTauMyr) continue;
    if (rng() < lockChance(a.lockTauMyr, ageMyr, popN) * 0.02) g.locks.n[a.id] = 1;
  }
}

/** One mutation. Returns the operator name applied, or null if nothing moved.
 *  `env` is the lineage's own environment — it decides which organs are worth gaining
 *  and which receptor bands a duplicate can diverge into. */
export function genomeModuleCap(g) {
  const p = g.biochem?.polymer;
  if (p === 'rna') return 6;
  if (p === 'tna' || p === 'pna') return 10;
  return 24;
}

export function genomeCopyCost(g) {
  const n = (g.organs?.length || 0) + (g.n?.segments || 1) * 0.15;
  return 0.03 * n;
}

/** Somite number is a clock ratio, not an integer someone typed. */
export function tickDevo(g, rng) {
  const d = g.devo || (g.devo = blankDevo());
  if (rng() < 0.08 && !g.locks.n.segments) {
    d.somitePeriod = clamp(d.somitePeriod * (rng() < 0.5 ? 0.9 : 1.1), 0.2, 4);
  }
  if (rng() < 0.08 && !g.locks.n.segments) {
    d.wavefront = clamp(d.wavefront * (rng() < 0.5 ? 0.9 : 1.1), 0.2, 8);
  }
  const segs = clamp(Math.round(d.wavefront / Math.max(0.2, d.somitePeriod)), 1, 64);
  g.n.segments = segs;
  g.n.expressingSegments = Math.min(g.n.expressingSegments, segs);
  while (d.hox.length < segs) {
    const last = d.hox[d.hox.length - 1] || 'trunk';
    const next = last === 'head' ? 'trunk' : last === 'trunk' ? 'tail' : last;
    d.hox.push(rng() < 0.2 ? pick(rng, ['head', 'trunk', 'tail', 'gill', 'limb']) : next);
  }
  d.hox.length = segs;
  while (d.appendageOf.length < segs) {
    const id = d.hox[d.appendageOf.length];
    d.appendageOf.push(id === 'limb' ? 'leg' : id === 'gill' ? 'gill' : id === 'head' ? 'antenna' : 'none');
  }
  d.appendageOf.length = segs;
  if (rng() < 0.04) d.heterochrony = clamp(d.heterochrony + (rng() - 0.5) * 0.2, 0.3, 1.6);
  if (rng() < 0.03) d.canalisation = clamp(d.canalisation + (rng() - 0.5) * 0.1, 0.1, 0.95);
  g.neutralClock = (g.neutralClock || 0) + 1;
  return segs;
}

export function limbsFromHox(g) {
  const d = g.devo;
  const sym = g.n.symmetryOrder | 0;
  if (!d?.appendageOf?.length) {
    const expressing = clamp(g.n.expressingSegments | 0, 0, Math.max(1, g.n.segments | 0));
    return sym >= 2 ? sym * Math.max(1, g.n.appendagePairs | 0) : expressing * (g.n.appendagePairs | 0) * 2;
  }
  let n = 0;
  for (let i = 0; i < d.appendageOf.length; i++) {
    if (d.appendageOf[i] === 'none') continue;
    n += sym >= 2 ? Math.max(1, sym) : 2;
  }
  return n;
}

export function recombineGenomes(a, b, rng) {
  const out = cloneGenome(a);
  for (const ax of AXES) {
    if (rng() < 0.5) out.axes[ax.id] = b.axes[ax.id];
  }
  for (const n of INTEGERS) {
    if (rng() < 0.5) out.n[n.id] = b.n[n.id];
  }
  if (rng() < 0.5) out.biochem = { ...b.biochem };
  if (b.organs.length && rng() < 0.4) {
    const o = pick(rng, b.organs);
    if (!hasOrgan(out, o.id)) out.organs.push({ ...o });
  }
  out.load = Math.max(0, ((a.load || 0) + (b.load || 0)) * 0.4);
  return out;
}

export function transferOrgan(from, to, rng) {
  if (!from?.organs?.length) return false;
  const o = pick(rng, from.organs);
  if (!hasOrgan(to, o.id)) {
    to.organs.push({ id: o.id, count: 1, band: o.band });
    return true;
  }
  return false;
}

export function diffGenomes(a, b) {
  const rows = [];
  if (!a || !b) return rows;
  for (const ax of AXES) {
    if (a.axes[ax.id] !== b.axes[ax.id]) rows.push({ k: ax.id, from: a.axes[ax.id], to: b.axes[ax.id] });
  }
  for (const n of INTEGERS) {
    if ((a.n[n.id] | 0) !== (b.n[n.id] | 0)) rows.push({ k: n.id, from: a.n[n.id], to: b.n[n.id] });
  }
  return rows;
}

export function mutateGenome(g, rng, env = {}) {
  if (!g.devo) g.devo = blankDevo();
  if (rng() < 0.25) tickDevo(g, rng);

  // An unused sense is a cost. Losing it is an improvement, not a coin flip.
  if (g.organs.length && env && rng() < 0.12) {
    const useless = g.organs.filter((o) => {
      const rec = ORGAN_BY_ID[o.id];
      if (rec?.class !== 'sensor') return false;
      const band = rec.band === 'any' ? o.band : rec.band;
      if (!band) return false;
      const v = bandViability(band, env);
      return !v.ok || (v.score != null && v.score < 0.08);
    });
    if (useless.length) {
      const o = pick(rng, useless);
      const idx = g.organs.indexOf(o);
      o.count--;
      if (o.count <= 0) g.organs.splice(idx, 1);
      return 'loss';
    }
  }

  // Polymer cap: RNA cannot hold a large module list (Eigen).
  if (g.organs.length > genomeModuleCap(g) && rng() < 0.5) {
    g.organs.pop();
    g.load = (g.load || 0) + 0.02;
    return 'loss';
  }

  const roll = rng();

  // Loss is the commonest evolutionary event, and it is the one nobody models.
  if (roll < 0.16 && g.organs.length) {
    const idx = (rng() * g.organs.length) | 0;
    const o = g.organs[idx];
    o.count--;
    if (o.count <= 0) g.organs.splice(idx, 1);
    return 'loss';
  }

  // Duplication — free copies are where new organs come from.
  if (roll < 0.30 && g.organs.length) {
    const o = pick(rng, g.organs);
    const cap = organCountFor(g, ORGAN_BY_ID[o.id] || { countFrom: 'fixed' });
    if (o.count < cap) { o.count++; return 'duplication'; }
  }

  // Divergence — a duplicate sensor retunes to another band. This is opsin evolution.
  if (roll < 0.42) {
    const sensors = g.organs.filter((o) => (ORGAN_BY_ID[o.id]?.class === 'sensor') && o.count > 1);
    if (sensors.length) {
      const o = pick(rng, sensors);
      const organ = ORGAN_BY_ID[o.id];
      if (organ.band === 'any') {
        const options = (env.bands || viableBands(env)).filter((b) => BAND_BY_ID[b.id]?.detector === 'pigment');
        if (options.length) {
          const to = pick(rng, options).id;
          if (to !== o.band) {
            g.organs.push({ id: o.id, count: 1, band: to });
            o.count--;
            return 'divergence';
          }
        }
      }
    }
  }

  // Gain — any organ whose prerequisites are met and whose band this world delivers.
  if (roll < 0.60) {
    const candidates = ORGANS.filter((o) => !hasOrgan(g, o.id) && organAllowed(g, o));
    if (candidates.length) {
      const organ = pick(rng, candidates);
      const band = organ.band && organ.band !== 'any'
        ? organ.band
        : bestPigmentBand(env);
      if (organ.band && organ.band !== 'any') {
        const v = bandViability(organ.band, env);
        if (!v.ok) return null;                      // the world does not deliver it
      }
      g.organs.push({ id: organ.id, count: 1, band });
      return 'gain';
    }
    return null;
  }

  // Counted axes — ±1, except segments, which double by duplication.
  if (roll < 0.82) {
    const free = INTEGERS.filter((a) => !g.locks.n[a.id]);
    if (!free.length) return null;
    const a = pick(rng, free);
    const cur = g.n[a.id] ?? a.ancestral;
    let next;
    if (a.id === 'segments' && rng() < 0.25) next = cur * 2;
    else next = cur + (rng() < 0.5 ? -1 : 1);
    g.n[a.id] = clamp(Math.round(next), a.min, a.max);
    // Expressing segments can never exceed the segments that exist.
    g.n.expressingSegments = Math.min(g.n.expressingSegments, g.n.segments);
    return g.n[a.id] === cur ? null : `count:${a.id}`;
  }

  // Categorical axes — one step along the list, because a body cannot skip a grade.
  if (roll < 0.985) {
    const free = AXES.filter((a) => !g.locks.axes[a.id]);
    if (!free.length) return null;
    const a = pick(rng, free);
    const i = a.list.indexOf(g.axes[a.id]);
    const step = rng() < 0.5 ? -1 : 1;
    const j = clamp(i + step, 0, a.list.length - 1);
    if (i === j) return null;
    g.axes[a.id] = a.list[j];
    return `axis:${a.id}`;
  }

  // Whole-genome duplication. Rare, and it unlocks everything for one step, which is
  // why polyploidy events sit under so many radiations.
  g.n.ploidy = clamp(g.n.ploidy * 2, 1, 8);
  g.locks.axes = {};
  g.locks.n = {};
  return 'wgd';
}

function bestPigmentBand(env) {
  const list = env.bands || viableBands(env);
  const pig = list.find((b) => BAND_BY_ID[b.id]?.detector === 'pigment');
  return pig?.id || list[0]?.id || 'green';
}

/* -------------------------------------------------------------- expression -- */

const RADIAL_LOCOMOTION = new Set(['ambulacral', 'jet', 'drift', 'sessile', 'cilia', 'peristaltic']);

/** Turn a genome into the plan a renderer, a sprite and a name can all read.
 *  This is the only function allowed to decide what a creature looks like. */
export function expressBodyPlan(g, env = {}) {
  const O2 = env.O2 ?? 0.21;
  const grav = env.gravity ?? 1;
  const sym = g.n.symmetryOrder | 0;
  const segments = Math.max(1, g.n.segments | 0);
  const expressing = clamp(g.n.expressingSegments | 0, 0, segments);

  // Limbs from Hox identity when present, else segments × pairs × symmetry.
  const limbs = limbsFromHox(g);

  // Mass: log10 grams offset by 4, then the two physical corrections that actually
  // move a size distribution — oxygen supply and gravity's square–cube tax.
  const grams = Math.pow(10, clamp(g.n.sizeClass, 0, 14) - 4);
  const het = g.devo?.heterochrony ?? 1;
  let size = Math.cbrt(Math.max(1e-9, grams)) * 0.14 * het;
  size *= clamp(0.55 + O2 * 1.4, 0.5, 1.7);
  size *= clamp(1.15 / Math.sqrt(Math.max(0.2, grav)), 0.65, 1.9);

  const eyes = [];
  let massLoad = 0, powerLoad = 0;
  for (const o of g.organs) {
    const rec = ORGAN_BY_ID[o.id];
    if (!rec) continue;
    massLoad += (rec.cost?.massFrac || 0) * o.count;
    powerLoad += (rec.cost?.powerFrac || 0) * o.count;
    if (rec.class === 'sensor') {
      const band = rec.band === 'any' ? (o.band || 'green') : rec.band;
      const rb = BAND_BY_ID[band];
      if (rb?.imaging) eyes.push({ organ: o.id, band, count: o.count });
    }
  }

  const eyeCount = eyes.reduce((n, e) => n + e.count, 0);
  const stride = Math.pow(Math.max(1e-6, grams), -1 / 6) * 6 * (0.6 + (g.n.appendagePairs ? 0.6 : 0.2));

  const plan = {
    grammar: g.v,
    symmetry: symmetryLabel(sym),
    symmetryOrder: sym,
    segments,
    limbs: clamp(limbs, 0, 64),
    digits: g.n.digits | 0,
    eyes,
    eyeCount,
    size: clamp(size, 0.2, 4.5),
    massG: grams,
    stride: clamp(stride, 0.25, 5),
    gait: gaitOf(g, limbs),
    habitat: g.axes.habitat,
    skeleton: g.axes.skeleton,
    integument: g.axes.integument,
    trophic: g.axes.trophic,
    armour: armourOf(g),
    pigmentBias: pigmentBiasOf(g, eyes),
    massLoad,
    powerLoad,
    metabolicLoad: clamp(powerLoad + genomeCopyCost(g), 0, 1.6),
    silhouette: silhouetteKey(g, limbs, sym),
    spriteKind: spriteFromGenome(g, limbs, sym),
    gravity: grav,
    hox: g.devo?.hox || [],
    appendageOf: g.devo?.appendageOf || [],
  };
  const buoyant = (env.fluidDensity ?? 1000) > 800 && g.axes.habitat !== 'terrestrial';
  if (!buoyant && g.axes.skeleton === 'none' && g.n.sizeClass > 4) {
    plan.viable = false;
  } else {
    plan.viable = plan.metabolicLoad < 1 && massLoad < 0.6;
  }
  return plan;
}

function symmetryLabel(n) {
  const a = INT_BY_ID.symmetryOrder;
  return a?.labels?.[String(n)] || `${n}-fold radial`;
}

function gaitOf(g, limbs) {
  const loco = g.axes.locomotion;
  if (loco === 'sessile') return 'anchored';
  if (loco === 'ambulacral') return 'tube-foot creep';
  if (loco === 'peristaltic') return 'peristaltic';
  if (loco === 'undulation') return 'undulating';
  if (loco === 'erectGait') return limbs >= 4 ? 'erect stride' : 'bipedal stride';
  if (loco === 'limbed') return limbs >= 6 ? 'sprawling wave' : 'sprawl';
  if (loco === 'wing' || loco === 'balloon') return 'airborne';
  if (loco === 'jet') return 'jet pulse';
  if (loco === 'rolling') return 'rolling';
  if (loco === 'screw') return 'screw drive';
  return 'drifting';
}

function armourOf(g) {
  const s = g.axes.skeleton, i = g.axes.integument;
  let a = 0;
  if (['calciteShell', 'aragoniteShell', 'chitinExo', 'ironSclerite', 'silicaSpicule'].includes(s)) a += 0.55;
  if (['carapace', 'keratinPlate', 'scale', 'silicaArmour'].includes(i)) a += 0.35;
  if (s === 'bone' || s === 'pneumaticBone') a += 0.2;
  return clamp(a, 0, 1);
}

/** Body colour bias follows the band the eyes are tuned to, because signalling
 *  colours are only worth making in a band somebody can see. */
function pigmentBiasOf(g, eyes) {
  if (!eyes.length) return 0.5;
  let sum = 0, n = 0;
  for (const e of eyes) {
    const b = BAND_BY_ID[e.band];
    if (!b?.lamMinNm) continue;
    const mid = Math.sqrt(b.lamMinNm * b.lamMaxNm);
    sum += clamp((Math.log10(mid) - 2.4) / 1.2, 0, 1) * e.count;
    n += e.count;
  }
  return n ? clamp(sum / n, 0, 1) : 0.5;
}

function silhouetteKey(g, limbs, sym) {
  if (sym === 0 && !g.organs.length) return 'goo';
  if (g.axes.locomotion === 'sessile') return sym >= 3 ? 'crown' : 'mat';
  if (sym >= 3 && limbs >= 3) return `radial${sym}`;
  if (g.axes.locomotion === 'wing') return 'winged';
  if (limbs === 0) return g.axes.locomotion === 'undulation' ? 'serpent' : 'nekton';
  if (limbs >= 12) return 'myriapod';
  if (limbs >= 6) return 'hexapod';
  return 'tetrapod';
}

/** Map onto the 16-sprite atlas until the procedural silhouette lands. */
function spriteFromGenome(g, limbs, sym) {
  const t = g.axes.trophic;
  if (g.axes.locomotion === 'sessile') return t === 'phototroph' ? 0 : 14;
  if (sym === 0) return 9;
  if (g.axes.habitat === 'pelagic' || g.axes.habitat === 'abyssal') return 15;
  if (sym >= 3) return 14;
  if (limbs >= 6) return 3;
  if (t === 'predator' || t === 'apexPredator') return 7;
  if (t === 'phototroph') return limbs ? 2 : 0;
  if (g.n.sizeClass >= 9) return 5;
  return 1;
}

/* -------------------------------------------------------- fitness modifiers -- */

/** Convergence is allowed and paid for. Each rule multiplies fitness; the product
 *  is what makes a gilled land animal possible and expensive rather than illegal. */
const INCOMPATIBLE = [
  { when: (g) => g.axes.habitat === 'terrestrial' && ['gill', 'countercurrentGill', 'bookGill'].includes(g.axes.respiration),
    mult: 0.25, why: 'gill lamellae collapse in air', tag: 'measured' },
  { when: (g) => g.axes.habitat === 'terrestrial' && g.axes.reproduction === 'broadcastSpawn',
    mult: 0.55, why: 'gametes desiccate', tag: 'measured' },
  { when: (g) => g.axes.habitat === 'aerial' && g.axes.skeleton === 'bone',
    mult: 0.5, why: 'solid bone is too heavy to fly on', tag: 'fitted' },
  { when: (g) => g.axes.respiration === 'trachea' && g.n.sizeClass > 6,
    mult: 0.3, why: 'tracheal diffusion cannot supply a large body', tag: 'measured' },
  { when: (g) => g.axes.habitat === 'terrestrial' && g.axes.skeleton === 'hydrostatic' && g.n.sizeClass > 7,
    mult: 0.3, why: 'no compressive support out of water', tag: 'measured' },
  { when: (g) => g.axes.locomotion === 'ambulacral' && g.axes.habitat === 'aerial',
    mult: 0.05, why: 'tube feet need a substrate and a water vascular system', tag: 'measured' },
  { when: (g) => g.n.symmetryOrder >= 3 && ['predator', 'apexPredator'].includes(g.axes.trophic),
    mult: 0.7, why: 'a radial body has no front to chase with', tag: 'fitted' },
  { when: (g) => g.axes.thermal === 'endotherm' && g.n.sizeClass < 3,
    mult: 0.45, why: 'surface-to-volume makes a tiny endotherm starve', tag: 'measured' },
  { when: (g) => g.axes.habitat === 'cryobrine' && !hasOrgan(g, 'cryoprotectantGland'),
    mult: 0.4, why: 'ice nucleates inside the cells', tag: 'measured' },
  { when: (g) => g.axes.trophic === 'phototroph'
      && ['ventBenthic', 'abyssal', 'fossorial', 'endolithic', 'hostBody'].includes(g.axes.habitat),
    mult: 0.08, why: 'no photons reach that habitat', tag: 'measured' },
  { when: (g) => g.axes.trophic === 'filter' && g.axes.habitat === 'terrestrial',
    mult: 0.3, why: 'air carries a thousandth of the suspended food water does', tag: 'measured' },
  { when: (g) => g.axes.locomotion === 'wing' && g.n.sizeClass > 11,
    mult: 0.15, why: 'wing loading rises faster than lift with mass', tag: 'measured' },
  { when: (g) => (g.organs?.length || 0) > genomeModuleCap(g),
    mult: 0.4, why: 'genome longer than the polymer can proofread', tag: 'measured' },
  { when: (g) => g.biochem?.solvent === 'methane' && (g.biochem?.polymer === 'rna' || g.biochem?.membrane === 'phospholipid'),
    mult: 0.05, why: 'dielectric 1.7 cannot dissolve an ionic polymer or a bilayer', tag: 'measured' },
];

export function morphPenalty(g) {
  let m = 1;
  const hits = [];
  for (const r of INCOMPATIBLE) {
    if (r.when(g)) { m *= r.mult; hits.push(r.why); }
  }
  return { mult: clamp(m, 0.02, 1), why: hits };
}

/* ------------------------------------------------------------------ naming -- */

const BAND_WORD = {
  uvc: 'hard-UV', uvb: 'UV', violetBlue: 'blue', green: 'green', red: 'red',
  nearIR: 'near-IR', midIR: 'thermal', farIR: 'far-IR', microwave: 'microwave', radio: 'radio',
  electric: 'electric-field', pressure: 'flow', acoustic: 'echo', chemical: 'chemical',
};

/** A sentence describing the body, built only from the genome. This is what the
 *  chronicle prints, and it is the whole point: the description is derived. */
export function describeGenome(g) {
  const plan = expressBodyPlan(g);
  const parts = [plan.symmetry];
  if (plan.segments > 1) parts.push(`${plan.segments}-segment`);
  if (plan.limbs) parts.push(`${plan.limbs} ${plan.symmetryOrder >= 3 ? 'rays' : 'limbs'}`);
  if (plan.eyeCount) {
    const byBand = new Map();
    for (const e of plan.eyes) byBand.set(e.band, (byBand.get(e.band) || 0) + e.count);
    const eyes = [], senses = [];
    for (const [b, n] of byBand) {
      const photon = BAND_BY_ID[b]?.lamMinNm != null;
      const word = BAND_WORD[b] || b;
      if (photon) eyes.push(`${n} ${word} ${n === 1 ? 'eye' : 'eyes'}`);
      else senses.push(`${word} sense${n > 1 ? ` ×${n}` : ''}`);
    }
    if (eyes.length) parts.push(eyes.join(', '));
    if (senses.length) parts.push(senses.join(', '));
  }
  if (g.axes.skeleton !== 'none') parts.push(g.axes.skeleton.replace(/([A-Z])/g, ' $1').toLowerCase().trim());
  parts.push(g.axes.trophic);
  parts.push(`in ${g.axes.habitat.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}`);
  return parts.join(' · ');
}

/** Compact string for saves, seeds and diffing two lineages. */
export function genomeKey(g) {
  const ax = AXES.map((a) => a.list.indexOf(g.axes[a.id])).join('');
  const nn = INTEGERS.map((a) => (g.n[a.id] | 0).toString(36)).join('');
  const or = g.organs.map((o) => `${o.id}${o.count}${o.band || ''}`).sort().join(',');
  return `${g.v}:${ax}:${nn}:${or}`;
}

/* ------------------------------------------------------ compatibility shim -- */

/** Build a provisional genome from an old 11-float trait vector, so every lineage
 *  that exists before this module is loaded still has a body. */
export function genomeFromTraits(traits, env = {}) {
  const g = blankGenome();
  const mass = traits?.[4] ?? 0.15;
  const troph = traits?.[7] ?? 0;
  const disp = traits?.[5] ?? 0.3;
  g.n.sizeClass = Math.round(clamp(mass * 14, 0, 14));
  g.axes.trophic = troph > 0.75 ? 'apexPredator' : troph > 0.55 ? 'predator'
    : troph > 0.35 ? 'grazer' : troph > 0.15 ? 'filter' : 'chemotroph';
  if (env.aquatic === false) g.axes.habitat = 'terrestrial';
  if (disp > 0.6) g.axes.locomotion = 'undulation';
  return g;
}

/** Old trait vector from a genome, for `fitness()` and anything still reading traits. */
export function traitsIntoGenomeSync(node) {
  if (!node?.genome || !node.traits) return;
  node.genome.n.sizeClass = Math.round(clamp((node.traits[4] ?? 0.15) * 14, 0, 14));
}
