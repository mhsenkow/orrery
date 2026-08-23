#!/usr/bin/env node
/** Holistic smoke — panels, overlays, interiors, catalogue wiring.
 *  No WebGL; imports pure modules + chrome HTML shape checks. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { OVERLAYS } from './overlay.js';
import { climatePanelChrome, climateSnapshot } from './climatePanel.js';
import { platesPanelChrome } from './platesPanel.js';
import { INTERIORS, dynamoFromInterior, coreDeskSnapshot } from './core.js';
import { RULESETS } from '../rulesets.js';
import { DOCK_TAB_ICONS, iconSVG } from './god/icons.js';
import { W, generate } from '../world.js';
import { LOCAL_RADII, LOCAL_RADIUS_LABELS } from '../localview.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dir, '../index.html'), 'utf8');
const missingIcon = iconSVG('__no_such_icon__');

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name, detail); }
}

console.log('dock / html chrome');
{
  for (const tab of ['tools', 'god', 'climate', 'rock', 'view', 'lab', 'sandbox']) {
    ok(`dock tab ${tab}`, html.includes(`data-tab="${tab}"`));
    ok(`pane ${tab}`, html.includes(`id="pane-${tab}"`));
  }
  ok('view layers desk', html.includes('data-desk-panel="layers"') && html.includes('id="viewOverlays"'));
  ok('height layer panel', html.includes('id="layerlist"') && html.includes('id="layerflatten"') && html.includes('id="layerblend"'));
  ok('view guides desk', html.includes('id="viewOrbitGuides"'));
  ok('world mode strip', html.includes('id="worldModeStrip"'));
  ok('climate pane', html.includes('id="pane-climate"'));
  ok('rock pane', html.includes('id="pane-rock"'));
  ok('lab station desk', html.includes('data-suite="lab"') && html.includes('data-desk="station"') && html.includes('id="toolsSample"'));
  // The Evil desk: tab, panel and mount point all have to line up or the tools
  // render into nothing and the group silently disappears from the UI.
  ok('evil desk tab', html.includes('data-suite="tools" data-desk="evil"'));
  ok('evil desk panel', html.includes('data-desk-panel="evil"') && html.includes('id="toolsEvil"'));
  ok('lab holds station HUD', html.includes('id="labStation"') && html.includes('id="stats"') && html.includes('id="inspect"'));
  ok('tools has no station desk', !html.includes('data-suite="tools" data-desk="station"'));
}

console.log('icons');
{
  for (const [tab, icon] of Object.entries(DOCK_TAB_ICONS)) {
    ok(`dock icon ${tab}`, iconSVG(icon) !== missingIcon, icon);
  }
  for (const id of ['appear', 'survey', 'slice', 'orbitguides', 'keys', 'core', 'deeptime', 'stormdesk', 'plate']) {
    ok(`icon ${id}`, iconSVG(id) !== missingIcon);
  }
}

console.log('overlays');
{
  const ids = new Set(OVERLAYS.map((o) => o.id));
  for (const need of ['none', 'temp', 'press', 'wind', 'plates', 'bounds', 'crust', 'crustAge', 'tide', 'storm', 'intertidal']) {
    ok(`overlay ${need}`, ids.has(need));
  }
}

console.log('sky / rock chrome');
{
  const sky = climatePanelChrome();
  ok('sky has desks', /data-desk="sky"/.test(sky) && /data-desk="storm"/.test(sky)
    && /data-desk="coast"/.test(sky) && /data-desk="compare"/.test(sky));
  const rock = platesPanelChrome();
  ok('rock has core desk', /data-desk="core"/.test(rock));
  ok('rock has plates desk', /data-desk="plates"/.test(rock));
  ok('rock heat lever', rock.includes('id="rockHeat"'));
  ok('rock field lever', rock.includes('id="rockMag"'));
}

console.log('interior + dynamo');
{
  ok('earth interior', !!INTERIORS.earth);
  ok('icy interior', !!INTERIORS.icy);
  ok('venus interior', !!INTERIORS.venus);
  ok('several interiors', Object.keys(INTERIORS).length >= 8);
  const d = dynamoFromInterior(INTERIORS.earth, 1);
  ok('earth dynamo finite', Number.isFinite(d) && d > 0);
  const dSlow = dynamoFromInterior(INTERIORS.venus, 243);
  ok('slow spin weakens field', dSlow < d);
}

console.log('local map zoom');
{
  ok('eight zoom rungs', LOCAL_RADII.length === 8 && LOCAL_RADIUS_LABELS.length === 8);
  ok('close rung is 5 cells', LOCAL_RADII[0] === 2 && LOCAL_RADIUS_LABELS[0] === '5');
  ok('wide rung is 85 cells', LOCAL_RADII[7] === 42 && LOCAL_RADIUS_LABELS[7] === '85');
  ok('labels are 2r+1', LOCAL_RADII.every((r, i) => LOCAL_RADIUS_LABELS[i] === String(r * 2 + 1)));
}

console.log('world boot + snapshots');
{
  const rule = RULESETS.find((r) => r.id === 'terra') || RULESETS[0];
  generate(20260816, rule);
  ok('world has interior', !!W.interior);
  ok('magnetosphere set', typeof W.magnetosphere === 'number');
  const snap = climateSnapshot(W);
  ok('climate snapshot', snap.day > 0 && snap.cells >= 1);
  const core = coreDeskSnapshot(W);
  ok('core snapshot', !!core && Number.isFinite(core.heatFlow ?? core.dynamo ?? 0));
}

console.log('rulesets carry interiors');
{
  let withInt = 0;
  for (const r of RULESETS) {
    if (r.interior) withInt++;
  }
  ok('some rulesets have interior', withInt >= 3, `${withInt}/${RULESETS.length}`);
}

console.log('Solar System Type fidelity (B47/B49/B53)');
{
  const { changeResolution, simTick } = await import('../world.js');
  const { N } = await import('../sphere.js');
  const { reservoirActive, reservoirTick } = await import('./cover.js');
  const { cycleMaterial, liquidWindow, livePressureBar } = await import('./substrateField.js');
  try { if (N !== 32) changeResolution(32); } catch { void 0; }

  const ares = RULESETS.find((r) => r.id === 'ares');
  generate(20260808, ares);
  ok('Ares reservoir active', reservoirActive(W));
  const p0 = livePressureBar(W);
  W.season = 3 * Math.PI / 2;
  for (let i = 0; i < 48; i++) reservoirTick(W);
  const frozen = 1 - (W._atmScale ?? 1);
  const pW = livePressureBar(W);
  ok('Ares winter freezes ~¼ column (B47)', frozen > 0.08 && frozen <= 0.30, frozen);
  ok('Ares winter pressure drops', pW < p0 * 0.95, `${pW} vs ${p0}`);

  const venus = RULESETS.find((r) => r.id === 'venus');
  generate(20260808, venus);
  for (let i = 0; i < 24; i++) simTick(true);
  ok('Venus near-isothermal (B49)', Math.abs(W._tropPole || 0) < 0.08, W._tropPole);

  const titan = RULESETS.find((r) => r.id === 'titan');
  generate(20260808, titan);
  for (let i = 0; i < 3; i++) simTick(true);
  /* Methane is a working solvent at 1.5 bar and none of this module's
     thermodynamics is methane's, so a Titan column here is a dry one. */
  ok('Titan column is dry', (W.air?.capeMax || 0) < 200, W.air?.capeMax);
  ok('Titan solvent named', /methane/.test(W.air?.solvent || ''), W.air?.solvent);
  const mat = cycleMaterial(W);
  ok('Titan cycle is methane ice (B53)', mat?.id === 'ch4Ice', mat?.id);
  const win = liquidWindow(mat, livePressureBar(W));
  ok('Titan has a liquid CH₄ window', !!win && win.tMin < 100, win);
  const marsWin = liquidWindow(
    (await import('./substrates.js')).SUB_BY_ID.co2Ice,
    0.006,
  );
  ok('Mars CO₂ has no liquid at 6 mbar (B54)', marsWin == null, marsWin);
}

console.log('air column + weather on a live world (AIR/WX)');
{
  /* Runs last, on the N=32 grid the Solar-System block leaves behind: the point
     is the physics, not the resolution, and a coarse grid says it four times
     faster. */
  const { simTick } = await import('../world.js');
  const A = await import('./aircol.js');
  const Wx = await import('./weather.js');
  const rule = RULESETS.find((r) => r.id === 'terra') || RULESETS[0];
  generate(20260808, rule);
  for (let i = 0; i < 8; i++) simTick(true);

  ok('column allocated', W.airT?.length === W.temp.length * A.AIR_LEVELS, String(W.airT?.length));
  ok('column booted', W.air?.boot === true);
  ok('Earth is calibrated', W.air?.calibrated === true);
  /* Earth's severe-weather range. A planet whose peak column cannot reach a
     thousand joules has no thunderstorms; one past ten thousand has a bug. */
  ok('peak CAPE in Earth range', W.air.capeMax > 800 && W.air.capeMax < 9000, W.air.capeMax);
  ok('precipitable water plausible', W.air.pwatMean > 1 && W.air.pwatMean < 90, W.air.pwatMean);

  let bad = 0, cinMax = 0;
  for (let c = 0; c < W.temp.length; c++) {
    if (!Number.isFinite(W.cape[c]) || W.cape[c] < 0) bad++;
    if (!Number.isFinite(W.pwat[c]) || W.pwat[c] < 0) bad++;
    if (Math.abs(W.ascent[c]) > 1.0001) bad++;
    if (W.cin[c] > cinMax) cinMax = W.cin[c];
  }
  ok('column fields finite', bad === 0, String(bad));
  ok('inhibition capped', cinMax <= 800.001, String(cinMax));

  // The drawn sounding must be the same column the tick integrated.
  let hi = 0;
  for (let c = 0; c < W.temp.length; c++) if (W.cape[c] > W.cape[hi]) hi = c;
  const snd = A.soundingAt(W, hi);
  ok('sounding has every level', snd.levels.length === A.AIR_LEVELS);
  ok('sounding descends in pressure',
    snd.levels.every((l, i) => i === 0 || l.pHPa < snd.levels[i - 1].pHPa));
  ok('sounding agrees with the field', Math.abs(snd.cape - W.cape[hi]) < 1,
    `${snd.cape} vs ${W.cape[hi]}`);
  ok('sounding gains height', snd.levels[A.AIR_LEVELS - 1].zKm > snd.levels[0].zKm);
  ok('sounding line reads', A.formatSounding(W, hi).includes('CAPE'));

  ok('weather has its own RNG fork', typeof W.rngWeather === 'function');
  let dBad = 0;
  for (let c = 0; c < W.temp.length; c++) {
    if (W.drought[c] < 0 || W.drought[c] > 1) dBad++;
    if (W.h[c] < W.seaLevel && W.drought[c] !== 0) dBad++;
  }
  ok('drought bounded and dry-land only', dBad === 0, String(dBad));
  ok('severe markers capped', (W.wx.list?.length || 0) <= 6, String(W.wx.list?.length));
  const line = Wx.weatherSnapshot(W).line;
  ok('weather line reads', typeof line === 'string' && line.length > 4, line);

  /* Several things at once, which is the point of carrying convection and
     drought apart from the cyclone tracker. Run it out and count what stands. */
  let everSevere = 0, everDrought = 0;
  for (let i = 0; i < 60; i++) {
    simTick(true);
    if ((W.wx.list?.length || 0) > 0) everSevere++;
    if ((W.wx.droughtFrac || 0) > 0.005) everDrought++;
  }
  ok('severe convection happens', everSevere > 5, `${everSevere}/60 ticks`);
  ok('drought happens', everDrought > 10, `${everDrought}/60 ticks`);

  /* Organised convection (CONV) */
  const Conv = await import('./convect.js');
  ok('convClass exists', Conv.convClassOk(W));
  const wb = Conv.waterBudget(W);
  ok('waterBudget residual finite', Number.isFinite(wb.residual), String(wb.residual));
  ok('waterBudget precip positive', wb.precip >= 0, String(wb.precip));
  ok('virga reduces precip when dry', Conv.virgaReducesPrecip(W));
}

console.log(`\nsmoke: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
