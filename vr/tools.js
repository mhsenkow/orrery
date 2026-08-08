/** God tools & disasters — all write through shared world mutators. */

import { clamp } from './math.js';
import { NC, DIR, NBR, dirToCell } from './sphere.js';
import { W, applyImpact, chronLog, seedLife } from './world.js';
import { injectGas } from './sim/atmo.js';
import { startTsunami } from './sim/hydro.js';

export const TOOLS = [
  { id: 'inspect', name: 'Inspect', key: 'q', cost: 0 },
  { id: 'solar', name: 'Solar±', key: 't', cost: 5 },
  { id: 'co2', name: 'CO₂ inject', key: 'c', cost: 8 },
  { id: 'o2', name: 'O₂ inject', key: 'o', cost: 8 },
  { id: 'seed', name: 'Seed life', key: 'v', cost: 10 },
  { id: 'raise', name: 'Raise land', key: 'e', cost: 6 },
  { id: 'lower', name: 'Lower land', key: 'f', cost: 6 },
  { id: 'meteor', name: 'Meteor', key: 'm', cost: 25 },
  { id: 'volcano', name: 'Force erupt', key: 'u', cost: 15 },
  { id: 'quake', name: 'Quake', key: 'g', cost: 12 },
  { id: 'plague', name: 'Plague', key: 'p', cost: 20 },
  { id: 'ice', name: 'Ice meteor', key: 'i', cost: 12 },
  { id: 'tilt', name: 'Tilt axis', key: 'y', cost: 10 },
  { id: 'spin', name: 'Spin±', key: 'k', cost: 8 },
  { id: 'buster', name: 'Planet buster', key: 'b', cost: 80 },
];

export let activeTool = 'inspect';
export function setTool(id) { activeTool = id; }

function afford(cost) {
  if (!W.budgetMode) return true;
  if (W.energy < cost) return false;
  W.energy -= cost;
  return true;
}

/** Ray–sphere hit → cell index, or -1. */
export function pickCell(origin, direction, planetPos, planetScale, planetQ) {
  // Transform ray into planet-local space
  const ocx = (origin[0] - planetPos[0]) / planetScale;
  const ocy = (origin[1] - planetPos[1]) / planetScale;
  const ocz = (origin[2] - planetPos[2]) / planetScale;
  // Inverse rotate by planet quaternion
  const q = planetQ;
  const ix = -q[0], iy = -q[1], iz = -q[2], iw = q[3];
  const rot = (vx, vy, vz) => {
    const tx = 2 * (iy * vz - iz * vy), ty = 2 * (iz * vx - ix * vz), tz = 2 * (ix * vy - iy * vx);
    return [vx + iw * tx + (iy * tz - iz * ty), vy + iw * ty + (iz * tx - ix * tz), vz + iw * tz + (ix * ty - iy * tx)];
  };
  const o = rot(ocx, ocy, ocz);
  const d0 = rot(direction[0], direction[1], direction[2]);
  const dl = Math.hypot(d0[0], d0[1], d0[2]) || 1;
  const dx = d0[0] / dl, dy = d0[1] / dl, dz = d0[2] / dl;

  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (o[0] * dx + o[1] * dy + o[2] * dz);
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return -1;
  const hx = o[0] + dx * t, hy = o[1] + dy * t, hz = o[2] + dz * t;
  return dirToCell(hx, hy, hz);
}

export function paintBrush(cell, fn, radius = 2) {
  if (cell < 0) return;
  const cx = DIR[cell * 3], cy = DIR[cell * 3 + 1], cz = DIR[cell * 3 + 2];
  const thresh = Math.cos(radius * 0.04);
  for (let c = 0; c < NC; c++) {
    const d = DIR[c * 3] * cx + DIR[c * 3 + 1] * cy + DIR[c * 3 + 2] * cz;
    if (d > thresh) fn(c, (d - thresh) / (1 - thresh + 1e-6));
  }
}

export function useToolAt(cell, extra = {}) {
  if (cell < 0) return null;
  const tool = TOOLS.find((t) => t.id === activeTool) || TOOLS[0];
  if (!afford(tool.cost)) return { error: 'No energy' };

  switch (tool.id) {
    case 'inspect':
      return inspectCell(cell);
    case 'solar': {
      const d = extra.delta ?? 0.05;
      W.solar = clamp(W.solar + d, 0.3, 2.0);
      W._baseSolar = W.solar;
      chronLog(W.year, 'tool', cell, W.solar, `Solar → ${W.solar.toFixed(2)}`);
      break;
    }
    case 'co2':
      injectGas(W, 'CO2', 0.02);
      chronLog(W.year, 'tool', cell, W.gases.CO2, 'CO₂ injection');
      break;
    case 'o2':
      injectGas(W, 'O2', 0.02);
      chronLog(W.year, 'tool', cell, W.gases.O2, 'O₂ injection');
      break;
    case 'seed':
      seedLife(W, cell, W.unlockedClass);
      chronLog(W.year, 'seed', cell, 1, 'Life seeded');
      break;
    case 'raise':
      paintBrush(cell, (c, f) => { W.h[c] = Math.min(1.2, W.h[c] + 0.06 * f); W.crust[c] += 0.03 * f; });
      chronLog(W.year, 'sculpt', cell, 1, 'Uplift');
      break;
    case 'lower':
      paintBrush(cell, (c, f) => { W.h[c] = Math.max(-1.2, W.h[c] - 0.06 * f); });
      chronLog(W.year, 'sculpt', cell, 1, 'Subsidence');
      break;
    case 'meteor': {
      const power = extra.power ?? 0.8;
      applyImpact(cell, power);
      break;
    }
    case 'ice':
      paintBrush(cell, (c, f) => {
        W.temp[c] = Math.max(0, W.temp[c] - 0.25 * f);
        W.iceLand[c] = Math.min(1, W.iceLand[c] + 0.4 * f);
        W.ice[c] = Math.max(W.ice[c], W.iceLand[c]);
      }, 3);
      W.gases.H2O = Math.min(0.2, W.gases.H2O + 0.01);
      chronLog(W.year, 'tool', cell, 1, 'Ice meteor');
      break;
    case 'volcano': {
      W.volcanoes.push({ cell, magma: 1.5, next: 0 });
      W.ash[cell] = 1;
      W.gases.sulphate = Math.min(0.3, W.gases.sulphate + 0.04);
      chronLog(W.year, 'eruption', cell, 1.5, 'Forced eruption');
      break;
    }
    case 'quake':
      W.strain[cell] = 0;
      W.h[cell] -= 0.03;
      startTsunami(W, cell, 0.7);
      chronLog(W.year, 'quake', cell, 1, 'Triggered quake');
      break;
    case 'plague':
      W.plague = Math.min(1, W.plague + 0.5);
      chronLog(W.year, 'plague', cell, W.plague, 'Plague released');
      break;
    case 'tilt':
      W.obliquity = clamp(W.obliquity + (extra.delta ?? 0.1), 0, 0.8);
      W._baseObliquity = W.obliquity;
      W.rule.obliquity = W.obliquity;
      chronLog(W.year, 'tool', cell, W.obliquity, `Obliquity → ${(W.obliquity * 180 / Math.PI).toFixed(0)}°`);
      break;
    case 'spin':
      W.rotationPeriod = clamp(W.rotationPeriod * (extra.delta ?? 0.8), 0.15, 40);
      chronLog(W.year, 'tool', cell, W.rotationPeriod, `Day → ${W.rotationPeriod.toFixed(2)}`);
      break;
    case 'buster':
      if (!extra.confirm) return { needConfirm: true };
      for (let c = 0; c < NC; c++) {
        W.h[c] -= 0.3 + Math.random() * 0.4;
        W.life[c] = 0;
        W.temp[c] = 1.4;
      }
      W.gases.dust = 0.5;
      W.state = 'moist-greenhouse';
      chronLog(W.year, 'buster', cell, 10, 'PLANET BUSTER');
      break;
    default:
      break;
  }
  return { ok: true, tool: tool.id };
}

export function inspectCell(cell) {
  return {
    cell,
    h: W.h[cell],
    temp: W.temp[cell],
    moist: W.moist[cell],
    life: W.life[cell],
    lifeClass: W.lifeClass[cell],
    ice: W.ice[cell],
    iceLand: W.iceLand[cell],
    iceSea: W.iceSea[cell],
    plate: W.plateId[cell],
    bound: W.bound[cell],
    age: W.age[cell],
    rock: W.rock[cell],
    flow: W.flow[cell],
    clouds: W.clouds[cell],
    ore: W.ore[cell],
    soil: W.soil[cell],
    seaLevel: W.seaLevel,
  };
}

/** Finger of God — delete / boost life at cell. */
export function fingerOfGod(cell, mode = 'boost') {
  if (cell < 0) return;
  if (mode === 'delete') {
    paintBrush(cell, (c) => { W.life[c] = 0; }, 1);
    chronLog(W.year, 'finger', cell, 0, 'Erased');
  } else {
    seedLife(W, cell, W.unlockedClass);
  }
}
