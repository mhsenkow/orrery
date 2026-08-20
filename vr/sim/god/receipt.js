/** Receipts, forecasts, delayed attribution, power meter.
 *  Backlog cons 86–98, legib 178–189. */

import { W } from '../../world.js';
import { formatAge } from '../time.js';

export function initReceipts(W) {
  W.receipts = W.receipts || [];
  W.interventionLog = W.interventionLog || [];
  W.delayedHooks = W.delayedHooks || [];
  W.touchHeat = W.touchHeat || new Float32Array(W.life.length);
  W.attribution = W.attribution || { player: 0, planet: 1, acts: 0 };
  W.pendingForecast = null;
  W.overshootWarn = null;
  W.extinctionDebt = 0;
  W.argueResponses = W.argueResponses || [];
}

/** Record a receipt for an act. Item 86. */
export function issueReceipt(opts) {
  const r = {
    id: (W.receipts?.length || 0) + 1,
    t: W.ageYr,
    year: W.year,
    age: formatAge(W.ageYr),
    tool: opts.tool,
    cell: opts.cell ?? 0,
    intent: opts.intent || opts.tool,
    delta: opts.delta ?? null,
    units: opts.units || '',
    cost: opts.cost ?? 0,
    expected: opts.expected || '',
    irreversible: !!opts.irreversible,
    playerNamed: true,
    chain: opts.chain || [],
  };
  if (!W.receipts) initReceipts(W);
  W.receipts.push(r);
  if (W.receipts.length > 400) W.receipts.shift();
  W.interventionLog.push({
    ...r,
    label: `${r.tool}: ${r.expected || r.intent}`,
  });
  if (W.interventionLog.length > 800) W.interventionLog.shift();

  // Touch heatmap. Item 181.
  if (opts.cells?.length) {
    for (const c of opts.cells) W.touchHeat[c] = Math.min(1, (W.touchHeat[c] || 0) + 0.15);
  } else if (opts.cell >= 0) {
    W.touchHeat[opts.cell] = Math.min(1, (W.touchHeat[opts.cell] || 0) + 0.25);
  }

  W.attribution.acts = (W.attribution.acts || 0) + 1;
  // Crude attribution: each act nudges player share up, planet dynamics pull back in godTick
  W.attribution.player = Math.min(0.95, (W.attribution.player || 0) + 0.02);
  W.attribution.planet = 1 - W.attribution.player;

  // Schedule delayed callback. Item 88.
  if (opts.delayYr && opts.delayLabel) {
    W.delayedHooks.push({
      fireAt: W.ageYr + opts.delayYr,
      receiptId: r.id,
      label: opts.delayLabel,
      tool: opts.tool,
      cell: opts.cell,
    });
  }
  return r;
}

/** Simple forecast ghost curves. Item 87 / 184. */
export function forecastAct(tool, cell, horizon = [10, 100, 1000]) {
  const base = {
    temp: W.meanTemp,
    life: W.meanLife,
    co2: W.gases.CO2,
    ice: W.iceFrac || 0,
  };
  const slopes = {
    solar: { temp: 0.04, life: 0.01, ice: -0.02, co2: 0 },
    co2: { temp: 0.03, life: 0.005, ice: -0.015, co2: 0.02 },
    o2: { temp: 0, life: 0.02, ice: 0, co2: -0.001 },
    seed: { temp: 0, life: 0.08, ice: 0, co2: -0.002 },
    raise: { temp: 0, life: -0.01, ice: 0, co2: 0 },
    lower: { temp: 0, life: -0.005, ice: 0, co2: 0 },
    meteor: { temp: 0.08, life: -0.25, ice: 0.05, co2: 0.01 },
    ice: { temp: -0.06, life: -0.04, ice: 0.12, co2: 0 },
    plague: { temp: 0, life: -0.2, ice: 0, co2: 0.001 },
    // Fire clears biomass and vents it. Regrowth is on the biosphere, not here.
    ignite: { temp: 0.01, life: -0.06, ice: 0, co2: 0.0008 },
    albedo: { temp: -0.025, life: 0, ice: 0.02, co2: 0 },
    shade: { temp: -0.03, life: -0.01, ice: 0.03, co2: 0 },
  };
  const s = slopes[tool] || { temp: 0, life: 0, ice: 0, co2: 0 };
  const curves = horizon.map((h) => {
    const k = Math.log10(h + 1) / 3;
    const band = 0.15 + k * 0.35; // uncertainty widens
    return {
      ticks: h,
      temp: clamp01(base.temp + s.temp * k),
      life: clamp01(base.life + s.life * k),
      ice: clamp01(base.ice + s.ice * k),
      co2: Math.max(0, base.co2 + s.co2 * k),
      lo: clamp01(base.temp + s.temp * k * (1 - band)),
      hi: clamp01(base.temp + s.temp * k * (1 + band)),
    };
  });
  W.pendingForecast = { tool, cell, curves, at: W.ageYr };
  return W.pendingForecast;
}

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

/** Fire delayed hooks whose time has come. */
export function tickReceipts(W, log) {
  if (!W.delayedHooks) return;
  const due = [];
  W.delayedHooks = W.delayedHooks.filter((h) => {
    if (W.ageYr >= h.fireAt) { due.push(h); return false; }
    return true;
  });
  for (const h of due) {
    const msg = `${h.label} — begun by your ${h.tool} @ ${formatAge(h.fireAt - (h.fireAt - W.ageYr))}`;
    if (log) log(W.year, 'consequence', h.cell || 0, 1, msg);
    W.argueResponses = W.argueResponses || [];
    W.argueResponses.push({ t: W.ageYr, text: msg, kind: 'delayed' });
    if (W.argueResponses.length > 40) W.argueResponses.shift();
  }

  // Attribution decays toward planet dynamics. Item 97 / 178.
  if (W.attribution) {
    W.attribution.player = Math.max(0, W.attribution.player * 0.9992);
    W.attribution.planet = 1 - W.attribution.player;
  }

  // Overshoot warnings. Item 92.
  checkOvershoot(W);

  // Touch heat decay
  if (W.touchHeat) {
    for (let i = 0; i < W.touchHeat.length; i += 17) {
      W.touchHeat[i] *= 0.9995;
    }
  }
}

function checkOvershoot(W) {
  let warn = null;
  if (W.meanTemp < 0.38 && W.iceFrac > 0.55) {
    warn = `You are ${(0.38 - W.meanTemp).toFixed(2)} from a snowball you may not reverse.`;
  } else if (W.meanTemp > 0.82 && W.gases.CO2 > 0.08) {
    warn = `Moist-greenhouse cliff in sight — CO₂ ${(W.gases.CO2 * 100).toFixed(1)}%, T high.`;
  } else if (W.meanLife < 0.05 && W.attribution?.acts > 3) {
    warn = 'Biosphere near collapse — extinction debt is already booked.';
  }
  W.overshootWarn = warn;
}

/** Causal chain text. Item 96. */
export function causalChain(steps) {
  return steps.filter(Boolean).join(' → ');
}

/** Style archetype from intervention log. Item 189. */
export function playStyle(W) {
  const log = W.interventionLog || [];
  if (!log.length) return { id: 'absentee', label: 'Absentee', note: 'Almost no interventions' };
  const counts = {};
  for (const e of log) counts[e.tool] = (counts[e.tool] || 0) + 1;
  const seeds = (counts.seed || 0) + (counts.seedGuild || 0) + (counts.refuge || 0);
  const kills = (counts.plague || 0) + (counts.meteor || 0) + (counts.buster || 0) + (counts.cull || 0);
  const climate = (counts.solar || 0) + (counts.co2 || 0) + (counts.tilt || 0) + (counts.shade || 0);
  const observe = (counts.inspect || 0) + (counts.core || 0) + (counts.icecore || 0);
  if (observe > seeds + kills + climate) return { id: 'scientist', label: 'Scientist', note: 'Mostly looking' };
  if (seeds > kills * 2) return { id: 'gardener', label: 'Gardener', note: 'Tending over smiting' };
  if (kills > seeds) return { id: 'vandal', label: 'Vandal', note: 'Entropy released' };
  if (climate > seeds) return { id: 'engineer', label: 'Engineer', note: 'Climate levers' };
  return { id: 'mixed', label: 'Mixed hand', note: 'No dominant pattern' };
}

/** Restraint metrics. Item 187. */
export function restraintStats(W) {
  const acts = W.attribution?.acts || 0;
  const myr = Math.max(0.001, (W.ageYr || 1) / 1e6);
  return {
    actsPerMyr: acts / myr,
    energyUnspent: W.energy ?? 0,
    style: playStyle(W),
    playerFrac: W.attribution?.player ?? 0,
  };
}

export function interventionDoc(W) {
  return (W.interventionLog || []).map((e) =>
    `- ${e.age || formatAge(e.t)} · **${e.tool}** @cell ${e.cell} · cost ${e.cost ?? 0} · ${e.expected || e.intent}`
  ).join('\n');
}
