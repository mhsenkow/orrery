/** Autopilot as character — the Gaia button.
 *
 *  Off by default. When on, reads mood / tips / stress / resilience and acts
 *  through the same climate verbs the player has (`setOrbit`, `injectGas`,
 *  `injectAerosol`), with receipts throttled so the log stays readable.
 *
 *  Not Daisyworld (emergent) and not `thermostatPin` (cheat). Can fail. */

import { clamp } from '../../math.js';
import { injectGas } from '../atmo.js';
import { setOrbit, injectAerosol } from './climate.js';
import { issueReceipt } from './receipt.js';

export const GAIA_DRIVES = [
  { id: 'regulator', label: 'Regulator', aim: 'minimise tip risk and temperature swing',
    blurb: 'Holds the climate. Nudges solar and CO₂ when tips or fever rise — not Daisyworld.' },
  { id: 'gardener', label: 'Gardener', aim: 'maximise living biomass',
    blurb: 'Grows life. Keeps a living temperature band and feeds CO₂ when the garden is thin.' },
  { id: 'experimenter', label: 'Experimenter', aim: 'perturb when calm, learn the envelope',
    blurb: 'Pokes when calm. Brief solar pulses to learn the envelope — can backfire.' },
];

export function gaiaDriveOf(W) {
  const id = W.gaiaDrive || 'regulator';
  return GAIA_DRIVES.find((d) => d.id === id) || GAIA_DRIVES[0];
}

/** UI copy for the World → Modes Gaia button (includes Off). */
export function gaiaModeMeta(W) {
  if (!W?.autopilot) {
    return {
      label: 'Off',
      blurb: 'You drive. The planet will not nudge solar or CO₂ on its own.',
    };
  }
  const d = gaiaDriveOf(W);
  return { label: d.label, blurb: d.blurb || d.aim };
}

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
    W.gaiaFailed = false;
  }
  return { autopilot: W.autopilot, drive: W.gaiaDrive };
}

function receiptQuiet(W, tool, intent, expected) {
  const tick = W._agentTick | 0;
  if (tick - (W._gaiaReceiptTick | 0) < 48) return;
  W._gaiaReceiptTick = tick;
  issueReceipt({
    tool,
    cell: 0,
    intent: `Gaia · ${intent}`,
    expected,
    delayYr: 10,
    delayLabel: 'Gaia action settling',
  });
}

function nudgeSolar(W, delta, acts, why) {
  const next = clamp((W.solar || 1) + delta, 0.45, 1.45);
  if (Math.abs(next - (W.solar || 1)) < 1e-6) return;
  setOrbit({ solar: next, quiet: true });
  receiptQuiet(W, 'solar', why, `S → ${next.toFixed(3)}`);
  acts.push(why);
}

function nudgeCO2(W, delta, acts, why) {
  if (!W.gases) return;
  injectGas(W, 'CO2', delta);
  receiptQuiet(W, 'co2', why, `CO₂ ${(W.gases.CO2 * 1e6).toFixed(0)} ppm`);
  acts.push(why);
}

/** Autopilot that reads the planetary drive vector and uses player verbs. */
export function gaiaPolicyTick(W, log) {
  if (!W.autopilot) return;
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
  const life = W.meanLife || 0;
  const dLife = lifeTrend(W);
  const dT = W.dTempDt || 0;
  const co2 = W.gases?.CO2 ?? 0.04;
  const acts = [];

  /* Visibly lose when tips are tripped and climate is past verbs. */
  const overwhelmed = (tip >= 0.98 && (t < 0.28 || t > 0.95))
    || (W.state === 'moist-greenhouse' && t > 1.0)
    || (W.state === 'snowball' && co2 > 0.25 && t < 0.3);
  if (overwhelmed) {
    W.gaiaFailed = true;
    W.gaiaLastAct = 'overwhelmed — tips past what verbs can hold';
    W.gaiaObjective = drive.aim;
    W.gaiaTipProx = tip;
    if (log && ((W._agentTick | 0) % 64) === 0) {
      log(W.year, 'gaia', 0, 1, `Gaia (${drive.label}): overwhelmed`);
    }
    return;
  }
  W.gaiaFailed = false;

  let tLo = 0.38, tHi = 0.78;
  if (drive.id === 'gardener') { tLo = 0.42; tHi = 0.72; }
  if (drive.id === 'experimenter') { tLo = 0.32; tHi = 0.88; }
  if (tip > 0.55 || mood === 'fever' || mood === 'frozen') {
    tLo += 0.04; tHi -= 0.04;
  }
  if (stress > 0.4) { tLo += 0.02; tHi -= 0.02; }

  const step = 0.002 + tip * 0.003 + (mood === 'fever' || mood === 'frozen' ? 0.002 : 0);

  if (t < tLo || (dT < -0.002 && t < 0.5) || mood === 'frozen') {
    nudgeSolar(W, step, acts, `raised solar — ${mood === 'frozen' ? 'thaw' : 'too cold'} (${drive.label})`);
  }
  if (t > tHi || (dT > 0.002 && t > 0.6) || mood === 'fever') {
    nudgeSolar(W, -step, acts, `lowered solar — ${mood === 'fever' ? 'cool the fever' : 'too hot'} (${drive.label})`);
    if (mood === 'fever' && tip > 0.5 && (W.gases?.sulphate || 0) < 0.05) {
      injectAerosol(0.015, 0, { quiet: true });
      receiptQuiet(W, 'aerosol', 'fever shade', 'stratospheric pulse');
      acts.push('aerosol — fever shade');
    }
  }

  if (drive.id === 'gardener') {
    if ((life < 0.12 || dLife < -0.004) && t < 0.55 && co2 < 0.08) {
      nudgeCO2(W, 0.0004, acts, 'injected CO₂ — grow the garden');
    }
    if (life > 0.28 && co2 > 0.1 && t > 0.65) {
      nudgeCO2(W, -co2 * 0.003, acts, 'drew down CO₂ — garden overheating');
    }
  } else if (drive.id === 'regulator') {
    if (co2 < 0.005 && t < 0.45) {
      nudgeCO2(W, 0.0005, acts, 'injected CO₂ — greenhouse thin');
    }
    if ((co2 > 0.12 && t > 0.65) || tip > 0.7) {
      nudgeCO2(W, -co2 * 0.003, acts, 'drew down CO₂ — tip proximity');
    }
  } else if (drive.id === 'experimenter') {
    if (mood === 'calm' && tip < 0.25 && stress < 0.2 && (W._agentTick | 0) % 97 === 0) {
      const bump = ((W._agentTick | 0) & 1) ? 0.003 : -0.003;
      nudgeSolar(W, bump, acts, bump > 0 ? 'experiment — brief warm pulse' : 'experiment — brief cool pulse');
    } else if (co2 > 0.18) {
      nudgeCO2(W, -co2 * 0.004, acts, 'drew down CO₂ — experiment hit a wall');
    }
  }

  if (res < 0.25 && co2 > 0.06 && !acts.some((a) => a.includes('drew down'))) {
    nudgeCO2(W, -co2 * 0.002, acts, 'drew down CO₂ — resilience low');
  }

  W.gaiaObjective = drive.aim;
  W.gaiaTipProx = tip;
  if (acts.length) {
    W.gaiaLastAct = acts[0];
    W.gaiaLog = W.gaiaLog || [];
    W.gaiaLog.push({ t: W.ageYr, drive: drive.id, acts, tip, mood, verb: true });
    if (W.gaiaLog.length > 60) W.gaiaLog.shift();
    if (log && acts[0]) log(W.year, 'gaia', 0, 1, `Gaia (${drive.label}): ${acts[0]}`);
  }
}
