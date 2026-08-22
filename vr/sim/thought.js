/** Cernunnos voice — floating train-of-thought about the view.
 *  Story first (dense, animal, seasonal). Diagnosis when the living layer
 *  goes quiet or stuck. Optional local mind (thoughtMind.js) may rewrite
 *  soft lines from a situation card — templates always work without it. */

import { W } from '../world.js';
import { ENT } from '../agents.js';
import { placeSentence, cellSun } from './present.js';
import { isPinnedEarth } from './ruleMode.js';
import { formatAge } from './time.js';

const COOLDOWN_MS = {
  warn: 9000,
  wild: 14000,
  quiet: 22000,
  soft: 28000,
  dwell: 40000,
  suggest: 48000,
};

/** How long the same focus cell must hold before a dwell line. */
export const DWELL_MS = 28000;

/** @type {{
 *  lines: string[],
 *  said: Set<string>,
 *  lastAt: number,
 *  lastTone: string,
 *  thread: { kind: string, at: number, text: string }[],
 *  silence: number,
 *  lastFocus: number,
 *  dwellCell: number,
 *  dwellSince: number,
 *  jumps: number,
 * }} */
const mem = {
  lines: [],
  said: new Set(),
  lastAt: 0,
  lastTone: '',
  thread: [],
  silence: 0,
  lastFocus: -1,
  dwellCell: -1,
  dwellSince: 0,
  jumps: 0,
};

export function resetThought() {
  mem.lines.length = 0;
  mem.said.clear();
  mem.lastAt = 0;
  mem.lastTone = '';
  mem.thread.length = 0;
  mem.silence = 0;
  mem.lastFocus = -1;
  mem.dwellCell = -1;
  mem.dwellSince = 0;
  mem.jumps = 0;
}

/** Snapshot of what the player is looking at. */
export function thoughtView(opts = {}) {
  const cell = opts.cell ?? -1;
  const now = opts.now ?? (typeof performance !== 'undefined' ? performance.now() : 0);
  const place = cell >= 0 ? (placeSentence(cell) || '') : '';
  let beings = 0, hunts = 0, flees = 0, settlers = 0;
  for (let i = 0; i < ENT.n; i++) {
    const m = ENT.meta[i];
    if (!m || m.dead) continue;
    beings++;
    if (m.behav === 'hunt') hunts++;
    if (m.behav === 'flee') flees++;
    if (m.kind === 5) settlers++;
  }
  const sparks = W.lifeSparks || [];
  const sparkHunt = sparks.some((s) => s.kind === 'hunt');
  const sparkBirth = sparks.some((s) => s.kind === 'birth');

  if (cell !== mem.dwellCell) {
    if (mem.dwellCell >= 0 && cell >= 0) mem.jumps++;
    mem.dwellCell = cell;
    mem.dwellSince = now;
  }
  const dwellMs = cell >= 0 ? Math.max(0, now - mem.dwellSince) : 0;

  const o2 = W.gases?.O2 ?? 0;
  const co2 = W.gases?.CO2 ?? 0;
  const meanTemp = W.meanTemp ?? 0;
  const meanLife = W.meanLife ?? 0;
  const iceFrac = W.iceFrac ?? 0;

  return {
    cell,
    place,
    beings,
    hunts,
    flees,
    settlers,
    sparkHunt,
    sparkBirth,
    swarm: W.swarmCount | 0,
    front: W.frontMean || 0,
    herdName: (W.groups || []).find((g) => (g.n || 0) >= 4)?.name || null,
    fire: cell >= 0 ? (W.fire?.[cell] || 0) : 0,
    ash: cell >= 0 ? (W.ash?.[cell] || 0) : 0,
    life: cell >= 0 ? (W.life?.[cell] || 0) : 0,
    build: cell >= 0 ? (W.build?.[cell] || 0) : 0,
    sun: cell >= 0 ? cellSun(cell) : 0,
    year: W.year | 0,
    ageYr: W.ageYr || 0,
    paused: !!opts.paused,
    thrive: !!(W.rule && !isPinnedEarth(W.rule)),
    moments: W.moments || {},
    recent: recentChronicle(6),
    dwellMs,
    jumps: mem.jumps,
    o2,
    co2,
    meanTemp,
    meanLife,
    iceFrac,
    systems: {
      paintedQuiet: meanLife > 0.04 && beings === 0,
      hot: meanTemp > 0.88,
      cold: meanTemp < 0.18 && iceFrac > 0.25,
      thinAir: o2 < 0.02 && !!(W.moments?.firstOxygen),
      burning: cell >= 0 && (W.fire?.[cell] || 0) > 0.35,
      settling: settlers > 0 && (cell < 0 || (W.build?.[cell] || 0) > 0.2),
    },
  };
}

/** Compact card for a local mind rewrite — facts only, no prose. */
export function situationCard(view) {
  if (!view) return null;
  return {
    place: view.place || null,
    dwellSec: view.dwellMs != null ? Math.round(view.dwellMs / 1000) : 0,
    jumps: view.jumps | 0,
    lifeHere: +(view.life || 0).toFixed(2),
    fire: +(view.fire || 0).toFixed(2),
    beings: view.beings | 0,
    hunts: view.hunts | 0,
    flees: view.flees | 0,
    herd: view.herdName || null,
    swarm: view.swarm | 0,
    sun: +(view.sun || 0).toFixed(2),
    year: view.year | 0,
    o2: +(view.o2 || 0).toFixed(3),
    meanTemp: +(view.meanTemp || 0).toFixed(2),
    meanLife: +(view.meanLife || 0).toFixed(2),
    ice: +(view.iceFrac || 0).toFixed(2),
    systems: view.systems || {},
    chronicle: (view.recent || []).slice(-3).map((e) => e.label || e.kind).filter(Boolean),
    thread: mem.thread.slice(-3).map((t) => t.text),
  };
}

function recentChronicle(n) {
  const ev = W.chron?.events;
  if (!ev?.length) return [];
  return ev.slice(-n).map((e) => ({
    kind: e.kind, label: e.label || '', cell: e.cell | 0, year: e.year,
  }));
}

function cooled(tone, now) {
  if (!mem.lastAt) return true;
  const need = COOLDOWN_MS[tone] || COOLDOWN_MS.soft;
  return now - mem.lastAt >= need;
}

function remember(kind, text, tone) {
  mem.thread.push({ kind, at: performance.now(), text });
  if (mem.thread.length > 12) mem.thread.shift();
  mem.lines.push(text);
  if (mem.lines.length > 24) mem.lines.shift();
  mem.lastTone = tone;
  mem.lastAt = performance.now();
}

function prior(kind) {
  for (let i = mem.thread.length - 1; i >= 0; i--) {
    if (mem.thread[i].kind === kind) return mem.thread[i];
  }
  return null;
}

function once(key) {
  if (mem.said.has(key)) return false;
  mem.said.add(key);
  if (mem.said.size > 80) {
    const drop = [...mem.said].slice(0, 20);
    for (const k of drop) mem.said.delete(k);
  }
  return true;
}

function withSuggest(line, view) {
  if (!line) return null;
  const hint = suggestFor(line, view);
  if (hint) line.suggest = hint;
  line.card = situationCard(view);
  return line;
}

/** Pick the next line, or null. */
export function considerThought(view, now = performance.now()) {
  if (!view) return null;

  const livingSignal = view.beings + view.swarm + (view.front > 0.05 ? 1 : 0)
    + (view.sparkHunt || view.sparkBirth ? 1 : 0);
  if (view.thrive && livingSignal === 0) mem.silence++;
  else mem.silence = Math.max(0, mem.silence - 2);

  const warn = diagnose(view);
  if (warn && cooled('warn', now) && once(warn.key)) {
    remember('warn', warn.text, 'warn');
    return withSuggest({ kicker: 'Cernunnos', text: warn.text, tone: 'warn', key: warn.key }, view);
  }

  const wild = wildBeat(view);
  if (wild && cooled('wild', now) && once(wild.key)) {
    remember(wild.kind, wild.text, 'wild');
    return withSuggest({ kicker: 'Cernunnos', text: wild.text, tone: 'wild', key: wild.key }, view);
  }

  const dwell = dwellBeat(view, now);
  if (dwell && cooled('dwell', now) && once(dwell.key)) {
    remember(dwell.kind, dwell.text, 'dwell');
    return withSuggest({
      kicker: 'Cernunnos',
      text: dwell.text,
      tone: 'quiet',
      key: dwell.key,
      kind: dwell.kind,
    }, view);
  }

  if (!cooled('soft', now) && !cooled('quiet', now)) return null;

  const soft = softBeat(view);
  if (soft && once(soft.key)) {
    const tone = soft.tone || 'soft';
    if (!cooled(tone, now)) return null;
    remember(soft.kind, soft.text, tone);
    return withSuggest({ kicker: 'Cernunnos', text: soft.text, tone, key: soft.key }, view);
  }
  return null;
}

function suggestFor(line, view) {
  if (!view) return null;
  const sys = view.systems || {};
  if (line.tone === 'warn') {
    if (/nothing walks|painted/i.test(line.text)) return 'Descend and wait — or seed a herd on green cover.';
    if (/no cross|swarm/i.test(line.text)) return 'Check Living marks on the globe, or rename a herd.';
    if (/running|fire/i.test(line.text)) return 'Watch the square, or cool the brush.';
    if (/too warm|canopy/i.test(line.text)) return 'Shade, rain, or tilt — Climate tools.';
    if (/oxygen|air forgot/i.test(line.text)) return 'Grow canopy again before bodies return.';
    return 'Read the Lab strip — something is off-balance.';
  }
  if (sys.burning) return 'Follow ash downwind, or put the fire out.';
  if (sys.settling) return 'Stay for a day-watch, or open Sample on the roofs.';
  if (view.dwellMs > DWELL_MS && view.life > 0.15) return 'Pin the map, or set Track → Life and clear the pin (·).';
  if (view.jumps > 4 && line.kind === 'dwell') return 'Slow the tour — one square still has more to say.';
  if (view.hunts > 0 || view.sparkHunt) return 'Stay with the hunt, or lift to see the herd cross.';
  if (sys.cold) return 'Wait for melt, or nudge insolation.';
  return null;
}

function dwellBeat(view, now) {
  if (view.cell < 0 || (view.dwellMs || 0) < DWELL_MS) return null;
  if (!cooled('dwell', now)) return null;

  const place = view.place ? decap(view.place) : 'this square';
  const sys = view.systems || {};

  if (sys.paintedQuiet) {
    return {
      kind: 'dwell',
      key: `dwell:quiet:${view.cell}:${(view.year / 40) | 0}`,
      text: `Still on ${place}. Cover is thick; feet have not arrived.`,
    };
  }
  if (view.beings > 3 && view.life > 0.2) {
    return {
      kind: 'dwell',
      key: `dwell:life:${view.cell}:${(view.year / 40) | 0}`,
      text: `You linger on ${place}. Bodies keep rewriting the same patch.`,
    };
  }
  if (view.fire > 0.2) {
    return {
      kind: 'dwell',
      key: `dwell:fire:${view.cell}:${(view.year / 30) | 0}`,
      text: `Still watching flame on ${place}. Ash is the longer sentence.`,
    };
  }
  if (view.jumps >= 5) {
    return {
      kind: 'dwell',
      key: `dwell:tour:${(view.year / 50) | 0}`,
      text: `The map has jumped often. ${place[0].toUpperCase()}${place.slice(1)} is where you finally stopped.`,
    };
  }
  return {
    kind: 'dwell',
    key: `dwell:hold:${view.cell}:${(view.year / 45) | 0}`,
    text: `Holding ${place}. The square has not finished speaking.`,
  };
}

function diagnose(view) {
  if (!view.thrive) return null;
  if (view.paused && mem.silence > 40) {
    return {
      key: `diag:paused:${view.year}`,
      text: 'The clock is held. The thicket waits with it.',
    };
  }
  if (mem.silence > 90 && ((W.lifeGrown || 0) > 0.05 || view.life > 0.15 || (W.meanLife || 0) > 0.04)) {
    return {
      key: `diag:silence:${(view.year / 50) | 0}`,
      text: 'Life is painted on. Nothing walks. The front is still — check the living layer.',
    };
  }
  if ((W.herdMax || 0) >= 6 && view.swarm === 0) {
    return {
      key: `diag:swarmmiss:${(view.year / 40) | 0}`,
      text: 'A herd was named, but the globe shows no cross. Marks may be sleeping.',
    };
  }
  if (view.fire > 0.35 && view.flees === 0 && view.beings > 2) {
    return {
      key: `diag:noflee:${view.cell}:${(view.year / 20) | 0}`,
      text: 'Fire on the square. Bodies still feed. They should be running.',
    };
  }
  if ((W.meanTemp || 0) > 0.92) {
    return {
      key: `diag:hot:${(view.year / 100) | 0}`,
      text: 'The rock is too warm. The canopy will not hold this for long.',
    };
  }
  if ((W.gases?.O2 || 0) < 0.01 && view.moments.firstOxygen && view.beings > 5) {
    return {
      key: `diag:o2gone:${(view.year / 80) | 0}`,
      text: 'Free oxygen came — and left. The air forgot what it learned.',
    };
  }
  return null;
}

function wildBeat(view) {
  if (view.sparkHunt) {
    const place = view.place ? ` on ${decap(view.place)}` : '';
    const before = prior('hunt');
    const text = before
      ? `Another strike${place}. The hunt keeps writing the same line.`
      : `Blood on the square${place}. A hunt lands.`;
    return { kind: 'hunt', key: `hunt:${view.year}:${view.cell}`, text };
  }
  if (view.hunts > 0) {
    return {
      kind: 'hunt',
      key: `hunting:${view.year}:${view.hunts}`,
      text: view.place
        ? `Something hunts through ${decap(view.place)}.`
        : 'Wedges of red — the hunt is up.',
    };
  }
  if (view.sparkBirth) {
    const herd = view.herdName ? ` Near ${view.herdName}.` : '';
    return {
      kind: 'birth',
      key: `birth:${view.year}:${view.cell}`,
      text: `A birth ring opens.${herd}`,
    };
  }
  if (view.swarm >= 1 && view.herdName) {
    const dusk = view.sun < -0.15;
    return {
      kind: 'herd',
      key: `herd:${view.herdName}:${(view.year / 30) | 0}`,
      text: dusk
        ? `${view.herdName} still moves in the dark.`
        : `${view.herdName} crosses the rim — antlers of motion from orbit.`,
    };
  }
  if (view.fire > 0.4) {
    return {
      kind: 'fire',
      key: `fire:${view.cell}:${(view.year / 15) | 0}`,
      text: view.place
        ? `Flame takes ${decap(view.place)}. Ash will remember.`
        : 'The square burns. Ash will remember.',
    };
  }
  if (view.flees > 2) {
    return {
      kind: 'flee',
      key: `flee:${view.year}`,
      text: 'Orange dashes — the thicket breaks and runs.',
    };
  }
  for (const e of view.recent) {
    if (!e.label) continue;
    if (/herd|hunt|birth|bloom|fire|erupt|extinct/i.test(`${e.kind} ${e.label}`)) {
      const key = `echo:${e.kind}:${e.year}:${e.label.slice(0, 24)}`;
      return {
        kind: 'echo',
        key,
        text: threadEcho(e, view),
      };
    }
  }
  return null;
}

function threadEcho(e, view) {
  const age = e.year != null ? formatAge(e.year) : '';
  const here = view.place ? ` Here: ${decap(view.place)}.` : '';
  if (/herd/i.test(e.kind + e.label)) {
    return `${e.label}.${here}`.trim();
  }
  if (/extinct|kill/i.test(e.kind + e.label)) {
    return `The chronicle still carries it — ${e.label}.${age ? ` (${age})` : ''}`;
  }
  if (/oxygen|GOE|photosynth/i.test(e.label)) {
    return `Since ${e.label.toLowerCase()}, the air has a different taste.${here}`;
  }
  return `${e.label}.${here}`.trim();
}

function softBeat(view) {
  if (view.cell < 0) return null;
  const focusShift = view.cell !== mem.lastFocus;
  mem.lastFocus = view.cell;

  const sun = view.sun;
  if (sun < -0.25 && focusShift) {
    const priorHerd = prior('herd');
    const text = priorHerd
      ? `Night on ${decap(view.place) || 'the square'}. ${clipName(priorHerd.text)} already passed.`
      : view.place
        ? `Night gathers on ${decap(view.place)}.`
        : 'The valley goes dark.';
    return { kind: 'dusk', key: `dusk:${view.cell}:${(view.year / 40) | 0}`, text, tone: 'quiet' };
  }
  if (sun > 0.2 && focusShift && view.life > 0.2) {
    return {
      kind: 'dawn',
      key: `dawn:${view.cell}:${(view.year / 40) | 0}`,
      text: view.place
        ? `Light returns to ${decap(view.place)}.`
        : 'The light returns.',
      tone: 'quiet',
    };
  }

  if (view.front > 0.12 && view.life < 0.35) {
    return {
      kind: 'front',
      key: `front:${(view.year / 25) | 0}:${view.cell}`,
      text: 'The edge advances — life into the thin places.',
      tone: 'soft',
    };
  }

  if (view.build > 0.25 && view.settlers > 0) {
    const town = view.build > 0.55 ? 'a town' : view.build > 0.35 ? 'a village' : 'a camp';
    return {
      kind: 'town',
      key: `town:${view.cell}:${(view.year / 60) | 0}`,
      text: `Smoke-thought over ${town}. Roofs hold against the wild.`,
      tone: 'soft',
    };
  }

  if (view.place && focusShift && view.life > 0.08) {
    const o2 = view.moments.firstOxygen;
    const text = o2
      ? `${view.place} — and free oxygen already in the air's memory.`
      : `${view.place}.`;
    return {
      kind: 'place',
      key: `place:${view.cell}:${(view.year / 50) | 0}`,
      text,
      tone: 'soft',
    };
  }

  if (view.thrive && view.beings === 0 && view.life > 0.25 && cooled('soft', performance.now())) {
    return {
      kind: 'still',
      key: `still:${view.cell}:${(view.year / 40) | 0}`,
      text: 'Green without feet. The cover is dense; the bodies have not arrived.',
      tone: 'soft',
    };
  }

  return null;
}

function decap(s) {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function clipName(text) {
  const m = text.match(/^([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)?)/);
  return m ? m[1] : 'That herd';
}

export function thoughtMemory() {
  return {
    lines: mem.lines.slice(),
    thread: mem.thread.map((t) => ({ ...t })),
    silence: mem.silence,
    dwellMs: mem.dwellCell >= 0
      ? Math.max(0, performance.now() - mem.dwellSince)
      : 0,
    jumps: mem.jumps,
  };
}
