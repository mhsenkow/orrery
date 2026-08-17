/** Coast desk — intertidal, flats, flood risk, harbour settlements. */

import { NC } from '../sphere.js';
import { tideBudget } from './tides.js';

/** Aggregate coastal statistics for the panel. */
export function coastDeskSnapshot(W) {
  const sea = W._seaBase ?? W.seaLevel;
  let interN = 0, flatN = 0, wetSum = 0, rangeSum = 0, coastN = 0;
  let maxRange = 0, maxRangeCell = 0;
  for (let c = 0; c < NC; c++) {
    const elev = W.h[c] - sea;
    const near = elev > -0.08 && elev < 0.06;
    if (!near) continue;
    coastN++;
    const it = W.intertidal?.[c] || 0;
    const range = W.tideRange?.[c] || 0;
    rangeSum += range;
    if (it > 0.08) {
      interN++;
      wetSum += W.tideWet?.[c] || 0;
    }
    if (it > 0.35 && range > 0.01 && Math.abs(elev) < 0.02) flatN++;
    if (range > maxRange) { maxRange = range; maxRangeCell = c; }
  }

  const cities = W.cities?.length ? W.cities : [];
  const coastalCities = cities.filter((x) => W.h[x.cell] < sea + 0.05);
  const harbours = coastalCities.filter((x) => x.harbour);
  const drowned = coastalCities.filter((x) => x.drowned);
  const surgeRisk = coastalCities.filter((c) => (W.surgeField?.[c.cell] || 0) > 0.012);
  const spring = W.tidePhase === 'springs';

  const floodScore = clamp01(
    (W.meanTideRange || 0) * 20
    + (spring ? 0.25 : 0)
    + (W._stormMax || 0) * 0.4
    + drowned.length * 0.05
  );

  const tide = tideBudget(W);
  return {
    tide,
    coastN,
    intertidalPct: coastN ? (interN / coastN) * 100 : 0,
    flatPct: coastN ? (flatN / coastN) * 100 : 0,
    meanWetHours: interN ? wetSum / interN : 0, // 0–1 proxy
    meanRange: coastN ? rangeSum / coastN : 0,
    maxRange,
    maxRangeCell,
    cities: coastalCities.length,
    harbours: harbours.length,
    drowned: drowned.length,
    surgeRisk: surgeRisk.length,
    floodScore,
    spring,
    topCities: coastalCities.slice(0, 5).map((x) => ({
      name: x.name,
      stage: x.stage,
      pop: x.pop,
      harbour: x.harbour,
      drowned: x.drowned,
      tide: x.tideRange,
      surge: W.surgeField?.[x.cell] || 0,
      cell: x.cell,
    })),
    note: floodNote(floodScore, spring, drowned.length, surgeRisk.length),
  };
}

function floodNote(score, spring, drowned, surge) {
  if (score > 0.7) return `High flood stress${spring ? ' · springs amplify surge' : ''}${surge ? ` · ${surge} settlements in surge` : ''}`;
  if (score > 0.4) return `Moderate coastal risk${drowned ? ` · ${drowned} camps drowning` : ''}`;
  return 'Coast quiet — harbours prefer mid tidal range';
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/** Hours-wet style readout for inspect. */
export function coastAtCell(W, c) {
  if (c < 0) return null;
  const sea = W._seaBase ?? W.seaLevel;
  return {
    elev: W.h[c] - sea,
    intertidal: W.intertidal?.[c] || 0,
    wet: W.tideWet?.[c] || 0,
    range: W.tideRange?.[c] || 0,
    surge: W.surgeField?.[c] || 0,
    flat: (W.intertidal?.[c] || 0) > 0.35 && (W.tideRange?.[c] || 0) > 0.01,
  };
}
