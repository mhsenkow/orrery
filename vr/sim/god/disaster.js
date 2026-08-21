/** Parameterised disasters + aftermath chains.
 *  Backlog dis 72–85. */

import { clamp } from '../../math.js';
import { NC, DIR, NBR } from '../../sphere.js';
import { W, chronLog } from '../../world.js';
import { startTsunami } from '../hydro.js';
import { noteImpact } from '../extinction.js';
import { paintBrush, beginStroke } from './brush.js';
import { issueReceipt, causalChain } from './receipt.js';
import { rngOf } from '../rng.js';
import { addBaseHeight } from '../layers.js';
import { irradiate } from '../anthro.js';
import { strike as flashAt } from '../lightning.js';
import { markTrace } from '../ordnance.js';

/** Parameterised impactor. Item 72. */
export function strikeImpact(cell, opts = {}) {
  const mass = opts.mass ?? 1;
  const velocity = opts.velocity ?? 1;
  const density = opts.density ?? 1;
  const angle = opts.angle ?? 45; // degrees from horizontal; Chicxulub ~60
  const power = mass * velocity * velocity * density * (0.5 + Math.sin(angle * Math.PI / 180) * 0.5);

  beginStroke(['h', 'life', 'temp', 'dust']);
  const angleRad = angle * Math.PI / 180;
  const cx = DIR[cell * 3], cy = DIR[cell * 3 + 1], cz = DIR[cell * 3 + 2];
  // Oblique ejecta asymmetry
  const ex = Math.cos(angleRad), ey = 0.2, ez = Math.sin(angleRad);

  for (let c = 0; c < NC; c++) {
    const d = Math.acos(clamp(
      DIR[c * 3] * cx + DIR[c * 3 + 1] * cy + DIR[c * 3 + 2] * cz, -1, 1
    ));
    const r = Math.max(0.02, power * 0.05);
    if (d > r) continue;
    let f = 1 - d / r;
    // Prefer downrange hemisphere for ejecta
    const down = DIR[c * 3] * ex + DIR[c * 3 + 1] * ey + DIR[c * 3 + 2] * ez;
    if (down > 0) f *= 1 + 0.5 * down;
    addBaseHeight(W, c, -power * 0.1 * f);
    W.temp[c] = Math.min(1.5, W.temp[c] + power * 0.25 * f);
    W.life[c] *= 1 - 0.75 * f;
    W.dust[c] = Math.min(1, W.dust[c] + power * 0.35 * f);
    if (!W.ejecta) W.ejecta = new Float32Array(NC);
    W.ejecta[c] = Math.min(1, (W.ejecta[c] || 0) + power * 0.3 * f);
  }

  W.gases.dust = Math.min(0.5, W.gases.dust + power * 0.05);
  W.gases.CO2 = Math.min(0.5, W.gases.CO2 + power * 0.01);
  if (W.carbon) W.carbon.atmosphere += power * 1.5;
  startTsunami(W, cell, power);
  noteImpact(W, power);

  /* The arrival, drawn.
   *
   * This function wrote height, temperature, life, dust and ejecta — a complete
   * account of the aftermath and no account of the event. A rock that crosses the
   * sky and hits the ground should look like one: an entry track along the
   * incoming bearing, a flash at the point of contact, and a crater floor that
   * stays molten for a while afterwards. `tracer` is the same field a missile
   * uses, `flash` the same one lightning uses, `lava` the same one a vent uses —
   * the impact borrows all three rather than adding a fourth.
   */
  const entry = [];
  let e = cell;
  for (let i = 0; i < Math.round(6 + power * 8); i++) {
    // Walk backwards up the trajectory: the track ends where the rock landed.
    let best = e, bestDot = -2;
    for (let k = 0; k < 4; k++) {
      const n = NBR[e * 4 + k];
      const dot = -(DIR[n * 3] * ex + DIR[n * 3 + 1] * ey + DIR[n * 3 + 2] * ez);
      if (dot > bestDot && !entry.includes(n)) { bestDot = dot; best = n; }
    }
    if (best === e) break;
    e = best;
    entry.push(e);
  }
  if (W.tracer) {
    for (let i = 0; i < entry.length; i++) {
      // Brightest nearest the ground — the rock is heating up as it comes in.
      const k = 1 - i / (entry.length + 1);
      markTrace(W, entry[i], 0.35 + k * 0.85);
    }
    markTrace(W, cell, 1.3);
  }
  flashAt(W, cell, 1.3 + Math.min(1, power) * 0.5);
  // Impact melt: the floor glows, then cools like any other lava.
  if (W.lava) W.lava[cell] = Math.min(1, (W.lava[cell] || 0) + Math.min(0.9, power * 0.5));
  for (let k = 0; k < 4; k++) {
    const n = NBR[cell * 4 + k];
    if (W.lava) W.lava[n] = Math.min(1, (W.lava[n] || 0) + Math.min(0.5, power * 0.22));
  }

  // Consequence chain schedule. Item 73.
  W.disasterChain = W.disasterChain || [];
  const chain = [
    { at: W.ageYr + 0.01, label: 'Thermal pulse' },
    { at: W.ageYr + 0.1, label: 'Ejecta reentry heating' },
    { at: W.ageYr + 1, label: 'Tsunami / coastal die-off' },
    { at: W.ageYr + 2, label: 'Dust winter begins' },
    { at: W.ageYr + 10, label: 'Years of cold' },
    { at: W.ageYr + 50, label: 'Acid rain pulse' },
    { at: W.ageYr + 5000, label: 'Recovery taxa bloom' },
  ];
  for (const step of chain) W.disasterChain.push({ ...step, cell, kind: 'impact' });

  // Rock record. Item 79.
  if (!W.strataMark) W.strataMark = [];
  W.strataMark.push({ t: W.ageYr, kind: 'iridium', cell, power });

  const receipt = issueReceipt({
    tool: 'meteor',
    cell,
    intent: 'Impactor',
    expected: causalChain([
      `m=${mass}`, `v=${velocity}`, `ρ=${density}`, `∠${angle}°`,
      `E=${power.toFixed(2)}`,
      'thermal → ejecta → tsunami → dust → cold → acid → recovery',
    ]),
    irreversible: power > 1.2,
    delayYr: 5000,
    delayLabel: 'Impact recovery underway — ferns into forests',
    chain: chain.map((s) => s.label),
  });

  chronLog(W.year, 'impact', cell, power, `Impact E=${power.toFixed(2)} ∠${angle}°`);
  return { ok: true, power, angle, receipt, chain };
}

/** Large igneous province. Item 74. */
export function placeLIP(cell, durationMyr = 1) {
  W.activeLIP = {
    cell,
    start: W.ageYr,
    end: W.ageYr + durationMyr * 1e6,
    power: 0.8,
  };
  W.volcanoes.push({ cell, magma: 2.5, next: 0, lip: true });
  issueReceipt({
    tool: 'lip',
    cell,
    intent: 'Large igneous province',
    expected: `${durationMyr} Myr eruption · kills via cooked volatiles, not lava`,
    delayYr: durationMyr * 1e6,
    delayLabel: 'LIP waning — anoxia / acidification aftermath',
    irreversible: true,
  });
  chronLog(W.year, 'eruption', cell, durationMyr, 'LIP begun');
  return { ok: true };
}

export function lipTick(W) {
  const lip = W.activeLIP;
  if (!lip) return;
  if (W.ageYr > lip.end) { W.activeLIP = null; return; }
  W.gases.CO2 = Math.min(0.4, W.gases.CO2 + 0.00002);
  W.gases.sulphate = Math.min(0.2, (W.gases.sulphate || 0) + 0.00001);
  if (W.carbon) W.carbon.atmosphere += 0.02;
  W.ash[lip.cell] = Math.min(1, (W.ash[lip.cell] || 0) + 0.01);
}

/** Supernova / GRB. Item 75. */
export function triggerGRB() {
  W.ozone = Math.max(0, (W.ozone || 0.5) * 0.05);
  W.uvPulse = 1;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= W.seaLevel) W.life[c] *= 0.25;
    // Ocean below ~few metres protected
    else if (W.seaLevel - W.h[c] < 0.05) W.life[c] *= 0.6;
  }
  issueReceipt({
    tool: 'supernova',
    cell: 0,
    intent: 'Nearby GRB / supernova',
    expected: 'Ozone stripped · land dies · deep ocean largely spared',
    irreversible: true,
    delayYr: 1e5,
    delayLabel: 'Ozone recovery after GRB',
  });
  chronLog(W.year, 'tool', 0, 1, 'GRB / supernova');
  return { ok: true };
}

/**
 * Stellar flare.
 *
 * This used to be two lines against `W.ozone` and a receipt: the most dramatic
 * thing a star can do to a planet, and the screen did not change. A real event
 * of this size does four things at once, and all four are visible:
 *
 *   · the sunlit limb washes out for a few ticks (`W.flareGlow`)
 *   · aurora reach far past their usual latitudes, and how far depends on the
 *     magnetosphere — a planet with no dynamo lights up to the equator
 *   · the grid goes down, so the night side goes dark right when it is brightest
 *   · a radiation storm reaches the ground where the field is weakest
 *
 * The ozone hit stays, because that is the part with a long tail.
 */
export function stellarFlare(magnitude = 1) {
  const mag = Math.max(0.1, magnitude);
  W.ozone = Math.max(0, (W.ozone || 0.5) * (1 - 0.4 * mag));
  W.flareCount = (W.flareCount || 0) + 1;
  W.flareGlow = Math.min(2.2, (W.flareGlow || 0) + mag * 1.1);
  // A weak or absent magnetosphere is what lets a flare reach the ground.
  const shield = clamp(W.rule?.magnetosphere ?? 1, 0, 1);
  W.auroraPower = Math.min(1.6, (W.auroraPower || 0) + mag * (1.2 - shield * 0.5));
  W.auroraLat = clamp(0.82 - mag * 0.3 - (1 - shield) * 0.35, 0.05, 0.9);
  // Induced currents take the grid down for longer than the flare lasts.
  W._empUntil = Math.max(W._empUntil || 0, (W._tickIndex | 0) + Math.round(30 + mag * 90));
  /* Ground-level dose is a polar phenomenon on a weak-field planet and close to
     nothing on a shielded one. Aurora latitude is *not* the right band for it:
     Carrington-class aurora reached the tropics on an Earth whose surface dose
     barely moved. Keying the dose off `auroraLat` irradiated 78% of the planet
     through an intact magnetosphere. Squared shield term, so Earth takes none and
     a dynamo-dead world takes it seriously. */
  const exposure = mag * Math.pow(1 - shield, 2);
  if (exposure > 0.3) {
    const radLat = clamp(0.92 - exposure * 0.22, 0.5, 0.95);
    const dose = Math.min(0.45, exposure * 0.22);
    for (let c = 0; c < NC; c++) {
      const lat = Math.abs(DIR[c * 3 + 1]);
      if (lat < radLat) continue;
      irradiate(W, c, dose * (lat - radLat) / (1 - radLat + 1e-6), 0);
    }
  }
  issueReceipt({
    tool: 'flare',
    cell: 0,
    intent: `Stellar flare ×${mag.toFixed(1)}`,
    expected: `Ozone hit · grid down · aurora to lat ${W.auroraLat.toFixed(2)}`
      + ` · damage from frequency (n=${W.flareCount}), not single magnitude`,
    delayYr: 5,
    delayLabel: 'Post-flare ozone rebuilding',
  });
  chronLog(W.year, 'flare', 0, mag, `Solar flare ×${mag.toFixed(1)} · grid down`);
  return { ok: true, magnitude: mag, auroraLat: W.auroraLat };
}


/** Clathrate release. Item 77. */
export function releaseClathrate(gtC = 2000) {
  const add = gtC / 1e5; // toy scale into mixing ratio
  W.gases.CH4 = Math.min(0.05, (W.gases.CH4 || 0) + add);
  W.gases.CO2 = Math.min(0.3, W.gases.CO2 + add * 0.3);
  if (W.carbon) W.carbon.atmosphere += gtC / 100;
  W._clathrate = 0;
  issueReceipt({
    tool: 'clathrate',
    cell: 0,
    intent: 'Clathrate methane release',
    expected: `${gtC} Gt C · PETM-scale · recovery ~150 kyr`,
    delayYr: 1.5e5,
    delayLabel: 'Clathrate carbon pulse recovering',
  });
  chronLog(W.year, 'tool', 0, gtC, 'Clathrate release');
  return { ok: true };
}

/** Pathogen with host range. Item 78. */
export function releasePathogen(opts = {}) {
  const hostMass = opts.hostMass ?? 0.4;
  const virulence = opts.virulence ?? 0.6;
  const transmit = opts.transmit ?? 0.5;
  W.pathogen = {
    hostMass, virulence, transmit,
    burned: false,
    born: W.ageYr,
  };
  W.plague = Math.min(1, virulence * 0.8);
  issueReceipt({
    tool: 'plague',
    cell: 0,
    intent: 'Pathogen',
    expected: `Host mass~${hostMass} · virulence ${virulence} · R-ish ${transmit}`,
    delayYr: 200,
    delayLabel: 'Epidemic burned out or jumped clade',
  });
  chronLog(W.year, 'plague', 0, virulence, 'Pathogen released');
  return { ok: true };
}

export function pathogenTick(W) {
  const p = W.pathogen;
  if (!p || p.burned) return;
  // Trade-off: high virulence burns out
  if (p.virulence > 0.75 && rngOf(W, 'rngGod')() < 0.02) {
    p.burned = true;
    W.plague *= 0.3;
  }
  if (W.tree?.nodes) {
    for (const n of W.tree.nodes) {
      if (n.death != null) continue;
      const mass = n.traits?.[4] ?? 0.15;
      if (Math.abs(mass - p.hostMass) < 0.25) {
        n.pop *= 1 - p.virulence * 0.01;
      }
    }
  }
}

/** Disaster chain ticker. Item 73 / 82. */
export function disasterChainTick(W, log) {
  if (!W.disasterChain?.length) return;
  const due = [];
  W.disasterChain = W.disasterChain.filter((s) => {
    if (W.ageYr >= s.at) { due.push(s); return false; }
    return true;
  });
  for (const s of due) {
    if (log) log(W.year, 'consequence', s.cell || 0, 1, s.label);
    if (s.label.includes('Recovery')) {
      // Disaster taxa bloom
      for (let c = 0; c < NC; c += 5) {
        if (W.life[c] < 0.1 && W.temp[c] > 0.25 && W.temp[c] < 0.7) {
          W.life[c] = Math.min(0.35, W.life[c] + 0.08);
        }
      }
    }
  }
}

/** Planet buster → Theia-class. Item 85 / 197. */
export function theiaImpact(cell, commit = false) {
  if (!commit) {
    return {
      ok: false,
      needCommit: true,
      cell: cell | 0,
      warning: 'IRREVERSIBLE: Theia-class impact — magma ocean, possible moon, biosphere ends',
      holdMs: 2800,
    };
  }
  beginStroke(['h', 'life', 'temp']);
  for (let c = 0; c < NC; c++) {
    addBaseHeight(W, c, -(0.25 + rngOf(W, 'rngGod')() * 0.35));
    W.life[c] = 0;
    W.temp[c] = 1.45;
  }
  W.gases.dust = 0.6;
  W.state = 'moist-greenhouse';
  W.moon = W.moon || { mass: 1, distance: 1, formed: W.ageYr };
  issueReceipt({
    tool: 'buster',
    cell,
    intent: 'Theia-class impact',
    expected: 'Magma ocean · ejecta disc · possible moon · sterile',
    irreversible: true,
  });
  chronLog(W.year, 'buster', cell, 10, 'THEIA-CLASS IMPACT');
  return { ok: true, irreversible: true, cell: cell | 0 };
}

