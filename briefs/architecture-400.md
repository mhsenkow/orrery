# ORRERY — architecture & reach: 400 actions

**Status:** register, not a queue. Third companion to [`earth-fidelity-500.md`](earth-fidelity-500.md) and [`quality-400.md`](quality-400.md).
**Scope:** audit themes 16–20, re-read after the first implementation pass.
**Sections:** P `W` enforcement · Q build & boot · R decomposition · S failure conversion · T reach. Five sections, eighty rows each.
**Date:** 2026-08-22

---

## Why a third register: what the first pass actually did

Themes 16–20 were covered by `quality-400.md` sections H, K, L, J and M. Much of it shipped. The
honest re-read is that **the instrumentation landed and the structure did not** — and while the
tooling was being built, the files the structure lives in got bigger.

| Theme | Shipped | Measured now | Verdict |
|---|---|---|---|
| **16** `W` | schema + census + **P1 classify** + **P21/P41 guards** + **P22 multi-writers** + **P24 handoffs** | census **746**; handoffs **10**; `?assert=1` | Top-10 ownership/handoff declared; request/apply (P37) next |
| **17** cold start | fonts + **build** + **Q41** + **Q11 Pages→dist** | Deploy workflow verify-gated; headset note (Q61) | Delivery path is the build |
| **18** UI | tokens + CSS extract + touch + contrast | ids still ratcheted | Growth stopped |
| **19** failure | 0 bare catches + code ratchet | — | Conversion finished |
| **20** access | keymap + intents from all four sources (R43) | SR sessions / colour-blind open | Keyboard+pointer+touch+XR share intents |

**The pattern to break:** every theme got a file that *describes* or *measures* the problem, and
four of five did not get the change that removes it. A schema with an unenforced `owner` column, a
token file two documents import, and a cold-start doc with no build step are all the same shape —
a correct first move that stalls if the second move never comes.

**The rule this register adds:** a row is not done when the tooling exists. It is done when the
number the tooling reports has moved.

---

## First 20 — the gate

Ordered so that each one makes the next cheaper.

| # | Row | Why first | Status |
|---|---|---|---|
| 1 | Q1 | A build step. Q, R and most of P's enforcement need one to ship anything | ✓ `npm run build` → `dist/` |
| 2 | Q2 | Keep unbundled dev — the current workflow is good and must survive | ✓ source tree still served by `python3 -m http.server` |
| 3 | R1 | Extract the 1,835 inline CSS lines *before* they reach 2,000 | ✓ `vr/styles/*` (7 files ≤300); ~211 lines critical inline |
| 4 | R2 | Point them at `shared/tokens.css`, which already exists and is barely used | ✓ vr + site (incl. fleet) import tokens |
| 5 | P1 | Turn the 744-name census into a classification, not a frequency list | ✓ **0 uncurated**; kinds field/scalar/record/flag/derived/meta |
| 6 | P21 | Enforce `owner` under `debugAssert` — the column is inert today | ✓ `worldGuard.js` + `?assert=1` / tests |
| 7 | P22 | Publish the multi-writer list. This is where the `life[]` class of bug lives | ✓ `vr/data/fields/multi-writers.json` + report |
| 8 | S1 | Convert the 33 remaining bare catches. It is a bounded, finishable list | ✓ ledger + **0** bare (S18) |
| 9 | S21 | One code per report site; 8 codes against 13 call sites is under-specified | ✓ every code ∈ `ERROR_CODES`; ratchet in `architecture:ratchet` |
| 10 | R41 | Extract input from `main.js` before it passes 6,000 lines | ✓ `vr/input.js` owns keydown → intents |
| 11 | R42 | Intents, so T's keyboard/touch/XR work is one path not three | ✓ `vr/sim/intents.js`; pinch + keys dispatch |
| 12 | P41 | Seal `W` in debug — `W.tempreature = 5` still succeeds | ✓ typo throw in worldGuard (opt-in wrap) |
| 13 | T41 | Contrast audit. Cheap, and it gates every visual row after it | ✓ `briefs/contrast-audit.md` + `vr/data/contrast-audit.json` |
| 14 | Q21 | Split the Dark layer out; it is gated and still ships to everyone | prior wave (lazy `ensureDarkUi`) |
| 15 | R61 | A file-size ratchet on `main.js`, `render.js`, `index.html` — stop the growth first | ✓ `architecture:ratchet` |
| 16 | Q61 | Measure TTFF on a headset. `cold-start.md` says desktop-only | ✓ blocked note + method in `cold-start.md` |
| 17 | S41 | The diagnostics panel; `diagnosticsText` exists with nowhere to show it | prior (Lab diagnostics click) |
| 18 | T21 | Touch target audit — the demo gets shown on phones | ✓ coarse ≥44px incl. localpark / local bar |
| 19 | P61 | Get view state out of `W`; it is why the save carries junk | ✓ inventory + `viewState.js` four-bag doc (clockFace stays sim-coupled) |
| 20 | Q41 | Progressive first frame — the 90-second promise starts at byte zero | ✓ boot-disc + early `desktopFrame` after `initGL` |

**Also landed with the gate:** P14 (census budget = 744), R22 (id ratchet), R12 (CSS size ratchet), S17 (bare-catch ratchet). Command: `npm run architecture:ratchet`.

---

# P · `W`: from schema to enforcement (80)

*Current state: `vr/sim/fields.js` is 176 lines with 45 curated rows and an honest header — "full
census lives in `vr/data/fields/`", "owner: module that may write (convention; **not yet
enforced**)". `vr/data/fields/census.json` reports 744 distinct names across 188 files, with a
frequency histogram: `dark` 621, `h` 442, `rule` 338, `seaLevel` 277, `life` 260, `year` 250,
`build` 242. The count went up, not down.*

**What "done" means for this section:** the census number falls, every writable field has an
enforced owner, and a misspelled field name is an error rather than a wrong planet.

## P.1 Finish the classification (P1–P20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| P1 | **Classify all 744 names** | The census is a frequency list; it needs kind, not count. | L | 3 | Every name has `field`/`scalar`/`record`/`flag`/`derived`/`meta`/`dead` |
| P2 | **Auto-classify what can be** | Typed-array assignment ⇒ field; `_` prefix ⇒ derived. | M | 3 | ≥60% classified without hand work |
| P3 | **Triage the rest by frequency** | The top 50 names cover most call sites. | M | 3 | Top 50 curated into `fields.js` |
| P4 | **`dark` at 621 hits is not one field** | It is a namespace masquerading as a field. | S | 3 | `W.dark` declared as a record with its own sub-schema |
| P5 | **Sub-schemas for the record fields** | `dark`, `gases`, `carbon`, `techno`, `moments`, `chron`, `tree`. | M | 3 | Each has a declared shape |
| P6 | **`rule` at 338 is not world state** | It is configuration; it belongs in the run record. | M | 3 | Reclassified as `meta` |
| P7 | **Separate reads from writes in the census** | 442 hits on `h` tells you nothing about who *writes* it. | M | 3 | Census reports read/write counts separately |
| P8 | **Write-count is the ownership signal** | A field with one writer is safe; twelve is a bug queue. | S | 3 | Writers listed per field |
| P9 | **Find the dead names** | Written once, never read. | M | 3 | List produced |
| P10 | **Delete them** | The only way the count goes down. | M | 3 | Census count drops; number published |
| P11 | **Find the aliases** | Two names for the same quantity (`press`/`pSeen` is a known pair). | M | 3 | Alias list produced |
| P12 | **Resolve the aliases** | Rename or document as genuinely distinct. | M | 3 | Zero unresolved |
| P13 | **Find the near-duplicates** | `iceLand`/`iceSea`/`ice` is legitimate; look for ones that are not. | M | 2 | Reviewed |
| P14 | **A census ratchet** | 744 must not become 780 while this work happens. | S | 3 | `fields:report` fails on growth without a schema row |
| P15 | **New name requires a schema row** | The checklist in `CLAUDE.md`, enforced. | S | 3 | CI fails otherwise |
| P16 | **Census counts per cluster** | Which subsystem owns the most state. | S | 2 | Reported by cluster |
| P17 | **Flag fields touched by more than three clusters** | Cross-cluster state is the coupling. | M | 3 | List published |
| P18 | **Field-count target** | A number to aim at, not just a ratchet. | S | 2 | Target set with reasoning |
| P19 | **Census diff in review** | What this PR added to `W`. | S | 3 | Diff printed by `fields:report` |
| P20 | **Publish the curated share** | 45 of 744 today. The honest headline. | S | 3 | Generated line in `shipped.md` |

## P.2 Make `owner` mean something (P21–P40)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| P21 | **Enforce `owner` under `debugAssert`** | The column exists and does nothing. | M | 3 | A write from a non-owner throws in debug |
| P22 | **Publish the multi-writer list** | Every field written by more than one module. | M | 3 | List in `fields/report.json` |
| P23 | **Rank multi-writers by risk** | Conserved fields first. | S | 3 | Ranked |
| P24 | **Resolve the top 10** | One owner each, or an explicit documented handoff. | L | 3 | Ten resolved |
| P25 | **The `life[]` pattern as a detector** | Two modules each deferring to the other is a specific, detectable shape. | M | 3 | Detector flags mutual deferral |
| P26 | **Declare handoff order where two writers are correct** | Sometimes A-then-B is the design. | M | 3 | Handoffs declared in the schema |
| P27 | **Assert handoff order at runtime** | A declared order that is not checked is a comment. | M | 3 | Violations throw in debug |
| P28 | **Owner recorded per tick** | "Who last wrote `seaLevel` this tick?" | M | 2 | Available under a flag |
| P29 | **Blame in the error message** | Owner, writer, tick, field, value. | S | 3 | Format defined |
| P30 | **`derived` fields cannot be written by a tick** | Only their deriving function. | M | 3 | Enforced |
| P31 | **Derived fields declare their inputs** | So a stale derived value is detectable. | M | 3 | Inputs in the schema |
| P32 | **Detect stale derived values** | Input changed, derived did not. | M | 2 | Debug check |
| P33 | **Retire the compatibility shims** | `lifeClass` / `unlockedClass` exist for old readers per `model-limits.md`. | M | 2 | Readers updated or shims documented as permanent with a reason |
| P34 | **One writer for `life[]`, asserted** | The documented near-miss, locked. | S | 3 | Regression test present |
| P35 | **One writer for `seaLevel`** | 277 hits; it should be derived from ice mass. | M | 3 | Owner assigned |
| P36 | **One writer for `gases`** | Volcanoes, impacts, carbon, techno and Hadean all write CO₂ today. | M | 3 | Reservoir is the sole owner; others request |
| P37 | **A request/apply pattern for shared fields** | The general fix for P36's shape. | M | 3 | Pattern documented and used twice |
| P38 | **Ownership map in the module map** | `briefs/module-map.md` exists; add the state dimension. | S | 3 | Present |
| P39 | **Ownership coverage ratchet** | Percentage of writable fields with an enforced owner. | S | 3 | Ratchets upward |
| P40 | **Zero unowned writable fields** | The finish line. | L | 3 | Reached |

## P.3 Invariants and guards (P41–P60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| P41 | **Seal `W` in debug builds** | `W.tempreature = 5` currently succeeds silently. | M | 3 | Unknown-key write throws |
| P42 | **Measure the seal's cost** | Decide about production on numbers. | S | 3 | Measured; decision recorded |
| P43 | **A proxy only in debug, a frozen key list in production** | Cheap approximation if the proxy is too slow. | M | 2 | Implemented |
| P44 | **Declared range per field** | The schema has `unit`; it needs bounds. | M | 3 | Ranges present for all fields |
| P45 | **Range checks in debug** | Out-of-range write names the writer. | M | 3 | Working |
| P46 | **Non-negativity where physical** | Mass, density, thickness. | S | 3 | Declared and checked |
| P47 | **Monotonicity where physical** | `ageYr` never decreases outside a fork. | S | 3 | Declared and checked |
| P48 | **NaN guard on every declared field** | `assertNoNaN` covers four. | M | 3 | All declared fields covered |
| P49 | **NaN reports through `report.js`** | Section S's API. | S | 3 | Wired |
| P50 | **Quarantine rather than crash** | Freeze the offending subsystem, name it, keep the planet. | M | 3 | Degradation path defined |
| P51 | **Field length invariant** | Every field array is exactly `NC` long. | S | 3 | Checked after `changeResolution` |
| P52 | **Transactional resolution change** | A failed rebuild currently half-resizes. | M | 3 | Succeeds or rolls back |
| P53 | **Buffer reuse on resolution change** | Reallocating 700+ arrays is avoidable. | M | 2 | Allocation measured |
| P54 | **One source for `NC`** | `sphere.js` and `resolution.js` both know. | S | 2 | Single source |
| P55 | **Schema-driven allocation** | `reallocateWorldFields` should loop the table. | M | 3 | New field = one row |
| P56 | **Schema-driven reset** | Test isolation needs it. | S | 3 | `resetWorld()` exists |
| P57 | **Schema-driven save** | Kills the `if (data.x)` chain (quality-400 I6/I7). | M | 3 | Save/load derive from the table |
| P58 | **Schema hash in the save** | Detect a load under a changed schema. | S | 3 | Present |
| P59 | **Invariant violations in the test suite** | Fault injection, like S's tests. | M | 3 | Three injected violations caught |
| P60 | **Invariant coverage published** | How many fields have real invariants. | S | 2 | Generated line |

## P.4 Four kinds of state, not one bag (P61–P80)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| P61 | **Separate view state out of `W`** | `_localHover`, overlay mode, camera, highlight. | M | 3 | Moved; save shrinks measurably |
| P62 | **Separate UI state out of `W`** | Panel open/closed, active tab, dock state. | M | 3 | Moved to R's UI store |
| P63 | **Separate run metadata out of `W`** | Seed, rule, world name, landscape, epoch choice. | M | 3 | `Run` record (fidelity D46) |
| P64 | **What remains is world state** | The thing that is simulated and saved. | M | 3 | `W` contains only this |
| P65 | **Document the four kinds** | For people and agents. | S | 3 | In `CLAUDE.md` or the field reference |
| P66 | **`S` vs `W` boundary written down** | `main.js` has its own `S` object. | S | 3 | Documented |
| P67 | **Audit `_`-prefixed fields that are saved** | Convention says derived; the save may disagree. | S | 3 | List produced and resolved |
| P68 | **Group world state by subsystem** | `W.climate.*`, `W.bio.*` — the migration off a flat bag. | L | 2 | One cluster piloted |
| P69 | **Pilot on the smallest cluster** | `techno` is already a lazy object. | M | 2 | Merged with unchanged golden hashes |
| P70 | **Decide after the pilot** | A half-migration is worse than a flat bag. | S | 3 | Decision recorded either way |
| P71 | **Keep flat access working during migration** | Getters, or do not start. | M | 3 | No big-bang rename |
| P72 | **Golden hashes guard every step** | Fidelity D76 is the safety net for all of P. | S | 3 | Unchanged throughout |
| P73 | **`W` as an instance, not a module singleton** | Blocks two-world rendering and clean test isolation. | L | 2 | `createWorld()` usable twice |
| P74 | **Tests instantiate rather than import** | The clean version of test isolation. | L | 2 | Enabled |
| P75 | **Two worlds in one process** | The twin-view payoff (fidelity D52). | L | 2 | Works |
| P76 | **GPGPU slots already assume this** | The engine supports slots; `W` fights it. | S | 2 | Alignment documented |
| P77 | **The field reference is generated** | From the schema, for agents. | S | 3 | `briefs/fields.md` generated |
| P78 | **The reference includes owners and invariants** | The three things an agent needs before editing. | S | 3 | Present |
| P79 | **Never hand-edit the reference** | Generated docs rot the moment they are editable. | S | 3 | CI fails on hand edits |
| P80 | **Publish the whole scorecard** | Names, curated, owned, invariant-covered, saved. | S | 3 | One table, generated |

# Q · Build, bundle, boot (80)

*Current state: fonts are self-hosted (6 woff2, ~100 KB, no third-party request) and
`briefs/cold-start.md` records a measured desktop TTFF of ~1.5–3 s with a stated 4 s budget and an
8 s stretch for a headset that has not been measured. What has not happened: there is **no `build`
script in either `package.json`**. The app is still served as unbundled ES modules, and `main.js`
alone has grown from 4,811 to 5,621 lines. The doc's own "Follow-ups (not this gate)" list names
bundling and on-demand docks — this section is that list, expanded.*

**What "done" means:** a headset number in `cold-start.md`, a critical path that is a named list
rather than "whatever imports transitively", and the gated Dark layer not shipping to people who
never type `?dark=1`.

## Q.1 The build step (Q1–Q20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| Q1 | **Add a build** | esbuild or Rollup; one command, deployable output. | M | 3 | `npm run build` produces a servable `dist/` |
| Q2 | **Dev stays unbundled** | The no-build workflow is genuinely pleasant. Do not trade it. | S | 3 | `python3 -m http.server` still works on source |
| Q3 | **Build parity test** | Bundled and unbundled must behave identically. | M | 3 | Golden hashes match under both |
| Q4 | **Minify** | Lowest-effort transfer win. | S | 3 | Size drop measured and recorded |
| Q5 | **Source maps** | Debugging a minified planet otherwise. | S | 3 | Published |
| Q6 | **Content-hashed filenames** | Replaces the hand-rolled `?v=alive69` on `main.js`. | M | 3 | Hashes in filenames; query string gone |
| Q7 | **The manual cache-bust only busts one file of 163** | Which is why it is a bug, not a feature. | S | 3 | Removed |
| Q8 | **Tree-shake** | Verify it actually removes something; 42-export modules are a hint. | M | 2 | Dead-export savings measured |
| Q9 | **Keep `sim/` side-effect-free** | Tree-shaking depends on it. | M | 2 | `sideEffects` declared; verified |
| Q10 | **Build runs in CI** | A build that only runs locally breaks silently. | S | 3 | CI job |
| Q11 | **Deploy the build, not the source** | Pages currently serves source. | M | 3 | Pages serves `dist/` |
| Q12 | **Never deploy a red build** | The live URL is the pitch. | S | 3 | Gated on `npm run verify` |
| Q13 | **Per-chunk size budget** | The only thing that keeps splitting from rotting. | M | 3 | Budgets in config; build fails on breach |
| Q14 | **Total-payload budget** | One number for the whole entry. | S | 3 | Set and enforced |
| Q15 | **Budget report in the build output** | Visible on every build, not buried. | S | 3 | Printed |
| Q16 | **Size diff in review** | "This PR adds 40 KB to first load." | M | 3 | Reported |
| Q17 | **Keep the scripts out of the bundle** | `scripts/*.mjs` are dev tools. | S | 2 | Excluded; verified |
| Q18 | **Keep dev-only data out** | `param-coverage.json` (38 KB) and `fields/census.json` ship today. | S | 3 | Excluded |
| Q19 | **Audit what else is dev-only** | Baselines, typecheck baseline, provenance scoreboard. | S | 2 | List; excluded |
| Q20 | **Document the build** | For agents especially — a generated `dist/` is a trap otherwise. | S | 3 | In `CLAUDE.md`, with a "do not edit `dist/`" banner |

## Q.2 Split by gate (Q21–Q40)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| Q21 | **Split the Dark layer** | 17 modules, ~7.5k lines, gated behind `?dark=1`, shipped to everyone. | M | 3 | Loaded on demand; saving measured |
| Q22 | **`darkGate.js` is the seam** | A gate module already exists; make it the dynamic-import boundary. | M | 3 | One `import()` behind the gate |
| Q23 | **Dark-off must stay bit-identical** | The gate's promise (fidelity B96). | S | 3 | Golden hash unchanged |
| Q24 | **Split the catalogue** | `catalogue.js` (1,923) + `catalogue-rules.js`. | M | 3 | Loaded on first open |
| Q25 | **Catalogue data with the catalogue** | `exoarchive-snapshot.json` is 84 KB and catalogue-only. | S | 3 | Co-located in the chunk |
| Q26 | **Split the teaching system** | `teach.js` + `god/tips.js` (573 lines of tips). | M | 2 | On demand |
| Q27 | **But keep the first-run hook eager** | The Vandal hook is the first ninety seconds. | S | 3 | Hook stays in the critical path |
| Q28 | **Split the Lab panels** | `climatePanel.js` (923), `platesPanel.js`. | M | 2 | On tab open |
| Q29 | **Split the paint/layer system** | `layers.js`, 31 exports, tool-only. | M | 2 | Deferred |
| Q30 | **Split the export paths** | Paper, PNG, chronicle, finale artefact. | M | 2 | Deferred |
| Q31 | **Split the instruments** | Core, ice core, Keeling, transit spectrum. | M | 2 | Deferred |
| Q32 | **Split the origin sketch** | Ceremony code that runs once. | M | 2 | Deferred, without breaking the first-run path |
| Q33 | **Split `localview.js`** | 2,050 lines for the descent view — needed, but not before first paint. | M | 2 | Loaded before first descent, not before first frame |
| Q34 | **Split XR** | `navigator.xr` checks are cheap; the session code is not. | M | 2 | Deferred until a session is requested |
| Q35 | **Name the critical path explicitly** | A list, in the repo, of what must load before the first frame. | S | 3 | Documented and enforced by the build |
| Q36 | **Fail the build if the critical path grows** | Otherwise splitting decays. | M | 3 | Enforced |
| Q37 | **Prefetch on idle, not on load** | Deferred chunks should arrive before they are wanted. | M | 2 | `requestIdleCallback` prefetch |
| Q38 | **Prefetch in intent order** | Catalogue before Dark; descent before export. | S | 2 | Order declared |
| Q39 | **Handle a failed chunk load** | Offline mid-session is a real case (section S). | M | 3 | Reported with a code; retry offered |
| Q40 | **Measure each split** | Before/after in every commit. | S | 3 | Recorded in `cold-start.md` |

## Q.3 Boot and the first frame (Q41–Q60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| Q41 | **Progressive first frame** | Show a planet before everything initialises. | M | 3 | First paint precedes full init; measured |
| Q42 | **Something on screen in 500 ms** | Even a static disc beats a blank canvas. | M | 3 | Measured |
| Q43 | **Boot as an explicit state machine** | `setBootPhase` narrates phases that are not modelled. | M | 3 | Phases declared; transitions asserted |
| Q44 | **Per-phase timing** | Which phase owns the wait. | S | 3 | Reported |
| Q45 | **Phase budgets** | With a degradation path per phase. | M | 3 | Declared |
| Q46 | **Recoverable non-essential boot failure** | A failed catalogue load must not block the planet. | M | 3 | Degrades; reported (S26) |
| Q47 | **Hard-fail essential boot with a message** | A blank canvas and silence is the worst outcome. | S | 3 | Explicit fatal screen with a code |
| Q48 | **Separate generate cost from boot cost** | Two different waits, currently one number. | M | 3 | Reported separately |
| Q49 | **Generate at low N first, then refine** | Show a coarse planet immediately. | L | 2 | Prototype measured |
| Q50 | **Justify the climate spin-up length** | `_spinup` runs before the player sees anything. | M | 3 | Length derived from an equilibrium test (fidelity E94) |
| Q51 | **Spin-up off the main thread** | The worker exists and is barely used. | M | 2 | Piloted with identical hashes |
| Q52 | **Boot without a network after first visit** | The Gardener returns tomorrow. | M | 3 | Service worker; shell cached |
| Q53 | **Cache-first shell, network-first data** | The standard split. | M | 3 | Implemented |
| Q54 | **Service-worker update path** | A stale cached app is worse than a slow one. | M | 3 | Update prompt or silent swap on next load |
| Q55 | **A web app manifest** | Installable; correct theme colour and icon. | S | 2 | Present |
| Q56 | **Offline message, not a broken planet** | If a deferred chunk cannot load offline. | S | 3 | Handled |
| Q57 | **Preload the critical font only** | Six woff2 exist; not all are first-paint. | S | 2 | One preload |
| Q58 | **`font-display: swap` with a real fallback** | Text must never gate the planet. | S | 3 | Verified |
| Q59 | **Audit whether three families are used** | Syne, IBM Plex Mono, Literata. | S | 2 | Usage audited; unused weights dropped |
| Q60 | **Subset the fonts** | Latin, and trim Literata's optical-size axis. | M | 2 | Bytes drop; measured |

## Q.4 Measure it where it matters (Q61–Q80)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| Q61 | **Measure TTFF on a headset browser** | `cold-start.md` explicitly says this is unmeasured. | M | 3 | Number pasted into the doc |
| Q62 | **Measure on a mid-tier phone** | The 8 s stretch target has no data behind it. | M | 3 | Number recorded |
| Q63 | **Measure on a cold cache** | Warm-disk localhost is the easy case. | S | 3 | Recorded |
| Q64 | **Measure over real network conditions** | Throttled 4G, not localhost. | S | 3 | Recorded |
| Q65 | **Measure from GitHub Pages, not localhost** | The actual delivery path. | S | 3 | Recorded |
| Q66 | **Separate transfer, parse and execute** | They need different fixes. | S | 3 | Three numbers |
| Q67 | **Count the request waterfall depth** | The unbundled-modules cost is depth, not size. | S | 3 | Depth recorded |
| Q68 | **Long-task audit during boot** | What blocks the main thread before first paint. | M | 3 | Longest 5 named |
| Q69 | **Ratchet the numbers in CI** | `cold-start.md` says the ratchet is not wired. | M | 3 | Wired |
| Q70 | **Use a synthetic run for the ratchet** | Real-device numbers are too noisy to gate on. | M | 3 | Headless metric chosen and stable |
| Q71 | **Per-route payload** | `vr/`, `vr/?demo=1`, `vr/?dark=1`, `site/` all differ. | S | 2 | Reported per entry |
| Q72 | **Optimise `site/img`** | 2.5 MB of PNG; four files over 500 KB. | S | 3 | WebP/AVIF; total under 600 KB |
| Q73 | **`srcset` for the screenshots** | Displayed far smaller than native. | S | 2 | Present |
| Q74 | **Lazy-load below-fold images** | `loading="lazy"`. | S | 2 | Present |
| Q75 | **Compression check on Pages** | gzip vs brotli behaviour. | S | 2 | Documented |
| Q76 | **A perf budget in `shipped.md`** | Beside the tick numbers. | S | 3 | Present |
| Q77 | **Replace the brief's `[est]` frame numbers** | Engineering brief §7 is all estimates and says to replace them. | M | 3 | Measured numbers in `shipped.md` |
| Q78 | **Re-measure after every Q row** | Optimisation without measurement is churn. | S | 3 | Before/after per commit |
| Q79 | **A one-command perf report** | `npm run perf`. | M | 2 | Exists |
| Q80 | **Publish the first-ninety-seconds number** | `PURPOSE.md`'s own metric, finally quantified. | S | 3 | Time-to-first-perturbation measured and published |

# R · Decompose the monoliths (80)

*Current state, and the only theme that went backwards: `shared/tokens.css` exists with 51 custom
properties and is imported by **two** files. `vr/index.html` is now **2,448** lines with **1,835**
of inline CSS and **208** ids (was 2,332 / 1,755 / 197). `main.js` is **5,621** lines (was 4,811) —
it absorbed the new keymap, focus-trap, report and diagnostics wiring, which is correct behaviour
for a file with no seams. `render.js` is 3,085.*

**What "done" means:** the three files get smaller, measured, every week — and a HUD change touches
one file instead of three.

## R.1 Stop the growth, then extract the CSS (R1–R20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| R1 | **Extract the 1,835 inline CSS lines** | Do this before the next feature adds more. | M | 3 | External stylesheets; `<style>` block holds only critical CSS |
| R2 | **Point everything at `shared/tokens.css`** | It exists, has 51 props, and is imported twice. | S | 3 | All app and site CSS imports it |
| R3 | **Delete every raw hex outside the token file** | The measurable definition of "adopted". | M | 3 | Raw colour count outside tokens: zero |
| R4 | **Audit the 51 props for gaps** | Colour and space are likely covered; motion and elevation probably are not. | S | 3 | Gap list; props added |
| R5 | **Semantic naming pass** | `--surface-raised`, not `--panel2`. | M | 3 | Names describe role, not index |
| R6 | **A type scale** | Three good families, no scale. | M | 3 | Named steps; no ad-hoc `font-size` |
| R7 | **A space scale** | Named steps replacing inline px. | S | 3 | Adopted |
| R8 | **A motion scale** | Durations and easings as tokens. | S | 2 | Adopted |
| R9 | **An elevation scale** | Panels, docks, overlays, modals. | S | 2 | Adopted |
| R10 | **Split CSS by surface** | shell / dock / panels / overlays / local view / lab. | M | 3 | Each file under 300 lines |
| R11 | **Critical CSS stays inline** | Preserves Q's first-paint win. | M | 3 | Split measured |
| R12 | **A CSS size ratchet** | Total CSS must not grow without a reason. | S | 3 | CI check |
| R13 | **Lint the CSS** | Stylelint, narrow scope, expand by ratchet — the pattern that worked for JS. | M | 2 | `npm run lint:css` |
| R14 | **Ban raw colours in the linter** | Enforces R3 permanently. | S | 3 | Rule on |
| R15 | **Ban magic px in the linter** | Enforces R7. | S | 2 | Rule on, with an allowlist |
| R16 | **`prefers-reduced-motion` in the CSS** | `localview.js` honours it in JS; the CSS does not. | S | 3 | Media query present; transitions suppressed |
| R17 | **`prefers-contrast` support** | Free once tokens exist. | S | 2 | Present |
| R18 | **A light theme** | `color-scheme: dark` is hardcoded. | M | 2 | Palette swap works |
| R19 | **Dark and light both verified** | A theme nobody checks is a broken theme. | S | 2 | Screenshots in CI |
| R20 | **Publish the CSS numbers** | Inline lines, total lines, raw-colour count, token count. | S | 3 | Generated line |

## R.2 Components and panel lifecycle (R21–R40)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| R21 | **Stop addressing UI by 208 ids** | `getElementById` everywhere is exactly why three files are coupled. | L | 3 | Id count drops; measured weekly |
| R22 | **An id ratchet** | 208 must not become 230. | S | 3 | CI check |
| R23 | **A documented component convention** | Not a framework. A pattern for "panel", "chip", "dock button". | M | 3 | Written; three components follow it |
| R24 | **`decorateButton` is already the seed** | `god/icons.js` has a component factory in embryo. | S | 3 | Generalised |
| R25 | **A panel lifecycle** | mount / update / unmount. | M | 3 | Defined |
| R26 | **Adopt it in `climatePanel`** | 923 lines, already has `bind`/`refresh`/`chrome`. | M | 3 | Migrated |
| R27 | **Adopt it in `platesPanel`** | Same shape. | M | 3 | Migrated |
| R28 | **Adopt it in the layer panel** | Third instance proves the pattern. | M | 2 | Migrated |
| R29 | **Panels own their subtree** | No cross-panel id reaching. | M | 3 | Enforced by review and lint where possible |
| R30 | **Panels update only when visible** | Also a perf win (fidelity E68). | M | 3 | Hidden panels cost ~0, measured |
| R31 | **One refresh cadence table** | `updateHUD` hand-rolls 400/500/600 ms gates. | S | 3 | Declared per panel |
| R32 | **Lazy panel loading** | Enables Q28. | M | 3 | Panels are dynamic imports |
| R33 | **A UI state store** | Panel state currently lives on DOM classes and on `W`/`S`. | M | 3 | Single store |
| R34 | **DOM derives from state** | Reading `classList.contains('is-open')` as truth is fragile. | M | 3 | State authoritative |
| R35 | **This is where P62's UI state lands** | The two sections meet here. | S | 3 | UI state out of `W` |
| R36 | **One focus-management path** | `focusTrap.js` exists (47 lines); make every dialog use it. | S | 3 | All 3+ dialogs use it |
| R37 | **One overlay/dismiss path** | Escape handling is scattered across the keydown chain. | M | 3 | One dismiss stack |
| R38 | **One tooltip/tip path** | `tips.js` is 573 lines; `role="tooltip"` appears once. | M | 2 | One mechanism |
| R39 | **One icon source** | `iconSVG` exists; audit for one-off inline SVG. | S | 2 | Single source |
| R40 | **Component inventory doc** | For agents, and it prevents a fourth button style. | S | 3 | Generated |

## R.3 Decompose `main.js` (R41–R60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| R41 | **Extract the input layer** | 73 click + 13 change + 7 input + pointer/wheel/key handlers in one file. | M | 3 | `vr/input.js` owns DOM events |
| R42 | **Intents, not handlers** | "descend to cell", "arm tool", "spin globe" as named actions. | M | 3 | Intent layer exists |
| R43 | **Keyboard, touch, pointer and XR all emit intents** | The unlock for every T row. | M | 3 | Four sources, one path |
| R44 | **`keymap.js` maps keys to intents, not to code** | It is 163 lines and already a table — point it at intents. | S | 3 | Refactored |
| R45 | **Intents are testable without a DOM** | The reason to do this at all. | M | 3 | Intent tests in `test:fast` |
| R46 | **Intents are loggable** | A session becomes a replayable intent stream (fidelity D47). | M | 3 | Logged |
| R47 | **Extract the XR layer** | `xrSession` state threads through the file. | M | 2 | `vr/xr.js` |
| R48 | **Extract the boot sequence** | Pairs with Q43. | M | 3 | `vr/boot.js` |
| R49 | **Extract the HUD** | `updateHUD` and its cadence gates. | M | 3 | `vr/hud.js` |
| R50 | **Extract the dock** | Tabs, tools, shelf. | M | 3 | `vr/dock.js` |
| R51 | **Extract the camera** | Pan, zoom, follow, face-toward, scale rungs. | M | 3 | `vr/camera.js` |
| R52 | **Extract the diagnostics UI** | Where `diagnosticsText` finally gets a home (S41). | S | 3 | `vr/diagnostics.js` |
| R53 | **Extract the demo/pitch flags** | `?demo`, `?pitch`, `?playtest` paths. | M | 2 | Separate module |
| R54 | **`main.js` becomes wiring only** | Under 500 lines. | L | 3 | Reached |
| R55 | **68 imports is the symptom, not the disease** | Import count falls as a consequence, not a target. | S | 2 | Tracked |
| R56 | **Import-cycle check** | Extraction can easily introduce cycles. | S | 3 | Zero cycles, enforced |
| R57 | **Layering rule enforced** | `sim/` must not import DOM, GL, or `main.js`. | M | 3 | Lint rule |
| R58 | **Extract in behaviour-preserving steps** | Move, then change. Never both. | S | 3 | Each commit is one or the other |
| R59 | **Golden hashes guard each step** | Same net as P72. | S | 3 | Unchanged throughout |
| R60 | **A smoke test per extracted module** | Extraction without tests is a rewrite. | M | 3 | Each has one |

## R.4 `render.js`, the site, and visual regression (R61–R80)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| R61 | **A file-size ratchet on all three** | `main.js`, `render.js`, `index.html`. Stop the growth before reversing it. | S | 3 | CI fails on growth |
| R62 | **Publish the three numbers weekly** | Visible pressure is what reversed the provenance ratio. | S | 3 | Generated line in `shipped.md` |
| R63 | **Split `render.js` by pass** | Globe, entities, overlays, scatter, atmosphere. | L | 2 | Files under 800 lines |
| R64 | **Separate GL resource management from drawing** | The usual seam at this size. | M | 2 | Split |
| R65 | **Shader sources out of JS strings** | `gpgpu/shaders.js` is 311 lines of template literals. | M | 2 | Separate files, or generated (fidelity C4) |
| R66 | **Uniform setting from a declared table** | Hand-written uniform calls are where CPU/GPU drift starts. | M | 3 | Declared; feeds fidelity C3 |
| R67 | **Draw-call count reported** | Engineering brief §5 promises one call per entity family. | S | 2 | Reported in the HUD |
| R68 | **Partial vertex-colour upload** | Brief §5: static geometry, dynamic attributes, small `bufferSubData`. | M | 3 | Only changed regions uploaded |
| R69 | **Coalesce remeshes** | `geomDirty` should collapse multiple requests per frame. | M | 3 | One remesh per frame max |
| R70 | **The site and the app look like one product** | Three site pages now; one uses the tokens. | M | 3 | All use them; side-by-side review passes |
| R71 | **Extract the shared site chrome** | Header, footer, nav. | S | 2 | One partial |
| R72 | **`doc-responsive.css` finishes its job** | 30 lines, adopted unevenly. | S | 2 | All pages linked |
| R73 | **Visual regression harness** | `capture-site.mjs` already screenshots. | M | 2 | Diffs on key surfaces |
| R74 | **Screenshot the HUD, not just the site** | The app is where visual regressions hurt. | M | 2 | HUD in the harness |
| R75 | **Screenshot both themes** | Enables R19. | S | 2 | Both captured |
| R76 | **Screenshot at three widths** | Phone, tablet, desktop. | S | 2 | Captured |
| R77 | **Diffs are artefacts, not failures, at first** | A noisy visual gate gets disabled. | S | 3 | Artefact-only until stable |
| R78 | **Then gate on them** | Once stable. | S | 2 | Gated |
| R79 | **A design-system doc** | Generated token reference plus the component inventory. | M | 3 | Published |
| R80 | **`paintDisc` is the model to copy** | CPU-side, 48px, no GPU, already trusted. Visual testing here should be as cheap. | S | 2 | Approach documented |

# S · Failure: finish the conversion (80)

*Current state, and the best-executed theme after access: `vr/sim/report.js` (118 lines) has a
50-entry ring buffer, a `SESSION_ID`, boot deferral, `diagnosticsText`, and global handlers wired
from `main.js` via `setErrorSink`. `briefs/error-codes.md` defines **8** codes. What remains is
arithmetic: **33 bare catches still exist** (of ~49 at audit time), `report(` appears at **13**
call sites, and `diagnosticsText` has no UI to show it in.*

**What "done" means:** zero bare catches, a code at every report site, and a person who hits a bug
can hand you a paste that identifies it.

## S.1 The remaining 33 catches (S1–S20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| S1 | **List the 33 with file and line** | A bounded, finishable list — publish it. | S | 3 | List in `briefs/error-codes.md` |
| S2 | **Classify each: expected, report, or rethrow** | Three outcomes, no fourth. | M | 3 | Every one classified |
| S3 | **An `expected()` helper** | Makes a legitimate swallow explicit and greppable. | S | 3 | Exists and is used |
| S4 | **Expected swallows carry a reason string** | `expected('private mode')`. | S | 3 | All of them |
| S5 | **Convert the `main.js` 34** | Most of the total lives in one file. | M | 3 | Zero bare catches in `main.js` |
| S6 | **Convert `hooks.js` (8)** | First-run path; failures here cost the Vandal hook. | S | 3 | Converted |
| S7 | **Convert `teach.js` (4)** | Tour path. | S | 3 | Converted |
| S8 | **Convert `playtest.js` (4)** | Validation harness; silent failure loses data. | S | 3 | Converted |
| S9 | **Convert `god/shelf.js` (4)** | Storage path — a swallowed error here loses a world. | S | 3 | Converted |
| S10 | **Convert `god/genesis.js` (3)** | Seed decoding; a bad seed should say so. | S | 3 | Converted |
| S11 | **Convert `render.js` (3)** | GL failures are the least visible and most consequential. | S | 3 | Converted |
| S12 | **Convert `gpgpu/index.js` (2)** | Shader compile currently warns to a console nobody has open. | S | 3 | Reported and surfaced |
| S13 | **Convert `darkNaval.js` / `darkGate.js` (4)** | Newest code, least trusted. | S | 3 | Converted |
| S14 | **Convert `stampApply.js` / `tools.js` (4)** | Tool paths; the player caused this, so tell them. | S | 3 | Converted |
| S15 | **Never `return null` on an internal invariant** | It converts a bug into a wrong planet. | M | 3 | Audited; internal failures throw |
| S16 | **A lint rule against bare catch** | Enforces the finish line permanently. | S | 3 | `no-empty` on, catch-specific rule added |
| S17 | **A ratchet while converting** | 33 must only fall. | S | 3 | CI check |
| S18 | **Zero bare catches** | The finish line. | M | 3 | Reached and published |
| S19 | **Audit the 95 total catch lines** | Not all are bare; some may still be wrong. | M | 2 | Reviewed |
| S20 | **Publish the count** | The number this subsection is judged on. | S | 3 | Generated line |

## S.2 Codes that cover the surface (S21–S40)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| S21 | **A code per report site** | 8 codes against 13 call sites and 33 pending conversions. | M | 3 | Every site has a code |
| S22 | **Codes by cluster** | `ORR-GL-*`, `ORR-SAVE-*`, `ORR-SIM-*`, `ORR-NET-*`, `ORR-UI-*`. | S | 3 | Namespace defined |
| S23 | **Codes never reused** | A retired code stays retired. | S | 3 | Rule stated |
| S24 | **Generate the catalogue from the code table** | Hand-written catalogues rot. | M | 3 | `error-codes.md` generated |
| S25 | **Each code: meaning, cause, what to do** | The three things a person needs. | M | 3 | All entries complete |
| S26 | **Severity per code** | info / degraded / broken. Only `broken` interrupts. | S | 3 | Assigned |
| S27 | **Only `broken` interrupts the first ninety seconds** | Boot deferral already exists in `report.js` — extend the idea. | S | 3 | Enforced |
| S28 | **Boot-phase in the report** | Pairs with Q43/Q44. | S | 3 | Included |
| S29 | **Codes are greppable and agent-friendly** | A stable code is worth more than a message. | S | 3 | Stable and documented |
| S30 | **Codes in the test suite** | Assert *which* code, not just that something failed. | M | 3 | Tests assert codes |
| S31 | **A code for the CPU-climate fallback** | Currently silent; changes the numbers (fidelity C18). | S | 3 | Assigned and surfaced |
| S32 | **A code for the RGBA32F precision fallback** | A quiet downgrade. | S | 2 | Assigned |
| S33 | **A code for dropped ticks** | `noteDroppedTicks` records and nothing surfaces it. | S | 3 | Assigned |
| S34 | **A code for budget drift** | `assertBudgets` builds warnings that go nowhere. | S | 3 | Assigned |
| S35 | **Escalate large drift** | ±35% water is a broken run, not a warning. | S | 3 | Threshold escalates |
| S36 | **A code for NaN in a field** | Pairs with P48/P49. | S | 3 | Assigned |
| S37 | **A code for a failed chunk load** | Pairs with Q39. | S | 3 | Assigned |
| S38 | **A code for storage quota exceeded** | Losing a world is not a warning. | S | 3 | Assigned and escalated |
| S39 | **A code for save-version refusal** | Pairs with quality-400 I2. | S | 3 | Assigned |
| S40 | **Publish the code coverage** | Sites with codes / total sites. | S | 3 | Generated line |

## S.3 The diagnostics surface (S41–S60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| S41 | **A diagnostics panel** | `diagnosticsText` exists with nowhere to render. | M | 3 | Reachable from Lab |
| S42 | **Copy-diagnostics button** | Turns a bug report into a paste. | S | 3 | One click |
| S43 | **Include world id, seed, N, and rule** | `encodeWorldId` and `seedToWords` already exist. | S | 3 | Included |
| S44 | **Include the run id** | Fidelity D68 makes reports reproducible. | S | 3 | Included |
| S45 | **Include the code version** | Git SHA or build id from Q6. | S | 3 | Included |
| S46 | **Include which climate path is live** | CPU vs GPU changes the numbers. | S | 3 | Included and always visible |
| S47 | **Include the field/schema hashes** | P58 and the units hash. | S | 2 | Included |
| S48 | **Include dropped ticks and drift** | The two silent-degradation signals. | S | 3 | Included |
| S49 | **Include the last 10 errors with codes** | The ring buffer already holds 50. | S | 3 | Included |
| S50 | **Redact nothing, but include nothing personal** | There is no personal data here; state that. | S | 2 | Documented |
| S51 | **A visible degradation indicator** | Not buried in a panel — the HUD should say when the model is reduced. | M | 3 | Present |
| S52 | **Name what is reduced** | "GPU climate unavailable — CPU path", not a generic warning. | S | 3 | Specific strings |
| S53 | **Degradation is never silent** | The honesty rule for the instrument face. | S | 3 | Audited |
| S54 | **Errors in `runHeadless` output** | So CI sees them. | S | 3 | Present |
| S55 | **Tests assert zero unexpected reports** | quality-400 F22, using the code API. | S | 3 | Wired |
| S56 | **A `--strict-reports` test mode** | Any unexpected report fails. | S | 3 | Exists |
| S57 | **Report counts in the fidelity gate** | `npm run fidelity` should notice new noise. | S | 2 | Wired |
| S58 | **A log level, settable by URL** | `?log=debug` for a bug hunt. | S | 2 | Present |
| S59 | **Never log in a per-cell loop** | Rate limiting is a perf concern too (fidelity E65). | S | 2 | Audited |
| S60 | **One general rate limiter** | Replaces the per-site `% 24` spring-tide hack. | S | 2 | Exists and is used |

## S.4 Prove it fails correctly (S61–S80)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| S61 | **Fault injection: shader compile failure** | The most consequential silent path. | M | 3 | Injected; correct code reported; CPU fallback announced |
| S62 | **Fault injection: NaN in a field** | Pairs with P50's quarantine. | M | 3 | Injected; quarantined; reported |
| S63 | **Fault injection: corrupt save** | Truncated base64. | S | 3 | Clear error; world untouched |
| S64 | **Fault injection: unknown save version** | quality-400 I2. | S | 3 | Refused with a code |
| S65 | **Fault injection: storage quota** | The Gardener's worst day. | M | 3 | Reported; export offered |
| S66 | **Fault injection: failed chunk load** | Q39's path. | M | 3 | Retry offered |
| S67 | **Fault injection: missing data file** | A compiled table absent. | S | 3 | Named; degrades or hard-fails deliberately |
| S68 | **Fault injection: GL context loss** | Real on mobile and headsets, and currently unhandled. | M | 3 | Context restored or reported |
| S69 | **Fault injection: worker crash** | One `new Worker` with no error path. | M | 2 | Main-thread fallback, reported |
| S70 | **Fault injection: XR session denied** | There is a `'VR unavailable'` catch; make it explain. | S | 2 | Reason surfaced |
| S71 | **Fault injection: audio blocked** | Expected, not an error. | S | 1 | Classified as expected |
| S72 | **A fault-injection harness** | One place, one flag per fault. | M | 3 | `?fault=shader` etc. in debug builds |
| S73 | **Every fault has a test** | The harness makes this cheap. | M | 3 | All above covered |
| S74 | **Every fault has a documented recovery** | In the code catalogue. | S | 3 | Documented |
| S75 | **Degradation order is declared** | Pairs with fidelity E22. | M | 3 | Declared and asserted |
| S76 | **Never degrade a conserved quantity** | Dropping `hydroTick` breaks the water budget. | S | 3 | Marked non-droppable |
| S77 | **Cernunnos can diagnose** | `briefs/cernunnos.md` promises "diagnosis when life goes quiet". | M | 2 | Three faults have a voice line |
| S78 | **Diagnosis names a field the player could see** | The difference between a diagnosis and an excuse. | M | 3 | Enforced by review |
| S79 | **A "this world is broken" honest state** | Better than a beautiful wrong planet. | M | 3 | Detectable and shown |
| S80 | **Publish the failure scorecard** | Bare catches, coded sites, injected faults, documented recoveries. | S | 3 | One generated table |

# T · Everyone can reach the planet (80)

*Current state, and the theme that went furthest: `<html lang>` is present, the canvas is
`tabindex="0" role="application"` with an `aria-label` that actually teaches the controls ("Arrow
keys spin, WASD moves cursor, plus minus zoom, letter keys arm tools, Enter applies or descends"),
`vr/sim/keymap.js` (163 lines) is a real keymap table, `vr/sim/focusTrap.js` (47) exists, and
`briefs/accessibility.md` publishes Works / Partial / Not yet plus a Non-XR descent section. What is
open is everything visual and everything touch: contrast is unaudited, there are no colour-blind
palettes, touch targets are unchecked, text scaling is untested, and no screen-reader session has
been logged in `PLAYTESTS.md`.*

**What "done" means:** the descent loop — the product's whole thesis — works with a keyboard, on a
phone, at 200% text, in high contrast, and with a screen reader, and each of those has a logged
session proving it.

## T.1 Finish the keyboard (T1–T20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| T1 | **Verify every key in the aria-label works** | The label promises spin, cursor, zoom, tools, apply, descend. | S | 3 | Each verified by test |
| T2 | **A keyboard-only descent session** | The full loop: observe, perturb, descend, read, return. | M | 3 | Logged in `PLAYTESTS.md` |
| T3 | **Keymap points at intents** | Pairs with R42/R44. | M | 3 | Refactored |
| T4 | **Cursor movement crosses cube-sphere seams** | The neighbour table handles it; the cursor must too. | M | 3 | Tested at all 24 seams and 8 corners |
| T5 | **Cursor is visible and theme-aware** | Keyboard interaction needs a spatial anchor. | M | 3 | Rendered; visible in both themes |
| T6 | **Cursor position announced** | Latitude, biome, elevation. | M | 3 | `aria-live` on move, politely |
| T7 | **Coarse and fine cursor movement** | Shift for one cell, plain for a jump. | S | 2 | Both work |
| T8 | **Jump to features** | Next coastline, next city, next herd. | M | 2 | Works |
| T9 | **Keyboard tool arming is discoverable** | Letter keys are in the label; they need an on-screen map. | S | 3 | Shortcuts overlay lists them |
| T10 | **A shortcuts overlay** | `keymapHelpLines` already exists and is rendered in two places. | S | 2 | One canonical overlay |
| T11 | **Rebindable keys** | Left-handed and one-handed users. | M | 2 | Persisted |
| T12 | **Full tab-order pass** | Panel order should match visual order. | M | 3 | Keyboard-only pass logged |
| T13 | **Every dialog uses `focusTrap`** | It exists; adoption is the question. | S | 3 | All dialogs |
| T14 | **Focus restored on close** | The half everyone forgets. | S | 3 | Verified |
| T15 | **One dismiss stack** | Escape handling is scattered through the keydown chain. | M | 3 | Pairs with R37 |
| T16 | **Skip link to the planet** | Past the dock, straight to the thing. | S | 2 | Present |
| T17 | **No keyboard trap anywhere** | Including the canvas — you must be able to tab out. | S | 3 | Verified |
| T18 | **Visible focus ring everywhere** | Token-driven after R2. | S | 3 | `:focus-visible` on every control |
| T19 | **Keyboard works in XR-adjacent flat mode** | The headset browser is also a browser. | S | 2 | Verified |
| T20 | **Keyboard coverage published** | Which intents have a key and which do not. | S | 3 | Table in `accessibility.md` |

## T.2 Touch and phone (T21–T40)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| T21 | **Touch target audit** | ~97 buttons sized for mouse and headset. | M | 3 | All interactive targets ≥44 px on touch |
| T22 | **Fix the failures** | Whatever T21 finds. | M | 3 | Audit clean |
| T23 | **Spacing between adjacent targets** | Dock buttons especially. | S | 3 | Minimum gap enforced by token |
| T24 | **One-pointer operation everywhere** | No interaction needing two simultaneous touches. | M | 3 | Audited |
| T25 | **Every gesture has a button** | Pinch, drag, twist. | M | 3 | Audited |
| T26 | **Touch descent** | `isPhone()` and a phone dock already exist. | M | 3 | Pinch-and-step on touch |
| T27 | **Touch descent is comfortable** | The vection risk applies to a phone held close too. | M | 3 | Logged session |
| T28 | **Momentum and inertia feel right** | Spin should have weight, not snap. | M | 2 | Tuned; reduced-motion respected |
| T29 | **No hover-only affordances** | 4 `pointerenter` / 5 `pointerleave` handlers exist. | M | 3 | Every hover has a tap equivalent |
| T30 | **Tooltips reachable by tap and by focus** | Pairs with R38. | M | 3 | Works |
| T31 | **Safe-area insets honoured** | `--safe-t/r/b/l` tokens already exist. | S | 2 | Verified on a notched phone |
| T32 | **Landscape and portrait both work** | The globe is square; the dock is not. | M | 3 | Both verified |
| T33 | **Phone HUD density pass** | The dock competes with the planet on a small screen. | M | 3 | Reviewed |
| T34 | **Legible default type on a phone** | The demo gets shown on phones. | M | 3 | Pass logged |
| T35 | **Scroll never fights the globe** | Canvas gestures vs page scroll. | S | 3 | `touch-action` correct |
| T36 | **Pull-to-refresh does not destroy a session** | Losing a world to a swipe is unacceptable. | S | 3 | Prevented or autosaved |
| T37 | **Test on a real low-end phone** | Not a desktop emulator. | M | 3 | Numbers in `cold-start.md` |
| T38 | **Battery and thermal sanity** | A sim loop can cook a phone. | M | 2 | Frame rate capped sensibly on battery |
| T39 | **A phone playtest** | The Vandal hook, on a phone, with no instructions. | M | 3 | Row in `PLAYTESTS.md` |
| T40 | **Publish the touch scorecard** | In `accessibility.md`. | S | 3 | Present |

## T.3 Seeing it (T41–T60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| T41 | **Contrast audit** | Every text/background pair. `--dim` and `--faint` on panels are the likely failures. | S | 3 | All pairs measured |
| T42 | **Fix the failures** | AA minimum on all body text. | M | 3 | Clean |
| T43 | **Non-text contrast too** | Focus rings, borders, chart lines, the keyboard cursor. | M | 3 | 3:1 minimum |
| T44 | **Contrast checked in CI** | Token pairs are computable. | M | 2 | Automated |
| T45 | **A high-contrast theme** | Token swap after R2. | M | 3 | Present |
| T46 | **`prefers-contrast` honoured** | Automatic where the OS asks. | S | 2 | Wired |
| T47 | **Colour-blind-safe overlay palettes** | Climate and biome ramps especially. | M | 3 | Verified for deuteranopia, protanopia, tritanopia |
| T48 | **Colour is never the only channel** | `legendEntries` exists to help. | M | 3 | Pattern or label with every colour code |
| T49 | **Overlay legends always available** | Not hover-only. | S | 3 | Verified |
| T50 | **A colour-blind mode** | Selectable, persisted. | M | 2 | Present |
| T51 | **Text scales to 200%** | Fixed px type breaks layouts. | M | 3 | Layout survives |
| T52 | **Respect OS font size** | Not just browser zoom. | M | 2 | Verified |
| T53 | **No text in images** | The screenshots in `site/` carry labels. | S | 2 | Alt text carries the content |
| T54 | **Alt text on every image** | `site/img` screenshots have some; audit all. | S | 3 | Complete |
| T55 | **Reduced motion in CSS** | Pairs with R16; JS already honours it in 10 places. | S | 3 | Present |
| T56 | **Reduced motion in the descent** | The transition is PD §6's named vection hazard. | M | 3 | Discrete path under reduced motion |
| T57 | **A comfort settings panel** | Vignette, duration, snap vs continuous. | M | 3 | Present, persisted |
| T58 | **Reduced audio as a real setting** | `__orreryReducedAudio` is referenced in code. | S | 2 | Exposed |
| T59 | **Captions for audio events** | `playEvent` carries information. | M | 2 | Text equivalent |
| T60 | **Flash and strobe safety** | Lightning, detonations, the Dark layer's FX. | M | 3 | Audited against known thresholds |

## T.4 The descent, for everyone (T61–T80)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| T61 | **Non-XR descent is the documented default** | `accessibility.md` has the section; finish the implementation. | L | 3 | Works and feels intentional on a flat screen |
| T62 | **Mechanic B as the permanent accessibility path** | PD §6 mandates it; state it as shipped policy. | S | 3 | Stated and implemented |
| T63 | **Mechanic A stays the default where comfortable** | Not a downgrade for everyone. | S | 3 | Both paths exist |
| T64 | **Switchable mid-session** | Discomfort arrives during, not before. | M | 3 | Switch works without losing the world |
| T65 | **The descent is announced** | A screen reader user should know they descended. | M | 3 | `aria-live` on tier change |
| T66 | **Each tier has a text description** | PD §6's ladder: orbital, regional, local, surface. | M | 3 | Each tier describes what is readable at it |
| T67 | **"Every number is a place" needs a text path** | Pillar P2 is hostile to screen readers unless the place can be read aloud. | M | 3 | Cell inspection is fully readable |
| T68 | **`inspectCell` output is screen-reader-first** | It is the instrument; make it text-primary. | M | 3 | Verified |
| T69 | **A screen-reader session, logged** | With an actual screen reader, once, end to end. | M | 3 | Row in `PLAYTESTS.md` |
| T70 | **Fix what that session finds** | The findings are the backlog. | M | 3 | Addressed |
| T71 | **A second session after the fixes** | One pass proves nothing. | M | 2 | Logged |
| T72 | **Announce moments, not everything** | 5 `aria-live` regions exist; politeness matters. | S | 3 | Levels chosen deliberately |
| T73 | **The chronicle is the accessible history** | It is already text. Make it a first-class read. | S | 3 | Reachable by keyboard, announced |
| T74 | **The finale artefact is accessible** | It is the thing people share. | S | 2 | Verified |
| T75 | **Onboarding works without motion or sound** | The tour and the Vandal hook. | M | 3 | Verified |
| T76 | **Onboarding works with a keyboard only** | Doors, lessons, skip. | M | 3 | Verified |
| T77 | **An accessibility regression test** | Automated axe-style pass on the built page. | M | 3 | In CI |
| T78 | **Keep `accessibility.md` honest** | Works / Partial / Not yet, updated as rows land. | S | 3 | Reviewed each time a T row lands |
| T79 | **Name what will never work** | Some of a spatial god-game will not be accessible. Say which. | S | 3 | Stated plainly |
| T80 | **Publish the reach scorecard** | Keyboard, touch, contrast, colour, motion, screen reader — one table. | S | 3 | Generated |

---

## Promotion protocol

1. **`NEXT.md` remains the only queue.** Promote 1–3 rows.
2. **The First 20 is the gate**, and it is deliberately front-loaded with *stop-the-growth* rows
   (R61, R1, P14, S17, R22) because four of these five themes are currently getting worse while the
   tooling around them gets better.
3. **A row is done when the number moves**, not when the tool that measures it exists. That is the
   specific failure this register was written to correct.
4. **Delete rows when they land**, and note them in [`shipped.md`](shipped.md).
5. **Golden hashes guard every structural change** — P, R and Q all touch code paths that the
   fidelity register's corpus is the only defence for.

## The three registers

| Register | Themes | Rows | Gate command |
|---|---|---|---|
| [`earth-fidelity-500.md`](earth-fidelity-500.md) | 7–11 · provenance, calibration, coupling, determinism, tick speed | 500 | `npm run fidelity --prefix vr` |
| [`quality-400.md`](quality-400.md) | 12–20 · tests, CI, `W`, saves, failure, payload, UI, access, agents, orphans | 400 | `npm run verify` |
| **this file** | 16–20 re-read · enforcement, build, decomposition, conversion, reach | 400 | *needs one — see below* |

**This register's missing gate.** `fidelity` and `verify` both exist and work. The equivalent here
would chain: field-census ratchet (P14), ownership coverage (P39), file-size ratchet (R61), id
ratchet (R22), CSS size ratchet (R12), bare-catch ratchet (S17), code coverage (S40), payload budget
(Q13/Q14) and the contrast check (T44). **Build it incrementally as rows land** — that is what
worked for `fidelity`, and building it last is how it never gets built.

## Dependency spine

```
Q1,Q2   (build, dev preserved) ─┬─> Q21-Q34 (split by gate) ──> Q61-Q70 (measure on device)
                                └─> R1,R2  (CSS out, tokens in) ──> R18,T41-T50 (themes, contrast, colour)
R61,R22,R12,P14,S17  (four ratchets)  ── stop the growth before reversing it
P1  (classify 744) ──> P21 (enforce owner) ──> P41 (seal W) ──> P61-P64 (four kinds of state)
                                                                    └─> R33-R35 (UI store)
R41,R42 (input layer + intents) ──> T3,T4-T8 (keyboard) ──> T26 (touch) ──> T61-T64 (descent for all)
S1-S18  (finish the 33) ──> S21-S40 (codes) ──> S41 (panel) ──> S61-S80 (prove it)
```

**Read that as:** the four ratchets are the cheapest rows in the file and the most important, because
three of these five themes measurably regressed during the last pass. `R42`'s intent layer is the
single highest-leverage row — it is the prerequisite for twenty T rows, and without it keyboard,
touch and XR each mean another copy of every handler in a file that is already 5,621 lines.
