/** Lived time vs years — two clocks, one panel.
 *
 *  Now: day, season and moon run on the presentation clock. The calendar holds.
 *  Years: the calendar runs; season (and moon phase) stay on a held snapshot.
 *
 *  Pinned Holocene Earth keeps the old season-from-dtYr path until the player
 *  picks a hold, so the golden run is unchanged.
 */

import { isPinnedEarth } from './ruleMode.js';

export const CLOCK_FACES = [
  { id: 'now', label: 'Now', hint: 'Days, seasons, moon' },
  { id: 'years', label: 'Years', hint: 'Calendar runs · season holds' },
];

export const SEASON_HOLDS = [
  { id: 'mar', label: 'Mar', deg: 0, title: 'March equinox' },
  { id: 'jun', label: 'Jun', deg: 90, title: 'June solstice' },
  { id: 'sep', label: 'Sep', deg: 180, title: 'September equinox' },
  { id: 'dec', label: 'Dec', deg: 270, title: 'December solstice' },
];

const YEAR_SEC = 48;
const MONTH_SEC = YEAR_SEC / 13.4;

export function isLivedClock(W) {
  return (W.clockFace || 'years') === 'now';
}

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

export function setClockFace(W, id) {
  const next = id === 'now' ? 'now' : 'years';
  const prev = clockFaceOf(W);
  if (next === prev && W.clockFace) return next;
  W.clockFace = next;
  W._livedActive = next === 'now';
  if (next === 'years') {
    if (W.seasonHold == null) W.seasonHold = W.season || 0;
    W.season = W.seasonHold;
    W.moonAngleHold = W.moonAngle ?? 0;
    W.moonPhaseHold = W.moonPhase ?? 0;
    if (W._moonDir) W._moonDirHold = W._moonDir.slice();
  } else {
    W._livedT = 0;
    W._livedSeason0 = W.season || 0;
    W._livedMoon0 = W.moonAngle ?? 0;
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
}

/**
 * Presentation-clock season + moon. Call from the frame loop, not simTick.
 * ~48 s of watching is one orbital year; the month is 13.4× faster.
 */
export function livedTick(W, dtSec) {
  if (!isLivedClock(W)) return;
  const dt = Math.max(0, dtSec || 0);
  if (dt) W._livedActive = true;
  W._livedT = (W._livedT || 0) + dt;
  const t = W._livedT;
  W.season = (W._livedSeason0 || 0) + t * (Math.PI * 2) / YEAR_SEC;
  const moon0 = W._livedMoon0 || 0;
  const lunar = moon0 + t * (Math.PI * 2) / MONTH_SEC;
  W.moonAngle = lunar;
  W.moonPhase = ((lunar / (Math.PI * 2)) % 1 + 1) % 1;
  W._moonDir = [Math.cos(lunar), 0, Math.sin(lunar)];
}

/** Sim-tick season policy. Returns true if this tick owns season. */
export function applySeasonPolicy(W, rule) {
  if (W._livedActive && isLivedClock(W)) return false;
  if (W.seasonHold != null && !isLivedClock(W)) {
    W.season = W.seasonHold;
    return false;
  }
  /* One apparent year in ~36 ticks, for any world running a fine enough clock.
   *
   * Only the pinned Earth used to get this; everything else advanced the season
   * by `0.02 · dtYr/10⁴` — 2·10⁻⁵ radians a tick at ten years a tick, which is
   * one cycle per 314 000 ticks, or no season at all. That is the wrong default
   * for a world whose clock *can* carry a season: a deep-time run stepped down
   * to decades, or any world the player has put on the lived clock and then
   * released. Worlds on the "years" face hold their season deliberately and
   * return above — at 200 years a tick the equinox hold is the annual-mean
   * insolation, which is the honest thing to show — so this only reaches worlds
   * that have no hold and a tick short enough to mean something. */
  const dt = W.dtYr || 200;
  if (dt <= 1000) {
    W.season = (W.season || 0) + Math.min(dt, 10) * (Math.PI * 2) / 365.25;
    return true;
  }
  W.season = (W.season || 0) + 0.02 * Math.min(1, dt / 1e4);
  return true;
}

/** Skip calendar advance while watching lived time. */
export function shouldHoldCalendar(W, rule) {
  return isLivedClock(W) && !isPinnedEarth(rule);
}
