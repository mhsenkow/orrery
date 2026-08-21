/** Wildfire — the one disturbance a player can start and then watch spread.
 *
 *  Fire is a sparse front, not a field sweep: only cells that are actually
 *  burning are visited, so a quiet planet costs one integer compare per tick and
 *  a continent-scale burn costs the perimeter, not the area. Three existing
 *  fields carry the consequence — `life` is the fuel, `ash` is the smoke and the
 *  scar, `temp` is the heat — so nothing downstream needs teaching about fire:
 *  `pickBehav` in agents.js already flees ash, `bioTick` already regrows into a
 *  cleared cell, and the ash overlay already paints it.
 *
 *  Ignition has two sources. `igniteFire` is the player's match (Strike → Ignite,
 *  or the Lab button). Dry-season ignition is the planet's own: hot, dry, fuelled
 *  land with a lightning-scale probability per cell per tick. The pinned
 *  calibration Earth is exempt — see `isPinnedEarth` — so the Holocene snapshot
 *  the model is calibrated against cannot drift by burning itself down.
 */

import { clamp } from '../math.js';
import { NC, NBR, DIR } from '../sphere.js';
import { rngOf } from './rng.js';
import { isPinnedEarth } from './ruleMode.js';
import { strike } from './lightning.js';
import { seedStorm } from './storms.js';

/** Below this a cell is out; above it, it is on the active list. */
const OUT = 0.02;
/** Fuel floor — bare rock and thin tundra do not carry a crown fire. */
const MIN_FUEL = 0.10;
/** Wet ground refuses to light however hot it is. */
const MAX_WET = 0.62;
/* Spread fit. These two set how many neighbours a burning cell is expected to
   set alight over its life: below 1 a fire never leaves the match, far above 2
   it takes the continent. They are fitted, not derived, and they are fitted
   against the *demo Earth's actual danger distribution* — which moved once
   already (peak danger fell from 0.45 to 0.21 as the biosphere thinned, and the
   front quietly stopped propagating). `fireReach` and the test that calls it
   exist so the next such shift fails loudly instead of silently. */
const SPREAD_K = 1.15;
const FLAME_DECAY = 0.9;

function ensureFields(W) {
  if (!W.fire || W.fire.length !== NC) {
    W.fire = new Float32Array(NC);
    W._fireCells = [];
  }
  if (!W._fireCells) W._fireCells = [];
}

/** Clear fire state on world generate / load — matches a fresh process. */
export function resetFireState(W) {
  if (W.fire?.length === NC) W.fire.fill(0);
  else {
    W.fire = null;
    W._fireCells = null;
  }
  W._fireScan = 0;
  W._fireLit = 0;
  W._fireBigLogged = false;
  W.fireCells = 0;
  W.fireFront = 0;
  W.burntArea = 0;
  W.fireDangerMax = 0;
  W._igniteLogged = 0;
  W._pyroSeeded = false;
}

/** Can this cell carry a fire at all? Land, fuelled, not frozen, not soaked. */
export function flammableAt(W, c) {
  if (W.h[c] < W.seaLevel) return false;
  if ((W.ice?.[c] || 0) > 0.25) return false;
  if ((W.life[c] || 0) < MIN_FUEL) return false;
  if ((W.moist[c] || 0) > MAX_WET) return false;
  return true;
}

/** Dryness of the fuel: hot and rainless burns, cold and wet does not. */
export function fireDanger(W, c) {
  if (!flammableAt(W, c)) return 0;
  const dry = 1 - clamp((W.moist[c] || 0) / MAX_WET, 0, 1);
  const heat = clamp(((W.temp[c] || 0.5) - 0.42) / 0.32, 0, 1);
  const fuel = clamp(((W.life[c] || 0) - MIN_FUEL) / 0.5, 0, 1);
  const wet = clamp((W.precip?.[c] || 0) * 12, 0, 1);
  return clamp(dry * (0.35 + heat * 0.65) * (0.3 + fuel * 0.7) * (1 - wet * 0.8), 0, 1);
}

/** Ignitions are frequent once fire works — 318 lines in 800 ticks. The
 *  chronicle wants a sample, and `Firestorm` below still logs the ones that
 *  actually run. */
function noteIgnition(W) {
  W._igniteLogged = (W._igniteLogged | 0) + 1;
  return W._igniteLogged <= 3 || W._igniteLogged % 9 === 0;
}

/** Light a fire. Returns the number of cells actually set alight. */
export function igniteFire(W, cell, power = 1, radius = 1) {
  ensureFields(W);
  let lit = 0;
  const seed = (c, amt) => {
    if (c < 0 || c >= NC) return;
    if (!flammableAt(W, c)) return;
    if (W.fire[c] > OUT) return;
    W.fire[c] = clamp(amt, 0, 1.2);
    W._fireCells.push(c);
    lit++;
  };
  seed(cell, power);
  if (radius > 0) {
    for (let k = 0; k < 4; k++) seed(NBR[cell * 4 + k], power * 0.7);
  }
  if (lit) W._fireLit = (W._fireLit | 0) + lit;
  return lit;
}

/**
 * One step of the fire front.
 *
 * Cost is O(burning cells + their neighbours). `W.burntArea` and `W.fireCells`
 * are published for the HUD and for the probe so the demo can be measured
 * rather than described.
 */
export function fireTick(W, log = null) {
  ensureFields(W);
  const rng = rngOf(W, 'rngAgents');
  const fire = W.fire;
  const active = W._fireCells;

  /* Ash weathers away. It only ever decayed for cells on the live front, and a
     cell drops off that list the moment its flame goes out — so every scar and
     every ashfall was permanent, and the demo Earth went from 44 ashy cells to
     663 over 1 200 ticks and kept climbing toward a grey planet. Rain and wind
     bury ash in months; here that is a half-life of roughly 400 ticks, applied
     once every eighth tick so the cost is one sweep per eight rather than eight
     sweeps, and applied to the whole field so eruption ash and vent ash weather
     too. A strided pass would have been cheaper and would have put diagonal
     stripes across the planet, because cell index maps to face and row. */
  if (((W._tickIndex | 0) & 7) === 0 && W.ash) {
    const ash = W.ash;
    for (let c = 0; c < NC; c++) {
      const a = ash[c];
      if (a > 0.002) ash[c] = a * 0.985;
      else if (a) ash[c] = 0;
    }
  }

  // Dry-season ignition. One strided sample per tick keeps this O(NC/97) and
  // still reaches every cell within a hundred ticks; the calibration Earth is
  // exempt so the pinned Holocene snapshot cannot burn itself off target.
  if (!W.rule?.daisyworld) {
    const mayIgnite = !isPinnedEarth(W.rule);
    const stride = 97;
    const off = (W._fireScan = ((W._fireScan | 0) + 1) % stride);
    // Lightning-scale: a strongly dry, fuelled, hot cell lights roughly once
    // per few thousand visits, so a continent smoulders somewhere most seasons.
    // Measured on the demo Earth: peak danger is ~0.45, and ~700 land cells sit
    // above 0.2. With stride 97 that is ~7 visits per cell per 100 ticks, so
    // this rate lights something roughly every 75 ticks — about one fire every
    // seven seconds of play, which is a planet that smoulders, not one on fire.
    /* Relative to the planet's own dry tail, not to an absolute number.
       The old gate was `d < 0.18` with a rate of `0.03 · d²`, fitted when peak
       danger on the demo Earth was 0.45. Danger has since fallen to ~0.22 —
       first because the biosphere thinned, then because cyclones started
       actually raining — and each time the absolute gate silently switched fire
       off. Scoring against `fireDangerMax` means a dry world burns and a wet one
       does not, without a constant that goes stale every time the climate moves. */
    const ceil = Math.max(0.10, W.fireDangerMax || 0);
    const gate = ceil * 0.55;
    const span = Math.max(0.02, ceil - gate);
    /* Fitted against burnt biomass, not against how often something is alight:
       at 0.055 the demo Earth burned more than half its standing land biomass in
       600 ticks and fire became the dominant mortality on land. At 0.015, over
       600 ticks: N=64 lights 66 fires, ash covers 15% of land, the peak front is
       32 cells, something is burning ~70% of the time, and 87 of 1 997 units of
       standing biomass burn — visible constantly, decisive nowhere.
       Fire is resolution-dependent and this rate does not try to hide it. Two
       scalings pull opposite ways: this scan visits `NC / stride` cells a tick, so
       a fixed per-visit probability puts ignitions ∝ NC; and spread advances a
       fixed number of *cells* per tick, so a front covers less physical ground at
       higher detail. Normalising ignition alone made N=64 nearly fireless while
       N=32 burned half its land. Fitted at N=64 — the resolution the app opens at
       — and checked at N=32, which is where the tests run. Making the burnt-area
       fraction genuinely invariant means scaling spread with cell size, which is
       a modelling change, not a constant. */
    const rate = 0.015 * (1 + (W.stormyFrac || 0));
    let scanMax = 0;
    for (let c = off; c < NC; c += stride) {
      const d = fireDanger(W, c);
      if (d > scanMax) scanMax = d;
      if (!mayIgnite || fire[c] > OUT) continue;
      if (d < gate) continue;
      const rel = clamp((d - gate) / span, 0, 1);
      if (rng() < rate * (0.25 + rel * 0.75)) {
        /* Draw the cause, not just the effect. This roll *is* dry lightning —
           it was named that in the comment and rendered as nothing, so a
           wildfire appeared out of clear ground. Now the bolt lands first. */
        strike(W, c, 0.9);
        igniteFire(W, c, 0.55 + d * 0.4, 0);
        if (log && noteIgnition(W)) log(W.year, 'fire', c, d, 'Dry lightning · fire started');
      }
    }
    /* Highest danger this scan saw, decayed toward the new reading. Published so
       the HUD, the probe and the tests can see when a world has stopped being
       able to burn — the ignition gate above is absolute, so a thinning
       biosphere silently switches fire off and nothing said so. */
    W.fireDangerMax = Math.max(scanMax, (W.fireDangerMax || 0) * 0.98);
  }

  /* Storm lightning. `lightningTick` ran earlier this tick, so `_flashCells` is
     this tick's bolts — a short list, no scan. Most land on water or wet ground
     and do nothing, which is the point: the same cause, and the ground decides.
     This is why a cyclone crossing a dry coast is worth watching. */
  if (!isPinnedEarth(W.rule) && W._flashCells?.length) {
    const bolts = W._flashCells;
    for (let i = 0; i < bolts.length; i++) {
      const c = bolts[i];
      if (fire[c] > OUT) continue;
      /* Only a fresh bolt. `_flashCells` holds *live* flashes, which decay over
         several ticks, so testing the whole list every tick gave one strike a new
         ignition roll on each of its remaining frames — six or more ignitions a
         tick from ten bolts. A flash starts above 0.5 and drops below it in one
         tick, so this is the leading edge and nothing else. */
      if (W.flash[c] < 0.5) continue;
      const d = fireDanger(W, c);
      if (d < 0.10) continue;
      if (rng() < d * 0.8) {
        igniteFire(W, c, 0.5 + d * 0.4, 0);
        if (log && noteIgnition(W)) log(W.year, 'fire', c, d, 'Lightning strike · fire started');
      }
    }
  }

  if (!active.length) {
    W.fireCells = 0;
    W.fireFront = 0;
    return 0;
  }

  // Wind raises the spread rate. Direction is deliberately not modelled here:
  // a per-cell wind-aligned kernel costs four dots per neighbour and the front
  // already reads as a front. Stated so nobody mistakes this for a fire model.
  // Wind raises spread rate and biases the front downwind. Rivers damp crossing.
  const next = [];
  let burnt = 0;
  for (let i = 0; i < active.length; i++) {
    const c = active[i];
    const f = fire[c];
    if (f <= OUT) { fire[c] = 0; continue; }

    // Take a share of the standing biomass, not all of it: a burnt cell keeps a
    // seed bank, so `bioTick` regrows into the scar instead of leaving bare rock.
    const fuel = W.life[c] || 0;
    const consume = Math.min(fuel * 0.45, f * 0.14);
    W.life[c] = Math.max(0, fuel - consume);
    W.ash[c] = clamp((W.ash[c] || 0) + consume * 2.2 + f * 0.06, 0, 1);
    W.temp[c] = Math.min(1.5, (W.temp[c] || 0.5) + f * 0.02);
    // Ash is fertiliser as well as scar — the regrowth after a burn is richer.
    if (W.nutrientP) W.nutrientP[c] = clamp(W.nutrientP[c] + consume * 0.35, 0, 1);
    if (W.soil) W.soil[c] = clamp(W.soil[c] + consume * 0.05, 0, 1);
    burnt += consume;

    const wu = W.windU?.[c] || 0;
    const wv = W.windV?.[c] || 0;
    const wind = Math.hypot(wu, wv);
    const push = 0.7 + Math.min(1.3, wind * 1.6);
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (fire[n] > OUT) continue;
      if ((W.flow?.[n] || 0) > 0.32) continue;
      const d = fireDanger(W, n);
      if (d < 0.10) continue;
      const dx = DIR[n * 3] - DIR[c * 3];
      const dy = DIR[n * 3 + 1] - DIR[c * 3 + 1];
      const dz = DIR[n * 3 + 2] - DIR[c * 3 + 2];
      const dl = Math.hypot(dx, dy, dz) || 1;
      let align = 0.65;
      if (wind > 0.02) {
        align += 0.55 * Math.max(0, (dx / dl) * (wu / wind) + (dy / dl) * (wv / wind));
      }
      /* Tuned so a cell has roughly 1.5–3 expected offspring on the demo Earth:
         supercritical enough that a front runs, subcritical enough that it stops
         at the first wet valley. `(0.2 + d)` keeps a marginal cell reachable so
         the burn has a ragged edge instead of a circle. */
      if (rng() < f * (0.2 + d) * push * SPREAD_K * align) {
        fire[n] = clamp(f * 0.9, 0, 1.2);
        next.push(n);
      }
      // Smoke runs ahead of the flame — that is the part you see from orbit.
      W.ash[n] = clamp((W.ash[n] || 0) + f * 0.05, 0, 1);
    }

    // Burn down: no fuel left, or the front has passed.
    const starved = (W.life[c] || 0) < MIN_FUEL * 0.6;
    fire[c] = f * (starved ? 0.45 : FLAME_DECAY);
    if (fire[c] > OUT) next.push(c);
    else fire[c] = 0;
  }

  // Ash settles and smears; without this a burn scar is permanent and the
  // fleeing herds never come back.
  for (let i = 0; i < active.length; i++) {
    const c = active[i];
    const a = W.ash[c] || 0;
    if (a <= 0.001) continue;
    const give = a * 0.06;
    W.ash[c] = a - give - a * 0.02;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      W.ash[n] = clamp((W.ash[n] || 0) + give * 0.25, 0, 1);
    }
  }

  W._fireCells = next;
  W.fireCells = next.length;
  W.fireFront = next.length;
  W.burntArea = (W.burntArea || 0) + burnt;
  // Combustion is a carbon flux; keep it small but not zero so the air notices.
  if (burnt > 0) {
    W.gases.CO2 = Math.min(0.5, W.gases.CO2 + burnt * 2e-6);
    W.gases.dust = Math.min(0.5, (W.gases.dust || 0) + burnt * 4e-5);
    if (W.carbon) W.carbon.atmosphere += burnt * 0.02;
  }
  if (log && next.length > 24 && !W._fireBigLogged) {
    W._fireBigLogged = true;
    log(W.year, 'fire', next[0], next.length / 100, `Firestorm · ${next.length} cells alight`);
  }
  if (!next.length) W._fireBigLogged = false;

  /* Pyrocumulus. A fire big enough to build its own convective column makes its
     own weather, and then the rain it makes puts it out — one of the few loops
     in this model that closes on itself inside a minute of watching. The storm
     is seeded at the front, not the ignition point, because that is where the
     heat is. Gated on a front large enough to be doing it, and once per fire. */
  if (next.length >= 20 && !W._pyroSeeded) {
    W._pyroSeeded = true;
    const r = seedStorm(W, next[(next.length / 2) | 0], { radius: 3, log });
    if (log && r?.ok) {
      log(W.year, 'storm', next[0], 0.5, 'Pyrocumulus over the fire');
    }
  }
  if (next.length < 8) W._pyroSeeded = false;
  return next.length;
}
