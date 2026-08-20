/** Presentation clock, day phase, and a shared description of a cell.
 *  Living backlog: preclock, dielfield, tileframe. Simulation-free —
 *  nothing here writes world fields, so the golden run is untouched. */

import { NC, DIR, NBR } from '../sphere.js';
import { W } from '../world.js';
import { BIOMES } from './ecology.js';
import { lifeRGB, oceanLifeRGB, lifeLabel, dominantGuildAt, GUILD_RGB } from './lifeColour.js';
import { isSubmerged, cellElev } from './cellSurface.js';
import { currentSentence } from './ocean.js';
import { usesWhittakerCover } from './planetKind.js';
import { featureAt } from './definition.js';

let _t = 0;
let _reduced = false;
let _seedPhase = 0;

const GROUND = {
  tundra: [142, 148, 140],
  boreal: [22, 40, 32],
  tempDeciduous: [36, 58, 28],
  tempRainforest: [18, 48, 30],
  grassland: [92, 102, 48],
  desert: [184, 148, 96],
  savanna: [150, 132, 72],
  tropSeasonal: [28, 58, 28],
  tropRainforest: [14, 36, 22],
  ice: [228, 236, 246],
  reef: [18, 72, 78],
  upwelling: [12, 48, 68],
  gyre: [10, 32, 58],
  vent: [72, 58, 64],
  deep: [6, 14, 24],
};

const SEA = [
  [18, 48, 68], // shallows
  [10, 28, 48],
  [5, 12, 22],
];

export function presentAdvance(dt) {
  if (typeof matchMedia === 'function') {
    try { _reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { _reduced = false; }
  }
  const rate = _reduced ? 0.12 : 1;
  _t += Math.max(0, dt) * rate;
  _seedPhase = ((W.seed | 0) * 2.399 + (W.year | 0) * 0.00017) % (Math.PI * 2);
  wearTick(Math.pow(0.972, Math.max(0.2, dt * 60)));
}

export function presentTime() { return _t; }
export function reducedMotion() { return _reduced; }
export function presentReset() { _t = 0; }

export function hash2(a, b) {
  let h = ((a * 374761393) ^ (b * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function hash01(a, b) {
  return hash2(a, b) / 4294967296;
}

/** Per-stamp phase: seeded offset + global driver. Item 254. */
export function stampPhase(c, i) {
  const h = hash2(c ^ (W.seed | 0), i * 2654435761);
  const local = (h / 4294967296) * Math.PI * 2;
  const rate = 0.65 + ((h >> 8) & 7) * 0.04;
  return local + _seedPhase + _t * rate;
}

/** Only a fraction of stamps are mid-gesture at once. Item 79. */
export function stampActive(c, i) {
  if (_reduced) return false;
  const h = hash2(c, i ^ 0xa11e);
  return ((h >>> 4) & 7) < 3;
}

export function windSway(c, i, cellPx) {
  if (_reduced || !stampActive(c, i)) return [0, 0];
  const wu = W.windU?.[c] || 0;
  const wv = W.windV?.[c] || 0;
  const spd = Math.hypot(wu, wv);
  const amp = Math.min(cellPx * 0.16, (0.6 + spd * 4.5) * Math.max(1, cellPx * 0.04));
  const p = stampPhase(c, i);
  const ux = wu || 0.15;
  const uy = wv || 0.05;
  const len = Math.hypot(ux, uy) || 1;
  return [
    Math.sin(p) * amp * (ux / len),
    Math.cos(p * 0.71) * amp * 0.28 * (uy / len),
  ];
}

/** Cosine of sun at a cell. −1 night … +1 noon. Uses the globe’s own sun. */
export function cellSun(c) {
  if (c < 0) return 0;
  const s = W._sunDir || [1, 0.3, 0];
  return DIR[c * 3] * s[0] + DIR[c * 3 + 1] * s[1] + DIR[c * 3 + 2] * s[2];
}

/** 0 midnight → 0.5 noon, from the presentation sun. */
export function dayPhase() {
  const s = W._sunDir || [1, 0.3, 0];
  return (Math.atan2(s[2], s[0]) / (Math.PI * 2) + 1) % 1;
}

/**
 * Lighting for one cell: exposure, warmth, night, settlement glow.
 * Same sun the globe shader uses — the two views share an instant.
 */
export function cellLight(c) {
  const sun = cellSun(c);
  const dusk = Math.max(0, 1 - Math.abs(sun) * 2.2);
  const expo = sun > 0
    ? 0.52 + sun * 0.58
    : 0.12 + (sun + 1) * 0.16;
  const warm = dusk * (sun > -0.18 ? 1 : 0.4);
  const night = sun < -0.05 ? Math.min(1, -sun) : 0;
  const build = W.build?.[c] || 0;
  const lights = night * (build > 0.12 ? Math.min(1, (build - 0.08) * 1.4) : 0);
  const cloud = W.clouds?.[c] || 0;
  const moon = (W.moon && W.moon.mass > 0.05) ? (W.moonIllum ?? 0.5) : 0;
  return { sun, expo: expo * (1 - cloud * 0.42), warm, night, lights, cloud, moon };
}

export function applyLight(rgb, light, c) {
  let r = rgb[0], g = rgb[1], b = rgb[2];
  const moist = W.moist?.[c] || 0;
  if (moist > 0.45 && W.h[c] >= W.seaLevel) {
    const k = Math.min(0.22, (moist - 0.45) * 0.35);
    r *= 1 - k; g *= 1 - k * 0.85; b *= 1 - k * 0.6;
  }
  r *= light.expo * (1 + light.warm * 0.38);
  g *= light.expo * (1 + light.warm * 0.1);
  b *= light.expo * (1 - light.warm * 0.28);
  if (light.night > 0.2) {
    r = r * (1 - light.night * 0.18) + 14 * light.night;
    g = g * (1 - light.night * 0.12) + 20 * light.night;
    b = b * (1 - light.night * 0.02) + 44 * light.night;
    if (light.moon > 0.04) {
      const m = light.night * light.moon * 0.42;
      r += 22 * m;
      g += 28 * m;
      b += 48 * m;
    }
    const life = W.life?.[c] || 0;
    const bloom = Math.max(life, W.reef?.[c] || 0);
    if (bloom > 0.12) {
      const glow = (bloom - 0.1) * light.night * 0.7;
      r += 10 * glow;
      g += 52 * glow;
      b += 36 * glow;
    }
  }
  if (light.lights > 0) {
    r += 70 * light.lights;
    g += 42 * light.lights;
    b += 14 * light.lights;
  }
  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];
}

/** Green wave / autumn / winter from season × latitude. */
export function seasonAt(c) {
  const lat = DIR[c * 3 + 1];
  const season = W.season || 0;
  const wave = Math.sin(season) * lat;
  return {
    lat, wave,
    spring: Math.max(0, wave),
    autumn: Math.max(0, -wave),
    winter: Math.max(0, -Math.cos(season) * Math.abs(lat)),
  };
}

/** Presentation tide 0–1, twice per globe day. */
export function tidePhase(c = 0) {
  return (Math.sin(_t * 0.11 + (c & 15) * 0.04) * 0.5 + 0.5);
}

let WEAR = null;
const _worn = [];
export function resetWear() {
  WEAR = null;
  _worn.length = 0;
  if (W) W.trail = null;
}
export function noteWear(c, amt = 0.06) {
  if (c < 0) return;
  if (!WEAR || WEAR.length !== NC) {
    WEAR = new Float32Array(NC);
    _worn.length = 0;
  }
  const was = WEAR[c];
  WEAR[c] = Math.min(1, was + amt);
  if (was < 0.01 && WEAR[c] >= 0.01) _worn.push(c);
  W.trail = WEAR;
}
export function wearAt(c) { return WEAR?.[c] || 0; }
export function wearField() { return WEAR; }
export function wearTick(decay = 0.965) {
  if (!WEAR) return;
  W.trail = WEAR;
  for (let i = _worn.length - 1; i >= 0; i--) {
    const c = _worn[i];
    WEAR[c] *= decay;
    if (WEAR[c] < 0.012) { WEAR[c] = 0; _worn.splice(i, 1); }
  }
}

/** Nocturnal kinds stay in at noon; diurnal kinds rest after dusk. */
export function isOutNow(kind, c, id = 0) {
  const sun = cellSun(c);
  const nocturnal = kind === 6 || kind === 15 || ((kind === 8 || kind === 7) && (id & 1));
  if (nocturnal) return sun < 0.12;
  if (kind === 5) return true;
  if (kind >= 6) return sun > -0.18;
  return true;
}

function lerp(a, b, t) { return a + (b - a) * t; }

export function fieldAt(arr, c, alpha) {
  if (!arr) return 0;
  if (alpha == null || alpha >= 0.99) return arr[c] || 0;
  // prev* arrays only exist for temp/life/ice; others snap
  return arr[c] || 0;
}

export function lerpLife(c, alpha = 1) {
  const cur = W.life[c] || 0;
  if (!W.prevLife || alpha >= 0.99) return cur;
  return lerp(W.prevLife[c] || 0, cur, alpha);
}

/**
 * Surface water the eye should see. `flow` is discharge (how much is moving),
 * `lake` is ponded volume, `groundW` is underground and is not a river.
 * Amount is 0–1 opacity/brightness from that quantity — not a binary wash.
 */
export function waterStage(c) {
  const precip = W.precip?.[c] || 0;
  const flow = W.flow?.[c] || 0;
  const lake = W.lake?.[c] || 0;
  const ice = W.ice?.[c] || 0;
  const ground = W.groundW?.[c] || 0;
  if (c < 0) return { stage: 'dry', amount: 0, precip, flow, lake: 0, ground };
  if (isSubmerged(W, c)) {
    const depth = Math.max(0, -cellElev(W, c));
    return {
      stage: 'ocean',
      amount: Math.min(1, 0.18 + depth * 3.4),
      precip, flow, lake: 0, depth, ground,
    };
  }
  if (ice > 0.55) return { stage: 'ice', amount: ice, precip, flow, lake, ground };
  if (lake > 0.5) {
    return {
      stage: 'lake',
      amount: Math.min(1, 0.48 + Math.log1p(flow) * 0.14 + lake * 0.35),
      precip, flow, lake, ground,
    };
  }
  // Trunks only — D8 accumulation used to light up every cell past 0.016.
  if (flow > 2.4) {
    return {
      stage: 'river',
      amount: Math.min(1, 0.22 + Math.log1p(flow) * 0.18),
      precip, flow, lake, ground,
    };
  }
  if (flow > 0.55) {
    return {
      stage: 'stream',
      amount: Math.min(0.55, 0.12 + Math.log1p(flow) * 0.12),
      precip, flow, lake, ground,
    };
  }
  if (lake > 0.22) {
    return {
      stage: 'pond',
      amount: Math.min(0.42, lake * 0.7 + precip * 0.15),
      precip, flow, lake, ground,
    };
  }
  if (precip > 0.22) {
    return {
      stage: 'sheet',
      amount: Math.min(0.22, precip * 0.35),
      precip, flow, lake, ground,
    };
  }
  if (precip > 0.09) return { stage: 'drip', amount: precip * 0.45, precip, flow, lake, ground };
  return { stage: 'dry', amount: 0, precip, flow, lake, ground };
}

/**
 * One description of a cell, consumed by the flat map (and ready for the globe).
 * material / cover / wetness / pigment — not two palettes.
 */
export function describeCell(c, alpha = 1) {
  if (c < 0) {
    return {
      sea: false, depth: 0, ice: 0, life: 0, moist: 0, build: 0,
      biome: '', rgb: [10, 12, 18], material: 'void', wetness: 0, cover: 0,
      water: { stage: 'dry', amount: 0, precip: 0, flow: 0, lake: 0, ground: 0 },
    };
  }
  const sea = isSubmerged(W, c);
  const depth = sea ? Math.max(0, -cellElev(W, c)) : 0;
  const ice = W.ice[c] || 0;
  const life = lerpLife(c, alpha);
  const moist = W.moist[c] || 0;
  const build = W.build[c] || 0;
  const biome = W.biome ? (BIOMES[W.biome[c]] || '') : '';
  const dust = W.dust?.[c] || 0;
  const ash = W.ash?.[c] || 0;
  const precip = W.precip?.[c] || 0;
  const reef = W.reef?.[c] || 0;
  const kind = W._planetKind;
  const look = !usesWhittakerCover(kind, W);

  let rgb;
  let material = 'soil';
  if (look) {
    const extra = {
      lava: W.lava?.[c] || 0,
      vent: W.shellVent?.[c] || 0,
      rock: W.rock?.[c] || 0,
      dust,
      lat: Math.abs(DIR[c * 3 + 1]),
      x: DIR[c * 3],
      y: DIR[c * 3 + 1],
      z: DIR[c * 3 + 2],
    };
    const R = W.rule || {};
    if (sea) {
      material = kind === 'titan' ? 'methane' : (ice > 0.4 ? 'seaice' : 'ocean');
      const d = Math.min(1, depth * 1.9);
      rgb = (typeof R.ocean === 'function' ? R.ocean(1 - d, extra) : [20, 28, 40]).slice();
      const bloom = Math.max(life, reef);
      if (bloom > 0.12) {
        const live = oceanLifeRGB(W, c, Math.min(1, bloom));
        if (live) {
          rgb = [
            lerp(rgb[0], live[0], 0.45),
            lerp(rgb[1], live[1], 0.45),
            lerp(rgb[2], live[2], 0.45),
          ];
        }
      }
    } else {
      const e = (W.h[c] - (W.seaLevel || 0)) / (1 - (W.seaLevel || 0) + 1e-6);
      rgb = (typeof R.land === 'function' ? R.land(W.temp[c], moist, life, e, ice, extra) : [120, 110, 100]).slice();
      material = ice > 0.55 ? 'snow' : 'rock';
      const live = lifeRGB(W, c, life);
      if (live && life > 0.12 && (W._iceShell || kind === 'titan' || dominantGuildAt(W, c))) {
        const k = Math.min(0.55, (life - 0.12) * 0.8);
        rgb = [lerp(rgb[0], live[0], k), lerp(rgb[1], live[1], k), lerp(rgb[2], live[2], k)];
        material = 'cover';
      }
    }
  } else if (sea) {
    material = ice > 0.4 ? 'seaice' : depth < 0.06 ? 'shallows' : depth < 0.15 ? 'shelf' : 'ocean';
    const bloom = Math.max(life, reef);
    if (bloom > 0.12) rgb = oceanLifeRGB(W, c, Math.min(1, bloom)).slice();
    else rgb = (SEA[material === 'shallows' ? 0 : material === 'shelf' ? 1 : 2]).slice();
  } else if (ice > 0.45) {
    material = ice > 0.8 ? 'glacier' : 'snow';
    rgb = [216, 228, 240];
  } else if (build > 0.15) {
    material = build > 0.55 ? 'town' : 'camp';
    const k = Math.min(1, build);
    rgb = [(168 - k * 70) | 0, (148 - k * 55) | 0, (120 - k * 40) | 0];
  } else {
    const live = lifeRGB(W, c, life);
    if (live) {
      rgb = live.slice();
      material = life > 0.45 ? 'canopy' : 'cover';
    } else {
      rgb = (GROUND[biome] || GROUND.grassland).slice();
      if (biome === 'desert' || moist < 0.18) material = 'sand';
      else if (biome === 'tundra' || biome === 'boreal') material = 'tundra';
      else material = 'soil';
    }
  }
  if (look) {
    const frost = W.frost?.[c] || 0;
    if (frost > 0.06 && rgb) {
      const k = Math.min(1, frost) * 0.85;
      rgb = [lerp(rgb[0], 235, k), lerp(rgb[1], 242, k), lerp(rgb[2], 250, k)];
      material = 'frost';
    } else if ((W.lag?.[c] || 0) > 0.15 && rgb) {
      const k = Math.min(1, W.lag[c]) * 0.7;
      rgb = [lerp(rgb[0], 50, k), lerp(rgb[1], 38, k), lerp(rgb[2], 32, k)];
      material = 'lag';
    }
  }
  if (dust > 0.12) {
    const k = Math.min(0.55, dust * 0.6);
    rgb = [lerp(rgb[0], 180, k), lerp(rgb[1], 140, k), lerp(rgb[2], 90, k)];
  }
  if (ash > 0.1) {
    const k = Math.min(0.5, ash * 0.55);
    rgb = [lerp(rgb[0], 55, k), lerp(rgb[1], 52, k), lerp(rgb[2], 48, k)];
  }
  if (!look && !sea && ice < 0.4) {
    const ph = seasonAt(c);
    if (ph.autumn > 0.28 && (biome === 'tempDeciduous' || biome === 'boreal' || biome === 'tempRainforest')) {
      const k = Math.min(0.48, ph.autumn * 0.55) * Math.min(1, life * 2.2);
      rgb = [lerp(rgb[0], 196, k), lerp(rgb[1], 108, k), lerp(rgb[2], 40, k)];
    } else if (ph.winter > 0.4 && life > 0.08) {
      const k = Math.min(0.28, ph.winter * 0.35);
      rgb = [lerp(rgb[0], 168, k), lerp(rgb[1], 160, k), lerp(rgb[2], 148, k)];
    }
    const inter = W.intertidal?.[c] || 0;
    if (inter > 0.1) {
      const wet = tidePhase(c);
      const k = inter * (0.22 + wet * 0.5);
      rgb = [lerp(rgb[0], 150 + wet * 28, k), lerp(rgb[1], 118 + wet * 16, k), lerp(rgb[2], 68, k)];
    }
  }

  const cover = sea ? Math.min(1, reef * 1.2) : Math.min(1, life * 1.15);
  const wetness = sea ? 1 : Math.min(1, moist * 0.85 + precip * 0.4);
  const water = waterStage(c);

  return {
    sea, depth, ice, life, moist, build, biome, rgb, material, wetness, cover,
    dust, ash, precip, reef, guild: dominantGuildAt(W, c), water,
  };
}

export function mixGuild(rgb, c, highlightGuild) {
  if (!highlightGuild || !W.guildDens?.[highlightGuild]) return rgb;
  const dens = W.guildDens[highlightGuild][c] || 0;
  if (dens > 0.06) {
    const g = GUILD_RGB[highlightGuild];
    if (!g) return rgb;
    const k = 0.45 + dens * 0.5;
    return [
      rgb[0] * (1 - k) + g[0] * k,
      rgb[1] * (1 - k) + g[1] * k,
      rgb[2] * (1 - k) + g[2] * k,
    ];
  }
  return [rgb[0] * 0.35, rgb[1] * 0.35, rgb[2] * 0.38];
}

const PLACE_KM = [
  [400, 'city-scale'],
  [900, 'country-scale'],
  [2000, '≈ Great Britain'],
  [3500, '≈ the Mediterranean'],
  [5200, '≈ Australia'],
  [8000, '≈ Africa'],
];

const GENERIC_KM = [
  [400, 'city-scale'],
  [2000, 'regional'],
  [6000, 'continental'],
  [12000, 'hemisphere'],
];

export function cellWidthKm() {
  const R = W.radiusKm || W.rule?.radiusKm || 6371;
  return Math.sqrt((4 * Math.PI * R * R) / NC);
}

/** Width of the local map window in km. Earth place names are scale hints, not locations. */
export function patchScale(side, rule = W?.rule) {
  const km = cellWidthKm() * side;
  const earthLike = !!(rule?.earthLike || rule?.daisyworld);
  const tiers = earthLike ? PLACE_KM : GENERIC_KM;
  let named = earthLike ? 'a hemisphere' : 'hemisphere';
  for (const [lim, n] of tiers) {
    if (km < lim) { named = n; break; }
  }
  return { km, cellKm: cellWidthKm(), named, side, earthLike };
}

/** A sentence about a cell — the same data as the status strip, in words. */
export function placeSentence(c) {
  if (c < 0) return '';
  const d = describeCell(c, 1);
  const label = lifeLabel(W, c);
  const bits = [];
  if (d.sea) {
    if (d.reef > 0.2) bits.push('a reef in ' + (d.depth < 0.08 ? 'the shallows' : 'clear water'));
    else if (d.biome === 'vent') bits.push('a vent field');
    else if (d.biome === 'upwelling') bits.push('an upwelling');
    else if (d.ice > 0.35) bits.push('sea ice');
    else bits.push(d.depth < 0.08 ? 'shallow sea' : 'open ocean');
    const cur = currentSentence(W, c);
    if (cur) bits.push(cur);
    if ((W.waveHt?.[c] || 0) > 0.5) bits.push('a heavy sea');
    if (d.life > 0.15) {
      const landClass = /mammal|reptile|amphibian|arthropod|multicellular/.test(label);
      if (d.reef > 0.2 && landClass) { /* reef already said the cover */ }
      else if (landClass) bits.push(d.guild || 'plankton');
      else bits.push(label);
    }
  }   else {
    const feat = featureAt(W, c);
    if (feat) bits.push(feat.name);
    const biome = d.biome && d.biome !== 'ice' ? d.biome.replace(/([A-Z])/g, ' $1').toLowerCase() : null;
    const kind = W._planetKind;
    if (!usesWhittakerCover(kind, W)) {
      if (d.ice > 0.55 && kind !== 'europa' && kind !== 'enceladus' && kind !== 'titan') bits.push('icebound');
      else if (d.material === 'methane') bits.push('a methane lake');
      else bits.push(kind || 'this ground');
    } else {
      const wet = d.moist < 0.18 ? 'dry' : d.moist > 0.55 ? 'wet' : null;
      const ice = d.ice > 0.45 ? 'icebound' : null;
      const head = [ice, wet, biome].filter(Boolean).join(' ');
      if (head) bits.push(head);
    }
    if (label && label !== 'barren') bits.push(label);
    if (d.build > 0.55) bits.push('a town');
    else if (d.build > 0.25) bits.push('a village');
    else if (d.build > 0.12) bits.push('a camp');
    const stg = d.water?.stage;
    if (stg === 'lake') bits.push('a lake');
    else if (stg === 'river') bits.push('a river');
    else if (stg === 'stream') bits.push('a stream');
    else if (stg === 'pond') bits.push('standing water');
    if ((W.lava?.[c] || 0) > 0.12) bits.push('lava');
    if (W.bound?.[c] === 1 && (W.crust?.[c] || 0) > 0.7) bits.push('a rising range');
  }
  if (W._ensoPhase === 'El Niño' && Math.abs(DIR[c * 3 + 1]) < 0.3) bits.push('El Niño weather');
  else if (W._ensoPhase === 'La Niña' && Math.abs(DIR[c * 3 + 1]) < 0.3) bits.push('La Niña weather');
  if (d.precip > 0.2) bits.push(d.precip > 0.45 ? 'raining' : 'dripping');
  else if (d.dust > 0.2) bits.push('in dust');
  else if (d.ash > 0.15) bits.push('under ash');
  const sun = cellSun(c);
  if (sun < -0.25) {
    const moon = (W.moon && W.moon.mass > 0.05) ? (W.moonIllum ?? 0) : 0;
    bits.push(moon > 0.2 ? 'moonlit' : 'night');
  }
  else if (sun > -0.12 && sun < 0.18) bits.push(sun > 0 ? 'dawn' : 'dusk');
  if (!bits.length) return 'quiet ground';
  const s = bits.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function seaNeighbors(c) {
  const out = [];
  if (c < 0) return out;
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    if (n >= 0 && W.h[n] < W.seaLevel) out.push(n);
  }
  return out;
}

export { GROUND, SEA };
