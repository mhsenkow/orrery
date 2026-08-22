# Contrast audit — architecture-400 T41

Generated 2026-08-22. Solid-token WCAG ratios.

| FG | BG | Role | Ratio | Pass |
|---|---|---|---:|:---:|
| `--orr-ink` | `--orr-bg` | AA body | 17.43:1 | ✓ |
| `--orr-mute` | `--orr-bg` | AA secondary | 9.93:1 | ✓ |
| `--orr-faint` | `--orr-bg` | AA tertiary | 6.82:1 | ✓ |
| `--orr-ink` | `--orr-panel (opaque approx #080c14)` | AA on panel | 16.73:1 | ✓ |
| `--orr-mute` | `--orr-panel (opaque approx #080c14)` | AA dim on panel | 9.53:1 | ✓ |
| `--orr-faint` | `--orr-panel (opaque approx #080c14)` | AA faint on panel | 6.55:1 | ✓ |
| `--orr-accent` | `--orr-bg` | non-text 3:1 | 7.9:1 | ✓ |
| `--orr-ok` | `--orr-bg` | non-text 3:1 | 11.49:1 | ✓ |
| `--orr-amber` | `--orr-bg` | non-text 3:1 | 11.03:1 | ✓ |
| `--orr-gold` | `--orr-bg` | focus ring | 8.48:1 | ✓ |
| `--orr-ink (prefers-contrast)` | `--orr-bg` | hi-contrast ink | 18.99:1 | ✓ |
| `--orr-mute (prefers-contrast)` | `--orr-bg` | hi-contrast mute | 13.08:1 | ✓ |
| `--orr-faint (prefers-contrast)` | `--orr-bg` | hi-contrast faint | 10.18:1 | ✓ |

**Failures:** 0

T41 — solid pairs only. Translucent --orr-panel (0.78) over bright globe/ocean can drop effective contrast; prefer prefers-contrast denser panel or higher --orr-faint on those surfaces (T42).
