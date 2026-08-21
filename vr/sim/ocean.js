/** Circulating ocean: wind-stress SWE, salt, overturning, ENSO, waves.
 *  Currents backlog: oceanvel, ekman, gyre, wbc, salt, moc, enso, mixedlayer, wavefield. */

import { NC, DIR, LON, NBR, AREA } from '../sphere.js';
import { clamp } from '../math.js';
import { advectField, advectScalar, advectScalar3 } from './atmo.js';
import { upwindNeighbour, neighbourMean } from './vecop.js';
import { stepShallowWater, geostrophyOf, ensureMask, divEN } from './swe.js';

export function initOcean(W) {
  /* Freshwater-flux baseline: a running mean, so it has to start empty or the
     previous planet's rainfall decides whether this one's overturning is being
     freshened. Caught by the reset test, which is what it is for. */
  W._freshBase = null;
  W._saltBase = null;
  W._saltArea = null;
  W.saltDrift = 0;
  W.freshFlux = 0;
  W.freshAnomaly = 0;
  W._conveyorSv = 0;

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
      /* 0.41 is about 2 °C — the temperature of the real deep ocean. This was
         0.28, which on this scale is −20 °C: colder than sea water can be
         without becoming ice, so no surface parcel anywhere could ever be denser
         than the water below it, and deep-water formation was impossible by
         construction. That is why the overturning circulation read "shutdown" on
         every world regardless of climate. */
      W.oceanDeep[c] = 0.41;
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
  let d = LON[c] - mid;
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
    const spd = Math.sqrt(u * u + v * v);
    /* Wind stress, quadratic in the wind, and the ocean's main driver: the
       subtropical gyres are this term balanced against Coriolis and drag. The
       coefficient carries the whole chain from a normalised wind to a normalised
       current, and it was fitted when the wind field peaked at 0.08 rather than
       0.6 — but it is the *shape* that had gone missing, so it is refitted here
       against gyre strength rather than scaled by the ratio. */
    tauE[c] = 0.0013 * spd * u * 360;
    tauN[c] = 0.0013 * spd * v * 360;
    const fetch = W._fetch[c];
    const ice = W.iceSea?.[c] || 0;
    /* Significant wave height goes as the square of the wind — H_s ≈ 0.02·U² for
       a fully developed sea — and this field is read on a 0–1 scale: `present.js`
       calls 0.5 "a heavy sea", the shader and the local view drive whitecaps and
       swell off it, the audio drives surf off it. At 0.55 the strongest wind the
       model makes (0.9) reached 0.45 and the *mean* was 0.06, so nothing above a
       ripple ever existed, "a heavy sea" was unsayable, and the Southern Ocean
       looked like a pond. Fitted so a gale in the storm belt is a heavy sea and a
       trade-wind afternoon is a swell. */
    /* Storms raise the sea, and they are what make a heavy one. The mean wind
       field is smooth by construction, so squaring it alone gives a uniformly
       moderate ocean; the roughest water on Earth is under a cyclone and along a
       storm track, which is exactly where `stormField` already is. */
    const gust = spd + (W.stormField?.[c] || 0) * 0.85;
    const hs = 1.9 * gust * gust * Math.tanh(fetch / 5) * (1 - ice);
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
    /* Dynamic topography is smooth — a sea surface leans over a basin, not from
       one cell to the next. Reading it straight off `oceanSurf` handed the solver
       the SST field's own cell-scale texture as a pressure gradient, and with
       real gradients that drove a quarter of the ocean to its speed clamp and
       shut the overturning down. The neighbour mean is the cheapest honest
       low-pass, and the coefficient is smaller because the gradient it produces
       is now the real one. */
    oEq[c] = clamp(0.5 + (neighbourMean(W.oceanSurf, c) - 0.5) * 0.09, 0.12, 0.9);
    oDrag[c] = 0.07 + (W.iceSea?.[c] || 0) * 0.14;
  }

  if (!W._osweBoot) {
    for (let c = 0; c < NC; c++) {
      if (!mask[c]) { W.oceanU[c] = 0; W.oceanV[c] = 0; ssh[c] = 0.5; continue; }
      ssh[c] = oEq[c];
      const [u0, v0] = geostrophyOf(ssh, c, fScale, oDrag[c] + 0.2, 0.28);
      W.oceanU[c] = clamp(u0 + tauE[c] * 12, -1.8, 1.8);
      W.oceanV[c] = clamp(v0 + tauN[c] * 12, -1.8, 1.8);
    }
    W._osweBoot = true;
  }

  /* Same story as the wind: with real gradients out of `swe.js` these constants
     mean something different, and the old ones drove every current to its clamp
     — the whole ocean at 1.8 in both components, which is what turned the flow
     overlay into uniform hatching. `g` sets how hard sea-surface tilt pushes,
     the quadratic drag is what keeps a wind-driven gyre finite, and `H` is small
     for the same CFL reason as aloft. */
  for (let s = 0; s < 2; s++) {
    stepShallowWater({
      eta: ssh, u: W.oceanU, v: W.oceanV,
      fScale, g: 0.22, H: 0.004, dt: 0.2,
      drag: oDrag, dragQ: 0.45, forceE: tauE, forceN: tauN,
      etaEq: oEq, relax: 0.055, mask, umax: 1.8, damp: 0.0012,
      advect: 0.05, visc: 0.10, etaVisc: 0.14, etamin: 0.08, etamax: 1.2,
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
    let up = -div * 0.03 + (Math.abs(lat) < 0.12 ? 0.12 : 0);
    if (Math.abs(lat) < 0.22 && east > 0.12) up *= 1 - clamp(enso * 0.7, -0.4, 0.85);
    W.upwell[c] = clamp(up, 0, 1);
  }

  /* A sea-surface temperature, a salinity and a phosphate concentration: all
     intensive, all carried by the same current, so all in one pass of the grid.
     The three transport rates were 1.4 / 1.1 / 1.0 and are now one number — they
     are the same water moving, and the difference between them was never argued
     for anywhere. */
  if (W.nutrientP) {
    advectScalar3(W.oceanSurf, W.oceanSalt, W.nutrientP, W.oceanU, W.oceanV, 1.2);
  } else {
    advectScalar(W.oceanSurf, W.oceanU, W.oceanV, scratch, 1.2);
    advectScalar(W.oceanSalt, W.oceanU, W.oceanV, scratch, 1.2);
  }
  /* Phosphate rides along in the pass above, for the same reason the other two
     do: it is a concentration, and every reader treats it as 0–1 — `nppField` as
     a limitation term, `fire` clamped to one. Flux-form advection conserves
     `field × area`, so convergence piled it up to 2.75 in the gyres, and the
     parts of the ocean that are actually nutrient deserts came out three times
     richer than an upwelling margin. Transported, not concentrated. */

  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= sea) continue;
    const lat = DIR[c * 3 + 1];
    const east = ensoEastness(W, c);
    const wu = W.windU?.[c] || 0, wv = W.windV?.[c] || 0;
    const spd = Math.sqrt(wu * wu + wv * wv);
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

    /* Air–sea exchange, with the asymmetry the right way round. The ocean was
       chasing the air at ~0.2 a tick and answering back at 0.032, which is
       upside down: a mixed layer carries a thousand times the heat of the column
       above it, so the air over water is very nearly pinned to the sea surface
       while the sea takes centuries to notice the air. It also meant that
       everything the currents carried poleward stayed in `oceanSurf` and never
       reached the atmosphere — no western boundary current warming its
       coastline, and nothing to stop the sea-ice albedo feedback from running
       away.

       Both directions matter, and the balance between them is delicate: over
       water, `temp` already carries the mixed layer's own thermal inertia
       (`thermalMass` 0.032 for sea cells in `atmoTick`), so `oceanSurf` is best
       read as a tracer that adds advection, upwelling and salinity structure to
       it rather than as a second, independent reservoir. Pinning the air hard to
       that tracer — 0.14 against a radiative relaxation of 0.032 — let the cold
       water welling up from below set the air temperature directly, and the
       planet spiralled: cooler air, less vapour, weaker vapour greenhouse,
       cooler still, ending 62% frozen. The ocean leads gently; it does not
       overrule the radiation budget. */
    const couple = 0.12 / (0.35 + mixD);
    W.oceanSurf[c] += (W.temp[c] - W.oceanSurf[c]) * couple;
    W.oceanSurf[c] -= W.upwell[c] * 0.035;
    if (Math.abs(lat) < 0.22) {
      if (east > 0.15) W.oceanSurf[c] += enso * 0.01;
      if (east < -0.15) W.oceanSurf[c] -= enso * 0.007;
    }
    /* Surface–deep exchange, as an exchange.
     *
     * `DEEP_CAP` is the mixed layer's heat capacity as a fraction of the deep
     * ocean's, so the deep warms by a seventh of what the surface gives up and
     * the heat is redistributed rather than destroyed. It was: surface cools by
     * the full difference, deep warms by 15% of it — 85% of the heat simply
     * left the model. With deep water forming continuously at high latitudes and
     * upwelling continuously at the equator, that leak ran at roughly 0.2 in
     * temperature units, which is 32 K, and no amount of greenhouse tuning could
     * close a hole that scaled with the overturning it was tuned against. */
    const mix = 0.008 + W.upwell[c] * 0.07 * W.conveyor * (1.15 - mixD * 0.4);
    const mixFlux = (W.oceanSurf[c] - W.oceanDeep[c]) * mix;
    W.oceanSurf[c] -= mixFlux;
    W.oceanDeep[c] += mixFlux * DEEP_CAP;

    /* Salinity as precipitation minus evaporation, plus what the rivers bring.
     *
     * This was a dilution branch above 0.25 of rain and a concentration branch
     * below 0.08, with nothing to hold the total: rain destroyed salt outright.
     * It did not matter while the model rained almost nowhere, and with a working
     * water cycle the ocean lost 30% of its salt in 900 ticks and kept going —
     * which reaches straight into the density that drives deep-water formation
     * and therefore the overturning circulation. The pattern here is real (fresh
     * under the ITCZ and at river mouths, salty in the trade-wind subtropics);
     * the *inventory* is conserved below. */
    const rain = W.precip?.[c] || 0;
    const mouth = W.riverMouth?.[c] || 0;
    const dilute = rain * 0.0022 + Math.min(0.02, mouth * 0.004);
    const concentrate = Math.max(0, (W.temp[c] || 0) - 0.45) * 0.0018 * (1 - Math.min(1, rain * 4));
    W.oceanSalt[c] = clamp(W.oceanSalt[c] * (1 - dilute) + concentrate, 0.05, 0.9);
    if (rain > 0.25) freshPulse += AREA[c] * rain;

    W.oceanSurf[c] = clamp(W.oceanSurf[c], 0, 1.4);
    W.oceanSalt[c] = clamp(W.oceanSalt[c], 0.05, 0.9);

    const dS = dens(W.oceanSurf[c], W.oceanSalt[c]);
    const dD = dens(W.oceanDeep[c], W.oceanSalt[c] * 0.98);
    if (dS > dD + 0.004) {
      // Deep water forms: this column sinks and is replaced from below.
      const swap = Math.min(0.6, (dS - dD) * 0.35);
      const flux = (W.oceanSurf[c] - W.oceanDeep[c]) * swap;
      W.oceanSurf[c] -= flux;
      W.oceanDeep[c] += flux * DEEP_CAP;
      if (lat > 0.45) { sinkNH++; nNH++; }
      else if (lat < -0.45) { sinkSH++; nSH++; }
    } else if (lat > 0.45) nNH++;
    else if (lat < -0.45) nSH++;

    // Ice insulates: no flux through a frozen lid.
    const lid = 1 - (W.iceSea?.[c] || 0) * 0.85;
    W.temp[c] += (W.oceanSurf[c] - W.temp[c]) * 0.055 * lid * (0.55 + W.conveyor * 0.45)
      * clamp(mixD, 0.4, 1.1);

    if (W.nutrientP && W.upwell[c] > 0.25) {
      W.nutrientP[c] = Math.min(1, (W.nutrientP[c] || 0) + W.upwell[c] * 0.018);
    }
  }

  conserveSalt(W, sea);
  mocStreamfunction(W, sea);
  diagnoseEnso(W, sea, fScale);

  /* Two independent measurements of the same circulation: how much high-latitude
     water is actually sinking, and how big the meridional streamfunction is.
     `_mocSv` came from `mocStreamfunction` — and was then overwritten below with
     `conveyor × 17`, so the second measurement was a restatement of the answer
     and the diagnostic the HUD reports was never the one that was computed. */
  const sink = (nNH + nSH) > 8 ? (sinkNH + sinkSH) / (nNH + nSH) : 0.5;
  const fromSink = clamp(sink * 1.4, 0, 1);
  const mocSv = W._mocSv || 0;
  const fromMoc = clamp(mocSv / 17, 0, 1.3);
  const target = fromSink * 0.55 + fromMoc * 0.45;
  /* Freshwater forcing is an *anomaly*, not a total.
   *
   * The test was `freshPulse > NC · 0.002`, where `freshPulse` is the area of
   * ocean receiving rain above 0.25 — a threshold set when the model rained
   * almost nowhere. With a working water cycle the tropics clear it every single
   * tick, so the overturning was told it was being freshened continuously: the
   * conveyor pinned at zero, `thermohaline` stuck on "shutdown", and the ocean's
   * heat transport switched off on a planet with perfectly ordinary weather.
   * What shuts down an overturning circulation is a *change* in the freshwater
   * flux, so the comparison is against this world's own running mean. */
  const fresh = freshPulse / NC;
  if (W._freshBase == null) W._freshBase = fresh;
  else W._freshBase = W._freshBase * 0.99 + fresh * 0.01;
  W.freshFlux = fresh;
  W.freshAnomaly = fresh - W._freshBase;
  if (W.freshAnomaly > Math.max(2e-4, W._freshBase * 0.4)) {
    W.conveyor = Math.max(0, W.conveyor - 0.025);
    W._conveyorNote = 'overturning weakening';
  } else {
    W.conveyor = W.conveyor * 0.92 + target * 0.08;
    if (W.conveyor > 0.45) W._conveyorNote = null;
  }
  W._amoc = W.conveyor;
  // Keep the measured streamfunction; report the strength the conveyor implies
  // separately rather than writing one over the other.
  W._mocSv = mocSv;
  W._conveyorSv = (W.conveyor || 0) * 17;
  W.thermohaline = thermohalineLabel(mocSv);
}

/**
 * Hold the ocean's salt inventory while letting its pattern move.
 *
 * Evaporation and rainfall redistribute salinity; they do not create or destroy
 * salt. Only weathering and evaporite burial change the total, over tens of
 * millions of years, which is longer than any run. Checked every eighth tick and
 * corrected by a bounded fraction, so this can smooth a drift but can never
 * become a forcing of its own.
 */
function conserveSalt(W, sea) {
  if (((W._tickIndex | 0) & 7) !== 0) return;
  let total = 0, area = 0;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= sea) continue;
    total += W.oceanSalt[c] * AREA[c];
    area += AREA[c];
  }
  if (!(area > 0)) return;
  if (W._saltBase == null || !(W._saltBase > 0)) { W._saltBase = total; return; }
  /* Sea level moves, so the baseline is per unit area rather than absolute —
     a flooded shelf should not read as the ocean having gained salt. */
  if (W._saltArea == null) W._saltArea = area;
  const want = W._saltBase * (area / W._saltArea);
  const k = clamp(want / Math.max(1e-9, total), 0.995, 1.005);
  if (Math.abs(k - 1) < 1e-6) return;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= sea) continue;
    W.oceanSalt[c] = clamp(W.oceanSalt[c] * k, 0.05, 0.9);
  }
  W.saltDrift = total / want - 1;
}

/**
 * What to call an overturning circulation of this strength, in Sverdrups.
 *
 * A real AMOC runs near 17 Sv and is described as collapsed below about five.
 * The label used to come off the internal 0–1 `conveyor` index at 0.28, which
 * reported "shutdown" on a planet moving 7.5 Sv — weak, not stopped — and the
 * word drives the HUD, the chronicle and the tipping-point panel. One definition,
 * shared with the god tool that can force the state by hand.
 */
export function thermohalineLabel(sv) {
  return sv < 5 ? 'shutdown' : sv < 12 ? 'weak' : 'on';
}

/** Mixed-layer heat capacity as a fraction of the deep ocean's. */
const DEEP_CAP = 0.15;

/** Brine rejection into surface salt as sea ice grows. Call from iceTick. */
export function rejectBrine(W, c, dice) {
  if (!W.oceanSalt || dice <= 0 || W.h[c] >= W.seaLevel) return;
  W.oceanSalt[c] = clamp(W.oceanSalt[c] + dice * 0.12, 0.05, 0.9);
}
