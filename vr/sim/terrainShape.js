/** Post-process hypsometry — fractal coastlines and softer continental shapes.
 *  Applied after plate isostasy so Voronoi cells read as natural landmasses. */

import { clamp, fbm, ridged } from '../math.js';
import { NC, NBR, DIR } from '../sphere.js';

/**
 * Multi-scale noise + coastal smoothing. Provenance: fitted — fractal shoreline
 * mask peaks at sea level (classic fBm coastline perturbation).
 */
export function naturalizeHypsometry(W, seed, opts = {}) {
  const { h } = W;
  const sl = opts.seaLevel ?? W.seaLevel ?? 0;
  const coastAmp = opts.coastAmp ?? 0.14;
  const macroAmp = opts.macroAmp ?? 0.1;
  const tmp = new Float32Array(NC);

  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    // Domain warp breaks up rigid Voronoi facets
    const wx = fbm(x * 1.4, y * 1.4, z * 1.4, seed ^ 0x7a7a70, 3, 2, 0.5);
    const wy = fbm(x * 1.4 + 5.2, y * 1.4 + 1.7, z * 1.4 + 2.9, seed ^ 0x7a7a71, 3, 2, 0.5);
    const wz = fbm(x * 1.4 + 1.1, y * 1.4 + 8.3, z * 1.4 + 4.4, seed ^ 0x7a7a72, 3, 2, 0.5);
    let px = x + (wx - 0.5) * 0.32;
    let py = y + (wy - 0.5) * 0.32;
    let pz = z + (wz - 0.5) * 0.32;
    const pl = Math.hypot(px, py, pz) || 1;
    px /= pl; py /= pl; pz /= pl;

    const coast = fbm(px * 5, py * 5, pz * 5, seed ^ 0xc04a57, 5, 2.08, 0.52);
    const macro = fbm(px * 1.05, py * 1.05, pz * 1.05, seed ^ 0x4d414352, 4, 2, 0.48);
    const detail = fbm(px * 9, py * 9, pz * 9, seed ^ 0x0645711, 3, 2.15, 0.55);
    const ridge = ridged(px * 2.4, py * 2.4, pz * 2.4, seed ^ 0x0d9301, 3);

    let elev = h[c];
    const dist = Math.abs(elev - sl);
    const coastW = Math.exp(-(dist * dist) / 0.007); // strong near shoreline
    const isLand = elev > sl;

    elev += (coast - 0.5) * coastAmp * (0.2 + coastW * 0.8);
    elev += (detail - 0.5) * 0.035 * (0.15 + coastW * 0.85);
    if (isLand) {
      elev += (macro - 0.48) * macroAmp;
      if (elev > sl + 0.08) elev += (ridge - 0.5) * 0.07 * Math.min(1, (elev - sl) * 2.5);
    }
    h[c] = clamp(elev, -1.2, 1.2);
  }

  // Laplacian blend near coast — bays, capes, smoother shelves
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 0; c < NC; c++) {
      const dist = Math.abs(h[c] - sl);
      if (dist > 0.2) { tmp[c] = h[c]; continue; }
      let sum = h[c], n = 1;
      for (let k = 0; k < 4; k++) { sum += h[NBR[c * 4 + k]]; n++; }
      const smooth = sum / n;
      const t = clamp(1 - dist / 0.2, 0, 1);
      tmp[c] = h[c] * (1 - t * 0.55) + smooth * (t * 0.55);
    }
    h.set(tmp);
  }
}

/** Widen continental crust thickness with soft plate edges (less polygonal uplift). */
export function softenPlateCrust(W, seed, plates) {
  const { crust } = W;
  if (!plates?.length) return;
  const tmp = new Float32Array(NC);
  for (let c = 0; c < NC; c++) {
    const x = DIR[c * 3], y = DIR[c * 3 + 1], z = DIR[c * 3 + 2];
    let best = -2, second = -2, bId = 0, sId = 0;
    for (let p = 0; p < plates.length; p++) {
      const d = x * plates[p].centre[0] + y * plates[p].centre[1] + z * plates[p].centre[2];
      if (d > best) { second = best; sId = bId; best = d; bId = p; }
      else if (d > second) { second = d; sId = p; }
    }
    const gap = Math.max(0.001, best - second);
    const blend = clamp(1 - gap / 0.08, 0, 1);
    const thickB = plates[bId].baseThick * (0.85 + 0.3 * fbm(x * 2.1, y * 2.1, z * 2.1, seed + bId * 17, 3, 2, 0.5));
    const thickS = plates[sId].baseThick * (0.85 + 0.3 * fbm(x * 2.1, y * 2.1, z * 2.1, seed + sId * 17, 3, 2, 0.5));
    tmp[c] = thickB * blend + thickS * (1 - blend);
  }
  crust.set(tmp);
}
