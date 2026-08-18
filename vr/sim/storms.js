/** Named storms as tracked objects — seed, steer, surge.
 *  Toy cyclones: midlatitude commas + tropical eyes when SST/shear allow. */

import { NC, DIR, NBR } from '../sphere.js';
import { clamp, lerp } from '../math.js';
import { issueReceipt } from './god/receipt.js';
import { rngOf } from './rng.js';

const STORM_NAMES = [
  'Aria', 'Boreas', 'Coriolis', 'Dyne', 'Eddy', 'Front', 'Gale', 'Hadley',
  'Isobar', 'Jet', 'Kelvin', 'Leeward', 'Mistral', 'Nimbus', 'Occlude', 'Polar',
];

/** Ensure storm list + fields. */
export function initStorms(W) {
  if (!W.storms) W.storms = [];
  if (!W.stormField || W.stormField.length !== NC) {
    W.stormField = new Float32Array(NC);
    W.surgeField = new Float32Array(NC);
  }
  if (!W.stormTrail || W.stormTrail.length !== NC) {
    W.stormTrail = new Float32Array(NC);
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

/** Favourable tropical conditions (toy). */
export function tropicalFavor(W, c) {
  const lat = Math.abs(DIR[c * 3 + 1]);
  if (lat < 0.08 || lat > 0.45) return 0;
  if (W.h[c] >= W.seaLevel) return 0;
  const sst = W.temp[c] || 0;
  if (sst < 0.62) return 0; // ~26.5°C sketch
  const shear = Math.hypot(W.windU?.[c] || 0, W.windV?.[c] || 0);
  const moist = W.moist?.[c] || 0;
  return clamp((sst - 0.58) * 2.2 * (1.1 - shear * 0.5) * (0.4 + moist), 0, 1);
}

/** Midlatitude baroclinic favor. */
export function midlatFavor(W, c) {
  const lat = Math.abs(DIR[c * 3 + 1]);
  if (lat < 0.35 || lat > 0.82) return 0;
  const conv = Math.max(0, W.converg?.[c] || 0);
  const wind = Math.hypot(W.windU?.[c] || 0, W.windV?.[c] || 0);
  const moist = W.moist?.[c] || 0;
  return clamp(conv * 0.6 + wind * 0.35 + moist * 0.25, 0, 1);
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

  const storm = {
    id: `s-${W.ageYr | 0}-${best}`,
    name: nextName(W),
    kind,
    cell: best,
    lat: DIR[best * 3 + 1],
    lon: Math.atan2(DIR[best * 3 + 2], DIR[best * 3]),
    intensity: clamp((0.35 + favor * 0.45) * vigor, 0.3, 1),
    age: 0,
    track: [best],
    landfall: false,
    surgeHit: false,
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
  const rad = Math.round((s.kind === 'tropical' ? 5 : 7) * size);
  const seen = new Set([c0]);
  const q = [{ c: c0, d: 0 }];
  while (q.length) {
    const { c, d } = q.shift();
    const fall = Math.exp(-d * (0.38 / size)) * s.intensity * focus;
    W.stormField[c] = Math.max(W.stormField[c], fall);
    W.clouds[c] = Math.max(W.clouds[c], 0.35 + fall * 0.55);
    W.precip[c] = Math.max(W.precip[c] || 0, fall * 0.7);
    // Eye: clear centre for tropical
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

  // Spontaneous genesis only when chronicle is live (skip silent warm-up / goldens)
  if (log && genesis > 0 && (W.storms.length < 5) && (W.ageYr | 0) % 7 === 0) {
    const roll = rngOf(W, 'rngGod')();
    if (roll > 1 - genesis) {
      const c = (roll * NC * 17) | 0;
      const f = Math.max(tropicalFavor(W, c % NC), midlatFavor(W, c % NC));
      if (f > lerp(0.22, 0.5, ctl.strict ?? 0.7)) seedStorm(W, c % NC, { radius: 4, log });
    }
  }

  const alive = [];
  for (const s of W.storms) {
    s.age++;
    const lat = DIR[s.cell * 3 + 1];
    let u = (W.windU[s.cell] || 0) * 0.6 + (s.steerU || 0);
    let v = (W.windV[s.cell] || 0) * 0.5 + (s.steerV || 0);
    if (s.kind === 'tropical') {
      u += -0.15;
      v += -Math.sign(lat || 1) * 0.04;
      if (Math.abs(lat) > 0.35) u += 0.2;
    } else {
      u += 0.12;
    }
    s.steerU *= 0.85;
    s.steerV *= 0.85;

    let next = s.cell, best = -1e9;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[s.cell * 4 + k];
      const dx = DIR[nb * 3] - DIR[s.cell * 3];
      const dz = DIR[nb * 3 + 2] - DIR[s.cell * 3 + 2];
      const dy = DIR[nb * 3 + 1] - DIR[s.cell * 3 + 1];
      const score = dx * u + dz * u * 0.3 + dy * v;
      if (score > best) { best = score; next = nb; }
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
      s.intensity *= 0.82;
      if (!s.landfall) {
        s.landfall = true;
        if (log) log(W.year, 'storm', s.cell, s.intensity, `${s.name} landfall`);
      }
    } else {
      s.intensity = clamp(s.intensity * 0.97 + favor * 0.04 * vigor, 0.05, 1);
    }

    if (s.intensity > 0.45) applySurge(W, s, log);
    paintStorm(W, s);

    if (s.intensity > 0.12 && s.age < 80) alive.push(s);
    else if (log && s.intensity <= 0.12) {
      log(W.year, 'storm', s.cell, 0, `${s.name} dissipates`);
    }
  }
  W.storms = alive;
  W._stormCount = alive.length;
  W._stormMax = alive.reduce((m, s) => Math.max(m, s.intensity), 0);
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
    age: s.age,
    landfall: s.landfall,
    surgeHit: s.surgeHit,
    cell: s.cell,
    springRisk: W.tidePhase === 'springs' && s.intensity > 0.5,
  })).sort((a, b) => b.intensity - a.intensity);
  return {
    count: list.length,
    max: W._stormMax || list[0]?.intensity || 0,
    basin,
    list,
    tidePhase: W.tidePhase || '—',
    note: list.length
      ? `${list.length} on the track · ${list[0].name} strongest`
      : basin > 0.35
        ? 'No named storms — teal basins are still open'
        : 'Quiet — spin, warmth, or moisture is too low to organise',
  };
}
