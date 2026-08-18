# ORRERY — biosphere audit

**Hand-written. Not generated.** Evidence base for `biosphere-architecture.md` and `biosphere-plan.md`.
Every claim below was measured against the tree at commit `d9e6d47`, not read off the source.

---

## 1. Baselines to preserve

| Check | Command | Result at `d9e6d47` |
|---|---|---|
| Unit + golden + calibrate | `node vr/sim/test.mjs` | **26 passed, 0 failed** |
| Golden run hash (terra, seed 42, 40 ticks, N=64) | `node vr/sim/headless.mjs --golden` | `6988c6c4d431afd0` |
| Golden snapshot | — | meanTemp `0.51425`, meanLife `0.061927`, O₂ `0.20950`, ageYr `4.567e9` |
| Modern Earth calibration | `node vr/sim/calibrate.mjs` | **pass** — meanTemp `0.5602`, landFrac `0.2886`, iceFrac `0.0718`, O₂ `0.2095`, CO₂ `523.95` ppm, meanLife `0.08476` |
| Σ cell area sanity | any run | N=64 rel err `3.69e-3 %`, N=32 rel err `1.48e-2 %` |

Record these in the plan's Phase-0 checklist. Any change to `redoxTick`/`bioTick`/`evolveTick`
will move the golden hash; **that is expected and must be justified in the commit body**, not
silenced. The calibration tolerances are the real guard rail: `meanLife ∈ [0.04, 0.45]` has only
`0.045` of headroom below the current value, so anything that reduces microbial biomass needs a
compensating coefficient.

---

## 2. The headline finding: deep time never leaves the Archean

Probe (`terra`, `deepTime: true`, seed `20260808`, N=32, `simTick(true)` in a loop):

| tick | Ma BP | dtYr | meanLife | O₂ | living | total | `unlockedClass` | bodyMass min–max | transitions |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 4477 | 1e7 | 0.029 | 0 | 0 | 0 | 0 | — | *(none)* |
| 500 | 2193 | 2e6 | 0.040 | 0 | 18 | 18 | 0 | 0.138 – 0.181 | abiogenesis, rnaWorld, luca |
| 1500 | 797 | 5e5 | 0.037 | 0 | 21 | 22 | 0 | 0.108 – 0.204 | abiogenesis, rnaWorld, luca |
| 2500 | 492 | 1e5 | 0.021 | 0 | 15 | 22 | 0 | 0.103 – 0.195 | abiogenesis, rnaWorld, luca |
| 3000 | 442 | 1e5 | 0.021 | 0 | 15 | 22 | 0 | 0.103 – 0.195 | abiogenesis, rnaWorld, luca |
| 4500 | 292 | 1e5 | 0.022 | 0 | 16 | 23 | 0 | 0.103 – 0.195 | abiogenesis, rnaWorld, luca |
| 5500 | 192 | 1e5 | 0.022 | 0 | 15 | 24 | 0 | 0.101 – 0.180 | abiogenesis, rnaWorld, luca |
| 9500 | 11.3 | 2e4 | 0.012 | 0 | 16 | 25 | 0 | 0.102 – 0.180 | abiogenesis, rnaWorld, luca |
| 11999 | **2.2** | 200 | **0.008** | **0** | 16 | **25** | **0** | 0.088 – 0.189 | **abiogenesis, rnaWorld, luca** |

`lifeClass` histogram is `{0: 6144}` — *every cell, every sample, all the way to the Pleistocene*.
`convergences` is `0` at every sample. `meanLife` **declines monotonically** from `0.040` at
2193 Ma to `0.008` at 2.2 Ma: the biosphere is not stagnant, it is slowly dying.

So the honest statement of where the biosphere is: **it is not that evolution runs and looks boring.
Evolution does not run.** A 4.4-billion-year run produces ~24 lineages that differ from LUCA by
about ±0.05 of one trait, and the transition ladder stops at `luca` forever. Everything the
evolution backlog builds downstream of `oxyphoto` — eukaryotes, multicellularity, biomineral,
land plants, endothermy — is unreachable on the path the product is supposed to showcase.

Five independent causes, each individually sufficient. All five must be fixed before any
module system can be observed to work.

### 2.1 `seedVentChemistry` erases the redox tower's memory every tick

`vr/sim/redox.js:158` calls `seedVentChemistry(W)` as the first statement of `redoxTick`, and that
function **assigns** (not accumulates) all nine donor and nine acceptor fields from the current
gas mixing ratios and bathymetry:

```js
species.H2S[c] = isSea ? 0.03 : 0.002;      // redox.js:105
species.orgC[c] = W.life[c] * 0.3;          // redox.js:115
species.Fe2[c] = isSea ? (W.fe2Ocean || 0.3) : 0.01;
```

Everything the guilds did to the chemistry last tick is discarded. Sulfate reducers push
`H2S` up at `redox.js:231` and the Canfield ocean is wiped before anything can read it. The
`orgC` accumulator written at `redox.js:280` (`life*0.4 + orgC*0.9`) is overwritten by
`life*0.3` at the top of the next tick. Only `W.fe2Ocean` and `W.bifRock` survive, because they
live outside `species`.

Backlog item 13 promises "it gives the chemistry a memory." The chemistry currently has none.

### 2.2 Anoxygenic photosynthesis can never establish, so oxygenic photosynthesis never fires

`guildViable` (`redox.js:134`) computes `energy = g.yield * donor * acc * (0.6 + T*0.5)` against
`maint = 0.04 + max(0, 0.5 - T) * 0.08`. For `purpleSulfur` (yield `0.28`, donor `H2S`) at the
baseline seeded ocean value `H2S = 0.03`:

```
energy ≈ 0.28 × 0.03 × light × 0.85  ≈  0.0071 × light   <   0.04 = maint
```

`fit = 0` for every non-vent cell, at every temperature, forever. Measured: `purpleSulfur` and
`greenSulfur` never appear in the top-three guild means at any sample point.

That matters because `maybeInvent` gates oxygenic photosynthesis on those precursors
(`redox.js:363–371`):

```js
const pre = (W.guilds.purpleSulfur || 0) + (W.guilds.greenSulfur || 0);
const p = pre > 0.02 ? 0.0008 * dt : 0.00005 * dt;
```

With `pre ≡ 0` and `dt` capped at `2`, `p = 1e-4` per tick. Over the ~2,500 ticks the run
spends inside the `ma < 3000` window that is a **~22 % chance of ever inventing oxygenic
photosynthesis**. Roughly four runs in five are permanently anoxic — and then *correctly*
never reach eukaryotes, because `T.eukaryote` needs `T.aerobicRespiration` needs `O2 > 0.01`.

This is one number pretending to be a design decision. Item 19 wants "some runs never get
oxygen and are correct not to." It currently reads as "most runs never get oxygen and there is
no mechanism by which they could have."

### 2.3 Vent guilds saturate the entire planet

`redox.js:138`:

```js
if (g.vent && W.bound[c] !== 0) return 0.15;   // "weak away from vents"
```

That is an early `return` **before** the donor/acceptor and maintenance checks. So
`chemolithotroph` gets a flat fitness of `0.15` in every non-vent cell on the planet and grows
at `0.15 × 0.15 × dt` until it clamps. Measured: `chemolithotroph` mean density is `0.99–1.00`
from tick 250 onward — a global monoculture at saturation.

Consequence: `cellBio` is dominated everywhere by one guild's `yield × density`, `dominantGuildAt`
returns `chemolithotroph` for the whole globe, `lifeRGB` paints one colour, and the redox tower
readout in Lab is a single lit rung. The Archean is not "guild competition"; it is one guild.

### 2.4 `species.CO2` is off the 0–1 scale the rest of the model assumes

`redox.js:113`: `species.CO2[c] = W.gases.CO2 * 20`. Deep-time Earth generates with
`CO2 = 0.12` (`world.js:137`), so `species.CO2 = 2.4`. Every other field in `species` is
0–1 and `guildViable` multiplies donor × acceptor without normalising, so any CO₂-accepting
guild gets a silent 2.4× thumb on the scale, and the ratio between guilds is wrong by an amount
that varies with the greenhouse. Same class of problem at `redox.js:108`
(`CH4 * 10`) and `redox.js:114` (`O2 * 0.7` for sea vs `O2` for land, which is a legitimate
solubility sketch and should be labelled as one).

### 2.5 `bodyMass` is effectively unmutable, so nothing can ever change shape

Three multiplied suppressions in `evolveTick`:

1. **Fire rate.** `evolve.js:192` mutates a lineage only when `rng() < 0.05*dt + drift*0.02`.
2. **Step size.** `MUT_RATE[TRAITS.bodyMass] = 0.008` (`evolve.js:24`) — the second-smallest of eleven.
3. **Fisher rejection.** `evolve.js:121–122` rejects 70 % of steps larger than `1.5σ`, i.e. most of the tail.

Measured outcome over 4.4 Gyr: `bodyMass` spans `0.101 – 0.204` across all living lineages,
against a blank-slate start of `0.15`. The realised range after four billion years of evolution
is **±0.05**. Since `spriteFromPlan` (`morphology.js:52`) branches at `mass < 0.2`, `mass > 0.7`,
and `trop > 0.65`, and `trophic` measured max is `0.203`, **every lineage in every run maps to
sprite kind 9 or 0** — "sparse / micro". The morphology grammar is wired up and unreachable.

There is also a ratchet working against size at `evolve.js:199–202`: when
`complexity > 0.5 && meanLife < 0.1`, `bodyMass *= 0.99`. Measured `meanLife` sits at
`0.021–0.040` for the whole run, so that clause is *always* active — a permanent downward
pressure on body size with no counterweight, because nothing in the model rewards being big.

---

## 3. Structural problems that will bite at the 200-clade target

### 3.1 `tree.nodes.find()` inside per-cell loops is an O(NC × living²) wall

`evolve.js` uses linear scans over `tree.nodes` in five places, two of which are inside loops
over all cells:

```js
// evolve.js:168–182  — per cell
for (let c = 0; c < NC; c++) { const n = tree.nodes.find((x) => x.id === id); ... }

// evolve.js:255–267  — per cell, per living lineage, each doing a find()
for (let c = 0; c < NC; c++) {
  for (const id of tree.living) {
    const node = tree.nodes.find((x) => x.id === id);   //  ← NC × living × nodes
```

At the measured current scale (24 nodes) this is invisible. At the **product target of 50–300
living lineages** and `NC = 24576`, the inner loop is `24576 × 200 × 400 ≈ 2×10⁹` comparisons
*per phylogeny tick*. The 200-clade goal is not reachable without an id→node index. This is the
single highest-leverage line of Phase 0.

Measured tick cost today, for budgeting: **155 ms/tick at N=64** (300 ticks of deep-time terra
in 46.4 s wall) and **29 ms/tick at N=32** (12,000 ticks in 347.7 s wall). A full
4.567 Ga → present run is **≈22,800 ticks** under `adaptiveTickYears` (57 Hadean + 300 Archean
+ 750 + 918 + 4,750 + 3,171 + 12,840 Pleistocene), i.e. **~59 minutes headless at N=64** and
**~11 minutes at N=32**. Note that **56 % of all ticks are spent in the last 2.58 Myr** at
`dtYr = 200` — the Pleistocene tail dominates the run cost and contributes nothing to
macro-evolution. Any plan that requires watching a full run to validate a change needs an N=32
express path with that tail collapsed.

### 3.2 Agents are paired to phylogeny by an arithmetic coincidence

`agents.js:76`:

```js
const id = W.tree.living[(c + n) % W.tree.living.length];
```

The lineage an individual belongs to is `(cell index + entity slot) mod living count`. It is
recomputed on every `writeEnt`, so an agent's clade changes whenever the living count changes,
and two agents in the same cell get different clades. `W.popId[c]` — which exists, is
maintained by `evolveTick`, and is the correct answer — is never read by `agents.js`. The same
expression is repeated at `agents.js:105` to derive the "stable clade colour", so the tint is
not stable either.

`popId` has exactly three consumers today (`evolve.js`, `god/life.js`, `meta.js`) and zero on
the presentation side.

### 3.3 `lifeClass` has three competing writers

| Writer | Line | Basis |
|---|---|---|
| `redoxTick` → `classFromTransitions` | `redox.js:263`, `316–325` | global `W.transitions` + dominant guild + sea/land |
| `bioTick` → `envelopeOk` loop | `bio.js:60–67`, `84`, `97`, `107` | per-cell climate envelope, clamped to `W.unlockedClass` |
| `seedLife`, `god/life.js:273`, `earth.js` | various | direct assignment to `W.unlockedClass` |

`redoxTick` runs before `bioTick` in `simTick` (`world.js:396–397`), so `bioTick` wins on any
cell where an envelope passes and loses on cells where it does not — which means the field is a
blend of two incompatible definitions. Ten files read it (`lifeColour`, `localview`, `agents`,
`tools`, `gaia`, `earth`, `god/life`, `main`, `bio`, `redox`).

### 3.4 `unlockedClass` is a global scalar standing in for per-lineage state

Nine writes in `redox.js` (`440–446`), plus `god/life.js:208–210` bumping it as a *reward*, plus
the year-gated legacy ladder at `bio.js:137–144` (`W.year >= (unlockedClass+1) * 5000`). A
single planet-wide integer decides what body plans are permitted anywhere. Two lineages on
opposite sides of an ocean cannot be at different grades of organisation, which is the central
thing a phylogeny is for.

### 3.5 Speciation produces name changes, not body changes

`maybeSpeciate` (`evolve.js:289–315`) splits on connected components and then calls
`mutate(node.traits, rng)` — the same tiny per-trait jitter as within-lineage drift — plus a
30 % chance of `trophic += 0.15`. `cladeName` derives a pronounceable string from
`bodyMass` and `trophic`. So a speciation event yields a new row in the Lab diversity card and
no observable difference on the globe, in the flat map, or in the sprite atlas.

`detectConvergence` (`evolve.js:349`) is O(living²) over the 11-trait L1 distance with a
threshold of `0.45`. Measured convergence count: `0` for the whole run — because trait variance
never gets large enough for two lineages to be *far* apart, the pairs are all trivially within
`0.45` and are excluded by `related(...)` or counted once and never reported. At 200 lineages
this becomes 40,000 comparisons/tick with a threshold calibrated for a variance regime that
doesn't exist.

### 3.6 `morphology.js` is a coarse function of two traits

`bodyPlanFromTraits` reads six traits but `spriteFromPlan` branches only on `mass`, `trop`,
`limbs`, `appendage`, and `limbs`/`appendage` are themselves functions of `mass` and `trop`.
So the entire visible body-plan space is a 2-D function of two traits, one of which
(`bodyMass`) cannot move (§2.5) and the other of which (`trophic`) reaches `0.203` against a
predator threshold of `0.65`.

Also: `morphology.js:16` reads `TRAITS.thermalOpt`, which does not exist in `TRAITS`
(the key is `tOpt`). `traits[undefined]` is `undefined`, so `therm` falls to the `?? 0.5`
default and `pigmentBias` is a constant `0.5` for every lineage in every world. Dead code
path, silently.

### 3.7 The sprite atlas has no rungs to draw

`sprites.js` holds 16 `Path2D` silhouettes on a 4×4 atlas. Of those, three are fauna
(`6` ice, `7`/`8` worms, `15` fish), two are daisies, one is a reef, one is a settlement, one is
a monolith, and the rest are flora or terrain. There is no mat, no motile microbe, no filter
feeder, no jawless fish, no lobefin, no tetrapod, no sprawler, no erect archosaur, no giant
arthropod. The product goal names nine watchable rungs; the atlas can draw two of them.

---

## 4. What is genuinely good and must not be disturbed

- **The redox tower's shape.** Seventeen guilds ordered by yield with donor/acceptor pairs,
  syntrophy, BIF deposition into the `rock` layer, methanogen haze as an anti-greenhouse, and
  pigment-driven surface tint. The *architecture* is right; §2.1–2.4 are calibration and
  plumbing bugs inside a sound design.
- **The tree object.** `nodes` / `living` / `extinctions` / `convergences` / `diversityHistory`
  with `birth`, `death`, `extReason`, `substitutions`, `cells`, `pop`, `endemic`, and fossils
  written into per-cell slots. Everything a module system needs to hang off already exists.
- **Deep-time infrastructure.** `adaptiveTickYears`, `faintYoungSun`, `icsAt`, `dayLengthDays`,
  `bombardmentFlux`, `maybeCaptureMoment`, `multiRateMask`. The clock is honest.
- **Determinism.** `rngOf(W, 'rngAgents')`, `forkRng`, `hashTag`, `attachWorldRng`, and a golden
  hash test that passes. The fork-the-tape stretch goal is nearly free because of this.
- **Extinction machinery.** Background-vs-mass separation, named kill chains, disaster taxa,
  extinction debt, eulogies, fossil + trace recording. Ready to be driven by real diversity.
- **Modern Earth is insulated.** `rule.earthLike && !rule.deepTime` short-circuits every
  invention gate to `true` at generate time, so the Phase 0–3 work on deep time cannot break
  the calibrated present — *provided* `guildViable` changes are checked against
  `calibrateEarth`, because `seedModernGuilds` runs through the same fitness function.

---

## 5. Priority order implied by the audit

1. **`tree.byId` index** — unblocks the 200-clade target; nothing else scales without it.
2. **`popId` → agents / lifeClass single writer** — makes the tree observable at all.
3. **Redox chemistry memory + vent fallback + CO₂ scale** — makes the Archean a competition.
4. **Reachable `oxyphoto` gate** — unblocks the entire downstream transition ladder.
5. **Module system** — replaces the 2-D `mass × trophic` body-plan space.
6. **Trait mutation that can actually move `bodyMass`** — with selection that rewards size.
7. **Sprite atlas rungs** — so the change has somewhere to land visually.

Items 1–4 are Phase 0. Items 5–7 are Phase 1. Nothing in Phases 2–5 can be validated before
item 4, because the run does not reach the states those phases are about.

---

## 6. Repro

```bash
node vr/sim/test.mjs
node vr/sim/calibrate.mjs
node vr/sim/headless.mjs --golden
```

The deep-time probe used for §2 is not committed. Plan steps **P0-02 … P0-07** replace it with
`vr/sim/deeptime.mjs`, and step **P0-58** requires that probe to reproduce the table in §2
exactly at `--seed=20260808 --n=32 --ticks=5500 --every=500` *after* the Phase 0.B–0.D
refactors — which is how those refactors are proved to be behaviour-neutral. From P0-60 onward
the same probe is the regression witness for every phase.
