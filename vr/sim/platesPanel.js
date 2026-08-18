/** Rock suite — plates, boundaries, hotspots, crust age.
 *  Makes the existing tectonics model legible and steerable. */

import { W, chronLog } from '../world.js';
import { iconSVG } from './god/icons.js';
import { setPlatePole, placePlume, drawRift, forceOrogeny, shiftSeaLevel } from './god/sculpt.js';
import {
  platesDeskSnapshot, tectonicsAtCell, plateName, nudgePlateOmega,
  reclassifyBoundaries, ensurePlateNames,
} from './tectonics.js';
import { coreDeskSnapshot, applyInterior, dynamoFromInterior } from './core.js';
import { setMagnetosphere } from './god/climate.js';

let activeDesk = 'plates';
let selectedPlateId = 0;

function deskTab(id, icon, label, title) {
  return `<button type="button" class="clim-desk-tab" data-desk="${id}" title="${title}" aria-pressed="${id === 'plates' ? 'true' : 'false'}">${iconSVG(icon)}<span class="btn-label">${label}</span></button>`;
}

export function platesPanelChrome() {
  return `
    <p class="god-lead">
      Cores drive dynamos; dynamos shield air; heat drives plates.
    </p>

    <div class="clim-desks" role="tablist" aria-label="Rock desks">
      ${deskTab('core', 'core', 'Core', 'Interior · dynamo · magnetosphere')}
      ${deskTab('plates', 'plate', 'Plates', 'Named plates · redirect Euler poles')}
      ${deskTab('bounds', 'quake', 'Bounds', 'Divergent · convergent · transform')}
      ${deskTab('fire', 'volcano', 'Fire', 'Arcs, plumes, volcanoes')}
      ${deskTab('age', 'deeptime', 'Age', 'Crust thickness and seafloor age')}
    </div>

    <div class="clim-desk" data-desk-panel="core" role="tabpanel" hidden>
      <div class="clim-strip" id="rockCoreStrip" aria-live="polite"></div>
      <div class="god-block">
        <div class="god-h">${iconSVG('core')}<span>Interior</span></div>
        <div class="clim-explain" id="rockCoreExplain"></div>
        <div class="clim-meter" id="rockCoreMeter"></div>
        <p class="god-note" id="rockCoreNote">Field strength comes from core size × conductivity × heat × spin — not a free knob.</p>
      </div>
      <div class="god-block">
        <div class="god-h">${iconSVG('spin')}<span>Levers</span></div>
        <div class="view-row">
          <label for="rockHeat">Heat</label>
          <input type="range" id="rockHeat" min="5" max="220" value="100" step="5">
          <span class="val" id="rockHeatVal">1.00</span>
        </div>
        <div class="view-row">
          <label for="rockMag">Field</label>
          <input type="range" id="rockMag" min="0" max="200" value="100" step="5">
          <span class="val" id="rockMagVal">1.00</span>
        </div>
        <p class="god-note">Heat wakes volcanoes and plate vigor. Field paints aurora and slows atmospheric escape.</p>
      </div>
    </div>

    <div class="clim-desk on" data-desk-panel="plates" role="tabpanel">
      <div class="clim-strip" id="rockStrip" aria-live="polite"></div>
      <div class="god-block">
        <div class="god-h">${iconSVG('plate')}<span>Plate roster</span></div>
        <div id="rockPlateList" class="clim-list"></div>
        <p class="god-note" id="rockPlateNote">Elevation emerges from crust thickness on the mantle — edit poles, not heights.</p>
      </div>
      <div class="god-block">
        <div class="god-h">${iconSVG('spin')}<span>Steer selected</span></div>
        <div class="tools clim-actions" id="rockPlateActs">
          <button type="button" id="rockPoleAt">${iconSVG('plate')}<span class="btn-label">Pole → inspect</span></button>
          <button type="button" id="rockOmegaUp" title="Faster spin">${iconSVG('spin')}<span class="btn-label">ω+</span></button>
          <button type="button" id="rockOmegaDn" title="Slower / reverse">${iconSVG('spin')}<span class="btn-label">ω−</span></button>
          <button type="button" id="rockOverlayPlates" title="Paint plates on the globe">${iconSVG('tabview')}<span class="btn-label">Plate map</span></button>
        </div>
        <p class="god-note">Redirecting a pole rewrites the next ~200 Myr of geography. Boundaries reclassify immediately.</p>
      </div>
    </div>

    <div class="clim-desk" data-desk-panel="bounds" role="tabpanel" hidden>
      <div class="clim-strip" id="rockBoundStrip" aria-live="polite"></div>
      <div class="god-block">
        <div class="god-h">${iconSVG('quake')}<span>Boundary legend</span></div>
        <div class="clim-explain" id="rockBoundLegend"></div>
        <div class="tools clim-actions">
          <button type="button" id="rockRift">${iconSVG('river')}<span class="btn-label">Draw rift</span></button>
          <button type="button" id="rockOrogeny">${iconSVG('raise')}<span class="btn-label">Force orogeny</span></button>
          <button type="button" id="rockOverlayBounds" title="Paint plate boundaries">${iconSVG('quake')}<span class="btn-label">Bound overlay</span></button>
          <button type="button" id="rockReclass">${iconSVG('refresh')}<span class="btn-label">Reclassify</span></button>
        </div>
        <p class="god-note">Cyan = diverge (ridges) · orange = converge (trenches / ranges) · gold = transform.</p>
      </div>
    </div>

    <div class="clim-desk" data-desk-panel="fire" role="tabpanel" hidden>
      <div class="clim-strip" id="rockFireStrip" aria-live="polite"></div>
      <div class="god-block">
        <div class="god-h">${iconSVG('volcano')}<span>Volcanoes &amp; plumes</span></div>
        <div id="rockFireList" class="clim-list"></div>
        <div class="tools clim-actions">
          <button type="button" id="rockPlume">${iconSVG('plume')}<span class="btn-label">Plant plume</span></button>
          <button type="button" id="rockOverlayCrust" title="Paint crust type">${iconSVG('core')}<span class="btn-label">Crust map</span></button>
        </div>
        <p class="god-note">Hotspots sit in the mantle frame — plates drift over them and leave island chains.</p>
      </div>
    </div>

    <div class="clim-desk" data-desk-panel="age" role="tabpanel" hidden>
      <div class="clim-strip" id="rockAgeStrip" aria-live="polite"></div>
      <div class="god-block">
        <div class="god-h">${iconSVG('core')}<span>Crust &amp; age</span></div>
        <div class="clim-explain" id="rockAgeExplain"></div>
        <div class="tools clim-overlays" id="rockAgeOverlays">
          <button type="button" data-overlay="crust">${iconSVG('core')}<span class="btn-label">Crust</span></button>
          <button type="button" data-overlay="crustAge">${iconSVG('deeptime')}<span class="btn-label">Age</span></button>
          <button type="button" data-overlay="plates">${iconSVG('plate')}<span class="btn-label">Plates</span></button>
          <button type="button" data-overlay="bounds">${iconSVG('quake')}<span class="btn-label">Bounds</span></button>
        </div>
        <p class="god-note">Young seafloor is warm at ridges; old ocean floor sinks.</p>
        <div class="view-row" style="margin-top:8px">
          <label for="rockSea">Sea</label>
          <input type="range" id="rockSea" min="15" max="85" value="40" step="1">
          <span class="val" id="rockSeaVal">0.40</span>
        </div>
        <p class="god-note">Floods or exposes shelves. Ice budget answers the lever.</p>
      </div>
    </div>
  `;
}

function setDesk(id) {
  activeDesk = id;
  document.querySelectorAll('#pane-rock .clim-desk-tab').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.desk === id ? 'true' : 'false');
  });
  document.querySelectorAll('#pane-rock .clim-desk').forEach((p) => {
    const on = p.dataset.deskPanel === id;
    p.classList.toggle('on', on);
    p.hidden = !on;
  });
}

function refreshCoreDesk() {
  const snap = coreDeskSnapshot(W);
  const strip = document.getElementById('rockCoreStrip');
  if (strip) {
    strip.innerHTML = `
      <div class="clim-chip"><span>Core mass</span><b>${(snap.coreMassFrac * 100).toFixed(0)}%</b></div>
      <div class="clim-chip"><span>Core R</span><b>${(snap.coreRadiusFrac * 100).toFixed(0)}%</b></div>
      <div class="clim-chip"><span>Heat</span><b>${snap.heatFlow.toFixed(2)}</b></div>
      <div class="clim-chip"><span>Field</span><b>${(snap.magnetosphere || 0).toFixed(2)}</b></div>
      <div class="clim-chip"><span>Lid</span><b>${snap.lidMode}</b></div>
    `;
  }
  const ex = document.getElementById('rockCoreExplain');
  if (ex) {
    ex.innerHTML = `
      <div class="clim-fact">${snap.note}</div>
      <div class="clim-fact">Dynamo <b>${snap.dynamo.toFixed(2)}</b> · tectonics vigor <b>${snap.vigor.toFixed(2)}</b>
        · spin ${Number(snap.rotationPeriod).toFixed(2)}×</div>
      <div class="clim-fact">${snap.aurora ? 'Aurora oval active' : 'No aurora — field too weak'}
        ${snap.escapeRisk ? ' · <b>air escape risk</b> (weak g or B)' : ''}</div>
    `;
  }
  const meter = document.getElementById('rockCoreMeter');
  if (meter) {
    const pct = Math.min(100, (snap.magnetosphere || 0) * 50) | 0;
    meter.innerHTML = `
      <div class="clim-meter-bar"><i style="width:${pct}%"></i></div>
      <div class="clim-meter-lab">Magnetosphere ${pct}% of a strong Earth-like field scale</div>
    `;
  }
  const note = document.getElementById('rockCoreNote');
  if (note) {
    note.textContent = snap.lidMode === 'stagnant'
      ? 'Stagnant lid — plates barely move; Mars / Moon style.'
      : snap.lidMode === 'none'
        ? 'Gas-giant regime — metallic dynamo, no rocky plates.'
        : 'Mobile lid — plate centres drift and boundaries reclassify over geologic time.';
  }
  const heat = document.getElementById('rockHeat');
  const mag = document.getElementById('rockMag');
  if (heat && document.activeElement !== heat) {
    heat.value = String(Math.round(snap.heatFlow * 100));
    document.getElementById('rockHeatVal').textContent = snap.heatFlow.toFixed(2);
  }
  if (mag && document.activeElement !== mag) {
    mag.value = String(Math.round((snap.magnetosphere || 0) * 100));
    document.getElementById('rockMagVal').textContent = (snap.magnetosphere || 0).toFixed(2);
  }
}

function refreshPlatesDesk() {
  ensurePlateNames(W);
  const snap = platesDeskSnapshot(W);
  const strip = document.getElementById('rockStrip');
  if (strip) {
    strip.innerHTML = `
      <div class="clim-chip"><span>Plates</span><b>${snap.nPlates}</b></div>
      <div class="clim-chip"><span>Continents</span><b>${snap.nCont}</b></div>
      <div class="clim-chip"><span>Oceanic</span><b>${snap.nOcean}</b></div>
      <div class="clim-chip"><span>Selected</span><b>${plateName(W, selectedPlateId)}</b></div>
    `;
  }
  const list = document.getElementById('rockPlateList');
  if (list) {
    if (!snap.list.length) {
      list.innerHTML = `<div class="clim-empty">No plate model — try an Earth-like or terra world.</div>`;
    } else {
      list.innerHTML = snap.list.map((p) => {
        const sel = p.id === selectedPlateId ? ' aria-pressed="true"' : '';
        return `<button type="button" class="clim-row" data-plate="${p.id}"${sel}>
          <span class="clim-row-name">${iconSVG(p.oceanic ? 'river' : 'raise')}${p.name}</span>
          <span class="clim-row-meta">${p.oceanic ? 'oceanic' : 'continental'} · ω ${p.omega.toFixed(3)} · ${(p.areaFrac * 100).toFixed(0)}% area</span>
        </button>`;
      }).join('');
    }
  }
  const note = document.getElementById('rockPlateNote');
  if (note) note.textContent = snap.note;
}

function refreshBoundsDesk() {
  const snap = platesDeskSnapshot(W);
  const strip = document.getElementById('rockBoundStrip');
  if (strip) {
    strip.innerHTML = `
      <div class="clim-chip"><span>Diverge</span><b>${snap.counts.div}</b></div>
      <div class="clim-chip"><span>Converge</span><b>${snap.counts.conv}</b></div>
      <div class="clim-chip"><span>Transform</span><b>${snap.counts.trans}</b></div>
      <div class="clim-chip"><span>Interior</span><b>${snap.counts.interior}</b></div>
    `;
  }
  const legend = document.getElementById('rockBoundLegend');
  if (legend) {
    legend.innerHTML = `
      <div class="clim-fact"><b style="color:#28c8dc">Divergent</b> — ridges, new seafloor, rifts</div>
      <div class="clim-fact"><b style="color:#e65a32">Convergent</b> — trenches, arcs, orogeny</div>
      <div class="clim-fact"><b style="color:#dcc83c">Transform</b> — strain, quakes</div>
      <div class="clim-fact">${snap.note}</div>
    `;
  }
}

function refreshFireDesk() {
  const snap = platesDeskSnapshot(W);
  const strip = document.getElementById('rockFireStrip');
  if (strip) {
    strip.innerHTML = `
      <div class="clim-chip"><span>Volcanoes</span><b>${snap.volcanoes.length}</b></div>
      <div class="clim-chip"><span>Plumes</span><b>${snap.hotspots.length}</b></div>
      <div class="clim-chip"><span>Hotspot</span><b>${snap.volcanoes.filter((v) => v.hotspot).length}</b></div>
    `;
  }
  const list = document.getElementById('rockFireList');
  if (list) {
    const rows = [
      ...snap.hotspots.slice(0, 4).map((h) =>
        `<div class="clim-row static">
          <span class="clim-row-name">${iconSVG('plume')}Plume ${h.i + 1}</span>
          <span class="clim-row-meta">strength ${h.strength.toFixed(2)}${h.fixed ? ' · fixed' : ''}</span>
        </div>`),
      ...snap.volcanoes.slice(0, 6).map((v) =>
        `<div class="clim-row static">
          <span class="clim-row-name">${iconSVG('volcano')}${v.hotspot ? 'Hotspot vent' : 'Arc volcano'}</span>
          <span class="clim-row-meta">cell ${v.cell} · magma ${v.magma.toFixed(2)} · next ${v.next | 0}</span>
        </div>`),
    ];
    list.innerHTML = rows.length
      ? rows.join('')
      : `<div class="clim-empty">Quiet mantle — plant a plume or wait for arc genesis.</div>`;
  }
}

function refreshAgeDesk() {
  const snap = platesDeskSnapshot(W);
  const strip = document.getElementById('rockAgeStrip');
  if (strip) {
    strip.innerHTML = `
      <div class="clim-chip"><span>Mean crust</span><b>${snap.meanCrust.toFixed(2)}</b></div>
      <div class="clim-chip"><span>Mean age</span><b>${snap.meanAge.toFixed(0)} Myr</b></div>
      <div class="clim-chip"><span>Continents</span><b>${snap.nCont}</b></div>
    `;
  }
  const ex = document.getElementById('rockAgeExplain');
  if (ex) {
    ex.innerHTML = `
      <div class="clim-fact">Thick crust rides high (isostasy). Oceanic plates are denser and thinner.</div>
      <div class="clim-fact">Seafloor age grows away from ridges — the age overlay paints that gradient.</div>
      <div class="clim-fact">Ore concentrates at arcs, rifts, and ancient shields.</div>
      <div class="clim-fact">Sea level <b>${W.seaLevel.toFixed(2)}</b> · land fraction follows the lever, not a paint.</div>
    `;
  }
  const sea = document.getElementById('rockSea');
  if (sea && document.activeElement !== sea) {
    sea.value = String(Math.round(W.seaLevel * 100));
    const lab = document.getElementById('rockSeaVal');
    if (lab) lab.textContent = W.seaLevel.toFixed(2);
  }
}

export function refreshPlatesPanel(opts = {}) {
  if (!document.getElementById('pane-rock')) return null;
  if (activeDesk === 'core') refreshCoreDesk();
  else if (activeDesk === 'bounds') refreshBoundsDesk();
  else if (activeDesk === 'fire') refreshFireDesk();
  else if (activeDesk === 'age') refreshAgeDesk();
  else refreshPlatesDesk();
  if (opts.forceAll) {
    refreshCoreDesk();
    refreshPlatesDesk();
    refreshBoundsDesk();
    refreshFireDesk();
    refreshAgeDesk();
  }
  return platesDeskSnapshot(W);
}

/**
 * Bind once. opts: { setOverlay, showMoment, onChange, getInspectCell }
 */
export function bindPlatesPanel(opts = {}) {
  const { setOverlay, showMoment, onChange, getInspectCell } = opts;

  document.querySelectorAll('#pane-rock .clim-desk-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      setDesk(btn.dataset.desk);
      refreshPlatesPanel();
    });
  });

  document.getElementById('rockPlateList')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-plate]');
    if (!row) return;
    selectedPlateId = +row.dataset.plate;
    refreshPlatesDesk();
  });

  const needCell = (label) => {
    const cell = getInspectCell?.() ?? -1;
    if (cell < 0) {
      showMoment?.(label, 'Need inspect', 'Inspect a cell first');
      return -1;
    }
    return cell;
  };

  document.getElementById('rockPoleAt')?.addEventListener('click', () => {
    const cell = needCell('Plate pole');
    if (cell < 0) return;
    const r = setPlatePole(cell);
    selectedPlateId = r.plate ?? selectedPlateId;
    showMoment?.('Plate pole', plateName(W, selectedPlateId), r.ok ? `ω ${r.omega.toFixed(3)}` : r.note);
    setOverlay?.('plates');
    onChange?.('plate');
    refreshPlatesPanel({ forceAll: true });
  });

  document.getElementById('rockOmegaUp')?.addEventListener('click', () => {
    const r = nudgePlateOmega(W, selectedPlateId, 0.015);
    showMoment?.('ω+', plateName(W, selectedPlateId), r.ok ? `ω ${r.omega.toFixed(3)}` : r.note);
    if (r.ok) chronLog(W.year, 'tool', 0, selectedPlateId, `${plateName(W, selectedPlateId)} ω+`);
    onChange?.('plate');
    refreshPlatesPanel();
  });

  document.getElementById('rockOmegaDn')?.addEventListener('click', () => {
    const r = nudgePlateOmega(W, selectedPlateId, -0.015);
    showMoment?.('ω−', plateName(W, selectedPlateId), r.ok ? `ω ${r.omega.toFixed(3)}` : r.note);
    if (r.ok) chronLog(W.year, 'tool', 0, selectedPlateId, `${plateName(W, selectedPlateId)} ω−`);
    onChange?.('plate');
    refreshPlatesPanel();
  });

  const paint = (mode) => {
    setOverlay?.(mode);
  };

  document.getElementById('rockOverlayPlates')?.addEventListener('click', () => paint('plates'));
  document.getElementById('rockOverlayBounds')?.addEventListener('click', () => paint('bounds'));
  document.getElementById('rockOverlayCrust')?.addEventListener('click', () => paint('crust'));

  document.getElementById('rockRift')?.addEventListener('click', () => {
    const cell = needCell('Rift');
    if (cell < 0) return;
    drawRift(cell);
    showMoment?.('Rift', `Cell ${cell}`, 'Crust thins · seaway may flood');
    paint('bounds');
    onChange?.('rift');
    refreshPlatesPanel({ forceAll: true });
  });

  document.getElementById('rockOrogeny')?.addEventListener('click', () => {
    const cell = needCell('Orogeny');
    if (cell < 0) return;
    forceOrogeny(cell);
    showMoment?.('Orogeny', `Cell ${cell}`, 'Range with root');
    paint('bounds');
    onChange?.('orogeny');
    refreshPlatesPanel({ forceAll: true });
  });

  document.getElementById('rockReclass')?.addEventListener('click', () => {
    reclassifyBoundaries(W);
    showMoment?.('Boundaries', 'Reclassified', 'From current Euler poles');
    paint('bounds');
    onChange?.('bounds');
    refreshPlatesPanel({ forceAll: true });
  });

  document.getElementById('rockPlume')?.addEventListener('click', () => {
    const cell = needCell('Plume');
    if (cell < 0) return;
    placePlume(cell);
    showMoment?.('Plume', `Cell ${cell}`, 'Fixed in mantle · island chain later');
    paint('crust');
    onChange?.('plume');
    refreshPlatesPanel({ forceAll: true });
  });

  document.getElementById('rockAgeOverlays')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-overlay]');
    if (!btn) return;
    paint(btn.dataset.overlay);
  });

  document.getElementById('rockSea')?.addEventListener('input', () => {
    const el = document.getElementById('rockSea');
    const v = (+el.value) / 100;
    const lab = document.getElementById('rockSeaVal');
    if (lab) lab.textContent = v.toFixed(2);
    shiftSeaLevel(v - W.seaLevel);
    onChange?.('sealevel');
  });

  document.getElementById('rockHeat')?.addEventListener('input', () => {
    const v = (+document.getElementById('rockHeat').value) / 100;
    document.getElementById('rockHeatVal').textContent = v.toFixed(2);
    if (!W.interior) applyInterior(W);
    W.interior.heatFlow = v;
    W.interior.vigor = Math.max(0.02, v * (W.interior.lidMode === 'stagnant' ? 0.15 : 0.55));
    if (!W.rule?.magnetosphereLocked) {
      W.interior.dynamo = dynamoFromInterior(W.interior, W.rotationPeriod || 1);
      W.magnetosphere = W.interior.dynamo;
      if (W.rule) W.rule.magnetosphere = W.interior.dynamo;
    }
    onChange?.('heat');
    refreshCoreDesk();
  });

  document.getElementById('rockMag')?.addEventListener('input', () => {
    const v = (+document.getElementById('rockMag').value) / 100;
    document.getElementById('rockMagVal').textContent = v.toFixed(2);
  });
  document.getElementById('rockMag')?.addEventListener('change', () => {
    const v = (+document.getElementById('rockMag').value) / 100;
    setMagnetosphere(v);
    showMoment?.('Magnetosphere', v.toFixed(2), 'Aurora & air escape respond');
    onChange?.('mag');
    refreshCoreDesk();
  });

  refreshPlatesPanel({ forceAll: true });
}

export { tectonicsAtCell, plateName };
