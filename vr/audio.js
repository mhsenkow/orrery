/** Ambient biome bed + positional event cues + planetary hum.
 *  Next backlog sound items — weight per act, planet soundscape, silence. */

import { W } from './world.js';

let ctx = null;
let master = null;
let humOsc = null;
let humGain = null;
let bedGain = null;
let bedFilter = null;
let windGain = null;
let oceanGain = null;
let impactPanner = null;
let started = false;
let lastKind = '';
let lastEraKey = '';

export function audioInit() {
  if (started) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);

    // Spatial bus for impacts — planet sits ahead of the listener
    impactPanner = ctx.createPanner();
    impactPanner.panningModel = 'HRTF';
    impactPanner.distanceModel = 'inverse';
    impactPanner.refDistance = 0.8;
    impactPanner.maxDistance = 12;
    impactPanner.rolloffFactor = 1.1;
    if (impactPanner.positionX) {
      impactPanner.positionX.value = 0;
      impactPanner.positionY.value = 0.1;
      impactPanner.positionZ.value = -0.55;
    } else {
      impactPanner.setPosition?.(0, 0.1, -0.55);
    }
    impactPanner.connect(master);

    humOsc = ctx.createOscillator();
    humGain = ctx.createGain();
    humOsc.type = 'sine';
    humOsc.frequency.value = 55;
    humGain.gain.value = 0.04;
    humOsc.connect(humGain);
    humGain.connect(master);
    humOsc.start();

    bedGain = ctx.createGain();
    bedGain.gain.value = 0.0;
    bedGain.connect(master);

    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windGain.connect(master);

    oceanGain = ctx.createGain();
    oceanGain.gain.value = 0;
    oceanGain.connect(master);

    // Soft noise bed (deterministic)
    const bufSize = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let ns = 0xA11D0; const nr = () => { ns = (ns + 0x6d2b79f5) | 0; let t = Math.imul(ns ^ (ns >>> 15), 1 | ns); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < bufSize; i++) data[i] = (nr() * 2 - 1) * 0.15;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    bedFilter = ctx.createBiquadFilter();
    bedFilter.type = 'lowpass';
    bedFilter.frequency.value = 800;
    noise.connect(bedFilter);
    bedFilter.connect(bedGain);

    // Wind / ocean branches from same noise
    const windF = ctx.createBiquadFilter();
    windF.type = 'bandpass';
    windF.frequency.value = 1200;
    windF.Q.value = 0.7;
    noise.connect(windF);
    windF.connect(windGain);

    const oceanF = ctx.createBiquadFilter();
    oceanF.type = 'lowpass';
    oceanF.frequency.value = 280;
    noise.connect(oceanF);
    oceanF.connect(oceanGain);

    noise.start();
    started = true;
  } catch (e) {
    console.warn('[orrery] audio unavailable', e);
  }
}

/** Slowly shift the bed filter by geologic age / ICS era. */
export function playEraDrone(ageYr) {
  if (!started || !ctx || !bedFilter) return;
  const age = ageYr ?? W.ageYr ?? W.year ?? 0;
  const ics = W.ics;
  const eraKey = ics ? `${ics.eon}|${ics.era}|${ics.period}` : '';
  // Age fraction 0 → formation, 1 → present
  const t = Math.max(0, Math.min(1, age / 4.567e9));
  // Archean darker; Phanerozoic brighter; ICS period nudges within band
  let freq = 320 + t * 1400;
  if (ics?.eon === 'Archean') freq *= 0.85;
  else if (ics?.eon === 'Proterozoic') freq *= 0.95;
  else if (ics?.eon === 'Phanerozoic') freq *= 1.08;
  if (eraKey && eraKey !== lastEraKey) {
    lastEraKey = eraKey;
    bedFilter.frequency.setTargetAtTime(freq, ctx.currentTime, 3.5);
  } else {
    bedFilter.frequency.setTargetAtTime(freq, ctx.currentTime, 8);
  }
}

export function audioUpdate() {
  if (!started || !ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const airless = !!W.rule?.airless;
  const snowball = W.state === 'snowball' || (W.iceFrac || 0) > 0.7;
  const silence = airless ? 0.02 : snowball ? 0.35 : 1;

  const h = W.health ?? 0.5;
  humOsc.frequency.setTargetAtTime(40 + h * 40 + W.meanTemp * 20, ctx.currentTime, 0.5);
  humGain.gain.setTargetAtTime((0.02 + h * 0.06) * silence, ctx.currentTime, 0.5);

  const bed = (0.02 + W.meanLife * 0.1 + (W.gases?.dust || 0) * 0.05) * silence;
  bedGain.gain.setTargetAtTime(bed, ctx.currentTime, 0.8);

  const wind = Math.min(0.12, 0.02 + (W.meanWind || W.gases?.dust || 0) * 0.15) * silence;
  windGain.gain.setTargetAtTime(wind, ctx.currentTime, 0.6);

  const ocean = Math.min(0.1, (1 - (W.landFrac || 0.3)) * 0.08 * (1 - (W.iceFrac || 0) * 0.7)) * silence;
  oceanGain.gain.setTargetAtTime(ocean, ctx.currentTime, 0.8);

  playEraDrone(W.ageYr ?? W.year);
}

function destFor(kind) {
  if ((kind === 'impact' || kind === 'buster') && impactPanner) return impactPanner;
  return master;
}

function tone(type, freq, dur, gain, ramp = 'exp', out = master) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(out || master);
  const t0 = ctx.currentTime;
  g.gain.value = Math.max(0.001, gain);
  if (ramp === 'exp') g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  else { g.gain.linearRampToValueAtTime(gain, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur); }
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  return { o, g, t0 };
}

export function playEvent(kind, strength = 0.5) {
  if (!started || !ctx) return;
  lastKind = kind;
  const t0 = ctx.currentTime;
  const s = Math.max(0.15, Math.min(1.5, strength));
  const bus = destFor(kind);

  if (kind === 'impact' || kind === 'buster') {
    // Mass: low saw + sub thump — spatialized at planet
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.value = 42;
    sub.connect(sg); sg.connect(bus);
    sg.gain.value = 0.35 * s;
    sg.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6);
    sub.start(t0); sub.stop(t0 + 1.7);
    tone('sawtooth', 80, 1.2, 0.22 * s, 'exp', bus);
  } else if (kind === 'eruption' || kind === 'quake') {
    tone('triangle', 55 + s * 40, 0.7, 0.18 * s);
    tone('sawtooth', 90, 0.4, 0.08 * s);
  } else if (kind === 'sculpt' || kind === 'raise' || kind === 'lower') {
    tone('triangle', 110 + s * 30, 0.35, 0.07 * s);
  } else if (kind === 'seed' || kind === 'life' || kind === 'first') {
    const freqs = [392, 494, 587];
    freqs.forEach((f, i) => {
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'sine';
      o2.frequency.value = f * (0.98 + s * 0.04);
      o2.connect(g2);
      g2.connect(master);
      const t = t0 + i * 0.07;
      g2.gain.value = 0.001;
      g2.gain.linearRampToValueAtTime(0.07 * s, t + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      o2.start(t);
      o2.stop(t + 1.15);
    });
  } else if (kind === 'quiet' || kind === 'refuge' || kind === 'observe') {
    tone('sine', 523, 0.9, 0.035 * s, 'lin');
  } else if (kind === 'ceremony' || kind === 'commit') {
    tone('sine', 65, 1.4, 0.12 * s);
    tone('triangle', 196, 1.0, 0.05 * s);
  } else {
    tone('sine', 220, 0.25, 0.05 * s);
  }
}

export function audioLastKind() { return lastKind; }
