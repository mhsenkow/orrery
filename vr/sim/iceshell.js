/** Ice-shell fluid stack — lid / ocean / mantle for Europa-class worlds.
 *  Three coupled layers with lateral ocean mixing, cryovolcano plumes, and guild feed.
 *  The map is body-specific: cycloids on Europa, tiger stripes on Enceladus,
 *  polar lakes on Titan, Sputnik cells on Pluto, cantaloupe on Triton. */

import { NC, DIR, NBR } from '../sphere.js';
import { clamp, fbm, ridged } from '../math.js';
import { planetKind } from './planetTerrain.js';

/** Allocate layer fields. */
export function initIceShell(W) {
  if (!W.shellLid || W.shellLid.length !== NC) {
    W.shellLid = new Float32Array(NC);
    W.shellOcean = new Float32Array(NC);
    W.shellMantle = new Float32Array(NC);
    W.shellVent = new Float32Array(NC);
  }
}

function paintEuropa(W, tidal, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const pole = y * y;
    const cycloid = Math.sin(x * 14 + z * 9 + Math.sin(y * 11) * 1.8);
    const linea = cycloid > 0.72 ? (cycloid - 0.72) : 0;
    const chaos = Math.max(0, Math.sin(x * 8 + z * 6) * (1 - pole) - 0.35) * 0.55;
    W.shellLid[c] = clamp(0.52 + pole * 0.22 - chaos * 0.35 - linea * 0.12, 0.22, 0.92);
    W.shellOcean[c] = clamp(0.78 - pole * 0.18 + chaos * 0.25, 0.35, 0.95);
    W.shellMantle[c] = clamp(tidal * (0.6 + (1 - pole) * 0.7 + chaos * 0.4), 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = 0.14 + (linea > 0 ? linea * 0.03 : 0) - chaos * 0.035
      + (fbm(x * 3, y * 3, z * 3, seed, 2, 2, 0.5) - 0.5) * 0.01;
  }
}

function paintEnceladus(W, tidal) {
  for (let c = 0; c < NC; c++) {
    const y = DIR[c * 3 + 1];
    const south = y < -0.62;
    const stripe = south && (c % 47 === 0 || c % 53 === 1 || c % 41 === 3);
    W.shellLid[c] = clamp(south ? 0.32 : 0.72, 0.18, 0.94);
    W.shellOcean[c] = clamp(south ? 0.88 : 0.55, 0.3, 0.95);
    W.shellMantle[c] = clamp(tidal * (south ? 1.15 : 0.35), 0, 1);
    W.shellVent[c] = stripe ? 0.85 : 0;
    W.h[c] = south ? 0.08 + (stripe ? 0.02 : 0) : 0.15;
  }
}

function paintTitan(W, tidal, seed) {
  W.seaLevel = 0.09;
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const pole = y * y;
    const dunes = Math.abs(y) < 0.35 ? Math.sin(x * 22 + z * 3) * 0.025 : 0;
    const xanadu = Math.max(0, x * 0.4 + z * 0.85 - 0.55);
    const lake = pole > 0.72 ? (pole - 0.72) * 0.55 : 0;
    W.shellLid[c] = clamp(0.6 - lake * 0.4 + xanadu * 0.15, 0.22, 0.9);
    W.shellOcean[c] = 0.4;
    W.shellMantle[c] = clamp(tidal * 0.45, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = 0.12 + dunes + xanadu * 0.08 - lake * 0.07
      + (fbm(x * 2, y * 2, z * 2, seed, 3, 2, 0.5) - 0.5) * 0.03;
    W.moist[c] = lake > 0 ? 0.9 : (Math.abs(y) < 0.35 ? 0.08 : 0.25);
  }
}

function paintPluto(W, tidal, seed) {
  const p = [0.15, 0.08, 0.985];
  const sl = Math.hypot(p[0], p[1], p[2]) || 1;
  p[0] /= sl; p[1] /= sl; p[2] /= sl;
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const d = x * p[0] + y * p[1] + z * p[2];
    const basin = d > 0.72 ? (d - 0.72) / 0.28 : 0;
    const cells = basin > 0.15 ? Math.sin(x * 28) * Math.sin(z * 26) * 0.012 : 0;
    const mtn = basin < 0.08 && d > 0.55 ? ridged(x * 4, y * 4, z * 4, seed, 3) * 0.09 : 0;
    W.shellLid[c] = clamp(0.7 - basin * 0.25, 0.3, 0.92);
    W.shellOcean[c] = clamp(0.5 + basin * 0.3, 0.3, 0.9);
    W.shellMantle[c] = clamp(tidal * 0.35 + basin * 0.2, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = 0.13 - basin * 0.08 + cells + mtn;
  }
}

function paintTriton(W, tidal, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const cant = ridged(x * 3.4, y * 3.4, z * 3.4, seed ^ 0x63616e74, 3);
    const south = y < -0.7;
    W.shellLid[c] = clamp(0.58 - cant * 0.12, 0.28, 0.9);
    W.shellOcean[c] = 0.55;
    W.shellMantle[c] = clamp(tidal * (south ? 0.9 : 0.4), 0, 1);
    W.shellVent[c] = south && (c % 61 === 0) ? 0.7 : 0;
    W.h[c] = 0.13 - (cant - 0.45) * 0.05 + (south ? -0.02 : 0);
  }
}

function paintGanymede(W, tidal, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const dark = fbm(x * 1.2, y * 1.2, z * 1.2, seed, 3, 2, 0.5) < 0.46;
    const groove = !dark ? Math.abs(Math.sin(x * 16 + z * 12)) * 0.02 : 0;
    W.shellLid[c] = dark ? 0.7 : 0.5;
    W.shellOcean[c] = 0.6;
    W.shellMantle[c] = clamp(tidal * 0.5, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = (dark ? 0.15 : 0.12) + groove;
    if (W.age) W.age[c] = dark ? 4000 : 1200;
  }
}

function paintCallisto(W, tidal, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const cr = ridged(x * 3.6, y * 3.6, z * 3.6, seed, 3);
    W.shellLid[c] = 0.8;
    W.shellOcean[c] = 0.35;
    W.shellMantle[c] = clamp(tidal * 0.2, 0, 1);
    W.shellVent[c] = 0;
    W.h[c] = 0.14 - (cr > 0.72 ? (cr - 0.72) * 0.55 : 0);
    if (W.age) W.age[c] = 4500;
  }
}

function openVents(W, kind) {
  let vents = 0;
  const cap = kind === 'enceladus' ? 48 : kind === 'triton' ? 24 : 70;
  for (let c = 0; c < NC; c++) {
    const stripe = kind === 'enceladus' && W.shellVent[c] > 0.4;
    const chaos = kind === 'europa' && W.shellLid[c] < 0.42;
    const geyser = kind === 'triton' && W.shellVent[c] > 0.4;
    const open = stripe || chaos || geyser
      || (kind === 'europa' && W.shellMantle[c] > 0.55 && W.shellLid[c] < 0.5);
    if (!open) {
      if (W.shellVent[c] < 0.3) W.shellVent[c] = 0;
      continue;
    }
    W.shellVent[c] = clamp(Math.max(W.shellVent[c], W.shellMantle[c] * (1.1 - W.shellLid[c])), 0, 1);
    W.temp[c] = 0.28 + W.shellVent[c] * 0.32;
    W.life[c] = 0.08 + W.shellVent[c] * 0.26;
    W.ice[c] = W.iceLand[c] = Math.min(W.shellLid[c], 0.46);
    if (W.nutrientP) {
      W.nutrientP[c] = 0.32 + W.shellVent[c] * 0.4;
      W.nutrientN[c] = 0.28 + W.shellVent[c] * 0.35;
    }
    if (W.guildDens?.chemolithotroph) {
      W.guildDens.chemolithotroph[c] = 0.4 + W.shellVent[c] * 0.5;
    }
    if (W.ash) W.ash[c] = W.shellVent[c] * 0.32;
    vents++;
    if (vents >= cap) break;
  }
  return vents;
}

/** Paint an ice lid + subsurface ocean + mantle heat. */
export function applyIceShell(W, rule) {
  if (!rule.iceShell) return;
  initIceShell(W);
  const kind = planetKind(rule);
  W._planetKind = kind;
  W._shellKind = kind;
  W.seaLevel = kind === 'titan' ? 0.09 : 0.05;
  const tidal = rule.tidalHeat ?? 0.08;
  const seed = (W.seed ?? 1) ^ 0x49434553;

  if (kind === 'enceladus') paintEnceladus(W, tidal);
  else if (kind === 'titan') paintTitan(W, tidal, seed);
  else if (kind === 'pluto') paintPluto(W, tidal, seed);
  else if (kind === 'triton') paintTriton(W, tidal, seed);
  else if (kind === 'ganymede') paintGanymede(W, tidal, seed);
  else if (kind === 'callisto') paintCallisto(W, tidal, seed);
  else paintEuropa(W, tidal, seed);

  for (let c = 0; c < NC; c++) {
    W.ice[c] = W.iceLand[c] = W.shellLid[c];
    W.iceSea[c] = kind === 'titan' && W.h[c] < W.seaLevel ? 0.4 : 0;
    W.temp[c] = 0.06 + W.shellMantle[c] * 0.05 + W.shellVent[c] * 0.2;
    if (!(W.moist[c] > 0.01)) W.moist[c] = 0.015;
    if (!W.life[c]) W.life[c] = 0;
    if (W.ash && W.shellVent[c] < 0.1) W.ash[c] = 0;
  }

  const vents = openVents(W, kind);
  W._iceShell = true;
  W.habitability = clamp(0.12 + vents * 0.003 + tidal * 0.5, 0, 0.55);
  W.inhabitance = W.meanLife = vents * 0.0025;
  W._shellBudget = iceShellBudget(rule);
  W._shellVentCount = vents;
}

/** Couple layers each tick — basal melt, ocean mixing, vents, plumes. */
export function iceShellTick(W) {
  if (!W._iceShell || !W.shellLid) return;
  const dt = Math.min(1.2, (W.dtYr || 200) / 8e4);
  const tidal = W.rule?.tidalHeat || 0.05;

  for (let c = 0; c < NC; c++) {
    const melt = W.shellMantle[c] * 0.018 * dt;
    W.shellLid[c] = clamp(W.shellLid[c] - melt, 0.14, 0.98);
    W.shellOcean[c] = clamp(W.shellOcean[c] + melt * 0.55, 0.18, 1);

    const lat = DIR[c * 3 + 1];
    const pole = lat * lat;
    const kind = W._shellKind || 'europa';
    const southStripe = kind === 'enceladus' && lat < -0.62 && (c % 47 === 0 || c % 53 === 1);
    const wasVent = W.shellVent[c] > 0.2;
    const hot = W.shellMantle[c] > 0.55 && W.shellLid[c] < 0.48;

    // Freeze-back — weaker on active vents / tiger stripes
    if (!wasVent && !southStripe) {
      const freeze = (0.004 + pole * 0.01) * (1.1 - W.shellMantle[c]) * dt;
      W.shellLid[c] = clamp(W.shellLid[c] + freeze, 0.14, 0.98);
      W.shellOcean[c] = clamp(W.shellOcean[c] - freeze * 0.4, 0.18, 1);
    }

    const cool = W.shellLid[c] * 0.009 * dt;
    W.shellMantle[c] = clamp(
      W.shellMantle[c] - cool + tidal * 0.012 * dt + (southStripe ? tidal * 0.025 * dt : 0),
      0, 1
    );

    let ventWant;
    if (southStripe || hot) {
      const drive = W.shellMantle[c] * Math.max(0.2, 0.9 - W.shellLid[c]) + (southStripe ? 0.25 : 0);
      ventWant = Math.max(W.shellVent[c] * 0.97, drive);
    } else if (wasVent) {
      ventWant = W.shellVent[c] * 0.98; // persist, don't recruit
    } else {
      ventWant = W.shellVent[c] * 0.85;
    }
    W.shellVent[c] = clamp(ventWant, 0, 1);

    if (W.shellVent[c] > 0.3) {
      W.shellLid[c] = Math.min(W.shellLid[c], 0.46);
    }

    W.ice[c] = W.iceLand[c] = W.shellLid[c];
    W.temp[c] = clamp(0.06 + W.shellVent[c] * 0.42 + W.shellMantle[c] * 0.06, 0, 0.75);

    if (W.shellVent[c] > 0.15 && W.nutrientP) {
      W.nutrientP[c] = Math.min(1, (W.nutrientP[c] || 0) + W.shellVent[c] * 0.03 * dt);
      W.nutrientN[c] = Math.min(1, (W.nutrientN[c] || 0) + W.shellVent[c] * 0.022 * dt);
    }
    if (W.shellVent[c] > 0.2) {
      W.life[c] = Math.max(W.life[c], 0.07 + W.shellVent[c] * 0.22);
      if (W.guildDens?.chemolithotroph) {
        W.guildDens.chemolithotroph[c] = Math.max(
          W.guildDens.chemolithotroph[c] || 0,
          0.25 + W.shellVent[c] * 0.55
        );
      }
    }
    if (W.ash && W.shellVent[c] > 0.35) {
      W.ash[c] = Math.min(1, (W.ash[c] || 0) * 0.85 + W.shellVent[c] * 0.08 * dt);
    } else if (W.ash) {
      W.ash[c] = (W.ash[c] || 0) * 0.92;
    }
  }

  // Mantle lateral diffusion
  if (W._t) {
    for (let c = 0; c < NC; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += W.shellMantle[NBR[c * 4 + k]];
      W._t[c] = W.shellMantle[c] * 0.82 + s * 0.045;
    }
    W.shellMantle.set(W._t);
  }

  // Ocean heat / nutrient mixing (toy conveyor under the lid)
  if (W._m && W.shellOcean) {
    for (let c = 0; c < NC; c++) {
      let o = 0, n = 0;
      for (let k = 0; k < 4; k++) {
        const nb = NBR[c * 4 + k];
        o += W.shellOcean[nb];
        n += W.nutrientP?.[nb] || 0;
      }
      W._m[c] = W.shellOcean[c] * 0.88 + o * 0.03;
      if (W.nutrientP && W.shellVent[c] < 0.15) {
        W.nutrientP[c] = Math.min(1, (W.nutrientP[c] || 0) * 0.97 + n * 0.007);
      }
    }
    W.shellOcean.set(W._m);
  }

  let vc = 0;
  for (let c = 0; c < NC; c++) if (W.shellVent[c] > 0.2) vc++;
  W._shellVentCount = vc;
  W.habitability = clamp(0.1 + vc * 0.0025 + tidal * 0.45, 0, 0.55);
}

export function iceShellBudget(rule) {
  const tidalW = 1e12 * ((rule?.tidalHeat || 0.08) / 0.08);
  return {
    tidalW,
    layers: ['ice lid', 'subsurface ocean', 'warm mantle'],
    note: 'Tidal heat sounds large until divided by an ocean — expect a sparse, slow biosphere under the lid.',
  };
}

/** Inspect readout for a cell. */
export function iceShellAt(W, c) {
  if (!W._iceShell) return null;
  return {
    lid: W.shellLid?.[c],
    ocean: W.shellOcean?.[c],
    mantle: W.shellMantle?.[c],
    vent: W.shellVent?.[c],
  };
}
