/** Surface paint per geology kind — colour, not height.
 *  `refinePlanetHypsometry` stamps elevation; this is what orbit actually sees.
 *  Earth stays in rulesets.js (`landTerra`); catalogue bodies replace the
 *  inherited terra/ares tint here so Io is sulfur, Venus is grey plains, and
 *  Europa is ice rather than a green continent under a freeze. */

import { clamp, lerp } from '../math.js';
import { planetKind } from './planetTerrain.js';

function landMars(t, m, l, e, ice) {
  if (ice > 0.42) return [232, 236, 244];
  const high = clamp((e - 0.42) * 1.8, 0, 1);
  const dust = clamp(m * 0.4, 0, 1);
  let r = lerp(118, 168, high);
  let g = lerp(72, 96, high);
  let b = lerp(48, 58, high);
  r = lerp(r, 156, dust);
  g = lerp(g, 88, dust);
  b = lerp(b, 52, dust);
  if (t < 0.28) {
    const k = clamp((0.28 - t) * 3, 0, 1);
    r = lerp(r, 210, k * 0.45);
    g = lerp(g, 214, k * 0.45);
    b = lerp(b, 222, k * 0.55);
  }
  return [r, g, b];
}

function landVenus(t, m, l, e) {
  const tessera = clamp((e - 0.5) * 2.6, 0, 1);
  const corona = clamp((0.46 - e) * 3.2, 0, 1);
  let r = lerp(168, 208, tessera);
  let g = lerp(154, 194, tessera);
  let b = lerp(128, 170, tessera);
  r = lerp(r, 132, corona);
  g = lerp(g, 118, corona);
  b = lerp(b, 96, corona);
  return [r, g, b];
}

function landIo(t, m, l, e, ice, extra) {
  const lava = extra?.lava || 0;
  if (lava > 0.12) return [48, 16, 10];
  if (ice > 0.4) return [236, 230, 214];
  const patera = clamp(0.4 - e, 0, 1);
  const sulfur = 1 - patera;
  return [
    lerp(52, 232, sulfur),
    lerp(24, 168, sulfur),
    lerp(16, 38, sulfur),
  ];
}

function landMoon(t, m, l, e, ice) {
  if (ice > 0.55) return [220, 226, 234];
  const highland = clamp(e, 0, 1);
  const g = lerp(68, 172, highland);
  return [g * 0.96, g * 0.97, g * 1.04];
}

function landMercury(t, m, l, e, ice) {
  if (ice > 0.55) return [214, 218, 226];
  const high = clamp(e, 0, 1);
  const g = lerp(78, 148, high);
  return [g * 1.02, g * 0.98, g * 0.9];
}

function landEuropa(t, m, l, e, ice) {
  const linea = clamp(Math.abs(e - 0.5) * 2.4, 0, 1);
  const chaos = clamp((0.42 - e) * 2.8, 0, 1);
  let r = lerp(234, 176, linea);
  let g = lerp(238, 150, linea);
  let b = lerp(246, 128, linea);
  r = lerp(r, 186, chaos);
  g = lerp(g, 148, chaos);
  b = lerp(b, 112, chaos);
  return [r, g, b];
}

function landEnceladus() {
  return [242, 246, 250];
}

function landTitan(t, m, l, e, ice) {
  if (ice > 0.55) return [210, 198, 176];
  const dune = clamp(e * 1.2, 0, 1);
  return [
    lerp(72, 168, dune),
    lerp(58, 118, dune),
    lerp(42, 62, dune),
  ];
}

function landPluto(t, m, l, e, ice) {
  const heart = clamp(0.55 - e, 0, 1);
  return [
    lerp(186, 232, heart),
    lerp(176, 228, heart),
    lerp(168, 236, heart),
  ];
}

function landTriton(t, m, l, e) {
  const cant = Math.abs(Math.sin(e * 31.0)) * 0.35;
  return [lerp(198, 168, cant), lerp(204, 176, cant), lerp(214, 188, cant)];
}

function landGanymede(t, m, l, e, ice) {
  const groove = clamp(Math.abs(e - 0.48) * 2, 0, 1);
  const g = lerp(148, 196, groove);
  return [g * 0.92, g * 0.94, g];
}

function landCallisto(t, m, l, e) {
  const crater = clamp(0.5 - e, 0, 1);
  const g = lerp(128, 88, crater);
  return [g * 0.95, g * 0.93, g * 0.9];
}

function landAirless(t, m, l, e, ice) {
  if (ice > 0.55) return [220, 224, 232];
  const g = 90 + 90 * clamp(e, 0, 1);
  return [g * 0.98, g * 0.97, g * 1.02];
}

function landMagma(t, m, l, e) {
  const crust = clamp(e, 0, 1);
  return [
    lerp(210, 48, crust),
    lerp(70, 22, crust),
    lerp(18, 16, crust),
  ];
}

function landStagnant(t, m, l, e, ice) {
  if (ice > 0.5) return [226, 230, 238];
  const g = lerp(110, 168, clamp(e, 0, 1));
  return [g * 1.05, g * 0.92, g * 0.72];
}

function oceanMars() { return [96, 58, 42]; }
function oceanVenus() { return [150, 132, 108]; }
function oceanIo() { return [40, 18, 12]; }
function oceanMoon() { return [64, 64, 72]; }
function oceanEuropa() { return [198, 214, 232]; }
function oceanTitan() { return [18, 28, 36]; }
function oceanIce() { return [186, 204, 226]; }
function oceanMagma(d) { return [70 + 40 * d, 18, 8]; }

const PAINT = {
  mars: { land: landMars, ocean: oceanMars },
  venus: { land: landVenus, ocean: oceanVenus },
  io: { land: landIo, ocean: oceanIo },
  moon: { land: landMoon, ocean: oceanMoon },
  mercury: { land: landMercury, ocean: oceanMoon },
  europa: { land: landEuropa, ocean: oceanEuropa },
  enceladus: { land: landEnceladus, ocean: oceanIce },
  titan: { land: landTitan, ocean: oceanTitan },
  pluto: { land: landPluto, ocean: oceanIce },
  triton: { land: landTriton, ocean: oceanIce },
  ganymede: { land: landGanymede, ocean: oceanIce },
  callisto: { land: landCallisto, ocean: oceanIce },
  airless: { land: landAirless, ocean: oceanMoon },
  magma: { land: landMagma, ocean: oceanMagma },
  stagnant: { land: landStagnant, ocean: oceanMars },
};

export function applyPlanetLook(rule) {
  if (!rule) return rule;
  const kind = planetKind(rule);
  const p = PAINT[kind];
  if (!p) return rule;
  if (p.land) rule.land = p.land;
  if (p.ocean) rule.ocean = p.ocean;
  return rule;
}

export function sampleLand(kind, e = 0.55, ice = 0) {
  const p = PAINT[kind];
  if (!p?.land) return null;
  return p.land(0.5, 0.2, 0, e, ice, {});
}
