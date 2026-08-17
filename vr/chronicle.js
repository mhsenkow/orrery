/** World chronicle — scientific record, eras from events, export.
 *  Items 4, 11, 95, 181, 192. */

import { formatAge, icsAt, eraFromState } from './sim/time.js';

const MAX_EVENTS = 4000;

export function createChronicle() {
  return {
    events: [],
    eras: [],
    eraStart: 0,
    eraFocus: '',
    _counts: Object.create(null),
    moments: [],
  };
}

export function logEvent(chron, year, kind, cell, magnitude, label, meta = null) {
  const ev = {
    t: year,
    kind,
    cell: cell | 0,
    mag: magnitude || 0,
    label: label || kind,
    meta: meta || undefined,
  };
  chron.events.push(ev);
  if (chron.events.length > MAX_EVENTS) chron.events.splice(0, chron.events.length - MAX_EVENTS);
  chron._counts[kind] = (chron._counts[kind] || 0) + 1;
  return ev;
}

/** State-transition era naming (replaces fixed 48 kyr timer). Item 4. */
export function maybeNameEra(chron, W) {
  const { name, snap } = eraFromState(W, W._eraSnap);
  W._eraSnap = snap;
  if (!name) {
    // Slow fallback: ICS period change
    const ics = W.ics || icsAt(W.ageYr || W.year);
    if (chron._lastPeriod && chron._lastPeriod !== ics.period && ics.period !== '—') {
      chron.eras.push({
        start: chron.eraStart,
        end: W.year,
        name: chron._lastPeriod,
        focus: chron.eraFocus || chron._lastPeriod,
        ics,
      });
      chron.eraStart = W.year;
      chron.eraFocus = '';
      chron._counts = Object.create(null);
      chron._lastPeriod = ics.period;
      return chron._lastPeriod;
    }
    chron._lastPeriod = ics.period;
    return null;
  }

  chron.eras.push({
    start: chron.eraStart,
    end: W.year,
    name,
    focus: chron.eraFocus || name,
    ics: W.ics,
  });
  if (W.planetChart) {
    W.planetChart.push({ t: W.ageYr, name, kind: 'state' });
  }
  chron.eraStart = W.year;
  chron.eraFocus = '';
  chron._counts = Object.create(null);
  return name;
}

export function whatHappenedHere(chron, cell, radiusCells = 0) {
  const out = [];
  for (let i = chron.events.length - 1; i >= 0 && out.length < 12; i--) {
    const e = chron.events[i];
    if (e.cell === cell || (radiusCells && Math.abs(e.cell - cell) < radiusCells * 10)) out.push(e);
  }
  return out;
}

/** Causal-ish trace: find preceding field-changing events. Item 191. */
export function whyDidThisHappen(chron, eventIndex) {
  const ev = chron.events[eventIndex];
  if (!ev) return [];
  const related = [];
  for (let i = eventIndex - 1; i >= 0 && related.length < 8; i--) {
    const e = chron.events[i];
    if (e.kind === ev.kind || e.kind === 'runaway' || e.kind === 'carbon'
      || e.kind === 'evolution' || e.kind === 'massext' || e.kind === 'impact') {
      related.push(e);
    }
  }
  return related;
}

export function exportChronicle(chron, planetName = 'ORRERY', W = null) {
  const lines = [`# ${planetName} Chronicle`, ''];
  if (W?.ics) {
    lines.push(`*ICS position: ${W.ics.eon} / ${W.ics.era} / ${W.ics.period}*`);
    lines.push(`*Age: ${formatAge(W.ageYr || W.year)}*`, '');
  }
  if (W?.carbon) {
    lines.push('## Proxies');
    lines.push(`- δ¹³C ${W.carbon.d13C.toFixed(2)}‰ · δ¹⁸O ${W.carbon.d18O.toFixed(2)}‰ · pH ${W.carbon.surfacePH.toFixed(2)}`);
    lines.push('');
  }
  if (W?.tree) {
    lines.push('## Diversity');
    lines.push(`- Living clades: ${W.tree.living.length} · Total nodes: ${W.tree.nodes.length}`);
    lines.push('');
  }
  for (const era of chron.eras) {
    lines.push(`## ${era.name} (${formatAge(era.start)} – ${formatAge(era.end)})`);
  }
  if (chron.moments?.length || (W?.moments && Object.keys(W.moments).length)) {
    lines.push('', '## Firsts');
    const moms = chron.moments?.length
      ? chron.moments
      : Object.values(W.moments || {});
    for (const m of moms) {
      lines.push(`- ${m.label} @ ${formatAge(m.ageYr ?? m.t)}`);
    }
  }
  lines.push('', '## Events');
  for (const e of chron.events.slice(-200)) {
    const why = e.meta?.cause ? ` — ${e.meta.cause}` : '';
    lines.push(`- ${formatAge(e.t)} · ${e.label} @cell ${e.cell} (mag ${(e.mag || 0).toFixed(2)})${why}`);
  }
  return lines.join('\n');
}

export function currentEraName(chron, W = null) {
  if (chron.eras.length) return chron.eras[chron.eras.length - 1].name;
  if (W?.ics?.period && W.ics.period !== '—') return W.ics.period;
  if (W?.ics?.eon) return W.ics.eon;
  return 'The First Age';
}
