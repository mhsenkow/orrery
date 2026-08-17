/** Planetary interior — core fraction, heat, dynamo → magnetosphere & tectonics.
 *  Catalogue / ruleset bodies get matched profiles; magnets are no longer a free scalar. */

import { clamp } from '../math.js';

/**
 * Interior state on W / rule:
 *   coreMassFrac   0–1 of planet mass in metal core
 *   coreRadiusFrac 0–1 of planet radius (approx)
 *   heatFlow       0–2 mantle heat (Earth ≈ 1)
 *   conductivity   0–2 liquid-core proxy for dynamo
 *   lidMode        'mobile' | 'stagnant' | 'episodic' | 'ice' | 'none'
 *   dynamo         derived 0–2 field strength
 */

/** Named Solar-System / archetype interiors. */
export const INTERIORS = {
  earth: {
    coreMassFrac: 0.32, coreRadiusFrac: 0.55, heatFlow: 1.0, conductivity: 1.0,
    lidMode: 'mobile', note: 'Fe–Ni core · active dynamo · mobile-lid plates',
  },
  moon: {
    coreMassFrac: 0.02, coreRadiusFrac: 0.20, heatFlow: 0.08, conductivity: 0.05,
    lidMode: 'stagnant', note: 'Tiny core · dynamo dead · frozen lithosphere',
  },
  mars: {
    coreMassFrac: 0.18, coreRadiusFrac: 0.45, heatFlow: 0.25, conductivity: 0.15,
    lidMode: 'stagnant', note: 'Partly solid core · no global dynamo · stagnant lid',
  },
  mercury: {
    coreMassFrac: 0.70, coreRadiusFrac: 0.82, heatFlow: 0.35, conductivity: 0.55,
    lidMode: 'stagnant', note: 'Huge iron core · weak dynamo · cratered shell',
  },
  venus: {
    coreMassFrac: 0.30, coreRadiusFrac: 0.52, heatFlow: 0.9, conductivity: 0.4,
    lidMode: 'episodic', note: 'Earth-mass core · slow spin kills dynamo · episodic lid',
  },
  ganymede: {
    coreMassFrac: 0.10, coreRadiusFrac: 0.30, heatFlow: 0.2, conductivity: 0.7,
    lidMode: 'ice', note: 'Small Fe core · intrinsic field · ice–ocean stack',
  },
  icy: {
    coreMassFrac: 0.04, coreRadiusFrac: 0.18, heatFlow: 0.12, conductivity: 0.1,
    lidMode: 'ice', note: 'Rock kernel under ice · little or no dynamo',
  },
  io: {
    coreMassFrac: 0.20, coreRadiusFrac: 0.40, heatFlow: 2.2, conductivity: 0.3,
    lidMode: 'mobile', note: 'Tidal heat dominates · magma ocean proxy · weak field',
  },
  gas: {
    coreMassFrac: 0.05, coreRadiusFrac: 0.15, heatFlow: 1.6, conductivity: 1.8,
    lidMode: 'none', note: 'Metallic-H dynamo · no rocky plates',
  },
  arid: {
    coreMassFrac: 0.22, coreRadiusFrac: 0.42, heatFlow: 0.45, conductivity: 0.25,
    lidMode: 'stagnant', note: 'Cooling rock world · fading field',
  },
  vermis: {
    coreMassFrac: 0.28, coreRadiusFrac: 0.48, heatFlow: 1.1, conductivity: 0.7,
    lidMode: 'mobile', note: 'Silicate mobile lid · modest dynamo',
  },
};

/** Match a ruleset / catalogue name to an interior profile. */
export function interiorProfileFor(rule, item = null) {
  if (rule?.earthLike && !rule?.deepTime) return { ...INTERIORS.earth };
  if (rule?.interior?.derived || (rule?.worldRecord?.interior && rule.gravityLocked && !rule.earthLike)) {
    return { ...rule.interior };
  }
  const name = `${item?.b || ''} ${item?.t || ''} ${rule?.id || ''} ${rule?.name || ''}`.toLowerCase();
  const needs = new Set(item?.p || rule?.needs || []);

  if (rule?.earthLike && !rule?.deepTime) return { ...INTERIORS.earth };
  if (rule?.id === 'terra' || /\bearth\b/.test(name)) return { ...INTERIORS.earth };
  if (rule?.id === 'selene' || /\bmoon\b|selene|mercury/.test(name)) {
    if (name.includes('mercury')) return { ...INTERIORS.mercury };
    return { ...INTERIORS.moon };
  }
  if (rule?.id === 'ares' || name.includes('mars')) return { ...INTERIORS.mars };
  if (name.includes('venus')) return { ...INTERIORS.venus };
  if (name.includes('ganymede')) return { ...INTERIORS.ganymede };
  if (/\bio\b/.test(name) && !name.includes('ion')) return { ...INTERIORS.io };
  if (needs.has('iceshell') || rule?.iceShell || /europa|enceladus|titan|callisto|triton|pluto/.test(name)) {
    return { ...INTERIORS.icy };
  }
  if (needs.has('airless') || rule?.airless) return { ...INTERIORS.moon };
  if (/jupiter|saturn|uranus|neptune|giant|hot.?jup/.test(name) || item?.c === 'giant') {
    return { ...INTERIORS.gas };
  }
  if (rule?.id === 'vermis') return { ...INTERIORS.vermis };
  if (rule?.id === 'ares') return { ...INTERIORS.mars };
  if (rule?.daisyworld) return { ...INTERIORS.earth, heatFlow: 0.5, note: 'Tutorial world · mild interior' };

  const g = rule?.gravity || 1;
  const spin = Math.abs(rule?.rotationPeriod || 1);
  const coreMass = clamp(0.12 + g * 0.12 + (spin < 0.5 ? 0.05 : 0), 0.05, 0.65);
  const heat = clamp(0.3 + g * 0.4 + (spin < 2 ? 0.2 : 0), 0.1, 1.8);
  const cond = clamp(0.2 + coreMass * 0.8 * (spin < 10 ? 1 : 0.2), 0.05, 1.5);
  const lid = heat > 0.55 && spin < 40 ? 'mobile' : 'stagnant';
  return {
    coreMassFrac: coreMass,
    coreRadiusFrac: clamp(0.25 + coreMass * 0.7, 0.15, 0.85),
    heatFlow: heat,
    conductivity: cond,
    lidMode: lid,
    note: `Derived rocky interior · ${lid} lid`,
  };
}

/**
 * Dynamo scaling — strong when large conducting core + heat + not-too-slow spin.
 */
export function dynamoFromInterior(interior, rotationPeriod = 1) {
  const spin = Math.abs(rotationPeriod) || 1;
  const spinFactor = spin < 0.15
    ? 0.15
    : spin > 40
      ? clamp(8 / spin, 0.02, 0.25)
      : clamp(1.2 / (0.4 + spin * 0.6), 0.08, 1.35);
  const raw = interior.coreRadiusFrac * interior.conductivity
    * Math.sqrt(Math.max(0.05, interior.heatFlow)) * spinFactor;
  if (interior.lidMode === 'none') {
    return clamp(raw * 1.4 + 0.6, 0.4, 2);
  }
  if (interior.lidMode === 'ice' && interior.conductivity < 0.3) {
    return clamp(raw * 0.35, 0, 0.35);
  }
  return clamp(raw * 1.15, 0, 2);
}

/** How lively plates / volcanoes should be. */
export function tectonicVigor(interior) {
  if (interior.lidMode === 'none') return 0;
  if (interior.lidMode === 'stagnant') return clamp(interior.heatFlow * 0.15, 0.02, 0.25);
  if (interior.lidMode === 'episodic') return clamp(interior.heatFlow * 0.45, 0.15, 0.7);
  if (interior.lidMode === 'ice') return clamp(interior.heatFlow * 0.2, 0.05, 0.35);
  return clamp(0.35 + interior.heatFlow * 0.55, 0.3, 1.6);
}

/** Attach / refresh interior on world + sync magnetosphere. */
export function applyInterior(W, rule = W.rule, item = null) {
  const base = rule?.interior
    ? { ...INTERIORS.earth, ...rule.interior }
    : interiorProfileFor(rule, item);
  if (rule?.coreMassFrac != null) base.coreMassFrac = rule.coreMassFrac;
  if (rule?.coreRadiusFrac != null) base.coreRadiusFrac = rule.coreRadiusFrac;
  if (rule?.heatFlow != null) base.heatFlow = rule.heatFlow;
  if (rule?.lidMode) base.lidMode = rule.lidMode;

  const spin = W.rotationPeriod || rule?.rotationPeriod || 1;
  const dynamo = rule?.magnetosphereLocked
    ? (rule.magnetosphere ?? dynamoFromInterior(base, spin))
    : dynamoFromInterior(base, spin);

  W.interior = {
    ...base,
    dynamo,
    vigor: tectonicVigor(base),
  };
  W.magnetosphere = dynamo;
  W.magTilt = W.magTilt ?? (0.08 + base.coreMassFrac * 0.15);
  if (rule) {
    rule.magnetosphere = dynamo;
    rule.interior = { ...base };
  }
  return W.interior;
}

/** Slow secular cooling — weakens dynamo over deep time. */
export function interiorTick(W, log = null) {
  const I = W.interior;
  if (!I) return;
  const dt = Math.min(1, (W.dtYr || 200) / 1e8);
  if (dt <= 0) return;
  const cool = I.lidMode === 'stagnant' ? 0.015 : 0.006;
  I.heatFlow = clamp(I.heatFlow * (1 - cool * dt), 0.05, 2.5);
  const next = dynamoFromInterior(I, W.rotationPeriod || 1);
  if (Math.abs(next - I.dynamo) > 0.04 && log && I.dynamo > 0.2 && next < 0.15) {
    log(W.year, 'core', 0, next, 'Dynamo fading');
  }
  I.dynamo = next;
  I.vigor = tectonicVigor(I);
  W.magnetosphere = next;
  if (W.rule) W.rule.magnetosphere = next;
}

/** Panel snapshot. */
export function coreDeskSnapshot(W) {
  const I = W.interior || applyInterior(W);
  return {
    ...I,
    magnetosphere: W.magnetosphere ?? I.dynamo,
    rotationPeriod: W.rotationPeriod || 1,
    gravity: W.rule?.gravity || 1,
    aurora: (W.magnetosphere || 0) > 0.15,
    escapeRisk: (W.rule?.gravity || 1) < 0.5 || (W.magnetosphere || 0) < 0.2,
    note: I.note || '—',
  };
}
