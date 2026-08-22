/** View / UI / run / world state bags — architecture-400 P61–P65.
 *
 *  Four kinds of state (do not dump everything onto `W`):
 *
 *  1. **World (`W`)** — simulated and (mostly) saved. Fields in `fields.js`.
 *  2. **View** — camera, overlay, hover, highlight. Lives in `main.js` `S` and
 *     `render.js` module scope (`overlayMode`, `_localHover`). Not saved.
 *  3. **UI** — panel open/closed, dock, active tab. DOM classes + `S`. Not on `W`.
 *  4. **Run meta** — seed, rule, world name, landscape, epoch. Prefer `serializeRun`
 *     meta / Run object (fidelity D46); avoid new keys on `W` for these.
 *
 *  Remaining W keys that are view/meta-adjacent (inventory — migrate when touching):
 *  `clockFace`, `seasonHold` (saved today), `_bootPhase`, `_canvasMode`, `_landscape`,
 *  `worldName`, dark UI prefs packed into save `dark`.
 */

/** Keys that must not grow on `W` without a fields.js row (P61 watchlist). */
export const VIEW_META_ON_W = Object.freeze([
  'clockFace',
  'seasonHold',
  'worldName',
  '_bootPhase',
  '_canvasMode',
  '_landscape',
]);

export function describeStateBags() {
  return {
    world: 'W — simulated fields (fields.js)',
    view: 'S + render.js — camera, overlay, hover',
    ui: 'DOM / S — docks, panels, tabs',
    run: 'serializeRun meta — seed, rule, landscape, epoch',
    leftoverOnW: VIEW_META_ON_W,
  };
}
