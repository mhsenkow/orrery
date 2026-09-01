/** First-ninety-seconds hooks: Vandal (acquire) and Gardener (return).
 *  See NEXT.md #1–#2. No lesson cards — one act, one place, one line. */

import { NC } from '../sphere.js';
import { ENT } from '../agents.js';
import { fireDanger, flammableAt } from './fire.js';
import { expected } from './report.js';

const VANDAL_KEY = 'orrery.vandal.v1';
const GARDEN_KEY = 'orrery.garden.v1';
const AUTOSAVE_KEY = 'orrery.autosave.v1';
const AUTOSAVE_PREV_KEY = 'orrery.autosave.prev.v1';
const AUTOSAVE_STAGING_KEY = 'orrery.autosave.staging.v1';

export function vandalDone() {
  try {
    return localStorage.getItem(VANDAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function markVandalDone() {
  try { localStorage.setItem(VANDAL_KEY, '1'); } catch { expected('ORR-EXPECTED-STORAGE', 'vandal done'); }
}

export function resetVandalDone() {
  try { localStorage.removeItem(VANDAL_KEY); } catch { expected('ORR-EXPECTED-STORAGE', 'vandal reset'); }
}

/** Best Strike target: driest flammable cell, else a land cell for a meteor. */
export function pickVandalTarget(W) {
  let best = -1;
  let bestD = 0;
  const step = Math.max(1, (NC / 1800) | 0);
  for (let c = 0; c < NC; c += step) {
    if (!flammableAt(W, c)) continue;
    const d = fireDanger(W, c);
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best >= 0 && bestD >= 0.08) {
    return {
      cell: best,
      tool: 'ignite',
      label: 'Light a fire',
      hint: 'Click the bright patch — smoke and animals will move.',
    };
  }
  let land = -1;
  let landH = -Infinity;
  for (let c = 0; c < NC; c += step) {
    if (W.h[c] <= W.seaLevel) continue;
    if (W.h[c] > landH) {
      landH = W.h[c];
      land = c;
    }
  }
  return {
    cell: land >= 0 ? land : 0,
    tool: 'meteor',
    label: 'Drop a rock',
    hint: 'Click the highlighted highland — watch the crater and dust.',
  };
}

function countHerds() {
  let herds = 0;
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (m && (m.kind === 7 || (m.herd | 0) > 0)) herds++;
  }
  return herds;
}

export function captureGarden(W) {
  return {
    seed: (W.landSeed ?? W.seed) >>> 0,
    ruleId: W.rule?.id || 'terra',
    worldName: W.worldName || W.rule?.name || 'world',
    landscape: W._landscape || W.rule?.landscape || '',
    meanLife: +(W.meanLife || 0).toFixed(4),
    meanTemp: +(W.meanTemp || 0).toFixed(4),
    iceFrac: +(W.iceFrac || 0).toFixed(4),
    builtFrac: +(W.builtFrac || 0).toFixed(4),
    cities: (W.cities?.length | 0),
    herds: countHerds(),
    ageYr: W.ageYr || 0,
    at: Date.now(),
  };
}

/** One-line named place change since `before`. Null if nothing legible moved. */
export function gardenDelta(before, after) {
  if (!before || !after) return null;
  const place = after.worldName || before.worldName || after.landscape || 'this world';
  const lines = [];
  const dIce = (after.iceFrac || 0) - (before.iceFrac || 0);
  if (dIce <= -0.008) lines.push('the ice line pulled back');
  else if (dIce >= 0.008) lines.push('ice took more of the disc');

  const dTown = (after.cities | 0) - (before.cities | 0);
  const dBuild = (after.builtFrac || 0) - (before.builtFrac || 0);
  if (dTown > 0) lines.push(dTown > 1 ? `towns grew (+${dTown})` : 'a town grew');
  else if (dBuild >= 0.02) lines.push('settlements spread along the coast');

  const dHerd = (after.herds | 0) - (before.herds | 0);
  if (dHerd >= 3) lines.push('a herd crossed the open ground');
  else if (dHerd <= -3) lines.push('the herds thinned');

  const dLife = (after.meanLife || 0) - (before.meanLife || 0);
  if (!lines.length && Math.abs(dLife) >= 0.015) {
    lines.push(dLife > 0 ? 'life thickened on the land' : 'life thinned on the land');
  }

  const dTemp = (after.meanTemp || 0) - (before.meanTemp || 0);
  if (!lines.length && Math.abs(dTemp) >= 0.02) {
    lines.push(dTemp > 0 ? 'the world ran warmer' : 'the world ran cooler');
  }

  if (!lines.length) return null;
  const s = lines[0];
  const body = s.charAt(0).toUpperCase() + s.slice(1);
  return `${body} on ${place}.`;
}

/** Wall-clock → sim ticks while away. Cap keeps reopen snappy. */
export function awayTicks(elapsedMs) {
  const ms = Math.max(0, elapsedMs | 0);
  return Math.min(90, Math.max(0, Math.floor(ms / 20000)));
}

export function saveGardenVisit(garden) {
  try {
    localStorage.setItem(GARDEN_KEY, JSON.stringify(garden));
  } catch { expected('ORR-EXPECTED-STORAGE', 'garden visit'); }
}

export function loadGardenVisit() {
  try {
    const raw = localStorage.getItem(GARDEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** I23/I24 — write staging → rotate previous → commit; keep one prior slot.
 *  I26 — quota / private-mode surfaces as a user-visible report. */
let _autosaveQuotaAt = 0;
let _autosavePaused = false;
let _autosaveWarned = false;

export function autosavePaused() {
  return _autosavePaused;
}

export function writeAutosave(payload) {
  if (_autosavePaused) return false;
  const commit = () => {
    const next = JSON.stringify(payload);
    localStorage.setItem(AUTOSAVE_STAGING_KEY, next);
    const cur = localStorage.getItem(AUTOSAVE_KEY);
    if (cur) localStorage.setItem(AUTOSAVE_PREV_KEY, cur);
    localStorage.setItem(AUTOSAVE_KEY, next);
    localStorage.removeItem(AUTOSAVE_STAGING_KEY);
  };
  try {
    commit();
    return true;
  } catch (e) {
    const msg = String(e?.name || e?.message || e);
    const quota = /quota|storage/i.test(msg);
    if (quota) {
      try {
        localStorage.removeItem(AUTOSAVE_PREV_KEY);
        localStorage.removeItem(AUTOSAVE_STAGING_KEY);
        localStorage.removeItem(AUTOSAVE_KEY);
        commit();
        return true;
      } catch { expected('ORR-EXPECTED-STORAGE', 'autosave retry'); }
      _autosavePaused = true;
      clearAutosave();
    }
    const now = Date.now();
    if (!_autosaveWarned && now - _autosaveQuotaAt > 120000) {
      _autosaveWarned = true;
      _autosaveQuotaAt = now;
      try {
        import('./report.js').then(({ report }) => {
          report(
            'degraded',
            quota ? 'ORR-SAVE-001' : 'ORR-SAVE-002',
            quota
              ? 'Storage full — export a save file; autosave paused.'
              : `Autosave failed (${msg}). Export a save if you need to keep this world.`,
            { silent: true, autosave: true },
          );
        }).catch(() => { void 0; });
      } catch { expected('ORR-EXPECTED-STORAGE', 'autosave report path'); }
    }
    return false;
  }
}

export function readAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
      || localStorage.getItem(AUTOSAVE_STAGING_KEY)
      || localStorage.getItem(AUTOSAVE_PREV_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readAutosavePrev() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_PREV_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem(AUTOSAVE_PREV_KEY);
    localStorage.removeItem(AUTOSAVE_STAGING_KEY);
  } catch { expected('ORR-EXPECTED-STORAGE', 'clear autosave'); }
}
