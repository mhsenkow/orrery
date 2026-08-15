/** Flat local patch view — unwraps a neighborhood of cells into a square map. */

import { NC, NBR } from './sphere.js';
import { W } from './world.js';
import { ENT } from './agents.js';
import { LIFE_CLASSES } from './sim/bio.js';

export const LOCAL_SIZES = [160, 220, 300, 380];
export const LOCAL_SNAPS = ['tl', 'tr', 'bl', 'br'];
export const LOCAL_GLOBE = ['off', 'rim', 'wash', 'both'];
export const LOCAL_RADII = [5, 8, 12];

/** Resolve focus: explicit pin → inspect → densest life/builds. */
export function pickFocusCell(inspect, pin = -1) {
  if (pin != null && pin >= 0) return pin | 0;
  if (inspect?.cell != null && inspect.cell >= 0) return inspect.cell | 0;
  let best = -1, score = -1;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) continue;
    const s = (W.build[c] || 0) * 3 + W.life[c];
    if (s > score) { score = s; best = c; }
  }
  return best >= 0 ? best : (NC / 2) | 0;
}

/** Step focus along unwrap axes (+x right, +y down on the flat map). */
export function stepFocus(focus, stepsX, stepsY) {
  let c = focus | 0;
  const sx = Math.sign(stepsX) | 0;
  const sy = Math.sign(stepsY) | 0;
  for (let i = 0; i < Math.abs(stepsX | 0); i++) c = neighborAt(c, sx, 0);
  for (let i = 0; i < Math.abs(stepsY | 0); i++) c = neighborAt(c, 0, sy);
  return c;
}

function neighborAt(focus, dx, dy) {
  if (!dx && !dy) return focus;
  const { pos } = unwrapPatch(focus, 2);
  for (const [cell, xy] of pos) {
    if (xy[0] === dx && xy[1] === dy) return cell;
  }
  // Fallback: pick any 4-neighbor (order may not match map axes)
  return NBR[focus * 4] ?? focus;
}

/** Hit-test a pixel inside the local canvas against the last drawn patch. */
export function cellAtLocalPixel(patch, layout, px, py) {
  if (!patch || !layout) return -1;
  const ix = Math.floor((px - layout.ox) / layout.cellPx);
  const iy = Math.floor((py - layout.oy) / layout.cellPx);
  if (ix < 0 || iy < 0 || ix >= patch.side || iy >= patch.side) return -1;
  return patch.cells[iy * patch.side + ix];
}

/**
 * BFS unwrap: assign integer (x,y) to cells around focus.
 * Returns { cells, side, focus, radius, cellSet }
 */
export function unwrapPatch(focus, radius = 8) {
  const key = (x, y) => x + ',' + y;
  const at = new Map();
  const pos = new Map();
  const q = [focus];
  at.set('0,0', focus);
  pos.set(focus, [0, 0]);

  while (q.length) {
    const c = q.shift();
    const [x, y] = pos.get(c);
    if (Math.abs(x) >= radius && Math.abs(y) >= radius) continue;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const used = new Set();
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (pos.has(n)) {
        const [nx, ny] = pos.get(n);
        used.add((nx - x) + ',' + (ny - y));
        continue;
      }
      for (const [dx, dy] of dirs) {
        const kk = dx + ',' + dy;
        if (used.has(kk)) continue;
        const nx = x + dx, ny = y + dy;
        if (Math.abs(nx) > radius || Math.abs(ny) > radius) continue;
        const pk = key(nx, ny);
        if (at.has(pk)) continue;
        at.set(pk, n);
        pos.set(n, [nx, ny]);
        used.add(kk);
        q.push(n);
        break;
      }
    }
  }

  const side = radius * 2 + 1;
  const cells = new Int32Array(side * side);
  cells.fill(-1);
  const cellSet = new Set();
  for (const [k, c] of at) {
    const [x, y] = k.split(',').map(Number);
    const ix = x + radius, iy = y + radius;
    if (ix >= 0 && iy >= 0 && ix < side && iy < side) {
      cells[iy * side + ix] = c;
      cellSet.add(c);
    }
  }
  return { cells, side, focus, radius, cellSet, pos };
}

function cellColor(c) {
  if (c < 0) return '#0a0c12';
  if (W.h[c] < W.seaLevel) {
    const bloom = Math.max(W.life[c], W.reef[c] || 0);
    if (bloom > 0.2) return `rgb(20,${(140 + bloom * 80) | 0},${(150 + bloom * 40) | 0})`;
    return '#1a3a5c';
  }
  const build = W.build[c] || 0;
  const life = W.life[c];
  const ice = W.ice[c];
  if (ice > 0.45) return '#d8e4f0';
  if (build > 0.15) {
    const k = Math.min(1, build);
    const r = (168 - k * 70) | 0, g = (148 - k * 55) | 0, b = (120 - k * 40) | 0;
    return `rgb(${r},${g},${b})`;
  }
  if (life > 0.08) {
    const k = Math.min(1, (life - 0.08) / 0.6);
    return `rgb(${(28 - k * 16) | 0},${(220 - k * 50) | 0},${(30 + k * 20) | 0})`;
  }
  const moist = W.moist[c];
  if (moist < 0.28) return '#b89460';
  return '#7a6e56';
}

/** Apply snap + size to the floating Local panel and canvas. */
export function layoutLocalPanel(panel, cvs, opts) {
  if (!panel || !cvs) return;
  const size = opts.size | 0;
  const snap = opts.snap || 'br';
  panel.classList.remove('snap-tl', 'snap-tr', 'snap-bl', 'snap-br');
  panel.classList.add('snap-' + snap);
  cvs.style.width = size + 'px';
  cvs.style.height = size + 'px';
  if (cvs.width !== size || cvs.height !== size) {
    cvs.width = size;
    cvs.height = size;
  }
  const hint = document.getElementById('localhint');
  if (hint) hint.style.maxWidth = size + 'px';
}

/** Draw the flat patch into a 2D canvas. Returns patch descriptor for globe highlight. */
export function drawLocalView(cvs, inspect, opts = {}) {
  if (!cvs) return null;
  const radius = opts.radius ?? 8;
  const pin = opts.pin ?? -1;
  const ctx = cvs.getContext('2d');
  const Wpx = cvs.width, Hpx = cvs.height;
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, Wpx, Hpx);

  const focus = pickFocusCell(inspect, pin);
  const patch = unwrapPatch(focus, radius);
  const { cells, side } = patch;
  const cellPx = Math.max(1, Math.floor((Math.min(Wpx, Hpx) - 8) / side));
  const ox = ((Wpx - side * cellPx) / 2) | 0;
  const oy = ((Hpx - side * cellPx) / 2) | 0;
  patch.layout = { cellPx, ox, oy, Wpx, Hpx };

  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      ctx.fillStyle = cellColor(c);
      ctx.fillRect(ox + ix * cellPx, oy + iy * cellPx, cellPx, cellPx);
      if (c >= 0 && W.build[c] > 0.12) {
        const h = Math.max(2, (W.build[c] * cellPx * 0.85) | 0);
        ctx.fillStyle = 'rgba(255,220,160,0.85)';
        ctx.fillRect(
          ox + ix * cellPx + cellPx * 0.25,
          oy + iy * cellPx + cellPx - h - 1,
          cellPx * 0.5,
          h
        );
      }
    }
  }

  ctx.strokeStyle = 'rgba(140,180,255,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= side; i++) {
    const p = i * cellPx;
    ctx.moveTo(ox + p, oy);
    ctx.lineTo(ox + p, oy + side * cellPx);
    ctx.moveTo(ox, oy + p);
    ctx.lineTo(ox + side * cellPx, oy + p);
  }
  ctx.stroke();

  // Outer window border
  ctx.strokeStyle = 'rgba(255,210,120,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox + 0.5, oy + 0.5, side * cellPx - 1, side * cellPx - 1);

  const cellToXY = new Map();
  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      if (c >= 0) cellToXY.set(c, [ix, iy]);
    }
  }
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m) continue;
    const xy = cellToXY.get(m.cell);
    if (!xy) continue;
    const [ix, iy] = xy;
    const cx = ox + ix * cellPx + cellPx * 0.5;
    const cy = oy + iy * cellPx + cellPx * 0.5;
    ctx.beginPath();
    const settler = m.kind === 5;
    ctx.fillStyle = settler ? '#ffd080' : '#7dff6a';
    ctx.arc(cx, cy, settler ? Math.max(2, cellPx * 0.28) : Math.max(1.5, cellPx * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }

  const fx = ox + radius * cellPx + cellPx * 0.5;
  const fy = oy + radius * cellPx + cellPx * 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(fx - cellPx, fy); ctx.lineTo(fx + cellPx, fy);
  ctx.moveTo(fx, fy - cellPx); ctx.lineTo(fx, fy + cellPx);
  ctx.stroke();

  const life = W.life[focus] || 0;
  const build = W.build[focus] || 0;
  const cls = LIFE_CLASSES[W.lifeClass[focus]]?.id || '—';
  const pinned = pin >= 0;
  ctx.fillStyle = 'rgba(10,13,22,0.72)';
  ctx.fillRect(0, Hpx - 22, Wpx, 22);
  ctx.fillStyle = pinned ? '#ffd080' : '#b8c8e0';
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.fillText(
    `${pinned ? 'pinned' : 'auto'} · cell ${focus} · life ${life.toFixed(2)} · build ${build.toFixed(2)} · ${cls}`,
    8, Hpx - 7
  );
  return patch;
}
