/** Dark HUD — death toll, doomsday, inbound (dark-400 §98, 57, 36, 361).
 *
 *  The full panel lives in the Evil desk dock. Over the globe we only show a
 *  slim bottom chip when something is actually happening — never a notice that
 *  eats the sky.
 */

import { relationOf } from './diplomacy.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function inboundFlightsHTML(W) {
  const rows = [];
  const player = W.playerPolity ?? -1;
  for (const f of W.flight || []) {
    if (f.dead || !f.path?.length) continue;
    const remain = Math.max(0, (f.path.length - 1) - Math.floor(f.at || 0));
    const label = f.label || f.kind || 'missile';
    const det = f.detected ? 'detected' : 'track';
    const atYou = player >= 0 && f.targetPolity === player;
    const fromYou = player >= 0 && f.ownerPolity === player;
    const cls = atYou ? 'dark-in dark-in-threat' : fromYou ? 'dark-in dark-in-us' : 'dark-in';
    const tag = atYou ? ' · AT YOU' : fromYou ? ' · ours' : '';
    rows.push(`<div class="${cls}">${esc(label)} · ETA ${remain} · ${det}${tag}</div>`);
  }
  for (const ix of W.interceptors || []) {
    if (ix.dead) continue;
    rows.push(`<div class="dark-in dark-ix">interceptor · ${esc(ix.kind || 'SAM')}</div>`);
  }
  if (!rows.length) return '<div class="dark-muted">No inbound</div>';
  return rows.slice(0, 8).join('');
}

export function doomsdayHTML(W) {
  const d = Math.max(0, Math.min(1, W.doomsday || 0));
  const mins = Math.max(0, Math.round((1 - d) * 1440));
  const hh = String((mins / 60) | 0).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `<div class="dark-doom">Doomsday <b>${hh}:${mm}</b> <span class="dark-muted">(${(d * 100) | 0}%)</span></div>`;
}

export function relationsHTML(W) {
  const pols = W.polities || [];
  if (pols.length < 2) return '<div class="dark-muted">No rivals yet</div>';
  const pairs = [];
  for (let i = 0; i < pols.length; i++) {
    for (let j = i + 1; j < pols.length; j++) {
      pairs.push({ a: pols[i], b: pols[j], r: relationOf(W, pols[i].id, pols[j].id) });
    }
  }
  pairs.sort((x, y) => x.r - y.r);
  const player = W.playerPolity;
  const lines = [];
  for (const p of pairs.slice(0, 8)) {
    const tone = p.r < -0.4 ? 'bad' : p.r > 0.3 ? 'good' : 'mid';
    const mark = (player === p.a.id || player === p.b.id) ? ' ★' : '';
    lines.push(`<div class="dark-rel ${tone}">${esc(p.a.name)}↔${esc(p.b.name)} <b>${p.r.toFixed(2)}</b>${mark}</div>`);
  }
  return lines.join('') || '<div class="dark-muted">No rivals yet</div>';
}

export function deathTollHTML(W) {
  const t = W.darkToll || {};
  const total = ['blast', 'fallout', 'famine', 'disease', 'war', 'poison', 'player']
    .reduce((s, k) => s + (t[k] || 0), 0);
  return `<div class="dark-toll" title="Never clearable">Death toll <b>${total | 0}</b>`
    + ` · war ${t.war | 0} · blast ${t.blast | 0} · fallout ${t.fallout | 0}`
    + ` · player <b>${t.player | 0}</b></div>`;
}

export function tribunalHTML(W) {
  const tri = W.dark?.tribunal;
  if (!tri) return '';
  const leg = W.dark?.legacy;
  return `<div class="dark-tri">Tribunal · ${tri.crimes | 0} crimes · toll ${tri.toll?.total | 0}`
    + (leg ? ` · still contaminated ${leg.contaminated | 0}` : '')
    + `</div>`;
}

export function benefitedHTML(W) {
  const b = W.dark?.benefited;
  if (!b) return '';
  return `<div class="dark-ben">Peace · <b>${esc(b.winnerName)}</b> prevailed over ${esc(b.loserName)}`
    + (b.war ? ` · ${esc(b.war)}` : '')
    + `</div>`;
}

export function legacyHTML(W) {
  const leg = W.dark?.legacy;
  if (!leg || !(leg.contaminated > 0)) return '';
  return `<div class="dark-leg">Legacy · <b>${leg.contaminated | 0}</b> cells still contaminated</div>`;
}

export function exchangeTimelineHTML(W) {
  const tl = W.exchangeTimeline || [];
  if (!tl.length) return '<div class="dark-muted">No exchanges yet</div>';
  const rows = [];
  for (const e of tl.slice(-6)) {
    rows.push(`<div class="dark-ex">${esc(e.kind)} · ${esc(e.note || '')}</div>`);
  }
  return rows.join('');
}

/** Full panel for the Evil desk dock. */
export function darkHudHTML(W) {
  if (!(W.polities?.length || W.flight?.length || (W.darkToll && Object.values(W.darkToll).some((n) => n > 0))
    || (W.exchangeTimeline || []).length || W.dark?.tribunal || W.dark?.benefited || W.dark?.legacy?.contaminated)) {
    return '';
  }
  return `<div id="darkhud-inner">`
    + deathTollHTML(W)
    + tribunalHTML(W)
    + benefitedHTML(W)
    + legacyHTML(W)
    + doomsdayHTML(W)
    + `<div class="dark-h">Inbound</div>${inboundFlightsHTML(W)}`
    + `<div class="dark-h">Relations</div>${relationsHTML(W)}`
    + `<div class="dark-h">Exchange</div>${exchangeTimelineHTML(W)}`
    + `</div>`;
}

/** Slim over-globe chip — only when something is live. */
function chipHTML(W) {
  const flights = (W.flight || []).filter((f) => !f.dead);
  const inbound = flights.length
    + (W.interceptors || []).filter((ix) => !ix.dead).length;
  const player = W.playerPolity ?? -1;
  const atYou = player >= 0 && flights.some((f) => f.targetPolity === player);
  const flash = (W._blastFlash || 0) > 0.12
    || ((W._empPulse || 0) > 0.25)
    || ((W._ixBursts || []).length > 0 && (W._ixBursts[0].age | 0) < 6);
  const toll = W.darkToll || {};
  const total = ['blast', 'fallout', 'famine', 'disease', 'war', 'poison', 'player']
    .reduce((s, k) => s + (toll[k] || 0), 0);
  if (!inbound && !flash && total <= 0) return '';

  const d = Math.max(0, Math.min(1, W.doomsday || 0));
  const mins = Math.max(0, Math.round((1 - d) * 1440));
  const clock = `${String((mins / 60) | 0).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

  const bits = [];
  const us = (W.polities || []).find((p) => p.id === player);
  if (us) bits.push(`<span class="dark-chip-us">${esc(us.name)}</span>`);
  if (total > 0) bits.push(`<b class="dark-chip-toll">${total | 0}</b> dead`);
  if (atYou) bits.push('<b class="dark-chip-threat">INBOUND AT YOU</b>');
  else if (inbound) bits.push(`<b class="dark-chip-in">${inbound}</b> inbound`);
  if (flash) bits.push('<span class="dark-chip-flash">detonation</span>');
  const winter = W.dark?.winter || 0;
  if (winter > 0.12) bits.push(`<span class="dark-chip-winter">winter ${(winter * 100) | 0}%</span>`);
  bits.push(`<span class="dark-chip-doom">${clock}</span>`);
  return `<button type="button" id="darkhud-chip" class="dark-chip${atYou ? ' dark-chip-alert' : ''}" title="Open Evil desk for the full ledger">${bits.join(' · ')}</button>`;
}

/** Mount: full HTML into Evil dock; chip over the globe only when active. */
export function refreshDarkHud(W, root = null) {
  if (typeof document === 'undefined') return;
  const full = darkHudHTML(W);
  const dock = document.getElementById('darkhud-dock');
  if (dock) dock.innerHTML = full || '<div class="dark-muted">No ledger yet — settlements grow countries.</div>';

  let chipHost = document.getElementById('darkhud');
  if (!chipHost) {
    chipHost = document.createElement('div');
    chipHost.id = 'darkhud';
    chipHost.setAttribute('aria-live', 'polite');
    document.body.appendChild(chipHost);
  }
  // Prefer an explicit root only when the caller wants the full panel elsewhere.
  if (root && root !== chipHost) {
    root.innerHTML = full;
    root.style.display = full ? 'block' : 'none';
  }

  const chip = chipHTML(W);
  chipHost.className = chip ? 'darkhud-chip-host' : '';
  chipHost.style.display = chip ? 'block' : 'none';
  chipHost.innerHTML = chip;
  // Keep the chip above the Holocene / ICS ribbon so it never covers pause / yr/tick.
  const rib = document.getElementById('timeribbon');
  const lift = Math.max(120, (rib?.offsetHeight || 220) + 10);
  document.documentElement.style.setProperty('--dark-chip-lift', `${lift}px`);
  const btn = chipHost.querySelector('#darkhud-chip');
  if (btn && !btn._bound) {
    btn._bound = true;
    btn.addEventListener('click', () => {
      document.querySelector('.dock-tabs button[data-tab="tools"]')?.click();
      const tab = document.querySelector('.suite-desk-tab[data-desk="evil"]');
      if (tab) tab.click();
    });
  }
}
