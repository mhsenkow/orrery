import { tropicalFavor, midlatFavor } from './storms.js';
import { DIR, NF, NBR } from '../sphere.js';
import { nodeOf } from './evolve.js';
import { SUBSTRATES } from './substrates.js';
import { phaseAtCell, sampleMaterialRgb } from './substrateField.js';
import { coverAt } from './cover.js';
import { landformAt } from './landform.js';
import { columnRgbAt } from './columnField.js';
// One definition of fire danger. The overlay used to carry its own near-copy,
// which is two versions of the same physics free to drift apart. `fireDanger`
// is pure — fields in, number out, no RNG — so the paint path can call it.
import { fireDanger } from './fire.js';
// @provenance look

const SENSE_RGB = {
  uvc: [180, 80, 255], uvb: [140, 90, 255], violetBlue: [60, 90, 220],
  green: [50, 190, 80], red: [220, 70, 50], nearIR: [180, 40, 40],
  midIR: [200, 90, 40], farIR: [160, 60, 30], microwave: [220, 180, 80],
  electric: [80, 220, 210], acoustic: [200, 200, 230], chemical: [180, 140, 70],
  pressure: [90, 160, 200], thermalContact: [220, 120, 80],
};

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
  { id: 'jet', label: 'Jet', icon: 'spin', tip: 'The flow aloft, from thermal wind. The bright ribbon is the jet stream, sitting over the strongest temperature gradient — which is why storms track along it.' },
  { id: 'shear', label: 'Shear', icon: 'weather', tip: 'Vertical wind shear between the surface and the flow aloft. Low shear over a warm sea lets a tropical cyclone build a chimney; high shear tears one apart, and feeds midlatitude storms instead.' },
  { id: 'vort', label: 'Vorticity', icon: 'spin', tip: 'Relative vorticity of the air. Cyclones are patches; the jet is a ribbon. Sign follows the hemisphere.' },
  { id: 'front', label: 'Fronts', icon: 'weather', tip: 'Temperature gradient. Bright lines are weather-bearing fronts, not biome contours.' },
  { id: 'frontKind', label: 'Front type', icon: 'weather', tip: 'Cold (blue), warm (red), occluded (purple), stationary (grey). Classification from wind vs temperature gradient.' },
  { id: 'drylineMap', label: 'Dryline', icon: 'weather', tip: 'Moisture jump without a temperature jump — the invisible front that fires supercells.' },
  { id: 'stormTrackMap', label: 'Storm track', icon: 'weather', tip: 'Accumulated cyclone and front activity. The bright ribbon is where weather crosses the planet.' },
  { id: 'blockMap', label: 'Blocking', icon: 'weather', tip: 'Persistent ridges. Blocking highs divert the jet, park droughts, and make heatwaves.' },
  { id: 'eadyMap', label: 'Eady growth', icon: 'weather', tip: 'Baroclinic growth rate from shear times temperature gradient. Where extratropical cyclones are born.' },
  { id: 'aridityMap', label: 'Aridity', icon: 'weather', tip: 'PET / precipitation climatology. Desert vs grassland is this number.' },
  { id: 'heatMap', label: 'Heat index', icon: 'weather', tip: 'Heatwave index from blocking + extreme temperature. Red is dangerous.' },
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
  { id: 'cin', label: 'CIN', icon: 'weather', tip: 'Convective inhibition — the cap holding convection down. Low CIN means storms fire easily; high CIN means they wait for a trigger.' },
  { id: 'rainrate', label: 'Rain rate', icon: 'weather', tip: 'Rainfall intensity in mm/hr equivalent. Bright is heavy rain. Distinct from accumulated precip.' },
  { id: 'flood', label: 'Flood risk', icon: 'weather', tip: 'Flash flood risk from heavy rain on steep, saturated ground. Bright is danger.' },
  { id: 'precipconv', label: 'Precip conv', icon: 'weather', tip: 'Convective share of precipitation. Bright = shower-type rain from instability; dark = stratiform.' },
  { id: 'reflectivity', label: 'Reflectivity', icon: 'weather', tip: 'Radar-like view of precipitation intensity. Green → yellow → red → purple. The nearest thing to a weather radar this grid can carry.' },
  { id: 'ircloud', label: 'IR cloud', icon: 'weather', tip: 'Infrared cloud proxy — bright where cloud tops are cold and high, dark where clear sky shows warm ground.' },
  { id: 'wv', label: 'Water vapour', icon: 'weather', tip: 'Water vapour channel from precipitable water. Bright green is moist air; dark is dry air aloft — dry slots that tear storms.' },
  { id: 'stp', label: 'STP', icon: 'weather', tip: 'Significant tornado parameter. High STP values signal the overlap of instability, shear, helicity, and low cloud base that breeds violent tornadoes.' },
  { id: 'shear01', label: '0–1km shear', icon: 'weather', tip: 'Low-level wind shear from the bottom two air-column levels. High values with even modest CAPE can spin up tornadoes.' },
  { id: 'outlook', label: 'Severe outlook', icon: 'weather', tip: 'Convective outlook categories 1–5. A composite of STP, tornado risk, shear, and CAPE — the forecast map before the storms.' },
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
  { id: 'beings', label: 'Beings', icon: 'seed', tip: 'Where the animals actually are. Bright clumps are herds and pods; a rate, not a habitat map — sprites are hidden at orbit, this is not.' },
  { id: 'weather', label: 'Weather', icon: 'weather', tip: 'One picture of the sky: cloud grey, rain blue, cyclone cores white, lightning yellow. What you would see from a window, not a field.' },
  { id: 'cape', label: 'CAPE', icon: 'weather', tip: 'Convective available potential energy. High CAPE means the atmosphere wants to overturn — thunderstorms, hail, tornadoes.' },
  { id: 'ascent', label: 'Ascent', icon: 'weather', tip: 'Vertical motion of the air. Blue is sinking (clear, dry); red is rising (clouds, rain). The Hadley cell and monsoon are patterns in this.' },
  { id: 'droughtMap', label: 'Drought', icon: 'weather', tip: 'Drought intensity. Red is severe — the rain that should come did not, and the ground is drying. Accumulates over many ticks.' },
  { id: 'pwat', label: 'PW', icon: 'weather', tip: 'Precipitable water in the column, in mm. High values feed the heaviest rain; low values are dry air that evaporates storms.' },
  { id: 'fallout', label: 'Fallout', icon: 'core', tip: 'Radiation — bursts, fallout, buried waste. Half-life of thousands of ticks: this outlives the civilisation that made it.' },
  { id: 'toxin', label: 'Toxin', icon: 'aerosol', tip: 'Chemical contamination. Creeps downhill and downstream, kills slowly, and the ground never looks wrong.' },
  { id: 'plague', label: 'Plague', icon: 'plague', tip: 'Epidemic intensity, and in dark green the immune. It travels between settlements, not across country, and burns out where it has been.' },
  { id: 'borders', label: 'Borders', icon: 'plate', tip: 'Polity frontiers — cells whose owner differs from a neighbour. Colour follows the polity that holds the cell.' },
  { id: 'war', label: 'War', icon: 'quake', tip: 'Contested ground and the tracks of anything in the air. Fronts move toward what is worth taking.' },
  { id: 'casualty', label: 'Casualties', icon: 'quake', tip: 'Where people died. Deliberately ugly — grey-red blotches that never look like a map worth framing.' },
  { id: 'warfront', label: 'Front direction', icon: 'quake', tip: 'Which way the front is pushing — warm toward the attacker, cool toward the defender.' },
  { id: 'behav', label: 'Behaviour', icon: 'seed', tip: 'What beings are doing on each cell — forage, flee, hunt, tend. The living layer as a map, not a sprite count.' },
  { id: 'trophic', label: 'Trophic', icon: 'seedGuild', tip: 'Local food pyramid. Green is producers, gold grazers, red hunters. Ice and rainforest are no longer the same number.' },
  { id: 'fear', label: 'Fear', icon: 'seed', tip: 'Landscape of fear — where hunts and near-misses leave predation pressure. Prey flee the bright cells.' },
  { id: 'carcass', label: 'Carcass', icon: 'seed', tip: 'Kill sites and scavenging. Discrete carcasses decay into soil and nutrients.' },
  { id: 'trail', label: 'Trails', icon: 'seed', tip: 'Worn paths from movement. Herds and foragers prefer desire lines already walked.' },
  { id: 'lifefront', label: 'Life front', icon: 'seed', tip: 'Colonisation edge — where life is advancing into empty or sparse cells. The leading rim of the biosphere.' },
  { id: 'flux', label: 'Life flux', icon: 'seed', tip: 'Where biomass grew or died this tick. Green is gain, magenta is loss — rates, not occupancy.' },
];

/* VIZ15–21: Weather overlays grouped together under a logical order. */
const OVERLAY_ORDER = [
  'none', 'temp', 'press',
  // Weather group
  'weather', 'cape', 'cin', 'ascent', 'pwat', 'droughtMap', 'shear', 'stp', 'shear01', 'outlook',
  'rainrate', 'flood', 'precipconv', 'reflectivity', 'ircloud', 'wv',
  // Atmosphere
  'vapour', 'fog', 'ariver', 'wind', 'jet', 'vort', 'front',
  'frontKind', 'drylineMap', 'stormTrackMap', 'blockMap', 'eadyMap', 'aridityMap', 'heatMap',
  // Ocean
  'current', 'enso', 'wave', 'upwell', 'river',
  // Geology
  'mantle', 'plates', 'bounds', 'crust', 'substrate', 'phase', 'cover', 'forms', 'column', 'crustAge', 'vent',
  // Storms & coast
  'tide', 'intertidal', 'storm',
  // Life
  'npp', 'guild', 'beings', 'sense', 'range', 'proto', 'techno', 'fire', 'plume',
  'diversity', 'ecotone', 'lifefront', 'flux',
  // Dark / misc
  'fallout', 'toxin', 'plague', 'borders', 'war', 'casualty', 'warfront', 'behav', 'trophic', 'fear', 'carcass', 'trail',
  'touch', 'faces', 'zonal',
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
      const spd = Math.min(1, Math.sqrt(u * u + v * v) * 1.4);
      r = 30 + spd * 40 + Math.max(0, u) * 80;
      g = 50 + spd * 100;
      b = 80 + spd * 60 + Math.max(0, -u) * 90;
    } else if (mode === 'jet') {
      // Speed aloft, with the westerly ribbon picked out in warm colour.
      const u = W.jetU?.[c] || 0, v = W.jetV?.[c] || 0;
      const spd = Math.min(1, Math.sqrt(u * u + v * v) * 0.55);
      r = 25 + spd * 90 + Math.max(0, u) * 90;
      g = 35 + spd * 130;
      b = 90 + spd * 90 + Math.max(0, -u) * 70;
    } else if (mode === 'shear') {
      const sh = Math.min(1, (W.shear?.[c] || 0) * 1.6);
      r = 25 + sh * 200;
      g = 40 + sh * 90;
      b = 90 - sh * 40;
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
    } else if (mode === 'frontKind') {
      const fk = W.frontKind?.[c] || 0;
      const fs = W.frontStrength?.[c] || 0;
      if (fk === 1) { r = 40 + fs * 60; g = 80 + fs * 120; b = 180 + fs * 70; } // cold — blue
      else if (fk === 2) { r = 200 + fs * 55; g = 60 + fs * 40; b = 40; } // warm — red
      else if (fk === 3) { r = 140 + fs * 80; g = 40 + fs * 30; b = 160 + fs * 60; } // occluded — purple
      else if (fk === 4) { r = 120 + fs * 60; g = 120 + fs * 60; b = 120 + fs * 50; } // stationary — grey
      else { r = r * 0.2; g = g * 0.2; b = b * 0.22; }
    } else if (mode === 'drylineMap') {
      const dl = W.dryline?.[c] || 0;
      if (dl > 0.05) { r = 180 + dl * 70; g = 140 + dl * 40; b = 40 + dl * 20; }
      else { r = r * 0.2; g = g * 0.22; b = b * 0.25; }
    } else if (mode === 'stormTrackMap') {
      const st = W.stormTrack?.[c] || 0;
      r = 14 + st * 200; g = 20 + st * 140; b = 40 + st * 180;
    } else if (mode === 'blockMap') {
      const bl = W.block?.[c] || 0;
      if (bl > 0.05) { r = 200 + bl * 55; g = 140 + bl * 60; b = 30; }
      else { r = r * 0.2; g = g * 0.2; b = b * 0.22; }
    } else if (mode === 'eadyMap') {
      const ea = W.eady?.[c] || 0;
      r = 14 + ea * 240; g = 30 + ea * 100; b = 60 + (1 - ea) * 60;
    } else if (mode === 'aridityMap') {
      const ar = Math.min(1, (W.aridity?.[c] || 0) / 3);
      const land = W.h[c] >= W.seaLevel;
      if (land) { r = 40 + ar * 200; g = 50 + (1 - ar) * 60; b = 20 + (1 - ar) * 30; }
      else { r = 10; g = 14; b = 20; }
    } else if (mode === 'heatMap') {
      const hi = W.heatIndex?.[c] || 0;
      const land = W.h[c] >= W.seaLevel;
      if (land) { r = 30 + hi * 225; g = 30 + (1 - hi) * 40; b = 20; }
      else { r = 10; g = 12; b = 18; }
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
      const d = fireDanger(W, c);
      r = 10 + d * 70 + a * 120 + f * 245;
      g = 10 + d * 14 + a * 118 + f * 120;
      b = 14 + a * 112 + f * 20;
    } else if (mode === 'fallout') {
      const v = Math.min(1, W.rad?.[c] || 0);
      const k = Math.pow(v, 0.5);
      r = 14 + k * 200; g = 16 + k * 150; b = 22 + k * 230;
    } else if (mode === 'toxin') {
      const v = Math.min(1, W.toxin?.[c] || 0);
      const k = Math.pow(v, 0.5);
      r = 16 + k * 190; g = 20 + k * 210; b = 18 + k * 40;
    } else if (mode === 'plague') {
      const d = Math.min(1, W.disease?.[c] || 0);
      const im = Math.min(1, W.immune?.[c] || 0);
      const host = Math.min(1, (W.build?.[c] || 0) + (W.beingDens?.[c] || 0) * 0.4);
      // Hosts in grey, the sick in red, the immune in green — an SIR picture.
      r = 12 + host * 40 + Math.pow(d, 0.5) * 220;
      g = 14 + host * 40 + im * 150;
      b = 18 + host * 44;
    } else if (mode === 'borders') {
      /* Prefer W.border; else compute from owner neighbour differences.
         Shade by polityTint spare channel when present (§15). */
      let onBorder = W.border?.[c] > 0;
      const oid = W.owner?.[c] ?? -1;
      if (!onBorder && oid >= 0 && W.owner) {
        for (let k = 0; k < 4; k++) {
          if (W.owner[NBR[c * 4 + k]] !== oid) { onBorder = true; break; }
        }
      }
      if (oid < 0) {
        r = r * 0.2; g = g * 0.2; b = b * 0.22;
      } else {
        const p = W._polityIndex?.get(oid);
        const col = p?.color || [0.55, 0.55, 0.6];
        const tint = W.polityTint?.[c];
        const tmax = tint != null && tint > 0 ? tint : Math.max(col[0], col[1], col[2], 0.25);
        const edge = onBorder ? 1 : 0.35;
        const val = onBorder ? 0.55 + tmax * 0.45 : 0.35 + tmax * 0.3;
        r = 10 + col[0] * 240 * edge * val / Math.max(0.2, tmax);
        g = 10 + col[1] * 240 * edge * val / Math.max(0.2, tmax);
        b = 12 + col[2] * 240 * edge * val / Math.max(0.2, tmax);
        if (onBorder) {
          r = Math.min(255, r + 28);
          g = Math.min(255, g + 22);
          b = Math.min(255, b + 18);
        }
      }
    } else if (mode === 'war') {
      const w = Math.min(1, W.warFront?.[c] || 0);
      const t = Math.min(1, W.tracer?.[c] || 0);
      const built = Math.min(1, W.build?.[c] || 0);
      r = 14 + built * 40 + Math.pow(w, 0.5) * 210 + t * 190;
      g = 16 + built * 40 + w * 70 + t * 226;
      b = 20 + built * 46 + t * 255;
    } else if (mode === 'casualty') {
      // Deliberately ugly (§194) — muddy grey-red, no pretty gradients.
      const cas = Math.min(1, W.casualty?.[c] || 0);
      const fought = Math.min(1, (W.fought?.[c] || 0) / 40);
      const k = Math.max(cas, fought * 0.6);
      r = 40 + k * 140;
      g = 28 + k * 20;
      b = 28 + k * 18;
    } else if (mode === 'warfront') {
      const fd = W.frontDir?.[c] || 0;
      const fought = Math.min(1, (W.fought?.[c] || 0) / 20);
      if (fought < 0.05 && Math.abs(fd) < 0.01) {
        r = r * 0.35; g = g * 0.35; b = b * 0.38;
      } else {
        const push = Math.max(-1, Math.min(1, fd));
        r = 30 + fought * 80 + Math.max(0, push) * 160;
        g = 40 + fought * 60 + (1 - Math.abs(push)) * 40;
        b = 50 + fought * 40 + Math.max(0, -push) * 160;
      }
    } else if (mode === 'beings') {
      /* Animal density from `W.beingDens`, which `rebuildBuckets` fills as it
         walks the population. Deliberately steep at the low end: one animal in
         a cell should be findable, and eight should be obvious. */
      const d = Math.min(1, (W.beingDens?.[c] || 0));
      const land = W.h[c] >= W.seaLevel;
      const base = land ? 22 : 14;
      const k = Math.pow(d, 0.55);
      r = base + k * 250;
      g = base + k * 190;
      b = base + k * 70;
    } else if (mode === 'cape') {
      const cp = W.cape?.[c] || 0;
      const k = Math.min(1, cp / 3000);
      r = 14 + k * 240; g = 20 + (1 - k) * 50 + k * 90; b = 28 + (1 - k) * 60;
    } else if (mode === 'ascent') {
      /* VIZ40: diverging scale — rising warm (red/orange), sinking cool (blue). */
      const asc = W.ascent?.[c] || 0;
      if (asc > 0) {
        const k = Math.min(1, asc * 3);
        r = 40 + k * 210; g = 40 + k * 80 - k * k * 40; b = 40;
      } else {
        const k = Math.min(1, -asc * 3);
        r = 40; g = 40 + k * 60; b = 60 + k * 190;
      }
    } else if (mode === 'droughtMap') {
      const d = W.drought?.[c] || 0;
      const land = W.h[c] >= W.seaLevel;
      if (land) {
        r = 30 + d * 210; g = 40 + (1 - d) * 50; b = 20 + (1 - d) * 30;
      } else {
        r = 10; g = 14; b = 20;
      }
    } else if (mode === 'pwat') {
      const pw = W.pwat?.[c] || 0;
      const k = Math.min(1, pw / 60);
      r = 14 + k * 30; g = 28 + k * 120; b = 60 + k * 180;
    } else if (mode === 'cin') {
      const ci = W.cin?.[c] || 0;
      const k = Math.min(1, ci / 400);
      r = 14 + k * 220; g = 28 + (1 - k) * 60; b = 60 + (1 - k) * 140;
    } else if (mode === 'rainrate') {
      const rr = Math.min(1, (W.rainMmHr?.[c] || 0) / 80);
      r = 14 + rr * 40; g = 28 + rr * 100; b = 80 + rr * 170;
    } else if (mode === 'flood') {
      const fl = W.floodRisk?.[c] || 0;
      const land = W.h[c] >= W.seaLevel;
      if (land) {
        r = 20 + fl * 230; g = 30 + (1 - fl) * 40; b = 20 + (1 - fl) * 20;
      } else {
        r = 8; g = 12; b = 18;
      }
    } else if (mode === 'precipconv') {
      const pc = W.precipConv?.[c] || 0;
      const k = Math.min(1, pc * 12);
      r = 14 + k * 200; g = 20 + k * 140; b = 40 + (1 - k) * 60;
    } else if (mode === 'weather') {
      /* Everything the sky is doing, in one frame. The individual fields already
         have overlays; none of them is what a player means by "the weather". */
      const cl = Math.min(1, W.clouds?.[c] || 0);
      const pr = Math.min(1, (W.precip?.[c] || 0) * 6);
      const st = Math.min(1, W.stormField?.[c] || 0);
      const fl = Math.min(1, W.flash?.[c] || 0);
      r = 16 + cl * 120;
      g = 20 + cl * 126;
      b = 30 + cl * 140;
      // Rain cools the patch toward blue; a cyclone core goes bright white.
      r = r * (1 - pr * 0.55); g = g * (1 - pr * 0.2); b = b + pr * 110;
      r += st * 150; g += st * 160; b += st * 170;
      // Lightning last so a bolt is never washed out by the cloud under it.
      r += fl * 240; g += fl * 235; b += fl * 120;
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
    } else if (mode === 'trophic') {
      const p = W.trophProd?.[c] || 0;
      const h = W.trophHerb?.[c] || 0;
      const k = W.trophCarn?.[c] || 0;
      r = 12 + k * 240 + h * 40;
      g = 16 + p * 180 + h * 90;
      b = 18 + p * 40;
    } else if (mode === 'fear') {
      const f = W.preyFear?.[c] || 0;
      r = 18 + f * 220;
      g = 12 + f * 40;
      b = 22 + f * 90;
    } else if (mode === 'carcass') {
      const k = W.carcassField?.[c] || 0;
      r = 20 + k * 160;
      g = 14 + k * 50;
      b = 10 + k * 20;
    } else if (mode === 'trail') {
      const tr = W.trail?.[c] || 0;
      r = 22 + tr * 90;
      g = 18 + tr * 70;
      b = 14 + tr * 40;
    } else if (mode === 'lifefront') {
      const f = W.lifeFront?.[c] || 0;
      const L = W.life?.[c] || 0;
      r = 8 + L * 20 + f * 40;
      g = 14 + L * 90 + f * 200;
      b = 18 + L * 40 + f * 60;
    } else if (mode === 'flux') {
      const fx = W.lifeFlux?.[c] || 0;
      if (fx >= 0) {
        r = 12 + fx * 40;
        g = 18 + fx * 220;
        b = 22 + fx * 80;
      } else {
        const m = -fx;
        r = 18 + m * 200;
        g = 10 + m * 30;
        b = 28 + m * 140;
      }
    } else if (mode === 'reflectivity') {
      /* VIZ23: radar-like stepped scale: green→yellow→red→purple. */
      const rr = Math.min(1, (W.rainMmHr?.[c] || 0) / 100 + (W.precip?.[c] || 0) * 2);
      if (rr < 0.2) { r = 14; g = 20 + rr * 500; b = 14; }
      else if (rr < 0.45) { const t = (rr - 0.2) / 0.25; r = 14 + t * 240; g = 120 + t * 130; b = 14; }
      else if (rr < 0.7) { const t = (rr - 0.45) / 0.25; r = 255; g = 250 - t * 210; b = 14; }
      else { const t = (rr - 0.7) / 0.3; r = 255 - t * 100; g = 40; b = 40 + t * 180; }
    } else if (mode === 'ircloud') {
      /* VIZ24: IR cloud proxy — cold tops bright, warm ground dark. */
      const cl = W.clouds?.[c] || 0;
      const lcl = W.lclKm?.[c] || 0;
      const k = Math.min(1, cl * (0.5 + lcl * 0.12));
      r = 240 - k * 200; g = 240 - k * 190; b = 255 - k * 140;
    } else if (mode === 'wv') {
      /* VIZ25: water vapour channel from pwat. */
      const pw = W.pwat?.[c] || 0;
      const k = Math.min(1, pw / 50);
      r = 10 + (1 - k) * 30; g = 20 + k * 180; b = 15 + k * 40;
    } else if (mode === 'stp') {
      const s = Math.min(1, (W.stp?.[c] || 0) / 3);
      r = 14 + s * 240; g = 20 + (1 - s) * 40 + s * 60; b = 28 + (1 - s) * 50;
    } else if (mode === 'shear01') {
      const s = Math.min(1, (W.shear01?.[c] || 0) * 2);
      r = 14 + s * 200; g = 30 + s * 100; b = 50 + (1 - s) * 40;
    } else if (mode === 'outlook') {
      const cat = W.severeOutlook?.[c] || 0;
      if (cat >= 5) { r = 255; g = 40; b = 220; }
      else if (cat >= 4) { r = 255; g = 40; b = 40; }
      else if (cat >= 3) { r = 255; g = 140; b = 40; }
      else if (cat >= 2) { r = 255; g = 220; b = 40; }
      else if (cat >= 1) { r = 80; g = 200; b = 80; }
      else { r = r * 0.2; g = g * 0.2; b = b * 0.22; }
    }
    vDat[o] = r | 0; vDat[o + 1] = g | 0; vDat[o + 2] = b | 0;
  }
}

export function markTouch(W, cell, radiusCells = 2) {
  if (!W.touchMap) W.touchMap = new Float32Array(W.life.length);
  W.touchMap[cell] = Math.min(1, (W.touchMap[cell] || 0) + 0.35);
}
