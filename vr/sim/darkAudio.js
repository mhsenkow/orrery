/** Thin audio hooks for dark-400 R (§341–360). No allocation on the tick path. */

const REDUCED = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Fire a cue if `window.__orreryAudio` exists.
 * kinds: siren | launch | detonation | geiger | intercept | emp
 */
export function darkAudioCue(kind, detail = null) {
  if (typeof window === 'undefined') return false;
  if (window.__orreryReducedAudio || REDUCED) return false;
  const bus = window.__orreryAudio;
  if (!bus || typeof bus.cue !== 'function') return false;
  try {
    bus.cue(kind, detail);
    return true;
  } catch {
    return false;
  }
}

/** Hook ordnance / dark events without importing render. */
export function darkAudioFromWorld(W) {
  if (typeof window === 'undefined') return;
  if (window.__orreryReducedAudio || REDUCED) return;
  const bus = window.__orreryAudio;
  if (!bus) return;

  const tick = W._tickIndex | 0;
  if (W._darkAudioTick === tick) return;
  W._darkAudioTick = tick;

  for (const f of W.flight || []) {
    if (f._audioLaunch) continue;
    if ((f.at | 0) <= 1) {
      f._audioLaunch = true;
      darkAudioCue('launch', { cell: f.from, kind: f.kind });
    }
  }
  if ((W.radPeak || 0) > 0.3) darkAudioCue('geiger', { peak: W.radPeak });
  if ((W._empUntil || 0) === tick + 1) darkAudioCue('emp');
}
