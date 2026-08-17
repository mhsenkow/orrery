/** Ice-shell fluid stack — lid / ocean / mantle for Europa-class worlds.
 *  Three coupled layers with lateral ocean mixing, cryovolcano plumes, and guild feed. */

import { NC, DIR, NBR } from '../sphere.js';
import { clamp } from '../math.js';

/** Allocate layer fields. */
export function initIceShell(W) {
  if (!W.shellLid || W.shellLid.length !== NC) {
    W.shellLid = new Float32Array(NC);
    W.shellOcean = new Float32Array(NC);
    W.shellMantle = new Float32Array(NC);
    W.shellVent = new Float32Array(NC);
  }
}

/** Paint an ice lid + subsurface ocean + mantle heat. */
export function applyIceShell(W, rule) {
  if (!rule.iceShell) return;
  initIceShell(W);
  W.seaLevel = 0.12;
  const tidal = rule.tidalHeat ?? 0.08;
  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const pole = lat * lat;
    const lonWave = Math.sin(DIR[c * 3] * 8 + DIR[c * 3 + 2] * 6);
    // Chaos terrain: thinner lid bands
    const chaos = Math.max(0, lonWave) * (1 - pole) * 0.18;
    W.shellLid[c] = clamp(0.55 + pole * 0.35 + Math.sin(c * 0.07) * 0.04 - chaos, 0.22, 0.96);
    W.shellOcean[c] = clamp(0.72 - pole * 0.22 + chaos * 0.3, 0.3, 0.95);
    W.shellMantle[c] = clamp(tidal * (0.55 + (1 - pole) * 0.9 + (c % 17 === 0 ? 0.45 : 0)), 0, 1);
    W.shellVent[c] = 0;

    W.h[c] = 0.16 + (1 - W.shellLid[c]) * 0.08 + Math.sin(c * 0.01) * 0.012 - chaos * 0.04;
    W.ice[c] = W.iceLand[c] = W.shellLid[c];
    W.iceSea[c] = 0;
    W.temp[c] = 0.07 + W.shellMantle[c] * 0.05;
    W.moist[c] = 0.015;
    W.life[c] = 0;
    if (W.ash) W.ash[c] = 0;
  }

  // Tiger-stripe / south-pole style vent corridor + scattered chaos vents
  let vents = 0;
  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const southStripe = lat < -0.72 && (c % 47 === 0 || c % 53 === 1);
    const open = (W.shellMantle[c] > 0.42 && W.shellLid[c] < 0.52) || southStripe;
    if (open || W.bound?.[c] === 0) {
      W.shellVent[c] = clamp(W.shellMantle[c] * (1.15 - W.shellLid[c]) + (southStripe ? 0.25 : 0), 0, 1);
      W.temp[c] = 0.32 + W.shellVent[c] * 0.3;
      W.life[c] = 0.1 + W.shellVent[c] * 0.28;
      W.ice[c] = W.iceLand[c] = Math.min(W.shellLid[c], 0.42);
      if (W.nutrientP) {
        W.nutrientP[c] = 0.35 + W.shellVent[c] * 0.4;
        W.nutrientN[c] = 0.3 + W.shellVent[c] * 0.35;
      }
      if (W.guildDens?.chemolithotroph) {
        W.guildDens.chemolithotroph[c] = 0.45 + W.shellVent[c] * 0.5;
      }
      if (W.ash) W.ash[c] = W.shellVent[c] * 0.35; // cryovolcanic plume proxy
      vents++;
      if (vents > 90) break;
    }
  }
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
    // Sparse tiger-stripe corridor (not half the south hemisphere)
    const southStripe = lat < -0.72 && (c % 47 === 0 || c % 53 === 1);
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
