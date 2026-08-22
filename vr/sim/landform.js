/** Landform grammar: which processes run, which forms are possible, what a cell is.
 *
 *  Authored in vr/data/worlds/processes.json + landforms.json, compiled to
 *  landGrammar.js. Stamps still own the heightfield. This module names the
 *  palette, paints a Uint8 overlay, and tells inspect what made the cell.
 *  Gates are axes and flags — not a name regex. Earth does not stamp. */

import { DIR, NC, AREA } from '../sphere.js';
import { isGasKind, kindOf } from './planetKind.js';
import { materialAt } from './substrateField.js';
import {
  PROCESSES, LANDFORMS, PROCESS_BY_ID, LANDFORM_BY_ID, LANDFORM_INDEX, LANDGRAM_VERSION,
} from './landGrammar.js';

export { PROCESSES, LANDFORMS, PROCESS_BY_ID, LANDFORM_BY_ID, LANDFORM_INDEX, LANDGRAM_VERSION };

function finite(x) { return typeof x === 'number' && Number.isFinite(x); }

/** Catalogue Solar System vs everything else. Exo palettes are invented. */
export function paletteIsInvented(rule) {
  if (rule?.earthLike) return false;
  const cat = rule?._catalogueItem?.c;
  if (cat === 'sol' || cat === 'moons') return false;
  return true;
}

function teqKOf(rule) {
  const rec = rule?.worldRecord;
  const t = rec?.teq;
  if (t && typeof t === 'object' && Number.isFinite(t.v)) return t.v;
  if (Number.isFinite(t)) return t;
  if (Number.isFinite(rule?.teqK)) return rule.teqK;
  if (rule?.solar != null) return 278 * Math.pow(Math.max(0.001, rule.solar), 0.25);
  return null;
}

export function worldLandContext(W) {
  const rule = W?.rule || {};
  const ax = W?._worldAxes || {};
  const { kind } = kindOf(W, rule);
  return {
    interior: ax.interior?.v || rule.interior?.lidMode || 'stagnant',
    volatile: ax.volatile?.v || (rule.methaneSolvent ? 'CH4' : 'H2O'),
    airless: !!rule.airless,
    iceShell: !!rule.iceShell,
    earthLike: !!rule.earthLike,
    fluid: ax.interior?.v === 'fluid' || isGasKind(kind),
    magma: ax.interior?.v === 'magma' || kind === 'magma',
    gravity: ax.gravity?.v ?? rule.gravity ?? 1,
    teqK: teqKOf(rule),
    resurfaceMyr: ax.resurface?.v ?? 200,
    tidal: rule.tidalHeat ?? rule.interior?.heatFlow ?? 0,
    invented: paletteIsInvented(rule),
    kind,
  };
}

function needsOk(n, ctx) {
  if (!n) return true;
  if (n.notFluid && ctx.fluid) return false;
  if (n.notMagma && ctx.magma) return false;
  if (n.notIceShell && ctx.iceShell) return false;
  if (n.notAirless && ctx.airless) return false;
  if (n.airless && !ctx.airless) return false;
  if (n.iceShell && !ctx.iceShell) return false;
  if (n.interior?.length && !n.interior.includes(ctx.interior)) return false;
  if (n.volatile?.length && !n.volatile.includes(ctx.volatile)) return false;
  if (finite(n.minGravity) && !(ctx.gravity >= n.minGravity)) return false;
  if (finite(n.maxGravity) && !(ctx.gravity <= n.maxGravity)) return false;
  if (finite(n.minTeq) && !(ctx.teqK >= n.minTeq)) return false;
  if (finite(n.maxTeq) && finite(ctx.teqK) && !(ctx.teqK <= n.maxTeq)) return false;
  if (finite(n.minTidal) && !(ctx.tidal >= n.minTidal)) return false;
  if (finite(n.maxResurfaceMyr) && finite(ctx.resurfaceMyr)
    && ctx.resurfaceMyr > n.maxResurfaceMyr) return false;
  if (finite(n.minResurfaceMyr) && finite(ctx.resurfaceMyr)
    && ctx.resurfaceMyr < n.minResurfaceMyr) return false;
  return true;
}

/** Processes that can run on this world. */
export function processSet(W) {
  const ctx = worldLandContext(W);
  if (ctx.fluid) return [];
  const ids = new Set();
  for (const f of LANDFORMS) {
    if (needsOk(f.needs, ctx)) ids.add(f.process);
  }
  return PROCESSES.filter((p) => ids.has(p.id)).map((p) => ({
    ...p,
    invented: ctx.invented,
  }));
}

/** Landforms possible on this world. */
export function landformPalette(W) {
  const ctx = worldLandContext(W);
  if (ctx.fluid) return [];
  return LANDFORMS.filter((f) => needsOk(f.needs, ctx)).map((f) => ({
    ...f,
    invented: ctx.invented,
  }));
}

function meanH(W) {
  if (W._hMean != null) return W._hMean;
  let s = 0;
  const n = W.h?.length || NC;
  for (let c = 0; c < n; c++) s += W.h[c];
  W._hMean = s / (n || 1);
  return W._hMean;
}

function scoreHint(f, W, c) {
  const hint = f.hint;
  if (!hint) return 0.12;
  const y = DIR[c * 3 + 1] || 0;
  const absY = Math.abs(y);
  const h = W.h?.[c] ?? 0;
  const sea = W.seaLevel ?? 0;
  if (hint === 'crater') {
    const d = meanH(W) - h;
    return d > 0.04 ? 0.45 + Math.min(0.4, d) : 0.08;
  }
  if (hint === 'ridge') {
    const d = h - meanH(W);
    return d > 0.03 ? 0.5 + Math.min(0.3, d) : 0.1;
  }
  if (hint === 'high') return h > meanH(W) + 0.04 ? 0.7 : 0.1;
  if (hint === 'vent') return (W.shellVent?.[c] || W.lava?.[c] || 0) > 0.15 ? 0.95 : 0.08;
  if (hint === 'southVent') {
    const v = W.shellVent?.[c] || 0;
    return y < -0.55 && v > 0.2 ? 1 : (y < -0.55 ? 0.35 : 0.04);
  }
  if (hint === 'lava') return (W.lava?.[c] || 0) > 0.12 ? 0.9 : 0.06;
  if (hint === 'chaos') {
    const lid = W.shellLid?.[c];
    return lid != null && lid < 0.4 ? 0.8 : 0.12;
  }
  if (hint === 'equator') return absY < 0.35 ? 0.55 : 0.08;
  if (hint === 'lake') {
    const basin = h < sea || h < meanH(W) - 0.02;
    const wet = (W.moist?.[c] || 0) > 0.45 || (W.lake?.[c] || 0) > 0.05;
    return basin && wet ? 0.95 : 0.06;
  }
  if (hint === 'soluble') {
    const m = materialAt(W, c);
    return m?.soluble || m?.id === 'tholin' || m?.id === 'evaporite' ? 0.7 : 0.05;
  }
  if (hint === 'polar') return absY > 0.72 ? 0.85 : 0.06;
  if (hint === 'convect') {
    const m = materialAt(W, c);
    return m?.id === 'n2Ice' ? 0.9 : 0.08;
  }
  if (hint === 'bright') return (W.ice?.[c] || 0) > 0.2 || (W.frost?.[c] || 0) > 0.1 ? 0.6 : 0.12;
  if (hint === 'flow') return (W.flow?.[c] || 0) > 0.12 ? 0.9 : 0.06;
  if (hint === 'ice') return (W.ice?.[c] || 0) > 0.45 ? 0.85 : 0.06;
  return 0.12;
}

function paletteOf(W) {
  return W?._landPalette?.length ? W._landPalette : landformPalette(W);
}

export function formAtCell(W, c) {
  const pal = paletteOf(W);
  if (!pal.length) return null;
  let best = pal[0], bestS = -1;
  for (const f of pal) {
    const s = scoreHint(f, W, c);
    if (s > bestS) { bestS = s; best = f; }
  }
  return bestS > 0.2 ? best : pal[0];
}

export function formFromByte(b) {
  if (!(b > 0)) return null;
  return LANDFORMS[b - 1] || null;
}

export function stampLandforms(W) {
  const n = W.h?.length || NC;
  if (!W.landform || W.landform.length !== n) W.landform = new Uint8Array(n);
  W.landform.fill(0);
  W._hMean = null;
  if (!W || W.rule?.earthLike || W.rule?.daisyworld) {
    W._landPalette = [];
    W._landProcesses = [];
    return;
  }
  const hit = kindOf(W, W.rule);
  const kind = typeof hit === 'string' ? hit : hit?.kind;
  if (isGasKind(kind) || worldLandContext(W).fluid) {
    W._landPalette = [];
    W._landProcesses = [];
    return;
  }
  const pal = landformPalette(W);
  W._landPalette = pal;
  W._landProcesses = processSet(W);
  if (!pal.length) return;
  for (let c = 0; c < n; c++) {
    const f = formAtCell(W, c);
    const i = f ? LANDFORM_INDEX[f.id] : -1;
    W.landform[c] = i >= 0 ? i + 1 : 0;
  }
}

export function landformAt(W, c) {
  const b = W.landform?.[c] || 0;
  if (b) return formFromByte(b);
  return formAtCell(W, c);
}

export function explainForm(form) {
  if (!form) return '';
  const p = PROCESS_BY_ID[form.process];
  const inv = form.invented ? ' · invented' : '';
  const scale = form.scaleKm >= 1 ? `${form.scaleKm | 0} km` : `${Math.round(form.scaleKm * 1000)} m`;
  return `${form.name} · ${p?.name || form.process} · ${scale}${inv}`;
}

export function formatPalette(W) {
  if (W?.rule?.earthLike || W?.rule?.daisyworld) return '';
  const pal = paletteOf(W);
  if (!pal.length) return 'no landform palette';
  const names = pal.slice(0, 6).map((f) => f.name);
  const more = pal.length > 6 ? ` +${pal.length - 6}` : '';
  const inv = pal[0]?.invented ? ' · invented' : '';
  return `${names.join(' · ')}${more}${inv}`;
}

export function landformCensus(W) {
  const pal = paletteOf(W);
  const counts = {};
  for (const f of pal) counts[f.id] = 0;
  const n = W.h?.length || NC;
  let area = 0;
  for (let c = 0; c < n; c++) {
    const f = landformAt(W, c);
    if (!f) continue;
    const w = AREA[c] || 1;
    counts[f.id] = (counts[f.id] || 0) + w;
    area += w;
  }
  const rows = Object.entries(counts)
    .map(([id, a]) => ({ id, name: LANDFORM_BY_ID[id]?.name || id, frac: area ? a / area : 0 }))
    .filter((r) => r.frac > 0.01)
    .sort((a, b) => b.frac - a.frac);
  return { n: pal.length, rows, invented: pal[0]?.invented || false };
}

/**
 * Crater counts from age and resurfacing, not four magic numbers.
 * Wired into stampCraters for airless / authored crater stamps (C26).
 */
export function craterCounts(rule, ax) {
  const age = ax?.age?.v ?? 4.5;
  const resurf = Math.max(0.01, ax?.resurface?.v ?? 200);
  const g = Math.max(0.03, ax?.gravity?.v ?? rule?.gravity ?? 1);
  const young = resurf < 5;
  const dens = young ? 0.15 : Math.min(2.4, (age / 4.5) * (resurf / 80) / Math.sqrt(g));
  return {
    nLarge: Math.max(0, Math.round(1 + dens * 5)),
    nMid: Math.max(0, Math.round(4 + dens * 22)),
    depth: 0.12 + 0.12 / Math.sqrt(g),
    micro: young ? 0.15 : 0.45,
  };
}

export function formatCoverThickness(W, c) {
  const frost = W.frost?.[c] || 0;
  if (frost > 0.55) return 'thick frost';
  if (frost > 0.08) return 'thin frost';
  return '';
}
