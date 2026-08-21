/** Chemical, biological, radiological agents (dark-400 L §221–240). */

import { NC, NBR } from '../sphere.js';
import { clamp } from '../math.js';
import { rngOf } from './rng.js';
import { pourToxin, irradiate, seedDisease } from './anthro.js';
import { noteCasualty } from './dark.js';

/** Persistence fractions per agent class (§221). */
export const AGENT_KEEP = Object.freeze({
  nerve: 0.96,      // non-persistent — hours
  blister: 0.992,   // days–weeks
  defoliant: 0.999, // decades on ground
  persistent: 0.9985,
});

export function resetCbr(W) {
  W.toxinClass = null; // Map cell → 'nerve'|'blister'|'defoliant'|'persistent'
  W._toxinClassCells = [];
  W.dark = W.dark || {};
  W.dark.cbr = {
    nerve: 0, blister: 0, defoliant: 0, rdd: 0, decon: 0, resistance: 0,
  };
  if (W.epidemic) W.epidemic.resistance = W.epidemic.resistance || 0;
}

/**
 * Pour a typed chemical agent (§221–223).
 * Defoliant strips life without salting soil nutrients as hard.
 */
export function pourAgent(W, cell, amount = 0.8, agent = 'persistent', radius = 1) {
  pourToxin(W, cell, amount, radius);
  if (!W._agentAt) W._agentAt = new Map();
  W._agentAt.set(cell | 0, agent);
  for (let k = 0; k < 4 && radius > 0; k++) {
    W._agentAt.set(NBR[cell * 4 + k], agent);
  }
  if (agent === 'defoliant') {
    if (W.life?.[cell] > 0) W.life[cell] = Math.max(0, W.life[cell] - amount * 0.9);
    // Soil survives better than life.
    if (W.nutrientN) W.nutrientN[cell] = Math.max(0, (W.nutrientN[cell] || 0) - amount * 0.002);
  }
  W.dark = W.dark || {};
  W.dark.cbr = W.dark.cbr || {};
  W.dark.cbr[agent] = (W.dark.cbr[agent] | 0) + 1;
  return { ok: true, cell, agent, amount };
}

/** Radiological dispersal device — dirty bomb (§L / RDD). */
export function disperseRdd(W, cell, amount = 0.55, radius = 2) {
  irradiate(W, cell, amount, radius);
  pourToxin(W, cell, amount * 0.3, 1);
  noteCasualty(W, 'fallout', Math.floor(amount * 80));
  W.dark = W.dark || {};
  W.dark.cbr = W.dark.cbr || {};
  W.dark.cbr.rdd = (W.dark.cbr.rdd | 0) + 1;
  return { ok: true, cell, amount };
}

/** Bio payload with optional antibiotic-resistance flag (§235). */
export function seedBioPayload(W, cell, opts = {}) {
  const r = seedDisease(W, cell, {
    virulence: opts.virulence ?? 0.65,
    transmit: opts.transmit ?? 0.7,
    engineered: opts.engineered ?? true,
    name: opts.name || 'bio agent',
  });
  if (W.epidemic) {
    W.epidemic.resistance = clamp(opts.resistance ?? 0.2, 0, 1);
    W.epidemic.incubate = opts.incubate ?? 8;
  }
  return r;
}

/** Slow expensive decontamination (§213 / §L). */
export function decontaminate(W, cell, strength = 0.15) {
  if (cell < 0 || cell >= NC) return 0;
  let cleared = 0;
  if (W.toxin?.[cell] > 0) {
    const cut = Math.min(W.toxin[cell], strength);
    W.toxin[cell] -= cut;
    cleared += cut;
  }
  if (W.rad?.[cell] > 0) {
    const cut = Math.min(W.rad[cell], strength * 0.4);
    W.rad[cell] -= cut;
    cleared += cut;
  }
  if (W.radShort?.[cell] > 0) {
    const cut = Math.min(W.radShort[cell], strength * 0.7);
    W.radShort[cell] -= cut;
    cleared += cut;
  }
  if (W.exclusion?.[cell] > 0) {
    W.exclusion[cell] = Math.max(0, W.exclusion[cell] - strength * 0.5);
  }
  W._agentAt?.delete(cell | 0);
  W.dark = W.dark || {};
  W.dark.cbr = W.dark.cbr || {};
  W.dark.cbr.decon = (W.dark.cbr.decon || 0) + cleared;
  return cleared;
}

/** Apply class-specific keep rates over toxin cells (§221). */
function stepAgentPersistence(W) {
  if (!W.toxin || !W._agentAt?.size) return;
  const keep = AGENT_KEEP;
  for (const [c, agent] of W._agentAt) {
    const k = keep[agent] ?? keep.persistent;
    if (!W.toxin[c]) {
      W._agentAt.delete(c);
      continue;
    }
    // Override default TOXIN_KEEP with class keep (extra decay toward class rate).
    const v = W.toxin[c];
    const targetKeep = k / 0.9985; // relative to anthro default
    W.toxin[c] = v * Math.min(1, Math.max(0.9, targetKeep));
    if (agent === 'nerve' && W.toxin[c] < 0.02) {
      W.toxin[c] = 0;
      W._agentAt.delete(c);
    }
  }
}

/** Antimicrobial resistance grows over long epidemics (§235). */
function stepResistance(W) {
  const ep = W.epidemic;
  if (!ep || !(W.diseaseCells > 10)) return;
  ep.resistance = clamp((ep.resistance || 0) + 0.0008, 0, 1);
  // Resistant strains transmit a bit harder / kill a bit less (trade-off).
  if (ep.resistance > 0.3) {
    ep.transmit = clamp((ep.transmit || 0.5) * (1 + ep.resistance * 0.05), 0.05, 1);
    ep.virulence = clamp((ep.virulence || 0.5) * (1 - ep.resistance * 0.03), 0.05, 1);
  }
  W.dark = W.dark || {};
  W.dark.cbr = W.dark.cbr || {};
  W.dark.cbr.resistance = ep.resistance;
}

/**
 * Medical countermeasures verb — cuts resistance / disease locally (§L leftover).
 * Costs build (hospital capacity) and lowers epidemic resistance.
 */
export function applyMedicalCountermeasures(W, cell, strength = 0.25) {
  if (cell < 0 || cell >= NC) return 0;
  const s = clamp(strength, 0.05, 1);
  let effect = 0;
  if (W.disease?.[cell] > 0) {
    const cut = Math.min(W.disease[cell], s * 0.5);
    W.disease[cell] -= cut;
    effect += cut;
  }
  if (W.epidemic) {
    const before = W.epidemic.resistance || 0;
    W.epidemic.resistance = clamp(before - s * 0.15, 0, 1);
    effect += before - W.epidemic.resistance;
  }
  if (W.immune) {
    W.immune[cell] = Math.min(1, (W.immune[cell] || 0) + s * 0.4);
  }
  // Hospital cost.
  if (W.build?.[cell] > 0.1) W.build[cell] *= (1 - s * 0.02);
  W.dark = W.dark || {};
  W.dark.cbr = W.dark.cbr || {};
  W.dark.medical = (W.dark.medical || 0) + effect;
  W.dark.cbr.medical = (W.dark.cbr.medical || 0) + 1;
  return effect;
}

/** Dual-use research chron line — civil tech that enables CBR (§L leftover). */
export function noteDualUseResearch(W, cell, label, log = null) {
  W.dark = W.dark || {};
  W.dark.dualUseResearch = (W.dark.dualUseResearch | 0) + 1;
  if (!W.dark.dualUseLog) W.dark.dualUseLog = [];
  W.dark.dualUseLog.push({
    cell: cell | 0, label: label || 'dual-use research',
    year: W.ageYr || W.year || 0, tick: W._tickIndex | 0,
  });
  if (W.dark.dualUseLog.length > 32) W.dark.dualUseLog.shift();
  if (log) log(W.year, 'research', cell | 0, 0.4, label || 'Dual-use research published');
  return W.dark.dualUseResearch;
}

export function cbrTick(W, log = null) {
  W.dark = W.dark || {};
  W.dark.cbr = W.dark.cbr || { nerve: 0, blister: 0, defoliant: 0, rdd: 0, decon: 0, resistance: 0, medical: 0 };
  stepAgentPersistence(W);
  stepResistance(W);

  // Dual-use research chron when high-build + bio/chem infrastructure (§L).
  const tick = W._tickIndex | 0;
  if (tick % 90 === 0 && (W.polities || []).length && log) {
    const rng = rngOf(W, 'rngGod');
    for (const p of W.polities) {
      if ((p.build || 0) < 2 || rng() > 0.15) continue;
      const cap = p.capital | 0;
      if ((W.build?.[cap] || 0) < 0.4) continue;
      noteDualUseResearch(W, cap, `${p.name} dual-use lab published`, log);
    }
  }

  // Weather: nerve agents disperse faster in wind (§225).
  if (W.windU && W._agentAt?.size && (tick % 8) === 0) {
    const rng = rngOf(W, 'rngGod');
    for (const [c, agent] of [...W._agentAt]) {
      if (agent !== 'nerve' && agent !== 'blister') continue;
      const spd = Math.hypot(W.windU[c] || 0, W.windV?.[c] || 0);
      if (spd > 0.2 && W.toxin?.[c] > 0.05 && rng() < 0.3) {
        W.toxin[c] *= 0.85;
      }
    }
  }

  if (log && (W.dark.cbr.rdd | 0) > 0 && (tick % 100) === 0) {
    log(W.year, 'cbr', 0, 0.3, 'Radiological contamination persists');
  }
}
