/** Lightning — the flash, and the thing that starts fires.
 *
 *  `fire.js` already modelled ignition as "dry lightning": a probability roll
 *  over hot, dry, fuelled land. That is the right physics and it was completely
 *  invisible, so a wildfire appeared from nowhere. And now that cyclones actually
 *  form, the most electrically active places on the planet exist and draw
 *  nothing. This module is the shared cause: storms and dry convection both
 *  `strike`, the strike is what ignites, and `W.flash` is what the renderer
 *  paints — brightest on the night side, which is where lightning reads.
 *
 *  Sparse by construction. A quiet planet costs one array-length check; a
 *  thunderstorm costs its own strikes and nothing else. There is no per-cell
 *  sweep anywhere in here.
 */

import { NC, NBR } from '../sphere.js';
import { clamp } from '../math.js';
import { rngOf } from './rng.js';

/** Below this a flash is spent. */
const OUT = 0.02;
/** Flashes are brief: this is per tick, so a bolt is gone in a few ticks. */
const FLASH_DECAY = 0.62;
/** Hard ceiling on simultaneous live flashes, so a superstorm cannot unbound. */
const MAX_FLASH = 512;

function ensure(W) {
  if (!W.flash || W.flash.length !== NC) {
    W.flash = new Float32Array(NC);
    W._flashCells = [];
  }
  if (!W._flashCells) W._flashCells = [];
}

export function resetLightning(W) {
  if (W.flash?.length === NC) W.flash.fill(0);
  else W.flash = null;
  W._flashCells = [];
  W.strikeCount = 0;
  W.flashCells = 0;
  W._strikeTotal = 0;
}

/**
 * One bolt. Returns true if it landed somewhere new.
 *
 * `power` is the brightness and also how far the flash bleeds into neighbours —
 * a bolt lights the cloud deck around it, which is what makes it legible from
 * orbit rather than a single hot pixel.
 */
export function strike(W, cell, power = 1) {
  ensure(W);
  if (cell < 0 || cell >= NC) return false;
  if (W._flashCells.length >= MAX_FLASH) return false;
  const was = W.flash[cell];
  W.flash[cell] = Math.min(1.4, was + power);
  if (was <= OUT) W._flashCells.push(cell);
  // Bleed into the four neighbours so the bolt has a halo, not a hard dot.
  const halo = power * 0.34;
  for (let k = 0; k < 4; k++) {
    const n = NBR[cell * 4 + k];
    const w = W.flash[n];
    W.flash[n] = Math.min(1.4, w + halo);
    if (w <= OUT && W.flash[n] > OUT && W._flashCells.length < MAX_FLASH) {
      W._flashCells.push(n);
    }
  }
  W._strikeTotal = (W._strikeTotal | 0) + 1;
  return true;
}

/**
 * Decay live flashes, and let storms throw bolts.
 *
 * Storm lightning is where the convection is, so it keys off `stormField` at the
 * storm's own cell rather than re-deriving anything. Tropical cores are more
 * electrically active than midlatitude fronts, which is both true and useful:
 * it gives a hurricane a visibly different signature from a depression.
 */
export function lightningTick(W) {
  ensure(W);
  const live = W._flashCells;
  if (live.length) {
    const next = [];
    for (let i = 0; i < live.length; i++) {
      const c = live[i];
      const v = W.flash[c] * FLASH_DECAY;
      if (v > OUT) { W.flash[c] = v; next.push(c); }
      else W.flash[c] = 0;
    }
    W._flashCells = next;
  }

  const storms = W.storms;
  if (storms?.length) {
    const rng = rngOf(W, 'rngAtmo');
    for (const s of storms) {
      // A weak depression flickers; a mature cyclone is near-continuous.
      const rate = clamp(s.intensity * (s.kind === 'tropical' ? 1.5 : 0.9), 0, 1.4);
      if (rng() > rate * 0.55) continue;
      let c = s.cell;
      // Bolts land in the rainbands, not the eye.
      const hop = 1 + ((rng() * 3) | 0);
      for (let i = 0; i < hop; i++) c = NBR[c * 4 + ((rng() * 4) | 0)];
      strike(W, c, 0.55 + s.intensity * 0.6);
    }
  }

  /* Flare afterglow. Lives here rather than in `disaster.js` because this module
     is already the home of brief bright things and `world.js` already imports it
     — putting it back where `stellarFlare` is written would have made world.js
     import disaster.js, which imports world.js. Three scalars. */
  if (W.flareGlow > 0.001) W.flareGlow *= 0.82;
  else if (W.flareGlow) W.flareGlow = 0;
  if (W.auroraPower > 0.001) W.auroraPower *= 0.965;
  else if (W.auroraPower) W.auroraPower = 0;

  W.flashCells = W._flashCells.length;
  W.strikeCount = W._flashCells.length;
}
