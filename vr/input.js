/** Planet input binding — architecture-400 R41.
 *  Keyboard path owns DOM keydown for planet/local intents.
 *  Pointer/touch/XR call dispatchIntent from main (R42/R43).
 */

import { matchKey } from './sim/keymap.js';
import { dispatchIntent, onIntent } from './sim/intents.js';

/**
 * @typedef {object} PlanetInputApi
 * @property {() => boolean} planetCanvasFocused
 * @property {() => boolean} localActive
 * @property {(yaw: number, pitch: number) => void} spinPlanet
 * @property {(dir: number) => void} zoomPlanet
 * @property {(dx: number, dy: number) => void} moveKbCursor
 * @property {() => void} descendKeyboard
 * @property {() => void} applyToolAtKbCursor
 * @property {(dx: number, dy: number) => void} nudgeLocal
 * @property {(tool: object) => void} adoptTool
 * @property {(msg: string) => void} [announcePlanet]
 * @property {(W: object) => Record<string, boolean>} toolsUnlocked
 * @property {object} W
 * @property {object[]} TOOLS
 * @property {(e: KeyboardEvent) => boolean} [handleEscape]
 * @property {(e: KeyboardEvent) => void} [handleGlobal]
 */

/**
 * Bind planet/local keymap → intents. Returns an unbind function.
 * @param {Window|Document} target
 * @param {PlanetInputApi} api
 */
export function bindPlanetKeys(target, api) {
  const offs = [
    onIntent('cursor', (i) => api.moveKbCursor(i.payload.dx || 0, i.payload.dy || 0)),
    onIntent('descend', () => api.descendKeyboard()),
    onIntent('localNudge', (i) => api.nudgeLocal(i.payload.dx || 0, i.payload.dy || 0)),
    onIntent('act', (i) => {
      // Keyboard applies at the kb cursor; pointer/touch/XR pass cell in payload (R43).
      if (i.source && i.source !== 'keyboard') return;
      api.applyToolAtKbCursor(i.payload || {});
    }),
    onIntent('zoom', (i) => {
      if (i.source === 'xr') return; // XR scale applied by caller
      if (i.source === 'pointer' && typeof api.zoomByFactor === 'function' && i.payload.factor != null) {
        api.zoomByFactor(i.payload.factor);
        return;
      }
      api.zoomPlanet(i.payload.dir || 0);
    }),
    onIntent('spin', (i) => {
      if (i.source === 'keyboard') {
        api.spinPlanet(i.payload.yaw || 0, i.payload.pitch || 0);
        return;
      }
      // Pointer / XR continuous spin applied by caller; logged here for R43.
    }),
    onIntent('pan', (i) => {
      api.panGlobe?.(i.payload.dx || 0, i.payload.dy || 0);
    }),
    onIntent('arm', (i) => {
      const tool = i.payload.tool;
      if (!tool) return;
      if (api.toolsUnlocked(api.W)[tool.id] === false) return;
      api.adoptTool(tool);
      api.announcePlanet?.(`Tool ${tool.name}`);
    }),
  ];

  const onKey = (e) => {
    if (api.handleEscape?.(e)) return;
    if (e.key === 'Enter' && e.shiftKey && api.planetCanvasFocused()) {
      e.preventDefault();
      dispatchIntent('descend', {}, 'keyboard');
      return;
    }
    if (api.planetCanvasFocused()) {
      const planetBind =
        matchKey(e.key, 'planet') ||
        (e.code === 'Backslash' ? matchKey('\\', 'planet') : null);
      if (planetBind) {
        e.preventDefault();
        dispatchIntent(planetBind.intent, planetBind.payload || {}, 'keyboard');
        return;
      }
      const armed =
        api.TOOLS.find((x) => x.key && x.key === e.key) ||
        api.TOOLS.find((x) => x.key && x.key.toLowerCase() === e.key.toLowerCase());
      if (armed && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        dispatchIntent('arm', { tool: armed }, 'keyboard');
        return;
      }
    } else if (api.localActive()) {
      const localBind = matchKey(e.key, 'local');
      if (localBind?.intent === 'localNudge') {
        e.preventDefault();
        dispatchIntent('localNudge', localBind.payload || {}, 'keyboard');
        return;
      }
    }
    api.handleGlobal?.(e);
  };

  target.addEventListener('keydown', onKey);
  return () => {
    target.removeEventListener('keydown', onKey);
    for (const off of offs) off();
  };
}

export { dispatchIntent };
