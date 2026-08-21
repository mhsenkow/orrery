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

/* Height as a rank on this world, 0 (lowest) to 1 (highest).
 *
 * The map-square rules in `paint.json` were written against absolute heights —
 * Io's "patera below 0.04", Mercury's "caloris below −0.05", Mars' "volcano above
 * 0.28" — and each world's terrain sits at its own offset with its own relief.
 * Io's whole surface spans −0.42 to −0.36, so every square on Io read `patera`;
 * Mercury was entirely `caloris`; Titan and Europa, whose relief is a few
 * hundredths, came out uniformly `methaneLake` and `chaos`. A monotone map is
 * wrong, and it also made the tour's "find a sulfur square" hunts complete on
 * the first hover without the player having to look at anything.
 *
 * A rank says what was meant: the lowest fifth of Mercury *is* its basins,
 * whatever absolute number the generator happens to produce, on any world, at
 * any relief. Sampled and cached — terrain moves slowly, so this rebuilds a
 * thousand-entry ladder once every sixty-four ticks. */
const HYPSO_N = 1024;

function hypsoLadder(W) {
  /* Keyed on the world as well as the clock: the ladder is this planet's own
     hypsometry, and `W` is a singleton that gets re-generated in place. */
  const stamp = `${W.seed}:${W.rule?.id || ''}:${(W._tickIndex | 0) >> 6}`;
  if (W._hypsoQ?.length && W._hypsoStamp === stamp) return W._hypsoQ;
  const h = W.h;
  const n = h.length;
  /* A prime stride, because a plain `n / 1024` step aligns with the grid.
     Cell indices run face by face and row by row, so a stride sharing a factor
     with the row length samples the same few columns of every face — a lattice,
     not the distribution. At N=96 that put 42% of Mars above the 92nd percentile,
     which is not a percentile. Walking by a prime and wrapping visits a spread
     of rows and faces for the same thousand samples. */
  const stride = 9973;
  const s = [];
  for (let i = 0, c = 0; i < HYPSO_N && i < n; i++, c = (c + stride) % n) s.push(h[c]);
  s.sort((a, b) => a - b);
  W._hypsoQ = Float64Array.from(s);
  W._hypsoStamp = stamp;
  return W._hypsoQ;
}

/** Fraction of this world's surface that lies below height `h`. */
export function heightRank(W, h) {
  const q = hypsoLadder(W);
  const n = q.length;
  if (!n) return 0.5;
  if (h <= q[0]) return 0;
  if (h >= q[n - 1]) return 1;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (q[mid] < h) lo = mid + 1; else hi = mid;
  }
  return lo / (n - 1);
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
    ice, h, e: elevOf(W, c), hn: heightRank(W, h), x, y, z,
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
