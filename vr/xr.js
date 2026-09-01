/** WebXR session, controllers, and frame rendering — extracted from main.js (R54). */

import { clamp, qFromTo, qmul, qnorm } from './math.js';
import { expected } from './sim/report.js';
import { readHandSkeleton, gestureFromSkeleton, applyHandGesture } from './sim/handIk.js';
import { pickTableSlot } from './sim/orreryTable.js';
import { dispatchIntent } from './input.js';
import { XR_SCALE_MIN, XR_SCALE_MAX } from './sim/eoref.js';
import { pickCell } from './tools.js';

export let xrSession = null;
export let xrRefSpace = null;
export let camWorld = null;

/**
 * @typedef {object} XRApi
 * @property {WebGL2RenderingContext} gl
 * @property {object} W
 * @property {object} S
 * @property {object[]} hands
 * @property {Float32Array} tmpQ
 * @property {object} TABLE
 * @property {string} activeTool
 * @property {(t: number) => void} update
 * @property {(proj: any, view: any, eye: number[], xr: boolean, S: object, hands: object[]) => void} drawScene
 * @property {(msg: string) => void} showErr
 * @property {() => void} audioInit
 * @property {() => void} installDarkAudioBus
 * @property {(t: DOMHighResTimeStamp) => void} desktopFrame
 * @property {(i: number) => void} setRuleset
 * @property {(slot: object) => void} loadTableSlot
 * @property {object[]} RULESETS
 * @property {boolean} grabbing  — written by readControllers
 */

let _api = null;

export function initXR(api) {
  _api = api;
}

export function setupXR() {
  const { gl, showErr, audioInit, installDarkAudioBus, desktopFrame } = _api;
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
      installDarkAudioBus();
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
  const { S, W, hands, tmpQ, TABLE, loadTableSlot, setRuleset, RULESETS } = _api;
  const activeTool = _api.activeTool;
  hands[0].active = hands[1].active = false;
  let i = 0;
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

    if (h.grab && !wasGrab && gp?.hapticActuators?.length) {
      try {
        gp.hapticActuators[0].pulse?.(0.55, 36);
      } catch { expected('ORR-EXPECTED-XR', 'haptic optional'); }
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
      if (h.prev && activeTool === 'meteor') {
        const speed = Math.hypot(h.vel[0], h.vel[1], h.vel[2]);
        if (speed > 0.02) {
          const cell = pickCell(h.pos, h.vel, S.posXR, S.scaleXR, S.q);
          dispatchIntent('act', { cell, opts: { power: clamp(speed * 20, 0.4, 2) } }, 'xr');
        }
      }
      h.prev = null;
    }

    if (gp && gp.axes.length >= 4) {
      const ay = gp.axes[3];
      if (Math.abs(ay) > 0.18) {
        S.scaleXR = clamp(S.scaleXR - ay * 0.006, XR_SCALE_MIN, XR_SCALE_MAX);
        dispatchIntent('zoom', { factor: 1 - ay * 0.006 / Math.max(0.01, S.scaleXR), dir: Math.sign(ay) }, 'xr');
      }
    }
    if (gp && gp.buttons[1]?.pressed && !readControllers._grip) {
      readControllers._grip = true;
      const ray = src.targetRaySpace ? frame.getPose(src.targetRaySpace, xrRefSpace) : null;
      if (ray) {
        const tm = ray.transform.matrix;
        const origin = [tm[12], tm[13], tm[14]];
        const dir = [-tm[8], -tm[9], -tm[10]];
        const cell = pickCell(origin, dir, S.posXR, S.scaleXR, S.q);
        dispatchIntent('act', { cell }, 'xr');
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

  _api.grabbing = hands[0].grab || hands[1].grab;
}

function xrFrame(t, frame) {
  const { gl, W, S, hands, update, drawScene } = _api;
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
