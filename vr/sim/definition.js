/** World definition runtime: the join, the look, the names.
 *
 *  Tables are compiled from vr/data/worlds/definitions.json + features.json.
 *  Axes select a definition; they are not the definition. Overrides are
 *  counted because the count is how well the rules work. */

import { DIR } from '../sphere.js';
import { isGasKind, kindOf } from './planetKind.js';
import { worldAxes } from './worldAxes.js';
import { applyPlanetLook, surfaceKeyAt } from './planetLook.js';
import {
  WORLDDEF_VERSION, WORLDDEF_HASH, WORLD_DEFS, DEF_BY_ID, WORLD_OVERRIDES, OVERRIDE_BY_BODY,
  FEATURES_BY_BODY, OVERRIDE_COUNT, UNITS,
} from './worldDef.js';

export {
  WORLDDEF_VERSION, WORLDDEF_HASH, WORLD_DEFS, DEF_BY_ID, WORLD_OVERRIDES, OVERRIDE_BY_BODY,
  FEATURES_BY_BODY, OVERRIDE_COUNT, UNITS,
};

function finite(x) { return typeof x === 'number' && Number.isFinite(x); }

function ctxOf(W) {
  const rule = W?.rule || W || {};
  const ax = W?._worldAxes || {};
  const axes = ax.interior ? ax : worldAxes(rule);
  const { kind } = kindOf(W, rule);
  return {
    interior: axes.interior?.v || rule.interior?.lidMode || 'stagnant',
    volatile: axes.volatile?.v || (rule.methaneSolvent ? 'CH4' : 'H2O'),
    airless: !!rule.airless,
    iceShell: !!rule.iceShell,
    earthLike: !!rule.earthLike,
    daisy: !!rule.daisyworld,
    fluid: axes.interior?.v === 'fluid' || isGasKind(kind),
    magma: axes.interior?.v === 'magma' || kind === 'magma',
    gravity: axes.gravity?.v ?? rule.gravity ?? 1,
    teqK: finite(rule.tSurfK) ? rule.tSurfK
      : finite(rule.teqK) ? rule.teqK
      : finite(rule.solar) ? 278 * Math.pow(Math.max(0.001, rule.solar), 0.25)
      : 255,
    kind,
    rule,
  };
}

function needsOk(n, ctx) {
  if (!n) return true;
  if (n.earthLike && !ctx.earthLike) return false;
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
  if (finite(n.maxTeq) && !(ctx.teqK <= n.maxTeq)) return false;
  return true;
}

export function bodyNameOf(W) {
  const rule = W?.rule || W || {};
  return rule._catalogueItem?.b || rule.name || '';
}

export function overrideOf(W) {
  const name = bodyNameOf(W);
  return name ? OVERRIDE_BY_BODY[name] || null : null;
}

/** First matching definition. Earth and Daisyworld take the earth row. */
export function definitionOf(W) {
  const ctx = ctxOf(W);
  if (ctx.earthLike || ctx.daisy) return DEF_BY_ID.earth || null;
  for (const d of WORLD_DEFS) {
    if (d.id === 'earth') continue;
    if (needsOk(d.needs, ctx)) return d;
  }
  return DEF_BY_ID.rocky || null;
}

/** Art direction for this world: definition look, then override, then solar. */
export function lookOf(W) {
  const def = definitionOf(W);
  const look = { ...(def?.look || {}) };
  const ovr = overrideOf(W);
  if (ovr?.look) Object.assign(look, ovr.look);
  const solar = W?.solar ?? W?.rule?.solar ?? 1;
  const ev = Math.log2(Math.max(1e-4, solar));
  look.exposure = Math.max(0.36, Math.min(1.75, 0.92 - ev * 0.11 + (look.exposureBias || 0)));
  return look;
}

/** Stamp art direction onto a ruleset. Rebinds land/ocean from definition paint. */
export function applyWorldLook(rule) {
  if (!rule || rule.earthLike) return rule;
  const def = definitionOf({ rule });
  if (def?.paint) rule._paintId = def.paint;
  applyPlanetLook(rule);
  const look = lookOf({ rule });
  rule.look = look;
  if (look.skyRgb) rule.sky = look.skyRgb.map((c) => c / 255);
  rule.whiteBalance = look.whiteBalance || 'sun-camera';
  return rule;
}

/** Compact query for a world definition — shareable without a per-body file. */
export function shareDefOf(W) {
  const def = definitionOf(W);
  const q = new URLSearchParams();
  if (def?.id) q.set('def', def.id);
  if (def?.paint) q.set('paint', def.paint);
  if (def?.column) q.set('column', def.column);
  return q.toString();
}

export function featureListOf(W) {
  const name = bodyNameOf(W);
  return (name && FEATURES_BY_BODY[name]) || [];
}

export function featureAt(W, c) {
  const list = featureListOf(W);
  if (!list.length || c == null || c < 0) return null;
  const key = surfaceKeyAt(W, c);
  if (key) {
    const hit = list.find((f) => f.key === key);
    if (hit) return hit;
  }
  const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
  let best = null, bestDot = -1;
  for (const f of list) {
    if (!finite(f.lat) || !finite(f.lon)) continue;
    const la = f.lat * Math.PI / 180;
    const lo = f.lon * Math.PI / 180;
    const cy = Math.cos(la);
    const fx = cy * Math.cos(lo);
    const fy = Math.sin(la);
    const fz = cy * Math.sin(lo);
    const d = x * fx + y * fy + z * fz;
    const min = Math.cos((f.rDeg || 8) * Math.PI / 180);
    if (d > min && d > bestDot) { bestDot = d; best = f; }
  }
  return best;
}

export function formatFeatures(W) {
  const list = featureListOf(W);
  if (!list.length) return '';
  return list.map((f) => f.name).slice(0, 4).join(' · ');
}

/** Coverage of one ruleset: which join fields exist. */
export function coverageOfDef(W) {
  const def = definitionOf(W);
  const ovr = overrideOf(W);
  return {
    id: def?.id || null,
    confidence: def?.confidence || 'invented',
    column: def?.column || null,
    bedrock: def?.bedrock || null,
    cover: def?.cover || null,
    look: !!(def?.look && Object.keys(def.look).length),
    paint: def?.paint || null,
    features: featureListOf(W).length,
    override: ovr ? ovr.body : null,
  };
}
