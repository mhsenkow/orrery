/** Prognostic wind: rotating shallow water + heating target.
 *  Currents backlog: progatm. Height relaxes toward a thermal η_eq;
 *  momentum is stepped — geostrophy emerges, the field has memory. */

import { NC, DIR, AREA, NBR, N as SIM_N, NBR_E, NBR_N, NBR_IWE, NBR_IWN } from '../sphere.js';
import { clamp } from '../math.js';
import { ensoEastness } from './ocean.js';
import { stepShallowWater, geostrophyOf, divEN, curlEN } from './swe.js';
import { neighbourMean } from './vecop.js';
import { hasSurface } from './planetKind.js';
import { seedZonalJets, rhinesJetCount } from './jets.js';

let _etaEq = null;
let _drag = null;
let _fE = null;
let _fN = null;
let _latN = null;
let _etaS = null;
let _tS = null;

function bufs() {
  if (!_etaEq || _etaEq.length !== NC) {
    _etaEq = new Float32Array(NC);
    _drag = new Float32Array(NC);
    _fE = new Float32Array(NC);
    _fN = new Float32Array(NC);
    /* Latitude, linear and normalised to ±1 at the poles. `DIR.y` is sin(lat),
       which bunches the midlatitudes together — fine for Coriolis, wrong for
       laying out pressure belts, which are evenly spaced in latitude. */
    _etaS = new Float32Array(NC);
    _tS = new Float32Array(NC);
    _latN = new Float32Array(NC);
    for (let c = 0; c < NC; c++) {
      _latN[c] = Math.asin(clamp(DIR[c * 3 + 1], -1, 1)) / (Math.PI / 2);
    }
  }
}

/* How hard the pressure belts are drawn, and how the solver answers them.
 *
 * `PGF` is the pressure-gradient force coefficient — with real gradients out of
 * `swe.js` it is the number that sets wind speed, and `BAND` is the number that
 * sets the shape. `MASS` is deliberately tiny: this layer's height field is a
 * slaved pressure pattern relaxing toward `etaEq`, not a free surface carrying
 * gravity waves, and keeping √(g·H) well inside a cell per step is what lets the
 * step run once instead of substepping six times.
 *
 * `INERTIA` is the (u·∇)u term. It stays small on purpose: it is here to bend
 * the flow into troughs and meanders, not to transport anything. Transport of
 * heat, vapour and dust is done by the flux-limited `advectField`, which cannot
 * go unstable no matter how fast the wind gets. */
const PGF = 1.0;        // g
const MASS = 0.003;      // H
const BAND = 0.085;      // amplitude of the zonal pressure belts
const INERTIA = 0.06;    // advect
const DIVDAMP = 0.0012;  // damp
const VISC = 0.13;       // neighbour-mean blend per step, kills grid-scale noise
const DRAGQ = 0.6;       // quadratic surface stress, C_D|u|u

/** Number of meridional cells from rotation (Rhines / Held–Hou sketch). */
export function circulationCellCount(rotationPeriod = 1) {
  const rot = Math.max(0.12, Math.abs(rotationPeriod || 1));
  if (rot > 2.2) return 1;
  if (rot > 1.35) return 2;
  if (rot > 0.55) return 3;
  if (rot > 0.28) return 5;
  return 7;
}

/** Step windU/windV as shallow water. `press` is the free-surface height. */
export function geostrophicWind(W) {
  if (!W.windU) return;
  if (!W.press || W.press.length !== NC) W.press = new Float32Array(NC);
  if (!W.converg || W.converg.length !== NC) W.converg = new Float32Array(NC);
  bufs();

  const rot = W.rotationPeriod || 1;
  const surface = hasSurface(W);
  const fScale = clamp(1 / Math.max(0.2, Math.abs(rot)), 0.15, 4);
  const nCells = surface
    ? circulationCellCount(rot)
    : (W._jetCount || rhinesJetCount(rot, W.rule?.radiusEarth || 11));
  W._windCells = nCells;
  const season = W.season || 0;
  const locked = !!W.rule?.tidallyLocked;
  let heatLat = 0, heatW = 0;
  for (let i = 0; i < NC; i++) {
    const y = DIR[i * 3 + 1];
    if (Math.abs(y) > 0.55) continue;
    const w = Math.max(0, (W.temp[i] || 0) - 0.38);
    heatLat += y * w;
    heatW += w;
  }
  const thermalEq = heatW > 1e-6 ? heatLat / heatW : 0;
  const seasonal = Math.sin(season) * Math.sin(W.obliquity || 0) * 0.28;
  const itczLat = locked ? 0 : clamp(seasonal * 0.35 + thermalEq * 0.65, -0.4, 0.4);
  W._itczLat = itczLat;

  const enso = W._ensoIndex || 0;
  const walkerSST = W._walkerSST || 0;

  let tropLandT = 0, tropSeaT = 0, nLand = 0, nSea = 0;

  for (let c = 0; c < NC; c++) {
    const isLand = surface && W.h[c] >= W.seaLevel;
    if ((W.temp[c] || 0) > 0.32) {
      if (isLand) { tropLandT += W.temp[c]; nLand++; }
      else { tropSeaT += W.temp[c]; nSea++; }
    }
  }

  const monsoonPush = (nLand && nSea)
    ? clamp((tropLandT / nLand - tropSeaT / nSea) * 2.2, -0.55, 0.55)
    : 0;
  W._monsoon = locked ? 0 : clamp(0.35 + Math.abs(monsoonPush), 0, 1);

  if (!W.front || W.front.length !== NC) W.front = new Float32Array(NC);

  const etaEq = _etaEq;
  const drag = _drag;
  const fE = _fE;
  const fN = _fN;
  fE.fill(0); fN.fill(0);

  /* The pressure field the wind is answering.
   *
   * This used to be `(1 − temp) · 0.55` plus an ITCZ notch: cold poles high,
   * warm equator low, monotonic in between. A monotonic height field in
   * geostrophic balance can only give one sign of zonal wind, so the model blew
   * easterly from pole to pole and there was no westerly belt anywhere on the
   * planet — no jet, no storm track, no fronts arriving from the west.
   *
   * Earth's zonal-mean surface pressure is not monotonic, and the alternation is
   * the whole story: a trough at the ITCZ, a ridge in the subtropics, a trough
   * at the subpolar latitudes, a high over the pole. Geostrophy then hands back
   * the trades on the equatorward flank of the subtropical ridge, the
   * midlatitude westerlies on its poleward flank, and polar easterlies past the
   * subpolar trough — for free, from the pressure pattern, rather than from a
   * table of latitudes. `nCells` is how many such cells the rotation supports,
   * so one broad Hadley cell on a slow rotator and a Jovian stack on a fast one
   * come out of the same expression.
   *
   * Temperature still matters — it sets the ITCZ's latitude, warms continents
   * into thermal lows, and piles cold dense air over ice — but as a perturbation
   * on the belts rather than as the whole field. */
  const itczY = Math.asin(clamp(itczLat, -1, 1)) / (Math.PI / 2);
  const bandK = nCells * Math.PI;
  for (let c = 0; c < NC; c++) {
    const isLand = surface && W.h[c] >= W.seaLevel;
    const lat = DIR[c * 3 + 1];
    const landHeat = isLand ? (W.temp[c] - 0.5) * 0.12 : 0;
    let eq = 0.5;

    if (!locked && surface) {
      const y = _latN[c] - itczY;
      // Trough at the ITCZ, ridge one band out, alternating to the pole.
      eq -= BAND * Math.cos(bandK * y);
      // A little extra depth right in the convergence zone, where it convects.
      eq -= Math.max(0, 0.12 - Math.abs(y)) * 0.22;
      eq += (0.5 - W.temp[c]) * 0.10;
      eq += Math.max(0, W.h[c] - W.seaLevel) * 0.05;
      eq += (W.ice[c] || 0) * 0.09;
      eq -= landHeat;
      if (Math.abs(lat) < 0.28) {
        eq -= walkerSST * ensoEastness(W, c) * 0.05;
        eq += enso * ensoEastness(W, c) * 0.03;
      }
      if (isLand && W.temp[c] > 0.36) {
        const summer = Math.sin(season) * lat;
        if (summer > 0.05) eq -= monsoonPush * 0.05;
      }
    } else if (W._sunDir) {
      /* Tidally locked, or no surface: the substellar point is the low and the
         night side is the high, so the belts are replaced by one day–night cell. */
      const day = DIR[c * 3] * W._sunDir[0] + DIR[c * 3 + 1] * W._sunDir[1]
        + DIR[c * 3 + 2] * W._sunDir[2];
      eq -= day * 0.10;
      eq += (0.5 - W.temp[c]) * 0.08;
    } else {
      eq -= BAND * Math.cos(bandK * _latN[c]);
      eq += (0.5 - W.temp[c]) * 0.08;
    }

    etaEq[c] = clamp(eq, 0.05, 1.4);
    /* Rayleigh drag, and now a number with a job: near the equator `f` vanishes
       and drag is the only thing left to balance the pressure gradient, so it
       sets the trade-wind speed as surely as `PGF` does. Land is rougher than
       sea, mountains rougher still, and a gas giant has no surface to rub on. */
    const elev = surface ? Math.max(0, W.h[c] - W.seaLevel) : 0;
    drag[c] = surface
      ? 0.30 + (isLand ? 0.22 : 0) + elev * 0.55 + ((W.ice[c] || 0) > 0.55 ? 0.05 : 0)
      : 0.12;

    if (surface && (W.ice[c] || 0) > 0.55 && elev > 0.05) {
      fN[c] = -Math.sign(lat || 1) * 0.12;
    }
    if (surface && elev > 0.04) {
      fN[c] += -Math.sign(lat || 1) * elev * 0.08;
    }
  }

  /* Smooth the pressure target before solving against it.
   *
   * Surface pressure is a large-scale field: it does not have cell-to-cell
   * structure, and it must not, because the solver reads its *gradient*. Two of
   * the terms above are fractal — terrain elevation and the temperature field —
   * so at higher detail `etaEq` carried steeper and steeper grid-scale slopes,
   * and the forcing they produced grew with resolution even though the operators
   * no longer did. Measured at N=96, which is what the app opens at: 19 000 of
   * 55 296 cells pinned at maximum wind, against none at N=32 or N=64. Two
   * neighbour-mean passes remove the grid-scale content and leave every feature
   * the circulation is actually about — the belts, the continents, the ice. */
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 0; c < NC; c++) {
      _etaS[c] = etaEq[c] * 0.5 + neighbourMean(etaEq, c) * 0.5;
    }
    etaEq.set(_etaS);
  }

  if (!W._sweBoot) {
    if (!surface) seedZonalJets(W);
    for (let c = 0; c < NC; c++) {
      W.press[c] = etaEq[c];
      if (surface) {
        const [u0, v0] = geostrophyOf(etaEq, c, fScale, drag[c], PGF);
        W.windU[c] = clamp(u0, -1.85, 1.85);
        W.windV[c] = clamp(v0, -1.85, 1.85);
      }
    }
    W._sweBoot = true;
  }

  /* The layer depth scales with the cell, and that is a numerical statement
     rather than a physical one. `H` only ever appears as `H · div`, and `div` is
     a real divergence now — so it grows as 1/Δx — which meant the mass field's
     response to convergence got stronger every time the grid got finer. At N=96,
     the resolution the app opens at, the height field ran away into a
     checkerboard with 0.4 of pressure between adjacent cells and gradients
     eighty times the physical ones; a third of the planet sat at maximum wind.
     Holding `H · div` fixed makes the same world blow the same winds at N=32 and
     at N=128, which is the only way the tuning above can mean anything. */
  const massH = MASS * clamp(64 / SIM_N, 0.25, 4);

  const steps = 2;
  for (let s = 0; s < steps; s++) {
    stepShallowWater({
      eta: W.press, u: W.windU, v: W.windV,
      fScale, g: PGF, H: massH, dt: 0.2,
      drag, dragQ: DRAGQ, forceE: fE, forceN: fN,
      etaEq, relax: 0.15, umax: 1.85, damp: DIVDAMP, advect: INERTIA, visc: VISC, etaVisc: 0.17,
      etamin: 0.05, etamax: 1.4,
    });
  }

  let spdSum = 0, fAbs = 0, tropT = 0, tropA = 0, poleT = 0, poleA = 0, flux = 0;
  let jetU = 0, jetLat = 0, jetN = 0;

  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const f = lat * fScale;
    let tJump = 0, qJump = 0;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      tJump = Math.max(tJump, Math.abs((W.temp[nb] || 0) - (W.temp[c] || 0)));
      if (W.vapour) {
        qJump = Math.max(qJump, Math.abs((W.vapour[nb] || 0) - (W.vapour[c] || 0)));
      }
    }
    // FRONT1: temperature gradient + moisture gradient (partial — no deformation tensor)
    // FRONT1: temperature gradient + moisture gradient (partial — no deformation tensor)
    W.front[c] = clamp(tJump * 14 + qJump * 6, 0, 1);
    const spd = Math.sqrt(W.windU[c] * W.windU[c] + W.windV[c] * W.windV[c]);
    spdSum += spd;
    fAbs += Math.abs(f);
    const a = AREA[c];
    if (Math.abs(lat) < 0.32) { tropT += W.temp[c] * a; tropA += a; }
    if (Math.abs(lat) > 0.72) { poleT += W.temp[c] * a; poleA += a; }
    if (Math.abs(lat) > 0.28 && Math.abs(lat) < 0.42) {
      flux += W.windV[c] * W.temp[c] * a * Math.sign(lat || 1);
    }
    const abs = Math.abs(lat - itczLat);
    if (!locked && abs > 0.28 && abs < 0.72) {
      jetU += Math.abs(W.windU[c]);
      jetLat += lat * Math.abs(W.windU[c]);
      jetN += Math.abs(W.windU[c]);
    }
  }

  if (!W.vort || W.vort.length !== NC) W.vort = new Float32Array(NC);
  upperFlow(W, fScale, surface);

  /* Convergence and vorticity are now derivatives per planet radius rather than
     per-cell differences, so these constants are the length scale that turns
     them back into the 0–1 fields the rest of the sim reads. Chosen so that a
     healthy ITCZ sits near 0.3 and a cyclone core saturates. */
  for (let c = 0; c < NC; c++) {
    W.converg[c] = clamp(-divEN(W.windU, W.windV, c) * 0.06, -1, 1);
    W.vort[c] = clamp(curlEN(W.windU, W.windV, c) * 0.10, -1, 1);
  }

  const U = spdSum / NC;
  const fMean = fAbs / NC;
  W._rossby = U / Math.max(0.08, fMean);
  W._rossbyNote = W._rossby < 0.35
    ? 'Ro low — rotation-dominated, bands expected'
    : W._rossby > 1.1
      ? 'Ro high — slow rotator, no zonal bands expected'
      : 'Ro transitional';
  W._tropPole = tropA && poleA ? tropT / tropA - poleT / poleA : 0;
  W._heatPole = flux;
  void jetU;

  W._jetLat = jetN > 1e-6 ? jetLat / jetN : 0.5 * Math.sign(itczLat || 1);
  W._windRegime = !surface ? 'zonal jets'
    : locked ? 'substellar'
    : nCells <= 1 ? 'single-cell'
    : nCells <= 2 ? 'wide Hadley'
    : nCells <= 3 ? 'three-cell'
    : nCells <= 5 ? 'multi-band'
    : 'Jovian bands';
}

/**
 * The flow aloft, from thermal wind — the sim's second atmospheric level.
 *
 * A single layer cannot know about a jet stream, and three things in the model
 * were quietly the poorer for it. Tropical cyclones are killed by *vertical*
 * shear, and `storms.js` had nothing better to use than the surface wind speed,
 * which is not the same quantity and is often anticorrelated with it. Midlatitude
 * cyclones are *born* from vertical shear across a temperature gradient — the
 * baroclinic instability — and that ingredient did not exist. And a storm is
 * steered by the flow at its middle levels, not by the wind at the sea surface.
 *
 * None of that needs a second prognostic solver, because the shear is not free:
 * thermal wind ties it to the horizontal temperature gradient,
 *     ∂u/∂z = −(g / f T) ∂T/∂y,
 * so one gradient of the temperature field, rotated and divided by a
 * regularised Coriolis parameter, gives the wind at altitude and the shear
 * between. Westerlies strengthen with height wherever it gets colder poleward,
 * which is the jet, in the right place, for the right reason — and it costs one
 * pass over the grid.
 */
function upperFlow(W, fScale, surface) {
  if (!W.jetU || W.jetU.length !== NC) {
    W.jetU = new Float32Array(NC);
    W.jetV = new Float32Array(NC);
    W.shear = new Float32Array(NC);
  }
  const jetU = W.jetU, jetV = W.jetV, shear = W.shear;
  if (!surface || !W.temp) {
    jetU.set(W.windU); jetV.set(W.windV); shear.fill(0);
    return;
  }
  /* Thermal wind reads a *gradient* of temperature, and the temperature field is
     as detailed as the grid — so at higher resolution the shear inherited every
     cell-scale wrinkle and the "jet core" landed wherever the sharpest local
     contrast happened to be, at 13° latitude over the ITCZ. Thermal wind is a
     synoptic-scale balance, so the smoothing is scaled to hold a roughly fixed
     physical length: what survives is the pole-to-equator and land–sea contrast
     a jet is actually made of, at any resolution. */
  const smoothPasses = Math.max(1, Math.round(SIM_N / 48));
  for (let pass = 0; pass < smoothPasses; pass++) {
    const src = pass === 0 ? W.temp : _tS;
    for (let c = 0; c < NC; c++) _tS[c] = src[c] * 0.45 + neighbourMean(src, c) * 0.55;
  }
  const temp = _tS;
  /* `THERMAL` folds the g/T and the layer depth into one coefficient, fitted so
     that Earth's ~50 K pole-to-equator contrast gives a midlatitude jet a few
     times the surface westerly — the observed ratio. `F0` keeps the tropics
     finite where f vanishes and thermal wind balance stops applying. */
  const THERMAL = 0.34;
  const F0 = 0.30;
  let jetMax = 0, jetLat = 0, jetSpd = 0;
  for (let c = 0; c < NC; c++) {
    /* Gradient inlined rather than through `gradEN`, which returns a fresh
       two-element array — 24 576 of them a tick, on the hottest path in the
       app, for two numbers. */
    let dTe = 0, dTn = 0;
    const i0 = c * 4;
    for (let k = 0; k < 4; k++) {
      const i = i0 + k;
      const d = temp[NBR[i]] - temp[c];
      dTe += d * NBR_E[i];
      dTn += d * NBR_N[i];
    }
    dTe *= NBR_IWE[c];
    dTn *= NBR_IWN[c];
    const lat = DIR[c * 3 + 1];
    const f = lat * fScale;
    const fReg = (f >= 0 ? 1 : -1) * Math.max(Math.abs(f), F0);
    /* Tapered out of the deep tropics, where thermal wind balance does not hold:
       f goes to zero at the equator, so dividing by it put the strongest shear in
       the model exactly where the assumption fails, and the "jet core" came out
       at 13° latitude over the ITCZ's own temperature gradient instead of in the
       midlatitudes. Squared, so the taper is sharp enough to leave the trades
       alone and gentle enough not to draw a line across the subtropics. */
    const trop = Math.min(1, Math.abs(lat) / 0.35);
    const taper = trop * trop;
    let sU = -THERMAL * dTn * taper / fReg;
    let sV = THERMAL * dTe * taper / fReg;
    /* Bounded. However well behaved the smoothed field is, a single cell beside
       an ice edge or a fresh caldera can hold a contrast that thermal wind turns
       into an implausible ribbon; the shear one layer can stand for has a ceiling. */
    const sm = Math.sqrt(sU * sU + sV * sV);
    if (sm > 2.2) { const k = 2.2 / sm; sU *= k; sV *= k; }
    const u = clamp(W.windU[c] + sU, -3.5, 3.5);
    const v = clamp(W.windV[c] + sV, -3.5, 3.5);
    jetU[c] = u;
    jetV[c] = v;
    shear[c] = Math.min(1, Math.sqrt(sU * sU + sV * sV) * 1.25);
    const spd = Math.sqrt(u * u + v * v);
    if (spd > jetMax && Math.abs(lat) > 0.2) { jetMax = spd; jetLat = lat; jetSpd = u; }
  }
  W._jetMax = jetMax;
  W._jetCoreLat = jetLat;
  W._jetCoreU = jetSpd;
  if (!W._windSpd || W._windSpd.length !== NC) W._windSpd = new Float32Array(NC);
  for (let c = 0; c < NC; c++) {
    const u = W.windU[c] || 0, v = W.windV[c] || 0;
    W._windSpd[c] = Math.sqrt(u * u + v * v);
  }
}

/** Cached wind magnitude — filled each tick by geostrophicWind. */
export function windSpeedAt(W, c) {
  if (W._windSpd) return W._windSpd[c] || 0;
  const u = W.windU?.[c] || 0, v = W.windV?.[c] || 0;
  return Math.sqrt(u * u + v * v);
}

/** Band name at a latitude for instruments. */
export function windBandAt(lat, itczLat = 0, nCells = 3) {
  const a = Math.abs(lat - itczLat);
  if (a < 0.08) return 'ITCZ / doldrums';
  if (a < 0.35) return 'trades';
  if (a < 0.42) return 'horse latitudes';
  if (a < 0.72) return 'westerlies';
  return 'polar easterlies';
}
