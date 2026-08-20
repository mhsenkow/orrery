/** Surface paint per geology kind — colour, not height.
 *
 *  Ramps live in vr/data/worlds/paint.json and are evaluated by paintEval.js.
 *  This file binds them onto a ruleset and names map squares. Earth still
 *  uses landTerra in rulesets.js. */

import { DIR } from '../sphere.js';
import { cachePlanetKind, planetKind } from './planetKind.js';
import {
  landFn, oceanFn, evalKey, paintOf, samplePaint,
  PAINT_BY_ID, SQUARES, KIND_SURFACE,
} from './paintEval.js';

export { samplePaint as sampleLand };

export function applyPlanetLook(rule) {
  if (!rule) return rule;
  const { kind } = cachePlanetKind(rule);
  // Earth, Daisyworld, and temperate generic worlds keep Whittaker land.
  if (kind === 'earth' || kind === 'daisy' || kind === 'generic') return rule;
  const id = PAINT_BY_ID[kind] ? kind : (rule._paintId || kind);
  const spec = paintOf(id);
  if (!spec) return rule;
  rule.land = landFn(spec);
  rule.ocean = spec.oceanSame ? rule.land : oceanFn(spec);
  return rule;
}

function elevOf(W, c) {
  const sea = W.seaLevel || 0;
  return ((W.h?.[c] || 0) - sea) / (1 - sea + 1e-6);
}

/** Map-square key for a non-Whittaker world. Ice shells are not "ice" everywhere. */
export function surfaceKeyAt(W, c) {
  if (c < 0) return null;
  const kind = W._planetKind || W.rule?._planetKind || planetKind(W.rule);
  const spec = paintOf(PAINT_BY_ID[kind] ? kind : (W.rule?._paintId || kind));
  if (!spec) {
    if ((W.ice?.[c] || 0) > 0.5) return 'polarIce';
    return 'regolith';
  }
  const h = W.h?.[c] || 0;
  const ice = W.ice?.[c] || 0;
  const x = DIR[c * 3] || 0;
  const y = DIR[c * 3 + 1] || 0;
  const z = DIR[c * 3 + 2] || 0;
  const ctx = {
    ice, h, e: elevOf(W, c), x, y, z,
    lava: W.lava?.[c] || 0,
    vent: W.shellVent?.[c] || 0,
    sea: h < (W.seaLevel || 0) ? 1 : 0,
    rock: W.rock?.[c] || 0,
  };
  return evalKey(spec, ctx) || 'regolith';
}

export function planetCoverEntries(kind) {
  const ids = KIND_SURFACE[kind] || ['regolith'];
  return ids.map((id) => {
    const e = SQUARES[id] || SQUARES.regolith;
    return { id: e.id, label: e.label, rgb: e.rgb, tip: e.tip, why: e.why };
  });
}
