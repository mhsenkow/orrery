/** Autopilot as character — the Gaia button.
 *
 *  Off by default. When on, `gaiaPolicyTick` reads the same state vector
 *  `gaiaTick` already computes (mood, tips, rate stress, resilience, life)
 *  and nudges solar / CO₂ to keep the world in a band its disposition names.
 *
 *  This is not emergent Daisyworld regulation and not the cheat thermostat
 *  (`thermostatPin`). It is a labelled controller you can turn off. */

import { clamp } from '../../math.js';

export const GAIA_DRIVES = [
  { id: 'regulator', label: 'Regulator', aim: 'minimise tip risk and temperature swing' },
  { id: 'gardener', label: 'Gardener', aim: 'maximise living biomass' },
  { id: 'experimenter', label: 'Experimenter', aim: 'perturb when calm, learn the envelope' },
];

export function gaiaDriveOf(W) {
  const id = W.gaiaDrive || 'regulator';
  return GAIA_DRIVES.find((d) => d.id === id) || GAIA_DRIVES[0];
}

/** Tip proximity 0–1 from the seven tipping elements. */
export function tipProximity(W) {
  const tips = W.tips || {};
  let worst = 0;
  for (const t of Object.values(tips)) {
    if (!t) continue;
    const v = t.on ? 1 : clamp(t.val || 0, 0, 1);
    if (v > worst) worst = v;
  }
  return worst;
}

function lifeTrend(W) {
  if (W._gaiaLifePrev == null) {
    W._gaiaLifePrev = W.meanLife || 0;
    return 0;
  }
  const d = (W.meanLife || 0) - W._gaiaLifePrev;
  W._gaiaLifePrev = W.meanLife || 0;
  return d;
}

/**
 * Cycle: off → regulator → gardener → experimenter → off.
 * Returns { autopilot, drive }.
 */
export function cycleGaiaButton(W) {
  const order = [null, 'regulator', 'gardener', 'experimenter'];
  const cur = W.autopilot ? (W.gaiaDrive || 'regulator') : null;
  const i = order.indexOf(cur);
  const next = order[(i + 1) % order.length];
  if (next == null) {
    W.autopilot = false;
    W.gaiaDrive = 'regulator';
  } else {
    W.autopilot = true;
    W.gaiaDrive = next;
  }
  return { autopilot: W.autopilot, drive: W.gaiaDrive };
}

/** Autopilot that reads the planetary drive vector. */
export function gaiaPolicyTick(W, log) {
  if (!W.autopilot) return;
  /* Cheat thermostat owns solar — do not fight it. */
  if (W.thermostatPin != null) {
    W.gaiaLastAct = 'held — thermostat pin owns solar';
    return;
  }

  const drive = gaiaDriveOf(W);
  const tip = tipProximity(W);
  const stress = W.rateStress || 0;
  const res = W.resilience ?? 0.5;
  const mood = W.mood?.label || 'calm';
  const t = W.meanTemp ?? 0.5;
  const life = W.meanLife ?? 0;
  const dLife = lifeTrend(W);
  const dT = W.dTempDt || 0;
  const co2 = W.gases?.CO2 ?? 0.04;

  /* Comfort bands — tighten when tips are close or mood is fever/frozen. */
  let tLo = 0.38, tHi = 0.78;
  if (drive.id === 'gardener') { tLo = 0.42; tHi = 0.72; }
  if (drive.id === 'experimenter') { tLo = 0.32; tHi = 0.88; }
  if (tip > 0.55 || mood === 'fever' || mood === 'frozen') {
    tLo += 0.04;
    tHi -= 0.04;
  }
  if (stress > 0.4) {
    tLo += 0.02;
    tHi -= 0.02;
  }

  const acts = [];
  const step = 0.002 + tip * 0.003 + (mood === 'fever' || mood === 'frozen' ? 0.002 : 0);

  if (t < tLo || (dT < -0.002 && t < 0.5) || mood === 'frozen') {
    W.solar = Math.min(1.45, (W.solar || 1) + step);
    acts.push(`raised solar — ${mood === 'frozen' ? 'thaw' : 'too cold'} (${drive.label})`);
  }
  if (t > tHi || (dT > 0.002 && t > 0.6) || mood === 'fever') {
    W.solar = Math.max(0.45, (W.solar || 1) - step);
    acts.push(`lowered solar — ${mood === 'fever' ? 'cool the fever' : 'too hot'} (${drive.label})`);
  }

  if (drive.id === 'gardener') {
    if (life < 0.12 || dLife < -0.004) {
      if (t < 0.55 && co2 < 0.08) {
        W.gases.CO2 = Math.min(0.12, co2 + 0.0004);
        acts.push('injected CO₂ — grow the garden');
      }
    }
    if (life > 0.28 && co2 > 0.1 && t > 0.65) {
      W.gases.CO2 *= 0.997;
      acts.push('drew down CO₂ — garden overheating');
    }
  } else if (drive.id === 'regulator') {
    if (co2 < 0.005 && t < 0.45) {
      W.gases.CO2 = co2 + 0.0005;
      acts.push('injected CO₂ — greenhouse thin');
    }
    if ((co2 > 0.12 && t > 0.65) || tip > 0.7) {
      W.gases.CO2 *= 0.997;
      acts.push('drew down CO₂ — tip proximity');
    }
  } else if (drive.id === 'experimenter') {
    /* Only poke when calm and tips are quiet — otherwise behave as regulator. */
    if (mood === 'calm' && tip < 0.25 && stress < 0.2 && (W._agentTick | 0) % 97 === 0) {
      const bump = ((W._agentTick | 0) & 1) ? 0.003 : -0.003;
      W.solar = clamp((W.solar || 1) + bump, 0.5, 1.4);
      acts.push(bump > 0 ? 'experiment — brief warm pulse' : 'experiment — brief cool pulse');
    } else if (t < tLo || t > tHi) {
      /* fall through already handled solar; ensure CO₂ safety net */
      if (co2 > 0.18) {
        W.gases.CO2 *= 0.996;
        acts.push('drew down CO₂ — experiment hit a wall');
      }
    }
  }

  /* Resilience collapse: prefer draw-down over more forcing. */
  if (res < 0.25 && co2 > 0.06 && !acts.some((a) => a.includes('drew down'))) {
    W.gases.CO2 *= 0.998;
    acts.push('drew down CO₂ — resilience low');
  }

  W.gaiaObjective = drive.aim;
  W.gaiaTipProx = tip;
  if (acts.length) {
    W.gaiaLastAct = acts[0];
    W.gaiaLog = W.gaiaLog || [];
    W.gaiaLog.push({ t: W.ageYr, drive: drive.id, acts, tip, mood });
    if (W.gaiaLog.length > 60) W.gaiaLog.shift();
    if (log && acts[0]) log(W.year, 'gaia', 0, 1, `Gaia (${drive.label}): ${acts[0]}`);
  }
}
