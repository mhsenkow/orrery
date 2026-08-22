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

## Headset
Not yet measured on-device. Blocking third-party fonts removed (K11) so TTFF is no longer gated on Google Fonts RTT.

## Follow-ups (not this gate)
- Bundle / code-split entry (K*)
- Defer non-boot docks (catalogue / Dark on demand)
- Re-measure Quest Browser and paste numbers here

## Budget (K4)
- **Target:** first globe paint under **4 s** on a recent laptop over localhost (warm disk).
- **Stretch:** under **8 s** on mid-tier phone / Quest Browser (to be measured).
- Ratchet (K5) is not CI-wired yet — numbers live here and in [`shipped.md`](shipped.md).
