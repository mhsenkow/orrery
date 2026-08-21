/** Fossils, HGT, biogeography metrics, multi-rate helpers.
 *  Items 56, 74–81, 177–178, 194. */

import { clamp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { TRAITS, nodeOf } from './evolve.js';
import { transferOrgan } from './genome.js';

/** Record fossils when lineages die in depositing cells. Item 177. */
export function recordFossil(W, node, cell, reason = 'burial') {
  if (!W.fossils) W.fossils = Array.from({ length: NC }, () => []);
  const depositing = W.sediment[cell] > 0.05 || W.h[cell] < W.seaLevel;
  if (!depositing && W.ice[cell] < 0.3) return;
  const slot = W.fossils[cell];
  slot.push({
    name: node.name,
    id: node.id,
    ageYr: W.ageYr,
    traits: Array.from(node.traits),
    reason,
  });
  if (slot.length > 8) slot.shift();
  // Trace fossil mark. Item 178.
  if (!W.traces) W.traces = new Float32Array(NC);
  W.traces[cell] = Math.min(1, (W.traces[cell] || 0) + 0.15);
}

/** Horizontal gene transfer among microbial lineages. Item 56. */
export function horizontalGeneTransfer(W, chronLog) {
  if (!W.tree || W.tree.living.length < 2) return;
  const rng = W.rng || (() => 0.5);
  const dt = Math.min(2, (W.dtYr || 200) / 1e6);
  if (rng() > 0.02 * dt) return;

  const living = W.tree.living.map((id) => nodeOf(W.tree, id)).filter(Boolean);
  const microbes = living.filter((n) => n.traits[TRAITS.bodyMass] < 0.35);
  if (microbes.length < 2) return;
  const a = microbes[(rng() * microbes.length) | 0];
  const b = microbes[(rng() * microbes.length) | 0];
  if (a.id === b.id) return;
  const dist = Math.abs((a.traits[TRAITS.bodyMass] || 0) - (b.traits[TRAITS.bodyMass] || 0));
  if (rng() > 0.55 - dist) {
    const keys = [TRAITS.pigment, TRAITS.o2Affinity, TRAITS.defence, TRAITS.desiccation];
    const k = keys[(rng() * keys.length) | 0];
    const tmp = a.traits[k];
    a.traits[k] = b.traits[k];
    b.traits[k] = tmp;
  }
  if (a.genome && b.genome && rng() < 0.55) transferOrgan(a.genome, b.genome, rng);
  if (chronLog && rng() < 0.3) {
    chronLog(W.year, 'hgt', 0, 1, `HGT: ${a.name} ↔ ${b.name}`);
  }
}

/** Latitudinal diversity gradient measurement. Item 74. */
export function latitudinalDiversity(W) {
  const bands = Array.from({ length: 9 }, () => new Set());
  if (!W.tree || !W.popId) return { bands: [], gradient: 0 };
  for (let c = 0; c < NC; c++) {
    if (W.life[c] < 0.05 || !W.popId[c]) continue;
    const lat = DIR[c * 3 + 1];
    const bi = clamp(((lat + 1) / 2) * 8, 0, 8) | 0;
    bands[bi].add(W.popId[c]);
  }
  const counts = bands.map((s) => s.size);
  const eq = counts[3] + counts[4] + counts[5];
  const pole = counts[0] + counts[1] + counts[7] + counts[8];
  return {
    bands: counts,
    equatorial: eq,
    polar: pole,
    gradient: eq - pole, // positive = classic LDG
  };
}

/** Species–area: richness ~ A^0.25. Item 75. */
export function speciesArea(W) {
  // Sample connected land components
  const seen = new Uint8Array(NC);
  const islands = [];
  for (let c = 0; c < NC; c++) {
    if (seen[c] || W.h[c] < W.seaLevel) continue;
    const stack = [c];
    seen[c] = 1;
    let area = 0;
    const spp = new Set();
    while (stack.length) {
      const x = stack.pop();
      area += AREA[x];
      if (W.popId?.[x]) spp.add(W.popId[x]);
      for (let k = 0; k < 4; k++) {
        const n = NBR[x * 4 + k];
        if (!seen[n] && W.h[n] >= W.seaLevel) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (area > 2) islands.push({ area, richness: spp.size });
  }
  islands.sort((a, b) => b.area - a.area);
  return islands.slice(0, 40);
}

/** Island biogeography equilibrium score. Item 76. */
export function islandBiogeography(W) {
  const islands = speciesArea(W).filter((i) => i.area < NC * 0.15);
  return islands.map((i) => ({
    ...i,
    expected: Math.pow(i.area / 10, 0.25) * 3,
  }));
}

/** Endemism: lineages unique to small components. Item 81. */
export function flagEndemics(W) {
  if (!W.tree) return;
  const islands = speciesArea(W);
  const small = new Set();
  // Rebuild per-lineage range area roughly via pop
  for (const id of W.tree.living) {
    const n = nodeOf(W.tree, id);
    if (!n) continue;
    n.endemic = n.pop > 0 && n.pop < 12;
    if (n.endemic) small.add(id);
  }
  W.endemicCount = small.size;
}

/** Range-shift / extinction debt under climate. Item 84. */
export function climateRangeShift(W) {
  if (!W.tree) return;
  for (const id of W.tree.living) {
    const n = nodeOf(W.tree, id);
    if (!n || !n.cells?.length) continue;
    const tOpt = n.traits[TRAITS.tOpt];
    let stress = 0;
    for (const c of n.cells) {
      const d = Math.abs(W.temp[c] - tOpt);
      if (d > n.traits[TRAITS.tBreadth]) stress++;
    }
    n._climateDebt = stress / Math.max(1, n.cells.length);
  }
}

/** Population-weighted mean range contiguity per lineage. Biosphere P0-40. */
export function rangeContiguity(W) {
  if (!W.tree || !W.popId) return 0;
  let weighted = 0, totalPop = 0;
  for (const id of W.tree.living) {
    const node = nodeOf(W.tree, id);
    if (!node?.cells?.length) continue;
    let contig = 0;
    for (const c of node.cells) {
      let hasNeigh = false;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if (W.popId[n] === id) { hasNeigh = true; break; }
      }
      if (hasNeigh) contig++;
    }
    const frac = contig / node.cells.length;
    weighted += frac * node.pop;
    totalPop += node.pop;
  }
  return totalPop > 0 ? weighted / totalPop : 0;
}

/** Multi-rate schedule: which subsystems run this tick. Item 194 / next 44. */
export function multiRateMask(W) {
  const dt = W.dtYr || 200;
  const tick = (W._tickIndex = (W._tickIndex || 0) + 1);
  // Deeper time → tectonics & phylogeny can skip more often
  const tecEvery = dt >= 1e6 ? 8 : dt >= 1e4 ? 4 : 2;
  let phyEvery = dt >= 1e6 ? 6 : dt >= 1e5 ? 3 : 1;
  if (W._skipPhylogenyOnce) {
    W._skipPhylogenyOnce = false;
    phyEvery = 99;
  }
  // Reused: this is read once a tick and discarded, so a fresh object per tick
  // is pure garbage on the hottest path in the app.
  _rate.tectonics = tick % tecEvery === 0;
  _rate.phylogeny = tick % phyEvery === 0;
  _rate.carbon = dt < 1e3 || tick % 2 === 0;
  return _rate;
}

const _rate = {
  clouds: true, tectonics: false, phylogeny: false, carbon: false,
  bio: true, dropped: false,
};

/** Report when the frame budget forced a silent tick drop. Next item 46. */
export function noteDroppedTicks(W, n = 1, reason = 'frame-budget') {
  W._droppedTicks = (W._droppedTicks || 0) + n;
  W._lastDropAt = W.ageYr;
  W._dropReason = reason;
  // Preferentially skip phylogeny next tick rather than the whole world
  W._skipPhylogenyOnce = true;
}
