/** Sculpt causes — crust, plates, plumes, rivers, gateways, stamps.
 *  Backlog land 15–29. */

import { clamp } from '../../math.js';
import { NC, DIR, NBR } from '../../sphere.js';
import { W, chronLog } from '../../world.js';
import { paintBrush, beginStroke } from './brush.js';
import { issueReceipt } from './receipt.js';
import { reclassifyBoundaries } from '../tectonics.js';

/** Raise by thickening crust; elevation emerges via isostasy later. Item 15. */
export function thickenCrust(cell, amount = 0.04) {
  beginStroke(['h', 'crust']);
  const r = paintBrush(cell, (c, f) => {
    W.crust[c] = Math.min(1.8, W.crust[c] + amount * f);
    // Soft hint of uplift — isostasy will settle
    W.h[c] = Math.min(1.3, W.h[c] + amount * 0.45 * f);
  });
  issueReceipt({
    tool: 'raise',
    cell,
    intent: 'Thicken crust',
    expected: `Crust +${amount} · elevation will settle isostatically`,
    delayYr: 5e4,
    delayLabel: 'Isostatic rebound after uplift',
  });
  chronLog(W.year, 'sculpt', cell, 1, 'Crust thickened');
  return { ok: true, brush: r };
}

export function thinCrust(cell, amount = 0.04) {
  beginStroke(['h', 'crust']);
  const r = paintBrush(cell, (c, f) => {
    W.crust[c] = Math.max(0.05, W.crust[c] - amount * f);
    W.h[c] = Math.max(-1.2, W.h[c] - amount * 0.5 * f);
  });
  issueReceipt({ tool: 'lower', cell, intent: 'Thin crust', expected: 'Subsidence as root melts away' });
  chronLog(W.year, 'sculpt', cell, 1, 'Crust thinned');
  return { ok: true, brush: r };
}

/** Paint continental vs oceanic crust. Item 20. */
export function paintCrustType(cell, oceanic = false) {
  if (!W.crustType) W.crustType = new Uint8Array(NC);
  beginStroke(['crust', 'h']);
  paintBrush(cell, (c, f) => {
    if (f < 0.3) return;
    W.crustType[c] = oceanic ? 1 : 0;
    if (oceanic) {
      W.crust[c] = Math.min(W.crust[c], 0.28);
      if (W.plates?.[W.plateId[c]]) W.plates[W.plateId[c]].oceanic = true;
    } else {
      W.crust[c] = Math.max(W.crust[c], 0.5);
    }
  });
  issueReceipt({
    tool: 'crust',
    cell,
    intent: oceanic ? 'Paint oceanic crust' : 'Paint continental crust',
    expected: oceanic ? 'Density ↑ · will subduct preferentially' : 'Buoyant continent',
  });
  return { ok: true };
}

/** Redirect a plate's Euler pole. Item 16. */
export function setPlatePole(cell, poleDir = null, omega = null) {
  const pid = W.plateId[cell];
  const pl = W.plates?.[pid];
  if (!pl) return { ok: false, note: 'No plate' };
  if (poleDir) {
    const l = Math.hypot(...poleDir) || 1;
    pl.pole = [poleDir[0] / l, poleDir[1] / l, poleDir[2] / l];
  } else {
    // Nudge pole toward cell
    pl.pole = [DIR[cell * 3], DIR[cell * 3 + 1], DIR[cell * 3 + 2]];
  }
  if (omega != null) pl.omega = clamp(omega, -0.2, 0.2);
  else pl.omega = clamp(pl.omega * 1.4 + 0.02, -0.15, 0.15);
  issueReceipt({
    tool: 'plate',
    cell,
    intent: `Redirect plate ${pid}`,
    expected: `ω=${pl.omega.toFixed(3)} · next 200 Myr rewrite themselves`,
    delayYr: 2e7,
    delayLabel: `Plate ${pid} reconfiguration visible in geography`,
  });
  chronLog(W.year, 'tool', cell, pid, `Plate ${pid} pole set`);
  reclassifyBoundaries(W);
  return { ok: true, plate: pid, omega: pl.omega };
}

/** Force rift along a corridor. Item 17. */
export function drawRift(cell) {
  beginStroke(['h', 'crust', 'bound']);
  paintBrush(cell, (c, f) => {
    W.crust[c] *= 1 - 0.35 * f;
    W.h[c] = Math.min(W.h[c], W.seaLevel - 0.02 * f);
    W.bound[c] = 0; // divergent
  });
  issueReceipt({ tool: 'plate', cell, intent: 'Draw rift', expected: 'Crust thins · seaway may flood' });
  chronLog(W.year, 'sculpt', cell, 1, 'Rift drawn');
  return { ok: true };
}

/** Force orogeny between continents. Item 18. */
export function forceOrogeny(cell) {
  beginStroke(['h', 'crust']);
  paintBrush(cell, (c, f) => {
    W.crust[c] = Math.min(1.8, W.crust[c] + 0.25 * f);
    W.h[c] = Math.min(1.4, W.h[c] + 0.12 * f);
    W.bound[c] = 1;
    W.age[c] = 0; // young mountain
  });
  issueReceipt({
    tool: 'raise',
    cell,
    intent: 'Force orogeny',
    expected: 'Range with root · will erode into plateau',
    delayYr: 1e7,
    delayLabel: 'Orogen eroded toward plateau',
  });
  return { ok: true };
}

/** Place mantle plume in mantle frame. Item 19. */
export function placePlume(cell, strength = 0.25) {
  if (!W.hotspots) W.hotspots = [];
  const pos = [DIR[cell * 3], DIR[cell * 3 + 1], DIR[cell * 3 + 2]];
  W.hotspots.push({ pos, strength, fixed: true, born: W.ageYr });
  W.volcanoes.push({ cell, magma: 1.4, next: 0, hotspot: true });
  W.crust[cell] = Math.max(W.crust[cell], 0.5);
  issueReceipt({
    tool: 'plume',
    cell,
    intent: 'Place mantle plume',
    expected: 'Hotspot fixed in mantle · island chain as plates drift',
    delayYr: 5e7,
    delayLabel: 'Hotspot track / island chain emerging',
  });
  chronLog(W.year, 'eruption', cell, strength, 'Mantle plume placed');
  return { ok: true };
}

/** Carve a river channel for D8 to adopt. Item 21. */
export function carveRiver(cell) {
  beginStroke(['h']);
  let c = cell;
  const path = [c];
  for (let step = 0; step < 40; step++) {
    W.h[c] = Math.max(-1, W.h[c] - 0.025);
    W.flow[c] = Math.max(W.flow[c] || 0, 0.6);
    let best = -1, bh = W.h[c];
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (n >= 0 && W.h[n] < bh) { bh = W.h[n]; best = n; }
    }
    if (best < 0 || W.h[best] < W.seaLevel) break;
    c = best;
    path.push(c);
  }
  issueReceipt({
    tool: 'river',
    cell,
    intent: 'Carve river',
    expected: `${path.length}-cell channel · flow model may keep or abandon`,
  });
  chronLog(W.year, 'sculpt', cell, path.length, 'River carved');
  return { ok: true, path };
}

/** Open/close ocean gateway. Item 22. */
export function setGateway(cell, open = true) {
  beginStroke(['h', 'crust']);
  paintBrush(cell, (c, f) => {
    if (open) {
      W.h[c] = Math.min(W.h[c], W.seaLevel - 0.04 * f);
      W.crust[c] = Math.min(W.crust[c], 0.3);
    } else {
      W.h[c] = Math.max(W.h[c], W.seaLevel + 0.03 * f);
      W.crust[c] = Math.max(W.crust[c], 0.45);
    }
  }, { radiusRad: 0.06 });
  issueReceipt({
    tool: 'gateway',
    cell,
    intent: open ? 'Open gateway' : 'Close gateway',
    expected: 'Circulation / climate reorganise',
    delayYr: 1e5,
    delayLabel: 'Gateway climate response underway',
  });
  return { ok: true };
}

/** Sea level lever with ice budget. Item 23. */
export function shiftSeaLevel(delta) {
  const before = W.seaLevel;
  W.seaLevel = clamp(W.seaLevel + delta, 0.15, 0.85);
  // Conserve: raise sea → melt ice; lower → grow ice
  if (delta > 0) {
    for (let c = 0; c < NC; c++) {
      if (W.iceLand[c] > 0.1) W.iceLand[c] *= 1 - delta * 2;
      W.ice[c] = Math.max(W.iceLand[c], W.iceSea?.[c] || 0);
    }
  } else {
    for (let c = 0; c < NC; c++) {
      if (W.h[c] > W.seaLevel && W.temp[c] < 0.4) {
        W.iceLand[c] = Math.min(1, W.iceLand[c] + (-delta) * 1.5);
        W.ice[c] = Math.max(W.ice[c], W.iceLand[c]);
      }
    }
  }
  issueReceipt({
    tool: 'sealevel',
    cell: 0,
    intent: 'Sea level lever',
    expected: `${before.toFixed(3)} → ${W.seaLevel.toFixed(3)} · ice budget answered`,
    units: 'sea fraction',
  });
  chronLog(W.year, 'tool', 0, W.seaLevel, `Sea level → ${W.seaLevel.toFixed(3)}`);
  return { ok: true, seaLevel: W.seaLevel };
}

/** Local erosion freeze / accelerate. Item 24. */
export function setErosionRate(cell, rate = 0) {
  if (!W.erosionLock) W.erosionLock = new Float32Array(NC);
  paintBrush(cell, (c, f) => {
    W.erosionLock[c] = rate; // 0 freeze, >1 accelerate
  });
  issueReceipt({
    tool: 'raise',
    cell,
    intent: rate < 0.1 ? 'Freeze erosion' : 'Accelerate erosion',
    expected: rate < 0.1 ? 'Canyon held open' : 'Myr of stream power in one tick',
  });
  return { ok: true };
}

/** Geological stamps. Item 25. */
export function stampTerrain(cell, kind = 'rift') {
  beginStroke(['h', 'crust', 'age', 'rock']);
  const stamps = {
    shield: (c, f) => { W.crust[c] = Math.max(W.crust[c], 0.7 * f + 0.3); W.age[c] = 800; W.rock[c] = 2; },
    craton: (c, f) => { W.crust[c] = Math.max(W.crust[c], 0.85); W.age[c] = 1200; W.h[c] = Math.max(W.h[c], 0.55); },
    arc: (c, f) => { W.crust[c] += 0.15 * f; W.h[c] += 0.08 * f; W.bound[c] = 1; W.volcanoes.push({ cell: c, magma: 0.8, next: 2 }); },
    trench: (c, f) => { W.h[c] -= 0.15 * f; W.crust[c] *= 0.7; W.bound[c] = 1; },
    rift: (c, f) => { W.crust[c] *= 1 - 0.4 * f; W.h[c] -= 0.08 * f; W.bound[c] = 0; },
    basin: (c, f) => { W.h[c] -= 0.2 * f; W.rock[c] = 1; W.age[c] = 0; },
  };
  const fn = stamps[kind] || stamps.rift;
  paintBrush(cell, fn);
  issueReceipt({ tool: 'raise', cell, intent: `Stamp ${kind}`, expected: `Geological assembly: ${kind}` });
  return { ok: true, kind };
}

/** Soil paint. Item 29. */
export function paintSoil(cell, amount = 0.2) {
  beginStroke(['soil']);
  paintBrush(cell, (c, f) => {
    W.soil[c] = clamp(W.soil[c] + amount * f, 0, 1);
  });
  issueReceipt({ tool: 'soil', cell, intent: amount > 0 ? 'Lay soil' : 'Strip soil', expected: 'Fertility via nutrientN' });
  return { ok: true };
}

/** Preview settled elevation ghost. Item 27. */
export function isostaticPreview(cell) {
  const thick = W.crust[cell];
  const dens = W.crustType?.[cell] ? 3.0 : 2.7;
  const settled = (thick - 0.3) * (2.7 / dens) * 0.8 + W.seaLevel;
  return { cell, now: W.h[cell], settled, delta: settled - W.h[cell] };
}

/** Holding mountain above equilibrium costs energy each tick. Item 28. */
export function resistTick(W) {
  if (!W.budgetMode && W.scarcityMode === 'free') return;
  let tax = 0;
  for (let c = 0; c < NC; c += 11) {
    const prev = isostaticPreview(c);
    if (prev.delta > 0.08 && W.h[c] > W.seaLevel) tax += prev.delta * 0.002;
  }
  if (tax > 0 && W.energy != null) W.energy = Math.max(0, W.energy - tax);
}
