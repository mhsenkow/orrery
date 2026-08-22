/** Species page, genome card, tree layout, Newick — the inspectable biosphere. */

import { clamp } from '../math.js';
import { AXES, INTEGERS, ORGAN_BY_ID, BAND_BY_ID, BIOCHEM } from './lifeGrammar.js';
import { describeGenome, expressBodyPlan, genomeKey, morphPenalty } from './genome.js';
import { nodeOf, TRAITS, kleiberDensity } from './evolve.js';
import { AREA, N as SIM_N } from '../sphere.js';

const SOLVENT_BY_ID = Object.fromEntries((BIOCHEM.solvents || []).map((s) => [s.id, s]));

export function genomeCard(g) {
  if (!g) return { title: 'no genome', lines: [] };
  const plan = expressBodyPlan(g);
  const pen = morphPenalty(g);
  const lines = [];
  for (const a of AXES) lines.push(`${a.id}: ${g.axes[a.id]}${g.locks.axes[a.id] ? ' 🔒' : ''}`);
  for (const a of INTEGERS) lines.push(`${a.id}: ${g.n[a.id]}${g.locks.n[a.id] ? ' 🔒' : ''}`);
  if (g.organs.length) {
    lines.push('organs: ' + g.organs.map((o) => `${o.id}×${o.count}${o.band ? '/' + o.band : ''}`).join(', '));
  }
  const b = g.biochem || {};
  lines.push(`chem: ${b.solvent || '?'} · ${b.polymer || '?'} · ${b.chirality || '?'} · ${b.membrane || '?'}`);
  if (g.devo?.hox?.length) lines.push(`hox: ${g.devo.hox.join(' ')}`);
  if (pen.why.length) lines.push('cost: ' + pen.why.join('; '));
  return {
    title: describeGenome(g),
    key: genomeKey(g),
    plan,
    pen,
    lines,
    locks: { ...g.locks },
  };
}

export function genomeDiff(a, b) {
  const rows = [];
  if (!a || !b) return rows;
  for (const ax of AXES) {
    if (a.axes[ax.id] !== b.axes[ax.id]) rows.push({ k: ax.id, a: a.axes[ax.id], b: b.axes[ax.id] });
  }
  for (const n of INTEGERS) {
    if ((a.n[n.id] | 0) !== (b.n[n.id] | 0)) rows.push({ k: n.id, a: a.n[n.id], b: b.n[n.id] });
  }
  const ao = new Map(a.organs.map((o) => [o.id + (o.band || ''), o]));
  const bo = new Map(b.organs.map((o) => [o.id + (o.band || ''), o]));
  for (const [k, o] of ao) {
    if (!bo.has(k)) rows.push({ k: 'lost ' + o.id, a: o.count, b: 0 });
  }
  for (const [k, o] of bo) {
    if (!ao.has(k)) rows.push({ k: 'gained ' + o.id, a: 0, b: o.count });
    else if (ao.get(k).count !== o.count) rows.push({ k: o.id, a: ao.get(k).count, b: o.count });
  }
  return rows;
}

export function cellAreaKm2(c, radiusKm = 6371) {
  const nc = AREA.length;
  const meanKm2 = (4 * Math.PI * radiusKm * radiusKm) / nc;
  return (AREA[c] || 1) * meanKm2;
}

export function speciesPage(W, node) {
  if (!node) return null;
  const g = node.genome;
  const plan = node.plan || (g ? expressBodyPlan(g, { O2: W.gases?.O2, gravity: W.rule?.gravity ?? 1 }) : null);
  const massG = plan?.massG ?? Math.pow(10, (node.traits?.[TRAITS.bodyMass] ?? 0.15) * 6 - 2);
  const dens = kleiberDensity(node.traits?.[TRAITS.bodyMass] ?? 0.15, massG);
  let area = 0;
  for (const c of node.cells || []) area += cellAreaKm2(c);
  const census = node.censusPop ?? dens * Math.max(1, node.pop) * (area / Math.max(1, node.pop || 1));
  const Ne = node.Ne ?? Math.max(1, census * 0.35);
  const parent = node.parentId ? nodeOf(W.tree, node.parentId) : null;
  const sav = surfaceToVolume(massG);
  return {
    id: node.id,
    name: node.name,
    body: g ? describeGenome(g) : '',
    card: g ? genomeCard(g) : null,
    parent: parent ? { id: parent.id, name: parent.name } : null,
    popCells: node.pop || 0,
    rangeKm2: area,
    census: census,
    Ne,
    massG,
    sav,
    lifespanYr: lifespanFromMass(massG),
    genYr: generationTimeYr(massG),
    powerW: restingPowerW(massG, node.genome?.axes?.thermal),
    morphMult: node.morphMult ?? 1,
    morphWhy: node.morphWhy || [],
    diet: node.diet || [],
    isolation: node.isolation || 0,
    load: node.load || 0,
    locks: g?.locks,
    birth: node.birth,
    death: node.death,
    endemic: !!node.endemic,
    risk: extinctionRisk(node, area, Ne),
  };
}

export function surfaceToVolume(massG) {
  const r = Math.cbrt((3 * Math.max(1e-12, massG) * 1e-3) / (4 * Math.PI * 1.1));
  const area = 4 * Math.PI * r * r;
  const vol = (4 / 3) * Math.PI * r * r * r;
  return vol > 0 ? area / vol : 0;
}

export function generationTimeYr(massG) {
  // provenance: measured-order — generation time ~ M^0.25, bacteria hours, whale decades
  return clamp(0.0002 * Math.pow(Math.max(1e-12, massG), 0.25) * 365, 1e-6, 80);
}

export function lifespanFromMass(massG) {
  return generationTimeYr(massG) * 12;
}

export function restingPowerW(massG, thermal) {
  // Kleiber: B ≈ 3.5 M_kg^0.75 watts-ish for animals; microbes far less
  const kg = Math.max(1e-15, massG / 1000);
  let w = 3.4 * Math.pow(kg, 0.75);
  if (thermal === 'endotherm') w *= 8;
  if (thermal === 'conformer') w *= 0.2;
  return w;
}

function extinctionRisk(node, areaKm2, Ne) {
  const trop = node.traits?.[TRAITS.trophic] ?? 0;
  const range = areaKm2 < 1e5 ? 0.4 : areaKm2 < 1e6 ? 0.2 : 0.05;
  const small = Ne < 500 ? 0.35 : Ne < 5000 ? 0.15 : 0.02;
  const predator = trop > 0.6 ? 0.15 : 0;
  return clamp(range + small + predator + (node.load || 0) * 0.2, 0, 0.95);
}

export function explainCreature(W, node) {
  if (!node?.genome) return '';
  const g = node.genome;
  const plan = node.plan || expressBodyPlan(g);
  const star = W.rule?.starTeff || W.rule?.star?.teff || 5772;
  const bits = [];
  if (plan.symmetryOrder >= 3) {
    bits.push(`This has ${plan.eyeCount || 0} ${plan.symmetryOrder === 5 ? 'rays' : 'eyes'} because it is ${plan.symmetry}`);
  } else if (plan.eyeCount) {
    bits.push(`Eyes: ${plan.eyes.map((e) => `${e.count} ${e.band}`).join(', ')}`);
  }
  const band = plan.eyes?.[0]?.band;
  if (band) bits.push(`they are ${band} because a ${star | 0} K star puts photons there`);
  const o2 = ((W.gases?.O2 || 0) * 100).toFixed(1);
  if (plan.massG < 1) bits.push(`it is small (${fmtMass(plan.massG)}) because oxygen is ${o2}%`);
  else bits.push(`mass ${fmtMass(plan.massG)} at ${o2}% O₂`);
  if (node.morphWhy?.length) bits.push(node.morphWhy[0]);
  return bits.join('; ') + '.';
}

function fmtMass(g) {
  if (g < 1e-3) return `${(g * 1e6).toFixed(1)} µg`;
  if (g < 1) return `${(g * 1e3).toFixed(1)} mg`;
  if (g < 1000) return `${g.toFixed(1)} g`;
  if (g < 1e6) return `${(g / 1000).toFixed(1)} kg`;
  return `${(g / 1e6).toFixed(1)} t`;
}

/** Time-down, tips-at-bottom layout for a phylogeny. */
export function layoutTree(tree, width = 280, height = 180) {
  if (!tree?.nodes?.length) return { nodes: [], edges: [], width, height };
  const living = new Set(tree.living || []);
  const nodes = tree.nodes;
  const children = new Map();
  for (const n of nodes) {
    if (n.parentId == null) continue;
    if (!children.has(n.parentId)) children.set(n.parentId, []);
    children.get(n.parentId).push(n);
  }
  const tips = nodes.filter((n) => !children.get(n.id)?.length);
  const xOf = new Map();
  tips.forEach((n, i) => xOf.set(n.id, (i + 0.5) / Math.max(1, tips.length)));
  function place(n) {
    if (xOf.has(n.id)) return xOf.get(n.id);
    const ch = children.get(n.id) || [];
    if (!ch.length) {
      xOf.set(n.id, 0.5);
      return 0.5;
    }
    let s = 0;
    for (const c of ch) s += place(c);
    const x = s / ch.length;
    xOf.set(n.id, x);
    return x;
  }
  for (const n of nodes) place(n);
  let t0 = Infinity, t1 = -Infinity;
  for (const n of nodes) {
    if (n.birth < t0) t0 = n.birth;
    const t = n.death ?? t1;
    if (n.death != null && n.death > t1) t1 = n.death;
  }
  t1 = Math.max(t1, t0 + 1, nodes.reduce((m, n) => Math.max(m, n.birth), t0));
  const span = Math.max(1, t1 - t0);
  const out = [];
  for (const n of nodes) {
    const y = ((n.birth - t0) / span) * (height - 16) + 8;
    const x = 12 + xOf.get(n.id) * (width - 24);
    out.push({
      id: n.id, name: n.name, x, y,
      living: living.has(n.id),
      dead: n.death != null,
      parentId: n.parentId,
    });
  }
  const byId = new Map(out.map((n) => [n.id, n]));
  const edges = [];
  for (const n of out) {
    if (n.parentId == null) continue;
    const p = byId.get(n.parentId);
    if (p) edges.push({ x1: p.x, y1: p.y, x2: n.x, y2: n.y });
  }
  return { nodes: out, edges, width, height, t0, t1 };
}

export function treeToSvg(layout) {
  if (!layout?.nodes?.length) return '';
  const { nodes, edges, width, height } = layout;
  let s = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" aria-label="phylogeny">`;
  for (const e of edges) {
    s += `<line x1="${e.x1.toFixed(1)}" y1="${e.y1.toFixed(1)}" x2="${e.x2.toFixed(1)}" y2="${e.y2.toFixed(1)}" stroke="#4a6a80" stroke-width="1"/>`;
  }
  for (const n of nodes) {
    const fill = n.living ? '#6fd6a4' : '#8890a0';
    s += `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="3.2" fill="${fill}"><title>${n.name}</title></circle>`;
  }
  s += '</svg>';
  return s;
}

export function treeToNewick(tree) {
  if (!tree?.nodes?.length) return ';';
  const children = new Map();
  let root = null;
  for (const n of tree.nodes) {
    if (n.parentId == null) root = n;
    else {
      if (!children.has(n.parentId)) children.set(n.parentId, []);
      children.get(n.parentId).push(n);
    }
  }
  if (!root) root = tree.nodes[0];
  function rec(n) {
    const ch = children.get(n.id) || [];
    const name = String(n.name || ('n' + n.id)).replace(/[^A-Za-z0-9_]/g, '_');
    const len = (n.substitutions || 0).toFixed(4);
    if (!ch.length) return `${name}:${len}`;
    return `(${ch.map(rec).join(',')})${name}:${len}`;
  }
  return rec(root) + ';';
}

export function morphospacePoints(tree) {
  const pts = [];
  for (const n of tree?.nodes || []) {
    if (!n.genome) continue;
    pts.push({
      id: n.id,
      name: n.name,
      x: (n.genome.n.symmetryOrder || 0) / 12,
      y: (n.genome.n.sizeClass || 0) / 14,
      living: n.death == null,
      trophic: n.genome.axes.trophic,
    });
  }
  return pts;
}

export function disparity(tree) {
  const living = (tree?.living || []).map((id) => nodeOf(tree, id)).filter((n) => n?.genome);
  if (living.length < 2) return { diversity: living.length, disparity: 0 };
  let sum = 0, n = 0;
  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) {
      sum += morphDist(living[i].genome, living[j].genome);
      n++;
    }
  }
  return { diversity: living.length, disparity: n ? sum / n : 0 };
}

function morphDist(a, b) {
  let d = 0;
  for (const ax of AXES) if (a.axes[ax.id] !== b.axes[ax.id]) d += 1;
  for (const n of INTEGERS) d += Math.abs((a.n[n.id] || 0) - (b.n[n.id] || 0)) / Math.max(1, n.max);
  return d / (AXES.length + INTEGERS.length);
}

export function solventBlurb(W) {
  const b = W.planetBiochem;
  if (!b) return '';
  const sol = SOLVENT_BY_ID[b.solvent];
  return `${b.solvent} · ${b.chirality} · ${b.polymer}${sol ? ` (ε=${sol.dielectric})` : ''}`;
}

export function shannonDiversity(W) {
  const counts = new Map();
  let n = 0;
  const pop = W.popId;
  if (!pop) return 0;
  for (let c = 0; c < pop.length; c++) {
    const id = pop[c];
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
    n++;
  }
  if (!n) return 0;
  let h = 0;
  for (const v of counts.values()) {
    const p = v / n;
    h -= p * Math.log(p);
  }
  return h;
}

void SIM_N;
void ORGAN_BY_ID;
void BAND_BY_ID;
