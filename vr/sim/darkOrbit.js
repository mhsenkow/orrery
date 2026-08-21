/** Orbit — satellites, debris, Kessler cascade, early warning (dark-400 P §301–320). */

import { NC } from '../sphere.js';
import { rngOf } from './rng.js';
import { igniteFire } from './fire.js';
import { noteWarCrime } from './dark.js';

export const KESSLER_THRESHOLD = 40;

export function resetOrbit(W) {
  W.sats = [];
  W.debrisRing = 0;
  W.gpsDenied = W.gpsDenied || 0;
  W.orbitalBombardTreaty = true;
  W.dark = W.dark || {};
  W.dark.satellites = 0;
  W.dark.debris = 0;
  W.dark.kessler = false;
  W.dark.orbitClosed = false;
  W.dark.launchSites = 0;
  W.dark.debrisRing = 0;
  W._orbitLogged = false;
}

export function spawnSat(W, opts = {}) {
  if (!W.sats) W.sats = [];
  if (W.dark?.orbitClosed) return null; // no access when Kessler closed orbit
  const sat = {
    kind: opts.kind || 'recon', // recon | earlywarn | nav | ew | asat
    period: opts.period != null ? opts.period : 20 + ((Math.random() * 40) | 0),
    phase: opts.phase || 0,
    owner: opts.owner ?? -1,
    alive: true,
    alt: opts.alt ?? 0.4 + Math.random() * 0.4,
  };
  W.sats.push(sat);
  return sat;
}

/** ASAT strike creates debris (§304). */
export function asatStrike(W, sat, actorId = -1, log = null) {
  if (!sat || !sat.alive) return 0;
  sat.alive = false;
  W.dark = W.dark || {};
  const add = 8 + ((sat.kind === 'earlywarn' || sat.kind === 'ew') ? 4 : 0);
  W.dark.debris = (W.dark.debris | 0) + add;
  if (actorId >= 0) noteWarCrime(W, 'ASAT strike', 0, actorId);
  if (log) log(W.year, 'orbit', 0, 0.6, `ASAT — debris +${add}`);
  return add;
}

/** Early-warning sats shorten detection delay (§303 / §319). */
export function earlyWarnDelayBonus(W) {
  let n = 0;
  for (const s of W.sats || []) {
    if (s.alive && (s.kind === 'earlywarn' || s.kind === 'ew')) n++;
  }
  // Each EW sat shortens the "remain < X" window start (detect earlier).
  return Math.min(10, n * 2);
}

/** Destroy all early-warning sats (opening move §303) — for asserts. */
export function destroyEarlyWarn(W, actorId = -1, log = null) {
  let n = 0;
  for (const s of W.sats || []) {
    if (s.alive && (s.kind === 'earlywarn' || s.kind === 'ew')) {
      asatStrike(W, s, actorId, log);
      n++;
    }
  }
  return n;
}

/** Orbital bombardment — forbidden by treaty (§307). */
export function orbitalBombard(W, cell, actorId = -1, log = null) {
  const c = cell | 0;
  if (c < 0 || c >= NC) return false;
  if (W.orbitalBombardTreaty !== false) {
    noteWarCrime(W, 'orbital bombardment treaty breach', c, actorId);
  }
  if (W.build?.[c] > 0) {
    W.build[c] = Math.max(0, W.build[c] - 0.4);
  }
  igniteFire(W, c, 0.6, 1);
  if (log) log(W.year, 'orbit', c, 0.85, 'Orbital bombardment');
  return true;
}

/** Count / mark launch sites as ground targets (§309). */
export function markLaunchSites(W) {
  const sites = [];
  for (const p of W.polities || []) {
    const cap = p.capital | 0;
    if (cap >= 0 && (W.build?.[cap] || 0) > 0.4) {
      sites.push({ cell: cap, owner: p.id, kind: 'launch' });
    }
  }
  // High-build industrial cells also launch-capable.
  if (W.build && sites.length < 8) {
    for (let c = 0; c < NC && sites.length < 12; c += 23) {
      if ((W.build[c] || 0) > 0.7 && (W.h?.[c] || 0) >= (W.seaLevel || 0)) {
        sites.push({ cell: c, owner: W.owner?.[c] ?? -1, kind: 'launch' });
      }
    }
  }
  W.launchSites = sites;
  W.dark = W.dark || {};
  W.dark.launchSites = sites.length;
  return sites;
}

/** Hit a launch site — loses orbital access for that polity (§309). */
export function strikeLaunchSite(W, site, log = null) {
  if (!site) return false;
  const c = site.cell | 0;
  if (W.build?.[c] > 0) W.build[c] *= 0.35;
  site.dead = true;
  const owner = site.owner;
  if (owner >= 0) {
    for (const s of W.sats || []) {
      if (s.owner === owner && s.alive && Math.random() < 0.3) {
        s.alive = false;
        W.dark.debris = (W.dark.debris | 0) + 2;
      }
    }
  }
  if (log) log(W.year, 'orbit', c, 0.7, 'Launch site destroyed');
  return true;
}

/** Assert Kessler is self-sustaining above threshold (§318). */
export function assertKesslerSelfSustaining(debrisBefore, debrisAfter, threshold = KESSLER_THRESHOLD) {
  if (!(debrisBefore > threshold)) {
    throw new Error(`debris ${debrisBefore} not above Kessler threshold ${threshold}`);
  }
  if (!(debrisAfter > debrisBefore)) {
    throw new Error(`Kessler not self-sustaining: ${debrisBefore}→${debrisAfter}`);
  }
}

/** Assert destroying EW shortens defender decision time (§319). */
export function assertEwDestroyShortensWarning(bonusWith, bonusWithout) {
  if (!(bonusWithout < bonusWith)) {
    throw new Error(`EW destroy should shorten warning: with=${bonusWith} without=${bonusWithout}`);
  }
}

export function orbitTick(W, log = null) {
  if (!W.sats) W.sats = [];
  W.dark = W.dark || {};
  const rng = rngOf(W, 'rngGod');
  const tick = W._tickIndex | 0;
  const tech = Math.max(0, ((W.unlockedClass || 0) - 5) / 2);

  // Seed sats once tech allows (§301–303).
  if (!W.dark.orbitClosed && W.sats.length < 6 && tech > 0.2 && tick % 100 === 0) {
    spawnSat(W, { kind: 'earlywarn', period: 30, owner: W.playerPolity ?? 0 });
    spawnSat(W, { kind: 'recon', period: 25 });
    spawnSat(W, { kind: 'nav', period: 40 });
    spawnSat(W, { kind: 'ew', period: 28 }); // electronic warfare
  }

  if (tick % 50 === 0) markLaunchSites(W);

  let alive = 0;
  let navAlive = 0;
  for (const s of W.sats) {
    if (!s.alive) continue;
    s.phase = ((s.phase | 0) + 1) % Math.max(1, s.period | 0);
    alive++;
    if (s.kind === 'nav') navAlive++;
    // Solar flare damage (§311) — couples to stellarFlare via W.flareGlow.
    if ((W.flareGlow || 0) > 0.5 && rng() < 0.05) {
      s.alive = false;
      W.dark.debris = (W.dark.debris | 0) + 2;
    }
  }

  // Nav sat loss → GPS denial worsens CEP (§310).
  if (navAlive === 0 && alive > 0) {
    W.gpsDenied = Math.max(W.gpsDenied || 0, 0.35);
  } else if (navAlive === 0 && (W.dark.debris | 0) > 10) {
    W.gpsDenied = Math.max(W.gpsDenied || 0, 0.55);
  }

  // Kessler: debris begets debris above threshold — self-sustaining (§305, §318).
  let debris = W.dark.debris | 0;
  if (debris > KESSLER_THRESHOLD) {
    W.dark.kessler = true;
    // Self-sustaining cascade: growth proportional to excess density.
    const excess = debris - KESSLER_THRESHOLD;
    debris += 1 + ((excess / 15) | 0) + ((rng() < 0.5) ? 1 : 0);
    for (const s of W.sats) {
      if (s.alive && rng() < 0.08 + excess * 0.001) {
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
  } else {
    W.dark.kessler = false;
  }

  // Debris-belt visual hook (§306).
  W.debrisRing = Math.min(1, debris / (KESSLER_THRESHOLD * 3));
  W.dark.debrisRing = W.debrisRing;

  // Re-entering debris starts fires (§312).
  if (debris > 5 && rng() < 0.02 && W.h) {
    const c = (rng() * (W.h.length || 1)) | 0;
    if ((W.h[c] || 0) >= (W.seaLevel || 0)) igniteFire(W, c, 0.4, 0);
  }

  // Contaminated spent-fuel re-entry (§313).
  if (debris > 20 && rng() < 0.005 && W.toxin && W.h) {
    const c = (rng() * NC) | 0;
    if ((W.h[c] || 0) >= (W.seaLevel || 0)) {
      W.toxin[c] = Math.min(1, (W.toxin[c] || 0) + 0.2);
      igniteFire(W, c, 0.25, 0);
    }
  }

  // Wartime ASAT chance (§304).
  if ((W.diplo?.wars || []).length && rng() < 0.005) {
    const target = W.sats.find((s) => s.alive);
    if (target) asatStrike(W, target, W.diplo.wars[0].a, log);
  }

  // Strike enemy launch sites occasionally (§309).
  if ((W.diplo?.wars || []).length && rng() < 0.003 && W.launchSites?.length) {
    const site = W.launchSites.find((s) => !s.dead && s.owner === W.diplo.wars[0].b);
    if (site) strikeLaunchSite(W, site, log);
  }

  W.dark.debris = debris;
  W.dark.satellites = alive;
  W.dark.orbitAccess = !W.dark.orbitClosed;
  W.sats = W.sats.filter((s) => s.alive || debris < 200).slice(-64);
}
