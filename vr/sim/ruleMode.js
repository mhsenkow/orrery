/** Single source for simulation mode — avoids earthLike / deepTime / catalogue fighting. */

/** Deep clone a ruleset for one generate() — never mutate RULESETS literals. */
export function cloneRuleForRun(rule) {
  if (!rule) return {};
  const out = {
    ...rule,
    gases: { ...(rule.gases || {}) },
    interior: rule.interior ? { ...rule.interior } : undefined,
    atmo: rule.atmo?.slice?.() || rule.atmo,
    sky: rule.sky?.slice?.() || rule.sky,
  };
  if (rule.star) out.star = { ...rule.star };
  if (rule.moon) out.moon = { ...rule.moon };
  if (rule.worldRecord) out.worldRecord = { ...rule.worldRecord };
  return out;
}

/** Holocene calibration Earth (present-day gases, seeded biomes, no invention rolls). */
export function isModernEarth(rule) {
  return !!(rule?.earthLike && !rule?.deepTime && !rule?.catalogueId);
}

/** Earth from Hadean forward — reducing air, contingent transitions. */
export function isDeepTimeEarth(rule) {
  return !!(rule?.earthLike && rule?.deepTime);
}

/** Catalogue body or synthetic exo — not the calibration Earth shortcut path. */
export function isAlienWorld(rule) {
  return !rule?.earthLike || !!rule?.catalogueId;
}

/** Short label for HUD / mode strip. */
export function modeLabel(rule) {
  if (isModernEarth(rule)) return 'Holocene Earth';
  if (isDeepTimeEarth(rule)) return 'Deep time';
  if (rule?.catalogueId) return 'Catalogue';
  if (rule?.daisyworld) return 'Daisyworld';
  if (rule?.airless) return 'Airless';
  return rule?.name || 'Sandbox';
}

/** Merge player/session flags when switching ruleset without dropping mode. */
export function mergeRunRule(baseRule, session = {}) {
  const rule = cloneRuleForRun(baseRule);
  if (session.deepTime != null) rule.deepTime = !!session.deepTime;
  if (session.startAgeGa != null) rule.startAgeGa = session.startAgeGa;
  if (session.fixedDtYr != null) rule.fixedDtYr = session.fixedDtYr;
  if (session.tutorial != null) rule.tutorial = !!session.tutorial;
  return rule;
}
