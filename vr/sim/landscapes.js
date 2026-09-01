/** Landscape archetypes — the shape of the world you are handed.
 *
 *  `generateTectonics` builds Voronoi plates and `fitSeaLevel` then pins land
 *  fraction to the ruleset target, which means every seed of Earth comes out as
 *  one supercontinent covering ~29% of the globe. Measured on seed 20260808:
 *  22 landmasses, of which one holds 7,323 of 7,460 land cells and the second
 *  holds 47. Seeds moved the coastline; they never moved the *kind* of world.
 *
 *  An archetype is a large-scale mask applied to `W.h` between tectonics and
 *  the sea-level fit, plus its own land-fraction and relief targets. It does
 *  not replace the plate model — boundaries, crust and age all survive — it
 *  decides where the continents are before isostasy argues about how high.
 *
 *  `apply` is a no-op for `auto`, so a world with no archetype generates
 *  byte-identically to how it did before this module existed.
 */

import { clamp, lerp, fbm, ridged } from '../math.js';
import { NC, DIR, NBR, cellKm } from '../sphere.js';
import { forkRng } from './rng.js';

function randomUnit(rng) {
  const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
  return [r * Math.cos(th), u, r * Math.sin(th)];
}

function dotDir(c, p) {
  return DIR[c * 3] * p[0] + DIR[c * 3 + 1] * p[1] + DIR[c * 3 + 2] * p[2];
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a + 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Domain-warped unit direction — breaks a circular blob into a coastline. */
function warpDir(c, seed, amp) {
  const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
  const wx = fbm(x * 1.6, y * 1.6, z * 1.6, seed ^ 0x11, 3, 2, 0.5) - 0.5;
  const wy = fbm(x * 1.6 + 4.1, y * 1.6 + 2.3, z * 1.6 + 7.7, seed ^ 0x22, 3, 2, 0.5) - 0.5;
  const wz = fbm(x * 1.6 + 9.2, y * 1.6 + 5.5, z * 1.6 + 1.3, seed ^ 0x33, 3, 2, 0.5) - 0.5;
  let px = x + wx * amp, py = y + wy * amp, pz = z + wz * amp;
  const l = Math.hypot(px, py, pz) || 1;
  return [px / l, py / l, pz / l];
}

/** Blob field: max over N warped caps. Returns 0..1 per cell into `out`. */
function blobField(out, seed, centres, radius, warpAmp) {
  for (let c = 0; c < NC; c++) {
    const p = warpDir(c, seed, warpAmp);
    let best = 0;
    for (const q of centres) {
      const d = p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      const k = smoothstep(Math.cos(radius * 1.35), Math.cos(radius * 0.55), d);
      if (k > best) best = k;
    }
    out[c] = best;
  }
  return out;
}

/* --------------------------------------------------------------- shapes -- */

function shapePangaea(W, m, seed, rng) {
  blobField(m, seed, [randomUnit(rng)], 1.25, 0.42);
}

function shapeTwoWorlds(W, m, seed, rng) {
  const a = randomUnit(rng);
  // Second centre roughly opposed, then jittered so it is not a mirror
  const b = [-a[0], -a[1], -a[2]];
  const j = randomUnit(rng);
  const mix = 0.45;
  const q = [b[0] + j[0] * mix, b[1] + j[1] * mix, b[2] + j[2] * mix];
  const l = Math.hypot(q[0], q[1], q[2]) || 1;
  blobField(m, seed, [a, [q[0] / l, q[1] / l, q[2] / l]], 0.95, 0.38);
}

/** Fixed hemispheres — Americas west, Afro-Eurasia east — with seed-warped coastlines. */
function shapeFamiliar(W, m, seed, rng) {
  const deg = Math.PI / 180;
  const dir = (lat, lon) => {
    const cl = Math.cos(lat * deg), sl = Math.sin(lat * deg);
    const co = Math.cos(lon * deg), si = Math.sin(lon * deg);
    return [cl * co, sl, cl * si];
  };
  const warp = 0.30 + rng() * 0.10;
  const americas = dir(38, -98);
  const oldWorld = dir(28, 24);
  blobField(m, seed, [americas, oldWorld], 0.94, warp);
  const aux = new Float32Array(NC);
  blobField(aux, seed ^ 0x51, [dir(-22, 134)], 0.36, 0.20);
  for (let c = 0; c < NC; c++) m[c] = Math.max(m[c], aux[c] * 0.72);
  blobField(aux, seed ^ 0x52, [dir(-78, 12)], 0.50, 0.16);
  for (let c = 0; c < NC; c++) m[c] = Math.max(m[c], aux[c] * 0.55);
}

function shapeShattered(W, m, seed, rng) {
  // Blobs this size merge into one landmass if they are allowed to touch, which
  // is the failure the archetype exists to avoid — keep them small and many.
  const n = 9 + ((rng() * 5) | 0);
  const centres = [];
  for (let i = 0; i < n; i++) centres.push(randomUnit(rng));
  blobField(m, seed, centres, 0.34, 0.24);
}

function shapeArchipelago(W, m, seed) {
  for (let c = 0; c < NC; c++) {
    const p = warpDir(c, seed, 0.22);
    const arc = ridged(p[0] * 3.1, p[1] * 3.1, p[2] * 3.1, seed ^ 0xa2c, 4);
    const fine = fbm(p[0] * 7.5, p[1] * 7.5, p[2] * 7.5, seed ^ 0xa2d, 4, 2.1, 0.5);
    m[c] = clamp(arc * 0.72 + fine * 0.45 - 0.22, 0, 1);
  }
}

function shapeOcean(W, m, seed, rng) {
  const centres = [randomUnit(rng), randomUnit(rng)];
  blobField(m, seed, centres, 0.40, 0.34);
  for (let c = 0; c < NC; c++) m[c] *= 0.75;
}

function shapeBelt(W, m, seed) {
  for (let c = 0; c < NC; c++) {
    const p = warpDir(c, seed, 0.30);
    const lat = Math.abs(p[1]);
    m[c] = 1 - smoothstep(0.16, 0.58, lat);
  }
}

function shapePolar(W, m, seed) {
  for (let c = 0; c < NC; c++) {
    const p = warpDir(c, seed, 0.30);
    m[c] = smoothstep(0.38, 0.80, Math.abs(p[1]));
  }
}

function shapeDichotomy(W, m, seed, rng) {
  const axis = randomUnit(rng);
  for (let c = 0; c < NC; c++) {
    const p = warpDir(c, seed, 0.36);
    m[c] = smoothstep(-0.28, 0.30, p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2]);
  }
}

function shapeInlandSea(W, m, seed, rng) {
  const centre = randomUnit(rng);
  blobField(m, seed, [centre], 1.15, 0.36);
  // Carve a basin in the interior — a sea with no opening to the ocean
  for (let c = 0; c < NC; c++) {
    const d = dotDir(c, centre);
    const basin = smoothstep(Math.cos(0.34), Math.cos(0.06), d);
    m[c] = clamp(m[c] - basin * 0.95, 0, 1);
  }
}

function shapeHighland(W, m, seed, rng) {
  const centres = [randomUnit(rng), randomUnit(rng), randomUnit(rng)];
  blobField(m, seed, centres, 0.92, 0.34);
  for (let c = 0; c < NC; c++) m[c] = Math.pow(m[c], 0.62);
}

function shapeRidge(W, m, seed, rng) {
  // A long linear spine: distance to a great circle, not to a point
  const pole = randomUnit(rng);
  for (let c = 0; c < NC; c++) {
    const p = warpDir(c, seed, 0.34);
    const off = Math.abs(p[0] * pole[0] + p[1] * pole[1] + p[2] * pole[2]);
    m[c] = 1 - smoothstep(0.10, 0.44, off);
  }
}

function shapeCraterPlain(W, m, seed, rng) {
  for (let c = 0; c < NC; c++) {
    const p = warpDir(c, seed, 0.18);
    m[c] = 0.62 + (fbm(p[0] * 1.5, p[1] * 1.5, p[2] * 1.5, seed ^ 0xc1, 3, 2, 0.5) - 0.5) * 0.5;
  }
  const n = 14 + ((rng() * 10) | 0);
  for (let i = 0; i < n; i++) {
    const q = randomUnit(rng);
    const r = 0.10 + rng() * 0.16;
    const depth = 0.35 + rng() * 0.45;
    for (let c = 0; c < NC; c++) {
      const d = Math.acos(clamp(dotDir(c, q), -1, 1));
      if (d > r * 1.25) continue;
      const k = 1 - smoothstep(r * 0.75, r * 1.25, d);
      m[c] = clamp(m[c] - k * depth + (d > r * 0.85 ? k * 0.18 : 0), 0, 1);
    }
  }
}

/* ------------------------------------------------------------ archetypes -- */

/**
 * `mask` shapes where land is. `land` is the land-fraction target that replaces
 * the ruleset's, `amp` how hard the mask pushes elevation, `relief` a multiplier
 * on the vertical exaggeration the renderer applies.
 */
export const LANDSCAPES = [
  {
    id: 'auto',
    name: 'Ruleset default',
    blurb: 'On Earth play defaults to Familiar — invented coastlines on a recognizable layout.',
    mask: null,
  },
  {
    id: 'pangaea',
    name: 'Pangaea',
    blurb: 'One supercontinent, one world ocean. A dry interior and a single long coast.',
    mask: shapePangaea, land: 0.30, amp: 0.62,
  },
  {
    id: 'twoworlds',
    name: 'Two continents',
    blurb: 'Two landmasses across an ocean from each other. Life on each has to invent itself twice.',
    mask: shapeTwoWorlds, land: 0.30, amp: 0.58,
  },
  {
    id: 'familiar',
    name: 'Familiar Earth',
    blurb: 'Americas west, Afro-Eurasia east, southern ice — coastlines invented, layout recognizable.',
    mask: shapeFamiliar, land: 0.29, amp: 0.56,
  },
  {
    id: 'shattered',
    name: 'Shattered',
    blurb: 'Eight to ten mid-sized continents. Long coastline, many gateways, busy currents.',
    mask: shapeShattered, land: 0.32, amp: 0.52,
  },
  {
    id: 'archipelago',
    name: 'Archipelago',
    blurb: 'Island arcs and no continent at all. Everything is coast; nothing is interior.',
    mask: shapeArchipelago, land: 0.16, amp: 0.46, relief: 0.85,
  },
  {
    id: 'ocean',
    name: 'Ocean world',
    blurb: 'Deep water with a scatter of islands. Almost no land to weather, so carbon has nowhere to go.',
    mask: shapeOcean, land: 0.06, amp: 0.44, relief: 0.8,
  },
  {
    id: 'belt',
    name: 'Equatorial belt',
    blurb: 'A band of land around the equator, poles all ocean. Tropics everywhere, no polar continent to ice over.',
    mask: shapeBelt, land: 0.28, amp: 0.55,
  },
  {
    id: 'polar',
    name: 'Polar continents',
    blurb: 'Land at both poles, ocean through the middle. The ice-albedo feedback has somewhere to stand.',
    mask: shapePolar, land: 0.26, amp: 0.55,
  },
  {
    id: 'dichotomy',
    name: 'Hemispheric dichotomy',
    blurb: 'One highland hemisphere, one lowland basin. Mars did this; a wet one would be half ocean.',
    mask: shapeDichotomy, land: 0.42, amp: 0.60,
  },
  {
    id: 'inland',
    name: 'Inland sea',
    blurb: 'A continent wrapped around water with no way out. Its own salinity, its own tides, its own life.',
    mask: shapeInlandSea, land: 0.40, amp: 0.62,
  },
  {
    id: 'highland',
    name: 'High plateau',
    blurb: 'Broad tablelands with steep margins. Thin air on top, rain shadows below.',
    mask: shapeHighland, land: 0.46, amp: 0.70, relief: 1.25,
  },
  {
    id: 'ridge',
    name: 'Spine',
    blurb: 'One long mountain chain most of the way round the planet, and everything else in its shadow.',
    mask: shapeRidge, land: 0.24, amp: 0.66, relief: 1.2,
  },
  {
    id: 'crater',
    name: 'Cratered plain',
    blurb: 'An old surface nothing has resurfaced. Basins, rims, and no drainage worth the name.',
    mask: shapeCraterPlain, land: 0.55, amp: 0.50, relief: 0.9,
  },
];

export function landscapeById(id) {
  return LANDSCAPES.find((l) => l.id === id) || LANDSCAPES[0];
}

/**
 * Apply an archetype to the generated heightfield.
 * Returns the archetype (so the caller can read `land` / `relief`), or null
 * when there is nothing to do — in which case `W.h` is untouched.
 */
export function applyLandscape(W, seed, id, opts = {}) {
  const ls = landscapeById(id);
  if (!ls?.mask) return null;

  const rng = forkRng(seed, 'land');
  const m = new Float32Array(NC);
  ls.mask(W, m, seed >>> 0, rng);

  // Mean-centre the mask so the archetype moves geography, not global volume:
  // fitSeaLevel then only has to find the contour, not undo a global offset.
  let mean = 0;
  for (let c = 0; c < NC; c++) mean += m[c];
  mean /= NC;

  const amp = (opts.amp ?? ls.amp ?? 0.55) * 1.15;
  const blend = clamp(opts.blend ?? 1, 0, 1);
  for (let c = 0; c < NC; c++) {
    const push = (m[c] - mean) * amp;
    W.h[c] = clamp(W.h[c] * (1 - blend * 0.15) + push * blend, -1.2, 1.2);
    // Continental mask also thickens crust, so isostasy agrees with the shape
    if (W.crust) {
      W.crust[c] = clamp(lerp(W.crust[c], 0.28 + m[c] * 0.62, blend * 0.55), 0.05, 1.8);
    }
  }
  W._landscape = ls.id;
  return ls;
}

/** Count separate landmasses and their sizes — the number seeds never changed. */
export function landmassReport(W) {
  const seen = new Uint8Array(NC);
  const sizes = [];
  for (let c = 0; c < NC; c++) {
    if (seen[c] || W.h[c] < W.seaLevel) continue;
    let n = 0;
    const stack = [c];
    seen[c] = 1;
    while (stack.length) {
      const x = stack.pop();
      n++;
      for (let k = 0; k < 4; k++) {
        const nb = NBR[x * 4 + k];
        if (nb >= 0 && !seen[nb] && W.h[nb] >= W.seaLevel) { seen[nb] = 1; stack.push(nb); }
      }
    }
    sizes.push(n);
  }
  sizes.sort((a, b) => b - a);
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  return {
    count: sizes.length,
    sizes,
    largestShare: sizes.length ? sizes[0] / total : 0,
    islands: sizes.filter((s) => s <= 10).length,
    landFrac: total / NC,
    coastKm: coastlineKm(W),
  };
}

/** Coast cells × mean cell width — a length, not a fractal. */
export function coastlineKm(W) {
  const km = cellKm();
  let n = 0;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) continue;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      if (nb >= 0 && W.h[nb] < W.seaLevel) { n++; break; }
    }
  }
  return n * km;
}

const NAME_ADJ = ['Quiet', 'Bright', 'Long', 'Broken', 'Far', 'Deep', 'High', 'Wide', 'Old', 'New'];

/** A readable name from seed + archetype — "Broken Shattered", "Quiet Pangaea". */
export function nameWorld(seed, id) {
  const ls = landscapeById(id);
  const adj = NAME_ADJ[(seed >>> 0) % NAME_ADJ.length];
  if (!ls || ls.id === 'auto') return `${adj} continents`;
  return `${adj} ${ls.name}`;
}

/** Fill a 0..1 mask without touching W.h — used for picker thumbnails. */
export function landscapeMask(id, seed) {
  const ls = landscapeById(id);
  const m = new Float32Array(NC);
  const rng = forkRng(seed, 'land');
  if (!ls?.mask) {
    const pangaea = landscapeById('pangaea');
    pangaea.mask({ h: m }, m, seed >>> 0, rng);
    return m;
  }
  ls.mask({ h: m }, m, seed >>> 0, rng);
  return m;
}

function splatDisc(data, size, cx, cy, rad, r, g, b) {
  const x0 = Math.max(0, (cx - rad) | 0);
  const x1 = Math.min(size - 1, (cx + rad) | 0);
  const y0 = Math.max(0, (cy - rad) | 0);
  const y1 = Math.min(size - 1, (cy + rad) | 0);
  const r2 = rad * rad;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy > r2) continue;
      const o = (y * size + x) * 4;
      data[o] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      data[o + 3] = 255;
    }
  }
}

/** Orthographic dayside globe — filled discs + limb, not a 1-pixel stamp per cell. */
export function drawLandscapeThumb(ctx, seed, id, size = 128) {
  const m = landscapeMask(id, seed);
  let lo = 1, hi = 0;
  for (let c = 0; c < NC; c++) {
    if (DIR[c * 3 + 2] < 0.05) continue;
    if (m[c] < lo) lo = m[c];
    if (m[c] > hi) hi = m[c];
  }
  const span = Math.max(1e-6, hi - lo);
  const thresh = lo + span * 0.38;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const cx = size * 0.5, cy = size * 0.5;
  const r = size * 0.46;
  const r2 = r * r;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      const o = (y * size + x) * 4;
      if (d2 > (r + 2.6) * (r + 2.6)) {
        data[o] = 6; data[o + 1] = 9; data[o + 2] = 16; data[o + 3] = 255;
      } else if (d2 > r2) {
        const t = 1 - (Math.sqrt(d2) - r) / 2.6;
        data[o] = 40 + t * 50;
        data[o + 1] = 90 + t * 70;
        data[o + 2] = 160 + t * 50;
        data[o + 3] = 255;
      } else {
        data[o] = 12; data[o + 1] = 22; data[o + 2] = 48; data[o + 3] = 255;
      }
    }
  }
  const rad = Math.max(1.6, (size * 0.9) / Math.sqrt(NC));
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    if (z < 0.04) continue;
    const px = cx + x * r;
    const py = cy - y * r;
    const land = m[c];
    const t = clamp((land - lo) / span, 0, 1);
    const limb = 0.38 + 0.62 * z;
    let cr, cg, cb;
    if (land >= thresh) {
      cr = (55 + t * 150) * limb;
      cg = (95 + t * 110) * limb;
      cb = (42 + (1 - t) * 36) * limb;
    } else {
      cr = (16 + t * 28) * limb;
      cg = (48 + t * 70) * limb;
      cb = (110 + t * 50) * limb;
    }
    splatDisc(data, size, px, py, rad, cr, cg, cb);
  }
  ctx.putImageData(img, 0, 0);
}
