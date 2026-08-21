/** Rich instrument visuals — charts, towers, spectra as SVG. */

import { DIR } from '../sphere.js';
import { CLOCK_FACES, SEASON_HOLDS } from './clockFace.js';

const GUILD_SHORT = {
  fermenter: 'ferment',
  methanogen: 'methano',
  sulfateReducer: 'SO₄ red',
  ironReducer: 'Fe red',
  anammox: 'anammox',
  denitrifier: 'denitr',
  methanotroph: 'CH₄ ox',
  ironOxidizer: 'Fe ox',
  photoferrotroph: 'photoFe',
  purpleSulfur: 'purple S',
  greenSulfur: 'green S',
  cyanobacteria: 'cyano',
  aerobe: 'aerobe',
  nFixer: 'N-fix',
  nitrifier: 'nitrif',
  decomposer: 'decomp',
  chemolithotroph: 'litho',
};

export function chartAreaSVG(values, opts = {}) {
  const w = opts.w || 220;
  const h = opts.h || 64;
  const color = opts.color || '#7dd6a0';
  const id = opts.id || 'a';
  if (!values?.length) {
    return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <text x="8" y="${h / 2 + 4}" fill="#5a6a82" font-size="10">awaiting signal…</text></svg>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padL = opts.axis ? 34 : 2;
  const padR = 4;
  const padT = 14;
  const padB = 6;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const pts = values.map((v, i) => {
    const x = padL + (i / (values.length - 1 || 1)) * iw;
    const y = padT + ih - ((v - min) / span) * ih;
    return [x, y];
  });
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `${padL},${h - padB} ${line} ${padL + iw},${h - padB}`;
  const last = values[values.length - 1];
  const label = opts.label || '';
  const fmt = (v) => {
    if (typeof v !== 'number') return v;
    if (Math.abs(v) >= 1000) return v.toFixed(opts.digits ?? 0);
    if (Math.abs(v) >= 10) return v.toFixed(opts.digits ?? 0);
    return v.toFixed(opts.digits ?? 1);
  };
  const grid = opts.axis
    ? [0, 0.5, 1].map((t) => {
      const y = padT + ih * (1 - t);
      const v = min + span * t;
      return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="rgba(140,170,220,0.12)" stroke-width="1"/>
        <text x="${padL - 4}" y="${y + 3}" text-anchor="end" fill="#5a6a82" font-size="7" font-family="ui-monospace,monospace">${fmt(v)}</text>`;
    }).join('')
    : '';
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <polygon fill="url(#g${id})" points="${area}"/>
    <polyline fill="none" stroke="${color}" stroke-width="1.9" stroke-linejoin="round"
      stroke-linecap="round" points="${line}"/>
    <circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="2.6" fill="${color}"/>
    <text x="${w - padR}" y="11" text-anchor="end" fill="${color}" font-size="10" font-family="ui-monospace,monospace" font-weight="600">${fmt(last)}${label}</text>
  </svg>`;
}

/** Energy-ordered metabolic guild ladder — the Lab centrepiece. */
export function redoxTowerSVG(gauge, h = 280, highlightId = null) {
  const w = 280;
  const rows = gauge.slice().reverse(); // high yield at top
  const n = Math.max(1, rows.length);
  const topPad = 14;
  const botPad = 4;
  const rowH = (h - topPad - botPad) / n;
  const labelW = 52;
  const barX = labelW + 4;
  const barMax = w - barX - 36;
  let y = topPad;

  const spine = `<defs>
      <linearGradient id="towerSpine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7dd6a0" stop-opacity="0.55"/>
        <stop offset="45%" stop-color="#e4b86a" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#8a6a9a" stop-opacity="0.25"/>
      </linearGradient>
    </defs>
    <rect x="${barX - 3}" y="${topPad}" width="3" height="${h - topPad - botPad}" rx="1.5" fill="url(#towerSpine)"/>
    <text x="${w - 2}" y="10" text-anchor="end" fill="#5a6a82" font-size="7" font-family="ui-monospace,monospace">← yield</text>
    <text x="0" y="10" fill="#5a6a82" font-size="7" font-family="ui-monospace,monospace">guild</text>`;

  const rects = rows.map((g) => {
    const active = g.mean > 0.01;
    const width = Math.max(active ? 6 : 2, g.mean * barMax);
    const [r, gv, b] = g.color || [80, 120, 100];
    const on = highlightId === g.id;
    const op = on ? 0.95 : (active ? 0.5 + g.mean * 0.5 : 0.1);
    const stroke = on ? 'rgba(255,255,255,0.9)' : `rgba(200,220,255,${active ? 0.28 : 0.05})`;
    const short = GUILD_SHORT[g.id] || g.id.slice(0, 8);
    const pct = active ? `${Math.round(g.mean * 100)}` : '·';
    const el = `<g class="guild-row${on ? ' on' : ''}" data-guild="${g.id}" style="cursor:pointer"
      transform="translate(0,${y.toFixed(1)})">
      <title>${g.id} · density ${(g.mean || 0).toFixed(3)}${g.yield != null ? ` · yield ${g.yield}` : ''}</title>
      <rect x="0" y="0" width="${w}" height="${rowH}" fill="transparent"/>
      <text x="0" y="${rowH * 0.68}" fill="${on ? '#fff' : (active ? '#c8d6ef' : '#3d4658')}" font-size="8"
        font-family="ui-monospace,monospace">${short}</text>
      <rect class="gbar" x="${barX}" y="${Math.max(1, rowH * 0.18)}" width="${width.toFixed(1)}" height="${Math.max(3, rowH * 0.64)}" rx="2"
        fill="rgb(${r},${gv},${b})" fill-opacity="${op}"
        stroke="${stroke}" stroke-width="${on ? 1.5 : 1}"/>
      <text x="${w - 2}" y="${rowH * 0.68}" text-anchor="end" fill="${active ? '#9fb0cc' : '#3d4658'}" font-size="7.5"
        font-family="ui-monospace,monospace">${pct}${active ? '%' : ''}</text>
    </g>`;
    y += rowH;
    return el;
  }).join('');

  return `<svg class="tower" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${spine}${rects}</svg>`;
}

/** Living clades as a colour strip + Shannon index. */
export function diversityStripSVG(phy, opts = {}) {
  const w = opts.w || 280;
  const h = opts.h || 52;
  const living = (phy?.nodes || []).filter((n) => n.death == null);
  if (!living.length) {
    return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <text x="8" y="${h / 2 + 3}" fill="#5a6a82" font-size="10">no living clades</text></svg>`;
  }
  const pops = living.map((n) => Math.max(0.001, n.pop || 0.01));
  const total = pops.reduce((a, b) => a + b, 0);
  let shannon = 0;
  for (const p of pops) {
    const f = p / total;
    shannon -= f * Math.log(f);
  }
  const Hmax = Math.log(living.length) || 1;
  const evenness = shannon / Hmax;
  let x = 4;
  const gap = living.length > 24 ? 0 : 1;
  const usable = w - 8 - gap * Math.max(0, living.length - 1);
  const barTop = 4;
  const barH = h - 22;
  const bars = living.slice(0, 64).map((n, i) => {
    const frac = pops[i] / total;
    const bw = Math.max(2, frac * usable);
    const rgb = cladeRGB(n);
    const el = `<rect x="${x.toFixed(1)}" y="${barTop}" width="${bw.toFixed(1)}" height="${barH}" rx="1.5"
      fill="rgb(${rgb[0]},${rgb[1]},${rgb[2]})" fill-opacity="0.92">
      <title>${n.name || 'clade'} · pop ${(n.pop || 0).toFixed(2)}</title></rect>`;
    x += bw + gap;
    return el;
  }).join('');
  // Evenness meter
  const emX = 4;
  const emW = Math.max(4, evenness * 60);
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${bars}
    <rect x="4" y="${h - 10}" width="60" height="3" rx="1.5" fill="rgba(140,170,220,0.12)"/>
    <rect x="${emX}" y="${h - 10}" width="${emW.toFixed(1)}" height="3" rx="1.5" fill="#6fd6a4" fill-opacity="0.7"/>
    <text x="68" y="${h - 2}" fill="#7f8ca6" font-size="8" font-family="ui-monospace,monospace">H′ ${shannon.toFixed(2)} · even ${(evenness * 100) | 0}%</text>
    <text x="${w - 4}" y="${h - 2}" text-anchor="end" fill="#6fd6a4" font-size="8" font-family="ui-monospace,monospace">${living.length} clades</text>
  </svg>`;
}

function cladeRGB(n) {
  const mass = n.traits?.mass ?? 0.15;
  const troph = n.traits?.trophic ?? 0;
  const pig = n.traits?.o2 ?? 0.4;
  if (troph > 0.4) return [200, 150, 120];
  if (mass > 0.45) return [50, 140, 70];
  if (pig > 0.55) return [30, 140, 80];
  if (pig < 0.25) return [120, 50, 100];
  const h = ((n.id * 47) % 360);
  return hslToRgb(h, 0.45, 0.42);
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [(f(0) * 255) | 0, (f(8) * 255) | 0, (f(4) * 255) | 0];
}

export function spectrumSVG(lines, w = 280, h = 72) {
  if (!lines?.length) return '';
  const maxD = Math.max(...lines.map((l) => l.depth), 0.1);
  // Absorption-style: continuum line with dips
  const continuum = h * 0.28;
  const bars = lines.map((l, i) => {
    const bw = (w - 16) / lines.length - 4;
    const x = 8 + i * (bw + 4);
    const bh = (l.depth / maxD) * (h - 28);
    const y = continuum;
    const col = l.species === 'O2' ? '#7dd6a0' : l.species === 'CH4' ? '#e8c48a'
      : l.species === 'CO2' ? '#9fc0ff' : l.species === 'O3' ? '#a78bfa' : '#8fa0bd';
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="2" fill="${col}" fill-opacity="0.8"/>
      <text x="${x + bw / 2}" y="${h - 4}" text-anchor="middle" fill="#7f8ca6" font-size="8" font-family="ui-monospace,monospace">${l.species}</text>
      <text x="${x + bw / 2}" y="${y + bh + 10}" text-anchor="middle" fill="${col}" font-size="7" font-family="ui-monospace,monospace">${(l.depth * 100).toFixed(0)}%</text>`;
  }).join('');
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <line x1="8" y1="${continuum}" x2="${w - 8}" y2="${continuum}" stroke="rgba(200,220,255,0.2)" stroke-width="1"/>
    <text x="8" y="11" fill="#5a6a82" font-size="7" font-family="ui-monospace,monospace">continuum → absorption depth</text>
    ${bars}</svg>`;
}

export function whitakerSVG(pts, w = 280, h = 120) {
  if (!pts?.length) return '';
  const biomeColor = {
    tundra: '#a8c0d0', boreal: '#3d6b5a', tempDeciduous: '#5a9a4a', tempRainforest: '#2d7a50',
    grassland: '#c4b060', desert: '#c9a060', savanna: '#b89640', tropSeasonal: '#3a8a40',
    tropRainforest: '#1a6a38', ice: '#e8f0f8',
  };
  const dots = pts.slice(0, 280).map((p) => {
    const x = 18 + (clamp((p.tC + 20) / 60, 0, 1)) * (w - 28);
    const y = h - 16 - clamp(p.ppt / 3000, 0, 1) * (h - 28);
    const c = biomeColor[p.biome] || '#8899aa';
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="${c}" fill-opacity="0.75"/>`;
  }).join('');
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="18" y="12" width="${w - 28}" height="${h - 28}" fill="rgba(0,0,0,.28)" rx="4"/>
    <text x="20" y="10" fill="#5a6a82" font-size="7" font-family="ui-monospace,monospace">cold → hot</text>
    <text x="4" y="${h / 2}" fill="#5a6a82" font-size="7" font-family="ui-monospace,monospace" transform="rotate(-90 4 ${h / 2})">wet</text>
    <text x="20" y="${h - 3}" fill="#5a6a82" font-size="7" font-family="ui-monospace,monospace">dry</text>
    ${dots}</svg>`;
}

export function coreStrataSVG(layers, w = 280, h = 110) {
  if (!layers?.length) return '';
  const colors = {
    granite: '#8a7a6a', basalt: '#3a3a42', sediment: '#c4a870', metamorphic: '#6a5a70',
    'banded iron': '#8a4030', 'banded iron formation': '#8a4030',
    'impact ejecta / iridium anomaly': '#5a5a58', 'coal measure': '#2a2a2a',
    'stromatolite laminate': '#6a7a60', 'glacial till / ice': '#d0e0f0',
  };
  const n = layers.length;
  const lh = (h - 8) / n;
  let y = 4;
  const blocks = layers.map((l) => {
    const col = Array.isArray(l.rgb)
      ? `rgb(${l.rgb[0]},${l.rgb[1]},${l.rgb[2]})`
      : (colors[l.name] || '#6a7080');
    const label = l.note ? `${l.name} · ${l.note}` : l.name;
    const el = `<g>
      <rect x="8" y="${y}" width="${w - 16}" height="${lh - 2}" rx="3" fill="${col}" fill-opacity="0.85"/>
      <text x="14" y="${y + lh * 0.62}" fill="#f0f4fa" font-size="8" font-family="ui-monospace,monospace">${label}</text>
    </g>`;
    y += lh;
    return el;
  }).join('');
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${blocks}</svg>`;
}

export function icsRibbonHTML(ics, ageLabel, maBP, clock, panel = {}) {
  const eons = [
    { name: 'Hadean', short: 'Had', start: 4567, end: 4000, col: '#c45c3a' },
    { name: 'Archean', short: 'Arch', start: 4000, end: 2500, col: '#d4a04a' },
    { name: 'Proterozoic', short: 'Prot', start: 2500, end: 541, col: '#5a9a7a' },
    { name: 'Phanerozoic', short: 'Phan', start: 541, end: 0, col: '#5b8cff' },
  ];
  const total = 4567;
  const segs = eons.map((e) => {
    const left = ((total - e.start) / total) * 100;
    const width = ((e.start - e.end) / total) * 100;
    const on = ics?.eon === e.name;
    return `<div class="rib-seg${on ? ' on' : ''}" style="left:${left}%;width:${width}%;background:${e.col};--seg:${e.col}" title="${e.name}"></div>`;
  }).join('');
  const marks = eons.map((e, i) => {
    const mid = ((total - (e.start + e.end) / 2) / total) * 100;
    const edge = i === 0 ? 0 : i === eons.length - 1 ? 100 : mid;
    const on = ics?.eon === e.name;
    return `<span class="rib-mark${on ? ' on' : ''}" style="left:${edge}%">${e.short}</span>`;
  }).join('');
  const needle = Math.min(100, Math.max(0, ((4567 - (maBP ?? 0)) / 4567) * 100));
  const period = ics?.period && ics.period !== '—' ? ics.period : '';
  const eraLine = [period, ics?.eon].filter(Boolean).join(' · ');
  const dt = clock?.paused ? 'paused' : (clock?.dt || '');
  const rateId = clock?.id || panel.rateId || 'auto';
  const paused = clock?.paused || panel.paused;
  const pausedCls = paused ? ' is-paused' : '';
  const mode = panel.mode || 'Sandbox';
  const eraId = panel.eraId || 'present';
  const eras = panel.eras || [];
  const rates = panel.rates || [];
  const eraOpts = eras.map((e) =>
    `<option value="${e.id}"${e.id === eraId ? ' selected' : ''}>${e.label}</option>`).join('');
  const rateOpts = rates.map((r) =>
    `<option value="${r.id}"${r.id === rateId ? ' selected' : ''}>${r.label}${r.dtYr == null ? '' : ' / tick'}</option>`).join('');
  const ff = panel.ff ? ' aria-pressed="true"' : ' aria-pressed="false"';
  const face = panel.clockFace || 'years';
  const lived = face === 'now';
  const faceBtns = CLOCK_FACES.map((f) =>
    `<button type="button" class="rib-face-btn${f.id === face ? ' on' : ''}" data-clock-face="${f.id}" title="${f.hint}">${f.label}</button>`).join('');
  const holdId = panel.seasonHoldId || 'mar';
  const holdBtns = SEASON_HOLDS.map((h) =>
    `<button type="button" class="rib-hold-btn${h.id === holdId ? ' on' : ''}" data-season-hold="${h.id}" title="${h.title}">${h.label}</button>`).join('');
  const lifeSpeed = panel.lifeSpeed || 1;
  const lifeBtns = [1, 2, 4, 8].map((n) =>
    `<button type="button" class="rib-life-btn${n === lifeSpeed ? ' on' : ''}" data-life-speed="${n}" title="${n}× biology steps per climate tick">${n}×</button>`).join('');
  return `<div class="ics-ribbon${pausedCls}${lived ? ' is-now' : ' is-years'}">
    <div class="rib-head">
      <span class="rib-mode">${mode}</span>
      ${eras.length ? `<select class="rib-era" data-era-select aria-label="History era">${eraOpts}</select>` : ''}
    </div>
    <div class="rib-track">${segs}<div class="rib-needle" style="left:${needle}%"></div></div>
    <div class="rib-marks">${marks}</div>
    <div class="rib-meta"><span class="rib-age">${ageLabel}</span><span class="rib-era-line">${eraLine}</span></div>
    <div class="rib-faces" role="tablist" aria-label="Time scale">
      ${faceBtns}
    </div>
    <p class="rib-face-hint">${lived
      ? (panel.calendarHeld
        ? 'Calendar held at present · days and seasons still move'
        : 'Days, seasons and the moon · the calendar holds')
      : 'Years pass · this season stays'}${panel.winterHint ? ` · <span class="rib-winter">${panel.winterHint}</span>` : ''}</p>
    ${lived ? '' : `<div class="rib-hold" role="group" aria-label="Held season">${holdBtns}</div>`}
    <div class="rib-life" role="group" aria-label="Biology speed">
      <span class="rib-life-label">Life</span>${lifeBtns}
      <span class="rib-dt">${panel.dtBio != null ? `bio ${Number(panel.dtBio).toPrecision(3)} yr` : ''}</span>
    </div>
    <div class="rib-clock">
      <button type="button" class="rib-pause" data-time-pause aria-pressed="${paused ? 'true' : 'false'}" title="Pause (Space)">${paused ? '▶' : '⏸'}</button>
      ${lived ? '' : `
      <button type="button" class="rib-step" data-rate-step="-1" title="Slower (,)" aria-label="Slower clock">−</button>
      <select class="rib-rate" data-rate-select aria-label="Years per tick">${rateOpts || `<option value="${rateId}">${clock?.rate || 'Adaptive'}</option>`}</select>
      <button type="button" class="rib-step" data-rate-step="1" title="Faster (.)" aria-label="Faster clock">+</button>
      <button type="button" class="rib-ff${panel.ff ? ' on' : ''}" data-time-ff${ff} title="4× frames until an event">⏩</button>`}
      <span class="rib-dt">${clock?.paused ? 'paused' : (lived ? (panel.livedLabel || 'lived') : dt)}</span>
    </div>
  </div>`;
}

function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}

/** Synoptic-ish chart — pressure bands + wind barbs + ITCZ line. */
export function synopticChartSVG(W, w = 300, h = 160) {
  if (!W?.press) {
    return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <text x="10" y="${h / 2}" fill="#5a6a82" font-size="11">no pressure field yet</text></svg>`;
  }
  const NC = W.press.length;
  const cols = 36, rows = 18;
  const stride = Math.max(1, (NC / (cols * rows)) | 0);
  const cw = (w - 8) / cols, ch = (h - 24) / rows;
  let rects = '', barbs = '';
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const c = Math.min(NC - 1, (j * cols + i) * stride);
      const p = W.press[c] ?? 0.5;
      const u = W.windU?.[c] || 0;
      const v = W.windV?.[c] || 0;
      const cloud = W.clouds?.[c] || 0;
      const x = 4 + i * cw;
      const y = 14 + j * ch;
      const r = (40 + p * 60) | 0;
      const g = (70 + (1 - p) * 90) | 0;
      const b = (110 + (1 - p) * 120) | 0;
      const a = 0.35 + cloud * 0.45;
      rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="rgb(${r},${g},${b})" opacity="${a.toFixed(2)}"/>`;
      if ((i + j) % 3 !== 0) continue;
      const spd = Math.hypot(u, v);
      if (spd < 0.08) continue;
      const cx = 4 + (i + 0.5) * cw;
      const cy = 14 + (j + 0.5) * ch;
      const len = Math.min(10, 3 + spd * 8);
      const dx = (u / spd) * len;
      const dy = (-v / spd) * len;
      barbs += `<line x1="${cx}" y1="${cy}" x2="${(cx + dx).toFixed(1)}" y2="${(cy + dy).toFixed(1)}" stroke="#e8f0ff" stroke-width="1.1" opacity="0.85"/>`;
    }
  }
  const itczY = 14 + (0.5 - (W._itczLat || 0) * 0.5) * (h - 24);
  const regime = W._windRegime || 'circulation';
  const cellsN = W._windCells || 3;
  return `<svg class="chart synoptic" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="#0c121c"/>
    <text x="8" y="11" fill="#8aa0c0" font-size="9">${regime} · ${cellsN} cells/hem</text>
    ${rects}
    <line x1="4" y1="${itczY.toFixed(1)}" x2="${w - 4}" y2="${itczY.toFixed(1)}" stroke="#f0c060" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.9"/>
    <text x="${w - 36}" y="${(itczY - 3).toFixed(1)}" fill="#f0c060" font-size="8">ITCZ</text>
    ${barbs}
  </svg>`;
}

/** 18-bin zonal-mean temperature, zonal wind and vapour vs latitude. */
export function zonalMeanSVG(W, w = 292, h = 108) {
  if (!W?.temp) {
    return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <text x="10" y="${h / 2}" fill="#5a6a82" font-size="11">no fields yet</text></svg>`;
  }
  const n = 18;
  const tS = new Float64Array(n), uS = new Float64Array(n), vS = new Float64Array(n), cS = new Float64Array(n);
  const NC = W.temp.length;
  for (let c = 0; c < NC; c++) {
    const b = Math.max(0, Math.min(n - 1, (((DIR[c * 3 + 1] + 1) * 0.5) * n) | 0));
    tS[b] += W.temp[c];
    uS[b] += W.windU?.[c] || 0;
    vS[b] += W.vapour?.[c] || W.moist?.[c] || 0;
    cS[b] += 1;
  }
  const t = [], u = [], vap = [];
  for (let i = 0; i < n; i++) {
    const d = cS[i] || 1;
    t.push(tS[i] / d);
    u.push(uS[i] / d);
    vap.push(vS[i] / d);
  }
  const padL = 28, padR = 8, padT = 16, padB = 14;
  const iw = w - padL - padR, ih = h - padT - padB;
  const line = (arr, lo, hi, color) => {
    const span = hi - lo || 1;
    const pts = arr.map((v, i) => {
      const x = padL + (i / (n - 1)) * iw;
      const y = padT + ih - ((v - lo) / span) * ih;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<polyline fill="none" stroke="${color}" stroke-width="1.6" points="${pts}"/>`;
  };
  const tMin = Math.min(...t), tMax = Math.max(...t);
  const uAbs = Math.max(0.2, ...u.map(Math.abs));
  const vMax = Math.max(0.01, ...vap);
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="#0c121c"/>
    <text x="8" y="11" fill="#8aa0c0" font-size="9">${W.noSurface ? 'zonal mean · T · u' : 'zonal mean · T · u · vapour'}</text>
    ${line(t, tMin, tMax, '#e4b86a')}
    ${line(u.map((x) => (x + uAbs) / (2 * uAbs)), 0, 1, '#6ea0ff')}
    ${line(vap.map((x) => x / vMax), 0, 1, '#6fd6a4')}
    <text x="${padL}" y="${h - 3}" fill="#5a6a82" font-size="8">S</text>
    <text x="${w / 2}" y="${h - 3}" fill="#5a6a82" font-size="8">eq</text>
    <text x="${w - padR}" y="${h - 3}" fill="#5a6a82" font-size="8" text-anchor="end">N</text>
  </svg>`;
}

