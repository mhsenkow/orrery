/** Time panel — single UI model for era (when) vs rate (speed).
 *  Era is an epoch spec (clock + gases + ice + landscape). Rate is years per tick. */

import { isModernEarth, mergeRunRule, modeLabel, isPinnedEarth } from './ruleMode.js';
import { TIME_RATES } from './god/observe.js';
import {
  ERA_PRESETS, availableEras, eraPatch, currentEraId, ruleForEra,
} from './epoch.js';
import { nearestSeasonHold } from './clockFace.js';

export {
  ERA_PRESETS, availableEras, eraPatch, currentEraId, ruleForEra,
  isModernEarth, mergeRunRule,
};

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
  const calendarHeld = isPinnedEarth(rule) || (face === 'now' && !rule.thrive && !!rule.earthLike);
  return {
    mode: modeLabel(rule),
    eraId: currentEraId(rule) || W._epoch?.id || 'present',
    eras: availableEras(rule),
    rates: TIME_RATES,
    rateId: W.timeRateId || 'auto',
    paused: !!S.paused,
    ff: !!W.fastForward,
    clockFace: face,
    seasonHoldId: nearestSeasonHold(W).id,
    lived: face === 'now',
    lifeSpeed: W.lifeSpeed || 1,
    dtBio: W.dtBio || null,
    bioGen: W.bioGen || 0,
    calendarHeld,
    livedLabel: face === 'now' ? `${seasonName} · tick ${W._tickIndex | 0}` : null,
    winterHint: winter > 0.12
      ? `nuclear winter ${(winter * 100) | 0}%${shade > 0.02 ? ` · −${(shade * 100) | 0}% sun` : ''}`
      : (shade > 0.04 ? `soot −${(shade * 100) | 0}% sun` : ''),
  };
}
