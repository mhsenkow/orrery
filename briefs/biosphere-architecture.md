# ORRERY — biosphere architecture

**Hand-written. Not generated.** The design that `biosphere-plan.md` implements.
Read `biosphere-audit.md` first — it is the evidence this design answers.

Scope: unify the two life models, replace the eight-rung ladder with an evolvable body-plan
module system, and make macro-evolution watchable over a deep-time run without scripting
Earth's timeline.

---

## 0. The one-sentence claim

> A cell holds a metabolic guild mix and a pointer to a dominant lineage; a lineage holds a
> trait vector **and a set of developmental modules**; modules unlock against planetary state,
> lock with clade age, and are the *only* input to what the player sees a creature look like.

Everything below is the consequence of that sentence.

---

## 1. Source of truth

### 1.1 Today (three disagreeing models)

```
   guildDens[guild][c] ──┐
                         ├──> life[c] ──> lifeColour ──> globe / flat map
   LIFE_CLASSES envelope ┤        ▲
                         │        │ (bio.js clamps what redox.js wrote)
   lifeClass[c] <────────┴────────┘         ← two writers, incompatible definitions
   unlockedClass  (global scalar)           ← third authority, planet-wide
   popId[c] ──> W.tree                      ← maintained, read by nothing visual
```

### 1.2 After (one model, two layers, everything else derived)

```
        ┌──────────────────── AUTHORITATIVE STATE ────────────────────┐
        │                                                             │
        │  MICROBIAL LAYER          MACRO LAYER          SHARED       │
        │  W.guildDens[g][c]        W.popId[c]           W.life[c]    │
        │  W.species[x][c]          W.tree.nodes[]       W.macroDens[c]
        │    (persistent,             .traits (11f)                   │
        │     accumulating)           .slots  (8×u8)   ← MODULES      │
        │  W.matCover, .stromatolite  .flags  (u32)    ← MODULES      │
        │  W.transitions (global)     .slotLock/.flagLock             │
        │  W.modulePool  (global)     .diet   (≤3 ids)                │
        │                             .morphHash                      │
        └─────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    ▼                                ▼
          DERIVED, SINGLE-WRITER              DERIVED, CACHED
          W.lifeClass[c]   (compat shim)      bodyPlanFromModules(node, env)
          W.unlockedClass  (compat shim)        → plan {silhouette, size, gait, …}
          W.cladeCount[c]  (diversity field)    → spriteKind  (atlas index)
          W.dominantPigment                     → mesh LOD    (mesh.js)
                                                → map stamp   (localview.js)
```

**Rules, enforced by the plan's steps:**

1. `W.life[c]` remains the render-facing total biomass scalar. It is written by `redoxTick`
   (microbial contribution) and `evolveTick` (macro contribution via `W.macroDens[c]`), and by
   nobody else. `bioTick` may only *clamp* it, which is what it already does at `bio.js:84`.
2. `W.macroDens[c]` is new: the fraction of `life[c]` that is macroscopic (a lineage with the
   `MULTICELLULAR` flag). It makes "the Archean is all microbes" a state, not a class index.
3. `W.lifeClass[c]` becomes **derived and read-only**, computed once per tick at the end of
   `evolveTick` by `deriveLifeClass()` in a new `vr/sim/lifeclass.js`. It keeps its `Uint8` type
   and the existing 0–7 meanings so that the ten current readers keep working unchanged. Every
   other write site is deleted.
4. `W.unlockedClass` becomes **derived** from `W.modulePool` by `unlockedClassFromPool()` in the
   same file. It survives only as a compatibility shim for `city.js`, `god/life.js`,
   `agents.js`, `earth.js`, and `localview.js`, and is documented as such. Phase 2 retires the
   year-gated ladder in `bio.js:137–144` for deep-time worlds; modern Earth keeps its
   short-circuit.
5. `W.popId[c]` is the *only* link from a cell to a lineage. `agents.js` reads it. Nothing
   computes clade membership arithmetically.
6. `W.modulePool` is the set of modules that have ever been invented on this planet — the
   global one-off gate (you cannot re-invent oxygenic photosynthesis independently ten times).
   Per-lineage possession is `node.slots` / `node.flags`. **Global invention ≠ lineage
   possession**, and conflating the two is what `unlockedClass` currently does.

### 1.3 Tick order and responsibilities

Order is **unchanged** from `world.js:392–404`. This is deliberate: reordering `bioTick` and
`evolveTick` would change the golden hash for reasons unrelated to evolution, and it is not
necessary — `lifeClass` derivation moves to the end of `evolveTick`, so a one-tick lag on a
derived display field is the entire cost.

| # | Function | Owns | Must not touch |
|---|---|---|---|
| 1 | `alienTick` | exotic-solvent rulesets | tree, modules |
| 2 | `ecologyTick` | `npp`, `upwelling`, `biome`, trophic scalars, **`node.diet`** | `life`, `lifeClass`, `slots` |
| 3 | `redoxTick` | `species` (accumulating), `guildDens`, `transitions`, `matCover`, `stromatolite`, `bifRock`, microbial part of `life` | `lifeClass`, `popId`, `slots`, `unlockedClass` |
| 4 | **`moduleTick`** *(new, called from `evolveTick`)* | `node.slots`, `node.flags`, `*Lock`, `W.modulePool`, morphological-first chronicle events | `life`, `guildDens` |
| 5 | `bioTick` | `soil`, `nutrientN/P`, `reef`, plague, residual gas coupling, biomass clamp | `lifeClass` (**all writes deleted**), `unlockedClass` |
| 6 | `carbonTick` | reservoirs, burial → O₂ | — |
| 7 | `evolveTick` | `traits`, selection, speciation, extinction hazard, `popId`, `macroDens`; calls `moduleTick`; ends with `deriveLifeClass` + `unlockedClassFromPool` | `guildDens`, `species` |
| 8 | `extinctionTick` | background vs mass, named kills, debt, fossils | `slots` (reads only) |

`multiRateMask` already gates 4/7/8 behind `rate.phylogeny` (every 6 ticks at `dt ≥ 1e6`).
`moduleTick` inherits that budget, which is correct — module unlocks are Myr-scale events.

---

## 2. Module schema

`vr/sim/modules.js`. Two representations, chosen for determinism and debuggability over
compactness:

- **Slots** — eight mutually exclusive axes. `node.slots = new Uint8Array(8)`, each entry an
  index into that slot's option list. Index `0` is always the ancestral / null state.
- **Flags** — independent acquisitions. `node.flags` is a plain `Uint32` bitfield.

A raw bitfield for everything was rejected: mutual exclusion within an axis is the thing that
makes "fin → limb" a *transition* rather than an accumulation, and a slot makes that exclusion
structural instead of a rule someone has to remember.

```js
export const SLOT = {
  habitat: 0, locomotion: 1, respiration: 2, reproduction: 3,
  skeleton: 4, trophic: 5, integument: 6, symmetry: 7,
};
export const SLOT_COUNT = 8;

export const OPTIONS = {
  habitat:      ['ventBenthic', 'pelagic', 'shelfBenthic', 'intertidal',
                 'freshwater', 'terrestrial', 'aerial', 'endolithic'],
  locomotion:   ['sessile', 'cilia', 'flagella', 'undulation', 'medianFin',
                 'pairedFin', 'tetrapodLimb', 'serpentine', 'jet',
                 'erectGait', 'wing'],
  respiration:  ['diffusion', 'gill', 'skin', 'trachea', 'bookLung',
                 'lung', 'airSac'],
  reproduction: ['fission', 'spore', 'spawn', 'anamnioticEgg',
                 'amnioticEgg', 'liveBirth', 'seed'],
  skeleton:     ['none', 'hydrostatic', 'cuticle', 'shell', 'cartilage',
                 'bone', 'lignin', 'pneumaticBone'],
  trophic:      ['chemotroph', 'phototroph', 'osmotroph', 'filter',
                 'detritivore', 'grazer', 'predator', 'apexPredator'],
  integument:   ['bare', 'mucus', 'scale', 'carapace', 'keratinPlate',
                 'filament', 'fur'],
  symmetry:     ['none', 'radial', 'bilateral', 'segmented', 'pentaradial'],
};

export const FLAG = {
  MULTICELLULAR: 1 << 0,  TISSUE:      1 << 1,  GUT:          1 << 2,
  PHOTORECEPTOR: 1 << 3,  IMAGE_EYE:   1 << 4,  CEPHALIZATION:1 << 5,
  JAW:           1 << 6,  TEETH:       1 << 7,  ENDOTHERM:    1 << 8,
  PARENTAL_CARE: 1 << 9,  SOCIAL:      1 << 10, VASCULAR:     1 << 11,
  ROOT:          1 << 12, SEEDPLANT:   1 << 13, FLOWER:       1 << 14,
  AMNIOTE:       1 << 15, BIOMINERAL:  1 << 16, COUNTERCURRENT:1 << 17,
  PNEUMATIC:     1 << 18, SWIM_BLADDER:1 << 19, VENOM:        1 << 20,
  ARMOUR_PLATE:  1 << 21, GIGANTISM:   1 << 22, DWARFISM:     1 << 23,
};
```

Per-node additions (all allocated in `addLineage`, all inherited by `mutate`/speciation):

| Field | Type | Meaning |
|---|---|---|
| `slots` | `Uint8Array(8)` | current option per axis |
| `slotLock` | `Uint8Array(8)` | `0` free; `>0` hardened, cannot change |
| `flags` | `number` (u32) | acquired flags |
| `flagLock` | `number` (u32) | flags that cannot be lost |
| `morphHash` | `number` | stable hash of `slots + flags`; sprite/mesh cache key |
| `grade` | `number` 0–7 | derived organisational grade, for the `lifeClass` shim |
| `diet` | `number[]` ≤3 | prey lineage ids |
| `firsts` | `string[]` | module names this lineage was first on the planet to acquire |

### 2.1 Locking — developmental constraint

Evolvability decays with clade age, which is what makes convergence *costly* rather than free.

```
lockChance(slot, ageMyr, popN) = clamp(ageMyr / LOCK_TAU[slot], 0, 0.95) × (1 − 1/√popN)
```

`LOCK_TAU` is per-slot (invented, tuned in Phase 3): `symmetry` 40 Myr (locks almost
immediately — nothing goes back from bilateral), `skeleton` 120, `respiration` 200,
`reproduction` 180, `locomotion` 300, `habitat` 400, `trophic` 500, `integument` 600.
A locked slot is inherited locked. `flagLock` sets on `MULTICELLULAR`, `AMNIOTE`, `BIOMINERAL`,
`ENDOTHERM` the tick after acquisition — these are not reversible on Earth and should not be
here.

### 2.2 Gates — how a module unlocks

`MODULE_GATES` in `modules.js`. One row per reachable transition. Applied per-lineage in
`moduleTick`, only for unlocked slots, at most **one slot change or one flag gain per lineage
per phylogeny tick**, so a body plan cannot leap two rungs in a tick.

```js
{ slot: 'respiration', from: ['diffusion', 'skin'], to: 'gill',
  needs:  { flags: ['MULTICELLULAR'], slots: { symmetry: ['bilateral', 'segmented'] } },
  env:    { O2min: 0.02, aquatic: true },
  traits: { bodyMass: [0.18, 1] },
  rate:   0.012,          // per Myr, per lineage
  bias:   ['o2Headroom'],
  first:  'First gill',
  tag:    'fitted' }
```

`p = rate × dtMyr × Π bias(...)`, clamped to `[0, 0.6]` per tick so a long tick cannot make an
unlock certain. `env` is evaluated over the **lineage's own occupied cells** (mean of
`node.cells`), never globally — this is the mechanism by which two lineages on the same planet
can sit at different grades, which §1.2 rule 6 requires.

### 2.3 Compatibility — convergence allowed, penalised

`INCOMPATIBLE` is a list of `[slotA:option, slotB:option]` pairs with a fitness multiplier,
not a hard veto. A lineage may hold `terrestrial + gill` — it just pays for it:

| Pair | Multiplier | Tag | Why |
|---|---|---|---|
| `terrestrial` + `gill` | 0.25 | measured | gill lamellae collapse in air |
| `terrestrial` + `spawn` | 0.55 | measured | desiccating gametes |
| `pelagic` + `tetrapodLimb` | 0.7 | fitted | drag; cetaceans exist, so soft |
| `aerial` + `bone` (no `PNEUMATIC`) | 0.5 | fitted | mass budget |
| `terrestrial` + `hydrostatic` + `bodyMass > 0.4` | 0.3 | measured | no compressive support |
| `trachea` + `bodyMass > 0.35` | see §5 `o2Diffusion` | measured | diffusion-limited |

The product of applicable multipliers becomes `node.morphPenalty`, folded into `fitness()` in
`evolve.js`. Convergent solutions therefore arise repeatedly and get punished when the module
set is physically silly, which is the honest version of "convergence allowed but penalised".

---

## 3. Three worked lineages

Illustrative target states, used as fixtures in `vr/sim/test.mjs` so the grammar is pinned by
tests rather than by prose.

### 3.1 `Vent mat` — a bacterium

| Axis | Value |
|---|---|
| slots | habitat `ventBenthic`, locomotion `sessile`, respiration `diffusion`, reproduction `fission`, skeleton `none`, trophic `chemotroph`, integument `mucus`, symmetry `none` |
| flags | *(none)* |
| traits | `tOpt` 0.78, `tBreadth` 0.22, `desiccation` 0.05, `o2Affinity` 0.00, `bodyMass` 0.04, `dispersal` 0.15, `repro` 0.92, `trophic` 0.00, `defence` 0.05, `pigment` 0.00, `radiation` 0.35 |
| plan | `size` 0.22, `limbs` 0, `silhouette` `mat`, `spriteKind` `MAT`, `gait` none |
| grade | 0 (`prokaryote`) |
| appears | from abiogenesis; the only body plan available for ~1.5 Gyr |

### 3.2 `Jawed nekton` — a fish-like thing

| Axis | Value |
|---|---|
| slots | habitat `pelagic`, locomotion `pairedFin`, respiration `gill`, reproduction `spawn`, skeleton `bone`, trophic `predator`, integument `scale`, symmetry `bilateral` |
| flags | `MULTICELLULAR TISSUE GUT IMAGE_EYE CEPHALIZATION JAW TEETH BIOMINERAL COUNTERCURRENT SWIM_BLADDER` |
| traits | `tOpt` 0.50, `tBreadth` 0.20, `desiccation` 0.10, `o2Affinity` 0.45, `bodyMass` 0.46, `dispersal` 0.72, `repro` 0.58, `trophic` 0.85, `defence` 0.35, `pigment` 0.20, `radiation` 0.10 |
| plan | `size` 1.05, `limbs` 0, `fins` 2 paired + 1 median, `silhouette` `nektonJawed`, `spriteKind` `FISH_JAWED` |
| grade | 4 (`fish`) |
| requires | `O2 ≥ 0.06`, `BIOMINERAL`, predation pressure ≥ 0.2, reef or shelf NPP ≥ 0.3 |

### 3.3 `Shore sprawler` — a tetrapod-like thing

| Axis | Value |
|---|---|
| slots | habitat `intertidal`, locomotion `tetrapodLimb`, respiration `lung`, reproduction `anamnioticEgg`, skeleton `bone`, trophic `predator`, integument `mucus`, symmetry `bilateral` |
| flags | `MULTICELLULAR TISSUE GUT IMAGE_EYE CEPHALIZATION JAW TEETH BIOMINERAL PARENTAL_CARE` |
| traits | `tOpt` 0.52, `tBreadth` 0.26, `desiccation` 0.52, `o2Affinity` 0.62, `bodyMass` 0.50, `dispersal` 0.45, `repro` 0.50, `trophic` 0.80, `defence` 0.30, `pigment` 0.30, `radiation` 0.15 |
| plan | `size` 1.2, `limbs` 4, `gait` `sprawl`, `silhouette` `sprawler`, `spriteKind` `SPRAWLER` |
| grade | 5 (`amphibian`) |
| requires | ancestor with `pairedFin` + `bone`; `intertidal[c] > 0.15` sustained; ozone > 0.15; land plant cover > 0.05 |

### 3.4 Bonus — `Erect archosaur-like`, to show the "dinosaur likelihood" path is a *path*

slots: habitat `terrestrial`, locomotion `erectGait`, respiration `airSac`, reproduction
`amnioticEgg`, skeleton `pneumaticBone`, trophic `apexPredator`, integument `filament`,
symmetry `bilateral`. flags add `AMNIOTE PNEUMATIC GIGANTISM PARENTAL_CARE`.
`bodyMass` 0.82, `o2Affinity` 0.75. Grade 6.

Nothing in the gate table names this animal. It is what you get when `erectGait` and `airSac`
are both available, `GIGANTISM` is affordable (§5), and the large-predator niche is vacant after
a mass extinction. On a world where any of those three is absent you get something else, and
that is the point.

---

## 4. Modules → picture

```
node.slots + node.flags
        │
        ▼   bodyPlanFromModules(node, env)      ← replaces bodyPlanFromTraits
   plan { silhouette, size, limbs, segments, symmetry, gait, fins,
          armour, pigmentBias, stride, spriteKind, meshKey, stampKind }
        │
        ├──> ORBIT      fields only: cladeCount[c], dominant guild colour, biome
        ├──> REGIONAL   one cohort impostor per (lineage × cell cluster)
        ├──> PATCH      SPRITES[plan.spriteKind]           (sprites.js, 6×6 atlas)
        ├──> TILE       localview stampKind + gait animation (localview.js)
        └──> GROUND     meshFromPlan(plan)                  (mesh.js, LOD)
```

`bodyPlanFromTraits` is **kept** as a shim that synthesises a provisional module set from a
trait vector, so `mesh.js:80` and any caller that only has traits keeps working. It is marked
deprecated in a comment and its `TRAITS.thermalOpt` bug (audit §3.6) is fixed on the way past.

**Atlas growth.** `sprites.js` goes from a 4×4 / 16-tile atlas to **6×6 / 36 tiles**, keeping
indices 0–15 byte-identical so no existing call site shifts. New rungs occupy 16–29:

| idx | name | rung |
|---|---|---|
| 16 | `MAT` | microbial mat / stromatolite crust |
| 17 | `MOTILE_MICROBE` | flagellate / ciliate |
| 18 | `COLONY` | multicellular blob, radial |
| 19 | `FILTER_FAN` | sessile filter feeder |
| 20 | `WORM_BILATERAL` | motile bilaterian |
| 21 | `ARTHROPOD_SMALL` | cuticle + segmented |
| 22 | `ARTHROPOD_GIANT` | high-O₂ / low-g megarthropod |
| 23 | `SHELLED` | shell + pentaradial or coiled |
| 24 | `FISH_JAWLESS` | median fin, no jaw |
| 25 | `FISH_JAWED` | paired fin + jaw |
| 26 | `LOBEFIN` | fleshy paired fin, shallow water |
| 27 | `SPRAWLER` | tetrapod limb, sprawl gait |
| 28 | `ERECT_BIPED` | erect gait, large |
| 29 | `FURRED_QUADRUPED` | fur + endotherm |
| 30–35 | reserved | plants: `THALLUS`, `VASCULAR_STEM`, `TREE_LIGNIN`, `SEEDPLANT`, `FLOWERING`, spare |

`getSpriteAtlas()` already derives tile coordinates from `ATLAS_COLS` and `SPRITES.length`, so
the only change is `ATLAS_COLS = 6` plus the new path data. `drawSprite` needs no change.

---

## 5. Affordance biases — Earth-likely without Earth's dates

These are the "bake in dinosaur-likelihood" mechanism. They are multipliers on gate rates and on
`fitness`, never on the clock. **No gate anywhere in the system reads `W.year` or `maBP`.** A run
that reaches high O₂ early gets giant arthropods early; a run that never does, never does.

| Bias | Formula (sketch) | Effect | Tag |
|---|---|---|---|
| `o2Diffusion` | `maxMass_trachea = 0.18 + 1.6 × (pO2 − 0.10)` | caps `bodyMass` for `trachea` respirers; Carboniferous 35 % O₂ → `ARTHROPOD_GIANT` reachable, 21 % → not | **measured** (tracheal diffusion length ∝ pO₂) |
| `gravityMass` | `× g^-0.8`, clamped `[0.5, 2.2]` | low-gravity worlds open megafauna; high-g worlds cap it | **fitted** |
| `o2Headroom` | `clamp((pO2 − gate.O2min) / 0.08, 0, 2)` | active lifestyles (`gill`, `lung`, `predator`, `ENDOTHERM`) unlock faster in oxygen-rich air | **fitted** |
| `intertidalSelect` | `1 + 6 × mean(intertidal[node.cells]) × tideRangeNorm` | boosts `desiccation` selection and the `lung`/`skin`/`amnioticEgg` gates | **fitted** |
| `shoreLobefin` | `1 + 4 × shorelineFrac × landPlantCover` | boosts `pairedFin → tetrapodLimb` only where there is a shore *and* something to eat on it | **fitted** |
| `predationJaw` | `1 + 3 × predatorBiomassShare` | `JAW`, `TEETH`, `ARMOUR_PLATE`, `IMAGE_EYE` co-escalate; an arms race, not a schedule | **fitted** |
| `reefFilter` | `1 + 2 × reefArea` | `filter`, `shell`, `pentaradial` where reefs exist | **fitted** |
| `vacancy` | `1 + 2.5 × (1 − nicheOccupancy(grade, habitat))` | post-extinction radiation: whatever survives gets cheap access to the empty large-predator slot | **fitted** |
| `uvGate` | `0` while `ozone < 0.15` for `terrestrial` | land is closed until there is a screen, then opens | **measured** |
| `plantSubstrate` | `0` for `terrestrial` animal gates while `landPlantCover < 0.02` | animals do not colonise bare rock first | **fitted** |
| `thermalEndo` | `1 + 2 × seasonalAmplitude × (1 − meanTempStability)` | endothermy pays off on a seasonal, unstable planet | **fitted** |

Every constant above lands in `modules.js` as a named export in a `BIAS_CONST` object with its
tag in a trailing comment, and gets a row in `model-limits.md` under a new heading
**"Fitted affordance constants"**. That is the honesty contract from the brief: the biases are
declared, not hidden in a rate.

### 5.1 Why this produces the Earth-shaped run without copying it

The Earth sequence falls out of the *ordering of the preconditions*, which is physics:

- `gill` needs dissolved O₂ → needs `oxyphoto` → needs a light-driven donor.
- `terrestrial` needs `ozone > 0.15` → needs atmospheric O₂ → needs burial.
- `tetrapodLimb` needs `pairedFin` + shore + `plantSubstrate` → land plants must precede
  land animals, and they will, because plants only need `ozone`.
- `amnioticEgg` needs `terrestrial` + `desiccation > 0.45` → the amniote step is downstream
  of drying out, which is downstream of leaving the water.
- `GIGANTISM` needs `o2Diffusion` headroom and `vacancy` → the large-animal era follows an
  oxygen peak and an extinction, in that order, because that is what makes the niche cheap.

None of those five sentences mentions a date. Run the same planet with a weaker greenhouse and
the whole chain slides late; run it with a nitrogen-rich, low-gravity atmosphere and the
arthropod branch beats the vertebrate one to large size. Both are correct outcomes.

---

## 6. Speciation that is visible

`maybeSpeciate` gains a **module divergence roll** on every split (`evolve.js:289`):

1. Compute the habitat contrast between the two components: sea/land, mean `temp` delta, depth
   class, `intertidal` delta, `moist` delta. Normalise to `0–1` as `contrast`.
2. `pModule = 0.25 + 0.6 × contrast`, boosted by `vacancy`.
3. On success, pick the *single* highest-scoring available gate for the child evaluated against
   **the child's component cells only**, and apply it. If no gate is available, fall back to a
   deliberately large single-trait step (`3σ`, Fisher rejection bypassed once) so the split is at
   least measurable.
4. Recompute `child.morphHash`. If `morphHash === parent.morphHash`, force a change on the
   least-locked slot. **A speciation event never produces an identical silhouette.**
5. If the acquired module is a planetary first, push to `node.firsts`, log a
   `'morphology'` chronicle event, and call `maybeCaptureMoment(W, 'first' + Module, …)` so the
   run is scrubbable by morphological first — which is the Lab UI's whole job in §8.

`detectConvergence` is rewritten to compare **module sets** (Hamming over slots + popcount over
flags) rather than trait L1, with a cap of 60 pairs sampled per tick via a stride so it stays
O(living) at 300 lineages instead of O(living²).

---

## 7. Trophic web, minimal viable

Not an interaction matrix. Three links per lineage, assigned in `ecologyTick`.

- `assignDiet(W, node)` scores candidate prey by `trophicDelta × massRatioFit × rangeOverlap`,
  keeps the top 3, writes `node.diet`.
- `preyBiomass(W, node) = Σ prey (prey.pop × prey.bodyMass × overlapFrac)`.
- `fitness()` in `evolve.js` gains a term: for `trophic ∈ {grazer, predator, apexPredator}`,
  multiply by `clamp(preyBiomass / demand, 0.15, 1.2)` where
  `demand = bodyMass^0.75 × pop` (Kleiber — `kleiberDensity` already exists at `evolve.js:148`).
- Extinction cascade: if `preyBiomass / demand < 0.2` for more than `CASCADE_TAU` (2 Myr,
  invented), extinguish with reason `'trophic collapse'`. This is what makes a bottom-up
  extinction propagate upward without a scripted kill list.
- The existing `W.foodWeb.links` output is kept for the Lab card, now built from `node.diet`
  instead of the O(living²) double loop at `ecology.js:208–221`.

---

## 8. Presentation contract

| Rung | Representation | Source | Never |
|---|---|---|---|
| Orbit | scalar fields: `cladeCount`, dominant-guild colour, biome, `macroDens` | `guildDens`, `popId` neighbourhood, `biome` | individual sprites |
| Hemispheric | same fields, coarser; range outlines for a *selected* clade | `node.cells` → hull | per-lineage impostors |
| Regional | cohort impostors — one billboard per lineage per cell cluster, silhouette from `morphHash` | `popId[c]` + `bodyPlanFromModules` | named individuals |
| Patch | individual sprites from the cell's `popId` | `ENT` + `popId[c]` | sprites from `(c + n) % living` |
| Tile | `localview` stamps with gait animation, density from `macroDens` | `stampKind` | anything not derivable from cell state + stable seed |
| Ground | low-poly mesh LOD | `meshFromPlan` | — |
| Lab / tree | clade list → click → highlight range on globe, module table, `firsts` timeline, scrub-to-first | `phylogenyView` extended | trait floats as the primary readout |

**Lab tree panel** (extends `refreshLab` at `main.js:1464` and `phylogenyView` at
`instruments.js:199`):

- Clade rows sorted by `pop`, showing name, grade, silhouette thumbnail from the atlas, and
  age.
- Click → `S.selectedClade = id` → globe tints `node.cells`, module table appears, `firsts`
  list appears with jump-to-age buttons.
- A "morphological firsts" strip across the run, drawn from `W.chron` `'morphology'` events —
  this is the deliverable that lets a player *see* mat → microbe → filter feeder → jawed fish →
  lobefin → tetrapod without reading a single number.

---

## 9. Determinism

Every new random draw uses a named stream. `rngOf(W, 'rngModules')` for gate rolls,
`rngOf(W, 'rngSpec')` for speciation. Never `Math.random`, never `W.rng` directly in new code
(the shared stream's consumption order is what the golden hash pins, and adding a consumer to it
perturbs everything downstream of it for no reason).

Gate iteration order must be **array order**, never `Object.keys` on a live object and never a
`Set` iteration whose insertion order depends on cell traversal. `MODULE_GATES` is a frozen
array; `moduleTick` iterates `tree.living` in array order, which `addLineage` appends to
deterministically.

New golden test: `evolutionGolden()` in `headless.mjs` — terra + `deepTime`, seed 42, N=32,
2,000 ticks, hashing `{ tree.nodes.length, living.length, Σ morphHash, Σ modulePool, firsts[] }`.
Two runs must agree. This is the regression witness for Phases 1–5, separate from the existing
field hash so a deliberate evolution change does not have to touch the climate golden.

---

## 10. Cost and the express path

Measured: **~155 ms/tick at N=64**, **~40 ms/tick at N=32**. A full 4.567 Ga run is ≈22,800
ticks — about **59 min at N=64**, **15 min at N=32**.

Therefore:

1. All validation runs are N=32 via `vr/sim/deeptime.mjs`. Nobody waits an hour to see whether a
   gate fired.
2. A **Deep Time Express** ruleset flag (`expressTicks`) caps the Holocene tail: once
   `maBP < 2.58`, jump `dtYr` to `2e4` instead of `200`, which removes ~12,800 of the 22,800
   ticks at the cost of Pleistocene detail nobody is watching for evolution. Gated behind a flag
   so the calibrated present is untouched.
3. `tree.byId` (audit §3.1) is not an optimisation, it is a precondition. Without it the
   phylogeny tick is quadratic in living count and the 200-clade target is arithmetically out
   of reach.

---

## 11. What this design deliberately does not do

For `model-limits.md`:

- Modules are a curated set of ~50 discrete states, not a developmental genetic regulatory
  network. There is no morphogenesis, no gene expression, no allometric growth simulation.
- Gate rates are per-lineage per-Myr probabilities fitted so that an Earth-like planet produces
  an Earth-*shaped* sequence. They are not derived from measured evolutionary rates.
- `INCOMPATIBLE` is a hand-written table of ~12 pairs, not a biomechanical solver.
- The trophic web is 3 links per lineage. There is no omnivory, no ontogenetic diet shift, no
  parasitism dynamics beyond a flag.
- Speciation remains allopatric-component splitting. There is no population genetics, no
  reinforcement, no ring species.
- The 200-clade target is a *diversity* target, not a claim that 200 distinguishable silhouettes
  exist — the atlas holds 14 animal rungs plus 5 plant rungs, and lineages sharing a rung are
  distinguished by size, tint, armour, and segment count.
- Modern Earth (`terra`, not deep time) remains a calibrated present with all transitions
  pre-crossed. Open evolution is a deep-time / exoworld feature, by design.
