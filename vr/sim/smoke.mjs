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

console.log(`\nsmoke: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
