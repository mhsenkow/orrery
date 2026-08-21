/** Rotating shallow water on the cube-sphere. One layer, east–north.
 *  Height + two velocities. No elliptic solve. Currents `progatm`. */

import { NC, DIR, NBR, NBR_E, NBR_N, NBR_RA, NBR_RB, NBR_IWE, NBR_IWN } from '../sphere.js';
import { clamp } from '../math.js';

let _du = null, _dv = null, _dh = null;

function scratch(n) {
  if (!_du || _du.length !== n) {
    _du = new Float32Array(n);
    _dv = new Float32Array(n);
    _dh = new Float32Array(n);
  }
}

/* Derivatives in the tangent frame, per planet radius.
 *
 * All four operators below used to weight neighbour differences by cell *area*
 * and divide by the summed area. That returns ∂η/∂x × chord² — a derivative
 * multiplied by the square of the grid spacing — which had two consequences,
 * both quiet and both serious. The pressure-gradient force was some three
 * thousand times weaker than `g` implied at N=64, so the winds this solver
 * produced peaked near 0.08 where every consumer in the sim expects tenths:
 * storms never found shear, atmospheric rivers needed 0.32, fog needed a lull
 * below 0.28 and so was permanently on, Ares never lofted dust, and the
 * convergence field — which is what makes rain — maxed out at 0.0007. And
 * because chord ≡ 1/N, the whole circulation weakened as detail went up:
 * doubling resolution quartered the wind.
 *
 * A least-squares plane through the four neighbours costs the same arithmetic
 * and is a derivative. For a symmetric stencil the cross terms cancel, so
 * ∂/∂e = Σ(Δφ·e)/Σe² and ∂/∂n = Σ(Δφ·n)/Σn², exact for a linear field. The
 * numbers mean something now — a gradient of 0.3 is 0.3 per radius at any
 * resolution — which is why the tuning constants in `wind.js` and `ocean.js`
 * moved with this change. */

/** ∇η in the tangent frame. Land neighbours are skipped, not counted as flat. */
function gradEta(eta, c, mask) {
  let de = 0, dn = 0;
  const i0 = c * 4;
  for (let k = 0; k < 4; k++) {
    const nb = NBR[i0 + k];
    if (mask && !mask[nb]) continue;
    const d = eta[nb] - eta[c];
    de += d * NBR_E[i0 + k];
    dn += d * NBR_N[i0 + k];
  }
  return [de * NBR_IWE[c], dn * NBR_IWN[c]];
}

/** Flux-form divergence in the tangent frame. Land neighbours contribute zero flow. */
export function divEN(u, v, c, mask) {
  let se = 0, sn = 0;
  const i0 = c * 4;
  const uc = u[c], vc = v[c];
  for (let k = 0; k < 4; k++) {
    const i = i0 + k;
    const nb = NBR[i];
    const land = !!(mask && !mask[nb]);
    const ra = NBR_RA[i], rb = NBR_RB[i];
    const un = land ? 0 : ra * u[nb] + rb * v[nb];
    const vn = land ? 0 : ra * v[nb] - rb * u[nb];
    const e = NBR_E[i], n = NBR_N[i];
    se += (uc + un) * e;
    sn += (vc + vn) * n;
  }
  /* Face-centred velocity through each chord, over the cell it encloses. The
     halves in the numerator cancel against the halves in the weights. */
  return se * NBR_IWE[c] + sn * NBR_IWN[c];
}

/** Relative vorticity ζ = ∂v/∂e − ∂u/∂n. */
export function curlEN(u, v, c, mask) {
  let sv = 0, su = 0;
  const i0 = c * 4;
  for (let k = 0; k < 4; k++) {
    const i = i0 + k;
    const nb = NBR[i];
    if (mask && !mask[nb]) continue;
    const e = NBR_E[i], n = NBR_N[i];
    const ra = NBR_RA[i], rb = NBR_RB[i];
    sv += (ra * v[nb] - rb * u[nb] - v[c]) * e;
    su += (ra * u[nb] + rb * v[nb] - u[c]) * n;
  }
  return sv * NBR_IWE[c] - su * NBR_IWN[c];
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
 *
 * Now that the operators are real derivatives the scheme has a real CFL, and it
 * is the gravity wave that sets it: sqrt(gH)·dt must stay inside a cell. Rather
 * than leave that as a comment for the next person to violate, the step counts
 * its own substeps from the numbers it was handed, so the same call is stable at
 * N=32 and at N=128. Keep H small and it substeps once, which is the intent:
 * this layer's mass field is a slaved pressure pattern, not a tsunami.
 */
export function stepShallowWater({
  eta, u, v,
  fScale = 1,
  g = 2.1,
  H = 0.38,
  dt = 0.2,
  drag,
  dragQ = 0,
  forceE,
  forceN,
  etaEq,
  relax = 0.22,
  mask,
  umax = 1.6,
  damp = 0.12,
  advect = 0.5,
  visc = 0.05,
  etaVisc = 0.05,
  etamin = 0,
  etamax = 1.45,
}) {
  const n = eta.length;
  scratch(n);
  const du = _du, dv = _dv, dh = _dh;
  const doAdv = !!advect;

  // Mean cell width in radians — the length the CFL condition is measured in.
  const arc = Math.sqrt((4 * Math.PI) / n);
  const wave = Math.sqrt(Math.max(1e-9, g * H));
  /* Capped, because a caller who hands this a wave speed that needs fifty
     substeps has a modelling problem rather than a stability problem — but the
     cap has to be high enough to actually cover the callers we have, including
     the deliberately violent single-cell bump the tests fire at it. */
  const nSub = Math.min(12, Math.max(1, Math.ceil((dt * wave) / (0.4 * arc))));
  const dts = dt / nSub;

  for (let sub = 0; sub < nSub; sub++) {
    for (let c = 0; c < n; c++) {
      if (mask && !mask[c]) {
        du[c] = 0; dv[c] = 0; dh[c] = 0;
        continue;
      }
      const lat = DIR[c * 3 + 1];
      const f = lat * fScale;
      const i0 = c * 4;
      const uc = u[c], vc = v[c], hc = eta[c];
      let dpe = 0, dpn = 0, due = 0, dun = 0, dve = 0, dvn = 0;
      let fluxE = 0, fluxN = 0;
      let sumU = 0, sumV = 0, sumH = 0, cnt = 0;
      for (let k = 0; k < 4; k++) {
        const i = i0 + k;
        const nb = NBR[i];
        const e = NBR_E[i], nn = NBR_N[i];
        const landNb = !!(mask && !mask[nb]);
        const ra = NBR_RA[i], rb = NBR_RB[i];
        const un = landNb ? 0 : ra * u[nb] + rb * v[nb];
        const vn = landNb ? 0 : ra * v[nb] - rb * u[nb];
        if (!landNb) {
          const dhv = eta[nb] - hc;
          dpe += dhv * e;
          dpn += dhv * nn;
          if (doAdv) {
            due += (un - uc) * e;
            dun += (un - uc) * nn;
            dve += (vn - vc) * e;
            dvn += (vn - vc) * nn;
          }
        }
        fluxE += (uc + un) * e;
        fluxN += (vc + vn) * nn;
        if (!landNb) { sumU += un; sumV += vn; sumH += eta[nb]; cnt++; }
      }
      const ie = NBR_IWE[c];
      const inn = NBR_IWN[c];
      dpe *= ie; dpn *= inn;
      due *= ie; dun *= inn;
      dve *= ie; dvn *= inn;
      const div = fluxE * ie + fluxN * inn;
      /* Linear drag plus a quadratic part, because surface stress really is
         quadratic in the wind — τ = C_D|u|u — and because a linear-only drag has
         no answer at the equator. There `f` vanishes, so drag is the only term
         left to balance the pressure gradient, and a fixed coefficient let
         equatorial cells run away to the clamp and sit there. Quadratic drag
         limits itself: doubling the forcing raises the wind by √2, not 2. */
      const spd = Math.sqrt(uc * uc + vc * vc);
      const r = (drag ? drag[c] : 0.1) + dragQ * spd;
      const Fe = forceE ? forceE[c] : 0;
      const Fn = forceN ? forceN[c] : 0;
      /* The inertial term, Courant-limited.
       *
       * `(u·∇)u` is a real gradient now, so it grows as 1/Δx, and it is the one
       * term in this step with no CFL guard of its own — the gravity wave gets
       * substeps, the drag is dissipative, but this is a nonlinearity multiplied
       * straight by dt. At N=64 it ran at a Courant number near one and behaved;
       * at N=96 it ran at four or five and a third of the planet ended up pinned
       * at maximum wind. Scaling it back where a parcel would cross more than
       * half a cell in one step keeps the eddies it exists to make and drops the
       * part that is only ever numerical. */
      let advK = advect;
      if (doAdv) {
        const cour = (spd * dts) / arc;
        if (cour > 0.5) advK = advect * (0.5 / cour);
      }
      const ae = doAdv ? -(uc * due + vc * dun) * advK : 0;
      const an = doAdv ? -(uc * dve + vc * dvn) * advK : 0;
      du[c] = (f * vc - g * dpe - r * uc - damp * div + Fe + ae) * dts;
      dv[c] = (-f * uc - g * dpn - r * vc - damp * div + Fn + an) * dts;
      /* Viscosity, as a blend toward the neighbour mean rather than as ν∇²u.
         Same effect on the grid-scale checkerboard — which an explicit rotating
         SWE will grow given nothing to dissipate it, and did: half the planet
         sat pinned at ±umax with the zonal mean averaging out to nothing — but
         unconditionally stable for any blend below one, so it cannot itself
         become the reason the step needs substepping. */
      if (visc && cnt) {
        du[c] += (sumU / cnt - uc) * visc;
        dv[c] += (sumV / cnt - vc) * visc;
      }
      let source = -H * div;
      if (etaEq) source -= (hc - etaEq[c]) * relax;
      dh[c] = source * dts;
      /* And the same for the height field, for a sharper reason. A centred
         gradient paired with a centred divergence on a co-located grid has a
         checkerboard in its null space: the pressure force sees it, the
         divergence does not, and it grows without bound. Left alone it took the
         height field to both clamps with a full unit of pressure between
         adjacent cells — a gradient of forty per radius — which pinned a fifth
         of the planet at maximum wind before the first tick had finished. */
      if (etaVisc && cnt) dh[c] += (sumH / cnt - hc) * etaVisc;
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
}

/**
 * Diagnostic wind of a height field: geostrophy where rotation dominates,
 * cross-isobar inflow where friction does.
 *
 * Solving `f×u + r·u = −g∇η` outright rather than fudging the equatorial
 * singularity with `0.35 + |f|` means the answer is the real balance at every
 * latitude: along the isobars in midlatitudes, and spiralling into the low near
 * the equator, which is what fills the ITCZ. Used to boot the solver and as the
 * target the ocean's Ekman drift is measured against.
 */
export function geostrophyOf(eta, c, fScale, r = 0.35, g = 1) {
  const lat = DIR[c * 3 + 1];
  const f = lat * fScale;
  const [dpe, dpn] = gradEta(eta, c, null);
  const Fe = -g * dpe, Fn = -g * dpn;
  const inv = 1 / (f * f + r * r);
  return [(r * Fe + f * Fn) * inv, (r * Fn - f * Fe) * inv];
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
