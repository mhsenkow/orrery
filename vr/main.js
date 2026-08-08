/** ORRERY main — UI, input, XR, sim loop. */

import { clamp, qAxis, qmul, qnorm, qFromTo, m4, m4persp, m4lookAt, showErr } from './math.js';
import { NC, AREA } from './sphere.js';
import { W, generate, simTick, setSunDir, RULESETS, chronLog } from './world.js';
import { ENT, respawnEntities, agentsTick } from './agents.js';
import { initGL, gl, canvas, rebuildGeometry, refreshColours, uploadEntities, drawScene, vIdx } from './render.js';
import { TOOLS, setTool, activeTool, useToolAt, pickCell, fingerOfGod } from './tools.js';
import { exportChronicle, currentEraName, whatHappenedHere } from './chronicle.js';
import { audioInit, audioUpdate, playEvent } from './audio.js';
import { LIFE_CLASSES } from './sim/bio.js';

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
  [...document.getElementById('rules').children].forEach((b, k) =>
    b.setAttribute('aria-pressed', k === i ? 'true' : 'false'));
  runGenerate(W.seed, r);
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
  document.getElementById('stats').innerHTML =
    `<b>${R.name}</b> · seed ${W.seed}<br>` +
    `year <b>${W.year.toLocaleString()}</b> · <b>${currentEraName(W.chron)}</b><br>` +
    `state <b>${W.state}</b> · health <b>${(W.health * 100) | 0}%</b><br>` +
    `T <b>${W.meanTemp.toFixed(2)}</b> · sea <b>${W.seaLevel.toFixed(3)}</b><br>` +
    `land <b>${pc(land)}</b> · ice <b>${pc(W.iceFrac * NC)}</b> · life <b>${pc(W.meanLife * NC)}</b><br>` +
    `CO₂ <b>${(g.CO2 * 100).toFixed(1)}%</b> O₂ <b>${(g.O2 * 100).toFixed(1)}%</b> · O₃ <b>${(W.ozone * 100) | 0}</b><br>` +
    `life ≤ <b>${LIFE_CLASSES[W.unlockedClass]?.id || '?'}</b><br>` +
    `H₂O drift <b>${(W.waterDrift * 100).toFixed(2)}%</b>` +
    (W.budgetMode ? `<br>energy <b>${W.energy.toFixed(0)}</b>` : '') +
    `<br><b>${S.fps}</b> fps · ents ${ENT.n}`;

  document.getElementById('tier').innerHTML =
    `<span>Disclosure tier</span><br><b style="color:#dfe6f2">${S.tier}</b> — ` +
    (S.tier === 'Orbital' ? 'climate bands + Gaia orb' :
      S.tier === 'Regional' ? 'biomes, rivers, coasts' :
        S.tier === 'Local' ? 'populations resolving' : 'individuals');

  const insp = document.getElementById('inspect');
  if (S.inspect) {
    const x = S.inspect;
    insp.style.display = 'block';
    insp.innerHTML =
      `<b>Cell ${x.cell}</b><br>` +
      `elev ${x.h.toFixed(3)} · T ${x.temp.toFixed(2)} · moist ${x.moist.toFixed(2)}<br>` +
      `life ${x.life.toFixed(2)} (${LIFE_CLASSES[x.lifeClass]?.id || '—'}) · ice ${x.ice.toFixed(2)}<br>` +
      `plate ${x.plate} bound ${['div', 'conv', 'trans'][x.bound] || '—'} · age ${x.age.toFixed(0)} Myr<br>` +
      `flow ${x.flow.toFixed(2)} · clouds ${x.clouds.toFixed(2)} · ore ${x.ore.toFixed(2)}`;
    const hist = whatHappenedHere(W.chron, x.cell);
    if (hist.length) {
      insp.innerHTML += '<br><span style="color:#9fc0ff">Here:</span> ' +
        hist.slice(0, 4).map((e) => e.label).join(' · ');
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
      if (W.year % 4000 < 200) needGeom(); // occasional elev rebuild for erosion/sculpt
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
  S.detail = clamp(1 - (alt - 0.10) / 1.35, 0, 1);
  S.entFade = clamp(1 - (alt - 0.32) / 0.52, 0, 1);
  S.tier = alt > 1.1 ? 'Orbital' : alt > 0.45 ? 'Regional' : alt > 0.16 ? 'Local' : 'Surface';

  audioUpdate();

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
  if (res.cell != null && activeTool === 'inspect') S.inspect = res;
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

  const toolsEl = document.getElementById('tools');
  TOOLS.forEach((t) => {
    const b = document.createElement('button');
    b.textContent = t.name;
    b.title = `Key ${t.key.toUpperCase()} · cost ${t.cost}`;
    b.dataset.id = t.id;
    b.onclick = () => {
      setTool(t.id);
      [...toolsEl.children].forEach((x) => x.setAttribute('aria-pressed', x.dataset.id === t.id ? 'true' : 'false'));
    };
    if (t.id === 'inspect') b.setAttribute('aria-pressed', 'true');
    toolsEl.appendChild(b);
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

  canvas.addEventListener('pointerdown', (e) => {
    audioInit();
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
    if (e.key >= '1' && e.key <= '5') setRuleset(+e.key - 1);
    else if (e.key === 'r' || e.key === 'R') runGenerate((Math.random() * 1e9) | 0, W.rule);
    else if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === '+' || e.key === '=') { setTool('solar'); useToolAt(0, { delta: 0.05 }); updateHUD(); }
    else if (e.key === '-' || e.key === '_') { setTool('solar'); useToolAt(0, { delta: -0.05 }); updateHUD(); }
    else {
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t) {
        setTool(t.id);
        [...document.getElementById('tools').children].forEach((x) =>
          x.setAttribute('aria-pressed', x.dataset.id === t.id ? 'true' : 'false'));
      }
    }
  });

  setupXR();
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
