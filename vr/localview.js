/** Flat local patch view — unwraps a neighborhood of cells into a square map.
 *  Presentation clock, cached topology, shared cell description, motion. */

import { isPhone, PHONE_LOCAL_PEEK, localFreePos } from './phoneLayout.js';
import { NC, NBR, DIR, N, cellAtFace } from './sphere.js';
import { W } from './world.js';
import { ENT } from './agents.js';
import { BIOMES } from './sim/ecology.js';
import { lifeLabel, KIND_RGB, legendKeyAt, legendEntries, cellMatchesLegend, GUILD_RGB } from './sim/lifeColour.js';
import { drawSprite, drawCreature } from './sprites.js';
import { whatHappenedHere } from './chronicle.js';
import {
  hash2, presentTime, reducedMotion, stampPhase, windSway,
  describeCell, mixGuild, applyLight, cellLight, cellSun,
  placeSentence, patchScale, tidePhase, wearAt, isOutNow, seasonAt, waterStage,
} from './sim/present.js';
import { isLand, isSubmerged } from './sim/cellSurface.js';
import { squareSegments } from './sim/isoline.js';
import { BRUSH } from './sim/god/brush.js';
import { precipTypeAt, visibilityReduction, frostDewAt, rainbowAt } from './sim/weather.js';

/** Frame ladder: I (icon) → C (metrics chip) → S → M → L → XL → Full.
 *  I/C are chrome modes; S–XL size the map. Panel width is locked to the
 *  frame so legend/status text cannot stretch the dock. */
export const LOCAL_SIZES = [56, 96, 200, 280, 380, 500];
export const LOCAL_SIZE_LABELS = ['I', 'C', 'S', 'M', 'L', 'XL'];
export const LOCAL_SIZE_S = 200;
export const LOCAL_SIZE_M = 280;
export const LOCAL_SNAPS = ['tl', 'tr', 'bl', 'br'];
export const LOCAL_GLOBE = ['off', 'rim', 'wash', 'both'];
export const LOCAL_RADII = [2, 3, 5, 8, 12, 18, 28, 42];
export const LOCAL_RADIUS_LABELS = LOCAL_RADII.map((r) => String(r * 2 + 1));
export const LOCAL_SEEK = ['stay', 'life'];
export const LOCAL_SEEK_LABELS = ['Stay', 'Life'];

export function localFrameIndex(size, expanded) {
  if (expanded) return LOCAL_SIZES.length;
  const i = LOCAL_SIZES.indexOf(size | 0);
  return i >= 0 ? i : LOCAL_SIZES.indexOf(LOCAL_SIZE_M);
}

export function localFrameLabel(size, expanded) {
  if (expanded) return 'Full';
  const i = LOCAL_SIZES.indexOf(size | 0);
  const fi = i >= 0 ? i : LOCAL_SIZES.indexOf(LOCAL_SIZE_M);
  return LOCAL_SIZE_LABELS[fi] || 'M';
}

/** How much chrome the frame shows — icon map-only, chip metrics-first. */
export function localChrome(size, expanded) {
  if (expanded) return 'full';
  const label = localFrameLabel(size, false);
  if (label === 'I') return 'icon';
  if (label === 'C') return 'chip';
  return 'map';
}

/** Fixed outer width for a non-Full frame (padding included). */
export function localPanelWidth(size, expanded) {
  if (expanded) return null;
  const chrome = localChrome(size, false);
  const pad = 12; // #localpanel padding 6×2
  if (chrome === 'icon') return (size | 0) + 8;
  if (chrome === 'chip') return 280; // metrics strip; map is a peek
  return (size | 0) + pad;
}

let _focusCache = { year: -1, grown: -1, cell: -1 };
let _seek = {
  show: -1, next: -1, tArrive: -99, tGo: -99,
  phase: 'dwell', kind: '', why: '', step: 0, key: '',
  recent: [], kinds: [],
};

export function resetFocusCache() {
  _focusCache = { year: -1, grown: -1, cell: -1 };
  _seek = {
    show: -1, next: -1, tArrive: -99, tGo: -99,
    phase: 'dwell', kind: '', why: '', step: 0, key: '',
    recent: [], kinds: [],
  };
}

export function huntGlance() {
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (m && !m.dead && m.behav === 'hunt' && m.cell >= 0) return m.cell;
  }
  for (const sp of W.lifeSparks || []) {
    if (sp.kind === 'hunt' && sp.cell >= 0) return sp.cell;
  }
  return (_seek.phase === 'go' && _seek.next >= 0) ? _seek.next : _seek.show;
}

export function pickFocusCell(inspect, pin = -1, seek = 'stay') {
  if (pin != null && pin >= 0) return pin | 0;
  if (seek !== 'life' && inspect?.cell != null && inspect.cell >= 0) return inspect.cell | 0;
  if (seek === 'life') return pickRecentLife();
  return pickDenseLife();
}

function pickDenseLife() {
  if (_focusCache.year === (W.year | 0) && _focusCache.grown === (W.lifeGrown | 0) && _focusCache.cell >= 0) {
    return _focusCache.cell;
  }
  let best = -1, score = -1;
  for (let c = 0; c < NC; c++) {
    const life = W.life[c] || 0;
    const reef = W.reef?.[c] || 0;
    const s = (W.build[c] || 0) * 3 + life + reef * 0.8;
    if (s > score) { score = s; best = c; }
  }
  const cell = best >= 0 ? best : (NC / 2) | 0;
  _focusCache = { year: W.year | 0, grown: W.lifeGrown | 0, cell };
  return cell;
}

const LIFE_EVENT = /origin|bloom|seed|evolution|speciation|abiogen|luca|photosynth|multicell|eukaryote|land plant/i;

const TOUR = [
  ['coast', 'a living coast'],
  ['reef', 'a reef'],
  ['frontier', 'life spreading'],
  ['town', 'a settlement'],
  ['river', 'a river'],
  ['night', 'the night side'],
  ['vent', 'a vent field'],
  ['canopy', 'a green interior'],
  ['ice', 'the ice edge'],
  ['bloom', 'a bloom'],
];

function latestLifeEvent() {
  const events = W.chron?.events;
  if (!events?.length) return null;
  for (let i = events.length - 1; i >= 0 && i >= events.length - 24; i--) {
    const e = events[i];
    if ((e.cell | 0) <= 0) continue;
    if (LIFE_EVENT.test(`${e.kind} ${e.label || ''}`)) return e;
  }
  return null;
}

function cellDot(a, b) {
  if (a < 0 || b < 0) return 1;
  return DIR[a * 3] * DIR[b * 3] + DIR[a * 3 + 1] * DIR[b * 3 + 1] + DIR[a * 3 + 2] * DIR[b * 3 + 2];
}

function touchesSea(c) {
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    if (n >= 0 && isSubmerged(W, n)) return true;
  }
  return false;
}

function kindScore(c, kind) {
  const life = W.life[c] || 0;
  const reef = W.reef?.[c] || 0;
  const build = W.build?.[c] || 0;
  const ice = W.ice[c] || 0;
  const flow = W.flow?.[c] || 0;
  const sea = isSubmerged(W, c);
  const biome = W.biome ? (BIOMES[W.biome[c]] || '') : '';
  const was = W.prevLife ? (W.prevLife[c] || 0) : 0;
  const d = life - was;
  let nl = 0;
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    if (n >= 0) nl = Math.max(nl, W.life[n] || 0);
  }
  if (kind === 'coast') return (!sea && touchesSea(c) && life > 0.1 && ice < 0.45) ? 0.55 + life : 0;
  if (kind === 'reef') return (sea && reef > 0.16) ? reef * 1.6 : 0;
  if (kind === 'frontier') return (!sea && d > 0.012 && life < 0.45) ? 0.4 + d * 18 + (nl > life ? 0.25 : 0) : 0;
  if (kind === 'town') return build > 0.14 ? build * 1.8 : 0;
  if (kind === 'river') return (!sea && flow > 1.1 && life > 0.08)
    ? 0.4 + Math.min(0.55, Math.log1p(flow) * 0.18) : 0;
  if (kind === 'night') return (cellSun(c) < -0.12 && (life > 0.14 || reef > 0.18)) ? 0.5 + life : 0;
  if (kind === 'vent') return (biome === 'vent' && (life > 0.06 || sea)) ? 1.1 : 0;
  if (kind === 'canopy') return (!sea && !touchesSea(c) && life > 0.38 && ice < 0.3) ? life : 0;
  if (kind === 'ice') return (ice > 0.22 && ice < 0.78 && life > 0.08) ? 0.5 + (0.5 - Math.abs(ice - 0.45)) : 0;
  if (kind === 'bloom') return (d > 0.018 && life > 0.05) ? 0.5 + d * 22 : 0;
  return 0;
}

function rememberStop(cell, kind, why) {
  _seek.show = cell;
  _seek.kind = kind;
  _seek.why = why;
  _seek.recent.push(cell);
  if (_seek.recent.length > 10) _seek.recent.shift();
  if (kind) {
    _seek.kinds.push(kind);
    if (_seek.kinds.length > 6) _seek.kinds.shift();
  }
}

function pickTourStop(from, preferKind) {
  const recent = _seek.recent;
  const usedKind = new Set(_seek.kinds.slice(-3));
  const tryKind = (kind) => {
    let best = -1, score = 0;
    for (let c = 0; c < NC; c++) {
      if (c === from) continue;
      if (recent.includes(c)) continue;
      const s = kindScore(c, kind);
      if (s < 0.35) continue;
      const far = from >= 0 ? (1 - cellDot(from, c)) : 1;
      if (from >= 0 && far < 0.42) continue;
      const jitter = (hash2(c, (_seek.step * 9973) ^ 0x51e) >>> 0) / 4294967296;
      const v = s * (0.55 + far) * (0.72 + jitter * 0.4);
      if (v > score) { score = v; best = c; }
    }
    return best;
  };

  const order = [];
  if (preferKind) order.push(preferKind);
  for (const [k] of TOUR) {
    if (k !== preferKind && !usedKind.has(k)) order.push(k);
  }
  for (const [k] of TOUR) {
    if (!order.includes(k)) order.push(k);
  }
  for (const kind of order) {
    const cell = tryKind(kind);
    if (cell >= 0) {
      const why = (TOUR.find((x) => x[0] === kind) || [kind, kind])[1];
      return { cell, kind, why };
    }
  }
  let best = -1, score = 0;
  for (let c = 0; c < NC; c++) {
    if (c === from || recent.includes(c)) continue;
    const life = (W.life[c] || 0) + (W.reef?.[c] || 0);
    if (life < 0.12) continue;
    const far = from >= 0 ? (1 - cellDot(from, c)) : 1;
    if (from >= 0 && far < 0.22) continue;
    const v = life * (0.4 + far);
    if (v > score) { score = v; best = c; }
  }
  if (best >= 0) return { cell: best, kind: 'canopy', why: 'life' };
  return null;
}

function commitGo(cell, kind, why, t) {
  _seek.next = cell;
  _seek.phase = 'go';
  _seek.tGo = t;
  _seek.kind = kind;
  _seek.why = why;
  _seek.step += 1;
}

function pickRecentLife() {
  const t = presentTime();
  const ev = latestLifeEvent();
  const key = ev ? `${ev.t}:${ev.kind}:${ev.cell}` : '';
  if (ev && key !== _seek.key && (ev.cell | 0) !== _seek.show) {
    _seek.key = key;
    if (_seek.show < 0 || cellDot(_seek.show, ev.cell) < 0.55) {
      commitGo(ev.cell | 0, 'bloom', (ev.label || 'new life').slice(0, 28), t);
    }
  }

  if (_seek.show < 0) {
    if (_seek.next >= 0) {
      rememberStop(_seek.next, _seek.kind, _seek.why);
      _seek.next = -1;
      _seek.phase = 'dwell';
      _seek.tArrive = t;
      return _seek.show;
    }
    const first = pickTourStop(-1, 'coast') || pickTourStop(-1, 'canopy');
    if (first) {
      rememberStop(first.cell, first.kind, first.why);
      _seek.tArrive = t;
      _seek.phase = 'dwell';
    } else {
      _seek.show = pickDenseLife();
      _seek.tArrive = t;
      _seek.why = 'life';
    }
    return _seek.show;
  }

  if (_seek.phase === 'go') {
    const wait = reducedMotion() ? 0 : 0.95;
    if (t - _seek.tGo >= wait && _seek.next >= 0) {
      rememberStop(_seek.next, _seek.kind, _seek.why);
      _seek.next = -1;
      _seek.phase = 'dwell';
      _seek.tArrive = t;
    }
    return _seek.show;
  }

  if (t - _seek.tArrive < 7.2) return _seek.show;

  const want = TOUR[_seek.step % TOUR.length][0];
  const stop = pickTourStop(_seek.show, want);
  if (stop && stop.cell !== _seek.show) commitGo(stop.cell, stop.kind, stop.why, t);
  else _seek.tArrive = t;
  return _seek.show;
}

const _unwrap = new Map();
export function unwrapPatch(focus, radius = 8) {
  const key = (focus | 0) + ':' + (radius | 0);
  const hit = _unwrap.get(key);
  if (hit) {
    _unwrap.delete(key);
    _unwrap.set(key, hit);
    return hit;
  }
  const patch = unwrapFresh(focus | 0, radius | 0);
  _unwrap.set(key, patch);
  if (_unwrap.size > 10) _unwrap.delete(_unwrap.keys().next().value);
  return patch;
}

function unwrapFresh(focus, radius) {
  const at = new Map();
  const pos = new Map();
  const q = [focus];
  let qh = 0;
  at.set(0, focus);
  pos.set(focus, [0, 0]);
  const pack = (x, y) => ((x + 64) << 8) | (y + 64);

  while (qh < q.length) {
    const c = q[qh++];
    const [x, y] = pos.get(c);
    if (Math.abs(x) >= radius && Math.abs(y) >= radius) continue;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const used = new Set();
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (pos.has(n)) {
        const [nx, ny] = pos.get(n);
        used.add(((nx - x) + 4) * 8 + ((ny - y) + 4));
        continue;
      }
      for (const [dx, dy] of dirs) {
        const uk = (dx + 4) * 8 + (dy + 4);
        if (used.has(uk)) continue;
        const nx = x + dx, ny = y + dy;
        if (Math.abs(nx) > radius || Math.abs(ny) > radius) continue;
        const pk = pack(nx, ny);
        if (at.has(pk)) continue;
        at.set(pk, n);
        pos.set(n, [nx, ny]);
        used.add(uk);
        q.push(n);
        break;
      }
    }
  }

  const side = radius * 2 + 1;
  const cells = new Int32Array(side * side);
  cells.fill(-1);
  const cellSet = new Set();
  let missing = 0;
  for (const [pk, c] of at) {
    const x = (pk >> 8) - 64, y = (pk & 255) - 64;
    const ix = x + radius, iy = y + radius;
    if (ix >= 0 && iy >= 0 && ix < side && iy < side) {
      cells[iy * side + ix] = c;
      cellSet.add(c);
    }
  }
  for (let i = 0; i < cells.length; i++) if (cells[i] < 0) missing++;
  return { cells, side, focus, radius, cellSet, pos, missing };
}

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
  return NBR[focus * 4] ?? focus;
}

export function cellAtLocalPixel(patch, layout, px, py) {
  if (!patch || !layout) return -1;
  const dpr = layout.dpr || 1;
  const ix = Math.floor((px * dpr - layout.ox) / layout.cellPx);
  const iy = Math.floor((py * dpr - layout.oy) / layout.cellPx);
  if (ix < 0 || iy < 0 || ix >= patch.side || iy >= patch.side) return -1;
  return patch.cells[iy * patch.side + ix];
}

export function hoverCellAt(patch, cssX, cssY) {
  if (patch?.net) return cellAtNetPixel(patch.layout, cssX, cssY);
  return cellAtLocalPixel(patch, patch?.layout, cssX, cssY);
}

export function cellAtNetPixel(layout, px, py) {
  if (!layout?.net) return -1;
  const dpr = layout.dpr || 1;
  const x = px * dpr - layout.ox;
  const y = py * dpr - layout.oy;
  const cellPx = layout.cellPx;
  const gap = layout.gap || 2;
  const n = layout.n;
  const stride = n * cellPx + gap;
  const col = Math.floor(x / stride);
  const row = Math.floor(y / stride);
  if (col < 0 || col > 2 || row < 0 || row > 1) return -1;
  const i = Math.floor((x - col * stride) / cellPx);
  const j = Math.floor((y - row * stride) / cellPx);
  return cellAtFace(row * 3 + col, i, j, n);
}

export function beingAtLocalPixel(patch, cssX, cssY) {
  const list = patch?.beings;
  const lay = patch?.layout;
  if (!list || !lay) return null;
  const dpr = lay.dpr || 1;
  const x = cssX * dpr, y = cssY * dpr;
  let best = null, bestD = 22 * dpr;
  for (const b of list) {
    const d = Math.hypot(b.x - x, b.y - y);
    const hit = Math.max(bestD, b.size * 0.65);
    if (d < hit) { bestD = d; best = b.meta; }
  }
  return best;
}

export function layoutLocalPanel(panel, cvs, opts) {
  if (!panel || !cvs) return;
  const expanded = !!opts.expanded;
  const snap = opts.snap || 'br';
  const frame = localFrameLabel(opts.size, expanded);
  const chrome = localChrome(opts.size, expanded);
  panel.classList.toggle('expanded', expanded);
  panel.classList.remove('snap-tl', 'snap-tr', 'snap-bl', 'snap-br');
  if (!expanded) panel.classList.add('snap-' + snap);
  panel.dataset.frame = frame;
  panel.dataset.chrome = chrome;

  let size = opts.size | 0;
  if (expanded) {
    const phone = isPhone();
    const pad = phone ? 14 : (innerWidth < 640 ? 12 : 40);
    const topChrome = phone ? 54 : 62;
    const bottomChrome = phone ? 96 : 108;
    const metaChrome = phone ? 68 : (innerWidth < 640 ? 72 : 56);
    const availW = innerWidth - pad * 2;
    const availH = innerHeight - topChrome - bottomChrome - metaChrome;
    const cap = phone
      ? Math.min(availW, availH)
      : Math.min(innerWidth - pad * 2, innerHeight - 88 - metaChrome);
    size = Math.max(phone ? PHONE_LOCAL_PEEK : (innerWidth < 640 ? 220 : 360), Math.min(920, cap | 0));
    panel.style.width = '';
    panel.style.setProperty('--local-map-px', `${size}px`);
  } else {
    panel.style.removeProperty('--local-map-px');
    if (isPhone()) {
      size = PHONE_LOCAL_PEEK;
      panel.style.setProperty('--local-map-px', `${size}px`);
    }
    // Chip keeps a small live peek; icon is the whole instrument.
    if (chrome === 'chip') size = 72;
    const panelW = localPanelWidth(opts.size, false);
    if (panelW != null) panel.style.width = panelW + 'px';
  }
  cvs.style.width = size + 'px';
  cvs.style.height = size + 'px';
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const px = Math.round(size * dpr);
  if (cvs.width !== px || cvs.height !== px) {
    cvs.width = px;
    cvs.height = px;
  }
  cvs._cssSize = size;
  cvs._dpr = dpr;
  panel.dataset.mapPx = String(size);

  if (!expanded && isPhone() && localFreePos()) {
    const pos = localFreePos();
    panel.classList.add('phone-free');
    panel.classList.remove('snap-tl', 'snap-tr', 'snap-bl', 'snap-br');
    panel.style.left = `${pos.left}px`;
    panel.style.top = `${pos.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  } else {
    panel.classList.remove('phone-free');
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '';
    panel.style.bottom = '';
  }

  return size;
}

function fillRGB(ctx, r, g, b, a) {
  if (a != null) ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  else ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Full-sphere cube net — the molding table, not a neighborhood patch. */
function drawNetView(cvs, inspect, opts = {}) {
  const ctx = cvs.getContext('2d');
  const Wpx = cvs.width, Hpx = cvs.height;
  const dpr = cvs._dpr || 1;
  const n = N;
  const gap = Math.max(2, (2 * dpr) | 0);
  const pad = Math.max(4, (4 * dpr) | 0);
  const cellPx = Math.max(1, Math.floor((Math.min(Wpx, Hpx) - pad * 2 - gap * 2) / (n * 3)));
  const netW = 3 * n * cellPx + 2 * gap;
  const netH = 2 * n * cellPx + gap;
  const ox = ((Wpx - netW) / 2) | 0;
  const oy = ((Hpx - netH) / 2) | 0;
  const sea = W.seaLevel;
  const focus = inspect?.cell >= 0 ? inspect.cell : 0;
  const hoverCell = opts.hoverCell ?? -1;

  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, Wpx, Hpx);
  ctx.imageSmoothingEnabled = false;

  for (let f = 0; f < 6; f++) {
    const col = f % 3;
    const row = (f / 3) | 0;
    const fx = ox + col * (n * cellPx + gap);
    const fy = oy + row * (n * cellPx + gap);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const c = cellAtFace(f, i, j, n);
        const h = W.h[c];
        const ice = W.ice?.[c] || 0;
        const lava = W.lava?.[c] || 0;
        let r, g, b;
        if (h < sea) {
          const d = Math.min(1, (sea - h) * 1.6);
          r = 8 + 20 * (1 - d); g = 28 + 40 * (1 - d); b = 70 + 50 * (1 - d);
        } else {
          const e = Math.min(1, (h - sea) / 0.7);
          r = 90 + e * 90; g = 110 - e * 30; b = 70 - e * 20;
          if ((W.life?.[c] || 0) > 0.12) {
            r = 28; g = 72; b = 36;
          }
        }
        if (ice > 0.45) { r = 236; g = 242; b = 250; }
        if (lava > 0.08) { r = 255; g = 80; b = 24; }
        const mark = W.strokeMark?.[c] || 0;
        if (mark > 0.08) {
          r = r + (255 - r) * mark;
          g = g + (210 - g) * mark;
          b = b + (70 - b) * mark;
        }
        if (BRUSH.previewCenter === c) { r = 255; g = 220; b = 90; }
        else if (c === hoverCell) { r = Math.min(255, r + 50); g = Math.min(255, g + 36); }
        if (c === focus) { r = Math.min(255, r + 20); b = Math.min(255, b + 40); }
        fillRGB(ctx, r, g, b);
        ctx.fillRect(fx + i * cellPx, fy + j * cellPx, cellPx, cellPx);
      }
    }
  }

  const patch = {
    net: true,
    focus,
    cells: [],
    side: n * 3,
    layout: { cellPx, ox, oy, Wpx, Hpx, dpr, cssSize: cvs._cssSize || Wpx / dpr, net: true, n, gap },
    status: { behind: false, net: true },
    beings: [],
  };
  return patch;
}

let _pan = { from: -1, to: -1, t0: 0, dx: 0, dy: 0, far: false };
let _hold = null;

export function drawLocalView(cvs, inspect, opts = {}) {
  if (!cvs) return null;
  if (opts.net) return drawNetView(cvs, inspect, opts);
  const radius = opts.radius ?? 8;
  const pin = opts.pin ?? -1;
  const seek = opts.seek === 'life' ? 'life' : 'stay';
  const hoverKey = opts.hoverKey || null;
  const hoverCell = opts.hoverCell ?? -1;
  const alpha = opts.simAlpha ?? 1;
  const ctx = cvs.getContext('2d');
  const Wpx = cvs.width, Hpx = cvs.height;
  const dpr = cvs._dpr || 1;

  const focus = pickFocusCell(inspect, pin, seek);
  const patch = unwrapPatch(focus, radius);
  const { cells, side } = patch;
  const pad = Math.max(4, (4 * dpr) | 0);
  const cellPx = Math.max(1, Math.floor((Math.min(Wpx, Hpx) - pad * 2) / side));
  const ox = ((Wpx - side * cellPx) / 2) | 0;
  const oy = ((Hpx - side * cellPx) / 2) | 0;
  patch.layout = { cellPx, ox, oy, Wpx, Hpx, dpr, cssSize: cvs._cssSize || Wpx / dpr };

  if (focus !== _pan.to) {
    const prev = _pan.to;
    const far = prev >= 0 && cellDot(prev, focus) < 0.78;
    if (far && !reducedMotion() && cvs.width) {
      if (!_hold) _hold = document.createElement('canvas');
      if (_hold.width !== cvs.width || _hold.height !== cvs.height) {
        _hold.width = cvs.width;
        _hold.height = cvs.height;
      }
      _hold.getContext('2d').drawImage(cvs, 0, 0);
    }
    _pan.from = prev;
    _pan.to = focus;
    _pan.t0 = presentTime();
    _pan.far = far;
    if (!far && prev >= 0 && patch.pos) {
      const a = unwrapPatch(prev, 2).pos.get(focus);
      _pan.dx = a ? -a[0] : 0;
      _pan.dy = a ? -a[1] : 0;
    } else { _pan.dx = 0; _pan.dy = 0; }
  }
  const dur = _pan.far ? 0.78 : 0.55;
  const panU = reducedMotion() ? 1 : Math.min(1, (presentTime() - _pan.t0) / dur);
  const panE = 1 - (1 - panU) * (1 - panU);
  const panX = (!_pan.far && _pan.dx) ? (1 - panE) * _pan.dx * cellPx : 0;
  const panY = (!_pan.far && _pan.dy) ? (1 - panE) * _pan.dy * cellPx : 0;

  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, Wpx, Hpx);
  ctx.save();
  if (panX || panY) ctx.translate(panX, panY);

  const fid = mapFidelity(cellPx);
  const hiFi = fid >= 2;
  const highlightGuild = opts.highlightGuild || null;
  const followId = opts.followId;
  ctx.imageSmoothingEnabled = false;
  const shares = Object.create(null);
  let lifeSum = 0, living = 0;

  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      const x = ox + ix * cellPx;
      const y = oy + iy * cellPx;
      if (c < 0) {
        fillRGB(ctx, 8, 10, 16);
        ctx.fillRect(x, y, cellPx, cellPx);
        // Honest cube-corner hole
        ctx.strokeStyle = 'rgba(180,140,80,0.35)';
        ctx.lineWidth = Math.max(1, dpr * 0.6);
        ctx.strokeRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
        continue;
      }
      const desc = describeCell(c, alpha);
      const light = cellLight(c);
      let rgb = applyLight(mixGuild(desc.rgb, c, highlightGuild), light, c);
      const key = legendKeyAt(W, c);
      if (key) shares[key] = (shares[key] || 0) + 1;
      lifeSum += desc.life || 0;
      if ((desc.life || 0) > 0.08) living++;
      if (hoverKey && !cellMatchesLegend(W, c, hoverKey)) {
        rgb = [rgb[0] * 0.28, rgb[1] * 0.28, rgb[2] * 0.32];
      }
      const mark = W.strokeMark?.[c] || 0;
      if (mark > 0.08) {
        rgb = [rgb[0] + (255 - rgb[0]) * mark, rgb[1] + (210 - rgb[1]) * mark, rgb[2] + (70 - rgb[2]) * mark];
      }
      if (BRUSH.previewCenter === c) rgb = [255, 220, 88];
      fillRGB(ctx, rgb[0], rgb[1], rgb[2]);
      ctx.fillRect(x, y, cellPx, cellPx);

      if (c === focus && cellPx >= 3) {
        ctx.strokeStyle = 'rgba(232,200,120,0.8)';
        ctx.lineWidth = Math.max(1, dpr);
        ctx.strokeRect(x + 1, y + 1, cellPx - 2, cellPx - 2);
      }

      if (cellPx >= 6) paintCellDetail(ctx, x, y, cellPx, c, desc, rgb, cells, side, ix, iy, light);

      if (cellPx >= 4) {
        const living = desc.life > 0.04 || desc.reef > 0.12
          || (W.stromatolite?.[c] || 0) > 0.15
          || (W.matCover?.[c] || 0) > 0.1
          || (W.blackDaisy?.[c] || 0) > 0.1
          || (W.whiteDaisy?.[c] || 0) > 0.1
          || !!desc.guild;
        if (living) {
          if (hiFi) {
            ctx.imageSmoothingEnabled = true;
            stampLife(ctx, x, y, cellPx, c, desc, light, fid);
            ctx.imageSmoothingEnabled = false;
          } else if (!desc.sea && desc.life > 0.08 && desc.ice < 0.4 && desc.build < 0.35) {
            ditherCell(ctx, x, y, cellPx, c, desc.life);
          }
        }
      }

      if (desc.build > 0.12) {
        if (hiFi) {
          ctx.imageSmoothingEnabled = true;
          stampBuildings(ctx, x, y, cellPx, c, desc.build, cells, side, ix, iy, light, fid);
          ctx.imageSmoothingEnabled = false;
        } else {
          const h = Math.max(2, (desc.build * cellPx * 0.85) | 0);
          ctx.fillStyle = light.lights > 0.2 ? 'rgba(255,210,140,0.95)' : 'rgba(255,220,160,0.85)';
          ctx.fillRect(x + cellPx * 0.25, y + cellPx - h - 1, cellPx * 0.5, h);
        }
      }

      if (c === hoverCell && cellPx >= 2) {
        ctx.strokeStyle = 'rgba(255,220,140,0.95)';
        ctx.lineWidth = Math.max(1, dpr);
        ctx.strokeRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
      }
    }
  }

  paintCellGrid(ctx, ox, oy, cellPx, cells, side, dpr);
  paintIsoline(ctx, ox, oy, cellPx, cells, side, dpr);
  const rivers = cellPx >= 6 ? paintRivers(ctx, ox, oy, cellPx, cells, side) : 0;

  weatherOverlay(ctx, ox, oy, cellPx, cells, side);
  if (hiFi) paintPlumes(ctx, ox, oy, cellPx, cells, side);
  paintCuePulse(ctx, ox, oy, cellPx, cells, side, opts.cueKind);
  paintCueSprites(ctx, ox, oy, cellPx, cells, side, opts.cueKind);

  const cellToXY = new Map();
  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      if (c >= 0) cellToXY.set(c, [ix, iy]);
    }
  }
  ctx.imageSmoothingEnabled = hiFi;
  const beings = [];
  const cellCounts = new Map();
  const cueBoost = opts.cueKind === 'herd' || opts.cueKind === 'fire' || opts.cueKind === 'smoke';
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    const xy = cellToXY.get(m.cell);
    if (!xy) continue;
    const [ix, iy] = xy;
    const n = cellCounts.get(m.cell) || 0;
    cellCounts.set(m.cell, n + 1);
    const u = entityBlend(m);
    let px = ix, py = iy;
    if (u < 1 && m.prevCell >= 0) {
      const pxy = cellToXY.get(m.prevCell);
      if (pxy) { px = pxy[0] + (ix - pxy[0]) * u; py = pxy[1] + (iy - pxy[1]) * u; }
    }
    const h = hash2(m.id || m.cell, n);
    const jx = ((h & 255) / 255 - 0.5) * cellPx * 0.45;
    const jy = (((h >> 8) & 255) / 255 - 0.5) * cellPx * 0.45;
    const gait = entityGait(m, cueBoost);
    const cx = ox + px * cellPx + cellPx * 0.5 + jx + gait[0];
    const cy = oy + py * cellPx + cellPx * 0.5 + jy + gait[1];
    const ageK = m.age ? Math.min(1.15, 0.72 + Math.min(40, m.age) * 0.008) : 1;
    const planScale = m.plan?.size ? Math.min(1.35, 0.55 + m.plan.size * 0.35) : 1;
    const size = Math.max(4, cellPx * (m.kind === 5 ? 0.72 : m.kind <= 3 ? 0.78 : m.kind >= 14 ? 0.55 : 0.62) * planScale * ageK);
    const flip = (m.heading || 0) < 0;
    const lean = Math.sin((m.heading || 0) * 0.4) * 0.12;
    const out = isOutNow(m.kind, m.cell, m.id || 0);
    if (!out && !hiFi) continue;
    ctx.save();
    if (!out) ctx.globalAlpha = 0.22;
    if (hiFi && cellPx >= 8) castShadow(ctx, cx, cy, size, cellLight(m.cell));
    if (hiFi) {
      if (m.plan) drawCreature(ctx, m.plan, cx, cy, size, { flip, lean, ageFrac: m.age ? Math.min(1, 0.4 + m.age * 0.02) : 1 });
      else drawSprite(ctx, m.kind, cx, cy, size, { flip, lean });
    } else {
      const rgb = KIND_RGB[m.kind] || [125, 255, 106];
      fillRGB(ctx, rgb[0], rgb[1], rgb[2]);
      drawKindGlyph(ctx, cx, cy, cellPx, m.kind);
    }
    drawActMark(ctx, cx, cy, size, m, dpr);
    if (followId != null && m.id === followId) {
      ctx.strokeStyle = 'rgba(180,255,160,0.9)';
      ctx.lineWidth = Math.max(1.2, dpr);
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.78, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    beings.push({ x: cx, y: cy, size, meta: m });
  }
  patch.beings = beings;

  drawLifeSparks(ctx, cellToXY, ox, oy, cellPx, dpr);

  const nCells = side * side - (patch.missing || 0);
  const census = viewCensus(shares, nCells, beings, living, lifeSum);

  const fx = ox + radius * cellPx + cellPx * 0.5;
  const fy = oy + radius * cellPx + cellPx * 0.5;
  const arm = Math.max(3, cellPx * 0.22);
  ctx.strokeStyle = 'rgba(255,236,180,0.55)';
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(fx - arm, fy); ctx.lineTo(fx + arm, fy);
  ctx.moveTo(fx, fy - arm); ctx.lineTo(fx, fy + arm);
  ctx.stroke();

  drawScaleBar(ctx, ox, oy, cellPx, side, dpr, census.line);
  ctx.restore();

  if (_pan.far && _hold?.width && panU < 1) {
    ctx.globalAlpha = 1 - panE;
    ctx.drawImage(_hold, 0, 0);
    ctx.globalAlpha = 1;
  }

  patch.hoverCell = hoverCell;
  const statusCell = hoverCell >= 0 ? hoverCell : focus;
  const desc = describeCell(statusCell, alpha);
  const scale = patchScale(side, W.rule);
  patch.status = {
    pinned: pin >= 0,
    seek,
    why: seek === 'life' ? _seek.why : '',
    cell: statusCell,
    life: desc.life,
    build: desc.build,
    label: lifeLabel(W, statusCell),
    biome: desc.biome,
    guild: desc.guild,
    key: legendKeyAt(W, statusCell),
    zoom: radius,
    side,
    place: placeSentence(statusCell),
    scaleKm: scale.km | 0,
    scaleNamed: scale.named,
    cellKm: scale.cellKm | 0,
    day: cellSun(statusCell) > 0.12 ? 'day' : cellSun(statusCell) < -0.12 ? 'night' : 'twilight',
    moonlit: cellSun(statusCell) < -0.12 && (W.moonIllum ?? 0) > 0.18 && (W.moon?.mass || 0) > 0.05,
    shares,
    census,
    nCells,
    rivers,
    water: desc.water?.stage || '',
    whisper: W.chron ? String((whatHappenedHere(W.chron, statusCell, 1)[0] || {}).label || '').slice(0, 42) : '',
  };
  return patch;
}

const KIND_CENSUS = {
  0: 'trees', 1: 'scrub', 2: 'grass', 3: 'scrub', 4: 'rock',
  5: 'settlers', 6: 'ice fauna', 7: 'worms', 8: 'worms',
  9: 'plants', 12: 'daisies', 13: 'daisies', 14: 'reef life', 15: 'fish',
};

/** Cover + moving life in this map window — not the crosshair cell. */
function viewCensus(shares, nCells, beings, living, lifeSum) {
  const n = Math.max(1, nCells | 0);
  const entries = legendEntries(W);
  const labels = Object.fromEntries(entries.map((e) => [e.id, e.label]));
  const guildIds = new Set(entries.filter((e) => GUILD_RGB[e.id]).map((e) => e.id));
  const ranked = Object.entries(shares)
    .map(([id, count]) => ({
      id,
      n: count,
      pct: Math.round((count / n) * 100),
      label: labels[id] || id,
      guild: guildIds.has(id),
    }))
    .filter((e) => e.n > 0 && e.pct >= 1)
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const bag = Object.create(null);
  for (const b of beings || []) {
    const m = b.meta;
    if (!m || m.dead) continue;
    const label = KIND_CENSUS[m.kind] || 'fauna';
    bag[label] = (bag[label] || 0) + 1;
  }
  const critters = Object.entries(bag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, c]) => `${c} ${k}`);
  const cover = ranked.filter((e) => !e.guild).slice(0, 4).map((e) => `${e.label} ${e.pct}%`);
  const guild = ranked.filter((e) => e.guild).slice(0, 2).map((e) => `${e.label} ${e.pct}%`);
  const bits = [];
  if (cover.length) bits.push(`cover ${cover.join(' · ')}`);
  if (guild.length) bits.push(`guild ${guild.join(' · ')}`);
  if (critters.length) bits.push(critters.join(' · '));
  const lifePct = Math.round((living / n) * 100);
  if (!ranked.some((e) => e.id !== 'ocean' && e.id !== 'barren' && e.id !== 'desert' && e.id !== 'ice')
      && lifePct > 0 && lifePct < 96) {
    bits.push(`alive ${lifePct}%`);
  }
  return {
    ranked,
    line: bits.join(' · ') || 'empty',
    coverLine: cover.join(' · '),
    guildLine: guild.join(' · '),
    critterLine: critters.join(' · '),
    lifePct,
    meanLife: lifeSum / n,
    beings: bag,
  };
}

function entityBlend(m) {
  if (m.arriveAt == null) return 1;
  const span = Math.max(0.18, m.stride ? 0.28 / Math.max(0.4, m.stride) : 0.35);
  return Math.max(0, Math.min(1, 1 - (m.arriveAt - presentTime()) / span));
}

function entityGait(m, cueBoost = false) {
  if (reducedMotion() || m.behav === 'rest') return [0, 0];
  const f = (m.plan?.stride || m.stride || 1);
  let freq = (m.behav === 'flee' ? 11 : m.behav === 'hunt' ? 9 : 6.5)
    * Math.pow(Math.max(0.2, f), -0.16);
  let amp = m.behav === 'flee' ? 1.8 : m.behav === 'hunt' ? 1.45 : 1.1;
  if (cueBoost) {
    freq *= 1.4;
    amp *= 1.85;
  }
  const bob = Math.sin(presentTime() * freq + (m.id || 0) * 0.2) * amp;
  const leanX = (m.behav === 'flee' || cueBoost)
    ? Math.cos(presentTime() * freq * 0.5) * (cueBoost ? 1.6 : 1.2)
    : 0;
  return [leanX, m.kind <= 2 ? 0 : bob];
}

/** Stamp density rungs. 0 colour · 1 grain · 2 sprites · 3 tile · 4 ground. */
function mapFidelity(cellPx) {
  if (cellPx >= 40) return 4;
  if (cellPx >= 22) return 3;
  if (cellPx >= 10) return 2;
  if (cellPx >= 6) return 1;
  return 0;
}

function fidCap(fid, a, b, c) {
  return fid >= 4 ? c : fid >= 3 ? b : a;
}

function ditherCell(ctx, x, y, cellPx, c, life) {
  const biome = W.biome ? BIOMES[W.biome[c]] : null;
  const n = hash2(c, 0x11fe);
  const dots = Math.min(cellPx * cellPx * 0.12, 6 + (life * 8) | 0);
  for (let i = 0; i < dots; i++) {
    const h = hash2(n, i * 9973);
    const px = x + (h % cellPx);
    const py = y + ((h >> 8) % cellPx);
    const bright = (h >> 16) & 1;
    if (biome === 'grassland' || biome === 'savanna') {
      ctx.fillStyle = bright ? 'rgba(200,210,80,0.35)' : 'rgba(40,70,20,0.3)';
    } else if (biome === 'desert') {
      ctx.fillStyle = bright ? 'rgba(230,200,120,0.25)' : 'rgba(100,80,40,0.2)';
    } else {
      ctx.fillStyle = bright ? 'rgba(180,255,140,0.28)' : 'rgba(10,40,15,0.28)';
    }
    ctx.fillRect(px, py, 1, 1);
  }
}

function paintCellDetail(ctx, x, y, cellPx, c, desc, rgb, cells, side, ix, iy, light) {
  const step = Math.max(1, (cellPx / 8) | 0);
  const seed = hash2(c, (W.seed | 0) ^ 0x9e3779b9);
  const t = presentTime();

  if (desc.sea) {
    paintWater(ctx, x, y, cellPx, c, desc, seed, step, t);
    return;
  }

  paintSlope(ctx, x, y, cellPx, c, cells, side, ix, iy);
  paintCoast(ctx, x, y, cellPx, c, desc, cells, side, ix, iy);
  paintBiomeTexture(ctx, x, y, cellPx, c, desc, rgb, seed, step);
  paintLandWater(ctx, x, y, cellPx, c, desc, cells, side, ix, iy, seed);
  paintIce(ctx, x, y, cellPx, desc, seed, step);
  if (desc.ash > 0.08) paintAsh(ctx, x, y, cellPx, desc, seed, step);
  const lava = W.lava?.[c] || 0;
  if (lava > 0.05) {
    ctx.fillStyle = `rgba(255,70,16,${0.2 + lava * 0.55})`;
    ctx.fillRect(x + cellPx * 0.2, y + cellPx * 0.35, cellPx * 0.6, cellPx * 0.45);
  }
  if (desc.dust > 0.12) paintDust(ctx, x, y, cellPx, c, desc, t);
  paintWear(ctx, x, y, cellPx, c, desc);
  paintGrowth(ctx, x, y, cellPx, c, desc);
  if (light?.sun > 0.15 && desc.moist > 0.55 && desc.ice < 0.25) {
    ctx.fillStyle = `rgba(210,226,232,${Math.min(0.16, (desc.moist - 0.5) * 0.22)})`;
    ctx.fillRect(x + 1, y + 1, cellPx - 2, Math.max(1, (cellPx * 0.1) | 0));
  }
  if (light?.warm > 0.35 && light.sun > -0.15 && light.sun < 0.22) {
    ctx.fillStyle = `rgba(255,140,50,${(light.warm - 0.35) * 0.22})`;
    ctx.fillRect(x, y, cellPx, cellPx);
  }
}

function paintWater(ctx, x, y, cellPx, c, desc, seed, step, t) {
  const wu = W.oceanU?.[c] || W.windU?.[c] || 0.08;
  const wv = W.oceanV?.[c] || W.windV?.[c] || 0;
  const spd = Math.hypot(wu, wv);
  const wave = W.waveHt?.[c] || spd;
  ctx.fillStyle = `rgba(4,16,32,${0.06 + Math.min(0.28, desc.depth * 1.5)})`;
  ctx.fillRect(x, y, cellPx, cellPx);
  if (desc.depth < 0.07) {
    const k = 1 - desc.depth / 0.07;
    ctx.fillStyle = `rgba(168,148,88,${0.1 + k * 0.32})`;
    ctx.fillRect(x, y, cellPx, cellPx);
  }
  const foam = Math.min(0.28, wave * 0.4);
  if (foam > 0.04 && desc.ice < 0.3) {
    const edge = Math.max(1, (cellPx * (0.1 + foam * 0.2)) | 0);
    ctx.fillStyle = `rgba(214,228,236,${0.08 + foam})`;
    if (wu >= 0) ctx.fillRect(x + cellPx - edge, y, edge, cellPx);
    else ctx.fillRect(x, y, edge, cellPx);
  }
  if (cellPx >= 10 && desc.ice < 0.45) {
    const drift = reducedMotion() ? 0 : t * (4 + spd * 10);
    const nWave = spd > 0.18 ? 2 : 1;
    ctx.strokeStyle = `rgba(196,216,228,${0.08 + Math.min(0.12, spd * 0.18)})`;
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    for (let i = 0; i < nWave; i++) {
      const h = hash2(seed, i * 19);
      const y0 = y + 2 + (((h + (drift | 0)) % Math.max(1, cellPx - 4)));
      const x0 = x + 1 + (h & 3);
      const x1 = x + cellPx - 2 - ((h >> 4) & 3);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) * 0.5, y0 + wu * cellPx * 0.12, x1, y0 + wu * cellPx * 0.08);
      ctx.stroke();
    }
  }
  if (desc.depth < 0.07) {
    const swell = reducedMotion() ? 0.5 : 0.5 + Math.sin(t * 1.4 + (c & 15)) * 0.5;
    ctx.fillStyle = `rgba(210,236,248,${0.06 + swell * 0.1})`;
    ctx.fillRect(x, y, cellPx, Math.max(1, (cellPx * 0.12) | 0));
  }
  const nightLight = cellLight(c);
  if (nightLight.night > 0.25 && nightLight.moon > 0.12 && desc.ice < 0.4 && cellPx >= 8) {
    const a = nightLight.night * nightLight.moon * 0.34;
    ctx.fillStyle = `rgba(148,176,228,${a * 0.4})`;
    ctx.fillRect(x, y, cellPx, Math.max(1, (cellPx * 0.1) | 0));
    const hx = hash2(seed, 41);
    ctx.fillStyle = `rgba(190,214,248,${a})`;
    ctx.fillRect(x + 2 + (hx % Math.max(1, cellPx - 6)), y + 2 + ((hx >> 8) % Math.max(1, cellPx - 6)), Math.max(2, cellPx * 0.22), 1);
  }
  const tide = tidePhase(c);
  const inter = W.intertidal?.[c] || 0;
  if (desc.depth < 0.05 && (inter > 0.08 || desc.depth < 0.025)) {
    const flats = (1 - tide) * (0.35 + inter * 0.5);
    if (flats > 0.12) {
      ctx.fillStyle = `rgba(168,142,88,${Math.min(0.55, flats * 0.7)})`;
      ctx.fillRect(x, y + cellPx * (0.45 + tide * 0.35), cellPx, cellPx * (0.55 - tide * 0.35));
    }
  }
  if (desc.ice > 0.35) {
    ctx.fillStyle = `rgba(220,235,250,${0.25 + desc.ice * 0.45})`;
    ctx.fillRect(x + 1, y + 1, cellPx - 2, cellPx - 2);
  }
  if (desc.biome === 'vent') {
    ctx.fillStyle = `rgba(200,70,36,${0.12 + Math.sin(t * 2.4 + c) * 0.06})`;
    ctx.fillRect(x + cellPx * 0.3, y + cellPx * 0.4, cellPx * 0.4, cellPx * 0.5);
  } else if (desc.biome === 'upwelling') {
    ctx.fillStyle = `rgba(70,190,200,${0.1 + Math.sin(t * 1.8 + c) * 0.05})`;
    ctx.fillRect(x, y, cellPx, cellPx);
  } else if (desc.biome === 'gyre') {
    ctx.strokeStyle = 'rgba(90,160,200,0.18)';
    ctx.beginPath();
    ctx.arc(x + cellPx * 0.5, y + cellPx * 0.5, cellPx * 0.32, t * 0.35, t * 0.35 + 2.4);
    ctx.stroke();
  }
}

function paintSlope(ctx, x, y, cellPx, c, cells, side, ix, iy) {
  const at = (dx, dy) => {
    const xx = ix + dx, yy = iy + dy;
    if (xx < 0 || yy < 0 || xx >= side || yy >= side) return W.h[c];
    const n = cells[yy * side + xx];
    return n >= 0 ? W.h[n] : W.h[c];
  };
  const gx = (at(1, 0) - at(-1, 0)) * 0.5;
  const gy = (at(0, 1) - at(0, -1)) * 0.5;
  const shade = Math.max(-0.18, Math.min(0.18, -gx * 0.9 - gy * 0.45));
  if (Math.abs(shade) < 0.02) return;
  ctx.fillStyle = shade > 0 ? `rgba(255,255,240,${shade})` : `rgba(8,14,28,${-shade * 1.3})`;
  ctx.fillRect(x, y, cellPx, cellPx);
}

function paintCoast(ctx, x, y, cellPx, c, desc, cells, side, ix, iy) {
  if (desc.ice > 0.35 || desc.build > 0.2) return;
  const sea = (dx, dy) => {
    const xx = ix + dx, yy = iy + dy;
    if (xx < 0 || yy < 0 || xx >= side || yy >= side) return false;
    const n = cells[yy * side + xx];
    return n >= 0 && isSubmerged(W, n);
  };
  const tide = tidePhase(c);
  const inter = W.intertidal?.[c] || 0;
  const fringe = Math.max(1, (cellPx * (0.16 + tide * 0.1 + inter * 0.08)) | 0);
  const wet = Math.max(1, (fringe * (0.4 + tide * 0.35)) | 0);
  ctx.fillStyle = `rgba(214,190,120,${0.45 + tide * 0.22})`;
  if (sea(0, 1)) ctx.fillRect(x, y + cellPx - fringe, cellPx, fringe);
  if (sea(0, -1)) ctx.fillRect(x, y, cellPx, fringe);
  if (sea(1, 0)) ctx.fillRect(x + cellPx - fringe, y, fringe, cellPx);
  if (sea(-1, 0)) ctx.fillRect(x, y, fringe, cellPx);
  ctx.fillStyle = 'rgba(40,90,120,0.28)';
  if (sea(0, 1)) ctx.fillRect(x, y + cellPx - wet, cellPx, wet);
  if (sea(0, -1)) ctx.fillRect(x, y, cellPx, wet);
  if (sea(1, 0)) ctx.fillRect(x + cellPx - wet, y, wet, cellPx);
  if (sea(-1, 0)) ctx.fillRect(x, y, wet, cellPx);
  // Bay / spit in a corner where two seas meet
  if (sea(1, 0) && sea(0, 1)) {
    ctx.fillStyle = 'rgba(32,80,110,0.45)';
    ctx.beginPath();
    ctx.moveTo(x + cellPx, y + cellPx);
    ctx.arc(x + cellPx, y + cellPx, fringe * 1.6, Math.PI, Math.PI * 1.5);
    ctx.fill();
  }
}

function paintIsoline(ctx, ox, oy, cellPx, cells, side, dpr) {
  const h = W.h;
  if (!h) return;
  const sea = W.seaLevel;
  ctx.save();
  ctx.strokeStyle = 'rgba(8, 22, 40, 0.72)';
  ctx.lineWidth = Math.max(1.15, dpr * 1.05);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let iy = 0; iy < side - 1; iy++) {
    for (let ix = 0; ix < side - 1; ix++) {
      const c0 = cells[iy * side + ix];
      const c1 = cells[iy * side + ix + 1];
      const c2 = cells[(iy + 1) * side + ix + 1];
      const c3 = cells[(iy + 1) * side + ix];
      if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) continue;
      const segs = squareSegments(h[c0], h[c1], h[c2], h[c3], sea);
      if (!segs.length) continue;
      const x0 = ox + ix * cellPx + cellPx * 0.5;
      const y0 = oy + iy * cellPx + cellPx * 0.5;
      for (let s = 0; s < segs.length; s += 4) {
        ctx.moveTo(x0 + segs[s] * cellPx, y0 + segs[s + 1] * cellPx);
        ctx.lineTo(x0 + segs[s + 2] * cellPx, y0 + segs[s + 3] * cellPx);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

function paintBiomeTexture(ctx, x, y, cellPx, c, desc, rgb, seed, step) {
  const biome = desc.biome;
  const t = presentTime();
  if (biome === 'desert') {
    ctx.strokeStyle = 'rgba(210,170,110,0.28)';
    ctx.lineWidth = Math.max(1, step);
    for (let i = 0; i < 4; i++) {
      const h = hash2(seed, i * 41);
      const y0 = y + 2 + ((h % Math.max(1, cellPx - 4)));
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.quadraticCurveTo(x + cellPx * 0.5, y0 + ((h >> 8) & 3) - 1, x + cellPx, y0);
      ctx.stroke();
    }
    return;
  }
  if (biome === 'savanna') {
    ctx.strokeStyle = 'rgba(170,150,60,0.35)';
    ctx.lineWidth = 1;
    const n = 6 + ((desc.life * 8) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(seed, i * 17);
      const px = x + (h % cellPx);
      const py = y + ((h >> 8) % cellPx);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + 1, py - Math.max(2, (cellPx * 0.14) | 0));
      ctx.stroke();
    }
    return;
  }
  if (biome === 'grassland') {
    ctx.fillStyle = 'rgba(150,170,70,0.22)';
    for (let i = 0; i < 10; i++) {
      const h = hash2(seed, i * 13);
      ctx.fillRect(x + (h % cellPx), y + ((h >> 8) % cellPx), 1, Math.max(2, step + 1));
    }
    return;
  }
  if (biome === 'tropRainforest' || biome === 'tempRainforest') {
    ctx.fillStyle = 'rgba(10,40,22,0.22)';
    ctx.fillRect(x + 1, y + cellPx * 0.45, cellPx - 2, cellPx * 0.5);
    for (let i = 0; i < 8; i++) {
      const h = hash2(seed, i * 29);
      ctx.fillStyle = (h & 1) ? 'rgba(20,80,42,0.35)' : 'rgba(36,110,52,0.28)';
      ctx.beginPath();
      ctx.ellipse(x + (h % cellPx), y + ((h >> 8) % (cellPx * 0.7)), cellPx * 0.18, cellPx * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  if (biome === 'tropSeasonal' || biome === 'tempDeciduous') {
    const n = 8 + ((desc.life * 6) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(seed, i * 11);
      ctx.fillStyle = (h & 2) ? 'rgba(70,120,50,0.28)' : 'rgba(120,140,55,0.22)';
      ctx.fillRect(x + (h % cellPx), y + ((h >> 8) % cellPx), step + 1, step);
    }
    return;
  }
  if (biome === 'boreal') {
    ctx.fillStyle = 'rgba(20,50,36,0.28)';
    for (let i = 0; i < 7; i++) {
      const h = hash2(seed, i * 23);
      const px = x + (h % cellPx), py = y + ((h >> 8) % cellPx);
      ctx.beginPath();
      ctx.moveTo(px, py - 3);
      ctx.lineTo(px + 2, py + 2);
      ctx.lineTo(px - 2, py + 2);
      ctx.fill();
    }
    return;
  }
  if (biome === 'tundra') {
    for (let i = 0; i < 9; i++) {
      const h = hash2(seed, i * 7);
      ctx.fillStyle = (h & 1) ? 'rgba(140,150,120,0.3)' : 'rgba(90,110,80,0.22)';
      ctx.fillRect(x + (h % cellPx), y + ((h >> 8) % cellPx), step, step);
    }
    return;
  }
  if (biome === 'vent') {
    ctx.fillStyle = 'rgba(80,40,36,0.35)';
    ctx.fillRect(x, y, cellPx, cellPx);
    ctx.strokeStyle = `rgba(220,90,40,${0.25 + Math.sin(t * 2 + c) * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(x + cellPx * 0.3, y + cellPx);
    ctx.lineTo(x + cellPx * 0.45, y + cellPx * 0.4);
    ctx.lineTo(x + cellPx * 0.6, y + cellPx);
    ctx.stroke();
    return;
  }
  if (biome === 'upwelling') {
    ctx.strokeStyle = 'rgba(80,180,200,0.22)';
    for (let i = 0; i < 4; i++) {
      const h = hash2(seed, i);
      const x0 = x + ((h + ((t * 8) | 0)) % cellPx);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + 2, y + cellPx);
      ctx.stroke();
    }
    return;
  }
  if (biome === 'gyre') {
    ctx.strokeStyle = 'rgba(60,140,180,0.2)';
    ctx.beginPath();
    ctx.arc(x + cellPx * 0.5, y + cellPx * 0.5, cellPx * 0.28, t * 0.4, t * 0.4 + 2.2);
    ctx.stroke();
    return;
  }
  if (biome === 'reef') {
    ctx.fillStyle = 'rgba(30,140,130,0.22)';
    ctx.fillRect(x, y + cellPx * 0.35, cellPx, cellPx * 0.3);
    return;
  }
  const dens = Math.min(0.28, 0.04 + desc.moist * 0.12 + desc.life * 0.08);
  const nPix = Math.min(((cellPx * cellPx * dens) / (step * step)) | 0, 40);
  for (let i = 0; i < nPix; i++) {
    const h = hash2(seed, i * 131);
    fillRGB(ctx, rgb[0] + ((h & 8) ? 8 : -8), rgb[1] + 6, rgb[2] - 4);
    ctx.fillRect(x + (h % cellPx), y + ((h >> 8) % cellPx), step, step);
  }
}

function paintIce(ctx, x, y, cellPx, desc, seed, step) {
  if (desc.ice < 0.4) return;
  const n = 3 + ((desc.ice * 8) | 0);
  for (let i = 0; i < n; i++) {
    const h = hash2(seed ^ 0x1ce, i);
    const px = x + (h % cellPx);
    const py = y + ((h >> 8) % cellPx);
    if (desc.ice > 0.75) ctx.fillStyle = 'rgba(160,200,230,0.45)';
    else if ((h & 5) === 0) ctx.fillStyle = 'rgba(255,255,255,0.55)';
    else ctx.fillStyle = 'rgba(200,220,240,0.35)';
    ctx.fillRect(px, py, step + ((h >> 4) & 1), step);
  }
}

function paintWear(ctx, x, y, cellPx, c, desc) {
  const wear = wearAt(c);
  if (wear < 0.04 || desc.sea || desc.ice > 0.4) return;
  ctx.fillStyle = `rgba(92,72,48,${Math.min(0.38, wear * 0.42)})`;
  const mid = (cellPx * 0.46) | 0;
  const w = Math.max(1, (cellPx * (0.08 + wear * 0.1)) | 0);
  ctx.fillRect(x + mid, y + 1, w, cellPx - 2);
}

function paintGrowth(ctx, x, y, cellPx, c, desc) {
  if (!W.prevLife || desc.sea) return;
  const d = (W.life[c] || 0) - (W.prevLife[c] || 0);
  if (d > 0.018) {
    ctx.fillStyle = `rgba(140,220,90,${Math.min(0.28, d * 2.2)})`;
    ctx.fillRect(x + 1, y + 1, cellPx - 2, cellPx - 2);
  } else if (d < -0.025) {
    ctx.fillStyle = `rgba(48,22,16,${Math.min(0.24, -d * 1.6)})`;
    ctx.fillRect(x, y, cellPx, cellPx);
  }
}

function paintCellGrid(ctx, ox, oy, cellPx, cells, side, dpr) {
  if (cellPx < 6 || cellPx >= 16) return;
  ctx.save();
  ctx.lineWidth = Math.max(1, dpr * 0.5);
  ctx.strokeStyle = 'rgba(8,12,18,0.28)';
  ctx.beginPath();
  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      if (c < 0 || isSubmerged(W, c)) continue;
      const x = ox + ix * cellPx;
      const y = oy + iy * cellPx;
      const right = ix + 1 < side ? cells[iy * side + ix + 1] : -1;
      const down = iy + 1 < side ? cells[(iy + 1) * side + ix] : -1;
      if (right >= 0 && !isSubmerged(W, right)) {
        ctx.moveTo(x + cellPx + 0.5, y);
        ctx.lineTo(x + cellPx + 0.5, y + cellPx);
      }
      if (down >= 0 && !isSubmerged(W, down)) {
        ctx.moveTo(x, y + cellPx + 0.5);
        ctx.lineTo(x + cellPx, y + cellPx + 0.5);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

function downhillDelta(cells, side, ix, iy, c) {
  let bh = W.h[c], dx = 0, dy = 1;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const xx = ix + ox, yy = iy + oy;
      if (xx < 0 || yy < 0 || xx >= side || yy >= side) continue;
      const n = cells[yy * side + xx];
      if (n >= 0 && W.h[n] < bh) { bh = W.h[n]; dx = ox; dy = oy; }
    }
  }
  return [dx, dy];
}

function paintLandWater(ctx, x, y, cellPx, c, desc, cells, side, ix, iy, seed) {
  const w = desc.water;
  if (!w || w.stage === 'dry' || w.stage === 'ice' || w.stage === 'ocean') return;
  if (desc.ice > 0.45 || desc.build > 0.55) return;
  const [dx, dy] = downhillDelta(cells, side, ix, iy, c);
  const drainX = x + cellPx * (0.5 + dx * 0.28);
  const drainY = y + cellPx * (0.5 + dy * 0.28);

  if (w.stage === 'sheet' || w.stage === 'drip') {
    const a = w.stage === 'drip' ? w.amount * 0.12 : 0.08 + w.amount * 0.28;
    ctx.fillStyle = `rgba(28,62,78,${a})`;
    const n = w.stage === 'drip' ? 1 : 1 + ((w.amount * 5) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(seed, 0x11d + i * 19);
      const px = x + 2 + (h % Math.max(1, cellPx - 5));
      const py = y + 2 + ((h >> 8) % Math.max(1, cellPx - 5));
      const u = 0.35 + (i / Math.max(1, n)) * 0.5;
      ctx.beginPath();
      ctx.ellipse(px * (1 - u) + drainX * u, py * (1 - u) + drainY * u, 1.2 + w.amount * 2, 0.8 + w.amount, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (w.stage === 'pond') {
    ctx.fillStyle = `rgba(14,48,72,${0.22 + w.amount * 0.45})`;
    ctx.beginPath();
    ctx.ellipse(drainX, drainY, cellPx * (0.22 + w.amount * 0.22), cellPx * (0.16 + w.amount * 0.14), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(170,214,228,${0.25 + w.amount * 0.35})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function paintRivers(ctx, ox, oy, cellPx, cells, side) {
  const flow = W.flow;
  if (!flow) return 0;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const segs = [];
  let nRivers = 0;
  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      if (c < 0 || isSubmerged(W, c)) continue;
      const f = flow[c] || 0;
      if ((W.lake?.[c] || 0) > 0.5) {
        const wet = waterStage(c);
        const a = 0.42 + wet.amount * 0.4;
        const cx = ox + ix * cellPx + cellPx * 0.5;
        const cy = oy + iy * cellPx + cellPx * 0.52;
        ctx.fillStyle = `rgba(10,40,64,${a})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, cellPx * (0.42 + wet.amount * 0.1), cellPx * (0.34 + wet.amount * 0.08), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(168,214,228,${0.4 + wet.amount * 0.25})`;
        ctx.lineWidth = Math.max(1, cellPx * 0.07);
        ctx.stroke();
        nRivers++;
      }
      // Headwaters are real discharge but not a drawing. Amount = how full the channel is.
      if (f < 0.22) continue;
      let bx = ix, by = iy, found = false;
      const dest = W.drainTo?.[c];
      if (dest >= 0) {
        for (let dy = -1; dy <= 1 && !found; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = ix + dx, yy = iy + dy;
            if (xx < 0 || yy < 0 || xx >= side || yy >= side) continue;
            if (cells[yy * side + xx] === dest) { bx = xx; by = yy; found = true; break; }
          }
        }
      }
      if (!found) {
        let bestH = W.h[c];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = ix + dx, yy = iy + dy;
            if (xx < 0 || yy < 0 || xx >= side || yy >= side) continue;
            const n = cells[yy * side + xx];
            if (n >= 0 && W.h[n] < bestH) {
              bestH = W.h[n]; bx = xx; by = yy; found = true;
            }
          }
        }
      }
      if (!found) continue;
      const amt = Math.min(1, Math.log1p(f) / Math.log1p(16));
      const w = Math.max(0.7, Math.min(cellPx * 0.24, 0.55 + amt * cellPx * 0.18));
      segs.push({
        x0: ox + ix * cellPx + cellPx * 0.5,
        y0: oy + iy * cellPx + cellPx * 0.5,
        x1: ox + bx * cellPx + cellPx * 0.5,
        y1: oy + by * cellPx + cellPx * 0.5,
        w,
        amt,
        salt: c,
      });
      nRivers++;
    }
  }
  const strokeSeg = (s, width, color) => {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
    const mx = (s.x0 + s.x1) * 0.5 + -dy * 0.08;
    const my = (s.y0 + s.y1) * 0.5 + dx * 0.08;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.quadraticCurveTo(mx, my, s.x1, s.y1);
    ctx.stroke();
  };
  for (const s of segs) strokeSeg(s, s.w + 0.7, `rgba(10,32,52,${0.26 + s.amt * 0.48})`);
  for (const s of segs) {
    if (s.amt < 0.32) continue;
    strokeSeg(s, Math.max(0.45, s.w * 0.34), `rgba(168,214,228,${0.1 + s.amt * 0.4})`);
  }
  ctx.restore();
  return nRivers;
}

function paintPlumes(ctx, ox, oy, cellPx, cells, side) {
  if (reducedMotion()) return;
  const t = presentTime();
  const loc = new Map();
  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      if (c >= 0) loc.set(c, [ix, iy]);
    }
  }
  const drawPlume = (ix, iy, mag, salt) => {
    const x = ox + ix * cellPx + cellPx * 0.5;
    const y = oy + iy * cellPx + cellPx * 0.35;
    const n = 5 + ((mag * 6) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(salt, i + ((t * 4) | 0));
      const rise = ((t * (14 + mag * 10) + i * 7) % (cellPx * 1.6));
      const drift = Math.sin(t * 0.9 + i) * cellPx * 0.12;
      const a = Math.max(0, 0.28 - rise / (cellPx * 2.2)) * mag;
      ctx.fillStyle = `rgba(${70 + (h & 15)},${62 + ((h >> 4) & 15)},${58},${a})`;
      ctx.beginPath();
      ctx.arc(x + drift + ((h & 7) - 3), y - rise, 1.4 + mag * 1.8 + ((h >> 8) & 1), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const seen = new Set();
  for (const v of (W.volcanoes || [])) {
    if ((v.magma || 0) < 0.18 && (W.ash?.[v.cell] || 0) < 0.12) continue;
    const xy = loc.get(v.cell);
    if (!xy) continue;
    seen.add(v.cell);
    drawPlume(xy[0], xy[1], Math.min(1, (v.magma || 0) * 0.7 + (W.ash?.[v.cell] || 0)), v.cell);
  }
  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      if (c < 0 || seen.has(c)) continue;
      const ash = W.ash?.[c] || 0;
      if (ash > 0.28) drawPlume(ix, iy, Math.min(1, ash), c ^ 0x51);
    }
  }
}

function paintCuePulse(ctx, ox, oy, cellPx, cells, side, kind) {
  if (!kind || kind === 'place' || reducedMotion()) return;
  const t = presentTime();
  const pulse = 0.45 + 0.55 * Math.sin(t * 7);
  let rgba = null;
  if (kind === 'fire') rgba = [255, 120, 40, 0.18 + pulse * 0.22];
  else if (kind === 'smoke') rgba = [160, 150, 140, 0.12 + pulse * 0.16];
  else if (kind === 'herd') rgba = [120, 200, 90, 0.1 + pulse * 0.14];
  else if (kind === 'life') rgba = [80, 220, 120, 0.08 + pulse * 0.12];
  if (!rgba) return;
  ctx.save();
  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      if (c < 0) continue;
      let hit = false;
      if (kind === 'fire') hit = (W.fire?.[c] || 0) > 0.05 || (W.ash?.[c] || 0) > 0.08;
      else if (kind === 'smoke') hit = (W.smoke?.[c] || 0) > 0.04 || (W.ash?.[c] || 0) > 0.1;
      else if (kind === 'life') hit = (W.life?.[c] || 0) > 0.25;
      else if (kind === 'herd') {
        for (let i = 0; i < (ENT?.n || 0); i++) {
          if (ENT.cell?.[i] === c && ENT.meta?.[i] && !ENT.meta[i].dead) { hit = true; break; }
        }
      }
      if (!hit) continue;
      const x = ox + ix * cellPx;
      const y = oy + iy * cellPx;
      ctx.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]})`;
      ctx.fillRect(x, y, cellPx, cellPx);
      ctx.strokeStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${0.35 + pulse * 0.4})`;
      ctx.lineWidth = Math.max(1, cellPx * 0.08);
      ctx.strokeRect(x + 1, y + 1, cellPx - 2, cellPx - 2);
    }
  }
  ctx.restore();
}

/** Brief motion sprites over cued cells — herd walk / fire embers / smoke drift. */
function paintCueSprites(ctx, ox, oy, cellPx, cells, side, kind) {
  if (!kind || kind === 'place' || kind === 'life' || reducedMotion()) return;
  if (cellPx < 4) return;
  const t = presentTime();
  ctx.save();
  let drawn = 0;
  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      if (drawn > 48) break;
      const c = cells[iy * side + ix];
      if (c < 0) continue;
      let hit = false;
      if (kind === 'fire') hit = (W.fire?.[c] || 0) > 0.05 || (W.ash?.[c] || 0) > 0.08;
      else if (kind === 'smoke') hit = (W.smoke?.[c] || 0) > 0.04 || (W.ash?.[c] || 0) > 0.08;
      else if (kind === 'herd') {
        for (let i = 0; i < (ENT?.n || 0); i++) {
          if (ENT.cell?.[i] === c && ENT.meta?.[i] && !ENT.meta[i].dead) { hit = true; break; }
        }
      }
      if (!hit) continue;
      drawn++;
      const x0 = ox + ix * cellPx + cellPx * 0.5;
      const y0 = oy + iy * cellPx + cellPx * 0.5;
      const h = hash2(c, kind === 'fire' ? 0xf1 : kind === 'smoke' ? 0x51 : 0xb3);
      if (kind === 'fire') {
        for (let k = 0; k < 3; k++) {
          const ph = t * (9 + (k * 1.7)) + ((h >> (k * 3)) & 7);
          const rise = ((Math.sin(ph) * 0.5 + 0.5) * cellPx * 0.55);
          const wob = Math.cos(ph * 1.3) * cellPx * 0.12;
          const a = 0.35 + 0.45 * Math.sin(ph * 0.7 + k);
          ctx.fillStyle = `rgba(255,${140 + k * 30},${40 + k * 10},${Math.max(0.15, a)})`;
          ctx.beginPath();
          ctx.arc(x0 + wob, y0 - rise * 0.35 - k * 1.2, Math.max(1.2, cellPx * (0.08 + k * 0.02)), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (kind === 'smoke') {
        const drift = ((t * 12 + (h & 255)) % (cellPx * 1.4)) - cellPx * 0.2;
        const bob = Math.sin(t * 3.2 + c) * cellPx * 0.08;
        ctx.fillStyle = 'rgba(190,185,178,0.28)';
        ctx.beginPath();
        ctx.ellipse(x0 + drift * 0.35, y0 - cellPx * 0.15 + bob, cellPx * 0.28, cellPx * 0.14, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(140,135,130,0.2)';
        ctx.beginPath();
        ctx.ellipse(x0 + drift * 0.2 - cellPx * 0.1, y0 - cellPx * 0.28 + bob, cellPx * 0.22, cellPx * 0.1, -0.15, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'herd') {
        const step = Math.sin(t * 8 + c * 0.3);
        const stride = Math.cos(t * 8 + c * 0.3) * cellPx * 0.18;
        const bob = Math.abs(step) * cellPx * 0.1;
        ctx.fillStyle = 'rgba(90,200,100,0.85)';
        ctx.beginPath();
        ctx.ellipse(x0 + stride, y0 + cellPx * 0.12 - bob, cellPx * 0.16, cellPx * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,255,160,0.7)';
        ctx.lineWidth = Math.max(1, cellPx * 0.05);
        ctx.beginPath();
        ctx.moveTo(x0 + stride - cellPx * 0.12, y0 + cellPx * 0.05);
        ctx.lineTo(x0 + stride + cellPx * 0.18, y0 - cellPx * 0.02 - bob);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function castShadow(ctx, px, py, size, light) {
  if (!light || light.night > 0.55 || light.sun < -0.15) return;
  const len = size * (0.28 + Math.max(0.08, 0.4 - Math.max(0, light.sun) * 0.25));
  ctx.fillStyle = `rgba(6,10,18,${0.14 + (1 - light.expo) * 0.12})`;
  ctx.beginPath();
  ctx.ellipse(px + size * 0.14, py + size * 0.3, len, size * 0.16, 0.38, 0, Math.PI * 2);
  ctx.fill();
}

function paintAsh(ctx, x, y, cellPx, desc, seed, step) {
  ctx.fillStyle = `rgba(55,52,48,${Math.min(0.55, desc.ash * 0.7)})`;
  const n = 4 + ((desc.ash * 10) | 0);
  for (let i = 0; i < n; i++) {
    const h = hash2(seed ^ 0x55, i);
    ctx.fillRect(x + (h % cellPx), y + ((h >> 8) % cellPx), step, step);
  }
}

function paintDust(ctx, x, y, cellPx, c, desc, t) {
  const wu = W.windU?.[c] || 0.2;
  const a = Math.min(0.42, desc.dust * 0.5);
  if (reducedMotion()) {
    ctx.fillStyle = `rgba(180,150,100,${a})`;
    ctx.fillRect(x, y, cellPx, cellPx);
    return;
  }
  const edge = ((Math.sin(t * 0.35 + c * 0.01) * 0.5 + 0.5) * cellPx * 0.4) | 0;
  ctx.fillStyle = `rgba(180,150,100,${a})`;
  ctx.fillRect(x, y, cellPx, cellPx);
  ctx.fillStyle = `rgba(210,180,120,${a * 0.45})`;
  const dir = wu >= 0 ? 1 : -1;
  ctx.fillRect(dir > 0 ? x : x + cellPx - edge, y, edge, cellPx);
}

function weatherOverlay(ctx, ox, oy, cellPx, cells, side) {
  const t = presentTime();
  const still = reducedMotion();
  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      if (c < 0) continue;
      const x = ox + ix * cellPx;
      const y = oy + iy * cellPx;
      const sun = cellSun(c);
      const moist = W.moist?.[c] || 0;
      if (sun > -0.1 && sun < 0.24 && moist > 0.38 && isLand(W, c)) {
        const fog = Math.max(0, 1 - Math.abs(sun - 0.06) * 5) * (moist - 0.32) * 0.42;
        if (fog > 0.04) {
          ctx.fillStyle = `rgba(214,224,232,${Math.min(0.38, fog)})`;
          ctx.fillRect(x, y, cellPx, cellPx);
        }
      }
      if (sun > -0.18 && sun < 0.2) {
        const band = Math.max(0, 1 - Math.abs(sun) * 4.2);
        ctx.fillStyle = `rgba(255,110,42,${band * 0.16})`;
        ctx.fillRect(x, y, cellPx, cellPx);
      }
      const life = W.life?.[c] || 0;
      const bloom = Math.max(life, W.reef?.[c] || 0);
      if (sun < -0.12 && bloom > 0.14) {
        const glow = Math.min(0.28, (bloom - 0.12) * (-sun) * 0.45);
        ctx.fillStyle = `rgba(40,180,120,${glow})`;
        ctx.fillRect(x, y, cellPx, cellPx);
      }
      const storm = W.stormField?.[c] || 0;
      const trail = W.stormTrail?.[c] || 0;
      const surge = W.surgeField?.[c] || 0;
      if (trail > 0.12) {
        ctx.fillStyle = `rgba(255,190,70,${Math.min(0.34, trail * 0.4)})`;
        ctx.fillRect(x, y + cellPx * 0.4, cellPx, Math.max(1, (cellPx * 0.14) | 0));
      }
      if (storm > 0.1) {
        ctx.fillStyle = `rgba(20,52,78,${Math.min(0.4, storm * 0.34)})`;
        ctx.fillRect(x, y, cellPx, cellPx);
      }
      if (surge > 0.008) {
        ctx.fillStyle = `rgba(255,120,42,${Math.min(0.36, surge * 10)})`;
        ctx.fillRect(x, y, cellPx, cellPx);
      }
      if (still) continue;
      const cloud = W.clouds?.[c] || 0;
      if (cloud > 0.18) {
        const wu = W.windU?.[c] || 0.1;
        const shift = ((t * wu * 18) % cellPx + cellPx) % cellPx;
        ctx.fillStyle = `rgba(12,18,32,${Math.min(0.34, (cloud - 0.12) * 0.4)})`;
        ctx.beginPath();
        ctx.ellipse(
          x + cellPx * 0.45 + shift - cellPx * 0.2,
          y + cellPx * 0.42,
          cellPx * (0.42 + cloud * 0.18),
          cellPx * (0.28 + cloud * 0.12),
          0, 0, Math.PI * 2
        );
        ctx.fill();
      }
      const precip = W.precip?.[c] || 0;
      const ice = W.ice[c] || 0;
      if (precip > 0.05 && ice < 0.45 && cellPx >= 8) {
        const [dx, dy] = downhillDelta(cells, side, ix, iy, c);
        const n = precip > 0.32 ? 2 + ((precip * 3) | 0) : precip > 0.14 ? 1 + ((precip * 2) | 0) : 1;
        const a = precip < 0.12 ? precip * 0.55 : Math.min(0.42, 0.08 + precip * 0.34);
        const ptype = precipTypeAt(W, c);
        const col = ptype === 'snow' ? '220,230,248'
          : ptype === 'sleet' ? '180,210,240'
          : ptype === 'hail' ? '240,240,255'
          : '198,218,232';
        ctx.strokeStyle = `rgba(${col},${a})`;
        ctx.lineWidth = precip > 0.28 ? 1.2 : 1;
        const len = ptype === 'snow'
          ? Math.max(1, cellPx * 0.06)
          : Math.max(2, cellPx * (0.1 + precip * 0.14));
        for (let i = 0; i < n; i++) {
          const h = hash2(c, i * 17);
          const px = x + 2 + ((h + ((t * 36) | 0)) % Math.max(1, cellPx - 4));
          const py = y + (((h >> 8) + ((t * 62) | 0)) % cellPx);
          ctx.beginPath();
          if (ptype === 'snow') {
            ctx.fillStyle = `rgba(${col},${Math.min(0.5, a * 1.4)})`;
            ctx.arc(px, py, Math.max(1, cellPx * 0.04), 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.moveTo(px, py);
            ctx.lineTo(px + dx * len * 0.35, py + dy * len * 0.35 + len);
            ctx.stroke();
          }
        }
      }
      if (storm > 0.35 && sun < 0.05) {
        const flash = (hash2(c, (t * 8) | 0) & 31) === 0;
        if (flash) {
          ctx.fillStyle = 'rgba(230,240,255,0.55)';
          ctx.fillRect(x, y, cellPx, cellPx);
        }
      }

      /* LOC8-10: visibility reduction — dim cells with heavy precip/fog/dust. */
      const vis = visibilityReduction(W, c);
      if (vis > 0.08) {
        ctx.fillStyle = `rgba(160,170,180,${Math.min(0.45, vis * 0.5)})`;
        ctx.fillRect(x, y, cellPx, cellPx);
      }

      /* LOC16-18: shimmer over hot dry land in sun. */
      if (sun > 0.35 && isLand(W, c)) {
        const temp = W.temp?.[c] || 0.5;
        if (temp > 0.62 && moist < 0.25 && !still) {
          const shimA = Math.min(0.12, (temp - 0.55) * 0.4);
          const shimY = y + cellPx - 2 + Math.sin(t * 2.8 + c * 0.7) * 1.2;
          ctx.fillStyle = `rgba(255,240,200,${shimA})`;
          ctx.fillRect(x, shimY, cellPx, 2);
        }
      }

      /* LOC11-13: snow cover on ground when precipType=snow and ice present. */
      const iceV = W.ice?.[c] || 0;
      if (iceV > 0.08 && isLand(W, c)) {
        const snowA = Math.min(0.35, iceV * 0.6);
        ctx.fillStyle = `rgba(240,245,255,${snowA})`;
        ctx.fillRect(x, y, cellPx, cellPx);
      }

      /* LOC14: puddles from recent rain on wet ground. */
      const wetness = W.wetness?.[c] || (moist > 0.7 ? (moist - 0.55) * 0.6 : 0);
      if (wetness > 0.08 && isLand(W, c) && iceV < 0.1 && cellPx >= 8) {
        const puddA = Math.min(0.22, wetness * 0.35);
        const ph = hash2(c, 0xdead);
        const pr = Math.max(2, (cellPx * 0.2) | 0);
        ctx.fillStyle = `rgba(100,130,170,${puddA})`;
        ctx.beginPath();
        ctx.ellipse(
          x + (ph % Math.max(1, cellPx - pr * 2)) + pr,
          y + ((ph >> 8) % Math.max(1, cellPx - pr)) + pr,
          pr, pr * 0.5, 0, 0, Math.PI * 2
        );
        ctx.fill();
      }

      /* LOC15: frost/dew at dawn. */
      if (!still) {
        const fd = frostDewAt(W, c);
        if (fd === 'frost' && isLand(W, c)) {
          ctx.fillStyle = 'rgba(220,235,255,0.18)';
          ctx.fillRect(x, y, cellPx, cellPx);
        } else if (fd === 'dew' && isLand(W, c)) {
          ctx.fillStyle = 'rgba(180,210,190,0.10)';
          ctx.fillRect(x, y, cellPx, cellPx);
        }
      }

      /* LOC19-20: rainbow when sun opposite rain. */
      if (!still && cellPx >= 12 && rainbowAt(W, c)) {
        const rbW = cellPx * 0.8;
        const grad = ctx.createLinearGradient(x, y, x + rbW, y);
        grad.addColorStop(0, 'rgba(200,50,50,0.12)');
        grad.addColorStop(0.35, 'rgba(220,180,40,0.10)');
        grad.addColorStop(0.65, 'rgba(40,160,80,0.10)');
        grad.addColorStop(1, 'rgba(60,80,200,0.12)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, rbW, cellPx * 0.15);
      }
    }
  }
}

function stampLife(ctx, x, y, cellPx, c, desc, light, fid = 2) {
  const cls = W.lifeClass?.[c] || 0;
  const unlocked = W.unlockedClass || 0;
  const seed = hash2(c, 0x11fe);

  stampMats(ctx, x, y, cellPx, c, desc.guild, seed);
  if ((W.stromatolite?.[c] || 0) > 0.15) {
    stampStromatolites(ctx, x, y, cellPx, c, W.stromatolite[c], seed);
  }
  if (W.rule?.daisyworld || (W.blackDaisy?.[c] || 0) > 0.1 || (W.whiteDaisy?.[c] || 0) > 0.1) {
    stampDaisies(ctx, x, y, cellPx, c, seed, fid);
  }
  if (desc.sea) {
    stampOceanLife(ctx, x, y, cellPx, c, desc, cls, seed, fid);
    return;
  }
  if (desc.ice > 0.45) {
    stampIceLife(ctx, x, y, cellPx, c, desc.life, seed, fid);
    return;
  }
  if (desc.life > 0.06 && desc.build < 0.55) {
    stampFlora(ctx, x, y, cellPx, c, desc, cls, seed, light, fid);
  }
  if (unlocked >= 3 && cls >= 3 && desc.life > 0.2 && desc.build < 0.7) {
    stampAmbientFauna(ctx, x, y, cellPx, c, cls, desc.life, seed, fid);
  }
}

function stampMats(ctx, x, y, cellPx, c, guild, seed) {
  const mat = Math.max(
    W.matCover?.[c] || 0,
    (W.guildDens && guild) ? (W.guildDens[guild][c] || 0) * 0.85 : 0,
    (W.life[c] || 0) < 0.25 && (W.life[c] || 0) > 0.05 ? W.life[c] * 0.6 : 0
  );
  if (mat < 0.08) return;
  const rgb = (guild && GUILD_RGB[guild]) || (W.dominantPigment === 'retinal'
    ? [180, 50, 140]
    : W.dominantPigment === 'bchl' ? [120, 45, 110] : [40, 110, 70]);
  const step = Math.max(1, (cellPx / 10) | 0);
  const thresh = 1 - mat;
  for (let py = 0; py < cellPx; py += step) {
    for (let px = 0; px < cellPx; px += step) {
      const h = hash2(seed, (py << 8) | px) / 4294967296;
      const wave = Math.sin(px * 0.35 + py * 0.18 + stampPhase(c, 0) * 0.15) * 0.5 + 0.5;
      if (h * 0.45 + wave * 0.55 < thresh) continue;
      const a = 0.22 + mat * 0.4 + (h > 0.7 ? 0.1 : 0);
      const shade = 0.72 + h * 0.28;
      ctx.fillStyle = `rgba(${(rgb[0] * shade) | 0},${(rgb[1] * shade) | 0},${(rgb[2] * shade) | 0},${a})`;
      ctx.fillRect(x + px, y + py, step + 1, step);
    }
  }
}

function stampStromatolites(ctx, x, y, cellPx, c, strength, seed) {
  const n = Math.min(4, 1 + (strength * 3) | 0);
  for (let i = 0; i < n; i++) {
    const h = hash2(seed ^ 0x57, i);
    const sway = windSway(c, i, cellPx);
    const cx = x + 3 + (h % Math.max(1, cellPx - 6)) + sway[0];
    const baseY = y + cellPx - 2 - ((h >> 8) % Math.max(1, (cellPx * 0.2) | 0));
    const w = Math.max(3, (cellPx * (0.18 + strength * 0.12)) | 0);
    const layers = 2 + ((h >> 16) & 2);
    for (let L = 0; L < layers; L++) {
      const t = L / layers;
      ctx.fillStyle = L & 1 ? 'rgba(160,175,120,0.75)' : 'rgba(110,130,90,0.8)';
      const lw = w * (1 - t * 0.35);
      const ly = baseY - L * Math.max(2, (cellPx * 0.08) | 0);
      ctx.beginPath();
      ctx.ellipse(cx, ly, lw * 0.5, Math.max(1.5, lw * 0.22), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function stampDaisies(ctx, x, y, cellPx, c, seed, fid = 2) {
  const black = W.blackDaisy?.[c] || 0;
  const white = W.whiteDaisy?.[c] || 0;
  const place = (kind, dens, salt) => {
    const n = Math.min(fidCap(fid, 3, 6, 9), (dens * 6) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(seed ^ salt, i * 13);
      if (dens < 0.25 && (h & 3) !== 0) continue;
      const sway = windSway(c, i + salt, cellPx);
      const px = x + 2 + (h % Math.max(1, cellPx - 4)) + sway[0];
      const py = y + 2 + ((h >> 8) % Math.max(1, cellPx - 4)) + sway[1];
      drawSprite(ctx, kind, px, py, Math.max(5, cellPx * 0.32));
    }
  };
  if (black > 0.1) place(12, black, 0xb1a);
  if (white > 0.1) place(13, white, 0xb1b);
}

function stampOceanLife(ctx, x, y, cellPx, c, desc, cls, seed, fid = 2) {
  const bloom = Math.max(desc.life, desc.reef);
  const t = presentTime();
  if (bloom > 0.08) {
    const rgb = (desc.guild && GUILD_RGB[desc.guild]) || (desc.reef > 0.2 ? [30, 190, 170] : [20, 150, 140]);
    const n = Math.min(40, (2 + bloom * cellPx * 0.7) | 0);
    const drift = reducedMotion() ? 0 : (t * 6) | 0;
    for (let i = 0; i < n; i++) {
      const h = hash2(seed, i * 23);
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.2 + bloom * 0.35})`;
      ctx.fillRect(x + ((h + drift) % cellPx), y + ((h >> 8) % cellPx), 1 + (h & 1), 1 + ((h >> 2) & 1));
    }
  }
  if (desc.reef > 0.12 || desc.biome === 'reef') {
    const crest = y + cellPx * (desc.depth < 0.05 ? 0.3 : 0.48);
    ctx.fillStyle = 'rgba(70,190,175,0.16)';
    ctx.fillRect(x + 1, y + 1, cellPx - 2, crest - y);
    ctx.fillStyle = 'rgba(12,48,68,0.2)';
    ctx.fillRect(x + 1, crest, cellPx - 2, y + cellPx - crest - 1);
    ctx.fillStyle = 'rgba(240,248,255,0.16)';
    ctx.fillRect(x + 1, crest - 1, cellPx - 2, 2);
    const n = Math.min(fidCap(fid, 5, 8, 12), 2 + (desc.reef * (fid >= 3 ? 8 : 4)) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(seed ^ 0x4eef, i);
      const px = x + 2 + (i / Math.max(1, n - 1)) * (cellPx - 4);
      const py = crest + ((h >> 8) % Math.max(1, (cellPx * 0.16) | 0));
      drawSprite(ctx, 14, px, py, Math.max(5, cellPx * (0.32 + desc.reef * 0.22)));
    }
  }
  if (cls >= 4 || desc.life > 0.4) {
    const n = Math.min(fidCap(fid, 3, 5, 8), (desc.life * 4 + (cls >= 4 ? 1 : 0)) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(seed ^ 0xf15a, i);
      if ((h & 3) === 0 && desc.life < 0.35) continue;
      const swim = reducedMotion() ? 0 : Math.sin(t * 1.6 + i) * cellPx * 0.12;
      const px = x + 2 + (h % Math.max(1, cellPx - 4)) + swim;
      const py = y + 2 + ((h >> 8) % Math.max(1, cellPx - 4));
      drawSprite(ctx, 15, px, py, Math.max(4, cellPx * 0.28), { flip: swim < 0 });
    }
  }
}

function stampIceLife(ctx, x, y, cellPx, c, life, seed, fid = 2) {
  if (life < 0.1) return;
  const n = Math.min(fidCap(fid, 3, 5, 7), 1 + (life * 3) | 0);
  for (let i = 0; i < n; i++) {
    const h = hash2(seed, i * 29);
    const px = x + 2 + (h % Math.max(1, cellPx - 4));
    const py = y + 2 + ((h >> 8) % Math.max(1, cellPx - 4));
    drawSprite(ctx, 6, px, py, Math.max(4, cellPx * 0.3));
  }
}

/** Scatter flora like stands + gaps: 1–2 seed hubs, radial jitter, a few loners.
 *  Deterministic from (seed, i) so the patch doesn't shimmer every frame. */
function floraSpot(x, y, cellPx, seed, i, hubs) {
  const h = hash2(seed ^ 0x7f4a, i * 31 + 11);
  const pad = Math.max(2, cellPx * 0.12);
  const span = Math.max(1, cellPx - pad * 2);
  // ~1 in 5 trees are loners (gap regeneration / edge pioneers).
  if ((h & 7) === 0 || hubs.length === 0) {
    return {
      px: x + pad + (h % span),
      py: y + pad + ((h >>> 8) % span),
      h,
      loner: true,
    };
  }
  const hub = hubs[(h >>> 16) % hubs.length];
  // Soft Gaussian-ish clump: two independent hashes → polar offset.
  const ang = ((h >>> 4) & 1023) / 1023 * Math.PI * 2;
  const rad = Math.sqrt(((h >>> 14) & 1023) / 1023) * hub.r;
  let px = hub.x + Math.cos(ang) * rad;
  let py = hub.y + Math.sin(ang) * rad;
  // Tiny extra jitter so siblings don't stack on the same pixel.
  px += ((h & 15) - 7) * 0.35;
  py += (((h >>> 20) & 15) - 7) * 0.35;
  const lo = x + pad;
  const hi = x + cellPx - pad;
  const to = y + pad;
  const bo = y + cellPx - pad;
  return {
    px: Math.min(hi, Math.max(lo, px)),
    py: Math.min(bo, Math.max(to, py)),
    h,
    loner: false,
  };
}

function floraHubs(x, y, cellPx, seed, cover) {
  const n = cover > 0.85 ? 2 : 1;
  const hubs = [];
  const pad = cellPx * 0.22;
  const span = Math.max(1, cellPx - pad * 2);
  for (let k = 0; k < n; k++) {
    const h = hash2(seed ^ 0xc1ad, k * 97 + 3);
    hubs.push({
      x: x + pad + (h % span),
      y: y + pad + ((h >>> 10) % span),
      // Dense cover → tighter stands; open cover → looser clumps.
      r: cellPx * (0.16 + (1 - cover) * 0.22 + ((h >>> 20) & 7) * 0.01),
    });
  }
  return hubs;
}

function stampFlora(ctx, x, y, cellPx, c, desc, cls, seed, light, fid = 2) {
  const life = desc.life;
  const biome = desc.biome;
  const ph = seasonAt(c);
  const autumn = ph.autumn > 0.28 && (biome === 'tempDeciduous' || biome === 'boreal' || biome === 'tempRainforest');
  if (cls < 2 && life < 0.35) {
    const n = Math.min(fidCap(fid, 3, 6, 10), (life * 5) | 0);
    const hubs = floraHubs(x, y, cellPx, seed, Math.min(1, life * 2));
    for (let i = 0; i < n; i++) {
      const spot = floraSpot(x, y, cellPx, seed, i, hubs);
      const sway = windSway(c, i, cellPx);
      ctx.fillStyle = autumn ? 'rgba(180,110,40,0.7)' : 'rgba(90,160,60,0.7)';
      ctx.fillRect(spot.px + sway[0], spot.py + sway[1], 1, Math.max(2, (cellPx * 0.12) | 0));
    }
    return;
  }

  // Litter / understorey
  if (life > 0.2 && cellPx >= 12) {
    ctx.fillStyle = autumn ? 'rgba(70,42,22,0.26)' : 'rgba(40,50,28,0.22)';
    ctx.fillRect(x + 1, y + cellPx * 0.55, cellPx - 2, cellPx * 0.4);
  }

  const cover = Math.min(1, life * 1.1);
  if (cover > 0.62 && (biome === 'tropRainforest' || biome === 'tempRainforest' || biome === 'boreal' || life > 0.7)) {
    const crowns = fidCap(fid, 3, 5, 8) + ((cover * 3) | 0);
    const hubs = floraHubs(x, y, cellPx, seed, cover);
    for (let i = 0; i < crowns; i++) {
      const spot = floraSpot(x, y, cellPx, seed, i, hubs);
      const sway = windSway(c, i, cellPx);
      const px = spot.px + sway[0];
      const py = spot.py + sway[1];
      // Loners / edge trees run a bit smaller; hub trees a bit fuller.
      const sizeK = spot.loner ? 0.82 : (0.92 + ((spot.h >>> 12) & 7) * 0.025);
      const rw = cellPx * (0.22 + cover * 0.14) * sizeK;
      if (cellPx >= 14) castShadow(ctx, px, py + rw * 0.4, rw, light);
      const a = autumn ? (i & 1 ? 'rgba(176,92,32,0.7)' : 'rgba(148,78,28,0.65)')
        : (i & 1 ? 'rgba(28,90,48,0.72)' : 'rgba(40,110,55,0.65)');
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.ellipse(px, py, rw, rw * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  const count = Math.min(1 + (life * 5) | 0, fidCap(fid, 5, 10, 16));
  const hubs = floraHubs(x, y, cellPx, seed, cover);
  for (let i = 0; i < count; i++) {
    const spot = floraSpot(x, y, cellPx, seed, i, hubs);
    const h = spot.h;
    const sway = windSway(c, i, cellPx);
    const px = spot.px + sway[0];
    const py = spot.py + sway[1];
    let kind;
    if (biome === 'boreal' || biome === 'tundra' || biome === 'ice') kind = 1;
    else if (biome === 'desert') kind = (h & 3) === 0 ? 3 : 2;
    else if (biome === 'savanna' || biome === 'grassland') kind = (h & 3) ? 2 : 0;
    else if (biome === 'tropRainforest' || biome === 'tempRainforest') kind = (h & 1) ? 0 : 1;
    else kind = life > 0.45 ? ((h & 1) ? 0 : 1) : 2;
    const s = Math.max(5, cellPx * (0.26 + ((h >> 16) & 7) * 0.03 + (kind <= 1 ? 0.06 : 0)
      + (spot.loner ? -0.04 : 0.02)));
    if (life < 0.18 && (h & 3) !== 0) continue;
    if (cellPx >= 12) castShadow(ctx, px, py, s, light);
    drawSprite(ctx, kind, px, py, s);
    if (autumn && kind <= 1) {
      ctx.fillStyle = `rgba(210,120,36,${Math.min(0.35, ph.autumn * 0.4)})`;
      ctx.beginPath();
      ctx.ellipse(px, py - s * 0.15, s * 0.28, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if ((W.transitions?.landPlants || cls >= 2) && (biome === 'grassland' || biome === 'savanna' || biome === 'tempDeciduous')
      && (h & 7) === 0 && cellPx >= 12) {
      ctx.fillStyle = (h & 16) ? '#e8c84a' : (h & 32) ? '#e07090' : '#f0f0f8';
      ctx.fillRect(px + 2, py - 1, 2, 2);
    }
  }
}

function stampAmbientFauna(ctx, x, y, cellPx, c, cls, life, seed, fid = 2) {
  const dens = Math.min(fidCap(fid, 3, 5, 8), ((life - 0.15) * 4 + (cls - 2) * 0.4) | 0);
  const t = presentTime();
  const sun = cellSun(c);
  for (let i = 0; i < dens; i++) {
    const h = hash2(seed ^ 0xfa01, i * 41);
    if ((h & 7) > 3 + dens) continue;
    const nocturnal = (h & 16) !== 0;
    if (nocturnal ? sun > 0.08 : sun < -0.15) {
      if (cellPx < 16) continue;
      ctx.globalAlpha = 0.18;
    }
    const walk = reducedMotion() ? 0 : Math.sin(t * 1.3 + i * 1.7) * cellPx * 0.08;
    const px = x + 2 + (h % Math.max(1, cellPx - 4)) + walk;
    const py = y + 2 + ((h >> 8) % Math.max(1, cellPx - 4));
    if (cls <= 4) { stampBug(ctx, px, py, h); ctx.globalAlpha = 1; continue; }
    const kind = cls >= 7 ? 8 : 7;
    drawSprite(ctx, kind, px, py, Math.max(4, cellPx * (0.22 + cls * 0.04)), { flip: walk < 0 });
    ctx.globalAlpha = 1;
  }
}

function stampBug(ctx, px, py, h) {
  const body = (h & 16) ? '#6a4a28' : '#3a5a28';
  ctx.fillStyle = body;
  ctx.fillRect(px, py, 3, 2);
  ctx.fillStyle = 'rgba(20,20,20,0.55)';
  ctx.fillRect(px - 1, py + 1, 1, 1);
  ctx.fillRect(px + 3, py + 1, 1, 1);
  if ((h & 8) === 0) ctx.fillRect(px + 1, py - 1, 1, 1);
}

function stampBuildings(ctx, x, y, cellPx, c, build, cells, side, ix, iy, light, fid = 2) {
  const seed = hash2(c, 0xb1d);
  const n = build > 0.7 ? fidCap(fid, 3, 5, 7) : build > 0.4 ? fidCap(fid, 2, 3, 4) : 1;
  const pathCol = 'rgba(170,140,90,0.55)';
  if (build > 0.25 && cellPx >= 12) {
    ctx.fillStyle = pathCol;
    const mid = (cellPx * 0.45) | 0;
    const nbrBuild = (dx, dy) => {
      const xx = ix + dx, yy = iy + dy;
      if (xx < 0 || yy < 0 || xx >= side || yy >= side) return false;
      const ncell = cells[yy * side + xx];
      return ncell >= 0 && (W.build[ncell] || 0) > 0.12;
    };
    if (nbrBuild(0, 1) || nbrBuild(0, -1) || build > 0.25) {
      ctx.fillRect(x + mid, y + 1, Math.max(2, (cellPx * 0.12) | 0), cellPx - 2);
    }
    if (nbrBuild(1, 0) || nbrBuild(-1, 0) || build > 0.45) {
      ctx.fillRect(x + 1, y + ((cellPx * 0.55) | 0), cellPx - 2, Math.max(2, (cellPx * 0.1) | 0));
    }
  }
  if (build > 0.35 && cellPx >= 14) {
    ctx.fillStyle = 'rgba(196, 178, 96, 0.28)';
    ctx.fillRect(x + 2, y + 2, cellPx * 0.42, cellPx * 0.38);
    ctx.strokeStyle = 'rgba(120,100,60,0.35)';
    ctx.strokeRect(x + 2, y + 2, cellPx * 0.42, cellPx * 0.38);
  }
  for (let i = 0; i < n; i++) {
    const h = hash2(seed, i + 1);
    const bw = Math.max(4, (cellPx * (0.28 + build * 0.12)) | 0);
    const bh = Math.max(5, (bw * (0.7 + ((h & 7) * 0.05))) | 0);
    const bx = x + 2 + (h % Math.max(1, cellPx - bw - 3));
    const by = y + cellPx - bh - 2 - ((h >> 8) % Math.max(1, (cellPx * 0.18) | 0));
    if (cellPx >= 12) castShadow(ctx, bx + bw * 0.5, by + bh, bw, light);
    const wall = build > 0.55 ? '#c8b8a0' : '#b89a70';
    const roof = build > 0.55 ? '#c04038' : '#8c5b3d';
    ctx.fillStyle = wall;
    ctx.fillRect(bx, by + (bh * 0.35) | 0, bw, (bh * 0.65) | 0);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(bx - 1, by + (bh * 0.38) | 0);
    ctx.lineTo(bx + bw * 0.5, by);
    ctx.lineTo(bx + bw + 1, by + (bh * 0.38) | 0);
    ctx.closePath();
    ctx.fill();
    if (bw >= 6) {
      const lit = light?.lights > 0.2;
      const flicker = lit && ((hash2(c, i + ((presentTime() * 7) | 0)) & 7) !== 0);
      ctx.fillStyle = flicker ? '#f4d478' : '#5d4530';
      const dw = Math.max(1, (bw * 0.22) | 0);
      ctx.fillRect(bx + ((bw - dw) / 2) | 0, by + bh - ((bh * 0.35) | 0), dw, (bh * 0.35) | 0);
    }
  }
}

function drawScaleBar(ctx, ox, oy, cellPx, side, dpr, censusLine) {
  const { km, named, earthLike } = patchScale(side, W.rule);
  const barCells = Math.max(1, Math.round(side * 0.28));
  const bw = barCells * cellPx;
  const x = ox + 6 * dpr;
  const y = oy + side * cellPx - 10 * dpr;
  const font = `${Math.max(8, 9 * dpr)}px ui-monospace, Menlo, monospace`;
  ctx.font = font;
  const kmText = earthLike ? `${km | 0} km · ${named}` : `${km | 0} km · ${named} patch`;
  const extra = censusLine ? Math.round(12 * dpr) : 0;
  const tw = Math.max(bw + 8, ctx.measureText(censusLine || kmText).width + 10, ctx.measureText(kmText).width + 10);
  ctx.fillStyle = 'rgba(6,8,14,0.55)';
  ctx.fillRect(x - 3, y - 10 - extra, tw, 16 + extra);
  ctx.strokeStyle = 'rgba(230,236,248,0.75)';
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + bw, y);
  ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
  ctx.moveTo(x + bw, y - 3); ctx.lineTo(x + bw, y + 3);
  ctx.stroke();
  ctx.fillStyle = 'rgba(220,228,240,0.85)';
  ctx.fillText(kmText, x, y - 4);
  if (censusLine) {
    ctx.fillStyle = 'rgba(158,232,196,0.95)';
    ctx.fillText(censusLine, x, y - 4 - extra + Math.round(2 * dpr));
  }
}

function drawKindGlyph(ctx, cx, cy, cellPx, kind) {
  const r = Math.max(1.8, cellPx * (kind === 5 ? 0.3 : kind <= 2 ? 0.22 : 0.2));
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(8,12,18,0.78)';
  ctx.lineWidth = Math.max(1.2, cellPx * 0.1);
  const path = () => {
    if (kind <= 2) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.7, cy + r * 0.6);
      ctx.lineTo(cx - r * 0.7, cy + r * 0.6);
      ctx.closePath();
    } else if (kind === 5) {
      ctx.beginPath();
      ctx.rect(cx - r * 0.7, cy - r * 0.7, r * 1.4, r * 1.4);
    } else if (kind === 14 || kind === 15) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.1, r * 0.55, 0, 0, Math.PI * 2);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
  };
  path();
  ctx.stroke();
  path();
  ctx.fill();
  if (kind >= 6 && kind <= 8) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

/** Small posture mark — hunt wedge, flee dashes, forage leaf, tend square. */
function drawActMark(ctx, cx, cy, size, m, dpr) {
  const behav = m.behav;
  if (!behav || behav === 'rest') return;
  const s = Math.max(3, size * 0.42);
  ctx.save();
  ctx.lineWidth = Math.max(1, dpr * 0.9);
  ctx.lineCap = 'round';
  if (behav === 'hunt') {
    ctx.strokeStyle = 'rgba(255,70,55,0.9)';
    ctx.fillStyle = 'rgba(255,70,55,0.55)';
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.9, cy);
    ctx.lineTo(cx - s * 0.55, cy - s * 0.55);
    ctx.lineTo(cx - s * 0.55, cy + s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (behav === 'flee') {
    ctx.strokeStyle = 'rgba(255,170,70,0.9)';
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s * 0.35);
    ctx.lineTo(cx + s * 0.2, cy - s * 0.55);
    ctx.moveTo(cx - s, cy + s * 0.35);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.55);
    ctx.stroke();
  } else if (behav === 'forage') {
    ctx.strokeStyle = 'rgba(120,230,110,0.85)';
    ctx.beginPath();
    ctx.arc(cx + s * 0.55, cy - s * 0.55, s * 0.35, 0, Math.PI * 2);
    ctx.stroke();
    if ((m.hunger || 0) < 0.35) {
      ctx.fillStyle = 'rgba(90,200,80,0.55)';
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.45, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (behav === 'tend') {
    ctx.strokeStyle = 'rgba(240,210,80,0.85)';
    ctx.strokeRect(cx - s * 0.35, cy - s * 0.35, s * 0.7, s * 0.7);
  } else if (behav === 'surface') {
    ctx.strokeStyle = 'rgba(80,200,255,0.8)';
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.2, s * 0.55, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLifeSparks(ctx, cellToXY, ox, oy, cellPx, dpr) {
  const sparks = W.lifeSparks;
  if (!sparks?.length) return;
  for (const sp of sparks) {
    const xy = cellToXY.get(sp.cell);
    if (!xy) continue;
    const u = Math.min(1, (sp.t || 0) / 28);
    const cx = ox + xy[0] * cellPx + cellPx * 0.5;
    const cy = oy + xy[1] * cellPx + cellPx * 0.5;
    const r = cellPx * (0.18 + u * 0.55);
    ctx.save();
    ctx.globalAlpha = (1 - u) * 0.85;
    ctx.lineWidth = Math.max(1, dpr);
    if (sp.kind === 'birth') ctx.strokeStyle = 'rgba(140,255,180,0.95)';
    else if (sp.kind === 'hunt') ctx.strokeStyle = 'rgba(255,90,70,0.95)';
    else ctx.strokeStyle = 'rgba(200,120,255,0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
