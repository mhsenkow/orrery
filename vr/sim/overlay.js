import { tropicalFavor, midlatFavor } from './storms.js';
import { DIR, NF } from '../sphere.js';
import { nodeOf } from './evolve.js';
import { SUBSTRATES } from './substrates.js';
import { phaseAtCell, sampleMaterialRgb } from './substrateField.js';
import { coverAt } from './cover.js';
import { landformAt } from './landform.js';
import { columnRgbAt } from './columnField.js';

const SENSE_RGB = {
  uvc: [180, 80, 255], uvb: [140, 90, 255], violetBlue: [60, 90, 220],
  green: [50, 190, 80], red: [220, 70, 50], nearIR: [180, 40, 40],
  midIR: [200, 90, 40], farIR: [160, 60, 30], microwave: [220, 180, 80],
  electric: [80, 220, 210], acoustic: [200, 200, 230], chemical: [180, 140, 70],
  pressure: [90, 160, 200], thermalContact: [220, 120, 80],
};

/** Fire danger for paint only: the same inputs as `fireDanger` in sim/fire.js,
 *  kept local so the overlay never reaches into a tick's RNG stream. */
function fireDangerAt(W, c) {
  if (W.h[c] < W.seaLevel) return 0;
  if ((W.ice?.[c] || 0) > 0.25) return 0;
  const fuel = W.life?.[c] || 0;
  if (fuel < 0.1) return 0;
  const moist = W.moist?.[c] || 0;
  if (moist > 0.62) return 0;
  const dry = 1 - Math.min(1, moist / 0.62);
  const heat = Math.max(0, Math.min(1, ((W.temp?.[c] || 0.5) - 0.42) / 0.32));
  return dry * (0.35 + heat * 0.65);
}

function dominantLineageId(W) {
  if (W._rangeId != null && W._rangeTick === W._tickIndex) return W._rangeId;
  let best = 0, bestPop = 0;
  for (const id of W.tree?.living || []) {
    const n = nodeOf(W.tree, id);
    if ((n?.pop || 0) > bestPop) { bestPop = n.pop; best = id; }
  }
  W._rangeId = best;
  W._rangeTick = W._tickIndex;
  return best;
}

/** Field overlay modes painted via gbuf emphasis. */

export const OVERLAYS = [
  { id: 'none', label: 'None', icon: 'inspect', tip: 'Clear the field paint and show the surface as-is.' },
  { id: 'temp', label: 'Temperature', icon: 'solar', tip: 'Hot → cold. Red is warm; blue is cold. Not the same as insolation.' },
  { id: 'press', label: 'Pressure', icon: 'weather', tip: 'Surface pressure that drives the synoptic chart. On a giant this is the optical cloud deck in bars, not the SWE height field.' },
  { id: 'vapour', label: 'Vapour', icon: 'weather', tip: 'Atmospheric water. Wet windward coasts and dry interiors — continentality made visible.' },
  { id: 'fog', label: 'Fog', icon: 'weather', tip: 'Surface fog: high humidity, cool still air, usually near the coast.' },
  { id: 'ariver', label: 'Moisture river', icon: 'weather', tip: 'Poleward vapour filaments. Most of the moisture transport in a few corridors.' },
  { id: 'wind', label: 'Wind', icon: 'spin', tip: 'Surface wind speed and direction. Fast rotators show more, narrower bands.' },
  { id: 'vort', label: 'Vorticity', icon: 'spin', tip: 'Relative vorticity of the air. Cyclones are patches; the jet is a ribbon. Sign follows the hemisphere.' },
  { id: 'front', label: 'Fronts', icon: 'weather', tip: 'Temperature gradient. Bright lines are weather-bearing fronts, not biome contours.' },
  { id: 'npp', label: 'NPP', icon: 'seedGuild', tip: 'Net primary productivity — how hard the biosphere is growing on that cell.' },
  { id: 'guild', label: 'Guild', icon: 'o2', tip: 'Dominant metabolism colour (cyano, methanogen, aerobe…). Same palette as Seed guild.' },
  { id: 'diversity', label: 'Clade diversity', icon: 'seed', tip: 'How many lineages occupy the cell. Bright = crowded tree, not just biomass.' },
  { id: 'touch', label: 'Your touch', icon: 'raise', tip: 'Cells you have edited this run — mountains, seeds, strikes. The planet’s memory of you.' },
  { id: 'upwell', label: 'Upwelling', icon: 'river', tip: 'Ocean upwelling. Nutrient-rich water rising; often the productive coasts.' },
  { id: 'current', label: 'Currents', icon: 'spin', tip: 'Surface currents. Western-boundary jets run warm and fast; eastern boundaries are cold and slow.' },
  { id: 'enso', label: 'ENSO', icon: 'weather', tip: 'East–west tropical SST dipole. Warm east is El Niño; cold east is La Niña.' },
  { id: 'wave', label: 'Sea state', icon: 'flats', tip: 'Wind-wave height from fetch. The Southern Ocean is rough because nothing stops the wind.' },
  { id: 'river', label: 'Rivers', icon: 'river', tip: 'Drainage and lakes. Bright threads are high discharge; pools are closed basins.' },
  { id: 'mantle', label: 'Mantle', icon: 'core', tip: 'Dynamic topography — the surface rising over upwellings and sinking over downwellings.' },
  { id: 'tide', label: 'Tide range', icon: 'moon', tip: 'Spring–neap tidal range. Needs a moon; solar-only worlds stay faint.' },
  { id: 'intertidal', label: 'Intertidal', icon: 'flats', tip: 'Ground that wets and dries with the tide — the strip life actually meets twice a day.' },
  { id: 'storm', label: 'Storms', icon: 'stormdesk', tip: 'Teal = basins that can organise. Bright cores = named cyclones (eye is dimmer). Gold trail = track. Orange coast = surge. Empty still means something — the basins.' },
  { id: 'vent', label: 'Vents', icon: 'plume', tip: 'Hydrothermal heat — mid-ocean ridges, ice-shell cracks, Io paterae. Life that needs vents lives here.' },
  { id: 'sense', label: 'Sense', icon: 'inspect', tip: 'The globe as the dominant lineage perceives it — photon band, electric, acoustic. Dark cells have no sensors, or none that this sky delivers.' },
  { id: 'range', label: 'Range', icon: 'seed', tip: 'Geographic range of the most abundant living lineage. Bright = occupied cells of the dominant clade.' },
  { id: 'proto', label: 'Prebiotic', icon: 'seedGuild', tip: 'Prebiotic inventory — reduced carbon on catalytic surfaces. The origin is likeliest where this is brightest.' },
  { id: 'faces', label: 'Cube faces', icon: 'inspect', tip: 'Six cube-sphere faces. If a straight line lights up, something is treating a face as the world.' },
  { id: 'zonal', label: 'Zonal residual', icon: 'weather', tip: 'Temperature minus a latitude-only guess. Black means banded; colour means real structure.' },
  { id: 'ecotone', label: 'Ecotone', icon: 'seed', tip: 'Biome membership entropy. Bright = a boundary (savanna/grass, treeline); dark = a core.' },
  { id: 'lid', label: 'Ice lid', icon: 'ice', tip: 'Ice-shell thickness / stagnant lid. Darker where the crust of ice is thicker.' },
  { id: 'plates', label: 'Plates', icon: 'plate', tip: 'Named tectonic plates. Colour is identity, not height.' },
  { id: 'bounds', label: 'Boundaries', icon: 'quake', tip: 'Divergent (rift), convergent (trench/orogen), transform. Reclassifies when you steer a pole.' },
  { id: 'crust', label: 'Crust', icon: 'core', tip: 'Crust type and thickness — the thing Raise / Lower actually edits.' },
  { id: 'substrate', label: 'Substrate', icon: 'core', tip: 'Surface material from the substrate table — nitrogen ice, tholin, sulfur, basalt.' },
  { id: 'phase', label: 'Phase', icon: 'ice', tip: 'Phase of the dominant volatile: solid, convecting ice, liquid, gas, supercritical.' },
  { id: 'cover', label: 'Cover', icon: 'ice', tip: 'What is lying on the substrate — frost, dust, lag, tholin, sulfur, ejecta. Grain and weathering live here. Not the rock underneath.' },
  { id: 'forms', label: 'Landforms', icon: 'raise', tip: 'Which landform the grammar named on this cell — patera, scarp, dune, chaos. Stamps still own the heightfield; this overlay names the process.' },
  { id: 'column', label: 'Column', icon: 'core', tip: 'Top of the per-cell stack — what is actually under this square, not the world recipe. Inspect lists thicknesses in metres.' },
  { id: 'crustAge', label: 'Crust age', icon: 'deeptime', tip: 'Seafloor age. Young at ridges, old toward trenches — if plates are mobile.' },
  { id: 'techno', label: 'Technosphere', icon: 'inspect', tip: 'Energy use and land use. Bright is watts and cropland; dark is unused. Giants have none.' },
  { id: 'fire', label: 'Fire', icon: 'volcano', tip: 'Orange is flame, grey is smoke and ash, dim red is fire danger — dry fuelled land that has not caught yet. A rate, not a state.' },
  { id: 'plume', label: 'Nutrient plume', icon: 'upwell', tip: 'Where animals fertilised the water. Surface-feeding whale-scale life brings N and P up; the green is the bloom that follows.' },
  { id: 'behav', label: 'Behaviour', icon: 'seed', tip: 'What beings are doing on each cell — forage, flee, hunt, tend. The living layer as a map, not a sprite count.' },
];

const OVERLAY_ORDER = [
  'none', 'temp', 'press', 'vapour', 'fog', 'ariver', 'wind', 'vort', 'front', 'current', 'enso', 'wave', 'upwell', 'river', 'mantle',
  'plates', 'bounds', 'crust', 'substrate', 'phase', 'cover', 'forms', 'column', 'crustAge', 'vent',
  'tide', 'storm', 'npp', 'guild', 'sense', 'range', 'proto', 'techno', 'fire', 'plume', 'behav',
  'faces', 'zonal', 'ecotone',
];

export function overlayById(id) {
  return OVERLAYS.find((o) => o.id === id) || OVERLAYS[0];
}

export function overlaysForPicker() {
  return [
    ...OVERLAY_ORDER.map(overlayById),
    ...OVERLAYS.filter((o) => !OVERLAY_ORDER.includes(o.id)),
  ];
}

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
    const c = vCell ? vCell[k] : k;
    const o = k * 4;
    let r = vDat[o], g = vDat[o + 1], b = vDat[o + 2];
    if (mode === 'temp') {
      const t = W.temp[c];
      r = t * 255; g = (1 - Math.abs(t - 0.5) * 2) * 180; b = (1 - t) * 255;
    } else if (mode === 'press') {
      if (W.noSurface && W.pSeen) {
        const p = W.pSeen[c] || 0.7;
        const k = Math.max(0, Math.min(1, Math.log(p / 0.45) / Math.log(8)));
        r = 220 - k * 140; g = 200 - k * 110; b = 170 - k * 40;
      } else {
        const p = W.press?.[c] ?? (1 - W.temp[c]);
        r = 40 + p * 80; g = 60 + (1 - p) * 120; b = 100 + (1 - p) * 140;
      }
    } else if (mode === 'vapour') {
      const v = Math.min(1, (W.vapour?.[c] || 0) / 0.08);
      r = 18 + v * 50;
      g = 48 + v * 140;
      b = 90 + v * 150;
    } else if (mode === 'fog') {
      const f = W.fog?.[c] || 0;
      r = 70 + f * 140;
      g = 80 + f * 140;
      b = 90 + f * 130;
    } else if (mode === 'ariver') {
      const a = W.ariver?.[c] || 0;
      r = 20 + a * 40;
      g = 70 + a * 150;
      b = 140 + a * 100;
    } else if (mode === 'wind') {
      const u = W.windU?.[c] || 0, v = W.windV?.[c] || 0;
      const spd = Math.min(1, Math.hypot(u, v));
      r = 30 + spd * 40 + Math.max(0, u) * 80;
      g = 50 + spd * 100;
      b = 80 + spd * 60 + Math.max(0, -u) * 90;
    } else if (mode === 'vort') {
      const z = W.vort?.[c] || 0;
      r = 40 + Math.max(0, z) * 200;
      g = 30 + (1 - Math.abs(z)) * 50;
      b = 50 + Math.max(0, -z) * 200;
    } else if (mode === 'front') {
      const f = W.front?.[c] || 0;
      r = 30 + f * 200;
      g = 40 + f * 80;
      b = 50 + f * 40;
    } else if (mode === 'current') {
      const u = W.oceanU?.[c] || 0, v = W.oceanV?.[c] || 0;
      const spd = Math.min(1, Math.hypot(u, v));
      if (W.h[c] < W.seaLevel) {
        r = 8 + spd * 40 + Math.max(0, u) * 90;
        g = 40 + spd * 140;
        b = 90 + spd * 120 + Math.max(0, v) * 80;
      } else {
        r = (r * 0.22) | 0; g = (g * 0.22) | 0; b = (b * 0.28) | 0;
      }
    } else if (mode === 'enso') {
      if (W.h[c] < W.seaLevel && Math.abs(DIR[c * 3 + 1]) < 0.35) {
        const anom = (W.oceanSurf?.[c] || 0.5) - 0.5;
        r = 40 + Math.max(0, anom) * 280;
        g = 50 + (1 - Math.abs(anom)) * 40;
        b = 80 + Math.max(0, -anom) * 220;
      } else {
        r = (r * 0.2) | 0; g = (g * 0.2) | 0; b = (b * 0.25) | 0;
      }
    } else if (mode === 'wave') {
      const w = W.waveHt?.[c] || 0;
      if (W.h[c] < W.seaLevel) {
        r = 20 + w * 80; g = 50 + w * 140; b = 90 + w * 150;
      } else {
        r = (r * 0.2) | 0; g = (g * 0.22) | 0; b = (b * 0.28) | 0;
      }
    } else if (mode === 'river') {
      const f = W.flow?.[c] || 0;
      const lk = W.lake?.[c] || 0;
      if (W.h[c] >= W.seaLevel) {
        const k = Math.min(1, Math.log1p(f) / Math.log1p(16) + lk * 0.7);
        if (k > 0.1) {
          r = (r * (1 - k) + 16 * k) | 0;
          g = (g * (1 - k) + 46 * k) | 0;
          b = (b * (1 - k) + 70 * k) | 0;
        }
      } else {
        r = (r * 0.25) | 0; g = (g * 0.28) | 0; b = (b * 0.32) | 0;
      }
    } else if (mode === 'mantle') {
      const d = ((W.dynTopo?.[c] || 0) + 1) * 0.5;
      r = 40 + d * 180; g = 30 + (1 - Math.abs(d - 0.5) * 2) * 80; b = 80 + (1 - d) * 140;
    } else if (mode === 'npp') {
      const n = W.npp?.[c] || 0;
      r = 20; g = n * 255; b = 40 + n * 80;
    } else if (mode === 'guild') {
      const mx = Math.max(r, g, b) || 1;
      r = (r / mx) * 220; g = (g / mx) * 220; b = (b / mx) * 220;
    } else if (mode === 'diversity') {
      const d = (W.cladeCount?.[c] || 0) / 9;
      r = 20 + d * 60; g = 40 + d * 180; b = 80 + (1 - d) * 100;
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
      const trop = tropicalFavor(W, c);
      const mid = midlatFavor(W, c);
      const favor = trop > mid ? trop : mid;
      const tracked = W.stormField?.[c] || 0;
      const trail = W.stormTrail?.[c] || 0;
      const surge = Math.min(1, (W.surgeField?.[c] || 0) * 22);
      r = r * 0.18 + 10;
      g = g * 0.2 + 14;
      b = b * 0.28 + 22;
      if (favor > 0.1) {
        const f = (favor - 0.1) / 0.9;
        const tropish = trop >= mid;
        r += f * (tropish ? 18 : 36);
        g += f * (tropish ? 120 : 70);
        b += f * (tropish ? 95 : 40);
      }
      if (trail > 0.05) {
        r = r * (1 - trail) + 255 * trail;
        g = g * (1 - trail) + 188 * trail;
        b = b * (1 - trail) + 62 * trail;
      }
      if (tracked > 0.1) {
        const k = tracked > 1 ? 1 : tracked;
        r = 40 + k * 70;
        g = 80 + k * 140;
        b = 140 + k * 115;
      }
      if (surge > 0.08) {
        r = Math.min(255, r + surge * 160);
        g = Math.min(255, g + surge * 40);
        b = Math.max(30, b - surge * 50);
      }
    } else if (mode === 'vent') {
      const v = Math.max(W.shellVent?.[c] || 0, W.hydrotherm?.[c] || 0);
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
    } else if (mode === 'substrate') {
      const mat = SUBSTRATES[W.substrate?.[c] ?? W.rock?.[c] ?? 0];
      const rgb = sampleMaterialRgb(mat, { moist: W.moist?.[c] || 0, ice: W.ice?.[c] || 0 });
      r = rgb[0]; g = rgb[1]; b = rgb[2];
    } else if (mode === 'phase') {
      const ph = phaseAtCell(W, c);
      if (ph === 'solid') { r = 210; g = 230; b = 248; }
      else if (ph === 'convecting-ice') { r = 70; g = 200; b = 210; }
      else if (ph === 'liquid') { r = 28; g = 88; b = 200; }
      else if (ph === 'supercritical') { r = 220; g = 110; b = 40; }
      else if (ph === 'gas') { r = 48; g = 46; b = 58; }
      else { r = (r * 0.2) | 0; g = (g * 0.2) | 0; b = (b * 0.22) | 0; }
    } else if (mode === 'cover') {
      const hit = coverAt(W, c);
      const rgb = hit?.rgb || [48, 46, 52];
      const k = hit?.id === 'none' ? 0.35 : 0.55 + Math.min(1, hit.amt || 1) * 0.45;
      r = rgb[0] * k; g = rgb[1] * k; b = rgb[2] * k;
    } else if (mode === 'forms') {
      const f = landformAt(W, c);
      const rgb = f?.rgb || [48, 46, 52];
      const k = f ? 1 : 0.28;
      r = rgb[0] * k; g = rgb[1] * k; b = rgb[2] * k;
    } else if (mode === 'column') {
      const rgb = columnRgbAt(W, c) || [48, 46, 52];
      const k = rgb ? 1 : 0.28;
      r = rgb[0] * k; g = rgb[1] * k; b = rgb[2] * k;
    } else if (mode === 'crustAge') {
      const a = Math.min(1, Math.log1p(W.age?.[c] || 0) / Math.log1p(900));
      // young = warm ridge, old = deep blue
      r = 40 + (1 - a) * 200; g = 60 + (1 - a) * 80; b = 80 + a * 150;
    } else if (mode === 'sense') {
      const n = nodeOf(W.tree, W.popId?.[c]);
      const ownBand = n?.plan?.eyes?.[0]?.band
        || n?.genome?.organs?.find((o) => o.band)?.band;
      const band = ownBand || W.topSense;
      const rgb = band && SENSE_RGB[band];
      if (rgb) {
        const can = !!(n?.plan?.eyeCount || n?.plan?.eyes?.length
          || n?.genome?.organs?.some((o) => o.band || o.class === 'sensor'));
        const k = can ? 1 : 0.16;
        r = rgb[0] * k; g = rgb[1] * k; b = rgb[2] * k;
      } else {
        r = r * 0.18; g = g * 0.18; b = b * 0.22;
      }
    } else if (mode === 'range') {
      const id = dominantLineageId(W);
      const here = W.popId?.[c] === id && id;
      if (here) { r = 40; g = 220; b = 140; }
      else { r = r * 0.18; g = g * 0.2; b = b * 0.25; }
    } else if (mode === 'proto') {
      const p = W.protoOrg?.[c] || 0;
      r = 30 + p * 80; g = 40 + p * 140; b = 20 + p * 40;
      if (W.originCell === c) { r = 255; g = 220; b = 80; }
    } else if (mode === 'faces') {
      const pal = [
        [210, 86, 86], [86, 176, 96], [86, 124, 214],
        [220, 176, 62], [176, 88, 198], [72, 196, 196],
      ];
      const f = Math.min(5, (c / NF) | 0);
      r = pal[f][0]; g = pal[f][1]; b = pal[f][2];
    } else if (mode === 'zonal') {
      const lat = DIR[c * 3 + 1];
      const t = W.temp[c];
      const zonal = 0.5 + lat * 0.35;
      const anom = t - zonal;
      r = 40 + Math.max(0, anom) * 420;
      g = 50 + (1 - Math.abs(anom) * 2) * 40;
      b = 80 + Math.max(0, -anom) * 360;
    } else if (mode === 'ecotone') {
      const mix = W.biomeMix?.[c];
      const e = mix == null ? 0 : Math.max(0, Math.min(1, 1 - mix));
      const land = W.h[c] >= W.seaLevel;
      r = land ? 30 + e * 220 : 12;
      g = land ? 24 + e * 40 : 18;
      b = land ? 40 + e * 80 : 28;
    } else if (mode === 'techno') {
      const land = W.h[c] >= W.seaLevel;
      const build = W.build?.[c] || 0;
      const use = (W.techno?.landUseFrac || 0) * (0.25 + build);
      const heat = Math.min(1, (W.techno?.wasteHeatFrac || 0) * 40);
      if (!land || W.noSurface) {
        r = 8; g = 10; b = 14;
      } else {
        r = 20 + build * 200 + heat * 80;
        g = 18 + use * 90;
        b = 22 + build * 40;
      }
    } else if (mode === 'fire') {
      /* Three things at once, because they are three stages of one event:
         danger (will burn), flame (burning), ash (has burned). */
      const f = Math.min(1, W.fire?.[c] || 0);
      const a = Math.min(1, W.ash?.[c] || 0);
      const d = fireDangerAt(W, c);
      r = 10 + d * 70 + a * 120 + f * 245;
      g = 10 + d * 14 + a * 118 + f * 120;
      b = 14 + a * 112 + f * 20;
    } else if (mode === 'plume') {
      const p = Math.min(1, W.nutrientPlume?.[c] || 0);
      const land = W.h[c] >= W.seaLevel;
      if (land) { r = 16; g = 18; b = 20; }
      else {
        const nut = Math.min(1, ((W.nutrientN?.[c] || 0) + (W.nutrientP?.[c] || 0)) * 0.5);
        r = 8 + p * 40;
        g = 20 + nut * 70 + p * 185;
        b = 40 + nut * 60 + p * 60;
      }
    } else if (mode === 'behav') {
      const code = W.behavMap?.[c] || 0;
      if (!code) {
        r = r * 0.22; g = g * 0.22; b = b * 0.25;
      } else if (code === 3) { r = 255; g = 110; b = 40; }
      else if (code === 4) { r = 220; g = 40; b = 50; }
      else if (code === 5) { r = 240; g = 200; b = 70; }
      else if (code === 6) { r = 40; g = 210; b = 200; }
      else if (code === 2) { r = 90; g = 200; b = 80; }
      else if (code === 7) { r = 120; g = 160; b = 255; }
      else { r = 70; g = 80; b = 90; }
    }
    vDat[o] = r | 0; vDat[o + 1] = g | 0; vDat[o + 2] = b | 0;
  }
}

export function markTouch(W, cell, radiusCells = 2) {
  if (!W.touchMap) W.touchMap = new Float32Array(W.life.length);
  W.touchMap[cell] = Math.min(1, (W.touchMap[cell] || 0) + 0.35);
}
