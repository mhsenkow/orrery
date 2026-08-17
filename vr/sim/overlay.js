/** Field overlay modes painted via gbuf emphasis. */

export const OVERLAYS = [
  { id: 'none', label: 'None' },
  { id: 'temp', label: 'Temperature' },
  { id: 'press', label: 'Pressure' },
  { id: 'wind', label: 'Wind' },
  { id: 'npp', label: 'NPP' },
  { id: 'guild', label: 'Guild' },
  { id: 'touch', label: 'Your touch' },
  { id: 'upwell', label: 'Upwelling' },
  { id: 'tide', label: 'Tide range' },
  { id: 'intertidal', label: 'Intertidal' },
  { id: 'storm', label: 'Storms' },
  { id: 'vent', label: 'Ice vents' },
  { id: 'lid', label: 'Ice lid' },
  { id: 'plates', label: 'Plates' },
  { id: 'bounds', label: 'Boundaries' },
  { id: 'crust', label: 'Crust' },
  { id: 'crustAge', label: 'Crust age' },
];

/** Deterministic plate tint from id. */
function plateRGB(pid) {
  const h = ((pid * 47) % 12) / 12;
  const s = 0.45 + (pid % 3) * 0.12;
  const l = 0.42 + (pid % 5) * 0.04;
  // HSL → RGB
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [(f(0) * 255) | 0, (f(8) * 255) | 0, (f(4) * 255) | 0];
}

/** Tint vDat RGB for overlay — call after refreshColours bake or instead. */
export function applyOverlay(W, vDat, vCell, NV, mode) {
  if (!mode || mode === 'none') return;
  for (let k = 0; k < NV; k++) {
    const c = vCell[k];
    const o = k * 4;
    let r = vDat[o], g = vDat[o + 1], b = vDat[o + 2];
    if (mode === 'temp') {
      const t = W.temp[c];
      r = t * 255; g = (1 - Math.abs(t - 0.5) * 2) * 180; b = (1 - t) * 255;
    } else if (mode === 'press') {
      const p = W.press?.[c] ?? (1 - W.temp[c]);
      r = 40 + p * 80; g = 60 + (1 - p) * 120; b = 100 + (1 - p) * 140;
    } else if (mode === 'wind') {
      const u = W.windU?.[c] || 0, v = W.windV?.[c] || 0;
      const spd = Math.min(1, Math.hypot(u, v));
      r = 30 + spd * 40 + Math.max(0, u) * 80;
      g = 50 + spd * 100;
      b = 80 + spd * 60 + Math.max(0, -u) * 90;
    } else if (mode === 'npp') {
      const n = W.npp?.[c] || 0;
      r = 20; g = n * 255; b = 40 + n * 80;
    } else if (mode === 'guild') {
      const mx = Math.max(r, g, b) || 1;
      r = (r / mx) * 220; g = (g / mx) * 220; b = (b / mx) * 220;
    } else if (mode === 'touch') {
      const hit = W.touchMap?.[c] || 0;
      r = r * (1 - hit) + 255 * hit;
      g = g * (1 - hit) + 180 * hit;
      b = b * (1 - hit) + 60 * hit;
    } else if (mode === 'upwell') {
      const u = W.upwell?.[c] || W.upwelling?.[c] || 0;
      if (W.h[c] < W.seaLevel) {
        r = 20 + u * 40; g = 60 + u * 120; b = 100 + u * 120;
      }
    } else if (mode === 'tide') {
      const t = Math.min(1, (W.tideRange?.[c] || 0) * 40);
      r = 20 + t * 40; g = 80 + t * 100; b = 160 + t * 80;
    } else if (mode === 'intertidal') {
      const it = W.intertidal?.[c] || 0;
      if (it > 0.05) {
        r = 180 + it * 60; g = 140 + it * 40; b = 70;
      }
    } else if (mode === 'storm') {
      const tracked = W.stormField?.[c] || 0;
      const surge = Math.min(1, (W.surgeField?.[c] || 0) * 25);
      const haze = Math.min(1, (W.clouds?.[c] || 0) * (W.precip?.[c] || 0) * 1.6
        + Math.max(0, W.converg?.[c] || 0) * 0.35);
      const s = Math.max(tracked, haze * 0.55);
      r = 35 + s * 50 + surge * 180;
      g = 45 + s * 70 + surge * 40;
      b = 70 + s * 150;
    } else if (mode === 'vent') {
      const v = W.shellVent?.[c] || 0;
      r = 40 + v * 200; g = 30 + v * 80; b = 20 + v * 40;
      if (v < 0.08) { r *= 0.35; g *= 0.4; b *= 0.5; }
    } else if (mode === 'lid') {
      const lid = W.shellLid?.[c] ?? W.ice?.[c] ?? 0;
      const ocean = W.shellOcean?.[c] || 0;
      r = 180 + lid * 60; g = 200 + lid * 40; b = 220 + ocean * 30;
      if ((W.shellVent?.[c] || 0) > 0.25) { r = 255; g = 120; b = 60; }
    } else if (mode === 'plates') {
      const pid = W.plateId?.[c] ?? 0;
      const [pr, pg, pb] = plateRGB(pid);
      const edge = (W.bound?.[c] ?? -1) >= 0;
      r = edge ? Math.min(255, pr + 40) : pr;
      g = edge ? Math.min(255, pg + 20) : pg;
      b = edge ? Math.min(255, pb + 30) : pb;
      if (W.plates?.[pid]?.oceanic) { r = (r * 0.65) | 0; g = (g * 0.75) | 0; b = Math.min(255, (b * 1.15) | 0); }
    } else if (mode === 'bounds') {
      const bd = W.bound?.[c] ?? -1;
      if (bd === 0) { r = 40; g = 200; b = 220; }       // divergent — cyan
      else if (bd === 1) { r = 230; g = 90; b = 50; }   // convergent — orange
      else if (bd === 2) { r = 220; g = 200; b = 60; }  // transform — gold
      else {
        r = (r * 0.35) | 0; g = (g * 0.35) | 0; b = (b * 0.4) | 0;
      }
    } else if (mode === 'crust') {
      const th = Math.min(1, (W.crust?.[c] || 0) / 1.4);
      r = 40 + th * 180; g = 50 + th * 100; b = 40 + (1 - th) * 80;
    } else if (mode === 'crustAge') {
      const a = Math.min(1, Math.log1p(W.age?.[c] || 0) / Math.log1p(900));
      // young = warm ridge, old = deep blue
      r = 40 + (1 - a) * 200; g = 60 + (1 - a) * 80; b = 80 + a * 150;
    }
    vDat[o] = r | 0; vDat[o + 1] = g | 0; vDat[o + 2] = b | 0;
  }
}

export function markTouch(W, cell, radiusCells = 2) {
  if (!W.touchMap) W.touchMap = new Float32Array(W.life.length);
  W.touchMap[cell] = Math.min(1, (W.touchMap[cell] || 0) + 0.35);
}
