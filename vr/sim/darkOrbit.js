/** Orbit — satellites, debris, Kessler cascade, early warning (dark-400 P §301–320). */

import { rngOf } from './rng.js';
import { igniteFire } from './fire.js';
import { noteWarCrime } from './dark.js';

export const KESSLER_THRESHOLD = 40;

export function resetOrbit(W) {
  W.sats = [];
  W.dark = W.dark || {};
  W.dark.satellites = 0;
  W.dark.debris = 0;
  W.dark.kessler = false;
  W.dark.orbitClosed = false;
}

export function spawnSat(W, opts = {}) {
  if (!W.sats) W.sats = [];
  const sat = {
    kind: opts.kind || 'recon', // recon | earlywarn | nav | asat
    period: opts.period != null ? opts.period : 20 + ((Math.random() * 40) | 0),
    phase: opts.phase || 0,
    owner: opts.owner ?? -1,
    alive: true,
  };
  W.sats.push(sat);
  return sat;
}

/** ASAT strike creates debris (§304). */
export function asatStrike(W, sat, actorId = -1, log = null) {
  if (!sat || !sat.alive) return 0;
  sat.alive = false;
  W.dark = W.dark || {};
  const add = 8 + ((sat.kind === 'earlywarn') ? 4 : 0);
  W.dark.debris = (W.dark.debris | 0) + add;
  if (actorId >= 0) noteWarCrime(W, 'ASAT strike', 0, actorId);
  if (log) log(W.year, 'orbit', 0, 0.6, `ASAT — debris +${add}`);
  return add;
}

/** Early-warning sats shorten detection delay (§303 / §319). */
export function earlyWarnDelayBonus(W) {
  let n = 0;
  for (const s of W.sats || []) {
    if (s.alive && s.kind === 'earlywarn') n++;
  }
  // Each EW sat shortens the "remain < X" window start (detect earlier).
  return Math.min(10, n * 2);
}

export function orbitTick(W, log = null) {
  if (!W.sats) W.sats = [];
  W.dark = W.dark || {};
  const rng = rngOf(W, 'rngGod');
  const tick = W._tickIndex | 0;
  const tech = Math.max(0, ((W.unlockedClass || 0) - 5) / 2);

  // Seed sats once tech allows.
  if (W.sats.length < 4 && tech > 0.2 && tick % 100 === 0) {
    spawnSat(W, { kind: 'earlywarn', period: 30, owner: W.playerPolity ?? 0 });
    spawnSat(W, { kind: 'recon', period: 25 });
    spawnSat(W, { kind: 'nav', period: 40 });
  }

  let alive = 0;
  for (const s of W.sats) {
    if (!s.alive) continue;
    s.phase = ((s.phase | 0) + 1) % Math.max(1, s.period | 0);
    alive++;
    // Solar flare damage (§311).
    if ((W.flareGlow || 0) > 0.5 && rng() < 0.05) {
      s.alive = false;
      W.dark.debris = (W.dark.debris | 0) + 2;
    }
  }

  // Kessler: debris begets debris above threshold (§305, §318).
  let debris = W.dark.debris | 0;
  if (debris > KESSLER_THRESHOLD) {
    W.dark.kessler = true;
    debris += 1 + ((debris - KESSLER_THRESHOLD) / 20) | 0;
    // Cascade kills sats.
    for (const s of W.sats) {
      if (s.alive && rng() < 0.08) {
        s.alive = false;
        debris += 3;
      }
    }
    if (debris > KESSLER_THRESHOLD * 2) {
      W.dark.orbitClosed = true;
      if (log && !W.dark._orbitLogged) {
        W.dark._orbitLogged = true;
        log(W.year, 'orbit', 0, 1, 'Orbit closed — Kessler cascade');
      }
    }
  }

  // Re-entering debris starts fires (§312).
  if (debris > 5 && rng() < 0.02 && W.h) {
    const c = (rng() * (W.h.length || 1)) | 0;
    if ((W.h[c] || 0) >= (W.seaLevel || 0)) igniteFire(W, c, 0.4, 0);
  }

  // Wartime ASAT chance.
  if ((W.diplo?.wars || []).length && rng() < 0.005) {
    const target = W.sats.find((s) => s.alive);
    if (target) asatStrike(W, target, W.diplo.wars[0].a, log);
  }

  W.dark.debris = debris;
  W.dark.satellites = alive;
  W.sats = W.sats.filter((s) => s.alive || debris < 200).slice(-64);
}
