# Determinism audit

Generated 2026-09-01T01:14:55.101Z by `scripts/determinism-audit.mjs` (D1).

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
- `vr/sim/god/climate.js:329` **Date/performance.now** — `const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;`
- `vr/sim/god/observe.js:137` **Date/performance.now** — `id: Date.now(),`
- `vr/sim/god/shelf.js:38` **Date/performance.now** — `at: Date.now(),`
- `vr/sim/god/shelf.js:42` **Date/performance.now** — `id: `${W.seed}-${Date.now()}`,`
- `vr/sim/god/shelf.js:53` **Date/performance.now** — `savedAt: Date.now(),`
- `vr/sim/gpgpu/index.js:331` **Date/performance.now** — `const t0 = performance.now();`
- `vr/sim/gpgpu/index.js:382` **Date/performance.now** — `const ms = performance.now() - t0;`
- `vr/sim/hooks.js:91` **Date/performance.now** — `at: Date.now(),`
- `vr/sim/playtest.js:196` **Date/performance.now** — `clock.textContent = `${((performance.now() - state.t0) / 1000).toFixed(1)}s`;`
- `vr/sim/playtest.js:206` **Date/performance.now** — `state.t0 = performance.now();`
- `vr/sim/playtest.js:212` **Date/performance.now** — `state.loopS = Math.round((performance.now() - state.t0) / 100) / 10;`
- `vr/sim/playtest.js:228` **Date/performance.now** — `state.t0 != null ? Math.round((performance.now() - state.t0) / 6000) / 10 : null;`
- `vr/sim/report.js:10` **Date/performance.now** — `export const SESSION_ID = `sess-${Date.now().toString(36)}-${(++_sessSeq).toString(36)}`;`
- `vr/sim/report.js:51` **Date/performance.now** — `t: Date.now(),`
- `vr/sim/rng.js:44` **Date/performance.now** — `return ((Date.now() * 2654435761) ^ 0x9e3779b9) >>> 0 || 1;`
- `vr/sim/run.js:20` **Date/performance.now** — `const id = `run-${++_seq}-${Date.now().toString(36)}`;`
- `vr/sim/run.js:33` **Date/performance.now** — `createdAt: Date.now(),`
- `vr/sim/run.js:51` **Date/performance.now** — `id: `run-${++_seq}-${Date.now().toString(36)}`,`
- `vr/sim/run.js:67` **Date/performance.now** — `createdAt: Date.now(),`
- `vr/sim/scale.mjs:32` **Date/performance.now** — `const t0 = performance.now();`
- `vr/sim/scale.mjs:34` **Date/performance.now** — `const elapsed = performance.now() - t0;`
- `vr/sim/scheduler.js:62` **Date/performance.now** — `const t0 = performance.now();`
- `vr/sim/scheduler.js:66` **Date/performance.now** — `recordMs(name, performance.now() - t0);`
- `vr/sim/test-fast.mjs:27` **Date/performance.now** — `const t0 = performance.now();`
- `vr/sim/test-fast.mjs:35` **Date/performance.now** — `const mark = performance.now();`
- `vr/sim/test-fast.mjs:38` **Date/performance.now** — `console.log('  ✓', id, TIMING ? `(${(performance.now() - mark).toFixed(1)}ms)` : '');`
- `vr/sim/test-fast.mjs:44` **Date/performance.now** — `if (TIMING) times.push({ name: id, ms: performance.now() - mark });`
- `vr/sim/test-fast.mjs:49` **Date/performance.now** — `const s0 = performance.now();`
- `vr/sim/test-fast.mjs:51` **Date/performance.now** — `if (TIMING) console.log(`  · section ${title} ${(performance.now() - s0).toFixed(0)}ms`);`
- `vr/sim/test-fast.mjs:877` **Date/performance.now** — `const elapsed = performance.now() - t0;`
- `vr/sim/thought.js:65` **Date/performance.now** — `const now = opts.now ?? (typeof performance !== 'undefined' ? performance.now() : 0);`
- `vr/sim/thought.js:175` **Date/performance.now** — `mem.thread.push({ kind, at: performance.now(), text });`
- `vr/sim/thought.js:180` **Date/performance.now** — `mem.lastAt = performance.now();`
- `vr/sim/thought.js:209` **Date/performance.now** — `export function considerThought(view, now = performance.now()) {`
- `vr/sim/thought.js:495` **Date/performance.now** — `if (view.thrive && view.beings === 0 && view.life > 0.25 && cooled('soft', performance.now())) {`
- `vr/sim/thought.js:523` **Date/performance.now** — `? Math.max(0, performance.now() - mem.dwellSince)`
- `vr/world.js:981` **Date/performance.now** — `const t0 = typeof performance !== 'undefined' ? performance.now() : 0;`
- `vr/world.js:984` **Date/performance.now** — `const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;`
