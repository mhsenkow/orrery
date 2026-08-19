/** Catalogue / ruleset → geology kind.
 *  Stamps live in planetTerrain.js; ice paints in iceshell.js.
 *
 *  Named Solar System bodies are validation cases. Unnamed fallbacks read
 *  `worldAxes` interior: fluid → gas, magma → magma, ice → europa, heatpipe
 *  + airless → Io. A temperate `iceshell` tag is not Europa. */

import { worldAxes } from './worldAxes.js';

const ICE_SHELL_KINDS = new Set([
  'europa', 'enceladus', 'titan', 'pluto', 'triton', 'ganymede', 'callisto',
  'miranda', 'mimas', 'rhea', 'uranian',
]);
const GAS_KINDS = new Set(['gas', 'jupiter', 'saturn', 'uranus', 'neptune']);
const WHITTAKER_KINDS = new Set(['earth', 'daisy', 'generic']);

/** Whittaker biomes belong on Earth, Daisyworld, and unnamed temperate water worlds.
 *  Pass `W` when you have it: a generic world with a non-water volatile or a
 *  fluid/magma/ice interior is not a second Earth. */
export function usesWhittakerCover(kind, W) {
  if (kind === 'earth' || kind === 'daisy' || !kind) return true;
  if (!WHITTAKER_KINDS.has(kind)) return false;
  const ax = W?._worldAxes;
  if (!ax) return true;
  if (ax.interior?.v === 'fluid' || ax.interior?.v === 'magma' || ax.interior?.v === 'ice') return false;
  if (ax.volatile?.v && ax.volatile.v !== 'H2O') return false;
  return true;
}

/** Write kind+why onto a ruleset (and optionally a world) so look/stamp/shell agree. */
export function cachePlanetKind(rule, W = null) {
  const hit = planetKindWhy(rule);
  if (rule) {
    rule._planetKind = hit.kind;
    rule._planetKindWhy = hit.why;
  }
  if (W) {
    W._planetKind = hit.kind;
    W._planetKindWhy = hit.why;
  }
  return hit;
}

/** Prefer a cached kind; compute and cache if the world was generated without one. */
export function kindOf(W, rule = W?.rule) {
  if (W?._planetKind) return { kind: W._planetKind, why: W._planetKindWhy || '' };
  if (rule?._planetKind) {
    if (W) {
      W._planetKind = rule._planetKind;
      W._planetKindWhy = rule._planetKindWhy || '';
    }
    return { kind: rule._planetKind, why: rule._planetKindWhy || '' };
  }
  return cachePlanetKind(rule, W);
}

export function isGasKind(kind) {
  return GAS_KINDS.has(kind);
}

export function isIceShellKind(kind) {
  return ICE_SHELL_KINDS.has(kind);
}

function catalogueCat(rule) {
  return rule._catalogueItem?.c || '';
}

function nameBlob(rule) {
  return `${rule.id || ''} ${rule.name || ''} ${rule._catalogueItem?.b || ''} ${rule._catalogueItem?.t || ''}`.toLowerCase();
}

/** Named Solar System bodies — stamps keyed off identity, not a fallback. */
function namedKind(name, rule) {
  const ident = `${rule?._catalogueItem?.b || ''} ${rule?.name || ''}`.toLowerCase();
  if (/\bearth\b/.test(ident) && !/super/.test(ident)) return 'earth';
  if (/\bjupiter\b/.test(name)) return 'jupiter';
  if (/\bsaturn\b/.test(name) && !/rhea|dione|tethys|iapetus|mimas|enceladus|titan|hyperion/.test(name)) return 'saturn';
  if (/\buranus\b/.test(name) && !/miranda|ariel|umbriel|titania|oberon|uranian/.test(name)) return 'uranus';
  if (/\bneptune\b/.test(name) && !/triton/.test(name)) return 'neptune';
  if (/\bio\b/.test(name) && !/ion/.test(name)) return 'io';
  if (/venus/.test(name)) return 'venus';
  if (/\bmars\b/.test(name)) return 'mars';
  if (/mercury/.test(name)) return 'mercury';
  if (/\bluna\b|\bmoon\b|selene/.test(name)) return 'moon';
  if (/enceladus/.test(name)) return 'enceladus';
  if (/\btitan\b/.test(name)) return 'titan';
  if (/\bpluto\b/.test(name) && !/charon/.test(name)) return 'pluto';
  if (/triton/.test(name)) return 'triton';
  if (/ganymede/.test(name)) return 'ganymede';
  if (/callisto/.test(name)) return 'callisto';
  if (/europa/.test(name)) return 'europa';
  if (/iapetus/.test(name)) return 'iapetus';
  if (/miranda/.test(name)) return 'miranda';
  if (/mimas/.test(name)) return 'mimas';
  if (/charon/.test(name)) return 'charon';
  if (/phobos|deimos/.test(name)) return 'phobos';
  if (/ceres/.test(name)) return 'ceres';
  if (/eris|sedna/.test(name)) return 'eris';
  if (/arrokoth|bennu|67p/.test(name)) return 'smallbody';
  if (/rhea|dione|tethys|hyperion/.test(name)) return 'rhea';
  if (/ariel|umbriel|titania|oberon|uranian/.test(name)) return 'uranian';
  return null;
}

/** Kind plus the term that decided it — the Io bug was invisible without this. */
export function planetKindWhy(rule) {
  if (!rule) return { kind: 'generic', why: 'no ruleset' };
  if (rule.earthLike) return { kind: 'earth', why: 'earthLike' };
  if (rule.daisyworld) return { kind: 'daisy', why: 'daisyworld' };

  const name = nameBlob(rule);
  const lid = rule.interior?.lidMode || rule.lidMode || '';
  const cat = catalogueCat(rule);

  const named = namedKind(name, rule);
  if (named) return { kind: named, why: `name:${named}` };

  const ax = worldAxes(rule);
  if (ax.interior.v === 'fluid' || lid === 'none') {
    return { kind: 'gas', why: ax.interior.source || 'lidMode none' };
  }
  if (ax.interior.v === 'magma' || rule.magmaOcean || cat === 'furnace') {
    return { kind: 'magma', why: ax.interior.v === 'magma' ? ax.interior.source : 'furnace catalogue' };
  }
  if (ax.interior.v === 'ice') return { kind: 'europa', why: ax.interior.source || 'ice shell' };

  if (ax.interior.v === 'heatpipe' && rule.airless) {
    return { kind: 'io', why: ax.interior.source || 'heatpipe' };
  }

  if (rule.id === 'ares' || (rule.signature === 'dust' && cat !== 'furnace' && cat !== 'temperate')) {
    return { kind: 'mars', why: rule.id === 'ares' ? 'ares ruleset' : 'dust signature' };
  }

  if (lid === 'episodic') return { kind: 'venus', why: 'episodic lid' };
  if (rule.airless) return { kind: 'airless', why: 'airless' };
  if (lid === 'stagnant') return { kind: 'stagnant', why: 'stagnant lid' };
  if (cat === 'temperate') return { kind: 'generic', why: 'temperate rocky' };
  return { kind: 'generic', why: 'unclassified' };
}

/** Catalogue / ruleset → a geology kind. Ice shells are a separate path. */
export function planetKind(rule) {
  return planetKindWhy(rule).kind;
}

/** Resolve every catalogue body. Used by tests and the kind-resolution table. */
export function auditCatalogueKinds(items, rulesetFromCatalogue) {
  const counts = Object.create(null);
  const rows = [];
  let temperateIo = 0, furnaceMars = 0;
  for (const item of items) {
    if (!item || item.k !== 'BODY') continue;
    const r = rulesetFromCatalogue(item);
    const { kind, why } = planetKindWhy(r);
    const ax = worldAxes(r);
    counts[kind] = (counts[kind] || 0) + 1;
    if (item.c === 'temperate' && kind === 'io') temperateIo++;
    if (item.c === 'furnace' && kind === 'mars') furnaceMars++;
    rows.push({
      id: item.id, name: item.b, cat: item.c, kind, why,
      fingerprint: ax.fingerprint,
      interior: ax.interior.v,
      volatile: ax.volatile.v,
    });
  }
  return { counts, rows, temperateIo, furnaceMars, n: rows.length };
}
