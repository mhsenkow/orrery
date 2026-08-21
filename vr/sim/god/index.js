/** God-game layer — init + per-tick. */

import { initReceipts, tickReceipts } from './receipt.js';
import { initEconomy, economyTick } from './economy.js';
import { initObserve, gaiaPolicyTick, shouldHaltFF } from './observe.js';
import { initNotice, noticeTick } from './notice.js';
import { aerosolTick, thermostatTick, moonTick } from './climate.js';
import { lipTick, pathogenTick, disasterChainTick } from './disaster.js';
import { resistTick } from './sculpt.js';
import { evaluateScenario } from './scenario.js';
import { rngOf } from '../rng.js';

export function initGod(W) {
  initReceipts(W);
  initEconomy(W);
  initObserve(W);
  initNotice(W);
  if (!W.albedoPaint) W.albedoPaint = new Float32Array(W.life.length);
  if (!W.refuge) W.refuge = new Float32Array(W.life.length);
  if (!W.touchHeat) W.touchHeat = new Float32Array(W.life.length);
  /* One, not zero. `erosionLock` is a multiplier the sculpt tools write — "0
     freeze, >1 accelerate" — so a fresh all-zeros array reads as *erosion frozen
     on every cell of the planet*, and `initGod` runs on every world. Measured on
     the demo Earth: all 7 088 land cells locked, no fluvial erosion, no glacial
     carving, not one grain of sediment anywhere, mountains that never wear down.
     The tools still write 0 to freeze a place deliberately. */
  if (!W.erosionLock) {
    W.erosionLock = new Float32Array(W.life.length);
    W.erosionLock.fill(1);
  }
  W.argueResponses = W.argueResponses || [];
}

export function godTick(W, log) {
  if (!W.receipts) initGod(W);
  aerosolTick(W);
  thermostatTick(W);
  moonTick(W);
  lipTick(W);
  pathogenTick(W);
  disasterChainTick(W, log);
  tickReceipts(W, log);
  economyTick(W);
  resistTick(W);
  // Gaia character log (replaces silent nudge when autopilot on)
  if (W.autopilot) gaiaPolicyTick(W, log);
  noticeTick(W, log);
  if (W.scenarioId) evaluateScenario(W);

  // Refuge suppresses local extinction pressure
  if (W.refuge && W.plague > 0) {
    for (let c = 0; c < W.life.length; c += 7) {
      if (W.refuge[c] > 0.4) W.life[c] = Math.min(1, W.life[c] + 0.002);
    }
  }

  // Obliquity wander without moon
  if (W.obliquityWander) {
    W.obliquity = Math.max(0, Math.min(1.2, W.obliquity + (rngOf(W, 'rngGod')() - 0.5) * 0.0002));
  }
}

export { shouldHaltFF };

export * from './brush.js';
export * from './receipt.js';
export * from './economy.js';
export * from './life.js';
export * from './sculpt.js';
export * from './climate.js';
export * from './disaster.js';
export * from './genesis.js';
export * from './scenario.js';
export * from './observe.js';
export * from './notice.js';
export * from './shelf.js';
