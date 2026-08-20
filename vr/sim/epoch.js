/** Epochs as startable worlds — clock, gases, ice, sea, landscape, palette.
 *  Data lives in vr/data/worlds/epochs.json. Present Earth is a no-op so golden holds. */

import { clamp } from '../math.js';
import { NC, DIR } from '../sphere.js';
import { isModernEarth, mergeRunRule } from './ruleMode.js';
import { maToAgeYr, CAI_AGE_YR } from './time.js';
import { planetKind } from './planetKind.js';
import { createCarbonState } from './carbon.js';
import { EPOCHS, EPOCH_BY_ID } from './epochTable.js';

export { EPOCHS, EPOCH_BY_ID };

function startAgeGaOf(spec) {
  if (!spec || spec.startMaBP == null) return undefined;
  if (!spec.deepTime) return undefined;
  return maToAgeYr(spec.startMaBP) / 1e9;
}

function toPreset(spec) {
  return {
    id: spec.id,
    label: spec.name,
    deepTime: spec.deepTime,
    startAgeGa: startAgeGaOf(spec),
    startMaBP: spec.startMaBP,
    tip: spec.tip || spec.why,
    world: spec.world,
  };
}

/** Earth history rows for the ribbon — includes origin / Cambrian / Permian / 10 ka. */
export const ERA_PRESETS = EPOCHS.filter((e) => e.world === 'earth').map(toPreset);

export function epochById(id) {
  return EPOCH_BY_ID[id] || null;
}

/** Which body's epoch table this ruleset should see. */
export function epochWorld(rule) {
  if (!rule) return null;
  if (rule.earthLike) return 'earth';
  const kind = rule._planetKind || planetKind(rule);
  if (kind === 'venus' || /venus/i.test(rule.name || '') || rule.id === 'venus') return 'venus';
  if (kind === 'mars' || /\bmars\b/i.test(rule.name || '') || rule.id === 'ares') return 'mars';
  return null;
}

export function availableEras(rule) {
  const world = epochWorld(rule);
  if (!world) return [];
  return EPOCHS.filter((e) => e.world === world).map(toPreset);
}

export function eraPatch(eraId) {
  const spec = epochById(eraId);
  if (!spec) return null;
  const patch = {
    deepTime: spec.deepTime,
    startAgeGa: startAgeGaOf(spec),
    epochId: spec.id,
    startMaBP: spec.startMaBP,
  };
  if (spec.landscape) patch.landscape = spec.landscape;
  if (spec.targetLandFrac != null) patch.targetLandFrac = spec.targetLandFrac;
  return patch;
}

export function currentEraId(rule) {
  if (rule?.epochId && EPOCH_BY_ID[rule.epochId]) return rule.epochId;
  const world = epochWorld(rule);
  if (!world) return null;
  if (world === 'earth' && isModernEarth(rule)) return 'present';
  if (world === 'venus' && !rule.deepTime) return 'venus-now';
  if (world === 'mars' && !rule.deepTime) return 'mars-now';
  if (world === 'earth' && !rule.deepTime) return 'present';
  const ga = rule.startAgeGa;
  if (world === 'earth' && (ga == null || ga === 0)) return 'origin';
  const rows = EPOCHS.filter((e) => e.world === world);
  for (const e of rows) {
    const want = startAgeGaOf(e);
    if (want != null && ga != null && Math.abs(want - ga) < 1e-4) return e.id;
  }
  return rows.find((e) => e.deepTime && e.startMaBP >= 4000)?.id || rows[0]?.id || null;
}

export function ruleForEra(baseRule, eraId) {
  const patch = eraPatch(eraId);
  if (!patch) return mergeRunRule(baseRule);
  return mergeRunRule(baseRule, patch);
}

function isNoopEpoch(spec) {
  return spec && (spec.id === 'present' || spec.id === 'venus-now' || spec.id === 'mars-now');
}

/** Attach spec + flags. Atmosphere after gases init; surface after ice/sea. */
export function applyEpochAtGenerate(W, phase) {
  const rule = W.rule || {};
  const spec = epochById(rule.epochId) || epochById(currentEraId(rule));
  if (!spec) {
    W._epoch = null;
    return;
  }
  W._epoch = spec;
  W._epochStarted = !isNoopEpoch(spec);
  W._epochArrived = isNoopEpoch(spec) || isModernEarth(rule);

  if (phase === 'air' && spec.gases && !isNoopEpoch(spec)) {
    W.gases = { ...W.gases, ...spec.gases };
    W.carbon = createCarbonState(W.gases);
  }
  if (phase !== 'surface' || isNoopEpoch(spec)) return;

  if (spec.seaLevelDelta) {
    W.seaLevel = clamp((W.seaLevel || 0) + spec.seaLevelDelta, -0.55, 0.85);
    W._seaBase = W.seaLevel;
  }
  if (spec.moonDist != null && W.moon) W.moon.distance = spec.moonDist;
  if (spec.state) W.state = spec.state;
  if (spec.unlock && W.transitions) {
    for (const k of spec.unlock) W.transitions[k] = true;
  }
  applyIce(W, spec);
  if (spec.moistBoost) {
    for (let c = 0; c < NC; c++) {
      if (W.h[c] >= W.seaLevel) {
        W.moist[c] = Math.min(1, (W.moist[c] || 0) + spec.moistBoost);
      }
    }
  }
}

function applyIce(W, spec) {
  const boost = spec.iceBoost;
  if (boost == null) return;
  const lat0 = spec.iceLat ?? 0.45;
  for (let c = 0; c < NC; c++) {
    const lat = Math.abs(DIR[c * 3 + 1]);
    if (boost < 0) {
      const k = 1 + boost;
      W.ice[c] *= Math.max(0, k);
      if (W.iceLand) W.iceLand[c] *= Math.max(0, k);
      if (W.iceSea) W.iceSea[c] *= Math.max(0, k);
      continue;
    }
    if (spec.state === 'snowball' || lat >= lat0) {
      const ice = spec.state === 'snowball' ? boost : boost * clamp((lat - lat0) / 0.35, 0.15, 1);
      if (W.h[c] >= W.seaLevel) W.iceLand[c] = Math.max(W.iceLand[c] || 0, ice);
      else W.iceSea[c] = Math.max(W.iceSea[c] || 0, ice * 0.85);
      W.ice[c] = Math.max(W.iceLand[c] || 0, W.iceSea[c] || 0);
      if (spec.state === 'snowball') W.temp[c] = Math.min(W.temp[c], 0.28);
    }
  }
  if (spec.state === 'snowball') W.meanTemp = Math.min(W.meanTemp || 0.28, 0.28);
}

export function formatEpoch(W) {
  const spec = W._epoch;
  if (!spec || isNoopEpoch(spec)) return '';
  const how = W._epochArrived ? 'arrived' : (W._epochStarted ? 'started' : '');
  const tag = spec.tag && spec.tag !== 'measured' ? spec.tag : '';
  return [spec.name, how, tag].filter(Boolean).join(' · ');
}

export function epochAgeGa(spec) {
  return startAgeGaOf(spec);
}

export { CAI_AGE_YR };
