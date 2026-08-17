/** Flat local patch view — unwraps a neighborhood of cells into a square map. */

import { NC, NBR } from './sphere.js';
import { W } from './world.js';
import { ENT } from './agents.js';
import { BIOMES } from './sim/ecology.js';
import { lifeRGB, oceanLifeRGB, lifeLabel, KIND_RGB, legendEntries, dominantGuildAt, GUILD_RGB, legendKeyAt } from './sim/lifeColour.js';
import { drawSprite } from './sprites.js';

export const LOCAL_SIZES = [200, 280, 380, 500];
export const LOCAL_SIZE_LABELS = ['S', 'M', 'L', 'XL'];
export const LOCAL_SNAPS = ['tl', 'tr', 'bl', 'br'];
export const LOCAL_GLOBE = ['off', 'rim', 'wash', 'both'];
/** Patch radius — larger = more cells = finer / wider view on a big canvas. */
export const LOCAL_RADII = [3, 5, 8, 12, 18, 28];
/** Side length in cells (2r+1) — higher = wider / finer tiles on a large map. */
export const LOCAL_RADIUS_LABELS = ['7', '11', '17', '25', '37', '57'];

/** Discrete frame steps: corner sizes then full. Grows from the snap corner. */
export function localFrameIndex(size, expanded) {
  if (expanded) return LOCAL_SIZES.length;
  const i = LOCAL_SIZES.indexOf(size | 0);
  return i >= 0 ? i : 1;
}

export function localFrameLabel(size, expanded) {
  if (expanded) return 'Full';
  const i = LOCAL_SIZES.indexOf(size | 0);
  return LOCAL_SIZE_LABELS[i >= 0 ? i : 1] || 'M';
}

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
  return NBR[focus * 4] ?? focus;
}

/** Hit-test a pixel inside the local canvas against the last drawn patch. */
export function cellAtLocalPixel(patch, layout, px, py) {
  if (!patch || !layout) return -1;
  const dpr = layout.dpr || 1;
  const ix = Math.floor((px * dpr - layout.ox) / layout.cellPx);
  const iy = Math.floor((py * dpr - layout.oy) / layout.cellPx);
  if (ix < 0 || iy < 0 || ix >= patch.side || iy >= patch.side) return -1;
  return patch.cells[iy * patch.side + ix];
}

/**
 * BFS unwrap: assign integer (x,y) to cells around focus.
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

function cellColor(c, highlightGuild = null) {
  if (c < 0) return '#0a0c12';
  const isSea = W.h[c] < W.seaLevel;
  let base;
  if (isSea) {
    const depth = W.seaLevel - W.h[c];
    const bloom = Math.max(W.life[c], W.reef[c] || 0);
    if (bloom > 0.12) {
      const rgb = oceanLifeRGB(W, c, Math.min(1, bloom));
      base = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    } else if (depth < 0.06) base = '#2a6a8a';
    else if (depth < 0.15) base = '#1a4a6c';
    else base = '#12283c';
  } else {
    const build = W.build[c] || 0;
    const ice = W.ice[c];
    if (ice > 0.45) base = '#d8e4f0';
    else if (build > 0.15) {
      const k = Math.min(1, build);
      base = `rgb(${(168 - k * 70) | 0},${(148 - k * 55) | 0},${(120 - k * 40) | 0})`;
    } else {
      const life = W.life[c];
      const live = lifeRGB(W, c, life);
      if (live) base = `rgb(${live[0]},${live[1]},${live[2]})`;
      else {
        const moist = W.moist[c];
        const biome = W.biome ? BIOMES[W.biome[c]] : null;
        if (biome === 'desert' || moist < 0.18) base = '#b89460';
        else if (biome === 'tundra') base = '#8a9088';
        else if (moist < 0.28) base = '#9a8860';
        else base = '#6a6458';
      }
    }
  }

  if (highlightGuild && W.guildDens?.[highlightGuild]) {
    const dens = W.guildDens[highlightGuild][c] || 0;
    if (dens > 0.06) {
      const rgb = GUILD_RGB[highlightGuild];
      if (rgb) {
        const k = 0.45 + dens * 0.5;
        return `rgb(${(parseRGB(base)[0] * (1 - k) + rgb[0] * k) | 0},${(parseRGB(base)[1] * (1 - k) + rgb[1] * k) | 0},${(parseRGB(base)[2] * (1 - k) + rgb[2] * k) | 0})`;
      }
    }
    // Dim non-matching
    const rgb = parseRGB(base);
    return `rgb(${(rgb[0] * 0.35) | 0},${(rgb[1] * 0.35) | 0},${(rgb[2] * 0.38) | 0})`;
  }
  return base;
}

function parseRGB(s) {
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = s.match(/(\d+)/g);
  return m ? [+m[0], +m[1], +m[2]] : [80, 80, 80];
}

/** Apply snap + size to the floating Local panel and canvas.
 * Corner snaps keep the docked corner fixed — the free corner grows/shrinks. */
export function layoutLocalPanel(panel, cvs, opts) {
  if (!panel || !cvs) return;
  const expanded = !!opts.expanded;
  const snap = opts.snap || 'br';
  panel.classList.toggle('expanded', expanded);
  panel.classList.remove('snap-tl', 'snap-tr', 'snap-bl', 'snap-br');
  if (!expanded) panel.classList.add('snap-' + snap);
  panel.dataset.frame = localFrameLabel(opts.size, expanded);

  let size = opts.size | 0;
  if (expanded) {
    const pad = 40;
    const chrome = 56; // legend + status
    const sideW = Math.min(innerWidth - pad * 2, innerHeight - 100 - chrome);
    size = Math.max(360, Math.min(920, sideW | 0));
  }
  cvs.style.width = size + 'px';
  cvs.style.height = size + 'px';
  // Hi-DPI backing store so fine zooms stay sharp
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const px = Math.round(size * dpr);
  if (cvs.width !== px || cvs.height !== px) {
    cvs.width = px;
    cvs.height = px;
  }
  cvs._cssSize = size;
  cvs._dpr = dpr;
  return size;
}

/** Map pixel (css) → cell, or -1. */
export function hoverCellAt(patch, cssX, cssY) {
  if (!patch?.layout) return -1;
  const { ox, oy, cellPx, dpr = 1 } = patch.layout;
  const x = cssX * dpr;
  const y = cssY * dpr;
  const ix = Math.floor((x - ox) / cellPx);
  const iy = Math.floor((y - oy) / cellPx);
  if (ix < 0 || iy < 0 || ix >= patch.side || iy >= patch.side) return -1;
  return patch.cells[iy * patch.side + ix];
}

/** Draw the flat patch into a 2D canvas. Returns patch descriptor for globe highlight. */
export function drawLocalView(cvs, inspect, opts = {}) {
  if (!cvs) return null;
  const radius = opts.radius ?? 8;
  const pin = opts.pin ?? -1;
  const hoverKey = opts.hoverKey || null;
  const hoverCell = opts.hoverCell ?? -1;
  const ctx = cvs.getContext('2d');
  const Wpx = cvs.width, Hpx = cvs.height;
  const dpr = cvs._dpr || 1;
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, Wpx, Hpx);

  const highlightGuild = opts.highlightGuild || null;
  const focus = pickFocusCell(inspect, pin);
  const patch = unwrapPatch(focus, radius);
  const { cells, side } = patch;
  // Map uses full canvas — legend/status live in HTML
  const pad = Math.max(4, (4 * dpr) | 0);
  const cellPx = Math.max(1, Math.floor((Math.min(Wpx, Hpx) - pad * 2) / side));
  const ox = ((Wpx - side * cellPx) / 2) | 0;
  const oy = ((Hpx - side * cellPx) / 2) | 0;
  patch.layout = { cellPx, ox, oy, Wpx, Hpx, dpr, cssSize: cvs._cssSize || Wpx / dpr };

  const hiFi = cellPx >= 10;
  ctx.imageSmoothingEnabled = !hiFi;

  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      const key = c >= 0 ? legendKeyAt(W, c) : null;
      let col = cellColor(c, highlightGuild);
      if (hoverKey && key && key !== hoverKey) {
        const rgb = parseRGB(col);
        col = `rgb(${(rgb[0] * 0.28) | 0},${(rgb[1] * 0.28) | 0},${(rgb[2] * 0.32) | 0})`;
      }
      const x = ox + ix * cellPx;
      const y = oy + iy * cellPx;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, cellPx, cellPx);

      if (c >= 0 && cellPx >= 6) {
        paintCellDetail(ctx, x, y, cellPx, c, col);
      }

      if (c >= 0 && cellPx >= 4) {
        const living = (W.life[c] || 0) > 0.04
          || (W.reef?.[c] || 0) > 0.12
          || (W.stromatolite?.[c] || 0) > 0.15
          || (W.matCover?.[c] || 0) > 0.1
          || (W.blackDaisy?.[c] || 0) > 0.1
          || (W.whiteDaisy?.[c] || 0) > 0.1
          || !!dominantGuildAt(W, c);
        if (living) {
          if (hiFi) stampLife(ctx, x, y, cellPx, c);
          else if (W.h[c] >= W.seaLevel && W.life[c] > 0.08 && W.ice[c] < 0.4 && (W.build[c] || 0) < 0.35) {
            ditherCell(ctx, x, y, cellPx, c, W.life[c]);
          }
        }
      }

      if (c >= 0 && W.build[c] > 0.12) {
        if (hiFi) stampBuildings(ctx, x, y, cellPx, c, W.build[c]);
        else {
          const h = Math.max(2, (W.build[c] * cellPx * 0.85) | 0);
          ctx.fillStyle = 'rgba(255,220,160,0.85)';
          ctx.fillRect(x + cellPx * 0.25, y + cellPx - h - 1, cellPx * 0.5, h);
        }
      }

      // Hover cell outline
      if (c >= 0 && c === hoverCell && cellPx >= 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(1, dpr);
        ctx.strokeRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
      }
    }
  }

  // Soft grid only when cells are coarse; hi-fi pixels read better without lines
  if (cellPx >= 4 && cellPx < 14) {
    ctx.strokeStyle = 'rgba(140,180,255,0.10)';
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
  }

  const cellToXY = new Map();
  for (let iy = 0; iy < side; iy++) {
    for (let ix = 0; ix < side; ix++) {
      const c = cells[iy * side + ix];
      if (c >= 0) cellToXY.set(c, [ix, iy]);
    }
  }
  // Jitter multiple agents in the same cell so they don't stack
  const cellCounts = new Map();
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m) continue;
    const xy = cellToXY.get(m.cell);
    if (!xy) continue;
    const [ix, iy] = xy;
    const n = cellCounts.get(m.cell) || 0;
    cellCounts.set(m.cell, n + 1);
    const h = hash2(m.cell, n);
    const jx = ((h & 255) / 255 - 0.5) * cellPx * 0.55;
    const jy = (((h >> 8) & 255) / 255 - 0.5) * cellPx * 0.55;
    const cx = ox + ix * cellPx + cellPx * 0.5 + jx;
    const cy = oy + iy * cellPx + cellPx * 0.5 + jy;
    const planScale = m.plan?.size ? Math.min(1.35, 0.55 + m.plan.size * 0.35) : 1;
    const size = Math.max(4, cellPx * (m.kind === 5 ? 0.72 : m.kind <= 3 ? 0.78 : m.kind >= 14 ? 0.55 : 0.62) * planScale);
    if (hiFi) drawSprite(ctx, m.kind, cx, cy, size);
    else {
      const rgb = KIND_RGB[m.kind] || [125, 255, 106];
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      drawKindGlyph(ctx, cx, cy, cellPx, m.kind);
    }
  }

  const fx = ox + radius * cellPx + cellPx * 0.5;
  const fy = oy + radius * cellPx + cellPx * 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1.5, dpr);
  ctx.beginPath();
  ctx.moveTo(fx - cellPx, fy); ctx.lineTo(fx + cellPx, fy);
  ctx.moveTo(fx, fy - cellPx); ctx.lineTo(fx, fy + cellPx);
  ctx.stroke();

  // Status for HTML strip
  const statusCell = hoverCell >= 0 ? hoverCell : focus;
  const life = W.life[statusCell] || 0;
  const build = W.build[statusCell] || 0;
  const label = lifeLabel(W, statusCell);
  const biome = W.biome ? BIOMES[W.biome[statusCell]] : '';
  const guild = dominantGuildAt(W, statusCell);
  const pinned = pin >= 0;
  patch.status = {
    pinned,
    cell: statusCell,
    life,
    build,
    label,
    biome,
    guild,
    key: legendKeyAt(W, statusCell),
    zoom: radius,
    side,
  };
  return patch;
}

function ditherCell(ctx, x, y, cellPx, c, life) {
  const biome = W.biome ? BIOMES[W.biome[c]] : null;
  const n = ((c * 1103515245) >>> 0);
  const dots = Math.min(cellPx * cellPx * 0.12, 6 + (life * 8) | 0);
  for (let i = 0; i < dots; i++) {
    const h = ((n + i * 9973) >>> 0);
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

function hash2(a, b) {
  let h = ((a * 374761393) ^ (b * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function touchesSea(c) {
  for (let k = 0; k < 4; k++) {
    const n = NBR[c * 4 + k];
    if (n >= 0 && W.h[n] < W.seaLevel) return true;
  }
  return false;
}

/** WorldBox-style sub-cell texture from moisture, ice, ash, coast, biome. */
function paintCellDetail(ctx, x, y, cellPx, c, baseCol) {
  const isSea = W.h[c] < W.seaLevel;
  const ice = W.ice[c] || 0;
  const ash = W.ash?.[c] || 0;
  const dust = W.dust?.[c] || 0;
  const moist = W.moist[c] || 0;
  const biome = W.biome ? BIOMES[W.biome[c]] : null;
  const base = parseRGB(baseCol);
  const step = Math.max(1, (cellPx / 8) | 0);
  const seed = hash2(c, (W.seed | 0) ^ 0x9e3779b9);

  if (isSea) {
    const depth = W.seaLevel - W.h[c];
    // Shallows sparkle + deeper bands
    for (let py = 0; py < cellPx; py += step) {
      for (let px = 0; px < cellPx; px += step) {
        const h = hash2(seed, (py << 8) | px);
        if (depth < 0.08 && (h & 7) === 0) {
          ctx.fillStyle = 'rgba(160,210,230,0.35)';
          ctx.fillRect(x + px, y + py, step, step);
        } else if ((h & 15) === 0) {
          ctx.fillStyle = 'rgba(20,50,80,0.22)';
          ctx.fillRect(x + px, y + py, step, step);
        }
      }
    }
    if (ice > 0.35) {
      ctx.fillStyle = `rgba(220,235,250,${0.25 + ice * 0.45})`;
      ctx.fillRect(x + 1, y + 1, cellPx - 2, cellPx - 2);
    }
    return;
  }

  // Coastal sand fringe
  if (touchesSea(c) && ice < 0.35 && (W.build[c] || 0) < 0.2) {
    ctx.fillStyle = 'rgba(214,190,120,0.55)';
    const fringe = Math.max(1, (cellPx * 0.22) | 0);
    ctx.fillRect(x, y + cellPx - fringe, cellPx, fringe);
  }

  // Biome / moisture micro-pixels
  const dens = Math.min(0.22, 0.04 + moist * 0.12 + (W.life[c] || 0) * 0.06);
  const nPix = Math.min(((cellPx * cellPx * dens) / (step * step)) | 0, 48);
  for (let i = 0; i < nPix; i++) {
    const h = hash2(seed, i * 131);
    const px = x + (h % cellPx);
    const py = y + ((h >> 8) % cellPx);
    let r = base[0], g = base[1], b = base[2];
    if (ice > 0.4) {
      r = 210 + (h & 31); g = 220 + ((h >> 3) & 27); b = 235 + ((h >> 6) & 19);
    } else if (biome === 'desert' || moist < 0.18) {
      r = Math.min(255, r + 18); g = Math.min(255, g + 8); b = Math.max(0, b - 10);
    } else if (biome === 'boreal' || biome === 'tundra') {
      r = Math.max(0, r - 12); g = Math.min(255, g + 8); b = Math.min(255, b + 6);
    } else if ((h & 3) === 0) {
      r = Math.max(0, r - 14); g = Math.min(255, g + 16); b = Math.max(0, b - 10);
    } else {
      r = Math.min(255, r + 10); g = Math.min(255, g + 14); b = Math.max(0, b - 6);
    }
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.fillRect(px, py, step, step);
  }

  if (ash > 0.08) {
    ctx.fillStyle = `rgba(55,52,48,${Math.min(0.55, ash * 0.7)})`;
    for (let i = 0; i < 4 + (ash * 10) | 0; i++) {
      const h = hash2(seed ^ 0x55, i);
      ctx.fillRect(x + (h % cellPx), y + ((h >> 8) % cellPx), step, step);
    }
  }
  if (dust > 0.12) {
    ctx.fillStyle = `rgba(180,150,100,${Math.min(0.4, dust * 0.5)})`;
    ctx.fillRect(x, y, cellPx, cellPx);
  }
}

/** Multi-pixel life for every rung — mats → flora → fauna → ocean → daisies. */
function stampLife(ctx, x, y, cellPx, c) {
  const isSea = W.h[c] < W.seaLevel;
  const life = W.life[c] || 0;
  const cls = W.lifeClass?.[c] || 0;
  const unlocked = W.unlockedClass || 0;
  const biome = W.biome ? BIOMES[W.biome[c]] : null;
  const guild = dominantGuildAt(W, c);
  const ice = W.ice[c] || 0;
  const build = W.build[c] || 0;
  const seed = hash2(c, 0x11fe);

  // 1) Microbial / guild mats (Archean → modern understory)
  stampMats(ctx, x, y, cellPx, c, guild, seed);

  // 2) Stromatolites as layered domes
  if ((W.stromatolite?.[c] || 0) > 0.15) {
    stampStromatolites(ctx, x, y, cellPx, c, W.stromatolite[c], seed);
  }

  // 3) Daisyworld
  if (W.rule?.daisyworld || (W.blackDaisy?.[c] || 0) > 0.1 || (W.whiteDaisy?.[c] || 0) > 0.1) {
    stampDaisies(ctx, x, y, cellPx, c, seed);
  }

  if (isSea) {
    stampOceanLife(ctx, x, y, cellPx, c, life, cls, guild, seed);
    return;
  }

  if (ice > 0.45) {
    stampIceLife(ctx, x, y, cellPx, c, life, seed);
    return;
  }

  // 4) Land flora — skip heavy canopy under dense towns
  if (life > 0.06 && build < 0.55) {
    stampFlora(ctx, x, y, cellPx, c, life, biome, cls, seed);
  }

  // 5) Ambient fauna by morphology class (fills gaps ENT density misses)
  if (unlocked >= 3 && cls >= 3 && life > 0.2 && build < 0.7) {
    stampAmbientFauna(ctx, x, y, cellPx, c, cls, life, seed);
  }
}

function guildRGB(guild) {
  if (!guild) return null;
  const rgb = GUILD_RGB[guild];
  return rgb || null;
}

/** Pixel-mat carpet coloured by dominant redox guild / pigment. */
function stampMats(ctx, x, y, cellPx, c, guild, seed) {
  const mat = Math.max(
    W.matCover?.[c] || 0,
    (W.guildDens && guild) ? (W.guildDens[guild][c] || 0) * 0.85 : 0,
    (W.life[c] || 0) < 0.25 && (W.life[c] || 0) > 0.05 ? W.life[c] * 0.6 : 0
  );
  if (mat < 0.08) return;
  const rgb = guildRGB(guild) || (W.dominantPigment === 'retinal'
    ? [180, 50, 140]
    : W.dominantPigment === 'bchl' ? [120, 45, 110] : [40, 110, 70]);
  const step = Math.max(1, (cellPx / 10) | 0);
  const n = Math.min(60, (2 + mat * cellPx * 0.9) | 0);
  for (let i = 0; i < n; i++) {
    const h = hash2(seed, i * 19);
    const px = x + (h % cellPx);
    const py = y + ((h >> 8) % cellPx);
    const a = 0.25 + mat * 0.45 + ((h >> 16) & 1) * 0.1;
    const shade = 0.75 + ((h >> 17) & 3) * 0.08;
    ctx.fillStyle = `rgba(${(rgb[0] * shade) | 0},${(rgb[1] * shade) | 0},${(rgb[2] * shade) | 0},${a})`;
    ctx.fillRect(px, py, step + ((h >> 20) & 1), step);
  }
}

function stampStromatolites(ctx, x, y, cellPx, c, strength, seed) {
  const n = Math.min(4, 1 + (strength * 3) | 0);
  for (let i = 0; i < n; i++) {
    const h = hash2(seed ^ 0x57, i);
    const cx = x + 3 + (h % Math.max(1, cellPx - 6));
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

function stampDaisies(ctx, x, y, cellPx, c, seed) {
  const black = W.blackDaisy?.[c] || 0;
  const white = W.whiteDaisy?.[c] || 0;
  const place = (kind, dens, salt) => {
    const n = Math.min(cellPx >= 20 ? 5 : 3, (dens * 6) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(seed ^ salt, i * 13);
      if (dens < 0.25 && (h & 3) !== 0) continue;
      const px = x + 2 + (h % Math.max(1, cellPx - 4));
      const py = y + 2 + ((h >> 8) % Math.max(1, cellPx - 4));
      drawSprite(ctx, kind, px, py, Math.max(5, cellPx * 0.32));
    }
  };
  if (black > 0.1) place(12, black, 0xb1a);
  if (white > 0.1) place(13, white, 0xb1b);
}

function stampOceanLife(ctx, x, y, cellPx, c, life, cls, guild, seed) {
  const reef = W.reef?.[c] || 0;
  const bloom = Math.max(life, reef);

  // Phytoplankton / pigment flecks
  if (bloom > 0.08) {
    const rgb = guildRGB(guild) || (reef > 0.2 ? [30, 190, 170] : [20, 150, 140]);
    const n = Math.min(40, (2 + bloom * cellPx * 0.7) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(seed, i * 23);
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.2 + bloom * 0.35})`;
      ctx.fillRect(x + (h % cellPx), y + ((h >> 8) % cellPx), 1 + (h & 1), 1 + ((h >> 2) & 1));
    }
  }

  // Reef structures
  if (reef > 0.15 || (life > 0.3 && (W.biome ? BIOMES[W.biome[c]] : '') === 'reef')) {
    const n = Math.min(4, 1 + (reef * 5) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(seed ^ 0x4eef, i);
      const px = x + 2 + (h % Math.max(1, cellPx - 4));
      const py = y + cellPx * 0.35 + ((h >> 8) % Math.max(1, (cellPx * 0.5) | 0));
      drawSprite(ctx, 14, px, py, Math.max(5, cellPx * (0.35 + reef * 0.25)));
    }
  }

  // Fish / marine fauna when morphology allows
  if (cls >= 4 || life > 0.4) {
    const n = Math.min(3, (life * 4 + (cls >= 4 ? 1 : 0)) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(seed ^ 0xf15a, i);
      if ((h & 3) === 0 && life < 0.35) continue;
      const px = x + 2 + (h % Math.max(1, cellPx - 4));
      const py = y + 2 + ((h >> 8) % Math.max(1, cellPx - 4));
      drawSprite(ctx, 15, px, py, Math.max(4, cellPx * 0.28));
    }
  }
}

function stampIceLife(ctx, x, y, cellPx, c, life, seed) {
  if (life < 0.1) return;
  const n = Math.min(3, 1 + (life * 3) | 0);
  for (let i = 0; i < n; i++) {
    const h = hash2(seed, i * 29);
    const px = x + 2 + (h % Math.max(1, cellPx - 4));
    const py = y + 2 + ((h >> 8) % Math.max(1, cellPx - 4));
    drawSprite(ctx, 6, px, py, Math.max(4, cellPx * 0.3));
  }
}

/** Multi-pixel flora stamps — trees / grass / flowers / sparse understory. */
function stampFlora(ctx, x, y, cellPx, c, life, biome, cls, seed) {
  // Early life: skip canopy sprites — mats already carry the read
  if (cls < 2 && life < 0.35) {
    // Sparse sprouts only
    const n = Math.min(3, (life * 5) | 0);
    for (let i = 0; i < n; i++) {
      const h = hash2(seed, i * 17);
      ctx.fillStyle = 'rgba(90,160,60,0.7)';
      const px = x + (h % cellPx);
      const py = y + ((h >> 8) % cellPx);
      ctx.fillRect(px, py, 1, Math.max(2, (cellPx * 0.12) | 0));
    }
    return;
  }

  const count = Math.min(1 + (life * 5) | 0, cellPx >= 20 ? 7 : 5);
  for (let i = 0; i < count; i++) {
    const h = hash2(seed, i * 17);
    const px = x + 2 + (h % Math.max(1, cellPx - 4));
    const py = y + 2 + ((h >> 8) % Math.max(1, cellPx - 4));
    let kind;
    if (biome === 'boreal' || biome === 'tundra' || biome === 'ice') kind = 1;
    else if (biome === 'desert') kind = (h & 3) === 0 ? 3 : 2;
    else if (biome === 'savanna' || biome === 'grassland') kind = (h & 3) ? 2 : 0;
    else if (biome === 'tropRainforest' || biome === 'tempRainforest') kind = (h & 1) ? 0 : 1;
    else kind = life > 0.45 ? ((h & 1) ? 0 : 1) : 2;

    const s = Math.max(5, cellPx * (0.26 + ((h >> 16) & 7) * 0.03 + (kind <= 1 ? 0.06 : 0)));
    if (life < 0.18 && (h & 3) !== 0) continue;
    drawSprite(ctx, kind, px, py, s);

    // Flower flecks once angiosperms exist
    if ((W.transitions?.landPlants || cls >= 2) && (biome === 'grassland' || biome === 'savanna' || biome === 'tempDeciduous')
      && (h & 7) === 0 && cellPx >= 12) {
      ctx.fillStyle = (h & 16) ? '#e8c84a' : (h & 32) ? '#e07090' : '#f0f0f8';
      ctx.fillRect(px + 2, py - 1, 2, 2);
    }
  }
}

/** Fauna silhouettes by lifeClass — arthropod → mammal. */
function stampAmbientFauna(ctx, x, y, cellPx, c, cls, life, seed) {
  const dens = Math.min(3, ((life - 0.15) * 4 + (cls - 2) * 0.4) | 0);
  for (let i = 0; i < dens; i++) {
    const h = hash2(seed ^ 0xfa01, i * 41);
    // Sparse enough that ENT sprites stay primary
    if ((h & 7) > 3 + dens) continue;
    const px = x + 2 + (h % Math.max(1, cellPx - 4));
    const py = y + 2 + ((h >> 8) % Math.max(1, cellPx - 4));
    // Land arthropods / early land animals: tiny multi-pixel bugs
    if (cls <= 4) {
      stampBug(ctx, px, py, h);
      continue;
    }
    let kind;
    if (cls >= 7) kind = 8;      // mammal
    else if (cls >= 6) kind = 7; // reptile / large
    else kind = 8;               // amphibian-ish
    const s = Math.max(4, cellPx * (0.22 + cls * 0.04));
    drawSprite(ctx, kind, px, py, s);
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

/** House / hut / town silhouettes from build intensity. */
function stampBuildings(ctx, x, y, cellPx, c, build) {
  const seed = hash2(c, 0xb1d);
  const n = build > 0.7 ? 3 : build > 0.4 ? 2 : 1;
  const pathCol = 'rgba(170,140,90,0.55)';
  // Dirt path through the cell
  if (build > 0.25 && cellPx >= 12) {
    ctx.fillStyle = pathCol;
    const mid = (cellPx * 0.45) | 0;
    ctx.fillRect(x + mid, y + 1, Math.max(2, (cellPx * 0.12) | 0), cellPx - 2);
    if (build > 0.45) {
      ctx.fillRect(x + 1, y + ((cellPx * 0.55) | 0), cellPx - 2, Math.max(2, (cellPx * 0.1) | 0));
    }
  }
  for (let i = 0; i < n; i++) {
    const h = hash2(seed, i + 1);
    const bw = Math.max(4, (cellPx * (0.28 + build * 0.12)) | 0);
    const bh = Math.max(5, (bw * (0.7 + ((h & 7) * 0.05))) | 0);
    const bx = x + 2 + (h % Math.max(1, cellPx - bw - 3));
    const by = y + cellPx - bh - 2 - ((h >> 8) % Math.max(1, (cellPx * 0.25) | 0));
    // Walls
    const wall = build > 0.55 ? '#c8b8a0' : '#b89a70';
    const roof = build > 0.55 ? '#c04038' : '#8c5b3d';
    ctx.fillStyle = wall;
    ctx.fillRect(bx, by + (bh * 0.35) | 0, bw, (bh * 0.65) | 0);
    // Roof triangle
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(bx - 1, by + (bh * 0.38) | 0);
    ctx.lineTo(bx + bw * 0.5, by);
    ctx.lineTo(bx + bw + 1, by + (bh * 0.38) | 0);
    ctx.closePath();
    ctx.fill();
    // Door
    if (bw >= 6) {
      ctx.fillStyle = '#5d4530';
      const dw = Math.max(1, (bw * 0.22) | 0);
      ctx.fillRect(bx + ((bw - dw) / 2) | 0, by + bh - ((bh * 0.35) | 0), dw, (bh * 0.35) | 0);
    }
  }
}

function drawKindGlyph(ctx, cx, cy, cellPx, kind) {
  const r = Math.max(1.5, cellPx * (kind === 5 ? 0.28 : kind <= 2 ? 0.2 : 0.18));
  if (kind <= 2) {
    // Plant — triangle / diamond
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.7, cy + r * 0.6);
    ctx.lineTo(cx - r * 0.7, cy + r * 0.6);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 5) {
    // Settler — square
    ctx.fillRect(cx - r * 0.7, cy - r * 0.7, r * 1.4, r * 1.4);
  } else if (kind === 14 || kind === 15) {
    // Marine — ellipse
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.1, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind >= 6 && kind <= 8) {
    // Fauna — circle with ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
