/** Evaluate authored PAINT data. A ramp with conditions, not a lambda per world.
 *
 *  Tables are compiled from vr/data/worlds/paint.json. Envelope banding is the
 *  one shared function that is physics, not a per-body look. */

import { clamp, lerp } from '../math.js';
import { PAINT, PAINT_BY_ID, SQUARES, KIND_SURFACE } from './paintTable.js';

export { PAINT, PAINT_BY_ID, SQUARES, KIND_SURFACE };

function lerp3(a, b, k) {
  return [
    lerp(a[0], b[0], k),
    lerp(a[1], b[1], k),
    lerp(a[2], b[2], k),
  ];
}

function mix3(a, b, k) {
  return lerp3(a, b, clamp(k, 0, 1));
}

/** Shared giant-atmosphere dynamics — not a per-body paint. */
export function applyEnvelopeDynamics(r, g, b, extra, opts = {}) {
  const y = extra?.y ?? 0;
  let band;
  if (extra?.pSeen != null) {
    band = clamp(Math.log(Math.max(0.35, extra.pSeen) / 0.55) / Math.log(7), 0, 1);
  } else {
    band = 0.5 + 0.5 * Math.sin(y * (opts.nBands || 16));
  }
  r = lerp(r, opts.deepR ?? r * 0.7, band * 0.58);
  g = lerp(g, opts.deepG ?? g * 0.66, band * 0.58);
  b = lerp(b, opts.deepB ?? b * 0.6, band * 0.58);
  const ch = extra?.chroma || 0;
  if (ch > 0.04 && !opts.noChroma) {
    r = lerp(r, 186, ch * 0.52);
    g = lerp(g, 96, ch * 0.48);
    b = lerp(b, 42, ch * 0.38);
  }
  const sp = extra?.spot || 0;
  if (sp > 0.08 && opts.spotRgb) {
    const k = clamp(sp, 0, 1);
    r = lerp(r, opts.spotRgb[0], k);
    g = lerp(g, opts.spotRgb[1], k);
    b = lerp(b, opts.spotRgb[2], k);
  } else if (opts.fallbackSpot && opts.spotRgb) {
    const x = extra?.x ?? 0, z = extra?.z ?? 0;
    const pos = opts.fallbackSpot;
    const spot = Math.hypot(x - pos[0], y - pos[1], z - pos[2]);
    const rad = opts.spotRad || 0.16;
    if (spot < rad) {
      const k = 1 - spot / rad;
      r = lerp(r, opts.spotRgb[0], k);
      g = lerp(g, opts.spotRgb[1], k);
      b = lerp(b, opts.spotRgb[2], k);
    }
  }
  if (extra?.locked) {
    const ang = Math.atan2(extra.z ?? 0, extra.x ?? 1);
    const sunAng = Math.atan2(extra.sunZ ?? 0, extra.sunX ?? 1) + (extra.hotLon || 0.25);
    const d = Math.cos(ang - sunAng);
    const k = clamp(d, 0, 1);
    r = lerp(r, 255, k * 0.42);
    g = lerp(g, 168, k * 0.26);
    b = lerp(b, 72, k * 0.1);
    if (d < 0) {
      const n = clamp(-d, 0, 1);
      r *= 1 - n * 0.55;
      g *= 1 - n * 0.55;
      b *= 1 - n * 0.38;
    }
  }
  return [r, g, b];
}

function predOk(when, ctx) {
  if (!when) return true;
  for (const [field, cond] of Object.entries(when)) {
    if (field === 'hypot') {
      const d = Math.hypot(
        (ctx.x ?? 0) - cond.c[0],
        (ctx.y ?? 0) - cond.c[1],
        (ctx.z ?? 0) - cond.c[2],
      );
      if (!(d < cond.r)) return false;
      continue;
    }
    if (field === 'sinY') {
      const s = Math.sin((ctx.y ?? 0) * cond.n);
      if (cond.gt != null && !(s > cond.gt)) return false;
      if (cond.lt != null && !(s < cond.lt)) return false;
      continue;
    }
    if (field === 'and') {
      if (!cond.every((w) => predOk(w, ctx))) return false;
      continue;
    }
    let v = ctx[field];
    if (field === 'absY') v = Math.abs(ctx.y ?? 0);
    if (field === 'absE') v = Math.abs((ctx.e ?? 0) - (cond.center ?? 0));
    if (typeof cond === 'number') {
      if (v !== cond) return false;
      continue;
    }
    if (cond.gt != null && !(v > cond.gt)) return false;
    if (cond.lt != null && !(v < cond.lt)) return false;
    if (cond.gte != null && !(v >= cond.gte)) return false;
    if (cond.lte != null && !(v <= cond.lte)) return false;
  }
  return true;
}

function applyStep(rgb, step, t, m, e, ice, extra) {
  const y = extra?.y ?? 0;
  const x = extra?.x ?? 0;
  const z = extra?.z ?? 0;
  switch (step.type) {
    case 'elev': {
      const k = clamp((e - (step.gt ?? 0)) * (step.scale ?? 1), 0, 1);
      return lerp3(step.a || rgb, step.b, k);
    }
    case 'elevDown': {
      const k = clamp(((step.lt ?? 0) - e) * (step.scale ?? 1), 0, 1);
      return lerp3(step.a || rgb, step.b, k);
    }
    case 'mix': {
      let k = 0;
      if (step.src === 'm') k = clamp(m * (step.scale ?? 1), 0, 1);
      else if (step.src === 'tCold') k = clamp(((step.lt ?? 0.28) - t) * (step.scale ?? 1), 0, 1) * (step.amt ?? 1);
      else if (step.src === 'e') k = clamp(e * (step.scale ?? 1), 0, 1);
      else if (step.src === 'ice') k = Math.max(ice, step.floor ?? 0);
      else k = step.k ?? 0;
      return mix3(rgb, step.rgb, k);
    }
    case 'grey': {
      const k = clamp(e, 0, 1);
      const g = lerp(step.lo, step.hi, k);
      return [g * (step.wr ?? 1), g * (step.wg ?? 1), g * (step.wb ?? 1)];
    }
    case 'absE': {
      const k = clamp(Math.abs(e - (step.c ?? 0.5)) * (step.scale ?? 1), 0, 1);
      return lerp3(step.a || rgb, step.b, k);
    }
    case 'sinE': {
      const k = Math.abs(Math.sin(e * (step.freq ?? 31))) * (step.amp ?? 0.35);
      return lerp3(step.a, step.b, k);
    }
    case 'ifE': {
      if (e < (step.lt ?? 0)) return step.rgb.slice();
      return rgb;
    }
    case 'ifY': {
      if (y > (step.gt ?? 0)) return step.rgb.slice();
      return rgb;
    }
    case 'pole': {
      const k = y * y * (step.amt ?? 1);
      return mix3(rgb, step.rgb, k);
    }
    case 'poleChan': {
      const yy = y * y;
      return [
        lerp(rgb[0], step.rgb[0], yy * (step.r ?? 0.28)),
        lerp(rgb[1], step.rgb[1], yy * (step.g ?? 0.32)),
        lerp(rgb[2], step.rgb[2], yy * (step.b ?? 0.38)),
      ];
    }
    case 'iapetus': {
      const base = x > (step.x ?? 0.04) ? step.dark : step.bright;
      if (Math.abs(y) < (step.eq ?? 0.08)) return mix3(base, step.ridge, step.ridgeMix ?? 0.4);
      return base.slice();
    }
    case 'hexagon': {
      if (y <= (step.gt ?? 0.82)) return rgb;
      const ang = Math.atan2(z, x);
      const hex = Math.abs(Math.cos(ang * 3));
      const k = clamp((y - (step.gt ?? 0.82)) / (step.span ?? 0.18), 0, 1) * (0.35 + hex * 0.65);
      return mix3(rgb, step.rgb, k);
    }
    case 'cliff': {
      if (e < (step.lt ?? 0.02)) return step.rgb.slice();
      return rgb;
    }
    case 'pit': {
      const pit = e < (step.below ?? 0) ? 1 : clamp((step.from ?? 0.12) - e, 0, 1);
      const g = lerp(step.lo, step.hi, pit);
      return [g * (step.wr ?? 1), g * (step.wg ?? 1), g * (step.wb ?? 1)];
    }
    case 'const':
      return step.rgb.slice();
    default:
      return rgb;
  }
}

export function evalLand(spec, t = 0.5, m = 0.2, l = 0, e = 0.55, ice = 0, extra = {}) {
  if (!spec) return [80, 80, 80];
  if (spec.const) return spec.const.slice();
  if ((extra?.lava || 0) > (spec.lavaMin ?? 1) && spec.lava) return spec.lava.slice();
  if (ice > (spec.iceMin ?? 1) && spec.ice) return spec.ice.slice();
  let rgb = (spec.base || [128, 128, 128]).slice();
  for (const step of spec.steps || []) rgb = applyStep(rgb, step, t, m, e, ice, extra);
  if (spec.envelope) {
    const out = applyEnvelopeDynamics(rgb[0], rgb[1], rgb[2], extra, spec.envelope);
    rgb = out;
  }
  return rgb;
}

export function evalOcean(spec, d = 0) {
  if (!spec) return [16, 32, 48];
  if (spec.oceanSame) return evalLand(spec, 0.5, 0, 0, 0, 0, {});
  if (spec.oceanMagma) return [70 + 40 * d, 18, 8];
  if (Array.isArray(spec.ocean)) return spec.ocean.slice();
  return [16, 32, 48];
}

export function landFn(spec) {
  return (t, m, l, e, ice, extra) => evalLand(spec, t, m, l, e, ice, extra);
}

export function oceanFn(spec) {
  if (spec?.oceanSame) {
    return (d, extra) => evalLand(spec, 0.5, 0, 0, 0, 0, extra && typeof extra === 'object' ? extra : {});
  }
  if (spec?.oceanMagma) return (d) => evalOcean(spec, d);
  const rgb = Array.isArray(spec?.ocean) ? spec.ocean.slice() : [16, 32, 48];
  return () => rgb.slice();
}

export function evalKey(spec, ctx) {
  if (!spec?.keys) return null;
  for (const row of spec.keys) {
    if (predOk(row.when, ctx)) return row.key;
  }
  return null;
}

export function paintOf(kind) {
  return PAINT_BY_ID[kind] || null;
}

export function samplePaint(kind, e = 0.55, ice = 0, extra = {}) {
  const spec = paintOf(kind);
  if (!spec) return null;
  return evalLand(spec, 0.5, 0.2, 0, e, ice, extra);
}
