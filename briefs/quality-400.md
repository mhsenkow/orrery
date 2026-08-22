# ORRERY — quality & liveness: 400 items

**Status:** register, not a queue. Companion to [`earth-fidelity-500.md`](earth-fidelity-500.md).
**Scope:** audit themes 12–20 — feedback loop, guardrails, state, saves, failure, payload, UI, people — plus a section on making the repo workable by an agent and one on the suites nobody runs.

**Sections:** F tests · G guardrails · H `W` · I saves · J failure · K cold start · L UI & design · M people · N agent-legibility · O orphaned suites. Ten sections, forty rows each.
**Date:** 2026-08-21

---

## The four goals, and why they are one goal

| Goal | What it means here |
|---|---|
| **Better for people** | Someone can reach the planet with a keyboard, a phone, a screen reader, or a headset — and the first ninety seconds still lands |
| **Better for performance** | 2.3 MB of unbundled JS and three blocking font families arrive before the first frame; the planet is fast once you get there and slow to get to |
| **Better for an agent** | 139 modules with beautiful prose headers and 3 files carrying `@param`. The knowledge is in comments, not in anything checkable |
| **More beautiful, more alive** | Two disjoint design-token sets, 1,755 lines of inline CSS, and a planet that cannot be focused. Craft is downstream of structure |

These converge. A typed field schema (I/H) is what lets an agent edit safely *and* what makes a
typo'd `W.foo` fail loudly instead of drawing a wrong planet. A design-token file (M) is what makes
the HUD consistent *and* what makes a high-contrast mode possible. **Do not treat this as
housekeeping** — every section below ends in something a person sees.

---

## Corrections to the audit that framed this

Two claims in the holistic pass were wrong or stale, and the rows below are written against reality:

- **The test suite has real coverage.** `test.mjs` reports **744 passed, 0 failed**; `test-worldParams.mjs` another **60**. It prints section headers and a final tally. My "~10 assertion calls" was a bad grep. The defect is **runtime (~4 min), no subsets, no isolation, and no automation** — not thin coverage.
- **README is 60 lines / 2.1 KB**, not 30 KB. It was slimmed in the same pass that retired the backlogs. `## Docs` already exists as an entry point.

---

## First 20 — the gate

**Status: landed 2026-08-21** (see [`shipped.md`](shipped.md) quality wave). Promote the next tranche into [`NEXT.md`](../NEXT.md); do not implement the remaining 380 rows as a queue.

| # | Row | Why first | Gate |
|---|---|---|---|
| 1 | H1 | The field schema. Nine other sections depend on it existing | ✓ `vr/sim/fields.js` |
| 2 | H2 | Generate it from the census — do not hand-author | ✓ `scripts/fields-census.mjs` → `vr/data/fields/` |
| 3 | G1 | A linter at all. Everything else in G is a rule inside it | ✓ root `eslint` + `npm run lint` |
| 4 | G11 | `no-undef` + `no-unused-vars` catches the typo'd-field class today | ✓ scoped in `eslint.config.js` |
| 5 | G21 | `checkJs` in a `jsconfig.json` — types without rewriting a line | ✓ `jsconfig.json` (expand include via ratchet) |
| 6 | G31 | CI. 804 passing assertions that nothing runs automatically | ✓ `.github/workflows/ci.yml` |
| 7 | F1 | Split fast/full. Nothing else about the loop matters at 4 minutes | ✓ `npm run test:fast` / `test:full` |
| 8 | F11 | Per-test timing, so F2–F10 are measured not guessed | ✓ `test-fast.mjs --timing` |
| 9 | G6 | A formatter, once, in one commit — before any refactor touches diffs | ✓ prettier on scoped paths |
| 10 | K1 | Measure time-to-first-frame on a headset browser. Everything in K is currently a guess | ✓ desktop note in [`cold-start.md`](cold-start.md); headset TBD |
| 11 | K11 | Self-host the fonts. Three blocking families before the first frame | ✓ `vr/fonts/` — no Google Fonts |
| 12 | J1 | A global error handler. There is none — no `onerror`, no `unhandledrejection` | ✓ `vr/sim/report.js` |
| 13 | J2 | Route it to `showErr`, which already exists and is used 30 times | ✓ `setErrorSink(showErr)` in `main.js` |
| 14 | I1 | Read `data.version` in `loadRunMeta` (also D21 in the fidelity register) | ✓ save v9 (prior wave) |
| 15 | I11 | Committed save fixtures, one per version | ✓ `vr/data/fixtures/saves/v8` + `v9` |
| 16 | N1 | `CLAUDE.md`. There is no orientation file of any kind | ✓ root `CLAUDE.md` |
| 17 | N9 | A module map — 163 modules, no index | ✓ `briefs/module-map.md` |
| 18 | N1 | `<html lang>`. There is no `<html>` element at all | ✓ `vr/index.html` lang=en |
| 19 | N2 | Make the canvas focusable. The planet is the product and it is not reachable | ✓ `tabindex=0` + aria-label |
| 20 | M1 | One token file shared by `vr/` and `site/` | ✓ `shared/tokens.css` |

## Second 20 — deepen the loop (landed 2026-08-21)

Not the remaining 380 rows. High-leverage follow-ons across F/G/H/J/K/L/M/O.

| # | Row | Gate |
|---|---|---|
| 1 | F12 | ✓ [`test-timing.md`](test-timing.md) names full-suite costs |
| 2 | F13 | ✓ `npm run test:sweep --prefix vr` |
| 3 | F19/F25 | ✓ `withWorld` + `hashFields.js` |
| 4 | F20 | ✓ `npm run test:watch --prefix vr` |
| 5 | F21/F26/F27 | ✓ unhandledRejection fails; assert-count ratchet |
| 6 | F32 | ✓ `paintDisc` in `test:fast` |
| 7 | F34 | ✓ GPU gap accepted in [`model-limits.md`](model-limits.md) |
| 8 | F37/F38 | ✓ URL flag smoke + dark gate inert/on/off |
| 9 | F39 | ✓ README states fast-suite duration |
| 10 | G5/G13 | ✓ `.editorconfig`; no-param-reassign exception noted |
| 11 | G22/G23 | ✓ `typecheck-ratchet` + baseline |
| 12 | H3/H28 | ✓ `fields:report` + census budget 800 |
| 13 | H29 | ✓ new-field checklist in `CLAUDE.md` |
| 14 | H37 | ✓ `fieldsHash` on save v9 |
| 15 | J5/J12 | ✓ Lab Diagnostics copy; climate path in limits sheet |
| 16 | K14 | ✓ preload Syne woff2 |
| 17 | L7/L35 | ✓ `prefers-reduced-motion` + `:focus-visible` |
| 18 | M16 | ✓ skip link to `#c` |
| 19 | O | ✓ [`orphaned-suites.md`](orphaned-suites.md) |
| 20 | G expand | ✓ lint/typecheck include ratchet (hashFields, helpers, darkGate) |

## Third 20 — keyboard loop + a11y honesty (landed 2026-08-21)

| # | Row | Gate |
|---|---|---|
| 1–3 | M4/M5/M6 | ✓ focused `#c`: arrows spin, WASD cursor, +/− zoom, Enter descend |
| 4 | M8 | ✓ cursor drives `setLocalHover` highlight |
| 5 | M9/M10 | ✓ `vr/sim/keymap.js` data table + dispatch |
| 6 | M11 | ✓ View → Keys lists keymap help |
| 7 | M3 | ✓ `#planetLive` aria-live polite |
| 8 | M16 | ✓ skip link (prior) |
| 9 | M40 | ✓ [`accessibility.md`](accessibility.md) |
| 10 | J11 | ✓ GPGPU init failure → `ORR-GPGPU-001` report |

## Fourth 20 — tool-at-cursor + overlay dismiss (landed 2026-08-21)

| # | Row | Gate |
|---|---|---|
| 1 | M7 | ✓ letter arms tool; Enter applies at kb cursor; Inspect→descend |
| 2 | M6 | ✓ `\` and Shift+Enter still descend |
| 3 | M11 | ✓ Shift+`?` shortcuts dialog (`#kbdSheet`) |
| 4 | M15 | ✓ Escape closes cat / land / limits / sheet / local |
| 5 | M17 | ✓ tool / act / descend announced on `#planetLive` |
| 6 | M2 | ✓ `role="application"` on `#c` |
| 7 | M20 | ✓ non-XR descent stated in accessibility.md |

## Fifth 20 — phone, diagnostics, save harden (landed 2026-08-21)

| # | Row | Gate |
|---|---|---|
| 1 | M23 | ✓ Phone / coarse pointer primary controls ≥44px |
| 2 | M35 | ✓ Phone dock body + tool buttons slightly larger type |
| 3 | M14 | ✓ Focus traps (prior same-day polish) |
| 4 | J3 | ✓ Error ring (50) in `report.js` |
| 5 | J5 | ✓ Lab **Diagnostics** copies paste blob |
| 6 | J6 | ✓ `SESSION_ID` in diagnostics |
| 7 | J14 | ✓ Dropped ticks in Lab HUD + diagnostics copy |
| 8 | I8 | ✓ `loadRunMeta` always refuses N mismatch |
| 9 | I22 | ✓ Corrupt JSON throws; world untouched |
| 10 | I23/I24 | ✓ Autosave staging + previous slot |
| 11 | K4/K39 | ✓ Cold-start budget stated in `shipped.md` / `cold-start.md` |
| 12 | O3 | ✓ `npm run test:origin --prefix vr` |
| 13 | O4 | ✓ `npm run test:deeptime --prefix vr` (short ticks) |
| 14–20 | docs | ✓ Fifth gate table; NEXT/accessibility/orphaned updated |

## Sixth 20 — payload, touch, save depth, failure surface (landed 2026-08-21)

| # | Row | Gate |
|---|---|---|
| 1 | K17 | ✓ Catalogue lazy-load via `catalogueLoad.js` |
| 2 | K16 | ✓ Dark HUD/spectacle dynamic import when `?dark=1` |
| 3 | K12 | ✓ `unicode-range` Latin on self-hosted faces |
| 4 | M22 | ✓ Pinch-out descend / pinch-in step-back on canvas |
| 5 | M24 | ✓ Documented button equivalents (local +/−, Enter, Esc) |
| 6 | I13 | ✓ Mid-run serialize/load in `test:fast` |
| 7 | I26 | ✓ Autosave quota → `ORR-SAVE-001` |
| 8 | I30 | ✓ Shelf summary in Lab Diagnostics copy |
| 9 | J9/J20/J21 | ✓ `expected()` + [`error-codes.md`](error-codes.md) |
| 10 | L17 | ✓ `hudCadence.js` refresh table |
| 11 | H9 | ✓ Schema-first float/uint8 alloc in `reallocateWorldFields` |
| 12 | G24 | ✓ `WorldFieldsCore` typedef on fields.js |
| 13 | O1/O2 | ✓ `test:dark` / `test:dark-scenario` scripts (not default CI) |
| 14 | O11 | ✓ `scripts/orphan-suites.mjs` in verify |
| 15–20 | docs | ✓ Sixth gate; accessibility / NEXT / shipped |

---

# F · A feedback loop you use every edit (40)

*Today: 804 assertions, all green, in about four minutes, with no way to run a subset, no per-test
timing, and nothing automatic. The suite is a gate, not a tool. `smoke.mjs` (121 lines) is the
closest thing to a fast path and is not in `npm test`.*

**Felt payoff:** the difference between a codebase where you check a hunch in eight seconds and one
where you guess. Every other section gets faster once this one lands.

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| F1 | **`npm run test:fast`** | Pure helpers, no golden, no calibrate, no 750-tick runs. | M | 3 | Under 15 s; documented in README |
| F2 | **`npm run test:full`** | Today's `npm test`, renamed so the default is the fast one. | S | 3 | `npm test` maps to fast |
| F3 | **Promote `smoke.mjs`** | 121 lines, already exists, not in any default path. | S | 3 | Part of `test:fast` |
| F4 | **Tag every test by subsystem** | `climate`, `bio`, `geo`, `save`, `agents`, `dark`, `picture`. | M | 3 | `--only=climate` works |
| F5 | **Tag by cost** | `fast` / `slow` / `sweep`; the ladder is the third tier. | S | 3 | Tags drive F1/F2 |
| F6 | **One test runner, not four conventions** | `test.mjs`, `test-worldParams.mjs`, `dark-test.mjs` and the probes each roll their own. | M | 3 | One `harness.mjs`; all suites use it |
| F7 | **Keep the reporting style** | `✓ name` per assertion with section headers is genuinely good — do not lose it in the refactor. | S | 2 | Output shape unchanged |
| F8 | **Named test ids** | So a CI failure can be re-run alone. | S | 3 | Every assertion has a stable id |
| F9 | **Failure isolation** | A thrown error mid-file currently ends the file. | M | 3 | One failure does not hide the rest of its section |
| F10 | **Non-zero exit detail** | Print the failing ids at the end, not just the count. | S | 3 | Failure summary block |
| F11 | **Per-test timing** | The prerequisite for every optimisation below. | S | 3 | Slowest 20 printed with `--timing` |
| F12 | **Find the 4 minutes** | Almost certainly a handful of multi-hundred-tick runs. | S | 3 | Top-5 costs named in the doc |
| F13 | **Move long runs to a sweep tier** | `biosphereHolds` at 750 ticks belongs in a nightly, not an edit loop. | S | 3 | Sweep tier exists |
| F14 | **Default every harness to N=32** | `biosphereHolds`' own comment recommends it. | S | 3 | Suite runs at 32 unless a test asks otherwise |
| F15 | **Assert N-independence separately** | The one place higher N is the point (fidelity A36/B85). | S | 2 | Dedicated N-sweep test |
| F16 | **Parallelise across cores** | 804 mostly-independent assertions. | M | 2 | Wall clock drops; results identical |
| F17 | **Deterministic ordering under parallelism** | Shared `W` makes this non-trivial — worker-per-file, not per-test. | M | 3 | Same results in any order |
| F18 | **Fix the shared-`W` coupling in tests** | `W` is a module singleton; test order can leak state. | M | 3 | Each test file starts from a known `generate` |
| F19 | **A `withWorld()` helper** | Generate, run, assert, reset — the shape every test hand-rolls. | S | 3 | Used across the suite |
| F20 | **Watch mode** | `node --watch` over the fast tier. | S | 2 | `npm run test:watch` |
| F21 | **Fail on unhandled rejection** | Invisible in a 4-minute run. | S | 3 | Suite fails |
| F22 | **Fail on unexpected `console.error`** | A subsystem that warns during a passing test is a finding. | M | 2 | Opt-in per test, on by default in CI |
| F23 | **Snapshot helper for field stats** | Most assertions are "this scalar is in a band" — make that one call. | S | 2 | Helper exists and is used |
| F24 | **Structural helpers as first-class assertions** | `surfaceStats` and `pictureDisc` are the best tools in the repo. | S | 3 | `assertPicture(W, bands)` exists |
| F25 | **Golden-hash helper** | `hashFields` lives in `headless.mjs`; tests should call it directly. | S | 2 | Exported and used |
| F26 | **A test for the test harness** | A harness that silently passes zero tests is the classic failure. | S | 3 | Asserts a non-zero assertion count |
| F27 | **Assert the assertion count only grows** | Cheap ratchet against accidental deletion. | S | 2 | Committed count; drop fails |
| F28 | **Coverage measurement** | Not a target — a map of which of the 163 modules no test touches. | M | 3 | `npm run coverage`; untouched-module list committed |
| F29 | **Rank untested modules by risk** | LOC × recency of change. | S | 3 | Ranked list; top 10 in this doc |
| F30 | **Test the untested top 10** | Whatever they turn out to be. | L | 3 | Each has at least a smoke test |
| F31 | **Fixture worlds** | Named, committed starting states so tests stop re-deriving. | M | 2 | `vr/data/fixtures/worlds/` |
| F32 | **Fast picture tests** | `paintDisc` is 48px and CPU-only — it belongs in the fast tier. | S | 2 | In `test:fast` |
| F33 | **A GPU-path test lane** | Shader faults are uncaught by design (model-limits says so). | L | 2 | Headless GL lane exists or the gap is formally accepted in writing |
| F34 | **Document the GPU gap either way** | An accepted gap is fine; an unstated one is not. | S | 3 | Stated in `model-limits.md` |
| F35 | **Test the save path in the fast tier** | Round-trip is cheap and high-value. | S | 3 | Present |
| F36 | **Test the boot path** | `setBootPhase` exists; nothing asserts boot completes. | M | 3 | Headless boot smoke test |
| F37 | **Test the URL flags** | `?demo=1`, `?dark=1`, `?playtest=1`, `?pitch=` are all documented entry points. | M | 3 | Each flag has a test |
| F38 | **Test that `?dark=1` off is inert** | The gate's whole promise (fidelity B96). | S | 3 | Present |
| F39 | **Publish the loop time** | The number that says whether this section worked. | S | 2 | README states fast-suite duration |
| F40 | **Keep it under 15 s forever** | A ratchet, same as everywhere else. | S | 3 | CI fails if the fast tier exceeds its budget |

# G · Guardrails: CI, lint, types (40)

*Today: no `.github/`, no eslint, no prettier, no tsconfig, no jsconfig. 80k lines of untyped JS
where `W.tempreature = 5` is a silent no-op that produces a wrong planet and a passing test suite.*

**Felt payoff:** the class of bug that reaches a user drops sharply, and every future refactor —
including most of H, L and M below — becomes safe to attempt.

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| G1 | **Add a linter** | ESLint flat config, or Biome for speed. Pick one. | M | 3 | `npm run lint` exists and passes |
| G2 | **Zero-warning baseline** | Either fix or explicitly suppress, never "1,400 warnings". | M | 3 | Clean run committed |
| G3 | **Lint the whole tree** | `vr/`, `scripts/`, and the inline module script. | S | 2 | All covered |
| G4 | **Lint in the fast suite** | Sub-second with Biome; keep it in the loop. | S | 3 | Wired |
| G5 | **Editor config** | `.editorconfig` so contributors and agents agree on whitespace. | S | 2 | Present |
| G6 | **Formatter, in one commit** | Do this before any structural refactor or every diff becomes unreviewable. | S | 3 | One formatting commit; CI enforces |
| G7 | **Preserve the comment style** | The prose headers are an asset; make sure the formatter does not reflow them badly. | S | 3 | Spot-checked; `printWidth` chosen to suit |
| G8 | **`no-console` with an allowlist** | 10 legitimate `console.warn`/`error` in `vr/`; the rest should route through J. | S | 2 | Rule on, exceptions named |
| G9 | **`no-empty` catch rule** | 49 catch blocks, most with a bare comment (section J). | S | 3 | Rule on; each catch either handles or reports |
| G10 | **`eqeqeq`, `no-implicit-coercion`, `prefer-const`** | Cheap correctness rules on numeric code. | S | 2 | On |
| G11 | **`no-undef` and `no-unused-vars`** | These two catch the typo class today, before any type work. | S | 3 | On; violations fixed |
| G12 | **`no-fallthrough`, `default-case`** | Rulesets and kinds branch heavily. | S | 2 | On |
| G13 | **`no-param-reassign` off deliberately** | Every tick mutates `W` by design; the rule would be noise. | S | 1 | Documented exception |
| G14 | **A `no-Math.random-in-sim` rule** | The convention is a comment in `rng.js`; make it enforced (fidelity D2). | S | 3 | Custom rule; path-scoped |
| G15 | **A `no-Date.now-in-sim` rule** | Same class (fidelity D3). | S | 3 | Present |
| G16 | **A `no-format-in-tick` rule** | String building in `simTick` is a perf and layering bug (fidelity E66). | M | 2 | Rule or test |
| G17 | **Import-cycle detection** | 68 imports in `main.js` and a `sim/` tree that imports upward in places. | M | 3 | Cycles reported; count ratcheted to zero |
| G18 | **Import-boundary rules** | `sim/` must not import `render.js`, `main.js`, or DOM. | M | 3 | Rule enforced; violations listed |
| G19 | **Dead-export detection** | 42 exports from one module suggests some are unused. | M | 2 | `knip` or equivalent; dead exports removed |
| G20 | **Dead-file detection** | Confirm all 163 modules are reachable from an entry point. | S | 2 | Report clean |
| G21 | **`jsconfig.json` with `checkJs`** | Types over existing JSDoc with zero rewriting. | M | 3 | `npm run typecheck` runs |
| G22 | **Start `strict: false`, ratchet up** | A hard strict flip on 80k lines produces thousands of errors and gets abandoned. | S | 3 | Baseline error count committed |
| G23 | **Error-count ratchet** | The only enforcement that survives contact. | S | 3 | New errors fail CI |
| G24 | **Type the field schema first** | H1's typedef is where typing pays for itself immediately. | M | 3 | `W` has a type; misspelled access errors |
| G25 | **Type `rulesets.js`** | The per-world config object touched by every subsystem. | M | 3 | `Ruleset` typedef; call sites check |
| G26 | **Type the save shape** | Section I's schema, as a type. | M | 3 | `SaveV8` typedef |
| G27 | **Type the entity record** | `ENT` and `packEntities` are a coupled pair with no contract. | M | 2 | Typed |
| G28 | **Type the module boundaries, not the internals** | Full annotation of 80k lines is not the goal; the seams are. | S | 3 | Policy written in `N` |
| G29 | **Enable `noUncheckedIndexedAccess` last** | Highest-value, highest-noise on typed-array code. | M | 2 | Evaluated with a measured error count |
| G30 | **Publish the typed share** | Same honesty instinct as provenance. | S | 1 | Generated line |
| G31 | **CI: GitHub Actions** | Push and PR. | M | 3 | `.github/workflows/ci.yml` green |
| G32 | **CI job: lint + format + typecheck** | Under a minute. | S | 3 | Green |
| G33 | **CI job: fast suite** | F1's tier. | S | 3 | Green |
| G34 | **CI job: full suite + golden** | On merge, not every push. | S | 3 | Green |
| G35 | **CI job: nightly sweeps** | Ladder, ensembles, long runs. | M | 2 | Scheduled workflow |
| G36 | **CI publishes artefacts** | Calibration report, coverage, perf baseline. | S | 2 | Downloadable per run |
| G37 | **CI deploys Pages** | Currently a manual push to a branch that serves the live prototype. | M | 3 | Deploy is a job, gated on the fast suite |
| G38 | **Never deploy a red build** | The live URL is the pitch. | S | 3 | Gate in place |
| G39 | **Status badge in README** | Sixty lines; one more is fine. | S | 1 | Present |
| G40 | **Document the local equivalents** | One block: lint, typecheck, fast, full. | S | 2 | In README `## Local` |

# H · Taming `W` (40)

*Today: one module-level singleton with 733 distinct `W.*` names, read and written by every module.
`model-limits.md` already documents the fallout in its own words — "one writer per tick
(`deriveLifeClass`)", "derived compatibility shims", `lifeClass`/`unlockedClass` existing only to
keep older readers working. Those sentences are the symptom description; this is the treatment.*

**Felt payoff:** an agent (or a person) can change a subsystem without reading 80k lines to find
out who else touches the field. It is the single highest-leverage structural item in the repo.

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| H1 | **The field schema** | One declarative table: name, kind, type, unit, range, owner, saved?, derived?. | L | 3 | `vr/sim/fields.js` exists and is the source of truth |
| H2 | **Generate it from the census** | 733 names is too many to hand-author; extract, then curate. | M | 3 | Generated draft; curation tracked |
| H3 | **Classify every name** | field / scalar / cache / flag / dead (fidelity A24). | M | 3 | Every name classified; count published |
| H4 | **Delete the dead** | One writer, no readers. | M | 3 | Zero orphans |
| H5 | **Name an owner per field** | Exactly one module may write it. | L | 3 | Every writable field has one owner |
| H6 | **Enforce ownership in debug builds** | A write from a non-owner throws. | M | 3 | Proxy-based check under `debugAssert` |
| H7 | **Find the multi-writer fields** | These are the real bugs; `life[]` already had one (documented in `calibrate.mjs`). | M | 3 | Multi-writer list produced and resolved |
| H8 | **The `life[]` lesson as a test** | Two subsystems each deferring ownership to the other is how a planet died silently for 3,500 ticks. | S | 3 | Regression test present |
| H9 | **Allocate fields from the schema** | `reallocateWorldFields` should loop the table, not enumerate. | M | 3 | One loop; new field = one table row |
| H10 | **Save from the schema** | Kills the 80-line `if (data.x)` chain (section I). | M | 3 | `serializeRun` derives from the table |
| H11 | **Assert from the schema** | `assertNoNaN` covers 4 fields; it should cover all declared ones. | M | 3 | Coverage from the table |
| H12 | **Reset from the schema** | Test isolation (F18) needs a reliable reset. | S | 3 | `resetWorld()` |
| H13 | **Document from the schema** | The units registry and the field table are the same object (fidelity A21–A24). | S | 3 | One source, two views |
| H14 | **Freeze `_`-prefixed as derived** | Convention exists; make it a schema kind with rules. | S | 3 | Derived fields cannot be saved or asserted as state |
| H15 | **Audit the current `_` violations** | Some almost certainly are saved. | S | 3 | List produced; each resolved |
| H16 | **Group fields into subsystem records** | `W.climate.*`, `W.bio.*` — the migration path off a flat bag. | L | 2 | One subsystem migrated as a pilot |
| H17 | **Pilot with the smallest subsystem** | Prove the pattern cheaply; `techno` is already a lazy object. | M | 2 | Pilot merged with unchanged golden hashes |
| H18 | **Do not migrate everything** | A half-finished migration is worse than a flat bag. Decide after the pilot. | S | 3 | Decision recorded either way |
| H19 | **Retire the compatibility shims** | `lifeClass` / `unlockedClass` exist to serve old readers. | M | 2 | Readers updated; shims deleted or documented as permanent |
| H20 | **Invariants per field** | Range, monotonicity, non-negativity. | M | 3 | Declared in the table; checked in debug |
| H21 | **Invariant violation names the writer** | Blame is the whole point. | M | 3 | Message includes owner and tick |
| H22 | **Field-level change log in debug** | "Who last wrote `seaLevel`?" answered without a bisect. | M | 2 | Available under a flag |
| H23 | **Prevent accidental field creation** | `W.tempreature = 5` currently succeeds. | M | 3 | Sealed object or debug proxy rejects unknown names |
| H24 | **Sealed in production too, if free** | Measure the cost before deciding. | S | 2 | Measured; decision recorded |
| H25 | **Typed-array views, not new arrays** | `reallocateWorldFields` on resolution change should reuse buffers. | M | 2 | Allocation measured at `changeResolution` |
| H26 | **One place decides `NC`** | `sphere.js` exports it and `resolution.js` describes it; make the relationship explicit. | S | 2 | Single source; no local recomputation |
| H27 | **Resolution change is transactional** | A failed rebuild currently leaves a half-resized world. | M | 3 | Rebuild succeeds or rolls back |
| H28 | **Field count budget** | 733 should go down, not up. | S | 3 | Committed count; growth needs a reason in review |
| H29 | **New field checklist** | Table row, owner, unit, saved?, test. | S | 3 | In `N`'s contributing notes |
| H30 | **Separate world state from run metadata** | Seed, rule, and name are not fields. | M | 2 | Split in the schema |
| H31 | **Separate view state from world state** | `_localHover`, overlay mode, camera do not belong in `W`. | M | 3 | Moved out; save shrinks |
| H32 | **Separate UI state from view state** | Panel open/closed is a third category. | M | 2 | Moved to a UI store (section L) |
| H33 | **`S` vs `W`** | `main.js` has an `S` state object too; document the boundary. | S | 3 | Boundary written down |
| H34 | **Multi-world readiness** | `gpgpu` already supports slots; `W` as a singleton fights that. | L | 2 | Two worlds instantiable in one process (also fidelity D52) |
| H35 | **Tests instantiate worlds, not import a singleton** | The clean version of F18. | L | 2 | Enabled by H34 |
| H36 | **A schema diff tool** | What changed between two versions of the field table. | S | 2 | Prints added/removed/retyped |
| H37 | **Schema hash in the save** | Fidelity D37/D38's mechanism. | S | 3 | Present |
| H38 | **Publish the field count and owner coverage** | The honest headline for this section. | S | 2 | Generated line |
| H39 | **`W` documented for agents** | Section O's most valuable single page. | S | 3 | Generated reference from the table |
| H40 | **Ratchet unowned fields to zero** | The finish line. | M | 3 | Every writable field has an owner |

# I · Save, load, migrate, never lose a world (40)

*Today: `serializeRun` writes `version: 8` and `loadRunMeta` never reads `data.version`. Loading is
~40 sequential `if (data.field)` guards; a save at a different `simN` fails four `data.n === SIM_N`
checks and loads a world with the wrong land, silently, then keeps running. Autosave-on-leave
shipped last week, so this is now live user data.*

**Felt payoff:** the Gardener archetype is the retention engine and it depends entirely on a world
still being there tomorrow, intact.

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| I1 | **Read `data.version`** | Written, ignored. | S | 3 | Branches on it |
| I2 | **Reject unknown future versions** | With a message a person can act on. | S | 3 | Clear refusal |
| I3 | **Migration functions per step** | `migrate7to8` etc., composable. | M | 3 | Chain runs oldest→newest |
| I4 | **Never partially load** | The current failure mode. | S | 3 | Load is all-or-nothing |
| I5 | **Validate before applying** | Parse, check, then mutate. | M | 3 | Invalid save touches no world state |
| I6 | **Schema-driven save** | From H1/H10. | M | 3 | No hand-written field chain |
| I7 | **Schema-driven load** | Same table, reverse direction. | M | 3 | Symmetric |
| I8 | **N mismatch: refuse or resample** | Never silently drop. | S | 3 | Explicit branch; user informed |
| I9 | **Implement resample** | Nearest-neighbour on the cube-sphere is tractable. | M | 2 | Cross-N load works with a stated caveat |
| I10 | **Record what the load discarded** | If anything is dropped, say what. | S | 3 | Load returns a report; UI shows it |
| I11 | **Save fixtures, one per version** | The only way migrations stay correct. | M | 3 | `vr/data/fixtures/saves/v6..v8.json` |
| I12 | **Round-trip test per schema field** | Generatable from the table. | M | 3 | All fields covered |
| I13 | **Round-trip a mid-run world** | Fresh-world round-trips pass while live state is lost. | M | 3 | Tick 500 save/load/continue matches hash |
| I14 | **Round-trip with a war on** | `packPolities`, arsenals, flights, mushrooms are the newest and least-tested. | M | 3 | Covered |
| I15 | **Round-trip with entities and herds** | `packEntities` per-individual, not counts. | M | 3 | Covered |
| I16 | **Round-trip the phylogeny with ghosts** | Ghosts are what make the tree honest. | S | 2 | Covered |
| I17 | **Round-trip the material stack** | 49 bytes/cell; version 7 introduced it. | S | 3 | Covered |
| I18 | **Round-trip the paint layers** | `packLayerStack` with masks and blend modes. | M | 2 | Covered |
| I19 | **Save size budget** | ~2.7 MB of stack alone at N=96 before anything else. | S | 3 | Size reported; budget per N |
| I20 | **Compress the payloads** | Base64 raw floats is worst-case. | M | 2 | Size drops; round-trip unchanged |
| I21 | **Quantise where lossless is not needed** | Height needs precision; `moist` probably does not. | M | 2 | Per-field precision in the schema |
| I22 | **Corrupt-save handling** | Truncated base64 throws deep in an unpack. | S | 3 | Clear error, world untouched |
| I23 | **Autosave write-then-rename** | Quit mid-write currently risks the slot. | S | 3 | Atomic |
| I24 | **Keep the previous autosave** | One rotation is cheap insurance. | S | 3 | Two slots |
| I25 | **Autosave is versioned and migrated** | It is live user data now. | S | 3 | Covered by I3 |
| I26 | **Storage quota handling** | `localStorage` is small and the save is megabytes. | M | 3 | Quota error surfaces and suggests export |
| I27 | **IndexedDB for real worlds** | The right store for this size. | M | 2 | Migration path from the current store |
| I28 | **Private-mode path tested** | There is a `catch { /* private mode */ }` already. | S | 2 | Behaviour defined and tested |
| I29 | **Export/import as files** | Already partly present via `downloadSave`. | S | 2 | Import path symmetric and tested |
| I30 | **A world browser** | `loadShelf` exists; make saved worlds visible and named. | M | 3 | List with names, dates, thumbnails |
| I31 | **Thumbnails from `paintDisc`** | 48px CPU disc already exists. | S | 2 | Thumbnails generated at save |
| I32 | **Name worlds by default** | `seedToWords` exists; use it so nothing is "Untitled". | S | 2 | Every save named |
| I33 | **Show what a save contains before loading** | Age, life, epoch, interventions. | M | 2 | Summary in the browser |
| I34 | **Never overwrite without confirmation** | Basic data safety. | S | 3 | Confirm on overwrite |
| I35 | **Delete requires confirmation** | Same. | S | 2 | Present |
| I36 | **Version the URL-shared world ids** | `encodeWorldId` is a public surface now. | S | 2 | Versioned; old ids still resolve |
| I37 | **Document the save format** | For agents and for future migrations. | M | 3 | Generated from the schema |
| I38 | **Document what is *not* saved** | Honesty, and it prevents bug reports. | S | 3 | Stated |
| I39 | **Save/load in the fast test tier** | Cheap and high-value. | S | 3 | Present |
| I40 | **A save that survives a year** | The Gardener test. Load a v6 fixture and continue. | M | 3 | Works, with a report of what migrated |

# J · Failure that speaks (40)

*Today: 49 `catch` blocks, 34 of them in `main.js`, mostly `catch { /* */ }` or `catch { return
null; }`. Ten `console.warn`/`error` calls in the whole `vr/` tree. **No global error handler at
all** — no `window.onerror`, no `unhandledrejection`. There is a real user-facing toast (`showErr`,
used 30 times) that nothing routes into automatically. `initGpgpu` catches a shader failure,
`console.warn`s, and silently runs the CPU path forever.*

**Felt payoff:** a scientific instrument that fails loudly is trustworthy; one that degrades
silently is decoration. This is the section that protects the instrument face of `PURPOSE.md`.

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| J1 | **Global `error` and `unhandledrejection` handlers** | There are none. | S | 3 | Both installed at boot |
| J2 | **Route them to `showErr`** | The toast already exists and is styled. | S | 3 | Uncaught errors become visible |
| J3 | **Keep a ring buffer of errors** | A 6-second toast is not a record. | S | 3 | Last 50 errors retained |
| J4 | **A diagnostics panel** | Errors, warnings, dropped ticks, budget drift, active paths. | M | 3 | Reachable from Lab |
| J5 | **Copy-diagnostics button** | Turns a bug report into a paste. | S | 3 | One click gives world id, seed, N, path, versions, last errors |
| J6 | **Include the run id** | Fidelity D68's id makes a report reproducible. | S | 3 | Included |
| J7 | **Audit all 49 catches** | Each becomes: handle, report, or rethrow. | M | 3 | Zero bare catches remain |
| J8 | **Distinguish expected from unexpected** | `catch { /* private mode */ }` is legitimate; a swallowed GL error is not. | M | 3 | Expected catches carry a documented reason |
| J9 | **A `expected()` helper** | Makes the intent explicit and greppable. | S | 2 | Used at every legitimate swallow |
| J10 | **Never `return null` on an internal invariant** | It converts a bug into a wrong planet. | M | 3 | Internal failures throw |
| J11 | **Report shader compile failure to the user** | `initGpgpu` warns to a console nobody has open. | S | 3 | Visible; HUD shows the CPU fallback |
| J12 | **Show which climate path is live** | CPU vs GPU changes the numbers (fidelity C18). | S | 3 | Always visible in Lab |
| J13 | **Report the RGBA32F fallback** | A quiet precision downgrade. | S | 2 | Reported |
| J14 | **Report dropped ticks** | `noteDroppedTicks` records and nothing surfaces it. | S | 3 | Visible when non-zero |
| J15 | **Report budget drift** | `assertBudgets` builds warnings that go nowhere. | S | 3 | Surfaced in the diagnostics panel |
| J16 | **Escalate large drift** | ±35% water is not a warning, it is a broken run. | S | 3 | Threshold escalates to a visible banner |
| J17 | **Report NaN immediately** | `assertNoNaN` throws only under `debugAssert`. | S | 3 | A NaN in a field is always reported |
| J18 | **NaN quarantine, not crash** | Better to name the field and freeze that subsystem than to blank the planet. | M | 3 | Degradation path defined |
| J19 | **A single `report(level, code, detail)` API** | Replaces ad-hoc `console.*` and bare toasts. | M | 3 | One API; `console` direct-use linted (G8) |
| J20 | **Stable error codes** | `ORR-GPGPU-001`. Greppable, searchable, agent-friendly. | M | 2 | Codes assigned to every report site |
| J21 | **Error catalogue doc** | Code → meaning → likely cause → what to do. | M | 3 | Generated from the code table |
| J22 | **Severity levels that mean something** | info / degraded / broken. Only `broken` interrupts. | S | 3 | Defined and used |
| J23 | **Never interrupt the first ninety seconds** | A boot-time toast storm kills the hook. | S | 3 | Boot errors defer to the diagnostics panel unless fatal |
| J24 | **Boot-phase failures name the phase** | `setBootPhase` already tracks it. | S | 3 | Phase included in the report |
| J25 | **A recoverable-boot path** | If the catalogue fails to load, the planet should still open. | M | 3 | Non-essential boot failures degrade, not block |
| J26 | **Fail hard on essential boot failure** | A blank canvas with no message is the worst outcome. | S | 3 | Explicit fatal screen with the code |
| J27 | **Asset-load failures reported** | Font, JSON, texture. | S | 2 | Each reported with its URL |
| J28 | **Data-file schema validation** | `world.schema.json` and `world-record.schema.json` exist; are they enforced at load? | M | 3 | Validated; failures named |
| J29 | **Validate compiled tables at boot in debug** | The nine `*Table.js` files are generated and trusted. | M | 2 | Validated |
| J30 | **XR session failure messaging** | There is a `'VR unavailable'` catch; make it explain. | S | 2 | Reason surfaced |
| J31 | **Audio failure is not an error** | Autoplay policy blocks are expected. | S | 1 | Classified as expected |
| J32 | **Haptics failure is not an error** | Already caught with a comment. | S | 1 | Classified |
| J33 | **Storage failure is a *user-visible* problem** | Losing a world is not a warning. | S | 3 | Escalated |
| J34 | **Worker failure reported** | One `new Worker` with no error path shown. | S | 2 | Reported; main-thread fallback stated |
| J35 | **A "something is wrong with this world" affordance** | Cernunnos is the natural voice for it (`briefs/cernunnos.md`). | M | 2 | Voice can report a diagnosed fault |
| J36 | **Diagnosis, not just detection** | The Cernunnos brief already promises "diagnosis when life goes quiet". | M | 3 | At least three faults have a diagnosis path |
| J37 | **Error counts in the headless output** | `runHeadless` should report them. | S | 3 | Present |
| J38 | **Tests assert zero unexpected reports** | F22's rule, using J19's API. | S | 3 | Wired |
| J39 | **A deliberate-fault test** | Inject a shader failure, a NaN, a corrupt save; assert each is reported. | M | 3 | Three fault-injection tests pass |
| J40 | **Publish the error surface** | How many report sites, how many codes, how many bare catches remain. | S | 2 | Generated line |

# K · Cold start and payload (40)

*Today: 2.3 MB of unminified JS across 163 unbundled ES modules, no build step, no bundling, no
code splitting, no preload, no service worker, no manifest — plus three Google Fonts families
(Syne, IBM Plex Mono, Literata with a full optical-size axis) loaded render-blocking from a CDN
before the first frame. The gated Dark layer (17 modules, 7.5k lines), the catalogue (~3.4k lines)
and the teaching system all ship whether or not you touch them. `site/img` is 2.5 MB of PNG with
four files over half a megabyte.*

**Felt payoff:** `PURPOSE.md` says delight in the first ninety seconds. On a Quest browser today an
unknown fraction of that budget is spent downloading. This section is the cheapest available win
on the product's own headline metric.

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| K1 | **Measure time-to-first-frame** | Everything here is a guess until this exists. | M | 3 | Measured on a headset browser and a phone; committed |
| K2 | **Measure the request waterfall** | 163 module requests with dependency depth. | S | 3 | Depth and count recorded |
| K3 | **Measure transfer vs parse vs execute** | They need different fixes. | S | 3 | Three numbers |
| K4 | **A cold-start budget** | The number this section is judged against. | S | 3 | Stated in `shipped.md` |
| K5 | **Ratchet it** | Same enforcement pattern as everywhere. | M | 3 | CI fails on regression |
| K6 | **Add a build step** | The absence of one is the root cause of most of this section. | M | 3 | `npm run build` produces a deployable `vr/` |
| K7 | **Keep unbundled dev** | The current no-build workflow is genuinely pleasant; do not lose it. | S | 3 | Dev unchanged; build is for deploy |
| K8 | **Minify** | Lowest effort, immediate win. | S | 3 | Transfer size drops; measured |
| K9 | **Source maps published** | Debugging a minified planet otherwise. | S | 3 | Present |
| K10 | **Compression check** | GitHub Pages serves gzip; confirm brotli behaviour. | S | 2 | Measured, documented |
| K11 | **Self-host the fonts** | Three families, CDN, render-blocking, on the critical path. | M | 3 | Local `woff2`; no third-party request at boot |
| K12 | **Subset the fonts** | Latin only; drop the unused optical-size range on Literata. | M | 3 | Font bytes drop measurably |
| K13 | **`font-display: swap` and a real fallback stack** | Text should never block the planet. | S | 3 | Present |
| K14 | **Preload only the first-paint font** | The other two can arrive late. | S | 2 | One preload |
| K15 | **Audit whether three families are needed** | A display, a mono, and a serif is defensible; confirm all three are used. | S | 2 | Usage audited |
| K16 | **Split the Dark layer out** | 17 modules, 7.5k lines, gated behind `?dark=1`. | M | 3 | Loaded on demand; measured saving |
| K17 | **Split the catalogue** | `catalogue.js` + `catalogue-rules.js` ≈ 3.4k lines for a picker. | M | 3 | Loaded on first open |
| K18 | **Split the teaching system** | `teach.js` + `god/tips.js` (573 lines of tips). | M | 2 | Loaded on demand |
| K19 | **Split the Lab panels** | `climatePanel.js` (923) and `platesPanel.js` are behind a tab. | M | 2 | Loaded on tab open |
| K20 | **Split the paint/layer system** | `layers.js` (31 exports) is a tool, not a boot requirement. | M | 2 | Deferred |
| K21 | **Split the instruments and export paths** | Paper export, PNG export, chronicle export. | M | 2 | Deferred |
| K22 | **Keep the critical path explicit** | A named list of what must load before first frame. | S | 3 | Documented and enforced by the build |
| K23 | **Fail the build if the critical path grows** | The only way splitting survives. | M | 3 | Budget per chunk |
| K24 | **Defer the data JSON** | 372 KB total; `exoarchive-snapshot.json` alone is 84 KB and is catalogue-only. | M | 3 | Loaded with the catalogue chunk |
| K25 | **`param-coverage.json` is a dev artefact** | 38 KB shipped to every visitor. | S | 2 | Excluded from the runtime bundle |
| K26 | **Compile the data tables into the chunks that use them** | Nine `*Table.js` files. | M | 2 | Co-located |
| K27 | **Optimise `site/img`** | 2.5 MB of PNG, four files over 500 KB. | S | 3 | WebP/AVIF with PNG fallback; total under 600 KB |
| K28 | **Responsive image sizes** | The README and site pages show them at a fraction of native size. | S | 2 | `srcset` present |
| K29 | **Lazy-load below-fold images** | `loading="lazy"`. | S | 2 | Present |
| K30 | **A service worker for repeat visits** | The Gardener returns tomorrow; the second visit should be instant. | M | 3 | Cache-first for the shell |
| K31 | **Version the cache properly** | The `?v=alive69` query string on `main.js` is doing this by hand today. | M | 3 | Content-hashed filenames |
| K32 | **Replace the manual cache-bust** | It only busts one file of 163. | S | 3 | Hashed assets; the query string is gone |
| K33 | **A web app manifest** | Installable, correct theme colour, correct icon. | S | 2 | Present |
| K34 | **Preconnect only what is used** | Two preconnects to Google Fonts become zero after K11. | S | 2 | Removed |
| K35 | **Progressive boot** | `setBootPhase` already narrates; show the planet before everything is ready. | M | 3 | First frame precedes full init |
| K36 | **Show something in the first 500 ms** | Even a static disc beats a blank canvas. | M | 3 | Measured |
| K37 | **Generate-time budget** | Distinct from load and from tick (fidelity E93). | M | 2 | Measured per world |
| K38 | **Track payload per route** | `vr/`, `vr/?demo=1`, `site/` differ. | S | 2 | Per-entry report |
| K39 | **Publish the numbers** | Cold start belongs beside the tick numbers in `shipped.md`. | S | 2 | Present |
| K40 | **Re-measure on real hardware after each K row** | Optimisation without measurement is churn. | S | 3 | Before/after in each commit |

# L · UI architecture and the design system (40)

*Today: `main.js` is 4,811 lines with 68 imports and 73 `click` listeners; `render.js` is 3,071;
`vr/index.html` is 2,332 lines of which 1,755 are inline CSS, with 197 ids and 97 real `<button>`
elements. `vr/index.html` defines 16 CSS custom properties; each of the 20 `site/*.html` pages
defines its own disjoint set (`--ground`, `--panel2`, `--rule`, `--make`, `--hand`, `--play`). The
two halves of the product do not share a single colour.*

**Felt payoff:** this is the beauty section. Consistency is most of what reads as craft, and one
token file is what makes a dark/light pass, a high-contrast mode, and a coherent pitch site
possible at all. Right now every visual change is 197 ids of archaeology.

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| L1 | **One token file** | `tokens.css` with colour, type, space, radius, motion. | M | 3 | Imported by `vr/` and every `site/` page |
| L2 | **Reconcile the two palettes** | 16 props vs the site's ~14; decide one system. | M | 3 | One palette; both halves use it |
| L3 | **Semantic tokens over raw colours** | `--surface`, `--surface-raised`, `--text-dim`, not `--panel2`. | M | 3 | Raw hex appears only in the token file |
| L4 | **A type scale** | Syne / IBM Plex Mono / Literata are a good trio with no scale. | M | 3 | Named steps; no ad-hoc `font-size` |
| L5 | **A space scale** | `--gutter` exists alone. | S | 3 | Named steps used throughout |
| L6 | **A motion scale** | `--ease` exists alone; durations are inline. | S | 2 | Named durations and easings |
| L7 | **Respect `prefers-reduced-motion` in CSS too** | `localview.js` honours it in 10 places; the CSS does not. | S | 3 | Media query present; transitions suppressed |
| L8 | **Extract the inline CSS** | 1,755 lines in a `<style>` block. | M | 3 | External stylesheets, split by concern |
| L9 | **Split CSS by surface** | shell / dock / panels / overlays / local view. | M | 2 | Files under 300 lines each |
| L10 | **Critical CSS inline, the rest deferred** | Keeps K's first-paint win. | M | 2 | Split measured |
| L11 | **A component convention** | Not a framework — a documented pattern for "a panel", "a chip", "a dock button". | M | 3 | Written down; three components follow it |
| L12 | **`decorateButton` is already a component factory** | `god/icons.js` has the seed of this. | S | 2 | Generalised |
| L13 | **Stop addressing UI by 197 ids** | `getElementById` everywhere is why the three files are coupled. | L | 3 | Panels own their subtree; ids drop measurably |
| L14 | **One binding pattern** | `bindClimatePanel`, `bindPlatesPanel`, `bindLayerPanel` already hint at it. | M | 3 | All panels use the same lifecycle |
| L15 | **A panel lifecycle** | mount / update / unmount, so K19's lazy panels are possible. | M | 3 | Defined and used |
| L16 | **Panels update only when visible** | Also a perf win (fidelity E68). | M | 3 | Hidden panels cost ~0 |
| L17 | **One refresh cadence table** | `updateHUD` hand-rolls 400/500/600 ms gates. | S | 2 | Declared per panel |
| L18 | **Split `main.js` by surface, not by size** | Arbitrary splitting makes it worse. | L | 3 | Input, XR, HUD, dock, boot as separate modules |
| L19 | **Extract the input layer** | 73 click + 13 change + pointer/wheel/key handlers in one file. | M | 3 | `vr/input.js` owns events; dispatches intents |
| L20 | **Intents, not handlers** | "descend to cell" as a named action makes keyboard, touch, and XR one path (section N). | M | 3 | Intent layer exists |
| L21 | **Extract the XR layer** | `xrSession` state threads through `main.js`. | M | 2 | `vr/xr.js` |
| L22 | **Extract the boot sequence** | `setBootPhase` implies a state machine that is not one. | M | 3 | Explicit boot module with phases |
| L23 | **Split `render.js`** | 3,071 lines, 34 exports. | L | 2 | Globe / entities / overlays / scatter as modules |
| L24 | **Separate GL resource management from drawing** | The usual seam in a file this size. | M | 2 | Split |
| L25 | **A UI state store** | Panel open/closed currently lives on DOM classes and `W`/`S`. | M | 3 | Single store; H31/H32 move state out of `W` |
| L26 | **Derive DOM from state, not the reverse** | Reading `classList.contains('is-open')` as truth is fragile. | M | 3 | State is authoritative |
| L27 | **The `site/` pages share the tokens** | 20 pages, each with its own copy of the palette. | M | 3 | All import `tokens.css` |
| L28 | **Extract the shared site chrome** | Header, footer, nav duplicated 20 times. | M | 2 | One partial or one generated shell |
| L29 | **`doc-responsive.css` is 30 lines and linked by 17 of 20 pages** | Finish the job it started. | S | 2 | All pages linked; the file grows to hold the shared rules |
| L30 | **The site and the app look like one product** | They currently do not. | M | 3 | Side-by-side review passes |
| L31 | **A light theme** | `color-scheme: dark` is hardcoded; tokens make this a palette swap. | M | 2 | Light theme works in both halves |
| L32 | **A high-contrast theme** | Accessibility, and it needs tokens to exist. | M | 3 | Meets WCAG AA at minimum |
| L33 | **Audit contrast now** | `--dim` and `--faint` on `--panel` are the likely failures. | S | 3 | Every text/background pair measured |
| L34 | **Fix the failures** | Whatever L33 finds. | M | 3 | AA on all body text |
| L35 | **Consistent focus styling** | Currently browser default over a dark planet. | S | 3 | Visible `:focus-visible` ring using a token |
| L36 | **Consistent disabled and pressed states** | 53 `aria-pressed` buttons deserve one visual language. | S | 2 | One treatment |
| L37 | **Icon system audit** | `iconSVG` exists; check for one-off inline SVGs. | S | 2 | One source |
| L38 | **A visual regression harness** | `paintDisc` proves CPU-side picture testing works; extend the idea to UI. | L | 2 | Screenshot diffs on key panels |
| L39 | **`capture-site.mjs` already screenshots** | Reuse it rather than building a second harness. | S | 2 | Wired into CI as an artefact |
| L40 | **Document the design system** | For people and for agents. | M | 3 | One page; generated token reference |

# M · People: access, input, and aliveness (40)

*Today the honest picture is mixed. Genuinely good: 97 real `<button>` elements (not divs), 53
`aria-pressed`, 17 `aria-label`, 5 `aria-live`, 3 `role="dialog"`, 26 `<label>`, and `localview.js`
respecting reduced motion in 10 places. Genuinely missing: **no `<html lang>` (no `<html>` element
at all)**, one `tabindex` in the whole document, 7 `.focus()` calls total, `<canvas id="c">` with no
role/label/tabindex — the planet itself is not reachable — and one `keydown` handler against 73
`click` handlers. PD brief §6 mandates mechanic B (pinch-and-step) as the *permanent accessibility
setting* for the descent; there is no non-XR fallback story written down.*

**Felt payoff:** the descent loop is the product. Right now it is available to a mouse and a
headset. Making it available to a keyboard, a phone, and a screen reader is both the right thing and
the thing that makes the pitch demonstrable on any device in the room.

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| M1 | **`<html lang="en">`** | There is no `<html>` element; the browser implies one with no lang. | S | 3 | Present in `vr/` and all `site/` pages |
| M2 | **Make the canvas focusable and labelled** | The planet is the product. | S | 3 | `tabindex="0"`, `role="application"`, `aria-label` |
| M3 | **Describe the planet for a screen reader** | A live text summary of what the globe shows. | M | 3 | `aria-live` region with era, climate, life state |
| M4 | **Keyboard spin and zoom** | Arrows and +/− on the focused canvas. | M | 3 | Works; documented |
| M5 | **Keyboard cell selection** | Move a cursor cell-to-cell; the neighbour table already exists. | M | 3 | Works |
| M6 | **Keyboard descend** | The core loop beat, from the keyboard. | M | 3 | Works |
| M7 | **Keyboard tool use** | Number keys to select, Enter to apply at the cursor. | M | 3 | Works |
| M8 | **A visible keyboard cursor** | Keyboard interaction needs a spatial indicator. | M | 3 | Rendered, theme-aware |
| M9 | **Split the one keydown handler** | It is a long `if (e.key === …)` chain that will not scale to M4–M7. | M | 3 | Keymap table, dispatched via L20's intents |
| M10 | **A keymap that is data** | So it can be shown, and later rebound. | S | 2 | Declared table |
| M11 | **A keyboard-shortcuts overlay** | `?` already opens the tour; add a shortcuts view. | S | 2 | Present |
| M12 | **Rebindable keys** | Left-hand and one-handed users. | M | 2 | Persisted rebinding |
| M13 | **Full tab order audit** | One `tabindex` means order is DOM order, which is not panel order. | M | 3 | Logical order verified with a keyboard-only pass |
| M14 | **Focus trap in the 3 dialogs** | One `aria-modal`, 7 `.focus()` calls total. | M | 3 | Focus contained and restored |
| M15 | **Escape closes every overlay** | Partly true today (several `Escape` branches exist); make it universal. | S | 3 | Consistent |
| M16 | **Skip link to the planet** | Past the dock, straight to the thing. | S | 2 | Present |
| M17 | **Announce state changes** | 5 `aria-live` regions exist; audit what they cover. | M | 3 | Tool changes, epoch changes, and moments announced |
| M18 | **Do not announce everything** | A chatty live region is worse than a silent one. | S | 3 | Politeness levels chosen deliberately |
| M19 | **A screen-reader pass** | With an actual screen reader, once. | M | 3 | Findings logged in `PLAYTESTS.md` |
| M20 | **Non-XR descent is the documented fallback** | PD §6's mechanic B as the permanent accessibility path. | M | 3 | Written down; implemented on flat screen |
| M21 | **Flat-screen descent parity** | `NEXT.md`'s "After" list already names a flat-screen comfort path. | L | 3 | Descent works and feels intentional without a headset |
| M22 | **Touch descent** | `isPhone()` and a phone dock already exist. | M | 3 | Pinch-and-step on touch |
| M23 | **Touch target sizes** | 97 buttons at headset-and-mouse sizes. | M | 3 | 44px minimum on touch |
| M24 | **Gesture alternatives** | Every pinch/drag has a button equivalent. | M | 3 | Audit complete |
| M25 | **One-pointer operation** | No interaction should require two simultaneous touches. | M | 2 | Audit complete |
| M26 | **Reduced-motion in the descent** | The transition is the vection hazard PD §6 names. | M | 3 | Reduced-motion uses the discrete path |
| M27 | **Reduced-motion covers the CSS** | Links L7. | S | 3 | Done |
| M28 | **A comfort settings panel** | Vignette strength, transition duration, snap vs continuous. | M | 3 | Present and persisted |
| M29 | **Reduced-audio already exists** | `__orreryReducedAudio` is referenced; expose it properly. | S | 2 | A real setting |
| M30 | **Captions for audio events** | Audio carries information (`playEvent`). | M | 2 | Text equivalent available |
| M31 | **Colour is never the only channel** | Overlays and legends lean on hue; `legendEntries` exists to help. | M | 3 | Pattern or label accompanies colour in every overlay |
| M32 | **Colour-blind-safe overlay palettes** | Climate and biome ramps especially. | M | 3 | Palettes verified for the three common types |
| M33 | **A colour-blind mode** | Token-driven after L1. | M | 2 | Selectable |
| M34 | **Text scaling** | Fixed px type breaks at 200% zoom. | M | 2 | Layout survives 200% |
| M35 | **Legible defaults on a phone** | The demo gets shown on phones. | M | 3 | Phone pass with real text sizes |
| M36 | **The planet has a name and a voice** | Cernunnos exists in `briefs/cernunnos.md`; aliveness is mostly this. | M | 2 | Voice present in the living demo |
| M37 | **Idle life** | A planet you are not touching should still visibly move. | M | 3 | Something moves in every 10-second window at every tier |
| M38 | **Ambient sound tied to state** | Wind, rain, and ocean from real fields, not a loop. | M | 2 | Audio reads the fields |
| M39 | **A first-run without instructions** | The Vandal hook shipped; test whether it works with no text at all. | M | 3 | Playtest row in `PLAYTESTS.md` |
| M40 | **An accessibility statement** | What works, what does not, what is next. Honesty, same as `model-limits.md`. | S | 3 | `briefs/accessibility.md` published |

# N · A codebase an agent can work in (40)

*Today: no `CLAUDE.md`, no `AGENTS.md`, no architecture map. 139 of 139 `sim/` modules have a prose
header comment — which is genuinely excellent and rare — but only **3 files carry `@param` or
`@returns`**. The knowledge is in beautifully written English that no tool can check, and the
codebase's most load-bearing object (`W`, 733 names) has no reference at all. An agent asked to
change hydrology must read 80k lines to find out who else writes `moist`.*

**Felt payoff:** the multiplier on every other section. The same artefacts that let an agent work
safely — a field reference, a module map, an invariant list, an error catalogue — are what let a
new human contributor start on a Tuesday.

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| N1 | **`CLAUDE.md`** | What the project is, where things live, how to run the loop, what not to touch. | M | 3 | Present at repo root |
| N2 | **Commands block first** | Fast suite, full suite, lint, typecheck, build, serve. | S | 3 | Copy-pasteable |
| N3 | **Non-negotiables block** | No `Math.random` in the sim path, golden hashes must not move, `PURPOSE.md` prioritisation. | S | 3 | Stated |
| N4 | **Point at the registers** | `NEXT.md` is the queue; the two 500/400 registers are quarries. | S | 3 | Stated |
| N5 | **Keep it short** | A 500-line `CLAUDE.md` is ignored. | S | 3 | Under 100 lines |
| N6 | **Directory-scoped notes where they earn it** | `vr/sim/CLAUDE.md` for tick conventions. | M | 2 | Present where useful only |
| N7 | **The prose headers are the asset — index them** | 139 module headers is a documentation corpus with no table of contents. | M | 3 | Generated index of every module's one-line purpose |
| N8 | **One-line purpose per module, enforced** | A new module without a header fails lint. | S | 2 | Rule present |
| N9 | **A module map** | 163 modules, no index; which cluster does what. | M | 3 | `briefs/architecture.md` with a real dependency picture |
| N10 | **Generate the dependency graph** | Hand-drawn maps rot. | M | 3 | Generated from imports |
| N11 | **Name the clusters** | climate / hydro / geo / bio / evo / agents / dark / god / catalogue / render / ui. | S | 3 | Named and used consistently |
| N12 | **Document the tick order** | The 42-call chain in `simTick` with its ordering constraints. | M | 3 | Generated from the scheduler table (fidelity E21) |
| N13 | **Document *why* the order is the order** | Several constraints are already in comments ("after storms, before fire"). Collect them. | M | 3 | Constraint list; the scheduler asserts them |
| N14 | **The `W` field reference** | From H1's schema. The single most useful page for an agent. | M | 3 | Generated |
| N15 | **The save-format reference** | From I37. | S | 3 | Generated |
| N16 | **The error-code catalogue** | From J21. | S | 3 | Generated |
| N17 | **The units reference** | From the fidelity register's A21–A40. | S | 3 | Generated |
| N18 | **The design-token reference** | From L40. | S | 2 | Generated |
| N19 | **All references generated, never hand-written** | Hand-written references are wrong within a month. | S | 3 | Build step; hand edits fail CI |
| N20 | **Convert prose invariants to `@param`/`@returns`** | 3 files of 139 today. | L | 3 | Public functions in `sim/` typed |
| N21 | **Prioritise by fan-in** | Type the most-imported modules first: `sphere.js`, `math.js`, `rulesets.js`, `world.js`. | S | 3 | Top-10 by fan-in typed |
| N22 | **Keep the prose** | Types replace nothing; they make the prose checkable. | S | 3 | No header comment deleted in the process |
| N23 | **Document the layering rule** | `sim/` must not touch DOM or GL; G18 enforces it, this explains it. | S | 3 | Written |
| N24 | **Document the naming conventions** | `*Tick`, `format*`, `*Table.js`, `_`-prefix. All real and undocumented. | S | 3 | Written |
| N25 | **Document the data-compiler pipeline** | JSON → `scripts/*.mjs` → `*Table.js`. README mentions it; expand. | M | 3 | Written, with the full list |
| N26 | **Document how to add a world** | `data.mjs` already prints "the sites a new world still needs". | M | 2 | A checklist |
| N27 | **Document how to add a field** | H29's checklist, in the docs. | S | 3 | Written |
| N28 | **Document how to add a subsystem** | Scheduler row, owner, tests, budget, provenance. | M | 3 | Written |
| N29 | **Document how to add a test** | Which tier, which tag, which helper. | S | 3 | Written |
| N30 | **A worked example end to end** | One small change, shown through every gate. | M | 3 | Present in `CLAUDE.md` or linked |
| N31 | **Machine-readable repo metadata** | Entry points, test commands, generated-file globs. | S | 2 | `repo.json` or equivalent |
| N32 | **Mark generated files as generated** | Nine `*Table.js` plus site pages. An agent editing a generated file wastes a session. | S | 3 | Header banner + lint rule |
| N33 | **Mark historical docs as historical** | `biosphere-architecture.md` / `-audit.md` are already flagged in `RETIRED.md`; put it in the files. | S | 2 | Banner in each |
| N34 | **A glossary** | `sim/glossary.js` exists in code; the repo needs the developer-facing twin. | M | 2 | Written |
| N35 | **Commit-message conventions** | The existing history is unusually descriptive; codify it. | S | 2 | Written |
| N36 | **A PR checklist** | Tests, provenance, golden, budget, docs. | S | 2 | Template present |
| N37 | **Encode the review rules as checks where possible** | A checklist item that CI can verify should be a CI check. | M | 3 | Each checklist line marked automated or manual |
| N38 | **A stable public API per cluster** | So an agent knows what is safe to call. | M | 2 | `index.js` per cluster with the intended surface |
| N39 | **Keep the two registers linked and pruned** | Fidelity 500 and quality 400 must shrink or they become the thing they replaced. | S | 3 | Both linked from `NEXT.md`; row counts tracked |
| N40 | **Measure whether it worked** | Time-to-first-useful-change for a newcomer or an agent. | S | 2 | One recorded attempt, logged |


# O · The suites nobody runs (40)

*Today five test entry points are in no npm script and in no default path: `dark-test.mjs` (792
lines), `dark-scenario.mjs` (243), `origin-sketch-test.mjs` (69), `deeptime.mjs` (259) and
`scale.mjs` (43) — 1,406 lines of tests, most of it covering the Dark layer, which is the newest,
least-settled and most consequential subsystem in the build. `calibrate.mjs`, `headless.mjs`,
`thrive-probe.mjs` and `dark-probe.mjs` are reachable by name but only `calibrate` and `golden` have
scripts. The pattern is consistent: every time a hard subsystem landed, a harness was written to
prove it, and then nothing ran the harness again.*

**Felt payoff:** the confidence to touch the Dark layer, the origin sketch, or deep time at all.
Untested-but-tested code is the worst of both worlds — the work of writing the test was paid and
none of the benefit is being collected.

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| O1 | **Run `dark-test.mjs`** | 792 lines covering the gated war layer. | S | 3 | In a named script and in CI |
| O2 | **Run `dark-scenario.mjs`** | 243 lines of scenario-level assertions. | S | 3 | Wired |
| O3 | **Run `origin-sketch-test.mjs`** | The origin ceremony is on the first-run path. | S | 3 | Wired |
| O4 | **Run `deeptime.mjs`** | Deep time is the headline claim of the whole model. | S | 3 | Wired |
| O5 | **Run `scale.mjs`** | 43 lines; the XR scale ladder. | S | 2 | Wired |
| O6 | **Find out whether they still pass** | Some almost certainly do not — that is the point. | S | 3 | Status of each recorded |
| O7 | **Fix or delete the failures** | A permanently-red suite is worse than none. | M | 3 | All five green or explicitly retired |
| O8 | **Assign each to a tier** | Fast / full / sweep, per F5. | S | 3 | Tagged |
| O9 | **Fold them into one harness** | F6's consolidation; five conventions become one. | M | 3 | All use `harness.mjs` |
| O10 | **Preserve their output style** | `dark-test.mjs` may have its own reporting worth keeping. | S | 2 | Reviewed |
| O11 | **A "no orphan entry points" check** | The rule that prevents this recurring. | S | 3 | Any `*test*.mjs` not reachable from a script fails CI |
| O12 | **Same rule for probes** | `thrive-probe.mjs` and `dark-probe.mjs` are measurement tools, not tests — classify them. | S | 3 | Classified; probes have their own script |
| O13 | **Probes produce committed baselines** | A probe whose output nobody compares is a print statement. | M | 3 | Probe output baselined and diffed |
| O14 | **`thrive-probe` baseline** | It measures beings, herds, settlements, fire — the living demo. | M | 3 | Baseline committed; drift detected |
| O15 | **`dark-probe` baseline** | Gated layer, but `?dark=1` is a public URL. | M | 2 | Baseline committed |
| O16 | **`headless.mjs` in a script beyond golden** | `npm run headless` exists; make its output assertable. | S | 3 | Assertions on the report |
| O17 | **`calibrate.mjs` runs in the suite** | It has a script and is not in `npm test`'s path by name. | S | 3 | Wired (also fidelity B6) |
| O18 | **`biosphereHolds` runs somewhere** | The 750-tick check that caught a dying planet is not in any script. | S | 3 | In the sweep tier |
| O19 | **`smoke.mjs` runs** | 121 lines, has a script, not in `npm test`. | S | 3 | In the fast tier (also F3) |
| O20 | **`test-worldParams.mjs` keeps its identity** | 60 assertions, distinct concern; do not merge it away. | S | 2 | Still separately runnable |
| O21 | **Audit `reconcile-params.mjs`** | Exists, prints disagreements, nothing calls it (fidelity A61). | S | 3 | Wired as a report |
| O22 | **Audit `capture-site.mjs`** | Screenshot tooling that could serve L38/L39. | S | 2 | Purpose documented; wired or retired |
| O23 | **Audit every `scripts/*.mjs`** | 20 files; which are compilers, which are probes, which are dead. | M | 3 | Each classified in one table |
| O24 | **Delete the dead scripts** | The backlog emitters were already removed; check for stragglers. | S | 2 | None remain |
| O25 | **Document the surviving scripts** | README's `## Data compilers` covers some. | S | 3 | All 20 documented |
| O26 | **Every script has an npm entry** | Discoverability for people and agents. | S | 3 | `package.json` complete |
| O27 | **`--help` on every script** | Several already have excellent header docs; surface them. | M | 2 | `--help` prints the header |
| O28 | **Consistent flag parsing** | `headless.mjs` hand-rolls it; `thrive-probe.mjs` does its own. | S | 2 | One shared parser |
| O29 | **Consistent `--json` output** | For CI and for agents to consume. | S | 3 | All probes support it |
| O30 | **Exit codes mean something** | A probe that always exits 0 cannot gate anything. | S | 3 | Documented per script |
| O31 | **The Dark layer's test debt is the priority** | 7.5k lines of the newest code, and `NEXT.md` row 9 pauses its expansion. | M | 3 | Dark coverage measured and reported |
| O32 | **Dark-off inertness is asserted** | The gate's whole promise (fidelity B96/F38). | S | 3 | Present |
| O33 | **Dark save round-trip** | Arsenals, flights, mushrooms, polities, war crimes (also I14). | M | 3 | Covered |
| O34 | **Origin sketch is on the first-run path** | Which makes its orphaned test the riskiest of the five. | S | 3 | Covered and running |
| O35 | **Deep time gets a sweep tier** | 4.567 Ga at adaptive `dtYr` is a long run by construction. | M | 3 | Nightly |
| O36 | **XR scale ladder needs a device test plan** | `scale.mjs` can only cover the maths. | M | 2 | Manual test plan written; results in `PLAYTESTS.md` |
| O37 | **A coverage map of harnesses to subsystems** | Which of the 11 clusters (N11) has a harness and which has none. | M | 3 | Table published |
| O38 | **Fill the biggest harness gap** | Whatever O37 finds — likely `agents`, `god` or `render`. | L | 3 | One new harness for the largest gap |
| O39 | **One command that runs everything** | `npm run verify` — lint, types, fast, full, golden, ladder, probes. | S | 3 | Exists and is what CI calls |
| O40 | **Publish what is verified and what is not** | The honest inventory, in the same spirit as `model-limits.md`. | S | 3 | Table in `shipped.md` |


---

## Promotion protocol

Same as the fidelity register, and it matters more here because these rows are tempting to
batch-apply:

1. **`NEXT.md` remains the only queue.** Promote 1–3 rows at a time.
1b. **A `verify` script is this file's `fidelity` script.** The fidelity register already earned
   `npm run fidelity` (provenance ratchet, calibrate-all, golden corpus, climate parity, alloc lint).
   Row O39 is the equivalent gate for this file — build it as rows land, not at the end.
2. **The First 20 table is the gate.** Fourteen of those twenty are tooling, and the rest of the
   400 get much cheaper once they land.
3. **Never refactor before the formatter (G6) and the golden corpus** (fidelity D76). Formatting
   churn and behaviour churn in one diff is unreviewable, and structural change without hashes is
   how a simulation quietly stops being itself.
4. **Delete rows when they land.** Note them in [`shipped.md`](shipped.md). This file should shrink.
5. **If a row has no check, delete it.**

## Dependency spine

```
G1,G6  (lint + one formatting commit)
   └─> H1,H2  (field schema)  ────────┬─> I6,I7   (schema-driven save/load)
          │                           ├─> J17-J21 (reportable invariants)
          │                           └─> N14     (the W reference)
G21-G23 (checkJs + ratchet) ──> N20-N22 (types over the prose)
G31    (CI) ──> F1,F40 (fast tier + budget) ──> everything else stays true
K1     (measure TTFF) ──> K6,K11,K16-K21 (build, fonts, splitting)
L1,L2  (tokens) ──> L31-L36 (themes, contrast, focus) ──> M31-M35 (colour + scaling)
L19,L20 (input layer + intents) ──> M4-M12 (keyboard) ──> M20-M26 (descent for everyone)
N1     (CLAUDE.md) ──> pays for itself on the first row anyone else picks up
O1-O7  (run the five orphaned suites) ──> O11 (the rule that stops it recurring)
```

**Read that as:** `G1`, `G6`, `K1`, `L1` and `N1` are free-standing and cheap. `H1` is the keystone —
sections I, J and N all resolve into it. `L20`'s intent layer is the unlock for all of M's input
work; without it, keyboard support means adding a fourth copy of every handler.

## What this does not cover

- Fidelity, calibration, coupling, determinism and tick speed — those are the
  [500-item register](earth-fidelity-500.md). Rows here cross-reference it rather than duplicating.
- Product scope, onboarding and playtest cohorts — themes 1–6 of the audit, and `NEXT.md` already
  owns the live ones.
- New features anywhere. Every row above makes something that exists work better, load faster,
  fail louder, or become legible to the next person who opens the file.
