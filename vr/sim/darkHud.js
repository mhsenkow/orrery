/** Dark HUD — inbound flights, doomsday, relations, death toll (dark-400 §98, 57, 36, 361). */

import { relationOf } from './diplomacy.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function inboundFlightsHTML(W) {
  const rows = [];
  for (const f of W.flight || []) {
    if (f.dead || !f.path?.length) continue;
    const remain = Math.max(0, (f.path.length - 1) - Math.floor(f.at || 0));
    const label = f.label || f.kind || 'missile';
    const det = f.detected ? 'detected' : 'track';
    rows.push(`<div class="dark-in">${esc(label)} · ETA ${remain} · ${det}</div>`);
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
  const mins = Math.max(0, Math.round((1 - d) * 1440)); // theatrical minutes to midnight
  const hh = String((mins / 60) | 0).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `<div class="dark-doom">Doomsday <b>${hh}:${mm}</b> <span class="dark-muted">(${(d * 100) | 0}%)</span></div>`;
}

export function relationsHTML(W) {
  const pols = W.polities || [];
  if (pols.length < 2) return '<div class="dark-muted">No rivals yet</div>';
  // Matrix sorted by who is about to fight whom (§36).
  const pairs = [];
  for (let i = 0; i < pols.length; i++) {
    for (let j = i + 1; j < pols.length; j++) {
      const r = relationOf(W, pols[i].id, pols[j].id);
      pairs.push({ a: pols[i], b: pols[j], r });
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

export function darkHudHTML(W) {
  if (!(W.polities?.length || W.flight?.length || (W.darkToll && Object.values(W.darkToll).some((n) => n > 0)))) {
    return '';
  }
  return `<div id="darkhud-inner">`
    + deathTollHTML(W)
    + doomsdayHTML(W)
    + `<div class="dark-h">Inbound</div>${inboundFlightsHTML(W)}`
    + `<div class="dark-h">Relations</div>${relationsHTML(W)}`
    + `</div>`;
}

/** Mount or refresh #darkhud in the document. */
export function refreshDarkHud(W, root = null) {
  if (typeof document === 'undefined') return;
  let el = root || document.getElementById('darkhud');
  if (!el) {
    el = document.createElement('div');
    el.id = 'darkhud';
    el.setAttribute('aria-live', 'polite');
    const host = document.getElementById('topbar') || document.body;
    host.appendChild(el);
  }
  const html = darkHudHTML(W);
  el.style.display = html ? 'block' : 'none';
  if (html) el.innerHTML = html;
}
