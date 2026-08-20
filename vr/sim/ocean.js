/** Circulating ocean: wind-stress SWE, salt, overturning, ENSO, waves.
 *  Currents backlog: oceanvel, ekman, gyre, wbc, salt, moc, enso, mixedlayer, wavefield. */

import { NC, DIR, NBR, AREA } from '../sphere.js';
import { clamp } from '../math.js';
import { advectField } from './atmo.js';
import { upwindNeighbour } from './vecop.js';
import { stepShallowWater, geostrophyOf, ensureMask, divEN } from './swe.js';

export function initOcean(W) {
  W.oceanSurf = new Float32Array(NC);
  W.oceanDeep = new Float32Array(NC);
  W.oceanSalt = new Float32Array(NC);
  W.upwell = new Float32Array(NC);
  W.oceanU = new Float32Array(NC);
  W.oceanV = new Float32Array(NC);
  W.waveHt = new Float32Array(NC);
  W.mixDepth = new Float32Array(NC);
  W._tauE = new Float32Array(NC);
  W._tauN = new Float32Array(NC);
  W.conveyor = 1;
  W._amoc = 1;
  W._mocSv = 17;
  W.thermohaline = 'on';
  W._conveyorNote = null;
  W._ensoIndex = 0.04 * Math.sin((W.seed || 1) * 0.001);
  W._thermoclineTilt = 0;
  W._walkerSST = 0;
  W._ensoPhase = 'neutral';
  W._ssh = null;
  W._osweBoot = false;
  W._fluidMask = null;
  W._fluidMaskSea = null;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) {
      W.oceanSurf[c] = W.temp[c];
      W.oceanDeep[c] = 0.28;
      W.oceanSalt[c] = 0.35;
      W.mixDepth[c] = 0.35;
    }
  }
}

function dens(T, S) {
  return 1 - 0.16 * (T - 0.45) + 0.22 * (S - 0.35);
}

function compassFromUV(u, v) {
  if (u * u + v * v < 1e-6) return 'slack';
  const deg = (Math.atan2(v, u) * 180 / Math.PI + 360) % 360;
  const names = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'];
  return names[Math.round(deg / 45) % 8];
}

export function currentsAtCell(W, c) {
  if (c < 0 || !W.oceanU || W.h[c] >= W.seaLevel) return null;
  const u = W.oceanU[c] || 0;
  const v = W.oceanV[c] || 0;
  const spd = Math.hypot(u, v);
  return {
    u, v, spd,
    dir: compassFromUV(u, v),
    upwell: W.upwell?.[c] || 0,
    salt: W.oceanSalt?.[c] || 0,
    surf: W.oceanSurf?.[c] || 0,
    deep: W.oceanDeep?.[c] || 0,
    wave: W.waveHt?.[c] || 0,
    mix: W.mixDepth?.[c] || 0,
    conveyor: W.conveyor ?? 1,
    mocSv: W._mocSv ?? (W.conveyor ?? 1) * 17,
    enso: W._ensoIndex || 0,
    phase: W._ensoPhase || 'neutral',
  };
}

export function currentSentence(W, c) {
  const cur = currentsAtCell(W, c);
  if (!cur) return '';
  const bits = [];
  if (cur.spd > 0.22) bits.push(`a ${cur.dir}ern current`);
  else if (cur.spd > 0.08) bits.push(`a slow ${cur.dir} drift`);
  if (cur.upwell > 0.35) bits.push('water rising');
  if (cur.surf > 0.62 && cur.spd > 0.18) bits.push('carrying heat poleward');
  else if (cur.surf < 0.38 && cur.spd > 0.12) bits.push('a cold tongue');
  if (cur.wave > 0.45) bits.push('a heavy sea');
  return bits.join(', ');
}

export function ensoLabel(W) {
  const x = W._ensoIndex || 0;
  if (x > 0.42) return 'El Niño';
  if (x < -0.42) return 'La Niña';
  if (x > 0.18) return 'warm-neutral';
  if (x < -0.18) return 'cool-neutral';
  return 'neutral';
}

function refreshFetch(W) {
  const tick = W._tickIndex | 0;
  if (W._fetch?.length === NC && (tick - (W._fetchTick | 0)) < 8 && tick >= (W._fetchTick | 0)) return;
  if (!W._fetch || W._fetch.length !== NC) W._fetch = new Uint8Array(NC);
  W._fetchTick = tick;
  const sea = W.seaLevel;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= sea) { W._fetch[c] = 0; continue; }
    W._fetch[c] = fetchLength(W, c, W.windU?.[c] || 0, W.windV?.[c] || 0);
  }
}

function fetchLength(W, c, u, v) {
  const sea = W.seaLevel;
  let cell = c, n = 0;
  const spd = Math.hypot(u, v) || 1e-6;
  const uu = u / spd, vv = v / spd;
  for (let s = 0; s < 8; s++) {
    const nb = upwindNeighbour(cell, uu, vv);
    if (nb < 0 || W.h[nb] >= sea) break;
    cell = nb;
    n++;
  }
  return n;
}

export function ensoEastness(W, c) {
  const mid = W._ensoBasinLon;
  if (mid == null || !(W._ensoBasinN > 12)) return DIR[c * 3];
  let d = Math.atan2(DIR[c * 3 + 2], DIR[c * 3]) - mid;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return clamp(d / 1.4, -1, 1);
}

/** Largest tropical ocean, as a connected component. East/west of its centroid is the ENSO dipole. */
export function noteTropicalBasin(W, sea = W.seaLevel) {
  const gen = W._tickIndex | 0;
  if (W._ensoBasinN != null
      && Math.abs((W._ensoBasinSea ?? sea) - sea) < 0.01
      && (gen - (W._ensoBasinTick | 0)) < 32 && gen >= (W._ensoBasinTick | 0)) {
    return;
  }
  W._ensoBasinTick = gen;
  W._ensoBasinSea = sea;
  if (W._ensoSeen?.length !== NC) {
    W._ensoSeen = new Uint8Array(NC);
    W._ensoQ = new Int32Array(NC);
  }
  const seen = W._ensoSeen;
  const q = W._ensoQ;
  seen.fill(0);
  let bestN = 0, bestLon = 0;
  const latMax = 0.28;
  for (let s = 0; s < NC; s++) {
    if (seen[s]) continue;
    if (W.h[s] >= sea || Math.abs(DIR[s * 3 + 1]) > latMax) {
      seen[s] = 1;
      continue;
    }
    let head = 0, tail = 0;
    q[tail++] = s;
    seen[s] = 1;
    let sx = 0, sz = 0, n = 0;
    while (head < tail) {
      const c = q[head++];
      sx += DIR[c * 3];
      sz += DIR[c * 3 + 2];
      n++;
      for (let k = 0; k < 4; k++) {
        const nb = NBR[c * 4 + k];
        if (seen[nb]) continue;
        if (W.h[nb] >= sea || Math.abs(DIR[nb * 3 + 1]) > latMax) {
          seen[nb] = 1;
          continue;
        }
        seen[nb] = 1;
        q[tail++] = nb;
      }
    }
    if (n > bestN) {
      bestN = n;
      bestLon = Math.atan2(sz, sx);
    }
  }
  W._ensoBasinLon = bestLon;
  W._ensoBasinN = bestN;
}

function diagnoseEnso(W, sea, fScale) {
  noteTropicalBasin(W, sea);
  let westT = 0, eastT = 0, nW = 0, nE = 0, trade = 0, nTr = 0;
  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    if (Math.abs(lat) > 0.22) continue;
    if (W.h[c] >= sea) continue;
    const east = ensoEastness(W, c);
    if (east < -0.18) { westT += W.oceanSurf[c]; nW++; }
    else if (east > 0.18) { eastT += W.oceanSurf[c]; nE++; }
    trade += -(W.windU?.[c] || 0);
    nTr++;
  }
  const west = nW ? westT / nW : 0.5;
  const east = nE ? eastT / nE : 0.5;
  W._walkerSST = west - east;
  const trades = nTr ? trade / nTr : 0.2;

  let tilt = W._thermoclineTilt || 0;
  let enso = W._ensoIndex || 0;
  tilt = tilt * 0.93 + (trades - 0.18) * 0.07;
  enso = enso * 0.92 + (-(west - east) * 0.55 + tilt * 0.35) * 0.12;
  if (enso > 0) enso *= 0.985;
  else enso *= 0.992;
  W._thermoclineTilt = clamp(tilt, -1.2, 1.2);
  W._ensoIndex = clamp(enso, -1.2, 1.2);
  const phase = ensoLabel(W);
  if (phase !== W._ensoPhase && (phase === 'El Niño' || phase === 'La Niña')) {
    W._ensoEvent = phase;
  }
  W._ensoPhase = phase;
  void fScale;
}

function mocStreamfunction(W, sea) {
  const NB = 18;
  const vBin = new Float32Array(NB);
  const wBin = new Float32Array(NB);
  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= sea) continue;
    const bin = clamp((((DIR[c * 3 + 1] + 1) * 0.5) * NB) | 0, 0, NB - 1);
    vBin[bin] += W.oceanV[c] * AREA[c];
    wBin[bin] += AREA[c];
  }
  let acc = 0, maxPsi = 0;
  for (let i = 0; i < NB; i++) {
    acc += vBin[i] / (wBin[i] + 1e-6);
    if (Math.abs(acc) > maxPsi) maxPsi = Math.abs(acc);
  }
  W._mocSv = maxPsi * 26;
}

/** Wind-stress shallow water + conserved salt + diagnosed overturning. */
export function oceanTick(W) {
  if (W.noSurface) return;
  if (!W.oceanSurf) initOcean(W);
  if (!W.oceanU || W.oceanU.length !== NC) {
    W.oceanU = new Float32Array(NC);
    W.oceanV = new Float32Array(NC);
    W.waveHt = W.waveHt || new Float32Array(NC);
    W.mixDepth = W.mixDepth || new Float32Array(NC);
    W._tauE = new Float32Array(NC);
    W._tauN = new Float32Array(NC);
  }
  const sea = W.seaLevel;
  const rot = W.rotationPeriod || 1;
  const fScale = clamp(1 / Math.max(0.2, Math.abs(rot)), 0.15, 4);
  const tauE = W._tauE;
  const tauN = W._tauN;
  const scratch = W._adv;
  const enso = W._ensoIndex || 0;
  const tilt = W._thermoclineTilt || 0;
  refreshFetch(W);

  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= sea) {
      tauE[c] = 0; tauN[c] = 0;
      W.oceanU[c] = 0; W.oceanV[c] = 0;
      W.upwell[c] = 0; W.waveHt[c] = 0;
      W.mixDepth[c] = 0;
      continue;
    }
    const u = W.windU?.[c] || 0;
    const v = W.windV?.[c] || 0;
    const spd = Math.hypot(u, v);
    tauE[c] = 0.0013 * spd * u * 40 * 3.6;
    tauN[c] = 0.0013 * spd * v * 40 * 3.6;
    const fetch = W._fetch[c];
    const ice = W.iceSea?.[c] || 0;
    const hs = 0.55 * spd * spd * Math.tanh(fetch / 5) * (1 - ice);
    W.waveHt[c] = clamp((W.waveHt[c] || 0) * 0.65 + hs * 0.35, 0, 1);
  }

  let sinkNH = 0, nNH = 0, sinkSH = 0, nSH = 0;
  let freshPulse = 0;

  if (!W._ssh || W._ssh.length !== NC) W._ssh = new Float32Array(NC);
  if (!W._oDrag || W._oDrag.length !== NC) W._oDrag = new Float32Array(NC);
  if (!W._oEq || W._oEq.length !== NC) W._oEq = new Float32Array(NC);
  const mask = ensureMask(W, sea);
  const ssh = W._ssh;
  const oDrag = W._oDrag;
  const oEq = W._oEq;
  for (let c = 0; c < NC; c++) {
    if (!mask[c]) {
      oDrag[c] = 1; oEq[c] = 0.5;
      continue;
    }
    oEq[c] = clamp(0.5 + (W.oceanSurf[c] - 0.5) * 0.22, 0.12, 0.9);
    oDrag[c] = 0.055 + (W.iceSea?.[c] || 0) * 0.14;
  }

  if (!W._osweBoot) {
    for (let c = 0; c < NC; c++) {
      if (!mask[c]) { W.oceanU[c] = 0; W.oceanV[c] = 0; ssh[c] = 0.5; continue; }
      ssh[c] = oEq[c];
      const [u0, v0] = geostrophyOf(ssh, c, fScale);
      W.oceanU[c] = clamp(u0 * 0.55 + tauE[c] * 12, -1.8, 1.8);
      W.oceanV[c] = clamp(v0 * 0.55 + tauN[c] * 12, -1.8, 1.8);
    }
    W._osweBoot = true;
  }

  for (let s = 0; s < 2; s++) {
    stepShallowWater({
      eta: ssh, u: W.oceanU, v: W.oceanV,
      fScale, g: 0.72, H: 0.48, dt: 0.2,
      drag: oDrag, forceE: tauE, forceN: tauN,
      etaEq: oEq, relax: 0.055, mask, umax: 1.8, damp: 0.06,
      advect: 0.62, etamin: 0.08, etamax: 1.2,
    });
  }

  for (let c = 0; c < NC; c++) {
    if (!mask[c]) {
      W.oceanU[c] = 0; W.oceanV[c] = 0; W.upwell[c] = 0;
      continue;
    }
    const lat = DIR[c * 3 + 1];
    const east = ensoEastness(W, c);
    const div = divEN(W.oceanU, W.oceanV, c, mask);
    let up = -div * 1.8 + (Math.abs(lat) < 0.12 ? 0.12 : 0);
    if (Math.abs(lat) < 0.22 && east > 0.12) up *= 1 - clamp(enso * 0.7, -0.4, 0.85);
    W.upwell[c] = clamp(up, 0, 1);
  }

  advectField(W.oceanSurf, W.oceanU, W.oceanV, scratch, 0.2);
  advectField(W.oceanSalt, W.oceanU, W.oceanV, scratch, 0.16);
  if (W.nutrientP) advectField(W.nutrientP, W.oceanU, W.oceanV, scratch, 0.13);

  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= sea) continue;
    const lat = DIR[c * 3 + 1];
    const east = ensoEastness(W, c);
    const spd = Math.hypot(W.windU?.[c] || 0, W.windV?.[c] || 0);
    let mixD = W.mixDepth[c] || 0.35;
    mixD += spd * 0.025;
    const dS0 = dens(W.oceanSurf[c], W.oceanSalt[c]);
    const dD0 = dens(W.oceanDeep[c], W.oceanSalt[c] * 0.98);
    if (dS0 > dD0) mixD += 0.03;
    else mixD *= 0.985;
    if (Math.abs(lat) < 0.25) {
      mixD += (east < 0 ? tilt : -tilt) * 0.08;
      mixD += enso * (east > 0 ? 0.12 : -0.06);
    }
    mixD = clamp(mixD, 0.12, 1);
    W.mixDepth[c] = mixD;

    const couple = 0.09 / (0.35 + mixD);
    W.oceanSurf[c] += (W.temp[c] - W.oceanSurf[c]) * couple;
    W.oceanSurf[c] -= W.upwell[c] * 0.035;
    if (Math.abs(lat) < 0.22) {
      if (east > 0.15) W.oceanSurf[c] += enso * 0.01;
      if (east < -0.15) W.oceanSurf[c] -= enso * 0.007;
    }
    const mix = 0.008 + W.upwell[c] * 0.07 * W.conveyor * (1.15 - mixD * 0.4);
    W.oceanSurf[c] = W.oceanSurf[c] * (1 - mix) + W.oceanDeep[c] * mix;
    W.oceanDeep[c] += (W.oceanSurf[c] - W.oceanDeep[c]) * mix * 0.15;

    const rain = W.precip?.[c] || 0;
    if (rain > 0.25) {
      W.oceanSalt[c] *= 1 - rain * 0.004;
      freshPulse += AREA[c] * rain;
    } else if ((W.temp[c] || 0) > 0.55 && rain < 0.08) {
      W.oceanSalt[c] = clamp(W.oceanSalt[c] + 0.00015, 0.05, 0.9);
    }

    W.oceanSurf[c] = clamp(W.oceanSurf[c], 0, 1.4);
    W.oceanSalt[c] = clamp(W.oceanSalt[c], 0.05, 0.9);

    const dS = dens(W.oceanSurf[c], W.oceanSalt[c]);
    const dD = dens(W.oceanDeep[c], W.oceanSalt[c] * 0.98);
    if (dS > dD + 0.004) {
      const swap = (dS - dD) * 0.35;
      const tS = W.oceanSurf[c];
      W.oceanSurf[c] -= swap * 0.5;
      W.oceanDeep[c] += (tS - W.oceanDeep[c]) * swap;
      if (lat > 0.45) { sinkNH++; nNH++; }
      else if (lat < -0.45) { sinkSH++; nSH++; }
    } else if (lat > 0.45) nNH++;
    else if (lat < -0.45) nSH++;

    W.temp[c] += (W.oceanSurf[c] - W.temp[c]) * 0.032 * (0.4 + W.conveyor) * clamp(mixD, 0.4, 1.1);

    if (W.nutrientP && W.upwell[c] > 0.25) {
      W.nutrientP[c] = Math.min(1, (W.nutrientP[c] || 0) + W.upwell[c] * 0.018);
    }
  }

  mocStreamfunction(W, sea);
  diagnoseEnso(W, sea, fScale);

  const sink = (nNH + nSH) > 8 ? (sinkNH + sinkSH) / (nNH + nSH) : 0.5;
  const fromSink = clamp(sink * 1.4, 0, 1);
  const fromMoc = clamp((W._mocSv || 0) / 17, 0, 1.3);
  const target = fromSink * 0.55 + fromMoc * 0.45;
  if (freshPulse > NC * 0.002) {
    W.conveyor = Math.max(0, W.conveyor - 0.025);
    W._conveyorNote = 'overturning weakening';
  } else {
    W.conveyor = W.conveyor * 0.92 + target * 0.08;
    if (W.conveyor > 0.45) W._conveyorNote = null;
  }
  W._amoc = W.conveyor;
  W._mocSv = (W.conveyor || 0) * 17;
  W.thermohaline = W.conveyor < 0.28 ? 'shutdown' : 'on';
}

/** Brine rejection into surface salt as sea ice grows. Call from iceTick. */
export function rejectBrine(W, c, dice) {
  if (!W.oceanSalt || dice <= 0 || W.h[c] >= W.seaLevel) return;
  W.oceanSalt[c] = clamp(W.oceanSalt[c] + dice * 0.12, 0.05, 0.9);
}
