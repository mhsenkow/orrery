/** Surface paint per geology kind — colour, not height.
 *  `refinePlanetHypsometry` stamps elevation; this is what orbit actually sees.
 *  Earth stays in rulesets.js (`landTerra`); catalogue bodies replace the
 *  inherited terra/ares tint here so Io is sulfur, Venus is grey plains, and
 *  Europa is ice rather than a green continent under a freeze. */

import { clamp, lerp } from '../math.js';
import { DIR } from '../sphere.js';
import { cachePlanetKind, planetKind } from './planetKind.js';

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

function landJupiter(t, m, l, e, ice, extra) {
  const y = extra?.y ?? 0;
  const band = 0.5 + 0.5 * Math.sin(y * 16);
  let r = lerp(168, 214, band);
  let g = lerp(118, 176, band);
  let b = lerp(72, 128, band);
  const pole = y * y;
  r = lerp(r, 196, pole * 0.35);
  g = lerp(g, 168, pole * 0.4);
  b = lerp(b, 148, pole * 0.45);
  const x = extra?.x ?? 0, z = extra?.z ?? 0;
  const spot = Math.hypot(x - 0.52, y + 0.32, z - 0.79);
  if (spot < 0.16) {
    const k = 1 - spot / 0.16;
    r = lerp(r, 198, k);
    g = lerp(g, 78, k);
    b = lerp(b, 46, k);
  }
  return [r, g, b];
}

function landSaturn(t, m, l, e, ice, extra) {
  const y = extra?.y ?? 0;
  const band = 0.5 + 0.5 * Math.sin(y * 12);
  let r = lerp(198, 232, band);
  let g = lerp(176, 208, band);
  let b = lerp(128, 168, band);
  if (y > 0.82) {
    const ang = Math.atan2(extra?.z ?? 0, extra?.x ?? 1);
    const hex = Math.abs(Math.cos(ang * 3));
    const k = clamp((y - 0.82) / 0.18, 0, 1) * (0.35 + hex * 0.65);
    r = lerp(r, 168, k);
    g = lerp(g, 196, k);
    b = lerp(b, 214, k);
  }
  return [r, g, b];
}

function landUranus(t, m, l, e, ice, extra) {
  const y = extra?.y ?? 0;
  const k = y * y;
  return [lerp(154, 186, k), lerp(196, 214, k), lerp(198, 210, k)];
}

function landNeptune(t, m, l, e, ice, extra) {
  const y = extra?.y ?? 0;
  const band = 0.5 + 0.5 * Math.sin(y * 10);
  let r = lerp(48, 72, band);
  let g = lerp(88, 128, band);
  let b = lerp(168, 214, band);
  const x = extra?.x ?? 0, z = extra?.z ?? 0;
  const spot = Math.hypot(x + 0.4, y + 0.22, z - 0.88);
  if (spot < 0.14) {
    const k = 1 - spot / 0.14;
    r = lerp(r, 18, k);
    g = lerp(g, 32, k);
    b = lerp(b, 72, k);
  }
  return [r, g, b];
}

function landIapetus(t, m, l, e, ice, extra) {
  const x = extra?.x ?? 0;
  const y = extra?.y ?? 0;
  const base = x > 0.04 ? [36, 30, 28] : [228, 226, 222];
  if (Math.abs(y) < 0.08) {
    return [
      lerp(base[0], 148, 0.4),
      lerp(base[1], 142, 0.4),
      lerp(base[2], 138, 0.4),
    ];
  }
  return base;
}

function landMiranda(t, m, l, e) {
  const patch = clamp(Math.abs(e - 0.12) * 4, 0, 1);
  const cliff = e < 0.02 ? 1 : 0;
  let r = lerp(186, 154, patch);
  let g = lerp(192, 148, patch);
  let b = lerp(198, 142, patch);
  if (cliff) return [96, 92, 88];
  return [r, g, b];
}

function landMimas(t, m, l, e, ice) {
  if (e < 0.02) return [96, 98, 108];
  const g = lerp(198, 236, clamp(e, 0, 1));
  return [g * 0.96, g * 0.97, g];
}

function landCharon(t, m, l, e, ice, extra) {
  const y = extra?.y ?? 0;
  if (y > 0.68) return [168, 72, 58];
  if (e < 0.04) return [118, 112, 124];
  const g = lerp(168, 210, clamp(e, 0, 1));
  return [g * 0.92, g * 0.93, g];
}

function landPhobos(t, m, l, e) {
  const pit = e < 0.0 ? 1 : clamp(0.12 - e, 0, 1);
  const g = lerp(92, 58, pit);
  return [g * 1.05, g * 0.92, g * 0.78];
}

function landCeres(t, m, l, e, ice) {
  if (ice > 0.5) return [236, 232, 224];
  const dome = clamp((e - 0.18) * 4, 0, 1);
  let r = lerp(142, 186, dome);
  let g = lerp(138, 176, dome);
  let b = lerp(128, 158, dome);
  return [r, g, b];
}

function landEris(t, m, l, e, ice) {
  const frost = Math.max(ice, 0.65);
  return [lerp(214, 244, frost), lerp(216, 246, frost), lerp(222, 250, frost)];
}

function landSmallbody(t, m, l, e) {
  const pit = clamp(0.1 - e, 0, 1);
  const g = lerp(78, 42, pit);
  return [g * 1.08, g * 0.9, g * 0.7];
}

function landRhea(t, m, l, e) {
  const crater = clamp(0.14 - e, 0, 1);
  const g = lerp(214, 168, crater);
  return [g * 0.95, g * 0.96, g];
}

function landUranian(t, m, l, e) {
  const dark = clamp(0.12 - e, 0, 1);
  return [lerp(176, 88, dark), lerp(172, 86, dark), lerp(168, 92, dark)];
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
  jupiter: { land: landJupiter, ocean: landJupiter },
  saturn: { land: landSaturn, ocean: landSaturn },
  uranus: { land: landUranus, ocean: landUranus },
  neptune: { land: landNeptune, ocean: landNeptune },
  gas: { land: landJupiter, ocean: landJupiter },
  iapetus: { land: landIapetus, ocean: oceanMoon },
  miranda: { land: landMiranda, ocean: oceanIce },
  mimas: { land: landMimas, ocean: oceanIce },
  charon: { land: landCharon, ocean: oceanIce },
  phobos: { land: landPhobos, ocean: oceanMoon },
  ceres: { land: landCeres, ocean: oceanMoon },
  eris: { land: landEris, ocean: oceanIce },
  smallbody: { land: landSmallbody, ocean: oceanMoon },
  rhea: { land: landRhea, ocean: oceanIce },
  uranian: { land: landUranian, ocean: oceanIce },
};

export function applyPlanetLook(rule) {
  if (!rule) return rule;
  const { kind } = cachePlanetKind(rule);
  const p = PAINT[kind];
  if (!p) return rule;
  if (p.land) rule.land = p.land;
  if (p.ocean) rule.ocean = p.ocean;
  return rule;
}

export function sampleLand(kind, e = 0.55, ice = 0, extra = {}) {
  const p = PAINT[kind];
  if (!p?.land) return null;
  return p.land(0.5, 0.2, 0, e, ice, extra);
}

function elevOf(W, c) {
  const sea = W.seaLevel || 0;
  return ((W.h?.[c] || 0) - sea) / (1 - sea + 1e-6);
}

/** Map-square key for a non-Whittaker world. Ice shells are not "ice" everywhere. */
export function surfaceKeyAt(W, c) {
  if (c < 0) return null;
  const kind = W._planetKind || W.rule?._planetKind || planetKind(W.rule);
  const h = W.h?.[c] || 0;
  const ice = W.ice?.[c] || 0;
  const lava = W.lava?.[c] || 0;
  const vent = W.shellVent?.[c] || 0;
  const x = DIR[c * 3] || 0;
  const y = DIR[c * 3 + 1] || 0;
  const z = DIR[c * 3 + 2] || 0;
  const sea = h < (W.seaLevel || 0);
  const e = elevOf(W, c);

  if (kind === 'mars') {
    if (ice > 0.42) return 'polarIce';
    if (h < -0.12) return 'basin';
    if (h > 0.28) return 'volcano';
    if (Math.abs(y) < 0.22 && h < 0.02) return 'canyon';
    return 'rust';
  }
  if (kind === 'venus') {
    if (h > 0.18) return 'tessera';
    if (h < 0.08) return 'corona';
    return 'plains';
  }
  if (kind === 'io') {
    if (lava > 0.12) return 'lava';
    if (h < 0.04) return 'patera';
    return 'sulfur';
  }
  if (kind === 'moon') {
    if (ice > 0.5) return 'polarIce';
    if ((W.rock?.[c] || 0) === 0 && h < 0.06) return 'maria';
    return 'highland';
  }
  if (kind === 'mercury') {
    if (ice > 0.5) return 'polarIce';
    if (h < -0.05) return 'caloris';
    return 'regolith';
  }
  if (kind === 'europa') {
    if (vent > 0.3 || e < 0.08) return 'chaos';
    if (Math.abs(e - 0.14) > 0.02) return 'linea';
    return 'iceShell';
  }
  if (kind === 'enceladus') {
    if (vent > 0.3 || y < -0.62) return 'stripe';
    return 'iceShell';
  }
  if (kind === 'titan') {
    if (sea) return 'methaneLake';
    if (Math.abs(y) < 0.35) return 'dune';
    return 'tholin';
  }
  if (kind === 'pluto') {
    if (e < 0.08) return 'sputnik';
    return 'iceShell';
  }
  if (kind === 'triton') return e < 0.11 ? 'cantaloupe' : 'iceShell';
  if (kind === 'ganymede') return e > 0.14 ? 'darkTerrain' : 'groove';
  if (kind === 'callisto') return e < 0.12 ? 'crater' : 'iceShell';
  if (kind === 'iapetus') {
    if (Math.abs(y) < 0.08) return 'ridge';
    return x > 0.04 ? 'darkSide' : 'brightSide';
  }
  if (kind === 'miranda') return e < 0.02 ? 'cliff' : (e > 0.16 ? 'coronae' : 'iceShell');
  if (kind === 'mimas') return e < 0.02 ? 'herschel' : 'iceShell';
  if (kind === 'charon') {
    if (y > 0.68) return 'mordor';
    if (h < 0.04) return 'chasma';
    return 'iceShell';
  }
  if (kind === 'phobos') return h < -0.08 ? 'stickney' : 'regolith';
  if (kind === 'ceres') {
    if (ice > 0.5) return 'brightSpot';
    if (h > 0.16) return 'cryovolcano';
    return 'regolith';
  }
  if (kind === 'eris') return 'iceShell';
  if (kind === 'smallbody') return h < -0.05 ? 'crater' : 'regolith';
  if (kind === 'rhea') return e < 0.08 ? 'chasma' : 'iceShell';
  if (kind === 'uranian') return e < 0.08 ? 'graben' : 'iceShell';
  if (kind === 'jupiter' || kind === 'gas') {
    if (Math.hypot(x - 0.52, y + 0.32, z - 0.79) < 0.16) return 'spot';
    return Math.sin(y * 16) > 0 ? 'zone' : 'belt';
  }
  if (kind === 'saturn') return y > 0.82 ? 'hexagon' : (Math.sin(y * 12) > 0 ? 'zone' : 'belt');
  if (kind === 'uranus') return 'iceGiant';
  if (kind === 'neptune') {
    if (Math.hypot(x + 0.4, y + 0.22, z - 0.88) < 0.14) return 'spot';
    return 'iceGiant';
  }
  if (kind === 'magma') return 'lava';
  if (ice > 0.5) return 'polarIce';
  return 'regolith';
}

const SURFACE_ENTRIES = {
  rust: { id: 'rust', label: 'rust', rgb: [148, 84, 52], tip: 'Iron dust',
    why: 'Basaltic dust with nanophase iron oxide. Mars from orbit is this colour, not a desert biome.' },
  polarIce: { id: 'polarIce', label: 'polar ice', rgb: [232, 236, 244], tip: 'Polar cap',
    why: 'CO₂ or water ice at a pole. Seasonal on Mars; permanent in shadowed craters on Mercury and the Moon.' },
  basin: { id: 'basin', label: 'basin', rgb: [118, 72, 48], tip: 'Impact basin',
    why: 'A deep low — Hellas on Mars, Caloris on Mercury. Not a sea.' },
  volcano: { id: 'volcano', label: 'volcano', rgb: [168, 96, 58], tip: 'Shield / patera',
    why: 'A constructional high. Olympus and Tharsis on Mars; paterae on Io sit in the sulfur instead.' },
  canyon: { id: 'canyon', label: 'canyon', rgb: [96, 58, 40], tip: 'Rift canyon',
    why: 'A narrow equatorial cut. Valles Marineris is the type; Charon’s chasma is the ice version.' },
  tessera: { id: 'tessera', label: 'tessera', rgb: [200, 186, 162], tip: 'Tessera highland',
    why: 'Deformed, radar-bright highland on Venus. Older than the plains, not a continent.' },
  corona: { id: 'corona', label: 'corona', rgb: [132, 118, 96], tip: 'Corona',
    why: 'A circular tectonic welt on Venus. Mantle upwelling, not an impact.' },
  plains: { id: 'plains', label: 'plains', rgb: [168, 154, 128], tip: 'Volcanic plains',
    why: 'The young wrapping of Venus. Grey basalt under a cream sky, not grassland.' },
  sulfur: { id: 'sulfur', label: 'sulfur', rgb: [220, 168, 40], tip: 'Sulfur plains',
    why: 'Io’s allotropes and SO₂ frost. Yellow because of sulfur, not because of sand.' },
  patera: { id: 'patera', label: 'patera', rgb: [52, 24, 16], tip: 'Volcanic pit',
    why: 'A lava lake pit on Io. The floor is black glass; the rim is sulfur.' },
  lava: { id: 'lava', label: 'lava', rgb: [48, 16, 10], tip: 'Lava',
    why: 'Molten silicates at the surface. Io, magma worlds, and anything still pouring.' },
  maria: { id: 'maria', label: 'maria', rgb: [72, 74, 80], tip: 'Mare basalt',
    why: 'Flood basalt on the Moon’s nearside. Dark because it is young iron-rich rock, not because it is wet.' },
  highland: { id: 'highland', label: 'highland', rgb: [164, 166, 176], tip: 'Anorthosite highland',
    why: 'The Moon’s bright crust. Cratered anorthosite, older than the maria.' },
  caloris: { id: 'caloris', label: 'Caloris', rgb: [88, 84, 76], tip: 'Caloris basin',
    why: 'Mercury’s giant basin. The antipode is chaotic terrain from the same impact.' },
  regolith: { id: 'regolith', label: 'regolith', rgb: [110, 104, 96], tip: 'Regolith',
    why: 'Gardened dust and broken rock. The default surface of an airless body.' },
  chaos: { id: 'chaos', label: 'chaos', rgb: [186, 148, 112], tip: 'Chaos ice',
    why: 'Broken, rotated ice blocks on Europa. The shell failed; the ocean almost showed.' },
  linea: { id: 'linea', label: 'linea', rgb: [176, 150, 128], tip: 'Linea',
    why: 'Cycloid cracks in Europa’s shell. The ice is sliding; the colour is salt and radiation.' },
  iceShell: { id: 'iceShell', label: 'ice shell', rgb: [226, 232, 242], tip: 'Ice shell',
    why: 'A water-ice lid, not a glacier on rock. The square is the conducting lid over an ocean or just ice.' },
  stripe: { id: 'stripe', label: 'stripe', rgb: [210, 226, 238], tip: 'Tiger stripe',
    why: 'Enceladus’s south-polar fissures. This is where the ocean vents into space.' },
  methaneLake: { id: 'methaneLake', label: 'CH₄ lake', rgb: [18, 28, 36], tip: 'Methane lake',
    why: 'Liquid methane/ethane on Titan. The hydrological cycle is real; the solvent is not water.' },
  dune: { id: 'dune', label: 'dune', rgb: [168, 118, 62], tip: 'Organic dunes',
    why: 'Equatorial dunes of solid organics on Titan. Longitudinal, not silicate sand.' },
  tholin: { id: 'tholin', label: 'tholin', rgb: [96, 72, 48], tip: 'Tholin land',
    why: 'Photochemical haze settled as orange organics. Titan’s bright-and-dark is this, not soil.' },
  sputnik: { id: 'sputnik', label: 'Sputnik', rgb: [232, 228, 236], tip: 'Sputnik Planitia',
    why: 'Convecting nitrogen ice in Pluto’s heart. The cells are the convection, not craters.' },
  cantaloupe: { id: 'cantaloupe', label: 'cantaloupe', rgb: [176, 184, 196], tip: 'Cantaloupe terrain',
    why: 'Triton’s dimpled ice. Diapirs, not impact saturation.' },
  darkTerrain: { id: 'darkTerrain', label: 'dark ice', rgb: [128, 124, 132], tip: 'Dark terrain',
    why: 'Ganymede’s old, dark, cratered ice. The grooved terrain cut it later.' },
  groove: { id: 'groove', label: 'grooves', rgb: [176, 184, 196], tip: 'Grooved terrain',
    why: 'Extensional lanes on Ganymede. Younger ice, tectonically stretched.' },
  crater: { id: 'crater', label: 'crater', rgb: [88, 84, 80], tip: 'Crater',
    why: 'An impact pit. Callisto is saturated with them; small bodies are made of them.' },
  darkSide: { id: 'darkSide', label: 'Cassini', rgb: [36, 30, 28], tip: 'Dark hemisphere',
    why: 'Iapetus’s leading face. Dust from Phoebe, kept dark by a thermal runaway.' },
  brightSide: { id: 'brightSide', label: 'bright ice', rgb: [228, 226, 222], tip: 'Bright hemisphere',
    why: 'Iapetus’s trailing face. Water ice, as bright as snow, next to coal.' },
  ridge: { id: 'ridge', label: 'ridge', rgb: [148, 142, 138], tip: 'Equatorial ridge',
    why: 'Iapetus’s unexplained 13 km spine. A square on the equator is this, not a biome.' },
  cliff: { id: 'cliff', label: 'cliff', rgb: [96, 92, 88], tip: 'Verona Rupes',
    why: 'Miranda’s scarp — among the tallest known. Mismatched terrain jammed together.' },
  coronae: { id: 'coronae', label: 'coronae', rgb: [154, 148, 142], tip: 'Miranda corona',
    why: 'Ovoid patchwork on Miranda. Not Venus coronae — ice that was pulled apart and refrozen.' },
  herschel: { id: 'herschel', label: 'Herschel', rgb: [96, 98, 108], tip: 'Herschel crater',
    why: 'Mimas’s 130 km crater. A moon that looks like a Death Star because of one impact.' },
  mordor: { id: 'mordor', label: 'Mordor', rgb: [168, 72, 58], tip: 'Red polar cap',
    why: 'Charon’s north pole. Methane from Pluto, processed red. Not rust.' },
  chasma: { id: 'chasma', label: 'chasma', rgb: [118, 112, 124], tip: 'Canyon',
    why: 'A rift in ice. Charon’s Serenity chasma; Tethys’s Ithaca Chasma on the Rhea-class world.' },
  stickney: { id: 'stickney', label: 'Stickney', rgb: [58, 50, 42], tip: 'Stickney crater',
    why: 'Phobos’s giant crater. The grooves are the tidal stress that will finish the moon.' },
  brightSpot: { id: 'brightSpot', label: 'Occator', rgb: [236, 232, 224], tip: 'Carbonate bright spot',
    why: 'Ceres’s Occator salts. Brine that reached the surface and froze white.' },
  cryovolcano: { id: 'cryovolcano', label: 'Ahuna', rgb: [186, 176, 158], tip: 'Cryovolcanic dome',
    why: 'Ceres’s Ahuna Mons. Ice volcanism, not silicate.' },
  belt: { id: 'belt', label: 'belt', rgb: [168, 128, 88], tip: 'Cloud belt',
    why: 'A dark zonal jet. Jupiter and Saturn have no ground — the square is a pressure level.' },
  zone: { id: 'zone', label: 'zone', rgb: [214, 180, 140], tip: 'Cloud zone',
    why: 'A bright zonal jet. Ammonia cirrus on a gas giant, not land.' },
  spot: { id: 'spot', label: 'spot', rgb: [198, 78, 46], tip: 'Anticyclone',
    why: 'A long-lived vortex. The Great Red Spot, or Neptune’s dark spots that come and go.' },
  hexagon: { id: 'hexagon', label: 'hexagon', rgb: [168, 196, 214], tip: 'Polar hexagon',
    why: 'Saturn’s north-polar jet. A standing wave, not a crater.' },
  iceGiant: { id: 'iceGiant', label: 'H/He', rgb: [72, 128, 196], tip: 'Ice-giant air',
    why: 'Uranus and Neptune. Methane-blue hydrogen, no surface. Featureless until a storm forms.' },
  graben: { id: 'graben', label: 'graben', rgb: [88, 86, 92], tip: 'Graben',
    why: 'Extensional troughs on the Uranian moons. Ariel is the type.' },
};

const KIND_SURFACE = {
  mars: ['rust', 'polarIce', 'basin', 'volcano', 'canyon'],
  venus: ['plains', 'tessera', 'corona'],
  io: ['sulfur', 'patera', 'lava'],
  moon: ['highland', 'maria', 'polarIce'],
  mercury: ['regolith', 'caloris', 'polarIce'],
  europa: ['iceShell', 'linea', 'chaos'],
  enceladus: ['iceShell', 'stripe'],
  titan: ['tholin', 'dune', 'methaneLake'],
  pluto: ['iceShell', 'sputnik'],
  triton: ['iceShell', 'cantaloupe'],
  ganymede: ['groove', 'darkTerrain'],
  callisto: ['iceShell', 'crater'],
  iapetus: ['darkSide', 'brightSide', 'ridge'],
  miranda: ['iceShell', 'coronae', 'cliff'],
  mimas: ['iceShell', 'herschel'],
  charon: ['iceShell', 'mordor', 'chasma'],
  phobos: ['regolith', 'stickney'],
  ceres: ['regolith', 'brightSpot', 'cryovolcano'],
  eris: ['iceShell'],
  smallbody: ['regolith', 'crater'],
  rhea: ['iceShell', 'chasma', 'crater'],
  uranian: ['iceShell', 'graben'],
  jupiter: ['zone', 'belt', 'spot'],
  saturn: ['zone', 'belt', 'hexagon'],
  uranus: ['iceGiant'],
  neptune: ['iceGiant', 'spot'],
  gas: ['zone', 'belt', 'spot'],
  magma: ['lava'],
  airless: ['regolith', 'crater', 'polarIce'],
  stagnant: ['regolith', 'crater'],
};

export function planetCoverEntries(kind) {
  const ids = KIND_SURFACE[kind] || ['regolith'];
  return ids.map((id) => {
    const e = SURFACE_ENTRIES[id];
    return { id: e.id, label: e.label, rgb: e.rgb, tip: e.tip, why: e.why };
  });
}
