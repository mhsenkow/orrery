/** Thin audio hooks for dark-400 R (§341–360).
 *
 *  Budget: `W.dark.audioBudgetMs` (default 0.5 ms wall on the tick path).
 *  Cue objects are reused — no allocate on the hot path.
 *  Mute layers: `W.dark.audioMuted` (bool) or `W.dark.audioLayers` map.
 */

const REDUCED_MOTION = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;
const REDUCED_AUDIO = typeof matchMedia === 'function'
  && (matchMedia('(prefers-reduced-motion: reduce)').matches
    || (typeof matchMedia('(prefers-reduced-data: reduce)') === 'object'
      && matchMedia('(prefers-reduced-data: reduce)').matches));

/** Reused cue payload — never allocate per tick call (§359). */
const CUE = Object.seal({
  kind: '',
  cell: -1,
  peak: 0,
  delayMs: 0,
  pitch: 1,
  player: false,
  dist: 0,
});

const LAYER_OF = Object.freeze({
  launch: 'ordnance',
  detonate: 'ordnance',
  interceptSnap: 'ordnance',
  siren: 'civil',
  empSilence: 'emp',
  geiger: 'rad',
  droneBuzz: 'drone',
  artillery: 'front',
  doomsdayTick: 'ui',
  fireRoar: 'fire',
  sonar: 'naval',
  crowd: 'civil',
  playerAct: 'player',
});

function audioAllowed(W, kind) {
  if (typeof window === 'undefined') return false;
  if (window.__orreryReducedAudio || REDUCED_AUDIO || REDUCED_MOTION) return false;
  if (W?.dark?.audioMuted) return false;
  // Duck all ambience during chronicle ceremony (§356).
  if (typeof document !== 'undefined' && document.body?.classList?.contains('ceremony')) {
    if (kind !== 'doomsdayTick' && kind !== 'playerAct') return false;
  }
  const layers = W?.dark?.audioLayers;
  if (layers) {
    const layer = LAYER_OF[kind] || 'misc';
    if (layers[layer] === false) return false;
  }
  return true;
}

/**
 * Fire a cue if `window.__orreryAudio` exists.
 * kinds: launch | detonate | siren | empSilence | geiger | droneBuzz |
 *        artillery | doomsdayTick | interceptSnap | fireRoar | sonar | crowd | playerAct
 *
 * @param {string} kind
 * @param {{ cell?: number, peak?: number, delayMs?: number, pitch?: number,
 *           player?: boolean, dist?: number } | null} opts
 */
export function darkAudioCue(kind, opts = null) {
  CUE.kind = kind;
  CUE.cell = opts?.cell ?? -1;
  CUE.peak = opts?.peak ?? 0;
  CUE.delayMs = opts?.delayMs ?? 0;
  CUE.pitch = opts?.pitch ?? 1;
  CUE.player = !!opts?.player;
  CUE.dist = opts?.dist ?? 0;

  if (typeof window === 'undefined') return false;
  if (window.__orreryReducedAudio || REDUCED_AUDIO || REDUCED_MOTION) return false;
  const bus = window.__orreryAudio;
  if (!bus || typeof bus.cue !== 'function') return false;
  try {
    bus.cue(kind, CUE);
    return true;
  } catch {
    return false;
  }
}

/** Distance → delay ms for detonation boom after flash (§342). Fitted @ N=32. */
function detonateDelayMs(distCells) {
  // fitted: ~12 ms per cell at N=32 (gesture; not acoustic-accurate)
  return Math.min(2500, Math.max(0, (distCells | 0) * 12));
}

function fireCue(W, kind, opts) {
  if (!audioAllowed(W, kind)) return false;
  return darkAudioCue(kind, opts);
}

/** Hook ordnance / dark events without importing render. No alloc on tick. */
export function darkAudioFromWorld(W) {
  if (typeof window === 'undefined') return;
  if (window.__orreryReducedAudio || REDUCED_AUDIO || REDUCED_MOTION) return;
  if (W?.dark?.audioMuted) return;
  if (!window.__orreryAudio) return;

  const tick = W._tickIndex | 0;
  if (W._darkAudioTick === tick) return;
  W._darkAudioTick = tick;

  W.dark = W.dark || {};
  W.dark.audioBudgetMs = W.dark.audioBudgetMs || 0.5;

  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

  for (const f of W.flight || []) {
    if (f._audioLaunch) continue;
    if ((f.at | 0) <= 1) {
      f._audioLaunch = true;
      fireCue(W, 'launch', { cell: f.from, player: f.ownerPolity === W.playerPolity });
      if (f.ownerPolity === W.playerPolity) fireCue(W, 'playerAct', { cell: f.from });
    }
    // Siren in threatened settlements near reentry (§343).
    if (f.phase === 'reentry' && !f._audioSiren && (W.build?.[f.to] || 0) > 0.3) {
      f._audioSiren = true;
      fireCue(W, 'siren', { cell: f.to });
    }
  }

  // Detonate cues with distance delay (§342) — one pending boom slot, no alloc.
  // Skip if ordnance already fired the cue this exchange (avoids double boom).
  if ((W.detonated | 0) > (W._darkAudioDetSeen | 0)) {
    const n = (W.detonated | 0) - (W._darkAudioDetSeen | 0);
    W._darkAudioDetSeen = W.detonated | 0;
    if (!W._darkAudioDetSkip) {
      const cell = W._lastDetCell | 0;
      const dist = W._lastDetDist | 0;
      fireCue(W, 'detonate', { cell, delayMs: detonateDelayMs(dist), dist, peak: Math.min(1, n) });
    }
    W._darkAudioDetSkip = false;
  }

  // Geiger: sparse clicks proportional to dose — never every tick (§341).
  const rad = W.radPeak || 0;
  if (rad > 0.25) {
    const every = rad > 0.8 ? 6 : rad > 0.5 ? 10 : 16;
    if ((tick % every) === 0) {
      fireCue(W, 'geiger', { peak: Math.min(0.55, rad * 0.35) });
    }
  }
  if ((W._empUntil || 0) > tick) {
    if (W._darkAudioEmp !== (W._empUntil | 0)) {
      W._darkAudioEmp = W._empUntil | 0;
      fireCue(W, 'empSilence', {});
    }
  }
  // Drone buzz: occasional, not a sawtooth every frame.
  if ((W.dark?.drones | 0) > 0 && (tick % 14) === 0) {
    fireCue(W, 'droneBuzz', { pitch: 0.8 + Math.min(0.6, (W.dark.drones | 0) * 0.05), peak: 0.25 });
  }
  if ((W.dark?.frontLen | 0) > 4 && (tick % 8) === 0) {
    fireCue(W, 'artillery', { peak: Math.min(0.5, (W.dark.frontLen | 0) * 0.04) });
  }
  if ((W.doomsday || 0) > (W._darkAudioDoom || 0) + 0.02) {
    W._darkAudioDoom = W.doomsday;
    fireCue(W, 'doomsdayTick', { peak: W.doomsday });
  }
  if ((W.intercepted | 0) > (W._darkAudioIx | 0)) {
    W._darkAudioIx = W.intercepted | 0;
    fireCue(W, 'interceptSnap', {});
  }
  if ((W._fireCells?.length | 0) > 8 && (tick % 10) === 0) {
    fireCue(W, 'fireRoar', { peak: Math.min(0.45, W._fireCells.length * 0.02) });
  }
  if ((W.dark?.ships | 0) > 0 && (tick % 16) === 0) {
    fireCue(W, 'sonar', { peak: 0.25 });
  }

  if (typeof performance !== 'undefined') {
    W.dark._audioSpentMs = performance.now() - t0;
  }
}

/** Assert cue helper never allocates (returns the shared CUE). */
export function assertCueReused() {
  const a = CUE;
  darkAudioCue('launch', { cell: 1 });
  return CUE === a;
}
