# Accessibility — quality-400 M40

What works today on the flat-screen product surface, what does not, and what is next.
Companion honesty docs: [`model-limits.md`](model-limits.md), [`../PLAYTESTS.md`](../PLAYTESTS.md).

## Works

| Path | Notes |
|---|---|
| **Keyboard → planet** | Focus `#c` (Tab or click). Arrows spin; WASD moves a cell cursor; `+` / `−` zoom. |
| **Keyboard → tools (M7)** | Letter key arms a tool; **Enter** applies it at the cursor. **Inspect + Enter** (or `\`, or Shift+Enter) descends into the local map. |
| **Shortcuts sheet** | Shift+`?` opens a dialog; Esc / backdrop closes it. View → Keys lists the same lines. |
| **Skip link** | “Skip to planet” appears on focus. |
| **Focus ring** | `:focus-visible` uses the shared gold token. |
| **Reduced motion** | CSS `prefers-reduced-motion` collapses transitions; `localview.js` already softens map motion. |
| **Escape** | Closes phone dock, origin, door lesson, key legend, shortcuts, catalogue, land picker, limits sheet, then steps local frame back. |
| **Buttons** | Dock controls are real `<button>`s with many `aria-pressed` states. |
| **Lang** | `vr/index.html` and `site/` use `lang="en"`. |
| **Live region** | `#planetLive` announces tool / descend / (throttled) cursor — polite, not chatty. |
| **Shortcuts sheet** | Shift+`?`; Esc or backdrop click closes; focus returns to the globe. |
| **Canvas focus** | Gold `:focus-visible` ring when the planet is the active control. |

## Partial

| Path | Notes |
|---|---|
| **Screen reader globe** | `role="application"` + label; climate/life summary is still thin. |
| **Irreversible tools** | Keyboard arms them and faces the cell; click/hold still commits (safety). |
| **Touch** | Phone dock ≥44px (M23); **pinch-out descends**, pinch-in steps back (M22). Local +/− and Enter/Esc are the button/keyboard equivalents (M24). Coarse targets expanded (T21). |
| **Dialogs** | Escape closes overlays; Tab is trapped in land picker, Worlds, shortcuts sheet, and map legend (M14). Focus restores on close. |
| **High contrast** | Mute/faint tokens raised for AA; `prefers-contrast: more` boosts ink/lines (L32/L33). Dedicated theme toggle still open. |
| **Contrast (T41)** | Solid token pairs audited in [`contrast-audit.md`](contrast-audit.md) / `vr/data/contrast-audit.json`. Watch translucent panel over bright globe (T42). |
| **Touch ≥44px (T21)** | Coarse-pointer rules in `vr/styles/phone.css` cover dock, tools, localpark, local bar, FABs. |

## Not yet

- Rebindable keys (M12)
- Screen-reader pass logged in playtests (M19)
- Full world browser UI beyond Diagnostics shelf line (I30 partial)
- Colour-blind overlay palettes (T47)

## Non-XR descent (M20)

Flat-screen descent **is** the permanent accessibility path: focus the globe → move the cursor → Enter (Inspect) or `\` → read the local map → Esc to step back. XR remains optional. See PURPOSE / product briefs for mechanic B as comfort, not as the only door.

## How to try

1. Open `/vr/`, click the globe (or Tab to it).
2. WASD to a coast; `m` to arm Meteor (or leave Inspect); Enter to apply or descend.
3. Shift+`?` for the shortcut card.
4. Report comfort in [`PLAYTESTS.md`](../PLAYTESTS.md) with `?playtest=1`.
