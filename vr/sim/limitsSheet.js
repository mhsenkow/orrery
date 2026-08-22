/** One-screen model limits for Lab (A88 / NEXT).
 *  Loads generated provenance + static honesty lines. */

let _cache = null;

export async function loadLimitsSummary() {
  if (_cache) return _cache;
  let provenance = null;
  try {
    const r = await fetch(new URL('../data/provenance.json', import.meta.url));
    if (r.ok) provenance = await r.json();
  } catch { /* offline / file:// */ }
  _cache = {
    provenance,
    generated: provenance?.generated || null,
    untaggedShare: provenance?.untaggedShare ?? null,
    kinds: provenance?.kinds || {},
    tagged: provenance?.tagged ?? null,
    untagged: provenance?.untagged ?? null,
  };
  return _cache;
}

/** HTML for the Lab “limits” sheet. */
export function limitsSummaryHTML(summary, W) {
  const p = summary || {};
  const share = p.untaggedShare != null
    ? `${(p.untaggedShare * 100).toFixed(1)}% untagged`
    : 'run `npm run provenance`';
  const kinds = p.kinds || {};
  const kindLine = ['measured', 'fitted', 'invented', 'numeric']
    .map((k) => `${k} ${kinds[k] || 0}`)
    .join(' · ');
  const n = W?._simN || W?.rule?.n;
  return `
    <div class="limits-sheet">
      <h3>What this model claims — and what it doesn’t</h3>
      <p class="lab-meta">One screen. Full notes in
        <a href="../briefs/model-limits.md" target="_blank" rel="noopener">model-limits.md</a>.</p>
      <ul class="limits-list">
        <li><b>Provenance</b> — ${share}${p.tagged != null ? ` (${p.tagged} tagged / ${p.untagged} untagged)` : ''}.
          Untagged ≈ invented. ${kindLine}.</li>
        <li><b>Grid</b> — cube-sphere${n ? ` N=${n}` : ''}; climate path <b>${W?._gpgpu && !W?._gpgpuOff ? 'GPGPU' : 'CPU'}</b>${W?._gpgpuMs != null ? ` (${Number(W._gpgpuMs).toFixed(1)} ms)` : ''}.</li>
        <li><b>O₂</b> — accumulates from organic burial, not raw photosynthesis − respiration.</li>
        <li><b>Life</b> — guilds + ~11 trait floats, not genomes; density is relative carrying capacity.</li>
        <li><b>Earth bands</b> — modern Earth is the calibration anchor; other worlds are wider / first-cut.</li>
        <li><b>Dark / war</b> — optional; off unless <code>?dark=1</code>.</li>
      </ul>
      <p class="lab-meta">Seed <b>${W?.seed ?? '—'}</b> · save v<b>${W?.rule ? '9' : '—'}</b>
        · water drift <b>${(((W?.waterDrift) || 0) * 100).toFixed(1)}%</b></p>
    </div>`;
}

export function provenanceChipText(summary, W) {
  const p = summary || {};
  const kinds = p.kinds || {};
  const m = kinds.measured || 0;
  const f = kinds.fitted || 0;
  const inv = kinds.invented || 0;
  const n = kinds.numeric || 0;
  const tot = m + f + inv + n || 1;
  const world = W?.rule?.name || W?.worldName || 'this world';
  const pct = (x) => `${Math.round((x / tot) * 100)}%`;
  const share = p.untaggedShare != null
    ? ` · code ${(100 - p.untaggedShare * 100).toFixed(0)}% tagged`
    : '';
  return `${world}: ${pct(m)} measured · ${pct(f)} fitted · ${pct(inv)} invented${share}`;
}

export function openLimitsSheet(host, W) {
  if (!host) return;
  let sheet = host.querySelector('.limits-sheet-host');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.className = 'limits-sheet-host';
    sheet.style.cssText = 'margin:8px 0;padding:10px 12px;border:1px solid var(--line,#333);border-radius:6px;background:rgba(0,0,0,0.25)';
    host.prepend(sheet);
  }
  sheet.innerHTML = '<div class="lab-meta">Loading limits…</div>';
  loadLimitsSummary().then((s) => {
    sheet.innerHTML = limitsSummaryHTML(s, W)
      + '<button type="button" class="limits-dismiss" style="margin-top:8px">Hide</button>';
    sheet.querySelector('.limits-dismiss')?.addEventListener('click', () => { sheet.remove(); });
  });
}
