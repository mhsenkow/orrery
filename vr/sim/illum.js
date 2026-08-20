/** Surface colour is reflectance × illuminant.
 *
 *  Materials are authored under the Sun. A 2,560 K dwarf makes the same
 *  basalt a different colour, and sensory.js already integrates Planck
 *  spectra for eyes — this is that integral, for the ground.
 *
 *  White balance is a camera calibrated to 5772 K. Chromaticity moves with
 *  star temperature; luminance is preserved so exposure stays in charge.
 *  Adapting the eye to the local star would be a different picture. */

import { blackbodyRgb } from './exophysics.js';

export const SUN_TEFF = 5772;
export const WHITE_BALANCE = 'sun-camera';

const _gain = new Map();

export function starTeffOf(rule) {
  const t = rule?.starTeff || rule?.star?.teff;
  return t > 0 ? t : SUN_TEFF;
}

/** Per-channel gain relative to the Sun, luminance-normalised. Identity at 5772 K. */
export function illuminantGain(teffK = SUN_TEFF) {
  const T = Math.max(1000, Math.min(15000, teffK || SUN_TEFF));
  const key = T | 0;
  const hit = _gain.get(key);
  if (hit) return hit;
  const sun = blackbodyRgb(SUN_TEFF);
  const star = blackbodyRgb(T);
  let g = [
    star[0] / Math.max(1e-9, sun[0]),
    star[1] / Math.max(1e-9, sun[1]),
    star[2] / Math.max(1e-9, sun[2]),
  ];
  const lum = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
  if (lum > 1e-6) {
    g = [g[0] / lum, g[1] / lum, g[2] / lum];
  }
  if (_gain.size > 256) _gain.clear();
  _gain.set(key, g);
  return g;
}

export function illuminateRgb(rgb, teffK = SUN_TEFF) {
  if (!rgb) return [0, 0, 0];
  const g = illuminantGain(teffK);
  return [rgb[0] * g[0], rgb[1] * g[1], rgb[2] * g[2]];
}

export function isSunTeff(teffK) {
  return ((teffK || SUN_TEFF) | 0) === SUN_TEFF;
}

/** Band reflectance (0–1 at stated nm) → sRGB appearance under a star. */
export function rgbFromSpectrum(spec, teffK = SUN_TEFF) {
  if (!spec?.nm || !spec?.R) return [0, 0, 0];
  const rgb = [0, 0, 0];
  for (let i = 0; i < spec.nm.length; i++) {
    const nm = spec.nm[i];
    const R = spec.R[i] ?? 0;
    if (nm < 500) rgb[2] = R * 255;
    else if (nm < 600) rgb[1] = R * 255;
    else rgb[0] = R * 255;
  }
  return illuminateRgb(rgb, teffK);
}
