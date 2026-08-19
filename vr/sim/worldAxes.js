/** Seven axes that say what a world is, computed from a ruleset / WorldRecord.
 *  Leaf: reads rule fields and optional `rule.worldRecord`. No sim imports.
 *
 *  gravity, volatiles, dominant volatile, interior, insolation, age, resurfacing.
 *  Four come from measured/derived record fields; volatiles, dominant volatile
 *  and resurfacing are inferred and tagged as such. */

import { clamp } from '../math.js';

export const AXIS_SPEC = {
  gravity: {
    unit: 'g⊕', range: [0.01, 3], scale: 'log',
    lo: 'rubble', hi: 'super-Earth',
  },
  volatiles: {
    unit: 'Earth-ocean', range: [1e-4, 200], scale: 'log',
    lo: 'dry', hi: 'envelope',
  },
  volatile: {
    unit: '', values: ['H2O', 'CO2', 'CH4', 'N2', 'SO2', 'H2', 'silicate'],
    lo: 'rock vapour', hi: 'hydrogen',
  },
  interior: {
    unit: '', values: ['mobile', 'stagnant', 'episodic', 'heatpipe', 'ice', 'magma', 'fluid'],
    lo: 'solid lid', hi: 'no surface',
  },
  insolation: {
    unit: 'S⊕', range: [0, 5e4], scale: 'log',
    lo: 'free-floating', hi: 'KELT-9',
  },
  age: {
    unit: 'Gyr', range: [0.01, 13], scale: 'linear',
    lo: 'disk', hi: 'halo',
  },
  resurface: {
    unit: 'Myr', range: [1e-3, 1e6], scale: 'log',
    lo: 'fresh', hi: 'ancient',
  },
};

const VOL_CODE = { H2O: 'W', CO2: 'C', CH4: 'M', N2: 'N', SO2: 'S', H2: 'H', silicate: 'R' };
const INT_CODE = {
  mobile: 'm', stagnant: 's', episodic: 'e', heatpipe: 'h', ice: 'i', magma: 'x', fluid: 'f',
};

function num(f) {
  if (f == null) return null;
  if (typeof f === 'number' && Number.isFinite(f)) return f;
  if (typeof f === 'object' && Number.isFinite(f.v)) return f.v;
  return null;
}

function axis(v, spec, { tier = 'invented', source = '' } = {}) {
  return {
    v,
    unit: spec.unit,
    range: spec.range || spec.values,
    scale: spec.scale || 'cat',
    lo: spec.lo,
    hi: spec.hi,
    tier,
    source,
  };
}

function recOf(rule) {
  return rule?.worldRecord || null;
}

function teqOf(rule, rec) {
  return num(rec?.teq) ?? rule?.teqK ?? (rule?.solar != null ? 278 * Math.pow(Math.max(0.001, rule.solar), 0.25) : null);
}

function radiusOf(rule, rec) {
  return num(rec?.radius) ?? rule?.radiusEarth ?? null;
}

function catOf(rule) {
  return rule?._catalogueItem?.c || recCat(rule) || '';
}

function recCat(rule) {
  return rule?.worldRecord?.category || '';
}

function needsOf(rule) {
  return new Set(rule?._catalogueItem?.p || rule?.catalogueNeeds || []);
}

function qLog(v, lo, hi, n = 9) {
  if (!(v > 0)) return 0;
  const t = (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  return clamp(Math.round(t * n), 0, n);
}

function qLin(v, lo, hi, n = 9) {
  if (!Number.isFinite(v)) return 0;
  return clamp(Math.round(((v - lo) / (hi - lo)) * n), 0, n);
}

/** Interior state — fluid / magma / ice from parameters, not from a catalogue tag. */
export function interiorState(rule) {
  const rec = recOf(rule);
  const r = radiusOf(rule, rec);
  const teq = teqOf(rule, rec);
  const comp = rec?.composition || rule?.composition;
  const valley = rec?.valley || rule?.valley;
  const lid = rule?.interior?.lidMode || rule?.lidMode || '';
  const cat = catOf(rule);
  const needs = needsOf(rule);
  const pulsar = rule?.star?.heating === 'particle' || needs.has('pulsar');
  const heat = rule?.interior?.heatFlow || 0;

  if (rule?.magmaOcean || cat === 'furnace' || (teq != null && teq > 1700)) {
    return { v: 'magma', tier: rule?.magmaOcean ? 'derived' : 'assumed', source: 'teq/furnace' };
  }
  if (
    lid === 'none'
    || cat === 'giant'
    || valley === 'sub-Neptune' || valley === 'Neptune' || valley === 'giant'
    || (comp?.envelope > 0.25)
    || (r != null && r > 4)
  ) {
    return { v: 'fluid', tier: 'derived', source: valley || (comp?.envelope > 0.25 ? 'envelope' : 'radius') };
  }
  const cold = teq != null && teq < 180;
  const iceTagged = lid === 'ice' || rule?.iceShell || needs.has('iceshell');
  if (iceTagged && (cold || cat === 'moons' || cat === 'sol')) {
    return { v: 'ice', tier: 'derived', source: cold ? 'cold ice shell' : 'outer-system ice' };
  }
  const wm2 = num(rec?.tidalHeatWm2);
  const moonish = !!rec?.moonParent || cat === 'moons';
  // Heat-pipe is Io's interior: high heat on a moon, not a close-in airless
  // exoplanet whose stellar-tide formula is in Earth-masses-around-a-star.
  if (!pulsar && !iceTagged && (
    (heat > 1.8 && (rule?.airless || moonish))
    || (moonish && wm2 > 0.5)
  )) {
    return {
      v: 'heatpipe',
      tier: 'derived',
      source: moonish && wm2 > 0.5 ? `tidal ${wm2.toFixed(2)} W/m²` : `heatFlow ${heat.toFixed(2)}`,
    };
  }
  if (lid === 'episodic') return { v: 'episodic', tier: 'assumed', source: 'lidMode' };
  if (lid === 'mobile' || lid === 'stagnant') return { v: lid, tier: rec?.interior ? 'derived' : 'assumed', source: 'lidMode' };
  if (rule?.airless) return { v: 'stagnant', tier: 'assumed', source: 'airless' };
  return { v: 'mobile', tier: 'invented', source: 'default' };
}

function beyondSnowLine(rec) {
  if (rec?.moonParent) return false;
  const a = num(rec?.a);
  const snow = num(rec?.snowLineAu);
  return a > 0 && snow > 0 && a > snow * 1.2;
}

function volatileInventory(rule, rec, interior) {
  const r = radiusOf(rule, rec) || 1;
  const comp = rec?.composition || rule?.composition;
  let inv;
  if (interior === 'fluid' || (comp?.envelope > 0.25)) {
    inv = axis(80 * Math.max(1, r / 4), AXIS_SPEC.volatiles, {
      tier: 'derived', source: 'H/He envelope',
    });
  } else if (rule?.airless && !(rule?.iceShell)) {
    inv = axis(0.001, AXIS_SPEC.volatiles, { tier: 'assumed', source: 'airless' });
  } else if (comp?.water > 0) {
    inv = axis(comp.water * (r ** 3) * 12, AXIS_SPEC.volatiles, {
      tier: 'derived', source: 'density water fraction',
    });
  } else if (rule?.totalWater != null) {
    inv = axis(rule.totalWater, AXIS_SPEC.volatiles, { tier: 'invented', source: 'ruleset totalWater' });
  } else {
    inv = axis(0.1, AXIS_SPEC.volatiles, { tier: 'invented', source: 'unknown' });
  }
  if (beyondSnowLine(rec) && interior !== 'fluid' && interior !== 'magma') {
    return axis(Math.min(200, inv.v * 3), AXIS_SPEC.volatiles, {
      tier: 'invented', source: `${inv.source}; beyond snow line`,
    });
  }
  return inv;
}

function dominantVolatile(rule, rec, interior) {
  const teq = teqOf(rule, rec);
  const gases = rec?.gases || rule?.gases || {};
  if (interior === 'fluid') return axis('H2', AXIS_SPEC.volatile, { tier: 'derived', source: 'envelope' });
  if (interior === 'magma') return axis('silicate', AXIS_SPEC.volatile, { tier: 'derived', source: 'magma ocean' });
  if (rule?.methaneSolvent || (gases.CH4 || 0) > 0.02 || (teq != null && teq > 70 && teq < 115 && (gases.N2 || 0) > 0.4)) {
    return axis('CH4', AXIS_SPEC.volatile, { tier: 'derived', source: 'methane window' });
  }
  if (interior === 'heatpipe' || (gases.sulphate || 0) > 0.04) {
    return axis('SO2', AXIS_SPEC.volatile, { tier: 'assumed', source: 'tidal sulfur' });
  }
  if (teq != null && teq < 55) {
    return axis('N2', AXIS_SPEC.volatile, { tier: 'assumed', source: 'N2 ice regime' });
  }
  if ((gases.CO2 || 0) > 0.4 || rule?.signature === 'dust') {
    return axis('CO2', AXIS_SPEC.volatile, { tier: 'assumed', source: 'CO2 air / dust' });
  }
  return axis('H2O', AXIS_SPEC.volatile, { tier: 'assumed', source: 'water default' });
}

function resurfaceMyr(rule, rec, interior) {
  const heat = rule?.interior?.heatFlow ?? 1;
  let v = 2000;
  let source = 'stagnant lid';
  if (interior === 'fluid') { v = 0; source = 'no surface'; }
  else if (interior === 'magma') { v = 0.01; source = 'magma ocean'; }
  else if (interior === 'heatpipe') { v = 0.1; source = 'heatpipe volcanism'; }
  else if (interior === 'ice') { v = Math.max(1, 80 / Math.max(0.1, heat)); source = 'ice shell'; }
  else if (interior === 'mobile') { v = 200 / Math.max(0.3, heat); source = 'mobile lid'; }
  else if (interior === 'episodic') { v = 500; source = 'episodic lid'; }
  else v = 4000 / Math.max(0.05, heat);
  return axis(v, AXIS_SPEC.resurface, { tier: 'invented', source });
}

function fingerprintOf(ax) {
  const g = qLog(ax.gravity.v || 0.01, 0.01, 3);
  const vol = qLog(Math.max(1e-4, ax.volatiles.v || 1e-4), 1e-4, 200);
  const d = VOL_CODE[ax.volatile.v] || 'W';
  const i = INT_CODE[ax.interior.v] || 's';
  const S = qLog(Math.max(1e-4, ax.insolation.v || 1e-4), 1e-4, 5e4);
  const A = qLin(ax.age.v ?? 5, 0.01, 13);
  const R = ax.resurface.v === 0 ? 0 : qLog(Math.max(1e-3, ax.resurface.v), 1e-3, 1e6);
  return `g${g}v${vol}${d}${i}S${S}A${A}R${R}`;
}

/** Compute the seven axes for a ruleset. Safe on synthetic Earth with no record. */
export function worldAxes(rule) {
  if (!rule) {
    return worldAxes({ gravity: 1, solar: 1, earthLike: true, interior: { lidMode: 'mobile' }, totalWater: 1 });
  }
  const rec = recOf(rule);
  const interiorHit = interiorState(rule);
  const interior = axis(interiorHit.v, AXIS_SPEC.interior, {
    tier: interiorHit.tier, source: interiorHit.source,
  });

  const g = num(rec?.gravity) ?? rule.gravity ?? 1;
  const gravity = axis(g, AXIS_SPEC.gravity, {
    tier: rec?.gravity?.tier || (rule.gravityLocked ? 'derived' : 'assumed'),
    source: rec?.gravity?.source || 'ruleset',
  });

  const S = num(rec?.S) ?? rule.solarTrue ?? rule.solar ?? 1;
  const insolation = axis(S, AXIS_SPEC.insolation, {
    tier: rec?.S?.tier || 'assumed',
    source: rec?.S ? 'record S' : 'ruleset solar',
  });

  let ageV = num(rec?.ageGyr) ?? rule.ageGyr ?? rule.star?.ageGyr ?? null;
  let ageTier = rec?.ageGyr?.tier || (ageV != null ? 'assumed' : 'invented');
  let ageSrc = rec?.ageGyr ? 'record/host' : (rule.star?.ageGyr != null ? 'star' : 'default 5 Gyr');
  if (ageV == null) {
    ageV = rule.earthLike ? 4.6 : 5;
    ageTier = rule.earthLike ? 'measured' : 'invented';
    ageSrc = rule.earthLike ? 'Earth' : 'unmeasured';
  }
  const age = axis(ageV, AXIS_SPEC.age, { tier: ageTier, source: ageSrc });

  const volatiles = volatileInventory(rule, rec, interior.v);
  const volatile = dominantVolatile(rule, rec, interior.v);
  const resurface = resurfaceMyr(rule, rec, interior.v);

  const axes = { gravity, volatiles, volatile, interior, insolation, age, resurface };
  axes.fingerprint = fingerprintOf(axes);

  // Extras sit beside the seven, not inside AXIS_SPEC — they must not become
  // more named types to switch on.
  axes.retain = rec?.retain || rule.retain || null;
  axes.shoreline = num(rec?.shoreline);
  axes.magnetosphere = Number.isFinite(rule.magnetosphere) ? rule.magnetosphere : null;
  axes.spinOrbit = rec?.spinOrbit || rule.spinOrbit
    || (rule.tidallyLocked ? { p: 1, q: 1, solarDayFactor: 1 } : null);
  axes.nonHydrostatic = !!(rec?.nonHydrostatic || rule.nonHydrostatic);
  axes.moonParent = rec?.moonParent || null;
  axes.snowLineAu = num(rec?.snowLineAu);
  axes.region = regionName(axes, rule);
  return axes;
}

/** Named region of the seven-axis space. Titan is not a desert; Earth is habitable. */
export function regionName(ax, rule) {
  if (!ax) return 'unknown';
  if (ax.interior?.v === 'fluid') return 'giant';
  if (ax.interior?.v === 'magma') return 'lava';
  if (ax.volatile?.v === 'CH4') return 'titanian';
  if (ax.interior?.v === 'ice') return 'ice dwarf';
  if (ax.interior?.v === 'heatpipe') return 'tidal volcanic';
  if (ax.nonHydrostatic) return 'rubble';
  if (ax.volatile?.v === 'CO2' && (ax.gravity?.v ?? 1) < 0.5) return 'desert';
  if ((ax.insolation?.v ?? 1) > 1.6 && ax.volatile?.v === 'CO2') return 'runaway';
  if (rule?.airless || (ax.volatiles?.v ?? 1) < 0.005) return 'airless rock';
  if ((ax.volatiles?.v ?? 0) > 8 && ax.volatile?.v === 'H2O' && ax.interior?.v !== 'fluid') return 'ocean world';
  if (ax.volatile?.v === 'H2O' && (ax.insolation?.v ?? 1) > 0.25 && (ax.insolation?.v ?? 1) < 1.6) {
    return 'habitable';
  }
  return 'rocky';
}

/** One line with units, for the chip title and the land dock. */
export function formatAxesLine(ax) {
  if (!ax) return '';
  const n = (x, d) => {
    if (!Number.isFinite(x?.v)) return '—';
    if (x.v === 0) return '0';
    if (x.v >= 100) return x.v.toFixed(0);
    if (x.v >= 10) return x.v.toFixed(1);
    if (x.v >= 1) return x.v.toFixed(d ?? 2);
    if (x.v >= 0.01) return x.v.toFixed(3);
    return x.v.toExponential(0);
  };
  return [
    `${n(ax.gravity)} ${ax.gravity.unit}`,
    `${n(ax.volatiles, 1)} ${ax.volatiles.unit}`,
    ax.volatile.v,
    ax.interior.v,
    `${n(ax.insolation, 2)} ${ax.insolation.unit}`,
    `${n(ax.age, 1)} ${ax.age.unit}`,
    `${n(ax.resurface, 0)} ${ax.resurface.unit}`,
  ].join(' · ');
}

/** Region, shape and retention — beside the seven, not a substitute for them. */
export function formatAxesExtras(ax) {
  if (!ax) return '';
  const bits = [];
  if (ax.region) bits.push(ax.region);
  if (ax.nonHydrostatic) bits.push('not round');
  if (ax.retain && ax.retain.retain === false && ax.retain.why === 'measured-absent') {
    bits.push('lost air (measured-absent)');
  }
  if (ax.spinOrbit && ax.spinOrbit.p > 1) bits.push(`${ax.spinOrbit.p}:${ax.spinOrbit.q} spin–orbit`);
  return bits.join(' · ');
}

/** How much of the seven-axis space a list of worlds occupies, and what is empty. */
export function worldAxesCoverage(axesList) {
  const list = axesList || [];
  const numeric = {};
  const categorical = {};
  const gaps = [];
  for (const k of ['gravity', 'volatiles', 'insolation', 'age', 'resurface']) {
    const spec = AXIS_SPEC[k];
    const vs = list.map((ax) => ax?.[k]?.v).filter((v) => Number.isFinite(v));
    let min = Infinity, max = -Infinity;
    for (const v of vs) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    numeric[k] = {
      min: vs.length ? min : null,
      max: vs.length ? max : null,
      unit: spec.unit,
      lo: spec.lo,
      hi: spec.hi,
    };
    const [lo, hi] = spec.range;
    if (vs.length && spec.scale === 'log') {
      if (min > lo * 12) gaps.push(`${k}: nothing as ${spec.lo} as ${lo} ${spec.unit}`);
      if (max < hi / 12) gaps.push(`${k}: nothing as ${spec.hi} as ${hi} ${spec.unit}`);
    }
  }
  for (const k of ['volatile', 'interior']) {
    const counts = {};
    for (const ax of list) {
      const v = ax?.[k]?.v;
      if (v) counts[v] = (counts[v] || 0) + 1;
    }
    categorical[k] = counts;
    for (const v of AXIS_SPEC[k].values || []) {
      if (!counts[v]) gaps.push(`${k}: no ${v}`);
    }
  }
  return { n: list.length, numeric, categorical, gaps };
}
