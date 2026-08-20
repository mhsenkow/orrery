/** Time panel — single UI model for era (when) vs rate (speed).
 *  Era is an epoch spec (clock + gases + ice + landscape). Rate is years per tick. */

import { isModernEarth, mergeRunRule, modeLabel } from './ruleMode.js';
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
  };
}
