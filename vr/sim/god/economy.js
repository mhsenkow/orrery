/** Thermodynamic costs, scarcity modes, cooldowns, debt.
 *  Backlog cost 99–111. */

import { W } from '../../world.js';

export const SCARCITY = {
  free: 'free',
  observe: 'observe', // observation free, intervention costs
  budgeted: 'budgeted',
};

/** Approximate Joules-ish units from act magnitude. Item 99. */
export function thermoCost(tool, magnitude = 1, opts = {}) {
  const base = {
    inspect: 0, core: 0, icecore: 0,
    solar: 40, co2: 25, o2: 20, tilt: 35, spin: 30,
    seed: 12, seedGuild: 10, design: 18, transplant: 15,
    raise: 22, lower: 18, flatten: 8, smooth: 6, sharpen: 7, roughen: 6, crust: 16, plume: 28, plate: 45,
    river: 8, gateway: 20, sealevel: 35, soil: 6, albedo: 10,
    meteor: 60, volcano: 40, quake: 28, plague: 35, ice: 30, ignite: 6,
    lip: 80, supernova: 70, flare: 25, clathrate: 55, buster: 200,
    shade: 40, aerosol: 18, magnet: 50, cloud: 4, moon: 50,
    refuge: 14, cull: 22, transition: 60, mutate: 8,
    weather: 5, current: 30, thermostat: 0,
  };
  let cost = (base[tool] ?? 10) * Math.abs(magnitude);

  // With the grain discount. Item 100 / 109.
  if (opts.withGrain) cost *= 0.35;
  if (opts.againstGrain) cost *= 1.8;
  if (opts.leverage) cost *= 0.45;

  // Archetype modifiers. Item 111.
  const arch = W.archetype || 'gardener';
  if (arch === 'gardener' && (tool === 'seed' || tool === 'seedGuild' || tool === 'refuge')) cost *= 0.7;
  if (arch === 'vandal' && (tool === 'meteor' || tool === 'plague' || tool === 'buster' || tool === 'ignite')) cost *= 0.7;
  if (arch === 'scientist' && (tool === 'inspect' || tool === 'core' || tool === 'icecore')) cost = 0;

  return Math.max(0, Math.round(cost));
}

export function scarcityMode(W) {
  if (W.scarcityMode) return W.scarcityMode;
  if (W.budgetMode) return SCARCITY.budgeted;
  return SCARCITY.free;
}

export function setScarcityMode(mode) {
  W.scarcityMode = mode;
  W.budgetMode = mode === SCARCITY.budgeted || mode === SCARCITY.observe;
}

const COOLDOWN_YR = {
  solar: 1e5, tilt: 5e5, spin: 2e5, sealevel: 1e4,
  meteor: 500, lip: 1e6, supernova: 1e7, buster: 1e9,
  plate: 2e6, plume: 1e6, magnet: 1e7, shade: 50,
  co2: 200, o2: 200, aerosol: 5,
};

export function initEconomy(W) {
  W.cooldowns = W.cooldowns || {};
  W.energyDebt = W.energyDebt || 0;
  W.bankedEnergy = W.bankedEnergy || 0;
  W.archetype = W.archetype || 'gardener';
  W.scarcityMode = W.scarcityMode || (W.budgetMode ? SCARCITY.budgeted : SCARCITY.free);
  W.toolUses = W.toolUses || {};
}

export function onCooldown(tool) {
  const until = W.cooldowns?.[tool] || 0;
  return W.ageYr < until ? until - W.ageYr : 0;
}

export function markCooldown(tool) {
  const span = COOLDOWN_YR[tool];
  if (!span) return;
  if (!W.cooldowns) W.cooldowns = {};
  W.cooldowns[tool] = W.ageYr + span;
}

/** Observation always free. Item 108. */
export function isObservation(tool) {
  return tool === 'inspect' || tool === 'core' || tool === 'icecore';
}

/**
 * Try to pay. Returns { ok, cost, error?, debt? }.
 * Items 99, 101, 106, 107.
 */
export function tryPay(tool, magnitude = 1, opts = {}) {
  initEconomy(W);
  W.toolUses[tool] = (W.toolUses[tool] || 0) + 1;

  if (isObservation(tool)) return { ok: true, cost: 0 };

  const mode = scarcityMode(W);
  // Sandbox free: no cooldowns, no energy burn — just catalogue the listed cost.
  if (mode === SCARCITY.free) {
    const cost = thermoCost(tool, magnitude, opts);
    return { ok: true, cost: 0, listed: cost };
  }

  const cd = onCooldown(tool);
  if (cd > 0) {
    return { ok: false, cost: 0, error: `Cooldown ${formatCooldown(cd)}`, cooldownYr: cd };
  }

  const cost = thermoCost(tool, magnitude, opts);

  if (mode === SCARCITY.observe && W.energy < cost) {
    return {
      ok: false,
      cost,
      error: `Observe mode — need ${cost} energy (have ${W.energy | 0})`,
    };
  }

  if (W.energy >= cost) {
    W.energy -= cost;
    markCooldown(tool);
    return { ok: true, cost };
  }

  // Budgeted debt: biosphere pays. Item 107.
  const short = cost - W.energy;
  W.energy = 0;
  W.energyDebt += short;
  const drain = Math.min(0.15, short / 200);
  for (let c = 0; c < W.life.length; c += 3) {
    W.life[c] *= 1 - drain;
  }
  W.meanLife = Math.max(0, W.meanLife * (1 - drain));
  markCooldown(tool);
  return { ok: true, cost, debt: short, note: 'Overspent — biosphere drawn down' };
}

function formatCooldown(yr) {
  if (yr > 1e6) return `${(yr / 1e6).toFixed(1)} Myr`;
  if (yr > 1e3) return `${(yr / 1e3).toFixed(0)} kyr`;
  return `${yr | 0} yr`;
}

/** Income tick — biosphere matters. Item 101 / 105 / 111. */
export function economyTick(W) {
  initEconomy(W);
  const arch = W.archetype || 'gardener';
  let income = 0.5 + W.health * 1.5 + W.meanLife;
  if (arch === 'gardener') income = 0.4 + W.health * 2.0 + W.meanLife * 1.5;
  if (arch === 'vandal') income = 0.3 + (1 - W.meanLife) * 1.2 + (W.gases.dust || 0) * 2;
  if (arch === 'scientist') income = 0.6 + (W.attribution?.acts ? 0 : 0.4) + W.health;

  W.energyIncome = income;
  const mode = scarcityMode(W);
  if (mode !== SCARCITY.free) {
    const add = income * 0.05;
    if (W.energyDebt > 0) {
      const pay = Math.min(W.energyDebt, add);
      W.energyDebt -= pay;
      W.energy = Math.min(W.energyCap, W.energy + (add - pay) * 0.5);
    } else {
      W.energy = Math.min(W.energyCap, W.energy + add);
      // Bank surplus across eras. Item 105.
      if (W.energy > W.energyCap * 0.9) {
        W.bankedEnergy = Math.min(500, (W.bankedEnergy || 0) + add * 0.2);
      }
    }
  }
}

export function pricePreview(tool, magnitude = 1, opts = {}) {
  const cost = thermoCost(tool, magnitude, opts);
  const mode = scarcityMode(W);
  const cd = onCooldown(tool);
  return {
    tool,
    cost: mode === SCARCITY.free ? 0 : cost,
    listed: cost,
    balance: W.energy,
    income: W.energyIncome,
    cooldownYr: cd,
    debt: W.energyDebt || 0,
    banked: W.bankedEnergy || 0,
    free: isObservation(tool) || mode === SCARCITY.free,
  };
}
