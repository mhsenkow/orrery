/** First-run teaching — a door, a campaign track, and map hunts.
 *  Old REVEAL steps still exist for anyone mid-card; new visits get LESSONS.
 *
 *  Acquisition is not this file: first visit uses the Vandal Strike hook
 *  (`sim/hooks.js`) — Ignite / Meteor — not a lesson card. Evil / Dark is never
 *  part of the Tour or demo path (NEXT #7). */

export const REVEAL = [
  {
    id: 'hold',
    title: 'Hold a world',
    body: 'Drag to spin. Scroll to come closer. This is one planet — geology, air, water, and whatever life it can keep.',
    action: 'Spin it once',
  },
  {
    id: 'watch',
    title: 'Watch before you act',
    body: 'The clock is already running. Ice, clouds, and colour are the model speaking. Looking is always free.',
    action: 'Open Lab',
  },
  {
    id: 'redox',
    title: 'Life is chemistry first',
    body: 'The redox tower is who eats whose electrons. Morphology comes later. Hover a guild in Lab to light it on the globe.',
    action: 'Hover the tower',
  },
  {
    id: 'brush',
    title: 'Touch the cause',
    body: 'Raise crust, not just height. Seed a guild, not a sprite. The planet will argue — weathering, ice, extinction.',
    action: 'Try one tool',
  },
  {
    id: 'deep',
    title: 'Deep time',
    body: 'Turn on Deep time to start at formation. Ticks stretch from millions of years to seasons. Moments pause the rush.',
    action: 'Optional: Deep time',
  },
  {
    id: 'watchmode',
    title: 'Leave it running',
    body: 'Watch mode hides the dock. Come back in an hour. Restraint is a way of playing.',
    action: 'Watch mode',
  },
];

/** Front-door cards + follow-on hunts. The Solar System looks are the tour. */
export const LESSONS = [
  {
    id: 'hold-earth',
    door: true,
    kicker: 'Sandbox',
    title: 'Hold Earth',
    body: 'Hold a planet. This one is Earth. Spin it, scroll in, then click the coast to open the map — that is where you can stand.',
    action: 'Keep this Earth',
    winHint: 'You spun it, came closer, and opened the map. Looking is always free.',
  },
  {
    id: 'daisy',
    door: true,
    kicker: 'Lesson',
    title: 'Learn feedback',
    body: 'Daisyworld: black daisies warm, white daisies cool. No continents — just the proof that regulation needs no foresight.',
    scenario: 'daisy-tutorial',
    action: 'Start Daisyworld',
    winHint: 'Temperature is holding. That is the whole lesson.',
  },
  {
    id: 'hunt-mars',
    door: true,
    kicker: 'Tour',
    title: 'Visit Mars',
    body: 'Rust, not grassland. Hover the local map until a chip says rust — the square is iron dust, not a biome.',
    catalogue: 'Mars',
    hunt: ['rust'],
    action: 'Go to Mars',
  },
  {
    id: 'crisis',
    door: true,
    kicker: 'Challenge',
    title: 'A crisis',
    body: 'Arrive at a snowball. Break the ice without sterilising the world. Rescue is a different skill from creation.',
    scenario: 'save-snowball',
    action: 'Arrive mid-ice',
  },
  {
    id: 'hunt-io',
    kicker: 'Tour',
    title: 'Yellow for a reason',
    body: 'Io is sulfur allotropes and lava lakes, not sand. Find a sulfur or patera square.',
    catalogue: 'Io',
    hunt: ['sulfur', 'patera', 'lava'],
    action: 'Go to Io',
  },
  {
    id: 'hunt-europa',
    kicker: 'Tour',
    title: 'A lid, not a glacier',
    body: 'Europa’s cracks are the ice shell sliding. Find a linea or chaos square — not “ice on rock.”',
    catalogue: 'Europa',
    hunt: ['linea', 'chaos'],
    action: 'Go to Europa',
  },
  {
    id: 'hunt-titan',
    kicker: 'Tour',
    title: 'Rain that is not water',
    body: 'Titan’s hydrology is methane. Find a CH₄ lake or the equatorial organic dunes.',
    catalogue: 'Titan',
    hunt: ['methaneLake', 'dune'],
    action: 'Go to Titan',
  },
];

export const DOOR_IDS = LESSONS.filter((l) => l.door).map((l) => l.id);
export const TOUR_IDS = ['hunt-mars', 'hunt-io', 'hunt-europa', 'hunt-titan'];

const REVEAL_KEY = 'orrery.reveal.v1';
const LESSON_KEY = 'orrery.lessons.v1';

export function loadRevealProgress() {
  try {
    const raw = localStorage.getItem(REVEAL_KEY);
    if (!raw) return { step: 0, done: false };
    return JSON.parse(raw);
  } catch {
    return { step: 0, done: false };
  }
}

export function saveRevealProgress(p) {
  try { localStorage.setItem(REVEAL_KEY, JSON.stringify(p)); } catch { /* */ }
}

export function currentReveal(progress = loadRevealProgress()) {
  if (progress.done) return null;
  return REVEAL[progress.step] || null;
}

export function advanceReveal(progress = loadRevealProgress()) {
  const next = { ...progress, step: (progress.step || 0) + 1 };
  if (next.step >= REVEAL.length) next.done = true;
  saveRevealProgress(next);
  return next;
}

export function skipReveal() {
  const p = { step: REVEAL.length, done: true };
  saveRevealProgress(p);
  return p;
}

export function emptyLessonProgress() {
  return { seenDoor: false, current: null, done: {} };
}

export function loadLessonProgress() {
  try {
    const raw = localStorage.getItem(LESSON_KEY);
    if (!raw) return emptyLessonProgress();
    const p = JSON.parse(raw);
    return {
      seenDoor: !!p.seenDoor,
      current: p.current || null,
      done: p.done && typeof p.done === 'object' ? p.done : {},
    };
  } catch {
    return emptyLessonProgress();
  }
}

export function saveLessonProgress(p) {
  try { localStorage.setItem(LESSON_KEY, JSON.stringify(p)); } catch { /* */ }
}

export function lessonById(id) {
  return LESSONS.find((l) => l.id === id) || null;
}

export function markDoorSeen(progress = loadLessonProgress()) {
  const next = { ...progress, seenDoor: true, done: { ...progress.done } };
  saveLessonProgress(next);
  return next;
}

export function setCurrentLesson(id, progress = loadLessonProgress()) {
  const next = { ...progress, seenDoor: true, current: id, done: { ...progress.done } };
  saveLessonProgress(next);
  return next;
}

export function completeLesson(id, progress = loadLessonProgress()) {
  const done = { ...progress.done, [id]: true };
  const nextTour = TOUR_IDS.includes(id)
    ? TOUR_IDS[TOUR_IDS.indexOf(id) + 1] || null
    : null;
  const next = {
    ...progress,
    seenDoor: true,
    done,
    current: nextTour || (progress.current === id ? null : progress.current),
  };
  saveLessonProgress(next);
  return next;
}

export function lessonDone(id, progress = loadLessonProgress()) {
  return !!progress.done?.[id];
}

export function huntKeysOf(lesson) {
  if (!lesson?.hunt) return [];
  return Array.isArray(lesson.hunt) ? lesson.hunt : [lesson.hunt];
}

export function nextTourAfter(id) {
  const i = TOUR_IDS.indexOf(id);
  if (i < 0) return null;
  return TOUR_IDS[i + 1] || null;
}

export function campaignBlurb(id) {
  const lesson = lessonById(id);
  if (lesson) return lesson.body;
  const map = {
    'daisy-tutorial': 'Daisyworld — learn feedback with two colours of life.',
    'climate-only': 'Climate levers only. No seeding. Feel the thermostat.',
    'grow-hostile': 'Grow something on a hostile catalogue world.',
    'save-snowball': 'Arrive mid-catastrophe. Find the intervention that works.',
    'recreate-earth': 'Deep time Earth — land the big chapters within tolerance.',
    'hands-off': 'Set genesis. Touch nothing. Four billion years.',
    'weather-sandbox': 'Spin, tilt, moon — watch tides and winds without touching life.',
  };
  return map[id] || id;
}

export function shouldOfferDoor(progress = loadLessonProgress()) {
  return !progress.seenDoor;
}

/** Re-open the front door without wiping lesson progress. */
export function offerTourAgain(progress = loadLessonProgress()) {
  return { ...progress, seenDoor: false };
}

/** Wipe tour progress so the next open starts from Hold Earth. */
export function resetLessonProgress() {
  const next = emptyLessonProgress();
  saveLessonProgress(next);
  return next;
}

export function nextIncompleteLesson(progress = loadLessonProgress()) {
  return LESSONS.find((l) => !progress.done?.[l.id]) || null;
}

export function lessonChipLabel(progress = loadLessonProgress()) {
  const total = LESSONS.length;
  const doneN = LESSONS.filter((l) => progress.done?.[l.id]).length;
  if (doneN >= total) return `Tour complete · ${total}/${total}`;
  const cur = lessonById(progress.current) || nextIncompleteLesson(progress);
  return `Lesson ${Math.min(doneN + 1, total)}/${total} · ${cur.title}`;
}

export function huntMatches(key, lesson) {
  if (!key || !lesson) return false;
  return huntKeysOf(lesson).includes(key);
}
