import { expected } from './report.js';
/** Flat-screen playtest harness — NEXT #4 / #5 / #8.
 *  Open vr/?playtest=1 — times the 90s loop, asks comfort + legibility, copies a PLAYTESTS row.
 *  Chrome is a top-right chip so it does not sit on the tools dock. */

const KEY = 'orrery.playtest.rows.v1';

export function isPlaytestMode() {
  try {
    return new URLSearchParams(location.search).get('playtest') === '1';
  } catch {
    return false;
  }
}

export function loadPlaytestRows() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function savePlaytestRow(row) {
  const rows = loadPlaytestRows();
  rows.push(row);
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-40)));
  } catch {
    expected('ORR-EXPECTED-STORAGE', 'playtest rows');
  }
  return rows;
}

export function formatPlaytestMarkdown(row) {
  const cells = [
    row.date || '—',
    row.build || '—',
    row.platform || 'flat',
    '1',
    row.lengthMin != null ? String(row.lengthMin) : '—',
    row.comfort != null ? String(row.comfort) : '—',
    row.loopS != null ? String(row.loopS) : '—',
    row.legibility || '—',
    row.hook || '—',
    (row.notes || '').replace(/\|/g, '/'),
    row.decision || 'open',
  ];
  return `| ${cells.join(' | ')} |`;
}

/** Mount a small overlay. Calls onDone(row) when finished. */
export function mountPlaytestUI(opts = {}) {
  const existing = document.getElementById('playtest-ui');
  if (existing) existing.remove();

  const root = document.createElement('div');
  root.id = 'playtest-ui';
  root.setAttribute('data-collapsed', '1');
  root.innerHTML = `
<style>
#playtest-ui{
  /* Sit under the topbar on the right — clear of the tools dock (left)
     and the local map (bottom-right). Collapsed by default. */
  position:fixed; z-index:80;
  top: calc(62px + env(safe-area-inset-top, 0px));
  right: calc(12px + env(safe-area-inset-right, 0px));
  left:auto; bottom:auto;
  max-width:min(280px, calc(100vw - 24px));
  background:rgba(10,14,22,.88); color:#e8eef8;
  border:1px solid rgba(196,163,90,.35);
  border-radius:10px; padding:0;
  font:12px/1.4 "IBM Plex Mono", ui-monospace, Menlo, monospace;
  backdrop-filter:blur(8px);
  box-shadow:0 8px 28px rgba(0,0,0,.35);
}
#playtest-ui .pt-chip{
  display:flex; align-items:center; gap:8px;
  padding:6px 8px 6px 10px; cursor:pointer; user-select:none;
}
#playtest-ui .pt-chip:focus-visible{outline:2px solid #c4a35a; outline-offset:2px}
#playtest-ui .pt-mark{
  font:700 10px/1 Syne, ui-sans-serif, system-ui, sans-serif;
  letter-spacing:.08em; text-transform:uppercase; color:#c4a35a;
}
#playtest-ui .pt-time{font-variant-numeric:tabular-nums; color:#e0c57a; margin-left:auto}
#playtest-ui .pt-toggle{
  font:inherit; font-size:11px; color:#9aa8bf; background:transparent;
  border:0; padding:2px 4px; cursor:pointer;
}
#playtest-ui .pt-body{
  display:none; padding:0 10px 10px; border-top:1px solid rgba(232,238,248,.1);
}
#playtest-ui:not([data-collapsed]) .pt-body{display:block; padding-top:8px}
#playtest-ui h3{display:none}
#playtest-ui p{margin:0 0 6px; color:#9aa8bf; font-size:11.5px}
#playtest-ui .pt-row{display:flex; flex-wrap:wrap; gap:6px; margin:6px 0}
#playtest-ui button,#playtest-ui select,#playtest-ui input,#playtest-ui textarea{
  font:inherit; color:inherit; background:#1a2438;
  border:1px solid rgba(232,238,248,.18); padding:5px 7px; border-radius:6px;
}
#playtest-ui button.pt-go{background:#c4a35a; color:#12120e; border-color:transparent; font-weight:600; cursor:pointer}
#playtest-ui textarea{width:100%; min-height:48px; resize:vertical; box-sizing:border-box}
#playtest-ui[hidden]{display:none!important}
@media (max-width:720px){
  /* Phone: dock is a bottom sheet — keep the chip top-right, slightly tighter. */
  #playtest-ui{
    top: calc(56px + env(safe-area-inset-top, 0px));
    right: calc(8px + env(safe-area-inset-right, 0px));
    max-width:min(240px, calc(100vw - 16px));
  }
}
</style>
<div class="pt-chip" id="pt-chip" role="button" tabindex="0" title="Playtest — click to expand" aria-expanded="false">
  <span class="pt-mark">Playtest</span>
  <span class="pt-time" id="pt-clock">0.0s</span>
  <button type="button" class="pt-toggle" id="pt-toggle" aria-label="Expand playtest">▾</button>
</div>
<div class="pt-body" id="pt-body">
  <p id="pt-phase">Observe → Perturb → Descend → Read. Timer starts when you act.</p>
  <div class="pt-row"><button type="button" id="pt-skip" hidden>Skip act</button></div>
  <div id="pt-form" hidden>
    <p>Comfort (1–5)</p>
    <div class="pt-row" id="pt-comfort"></div>
    <p>Could they name a <em>place</em> change unprompted?</p>
    <select id="pt-legib">
      <option value="yes">yes</option>
      <option value="partial">partial</option>
      <option value="no">no</option>
    </select>
    <p>Their words / notes</p>
    <textarea id="pt-notes" placeholder="coast drowned / fire front / herd fled …"></textarea>
    <div class="pt-row">
      <button type="button" class="pt-go" id="pt-save">Save row + copy</button>
    </div>
  </div>
</div>`;
  document.body.appendChild(root);

  const state = {
    t0: null,
    loopS: null,
    hook: null,
    descended: false,
    phase: 'wait-act',
    collapsed: true,
  };

  const clock = root.querySelector('#pt-clock');
  const form = root.querySelector('#pt-form');
  const phaseEl = root.querySelector('#pt-phase');
  const chip = root.querySelector('#pt-chip');
  const toggle = root.querySelector('#pt-toggle');
  const comfortRow = root.querySelector('#pt-comfort');

  function setCollapsed(on) {
    state.collapsed = !!on;
    if (on) root.setAttribute('data-collapsed', '1');
    else root.removeAttribute('data-collapsed');
    chip.setAttribute('aria-expanded', on ? 'false' : 'true');
    toggle.textContent = on ? '▾' : '▴';
    toggle.setAttribute('aria-label', on ? 'Expand playtest' : 'Collapse playtest');
  }

  function toggleCollapsed(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setCollapsed(!state.collapsed);
  }

  chip.addEventListener('click', (e) => {
    if (e.target === toggle) return;
    toggleCollapsed(e);
  });
  chip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') toggleCollapsed(e);
  });
  toggle.addEventListener('click', toggleCollapsed);

  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(i);
    b.dataset.v = String(i);
    b.addEventListener('click', () => {
      comfortRow.querySelectorAll('button').forEach((x) => x.removeAttribute('aria-pressed'));
      b.setAttribute('aria-pressed', 'true');
      state.comfort = i;
    });
    comfortRow.appendChild(b);
  }

  let raf = 0;
  const tick = () => {
    if (state.t0 != null && state.loopS == null) {
      clock.textContent = `${((performance.now() - state.t0) / 1000).toFixed(1)}s`;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const api = {
    noteAct(tool) {
      if (state.phase !== 'wait-act') return;
      state.hook = tool || 'act';
      state.t0 = performance.now();
      state.phase = 'wait-descend';
      phaseEl.textContent = 'Descend — open local map or scroll in. Timer running.';
    },
    noteDescend() {
      if (state.phase !== 'wait-descend') return;
      state.loopS = Math.round((performance.now() - state.t0) / 100) / 10;
      state.descended = true;
      state.phase = 'form';
      clock.textContent = `${state.loopS}s`;
      phaseEl.textContent = 'Loop closed. Rate comfort and legibility.';
      form.hidden = false;
      setCollapsed(false); // need the form — open once
    },
    destroy() {
      cancelAnimationFrame(raf);
      root.remove();
    },
  };

  root.querySelector('#pt-save').addEventListener('click', () => {
    const lengthMin =
      state.t0 != null ? Math.round((performance.now() - state.t0) / 6000) / 10 : null;
    const row = {
      date: new Date().toISOString().slice(0, 10),
      build: opts.build || 'local',
      platform: 'flat',
      lengthMin,
      comfort: state.comfort ?? null,
      loopS: state.loopS,
      legibility: root.querySelector('#pt-legib').value,
      hook: state.hook || '—',
      notes: root.querySelector('#pt-notes').value.trim(),
      decision: 'open',
    };
    savePlaytestRow(row);
    const md = formatPlaytestMarkdown(row);
    try {
      navigator.clipboard?.writeText(md);
    } catch {
      expected('ORR-EXPECTED-STORAGE', 'clipboard');
    }
    phaseEl.textContent = 'Row copied — paste into PLAYTESTS.md';
    opts.onDone?.(row, md);
  });

  return api;
}
