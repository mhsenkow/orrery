/** Height layer stack. `W.h` stays the composite the rest of the sim reads.
 *  Base is generated land (and later, sim-absorbed change). Paint layers are
 *  offsets with opacity, blend, hide, mask, and their own undo snapshots. */

import { clamp } from '../math.js';

export const LAYER_MAX = 12;
export const LAYER_BLENDS = ['add', 'max', 'min', 'multiply', 'replace'];

const HLO = -1.4;
const HHI = 1.4;
const EPS = 1.5e-4;

function clampH(v) {
  return v < HLO ? HLO : v > HHI ? HHI : v;
}

function freshValue(n) {
  return new Float32Array(n);
}

export function activeLayer(W) {
  const s = W.layerStack;
  if (!s) return null;
  return s.layers.find((L) => L.id === s.activeId) || s.layers[s.layers.length - 1] || null;
}

export function layerById(W, id) {
  return W.layerStack?.layers.find((L) => L.id === id) || null;
}

function landName(W, opts = {}) {
  const id = opts.name || W._landscape;
  if (id && id !== 'auto') return String(id);
  return 'Land';
}

export function initLayerStack(W, opts = {}) {
  const n = W.h.length;
  const s = {
    base: new Float32Array(W.h),
    baseVisible: true,
    layers: [],
    activeId: 0,
    nextId: 1,
    paintMask: false,
    _below: null,
    _belowOk: false,
  };
  W.layerStack = s;
  const paint = addPaintLayer(W, 'Stroke 1');
  s.activeId = paint.id;
  if (opts.empty) {
    /* tests may want a bare stack */
  }
  return s;
}

/** After generate/reroll: the current `W.h` is the new base. Keep paints. */
export function captureBase(W, opts = {}) {
  if (!W.h) return null;
  if (!W.layerStack) return initLayerStack(W, opts);
  const s = W.layerStack;
  s.base.set(W.h);
  s._belowOk = false;
  if (opts.keepPaints === false) {
    s.layers = [];
    s.nextId = 1;
    const paint = addPaintLayer(W, 'Stroke 1');
    s.activeId = paint.id;
  }
  compositeLayers(W);
  return s;
}

export function addPaintLayer(W, name = 'Stroke') {
  const s = W.layerStack || initLayerStack(W);
  if (s.layers.length >= LAYER_MAX) return s.layers[s.layers.length - 1];
  const n = W.h.length;
  const id = s.nextId++;
  const L = {
    id,
    name: uniqueName(s, name),
    kind: 'paint',
    visible: true,
    opacity: 1,
    blend: 'add',
    value: freshValue(n),
    mask: null,
  };
  s.layers.push(L);
  s.activeId = id;
  s._belowOk = false;
  return L;
}

function uniqueName(s, name) {
  const have = new Set(s.layers.map((L) => L.name));
  if (!have.has(name)) return name;
  let i = 2;
  while (have.has(`${name} ${i}`)) i++;
  return `${name} ${i}`;
}

export function duplicateLayer(W, id) {
  const s = W.layerStack;
  const src = layerById(W, id ?? s?.activeId);
  if (!s || !src || s.layers.length >= LAYER_MAX) return null;
  const L = {
    id: s.nextId++,
    name: uniqueName(s, src.name),
    kind: 'paint',
    visible: src.visible,
    opacity: src.opacity,
    blend: src.blend,
    value: new Float32Array(src.value),
    mask: src.mask ? new Float32Array(src.mask) : null,
  };
  const ix = s.layers.indexOf(src);
  s.layers.splice(ix + 1, 0, L);
  s.activeId = L.id;
  s._belowOk = false;
  s._hasPaint = true;
  compositeLayers(W);
  return L;
}

export function removeLayer(W, id) {
  const s = W.layerStack;
  if (!s) return false;
  const ix = s.layers.findIndex((L) => L.id === id);
  if (ix < 0 || s.layers.length <= 1) return false;
  s.layers.splice(ix, 1);
  if (s.activeId === id) s.activeId = s.layers[Math.max(0, ix - 1)].id;
  s._belowOk = false;
  compositeLayers(W);
  return true;
}

export function moveLayer(W, id, dir) {
  const s = W.layerStack;
  if (!s) return false;
  const ix = s.layers.findIndex((L) => L.id === id);
  const j = ix + (dir < 0 ? -1 : 1);
  if (ix < 0 || j < 0 || j >= s.layers.length) return false;
  const tmp = s.layers[ix];
  s.layers[ix] = s.layers[j];
  s.layers[j] = tmp;
  s._belowOk = false;
  compositeLayers(W);
  return true;
}

export function setActiveLayer(W, id) {
  const s = W.layerStack;
  if (!s || !layerById(W, id)) return false;
  s.activeId = id;
  s._belowOk = false;
  return true;
}

export function setLayerVisible(W, id, on) {
  if (id === 'base') {
    if (W.layerStack) W.layerStack.baseVisible = !!on;
    compositeLayers(W);
    return true;
  }
  const L = layerById(W, id);
  if (!L) return false;
  L.visible = !!on;
  W.layerStack._belowOk = false;
  compositeLayers(W);
  return true;
}

export function setLayerOpacity(W, id, op) {
  const L = layerById(W, id);
  if (!L) return false;
  L.opacity = clamp(op, 0, 1);
  W.layerStack._belowOk = false;
  compositeLayers(W);
  return true;
}

export function setLayerBlend(W, id, blend) {
  const L = layerById(W, id);
  if (!L) return false;
  L.blend = LAYER_BLENDS.includes(blend) ? blend : 'add';
  W.layerStack._belowOk = false;
  compositeLayers(W);
  return true;
}

export function setLayerName(W, id, name) {
  const L = layerById(W, id);
  if (!L) return false;
  L.name = String(name || L.name).slice(0, 40);
  return true;
}

export function setPaintMaskMode(W, on) {
  if (!W.layerStack) return false;
  W.layerStack.paintMask = !!on;
  return true;
}

/** White = show. Creating a mask starts fully visible so the layer does not vanish. */
export function ensureLayerMask(L, n, fill = 1) {
  if (L.mask && L.mask.length === n) return L.mask;
  L.mask = new Float32Array(n);
  if (fill) L.mask.fill(fill);
  return L.mask;
}

export function clipLayerToLand(W, id) {
  const L = layerById(W, id ?? W.layerStack?.activeId);
  if (!L) return false;
  const n = W.h.length;
  const sea = W.seaLevel ?? 0;
  const m = ensureLayerMask(L, n, 0);
  for (let c = 0; c < n; c++) m[c] = W.h[c] >= sea ? 1 : 0;
  W.layerStack._belowOk = false;
  compositeLayers(W);
  return true;
}

export function clearLayerMask(W, id) {
  const L = layerById(W, id ?? W.layerStack?.activeId);
  if (!L) return false;
  L.mask = null;
  W.layerStack._belowOk = false;
  compositeLayers(W);
  return true;
}

function maskAt(L, c) {
  return L.mask ? L.mask[c] : 1;
}

function blendSample(below, x, k, blend) {
  if (k <= 1e-6) return below;
  switch (blend) {
    case 'max': return below + Math.max(0, x) * k;
    case 'min': return below + Math.min(0, x) * k;
    case 'multiply': return below * (1 + x * k);
    case 'replace': return below * (1 - k) + x * k;
    default: return below + x * k;
  }
}

function applyLayerOnto(out, L, n) {
  if (!L.visible || L.opacity <= 0) return;
  const op = L.opacity;
  const blend = L.blend || 'add';
  const v = L.value;
  const m = L.mask;
  for (let c = 0; c < n; c++) {
    const k = op * (m ? m[c] : 1);
    if (k <= 1e-6) continue;
    out[c] = clampH(blendSample(out[c], v[c], k, blend));
  }
}

export function compositeLayers(W) {
  const s = W.layerStack;
  if (!s || !W.h) return;
  const n = W.h.length;
  if (s.base.length !== n) {
    initLayerStack(W);
    return;
  }
  if (s.baseVisible === false) {
    const sea = W.seaLevel ?? 0;
    W.h.fill(sea);
  } else {
    W.h.set(s.base);
  }
  for (const L of s.layers) applyLayerOnto(W.h, L, n);
  s._belowOk = false;
}

function ensureBelow(W) {
  const s = W.layerStack;
  const n = W.h.length;
  if (!s._below || s._below.length !== n) s._below = new Float32Array(n);
  if (s._belowOk) return s._below;
  if (s.baseVisible === false) s._below.fill(W.seaLevel ?? 0);
  else s._below.set(s.base);
  for (const L of s.layers) {
    if (L.id === s.activeId) break;
    applyLayerOnto(s._below, L, n);
  }
  s._belowOk = true;
  return s._below;
}

function ensureActivePaint(W) {
  if (!W.layerStack) initLayerStack(W);
  let L = activeLayer(W);
  if (!L) L = addPaintLayer(W, 'Stroke 1');
  return L;
}

/** Player height write — goes on the active paint layer, then into `W.h`. */
export function addHeight(W, c, dh) {
  if (!dh) return;
  const s = W.layerStack || initLayerStack(W);
  if (!s._hasPaint) s.base.set(W.h);
  const L = ensureActivePaint(W);
  if (!L.visible) return;
  const k = L.opacity * maskAt(L, c);
  const blend = L.blend || 'add';
  if (blend === 'replace') {
    const below = ensureBelow(W);
    if (k <= 1e-6) {
      ensureLayerMask(L, W.h.length, 0);
      L.mask[c] = 1;
    }
    const target = clampH(W.h[c] + dh);
    const mk = L.opacity * maskAt(L, c);
    L.value[c] = mk > 1e-6 ? (target - below[c] * (1 - mk)) / mk : target;
    W.h[c] = target;
    s._hasPaint = true;
    return;
  }
  if (k <= 1e-6) return;
  L.value[c] += dh;
  s._hasPaint = true;
  if (blend === 'add') {
    W.h[c] = clampH(W.h[c] + dh * k);
    return;
  }
  const below = ensureBelow(W);
  W.h[c] = clampH(blendSample(below[c], L.value[c], k, blend));
}

export function setHeight(W, c, v) {
  addHeight(W, c, v - W.h[c]);
}

/** Sim / disaster write — folds into the generated base, not a paint layer. */
export function addBaseHeight(W, c, dh) {
  if (!dh) return;
  if (W.layerStack) {
    W.layerStack.base[c] = clampH(W.layerStack.base[c] + dh);
    W.layerStack._belowOk = false;
  }
  W.h[c] = clampH(W.h[c] + dh);
}

export function addMask(W, c, dv) {
  const s = W.layerStack || initLayerStack(W);
  if (!s._hasPaint) s.base.set(W.h);
  const L = ensureActivePaint(W);
  const m = ensureLayerMask(L, W.h.length, 1);
  const next = clamp(m[c] + dv, 0, 1);
  if (next === m[c]) return;
  m[c] = next;
  s._hasPaint = true;
  s._belowOk = false;
  const below = ensureBelow(W);
  const k = L.visible ? L.opacity * next : 0;
  W.h[c] = clampH(blendSample(below[c], L.value[c], k, L.blend || 'add'));
}

function canAbsorb(s) {
  return s.layers.every((L) => !L.visible || L.blend === 'add' || L.blend === 'max' || L.blend === 'min');
}

/** Fold sim-written `W.h` back into base so paints stay offsets. */
export function absorbSimDelta(W) {
  const s = W.layerStack;
  if (!s || !W.h || s.base.length !== W.h.length) return;
  if (!s._hasPaint) {
    s.base.set(W.h);
    return;
  }
  if (!canAbsorb(s)) return;
  const n = W.h.length;
  if (!s._paint || s._paint.length !== n) s._paint = new Float32Array(n);
  const paint = s._paint;
  paint.fill(0);
  for (const L of s.layers) {
    if (!L.visible || L.opacity <= 0) continue;
    const blend = L.blend || 'add';
    if (blend === 'multiply' || blend === 'replace') return;
    const op = L.opacity;
    const v = L.value;
    const m = L.mask;
    for (let c = 0; c < n; c++) {
      const k = op * (m ? m[c] : 1);
      const x = v[c];
      if (k <= 1e-6 || !x) continue;
      if (blend === 'max') paint[c] += Math.max(0, x) * k;
      else if (blend === 'min') paint[c] += Math.min(0, x) * k;
      else paint[c] += x * k;
    }
  }
  const base = s.base;
  const h = W.h;
  for (let c = 0; c < n; c++) base[c] = h[c] - paint[c];
  s._belowOk = false;
}

/** Bake the composite into Land. Deliberate — not a side effect of play. */
export function flattenLayers(W) {
  if (!W.layerStack) return false;
  compositeLayers(W);
  initLayerStack(W, { name: landName(W) });
  return true;
}

export function snapshotActiveLayer(W) {
  const s = W.layerStack;
  if (!s) return null;
  const L = activeLayer(W);
  return {
    activeId: s.activeId,
    base: new Float32Array(s.base),
    baseVisible: s.baseVisible,
    layerId: L?.id ?? 0,
    value: L ? new Float32Array(L.value) : null,
    mask: L?.mask ? new Float32Array(L.mask) : null,
    opacity: L?.opacity ?? 1,
    visible: L ? L.visible : true,
    blend: L?.blend || 'add',
  };
}

export function restoreLayerSnapshot(W, snap) {
  const s = W.layerStack;
  if (!s || !snap) return false;
  if (snap.base && snap.base.length === s.base.length) s.base.set(snap.base);
  s.baseVisible = snap.baseVisible !== false;
  s.activeId = snap.activeId;
  const L = layerById(W, snap.layerId) || activeLayer(W);
  if (L && snap.value && snap.value.length === L.value.length) {
    L.value.set(snap.value);
    if (snap.mask) {
      L.mask = new Float32Array(snap.mask);
    } else {
      L.mask = null;
    }
    if (snap.opacity != null) L.opacity = snap.opacity;
    if (snap.visible != null) L.visible = snap.visible;
    if (snap.blend) L.blend = snap.blend;
  }
  s._belowOk = false;
  s._hasPaint = true;
  compositeLayers(W);
  return true;
}

function packI16(arr) {
  const buf = new Int16Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const v = Math.round(arr[i] * 8000);
    buf[i] = v < -32767 ? -32767 : v > 32767 ? 32767 : v;
  }
  return btoaFromU8(new Uint8Array(buf.buffer));
}

function unpackI16(b64, into) {
  const buf = i16FromB64(b64);
  const n = Math.min(into.length, buf.length);
  for (let i = 0; i < n; i++) into[i] = buf[i] / 8000;
  return n;
}

function btoaFromU8(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  }
  return btoa(s);
}

function u8FromB64(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function i16FromB64(b64) {
  const u8 = u8FromB64(b64);
  return new Int16Array(u8.buffer, u8.byteOffset, (u8.byteLength / 2) | 0);
}

function packU32(arr) {
  return btoaFromU8(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
}

function unpackU32(b64) {
  const u8 = u8FromB64(b64);
  return new Uint32Array(u8.buffer, u8.byteOffset, (u8.byteLength / 4) | 0);
}

function packField(arr) {
  const n = arr.length;
  let filled = 0;
  for (let i = 0; i < n; i++) if (Math.abs(arr[i]) > EPS) filled++;
  if (filled > n * 0.35) return { d: packI16(arr), n };
  const idx = new Uint32Array(filled);
  const val = new Float32Array(filled);
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(arr[i]) > EPS) {
      idx[k] = i;
      val[k] = arr[i];
      k++;
    }
  }
  return { n, i: packU32(idx), v: packI16(val) };
}

function unpackField(pack, into) {
  into.fill(0);
  if (!pack) return;
  if (pack.d) {
    unpackI16(pack.d, into);
    return;
  }
  if (!pack.i || !pack.v) return;
  const idx = unpackU32(pack.i);
  const tmp = new Float32Array(idx.length);
  unpackI16(pack.v, tmp);
  const n = into.length;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    if (i < n) into[i] = tmp[k];
  }
}

export function packLayerStack(stack) {
  if (!stack) return null;
  return {
    v: 1,
    base: packField(stack.base),
    baseVisible: stack.baseVisible !== false,
    activeId: stack.activeId,
    nextId: stack.nextId,
    layers: stack.layers.map((L) => ({
      id: L.id,
      name: L.name,
      vis: !!L.visible,
      op: L.opacity,
      blend: L.blend || 'add',
      v: packField(L.value),
      mask: L.mask ? packField(L.mask) : null,
    })),
  };
}

export function unpackLayerStack(W, data) {
  if (!data || !W.h) return false;
  const n = W.h.length;
  const s = {
    base: new Float32Array(n),
    baseVisible: data.baseVisible !== false,
    layers: [],
    activeId: data.activeId || 1,
    nextId: data.nextId || 1,
    paintMask: false,
    _below: null,
    _belowOk: false,
  };
  unpackField(data.base, s.base);
  for (const rec of data.layers || []) {
    const L = {
      id: rec.id,
      name: rec.name || 'Stroke',
      kind: 'paint',
      visible: rec.vis !== false,
      opacity: rec.op ?? 1,
      blend: LAYER_BLENDS.includes(rec.blend) ? rec.blend : 'add',
      value: freshValue(n),
      mask: null,
    };
    unpackField(rec.v, L.value);
    if (rec.mask) {
      L.mask = freshValue(n);
      unpackField(rec.mask, L.mask);
    }
    s.layers.push(L);
    if (L.id >= s.nextId) s.nextId = L.id + 1;
  }
  if (!s.layers.length) {
    W.layerStack = s;
    addPaintLayer(W, 'Stroke 1');
  } else {
    W.layerStack = s;
    if (!layerById(W, s.activeId)) s.activeId = s.layers[s.layers.length - 1].id;
  }
  s._hasPaint = true;
  compositeLayers(W);
  return true;
}

export function layerPanelState(W) {
  const s = W.layerStack;
  if (!s) return null;
  return {
    baseVisible: s.baseVisible !== false,
    baseName: landName(W),
    paintMask: !!s.paintMask,
    activeId: s.activeId,
    atCap: s.layers.length >= LAYER_MAX,
    layers: s.layers.map((L) => ({
      id: L.id,
      name: L.name,
      visible: L.visible,
      opacity: L.opacity,
      blend: L.blend || 'add',
      hasMask: !!L.mask,
      active: L.id === s.activeId,
    })),
  };
}
