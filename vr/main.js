/** ORRERY main — UI, input, XR, sim loop. */

import { clamp, qAxis, qmul, qnorm, qFromTo, qrot, qnlerp, m4, m4persp, m4lookAt, lookRay, showErr } from './math.js';
import { NC, AREA, N_ALLOWED, N, cellKm, DIR, NBR } from './sphere.js';
import { mergeRunRule, isModernEarth } from './sim/ruleMode.js';
import { timePanelState, ruleForEra, availableEras, eraPatch } from './sim/timePanel.js?v=49';
import { setClockFace, setSeasonHold, livedTick } from './sim/clockFace.js';
import { W, generate, simTick, setSunDir, RULESETS, chronLog, formatAge, treeSummary, downloadSave, serializeRun, changeResolution, loadRunMeta, rerollTerrain, setLifeSpeed } from './world.js';
import { LANDSCAPES, landscapeById, drawLandscapeThumb, nameWorld } from './sim/landscapes.js';
import { freshSeed } from './sim/rng.js';
import { describeGenome } from './sim/genome.js';
import { solventBlurb, speciesPage, layoutTree, treeToSvg, explainCreature } from './sim/lifeGuide.js';
import { lineageAt } from './sim/evolve.js';
import { encodeWorldId, decodeWorldId, parseWorldInput, worldIdOf, seedToWords } from './sim/seedword.js';
import { formatAxesLine, formatAxesExtras } from './sim/worldAxes.js';
import { describeSubstrate, cycleMaterial, formatLiquidWindow, phaseAtCell, livePressureBar } from './sim/substrateField.js';
import { formatCover, formatLivePressure } from './sim/cover.js';
import { formatColumn } from './sim/columnSketch.js';
import { formatColumnAt } from './sim/columnField.js';
import { featureAt, formatFeatures } from './sim/definition.js';
import { formatPlevel, formatDescent, formatGiantExtras, camDistMin } from './sim/plevel.js';
import { formatEpoch } from './sim/epoch.js';
import { formatTechno, formatMega } from './sim/techno.js';
import { landformAt, explainForm, formatPalette } from './sim/landform.js';
import { noteDroppedTicks } from './sim/meta.js';
import { detectEnding, finaleArtefact, formatFinaleMarkdown } from './sim/finale.js';
import {
  skipReveal, campaignBlurb,
  LESSONS, DOOR_IDS, loadLessonProgress, lessonById, setCurrentLesson,
  completeLesson, lessonDone, shouldOfferDoor, nextIncompleteLesson,
  lessonChipLabel, huntMatches, offerTourAgain, markDoorSeen, saveLessonProgress,
} from './sim/teach.js?v=24';
import { ENT, respawnEntities, followTarget, presentAgents } from './agents.js';
import { initGL, gl, canvas, rebuildGeometry, refreshColours, uploadEntities, drawScene, vIdx, updateLocalHighlight, setGuildHighlight, setLocalHover, setOverlayMode, remeshPlanet, rebuildScatterLUTs, setGlobeSubd, GLOBE_SUBD, GLOBE_SUBD_ALLOWED, globeN, globeVertexCount, recommendGlobeSubd, effectiveGlobeSubd } from './render.js';
import {
  climatePanelChrome, refreshClimatePanel, bindClimatePanel,
} from './sim/climatePanel.js';
import {
  platesPanelChrome, refreshPlatesPanel, bindPlatesPanel, tectonicsAtCell, plateName,
} from './sim/platesPanel.js';
import { TOOLS, setTool, activeTool, useToolAt, inspectCell, pickCell, fingerOfGod,
  beginToolDrag, moveToolDrag, endToolDrag, undoStroke, redoStroke, canUndo,
  setCrustOceanic, setPinpoint, setBrushInvert,
  pricePreview, setScarcityMode, SCARCITY, setSelectedGuild, selectedGuild,
  BRUSH, brushKm, brushForTier, previewBrush,
  cullClade,
} from './tools.js';
import {
  addPaintLayer, duplicateLayer, removeLayer, moveLayer, setActiveLayer,
  setLayerVisible, setLayerOpacity, setLayerBlend, setLayerName,
  setPaintMaskMode, clipLayerToLand, clearLayerMask, flattenLayers,
  layerPanelState,
} from './sim/layers.js';
import { GUILDS, speciesMemoryReadout } from './sim/redox.js';
import {
  SCENARIOS, startScenario, evaluateScenario, CAMPAIGN, dailySeed,
} from './sim/god/scenario.js';
import {
  blankGenesis, PRESETS, applyPreset, randomizeGenesis, rulesetFromGenesis,
  decodeSeedString, applyGenesisToWorld, genesisFromPanel,
} from './sim/god/genesis.js';
import {
  setTimeRate, TIME_RATES, addBookmark, setLetItRun, shouldHaltFF,
  cycleTimeRate, timeClockInfo, cycleGaiaButton, gaiaDriveOf,
} from './sim/god/observe.js';
import { addToShelf, loadShelf, rankByBiosignature } from './sim/god/shelf.js';
import { tipForTool, tipForId, SUITE_TIPS, RIBBON_TIPS } from './sim/god/tips.js';
import { decorateButton, iconSVG, DOCK_TAB_ICONS } from './sim/god/icons.js';
import {
  CAM_DIST_MAX, XR_SCALE_MIN, XR_SCALE_MAX,
  scaleRung, applyScalePreset, eorefById,
} from './sim/eoref.js';
import { exportChronicle, currentEraName, whatHappenedHere } from './chronicle.js';
import { audioInit, audioUpdate, playEvent, audioMute, audioMuted } from './audio.js';
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
import { momentRGB, legendEntries, legendKeyAt, legendGlossary } from './sim/lifeColour.js';
import {
  drawLocalView, layoutLocalPanel, stepFocus, hoverCellAt, beingAtLocalPixel,
  LOCAL_SIZES, LOCAL_SIZE_LABELS, LOCAL_SIZE_S, LOCAL_SIZE_M, LOCAL_SNAPS, LOCAL_GLOBE, LOCAL_RADII, LOCAL_RADIUS_LABELS,
  LOCAL_SEEK, LOCAL_SEEK_LABELS, resetFocusCache, huntGlance,
  localFrameIndex, localFrameLabel,
} from './localview.js';
import { presentAdvance, placeSentence, cellSun } from './sim/present.js';
import { currentsAtCell } from './sim/ocean.js';
import { stepFlow, resetFlow } from './sim/flowviz.js';
import { CATALOGUE, CATALOGUE_CATS, CATALOGUE_KIND } from './catalogue.js';
import { rulesetFromCatalogue, adjacentCatalogueWorld, CATALOGUE_WORLDS, validateCatalogueWorlds, recordForCatalogueItem } from './catalogue-rules.js';
import { parseWorldCsv } from './sim/exophysics.js';
import { makeWorldRecord, applyRecordToRule } from './sim/worldRecord.js';
import { explainDrama, defineTerm, READING_LIST, toolsUnlocked } from './sim/glossary.js';
import { OVERLAYS, overlaysForPicker, overlayById, markTouch } from './sim/overlay.js';
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
  camPanX: 0,
  camPanY: 0,
  scaleXR: 0.22,
  posXR: [0, 1.18, -0.52],
  canvasMode: false,
  landscape: 'auto',
  lookMode: 'photo',
  cloudFree: false,
  paused: false,
  pitchShot: false,
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
  localSize: LOCAL_SIZE_M,
  localSnap: 'br',
  localGlobe: 'rim',
  localRadius: 8,
  localPin: -1,       // >=0 pins the local window; -1 = auto-track
  localSeek: 'life',  // stay = hold densest; life = jump to recent growth
  dayWatch: false,
  faceCell: -1,
  faceUntil: 0,
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
  labDesk: 'station',
  catKind: 'TYPE',
  catQuery: '',
};

/** Updated when Local panel chrome is wired; called each frame. */
let syncLocalChrome = () => {};
let applyLocalLayout = () => {};

const tmpQ = new Float32Array(4);
const _faceDir = [0, 0, 0];
const _faceWant = [0, 0.16, 0.987];
const _faceDq = new Float32Array(4);
const _faceTgt = new Float32Array(4);

function requestFace(cell, ms = 1800) {
  if (cell == null || cell < 0) return;
  S.faceCell = cell | 0;
  S.faceUntil = (S._t || 0) + ms;
}

function faceToward(cell, dt) {
  if (cell == null || cell < 0 || grabbing || dragging || panning || S.toolDrag) return;
  qrot(S.q, DIR[cell * 3], DIR[cell * 3 + 1], DIR[cell * 3 + 2], _faceDir);
  const d = Math.max(-1, Math.min(1, _faceDir[0] * _faceWant[0] + _faceDir[1] * _faceWant[1] + _faceDir[2] * _faceWant[2]));
  const ang = Math.acos(d);
  qFromTo(_faceDq, _faceDir, _faceWant);
  qmul(_faceTgt, _faceDq, S.q);
  const k = ang > 1.05 ? 0.58 : ang > 0.5 ? 0.82 : 1.25;
  qnlerp(S.q, S.q, _faceTgt, 1 - Math.exp(-k * Math.max(0.001, dt)));
}

function cellFacingZ(cell) {
  if (cell == null || cell < 0) return 1;
  qrot(S.q, DIR[cell * 3], DIR[cell * 3 + 1], DIR[cell * 3 + 2], _faceDir);
  return _faceDir[2];
}

function setDayWatch(on) {
  const next = !!on;
  if (next === S.dayWatch) return;
  if (next) {
    S._dayWatchWasPaused = S.paused;
    S.paused = true;
    const b = document.getElementById('pause');
    if (b) {
      b.setAttribute('aria-pressed', 'true');
      b.textContent = 'Resume';
    }
    showMoment('A day', 'The rock holds. The light moves.', 'Shift+D leaves · Space too');
  } else {
    if (S._dayWatchWasPaused === false) {
      S.paused = false;
      const b = document.getElementById('pause');
      if (b) {
        b.setAttribute('aria-pressed', 'false');
        b.textContent = 'Pause';
      }
    }
    S._dayWatchWasPaused = undefined;
  }
  S.dayWatch = next;
  document.getElementById('localpanel')?.classList.toggle('daywatch', S.dayWatch);
}

let _sunSign = 0;
function maybeDayMoment(cell) {
  if (cell < 0) return;
  const sun = cellSun(cell);
  const sign = sun > 0.04 ? 1 : sun < -0.04 ? -1 : _sunSign;
  if (sign !== _sunSign && _sunSign !== 0) {
    if (sign > 0) showMoment('Dawn', placeSentence(cell) || 'The light returns', S.dayWatch ? 'Watching a day' : '');
    else showMoment('Dusk', 'The valley goes dark', S.dayWatch ? 'Watching a day' : '');
  }
  _sunSign = sign;
}
const VIEW = m4(), PROJ = m4();
let lastT = 0, simAcc = 0, agentAcc = 0, geomDirty = false;
let dragging = false, panning = false, lastX = 0, lastY = 0, grabbing = false;
let _landPickDone = null;

function isDemoMode() {
  try { return new URLSearchParams(location.search).get('demo') === '1'; } catch { return false; }
}

function setBootPhase(label, detail = '') {
  const el = document.getElementById('bootload');
  if (!el) return;
  el.classList.remove('hidden');
  const msg = el.querySelector('.boot-msg');
  const sub = el.querySelector('#bootsub') || el.querySelector('.boot-sub');
  if (msg) msg.textContent = label || 'Forming world';
  if (sub) sub.textContent = detail || '';
}

function findCoastalCell() {
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) continue;
    for (let k = 0; k < 4; k++) {
      if (W.h[NBR[c * 4 + k]] < W.seaLevel) return c;
    }
  }
  return 0;
}

function focusCoastForLesson(c = findCoastalCell()) {
  requestFace(c);
  S.localGlobe = 'rim';
  if (S.localRadius < 8) S.localRadius = 8;
  return c;
}

function beginHoldEarthLesson() {
  _taughtAlive = true;
  S._holdStep = 0;
  S._lessonSpun = false;
  S._lessonCam0 = S.camDist;
  S.localPin = -1;
  S.localSeek = 'life';
  setPaused(false);
  applyScalePreset(S, 'hold');
  focusCoastForLesson();
  setTool('inspect');
  setDockTab('tools');
  setSuiteDesk('tools', 'land');
  document.getElementById('dock')?.classList.remove('collapsed');
  document.getElementById('docktoggle')?.setAttribute('aria-expanded', 'true');
  showMoment('Hold Earth', 'Hold a planet', 'Drag to spin · scroll to come closer · click the coast for the map');
}
const CAM_FOV = 50 * Math.PI / 180;
let xrSession = null, xrRefSpace = null, camWorld = null;
const hands = [
  { active: false, pos: [0, 0, 0], grab: false, prev: null, vel: [0, 0, 0] },
  { active: false, pos: [0, 0, 0], grab: false, prev: null, vel: [0, 0, 0] },
];

function planetPos() {
  return [S.camPanX || 0, S.camPanY || 0, 0];
}

function resetCamPan() {
  S.camPanX = 0;
  S.camPanY = 0;
}

function panGlobe(dxPx, dyPx) {
  const rect = canvas.getBoundingClientRect();
  const worldH = 2 * S.camDist * Math.tan(CAM_FOV / 2);
  const worldW = worldH * (rect.width / Math.max(1, rect.height));
  const lim = S.camDist * 1.25;
  S.camPanX = clamp(S.camPanX + (dxPx / Math.max(1, rect.width)) * worldW, -lim, lim);
  S.camPanY = clamp(S.camPanY - (dyPx / Math.max(1, rect.height)) * worldH, -lim, lim);
}

function needGeom() { geomDirty = true; }

function afterLayerEdit() {
  refreshColours(1);
  needGeom();
  refreshLayerPanel();
}

function refreshLayerPanel() {
  const host = document.getElementById('layerlist');
  if (!host) return;
  if (host.contains(document.activeElement) && document.activeElement.classList?.contains('layer-name')) return;
  const st = layerPanelState(W);
  if (!st) {
    host.innerHTML = '<p class="god-note" style="margin:0">Generate a world to get a stack.</p>';
    return;
  }
  const rows = [];
  rows.push(`<div class="layer-row locked" data-layer="base" role="option">
    <button type="button" class="layer-eye" data-eye="base" title="Hide generated land">${st.baseVisible ? '◉' : '○'}</button>
    <span class="layer-name">${st.baseName}</span>
    <span class="layer-blend">base</span>
  </div>`);
  for (const L of st.layers) {
    rows.push(`<div class="layer-row${L.active ? '' : ''}" data-layer="${L.id}" role="option" aria-selected="${L.active ? 'true' : 'false'}" aria-pressed="${L.active ? 'true' : 'false'}">
      <button type="button" class="layer-eye" data-eye="${L.id}" title="Hide layer">${L.visible ? '◉' : '○'}</button>
      <input class="layer-name" data-rename="${L.id}" value="${L.name.replace(/"/g, '&quot;')}" aria-label="Layer name">
      <span class="layer-blend">${L.blend}${L.hasMask ? ' · mask' : ''}</span>
    </div>`);
  }
  host.innerHTML = rows.join('');
  const op = document.getElementById('layeropacity');
  const opv = document.getElementById('layeropacityval');
  const blend = document.getElementById('layerblend');
  const paint = document.getElementById('layerpaint');
  const active = st.layers.find((L) => L.active);
  if (op && active) {
    op.value = String(Math.round(active.opacity * 100));
    if (opv) opv.textContent = `${op.value}%`;
  }
  if (blend && active) blend.value = active.blend;
  if (paint) paint.value = st.paintMask ? 'mask' : 'height';
}

function bindLayerPanel() {
  const host = document.getElementById('layerlist');
  if (!host) return;
  host.addEventListener('click', (e) => {
    const eye = e.target.closest('[data-eye]');
    if (eye) {
      e.stopPropagation();
      const id = eye.dataset.eye === 'base' ? 'base' : +eye.dataset.eye;
      if (id === 'base') {
        setLayerVisible(W, 'base', !(W.layerStack?.baseVisible !== false));
      } else {
        const L = W.layerStack?.layers.find((x) => x.id === id);
        if (L) setLayerVisible(W, id, !L.visible);
      }
      afterLayerEdit();
      return;
    }
    const row = e.target.closest('[data-layer]');
    if (!row || row.dataset.layer === 'base') return;
    setActiveLayer(W, +row.dataset.layer);
    refreshLayerPanel();
  });
  host.addEventListener('change', (e) => {
    const inp = e.target.closest('[data-rename]');
    if (!inp) return;
    setLayerName(W, +inp.dataset.rename, inp.value);
  });
  document.getElementById('layeradd')?.addEventListener('click', () => {
    addPaintLayer(W, 'Stroke');
    afterLayerEdit();
  });
  document.getElementById('layerdup')?.addEventListener('click', () => {
    if (!duplicateLayer(W)) showErr('Layer cap (12) or nothing to copy');
    else afterLayerEdit();
  });
  document.getElementById('layerdel')?.addEventListener('click', () => {
    if (!removeLayer(W, W.layerStack?.activeId)) showErr('Keep at least one paint layer');
    else afterLayerEdit();
  });
  document.getElementById('layerup')?.addEventListener('click', () => {
    moveLayer(W, W.layerStack?.activeId, 1);
    afterLayerEdit();
  });
  document.getElementById('layerdown')?.addEventListener('click', () => {
    moveLayer(W, W.layerStack?.activeId, -1);
    afterLayerEdit();
  });
  document.getElementById('layerflatten')?.addEventListener('click', () => {
    if (!W.layerStack) return;
    if (!confirm('Flatten bakes every layer into Land. You cannot undo this.')) return;
    flattenLayers(W);
    afterLayerEdit();
    showErr('Flattened — the stack is Land now');
  });
  document.getElementById('layeropacity')?.addEventListener('input', (e) => {
    const v = (+e.target.value) / 100;
    const id = W.layerStack?.activeId;
    if (id) setLayerOpacity(W, id, v);
    const opv = document.getElementById('layeropacityval');
    if (opv) opv.textContent = `${e.target.value}%`;
    refreshColours(1);
    needGeom();
  });
  document.getElementById('layerblend')?.addEventListener('change', (e) => {
    const id = W.layerStack?.activeId;
    if (id) setLayerBlend(W, id, e.target.value);
    afterLayerEdit();
  });
  document.getElementById('layerpaint')?.addEventListener('change', (e) => {
    setPaintMaskMode(W, e.target.value === 'mask');
    showErr(e.target.value === 'mask' ? 'Raise reveals the mask, Lower conceals' : 'Raise / Lower write height');
  });
  document.getElementById('layerclipland')?.addEventListener('click', () => {
    clipLayerToLand(W);
    afterLayerEdit();
  });
  document.getElementById('layerclearmask')?.addEventListener('click', () => {
    clearLayerMask(W);
    afterLayerEdit();
  });
  refreshLayerPanel();
}

function runGenerate(seed, ruleIn) {
  setBootPhase('Forming world', '');
  const session = {
    deepTime: W.rule?.deepTime,
    startAgeGa: W.rule?.startAgeGa,
    fixedDtYr: W.rule?.fixedDtYr,
    tutorial: W.rule?.tutorial,
  };
  const rule = mergeRunRule(ruleIn, session);
  W._bootPhase = setBootPhase;
  generate(seed, rule);
  W._bootPhase = null;
  W._canvasMode = !!S.canvasMode;
  resetFlow();
  W._gpgpuDirty = true;
  rebuildGeometry();
  refreshColours(1);
  respawnEntities();
  uploadEntities();
  try { rebuildScatterLUTs(); } catch { /* GL may not be ready */ }
  resetFocusCache();
  S.follow = null;
  if (S.localSeek === 'life') S.localPin = -1;
  document.getElementById('bootload')?.classList.add('hidden');
  resetMomentAnnouncer();
  refreshToolGates();
  updateHUD();
  refreshLab();
  refreshLayerPanel();
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
    refreshLayerPanel();
    return true;
  } catch (e) {
    showErr(String(e.message || e));
    return false;
  }
}

const TOOL_BTN_SEL = '#toolsLand button, #toolsLife button, #toolsStrike button, #toolsClimate button, #toolsSample button';

function refreshToolGates() {
  const unlocked = toolsUnlocked(W);
  const buttons = document.querySelectorAll(TOOL_BTN_SEL);
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
  clearCatalogueSelection();
  /* A ruleset that declares its own clock owns it. Carrying the previous
     world's deepTime / startAgeGa into Earth Thrive turned the demo Earth into a
     lifeless deep-time run, because the Holocene biosphere is only seeded on the
     modern path. */
  const ownsClock = !!r.thrive || r.startAgeGa != null;
  runGenerate(W.seed, ownsClock
    ? mergeRunRule(r)
    : mergeRunRule(r, { deepTime: W.rule?.deepTime, startAgeGa: W.rule?.startAgeGa }));
}

function clearCatalogueSelection() {
  const list = document.getElementById('catlist');
  if (!list) return;
  [...list.querySelectorAll('.cat-item')].forEach((b) => b.setAttribute('aria-pressed', 'false'));
}

function loadCatalogueItem(item) {
  if (!item || item.k !== 'BODY') return;
  const r = rulesetFromCatalogue(item);
  if (!r) return;
  S.catalogueId = item.id;
  const list = document.getElementById('catlist');
  if (list) {
    [...list.querySelectorAll('.cat-item')].forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.id === String(item.id) ? 'true' : 'false'));
  }
  const detail = document.getElementById('catdetail');
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
  runGenerate(W.seed, mergeRunRule(r, {
    deepTime: r.earthLike ? W.rule?.deepTime : false,
    startAgeGa: r.earthLike ? W.rule?.startAgeGa : undefined,
  }));
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
  const kind = S.catKind || 'TYPE';
  list.innerHTML = '';

  const match = (hay) => !q || hay.toLowerCase().includes(q);

  if (kind === 'TYPE') {
    RULESETS.forEach((r, i) => {
      if (!match(`${r.name} ${r.blurb} ${r.id}`)) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat-item BODY';
      b.dataset.rule = r.id;
      b.setAttribute('aria-pressed', !S.catalogueId && W.rule?.id === r.id ? 'true' : 'false');
      b.innerHTML =
        `<span class="cid">${r.id}</span>` +
        `<span class="ct">${r.name}</span>` +
        `<span class="cm">Type · synthetic · play</span>`;
      b.title = r.blurb;
      b.onclick = () => setRuleset(i);
      list.appendChild(b);
    });
  }

  if (kind === 'BODY') {
    const items = CATALOGUE.filter((x) => {
      if (x.k !== 'BODY') return false;
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
      const worlds = items.length;
      meta.textContent = `${list.children.length} shown · ${worlds} on this shelf · ${CATALOGUE_WORLDS.length} bodies`;
    }
    return;
  }

  if (meta) meta.textContent = `${list.children.length} planet types · Earth is the calibration world`;
}

function setupCatalogue() {
  const panel = document.getElementById('catpanel');
  const btn = document.getElementById('catbtn');
  const close = document.getElementById('catclose');
  const cats = document.getElementById('catcats');
  const kinds = document.getElementById('catkinds');
  const tools = document.getElementById('cattools');
  const q = document.getElementById('catq');
  if (!panel || !btn || !cats) return;
  const showBodyFilters = (on) => {
    cats.hidden = !on;
    if (tools) tools.hidden = !on;
  };

  const toggle = (open) => {
    const on = open ?? !panel.classList.contains('open');
    panel.classList.toggle('open', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  btn.onclick = () => toggle();
  document.getElementById('worldchip')?.addEventListener('click', () => toggle(true));
  if (close) close.onclick = () => toggle(false);
  document.getElementById('catprev')?.addEventListener('click', () => stepCatalogueWorld(-1));
  document.getElementById('catnext')?.addEventListener('click', () => stepCatalogueWorld(1));

  if (kinds) {
    kinds.innerHTML = '';
    for (const [id, label] of [['TYPE', 'Types'], ['BODY', 'Bodies']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.id = id;
      b.setAttribute('aria-pressed', S.catKind === id ? 'true' : 'false');
      b.onclick = () => {
        S.catKind = id;
        [...kinds.children].forEach((x) =>
          x.setAttribute('aria-pressed', x.dataset.id === id ? 'true' : 'false'));
        showBodyFilters(id === 'BODY');
        renderCatalogue();
      };
      kinds.appendChild(b);
    }
  }
  showBodyFilters(S.catKind === 'BODY');

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
  const BODY_CAT_LABEL = {
    sol: 'Solar Sys', moons: 'Moons', temperate: 'Temperate', furnace: 'Furnace',
    giant: 'Giants', arch: 'Systems', dark: 'Dark',
  };
  for (const c of CATALOGUE_CATS) {
    if (!CATALOGUE.some((x) => x.c === c.id && x.k === 'BODY')) continue;
    addCat(c.id, BODY_CAT_LABEL[c.id] || c.id);
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
  setPaused(!S.paused);
}

function setPaused(on) {
  if (S.dayWatch && on) { setDayWatch(false); return; }
  S.paused = !!on;
  const b = document.getElementById('pause');
  if (b) {
    b.setAttribute('aria-pressed', S.paused ? 'true' : 'false');
    b.textContent = S.paused ? 'Resume' : 'Pause';
  }
  const ribbon = document.getElementById('timeribbon');
  if (ribbon) delete ribbon.dataset.sig;
  updateHUD();
}

function applyTimeRate(idOrDir) {
  const r = typeof idOrDir === 'number'
    ? cycleTimeRate(idOrDir)
    : setTimeRate(idOrDir);
  const ribbon = document.getElementById('timeribbon');
  if (ribbon) delete ribbon.dataset.sig;
  updateHUD();
  return r;
}

function applyClockFace(id) {
  setClockFace(W, id);
  const ribbon = document.getElementById('timeribbon');
  if (ribbon) delete ribbon.dataset.sig;
  updateHUD();
}

function applySeasonHold(id) {
  setClockFace(W, 'years');
  setSeasonHold(W, id);
  const ribbon = document.getElementById('timeribbon');
  if (ribbon) delete ribbon.dataset.sig;
  updateHUD();
}

function toggleFastForward() {
  W.fastForward = !W.fastForward;
  W.stopOnAnomaly = true;
  const ribbon = document.getElementById('timeribbon');
  if (ribbon) delete ribbon.dataset.sig;
  updateHUD();
}

function applyLifeSpeed(n) {
  setLifeSpeed(+n || 1);
  const ribbon = document.getElementById('timeribbon');
  if (ribbon) delete ribbon.dataset.sig;
  updateHUD();
}

function applyEra(eraId) {
  if (!eraId || !availableEras(W.rule).some((e) => e.id === eraId)) return;
  const rule = ruleForEra(W.rule, eraId);
  if (!eraPatch(eraId)?.landscape) rule.landscape = S.landscape || rule.landscape || 'auto';
  runGenerate(W.seed, rule);
}

function bindRibbonTips(ribbon) {
  const map = [
    ['[data-era-select]', RIBBON_TIPS.era],
    ['[data-rate-select]', RIBBON_TIPS.rate],
    ['[data-time-pause]', RIBBON_TIPS.pause],
    ['[data-time-ff]', RIBBON_TIPS.ff],
    ['.rib-mode', RIBBON_TIPS.mode],
    ['.rib-track', RIBBON_TIPS.track],
    ['.rib-faces', RIBBON_TIPS.face],
    ['.rib-hold', RIBBON_TIPS.hold],
    ['.rib-life', RIBBON_TIPS.life],
  ];
  for (const [sel, tip] of map) {
    const el = ribbon.querySelector(sel);
    if (el && tip) bindTip(el, tip.title, tip.body);
  }
  ribbon.querySelectorAll('[data-rate-step]').forEach((el) => {
    const tip = el.dataset.rateStep === '-1' ? RIBBON_TIPS.slower : RIBBON_TIPS.faster;
    bindTip(el, tip.title, tip.body);
  });
}

function bindTimeRibbon() {
  const ribbon = document.getElementById('timeribbon');
  if (!ribbon || ribbon.dataset.bound) return;
  ribbon.dataset.bound = '1';
  ribbon.addEventListener('click', (e) => {
    if (e.target.closest('[data-time-pause]')) {
      e.preventDefault();
      togglePause();
      return;
    }
    if (e.target.closest('[data-time-ff]')) {
      e.preventDefault();
      toggleFastForward();
      return;
    }
    const face = e.target.closest('[data-clock-face]');
    if (face) {
      e.preventDefault();
      applyClockFace(face.dataset.clockFace);
      return;
    }
    const hold = e.target.closest('[data-season-hold]');
    if (hold) {
      e.preventDefault();
      applySeasonHold(hold.dataset.seasonHold);
      return;
    }
    const life = e.target.closest('[data-life-speed]');
    if (life) {
      e.preventDefault();
      applyLifeSpeed(life.dataset.lifeSpeed);
      return;
    }
    const step = e.target.closest('[data-rate-step]');
    if (step) {
      e.preventDefault();
      applyTimeRate(+step.dataset.rateStep);
    }
  });
  ribbon.addEventListener('change', (e) => {
    const eraSel = e.target.closest('[data-era-select]');
    if (eraSel) {
      applyEra(eraSel.value);
      return;
    }
    const rateSel = e.target.closest('[data-rate-select]');
    if (rateSel) applyTimeRate(rateSel.value);
  });
}

/** The most populous living body, described from its own genome, plus the sense this
 *  world actually delivers. Nothing here is a lookup — every word is expressed. */
function dominantBodyLine() {
  const tr = W.tree;
  if (!tr?.living?.length) return '';
  let best = null;
  for (const id of tr.living) {
    const n = tr.byId.get(id);
    if (n?.genome && (!best || n.pop > best.pop)) best = n;
  }
  if (!best) return '';
  const body = describeGenome(best.genome);
  const pen = best.morphMult != null && best.morphMult < 0.95
    ? ` <span style="color:#e0a060" title="${(best.morphWhy || []).join('; ')}">×${best.morphMult.toFixed(2)}</span>`
    : '';
  const sense = W.topSense ? ` · best sense <b>${W.topSense}</b>` : '';
  return `<span style="color:#9fd6b4">${best.name}</span>: ${body}${pen}${sense}<br>`;
}

function speciesInspectHTML(cell) {
  const node = lineageAt(W, cell);
  if (!node) {
    if (W.originCell === cell) return `<br><span style="color:#c8b56f">origin site</span>`;
    return '';
  }
  const page = speciesPage(W, node);
  if (!page) return '';
  const why = explainCreature(W, node);
  return `<br><span style="color:#9fd6b4"><b>${page.name}</b> · ${page.body}</span><br>` +
    `census ~<b>${page.census | 0}</b> · Ne <b>${page.Ne | 0}</b> · range <b>${((page.rangeKm2 / 1e3) | 0)}</b>k km²` +
    (page.diet?.length ? ` · eats ${page.diet.join(', ')}` : '') + `<br>` +
    (page.card?.lines?.slice(0, 3).map((l) => `<span style="color:#8aa0bc">${l}</span>`).join('<br>') || '') +
    (why ? `<br>${why}` : '');
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
  const chem = solventBlurb(W);
  const originLine = W.originCell != null && W.transitions?.abiogenesis
    ? `origin cell <b>${W.originCell}</b>` + (W.originBudget ? ` · budget ${(W.originBudget.produced || 0).toExponential(1)}` : '')
    : '';
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
    (W.mood?.label ? ` · mood <b>${W.mood.label}</b>` : '') +
    ` · hab <b>${((W.habitability || 0) * 100) | 0}</b>/<b>${((W.inhabitance || 0) * 100) | 0}</b>${bioSig}<br>` +
    `T <b>${tStr}</b> · sea <b>${W.seaLevel.toFixed(3)}</b>` +
    (R.surfacePressureBar != null ? ` · <b>${formatLivePressure(W)}</b>` : '') +
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
    (chem ? `<span style="color:#9fd6b4">${chem}</span><br>` : '') +
    (originLine ? `<span style="color:#c8b56f">${originLine}</span><br>` : '') +
    `CO₂ <b>${co2Str}</b> O₂ <b>${(g.O2 * 100).toFixed(1)}%</b>` +
    (g.CH4 > 1e-5 ? ` CH₄ <b>${(g.CH4 * 1e6).toFixed(0)} ppm</b>` : '') + `<br>` +
    proxy +
    (tree.total
      ? `clades <b>${tree.living}</b> living / <b>${tree.total}</b> · extinct <b>${tree.extinct}</b>` +
        (tree.maxDepth ? ` · depth <b>${tree.maxDepth}</b>` : '') +
        (W.morphospaceOccupied ? ` · bodies <b>${W.morphospaceOccupied}</b>` : '') +
        (W.shannon ? ` · H′ <b>${W.shannon.toFixed(2)}</b>` : '') + `<br>`
      : '') +
    dominantBodyLine() +
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
    const panel = timePanelState(W, S);
    const sig = `${ageLabel}|${W.ics?.period}|${W.ics?.eon}|${needle}|${clock.id}|${clock.dt}|${clock.paused ? 1 : 0}|${W.fastForward ? 1 : 0}|${panel.eraId}|${panel.eras.length}|${panel.clockFace}|${panel.seasonHoldId}|${panel.lifeSpeed}`;
    if (ribbon.dataset.sig !== sig) {
      ribbon.dataset.sig = sig;
      ribbon.innerHTML = icsRibbonHTML(W.ics, ageLabel, W.ics?.maBP, clock, panel);
      bindRibbonTips(ribbon);
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
    const land = W._landscape && W._landscape !== 'auto' ? landscapeById(W._landscape).name : '';
    const bits = seedToWords((W.landSeed ?? W.seed) >>> 0);
    const short = `${bits[0]}-${bits[1]}`;
    const name = W.worldName || R.name;
    const kindBit = W._planetKind && W._planetKind !== 'earth'
      ? ` · ${W._planetKind}${W._planetKindWhy ? ` (${W._planetKindWhy})` : ''}`
      : '';
    const shapeBit = W._nonHydrostatic ? ' · not round' : '';
    const epochBit = W._epoch?.id && W._epoch.id !== 'present' && W._epoch.id !== 'venus-now'
      && W._epoch.id !== 'mars-now' ? ` · ${W._epoch.name}` : '';
    const surfBit = W.noSurface ? ' · no surface' : '';
    const ax = W._worldAxes;
    chip.innerHTML = S.catalogueId
      ? `<b>${R.name}</b> <small>#${S.catalogueId} · ${mode} · seed ${W.seed}${R.teqK != null ? ` · ${R.teqK | 0} K` : ''}${kindBit}${shapeBit}${surfBit}${epochBit}${R.contested ? ' · contested' : ''}</small>`
      : `<b>${name}</b> <small>${land ? `${land} · ` : ''}${short}${kindBit}${shapeBit}${surfBit}${epochBit}</small>`;
    chip.title = [
      S.catalogueId ? 'Open Worlds' : `Open Worlds · ${worldIdOf(W)}`,
      ax ? [formatAxesLine(ax), formatAxesExtras(ax), formatGiantExtras(W), ax.fingerprint].filter(Boolean).join(' · ') : '',
    ].filter(Boolean).join('\n');
    chip.style.cursor = 'pointer';
  }
  const landLine = document.getElementById('landmassline');
  if (landLine && W.noSurface) {
    landLine.textContent = ['no surface · envelope', formatGiantExtras(W)].filter(Boolean).join(' · ');
  } else if (landLine && W._landReport) {
    const r = W._landReport;
    landLine.textContent = `${r.count} landmasses · ${(r.landFrac * 100).toFixed(0)}% land · largest ${(r.largestShare * 100).toFixed(0)}% · coast ${Math.round(r.coastKm).toLocaleString()} km`;
  }
  const axLine = document.getElementById('axesline');
  if (axLine) {
    axLine.textContent = W._worldAxes
      ? [formatAxesLine(W._worldAxes), formatAxesExtras(W._worldAxes), formatGiantExtras(W),
        formatEpoch(W), formatTechno(W), formatMega(W),
        formatLiquidWindow(cycleMaterial(W), livePressureBar(W)),
        formatLivePressure(W),
        formatColumn(W),
        formatPalette(W),
        formatFeatures(W),
        W._worldAxes.fingerprint].filter(Boolean).join(' · ')
      : '';
  }

  const insp = document.getElementById('inspect');
  if (!insp) return;
  if (S.inspect?.cell != null && S.inspect.h == null) {
    S.inspect = { ...inspectCell(S.inspect.cell), ...S.inspect };
  }
  if (S.inspect && S.inspect.h != null) {
    const x = S.inspect;
    insp.style.display = 'block';
    if (W.noSurface) {
      const pLine = x.plevel || formatPlevel(W, x.cell);
      const conv = W.converg?.[x.cell] || 0;
      const band = conv < 0 ? 'belt (sinking · deeper)' : 'zone (rising · cloudy)';
      insp.innerHTML =
        `<b>${placeSentence(x.cell) || 'Cell ' + x.cell}</b><br>` +
        `<span style="color:#8aa0bc">${band} · cell ${x.cell}</span><br>` +
        (pLine ? `<b>${pLine}</b><br>` : '') +
        (formatColumnAt(W, x.cell) ? `${formatColumnAt(W, x.cell)}<br>` : '') +
        (x.wind != null
          ? `wind ${Number(x.wind).toFixed(2)}` +
            (x.windU != null ? ` (u ${Number(x.windU).toFixed(2)} v ${Number(x.windV).toFixed(2)})` : '') + `<br>`
          : '') +
        (W._jetCount ? `${W._jetCount} zonal jets · ${W._windRegime || 'zonal jets'}<br>` : '') +
        (W.rule?.internalHeat > 0.02 ? `internal heat ${W.rule.internalHeat.toFixed(2)}` : '');
    } else {
    const biome = W.biome ? BIOMES[W.biome[x.cell]] : '—';
    const guild = topGuild(x.cell);
    const tec = tectonicsAtCell(W, x.cell);
    const here = placeSentence(x.cell);
    const feat = featureAt(W, x.cell);
    insp.innerHTML =
      `<b>${feat ? feat.name : (here || 'Cell ' + x.cell)}</b><br>` +
      (feat && here ? `<span style="color:#c69a4f">${here}</span><br>` : '') +
      `<span style="color:#8aa0bc">${biome} · cell ${x.cell}</span><br>` +
      `elev ${x.h.toFixed(2)} · T ${x.temp.toFixed(2)} · moist ${x.moist.toFixed(2)}<br>` +
      (W.substrate ? `substrate <b>${describeSubstrate(W, x.cell)}</b>` : '') +
      (W.substrate ? ` · ${phaseAtCell(W, x.cell)}<br>` : '') +
      (() => {
        const cov = formatCover(W, x.cell);
        return cov ? `cover <b>${cov}</b><br>` : '';
      })() +
      (() => {
        const f = landformAt(W, x.cell);
        if (!f) return '';
        return `form <b>${explainForm(f)}</b><br>`
          + `<span style="color:#8aa0bc">${f.why}</span><br>`;
      })() +
      (() => {
        const mat = cycleMaterial(W);
        const win = mat ? formatLiquidWindow(mat, livePressureBar(W)) : '';
        const p = !W.rule?.earthLike && W._atmScale != null && Math.abs(W._atmScale - 1) > 0.02
          ? formatLivePressure(W) : '';
        const line = [win, p].filter(Boolean).join(' · ');
        const col = formatColumnAt(W, x.cell) || formatColumn(W);
        const extra = W.grain?.[x.cell] > 0.04 && (W.frost?.[x.cell] || 0) > 0.08
          ? `grain ${W.grain[x.cell].toFixed(2)}` : '';
        const bits = [line, col, extra].filter(Boolean).join(' · ');
        return bits ? `<span style="color:#9fc0ff">${bits}</span><br>` : '';
      })() +
      `life ${x.life.toFixed(2)} (${LIFE_CLASSES[x.lifeClass]?.id || '—'}) · ice ${x.ice.toFixed(2)}<br>` +
      (guild ? `guild <b>${guild}</b><br>` : '') +
      `build ${(x.build || 0).toFixed(2)} · plate <b>${tec?.name || x.plate}</b>` +
      (tec ? ` · ${tec.oceanic ? 'oceanic' : 'cont'}` : '') +
      ` · crust ${(x.crust ?? W.crust[x.cell]).toFixed(2)}` +
      (W.techno?.watts ? ` · ${formatTechno(W)}` : '') + `<br>` +
      (W.interior
        ? `core ${(W.interior.coreMassFrac * 100) | 0}% · lid <b>${W.interior.lidMode}</b> · B ${(W.magnetosphere || 0).toFixed(2)}<br>`
        : '') +
      (tec?.boundLabel
        ? `bound <b>${tec.boundLabel}</b>` +
          (tec.ageMyr != null ? ` · crust age ${tec.ageMyr.toFixed(0)} Myr` : '') + `<br>`
        : '') +
      `flow ${x.flow.toFixed(2)} · ground ${(x.groundW ?? 0).toFixed(2)}` +
      ((x.lake || 0) > 0.05 ? ` · lake ${Number(x.lake).toFixed(2)}` : '') +
      ` · clouds ${(x.clouds ?? 0).toFixed(2)}` +
      (x.precip != null ? ` · precip ${Number(x.precip).toFixed(2)}` : '') +
      (W.npp ? ` · npp ${W.npp[x.cell].toFixed(2)}` : '') + `<br>` +
      (x.wind != null
        ? `wind ${Number(x.wind).toFixed(2)}` +
          (x.windU != null ? ` (u ${Number(x.windU).toFixed(2)} v ${Number(x.windV).toFixed(2)})` : '') +
          ` · ${windBandAt(DIR[x.cell * 3 + 1], W._itczLat || 0, W._windCells || 3)}<br>`
        : '') +
      (() => {
        const cur = currentsAtCell(W, x.cell);
        if (!cur) return '';
        return `current ${cur.spd.toFixed(2)} ${cur.dir}` +
          (cur.upwell > 0.15 ? ` · upwell ${cur.upwell.toFixed(2)}` : '') +
          ` · salt ${cur.salt.toFixed(2)}` +
          (cur.wave > 0.12 ? ` · waves ${cur.wave.toFixed(2)}` : '') +
          (cur.mix > 0.05 ? ` · mixed layer ${cur.mix.toFixed(2)}` : '') +
          (W._mocSv != null ? ` · overturning ${W._mocSv.toFixed(0)} Sv` : '') +
          `<br>`;
      })() +
      ((W._ensoPhase && W._ensoPhase !== 'neutral') || (W._monsoon || 0) > 0.55
        ? `${W._ensoPhase || 'ENSO neutral'}` +
          (W._ensoIndex != null ? ` (${W._ensoIndex >= 0 ? '+' : ''}${W._ensoIndex.toFixed(2)})` : '') +
          ((W._monsoon || 0) > 0.5 ? ` · monsoon ${W._monsoon.toFixed(2)}` : '') +
          (W._jetLat != null ? ` · jet lat ${W._jetLat.toFixed(2)}` : '') +
          `<br>`
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
      (x.biomeGap?.gaps?.length ? `<br><span style="color:#c4a060">biome gap: ${x.biomeGap.gaps.join('; ')}</span>` : '') +
      speciesInspectHTML(x.cell);
    }
    const hist = whatHappenedHere(W.chron, x.cell, 2);
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
  S.sunAng += dt * (S.dayWatch ? 0.42 : 0.055);
  setSunDir(Math.cos(S.sunAng), 0.34, Math.sin(S.sunAng));
  presentAdvance(dt * (S.dayWatch ? 2.2 : 1));
  if (!S.paused) livedTick(W, dt * (S.dayWatch ? 1.6 : 1));
  stepFlow(dt * (S.dayWatch ? 1.8 : 1));
  presentAgents();
  uploadEntities();
  const hunting = S.localSeek === 'life' && S.localPin < 0 && !S.follow;
  const glance = hunting ? huntGlance() : -1;
  const face = S.follow?.cell >= 0 ? S.follow.cell
    : glance >= 0 ? glance
    : ((S.faceUntil > (S._t || 0)) ? S.faceCell : -1);
  if (face >= 0) faceToward(face, dt);

  // Spin inertia — planet resists. Item 11.
  if (!grabbing && !dragging && !panning && !S.toolDrag) {
    const av = S.angVel;
    if (Math.abs(av[0]) + Math.abs(av[1]) > 1e-4) {
      qAxis(tmpQ, 0, 1, 0, av[1] * dt * 2.2); qmul(S.q, tmpQ, S.q);
      qAxis(tmpQ, 1, 0, 0, av[0] * dt * 2.2); qmul(S.q, tmpQ, S.q);
      qnorm(S.q);
      av[0] *= Math.pow(0.15, dt); // damping
      av[1] *= Math.pow(0.15, dt);
    } else if (!S.paused && !grabbing && face < 0) {
      qAxis(tmpQ, 0, 1, 0, S.spin * dt);
      qmul(S.q, S.q, tmpQ);
      qnorm(S.q);
    }
  } else if (!S.paused && !grabbing && !dragging && !panning && face < 0) {
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
    let simRan = false;
    // Decoupled tick; skip if previous tick was heavy (budget ~8ms soft)
    while (simAcc > 0.09) {
      simAcc -= 0.09;
      const t0 = performance.now();
      simTick(); // agentsTick + fireTick run inside it now — see world.js
      simRan = true;
      uploadEntities();
      if (W._buildsDirty) { needGeom(); W._buildsDirty = false; }
      else if (W.year % 4000 < 200) needGeom(); // occasional elev rebuild for erosion/sculpt
      const elapsed = performance.now() - t0;
      W._msSim = elapsed;
      if (elapsed > 12) {
        noteDroppedTicks(W, Math.max(1, (simAcc / 0.09) | 0));
        simAcc = 0;
        break;
      } // never block frames — but record the miss
      S.simAlpha = 0;
    }
    if (simRan) refreshColours(1);
    S.simAlpha = Math.min(1, S.simAlpha + dt * 11);
    if (!simRan && S.simAlpha < 0.99) refreshColours(S.simAlpha);
  }

  if (geomDirty) { rebuildGeometry(); refreshColours(1); geomDirty = false; }

  S.camDist = clamp(S.camDist, camDistMin(W), CAM_DIST_MAX);
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
  S.tier = alt > 8 ? 'Dot' : alt > 1.1 ? 'Orbital' : alt > 0.45 ? 'Regional' : alt > 0.16 ? 'Local' : 'Surface';
  brushForTier(S.tier === 'Dot' ? 'Orbital' : S.tier, S.camDist);
  const rungEl = document.getElementById('scalerung');
  if (rungEl) {
    const rung = scaleRung(S.camDist, W.noSurface);
    const down = W.noSurface && S.camDist < 1.08 ? formatDescent(S.camDist, W) : '';
    rungEl.textContent = down ? `${rung} · ${down}` : rung;
  }

  // Eye adaptation across scale / terminator (next hdr item)
  const nightish = Math.max(0, Math.min(1, (alt < 0.2 ? 0.15 : 0) + (W.gases?.dust || 0) * 0.3));
  const baseExpo = clamp(0.85 + Math.log2(Math.max(0.05, W.solar || 1)) * 0.12, 0.55, 1.85);
  S.exposureTarget = baseExpo * (1.15 - nightish * 0.25) * (S.ceremonyUntil > performance.now() ? 1.08 : 1);
  S.exposure = (S.exposure ?? S.exposureTarget) + (S.exposureTarget - (S.exposure ?? S.exposureTarget)) * Math.min(1, dt * 1.8);

  audioUpdate(S._localFocus);

  if (!xrSession) {
    const lv = document.getElementById('localview');
    if (lv) {
      const hoverKey = S.localLegendLock || S.localHoverKey;
      const lvOn = lv.offsetWidth > 8 && lv.offsetHeight > 8
        && getComputedStyle(lv).display !== 'none';
      const patch = lvOn ? drawLocalView(lv, S.inspect, {
        radius: S.localRadius,
        pin: S.localPin,
        seek: S.localSeek,
        highlightGuild: S.highlightGuild,
        hoverKey,
        hoverCell: S.localHoverCell,
        simAlpha: S.simAlpha,
        followId: S.follow?.id,
        net: S.canvasMode,
      }) : null;
      const prevFocus = S._localFocus;
      updateLocalHighlight(patch, S.localGlobe);
      S._localFocus = patch?.focus ?? -1;
      S._localPatch = patch;
      if (S.follow) {
        let live = null;
        for (let i = 0; i < ENT.n; i++) {
          if (ENT.meta[i]?.id === S.follow.id && !ENT.meta[i].dead) { live = ENT.meta[i]; break; }
        }
        S.follow = live || followTarget();
        if (S.follow?.cell >= 0 && S.localPin !== S.follow.cell) S.localPin = S.follow.cell;
      }
      if (patch?.status) patch.status.behind = cellFacingZ(patch.focus) < 0.1;
      syncLocalChrome(patch, hoverKey);
      if ((S.localGlobe === 'wash' || S.localGlobe === 'both') && S._localFocus !== prevFocus) {
        refreshColours(1);
      }
      maybeDayMoment(S._localFocus);
      checkLessonProgress();
    }
  }

  if (!S.pitchShot && !doorIsOpen()) maybeTeachWindow(t);

  S._fa++;
  if (t - S._ft > 500) {
    S.fps = Math.round((S._fa * 1000) / (t - S._ft));
    S._fa = 0; S._ft = t;
    updateHUD();
  }
}

function desktopRay(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
  const eye = [0, 0.28, S.camDist];
  const asp = rect.width / Math.max(1, rect.height);
  return lookRay(ndcX, ndcY, eye, [0, 0, 0], [0, 1, 0], CAM_FOV, asp);
}

function desktopPick(clientX, clientY) {
  const { origin, dir } = desktopRay(clientX, clientY);
  return pickCell(origin, dir, planetPos(), 1, S.q);
}

let _previewRaf = 0;
function requestPreview() {
  if (_previewRaf) return;
  _previewRaf = requestAnimationFrame(() => {
    _previewRaf = 0;
    refreshColours(S.simAlpha ?? 1);
  });
}

function desktopTablePick(clientX, clientY) {
  if (!TABLE.enabled) return null;
  const { origin, dir } = desktopRay(clientX, clientY);
  return pickTableSlotRay(TABLE, origin, dir, [0, -1.15, 0], 0.38, 0.12);
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
    const geomTools = new Set(['raise', 'lower', 'flatten', 'smooth', 'sharpen', 'roughen', 'crust', 'meteor', 'buster', 'volcano', 'quake', 'plume', 'lip', 'river', 'ice']);
    if (geomTools.has(activeTool)) needGeom();
    if (res.cell != null && res.cell >= 0) markTouch(W, res.cell);
    refreshColours(1);
    showReceiptToast(res);
  }
  if (res.cell != null && activeTool === 'inspect') {
    S.inspect = res;
    S.localPin = res.cell;
    requestFace(res.cell);
    setDockTab('lab');
    setSuiteDesk('lab', 'station');
  }
  if (res.sample) {
    S.lastSample = res.sample;
    setDockTab('lab');
    setSuiteDesk('lab', 'station');
    refreshLab();
  }
  updateHUD();
}

function showReceiptToast(res) {
  const el = document.getElementById('receipt');
  if (!el) return;
  const last = W.receipts?.[W.receipts.length - 1];
  const said = res.said || res.note;
  if (!last && !res.pay && !said) return;
  const title = said || last?.intent || last?.tool || activeTool;
  const sub = last?.expected && last.expected !== said ? last.expected : '';
  el.innerHTML = `<b>${title}</b>`
    + (sub ? `<br><small>${sub}</small>` : '')
    + (last?.cost ? ` · −${last.cost}` : '')
    + (res.settling ? `<br><small>settles: ${res.settling}</small>` : '');
  el.classList.add('show');
  clearTimeout(showReceiptToast._t);
  showReceiptToast._t = setTimeout(() => el.classList.remove('show'), 3800);
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
  // Play / World / chrome controls by id
  const ids = [
    'guildsel', 'brushmask', 'brushsnap', 'brushhard',
    'godundo', 'godredo', 'godcull', 'godwatch', 'godbookmark',
    'scenariosel', 'scenariostart', 'lessonchip', 'tourbtn', 'landpickcontinue',
    'genesisname', 'genesisseed', 'genesispreset', 'genesisland',
    'genesisrand', 'genesisgo', 'dailyseed', 'godshelf', 'godshare',
    'budget', 'autopilot',
    'pause', 'newseed', 'catbtn', 'catprev', 'catnext', 'worldchip',
    'docktoggle', 'vrbtn', 'tourbtn',
    'opacity', 'grid', 'xray', 'xrayAmt', 'viewClear', 'viewGhost', 'viewOrbitGuides',
    'lookPhoto', 'lookDiagram', 'cloudFree', 'canvasmode', 'rerolland', 'landshape', 'landpickbtn',
    'layeradd', 'layerdup', 'layerdel', 'layerup', 'layerdown', 'layerflatten',
    'layeropacity', 'layerblend', 'layerpaint', 'layerclipland', 'layerclearmask',
    'genesisplates', 'genesiswater', 'genesislandfrac', 'genesissolvent', 'genesischirality', 'genesisorigindiff', 'origindiff',
    'simN', 'globeSubd', 'orreryTable', 'export',
    'labRefresh', 'labPaper', 'labSave', 'labFinale', 'labPng', 'labDual',
    'catsort', 'catcsv',
    'climDay', 'climTilt', 'climSeason', 'climMoonOn', 'climMoonMass', 'climMoonDist',
    'stormGenesis', 'stormStrict', 'stormSize', 'stormVigor',
    'rockHeat', 'rockMag',
    'localSeek',
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    const tip = tipForId(id);
    if (el && tip) bindTip(el, tip.title, tip.body);
  }
  // Labels that wrap controls
  document.querySelectorAll('#pane-god label[for], #pane-tools label[for], #pane-view label[for], #pane-climate label[for], #pane-rock label[for], #pane-sandbox label[for]').forEach((lab) => {
    const tip = tipForId(lab.htmlFor);
    if (tip) bindTip(lab, tip.title, tip.body);
  });
  // Dock tabs — icon stacked above label (Sky metaphor for all)
  const tabTips = {
    tools: ['Tools', 'The verbs — raise land, seed life, strike. Select one, then right-click the planet. Looking and cores live in Lab.'],
    god: ['Play', 'This run: undo, watch, optional goals, and a named world. Brush and seed settings live with the tools they change. Time lives on the ribbon.'],
    climate: ['Sky', 'Atmosphere desks: circulation & tides, storm track, coast flood risk, spin A/B compare.'],
    rock: ['Rock', 'Core, plates, boundaries, fire, crust age — interiors drive dynamos and lids.'],
    view: ['View', 'Look, field overlays, x-ray cut, and orbit guides. Overlays live here — Sky/Rock only jump to one.'],
    lab: ['Lab', 'Station first: inspect a cell, take a core. Then the instruments — redox tower, Keeling, diversity, transit.'],
    sandbox: ['World', 'Energy mode, Gaia, resolution, and the archive for this run.'],
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
      land: ['raise', 'Land'],
      life: ['seedGuild', 'Life'],
      strike: ['meteor', 'Strike'],
    },
    god: {
      aim: ['godwatch', 'Run'],
      challenge: ['challenge', 'Challenge'],
      genesis: ['genesis', 'Genesis'],
    },
    view: {
      look: ['appear', 'Look'],
      layers: ['survey', 'Layers'],
      slice: ['slice', 'Slice'],
      guides: ['orbitguides', 'Guides'],
    },
    lab: {
      station: ['station', 'Station'],
      all: ['tablab', 'All'],
      tower: ['o2', 'Tower'],
      curves: ['curves', 'Curves'],
      survey: ['survey', 'Survey'],
      notes: ['notes', 'Notes'],
    },
    sandbox: {
      modes: ['modes', 'Modes'],
      archive: ['archive', 'Archive'],
    },
  };
  document.querySelectorAll('.suite-desk-tab').forEach((b) => {
    const suite = b.dataset.suite;
    const desk = b.dataset.desk;
    const meta = suiteMeta[suite]?.[desk];
    if (meta) decorateButton(b, meta[0], meta[1]);
    const tip = SUITE_TIPS[suite]?.[desk];
    if (tip) bindTip(b, tip.title, tip.body);
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
    'godundo', 'godredo', 'godcull', 'godwatch', 'godbookmark',
    'scenariostart', 'genesisrand', 'genesisgo', 'dailyseed',
    'godshelf', 'godshare', 'budget', 'autopilot',
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

  document.querySelectorAll('#catkinds button').forEach((b) => {
    if (b.dataset.id === 'TYPE') {
      bindTip(b, 'Types', 'The five invented rulesets — Earth, Vermis, Selene, Ares, Daisy. Calibration worlds, not archive rows.');
    } else if (b.dataset.id === 'BODY') {
      bindTip(b, 'Bodies', 'Real planets and moons from the catalogue. Physics they still need is listed on the detail card.');
    }
  });
  const overlayJumps = [
    ['rockOverlayPlates', 'plates'],
    ['rockOverlayBounds', 'bounds'],
    ['rockOverlayCrust', 'crust'],
    ['stormOverlay', 'storm'],
  ];
  for (const [id, oid] of overlayJumps) {
    const el = document.getElementById(id);
    const o = overlayById(oid);
    if (el && o?.tip) bindTip(el, o.label, o.tip);
  }
  bindOverlayTips();
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
  const desk = S.labDesk || 'station';
  const stats = document.getElementById('stats');
  if (stats) stats.hidden = desk !== 'station';
  document.querySelectorAll('#labstats .lab-card').forEach((card) => {
    const cat = card.dataset.labCat || 'notes';
    if (desk === 'station') card.hidden = cat !== 'sample';
    else card.hidden = desk !== 'all' && cat !== desk;
  });
}

function bindOverlayTips() {
  document.querySelectorAll('[data-overlay]').forEach((b) => {
    const o = overlayById(b.dataset.overlay);
    if (o?.tip) bindTip(b, o.label, o.tip);
  });
}

function applyOverlayChoice(mode) {
  setOverlayMode(mode || 'none');
  refreshColours(1);
  syncViewOverlayButtons(mode || 'none');
}

function syncViewOverlayButtons(mode) {
  document.querySelectorAll('#viewOverlays button, #climOverlays button, #coastOverlays button, #rockAgeOverlays button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.overlay === mode ? 'true' : 'false');
  });
  const hint = document.getElementById('viewOverlayHint');
  if (hint) {
    const o = overlayById(mode);
    hint.textContent = o ? `${o.label}${mode === 'none' ? '' : ' painted on the globe'}.` : '';
  }
}

function refreshWorldModeStrip() {
  const strip = document.getElementById('worldModeStrip');
  if (!strip) return;
  const I = W.interior;
  const scarcity = W.scarcityMode || (W.budgetMode ? 'budgeted' : 'free');
  strip.innerHTML = `
    <div class="clim-chip" title="Energy: Free / Observe / Budget"><span>Energy</span><b>${scarcity}</b></div>
    <div class="clim-chip" title="Gaia button — cycles Regulator / Gardener / Experimenter autopilot. Off = you drive."><span>Gaia</span><b>${
      W.autopilot ? (gaiaDriveOf(W).label) : 'off'
    }</b></div>
    <div class="clim-chip" title="Simulation grid size — climate and life run here"><span>Sim N</span><b>${N}</b></div>
    <div class="clim-chip" title="Tectonic lid: mobile plates vs stagnant"><span>Lid</span><b>${I?.lidMode || '—'}</b></div>
    <div class="clim-chip" title="Magnetosphere strength — aurora and atmosphere loss"><span>Field</span><b>${(W.magnetosphere ?? 0).toFixed(2)}</b></div>
    <div class="clim-chip" title="Mantle heat flow — volcanoes and plate vigor"><span>Heat</span><b>${I ? I.heatFlow.toFixed(2) : '—'}</b></div>
  `;
}

let _tipTimer = 0;
function bindTip(el, title, body, meta = '') {
  if (!el || el.dataset.tipBound) return;
  el.dataset.tipBound = '1';
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

function doorIsOpen() {
  return document.getElementById('door')?.classList.contains('open');
}

function closeDoor() {
  document.getElementById('door')?.classList.remove('open');
}

function catalogueBodyNamed(name) {
  return CATALOGUE_WORLDS.find((x) => x.b === name) || null;
}

function paintLessonChip() {
  const el = document.getElementById('lessonchip');
  if (!el) return;
  const p = loadLessonProgress();
  const next = nextIncompleteLesson(p);
  if (!p.seenDoor && !p.current && !isDemoMode()) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = lessonChipLabel(p);
  el.title = next ? next.body : 'The Solar System is the tutorial. Play → Challenge has the rest.';
}

function onTourButton() {
  const p = loadLessonProgress();
  const next = lessonById(p.current) || nextIncompleteLesson(p);
  if (next && !lessonDone(next.id, p) && lessonWorldReady(next)) {
    onLessonChip();
    return;
  }
  saveLessonProgress(offerTourAgain(p));
  setPaused(true);
  document.getElementById('dock')?.classList.add('collapsed');
  openDoor();
}

function paintCampaignTrack() {
  const track = document.getElementById('campaigntrack');
  if (!track) return;
  const p = loadLessonProgress();
  track.innerHTML = '';
  const addRow = (id, title, meta, on, done, start) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'camp-row' + (on ? ' on' : '') + (done ? ' done' : '');
    b.innerHTML = `<span class="ck">${done ? '✓' : '○'}</span><span class="ct">${title}</span><span class="cm">${meta}</span>`;
    b.addEventListener('click', start);
    track.appendChild(b);
  };
  for (const lesson of LESSONS) {
    addRow(
      lesson.id,
      lesson.title,
      lesson.kicker,
      p.current === lesson.id,
      !!p.done[lesson.id],
      () => startLesson(lesson.id),
    );
  }
  for (const id of CAMPAIGN) {
    if (LESSONS.some((l) => l.scenario === id)) continue;
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) continue;
    addRow(id, s.title, 'Challenge', false, false, () => beginScenario(id, { moment: true }));
  }
}

function finishLesson(id, foundKey = null) {
  const lesson = lessonById(id);
  if (!lesson || lessonDone(id)) return;
  const nextP = completeLesson(id);
  S.lessonId = nextP.current;
  const nxt = lessonById(nextP.current) || nextIncompleteLesson(nextP);
  const found = foundKey
    ? `Found ${foundKey}.`
    : (lesson.winHint || '');
  const sub = nxt
    ? `${found ? `${found} ` : ''}Next: ${nxt.title}`
    : (found || 'The Solar System was the tutorial.');
  showMoment('Lesson', lesson.title, sub);
  playEvent('quiet', 0.7);
  paintLessonChip();
  paintCampaignTrack();
}

function beginScenario(id, opts = {}) {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) return null;
  const baseRule = RULESETS.find((r) => r.id === s.ruleId) || W.rule;
  const rule = s.epochId
    ? ruleForEra(baseRule, s.epochId)
    : mergeRunRule(baseRule, {
      deepTime: !!s.deepTime,
      startAgeGa: s.startAgeGa,
      landscape: s.landscape,
    });
  runGenerate(W.seed ^ 0x51, rule);
  startScenario(id);
  S._lessonStartedAt = performance.now();
  if (opts.moment !== false) showMoment('Scenario', s.title, s.objective);
  updateHUD();
  return s;
}

function startLesson(id) {
  const lesson = lessonById(id);
  if (!lesson) return;
  closeDoor();
  closeLandPicker();
  skipReveal();
  document.getElementById('reveal')?.setAttribute('hidden', '');
  setCurrentLesson(id);
  S.lessonId = id;
  S._lessonStartedAt = performance.now();
  S._lessonFailNoted = false;
  if (lesson.catalogue) {
    const item = catalogueBodyNamed(lesson.catalogue);
    if (item) loadCatalogueItem(item);
    applyScalePreset(S, 'hold');
    S.localExpanded = true;
    applyLocalLayout();
    setPaused(true);
    _taughtAlive = true;
    showMoment(lesson.kicker || 'Tour', lesson.title, lesson.body);
  } else if (lesson.scenario) {
    beginScenario(lesson.scenario, { moment: false });
    _taughtAlive = true;
    setPaused(lesson.id === 'crisis');
    if (lesson.id === 'crisis') {
      setDockTab('tools');
      setSuiteDesk('tools', 'strike');
    }
    showMoment(lesson.kicker || 'Lesson', lesson.title, lesson.body);
  } else {
    beginHoldEarthLesson();
  }
  paintLessonChip();
  paintCampaignTrack();
}

function openDoor() {
  const panel = document.getElementById('door');
  const grid = document.getElementById('doorgrid');
  if (!panel || !grid) return;
  closeLandPicker();
  closeLocalKey();
  markDoorSeen();
  grid.innerHTML = '';
  for (const id of DOOR_IDS) {
    const lesson = lessonById(id);
    if (!lesson) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'door-card';
    b.innerHTML = `<div class="dk">${lesson.kicker}</div><div class="dt">${lesson.title}</div><div class="db">${lesson.body}</div>`;
    b.addEventListener('click', () => startLesson(id));
    grid.appendChild(b);
  }
  skipReveal();
  document.getElementById('reveal')?.setAttribute('hidden', '');
  panel.classList.add('open');
}

function lessonWorldReady(lesson) {
  if (!lesson) return false;
  if (lesson.catalogue) {
    const item = catalogueBodyNamed(lesson.catalogue);
    return !!(item && S.catalogueId === item.id);
  }
  if (lesson.scenario) return W.scenarioId === lesson.scenario;
  return true;
}

function onLessonChip() {
  const p = loadLessonProgress();
  const cur = lessonById(p.current);
  const next = (!cur || lessonDone(cur.id, p)) ? nextIncompleteLesson(p) : cur;
  if (!next) {
    setDockTab('god');
    setSuiteDesk('god', 'challenge');
    showMoment('Tour', 'The Solar System is the tutorial', 'Challenges live in Play.');
    return;
  }
  if (p.current === next.id && !lessonDone(next.id, p) && lessonWorldReady(next)) {
    showMoment(next.kicker || 'Lesson', next.title, next.body);
    return;
  }
  startLesson(next.id);
}

function checkLessonProgress() {
  const id = S.lessonId;
  if (!id || doorIsOpen()) return;
  const lesson = lessonById(id);
  if (!lesson || lessonDone(id)) return;
  if (id === 'hold-earth') {
    const step = S._holdStep | 0;
    if (step === 0 && S._lessonSpun) {
      S._holdStep = 1;
      showMoment('Hold Earth', 'Come closer', 'Scroll toward the globe — or press 4 for ISS height.');
    } else if (step === 1 && (S.camDist < (S._lessonCam0 || 2.45) - 0.22 || S.camDist < 2.05)) {
      S._holdStep = 2;
      showMoment('Hold Earth', 'Open the map', 'With Inspect (Q), click the coast. The square is where you can stand.');
      setTool('inspect');
    } else if (step === 2 && S.localPin >= 0) {
      finishLesson(id);
    }
    return;
  }
  if (lesson.hunt) {
    const hover = S.localHoverKey;
    const cellKey = S.localHoverCell >= 0 ? legendKeyAt(W, S.localHoverCell) : null;
    const hit = [hover, cellKey].find((k) => huntMatches(k, lesson));
    if (hit) finishLesson(lesson.id, hit);
    return;
  }
  if (lesson.scenario === 'daisy-tutorial') {
    const report = evaluateScenario(W);
    if (report?.regulated && (performance.now() - (S._lessonStartedAt || 0)) > 3500) {
      finishLesson(lesson.id);
    }
    return;
  }
  if (lesson.scenario === 'save-snowball') {
    const report = evaluateScenario(W);
    if (report?.failed) {
      if (!S._lessonFailNoted) {
        S._lessonFailNoted = true;
        showMoment('Ended', report.ending?.title || 'The run ended', report.ending?.epitaph || '');
      }
      return;
    }
    if (report?.broken) finishLesson(lesson.id);
  }
}

function setupReveal() {
  const el = document.getElementById('reveal');
  if (el) el.hidden = true;
  skipReveal();
  document.getElementById('reveal')?.setAttribute('hidden', '');
  S.lessonId = loadLessonProgress().current;
  document.getElementById('doorskip')?.addEventListener('click', () => startLesson('hold-earth'));
  document.getElementById('lessonchip')?.addEventListener('click', onLessonChip);
  paintCampaignTrack();
  paintLessonChip();
}

function setupClimatePanel() {
  const pane = document.getElementById('pane-climate');
  if (!pane) return;
  pane.innerHTML = climatePanelChrome();
  bindClimatePanel({
    setOverlay: (mode) => applyOverlayChoice(mode),
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
    setOverlay: (mode) => applyOverlayChoice(mode),
    showMoment,
    getInspectCell: () => S.inspect?.cell ?? -1,
    onChange: () => { refreshColours(0.7); needGeom(); },
  });
}

let refreshGuildHint = () => {};

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
    refreshGuildHint = () => {
      const hint = document.getElementById('guildhint');
      if (!hint) return;
      const name = labels[guildSel.value] || guildSel.value;
      hint.textContent = activeTool === 'seedGuild'
        ? `Click the planet to plant ${name}.`
        : `Seed guild plants ${name}. Pick that verb, then click.`;
    };
    guildSel.onchange = () => { setSelectedGuild(guildSel.value); refreshGuildHint(); };
    refreshGuildHint();
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
    beginScenario(id, { moment: true });
  });
  document.getElementById('godundo')?.addEventListener('click', () => {
    const r = undoStroke();
    if (r) { showErr(r.note); refreshColours(1); needGeom(); refreshLayerPanel(); }
    else showErr('Nothing to undo');
  });
  document.getElementById('godredo')?.addEventListener('click', () => {
    const r = redoStroke();
    if (r) { showErr(r.note); refreshColours(1); needGeom(); refreshLayerPanel(); }
    else showErr('Nothing to redo');
  });
  document.getElementById('godbookmark')?.addEventListener('click', () => {
    const b = addBookmark();
    showMoment('Bookmark', b.label, formatAge(b.ageYr));
  });
  bindTimeRibbon();
  document.getElementById('godwatch')?.addEventListener('click', () => {
    S.letItRun = !S.letItRun;
    setLetItRun(S.letItRun);
    document.body.classList.toggle('letitrun', S.letItRun);
    document.getElementById('godwatch')?.setAttribute('aria-pressed', S.letItRun ? 'true' : 'false');
  });
  document.getElementById('godshelf')?.addEventListener('click', () => {
    addToShelf(W, serializeRun);
    if (TABLE.enabled) syncTableFromShelf(TABLE, W);
    showMoment('Shelf', W.worldName || W.rule.name, `${loadShelf().length} worlds saved`);
  });
  document.getElementById('godshare')?.addEventListener('click', () => {
    const id = worldIdOf(W);
    let text = id;
    try {
      const u = new URL(location.href);
      u.searchParams.set('world', id);
      u.searchParams.delete('seed');
      u.searchParams.delete('land');
      text = `${id}\n${u.toString()}`;
    } catch { /* no location */ }
    navigator.clipboard?.writeText(text);
    showMoment('World id', 'Copied', id);
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
  const brushSym = document.getElementById('brushsym');
  if (brushSym) {
    brushSym.onchange = () => { BRUSH.symmetry = brushSym.value || null; };
  }
  bindLayerPanel();
  const landOpts = LANDSCAPES.map((l) => `<option value="${l.id}">${l.name}</option>`).join('');
  const landSel = document.getElementById('landshape');
  const genLandSel = document.getElementById('genesisland');
  const landBlurb = document.getElementById('landshapeblurb');
  const syncLandPick = (id, suggestLand = false) => syncLandscapeUi(id, suggestLand);
  if (landSel) {
    landSel.innerHTML = landOpts;
    landSel.value = S.landscape || 'auto';
    syncLandPick(landSel.value);
    landSel.addEventListener('change', () => syncLandPick(landSel.value));
  }
  if (genLandSel) {
    genLandSel.innerHTML = landOpts;
    genLandSel.value = S.landscape || 'auto';
    genLandSel.addEventListener('change', () => syncLandPick(genLandSel.value, true));
  }
  const presetSel = document.getElementById('genesispreset');
  if (presetSel) {
    presetSel.innerHTML = '<option value="">— preset —</option>' +
      PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
    presetSel.addEventListener('change', () => {
      if (presetSel.value !== 'no-plates') return;
      const plates = document.getElementById('genesisplates');
      if (plates) { plates.value = 1; plates.dispatchEvent(new Event('input')); }
    });
  }
  const bindRange = (id, valId, fmt, on) => {
    const el = document.getElementById(id);
    const lab = document.getElementById(valId);
    if (!el) return;
    const sync = () => { if (lab) lab.textContent = fmt(+el.value); on?.(+el.value); };
    el.addEventListener('input', sync);
    sync();
  };
  bindRange('genesisplates', 'genesisplatesVal', (v) => String(v));
  bindRange('genesiswater', 'genesiswaterVal', (v) => `${(v / 100).toFixed(2)}×`);
  bindRange('genesislandfrac', 'genesislandfracVal', (v) => `${v}%`);
  bindRange('genesisorigindiff', 'genesisorigindiffVal', (v) => `${(+v).toFixed(1)}×`);
  bindRange('origindiff', 'origindiffVal', (v) => {
    W.originDifficulty = +v;
    if (W.rule) W.rule.originDifficulty = +v;
    return `${(+v).toFixed(1)}×`;
  });
  document.getElementById('godcull')?.addEventListener('click', () => {
    let best = null;
    for (const id of W.tree?.living || []) {
      const n = W.tree.byId.get(id);
      if (n && (!best || (n.pop || 0) > (best.pop || 0))) best = n;
    }
    if (!best) { showMoment('Cull', 'Nothing living', 'No lineage to remove.'); return; }
    const r = cullClade(best.id);
    showMoment('Cull', r.name || best.name, r.ok ? `${r.killed || 0} cells cleared` : (r.note || 'failed'));
  });
  document.getElementById('genesisgo')?.addEventListener('click', () => {
    if (!confirmLeaveLand()) return;
    const base = W.rule || RULESETS[0];
    const g = genesisFromPanel(document);
    g.rulesetId = base.id || 'terra';
    if (!g.name) g.name = nameWorld(g.seed, g.landscape);
    const rule = rulesetFromGenesis(g);
    runGenerate(g.seed, rule);
    syncLandscapeUi(g.landscape);
    applyGenesisToWorld(W, g);
    S.genesis = g;
    const seedEl = document.getElementById('genesisseed');
    if (seedEl) seedEl.value = g.seedLabel || encodeWorldId(g.seed, g.landscape);
    rememberWorldId(worldIdOf(W));
    refreshGenesisReport(g);
    applyOverlayChoice('plates');
    showMoment('Genesis', g.name, genesisSummary(g, W));
  });
  document.getElementById('genesisrand')?.addEventListener('click', () => {
    const g = randomizeGenesis({ habitable: true });
    document.getElementById('genesisname').value = g.name;
    document.getElementById('genesisseed').value = encodeWorldId(g.seed, g.landscape);
    if (genLandSel) genLandSel.value = g.landscape;
    const plates = document.getElementById('genesisplates');
    const water = document.getElementById('genesiswater');
    const landf = document.getElementById('genesislandfrac');
    if (plates) { plates.value = g.nPlates; plates.dispatchEvent(new Event('input')); }
    if (water) { water.value = Math.round(g.waterInventory * 100); water.dispatchEvent(new Event('input')); }
    if (landf) { landf.value = Math.round((g.landFrac ?? g.continentFrac) * 100); landf.dispatchEvent(new Event('input')); }
  });
  document.getElementById('dailyseed')?.addEventListener('click', () => {
    if (!confirmLeaveLand()) return;
    const g = genesisFromPanel(document);
    g.seed = dailySeed();
    g.rulesetId = W.rule?.id || 'terra';
    const rule = rulesetFromGenesis(g);
    runGenerate(g.seed, rule);
    applyGenesisToWorld(W, g);
    S.genesis = g;
    syncLandscapeUi(g.landscape);
    rememberWorldId(worldIdOf(W));
    refreshGenesisReport(g);
    showMoment('Daily world', g.name, genesisSummary(g));
  });
}

function setDockTab(tab) {
  document.querySelectorAll('.dock-tabs button').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.tab === tab ? 'true' : 'false');
  });
  document.querySelectorAll('.dock-pane').forEach((p) => {
    p.classList.toggle('on', p.id === `pane-${tab}`);
  });
  const dock = document.getElementById('dock');
  dock?.classList.toggle('lab-mode', tab === 'lab');
  if (typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches) {
    dock?.classList.add('is-open');
    document.getElementById('docktoggle')?.setAttribute('aria-expanded', 'true');
  }
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
  const chemMem = speciesMemoryReadout(W);
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
    sampleCard = card('sample', 'core', 'Core sample',
      `${coreStrataSVG(S.lastSample.layers)}
      <div class="lab-meta">cell <b>${S.lastSample.cell}</b> · ${S.lastSample.biome}
      ${S.lastSample.proxies ? ` · δ¹³C <b>${S.lastSample.proxies.d13C.toFixed(1)}</b> · pH <b>${S.lastSample.proxies.pH.toFixed(2)}</b>` : ''}
      </div>`);
  } else if (S.lastSample?.samples) {
    const ppm = S.lastSample.samples.map((s) => s.co2 * 1e6);
    sampleCard = card('sample', 'icecore', 'Ice core',
      `${chartAreaSVG(ppm, { id: 'ice', color: '#9fc0ff', label: ' ppm', digits: 0 })}
      <div class="lab-meta">${S.lastSample.note || ''}</div>`);
  }

  el.innerHTML =
    sampleCard +
    card('tower', 'o2', 'Redox tower',
      `${redoxTowerSVG(gauge, 300, S.highlightGuild)}
      <div class="lab-meta">hover a guild to light it on the globe · high yield at top` +
      (chemMem.length
        ? `<br>chemistry memory · ${chemMem.map((s) =>
            `<b>${s.id}</b> ${s.mean.toFixed(3)}`).join(' · ')}`
        : '') +
      `</div>`, true) +
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
    card('survey', 'seed', 'Tree',
      `${treeToSvg(layoutTree(W.tree, 280, 140)) || '<div class="lab-meta">No phylogeny yet.</div>'}` +
      `<div class="lab-meta">depth <b>${treeSummary(W.tree).maxDepth || 0}</b> · ${phy.living} living` +
      (W.foodWeb?.links?.length ? ` · ${W.foodWeb.links.length} trophic links` : '') +
      `</div>`) +
    card('survey', 'survey', 'Whittaker space',
      `${whitakerSVG(whit)}
      <div class="lab-meta">${whit.length} of ${NC} cells (~250 km each) in temperature–rainfall space</div>`) +
    card('survey', 'solar', 'Transit spectrum',
      `${spectrumSVG(spec.lines)}
      <div class="lab-meta">${spec.note}</div>`) +
    card('tower', 'autopilot', 'Gaia',
      `<div class="lab-meta">feedback <b>${(W.feedbackGain || 0).toFixed(2)}</b> · Medea <b>${((W.medeaScore || 0) * 100) | 0}</b>` +
      (W.carbon ? ` · Ω <b>${W.carbon.omegaAragonite.toFixed(2)}</b>` : '') +
      ` · mode <b>${W.gaiaMode || '—'}</b>` +
      ` · drive <b>${W.autopilot ? gaiaDriveOf(W).label : 'off'}</b>` +
      (W.gaiaFailed ? ` · <b style="color:#c44">overwhelmed</b>` : '') +
      (W.gaiaObjective ? `<br>aims to <b>${W.gaiaObjective}</b>` : '') +
      (W.gaiaLastAct ? `<br>last: ${W.gaiaLastAct}` : '') +
      (W.mood?.label ? ` · mood <b>${W.mood.label}</b>` : '') +
      `</div>`) +
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

let _pitchHoldMoment = false;

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
  if (!_pitchHoldMoment) _momentTimer = setTimeout(() => el.classList.remove('show'), 4200);
}

function resetMomentAnnouncer() {
  _announcedMoments = new Set();
  _announcedDrama = new Set();
}

let _taughtAlive = false;
let _teachT0 = 0;
function maybeTeachWindow(t) {
  if (_taughtAlive) return;
  if (doorIsOpen()) { _teachT0 = 0; return; }
  if (!_teachT0) _teachT0 = t || 0;
  if ((t || 0) - _teachT0 < 1100) return;
  _taughtAlive = true;
  try {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch { /* ignore */ }
  let best = -1, score = -1;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel || (W.ice[c] || 0) > 0.4) continue;
    let coast = false;
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (n >= 0 && W.h[n] < W.seaLevel) { coast = true; break; }
    }
    if (!coast) continue;
    const s = (W.life[c] || 0) * 2.2 + (W.moist[c] || 0) + (W.build[c] || 0) * 1.4;
    if (s > score) { score = s; best = c; }
  }
  if (best < 0) return;
  if (S.localSeek !== 'life') S.localPin = best;
  else S.localPin = -1;
  S.localGlobe = 'rim';
  if (S.localRadius < 8) S.localRadius = 8;
  requestFace(best);
  showMoment('The window', 'This patch is the rim on the globe.', 'Click a being to follow · Shift+D watches a day');
  refreshColours(1);
}

function syncLandscapeUi(id, suggestLand = false) {
  S.landscape = id;
  for (const elId of ['landshape', 'genesisland']) {
    const el = document.getElementById(elId);
    if (el) el.value = id;
  }
  const landBlurb = document.getElementById('landshapeblurb');
  if (landBlurb) landBlurb.textContent = landscapeById(id).blurb;
  if (suggestLand) {
    const ls = landscapeById(id);
    if (ls.land != null) {
      const landf = document.getElementById('genesislandfrac');
      if (landf) {
        landf.value = Math.round(ls.land * 100);
        landf.dispatchEvent(new Event('input'));
      }
    }
  }
}

/** Openings — hand-checked (seed, archetype) pairs.
 *  Boot used to be `runGenerate(20260808, RULESETS[0])`: one constant, so every
 *  first run this project has ever shown was the same planet. A URL `?seed=` or
 *  `?land=` or `?world=` still pins it exactly, so a shared link is reproducible. */
const OPENINGS = [
  { seed: 20260808, landscape: 'auto' },
  { seed: 1043, landscape: 'shattered' },
  { seed: 88117, landscape: 'twoworlds' },
  { seed: 4402, landscape: 'archipelago' },
  { seed: 71230, landscape: 'pangaea' },
  { seed: 5150, landscape: 'belt' },
  { seed: 33871, landscape: 'inland' },
  { seed: 9004, landscape: 'polar' },
  { seed: 61207, landscape: 'highland' },
  { seed: 2718, landscape: 'ridge' },
];

const WORLD_HIST_KEY = 'orrery-world-ids';

function rememberWorldId(id) {
  if (!id) return;
  try {
    const prev = JSON.parse(localStorage.getItem(WORLD_HIST_KEY) || '[]');
    const next = [id, ...prev.filter((x) => x !== id)].slice(0, 12);
    localStorage.setItem(WORLD_HIST_KEY, JSON.stringify(next));
  } catch { /* private mode */ }
}

function worldHistory() {
  try { return JSON.parse(localStorage.getItem(WORLD_HIST_KEY) || '[]'); }
  catch { return []; }
}

function confirmLeaveLand() {
  if (!W._sculpted) return true;
  return typeof confirm === 'function'
    ? confirm('This world has carved land that is not in the seed. Leave it?')
    : true;
}

function genesisSummary(g, Wref = W) {
  const rep = Wref._landReport;
  const n = Wref.plates?.length || g.nPlates;
  const land = rep ? `${(rep.landFrac * 100).toFixed(0)}% land · ${rep.count} masses` : '';
  return `${landscapeById(g.landscape).name} · ${n} plates · ${land}`;
}

function refreshGenesisReport(g) {
  const el = document.getElementById('genesisreport');
  if (!el || !W._landReport) return;
  const rep = W._landReport;
  const n = W.plates?.length || g.nPlates;
  const seedNote = g.seedLabel ? `"${g.seedLabel}" → ${g.seed}` : String(g.seed);
  el.textContent = `Built ${landscapeById(g.landscape).name} · ${n} plates · `
    + `water ${(g.waterInventory || 1).toFixed(2)}× · `
    + `${(rep.landFrac * 100).toFixed(0)}% land (${rep.count} masses) · seed ${seedNote}`;
}

function readUrlOpening() {
  let q = null;
  try { q = new URLSearchParams(location.search); } catch { return null; }
  const world = q.get('world');
  if (world) {
    const d = decodeWorldId(world) || parseWorldInput(world);
    if (d?.seed != null) {
      return { seed: d.seed, landscape: d.landscape || 'auto', epoch: d.epoch || null, pinned: true };
    }
  }
  const urlSeed = parseInt(q.get('seed') || '', 10);
  const urlLand = q.get('land');
  const urlEra = q.get('era');
  if (Number.isFinite(urlSeed) || urlLand || urlEra) {
    return {
      seed: Number.isFinite(urlSeed) ? urlSeed >>> 0 : freshSeed(),
      landscape: urlLand && landscapeById(urlLand).id === urlLand ? urlLand : 'auto',
      epoch: urlEra || null,
      pinned: true,
    };
  }
  return null;
}

function pickOpening() {
  const pinned = readUrlOpening();
  if (pinned) return pinned;
  const weighted = OPENINGS.filter((o) => o.landscape !== 'auto');
  const pool = weighted.length ? weighted.concat(OPENINGS) : OPENINGS;
  return { ...pool[(Math.random() * pool.length) | 0], pinned: false };
}

function applyOpening(opening, opts = {}) {
  const base = opts.rule || W.rule || RULESETS[0];
  const g = genesisFromPanel(document);
  g.seed = opening.seed;
  g.landscape = opening.landscape;
  g.rulesetId = base.id || 'terra';
  if (!g.name) g.name = opening.name || nameWorld(g.seed, g.landscape);
  const born = rulesetFromGenesis(g);
  const rule = opening.epoch ? ruleForEra(born, opening.epoch) : born;
  S.landscape = opening.landscape;
  runGenerate(opening.seed, rule);
  W.worldName = g.name;
  applyGenesisToWorld(W, g);
  S.genesis = g;
  rememberWorldId(worldIdOf(W));
  syncLandscapeUi(g.landscape);
  const seedEl = document.getElementById('genesisseed');
  if (seedEl) seedEl.value = encodeWorldId(opening.seed, opening.landscape, opening.epoch);
  refreshGenesisReport(g);
  updateHUD();
}

function pickerCandidates(current) {
  const out = [];
  const seen = new Set();
  const add = (seed, landscape) => {
    const id = encodeWorldId(seed, landscape);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ seed, landscape, id, name: nameWorld(seed, landscape) });
  };
  if (current) add(current.seed, current.landscape);
  for (const o of OPENINGS) add(o.seed, o.landscape);
  const extras = ['shattered', 'twoworlds', 'archipelago', 'inland', 'highland', 'ridge', 'pangaea'];
  let n = 0;
  while (out.length < 9 && n < 24) {
    add(freshSeed(), extras[n % extras.length]);
    n++;
  }
  return out.slice(0, 9);
}

function closeLandPicker() {
  document.getElementById('landpick')?.classList.remove('open');
  resetLandPickerUi();
}

function resetLandPickerUi() {
  _landPickDone = null;
  document.getElementById('landpickcontinue')?.setAttribute('hidden', '');
  const sub = document.getElementById('landpicksub');
  if (sub) {
    sub.textContent = 'Nine continent layouts. Same planet type. The four-word id under each globe is what you send someone.';
  }
}

function finishLandPicker() {
  const done = _landPickDone;
  _landPickDone = null;
  closeLandPicker();
  if (done) done();
}

function localKeyOpen() {
  return document.getElementById('localkey')?.classList.contains('open');
}

function closeLocalKey() {
  const panel = document.getElementById('localkey');
  if (!panel?.classList.contains('open')) return;
  panel.classList.remove('open');
  document.getElementById('localkeybtn')?.setAttribute('aria-pressed', 'false');
  S.localLegendLock = null;
}

function openLocalKey(focusId = null) {
  const panel = document.getElementById('localkey');
  const list = document.getElementById('localkeylist');
  const sub = document.getElementById('localkeysub');
  if (!panel || !list) return;
  closeLandPicker();
  if (sub) {
    sub.textContent = `Each square is one sim cell (~${cellKm(N)} km). Colour is cover, or the metabolism that won it. Sprites on top are genomes from an open morphospace — not sixteen stamps.`;
  }
  const highlightable = new Set();
  for (const sec of legendGlossary(W)) {
    if (sec.highlight === false) continue;
    for (const e of sec.entries) highlightable.add(e.id);
  }
  const highlight = (focusId && highlightable.has(focusId)) ? focusId : null;
  if (highlight) {
    S.localLegendLock = highlight;
    S.localHoverKey = highlight;
  }
  list.innerHTML = '';
  const addSec = (title, blurb) => {
    const h = document.createElement('div');
    h.className = 'lk-sec';
    h.textContent = title;
    list.appendChild(h);
    if (blurb) {
      const p = document.createElement('p');
      p.className = 'lk-blurb';
      p.textContent = blurb;
      list.appendChild(p);
    }
  };
  const addGrid = (className) => {
    const g = document.createElement('div');
    g.className = 'lk-grid' + (className ? ` ${className}` : '');
    list.appendChild(g);
    return g;
  };
  const addRow = (parent, e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lk-row';
    b.dataset.key = e.id;
    const sw = document.createElement('i');
    sw.className = 'lk-swatch' + (e.swatch ? ` ${e.swatch}` : '');
    if (!e.swatch || e.swatch === 'dot') {
      sw.style.background = `rgb(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]})`;
    }
    const body = document.createElement('div');
    body.innerHTML = `<div class="lk-name">${e.tip || e.label}</div><div class="lk-why">${e.why || ''}</div>`;
    b.append(sw, body);
    b.addEventListener('pointerenter', () => {
      S.localLegendLock = e.id;
      S.localHoverKey = e.id;
      for (const row of list.querySelectorAll('.lk-row')) {
        row.classList.toggle('on', row.dataset.key === e.id);
      }
    });
    b.addEventListener('pointerleave', () => {
      if (S.localLegendLock === e.id) S.localLegendLock = null;
    });
    b.addEventListener('click', () => {
      S.localLegendLock = e.id;
      S.localHoverKey = e.id;
    });
    parent.appendChild(b);
  };
  for (const sec of legendGlossary(W)) {
    addSec(sec.title, sec.blurb);
    const grid = addGrid(sec.grid || '');
    for (const e of sec.entries) addRow(grid, e);
  }
  for (const row of list.querySelectorAll('.lk-row')) {
    row.classList.toggle('on', !!highlight && row.dataset.key === highlight);
  }
  panel.classList.add('open');
  document.getElementById('localkeybtn')?.setAttribute('aria-pressed', 'true');
  if (highlight) {
    list.querySelector(`.lk-row[data-key="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  } else {
    list.scrollTop = 0;
  }
}

function openLandPicker(opts = {}) {
  const panel = document.getElementById('landpick');
  const grid = document.getElementById('landpickgrid');
  const foot = document.getElementById('landpickfoot');
  if (!panel || !grid) return;
  closeLocalKey();
  closeDoor();
  _landPickDone = opts.onDone || null;
  const sub = document.getElementById('landpicksub');
  const cont = document.getElementById('landpickcontinue');
  if (opts.firstVisit) {
    cont?.removeAttribute('hidden');
    if (sub) {
      sub.textContent = 'Pick a continent layout — or keep the one behind this panel. Then continue to choose how to play.';
    }
  } else {
    cont?.setAttribute('hidden', '');
  }
  const current = {
    seed: (W.landSeed ?? W.seed) >>> 0,
    landscape: W._landscape || S.landscape || 'auto',
  };
  const cards = pickerCandidates(current);
  grid.innerHTML = '';
  for (const c of cards) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lp-card';
    b.setAttribute('aria-pressed', c.seed === current.seed && c.landscape === current.landscape ? 'true' : 'false');
    const cvs = document.createElement('canvas');
    cvs.width = 160; cvs.height = 160;
    drawLandscapeThumb(cvs.getContext('2d'), c.seed, c.landscape, 160);
    const meta = document.createElement('div');
    meta.className = 'lp-meta';
    const idBits = c.id.split('.');
    const shortId = idBits[0].split('-').slice(0, 2).join('-') + (idBits[1] ? ` · ${idBits[1]}` : '');
    meta.innerHTML = `<div class="lp-name">${c.name}</div><div class="lp-id" title="${c.id}">${shortId}</div>`;
    b.append(cvs, meta);
    b.addEventListener('click', () => {
      if (!confirmLeaveLand()) return;
      applyOpening(c, { rule: W.rule });
      setPaused(true);
      showMoment('Starting world', c.name, genesisSummary(S.genesis || { landscape: c.landscape, nPlates: W.rule?.nPlates }));
      if (_landPickDone) {
        grid.querySelectorAll('.lp-card').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
      } else {
        closeLandPicker();
      }
    });
    grid.appendChild(b);
  }
  const hist = worldHistory();
  if (foot) {
    const recent = hist.slice(0, 3).map((id) => {
      const p = id.split('.');
      return p[0].split('-').slice(0, 2).join('-') + (p[1] ? `.${p[1]}` : '');
    });
    foot.textContent = recent.length
      ? `Recent: ${recent.join(' · ')}`
      : 'The id under a globe is what you send someone.';
  }
  panel.classList.add('open');
  if (opts.pause) setPaused(true);
  document.getElementById('dock')?.classList.add('collapsed');
}

/* ---------- boot UI ---------- */
export function boot() {
  const cvs = document.getElementById('c');
  const bootN = parseInt(document.getElementById('simN')?.value || '96', 10);
  if (bootN !== N && N_ALLOWED.includes(bootN)) changeResolution(bootN);
  const bootSubd = parseInt(document.getElementById('globeSubd')?.value || '2', 10);
  const rec = recommendGlobeSubd(bootN);
  const subdEl = document.getElementById('globeSubd');
  if (rec < bootSubd && subdEl) {
    subdEl.value = String(rec);
    setGlobeSubd(rec);
  } else if (GLOBE_SUBD_ALLOWED.includes(bootSubd) && bootSubd !== GLOBE_SUBD) {
    setGlobeSubd(bootSubd);
  }
  remeshPlanet();
  initGL(cvs);

  setupCatalogue();
  setupGodPanel();
  setupClimatePanel();
  setupPlatesPanel();
  setupTips();
  setupReveal();

  const TOOL_DESK = {
    land: 'land',
    life: 'life',
    dis: 'strike',
    clim: 'strike',
  };
  const deskEls = {
    land: document.getElementById('toolsLand'),
    life: document.getElementById('toolsLife'),
    strike: document.getElementById('toolsStrike'),
    clim: document.getElementById('toolsClimate'),
    see: document.getElementById('toolsSample'),
  };
  const syncToolPress = () => {
    document.querySelectorAll(TOOL_BTN_SEL)
      .forEach((x) => x.setAttribute('aria-pressed', x.dataset.id === activeTool ? 'true' : 'false'));
  };
  const adoptTool = (t) => {
    setTool(t.id);
    syncToolPress();
    refreshGuildHint();
    if (t.group === 'see') {
      // Inspect is also spin-the-globe — don't yank the dock open.
      if (t.id !== 'inspect') {
        setDockTab('lab');
        setSuiteDesk('lab', 'station');
      }
      return;
    }
    setDockTab('tools');
    setSuiteDesk('tools', TOOL_DESK[t.group] || 'land');
  };
  TOOLS.forEach((t) => {
    const b = document.createElement('button');
    decorateButton(b, t.id, t.name);
    b.dataset.id = t.id;
    const tip = tipForTool(t.id);
    const meta = [
      t.key ? `Key ${t.key.toUpperCase()}` : null,
      t.drag ? 'Drag to stroke' : (t.group === 'clim' ? 'Whole planet' : 'Click the planet'),
      t.irreversible ? 'Hold to commit' : null,
      t.cost ? `Listed cost ~${t.cost}` : 'Free',
    ].filter(Boolean).join(' · ');
    if (tip) bindTip(b, tip.title, tip.body, meta);
    else b.title = meta;
    b.onclick = () => {
      if (toolsUnlocked(W)[t.id] === false) return;
      adoptTool(t);
    };
    if (t.id === 'inspect') b.setAttribute('aria-pressed', 'true');
    const host = t.group === 'clim' ? deskEls.clim
      : t.group === 'see' ? deskEls.see
      : deskEls[TOOL_DESK[t.group] || 'land'];
    host?.appendChild(b);
  });

  const viewOverlays = document.getElementById('viewOverlays');
  if (viewOverlays) {
    viewOverlays.innerHTML = overlaysForPicker().map((o) =>
      `<button type="button" data-overlay="${o.id}">${iconSVG(o.icon || 'inspect')}<span class="btn-label">${o.label}</span></button>`
    ).join('');
    viewOverlays.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-overlay]');
      if (!btn) return;
      applyOverlayChoice(btn.dataset.overlay);
    });
    syncViewOverlayButtons('none');
    bindOverlayTips();
  }

  const viewGuides = document.getElementById('viewOrbitGuides');
  if (viewGuides) {
    decorateButton(viewGuides, 'orbitguides', 'Axis guides');
    viewGuides.setAttribute('aria-pressed', S.orbitGuides ? 'true' : 'false');
    viewGuides.addEventListener('click', () => {
      S.orbitGuides = !S.orbitGuides;
      viewGuides.setAttribute('aria-pressed', S.orbitGuides ? 'true' : 'false');
    });
  }

  // Dock tabs
  document.querySelectorAll('.dock-tabs button').forEach((b) => {
    b.onclick = () => setDockTab(b.dataset.tab);
  });
  document.getElementById('docktoggle')?.addEventListener('click', () => {
    const dock = document.getElementById('dock');
    const btn = document.getElementById('docktoggle');
    if (!dock) return;
    const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
    if (phone) dock.classList.toggle('is-open');
    else dock.classList.toggle('collapsed');
    const open = phone ? dock.classList.contains('is-open') : !dock.classList.contains('collapsed');
    btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn?.setAttribute('aria-pressed', open ? 'true' : 'false');
  });
  if (typeof matchMedia === 'function') {
    const phoneQ = matchMedia('(max-width: 640px)');
    const onPhone = (e) => {
      const dock = document.getElementById('dock');
      const btn = document.getElementById('docktoggle');
      if (!dock) return;
      if (e.matches) {
        dock.classList.remove('collapsed', 'is-open');
        btn?.setAttribute('aria-expanded', 'false');
      } else {
        dock.classList.remove('is-open');
        btn?.setAttribute('aria-expanded', dock.classList.contains('collapsed') ? 'false' : 'true');
      }
    };
    phoneQ.addEventListener('change', onPhone);
    if (phoneQ.matches) {
      document.getElementById('docktoggle')?.setAttribute('aria-expanded', 'false');
    }
  }

  document.getElementById('pause').onclick = togglePause;
  document.getElementById('newseed').onclick = () => {
    if (!confirmLeaveLand()) return;
    const g = genesisFromPanel(document);
    g.seed = freshSeed();
    g.rulesetId = W.rule?.id || 'terra';
    const rule = rulesetFromGenesis(g);
    runGenerate(g.seed, rule);
    applyGenesisToWorld(W, g);
    S.genesis = g;
    syncLandscapeUi(g.landscape);
    rememberWorldId(worldIdOf(W));
    refreshGenesisReport(g);
    showMoment('Reseed', g.name, genesisSummary(g));
  };
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
    const { autopilot, drive } = cycleGaiaButton(W);
    const btn = document.getElementById('autopilot');
    btn.setAttribute('aria-pressed', autopilot ? 'true' : 'false');
    const label = autopilot ? gaiaDriveOf(W).label : 'Gaia';
    decorateButton(btn, 'autopilot', label);
    chronLog(W.year, 'gaia', 0, 1,
      autopilot ? `Gaia ${gaiaDriveOf(W).label} ON — ${gaiaDriveOf(W).aim}` : 'Gaia autopilot OFF');
    refreshWorldModeStrip();
    updateHUD();
  };
  document.getElementById('simN')?.addEventListener('change', (e) => {
    const n = parseInt(e.target.value, 10);
    if (!N_ALLOWED.includes(n)) return;
    try {
      changeResolution(n);
      const rec = recommendGlobeSubd(n);
      const subdEl = document.getElementById('globeSubd');
      if (rec < parseInt(subdEl?.value || '2', 10)) {
        subdEl.value = String(rec);
        setGlobeSubd(rec);
      }
      remeshPlanet();
      const eng = getGpgpu();
      if (eng?.ok) {
        eng.destroySlot('primary');
        eng.createSlot('primary', { N: n });
      }
      runGenerate(W.seed, W.rule);
      const eff = effectiveGlobeSubd(n);
      const quads = (6 * globeN() * globeN()).toLocaleString();
      const cap = eff < parseInt(subdEl?.value || '2', 10) ? ` · mesh capped at ${eff}×` : '';
      const pace = n >= 384 ? ' · ticks will drop to hold the frame' : n >= 256 ? ' · heavy CPU' : '';
      showMoment('Resolution', `N=${n}`, `~${cellKm(n)} km/cell · ${(6 * n * n).toLocaleString()} cells · ${quads} quads${cap}${pace}`);
    } catch (err) {
      showErr(String(err.message || err));
    }
  });
  document.getElementById('globeSubd')?.addEventListener('change', (e) => {
    const s = parseInt(e.target.value, 10);
    if (!GLOBE_SUBD_ALLOWED.includes(s)) return;
    try {
      setGlobeSubd(s);
      remeshPlanet();
      const eff = effectiveGlobeSubd();
      const quads = (6 * globeN() * globeN()).toLocaleString();
      const cap = eff < s ? ` (capped to ${eff}×)` : '';
      showMoment('Globe mesh', `${s}×${cap}`, `${globeVertexCount().toLocaleString()} verts · ${quads} quads`);
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
  const applyViewScale = (id) => {
    const p = applyScalePreset(S, id);
    if (!p) return;
    if (id === 'iss') S.localRadius = Math.max(S.localRadius, 12);
    document.querySelectorAll('#viewScale [data-scale]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.scale === id ? 'true' : 'false');
    });
    const rung = document.getElementById('scalerung');
    if (rung) rung.textContent = scaleRung(S.camDist, W.noSurface);
  };
  document.getElementById('viewScale')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scale]');
    if (b) applyViewScale(b.dataset.scale);
  });
  const showEoref = (id) => {
    const ref = eorefById(id);
    const box = document.getElementById('eoref');
    const img = document.getElementById('eorefImg');
    const cap = document.getElementById('eorefCap');
    if (!box || !img) return;
    img.src = ref.url;
    img.alt = `${ref.label} — ${ref.credit}`;
    if (cap) cap.textContent = `${ref.label} · ${ref.credit}. ${ref.note}`;
    box.classList.add('on');
    if (ref.preset) applyViewScale(ref.preset);
  };
  const hideEoref = () => {
    const box = document.getElementById('eoref');
    if (!box) return;
    box.classList.remove('on');
  };
  document.getElementById('viewEoref')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-eoref]');
    if (b) showEoref(b.dataset.eoref);
  });
  document.getElementById('eorefHide')?.addEventListener('click', hideEoref);
  document.getElementById('eorefClose')?.addEventListener('click', hideEoref);
  const syncLook = () => {
    document.getElementById('lookPhoto')?.setAttribute('aria-pressed', S.lookMode === 'photo' ? 'true' : 'false');
    document.getElementById('lookDiagram')?.setAttribute('aria-pressed', S.lookMode === 'diagram' ? 'true' : 'false');
    document.getElementById('cloudFree')?.setAttribute('aria-pressed', S.cloudFree ? 'true' : 'false');
  };
  document.getElementById('lookPhoto')?.addEventListener('click', () => { S.lookMode = 'photo'; syncLook(); });
  document.getElementById('lookDiagram')?.addEventListener('click', () => { S.lookMode = 'diagram'; syncLook(); });
  document.getElementById('cloudFree')?.addEventListener('click', () => { S.cloudFree = !S.cloudFree; syncLook(); });
  syncLook();
  const canvasBtn = document.getElementById('canvasmode');
  const syncCanvas = () => {
    W._canvasMode = !!S.canvasMode;
    canvasBtn?.setAttribute('aria-pressed', S.canvasMode ? 'true' : 'false');
  };
  canvasBtn?.addEventListener('click', () => {
    S.canvasMode = !S.canvasMode;
    syncCanvas();
    if (S.canvasMode) {
      applyOverlayChoice('crust');
      setTool('raise');
      setSuiteDesk('tools', 'land');
      document.querySelectorAll(TOOL_BTN_SEL).forEach((x) => {
        x.setAttribute('aria-pressed', x.dataset.id === 'raise' ? 'true' : 'false');
      });
      S.localExpanded = true;
      syncLocalLayout?.();
      showErr('Canvas: cube net on the map. Left-drag to paint. Plates frozen.');
    } else {
      showErr('Canvas off — geology ticks again.');
    }
  });
  document.getElementById('rerolland')?.addEventListener('click', () => {
    if (W.rule) W.rule.landscape = S.landscape || 'auto';
    const r = rerollTerrain();
    if (r?.ok) {
      refreshColours(1);
      needGeom();
      const rep = r.report;
      showErr(rep
        ? `New continents · ${rep.count} landmasses · ${(rep.landFrac * 100).toFixed(0)}% land`
        : 'Same climate, new continents.');
      rememberWorldId(worldIdOf(W));
      updateHUD();
      refreshLayerPanel();
    } else showErr(r?.note || 'Could not reroll land');
  });
  document.getElementById('landpickbtn')?.addEventListener('click', () => openLandPicker({ pause: true }));
  document.getElementById('landpickclose')?.addEventListener('click', () => {
    if (_landPickDone) finishLandPicker();
    else closeLandPicker();
  });
  document.getElementById('landpickcontinue')?.addEventListener('click', () => finishLandPicker());
  document.getElementById('tourbtn')?.addEventListener('click', onTourButton);
  document.getElementById('localkeybtn')?.addEventListener('click', () => {
    if (localKeyOpen()) closeLocalKey();
    else openLocalKey();
  });
  document.getElementById('localkeyclose')?.addEventListener('click', () => closeLocalKey());
  syncView();

  const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
  S.localSize = phone ? LOCAL_SIZE_S : LOCAL_SIZE_M;
  if (phone) S.localSnap = 'tr';
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
  applyLocalLayout = syncLocalLayout;
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

    const chrome = localPanel?.dataset.chrome || 'map';
    const tight = chrome === 'icon' || chrome === 'chip';
    const fits = () => !tight && tools.scrollWidth <= tools.clientWidth + 1;

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
    // Then zoom chips if still tight (S / icon / chip).
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
    let legendKind = null;
    const fillLocalLegend = () => {
      const kind = W._planetKind || 'earth';
      if (kind === legendKind && localLegend.children.length) return;
      legendKind = kind;
      localLegend.innerHTML = '';
      for (const e of legendEntries(W)) {
        const el = document.createElement('span');
        el.className = 'leg';
        el.dataset.key = e.id;
        el.dataset.tip = e.tip || e.label;
        el.title = el.dataset.tip;
        const sw = document.createElement('i');
        sw.style.background = `rgb(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]})`;
        el.appendChild(sw);
        el.appendChild(document.createTextNode(e.label));
        el.addEventListener('pointerenter', () => {
          S.localLegendLock = e.id;
          S.localHoverKey = e.id;
        });
        el.addEventListener('pointerleave', () => {
          if (localKeyOpen()) return;
          if (S.localLegendLock === e.id) S.localLegendLock = null;
        });
        el.addEventListener('click', () => openLocalKey(e.id));
        localLegend.appendChild(el);
      }
    };
    fillLocalLegend();
    syncLocalChrome = (patch, hoverKey) => {
    fillLocalLegend();
    if (localLegend) {
      const n = Math.max(1, patch?.status?.nCells || 1);
      const shares = patch?.status?.shares || {};
      const ranked = patch?.status?.census?.ranked || [];
      const rankOf = Object.fromEntries(ranked.map((e, i) => [e.id, i]));
      const hasCensus = !!(patch?.status?.census && !patch?.status?.net);
      const chrome = localPanel?.dataset.chrome || 'map';
      const maxLegs = chrome === 'chip' ? 6 : 14;
      const keep = new Set();
      for (const e of ranked) {
        if (keep.size >= maxLegs) break;
        if (((shares[e.id] || 0) / n) * 100 >= 1) keep.add(e.id);
      }
      for (const el of localLegend.children) {
        const k = el.dataset.key;
        const on = hoverKey && k === hoverKey;
        const share = (shares[k] || 0) / n;
        const pct = Math.round(share * 100);
        const present = pct >= 1;
        el.hidden = hasCensus && !on && (!present || !keep.has(k));
        el.style.order = String(rankOf[k] ?? 99);
        el.classList.toggle('on', !!on);
        el.classList.toggle('dim', !!(hoverKey && !on && present));
        el.style.setProperty('--share', share.toFixed(3));
        let num = el.querySelector('.leg-n');
        if (!num) {
          num = document.createElement('span');
          num.className = 'leg-n';
          el.appendChild(num);
        }
        // Fixed-width pct so chips don't reflow as 1% ↔ 11% ↔ 100%.
        num.textContent = present ? `${String(pct).padStart(2, '\u2007')}%` : '';
        const tip = el.dataset.tip || k;
        el.title = present ? `${tip} · ${pct}% of this window` : tip;
      }
    }
    if (localStatus && patch?.status) {
      const st = patch.status;
      const chip = localPanel?.dataset.chrome === 'chip';
      const bit = (k, v) =>
        `<span class="st" data-k="${k}"><em>${k}</em><b>${v}</b></span>`;
      const censusLine = chip
        ? [st.census?.coverLine, st.census?.guildLine, st.census?.critterLine]
            .filter(Boolean).join(' · ').split(' · ').slice(0, 4).join(' · ')
        : st.census?.line;
      localStatus.innerHTML = [
        censusLine ? bit('in', censusLine) : '',
        bit('here', st.place || (st.pinned ? 'pinned' : 'live')),
        !chip && !st.pinned && st.seek === 'life' ? bit('track', st.why || 'life') : '',
        st.scaleKm ? bit('view', `~${st.scaleKm} km`) : bit('view', `${st.side}×${st.side}`),
        !chip && (st.water && st.water !== 'dry' && st.water !== 'ice' ? bit('flow', st.water) : (st.rivers ? bit('flow', 'rivers') : '')),
        st.day ? bit('light', S.dayWatch ? 'a day' : (st.moonlit ? 'moonlit' : st.day)) : '',
        !chip && st.behind ? bit('look', 'far side') : '',
        !chip && st.whisper ? bit('then', st.whisper) : '',
        !chip && S.follow?.name ? bit('who', S.follow.name + (S.follow.behav ? ' · ' + S.follow.behav : '')) : '',
      ].filter(Boolean).join('');
      localStatus.title = [
        st.census?.line ? `In view: ${st.census.line}` : '',
        st.place,
        st.pinned ? 'Pinned' : (st.seek === 'life' ? (st.why ? `Touring ${st.why}` : 'Hunting recent life') : 'Live focus'),
        `Cell ${st.cell}`,
        st.label ? `Life: ${st.label}` : '',
        st.biome ? `Biome: ${st.biome}` : '',
        st.scaleNamed ? `Window ~${st.scaleKm} km${st.scaleNamed.startsWith('≈') ? ` (${st.scaleNamed} scale)` : ` · ${st.scaleNamed}`}` : '',
        st.cellKm ? `Cell ~${st.cellKm} km` : '',
        S.follow?.name ? `Following ${S.follow.name}` : '',
      ].filter(Boolean).join(' · ');
      localStatus.classList.toggle('pinned', !!st.pinned);
      localPanel?.setAttribute('data-light', st.moonlit ? 'moonlit' : (st.day || ''));
      localPanel?.classList.toggle('behind', !!st.behind);
      localPanel?.classList.toggle('daywatch', !!S.dayWatch);
    }
    const card = document.getElementById('lifecard');
    if (card) {
      const f = S.follow;
      if (f?.name) {
        card.hidden = false;
        card.querySelector('.lc-kicker').textContent = f.behav === 'flee' ? 'fleeing' : 'following';
        card.querySelector('.lc-name').textContent = f.name;
        const bits = [f.behav, f.kind === 5 ? 'settler' : null].filter(Boolean);
        card.querySelector('.lc-meta').textContent = bits.join(' · ');
      } else {
        card.hidden = true;
      }
    }
  };
  }
  mkSeg('localSnap', LOCAL_SNAPS, ['TL', 'TR', 'BL', 'BR'],
    () => S.localSnap,
    (v) => { S.localSnap = v; syncLocalLayout(); });
  mkSeg('localGlobe', LOCAL_GLOBE, ['Off', 'Rim', 'Wash', 'Both'],
    () => S.localGlobe,
    (v) => {
      S.localGlobe = v;
      refreshColours(1);
    });
  mkSeg('localSeek', LOCAL_SEEK, LOCAL_SEEK_LABELS,
    () => S.localSeek,
    (v) => {
      S.localSeek = v;
      resetFocusCache();
      if (v === 'life') {
        S.follow = null;
        clearLocalPin();
      } else if (S._localFocus >= 0) {
        pinLocal(S._localFocus);
      }
      const auto = document.querySelector('#localMove [data-auto]');
      if (auto) auto.title = v === 'life' ? 'Hunt recent life — release pin' : 'Stay — densest life';
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
    requestFace(cell);
    if (S.localGlobe === 'wash' || S.localGlobe === 'both') refreshColours(1);
  };
  const clearLocalPin = () => {
    S.localPin = -1;
    S.follow = null;
    resetFocusCache();
    if (S.localGlobe === 'wash' || S.localGlobe === 'both') refreshColours(1);
  };
  const nudgeLocal = (dx, dy) => {
    const base = S.localPin >= 0 ? S.localPin : S._localFocus;
    if (base < 0) return;
    pinLocal(stepFocus(base, dx, dy));
  };
  const stepLocalZoom = (dir) => {
    const i = LOCAL_RADII.indexOf(S.localRadius);
    const fallback = Math.max(0, LOCAL_RADII.indexOf(8));
    const ni = Math.max(0, Math.min(LOCAL_RADII.length - 1, (i < 0 ? fallback : i) + dir));
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
    const auto = mk('·', clearLocalPin, S.localSeek === 'life' ? 'Hunt recent life — release pin' : 'Stay — densest life');
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
  localCvs.addEventListener('contextmenu', (e) => e.preventDefault());
  localCvs.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const rect = localCvs.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const c = hoverCellAt(S._localPatch, cssX, cssY);
    const tool = TOOLS.find((t) => t.id === activeTool);
    const paint = S.canvasMode || e.button === 2 || (e.altKey && activeTool !== 'inspect');
    if (paint && c >= 0) {
      setPinpoint(true);
      setCrustOceanic(activeTool === 'crust' && e.shiftKey);
      setBrushInvert(e.altKey && (activeTool === 'raise' || activeTool === 'lower'));
      if (tool?.drag) {
        const r = beginToolDrag(c);
        if (r?.ok) {
          S.toolDrag = true;
          localDrag = { paint: true, x: e.clientX, y: e.clientY, moved: false };
          localCvs.setPointerCapture(e.pointerId);
          onToolResult(r);
          return;
        }
      }
      onToolResult(useToolAt(c, { oceanic: e.shiftKey }));
      return;
    }
    if (S.canvasMode) return;
    localCvs.setPointerCapture(e.pointerId);
    localCvs.style.cursor = 'grabbing';
    const base = S.localPin >= 0 ? S.localPin : S._localFocus;
    localDrag = { x: e.clientX, y: e.clientY, moved: false, startPin: base };
    localAccX = 0; localAccY = 0;
  });
  localCvs.addEventListener('pointermove', (e) => {
    const rect = localCvs.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    if (!localDrag) {
      const c = hoverCellAt(S._localPatch, cssX, cssY);
      S.localHoverCell = c;
      setLocalHover(c);
      if (!S.localLegendLock) {
        S.localHoverKey = c >= 0 ? legendKeyAt(W, c) : null;
      }
      if (activeTool !== 'inspect') {
        setPinpoint(true);
        if (c >= 0) previewBrush(c);
        else { BRUSH.preview = []; BRUSH.previewCenter = -1; }
      }
      localCvs.style.cursor = beingAtLocalPixel(S._localPatch, cssX, cssY) ? 'pointer' : 'crosshair';
      return;
    }
    if (localDrag.paint) {
      const c = hoverCellAt(S._localPatch, cssX, cssY);
      S.localHoverCell = c;
      if (c >= 0 && S.toolDrag) moveToolDrag(c);
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
    if (localDrag.paint) {
      if (S.toolDrag) endToolDrag();
      S.toolDrag = false;
      setBrushInvert(false);
      localDrag = null;
      refreshColours(1);
      return;
    }
    if (!localDrag.moved) {
      const rect = localCvs.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const who = beingAtLocalPixel(S._localPatch, cssX, cssY);
      if (who && !who.dead) {
        S.follow = who;
        pinLocal(who.cell);
        showErr(who.name ? `Following ${who.name}` : 'Following');
      } else {
        const c = hoverCellAt(S._localPatch, cssX, cssY);
        if (c >= 0) {
          pinLocal(c);
          if (activeTool === 'inspect') {
            S.inspect = inspectCell(c);
            updateHUD();
          }
        }
      }
    }
    localDrag = null;
  };
  localCvs.addEventListener('pointerup', endLocalDrag);
  localCvs.addEventListener('pointercancel', () => { localDrag = null; localCvs.style.cursor = 'crosshair'; });
  localCvs.addEventListener('dblclick', (e) => {
    if (localPanel?.dataset.chrome !== 'icon') return;
    e.preventDefault();
    stepLocalFrame(1);
  });
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
    // Shift-drag / middle-mouse: slide the globe aside so the map can breathe.
    if (e.button === 1 || (e.shiftKey && !e.altKey && e.button === 0)) {
      panning = true;
      lastX = e.clientX;
      lastY = e.clientY;
      S.angVel[0] = 0;
      S.angVel[1] = 0;
      canvas.style.cursor = 'grabbing';
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
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
      } else if (e.altKey && (activeTool === 'inspect' || !TOOLS.find((t) => t.id === activeTool)?.drag)) {
        fingerOfGod(cell, e.shiftKey ? 'delete' : 'boost');
        playEvent('seed', 0.5);
      } else {
        const tool = TOOLS.find((t) => t.id === activeTool);
        setPinpoint(false);
        setBrushInvert(e.altKey && (activeTool === 'raise' || activeTool === 'lower'));
        if (tool?.drag && cell >= 0) {
          setCrustOceanic(activeTool === 'crust' && e.shiftKey);
          const r = beginToolDrag(cell);
          if (r?.ok) { S.toolDrag = true; canvas.setPointerCapture(e.pointerId); }
          else onToolResult(r || useToolAt(cell, { oceanic: e.shiftKey }));
        } else {
          onToolResult(useToolAt(cell, { oceanic: e.shiftKey }));
        }
      }
      return;
    }
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    canvas._spinStartX = e.clientX;
    canvas._spinStartY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (S.toolDrag) { endToolDrag(); S.toolDrag = false; setBrushInvert(false); refreshColours(1); }
    if (S.commitHold) cancelCommitHold(false);
    if (panning) {
      panning = false;
      canvas.style.cursor = '';
    }
    if (dragging && activeTool === 'inspect' && e) {
      const dist = Math.hypot(e.clientX - (canvas._spinStartX || 0), e.clientY - (canvas._spinStartY || 0));
      if (dist > 22 && S.lessonId === 'hold-earth') S._lessonSpun = true;
      if (dist < 6) {
        const cell = desktopPick(e.clientX, e.clientY);
        if (cell != null && cell >= 0) {
          pinLocal(cell);
          onToolResult(useToolAt(cell));
          setDockTab('lab');
          setSuiteDesk('lab', 'station');
        }
      }
    }
    dragging = false;
  });
  canvas.addEventListener('pointercancel', () => {
    panning = false;
    dragging = false;
    canvas.style.cursor = '';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (S.toolDrag) {
      const cell = desktopPick(e.clientX, e.clientY);
      if (cell >= 0) { moveToolDrag(cell); refreshColours(0.4); }
      return;
    }
    if (panning) {
      panGlobe(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
      return;
    }
    if (!dragging) {
      setPinpoint(false);
      const cell = desktopPick(e.clientX, e.clientY);
      setLocalHover(cell);
      const tool = TOOLS.find((t) => t.id === activeTool);
      if (cell >= 0 && (tool?.drag || tool?.group === 'dis' || tool?.id === 'seedGuild' || tool?.id === 'seed')) {
        previewBrush(cell);
      } else {
        BRUSH.preview = [];
        BRUSH.previewCenter = -1;
      }
      requestPreview();
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
  canvas.addEventListener('dblclick', (e) => {
    if (Math.abs(S.camPanX) < 1e-4 && Math.abs(S.camPanY) < 1e-4) return;
    const cell = desktopPick(e.clientX, e.clientY);
    if (cell == null || cell < 0) resetCamPan();
  });
  canvas.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    S.camDist = clamp(S.camDist * (1 + Math.sign(e.deltaY) * (S.camDist > 8 ? 0.14 : 0.09)), camDistMin(W), CAM_DIST_MAX);
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  addEventListener('keydown', (e) => {
    audioInit();
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    if (e.key === 'Escape' && doorIsOpen()) {
      startLesson('hold-earth');
      return;
    }
    if (e.key === '?' && !e.shiftKey) {
      e.preventDefault();
      onTourButton();
      return;
    }
    if (e.key === 'Escape' && localKeyOpen()) {
      closeLocalKey();
      return;
    }
    if (e.key === 'Escape' && S.localExpanded) {
      stepLocalFrame(-1);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      resetCamPan();
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
      const r = e.shiftKey ? redoStroke() : undoStroke();
      if (r) { showErr(r.note); refreshColours(1); needGeom(); refreshLayerPanel(); }
    }
    else if (e.shiftKey && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      const on = audioMute();
      showErr(on ? 'Sound off' : 'Sound on');
    }
    else if (e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      if (S.follow) { S.follow = null; showErr('Released'); }
      else {
        const t = followTarget();
        if (t) {
          S.follow = t;
          pinLocal(t.cell);
          showErr(t.name ? `Following ${t.name}` : 'Following');
        }
      }
    }
    else if (e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      setDayWatch(!S.dayWatch);
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
        adoptTool(t);
      }
    }
  });

  const applyPitchShot = (id) => {
    S.pitchShot = true;
    _pitchHoldMoment = true;
    setPaused(true);
    closeLandPicker();
    closeDoor();
    document.getElementById('catpanel')?.classList.remove('open');
    document.getElementById('catbtn')?.setAttribute('aria-pressed', 'false');
    document.getElementById('dock')?.classList.remove('collapsed');
    document.getElementById('reveal')?.setAttribute('hidden', '');
    S.localGlobe = 'rim';
    refreshColours(1);
    if (id === 'hud') {
      applyScalePreset(S, 'hold');
      setDockTab('tools');
      setSuiteDesk('tools', 'land');
      showMoment('First occurrence', 'First free oxygen', 'present', momentRGB('firstOxygen'));
    } else if (id === 'currents') {
      applyScalePreset(S, 'hold');
      setDockTab('view');
      setSuiteDesk('view', 'layers');
      applyOverlayChoice('current');
      S.localExpanded = false;
      S.localSize = LOCAL_SIZE_M;
      pinLocal(findCoastalCell());
      syncLocalLayout();
    } else if (id === 'local') {
      applyScalePreset(S, 'hold');
      setDockTab('tools');
      setSuiteDesk('tools', 'land');
      applyOverlayChoice('none');
      S.localExpanded = true;
      S.localSize = LOCAL_SIZE_M;
      pinLocal(findCoastalCell());
      syncLocalLayout();
    } else if (id === 'worlds') {
      applyScalePreset(S, 'hold');
      setDockTab('tools');
      setSuiteDesk('tools', 'land');
      applyOverlayChoice('none');
      document.getElementById('catpanel')?.classList.add('open');
      document.getElementById('catbtn')?.setAttribute('aria-pressed', 'true');
      renderCatalogue();
    }
    updateHUD();
    refreshColours(1);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      globalThis.__orreryPitchReady = true;
    }));
  };

  setupXR();
  const bad = validateCatalogueWorlds();
  if (bad.length) console.warn('[orrery] catalogue worlds failed sanitize:', bad);
  else console.log(`[orrery] catalogue · ${CATALOGUE_WORLDS.length} worlds ready`);
  const opening = isDemoMode()
    ? { seed: 20260808, landscape: 'auto', pinned: false }
    : pickOpening();
  const bootRule = isDemoMode()
    ? (RULESETS.find((r) => r.id === 'thrive') || RULESETS[0])
    : RULESETS[0];
  applyOpening(opening, { rule: bootRule });
  if (isDemoMode()) setLifeSpeed(2);
  let pitch = null;
  try { pitch = new URLSearchParams(location.search).get('pitch'); } catch { /* ignore */ }
  if (pitch) applyPitchShot(pitch);
  else if (!opening.pinned && shouldOfferDoor()) {
    setPaused(true);
    setSuiteDesk('tools', 'land');
    skipReveal();
    document.getElementById('dock')?.classList.add('collapsed');
    openLandPicker({
      firstVisit: true,
      pause: true,
      onDone: () => {
        skipReveal();
        openDoor();
        paintLessonChip();
      },
    });
  } else if (isDemoMode()) {
    setPaused(false);
    paintLessonChip();
    showMoment('Demo', 'Orrery', 'Tour · Worlds · Play → Challenge · ?demo=1 for this opening Earth');
  }
  requestAnimationFrame(desktopFrame);
  const quads = (6 * globeN() * globeN()).toLocaleString();
  console.log(`[orrery] foundations rebuild · ${NC.toLocaleString()} cells · ${quads} globe quads (${effectiveGlobeSubd()}× mesh) · ${(vIdx.length / 3).toLocaleString()} tris`);
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
  m4persp(PROJ, CAM_FOV, canvas.width / canvas.height, 0.02, 900);
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
      if (g.scaleDelta !== 1) S.scaleXR = clamp(S.scaleXR * g.scaleDelta, XR_SCALE_MIN, XR_SCALE_MAX);
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
      if (Math.abs(ay) > 0.18) S.scaleXR = clamp(S.scaleXR - ay * 0.006, XR_SCALE_MIN, XR_SCALE_MAX);
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
      S.scaleXR = clamp(S.scaleXR * ratio, XR_SCALE_MIN, XR_SCALE_MAX);
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
