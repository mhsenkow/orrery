/** Rotating shallow water on the cube-sphere. One layer, east–north.
 *  Height + two velocities. No elliptic solve. Currents `progatm`. */

import { NC, DIR, NBR, NBR_E, NBR_N, AREA } from '../sphere.js';
import { clamp } from '../math.js';

let _du = null, _dv = null, _dh = null;

function scratch(n) {
  if (!_du || _du.length !== n) {
    _du = new Float32Array(n);
    _dv = new Float32Array(n);
    _dh = new Float32Array(n);
  }
}

function gradEta(eta, c, mask) {
  let de = 0, dn = 0, w = 0;
  const i0 = c * 4;
  for (let k = 0; k < 4; k++) {
    const nb = NBR[i0 + k];
    if (mask && !mask[nb]) continue;
    const a = AREA[nb] || 1;
    const d = eta[nb] - eta[c];
    const e = NBR_E[i0 + k], n = NBR_N[i0 + k];
    de += d * e * a;
    dn += d * n * a;
    w += a;
  }
  const s = w > 0 ? 1 / w : 0;
  return [de * s, dn * s];
}

/** Flux-form divergence in the tangent frame. Land neighbours contribute zero flow. */
export function divEN(u, v, c, mask) {
  let s = 0, w = 0;
  const i0 = c * 4;
  for (let k = 0; k < 4; k++) {
    const nb = NBR[i0 + k];
    const an = AREA[nb] || 1;
    const un = mask && !mask[nb] ? 0 : u[nb];
    const vn = mask && !mask[nb] ? 0 : v[nb];
    const e = NBR_E[i0 + k], n = NBR_N[i0 + k];
    s += (0.5 * (u[c] + un) * e + 0.5 * (v[c] + vn) * n) * an;
    w += an;
  }
  return w > 0 ? (s * 5.5) / w : 0;
}

/** Relative vorticity ζ = ∂v/∂e − ∂u/∂n. */
export function curlEN(u, v, c, mask) {
  let s = 0, w = 0;
  const i0 = c * 4;
  for (let k = 0; k < 4; k++) {
    const nb = NBR[i0 + k];
    if (mask && !mask[nb]) continue;
    const an = AREA[nb] || 1;
    const e = NBR_E[i0 + k], n = NBR_N[i0 + k];
    s += ((v[nb] - v[c]) * e - (u[nb] - u[c]) * n) * an;
    w += an;
  }
  return w > 0 ? s / w : 0;
}

function slipWalls(u, v, c, mask) {
  const i0 = c * 4;
  for (let k = 0; k < 4; k++) {
    const nb = NBR[i0 + k];
    if (mask[nb]) continue;
    let e = NBR_E[i0 + k], n = NBR_N[i0 + k];
    const len = Math.hypot(e, n) || 1;
    e /= len; n /= len;
    const into = u[c] * e + v[c] * n;
    if (into > 0) {
      u[c] -= into * e;
      v[c] -= into * n;
    }
  }
}

/**
 * One explicit SWE step.
 * `etaEq` (optional): radiative / steric target; height relaxes toward it.
 * `mask` (optional): 1 = fluid. Land is a free-slip wall.
 * `advect`: inertial (u·∇)u. 0 recovers linear shallow water.
 */
export function stepShallowWater({
  eta, u, v,
  fScale = 1,
  g = 2.1,
  H = 0.38,
  dt = 0.2,
  drag,
  forceE,
  forceN,
  etaEq,
  relax = 0.22,
  mask,
  umax = 1.6,
  damp = 0.12,
  advect = 0.5,
  etamin = 0,
  etamax = 1.45,
}) {
  const n = eta.length;
  scratch(n);
  const du = _du, dv = _dv, dh = _dh;
  const doAdv = !!advect;

  for (let c = 0; c < n; c++) {
    if (mask && !mask[c]) {
      du[c] = 0; dv[c] = 0; dh[c] = 0;
      continue;
    }
    const lat = DIR[c * 3 + 1];
    const f = lat * fScale;
    const i0 = c * 4;
    const uc = u[c], vc = v[c], hc = eta[c];
    let dpe = 0, dpn = 0, due = 0, dun = 0, dve = 0, dvn = 0, flux = 0, w = 0;
    for (let k = 0; k < 4; k++) {
      const nb = NBR[i0 + k];
      const a = AREA[nb] || 1;
      const e = NBR_E[i0 + k], nn = NBR_N[i0 + k];
      const landNb = !!(mask && !mask[nb]);
      const un = landNb ? 0 : u[nb];
      const vn = landNb ? 0 : v[nb];
      if (!landNb) {
        const dhv = eta[nb] - hc;
        dpe += dhv * e * a;
        dpn += dhv * nn * a;
        if (doAdv) {
          due += (u[nb] - uc) * e * a;
          dun += (u[nb] - uc) * nn * a;
          dve += (v[nb] - vc) * e * a;
          dvn += (v[nb] - vc) * nn * a;
        }
      }
      flux += (0.5 * (uc + un) * e + 0.5 * (vc + vn) * nn) * a;
      w += a;
    }
    const inv = w > 0 ? 1 / w : 0;
    dpe *= inv; dpn *= inv;
    due *= inv; dun *= inv;
    dve *= inv; dvn *= inv;
    const div = flux * 5.5 * inv;
    const r = drag ? drag[c] : 0.1;
    const Fe = forceE ? forceE[c] : 0;
    const Fn = forceN ? forceN[c] : 0;
    const ae = doAdv ? -(uc * due + vc * dun) * advect : 0;
    const an = doAdv ? -(uc * dve + vc * dvn) * advect : 0;
    du[c] = (f * vc - g * dpe - r * uc - damp * div + Fe + ae) * dt;
    dv[c] = (-f * uc - g * dpn - r * vc - damp * div + Fn + an) * dt;
    let source = -H * div;
    if (etaEq) source -= (hc - etaEq[c]) * relax;
    dh[c] = source * dt;
  }

  for (let c = 0; c < n; c++) {
    if (mask && !mask[c]) {
      u[c] = 0; v[c] = 0;
      continue;
    }
    u[c] = clamp(u[c] + du[c], -umax, umax);
    v[c] = clamp(v[c] + dv[c], -umax, umax);
    eta[c] = clamp(eta[c] + dh[c], etamin, etamax);
    if (mask) {
      const i0 = c * 4;
      if (!mask[NBR[i0]] || !mask[NBR[i0 + 1]] || !mask[NBR[i0 + 2]] || !mask[NBR[i0 + 3]]) {
        slipWalls(u, v, c, mask);
      }
    }
  }
}

/** Diagnostic geostrophy of a height field — used to boot the SWE. */
export function geostrophyOf(eta, c, fScale) {
  const lat = DIR[c * 3 + 1];
  const f = lat * fScale;
  const cor = 0.35 + Math.abs(f);
  const [dpe, dpn] = gradEta(eta, c, null);
  return [-dpn * cor, dpe * cor];
}

export function ensureMask(W, sea) {
  if (!W._fluidMask || W._fluidMask.length !== NC) W._fluidMask = new Uint8Array(NC);
  const m = W._fluidMask;
  const tick = W._tickIndex | 0;
  if (W._fluidMaskSea === sea && (tick - (W._fluidMaskTick | 0)) < 8 && tick >= (W._fluidMaskTick | 0)) {
    return m;
  }
  for (let c = 0; c < NC; c++) m[c] = W.h[c] < sea ? 1 : 0;
  W._fluidMaskSea = sea;
  W._fluidMaskTick = tick;
  return m;
}
