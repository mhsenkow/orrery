/** Substrate lookup, phase, and the per-cell field.
 *
 *  Table is authored in vr/data/worlds/substrates.json and compiled to
 *  substrates.js. This file is the physics: Clausius–Clapeyron below the
 *  triple point, melt then boil above it, and a stamp from axes + T/P.
 *  W.rock is unchanged. Earth still maps rock → substrate 0–7. */

import { DIR, NC } from '../sphere.js';
import { kelvinFromTempScalar } from './exophysics.js';
import { isGasKind, kindOf } from './planetKind.js';
import { worldAxes } from './worldAxes.js';
import { SUBSTRATES, SUB_BY_ID, SUB_INDEX, EARTH_ROCK_COUNT } from './substrates.js';

export { SUBSTRATES, SUB_BY_ID, SUB_INDEX, EARTH_ROCK_COUNT };

const R = 8.314;

function finite(x) { return typeof x === 'number' && Number.isFinite(x); }

/** Surface T in kelvin for phase and substrate pick.
 *  Earth uses the climate scalar (288 K). Venus keeps the runaway skin
 *  temperature. Cold worlds prefer teqK — Titan's greenhouse sketch is 120 K
 *  and that would boil the lakes that exist at 94 K. */
export function surfaceTK(rule, W) {
  if (rule?.earthLike) {
    if (W && finite(W.meanTemp)) return kelvinFromTempScalar(W.meanTemp);
    return 288;
  }
  const teq = rule?.teqK;
  const ts = rule?.tSurfK;
  if (finite(ts) && finite(teq) && ts > teq + 150) return ts;
  if (finite(teq) && teq < 220) return teq;
  if (finite(ts) && ts > 0) return ts;
  if (finite(teq) && teq > 0) return teq;
  if (W && finite(W.meanTemp)) return kelvinFromTempScalar(W.meanTemp);
  return 288;
}

/** Surface pressure in bar. Airless is a trace, not 1. Authored mean, not live. */
export function surfacePbar(rule) {
  if (rule?.airless) return 1e-12;
  if (finite(rule?.surfacePressureBar)) return Math.max(0, rule.surfacePressureBar);
  return 1;
}

/** Live surface pressure: authored mean times the condensable reservoir scale. */
export function livePressureBar(W) {
  const P = surfacePbar(W?.rule);
  if (!W || W.rule?.earthLike) return P;
  const s = W._atmScale;
  if (!finite(s)) return P;
  return Math.max(1e-20, P * Math.max(0, s));
}

/** Clausius–Clapeyron vapour pressure of a substrate row, bar. */
export function vaporPressureBar(mat, TK) {
  if (!mat) return null;
  const Tt = mat.tripleK;
  const Pt = mat.tripleBar;
  if (!(Tt > 0) || !(Pt > 0) || !(TK > 0)) return null;
  const L = mat.LsubJmol > 0 ? mat.LsubJmol : 20 * R * Tt;
  const P = Pt * Math.exp((L / R) * (1 / Tt - 1 / TK));
  return Number.isFinite(P) && P > 0 ? P : null;
}

function sublT(mat, Pbar) {
  const Tt = mat.tripleK;
  const Pt = mat.tripleBar;
  if (!(Tt > 0) || !(Pt > 0)) return null;
  const P = Math.max(Pbar, 1e-20);
  const L = mat.LsubJmol > 0 ? mat.LsubJmol : 20 * R * Tt;
  const T = 1 / (1 / Tt - (R / L) * Math.log(P / Pt));
  return Number.isFinite(T) && T > 0 ? T : null;
}

/**
 * Phase of a material at T (K) and P (bar).
 * Below the triple pressure: solid vs gas (sublimation), with a 12% band
 * on the curve so coexistence (Pluto N₂ ice + vapour) reads as solid.
 * Above it: melt then boil. Past critical T and P: supercritical.
 */
export function phaseAt(mat, TK, Pbar) {
  if (!mat) return 'none';
  if (mat.noSurface) return 'none';
  const T = TK;
  const P = Math.max(Pbar, 0);
  if (!finite(T) || T <= 0) return 'none';
  if (mat.criticalK > 0 && T > mat.criticalK && P > (mat.criticalBar || 0)) {
    return 'supercritical';
  }
  const Tt = mat.tripleK;
  const Pt = mat.tripleBar;
  if (Tt > 0 && Pt > 0 && P < Pt) {
    const Ts = sublT(mat, P);
    if (Ts == null) return T < Tt ? 'solid' : 'gas';
    // Coexistence: Pluto N₂ ice sits on the vapour-pressure curve, so a
    // few kelvin above Tsub at the tabulated P is still a solid surface.
    const band = Math.max(10, Ts * 0.22);
    return T <= Ts + band ? 'solid' : 'gas';
  }
  const Tm = mat.meltK || Tt || 1e9;
  const Tb = mat.boilK || mat.criticalK || (Tm + 100);
  if (T < Tm) return 'solid';
  if (T < Tb) return 'liquid';
  return 'gas';
}

/** Solid that flows (N₂ on Pluto, water ice near 250 K) vs rigid solid vs fluid. */
export function rheologyAt(mat, TK, Pbar) {
  const ph = phaseAt(mat, TK, Pbar);
  if (ph !== 'solid') return ph;
  if (finite(mat.convectK) && TK >= mat.convectK) return 'convecting-ice';
  return 'solid';
}

export function materialById(id) {
  return SUB_BY_ID[id] || SUBSTRATES[0];
}

export function materialAt(W, c) {
  const i = W?.substrate?.[c];
  if (i == null) {
    const rock = W?.rock?.[c] ?? 0;
    return SUBSTRATES[rock] || SUBSTRATES[0];
  }
  return SUBSTRATES[i] || SUBSTRATES[0];
}

export function nameAt(W, c) {
  return materialAt(W, c).name;
}

/** "nitrogen ice over water-ice bedrock" when cover and bedrock differ. */
export function describeSubstrate(W, c) {
  const top = materialAt(W, c);
  const bedId = W._substrateBedrock;
  const bed = bedId && SUB_BY_ID[bedId];
  if (bed && bed.id !== top.id && !top.noSurface) return `${top.name} over ${bed.name} bedrock`;
  return top.name;
}

export function erodeFactor(W, c) {
  if (W?.rule?.earthLike) return 1;
  const m = materialAt(W, c);
  return finite(m?.erode) ? m.erode : 1;
}

/**
 * Bedrock + optional cover from axes and T/P. Not a per-body stamp.
 * Kind is only used to recognise a gas giant already classified.
 */
export function pickMaterials(rule, ax, TK, Pbar, kind) {
  const vol = ax?.volatile?.v;
  const interior = ax?.interior?.v;
  if (interior === 'fluid' || isGasKind(kind)) {
    return { bedrock: 'envelope', cover: null, landCover: null };
  }
  if (interior === 'magma') {
    return { bedrock: 'silicate', cover: null, landCover: null };
  }

  let bedrock = 'basalt';
  if (interior === 'ice' || vol === 'N2' || vol === 'CH4'
    || (vol === 'H2O' && TK < 220 && (ax?.volatiles?.v ?? 0) > 0.3)) {
    bedrock = 'waterIce';
  } else if (interior === 'heatpipe') {
    bedrock = 'silicate';
  } else if (vol === 'SO2' || vol === 'CO2' || vol === 'H2O') {
    bedrock = 'basalt';
  } else if (rule?.airless || (ax?.volatiles?.v ?? 1) < 0.005) {
    bedrock = 'basalt';
  }

  let cover = null;
  let landCover = null;
  if (vol === 'N2') {
    const n2 = SUB_BY_ID.n2Ice;
    if (phaseAt(n2, TK, Pbar) === 'solid' || rheologyAt(n2, TK, Pbar) === 'convecting-ice') {
      cover = 'n2Ice';
    }
  } else if (vol === 'CH4') {
    const ch4 = SUB_BY_ID.ch4Ice;
    const ph = phaseAt(ch4, TK, Pbar);
    if (ph === 'liquid') {
      cover = 'hydrocarbon';
      landCover = 'tholin';
    } else if (ph === 'solid') {
      cover = 'ch4Ice';
    }
  } else if (vol === 'NH3') {
    bedrock = 'waterIce';
    cover = 'nh3Water';
  } else if (vol === 'CO2') {
    const co2 = SUB_BY_ID.co2Ice;
    if (phaseAt(co2, TK * 0.72, Pbar) === 'solid') cover = 'co2Ice';
  } else if (interior === 'heatpipe' || (vol === 'SO2' && rule?.airless)) {
    cover = 'sulfur';
  } else if (rule?.airless || (ax?.volatiles?.v ?? 1) < 0.005) {
    cover = 'regolith';
  }

  return { bedrock, cover, landCover };
}

function idx(id) {
  const i = SUB_INDEX[id];
  return i == null ? 0 : i;
}

/** Stamp W.substrate from the table. Earth copies W.rock. Does not mutate rock. */
export function stampSubstrate(W) {
  const n = W.h?.length || NC;
  if (!W.substrate || W.substrate.length !== n) W.substrate = new Uint8Array(n);
  const rule = W.rule || {};
  const { kind } = kindOf(W, rule);
  const ax = W._worldAxes || worldAxes(rule);
  const T = surfaceTK(rule, W);
  const P = surfacePbar(rule);

  if (rule.earthLike || kind === 'earth' || kind === 'daisy') {
    const iceI = idx('waterIce');
    for (let c = 0; c < n; c++) {
      let i = W.rock?.[c] ?? 0;
      if (i >= EARTH_ROCK_COUNT) i = 0;
      if ((W.ice?.[c] || 0) > 0.45 && W.h[c] >= W.seaLevel) i = iceI;
      W.substrate[c] = i;
    }
    W._substrateBedrock = 'basalt';
    W._substrateCover = null;
    return;
  }

  const pick = pickMaterials(rule, ax, T, P, kind);
  const bi = idx(pick.bedrock);
  const ci = pick.cover ? idx(pick.cover) : bi;
  const li = pick.landCover ? idx(pick.landCover) : ci;
  W._substrateBedrock = pick.bedrock;
  W._substrateCover = pick.cover || null;

  let hMean = 0;
  for (let c = 0; c < n; c++) hMean += W.h[c];
  hMean /= n || 1;
  const polarCover = pick.cover === 'co2Ice';
  const sulfur = pick.cover === 'sulfur';
  const globalCover = pick.cover === 'regolith' || sulfur;

  for (let c = 0; c < n; c++) {
    let i = bi;
    const basin = W.h[c] < hMean - 0.01 || W.h[c] < (W.seaLevel ?? -1);
    if (pick.landCover) {
      i = basin ? ci : li;
    } else if (globalCover) {
      i = ci;
    } else if (polarCover) {
      const lat = Math.abs(DIR[c * 3 + 1] || 0);
      if (lat > 0.75) i = ci;
    } else if (pick.cover && (basin || (W.ice?.[c] || 0) > 0.3)) {
      i = ci;
    }
    if (sulfur && (W.lava?.[c] || 0) > 0.2) i = idx('silicate');
    W.substrate[c] = i;
  }
}

const VOL_MAT = {
  H2O: 'waterIce',
  CH4: 'ch4Ice',
  N2: 'n2Ice',
  CO2: 'co2Ice',
  NH3: 'nh3Water',
};

/** Substrate row the hydrological cycle is carrying. Null = no volatile cycle. */
export function cycleMaterial(W) {
  if (W?.rule?.earthLike) return SUB_BY_ID.waterIce;
  const vol = W?._worldAxes?.volatile?.v
    || (W?.rule?.methaneSolvent ? 'CH4' : null);
  if (vol === 'H2' || vol === 'silicate' || vol === 'He') return null;
  if (vol === 'SO2') return SUB_BY_ID.sulfur || null;
  const id = VOL_MAT[vol];
  return id ? SUB_BY_ID[id] : null;
}

/** Cell temperature in kelvin, anchored on world surface T. */
export function cellTK(W, c) {
  const mean = surfaceTK(W?.rule, W);
  const d = ((W?.temp?.[c] ?? W?.meanTemp ?? 0.5) - (W?.meanTemp ?? 0.5)) * 160;
  return Math.max(1, mean + d);
}

/**
 * Temperature band where this material is liquid at P.
 * Below the triple pressure there is no liquid — Mars CO₂, Pluto N₂.
 */
export function liquidWindow(mat, Pbar) {
  if (!mat || mat.noSurface) return null;
  const P = Math.max(Pbar || 0, 0);
  const Tt = mat.tripleK;
  const Pt = mat.tripleBar;
  if (Tt > 0 && Pt > 0 && P < Pt) return null;
  const tMin = mat.meltK || Tt;
  const tMax = mat.boilK || mat.criticalK;
  if (!(tMin > 0) || !(tMax > 0) || tMax <= tMin) return null;
  return { tMin, tMax };
}

export function formatLiquidWindow(mat, Pbar) {
  if (!mat) return '';
  const w = liquidWindow(mat, Pbar);
  if (!w) return `${mat.name}: no liquid at ${Pbar < 0.01 ? Pbar.toExponential(1) : Pbar} bar`;
  return `${mat.name} liquid ${w.tMin | 0}–${w.tMax | 0} K`;
}

export function rheologyAtCell(W, c) {
  const mat = cycleMaterial(W) || materialAt(W, c);
  if (!mat || mat.noSurface) return 'none';
  return rheologyAt(mat, cellTK(W, c), livePressureBar(W));
}

/** Phase of the cycle volatile at this cell — ice sheets, lakes, frost.
 *  `W.ice` is the water-ice field; it must not paint Titan lakes solid. */
export function phaseAtCell(W, c) {
  const mat = cycleMaterial(W);
  const top = materialAt(W, c);
  if (!mat || mat.noSurface) return top?.noSurface ? 'none' : 'solid';
  const P = livePressureBar(W);
  const TK = cellTK(W, c);
  if (top?.class === 'fluid' || top?.id === 'hydrocarbon' || top?.id === 'scCO2') {
    return phaseAt(top, TK, P);
  }
  if ((W.frost?.[c] || 0) > 0.12 && !W.rule?.earthLike) {
    const r = rheologyAt(mat, TK, P);
    return r === 'convecting-ice' ? 'convecting-ice' : 'solid';
  }
  const vol = W._worldAxes?.volatile?.v;
  if ((vol === 'H2O' || W.rule?.earthLike) && (W.ice?.[c] || 0) > 0.3) {
    const r = rheologyAt(mat, TK, P);
    return r === 'convecting-ice' ? 'convecting-ice' : 'solid';
  }
  if (W.h[c] < (W.seaLevel ?? 0) && !W.rule?.airless) {
    const ph = phaseAt(mat, TK, P);
    if (ph === 'liquid' || ph === 'supercritical') return ph;
  }
  return rheologyAt(mat, TK, P);
}

/** Ground albedo from the substrate row, then cover. Earth keeps 0.06 / 0.18.
 *  Grain: fine frost 0.90, coarse 0.38. Airless surfaces darken with cell age. */
export function groundAlbedo(W, c, isSea) {
  if (W?.rule?.earthLike) return isSea ? 0.06 : 0.18;
  if ((W.albedoPaint?.[c] || 0) > 0.04) return Math.min(0.92, W.albedoPaint[c]);
  const m = materialAt(W, c);
  let a = finite(m?.albedo) ? Math.min(0.92, Math.max(0, m.albedo)) : (isSea ? 0.06 : 0.18);
  const frost = W.frost?.[c] || 0;
  if (frost > 0.04) {
    const g = Math.min(1, Math.max(0, W.grain?.[c] || 0));
    const fAlb = 0.90 + (0.38 - 0.90) * g;
    a += (Math.min(0.92, fAlb) - a) * Math.min(1, frost);
  } else {
    const lag = W.lag?.[c] || 0;
    if (lag > 0.04) a += (0.12 - a) * Math.min(1, lag);
    const dust = W.dust?.[c] || 0;
    if (dust > 0.04) a += (0.25 - a) * Math.min(1, dust * 0.85);
    const ejecta = W.ejecta?.[c] || 0;
    if (ejecta > 0.08) a += (0.40 - a) * Math.min(1, ejecta);
  }
  if (W.rule?.airless && frost < 0.04) {
    const age = Math.max(0, W.age?.[c] || 0);
    const weather = 1 - Math.exp(-age / 800);
    const fresh = Math.min(1, W.ejecta?.[c] || 0);
    a *= 1 - 0.42 * weather * (1 - fresh);
  }
  return Math.min(0.92, Math.max(0.04, a));
}

export function thermalInertiaAt(W, c) {
  if (W?.rule?.earthLike) return 1200;
  const m = materialAt(W, c);
  return finite(m?.thermalInertia) ? m.thermalInertia : 1200;
}

/**
 * Max neighbour height drop before hillslope fails. Earth returns 9 (no cap).
 * Strength is MPa; nitrogen ice at 0.01 MPa cannot hold a cliff.
 */
export function slopeCap(W, c) {
  if (W?.rule?.earthLike) return 9;
  const m = materialAt(W, c);
  if (!m || m.noSurface) return 9;
  const T = cellTK(W, c);
  const P = livePressureBar(W);
  const rheo = rheologyAt(m, T, P);
  if (rheo === 'liquid' || rheo === 'gas' || rheo === 'supercritical' || rheo === 'none') {
    return 0.02;
  }
  const s = Math.max(0, m.strength ?? 100);
  let cap = 0.028 + Math.log10(s + 1) * 0.11;
  if (rheo === 'convecting-ice') cap *= 0.35;
  return cap < 0.03 ? 0.03 : cap > 0.55 ? 0.55 : cap;
}

export function packSubstrate(src) {
  if (!src || !src.length) return '';
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < src.length; i += CH) {
    s += String.fromCharCode.apply(null, src.subarray(i, i + CH));
  }
  return btoa(s);
}

export function unpackSubstrate(b64, into) {
  if (!b64 || !into) return;
  const bin = atob(b64);
  const n = Math.min(into.length, bin.length);
  for (let i = 0; i < n; i++) into[i] = bin.charCodeAt(i);
}
