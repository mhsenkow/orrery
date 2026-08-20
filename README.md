# ORRERY

Embodied god-game prototype: hold a planet, shrink, walk in.

[![Orrery — Earth sandbox with tools dock, globe, and a first-free-oxygen moment](site/img/earth-hud.png)](https://mhsenkow.github.io/simearth/vr/)

[Open the live prototype](https://mhsenkow.github.io/simearth/vr/) — drag to spin, scroll to zoom. WebXR on a headset if you have one.

**Showing someone:** use the [demo opening](https://mhsenkow.github.io/simearth/vr/?demo=1) — living Earth (`thrive` ruleset, clock runs, settlements and herds). Tour button always visible. First visit walks through **pick a world → choose a lesson**; press **Tour** or **?** anytime to reopen the track. Pitch stills: `?pitch=hud`, `?pitch=local`, `?pitch=worlds`.

<p>
<img src="site/img/earth-currents.png" width="49%" alt="Ocean currents overlay on the globe and local patch">
<img src="site/img/earth-local.png" width="49%" alt="Expanded local map beside the planet">
</p>

[![Worlds catalogue open beside Earth](site/img/worlds-picker.png)](https://mhsenkow.github.io/simearth/vr/)

## Live

- [Pitch / site](https://mhsenkow.github.io/simearth/site/)
- [VR / WebGL prototype](https://mhsenkow.github.io/simearth/vr/)
- [Improvement backlog](https://mhsenkow.github.io/simearth/site/backlog.html)
- [Worlds backlog — 200 real planets and moons](https://mhsenkow.github.io/simearth/site/worlds.html)
- [Evolution & fidelity backlog — 200 ways to make evolution legible](https://mhsenkow.github.io/simearth/site/evolution.html)
- [God-game backlog — 200 ways to act like a god](https://mhsenkow.github.io/simearth/site/godgame.html)
- [The next 200 — what the last two backlogs left behind](https://mhsenkow.github.io/simearth/site/next.html)
- [Tides & weather — 200 items on the two systems you cannot see](https://mhsenkow.github.io/simearth/site/tides-weather.html)
- [Geology — 482 items: molding the starting world, then the mantle, the plates, and the geology each active planet actually does](https://mhsenkow.github.io/simearth/site/geology.html)
- [Real parameters — 500 items to make every world match its measured values](https://mhsenkow.github.io/simearth/site/exoparams.html)
- [Alive — 300 items on whether it reads as a living world](https://mhsenkow.github.io/simearth/site/living.html)
- [Currents — 200 items on everything that is supposed to move](https://mhsenkow.github.io/simearth/site/currents.html)
- [Realism — 800 items on how the globe looks, and how to make it Earth](https://mhsenkow.github.io/simearth/site/realism.html)
- [Landscape — 400 items on picking, drawing and shaping the land you start with](https://mhsenkow.github.io/simearth/site/landscape.html)
- [Life — 400 items on an open morphospace: genomes, senses, and whether evolution here could have come out differently](https://mhsenkow.github.io/simearth/site/life.html)
- [Surface — 400 items on why the picture has hard edges and why the world is striped](https://mhsenkow.github.io/simearth/site/surface.html)
- [World space — 400 items on the palette of worlds: taxonomy, substrates, giants, landform grammar, epochs and the technosphere](https://mhsenkow.github.io/simearth/site/worldspace.html)
- [Open world — 400 items on the machinery that keeps it open: world data, a material stack, palettes with provenance, an artefact detector and per-world art direction](https://mhsenkow.github.io/simearth/site/openworld.html)
- [Thrive — 611 items on life that grows while you watch, and on planets that can regulate, fight, notice, and (when labelled) think](https://mhsenkow.github.io/simearth/site/thrive.html)
- [World data — the join, the palette, the units, and the data-to-code scoreboard](https://mhsenkow.github.io/simearth/site/world-data.html)

## Local

```bash
python3 -m http.server 8765
# http://localhost:8765/vr/
```

WebXR needs HTTPS or localhost. Docs in `briefs/`.

## Backlogs

All seventeen backlogs are generated — edit the script, never the output.
`lifegrammar.mjs`, `substrates.mjs`, `cover.mjs`, `landgram.mjs`, `columns.mjs`, `epochs.mjs`, `techno.mjs` and `worlddef.mjs` are not backlogs: they compile authored JSON into frozen runtime modules. `scripts/data.mjs` runs all of them.

```bash
node scripts/backlog.mjs        # briefs/backlog.md + site/backlog.html
node scripts/worlds.mjs         # briefs/worlds-backlog.md + site/worlds.html
node scripts/evolution.mjs      # briefs/evolution-backlog.md + site/evolution.html
node scripts/godgame.mjs        # briefs/godgame-backlog.md + site/godgame.html
node scripts/next.mjs           # briefs/next-backlog.md + site/next.html
node scripts/tides-weather.mjs  # briefs/tides-weather-backlog.md + site/tides-weather.html
node scripts/geology.mjs        # briefs/geology-backlog.md + site/geology.html
node scripts/exoparams.mjs      # briefs/exoparams-backlog.md + site/exoparams.html
node scripts/living.mjs         # briefs/living-backlog.md + site/living.html
node scripts/currents.mjs       # briefs/currents-backlog.md + site/currents.html
node scripts/realism.mjs        # briefs/realism-backlog.md + site/realism.html
node scripts/landscape.mjs      # briefs/landscape-backlog.md + site/landscape.html
node scripts/life.mjs           # briefs/life-backlog.md + site/life.html
node scripts/surface.mjs        # briefs/surface-backlog.md + site/surface.html
node scripts/worldspace.mjs     # briefs/worldspace-backlog.md + site/worldspace.html
node scripts/openworld.mjs      # briefs/openworld-backlog.md + site/openworld.html
node scripts/thrive.mjs         # briefs/thrive-backlog.md + site/thrive.html
node scripts/data.mjs           # all world compilers + site/world-data.html
node scripts/lifegrammar.mjs    # vr/data/life/*.json -> vr/sim/lifeGrammar.js
node scripts/substrates.mjs     # vr/data/worlds/substrates.json -> vr/sim/substrates.js
node scripts/cover.mjs          # vr/data/worlds/cover.json -> vr/sim/coverTable.js
node scripts/landgram.mjs       # vr/data/worlds/processes.json + landforms.json -> vr/sim/landGrammar.js
node scripts/columns.mjs        # vr/data/worlds/columns.json -> vr/sim/columnTable.js
node scripts/worlddef.mjs       # definitions.json + features.json -> vr/sim/worldDef.js
node scripts/epochs.mjs         # vr/data/worlds/epochs.json -> vr/sim/epochTable.js
node scripts/techno.mjs         # vr/data/techno/sources.json -> vr/sim/technoTable.js
node scripts/capture-site.mjs # site/img/*.png — needs python3 -m http.server 8765
```

### Hand-written plans (not generated — edit these directly)

The biosphere rebuild has its own three-document set, because the evolution backlog says *what*
should be true and these say *why it is not yet* and *what to type*:

| Document | What it is |
|---|---|
| [`briefs/biosphere-audit.md`](briefs/biosphere-audit.md) | Measured evidence that deep-time evolution does not currently run — a 4.4 Gyr run reaches 25 lineages, zero transitions past LUCA, and O₂ = 0. Baselines, five root causes, and the perf wall at the 200-clade target. |
| [`briefs/biosphere-architecture.md`](briefs/biosphere-architecture.md) | The design: one source of truth, an evolvable body-plan module system (8 slots + 24 flags), state-gated transitions, affordance biases instead of scripted dates, and the presentation contract per zoom rung. |
| [`briefs/biosphere-plan.md`](briefs/biosphere-plan.md) | 437 numbered steps in six phases, 23 of them hard gates. Each step names a file, a symbol, and an acceptance test. |

Read them in that order. Start at plan step **P0-01**.

`living.mjs` is the only backlog that is not about being right. The eight before it made the
model correct; this one asks whether the thing on screen reads as a place where things are
happening. It is written around the product's own metaphor — a 3D planet you hold and a 2D
pixel map of one patch of it, at the same time — and its central finding is that **the flat map
costs like an animation and reads like a photograph**: `drawLocalView` runs from the render
loop, rebuilding a BFS patch and thousands of canvas stamps every frame, and draws the identical
image each time because every stamp is seeded from `hash2(c, 0x11fe)` — a hash with no time
term. Critical path: a presentation clock decoupled from the 10 kyr sim tick, persistent
individuals with real positions, one shared description of a cell consumed by both views, a
layered soundscape, a trace field, and a day phase.

`evolution.mjs` is the biosphere plan: how to rebuild life on a redox tower instead of an
eight-rung ladder, run it on a real geologic clock, let it evolve into a tree nobody authored,
and render the result well enough to believe.

`godgame.mjs` is the player-facing half of that: the manipulation grammar, consequence and
attribution, the economy of miracles, scenarios, embodiment, and the moral layer.

`landscape.mjs` asks the one question no other backlog asks: does anybody get to decide what
the land is? Until this pass `boot()` ended in `runGenerate(20260808, RULESETS[0])` — one
hard-coded integer, so every first run this project has ever shown was the same planet — and a
seed only ever moved the coastline, never the kind of world: six seeds of Earth all produce one
supercontinent holding ~98% of the land at a land fraction pinned to 29% by `fitSeaLevel`. The
hypsometric curve is a step, not a curve; the world you are handed has eight river cells; and
the ten land tools write straight into `W.h` with no layer, no selection, no preview and no
redo. This pass ships an openings table, thirteen landscape archetypes in
[`vr/sim/landscapes.js`](vr/sim/landscapes.js), and four sculpt-tool fixes; the 400 items are the rest
— a front door with pictures, a curve with a shelf in it, a stroke that is a path, and the layer
stack 22 other items are waiting on.

`openworld.mjs` audits the machinery the palette pass asked for, after it was built. The data
layer landed and it is real: `vr/data/worlds/` holds authored tables with compilers, and
[`definitions.json`](vr/data/worlds/definitions.json) is the join that was missing — selection
rules, not 120 files, with overrides counted because the count is how well the rules work.
`node scripts/data.mjs` runs every compiler and prints **dataratio** (authored rows / per-body
functions) and **newworldcost** (code sites a new world still needs). The palette preview lives
at [`site/world-data.html`](site/world-data.html).

The surface is no longer one byte deep. `stampStack` writes a fixed eight-layer per-cell column
(material + thickness in metres — 2.58 MB at N=96) from the recipe as initial condition; erosion
peels the top and deposition writes sediment. `W.substrate` is derived from layer zero. Saves
are version 7 and keep the stack. `applyWorldLook` stamps limb, haze and exposure bias from the
definition, so Mercury and Pluto are no longer on the same exposure curve, and named features
(`features.json`) attach to the squares `surfaceKeyAt` already paints. Surface colour is
reflectance × illuminant (`illum.js`): the same basalt under an M dwarf is redder. White balance
is a camera calibrated to the Sun, so Solar-System worlds do not shift. `pictureDisc.js` measures
the PAINT path as a 48px CPU disc — still not a GPU framebuffer, but the catalogue can no longer
collapse unnoticed.

What it has not replaced is the PAINT table. `planetLook.js` still carries the land/ocean
lambdas; adding a body that needs a new *shape* still touches `planetKind`, a stamp, and a PAINT
entry. The scoreboard exists so that number can fall.

Critical path from here: retire PAINT into data (`paintdata`), a headless GL harness so shader
faults are caught, then committed pixel baselines.

`thrive.mjs` is the pass about the layer the player actually watches — and about the planet
itself as something that can regulate, fight, notice, and (when labelled) think. It starts with
numbers taken from a twenty-line probe against the shipped code: on `terra` without `deepTime` —
the world the app opens with — **300 ticks advance `W.ageYr` by zero years**, because
`advanceClock` clamps to `PRESENT_YR` and returns `dtYr = 10`, and over the same 300 ticks
`meanLife` falls 0.1463 → 0.0911. On a 1.7 Gyr deep-time run **no being dies**, `maxAge` equals
the tick count, and 49 living lineages are drawn with **4 sprite kinds**. On modern Earth, 300
ticks produce **one settler, zero towns** and 60% reef sprites. `agentsTick()` is called from the
render loop at [`vr/main.js:1248`](vr/main.js), so none of the visible population is in
`runHeadless`, in `serializeRun`, or in the suite — where 1 of 542 assertions mentions a being.

The biology underneath is good and nothing that moves is connected to it: the food web computes
chirality-gated trophic links and applies them to one `censusPop` per lineage for the whole planet,
`W.trophic` is a global mean times three constants, `flock` and `hunger` appear nowhere in `vr/`,
and `gaiaPolicyTick` is four if-statements on two globals while `gaiaTick` computes resilience,
seven tipping elements, rate stress and a Medea score that no controller reads. Tipping organs
cannot tip (`_amoc ?? 0.7`, `_monsoon` permanently 0.5). The 611 items close both gaps — beings
inside the tick, energy and drives, birth and death, hunting on a cell, groups with a heading, a
per-cell trophic field, a colonisation front, settlements with a hinterland — and they build a
planetary mind from the same parts: perception from `gaiaTick`, drives from tips and rates,
actuators from the god verbs, a labelled fiction switch so Daisyworld stays a proof, a metabolism
you can see, organs as places, an immune stance toward the hand, silence as the catalogue default.
Agentic AI at 60 Hz is a drive vector scored against an authored action table, weights in the
genome. A 78-weight policy across 1400 beings is 109,000 multiply-adds. A generative model belongs
at authoring time, compiled to frozen data through the pattern `lifegrammar.mjs` proved.

`worldspace.mjs` is the palette pass: what a world *is* in this engine, what it is made of,
what happens when it has no surface, what its landforms should be, which moment in its history you
are looking at, and what comes after life. The headline measurement was the worst in any of these
documents: resolving all 120 catalogue bodies used to give **40 Io** (28 of 29 temperate worlds)
and **17 Mars** (every furnace world). That path is closed. Io now requires `tidalHeat > 0.8`
*and* airless; magma-ocean / furnace beats the dust stamp; the committed table is
[`vr/data/worlds/kinds.json`](vr/data/worlds/kinds.json). `worldAxes` computes seven numbered
axes per world (gravity, volatiles, dominant volatile, interior, insolation, age, resurfacing)
with units and provenance; the chip title prints them. Dominant volatile now gates the water
cycle, gravity sets the relief ceiling, snow line scales inventory, and tidal heat is
Io-normalised so the Moon no longer shares Io's overflow. Named Solar System bodies are still
regex validation cases. Kind is still one string. The substrate table is
[`vr/data/worlds/substrates.json`](vr/data/worlds/substrates.json): twenty-four materials,
`W.substrate` stamped at generate, Pluto nitrogen ice rather than sediment. `hydroTick` is told
which substance it is carrying (`cycleMaterial`); Titan rains methane, Pluto frosts nitrogen,
Mars CO₂ has no liquid window at 6 mbar. Thin CO₂ / N₂ atmospheres are a reservoir
(`W._atmScale`): Mars winter deposits polar frost and live pressure drops; Pluto thins at
aphelion. Cover (frost / dust / lag / tholin / grain) feeds CPU albedo; Iapetus two-tone and
Enceladus brightness are asserted from that field, not from the photograph globe, which still
keys off kind. Clathrate is a store with a T/P threshold (Titan holds; a warm seafloor releases).
Ice VI is a column layer when the recipe says so: Europa sits on rock, Titan includes ice VI,
a 2 R⊕ water world bottoms on ice VI and origin loses water–rock chemistry. The landform
grammar is first-cut data: `processes.json` + `landforms.json` compile to a per-world palette
and a `W.landform` overlay. Stamps still own the heightfield; Earth does not stamp; exo palettes
say invented. The column is first-cut data: `columns.json` recipes plus `columnAt` thicknesses
from the shell fields. Earth stays silent. Next is worlds with no surface.

Also still true: `stampGas` is nine lines that set `h`, `crust`, `age` and `seaLevel` to zero, so a
gas giant is a planet whose surface is entirely land at exactly sea level — 21 of 120 bodies are
giants. Temperate worlds now get Whittaker cover via `generic`; other bodies have a frost/dust/lag
field. `eraPatch` returns exactly `{ deepTime, startAgeGa }` and
`availableEras` returns `[]` unless the world is `earthLike`. The technosphere is `W.build[c]`,
a float, with four thresholds and no thermodynamics.

The physics for the replacement is already written and starting to be asked: `exophysics.js`
exports the cosmic shoreline, the radius valley, atmospheric retention, tidal heating, spin–orbit
resonance, snow lines and Roche limits. Jupiter's own note in `SEED_WORLDS` reads "Banded at a
Rhines scale set by a 9.9-hour day." Critical path: the no-surface stack
`nosurface` → `plevel` → `rhines` → `depthaxis`.

`surface.mjs` starts from two complaints about a screenshot — the planet has hard rectangular
edges on it, and the world is striped — and finds six bugs and one missing field. This pass
lands the cheap half and the contour/circulation follow-ups. The wash no longer greys the
planet (`washfix`, default is a rim); `vMixC0..3` and `sampleSphere` cross cube faces
(`stencilfix`); the field atlas is guttered `(N+2)` tiles so LINEAR cannot blend opposite
sides of the planet (`atlasfix`); overlays composite then bilinearise (`inklayer`).
`seamtest` asserts the topology. The stripes were real: atmospheric water is a per-cell field
(`vapourfield`), continentality is a BFS from the coast, biome colour blends by membership,
and the ocean ramp no longer saturates at 530 m. Drainage is primed before the world is shown;
coasts are a marching-squares polyline (`isoline`) drawn on the globe and the map; wind is
geostrophy of a pressure field rather than sine bands (`pressfield`); erosion deposits where
it carves and ice lowers the bed (`sedfield`, `glacio`). Vertex colour is Bayer-dithered.
The picture is under a CPU artefact test (`node vr/sim/surfaceStats.js`). What remains is a
GPU framebuffer `pixtest` (shader-only faults), stratigraphy, soil depth, and the leftover
latitude shortcuts.

`life.mjs` asks whether the biology could ever have come out differently. Measured first:
evaluating `bodyPlanFromTraits` across 20,736 trait vectors gives **26 distinct body plans and
six sprite kinds** — the entire creature space of a game about evolving life on other planets —
and `pigmentBias` was constant at 0.5 on every creature ever drawn because the code read
`TRAITS.thermalOpt`, which is not a key of `TRAITS`. The word "eye" appeared nowhere in
`vr/sim/`; the only sensory quantity was `photonUsable`, one scalar per planet from a
three-branch step on stellar temperature. Evolution itself was a Gaussian on eleven floats, so
the largest structural change a lineage could undergo was a number moving by 0.05.

This pass ships the data layer that lifts the ceiling. [`vr/data/life/`](vr/data/life/) holds the
authored grammar — ten categorical axes, eight counted axes (symmetry order is an integer 0–12,
so pentaradial is reachable and organ counts follow from it), 27 organs with mass and power costs,
19 receptor bands with their physics, and seven solvents with measured dielectric constants —
compiled by `scripts/lifegrammar.mjs` into [`vr/sim/lifeGrammar.js`](vr/sim/lifeGrammar.js).
[`vr/sim/genome.js`](vr/sim/genome.js) is a JSON genome with the operators that actually make
novelty: loss, duplication, divergence of a duplicate into another band, gain, whole-genome
duplication, and developmental locking that hardens with clade age.
[`vr/sim/sensory.js`](vr/sim/sensory.js) decides band by band what a world delivers, from the
Planck photon spectrum of its star, the transmission of its atmosphere and medium, the photon
energy against the 1.5 eV pigment threshold, and 1.22 lambda over D against the body's own aperture.

Measured with it: Earth ranks red, green, blue. TRAPPIST-1e ranks chemical sensing first and red
fourth, because its 1132 nm peak is below the energy any pigment can use. A Europa ocean under
15 km of ice ranks chemical, then electroreception, then flow sensing. And a microwave eye is not
a pigment at all — 1.24 meV is 0.05 kT — so it has to be an antenna, and the diffraction limit
says imaging at human acuity needs a 70 m aperture, which makes it a body-size problem rather
than an impossibility. The morphospace goes from 26 bodies to 1.6 x 10^28, the HUD now names the
dominant lineage's body from its own genome, and `vr/sim/test.mjs` goes from 110 to 135 assertions.

Its critical path starts somewhere else entirely, because the grammar is a ceiling and not an
achievement: measured over 3.2 Gyr at N=32, `meanLife` **falls** from 0.0226 to 0.0013, O2 stays
at 0.0000, and the tree reaches six lineages with a maximum depth of one. `biomass` first, then
`popscale` and `specmech`, then `foodweb` and `biotic`, then `procsprite` — because until a
pentaradial animal with three near-IR eyes is drawn as one, all of this is a number in a log file.

`next.mjs` is written against what those two left behind. The simulation and the god layer are
both built; this pass starts closing the gap on picture, machine, and audience: field textures
on the GPU, seeded RNG everywhere, golden-run tests, host stars as objects, morphology from
traits, and finale export.

Implemented systems under `vr/sim/`: `time`, `carbon`, `redox`, `evolve`, `lifeGrammar`,
`genome`, `sensory`, `ecology`,
`extinction`, `alien`, `instruments`, `meta`, `calibrate`, `rng`, `assert`, `star`,
`morphology`, `finale`, plus the god layer in `vr/sim/god/` — brush, receipts, thermo
economy, guild seeding, crust/plate sculpt, climate levers, disasters, genesis,
scenarios, observe, notice, shelf.

Lab tab exposes cores, Keeling/diversity sparklines, redox gauge, transit spectrum,
paper + save + finale export. **God** tab: guild picker, brush mask/snap, scenarios,
genesis, undo-the-act, FF→anomaly, let-it-run, shelf + seed string.

Climate fields (temp / moist / ice / clouds / wind) run on the **GPU** when float
framebuffers are available (`vr/sim/gpgpu/` — multi-slot, resident readback every 4th
tick). Bio, redox and phylogeny stay on the CPU; headless golden tests always use CPU climate.

Also in this layer: **runtime N**, multi-scatter clouds, ice-shell stack, XR hands,
orrery table, and a **Sky** dock tab — live tide/weather instruments with day, tilt,
season, and moon levers.

```bash
npm test --prefix vr          # pure helpers + golden run + Earth calibrate
npm run golden --prefix vr    # hash reproducibility only
node vr/sim/calibrate.mjs     # modern Earth tolerances
```

## Probes

Headless validation commands (run from repo root):

```bash
node vr/sim/test.mjs                              # unit + golden + calibrate
node vr/sim/headless.mjs --golden                 # field hash reproducibility
node vr/sim/calibrate.mjs                         # modern Earth tolerances
node vr/sim/deeptime.mjs --n=32 --ticks=500       # deep-time evolution probe
node vr/sim/deeptime.mjs --n=32 --ticks=4000 --seeds       # five-seed evolution gate
node vr/sim/deeptime.mjs --n=32 --ticks=5500 --every=500 --seed=20260808 --wall
node vr/sim/scale.mjs --lineages=250 --n=64       # phylogeny scale benchmark
```

Lab: overlay modes, PNG export of charts, Dual worker hash check, finale artefact, Earth
diversity comparison curves.

`tides-weather.mjs` is a focused batch on two systems with opposite problems. **Tides do not
exist** — `setMoon` issues a receipt reading "tides resume" and nothing does; there is no tidal
potential, no range field, no intertidal zone. **Weather is in the code and invisible on the
planet** — `computeWinds` prescribes three latitude bands scaled by `1 / rotationPeriod`, so spin
changes wind *speed* and never the *banding*, because with no pressure field there is nothing for
the circulation to be a solution to.

`geology.mjs` is a deep dive on the geosphere in three layers. The first is a moment
before the clock starts — there is still nowhere to stand between "nothing" and "running",
so the landscape can only be rerolled, never chosen. The second is the rock physics of a
mobile lid: `plates.length` never changes so no ocean basin can close, every boundary is a
Voronoi edge, `rock` is one byte, no fault has a trace, no volcano has an edifice, and
nothing hydrothermal exists. The third is the rest of the solar system.
`planetKind` now stamps Mars, Venus, Io, the Moon, Mercury and the ice bodies so they no
longer share a Voronoi Earth; the remaining work is making each of those maps do the
geology that world actually does — Tharsis reorienting Mars, Venus foundering, Io burying
itself, Europa cracking on a 3.55-day tide.

`exoparams.mjs` is the largest of the backlogs and the one about honesty. The catalogue names
120 real bodies; the seed parameter table in that script is now emitted to
[`vr/worldParams.js`](vr/worldParams.js) and consumed at runtime through
[`vr/sim/worldRecord.js`](vr/sim/worldRecord.js) — radius, mass, orbit, host, pressure and
albedo drive the ruleset instead of name-matching alone. Re-generate with
`node scripts/exoparams.mjs`. Refresh archive numbers with
`node scripts/fetch-exoarchive.mjs` (writes a committed snapshot under `vr/data/`).

Model boundaries: [`briefs/model-limits.md`](briefs/model-limits.md).
Calibrate Earth: `node vr/sim/calibrate.mjs`

`currents.mjs` is the fluid-dynamics pass — oceans, weather patterns, magma and moving rock.
Its finding is that **every fluid in the model is prescribed or absent, and all of them are
blocked behind one missing object**: there is no tangent frame, so `advect()` in `atmo.js`
assumes `NBR` indices 0/1 are east/west and 2/3 north/south, which is false on the ±Y faces.
Downstream of that: `ocean.js` has no velocity field at all, so there is no gyre and no Gulf
Stream; there are three unconnected AMOCs (`W.conveyor`, `W._amoc`, `W.thermohaline`) and the
tipping element reads the one that is written once as `?? 0.7`; `atmoTick` computes a wind field
with `computeWinds`, advects with it, and then `world.js` throws it away and calls
`geostrophicWind`; ENSO, Ekman and vorticity do not appear anywhere in `vr/`; and crustal
thickening lives only in `generateTectonics`, so two continents can converge for a billion
years without raising a metre of mountain. Critical path: `basis` → `advect2` → `oceanvel`
→ `gyre`/`moc` → `progatm` → `enso`, with `isostatick`/`orogen`/`magmachem` in parallel.

`realism.mjs` is the rendering pass — the globe, the pixel map, and what has to be true
underneath for either to read as a place rather than a diagram. It was written by auditing the
renderer against the running build, and seven faults were found and fixed in the process. The
largest: `uField0.a` bit-packed sediment into the low nibble and cloud into the high nibble of a
texture sampled `LINEAR`, so hardware interpolation ran across the nibble boundary and painted a
tan sediment contour stair-stepping across four kilometres of open ocean at every 1/16 of cloud
cover — visible as terraced bands over the whole sea on every world. Also fixed: the atmosphere
shell was never tonemapped and clipped the sunward limb to flat white; the moon was drawn with
`healthProg`, whose entire fragment shader is `o = vec4(uCol, 0.85)`; the ocean specular was a
Blinn-Phong lobe that blew out at every sun angle and is now GGX with wind-driven roughness plus a
Fresnel sky term; the cloud shell sampled coverage nearest-neighbour on a lattice a quarter of the
grid resolution and displaced it radially, terracing every band edge; and the sea-ice and lightning
hashes were anchored to the *world* normal, so both patterns swam as the planet turned. The surface
also gained two octaves of object-space detail — an albedo mottle and a sun-direction relief term,
faded out by `fwidth` before either period reaches the sampling limit — because a cell is 250 km
across and there was nothing at all between that and a footprint. Cloud is now 8-bit, and
precipitation and river discharge reach the surface shader for the first time.

Its critical path: `gputime` and `imgtest` first, because the picture has never been measured and
has no test; then `seamfix`, `floatfield`, `gpubasis` and `gpucolour`, because the field atlas is
corrupt in a one-cell band around all twelve cube edges and the picture is currently computed three
times in three files; then `hdrbuf`, `material`, `lodmesh`.

A second pass of 400 items sits on top of that pipeline and asks a different question: does this
read as Earth itself, as a modern SimEarth? `uEarth` currently turns the vegetation mix down so the
result is quieter rather than truer; `seedEarthBiosphere` paints life by latitude belt;
`calibrate.mjs` asserts climate scalars and has never asserted a colour; `scaleXR` is a joystick
axis clamped between 0.07 and 0.95. The photograph path is `bluemarble` / `truecolor` / `eoref`
(dark ocean, dark forest, a shelf of NASA stills), then `limbvol` and `coastline` (the two edges
that survive a thumbnail), then `phenology`, `lights` and `gaiaface` (the year, the cities, the
face), then `zoomspan` and `holdfeel` (one descent, a planet you can actually hold).

`worlds.mjs` carries the plan for turning the five invented rulesets into a catalogue
of real planets and moons. The in-app Worlds drawer lists playable bodies only;
engine and product items stay in [`briefs/worlds-backlog.md`](briefs/worlds-backlog.md).
Its figures come from the NASA Exoplanet Archive
`pscomppars` table; re-query it with:

```bash
node scripts/fetch-exoarchive.mjs
# or a one-off TAP sample:
curl -sG https://exoplanetarchive.ipac.caltech.edu/TAP/sync --data-urlencode "format=csv" --data-urlencode "query=select pl_name,pl_rade,pl_bmasse,pl_orbper,pl_orbeccen,pl_insol,pl_eqt,st_teff,st_spectype,sy_dist from pscomppars where pl_name like 'TRAPPIST-1%'"
```

This research has made use of the NASA Exoplanet Archive, which is operated by the
California Institute of Technology, under contract with the National Aeronautics and
Space Administration under the Exoplanet Exploration Program.