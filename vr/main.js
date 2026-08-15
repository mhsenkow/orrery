/** ORRERY main — UI, input, XR, sim loop. */

import { clamp, qAxis, qmul, qnorm, qFromTo, m4, m4persp, m4lookAt, showErr } from './math.js';
import { NC, AREA } from './sphere.js';
import { W, generate, simTick, setSunDir, RULESETS, chronLog } from './world.js';
import { ENT, respawnEntities, agentsTick } from './agents.js';
import { initGL, gl, canvas, rebuildGeometry, refreshColours, uploadEntities, drawScene, vIdx, updateLocalHighlight } from './render.js';
import { TOOLS, setTool, activeTool, useToolAt, pickCell, fingerOfGod } from './tools.js';
import { exportChronicle, currentEraName, whatHappenedHere } from './chronicle.js';
import { audioInit, audioUpdate, playEvent } from './audio.js';
import { LIFE_CLASSES } from './sim/bio.js';
import {
  drawLocalView, layoutLocalPanel, stepFocus, cellAtLocalPixel,
  LOCAL_SIZES, LOCAL_SNAPS, LOCAL_GLOBE, LOCAL_RADII,
} from './localview.js';
import { CATALOGUE, CATALOGUE_CATS, CATALOGUE_KIND } from './catalogue.js';
import { rulesetFromCatalogue, adjacentCatalogueWorld, CATALOGUE_WORLDS, validateCatalogueWorlds } from './catalogue-rules.js';

const S = {
  q: new Float32Array([0, 0, 0, 1]),
  spin: 0.035,
  camDist: 3.1,
  scaleXR: 0.22,
  posXR: [0, 1.18, -0.52],
  paused: false,
  detail: 0,
  entFade: 0,
  sunAng: 0.6,
  fps: 0,
  _fa: 0,
  _ft: 0,
  tier: 'Orbital',
  simAlpha: 1,
  inspect: null,
  follow: null,
  opacity: 1,
  xray: 0,
  grid: 0,
  localSize: 220,
  localSnap: 'br',
  localGlobe: 'rim',
  localRadius: 8,
  localPin: -1,       // >=0 pins the local window; -1 = auto-track
  _localFocus: -1,
  _localPatch: null,
  catalogueId: null,
  catFilter: 'all',
  catKind: 'BODY', // Worlds first
  catQuery: '',
};

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
  rebuildGeometry();
  respawnEntities();
  uploadEntities();
  updateHUD();
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
    detail.classList.add('show');
    detail.innerHTML =
      `<b>${item.b || item.t}</b> · playable now<br>${item.d}` +
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
  renderCatalogue();
}

function togglePause() {
  S.paused = !S.paused;
  const b = document.getElementById('pause');
  b.setAttribute('aria-pressed', S.paused ? 'true' : 'false');
  b.textContent = S.paused ? 'Resume' : 'Pause';
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
  document.getElementById('stats').innerHTML =
    `year <b>${W.year.toLocaleString()}</b> · <b>${currentEraName(W.chron)}</b><br>` +
    `state <b>${W.state}</b> · health <b>${(W.health * 100) | 0}%</b> · ${S.tier}<br>` +
    `T <b>${W.meanTemp.toFixed(2)}</b> · sea <b>${W.seaLevel.toFixed(3)}</b><br>` +
    `land <b>${pc(land)}</b> · ice <b>${pc(W.iceFrac * NC)}</b><br>` +
    bioLine +
    `CO₂ <b>${(g.CO2 * 100).toFixed(1)}%</b> O₂ <b>${(g.O2 * 100).toFixed(1)}%</b><br>` +
    (W.budgetMode ? `energy <b>${W.energy.toFixed(0)}</b> · ` : '') +
    `<b>${S.fps}</b> fps · ents ${ENT.n}`;

  const chip = document.getElementById('worldchip');
  if (chip) {
    chip.innerHTML = S.catalogueId
      ? `<b>${R.name}</b> <small>#${S.catalogueId} · seed ${W.seed}</small>`
      : `<b>${R.name}</b> <small>sandbox · seed ${W.seed}</small>`;
  }

  const insp = document.getElementById('inspect');
  if (!insp) return;
  if (S.inspect) {
    const x = S.inspect;
    insp.style.display = 'block';
    insp.innerHTML =
      `<b>Cell ${x.cell}</b><br>` +
      `elev ${x.h.toFixed(3)} · T ${x.temp.toFixed(2)} · moist ${x.moist.toFixed(2)}<br>` +
      `life ${x.life.toFixed(2)} (${LIFE_CLASSES[x.lifeClass]?.id || '—'}) · ice ${x.ice.toFixed(2)}<br>` +
      `build ${(x.build || 0).toFixed(2)} · plate ${x.plate}<br>` +
      `flow ${x.flow.toFixed(2)} · clouds ${x.clouds.toFixed(2)}`;
    const hist = whatHappenedHere(W.chron, x.cell);
    if (hist.length) {
      insp.innerHTML += '<br><span style="color:#9fc0ff">Here:</span> ' +
        hist.slice(0, 3).map((e) => e.label).join(' · ');
    }
  } else insp.style.display = 'none';
}

function update(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0);
  lastT = t;
  S.sunAng += dt * 0.055;
  setSunDir(Math.cos(S.sunAng), 0.34, Math.sin(S.sunAng));

  if (!S.paused && !grabbing) {
    qAxis(tmpQ, 0, 1, 0, S.spin * dt);
    qmul(S.q, S.q, tmpQ);
    qnorm(S.q);
  }

  if (!S.paused) {
    simAcc += dt;
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
      if (elapsed > 12) { simAcc = 0; break; } // never block frames
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
  // Entities readable from Regional, not only Local
  S.entFade = clamp(1 - (alt - 0.55) / 0.7, 0, 1);
  S.tier = alt > 1.1 ? 'Orbital' : alt > 0.45 ? 'Regional' : alt > 0.16 ? 'Local' : 'Surface';

  audioUpdate();

  if (!xrSession) {
    const lv = document.getElementById('localview');
    if (lv) {
      const patch = drawLocalView(lv, S.inspect, { radius: S.localRadius, pin: S.localPin });
      const prevFocus = S._localFocus;
      updateLocalHighlight(patch, S.localGlobe);
      S._localFocus = patch?.focus ?? -1;
      S._localPatch = patch;
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
  // Camera at [0,0.28,camDist] looking at origin — unproject approx
  const eye = [0, 0.28, S.camDist];
  const fov = 50 * Math.PI / 180;
  const asp = canvas.width / canvas.height;
  const tan = Math.tan(fov / 2);
  const dir = [x * tan * asp, y * tan + 0.02, -1];
  const dl = Math.hypot(...dir) || 1;
  dir[0] /= dl; dir[1] /= dl; dir[2] /= dl;
  return pickCell(eye, dir, [0, 0, 0], 1, S.q);
}

function onToolResult(res) {
  if (!res) return;
  if (res.error) showErr(res.error);
  if (res.needConfirm && confirm('Planet buster — destroy this world?')) {
    useToolAt(res.cell ?? 0, { confirm: true });
    playEvent('buster', 1);
    needGeom();
  }
  if (res.ok) {
    playEvent(activeTool === 'meteor' ? 'impact' : activeTool === 'seed' ? 'seed' : 'tool', 0.6);
    if (['raise', 'lower', 'meteor', 'buster', 'volcano', 'quake'].includes(activeTool)) needGeom();
  }
  if (res.cell != null && activeTool === 'inspect') {
    S.inspect = res;
    S.localPin = res.cell; // inspect also plants the local window
  }
  updateHUD();
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

  const PRIMARY_TOOLS = new Set(['inspect', 'solar', 'seed', 'raise', 'lower', 'meteor', 'co2', 'o2']);
  const toolsEl = document.getElementById('tools');
  const toolsMore = document.getElementById('toolsMore');
  const syncToolPress = () => {
    const all = [...(toolsEl?.children || []), ...(toolsMore?.children || [])];
    all.forEach((x) => x.setAttribute('aria-pressed', x.dataset.id === activeTool ? 'true' : 'false'));
  };
  TOOLS.forEach((t) => {
    const b = document.createElement('button');
    b.textContent = t.name;
    b.title = `Key ${t.key.toUpperCase()} · cost ${t.cost}`;
    b.dataset.id = t.id;
    b.onclick = () => { setTool(t.id); syncToolPress(); };
    if (t.id === 'inspect') b.setAttribute('aria-pressed', 'true');
    (PRIMARY_TOOLS.has(t.id) ? toolsEl : toolsMore)?.appendChild(b);
  });
  const moreBtn = document.getElementById('moretools');
  if (moreBtn && toolsMore) {
    moreBtn.onclick = () => {
      const on = !toolsMore.classList.contains('open');
      toolsMore.classList.toggle('open', on);
      moreBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      moreBtn.textContent = on ? 'Fewer tools' : 'More tools';
    };
  }

  // Dock tabs
  document.querySelectorAll('.dock-tabs button').forEach((b) => {
    b.onclick = () => {
      const tab = b.dataset.tab;
      document.querySelectorAll('.dock-tabs button').forEach((x) =>
        x.setAttribute('aria-pressed', x.dataset.tab === tab ? 'true' : 'false'));
      document.querySelectorAll('.dock-pane').forEach((p) =>
        p.classList.toggle('on', p.id === `pane-${tab}`));
    };
  });
  document.getElementById('docktoggle')?.addEventListener('click', () => {
    document.getElementById('dock')?.classList.toggle('collapsed');
  });

  document.getElementById('pause').onclick = togglePause;
  document.getElementById('newseed').onclick = () => runGenerate((Math.random() * 1e9) | 0, W.rule);
  document.getElementById('budget').onclick = () => {
    W.budgetMode = !W.budgetMode;
    document.getElementById('budget').setAttribute('aria-pressed', W.budgetMode ? 'true' : 'false');
    updateHUD();
  };
  document.getElementById('autopilot').onclick = () => {
    W.autopilot = !W.autopilot;
    document.getElementById('autopilot').setAttribute('aria-pressed', W.autopilot ? 'true' : 'false');
    chronLog(W.year, 'gaia', 0, 1, W.autopilot ? 'Gaia autopilot ON' : 'Autopilot OFF');
  };
  document.getElementById('export').onclick = () => {
    const text = exportChronicle(W.chron, W.rule.name);
    const blob = new Blob([text], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orrery-${W.rule.id}-${W.seed}.md`;
    a.click();
  };

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
  syncView();

  S.localSize = 180;
  const localPanel = document.getElementById('localpanel');
  const localCvs = document.getElementById('localview');
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
  const syncLocalLayout = () => {
    layoutLocalPanel(localPanel, localCvs, { size: S.localSize, snap: S.localSnap });
  };
  mkSeg('localSize', LOCAL_SIZES, ['S', 'M', 'L', 'XL'],
    () => S.localSize,
    (v) => { S.localSize = v; syncLocalLayout(); });
  mkSeg('localSnap', LOCAL_SNAPS, ['TL', 'TR', 'BL', 'BR'],
    () => S.localSnap,
    (v) => { S.localSnap = v; syncLocalLayout(); });
  mkSeg('localGlobe', LOCAL_GLOBE, ['Off', 'Rim', 'Wash', 'Both'],
    () => S.localGlobe,
    (v) => {
      S.localGlobe = v;
      refreshColours(1);
    });
  mkSeg('localRadius', LOCAL_RADII, ['5', '8', '12'],
    () => S.localRadius,
    (v) => { S.localRadius = v; refreshColours(1); });
  syncLocalLayout();
  document.getElementById('localoptsbtn')?.addEventListener('click', () => {
    const box = document.getElementById('localopts');
    const btn = document.getElementById('localoptsbtn');
    const on = !box?.classList.contains('open');
    box?.classList.toggle('open', on);
    btn?.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  const pinLocal = (cell) => {
    if (cell == null || cell < 0) return;
    S.localPin = cell | 0;
    if (S.localGlobe === 'wash' || S.localGlobe === 'both') refreshColours(1);
    const hint = document.getElementById('localhint');
    if (hint) hint.textContent = `Pinned cell ${S.localPin} · drag map · arrows · Ctrl+click globe · Auto to release`;
  };
  const clearLocalPin = () => {
    S.localPin = -1;
    if (S.localGlobe === 'wash' || S.localGlobe === 'both') refreshColours(1);
    const hint = document.getElementById('localhint');
    if (hint) hint.textContent = 'Auto-tracking · drag map or Ctrl+click globe to pin';
  };
  const nudgeLocal = (dx, dy) => {
    const base = S.localPin >= 0 ? S.localPin : S._localFocus;
    if (base < 0) return;
    pinLocal(stepFocus(base, dx, dy));
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
    mk('Auto', clearLocalPin, 'Release pin — track densest life/builds');
    mk('→', () => nudgeLocal(1, 0));
    mk('↙', () => nudgeLocal(-1, 1));
    mk('↓', () => nudgeLocal(0, 1));
    mk('↘', () => nudgeLocal(1, 1));
  }

  // Drag / click the flat map to move the window across the globe
  let localDrag = null;
  let localAccX = 0, localAccY = 0;
  localCvs.style.cursor = 'grab';
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
    if (!localDrag) return;
    const dx = e.clientX - localDrag.x;
    const dy = e.clientY - localDrag.y;
    if (!localDrag.moved && Math.hypot(dx, dy) < 5) return;
    localDrag.moved = true;
    const cellPx = S._localPatch?.layout?.cellPx || 12;
    localAccX += dx;
    localAccY += dy;
    localDrag.x = e.clientX;
    localDrag.y = e.clientY;
    const stepsX = Math.trunc(localAccX / cellPx);
    const stepsY = Math.trunc(localAccY / cellPx);
    if (!stepsX && !stepsY) return;
    localAccX -= stepsX * cellPx;
    localAccY -= stepsY * cellPx;
    // Drag map content with the pointer (grab-and-slide)
    const next = stepFocus(S.localPin >= 0 ? S.localPin : localDrag.startPin, -stepsX, -stepsY);
    pinLocal(next);
  });
  const endLocalDrag = (e) => {
    if (!localDrag) return;
    localCvs.style.cursor = 'grab';
    if (!localDrag.moved) {
      const rect = localCvs.getBoundingClientRect();
      const sx = localCvs.width / rect.width;
      const sy = localCvs.height / rect.height;
      const px = (e.clientX - rect.left) * sx;
      const py = (e.clientY - rect.top) * sy;
      const c = cellAtLocalPixel(S._localPatch, S._localPatch?.layout, px, py);
      if (c >= 0) pinLocal(c);
    }
    localDrag = null;
  };
  localCvs.addEventListener('pointerup', endLocalDrag);
  localCvs.addEventListener('pointercancel', () => { localDrag = null; localCvs.style.cursor = 'grab'; });

  canvas.addEventListener('pointerdown', (e) => {
    audioInit();
    // Ctrl/Cmd+click plants the local window on the globe (any tool)
    if (e.ctrlKey || e.metaKey) {
      const cell = desktopPick(e.clientX, e.clientY);
      if (cell != null && cell >= 0) {
        pinLocal(cell);
        e.preventDefault();
        return;
      }
    }
    if (e.button === 2 || e.altKey || activeTool !== 'inspect' && !e.shiftKey) {
      const cell = desktopPick(e.clientX, e.clientY);
      if (activeTool === 'meteor') {
        onToolResult(useToolAt(cell, { power: 0.6 + Math.random() * 0.6 }));
      } else if (e.altKey) {
        fingerOfGod(cell, e.shiftKey ? 'delete' : 'boost');
        playEvent('seed', 0.5);
      } else {
        onToolResult(useToolAt(cell));
      }
      return;
    }
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - lastX) / 220, dy = (e.clientY - lastY) / 220;
    lastX = e.clientX; lastY = e.clientY;
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
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
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
    else if (e.key === 'r' || e.key === 'R') runGenerate((Math.random() * 1e9) | 0, W.rule);
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === '+' || e.key === '=') { setTool('solar'); useToolAt(0, { delta: 0.05 }); updateHUD(); }
    else if (e.key === '-' || e.key === '_') { setTool('solar'); useToolAt(0, { delta: -0.05 }); updateHUD(); }
    else {
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t) {
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

    const gp = src.gamepad;
    const trig = gp ? (gp.buttons[0]?.pressed || gp.buttons[1]?.pressed) : false;
    h.grab = !!trig;

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
