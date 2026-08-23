/** Time panel — single UI model for era (when) vs rate (speed).
 *  Era is an epoch spec (clock + gases + ice + landscape). Rate is years per tick. */

import { isModernEarth, mergeRunRule, modeLabel, isPinnedEarth } from './ruleMode.js';
import { TIME_RATES } from './god/observe.js';
import {
  ERA_PRESETS, availableEras, eraPatch, currentEraId, ruleForEra,
} from './epoch.js';
import { nearestSeasonHold, SEASON_HOLDS } from './clockFace.js';

export {
  ERA_PRESETS, availableEras, eraPatch, currentEraId, ruleForEra,
  isModernEarth, mergeRunRule,
};

const LIVED_SKY_RATES = [0.5, 1, 2, 4];
const LIVED_DAY_RATES = [0.5, 1, 2, 4];

function nearestHoldFromDeg(deg) {
  let best = SEASON_HOLDS[0], dBest = 999;
  for (const h of SEASON_HOLDS) {
    const d = Math.min(Math.abs(deg - h.deg), 360 - Math.abs(deg - h.deg));
    if (d < dBest) { dBest = d; best = h; }
  }
  return best;
}

/** Snapshot for the corner time ribbon. */
export function timePanelState(W, S = {}) {
  const rule = W.rule || {};
  const face = W.clockFace || 'years';
  const winter = W.dark?.winter || 0;
  const shade = W._warShade || 0;
  const seasonDeg = (((W.season || 0) * 180 / Math.PI) % 360 + 360) % 360;
  const seasonName = seasonDeg < 45 || seasonDeg >= 315 ? 'Mar'
    : seasonDeg < 135 ? 'Jun'
      : seasonDeg < 225 ? 'Sep' : 'Dec';
  const calendarHeld = face === 'now';
  const livedRate = W.livedRate ?? 1;
  const livedDayRate = W.livedDayRate ?? 1;
  const seasonHoldId = nearestSeasonHold(W).id;
  const livedSeasonHoldId = face === 'now' ? nearestHoldFromDeg(seasonDeg).id : seasonHoldId;
  /* Holocene Earth clamps ticks > 100 yr (see setTimeRate) — grey those out so
     the menu doesn't look broken when kyr/Myr bounce back to 10 yr. */
  const modern = isModernEarth(rule);
  const rates = TIME_RATES.map((r) => {
    const blocked = modern && r.dtYr != null && r.dtYr > 200;
    return {
      ...r,
      disabled: blocked,
      title: blocked
        ? 'Holocene caps at 100 yr/tick — open an older era for kyr / Myr'
        : undefined,
    };
  });
  return {
    mode: modeLabel(rule),
    eraId: currentEraId(rule) || W._epoch?.id || 'present',
    eras: availableEras(rule),
    rates,
    rateCapNote: modern ? 'Holocene · max 100 yr/tick' : null,
    rateId: W.timeRateId || 'auto',
    paused: !!S.paused,
    ff: !!W.fastForward,
    clockFace: face,
    seasonHoldId,
    livedSeasonHoldId,
    lived: face === 'now',
    lifeSpeed: W.lifeSpeed || 1,
    dtBio: W.dtBio || null,
    bioGen: W.bioGen || 0,
    calendarHeld,
    livedLabel: face === 'now' ? `${seasonName} · tick ${W._tickIndex | 0}` : null,
    seasonDeg,
    livedRate,
    livedDayRate,
    livedSkyRates: LIVED_SKY_RATES,
    livedDayRates: LIVED_DAY_RATES,
    winterHint: winter > 0.12
      ? `nuclear winter ${(winter * 100) | 0}%${shade > 0.02 ? ` · −${(shade * 100) | 0}% sun` : ''}`
      : (shade > 0.04 ? `soot −${(shade * 100) | 0}% sun` : ''),
  };
}
