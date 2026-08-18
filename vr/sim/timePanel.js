/** Time panel — single UI model for era (when) vs rate (speed).
 *  Era = deepTime + startAgeGa (regenerates world).
 *  Rate = years per tick (W.fixedDtYr / timeRateId). */

import { isModernEarth, mergeRunRule, modeLabel } from './ruleMode.js';
import { TIME_RATES } from './god/observe.js';

/** Earth history presets — each regenerates with mergeRunRule. */
export const ERA_PRESETS = [
  { id: 'present', label: 'Present', deepTime: false, startAgeGa: undefined,
    tip: 'Holocene Earth. Clock stays in years; modern biosphere owns life.' },
  { id: 'origin', label: 'From origin', deepTime: true, startAgeGa: 0,
    tip: 'Hadean start. Regenerates the world; Adaptive clock runs in Myr and slows toward now.' },
  { id: 'cambrian', label: 'Cambrian', deepTime: true, startAgeGa: 0.541,
    tip: 'Start ~541 Ma. Animals possible; oxygen already high enough for that question.' },
  { id: 'permian', label: 'Permian', deepTime: true, startAgeGa: 0.252,
    tip: 'Start ~252 Ma — end-Permian doorstep. Continents assembled, climate stressed.' },
  { id: '10ka', label: '10 ka ago', deepTime: true, startAgeGa: 0.00001,
    tip: 'Younger Dryas-ish. Deep-time machinery on, but the clock is almost Holocene.' },
];

export function currentEraId(rule) {
  if (!rule?.earthLike) return null;
  if (isModernEarth(rule)) return 'present';
  if (!rule.deepTime) return 'present';
  const ga = rule.startAgeGa;
  if (ga == null || ga === 0) return 'origin';
  for (const e of ERA_PRESETS) {
    if (e.startAgeGa != null && Math.abs(e.startAgeGa - ga) < 1e-5) return e.id;
  }
  return 'origin';
}

export function eraPatch(eraId) {
  const e = ERA_PRESETS.find((x) => x.id === eraId);
  if (!e) return null;
  return { deepTime: e.deepTime, startAgeGa: e.startAgeGa };
}

export function availableEras(rule) {
  return rule?.earthLike ? ERA_PRESETS : [];
}

/** Snapshot for the corner time ribbon. */
export function timePanelState(W, S = {}) {
  const rule = W.rule || {};
  return {
    mode: modeLabel(rule),
    eraId: currentEraId(rule),
    eras: availableEras(rule),
    rates: TIME_RATES,
    rateId: W.timeRateId || 'auto',
    paused: !!S.paused,
    ff: !!W.fastForward,
  };
}

/** Build merged rule for an era change (caller runs generate). */
export function ruleForEra(baseRule, eraId) {
  const patch = eraPatch(eraId);
  if (!patch) return mergeRunRule(baseRule);
  return mergeRunRule(baseRule, patch);
}
