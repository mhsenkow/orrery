/** Precomputed atmospheric scattering helpers (Bruneton-inspired, toy fidelity).
 *  Transmittance + multiple-scatter LUTs for the planet / atmo shaders. */

/** Rayleigh scattering coefficients (RGB), Earth-like. measured-ish */
export const RAYLEIGH = [5.8e-6, 13.5e-6, 33.1e-6];
/** Mie forward-scatter preference. fitted */
export const MIE_G = 0.76;
export const MIE_SCALE = 2.1e-5;

/**
 * Build a small transmittance LUT: rows = view zenith (0..1), cols = sun zenith.
 * Values are RGB transmittance through a exponential atmosphere.
 */
export function buildTransmittanceLUT(opts = {}) {
  const W = opts.size || 32;
  const H = opts.size || 32;
  const scaleH = opts.scaleHeight || 8500;
  const atmoH = opts.atmoHeight || 60000;
  const ozone = opts.ozone || 0.3;
  const aerosol = opts.aerosol || 0;
  const data = new Float32Array(W * H * 3);

  for (let j = 0; j < H; j++) {
    const muS = j / (H - 1);
    for (let i = 0; i < W; i++) {
      const muV = i / (W - 1);
      const pathV = 1 / Math.max(0.05, muV * 0.85 + 0.15);
      const pathS = 1 / Math.max(0.05, muS * 0.85 + 0.15);
      const path = (pathV + pathS) * 0.5 * (atmoH / scaleH) * 0.02;
      const o = (j * W + i) * 3;
      for (let c = 0; c < 3; c++) {
        const ray = RAYLEIGH[c] * 1e5 * path;
        const mie = MIE_SCALE * 1e5 * path * (1 + aerosol * 3);
        const oz = ozone * path * (c === 0 ? 0.15 : c === 1 ? 0.55 : 0.35);
        data[o + c] = Math.exp(-(ray + mie + oz));
      }
    }
  }
  return { data, width: W, height: H };
}

/** Sample LUT (bilinear). */
export function sampleTransmittance(lut, muV, muS) {
  const { data, width: W, height: H } = lut;
  const x = Math.max(0, Math.min(W - 1.001, muV * (W - 1)));
  const y = Math.max(0, Math.min(H - 1.001, muS * (H - 1)));
  const x0 = x | 0, y0 = y | 0;
  const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const s = (i, j) => {
    const o = (j * W + i) * 3;
    return [data[o], data[o + 1], data[o + 2]];
  };
  const a = s(x0, y0), b = s(x1, y0), c = s(x0, y1), d = s(x1, y1);
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const top = a[k] * (1 - fx) + b[k] * fx;
    const bot = c[k] * (1 - fx) + d[k] * fx;
    out[k] = top * (1 - fy) + bot * fy;
  }
  return out;
}

/** Sky colour from host Teff + atmosphere (replaces hand sky RGB). */
export function skyFromStarAtmosphere(teff, gases = {}, atmoK = 1) {
  const t = Math.max(2000, Math.min(12000, teff || 5772));
  const x = (t - 2000) / 10000;
  let r = 1.0, g = 0.45 + x * 0.45, b = 0.15 + x * 0.75;
  if (t < 4000) { r = 1; g = 0.35 + x * 2; b = 0.08; }
  const thick = Math.min(1.5, atmoK);
  const ray = [
    Math.exp(-5.8 * thick * 0.15),
    Math.exp(-13.5 * thick * 0.12),
    Math.exp(-33.1 * thick * 0.08),
  ];
  const o2 = gases.O2 || 0;
  const ozone = Math.min(1, o2 * 4) * 0.3;
  g *= 1 - ozone * 0.25;
  r *= 1 - ozone * 0.1;
  return [
    Math.min(1, r * ray[0] * 0.35 + (1 - thick) * 0.02),
    Math.min(1, g * ray[1] * 0.4 + (1 - thick) * 0.03),
    Math.min(1, b * ray[2] * 0.55 + (1 - thick) * 0.05),
  ];
}

/** Upload LUT as RGB8 texture. */
export function uploadScatterLUT(gl, lut) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const rgba = new Uint8Array(lut.width * lut.height * 4);
  for (let i = 0, j = 0; i < lut.data.length; i += 3, j += 4) {
    rgba[j] = Math.min(255, lut.data[i] * 255);
    rgba[j + 1] = Math.min(255, lut.data[i + 1] * 255);
    rgba[j + 2] = Math.min(255, lut.data[i + 2] * 255);
    rgba[j + 3] = 255;
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lut.width, lut.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Replace existing LUT texture contents (reuse handle). */
export function updateScatterLUT(gl, tex, lut) {
  if (!tex || !lut) return tex;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const rgba = new Uint8Array(lut.width * lut.height * 4);
  for (let i = 0, j = 0; i < lut.data.length; i += 3, j += 4) {
    rgba[j] = Math.min(255, lut.data[i] * 255);
    rgba[j + 1] = Math.min(255, lut.data[i + 1] * 255);
    rgba[j + 2] = Math.min(255, lut.data[i + 2] * 255);
    rgba[j + 3] = 255;
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lut.width, lut.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  return tex;
}

/**
 * Multiple-scattering LUT (Bruneton-inspired).
 * Integrates a few isotropic bounce samples weighted by transmittance remaining.
 */
export function buildMultipleScatterLUT(opts = {}) {
  const W = opts.size || 32;
  const H = opts.size || 32;
  const T = buildTransmittanceLUT(opts);
  const groundAlbedo = opts.albedo || [0.22, 0.22, 0.22];
  const data = new Float32Array(W * H * 3);

  // Sample directions for a cheap isotropic integral
  const samples = [
    [0.0, 0.5], [0.25, 0.7], [0.5, 0.9], [0.75, 0.7],
    [0.15, 0.35], [0.4, 0.45], [0.65, 0.4], [0.85, 0.55],
  ];

  for (let j = 0; j < H; j++) {
    const muS = j / (H - 1);
    for (let i = 0; i < W; i++) {
      const muV = i / (W - 1);
      const TrView = sampleTransmittance(T, muV, muS);
      const o = (j * W + i) * 3;
      const L = [0, 0, 0];
      for (const [smV, smS] of samples) {
        const Tr = sampleTransmittance(T, smV, smS);
        // First-order inscatter ∝ (1−T) · phase · sun
        const phase = 0.28 + 0.72 * smS; // brighter toward sun zenith
        for (let c = 0; c < 3; c++) {
          const single = (1 - Tr[c]) * phase * (c === 2 ? 0.62 : c === 1 ? 0.42 : 0.3);
          // Second bounce: single * ground bounce * remaining path
          const second = single * groundAlbedo[c] * (1 - TrView[c]) * 0.45;
          L[c] += single + second;
        }
      }
      const inv = 1 / samples.length;
      for (let c = 0; c < 3; c++) {
        // Horizon boost — multiple scatter fills twilight
        const twilight = (1 - muS) * (1 - muV) * 0.12 * (c === 2 ? 1.2 : 0.8);
        data[o + c] = Math.min(1, L[c] * inv * 1.35 + twilight);
      }
    }
  }
  return { data, width: W, height: H, kind: 'ms' };
}

/** Combined transmittance + multi-scatter pack. */
export function buildScatterPack(opts = {}) {
  const transmittance = buildTransmittanceLUT(opts);
  const multiple = buildMultipleScatterLUT(opts);
  return { transmittance, multiple };
}
