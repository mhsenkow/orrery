/** Technosphere — watts, waste heat, land use, fossil emissions.
 *  Data lives in vr/data/techno/sources.json. Holocene Earth is a readout
 *  (20 TW, ~0.01% of absorbed sunlight) so the golden gases do not drift. */

import { clamp } from '../math.js';
import { NC } from '../sphere.js';
import { isModernEarth } from './ruleMode.js';
import {
  SOURCE_BY_ID, TECHNO_SOURCES,
  EARTH_ABSORBED_W, HOLOCENE_WATTS, HOLOCENE_LAND_USE,
  WASTE_HEAT_ONSET, POSTBIO_ONSET,
} from './technoTable.js';

export { TECHNO_SOURCES, SOURCE_BY_ID, HOLOCENE_WATTS, EARTH_ABSORBED_W };

function absorbedW(W) {
  const solar = W.solar || W._baseSolar || 1;
  return EARTH_ABSORBED_W * solar;
}

export function sourceById(id) {
  return SOURCE_BY_ID[id] || SOURCE_BY_ID.fossil;
}

export function insolationFrac(watts, W) {
  return watts / Math.max(1, absorbedW(W));
}

function meanOre(W) {
  if (!W.ore) return 1;
  let s = 0, n = 0;
  for (let c = 0; c < NC; c += 11) { s += W.ore[c]; n++; }
  return n ? s / n : 1;
}

export function seedTechnosphere(W) {
  const rule = W.rule || {};
  if (rule.daisyworld || rule.airless || W.noSurface) {
    W.techno = null;
    return;
  }
  if (isModernEarth(rule)) {
    const watts = HOLOCENE_WATTS;
    W.techno = {
      watts,
      sourceId: 'fossil',
      landUseFrac: HOLOCENE_LAND_USE,
      wasteHeatFrac: insolationFrac(watts, W),
      calibrated: true,
      tag: 'measured',
      failed: false,
    };
    W._postbio = false;
    return;
  }
  W.techno = {
    watts: 0,
    sourceId: 'biomass',
    landUseFrac: 0,
    wasteHeatFrac: 0,
    calibrated: false,
    tag: 'fitted',
    failed: false,
  };
  W._postbio = false;
}

/** After bio in simTick. Skip giants, Daisyworld, generate spin-up. */
export function technoTick(W, log) {
  if (W._spinup || W._pauseBio) return;
  const rule = W.rule || {};
  if (rule.daisyworld || rule.airless || W.noSurface) return;
  if (!W.techno) seedTechnosphere(W);
  const T = W.techno;
  if (!T) return;

  if (T.calibrated) {
    T.watts = HOLOCENE_WATTS;
    T.landUseFrac = HOLOCENE_LAND_USE;
    T.wasteHeatFrac = insolationFrac(T.watts, W);
    T.kardashev = kardashevOf(T.watts);
    return;
  }

  const build = W.meanBuild || 0;
  const src = sourceById(T.sourceId);
  let watts = build * 8e13 * (src.powerDensityWm2 / 200);
  const ore = meanOre(W);
  if (ore < 0.08 && src.id === 'fossil') {
    watts *= Math.max(0.15, ore / 0.08);
    if (watts < 1e11 && build > 0.05) {
      T.failed = true;
      T.sourceId = 'biomass';
      if (log) log(W.year, 'techno', 0, ore, 'Technosphere overshoot — fossil stock gone');
    }
  }
  if (T.failed) watts *= 0.92;
  T.watts = Math.max(0, watts);
  T.landUseFrac = clamp(build * 2.2 * src.landFootprint, 0, 0.85);
  T.wasteHeatFrac = insolationFrac(T.watts, W);
  T.tag = src.tag;
  T.kardashev = kardashevOf(T.watts);

  const dt = Math.min(1, (W.dtYr || 10) / 10);
  if (src.co2KgPerJ > 0 && W.carbon && T.watts > 1e11) {
    const flux = (T.watts / HOLOCENE_WATTS) * 0.0006 * dt;
    W.carbon.buriedOrg = Math.max(0, (W.carbon.buriedOrg || 0) - flux);
    W.carbon.atmosphere += flux;
    W.gases.CO2 = clamp(W.gases.CO2 + flux / 100, 0, 0.08);
  }

  if (T.wasteHeatFrac > WASTE_HEAT_ONSET && W.temp) {
    const dT = (T.wasteHeatFrac - WASTE_HEAT_ONSET) * 0.12 * dt;
    for (let c = 0; c < NC; c += 3) W.temp[c] = Math.min(1.4, W.temp[c] + dT);
  }

  W._postbio = T.wasteHeatFrac >= POSTBIO_ONSET;
  if (W._postbio) T.tag = 'invented';
}

export function kardashevOf(watts) {
  if (!(watts > 0)) return 0;
  return clamp(Math.log10(watts / 1e12) / 3, 0, 2);
}

export function formatTechno(W) {
  const T = W.techno;
  if (!T || !(T.watts > 0)) return '';
  const tw = T.watts / 1e12;
  const pct = (T.wasteHeatFrac * 100).toFixed(T.wasteHeatFrac < 0.001 ? 3 : 2);
  const src = sourceById(T.sourceId);
  const bits = [
    `${tw >= 10 ? tw.toFixed(0) : tw.toFixed(1)} TW`,
    `${pct}% insolation`,
    src?.name,
    T.calibrated ? null : T.tag,
    W._postbio ? 'post-bio (invented)' : null,
    T.failed ? 'collapsed' : null,
  ];
  return bits.filter(Boolean).join(' · ');
}

export function formatMega(W) {
  const bits = [];
  if ((W.solarShade || 0) > 0.002) {
    bits.push(`L1 shade ${(W.solarShade * 100).toFixed(1)}% (fitted)`);
  }
  if (W._postbio) bits.push('waste-heat ceiling');
  const T = W.techno;
  if (T?.kardashev) bits.push(`K ${T.kardashev.toFixed(2)}`);
  return bits.join(' · ');
}

/** Night-side lights follow energy, not only city count. */
export function technoLights(W, cityScalar = 0) {
  if (cityScalar <= 0) return 0;
  const T = W.techno;
  const energy = T ? clamp(T.watts / HOLOCENE_WATTS, 0, 4) : 1;
  return Math.min(1, cityScalar * (0.35 + energy * 0.65));
}
