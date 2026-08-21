/** Origin sketch — a short formation ceremony that seeds the sphere.
 *
 *  Not a second planet sim. ~160 particles, four beats (dust → oligarch →
 *  Theia → freeze), then a tiny digest that biases plates / moon / obliquity.
 *  Deterministic from seed so the same world always forms the same way.
 */

import { clamp } from '../math.js';
import { DIR } from '../sphere.js';

const N = 160;
const PHASES = Object.freeze([
  { id: 'dust', until: 3.2, title: 'Dust', body: 'Grains find each other' },
  { id: 'oligarch', until: 6.8, title: 'Embryos', body: 'A few bodies win the disk' },
  { id: 'theia', until: 11.0, title: 'Theia', body: 'A second world arrives' },
  { id: 'freeze', until: 14.5, title: 'Freeze', body: 'The ocean of rock hardens' },
]);

function mulberry(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randDir(rng) {
  const z = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(t), z, r * Math.sin(t)];
}

function len3(x, y, z) {
  return Math.hypot(x, y, z) || 1e-8;
}

/** Build the digest that tectonics / rule will read. Pure, seed-stable. */
export function rollOriginDigest(seed, opts = {}) {
  const rng = mulberry((seed ^ 0x091910) >>> 0);
  const earthish = opts.earthLike !== false;
  const impactAxis = randDir(rng);
  const impactAngle = 15 + rng() * 50;
  const glancing = impactAngle > 40;
  const hasMoon = earthish ? (glancing || rng() > 0.18) : rng() > 0.55;
  const ironFrac = clamp(0.18 + rng() * 0.28 + (opts.ironBias || 0), 0.12, 0.55);
  const waterInventory = clamp(
    (earthish ? 0.7 : 0.2) + rng() * (earthish ? 0.9 : 1.4),
    0.05, 2.2,
  );
  const nPlates = earthish
    ? (8 + (rng() * 7) | 0)
    : (3 + (rng() * 8) | 0);
  const continentFrac = clamp(
    (earthish ? 0.28 : 0.15) + rng() * 0.28,
    0.12, 0.62,
  );
  const obliquityDeg = hasMoon
    ? clamp(18 + rng() * 14 + (glancing ? 6 : 0), 8, 42)
    : clamp(5 + rng() * 55, 0, 80);
  const impactStrength = 0.45 + rng() * 0.5;
  const lidMode = ironFrac > 0.42 && waterInventory < 0.45 && rng() > 0.55
    ? 'stagnant'
    : 'mobile';

  return Object.freeze({
    seed: seed >>> 0,
    ironFrac,
    waterInventory,
    nPlates,
    continentFrac,
    obliquityDeg,
    hasMoon,
    moonMass: hasMoon ? (0.6 + rng() * 0.7) : 0,
    moonDistance: hasMoon ? (0.7 + rng() * 0.8) : 0,
    impactAxis: Object.freeze(impactAxis.slice()),
    impactAngle,
    impactStrength,
    glancing,
    lidMode,
    highlandBias: 0.35 + impactStrength * 0.4,
    spunFast: !hasMoon && impactAngle < 30,
  });
}

/** Live particle sketch. Call tick(dt) until done, then read .digest. */
export function createOriginSketch(seed, opts = {}) {
  const rng = mulberry((seed ^ 0x51ce) >>> 0);
  const digest = rollOriginDigest(seed, opts);
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const mass = new Float32Array(N);
  const kind = new Uint8Array(N); // 0 dust, 1 embryo, 2 theia, 3 debris

  for (let i = 0; i < N; i++) {
    const d = randDir(rng);
    d[1] *= 0.22;
    const L = len3(d[0], d[1], d[2]);
    const r = 0.55 + rng() * 1.1;
    pos[i * 3] = (d[0] / L) * r;
    pos[i * 3 + 1] = (d[1] / L) * r;
    pos[i * 3 + 2] = (d[2] / L) * r;
    vel[i * 3] = -pos[i * 3 + 2] * 0.35;
    vel[i * 3 + 1] = (rng() - 0.5) * 0.05;
    vel[i * 3 + 2] = pos[i * 3] * 0.35;
    mass[i] = 0.4 + rng() * 0.8;
    kind[i] = 0;
  }

  for (let k = 0; k < 3; k++) {
    const i = k;
    kind[i] = 1;
    mass[i] = 3 + rng() * 2;
    const d = randDir(rng);
    pos[i * 3] = d[0] * 0.35;
    pos[i * 3 + 1] = d[1] * 0.12;
    pos[i * 3 + 2] = d[2] * 0.35;
    vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
  }

  const theia = N - 1;
  kind[theia] = 2;
  mass[theia] = 4.5;
  const ax = digest.impactAxis;
  pos[theia * 3] = ax[0] * 2.4;
  pos[theia * 3 + 1] = ax[1] * 2.4;
  pos[theia * 3 + 2] = ax[2] * 2.4;
  vel[theia * 3] = -ax[0] * 0.55;
  vel[theia * 3 + 1] = -ax[1] * 0.55;
  vel[theia * 3 + 2] = -ax[2] * 0.55;

  const sketch = {
    seed: seed >>> 0,
    t: 0,
    phase: 'dust',
    phaseIdx: 0,
    done: false,
    digest: null,
    pendingDigest: digest,
    caption: PHASES[0],
    n: N,
    pos,
    vel,
    mass,
    kind,
    _hit: false,
    _rng: rng,
  };

  sketch.tick = (dt) => tickSketch(sketch, Math.min(0.05, dt));
  sketch.skip = () => skipSketch(sketch);
  sketch.points = () => sketch.pos;
  return sketch;
}

function phaseAt(t) {
  for (let i = 0; i < PHASES.length; i++) {
    if (t < PHASES[i].until) return { idx: i, ...PHASES[i] };
  }
  return { idx: PHASES.length - 1, ...PHASES[PHASES.length - 1] };
}

function tickSketch(sk, dt) {
  if (sk.done) return sk;
  sk.t += dt;
  const ph = phaseAt(sk.t);
  if (ph.idx !== sk.phaseIdx) {
    sk.phaseIdx = ph.idx;
    sk.phase = ph.id;
    sk.caption = ph;
  }

  const { pos, vel, mass, kind } = sk;
  const attract = ph.id === 'dust' ? 0.55
    : ph.id === 'oligarch' ? 1.1
      : ph.id === 'theia' ? 0.35
        : 1.4;

  for (let i = 0; i < N; i++) {
    if (!(ph.id === 'theia' && kind[i] === 2 && !sk._hit)) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const r = len3(x, y, z);
      vel[i * 3] -= (x / r) * attract * dt * 0.4;
      vel[i * 3 + 1] -= (y / r) * attract * dt * 0.4;
      vel[i * 3 + 2] -= (z / r) * attract * dt * 0.4;
    }

    let best = -1, bestM = 0;
    for (let s = 0; s < 6; s++) {
      const j = ((i * 17 + s * 31 + ((sk.t * 10) | 0)) % N);
      if (j === i) continue;
      if (mass[j] > bestM) { bestM = mass[j]; best = j; }
    }
    if (best >= 0 && mass[i] < bestM && ph.id !== 'freeze') {
      const dx = pos[best * 3] - pos[i * 3];
      const dy = pos[best * 3 + 1] - pos[i * 3 + 1];
      const dz = pos[best * 3 + 2] - pos[i * 3 + 2];
      const d = len3(dx, dy, dz);
      if (d < 1.2) {
        const pull = (0.08 * bestM / (d * d + 0.05)) * dt;
        vel[i * 3] += dx * pull;
        vel[i * 3 + 1] += dy * pull;
        vel[i * 3 + 2] += dz * pull;
        if (d < 0.08 && kind[i] !== 2) {
          mass[best] += mass[i] * 0.85;
          mass[i] *= 0.15;
        }
      }
    }
  }

  if (ph.id === 'theia' && !sk._hit) {
    const ti = N - 1;
    const r = len3(pos[ti * 3], pos[ti * 3 + 1], pos[ti * 3 + 2]);
    if (r < 0.55) {
      sk._hit = true;
      for (let i = 0; i < N; i++) {
        if (kind[i] === 2 || i === ti) {
          kind[i] = 3;
          const kick = randDir(sk._rng);
          vel[i * 3] = kick[0] * (0.8 + sk._rng());
          vel[i * 3 + 1] = kick[1] * (0.5 + sk._rng() * 0.5);
          vel[i * 3 + 2] = kick[2] * (0.8 + sk._rng());
          mass[i] = 0.5 + sk._rng();
        } else if (kind[i] === 1) {
          vel[i * 3] += (sk._rng() - 0.5) * 0.4;
          vel[i * 3 + 1] += (sk._rng() - 0.5) * 0.3;
          vel[i * 3 + 2] += (sk._rng() - 0.5) * 0.4;
        }
      }
    }
  }

  const damp = ph.id === 'freeze' ? 0.92 : 0.995;
  const wantMoon = sk.pendingDigest.hasMoon;
  for (let i = 0; i < N; i++) {
    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    vel[i * 3] *= damp;
    vel[i * 3 + 1] *= damp;
    vel[i * 3 + 2] *= damp;

    if (ph.id === 'freeze') {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const r = len3(x, y, z);
      const shell = (kind[i] === 3 && wantMoon && (i % 4 === 0)) ? 1.55 : 1.0;
      const nr = r + (shell - r) * Math.min(1, dt * 1.8);
      pos[i * 3] = (x / r) * nr;
      pos[i * 3 + 1] = (y / r) * nr;
      pos[i * 3 + 2] = (z / r) * nr;
    }
  }

  if (sk.t >= PHASES[PHASES.length - 1].until) finishSketch(sk);
  return sk;
}

function finishSketch(sk) {
  if (sk.done) return;
  sk.digest = sk.pendingDigest;
  sk.done = true;
  sk.phase = 'done';
  sk.caption = {
    id: 'done',
    title: sk.digest.hasMoon ? 'A world with a Moon' : 'A world alone',
    body: sk.digest.glancing
      ? 'A glancing blow left the scar and the companion'
      : 'The hit remade the spin',
  };
}

function skipSketch(sk) {
  sk.t = PHASES[PHASES.length - 1].until;
  finishSketch(sk);
  const ax = sk.digest.impactAxis;
  for (let i = 0; i < N; i++) {
    const d = randDir(sk._rng);
    const moonBit = sk.digest.hasMoon && (i % 4 === 0);
    const r = moonBit ? 1.55 : 1.0;
    const bx = d[0] * 0.7 + ax[0] * 0.3;
    const by = d[1] * 0.7 + ax[1] * 0.3;
    const bz = d[2] * 0.7 + ax[2] * 0.3;
    const L = len3(bx, by, bz);
    sk.pos[i * 3] = (bx / L) * r;
    sk.pos[i * 3 + 1] = (by / L) * r;
    sk.pos[i * 3 + 2] = (bz / L) * r;
    sk.vel[i * 3] = sk.vel[i * 3 + 1] = sk.vel[i * 3 + 2] = 0;
    sk.kind[i] = moonBit ? 3 : 1;
  }
  return sk;
}

/** Fold digest into a ruleset clone (genesis-compatible fields). */
export function applyOriginDigestToRule(ruleIn, digest) {
  if (!digest || !ruleIn) return ruleIn;
  const rule = { ...ruleIn };
  rule.obliquity = (digest.obliquityDeg * Math.PI) / 180;
  rule.nPlates = digest.nPlates;
  rule.continentFrac = digest.continentFrac;
  rule.targetLandFrac = digest.continentFrac * 0.85;
  if (rule.interior) {
    rule.interior = { ...rule.interior, lidMode: digest.lidMode };
  } else {
    rule._originLid = digest.lidMode;
  }
  rule._genesisWater = digest.waterInventory;
  rule._originDigest = digest;
  rule.moons = digest.hasMoon
    ? [{ mass: digest.moonMass, distance: digest.moonDistance || 1 }]
    : [];
  return rule;
}

/** After landscape: impact-hemisphere highland, antipode basin. */
export function applyOriginDigestToWorld(W, digest) {
  if (!digest || !W?.crust || !W?.h) return;
  const ax = digest.impactAxis;
  if (!ax) return;
  const boost = digest.highlandBias || 0.5;
  const NC = W.crust.length;
  for (let c = 0; c < NC; c++) {
    const dot = DIR[c * 3] * ax[0] + DIR[c * 3 + 1] * ax[1] + DIR[c * 3 + 2] * ax[2];
    if (dot > 0.1) {
      // Smoothstep falloff — avoids hard polygonal scar edges.
      const u = clamp((dot - 0.1) / 0.9, 0, 1);
      const k = u * u * (3 - 2 * u) * boost;
      W.crust[c] = Math.min(1.7, (W.crust[c] || 0.4) * (1 + k * 0.55));
      W.h[c] = clamp((W.h[c] || 0) + k * 0.28, -1.2, 1.2);
      if (W.rock && k > 0.3) W.rock[c] = 0;
    } else if (dot < -0.2) {
      const u = clamp((-0.2 - dot) / 0.8, 0, 1);
      const k = u * u * (3 - 2 * u) * boost * 0.85;
      W.crust[c] = Math.max(0.1, (W.crust[c] || 0.4) * (1 - k * 0.45));
      W.h[c] = clamp((W.h[c] || 0) - k * 0.22, -1.2, 1.2);
    }
  }
  // Pull a few continental plate centres toward the hit so land prefers that hemisphere.
  if (W.plates?.length) {
    let moved = 0;
    for (const pl of W.plates) {
      if (pl.oceanic || moved >= 3) continue;
      const c = pl.centre;
      const dot = c[0] * ax[0] + c[1] * ax[1] + c[2] * ax[2];
      if (dot < 0.2) {
        const nx = c[0] * 0.55 + ax[0] * 0.45;
        const ny = c[1] * 0.55 + ax[1] * 0.45;
        const nz = c[2] * 0.55 + ax[2] * 0.45;
        const L = Math.hypot(nx, ny, nz) || 1;
        pl.centre = [nx / L, ny / L, nz / L];
        moved++;
      }
    }
  }
  W.originDigest = digest;
  W._moonImpact = !!digest.hasMoon;
}

export function originDigestSummary(d) {
  if (!d) return '';
  const moon = d.hasMoon ? `moon ${(d.moonMass || 0).toFixed(1)}×` : 'no moon';
  return `${d.nPlates} plates · land ${(d.continentFrac * 100) | 0}% · tilt ${d.obliquityDeg | 0}° · ${moon}`;
}

export { PHASES as ORIGIN_PHASES, N as ORIGIN_PARTICLE_N };
