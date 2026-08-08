/** Plate tectonics → crustal thickness → isostatic elevation. */

import { clamp, lerp, mulberry32, fbm, ridged } from '../math.js';
import { NC, NF, N, NBR, NBR8, DIR, AREA, dirToCell } from '../sphere.js';

const DIV = 0, CONV = 1, TRANS = 2;

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
  const nPlates = rule.nPlates | 0 || 10;
  const plates = [];
  for (let i = 0; i < nPlates; i++) {
    const centre = randomUnit(rng);
    const pole = randomUnit(rng);
    plates.push({
      centre, pole,
      omega: (rng() - 0.5) * 0.08,
      oceanic: true, // assigned below to hit continent fraction
      density: 3.0,
      baseThick: 0.22 + rng() * 0.08,
    });
  }
  // Guarantee continent coverage — Voronoi area ≈ plate count share
  const nCont = Math.max(3, Math.round(nPlates * Math.max(0.28, rule.continentFrac)));
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
  const h = W.h;
  const mantle = 3.3;
  for (let c = 0; c < NC; c++) {
    const pl = plates[plateId[c]];
    const thick = crust[c];
    const dens = pl.density;
    // Airy-ish freeboard — continents ride high enough for ~25–40% land
    const freeboard = thick * (1 - dens / mantle) * (pl.oceanic ? 1.6 : 3.4);
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

  // Seed volcanoes on arcs and hotspots
  for (let c = 0; c < NC; c++) {
    if (bound[c] === CONV && crust[c] > 0.5 && rng() < 0.04) {
      W.volcanoes.push({ cell: c, magma: 0.5 + rng(), next: rng() * 40 });
    }
  }
  for (const hs of W.hotspots) {
    let best = 0, bd = -2;
    for (let c = 0; c < NC; c++) {
      const d = DIR[c * 3] * hs.pos[0] + DIR[c * 3 + 1] * hs.pos[1] + DIR[c * 3 + 2] * hs.pos[2];
      if (d > bd) { bd = d; best = c; }
    }
    W.volcanoes.push({ cell: best, magma: 1.2, next: 5, hotspot: true });
  }

  return plates;
}

/** Slow plate advection of age at ridges + strain build for quakes. */
export function tectonicsTick(W, chron, log) {
  const { bound, strain, age, crust, plateId, h } = W;
  const plates = W.plates;
  if (!plates) return;

  for (let c = 0; c < NC; c++) {
    if (bound[c] === DIV) {
      age[c] = Math.max(0, age[c] * 0.995);
      // seafloor spreading: slight uplift then age-depth handled in elev refresh
    }
    if (bound[c] === TRANS || bound[c] === CONV) {
      strain[c] = Math.min(2, strain[c] + 0.008);
      if (strain[c] > 1.1 && Math.random() < strain[c] * 0.002) {
        const mag = strain[c];
        strain[c] = 0.1;
        if (log) log(W.year, 'quake', c, mag, `Quake M${(4 + mag * 3).toFixed(1)}`);
        // shake relief slightly
        h[c] -= mag * 0.008;
      }
    }
    age[c] += 0.02; // Myr per tick approx at geologic scale
  }

  // volcano eruptions
  for (const v of W.volcanoes) {
    v.next -= 1;
    v.magma = Math.min(2, v.magma + 0.01);
    if (v.next <= 0 && v.magma > 0.6) {
      const power = v.magma;
      v.magma *= 0.3;
      v.next = 20 + Math.random() * 80;
      h[v.cell] = Math.min(1.2, h[v.cell] + power * 0.04);
      crust[v.cell] = Math.min(1.6, crust[v.cell] + power * 0.05);
      W.ash[v.cell] = Math.min(1, (W.ash[v.cell] || 0) + power * 0.4);
      W.gases.sulphate = Math.min(0.3, W.gases.sulphate + power * 0.015);
      W.gases.CO2 = Math.min(0.5, W.gases.CO2 + power * 0.004);
      if (log) log(W.year, 'eruption', v.cell, power, power > 1 ? 'Major eruption' : 'Eruption');
    }
  }
}

/** Stream-power erosion + sediment deposition. */
export function erosionTick(W) {
  const { h, flow, moist, seaLevel, sediment } = W;
  const _h = W._h;
  for (let c = 0; c < NC; c++) {
    if (h[c] < seaLevel) { _h[c] = h[c]; continue; }
    const discharge = flow[c] * (0.3 + moist[c]);
    let maxSlope = 0, sink = c;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      const slope = h[c] - h[n];
      if (slope > maxSlope) { maxSlope = slope; sink = n; }
    }
    const erode = Math.min(0.004, discharge * maxSlope * maxSlope * 0.15);
    _h[c] = h[c] - erode;
    if (sink !== c) {
      if (h[sink] < seaLevel) {
        // delta
        _h[sink] = Math.min(seaLevel + 0.02, h[sink] + erode * 0.7);
        sediment[sink] = Math.min(1, sediment[sink] + erode * 2);
      } else {
        _h[sink] = h[sink] + erode * 0.85;
        sediment[sink] = Math.min(1, sediment[sink] + erode);
      }
    }
  }
  h.set(_h);
}
