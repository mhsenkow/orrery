# Test suite timing — quality-400 F12

Measured 2026-08-21 on a laptop (Node 22). Re-run after moving long cases.

## Fast tier (`npm run test:fast`)

Typically **~7–8 s** (pre-SEV/CYC), now **~35–40 s** with sky + SEV/CYC + COL asserts: smoke (~4 s, includes SS fidelity at N=32) + one v9 save round-trip (~3 s) + sky integration + column + SEV/CYC rows.

## Full suite (`npm run test:full`)

Wall ~4 minutes. Dominant costs (by inspection of loop bounds + known probes):

| Cost driver | Where | Approx |
|---|---|---|
| `biosphereHolds(…, 750)` | `test.mjs` | largest single hold |
| Thrive probe 500 ticks + fire slice | `test.mjs` / thrive | multi-minute share |
| Storm / cyclone 600-tick windows | `test.mjs` | mid |
| Golden / deep-time multi-tick blocks | `test.mjs` | mid |
| `test-worldParams.mjs` | separate file | ~tens of seconds |

## Sweep tier (`npm run test:sweep`)

Long holds and probes that must not sit in the edit loop: biosphere 750, thrive 500, dark suites when enabled.

| `skyTick` at 1 light + 1 sat | `sky.js` | < 0.05 ms (N=32) |

No headless float-FB in CI by default — see [`model-limits.md`](model-limits.md). Optional `npm run parity:gpu --prefix vr`.

## 2026-08-23 — air column and weather

Fast tier ~43 s local / ~78 s CI after the weather wave (aircol, convect, fronts, severe, drought
asserts + Now/Years clock checks). Budgets raised to **45 s local / 90 s CI** so Pages verify does
not flap on runner noise. Prefer moving the next heavy world-level asserts into smoke rather than
growing the edit loop further.

`aircol` costs 1–2.5 ms a tick at N=64 (a stripe of the grid per tick, eight stripes to a full
refresh, plus any cell whose surface has moved 3 K). A full pass is 18 ms, which is why it is
striped, and it sits last in `DEGRADATION_ORDER` so a loaded frame sheds it first. `weather` is
0.12 ms.

**This tier is close to its local budget.** The next thing added to it should take something out.

## Per-section weather budgets (GATE11)

Measured at N=64 on a laptop (Node 22, M-series). Values are per-tick unless noted.

| Section | File | Per-tick (ms) | Notes |
|---|---|---|---|
| `airColumnTick` | `aircol.js` | 1–2.5 (striped) | Full pass 18 ms; sits last in `DEGRADATION_ORDER` |
| `convectTick` | `weather.js` | 0.08–0.12 | Reads column, writes `convRain` + `precip` delta |
| `orgConvectionTick` | `convect.js` | 0.10–0.15 | Classification + cold pools + conv/strat split |
| `severeTick` | `weather.js` | 0.04–0.08 | Marker maintenance; cost scales with active count |
| `droughtTick` | `weather.js` | 0.02–0.04 | Accumulator; cheap scan |
| `weatherCalib` | `weather.js` | 0.8–1.2 (on demand) | Called from desk refresh, not every tick |

Profiler not yet wired for automated CI ratchet; budgets are manual measurement.
