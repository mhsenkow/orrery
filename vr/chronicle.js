/** World chronicle — typed event log, eras, export. */

const MAX_EVENTS = 4000;

export function createChronicle() {
  return {
    events: [],
    eras: [],
    eraStart: 0,
    eraFocus: '',
    _counts: Object.create(null),
  };
}

export function logEvent(chron, year, kind, cell, magnitude, label) {
  const ev = { t: year, kind, cell: cell | 0, mag: magnitude || 0, label: label || kind };
  chron.events.push(ev);
  if (chron.events.length > MAX_EVENTS) chron.events.splice(0, chron.events.length - MAX_EVENTS);
  chron._counts[kind] = (chron._counts[kind] || 0) + 1;
  return ev;
}

export function maybeNameEra(chron, year, snapshot) {
  // Every ~50k years, name an era from what dominated.
  if (year - chron.eraStart < 48000) return;
  const { iceFrac, lifeFrac, O2, state } = snapshot;
  let name;
  if (state === 'snowball') name = 'The Long Freeze';
  else if (state === 'moist-greenhouse') name = 'The Steam Age';
  else if (O2 > 0.15 && (chron._counts.oxygenation || 0) > 0) name = 'The Great Bloom';
  else if (iceFrac > 0.45) name = 'The Long Winter';
  else if (lifeFrac > 0.35) name = 'The Verdant Age';
  else if ((chron._counts.impact || 0) > 3) name = 'The Bombardment';
  else if ((chron._counts.eruption || 0) > 5) name = 'The Ash Years';
  else name = iceFrac > 0.2 ? 'The Cool Interval' : 'The Quiet Epoch';

  chron.eras.push({ start: chron.eraStart, end: year, name, focus: chron.eraFocus || name });
  chron.eraStart = year;
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

export function exportChronicle(chron, planetName = 'ORRERY') {
  const lines = [`# ${planetName} Chronicle`, ''];
  for (const era of chron.eras) {
    lines.push(`## ${era.name} (${era.start.toLocaleString()} – ${era.end.toLocaleString()})`);
  }
  lines.push('', '## Events');
  for (const e of chron.events.slice(-200)) {
    lines.push(`- Y${e.t.toLocaleString()} · ${e.label} @cell ${e.cell} (mag ${(e.mag || 0).toFixed(2)})`);
  }
  return lines.join('\n');
}

export function currentEraName(chron) {
  return chron.eras.length ? chron.eras[chron.eras.length - 1].name : 'The First Age';
}
