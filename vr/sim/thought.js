/** Cernunnos voice — floating train-of-thought about the view.
 *  Story first (dense, animal, seasonal). Diagnosis when the living layer
 *  goes quiet or stuck. Not a UI toast catalogue — a thread you overhear. */

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
};

/** @type {{
 *  lines: string[],
 *  said: Set<string>,
 *  lastAt: number,
 *  lastTone: string,
 *  thread: { kind: string, at: number, text: string }[],
 *  silence: number,
 *  lastFocus: number,
 * }} */
const mem = {
  lines: [],
  said: new Set(),
  lastAt: 0,
  lastTone: '',
  thread: [],
  silence: 0,
  lastFocus: -1,
};

export function resetThought() {
  mem.lines.length = 0;
  mem.said.clear();
  mem.lastAt = 0;
  mem.lastTone = '';
  mem.thread.length = 0;
  mem.silence = 0;
  mem.lastFocus = -1;
}

/** Snapshot of what the player is looking at. */
export function thoughtView(opts = {}) {
  const cell = opts.cell ?? -1;
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

/** Pick the next line, or null. */
export function considerThought(view, now = performance.now()) {
  if (!view) return null;

  const livingSignal = view.beings + view.swarm + (view.front > 0.05 ? 1 : 0)
    + (view.sparkHunt || view.sparkBirth ? 1 : 0);
  if (view.thrive && livingSignal === 0) mem.silence++;
  else mem.silence = Math.max(0, mem.silence - 2);

  // --- Diagnosis first ---
  const warn = diagnose(view);
  if (warn && cooled('warn', now) && once(warn.key)) {
    remember('warn', warn.text, 'warn');
    return { kicker: 'Cernunnos', text: warn.text, tone: 'warn', key: warn.key };
  }

  // --- Hard living beats in / near the view ---
  const wild = wildBeat(view);
  if (wild && cooled('wild', now) && once(wild.key)) {
    remember(wild.kind, wild.text, 'wild');
    return { kicker: 'Cernunnos', text: wild.text, tone: 'wild', key: wild.key };
  }

  // --- Soft place / season / thread continuity ---
  if (!cooled('soft', now) && !cooled('quiet', now)) return null;

  const soft = softBeat(view);
  if (soft && once(soft.key)) {
    const tone = soft.tone || 'soft';
    if (!cooled(tone, now)) return null;
    remember(soft.kind, soft.text, tone);
    return { kicker: 'Cernunnos', text: soft.text, tone, key: soft.key };
  }
  return null;
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
  // Chronicle echo into the view
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
  };
}
