# Cold-start notes — quality-400 K1
# Measured 2026-08-21 on desktop Chrome (localhost, warm disk).
# Headset browser numbers still TODO — re-run on Quest browser when available.

## Method
- Open `/vr/` with DevTools Network + Performance.
- Hard reload; record until first painted globe frame (not boot spinner end).

## Desktop (localhost)
| Signal | Approx |
|---|---|
| HTML + CSS parse | <50 ms |
| Self-hosted fonts (woff2, 6 files) | ~100 KB compressed; no fonts.googleapis.com |
| JS module graph (unbundled) | dominant cost — multi-MB before first frame |
| Time to first globe paint | ~1.5–3 s on a recent laptop (varies with N) |

## Headset (Quest Browser)

**Status:** blocked — no headset available to measure (2026-08-22). Architecture-400 Q61.

**Method when available:** Quest Browser → live `/vr/` (or `dist/vr/` after `npm run build`); hard reload; Performance until first globe frame (not spinner / boot-disc end). Record N, build path, warm vs cold cache.

**Do not paste as headset TTFF:** Chrome remote-debug or UA spoof alone.

**Stretch budget:** under **8 s** (K4). Desktop localhost today: ~1.5–3 s.

## Progressive first frame (Q41)

- HTML paints `#bootload` with brand + static `.boot-disc` before the module graph.
- After `initGL`, `desktopFrame` starts so the WebGL clear/sky can paint while docks and `generate()` continue.

## Weather at cold start (GATE44)

A new player's first world has legible, not maximal, weather. The air column is diagnostic on the
first tick (striped rebuild fills in over eight ticks), so the first globe shows pressure bands and
cloud cover but not yet a mature sounding. Severe markers do not fire until CAPE has had time to
build — typically tick 3–5 on Earth. Drought needs ~20 ticks of memory. This means a new player
sees "weather exists" without being overwhelmed by warnings.

## Follow-ups (not this gate)
- ~~Bundle / code-split entry (K*)~~ — `npm run build` (architecture Q1); code-split chunks for dark/catalogue already via dynamic `import()`
- Defer non-boot docks (catalogue / Dark on demand) — partially landed
- Re-measure Quest Browser and paste numbers here (Q61)
- Deploy Pages from `dist/` (Q11) — still serves source today

## Budget (K4)
- **Target:** first globe paint under **4 s** on a recent laptop over localhost (warm disk).
- **Stretch:** under **8 s** on mid-tier phone / Quest Browser (to be measured).
- Ratchet (K5) is not CI-wired yet — numbers live here and in [`shipped.md`](shipped.md).
