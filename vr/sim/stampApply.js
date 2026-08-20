/** Apply authored stamp ops from stamps.json onto a world heightfield.
 *
 *  Primitives (bowl, dome, canyon, dichotomy, …) are the landform grammar
 *  expressed as height. Kind selection still comes from planetKind; this file
 *  never names a Solar-System body. */

import { clamp, lerp, fbm, ridged, mulberry32 } from '../math.js';
import { NC, DIR } from '../sphere.js';
import { STAMP_BY_ID } from './stampTable.js';

function randomUnit(rng) {
  const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
  return [r * Math.cos(th), u, r * Math.sin(th)];
}

function norm3(v) {
  const L = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / L, v[1] / L, v[2] / L];
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

/** Resolve seedXor: integer, or a 4-char tag like "Mars" / "plan". */
export function seedTag(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v >>> 0;
  if (typeof v === 'string' && v.length) {
    let x = 0;
    for (let i = 0; i < v.length; i++) x = ((x << 8) | (v.charCodeAt(i) & 0xff)) >>> 0;
    return x;
  }
  return 0;
}

function noiseAt(c, seed, n) {
  if (!n) return 0;
  const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
  const s = (seed ^ seedTag(n.seedXor)) >>> 0;
  const sc = n.scale ?? 1;
  const oct = n.octaves ?? 3;
  const lac = n.lac ?? 2;
  const gain = n.gain ?? 0.5;
  const center = n.center ?? 0.5;
  return (fbm(x * sc, y * sc, z * sc, s, oct, lac, gain) - center) * (n.amp ?? 0.04);
}

export function stampCraters(h, seed, opts = {}) {
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

export function dryWorld(W, floor = -0.85) {
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

function nearestCell(p) {
  let best = 0, bd = -2;
  for (let c = 0; c < NC; c++) {
    const d = dotDir(c, p);
    if (d > bd) { bd = d; best = c; }
  }
  return best;
}

/** Shared RNG bag filled once per kind so random ops share a stream. */
function prepRandom(spec, seed) {
  const bag = { tessera: [], coronae: [], paterae: [], burial: [] };
  for (const op of spec.ops || []) {
    if (op.type === 'randomTessera') {
      const rng = mulberry32((seed ^ seedTag(op.seedXor)) >>> 0);
      for (let i = 0; i < (op.count || 3); i++) bag.tessera.push(randomUnit(rng));
      // Continue same stream for coronae that share seedXor (Venus).
      bag._venusRng = rng;
    }
    if (op.type === 'randomCorona') {
      const rng = bag._venusRng || mulberry32((seed ^ seedTag(op.seedXor)) >>> 0);
      for (let i = 0; i < (op.count || 7); i++) {
        bag.coronae.push({ p: randomUnit(rng), r: (op.rim?.[0] ?? 0.9) + rng() * (op.rim?.[1] ?? 0.06) });
      }
    }
    if (op.type === 'randomPatera') {
      const rng = mulberry32((seed ^ seedTag(op.seedXor)) >>> 0);
      for (let i = 0; i < (op.count || 36); i++) {
        bag.paterae.push({
          p: randomUnit(rng),
          r: (op.rim?.[0] ?? 0.955) + rng() * (op.rim?.[1] ?? 0.03),
          d: (op.depth?.[0] ?? 0.04) + rng() * (op.depth?.[1] ?? 0.05),
        });
      }
      bag._ioRng = rng;
    }
    if (op.type === 'randomBurial') {
      const rng = bag._ioRng || mulberry32((seed ^ seedTag(op.seedXor)) >>> 0);
      for (let i = 0; i < (op.count || 8); i++) {
        bag.burial.push({
          p: randomUnit(rng),
          h: (op.h?.[0] ?? 0.16) + rng() * (op.h?.[1] ?? 0.14),
        });
      }
      bag._ioRng = rng;
    }
    if (op.type === 'base' && op.ageRand) {
      bag._ageRng = mulberry32((seed ^ seedTag(op.seedXor)) >>> 0);
    }
  }
  return bag;
}

function applyOp(W, seed, op, bag, state) {
  const h = W.h, crust = W.crust, age = W.age, rock = W.rock;
  const type = op.type;

  if (type === 'noSurface') {
    W.noSurface = true;
    for (let c = 0; c < NC; c++) { h[c] = 0; crust[c] = 0; age[c] = 0; }
    W.seaLevel = 0;
    W._seaBase = 0;
    W.volcanoes = [];
    W.hotspots = [];
    W.plates = [];
    return;
  }

  if (type === 'dichotomy') {
    const axis = norm3(op.axis);
    for (let c = 0; c < NC; c++) {
      const north = dotDir(c, axis);
      const high = clamp((-north + (op.bias ?? 0.08)) * (op.amp ?? 0.55), -0.22, 0.28);
      h[c] = (op.base ?? 0.06) + high;
      crust[c] = north > 0.04
        ? op.crustN[0] + (1 - north) * op.crustN[1]
        : op.crustS[0] + (-north) * op.crustS[1];
      age[c] = north > 0.04
        ? op.ageN[0] + (1 - north) * op.ageN[1]
        : op.ageS[0] + (-north) * op.ageS[1];
      rock[c] = 0;
    }
    return;
  }

  if (type === 'base') {
    const rng = bag._ageRng;
    for (let c = 0; c < NC; c++) {
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      let elev = op.elev ?? 0.08;
      if (op.noise) {
        const n = op.noise;
        elev += (fbm(x * (n.scale || 1), y * (n.scale || 1), z * (n.scale || 1),
          (seed ^ seedTag(n.seedXor)) >>> 0, n.octaves || 3, n.lac || 2, n.gain || 0.5) - (n.center ?? 0.5)) * (n.amp ?? 0.04);
      }
      h[c] = elev;
      if (op.crust != null) {
        let cr = op.crust;
        if (op.crustNoise) {
          const n = op.crustNoise;
          cr += (fbm(x * (n.scale || 1), y * (n.scale || 1), z * (n.scale || 1),
            (seed ^ seedTag(n.seedXor)) >>> 0, n.octaves || 2, 2, 0.5) - 0.5) * (n.amp ?? 0.08);
        }
        crust[c] = cr;
      }
      if (op.ageRand && rng) age[c] = op.ageRand[0] + rng() * op.ageRand[1];
      else if (op.age != null) {
        let a = op.age;
        if (op.ageNoise) {
          const n = op.ageNoise;
          a += fbm(x * (n.scale || 1), y * (n.scale || 1), z * (n.scale || 1),
            (seed ^ seedTag(n.seedXor)) >>> 0, n.octaves || 2, 2, 0.5) * (n.amp || 0);
        }
        age[c] = a;
      }
      if (op.rockFromX) rock[c] = DIR[c * 3] > 0 ? 0 : 2;
      else if (op.rock != null) rock[c] = op.rock;
    }
    return;
  }

  if (type === 'axis') {
    for (let c = 0; c < NC; c++) {
      const nearside = clamp(DIR[c * 3], -1, 1);
      // elev = base + (-nearside) * k  where amp stores -k (moon amp = -0.07)
      h[c] = (op.base ?? 0.08) + nearside * (op.amp ?? -0.07);
      crust[c] = op.crust[0] + nearside * op.crust[1];
      age[c] = op.age[0] + nearside * op.age[1];
      rock[c] = op.rock ?? 2;
    }
    return;
  }

  if (type === 'dome' || type === 'bowl') {
    const at = norm3(op.at);
    const sign = type === 'dome' ? 1 : -1;
    for (let c = 0; c < NC; c++) {
      const k = bowl(dotDir(c, at), op.rim, op.floor);
      h[c] += sign * k * (op.amp ?? 0.2);
      if (op.crustBoost && type === 'dome') {
        crust[c] = Math.max(crust[c], op.crustBoost[0] + k * op.crustBoost[1]);
      }
      if (type === 'bowl' && op.thinAt != null && k > op.thinAt) {
        if (op.thinCrust != null) crust[c] *= op.thinCrust;
        if (op.maxAge != null) age[c] = Math.min(age[c], op.maxAge);
      }
      if (op.iceAt != null && k > op.iceAt && W.ice) {
        W.ice[c] = Math.max(W.ice[c] || 0, (op.iceBase ?? 0.55) + k * (op.iceAmp ?? 0.35));
        if (W.iceLand) W.iceLand[c] = W.ice[c];
      }
    }
    if (op.at) state.lastBowl = { at, amp: op.amp };
    return;
  }

  if (type === 'canyon') {
    const a = norm3(op.from), b = norm3(op.to);
    for (let c = 0; c < NC; c++) {
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      const along = dotDir(c, a) * (op.wFrom ?? 0.45) + dotDir(c, b) * (op.wTo ?? 0.55);
      const cx = y * b[2] - z * b[1];
      const cy = z * b[0] - x * b[2];
      const cz = x * b[1] - y * b[0];
      const off = Math.hypot(cx, cy, cz);
      const width = op.width ?? 0.055;
      if (along > op.along[0] && along < op.along[1] && off < width && Math.abs(y) < (op.latMax ?? 0.22)) {
        h[c] -= (width - off) / width * (op.amp ?? 0.16);
      }
    }
    return;
  }

  if (type === 'chasma') {
    const axis = norm3(op.at);
    for (let c = 0; c < NC; c++) {
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      const along = dotDir(c, axis);
      const off = Math.hypot(y * axis[2] - z * axis[1], z * axis[0] - x * axis[2], x * axis[1] - y * axis[0]);
      const width = op.width ?? 0.045;
      if (along > (op.along ?? -0.2) && off < width) {
        h[c] -= (width - off) / width * (op.amp ?? 0.12);
      }
    }
    return;
  }

  if (type === 'polarBoost') {
    for (let c = 0; c < NC; c++) {
      const y = DIR[c * 3 + 1];
      const polar = y * y;
      if (polar > (op.gt ?? 0.78)) h[c] += (polar - op.gt) * (op.amp ?? 0.12);
    }
    return;
  }

  if (type === 'noise') {
    for (let c = 0; c < NC; c++) h[c] += noiseAt(c, seed, op);
    return;
  }

  if (type === 'maria') {
    for (const m of op.at) {
      const p = norm3(m);
      for (let c = 0; c < NC; c++) {
        const nearside = DIR[c * 3];
        const k = bowl(dotDir(c, p), op.rim, op.floor);
        if (k > (op.minK ?? 0.12) && nearside > (op.nearside ?? -0.15)) {
          h[c] = lerp(h[c], op.target ?? 0.02, k);
          rock[c] = op.rock ?? 0;
          if (op.maxAge != null) age[c] = Math.min(age[c], op.maxAge);
          if (op.maxCrust != null) crust[c] = Math.min(crust[c], op.maxCrust);
        }
      }
    }
    return;
  }

  if (type === 'randomTessera') {
    for (let c = 0; c < NC; c++) {
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      let tes = 0;
      for (const t of bag.tessera) tes = Math.max(tes, clamp((dotDir(c, t) - (op.dot ?? 0.72)) * (op.scale ?? 3.2), 0, 1));
      if (tes > 0) {
        const rough = ridged(x * 5.5, y * 5.5, z * 5.5, seed ^ 0x74657373, 4);
        h[c] += tes * ((op.amp ?? 0.14) + rough * (op.rough ?? 0.08));
        crust[c] += tes * (op.crust ?? 0.22);
        age[c] += tes * (op.age ?? 400);
        rock[c] = op.rock ?? 2;
      }
      state.tessera[c] = tes;
    }
    return;
  }

  if (type === 'randomCorona') {
    for (let c = 0; c < NC; c++) {
      for (const co of bag.coronae) {
        const d = dotDir(c, co.p);
        const k = ring(d, co.r - (op.ringW?.[0] ?? 0.025), co.r + (op.ringW?.[1] ?? 0.012));
        h[c] += k * (op.ringAmp ?? 0.045);
        const well = bowl(d, co.r - 0.01, co.r + 0.03) * 0.15;
        h[c] -= well * (op.wellAmp ?? 0.03);
      }
    }
    return;
  }

  if (type === 'wrinkle') {
    for (let c = 0; c < NC; c++) {
      if ((state.tessera?.[c] || 0) >= (op.skipTessera ?? 0.2)) continue;
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      const wr = Math.sin(x * op.a[0] + z * op.a[1]) * Math.sin(y * op.b[0] + x * op.b[1]);
      if (wr > (op.gt ?? 0.55)) h[c] += (wr - op.gt) * (op.amp ?? 0.04);
    }
    return;
  }

  if (type === 'scarp') {
    for (let c = 0; c < NC; c++) {
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      const sc = Math.sin(x * op.a[0] + z * op.a[1]) * Math.cos(y * (op.b ?? 5.5));
      if (sc > (op.gt ?? 0.62)) h[c] += (sc - op.gt) * (op.amp ?? 0.07);
    }
    return;
  }

  if (type === 'antipode') {
    const of = norm3(op.of);
    for (let c = 0; c < NC; c++) {
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      const anti = bowl(-dotDir(c, of), op.rim, op.floor);
      if (anti > 0) {
        h[c] += (ridged(x * 9, y * 9, z * 9, seed ^ seedTag(op.seedXor), 3) - 0.4) * anti * (op.amp ?? 0.08);
      }
    }
    return;
  }

  if (type === 'randomPatera') {
    for (let c = 0; c < NC; c++) {
      for (const p of bag.paterae) {
        const k = bowl(dotDir(c, p.p), p.r, p.r + (op.width ?? 0.028));
        h[c] -= k * p.d;
      }
    }
    return;
  }

  if (type === 'randomBurial') {
    for (let c = 0; c < NC; c++) {
      for (const m of bag.burial) {
        const k = bowl(dotDir(c, m.p), op.rim ?? 0.965, op.floor ?? 0.992);
        h[c] += k * m.h;
      }
    }
    return;
  }

  if (type === 'ridge') {
    for (let c = 0; c < NC; c++) {
      const y = DIR[c * 3 + 1];
      const lat = op.lat ?? 0.07;
      if (Math.abs(y) < lat) h[c] += (lat - Math.abs(y)) / lat * (op.amp ?? 0.22);
    }
    return;
  }

  if (type === 'poleCap') {
    for (let c = 0; c < NC; c++) {
      const y = DIR[c * 3 + 1];
      h[c] = (op.base ?? 0.10) + (y > (op.gt ?? 0.62) ? (y - op.gt) * (op.amp ?? 0.08) : 0);
      crust[c] = op.crust ?? 0.45;
      age[c] = op.age ?? 4000;
      if (op.rockPole) rock[c] = y > op.rockPole[0] ? op.rockPole[1] : op.rockPole[2];
    }
    return;
  }

  if (type === 'groove') {
    const last = state.lastBowl;
    for (let c = 0; c < NC; c++) {
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      const k = last ? bowl(dotDir(c, last.at), 0.72, 0.94) : 0;
      const groove = Math.sin(x * op.a[0] + z * op.a[1]) * Math.cos(y * (op.b ?? 14));
      if (groove > (op.gt ?? 0.55) && k < (op.skipBowl ?? 0.4)) {
        h[c] -= (groove - op.gt) * (op.amp ?? 0.06);
      }
    }
    return;
  }

  if (type === 'lavaFill') {
    if (!W.lava) return;
    for (let c = 0; c < NC; c++) {
      const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
      const n = op.noise || {};
      W.lava[c] = (op.base ?? 0.55) + fbm(x * (n.scale || 3), y * (n.scale || 3), z * (n.scale || 3),
        seed, n.octaves || 2, 2, 0.5) * (n.amp || 0.35);
    }
    return;
  }

  if (type === 'elongated') {
    const lobes = (op.lobes || []).map(norm3);
    for (let c = 0; c < NC; c++) {
      let m = 0;
      for (const L of lobes) m = Math.max(m, Math.max(0, dotDir(c, L)));
      h[c] = clamp((op.bias ?? 0.02) + m * (op.amp ?? 0.18) + (op.floor ?? -0.08), -1.2, 1.2);
      crust[c] = op.crust ?? 0.18;
      age[c] = op.age ?? 4500;
      rock[c] = op.rock ?? 0;
    }
    return;
  }

  if (type === 'flatten') {
    for (let c = 0; c < NC; c++) h[c] = clamp(h[c] * (op.scale ?? 0.35) + (op.bias ?? 0.1), -1.2, 1.2);
    return;
  }

  if (type === 'iceShell') {
    if (!W.ice) return;
    for (let c = 0; c < NC; c++) {
      const y = DIR[c * 3 + 1];
      W.ice[c] = (op.base ?? 0.7) + Math.abs(y) * (op.poleAmp ?? 0.2);
      if (W.iceLand) W.iceLand[c] = W.ice[c];
    }
  }
}

function finish(W, spec, seed) {
  if (spec.craters) stampCraters(W.h, seed, spec.craters);
  if (spec.extraCraters) stampCraters(W.h, seed ^ seedTag(spec.extraCraters.seedXor), spec.extraCraters);
  if (spec.dryWorld != null) dryWorld(W, spec.dryWorld);
  for (let c = 0; c < NC; c++) W.h[c] = clamp(W.h[c], -1.2, 1.2);
}

function placeVents(W, spec, bag, seed) {
  if (spec.ageAfterPlacements && bag._ioRng) {
    const rng = bag._ioRng;
    const [lo, span] = spec.ageAfterPlacements;
    for (let c = 0; c < NC; c++) W.age[c] = lo + rng() * span;
  }
  if (spec.vents) {
    W.hotspots = W.hotspots || [];
    for (const v of spec.vents) {
      const at = norm3(v.at);
      addVent(W, nearestCell(at), v);
      if (v.hotspot) W.hotspots.push({ pos: at, strength: v.strength ?? 0.55, fixed: true });
    }
  }
  if (spec.ventsFromPaterae && bag.paterae.length) {
    const rng = bag._ioRng || mulberry32((seed ^ 0x494f564f) >>> 0);
    W.volcanoes = [];
    W.hotspots = [];
    for (const p of bag.paterae) {
      addVent(W, nearestCell(p.p), { magma: 1.1 + rng() * 0.7, next: rng() * 12, silica: 0.46 });
      W.hotspots.push({ pos: p.p, strength: 0.2 + rng() * 0.25, fixed: true });
    }
  }
  if (spec.heatFlow && W.interior) {
    W.interior.heatFlow = Math.max(W.interior.heatFlow || 0, spec.heatFlow);
  }
}

/** Apply the authored stamp for a geology kind. */
export function applyStampKind(W, kind, seed) {
  const spec = STAMP_BY_ID[kind];
  if (!spec) return false;
  if (spec.base) applyStampKind(W, spec.base, seed);
  if (spec.noSurface || (spec.ops || []).some((o) => o.type === 'noSurface')) {
    applyOp(W, seed, { type: 'noSurface' }, {}, {});
    return true;
  }
  const bag = prepRandom(spec, seed);
  const state = { tessera: new Float32Array(NC) };
  for (const op of spec.ops || []) applyOp(W, seed, op, bag, state);
  finish(W, spec, seed);
  placeVents(W, spec, bag, seed);
  return true;
}
