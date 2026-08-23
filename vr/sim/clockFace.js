/** Lived time vs years — two clocks, one panel.
 *
 *  Now: watch one year slowly — day, season and moon on the presentation clock.
 *       The geologic calendar holds; climate integrates at day-scale so weather
 *       matches the sky instead of leaping decades per breath.
 *  Years: watch periods of years — calendar advances at the rate dial; season
 *       (and moon phase) stay on a held snapshot.
 *
 *  Pinned Holocene Earth still uses the old season-from-dtYr path only when the
 *  lived presentation clock is not active (headless / golden), so the golden
 *  run is unchanged.
 */

import { isPinnedEarth } from './ruleMode.js';
import { skyFrame, LIVED_YEAR_SEC, LUNAR_ORBITS_YR, anchorLivedOrbits, snapshotHeldOrbits, isLivedClock } from './sky.js';

export { isLivedClock };

export const CLOCK_FACES = [
  { id: 'now', label: 'Now', hint: 'One year, slowly — day & season' },
  { id: 'years', label: 'Years', hint: 'Periods jump · season holds' },
];

/** ~1 day of climate per sim tick at livedRate 1 — watching a year, not an era. */
const LIVED_CLIMATE_DT_YR = 1 / 365.25;

export const SEASON_HOLDS = [
  { id: 'mar', label: 'Mar', deg: 0, title: 'March equinox' },
  { id: 'jun', label: 'Jun', deg: 90, title: 'June solstice' },
  { id: 'sep', label: 'Sep', deg: 180, title: 'September equinox' },
  { id: 'dec', label: 'Dec', deg: 270, title: 'December solstice' },
];

const YEAR_SEC = LIVED_YEAR_SEC;
const MONTH_SEC = YEAR_SEC / LUNAR_ORBITS_YR;

export function clockFaceOf(W) {
  return isLivedClock(W) ? 'now' : 'years';
}

export function seasonHoldDeg(W) {
  const rad = W.seasonHold != null ? W.seasonHold : (W.season || 0);
  return ((rad * 180 / Math.PI) % 360 + 360) % 360;
}

export function nearestSeasonHold(W) {
  const deg = seasonHoldDeg(W);
  let best = SEASON_HOLDS[0], dBest = 999;
  for (const h of SEASON_HOLDS) {
    const d = Math.min(Math.abs(deg - h.deg), 360 - Math.abs(deg - h.deg));
    if (d < dBest) { dBest = d; best = h; }
  }
  return best;
}

export function setSeasonHold(W, degOrId) {
  let deg = degOrId;
  if (typeof degOrId === 'string') {
    const h = SEASON_HOLDS.find((x) => x.id === degOrId);
    deg = h ? h.deg : seasonHoldDeg(W);
  }
  const rad = ((+deg || 0) * Math.PI) / 180;
  W.seasonHold = rad;
  W.season = rad;
  return rad;
}

export function setClockFace(W, id, opts = {}) {
  const next = id === 'now' ? 'now' : 'years';
  const prev = clockFaceOf(W);
  if (next === prev && W.clockFace && !opts.force) return next;
  W.clockFace = next;
  W._livedActive = next === 'now';
  if (next === 'years') {
    snapshotHeldOrbits(W);
    if (W.seasonHold == null) W.seasonHold = W.season || 0;
    W.season = W.seasonHold;
  } else {
    anchorLivedOrbits(W);
    W._livedT = 0;
    W._livedSeason0 = W.season || 0;
    W._livedSpin0 = W.spinPhase ?? 0;
  }
  return next;
}

/** Default face for a freshly generated world. */
export function initClockFace(W, rule) {
  if (isPinnedEarth(rule)) {
    W.clockFace = 'now';
    W.seasonHold = null;
  } else {
    W.clockFace = 'years';
    W.seasonHold = W.season || 0;
  }
  W._livedT = 0;
  W._livedSeason0 = W.season || 0;
  W.moonAngleHold = null;
  W.moonPhaseHold = null;
  W.spinPhaseHold = null;
  W._livedActive = W.clockFace === 'now';
  if (W._moonDir) delete W._moonDirHold;
  for (const sat of W.bodies?.sats || []) delete sat._heldM;
}

/**
 * Presentation-clock advance — delegates geometry to sky.js (EPH19).
 */
export function livedTick(W, dtSec) {
  skyFrame(W, dtSec);
}

/** Sim-tick season policy — sky owns season; this only gates calendar advance. */
export function applySeasonPolicy(W, rule) {
  if (W._livedActive && isLivedClock(W)) return false;
  if (W.seasonHold != null && !isLivedClock(W)) return false;
  const dt = W.dtYr || 200;
  return dt <= 1000 || dt <= 1e4;
}

/** Skip geologic calendar advance while watching lived time (any world). */
export function shouldHoldCalendar(W, _rule) {
  return isLivedClock(W);
}

/**
 * Climate integration step for this sim tick.
 * On Now: day-scale so hydro/weather track the sky year.
 * On Years: whatever `advanceClock` (or the rate dial) last set.
 */
export function climateDtYr(W) {
  if (!isLivedClock(W)) return W.dtYr || 200;
  const rate = W.livedRate ?? 1;
  return LIVED_CLIMATE_DT_YR * Math.max(0.25, Math.min(8, rate));
}

/** Apply lived climate dt when the calendar is held on Now. */
export function applyLivedClimateDt(W) {
  if (!isLivedClock(W)) return W.dtYr || 200;
  W._dtYrGeologic = W.dtYr || W._dtYrGeologic || 200;
  W.dtYr = climateDtYr(W);
  return W.dtYr;
}
