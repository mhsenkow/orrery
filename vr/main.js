/** ORRERY main — UI, input, XR, sim loop. */

import { clamp, qAxis, qmul, qnorm, qFromTo, m4, m4persp, m4lookAt, showErr } from './math.js';
import { NC, AREA, N_ALLOWED, N, cellKm, DIR } from './sphere.js';
import { W, generate, simTick, setSunDir, RULESETS, chronLog, formatAge, treeSummary, downloadSave, serializeRun, changeResolution, loadRunMeta } from './world.js';
import { freshSeed } from './sim/rng.js';
import { noteDroppedTicks } from './sim/meta.js';
import { detectEnding, finaleArtefact, formatFinaleMarkdown } from './sim/finale.js';
import { currentReveal, advanceReveal, skipReveal, loadRevealProgress, campaignBlurb } from './sim/teach.js';
import { cityLights } from './sim/city.js';
import { ENT, respawnEntities, agentsTick } from './agents.js';
import { initGL, gl, canvas, rebuildGeometry, refreshColours, uploadEntities, drawScene, vIdx, updateLocalHighlight, setGuildHighlight, setOverlayMode, remeshPlanet, rebuildScatterLUTs } from './render.js';
import {
  climatePanelChrome, refreshClimatePanel, bindClimatePanel,
} from './sim/climatePanel.js';
import {
  platesPanelChrome, refreshPlatesPanel, bindPlatesPanel, tectonicsAtCell, plateName,
} from './sim/platesPanel.js';
import { TOOLS, setTool, activeTool, useToolAt, pickCell, fingerOfGod,
  beginToolDrag, moveToolDrag, endToolDrag, undoStroke, canUndo,
  pricePreview, setScarcityMode, SCARCITY, setSelectedGuild, selectedGuild,
  BRUSH, brushKm, brushForTier, previewBrush,
} from './tools.js';
import { GUILDS } from './sim/redox.js';
import {
  SCENARIOS, startScenario, evaluateScenario, CAMPAIGN, dailySeed,
} from './sim/god/scenario.js';
import {
  blankGenesis, PRESETS, applyPreset, randomizeGenesis, rulesetFromGenesis,
  encodeSeedString, applyGenesisToWorld,
} from './sim/god/genesis.js';
import {
  setTimeRate, TIME_RATES, addBookmark, setLetItRun, shouldHaltFF,
  cycleTimeRate, timeClockInfo,
} from './sim/god/observe.js';
import { addToShelf, loadShelf, rankByBiosignature } from './sim/god/shelf.js';
import { tipForTool, tipForId } from './sim/god/tips.js';
import { decorateButton, iconSVG, DOCK_TAB_ICONS } from './sim/god/icons.js';
import { exportChronicle, currentEraName, whatHappenedHere } from './chronicle.js';
import { audioInit, audioUpdate, playEvent } from './audio.js';
import { LIFE_CLASSES } from './sim/bio.js';
import { BIOMES } from './sim/ecology.js';
import {
  redoxGauge, keelingCurve, diversityCurve, whitakerPoints, transitSpectrum,
  phylogenyView, exportPaper,
} from './sim/instruments.js';
import {
  chartAreaSVG, redoxTowerSVG, spectrumSVG, whitakerSVG, coreStrataSVG, icsRibbonHTML,
  diversityStripSVG, synopticChartSVG,
} from './sim/viz.js';
import { windBandAt } from './sim/wind.js';
import { momentRGB, legendEntries, legendKeyAt } from './sim/lifeColour.js';
import {
  drawLocalView, layoutLocalPanel, stepFocus, hoverCellAt,
  LOCAL_SIZES, LOCAL_SIZE_LABELS, LOCAL_SNAPS, LOCAL_GLOBE, LOCAL_RADII, LOCAL_RADIUS_LABELS,
  localFrameIndex, localFrameLabel,
} from './localview.js';
import { CATALOGUE, CATALOGUE_CATS, CATALOGUE_KIND } from './catalogue.js';
import { rulesetFromCatalogue, adjacentCatalogueWorld, CATALOGUE_WORLDS, validateCatalogueWorlds, recordForCatalogueItem } from './catalogue-rules.js';
import { parseWorldCsv } from './sim/exophysics.js';
import { makeWorldRecord, applyRecordToRule } from './sim/worldRecord.js';
import { explainDrama, defineTerm, READING_LIST, toolsUnlocked } from './sim/glossary.js';
import { OVERLAYS, markTouch } from './sim/overlay.js';
import { downloadInstrumentPng } from './sim/exportPng.js';
import { EARTH_DIVERSITY, earthOverlaySVG } from './sim/earthRecord.js';
import { tideBudget } from './sim/tides.js';
import { iceShellBudget } from './sim/iceshell.js';
import { createTableState, syncTableFromShelf, slotWorldPos, pickTableSlot, pickTableSlotRay, slotToLoadMeta } from './sim/orreryTable.js';
import { readHandSkeleton, gestureFromSkeleton, applyHandGesture } from './sim/handIk.js';
import { getGpgpu } from './sim/gpgpu/index.js';

const TABLE = createTableState();

const S = {
  q: new Float32Array([0, 0, 0, 1]),
  table: TABLE,
  spin: 0.035,
  camDist: 3.1,
  scaleXR: 0.22,
  posXR: [0, 1.18, -0.52],
  paused: false,
  detail: 0,
  entFade: 0,
  exposure: 1.15,
  exposureTarget: 1.15,
  ceremonyUntil: 0,
  sunAng: 0.6,
  fps: 0,
  _fa: 0,
  _ft: 0,
  _t: 0,
  orbitGuides: true,
  orbitFlash: 0,
  activeTool: 'inspect',
  tier: 'Orbital',
  simAlpha: 1,
  inspect: null,
  follow: null,
  opacity: 1,
  xray: 0,
  grid: 0,
  localSize: 200,
  localSnap: 'br',
  localGlobe: 'rim',
  localRadius: 8,
  localPin: -1,       // >=0 pins the local window; -1 = auto-track
  localExpanded: false,
  localHoverKey: null,   // legend id from map or key hover
  localHoverCell: -1,
  localLegendLock: null, // key locked by hovering the legend
  highlightGuild: null,
  angVel: [0, 0],     // spin inertia
  toolDrag: false,
  commitHold: null,
  letItRun: false,
  genesis: null,
  _localFocus: -1,
  _localPatch: null,
  catalogueId: null,
  catFilter: 'all',
  labDesk: 'all',
  catKind: 'BODY', // Worlds first
  catQuery: '',
};

/** Updated when Local panel chrome is wired; called each frame. */
let syncLocalChrome = () => {};

const tmpQ = new Float32Array(4);
const VIEW = m4(), PROJ = m4();
let lastT = 0, simAcc = 0, agentAcc = 0, geomDirty = false;
let dragging = false, lastX = 0, lastY = 0, grabbing = false;
let xrSession = null, xrRefSpace = null, camWorld = null;
const hands = [
  { active: false, pos: [0, 0, 0], grab: false, prev: null, vel: [0, 0, 0] },
  { active: false, pos: [0, 0, 0], grab: false, prev: null, vel: [0, 0, 0] },
];

function needGeom() { geomDirty = true; }

function runGenerate(seed, rule) {
  generate(seed, rule);
  W._gpgpuDirty = true;
  rebuildGeometry();
  respawnEntities();
  uploadEntities();
  try { rebuildScatterLUTs(); } catch { /* GL may not be ready */ }
  document.getElementById('deeptime')?.setAttribute('aria-pressed', rule.deepTime ? 'true' : 'false');
  document.getElementById('bootload')?.classList.add('hidden');
  resetMomentAnnouncer();
  refreshToolGates();
  updateHUD();
  refreshLab();
  if (TABLE.enabled) syncTableFromShelf(TABLE, W);
}

/** Load a shelf / table slot onto the main planet. */
function loadTableSlot(slot) {
  const meta = slotToLoadMeta(slot);
  if (!meta) return false;
  try {
    loadRunMeta(meta);
    W.worldName = meta.worldName || slot.name || W.worldName;
    W._gpgpuDirty = true;
    rebuildGeometry();
    respawnEntities();
    uploadEntities();
    rebuildScatterLUTs();
    TABLE.activeId = slot.id;
    if (TABLE.enabled) syncTableFromShelf(TABLE, W);
    showMoment('Orrery', slot.name || 'World', `seed ${meta.seed}`);
    updateHUD();
    refreshLab();
    return true;
  } catch (e) {
    showErr(String(e.message || e));
    return false;
  }
}

function refreshToolGates() {
  const unlocked = toolsUnlocked(W);
  const buttons = [
    ...document.getElementById('tools')?.children || [],
    ...document.getElementById('toolsMore')?.children || [],
  ];
  let needInspect = false;
  for (const b of buttons) {
    const id = b.dataset?.id;
    if (!id) continue;
    const locked = unlocked[id] === false;
    b.disabled = locked;
    b.classList.toggle('tool-locked', locked);
    if (locked && id === activeTool) needInspect = true;
  }
  if (needInspect) setTool('inspect');
  buttons.forEach((x) => x.setAttribute('aria-pressed', x.dataset.id === activeTool ? 'true' : 'false'));
}

function setRuleset(i) {
  const r = RULESETS[i];
  if (!r) return;
  S.catalogueId = null;
  [...document.getElementById('rules').children].forEach((b, k) =>
    b.setAttribute('aria-pressed', k === i ? 'true' : 'false'));
  clearCatalogueSelection();
  runGenerate(W.seed, r);
}

function clearCatalogueSelection() {
  const list = document.getElementById('catlist');
  if (!list) return;
  [...list.querySelectorAll('.cat-item')].forEach((b) => b.setAttribute('aria-pressed', 'false'));
}

function loadCatalogueItem(item) {
  if (!item) return;
  const detail = document.getElementById('catdetail');
  if (item.k !== 'BODY') {
    if (detail) {
      detail.classList.add('show');
      detail.innerHTML =
        `<b>${CATALOGUE_KIND[item.k] || item.k}</b> · ${item.t}<br>` +
        `${item.d}` +
        (item.s ? `<br><span style="color:#9fc0ff">gives <code>${item.s}</code></span>` : '') +
        (item.p?.length ? `<br><span style="color:#7f8ca6">needs ${item.p.map((p) => `<code>${p}</code>`).join(' ')}</span>` : '') +
        `<br><span style="color:#6f7c93">Roadmap item — not a playable world.</span>`;
    }
    return;
  }
  const r = rulesetFromCatalogue(item);
  if (!r) return;
  S.catalogueId = item.id;
  const rulesEl = document.getElementById('rules');
  if (rulesEl) [...rulesEl.children].forEach((b) => b.setAttribute('aria-pressed', 'false'));
  const list = document.getElementById('catlist');
  if (list) {
    [...list.querySelectorAll('.cat-item')].forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.id === String(item.id) ? 'true' : 'false'));
  }
  if (detail) {
    const wr = r.worldRecord;
    let params = '';
    if (wr) {
      const bits = [
        wr.radius?.v != null ? `${Number(wr.radius.v.toPrecision(3))} R⊕` : null,
        wr.mass?.v != null ? `${Number(wr.mass.v.toPrecision(3))} ${wr.massProv === 'Msini' ? 'M⊕ sin i' : 'M⊕'}` : null,
        wr.S?.v != null ? `S=${Number(wr.S.v.toPrecision(3))}` : null,
        wr.teq?.v != null ? `T<sub>eq</sub> ${wr.teq.v | 0} K` : null,
        wr.press?.v != null ? `${wr.press.v} bar` : null,
        wr.tidallyLocked ? 'locked' : null,
        wr.contested ? '⚠ contested' : null,
      ].filter(Boolean);
      params = `<br><span style="color:#c8b56f">${bits.join(' · ')}</span>`
        + (wr.assumptions?.length ? `<br><span style="color:#6f7c93">assumed: ${wr.assumptions.join(', ')}</span>` : '');
    }
    detail.classList.add('show');
    detail.innerHTML =
      `<b>${item.b || item.t}</b> · playable now<br>${item.d}${params}` +
      (item.p?.length ? `<br><span style="color:#7f8ca6">deeper physics needs ${item.p.map((p) => `<code>${p}</code>`).join(' ')}</span>` : '');
  }
  runGenerate(W.seed, r);
}

function stepCatalogueWorld(dir) {
  const next = adjacentCatalogueWorld(S.catalogueId ?? CATALOGUE_WORLDS[0]?.id, dir);
  if (next) loadCatalogueItem(next);
}

function renderCatalogue() {
  const list = document.getElementById('catlist');
  const meta = document.getElementById('catmeta');
  if (!list) return;
  const q = (S.catQuery || '').trim().toLowerCase();
  const cat = S.catFilter || 'all';
  const kind = S.catKind || 'BODY';
  const items = CATALOGUE.filter((x) => {
    if (kind !== 'all' && x.k !== kind) return false;
    if (cat !== 'all' && x.c !== cat) return false;
    if (!q) return true;
    const hay = `${x.t} ${x.d} ${x.b} ${x.s} ${(x.p || []).join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
  const sort = S.catSort || 'id';
  if (sort !== 'id') {
    items.sort((a, b) => {
      const ra = a.k === 'BODY' ? recordForCatalogueItem(a) : null;
      const rb = b.k === 'BODY' ? recordForCatalogueItem(b) : null;
      if (sort === 'dist') return (ra?.distPc?.v ?? 9e9) - (rb?.distPc?.v ?? 9e9);
      if (sort === 'obs') return (rb?.observability?.v ?? 0) - (ra?.observability?.v ?? 0);
      if (sort === 'known') {
        const ka = ra ? (ra.gaps?.length || 0) + (ra.assumptions?.length || 0) : 99;
        const kb = rb ? (rb.gaps?.length || 0) + (rb.assumptions?.length || 0) : 99;
        return ka - kb;
      }
      return 0;
    });
  }
  list.innerHTML = '';
  for (const x of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `cat-item ${x.k}`;
    b.dataset.id = String(x.id);
    b.setAttribute('aria-pressed', S.catalogueId === x.id ? 'true' : 'false');
    const label = x.b || x.t;
    b.innerHTML =
      `<span class="cid">${x.id}</span>` +
      `<span class="ct">${label}</span>` +
      `<span class="cm">${CATALOGUE_KIND[x.k]} · ${x.e} · i${x.i}` +
      (x.k === 'BODY' ? ' · play' : '') + `</span>`;
    b.title = x.d;
    b.onclick = () => loadCatalogueItem(x);
    list.appendChild(b);
  }
  if (meta) {
    const worlds = items.filter((x) => x.k === 'BODY').length;
    meta.textContent = `${items.length} shown · ${worlds} playable · ${CATALOGUE_WORLDS.length} worlds total`;
  }
}

function setupCatalogue() {
  const panel = document.getElementById('catpanel');
  const btn = document.getElementById('catbtn');
  const close = document.getElementById('catclose');
  const cats = document.getElementById('catcats');
  const kinds = document.getElementById('catkinds');
  const q = document.getElementById('catq');
  if (!panel || !btn || !cats) return;

  const toggle = (open) => {
    const on = open ?? !panel.classList.contains('open');
    panel.classList.toggle('open', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  btn.onclick = () => toggle();
  if (close) close.onclick = () => toggle(false);
  document.getElementById('catprev')?.addEventListener('click', () => stepCatalogueWorld(-1));
  document.getElementById('catnext')?.addEventListener('click', () => stepCatalogueWorld(1));

  if (kinds) {
    kinds.innerHTML = '';
    for (const [id, label] of [['BODY', 'Worlds'], ['PHYS', 'Engine'], ['UX', 'Product'], ['all', 'All']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.id = id;
      b.setAttribute('aria-pressed', S.catKind === id ? 'true' : 'false');
      b.onclick = () => {
        S.catKind = id;
        [...kinds.children].forEach((x) =>
          x.setAttribute('aria-pressed', x.dataset.id === id ? 'true' : 'false'));
        renderCatalogue();
      };
      kinds.appendChild(b);
    }
  }

  const addCat = (id, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.id = id;
    b.setAttribute('aria-pressed', S.catFilter === id ? 'true' : 'false');
    b.onclick = () => {
      S.catFilter = id;
      [...cats.children].forEach((x) =>
        x.setAttribute('aria-pressed', x.dataset.id === id ? 'true' : 'false'));
      renderCatalogue();
    };
    cats.appendChild(b);
  };
  addCat('all', 'All shelves');
  for (const c of CATALOGUE_CATS) {
    const n = CATALOGUE.filter((x) => x.c === c.id && (S.catKind === 'all' || x.k === 'BODY' || x.k === S.catKind)).length;
    // Short labels only
    const short = ({
      star: 'Stars', spin: 'Spin', matter: 'Matter', sol: 'Solar Sys', moons: 'Moons',
      temperate: 'Temperate', furnace: 'Furnace', giant: 'Giants', arch: 'Systems',
      dark: 'Dark', instr: 'Instruments', pipe: 'Pipeline', play: 'Play',
    })[c.id] || c.id;
    addCat(c.id, `${short}`);
  }
  q?.addEventListener('input', () => {
    S.catQuery = q.value;
    renderCatalogue();
  });
  document.getElementById('catsort')?.addEventListener('change', (e) => {
    S.catSort = e.target.value;
    renderCatalogue();
  });
  document.getElementById('catcsv')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseWorldCsv(text);
    if (!rows.length) return;
    const seed = rows[0];
    const rec = makeWorldRecord(seed);
    const terra = RULESETS.find((r) => r.id === 'terra') || RULESETS[0];
    const rule = { ...terra, gases: { ...terra.gases }, atmo: terra.atmo?.slice?.(), sky: terra.sky?.slice?.() };
    applyRecordToRule(rule, rec);
    rule.name = rec.name;
    rule.blurb = `Player table · ${rows.length} row(s)`;
    runGenerate(W.seed, rule);
  });
  renderCatalogue();
}

function togglePause() {
  S.paused = !S.paused;
  const b = document.getElementById('pause');
  b.setAttribute('aria-pressed', S.paused ? 'true' : 'false');
  b.textContent = S.paused ? 'Resume' : 'Pause';
  const ribbon = document.getElementById('timeribbon');
  if (ribbon) delete ribbon.dataset.sig;
  updateHUD();
}

function applyTimeRate(idOrDir) {
  const r = typeof idOrDir === 'number'
    ? cycleTimeRate(idOrDir)
    : setTimeRate(idOrDir);
  const sel = document.getElementById('timerate');
  if (sel) sel.value = r.id;
  const ribbon = document.getElementById('timeribbon');
  if (ribbon) delete ribbon.dataset.sig;
  updateHUD();
  return r;
}

function bindTimeRibbon() {
  const ribbon = document.getElementById('timeribbon');
  if (!ribbon || ribbon.dataset.bound) return;
  ribbon.dataset.bound = '1';
  ribbon.addEventListener('click', (e) => {
    const step = e.target.closest('[data-rate-step]');
    if (step) {
      e.preventDefault();
      applyTimeRate(+step.dataset.rateStep);
      return;
    }
    const cycle = e.target.closest('[data-rate-cycle]');
    if (cycle) {
      e.preventDefault();
      applyTimeRate(+cycle.dataset.rateCycle || 1);
    }
  });
}

function updateHUD() {
  if (xrSession) return;
  const R = W.rule;
  let land = 0;
  for (let c = 0; c < NC; c++) if (W.h[c] >= W.seaLevel) land += AREA[c];
  const pc = (x) => ((x / NC) * 100).toFixed(1) + '%';
  const g = W.gases;
  const lifePct = (W.meanLife * 100).toFixed(1);
  let landCells = 0, greenCells = 0, settleCells = 0;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) continue;
    landCells++;
    if (W.life[c] > 0.15) greenCells++;
    if (W.build[c] > 0.2) settleCells++;
  }
  const landGreen = landCells ? ((greenCells / landCells) * 100).toFixed(0) : '0';
  const bloom = W.lifeGrown > 80 ? ` · <b style="color:#7dff6a">bloom +${W.lifeGrown}</b>` :
    W.lifeDied > 200 ? ` · <b style="color:#e08060">dieback −${W.lifeDied}</b>` : '';
  const builders = W.buildersActive > 0
    ? ` · <b style="color:#e8c48a">building ×${W.buildersActive}</b>` : '';
  let bioLine;
  if (R.daisyworld) {
    let b = 0, w = 0, n = 0;
    for (let c = 0; c < NC; c++) {
      if (W.blackDaisy[c] > 0.25) b++;
      if (W.whiteDaisy[c] > 0.25) w++;
      n++;
    }
    bioLine = `<span style="color:#ddd">daisies <b>${lifePct}%</b> · ` +
      `<b style="color:#222;background:#ccc;padding:0 3px">black ${(b / n * 100) | 0}%</b> · ` +
      `<b style="color:#111;background:#fff;padding:0 3px">white ${(w / n * 100) | 0}%</b>${bloom}</span><br>`;
  } else {
    bioLine = `<span style="color:#7dff6a">life <b>${lifePct}%</b> · land green <b>${landGreen}%</b>${bloom}</span><br>` +
      `<span style="color:#e8c48a">settlements <b>${settleCells}</b>${builders}</span><br>`;
  }
  const co2Str = g.CO2 < 0.005
    ? `${(g.CO2 * 1e6).toFixed(0)} ppm`
    : `${(g.CO2 * 100).toFixed(1)}%`;
  const tK = R.tSurfK != null ? R.tSurfK : (288 + ((W.meanTemp ?? 0.5) - 0.5) * 160);
  const tStr = R.teqK != null
    ? `${tK.toFixed(0)} K` +
      (R.earthLike ? ` (${((W.meanTemp - 0.5) * 80 + 15).toFixed(0)}°C)` : '') +
      (R.greenhouseK != null ? ` · T<sub>eq</sub> ${R.teqK | 0} K · GH +${R.greenhouseK | 0} K` : '')
    : R.earthLike
      ? `${((W.meanTemp - 0.5) * 80 + 15).toFixed(0)}°C`
      : W.meanTemp.toFixed(2);
  const ics = W.ics;
  const icsStr = ics
    ? `${ics.eon}${ics.period && ics.period !== '—' ? ' · ' + ics.period : ''}`
    : '';
  const tree = treeSummary(W.tree);
  const proxy = W.carbon
    ? `δ¹³C <b>${W.carbon.d13C.toFixed(1)}</b> · pH <b>${W.carbon.surfacePH.toFixed(2)}</b><br>`
    : '';
  const bioSig = W.disequilibrium > 0.01
    ? ` · diseq <b>${(W.disequilibrium * 100) | 0}</b>`
    : '';
  const sterile = W.sterileWhy
    ? `<span style="color:#e08060">sterile: ${W.sterileWhy}</span><br>`
    : (R.atmosphereUnknown
      ? `<span style="color:#c8b56f">atmosphere: unmeasured — biosphere unknown</span><br>`
      : '');
  document.getElementById('stats').innerHTML =
    `<span class="era-name">${currentEraName(W.chron, W)}</span>` +
    `<b>${formatAge(W.ageYr || W.year)}</b>` +
    (icsStr ? ` · <span style="color:#9fc0ff">${icsStr}</span>` : '') + `<br>` +
    `dt <b>${fmtDt(W.dtYr)}</b> · L☉ <b>${(W.solar / (W._baseSolar || 1)).toFixed(2)}</b>` +
    (W.solarShade ? ` · shade <b>${((W.solarShade || 0) * 100) | 0}%</b>` : '') + `<br>` +
    `tilt <b>${((W.obliquity || 0) * 180 / Math.PI).toFixed(1)}°</b>` +
    ` · day <b>${(W.rotationPeriod || 1).toFixed(2)}×</b>` +
    (W.magnetosphere != null ? ` · B <b>${W.magnetosphere.toFixed(2)}</b>` : '') +
    (W.interior?.lidMode ? ` · <b>${W.interior.lidMode}</b>` : '') +
    (W.moon && W.moon.mass > 0.1
      ? ` · moon <b>${(W.moon.mass).toFixed(1)} M</b>@${(W.moon.distance || 1).toFixed(1)}`
      : ` · <span style="color:#e08060">no moon</span>`) +
    (W.obliquityWander ? ` · <span style="color:#e4a060">axis wanders</span>` : '') + `<br>` +
    (W.tidePhase
      ? `tide <b>${W.tidePhase}</b>` +
        (W.springsInDays != null ? ` · springs in <b>${W.springsInDays.toFixed(0)}d</b>` : '') +
        ` · range <b>${(W.meanTideRange || 0).toFixed(3)}</b>` +
        (W.moonIllum != null ? ` · moon <b>${(W.moonIllum * 100) | 0}%</b>` : '') + `<br>`
      : '') +
    (W._windRegime
      ? `wind <b>${W._windRegime}</b> · ITCZ <b>${((W._itczLat || 0) * 57.3).toFixed(0)}°</b><br>`
      : '') +
    (W._droppedTicks
      ? `<span style="color:#e08060">dropped ticks <b>${W._droppedTicks}</b>` +
        (W._dropReason ? ` (${W._dropReason})` : '') + `</span><br>`
      : '') +
    (W._gpgpu
      ? `<span style="color:#6fd6a4">GPGPU climate <b>${(W._gpgpuMs || 0).toFixed(2)} ms</b></span><br>`
      : `<span style="color:#889">climate CPU</span><br>`) +
    `state <b>${W.state}</b> · health <b>${(W.health * 100) | 0}%</b>` +
    ` · hab <b>${((W.habitability || 0) * 100) | 0}</b>/<b>${((W.inhabitance || 0) * 100) | 0}</b>${bioSig}<br>` +
    `T <b>${tStr}</b> · sea <b>${W.seaLevel.toFixed(3)}</b>` +
    (R.surfacePressureBar != null ? ` · <b>${R.surfacePressureBar}</b> bar` : '') +
    (R.densityPhrase ? `<br>${R.densityPhrase}` : '') +
    (R.orbitalPeriodDays != null
      ? `<br>year <b>${Number(R.orbitalPeriodDays.toPrecision(4))}</b> d` +
        (R.orbitalPeriodDays > 40 ? ` (${(R.orbitalPeriodDays / 365.25).toFixed(2)} yr)` : '') +
        (R.solarDayHours != null ? ` · solar day <b>${(R.solarDayHours / 24).toFixed(2)}</b> d` : '')
      : '') +
    `<br>` +
    `land <b>${pc(land)}</b> · ice <b>${pc(W.iceFrac * NC)}</b><br>` +
    bioLine +
    sterile +
    `CO₂ <b>${co2Str}</b> O₂ <b>${(g.O2 * 100).toFixed(1)}%</b>` +
    (g.CH4 > 1e-5 ? ` CH₄ <b>${(g.CH4 * 1e6).toFixed(0)} ppm</b>` : '') + `<br>` +
    proxy +
    (tree.total
      ? `clades <b>${tree.living}</b> living / <b>${tree.total}</b> · extinct <b>${tree.extinct}</b><br>`
      : '') +
    (W.budgetMode || W.scarcityMode === 'observe' || W.scarcityMode === 'budgeted'
      ? `energy <b>${W.energy.toFixed(0)}</b>${W.energyDebt ? ` · debt <b>${W.energyDebt | 0}</b>` : ''} · `
      : '') +
    (W.attribution ? `you <b>${((W.attribution.player || 0) * 100) | 0}%</b> · ` : '') +
    `<b>${S.fps}</b> fps · ents ${ENT.n}` +
    (W.overshootWarn ? `<br><span style="color:#e4a060">${W.overshootWarn}</span>` : '') +
    (W.argueResponses?.length
      ? `<br><span style="color:#9fc0ff">${W.argueResponses[W.argueResponses.length - 1].text}</span>`
      : '');

  // Price / brush readout
  const priceEl = document.getElementById('godprice');
  if (priceEl) {
    const p = pricePreview(activeTool);
    priceEl.textContent = p.free
      ? `free · brush ${brushKm() | 0} km`
      : `cost ${p.cost} · bal ${p.balance | 0} · +${(p.income || 0).toFixed(1)}/t · brush ${brushKm() | 0} km`
        + (p.cooldownYr ? ` · cd` : '');
  }

  const ribbon = document.getElementById('timeribbon');
  if (ribbon) {
    const clock = { ...timeClockInfo(W), paused: S.paused };
    const needle = Math.min(100, Math.max(0, ((4567 - (W.ics?.maBP ?? 0)) / 4567) * 100)) | 0;
    const ageLabel = formatAge(W.ageYr || W.year);
    const sig = `${ageLabel}|${W.ics?.period}|${W.ics?.eon}|${needle}|${clock.id}|${clock.dt}|${clock.paused ? 1 : 0}`;
    if (ribbon.dataset.sig !== sig) {
      ribbon.dataset.sig = sig;
      ribbon.innerHTML = icsRibbonHTML(W.ics, ageLabel, W.ics?.maBP, clock);
    }
  }

  announceNewMoments();
  refreshToolGates();

  // Keep Sky / Rock panels live when open
  if (document.getElementById('pane-climate')?.classList.contains('on')) {
    if (!updateHUD._clim || performance.now() - updateHUD._clim > 400) {
      updateHUD._clim = performance.now();
      refreshClimatePanel({ skipChart: (updateHUD._climN = (updateHUD._climN || 0) + 1) % 5 !== 0 });
    }
  }
  if (document.getElementById('pane-rock')?.classList.contains('on')) {
    if (!updateHUD._rock || performance.now() - updateHUD._rock > 600) {
      updateHUD._rock = performance.now();
      refreshPlatesPanel();
    }
  }
  if (document.getElementById('pane-sandbox')?.classList.contains('on')) {
    const modesOn = document.querySelector('.suite-desk[data-suite-panel="sandbox"][data-desk-panel="modes"].on');
    if (modesOn && (!updateHUD._modes || performance.now() - updateHUD._modes > 800)) {
      updateHUD._modes = performance.now();
      refreshWorldModeStrip();
    }
  }

  const chip = document.getElementById('worldchip');
  if (chip) {
    const mode = R.deepTime ? 'deep time' : (R.tutorial ? 'tutorial' : (S.catalogueId ? 'catalogue' : 'sandbox'));
    chip.innerHTML = S.catalogueId
      ? `<b>${R.name}</b> <small>#${S.catalogueId} · ${mode} · seed ${W.seed}${R.teqK != null ? ` · ${R.teqK | 0} K` : ''}${R.contested ? ' · contested' : ''}</small>`
      : `<b>${R.name}</b> <small>${mode} · seed ${W.seed}</small>`;
  }

  const insp = document.getElementById('inspect');
  if (!insp) return;
  if (S.inspect) {
    const x = S.inspect;
    insp.style.display = 'block';
    const biome = W.biome ? BIOMES[W.biome[x.cell]] : '—';
    const guild = topGuild(x.cell);
    const tec = tectonicsAtCell(W, x.cell);
    insp.innerHTML =
      `<b>Cell ${x.cell}</b> · ${biome}<br>` +
      `elev ${x.h.toFixed(3)} · T ${x.temp.toFixed(2)} · moist ${x.moist.toFixed(2)}<br>` +
      `life ${x.life.toFixed(2)} (${LIFE_CLASSES[x.lifeClass]?.id || '—'}) · ice ${x.ice.toFixed(2)}<br>` +
      (guild ? `guild <b>${guild}</b><br>` : '') +
      `build ${(x.build || 0).toFixed(2)} · plate <b>${tec?.name || x.plate}</b>` +
      (tec ? ` · ${tec.oceanic ? 'oceanic' : 'cont'}` : '') +
      ` · crust ${(x.crust ?? W.crust[x.cell]).toFixed(2)}<br>` +
      (W.interior
        ? `core ${(W.interior.coreMassFrac * 100) | 0}% · lid <b>${W.interior.lidMode}</b> · B ${(W.magnetosphere || 0).toFixed(2)}<br>`
        : '') +
      (tec?.boundLabel
        ? `bound <b>${tec.boundLabel}</b>` +
          (tec.ageMyr != null ? ` · crust age ${tec.ageMyr.toFixed(0)} Myr` : '') + `<br>`
        : '') +
      `flow ${x.flow.toFixed(2)} · clouds ${(x.clouds ?? 0).toFixed(2)}` +
      (x.precip != null ? ` · precip ${Number(x.precip).toFixed(2)}` : '') +
      (W.npp ? ` · npp ${W.npp[x.cell].toFixed(2)}` : '') + `<br>` +
      (x.wind != null
        ? `wind ${Number(x.wind).toFixed(2)}` +
          (x.windU != null ? ` (u ${Number(x.windU).toFixed(2)} v ${Number(x.windV).toFixed(2)})` : '') +
          ` · ${windBandAt(DIR[x.cell * 3 + 1], W._itczLat || 0, W._windCells || 3)}<br>`
        : '') +
      (x.press != null ? `P ${Number(x.press).toFixed(2)} · ` : '') +
      (x.tideRange != null
        ? `tide h ${Number(x.tideHeight || 0).toFixed(3)} · range ${Number(x.tideRange).toFixed(3)}` +
          (x.intertidal > 0.05 ? ` · intertidal ${Number(x.intertidal).toFixed(2)}` : '') + `<br>`
        : '') +
      ((W.stormField?.[x.cell] || 0) > 0.08 || (W.surgeField?.[x.cell] || 0) > 0.008
        ? `storm ${(W.stormField[x.cell] || 0).toFixed(2)}` +
          ((W.surgeField?.[x.cell] || 0) > 0.005 ? ` · surge ${(W.surgeField[x.cell] || 0).toFixed(3)}` : '') + `<br>`
        : '') +
      (x.seedOk === false ? `<span style="color:#e08060">seed refuses: ${(x.seedWhy || []).join('; ')}</span>` : '') +
      (x.biomeGap?.gaps?.length ? `<br><span style="color:#c4a060">biome gap: ${x.biomeGap.gaps.join('; ')}</span>` : '');
    const hist = whatHappenedHere(W.chron, x.cell);
    if (hist.length) {
      insp.innerHTML += '<br><span style="color:#9fc0ff">Here:</span> ' +
        hist.slice(0, 3).map((e) => e.label).join(' · ');
    }
  } else insp.style.display = 'none';
}

function fmtDt(dt) {
  if (!dt) return '—';
  if (dt >= 1e6) return `${(dt / 1e6).toFixed(1)} Myr`;
  if (dt >= 1e3) return `${(dt / 1e3).toFixed(0)} kyr`;
  return `${dt | 0} yr`;
}

function topGuild(cell) {
  if (!W.guildDens) return null;
  let best = null, v = 0.08;
  for (const id of Object.keys(W.guildDens)) {
    const x = W.guildDens[id][cell];
    if (x > v) { v = x; best = id; }
  }
  return best;
}

function update(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
  lastT = t;
  S._t = t;
  S.sunAng += dt * 0.055;
  setSunDir(Math.cos(S.sunAng), 0.34, Math.sin(S.sunAng));

  // Spin inertia — planet resists. Item 11.
  if (!grabbing && !dragging && !S.toolDrag) {
    const av = S.angVel;
    if (Math.abs(av[0]) + Math.abs(av[1]) > 1e-4) {
      qAxis(tmpQ, 0, 1, 0, av[1] * dt * 2.2); qmul(S.q, tmpQ, S.q);
      qAxis(tmpQ, 1, 0, 0, av[0] * dt * 2.2); qmul(S.q, tmpQ, S.q);
      qnorm(S.q);
      av[0] *= Math.pow(0.15, dt); // damping
      av[1] *= Math.pow(0.15, dt);
    } else if (!S.paused && !grabbing) {
      qAxis(tmpQ, 0, 1, 0, S.spin * dt);
      qmul(S.q, S.q, tmpQ);
      qnorm(S.q);
    }
  } else if (!S.paused && !grabbing && !dragging) {
    qAxis(tmpQ, 0, 1, 0, S.spin * dt);
    qmul(S.q, S.q, tmpQ);
    qnorm(S.q);
  }

  // Day length drives visual spin
  S.spin = 0.035 / Math.max(0.2, W.rotationPeriod || 1);
  S.activeTool = activeTool;

  if (!S.paused) {
    if (W.fastForward) {
      const halt = shouldHaltFF(W);
      if (halt) {
        W.fastForward = false;
        showMoment('Anomaly', halt.label, formatAge(W.ageYr));
      }
    }
    simAcc += dt * (W.fastForward ? 4 : 1);
    // Decoupled tick; skip if previous tick was heavy (budget ~8ms soft)
    while (simAcc > 0.09) {
      simAcc -= 0.09;
      const t0 = performance.now();
      simTick();
      agentsTick();
      const elapsed = performance.now() - t0;
      refreshColours(1);
      uploadEntities();
      if (W._buildsDirty) { needGeom(); W._buildsDirty = false; }
      else if (W.year % 4000 < 200) needGeom(); // occasional elev rebuild for erosion/sculpt
      if (elapsed > 12) {
        noteDroppedTicks(W, Math.max(1, (simAcc / 0.09) | 0));
        simAcc = 0;
        break;
      } // never block frames — but record the miss
      S.simAlpha = 0;
    }
    S.simAlpha = Math.min(1, S.simAlpha + dt * 11);
    if (S.simAlpha < 0.99) refreshColours(S.simAlpha);
  }

  if (geomDirty) { rebuildGeometry(); geomDirty = false; }

  const alt = xrSession
    ? (camWorld ? (Math.hypot(camWorld[0] - S.posXR[0], camWorld[1] - S.posXR[1], camWorld[2] - S.posXR[2]) / S.scaleXR - 1) : 1.2)
    : (S.camDist - 1);
  S.detail = clamp(1 - (alt - 0.08) / 1.2, 0, 1);
  // Hide sprites at orbit — Earth biomes carry the look
  S.entFade = clamp(1 - (alt - 0.38) / 0.55, 0, 1);
  if (W.rule?.earthLike) S.entFade = alt > 0.85 ? 0 : S.entFade * 0.55;
  // LOD: surface shows more entities; orbital fades to density field (biome colour)
  if (alt > 0.9) S.entFade *= 0.15;
  else if (alt > 0.5) S.entFade *= 0.55;
  S.tier = alt > 1.1 ? 'Orbital' : alt > 0.45 ? 'Regional' : alt > 0.16 ? 'Local' : 'Surface';
  brushForTier(S.tier, S.camDist);

  // Eye adaptation across scale / terminator (next hdr item)
  const nightish = Math.max(0, Math.min(1, (alt < 0.2 ? 0.15 : 0) + (W.gases?.dust || 0) * 0.3));
  const baseExpo = clamp(0.85 + Math.log2(Math.max(0.05, W.solar || 1)) * 0.12, 0.55, 1.85);
  S.exposureTarget = baseExpo * (1.15 - nightish * 0.25) * (S.ceremonyUntil > performance.now() ? 1.08 : 1);
  S.exposure = (S.exposure ?? S.exposureTarget) + (S.exposureTarget - (S.exposure ?? S.exposureTarget)) * Math.min(1, dt * 1.8);

  // City lights boost night uniform via meanBuild
  if (W.cities?.length) W._cityLights = cityLights(W);

  audioUpdate();

  if (!xrSession) {
    const lv = document.getElementById('localview');
    if (lv) {
      const hoverKey = S.localLegendLock || S.localHoverKey;
      const patch = drawLocalView(lv, S.inspect, {
        radius: S.localRadius,
        pin: S.localPin,
        highlightGuild: S.highlightGuild,
        hoverKey,
        hoverCell: S.localHoverCell,
      });
      const prevFocus = S._localFocus;
      updateLocalHighlight(patch, S.localGlobe);
      S._localFocus = patch?.focus ?? -1;
      S._localPatch = patch;
      syncLocalChrome(patch, hoverKey);
      if ((S.localGlobe === 'wash' || S.localGlobe === 'both') && S._localFocus !== prevFocus) {
        refreshColours(1);
      }
    }
  }

  S._fa++;
  if (t - S._ft > 500) {
    S.fps = Math.round((S._fa * 1000) / (t - S._ft));
    S._fa = 0; S._ft = t;
    updateHUD();
  }
}

function desktopPick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const eye = [0, 0.28, S.camDist];
  const fov = 50 * Math.PI / 180;
  const asp = canvas.width / canvas.height;
  const tan = Math.tan(fov / 2);
  const dir = [x * tan * asp, y * tan + 0.02, -1];
  const dl = Math.hypot(...dir) || 1;
  dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
  return pickCell(eye, dir, [0, 0, 0], 1, S.q);
}

function desktopTablePick(clientX, clientY) {
  if (!TABLE.enabled) return null;
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const eye = [0, 0.28, S.camDist];
  const fov = 50 * Math.PI / 180;
  const asp = canvas.width / canvas.height;
  const tan = Math.tan(fov / 2);
  const dir = [x * tan * asp, y * tan + 0.02, -1];
  const dl = Math.hypot(...dir) || 1;
  dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
  return pickTableSlotRay(TABLE, eye, dir, [0, -1.15, 0], 0.38, 0.12);
}

function onToolResult(res) {
  if (!res) return;
  if (res.error) showErr(res.error);
  if (res.refused) showErr(res.note || 'Life refused');
  if (res.needCommit || res.needConfirm) {
    startCommitHold(res.cell ?? 0);
    return;
  }
  if (res.orbitFlash) S.orbitFlash = (S._t || performance.now()) + 4000;
  if (res.note && res.ok) showMoment('Orbit', res.note, formatAge(W.ageYr));
  if (res.ok) {
    playEvent(activeTool === 'meteor' ? 'impact' : (activeTool === 'seed' || activeTool === 'seedGuild') ? 'seed' : 'tool', 0.6);
    const geomTools = new Set(['raise', 'lower', 'meteor', 'buster', 'volcano', 'quake', 'plume', 'lip', 'river', 'ice']);
    if (geomTools.has(activeTool)) needGeom();
    if (res.cell != null && res.cell >= 0) markTouch(W, res.cell);
    refreshColours(1);
    showReceiptToast(res);
  }
  if (res.cell != null && activeTool === 'inspect') {
    S.inspect = res;
    S.localPin = res.cell;
  }
  if (res.sample) {
    S.lastSample = res.sample;
    refreshLab();
    setDockTab('lab');
  }
  updateHUD();
}

function showReceiptToast(res) {
  const el = document.getElementById('receipt');
  if (!el) return;
  const last = W.receipts?.[W.receipts.length - 1];
  if (!last && !res.pay) return;
  el.innerHTML = last
    ? `<b>${last.tool}</b> · ${last.expected || last.intent}`
      + (last.cost ? ` · −${last.cost}` : '')
      + (res.settling ? `<br><small>settles: ${res.settling}</small>` : '')
    : (res.pay?.note || '');
  el.classList.add('show');
  clearTimeout(showReceiptToast._t);
  showReceiptToast._t = setTimeout(() => el.classList.remove('show'), 3200);
}

function startCommitHold(cell) {
  const ring = document.getElementById('commitring');
  S.commitHold = { cell, t0: performance.now(), ms: 2800 };
  if (ring) {
    ring.classList.add('show');
    ring.querySelector('.cr-label').textContent = 'Hold to commit — irreversible';
  }
  const tick = () => {
    if (!S.commitHold) return;
    const p = (performance.now() - S.commitHold.t0) / S.commitHold.ms;
    if (ring) ring.style.setProperty('--p', clamp(p, 0, 1));
    if (p >= 1) {
      const c = S.commitHold.cell;
      cancelCommitHold(true);
      onToolResult(useToolAt(c, { commit: true, confirm: true }));
      playEvent('buster', 1);
      needGeom();
      return;
    }
    S.commitHold.raf = requestAnimationFrame(tick);
  };
  S.commitHold.raf = requestAnimationFrame(tick);
}

function cancelCommitHold(done) {
  if (S.commitHold?.raf) cancelAnimationFrame(S.commitHold.raf);
  S.commitHold = null;
  document.getElementById('commitring')?.classList.remove('show');
}

function setupTips() {
  // Play / World controls by id
  const ids = [
    'guildsel', 'timerate', 'brushmask', 'brushsnap', 'brushhard',
    'godundo', 'godff', 'godwatch', 'godbookmark', 'orbitguides',
    'scenariosel', 'scenariostart',
    'genesisname', 'genesisseed', 'genesispreset',
    'genesisrand', 'genesisgo', 'dailyseed', 'godshelf', 'godshare',
    'budget', 'autopilot', 'deeptime',
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    const tip = tipForId(id);
    if (el && tip) bindTip(el, tip.title, tip.body);
  }
  // Labels that wrap controls
  document.querySelectorAll('#pane-god label[for]').forEach((lab) => {
    const tip = tipForId(lab.htmlFor);
    if (tip) bindTip(lab, tip.title, tip.body);
  });
  // Dock tabs — icon stacked above label (Sky metaphor for all)
  const tabTips = {
    tools: ['Tools', 'The verbs — raise land, seed life, strike, inspect. Select one, then right-click the planet.'],
    god: ['Play', 'Aim your tools: which life to plant, brush limits, clock speed, challenges, and new-world authoring.'],
    climate: ['Sky', 'Atmosphere desks: circulation & tides, storm track, coast flood risk, spin A/B compare.'],
    rock: ['Rock', 'Core, plates, boundaries, fire, crust age — interiors drive dynamos and lids.'],
    view: ['View', 'Look, field layers, x-ray cut, and orbit guides. Does not change the simulation.'],
    lab: ['Lab', 'Instruments: redox tower, Keeling curve, diversity, cores you have taken, transit sketch.'],
    sandbox: ['World', 'Ruleset / planet type, energy mode, Gaia autopilot, deep time, chronicle export.'],
  };
  const tabLabels = {
    tools: 'Tools', god: 'Play', climate: 'Sky', rock: 'Rock', view: 'View', lab: 'Lab', sandbox: 'World',
  };
  document.querySelectorAll('.dock-tabs button').forEach((b) => {
    const tab = b.dataset.tab;
    const t = tabTips[tab];
    if (t) bindTip(b, t[0], t[1]);
    const icon = DOCK_TAB_ICONS[tab];
    if (icon && !b.querySelector('.ico')) {
      decorateButton(b, icon, tabLabels[tab] || b.textContent.trim());
    }
  });

  // Suite desk tabs (Play / View / Lab / World / Tools)
  const suiteMeta = {
    tools: {
      verbs: ['tabtools', 'Verbs'],
      more: ['more', 'More'],
      station: ['station', 'Station'],
    },
    god: {
      aim: ['seedGuild', 'Aim'],
      brush: ['brush', 'Brush'],
      challenge: ['challenge', 'Quest'],
      genesis: ['genesis', 'Genesis'],
    },
    view: {
      look: ['appear', 'Look'],
      layers: ['survey', 'Layers'],
      slice: ['slice', 'Slice'],
      guides: ['orbitguides', 'Guides'],
    },
    lab: {
      all: ['tablab', 'All'],
      tower: ['o2', 'Tower'],
      curves: ['curves', 'Curves'],
      survey: ['survey', 'Survey'],
      notes: ['notes', 'Notes'],
    },
    sandbox: {
      planet: ['planet', 'Planet'],
      modes: ['modes', 'Modes'],
      archive: ['archive', 'Archive'],
    },
  };
  document.querySelectorAll('.suite-desk-tab').forEach((b) => {
    const suite = b.dataset.suite;
    const desk = b.dataset.desk;
    const meta = suiteMeta[suite]?.[desk];
    if (meta) decorateButton(b, meta[0], meta[1]);
    b.addEventListener('click', () => setSuiteDesk(suite, desk));
  });

  // Section headings with icons
  document.querySelectorAll('[data-sec-icon]').forEach((el) => {
    const id = el.dataset.secIcon;
    const label = el.textContent.trim();
    el.innerHTML = `${iconSVG(id)}<span>${label}</span>`;
  });

  // Play / World action icons
  const iconIds = [
    'godundo', 'godff', 'godwatch', 'godbookmark', 'orbitguides',
    'scenariostart', 'genesisrand', 'genesisgo', 'dailyseed',
    'godshelf', 'godshare', 'budget', 'autopilot', 'deeptime',
  ];
  for (const id of iconIds) {
    const el = document.getElementById(id);
    if (!el || el.querySelector('.ico')) continue;
    const label = el.textContent.trim();
    decorateButton(el, id, label);
  }
  const extraIcons = [
    ['labRefresh', 'refresh', 'Refresh'],
    ['labPaper', 'paper', 'Paper'],
    ['labSave', 'save', 'Save'],
    ['labFinale', 'finale', 'Finale'],
    ['labPng', 'png', 'PNG'],
    ['labDual', 'dual', 'Dual'],
    ['orreryTable', 'table', 'Table'],
    ['export', 'chronicle', 'Chronicle'],
  ];
  for (const [id, icon, label] of extraIcons) {
    const el = document.getElementById(id);
    if (!el || el.querySelector('.ico')) continue;
    decorateButton(el, icon, label);
  }
}

/** Switch a suite sub-desk (Tools / Play / View / Lab / World). */
function setSuiteDesk(suite, desk) {
  document.querySelectorAll(`.suite-desk-tab[data-suite="${suite}"]`).forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.desk === desk ? 'true' : 'false');
  });
  if (suite === 'lab') {
    S.labDesk = desk;
    applyLabFilter();
    return;
  }
  document.querySelectorAll(`.suite-desk[data-suite-panel="${suite}"]`).forEach((p) => {
    const on = p.dataset.deskPanel === desk;
    p.classList.toggle('on', on);
    p.hidden = !on;
  });
  if (suite === 'sandbox' && desk === 'modes') refreshWorldModeStrip();
}

function applyLabFilter() {
  const desk = S.labDesk || 'all';
  document.querySelectorAll('#labstats .lab-card').forEach((card) => {
    const cat = card.dataset.labCat || 'notes';
    card.hidden = desk !== 'all' && cat !== desk;
  });
}

function syncViewOverlayButtons(mode) {
  document.querySelectorAll('#viewOverlays button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.overlay === mode ? 'true' : 'false');
  });
  const hint = document.getElementById('viewOverlayHint');
  if (hint) {
    const o = OVERLAYS.find((x) => x.id === mode);
    hint.textContent = o ? `${o.label}${mode === 'none' ? '' : ' painted on the globe'}.` : '';
  }
}

function refreshWorldModeStrip() {
  const strip = document.getElementById('worldModeStrip');
  if (!strip) return;
  const I = W.interior;
  const scarcity = W.scarcityMode || (W.budgetMode ? 'budgeted' : 'free');
  strip.innerHTML = `
    <div class="clim-chip"><span>Energy</span><b>${scarcity}</b></div>
    <div class="clim-chip"><span>Gaia</span><b>${W.autopilot ? 'on' : 'off'}</b></div>
    <div class="clim-chip"><span>N</span><b>${N}</b></div>
    <div class="clim-chip"><span>Lid</span><b>${I?.lidMode || '—'}</b></div>
    <div class="clim-chip"><span>B</span><b>${(W.magnetosphere ?? 0).toFixed(2)}</b></div>
    <div class="clim-chip"><span>Heat</span><b>${I ? I.heatFlow.toFixed(2) : '—'}</b></div>
  `;
}

let _tipTimer = 0;
function bindTip(el, title, body, meta = '') {
  el.removeAttribute('title'); // avoid native double-tip
  el.addEventListener('pointerenter', (e) => {
    clearTimeout(_tipTimer);
    _tipTimer = setTimeout(() => showTip(e.currentTarget, title, body, meta), 280);
  });
  el.addEventListener('pointerleave', () => {
    clearTimeout(_tipTimer);
    hideTip();
  });
  el.addEventListener('pointerdown', () => {
    clearTimeout(_tipTimer);
    hideTip();
  });
}

function showTip(anchor, title, body, meta = '') {
  const tip = document.getElementById('tip');
  if (!tip || !anchor) return;
  tip.querySelector('.tip-title').textContent = title;
  tip.querySelector('.tip-body').textContent = body;
  const metaEl = tip.querySelector('.tip-meta');
  if (metaEl) {
    metaEl.textContent = meta || '';
    metaEl.hidden = !meta;
  }
  tip.hidden = false;
  tip.classList.add('show');
  const r = anchor.getBoundingClientRect();
  const tw = tip.offsetWidth || 260;
  const th = tip.offsetHeight || 80;
  let left = r.right + 10;
  let top = r.top;
  if (left + tw > innerWidth - 8) left = Math.max(8, r.left - tw - 10);
  if (top + th > innerHeight - 8) top = Math.max(8, innerHeight - th - 8);
  if (top < 8) top = 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideTip() {
  const tip = document.getElementById('tip');
  if (!tip) return;
  tip.classList.remove('show');
  tip.hidden = true;
}

function setupReveal() {
  const el = document.getElementById('reveal');
  if (!el) return;
  let progress = loadRevealProgress();
  const paint = () => {
    const step = currentReveal(progress);
    if (!step) { el.hidden = true; return; }
    el.hidden = false;
    el.querySelector('.rv-kicker').textContent = `Step ${(progress.step || 0) + 1} of 6`;
    el.querySelector('.rv-title').textContent = step.title;
    el.querySelector('.rv-body').textContent = step.body;
    el.querySelector('#revealnext').textContent = step.action || 'Continue';
  };
  paint();
  document.getElementById('revealnext')?.addEventListener('click', () => {
    progress = advanceReveal(progress);
    paint();
    playEvent('quiet', 0.5);
  });
  document.getElementById('revealskip')?.addEventListener('click', () => {
    progress = skipReveal();
    paint();
  });
  // Enrich scenario dropdown with campaign blurbs
  const sel = document.getElementById('scenariosel');
  if (sel) {
    [...sel.options].forEach((o) => {
      const blurb = campaignBlurb(o.value);
      if (blurb && blurb !== o.value) o.title = blurb;
    });
  }
}

function setupClimatePanel() {
  const pane = document.getElementById('pane-climate');
  if (!pane) return;
  pane.innerHTML = climatePanelChrome();
  bindClimatePanel({
    setOverlay: (mode) => {
      setOverlayMode(mode);
      refreshColours(1);
      const sel = document.getElementById('overlayMode');
      if (sel) sel.value = mode;
      syncViewOverlayButtons(mode);
    },
    showMoment,
    getInspectCell: () => S.inspect?.cell ?? -1,
    onChange: () => {
      refreshColours(0.6);
      S.spin = 0.035 / Math.max(0.2, W.rotationPeriod || 1);
    },
  });
}

function setupPlatesPanel() {
  const pane = document.getElementById('pane-rock');
  if (!pane) return;
  pane.innerHTML = platesPanelChrome();
  bindPlatesPanel({
    setOverlay: (mode) => {
      setOverlayMode(mode);
      refreshColours(1);
      const sel = document.getElementById('overlayMode');
      if (sel) sel.value = mode;
      syncViewOverlayButtons(mode);
    },
    showMoment,
    getInspectCell: () => S.inspect?.cell ?? -1,
    onChange: () => { refreshColours(0.7); needGeom(); },
  });
}

function setupGodPanel() {
  const guildSel = document.getElementById('guildsel');
  if (guildSel) {
    const labels = {
      cyanobacteria: 'cyanobacteria (make O₂)',
      aerobe: 'aerobes (breathe O₂)',
      purpleSulfur: 'purple sulfur (early photosynthesis)',
      greenSulfur: 'green sulfur',
      methanogen: 'methanogens',
      fermenter: 'fermenters',
      decomposer: 'decomposers',
      chemolithotroph: 'vent chemolithotrophs',
    };
    guildSel.innerHTML = GUILDS.map((g) =>
      `<option value="${g.id}"${g.id === selectedGuild ? ' selected' : ''}>${labels[g.id] || g.id}</option>`).join('');
    const syncGuildHint = () => {
      const hint = document.getElementById('guildhint');
      if (hint) hint.textContent = `Seed guild will plant ${guildSel.value}. Other tools ignore this.`;
    };
    guildSel.onchange = () => { setSelectedGuild(guildSel.value); syncGuildHint(); };
    syncGuildHint();
  }
  const scen = document.getElementById('scenariosel');
  const syncScenarioBlurb = () => {
    const id = scen?.value;
    const s = SCENARIOS.find((x) => x.id === id);
    const el = document.getElementById('scenarioblurb');
    if (!el) return;
    const camp = id ? campaignBlurb(id) : '';
    const detail = s?.blurb || s?.objective || '';
    el.textContent = camp && camp !== id
      ? (detail && detail !== camp ? `${camp} ${detail}` : camp)
      : (detail || 'A short goal with limits — optional.');
  };
  if (scen) {
    const preferred = CAMPAIGN.map((id) => SCENARIOS.find((s) => s.id === id)).filter(Boolean);
    const rest = SCENARIOS.filter((s) => !CAMPAIGN.includes(s.id));
    const ordered = [...preferred, ...rest];
    scen.innerHTML = ordered.map((s) => {
      const blurb = campaignBlurb(s.id);
      const tip = blurb && blurb !== s.id ? blurb : (s.blurb || s.objective || '');
      return `<option value="${s.id}" title="${tip.replace(/"/g, '&quot;')}">${s.title}</option>`;
    }).join('');
    scen.onchange = syncScenarioBlurb;
    syncScenarioBlurb();
  }
  document.getElementById('scenariostart')?.addEventListener('click', () => {
    const id = document.getElementById('scenariosel')?.value;
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) return;
    const rule = { ...(RULESETS.find((r) => r.id === s.ruleId) || W.rule), deepTime: !!s.deepTime, startAgeGa: s.startAgeGa };
    runGenerate(W.seed ^ 0x51, rule);
    startScenario(id);
    showMoment('Scenario', s.title, s.objective);
    updateHUD();
  });
  document.getElementById('godundo')?.addEventListener('click', () => {
    const r = undoStroke();
    if (r) { showErr(r.note); refreshColours(1); needGeom(); }
    else showErr('Nothing to undo');
  });
  document.getElementById('godbookmark')?.addEventListener('click', () => {
    const b = addBookmark();
    showMoment('Bookmark', b.label, formatAge(b.ageYr));
  });
  document.getElementById('godff')?.addEventListener('click', () => {
    W.fastForward = !W.fastForward;
    W.stopOnAnomaly = true;
    document.getElementById('godff')?.setAttribute('aria-pressed', W.fastForward ? 'true' : 'false');
  });
  bindTimeRibbon();
  document.getElementById('godwatch')?.addEventListener('click', () => {
    S.letItRun = !S.letItRun;
    setLetItRun(S.letItRun);
    document.body.classList.toggle('letitrun', S.letItRun);
    document.getElementById('godwatch')?.setAttribute('aria-pressed', S.letItRun ? 'true' : 'false');
  });
  document.getElementById('orbitguides')?.addEventListener('click', () => {
    S.orbitGuides = !S.orbitGuides;
    const pressed = S.orbitGuides ? 'true' : 'false';
    document.getElementById('orbitguides')?.setAttribute('aria-pressed', pressed);
    document.getElementById('viewOrbitGuides')?.setAttribute('aria-pressed', pressed);
  });
  document.getElementById('godshelf')?.addEventListener('click', () => {
    addToShelf(W, serializeRun);
    if (TABLE.enabled) syncTableFromShelf(TABLE, W);
    showMoment('Shelf', W.worldName || W.rule.name, `${loadShelf().length} worlds saved`);
  });
  document.getElementById('godshare')?.addEventListener('click', () => {
    const g = W.genesis || blankGenesis();
    g.seed = W.seed;
    g.name = W.worldName || W.rule.name;
    const str = encodeSeedString(g, W.interventionLog || []);
    navigator.clipboard?.writeText(str);
    showMoment('Seed string', 'Copied', str.slice(0, 48) + '…');
  });
  const mask = document.getElementById('brushmask');
  if (mask) {
    mask.onchange = () => { BRUSH.mask = mask.value || null; };
  }
  const snap = document.getElementById('brushsnap');
  if (snap) {
    snap.onchange = () => { BRUSH.snap = snap.value || null; };
  }
  document.getElementById('brushhard')?.addEventListener('input', (e) => {
    BRUSH.hardness = (+e.target.value) / 100;
  });
  const timeSel = document.getElementById('timerate');
  if (timeSel) {
    timeSel.innerHTML = TIME_RATES.map((r) =>
      `<option value="${r.id}">${r.label}${r.dtYr == null ? '' : ' / tick'}</option>`).join('');
    if (!TIME_RATES.some((r) => r.id === (W.timeRateId || 'auto'))) setTimeRate('auto');
    timeSel.value = W.timeRateId || 'auto';
    timeSel.onchange = () => {
      applyTimeRate(timeSel.value);
    };
  }
  const presetSel = document.getElementById('genesispreset');
  if (presetSel) {
    presetSel.innerHTML = '<option value="">— preset —</option>' +
      PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  }
  document.getElementById('genesisgo')?.addEventListener('click', () => {
    let g = blankGenesis();
    g.name = document.getElementById('genesisname')?.value || 'Unnamed';
    g.seed = (+document.getElementById('genesisseed')?.value) || freshSeed();
    const pid = presetSel?.value;
    if (pid) applyPreset(g, pid);
    const rule = rulesetFromGenesis(g);
    runGenerate(g.seed, rule);
    applyGenesisToWorld(W, g);
    S.genesis = g;
    showMoment('Genesis', g.name, `seed ${g.seed}`);
  });
  document.getElementById('genesisrand')?.addEventListener('click', () => {
    const g = randomizeGenesis({ habitable: true });
    document.getElementById('genesisname').value = g.name;
    document.getElementById('genesisseed').value = g.seed;
  });
  document.getElementById('dailyseed')?.addEventListener('click', () => {
    const seed = dailySeed();
    runGenerate(seed, W.rule);
    showMoment('Daily world', formatAge(W.ageYr), `seed ${seed}`);
  });
}

function setDockTab(tab) {
  document.querySelectorAll('.dock-tabs button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.tab === tab ? 'true' : 'false');
  });
  document.querySelectorAll('.dock-pane').forEach((p) => {
    p.classList.toggle('on', p.id === `pane-${tab}`);
  });
  document.getElementById('dock')?.classList.toggle('lab-mode', tab === 'lab');
  if (tab === 'lab') refreshLab();
  if (tab === 'climate') refreshClimatePanel({ forceChart: true });
  if (tab === 'rock') refreshPlatesPanel({ forceAll: true });
  if (tab === 'sandbox') {
    const modesOn = document.querySelector('.suite-desk[data-suite-panel="sandbox"][data-desk-panel="modes"].on');
    if (modesOn) refreshWorldModeStrip();
  }
}

function refreshLab() {
  const el = document.getElementById('labstats');
  if (!el) return;
  const gauge = redoxGauge(W);
  const keeling = keelingCurve(W);
  const diver = diversityCurve(W);
  const whit = whitakerPoints(W, 280);
  const spec = transitSpectrum(W);
  const phy = phylogenyView(W);
  const co2s = keeling.slice(-80).map((p) => p.co2ppm);
  const divs = diver.slice(-80).map((p) => p.n);
  const ldg = W.latDiversity;
  const h = (icon, title) => `${iconSVG(icon)}<span>${title}</span>`;
  const card = (cat, icon, title, body, hero = false) =>
    `<div class="lab-card${hero ? ' lab-hero' : ''}" data-lab-cat="${cat}"><h3>${h(icon, title)}</h3>${body}</div>`;

  let sampleCard = '';
  if (S.lastSample?.layers) {
    sampleCard = card('curves', 'core', 'Core sample',
      `${coreStrataSVG(S.lastSample.layers)}
      <div class="lab-meta">cell <b>${S.lastSample.cell}</b> · ${S.lastSample.biome}
      ${S.lastSample.proxies ? ` · δ¹³C <b>${S.lastSample.proxies.d13C.toFixed(1)}</b> · pH <b>${S.lastSample.proxies.pH.toFixed(2)}</b>` : ''}
      </div>`);
  } else if (S.lastSample?.samples) {
    const ppm = S.lastSample.samples.map((s) => s.co2 * 1e6);
    sampleCard = card('curves', 'icecore', 'Ice core',
      `${chartAreaSVG(ppm, { id: 'ice', color: '#9fc0ff', label: ' ppm', digits: 0 })}
      <div class="lab-meta">${S.lastSample.note || ''}</div>`);
  }

  el.innerHTML =
    sampleCard +
    card('tower', 'o2', 'Redox tower',
      `${redoxTowerSVG(gauge, 300, S.highlightGuild)}
      <div class="lab-meta">hover a guild to light it on the globe · high yield at top</div>`, true) +
    card('curves', 'co2', 'Keeling curve',
      `${chartAreaSVG(co2s, { id: 'co2', color: '#e4b86a', label: ' ppm', digits: 0, h: 88, w: 280, axis: true })}
      <div class="lab-meta">atmospheric CO₂ · burial drives the long slope</div>`) +
    card('curves', 'seedGuild', 'Diversity',
      `${diversityStripSVG(phy, { w: 280, h: 56 })}
      ${chartAreaSVG(divs, { id: 'div', color: '#6fd6a4', digits: 0, h: 72, w: 280, axis: true })}
      ${earthOverlaySVG(
        diver.slice(-40).map((p) => ({ t: p.t || p.year || 0, v: (p.n || 0) / Math.max(1, Math.max(...divs, 1)) })),
        EARTH_DIVERSITY,
        { w: 280, h: 48 }
      )}
      <div class="lab-meta">clades <b>${phy.living}</b> living` +
      (W.endemicCount ? ` · endemic <b>${W.endemicCount}</b>` : '') +
      (ldg ? ` · LDG Δ<b>${ldg.gradient}</b>` : '') +
      ` · Earth curve in grey</div>`) +
    card('survey', 'survey', 'Whittaker space',
      `${whitakerSVG(whit)}
      <div class="lab-meta">${whit.length} of ${NC} cells (~250 km each) in temperature–rainfall space</div>`) +
    card('survey', 'solar', 'Transit spectrum',
      `${spectrumSVG(spec.lines)}
      <div class="lab-meta">${spec.note}</div>`) +
    card('tower', 'autopilot', 'Gaia',
      `<div class="lab-meta">feedback <b>${(W.feedbackGain || 0).toFixed(2)}</b> · Medea <b>${((W.medeaScore || 0) * 100) | 0}</b>` +
      (W.carbon ? ` · Ω <b>${W.carbon.omegaAragonite.toFixed(2)}</b>` : '') +
      ` · mode <b>${W.gaiaMode || '—'}</b></div>`) +
    card('survey', 'weather', 'Synoptic chart',
      `${synopticChartSVG(W)}
      <div class="lab-meta">${W._windRegime || '—'} · spin reorganises banding · forecast limit ~2 weeks</div>`) +
    card('notes', 'moon', 'Tides & shells',
      `<div class="lab-meta">${(() => {
        const t = tideBudget(W);
        const ice = W.rule?.iceShell ? iceShellBudget(W.rule) : null;
        return `${t.note}` +
          (t.phase ? `<br>phase <b>${t.phase}</b>` : '') +
          (t.highInHours != null ? ` · high in ~<b>${t.highInHours}</b> h` : '') +
          (t.springsInDays != null ? ` · springs in <b>${t.springsInDays}</b> d` : '') +
          (t.meanRange != null ? ` · range <b>${t.meanRange}</b>` : '') +
          (ice ? `<br>ice-shell vents <b>${W._shellVentCount || 0}</b> · ${ice.note}` : '') +
          (W.civPop ? `<br>civ pop ~<b>${W.civPop | 0}</b>` : '');
      })()}</div>`) +
    card('notes', 'notes', 'Model limits',
      `<div class="lab-meta">Cube-sphere N=<b>${N}</b> (~${cellKm(N)} km/cell). Climate may run on GPGPU.
      O₂ from burial, not raw photosynthesis. Traits ≈11 floats, not genomes.
      <a href="../briefs/model-limits.md" target="_blank" rel="noopener">full limits</a>
      · water drift <b>${((W.waterDrift || 0) * 100).toFixed(1)}%</b>
      · save v<b>2</b> · seed <b>${W.seed}</b></div>`) +
    card('notes', 'inspect', 'Glossary',
      `<div class="lab-meta">${['GOE', 'redox', 'NPP', 'euxinia', 'LUCA'].map((t) => {
        const d = defineTerm(t);
        return d ? `<div><b>${t}</b> — ${d}</div>` : '';
      }).join('')}
      <div style="margin-top:6px;color:var(--dim)">${READING_LIST.slice(0, 3).map((r) =>
        `${r.author}: <i>${r.title}</i>`).join(' · ')}</div></div>`);

  applyLabFilter();
  wireGuildHover(el);
}

function wireGuildHover(el) {
  el.querySelectorAll('[data-guild]').forEach((row) => {
    const id = row.getAttribute('data-guild');
    row.addEventListener('pointerenter', () => {
      S.highlightGuild = id;
      setGuildHighlight(id);
      refreshColours(1);
      // Restyle tower without full lab rebuild
      el.querySelectorAll('[data-guild]').forEach((r) => {
        r.classList.toggle('on', r.getAttribute('data-guild') === id);
      });
    });
    row.addEventListener('pointerleave', () => {
      S.highlightGuild = null;
      setGuildHighlight(null);
      refreshColours(1);
      el.querySelectorAll('[data-guild]').forEach((r) => r.classList.remove('on'));
    });
  });
}

let _announcedMoments = new Set();
let _announcedDrama = new Set();
let _momentTimer = 0;

function announceNewMoments() {
  const moments = W.moments || {};
  for (const [key, m] of Object.entries(moments)) {
    if (_announcedMoments.has(key)) continue;
    _announcedMoments.add(key);
    const firstLife = /life|cell|abiogen|luca|photosynth/i.test(key + m.label);
    showMoment(firstLife ? 'The first life' : 'First occurrence', m.label, formatAge(m.ageYr), momentRGB(key));
    playEvent(firstLife ? 'first' : 'seed', firstLife ? 1.1 : 0.85);
    if (firstLife) {
      S.ceremonyUntil = performance.now() + 4500;
      document.body.classList.add('ceremony');
      setTimeout(() => document.body.classList.remove('ceremony'), 4500);
      // Soft pause the rush so the moment lands
      const was = S.paused;
      S.paused = true;
      setTimeout(() => { S.paused = was; }, 2200);
    }
    break;
  }
  const eras = W.chron?.eras || [];
  if (eras.length) {
    const last = eras[eras.length - 1];
    const ek = `era:${last.name}:${last.start}`;
    if (!_announcedMoments.has(ek) && eras.length > 0) {
      _announcedMoments.add(ek);
      if (eras.length > 1) showMoment('New age', last.name, formatAge(last.start), momentRGB(ek));
    }
  }
  const drama = explainDrama(W);
  if (drama?.title) {
    const dk = `drama:${drama.title}`;
    if (!_announcedDrama.has(dk)) {
      _announcedDrama.add(dk);
      showMoment(drama.title, drama.body, drama.settle || '');
    }
  }
}

function showMoment(kicker, title, sub, rgb = null) {
  const el = document.getElementById('moment');
  if (!el) return;
  el.querySelector('.m-kicker').textContent = kicker;
  el.querySelector('.m-title').textContent = title;
  el.querySelector('.m-sub').textContent = sub || '';
  const chip = el.querySelector('.m-chip');
  if (chip) {
    if (rgb) {
      chip.style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      chip.style.boxShadow = `0 0 28px rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`;
      chip.hidden = false;
    } else {
      chip.hidden = true;
    }
  }
  el.classList.add('show');
  clearTimeout(_momentTimer);
  _momentTimer = setTimeout(() => el.classList.remove('show'), 4200);
}

function resetMomentAnnouncer() {
  _announcedMoments = new Set();
  _announcedDrama = new Set();
}

/* ---------- boot UI ---------- */
export function boot() {
  const cvs = document.getElementById('c');
  initGL(cvs);

  const rulesEl = document.getElementById('rules');
  RULESETS.forEach((r, i) => {
    const b = document.createElement('button');
    b.textContent = r.name;
    b.title = r.blurb;
    b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    b.onclick = () => setRuleset(i);
    rulesEl.appendChild(b);
  });

  setupCatalogue();
  setupGodPanel();
  setupClimatePanel();
  setupPlatesPanel();
  setupTips();
  setupReveal();

  const PRIMARY_TOOLS = new Set(['inspect', 'core', 'icecore', 'solar', 'seedGuild', 'raise', 'lower', 'meteor', 'co2', 'albedo']);
  const toolsEl = document.getElementById('tools');
  const toolsMore = document.getElementById('toolsMore');
  const syncToolPress = () => {
    const all = [...(toolsEl?.children || []), ...(toolsMore?.children || [])];
    all.forEach((x) => x.setAttribute('aria-pressed', x.dataset.id === activeTool ? 'true' : 'false'));
  };
  TOOLS.forEach((t) => {
    const b = document.createElement('button');
    decorateButton(b, t.id, t.name);
    b.dataset.id = t.id;
    const tip = tipForTool(t.id);
    const meta = [
      t.key ? `Key ${t.key.toUpperCase()}` : null,
      t.drag ? 'Right-drag to stroke' : null,
      t.irreversible ? 'Hold to commit' : null,
      t.cost ? `Listed cost ~${t.cost}` : 'Free',
    ].filter(Boolean).join(' · ');
    if (tip) bindTip(b, tip.title, tip.body, meta);
    else b.title = meta;
    b.onclick = () => {
      if (toolsUnlocked(W)[t.id] === false) return;
      setTool(t.id); syncToolPress();
      if (!PRIMARY_TOOLS.has(t.id)) setSuiteDesk('tools', 'more');
      else setSuiteDesk('tools', 'verbs');
    };
    if (t.id === 'inspect') b.setAttribute('aria-pressed', 'true');
    (PRIMARY_TOOLS.has(t.id) ? toolsEl : toolsMore)?.appendChild(b);
  });

  const overlaySel = document.getElementById('overlayMode');
  if (overlaySel) {
    overlaySel.innerHTML = OVERLAYS.map((o) =>
      `<option value="${o.id}">${o.label}</option>`).join('');
    overlaySel.value = 'none';
    overlaySel.onchange = () => {
      setOverlayMode(overlaySel.value);
      refreshColours(1);
      syncViewOverlayButtons(overlaySel.value);
    };
  }

  // View → Layers: same overlays as Lab, with icons
  const viewOverlays = document.getElementById('viewOverlays');
  if (viewOverlays) {
    const prefer = ['none', 'temp', 'press', 'wind', 'plates', 'bounds', 'crust', 'crustAge', 'tide', 'storm', 'npp', 'guild'];
    const icons = {
      none: 'inspect', temp: 'solar', press: 'weather', wind: 'spin', plates: 'plate',
      bounds: 'quake', crust: 'core', crustAge: 'deeptime', tide: 'moon', storm: 'stormdesk',
      npp: 'seedGuild', guild: 'o2', intertidal: 'flats', upwell: 'river', vent: 'plume', lid: 'ice',
    };
    const ordered = [
      ...prefer.map((id) => OVERLAYS.find((o) => o.id === id)).filter(Boolean),
      ...OVERLAYS.filter((o) => !prefer.includes(o.id)),
    ];
    viewOverlays.innerHTML = ordered.map((o) =>
      `<button type="button" data-overlay="${o.id}">${iconSVG(icons[o.id] || 'inspect')}<span class="btn-label">${o.label}</span></button>`
    ).join('');
    viewOverlays.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-overlay]');
      if (!btn) return;
      const mode = btn.dataset.overlay;
      setOverlayMode(mode);
      refreshColours(1);
      if (overlaySel) overlaySel.value = mode;
      syncViewOverlayButtons(mode);
    });
    syncViewOverlayButtons('none');
  }

  const viewGuides = document.getElementById('viewOrbitGuides');
  if (viewGuides) {
    decorateButton(viewGuides, 'orbitguides', 'Axis guides');
    viewGuides.setAttribute('aria-pressed', S.orbitGuides ? 'true' : 'false');
    viewGuides.addEventListener('click', () => {
      S.orbitGuides = !S.orbitGuides;
      viewGuides.setAttribute('aria-pressed', S.orbitGuides ? 'true' : 'false');
      const b = document.getElementById('orbitguides');
      b?.setAttribute('aria-pressed', S.orbitGuides ? 'true' : 'false');
    });
  }

  // Dock tabs
  document.querySelectorAll('.dock-tabs button').forEach((b) => {
    b.onclick = () => setDockTab(b.dataset.tab);
  });
  document.getElementById('docktoggle')?.addEventListener('click', () => {
    document.getElementById('dock')?.classList.toggle('collapsed');
  });

  document.getElementById('pause').onclick = togglePause;
  document.getElementById('newseed').onclick = () => runGenerate(freshSeed(), W.rule);
  document.getElementById('budget').onclick = () => {
    const modes = [SCARCITY.free, SCARCITY.observe, SCARCITY.budgeted];
    const cur = W.scarcityMode || (W.budgetMode ? SCARCITY.budgeted : SCARCITY.free);
    const next = modes[(modes.indexOf(cur) + 1) % modes.length];
    setScarcityMode(next);
    const b = document.getElementById('budget');
    b.setAttribute('aria-pressed', next !== SCARCITY.free ? 'true' : 'false');
    decorateButton(b, 'budget', next === SCARCITY.free ? 'Free' : next === SCARCITY.observe ? 'Observe' : 'Budget');
    refreshWorldModeStrip();
    updateHUD();
  };
  document.getElementById('autopilot').onclick = () => {
    W.autopilot = !W.autopilot;
    document.getElementById('autopilot').setAttribute('aria-pressed', W.autopilot ? 'true' : 'false');
    chronLog(W.year, 'gaia', 0, 1, W.autopilot ? 'Gaia autopilot ON' : 'Autopilot OFF');
    refreshWorldModeStrip();
  };
  document.getElementById('deeptime')?.addEventListener('click', () => {
    const on = !W.rule.deepTime;
    const rule = { ...W.rule, deepTime: on, startAgeGa: on ? 0 : undefined };
    document.getElementById('deeptime').setAttribute('aria-pressed', on ? 'true' : 'false');
    runGenerate(W.seed, rule);
  });
  document.getElementById('simN')?.addEventListener('change', (e) => {
    const n = parseInt(e.target.value, 10);
    if (!N_ALLOWED.includes(n)) return;
    try {
      changeResolution(n);
      remeshPlanet();
      const eng = getGpgpu();
      if (eng?.ok) {
        eng.destroySlot('primary');
        eng.createSlot('primary', { N: n });
      }
      runGenerate(W.seed, W.rule);
      showMoment('Resolution', `N=${n}`, `~${cellKm(n)} km/cell`);
    } catch (err) {
      showErr(String(err.message || err));
    }
  });
  document.getElementById('orreryTable')?.addEventListener('click', () => {
    TABLE.enabled = !TABLE.enabled;
    document.getElementById('orreryTable').setAttribute('aria-pressed', TABLE.enabled ? 'true' : 'false');
    if (TABLE.enabled) syncTableFromShelf(TABLE, W);
    showMoment('Orrery table', TABLE.enabled ? 'On' : 'Off',
      TABLE.enabled ? `${TABLE.slots.length} worlds · click to load` : '');
  });
  document.getElementById('export').onclick = () => {
    const text = exportChronicle(W.chron, W.rule.name, W);
    const blob = new Blob([text], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orrery-${W.rule.id}-${W.seed}.md`;
    a.click();
  };
  document.getElementById('labRefresh')?.addEventListener('click', refreshLab);
  document.getElementById('labPaper')?.addEventListener('click', () => {
    const text = exportPaper(W, W.chron);
    const blob = new Blob([text], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orrery-paper-${W.rule.id}-${W.seed}.md`;
    a.click();
  });
  document.getElementById('labSave')?.addEventListener('click', () => downloadSave());
  document.getElementById('labFinale')?.addEventListener('click', () => {
    const art = finaleArtefact(W, detectEnding(W) || undefined);
    const md = formatFinaleMarkdown(art);
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orrery-finale-${W.seed}.md`;
    a.click();
    showMoment(art.ending.title, art.worldName, art.ageLabel);
  });
  document.getElementById('labPng')?.addEventListener('click', async () => {
    const svg = document.querySelector('#labstats svg');
    if (!svg) return;
    try {
      await downloadInstrumentPng(svg, `orrery-lab-${W.seed}.png`, `${W.rule?.name || 'world'} · ${W.seed}`);
    } catch (e) {
      showErr(String(e.message || e));
    }
  });
  document.getElementById('labDual')?.addEventListener('click', () => {
    const status = document.getElementById('status');
    try {
      const worker = new Worker(new URL('./sim/worker.js', import.meta.url), { type: 'module' });
      const seed = W.seed;
      const ruleId = W.rule?.id || 'terra';
      worker.onmessage = (ev) => {
        const msg = ev.data || {};
        if (msg.type === 'ready') {
          worker.postMessage({ type: 'generate', seed, ruleId, deepTime: !!W.rule?.deepTime });
          return;
        }
        if (msg.type === 'generated') {
          worker.postMessage({ type: 'tick', ticks: 24 });
          return;
        }
        if (msg.type === 'tickDone') {
          const localHint = ((W.meanTemp * 1e6 + W.meanLife * 1e3) | 0);
          if (status) {
            status.textContent = `Dual-run worker hash ${msg.hashHint} · main ~${localHint} · age ${msg.ageYr?.toFixed?.(0) ?? msg.ageYr}`;
          }
          worker.terminate();
        }
        if (msg.type === 'error') {
          showErr(msg.message);
          worker.terminate();
        }
      };
      worker.postMessage({ type: 'init' });
      if (status) status.textContent = 'Dual-run worker starting…';
    } catch (e) {
      showErr('Worker unavailable: ' + (e.message || e));
    }
  });
  const opacityEl = document.getElementById('opacity');
  const opacityVal = document.getElementById('opacityVal');
  const xrayEl = document.getElementById('xray');
  const xrayAmt = document.getElementById('xrayAmt');
  const xrayVal = document.getElementById('xrayVal');
  const xrayRow = document.getElementById('xrayRow');
  const gridEl = document.getElementById('grid');
  const gridVal = document.getElementById('gridVal');
  const syncView = () => {
    S.opacity = clamp((+opacityEl.value) / 100, 0.15, 1);
    opacityVal.textContent = `${opacityEl.value}%`;
    const on = xrayEl.checked;
    xrayRow.style.opacity = on ? '1' : '0.45';
    xrayRow.style.pointerEvents = on ? 'auto' : 'none';
    // Checkbox alone does nothing at Cut 0 — bump to a visible cutaway when enabling
    if (on && +xrayAmt.value < 5) {
      xrayAmt.value = '45';
    }
    S.xray = on ? clamp((+xrayAmt.value) / 100, 0, 0.85) : 0;
    xrayVal.textContent = `${xrayAmt.value}%`;
    S.grid = clamp((+gridEl.value) / 100, 0, 1);
    gridVal.textContent = S.grid < 0.01 ? 'off' : `${gridEl.value}%`;
  };
  opacityEl.addEventListener('input', syncView);
  xrayEl.addEventListener('change', () => {
    if (xrayEl.checked && +xrayAmt.value < 5) xrayAmt.value = '45';
    syncView();
  });
  xrayAmt.addEventListener('input', syncView);
  gridEl.addEventListener('input', syncView);
  document.getElementById('viewClear')?.addEventListener('click', () => {
    opacityEl.value = '100';
    gridEl.value = '0';
    syncView();
  });
  document.getElementById('viewGhost')?.addEventListener('click', () => {
    opacityEl.value = '40';
    syncView();
  });
  syncView();

  S.localSize = LOCAL_SIZES[1]; // M — grid-first corner
  const localPanel = document.getElementById('localpanel');
  const localCvs = document.getElementById('localview');
  const localLegend = document.getElementById('locallegend');
  const localStatus = document.getElementById('localstatus');
  const mkSeg = (hostId, values, labels, get, set) => {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    values.forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = labels[i];
      b.dataset.v = String(v);
      b.setAttribute('aria-pressed', get() === v ? 'true' : 'false');
      b.onclick = () => {
        set(v);
        [...host.children].forEach((x) =>
          x.setAttribute('aria-pressed', x.dataset.v === String(v) ? 'true' : 'false'));
      };
      host.appendChild(b);
    });
  };
  const syncSegPressed = (hostId, get) => {
    const host = document.getElementById(hostId);
    if (!host) return;
    const cur = String(get());
    [...host.children].forEach((x) =>
      x.setAttribute('aria-pressed', x.dataset.v === cur ? 'true' : 'false'));
  };
  const syncLocalLayout = () => {
    layoutLocalPanel(localPanel, localCvs, {
      size: S.localSize,
      snap: S.localSnap,
      expanded: S.localExpanded,
    });
    const tag = document.getElementById('localframetag');
    if (tag) tag.textContent = localFrameLabel(S.localSize, S.localExpanded);
    const shrink = document.getElementById('localshrink');
    const grow = document.getElementById('localgrow');
    const fi = localFrameIndex(S.localSize, S.localExpanded);
    if (shrink) shrink.disabled = fi <= 0;
    if (grow) grow.disabled = fi >= LOCAL_SIZES.length;
    syncSegPressed('localSize', () => S.localSize);
    placeLocalBarOverflow();
    requestAnimationFrame(() => placeLocalBarOverflow());
  };
  /** Park bar controls into ⋯ when the panel is too narrow; restore when it grows. */
  const placeLocalBarOverflow = () => {
    const tools = document.querySelector('#localbar .local-tools');
    const moreBtn = document.getElementById('localmorebtn');
    const radius = document.getElementById('localRadius');
    const move = document.getElementById('localMove');
    const sepZoom = document.getElementById('localSepZoom');
    const sepMove = document.getElementById('localSepMove');
    const radiusWrap = document.getElementById('localRadiusMoreWrap');
    const moveWrap = document.getElementById('localMoveMoreWrap');
    if (!tools || !moreBtn || !radius || !move || !radiusWrap || !moveWrap) return;

    const fits = () => tools.scrollWidth <= tools.clientWidth + 1;

    // Prefer everything in the bar (roomiest first).
    if (sepZoom) {
      tools.insertBefore(sepZoom, moreBtn);
      sepZoom.hidden = false;
    }
    tools.insertBefore(radius, moreBtn);
    radiusWrap.hidden = true;
    if (sepMove) {
      tools.insertBefore(sepMove, moreBtn);
      sepMove.hidden = false;
    }
    tools.insertBefore(move, moreBtn);
    moveWrap.hidden = true;

    // Drop nudge first — it's the tallest / widest secondary control.
    if (!fits()) {
      moveWrap.appendChild(move);
      moveWrap.hidden = false;
      if (sepMove) sepMove.hidden = true;
    }
    // Then zoom chips if still tight (S panel).
    if (!fits()) {
      radiusWrap.appendChild(radius);
      radiusWrap.hidden = false;
      if (sepZoom) sepZoom.hidden = true;
    }

    const packed = !moveWrap.hidden || !radiusWrap.hidden;
    moreBtn.dataset.packed = packed ? 'true' : 'false';
    const bits = [];
    if (!radiusWrap.hidden) bits.push('zoom');
    if (!moveWrap.hidden) bits.push('nudge');
    bits.push('snap', 'globe');
    moreBtn.title = bits.join(' · ');

    // Keep more panel under the (now shorter) bar when nudge left it.
    const more = document.getElementById('localmore');
    const bar = document.getElementById('localbar');
    // Bar straddles the panel top (translateY -50%), so its visual bottom is ~half height.
    if (more && bar) more.style.top = `${Math.ceil(bar.offsetHeight * 0.5 + 6)}px`;
  };
  const stepLocalFrame = (dir) => {
    const max = LOCAL_SIZES.length; // last index = full
    let i = localFrameIndex(S.localSize, S.localExpanded);
    const next = Math.max(0, Math.min(max, i + dir));
    if (next === i) return;
    if (next >= LOCAL_SIZES.length) {
      S.localExpanded = true;
    } else {
      S.localExpanded = false;
      S.localSize = LOCAL_SIZES[next];
    }
    syncLocalLayout();
  };
  if (localLegend) {
    localLegend.innerHTML = '';
    const LEGEND_TIP = {
      canopy: 'Canopy / complex plant cover',
      grass: 'Grassland',
      cyanobacteria: 'Cyanobacteria',
      purpleSulfur: 'Purple sulfur bacteria',
      reef: 'Reef',
      ocean: 'Open ocean',
      barren: 'Barren rock / soil',
      savanna: 'Savanna',
      desert: 'Desert',
      ice: 'Ice / snow',
      fauna: 'Fauna',
      settler: 'Settlements',
    };
    for (const e of legendEntries()) {
      const el = document.createElement('span');
      el.className = 'leg';
      el.dataset.key = e.id;
      el.title = LEGEND_TIP[e.id] || e.label;
      const sw = document.createElement('i');
      sw.style.background = `rgb(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]})`;
      el.appendChild(sw);
      el.appendChild(document.createTextNode(e.label));
      el.addEventListener('pointerenter', () => {
        S.localLegendLock = e.id;
        S.localHoverKey = e.id;
      });
      el.addEventListener('pointerleave', () => {
        if (S.localLegendLock === e.id) S.localLegendLock = null;
      });
      localLegend.appendChild(el);
    }
  }
  syncLocalChrome = (patch, hoverKey) => {
    if (localLegend) {
      for (const el of localLegend.children) {
        const k = el.dataset.key;
        const on = hoverKey && k === hoverKey;
        el.classList.toggle('on', !!on);
        el.classList.toggle('dim', !!(hoverKey && !on));
      }
    }
    if (localStatus && patch?.status) {
      const st = patch.status;
      const bit = (k, v) =>
        `<span class="st" data-k="${k}"><em>${k}</em><b>${v}</b></span>`;
      localStatus.innerHTML = [
        bit('focus', st.pinned ? 'pinned' : 'live'),
        bit('cell', st.cell),
        st.label ? bit('life', st.label) : '',
        st.biome ? bit('biome', st.biome) : '',
        bit('view', `${st.side}×${st.side}`),
      ].filter(Boolean).join('');
      localStatus.title = [
        st.pinned ? 'Pinned focus' : 'Live focus (follows inspect)',
        `Cell ${st.cell}`,
        st.label ? `Life: ${st.label}` : '',
        st.biome ? `Biome: ${st.biome}` : '',
        `Map ${st.side}×${st.side} cells`,
      ].filter(Boolean).join(' · ');
      localStatus.classList.toggle('pinned', !!st.pinned);
    }
  };
  mkSeg('localSnap', LOCAL_SNAPS, ['TL', 'TR', 'BL', 'BR'],
    () => S.localSnap,
    (v) => { S.localSnap = v; syncLocalLayout(); });
  mkSeg('localGlobe', LOCAL_GLOBE, ['Off', 'Rim', 'Wash', 'Both'],
    () => S.localGlobe,
    (v) => {
      S.localGlobe = v;
      refreshColours(1);
    });
  mkSeg('localRadius', LOCAL_RADII, LOCAL_RADIUS_LABELS,
    () => S.localRadius,
    (v) => { S.localRadius = v; refreshColours(1); });
  // Optional size chips if host still present (⋯ used to have them)
  mkSeg('localSize', LOCAL_SIZES, LOCAL_SIZE_LABELS,
    () => S.localSize,
    (v) => { S.localExpanded = false; S.localSize = v; syncLocalLayout(); });
  syncLocalLayout();
  document.getElementById('localshrink')?.addEventListener('click', () => stepLocalFrame(-1));
  document.getElementById('localgrow')?.addEventListener('click', () => stepLocalFrame(1));
  document.getElementById('localframetag')?.addEventListener('click', () => {
    // Snap to next rung (wraps Full → S)
    const i = localFrameIndex(S.localSize, S.localExpanded);
    if (i >= LOCAL_SIZES.length) {
      S.localExpanded = false;
      S.localSize = LOCAL_SIZES[0];
      syncLocalLayout();
    } else {
      stepLocalFrame(1);
    }
  });
  document.getElementById('localmorebtn')?.addEventListener('click', () => {
    const box = document.getElementById('localmore');
    const btn = document.getElementById('localmorebtn');
    const on = !box?.classList.contains('open');
    box?.classList.toggle('open', on);
    btn?.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  window.addEventListener('resize', () => {
    syncLocalLayout();
  });

  const pinLocal = (cell) => {
    if (cell == null || cell < 0) return;
    S.localPin = cell | 0;
    if (S.localGlobe === 'wash' || S.localGlobe === 'both') refreshColours(1);
  };
  const clearLocalPin = () => {
    S.localPin = -1;
    if (S.localGlobe === 'wash' || S.localGlobe === 'both') refreshColours(1);
  };
  const nudgeLocal = (dx, dy) => {
    const base = S.localPin >= 0 ? S.localPin : S._localFocus;
    if (base < 0) return;
    pinLocal(stepFocus(base, dx, dy));
  };
  const stepLocalZoom = (dir) => {
    const i = LOCAL_RADII.indexOf(S.localRadius);
    const ni = Math.max(0, Math.min(LOCAL_RADII.length - 1, (i < 0 ? 2 : i) + dir));
    if (LOCAL_RADII[ni] === S.localRadius) return;
    S.localRadius = LOCAL_RADII[ni];
    syncSegPressed('localRadius', () => S.localRadius);
    refreshColours(1);
  };

  // Move pad
  const moveHost = document.getElementById('localMove');
  if (moveHost) {
    const mk = (label, fn, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (title) b.title = title;
      b.onclick = fn;
      moveHost.appendChild(b);
      return b;
    };
    mk('↖', () => nudgeLocal(-1, -1));
    mk('↑', () => nudgeLocal(0, -1));
    mk('↗', () => nudgeLocal(1, -1));
    mk('←', () => nudgeLocal(-1, 0));
    const auto = mk('·', clearLocalPin, 'Auto — release pin');
    auto.dataset.auto = '1';
    auto.textContent = 'A';
    mk('→', () => nudgeLocal(1, 0));
    mk('↙', () => nudgeLocal(-1, 1));
    mk('↓', () => nudgeLocal(0, 1));
    mk('↘', () => nudgeLocal(1, 1));
    placeLocalBarOverflow();
  }

  localPanel?.addEventListener('transitionend', (e) => {
    if (e.target !== localPanel) return;
    if (e.propertyName === 'width' || e.propertyName === 'transform' || e.propertyName === 'max-height') {
      placeLocalBarOverflow();
    }
  });

  // Drag / click the flat map to move the window across the globe
  let localDrag = null;
  let localAccX = 0, localAccY = 0;
  localCvs.style.cursor = 'crosshair';
  localCvs.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    localCvs.setPointerCapture(e.pointerId);
    localCvs.style.cursor = 'grabbing';
    const base = S.localPin >= 0 ? S.localPin : S._localFocus;
    localDrag = { x: e.clientX, y: e.clientY, moved: false, startPin: base };
    localAccX = 0; localAccY = 0;
    if (S.localPin < 0 && base >= 0) S.localPin = base;
  });
  localCvs.addEventListener('pointermove', (e) => {
    const rect = localCvs.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    if (!localDrag) {
      const c = hoverCellAt(S._localPatch, cssX, cssY);
      S.localHoverCell = c;
      if (!S.localLegendLock) {
        S.localHoverKey = c >= 0 ? legendKeyAt(W, c) : null;
      }
      return;
    }
    const dx = e.clientX - localDrag.x;
    const dy = e.clientY - localDrag.y;
    if (!localDrag.moved && Math.hypot(dx, dy) < 5) return;
    localDrag.moved = true;
    const lay = S._localPatch?.layout;
    const cellCss = lay ? lay.cellPx / (lay.dpr || 1) : 12;
    localAccX += dx;
    localAccY += dy;
    localDrag.x = e.clientX;
    localDrag.y = e.clientY;
    const stepsX = Math.trunc(localAccX / cellCss);
    const stepsY = Math.trunc(localAccY / cellCss);
    if (!stepsX && !stepsY) return;
    localAccX -= stepsX * cellCss;
    localAccY -= stepsY * cellCss;
    // Drag map content with the pointer (grab-and-slide)
    const next = stepFocus(S.localPin >= 0 ? S.localPin : localDrag.startPin, -stepsX, -stepsY);
    pinLocal(next);
  });
  localCvs.addEventListener('pointerleave', () => {
    if (localDrag) return;
    S.localHoverCell = -1;
    if (!S.localLegendLock) S.localHoverKey = null;
  });
  const endLocalDrag = (e) => {
    if (!localDrag) return;
    localCvs.style.cursor = 'crosshair';
    if (!localDrag.moved) {
      const rect = localCvs.getBoundingClientRect();
      const c = hoverCellAt(S._localPatch, e.clientX - rect.left, e.clientY - rect.top);
      if (c >= 0) pinLocal(c);
    }
    localDrag = null;
  };
  localCvs.addEventListener('pointerup', endLocalDrag);
  localCvs.addEventListener('pointercancel', () => { localDrag = null; localCvs.style.cursor = 'crosshair'; });
  localPanel?.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.altKey || e.metaKey) {
      stepLocalFrame(e.deltaY > 0 ? -1 : 1);
      return;
    }
    stepLocalZoom(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    audioInit();
    if (TABLE.enabled) {
      const slot = desktopTablePick(e.clientX, e.clientY);
      if (slot) {
        loadTableSlot(slot);
        e.preventDefault();
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      const cell = desktopPick(e.clientX, e.clientY);
      if (cell != null && cell >= 0) {
        pinLocal(cell);
        e.preventDefault();
        return;
      }
    }
    if (e.button === 2 || e.altKey || (activeTool !== 'inspect' && !e.shiftKey)) {
      const cell = desktopPick(e.clientX, e.clientY);
      if (activeTool === 'buster') {
        startCommitHold(cell);
        return;
      }
      if (activeTool === 'meteor') {
        onToolResult(useToolAt(cell, {
          mass: 0.8 + (W.rngGod?.() ?? 0.5) * 0.6,
          velocity: 0.7 + (W.rngGod?.() ?? 0.5) * 0.5,
          angle: 30 + (W.rngGod?.() ?? 0.5) * 50,
        }));
      } else if (e.altKey) {
        fingerOfGod(cell, e.shiftKey ? 'delete' : 'boost');
        playEvent('seed', 0.5);
      } else {
        const tool = TOOLS.find((t) => t.id === activeTool);
        if (tool?.drag && cell >= 0) {
          const r = beginToolDrag(cell);
          if (r?.ok) { S.toolDrag = true; canvas.setPointerCapture(e.pointerId); }
          else onToolResult(r || useToolAt(cell));
        } else {
          onToolResult(useToolAt(cell));
        }
      }
      return;
    }
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', () => {
    if (S.toolDrag) { endToolDrag(); S.toolDrag = false; refreshColours(1); }
    if (S.commitHold) cancelCommitHold(false);
    dragging = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (S.toolDrag) {
      const cell = desktopPick(e.clientX, e.clientY);
      if (cell >= 0) { moveToolDrag(cell); refreshColours(0.4); }
      return;
    }
    if (!dragging) {
      // Brush preview on hover for sculpt tools
      const tool = TOOLS.find((t) => t.id === activeTool);
      if (tool?.drag || tool?.id === 'seedGuild') {
        const cell = desktopPick(e.clientX, e.clientY);
        if (cell >= 0) previewBrush(cell);
      }
      return;
    }
    const dx = (e.clientX - lastX) / 220, dy = (e.clientY - lastY) / 220;
    lastX = e.clientX; lastY = e.clientY;
    // Angular momentum. Item 11.
    S.angVel[0] = S.angVel[0] * 0.4 + dy * 0.6;
    S.angVel[1] = S.angVel[1] * 0.4 + dx * 0.6;
    qAxis(tmpQ, 0, 1, 0, dx); qmul(S.q, tmpQ, S.q);
    qAxis(tmpQ, 1, 0, 0, dy); qmul(S.q, tmpQ, S.q);
    qnorm(S.q);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    S.camDist = clamp(S.camDist * (1 + Math.sign(e.deltaY) * 0.09), 1.06, 6.5);
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  addEventListener('keydown', (e) => {
    audioInit();
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    if (e.key === 'Escape' && S.localExpanded) {
      stepLocalFrame(-1);
      return;
    }
    const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (arrow) {
      e.preventDefault();
      nudgeLocal(arrow[0], arrow[1]);
      return;
    }
    if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      stepCatalogueWorld(e.key === ']' ? 1 : -1);
      return;
    }
    if (e.key >= '1' && e.key <= '5') setRuleset(+e.key - 1);
    else if (e.key === 'r' || e.key === 'R') runGenerate(freshSeed(), W.rule);
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === ',' || e.key === '<') {
      e.preventDefault();
      applyTimeRate(-1);
    }
    else if (e.key === '.' || e.key === '>') {
      e.preventDefault();
      applyTimeRate(1);
    }
    else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const r = undoStroke();
      if (r) { showErr(r.note); refreshColours(1); needGeom(); }
    }
    else if (e.key === '+' || e.key === '=') {
      setTool('solar');
      onToolResult(useToolAt(S._localFocus >= 0 ? S._localFocus : 0, { delta: 0.05 }));
    }
    else if (e.key === '-' || e.key === '_') {
      setTool('solar');
      onToolResult(useToolAt(S._localFocus >= 0 ? S._localFocus : 0, { delta: -0.05 }));
    }
    else {
      const t = TOOLS.find((x) => x.key && x.key === e.key)
        || TOOLS.find((x) => x.key && x.key.toLowerCase() === e.key.toLowerCase());
      if (t) {
        if (toolsUnlocked(W)[t.id] === false) return;
        setTool(t.id);
        syncToolPress();
      }
    }
  });

  setupXR();
  const bad = validateCatalogueWorlds();
  if (bad.length) console.warn('[orrery] catalogue worlds failed sanitize:', bad);
  else console.log(`[orrery] catalogue · ${CATALOGUE_WORLDS.length} worlds ready`);
  runGenerate(20260808, RULESETS[0]);
  requestAnimationFrame(desktopFrame);
  console.log(`[orrery] foundations rebuild · ${NC.toLocaleString()} cells · ${(vIdx.length / 3).toLocaleString()} tris`);
}

function resize() {
  const d = Math.min(devicePixelRatio || 1, 2);
  const w = Math.floor(innerWidth * d), h = Math.floor(innerHeight * d);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
addEventListener('resize', resize);

function desktopFrame(t) {
  if (xrSession) return;
  requestAnimationFrame(desktopFrame);
  resize();
  update(t);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  const sky = W.rule.sky;
  gl.clearColor(sky[0], sky[1], sky[2], 1);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  const eye = [0, 0.28, S.camDist];
  m4persp(PROJ, 50 * Math.PI / 180, canvas.width / canvas.height, 0.02, 900);
  m4lookAt(VIEW, eye, [0, 0, 0], [0, 1, 0]);
  drawScene(PROJ, VIEW, eye, false, S, hands);
}

function setupXR() {
  const vrbtn = document.getElementById('vrbtn');
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
      if (ok) { vrbtn.disabled = false; vrbtn.textContent = 'Enter VR'; }
      else vrbtn.textContent = 'No VR device';
    }).catch(() => { vrbtn.textContent = 'VR unavailable'; });
  } else vrbtn.textContent = 'WebXR not supported';

  vrbtn.addEventListener('click', async () => {
    if (xrSession) { xrSession.end(); return; }
    try {
      audioInit();
      const s = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
      });
      await gl.makeXRCompatible();
      s.updateRenderState({ baseLayer: new XRWebGLLayer(s, gl), depthNear: 0.05, depthFar: 900 });
      xrRefSpace = await s.requestReferenceSpace('local-floor').catch(() => s.requestReferenceSpace('local'));
      xrSession = s;
      document.getElementById('ui').classList.add('hidden');
      vrbtn.textContent = 'Exit VR';
      s.addEventListener('end', () => {
        xrSession = null; camWorld = null;
        document.getElementById('ui').classList.remove('hidden');
        vrbtn.textContent = 'Enter VR';
        requestAnimationFrame(desktopFrame);
      });
      s.requestAnimationFrame(xrFrame);
    } catch (err) {
      showErr('Could not start VR: ' + err.message);
    }
  });
}

function readControllers(frame) {
  hands[0].active = hands[1].active = false;
  let i = 0;
  const grips = [];
  for (const src of xrSession.inputSources) {
    if (i > 1) break;
    const h = hands[i];
    const space = src.gripSpace || src.targetRaySpace;
    const pose = space ? frame.getPose(space, xrRefSpace) : null;
    if (!pose) { h.prev = null; i++; continue; }
    const m = pose.transform.matrix;
    const px = m[12], py = m[13], pz = m[14];
    if (h.active) {
      h.vel[0] = px - h.pos[0]; h.vel[1] = py - h.pos[1]; h.vel[2] = pz - h.pos[2];
    }
    h.active = true; h.pos[0] = px; h.pos[1] = py; h.pos[2] = pz;
    grips.push(h.pos);

    // Hand tracking: skeleton → gestures → grab / shade / cup / table pick
    if (src.hand && typeof frame.getJointPose === 'function') {
      const sk = readHandSkeleton(frame, xrRefSpace, src.hand);
      h.skeleton = sk;
      h.gesture = gestureFromSkeleton(sk);
      if (sk?.wrist) h.wrist = sk.wrist;
      if (sk?.indexTip) h.indexTip = sk.indexTip;
      const g = applyHandGesture(h, {
        planetPos: S.posXR,
        planetScale: S.scaleXR,
        tableEnabled: TABLE.enabled,
      });
      if (g.grab) h.grab = true;
      if (g.solarMod != null) W._solarMod = Math.min(W._solarMod ?? 1, g.solarMod);
      if (g.scaleDelta !== 1) S.scaleXR = clamp(S.scaleXR * g.scaleDelta, 0.07, 0.95);
      if (g.aim) h.aim = g.aim;
      if (g.loadPoint && !readControllers._tablePick) {
        const slot = pickTableSlot(TABLE, g.loadPoint, [0, 0, 0], 0.16, 1);
        if (slot) {
          readControllers._tablePick = true;
          loadTableSlot(slot);
        }
      } else if (!g.loadPoint) {
        readControllers._tablePick = false;
      }
    }

    const gp = src.gamepad;
    const trig = gp ? (gp.buttons[0]?.pressed || gp.buttons[1]?.pressed) : false;
    const wasGrab = !!h.grab;
    if (!src.hand) h.grab = !!trig;
    else if (trig) h.grab = true;

    // Haptic pulse on grab edge when actuators exist
    if (h.grab && !wasGrab && gp?.hapticActuators?.length) {
      try {
        gp.hapticActuators[0].pulse?.(0.55, 36);
      } catch { /* haptic optional */ }
    }

    if (trig) {
      const dx = h.pos[0] - S.posXR[0], dy = h.pos[1] - S.posXR[1], dz = h.pos[2] - S.posXR[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      const cur = [dx / l, dy / l, dz / l];
      if (h.prev) {
        qFromTo(tmpQ, h.prev, cur);
        qmul(S.q, tmpQ, S.q); qnorm(S.q);
      }
      h.prev = cur;
    } else {
      // release after grab with velocity → meteor throw
      if (h.prev && activeTool === 'meteor') {
        const speed = Math.hypot(h.vel[0], h.vel[1], h.vel[2]);
        if (speed > 0.02) {
          const cell = pickCell(h.pos, h.vel, S.posXR, S.scaleXR, S.q);
          onToolResult(useToolAt(cell, { power: clamp(speed * 20, 0.4, 2) }));
        }
      }
      h.prev = null;
    }

    if (gp && gp.axes.length >= 4) {
      const ay = gp.axes[3];
      if (Math.abs(ay) > 0.18) S.scaleXR = clamp(S.scaleXR - ay * 0.006, 0.07, 0.95);
    }
    // Squeeze grip (button 1) uses tool at aim
    if (gp && gp.buttons[1]?.pressed && !readControllers._grip) {
      readControllers._grip = true;
      const ray = src.targetRaySpace ? frame.getPose(src.targetRaySpace, xrRefSpace) : null;
      if (ray) {
        const tm = ray.transform.matrix;
        const origin = [tm[12], tm[13], tm[14]];
        // forward is -Z of pose
        const dir = [-tm[8], -tm[9], -tm[10]];
        const cell = pickCell(origin, dir, S.posXR, S.scaleXR, S.q);
        onToolResult(useToolAt(cell));
      }
    }
    if (gp && !gp.buttons[1]?.pressed) readControllers._grip = false;

    if (gp && gp.buttons[4]?.pressed && !readControllers._btn) {
      readControllers._btn = true;
      setRuleset((RULESETS.indexOf(W.rule) + 1) % RULESETS.length);
    }
    if (gp && !gp.buttons[4]?.pressed) readControllers._btn = false;
    i++;
  }

  // Two-handed scale: both grips held → distance drives scale
  if (hands[0].grab && hands[1].grab && hands[0].active && hands[1].active) {
    const d = Math.hypot(
      hands[0].pos[0] - hands[1].pos[0],
      hands[0].pos[1] - hands[1].pos[1],
      hands[0].pos[2] - hands[1].pos[2]
    );
    if (readControllers._pinchD) {
      const ratio = d / readControllers._pinchD;
      S.scaleXR = clamp(S.scaleXR * ratio, 0.07, 0.95);
    }
    readControllers._pinchD = d;
  } else readControllers._pinchD = null;

  grabbing = hands[0].grab || hands[1].grab;
}

function xrFrame(t, frame) {
  const s = frame.session;
  s.requestAnimationFrame(xrFrame);
  const pose = frame.getViewerPose(xrRefSpace);
  if (!pose) return;
  readControllers(frame);
  update(t);

  const layer = s.renderState.baseLayer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
  const sky = W.rule.sky;
  gl.clearColor(sky[0], sky[1], sky[2], 1);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  const hp = pose.transform.position;
  camWorld = [hp.x, hp.y, hp.z];
  for (const view of pose.views) {
    const vp = layer.getViewport(view);
    gl.viewport(vp.x, vp.y, vp.width, vp.height);
    const ep = view.transform.position;
    drawScene(view.projectionMatrix, view.transform.inverse.matrix, [ep.x, ep.y, ep.z], true, S, hands);
  }
}

boot();
