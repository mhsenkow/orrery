/** Distinctive geology per active world.
 *  generateTectonics always builds Voronoi plates; this pass overwrites the
 *  heightfield so Mars is a dichotomy, Venus is plains + tesserae, Io is
 *  paterae, the Moon is maria, and a generic stagnant lid is cratered — not a
 *  slow Earth. Ice worlds are owned by iceshell.js. */

import { clamp, lerp, fbm, ridged, mulberry32 } from '../math.js';
import { NC, DIR } from '../sphere.js';

function randomUnit(rng) {
  const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
  return [r * Math.cos(th), u, r * Math.sin(th)];
}

function norm3(x, y, z) {
  const L = Math.hypot(x, y, z) || 1;
  return [x / L, y / L, z / L];
}

function dotDir(c, p) {
  return DIR[c * 3] * p[0] + DIR[c * 3 + 1] * p[1] + DIR[c * 3 + 2] * p[2];
}

function bowl(d, rim, floor) {
  if (d < floor) return 1;
  if (d > rim) return 0;
  const t = (d - floor) / Math.max(1e-6, rim - floor);
  return (1 - t) * (1 - t);
}

function ring(d, inner, outer) {
  if (d < inner || d > outer) return 0;
  const mid = (inner + outer) * 0.5;
  const w = (outer - inner) * 0.5;
  return 1 - Math.abs(d - mid) / Math.max(1e-6, w);
}

/** Catalogue / ruleset → a geology kind. Ice shells are a separate path. */
export function planetKind(rule) {
  if (!rule) return 'generic';
  if (rule.earthLike) return 'earth';
  if (rule.daisyworld) return 'daisy';
  const name = `${rule.id || ''} ${rule.name || ''} ${rule._catalogueItem?.b || ''} ${rule._catalogueItem?.t || ''}`.toLowerCase();
  const lid = rule.interior?.lidMode || rule.lidMode || '';
  if (lid === 'none' || /jupiter|saturn|uranus|neptune/.test(name)) return 'gas';
  if (rule.iceShell || lid === 'ice') {
    if (/enceladus/.test(name)) return 'enceladus';
    if (/titan/.test(name)) return 'titan';
    if (/pluto/.test(name)) return 'pluto';
    if (/triton/.test(name)) return 'triton';
    if (/ganymede/.test(name)) return 'ganymede';
    if (/callisto/.test(name)) return 'callisto';
    return 'europa';
  }
  if (/\bio\b/.test(name) && !/ion/.test(name)) return 'io';
  if ((rule.tidalHeat || 0) > 0.8 && !rule.iceShell) return 'io';
  if (/venus/.test(name) || lid === 'episodic') return 'venus';
  if (rule.id === 'ares' || rule.signature === 'dust' || /\bmars\b/.test(name)) return 'mars';
  if (/mercury/.test(name)) return 'mercury';
  if (rule.id === 'selene' || /\bmoon\b|selene/.test(name)) return 'moon';
  if (rule.airless) return 'airless';
  if (rule.magmaOcean) return 'magma';
  if (lid === 'stagnant') return 'stagnant';
  return 'generic';
}

function stampCraters(h, seed, opts = {}) {
  const rng = mulberry32((seed ^ 0x63525452) >>> 0);
  const nLarge = opts.nLarge ?? 6;
  const nMid = opts.nMid ?? 28;
  const depth = opts.depth ?? 0.22;
  const basins = [];
  for (let i = 0; i < nLarge + nMid; i++) {
    basins.push({
      p: randomUnit(rng),
      rim: i < nLarge ? 0.88 + rng() * 0.08 : 0.955 + rng() * 0.03,
      floor: i < nLarge ? 0.97 + rng() * 0.02 : 0.985 + rng() * 0.01,
      d: (i < nLarge ? 1.15 : 0.55) * depth * (0.55 + rng() * 0.7),
    });
  }
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    let elev = h[c];
    const micro = ridged(x * 4.2, y * 4.2, z * 4.2, seed ^ 0x63726174, 3);
    if (micro > 0.78) elev -= (micro - 0.78) * (opts.micro ?? 0.55);
    let pit = 0, rimAdd = 0;
    for (const b of basins) {
      const d = dotDir(c, b.p);
      const k = bowl(d, b.rim, b.floor);
      if (k > 0) pit = Math.max(pit, k * b.d);
      const rimH = ring(d, b.rim - 0.012, Math.min(0.999, b.rim + 0.008));
      if (rimH > 0) rimAdd = Math.max(rimAdd, rimH * b.d * 0.22);
    }
    elev -= pit;
    elev += rimAdd;
    h[c] = clamp(elev, -1.2, 1.2);
  }
}

function dryWorld(W, floor = -0.85) {
  W.seaLevel = Math.min(W.seaLevel ?? 0, floor);
  if (W.plates) for (const pl of W.plates) {
    pl.oceanic = false;
    pl.omega = (pl.omega || 0) * 0.08;
  }
}

function addVent(W, cell, opts = {}) {
  if (!W.volcanoes) W.volcanoes = [];
  W.volcanoes.push({
    cell,
    magma: opts.magma ?? 0.9,
    next: opts.next ?? 8,
    silica: opts.silica ?? 0.48,
    hotspot: !!opts.hotspot,
  });
}

function stampMars(W, seed) {
  const h = W.h, crust = W.crust, age = W.age, rock = W.rock;
  const dich = norm3(0.10, 0.985, 0.14);
  const tharsis = norm3(0.18, 0.06, 0.982);
  const olympus = norm3(0.42, 0.12, 0.90);
  const hellas = norm3(-0.38, -0.78, 0.50);
  const vallesA = tharsis;
  const vallesB = norm3(-0.55, 0.02, 0.83);

  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const north = dotDir(c, dich);
    const high = clamp((-north + 0.08) * 0.55, -0.22, 0.28);
    let elev = 0.06 + high;
    crust[c] = north > 0.04 ? 0.32 + (1 - north) * 0.12 : 0.62 + (-north) * 0.18;
    age[c] = north > 0.04 ? 800 + (1 - north) * 400 : 2200 + (-north) * 900;
    rock[c] = 0;

    const tb = bowl(dotDir(c, tharsis), 0.55, 0.97);
    elev += tb * 0.22;
    crust[c] = Math.max(crust[c], 0.55 + tb * 0.55);
    const om = bowl(dotDir(c, olympus), 0.965, 0.994);
    elev += om * 0.48;
    const he = bowl(dotDir(c, hellas), 0.82, 0.955);
    elev -= he * 0.38;
    if (he > 0.15) {
      crust[c] *= 0.55;
      age[c] = Math.min(age[c], 900);
    }

    // Valles Marineris: a narrow equatorial canyon east of Tharsis
    const along = dotDir(c, vallesA) * 0.45 + dotDir(c, vallesB) * 0.55;
    const cx = y * vallesB[2] - z * vallesB[1];
    const cy = z * vallesB[0] - x * vallesB[2];
    const cz = x * vallesB[1] - y * vallesB[0];
    const off = Math.hypot(cx, cy, cz);
    if (along > 0.15 && along < 0.82 && off < 0.055 && Math.abs(y) < 0.22) {
      elev -= (0.055 - off) / 0.055 * 0.16;
    }

    const polar = y * y;
    if (polar > 0.78) elev += (polar - 0.78) * 0.12;
    elev += (fbm(x * 2.4, y * 2.4, z * 2.4, seed ^ 0x4d617273, 3, 2, 0.5) - 0.5) * 0.05;
    h[c] = clamp(elev, -1.2, 1.2);
  }
  stampCraters(h, seed, { nLarge: 5, nMid: 22, depth: 0.16, micro: 0.35 });
  dryWorld(W, -0.72);
  // One long-lived Tharsis hotspot — stagnant lid lets it build in place
  let best = 0, bd = -2;
  for (let c = 0; c < NC; c++) {
    const d = dotDir(c, olympus);
    if (d > bd) { bd = d; best = c; }
  }
  addVent(W, best, { magma: 1.8, next: 2, hotspot: true, silica: 0.47 });
  W.hotspots = [{ pos: olympus, strength: 0.55, fixed: true }];
}

function stampVenus(W, seed) {
  const h = W.h, crust = W.crust, age = W.age, rock = W.rock;
  const rng = mulberry32((seed ^ 0x56454e55) >>> 0);
  const tessera = [randomUnit(rng), randomUnit(rng), randomUnit(rng)];
  const coronae = [];
  for (let i = 0; i < 7; i++) coronae.push({ p: randomUnit(rng), r: 0.90 + rng() * 0.06 });

  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    let elev = 0.10 + (fbm(x * 1.6, y * 1.6, z * 1.6, seed ^ 0x706c616e, 3, 2, 0.48) - 0.5) * 0.04;
    crust[c] = 0.48 + (fbm(x * 1.1, y * 1.1, z * 1.1, seed, 2, 2, 0.5) - 0.5) * 0.08;
    age[c] = 450 + fbm(x * 0.8, y * 0.8, z * 0.8, seed ^ 0x616765, 2, 2, 0.5) * 120;
    rock[c] = 0;

    let tes = 0;
    for (const t of tessera) tes = Math.max(tes, clamp((dotDir(c, t) - 0.72) * 3.2, 0, 1));
    if (tes > 0) {
      const rough = ridged(x * 5.5, y * 5.5, z * 5.5, seed ^ 0x74657373, 4);
      elev += tes * (0.14 + rough * 0.08);
      crust[c] += tes * 0.22;
      age[c] += tes * 400;
      rock[c] = 2;
    }
    for (const co of coronae) {
      const d = dotDir(c, co.p);
      const k = ring(d, co.r - 0.025, co.r + 0.012);
      elev += k * 0.045;
      const well = bowl(d, co.r - 0.01, co.r + 0.03) * 0.15;
      elev -= well * 0.03;
    }
    // Wrinkle ridges: low-amplitude linear fabric on the plains
    if (tes < 0.2) {
      const wr = Math.sin(x * 18 + z * 11) * Math.sin(y * 9 + x * 7);
      if (wr > 0.55) elev += (wr - 0.55) * 0.04;
    }
    h[c] = clamp(elev, -1.2, 1.2);
  }
  dryWorld(W, -0.7);
}

function stampMoon(W, seed) {
  const h = W.h, crust = W.crust, age = W.age, rock = W.rock;
  // +X nearside. SPA-scale basin on the farside.
  const spa = norm3(-0.82, -0.35, 0.45);
  const maria = [
    norm3(0.92, 0.22, 0.32),
    norm3(0.88, -0.18, 0.44),
    norm3(0.78, 0.48, -0.40),
    norm3(0.70, -0.42, -0.58),
  ];
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3];
    const nearside = clamp(x, -1, 1);
    let elev = 0.08 + (-nearside) * 0.07;
    crust[c] = 0.42 + (-nearside) * 0.22;
    age[c] = 3900 + (-nearside) * 400;
    rock[c] = 2;
    const he = bowl(dotDir(c, spa), 0.78, 0.94);
    elev -= he * 0.22;
    if (he > 0.2) crust[c] *= 0.7;
    for (const m of maria) {
      const d = dotDir(c, m);
      const k = bowl(d, 0.88, 0.97);
      if (k > 0.12 && nearside > -0.15) {
        elev = lerp(elev, 0.02, k);
        rock[c] = 0;
        age[c] = Math.min(age[c], 3200);
        crust[c] = Math.min(crust[c], 0.38);
      }
    }
    h[c] = clamp(elev, -1.2, 1.2);
  }
  stampCraters(h, seed, { nLarge: 8, nMid: 40, depth: 0.28, micro: 0.7 });
  dryWorld(W, -0.9);
}

function stampMercury(W, seed) {
  const h = W.h, crust = W.crust, age = W.age, rock = W.rock;
  const caloris = norm3(0.55, 0.15, 0.82);
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    let elev = 0.06 + (fbm(x * 1.8, y * 1.8, z * 1.8, seed, 3, 2, 0.5) - 0.5) * 0.04;
    crust[c] = 0.36;
    age[c] = 4000;
    rock[c] = 0;
    const ca = bowl(dotDir(c, caloris), 0.80, 0.95);
    elev -= ca * 0.26;
    // Antipodal chaotic terrain
    const anti = bowl(-dotDir(c, caloris), 0.88, 0.97);
    if (anti > 0) elev += (ridged(x * 9, y * 9, z * 9, seed ^ 0x616e7469, 3) - 0.4) * anti * 0.08;
    // Lobate scarps — global contraction expressed as long thrust ridges
    const sc = Math.sin(x * 7.5 + z * 4.2) * Math.cos(y * 5.5);
    if (sc > 0.62) elev += (sc - 0.62) * 0.07;
    h[c] = clamp(elev, -1.2, 1.2);
  }
  stampCraters(h, seed, { nLarge: 6, nMid: 32, depth: 0.24, micro: 0.55 });
  dryWorld(W, -0.9);
}

function stampIo(W, seed) {
  const h = W.h, crust = W.crust, age = W.age, rock = W.rock;
  const rng = mulberry32((seed ^ 0x494f564f) >>> 0);
  const paterae = [];
  for (let i = 0; i < 36; i++) {
    paterae.push({ p: randomUnit(rng), r: 0.955 + rng() * 0.03, d: 0.04 + rng() * 0.05 });
  }
  const mtns = [];
  for (let i = 0; i < 8; i++) mtns.push({ p: randomUnit(rng), h: 0.16 + rng() * 0.14 });

  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    let elev = 0.08 + (fbm(x * 2.2, y * 2.2, z * 2.2, seed, 2, 2, 0.5) - 0.5) * 0.03;
    crust[c] = 0.28;
    age[c] = 1 + rng() * 8;
    rock[c] = 0;
    for (const p of paterae) {
      const k = bowl(dotDir(c, p.p), p.r, p.r + 0.028);
      elev -= k * p.d;
    }
    for (const m of mtns) {
      const k = bowl(dotDir(c, m.p), 0.965, 0.992);
      elev += k * m.h;
    }
    h[c] = clamp(elev, -1.2, 1.2);
  }
  dryWorld(W, -0.9);
  W.volcanoes = [];
  W.hotspots = [];
  for (const p of paterae) {
    let best = 0, bd = -2;
    for (let c = 0; c < NC; c++) {
      const d = dotDir(c, p.p);
      if (d > bd) { bd = d; best = c; }
    }
    addVent(W, best, { magma: 1.1 + rng() * 0.7, next: rng() * 12, silica: 0.46 });
    W.hotspots.push({ pos: p.p, strength: 0.2 + rng() * 0.25, fixed: true });
  }
  if (W.interior) W.interior.heatFlow = Math.max(W.interior.heatFlow || 0, 2.0);
}

function stampStagnant(W, seed) {
  const h = W.h, crust = W.crust;
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    const base = 0.08 + (fbm(x * 1.3, y * 1.3, z * 1.3, seed, 4, 2, 0.5) - 0.48) * 0.10;
    h[c] = clamp(base, -1.2, 1.2);
    crust[c] = 0.50 + (fbm(x, y, z, seed ^ 1, 2, 2, 0.5) - 0.5) * 0.12;
    W.age[c] = 1500 + fbm(x, y, z, seed ^ 2, 2, 2, 0.5) * 2000;
    W.rock[c] = 0;
  }
  stampCraters(h, seed, { nLarge: 4, nMid: 18, depth: 0.18, micro: 0.4 });
  dryWorld(W, -0.75);
}

function stampAirless(W, seed) {
  stampStagnant(W, seed);
  stampCraters(W.h, seed ^ 0x11, { nLarge: 7, nMid: 36, depth: 0.26, micro: 0.65 });
  dryWorld(W, -0.9);
}

function stampMagma(W, seed) {
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    W.h[c] = 0.02 + (fbm(x * 1.4, y * 1.4, z * 1.4, seed, 2, 2, 0.5) - 0.5) * 0.02;
    W.crust[c] = 0.12;
    W.age[c] = 0;
    W.rock[c] = 0;
    if (W.lava) W.lava[c] = 0.55 + fbm(x * 3, y * 3, z * 3, seed, 2, 2, 0.5) * 0.35;
  }
  dryWorld(W, -0.9);
}

function stampGas(W) {
  for (let c = 0; c < NC; c++) {
    W.h[c] = 0;
    W.crust[c] = 0;
    W.age[c] = 0;
  }
  W.seaLevel = 0;
  W.volcanoes = [];
  W.hotspots = [];
}

/**
 * Overwrite Voronoi-Earth hypsometry with the landforms this world actually has.
 * No-op for Earth, Daisyworld, and ice-shell worlds (iceshell.js owns those).
 */
export function refinePlanetHypsometry(W, seed, rule) {
  const kind = planetKind(rule);
  W._planetKind = kind;
  if (kind === 'earth' || kind === 'daisy') return kind;
  if (kind === 'europa' || kind === 'enceladus' || kind === 'titan'
    || kind === 'pluto' || kind === 'triton' || kind === 'ganymede' || kind === 'callisto') {
    return kind;
  }
  if (kind === 'mars') stampMars(W, seed);
  else if (kind === 'venus') stampVenus(W, seed);
  else if (kind === 'moon') stampMoon(W, seed);
  else if (kind === 'mercury') stampMercury(W, seed);
  else if (kind === 'io') stampIo(W, seed);
  else if (kind === 'magma') stampMagma(W, seed);
  else if (kind === 'gas') stampGas(W);
  else if (kind === 'airless') stampAirless(W, seed);
  else if (kind === 'stagnant') stampStagnant(W, seed);
  return kind;
}
