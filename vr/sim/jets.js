/** Zonal jets on a world with no surface. Worldspace `rhines`.
 *  Number of bands from rotation period and radius — not a stripe texture. */

import { NC, DIR, AREA, NBR } from '../sphere.js';
import { clamp } from '../math.js';
import { ensurePlevel, plevelTick, isIceGiantKind } from './plevel.js';

/** Fitted: Jupiter (9.9 h, 11 R⊕) → ~12 jets. Slower / smaller → fewer. */
export function rhinesJetCount(rotationPeriod = 1, rEarth = 11) {
  const hours = Math.max(2.4, Math.abs(rotationPeriod || 1) * 24);
  const r = Math.max(0.5, rEarth || 11);
  const n = Math.round((118 / hours) * Math.sqrt(r / 11));
  return clamp(n, 2, 16);
}

/** Drive from internal heat so Neptune stays fast on almost no sunlight. */
export function jetAmplitude(W) {
  const intern = W?.rule?.internalHeat || 0;
  const teq = W?.rule?.teqK || 80;
  const insol = clamp((teq / 278) ** 2, 0.008, 2);
  return clamp(0.28 + intern * 0.52 + insol * 0.16, 0.26, 1.48);
}

/** Seed alternating zonal flow. SWE then remembers it. */
export function seedZonalJets(W) {
  const n = rhinesJetCount(W.rotationPeriod, W.rule?.radiusEarth || 11);
  W._jetCount = n;
  W._jetSpin = W.rotationPeriod;
  const U = jetAmplitude(W);
  for (let c = 0; c < NC; c++) {
    const lat = clamp(DIR[c * 3 + 1], -1, 1);
    W.windU[c] = U * Math.sin(n * Math.asin(lat));
    W.windV[c] = 0;
  }
}

/** Reseed when spin (and therefore Rhines count) changes. */
export function maybeReseedJets(W) {
  if (!W?.noSurface || !W.windU) return false;
  const n = rhinesJetCount(W.rotationPeriod, W.rule?.radiusEarth || 11);
  if (W._jetSpin === W.rotationPeriod && W._jetCount === n) return false;
  seedZonalJets(W);
  return true;
}

/** Count sign changes of the zonal-mean eastward wind, equator to pole. */
export function countZonalJets(W) {
  const bins = 36;
  const u = new Float64Array(bins);
  const w = new Float64Array(bins);
  for (let c = 0; c < NC; c++) {
    const lat = clamp(DIR[c * 3 + 1], -1, 1);
    const i = Math.min(bins - 1, ((lat + 1) * 0.5 * bins) | 0);
    const a = AREA[c] || 1;
    u[i] += (W.windU?.[c] || 0) * a;
    w[i] += a;
  }
  let prev = 0, flips = 0, started = false;
  for (let i = 0; i < bins; i++) {
    if (w[i] < 1e-9) continue;
    const m = u[i] / w[i];
    if (!started) { prev = m; started = true; continue; }
    if (prev * m < 0 && Math.abs(m) > 0.04) {
      flips++;
      prev = m;
    }
  }
  return flips;
}

function seedVortex(W) {
  if (W._spotSeeded) return;
  W._spotSeeded = true;
  const kind = W._planetKind || W.rule?._planetKind;
  const target = isIceGiantKind(kind) ? -0.22 : -0.32;
  let best = 0, bestScore = -1e9;
  for (let c = 0; c < NC; c++) {
    const y = DIR[c * 3 + 1];
    const score = -Math.abs(y - target) + (W.vort?.[c] || 0) * 0.15;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  W._spotCell = best;
}

function tickVortex(W) {
  seedVortex(W);
  const home = W._spotCell | 0;
  const u = W.windU[home] || 0;
  const v = W.windV[home] || 0;
  let next = home;
  let best = -1;
  for (let k = 0; k < 4; k++) {
    const nb = NBR[home * 4 + k];
    const dx = DIR[nb * 3] - DIR[home * 3];
    const dy = DIR[nb * 3 + 1] - DIR[home * 3 + 1];
    const dz = DIR[nb * 3 + 2] - DIR[home * 3 + 2];
    const along = dx * u * DIR[home * 3 + 2] - dz * u * DIR[home * 3] + dy * v;
    if (along > best) { best = along; next = nb; }
  }
  if (best > 0.002) W._spotCell = next;
  const hx = DIR[W._spotCell * 3], hy = DIR[W._spotCell * 3 + 1], hz = DIR[W._spotCell * 3 + 2];
  const ice = isIceGiantKind(W._planetKind || W.rule?._planetKind);
  const r2 = ice ? 0.045 : 0.028;
  const spot = W.spot;
  for (let c = 0; c < NC; c++) {
    const dx = DIR[c * 3] - hx, dy = DIR[c * 3 + 1] - hy, dz = DIR[c * 3 + 2] - hz;
    const d2 = dx * dx + dy * dy + dz * dz;
    const k = d2 < r2 ? 1 - d2 / r2 : 0;
    spot[c] += (k - spot[c]) * 0.28;
  }
}

function advectChroma(W) {
  const ch = W.chroma;
  const tmp = W._chromaTmp || (W._chromaTmp = new Float32Array(NC));
  for (let c = 0; c < NC; c++) {
    const u = W.windU[c] || 0;
    const v = W.windV[c] || 0;
    let src = c, best = 0;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      const dx = DIR[c * 3] - DIR[nb * 3];
      const dy = DIR[c * 3 + 1] - DIR[nb * 3 + 1];
      const dz = DIR[c * 3 + 2] - DIR[nb * 3 + 2];
      const along = dx * u + dy * v + dz * (u * 0.15);
      if (along > best) { best = along; src = nb; }
    }
    const sink = clamp(0.5 - (W.converg?.[c] || 0) * 1.4, 0, 1);
    const injected = sink * 0.55;
    tmp[c] = ch[src] * 0.92 + injected * 0.08;
  }
  ch.set(tmp);
}

function tickHotspot(W) {
  if (!W.rule?.tidallyLocked) {
    W._hotspotLon = 0;
    return;
  }
  let uEq = 0, n = 0;
  for (let c = 0; c < NC; c++) {
    if (Math.abs(DIR[c * 3 + 1]) > 0.18) continue;
    uEq += W.windU[c] || 0;
    n++;
  }
  const mean = n ? uEq / n : 0;
  W._hotspotLon = clamp(0.12 + mean * 0.55, 0.08, 0.7);
}

/** Giants-only tick: decks, chromophores, vortex, hotspot. Cheap, one pass. */
export function giantTick(W, log) {
  if (!W?.noSurface) return;
  maybeReseedJets(W);
  ensurePlevel(W);
  plevelTick(W);
  advectChroma(W);
  tickVortex(W);
  tickHotspot(W);
  // Tick counter, not the wrapping absolute year — see the note in `simTick`.
  if (log && ((W._tickIndex | 0) % 900 === 40)) {
    log(W.year, 'climate', W._spotCell | 0, W.spot?.[W._spotCell | 0] || 0,
      'A long-lived vortex still holds between the jets');
  }
}
