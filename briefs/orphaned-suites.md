# Orphaned / parallel suites — quality-400 O

Inventory of runners that are **not** on the default `npm test` / `verify` path.
Do not delete without a replacement; promote or wire deliberately.

| Suite | Path | Default? | Notes |
|---|---|---|---|
| Fast | `vr/sim/test-fast.mjs` | yes (`npm test`) | <15 s |
| Full | `vr/sim/test.mjs` + `test-worldParams.mjs` | `test:full` | ~4 min |
| Smoke | `vr/sim/smoke.mjs` | via fast | chrome + SS asserts |
| Dark unit | `vr/sim/dark-test.mjs` | `test:dark` | Wired; not in default verify (Dark pause) |
| Dark scenario | `vr/sim/dark-scenario.mjs` | `test:dark-scenario` | Same |
| Calibrate | `vr/sim/calibrate.mjs` | fidelity | per-world bands |
| Headless / golden | `vr/sim/headless.mjs` | fidelity corpus | |
| Thrive probe | `scripts/thrive-probe.mjs` | sweep | 500-tick living |
| Origin sketch | `vr/sim/origin-sketch-test.mjs` | `test:origin` | Wired |
| Deeptime | `vr/sim/deeptime.mjs` | `test:deeptime` | Short `--ticks=40`; long runs stay sweep |
| Orphan gate | `scripts/orphan-suites.mjs` | via `verify` | O11 — every `*test*.mjs` must have a script |
| Scale | `vr/sim/scale.mjs` | no | XR ladder maths; device plan still manual |

**Policy:** new suites must declare a tier (`fast` / `full` / `sweep` / `manual`) in this table.
