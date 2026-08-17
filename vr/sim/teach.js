/** First-run teaching — reveal systems in order.
 *  Next backlog teach category. */

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

const KEY = 'orrery.reveal.v1';

export function loadRevealProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { step: 0, done: false };
    return JSON.parse(raw);
  } catch {
    return { step: 0, done: false };
  }
}

export function saveRevealProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* */ }
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

export function campaignBlurb(id) {
  const map = {
    'daisy-tutorial': 'Daisyworld — learn feedback with two colours of life.',
    'climate-only': 'Climate levers only. No seeding. Feel the thermostat.',
    'grow-hostile': 'Grow something on a hostile catalogue world.',
    'save-snowball': 'Arrive mid-catastrophe. Find the intervention that works.',
    'recreate-earth': 'Deep time Earth — land the big chapters within tolerance.',
    'hands-off': 'Set genesis. Touch nothing. Four billion years.',
  };
  return map[id] || id;
}
