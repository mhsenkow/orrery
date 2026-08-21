/** Per-cell trophic fields — producers, grazers, hunters, detritus.
 *  Planet-wide `W.trophic.herb = nppMean * 0.1` treated rainforest and ice
 *  as the same load. These arrays are the local pyramid.
 *
 *  Also: discrete carcasses (kill → place → scavenge → soil), and a
 *  predation-pressure / landscape-of-fear field prey read when fleeing. */

import { clamp } from '../math.js';
import { NC, NBR } from '../sphere.js';

function ensure(W) {
  if (!W.trophProd || W.trophProd.length !== NC) {
    W.trophProd = new Float32Array(NC);
    W.trophHerb = new Float32Array(NC);
    W.trophCarn = new Float32Array(NC);
    W.trophDecomp = new Float32Array(NC);
    W.trophOccHerb = new Float32Array(NC);
    W.trophOccCarn = new Float32Array(NC);
  }
  if (!W.preyFear || W.preyFear.length !== NC) W.preyFear = new Float32Array(NC);
  if (!W.carcassField || W.carcassField.length !== NC) W.carcassField = new Float32Array(NC);
  if (!W.carcasses) W.carcasses = [];
}

export function trophicTick(W) {
  ensure(W);
  const prod = W.trophProd, herb = W.trophHerb, carn = W.trophCarn, decomp = W.trophDecomp;
  const occH = W.trophOccHerb, occC = W.trophOccCarn;
  const fear = W.preyFear, carcassF = W.carcassField;
  let hSum = 0, cSum = 0, pSum = 0, dSum = 0;
  for (let c = 0; c < NC; c++) {
    occH[c] *= 0.82;
    occC[c] *= 0.82;
    fear[c] *= 0.88;
    carcassF[c] *= 0.9;
    const ice = W.ice?.[c] || 0;
    const npp = W.npp?.[c] || 0;
    const life = W.life?.[c] || 0;
    const land = W.h[c] >= W.seaLevel;
    prod[c] = npp;
    const baseHerb = life * (land ? 0.14 : 0.045) * (1 - ice * 0.75);
    herb[c] = clamp(baseHerb + occH[c], 0, 1);
    carn[c] = clamp(herb[c] * 0.09 + occC[c] + fear[c] * 0.15, 0, 1);
    decomp[c] = clamp((W.detritus?.[c] || 0) + carcassF[c] * 0.35, 0, 1);
    pSum += prod[c]; hSum += herb[c]; cSum += carn[c]; dSum += decomp[c];
  }
  carcassTick(W);
  const n = NC || 1;
  W.trophic = W.trophic || { prod: 0, herb: 0, carn: 0, decomp: 0 };
  W.trophic.prod = pSum / n;
  W.trophic.herb = hSum / n;
  W.trophic.carn = cSum / n;
  W.trophic.decomp = dSum / n;
  W.herbivore = clamp(W.trophic.herb * 2, 0.01, 1);
  W.carnivore = clamp(W.trophic.carn * 4, 0.01, 0.8);
}

/** Drop a discrete carcass at a kill site. Mass feeds scavengers and soil. */
export function dropCarcass(W, c, mass = 1, kind = 7) {
  ensure(W);
  const m = Math.max(0.2, mass);
  W.carcasses.push({ cell: c, mass: m, age: 0, kind, fresh: 1 });
  W.carcassField[c] = clamp((W.carcassField[c] || 0) + m * 0.45, 0, 1);
  for (let k = 0; k < 4; k++) {
    const nb = NBR[c * 4 + k];
    W.carcassField[nb] = clamp((W.carcassField[nb] || 0) + m * 0.12, 0, 1);
  }
  if (W.detritus?.length === NC) {
    W.detritus[c] = Math.min(1, (W.detritus[c] || 0) + 0.02 * m);
  }
  W.carcassCount = (W.carcasses?.length) || 0;
}

function carcassTick(W) {
  const list = W.carcasses || [];
  if (!list.length) { W.carcassCount = 0; return; }
  const next = [];
  for (const car of list) {
    car.age++;
    car.fresh = Math.max(0, car.fresh - 0.04);
    const c = car.cell;
    const leak = car.mass * 0.035;
    car.mass = Math.max(0, car.mass - leak);
    if (W.soil?.[c] != null) W.soil[c] = Math.min(1, (W.soil[c] || 0) + leak * 0.08);
    if (W.nutrientN?.[c] != null) {
      W.nutrientN[c] = Math.min(1, (W.nutrientN[c] || 0) + leak * 0.04);
      W.nutrientP[c] = Math.min(1, (W.nutrientP[c] || 0) + leak * 0.03);
    }
    if (W.carcassField) {
      W.carcassField[c] = clamp(Math.max(W.carcassField[c] || 0, car.mass * 0.35), 0, 1);
    }
    if (car.mass > 0.05 && car.age < 80) next.push(car);
  }
  W.carcasses = next;
  W.carcassCount = next.length;
}

/** Scavenge at a cell: returns energy restored, reduces local carcasses. */
export function scavengeAt(W, c, appetite = 0.2) {
  ensure(W);
  if ((W.carcassField[c] || 0) < 0.04) return 0;
  let taken = 0;
  for (const car of W.carcasses || []) {
    if (car.cell !== c && !isNbr(c, car.cell)) continue;
    const bite = Math.min(car.mass, appetite - taken);
    if (bite <= 0) break;
    car.mass -= bite;
    taken += bite;
  }
  if (taken > 0) {
    W.carcassField[c] = clamp((W.carcassField[c] || 0) - taken * 0.5, 0, 1);
  }
  return taken;
}

function isNbr(a, b) {
  if (a === b) return true;
  for (let k = 0; k < 4; k++) if (NBR[a * 4 + k] === b) return true;
  return false;
}

export function noteGraze(W, c, amt) {
  if (W.trophOccHerb && c >= 0) W.trophOccHerb[c] = clamp((W.trophOccHerb[c] || 0) + amt * 6, 0, 1);
  /* Herbivory as a number, not just a stain on the map. Without a total there
     was no way to ask how much of the standing crop the herds actually eat —
     which is the question the grazing test was reaching for when it compared
     grazed cells against ungrazed ones and found them *richer*, because grazers
     pick the best ground and habitat choice swamps the bite. */
  W.grazeTotal = (W.grazeTotal || 0) + amt;
}

export function noteHunt(W, c, amt = 0.22) {
  ensure(W);
  if (c < 0) return;
  W.trophOccCarn[c] = clamp((W.trophOccCarn[c] || 0) + amt, 0, 1);
  noteFear(W, c, amt * 1.4);
}

/** Landscape of fear — kills and near-misses raise predation pressure. */
export function noteFear(W, c, amt = 0.25) {
  ensure(W);
  if (c < 0) return;
  W.preyFear[c] = clamp((W.preyFear[c] || 0) + amt, 0, 1);
  for (let k = 0; k < 4; k++) {
    const nb = NBR[c * 4 + k];
    W.preyFear[nb] = clamp((W.preyFear[nb] || 0) + amt * 0.45, 0, 1);
  }
}

export function fearAt(W, c) {
  return W.preyFear?.[c] || 0;
}

export function carcassAt(W, c) {
  return W.carcassField?.[c] || 0;
}
