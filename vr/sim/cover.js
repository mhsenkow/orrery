/** Cover field and atmosphere-as-reservoir.
 *
 *  Frost / dust / lag / tholin sit on top of the substrate byte. Seasonal
 *  CO₂ / N₂ freeze-out moves mass between `W._atmScale` and `W.frost`.
 *  Earth and Daisyworld do not enter this path. Titan's 1.5 bar N₂ column
 *  is not a condensable reservoir — methane lakes stay a liquid cycle.
 *  CPU `groundAlbedo` reads cover; the kind-keyed photograph globe does not. */

import { clamp } from '../math.js';
import { NC, DIR, AREA } from '../sphere.js';
import { logEvent } from '../chronicle.js';
import { isGasKind, kindOf, usesWhittakerCover } from './planetKind.js';
import {
  cellTK, cycleMaterial, groundAlbedo, livePressureBar, materialAt, surfacePbar,
  surfaceTK, SUB_INDEX, vaporPressureBar,
} from './substrateField.js';
import { COVER_BY_ID, COVER_KINDS } from './coverTable.js';

export { COVER_BY_ID, COVER_KINDS };
export const COVER = COVER_BY_ID;

function hit(id, extra = {}) {
  const k = COVER_BY_ID[id] || COVER_BY_ID.none;
  return { ...k, rgb: k.rgb.slice(), ...extra };
}

/** Overlay colour for sulfur allotropes. Photograph globe stays kind-keyed. */
export function sulfurRgb(TK) {
  if (TK > 390) return [48, 32, 28];
  if (TK > 330) return [200, 70, 42];
  if (TK > 250) return [230, 210, 70];
  return [240, 236, 210];
}

/** Thin CO₂ / N₂ atmospheres can freeze onto the surface. Not Titan, not Venus. */
export function reservoirActive(W) {
  if (!W || W.rule?.earthLike || W.rule?.daisyworld) return false;
  if (W.rule?.airless) return false;
  const { kind } = kindOf(W, W.rule);
  if (isGasKind(kind)) return false;
  const vol = W._worldAxes?.volatile?.v;
  if (vol !== 'CO2' && vol !== 'N2') return false;
  const P0 = surfacePbar(W.rule);
  if (!(P0 > 1e-12) || P0 > 0.2) return false;
  return true;
}

function maxFrozenFrac(vol) {
  // measured: Mars deposits ~¼ of the column as polar CO₂ each winter.
  if (vol === 'CO2') return 0.28;
  if (vol === 'N2') return 0.92;
  return 0.2;
}

function solarMod(W) {
  const e = Math.min(0.99, Math.max(0, W.rule?.eccentricity || 0));
  const nu = W.season || 0;
  const roa = (1 - e * e) / Math.max(0.02, 1 + e * Math.cos(nu));
  return 1 / (roa * roa);
}

function obliquityRad(W) {
  const o = W.obliquity || W.rule?.obliquity || 0.4;
  const a = Math.abs(o);
  return a > Math.PI ? (a * Math.PI) / 180 : Math.min(Math.PI / 2, a);
}

/** Winter polar night: |lat| above the arctic circle, hemisphere in winter. */
function polarNightFrac(W, c) {
  const lat = DIR[c * 3 + 1] || 0;
  const absLat = Math.abs(lat);
  const obl = obliquityRad(W);
  const dec = Math.sin(obl) * Math.sin(W.season || 0);
  const winter = lat * dec < -0.02;
  const polar = clamp((absLat - 0.55) / 0.45, 0, 1);
  const night = winter && absLat > Math.cos(obl);
  const win = night ? 1 : (winter ? clamp(-lat * dec, 0, 1) * polar : 0);
  return { polar, win, night };
}

/** Cold-trap temperature: polar night plus orbital distance. */
export function cellTrapK(W, c) {
  const T0 = surfaceTK(W.rule, W);
  const { polar, win, night } = polarNightFrac(W, c);
  let T = T0 + ((W.temp?.[c] ?? W.meanTemp ?? 0.5) - (W.meanTemp ?? 0.5)) * 40;
  // Mars-class worlds: polar night is tens of kelvin below the mean (CO₂ frost ~148 K).
  // Ice dwarfs already sit near 40 K — eccentricity does the collapse, not a 32% polar cut.
  if (T0 > 120) {
    if (night) T -= T0 * 0.32;
    else if (win > 0) T -= win * polar * T0 * 0.12;
  }
  const smPow = T0 > 120 ? 0.25 : 0.5;
  T *= Math.pow(Math.max(0.04, solarMod(W)), smPow);
  return Math.max(8, T);
}

function trapWeight(W, c) {
  const { win, night } = polarNightFrac(W, c);
  if (night) return 1;
  return win;
}

export function ensureCoverFields(W) {
  const n = W.h?.length || NC;
  if (!W.frost || W.frost.length !== n) W.frost = new Float32Array(n);
  if (!W.lag || W.lag.length !== n) W.lag = new Float32Array(n);
  if (!W.grain || W.grain.length !== n) W.grain = new Float32Array(n);
}

/**
 * Move condensable mass between the atmosphere and polar frost.
 * `W._atmScale` multiplies the authored surface pressure. Conserved:
 * scale + frozen ≈ 1, with frozen capped (0.28 CO₂ / 0.92 N₂).
 */
export function reservoirTick(W) {
  if (!reservoirActive(W)) {
    if (W && W._atmScale == null) W._atmScale = 1;
    return;
  }
  ensureCoverFields(W);
  const mat = cycleMaterial(W);
  if (!mat) return;
  const vol = W._worldAxes.volatile.v;
  const P0 = surfacePbar(W.rule);
  const maxF = maxFrozenFrac(vol);

  const T0 = surfaceTK(W.rule, W);
  const smPow = T0 > 120 ? 0.25 : 0.5;
  let Ttrap = T0 * Math.pow(Math.max(0.04, solarMod(W)), smPow);
  let coldN = 0;
  for (let c = 0; c < NC; c++) {
    if (trapWeight(W, c) < 0.5) continue;
    const T = cellTrapK(W, c);
    if (coldN === 0 || T < Ttrap) Ttrap = T;
    coldN++;
  }
  const Peq = vaporPressureBar(mat, Ttrap);
  let target = 1;
  if (Peq != null && P0 > 0) {
    target = clamp(Peq / P0, 1 - maxF, 1.08);
  }
  const prev = Number.isFinite(W._atmScale) ? W._atmScale : 1;
  W._atmScale = prev + (target - prev) * 0.18;
  const frozen = clamp(1 - W._atmScale, 0, maxF);

  const frost = W.frost;
  const lag = W.lag;
  const dS = W._atmScale - prev;
  for (let c = 0; c < NC; c++) {
    const w = trapWeight(W, c);
    // Optical cover: winter pole goes white even when mass is 25% of the column.
    const optical = w > 0.04 ? clamp(w * (0.2 + frozen * 2.8), 0, 1) : 0;
    const prevF = frost[c] || 0;
    frost[c] = prevF + (optical - prevF) * 0.22;
    if (!W.grain) W.grain = new Float32Array(frost.length);
    if (frost[c] > prevF + 0.02) W.grain[c] = (W.grain[c] || 0) * 0.55;
    else if (frost[c] > 0.08) W.grain[c] = Math.min(1, (W.grain[c] || 0) + 0.002);
    const drop = prevF - frost[c];
    if (drop > 0.002) lag[c] = Math.min(1, (lag[c] || 0) + drop * 0.18);
    if (frost[c] > 0.28) lag[c] = (lag[c] || 0) * 0.985;
    if (dS !== 0 && W.temp && (frost[c] > 0.08 || w > 0.2)) {
      // Sublimation cools; deposition warms. Sketch, not a latent-heat budget.
      W.temp[c] = clamp(W.temp[c] + dS * 0.03 * Math.max(frost[c], w), 0, 1.6);
    }
  }
  noteReservoir(W, mat);
}

function noteReservoir(W, mat) {
  if (!W.chron) return;
  const s = W._atmScale;
  const name = mat?.name || 'volatile';
  if (W._atmFrozenNote !== 'low' && s < 0.82) {
    W._atmFrozenNote = 'low';
    const pct = Math.round(s * 100);
    logEvent(W.chron, W.year || 0, 'phase', 0, 1,
      `Surface pressure is ${pct}% of the mean — ${name} frost is holding the rest`);
  } else if (W._atmFrozenNote === 'low' && s > 0.95) {
    W._atmFrozenNote = 'full';
    logEvent(W.chron, W.year || 0, 'phase', 0, 1,
      `The frozen ${name} has returned to the atmosphere`);
  }
}

/** Dust / tholin / lag bookkeeping. Whittaker worlds skip this. */
export function coverTick(W) {
  if (!W || W.rule?.earthLike || W.rule?.daisyworld) return;
  const { kind } = kindOf(W, W.rule);
  if (isGasKind(kind)) return;
  ensureCoverFields(W);
  const dust = W.dust;
  const gDust = W.gases?.dust || 0;
  if (gDust > 0.01 && dust) {
    for (let c = 0; c < NC; c++) {
      const lat = Math.abs(DIR[c * 3 + 1] || 0);
      const settle = gDust * (0.35 + 0.45 * (1 - lat));
      if (dust[c] < settle) dust[c] = dust[c] + (settle - dust[c]) * 0.04;
    }
  }
  const grain = W.grain;
  const frost = W.frost;
  if (grain && frost) {
    for (let c = 0; c < NC; c++) {
      if (frost[c] > 0.08) grain[c] = Math.min(1, grain[c] + 0.001);
    }
  }
}

/**
 * Kind-keyed cover stamps that the photograph globe does not read.
 * Iapetus two-tone and Enceladus frost are CPU albedo / overlay only.
 */
export function stampCover(W) {
  if (!W || W.rule?.earthLike || W.rule?.daisyworld) return;
  ensureCoverFields(W);
  const { kind } = kindOf(W, W.rule);
  if (isGasKind(kind)) return;
  const n = W.h?.length || NC;
  if (kind === 'iapetus') {
    for (let c = 0; c < n; c++) {
      if (DIR[c * 3] > 0.04) {
        W.lag[c] = 0.92;
        W.frost[c] = 0;
        W.grain[c] = 0.7;
      } else {
        W.frost[c] = 0.88;
        W.lag[c] = 0;
        W.grain[c] = 0;
      }
    }
    return;
  }
  if (kind === 'enceladus') {
    for (let c = 0; c < n; c++) {
      W.frost[c] = 0.9;
      W.grain[c] = 0;
    }
    return;
  }
  if (kind === 'ceres' && W.substrate) {
    const ei = SUB_INDEX.evaporite;
    if (ei != null) {
      for (let c = 0; c < n; c++) {
        if ((W.ice?.[c] || 0) > 0.5) W.substrate[c] = ei;
      }
    }
  }
}

export function coverAt(W, c) {
  if (usesWhittakerCover(W?._planetKind, W)) {
    const life = W.life?.[c] || 0;
    if (life > 0.2) return hit('biome', { amt: life });
    if ((W.ice?.[c] || 0) > 0.45) return hit('frost', { amt: W.ice[c], label: 'snow' });
    return hit('none', { amt: 0 });
  }
  const frost = W.frost?.[c] || 0;
  if (frost > 0.08) return hit('frost', { amt: frost });
  const ejecta = W.ejecta?.[c] || 0;
  if (ejecta > 0.08 && W.rule?.airless) return hit('ray', { amt: ejecta });
  const dust = W.dust?.[c] || 0;
  if (dust > 0.05) return hit('dust', { amt: dust });
  const lag = W.lag?.[c] || 0;
  if (lag > 0.12) return hit('lag', { amt: lag });
  const life = W.life?.[c] || 0;
  if (life > 0.18) return hit('mat', { amt: life });
  const sub = materialAt(W, c);
  if (sub?.id === 'tholin') return hit('tholin', { amt: 1 });
  if (sub?.id === 'sulfur') {
    return hit('sulfur', { amt: 1, rgb: sulfurRgb(cellTK(W, c)) });
  }
  if (sub?.id === 'evaporite') return hit('evaporite', { amt: 1 });
  if (sub?.id === 'regolith' || W.rule?.airless) return hit('regolith', { amt: 0.6 });
  return hit('none', { amt: 0 });
}

/** Area-weighted Bond-style albedo from CPU cover. Not the photograph globe. */
export function hemisphericAlbedo(W, pred) {
  let s = 0, a = 0;
  const n = W.h?.length || NC;
  for (let c = 0; c < n; c++) {
    if (pred && !pred(c)) continue;
    const w = AREA[c] || 1;
    s += w;
    a += w * groundAlbedo(W, c, W.h[c] < (W.seaLevel ?? 0));
  }
  return s ? a / s : 0;
}

export function formatCover(W, c) {
  const hit = coverAt(W, c);
  if (!hit || hit.id === 'none') return '';
  const amt = hit.amt != null ? ` ${hit.amt.toFixed(2)}` : '';
  return `${hit.label}${amt}`;
}

export function formatLivePressure(W) {
  const P0 = surfacePbar(W?.rule);
  const Pl = livePressureBar(W);
  const s = W?._atmScale;
  const fmt = (p) => (p < 0.01 ? p.toExponential(2) : p.toFixed(3));
  if (Number.isFinite(s) && Math.abs(s - 1) > 0.02 && !W?.rule?.earthLike) {
    return `${fmt(Pl)} bar (${Math.round(s * 100)}% of ${fmt(P0)})`;
  }
  return `${fmt(Pl)} bar`;
}
