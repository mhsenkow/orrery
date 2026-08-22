# ORRERY — Earth fidelity & tick speed: 500 steps

**Status:** register, not a queue.
**Scope:** five named defects only — provenance (A), calibration (B), coupling (C), determinism (D), speed (E).
**Date:** 2026-08-21

---

## How this doc relates to `NEXT.md`

[`NEXT.md`](../NEXT.md) stays the **only work queue**, and [`RETIRED.md`](RETIRED.md) correctly killed breadth-first wishlists. This is deliberately a different animal:

| Retired backlogs were | This is |
|---|---|
| Feature wishes ("add ore bodies") | Defect repairs against five audited faults |
| No acceptance criteria | Every row has a machine-checkable **Done when** |
| 20 parallel lists, no ordering | One list, one ratchet, one gate table |
| A program | A quarry — you mine 1–3 rows into `NEXT.md` at a time |

**Rule of use:** nothing here is "next" until it is promoted into `NEXT.md`. If a row cannot be
expressed as a failing check that later passes, delete the row.

**Why it earns its place against PURPOSE:** each section ends in something the player *feels* —
numbers you can trust (A), worlds that stay plausible when you visit them (B), systems that
visibly answer each other (C), a tape you can rewind and watch diverge (D), and a planet that
keeps running while you hold it (E). Fidelity that never reaches the first ninety seconds is
just bookkeeping; every section below names its felt payoff.

---

## First 25 — the gate

**Status: landed 2026-08-21** (see [`shipped.md`](shipped.md)). The tooling below is what the remaining ~475 rows wait on. Rows that shipped were removed from the A–E tables where they had a dedicated entry; use git history for the original wording.

| # | Row | Status |
|---|---|---|
| 1–5 | A1 A2 A4 A5 A21 | Done — `scripts/provenance.mjs`, `vr/sim/units.js` |
| 6–9 | B1 B2 B6 B41 | Done — `calibrateWorld`, baselines, `calibrate-all`, Earth freeze |
| 10–12 | C1 C2 C81 | Done — parity harness, waterInventory (shared formula) |
| 13–16 | D1 D21 D22 D76 | Done — determinism.md, save v9, golden.json |
| 17–20 | E1 E2 E21 E22 | Done — `scheduler.js` timing + degradation order |
| 21–25 | B86 C26 D46 E46 A81 | Done — fail msgs, craterCounts wire, Run object, `_rate` pattern, generated limits inc |

**Still open after the gate:** playtest n≥6, GPU float-FB runner, runtime alloc budget, Ares summer pressure recovery, cryosphere inland tighten.

**Second wave shipped:** A8–A10 hotspots, B21–B25 Earth bands, A88 Lab limits, orbit picture cues, named garden delta, `npm run fidelity`.

---

# A · Provenance, units, and numbers you can defend (100)

*Today: 248 `measured` / 97 `fitted` / 51 `invented` tags against ~8,800 float literals in `vr/sim/`.
`model-limits.md` says untagged means invented, so ~95% of the model's constants are formally untrusted.
The machinery to fix this already half-exists — `param-coverage.json`, `param-overrides.json`,
`reconcile-params.mjs`, `UNIT_MAP` — it just stops at world parameters and never reaches the physics.*

**Felt payoff:** a Lab line that says *"this world: 62% measured, 21% fitted, 17% invented"* and a
tap-through to the citation. Trust is a feature; it is what separates the instrument face from a toy.

## A.1 Scanner and tag mechanics (A1–A20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| A1 | **`scripts/provenance.mjs`** | Walk `vr/sim/**`, count numeric literals and adjacent provenance tags, print per-file tagged/untagged. | M | 3 | `node scripts/provenance.mjs` prints a table and a total ratio; today's baseline is committed |
| A2 | **One machine-readable tag grammar** | `/* measured: 5772 K — Sun Teff, IAU 2015 */` — kind, value, source, in one parseable comment. | S | 3 | Scanner parses kind + source for 100% of existing 396 tags |
| A3 | **File-level tags** | `@provenance invented` header for wholly-cosmetic modules (`sim/god/*`, `icons.js`) so UI code leaves the denominator. | S | 2 | Scanner honours the header; `sim/god/*` drops out of the physics count |
| A4 | **Structural-literal whitelist** | Exclude 0, 1, −1, 0.5, 2, small ints used as indices/bounds/bitmasks, and array lengths. | M | 3 | Baseline denominator falls from ~8,800 to the physics constants only; the number is committed |
| A5 | **Ratchet, not target** | Scanner fails only when the untagged *share* rises above the committed baseline. | S | 3 | CI-ready exit code; a PR adding an untagged constant fails |
| A6 | **`vr/data/provenance.json`** | Emit the scoreboard as data, mirroring `param-coverage.json`'s shape. | S | 2 | File written by the scanner and committed |
| A7 | **Untagged-density ranking** | Print modules sorted by untagged constants per 100 lines — the tagging worklist. | S | 2 | Top-10 list appears in scanner output |
| A8 | **Tag `rulesets.js` first** | These are the per-world dials the player actually turns; they carry the most trust weight. | M | 3 | `rulesets.js` reaches 100% tagged |
| A9 | **Tag `atmo.js`** | Greenhouse coefficients, lapse rate, insolation fit — the numbers `calibrateEarth` leans on. | M | 3 | `atmo.js` 100% tagged; every `fitted` names what it was fitted to |
| A10 | **Tag `hydro.js`** | `SATREF`, `RAIN_GAIN`, `SOIL_PER_VAPOUR` (7.5), `LAKE_PER_VAPOUR` (2.2) are already documented in prose — promote to tags. | S | 2 | `hydro.js` 100% tagged |
| A11 | **Tag `carbon.js`** | Reservoir transfer rates and the `/1e5` normalisation. | M | 2 | `carbon.js` 100% tagged |
| A12 | **Tag `redox.js` guilds** | Each guild's ΔG proxy and threshold gets `measured` (from a real redox couple) or `invented`. | M | 3 | Every `GUILDS` entry carries a tag |
| A13 | **Tag `evolve.js` TRAITS** | 11 trait axes with mutation rates — almost certainly all `invented`; say so. | S | 2 | `TRAITS` block tagged |
| A14 | **Tag `swe.js`** | Substep count, free-slip coefficient, flux limiter — numerics, not physics; new tag `numeric`. | S | 2 | `numeric` added to the vocabulary and used |
| A15 | **Add `numeric` as a fourth kind** | Solver stability constants are neither measured nor invented-for-fun; conflating them hides the real invented count. | S | 3 | `model-limits.md` table has four rows; scanner counts four kinds |
| A16 | **Add `derived` as a fifth kind** | Constants computed from other tagged constants inherit the weakest parent. | S | 2 | Scanner resolves `derived` to its parent kind |
| A17 | **Tag `tides.js`** | Lunar recession rate and amplitude scaling — `dayLengthDays` already cites 3.8 cm/yr in prose. | S | 1 | Tagged |
| A18 | **Tag `star.js` / `illum.js`** | Teff, photon fraction, 5772 K white balance — all genuinely measured; easy wins that lift the ratio honestly. | S | 2 | Tagged |
| A19 | **Tag `substrates.js` compile output** | Tags must survive the JSON → JS compile step, or the 24 materials read as invented. | M | 2 | `substrates.json` rows carry `source`; the compiler emits it as a tag |
| A20 | **Tag drift test** | A tagged value that changes without its tag changing is a silent lie. | M | 2 | Test hashes (value, tag) pairs; a value edit without a tag edit fails |

## A.2 Units — one registry, 733 fields (A21–A40)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| A21 | **Promote `UNIT_MAP` out of `carbon.js`** | Six entries live inside the carbon module and are imported by `instruments.js`. Units are not a carbon concern. | S | 3 | `vr/sim/units.js` owns it; `carbon.js` imports |
| A22 | **Register every field the HUD prints** | Any `W.*` that reaches a user-visible string needs sim range, SI meaning, and tag. | L | 3 | Test: every field referenced by a `format*` function has a registry row |
| A23 | **Register every conserved field** | `h`, `moist`, `vapour`, `ice`, `iceLand`, `iceSea`, `carbon.*`, `gases.*`. | M | 3 | Registry covers all fields `assertBudgets` touches |
| A24 | **Field-name census** | 733 distinct `W.*` names is the real number; classify them: field / scalar / cache / flag / dead. | M | 3 | `vr/data/fields.json` census committed; dead names listed |
| A25 | **Delete the dead names** | Anything in the census with one writer and no readers. | M | 2 | Census reports zero orphans |
| A26 | **`_`-prefix convention enforced** | `W._foo` means derived/cache — it should never be saved or asserted. | S | 2 | Test: `serializeRun` writes no `_`-prefixed key (audit current violations first) |
| A27 | **Temperature: pick one scale** | `temp` is a 0–1.6 field with `(T−0.5)*80+15` as the Earth mapping — a fitted hack that breaks off-Earth. | L | 3 | Either kelvin internally, or the mapping is per-world and registry-declared |
| A28 | **State the temperature mapping's domain** | It is Earth-fitted; on Venus and Titan it is meaningless but still printed. | S | 3 | Off-Earth worlds print kelvin from their own mapping or print nothing |
| A29 | **Water: one inventory, one unit** | `hydro.js` weights vapour ×50 and depth ×0.5 for its own inventory; `assert.js` keeps a different proxy. | M | 3 | One `waterInventory(W)` both call; the ×50 is a documented unit conversion or gone |
| A30 | **Carbon: relative → GtC or say never** | model-limits says "relative units, not GtC". Either scale to GtC with a stated Earth anchor, or make the UI stop implying mass. | M | 2 | Instruments print the registry's SI string verbatim |
| A31 | **Life density: define carrying capacity** | `life` is "0–1 density" against an undefined denominator. | M | 2 | Registry states the denominator; `calibrateEarth`'s `meanLife` band is justified from it |
| A32 | **Pressure: separate `press` from `pSeen`** | model-limits already flags that SWE `press` and optical `pSeen` are different quantities with similar names. | S | 3 | Renamed so no reader can confuse them; registry has both |
| A33 | **Insolation units** | `solar`, `_solarMod`, `S` — relative-to-Earth, W/m², or TOA daily mean? All three appear. | M | 2 | One unit; registry row; conversions explicit at the boundary |
| A34 | **Time: `dtYr` vs `dtBio` vs `bioGen`** | Three clocks, one of which (`bioGen`) advances at `dtBio/25` with 25 untagged. | S | 2 | All three in registry with the 25 tagged |
| A35 | **Area weights in the registry** | `AREA` is mean-1 normalised, which is a choice with consequences for every rate. | S | 3 | Registry states the normalisation; test asserts `sum(AREA) == NC` |
| A36 | **Rates must not scale with N** | `carbonTick` already does `invNC` for this reason; audit every other tick. | L | 3 | Test: `meanTemp`/`meanLife` after 40 ticks agree within tolerance across N=32/64/96 |
| A37 | **Unit assertions at module boundaries** | Debug-build check that a value entering a tick is in its registry range. | M | 2 | `W.debugAssert === 'throw'` catches an out-of-range handoff in a seeded test |
| A38 | **Print units everywhere or nowhere** | HUD currently mixes bare numbers and unit-suffixed ones. | M | 2 | Every numeric HUD string carries a unit or an explicit "relative" marker |
| A39 | **Registry drives the instruments panel** | `instruments.js` already loops `UNIT_MAP`; make that the only source. | S | 2 | No hardcoded unit strings left in `instruments.js` |
| A40 | **Registry in the save** | A save written under one unit convention and loaded under another is silent corruption. | S | 3 | `serializeRun` stores a units-schema hash; load warns on mismatch |

## A.3 Extract magic numbers into named, citable tables (A41–A60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| A41 | **Move Earth reference values to one file** | Mean temp, land fraction, O₂, CO₂, precip — currently duplicated between `calibrate.mjs` `TOL`, tests, and rulesets. | M | 3 | `vr/data/earth-reference.json` with citations; `TOL` derives from it |
| A42 | **Cite each Earth reference** | Land fraction 29.2%, mean surface temp 288 K, O₂ 20.95% — each with a source line. | S | 3 | Every row in `earth-reference.json` has `source` |
| A43 | **Tolerance bands justified, not guessed** | `meanLife: [0.04, 0.45]` is 11× wide and its own comment admits it passed a dying planet. | M | 3 | Every band states why it is that wide; none exceeds 3× without a reason |
| A44 | **Greenhouse coefficients to data** | Log-approximation coefficients per gas belong beside the gases, not inline. | M | 2 | `vr/data/greenhouse.json` compiled like `substrates.json` |
| A45 | **Albedo table to data** | Ice, cloud, ocean, desert, canopy albedos are physically measured and scattered across modules. | M | 2 | `vr/data/albedo.json`; one reader |
| A46 | **Lapse rate per world, from gravity** | `lapse: 0.45 * gravity` is in `gpgpu/index.js` as a literal; the CPU path has its own. | S | 3 | One `lapseRate(rule)`; both paths call it |
| A47 | **Cloud coefficients to data** | `cloudGh`/`cloudAlb` are duplicated between `atmoTick` and `gpgpuClimateTick` — the comment says a third term must be added twice. | S | 3 | One exported pair; the comment's warning becomes impossible |
| A48 | **Freeze/melt thresholds per substrate** | `rule.freeze ?? 0.32` appears in at least three places with three defaults. | S | 2 | One source; substrate-aware |
| A49 | **Redox tower ΔG values to data** | Guild ordering should fall out of energetics, not authored order. | L | 3 | `vr/data/redox-tower.json`; guild order derived and asserted |
| A50 | **Stellar luminosity curve to data** | `faintYoungSun`'s 0.4 amplitude and 0.8 exponent are a sketch standing in for evolution tracks. | M | 2 | Tagged `fitted` with the curve it approximates; exponent cited |
| A51 | **ICS chart is already data — treat it so** | `ICS_CHART` is 30 hardcoded rows in `time.js`; it is a published standard. | S | 1 | Moved to `vr/data/ics.json` with the ICS version cited |
| A52 | **`adaptiveTickYears` ladder to data** | Eight hardcoded breakpoints from 1e7 to 10 years; this is a legibility choice, tag it. | S | 2 | Ladder in data, tagged `invented for legibility`, with the reasoning |
| A53 | **Tidal-heat normalisation cited** | Io ≈ 2 W/m² is measured; the normalisation to other bodies is not. | S | 2 | Both halves tagged separately |
| A54 | **Clathrate window cited** | ~272 K at 25 bar is a real phase boundary; cite it and state the fit's validity range. | S | 2 | Tagged with range |
| A55 | **Ice VI floor cited** | `highPressureIceFloor` is "one number for origin chemistry" — say which number and from where. | S | 1 | Tagged |
| A56 | **Stream-power exponents** | Erosion's m and n are the most-studied constants in geomorphology; use published values. | M | 2 | Tagged `measured` with the study; test asserts the concavity index falls in the observed range |
| A57 | **Isostasy densities** | Crust/mantle densities are measured; the compensation depth is a choice. | S | 2 | Both tagged; densities from a cited source |
| A58 | **Ocean two-scale depth ramp** | Purely a look choice, currently indistinguishable from physics. | S | 2 | Tagged `invented`, marked as look in the registry |
| A59 | **Sprite-kind palette is look, not science** | `KIND_RGB` and `lifeColour` thresholds should never enter the provenance denominator. | S | 1 | File-level `@provenance look`; excluded from the physics ratio |
| A60 | **One place for "playability clamps"** | Insolation "soft-clamps for playability" per model-limits; these are the most important invented numbers in the build. | M | 3 | `vr/sim/playability.js` collects every clamp; each tagged and listed in Lab |

## A.4 Data provenance — extend what already works (A61–A80)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| A61 | **Run `reconcile-params.mjs` in the test suite** | It exists, prints disagreements, and nothing calls it. | S | 3 | Wired into `npm test` as a report (not a hard fail) |
| A62 | **Fail on *new* param disagreements** | Ratchet, same pattern as A5. | S | 2 | Committed disagreement baseline; new ones fail |
| A63 | **Populate `param-overrides.json`** | It ships with `"overrides": {}` and a comment — the mechanism is untested. | S | 2 | At least one real override with citation; test covers the apply path |
| A64 | **Field-level provenance in `param-coverage.json`** | It already records `seed`/archive per field — extend to `measured`/`estimated`/`invented`. | M | 3 | Coverage file carries the three-way tag per field |
| A65 | **Show archive-hit status per world in Lab** | `archiveHit: false` for Earth is fine; for an exoplanet it is a trust signal. | S | 2 | World chip shows source: archive / seed / invented |
| A66 | **Snapshot staleness warning** | `exoarchive-snapshot.json` has a `generated` date and nothing checks its age. | S | 1 | Lab notes snapshot age; >12 months prints a note |
| A67 | **Citation string surfaced, not just stored** | The NASA Exoplanet Archive citation is in the JSON and never shown. | S | 2 | Visible in Lab and in exported papers |
| A68 | **Per-world invented-inventory flag** | model-limits: worlds beyond the snow line get "triple invented inventory". Mark those worlds. | S | 3 | Such worlds carry a visible `invented inventory` chip |
| A69 | **Distinguish measured / modelled / assumed for `teq`** | Equilibrium temperature is almost always derived, not observed. | S | 2 | `teq` tagged `derived` from `S` and albedo assumption |
| A70 | **Albedo assumptions are load-bearing** | Every `teq` hides an assumed Bond albedo. | S | 2 | The assumed albedo is stored and shown beside `teq` |
| A71 | **Mass–radius provenance** | `exophysics.js` derives composition vectors from mass and radius; both carry error bars in the archive and neither is propagated. | M | 3 | Uncertainties stored; composition shown as a range |
| A72 | **Propagate uncertainty into the axes** | Seven `_worldAxes` numbers from uncertain inputs, presented as exact. | L | 3 | Axes carry a confidence; low-confidence axes render differently |
| A73 | **`kinds.json` histogram as a provenance test** | It already pins `temperateIo == 0`; extend the idea to invented-inventory counts. | S | 2 | Histogram asserts invented share per category |
| A74 | **Landform palette provenance** | model-limits says exo palettes "are marked invented" — make the mark reach the UI. | S | 2 | Invented landforms visually distinguishable |
| A75 | **Epoch rows cite their reconstruction** | `epochs.json` rows have `cite`; LGM/Cretaceous are noted as not proxy-calibrated. | S | 2 | Uncalibrated epochs carry a visible caveat chip |
| A76 | **Substrate optical properties** | Albedo/thermal inertia/strength per material — measured for common rocks, invented for exotics. | M | 2 | Per-field tags in `substrates.json` |
| A77 | **Column recipes cite their sections** | Europa/Moon/Titan/Jupiter are "pinned" — to what? | S | 2 | Each pinned column names its source model |
| A78 | **Technosphere numbers cited** | 20 TW and ~0.01% absorbed insolation are measured; fusion/orbital are tagged invented already. | S | 1 | Measured half cited |
| A79 | **Star catalogue Teff provenance** | `star.js` derives sky tint from Teff; Teff itself comes from the archive with error. | S | 1 | Teff source and error stored |
| A80 | **`data.mjs` prints a provenance line** | It already prints a data-to-code ratio; add measured/fitted/invented share. | S | 2 | One extra line in the `data.mjs` scoreboard |

## A.5 Make provenance visible and self-maintaining (A81–A100)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| A81 | **Generate `model-limits.md`'s provenance section** | The doc states a rule the code does not enforce; invert it. | M | 3 | Section is generated from `provenance.json`; hand-editing it fails the build |
| A82 | **Provenance chip in Lab** | One line per world: measured / fitted / invented share of the constants actually used. | M | 3 | Chip present; changes when you switch worlds |
| A83 | **Per-reading provenance on hover** | Hovering a HUD number shows its unit, tag, and source. | M | 3 | Every registry-backed reading has a hover |
| A84 | **"Why is this number this?" affordance** | Tinkerer archetype writes the wiki; give them the citation trail in-app. | M | 2 | Click-through from any reading to its constant's source |
| A85 | **Invented numbers look different** | Same typographic treatment for a measured and an invented value is the dishonesty. | S | 3 | Invented readings render with a distinct marker |
| A86 | **Paper export carries provenance** | The exported paper is the artefact that leaves the app. | M | 3 | Export includes a constants appendix with tags and citations |
| A87 | **Provenance in the save** | A run's numbers should be reconstructible later. | S | 2 | `serializeRun` stores the provenance hash |
| A88 | **Limits summary on first open** | Already row 4 of `NEXT.md`'s "After" list — this is its data source. | S | 3 | One tap from Lab to a generated one-screen limits summary |
| A89 | **Fail the build on an untagged *new* physics file** | New modules default to 0% tagged and drag the ratio silently. | S | 2 | New file with >5 physics literals and no tags fails the ratchet |
| A90 | **Tagging as a review checklist item** | Cheap process fix beside the tooling. | S | 1 | Checklist line in the contributing notes |
| A91 | **Provenance trend over time** | A committed history of the ratio prevents slow erosion. | S | 1 | `provenance.json` appends a dated row |
| A92 | **Highlight the top-10 most load-bearing invented constants** | Not all invented numbers matter equally; rank by sensitivity (see B71). | M | 3 | Ranked list generated from the sensitivity sweep |
| A93 | **Retire tags that are wrong** | A `measured` tag on a value that has since been tuned is worse than no tag. | M | 2 | A20's drift test catches these; audit pass clears existing ones |
| A94 | **Distinguish Earth-fitted from universally-fitted** | A constant fitted to Earth is invented everywhere else. | M | 3 | New tag qualifier `fitted@earth`; off-Earth worlds count it as invented |
| A95 | **Per-world provenance, not global** | The same codebase is 70% measured on Earth and 20% on an invented exoplanet. | M | 3 | Chip computes per active world, using A94's qualifier |
| A96 | **Provenance affects the biosignature claim** | `rankByBiosignature` on a world of invented constants is a strong claim on weak ground. | S | 3 | Ranking displays the world's provenance share alongside |
| A97 | **Cernunnos can say "I'm guessing here"** | The voice layer is the natural place to admit uncertainty. | M | 2 | Voice references invented constants when explaining a low-provenance world |
| A98 | **Finale artefact states provenance** | The ending is the most-shared output. | S | 2 | `finaleArtefact` includes the share |
| A99 | **Provenance regression in CI** | A5's ratchet has to run somewhere automatic (see D96). | S | 3 | Runs on every push |
| A100 | **Publish the number** | README's honesty is its distinguishing feature; put the ratio in it. | S | 2 | README badge or line, generated |

---

# B · Calibration: Earth hard, then everywhere (100)

*Today: `calibrateEarth` runs one ruleset (`terra`), one seed, 8 ticks, 10 scalars, hardcoded bands.
`biosphereHolds` is the good pattern — it exists because an 8-tick check passed a planet that was
dying, and its own doc comment says so. Nothing asserts Mars, Venus, Titan, Europa, a giant, or a
locked exoplanet stays plausible, and those are precisely where the axes machinery invents most.*

**Felt payoff:** you visit Mars in the catalogue and it looks like Mars — not because someone
eyeballed it once, but because a committed baseline fails the day it stops.

## B.1 Generalise the harness (B1–B20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| B1 | **`calibrateWorld(ruleId, seed, ticks, tolerances)`** | `calibrateEarth` hardcodes all four. Same body, parameterised. | M | 3 | `calibrateEarth` becomes a one-line call to it |
| B2 | **`vr/data/baselines/<world>.json`** | Committed expectations per world: scalar bands, plus a `source` per band. | M | 3 | Earth, Mars, Venus, Titan, Europa files exist |
| B3 | **Bands carry provenance too** | A band from a measured observation is not the same as one from "looks right". | S | 3 | Every band has a tag (links A43) |
| B4 | **Report, never throw** | Existing harness convention; keep it so one bad world does not hide the rest. | S | 2 | All worlds run; exit code reflects the aggregate |
| B5 | **Two-phase check: early and late** | The `biosphereHolds` lesson generalised — assert at tick 8 *and* at tick 750. | M | 3 | Every baseline has an `early` and a `late` block |
| B6 | **`scripts/calibrate-all.mjs`** | Runs the whole ladder, prints a matrix, one exit code. | M | 3 | `npm run calibrate:all` works |
| B7 | **Runs at N=32 by default** | `biosphereHolds` already recommends this; make it the harness default so the suite stays usable. | S | 3 | Full ladder under 60 s at N=32 |
| B8 | **Per-world tick budget** | Titan does not need 750 ticks; Earth deep-time needs more. | S | 2 | `ticks` in each baseline file |
| B9 | **Multi-seed** | One seed per world hides seed-specific luck. | M | 3 | Each baseline lists ≥3 seeds; bands must hold for all |
| B10 | **Seed-spread reporting** | If a band only holds for one of three seeds, that is the finding. | S | 3 | Report prints per-seed values and the spread |
| B11 | **Trend assertions, not just bands** | "Not falling" is often the real claim (as in `biosphereHolds`'s ratio ≥ 0.72). | M | 3 | Baselines support `trend: {field, minRatio}` |
| B12 | **NaN/Infinity gate on every world** | `assertNoNaN` covers `life`, `temp`, `moist`, `macroDens` only. | S | 3 | Extended to every registry-declared field; run per world |
| B13 | **Field-range gate** | A field outside its registry range is a failure even if the scalars look fine. | M | 3 | Uses A37's ranges |
| B14 | **Structural gates from `surfaceStats`** | `faceDiscontinuity`, `coastlineStaircase`, `drainageDensity`, `oceanRampSat` already measure real faults. | M | 3 | Every baseline includes structural bands |
| B15 | **Picture gate from `pictureDisc`** | `paintDisc` + `countEdgeRuns` catches banding and seams without a GPU. | M | 2 | Per-world picture bands committed |
| B16 | **Baseline update is a deliberate act** | Auto-updating baselines defeats the purpose. | S | 3 | `--update-baselines` flag; the diff appears in review |
| B17 | **Diff output on failure** | Print expected band, actual, and delta — not a boolean. | S | 3 | Failure output is copy-pasteable into a bug |
| B18 | **Golden hash per world** | `hashFields` exists in `headless.mjs`; extend to the ladder (links D76). | S | 3 | Each world has a committed hash at a fixed tick count |
| B19 | **Separate "plausible" from "reproducible"** | A world can be bit-stable and physically absurd, or vice versa. | S | 3 | Two independent exit codes |
| B20 | **Calibration report as an artefact** | Markdown output that can be linked from `model-limits.md`. | S | 2 | `briefs/calibration.md` generated |

## B.2 Earth, harder (B21–B45)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| B21 | **Tighten `meanLife`** | `[0.04, 0.45]` is admitted-wide. Derive from A31's carrying-capacity definition. | M | 3 | Band ≤3× wide with a stated basis |
| B22 | **Tighten `CO2ppm`** | `[200, 800]` spans glacial to Eocene. Modern Earth is ~420. | S | 3 | Band ≤±25% of the reference |
| B23 | **Tighten `iceFrac`** | `[0, 0.30]` passes an ice-free Earth. | S | 3 | Lower bound non-zero and justified |
| B24 | **Tighten `landFrac`** | `[0.22, 0.38]` against a measured 0.292. | S | 2 | Band ±15% |
| B25 | **Assert equator–pole gradient magnitude** | `tropPole` band `[0.02, 0.55]` is 27× wide. | M | 3 | Band derived from ~45 K observed, mapped through A27 |
| B26 | **Assert the ITCZ exists and is where it should be** | A zonal precipitation maximum near the thermal equator is the single most recognisable Earth pattern. | M | 3 | Test finds a precip max within a stated latitude band |
| B27 | **Assert subtropical dry belts** | Precip minima near ±25°. | M | 3 | Two minima found in the right bands |
| B28 | **Assert the midlatitude storm track** | A variance maximum, not a mean maximum. | M | 2 | Zonal variance peaks at midlatitudes |
| B29 | **Assert seasonality amplitude** | Northern-hemisphere land should swing more than southern ocean. | M | 3 | Hemispheric asymmetry in the annual range |
| B30 | **Assert diurnal range by substrate** | Desert > ocean, by thermal inertia. | S | 2 | Range ordering holds |
| B31 | **Assert monsoon onset** | model-limits says the monsoon exists and skips on locked worlds; nothing asserts it fires on Earth. | M | 3 | Seasonal precip reversal detected over a land mass |
| B32 | **Assert ENSO variance, not events** | `_ensoIndex` logs events; the claim is variance in a band. | M | 2 | Index variance within a committed band over 500 ticks |
| B33 | **Assert ocean gyre sense** | Rotating SWE should give anticyclonic subtropical gyres. | M | 3 | Sign of curl correct in both hemispheres |
| B34 | **Assert western boundary intensification** | Gulf-Stream-like asymmetry falls out of the beta effect; it is a strong check on `swe.js`. | M | 3 | Zonal asymmetry in current speed detected |
| B35 | **Assert river networks drain to the sea** | `drainageDensity` measures density, not connectivity. | M | 3 | ≥95% of land cells route to an ocean cell or a named endorheic basin |
| B36 | **Assert Hack's law / Horton ratios** | Published scaling laws for river networks — a real, cheap fidelity test. | M | 2 | Exponents within observed range |
| B37 | **Assert hypsometry** | Earth's bimodal elevation distribution (continental shelf + abyssal plain) is the signature of two crust types. | M | 3 | Histogram is bimodal with peaks in the right bands |
| B38 | **Assert age–depth for ocean floor** | Backlog item 6 is marked Done; nothing asserts the √age relation holds. | M | 2 | Regression slope within tolerance |
| B39 | **Assert O₂ rises from burial, not photosynthesis** | This is model-limits' headline mechanism claim. | M | 3 | Test: zero burial ⇒ O₂ does not accumulate |
| B40 | **Assert the GOE is a transition, not a ramp** | Contingent gates should produce a step. | M | 3 | Deep-time run shows a step in O₂ with a stated duration |
| B41 | **Freeze modern Earth as the reference row** | Everything else is measured against it; it must not drift. | S | 3 | Golden hash + full band set committed and referenced by name |
| B42 | **Deep-time Earth baselines per epoch** | `epochs.json` has rows; none are calibration-gated. | L | 3 | Snowball, Cambrian, Cretaceous, LGM each have bands |
| B43 | **Snowball must be enterable and exitable** | A one-way ice-albedo runaway is a bug; the CO₂ escape is the science. | M | 3 | Test enters and exits Snowball via CO₂ accumulation |
| B44 | **Faint young Sun must not freeze the Archean** | The classic paradox; the model should resolve it the way Earth did (CO₂/CH₄). | M | 3 | Archean run stays above freezing with elevated CO₂ |
| B45 | **Assert the Boring Billion is boring** | `adaptiveTickYears` gives it 2 Myr/tick; the claim is stasis, and stasis is testable. | M | 2 | Low variance in O₂ and diversity across the interval |

## B.3 The Solar System (B46–B70)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| B46 | **Mars baseline** | Surface pressure ~6 mbar, polar caps present, mid-latitudes bare, no liquid water. | M | 3 | Baseline file; the `seedVolatileIce` fix is regression-locked |
| B47 | **Mars CO₂ cycle** | model-limits caps winter at 28% of the column; assert the seasonal swing. | M | 3 | Pressure oscillates with the expected amplitude |
| B48 | **Mars must never grow a biosphere** | Unless deliberately seeded. | S | 3 | `meanLife` stays ~0 over 750 ticks |
| B49 | **Venus baseline** | Runaway greenhouse, no liquid water, near-isothermal surface. | M | 3 | Baseline; equator–pole gradient near zero |
| B50 | **Venus slow retrograde rotation** | Should suppress the geostrophic structure entirely. | M | 2 | Wind field lacks midlatitude jets |
| B51 | **Venus-ocean epoch is marked first-cut** | model-limits admits it; the baseline should be loose and labelled, not absent. | S | 2 | Wide bands with an explicit `first-cut` flag |
| B52 | **Titan baseline** | 1.5 bar N₂, methane solvent, lakes at the poles, ice VI in the column. | M | 3 | Baseline file; `methaneSolvent` path exercised |
| B53 | **Titan hydrology uses the methane row** | `cycleMaterial` picks the row; assert it is not water. | S | 3 | Test asserts the active cycle material |
| B54 | **Titan's liquid window** | `liquidWindow` is null below triple pressure — assert it is non-null on Titan and null on Mars. | S | 3 | Both assertions pass |
| B55 | **Europa baseline** | Ice lid, subsurface ocean, no atmosphere, vent biosphere sketch only. | M | 3 | Baseline; `iceShellTick` exercised |
| B56 | **Europa stays on rock, not ice VI** | model-limits: moons below 0.8 R⊕ do. | S | 2 | Column asserted |
| B57 | **Enceladus brightness** | Already asserted from fields per model-limits — move into the baseline system. | S | 1 | Migrated |
| B58 | **Iapetus leading/trailing ratio** | Same. | S | 1 | Migrated |
| B59 | **Io baseline** | ~2 W/m² tidal heat, sulfur cover, no water, heat-pipe interior. | M | 2 | Baseline; `temperateIo` stays 0 (already in `kinds.json`) |
| B60 | **Moon baseline** | Airless, regolith, no cycles, tidal heat far below Io's. | S | 2 | Baseline |
| B61 | **Mercury 3:2 resonance** | Already a test in `test-worldParams`; promote to a baseline row. | S | 1 | Migrated |
| B62 | **Pluto baseline** | Thin N₂ that thins at aphelion (model-limits names this). | M | 2 | Baseline asserts the aphelion thinning |
| B63 | **Jupiter baseline** | `noSurface`, banded zonal wind from `rhinesJetCount`, Galileo 22 bar floor, T ∝ P^0.32. | M | 3 | Baseline; every land subsystem asserted skipped |
| B64 | **Saturn baseline** | Same class plus the ring annulus; NH₃/NH₄SH/H₂O decks. | S | 2 | Baseline |
| B65 | **Ice-giant deck order** | CH₄ deck appears on Uranus/Neptune and not on Jupiter. | S | 2 | Asserted |
| B66 | **Giants must skip technosphere and biology** | model-limits says giants skip; assert rather than assume. | S | 3 | Test asserts no `techno`, no phylogeny on giants |
| B67 | **Non-hydrostatic bodies** | Phobos, Arrokoth, 67P are flagged `not round` and drawn as cube-spheres. | S | 2 | Baseline asserts the flag and that no climate runs |
| B68 | **Every named Solar System body gets a smoke baseline** | Even if it is only "generates, no NaN, correct kind, correct cycles skipped". | M | 3 | All named bodies in the ladder |
| B69 | **Kind stability** | `cachePlanetKind` caches once; a kind that changes mid-run is a bug. | S | 3 | Test asserts kind constant across 500 ticks |
| B70 | **Solar System worlds must not move when Earth changes** | The most common regression shape in this codebase. | S | 3 | Ladder hashes committed; an Earth-only change touching them fails |

## B.4 Exoplanets, sensitivity, and the scoreboard (B71–B100)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| B71 | **Sensitivity sweep** | Perturb each tagged constant ±10%, measure movement in the Earth baseline scalars. | L | 3 | `scripts/sensitivity.mjs` ranks constants by influence |
| B72 | **Rank invented constants by influence** | Feeds A92 — this is how you know which invented numbers matter. | S | 3 | Ranked list committed |
| B73 | **Tighten bands where sensitivity is low** | A wide band on an insensitive constant is free rigour. | M | 2 | Bands narrowed where the sweep permits |
| B74 | **Flag knife-edges** | A constant where ±10% flips the climate state is a design problem, not a tuning one. | M | 3 | Knife-edges listed in `model-limits.md` |
| B75 | **Locked-world baseline** | Substellar-only insolation, no ITCZ/Walker/monsoon, gravity-capped relief. | M | 3 | Baseline for a tidally-locked exoplanet |
| B76 | **Locked-world terminator structure** | The one pattern a locked world must show. | M | 3 | Temperature ring detected at the terminator |
| B77 | **M-dwarf baseline** | Redder sky, different photon fraction, higher XUV dose. | M | 2 | Baseline; `illum.js` shift asserted |
| B78 | **Puffball / iron-rich baselines** | `exophysics.js` already tests these shapes; give them world baselines. | M | 2 | Baselines exist |
| B79 | **Free-floater baseline** | Null orbit, no insolation, internal heat only. | M | 2 | Baseline; no NaN from a zero-insolation path |
| B80 | **Brown dwarf boundary** | KELT-1 is already a classification test; assert its world behaves as a self-luminous body. | S | 1 | Baseline |
| B81 | **Snow-line worlds** | Triple invented inventory (A68) — the baseline must be labelled as such. | S | 2 | Bands wide and flagged |
| B82 | **Habitability vs inhabitance separation** | model-limits' claim: a sterile-but-habitable world is valid. | M | 3 | Test constructs one and asserts both scalars |
| B83 | **Assert no world is accidentally Earth** | The failure mode of a shared codebase. | M | 3 | Pairwise distance between world baselines exceeds a floor |
| B84 | **Assert no world is accidentally uninhabitable** | The opposite failure — the Mars ice bug's class. | M | 3 | Every world labelled habitable produces non-zero liquid area |
| B85 | **Resolution invariance per world** | Links A36; a world whose climate depends on N is not calibrated. | M | 3 | Bands hold at N=32/64/96 |
| B86 | **Failure messages name the world** | A ladder failure that says "meanTemp out of band" is useless. | S | 3 | Message includes world, seed, N, tick, field, value, band, source |
| B87 | **Calibration matrix in the report** | Worlds × checks, one glance. | S | 2 | Matrix in `briefs/calibration.md` |
| B88 | **Per-world provenance beside per-world calibration** | Links A95 — a passing band on invented constants means less. | S | 3 | Report shows both columns |
| B89 | **Long-run stability sweep** | 5,000 ticks on the five headline worlds; the `biosphereHolds` lesson at scale. | M | 3 | No world trends to a degenerate state |
| B90 | **Degenerate-state detector** | Frozen solid, boiled dry, sterile, zero-relief — name them and detect them. | M | 3 | Detector runs in every long sweep |
| B91 | **Assert recovery from perturbation** | Drop an impactor, run 500 ticks, assert the climate returns inside a band. | M | 3 | Recovery test per world |
| B92 | **Assert perturbation *is* visible** | Engineering brief M2 gate: a perturbation produces a visible spatial change within 60 s of sim time. | M | 3 | Automated version of the M2 gate, per world |
| B93 | **Tie the ladder to the probes** | `thrive-probe.mjs` and `dark-probe.mjs` are the same idea for other layers. | S | 2 | One runner covers calibration + probes |
| B94 | **Calibration under the demo ruleset** | `?demo=1` and `thrive` are what visitors actually see and are outside the ladder. | M | 3 | `thrive` has a baseline |
| B95 | **Calibration under the gated Dark layer** | `?dark=1` changes climate via soot and shade. | M | 2 | Dark-on baseline separate from Dark-off |
| B96 | **Assert Dark-off is bit-identical to pre-Dark** | The gate's whole promise. | S | 3 | Hash with `dark` disabled matches the committed pre-Dark hash |
| B97 | **Epoch picker baselines** | Every selectable epoch should at least generate and stay finite. | M | 2 | All epochs in the smoke ladder |
| B98 | **Baseline ownership note** | Who decides a band is wrong vs the code is wrong. | S | 1 | One paragraph in the calibration doc |
| B99 | **Ladder runtime budget** | If it exceeds ~2 minutes nobody runs it (the current `test.mjs` lesson). | S | 3 | Fast ladder ≤60 s; full sweep behind a flag |
| B100 | **Calibration state in the README** | The honest headline: how many worlds are actually calibrated. | S | 2 | Generated line in README |

---

# C · Coupling: make the systems answer each other (100)

*Today `simTick` calls ~42 subsystems in a fixed order, and the code comments are an honest record of
what that costs: `atmoTick`'s work was "silently skipped" on the GPU path until someone noticed; the
`cloudGh`/`cloudAlb` pair is duplicated with a comment warning that a third term must be added twice;
model-limits names four couplings that simply are not wired (GPGPU ignores live pressure, GPGPU ignores
cover, `craterCounts` ignores `stampCraters`, bio/redox never leave the CPU).*

**Felt payoff:** this is the section that makes the planet interesting. A world where the systems
answer each other produces stories nobody authored — a monsoon that fails because a mountain rose, a
lineage that survives because a current shifted. That is the Tinkerer's whole reason to stay.

## C.1 CPU ↔ GPU parity (C1–C25)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| C1 | **Parity harness** | Same seed, same ticks, once with `_gpgpuOff`, once without; diff every field. | M | 3 | `scripts/parity.mjs` prints max/mean per-field divergence |
| C2 | **Parity as a gate** | The `cloudGh` comment describes a bug that already shipped once. | M | 3 | Divergence above tolerance fails the build |
| C3 | **Single source for shared coefficients** | `cloudGh`, `cloudAlb`, `lapse`, `freeze`, `rateT/M/A` are each written twice. | M | 3 | One exported object; the shader reads it as uniforms only |
| C4 | **Shader constants generated, not typed** | Hand-keeping GLSL in sync with JS is the failure mode. | M | 3 | `shaders.js` interpolates from the shared constants module |
| C5 | **Name the GPU's scope precisely** | The comment says "the GPU owns the thermal relaxation and nothing else" — encode that. | S | 3 | A test asserts no other field differs between paths |
| C6 | **Wire live pressure into GPGPU climate** | model-limits: "Live pressure feeds CPU greenhouse; GPGPU climate does not read it." | M | 3 | `_atmScale` reaches the shader; Mars winter shows in both paths |
| C7 | **Wire cover into GPGPU climate** | model-limits: "GPGPU climate does not read cover." Frost albedo is a first-order term. | M | 3 | `W.grain`/cover albedo in the shader; parity holds |
| C8 | **Wire substrate albedo/thermal inertia into GPGPU** | Non-Earth diurnal swing currently only exists on the CPU. | M | 3 | Both paths agree on Mars diurnal range |
| C9 | **Same insolation function both sides** | model-limits says `geometricInsolation` is already shared — assert it. | S | 2 | Test asserts identical insolation arrays |
| C10 | **Float precision policy** | RGBA16F vs RGBA32F vs CPU float64 will never be bit-identical; state the tolerance. | S | 3 | Tolerance documented per field and used by C1 |
| C11 | **Per-field tolerance, not one number** | Temperature and cloud fraction do not deserve the same band. | S | 2 | Tolerance table committed |
| C12 | **Detect systematic bias, not just magnitude** | A uniform 0.3 K offset is worse than scattered noise of the same size. | M | 3 | Harness reports mean signed bias per field |
| C13 | **Parity across N** | The atlas gutter logic is N-dependent; parity must hold at 32/64/96. | M | 3 | Harness sweeps N |
| C14 | **Parity across the seam** | Guttered `(N+2)` tiles exist to stop cross-face blending; assert the gutter is right. | M | 3 | `faceDiscontinuity` on GPU-produced fields within band |
| C15 | **RGBA32F fallback tested** | Fallback paths that are never exercised are never correct. | M | 2 | Forced-fallback run in the suite |
| C16 | **CPU fallback tested** | Same for `_gpgpuOff`. | S | 3 | Already possible; make it a standing test |
| C17 | **Fail loudly on shader compile failure** | `initGpgpu` catches and `console.warn`s, then silently runs CPU. | S | 3 | Failure surfaces in the HUD, not just the console |
| C18 | **Report which path is live** | The player (and the bug report) needs to know. | S | 3 | HUD shows CPU/GPU climate path |
| C19 | **Multi-slot parity** | `gpgpu/index.js` supports multiple world slots for the orrery table; nothing tests two slots agree. | M | 2 | Two-slot test with identical seeds |
| C20 | **Slot isolation** | One world's tick must not perturb another's atlas. | M | 3 | Test asserts slot independence |
| C21 | **Move `cloudsTick` to the GPU or state why not** | It runs on the CPU on both paths, and it is per-cell work with no neighbour dependency. | M | 2 | Either ported with parity, or a comment names the blocker |
| C22 | **Move `advectScalar` to the GPU** | Two full-field advections per tick on the CPU while the GPU sits idle. | M | 3 | Ported; parity holds; timing improvement measured |
| C23 | **Decide bio/redox's home** | model-limits: "Bio/redox stay CPU." That is a defensible choice; write down why. | S | 2 | One paragraph, or a port plan |
| C24 | **One readback per tick, not many** | GPU→CPU sync is the expensive part; batch it. | M | 3 | Readback count per tick measured and minimised |
| C25 | **Async readback where possible** | A one-tick-stale field is often fine for instruments. | M | 2 | Instruments read a fenced buffer; tick does not stall |

## C.2 Named-but-unwired couplings (C26–C50)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| C26 | **`craterCounts` → `stampCraters`** | model-limits names this explicitly as not wired. Crater density should follow the impact record. | M | 3 | Airless-world crater counts match the flux history |
| C27 | **Bombardment flux → crater record** | `bombardmentFlux` exists with two modes and does not write craters. | M | 3 | Hadean run leaves a crater population; the two modes differ visibly |
| C28 | **Impacts → atmosphere → ice, as one event** | Backlog item 17 claims all four; assert the chain fires in order. | M | 3 | Test: impact ⇒ dust ⇒ cooling ⇒ ice growth, with lags |
| C29 | **Clathrate dissociation → climate feedback** | It writes CH₄ and a chronicle line; does the CH₄ warm anything? | M | 3 | Dissociation raises greenhouse measurably |
| C30 | **Clathrate stability → seafloor temperature** | Currently one window, not a map. | M | 2 | Stability evaluated per cell from local T/P |
| C31 | **Isostasy ← live column** | model-limits: "isostasy-from-column is not stored". The stack exists per cell. | L | 3 | Elevation responds to column density changes |
| C32 | **Layer ages in the stack** | Named as missing; without ages, erosion cannot expose anything datable. | L | 2 | Per-layer age stored; a core reads it |
| C33 | **Aeolian landforms from a grain-size field** | model-limits: currently a stamp, not a field. | L | 2 | Dune orientation follows the wind field |
| C34 | **Wind field → dune orientation, visibly** | The payoff of C33; this is the kind of detail the Tinkerer notices. | M | 2 | Rotating the planet's winds re-orients dunes over time |
| C35 | **Ocean colour ← sediment plume ← river discharge** | The chain exists in pieces; assert it end to end. | M | 2 | Raising a mountain changes coastal water colour downstream |
| C36 | **Weathering ← relief and precip → CO₂ drawdown** | The silicate weathering thermostat is *the* long-term Earth feedback. | L | 3 | Mountain-building measurably draws down CO₂ |
| C37 | **The thermostat must be able to fail** | `thermostatTick` exists; a thermostat that always wins is not science. | M | 3 | Test finds a forcing rate that outruns weathering |
| C38 | **Ice → sea level → coastline → land area → albedo** | A closed loop; assert every link. | M | 3 | Glaciation lowers sea level and exposes shelf, which changes albedo |
| C39 | **Sea level from ice mass, not a scalar** | If `seaLevel` is set rather than derived, the loop above is decorative. | M | 3 | `seaLevel` derived from the ice inventory |
| C40 | **Ocean heat transport → gradient** | Ocean currents should flatten the equator–pole gradient; assert the effect size. | M | 3 | Disabling `oceanTick` measurably steepens `tropPole` |
| C41 | **Day length → circulation** | `dayLengthDays` exists; a 6-hour Archean day should give a very different jet structure. | M | 3 | Archean run shows more, narrower jets |
| C42 | **Obliquity → seasonality → ice** | Milankovitch pacing from real orbital terms rather than a sine. | L | 3 | Ice volume shows the expected spectral peaks |
| C43 | **Eccentricity → insolation → precession interplay** | `_solarMod` scales with eccentricity already; make the three terms interact. | M | 3 | Spectral test finds 100/41/23 kyr power |
| C44 | **Volcanism → CO₂ and aerosols on different timescales** | Warming over Myr, cooling over years — the same event, two signs. | M | 3 | Large eruption cools then warms |
| C45 | **LIP events → extinction pathway** | `lipTick` exists; is it wired to `extinctionTick`? | M | 3 | A LIP raises extinction probability through climate, not directly |
| C46 | **Extinction must go through the environment** | Direct extinction rolls are the cheap version and read as arbitrary. | M | 3 | Every extinction traces to a field the player could have seen |
| C47 | **O₂ → fire → burial → O₂** | The classic self-limiting loop; `fireTick` and burial both exist. | M | 3 | Raising O₂ increases burn area which caps O₂ |
| C48 | **O₂ → body size ceiling** | A famous, legible coupling (Carboniferous insects). | M | 2 | Trait ceiling responds to `gases.O₂` |
| C49 | **Ozone → UV → surface habitability** | model-limits mentions an ozone rim term in colour only. | M | 2 | UV dose field gates shallow-water life |
| C50 | **Technosphere waste heat → climate, above 1%** | Already specified in model-limits; assert the threshold behaves. | S | 2 | Crossing 1% produces measurable warming |

## C.3 New interrelations worth having (C51–C80)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| C51 | **Nutrient limitation** | Phosphorus from weathering is the ultimate cap on marine productivity. | L | 3 | NPP responds to a P inventory; a continent's erosion feeds the ocean |
| C52 | **Iron fertilisation from dust** | Dust already exists (impacts, war soot); route it to ocean productivity. | M | 3 | A dust event produces a plankton bloom downwind |
| C53 | **Upwelling → fisheries → herds → settlements** | Four layers, one causal chain, all already present. | M | 3 | Coastal upwelling zones carry visibly more life and more settlements |
| C54 | **Ocean anoxia from warming + nutrients** | Produces the euxinic states that drive real extinctions. | M | 3 | Warming plus high P yields an anoxic basin with an H₂S signature |
| C55 | **H₂S from anoxia → guild advantage** | The redox tower already has the guilds; give them their world. | M | 3 | Anoxic basins favour sulfur guilds measurably |
| C56 | **Methane from wetlands** | Wetland area is derivable from `moist` and slope. | M | 2 | CH₄ tracks wetland area |
| C57 | **Permafrost carbon store** | A step-change feedback with an obvious visual. | M | 3 | Thaw releases carbon and accelerates warming |
| C58 | **Snow-albedo feedback with a hysteresis loop** | The ice line should not retrace its path. | M | 3 | Cooling and warming through the same CO₂ give different ice extents |
| C59 | **Vegetation-albedo feedback (boreal darkening)** | Forest is darker than tundra; this moves the treeline. | M | 2 | Treeline advance self-accelerates |
| C60 | **Transpiration → continental rainfall recycling** | Explains why deforestation dries an interior. | M | 3 | Removing canopy reduces downwind precip |
| C61 | **Orographic precipitation and rain shadows** | Already implied by relief + wind; make it explicit and visible. | M | 3 | Raising a range produces a desert on its lee |
| C62 | **Rain shadow → biome → species range → migration** | The full descent-loop payoff of C61. | M | 3 | A player-raised mountain redirects a herd within one session |
| C63 | **Soil as a state variable** | Depth, fertility, and age; erosion removes it and time builds it. | L | 3 | Soil field exists and gates land productivity |
| C64 | **Soil loss from agriculture** | The technosphere's most legible harm. | M | 2 | Sustained farming thins soil and lowers yield |
| C65 | **Salinity → density → circulation** | model-limits diagnoses salt on top of SWE rather than in it. | L | 3 | Freshwater pulse measurably slows the overturning proxy |
| C66 | **Meltwater pulse → circulation shutdown** | A dramatic, well-documented event with a legible signature. | M | 3 | Ice-sheet collapse cools the downstream basin |
| C67 | **Sea ice → gas exchange barrier** | Couples ice to carbon rather than only to albedo. | M | 2 | Ice cover throttles ocean CO₂ uptake |
| C68 | **Carbonate compensation depth** | Where shells dissolve; the ocean's carbon buffer with a visible depth. | M | 2 | CCD tracked and shifts with pH |
| C69 | **Ocean acidification from CO₂** | The modern story, and it gates reef guilds. | M | 3 | pH falls with CO₂; reef life responds |
| C70 | **Stratification from warming** | Reduces nutrient supply — a warming-lowers-productivity path. | M | 2 | Warm runs show reduced upwelling |
| C71 | **Dust from deserts, not from nowhere** | Ties the aerosol budget to land state. | M | 2 | Desert area sets background dust |
| C72 | **Lightning ignition depends on fuel and moisture** | `lightningTick` already runs before `fireTick` for this reason; close the loop on fuel. | M | 2 | Ignition probability reads fuel load, not just strikes |
| C73 | **Fire → nutrient pulse → regrowth** | Makes fire a cycle rather than a deletion. | M | 3 | Post-fire cells show elevated productivity |
| C74 | **Pathogens tied to density and climate** | `pathogenTick` exists; couple it to real drivers. | M | 2 | Outbreak probability scales with density and temperature |
| C75 | **Migration corridors from terrain and climate, not distance** | Herds already chase and migrate; make the map decide the route. | M | 3 | Corridors follow valleys and coasts |
| C76 | **Refugia during extinction** | Where lineages survive is the most interesting question in a mass extinction. | M | 3 | Survivors cluster in identifiable refugia |
| C77 | **Island biogeography** | Area–species relation falls out of the existing components. | M | 2 | Species count scales with island area at the observed exponent |
| C78 | **Endemism and vicariance from rifting** | Backlog claims rifting works; couple it to speciation. | M | 3 | Continental breakup produces sister lineages either side |
| C79 | **Latitudinal diversity gradient** | The strongest pattern in ecology; a single powerful check. | M | 3 | Diversity peaks at the tropics without being told to |
| C80 | **Body-size / temperature rules** | Bergmann's rule as an emergent check on trait dynamics. | M | 2 | Cold-region lineages trend larger |

## C.4 Close the budgets (C81–C100)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| C81 | **Real water budget** | `assertBudgets` warns at ±35% drift on a proxy that is not `hydroTick`'s own inventory. | L | 3 | One inventory, one owner, drift band ≤2% |
| C82 | **Real carbon budget** | ±200% is the current warning threshold. | L | 3 | Drift band ≤5% with named sources and sinks |
| C83 | **Name every source and sink** | A budget that does not close needs a suspect list. | M | 3 | Report attributes drift to a subsystem |
| C84 | **Per-subsystem budget deltas** | Which tick lost the water. | M | 3 | Each conserved field logs per-subsystem delta in debug builds |
| C85 | **Budgets every tick in debug, every 32 in release** | Current cadence is `_tickIndex % 32` after a real bug where `W.year | 0` wrapped past int32. | S | 2 | Debug builds check every tick; the wrap bug has a regression test |
| C86 | **Oxygen budget** | O₂ is the headline claim and has no inventory check. | M | 3 | O₂ sources/sinks close within band |
| C87 | **Nitrogen budget** | Needed once C51's nutrient work lands. | M | 2 | Closes |
| C88 | **Energy budget (TOA)** | Absorbed minus emitted should approach zero at equilibrium. | M | 3 | TOA imbalance reported and near zero on pinned Earth |
| C89 | **Energy budget catches greenhouse errors** | The cheapest possible check on the whole climate module. | S | 3 | A deliberate coefficient error is caught by the TOA check |
| C90 | **Angular momentum in the SWE** | Free-slip coasts and two substeps make this a real risk. | M | 2 | Drift bounded over 1,000 ticks |
| C91 | **Biomass budget** | `life` grows and decays with no inventory. | M | 3 | Closes against NPP and respiration |
| C92 | **Sediment mass conservation** | model-limits says erosion transfers height into the sink; assert nothing vanishes. | M | 3 | Eroded volume equals deposited plus in-transit |
| C93 | **Crust mass conservation across tectonics** | Creation at ridges, destruction at trenches. | M | 2 | Net crust change matches the ridge/trench balance |
| C94 | **Ice mass ↔ sea level consistency** | The link C39 needs, as a budget. | M | 3 | Ice loss equals sea-level rise within band |
| C95 | **Budget warnings must reach the player, not just the console** | An instrument that silently drifts is the honesty failure. | S | 3 | Lab shows drift; large drift is visible |
| C96 | **Budget drift in the save** | So a loaded run's history is auditable. | S | 1 | Stored |
| C97 | **Budget drift in the headless output** | `runHeadless` already returns `budgets`; make them assertable. | S | 3 | Ladder asserts drift bands |
| C98 | **Conservation tests at every N** | A budget that closes at N=32 and not at N=96 indicates an area-weight bug (engineering brief risk E2). | M | 3 | Bands hold across the ladder |
| C99 | **Area-weight test** | Brief risk E2's own suggested test: total surface area sums to 4π. | S | 3 | Test exists |
| C100 | **Corner-cell test** | Brief risk E1: the 8 cube corners have 3 neighbours. | S | 3 | Continuity test across all 24 seams and 8 corners |

---

# D · Determinism, replay, and divergence (100)

*Today: `rng.js` is genuinely good — one world seed, forked per-subsystem streams, an explicit
"no `Math.random` in the sim path" rule, and a `rngOf` that refuses to fall back. `goldenRun`
proves same-seed reproducibility for 40 ticks of `terra`. What is unresolved is everything around
it: `serializeRun` writes `version: 8` and `loadRunMeta` never reads it; a save at a different N
silently drops terrain and keeps going; GPU floats are not bit-identical across vendors
(engineering brief open question 2); and the art-piece face — "rewind the tape, watch two histories
diverge" — has no run object to hang on.*

**Felt payoff:** the promise in `PURPOSE.md` that contingency is something you can feel. Two
worlds from one seed, one intervention apart, side by side. That is the art face, and it is
currently the least-built of the four.

## D.1 Determinism audit (D1–D20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| D1 | **Enumerate every entropy source** | `freshSeed`, `Date.now`, `performance.now`, `crypto`, iteration order, GPU floats. | M | 3 | `briefs/determinism.md` lists each with its status |
| D2 | **Lint against `Math.random` in the sim path** | The rule exists in a comment; enforce it. | S | 3 | Scanner fails on `Math.random` under `vr/sim/` and `world.js` |
| D3 | **Lint against `Date.now` in the sim path** | Same class of bug, harder to spot. | S | 3 | Scanner covers it; `freshSeed` is the one allowed site |
| D4 | **Audit `Object.keys`/`for...in` over sim state** | Insertion order is stable in practice but not a contract you want to lean on. | M | 2 | Sim-path iteration over objects replaced with sorted or array order |
| D5 | **Audit `Array.sort` comparators for ties** | `seedVolatileIce` sorts temperatures; equal values give implementation-defined order. | S | 3 | All sim-path sorts are total orders |
| D6 | **Audit `Set`/`Map` iteration in ticks** | `_polityIndex` is a Map; iteration order affects who acts first. | M | 3 | Deterministic order asserted |
| D7 | **Audit floating-point accumulation order** | Summation order changes results; parallelising a reduction changes it silently. | M | 2 | Reductions use a fixed order; documented |
| D8 | **Per-stream draw counting** | A subsystem that draws a variable number of times per tick shifts nothing (streams are forked) — verify that claim. | M | 3 | Test: skipping `phylogeny` for a tick does not change `rngBio`'s later draws |
| D9 | **Add streams for the unstreamed** | New subsystems (`dark`, `polity`, `deterrence`, `ordnance`) need their own tags or they perturb siblings. | M | 3 | Every tick that draws has a named stream |
| D10 | **`rngViz` must never affect state** | Visual randomness in the sim stream would break replay. | S | 3 | Test asserts `rngViz` draws do not alter any saved field |
| D11 | **Stream state in the save** | `rngState` stores the seed, not the per-stream positions. | M | 3 | Save round-trips mid-run and continues identically |
| D12 | **Or: make streams position-free** | Counter-based (`hash(seed, tag, tick, cell)`) removes the need to save positions. | L | 3 | Streams are stateless; save size drops; replay is exact |
| D13 | **Prefer D12 over D11** | Counter-based RNG is the standard fix for exactly this problem. | S | 3 | Decision recorded with reasoning |
| D14 | **Determinism across N is not expected — say so** | Different N is a different model, not a different run. | S | 2 | Documented; save records N and refuses cross-N continuation |
| D15 | **Determinism across CPU/GPU is not expected** | Brief open question 2, answered explicitly. | S | 3 | Documented; golden runs pin the CPU path |
| D16 | **Golden runs pin the CPU path only** | Otherwise the hash depends on the tester's GPU. | S | 3 | `goldenRun` forces `_gpgpuOff` |
| D17 | **A separate GPU-path stability check** | Same GPU, same run, twice — should still match. | M | 2 | Test exists and runs where a GPU is available |
| D18 | **Fixed-point option for the field sim** | Brief open question 2's own suggested answer, if shared worlds ever matter. | L | 1 | Spike documented; decision recorded |
| D19 | **Determinism under time-rate changes** | `setTimeRate`, `cycleTimeRate`, fast-forward must not change outcomes. | M | 3 | Test: same seed at 1× and at max FF gives the same hash |
| D20 | **Determinism under frame rate** | The `agentsTick` comment records that behaviour steps per year used to depend on frame rate. Regression-lock it. | S | 3 | Test asserts hash independence from render cadence |

## D.2 Save format: version, migrate, validate (D21–D45)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| D21 | **Read `data.version`** | Written as 8, never read. | S | 3 | `loadRunMeta` branches on version |
| D22 | **Reject unknown versions loudly** | Half-loading is worse than refusing. | S | 3 | A future-version save gives a clear message |
| D23 | **Migration chain** | `migrate7to8`, etc., each tested. | M | 3 | Old-version fixtures load correctly |
| D24 | **Committed save fixtures** | One real save per version under `vr/data/fixtures/`. | M | 3 | Fixtures load in the test suite |
| D25 | **Stop silently dropping terrain on N mismatch** | `data.n === SIM_N` guards four separate blocks; failing it loads a world with the wrong land. | S | 3 | N mismatch either resamples or refuses; never partially loads |
| D26 | **Optionally resample across N** | Nearest-neighbour on the cube-sphere is straightforward. | M | 2 | Cross-N load offers resample with a stated caveat |
| D27 | **Replace the `if (data.x != null)` chain with a schema** | ~40 sequential guards is where fields go missing. | M | 3 | Declarative field table drives both save and load |
| D28 | **Save/load round-trip test per field** | The schema makes this generatable. | M | 3 | Every schema field round-trips in a test |
| D29 | **Round-trip a *mid-run* world, not a fresh one** | Fresh-world round-trips pass while live state is lost. | M | 3 | Save at tick 500, load, continue, hash matches |
| D30 | **Fail the build when a new field escapes the schema** | The main cause of save rot. | M | 3 | Census test (A24) cross-checks schema coverage |
| D31 | **Never save `_`-prefixed fields** | Links A26; caches in a save are stale by definition. | S | 2 | Audit and assert |
| D32 | **Save size budget** | `stack` is 49 bytes/cell; at N=96 that is ~2.7 MB before anything else. | M | 2 | Size reported; budget set per N |
| D33 | **Compress the field payloads** | Base64 of raw floats is the worst case. | M | 2 | Save size drops measurably with a round-trip test |
| D34 | **Seed-plus-delta for terrain** | Brief open question 1: obviously right for edits. | M | 2 | Terrain stored as seed + edit log where no resample occurred |
| D35 | **Snapshot policy for sim state** | Brief open question 1's hard half — sim state diverges irreversibly from its seed. | M | 3 | Policy written: periodic snapshots + edit log, with sizes measured |
| D36 | **Save the provenance hash** | Links A87. | S | 2 | Present |
| D37 | **Save the units-schema hash** | Links A40. | S | 3 | Present |
| D38 | **Save the constants hash** | A run made under different constants is not comparable. | S | 3 | Present; load warns on mismatch |
| D39 | **Save the code version** | Git SHA or build id. | S | 3 | Present |
| D40 | **Corrupt-save handling** | Truncated base64 currently throws somewhere deep. | S | 2 | Clear error, no partial world |
| D41 | **Autosave is already shipped — make it versioned** | `NEXT.md` row 2 shipped autosave-on-leave. | S | 3 | Autosave slots carry version and migrate |
| D42 | **Autosave must not corrupt on quit mid-tick** | Write-then-rename semantics. | S | 3 | Interrupted-write test |
| D43 | **`awayTick` determinism** | Advancing away-time must give the same result as sitting through it. | M | 3 | Test: away-advance of 100 ticks equals 100 live ticks |
| D44 | **Save the entity population faithfully** | `packEntities` exists; assert individuals, not counts. | M | 2 | Per-entity round-trip test |
| D45 | **Save the phylogeny with ghosts** | `packTree` exists; ghosts are what make the tree honest. | S | 2 | Ghost nodes survive round-trip |

## D.3 Replay and divergence as a feature (D46–D75)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| D46 | **A `Run` object** | Seed, rule, constants hash, intervention log, snapshots. `forkRun` hints at this already. | M | 3 | Runs are first-class and listable |
| D47 | **Intervention log is the tape** | `serializeRun` already collects `interventions`; make it authoritative. | M | 3 | Replaying the log from the seed reproduces the run |
| D48 | **Replay test** | The strongest possible determinism check. | M | 3 | Test: replay of a 500-tick run with 20 interventions matches hash |
| D49 | **Replay at a different speed** | Replay must be rate-independent (links D19). | S | 3 | Same hash at any rate |
| D50 | **Fork at a tick** | The core art-face gesture: go back and change one thing. | M | 3 | Fork from any snapshot; both runs continue independently |
| D51 | **Fork with no change must stay identical** | The control case. | S | 3 | Test asserts identical hashes |
| D52 | **Side-by-side twin view** | `gpgpu/index.js` already supports multiple world slots for exactly this. | L | 3 | Two runs render together |
| D53 | **Divergence metric** | A single number for "how far apart are these two histories". | M | 3 | Metric defined over fields + phylogeny + events |
| D54 | **Divergence over time chart** | The art-piece payoff made legible. | M | 3 | Chart shows when the histories parted |
| D55 | **Attribute divergence to a subsystem** | Which system amplified the change first. | M | 2 | Report names the first field to diverge |
| D56 | **Lyapunov-style sensitivity probe** | Perturb one cell by one epsilon; measure growth. | M | 2 | Growth rate reported per ruleset |
| D57 | **Name the horizon** | model-limits already states a ~2-week weather predictability ceiling; state the geologic one. | M | 3 | Predictability horizon published per timescale |
| D58 | **Contingent moments are marked** | `W.moments` exists; a fork that changes a moment is the story. | M | 3 | Moments diff between twins |
| D59 | **"What if I hadn't" affordance** | One tap: fork back to before the last intervention. | M | 3 | Works from the receipt |
| D60 | **Receipt links to the fork** | `god/receipt.js` already exists as the consequence surface. | S | 3 | Receipt offers the counterfactual |
| D61 | **Twin chronicles side by side** | Two `chronicle.js` streams diffed. | M | 2 | Diff view exists |
| D62 | **Twin phylogenies side by side** | The most legible divergence there is: different survivors. | M | 3 | Trees rendered together with shared ancestry highlighted |
| D63 | **Shared-ancestor marker** | Where the two trees separate. | S | 2 | Marker present |
| D64 | **Deterministic ensemble runs** | Same seed, N perturbations, one chart. | M | 2 | `scripts/ensemble.mjs` runs N members headless |
| D65 | **Ensemble spread as an honesty device** | A single trajectory implies precision the model does not have. | M | 3 | Instruments can show a spread band |
| D66 | **Ensembles pin the invented constants' cost** | Links B71/A92 — spread widens where invention dominates. | M | 3 | Spread reported per constant group |
| D67 | **Save a fork lineage, not a flat list** | Runs form a tree; the UI should say so. | M | 2 | Fork tree browsable |
| D68 | **Shareable run id** | `seedword.js`/`encodeWorldId` already do this for worlds; extend to runs. | M | 2 | A run id reproduces a run on another machine (CPU path) |
| D69 | **Cross-machine reproduction test** | The real proof of D68. | M | 2 | CI reproduces a committed run id's hash |
| D70 | **Publish which parts are reproducible** | Terrain yes, GPU climate no — honesty over ambition. | S | 3 | Stated in `model-limits.md` |
| D71 | **Determinism in the finale artefact** | The shared artefact should carry the run id. | S | 2 | Present |
| D72 | **Golden run per ruleset, not just `terra`** | `goldenRun` hardcodes `terra`/42/40. | S | 3 | Golden per ruleset in the ladder |
| D73 | **Longer golden runs** | 40 ticks does not reach the interesting divergence regime. | S | 3 | A 500-tick golden exists |
| D74 | **Golden runs with interventions** | An intervention-free run exercises none of the god tools. | M | 3 | Scripted intervention golden exists |
| D75 | **Golden runs with agents** | The `agentsTick` comment notes agents used to be outside `runHeadless` entirely. | M | 3 | Golden covers beings, herds, settlements |

## D.4 Golden corpus and automation (D76–D100)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| D76 | **The corpus** | Worlds × seeds × tick counts × committed hashes, in one data file. | M | 3 | `vr/data/golden.json` exists and is checked |
| D77 | **Corpus covers every ruleset** | Including `thrive` and `daisyworld`. | M | 3 | All rulesets present |
| D78 | **Corpus covers `noSurface`** | Giants take a different path through `simTick`. | S | 3 | Present |
| D79 | **Corpus covers `airless`** | Another skip-heavy path. | S | 3 | Present |
| D80 | **Corpus covers `_iceShell`** | Lid–ocean–mantle worlds take a third distinct path. | S | 2 | Present |
| D81 | **Corpus covers Dark on and off** | Links B95/B96. | S | 3 | Both present |
| D82 | **Corpus covers deep time** | `deepTime: true` is a different clock and a different tick ladder. | S | 3 | Present |
| D83 | **Hash more than five fields** | `hashFields` covers `h`, `temp`, `life`, `ice`, `moist`. | S | 3 | Hash covers every registry-declared saved field |
| D84 | **Separate structural and scalar hashes** | So a colour change does not invalidate a physics hash. | M | 2 | Two hashes per run |
| D85 | **Hash the phylogeny separately** | Tree changes are the most common intentional churn. | S | 2 | Third hash |
| D86 | **Hash update is a deliberate act** | Same rule as baselines (B16). | S | 3 | `--update-golden` flag; diff appears in review |
| D87 | **Explain a hash change** | A changed hash with no explanation is a coin flip in review. | M | 3 | Tool prints which fields moved and by how much |
| D88 | **Bisect helper** | Given a hash break, find the commit. | M | 2 | `scripts/bisect-golden.mjs` |
| D89 | **Wire the orphaned test entry points** | `dark-test.mjs` (792 lines), `dark-scenario.mjs`, `origin-sketch-test.mjs`, `deeptime.mjs`, `scale.mjs` are in no npm script. | S | 3 | All in a named script and run |
| D90 | **Split `npm test` into fast and full** | 804 assertions in ~4 minutes is not an edit-loop tool. | M | 3 | `npm run test:fast` under 20 s |
| D91 | **Tag tests by subsystem** | Run just the climate tests. | M | 3 | `npm test -- --only=climate` works |
| D92 | **Per-test timing** | Find the slow ones before optimising blind. | S | 2 | Slowest 10 printed |
| D93 | **Parallelise the suite** | 804 independent assertions across cores. | M | 2 | Wall-clock drops with the same results |
| D94 | **Deterministic test ordering** | Parallelism must not change outcomes. | S | 3 | Same results in any order |
| D95 | **Fail on unhandled rejection** | Silent async failures in a 4-minute suite are invisible. | S | 2 | Suite fails on them |
| D96 | **CI** | 804 passing assertions that nothing runs automatically. | M | 3 | GitHub Actions runs fast suite + golden + ladder on push |
| D97 | **CI runs the provenance ratchet** | Links A99. | S | 3 | Wired |
| D98 | **CI runs the parity harness** | Links C2, where a GPU is available; CPU-only otherwise. | M | 2 | Wired with a documented skip |
| D99 | **CI publishes the calibration report** | Links B20/B87. | S | 2 | Artefact on every run |
| D100 | **Pre-push hook for the fast suite** | Cheap local guard once D90 exists. | S | 1 | Documented, opt-in |

---

# E · Speed: the tick budget (100)

*Today `simTick` is a 235-line straight-line call chain over ~42 subsystems with no per-system
budget and no degradation path — exactly what engineering brief §7 rule 2 forbids ("every system
needs a hard per-frame time budget with an enforced degradation path, not a best-effort one").
The good news: the groundwork is unusually strong. `multiRateMask` already does deep-time rate
gating with a reused `_rate` object and a comment explaining why. `render.js` already times the
colour pass into `W._msColour`. `noteDroppedTicks` exists. `_tickIndex` exists because someone
found the `W.year | 0` int32 wrap. The pieces are there; nothing assembles them.*

**Felt payoff:** the planet keeps running while you hold it. Every frame the sim steals is a frame
the descent loop does not get, and `N_LADDER` goes to 512 — the headroom to make Earth *finer*
is entirely in this section.

## E.1 See it first (E1–E20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| E1 | **Per-subsystem timing ring** | Wrap each of the ~42 calls; keep a rolling mean and max. | M | 3 | `W._ms` holds a named entry per subsystem |
| E2 | **Expose `W._ms` in Lab and `runHeadless`** | `_msColour` proves the pattern works. | S | 3 | Sorted table visible; present in headless JSON |
| E3 | **Zero-cost when disabled** | Instrumentation that costs 0.3ms defeats itself. | S | 3 | Timing behind a flag; off-path overhead measured at ~0 |
| E4 | **Tick total vs frame total** | Two different budgets, currently neither is measured. | S | 3 | Both reported |
| E5 | **Report the p99, not the mean** | A subsystem that spikes every 32 ticks is invisible in a mean (the `assertBudgets` cadence is exactly this shape). | S | 3 | p50/p99/max per subsystem |
| E6 | **Attribute cost to N** | Which subsystems are O(NC) and which are worse. | M | 3 | Cost curve per subsystem across the N ladder |
| E7 | **Attribute cost to state** | `ordnanceTick` is "five array-length checks" on a peaceful planet and expensive in a war. | M | 3 | Cost reported under quiet and busy worlds |
| E8 | **Attribute cost to `dtYr`** | `multiRateMask` changes what runs; the cost profile changes with geologic age. | M | 3 | Profile at Hadean / Proterozoic / Holocene tick lengths |
| E9 | **Count allocations per tick** | The `_rate` comment identifies allocation as the concern on the hottest path. | M | 3 | Allocation count per tick measured and committed as a baseline |
| E10 | **GC pause tracking** | The real cause of a dropped frame in a JS sim. | M | 2 | Long-task/GC events correlated with dropped ticks |
| E11 | **Dropped-tick reporting reaches the player** | `noteDroppedTicks` records; nothing shows it. | S | 2 | HUD shows dropped ticks when non-zero |
| E12 | **Readback stalls measured** | GPU→CPU sync is the most likely hidden stall (links C24). | M | 3 | Readback time reported separately |
| E13 | **Render vs sim split** | Which half of the frame is over budget. | S | 3 | Both reported |
| E14 | **Per-subsystem budget in headless too** | So performance work can be done without a headset. | S | 3 | `runHeadless --profile` prints the table |
| E15 | **Committed performance baseline** | Same ratchet idea as provenance. | M | 3 | `vr/data/perf-baseline.json` with machine notes |
| E16 | **Regression detection on the baseline** | Relative, since machines differ. | M | 3 | A 20% relative regression in any subsystem fails |
| E17 | **Profile the worst world, not Earth** | Pinned Earth skips less than a live thrive world with a war on. | S | 3 | Baseline includes a worst-case world |
| E18 | **Profile at the shipped N** | `N_LADDER` says 96 is the shipped default. | S | 3 | Baseline at N=96 |
| E19 | **Profile on target hardware** | The brief's §7 numbers are all marked `[est]` and never measured. | M | 3 | One real measurement on a headset replaces the estimates |
| E20 | **Replace the `[est]` table** | Brief §7's own instruction. | S | 2 | `shipped.md` carries measured numbers |

## E.2 Scheduler, budget, degradation (E21–E45)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| E21 | **A tick scheduler** | Replace the straight-line chain with a table of {name, fn, cost, cadence, priority, gate}. | L | 3 | `simTick` iterates a declared table |
| E22 | **Published degradation order** | Which subsystems drop first when over budget. | M | 3 | Order in data; test asserts it is honoured |
| E23 | **Never degrade a conserved quantity** | Dropping `hydroTick` breaks the water budget; dropping `alienTick` does not. | S | 3 | Conserving subsystems marked non-droppable |
| E24 | **Degradation is visible, not silent** | Silent degradation is the honesty failure again. | S | 3 | HUD names what is running reduced |
| E25 | **Generalise `multiRateMask`** | It handles tectonics/phylogeny/carbon; the same mechanism should cover all 42. | M | 3 | Every subsystem has a declared cadence |
| E26 | **Cadence from physics, not from cost** | Tectonics at 8× is defensible; skipping ecology to save time is not. | M | 3 | Each cadence has a stated physical justification |
| E27 | **Stagger cadences to avoid a spike tick** | If six subsystems all fire on `% 8 == 0`, one tick in eight is six times as expensive. | M | 3 | Phase offsets assigned; p99 tick cost drops |
| E28 | **Fix the `assertBudgets` spike** | Three full NC sweeps plus a NaN scan every 32 ticks, in release. | S | 3 | Amortised across ticks or moved off the critical path |
| E29 | **Amortise full-field sweeps generally** | Any O(NC) diagnostic can process a slice per tick. | M | 3 | Sweeps declare a slice count |
| E30 | **Interpolate render state between ticks** | Brief §7 rule 1; the render already draws last-completed state. | M | 3 | Visual smoothness independent of tick rate, asserted |
| E31 | **Decouple the sim tick from the frame entirely** | Fixed-rate sim with accumulator. | M | 3 | Frame rate and tick rate independent; D20's test still passes |
| E32 | **Cap catch-up ticks** | Accumulator death spirals when a tick costs more than its interval. | S | 3 | Max catch-up per frame; excess reported via `noteDroppedTicks` |
| E33 | **Fast-forward runs off the render loop** | `shouldHaltFF` exists; FF should not be frame-limited. | M | 3 | FF throughput measured in ticks/second, not frames |
| E34 | **Budget for `agentsTick` substeps** | `lifeSubsteps` runs 1–8 agent ticks inside one climate tick. | M | 3 | Substep count responds to the budget without changing outcomes (D19) |
| E35 | **Or: keep substeps fixed and drop elsewhere** | Changing substeps changes results; that conflicts with determinism. | S | 3 | Decision recorded; determinism wins |
| E36 | **Sparse subsystems declare sparsity** | `ordnanceTick`'s comment already describes the pattern. | M | 2 | Sparse subsystems cost ~0 when inactive, asserted |
| E37 | **Gate by world kind at the table level** | `noSurface`/`airless` checks are repeated inline in `simTick`. | M | 3 | Gates declared once per subsystem |
| E38 | **Remove the inline gate thicket** | `!rule.daisyworld && !rule.airless && !W.noSurface && rate.tectonics && !W._canvasMode` is five conditions in one line. | M | 3 | Gates in data; `simTick` reads cleanly |
| E39 | **Assert the giant path really skips** | Links B66; a skipped subsystem that still allocates is not skipped. | S | 3 | Timing table shows ~0 for skipped systems |
| E40 | **Priority for what the player is looking at** | The LOD idea applied to the sim: local detail where the camera is. | L | 2 | Nearby cells get finer agent updates |
| E41 | **LOD agent AI** | Brief risk E5's own mitigation. | L | 2 | Distant herds update at a lower cadence, visibly identical from orbit |
| E42 | **Pause what is invisible** | Nothing off-screen needs its behaviour resolved at full rate. | M | 2 | Off-screen cadence reduced without changing saved state |
| E43 | **But keep the planet running** | Pillar P1: it keeps running when you are not looking. Reduced ≠ stopped. | S | 3 | Away-time (D43) still deterministic |
| E44 | **Budget headroom for interventions** | A god tool used at peak load must not drop a frame. | M | 3 | Tool use under load stays within budget |
| E45 | **Budget report in the finale** | How hard the world was to run is genuinely interesting. | S | 1 | Present |

## E.3 Make the hot loops cheap (E46–E75)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| E46 | **Zero allocation in tick bodies** | Copy the `_rate` pattern: module-scope reusable objects. | L | 3 | Allocation baseline (E9) approaches zero per tick |
| E47 | **Audit `.map`/`.filter`/`.slice` in tick paths** | 42 hits in `main.js`, 32 in `render.js`, 6 in `agents.js` — some are per-frame. | M | 3 | None remain on per-tick or per-frame paths |
| E48 | **Reuse scratch fields** | `W._adv` already exists as an advection scratch; generalise it. | M | 3 | A scratch pool; no per-tick `Float32Array` allocation |
| E49 | **Preallocate the fossil arrays** | `recordFossil` does `Array.from({length: NC}, () => [])` — NC arrays on first use. | S | 2 | Flat storage or lazy per-cell |
| E50 | **Typed arrays for entity state** | `ENT` holding objects is the classic slow path. | L | 3 | Struct-of-arrays; `packEntities` round-trip unchanged |
| E51 | **Avoid object spread in loops** | `serializeRun` and several ticks spread per item. | M | 2 | Spreads removed from hot paths |
| E52 | **Cache the neighbour stencil** | `swe.js` already does this per its comment; check the others. | M | 3 | All neighbour-walking ticks use the baked `NBR` table |
| E53 | **Bake the neighbour table once** | Brief §2.3's recommendation: generic 3D round-trip at init, baked to a static array. | M | 3 | Built once at `changeResolution`, never recomputed |
| E54 | **Area weights baked once** | Brief §2.2: 4 bytes per cell, nothing at runtime. | S | 3 | Baked; E-99 test asserts the sum |
| E55 | **Loop order = memory order** | Cube-sphere faces as contiguous strips; iterate them that way. | M | 3 | Cache-friendly iteration measured faster |
| E56 | **Fuse independent per-cell passes** | Several ticks each walk all NC cells doing one thing. | L | 3 | Fused pass measured faster with identical results |
| E57 | **Hoist invariants out of cell loops** | `rule.*` lookups inside per-cell loops are common. | M | 2 | Audit complete |
| E58 | **Avoid `??` and optional chaining in inner loops** | Cheap individually, not at 55k cells × 42 systems. | M | 2 | Hot loops use pre-resolved locals |
| E59 | **Replace `Math.pow` with multiplication where the exponent is fixed** | `slope²`, `^0.32`, `^0.85` appear in per-cell code. | S | 2 | Audit complete |
| E60 | **Precompute per-cell constants** | Latitude, area, insolation geometry do not change per tick. | M | 3 | Static per-cell table |
| E61 | **Skip cells that cannot change** | Deep ocean interior does not need erosion. | M | 3 | Active-cell lists per subsystem |
| E62 | **Dirty-region tracking** | `_hydroDirty` exists as a flag; make it spatial. | L | 3 | Subsystems process changed regions only, with identical results |
| E63 | **Cheap early-out per subsystem** | `carbonTick` returns early on `daisyworld`; generalise. | S | 2 | Every subsystem has a cheap guard |
| E64 | **Batch the chronicle** | `chronLog` in a per-cell path would be pathological; verify none are. | S | 2 | Audit complete |
| E65 | **Rate-limit event logging** | The spring-tide comment records 288 identical lines in 800 ticks. | S | 2 | A general rate-limiter replaces the per-site `% 24` hack |
| E66 | **Avoid string building in ticks** | `format*` functions must never run from `simTick`. | S | 3 | Audit asserts formatting is view-only |
| E67 | **HUD refresh cadence is already staggered — extend it** | `updateHUD` uses 400/500/600ms gates; make that a declared policy. | S | 2 | One cadence table for all panels |
| E68 | **Panels compute only when visible** | `climatePanel.js` is 923 lines. | M | 3 | Hidden panels cost ~0 |
| E69 | **Overlay generation off the tick** | Overlays are view state. | M | 2 | Overlay cost appears under render, not sim |
| E70 | **`refreshColours` cost is already measured — budget it** | `_msColour` exists; give it a ceiling. | S | 3 | Budget enforced with a degradation path |
| E71 | **Vertex colour upload as a partial update** | Brief §5: static geometry, dynamic attributes, small `bufferSubData`. | M | 3 | Only changed regions uploaded |
| E72 | **Entity upload batching** | Brief §5: one draw call per entity family. | M | 2 | Draw-call count reported and bounded |
| E73 | **Avoid re-meshing on every change** | `remeshPlanet` is expensive; `geomDirty` should coalesce. | M | 3 | One remesh per frame at most |
| E74 | **Measure before and after every one of these** | Optimisation without measurement is churn. | S | 3 | Each row lands with a before/after in the commit |
| E75 | **Keep results identical** | Every optimisation is a determinism risk; the golden corpus is the guard. | S | 3 | Golden hashes unchanged by any E.3 row |

## E.4 Scale up: more Earth per cell (E76–E100)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| E76 | **What does N=128 actually cost?** | The ladder lists it as "heavy" with no measurement. | M | 3 | Measured tick cost at every ladder rung |
| E77 | **Find the real ceiling** | The ladder claims 768 is "RAM-cheap"; nothing has run there. | M | 2 | Highest usable N measured and documented in `N_LADDER` |
| E78 | **Memory per cell audit** | The material stack alone is 49 bytes/cell. | M | 3 | Bytes-per-cell total published per N |
| E79 | **Reduce bytes per cell** | Several fields could be Uint8 or Uint16. | M | 2 | Total drops with unchanged calibration |
| E80 | **The stack is the biggest single cost** | 8 layers × per-cell; consider run-length or a shared-recipe index. | L | 2 | Stack memory drops with round-trip preserved |
| E81 | **Move the climate field sim fully to GPU** | Brief §4: 393k cells is "not the bottleneck" on GPU. Links C21/C22. | L | 3 | Climate at N=256 within tick budget |
| E82 | **Use the worker** | `worker.js` exists and is instantiated once in `main.js`; scope its job. | M | 3 | A named subsystem runs off the main thread with parity |
| E83 | **Worker candidates: phylogeny and evolution** | Low coupling per tick, high cost, already rate-gated. | M | 3 | `evolveTick` off-thread with identical hashes |
| E84 | **Worker candidates: instruments and stats** | Pure readers. | M | 2 | `surfaceStats`/`pictureStats` off-thread |
| E85 | **SharedArrayBuffer feasibility** | Needs COOP/COEP headers on GitHub Pages; check before designing around it. | S | 2 | Feasibility recorded either way |
| E86 | **Determinism across the worker boundary** | Message ordering is a new entropy source (links D1). | M | 3 | Hashes identical with and without the worker |
| E87 | **Cold start: 2.3 MB of unbundled JS, 163 modules** | The first ninety seconds includes the download. | M | 3 | Time-to-first-frame measured on a headset browser |
| E88 | **Split the bundle by gate** | Dark (17 modules, 7.5k lines) is gated behind `?dark=1` and still ships. | M | 3 | Gated layers load on demand |
| E89 | **Defer the catalogue** | `catalogue.js` + `catalogue-rules.js` is ~3.4k lines for a picker. | M | 2 | Loaded on first open |
| E90 | **Defer the teaching system** | `teach.js` + `tips.js` load for visitors who skip the tour. | M | 2 | Loaded on demand |
| E91 | **Minify for Pages** | No build step today. | M | 2 | Payload drops; source maps published |
| E92 | **Budget the boot sequence** | `setBootPhase` already exists, so the phases are known. | S | 3 | Per-phase boot timing reported |
| E93 | **Generate-time cost is separate from tick cost** | `generate` does a climate spin-up (`_spinup`). | M | 3 | Generate time measured per world and budgeted |
| E94 | **Spin-up length justified** | A spin-up that is too short leaves a transient the player reads as physics. | M | 3 | Spin-up length derived from an equilibrium test |
| E95 | **Progressive generate** | Show the planet forming rather than a blank wait. | M | 2 | First frame arrives before generation completes |
| E96 | **Higher N where it matters: coastlines** | Brief §6's insight generalised — pay for detail only where it reads. | L | 2 | Coastal refinement without a global N increase |
| E97 | **Two-rate spatial scheme** | Fast local, slow global, as the brief's L2/L4 split implies. | L | 2 | Prototype measured against uniform N |
| E98 | **Publish the speed numbers** | `shipped.md` should carry them beside the architecture reality. | S | 2 | Present |
| E99 | **Area-weight sum test at every N** | Brief risk E2 (also C99); belongs in the perf ladder too since it is baked once. | S | 3 | Test asserts sum → 4π at every rung |
| E100 | **A tick-rate target, stated** | There is no written answer to "how many sim years per second should Earth do?" | S | 3 | Target per time-rate setting, measured and published |

---

## Promotion protocol

1. **Nothing here is scheduled.** `NEXT.md` remains the only queue.
2. **Promote 1–3 rows at a time**, and only rows whose *Done when* you can write as a failing check today.
3. **The First 25 table is the gate.** Rows outside it that depend on missing tooling will be
   re-litigated forever; the tooling rows exist so the rest become cheap.
4. **When a row lands**, delete it from this file and note it in [`shipped.md`](shipped.md). This
   register should shrink. A register that only grows is the thing `RETIRED.md` deleted.
5. **If a row cannot be expressed as a check, delete it.** That is the difference between this
   document and the 7,600 items that came before it.

## Dependency spine

The five sections are not independent — this is the order the tooling actually unlocks:

```
A1–A5  (scanner + ratchet)
   └─> A21–A40  (unit registry)
          └─> B1–B8  (parameterised calibration harness)
                 ├─> B41  (frozen Earth reference)
                 │      └─> B46–B70  (Solar System ladder)
                 └─> C1–C3  (parity harness needs shared constants)
                        └─> C81–C100  (budgets need units + parity)
E1–E5  (timing ring)          D1–D20  (determinism audit)
   └─> E21–E27 (scheduler)       └─> D76–D88  (golden corpus)
          └─> E46–E75 (hot loops, guarded by the corpus)
```

Read that as: **A and E1–E5 are free-standing and everything else waits on them.** D76's corpus is
what makes E46–E75 safe to attempt at all — optimisation without golden hashes is how a simulation
quietly stops being the same simulation.

## What this does not cover

Deliberately out of scope, so nobody reads an omission as an oversight:

- The other fifteen themes from the holistic pass (product scope, onboarding, the three UI
  monoliths, accessibility, silent error handling, the `W` god object as an architecture problem
  rather than a units problem).
- New simulated systems for their own sake. C.3 adds interrelations between systems that already
  exist; it does not propose a new subsystem anywhere.
- Anything in the Dark layer beyond keeping it gated, hashed, and parity-checked —
  `NEXT.md` row 9 pauses Dark expansion and this register respects that.
