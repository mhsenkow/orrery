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

/** Area-weighted water proxy: ocean depth + moisture on land + ice. */
export function waterMass(W) {
  let m = 0;
  const sea = W.seaLevel;
  for (let c = 0; c < NC; c++) {
    const a = AREA[c];
    if (W.h[c] < sea) m += (sea - W.h[c]) * a;
    else m += W.moist[c] * 0.02 * a;
    m += (W.ice[c] || 0) * 0.05 * a;
  }
  return m;
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
 */
export function assertBudgets(W) {
  const warnings = [];
  if (W._waterMass0 == null) {
    W._waterMass0 = waterMass(W);
  }
  const w = waterMass(W);
  W.waterMass = w;
  const drift = W._waterMass0 > 1e-9 ? (w - W._waterMass0) / W._waterMass0 : 0;
  W.waterDrift = drift;
  if (Math.abs(drift) > 0.35) {
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

  if ((W._droppedTicks || 0) > 0 && (W.year | 0) % 64 === 0) {
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
