/** Apply authored ice-shell ops from iceshell.json onto lid / ocean / mantle / vent / h.
 *
 *  Ops are fill / add / set / clamp / noise / moist / age. Masks are landform
 *  pieces (bowl, cycloid, ridged pit, south cap, cell stripe). Kind selection
 *  still comes from planetKind; this file never names a body. */

import { clamp, fbm, ridged } from '../math.js';
import { NC, DIR } from '../sphere.js';
import { SHELL_BY_ID } from './shellTable.js';

function norm3(v) {
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
}

function seedXor(seed, v) {
  if (v == null) return seed >>> 0;
  if (typeof v === 'string') {
    let x = 0;
    for (let i = 0; i < v.length; i++) x = ((x << 8) | (v.charCodeAt(i) & 0xff)) >>> 0;
    return (seed ^ x) >>> 0;
  }
  return (seed ^ (v >>> 0)) >>> 0;
}

function maskAt(c, seed, m) {
  if (m == null || m === true) return 1;
  const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
  if (m.and) {
    let v = 1;
    for (const s of m.and) v *= maskAt(c, seed, s);
    return v;
  }
  if (m.not) return maskAt(c, seed, m.not) > 0 ? 0 : 1;
  if (m.pole2) return y * y;
  if (m.oneMinusPole2) return 1 - y * y;
  if (m.yLt != null) return y < m.yLt ? 1 : 0;
  if (m.yGt != null) return y > m.yGt ? 1 : 0;
  if (m.absYLt != null) return Math.abs(y) < m.absYLt ? 1 : 0;
  if (m.excess) {
    const v = maskAt(c, seed, m.excess.of);
    const thr = m.excess.thr ?? 0;
    if (v <= thr) return 0;
    return (v - thr) * (m.excess.scale ?? 1);
  }
  if (m.gt) return maskAt(c, seed, m.gt.of) > (m.gt.thr ?? 0) ? 1 : 0;
  if (m.lt) return maskAt(c, seed, m.lt.of) < (m.lt.thr ?? 0) ? 1 : 0;
  if (m.cycloid) {
    const o = m.cycloid;
    const v = Math.sin(x * o.a + z * o.b + Math.sin(y * o.c) * o.warp);
    return v > o.thr ? v - o.thr : 0;
  }
  if (m.chaos) {
    const o = m.chaos;
    return Math.max(0, Math.sin(x * o.a + z * o.b) * (1 - y * y) - o.thr) * o.amp;
  }
  if (m.bowl) {
    const o = m.bowl;
    const p = norm3(o.at);
    const d = x * p[0] + y * p[1] + z * p[2];
    return d > o.thr ? (d - o.thr) / o.span : 0;
  }
  if (m.dot) {
    const p = norm3(m.dot.at);
    return x * p[0] + y * p[1] + z * p[2];
  }
  if (m.cells) return Math.sin(x * m.cells.a) * Math.sin(z * m.cells.b);
  if (m.halfspace) {
    const o = m.halfspace;
    return Math.max(0, x * o.x + z * o.z + o.off);
  }
  if (m.sin) {
    const s = Math.sin(x * m.sin.a + z * m.sin.b);
    if (m.sin.absYLt != null && Math.abs(y) >= m.sin.absYLt) return 0;
    return s;
  }
  if (m.sinAbs) return Math.abs(Math.sin(x * m.sinAbs.a + z * m.sinAbs.b));
  if (m.sinGt) {
    return Math.abs(Math.sin(x * m.sinGt.a + z * m.sinGt.b)) > m.sinGt.thr ? 1 : 0;
  }
  if (m.eqBand) {
    const o = m.eqBand;
    return Math.abs(y) < o.lat && Math.abs(Math.sin(x * o.a + z * o.a)) > o.thr ? 1 : 0;
  }
  if (m.ridged) {
    const o = m.ridged;
    const s = seedXor(seed, o.seedXor);
    const v = ridged(x * o.scale, y * o.scale, z * o.scale, s, o.oct ?? 3);
    if (o.thr != null) return v > o.thr ? v - o.thr : 0;
    if (o.center != null) return v - o.center;
    return v;
  }
  if (m.fbmLt) {
    const o = m.fbmLt;
    const v = fbm(x * o.scale, y * o.scale, z * o.scale, seed, o.oct ?? 3, o.lac ?? 2, o.gain ?? 0.5);
    return v < o.thr ? 1 : 0;
  }
  if (m.planeBand) {
    const p = norm3(m.planeBand.at);
    const w = m.planeBand.width;
    const face = x * p[0] + y * p[1] + z * p[2];
    if (face <= -w || face >= w) return 0;
    return 1 - Math.abs(face) / w;
  }
  if (m.coronae) {
    const o = m.coronae;
    let patch = 0;
    for (const raw of o.at) {
      const p = norm3(raw);
      const d = x * p[0] + y * p[1] + z * p[2];
      if (d > o.dot) patch = Math.max(patch, (d - o.dot) / o.span);
    }
    return patch;
  }
  if (m.cellMod) {
    const o = m.cellMod;
    if (o.yLt != null && y >= o.yLt) return 0;
    const mods = o.mods, hits = o.hits;
    for (let i = 0; i < mods.length; i++) {
      if (c % mods[i] === hits[i]) return 1;
    }
    return 0;
  }
  return 0;
}

function writeFields(W, c, k, tidal, fields, tidalMantle) {
  if (!fields) return;
  if (fields.lid != null) W.shellLid[c] += fields.lid * k;
  if (fields.ocean != null) W.shellOcean[c] += fields.ocean * k;
  if (fields.mantle != null) {
    const m = tidalMantle ? tidal * fields.mantle : fields.mantle;
    W.shellMantle[c] += m * k;
  }
  if (fields.vent != null) W.shellVent[c] += fields.vent * k;
  if (fields.h != null) W.h[c] += fields.h * k;
  if (fields.age != null && W.age) W.age[c] += fields.age * k;
}

function setFields(W, c, tidal, fields, tidalMantle) {
  if (fields.lid != null) W.shellLid[c] = fields.lid;
  if (fields.ocean != null) W.shellOcean[c] = fields.ocean;
  if (fields.mantle != null) W.shellMantle[c] = tidalMantle ? tidal * fields.mantle : fields.mantle;
  if (fields.vent != null) W.shellVent[c] = fields.vent;
  if (fields.h != null) W.h[c] = fields.h;
  if (fields.age != null && W.age) W.age[c] = fields.age;
}

function applyOp(W, tidal, seed, op) {
  const type = op.type;
  const tidalMantle = !!op.tidalMantle;
  if (type === 'fill') {
    for (let c = 0; c < NC; c++) setFields(W, c, tidal, op, tidalMantle);
    return;
  }
  if (type === 'add') {
    for (let c = 0; c < NC; c++) {
      const k = maskAt(c, seed, op.mask);
      if (k) writeFields(W, c, k, tidal, op, tidalMantle);
    }
    return;
  }
  if (type === 'set') {
    for (let c = 0; c < NC; c++) {
      if (maskAt(c, seed, op.mask) > 0) setFields(W, c, tidal, op, tidalMantle);
    }
    return;
  }
  if (type === 'clamp') {
    const lid = op.lid, ocean = op.ocean;
    for (let c = 0; c < NC; c++) {
      if (lid) W.shellLid[c] = clamp(W.shellLid[c], lid[0], lid[1]);
      if (ocean) W.shellOcean[c] = clamp(W.shellOcean[c], ocean[0], ocean[1]);
      W.shellMantle[c] = clamp(W.shellMantle[c], 0, 1);
      W.shellVent[c] = clamp(W.shellVent[c], 0, 1);
    }
    return;
  }
  if (type === 'noise') {
    const sc = op.scale ?? 2;
    const oct = op.octaves ?? 2;
    const lac = op.lac ?? 2;
    const gain = op.gain ?? 0.5;
    const amp = op.amp ?? 0.02;
    for (let c = 0; c < NC; c++) {
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      W.h[c] += (fbm(x * sc, y * sc, z * sc, seed, oct, lac, gain) - 0.5) * amp;
    }
    return;
  }
  if (type === 'moist') {
    if (!W.moist) return;
    for (let c = 0; c < NC; c++) {
      let v = op.base ?? 0;
      for (const b of op.bands || []) {
        if (maskAt(c, seed, b.mask) > 0) v = b.value;
      }
      W.moist[c] = v;
    }
    return;
  }
  if (type === 'age') {
    if (!W.age) return;
    for (let c = 0; c < NC; c++) {
      if (op.mask) W.age[c] = maskAt(c, seed, op.mask) > 0 ? op.on : op.off;
      else W.age[c] = op.value;
    }
    return;
  }
  throw new Error(`unknown shell op "${type}"`);
}

/** Paint shell fields for a kind id. Returns false if no recipe. */
export function applyShellKind(W, kind, tidal, seed) {
  const spec = SHELL_BY_ID[kind] || SHELL_BY_ID.europa;
  if (!spec?.ops?.length) return false;
  for (const op of spec.ops) applyOp(W, tidal, seed, op);
  return true;
}
