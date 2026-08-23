/** Named storms as tracked objects — seed, steer, surge.
 *  Toy cyclones: midlatitude commas + tropical eyes when SST/shear allow. */

import { NC, DIR, NBR, NBR_E, NBR_N, NBR_ICHORD, AREA, cellSizeKm } from '../sphere.js';
import { clamp, lerp } from '../math.js';
import { issueReceipt } from './god/receipt.js';
import { rngOf } from './rng.js';

const STORM_NAMES = [
  'Aria', 'Boreas', 'Coriolis', 'Dyne', 'Eddy', 'Front', 'Gale', 'Hadley',
  'Isobar', 'Jet', 'Kelvin', 'Leeward', 'Mistral', 'Nimbus', 'Occlude', 'Polar',
];

/* CYC6: ocean heat content proxy depth (m) for OHC computation */
const OHC_DEPTH_M = 100;
/* CYC7: cold wake SST depression per tick behind storm centre */
const COLD_WAKE_RATE = 0.012;
/* CYC7: cold wake recovery per tick */
const COLD_WAKE_DECAY = 0.92;

/**
 * CYC2: potential intensity from SST and outflow temperature.
 * PI = sqrt(Ck/Cd * (SST - T_outflow) * SST / T_outflow) * scale.
 * Returns normalised 0–1 intensity cap.
 */
export function potentialIntensity(W, c) {
  const sst = W.temp?.[c] || 0;
  if (sst < 0.55) return 0;
  const sstK = sst * 180 + 180;
  const tropKm = W.tropKm?.[c] || W.elKm?.[c] || 12;
  const outflowK = Math.max(180, sstK - tropKm * 6.5);
  const ck_cd = 0.9;
  const dT = Math.max(0, sstK - outflowK);
  const piRaw = Math.sqrt(ck_cd * dT * sstK / Math.max(200, outflowK));
  return clamp(piRaw / 22, 0, 1);
}

/** Ensure storm list + fields. */
/** Clear the storm state a new world must not inherit. Called from `generate`. */
export function resetStorms(W) {
  W.storms = [];
  W._stormNameIx = 0;
  W._stormMax = 0;
  W.stormFocusId = null;
  if (W.stormField?.length === NC) W.stormField.fill(0);
  if (W.surgeField?.length === NC) W.surgeField.fill(0);
  if (W.stormTrail?.length === NC) W.stormTrail.fill(0);
  if (W.sstWake?.length === NC) W.sstWake.fill(0);
  if (W.stormCone) W.stormCone.fill(0);
  W._basinStats = null;
}

export function initStorms(W) {
  if (!W.storms) W.storms = [];
  if (!W.stormField || W.stormField.length !== NC) {
    W.stormField = new Float32Array(NC);
    W.surgeField = new Float32Array(NC);
  }
  if (!W.stormTrail || W.stormTrail.length !== NC) {
    W.stormTrail = new Float32Array(NC);
  }
  if (!W.sstWake || W.sstWake.length !== NC) {
    W.sstWake = new Float32Array(NC);
  }
  if (!W.stormCone || W.stormCone.length !== NC) {
    W.stormCone = new Float32Array(NC);
  }
  W._stormNameIx = W._stormNameIx || 0;
  if (!W.stormCtl) {
    W.stormCtl = { genesis: 0.08, strict: 0.7, size: 1, vigor: 1 };
  }
}

export function stormControl(W) {
  initStorms(W);
  return W.stormCtl;
}

export function setStormControl(W, patch) {
  Object.assign(stormControl(W), patch);
}

function nextName(W) {
  const n = STORM_NAMES[W._stormNameIx % STORM_NAMES.length];
  W._stormNameIx = (W._stormNameIx || 0) + 1;
  return n;
}

/**
 * Favourable tropical conditions: warm sea, some Coriolis, little shear.
 *
 * "Shear" here was the surface wind speed, which is a different quantity — and
 * often the opposite one, since a hurricane's own inflow is a strong surface
 * wind. What tears the chimney off a warm-core storm is *vertical* shear, which
 * the model now carries as `W.shear` from thermal wind, and which is genuinely
 * small in the deep tropics and large under the jet. That single substitution is
 * why tropical cyclones now form in the trade-wind belt and die when they reach
 * the westerlies, instead of forming wherever the sea was warmest.
 */
export function tropicalFavor(W, c) {
  const lat = Math.abs(DIR[c * 3 + 1]);
  if (lat < 0.08) return 0;
  if (W.h[c] >= W.seaLevel) return 0;
  const sst = W.temp[c] || 0;
  if (sst < 0.62) return 0;
  const shear = W.shear?.[c] ?? 0;
  const moist = W.moist?.[c] || 0;
  let f = (sst - 0.58) * 2.2 * Math.max(0, 1.1 - shear * 1.8) * (0.4 + moist);
  const cape = W.cape?.[c] || 0;
  const pwat = W.pwat?.[c] || 0;
  if (cape > 200) f += clamp(cape / 4000, 0, 0.15);
  if (pwat > 25) f += clamp(pwat / 400, 0, 0.1);
  return clamp(f, 0, 1);
}

/**
 * Midlatitude baroclinic favour: shear across a temperature gradient.
 *
 * This is the Eady picture, and it is the one ingredient the model could not
 * express with a single layer — a midlatitude cyclone grows by tapping the
 * available potential energy of a horizontal temperature contrast, at a rate
 * proportional to the vertical shear across it. Convergence and moisture were
 * standing in for that; they are consequences of a depression, not causes, which
 * is why storm tracks did not sit where fronts were.
 */
export function midlatFavor(W, c) {
  const lat = Math.abs(DIR[c * 3 + 1]);
  if (lat < 0.12) return 0;
  if ((W.temp[c] || 0) > 0.62) return 0;
  const conv = Math.max(0, W.converg?.[c] || 0);
  const shear = W.shear?.[c] ?? 0;
  const front = W.front?.[c] || 0;
  const moist = W.moist?.[c] || 0;
  return clamp(shear * front * 2.4 + shear * 0.5 + conv * 0.35 + moist * 0.15, 0, 1);
}

/**
 * Seed a storm at cell (or best nearby). Most seeds fail — honest.
 * Returns { ok, storm?, note }.
 */
export function seedStorm(W, cell, opts = {}) {
  initStorms(W);
  const log = opts.log || null;
  if (cell < 0 || cell >= NC) return { ok: false, note: 'No cell' };
  if ((W.storms?.length || 0) >= 8) return { ok: false, note: 'Track full (8 storms)' };

  let best = cell, bestScore = 0;
  const r = opts.radius || 12;
  for (let c = Math.max(0, cell - r * 20); c < Math.min(NC, cell + r * 20); c++) {
    const s = Math.max(tropicalFavor(W, c), midlatFavor(W, c) * 0.85);
    if (s > bestScore) { bestScore = s; best = c; }
  }

  const trop = tropicalFavor(W, best);
  const mid = midlatFavor(W, best);
  const kind = trop >= mid && trop > 0.25 ? 'tropical' : 'extratropical';
  const favor = Math.max(trop, mid);
  const ctl = stormControl(W);
  const strict = clamp(ctl.strict ?? 0.7, 0, 1);
  const vigor = clamp(ctl.vigor ?? 1, 0.4, 2);

  const roll = rngOf(W, 'rngGod')();
  const need = lerp(0.06, kind === 'tropical' ? 0.42 : 0.34, strict);
  const pass = favor >= need && roll < favor * lerp(1.15, 0.55, strict) + lerp(0.55, 0.12, strict);
  if (!pass) {
    issueReceipt({
      tool: 'weather',
      cell: best,
      intent: 'Seed storm',
      expected: `Failed — ${kind} favor ${favor.toFixed(2)} (need ~${need.toFixed(2)})`,
    });
    return {
      ok: false,
      note: `Disturbance died · favor ${favor.toFixed(2)} · most seeds fail`,
      favor,
    };
  }

  /* CYC2: cap initial intensity at PI */
  const pi = kind === 'tropical' ? potentialIntensity(W, best) : 1;
  const rawIntensity = clamp((0.35 + favor * 0.45) * vigor, 0.3, 1);
  const storm = {
    id: `s-${W.ageYr | 0}-${best}`,
    name: nextName(W),
    kind,
    cell: best,
    lat: DIR[best * 3 + 1],
    lon: Math.atan2(-DIR[best * 3 + 2], DIR[best * 3]),
    intensity: Math.min(rawIntensity, pi > 0 ? pi : rawIntensity),
    pi,
    age: 0,
    track: [best],
    landfall: false,
    surgeHit: false,
    /* CYC8: radius of maximum wind (cells) and outer radius */
    rmw: kind === 'tropical' ? 2 + Math.round(favor * 2) : 4,
    outerRadius: kind === 'tropical' ? 5 + Math.round(favor * 3) : 7,
    /* CYC power dissipation tracking */
    pdi: 0,
    rainAccum: 0,
  };
  W.storms.push(storm);
  paintStorm(W, storm);
  issueReceipt({
    tool: 'weather',
    cell: best,
    intent: `Seed ${storm.name}`,
    expected: `${kind} · intensity ${storm.intensity.toFixed(2)}`,
  });
  if (log) log(W.year, 'storm', best, storm.intensity, `${storm.name} forms (${kind})`);
  return { ok: true, storm, note: `${storm.name} · ${kind}` };
}

/** Nudge steering flow near storm (steer tool). */
export function steerStorm(W, stormId, du = 0, dv = 0) {
  const s = W.storms?.find((x) => x.id === stormId || x.name === stormId);
  if (!s) return { ok: false, note: 'No storm' };
  s.steerU = (s.steerU || 0) + du;
  s.steerV = (s.steerV || 0) + dv;
  return { ok: true, storm: s };
}

function paintStorm(W, s) {
  const c0 = s.cell;
  const ctl = stormControl(W);
  const size = clamp(ctl.size ?? 1, 0.5, 2.2);
  const focus = s.id === W.stormFocusId ? 1.4 : 1;
  const rmw = s.rmw || (s.kind === 'tropical' ? 3 : 4);
  const outer = s.outerRadius || (s.kind === 'tropical' ? 5 : 7);
  const rad = Math.round(outer * size);
  const seen = new Set([c0]);
  const q = [{ c: c0, d: 0 }];
  while (q.length) {
    const { c, d } = q.shift();
    /* CYC9: wind profile peaks at RMW, not the centre.
       Holland-like: V(r) = Vmax * (rmw/r)^0.5 * exp((1 - (rmw/r)^0.5) / b)
       Simplified to a smooth shape peaking at rmw. */
    let fall;
    if (s.kind === 'tropical' && d > 0 && d <= rmw) {
      fall = s.intensity * (d / rmw) * focus;
    } else if (d > rmw) {
      fall = Math.exp(-(d - rmw) * (0.38 / size)) * s.intensity * focus;
    } else {
      fall = s.intensity * focus * (s.kind === 'tropical' ? 0.28 : 1);
    }
    W.stormField[c] = Math.max(W.stormField[c], fall);
    W.clouds[c] = Math.max(W.clouds[c], 0.35 + fall * 0.55);
    W.precip[c] = Math.max(W.precip[c] || 0, fall * 0.7);
    if (s.kind === 'tropical' && d === 0) {
      W.clouds[c] = Math.min(W.clouds[c], 0.25);
      W.stormField[c] = s.intensity * 0.28 * focus;
    }
    if (d >= rad) continue;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      if (!seen.has(nb)) {
        seen.add(nb);
        q.push({ c: nb, d: d + 1 });
      }
    }
  }
}

/** Advance storms, compute surge, decay. */
export function stormsTick(W, log = null) {
  initStorms(W);
  W.stormField.fill(0);
  W.surgeField.fill(0);
  W.stormTrail.fill(0);

  const ctl = stormControl(W);
  const genesis = clamp(ctl.genesis ?? 0.08, 0, 1);
  const vigor = clamp(ctl.vigor ?? 1, 0.4, 2);

  /* Genesis. Three things kept this at zero, and the storm system — named
     cyclones, tracks, landfall, surge, the storm overlay, the storm desk — had
     therefore never once run in the shipped app:
       · `log &&` meant storms could not form on a silent tick, so every headless
         run, probe and test measured a planet with no weather. The intent was to
         skip generate's warm-up; that is `W._spinup`.
       · `(W.ageYr | 0) % 7` is the wrapped-year cadence bug. `ageYr` reaches
         4.567e9, past int32, and on the pinned Earth it is a constant whose
         residue is 6 — so the gate was permanently false there.
       · One candidate cell was drawn per attempt from the whole planet, while
         only ~3.5% of cells clear the favourability threshold. Combined with the
         other two that is one storm per ~2 500 ticks.
     Now: attempt every tick, and sample a handful of candidates and take the
     most favourable, which is what a genesis model should do anyway — a basin is
     a place, not a lottery ticket. At the default `genesis` of 0.08 and ~3.5% of
     cells favourable, best-of-twelve gives roughly one storm per 36 ticks against
     a lifetime of similar order, so there is usually weather somewhere.
     Storms are the model's main precipitation source (`paintStorm` writes up to
     0.7 into `precip`), so with none forming the planet had a global maximum
     precipitation of 0.003 and the Miami NPP term saw a desert everywhere. */
  if (!W._spinup && genesis > 0 && W.storms.length < 5) {
    const rng = rngOf(W, 'rngGod');
    if (rng() < genesis) {
      const need = lerp(0.22, 0.5, ctl.strict ?? 0.7);
      let bestC = -1, bestF = 0;
      for (let i = 0; i < 12; i++) {
        const c = (rng() * NC) | 0;
        const f = Math.max(tropicalFavor(W, c), midlatFavor(W, c));
        if (f > bestF) { bestF = f; bestC = c; }
      }
      if (bestC >= 0 && bestF > need) seedStorm(W, bestC, { radius: 4, log });
    }
  }

  /* CYC7: cold wake decay */
  if (W.sstWake) {
    for (let c = 0; c < NC; c++) {
      if (W.sstWake[c] > 0.001) W.sstWake[c] *= COLD_WAKE_DECAY;
      else W.sstWake[c] = 0;
    }
  }

  /* CYC forecast cone: clear each tick then repaint */
  if (W.stormCone) W.stormCone.fill(0);

  const alive = [];
  let totalPdi = 0;
  for (const s of W.storms) {
    s.age++;
    const lat = DIR[s.cell * 3 + 1];
    const absLat = Math.abs(lat);

    /* CYC2: refresh PI each tick */
    if (s.kind === 'tropical') {
      s.pi = potentialIntensity(W, s.cell);
    }

    /* CYC17–19: recurvature via beta drift + deep-layer mean wind steering.
       Beta drift pushes poleward and slightly westward. */
    const ju = W.jetU?.[s.cell] ?? W.windU[s.cell] ?? 0;
    const jv = W.jetV?.[s.cell] ?? W.windV[s.cell] ?? 0;
    let u = ju * 0.45 + (W.windU[s.cell] || 0) * 0.25 + (s.steerU || 0);
    let v = jv * 0.4 + (W.windV[s.cell] || 0) * 0.2 + (s.steerV || 0);
    if (s.kind === 'tropical') {
      u += -0.15;
      /* CYC17: beta drift — poleward component */
      const betaDrift = -Math.sign(lat || 1) * 0.06;
      v += betaDrift;
      /* CYC18: recurvature — at higher latitudes the westerlies take over */
      if (absLat > 0.25) {
        const recurveFactor = clamp((absLat - 0.25) / 0.3, 0, 1);
        u += 0.25 * recurveFactor;
      }
    } else {
      u += 0.12;
    }
    s.steerU *= 0.85;
    s.steerV *= 0.85;

    let next = s.cell, best = -1e9;
    const i0 = s.cell * 4;
    for (let k = 0; k < 4; k++) {
      const i = i0 + k;
      const score = (u * NBR_E[i] + v * NBR_N[i]) * NBR_ICHORD[i];
      if (score > best) { best = score; next = NBR[i]; }
    }
    if (best > 0.01 || s.age % 2 === 0) s.cell = next;
    s.lat = DIR[s.cell * 3 + 1];
    s.track.push(s.cell);
    if (s.track.length > 48) s.track.shift();

    const nTrack = s.track.length;
    const focus = s.id === W.stormFocusId ? 1.25 : 1;
    for (let i = 0; i < nTrack; i++) {
      const c = s.track[i];
      W.stormTrail[c] = Math.max(W.stormTrail[c], ((i + 1) / nTrack) * s.intensity * 0.9 * focus);
    }

    const favor = s.kind === 'tropical' ? tropicalFavor(W, s.cell) : midlatFavor(W, s.cell);
    const onLand = W.h[s.cell] >= W.seaLevel;
    if (onLand) {
      /* CYC14–15: landfall decay modulated by terrain moisture.
         Wet terrain sustains the storm longer. */
      const terrainMoist = W.moist?.[s.cell] || 0;
      const decayRate = lerp(0.78, 0.88, clamp(terrainMoist, 0, 1));
      s.intensity *= decayRate;
      if (!s.landfall) {
        s.landfall = true;
        if (log) log(W.year, 'storm', s.cell, s.intensity, `${s.name} landfall`);
      }
      /* CYC21+: inland flood from accumulated rain */
      if (s.intensity > 0.3) {
        s.rainAccum = (s.rainAccum || 0) + s.intensity * 0.05;
        if (W.moist) W.moist[s.cell] = Math.min(1, (W.moist[s.cell] || 0) + s.intensity * 0.08);
      }
    } else {
      /* CYC6: ocean heat content proxy — warm deep water sustains storm */
      const sst = W.temp?.[s.cell] || 0;
      const ohc = sst * OHC_DEPTH_M / 100;
      const ohcBonus = s.kind === 'tropical' ? clamp((ohc - 0.5) * 0.04, 0, 0.03) : 0;

      /* CYC7: cold wake — previous storms cool the ocean */
      const wakeEffect = W.sstWake?.[s.cell] || 0;

      s.intensity = clamp(
        s.intensity * 0.97 + favor * 0.04 * vigor + ohcBonus - wakeEffect * 0.08,
        0.05, 1,
      );

      if (s.kind === 'tropical') {
        const shear = W.shear?.[s.cell] ?? 0;
        const pwat = W.pwat?.[s.cell] || 0;

        /* CYC5: kill intensity when pwat is low in mid-levels */
        if (pwat < 20) {
          s.intensity *= 0.92;
        }

        /* CYC11: rapid intensification — rate-limited and shear-gated */
        const prevIntensity = s._prevIntensity || s.intensity;
        const riRate = s.intensity - prevIntensity;
        if (shear < 0.15 && pwat > 35 && sst > 0.7) {
          const riGain = clamp(0.06 * vigor, 0, 0.08);
          s.intensity = clamp(s.intensity + riGain, 0, 1);
        }
        if (shear > 0.45) {
          s.intensity *= 0.9;
        }
        /* CYC11: cap RI rate */
        if (s.intensity - prevIntensity > 0.1) {
          s.intensity = prevIntensity + 0.1;
        }
        s._prevIntensity = s.intensity;

        /* CYC2: clamp intensity to PI */
        if (s.pi > 0) {
          s.intensity = Math.min(s.intensity, s.pi);
        }

        /* CYC7: deposit cold wake */
        if (W.sstWake && s.intensity > 0.3) {
          W.sstWake[s.cell] = clamp(
            (W.sstWake[s.cell] || 0) + s.intensity * COLD_WAKE_RATE,
            0, 0.15,
          );
        }

        /* CYC13: extratropical transition when latitude is high */
        if (absLat > 0.45 && s.kind === 'tropical') {
          s.kind = 'extratropical';
          s.intensity *= 0.85;
          if (log) log(W.year, 'storm', s.cell, s.intensity, `${s.name} ET transition`);
        }
      }
    }

    /* CYC power dissipation index */
    s.pdi = (s.pdi || 0) + Math.pow(s.intensity, 3);
    totalPdi += s.pdi;

    if (s.intensity > 0.45) applySurge(W, s, log);
    paintStorm(W, s);

    /* CYC forecast cone stub */
    if (W.stormCone) {
      stormForecastCone(W, s);
    }

    if (s.intensity > 0.12 && s.age < 80) alive.push(s);
    else if (log && s.intensity <= 0.12) {
      log(W.year, 'storm', s.cell, 0, `${s.name} dissipates`);
    }
  }
  W.storms = alive;
  W._stormCount = alive.length;
  W._stormMax = alive.reduce((m, s) => Math.max(m, s.intensity), 0);
  W._totalPdi = totalPdi;

  /* CYC basin stats (refreshed each tick) */
  W._basinStats = computeBasinStats(W);
}

function applySurge(W, s, log = null) {
  const c0 = s.cell;
  const spring = W.tidePhase === 'springs' ? 1.35 : W.tidePhase === 'neaps' ? 0.75 : 1;
  const q = [{ c: c0, d: 0 }];
  const seen = new Set([c0]);
  while (q.length) {
    const { c, d } = q.shift();
    if (d > 6) continue;
    const coastal = Math.abs(W.h[c] - (W._seaBase ?? W.seaLevel)) < 0.06;
    if (coastal || W.h[c] < W.seaLevel) {
      const surge = s.intensity * Math.exp(-d * 0.4) * spring * 0.04;
      W.surgeField[c] = Math.max(W.surgeField[c], surge);
      if (surge > 0.015 && W.h[c] >= (W._seaBase ?? W.seaLevel) - 0.02) {
        W.intertidal[c] = Math.min(1, (W.intertidal[c] || 0) + surge * 8);
        W.moist[c] = Math.min(1, (W.moist[c] || 0) + surge * 4);
        if (W.build?.[c] > 0.2 && surge * spring > 0.02) {
          W.build[c] *= 0.992;
          s.surgeHit = true;
        }
      }
    }
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      if (!seen.has(nb)) { seen.add(nb); q.push({ c: nb, d: d + 1 }); }
    }
  }
  if (s.surgeHit && W.tidePhase === 'springs' && !s._surgeLogged) {
    s._surgeLogged = true;
    if (log) log(W.year, 'storm', s.cell, s.intensity, `${s.name} surge at springs`);
  }
}

/**
 * CYC forecast cone: paint uncertainty cells ahead of the storm's current
 * steering vector. Fills W.stormCone with values 0–1.
 */
export function stormForecastCone(W, storm) {
  if (!W.stormCone) return;
  const c0 = storm.cell;
  const ju = W.jetU?.[c0] ?? W.windU?.[c0] ?? 0;
  const jv = W.jetV?.[c0] ?? W.windV?.[c0] ?? 0;
  let u = ju * 0.4 + (W.windU?.[c0] || 0) * 0.2;
  let v = jv * 0.35 + (W.windV?.[c0] || 0) * 0.15;
  if (storm.kind === 'tropical') { u -= 0.12; }

  let cur = c0;
  for (let step = 0; step < 8; step++) {
    const spread = 1 + step;
    const seen = new Set([cur]);
    let ring = [cur];
    for (let d = 0; d < spread; d++) {
      const next = [];
      for (const c of ring) {
        W.stormCone[c] = Math.max(W.stormCone[c], clamp(1 - step * 0.12 - d * 0.15, 0.1, 1));
        for (let k = 0; k < 4; k++) {
          const nb = NBR[c * 4 + k];
          if (!seen.has(nb)) { seen.add(nb); next.push(nb); }
        }
      }
      ring = next;
    }
    let bestNb = cur, bestScore = -1e9;
    for (let k = 0; k < 4; k++) {
      const i = cur * 4 + k;
      const score = (u * NBR_E[i] + v * NBR_N[i]) * NBR_ICHORD[i];
      if (score > bestScore) { bestScore = score; bestNb = NBR[i]; }
    }
    cur = bestNb;
  }
}

/** CYC basin stats: count storms by type, max intensity, total PDI. */
function computeBasinStats(W) {
  const storms = W.storms || [];
  let tropical = 0, extratropical = 0, maxIntensity = 0;
  for (const s of storms) {
    if (s.kind === 'tropical') tropical++;
    else extratropical++;
    if (s.intensity > maxIntensity) maxIntensity = s.intensity;
  }
  return {
    total: storms.length,
    tropical,
    extratropical,
    maxIntensity,
    totalPdi: W._totalPdi || 0,
  };
}

/** Panel / HUD snapshot. */
export function stormDeskSnapshot(W) {
  initStorms(W);
  let basin = 0;
  for (let c = 0; c < NC; c += 9) {
    basin = Math.max(basin, tropicalFavor(W, c), midlatFavor(W, c));
  }
  const list = (W.storms || []).map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    intensity: s.intensity,
    pi: s.pi || 0,
    age: s.age,
    landfall: s.landfall,
    surgeHit: s.surgeHit,
    cell: s.cell,
    rmw: s.rmw || 0,
    outerRadius: s.outerRadius || 0,
    pdi: s.pdi || 0,
    springRisk: W.tidePhase === 'springs' && s.intensity > 0.5,
  })).sort((a, b) => b.intensity - a.intensity);
  const stats = W._basinStats || computeBasinStats(W);
  return {
    count: list.length,
    max: W._stormMax || list[0]?.intensity || 0,
    basin,
    list,
    tidePhase: W.tidePhase || '—',
    basinStats: stats,
    note: list.length
      ? `${list.length} on the track · ${list[0].name} strongest`
      : basin > 0.35
        ? 'No named storms — teal basins are still open'
        : 'Quiet — spin, warmth, or moisture is too low to organise',
  };
}
