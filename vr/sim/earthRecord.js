/** Real-Earth comparison curves for overlay (sketch data).
 *  Next backlog instrument 166 / calibrate. */

/** Approximate modern-ish records as { tMa, v }[] — age Ma before present. */
export const EARTH_O2 = [
  { tMa: 4500, v: 0 }, { tMa: 2450, v: 0.001 }, { tMa: 2200, v: 0.02 },
  { tMa: 1800, v: 0.02 }, { tMa: 800, v: 0.05 }, { tMa: 540, v: 0.1 },
  { tMa: 300, v: 0.3 }, { tMa: 250, v: 0.15 }, { tMa: 66, v: 0.2 }, { tMa: 0, v: 0.21 },
];

export const EARTH_DIVERSITY = [
  { tMa: 540, v: 0.1 }, { tMa: 485, v: 0.35 }, { tMa: 445, v: 0.2 },
  { tMa: 375, v: 0.45 }, { tMa: 252, v: 0.08 }, { tMa: 201, v: 0.25 },
  { tMa: 66, v: 0.4 }, { tMa: 0, v: 1 },
];

export function sampleEarthCurve(curve, ageYr) {
  const tMa = Math.max(0, (4.567e9 - ageYr) / 1e6);
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1];
    if (tMa <= a.tMa && tMa >= b.tMa) {
      const u = (a.tMa - tMa) / (a.tMa - b.tMa + 1e-9);
      return a.v * (1 - u) + b.v * u;
    }
  }
  return curve[curve.length - 1].v;
}

export function earthOverlaySVG(playerCurve, earthCurve, opts = {}) {
  const w = opts.w || 220, h = opts.h || 56;
  const pts = playerCurve?.length ? playerCurve : [{ t: 0, v: 0 }];
  const maxT = Math.max(...pts.map((p) => p.t), 1);
  const path = (curve, color) => {
    if (!curve?.length) return '';
    const d = curve.map((p, i) => {
      const x = (p.t / maxT) * (w - 8) + 4;
      const y = h - 4 - clamp01(p.v) * (h - 10);
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
  };
  const earthPts = (earthCurve || []).map((p) => ({
    t: Math.max(0, 4.567e9 - p.tMa * 1e6),
    v: p.v,
  }));
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${path(earthPts, '#668')}
    ${path(pts, '#6fd6a4')}
    <text x="4" y="10" fill="#889" font-size="9">Earth</text>
    <text x="${w - 40}" y="10" fill="#6fd6a4" font-size="9">yours</text>
  </svg>`;
}

function clamp01(v) { return Math.max(0, Math.min(1, v || 0)); }
