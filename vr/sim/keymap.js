/** Keyboard intents — quality-400 M9/M10/M7.
 *  Data table so shortcuts can be shown and later rebound.
 *  Planet actions apply when `#c` (the globe canvas) is focused. */

/** @typedef {'spin'|'zoom'|'cursor'|'act'|'descend'|'recenter'|'localNudge'|'arm'|'pan'|'close'|'meta'} KeyIntent */

/**
 * @typedef {object} KeyBinding
 * @property {string} id
 * @property {string[]} keys
 * @property {KeyIntent} intent
 * @property {string} when  'planet' | 'always' | 'local'
 * @property {string} label
 * @property {object} [payload]
 */

/** @type {readonly KeyBinding[]} */
export const KEYMAP = Object.freeze([
  {
    id: 'spin-left',
    keys: ['ArrowLeft'],
    intent: 'spin',
    when: 'planet',
    label: 'Spin left',
    payload: { yaw: 1 },
  },
  {
    id: 'spin-right',
    keys: ['ArrowRight'],
    intent: 'spin',
    when: 'planet',
    label: 'Spin right',
    payload: { yaw: -1 },
  },
  {
    id: 'spin-up',
    keys: ['ArrowUp'],
    intent: 'spin',
    when: 'planet',
    label: 'Tilt up',
    payload: { pitch: 1 },
  },
  {
    id: 'spin-down',
    keys: ['ArrowDown'],
    intent: 'spin',
    when: 'planet',
    label: 'Tilt down',
    payload: { pitch: -1 },
  },
  {
    id: 'cursor-w',
    keys: ['a', 'A'],
    intent: 'cursor',
    when: 'planet',
    label: 'Cursor west',
    payload: { dx: -1, dy: 0 },
  },
  {
    id: 'cursor-e',
    keys: ['d', 'D'],
    intent: 'cursor',
    when: 'planet',
    label: 'Cursor east',
    payload: { dx: 1, dy: 0 },
  },
  {
    id: 'cursor-n',
    keys: ['w', 'W'],
    intent: 'cursor',
    when: 'planet',
    label: 'Cursor north',
    payload: { dx: 0, dy: -1 },
  },
  {
    id: 'cursor-s',
    keys: ['s', 'S'],
    intent: 'cursor',
    when: 'planet',
    label: 'Cursor south',
    payload: { dx: 0, dy: 1 },
  },
  {
    id: 'zoom-in',
    keys: ['+', '='],
    intent: 'zoom',
    when: 'planet',
    label: 'Zoom in',
    payload: { dir: -1 },
  },
  {
    id: 'zoom-out',
    keys: ['-', '_'],
    intent: 'zoom',
    when: 'planet',
    label: 'Zoom out',
    payload: { dir: 1 },
  },
  {
    id: 'act',
    keys: ['Enter'],
    intent: 'act',
    when: 'planet',
    label: 'Apply tool at cursor (Inspect → descend)',
  },
  {
    id: 'descend',
    keys: ['\\'],
    intent: 'descend',
    when: 'planet',
    label: 'Descend / open local map',
  },
  { id: 'recenter', keys: ['Home'], intent: 'recenter', when: 'always', label: 'Recenter camera' },
  {
    id: 'local-nudge-l',
    keys: ['ArrowLeft'],
    intent: 'localNudge',
    when: 'local',
    label: 'Nudge map west',
    payload: { dx: -1, dy: 0 },
  },
  {
    id: 'local-nudge-r',
    keys: ['ArrowRight'],
    intent: 'localNudge',
    when: 'local',
    label: 'Nudge map east',
    payload: { dx: 1, dy: 0 },
  },
  {
    id: 'local-nudge-u',
    keys: ['ArrowUp'],
    intent: 'localNudge',
    when: 'local',
    label: 'Nudge map north',
    payload: { dx: 0, dy: -1 },
  },
  {
    id: 'local-nudge-d',
    keys: ['ArrowDown'],
    intent: 'localNudge',
    when: 'local',
    label: 'Nudge map south',
    payload: { dx: 0, dy: 1 },
  },
]);

export function keymapFor(when) {
  return KEYMAP.filter((b) => b.when === when);
}

export function matchKey(key, when) {
  return KEYMAP.find((b) => b.when === when && b.keys.includes(key)) || null;
}

/** Short help lines for the View → Keys desk / shortcuts sheet. */
export function keymapHelpLines() {
  return [
    'Planet focused (Tab / click globe): ←→↑↓ spin · WASD cursor · +/− zoom',
    'Letter key arms a tool · Enter applies it at the cursor · Inspect+Enter or \\ descends',
    'Shift+Enter always descends · Esc closes overlays · Home recenter · Space pause · ? tour',
  ];
}
