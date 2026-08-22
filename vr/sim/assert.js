/** Conservation and budget assertions — debug builds / headless.
 *  Next backlog item 61. */

import { NC, AREA } from '../sphere.js';

const EPS = 1e-4;

/** Scan key fields for NaN/Infinity. Biosphere plan P0-09. */
export function assertNoNaN(W) {
  const fields = ['life', 'temp', 'moist'];
  if (W.macroDens) fields.push('macroDens');
  for (const key of fields) {
    const arr = W[key];
    if (!arr) continue;
    for (let c = 0; c < NC; c++) {
      const v = arr[c];
      if (!Number.isFinite(v)) {
        throw new Error(`assertNoNaN: ${key}[${c}]=${v}`);
      }
    }
  }
}

/** Species fields must stay on 0–1 scale after redoxTick. P0-65. */
export function assertSpeciesScale(W) {
  if (!W.species || W.debugAssert !== 'throw') return;
  for (const [key, arr] of Object.entries(W.species)) {
    for (let c = 0; c < NC; c++) {
      const v = arr[c];
      if (v < -EPS || v > 1.001) {
        throw new Error(`assertSpeciesScale: species.${key}[${c}]=${v}`);
      }
    }
  }
}

/** Area-weighted water inventory — one formula for hydro + assert (C81 / A29).
 *
 *  Scale matches hydroTick's acting inventory (vapour×50, moist, ice, depth×0.5).
 *  assertBudgets used to keep a different proxy and a ±35% band; both now share this.
 */
export function waterInventory(W) {
  const gases = W.gases || {};
  const sea = W.seaLevel;
  const h = W.h;
  const moist = W.moist;
  let mass = (gases.H2O || 0) * 50;
  for (let c = 0; c < NC; c++) {
    const a = AREA[c];
    mass += (moist[c] || 0) * a * 0.1;
    mass += (W.iceLand?.[c] || 0) * a * 0.35;
    mass += (W.iceSea?.[c] || 0) * a * 0.08;
    if (h[c] < sea) mass += (sea - h[c]) * a * 0.5;
  }
  return mass;
}

/** @deprecated use waterInventory — kept as alias for callers. */
export function waterMass(W) {
  return waterInventory(W);
}

/** Rough carbon inventory in relative units (atmosphere + reservoirs). */
export function carbonMass(W) {
  const g = W.gases || {};
  let m = (g.CO2 || 0) + (g.CH4 || 0) * 0.5;
  const C = W.carbon;
  if (C) {
    m += (C.oceanDIC || 0) + (C.biomass || 0) + (C.soil || 0)
      + (C.sediment || 0) + (C.rock || 0);
  }
  return m;
}

/**
 * Run assertions. Returns { ok, warnings[] }.
 * Soft by default — never throws unless W.debugAssert === 'throw'.
 *
 * Uses the same `waterInventory` formula as hydroTick (C81) but a separate
 * latch (`_waterProxy0`) so debug assertions never overwrite hydro's acting
 * reference (`_waterMass0`).
 */
export function assertBudgets(W) {
  const warnings = [];
  if (W._waterProxy0 == null) W._waterProxy0 = waterInventory(W);
  const w = waterInventory(W);
  W.waterProxy = w;
  const drift = W._waterProxy0 > 1e-9 ? (w - W._waterProxy0) / W._waterProxy0 : 0;
  W.waterProxyDrift = drift;
  // Shared formula — tighten from the old ±35% dual-scale proxy band (C81).
  if (Math.abs(drift) > 0.12) {
    warnings.push(`water drift ${(drift * 100).toFixed(1)}%`);
  }

  if (W.carbon) {
    if (W._carbonMass0 == null) W._carbonMass0 = carbonMass(W);
    const c = carbonMass(W);
    const cdrift = W._carbonMass0 > 1e-9 ? (c - W._carbonMass0) / W._carbonMass0 : 0;
    W.carbonDrift = cdrift;
    if (Math.abs(cdrift) > 2.0) {
      warnings.push(`carbon drift ${(cdrift * 100).toFixed(1)}%`);
    }
  }

  for (const [k, v] of Object.entries(W.gases || {})) {
    if (!Number.isFinite(v) || v < -EPS) warnings.push(`gas ${k}=${v}`);
  }

  // Tick counter, not the wrapping absolute year — see the note in `simTick`.
  if ((W._droppedTicks || 0) > 0 && (W._tickIndex | 0) % 64 === 0) {
    warnings.push(`droppedTicks=${W._droppedTicks} reason=${W._dropReason || '?'}`);
  }
  try {
    assertNoNaN(W);
    assertSpeciesScale(W);
  } catch (e) {
    warnings.push(e.message);
  }
  // Angular momentum sketch: spin + moon orbital L
  if (W.moon?.mass > 0.05) {
    const Lspin = 1 / Math.max(0.2, W.rotationPeriod || 1);
    const Lorb = W.moon.mass * Math.sqrt(Math.max(0.2, W.moon.distance || 1));
    W._angMom = Lspin + Lorb;
    if (W._angMom0 == null) W._angMom0 = W._angMom;
    const driftL = Math.abs(W._angMom - W._angMom0) / (W._angMom0 + 1e-6);
    if (driftL > 0.5) warnings.push(`angMomDrift=${(driftL * 100).toFixed(0)}%`);
  }

  const ok = warnings.length === 0;
  if (!ok && W.debugAssert === 'throw') {
    throw new Error('assertBudgets: ' + warnings.join('; '));
  }
  return { ok, warnings };
}
