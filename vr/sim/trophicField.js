/** Per-cell trophic fields — producers, grazers, hunters, detritus.
 *  Planet-wide `W.trophic.herb = nppMean * 0.1` treated rainforest and ice
 *  as the same load. These arrays are the local pyramid. */

import { clamp } from '../math.js';
import { NC } from '../sphere.js';

function ensure(W) {
  if (!W.trophProd || W.trophProd.length !== NC) {
    W.trophProd = new Float32Array(NC);
    W.trophHerb = new Float32Array(NC);
    W.trophCarn = new Float32Array(NC);
    W.trophDecomp = new Float32Array(NC);
    W.trophOccHerb = new Float32Array(NC);
    W.trophOccCarn = new Float32Array(NC);
  }
}

export function trophicTick(W) {
  ensure(W);
  const prod = W.trophProd, herb = W.trophHerb, carn = W.trophCarn, decomp = W.trophDecomp;
  const occH = W.trophOccHerb, occC = W.trophOccCarn;
  let hSum = 0, cSum = 0, pSum = 0, dSum = 0;
  for (let c = 0; c < NC; c++) {
    occH[c] *= 0.82;
    occC[c] *= 0.82;
    const ice = W.ice?.[c] || 0;
    const npp = W.npp?.[c] || 0;
    const life = W.life?.[c] || 0;
    const land = W.h[c] >= W.seaLevel;
    prod[c] = npp;
    const baseHerb = life * (land ? 0.14 : 0.045) * (1 - ice * 0.75);
    herb[c] = clamp(baseHerb + occH[c], 0, 1);
    carn[c] = clamp(herb[c] * 0.09 + occC[c], 0, 1);
    decomp[c] = clamp(W.detritus?.[c] || 0, 0, 1);
    pSum += prod[c]; hSum += herb[c]; cSum += carn[c]; dSum += decomp[c];
  }
  const n = NC || 1;
  W.trophic = W.trophic || { prod: 0, herb: 0, carn: 0, decomp: 0 };
  W.trophic.prod = pSum / n;
  W.trophic.herb = hSum / n;
  W.trophic.carn = cSum / n;
  W.trophic.decomp = dSum / n;
  W.herbivore = clamp(W.trophic.herb * 2, 0.01, 1);
  W.carnivore = clamp(W.trophic.carn * 4, 0.01, 0.8);
}

export function noteGraze(W, c, amt) {
  if (W.trophOccHerb && c >= 0) W.trophOccHerb[c] = clamp((W.trophOccHerb[c] || 0) + amt * 6, 0, 1);
}

export function noteHunt(W, c, amt = 0.22) {
  if (W.trophOccCarn && c >= 0) W.trophOccCarn[c] = clamp((W.trophOccCarn[c] || 0) + amt, 0, 1);
}
