/** Column field: a stack per cell from an authored recipe.
 *
 *  Authored in vr/data/worlds/columns.json, compiled to columnTable.js.
 *  Not a packed per-cell array — most worlds need three layers, and lid /
 *  ocean thickness already live on W.shellLid / W.shellOcean. Earth stays
 *  silent so the golden core sample still reconstructs from W.rock.
 *  Gates are axes and flags, not a name regex. */

import { isGasKind, kindOf } from './planetKind.js';
import {
  COLUMN_VERSION, COLUMN_LAYERS, COLUMN_BY_ID, COLUMN_RECIPES, RECIPE_BY_ID,
} from './columnTable.js';
import { envelopeDeckLayers, formatPlevel, deckAtPressure } from './plevel.js';
import { formatStackAt, stackTop } from './colstack.js';
import { SUBSTRATES } from './substrates.js';

export {
  COLUMN_VERSION, COLUMN_LAYERS, COLUMN_BY_ID, COLUMN_RECIPES, RECIPE_BY_ID,
};

function finite(x) { return typeof x === 'number' && Number.isFinite(x); }

function ctxOf(W) {
  const rule = W?.rule || {};
  const ax = W?._worldAxes || {};
  const { kind } = kindOf(W, rule);
  return {
    interior: ax.interior?.v || rule.interior?.lidMode || 'stagnant',
    volatile: ax.volatile?.v || (rule.methaneSolvent ? 'CH4' : 'H2O'),
    airless: !!rule.airless,
    iceShell: !!rule.iceShell,
    earthLike: !!rule.earthLike,
    daisy: !!rule.daisyworld,
    fluid: ax.interior?.v === 'fluid' || isGasKind(kind),
    magma: ax.interior?.v === 'magma' || kind === 'magma',
    gravity: ax.gravity?.v ?? rule.gravity ?? 1,
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
  return true;
}

function includeSpec(spec, W) {
  if (spec.when === 'hpIce' && !W._hpIceFloor) return false;
  if (spec.when === 'clathrate' && !((W._clathrate || 0) > 0.05)) return false;
  return true;
}

function depthKmOf(spec, W, cell) {
  let km = spec.depthKm;
  if (spec.vary === 'lid') {
    const lid = W.shellLid?.[cell];
    km = spec.depthKm * ((lid ?? 0.55) / 0.55);
  } else if (spec.vary === 'ocean') {
    const base = W._oceanKm > 0 ? W._oceanKm : spec.depthKm;
    const o = W.shellOcean?.[cell];
    km = o != null ? base * (o / 0.7) : base;
  }
  return km < 0 ? 0 : km;
}

/** First matching recipe. Earth and Daisyworld return null. */
export function recipeOf(W) {
  if (!W) return null;
  const ctx = ctxOf(W);
  if (ctx.earthLike || ctx.daisy) return null;
  if (ctx.fluid) return RECIPE_BY_ID.envelope;
  for (const r of COLUMN_RECIPES) {
    if (needsOk(r.needs, ctx)) return r;
  }
  return null;
}

export function stampColumn(W) {
  W._columnRecipe = recipeOf(W);
  return W._columnRecipe;
}

/** Stack at a cell. Depths in km from the surface down. */
export function columnAt(W, cell = 0) {
  const rec = recipeOf(W);
  if (!rec) return { recipe: null, layers: [], silent: true, noSurface: false };
  if (rec.noSurface) {
    const env = COLUMN_BY_ID.envelope;
    return { recipe: rec, layers: [], silent: false, noSurface: true, rgb: env?.rgb };
  }
  const layers = [];
  let top = 0;
  for (const spec of rec.layers) {
    if (!includeSpec(spec, W)) continue;
    const row = COLUMN_BY_ID[spec.id];
    if (!row) continue;
    const km = depthKmOf(spec, W, cell);
    layers.push({
      id: row.id,
      name: row.name,
      rgb: row.rgb,
      tag: row.tag,
      why: row.why,
      substrate: row.substrate,
      depthKm: km,
      topKm: top,
    });
    top += km;
  }
  return { recipe: rec, layers, silent: false, noSurface: false };
}

export function columnLayers(W, cell = 0) {
  const col = columnAt(W, cell);
  const out = [];
  if (col.silent) return out;
  if ((W.frost?.[cell] || 0) > 0.08) {
    out.push({
      depth: -0.002, name: 'frost cover', ageMyr: 0,
      note: `frost ${W.frost[cell].toFixed(2)}`, rgb: [230, 240, 252],
    });
  }
  if (col.noSurface) {
    return envelopeDeckLayers(W, cell);
  }
  for (const L of col.layers) {
    out.push({
      depth: L.topKm,
      name: L.name,
      ageMyr: 0,
      note: formatDepth(L.depthKm),
      rgb: L.rgb,
    });
  }
  return out;
}

export function formatDepth(km) {
  if (!(km > 0)) return '';
  if (km < 0.001) return `${Math.max(1, Math.round(km * 1e6))} m`;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return km >= 20 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
}

/** World chip string. Earth silent. */
export function columnRecipe(W) {
  if (!W || W.rule?.earthLike) return '';
  const rec = recipeOf(W);
  if (!rec) return '';
  if (rec.noSurface) return 'no surface · envelope';
  const names = [];
  for (const spec of rec.layers) {
    if (!includeSpec(spec, W)) continue;
    const row = COLUMN_BY_ID[spec.id];
    if (row?.name) names.push(row.name);
  }
  return names.join(' · ');
}

export function formatColumn(W) {
  if (!W || W.rule?.earthLike) return '';
  const rec = recipeOf(W);
  if (!rec) return '';
  const bits = [];
  const recipe = columnRecipe(W);
  if (recipe) bits.push(recipe);
  if (!rec.noSurface) {
    if (W._hpIceFloor) bits.push(`ocean ~${(W._oceanKm || 0).toFixed(0)} km · ice VI floor`);
    else if (W.rule?.iceShell && W._oceanKm > 2) bits.push(`ocean ~${W._oceanKm.toFixed(0)} km`);
  }
  if ((W._clathrate || 0) > 0.05) bits.push('clathrate store');
  return bits.join(' · ');
}

/** Inspect line: names plus this cell's thicknesses. Live stack wins. */
export function formatColumnAt(W, cell = 0) {
  if (!W) return '';
  if (W.stackN?.[cell] > 0) return formatStackAt(W, cell);
  if (W.rule?.earthLike) return '';
  const col = columnAt(W, cell);
  if (col.silent) return '';
  if (col.noSurface) {
    const live = formatPlevel(W, cell);
    return live ? `no surface · ${live}` : 'no surface · envelope';
  }
  return col.layers.map((L) => {
    const d = formatDepth(L.depthKm);
    return d ? `${L.name} ${d}` : L.name;
  }).join(' · ');
}

/** Overlay colour: the top layer, or envelope. */
export function columnRgbAt(W, cell = 0) {
  if (W?.stackN?.[cell] > 0) {
    const top = stackTop(W, cell);
    return SUBSTRATES[top]?.rgb || [48, 46, 52];
  }
  const col = columnAt(W, cell);
  if (col.silent) return null;
  if (col.noSurface) {
    const p = W.pSeen?.[cell];
    if (p > 0) return deckAtPressure(W, p).rgb;
    return col.rgb || [48, 40, 72];
  }
  return col.layers[0]?.rgb || [48, 46, 52];
}

/** Enceladus-style: lid km at a pole vs elsewhere. */
export function lidKmAt(W, cell) {
  const col = columnAt(W, cell);
  const lid = col.layers.find((L) => L.id === 'iceLid');
  return lid ? lid.depthKm : 0;
}
