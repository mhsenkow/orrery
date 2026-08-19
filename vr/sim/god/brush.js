/** Real brush — profile, km radius, masks, snap, symmetry, undo.
 *  Backlog hand 1–14. Paints a geodesic disc by BFS from the centre instead of
 *  scanning the whole sphere, so a stroke costs the cells it touches. */

import { clamp } from '../../math.js';
import { NC, DIR, NBR, AREA, dirToCell } from '../../sphere.js';
import { W } from '../../world.js';
import { snapshotActiveLayer, restoreLayerSnapshot } from '../layers.js';

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
  /** When true, brush applies every frame while held on the same cell. */
  continuous: true,
  /** Spacing as a fraction of radius along a drag path. */
  spacing: 0.4,
  /** Gardening / precision — shrinks radius. */
  precision: false,
  /** Map-local paint: the clicked cell, not a 900 km disc. */
  pinpoint: false,
  /** Preview cells (for globe / map cursor). */
  preview: [],
  previewCenter: -1,
};

const UNDO_MAX = 24;
const undoStack = [];
const redoStack = [];

let _invert = false;
export function setBrushInvert(on) { _invert = !!on; }
export function brushInvert() { return _invert; }

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

export function falloff(dot, thresh, radiusRad = BRUSH.radiusRad) {
  if (dot <= thresh) return 0;
  const ang = Math.acos(clamp(dot, -1, 1));
  const u = clamp(1 - ang / Math.max(1e-6, radiusRad), 0, 1);
  const h = BRUSH.hardness;
  let f;
  switch (BRUSH.profile) {
    case 'flat': f = 1; break;
    case 'gauss': f = Math.exp(-((1 - u) * (1 - u)) * 4); break;
    case 'ring': f = Math.sin(u * Math.PI); break;
    default: f = 0.5 - 0.5 * Math.cos(u * Math.PI); // cosine in geodesic distance
  }
  return clamp(f * (1 - h) + (u > 0 ? 1 : 0) * h, 0, 1) * BRUSH.rate;
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

function snapScore(c, mode) {
  if (mode === 'coast') {
    const sea = W.h[c] < W.seaLevel;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (n >= 0 && (W.h[n] < W.seaLevel) !== sea) return 2;
    }
    return 0;
  }
  if (mode === 'bound') return W.bound?.[c] ? 2 : 0;
  if (mode === 'river') return W.flow?.[c] || 0;
  if (mode === 'biome' && W.biome) {
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (n >= 0 && W.biome[n] !== W.biome[c]) return 2;
    }
    return 0;
  }
  return 0;
}

export function snapCell(cell) {
  if (cell < 0 || !BRUSH.snap) return cell;
  const mode = BRUSH.snap;
  const thresh = Math.cos(BRUSH.radiusRad);
  let best = cell, score = snapScore(cell, mode);
  walkCap(cell, thresh, (c) => {
    const s = snapScore(c, mode);
    if (s > score) { score = s; best = c; }
  });
  return best;
}

function mirrorCells(cell) {
  const out = [cell];
  if (!BRUSH.symmetry) return out;
  const x = DIR[cell * 3], y = DIR[cell * 3 + 1], z = DIR[cell * 3 + 2];
  const add = (cx, cy, cz) => {
    const m = dirToCell(cx, cy, cz);
    if (m >= 0 && m !== cell && !out.includes(m)) out.push(m);
  };
  if (BRUSH.symmetry === 'equator') add(x, -y, z);
  else if (BRUSH.symmetry === 'lat') add(-x, y, -z);
  else if (BRUSH.symmetry === 'great') {
    add(-x, -y, -z);
    add(-x, y, z);
    add(x, -y, z);
  }
  return out;
}

let _q = null;
let _seen = null;
let _stamp = 1;

function ensureWalk() {
  if (!_q || _q.length !== NC) {
    _q = new Int32Array(NC);
    _seen = new Uint32Array(NC);
    _stamp = 1;
  }
  _stamp++;
  if (_stamp > 0xfffffff0) { _seen.fill(0); _stamp = 1; }
}

/** Visit every cell in the geodesic cap, front to back. */
function walkCap(centre, thresh, fn) {
  ensureWalk();
  let qh = 0, qt = 0;
  _q[qt++] = centre;
  _seen[centre] = _stamp;
  const cx = DIR[centre * 3], cy = DIR[centre * 3 + 1], cz = DIR[centre * 3 + 2];
  while (qh < qt) {
    const c = _q[qh++];
    const d = DIR[c * 3] * cx + DIR[c * 3 + 1] * cy + DIR[c * 3 + 2] * cz;
    if (d <= thresh) continue;
    fn(c, d);
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (n >= 0 && _seen[n] !== _stamp) {
        _seen[n] = _stamp;
        _q[qt++] = n;
      }
    }
  }
  return qt;
}

/** Snapshot fields before a stroke for undo-the-act. Item 5.
 *  Height lives on the active paint layer — copy that, not the whole `W.h`. */
export function beginStroke(fields = ['h', 'crust', 'life', 'ice', 'temp', 'moist', 'soil', 'albedoPaint']) {
  const snap = { fields: {}, ageYr: W.ageYr, year: W.year, fieldNames: fields };
  const skipH = !!(W.layerStack && fields.includes('h'));
  for (const f of fields) {
    if (skipH && f === 'h') continue;
    if (W[f] && W[f].length === NC) snap.fields[f] = new Float32Array(W[f]);
  }
  if (W.crustType) snap.crustType = new Uint8Array(W.crustType);
  if (skipH) snap.layer = snapshotActiveLayer(W);
  undoStack.push(snap);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0;
  return snap;
}

function captureNow(fieldNames) {
  const snap = { fields: {}, ageYr: W.ageYr, year: W.year, fieldNames };
  const skipH = !!(W.layerStack && fieldNames.includes('h'));
  for (const f of fieldNames) {
    if (skipH && f === 'h') continue;
    if (W[f] && W[f].length === NC) snap.fields[f] = new Float32Array(W[f]);
  }
  if (W.crustType) snap.crustType = new Uint8Array(W.crustType);
  if (skipH) snap.layer = snapshotActiveLayer(W);
  return snap;
}

function applySnap(snap) {
  for (const [f, arr] of Object.entries(snap.fields)) {
    if (W[f]) W[f].set(arr);
  }
  if (snap.crustType && W.crustType) W.crustType.set(snap.crustType);
  if (snap.layer) restoreLayerSnapshot(W, snap.layer);
  W._hydroDirty = true;
}

export function undoStroke() {
  const snap = undoStack.pop();
  if (!snap) return null;
  redoStack.push(captureNow(snap.fieldNames || Object.keys(snap.fields)));
  if (redoStack.length > UNDO_MAX) redoStack.shift();
  applySnap(snap);
  return { ok: true, note: 'Reverted direct edit — years that passed stay passed', ageYr: snap.ageYr };
}

export function redoStroke() {
  const snap = redoStack.pop();
  if (!snap) return null;
  undoStack.push(captureNow(snap.fieldNames || Object.keys(snap.fields)));
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  applySnap(snap);
  return { ok: true, note: 'Redid the stroke', ageYr: snap.ageYr };
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function setPinpoint(on) {
  BRUSH.pinpoint = !!on;
}

function markStroke(cells) {
  if (!W.strokeMark || W.strokeMark.length !== NC) W.strokeMark = new Float32Array(NC);
  for (const c of cells) {
    W.strokeMark[c] = 1;
  }
  W._strokeTick = W._tickIndex || 0;
}

/**
 * Paint with profile + mask + symmetry. Callback gets (c, falloff 0..1).
 * Returns { cells, meanFalloff, areaKm2, visited }.
 */
export function paintBrush(cell, fn, opts = {}) {
  if (cell < 0) return { cells: 0, meanFalloff: 0, areaKm2: 0, visited: 0 };
  cell = snapCell(cell);
  const pinpoint = opts.pinpoint ?? BRUSH.pinpoint;
  if (pinpoint) {
    const hit = [cell];
    fn(cell, 1);
    for (let k = 0; k < 4; k++) {
      const n = NBR[cell * 4 + k];
      if (n < 0 || !maskOk(n)) continue;
      fn(n, 0.45);
      hit.push(n);
    }
    markStroke(hit);
    if (!opts.deferHydro) W._hydroDirty = true;
    W._sculpted = true;
    return { cells: hit.length, meanFalloff: 1, areaKm2: hit.length * 400, visited: hit.length };
  }
  const centres = mirrorCells(cell);
  const radiusRad = opts.radiusRad ?? BRUSH.radiusRad;
  const thresh = Math.cos(radiusRad);
  let n = 0, sum = 0, area = 0, visited = 0;
  const hit = new Uint8Array(NC);
  const marked = [];

  for (const centre of centres) {
    walkCap(centre, thresh, (c, d) => {
      visited++;
      if (hit[c] || !maskOk(c)) return;
      const f = falloff(d, thresh, radiusRad);
      if (f <= 0) return;
      hit[c] = 1;
      fn(c, f);
      n++;
      sum += f;
      area += (AREA[c] || (4 * Math.PI / NC)) * R_KM * R_KM;
      marked.push(c);
    });
  }
  markStroke(marked);
  if (!opts.deferHydro) W._hydroDirty = true;
  W._sculpted = true;
  return { cells: n, meanFalloff: n ? sum / n : 0, areaKm2: area, visited };
}

/** Build preview disc for UI — the cells that will actually be painted. */
export function previewBrush(cell) {
  BRUSH.preview = [];
  BRUSH.previewCenter = cell;
  if (cell < 0) return BRUSH.preview;
  cell = snapCell(cell);
  BRUSH.previewCenter = cell;
  if (BRUSH.pinpoint) {
    BRUSH.preview.push(cell);
    for (let k = 0; k < 4; k++) {
      const n = NBR[cell * 4 + k];
      if (n >= 0 && maskOk(n)) BRUSH.preview.push(n);
    }
    return BRUSH.preview;
  }
  const thresh = Math.cos(BRUSH.radiusRad);
  walkCap(cell, thresh, (c) => {
    if (maskOk(c)) BRUSH.preview.push(c);
  });
  return BRUSH.preview;
}

function slerpDir(a, b, t, out) {
  const ax = DIR[a * 3], ay = DIR[a * 3 + 1], az = DIR[a * 3 + 2];
  const bx = DIR[b * 3], by = DIR[b * 3 + 1], bz = DIR[b * 3 + 2];
  const dot = clamp(ax * bx + ay * by + az * bz, -1, 1);
  const ang = Math.acos(dot);
  if (ang < 1e-5) {
    out[0] = ax; out[1] = ay; out[2] = az;
    return out;
  }
  const s = Math.sin(ang);
  const wa = Math.sin((1 - t) * ang) / s;
  const wb = Math.sin(t * ang) / s;
  out[0] = ax * wa + bx * wb;
  out[1] = ay * wa + by * wb;
  out[2] = az * wa + bz * wb;
  return out;
}

/** Continuous drag stroke state. Item 4. */
let _drag = null;
const _tmp = [0, 0, 0];

export function startDrag(cell, applyFn, fields) {
  beginStroke(fields);
  _drag = { last: cell, applyFn, cells: 0, areaKm2: 0 };
  const r = paintBrush(cell, applyFn, { deferHydro: true });
  _drag.cells += r.cells;
  _drag.areaKm2 += r.areaKm2;
  return r;
}

export function continueDrag(cell) {
  if (!_drag || cell < 0) return null;
  if (cell === _drag.last) return null;
  const stepRad = Math.max(0.004, BRUSH.radiusRad * (BRUSH.spacing ?? 0.4));
  const ax = DIR[_drag.last * 3], ay = DIR[_drag.last * 3 + 1], az = DIR[_drag.last * 3 + 2];
  const bx = DIR[cell * 3], by = DIR[cell * 3 + 1], bz = DIR[cell * 3 + 2];
  const ang = Math.acos(clamp(ax * bx + ay * by + az * bz, -1, 1));
  const steps = Math.max(1, Math.ceil(ang / stepRad));
  let lastPainted = _drag.last;
  let r = null;
  for (let i = 1; i <= steps; i++) {
    slerpDir(_drag.last, cell, i / steps, _tmp);
    const c = dirToCell(_tmp[0], _tmp[1], _tmp[2]);
    if (c < 0 || c === lastPainted) continue;
    r = paintBrush(c, _drag.applyFn, { deferHydro: true });
    _drag.cells += r.cells;
    _drag.areaKm2 += r.areaKm2;
    lastPainted = c;
  }
  _drag.last = cell;
  return r;
}

export function endDrag() {
  const d = _drag;
  _drag = null;
  if (d) W._hydroDirty = true;
  return d;
}

export function isDragging() { return !!_drag; }

/** Cells the last paintBrush walk touched — for tests. */
export function brushWalkBudget(centre) {
  const thresh = Math.cos(BRUSH.radiusRad);
  let n = 0;
  walkCap(centre, thresh, () => { n++; });
  return n;
}
