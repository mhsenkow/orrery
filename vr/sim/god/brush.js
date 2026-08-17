/** Real brush — profile, km radius, masks, snap, symmetry, undo.
 *  Backlog hand 1–14. */

import { clamp } from '../../math.js';
import { NC, DIR, NBR, AREA } from '../../sphere.js';
import { W } from '../../world.js';

/** Earth radius km — used to convert angular brush to surface km. */
const R_KM = 6371;

export const BRUSH = {
  /** Half-angle in radians of the soft edge. */
  radiusRad: 0.08,
  /** 0 = soft cosine, 1 = hard disk. */
  hardness: 0.35,
  /** Strength multiplier per apply (drag accumulates). */
  rate: 1,
  /** Profile: 'cosine' | 'gauss' | 'flat' | 'ring' */
  profile: 'cosine',
  /** Mask id or null. */
  mask: null,
  /** Snap: null | 'coast' | 'bound' | 'river' | 'biome' */
  snap: null,
  /** Symmetry: null | 'equator' | 'lat' | 'great' */
  symmetry: null,
  /** When true, brush applies every frame while held. */
  continuous: true,
  /** Gardening / precision — shrinks radius. */
  precision: false,
  /** Preview ring cells (for UI / globe). */
  preview: [],
};

const UNDO_MAX = 24;
const undoStack = [];

export function brushKm() {
  return BRUSH.radiusRad * R_KM;
}

export function setBrushRadiusKm(km) {
  BRUSH.radiusRad = clamp(km / R_KM, 0.008, 0.6);
}

/** Tier-aware default radius (orbit → surface). Item 2 / 13 / 14. */
export function brushForTier(tier, camDist = 3) {
  const close = camDist < 1.4;
  BRUSH.precision = close || tier === 'Surface' || tier === 'Local';
  if (BRUSH.precision) setBrushRadiusKm(40 + (tier === 'Surface' ? 20 : 60));
  else if (tier === 'Regional') setBrushRadiusKm(280);
  else setBrushRadiusKm(900);
  return brushKm();
}

export function falloff(dot, thresh) {
  const t = (dot - thresh) / (1 - thresh + 1e-6);
  if (t <= 0) return 0;
  const h = BRUSH.hardness;
  let f;
  switch (BRUSH.profile) {
    case 'flat': f = 1; break;
    case 'gauss': f = Math.exp(-((1 - t) * (1 - t)) * 4); break;
    case 'ring': f = Math.sin(t * Math.PI); break;
    default: f = t; // cosine already baked into thresh space
  }
  // Hardness lifts the soft edge toward a disk
  return clamp(f * (1 - h) + (t > 0 ? 1 : 0) * h, 0, 1) * BRUSH.rate;
}

function maskOk(c) {
  const m = BRUSH.mask;
  if (!m) return true;
  if (m === 'dry') return W.moist[c] < 0.2;
  if (m === 'wet') return W.moist[c] > 0.45;
  if (m === 'snow') return W.ice[c] > 0.35;
  if (m === 'belowSnow') return W.ice[c] < 0.2;
  if (m === 'continent') return (W.crust?.[c] ?? 0.5) > 0.45 && W.h[c] >= W.seaLevel;
  if (m === 'ocean') return W.h[c] < W.seaLevel;
  if (m === 'land') return W.h[c] >= W.seaLevel;
  return true;
}

export function snapCell(cell) {
  if (cell < 0 || !BRUSH.snap) return cell;
  const mode = BRUSH.snap;
  let best = cell, score = -1;
  const visit = [cell];
  for (let k = 0; k < 4; k++) {
    const n = NBR[cell * 4 + k];
    if (n >= 0) visit.push(n);
  }
  for (const c of visit) {
    let s = 0;
    if (mode === 'coast') {
      const sea = W.h[c] < W.seaLevel;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if (n >= 0 && (W.h[n] < W.seaLevel) !== sea) s = 2;
      }
    } else if (mode === 'bound') s = W.bound?.[c] ? 2 : 0;
    else if (mode === 'river') s = (W.flow?.[c] || 0);
    else if (mode === 'biome' && W.biome) {
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if (n >= 0 && W.biome[n] !== W.biome[c]) s = 2;
      }
    }
    if (s > score) { score = s; best = c; }
  }
  return best;
}

function mirrorCells(cell) {
  const out = [cell];
  if (!BRUSH.symmetry) return out;
  const x = DIR[cell * 3], y = DIR[cell * 3 + 1], z = DIR[cell * 3 + 2];
  if (BRUSH.symmetry === 'equator') {
    // Flip latitude
    let best = 0, bd = -2;
    for (let c = 0; c < NC; c++) {
      const d = DIR[c * 3] * x + DIR[c * 3 + 1] * (-y) + DIR[c * 3 + 2] * z;
      if (d > bd) { bd = d; best = c; }
    }
    if (best !== cell) out.push(best);
  } else if (BRUSH.symmetry === 'lat') {
    // 180° longitude spin
    let best = 0, bd = -2;
    for (let c = 0; c < NC; c++) {
      const d = DIR[c * 3] * (-x) + DIR[c * 3 + 1] * y + DIR[c * 3 + 2] * (-z);
      if (d > bd) { bd = d; best = c; }
    }
    if (best !== cell) out.push(best);
  }
  return out;
}

/** Snapshot fields before a stroke for undo-the-act. Item 5. */
export function beginStroke(fields = ['h', 'crust', 'life', 'ice', 'temp', 'moist', 'soil', 'albedoPaint']) {
  const snap = { fields: {}, ageYr: W.ageYr, year: W.year };
  for (const f of fields) {
    if (W[f] && W[f].length === NC) snap.fields[f] = new Float32Array(W[f]);
  }
  // Also scalar crust density if present
  if (W.crustType) snap.crustType = new Uint8Array(W.crustType);
  undoStack.push(snap);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  return snap;
}

export function undoStroke() {
  const snap = undoStack.pop();
  if (!snap) return null;
  for (const [f, arr] of Object.entries(snap.fields)) {
    if (W[f]) W[f].set(arr);
  }
  if (snap.crustType && W.crustType) W.crustType.set(snap.crustType);
  return { ok: true, note: 'Reverted direct edit — years that passed stay passed', ageYr: snap.ageYr };
}

export function canUndo() { return undoStack.length > 0; }

/**
 * Paint with profile + mask + symmetry. Callback gets (c, falloff 0..1).
 * Returns { cells, meanFalloff, areaKm2 }.
 */
export function paintBrush(cell, fn, opts = {}) {
  if (cell < 0) return { cells: 0, meanFalloff: 0, areaKm2: 0 };
  cell = snapCell(cell);
  const centres = mirrorCells(cell);
  const radiusRad = opts.radiusRad ?? BRUSH.radiusRad;
  const thresh = Math.cos(radiusRad);
  let n = 0, sum = 0, area = 0;
  const hit = new Uint8Array(NC);

  for (const centre of centres) {
    const cx = DIR[centre * 3], cy = DIR[centre * 3 + 1], cz = DIR[centre * 3 + 2];
    for (let c = 0; c < NC; c++) {
      if (hit[c]) continue;
      const d = DIR[c * 3] * cx + DIR[c * 3 + 1] * cy + DIR[c * 3 + 2] * cz;
      if (d <= thresh) continue;
      if (!maskOk(c)) continue;
      const f = falloff(d, thresh);
      if (f <= 0) continue;
      hit[c] = 1;
      fn(c, f);
      n++;
      sum += f;
      area += (AREA[c] || (4 * Math.PI / NC)) * R_KM * R_KM;
    }
  }
  return { cells: n, meanFalloff: n ? sum / n : 0, areaKm2: area };
}

/** Build preview ring for UI. */
export function previewBrush(cell) {
  BRUSH.preview = [];
  if (cell < 0) return BRUSH.preview;
  cell = snapCell(cell);
  const thresh = Math.cos(BRUSH.radiusRad);
  const inner = Math.cos(BRUSH.radiusRad * 0.92);
  const cx = DIR[cell * 3], cy = DIR[cell * 3 + 1], cz = DIR[cell * 3 + 2];
  for (let c = 0; c < NC; c++) {
    const d = DIR[c * 3] * cx + DIR[c * 3 + 1] * cy + DIR[c * 3 + 2] * cz;
    if (d > thresh && d < inner && maskOk(c)) BRUSH.preview.push(c);
  }
  return BRUSH.preview;
}

/** Continuous drag stroke state. Item 4. */
let _drag = null;

export function startDrag(cell, applyFn, fields) {
  beginStroke(fields);
  _drag = { last: cell, applyFn, cells: 0 };
  const r = paintBrush(cell, applyFn);
  _drag.cells += r.cells;
  return r;
}

export function continueDrag(cell) {
  if (!_drag || cell < 0) return null;
  if (cell === _drag.last) return null;
  _drag.last = cell;
  const r = paintBrush(cell, _drag.applyFn);
  _drag.cells += r.cells;
  return r;
}

export function endDrag() {
  const d = _drag;
  _drag = null;
  return d;
}

export function isDragging() { return !!_drag; }
