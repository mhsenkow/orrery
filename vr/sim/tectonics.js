/** Plate tectonics → crustal thickness → isostatic elevation. */

import { clamp, lerp, mulberry32, fbm, ridged } from '../math.js';
import { rngOf } from './rng.js';
import { naturalizeHypsometry, softenPlateCrust } from './terrainShape.js';
import { NC, NF, N, NBR, NBR8, DIR, AREA, dirToCell } from '../sphere.js';
import { paintEdifice } from './planetTick.js';
import { isGasKind, isIceShellKind } from './planetKind.js';
import { erodeFactor, slopeCap } from './substrateField.js';


const MANTLE_DENS = 3.3;
const DIV = 0, CONV = 1, TRANS = 2;

export function isostaticElev(W, c) {
  const pl = W.plates?.[W.plateId[c]];
  const thick = W.crust[c];
  const dens = pl?.density ?? 2.8;
  const oceanic = !!pl?.oceanic;
  const freeboard = thick * (1 - dens / MANTLE_DENS) * (oceanic ? 1.6 : 3.4);
  let elev = freeboard - (oceanic ? 0.42 : -0.08);
  if (oceanic) elev -= 0.015 * Math.sqrt(Math.max(0, W.age[c]));
  return clamp(elev, -1.2, 1.2);
}

export function snapshotIsostasy(W) {
  if (!W._iso0 || W._iso0.length !== NC) W._iso0 = new Float32Array(NC);
  for (let c = 0; c < NC; c++) W._iso0[c] = isostaticElev(W, c);
}

/** Apply crustal thickness changes to height without wiping sculpted terrain. */
export function applyIsostasy(W) {
  if (!W.plates || !W._iso0) return;
  for (let c = 0; c < NC; c++) {
    const now = isostaticElev(W, c);
    const dh = now - W._iso0[c];
    if (Math.abs(dh) < 1e-5) continue;
    const step = dh * 0.18;
    W.h[c] = clamp(W.h[c] + step, -1.2, 1.2);
    W._iso0[c] += step;
  }
}

function silicaForVent(W, cell, hotspot) {
  if (hotspot) return 0.48;
  const pl = W.plates?.[W.plateId[cell]];
  if (W.bound[cell] === CONV && pl && !pl.oceanic) return 0.63;
  if (W.bound[cell] === DIV) return 0.49;
  return 0.52;
}

function randomUnit(rng) {
  const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
  return [r * Math.cos(th), u, r * Math.sin(th)];
}

function plateVelocityAt(plate, x, y, z) {
  // v = ω × r
  const wx = plate.pole[0] * plate.omega, wy = plate.pole[1] * plate.omega, wz = plate.pole[2] * plate.omega;
  return [wy * z - wz * y, wz * x - wx * z, wx * y - wy * x];
}

/**
 * Build plates, assign cells, classify boundaries, derive elevation from
 * crustal thickness + density (isostasy), age–depth oceans, hotspots.
 * Returns filled fields on W and a plates array.
 */
export function generateTectonics(W, seed, rule) {
  const rng = mulberry32(seed ^ 0x7f4a7c15);
  const vigor = W.interior?.vigor ?? 1;
  const lid = W.interior?.lidMode || 'mobile';
  let nPlates = rule.nPlates | 0 || 10;
  if (lid === 'none') nPlates = Math.min(nPlates, 4);
  if (lid === 'stagnant') nPlates = Math.max(4, Math.min(nPlates, 8));
  const plates = [];
  const omegaScale = lid === 'stagnant' ? 0.08 : lid === 'episodic' ? 0.45 : lid === 'ice' ? 0.2 : 1;
  for (let i = 0; i < nPlates; i++) {
    const centre = randomUnit(rng);
    const pole = randomUnit(rng);
    plates.push({
      centre, pole,
      omega: (rng() - 0.5) * 0.08 * omegaScale * clamp(vigor, 0.05, 1.5),
      oceanic: true,
      density: 3.0,
      baseThick: 0.22 + rng() * 0.08,
    });
  }
  const contShare = lid === 'stagnant' || lid === 'ice'
    ? Math.max(0.55, rule.continentFrac || 0.5)
    : Math.max(0.28, rule.continentFrac || 0.4);
  const nCont = Math.max(1, Math.round(nPlates * contShare));
  const order = plates.map((_, i) => i).sort(() => rng() - 0.5);
  for (let i = 0; i < nCont; i++) {
    const pl = plates[order[i]];
    pl.oceanic = false;
    pl.density = 2.7;
    pl.baseThick = 0.55 + rng() * 0.35;
  }

  const plateId = W.plateId;
  const crust = W.crust;
  const age = W.age;
  const rock = W.rock; // 0 igneous, 1 sedimentary, 2 metamorphic
  const strain = W.strain;
  const bound = W.bound; // -1 none, 0 div, 1 conv, 2 trans

  // Voronoi assignment on the sphere
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    let best = 0, bestD = -2;
    for (let p = 0; p < nPlates; p++) {
      const d = x * plates[p].centre[0] + y * plates[p].centre[1] + z * plates[p].centre[2];
      if (d > bestD) { bestD = d; best = p; }
    }
    plateId[c] = best;
    const pl = plates[best];
    crust[c] = pl.baseThick * (0.85 + 0.3 * fbm(x * 2.1, y * 2.1, z * 2.1, seed + best * 17, 3, 2, 0.5));
    age[c] = pl.oceanic ? rng() * 80 : 200 + rng() * 800; // Myr
    rock[c] = pl.oceanic ? 0 : (rng() < 0.3 ? 2 : 1);
    strain[c] = 0;
    bound[c] = -1;
  }

  // Boundary classification from relative velocity
  for (let c = 0; c < NC; c++) {
    const pid = plateId[c];
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const v0 = plateVelocityAt(plates[pid], x, y, z);
    let bType = -1, maxRel = 0;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (plateId[n] === pid) continue;
      const v1 = plateVelocityAt(plates[plateId[n]], DIR[n * 3], DIR[n * 3 + 1], DIR[n * 3 + 2]);
      const rvx = v0[0] - v1[0], rvy = v0[1] - v1[1], rvz = v0[2] - v1[2];
      // radial separation: approach (+) vs diverge (−) along great-circle normal in tangent plane
      const mx = (x + DIR[n * 3]) * 0.5, my = (y + DIR[n * 3 + 1]) * 0.5, mz = (z + DIR[n * 3 + 2]) * 0.5;
      const ml = Math.hypot(mx, my, mz) || 1;
      const nx = mx / ml, ny = my / ml, nz = mz / ml;
      // tangent from c toward n
      let tx = DIR[n * 3] - x, ty = DIR[n * 3 + 1] - y, tz = DIR[n * 3 + 2] - z;
      const td = tx * nx + ty * ny + tz * nz;
      tx -= td * nx; ty -= td * ny; tz -= td * nz;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      const diverge = rvx * tx + rvy * ty + rvz * tz;
      const speed = Math.hypot(rvx, rvy, rvz);
      if (speed < maxRel) continue;
      maxRel = speed;
      if (diverge > 0.002) bType = DIV;
      else if (diverge < -0.002) bType = CONV;
      else bType = TRANS;
    }
    if (bType >= 0) {
      bound[c] = bType;
      if (bType === CONV) {
        const pl = plates[pid];
        const other = plates[plateId[NBR[c * 4]]];
        if (pl.oceanic && (!other || !other.oceanic)) {
          // subduction: trench then arc
          crust[c] *= 0.55;
          age[c] = Math.min(age[c], 20);
          for (let k = 0; k < 4; k++) {
            const n = NBR[c * 4 + k];
            if (!plates[plateId[n]].oceanic) crust[n] = Math.min(1.4, crust[n] + 0.18);
          }
        } else if (!pl.oceanic) {
          crust[c] = Math.min(1.6, crust[c] + 0.35); // orogeny
          rock[c] = 2;
        }
      } else if (bType === DIV) {
        crust[c] = Math.min(crust[c], 0.28);
        age[c] = 0;
        rock[c] = 0;
      } else if (bType === TRANS) {
        strain[c] = 0.4 + rng() * 0.5;
      }
    }
  }

  // Hotspots fixed in mantle frame
  const nHot = 3 + (rng() * 3 | 0);
  W.hotspots = [];
  for (let h = 0; h < nHot; h++) {
    const pos = randomUnit(rng);
    W.hotspots.push({ pos, strength: 0.15 + rng() * 0.2 });
    // stamp age gradient chain along plate motion reverse
    for (let c = 0; c < NC; c++) {
      const d = DIR[c * 3] * pos[0] + DIR[c * 3 + 1] * pos[1] + DIR[c * 3 + 2] * pos[2];
      if (d > 0.97) {
        crust[c] = Math.max(crust[c], 0.45 + (d - 0.97) * 8);
        age[c] = Math.min(age[c], (1 - d) * 200);
        rock[c] = 0;
      }
    }
  }

  // Isostasy: elev ∝ thickness / density floating on mantle (~3.3)
  softenPlateCrust(W, seed, plates);
  const h = W.h;
  for (let c = 0; c < NC; c++) {
    const pl = plates[plateId[c]];
    const thick = crust[c];
    const dens = pl.density;
    const freeboard = thick * (1 - dens / MANTLE_DENS) * (pl.oceanic ? 1.6 : 3.4);
    let elev = freeboard - (pl.oceanic ? 0.42 : -0.08);
    if (pl.oceanic) elev -= 0.015 * Math.sqrt(Math.max(0, age[c]));
    // Mild noise for coastline interest
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    elev += (fbm(x * 3, y * 3, z * 3, seed + 99, 2, 2, 0.5) - 0.5) * 0.06;
    if (rule.airless) {
      const cr = ridged(x * 3.1, y * 3.1, z * 3.1, seed + 7717, 3);
      elev = elev * 0.7 - (cr > 0.72 ? (cr - 0.72) * 1.8 : 0);
    }
    h[c] = clamp(elev, -1.2, 1.2);
  }

  naturalizeHypsometry(W, seed, { seaLevel: 0 });

  W.plates = plates;
  W.volcanoes = [];
  W.ore = W.ore || new Float32Array(NC);
  // Ore at arcs / rifts / shields
  for (let c = 0; c < NC; c++) {
    let o = 0;
    if (bound[c] === CONV && !plates[plateId[c]].oceanic) o = 0.7;
    if (bound[c] === DIV) o = 0.5;
    if (age[c] > 600 && !plates[plateId[c]].oceanic) o = Math.max(o, 0.6);
    W.ore[c] = o * (0.5 + rng());
  }

  // Seed volcanoes on arcs and hotspots — scaled by interior heat
  const eruptChance = 0.015 + (W.interior?.heatFlow || 1) * 0.03 * (lid === 'stagnant' ? 0.25 : 1);
  for (let c = 0; c < NC; c++) {
    if (bound[c] === CONV && crust[c] > 0.5 && rng() < eruptChance) {
      W.volcanoes.push({
        cell: c, magma: 0.5 + rng(), next: rng() * 40,
        silica: silicaForVent(W, c, false),
      });
    }
  }
  for (const hs of W.hotspots) {
    let best = 0, bd = -2;
    for (let c = 0; c < NC; c++) {
      const d = DIR[c * 3] * hs.pos[0] + DIR[c * 3 + 1] * hs.pos[1] + DIR[c * 3 + 2] * hs.pos[2];
      if (d > bd) { bd = d; best = c; }
    }
    W.volcanoes.push({
      cell: best, magma: 1.2 * (W.interior?.heatFlow || 1), next: 5, hotspot: true,
      silica: 0.48,
    });
  }

  if (!W.lava || W.lava.length !== NC) W.lava = new Float32Array(NC);
  else W.lava.fill(0);
  snapshotIsostasy(W);

  return plates;
}

const BOUND_NAMES = { [-1]: 'interior', 0: 'divergent', 1: 'convergent', 2: 'transform' };

const PLATE_NAMES = [
  'Aether', 'Basalt', 'Craton', 'Drift', 'Euler', 'Farallon', 'Gondwana', 'Hadley',
  'Iapetus', 'Jade', 'Kerguelen', 'Laurentia', 'Moho', 'Nuna', 'Oceanus', 'Pangaea',
  'Qaidam', 'Rodinia', 'Shield', 'Tethys', 'Ural', 'Vestigia', 'Wilson', 'Xenolith',
];

/** Stable display names for plates (assigned once per generate). */
export function ensurePlateNames(W) {
  if (!W.plates?.length) return;
  if (W._plateNames?.length === W.plates.length) return;
  W._plateNames = W.plates.map((_, i) => PLATE_NAMES[i % PLATE_NAMES.length]
    + (i >= PLATE_NAMES.length ? ` ${((i / PLATE_NAMES.length) | 0) + 1}` : ''));
}

export function plateName(W, pid) {
  ensurePlateNames(W);
  return W._plateNames?.[pid] || `Plate ${pid}`;
}

export function boundLabel(b) {
  return BOUND_NAMES[b] ?? '—';
}

/** Recompute boundary types from current Euler poles (after redirects). */
export function reclassifyBoundaries(W) {
  const plates = W.plates;
  if (!plates?.length) return;
  const { plateId, bound, crust, age, rock, strain } = W;
  for (let c = 0; c < NC; c++) {
    const pid = plateId[c];
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const v0 = plateVelocityAt(plates[pid], x, y, z);
    let bType = -1, maxRel = 0;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (plateId[n] === pid) continue;
      const v1 = plateVelocityAt(plates[plateId[n]], DIR[n * 3], DIR[n * 3 + 1], DIR[n * 3 + 2]);
      const rvx = v0[0] - v1[0], rvy = v0[1] - v1[1], rvz = v0[2] - v1[2];
      const mx = (x + DIR[n * 3]) * 0.5, my = (y + DIR[n * 3 + 1]) * 0.5, mz = (z + DIR[n * 3 + 2]) * 0.5;
      const ml = Math.hypot(mx, my, mz) || 1;
      const nx = mx / ml, ny = my / ml, nz = mz / ml;
      let tx = DIR[n * 3] - x, ty = DIR[n * 3 + 1] - y, tz = DIR[n * 3 + 2] - z;
      const td = tx * nx + ty * ny + tz * nz;
      tx -= td * nx; ty -= td * ny; tz -= td * nz;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      const diverge = rvx * tx + rvy * ty + rvz * tz;
      const speed = Math.hypot(rvx, rvy, rvz);
      if (speed < maxRel) continue;
      maxRel = speed;
      if (diverge > 0.002) bType = DIV;
      else if (diverge < -0.002) bType = CONV;
      else bType = TRANS;
    }
    bound[c] = bType;
    if (bType === TRANS && strain[c] < 0.2) strain[c] = 0.25;
  }
}

/** Panel / HUD aggregate. */
export function platesDeskSnapshot(W) {
  ensurePlateNames(W);
  const plates = W.plates || [];
  const counts = { div: 0, conv: 0, trans: 0, interior: 0 };
  const areaByPlate = new Float32Array(plates.length);
  let meanCrust = 0, meanAge = 0, n = 0;
  for (let c = 0; c < NC; c++) {
    const b = W.bound[c];
    if (b === DIV) counts.div++;
    else if (b === CONV) counts.conv++;
    else if (b === TRANS) counts.trans++;
    else counts.interior++;
    const pid = W.plateId[c];
    if (pid >= 0 && pid < areaByPlate.length) areaByPlate[pid] += AREA[c] || 1;
    meanCrust += W.crust[c];
    meanAge += W.age[c];
    n++;
  }
  const totalA = areaByPlate.reduce((s, a) => s + a, 0) || 1;
  const list = plates.map((pl, i) => ({
    id: i,
    name: plateName(W, i),
    oceanic: !!pl.oceanic,
    omega: pl.omega,
    density: pl.density,
    areaFrac: areaByPlate[i] / totalA,
    crust: pl.baseThick,
  })).sort((a, b) => b.areaFrac - a.areaFrac);

  const volcanoes = (W.volcanoes || []).map((v, i) => ({
    i,
    cell: v.cell,
    magma: v.magma,
    hotspot: !!v.hotspot,
    next: v.next,
  }));
  const hotspots = (W.hotspots || []).map((h, i) => ({
    i,
    strength: h.strength,
    fixed: !!h.fixed,
  }));

  return {
    nPlates: plates.length,
    nCont: plates.filter((p) => !p.oceanic).length,
    nOcean: plates.filter((p) => p.oceanic).length,
    counts,
    list,
    volcanoes,
    hotspots,
    meanCrust: n ? meanCrust / n : 0,
    meanAge: n ? meanAge / n : 0,
    note: plates.length
      ? `${plates.length} plates · ${counts.conv} convergent · ${counts.div} divergent · ${counts.trans} transform`
      : 'No plate model on this world',
  };
}

/** Inspect helper. */
export function tectonicsAtCell(W, cell) {
  if (cell < 0 || !W.plates) return null;
  const pid = W.plateId[cell];
  const pl = W.plates[pid];
  return {
    plate: pid,
    name: plateName(W, pid),
    oceanic: pl?.oceanic,
    omega: pl?.omega,
    bound: W.bound[cell],
    boundLabel: boundLabel(W.bound[cell]),
    crust: W.crust[cell],
    ageMyr: W.age[cell],
    strain: W.strain[cell],
    rock: W.rock[cell],
    ore: W.ore?.[cell],
  };
}

/** Nudge selected plate angular velocity. */
export function nudgePlateOmega(W, pid, dOmega) {
  const pl = W.plates?.[pid];
  if (!pl) return { ok: false, note: 'No plate' };
  pl.omega = clamp(pl.omega + dOmega, -0.2, 0.2);
  reclassifyBoundaries(W);
  return { ok: true, omega: pl.omega, plate: pid };
}

/** Slow plate advection of age at ridges + strain + mild plate morph. */
export function tectonicsTick(W, chron, log) {
  const rng = rngOf(W, 'rngGeo');
  const { bound, strain, age, crust, plateId, h } = W;
  const plates = W.plates;
  if (!plates) return;
  const vigor = W.interior?.vigor ?? 1;
  const lid = W.interior?.lidMode || 'mobile';
  const morph = lid === 'mobile';
  const boundRate = lid === 'mobile' ? 1 : lid === 'episodic' ? 0.04 : 0;
  if (W._canvasMode) return;

  // Mild morph: drift plate centres along Euler velocity (mobile lids only, live ticks)
  if (log && morph && vigor > 0.2) {
    const step = 0.00035 * vigor;
    for (const pl of plates) {
      const c = pl.centre;
      const v = plateVelocityAt(pl, c[0], c[1], c[2]);
      let x = c[0] + v[0] * step, y = c[1] + v[1] * step, z = c[2] + v[2] * step;
      const L = Math.hypot(x, y, z) || 1;
      pl.centre = [x / L, y / L, z / L];
    }
    if (((W.ageYr | 0) % 48) === 0) {
      reassignPlatesVoronoi(W);
      reclassifyBoundaries(W);
    }
  }

  for (let c = 0; c < NC; c++) {
    if (boundRate > 0 && bound[c] === DIV) {
      age[c] = Math.max(0, age[c] * (1 - 0.005 * vigor * boundRate));
      if (plates[plateId[c]]?.oceanic) crust[c] = Math.min(crust[c], lerp(crust[c], 0.28, 0.008 * vigor * boundRate));
    }
    if (boundRate > 0 && bound[c] === CONV) {
      const pl = plates[plateId[c]];
      if (pl && !pl.oceanic) crust[c] = Math.min(1.6, crust[c] + 0.00055 * vigor * boundRate);
      else if (pl?.oceanic) crust[c] = Math.max(0.12, crust[c] * (1 - 0.0012 * vigor * boundRate));
    }
    if (boundRate > 0 && (bound[c] === TRANS || bound[c] === CONV)) {
      strain[c] = Math.min(2, strain[c] + 0.008 * vigor * boundRate);
      if (strain[c] > 1.1 && rng() < strain[c] * 0.002 * vigor * boundRate) {
        const mag = strain[c];
        strain[c] = 0.1;
        if (log) log(W.year, 'quake', c, mag, `Quake M${(4 + mag * 3).toFixed(1)}`);
        h[c] -= mag * 0.008;
      }
    }
    age[c] += 0.02 * Math.max(0.2, vigor);
  }

  if (!W.lava || W.lava.length !== NC) W.lava = new Float32Array(NC);

  const heat = W.interior?.heatFlow || 1;
  for (const v of W.volcanoes) {
    if (v.silica == null) v.silica = silicaForVent(W, v.cell, !!v.hotspot);
    if (v.vol == null) {
      v.vol = 0.45 + (v.magma || 0.5) * 0.25;
      v.roof = v.silica > 0.58 ? 0.52 : 0.82;
      v.depth = v.hotspot ? 0.32 : 0.55;
      v.volatiles = 0.15 + v.silica * 0.45;
    }
    v.next -= 1;
    v.vol = Math.min(2.4, v.vol + 0.008 * heat);
    v.magma = Math.min(2, v.magma + 0.01 * heat);
    v.silica = clamp(v.silica + 0.00012 * (1.1 - heat * 0.35), 0.42, 0.78);
    v.volatiles = clamp(v.volatiles + 0.00008, 0.05, 0.7);
    const overpress = v.vol / Math.max(0.2, v.roof);
    if (v.next <= 0 && v.magma > 0.55 && overpress > 0.85) {
      const dumped = Math.min(v.vol, v.vol * 0.62 + v.magma * 0.2);
      const silica = v.silica;
      const visc = Math.exp((silica - 0.5) * 12);
      const explosive = silica > 0.58 || v.volatiles > 0.45;
      const caldera = dumped > v.roof * 1.05 && explosive;
      v.vol -= dumped;
      v.magma *= 0.28;
      v.volatiles *= 0.45;
      v.next = (18 + rng() * 70) / Math.max(0.35, heat);
      const power = dumped;
      const plume = power * (explosive ? 1.35 : 0.4) * (0.5 + v.volatiles);
      paintEdifice(W, v.cell, power, visc, caldera);
      if (caldera) {
        W.ash[v.cell] = Math.min(1, (W.ash[v.cell] || 0) + power * 0.9);
      } else if (explosive) {
        W.ash[v.cell] = Math.min(1, (W.ash[v.cell] || 0) + power * 0.7);
      } else {
        W.lava[v.cell] = Math.min(1, (W.lava[v.cell] || 0) + power * 0.55);
        W.ash[v.cell] = Math.min(1, (W.ash[v.cell] || 0) + power * 0.18);
      }
      crust[v.cell] = Math.min(1.6, crust[v.cell] + power * 0.05);
      const strat = plume > 0.55;
      const sulphPulse = (W.rule.earthLike ? power * 0.0007 : power * 0.015)
        * (explosive ? 1.4 : 0.6) * (strat ? 1 : 0.25);
      const sulphCap = W.rule.earthLike ? 0.04 : 0.3;
      W.gases.sulphate = Math.min(sulphCap, W.gases.sulphate + sulphPulse);
      const co2Pulse = W.rule.earthLike ? power * 0.000015 : power * 0.004;
      W.gases.CO2 = Math.min(0.5, W.gases.CO2 + co2Pulse);
      const label = caldera
        ? 'Caldera collapse'
        : explosive
          ? (power > 1 ? 'Plinian eruption' : 'Explosive eruption')
          : (power > 1 ? 'Major eruption' : 'Lava eruption');
      if (log) log(W.year, 'eruption', v.cell, power, label);
    }
  }

  // Lava flows downhill and cools
  const lava = W.lava;
  const _h = W._h;
  _h.set(lava);
  for (let c = 0; c < NC; c++) {
    const v = lava[c];
    if (v < 0.01) { _h[c] = v * 0.92; continue; }
    let sink = c, drop = 0;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const s = h[c] - h[n];
      if (s > drop) { drop = s; sink = n; }
    }
    const flow = Math.min(v * 0.22, drop * 0.8);
    _h[c] = (v - flow) * 0.94;
    if (sink !== c) _h[sink] = Math.min(1, _h[sink] + flow * 0.85);
    if (flow > 0.002) h[c] = Math.min(1.2, h[c] + flow * 0.008);
  }
  lava.set(_h);

  applyIsostasy(W);
}

/** Re-Voronoi cells from drifted plate centres (keeps plate objects, moves ownership). */
export function reassignPlatesVoronoi(W) {
  const plates = W.plates;
  if (!plates?.length) return;
  const plateId = W.plateId;
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    let best = 0, bestD = -2;
    for (let p = 0; p < plates.length; p++) {
      const d = x * plates[p].centre[0] + y * plates[p].centre[1] + z * plates[p].centre[2];
      if (d > bestD) { bestD = d; best = p; }
    }
    plateId[c] = best;
  }
}

/** Stream-power erosion + sediment deposition. */
export function erosionTick(W) {
  const kind = W._planetKind;
  if (W._canvasMode) return;
  if (kind === 'io' || kind === 'moon' || kind === 'mercury' || kind === 'airless'
    || kind === 'magma' || isGasKind(kind) || kind === 'venus'
    || kind === 'iapetus' || kind === 'phobos' || kind === 'smallbody'
    || kind === 'eris' || kind === 'ceres' || kind === 'charon'
    || (isIceShellKind(kind) && kind !== 'titan')) return;
  let rate = 1;
  if (kind === 'mars') rate = 0.06;
  else if (kind === 'stagnant' || kind === 'titan') rate = 0.12;
  const { h, flow, moist, seaLevel, sediment } = W;
  const iceLand = W.iceLand;
  const _h = W._h;
  _h.set(h);
  for (let c = 0; c < NC; c++) {
    if (h[c] < seaLevel) continue;
    const discharge = flow[c] * (0.3 + moist[c]);
    let maxSlope = 0, sink = c;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const slope = h[c] - h[n];
      if (slope > maxSlope) { maxSlope = slope; sink = n; }
    }
    const lock = W.erosionLock?.[c];
    const local = lock == null ? 1 : lock;
    if (local <= 0) continue;
    const erodeK = erodeFactor(W, c);
    const cap = slopeCap(W, c);
    if (maxSlope > cap && sink !== c) {
      const excess = (maxSlope - cap) * 0.06 * rate * local;
      _h[c] -= excess;
      _h[sink] += excess * 0.85;
    }
    const erode = Math.min(0.004 * rate * local, discharge * maxSlope * maxSlope * 0.15 * rate * local) * erodeK;
    let lap = 0;
    for (let k = 0; k < 4; k++) lap += h[NBR[c * 4 + k]] - h[c];
    _h[c] += -erode + lap * 0.002 * rate * local;
    const ice = iceLand?.[c] || 0;
    let iceCarve = 0;
    if (ice > 0.12 && maxSlope > 0) {
      iceCarve = ice * maxSlope * maxSlope * 0.012 * rate * local;
      _h[c] -= iceCarve;
    }
    const moved = erode + iceCarve;
    if (sink !== c && moved > 0) {
      if (h[sink] < seaLevel) {
        _h[sink] = Math.min(seaLevel + 0.02, _h[sink] + moved * 0.7);
        sediment[sink] = Math.min(1, sediment[sink] + moved * 2);
      } else {
        _h[sink] += moved * 0.85;
        sediment[sink] = Math.min(1, sediment[sink] + moved);
      }
    }
    if (iceCarve > 0 && iceLand) {
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if ((iceLand[n] || 0) < ice * 0.35) {
          sediment[n] = Math.min(1, sediment[n] + iceCarve * 0.45);
          if (h[n] >= seaLevel) _h[n] += iceCarve * 0.22;
        }
      }
    }
  }
  h.set(_h);
}
