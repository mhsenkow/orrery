/** Picture statistics for the surface pass — CPU, no GPU.
 *  Four artefact numbers plus zonal fraction, drainage density, ramp
 *  saturation and ecotone share. `node vr/sim/surfaceStats.js` prints them. */

import { NC, N, NF, NBR, DIR, AREA } from '../sphere.js';
import { GROUND } from './present.js';
import { BIOMES } from './ecology.js';

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/** Same two-scale optical ramp as `oceanDepth01` in render.js. */
export function oceanDepth01(depth) {
  const z = Math.max(0, depth);
  const shelf = 1 - Math.exp(-z * 6.5);
  const deep = Math.log1p(z * 4.2) / Math.log1p(5.04);
  return clamp(shelf * 0.62 + deep * 0.38, 0, 1);
}

/** Fraction of variance explained by the zonal mean (18 latitude bins). */
export function zonalFraction(field) {
  const nBins = 18;
  const sum = new Float64Array(nBins);
  const cnt = new Float64Array(nBins);
  let mean = 0;
  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const b = clamp(((lat + 1) * 0.5 * nBins) | 0, 0, nBins - 1);
    sum[b] += field[c];
    cnt[b] += 1;
    mean += field[c];
  }
  mean /= NC || 1;
  const zmean = new Float64Array(nBins);
  for (let b = 0; b < nBins; b++) zmean[b] = cnt[b] ? sum[b] / cnt[b] : mean;
  let sst = 0, sse = 0;
  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const b = clamp(((lat + 1) * 0.5 * nBins) | 0, 0, nBins - 1);
    const d = field[c] - mean;
    const e = field[c] - zmean[b];
    sst += d * d;
    sse += e * e;
  }
  if (sst < 1e-12) return 0;
  return clamp(1 - sse / sst, 0, 1);
}

function biomeRGB(W, c) {
  const id = BIOMES[W.biome?.[c] ?? 0];
  const g1 = GROUND[id] || [80, 80, 80];
  const id2 = BIOMES[W.biome2?.[c] ?? 0];
  const g2 = GROUND[id2] || g1;
  const w = W.biomeMix?.[c] ?? 1;
  return [
    g1[0] * w + g2[0] * (1 - w),
    g1[1] * w + g2[1] * (1 - w),
    g1[2] * w + g2[2] * (1 - w),
  ];
}

/** Neighbour colour jumps on biome ground. Hard classification → long thin runs. */
export function neighbourDeltaE(W) {
  let n = 0, jumps = 0, sum = 0, max = 0;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) continue;
    const a = biomeRGB(W, c);
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      if (W.h[nb] < W.seaLevel) continue;
      const b = biomeRGB(W, nb);
      const de = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      n++;
      sum += de;
      if (de > max) max = de;
      if (de > 28) jumps++;
    }
  }
  return { pairs: n, mean: n ? sum / n : 0, max, jumpFrac: n ? jumps / n : 0 };
}

function isCoastal(W, c) {
  const sea = W.h[c] < W.seaLevel;
  for (let k = 0; k < 4; k++) {
    if ((W.h[NBR[c * 4 + k]] < W.seaLevel) !== sea) return true;
  }
  return false;
}

/** Fraction of coastline cells sitting on an axis-aligned run of length ≥ 4. */
export function coastlineStaircase(W) {
  const marked = new Uint8Array(NC);
  let coastN = 0;
  const markRun = (cells) => {
    if (cells.length < 4) return;
    for (const c of cells) marked[c] = 1;
  };
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j < N; j++) {
      const run = [];
      for (let i = 0; i < N; i++) {
        const c = f * NF + j * N + i;
        if (isCoastal(W, c)) {
          coastN++;
          run.push(c);
        } else {
          markRun(run);
          run.length = 0;
        }
      }
      markRun(run);
    }
    for (let i = 0; i < N; i++) {
      const run = [];
      for (let j = 0; j < N; j++) {
        const c = f * NF + j * N + i;
        if (isCoastal(W, c)) run.push(c);
        else {
          markRun(run);
          run.length = 0;
        }
      }
      markRun(run);
    }
  }
  let longN = 0;
  for (let c = 0; c < NC; c++) if (marked[c]) longN++;
  return { coastN, longN, frac: coastN ? longN / coastN : 0 };
}

/** Cross-face vs interior first difference of a scalar field. */
export function faceDiscontinuity(field) {
  let maxEdge = 0, maxInterior = 0, nEdge = 0, nInt = 0;
  let sumEdge = 0, sumInt = 0;
  for (let c = 0; c < NC; c++) {
    const f = (c / NF) | 0;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const d = Math.abs(field[n] - field[c]);
      if (((n / NF) | 0) !== f) {
        maxEdge = Math.max(maxEdge, d);
        sumEdge += d;
        nEdge++;
      } else {
        maxInterior = Math.max(maxInterior, d);
        sumInt += d;
        nInt++;
      }
    }
  }
  return {
    maxEdge, maxInterior,
    meanEdge: nEdge ? sumEdge / nEdge : 0,
    meanInterior: nInt ? sumInt / nInt : 0,
  };
}

/** Distinct 8-bit levels of a field along the equator. */
export function equatorLevels(field) {
  const seen = new Set();
  for (let c = 0; c < NC; c++) {
    if (Math.abs(DIR[c * 3 + 1]) > 0.04) continue;
    seen.add((clamp(field[c], 0, 1) * 255) | 0);
  }
  return seen.size;
}

export function drainageDensity(W) {
  let land = 0, f01 = 0, f05 = 0;
  let flowSum = 0;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) continue;
    land++;
    const f = W.flow[c] || 0;
    flowSum += f;
    if (f > 0.1) f01++;
    if (f > 0.5) f05++;
  }
  return {
    land,
    flow01: f01,
    flow05: f05,
    density: land ? f01 / land : 0,
    meanFlow: land ? flowSum / land : 0,
  };
}

export function oceanRampSat(W) {
  let n = 0, sat = 0;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= W.seaLevel) continue;
    n++;
    if (oceanDepth01(W.seaLevel - W.h[c]) > 0.95) sat++;
  }
  return { ocean: n, sat, frac: n ? sat / n : 0 };
}

export function pictureStats(W) {
  const de = neighbourDeltaE(W);
  const stair = coastlineStaircase(W);
  const disc = faceDiscontinuity(W.h);
  const drain = drainageDensity(W);
  const ramp = oceanRampSat(W);
  return {
    neighbourDE: de,
    staircase: stair,
    heightSeam: disc,
    equatorLevels: equatorLevels(W.h),
    zonal: {
      temp: zonalFraction(W.temp),
      precip: zonalFraction(W.precip),
      life: zonalFraction(W.life),
      moist: zonalFraction(W.moist),
    },
    drain,
    ramp,
    ecotoneFrac: W.ecotoneFrac || 0,
    area: AREA[0],
  };
}

function fmt(n, d = 3) { return Number(n).toFixed(d); }

export function formatPictureStats(s) {
  const L = [];
  L.push(`neighbour ΔE  mean ${fmt(s.neighbourDE.mean, 2)}  max ${fmt(s.neighbourDE.max, 1)}  jump>28 ${fmt(s.neighbourDE.jumpFrac)}`);
  L.push(`staircase     ${s.staircase.longN}/${s.staircase.coastN} coast cells in ≥4-run (${fmt(s.staircase.frac)})`);
  L.push(`height seam   edge ${fmt(s.heightSeam.meanEdge, 4)}  interior ${fmt(s.heightSeam.meanInterior, 4)}`);
  L.push(`equator lvls  ${s.equatorLevels} distinct 8-bit height steps`);
  L.push(`zonal R²      T ${fmt(s.zonal.temp)}  P ${fmt(s.zonal.precip)}  life ${fmt(s.zonal.life)}  moist ${fmt(s.zonal.moist)}`);
  L.push(`drainage      flow>0.1 ${s.drain.flow01}/${s.drain.land}  flow>0.5 ${s.drain.flow05}  dens ${fmt(s.drain.density)}`);
  L.push(`ocean ramp    sat>0.95 ${fmt(s.ramp.frac)} of ${s.ramp.ocean} ocean cells`);
  L.push(`ecotone       ${fmt(s.ecotoneFrac)} of land with top-membership < 0.7`);
  return L.join('\n');
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('surfaceStats.js');
if (isMain) {
  const { generate, W, RULESETS } = await import('../world.js');
  const { setResolution } = await import('../sphere.js');
  setResolution(32);
  generate(11, RULESETS.find((r) => r.id === 'terra') || RULESETS[0]);
  const s = pictureStats(W);
  console.log(formatPictureStats(s));
}
