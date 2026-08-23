/** God tools & disasters — brush, receipts, thermo, guilds, sculpt, climate. */

import { clamp, vnoise } from './math.js';
import { NC, DIR, NBR, dirToCell, cellKm } from './sphere.js';
import { W, chronLog, seedLife, serializeRun } from './world.js';
import { injectGas } from './sim/atmo.js';
import { startTsunami } from './sim/hydro.js';
import { coreSample, iceCore } from './sim/instruments.js';
import { describeSubstrate } from './sim/substrateField.js';
import { landformAt, explainForm } from './sim/landform.js';
import {
  BRUSH, paintBrush, beginStroke, undoStroke, redoStroke, canUndo, canRedo,
  startDrag, continueDrag, endDrag, isDragging, previewBrush, brushKm, brushForTier,
  setPinpoint, setBrushInvert, brushInvert,
} from './sim/god/brush.js';
import { addHeight, setHeight, addMask } from './sim/layers.js';
import { issueReceipt, forecastAct, causalChain } from './sim/god/receipt.js';
import { tryPay, pricePreview, setScarcityMode, SCARCITY, scarcityMeta } from './sim/god/economy.js';
import {
  seedGuildAt, seedClassAt, selectedGuild, setSelectedGuild,
  declareRefuge, cullClade, forceTransition, diagnoseBiome, seedRefusal,
} from './sim/god/life.js';
import {
  thickenCrust, thinCrust, paintCrustType, setPlatePole, placePlume,
  carveRiver, setGateway, shiftSeaLevel, stampTerrain, paintSoil, drawRift, forceOrogeny,
  flattenTerrain, smoothTerrain, sharpenTerrain, roughenTerrain,
} from './sim/god/sculpt.js';
import {
  setOrbit, injectAerosol, paintAlbedo, setSolarShade, seedClouds,
  tripOceanConveyor, setMagnetosphere, setMoon, setThermostat, localWeather, settlingTime,
  pulseClimLook, applyTempBump, injectPlayerCO2,
} from './sim/god/climate.js';
import {
  strikeImpact, placeLIP, triggerGRB, stellarFlare, releaseClathrate,
  releasePathogen, theiaImpact,
} from './sim/god/disaster.js';
import { seedStorm, potentialIntensity, stormForecastCone } from './sim/storms.js';
import { liftCap } from './sim/weather.js';
import { igniteFire, fireDanger, flammableAt } from './sim/fire.js';
import { pourToxin, irradiate, seedDisease, openWar, hazardAt } from './sim/anthro.js';
import { launch, detonate, defenceAt, richestTarget, pickLaunchSite, markTrace, PROFILES, defendCell } from './sim/ordnance.js';
import { polityAt, setPlayerPolity, ensurePlayerPolity } from './sim/polity.js';
import { noteAttribution } from './sim/dark.js';
import { darkEnabled } from './sim/darkGate.js';
import { applyMedicalCountermeasures, noteDualUseResearch } from './sim/darkCbr.js';
import { strike as flashCell } from './sim/lightning.js';
import { paintEdifice } from './sim/planetTick.js';
import { maybeReseedJets } from './sim/jets.js';
import { formatPlevel, seenPressureBar, deckAtPressure, tempAtPressureK } from './sim/plevel.js';

export const TOOLS = [
  { id: 'inspect', name: 'Inspect', key: 'q', cost: 0, group: 'see' },
  { id: 'core', name: 'Core sample', key: 'x', cost: 0, group: 'see' },
  { id: 'icecore', name: 'Ice core', key: 'z', cost: 0, group: 'see' },
  { id: 'seedGuild', name: 'Seed guild', key: 'v', cost: 10, group: 'life' },
  { id: 'seed', name: 'Seed class', key: 'V', cost: 10, group: 'life' },
  { id: 'refuge', name: 'Refuge', key: '', cost: 14, group: 'life' },
  { id: 'raise', name: 'Thicken crust', key: 'e', cost: 22, group: 'land', drag: true },
  { id: 'lower', name: 'Thin crust', key: 'f', cost: 18, group: 'land', drag: true },
  { id: 'flatten', name: 'Flatten', key: '', cost: 8, group: 'land', drag: true },
  { id: 'smooth', name: 'Smooth', key: '', cost: 6, group: 'land', drag: true },
  { id: 'sharpen', name: 'Sharpen', key: '', cost: 7, group: 'land', drag: true },
  { id: 'roughen', name: 'Roughen', key: '', cost: 6, group: 'land', drag: true },
  { id: 'crust', name: 'Crust type', key: '', cost: 16, group: 'land', drag: true },
  { id: 'plume', name: 'Mantle plume', key: '', cost: 28, group: 'land' },
  { id: 'plate', name: 'Plate pole', key: '', cost: 45, group: 'land' },
  { id: 'river', name: 'Carve river', key: '', cost: 8, group: 'land', drag: true },
  { id: 'albedo', name: 'Paint albedo', key: '', cost: 10, group: 'clim', drag: true },
  { id: 'solar', name: 'Solar±', key: 't', cost: 40, group: 'clim' },
  { id: 'co2', name: 'CO₂ inject', key: 'c', cost: 25, group: 'clim' },
  { id: 'o2', name: 'O₂ inject', key: 'o', cost: 20, group: 'clim' },
  { id: 'shade', name: 'L1 shade', key: '', cost: 40, group: 'clim' },
  { id: 'aerosol', name: 'Aerosol', key: '', cost: 18, group: 'clim' },
  { id: 'weather', name: 'Local rain', key: '', cost: 5, group: 'clim' },
  { id: 'liftcap', name: 'Lift cap', key: '', cost: 4, group: 'clim' },
  { id: 'meteor', name: 'Meteor', key: 'm', cost: 60, group: 'dis' },
  { id: 'volcano', name: 'Force erupt', key: 'u', cost: 40, group: 'dis' },
  { id: 'lip', name: 'LIP', key: '', cost: 80, group: 'dis' },
  { id: 'quake', name: 'Quake', key: 'g', cost: 28, group: 'dis' },
  { id: 'plague', name: 'Pathogen', key: 'p', cost: 35, group: 'dis' },
  { id: 'ignite', name: 'Ignite', key: 'j', cost: 6, group: 'dis' },
  /* The Evil desk. Everything above in `dis` is something a planet does to
     itself — a rock arrives, a fault slips, a plume rises. None of it has an
     author. These have one. They are grouped apart because the question they ask
     is a different question. */
  { id: 'poison', name: 'Toxin spill', key: '', cost: 14, group: 'evil' },
  { id: 'waste', name: 'Nuclear waste', key: '', cost: 22, group: 'evil' },
  { id: 'nuke', name: 'Warhead', key: '', cost: 90, group: 'evil', irreversible: true },
  { id: 'icbm', name: 'ICBM', key: '', cost: 110, group: 'evil', irreversible: true },
  { id: 'slbm', name: 'SLBM (sea)', key: '', cost: 120, group: 'evil', irreversible: true },
  { id: 'citybuster', name: 'City-buster', key: '', cost: 220, group: 'evil', irreversible: true },
  { id: 'dirty', name: 'Dirty bomb', key: '', cost: 48, group: 'evil', irreversible: true },
  { id: 'emp', name: 'EMP burst', key: '', cost: 85, group: 'evil', irreversible: true },
  { id: 'bio', name: 'Bio warhead', key: '', cost: 95, group: 'evil', irreversible: true },
  { id: 'defend', name: 'Fortify battery', key: '', cost: 35, group: 'evil' },
  { id: 'airstrike', name: 'Drone strike', key: '', cost: 18, group: 'evil' },
  { id: 'swarm', name: 'Drone swarm', key: '', cost: 40, group: 'evil' },
  { id: 'pandemic', name: 'Engineered plague', key: '', cost: 70, group: 'evil', irreversible: true },
  { id: 'war', name: 'Open a war', key: '', cost: 55, group: 'evil' },
  { id: 'claim', name: 'Claim polity', key: '', cost: 0, group: 'evil' },
  { id: 'medical', name: 'Medical countermeasures', key: '', cost: 28, group: 'evil' },
  { id: 'flare', name: 'Solar flare', key: '', cost: 45, group: 'evil' },
  { id: 'ice', name: 'Ice meteor', key: 'i', cost: 30, group: 'dis', drag: true },
  { id: 'tilt', name: 'Tilt axis', key: 'y', cost: 35, group: 'clim' },
  { id: 'spin', name: 'Spin±', key: 'k', cost: 30, group: 'clim' },
  { id: 'moon', name: 'Moon', key: '', cost: 50, group: 'clim' },
  { id: 'buster', name: 'Theia impact', key: 'b', cost: 200, group: 'dis', irreversible: true },
];

export let activeTool = 'inspect';
let _crustOceanic = false;
export function setCrustOceanic(v) { _crustOceanic = !!v; }
export function setTool(id) {
  activeTool = id;
  forecastAct(id, 0);
}

export { BRUSH, brushKm, brushForTier, previewBrush, undoStroke, redoStroke, canUndo, canRedo, paintBrush, setPinpoint, setBrushInvert };
export { pricePreview, setScarcityMode, SCARCITY, scarcityMeta, setSelectedGuild, selectedGuild };

/** Flash + gold stroke so a cell hit reads from orbit for a few frames. */
function markCellHit(cell, power = 1) {
  if (cell < 0) return;
  flashCell(W, cell, power);
  if (!W.strokeMark || W.strokeMark.length !== NC) W.strokeMark = new Float32Array(NC);
  W.strokeMark[cell] = 1;
  for (let k = 0; k < 4; k++) {
    const n = NBR[cell * 4 + k];
    if (n >= 0) W.strokeMark[n] = Math.max(W.strokeMark[n] || 0, 0.55 * power);
  }
  W._strokeTick = W._tickIndex || 0;
}

/** Ray–sphere hit → cell index, or -1. */
export function pickCell(origin, direction, planetPos, planetScale, planetQ) {
  const ocx = (origin[0] - planetPos[0]) / planetScale;
  const ocy = (origin[1] - planetPos[1]) / planetScale;
  const ocz = (origin[2] - planetPos[2]) / planetScale;
  const q = planetQ;
  const ix = -q[0], iy = -q[1], iz = -q[2], iw = q[3];
  const rot = (vx, vy, vz) => {
    const tx = 2 * (iy * vz - iz * vy), ty = 2 * (iz * vx - ix * vz), tz = 2 * (ix * vy - iy * vx);
    return [vx + iw * tx + (iy * tz - iz * ty), vy + iw * ty + (iz * tx - ix * tz), vz + iw * tz + (ix * ty - iy * tx)];
  };
  const o = rot(ocx, ocy, ocz);
  const d0 = rot(direction[0], direction[1], direction[2]);
  const dl = Math.hypot(d0[0], d0[1], d0[2]) || 1;
  const dx = d0[0] / dl, dy = d0[1] / dl, dz = d0[2] / dl;

  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (o[0] * dx + o[1] * dy + o[2] * dz);
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return -1;
  const hx = o[0] + dx * t, hy = o[1] + dy * t, hz = o[2] + dz * t;
  return dirToCell(hx, hy, hz);
}

function payOrFail(tool, mag = 1, opts = {}) {
  const pay = tryPay(tool, mag, opts);
  if (!pay.ok) return { error: pay.error || 'Cannot afford', pay };
  return { pay };
}

/** Continuous drag entry. Item 4. */
export function beginToolDrag(cell) {
  const tool = TOOLS.find((t) => t.id === activeTool);
  if (!tool?.drag || cell < 0) return null;
  const gate = payOrFail(tool.id, 0.5);
  if (gate.error) return gate;

  const apply = dragApplier(tool.id, cell);
  if (!apply) return null;
  const r = startDrag(cell, apply, dragFields(tool.id));
  return { ok: true, tool: tool.id, drag: true, brush: r, pay: gate.pay };
}

export function moveToolDrag(cell) {
  if (!isDragging()) return null;
  const r = continueDrag(cell);
  return r ? { ok: true, brush: r } : null;
}

export function endToolDrag() {
  const d = endDrag();
  if (!d) return null;
  issueReceipt({
    tool: activeTool,
    cell: d.last,
    intent: `Drag ${activeTool}`,
    expected: `${d.cells} cells · ${(d.areaKm2 || 0).toFixed(0)} km² · ${brushKm().toFixed(0)} km brush`,
    units: 'km²',
  });
  return { ok: true, cells: d.cells, areaKm2: d.areaKm2 };
}

function dragApplier(id, origin = 0) {
  let tool = id;
  if (brushInvert()) {
    if (tool === 'raise') tool = 'lower';
    else if (tool === 'lower') tool = 'raise';
  }
  if (W.layerStack?.paintMask && (tool === 'raise' || tool === 'lower')) {
    return (c, f) => addMask(W, c, tool === 'raise' ? 0.22 * f : -0.22 * f);
  }
  if (tool === 'raise') return (c, f) => { W.crust[c] = Math.min(1.8, W.crust[c] + 0.06 * f); addHeight(W, c, 0.08 * f); };
  if (tool === 'lower') return (c, f) => { W.crust[c] = Math.max(0.05, W.crust[c] - 0.06 * f); addHeight(W, c, -0.09 * f); };
  if (id === 'flatten') {
    const target = W.h[origin];
    return (c, f) => { addHeight(W, c, (target - W.h[c]) * 0.45 * f); };
  }
  if (id === 'smooth') return (c, f) => {
    let s = W.h[c], n = 1;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      if (nb < 0) continue;
      s += W.h[nb]; n++;
    }
    addHeight(W, c, (s / n - W.h[c]) * 0.5 * f);
  };
  if (id === 'sharpen') return (c, f) => {
    let s = W.h[c], n = 1;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[c * 4 + k];
      if (nb < 0) continue;
      s += W.h[nb]; n++;
    }
    const mean = s / n;
    setHeight(W, c, mean + (W.h[c] - mean) * (1 + 0.55 * f));
  };
  if (id === 'roughen') return (c, f) => {
    const seed = (W.seed ^ 0x524f5547) >>> 0;
    const n = vnoise(DIR[c * 3] * 46, DIR[c * 3 + 1] * 46, DIR[c * 3 + 2] * 46, seed) * 2 - 1;
    addHeight(W, c, n * 0.035 * f);
  };
  if (id === 'crust') return (c, f) => {
    if (f < 0.3) return;
    if (!W.crustType) W.crustType = new Uint8Array(NC);
    if (_crustOceanic) {
      W.crustType[c] = 1;
      W.crust[c] = Math.min(W.crust[c], 0.28);
    } else {
      W.crustType[c] = 0;
      W.crust[c] = Math.max(W.crust[c], 0.5);
      if (W.h[c] < W.seaLevel + 0.02) setHeight(W, c, W.seaLevel + 0.02);
    }
  };
  if (id === 'ice') return (c, f) => {
    W.temp[c] = Math.max(0, W.temp[c] - 0.15 * f);
    W.iceLand[c] = Math.min(1, W.iceLand[c] + 0.3 * f);
    W.ice[c] = Math.max(W.ice[c], W.iceLand[c]);
  };
  if (id === 'albedo') return (c, f) => { if (!W.albedoPaint) W.albedoPaint = new Float32Array(NC); W.albedoPaint[c] = 0.75; };
  if (id === 'river') return (c, f) => { addHeight(W, c, -0.02 * f); W.flow[c] = Math.max(W.flow[c] || 0, 0.5 * f); };
  return null;
}

function dragFields(id) {
  if (id === 'raise' || id === 'lower') return ['h', 'crust'];
  if (id === 'flatten' || id === 'smooth' || id === 'sharpen' || id === 'roughen') return ['h'];
  if (id === 'crust') return ['h', 'crust'];
  if (id === 'ice') return ['temp', 'ice', 'iceLand'];
  if (id === 'albedo') return ['albedoPaint'];
  return ['h'];
}

export function useToolAt(cell, extra = {}) {
  if (cell < 0) return null;
  const tool = TOOLS.find((t) => t.id === activeTool) || TOOLS[0];
  if (tool.group === 'evil' && !darkEnabled()) {
    return { ok: false, error: 'Dark layer locked — open with ?dark=1' };
  }

  // Irreversible commit gate. Item 6 / 80.
  if (tool.irreversible && !extra.confirm && !extra.commit) {
    return theiaImpact(cell, false);
  }

  // Forecast before commit when requested. Item 87.
  if (extra.forecastOnly) {
    return { ok: true, forecast: forecastAct(tool.id, cell) };
  }

  const withGrain = extra.withGrain || (tool.id === 'ice' && W.meanTemp < 0.4)
    || (tool.id === 'co2' && W.meanTemp < 0.35);
  const gate = payOrFail(tool.id, extra.magnitude ?? 1, { withGrain, againstGrain: extra.againstGrain });
  if (gate.error) return { error: gate.error, pay: gate.pay };

  // Snapshot for receipt “What if I hadn’t” (D59) — Strike / climate / land only.
  if (['ignite', 'meteor', 'nuke', 'raise', 'lower', 'co2', 'solar', 'ice', 'volcano'].includes(tool.id)) {
    try { W._actUndo = serializeRun(); } catch { W._actUndo = null; }
  }

  let result = { ok: true, tool: tool.id, pay: gate.pay };

  switch (tool.id) {
    case 'inspect':
      return { ...inspectCell(cell), ok: true, tool: 'inspect', pay: gate.pay };

    case 'core': {
      const sample = coreSample(W, cell);
      chronLog(W.year, 'core', cell, sample.layers.length, `Core @${cell}`);
      issueReceipt({ tool: 'core', cell, intent: 'Core sample', expected: `${sample.layers.length} strata` });
      return { ok: true, tool: 'core', sample, pay: gate.pay };
    }
    case 'icecore': {
      const sample = iceCore(W, cell);
      chronLog(W.year, 'icecore', cell, sample.ok ? 1 : 0, sample.ok ? 'Ice core' : sample.reason);
      issueReceipt({ tool: 'icecore', cell, intent: 'Ice core', expected: sample.ok ? 'Bubbles + isotopes' : sample.reason });
      if (!sample.ok) {
        return { ok: false, tool: 'icecore', sample, pay: gate.pay, error: sample.reason || 'Ice core failed' };
      }
      return { ok: true, tool: 'icecore', sample, pay: gate.pay };
    }

    case 'solar': {
      const d = extra.delta ?? 0.05;
      setOrbit({ solar: clamp((W._baseSolar || W.solar) + d, 0.3, 2.0) });
      applyTempBump(d * 0.5);
      pulseClimLook('solar', 0.85);
      result.settling = settlingTime('solar');
      result.orbitFlash = true;
      result.said = `Whole planet: star is now ${W.solar.toFixed(2)}×`;
      break;
    }
    case 'co2': {
      const inj = injectPlayerCO2(extra.dose);
      issueReceipt({
        tool: 'co2', cell, intent: 'CO₂ injection',
        expected: causalChain([
          `+${(inj.dose * 1e6 | 0).toLocaleString()} ppm`,
          'ocean acidifies', 'reef stress', 'warming',
        ]),
        delayYr: inj.holdYr, delayLabel: 'Weathering thermostat answering your CO₂',
      });
      chronLog(W.year, 'tool', cell, W.gases.CO2, 'CO₂ injection');
      result.settling = settlingTime('co2');
      result.orbitFlash = true;
      result.said = `Whole planet: CO₂ now ${(inj.ppm | 0).toLocaleString()} ppm — air warming`;
      W.argueResponses.push({ t: W.ageYr, text: 'Silicate weathering will oppose this CO₂ — on a 10⁵ yr clock.', kind: 'argue' });
      break;
    }
    case 'o2':
      injectGas(W, 'O2', 0.02);
      W.ozone = Math.min(1, (W.ozone || 0.5) + 0.06);
      pulseClimLook('o2', 0.7);
      issueReceipt({ tool: 'o2', cell, intent: 'O₂ injection', expected: `O₂ → ${(W.gases.O2 * 100).toFixed(1)}%` });
      chronLog(W.year, 'tool', cell, W.gases.O2, 'O₂ injection');
      result.orbitFlash = true;
      result.said = `Whole planet: O₂ now ${(W.gases.O2 * 100).toFixed(1)}%`;
      break;

    case 'seedGuild': {
      const r = seedGuildAt(cell, extra.guild || selectedGuild);
      if (r.refused) return { ...r, pay: gate.pay, said: r.note || 'Life refused this cell' };
      result = { ...result, ...r, said: `Seeded ${r.guild || extra.guild || selectedGuild} here` };
      break;
    }
    case 'seed':
      seedClassAt(cell);
      result.said = 'A new class took root here';
      break;
    case 'refuge':
      declareRefuge(cell);
      result.said = 'Refuge declared — extinction skips this cell';
      break;

    case 'raise':
      thickenCrust(cell, 0.12);
      result.said = 'Mountain growing here';
      break;
    case 'lower':
      thinCrust(cell, 0.12);
      result.said = 'Basin sinking here';
      break;
    case 'flatten':
      flattenTerrain(cell);
      result.said = 'Terraced to this height';
      break;
    case 'smooth':
      smoothTerrain(cell);
      result.said = 'Relief softened';
      break;
    case 'sharpen':
      sharpenTerrain(cell);
      result.said = 'Ridges steepened';
      break;
    case 'roughen':
      roughenTerrain(cell);
      result.said = 'Fine relief added';
      break;
    case 'crust':
      paintCrustType(cell, !!extra.oceanic);
      result.said = extra.oceanic ? 'Oceanic crust — will subduct' : 'Continental crust painted';
      break;
    case 'plume':
      placePlume(cell);
      result.said = 'Hotspot planted in the mantle — island chain later';
      break;
    case 'plate':
      setPlatePole(cell);
      result.said = 'This plate’s pole moved — geography will rewrite';
      break;
    case 'river':
      carveRiver(cell);
      result.said = 'Channel cut — flow will keep or abandon it';
      break;
    case 'albedo':
      paintAlbedo(cell, extra.albedo ?? 0.7);
      markCellHit(cell, 0.7);
      result.said = 'Surface whitened here';
      break;
    case 'shade':
      setSolarShade(extra.fraction ?? Math.min(0.12, (W.solarShade || 0) + 0.02));
      applyTempBump(-0.025);
      pulseClimLook('shade', 1);
      result.orbitFlash = true;
      result.said = `Whole planet: ${((W.solarShade || 0) * 100).toFixed(0)}% of sunlight blocked`;
      break;
    case 'aerosol':
      injectAerosol(0.07, extra.hemi ?? 0);
      pulseClimLook('aerosol', 1.15);
      applyTempBump(-0.02);
      result.orbitFlash = true;
      result.said = 'Whole planet: sulphate haze injected — sky yellows, cools';
      break;
    case 'weather': {
      // Prefer seeding a named storm when conditions allow; else local rain
      const seeded = seedStorm(W, cell, {});
      if (seeded?.ok) {
        result = { ...result, ...seeded, note: seeded.note };
        result.said = seeded.note || 'Storm seeded here';
      } else {
        localWeather(cell, extra.kind || 'rain');
        result.said = seeded?.note ? `Rain · ${seeded.note}` : 'Rain clouds stacking here';
        if (seeded?.note) result.note = `Rain · ${seeded.note}`;
      }
      markCellHit(cell, 0.85);
      break;
    }

    case 'liftcap':
      liftCap(W, cell);
      chronLog(W.year, 'tool', cell, 1, 'Lift cap — CIN cleared locally');
      result.said = 'Cap lifted — CIN cleared, convection can fire';
      markCellHit(cell, 0.5);
      break;

    case 'meteor':
      result = { ...result, ...strikeImpact(cell, {
        mass: extra.mass ?? 1,
        velocity: extra.velocity ?? (extra.power ?? 0.8),
        density: extra.density ?? 1,
        angle: extra.angle ?? 45,
      }), said: 'Impact crater here' };
      markCellHit(cell, 1.25);
      break;
    case 'ice':
      beginStroke(['temp', 'ice', 'iceLand']);
      paintBrush(cell, (c, f) => {
        W.temp[c] = Math.max(0, W.temp[c] - 0.25 * f);
        W.iceLand[c] = Math.min(1, W.iceLand[c] + 0.4 * f);
        W.ice[c] = Math.max(W.ice[c], W.iceLand[c]);
      });
      /* A comet arriving, not a paint stroke. Same entry track and flash as a
         rock impact — the difference is what it leaves, which is water. */
      markTrace(W, cell, 1.2);
      for (let k = 0; k < 4; k++) markTrace(W, NBR[cell * 4 + k], 0.55);
      markCellHit(cell, 1.1);
      W.gases.H2O = Math.min(0.2, W.gases.H2O + 0.01);
      issueReceipt({ tool: 'ice', cell, intent: 'Ice meteor', expected: 'Local freeze · H₂O up' });
      chronLog(W.year, 'tool', cell, 1, 'Ice meteor');
      result.said = 'Ice dumped here — freeze spreading';
      break;
    case 'volcano':
      W.volcanoes.push({ cell, magma: 1.5, next: 0, silica: 0.48, vol: 1.2, roof: 0.7, volatiles: 0.3 });
      W.ash[cell] = 1;
      if (W.lava) W.lava[cell] = Math.min(1, (W.lava[cell] || 0) + 0.85);
      paintEdifice(W, cell, 1.1, 0.45, false);
      W.gases.sulphate = Math.min(0.3, W.gases.sulphate + 0.04);
      markCellHit(cell, 1.15);
      issueReceipt({ tool: 'volcano', cell, intent: 'Forced eruption', expected: 'Ash + sulphate aerosol' });
      chronLog(W.year, 'eruption', cell, 1.5, 'Forced eruption');
      result.said = 'Eruption — lava shield and ash here';
      break;
    case 'lip':
      placeLIP(cell, extra.durationMyr ?? 1);
      W.ash[cell] = Math.min(1, (W.ash[cell] || 0) + 0.9);
      if (W.lava) W.lava[cell] = Math.min(1, (W.lava[cell] || 0) + 0.7);
      for (let k = 0; k < 4; k++) {
        const n = NBR[cell * 4 + k];
        W.ash[n] = Math.min(1, (W.ash[n] || 0) + 0.45);
      }
      markCellHit(cell, 1.3);
      result.said = 'LIP ignited — province will outgas for Myr';
      break;
    case 'quake':
      W.strain[cell] = 0;
      W.h[cell] -= 0.12;
      startTsunami(W, cell, 0.7);
      markCellHit(cell, 1);
      issueReceipt({ tool: 'quake', cell, intent: 'Quake', expected: 'Tsunami launched' });
      chronLog(W.year, 'quake', cell, 1, 'Triggered quake');
      result.said = 'Quake — coast dropped, tsunami running';
      break;
    case 'plague': {
      releasePathogen(extra);
      seedDisease(W, cell, {
        virulence: extra.virulence ?? 0.6,
        transmit: extra.transmit ?? 0.5,
        name: 'pathogen',
      });
      markCellHit(cell, 0.9);
      result.said = 'Pathogen released — spreads along hosts';
      break;
    }
    case 'ignite': {
      // Cheapest disaster in the table on purpose: fire is the one the player
      // should try twice — once in the wet season and once in the dry.
      const lit = igniteFire(W, cell, extra.power ?? 1, extra.radius ?? 1);
      const danger = fireDanger(W, cell);
      if (!lit) {
        result.said = flammableAt(W, cell)
          ? 'Already burning here'
          : (W.h[cell] < W.seaLevel ? 'Water does not burn'
            : W.life[cell] < 0.1 ? 'Nothing here to burn'
              : 'Too wet or too frozen to catch');
        markCellHit(cell, 0.4);
      } else {
        issueReceipt({
          tool: 'ignite', cell, intent: 'Ignite',
          expected: `Fire spreads while danger stays above ~0.12 (here ${danger.toFixed(2)})`,
        });
        chronLog(W.year, 'fire', cell, danger, `Fire set (danger ${danger.toFixed(2)})`);
        result.said = `Alight — ${lit} cell${lit > 1 ? 's' : ''} burning, danger ${danger.toFixed(2)}`;
        markCellHit(cell, 1.05);
      }
      result.fireLit = lit;
      result.fireDanger = danger;
      break;
    }
    case 'tilt': {
      const next = clamp(W.obliquity + (extra.delta ?? 0.1), 0, 0.8);
      setOrbit({ obliquity: next });
      pulseClimLook('tilt', 0.5);
      result.obliquityDeg = (next * 180 / Math.PI);
      result.settling = settlingTime('tilt');
      result.orbitFlash = true;
      issueReceipt({
        tool: 'tilt', cell, intent: 'Tilt axis',
        expected: `Obliquity → ${result.obliquityDeg.toFixed(1)}° · seasons strengthen`,
      });
      chronLog(W.year, 'tool', cell, next, `Tilt → ${result.obliquityDeg.toFixed(1)}°`);
      result.said = `Axis tilted to ${result.obliquityDeg.toFixed(1)}° — seasons shift`;
      break;
    }
    case 'spin': {
      const sign = (W.rotationPeriod || 1) < 0 ? -1 : 1;
      const next = sign * clamp(Math.abs(W.rotationPeriod || 1) * (extra.delta ?? 0.8), 0.15, 40);
      W.rotationPeriod = next;
      if (W.rule) W.rule.rotationPeriod = next;
      maybeReseedJets(W);
      const label = (next < 0 ? '−' : '') + `${Math.abs(next).toFixed(2)}×`;
      pulseClimLook('spin', 0.45);
      issueReceipt({ tool: 'spin', cell, intent: 'Day length', expected: `Day → ${label}` });
      chronLog(W.year, 'tool', cell, next, `Day → ${label}`);
      result.day = next;
      result.orbitFlash = true;
      result.said = `Day length → ${label}`;
      break;
    }
    case 'moon': {
      const has = W.moon && W.moon.mass > 0.1;
      const r = has ? setMoon(0.02, 2.2) : setMoon(1, 1);
      pulseClimLook('moon', 0.6);
      result = { ...result, ...r, orbitFlash: true, note: has ? 'Moon stripped — obliquity will wander' : 'Moon set — axis stabilised' };
      break;
    }
    case 'buster':
      result = { ...result, ...theiaImpact(cell, true) };
      markCellHit(cell, 1.4);
      pulseClimLook('co2', 1.2);
      result.said = result.said || 'Theia-class impact — magma ocean';
      break;

    /* ---- Evil desk ---- */
    case 'poison': {
      pourToxin(W, cell, extra.amount ?? 0.85, 1);
      issueReceipt({
        tool: 'poison', cell, intent: 'Toxin spill',
        expected: 'Life declines for centuries · creeps downhill and downstream · soil holds it',
      });
      noteAttribution(W, 'poison', cell);
      chronLog(W.year, 'war', cell, 0.5, 'Toxins released');
      result.said = 'Poured. Nothing looks wrong yet — that is the point';
      break;
    }
    case 'waste': {
      irradiate(W, cell, extra.amount ?? 0.75, 1);
      issueReceipt({
        tool: 'waste', cell, intent: 'Nuclear waste',
        expected: 'Small area, lethal now, uninhabitable for thousands of ticks',
      });
      noteAttribution(W, 'waste', cell);
      chronLog(W.year, 'war', cell, 0.6, 'Waste dumped');
      result.said = 'Buried here. It will outlast whoever buried it';
      break;
    }
    case 'nuke': {
      // A warhead placed by hand: no flight, no interception, no warning.
      detonate(W, cell, 'nuclear', extra.yield ?? 1, chronLog);
      issueReceipt({
        tool: 'nuke', cell, intent: 'Warhead', irreversible: true,
        expected: 'Flash · firestorm · crater · fallout · grid down across the hemisphere',
      });
      noteAttribution(W, 'nuke', cell);
      result.said = 'Detonated. The lights are going out';
      break;
    }
    case 'icbm':
    case 'slbm':
    case 'citybuster':
    case 'dirty':
    case 'emp':
    case 'bio':
    case 'airstrike':
    case 'swarm': {
      /* Target is the click; silo is inside a rival polity when countries exist
         (dark-400 §12–13), else the old far-build heuristic. */
      const kind = tool.id === 'icbm' ? 'icbm'
        : tool.id === 'slbm' ? 'slbm'
          : tool.id === 'citybuster' ? 'citybuster'
            : tool.id === 'dirty' ? 'dirty'
              : tool.id === 'emp' ? 'emp'
                : tool.id === 'bio' ? 'bio'
                  : tool.id === 'swarm' ? 'drone' : 'cruise';
      const tgtPol = polityAt(W, cell);
      let attacker = W.playerPolity >= 0 ? W.playerPolity : -1;
      if (attacker < 0 && (W.polities || []).length >= 2) {
        let bestB = 0;
        for (const p of W.polities) {
          if (p.id === tgtPol) continue;
          if ((p.build || 0) >= bestB) { bestB = p.build || 0; attacker = p.id; }
        }
      }
      const from = extra.from ?? pickLaunchSite(W, attacker, cell, kind);
      if (from < 0) {
        result.said = 'Nowhere on this planet can launch that yet';
        break;
      }
      const salvo = tool.id === 'swarm' ? 6 : 1;
      const shots = [];
      for (let i = 0; i < salvo; i++) {
        const aim = i === 0 ? cell : NBR[cell * 4 + ((i - 1) & 3)];
        shots.push(launch(W, from, aim, kind, {
          mirv: tool.id === 'icbm' || tool.id === 'citybuster' ? (extra.mirv ?? 2) : 0,
          decoys: extra.decoys | 0,
          depressed: !!extra.depressed,
          fob: !!extra.fob,
          hypersonic: !!extra.hypersonic || kind === 'hypersonic',
          chaff: !!extra.chaff,
          ownerPolity: attacker,
          targetPolity: tgtPol,
        }));
      }
      const ok = shots.filter((x) => x.ok);
      if (!ok.length) {
        result.said = shots[0]?.note || 'No route to target';
        break;
      }
      const def = defenceAt(W, cell);
      const eta = Math.max(...ok.map((x) => x.ticks));
      issueReceipt({
        tool: tool.id, cell, intent: PROFILES[kind].label,
        expected: `${ok.length} inbound · ${eta} ticks out · target defence ${(def * 100).toFixed(0)}%`,
      });
      noteAttribution(W, tool.id, cell);
      chronLog(W.year, 'war', from, 0.4,
        `${ok.length} × ${PROFILES[kind].label} launched`);
      result.inFlight = ok.length;
      result.etaTicks = eta;
      result.said = `Away — ${ok.length} inbound, ${eta} ticks out.`
        + (def > 0.05 ? ` They will try to stop it (${(def * 100).toFixed(0)}%).` : ' Nothing is defending it.');
      break;
    }
    case 'defend': {
      const r = defendCell(W, cell, extra.amount ?? 1);
      if (!r.ok) { result.said = r.note || 'Cannot fortify'; break; }
      issueReceipt({
        tool: 'defend', cell, intent: 'Fortify battery',
        expected: `Magazine at cell ${r.cell} → ${r.stock}`,
      });
      noteAttribution(W, 'defend', cell);
      chronLog(W.year, 'war', cell, 0.2, 'Air defence battery reinforced');
      result.said = `Battery stocked — magazine ${r.stock}`;
      break;
    }
    case 'pandemic': {
      const r = seedDisease(W, cell, {
        virulence: extra.virulence ?? 0.7,
        transmit: extra.transmit ?? 0.75,
        engineered: true,
      });
      issueReceipt({
        tool: 'pandemic', cell, intent: 'Engineered plague', irreversible: true,
        expected: 'Travels between settlements, not across country · burns out where it has been',
      });
      noteAttribution(W, 'pandemic', cell);
      chronLog(W.year, 'plague', cell, r.virulence, 'Engineered plague released');
      result.said = 'Released. It will follow the roads';
      break;
    }
    case 'war': {
      const other = extra.against ?? richestTarget(W, cell);
      if (other < 0) {
        result.said = 'There is nobody here to fight';
        break;
      }
      const r = openWar(W, cell, other, extra.intensity ?? 0.9);
      if (!r.ok) { result.said = r.note; break; }
      issueReceipt({
        tool: 'war', cell, intent: 'War',
        expected: 'A moving front · what is built is unbuilt · fires and chemicals follow',
      });
      noteAttribution(W, 'war', cell);
      chronLog(W.year, 'war', cell, 0.8, 'War opens');
      result.said = 'Declared. The front will move on its own now';
      break;
    }
    case 'claim': {
      // §14 — set player polity to owner of clicked cell, or largest if empty.
      const oid = polityAt(W, cell);
      if (oid >= 0) {
        setPlayerPolity(W, oid);
        const name = W._polityIndex?.get(oid)?.name || `polity ${oid}`;
        noteAttribution(W, 'claim', cell);
        result.said = `You are ${name} now`;
      } else {
        const id = ensurePlayerPolity(W);
        result.said = id >= 0
          ? `Claimed largest polity (${W._polityIndex?.get(id)?.name || id})`
          : 'No polities yet to claim';
      }
      break;
    }
    case 'medical': {
      const effect = applyMedicalCountermeasures(W, cell, extra.amount ?? 0.3);
      noteDualUseResearch(W, cell, 'Field hospital / countermeasures', chronLog);
      issueReceipt({
        tool: 'medical', cell, intent: 'Medical countermeasures',
        expected: 'Lowers disease and resistance · costs a sliver of build',
      });
      noteAttribution(W, 'medical', cell);
      result.said = effect > 0.01
        ? 'Countermeasures deployed — resistance thins here'
        : 'Little disease here to treat';
      break;
    }
    case 'flare':
      result = { ...result, ...stellarFlare(extra.magnitude ?? 1.6) };
      noteAttribution(W, 'flare', cell);
      result.orbitFlash = true;
      result.said = 'The star flares — grid down, aurora to the tropics';
      break;
    default:
      break;
  }

  result.price = pricePreview(tool.id);
  result.forecast = forecastAct(tool.id, cell);
  result.cell = cell;
  if (!result.said) {
    if (tool.group === 'clim') result.said = 'Whole planet lever applied';
    else if (result.note) result.said = result.note;
  }
  return result;
}

export function inspectCell(cell) {
  const refuse = seedRefusal(cell);
  const wind = Math.hypot(W.windU?.[cell] || 0, W.windV?.[cell] || 0);
  return {
    cell,
    h: W.h[cell],
    temp: W.temp[cell],
    moist: W.moist[cell],
    life: W.life[cell],
    lifeClass: W.lifeClass[cell],
    ice: W.ice[cell],
    iceLand: W.iceLand[cell],
    iceSea: W.iceSea[cell],
    plate: W.plateId[cell],
    bound: W.bound[cell],
    age: W.age[cell],
    rock: W.rock[cell],
    flow: W.flow[cell],
    lake: W.lake?.[cell] || 0,
    groundW: W.groundW?.[cell] || 0,
    clouds: W.clouds[cell],
    precip: W.precip?.[cell],
    windU: W.windU?.[cell],
    windV: W.windV?.[cell],
    wind,
    press: W.press?.[cell],
    converg: W.converg?.[cell],
    ore: W.ore[cell],
    soil: W.soil[cell],
    build: W.build[cell],
    seaLevel: W.seaLevel,
    crust: W.crust[cell],
    substrate: W.substrate ? describeSubstrate(W, cell) : undefined,
    landform: (() => {
      const f = landformAt(W, cell);
      return f ? explainForm(f) : undefined;
    })(),
    fire: W.fire?.[cell] || 0,
    hazard: hazardAt(W, cell),
    airDefence: defenceAt(W, cell),
    fireDanger: fireDanger(W, cell),
    nutrientPlume: W.nutrientPlume?.[cell] || 0,
    frost: W.frost?.[cell] || 0,
    lag: W.lag?.[cell] || 0,
    tideHeight: W.tideHeight?.[cell],
    tideRange: W.tideRange?.[cell],
    intertidal: W.intertidal?.[cell],
    tideWet: W.tideWet?.[cell],
    npp: W.npp?.[cell],
    cellKm: Number(cellKm()),
    iceShell: W._iceShell ? {
      lid: W.shellLid?.[cell],
      ocean: W.shellOcean?.[cell],
      mantle: W.shellMantle?.[cell],
      vent: W.shellVent?.[cell],
    } : null,
    seedOk: refuse.ok,
    seedWhy: refuse.reasons,
    biomeGap: diagnoseBiome(cell),
    pSeen: W.pSeen?.[cell],
    plevel: W.noSurface ? formatPlevel(W, cell) : '',
    deck: W.noSurface ? deckAtPressure(W, W.pSeen?.[cell] ?? seenPressureBar(W, cell)).name : '',
    tBarK: W.noSurface ? tempAtPressureK(W, W.pSeen?.[cell] ?? seenPressureBar(W, cell)) : null,
  };
}

/** Finger of God — delete / boost life at cell. */
export function fingerOfGod(cell, mode = 'boost') {
  if (cell < 0) return;
  if (mode === 'delete') {
    paintBrush(cell, (c) => { W.life[c] = 0; });
    chronLog(W.year, 'finger', cell, 0, 'Erased');
  } else {
    seedGuildAt(cell);
  }
}

// Re-export advanced acts for UI panels
export { igniteFire, fireDanger };
export { pourToxin, irradiate, seedDisease, openWar, launch, detonate, defenceAt, defendCell };
export {
  setPlatePole, placePlume, setGateway, shiftSeaLevel, stampTerrain, paintSoil,
  paintCrustType, drawRift, forceOrogeny, cullClade, forceTransition,
  triggerGRB, stellarFlare, releaseClathrate, setMagnetosphere, setMoon,
  setThermostat, tripOceanConveyor, setOrbit,
};
