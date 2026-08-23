# Test suite timing — quality-400 F12

Measured 2026-08-21 on a laptop (Node 22). Re-run after moving long cases.

## Fast tier (`npm run test:fast`)

Typically **~7–8 s**: smoke (~4 s, includes SS fidelity at N=32) + one v9 save round-trip (~3 s).

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
