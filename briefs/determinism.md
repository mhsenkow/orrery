# Determinism audit

Generated 2026-08-22T01:46:27.084Z by `scripts/determinism-audit.mjs` (D1).

## Entropy sources

| Source | Status | Note |
|---|---|---|
| rngOf / mulberry streams | ok | Canonical sim entropy — forked per subsystem |
| freshSeed | allowed | UI / genesis only — not on sim tick path |
| Math.random | forbidden-in-sim | Lint fails under vr/sim and world.js |
| Date.now / performance.now | forbidden-in-sim | Lint; garden autosave timestamps are view-layer |
| crypto.getRandomValues | forbidden-in-sim | Not used in sim path |
| Object key iteration | watch | Prefer arrays / sorted keys in ticks |
| Array.sort ties | watch | Total-order comparators required (D5) |
| Map/Set iteration | watch | Polity maps must act in stable id order |
| GPU floats | not-bit-identical | Golden pins CPU path only (D15/D16) |
| Worker message order | n/a | Worker unused for sim state today |

## Policy

- **CPU path is the golden path.** GPU climate is not bit-identical across vendors (D15).
- **Different N is a different model**, not a different run (D14).
- **Art face:** fork-and-diverge hangs on the `Run` object (`vr/sim/run.js`).

## Lint hits (sim path)

- `vr/sim/darkAudio.js:113` **Date/performance.now** — `const t0 = typeof performance !== 'undefined' ? performance.now() : 0;`
- `vr/sim/darkAudio.js:179` **Date/performance.now** — `W.dark._audioSpentMs = performance.now() - t0;`
- `vr/sim/darkOrbit.js:30` **Math.random** — `period: opts.period != null ? opts.period : 20 + ((Math.random() * 40) | 0),`
- `vr/sim/darkOrbit.js:34` **Math.random** — `alt: opts.alt ?? 0.4 + Math.random() * 0.4,`
- `vr/sim/darkOrbit.js:121` **Math.random** — `if (s.owner === owner && s.alive && Math.random() < 0.3) {`
- `vr/sim/deeptime.mjs:131` **Date/performance.now** — `const t0 = performance.now();`
- `vr/sim/deeptime.mjs:138` **Date/performance.now** — `const elapsed = performance.now() - t0;`
- `vr/sim/deeptime.mjs:202` **Date/performance.now** — `const t0 = performance.now();`
- `vr/sim/deeptime.mjs:209` **Date/performance.now** — `const elapsed = performance.now() - t0;`
- `vr/sim/finale.js:94` **Date/performance.now** — `writtenAt: Date.now(),`
- `vr/sim/god/climate.js:307` **Date/performance.now** — `const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;`
- `vr/sim/god/observe.js:137` **Date/performance.now** — `id: Date.now(),`
- `vr/sim/god/shelf.js:37` **Date/performance.now** — `at: Date.now(),`
- `vr/sim/god/shelf.js:41` **Date/performance.now** — `id: `${W.seed}-${Date.now()}`,`
- `vr/sim/god/shelf.js:52` **Date/performance.now** — `savedAt: Date.now(),`
- `vr/sim/gpgpu/index.js:326` **Date/performance.now** — `const t0 = performance.now();`
- `vr/sim/gpgpu/index.js:377` **Date/performance.now** — `const ms = performance.now() - t0;`
- `vr/sim/hooks.js:86` **Date/performance.now** — `at: Date.now(),`
- `vr/sim/playtest.js:119` **Date/performance.now** — `clock.textContent = `${((performance.now() - state.t0) / 1000).toFixed(1)}s`;`
- `vr/sim/playtest.js:129` **Date/performance.now** — `state.t0 = performance.now();`
- `vr/sim/playtest.js:135` **Date/performance.now** — `state.loopS = Math.round((performance.now() - state.t0) / 100) / 10;`
- `vr/sim/playtest.js:150` **Date/performance.now** — `? Math.round((performance.now() - state.t0) / 6000) / 10`
- `vr/sim/rng.js:43` **Date/performance.now** — `return ((Date.now() * 2654435761) ^ 0x9e3779b9) >>> 0 || 1;`
- `vr/sim/run.js:20` **Date/performance.now** — `const id = `run-${++_seq}-${Date.now().toString(36)}`;`
- `vr/sim/run.js:33` **Date/performance.now** — `createdAt: Date.now(),`
- `vr/sim/run.js:48` **Date/performance.now** — `id: `run-${++_seq}-${Date.now().toString(36)}`,`
- `vr/sim/run.js:62` **Date/performance.now** — `createdAt: Date.now(),`
- `vr/sim/scale.mjs:32` **Date/performance.now** — `const t0 = performance.now();`
- `vr/sim/scale.mjs:34` **Date/performance.now** — `const elapsed = performance.now() - t0;`
- `vr/sim/scheduler.js:56` **Date/performance.now** — `const t0 = performance.now();`
- `vr/sim/scheduler.js:60` **Date/performance.now** — `recordMs(name, performance.now() - t0);`
- `vr/sim/thought.js:103` **Date/performance.now** — `mem.thread.push({ kind, at: performance.now(), text });`
- `vr/sim/thought.js:108` **Date/performance.now** — `mem.lastAt = performance.now();`
- `vr/sim/thought.js:129` **Date/performance.now** — `export function considerThought(view, now = performance.now()) {`
- `vr/sim/thought.js:345` **Date/performance.now** — `if (view.thrive && view.beings === 0 && view.life > 0.25 && cooled('soft', performance.now())) {`
- `vr/world.js:920` **Date/performance.now** — `const t0 = typeof performance !== 'undefined' ? performance.now() : 0;`
- `vr/world.js:923` **Date/performance.now** — `const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;`
