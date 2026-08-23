/** Weather clock — lived-time dial for the column (COL21–COL30).
 *
 *  The air column (`aircol.js`) has a three-day memory (`keep`): when the tick
 *  is shorter than about forty simulation-days the column *remembers* its
 *  previous state rather than being fully diagnostic. This is useful but it
 *  requires a tick that is already short in simulation years. A player who
 *  wants to watch weather evolve needs a dial that shrinks the effective dt
 *  without changing the geological clock — a "weather speed" that says how many
 *  hours of atmosphere pass per real-time second.
 *
 *  That is what `wxClock` provides: a presentation-parallel clock that counts
 *  hours-of-day, a diurnal heating factor, and optional low-level shear boosts
 *  that come with the day/night cycle (COL24/25).
 *
 *  Two-clock contract (COL29): the geological clock (`W.year`, `W.dtYr`) and
 *  the weather clock (`W.wxClock.hourOfDay`) advance independently. The weather
 *  clock *never* moves `W.year`; it only shrinks the effective `W.dtYr` seen by
 *  the column's `keep` blend, and writes diurnal modulations that other modules
 *  may read. This means a planet can be at year 4.2 Ga with its column
 *  experiencing afternoon heating — the clocks are orthogonal.
 *
 *  @provenance fitted
 */

import { clamp } from '../math.js';

/**
 * Allocate or return the weather clock record on W.
 */
export function allocWeatherClock(W) {
  if (!W.wxClock) {
    W.wxClock = {
      hoursPerSec: 0,
      hourOfDay: 12,
      dayFrac: 0.5,
      enabled: false,
      diurnal: 0,
      cinBoost: 0,
      shearBoost: 0,
    };
  }
  return W.wxClock;
}

/**
 * Advance the weather clock by `dtSec` real seconds (COL21).
 *
 * When enabled and hoursPerSec > 0, the clock ticks forward, producing a
 * diurnal heating factor (sin curve peaking at solar noon) and optional
 * nocturnal shear / dawn CIN boosts (COL24/25).
 */
export function weatherClockTick(W, dtSec) {
  const wx = allocWeatherClock(W);
  if (!wx.enabled || !(wx.hoursPerSec > 0) || !(dtSec > 0)) {
    wx.diurnal = 0;
    wx.cinBoost = 0;
    wx.shearBoost = 0;
    return;
  }

  const dHours = wx.hoursPerSec * dtSec;
  wx.hourOfDay = (wx.hourOfDay + dHours) % 24;
  if (wx.hourOfDay < 0) wx.hourOfDay += 24;
  wx.dayFrac = wx.hourOfDay / 24;

  // Diurnal CAPE hint: sin(dayFrac * 2π) peaks at noon (dayFrac=0.5 when hourOfDay=12)
  // Shift so peak is at local noon (hour 12 → dayFrac 0.5 → sin(π) = 0 ... need phase shift)
  // We want peak heating at hour ~14 (dayFrac ~0.583), minimum at hour ~5 (dayFrac ~0.208)
  // sin(2π(dayFrac - 0.25)) peaks at dayFrac=0.5 → hour 12 ✓
  wx.diurnal = Math.sin(2 * Math.PI * (wx.dayFrac - 0.25));

  // COL25: after sunset (hour 18–6) boost low-level wind shear factor
  const night = wx.hourOfDay >= 18 || wx.hourOfDay < 6;
  wx.shearBoost = night ? 0.15 : 0;

  // COL24: dawn (hour 4–7) boost CIN slightly — radiative stabilisation of the boundary layer
  const dawn = wx.hourOfDay >= 4 && wx.hourOfDay < 7;
  wx.cinBoost = dawn ? 0.08 : 0;
}

/**
 * Set weather speed in hours-per-second; 0 disables (COL22).
 */
export function setWeatherSpeed(W, hoursPerSec) {
  const wx = allocWeatherClock(W);
  wx.hoursPerSec = clamp(hoursPerSec, 0, 720);
  wx.enabled = wx.hoursPerSec > 0;
  return wx;
}

/**
 * Read-only snapshot of the weather clock state (COL23).
 */
export function weatherClockState(W) {
  const wx = W.wxClock;
  if (!wx) return { enabled: false, hoursPerSec: 0, hourOfDay: 12, dayFrac: 0.5, diurnal: 0 };
  return {
    enabled: wx.enabled,
    hoursPerSec: wx.hoursPerSec,
    hourOfDay: wx.hourOfDay,
    dayFrac: wx.dayFrac,
    diurnal: wx.diurnal,
    cinBoost: wx.cinBoost,
    shearBoost: wx.shearBoost,
  };
}
