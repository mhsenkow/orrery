/** Ambient biome bed + positional event cues + planetary hum. */

import { W } from './world.js';

let ctx = null;
let master = null;
let humOsc = null;
let humGain = null;
let bedGain = null;
let started = false;

export function audioInit() {
  if (started) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);

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

    // Soft noise bed
    const bufSize = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    noise.connect(filter);
    filter.connect(bedGain);
    noise.start();

    started = true;
  } catch (e) {
    console.warn('[orrery] audio unavailable', e);
  }
}

export function audioUpdate() {
  if (!started || !ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  // Hum tracks planetary health
  const h = W.health ?? 0.5;
  humOsc.frequency.setTargetAtTime(40 + h * 40 + W.meanTemp * 20, ctx.currentTime, 0.5);
  humGain.gain.setTargetAtTime(0.02 + h * 0.06, ctx.currentTime, 0.5);
  // Bed louder with biosphere / weather
  const bed = 0.02 + W.meanLife * 0.1 + (W.gases?.dust || 0) * 0.05;
  bedGain.gain.setTargetAtTime(bed, ctx.currentTime, 0.8);
}

export function playEvent(kind, strength = 0.5) {
  if (!started || !ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(master);
  const t0 = ctx.currentTime;
  if (kind === 'impact' || kind === 'buster') {
    o.type = 'sawtooth';
    o.frequency.value = 80;
    o.frequency.exponentialRampToValueAtTime(30, t0 + 0.8);
    g.gain.value = 0.25 * strength;
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.2);
    o.start(t0); o.stop(t0 + 1.3);
  } else if (kind === 'eruption' || kind === 'quake') {
    o.type = 'triangle';
    o.frequency.value = 60 + strength * 40;
    g.gain.value = 0.15 * strength;
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
    o.start(t0); o.stop(t0 + 0.65);
  } else if (kind === 'seed') {
    o.type = 'sine';
    o.frequency.value = 440;
    o.frequency.exponentialRampToValueAtTime(880, t0 + 0.2);
    g.gain.value = 0.08;
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    o.start(t0); o.stop(t0 + 0.4);
  } else {
    o.type = 'sine';
    o.frequency.value = 220;
    g.gain.value = 0.05;
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    o.start(t0); o.stop(t0 + 0.25);
  }
}
