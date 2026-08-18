# ORRERY — biosphere implementation plan

**Hand-written. Not generated. 420 steps.**

Companion documents — read in this order:

1. `briefs/biosphere-audit.md` — measured evidence for why the current biosphere is stuck
2. `briefs/biosphere-architecture.md` — the design being implemented
3. **this file** — the work order

## How to use this document

Each step is atomic: one edit or one verification, with a file, a symbol, and an acceptance
criterion. Work top to bottom within a phase. Steps marked **⛔ GATE** must pass before the
next block starts.

Notation: `*File:*` is where the change lands. `*Done when:*` is the acceptance test — if you
cannot state how you checked it, the step is not done. `[hash]` marks a step expected to change
the golden field hash; record the old and new value in the commit body with a one-line reason.

Standing rules for every step:

- **Tests stay green.** `node vr/sim/test.mjs` and `node vr/sim/calibrate.mjs` after every block.
- **Modern Earth is sacred.** `rule.earthLike && !rule.deepTime` must keep passing
  `calibrateEarth` within the tolerances in `calibrate.mjs:7`. If a change moves `meanLife`
  below `0.05`, add a compensating coefficient and tag it `fitted`.
- **Determinism.** New RNG draws use `rngOf(W, '<namedStream>')`. Never `Math.random`. Never add
  a consumer to the shared `W.rng` stream — it reorders every downstream draw.
- **Tag every magic number** `// provenance: measured | fitted | invented` per
  `model-limits.md:36`.
- **No dates in gates.** No new code reads `W.year`, `W.ageYr`, or `maBP` to decide whether a
  biological capability is available. State preconditions only.
- **Backlog is generated.** Never hand-edit `briefs/evolution-backlog.md` or
  `briefs/living-backlog.md`. Add items to `scripts/evolution.mjs` (`D` array, schema
  `{c,t,k,n,d,x,e,i}`) and run `node scripts/evolution.mjs`.
- **Commit per block**, not per step. Blocks are the lettered sub-sections.

Baseline to record before touching anything (from `biosphere-audit.md §1`):
golden hash `6988c6c4d431afd0`; calibrate meanLife `0.08476`, O₂ `0.2095`, CO₂ `523.95` ppm.

---

# PHASE 0 — Inventory & wiring

**Goal.** Make the existing tree observable and the deep-time run capable of leaving the
Archean. No new systems. When Phase 0 ends, a deep-time run must reach `T.multicellular` and
show more than one lifeClass value, and the tree must be wired to agents by `popId`.

**Why first.** Audit §2 proves that four of the five downstream phases are currently
unverifiable, because the run never enters the states they describe.

## 0.A — Baseline and harness

- [ ] **P0-01** — Run `node vr/sim/test.mjs`, `node vr/sim/calibrate.mjs`,
      `node vr/sim/headless.mjs --golden`. *Done when:* all three outputs are pasted into a new
      `briefs/biosphere-baseline.txt` with the date, and the golden hash matches
      `6988c6c4d431afd0` (if it does not, stop and reconcile before proceeding).
- [ ] **P0-02** — Create `vr/sim/deeptime.mjs` as a headless deep-time probe. CLI flags
      `--seed`, `--n`, `--ticks`, `--every`, `--rule`, `--json`. *File:* new.
      *Done when:* `node vr/sim/deeptime.mjs --n=32 --ticks=500` prints one row per `--every`.
- [ ] **P0-03** — In `deeptime.mjs`, call `setResolution(n)` **before** the dynamic
      `import('../world.js')`, then `reallocateWorldFields(W)`. *Done when:* `--n=32` prints
      `NC 6144` and `--n=64` prints `NC 24576`.
- [ ] **P0-04** — Emit per sample: `tick, maBP, dtYr, meanLife, O2, CO2, living, total,
      unlockedClass, lifeClass histogram, bodyMass min/max, trophic max, convergences,
      transitions (comma list), top-3 guild means`. *Done when:* output reproduces the audit §2
      table at `--seed=20260808 --n=32 --ticks=5500 --every=500`.
- [ ] **P0-05** — Add a `--wall` flag printing elapsed ms and ms/tick. *Done when:* N=32 reports
      ≈29 ms/tick and N=64 ≈155 ms/tick on the dev machine, matching audit §3.1.
- [ ] **P0-06** — Add `--firsts` mode: after the run, print every `W.chron` event of kind
      `evolution`, `origin`, `oxygenation`, `massext`, `moment` with its age. *Done when:* a
      500-tick run prints `Abiogenesis` with an age.
- [ ] **P0-07** — Add `--tree` mode: dump the final tree as a flat table (`id, parentId, name,
      birth, death, pop, bodyMass, trophic`). *Done when:* row count equals `tree.nodes.length`.
- [ ] **P0-08** — Add `npm`-less shortcut docs: a `## Probes` section in `README.md` listing
      `node vr/sim/deeptime.mjs`, `--golden`, `calibrate.mjs`. *Done when:* the three commands
      copy-paste and run from repo root.
- [ ] **P0-09** — Add `assertNoNaN(W)` to `vr/sim/assert.js`: scan `life`, `temp`, `moist`,
      `macroDens` (once it exists) for `NaN`/`Infinity`, throw with the field name and cell
      index. *Done when:* deliberately writing `W.life[5] = NaN` makes it throw.
- [ ] **P0-10** — Call `assertNoNaN` from `assertBudgets` (`world.js:409` already runs it every
      32 ticks). *Done when:* a 500-tick deep-time run completes without throwing.

## 0.B — Index the tree (the 200-clade precondition)

Audit §3.1: five linear `tree.nodes.find()` scans, two inside per-cell loops, giving
O(NC × living²).

- [ ] **P0-11** — Add `byId: new Map()` to the object returned by `createTree`.
      *File:* `vr/sim/evolve.js:44`. *Done when:* `W.tree.byId instanceof Map` after generate.
- [ ] **P0-12** — In `addLineage`, `tree.byId.set(id, node)` after `tree.nodes.push(node)`.
      *File:* `vr/sim/evolve.js:71`. *Done when:* `byId.size === nodes.length`.
- [ ] **P0-13** — Export `export function nodeOf(tree, id) { return tree.byId.get(id) || null; }`
      from `evolve.js`. *Done when:* imported by the call sites below.
- [ ] **P0-14** — Replace the `find` at `evolve.js:165` (pop-count refresh) with `nodeOf`.
      *Done when:* no `nodes.find` remains in that loop.
- [ ] **P0-15** — Replace the `find` at `evolve.js:173` (per-cell popId validation) with
      `nodeOf`. *Done when:* the per-cell loop contains no array scan. **This is the single
      biggest win in the phase.**
- [ ] **P0-16** — Replace the `find` at `evolve.js:186` (selection loop) with `nodeOf`.
- [ ] **P0-17** — Replace the two `find`s at `evolve.js:225` and `evolve.js:244` with `nodeOf`.
- [ ] **P0-18** — Replace the nested `find` at `evolve.js:255–262` (empty-cell lineage
      assignment) with `nodeOf`, and hoist the living-node array **out** of the per-cell loop so
      it is built once per tick. *Done when:* complexity is O(NC × living), not O(NC × living²).
- [ ] **P0-19** — Replace `find` in `maybeSpeciate` (`evolve.js:292`), `detectConvergence`
      (`evolve.js:350`), and `related` (`evolve.js:374–375`) with `nodeOf`.
- [ ] **P0-20** — Replace `find` in `extinction.js` (lines 58, 72, 172), `meta.js` (34, 121,
      132), `ecology.js` (172, 206), `instruments.js`, `god/life.js:134`, `god/life.js:224` with
      `nodeOf`. *Done when:* `grep -rn "nodes.find" vr/` returns nothing.
- [ ] **P0-21** — In `extinguish` (`evolve.js:270`), leave `byId` populated (extinct nodes stay
      addressable for the fossil record and tree UI) but remove the id from `living`.
      *Done when:* a dead lineage is still returned by `nodeOf`.
- [ ] **P0-22** — Add `tree.livingSet = new Set()` maintained alongside `living`, and use it for
      membership tests. *Done when:* `living.length === livingSet.size` after 500 ticks.
- [ ] **P0-23** — Replace `tree.living = tree.living.filter(...)` (four sites: `evolve.js:273`,
      `extinction.js:78`, `extinction.js:177`, `god/life.js:183`) with a single exported
      `removeLiving(tree, id)` that updates both `living` and `livingSet`.
      *Done when:* `grep -rn "living = .*filter" vr/` returns nothing.
- [ ] **P0-24** — Add `treeStats(tree)` returning `{ nodes, living, extinct, maxDepth,
      meanBranchLen }` for the probe. *Done when:* `deeptime.mjs --tree` prints it.
- [ ] **P0-25** — ⛔ GATE — Benchmark: `node vr/sim/deeptime.mjs --n=64 --ticks=300 --wall`.
      *Done when:* ms/tick is within 5 % of the 155 ms baseline (the index should be neutral at
      24 lineages and is insurance for 200).
- [ ] **P0-26** — Synthetic scale test: add `vr/sim/scale.mjs` that seeds 250 lineages directly
      via `addLineage` with random traits, runs 50 `evolveTick`s, reports ms/tick.
      *Done when:* it runs and reports a number.
- [ ] **P0-27** — ⛔ GATE — `node vr/sim/scale.mjs` at 250 lineages, N=64.
      *Done when:* ms/tick < 250. If not, profile and fix before Phase 3 (which will create that
      many lineages for real).
- [ ] **P0-28** — Add a `detectConvergence` stride: sample at most 60 pairs per tick using a
      rotating offset from `W._tickIndex`. *File:* `evolve.js:349`. *Done when:* the function is
      O(60) regardless of living count, and `scale.mjs` shows no convergence-driven cost.
- [ ] **P0-29** — `node vr/sim/test.mjs`. *Done when:* 26/26 pass.
- [ ] **P0-30** — `node vr/sim/headless.mjs --golden`. *Done when:* hash is **unchanged** at
      `6988c6c4d431afd0`. An index cannot alter behaviour; if it does, a `find` was returning a
      different node than `byId` and that bug must be found now.

## 0.C — `popId` becomes the only cell→lineage link

Audit §3.2: `agents.js` derives clade from `(c + n) % living.length`.

- [ ] **P0-31** — Export `lineageAt(W, c)` from `evolve.js`: returns `nodeOf(W.tree, W.popId[c])`
      or `null`. *Done when:* unit-tested for an empty cell returning `null`.
- [ ] **P0-32** — In `agents.js:writeEnt`, replace `W.tree.living[(c + n) % length]` with
      `lineageAt(W, c)`. *File:* `vr/agents.js:75–86`. *Done when:* two entities in the same cell
      get the same lineage.
- [ ] **P0-33** — Replace the duplicate clade-colour derivation at `agents.js:104–110` with the
      same `lineageAt(W, c)` result already computed above (delete the second lookup).
      *Done when:* only one lineage lookup per `writeEnt`.
- [ ] **P0-34** — Store `m.popId = node?.id ?? 0` in `ENT.meta[n]`. *File:* `agents.js:115–129`.
      *Done when:* `ENT.meta[0].popId` is a tree id or 0.
- [ ] **P0-35** — Add `m.cladeName = node?.name ?? null` to entity meta so the follow panel can
      show it without a tree lookup. *Done when:* present on entities in living cells.
- [ ] **P0-36** — On entity move (`agents.js:387–399`), refresh `m.popId` from the destination
      cell and, if it changed, recompute the plan and sprite kind. *Done when:* an agent walking
      from a cell of lineage A into lineage B's range changes silhouette.
- [ ] **P0-37** — Make the clade tint deterministic from the lineage id alone (drop the
      `0.85 + rng()*0.2` value jitter from the clade-mixed channel, keep it only on the base
      kind colour). *File:* `agents.js:96–111`. *Done when:* two agents of the same lineage in
      the same cell have the same hue.
- [ ] **P0-38** — Add `cladeRGB(id)` to `vr/sim/lifeColour.js` — the golden-ratio hue hash used
      in `agents.js` — and call it from both `agents.js` and (later) the Lab tree.
      *Done when:* one implementation, two callers.
- [ ] **P0-39** — In `evolveTick`'s empty-cell assignment (`evolve.js:255–267`), prefer a
      lineage already present in a **neighbouring** cell over the globally fittest, so ranges are
      spatially coherent instead of a fitness mosaic. Fall back to fittest when no neighbour has
      one. *Done when:* `deeptime.mjs` reports mean range contiguity (see next step) above 0.5.
- [ ] **P0-40** — Add `rangeContiguity(W)` to `meta.js`: for each living lineage, the fraction of
      its cells that have at least one same-lineage neighbour. Report the population-weighted
      mean. *Done when:* printed by `deeptime.mjs`.
- [ ] **P0-41** — ⛔ GATE — `node vr/sim/deeptime.mjs --n=32 --ticks=1000`.
      *Done when:* `rangeContiguity > 0.5` and lineage ranges visibly clump rather than
      speckle.
- [ ] **P0-42** — Add `W.cladeCount = new Uint8Array(NC)` to `createWorld` and
      `reallocateWorldFields`. *File:* `vr/world.js:41–61`, `70–100`.
      *Done when:* allocated at both N=32 and N=64.
- [ ] **P0-43** — Populate `cladeCount[c]` at the end of `evolveTick`: the number of distinct
      `popId` values in `{c} ∪ NBR8[c]`. *Done when:* max value ≤ 9 and mean > 0 after 500 ticks.
- [ ] **P0-44** — Add a `diversity` overlay to the field overlay list in `vr/sim/overlay.js`
      driven by `cladeCount`. *Done when:* selectable in the UI and the globe shows a spatial
      diversity pattern.

## 0.D — `lifeClass` and `unlockedClass` become derived

Audit §3.3 and §3.4: three competing writers and a global scalar standing in for per-lineage
state.

- [ ] **P0-45** — Create `vr/sim/lifeclass.js`. Export `GRADES` (the eight existing ids from
      `bio.js:10–19`, unchanged), `deriveGrade(node)`, `deriveLifeClass(W)`,
      `unlockedClassFromPool(W)`. *File:* new.
- [ ] **P0-46** — `deriveGrade(node)` in Phase 0 returns a grade from what exists today: traits
      + `W.transitions`. Signature must already accept the future `node.slots`/`node.flags` so
      Phase 1 only changes the body. *Done when:* returns 0–7 for every node in a 1000-tick run.
- [ ] **P0-47** — `deriveLifeClass(W)` loops cells once, writing `W.lifeClass[c]` from
      `lineageAt(W, c)`'s grade, falling back to the dominant guild's grade for microbial-only
      cells. *Done when:* it is the only function that writes `W.lifeClass`.
- [ ] **P0-48** — Call `deriveLifeClass(W)` as the **last statement** of `evolveTick`.
      *File:* `evolve.js:268`. *Done when:* called once per phylogeny tick.
- [ ] **P0-49** — Delete the `lifeClass[c] = best` writes in `bioTick` (`bio.js:85`, `96`, `107`)
      and the whole `LIFE_CLASSES`/`envelopeOk` best-class search at `bio.js:60–67`, keeping the
      `fit` computation that feeds `hab`. *File:* `vr/sim/bio.js`. **[hash]**
      *Done when:* `grep -n "lifeClass\[" vr/sim/bio.js` returns nothing.
- [ ] **P0-50** — Delete `W.lifeClass[c] = classFromTransitions(...)` at `redox.js:263` and the
      `classFromTransitions` function at `redox.js:316`. **[hash]**
      *Done when:* `grep -n "lifeClass" vr/sim/redox.js` returns nothing.
- [ ] **P0-51** — Delete `W.lifeClass[c] = Math.max(...)` at `god/life.js:74` and
      `god/life.js:273`; replace with a write to the *lineage's* grade (or a module set in
      Phase 1), so a god tool changes biology, not a display field.
      *Done when:* god tools still visibly change what is drawn.
- [ ] **P0-52** — Keep `seedLife`'s `W.lifeClass[c] = cls` (`bio.js:246`) but mark it
      `// derived-field override: recomputed next evolveTick` so the transience is explicit.
- [ ] **P0-53** — Audit `earth.js` (7 `lifeClass` references). Any write there is seeding modern
      Earth before the first tick; convert to seeding `popId` + a seeded modern lineage instead,
      and let `deriveLifeClass` produce the class. *Done when:* `calibrateEarth` still passes and
      `earth.js` no longer writes `lifeClass`.
- [ ] **P0-54** — Add `W.modulePool = new Set()` to `initRedox` (it lives with `transitions`,
      which is the same kind of global). *File:* `redox.js:59`.
      *Done when:* present after generate, empty on a fresh deep-time world.
- [ ] **P0-55** — `unlockedClassFromPool(W)` maps `W.transitions` (Phase 0) / `W.modulePool`
      (Phase 2) onto the legacy 0–7 integer, reproducing exactly the mapping at
      `redox.js:440–446`. *Done when:* a 1000-tick run gives the same `unlockedClass` sequence as
      before the change.
- [ ] **P0-56** — Replace the nine `W.unlockedClass = …` writes in `redox.js:440–446` with a
      single call to `unlockedClassFromPool(W)` from the end of `evolveTick`.
      *Done when:* `grep -n "unlockedClass =" vr/sim/redox.js` returns nothing.
- [ ] **P0-57** — Convert `god/life.js:208–210` (`unlockedClass` bumped as a reward) into writes
      to `W.transitions` / `W.modulePool`, so the derived value follows.
      *Done when:* the god tool still advances the biosphere.
- [ ] **P0-58** — ⛔ GATE — `node vr/sim/deeptime.mjs --n=32 --ticks=5500 --every=500` must
      reproduce the audit §2 table **exactly** (same living/total counts, same transitions) —
      confirming 0.B–0.D are pure refactors. **[hash]** Record the new golden hash and note in
      the commit that it moved because two `lifeClass` writers were collapsed into one.
- [ ] **P0-59** — `node vr/sim/calibrate.mjs`. *Done when:* pass, with `meanLife ≥ 0.05`. If it
      dropped, the compensating coefficient goes in `bio.js`'s residual gas coupling and is
      tagged `fitted`.

## 0.E — Give the redox tower a memory

Audit §2.1, §2.3, §2.4. These are the three bugs that make the Archean a monoculture.

- [ ] **P0-60** — Split `seedVentChemistry` into `initSpeciesFields(W)` (called once from
      `initRedox` and after `generate`) and `relaxSpeciesFields(W, dt)` (called each tick).
      *File:* `vr/sim/redox.js:99–132`.
      *Done when:* `redoxTick` no longer assigns `species.*[c]` wholesale.
- [ ] **P0-61** — `relaxSpeciesFields` moves each field toward its abiotic equilibrium at a
      per-species rate instead of snapping:
      `sp[x][c] += (eq - sp[x][c]) * RELAX[x] * dt`. *Done when:* `RELAX` is a named table with
      per-species rates, each tagged, and no field is overwritten.
- [ ] **P0-62** — Set `RELAX` so slow reservoirs are slow: `H2S` 0.05, `Fe2` 0.02, `orgC` 0.10,
      `SO4` 0.03, `NO3` 0.15, `NH4` 0.15, `CH4` 0.20; fast/externally-forced ones stay ~1.0
      (`light`, `O2`, `CO2`, `H2O`, `N2`). *Done when:* a euxinic basin created by sulfate
      reducers persists for more than one tick — verifiable by logging `max(species.H2S)`.
- [ ] **P0-63** — Keep vents as an *addition* each tick (`bound[c] === 0 && isSea` adds H₂, H₂S,
      Fe²⁺ at a flux rate) rather than a set. *File:* `redox.js:126–130`.
      *Done when:* vent cells have the highest H₂ in the field and it is flux-driven.
- [ ] **P0-64** — Normalise `species.CO2` to `0–1`: replace `W.gases.CO2 * 20` with
      `clamp(W.gases.CO2 * 20, 0, 1)` **and** add a comment stating the intended saturation
      point. Do the same for `CH4 * 10`. *File:* `redox.js:108`, `113`.
      *Done when:* `max(species.CO2) ≤ 1` on a deep-time world with `CO2 = 0.12`.
- [ ] **P0-65** — Add a dev assertion in `assert.js`: every `species` field is within `[0, 1.001]`
      after `redoxTick`. *Done when:* it throws if a future edit breaks the invariant.
- [ ] **P0-66** — Fix the vent-guild early return. Replace
      `if (g.vent && W.bound[c] !== 0) return 0.15;` with a **multiplier** applied after the
      energy computation: `if (g.vent && W.bound[c] !== 0) ventPenalty = 0.15;` then
      `return Math.max(0, energy * ventPenalty - maint)`. *File:* `redox.js:138`. **[hash]**
      *Done when:* `chemolithotroph` mean density in a 1000-tick deep-time run is **below 0.25**,
      not 0.99.
- [ ] **P0-67** — ⛔ GATE — `node vr/sim/deeptime.mjs --n=32 --ticks=1000`.
      *Done when:* the top-3 guild list changes over the run (e.g. chemolithotroph → methanogen
      → sulfateReducer) instead of being frozen. **This is "the Archean is a competition".**
- [ ] **P0-68** — Diffuse `species` fields laterally: add a 4-neighbour smoothing pass in
      `relaxSpeciesFields` at a per-species rate (fast for dissolved gases, near-zero for
      `orgC`). *Done when:* a vent H₂ plume spreads a few cells instead of being a point.
- [ ] **P0-69** — `node vr/sim/calibrate.mjs`. *Done when:* pass. `seedModernGuilds` runs through
      `guildViable`, so the vent fix touches modern Earth; if `meanLife` fell below `0.05`, raise
      the modern seeding coefficients in `redox.js:79–97` and tag them `fitted`.
- [ ] **P0-70** — Add a Lab readout of the three slowest `species` fields' global means so the
      chemistry's memory is visible, not just asserted. *File:* `main.js` redox card.
      *Done when:* the numbers move over a run.

## 0.F — Make the oxygen gate reachable

Audit §2.2: `purpleSulfur`/`greenSulfur` fitness is structurally zero, so `p(oxyphoto)` is
`1e-4`/tick and ~78 % of runs are permanently anoxic.

- [ ] **P0-71** — Raise the abiotic `H2S` equilibrium in shallow lit seas so anoxygenic
      photosynthesis clears maintenance somewhere: with `yield 0.28` and `maint 0.04` at `T=0.6`,
      `H2S` must exceed ≈`0.18` where `light ≈ 0.9`. Set the shelf equilibrium accordingly and
      tag it `fitted, calibrated so anoxygenic photosynthesis is viable on lit shelves`.
      *File:* `redox.js` species init. *Done when:* `W.guilds.purpleSulfur > 0.02` within
      500 ticks of abiogenesis.
- [ ] **P0-72** — Alternative/additional lever if P0-71 distorts the sulfur budget: lower `maint`
      for photolithotrophs specifically (they do not respire organics), e.g. a per-guild
      `maintScale` field with `0.5` for the two sulfur photosynthesisers. *Done when:* one of
      P0-71/P0-72 gets `purpleSulfur` or `greenSulfur` above `0.02`, and the choice is documented.
- [ ] **P0-73** — ⛔ GATE — `node vr/sim/deeptime.mjs --n=32 --ticks=1500`.
      *Done when:* the guild list includes a sulfur photosynthesiser for at least 200 ticks —
      the "visibly not-green Archean" of evolution backlog item 18.
- [ ] **P0-74** — Rebalance the `oxyphoto` gate now that `pre` can be non-zero. Keep the
      *shape* (`pre > 0.02` → 16× rate) but set the base so that **with** precursors the
      cumulative probability over the Archean window is ~85 %, and **without** them ~10 %.
      Compute the numbers explicitly in a comment (`ticks_in_window × rate`).
      *File:* `redox.js:363–371`. *Done when:* the comment shows the arithmetic.
- [ ] **P0-75** — Remove the hard `ma < 3000` window from the `oxyphoto` gate (a date, forbidden
      by the standing rules) and replace it with the state precondition that actually matters:
      a sustained anoxygenic photosynthesiser population and a lit-shelf area above a threshold.
      *File:* `redox.js:366`. *Done when:* no `ma` reference remains in `maybeInvent` for
      `oxyphoto`.
- [ ] **P0-76** — Do the same for `eukaryote` (`ma < 2100`, `redox.js:385`) and `multicellular`
      (`ma < 800`, `redox.js:404`): replace the date windows with `O2` + duration-above-threshold
      preconditions. *Done when:* `grep -n "ma <" vr/sim/redox.js` returns nothing.
- [ ] **P0-77** — Add `W.transitionAge = {}` recording `ageYr` for each transition as it fires,
      so the ICS ribbon and the Lab can show "your GOE landed 300 Myr late" — the payoff
      promised by evolution backlog item 3. *Done when:* populated for every fired transition.
- [ ] **P0-78** — ⛔ GATE — Run five seeds: `for s in 1 2 3 4 5; do node vr/sim/deeptime.mjs
      --n=32 --ticks=4000 --seed=$s --firsts; done`.
      *Done when:* **at least 3 of 5** reach `T.multicellular`, and **at least 1 of 5** does not
      reach `T.oxygenicPhotosynthesis` (item 19 explicitly wants sterile-ish runs to remain
      possible — a 5/5 pass rate means the gate is now too easy).
- [ ] **P0-79** — Record the five-seed outcome table in `briefs/biosphere-baseline.txt` as the
      Phase 0 exit evidence. *Done when:* the table is committed.

## 0.G — Close Phase 0

- [ ] **P0-80** — `node vr/sim/test.mjs`. *Done when:* 26/26 pass.
- [ ] **P0-81** — Add three tests to `vr/sim/test.mjs`: `nodeOf` round-trips an added lineage;
      `deriveLifeClass` is idempotent (calling twice gives the same array); `species` fields stay
      in `[0,1]` after 20 ticks. *Done when:* 29/29 pass.
- [ ] **P0-82** — `node vr/sim/calibrate.mjs`. *Done when:* pass, all six checks.
- [ ] **P0-83** — Record the new golden hash in `briefs/biosphere-baseline.txt` with a one-line
      reason per hash-moving step (P0-49, P0-50, P0-66, P0-71/72, P0-74).
- [ ] **P0-84** — Open the app (`python3 -m http.server 8765` → `/vr/`), pick a deep-time
      non-Earth world, fast-forward. *Done when:* the Lab diversity card shows the clade count
      rising and the redox tower lights more than one rung over time.
- [ ] **P0-85** — Update `briefs/model-limits.md` §"Life & evolution": state that `lifeClass` and
      `unlockedClass` are now derived compatibility shims, and that `species` fields relax rather
      than reset. *Done when:* the file says so.
- [ ] **P0-86** — Add backlog items to `scripts/evolution.mjs` for the work actually done that
      the 200 did not cover (chemistry memory / relaxation; the id index; derived class).
      Run `node scripts/evolution.mjs`. *Done when:* `briefs/evolution-backlog.md` and
      `site/evolution.html` regenerate together and the item count in the header updates.
- [ ] **P0-87** — Commit. *Done when:* the commit body lists the five hash-moving steps and their
      justification.

---

# PHASE 1 — Module system and derived morphology

**Goal.** A lineage's appearance is a function of its module set. One lineage in a deep-time run
visibly changes silhouette. Nothing is hardcoded to Earth.

**Exit criterion.** `node vr/sim/deeptime.mjs --n=32 --ticks=6000 --firsts` prints at least four
distinct `spriteKind` values across the tree, and at least one lineage whose `morphHash` changed
during its own lifetime.

## 1.A — `modules.js` scaffolding

- [ ] **P1-01** — Create `vr/sim/modules.js`. Export `SLOT`, `SLOT_COUNT`, `SLOTS` (name array).
      *File:* new. Copy the schema from `biosphere-architecture.md §2` verbatim.
- [ ] **P1-02** — Export `OPTIONS` with the eight option arrays from the architecture doc.
      *Done when:* `OPTIONS.habitat[0] === 'ventBenthic'` and every slot's index 0 is the
      ancestral state.
- [ ] **P1-03** — Export `FLAG` with the 24 bit constants. *Done when:* every value is a distinct
      power of two and the highest is `1 << 23`.
- [ ] **P1-04** — Export `OPT_INDEX`: a precomputed `{ slotName: { optionName: index } }` map, so
      no code does `OPTIONS[s].indexOf(x)` at runtime. *Done when:* built once at module load.
- [ ] **P1-05** — Export `hasFlag(node, f)`, `addFlag(node, f)`, `clearFlag(node, f)`,
      `flagNames(flags)`. *Done when:* unit-tested round trip.
- [ ] **P1-06** — Export `getSlot(node, slot)` returning the **option name** (not the index) and
      `setSlot(node, slot, optionName)`. *Done when:* `getSlot` on a fresh node returns the
      ancestral option for every slot.
- [ ] **P1-07** — Export `blankModules()` returning `{ slots: Uint8Array(8), slotLock:
      Uint8Array(8), flags: 0, flagLock: 0 }`. *Done when:* all zeros.
- [ ] **P1-08** — Export `morphHashOf(node)`: a stable 32-bit hash over the 8 slot bytes plus the
      flag word (use the existing `hash2`/imul mixing style from `present.js` for consistency).
      *Done when:* deterministic across runs; two identical module sets hash equal; changing one
      slot changes the hash.
- [ ] **P1-09** — Export `moduleSummary(node)`: a human string like
      `pelagic · pairedFin · gill · spawn · bone · predator · scale · bilateral · +JAW +EYE`.
      *Done when:* used by the Lab panel and `deeptime.mjs --tree`.
- [ ] **P1-10** — Export `moduleDistance(a, b)`: Hamming over slots + popcount of `flags XOR`.
      *Done when:* `moduleDistance(n, n) === 0`.
- [ ] **P1-11** — Export `BIAS_CONST`: every affordance constant from architecture §5 as a named
      value with a provenance tag comment. *Done when:* every number in the file that is not a
      slot index lives in `BIAS_CONST` or `LOCK_TAU`.
- [ ] **P1-12** — Export `LOCK_TAU` per slot (architecture §2.1): symmetry 40, skeleton 120,
      respiration 200, reproduction 180, locomotion 300, habitat 400, trophic 500,
      integument 600 (Myr, invented). *Done when:* tagged.
- [ ] **P1-13** — Export `INCOMPATIBLE`: the ~12 pairs and multipliers from architecture §2.3,
      each with a tag. *Done when:* `morphPenalty` can be computed from it.
- [ ] **P1-14** — Export `morphPenalty(node, env)`: the product of applicable `INCOMPATIBLE`
      multipliers, clamped `[0.05, 1]`. *Done when:* a `terrestrial + gill` node returns ≈0.25.
- [ ] **P1-15** — Add a `Object.freeze` on `OPTIONS`, `FLAG`, `MODULE_GATES`, `INCOMPATIBLE`,
      `BIAS_CONST` at the bottom of the file. *Done when:* mutation attempts throw in strict mode.
- [ ] **P1-16** — Add a self-consistency check function `validateModuleTables()` that asserts:
      every gate's `slot` is in `SLOT`; every `to`/`from` option exists in that slot; every flag
      name in `needs.flags` exists in `FLAG`. Call it from `test.mjs`.
      *Done when:* a deliberate typo in a gate makes the test suite fail with a useful message.

## 1.B — Node storage and inheritance

- [ ] **P1-17** — In `addLineage`, allocate `slots`, `slotLock`, `flags`, `flagLock`, `firsts: []`,
      `diet: []`, `morphHash`, `grade` on the node. *File:* `evolve.js:57–74`.
      *Done when:* every node has them, including LUCA.
- [ ] **P1-18** — `ensureLuca` sets LUCA's modules to the `Vent mat` set from architecture §3.1:
      habitat `ventBenthic`, locomotion `sessile`, respiration `diffusion`, reproduction
      `fission`, skeleton `none`, trophic `chemotroph`, integument `mucus`, symmetry `none`, no
      flags. *File:* `evolve.js:94–112`. *Done when:* `moduleSummary(luca)` matches.
- [ ] **P1-19** — Blank the trait vector to match: `bodyMass` 0.04 (not 0.15) and `repro` 0.92,
      consistent with §3.1. *File:* `evolve.js:26–40`. **[hash]**
      *Done when:* `blankTraits()[TRAITS.bodyMass] === 0.04`.
- [ ] **P1-20** — Add `inheritModules(parent, child)`: copy `slots`, `flags`; copy `slotLock` and
      `flagLock` (locks are inherited, never released); recompute `child.morphHash`.
      *File:* `modules.js`. *Done when:* a child of a locked-symmetry parent is also locked.
- [ ] **P1-21** — Call `inheritModules` from `addLineage` when `parentId` is non-null.
      *Done when:* a speciation child's `moduleSummary` equals the parent's before divergence.
- [ ] **P1-22** — Call `inheritModules` from the adaptive-radiation branch at `evolve.js:225–231`.
      *Done when:* radiation children inherit rather than starting blank.
- [ ] **P1-23** — Fix `TRAITS.thermalOpt` → `TRAITS.tOpt` in `morphology.js:16` (audit §3.6 —
      currently always `undefined`, so `pigmentBias` is a constant 0.5). **[hash]**
      *Done when:* `pigmentBias` varies between lineages.
- [ ] **P1-24** — Add `node.age(W)` helper returning `(W.ageYr - node.birth) / 1e6` in Myr.
      *Done when:* used by the locking logic.
- [ ] **P1-25** — Implement `tickLocks(W, node, rngMod)` per architecture §2.1:
      `lockChance = clamp(ageMyr / LOCK_TAU[slot], 0, 0.95) * (1 - 1/sqrt(pop))`.
      *File:* `modules.js`. *Done when:* a 500-Myr-old lineage has most slots locked.
- [ ] **P1-26** — Auto-lock `MULTICELLULAR`, `AMNIOTE`, `BIOMINERAL`, `ENDOTHERM` into `flagLock`
      the tick after acquisition. *Done when:* those flags are never lost in a 6000-tick run.
- [ ] **P1-27** — Add `W.tree.moduleFirsts = new Map()` — `moduleName → { ageYr, lineageId }`.
      *Done when:* populated by `moduleTick`.
- [ ] **P1-28** — Extend `serializeRun` (`world.js:463`) to include `moduleFirsts` and each
      living node's `moduleSummary`. *Done when:* a downloaded save contains them.

## 1.C — `moduleTick` and the gate engine

- [ ] **P1-29** — Create `MODULE_GATES` in `modules.js` as a frozen array. Start with the
      **eight** gates needed for the Phase 1 exit criterion (microbe → motile → colony → filter
      → bilaterian → jawless → jawed → lobefin); Phase 2 completes the table.
      *Done when:* `validateModuleTables()` passes.
- [ ] **P1-30** — Gate row schema exactly as architecture §2.2: `{ slot, from[], to, needs:
      {flags[], slots{}}, env{}, traits{}, rate, bias[], first, tag }`. Flag-gaining rows use
      `flag:` instead of `slot`/`to`. *Done when:* both shapes are handled by one evaluator.
- [ ] **P1-31** — Implement `lineageEnv(W, node)`: mean over `node.cells` of `temp`, `moist`,
      `intertidal`, `npp`, `reef`, `depth`, `ice`, plus `aquaticFrac`, `landFrac`,
      `shorelineFrac`, and the globals `O2`, `CO2`, `ozone`, `gravity`. Cache per tick per node.
      *File:* `modules.js`. *Done when:* returns a plain object; `null` for a node with no cells.
- [ ] **P1-32** — Implement `envOk(gate, env)`: evaluates `O2min`, `O2max`, `aquatic`,
      `terrestrial`, `ozoneMin`, `nppMin`, `reefMin`, `intertidalMin`, `moistMin`,
      `predationMin`. *Done when:* unit-tested for each key.
- [ ] **P1-33** — Implement `needsOk(gate, node)`: all `needs.flags` present; for each
      `needs.slots` entry, the node's current option is in the allowed list.
      *Done when:* unit-tested.
- [ ] **P1-34** — Implement `traitsOk(gate, node)`: each `traits` entry is a `[lo, hi]` range on a
      `TRAITS` key. *Done when:* unit-tested.
- [ ] **P1-35** — Implement `biasProduct(gate, W, node, env)`: multiplies the named bias functions
      from architecture §5. Unknown bias name → throw (fail loud, not silently 1.0).
      *Done when:* a typo'd bias name fails `validateModuleTables()`.
- [ ] **P1-36** — Implement the bias functions themselves in `modules.js`: `o2Diffusion`,
      `gravityMass`, `o2Headroom`, `intertidalSelect`, `shoreLobefin`, `predationJaw`,
      `reefFilter`, `vacancy`, `uvGate`, `plantSubstrate`, `thermalEndo`. All read only from
      `W`, `node`, `env` — never from the clock. *Done when:* each returns a finite non-negative
      number and each has a provenance tag.
- [ ] **P1-37** — Implement `nicheOccupancy(W, grade, habitat)` for the `vacancy` bias: the
      fraction of living lineages already at that grade in that habitat, normalised by an
      expected count. *Done when:* returns 0 when no lineage occupies the niche.
- [ ] **P1-38** — Implement `predatorBiomassShare(W)` for `predationJaw`: Σ pop×mass of lineages
      with `trophic ∈ {predator, apexPredator}` over total. *Done when:* 0 before predators exist.
- [ ] **P1-39** — Implement `moduleTick(W, chronLog)` in `modules.js`. Iterate `tree.living` in
      array order. For each node: `tickLocks`, build `lineageEnv`, collect eligible gates, score
      each as `p = clamp(rate * dtMyr * biasProduct, 0, 0.6)`.
      *Done when:* returns the number of unlocks that fired.
- [ ] **P1-40** — Enforce **one change per lineage per tick**: pick the single highest-`p` gate,
      roll once against it. *Done when:* no node ever gains two modules in one tick.
- [ ] **P1-41** — Use `rngOf(W, 'rngModules')` for every gate roll and never `W.rng`.
      *Done when:* `grep -n "W.rng" vr/sim/modules.js` returns nothing.
- [ ] **P1-42** — On a successful unlock: apply the slot/flag change, recompute `morphHash`,
      recompute `grade` via `deriveGrade`. *Done when:* `morphHash` differs after an unlock.
- [ ] **P1-43** — On a **planetary first** (module not in `tree.moduleFirsts`): record it, push
      `gate.first` to `node.firsts`, `chronLog(W.year, 'morphology', node.cells[0] ?? 0, 1,
      gate.first + ': ' + node.name)`, and add the module to `W.modulePool`.
      *Done when:* `deeptime.mjs --firsts` lists them in age order.
- [ ] **P1-44** — Call `maybeCaptureMoment(W, 'first' + PascalCase(module), gate.first)` on a
      planetary first, so the run is scrubbable by morphological first (evolution backlog item
      11). *Done when:* `W.moments` gains an entry.
- [ ] **P1-45** — Call `moduleTick(W, chronLog)` from `evolveTick`, **after** the
      selection/mutation loop and **before** `maybeSpeciate`. *File:* `evolve.js:213–219`.
      **[hash]** *Done when:* called once per phylogeny tick.
- [ ] **P1-46** — Add `node.morphPenalty = morphPenalty(node, env)` in `moduleTick`, and fold it
      into `fitness(traits, W, c)` in `evolve.js:128` as a multiplier.
      *Done when:* a `terrestrial + gill` lineage's fitness is ≈0.25× its otherwise-identical
      sibling's.
- [ ] **P1-47** — Add a hard `bodyMass` ceiling from `o2Diffusion` and `gravityMass`: in the
      selection loop, clamp `traits[bodyMass]` to the affordance cap for the node's current
      `respiration` module. *Done when:* a `trachea` lineage at 21 % O₂ cannot exceed
      `0.18 + 1.6 × 0.11 ≈ 0.36`.
- [ ] **P1-48** — ⛔ GATE — `node vr/sim/deeptime.mjs --n=32 --ticks=3000 --firsts`.
      *Done when:* at least three module firsts are logged and each has a plausible
      precondition state (check the O₂ at that age).

## 1.D — Fix trait mutation so bodyMass can move

Audit §2.5: three multiplied suppressions plus a permanent shrink ratchet.

- [ ] **P1-49** — Scale mutation opportunity by **generations elapsed**, not by tick: add
      `generationsPerMyr(node) = 1 / max(1e-3, node.traits[bodyMass])^0.25` (generation time
      scales with mass^¼ — **measured**), and fire mutation when
      `rng() < clamp(0.05 * dtMyr * gens, 0, 0.9) + drift`. *File:* `evolve.js:190–194`.
      **[hash]** *Done when:* microbes mutate far more often per Myr than large animals.
- [ ] **P1-50** — Raise `MUT_RATE[TRAITS.bodyMass]` from `0.008` to `0.03` and tag the change
      with its reason (the realised 4-Gyr range was ±0.05, audit §2.5). *File:* `evolve.js:24`.
      **[hash]** *Done when:* a 3000-tick run shows a `bodyMass` range wider than `0.3`.
- [ ] **P1-51** — Make the Fisher rejection asymmetric: reject 70 % of large steps only when the
      step **reduces** fitness at the lineage's modal cell. Requires evaluating `fitness` before
      and after — cheap, once per mutation event. *File:* `evolve.js:114–126`.
      *Done when:* directional selection can produce sustained size increase.
- [ ] **P1-52** — Replace the unconditional shrink ratchet at `evolve.js:199–202` (currently
      always active because `meanLife < 0.1` throughout, audit §2.5) with an **energy-budget**
      version: shrink only when the lineage's own `preyBiomass/demand` or local `npp` is below its
      maintenance need. *Done when:* a lineage in a high-NPP cell does not shrink.
- [ ] **P1-53** — Add a size **reward**: in `fitness`, a small bonus for `bodyMass` proportional
      to `predationJaw` pressure (bigger is safer) and to `o2Headroom`. Tag `fitted`.
      *Done when:* size increases where predation exists and not where it does not.
- [ ] **P1-54** — Add `W.massSpectrum` — a 12-bin histogram of living lineages by `bodyMass`,
      population-weighted — for the Lab and the probe. *Done when:* printed by `deeptime.mjs`.
- [ ] **P1-55** — ⛔ GATE — `node vr/sim/deeptime.mjs --n=32 --ticks=6000`.
      *Done when:* `massSpectrum` has non-zero counts in at least 4 bins, and max `bodyMass` is
      above `0.5` on at least one seed.
- [ ] **P1-56** — Sanity check the other direction: confirm at least one lineage stays below
      `bodyMass 0.1` for the whole run. *Done when:* microbes persist (they should — they are
      88 % of Earth's history and the most abundant thing on it).
- [ ] **P1-57** — `node vr/sim/calibrate.mjs`. *Done when:* pass. Modern Earth seeds one lineage
      at generate; check `deriveLifeClass` still yields plausible classes for it.
- [ ] **P1-58** — Update `kleiberDensity` (`evolve.js:148`) to use the same mass mapping as the
      new spectrum, and keep its existing test passing. *Done when:* `test.mjs` kleiber test
      still passes.

## 1.E — `bodyPlanFromModules`

- [ ] **P1-59** — Add `bodyPlanFromModules(node, env)` to `vr/sim/morphology.js`. Returns
      `{ silhouette, size, limbs, segments, symmetry, gait, fins, appendage, armour,
      pigmentBias, stride, spriteKind, meshKey, stampKind, morphHash }`.
      *Done when:* returns a plan for LUCA and for each of the three architecture §3 fixtures.
- [ ] **P1-60** — `silhouette` is chosen by a **table**, not an `if` chain: a
      `SILHOUETTE_RULES` array of `{ when: {slots, flags}, silhouette, spriteKind }` evaluated in
      order, most specific first. *Done when:* adding a rung is one array entry.
- [ ] **P1-61** — Populate `SILHOUETTE_RULES` for the 14 animal rungs and 5 plant rungs in
      architecture §4. *Done when:* every rung is reachable from some module combination.
- [ ] **P1-62** — Add a **fallback** rule that always matches, mapping to `MOTILE_MICROBE` or
      `COLONY` by `MULTICELLULAR`. *Done when:* `bodyPlanFromModules` never returns
      `spriteKind === undefined`.
- [ ] **P1-63** — `size` from `bodyMass^0.35 × o2Factor × gravityFactor` (reuse the existing
      formula at `morphology.js:23–25`, which is sound) then multiplied by the `GIGANTISM` /
      `DWARFISM` flags. *Done when:* an archosaur-like node is visibly larger than a sprawler.
- [ ] **P1-64** — `limbs` from the `locomotion` slot: `tetrapodLimb`/`erectGait` → 4,
      `sessile`/`cilia`/`flagella`/`undulation`/`medianFin` → 0, `pairedFin` → 0 with `fins: 3`,
      `wing` → 2 + 2. Arthropod branch (`cuticle` skeleton + `segmented`) → 6 or 8.
      *Done when:* each locomotion option maps to a distinct limb/fin count.
- [ ] **P1-65** — `gait` from `locomotion` + `skeleton`: `sprawl`, `erect`, `serpentine`,
      `undulate`, `flap`, `drift`, `none`. *Done when:* used by the localview animation.
- [ ] **P1-66** — `segments` from `symmetry`: `segmented` → `2 + (bodyMass*6)|0`, else 1.
      *Done when:* a segmented lineage draws visibly segmented.
- [ ] **P1-67** — `armour` from `integument` (`carapace` 0.9, `keratinPlate` 0.8, `scale` 0.5,
      `fur` 0.15, `mucus` 0.05, `bare` 0) times the `ARMOUR_PLATE` flag.
      *Done when:* affects the sprite tint value as `agents.js:102` already expects.
- [ ] **P1-68** — `stride` from `bodyMass^(-1/6)` (Kleiber, already at `morphology.js:33`) times a
      `gait` multiplier. *Done when:* small things move faster than big things on the flat map.
- [ ] **P1-69** — Rewrite `passesSilhouette(plan)` to test that the plan is *drawable*
      (`spriteKind` present, `size ≥ 0.15`) rather than the current heuristic
      (`morphology.js:73`), which rejects valid plans and is why `agents.js:83` throws plans away.
      *Done when:* no valid module set is rejected.
- [ ] **P1-70** — Keep `bodyPlanFromTraits` as a documented shim: synthesise a provisional module
      set from traits (`bodyMass`→symmetry/skeleton, `trophic`→trophic slot, `desiccation`→
      habitat) then delegate to `bodyPlanFromModules`. Mark `@deprecated`.
      *Done when:* `mesh.js:80` and every existing caller still works.
- [ ] **P1-71** — Add `planCache` keyed by `morphHash`, cleared when a node's modules change.
      *Done when:* `bodyPlanFromModules` is O(1) amortised per entity.
- [ ] **P1-72** — Add `inheritMorphology` replacement: delete `morphology.js:62–70` (it locks
      `limbs`/`symmetry` outside the module system) and let `inheritModules` + `slotLock` own
      developmental constraint. *Done when:* one locking mechanism, not two.
- [ ] **P1-73** — Add three tests to `test.mjs` asserting that the three architecture §3 fixtures
      produce the documented `spriteKind`, `limbs`, and `gait`.
      *Done when:* 32/32 pass. **These tests are the contract on the grammar.**
- [ ] **P1-74** — Add a test that `bodyPlanFromModules` is a pure function of
      `(morphHash, bodyMass, O2, gravity)` — same inputs, same plan.
      *Done when:* it passes.

## 1.F — Sprite atlas expansion

- [ ] **P1-75** — Change `ATLAS_COLS` from 4 to 6 in `vr/sprites.js:22`. Verify indices 0–15 are
      unaffected in the drawn output (the tile coordinate maths derives from `ATLAS_COLS`, so
      existing kinds move on the atlas but `drawSprite` follows).
      *Done when:* the flat map draws existing sprites identically.
- [ ] **P1-76** — Confirm the atlas canvas is still square and large enough: `cv.width =
      cv.height = ATLAS_COLS * TILE` gives 768×768 at `TILE = 128`.
      *Done when:* no clipping at index 35.
- [ ] **P1-77** — Add sprite **16 `MAT`** — a low lens-shaped laminated crust, 2–3 bands.
      *Done when:* legible at 8 px.
- [ ] **P1-78** — Add **17 `MOTILE_MICROBE`** — ovoid with a single trailing flagellum.
- [ ] **P1-79** — Add **18 `COLONY`** — a radial cluster of 5–7 lobes.
- [ ] **P1-80** — Add **19 `FILTER_FAN`** — a stalked fan / crinoid-like frond.
- [ ] **P1-81** — Add **20 `WORM_BILATERAL`** — an elongate segmented body, head end thicker.
- [ ] **P1-82** — Add **21 `ARTHROPOD_SMALL`** — segmented with 6 visible legs and antennae.
- [ ] **P1-83** — Add **22 `ARTHROPOD_GIANT`** — same topology, longer body, 8 legs, heavier
      carapace. Must read as *the same clade at a different size* — that is the O₂ story.
- [ ] **P1-84** — Add **23 `SHELLED`** — a coiled or bivalved shell with a small soft part.
- [ ] **P1-85** — Add **24 `FISH_JAWLESS`** — fusiform, median fin only, round mouth, no jaw
      line.
- [ ] **P1-86** — Add **25 `FISH_JAWED`** — fusiform with paired pectoral + pelvic fins and a
      distinct jaw line. Must be distinguishable from 24 at 10 px — that is the whole point.
- [ ] **P1-87** — Add **26 `LOBEFIN`** — stubby fleshy paired fins, broader head, shallow-water
      posture.
- [ ] **P1-88** — Add **27 `SPRAWLER`** — four limbs splayed laterally, belly low, tail.
- [ ] **P1-89** — Add **28 `ERECT_BIPED`** — limbs under the body, horizontal spine, counter
      tail, larger.
- [ ] **P1-90** — Add **29 `FURRED_QUADRUPED`** — four limbs under the body, soft outline.
- [ ] **P1-91** — Add plant rungs **30 `THALLUS`**, **31 `VASCULAR_STEM`**, **32 `TREE_LIGNIN`**,
      **33 `SEEDPLANT`**, **34 `FLOWERING`**. *Done when:* each is distinguishable and the
      existing tree sprites (0, 1) remain for compatibility.
- [ ] **P1-92** — Extend `KIND_RGB` in `vr/sim/lifeColour.js:21` with entries for 16–34.
      *Done when:* no `|| [200,200,200]` fallback is hit for a new kind.
- [ ] **P1-93** — Add a `SPRITE_NAMES` export to `sprites.js` mapping index → name, and use it in
      the Lab and in `deeptime.mjs --tree`. *Done when:* the tree dump shows silhouette names,
      not integers.
- [ ] **P1-94** — Add a dev-only atlas contact sheet: a hidden Lab card rendering all 36 tiles
      with names, so a silhouette regression is visible at a glance.
      *Done when:* reachable and shows 36 tiles.
- [ ] **P1-95** — Silhouette legibility check: render the contact sheet at 10 px per tile.
      *Done when:* the nine watchable rungs from the product goal (mat, motile microbe, filter
      feeder, jawless fish, jawed fish, lobefin, tetrapod, sprawler, large archosaur) are
      distinguishable from each other at that size. If any pair is not, redraw before proceeding.

## 1.G — Wire the picture

- [ ] **P1-96** — In `agents.js:writeEnt`, replace `bodyPlanFromTraits(node.traits, …)` with
      `bodyPlanFromModules(node, env)`. *Done when:* the sprite kind comes from modules.
- [ ] **P1-97** — Remove the `if (!passesSilhouette(plan)) plan = null;` discard at
      `agents.js:83` now that P1-69 makes valid plans pass. *Done when:* plans are always used.
- [ ] **P1-98** — Make `kindForCell` (`agents.js:31–59`) defer to the lineage plan when one
      exists, and only use its terrain heuristics for cells with no lineage (ice, desert,
      settlements). *Done when:* fauna kinds come from phylogeny, flora/terrain kinds from
      terrain.
- [ ] **P1-99** — Pass `m.gait` and `m.stride` into `presentAgents` interpolation so an erect
      biped and a sprawler move differently. *File:* `agents.js:261–288`.
      *Done when:* visibly different on the flat map.
- [ ] **P1-100** — In `localview.js:stampAmbientFauna` (line 1160), replace the
      `cls`-indexed sprite choice with the cell lineage's `plan.stampKind`.
      *Done when:* the flat map draws the actual clade.
- [ ] **P1-101** — In `localview.js:stampFlora` (1088) and `stampOceanLife` (1035), use the
      lineage plan for kind selection where a lineage exists. *Done when:* an Archean shallow sea
      draws mats, not modern reef sprites.
- [ ] **P1-102** — Add `stampMat` usage driven by `W.matCover` **and** by lineages whose
      silhouette is `MAT`. *Done when:* the Archean shoreline has texture (evolution backlog
      item 26).
- [ ] **P1-103** — Update `meshForEntity` (`mesh.js:79`) to key its cache on `plan.morphHash`
      instead of the `limbs-segments-appendage-symmetry` string.
      *Done when:* two lineages with the same hash share a mesh and different hashes do not.
- [ ] **P1-104** — Extend `meshFromPlan` (`mesh.js:7`) to read `gait` and `fins`, adding a fin
      pair and a tail box for aquatic plans. *Done when:* the ground rung shows a fish shape.
- [ ] **P1-105** — Update `lifeLabel` (`lifeColour.js:135`) to return the lineage name + rung
      name when a lineage is present, falling back to guild for microbial-only cells.
      *Done when:* hovering a cell names a clade.
- [ ] **P1-106** — Update `legendKeyAt` (`lifeColour.js:167`) so fauna legend entries key off the
      lineage silhouette rather than `lifeClass >= 3`.
      *Done when:* the legend and the drawn sprites agree.
- [ ] **P1-107** — ⛔ GATE — Browser check. `python3 -m http.server 8765` → `/vr/` → deep-time
      non-Earth world → fast-forward. *Done when:* the flat map's fauna change silhouette at
      least once during the run, and the change coincides with a `morphology` chronicle event.
- [ ] **P1-108** — `node vr/sim/test.mjs` (expect 32+ passing) and `node vr/sim/calibrate.mjs`.
      *Done when:* both pass.
- [ ] **P1-109** — Add `evolutionGolden()` to `headless.mjs` per architecture §9: terra +
      deepTime, seed 42, N=32, 2000 ticks, hashing `{ nodes.length, living.length, Σ morphHash,
      Σ modulePool size, firsts[] }`, run twice, compare. *Done when:* it passes.
- [ ] **P1-110** — Add `evolutionGolden` to `test.mjs`. *Done when:* it is part of the suite and
      its hash is recorded in `briefs/biosphere-baseline.txt`.
- [ ] **P1-111** — Update `briefs/model-limits.md`: modules are ~50 discrete curated states, not a
      GRN; gate rates are fitted per-Myr probabilities; `INCOMPATIBLE` is a 12-row table.
      Add the **Fitted affordance constants** table from architecture §5.
      *Done when:* every `BIAS_CONST` entry has a row.
- [ ] **P1-112** — Add backlog items to `scripts/evolution.mjs` for the module system, the gate
      engine, the affordance biases, and the atlas rungs; regenerate.
      *Done when:* `node scripts/evolution.mjs` updates both outputs.
- [ ] **P1-113** — Commit. *Done when:* the body lists the hash-moving steps (P1-19, P1-23,
      P1-45, P1-49, P1-50) with reasons.

---

# PHASE 2 — Transition gates replace the `LIFE_CLASSES` ladder

**Goal.** Retire the year-gated eight-rung ladder for deep-time worlds. Every rung a player can
see is reached through a state precondition. Evolution backlog items 29–42.

**Exit criterion.** `grep -rn "unlockedClass" vr/` shows reads only (no writes outside the
derived shim), `bio.js` has no year gate, and a five-seed sweep produces **different orderings**
of the same rungs.

## 2.A — Complete the gate table

- [ ] **P2-01** — `symmetry: none → radial`. Needs `MULTICELLULAR`. Env `O2min 0.015`.
      Rate 0.02/Myr. First: "First radial body". *Done when:* fires in a deep-time run.
- [ ] **P2-02** — `symmetry: radial → bilateral`. Needs `TISSUE`. Env `O2min 0.03`.
      Bias `o2Headroom`. Rate 0.015. First: "First bilaterian".
- [ ] **P2-03** — `symmetry: bilateral → segmented`. Needs `GUT`. Rate 0.01.
- [ ] **P2-04** — `symmetry: radial → pentaradial`. Needs `BIOMINERAL`. Bias `reefFilter`.
      Rate 0.008.
- [ ] **P2-05** — Flag gate `MULTICELLULAR`. Needs `W.transitions.eukaryote`. Env `O2min 0.02`,
      `nppMin 0.15`. Rate 0.02. First: "First multicellular body". *Done when:* it also sets
      `W.transitions.multicellular` so the existing readers stay consistent.
- [ ] **P2-06** — Flag gate `TISSUE`. Needs `MULTICELLULAR`. Rate 0.02.
- [ ] **P2-07** — Flag gate `GUT`. Needs `TISSUE`, `symmetry ∈ {bilateral}`. Rate 0.02.
- [ ] **P2-08** — Flag gate `PHOTORECEPTOR`. Needs `TISSUE`. Env light-bearing habitat.
      Rate 0.03.
- [ ] **P2-09** — Flag gate `IMAGE_EYE`. Needs `PHOTORECEPTOR`, `CEPHALIZATION`.
      Bias `predationJaw`. Rate 0.012. First: "First image-forming eye".
- [ ] **P2-10** — Flag gate `CEPHALIZATION`. Needs `symmetry ∈ {bilateral, segmented}`, `GUT`.
      Rate 0.02.
- [ ] **P2-11** — Flag gate `BIOMINERAL`. Needs `MULTICELLULAR`. Env `O2min 0.08` and
      `W.carbon.omegaAragonite > 1.5` (the condition already used at `redox.js:411`).
      Rate 0.02. First: "First biomineralised skeleton".
- [ ] **P2-12** — Flag gate `JAW`. Needs `CEPHALIZATION`, `skeleton ∈ {cartilage, bone}`.
      Bias `predationJaw`. Rate 0.015. First: "First jaw".
- [ ] **P2-13** — Flag gate `TEETH`. Needs `JAW`, `BIOMINERAL`. Rate 0.03.
- [ ] **P2-14** — Flag gate `ARMOUR_PLATE`. Needs `BIOMINERAL`. Bias `predationJaw`. Rate 0.02
      — the defensive half of the arms race, so it co-escalates with `JAW`.
- [ ] **P2-15** — `skeleton: none → hydrostatic`. Needs `MULTICELLULAR`. Rate 0.04.
- [ ] **P2-16** — `skeleton: hydrostatic → cuticle`. Needs `symmetry segmented`. Rate 0.02.
- [ ] **P2-17** — `skeleton: hydrostatic → cartilage`. Needs `TISSUE`, `symmetry bilateral`.
      Env `O2min 0.05`. Rate 0.015.
- [ ] **P2-18** — `skeleton: cartilage → bone`. Needs `BIOMINERAL`. Env `O2min 0.06`. Rate 0.015.
- [ ] **P2-19** — `skeleton: * → shell`. Needs `BIOMINERAL`, `symmetry ∈ {radial, pentaradial}`.
      Bias `reefFilter`. Rate 0.02.
- [ ] **P2-20** — `skeleton: bone → pneumaticBone`. Needs `PNEUMATIC`, `airSac` respiration.
      Bias `gravityMass`. Rate 0.01.
- [ ] **P2-21** — `skeleton: hydrostatic → lignin`. Needs `VASCULAR`, `trophic phototroph`.
      Env `terrestrial`. Rate 0.015. First: "First woody tissue" — this is the carbon-burial
      trigger the Carboniferous story needs.
- [ ] **P2-22** — `locomotion: sessile → cilia`, `cilia → flagella`, `flagella → undulation`.
      Rates 0.05 / 0.05 / 0.03. All need only `MULTICELLULAR` for the last.
- [ ] **P2-23** — `locomotion: undulation → medianFin`. Needs `symmetry bilateral`, `skeleton
      ∈ {cartilage, bone}`. Env `aquatic`. Rate 0.02.
- [ ] **P2-24** — `locomotion: medianFin → pairedFin`. Needs `skeleton ∈ {cartilage, bone}`.
      Bias `o2Headroom`, `predationJaw`. Rate 0.018. First: "First paired appendages".
- [ ] **P2-25** — `locomotion: pairedFin → tetrapodLimb`. Needs `respiration ∈ {lung, skin}`,
      `skeleton bone`. Env `intertidalMin 0.12`, `ozoneMin 0.15`. Bias `shoreLobefin`,
      `intertidalSelect`, `plantSubstrate`. Rate 0.012. First: "First limbs on land".
      **This is the single most important row in the table.**
- [ ] **P2-26** — `locomotion: tetrapodLimb → erectGait`. Needs `AMNIOTE`. Env `terrestrial`.
      Bias `vacancy`, `o2Headroom`, `gravityMass`. Rate 0.010.
      First: "First erect gait". *Done when:* it fires only after an extinction opens the niche
      on at least one seed, and does not fire on a seed where the niche stays full.
- [ ] **P2-27** — `locomotion: tetrapodLimb → serpentine`. Needs `symmetry bilateral`.
      Rate 0.008 — limb loss is a real and repeated transition; allow it.
- [ ] **P2-28** — `locomotion: * → wing`. Needs `PNEUMATIC` or (`cuticle` and low mass).
      Bias `gravityMass`, `o2Diffusion`. Rate 0.006. First: "First powered flight".
- [ ] **P2-29** — `locomotion: pairedFin → jet`. Needs `hydrostatic`. Rate 0.01.
- [ ] **P2-30** — `respiration: diffusion → gill`. Needs `MULTICELLULAR`, `symmetry ∈
      {bilateral, segmented}`. Env `O2min 0.02`, `aquatic`. Traits `bodyMass ≥ 0.18`.
      Bias `o2Headroom`. Rate 0.012. First: "First gill".
- [ ] **P2-31** — Flag gate `COUNTERCURRENT`. Needs `gill`. Bias `o2Headroom`. Rate 0.02 — the
      efficiency step that lets gill-breathers get big.
- [ ] **P2-32** — `respiration: gill → skin`. Env `moistMin 0.35`, `intertidalMin 0.10`.
      Bias `intertidalSelect`. Rate 0.015.
- [ ] **P2-33** — `respiration: {gill, skin} → lung`. Env `O2min 0.06`, `intertidalMin 0.12`.
      Bias `intertidalSelect`, `o2Headroom`. Rate 0.012. First: "First lung".
- [ ] **P2-34** — `respiration: diffusion → trachea`. Needs `cuticle`, `symmetry segmented`.
      Env `terrestrial`, `ozoneMin 0.15`. Bias `o2Diffusion`, `plantSubstrate`. Rate 0.015.
- [ ] **P2-35** — `respiration: diffusion → bookLung`. Needs `cuticle`. Env `terrestrial`.
      Rate 0.010.
- [ ] **P2-36** — `respiration: lung → airSac`. Needs `AMNIOTE`. Bias `o2Headroom`,
      `gravityMass`. Rate 0.008. Sets `PNEUMATIC` as a side effect.
      First: "First flow-through lung".
- [ ] **P2-37** — `reproduction: fission → spore`. Needs `MULTICELLULAR`. Rate 0.04.
- [ ] **P2-38** — `reproduction: spore → spawn`. Env `aquatic`. Rate 0.03.
- [ ] **P2-39** — `reproduction: spawn → anamnioticEgg`. Needs `TISSUE`. Env `moistMin 0.3`.
      Rate 0.02.
- [ ] **P2-40** — `reproduction: anamnioticEgg → amnioticEgg`. Env `terrestrial`,
      `moistMax 0.45`. Traits `desiccation ≥ 0.45`. Bias `intertidalSelect`. Rate 0.012.
      Sets `AMNIOTE`. First: "First shelled egg" — the step that frees land from water.
- [ ] **P2-41** — `reproduction: {amnioticEgg, anamnioticEgg} → liveBirth`. Needs
      `PARENTAL_CARE`. Rate 0.006.
- [ ] **P2-42** — `reproduction: spore → seed`. Needs `VASCULAR`, `trophic phototroph`.
      Env `terrestrial`. Rate 0.012. Sets `SEEDPLANT`. First: "First seed".
- [ ] **P2-43** — `habitat` gates: `ventBenthic → shelfBenthic` (needs `phototroph` or
      `filter`; env `nppMin 0.2`); `shelfBenthic → pelagic` (needs a swimming locomotion);
      `shelfBenthic → intertidal` (env `intertidalMin 0.08`); `intertidal → terrestrial`
      (env `ozoneMin 0.15`, bias `uvGate`, `plantSubstrate`); `intertidal → freshwater`;
      `terrestrial → aerial` (needs `wing`). *Done when:* all six rows exist and validate.
- [ ] **P2-44** — `trophic` gates: `chemotroph → phototroph` (needs the planet to have invented
      photosynthesis, i.e. `modulePool` contains it); `phototroph → osmotroph`;
      `osmotroph → filter` (bias `reefFilter`); `filter → detritivore`;
      `detritivore → grazer` (needs prey biomass); `grazer → predator` (needs `JAW` or `VENOM`,
      bias `predationJaw`); `predator → apexPredator` (needs `preyBiomass` headroom and
      `vacancy`). *Done when:* all seven rows exist.
- [ ] **P2-45** — `integument` gates: `bare → mucus`; `mucus → scale` (env `terrestrial`, bias
      `intertidalSelect`); `mucus → carapace` (needs `cuticle`); `scale → keratinPlate`;
      `scale → filament` (needs `AMNIOTE`, bias `thermalEndo`); `filament → fur` (needs
      `ENDOTHERM`). *Done when:* all six rows exist.
- [ ] **P2-46** — Flag gates for the plant branch: `VASCULAR` (needs `MULTICELLULAR` +
      `phototroph` + `terrestrial`), `ROOT` (needs `VASCULAR`, raises `W.soil` production),
      `FLOWER` (needs `SEEDPLANT` + an animal lineage with `wing` or `ARTHROPOD` silhouette in
      overlapping range — coevolution as a precondition). *Done when:* three rows exist and
      `FLOWER` cannot fire without a pollinator-shaped lineage present.
- [ ] **P2-47** — Flag gates `ENDOTHERM` (needs `airSac` or `lung` + `COUNTERCURRENT`; bias
      `thermalEndo`, `o2Headroom`; first "First warm blood"), `PARENTAL_CARE`, `SOCIAL`,
      `VENOM`, `SWIM_BLADDER`, `GIGANTISM` (bias `o2Diffusion`, `gravityMass`, `vacancy`),
      `DWARFISM` (bias island-area from `speciesArea`). *Done when:* all seven exist.
- [ ] **P2-48** — ⛔ GATE — `validateModuleTables()` passes and
      `node vr/sim/deeptime.mjs --n=32 --ticks=8000 --firsts` logs **at least 12** distinct
      module firsts on a good seed. *Done when:* true.

## 2.B — Retire the ladder

- [ ] **P2-49** — Delete the year-gated ladder block at `bio.js:137–144`
      (`W.year >= (unlockedClass + 1) * 5000`). **[hash]**
      *Done when:* `grep -n "yearsNeeded" vr/sim/bio.js` returns nothing.
- [ ] **P2-50** — Delete `LIFE_CLASSES` from `bio.js:10–19` and `envelopeOk` at `bio.js:21–29`.
      Move the eight grade *names* to `lifeclass.js` as `GRADES` (they are still the display
      vocabulary; only the envelope logic dies). **[hash]**
      *Done when:* `grep -rn "LIFE_CLASSES" vr/` hits only `lifeclass.js` and its importers.
- [ ] **P2-51** — Update the five `LIFE_CLASSES` importers (`world.js:10`, `world.js:501`,
      `lifeColour.js:5`, `main.js`, `god/life.js`) to import `GRADES` from `lifeclass.js`.
      *Done when:* the app loads without a console error.
- [ ] **P2-52** — Rewrite `deriveGrade(node)` (P0-46) to read **modules**: grade 0 no
      `MULTICELLULAR`; 1 eukaryote-equivalent; 2 `MULTICELLULAR` + `phototroph`; 3 `cuticle` +
      `segmented`; 4 `gill` + aquatic; 5 `lung` + `anamnioticEgg`; 6 `AMNIOTE`; 7 `ENDOTHERM`.
      *Done when:* the three architecture §3 fixtures return 0, 4, 5 and the bonus returns 6.
- [ ] **P2-53** — Rewrite `unlockedClassFromPool(W)` to take the **max grade over living
      lineages**, so the legacy scalar tells the truth about the planet instead of about a set of
      global booleans. *Done when:* it rises as lineages advance and can fall after an extinction.
- [ ] **P2-54** — Keep `W.transitions` as the record of **planetary one-off inventions**
      (abiogenesis, oxygenic photosynthesis, eukaryote, aerobic respiration, plastid, sex) —
      genuinely global chemistry/information events. Move the **body-plan** ones (multicellular,
      biomineral, landPlants, endothermy) to `modulePool`, keeping the `transitions` booleans as
      derived mirrors so nothing breaks. *Done when:* `redox.js:maybeInvent` no longer decides
      body plans, and the existing readers of `T.multicellular` still work.
- [ ] **P2-55** — Keep the `earthLike && !deepTime` short-circuit: modern Earth pre-populates
      `modulePool` with everything and seeds representative lineages.
      *Done when:* `calibrateEarth` passes and `unlockedClass` is ≥6 on modern Earth.
- [ ] **P2-56** — Seed modern Earth's tree with 6–10 representative lineages spanning grades
      0–7 (one per major rung) instead of a single LUCA, so the calibrated present has a
      plausible biosphere rather than one clade. *File:* `earth.js` / `seedEarthBiosphere`.
      *Done when:* `calibrateEarth` passes and the flat map on modern Earth shows varied fauna.
- [ ] **P2-57** — ⛔ GATE — `node vr/sim/calibrate.mjs`. *Done when:* all six checks pass with
      the multi-lineage seed.
- [ ] **P2-58** — Remove `LIFE_CLASSES` `minO2`/`tMin`/`mMin` envelope influence from
      `agents.js:kindForCell` where it still leaks in via `W.lifeClass[c] >= 4` (line 43) and
      `>= 6` (line 56). Replace with silhouette checks. *Done when:* no numeric class comparison
      remains in `agents.js`.
- [ ] **P2-59** — Same for `localview.js:944` (`const cls = W.lifeClass?.[c]`) and its five uses.
      *Done when:* the flat map keys off silhouette.
- [ ] **P2-60** — Same for `city.js` and `god/scenario.js` single uses.
      *Done when:* `grep -rn "unlockedClass" vr/` shows only reads of the derived shim, all
      commented as compatibility.

## 2.C — Verify no dates and no Earth-copying

- [ ] **P2-61** — `grep -rn "maBP\|W.year\|ageYr" vr/sim/modules.js vr/sim/lifeclass.js`.
      *Done when:* the only hits are `dtYr` for rate scaling and `node.birth` for age-based
      locking. Any other hit is a scripted date and must be removed.
- [ ] **P2-62** — Audit `redox.js:maybeInvent` for the remaining `ma` windows after P0-75/76.
      *Done when:* zero remain.
- [ ] **P2-63** — Audit `extinction.js:maybeNamedExtinctions` (lines 133, 141, 153). These *are*
      date-gated Earth analogues. **Keep them, but gate them behind `rule.earthAnalogueEvents`**
      (default true for `terra`, false for exoworlds), and document the flag.
      *Done when:* a non-Earth deep-time world gets no named Earth extinctions.
- [ ] **P2-64** — Add `--seeds=N` to `deeptime.mjs` running N seeds and printing a comparison
      table of the age of each module first. *Done when:* it runs 5 seeds and tabulates.
- [ ] **P2-65** — ⛔ GATE — `node vr/sim/deeptime.mjs --n=32 --ticks=10000 --seeds=5 --firsts`.
      *Done when:* the **ordering** of at least two firsts differs between seeds (e.g. one seed
      gets `trachea` before `lung`, another the reverse). Identical ordering on all five seeds
      means the gate table is a script with extra steps.
- [ ] **P2-66** — Same sweep on a **non-Earth** ruleset with different gravity and O₂ ceiling.
      *Done when:* at least one seed produces `ARTHROPOD_GIANT` as the largest animal instead of
      a tetrapod — the "insect giants, no dinosaurs" outcome the brief asks for.
- [ ] **P2-67** — Same sweep on a low-gravity high-O₂ world. *Done when:* `GIGANTISM` fires
      earlier (in state terms, not clock terms) than on the baseline.
- [ ] **P2-68** — Same sweep on a world with `totalWater` high enough that `shorelineFrac` is
      tiny. *Done when:* `tetrapodLimb` does **not** fire — no shore, no land invasion.
- [ ] **P2-69** — Record all four sweeps in `briefs/biosphere-baseline.txt` as the Phase 2 exit
      evidence. *Done when:* committed.
- [ ] **P2-70** — `node vr/sim/test.mjs`. *Done when:* all pass, including `evolutionGolden`
      (whose hash will have moved — record it).
- [ ] **P2-71** — Update `briefs/model-limits.md`: the eight-rung ladder is retired for deep
      time; `unlockedClass` is max living grade; Earth-analogue named extinctions are behind a
      ruleset flag. *Done when:* stated.
- [ ] **P2-72** — Add backlog items for the retired ladder and the affordance sweeps to
      `scripts/evolution.mjs`; regenerate; commit.

---

# PHASE 3 — Speciation that matters, and the 200-clade target

**Goal.** A full run lands 50–300 living lineages with a plausible extinct/living ratio, splits
produce visible differences, and the chronicle logs morphological firsts the player can scrub to.

**Exit criterion.** Five seeds, full run: living lineages ∈ [50, 300], total nodes ∈ [150, 900],
and the Lab tree panel lets a player click a clade and see its range and modules.

## 3.A — Module divergence on split

- [ ] **P3-01** — Add `habitatContrast(W, compA, compB)` to `evolve.js`: normalised 0–1 from
      sea/land mismatch, mean `temp` delta, depth class, `intertidal` delta, `moist` delta.
      *Done when:* returns 1 for a land/sea split and near 0 for two adjacent shelf patches.
- [ ] **P3-02** — In `maybeSpeciate`, compute `contrast` and set
      `pModule = clamp(0.25 + 0.6 * contrast, 0, 1) * vacancyBias`.
      *File:* `evolve.js:289–315`. *Done when:* logged by the probe.
- [ ] **P3-03** — On a module-divergence success, evaluate the gate table **against the child's
      component cells only** and apply the single highest-scoring available gate.
      *Done when:* an island population diverges toward its own habitat, not the parent's.
- [ ] **P3-04** — On failure to find any gate, apply a deliberately large single-trait step
      (`3σ` on the least-locked trait, Fisher rejection bypassed once).
      *Done when:* every split changes something measurable.
- [ ] **P3-05** — After divergence, recompute `child.morphHash`. If it equals the parent's, force
      a change on the least-locked slot. *Done when:* asserted in a test —
      `parent.morphHash !== child.morphHash` for every speciation event in a 2000-tick run.
- [ ] **P3-06** — Replace the `child.locked` ad-hoc `Uint8Array` at `evolve.js:310–311` with the
      module system's `slotLock` (P1-25). *Done when:* one locking mechanism.
- [ ] **P3-07** — Remove the `break` at `evolve.js:312` so a lineage split across four islands
      can produce more than one daughter per tick, capped at 3.
      *Done when:* archipelago radiation is possible.
- [ ] **P3-08** — Raise the `pop < 8` speciation floor (`evolve.js:293`) to a **range**-based
      test: at least 2 components each with ≥3 cells. *Done when:* small widespread lineages can
      split and small localised ones cannot.
- [ ] **P3-09** — Use `rngOf(W, 'rngSpec')` for all speciation draws. *Done when:* no `W.rng` in
      `maybeSpeciate`.
- [ ] **P3-10** — Make `connectedComponents` (`evolve.js:317`) barrier-aware for real: a
      neighbour is connected only if it is the same medium **and** within the lineage's thermal
      breadth **and** not separated by ice. *Done when:* a lineage spanning a mountain range or
      an ice sheet splits.
- [ ] **P3-11** — Use `NBR8` instead of `NBR` in `connectedComponents` so diagonal connectivity
      does not create spurious barriers at cube-face seams. *Done when:* contiguity improves.
- [ ] **P3-12** — Add `node.rangeArea` (Σ `AREA[c]` over `node.cells`) and use it in the
      endemism check at `meta.js:122` instead of the raw `pop < 12`.
      *Done when:* endemism is area-based, resolution-independent.
- [ ] **P3-13** — Add `speciationEvents` and `extinctionEvents` counters per Myr on
      `W.tree` for rate tuning. *Done when:* printed by `deeptime.mjs`.
- [ ] **P3-14** — ⛔ GATE — `node vr/sim/deeptime.mjs --n=32 --ticks=6000`.
      *Done when:* every logged speciation has a different `morphHash` from its parent, and the
      probe reports both rates.

## 3.B — Trophic web and cascades

- [ ] **P3-15** — Replace `updateFoodWeb` (`ecology.js:203–223`, O(living²)) with
      `assignDiet(W, node)` scoring candidates by `trophicDelta × massRatioFit × rangeOverlap`
      and keeping the top 3. *Done when:* `node.diet.length ≤ 3` for every lineage.
- [ ] **P3-16** — Sample candidates with a stride so `assignDiet` is O(living × 3), not
      O(living²). *Done when:* `scale.mjs` at 250 lineages shows no regression.
- [ ] **P3-17** — Implement `rangeOverlap(a, b)`: Jaccard of the two cell sets, computed from a
      per-lineage cell `Set` built once per tick. *Done when:* 0 for disjoint ranges.
- [ ] **P3-18** — Implement `preyBiomass(W, node)` per architecture §7.
      *Done when:* 0 for a lineage whose prey are all extinct.
- [ ] **P3-19** — Implement `demand(node) = bodyMass^0.75 × pop` (Kleiber).
      *Done when:* reuses `kleiberDensity`'s mass mapping.
- [ ] **P3-20** — Add the prey-availability multiplier to `fitness()` for grazer/predator/apex
      trophic slots: `clamp(preyBiomass/demand, 0.15, 1.2)`.
      *Done when:* a predator in a prey-poor region has visibly lower fitness.
- [ ] **P3-21** — Implement the cascade: `node._starve` accumulates while
      `preyBiomass/demand < 0.2`; at `> CASCADE_TAU` (2 Myr, invented) extinguish with reason
      `'trophic collapse'`. *File:* `extinction.js`. *Done when:* killing a prey lineage with a
      god tool extinguishes its predators within a few Myr.
- [ ] **P3-22** — Cap the trophic pyramid: reject a `predator → apexPredator` gate when
      `preyBiomass/demand < 1.5`, so a four-level pyramid requires the productivity to support
      it. *Done when:* apex predators only appear in high-NPP worlds.
- [ ] **P3-23** — Rebuild `W.foodWeb.links` from `node.diet` for the Lab card.
      *Done when:* the card still renders and the link count is ≤ `3 × living`.
- [ ] **P3-24** — Add a `foodWeb` Lab card showing the trophic pyramid as biomass per level,
      derived from lineage grades rather than the three global scalars at `ecology.js:145–148`.
      *Done when:* the pyramid narrows during a recovery (the truncation already modelled at
      `extinction.js:44–48`).
- [ ] **P3-25** — Add `--trophic` to `deeptime.mjs` printing levels, mean links, and cascade
      count. *Done when:* it runs.
- [ ] **P3-26** — ⛔ GATE — Kill the most abundant primary producer lineage mid-run via a probe
      hook. *Done when:* at least one dependent lineage dies of `'trophic collapse'` within
      5 Myr, and the chronicle says so.

## 3.C — Rate tuning to the 50–300 target

- [ ] **P3-27** — Add `--sweep` to `deeptime.mjs`: run the same seed with a multiplier on
      speciation rate ∈ {0.25, 0.5, 1, 2, 4} and tabulate final living/total.
      *Done when:* the table prints.
- [ ] **P3-28** — Run the sweep at N=32 for 12,000 ticks. *Done when:* you have five data points.
- [ ] **P3-29** — Pick the speciation-rate multiplier whose median landing is ~120 living.
      *Done when:* the chosen constant is in `evolve.js` tagged
      `// provenance: fitted — targets 50–300 living lineages over a full run`.
- [ ] **P3-30** — Sweep background extinction hazard (`evolve.js:205`, currently `0.0002 * dt`)
      the same way. *Done when:* extinct/living ratio lands ∈ [2, 5] (Earth's is ~1000:1 over the
      full record, but the model runs far fewer lineages; 2–5 is the honest toy target and must
      be **stated** in `model-limits.md`, not implied).
- [ ] **P3-31** — Verify diversity is not monotonic: it should fall at mass extinctions and
      recover. *Done when:* `tree.diversityHistory` shows at least two ≥30 % drops on a full run.
- [ ] **P3-32** — Verify the `latDiversity` gradient is positive (equatorial > polar) on an
      Earth-like world. *File:* `meta.js:55`. *Done when:* `gradient > 0` at the end of a run.
- [ ] **P3-33** — Verify `speciesArea` produces a positive area–richness slope.
      *Done when:* the top-10 islands' richness correlates with area.
- [ ] **P3-34** — Add `--assert` to `deeptime.mjs` enforcing the exit criteria (living ∈
      [50,300], total ∈ [150,900], ≥12 firsts, ≥4 sprite kinds, ≥2 diversity crashes) and exiting
      non-zero on failure. *Done when:* it fails loudly on a bad seed.
- [ ] **P3-35** — ⛔ GATE — `for s in 1 2 3 4 5; do node vr/sim/deeptime.mjs --n=32
      --ticks=12000 --seed=$s --assert; done`. *Done when:* **at least 4 of 5** pass. Record all
      five outcomes.
- [ ] **P3-36** — Run the same at N=64 for one seed to confirm the tuning is not
      resolution-dependent. *Done when:* living count is within 2× of the N=32 result. If not,
      the rates are coupled to cell count and must be normalised by `AREA`.
- [ ] **P3-37** — If P3-36 fails, normalise every per-cell rate in `evolve.js` and `modules.js`
      by `AREA[c]` or by `NC`, and re-tune. *Done when:* N=32 and N=64 agree within 2×.
- [ ] **P3-38** — `node vr/sim/scale.mjs` at 300 lineages, N=64.
      *Done when:* ms/tick < 250 — the phylogeny tick must stay inside the frame budget that
      `multiRateMask` gives it.
- [ ] **P3-39** — Rewrite `detectConvergence` to use `moduleDistance` (P1-10) with a threshold of
      ≤2 slot differences and non-relatedness, keeping the P0-28 stride.
      *Done when:* it reports non-zero convergences on a full run — currently 0 (audit §3.5).
- [ ] **P3-40** — Log a `convergence` chronicle event with both clade names and the shared module
      set. *Done when:* the Chronicle shows "X and Y independently arrived at
      pairedFin · gill · predator".

## 3.D — Chronicle and the Lab tree panel

- [ ] **P3-41** — Extend `phylogenyView(W)` (`instruments.js:199`) with `slots`, `flags` (as
      names), `grade`, `spriteKind`, `morphHash`, `firsts`, `diet`, `rangeArea`, `endemic`,
      `morphPenalty`. *Done when:* the returned nodes carry everything the panel needs.
- [ ] **P3-42** — Add `treeLayout(view)` computing x = age, y = a stable slot per lineage from a
      depth-first walk. *Done when:* deterministic for a given tree.
- [ ] **P3-43** — Add `phyloTreeSVG(view, opts)` to `vr/sim/viz.js` drawing the tree with
      branches, extinction crosses, and a silhouette glyph per living tip.
      *Done when:* renders at 280×220 without overlap at 120 lineages.
- [ ] **P3-44** — Collapse the tree above a lineage-count threshold: aggregate sibling tips into
      a wedge with a count. *Done when:* legible at 300 lineages.
- [ ] **P3-45** — Add a `Phylogeny` Lab card calling `phyloTreeSVG`. *File:* `main.js:1464`
      `refreshLab`. *Done when:* the card appears in the Lab panel.
- [ ] **P3-46** — Make tips clickable: set `S.selectedClade = id`.
      *Done when:* clicking changes the selection state.
- [ ] **P3-47** — On selection, tint `node.cells` on the globe with `cladeRGB(id)` (P0-38) via a
      new overlay. *Done when:* clicking a clade highlights its range.
- [ ] **P3-48** — On selection, show a module table (`moduleSummary` broken into rows with locked
      slots marked) below the tree. *Done when:* locked slots are visually distinct.
- [ ] **P3-49** — On selection, show the clade's `firsts` list with jump-to-age buttons that scrub
      the run to `W.moments['first' + X]`. *Done when:* clicking a first moves the view.
- [ ] **P3-50** — Add a **morphological firsts strip** across the full run age axis, drawn from
      `W.chron` `'morphology'` events, with silhouette glyphs.
      *Done when:* the mat → microbe → filter → jawless → jawed → lobefin → tetrapod sequence is
      readable as one image. **This is the primary Phase 3 deliverable.**
- [ ] **P3-51** — Add the selected clade's diversity-through-time sparkline from
      `diversityHistory` filtered to its subtree. *Done when:* rendered.
- [ ] **P3-52** — Add a `chronicle` event kind `'morphology'` to the chronicle's kind list and
      give it an icon and colour. *File:* `vr/chronicle.js`, `lifeColour.js:MOMENT_RGB`.
      *Done when:* the events render distinctly in the Chronicle panel.
- [ ] **P3-53** — Add clade search / filter in the Lab card (by name, grade, silhouette).
      *Done when:* typing filters the tip list.
- [ ] **P3-54** — Show extinct clades as ghosts, toggleable. *Done when:* the toggle works and
      extinct tips show their `extReason` on hover.
- [ ] **P3-55** — Add a "follow this clade" button wiring `S.followClade = id`, used in Phase 5.
      *Done when:* the state is set.
- [ ] **P3-56** — Extend `exportPaper` (`instruments.js:239`) with a morphological-firsts table
      and the final clade list with module summaries.
      *Done when:* the exported markdown includes both.
- [ ] **P3-57** — ⛔ GATE — Browser check: deep-time world, fast-forward to a rich tree.
      *Done when:* you can click a clade, see its range light up on the globe, read its modules,
      and jump to the age it acquired `pairedFin`.
- [ ] **P3-58** — `node vr/sim/test.mjs` — add tests for `treeLayout` determinism,
      `moduleDistance` symmetry, and speciation always changing `morphHash`.
      *Done when:* all pass.
- [ ] **P3-59** — `node vr/sim/calibrate.mjs`. *Done when:* pass.
- [ ] **P3-60** — Record the Phase 3 five-seed sweep and the new `evolutionGolden` hash in
      `briefs/biosphere-baseline.txt`. *Done when:* committed.
- [ ] **P3-61** — Update `briefs/model-limits.md`: state the extinct/living ratio target and that
      it is far below Earth's; state the 200-clade target is diversity, not 200 silhouettes.
- [ ] **P3-62** — Add the **Deep Time Express** flag from architecture §10: when
      `rule.expressTicks`, clamp `dtYr` to ≥`2e4` once `maBP < 2.58`, removing ~12,800 of 22,800
      ticks. *File:* `vr/sim/time.js:adaptiveTickYears`.
      *Done when:* a full run completes in ≈4 min at N=32 and `calibrateEarth` (which does not
      set the flag) is unaffected.
- [ ] **P3-63** — Expose Express as a Lab toggle with an honest label ("skips Pleistocene detail;
      evolution unaffected"). *Done when:* toggleable and labelled.
- [ ] **P3-64** — Add backlog items for the tree panel, the firsts strip, the trophic cascade,
      and Express to `scripts/evolution.mjs`; regenerate; commit.

---

# PHASE 4 — Patch sub-cell state and reproduction

**Goal.** `living-backlog` item 24 (`patchsim`) plus lineage-level births and deaths, so
individuals belong to a clade permanently and the tile rung is derived, never invented.

**Exit criterion.** In the focused patch, individuals are drawn from the cell's `popId`, are born
and die as members of that lineage, and nothing drawn below cell resolution contradicts the cell
state above it (`living-backlog` item 55).

## 4.A — `patchsim` state

- [ ] **P4-01** — Create `vr/sim/patch.js`. Export `PATCH = { focus, radius, sub, fields }` where
      `sub` is the sub-cells-per-tile edge count (start 4 → 16 sub-cells/tile).
      *File:* new.
- [ ] **P4-02** — Allocate patch fields as `Float32Array(tiles × sub × sub)` for `h`, `moist`,
      `life`, `soil`, `water`, `wear`. *Done when:* allocated on focus change, not per frame.
- [ ] **P4-03** — Implement `seedPatch(W, focusCell, radius)`: derive every sub-cell from its
      parent cell plus a stable `hash2(cell, subIndex)` seed.
      *Done when:* re-seeding the same focus gives byte-identical fields.
- [ ] **P4-04** — Derive sub-cell `h` by bilinear interpolation of the four parent-cell
      neighbours plus seeded noise scaled by local relief (`living-backlog` item 28).
      *Done when:* the flat map shows intra-tile slope.
- [ ] **P4-05** — Assert the derivation constraint: `mean(sub h over a tile) === W.h[c]` within
      `1e-4`. *Done when:* a test enforces it. **This is the rule that stops the ground rung
      disagreeing with the planet.**
- [ ] **P4-06** — Same constraint for `moist`, `life`, `soil`. *Done when:* four assertions pass.
- [ ] **P4-07** — Cache patch topology (`living-backlog` item 12): `unwrapPatch`'s BFS result is
      keyed on `(focus, radius, simN)` and reused. *File:* `vr/localview.js`.
      *Done when:* the BFS runs on focus change only, verified by a counter.
- [ ] **P4-08** — Implement `patchTick(W, dt)`: sub-cell water routing down the derived gradient,
      grazing depletion, and regrowth. *Done when:* it runs at 60 fps for radius 12.
- [ ] **P4-09** — Route sub-cell water into visible channels crossing tile edges
      (`living-backlog` item 29). *Done when:* a river enters one tile edge and leaves another.
- [ ] **P4-10** — Standing water in local depressions (`living-backlog` item 151).
      *Done when:* puddles appear after rain and drain.
- [ ] **P4-11** — Sub-cell microclimate: slope aspect, hollows, coastal moderation
      (`living-backlog` item 164). *Done when:* north-facing sub-cells hold snow longer.
- [ ] **P4-12** — Feed sub-cell `life` back into the parent cell as a **read-only diagnostic**,
      never as an authority. *Done when:* disabling `patchTick` does not change `W.life`.
- [ ] **P4-13** — Run `patchTick` only for the focused patch, on the presentation clock, outside
      `simTick`. *Done when:* `goldenRun` hash is **unchanged** by patch code existing.
- [ ] **P4-14** — ⛔ GATE — `node vr/sim/headless.mjs --golden`.
      *Done when:* the hash matches the Phase 3 value exactly. Patch state must be presentation
      only.

## 4.B — Lineage births and deaths

- [ ] **P4-15** — Add `node.births` and `node.deaths` counters, reset per Myr.
      *Done when:* populated.
- [ ] **P4-16** — Give each entity a `lineageId` at spawn from `popId[c]` (already added in
      P0-34) and make it **immutable** except by the cell-change path (P0-36).
      *Done when:* an entity's lineage never changes without a move.
- [ ] **P4-17** — Implement `reproduceEntity(m, rng)` in `agents.js`: an entity spawns an
      offspring in its own or a neighbouring cell when `life[c]` and `npp[c]` clear a threshold
      and the lineage's `repro` trait rolls. *Done when:* new entities appear with the parent's
      lineage.
- [ ] **P4-18** — Cap reproduction by the lineage's Kleiber density so a big-bodied clade is
      rarer per cell than a small one. *Done when:* entity counts per lineage scale as
      `mass^-0.75`.
- [ ] **P4-19** — Replace the blanket `topUpEntities` stride fill (`agents.js:168–184`) with
      reproduction as the primary source of new individuals, keeping top-up only as a floor when
      `ENT.n` collapses. *Done when:* population changes are driven by births, not by a scan.
- [ ] **P4-20** — Give offspring a name only when the lineage has `PARENTAL_CARE` or `SOCIAL`,
      so naming means something. *File:* `agents.js:118`. *Done when:* microbes are unnamed.
- [ ] **P4-21** — Extend the death path (`agents.js:409–417`) with age-based mortality scaled by
      `bodyMass` (bigger lives longer — **measured** allometry).
      *Done when:* small-bodied entities turn over visibly faster.
- [ ] **P4-22** — Add predation deaths: an entity of a predator lineage in a cell containing an
      entity of a prey lineage in its `diet` kills it, at a rate from the encounter probability.
      *Done when:* the Chronicle logs predation deaths and prey counts fall locally.
- [ ] **P4-23** — Log a `death` chronicle event only for named individuals (already the case) but
      add an aggregate per-Myr mortality readout for the rest.
      *Done when:* the Chronicle does not flood.
- [ ] **P4-24** — Aggregate entity births/deaths into `node.births`/`node.deaths` and use the
      ratio as an *input* to lineage extinction hazard, so the individual layer feeds the lineage
      layer instead of merely illustrating it. *Done when:* a lineage whose entities all starve
      goes extinct.
- [ ] **P4-25** — Guard against the reverse coupling being unstable: clamp the hazard
      contribution and verify a 12,000-tick run still lands in the 50–300 band.
      *Done when:* P3-34's `--assert` still passes.
- [ ] **P4-26** — Add `familyGroup`: entities of a `SOCIAL` or `PARENTAL_CARE` lineage cohere,
      reusing the existing flocking code at `agents.js:345–372` (currently gated on
      `kind === 6/14/15/7`). Re-gate it on the lineage's flags instead.
      *Done when:* social clades flock and solitary ones do not.
- [ ] **P4-27** — Add juvenile scale: an entity's drawn size ramps from 0.4× to 1× over its early
      life. *Done when:* visible on the flat map.
- [ ] **P4-28** — Place individuals at sub-cell positions from `patch.js` when the patch is
      focused, so they stand on the derived terrain rather than at cell centres.
      *Done when:* entities sit on slopes and beside water.
- [ ] **P4-29** — Make foraging deplete sub-cell `life` and recover over time
      (`living-backlog` item 108). *Done when:* a herd leaves a visible grazed mark.
- [ ] **P4-30** — ⛔ GATE — Browser check with a focused patch on a deep-time world with fauna.
      *Done when:* individuals of a named clade are born, forage, deplete cover, and die, and the
      Chronicle records it.

## 4.C — Verify

- [ ] **P4-31** — `node vr/sim/headless.mjs --golden`. *Done when:* unchanged from Phase 3
      (entities are presentation).
- [ ] **P4-32** — Confirm agents do not write to sim fields except the two existing sanctioned
      cases (`build` at `agents.js:321`, worm bioturbation at `agents.js:405`).
      *Done when:* `grep -n "W\.[a-z]*\[c\] =" vr/agents.js` shows only those.
- [ ] **P4-33** — If P4-29's depletion writes `W.life`, move it to the patch field instead.
      *Done when:* the golden hash is unaffected.
- [ ] **P4-34** — Add a test that `seedPatch` is deterministic and that the tile-mean constraint
      holds. *Done when:* passes.
- [ ] **P4-35** — Add a test that entity `lineageId` is stable across 100 `agentsTick`s for a
      non-moving entity. *Done when:* passes.
- [ ] **P4-36** — Profile the patch path. *Done when:* radius 12 at `sub = 4` holds 60 fps.
- [ ] **P4-37** — Add an LOD rule: `sub` drops to 2 at radius > 16 and patch individuals are not
      drawn at radius > 20 (that is the regional rung's job).
      *Done when:* the widest patch still holds frame rate.
- [ ] **P4-38** — Add the patch scale bar and area readout (`living-backlog` item 18).
      *Done when:* the strip names the real width in km.
- [ ] **P4-39** — Update `briefs/model-limits.md`: `patchsim` is derived-from-cell presentation
      state with a mean-preservation constraint; it is not a nested simulation and does not feed
      back into the coarse grid. *Done when:* stated.
- [ ] **P4-40** — Add backlog items to `scripts/living.mjs` (not `evolution.mjs` — this is the
      living/presentation backlog) for patchsim, reproduction, family groups; regenerate
      `briefs/living-backlog.md` and `site/living.html`. *Done when:* both update.
- [ ] **P4-41** — `node vr/sim/test.mjs` and `node vr/sim/calibrate.mjs`.
      *Done when:* both pass.
- [ ] **P4-42** — Commit.

---

# PHASE 5 — Living-backlog integration

**Goal.** The presentation layers named in the brief: follow a lineage, a life panel that shows
clade + modules, and a dawn chorus organised by acoustic niche.

## 5.A — Follow a lineage

- [ ] **P5-01** — Replace `followTarget` (`agents.js:426–434`) — which returns the first named
      settler — with `followTarget(preferLineage)` honouring `S.followClade` from P3-55.
      *Done when:* following a clade picks one of its individuals.
- [ ] **P5-02** — On the followed individual's death, hand off to another individual of the same
      lineage rather than dropping the follow. *Done when:* the camera stays with the clade.
- [ ] **P5-03** — If the lineage goes extinct while followed, show its eulogy (the mechanism at
      `extinction.js:181–183` already exists) and offer its nearest living relative.
      *Done when:* the handoff message names both clades.
- [ ] **P5-04** — Add a follow HUD strip: clade name, grade, rung silhouette, module summary,
      age, population. *Done when:* it renders and updates.
- [ ] **P5-05** — Show the followed lineage's position on the phylogeny card as a marker.
      *Done when:* the marker moves when the follow changes.
- [ ] **P5-06** — Add "follow the oldest lineage" and "follow the largest" quick actions.
      *Done when:* both work.
- [ ] **P5-07** — Persist the follow selection across a resolution change.
      *Done when:* changing N keeps the clade selected (the entity will be respawned).
- [ ] **P5-08** — ⛔ GATE — Browser check. *Done when:* you can pick a clade in the Lab tree,
      press follow, and watch its individuals for several Myr including at least one handoff.

## 5.B — Life panel

- [ ] **P5-09** — Extend the cell-inspect panel to show: dominant lineage name, grade, silhouette,
      module summary, `firsts`, `diet`, `rangeArea`, endemism, `morphPenalty`, and the cell's
      guild mix. *Done when:* clicking a cell shows all of it.
- [ ] **P5-10** — Show the cell's `cladeCount` and list the co-occurring lineages.
      *Done when:* a diverse cell lists several.
- [ ] **P5-11** — Show `whatHappenedHere(W.chron, c, 2)` filtered to biological events including
      the new `'morphology'` kind. *Done when:* local evolutionary history is readable.
- [ ] **P5-12** — Show the cell's fossil slots (`W.fossils[c]`, written by
      `meta.js:recordFossil`) with names, ages, and reasons — the core sample already has a UI
      shape to borrow. *Done when:* a depositing cell shows its fossils.
- [ ] **P5-13** — Show `W.traces[c]` (trace fossils) as a burrow-density readout.
      *Done when:* rendered.
- [ ] **P5-14** — Add "what is this?" glossary links for every module name via
      `defineTerm` (`glossary.js`). *Done when:* `gill`, `amnioticEgg`, `airSac` etc. all
      resolve, with terms added to the glossary where missing.
- [ ] **P5-15** — Update `legendEntries` (`lifeColour.js:149`) to include the new silhouette
      rungs present in the current view. *Done when:* the legend reflects what is on screen.
- [ ] **P5-16** — Make the legend live per `living-backlog` item 231: each entry shows its share
      of the patch. *Done when:* shares sum to ~1 and change as the world changes.
- [ ] **P5-17** — ⛔ GATE — Browser check. *Done when:* clicking any cell answers "what lives
      here, what is it, where did it come from, and what died here" without a console.

## 5.C — Acoustic niche

- [ ] **P5-18** — Add `acousticNiche(node)` to `modules.js`: a frequency band and a rhythm class
      derived from `bodyMass` (larger → lower — **measured**), `habitat`, `respiration`
      (`airSac` → sustained, `trachea` → stridulation), and `SOCIAL`.
      *Done when:* returns `{ band, rhythm, gain }`.
- [ ] **P5-19** — Assert niche separation: two lineages in the same cell with the same band get
      one nudged, so the chorus is layered rather than a smear.
      *Done when:* a diverse cell yields distinct bands.
- [ ] **P5-20** — Drive `vr/audio.js` voices from the lineages actually present in the focused
      patch, weighted by population. *Done when:* an Archean patch is silent apart from water and
      wind, and a forested one is layered.
- [ ] **P5-21** — Gate voices on `isOutNow(kind, c, id)` (`present.js`) so the chorus follows the
      diel cycle. *Done when:* dawn and dusk sound different.
- [ ] **P5-22** — Add a dawn-chorus swell: gain rises as the terminator crosses the patch.
      *Done when:* audible.
- [ ] **P5-23** — Fall silent for an extinct clade within one Myr of its death.
      *Done when:* the soundscape thins after a mass extinction. **This is the most affecting
      thing in the phase; do not skip it.**
- [ ] **P5-24** — Add water/wind beds from wave height and wind speed (`living-backlog`
      items 139, 159) so silence is never total. *Done when:* a sterile world still sounds like a
      place.
- [ ] **P5-25** — Respect `reducedMotion` / an audio-off preference throughout.
      *Done when:* no sound when disabled.
- [ ] **P5-26** — ⛔ GATE — Browser check across four ages of one run.
      *Done when:* Archean, post-GOE, post-land-plants, and post-extinction are audibly
      distinguishable with your eyes closed.

## 5.D — Documentation and close-out

- [ ] **P5-27** — Update `briefs/model-limits.md` fully: modules, gates, biases, patchsim,
      acoustic niche, the extinct/living ratio, and the express flag. Every `BIAS_CONST` has a
      row in the fitted-constants table. *Done when:* a reader can tell exactly what is claimed.
- [ ] **P5-28** — Update `README.md` with the new probes and the deep-time demo path.
      *Done when:* copy-pasteable.
- [ ] **P5-29** — Update `PURPOSE.md` if the product claim has sharpened.
      *Done when:* it matches what the build does.
- [ ] **P5-30** — Add backlog items to `scripts/evolution.mjs` for everything in Phases 2–3 that
      the original 200 did not anticipate. Run `node scripts/evolution.mjs`.
      *Done when:* both outputs regenerate and the header count is right.
- [ ] **P5-31** — Add backlog items to `scripts/living.mjs` for follow-lineage, the life panel,
      and the acoustic niche. Run `node scripts/living.mjs`.
      *Done when:* both outputs regenerate.
- [ ] **P5-32** — Check `site/evolution.html` and `site/living.html` render correctly after
      regeneration. *Done when:* both load and the critical-path tables are populated.
- [ ] **P5-33** — Add a `briefs/biosphere-runbook.md`: the exact commands and expected outputs
      for the demo path, so the result is reproducible by someone who was not here.
      *Done when:* someone else can follow it.
- [ ] **P5-34** — ⛔ GATE — **The watchable demo.** Deep-time non-Earth world, Express on,
      fast-forward to present. *Done when:* all six hold:
      (a) the Archean shows competing guilds and a non-green surface;
      (b) the Lab phylogeny card shows a branching tree with >50 living tips;
      (c) the morphological-firsts strip reads mat → microbe → filter feeder → jawless →
      jawed → lobefin → tetrapod, or a defensible alternative ordering;
      (d) at least one clade visibly changes silhouette during its own lifetime;
      (e) at least two diversity crashes with named causes;
      (f) the flat map at the end shows several distinguishable rungs at once.
- [ ] **P5-35** — Record the demo run's seed, ruleset, and firsts table in the runbook.
      *Done when:* committed.
- [ ] **P5-36** — `node vr/sim/test.mjs`, `node vr/sim/calibrate.mjs`,
      `node vr/sim/headless.mjs --golden`, `node vr/sim/deeptime.mjs --assert` on five seeds.
      *Done when:* all green.
- [ ] **P5-37** — Final `briefs/biosphere-baseline.txt` update with every hash and every sweep.
      *Done when:* the file tells the whole story from the Phase 0 baseline to here.
- [ ] **P5-38** — Re-read `briefs/biosphere-audit.md` and mark each finding fixed or explicitly
      deferred with a reason. *Done when:* no finding is silently unaddressed.
- [ ] **P5-39** — Commit.

---

# PHASE 6 — Stretch: rewind and fork the tape

Evolution backlog item 12. Nearly free because of the existing determinism.

- [ ] **P6-01** — Add `snapshotWorld(W)` capturing every `NC` field, `gases`, `transitions`,
      `modulePool`, the full tree (nodes with modules), `popId`, `rngState`, `ageYr`.
      *File:* new `vr/sim/snapshot.js`. *Done when:* returns a structured-cloneable object.
- [ ] **P6-02** — Add `restoreWorld(W, snap)`. *Done when:* restore-then-tick reproduces the
      original continuation hash exactly.
- [ ] **P6-03** — Add a test: snapshot at tick 100, run to 200, restore, run to 200 again.
      *Done when:* both 200-tick states hash identically.
- [ ] **P6-04** — Auto-snapshot at every captured moment (`W.moments`), capped by a ring buffer
      sized to memory. *Done when:* a run holds ~12 snapshots without a memory problem.
- [ ] **P6-05** — Add a snapshot-size guard: refuse and warn above a byte budget at high N.
      *Done when:* N=128 warns instead of dying.
- [ ] **P6-06** — Add `forkAt(snap, label)` using `forkWorldSeed` (`evolve.js:382`, already
      written) to derive a divergent stream. *Done when:* two forks from one snapshot diverge.
- [ ] **P6-07** — Verify the fork diverges *only* through RNG: identical planet, identical
      chemistry, different draws. *Done when:* the first tick after the fork has identical
      fields and a different `rngState`.
- [ ] **P6-08** — Add a fork UI: pick a moment from the timeline, press Fork.
      *Done when:* it forks.
- [ ] **P6-09** — Run both branches to the present in the background at N=32.
      *Done when:* both complete.
- [ ] **P6-10** — Add a divergence view: the two morphological-firsts strips stacked, aligned on
      the fork age. *Done when:* the strips visibly diverge.
- [ ] **P6-11** — Extend `diffRuns` (`instruments.js:225`) to compare module firsts, final clade
      counts, and max grade. *Done when:* it reports module-level differences.
- [ ] **P6-12** — Add a "did it happen again?" readout: for each first in branch A, whether
      branch B also got it and at what age.
      *Done when:* rendered as a two-column table. **This is Gould's experiment, mechanised.**
- [ ] **P6-13** — Run 10 forks from the same pre-Cambrian-equivalent moment.
      *Done when:* you have 10 outcomes tabulated.
- [ ] **P6-14** — Report which modules are **convergent** (appear in most forks) and which are
      **contingent** (appear in few). *Done when:* the table exists.
- [ ] **P6-15** — Sanity-check the result against the design intent: chemistry-driven modules
      (`gill`, `lung`) should be highly convergent; niche-driven ones (`erectGait`, `GIGANTISM`)
      should be contingent. *Done when:* the pattern holds, or the gate table is adjusted with a
      documented reason.
- [ ] **P6-16** — Add the convergence/contingency table to `exportPaper`.
      *Done when:* included.
- [ ] **P6-17** — Add a Lab card summarising the fork comparison.
      *Done when:* rendered.
- [ ] **P6-18** — Update `briefs/model-limits.md`: forks diverge only through the RNG stream;
      this is a demonstration that the model is generative, not a claim about real evolutionary
      contingency. *Done when:* stated.
- [ ] **P6-19** — Add backlog items for snapshot/fork/divergence to `scripts/evolution.mjs`;
      regenerate. *Done when:* both outputs update.
- [ ] **P6-20** — `node vr/sim/test.mjs` and `node vr/sim/calibrate.mjs`; commit.

---

## Risk register

| Risk | Signal | Response |
|---|---|---|
| Modern Earth calibration breaks | `calibrate.mjs` fails on `meanLife` | Only `0.045` of headroom below the current `0.08476`. Compensate in `redox.js:seedModernGuilds` coefficients, tagged `fitted`. Never widen the tolerance. |
| Golden hash churn hides a real regression | Hash moves on a step not marked `[hash]` | Stop. An unexpected hash change means an unintended behaviour change. Bisect before continuing. |
| Phylogeny tick blows the frame budget | `scale.mjs` > 250 ms at 250 lineages | P0-11..P0-28 are the mitigation. If still slow, reduce `phyEvery` in `multiRateMask` and accept coarser phylogeny at deep `dt`. |
| Gate table becomes a script | All five seeds produce identical orderings (P2-65) | Raise bias weights relative to base rates so state dominates. If a gate never fires without its Earth-typical predecessor, its `needs` are too strict. |
| Diversity runs away or collapses | `--assert` fails outside [50, 300] | P3-27..P3-30 sweeps. Prefer tuning extinction hazard over speciation rate — it is the more stable lever. |
| Rates are resolution-coupled | N=32 and N=64 disagree > 2× (P3-36) | Normalise per-cell rates by `AREA`/`NC` (P3-37). Do this before Phase 4, not after. |
| Silhouettes are indistinguishable | P1-95 fails at 10 px | Redraw before wiring. A body-plan system whose outputs look alike delivers nothing, however correct the model. |
| Patch state leaks into the sim | Golden hash moves in Phase 4 | P4-13/P4-31/P4-33. Patch is presentation, permanently. |
| Full-run validation is too slow to iterate on | Sweeps take longer than a coffee | N=32 plus Express (P3-62) puts a full run at ~4 min. Never validate at N=64 except as a final check. |

## Sequencing rationale

Phase 0 first because audit §2 proves Phases 1–5 are unverifiable without it: the run does not
reach the states they describe, so any module system built first would be untested code.

Phase 1 before Phase 2 because the gate engine needs somewhere to write and something to draw;
eight gates and fourteen silhouettes prove the pipeline end to end before forty more gates are
added on top of an unproven mechanism.

Phase 2 before Phase 3 because tuning diversity rates against the wrong body-plan model would
have to be redone.

Phase 3 before Phase 4 because individuals should belong to a tree that already has the right
shape; wiring reproduction to a 24-lineage tree teaches you nothing about a 200-lineage one.

Phase 4 before Phase 5 because follow, the life panel, and the chorus all read individual and
patch state.

Phase 6 last because it is a demonstration of everything above, and it is cheap once the rest
holds.

## Step count

Phase 0: 87 · Phase 1: 113 · Phase 2: 72 · Phase 3: 64 · Phase 4: 42 · Phase 5: 39 ·
Phase 6: 20 — **437 steps**, 23 of them ⛔ gates.

Verify with:

```bash
grep -c '^- \[ \] \*\*P' briefs/biosphere-plan.md
```
