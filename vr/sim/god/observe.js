/** Watching rather than acting — time UI, bookmarks, let-it-run.
 *  Backlog obs 126–137. */

import { W } from '../../world.js';
import { formatAge, adaptiveTickYears } from '../time.js';

/** Years advanced per simulation tick. Adaptive follows geologic era. */
export const TIME_RATES = [
  { id: 'auto', label: 'Adaptive', dtYr: null },
  { id: 'season', label: '1 yr', dtYr: 1 },
  { id: 'decade', label: '10 yr', dtYr: 10 },
  { id: 'century', label: '100 yr', dtYr: 100 },
  { id: 'kyr', label: '1 kyr', dtYr: 1e3 },
  { id: '10kyr', label: '10 kyr', dtYr: 1e4 },
  { id: '100kyr', label: '100 kyr', dtYr: 1e5 },
  { id: 'myr', label: '1 Myr', dtYr: 1e6 },
  { id: '10myr', label: '10 Myr', dtYr: 1e7 },
];

const FIXED_RATES = TIME_RATES.filter((r) => r.dtYr != null);

export function formatTickYears(dtYr) {
  const dt = Math.max(0, +dtYr || 0);
  if (dt >= 1e6) {
    const v = dt / 1e6;
    return `${v >= 10 || Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)} Myr/tick`;
  }
  if (dt >= 1e3) {
    const v = dt / 1e3;
    return `${v >= 10 || Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)} kyr/tick`;
  }
  if (dt >= 1) return `${dt | 0} yr/tick`;
  if (dt > 0) return `${dt.toFixed(2)} yr/tick`;
  return '—';
}

export function setTimeRate(id) {
  const r = TIME_RATES.find((x) => x.id === id) || TIME_RATES[0];
  W.timeRateId = r.id;
  W.fixedDtYr = r.dtYr;
  if (r.dtYr != null) W.dtYr = r.dtYr;
  else W.dtYr = adaptiveTickYears(W.ageYr || 0, {});
  return r;
}

/**
 * Step the clock. dir > 0 → more years/tick (faster deep time);
 * dir < 0 → fewer years/tick (slower). Past the fast end returns to Adaptive;
 * the slow end clamps at 1 yr.
 */
export function cycleTimeRate(dir = 1) {
  const id = W.timeRateId || 'auto';
  const cur = TIME_RATES.find((x) => x.id === id);
  const step = dir < 0 ? -1 : 1;

  if (!cur || cur.dtYr == null) {
    const dt = W.dtYr || adaptiveTickYears(W.ageYr || 0, {});
    if (step > 0) {
      const next = FIXED_RATES.find((r) => r.dtYr > dt * 1.01);
      return setTimeRate((next || FIXED_RATES[FIXED_RATES.length - 1]).id);
    }
    const prev = [...FIXED_RATES].reverse().find((r) => r.dtYr < dt * 0.99);
    return setTimeRate((prev || FIXED_RATES[0]).id);
  }

  const i = FIXED_RATES.findIndex((r) => r.id === id);
  const ni = i + step;
  if (ni < 0) return setTimeRate(FIXED_RATES[0].id);
  if (ni >= FIXED_RATES.length) return setTimeRate('auto');
  return setTimeRate(FIXED_RATES[ni].id);
}

/** Snapshot for the ribbon / dock — rate name + effective tick length. */
export function timeClockInfo(Wref = W) {
  const r = TIME_RATES.find((x) => x.id === (Wref.timeRateId || 'auto')) || TIME_RATES[0];
  const dt = Wref.dtYr != null
    ? Wref.dtYr
    : (r.dtYr != null ? r.dtYr : adaptiveTickYears(Wref.ageYr || 0, {}));
  return { id: r.id, rate: r.label, dt: formatTickYears(dt), dtYr: dt };
}

export function initObserve(W) {
  W.bookmarks = W.bookmarks || [];
  W.letItRun = false;
  W.fastForward = false;
  W.stopOnAnomaly = true;
  W.ambientMode = false;
  W.gaiaLog = W.gaiaLog || [];
  W.timeRateId = W.timeRateId || 'auto';
  if (W.fixedDtYr === undefined) {
    const r = TIME_RATES.find((x) => x.id === W.timeRateId) || TIME_RATES[0];
    W.fixedDtYr = r.dtYr;
  }
}

/** Fast-forward stops at anomalies. Item 127. */
export function shouldHaltFF(W) {
  if (!W.fastForward || !W.stopOnAnomaly) return false;
  // New moment
  for (const m of Object.values(W.moments || {})) {
    if (m && !m._ffSeen) {
      m._ffSeen = true;
      return { reason: 'moment', label: m.label };
    }
  }
  if (W.state !== W._ffState) {
    const prev = W._ffState;
    W._ffState = W.state;
    if (prev) return { reason: 'state', label: `${prev} → ${W.state}` };
  }
  if ((W.tree?.extinctions?.length || 0) > (W._ffExt || 0)) {
    W._ffExt = W.tree.extinctions.length;
    const last = W.tree.extinctions[W.tree.extinctions.length - 1];
    return { reason: 'extinction', label: last?.name || 'extinction' };
  }
  return false;
}

/** Bookmark current state metadata (not full snapshot). Item 133. */
export function addBookmark(label = '') {
  const b = {
    id: Date.now(),
    label: label || formatAge(W.ageYr),
    ageYr: W.ageYr,
    year: W.year,
    seed: W.seed,
    state: W.state,
    meanLife: W.meanLife,
    meanTemp: W.meanTemp,
    camera: null,
  };
  W.bookmarks = W.bookmarks || [];
  W.bookmarks.push(b);
  if (W.bookmarks.length > 40) W.bookmarks.shift();
  return b;
}

/** Autopilot as character. Item 129. */
export function gaiaPolicyTick(W, log) {
  if (!W.autopilot) return;
  const acts = [];
  if (W.meanTemp < 0.35) {
    W.solar = Math.min(1.4, W.solar + 0.002);
    acts.push('raised solar — too cold');
  }
  if (W.meanTemp > 0.85) {
    W.solar = Math.max(0.5, W.solar - 0.002);
    acts.push('lowered solar — too hot');
  }
  if (W.gases.CO2 < 0.005 && W.meanTemp < 0.4) {
    W.gases.CO2 += 0.0005;
    acts.push('injected CO₂ — greenhouse thin');
  }
  if (W.gases.CO2 > 0.15 && W.meanTemp > 0.7) {
    W.gases.CO2 *= 0.998;
    acts.push('drew down CO₂ — greenhouse thick');
  }
  if (acts.length) {
    W.gaiaLog = W.gaiaLog || [];
    W.gaiaLog.push({ t: W.ageYr, acts });
    if (W.gaiaLog.length > 60) W.gaiaLog.shift();
    if (log && acts[0]) log(W.year, 'gaia', 0, 1, `Gaia: ${acts[0]}`);
  }
}

/** Notification threshold moves with clock. Item 135. */
export function noticeThreshold(W) {
  const dt = W.dtYr || 200;
  if (dt > 1e6) return 'high'; // almost everything is an event
  if (dt > 1e4) return 'med';
  return 'low';
}

export function setLetItRun(on) {
  W.letItRun = !!on;
  W.ambientMode = !!on;
}
