/** Extinction, recovery, contingency.
 *  Backlog items 86–97. */

import { clamp } from '../math.js';
import { NC, NBR, DIR, AREA } from '../sphere.js';
import { TRAITS, nodeOf, removeLiving } from './evolve.js';
import { recordFossil } from './meta.js';
import { isDeepTimeEarth } from './ruleMode.js';
import { steriliseOrigin } from './origin.js';

export function extinctionTick(W, chronLog) {
  if (W.rule.daisyworld || !W.tree) return;

  const dt = Math.min(2, (W.dtYr || 200) / 1e6);
  const living = W.tree.living.length;
  const prev = W._prevLiving ?? living;
  const lost = Math.max(0, prev - living);
  const rate = living > 0 ? lost / Math.max(1, prev) / Math.max(dt, 1e-6) : 0;

  // Background vs mass. Item 86.
  W.tree.backgroundRate = W.tree.backgroundRate * 0.95 + rate * 0.05;
  const isMass = rate > W.tree.backgroundRate * 5 + 0.05 && lost >= 2;
  W.tree.massRate = isMass ? rate : W.tree.massRate * 0.9;

  if (isMass && !W._inMassExt) {
    W._inMassExt = true;
    W._extinctionPulse = (W._extinctionPulse || 0) + 1;
    const mechanism = diagnoseKill(W);
    W._lastExtinctionName = mechanism.name;
    W._lastKill = mechanism;
    W._recoveryBoost = 1.5;
    W._recoveryYears = 0;
    if (chronLog) {
      chronLog(W.year, 'massext', 0, rate, `${mechanism.name}: ${mechanism.detail}`);
    }
  } else if (W._inMassExt && rate < W.tree.backgroundRate * 2) {
    W._inMassExt = false;
  }

  // Named Earth-analogue kill chains when conditions match
  maybeNamedExtinctions(W, chronLog);

  // Recovery takes Myr. Item 93.
  if (W._recoveryBoost > 0.1) {
    W._recoveryYears = (W._recoveryYears || 0) + (W.dtYr || 0);
    // Truncate trophic structure during recovery
    if (W.trophic) {
      W.trophic.carn *= 0.92;
      W.trophic.herb *= 0.97;
    }
    if (W._recoveryYears > 5e6) {
      W._recoveryBoost *= 0.5;
      W._recoveryYears = 0;
    }
  }

  // Disaster taxa — high-repro generalists bloom. Item 94.
  if (W._recoveryBoost > 0.5 && W.tree.living.length) {
    for (const id of W.tree.living) {
      const n = nodeOf(W.tree, id);
      if (!n) continue;
      if (n.traits[6] > 0.55 && n.traits[4] < 0.35) { // high repro, small
        n._disaster = true;
        for (const c of n.cells) {
          if (W.life[c] < 0.5) W.life[c] = Math.min(0.7, W.life[c] + 0.05);
        }
      }
    }
  }

  // Extinction debt — populations below MVP doomed. Item 97.
  // Deep-time Archean runs use guild biomass; MVP debt is not calibrated there yet.
  if (!isDeepTimeEarth(W.rule)) {
    for (const id of [...W.tree.living]) {
      const n = nodeOf(W.tree, id);
      if (!n) continue;
      if (n.pop > 0 && n.pop < 2) {
        n._debt = (n._debt || 0) + dt;
        if (n._debt > 2) {
          n.death = W.ageYr;
          n.extReason = 'extinction debt';
          removeLiving(W.tree, id);
          W.tree.extinctions.push({ id, name: n.name, t: W.ageYr, reason: 'debt' });
          for (const c of n.cells || []) recordFossil(W, n, c, 'debt');
          if (chronLog) chronLog(W.year, 'extinction', 0, 1, `Debt: ${n.name}`);
        }
      } else n._debt = 0;
    }
  }

  W._prevLiving = W.tree.living.length;
}

function diagnoseKill(W) {
  const g = W.gases;
  if (g.O2 > 0.02 && W._oxEvent && (W.guilds?.methanogen || 0) > 0.05) {
    return { name: 'Great Oxidation kill', detail: 'O₂ poison to obligate anaerobes', key: 'thermal' };
  }
  if (W.state === 'snowball' || W.iceFrac > 0.7) {
    return { name: 'Glacial extinction', detail: 'shelf habitat loss / ice', key: 'habitat' };
  }
  if (W.carbon && W.carbon.surfacePH < 7.5) {
    return { name: 'Ocean acidification', detail: `pH ${W.carbon.surfacePH.toFixed(2)}`, key: 'acid' };
  }
  if (W.meanTemp > 0.95) {
    return { name: 'Thermal kill', detail: `meanT ${W.meanTemp.toFixed(2)}`, key: 'thermal' };
  }
  if (g.O2 < 0.01 && (W.transitions?.aerobicRespiration)) {
    return { name: 'Anoxic kill', detail: 'hypoxia', key: 'hypoxic' };
  }
  if (g.dust > 0.15 || g.sulphate > 0.08) {
    return { name: 'Impact / volcanic winter', detail: 'insolation collapse', key: 'starvation' };
  }
  return { name: 'Biosphere collapse', detail: 'multiple stressors', key: 'unknown' };
}

function maybeNamedExtinctions(W, chronLog) {
  const ma = (4.567e9 - W.ageYr) / 1e6;
  if (!W._namedExt) W._namedExt = {};

  // GOE selective kill. Item 87.
  if (W.gases.O2 > 0.01 && !W._namedExt.goe && W.transitions?.oxygenicPhotosynthesis) {
    W._namedExt.goe = true;
    W._oxEvent = true;
    let killed = 0;
    for (let c = 0; c < NC; c++) {
      const anaer = (W.guildDens?.methanogen?.[c] || 0) + (W.guildDens?.fermenter?.[c] || 0);
      if (anaer > 0.2) {
        if ((W.refuge?.[c] || 0) > 0.4) continue;
        W.life[c] *= 0.4;
        killed++;
      }
    }
    if (chronLog) chronLog(W.year, 'massext', 0, killed / NC, 'Great Oxidation Event — anaerobic die-off');
  }

  // End-Permian chain when traps-like volcanism + warmth + anoxia. Item 90.
  if (ma < 260 && ma > 240 && !W._namedExt.permian) {
    if (W.gases.CO2 > 0.01 && W.meanTemp > 0.65) {
      W._namedExt.permian = true;
      pulseKill(W, 0.81, 'End-Permian kill chain', chronLog);
    }
  }

  // K–Pg. Item 92 — triggered by large impact flag
  if (W._chicxulub && !W._namedExt.kpg) {
    W._namedExt.kpg = true;
    pulseKill(W, 0.75, 'K–Pg impact winter', chronLog);
    // Iridium / ejecta layer
    for (let c = 0; c < NC; c++) {
      if (!W.ejecta) W.ejecta = new Float32Array(NC);
      W.ejecta[c] = Math.min(1, (W.ejecta[c] || 0) + 0.3);
      if (W.rock) W.rock[c] = W.rock[c] || 5;
    }
  }

  // Late Devonian — plants weather hard. Item 89.
  if (W.transitions?.landPlants && ma < 380 && ma > 360 && !W._namedExt.devonian) {
    if ((W.carbon?.weatheringFlux || 0) > 0.01) {
      W._namedExt.devonian = true;
      pulseKill(W, 0.4, 'Late Devonian — plant-driven anoxia', chronLog);
    }
  }
}

function pulseKill(W, frac, label, chronLog) {
  const rng = W.rng || (() => 0.5);
  W._extinctionPulse = (W._extinctionPulse || 0) + 1;
  W._recoveryBoost = 2;
  for (let c = 0; c < NC; c++) {
    if (rng() < frac) W.life[c] *= 0.25;
  }
  // Preferentially kill specialists / large / high trophic
  if (W.tree) {
    for (const id of [...W.tree.living]) {
      const n = nodeOf(W.tree, id);
      if (!n) continue;
      const mass = n.traits[TRAITS.bodyMass] ?? n.traits[4] ?? 0.5;
      const trop = n.traits[TRAITS.trophic] ?? n.traits[7] ?? 0.3;
      const def = n.traits[TRAITS.defence] ?? 0.3;
      const sessile = n.genome?.plan?.sessile;
      let p = frac * (0.35 + mass * 0.4 + trop * 0.35);
      if (sessile) p *= 0.72;
      p *= 1.15 - def * 0.4;
      if (rng() < p) {
        n.death = W.ageYr;
        n.extReason = label;
        removeLiving(W.tree, id);
        W.tree.extinctions.push({ id, name: n.name, t: W.ageYr, reason: label });
        for (const c of n.cells || []) recordFossil(W, n, c, label);
        if (n.playerSeeded || n.refuge) {
          W._lastEulogy = `${n.name || 'A lineage'} lasted until ${label}. What it left is in the rock.`;
        }
      }
    }
  }
  if (chronLog) chronLog(W.year, 'massext', 0, frac, label);
}

/** Hook large impacts toward K–Pg logic. */
export function noteImpact(W, power) {
  if (power > 0.85) W._chicxulub = true;
  if (power > 0.95) steriliseOrigin(W);
}
