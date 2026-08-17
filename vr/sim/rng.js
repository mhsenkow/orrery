/** Seeded RNG streams — one world seed, forked per subsystem.
 *  Next backlog items 57–58. No Math.random in the sim path. */

import { mulberry32 } from '../math.js';

const TAG = {
  main: 0x00000000,
  bio: 0xb10b10b1,
  geo: 0x6e06e06e,
  agents: 0xa6e47801,
  god: 0x60d60d60,
  atmo: 0xa740a740,
  viz: 0xf15f15f1,
};

/** Mix a string into a 32-bit seed (FNV-1a style). */
export function hashTag(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  return mulberry32(seed >>> 0);
}

/** Deterministic child stream — parent draws do not shift sibling sequences. */
export function forkRng(seed, tag) {
  const t = typeof tag === 'string' ? hashTag(tag) : (tag >>> 0);
  return mulberry32((seed ^ t) >>> 0);
}

/** UI / genesis only — never call from a tick. */
export function freshSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] || 1;
  }
  return ((Date.now() * 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
}

/** Attach forked streams to a world. Call once at generate(). */
export function attachWorldRng(W, seed) {
  const s = seed >>> 0;
  W.rngState = s;
  W.rng = forkRng(s, TAG.main);
  W.rngBio = forkRng(s, TAG.bio);
  W.rngGeo = forkRng(s, TAG.geo);
  W.rngAgents = forkRng(s, TAG.agents);
  W.rngGod = forkRng(s, TAG.god);
  W.rngAtmo = forkRng(s, TAG.atmo);
  W.rngViz = forkRng(s, TAG.viz);
}

/** Safe accessor — prefers named stream, never falls back to Math.random. */
export function rngOf(W, which = 'rng') {
  const fn = W?.[which] || W?.rng;
  if (typeof fn === 'function') return fn;
  // Headless / pre-generate: fixed zero stream so tests stay deterministic
  return makeRng(0);
}

export { TAG };
