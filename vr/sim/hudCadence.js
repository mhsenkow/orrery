/** HUD refresh cadences — quality-400 L17.
 *  updateHUD consults this table so panel refresh rates are declared, not magic. */

export const HUD_CADENCE_MS = Object.freeze({
  /** Full Lab / topbar rewrite */
  hud: 500,
  /** Dark chip when ?dark=1 */
  dark: 500,
  /** Climate / Sky desk */
  climate: 400,
  /** Rock / plates desk */
  rock: 600,
  /** Sandbox mode strip */
  modes: 800,
});
