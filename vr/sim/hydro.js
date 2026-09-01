/** Hydrosphere: conserved water, sea level, rivers, lakes, ice.
 *  @provenance tagged-module
 */

import { clamp } from '../math.js';
import { NC, NBR, NBR8, DIR, AREA, NBR_E, NBR_N, NBR_ICHORD, cellSizeKm } from '../sphere.js';
import { totalPressure } from '../rulesets.js';
import { rejectBrine, noteTropicalBasin, ensoEastness } from './ocean.js';
import { neighbourMean } from './vecop.js';
import { advect } from './atmo.js';
import { updateIsoline } from './isoline.js';
import { logEvent } from '../chronicle.js';
import {
  cycleMaterial, phaseAt, rheologyAt, cellTK, surfacePbar, surfaceTK, livePressureBar,
} from './substrateField.js';
import { coverTick, reservoirTick } from './cover.js';
import { clathrateTick } from './columnSketch.js';
import { waterInventory } from './assert.js';
import { windSpeedAt } from './wind.js';

/* The water cycle's rates, in one place.
 *
 * `SATREF` is the saturation vapour content of a cell at the reference
 * temperature (0.5 on the model's normalised scale). Saturation used to be
 * defined as the *current global vapour mass* times a temperature factor, which
 * made relative humidity approximately one everywhere by construction — the one
 * quantity that has to vary if a coast is going to be wet and an interior dry.
 * Anchoring it to a constant is what lets RH carry information; `gases.H2O`
 * becomes the diagnosed total, which is all the greenhouse ever wanted from it.
 *
 * The two evaporation rates are fractions of the humidity deficit closed per
 * tick. They are large because a tick is ten years: the atmosphere's own
 * turnover time is days, so on this clock the vapour field is nearly diagnostic
 * and the interesting dynamics are in where the wind takes it before it rains.
 * `RAIN_GAIN` converts condensed vapour into the 0–1 rain intensity the rest of
 * the sim reads, set so that a wet tropical cell lands near 0.4 and the sums in
 * `SOIL_PER_RAIN` / `DRY_LOSS` keep a rained-on continent wet. */
/* fitted: 0.036 — sat vapour at T=0.5; anchors RH */
const SATREF = 0.036;
/* fitted: 0.62 — sea evaporative closure per tick (10 yr clock) */
const EVAP_SEA = 0.62;
/* fitted: 0.10 — land evaporative closure per tick */
const EVAP_LAND = 0.10;
/* fitted: 7.5 — soil moisture lost per unit vapour evaporated */
const SOIL_PER_VAPOUR = 7.5;
/* fitted: 2.2 — lake level lost per unit vapour evaporated */
const LAKE_PER_VAPOUR = 2.2;
/* fitted: 0.075 — soil moisture gained per unit rain intensity */
const SOIL_PER_RAIN = 0.075;
/* Drainage and sublimation from bare soil, scaled by the ruleset's `aridity`.
   That knob used to multiply land *evaporation* — which made a world's dryness a
   property of how readily its soil gave up water to the air rather than of how
   fast it lost it altogether, and left Earth's land barely transpiring at
   aridity 0.05. It reads better as the sink: 0.004 a tick on Earth, eight times
   that on Ares, which is what the old moisture balance did in the end anyway. */
/* fitted: 0.08 — dry-out per unit aridity per tick */
const DRY_PER_ARIDITY = 0.08;
/* fitted: 120 — condensed vapour → 0–1 rain intensity */
const RAIN_GAIN = 120;
/* Sea water freezes about 1.8 K below fresh — 0.011 on a scale of 160 K to the
   unit — and `ICE_LATENT` is how much ice one unit of temperature deficit makes,
   i.e. the latent heat of fusion in this model's units. */
/* measured: 0.011 — ≈1.8 K seawater freeze depression / 160 K */
const SEA_FREEZE_DROP = 0.011;
/* fitted: 3.2 — latent heat of fusion in sim units */
const ICE_LATENT = 3.2;

/** Saturation vapour per cell, cached for the tick. Read by clouds and fog too. */
export function ensureSat(W) {
  if (!W.satV || W.satV.length !== NC) W.satV = new Float32Array(NC);
  const sat = W.satV;
  const temp = W.temp;
  const scale = SATREF * clamp(W.rule?.satScale ?? 1, 0.2, 4);
  for (let c = 0; c < NC; c++) {
    sat[c] = scale * Math.exp((temp[c] - 0.5) * 1.8);
  }
  return sat;
}

/** Recompute global sea level from land ice + thermal expansion. */
export function updateSeaLevel(W) {
  const { iceLand, temp, h, rule } = W;
  let iceVol = 0, oceanHeat = 0, oceanW = 0;
  for (let c = 0; c < NC; c++) {
    iceVol += iceLand[c] * AREA[c];
    if (h[c] < W.seaLevel) {
      oceanHeat += temp[c] * AREA[c];
      oceanW += AREA[c];
    }
  }
  const meanOceanT = oceanW > 0 ? oceanHeat / oceanW : 0.5;
  // Base from fitted Earth sea level, or ruleset water inventory
  const base = W._seaBase != null ? W._seaBase : (-0.05 + rule.totalWater * 0.42);
  // Fitted worlds keep land fraction stable — hypsometry is steep near the shelf
  if (W._seaBase != null) {
    const thermal = (meanOceanT - 0.45) * 0.006;
    const iceDrawdown = Math.min(0.006, iceVol * 0.0008);
    W.seaLevel = clamp(base - iceDrawdown + thermal, -0.55, 0.85);
    return;
  }
  const iceDrawdown = Math.min(0.25, iceVol * 0.08);
  const thermal = (meanOceanT - 0.45) * 0.035;
  W.seaLevel = clamp(base - iceDrawdown + thermal, -0.55, 0.85);
}

/** Triple-point gate. Non-water volatiles do not run the water cycle.
 *  Methane keeps Titan's sketch; CO₂ / SO₂ / N₂ / H₂ / silicate skip it.
 *  Frost / sublimation for those species is `cycleMode`, not this gate. */
export function liquidWaterOk(W) {
  if (W.rule.airless) return false;
  const vol = W._worldAxes?.volatile?.v;
  const methane = W.rule.methaneSolvent || vol === 'CH4';
  if (vol && vol !== 'H2O' && !methane) return false;
  const P = W.rule.surfacePressureBar != null
    ? W.rule.surfacePressureBar
    : totalPressure(W.gases, W.rule);
  if (methane) return P > 0.02;
  return P > 0.006;
}

/** What the hydro machinery is doing: liquid rain, frost/sublimation, or nothing. */
export function cycleMode(W) {
  if (W.noSurface) return 'none';
  if (W.rule?.airless) return 'none';
  if (liquidWaterOk(W)) return 'liquid';
  const mat = cycleMaterial(W);
  if (!mat) return 'none';
  const T = surfaceTK(W.rule, W);
  const P = livePressureBar(W);
  const ph = phaseAt(mat, T, P);
  const rheo = rheologyAt(mat, T, P);
  if (ph === 'solid' || rheo === 'convecting-ice') return 'frost';
  return 'none';
}

/** The neighbour the wind is blowing toward, or −1 in a calm.
 *
 *  `along` used to be the wind dotted with the *chord* to the neighbour, which
 *  is a cell width long — about 0.025 at N=64 — and then compared against a
 *  threshold of 0.02, so it took a wind of 0.8 to register a direction at all.
 *  Real winds here run a tenth of that, so this returned −1 almost everywhere
 *  and rain shadows never propagated past the ridge that cast them. Dividing by
 *  the chord makes `along` the wind speed in that direction, which is what the
 *  threshold was always meant to be comparing. */
function downwindNeighbour(c, u, v) {
  let best = -1, bestA = 0.02;
  const i0 = c * 4;
  for (let k = 0; k < 4; k++) {
    const i = i0 + k;
    const along = (u * NBR_E[i] + v * NBR_N[i]) * NBR_ICHORD[i];
    if (along > bestA) { bestA = along; best = NBR[i]; }
  }
  return best;
}

function noteCycleShift(W, mode) {
  if (W._cycleMode === mode) return;
  const prev = W._cycleMode;
  W._cycleMode = mode;
  if (!prev || !W.chron) return;
  const mat = cycleMaterial(W);
  const name = mat?.name || 'volatile';
  let label = null;
  if (mode === 'frost' && (prev === 'liquid' || prev === 'none')) {
    label = `The atmosphere has begun to freeze out (${name})`;
  } else if (mode === 'liquid' && prev === 'frost') {
    label = `${name} has melted`;
  } else if (mode === 'none' && prev === 'frost') {
    label = `${name} has sublimated into vapour`;
  }
  if (label) logEvent(W.chron, W.year || 0, 'phase', 0, 1, label);
}

/** Distance-to-sea in km. 0 on ocean, rising inland. Cheap BFS, rebuilt with the drain tree. */
let _contQ = null;
export function updateContinentality(W) {
  if (!W.cont || W.cont.length !== NC) W.cont = new Float32Array(NC);
  if (!_contQ || _contQ.length !== NC) _contQ = new Int32Array(NC);
  const dist = W.cont;
  const q = _contQ;
  const { h, seaLevel } = W;
  dist.fill(1e6);
  let qt = 0;
  for (let c = 0; c < NC; c++) {
    if (h[c] < seaLevel) {
      dist[c] = 0;
      q[qt++] = c;
    }
  }
  const km = cellSizeKm();
  let qh = 0;
  while (qh < qt) {
    const c = q[qh++];
    const d = dist[c];
    if (d > 4000) continue;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (n < 0 || n >= NC) continue;
      const nd = d + km;
      if (dist[n] < 1e5) continue;
      dist[n] = nd;
      q[qt++] = n;
    }
  }
  W._contTick = W._tickIndex || 0;
  if (!W._maritime || W._maritime.length !== NC) W._maritime = new Float32Array(NC);
  for (let c = 0; c < NC; c++) W._maritime[c] = Math.exp(-(dist[c] || 0) / 900);
}

/** Scratch queue for the coast BFS — length NC, so it cannot grow without bound. */
let _coastQ = null;

/**
 * Signed distance to the shoreline in km: + inland, − ocean.
 * Uniform-cost BFS from cells that already neighbour the other phase.
 * Each cell is enqueued at most once (the first visit is shortest).
 */
export function updateCoastDistance(W) {
  if (!W.coastDist || W.coastDist.length !== NC) W.coastDist = new Float32Array(NC);
  if (!_coastQ || _coastQ.length !== NC) _coastQ = new Int32Array(NC);
  const dist = W.coastDist;
  const q = _coastQ;
  const { h, seaLevel } = W;
  const isSea = (c) => h[c] < seaLevel;
  dist.fill(1e9);
  const km = cellSizeKm();
  let qt = 0;
  for (let c = 0; c < NC; c++) {
    const s = isSea(c);
    for (let k = 0; k < 4; k++) {
      if (isSea(NBR[c * 4 + k]) !== s) {
        dist[c] = 0.5 * km;
        q[qt++] = c;
        break;
      }
    }
  }
  let qh = 0;
  while (qh < qt) {
    const c = q[qh++];
    const d = dist[c];
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (n < 0 || n >= NC || dist[n] < 1e8) continue;
      dist[n] = d + km;
      q[qt++] = n;
    }
  }
  for (let c = 0; c < NC; c++) {
    const mag = dist[c] > 1e8 ? 4000 : dist[c];
    dist[c] = isSea(c) ? -mag : mag;
  }
  W._coastTick = W._tickIndex || 0;
  W._coastSea = seaLevel;
}

/**
 * Grow the water table and D8 discharge so the opening world has rivers,
 * not eight wet cells. Climate warmup already set rain; this only routes it.
 */
export function primeDrainage(W, passes = 1) {
  if (!liquidWaterOk(W)) return;
  if (!W.groundW || W.groundW.length !== NC) W.groundW = new Float32Array(NC);
  const { h, seaLevel, moist, precip, groundW } = W;
  for (let c = 0; c < NC; c++) {
    if (h[c] < seaLevel) continue;
    const wet = Math.max(moist[c] || 0, precip[c] || 0);
    // Springs fire above 0.64. One route is enough — extra passes *decay*
    // the table (×0.984 per tick) and the last one would have no seep.
    groundW[c] = Math.max(groundW[c] || 0, 0.76 + wet * 0.12);
  }
  W._hydroDirty = true;
  for (let i = 0; i < passes; i++) computeRivers(W);
}

/**
 * Persistent D8/D∞ drainage tree + depression lakes + groundwater baseflow.
 * Rebuilds the tree when terrain has moved; flow accumulates every tick.
 */
export function computeRivers(W) {
  const { h, seaLevel, flow, lake } = W;
  if (!liquidWaterOk(W)) {
    flow.fill(0);
    lake.fill(0);
    return;
  }
  if (!W.drainTo || W.drainTo.length !== NC) W.drainTo = new Int32Array(NC);
  if (!W.drainTo2 || W.drainTo2.length !== NC) W.drainTo2 = new Int32Array(NC);
  if (!W.groundW || W.groundW.length !== NC) W.groundW = new Float32Array(NC);

  const tick = W._tickIndex || 0;
  const terrainMoved = !!W._hydroDirty;
  const rebuild = terrainMoved || W._drainTick == null || (tick - W._drainTick) > 7;
  if (rebuild) {
    W._drainTick = tick;
    W._hydroDirty = false;
    for (let c = 0; c < NC; c++) {
      if (h[c] < seaLevel) {
        W.drainTo[c] = -2;
        W.drainTo2[c] = -2;
        continue;
      }
      let b1 = -1, h1 = h[c], b2 = -1, h2 = h[c];
      for (let k = 0; k < 8; k++) {
        const n = NBR8[c * 8 + k];
        if (h[n] < h1) { h2 = h1; b2 = b1; h1 = h[n]; b1 = n; }
        else if (h[n] < h2) { h2 = h[n]; b2 = n; }
      }
      W.drainTo[c] = b1;
      W.drainTo2[c] = (b2 >= 0 && h2 < h[c] - 0.002) ? b2 : -1;
    }
  }

  flow.fill(0);
  /* Where rivers meet the sea. Published because the ocean wants it — a river
     mouth is the strongest dilution on any coastline, and the Baltic and the
     Black Sea are shaped more by their rivers than by their rainfall. */
  if (!W.riverMouth || W.riverMouth.length !== NC) W.riverMouth = new Float32Array(NC);
  W.riverMouth.fill(0);
  if (!W._order || W._order.length !== NC) W._order = new Int32Array(NC);
  const order = W._order;
  if (terrainMoved || !W._orderReady) {
    for (let c = 0; c < NC; c++) order[c] = c;
    order.sort((a, b) => h[b] - h[a]);
    W._orderReady = true;
  }

  // `flow` is surface discharge (throughput), not ponded volume. A 0.35 floor on
  // every land cell used to make the whole continent a river after D8 pile-up.
  // Runoff is now the water that cannot infiltrate; groundwater stays underground
  // until the table is high enough to seep (springs in valleys).
  for (let i = 0; i < NC; i++) {
    const c = order[i];
    if (h[c] < seaLevel) {
      lake[c] *= 0.9;
      W.groundW[c] = (W.groundW[c] || 0) * 0.96;
      continue;
    }
    const rain = W.precip[c] || 0;
    const soil = W.moist[c] || 0;
    const table = W.groundW[c] || 0;
    const wet = clamp((soil - 0.18) / 0.55, 0, 1);
    const rainRunoff = rain * (0.08 + 0.72 * wet);
    const satExcess = Math.max(0, soil - 0.58) * 0.18;
    W.groundW[c] = clamp(
      table * 0.992 + rain * (0.22 - wet * 0.12) + soil * 0.025 - rainRunoff * 0.06,
      0, 1
    );
    const seep = W.groundW[c] > 0.64 ? (W.groundW[c] - 0.64) * 0.2 : 0;
    flow[c] += AREA[c] * (rainRunoff + satExcess) + seep;

    let d1 = W.drainTo[c];
    if (d1 < 0) {
      /* A closed basin fills, and keeps what it holds.
       *
       * This used to fill to 0.32 and then write the rim into `drainTo`
       * permanently — converting the depression into an ordinary through-flowing
       * cell for the rest of the run, after which the lake decayed at 0.88 a
       * tick and vanished. So no lake on any world ever got past a third full or
       * lasted more than a few decades: no Baikal, no Great Lakes, no Caspian,
       * and no salt pan either, because a basin that dries out is the same
       * mechanism run the other way.
       *
       * A lake is a balance instead: inflow and rain in, evaporation out (which
       * `hydroTick` now debits from the lake rather than conjuring the vapour),
       * and once it reaches its sill it spills the excess over the rim while
       * staying full. Wet basins hold water, arid ones evaporate down to a
       * playa, and both are visible from orbit. */
      const inflow = flow[c];
      lake[c] = clamp((lake[c] || 0) + inflow * 0.06 + (W.precip[c] || 0) * 0.12, 0, 1);
      if (lake[c] < 0.985) continue;   // still filling: nothing leaves
      let rim = -1, rimH = 9;
      for (let k = 0; k < 8; k++) {
        const n = NBR8[c * 8 + k];
        if (h[n] < rimH) { rimH = h[n]; rim = n; }
      }
      if (rim < 0) continue;
      d1 = rim;                        // spills this tick; the basin stays a basin
    } else if (lake[c] > 0) {
      // Not a closed basin — any standing water here drains away.
      lake[c] *= 0.88;
    }
    const d2 = W.drainTo2[c];
    const share = d2 >= 0 ? 0.74 : 1;
    if (d1 >= 0) {
      if (h[d1] >= seaLevel) flow[d1] += flow[c] * share;
      else W.riverMouth[d1] += flow[c] * share;
    }
    if (d2 >= 0) {
      if (h[d2] >= seaLevel) flow[d2] += flow[c] * (1 - share);
      else W.riverMouth[d2] += flow[c] * (1 - share);
    }
  }
}

/** Ice mass balance: accumulate above snowline, ablate below; separate sea/land. */
export function iceTick(W) {
  const { h, temp, iceLand, iceSea, seaLevel, moist, precip, rule } = W;
  if (!rule.earthLike) {
    reservoirTick(W);
    coverTick(W);
    clathrateTick(W);
    if (W._spinup) return;
    const mat = cycleMaterial(W);
    const vol = W._worldAxes?.volatile?.v;
    if (mat && vol && vol !== 'H2O') {
      if (vol !== 'CO2' && vol !== 'N2') iceTickFromPhase(W, mat);
      return;
    }
  }
  if (W._spinup) return;
  // Seasonal snow line migration. Item 141.
  const season = W.season || 0;
  const snowline = rule.freeze + 0.05 + Math.sin(season) * 0.04;
  const earth = !!rule.earthLike && !rule.deepTime;
  const freeze = rule.freeze ?? 0.30;
  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const lat = DIR[c * 3 + 1];
    const elev = Math.max(0, h[c] - seaLevel);
    const coldness = earth
      ? clamp((freeze + 0.08 - temp[c] + elev * 0.12) / 0.28, 0, 1)
      : 0;
    const seasonalCold = Math.sin(season) * lat; // NH winter when season~3π/2
    if (isSea) {
      iceLand[c] = 0;
      /* Sea ice as latent heat, which is what sea ice is.
       *
       * Growth was a flat 0.06 a tick below a threshold and melt a flat 0.035
       * above it, with nothing tying either to the heat actually moving — and,
       * more seriously, nothing stopping the water from cooling straight past its
       * own freezing point. The polar ocean sat at 264 K, twenty degrees below
       * where sea water turns solid, which is both impossible and the reason the
       * deep ocean had to be initialised colder still for the density to come out
       * the right way round.
       *
       * Heat leaving water that has reached its freezing point goes into freezing
       * it, not into a lower temperature; heat arriving at ice goes into melting
       * it. So the deficit below the freezing point *is* the growth rate, the
       * surplus above it *is* the melt rate, and open water holds at −1.8 °C
       * however hard the air pulls. Thick ice insulates, so once the lid is
       * established the skin above it is free to go as cold as the air — which is
       * how a real ice cap gets to −40 °C sitting on water at −1.8 °C. */
      const seaFreeze = freeze - SEA_FREEZE_DROP - seasonalCold * 0.02;
      if (liquidWaterOk(W)) {
        const deficit = seaFreeze - temp[c];
        if (deficit > 0) {
          const grow = Math.min(1 - iceSea[c], deficit * ICE_LATENT);
          if (grow > 0) {
            iceSea[c] = clamp(iceSea[c] + grow, 0, 1);
            rejectBrine(W, c, grow);
          }
          // Open water and thin ice cannot go below freezing; a thick lid can.
          if (iceSea[c] < 0.6) temp[c] = seaFreeze;
        } else if (iceSea[c] > 0) {
          iceSea[c] = Math.max(0, iceSea[c] - Math.min(iceSea[c], -deficit * ICE_LATENT));
          // Melting holds the surface near freezing while any ice is left.
          if (iceSea[c] > 0.05) temp[c] = seaFreeze - deficit * 0.25;
        }
      } else if (temp[c] < seaFreeze) {
        iceSea[c] = clamp(iceSea[c] + 0.06, 0, 1);
      }
    } else {
      iceSea[c] = 0;
      const cold = temp[c] < snowline - elev * 0.15 - seasonalCold * 0.05 - coldness * 0.14;
      const canopy = W.life[c] > 0.45 ? 0.55 : W.life[c] > 0.2 ? 0.8 : 1;
      if (cold) {
        iceLand[c] = clamp(iceLand[c] + precip[c] * 0.10 * canopy, 0, 1);
      } else {
        const melt = Math.max(0.04, (temp[c] - snowline) * 0.35) * (2 - canopy) * (1 - coldness * 0.85)
          * (1 + (precip[c] || 0) * 1.6);
        const lost = Math.min(iceLand[c], melt);
        iceLand[c] = Math.max(0, iceLand[c] - melt);
        if (lost > 0.002) moist[c] = clamp((moist[c] || 0) + lost * 0.22, 0, 1);
      }
      if (earth && coldness > 0.72 && elev > 0.02) {
        iceLand[c] = Math.max(iceLand[c], 0.2 + coldness * 0.4);
      }
      if (iceLand[c] > 0.3) {
        for (let k = 0; k < 4; k++) {
          const n = NBR[c * 4 + k];
          if (h[n] < h[c] && h[n] >= seaLevel) {
            const move = (iceLand[c] - iceLand[n]) * 0.02;
            if (move > 0) {
              iceLand[c] -= move;
              iceLand[n] = Math.min(1, iceLand[n] + move);
            }
          }
        }
      }
    }
    W.ice[c] = Math.max(iceLand[c], iceSea[c]);
  }
}

/** Non-Earth ice: freeze / melt / sublimate from the cycle species' phase. */
function iceTickFromPhase(W, mat) {
  const { h, iceLand, iceSea, seaLevel } = W;
  const P = livePressureBar(W);
  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const ph = phaseAt(mat, cellTK(W, c), P);
    const rheo = rheologyAt(mat, cellTK(W, c), P);
    const solid = ph === 'solid' || rheo === 'convecting-ice';
    if (isSea) {
      iceLand[c] = 0;
      if (solid) iceSea[c] = clamp((iceSea[c] || 0) + 0.05, 0, 1);
      else iceSea[c] = Math.max(0, (iceSea[c] || 0) - (ph === 'liquid' ? 0.12 : 0.08));
    } else {
      iceSea[c] = 0;
      if (solid) {
        iceLand[c] = clamp((iceLand[c] || 0) + 0.04 + (W.precip[c] || 0) * 0.08, 0, 1);
      } else {
        iceLand[c] = Math.max(0, (iceLand[c] || 0) - (ph === 'liquid' ? 0.1 : 0.07));
      }
    }
    W.ice[c] = Math.max(iceLand[c], iceSea[c]);
  }
}

/**
 * Closed water budget: evaporate → atmospheric H2O → precip → moist/runoff.
 * Conserves total water mass (ocean column + moist + ice + vapour).
 */
export function hydroTick(W) {
  if (W.noSurface) {
    if (W.precip) W.precip.fill(0);
    if (W.flow) W.flow.fill(0);
    if (W.lake) W.lake.fill(0);
    if (W.fog) W.fog.fill(0);
    return;
  }
  const { h, temp, moist, precip, seaLevel, windU, windV, rule, gases, _m } = W;
  const canLiquid = liquidWaterOk(W);
  const mode = cycleMode(W);
  noteCycleShift(W, mode);
  if (!W.vapour || W.vapour.length !== NC) W.vapour = new Float32Array(NC);
  if (!W._vapourInit) {
    // Start damp rather than empty, or the first few hundred ticks are a drought.
    ensureSat(W);
    for (let c = 0; c < NC; c++) W.vapour[c] = W.satV[c] * (W.h[c] < W.seaLevel ? 0.9 : 0.5);
    W._vapourInit = true;
  }
  if (!W.cont || W.cont.length !== NC || W._hydroDirty || W._contTick == null) {
    updateContinentality(W);
  }
  if (!W.coastDist || W.coastDist.length !== NC || W._hydroDirty
      || W._coastTick == null || Math.abs((W._coastSea ?? seaLevel) - seaLevel) > 0.002) {
    updateCoastDistance(W);
    updateIsoline(W);
  }
  noteTropicalBasin(W, seaLevel);
  const vapourF = W.vapour;
  if (!W.fog || W.fog.length !== NC) W.fog = new Float32Array(NC);
  if (!W.ariver || W.ariver.length !== NC) W.ariver = new Float32Array(NC);
  if (!W._upslope || W._upslope.length !== NC) W._upslope = new Float32Array(NC);
  if (!W._lee || W._lee.length !== NC) W._lee = new Float32Array(NC);
  const leeF = W._lee;
  const upF = W._upslope;

  if (mode === 'none') {
    precip.fill(0);
    W.fog.fill(0);
    W.ariver.fill(0);
    computeRivers(W);
    iceTick(W);
    updateSeaLevel(W);
    W.waterDrift = W.waterDrift || 0;
    return;
  }

  /* Evaporation, in vapour units, as a bulk flux toward saturation.
   *
   * A tick here is ten years and the atmosphere turns its water over in about
   * nine days, so the vapour field is very nearly diagnostic: whatever the sea
   * surface can supply, it supplies within one step. The old coefficients moved
   * roughly 5·10⁻⁵ of vapour per tick against a saturation of 0.03 — a six
   * hundred tick turnover, or six thousand years for one pass of the water
   * cycle. The consequence was not subtle: the vapour field sat a factor of ten
   * below saturation, rain never reached the 0.15 that land moisture needs to
   * balance aridity, and every continent away from its own coastline was a
   * desert while the ocean next door stood at saturation.
   *
   * Ocean and wet land now close most of the humidity deficit each tick, wind
   * and temperature setting how much of it. Continental dryness comes from
   * where it actually comes from — the distance vapour has to be carried inland
   * against the rain falling out of it — and not from a coefficient. */
  const satV = ensureSat(W);
  let evapTotal = 0;
  for (let c = 0; c < NC; c++) {
    const isSea = h[c] < seaLevel;
    const wind = windSpeedAt(W, c);
    const gust = 0.55 + 0.45 * Math.min(1, wind / 0.45);
    const sat = satV[c];
    const deficit = sat - vapourF[c];
    let e = 0;
    if (deficit > 0) {
      const warm = Math.max(0, temp[c] - 0.16);
      if (isSea && canLiquid) {
        e = deficit * EVAP_SEA * gust * Math.min(1, warm * 3.2) * (1 - (W.iceSea?.[c] || 0) * 0.92);
      } else if ((W.lake?.[c] || 0) > 0.2 && canLiquid) {
        e = deficit * EVAP_SEA * gust * Math.min(1, warm * 3.2) * W.lake[c];
        // Debited from the lake, not conjured: an arid basin evaporates down to
        // a playa, which is the whole difference between the Caspian and a pond.
        W.lake[c] = Math.max(0, W.lake[c] - e * LAKE_PER_VAPOUR);
      } else if (moist[c] > 0.03) {
        // Soil and leaves: wet ground and standing vegetation both transpire.
        const veg = 1 + (W.life[c] || 0) * 0.6;
        e = deficit * EVAP_LAND * gust * Math.min(1, warm * 3.2) * moist[c] * veg;
        moist[c] = Math.max(0, moist[c] - e * SOIL_PER_VAPOUR);
      }
    }
    vapourF[c] = Math.min(sat * 1.35, vapourF[c] + e);
    evapTotal += e * AREA[c];
  }
  W.evapTotal = evapTotal;
  if (W._adv && windU && windV) advect(vapourF, W, 0.28);

  /* Rain: what the column has to give up.
   *
   * Three ways for vapour to condense, in the order they matter. A column that
   * has been carried somewhere colder than it was is already over saturation and
   * dumps the excess. Air being lifted — into a convergence line, over a
   * mountain, along a front — condenses in proportion to how wet it is and how
   * hard it is being lifted. And a nearly saturated column drizzles on its own.
   * `precip` is the normalised rain intensity the rest of the sim reads;
   * `cond` is the vapour that actually left the air, so the two cannot disagree
   * about how much water moved. */
  let precipTotal = 0;
  let vapourMass = 0;
  let condTotal = 0;
  for (let c = 0; c < NC; c++) {
    const lat = DIR[c * 3 + 1];
    const localV = vapourF[c];
    const sat = satV[c];
    const rh = localV / Math.max(1e-6, sat);
    const maritime = W._maritime?.[c] ?? Math.exp(-(W.cont[c] || 0) / 900);
    const conv = W.converg?.[c] || 0;
    const upslope = upF[c] || 0;
    const lee = leeF[c] || 0;
    const wu = W.windU?.[c] || 0;
    const wv = W.windV?.[c] || 0;
    const spd = windSpeedAt(W, c);

    // How hard this column is being lifted, from every source that lifts it.
    let lift = Math.max(0, conv) * 1.7
      + Math.min(0.55, upslope * 0.9)
      + (W.front?.[c] || 0) * 0.18;
    const poleward = wv * lat;
    const river = localV > sat * 0.7 && poleward > 0.05 && spd > 0.22
      ? clamp((spd - 0.22) * 3.4 * rh, 0, 1) : 0;
    W.ariver[c] = river;
    lift += river * 0.5;
    if (W._monsoon > 0.45 && h[c] >= seaLevel && temp[c] > 0.40) {
      const summer = Math.sin(W.season || 0) * lat;
      if (summer > 0.08) lift += W._monsoon * 0.5 * maritime * summer;
    }
    // Descending air on the dry side of a range gets nothing.
    lift /= 1 + lee * 2.2;

    let cond = 0;
    if (localV > sat) cond += (localV - sat) * 0.55;
    cond += localV * Math.min(0.75, lift) * Math.max(0, rh - 0.5) * 0.55;
    cond += localV * Math.max(0, rh - 0.82) * 0.06;
    const enso = W._ensoIndex || 0;
    if (Math.abs(enso) > 0.15 && h[c] < seaLevel && temp[c] > 0.48) {
      const east = ensoEastness(W, c);
      if (enso > 0) cond *= east > 0.15 ? 1.22 : east < -0.15 ? 0.78 : 1;
      else cond *= east < -0.15 ? 1.12 : east > 0.15 ? 0.88 : 1;
    }
    if (!canLiquid) {
      if (mode === 'frost') {
        const mat = cycleMaterial(W);
        if (mat) {
          const ph = phaseAt(mat, cellTK(W, c), surfacePbar(rule));
          cond *= ph === 'solid' || ph === 'liquid' ? 0.45 : 0.04;
        } else cond = 0;
      } else {
        cond = 0;
      }
    }
    cond = Math.min(cond, localV);
    vapourF[c] = localV - cond;
    precip[c] = clamp(cond * RAIN_GAIN, 0, 1);
    condTotal += cond * AREA[c];
    precipTotal += precip[c] * AREA[c];
    vapourMass += vapourF[c] * AREA[c];

    const coast = Math.abs(W.coastDist?.[c] || 99) < 180;
    const still = spd < 0.18;
    W.fog[c] = (rh > 0.86 && temp[c] < 0.46 && still && (coast || h[c] >= seaLevel) && conv <= 0.05)
      ? clamp((rh - 0.86) * 5.5 * (0.55 + (coast ? 0.45 : 0)), 0, 1) : 0;
  }
  W.condTotal = condTotal;
  W.precipMean = precipTotal / (4 * Math.PI);

  /* `gases.H2O` is the diagnosed atmospheric total — what the greenhouse reads —
     and no longer doubles as the saturation reference, which is why relative
     humidity means something now. */
  let vapour = vapourMass / (4 * Math.PI);
  if (rule.earthLike && !rule.deepTime) vapour = Math.min(0.03, vapour);
  gases.H2O = vapour;

  // Land moisture from rain; seas stay saturated.
  const dryLoss = DRY_PER_ARIDITY * clamp(rule.aridity ?? 0.05, 0.01, 1.5);
  for (let c = 0; c < NC; c++) {
    if (h[c] < seaLevel) {
      _m[c] = canLiquid ? 1 : 0.05;
    } else {
      const dM = neighbourMean(moist, c);
      _m[c] = clamp(
        moist[c] * 0.975 + precip[c] * SOIL_PER_RAIN + (dM - moist[c]) * 0.2 - dryLoss,
        0, 1
      );
      const lee = leeF[c] || 0;
      if (lee > 0.02) _m[c] *= 1 / (1 + lee * 1.5);
    }
  }
  moist.set(_m);

  computeRivers(W);
  iceTick(W);
  const seaBefore = W.seaLevel;
  updateSeaLevel(W);
  if (Math.abs(W.seaLevel - seaBefore) > 0.002) {
    updateCoastDistance(W);
    updateIsoline(W);
  }

  if (((W._tickIndex || 0) & 7) === 0 || W._waterMass0 == null) {
    // Shared inventory with assertBudgets (C81).
    const mass = waterInventory(W);
    if (W._waterMass0 == null) W._waterMass0 = mass;
    const drift = mass - W._waterMass0;
    /* Pull the budget back through the vapour field, gently, never gases.H2O. */
    const rel = drift / (W._waterMass0 + 1e-6);
    if (Math.abs(rel) > 0.004 && W.vapour) {
      const k = clamp(-rel * 0.05, -0.02, 0.02);
      const vap = W.vapour;
      for (let c = 0; c < NC; c++) vap[c] = Math.max(0, vap[c] * (1 + k));
    }
    W.waterMass = mass;
    W.waterDrift = Math.abs(rel);
  }
}

/** Tsunami wavefront from a quake/impact energy spike. */
export function startTsunami(W, cell, power) {
  W.tsunamis = W.tsunamis || [];
  W.tsunamis.push({ origin: cell, r: 0, power, maxR: 8 + power * 12 });
}

/** Cells the sea can reach — cached, because a tsunami only ever touches these. */
function shoreList(W) {
  const sea = W.seaLevel;
  if (W._shoreCells && Math.abs((W._shoreSea ?? 9) - sea) < 0.002) return W._shoreCells;
  const list = [];
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < sea + 0.05 && W.h[c] > sea - 0.15) list.push(c);
  }
  W._shoreCells = list;
  W._shoreSea = sea;
  return list;
}

/**
 * Advance every wavefront.
 *
 * This used to sweep all 24 576 cells per wave per tick and take an `acos` of a
 * dot product in each one, to find the handful of coastal cells the ring was
 * crossing — some three million transcendental calls for a single tsunami's
 * fifty-tick life. Comparing cosines instead of angles removes the `acos`
 * entirely (cos is monotonic over [0, π], so a band in angle is a band in
 * cosine), and only shore cells can be inundated, so only shore cells are
 * examined. Same wave, roughly a hundredth of the work.
 */
export function tsunamiTick(W) {
  if (!W.tsunamis || !W.tsunamis.length) return;
  const next = [];
  const shore = shoreList(W);
  const sea = W.seaLevel;
  for (const t of W.tsunamis) {
    t.r += 1.2;
    const ring = t.r * 0.04;
    if (ring < Math.PI) {
      const cosLo = Math.cos(Math.min(Math.PI, ring + 0.03));
      const cosHi = Math.cos(Math.max(0, ring - 0.03));
      const ox = DIR[t.origin * 3], oy = DIR[t.origin * 3 + 1], oz = DIR[t.origin * 3 + 2];
      for (let i = 0; i < shore.length; i++) {
        const c = shore[i];
        const dot = DIR[c * 3] * ox + DIR[c * 3 + 1] * oy + DIR[c * 3 + 2] * oz;
        if (dot < cosLo || dot > cosHi) continue;
        W.moist[c] = 1;
        if (W.h[c] >= sea) W.h[c] = Math.max(sea - 0.02, W.h[c] - t.power * 0.01);
      }
    }
    if (t.r < t.maxR) next.push(t);
  }
  W.tsunamis = next;
}
