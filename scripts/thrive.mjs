#!/usr/bin/env node
// Single source of truth for the ORRERY thrive backlog.
// Emits  briefs/thrive-backlog.md  and  site/thrive.html.
//
//   node scripts/thrive.mjs
//
// 611 items on life that grows while you watch — and on the planet itself as
// something that can regulate, fight, notice, and (when labelled) think.
// Ecosystems, hunting, swarms, cities, the in-app drive model, and a planetary
// mind built from the same parts: perception, drives, memory, verbs, a budget.
// Sentience items live in scripts/thrive-p6.inc.mjs and are imported as P6.
//
// Written by auditing the shipped biosphere against the thing it is supposed to
// show. The headline is measured, not asserted: on the world the app opens with,
// 300 ticks advance the clock by zero years and the biosphere shrinks 38%.
//
// k:  MODEL = what the simulation computes
//     SHOW  = what reaches the screen — globe, grid of squares, readouts
//     PLAY  = a verb the player gets
//     PROVE = the measurement or test that keeps it honest
// e:  effort S/M/L.  i: impact 1..3.
// g:  capability token this item provides.  n: tokens it needs first.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { P6 } from './thrive-p6.inc.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = [
  ['clock', 'Three hundred ticks, zero years',
    'Measured: on `terra` without `deepTime` — the world the app opens with — 300 ticks advance `W.ageYr` by **exactly zero years**, because `advanceClock` clamps `ageYr` to `PRESENT_YR` and then sets `dtYr = 10`. Over those same 300 ticks `meanLife` falls from 0.1463 to 0.0911, a 38% decline, and `W.tree.living` stays at 4 — the four lineages `seedHoloceneTree` planted. Nothing grows before your eyes on the default world because time is not passing and the only trend is downward.'],
  ['outside', 'The visible life is not in the simulation',
    'Landed (partial). `agentsTick()` now runs inside `simTick` in `vr/world.js`, so beings participate in headless runs and the thrive test slice. Save **v8** stores build, settlements and every live individual (`packEntities` / `restoreEntities`). The suite has a dedicated beings / settlements / fire block — not one assertion. Still open: resolution remap, behaviour genome in saves, energy/hunger, birth/death as objects.'],
  ['being', 'A being with no inside',
    'Partial. Individuals now carry **energy**, **hunger** and **fear**; Kleiber metabolism, grazing, birth (`tryBirth`), death with cause (starved, burned, hunted, old age), and chase hunts for predators. Still missing: memory, territory, full behaviour genome, field↔being contract.'],
  ['census', 'Nothing is born and nothing dies',
    'Partial. `tryBirth` spends parent energy and writes `parentId`; deaths carry causes; fire kills; predators chase and kill. On thrive, `topUpEntities` is off and an empty world stays empty after the first seed — closed book, births only. Pinned terra still tops up for calibration.'],
  ['hunt', 'Nothing hunts anything',
    'Partial. Predators chase within two cells; hits transfer mass×efficiency into energy and drop a carcass; misses raise `preyFear`. Overlays Fear and Carcass. Still open: long-range path, defence/cover as genome spend.'],
  ['swarm', 'The word flock does not appear anywhere',
    'Landed (first cut). Named groups with `home`/`goal`; fission when oversized, fusion when small same-kind herds meet. Migration routes still open.'],
  ['spread', 'A range with no front',
    'Colonisation in `bioTick` is `max` over the four neighbours: if a neighbour is above 0.2 the cell grows at 0.28 instead of 0.1. That is a diffusion, and it produces the one thing a spreading biosphere should never look like — an isotropic stain. No corridor, no barrier, no dispersal distance, no founder effect at the edge, no invasion that arrives from somewhere and outcompetes what was there.'],
  ['guild', 'An ecosystem is four scalars',
    'Landed (first cut). `trophProd/Herb/Carn/Decomp` per cell plus occupancy from grazing and hunts. Overlay Trophic. Planet means follow the fields, not npp×0.1.'],
  ['patch', 'The grid of squares',
    'The local view is the one place a player is close enough to see behaviour, and it draws life from two arrays: `life[c]` and `lifeClass[c]`. Ten `stamp*` functions — mats, stromatolites, daisies, ocean life, ice life, flora, ambient fauna, buildings — key off a scalar and a class index. `stampAmbientFauna` calls `stampBug`. Nothing on that grid is doing anything; the tile is a still life that changes slowly.'],
  ['globe', 'Seventy-two overlays and not one is behaviour',
    'The overlay table runs from temperature through vorticity, upwelling, ENSO, sea state, crust age and the technosphere. It has `npp`, `guild`, `diversity` and `range` — four biosphere fields, all of them state. None of the 72 shows a rate, a flow, a movement or an interaction: no migration, no predation pressure, no colonisation front, no settlement growth. The globe can say where life is and never what it is doing.'],
  ['town', 'Three hundred ticks, one settler, zero towns',
    'Measured on modern Earth with agents running for 300 ticks: 326 beings alive, **1** of kind 5, `meanBuild` 0.00000, `W.cities` empty. `kindForCell` gives a settler a `0.03 + build × 0.2` chance on `earthLike`, and `agentsTick` scales the build rate by 0.12 there, so the loop that is supposed to raise towns is throttled to roughly nothing. On the same run 196 of 326 beings — 60% — were reef sprites.'],
  ['civ', 'A ladder of eight envelopes',
    '`LIFE_CLASSES` is eight rows from prokaryote to mammal, each an O₂/temperature/moisture envelope, and `W.unlockedClass` is one integer for the planet. Everything downstream reads it: which sprite a cell gets, whether a settler may exist, how fast a settler builds. A civilisation is therefore a number between 0 and 7 that the whole world shares, and `technoTick` hangs a technosphere off it.'],
  ['drive', 'What agentic AI honestly means at sixty hertz',
    'The ask is real and the honest version is specific: a language model cannot run inside a tick, but a **drive vector** can — a small utility model per being, evaluated against what it can perceive, scored, and acted on. Utility AI, GOAP, behaviour trees and a forty-weight network evolved by the same selection that already shapes bodies all fit in the budget. `vr/sim/gpgpu/` already exists, so thousands of tiny evaluations per frame is a solved shape here.'],
  ['mind', 'A brain that costs something',
    'The organ table has a brain and `phasedArray` is gated on it, and `sensory.js` decides band by band what a world delivers to an eye. So the pieces of a mind that is *earned* rather than assumed are already here: perception from physics, an organ with a metabolic price, and a genome that can gain or lose it. What is missing is the step where having a brain changes what a being does.'],
  ['learn', 'Learning within a life, culture between lives',
    'Evolution in this product is genetic and generational. The two faster loops are absent: an individual that changes its behaviour because of what happened to it, and a behaviour that passes from one individual to another without passing through a genome. Both are cheap, both are visible in seconds rather than eons, and both are what makes a watched world feel inhabited rather than simulated.'],
  ['gaiamind', 'Gaia is four if-statements',
    'Partial. The Gaia **button** cycles Regulator / Gardener / Experimenter (`gaiaDrive.js`). It reads mood, tip proximity, rate stress and resilience before nudging solar/CO₂. Still writes those two globals (not god verbs yet). Daisyworld is emergent; the cheat thermostat still pins when set.'],
  ['sentience', 'What it would mean for a planet to be sentient',
    'Watson and Lovelock never claimed a mind. The code already knows this: `W.gaiaMode` is `survivorship`, `transient` or `tutorial-feedback`. Sentience here is a labelled mode with the same four parts a being gets — perception, drives, memory, action — running on the planetary state vector, acting through the player\'s verbs, on the player\'s budget, able to be wrong and able to die. Anything else is a thermostat with a face drawn on it.'],
  ['pdrive', 'The same drive architecture, one level up',
    'Partial. Autopilot dispositions are named objectives on the planetary state vector. Beings still use hunger/fear; planet scale now names Regulator / Gardener / Experimenter.'],
  ['metab', 'A metabolism you can see',
    'Earth as a face is fluxes: carbon in, carbon out, albedo up, ice back, a northern inhale every summer. `W.health` is a blend of diversity, meanLife, temperature error and rate stress, and the disc does not change when it moves. A sentient planet that does not breathe on screen is a number. The carbon module, NPP, ice, haze and `disequilibrium = sqrt(O2 × CH4) × 200` are already the lungs; they are not drawn as lungs.'],
  ['homeo', 'Homeostasis that is physics, not a checkbox',
    'The Walker thermostat in `gaia.js` is a CO₂ leak of `0.0000004` from warm wet land, skipped entirely when `W.carbon` exists. `iceTick` floors land ice above 0.86 and sea ice above 0.88 so the caps cannot die. Daisyworld is the one place regulation is genuinely emergent, and it is a selectable planet rather than the tutorial it should be. A mind that cheats the physics it claims to inhabit is not a mind.'],
  ['tipgeo', 'Tipping elements as places',
    '`TIPPING` lists iceSheet, amoc, amazon, boreal, permafrost, coral, monsoon. Six of seven are geography. `W._amoc` is written `W.conveyor ?? W._amoc ?? 0.7` and never diagnosed; `_monsoon` is a constant 0.5; amazon reads `_forestFrac` as forest-over-land for the whole planet; coral reads `meanTemp`. A list that cannot trip is a vital-sign lie, and a sentient planet whose organs cannot fail is a cartoon.'],
  ['immune', 'The planet fights back',
    '`god/disaster.js` already has `releasePathogen` and `pathogenTick`. `god/sculpt.js` has `resistTick`. Impacts write craters. None of this is an immune system: a wound with a recovery clock, a fever that is a greenhouse overshoot, antibodies that are weathering and ice and storms answering a hand, scars that are hysteresis. The player is either a symbiont or a pathogen. The planet has to be able to tell the difference, and to lose.'],
  ['planetsee', 'The planet notices the hand',
    '`notice.js` is civilisation: awareness from `interventionLog`, worship styles, a prayer queue, eight named people. The biosphere does not notice you at all. `playStyle` and `restraintStats` in `receipt.js` already classify the god; `forecastAct` already predicts a tool. Those numbers are sitting on the table and Gaia never picks them up. A sentient planet that cannot tell a brush stroke from weather is not looking.'],
  ['mood', 'A mood that is a readout, not a story',
    'Landed (first cut). `gaiaTick` projects valence/arousal into `W.mood.label` (calm, burning, frozen, fever, bloom, restless). HUD shows it. Voice and face still open.'],
  ['alienmind', 'A mind that is not Earth\'s',
    '`gaiaTick` runs on every world. A Mercury with a resilience score is a category error; a lava ocean with seven Earth tipping elements is a joke. Titan\'s mind if any is a haze; Europa\'s is a chemical gradient under ice; Venus is a failed regulation with a face; Mars is the archaeology of one. The 120-world catalogue is the experiment that decides how often regulation happens, which is Chopra and Lineweaver\'s bottleneck made playable.'],
  ['gaiaface', 'The face of the planet',
    'SimEarth\'s Gaia window was three analog gauges. Ours is a HUD chip that says `Gaia on` or `off`, a Lab line with `feedbackGain` and `medeaScore`, and an orb colour from `W.health`. A green planet can be a monoculture; a brown one can be a healthy desert. The face has to be the metabolism, the tips as places, and a fight you watch — or Gaia is a setting.'],
  ['author', 'Where a language model actually belongs',
    'Not in the tick. At authoring time: proposing guild tables, naming clades and settlements, writing the chronicle sentence, generating behaviour trees that get **compiled to frozen data** and reviewed, exactly as `lifegrammar.mjs` compiles authored JSON into `lifeGrammar.js`. The pattern this repo already trusts is author-then-compile-then-validate, and that is the pattern that makes a generative model safe to depend on.'],
  ['budget', 'What a thousand lives cost at sixty hertz',
    '`MAX_ENT` is 1400, capped to 560 on Earth-like worlds, at 8 floats each — 45 KB of position data. The tick budget is stated in code: `simTick` plus `agentsTick` over 12 ms triggers `noteDroppedTicks` and the accumulator is dumped. So the whole of behaviour, population and settlement has to fit in single-digit milliseconds, at `N_ALLOWED` up to 768 — 3.5 M cells. Any design here that does not state its cost is not a design.'],
  ['read', 'Reading a living world',
    'The chronicle logs births of towns, extinctions and tipping points, and `viewCensus` counts kinds in the local view. What no readout answers: who is eating whom right now, which population is rising and which is falling, where the front is, which settlement is growing and why, what the biosphere is trying to do. A living world needs a running account, not a state dump.'],
  ['prove', 'Five hundred and forty-two assertions, one about a being',
    '`vr/sim/test.mjs` has 542 `ok(` calls covering Eigen thresholds, Kleiber scaling, chirality, genome round-trips and a 24-tick biosphere that must not collapse. Exactly one mentions an agent, a city or a behaviour. Every claim in this backlog is a claim about something that moves, and the measured facts in the audit above were all found in an afternoon with a twenty-line probe — which is the strongest argument for building the probe into the suite.'],
];

const P1 = [
/* --------------------------------------------------------------- clock -- */
{c:'clock',t:'Unpin the present',g:'unpin',d:'`advanceClock` clamps `ageYr` to `PRESENT_YR` and returns `dtYr = 10` on the calibration Earth, so the world the app opens with cannot advance. Measured: 300 ticks, zero years elapsed. The calibration Earth has to stay reproducible, so the fix is a second mode — Earth at the present that is allowed to keep going — not a change to the pinned one.',k:'MODEL',e:'M',i:3},
{c:'clock',t:'A biology clock that is not the geology clock',g:'biotime',n:['unpin'],d:'`adaptiveTickYears` gives one `dtYr` to tectonics, carbon, phylogeny and behaviour alike. At 5 Myr a tick, a generation is invisible; at 10 years a tick, an orogeny is. Life needs its own rate — generations per tick — advanced by the same wall clock but scaled separately, which is what makes evolution watchable without freezing the mountains.',k:'MODEL',e:'L',i:3},
{c:'clock',t:'Generations, not years',n:['biotime'],d:'The unit that matters for watching evolution is the generation, and it is species-specific: a microbial mat turns over in hours, a tree in a century. Derive generation time from body mass through the same Kleiber relation `kleiberDensity` already uses, and let each lineage accumulate generations at its own rate inside one tick.',k:'MODEL',e:'M',i:3},
{c:'clock',t:'Four times is not fast',g:'livespeed',d:'`simAcc += dt * (W.fastForward ? 4 : 1)` — fast-forward is a 4× multiplier on an accumulator that is already gated at 0.09 s and abandoned above 12 ms. So the maximum observable rate is fixed by a frame budget rather than chosen. A speed control that means something needs sub-stepping the cheap systems many times per expensive one.',k:'MODEL',e:'M',i:3},
{c:'clock',t:'Substep life inside one climate tick',n:['livespeed','biotime'],d:'Climate, ocean and tectonics are the expensive systems and the slow ones. Ecology, behaviour and population are cheap and want to run often. Run life N times per climate tick with N from the speed control, and the same frame budget buys an order of magnitude more biological time.',k:'MODEL',e:'M',i:3},
{c:'clock',t:'Say what the rate is, on screen',n:['livespeed'],d:'`W.dtYr` exists and the interface shows an age, not a rate. Print generations per second and years per second beside the clock, because the single most common confusion in a deep-time game is not knowing whether nothing is happening or nothing is being shown.',k:'SHOW',e:'S',i:3},
{c:'clock',t:'A speed dial with named stops',g:'speeddial',n:['livespeed'],d:'Live, seasonal, generational, millennial, geologic. Each stop states its `dtYr`, which systems are sub-stepped and which are frozen, so the player is choosing a regime rather than a multiplier. `fixedDtYr` already exists as the override hook.',k:'PLAY',e:'M',i:3},
{c:'clock',t:'Never advance time without advancing something visible',n:['speeddial'],d:'The measured failure is 300 ticks with a still picture. Any tick that changes no visible field is a tick the player experiences as a hang. Assert it: over 100 ticks at every speed stop, at least one of life, population, range or build must change by a stated amount.',k:'PROVE',e:'M',i:3},
{c:'clock',t:'The declining default',d:'Measured: `meanLife` 0.1463 → 0.0911 over 300 ticks on the default world, a 38% fall with no forcing applied. Something in the modern-Earth path is a net sink. Find it before building anything on top, because every growth feature will be fighting it.',k:'PROVE',e:'S',i:3},
{c:'clock',t:'A growth budget per tick',n:['biotime'],d:'`bioTick` grows at `hab * frontier + nl * hab * 0.14` and dies at 0.035 or 0.06 per tick. Those are per-tick constants in a world whose `dtYr` spans 10 to 5,000,000. Rates have to be per-year and integrated, or the same model is a bloom at one speed and a collapse at another.',k:'MODEL',e:'M',i:3},
{c:'clock',t:'Make the fast-forward halt conditions biological',d:'`shouldHaltFF` stops the fast clock on anomalies. Add the biological ones: first predation, a lineage crossing 10% of the surface, a population crash over 50%, a settlement reaching city stage. Fast time should stop for the things worth watching.',k:'PLAY',e:'M',i:3},
{c:'clock',t:'Seasons that life can feel',d:'`nppField` has a green wave — `phenology` from `W.season` and latitude — and it is the only seasonal thing life reads. Migration, breeding windows, dormancy and mast years all hang off a seasonal phase that already exists and is used once.',k:'MODEL',e:'M',i:2},
{c:'clock',t:'A day, for the things that keep to one',d:'`isOutNow` in `present.js` already gates a being on a diel cycle and `pickBehav` reads it. That is the seed of a real activity budget: nocturnal, diurnal, crepuscular, tidal — each with a metabolic and a predation consequence rather than a rest-probability.',k:'MODEL',e:'M',i:2},
{c:'clock',t:'Tie generations to the tide where it matters',d:'`tideRange` and `intertidal` are computed fields and the intertidal is where spawning clocks come from on the real planet. A moon that sets a breeding cycle is a physical parameter with a visible biological output, which is this product at its best.',k:'MODEL',e:'M',i:2},
{c:'clock',t:'A run that is meant to be watched, not left',d:'The deep-time path is designed for a probe: 300 ticks, 1.7 Gyr, print a summary. The watched path needs the opposite defaults — slower time, faster life, more events per minute. State which of the two any given ruleset is for.',k:'MODEL',e:'S',i:2},
{c:'clock',t:'Catch up rather than drop',d:'`noteDroppedTicks` dumps the accumulator when a tick exceeds 12 ms, so a heavy frame silently loses simulated time. For behaviour that is fine; for population it is a leak. Mark which systems must be conservative under a dropped tick and integrate them on the wall clock instead.',k:'MODEL',e:'M',i:2},
{c:'clock',t:'One frame, one seed, one answer',d:'`rngOf(W, \'rngAgents\')` gives behaviour its own stream, which is right. But `agentsTick` runs off the render loop, so the number of behaviour ticks depends on frame rate — the same seed on a fast machine produces a different world. Moving beings into `simTick` fixes it; until then it should be stated.',k:'PROVE',e:'S',i:3},
{c:'clock',t:'Let the player scrub back',d:'`forkRun` exists and `serializeRun` is at version 5. A biosphere you can rewind ten thousand years to watch a radiation again is the single strongest way to make evolution legible, and the save path is most of the machinery.',k:'PLAY',e:'L',i:3},
{c:'clock',t:'The chronicle as a timeline, not a log',d:'`W.chron` is an append-only list rendered as text. The same data on a horizontal axis, with lineage bands, extinction pulses and settlement founding marked, turns a scrolling log into the shape of a history.',k:'SHOW',e:'M',i:3},
{c:'clock',t:'A stated eons-per-minute target',d:'Pick the number and defend it: the Cambrian in a minute, the Phanerozoic in ten, a civilisation in five. Every rate constant in this backlog then has a target to be tuned against instead of being tuned by feel.',k:'PROVE',e:'S',i:3},

/* ------------------------------------------------------------- outside -- */
{c:'outside',t:'Move beings inside the simulation tick',g:'entsim',d:'Landed. `agentsTick()` runs from `simTick` in `vr/world.js`, not the render loop. Beings are part of the world clock, headless runs and saves.',k:'MODEL',e:'M',i:3},
{c:'outside',t:'Beings in the headless runner',n:['entsim'],d:'Landed. `runHeadless` ticks the full sim; `scripts/thrive-probe.mjs` and `vr/sim/livemetric.js` report population, settlements and fire.',k:'PROVE',e:'S',i:3},
{c:'outside',t:'Beings in the save',g:'entsave',n:['entsim'],d:'Landed (v8). `serializeRun` stores build, cities and `entities.list`; `loadRunMeta` restores clock, build and population. Resolution change still wipes beings.',k:'MODEL',e:'M',i:3},
{c:'outside',t:'A being count that survives a resolution change',n:['entsim'],d:'`changeResolution` reallocates every field and `respawnEntities` wipes and refills from scratch, so changing detail level kills the entire population. With beings holding cell indices this needs a remap, which is exactly the kind of thing that is invisible until somebody asserts it.',k:'MODEL',e:'M',i:2},
{c:'outside',t:'One assertion, today',n:['entsim'],d:'Landed (first slice). `vr/sim/test.mjs` has a beings block: population in `simTick`, determinism, generate reset, settlements, fire, herds, plumes, save round-trip. Birth/death objects and twenty assertions remain.',k:'PROVE',e:'S',i:3},
{c:'outside',t:'A reset that actually resets',n:['entsim'],d:'The generate-reset test in the world-space pass found a vent field carrying 173 vents from one planet to the next. `ENT` is a module-level singleton with `_idSeq` never reset and `resetMorphAtlas` called only from `respawnEntities`. Assert that generating a new world leaves nothing behind.',k:'PROVE',e:'S',i:3},
{c:'outside',t:'Beings are a view of the population, or they are the population',n:['entsim'],d:'Right now they are neither: `topUpEntities` samples `life[c]` to invent individuals, and those individuals then edit `build[c]` and `h[c]`. Pick one architecture. The honest one for this product is a two-level model — fields carry biomass, beings are sampled representatives that can also act — and it has to be written down.',k:'MODEL',e:'M',i:3},
{c:'outside',t:'A stated contract between field and being',n:['entsim'],d:'If `life[c]` is biomass and a being is a sample of it, then the number of beings on a cell is a function of that biomass and the beings\' actions feed back into it. Both directions exist by accident today. Write the contract, assert conservation across it, and the two-level model stops being a leak.',k:'MODEL',e:'M',i:3},
{c:'outside',t:'Stop respawning the world every time it changes',d:'`respawnEntities` is called on generate and again from `main.js:439`, and it calls `resetMorphAtlas` and rebuilds from zero. Any long-lived individual — a named settler, a matriarch, a lineage founder — is destroyed by a routine event. Incremental repopulation is the requirement, not the optimisation.',k:'MODEL',e:'M',i:3},
{c:'outside',t:'Frame-rate independence, asserted',n:['entsim'],d:'Landed. Same seed + same `simTick` count → identical population signature in the beings block.',k:'PROVE',e:'S',i:3},
{c:'outside',t:'A budget line for beings',n:['entsim'],d:'`W._msSim` records the sim tick and `agentsTick` is currently outside it, so the cost of the population is invisible in the only performance number the app keeps. Time it separately and show it, because every item in this backlog spends from that line.',k:'PROVE',e:'S',i:3},
{c:'outside',t:'Cities in the tick, not on the frame',n:['entsim'],d:'`settleCities(W)` is called from `agentsTick` every 40 years of `W.year`, which means from the render loop. A settlement is a simulation object; it belongs on the simulation clock, and it needs to exist in headless runs before anything can be claimed about urban growth.',k:'MODEL',e:'S',i:3},
{c:'outside',t:'The population is a field too',n:['entsim'],d:'`rebuildBuckets` already builds a per-cell linked list of beings each tick. Keeping a `Uint16Array` count per cell alongside it gives every other system — predation, disease, grazing pressure, settlement demand — an O(1) query it currently cannot make.',k:'MODEL',e:'S',i:3},
{c:'outside',t:'A being belongs to a lineage, and the lineage should know',n:['entsim'],d:'`m.popId` points at a tree node and `lineageAt` resolves the reverse. But `node.pop` and `node.censusPop` are computed from cells, not from beings, so the tree and the visible population can disagree without anything noticing. One of them has to be the truth.',k:'MODEL',e:'M',i:3},
{c:'outside',t:'Kill the second cap',d:'`MAX_ENT` is 1400, `capForWorld` returns 560 on Earth-like worlds, `respawnEntities` computes a stride from the cap, and `topUpEntities` refuses to run above 85% of it. Four interacting limits decide how alive a world looks, and none of them is a stated design choice.',k:'MODEL',e:'S',i:2},
{c:'outside',t:'What happens to a being when the world ends',d:'`extinctionTick` removes lineages and `noteImpact` can sterilise a planet. Beings die only from `life[c] < 0.04` with a 0.12 roll. An extinction event should visibly kill the individuals it kills — that is the whole emotional content of an extinction.',k:'MODEL',e:'M',i:3},
{c:'outside',t:'Beings under fast-forward',n:['entsim'],d:'At 5 Myr a tick, individual behaviour is meaningless and individual rendering is expensive. Define the degradation: above some `dtYr`, beings become a density and a few named exemplars, and the transition is explicit rather than a frame-rate artefact.',k:'MODEL',e:'M',i:3},
{c:'outside',t:'Sprites are not the population either',d:'`morphTileOf` stamps unique plans into a 20-slot atlas with 16 hand-drawn Path2Ds as fallback. Measured on a 1.7 Gyr run: 49 living lineages, **4 distinct sprite kinds on screen**. The visible diversity is capped far below the modelled diversity and the cap is in the atlas.',k:'SHOW',e:'M',i:3},
{c:'outside',t:'Reef is not sixty percent of Earth',d:'Measured on modern Earth, 300 ticks: 196 of 326 beings were kind 14, the reef sprite. `kindForCell` returns 14 for any submerged cell with `reef > 0.25` or a life signal above 0.35, and most of the planet is ocean. The kind assignment needs to sample what is actually abundant, not what matches first.',k:'SHOW',e:'S',i:3},
{c:'outside',t:'A probe for the living layer',g:'liveprobe',n:['entsim'],d:'Landed. `scripts/thrive-probe.mjs` plus `npm run probe` / `probe-fire`; thrive slice in `test.mjs`.',k:'PROVE',e:'S',i:3},

/* --------------------------------------------------------------- being -- */
{c:'being',t:'Energy, so a life has a cost',g:'energy',n:['entsim'],d:'Landed (first cut). `m.energy` / Kleiber spend / forage and hunt restore / death at zero. Not yet thermoregulation as a separate term.',k:'MODEL',e:'M',i:3},
{c:'being',t:'A drive vector, not a behaviour string',g:'drivevec',n:['energy'],d:'Partial. Hunger and fear are continuous and pickBehav reads the loudest; rest/forage/hunt/flee fall out of that. Thirst, heat and crowding still missing.',k:'MODEL',e:'M',i:3},
{c:'being',t:'Perception before decision',g:'percept',n:['drivevec'],d:'A being currently reads `life`, `moist`, `ice`, `ash`, `dust` and `stormField` on its own cell and four neighbours, with perfect knowledge and no range. `sensory.js` already decides what a world delivers to which receptor. Gate what a being knows on what it can actually sense, and a blind burrower and a hawk stop making the same decision.',k:'MODEL',e:'M',i:3},
{c:'being',t:'A target, held across ticks',n:['drivevec'],d:'Every tick recomputes the best of five cells from scratch, so a being cannot cross a desert to reach a lake. One remembered destination and a heading turn Brownian shuffling into travel, and travel is the thing that reads as intent on screen.',k:'MODEL',e:'S',i:3},
{c:'being',t:'Memory of a few places',g:'memory',n:['drivevec'],d:'Three or four remembered cells per being — where food was, where water is, where the danger was — at a few bytes each. This is what produces trails, home ranges, seasonal returns and avoidance, all from one small array.',k:'MODEL',e:'M',i:3},
{c:'being',t:'Age classes, so a body has a stage',g:'agestage',n:['energy'],d:'`m.age` increments and is read only for a `Math.max`. Juvenile, adult, senescent — with different size, different diet, different vulnerability and different behaviour. `creatureDraw.js` already has a juvenile notion; nothing in the model does.',k:'MODEL',e:'M',i:3},
{c:'being',t:'Size that grows with age',n:['agestage'],d:'`writeEnt` sets scale from `plan.size` and a random factor, once, at birth, and never again. A being that visibly grows is the cheapest possible signal that time is passing and that this individual has a history.',k:'SHOW',e:'S',i:3},
{c:'being',t:'Thermoregulation as a real cost',n:['energy'],d:'`W.temp[c]` and the genome thermal axis both exist. An endotherm pays continuously to hold its temperature and an ectotherm pays in lost activity when it is cold — which is the actual reason the two strategies partition the planet, and it needs no new fields.',k:'MODEL',e:'M',i:2},
{c:'being',t:'Water, separately from food',n:['energy'],d:'`moist`, `precip`, lakes and rivers are all computed. Thirst is the drive that makes a waterhole a place, concentrates animals, creates the ambush that predators want and makes drought lethal before it is visible in the biomass field.',k:'MODEL',e:'M',i:2},
{c:'being',t:'Fear, and the cost of being afraid',n:['drivevec','percept'],d:'A prey animal that will not feed in the open is a prey animal that starves slowly. That trade — the landscape of fear — restructures grazing pressure far more than predation deaths do, and it is a single drive plus a lookup of nearby predators.',k:'MODEL',e:'M',i:3},
{c:'being',t:'Crowding, so a place can be full',n:['drivevec'],d:'`rebuildBuckets` already gives beings per cell. Making crowding a drive gives dispersal a cause, territory a meaning and cities a limit, and it is the term that stops every population from piling onto the single best cell.',k:'MODEL',e:'S',i:3},
{c:'being',t:'Death with a stated cause, always',d:'`m.cause` is set to `ice`, `heat` or `starved` from a coin flip on `life[c] < 0.04`. Every death should have a cause that came from the model — starved, predated, frozen, drowned, diseased, old — because the causes of death are the honest summary of what a world is like to live in.',k:'MODEL',e:'S',i:3},
{c:'being',t:'A body plan that constrains behaviour',d:'`planOf` expresses habitat, skeleton, limbs, senses and locomotion, and the only thing `agentsTick` reads from it is `stride`. A sessile plan should not walk, a gilled plan should not cross land, a phototroph should not chase. Twelve of those rules already exist as `morphMult` penalties on fitness; the same table should gate action.',k:'MODEL',e:'M',i:3},
{c:'being',t:'Locomotion that costs what it should',n:['energy'],d:'Moving uphill, through snow, against a current or in a storm all cost more, and `h`, `ice`, `current` and `stormField` are all there. Movement cost is what makes terrain matter to an animal rather than only to a renderer.',k:'MODEL',e:'M',i:2},
{c:'being',t:'One being, inspectable',g:'beinginspect',n:['drivevec'],d:'`beingAtLocalPixel` already resolves a click to an individual. Show it: name, lineage, age class, energy, current drive, what it is doing and why, what it last ate, where it was born. This single panel is how a player learns that any of the rest of this exists.',k:'SHOW',e:'M',i:3},
{c:'being',t:'Follow one for its whole life',n:['beinginspect'],d:'`followTarget` returns the first named settler. A follow camera that stays with one animal from birth to death, with a small caption when something happens to it, is the strongest thing this product could do with the layer it already renders.',k:'PLAY',e:'M',i:3},
{c:'being',t:'Names that mean something',d:'`nameFrom` builds a name from two syllable tables for settlers and ice fauna. Names should be earned — the first of a lineage, the founder of a settlement, the largest, the oldest — because a named thing the player did not choose is noise.',k:'SHOW',e:'S',i:2},
{c:'being',t:'A being state budget in bytes',n:['drivevec'],d:'Eight floats per being today. Energy, drives, target, memory and age class fit in roughly another twelve to sixteen, so 1400 beings costs about 130 KB total. State that number before building, and structure it as parallel typed arrays rather than growing the meta object.',k:'PROVE',e:'S',i:3},
{c:'being',t:'Behaviour that reads at a glance',n:['drivevec'],d:'The current five behaviours produce, measured: 216 resting, 92 foraging, 17 travelling, 1 fleeing out of 326. Three quarters of the visible population is doing nothing. Whatever replaces it should be asserted against a distribution the designer chose.',k:'PROVE',e:'S',i:3},
{c:'being',t:'The five strings, deleted',n:['drivevec'],d:'The end state for this category is that `pickBehav` no longer exists: no probability table, no string, no `roll < 0.18`. An action is chosen by scoring drives against perception, and the test is whether the code can be deleted rather than wrapped.',k:'MODEL',e:'M',i:3},

/* -------------------------------------------------------------- census -- */
{c:'census',t:'Birth, so a population can grow',g:'birth',n:['energy'],d:'Landed (first cut). `tryBirth` spends parent energy, writes `parentId`, inherits group. Thrive no longer tops up — growth is births only.',k:'MODEL',e:'M',i:3},
{c:'census',t:'Death, from something',g:'death',n:['energy'],d:'Landed (first cut). Causes: starved, burned, hunted, old age, ice, heat. Detritus on the cell. Probe counts deaths.',k:'MODEL',e:'M',i:3},
{c:'census',t:'A population book per lineage',g:'popbook',n:['birth','death'],d:'`node.pop` counts occupied cells and `node.censusPop` is a Lotka–Volterra scalar. Neither is a count of anything that exists. Keep births, deaths, immigration and emigration per lineage per tick, and every population claim becomes an accounting identity that can be asserted.',k:'MODEL',e:'M',i:3},
{c:'census',t:'Reproductive strategy from the genome',n:['birth'],d:'The genome has axes for size, dispersal and defence, which is most of an r-versus-K position. Many cheap offspring with high mortality, or few expensive ones with care — that choice changes the shape of a population curve and it is already latent in the trait vector.',k:'MODEL',e:'M',i:3},
{c:'census',t:'Parental care, and what it buys',n:['birth','agestage'],d:'Juvenile survival as a function of an adult staying nearby. It is a small behaviour with a large demographic consequence and it produces the visual the player wants: a small one following a big one.',k:'MODEL',e:'M',i:2},
{c:'census',t:'A carrying capacity a being can feel',d:'`carryingCapacityNPP` returns a per-cell number that only the field integrator reads. Beings should feel it through competition for food, not through a cap on a scalar, or the population curve will be smooth in a way real ones never are.',k:'MODEL',e:'M',i:3},
{c:'census',t:'Boom and crash',n:['popbook'],d:'A predator that overshoots its prey and starves, a mast year, a die-off after a good decade. Overshoot needs a lag between resource and population, which needs birth and death rather than a logistic term. This is the payoff item for the whole category.',k:'MODEL',e:'M',i:3},
{c:'census',t:'A bottleneck that shows in the genome',n:['popbook'],d:'`Ne = 0.35 × census` and drift is variance already. Once census comes from counted individuals, a crash leaves a real signature — reduced diversity, fixed alleles, a founder line — and the Lab tree can show the pinch afterwards.',k:'MODEL',e:'M',i:3},
{c:'census',t:'A population pyramid in the readout',n:['agestage','popbook'],d:'Juveniles, adults, old. The shape says whether a population is growing, stable or collapsing at a glance, and it is three numbers to compute and a small bar chart to draw.',k:'SHOW',e:'S',i:2},
{c:'census',t:'Minimum viable population, per lineage',d:'`updateFoodWeb` uses `mvp = 2` for every lineage on every world. MVP depends on body size, reproductive rate and range. A whale and a bacterium do not have the same floor and the constant is doing real work in deciding who goes extinct.',k:'MODEL',e:'S',i:3},
{c:'census',t:'The last individual',n:['popbook'],d:'When a lineage falls to one being, say so, name it, and mark it on the globe. The endling is the most affecting event a simulation like this can produce and it costs a threshold check.',k:'SHOW',e:'S',i:3},
{c:'census',t:'Immigration and emigration, counted',n:['popbook'],d:'`m.cell` changes and nothing records that a being left one population and joined another. Counting the flow is what makes a metapopulation a metapopulation rather than a set of independent numbers.',k:'MODEL',e:'M',i:2},
{c:'census',t:'Disease as a population process',d:'`W.plague` is a global scalar that multiplies `life[c]` by 0.55 with probability `plague * 0.03`. A transmissible disease needs a host density, a contact rate and a recovery — an SIR on the being buckets, which is a dozen lines and a genuinely different dynamic from a global multiplier.',k:'MODEL',e:'M',i:3},
{c:'census',t:'Density-dependent everything',n:['popbook'],d:'Birth rate, disease, aggression, dispersal and stress all scale with local density, and density is the per-cell being count. One field, five consequences, and it is the mechanism that produces cycles without any cycling code.',k:'MODEL',e:'M',i:3},
{c:'census',t:'A refuge that actually refuges',d:'`declareRefuge` exists as a god verb. With counted individuals a refuge becomes a source population that recolonises after a crash, which is what refugia do and what makes them worth declaring.',k:'PLAY',e:'M',i:2},
{c:'census',t:'The population graph, live',n:['popbook'],d:'One line per major lineage, time on the x axis, live and scrolling. Every ecology textbook opens with this picture, no readout in the product draws it, and it is the fastest way to see a food web working.',k:'SHOW',e:'M',i:3},
{c:'census',t:'Assert the accounting',n:['popbook'],d:'Population at t+1 equals population at t plus births minus deaths plus immigration minus emigration, exactly, every tick, for every lineage. If that identity holds, the demography is real; if it cannot be written, the model is still a rendering.',k:'PROVE',e:'M',i:3},
{c:'census',t:'Two lineages, one resource, a hundred ticks',n:['popbook'],d:'The smallest test that proves competition: seed two lineages with different efficiencies on one resource, run it, assert one wins and that which one wins follows from the traits. This is the ecology equivalent of the two-species predation test that already exists.',k:'PROVE',e:'M',i:3},
{c:'census',t:'Do not let the tree outrun the world',d:'Measured: 49 living lineages after 1.7 Gyr with 489 beings, so a typical lineage is represented by ten individuals — and 4 sprite kinds are shown. Either the tree is too fine for the population or the population is too small for the tree, and the ratio should be a stated design target.',k:'PROVE',e:'S',i:3},
{c:'census',t:'A world that is allowed to be empty',d:'The counterweight to everything in this category: an early Earth should look sparse, a snowball should look nearly dead, and `topUpEntities` currently guarantees a floor of visible activity. Emptiness has to be renderable or abundance means nothing.',k:'SHOW',e:'S',i:3},
];

const P2 = [
/* ---------------------------------------------------------------- hunt -- */
{c:'hunt',t:'A hunt that happens on a cell',g:'hunt',n:['entsim','percept'],d:'Partial. Predators acquire `preyId`, close within two cells, kill on a cover-aware roll. Misses cost energy and raise fear. Carcass + preyFear fields land with this slice.',k:'MODEL',e:'L',i:3},
{c:'hunt',t:'Predation pressure as a field',g:'preyfield',n:['hunt'],d:'Landed (first cut). `W.preyFear` accumulates on kills and misses, decays each trophic tick. Prey flee high cells; Fear overlay. Cascade demo still open.',k:'MODEL',e:'M',i:3},
{c:'hunt',t:'A pursuit the player can see',n:['hunt'],d:'Two sprites, a closing distance, an outcome. On the local grid this is the single most legible piece of behaviour possible, and it needs the predator and prey to be interpolated between cells — which `presentAgents` already does for movement.',k:'SHOW',e:'M',i:3},
{c:'hunt',t:'Hunts that fail',n:['hunt'],d:'Landed (first cut). Hit chance from cover (`life`/`moist`) and prey awareness (`fear`/flee). Misses increment `W.huntMisses` and write fear. Defence genome axis still unused.',k:'MODEL',e:'M',i:3},
{c:'hunt',t:'A carcass, and everything that comes to it',g:'carcass',n:['hunt'],d:'Landed (first cut). Discrete `W.carcasses` at kill sites; `carcassField` attracts foragers; decay feeds soil/N/P. Scavenging restores energy. Overlay Carcass.',k:'MODEL',e:'M',i:3},
{c:'hunt',t:'Grazing that eats the plants that are there',n:['hunt'],d:'A herbivore should remove biomass from `life[c]` on the cell it stands on. Today `W.herbivore` is `nppMean × 0.2`, planet-wide, so grazing has no location and cannot overgraze anything. Local grazing produces the grass–grazer oscillation, bare patches and the reason herds move.',k:'MODEL',e:'M',i:3},
{c:'hunt',t:'Overgrazing, and recovery',n:['hunt'],d:'A cell eaten below a threshold recovers slowly, so a herd that stays kills its own pasture. This is the mechanism behind migration, rotational grazing and desertification, and all three are things this product wants to show.',k:'MODEL',e:'M',i:3},
{c:'hunt',t:'Ambush, pursuit, filter, graze, browse, scavenge',n:['hunt'],d:'Six feeding modes, each with a different cost, success curve and preferred terrain, selected from the genome axes that already exist. `node.diet` currently expresses only *what*; a mode expresses *how*, and how is what makes two predators of the same prey different animals.',k:'MODEL',e:'M',i:3},
{c:'hunt',t:'Prey defence that is used, not just costed',d:'The genome has a defence axis and `ecologyTick` escalates it by 0.0005 a tick in an arms race. Nothing spends it: no failed attack, no deterrence, no armour that stops a bite. Defence should reduce a hunt success probability at the moment of the hunt.',k:'MODEL',e:'M',i:3},
{c:'hunt',t:'Cover, so terrain decides the outcome',n:['hunt'],d:'Forest hides prey, open ground favours pursuit, water is a refuge for something and a trap for something else. `biome`, `life` and `h` are all per-cell, so terrain-conditioned hunt success is a lookup rather than a new system.',k:'MODEL',e:'M',i:2},
{c:'hunt',t:'Predator territory',n:['hunt','memory'],d:'A large predator holds an area, excludes rivals and returns to a core. That single behaviour spaces predators out, caps their density far below what food alone would allow, and creates the mosaic that everything smaller lives inside.',k:'MODEL',e:'M',i:3},
{c:'hunt',t:'Cooperative hunting, and when it pays',n:['hunt','flock'],d:'Group hunting beats solo hunting only above a prey size threshold, and this is one of the few places in biology where a clean quantitative rule exists. It is also the most watchable behaviour a simulation can show.',k:'MODEL',e:'M',i:3},
{c:'hunt',t:'Trophic cascade, demonstrated',n:['preyfield'],d:'Remove the top predator, watch herbivores rise, watch vegetation fall, watch a river change. This is the canonical result the field is famous for. With local grazing and local predation it should emerge; a scenario that runs it is the proof.',k:'PROVE',e:'M',i:3},
{c:'hunt',t:'Who is eating whom, right now',n:['hunt'],d:'A readout of live trophic flows — kills per lineage pair per interval — rather than the static `foodWeb.links` list. The web the player cares about is the one that is currently carrying energy.',k:'SHOW',e:'M',i:3},
{c:'hunt',t:'The two-hundred-link cap is being hit',d:'Measured: after 300 deep-time ticks `W.foodWeb.links.length` is exactly 200, the value of `links.slice(0, 200)`. So the food web is being truncated in every long run and nothing says which links were dropped or on what basis. Sort by flux before truncating, and report the count that was cut.',k:'PROVE',e:'S',i:3},
{c:'hunt',t:'A food web drawn as a web',d:'`foodWeb.links` has predator, prey and weight — enough for a layered graph with trophic level on the vertical axis and link thickness from flux. Nothing draws it. It is the picture that makes an ecosystem comprehensible.',k:'SHOW',e:'M',i:3},
{c:'hunt',t:'Omnivory, and switching',d:'`a.diet` is a fixed top-three by weight, recomputed every tick from traits. A real consumer switches to whatever is abundant, which stabilises webs and is the reason generalists survive extinctions. Prey availability should reorder the diet.',k:'MODEL',e:'M',i:2},
{c:'hunt',t:'Parasites and disease as trophic links',d:'A parasite is a consumer that does not kill its host, and by biomass it may be most of the links in a real web. It needs no new machinery beyond a negative term on the host and a dependence on host density.',k:'MODEL',e:'M',i:2},
{c:'hunt',t:'Detritivores get a seat',d:'`W.trophic.decomp` is `nppMean × 0.3` and `W.detritus` is a real per-cell field that nothing consumes. Most of the energy in most ecosystems goes through decomposition, and here it goes through a constant.',k:'MODEL',e:'M',i:2},
{c:'hunt',t:'Assert one kill',n:['hunt'],d:'Landed. Suite places hunter and prey on one cell, forces hunt ticks, asserts a kill or carcass, and checks fear/carcass overlays.',k:'PROVE',e:'S',i:3},

/* --------------------------------------------------------------- swarm -- */
{c:'swarm',t:'Flocking with an alignment term',g:'flock',n:['entsim'],d:'The existing code averages neighbour positions and steps toward the centroid, with a separation nudge when beings share a cell. That is two of the three classical rules; without alignment a group has no shared heading, so it clumps rather than moves. `m.heading` exists and is written on every move and read nowhere.',k:'MODEL',e:'M',i:3},
{c:'swarm',t:'A group as an object',g:'group',n:['flock'],d:'Landed (first cut). Named groups with `home` and `goal`; members bias toward the goal; barren cells send the herd home.',k:'MODEL',e:'M',i:3},
{c:'swarm',t:'Flocking for more than four kinds',d:'The nudge applies to kinds 6, 7, 14 and 15. Whether a body plan schools, herds, swarms, flocks or is solitary should come from the genome — sociality is a trait — not from a hardcoded list of four sprite indices.',k:'MODEL',e:'M',i:3},
{c:'swarm',t:'Sociality as a genome axis',n:['group'],d:'Solitary, pair, family, troop, herd, colony, superorganism. It is a categorical axis of exactly the kind `lifeGrammar.js` already carries, with real consequences for predation risk, disease, foraging efficiency and the path to a settlement.',k:'MODEL',e:'M',i:3},
{c:'swarm',t:'Group size that is selected, not set',n:['group'],d:'Bigger groups see predators sooner and eat their patch faster. That trade produces an optimum that depends on predation pressure and productivity, both of which are fields the world already has, so group size becomes a readout of the environment.',k:'MODEL',e:'M',i:3},
{c:'swarm',t:'A leader, and following',n:['group','memory'],d:'One member holds the target and the rest weight its heading. This is how a herd crosses a barren stretch, which a centroid-averaging flock can never do, and it is the difference between milling and migrating.',k:'MODEL',e:'M',i:3},
{c:'swarm',t:'Groups that split and merge',n:['group'],d:'Landed (first cut). Fission when membership ≥ 12; fusion when two small same-kind herds share a cell or neighbour. `W.groupSplits` / `groupMerges` count the events.',k:'MODEL',e:'M',i:2},
{c:'swarm',t:'Swarm as a rendered mass, not N sprites',n:['group'],d:'A locust swarm is a million individuals. Draw the group as a density blob with a few resolved individuals at the edge — which is also the answer to the performance question, since one group of ten thousand costs one record and one sprite pass.',k:'SHOW',e:'L',i:3},
{c:'swarm',t:'A swarm on the globe',n:['group'],d:'From orbit a swarm is a dark moving smudge. Render groups above a size as a globe-scale mark that moves — the first thing on that sphere that moves for a biological reason rather than a meteorological one.',k:'SHOW',e:'M',i:3},
{c:'swarm',t:'Migration, along a route',n:['group','memory'],d:'A seasonal round trip between two remembered regions, triggered by the seasonal phase `nppField` already computes for the green wave. A migration is the most legible large-scale animal behaviour there is and the globe is the right canvas for it.',k:'MODEL',e:'L',i:3},
{c:'swarm',t:'Migration routes that persist and can be broken',n:['group'],d:'A route is a remembered path. Put a mountain across it, drop the sea level, remove a stopover, and the population that used it crashes. That is a god verb with an ecological consequence, which is the intersection this product is built on.',k:'PLAY',e:'M',i:3},
{c:'swarm',t:'Colonies and nests',n:['group'],d:'A group anchored to a place rather than moving through it: a rookery, a mound, a reef colony, a mat. It is the biological ancestor of a settlement and it should use the same record so the transition is continuous.',k:'MODEL',e:'M',i:3},
{c:'swarm',t:'A superorganism that engineers its cell',n:['group'],d:'`ecologyTick` already lets reefs raise the seafloor and life build soil. A colony that changes moisture, soil, albedo or height at its own cell is the same mechanism aimed at something visible at the scale a player is looking.',k:'MODEL',e:'M',i:2},
{c:'swarm',t:'Trails, and the field that carries them',n:['memory'],d:'Landed (first cut). `noteWear` feeds `W.trail`; foragers and herds bias toward worn cells; Trails overlay. Local `paintWear` already drew it.',k:'MODEL',e:'M',i:3},
{c:'swarm',t:'Worn paths that the renderer shows',n:['memory'],d:'`paintWear` in the local view already draws a wear texture. Feeding movement into it turns the grid of squares into a place with desire lines, which is a small change with a disproportionate effect on how inhabited a tile looks.',k:'SHOW',e:'S',i:3},
{c:'swarm',t:'Predator response to a group',n:['group','hunt'],d:'A group is harder to attack and more rewarding to find. Confusion effect, dilution, mobbing — the reasons grouping evolved. Without them, grouping is decoration; with them, it is a strategy the simulation selected.',k:'MODEL',e:'M',i:3},
{c:'swarm',t:'Groups in the census line',n:['group'],d:'`viewCensus` counts beings by kind. It should count groups, name the largest, and say what it is doing — grazing, moving, spawning — so the readout describes a scene rather than a tally.',k:'SHOW',e:'S',i:2},
{c:'swarm',t:'Assert the three rules',n:['flock'],d:'Twenty beings, one kind, no predators: assert the mean nearest-neighbour distance falls and stabilises, the heading variance falls, and no two beings occupy the same position. Three numbers that catch every flocking bug there is.',k:'PROVE',e:'S',i:3},
{c:'swarm',t:'A group budget',n:['group'],d:'Neighbour search is the cost. `eachNearby` already walks a cell and its four neighbours through a linked list, which is the right structure. State the per-tick cost at 1400 beings and at the 768-cell resolution before adding an alignment pass.',k:'PROVE',e:'S',i:3},
{c:'swarm',t:'The word flock should appear',d:'Grep `vr/` for `flock`, `herd`, `swarm`, `colony`, `territory` or `pheromone`: zero hits between them outside a technology name and a grammar string. The vocabulary of animal behaviour is entirely absent from a product about life, and naming the concepts is the first step to having them.',k:'PROVE',e:'S',i:2},

/* -------------------------------------------------------------- spread -- */
{c:'spread',t:'A colonisation front with a shape',g:'front',d:'`bioTick` grows a cell faster when a neighbour is above 0.2 — an isotropic diffusion that produces a stain. A front has a direction, a speed that depends on the terrain ahead, a leading edge that is sparse and a wake that fills in. Front speed is the most watchable thing a spreading biosphere does.',k:'MODEL',e:'M',i:3},
{c:'spread',t:'Dispersal with a distance',g:'disperse',n:['front'],d:'Growth today is strictly nearest-neighbour, so nothing can cross a barrier and nothing can arrive from far away. A dispersal kernel with a mean and a fat tail — wind, water, rafting, hitching a ride — is what actually decides which islands have what.',k:'MODEL',e:'M',i:3},
{c:'spread',t:'Barriers, from the terrain that is already there',n:['front'],d:'Mountains, deserts, straits, ice and salinity fronts are all computed fields. The life backlog names `barrier` as unblocking six items and it is still a token. A front that stops at a real barrier is the picture that explains biogeography.',k:'MODEL',e:'M',i:3},
{c:'spread',t:'Corridors, and what opens them',n:['front'],d:'A land bridge at low sea level, a river valley, a green corridor across a wet Sahara. Corridors open and close on the climate clock, and each opening is an exchange event with winners and losers — the Great American Interchange as a mechanism rather than a name.',k:'MODEL',e:'M',i:3},
{c:'spread',t:'Founder effects at the edge',n:['disperse'],d:'The population that crosses is small and unrepresentative. `Ne` and drift already exist in the genome layer, so a founder event at the leading edge produces real divergence and is the honest mechanism behind allopatric speciation, which `evolveTick` currently accumulates as an isolation scalar.',k:'MODEL',e:'M',i:3},
{c:'spread',t:'Invasion, with an outcome',g:'invade',n:['front'],d:'`transplantClade` moves a clade and can mark it invasive. What is missing is the contest: the arrival competes with the incumbent for the same resource on the same cells, and either establishes, fails or explodes. That is a scenario the player should be able to run in a minute.',k:'MODEL',e:'M',i:3},
{c:'spread',t:'Range as a thing that moves',d:'The `range` overlay paints the occupied cells of the dominant clade — a static mask. Range shift under warming, range collapse under drought, poleward creep: the derivative is the interesting quantity and it is one subtraction away.',k:'SHOW',e:'S',i:3},
{c:'spread',t:'Islands, and why they are strange',n:['disperse'],d:'Small area, isolated, few lineages, weird ones. Island biogeography is a quantitative theory with a species–area relationship this simulation could reproduce and be checked against, and the world generator already makes islands.',k:'MODEL',e:'M',i:2},
{c:'spread',t:'Refugia during a bad epoch',d:'When the world contracts, populations survive in a few cells and expand out again afterwards. That produces the genetic signature of every real glacial cycle, and this simulation runs glacial cycles already.',k:'MODEL',e:'M',i:2},
{c:'spread',t:'Vicariance, when a continent splits',d:'`tectonicsTick` moves plates. A range cut in two by a rifting continent is speciation with a stated cause and a date, and the phylogeny could carry that cause on the node.',k:'MODEL',e:'M',i:3},
{c:'spread',t:'A front rendered as a front',n:['front'],d:'On the globe: an animated leading edge, brighter than the interior, moving at a visible speed. This is the single most direct answer to *life growing before your eyes* and it needs a gradient of the occupancy field, not a new simulation.',k:'SHOW',e:'M',i:3},
{c:'spread',t:'The green wave, made visible',d:'`nppField` computes a phenology term from season and latitude and nothing shows it. Spring sweeping poleward is the most beautiful thing a living planet does at globe scale and it is already in the model.',k:'SHOW',e:'S',i:3},
{c:'spread',t:'Succession after a disturbance',g:'succession',d:'Fire, ash, lava, ice retreat and a drained lake all leave bare ground, and `W.ash` and `W.lava` are real fields. Pioneers, then mid-succession, then a climax community — a sequence with a clock, which is growth the player can watch on one tile.',k:'MODEL',e:'M',i:3},
{c:'spread',t:'Fire as a process life participates in',d:'Fuel from biomass, ignition from lightning or volcanism, spread with the wind, and a burnt scar that then succeeds. `stormField`, `wind` and `life` are all there. Fire is the fastest visible ecological process on a planet with plants and oxygen.',k:'MODEL',e:'L',i:3},
{c:'spread',t:'Treeline, and where it moves to',d:'`ecologyTick` already substitutes alpine biomes above a height and below a temperature. Making it a moving line rather than a threshold gives a warming world an unmistakable visible signal at a scale the local grid can show.',k:'MODEL',e:'S',i:2},
{c:'spread',t:'Sea-level change as habitat change',d:'`seaLevel` moves, `intertidal` exists and `city.js` already computes a `drowned` flag. Coastal habitat gained and lost, on the globe, with the populations that depended on it — the clearest way to make a slow forcing feel consequential.',k:'MODEL',e:'M',i:2},
{c:'spread',t:'Assert a front speed',n:['front'],d:'Seed one cell on a uniform world, run 100 ticks, measure occupied radius against time. It should be linear, its slope should scale with productivity, and it should be zero across a barrier. Three assertions that pin the entire spread model.',k:'PROVE',e:'M',i:3},
{c:'spread',t:'A species–area check',n:['disperse'],d:'Count lineages against island area across a generated archipelago and fit the exponent. Real values sit near 0.25. This is a rare case where an emergent ecological result has a published number to be measured against.',k:'PROVE',e:'M',i:2},
{c:'spread',t:'Seed a front and watch it, as a verb',n:['front'],d:'`seedLife` paints a disc of biomass at 0.7 and above instantly. A seed that starts as one cell and has to spread is a completely different experience of the same button, and it is how the player learns what the terrain means.',k:'PLAY',e:'S',i:3},
{c:'spread',t:'A time-lapse of a colonisation',n:['front'],d:'Record occupancy every N ticks and replay it fast. The product already captures moments in `maybeCaptureMoment`; a front replay is the same idea applied to the one process this whole backlog is about.',k:'SHOW',e:'M',i:2},

/* --------------------------------------------------------------- guild -- */
{c:'guild',t:'A trophic field, not three multiplications',g:'guildfield',d:'Landed (first cut). `trophProd/Herb/Carn/Decomp` per cell plus occupancy from grazing and hunts. Overlay Trophic. Planet means follow the fields, not npp×0.1.',k:'MODEL',e:'L',i:3},
{c:'guild',t:'Transfer efficiency that varies',n:['guildfield'],d:'Ten percent is a textbook average, not a law: it is higher in aquatic webs, lower in terrestrial ones, and depends on what is being eaten. Making it depend on the biome and the prey type is what makes ocean and land pyramids differ.',k:'MODEL',e:'M',i:2},
{c:'guild',t:'A pyramid that can be the wrong shape',n:['guildfield'],d:'Inverted biomass pyramids are real — plankton support more fish biomass than they hold at an instant, because turnover is fast. A model that computes standing stock from a fixed ratio can never show that, and it is one of the few genuinely counterintuitive facts in ecology.',k:'MODEL',e:'M',i:2},
{c:'guild',t:'Guilds above the microbial layer',n:['guildfield'],d:'`GUILDS` in `redox.js` is a real metabolic guild table and it stops at chemistry. Grazers, browsers, filterers, ambush predators, pursuit predators, scavengers, detritivores, pollinators — a table of the same shape, one level up, and the interface already has a palette for it.',k:'MODEL',e:'M',i:3},
{c:'guild',t:'Niche partitioning, so coexistence has a reason',n:['guildfield'],d:'`updateFoodWeb` gives competitors a flat `compete += 0.04` when their trophic levels are within 0.08. Real coexistence comes from differing along an axis — size, time of day, depth, prey size, tolerance. Partitioning is what lets a cell hold twenty lineages instead of one.',k:'MODEL',e:'M',i:3},
{c:'guild',t:'A keystone that can be removed',g:'keystone',n:['guildfield'],d:'Identify the lineage whose removal changes the most, by simulating its removal. Then let the player remove it. This is the most instructive single experiment in ecology and the product already has `cullClade`.',k:'PLAY',e:'M',i:3},
{c:'guild',t:'Succession as a community sequence',n:['succession','guildfield'],d:'Not a scalar rising toward a cap: a sequence of communities where each changes the conditions the next needs — nitrogen fixers, then grasses, then shrubs, then canopy. `W.soil` already accumulates with life, which is the first link of that chain.',k:'MODEL',e:'M',i:3},
{c:'guild',t:'Ecosystem engineers, on purpose',d:'`ecologyTick` has two hardcoded cases: reefs raise the seafloor and life builds soil. Beavers, burrowers, termites, mats, forests that make their own rain — the mechanism is one line each and the effect is a cell that a lineage has visibly changed.',k:'MODEL',e:'M',i:3},
{c:'guild',t:'Mutualism, which the model has none of',d:'Every interaction in `updateFoodWeb` is negative — predation or competition. Pollination, mycorrhizae, gut symbionts, cleaner fish and lichens are all positive, and a web with no positive links cannot produce the two most important transitions in the life pass, endosymbiosis and land plants.',k:'MODEL',e:'M',i:3},
{c:'guild',t:'Symbiosis that becomes an organelle',d:'The endosymbiotic step is already a transition flag. Reaching it through a mutualism that got tighter, rather than through a threshold, is the difference between a checkbox and a story — and the genome layer can already move an organ between lineages via HGT.',k:'MODEL',e:'L',i:3},
{c:'guild',t:'Decomposition that closes the loop',d:'`W.detritus` accumulates and decays at 0.97 a tick into nothing. Decomposers should consume it and return nutrients to `nutrientN` and `nutrientP` on that cell, which is the actual nutrient cycle and the reason a forest is not a desert.',k:'MODEL',e:'M',i:3},
{c:'guild',t:'Nutrient limitation a being can experience',d:'Redfield limitation already shapes ocean NPP. On land, nitrogen and phosphorus limits should decide which lineage wins where — and nitrogen fixers should be worth being, which is a guild with a specific, visible geographic advantage.',k:'MODEL',e:'M',i:2},
{c:'guild',t:'Diversity that comes from somewhere',d:'`shannonDiversity` measures the tree. Local diversity should follow from productivity, disturbance, area and heterogeneity — the intermediate disturbance hypothesis is a testable prediction this simulation could exhibit rather than assume.',k:'MODEL',e:'M',i:2},
{c:'guild',t:'The ecotone means something',d:'`W.ecotoneFrac` is 0.676 on modern Earth — measured — meaning two thirds of land cells have a dominant biome weight below 0.7. Either that is a real mosaic or the membership function is too soft. Ecotones should be where diversity peaks and edges matter; today they are only a colour.',k:'MODEL',e:'M',i:2},
{c:'guild',t:'A biome is a community, not a colour',d:'`BIOMES` is fifteen ids and `classifyBiome` picks one from temperature and precipitation. A biome should be a set of guilds with abundances, so *tundra* means a specific community that can be depleted, invaded or replaced rather than a palette entry.',k:'MODEL',e:'L',i:3},
{c:'guild',t:'Biome bistability, done properly',d:'The forest–savanna flip in `ecologyTick` is a hardcoded window on moisture that also overwrites `W.biome`. Bistability should come from the feedback — trees make rain, rain makes trees — with real hysteresis, which the tipping-element machinery in `gaia.js` already knows how to express.',k:'MODEL',e:'M',i:2},
{c:'guild',t:'An ecosystem panel worth opening',n:['guildfield'],d:'For the cell under the cursor: NPP, the four trophic stocks, the guilds present with abundances, the dominant lineages, what limits growth here, and what would happen if it warmed. Every one of those numbers either exists or is one addition away.',k:'SHOW',e:'M',i:3},
{c:'guild',t:'Assert the pyramid',n:['guildfield'],d:'Producers exceed herbivores exceed carnivores on every cell, energy in equals energy out plus respiration plus burial across the biosphere, and no trophic stock is negative. Three invariants that make a spatial trophic model trustworthy.',k:'PROVE',e:'M',i:3},
{c:'guild',t:'Assert a cascade',n:['keystone'],d:'Remove the top carnivore, run 200 ticks, assert herbivores rise then vegetation falls, and assert the effect decays with distance from the removal. If it does not, the trophic field is not coupled to space.',k:'PROVE',e:'M',i:3},
{c:'guild',t:'Ten guilds, one cell, a hundred ticks',n:['guildfield'],d:'The smallest interesting test: seed ten guilds on one productive cell and check how many coexist. If the answer is always one, competition is too strong; if always ten, it is too weak. The number itself is a design decision that should be written down.',k:'PROVE',e:'M',i:3},
];

const P3 = [
/* --------------------------------------------------------------- patch -- */
{c:'patch',t:'The tile is a still life',g:'tilelife',d:'`drawLocalView` unwraps a 17 × 17 patch around the focus cell and paints each square from `life[c]` and `lifeClass[c]` through ten `stamp*` functions. Nothing in that picture is doing anything: `stampFlora` places fixed fronds, `stampAmbientFauna` calls `stampBug`, and the only motion is `presentAgents` interpolating a being between two cells. The grid of squares is the one view close enough to show behaviour and it shows state.',k:'SHOW',e:'M',i:3},
{c:'patch',t:'Draw the act, not the actor',g:'tileact',n:['tilelife','drivevec'],d:'A being that is foraging, drinking, hunting, fleeing, nesting, grazing or resting should look different in the square — a posture, a direction, a small mark. One glyph per drive is a day of drawing and it is what turns 289 squares into a scene.',k:'SHOW',e:'M',i:3},
{c:'patch',t:'Face the direction of travel',d:'`m.heading` is computed on every move as an eastward component and never read by the renderer, so everything faces the same way forever. Orientation is the cheapest possible cue that a thing is going somewhere.',k:'SHOW',e:'S',i:3},
{c:'patch',t:'A gait',d:'`entityGait` exists in the local view. Tie its phase to actual displacement so a walking animal walks, a resting one breathes and a fleeing one is fast, rather than every sprite sharing one animation clock.',k:'SHOW',e:'M',i:2},
{c:'patch',t:'Eating, visibly',n:['tileact'],d:'A grazer at a plant, a predator at a carcass, a filter feeder in the current. If eating has a location and a duration in the model, it can have a picture, and eating is the interaction a player understands without being told.',k:'SHOW',e:'M',i:3},
{c:'patch',t:'Plants that are individuals where it matters',d:'`stampFlora` draws a texture keyed to `life[c]`, so a forest is a fill pattern. At the tightest zoom a tree should be a thing with an age and a size that grows over the run — the same argument as for animals, applied to the 60% of the biosphere that does not move.',k:'SHOW',e:'M',i:2},
{c:'patch',t:'Vegetation structure, in layers',d:'Canopy, understorey, ground cover, litter. Four strata drawn in order give a tile depth and give animals places to be — and the stratum an animal occupies is already implied by the genome habitat axis.',k:'SHOW',e:'M',i:2},
{c:'patch',t:'Seasonal appearance on the tile',d:'`nppField` computes a phenology term. Leaf-out, senescence, snow on the ground, a dry-season canopy — a tile that changes with the season is the fastest visible proof that time is running.',k:'SHOW',e:'M',i:3},
{c:'patch',t:'The tile after a disturbance',n:['succession'],d:'Burnt ground, ash fall, a lava flow cooling, ice retreating and bare soil colonising. `W.ash` and `W.lava` are real fields the local view barely reads, and recovery on one tile over a few thousand years is growth at exactly the scale a player can follow.',k:'SHOW',e:'M',i:3},
{c:'patch',t:'A nest, a den, a mound',n:['group'],d:'A structure a being built, on a specific square, that persists and can be destroyed. It is the smallest form of the same idea that ends in a city, and it gives the tile a history.',k:'SHOW',e:'M',i:2},
{c:'patch',t:'Trails on the ground',n:['memory'],d:'`paintWear` already draws a wear texture from `noteWear`, which movement already calls. Persisting and rendering it as paths gives the tile the single strongest signal that something lives here and goes somewhere.',k:'SHOW',e:'S',i:3},
{c:'patch',t:'A tile census that describes a scene',d:'`viewCensus` ranks cover shares and counts beings by kind through `KIND_CENSUS`. It should also say what is happening: how many are feeding, whether a hunt is in progress, whether the population here is rising, which lineage dominates and what limits it.',k:'SHOW',e:'M',i:3},
{c:'patch',t:'Zoom levels with different jobs',d:'`mapFidelity(cellPx)` already grades detail by cell size and `localFrameLabel` names the frame. Make the job explicit: at the widest, the ecosystem mosaic; in the middle, groups and movement; at the tightest, individuals with visible behaviour. Each level needs its own answer to what is being shown.',k:'SHOW',e:'M',i:2},
{c:'patch',t:'The net view as an ecology map',d:'`drawNetView` draws all six cube faces as a flat net of squares. That is the whole planet as a grid, and it currently paints height and a few fields. It is the natural home for a biosphere-wide picture of ranges, fronts and populations that the sphere cannot show without rotation.',k:'SHOW',e:'M',i:3},
{c:'patch',t:'Cell picking that returns life, not terrain',d:'`cellAtLocalPixel` and `beingAtLocalPixel` both exist. Clicking a square should offer both readings — this ground, and this animal — because the player asking about a tile is usually asking about what is on it.',k:'SHOW',e:'S',i:2},
{c:'patch',t:'Do not draw more than is there',d:'A tile with `life[c] = 0.1` should look sparse. The stamps currently scale a texture rather than a count, so low biomass reads as a thinner fill rather than as fewer things — which is why an early Earth and a modern one look like the same picture at different brightness.',k:'SHOW',e:'M',i:3},
{c:'patch',t:'A hunt, framed',n:['hunt','tileact'],d:'When a hunt starts within the patch, mark it. `huntGlance` already exists as a camera hint in the local view — it should have something to glance at.',k:'SHOW',e:'M',i:3},
{c:'patch',t:'Sound for the tile',d:'`audio.js` layers one soundscape and it is Earth\'s everywhere. A tile with a dense biosphere should sound different from a bare one, and the ambient layer is a mix of three or four loops weighted by what is present.',k:'SHOW',e:'M',i:1},
{c:'patch',t:'Assert something moved',n:['tileact'],d:'Render a patch twice, ten ticks apart, on a living world, and assert the pixels differ by more than noise. The world-space pass established that nothing in the suite renders anything; this is the smallest useful pixel assertion and it targets exactly the failure this backlog exists for.',k:'PROVE',e:'M',i:3},
{c:'patch',t:'Count the frames a scene costs',d:'Ten stamp functions per square across 289 squares, plus weather overlays, rivers, plumes and beings. Measure it now, because every item in this category adds to that number and the tick budget is 12 ms for everything.',k:'PROVE',e:'S',i:3},

/* --------------------------------------------------------------- globe -- */
{c:'globe',t:'A behaviour overlay',g:'behovl',n:['preyfield'],d:'Seventy-two overlays and every biological one is a state: `npp`, `guild`, `diversity`, `range`. Add the rates — predation pressure, grazing pressure, birth rate, mortality, net population change. A globe that shows where life is *changing* is a different object from one that shows where it is.',k:'SHOW',e:'M',i:3},
{c:'globe',t:'Population change, signed',n:['popbook'],d:'Red falling, blue rising, black steady. One overlay, computed from the population book, and it answers the question a player of a life simulator asks first and cannot currently ask at all.',k:'SHOW',e:'S',i:3},
{c:'globe',t:'Groups and swarms on the sphere',g:'globeswarm',n:['group'],d:'Discrete marks that move, sized by group size, coloured by lineage. Nothing on that globe currently moves for a biological reason. Storms move; life does not.',k:'SHOW',e:'M',i:3},
{c:'globe',t:'Migration arcs',n:['globeswarm'],d:'A route drawn as a great-circle arc with a moving head, appearing seasonally. The storm layer already draws tracks as a gold trail, so the rendering pattern exists and is proven.',k:'SHOW',e:'M',i:3},
{c:'globe',t:'The colonisation front, animated',n:['front'],d:'A bright moving edge on the occupancy field. This is the picture that the phrase *life growing before your eyes* actually describes and it is a gradient plus a shader term.',k:'SHOW',e:'M',i:3},
{c:'globe',t:'Night lights that grew',d:'`cityLights` returns a single scalar from city count, mean build and a log of population, fed to `technoLights`. The interesting version is per-cell and cumulative, so the player can watch a lit coastline appear over centuries.',k:'SHOW',e:'M',i:3},
{c:'globe',t:'Clade colour on the surface',d:'`cladeRGB(node.id)` already tints beings by lineage. Painting the surface by dominant clade makes biogeography visible at globe scale — the map that shows which lineage owns which continent.',k:'SHOW',e:'S',i:3},
{c:'globe',t:'Biomass, not occupancy',d:'`life[c]` is drawn as a green tint and reads as coverage. A biomass overlay with a real scale — with the ocean actually dark and the rainforest actually bright — is a different and more honest picture, and `biosphereWatts` already computes a global total to calibrate against.',k:'SHOW',e:'S',i:2},
{c:'globe',t:'Grazing pressure',n:['guildfield'],d:'Where herbivores are eating hardest. It is the field that explains why a productive place can look bare, and it is one of the four trophic arrays.',k:'SHOW',e:'S',i:2},
{c:'globe',t:'The tree of life on the globe',d:'Select a node in the Lab tree, see its range light up; select a region, see which nodes live there. The `range` overlay is half of this and the linkage is the part that makes both halves useful.',k:'SHOW',e:'M',i:3},
{c:'globe',t:'An extinction, rendered as an event',d:'`extinctionTick` and the tipping machinery produce events that appear only as chronicle lines. A pulse on the globe where the deaths are, fading over a few thousand years, gives an extinction a place as well as a date.',k:'SHOW',e:'M',i:3},
{c:'globe',t:'Fires, visible from orbit',n:['front'],d:'Bright points on the night side, smoke on the day side. Fire is the most visible biological process on Earth from space and this simulation has the fuel, the ignition and the wind.',k:'SHOW',e:'M',i:2},
{c:'globe',t:'Reef, mangrove, kelp — the structures',d:'`W.reef` is a real field with bleaching. Coastal biogenic structures are narrow, bright, geographically specific and they read at globe scale, which makes them unusually good value per pixel.',k:'SHOW',e:'S',i:2},
{c:'globe',t:'A biosphere seen from far away',d:'`disequilibrium` computes an O₂–CH₄ biosignature and shows it as a number. Presenting the planet as a distant observer would see it — a spectrum, a red edge, a seasonal signal — connects the whole biosphere model to the reason anyone cares about it.',k:'SHOW',e:'M',i:3},
{c:'globe',t:'The overlay legend should say the units',d:'Seventy-two overlays with tooltips that describe meaning and rarely the scale. A behavioural overlay without units is a mood; with units it is a measurement, and this product is explicitly in the business of the latter.',k:'SHOW',e:'S',i:2},
{c:'globe',t:'One overlay for the whole story',d:'A default biosphere view that combines biomass, dominant clade and change, tuned so a single glance reads as *this planet is alive and this is what it is doing*. Seventy-two specialist views and no summary is a diagnostic tool, not a game.',k:'SHOW',e:'M',i:3},
{c:'globe',t:'Do not paint the ocean green',d:'A recurring artefact class from the realism pass. Any life overlay has to handle the ocean on its own scale — a productive ocean is not a productive forest — and the axis-aligned-edge detector should be run on every new overlay added here.',k:'PROVE',e:'S',i:2},
{c:'globe',t:'Overlays that survive a red dwarf',d:'`lifeColour.js` holds 76 hardcoded colour triples. A biosphere overlay under a 2,560 K star should not be Earth green, and the illuminant work in the open-world pass is the mechanism.',k:'SHOW',e:'M',i:2},
{c:'globe',t:'Assert the overlay is not the same picture',n:['behovl'],d:'For each new behavioural overlay, assert its per-cell correlation with `life[c]` is below a stated bound on a test world. An overlay that is a recolour of biomass is a wasted slot, and there are already 72 slots.',k:'PROVE',e:'M',i:3},
{c:'globe',t:'Frames per overlay',d:'Every overlay is a per-cell pass at up to 3.5 M cells. Measure the cost of the behavioural ones specifically, because they update every tick rather than every generate, and `gpgpuClimateTick` shows where the fast path is if they need it.',k:'PROVE',e:'S',i:3},

/* ---------------------------------------------------------------- town -- */
{c:'town',t:'Unthrottle the settlement loop',g:'citysim',d:'Measured on modern Earth, 300 ticks: 326 beings, **one** settler, `meanBuild` 0.00000, zero cities. `kindForCell` gives a settler a `0.03 + build × 0.2` chance on `earthLike` and `agentsTick` multiplies the build rate by 0.12 there. Two independent throttles on the same loop, neither documented, and together they make urban growth unobservable.',k:'MODEL',e:'S',i:3},
{c:'town',t:'A settlement is an entity, not a scan',n:['citysim'],d:'`settleCities` flood-fills the `build` field every 40 years and rebuilds the whole list, capped at 48 settlements and 40 cells each. So a town has no continuous identity: it cannot have a founding date, a history, a name it keeps, or a population that persists between scans.',k:'MODEL',e:'M',i:3},
{c:'town',t:'Population that is counted, not formulated',n:['citysim','popbook'],d:'`pop` is `(80 + build × 4000) × (0.35 + npp × 0.5 + soil × 0.2 + moist × 0.15) × (0.6 + tech × 0.8) × n`. Five factors and six constants producing a number nobody can check. A settlement population should be people who were born, who eat, and who can leave.',k:'MODEL',e:'M',i:3},
{c:'town',t:'A hinterland that feeds it',g:'hinterland',n:['citysim'],d:'A settlement draws food from the cells around it, and the size it can reach depends on their NPP, the soil and how far a cart goes. `npp` at the centre cell is read once as a multiplier. A real catchment is what makes river valleys and deltas produce the first cities.',k:'MODEL',e:'M',i:3},
{c:'town',t:'Food surplus, and what it buys',n:['hinterland'],d:'Surplus is the precondition for specialisation, which is the precondition for everything the technosphere models. Making it an explicit quantity ties the civilisation ladder to the ecology instead of to `unlockedClass`.',k:'MODEL',e:'M',i:3},
{c:'town',t:'Roads between settlements',g:'roads',n:['citysim'],d:'A path over terrain between two settlements, cheapest by slope and water crossings, drawn on the globe and the grid, wearing in with use. `noteWear` is already the field for it. Roads are the most legible artefact of a civilisation at any zoom.',k:'MODEL',e:'M',i:3},
{c:'town',t:'Trade, and what it moves',g:'trade',n:['roads'],d:'Grain from the hinterland, ore from the mountains, salt from the coast — `W.ore` exists per cell. Trade turns 48 independent dots into a network with hubs, and hubs are why some settlements become cities and others do not.',k:'MODEL',e:'M',i:3},
{c:'town',t:'Migration between settlements',n:['trade','popbook'],d:'People leave a failing place for a growing one. That single flow produces urbanisation, abandonment, refugees after a disaster, and it is the same immigration accounting the population book already needs.',k:'MODEL',e:'M',i:3},
{c:'town',t:'Sites chosen for a reason',n:['citysim'],d:'`city.js` already computes `harbour` from tide range and `coastal` from height, which is exactly the right instinct. Extend it: a confluence, a defensible height, a pass, a ford, a spring, a good anchorage. Then the map of settlements is a readout of the terrain.',k:'MODEL',e:'M',i:3},
{c:'town',t:'A settlement that can fail',n:['citysim'],d:'`drowned` is computed and used only to sort the list. Salinisation, drought, exhausted soil, a shifting river, a drowned harbour, a plague — an abandoned town with a date and a cause is worth more than four thriving ones.',k:'MODEL',e:'M',i:3},
{c:'town',t:'Growth stages with visible thresholds',d:'Camp, village, town, city from `build` at 0.3, 0.55 and 0.85, logged to the chronicle. The stages are right and the trigger is one scalar. Tie them to population, surplus and trade so that crossing a threshold is an event with a cause.',k:'MODEL',e:'M',i:2},
{c:'town',t:'Buildings that accumulate',d:'`stampBuildings` draws structures from `build[c]` in the local view. A settlement should visibly add structures over time — the same growth argument as for a body or a forest, applied to the thing players most want to watch grow.',k:'SHOW',e:'M',i:3},
{c:'town',t:'A settlement panel',n:['citysim'],d:'Name, founded, population and its trend, food balance, what it trades and with whom, what limits it, what would kill it. `W.cities` already carries nine fields; this is the presentation the model has been waiting for.',k:'SHOW',e:'M',i:3},
{c:'town',t:'Land use around a town',n:['hinterland'],d:'Cropland, pasture, managed forest, quarry — each a change to the cell that the biosphere then has to live with. `technoTick` has a land-use notion at planet scale; at settlement scale it is the thing that makes a civilisation visible on the surface.',k:'MODEL',e:'M',i:3},
{c:'town',t:'The cost of a settlement to the biosphere',n:['hinterland'],d:'Cleared forest, hunted-out large fauna, a changed fire regime, nutrient runoff. `medeaScore` exists as a self-harm metric. A civilisation that grows without a measured cost is a decoration on the ecology rather than part of it.',k:'MODEL',e:'M',i:3},
{c:'town',t:'Forty-eight is a rendering limit, not a world limit',d:'`W.cities = cities.slice(0, 48)` and the flood fill stops at 40 cells. State which limits are for drawing and which are for modelling, and let the model exceed the drawing.',k:'MODEL',e:'S',i:2},
{c:'town',t:'Names that persist',d:'`name` falls back to `${stage}-${best}` — a stage plus a cell index, so a town is renamed whenever it grows or the scan shifts. A settlement should be named once, at founding, and keep it.',k:'SHOW',e:'S',i:3},
{c:'town',t:'Watch one settlement for a thousand years',n:['citysim'],d:'A time-lapse of one place: huts, a wall, fields spreading, a harbour, a road, a fire, a rebuild. The product has a moment-capture system and a local view; this is the two of them pointed at the thing the player asked to see grow.',k:'PLAY',e:'M',i:3},
{c:'town',t:'Assert a town grows',n:['citysim'],d:'On a productive world, over N ticks, assert at least one settlement crosses each of the three stage thresholds, and assert none does on a barren one. This is the assertion whose absence let the measured zero-city result stand.',k:'PROVE',e:'S',i:3},
{c:'town',t:'Assert a town starves',n:['hinterland'],d:'Remove the hinterland productivity and assert the population falls and the settlement is abandoned with a stated cause. A growth model that cannot shrink is a counter.',k:'PROVE',e:'M',i:3},

/* ----------------------------------------------------------------- civ -- */
{c:'civ',t:'Retire the single planetary ladder',g:'bandtociv',d:'`W.unlockedClass` is one integer 0–7 for the whole planet, read by `kindForCell` to decide whether settlers may exist and by `agentsTick` to decide how fast they build. So every region of every world is at the same stage at the same moment, and a civilisation is a global variable.',k:'MODEL',e:'L',i:3},
{c:'civ',t:'Culture as a regional thing',n:['bandtociv'],d:'Several groups on one planet at different stages, in contact, exchanging or displacing. That is the shape of every real history and it needs the stage to live on a group rather than on the world.',k:'MODEL',e:'L',i:3},
{c:'civ',t:'A technology that has prerequisites',n:['bandtociv'],d:'`technoTable.js` exists as authored data. A tech reached because a population had a surplus, a material and a need — rather than because `unlockedClass` incremented — is the difference between a tech tree and a timer.',k:'MODEL',e:'M',i:3},
{c:'civ',t:'Domestication',n:['bandtociv'],d:'A lineage from the phylogeny becomes a crop or an animal, with its traits changed by selection the settlement applies. It is the most direct possible link between the evolution model and the civilisation model, and both already exist.',k:'MODEL',e:'M',i:3},
{c:'civ',t:'What the planet gave them to work with',n:['bandtociv'],d:'Whether there is a domesticable large animal, a cereal, smeltable ore, navigable water or wood at all depends on the world. `W.ore` and the genome both exist. This is the mechanism that makes two habitable planets produce different histories.',k:'MODEL',e:'M',i:3},
{c:'civ',t:'Energy from somewhere specific',d:'`technoTick` computes a technosphere and `W.energyIncome` is `0.5 + health × 1.5 + meanLife`. Firewood, then coal from buried carbon, then hydro from real discharge, then fission from real ore — the carbon model already tracks burial, so the fossil fuel is genuinely there or genuinely not.',k:'MODEL',e:'M',i:3},
{c:'civ',t:'The technosphere as a consumer in the food web',d:'A civilisation eats. Putting its consumption into the trophic accounting is the honest way to model it, and it makes the biosphere cost of a growing population fall out of the same arithmetic as everything else.',k:'MODEL',e:'M',i:3},
{c:'civ',t:'Population that can crash',n:['popbook'],d:'`civPop` is a sum over city populations from a formula. A civilisation should be able to lose a third of its people to a plague, a famine or a war and take two centuries to recover, because that is what the historical record is mostly made of.',k:'MODEL',e:'M',i:3},
{c:'civ',t:'Conflict, at the resolution the world has',d:'Two groups, one valley. Contested territory, displacement, a wall, an abandoned frontier. Handled at the group level it is cheap; handled at the individual level it is a different game. State which and stay there.',k:'MODEL',e:'M',i:2},
{c:'civ',t:'Knowledge that can be lost',n:['culture'],d:'A technology held by one settlement that dies with it. Loss is the mechanism that makes a tech tree a history rather than a ratchet, and it is the same Muller ratchet argument the genome layer already makes.',k:'MODEL',e:'M',i:2},
{c:'civ',t:'A civilisation that notices its planet',n:['gaiapolicy'],d:'The population reads the climate it is changing and responds — or does not. That is the loop this whole product is about and it currently has no representation at all beyond a `medeaScore`.',k:'MODEL',e:'L',i:3},
{c:'civ',t:'The Anthropocene as a measured transition',d:'`transitions` already tracks the major evolutionary steps as flags with dates. A technosphere transition — when biological and technological energy use cross — is the same kind of dated, defensible marker, and `biosphereWatts` gives one side of it.',k:'MODEL',e:'M',i:3},
{c:'civ',t:'A non-humanoid civilisation',d:'`unlockedClass` runs to `mammal` and the settler sprite is a humanoid. Nothing in the model requires either. A civilisation built by something eusocial, aquatic or sessile is a genuinely different picture and the genome grammar can already describe the builder.',k:'MODEL',e:'L',i:3},
{c:'civ',t:'What a civilisation looks like from orbit',d:'Lights, geometry, straight lines, changed albedo, a changed atmosphere. `technoLights` produces one scalar. The visible fingerprint of a technosphere is a set of specific artefacts and each is worth drawing on its own terms.',k:'SHOW',e:'M',i:3},
{c:'civ',t:'A history you can read',n:['bandtociv'],d:'The chronicle already logs foundings. A civilisation timeline — populations, technologies, disasters, migrations, wars — is the readout that makes the last thousand ticks comprehensible.',k:'SHOW',e:'M',i:3},
{c:'civ',t:'The player as a god they can perceive',d:'`god/` has 15 modules of verbs. A population that notices intervention — that builds where you raised land, that abandons where you struck — closes a loop the god layer currently only writes into.',k:'PLAY',e:'M',i:3},
{c:'civ',t:'Do not let the ladder outrun the biology',d:'Measured: `unlockedClass` reaches 7 on modern Earth within 300 ticks while `meanLife` falls 38% and no settlement exists. The ladder is decoupled from the biosphere it is supposed to be growing out of, and an assertion should tie them.',k:'PROVE',e:'S',i:3},
{c:'civ',t:'Assert two worlds diverge',n:['bandtociv'],d:'Same seed, one world with a domesticable large animal and one without: assert their histories differ in a stated way. If they do not, the civilisation model is not reading the planet.',k:'PROVE',e:'M',i:3},
{c:'civ',t:'A stated ceiling',d:'What is the highest stage this product models, and what happens there. Without an answer, the ladder grows a rung every time somebody has an idea, and `LIFE_CLASSES` plus `technoTable` are already two ladders that do not agree.',k:'MODEL',e:'S',i:2},
{c:'civ',t:'The cost of a civilisation in milliseconds',d:'Roads, trade, hinterlands and migration are all graph work on up to 48 settlements, which is small. Say so with a number, because the reason none of this exists is a suspicion that it is expensive.',k:'PROVE',e:'S',i:2},
];

const P4 = [
/* --------------------------------------------------------------- drive -- */
{c:'drive',t:'State what the in-app model can be',g:'aidesign',d:'The ask is agentic life. The constraint is 12 ms a tick shared with climate, tectonics and rendering, in a browser, offline. Inside that: a per-being utility model, a compiled behaviour tree, a GOAP planner over a handful of actions, or a network of order 100 weights. Outside it: anything that calls a server, and anything that runs a language model per being per tick. Write that boundary down before writing code, because it is the decision everything else in this category inherits.',k:'MODEL',e:'S',i:3},
{c:'drive',t:'Utility scoring as the base mechanism',g:'utility',n:['drivevec','percept'],d:'For each candidate action, score `drive × expected gain × feasibility` and take the best. It is the cheapest agentic architecture that produces legible behaviour, it degrades gracefully under a frame budget, and every term in it is a number the player can be shown — which is what makes it debuggable at all.',k:'MODEL',e:'M',i:3},
{c:'drive',t:'An action table, authored as data',g:'actiontable',n:['utility'],d:'Eat, drink, flee, hide, hunt, graze, travel, rest, court, nest, tend, build, follow, disperse. Each with a cost, a precondition, a duration and an effect, in a JSON file compiled and validated the way `lifegrammar.mjs` compiles the life grammar. Behaviour becomes reviewable data rather than branches in `pickBehav`.',k:'MODEL',e:'M',i:3},
{c:'drive',t:'A behaviour genome, inherited and mutated',g:'behgenome',n:['utility'],d:'The weights that turn drives into action preferences are heritable numbers, so they mutate, they are selected, and a lineage develops a temperament. This is the honest version of *AI-based life creation* in this product: the same selection that already shapes bodies shapes behaviour, and no external model is involved.',k:'MODEL',e:'L',i:3},
{c:'drive',t:'A forty-weight network as the alternative',g:'tinynet',n:['behgenome'],d:'Six perceptual inputs, a hidden layer of six, five action outputs: roughly 78 weights, evaluated with 78 multiply-adds. At 1400 beings that is 109,000 operations a tick — under a tenth of a millisecond. Whether the policy is a weight matrix or a scored table is an implementation choice; both are affordable and the network is more surprising.',k:'MODEL',e:'L',i:3},
{c:'drive',t:'Evolve the policy, do not train it',n:['behgenome'],d:'There is no gradient here and there does not need to be one: selection is already running. A policy that survives is a policy that worked, and evolution strategies on a hundred weights across a thousand individuals over a thousand generations is exactly the regime where this works well.',k:'MODEL',e:'L',i:3},
{c:'drive',t:'Behaviour that speciates with the body',n:['behgenome'],d:'`morphTick` already applies module events and developmental locking. Behaviour modules under the same mechanism means a split lineage diverges in what it does as well as in what it looks like — which is what makes two similar animals different species in practice.',k:'MODEL',e:'M',i:3},
{c:'drive',t:'The GPU path, if it is needed',n:['tinynet'],d:'`vr/sim/gpgpu/` runs the climate tick in shaders already. A policy evaluation for thousands of beings is the same shape of problem. Do not build it first — measure the CPU version and only move it if the number says so.',k:'MODEL',e:'L',i:2},
{c:'drive',t:'Determinism, non-negotiable',n:['utility'],d:'`rngOf(W, \'rngAgents\')` gives a seeded stream. Any policy has to be a pure function of state and that stream, or the fork, the save and the reproducible run all break — and those three are load-bearing for the entire product.',k:'PROVE',e:'M',i:3},
{c:'drive',t:'A drive budget per tick',n:['utility'],d:'Perception, scoring and acting per being per tick, times up to 1400 beings, inside a 12 ms budget shared with everything else. State the target — a millisecond is generous — and assert it, because a behaviour system that misses it will be silently throttled by `noteDroppedTicks`.',k:'PROVE',e:'S',i:3},
{c:'drive',t:'Level of detail for minds',n:['utility'],d:'Beings near the camera think every tick; distant ones every tenth, or not at all, updated as a density. This is the standard answer and it needs to be designed in rather than retrofitted, because the transition is where the visible artefacts live.',k:'MODEL',e:'M',i:3},
{c:'drive',t:'Explain a decision',g:'explainai',n:['utility'],d:'Click a being: this is what it perceived, these were its drives, these were the candidate actions and their scores, this is what it chose and why. An agentic system nobody can interrogate is indistinguishable from a random one, and this panel is also the only practical way to debug it.',k:'SHOW',e:'M',i:3},
{c:'drive',t:'A temperament readout',n:['behgenome'],d:'Bold or cautious, social or solitary, generalist or specialist — derived from the behaviour genome and shown on the species page next to the body. It makes the invisible half of a lineage visible and it is a projection of numbers that already exist.',k:'SHOW',e:'M',i:2},
{c:'drive',t:'Behaviour that is wrong for the world it is in',n:['behgenome'],d:'`morphMult` already penalises a gilled land animal. A behaviour inherited from an ancestor that is maladaptive now — a migration route to a place that dried up — is the same idea and it is one of the most poignant things a simulation can show.',k:'MODEL',e:'M',i:2},
{c:'drive',t:'Do not let every being be the same being',n:['behgenome'],d:'Individual variation around the lineage mean, so a population has bold and shy members. It costs a few bytes, it is the substrate selection acts on, and it is why a crowd looks like a crowd rather than a clone army.',k:'MODEL',e:'S',i:3},
{c:'drive',t:'Author the starting policies, then let them go',n:['actiontable'],d:'A hand-authored default policy per guild as the seed, mutated from there. It gives the first minute of a run competent behaviour and gives evolution somewhere to start, which is the same argument the life pass made for keeping the named-body functions as fixtures.',k:'MODEL',e:'M',i:3},
{c:'drive',t:'A policy is data, so it can be saved',n:['behgenome','entsave'],d:'The behaviour genome goes in the save next to the body genome. `serializeRun` is at version 5 and already stores every genome as JSON, so this is an added field rather than a new mechanism.',k:'MODEL',e:'S',i:3},
{c:'drive',t:'Assert a policy learns the world',n:['behgenome'],d:'Run two worlds — one where food is clustered, one where it is uniform — and assert the evolved policies differ in a stated direction: more travel in the clustered one. If they do not diverge, selection is not reaching behaviour and the whole category is decoration.',k:'PROVE',e:'M',i:3},
{c:'drive',t:'Assert the cheap version is not worse',n:['tinynet'],d:'Compare the scored table against the network on the same worlds by a stated fitness measure. If the table wins, ship the table. This is the assertion that stops an interesting architecture from being chosen over a working one.',k:'PROVE',e:'M',i:2},
{c:'drive',t:'No network calls, ever, in the tick',d:'The product runs from a static site and the whole appeal of an in-app model is that it is in the app. State it as an invariant with a lint, because it is the kind of thing that gets violated once and then is load-bearing.',k:'PROVE',e:'S',i:3},

/* ---------------------------------------------------------------- mind -- */
{c:'mind',t:'A brain that has to be paid for',g:'brainorg',n:['energy'],d:'The organ table already carries a brain and `phasedArray` is gated on it. Give it a metabolic cost proportional to size, so intelligence is a strategy with a price rather than a free upgrade — which is the actual reason most of the biosphere is not intelligent.',k:'MODEL',e:'M',i:3},
{c:'mind',t:'What a brain buys, precisely',n:['brainorg','utility'],d:'More remembered places, longer planning horizon, more candidate actions considered, better prey estimation, the ability to learn at all. Each is a number scaled by brain size, so the trade is quantitative and a player can see both sides of it.',k:'MODEL',e:'M',i:3},
{c:'mind',t:'Perception range from the sense the animal has',n:['percept'],d:'`sensory.js` computes, band by band, what a world delivers to which receptor, and it is the best-grounded module in the biosphere. Wiring it to what a being can actually detect is the single highest-value connection available in this category.',k:'MODEL',e:'M',i:3},
{c:'mind',t:'A world model that can be wrong',n:['percept','memory'],d:'A being acting on a stale memory — going to a waterhole that dried, avoiding a predator that left — is the difference between an agent and a lookup. It also costs nothing extra, since the memory is already stale.',k:'MODEL',e:'M',i:3},
{c:'mind',t:'Attention, so perception has a limit',n:['percept'],d:'A being tracks a few things, not everything in range. It is a performance measure and a behavioural mechanism at the same time, and it produces the failure mode that makes ambush predation work.',k:'MODEL',e:'M',i:2},
{c:'mind',t:'Communication, with a channel that exists',n:['percept'],d:'An alarm call needs the acoustic band `sensory.js` already evaluates; a pheromone trail needs a diffusing field; a display needs a visual band the star actually delivers. A signal that must travel through modelled physics is a signal that differs between worlds.',k:'MODEL',e:'M',i:3},
{c:'mind',t:'Signals that can lie',d:'Deception, mimicry, bluffing and warning colours that are honest or not. It is a small extension of a signalling system and it is where behaviour starts to be interesting rather than merely functional.',k:'MODEL',e:'M',i:2},
{c:'mind',t:'Tool use as an unlock with prerequisites',n:['brainorg'],d:'Requires a manipulator from the organ table, a brain above a threshold and a reason. It is the bridge between the animal layer and the civilisation layer and it should be crossed by a lineage, at a date, in a place.',k:'MODEL',e:'M',i:3},
{c:'mind',t:'Sleep, and what it costs to skip',d:'`isOutNow` already gates activity on a diel cycle. Making rest a requirement with a debt gives predators a window, gives the day a structure, and gives the local view a reason to look different at night.',k:'MODEL',e:'S',i:2},
{c:'mind',t:'Play, which is how you know it is a mind',d:'Juveniles that do things with no immediate payoff. It is cheap, it is only worth having if there are age classes, and it is the single most effective animation for making a creature read as alive.',k:'SHOW',e:'M',i:2},
{c:'mind',t:'An encephalisation quotient, measured',n:['brainorg'],d:'Brain mass against body mass has a published scaling exponent, so a lineage can be plotted against the real relation and the outliers named. This is the kind of check the life pass used for Kleiber and it is available here for free.',k:'PROVE',e:'S',i:2},
{c:'mind',t:'Convergent intelligence, allowed and priced',n:['brainorg'],d:'Cephalopod, corvid, primate — three routes to the same capability with different bodies. The morphology rules already allow convergence and charge for it, which is exactly the right treatment.',k:'MODEL',e:'M',i:2},
{c:'mind',t:'What a mind is like on a dark world',n:['percept'],d:'Under 15 km of Europan ice no photon band survives, and `sensory.js` already ranks electroreception and flow sensing first there. A mind built on electric sense would model the world differently, and that is a genuinely alien result derived from physics rather than invented.',k:'MODEL',e:'M',i:3},
{c:'mind',t:'The sense overlay, from a specific animal',d:'The `sense` overlay shows the globe as the dominant lineage perceives it, which is one of the best ideas in the product. Point it at an individual instead, in the local view, and it becomes the strongest teaching tool here.',k:'SHOW',e:'M',i:3},
{c:'mind',t:'Do not give everything a mind',d:'Most of the biosphere by mass is bacteria, plants and fungi. The drive model must degrade to nothing for a mat, a tree or a sponge, and the fact that it does should be visible rather than a special case buried in a condition.',k:'MODEL',e:'S',i:3},
{c:'mind',t:'A mind that the tree remembers',n:['brainorg'],d:'When a lineage crosses a cognitive threshold, log it as a transition with a date and a cell, the way `transitions` logs photosynthesis. The first tool, the first teaching, the first signal — these are the milestones a run should be able to list afterwards.',k:'SHOW',e:'S',i:3},
{c:'mind',t:'A brain in the body plan drawing',d:'`drawCreature` builds a silhouette from the expressed plan. A large-brained animal should look like one — head proportion, eye size, posture — so the cognitive axis is visible in the same picture as everything else.',k:'SHOW',e:'M',i:2},
{c:'mind',t:'Assert the brain is not free',n:['brainorg'],d:'On a low-productivity world, assert large-brained lineages are selected against; on a variable one, assert they are favoured. That is the published explanation for why intelligence is rare and it is a testable prediction of this model.',k:'PROVE',e:'M',i:3},
{c:'mind',t:'Assert perception gates behaviour',n:['percept'],d:'A blind lineage and a sighted one on the same world should produce measurably different movement statistics. If they do not, `sensory.js` is not connected to anything that acts.',k:'PROVE',e:'M',i:3},
{c:'mind',t:'One page on what a mind is here',d:'The glossary already carries definitions. Cognition is the area where a simulation most easily overclaims, so the page should say exactly what is modelled, what is asserted and what is a sprite — the same honesty the provenance tags apply to materials.',k:'PROVE',e:'S',i:3},

/* --------------------------------------------------------------- learn -- */
{c:'learn',t:'Learning inside one lifetime',g:'lifelearn',n:['utility','memory'],d:'A small update to a being\'s own policy from what happened: this place had food, that place had a predator, this prey fought back. Reinforcement on a handful of weights, bounded, decaying. It is the loop that operates in seconds rather than eons, which is exactly what a watched world needs.',k:'MODEL',e:'M',i:3},
{c:'learn',t:'Habituation and sensitisation',n:['lifelearn'],d:'The two simplest forms of learning, present in animals with almost no nervous system, and both are a single decaying weight. Cheap enough to give to nearly everything, which is what makes a whole population respond to a repeated event.',k:'MODEL',e:'S',i:3},
{c:'learn',t:'Imprinting, and what it fixes',n:['lifelearn'],d:'What a juvenile learns early it keeps. It creates lineages of preference within a species — natal site fidelity, host preference — and it is one of the recognised routes to speciation without geographic isolation, which `evolveTick` currently reaches only through an isolation scalar.',k:'MODEL',e:'M',i:2},
{c:'learn',t:'Learned aversion, from a real event',n:['lifelearn'],d:'A defended prey that is tasted once and avoided afterwards. It makes the genome defence axis pay off through behaviour rather than through a fitness multiplier, and it is the mechanism behind warning colouration.',k:'MODEL',e:'M',i:2},
{c:'learn',t:'Knowing where things are',n:['memory','lifelearn'],d:'Spatial learning is the highest-value learning in a world with a heterogeneous resource map, and this world has one. It converts a random walk into a route and it is the substrate for both migration and territory.',k:'MODEL',e:'M',i:3},
{c:'learn',t:'Imitation between individuals',g:'culture',n:['lifelearn'],d:'A behaviour copied from a neighbour without passing through a genome. It is the second inheritance channel, it spreads orders of magnitude faster than mutation, and it is the mechanism that makes a population feel like it has a shared way of doing things.',k:'MODEL',e:'L',i:3},
{c:'learn',t:'Teaching, which costs the teacher',n:['culture'],d:'An adult that spends time transferring a behaviour to a juvenile at a cost to itself. Rare in nature, expensive, and the precondition for anything cumulative — which is the precondition for the civilisation ladder to mean anything.',k:'MODEL',e:'M',i:3},
{c:'learn',t:'A tradition, held by a group',n:['culture','group'],d:'A behaviour a group has and a neighbouring group does not. Traditions drift, they can be lost when a group dies, and they can be traced — which makes a cultural phylogeny alongside the genetic one, drawn by the same tree code.',k:'MODEL',e:'M',i:3},
{c:'learn',t:'Cumulative culture, and the threshold for it',n:['culture'],d:'When transmission fidelity times population size passes a threshold, behaviours can accumulate rather than being reinvented. There is a real quantitative argument for that threshold, it depends on population size, and it is the honest bridge from animal to civilisation.',k:'MODEL',e:'L',i:3},
{c:'learn',t:'Dialects, drawn on the globe',n:['culture'],d:'A learned signal that diverges between regions. It is a visible map of cultural isolation, it uses the same clade-colour machinery as `cladeRGB`, and it is one of the few cultural phenomena that renders naturally at globe scale.',k:'SHOW',e:'M',i:2},
{c:'learn',t:'Culture that can go extinct without the population',n:['culture'],d:'A tradition lost while the species survives. It is a distinct kind of loss from extinction, it is measurable, and it gives the chronicle a class of event it does not currently have.',k:'MODEL',e:'M',i:2},
{c:'learn',t:'The Baldwin effect, if it earns its place',n:['culture','behgenome'],d:'Learned behaviour changing which genomes are selected. It is a real and much-argued mechanism; if the model shows it, that is a genuine result worth a chronicle entry, and if it does not, that is worth knowing too.',k:'MODEL',e:'L',i:2},
{c:'learn',t:'A learning rate that is a trait',n:['lifelearn','behgenome'],d:'How fast an individual learns is heritable and costly — a fast learner is also a fast mis-learner. Making it a genome axis puts the plasticity–specialisation trade under selection instead of into a constant.',k:'MODEL',e:'M',i:2},
{c:'learn',t:'Show what an animal has learned',n:['lifelearn','beinginspect'],d:'In the inspect panel: the places it knows, the things it avoids, what it learned most recently. It is the only way a player will believe learning is happening rather than being claimed.',k:'SHOW',e:'M',i:3},
{c:'learn',t:'A learning event in the chronicle',n:['culture'],d:'The first tool, the first taught behaviour, the first tradition to spread beyond its group. `maybeCaptureMoment` already captures firsts; these are the behavioural ones and they are the milestones this backlog is aiming at.',k:'SHOW',e:'S',i:3},
{c:'learn',t:'Bound the learning so it cannot run away',n:['lifelearn'],d:'Unbounded reinforcement on a shared policy produces degenerate behaviour within a few thousand ticks — every being doing the one thing that scored best once. Clamp, decay and inject noise, and assert the diversity of behaviour does not collapse.',k:'PROVE',e:'M',i:3},
{c:'learn',t:'Assert learning beats not learning',n:['lifelearn'],d:'Two identical lineages on a variable world, one with learning enabled. Assert the learner has higher survival, and assert that on a uniform world it does not — because learning should only pay where there is something to learn.',k:'PROVE',e:'M',i:3},
{c:'learn',t:'Assert a tradition spreads and stops',n:['culture'],d:'Seed a behaviour in one group and measure its spread: faster than genetic spread, blocked by the same barriers, lost when the group is culled. Three assertions that separate culture from a global flag.',k:'PROVE',e:'M',i:3},
{c:'learn',t:'The cost of learning in milliseconds',n:['lifelearn'],d:'A policy update per being per tick is a few multiply-adds, so the honest answer is that it is nearly free and the expensive part is the perception it depends on. Measure both separately so the attribution is right.',k:'PROVE',e:'S',i:2},
{c:'learn',t:'Say which of the two channels a behaviour came from',n:['culture'],d:'Genetic or learned. It matters for what happens when the population crashes, and a readout that confuses them will teach the player something false about how inheritance works.',k:'SHOW',e:'S',i:3},

/* ------------------------------------------------------------- gaiamind -- */
{c:'gaiamind',t:'Four if-statements are the whole autopilot',g:'gaiapolicy',d:'Partial. Replaced by `gaiaDrive.js`: mood, tips, rate stress and resilience tighten the comfort band. Still nudges solar/CO₂ directly.',k:'MODEL',e:'M',i:3},
{c:'gaiamind',t:'A controller that reads the whole state',n:['gaiapolicy'],d:'Landed (first cut). `gaiaPolicyTick` reads mood, tip proximity, rate stress, resilience and life trend.',k:'MODEL',e:'M',i:3},
{c:'gaiamind',t:'Say what it is optimising',n:['gaiapolicy'],d:'Landed (first cut). Regulator / Gardener / Experimenter each name an aim on `W.gaiaObjective`. Diversity/complexity objectives still open.',k:'MODEL',e:'M',i:3},
{c:'gaiamind',t:'Act before the tipping point, not after',n:['gaiapolicy'],d:'Landed (first cut). High `tipProximity` tightens bands and strengthens steps before elements trip.',k:'MODEL',e:'M',i:3},
{c:'gaiamind',t:'Look ahead by running the model',n:['gaiapolicy'],d:'`forkRun` exists. A controller that forks, runs a few hundred cheap ticks under two candidate actions, and picks the better is model-predictive control — and it is the most defensible form of planetary intelligence this product could actually ship.',k:'MODEL',e:'L',i:3},
{c:'gaiamind',t:'Keep Gaia honest about what it is',d:'`W.gaiaMode` is already set to `survivorship` or `transient` and the wording in the code is careful about selection rather than purpose. Any controller has to be labelled: a player autopilot, a tutorial feedback loop, or an explicitly fictional planetary mind. The product\'s credibility rests on that label.',k:'MODEL',e:'S',i:3},
{c:'gaiamind',t:'Three named Gaia dispositions',n:['gaiapolicy'],d:'Landed. Gaia button cycles off → Regulator → Gardener → Experimenter → off. HUD chip and Lab tower show the drive.',k:'PLAY',e:'M',i:3},
{c:'gaiamind',t:'The Medea option',d:'`medeaScore` already computes biosphere self-harm. A controller that pursues it is the counterweight to Gaia and it is a real hypothesis in the literature, not a joke setting.',k:'PLAY',e:'M',i:2},
{c:'gaiamind',t:'A log that says why',d:'`W.gaiaLog` keeps 60 entries of the form `raised solar — too cold`. With a real objective the log can state the cost, the alternative and the expected effect, which turns the autopilot into a demonstration of control theory rather than a black box.',k:'SHOW',e:'S',i:3},
{c:'gaiamind',t:'A voice for the biosphere',g:'gaiavoice',n:['gaiapolicy'],d:'One sentence at a time, in the chronicle: what the biosphere is doing, what is limiting it, what it is about to lose. The narration should be generated from the state vector by templates over real numbers, never invented — and it is what makes a planet feel like it has a drive.',k:'SHOW',e:'M',i:3},
{c:'gaiamind',t:'Do not let the autopilot cheat',n:['gaiapolicy'],d:'`gaiaPolicyTick` writes `W.solar` and `W.gases.CO2` directly. A controller should act through the same verbs the player has — the god layer has 15 modules of them — with the same costs and the same receipts, or it is not a player of the game.',k:'MODEL',e:'M',i:3},
{c:'gaiamind',t:'The energy budget as the constraint',d:'`W.energy`, `energyCap` and `energyIncome` exist and `god/economy.js` and `god/receipt.js` are already built. A controller on a budget has to choose, and choosing is what makes its behaviour interesting.',k:'MODEL',e:'M',i:3},
{c:'gaiamind',t:'Gaia versus the player',n:['gaiapolicy'],d:'Let the controller run while the player interferes, and show the two sets of actions in the same log. It is a game mode, a tutorial and a demonstration of feedback all at once.',k:'PLAY',e:'M',i:3},
{c:'gaiamind',t:'Regulation that fails visibly',n:['gaiapolicy'],d:'A controller pushed past what its verbs can fix should visibly lose — because that is the actual lesson of planetary regulation, and a controller that always wins teaches the opposite of the intended thing.',k:'MODEL',e:'M',i:3},
{c:'gaiamind',t:'Daisyworld as the honest tutorial',d:'The daisyworld path already exists with N species, `gaiaMode = tutorial-feedback` and a rising sun. It is the one place regulation is genuinely emergent rather than controlled, and it should be presented as the reference case any controller is compared against.',k:'SHOW',e:'M',i:2},
{c:'gaiamind',t:'A planetary dashboard',d:'Resilience, feedback gain, rate stress, tipping proximity, biosphere trend, and what the controller intends to do next. Six numbers that already exist, in one place, is the difference between an instrumented planet and a green sphere.',k:'SHOW',e:'M',i:3},
{c:'gaiamind',t:'Feedback gain that is measured, not fitted',d:'`W.feedbackGain` is `weatheringFlux × 20 − rateStress`, clamped. Gain should be measured by perturbing the system and observing the response — which the fork machinery makes possible and which turns a fitted constant into an experiment.',k:'PROVE',e:'M',i:3},
{c:'gaiamind',t:'Assert the controller helps',n:['gaiapolicy'],d:'Landed (first cut). Suite: frozen mood raises solar; cold solar recovers at least as well with Regulator on as off.',k:'PROVE',e:'M',i:3},
{c:'gaiamind',t:'Assert it cannot save everything',n:['gaiapolicy'],d:'Under a large enough forcing the controller must fail, and the failure should be graceful and legible. Assert the failure mode, because an unbounded controller will eventually be found holding a planet in a state the physics does not allow.',k:'PROVE',e:'M',i:3},
{c:'gaiamind',t:'One page on what Gaia means here',d:'Survivorship, not purpose — the code says it and the interface should too. The distinction between a biosphere that regulates because regulators persist and a biosphere that intends to regulate is the single most misunderstood idea this product touches.',k:'PROVE',e:'S',i:3},
{c:'gaiamind',t:'Two thermostats, pick one',d:'`gaiaPolicyTick` nudges solar and CO₂ when `W.autopilot` is on. `thermostatTick` in `god/climate.js` pins `meanTemp` by cheating solar and marks the run as not counting. They can both run. A planet with two independent temperature controllers is not regulating; it is being held. Delete or fuse, and make the cheat remain a cheat.',k:'MODEL',e:'S',i:3},
{c:'gaiamind',t:'`forecastAct` exists and Gaia never calls it',n:['gaiapolicy'],d:'`god/receipt.js` already forecasts a tool at 10, 100 and 1,000 years. That is the lookahead the controller was going to invent. Wire it, or the fork-and-roll item is reinventing a function that is sitting unused one directory over.',k:'MODEL',e:'M',i:3},
{c:'gaiamind',t:'`playStyle` exists and Gaia never reads it',n:['gaiapolicy'],d:'`playStyle` and `restraintStats` already classify the god from the intervention log. A planetary controller that does not know whether it is dealing with a vandal or a gardener cannot choose a response, and those two functions are the classification.',k:'MODEL',e:'S',i:3},
{c:'gaiamind',t:'Control on three timescales',n:['gaiapolicy'],d:'Clouds and ice answer in years, vegetation in decades to millennia, silicate weathering in 100 kyr to 1 Myr. A single 0.002 solar nudge per tick has no timescale. Split the controller into fast, slow and geologic verbs, or it will fight the carbon cycle with a dimmer switch.',k:'MODEL',e:'L',i:3},
{c:'gaiamind',t:'The carbon cycle is the nervous system',n:['gaiapolicy'],d:'Photosynthesis, respiration, weathering, burial, outgassing — the signals a planetary mind would actually have. `W.carbon` already carries fluxes. Reading `meanTemp` instead of those fluxes is listening to a fever without taking a pulse.',k:'MODEL',e:'M',i:3},
{c:'gaiamind',t:'Disequilibrium is what it feels like to be alive',d:'`W.disequilibrium` is `sqrt(O2 × CH4) × 200`, the one scalar that means something here is fighting entropy. A controller that does not read it is ignoring the biosignature this product already computes, and a voice that does not mention it is not talking about life.',k:'MODEL',e:'S',i:3},
{c:'gaiamind',t:'N-species Daisyworld with mutable albedo',d:'Lenton and Lovelock 2000: let albedo mutate and the regulated temperature range widens because the system keeps finding new species to do the job. `daisyNSpeciesTick` exists. Mutable albedo is a small change and it is the answer to the standard objection that Daisyworld is a toy with two paint colours.',k:'MODEL',e:'S',i:2},
{c:'gaiamind',t:'The Gaian bottleneck, as a catalogue claim',d:'Chopra and Lineweaver: most biospheres fail to establish regulation before the planet runs away. Run the 120-world catalogue with the controller off, count how many ever regulate, and you have an empirical claim this product can actually make rather than a quotation.',k:'PROVE',e:'M',i:2},
{c:'gaiamind',t:'Kirchner\'s critique, playable',d:'Homeostasis can be a coincidence of forcings, not a biosphere doing work. A scenario that turns life off and shows the same temperature path would falsify Gaia on that world. If the product cannot run that experiment it cannot claim the hypothesis.',k:'PROVE',e:'M',i:3},
{c:'gaiamind',t:'Do not let the policy replace the physics',n:['gaiapolicy'],d:'If the controller is the only reason temperature is stable, the planet is not a Gaia world — it is a clamped slider. Assert that with autopilot off, weathering, ice-albedo and clouds still oppose a perturbation, or the sentience layer is a cheat code wearing a myth.',k:'PROVE',e:'M',i:3},
{c:'gaiamind',t:'A closed demo: perturb, wait, photograph',n:['gaiapolicy'],d:'Double CO₂, run 200 years of presentation time, export before and after discs, with the controller on and off. This is the modern SimEarth trailer and it is also the test that the face, the metabolism and the policy are the same event.',k:'PLAY',e:'M',i:3},
];

const P5 = [
/* -------------------------------------------------------------- author -- */
{c:'author',t:'Author-then-compile is the pattern this repo already trusts',g:'authorai',d:'`lifegrammar.mjs` validates authored JSON and compiles it into a frozen `lifeGrammar.js`, and the validator caught a real error on its first run. Any generative model in this product belongs at that step: it proposes rows, a human reviews them, the compiler validates them, and the runtime only ever sees frozen data.',k:'MODEL',e:'M',i:3},
{c:'author',t:'Generate the guild table, then check it',n:['authorai','guildfield'],d:'Forty guilds with feeding modes, size ranges, habitats and interaction coefficients is exactly the kind of table that is tedious to author and easy to validate. Generate a draft, validate against physical bounds, review, commit the JSON — and the model is not in the tick.',k:'MODEL',e:'M',i:3},
{c:'author',t:'Behaviour trees as compiled data',n:['authorai','actiontable'],d:'A tree is a small structure over a fixed action vocabulary, so it can be generated, validated against the vocabulary, diffed and reviewed. That gives the variety a generative model is good at without giving up determinism, which is the whole trade.',k:'MODEL',e:'M',i:3},
{c:'author',t:'Names that a model wrote and a human kept',d:'`nameFrom` uses two syllable tables and `cladeName` builds a pronounceable name from traits. A generated name bank per world — settlements, lineages, landforms, regions — compiled to data, gives a hundred and twenty worlds their own vocabulary at no runtime cost.',k:'SHOW',e:'M',i:2},
{c:'author',t:'The chronicle sentence, from a template over real numbers',n:['gaiavoice'],d:'`logEvent` writes fixed strings. Richer sentences must be assembled from measured quantities by templates, never invented, because a chronicle that says something the simulation did not do is worse than a terse one. This is the discipline that makes generated prose safe here.',k:'SHOW',e:'M',i:3},
{c:'author',t:'A scenario author',n:['authorai'],d:'`god/scenario.js` exists. Scenarios are a small structured object — initial conditions, a forcing, a goal, a scoring rule — and generating a hundred of them, validated and reviewed, is a large content win from a small mechanism.',k:'PLAY',e:'M',i:2},
{c:'author',t:'Species descriptions, bounded by the genome',n:['authorai'],d:'A paragraph about a creature that reads only from its expressed plan, its habitat and its diet. Every claim traceable to a field, nothing added. That constraint is what separates a description from a fabrication.',k:'SHOW',e:'M',i:2},
{c:'author',t:'Provenance for anything a model wrote',d:'`substrates.json` and `cover.json` carry 35 provenance tags between them and it is the best discipline in the data layer. A generated row needs a fourth tag beyond measured, inferred and invented: *generated, reviewed by*, with the date.',k:'PROVE',e:'S',i:3},
{c:'author',t:'A review gate that cannot be skipped',n:['authorai'],d:'No generated row reaches `vr/` without a human-reviewed commit. Make it structural — generated output lands in a staging directory that the compiler refuses to read until it is moved — because the whole safety argument depends on the gate being real.',k:'PROVE',e:'S',i:3},
{c:'author',t:'Validate against physics, not against taste',n:['authorai'],d:'A generated guild with a transfer efficiency above one, a body mass outside the grammar\'s range or a diet that violates chirality has to fail the compiler. The validator is what makes generated content trustworthy, and it exists already for the life grammar.',k:'PROVE',e:'M',i:3},
{c:'author',t:'Do not let a model invent a mechanism',d:'The failure mode is generated content that implies physics the simulation does not have — a creature described as photosynthetic on a world with no usable photons. The generator must be given the same tables the simulation reads, and its output must round-trip through them.',k:'PROVE',e:'M',i:3},
{c:'author',t:'A diffable format for generated data',d:'Stable key order, one row per line, stable number formatting. The world-space pass made this point about a 27 KB generated JSON and it applies harder to generated content, because the review is the only thing standing between a draft and the product.',k:'PROVE',e:'S',i:2},
{c:'author',t:'Version what generated it',n:['authorai'],d:'`GRAMMAR_VERSION` exists for the life grammar. A generated table needs the same, plus which prompt and which model produced it, so a regression can be traced to a batch rather than to a row.',k:'PROVE',e:'S',i:2},
{c:'author',t:'Keep the hand-authored rows as the fixture',n:['authorai'],d:'The pattern the life and open-world passes both used: the hand-written version becomes the expected output of the generated path. It is how you find out the generator drifted.',k:'PROVE',e:'M',i:3},
{c:'author',t:'A budget for how much of this is generated',d:'A product where most of the content is generated and none of it is reviewed is a different product. State the fraction, count it the way `dataratio` counts data against code, and let the number be visible.',k:'PROVE',e:'S',i:2},
{c:'author',t:'The player as author, with the same gate',d:'The strongest argument that behaviour is data is a player editing it. A behaviour editor in the Lab that writes the same JSON the compiler validates makes the data layer visible and makes the gate symmetric.',k:'PLAY',e:'L',i:2},
{c:'author',t:'Share a creature, share a behaviour',d:'`seedword.js` encodes a world in four words and the life pass asked for a shareable genome seed. A behaviour genome is a short vector, so the same encoding carries it, and a creature that arrives with its temperament intact is a much better thing to share.',k:'PLAY',e:'M',i:2},
{c:'author',t:'Say plainly where the model is and is not',d:'A page that states it: a generative model authors tables offline, a small evolved policy decides what a being does at runtime, and no network call happens in a tick. Users of a product that says *AI life* will assume the wrong thing unless it is written down.',k:'PROVE',e:'S',i:3},
{c:'author',t:'Assert the runtime has no model in it',n:['authorai'],d:'A lint that fails the suite if `vr/` gains a fetch to a model endpoint, a bundled weights file above a stated size, or an import of an inference library. The invariant is cheap to state now and expensive to recover later.',k:'PROVE',e:'S',i:3},
{c:'author',t:'One command that runs every compiler',d:'`scripts/data.mjs` already runs the eight compilers. A generated-content step joins it, so the tree is either consistent or the build fails — which is the same argument the open-world pass made and the reason the pattern is worth reusing rather than reinventing.',k:'PROVE',e:'S',i:3},

/* -------------------------------------------------------------- budget -- */
{c:'budget',t:'State the tick budget for life',g:'entbudget',d:'`simTick` plus `agentsTick` over 12 ms calls `noteDroppedTicks` and dumps the accumulator. Everything in this backlog spends from that. Write down the split — how many milliseconds for perception, decision, population, groups, settlements — before building, because the alternative is discovering the limit as a stutter.',k:'PROVE',e:'S',i:3},
{c:'budget',t:'Measure what beings cost today',n:['entsim','entbudget'],d:'`W._msSim` times the sim tick and `agentsTick` runs outside it, so the cost of 326 to 489 beings is currently unmeasured. Measure it at 560, at 1400, and at the resolutions in `N_ALLOWED` up to 768.',k:'PROVE',e:'S',i:3},
{c:'budget',t:'Parallel arrays, not meta objects',n:['drivevec'],d:'`ENT.meta` is an array of plain objects with fifteen fields including a nested `plan`. Every drive, target and memory added there is another allocation and another pointer chase. Typed arrays for the hot fields, objects only for the rare ones.',k:'MODEL',e:'M',i:3},
{c:'budget',t:'A stated maximum population, defended',d:'`MAX_ENT` 1400, `capForWorld` 560 on Earth-like, a stride computed from the cap, and a top-up that refuses above 85%. Four limits, one design question: how many individuals does this product want to simulate. Answer it once.',k:'MODEL',e:'S',i:3},
{c:'budget',t:'Groups as the scaling answer',n:['group'],d:'A herd of ten thousand is one record. Aggregating is how a simulation shows a swarm without simulating a swarm, and the design question is where the boundary sits and how visible the transition is.',k:'MODEL',e:'M',i:3},
{c:'budget',t:'Level of detail by distance',n:['utility'],d:'Full behaviour near the camera, coarse behaviour in the mid-field, a density everywhere else. It is the only way the numbers work at globe scale and it needs to be a designed transition rather than an emergent artefact.',k:'MODEL',e:'M',i:3},
{c:'budget',t:'A spatial index that is already right',d:'`rebuildBuckets` builds a per-cell head-and-next linked list over beings every tick and `eachNearby` walks a cell plus four neighbours. That is the correct structure for this grid; the item is to keep it, keep it incremental, and not replace it with a tree.',k:'MODEL',e:'S',i:2},
{c:'budget',t:'Do not rebuild what did not change',d:'`respawnEntities` rebuilds from zero and `settleCities` rescans the whole build field every 40 years. Both are O(NC) sweeps triggered by events that change a handful of cells. Dirty-marking is the routine fix and it frees budget for everything else here.',k:'MODEL',e:'M',i:3},
{c:'budget',t:'Field passes, counted',n:['guildfield'],d:'Four trophic arrays, a predation-pressure field, a trail field and a being-count field is seven new per-cell passes. At 3.5 M cells that is not free. Count the passes, fuse the ones that share a loop, and state the total.',k:'PROVE',e:'M',i:3},
{c:'budget',t:'A memory budget for the biosphere',n:['guildfield'],d:'Seven `Float32Array`s at N=768 is 100 MB. The open-world pass made exactly this calculation for a per-cell material stack and concluded the design has to state which it is before it is written. Same discipline, same reason.',k:'PROVE',e:'S',i:3},
{c:'budget',t:'The GPU is already here',d:'`gpgpuClimateTick` runs the climate in shaders when available and `atmoMetaTick` handles the fallback. Trophic fields are the same shape of problem. The item is not to do it — it is to know the door exists and what it costs to walk through.',k:'MODEL',e:'L',i:2},
{c:'budget',t:'Behaviour on a worker',d:'`vr/sim/worker.js` exists. Behaviour is a good candidate for off-thread work because it reads fields and writes beings, but it must not become non-deterministic in the move, which is the whole difficulty.',k:'MODEL',e:'L',i:2},
{c:'budget',t:'Amortise across ticks',n:['utility'],d:'Not every being needs to think every tick. Round-robin a fraction of the population per tick with a stated staleness bound, which is a large constant-factor win and is invisible if the bound is chosen well.',k:'MODEL',e:'M',i:3},
{c:'budget',t:'A frame budget the player can see',d:'`W._msSim` exists. A performance line that breaks down climate, ecology, behaviour, population and render is what makes it possible to have this conversation with evidence instead of instinct.',k:'SHOW',e:'S',i:2},
{c:'budget',t:'The mobile case',d:'The product has a mobile HUD, and mobile is where a 12 ms budget is a real constraint rather than a comfortable one. Every item here needs a stated behaviour under half the budget.',k:'PROVE',e:'M',i:3},
{c:'budget',t:'Degrade the model, not the frame rate',d:'When the budget is exceeded the current code drops simulated time. For behaviour that is acceptable; for population it is a leak. Decide per system and write it down, because a silently skipped birth is a bug nobody will find.',k:'MODEL',e:'M',i:3},
{c:'budget',t:'A performance regression test',n:['entbudget'],d:'A headless run that times N ticks with the biosphere at full population and fails above a threshold. The suite has 542 assertions and none of them is a clock, so nothing prevents this backlog from making the product slow.',k:'PROVE',e:'M',i:3},
{c:'budget',t:'Garbage, per tick',d:'`updateFoodWeb` allocates a `nodes` array, a `links` array and a `prey` array per lineage per tick, and `settleCities` builds objects for every settlement. Sustained allocation is the usual cause of periodic stutter in a loop like this one.',k:'PROVE',e:'S',i:2},
{c:'budget',t:'Assert the tick stays inside the budget',n:['entbudget'],d:'At the stated maximum population, on the stated reference resolution, with every system in this backlog enabled. One number, in CI, that fails when somebody adds a per-being loop.',k:'PROVE',e:'M',i:3},
{c:'budget',t:'The cheapest possible version of everything here',d:'For each of the categories in this backlog, write down the version that fits in a tenth of the budget. Most of the value — a drive vector, a birth, a group with a heading, a front with a shape, a planetary scorer that reads scalars — is arithmetic, and the expensive versions are optional.',k:'PROVE',e:'S',i:3},

/* ---------------------------------------------------------------- read -- */
{c:'read',t:'A running account, not a state dump',g:'censusline',d:'`viewCensus` ranks cover shares and counts beings by kind. What a player of a living world wants is a sentence: *the herd moved south, the reef is bleaching, the second settlement is short of grain*. Generated from real fields by templates, one at a time, in the readout.',k:'SHOW',e:'M',i:3},
{c:'read',t:'A hunt camera',g:'huntcam',n:['hunt'],d:'`huntGlance` already exists as a camera hint in the local view. Point it at an actual predation event and the product gains its most watchable moment for the cost of a queue of recent events.',k:'PLAY',e:'M',i:3},
{c:'read',t:'Follow a lineage through the run',n:['popbook'],d:'Pick a node in the Lab tree and get a running story: where it spread, what it ate, what ate it, when it nearly died, what it became. All of it is in the phylogeny and none of it is presented as a narrative.',k:'SHOW',e:'M',i:3},
{c:'read',t:'A species page that includes behaviour',n:['behgenome'],d:'The life pass built a species page from the genome. Add what the animal does: diet, feeding mode, sociality, temperament, activity pattern, learning. The behavioural half of a species is currently invisible.',k:'SHOW',e:'M',i:3},
{c:'read',t:'The ecosystem of this cell',n:['guildfield'],d:'Inspect already lists fields for a cell. It should list the community: guilds present with abundances, dominant lineages, what limits production here, and the three biggest flows of energy through this square.',k:'SHOW',e:'M',i:3},
{c:'read',t:'A population dashboard',n:['popbook'],d:'Top lineages by population, their trends, births and deaths this interval, and the cause breakdown of the deaths. Four numbers per lineage and it is the readout that makes a food web comprehensible.',k:'SHOW',e:'M',i:3},
{c:'read',t:'What is limiting the biosphere right now',d:'Light, nutrients, temperature, water, oxygen, space, predation. The model computes every one of these per cell and never says which is binding — which is the single most useful sentence a biosphere readout could produce.',k:'SHOW',e:'M',i:3},
{c:'read',t:'The chronicle, filtered by life',d:'`W.chron` mixes tectonics, weather, tipping points and biology. A biosphere-only view of it is the history of the thing this backlog is about, and it is a filter on data that already exists.',k:'SHOW',e:'S',i:2},
{c:'read',t:'Milestones that are behavioural',d:'`MOMENT_KEYS` has eight firsts and all eight are metabolic or morphological. First predation, first group, first migration, first tool, first taught behaviour, first settlement, first trade. Same mechanism, and these are the ones a player will remember.',k:'SHOW',e:'S',i:3},
{c:'read',t:'A time-lapse of the biosphere',d:'Occupancy, dominant clade and population every N ticks, replayable. The product captures moments already; a replay is what lets a player see a 1.7 Gyr run as a shape rather than as a final state.',k:'SHOW',e:'M',i:3},
{c:'read',t:'Show the counterfactual',d:'`forkRun` exists. *This is what would have happened if you had not done that* is the strongest possible readout for a god game and the fork machinery is most of the work.',k:'PLAY',e:'L',i:2},
{c:'read',t:'A biosphere report card',d:'`health`, `resilience`, `habitability`, `inhabitance`, `medeaScore`, `disequilibrium` and `shannon` all exist and are scattered. One card, with each number explained and its trend, is a small piece of work with a large effect on legibility.',k:'SHOW',e:'M',i:3},
{c:'read',t:'Tell the player what to look at',d:'On a planet with 3.5 M cells and a thousand beings, the interesting event is somewhere else. A notification that names it and offers to go — the storm layer already tracks named cyclones this way — is what turns a simulation into something watchable.',k:'PLAY',e:'M',i:3},
{c:'read',t:'A glossary entry for every new quantity',d:'`glossary.js` exists. Predation pressure, grazing pressure, transfer efficiency, minimum viable population, carrying capacity, encephalisation — each needs a definition, a unit and a typical value, or the readouts are decoration.',k:'SHOW',e:'M',i:3},
{c:'read',t:'Say when something is a sprite',d:'The realism discipline in this repo is to distinguish what is modelled from what is drawn. If ambient fauna is decoration and the herd is simulated, the interface should be able to say which, because a player who cannot tell will trust the wrong thing.',k:'SHOW',e:'S',i:3},
{c:'read',t:'A readout that works while paused',d:'Most of what a player wants to understand is best examined stopped. Every panel here must be meaningful with `dtYr` at zero, which is a constraint on what can be an instantaneous rate.',k:'SHOW',e:'S',i:2},
{c:'read',t:'The mobile version of the census',d:'The product has a mobile HUD and the census line is the readout most likely to be looked at on a phone. One sentence and three numbers, not a table.',k:'SHOW',e:'M',i:2},
{c:'read',t:'A shareable summary of a run',d:'`serializeRun` saves a run and `seedword.js` encodes a world in four words. A run summary — the seed, the age, the tree, the biggest extinction, the settlement that lasted longest — is the artefact somebody would actually post.',k:'PLAY',e:'M',i:2},
{c:'read',t:'Assert the readouts agree with the model',d:'`civPop` sums city populations, `meanBuild` samples every seventh cell, `W.trophic` derives from a global mean. Assert each displayed number equals a direct computation from the fields, because a wrong readout is worse than a missing one.',k:'PROVE',e:'M',i:3},
{c:'read',t:'One screenshot that shows life growing',d:'`site/img/` holds four screenshots and all four are Earth. The test of this entire backlog is a single image, or a short capture, where a player can see a biosphere spreading, a herd moving and a settlement growing at once. If that image cannot be made, the work is not done.',k:'PROVE',e:'M',i:3},

/* --------------------------------------------------------------- prove -- */
{c:'prove',t:'Commit the probe that found these numbers',g:'aliveassert',n:['liveprobe'],d:'Every measured claim in this document — zero years in 300 ticks, 38% biomass decline, zero deaths in 1.7 Gyr, one settler, 4 sprite kinds, 200 food-web links at the cap — came from a twenty-line script. Commit it, run it in the suite, and print the numbers so a regression is a diff rather than a discovery.',k:'PROVE',e:'S',i:3},
{c:'prove',t:'The metrics that must move',g:'livemetric',n:['aliveassert'],d:'Partial. `vr/sim/livemetric.js` + `livingLine` on thrive headless runs. Baselines and catalogue fleet run still open.',k:'PROVE',e:'M',i:3},
{c:'prove',t:'A budget per metric, and a direction',n:['livemetric'],d:'Each of the eleven gets a target range and a direction of travel. A metric with no target is a number in a log; a metric with a target is a test. This is the loop the realism pass warned about and the open-world pass restated.',k:'PROVE',e:'M',i:3},
{c:'prove',t:'One assertion about a being, then twenty',n:['entsim'],d:'One of 542 assertions currently mentions an agent, a city or a behaviour. The first twenty are enumerated across this backlog — a kill, a birth, a death with a cause, a flock converging, a front advancing, a town crossing a stage, a policy diverging on two worlds — and each is a handful of lines.',k:'PROVE',e:'M',i:3},
{c:'prove',t:'A worked biosphere, end to end',n:['livemetric'],d:'The life pass has worked lineages as fixtures. The equivalent here is a full run committed as a fixture: seed, ruleset, tick count, and the expected population, tree, groups and settlements at the end. It is the only test that catches an interaction between two systems.',k:'PROVE',e:'M',i:3},
{c:'prove',t:'Two worlds should not be the same world',n:['livemetric'],d:'Run the same tick count on ten seeds and assert the biosphere metrics have a stated spread. A model that produces the same numbers everywhere is not reading the planet, and the world-space pass found exactly this failure at a much larger scale.',k:'PROVE',e:'M',i:3},
{c:'prove',t:'The fleet run, for biospheres',n:['livemetric'],d:'The open-world pass asks for 120 worlds through a render harness. The biosphere version runs the same catalogue headlessly and reports which worlds are alive, which are dead, which are identical and which are absurd. Cheap, because it needs no pixels.',k:'PROVE',e:'M',i:3},
{c:'prove',t:'Catch the dead planet that should be alive',n:['livemetric'],d:'And the alive one that should be dead. A Europa with a surface biosphere or a Titan with an Earth food web is the biological equivalent of forty bodies rendering as Io, and nothing currently looks.',k:'PROVE',e:'M',i:3},
{c:'prove',t:'Assert the biosphere does not decline by default',d:'The measured 38% fall in `meanLife` over 300 ticks on the default world is the single most important number in this document. Assert a non-declining biosphere on modern Earth under no forcing, and the whole product gets a floor.',k:'PROVE',e:'S',i:3},
{c:'prove',t:'Assert time advances',n:['unpin'],d:'Three hundred ticks, zero years. One assertion — `ageYr` increases at every speed stop — would have caught it, and it is the reason nothing in this backlog can be verified today.',k:'PROVE',e:'S',i:3},
{c:'prove',t:'Assert the visible layer matches the modelled one',n:['entsim'],d:'Measured: 49 living lineages, 4 distinct sprite kinds. Assert that the number of distinct visible forms tracks the number of living lineages up to a stated cap, and that the cap is a stated design decision rather than an atlas size.',k:'PROVE',e:'M',i:3},
{c:'prove',t:'Assert reef is not the majority',d:'Measured: 196 of 326 beings on modern Earth were the reef sprite. Assert the kind distribution against the actual biome distribution, because the first-match ordering in `kindForCell` is producing a picture of Earth that is 60% coral.',k:'PROVE',e:'S',i:3},
{c:'prove',t:'A determinism test for behaviour',n:['entsim'],d:'Same seed, same tick count, identical population state. `rngOf` gives behaviour its own stream, so this should already hold once beings are inside the tick — and it will not hold while they are on the render loop.',k:'PROVE',e:'S',i:3},
{c:'prove',t:'A save round-trip for the population',n:['entsave'],d:'Landed. Save v8 round-trip in `test.mjs`: ids, cells, ages, clock, cities.',k:'PROVE',e:'M',i:3},
{c:'prove',t:'A generate-reset test for the living layer',n:['entsim'],d:'Landed. Beings block asserts `generate` resets population and pinned vs thrive clock behaviour.',k:'PROVE',e:'S',i:3},
{c:'prove',t:'Assert the food web is not truncated silently',d:'Measured `links.length === 200`, exactly the slice bound. Assert the count and log how many were dropped, because a silently cut web reads as a complete one.',k:'PROVE',e:'S',i:3},
{c:'prove',t:'Compare against a real ecosystem, once',d:'The Serengeti, a kelp forest, a hydrothermal vent community: published biomass by trophic level. One comparison, honestly reported, tells you whether the trophic model is within an order of magnitude — and this repo has a strong record of that kind of check.',k:'PROVE',e:'M',i:3},
{c:'prove',t:'Population cycles, against the published ones',d:'The lynx–hare cycle is the most-reproduced dataset in ecology. If the predator–prey model produces a cycle, its period and amplitude can be compared to it — and if it produces none, that is the finding.',k:'PROVE',e:'M',i:2},
{c:'prove',t:'A scenario that demonstrates each claim',d:'One scenario per category: watch a front cross a continent, watch a cascade after a cull, watch a herd migrate, watch a town become a city, watch a policy evolve. A claim with a scenario attached is a claim somebody can check in a minute.',k:'PLAY',e:'M',i:3},
{c:'prove',t:'Print the scoreboard on every run',n:['livemetric'],d:'Partial. Thrive headless runs append `livingLine`; probe prints full census.',k:'PROVE',e:'S',i:3},
];

const D = [...P1, ...P2, ...P3, ...P4, ...P5, ...P6];

/* ------------------------------------------------------------- derive -- */
D.forEach((x, i) => { x.id = i + 1; });

const byCat = (id) => D.filter((x) => x.c === id);
const count = (f) => D.filter(f).length;
const KIND = { MODEL: 'Model', SHOW: 'Show', PLAY: 'Play', PROVE: 'Prove' };
const md = (t) => String(t).replace(/\|/g, '\\|');

const provides = new Map();
for (const x of D) if (x.g) provides.set(x.g, x);
const dependents = (tok) => D.filter((y) => (y.n || []).includes(tok)).length;
const CRITICAL = [...provides.keys()]
  .map((k) => ({ k, x: provides.get(k), n: dependents(k) }))
  .filter((r) => r.n > 0)
  .sort((a, b) => b.n - a.n);

const FOUND = [
  ['Three hundred ticks advance the clock by zero years',
   'Measured on `terra` without `deepTime` — the world the app opens with. `advanceClock` clamps `ageYr` to `PRESENT_YR` and then returns `dtYr = 10`, so `W.ageYr` is identical after 300 `simTick` calls. Over those same 300 ticks `meanLife` falls from **0.1463 to 0.0911**, a 38% decline with no forcing applied, and `W.tree.living` stays at 4 — the four lineages `seedHoloceneTree` planted at generate. Nothing can grow before your eyes on the default world because time is not passing and the only trend is downward.'],
  ['The visible life is not in the simulation',
   '`agentsTick()` is called from the render loop at `vr/main.js:1248`, not from `simTick`. So every being on the globe is outside the simulation: absent from `runHeadless`, absent from `serializeRun` — a save restores the phylogeny and every genome and not one individual — and absent from the test suite, where **1** of 542 `ok(` calls mentions an agent, a city or a behaviour. The layer the player watches is the only layer nothing checks, and its step count depends on frame rate.'],
  ['Nothing is born and nothing dies',
   'Measured over 300 deep-time ticks — 1.745 Gyr — with agents running: `ENT.n` goes 252 → 489, `dead` is **0**, and `maxAge` is **300**, meaning every being alive at the end had been alive since the first tick. The 237 new beings were not born; `topUpEntities` wrote them into free slots by sampling `life[c]`. Population is a rendering of a scalar field, so it cannot boom, crash, bottleneck, disperse or recover.'],
  ['Nothing hunts anything, and nothing flocks',
   '`updateFoodWeb` is real work and it is entirely lineage-level: `a.diet` is three lineage ids and Lotka–Volterra runs on `n.censusPop`, **one number per lineage for the whole planet**, so predation has no location, no chase, no kill and no carcass. Grep `vr/` for `flock`, `territory`, `hunger`, `breed`, `offspring`, `colony` or `pheromone`: zero hits between them. `hunt` appears four times and every one is interface copy about a camera.'],
  ['An ecosystem is four scalars',
   '`W.trophic` is `{prod, herb, carn, decomp}` computed as `nppMean` times 1, 0.1, 0.01 and 0.3, and `W.herbivore` and `W.carnivore` follow from it. So the herbivore load on a rainforest cell equals the herbivore load on an ice cell. `guildDens` in `redox.js` is a genuine per-cell guild field for metabolisms; nothing equivalent exists anywhere above the microbial layer.'],
  ['Three hundred ticks, one settler, zero towns',
   'Measured on modern Earth with agents running for 300 ticks: 326 beings alive, **1** of kind 5, `meanBuild` 0.00000, `W.cities` empty. `kindForCell` gives a settler a `0.03 + build × 0.2` chance on `earthLike` and `agentsTick` multiplies the build rate by 0.12 there — two undocumented throttles on the same loop. On the same run **196 of 326 beings, 60%, were the reef sprite**.'],
  ['Forty-nine lineages, four visible forms',
   'Measured on the 1.7 Gyr run: `W.tree.living.length` is 49 and the beings on screen span **4 distinct sprite kinds** — canopy, grass, sparse plant, reef. `morphTileOf` stamps expressed plans into a 20-slot atlas with 16 hand-drawn fallbacks. The modelled diversity is an order of magnitude past what the picture can show, and the cap is in the atlas rather than in the model.'],
  ['Gaia is four if-statements',
   '`gaiaPolicyTick` in `god/observe.js` is the whole autopilot: too cold raise solar, too hot lower it, CO₂ low inject, CO₂ high draw down. Four thresholds on two globals, writing `W.solar` and `W.gases.CO2` directly rather than through the fifteen modules of god verbs. Meanwhile `gaiaTick` computes resilience, seven tipping elements with hysteresis, rate stress, feedback gain and a Medea score — a rich state vector that no controller reads. A second controller, `thermostatTick`, can pin temperature by cheating solar at the same time.'],
  ['The planet does not notice you',
   '`notice.js` is civilisation: awareness from `interventionLog`, worship styles, a prayer queue. It returns early unless `meanBuild` is high, so a Precambrian world cannot notice a god at all. `playStyle` and `restraintStats` already classify the player; `forecastAct` already predicts a tool; Gaia reads none of them. A sentient planet that cannot tell a brush stroke from weather is not looking.'],
  ['Seventy-two overlays and not one is behaviour',
   'The overlay table runs from temperature through vorticity, ENSO, sea state, crust age and the technosphere. Its four biosphere entries — `npp`, `guild`, `diversity`, `range` — are all state. None of the 72 shows a rate, a flow, a movement or an interaction. Storms move on that globe; life does not. Tipping proximity, predation pressure and colonisation fronts are not in the table.'],
  ['The food web is being truncated in every long run',
   'Measured: after 300 deep-time ticks `W.foodWeb.links.length` is exactly **200**, the value of `links.slice(0, 200)`. Nothing sorts by flux before cutting and nothing reports how many were dropped, so a truncated web reads as a complete one.'],
  ['Tipping elements that cannot tip',
   '`TIPPING` lists seven organs. `W._amoc` is written `W.conveyor ?? W._amoc ?? 0.7` and never diagnosed; `_monsoon` is a constant 0.5; amazon reads a global forest fraction; coral reads `meanTemp`. Six of seven are geography and none of that geography is connected. A vital-sign list that cannot trip is a lie a planetary mind would be built on.'],
];

const NOW = [
  ['The biology under all of this is good, and it is not connected to anything that moves',
   'The life pass shipped a genome that is data, 1.6 × 10²⁸ distinguishable bodies, Eigen thresholds, Kleiber densities, chirality gating trophic transfer, twelve morphological incompatibility rules with costs, and `sensory.js` deciding band by band what a world delivers to an eye. That is a serious model. What reads it at runtime is `agentsTick`, which uses `plan.stride` and a sprite index. The gap this backlog addresses is not the biology — it is everything between the biology and the screen.'],
  ['The two-level architecture exists by accident',
   'Fields carry biomass and beings are sampled from them; beings then write back into `build[c]` and `h[c]`. Neither direction is designed, `topUpEntities` invents individuals from a scalar, and `node.pop` counts cells while `node.censusPop` integrates a differential equation, so the tree and the visible population can disagree with nothing noticing. Writing the contract down is the cheapest high-value item in this document.'],
  ['The performance answer is already in the repo',
   '`rebuildBuckets` builds a per-cell linked list of beings every tick — the right spatial index for this grid. `gpgpu/` runs the climate in shaders with a CPU fallback. `worker.js` exists. A 78-weight policy at 1400 beings is 109,000 multiply-adds, under a tenth of a millisecond. Nothing in this backlog is blocked on speed; the constraint is the stated 12 ms tick budget, and most of the value here is arithmetic.'],
  ['Agentic AI here means an evolved policy, not a language model in a tick',
   'The honest design is a small drive vector per being, perception gated on `sensory.js`, actions scored from an authored table, and the weights that do the scoring carried in the genome — so behaviour is selected by the same process that already shapes bodies. A generative model belongs at authoring time, compiled to frozen data through the pattern `lifegrammar.mjs` proved, with a provenance tag and a review gate. Both halves are buildable and only one of them is novel.'],
  ['A planetary mind is the same architecture one level up',
   '`gaiaTick` is already a sensory stream. `W.tips`, `rateStress`, `medeaScore` and `disequilibrium` are already drives. The god layer is already fifteen modules of actuators on a budget with receipts. `gaiaPolicyTick` ignores all of that and writes two globals; `thermostatTick` can cheat a third. Sentience here is not a new soul — it is wiring those parts, labelling the mode so Daisyworld stays a proof, and letting the planet notice the hand the way `notice.js` already lets a civilisation notice.'],
  ['The measurement discipline works, and it has never been pointed here',
   'Five hundred and forty-two assertions cover Eigen, Kleiber, chirality, genome round-trips and a 24-tick biosphere that must not collapse. One mentions a being. Every measured fact in the audit above was found in an afternoon with a twenty-line probe, which is simultaneously the strongest argument for committing the probe and the reason the zero-city and zero-death results survived this long.'],
];

const SEQ = [
  ['Commit the probe, then assert time advances',
   '`liveprobe`, `aliveassert`. The numbers in this document took twenty lines. Commit them and add the one assertion that would have caught the headline: `ageYr` increases at every speed stop.'],
  ['Move beings inside the tick',
   '`entsim`. One call moved from the render loop into `simTick`. It puts the visible layer into headless runs, into saves and into tests, and roughly a third of this backlog is blocked on it.'],
  ['Unpin the clock and give life its own rate',
   '`unpin`, `biotime`, `livespeed`. A world that can advance, a biology clock separate from the geology clock, and sub-stepping so the cheap systems run often. Without this nothing else here is observable.'],
  ['Give a being an inside',
   '`energy`, `drivevec`, `percept`. Energy, a handful of drives, and perception gated on what the animal can sense. `pickBehav` and its five strings are deleted at the end of it.'],
  ['Then birth and death',
   '`birth`, `death`, `popbook`. Counted individuals, causes of death, and an accounting identity that can be asserted every tick. This is the item that turns a rendering into a population.'],
  ['Then hunting, where it happens',
   '`hunt`, `preyfield`, `carcass`. A predator, a prey on a cell, a pursuit that can fail, an energy transfer, a carcass, and a predation-pressure field. Local grazing lands here too.'],
  ['Then groups, with a heading',
   '`flock`, `group`. The alignment term that is missing, and a group record with an identity so it can be named, followed, drawn as a mass and sent on a migration.'],
  ['Then the trophic field',
   '`guildfield`. Four per-cell stocks instead of three multiplications of a global mean, guilds above the microbial layer, mutualism, and decomposition that closes the nutrient loop.'],
  ['Then the front',
   '`front`, `disperse`. A colonisation edge with a shape and a speed, dispersal with a distance, barriers and corridors from terrain that already exists. This is the picture the phrase *life growing before your eyes* describes.'],
  ['Then show it, on both surfaces',
   '`tileact`, `behovl`, `globeswarm`. Behaviour drawn in the grid of squares, rates and movement on the globe. Twenty categories of model are worth nothing if the two views still show state.'],
  ['Then settlements that grow',
   '`citysim`, `hinterland`, `roads`, `trade`. Unthrottle the loop, give a town a persistent identity, feed it from a catchment, connect it, and let it fail with a stated cause.'],
  ['Then the policy, and let selection have it',
   '`utility`, `actiontable`, `behgenome`. Scored actions from an authored table, weights in the genome, temperament that speciates with the body. The generative model authors the tables offline and never runs in a tick.'],
  ['Then learning and culture, the two fast loops',
   '`lifelearn`, `culture`. An individual that changes because of what happened to it, and a behaviour that passes between individuals without a genome. Both are visible in seconds rather than eons.'],
  ['Then give the planet a drive',
   '`planetclaim`, `gaiapolicy`, `pdrive`. Name the three modes so Daisyworld stays a proof, replace the four if-statements with the same drive architecture beings get, and act through the player\'s verbs on the player\'s budget.'],
  ['Then a metabolism you can see, and organs that can fail',
   '`metab`, `homeo`, `tipgeo`, `gaiaface`. Carbon breathing on the disc, Walker and ice-albedo that are physics rather than clamps, tipping elements as places, three analog gauges. A mind with fake vital signs is a cartoon.'],
  ['Then the planet notices the hand, and can fight',
   '`planetsee`, `immune`, `planetmood`. Awareness without cities, an immune stance from `playStyle`, wounds with clocks, a mood that is a projection of numbers. Fiction switch on for a voice; silence the default.'],
  ['Then minds that are not Earth\'s',
   '`alienmind`. Gate Gaia on air, water and a biosphere; give Titan a haze, Europa a seam, Venus a failure, Mars a scar; measure the Gaian bottleneck across the catalogue.'],
  ['Then measure all of it, on every world',
   '`livemetric`. Eleven numbers, committed as baselines, with a direction of travel, run headlessly across the catalogue. And one screenshot in which a biosphere is spreading, a herd is moving and a settlement is growing at the same time — and a second in which a planet answers a pulse with ice and green, no HUD — which is the only real test of whether any of this worked.'],
];

/* ------------------------------------------------------------ markdown -- */
function markdown() {
  const L = [];
  L.push('# ORRERY — thrive');
  L.push('');
  L.push(`**${D.length} items.** Generated from \`scripts/thrive.mjs\` — edit that file, not this one, then run \`node scripts/thrive.mjs\`.`);
  L.push('');
  L.push('Life that grows, flourishes and moves into the next thing while you watch it: ecosystems, hunting, swarms, colonisation fronts, settlements that become cities, the in-app drive model that decides how any of it behaves — and the planet itself as something that can regulate, fight, notice, and (when labelled) think.');
  L.push('');
  L.push('The measurement this pass starts from, all of it from a twenty-line probe against the shipped code: on the world the app opens with, **300 ticks advance the clock by zero years** and `meanLife` falls 38%. On a 1.7 Gyr deep-time run, **zero beings die**, every survivor is at maximum age, and 49 living lineages are drawn with **4 sprite kinds**. On modern Earth, 300 ticks produce **one settler and no towns**, and 60% of visible life is the reef sprite. `agentsTick` runs in the render loop, so none of the above is in the headless runner, the save file or the test suite — where **1** of 542 assertions mentions a being. Above that layer, `gaiaPolicyTick` is four if-statements on two globals while `gaiaTick` computes a state vector no controller reads, and tipping elements that cannot tip.');
  L.push('');
  L.push(`Kind: **${count((x) => x.k === 'MODEL')}** model, **${count((x) => x.k === 'SHOW')}** picture, **${count((x) => x.k === 'PLAY')}** verbs, **${count((x) => x.k === 'PROVE')}** measurement and proof. Effort is S/M/L. Impact is 1–3.`);
  L.push('');

  L.push('## What the audit found');
  L.push('');
  for (const [a, b] of FOUND) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## Where the living layer actually is');
  L.push('');
  for (const [a, b] of NOW) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## The critical path');
  L.push('');
  L.push('The capabilities the largest number of other items are waiting on.');
  L.push('');
  L.push('| Capability | Item | Unblocks |');
  L.push('|---|---|---|');
  for (const r of CRITICAL.slice(0, 20)) {
    L.push(`| \`${r.k}\` | ${r.x.id}. ${md(r.x.t)} | ${r.n} items |`);
  }
  L.push('');

  for (const [id, name, blurb] of CATS) {
    const items = byCat(id);
    L.push(`## ${name}`);
    L.push('');
    L.push(blurb);
    L.push('');
    L.push('| # | Item | What and why | Kind | E | I |');
    L.push('|---|---|---|---|---|---|');
    for (const x of items) {
      const gives = x.g ? ` <br>gives \`${x.g}\`` : '';
      const needs = x.n?.length ? ` <br>needs ${x.n.map((t) => '`' + t + '`').join(' ')}` : '';
      L.push(`| ${x.id} | **${md(x.t)}**${gives}${needs} | ${md(x.d)} | ${KIND[x.k]} | ${x.e} | ${x.i} |`);
    }
    L.push('');
  }

  L.push('## Sequencing');
  L.push('');
  SEQ.forEach(([a, b], i) => L.push(`${i + 1}. **${a}.** ${b}`));
  L.push('');
  L.push('The through-line: this product has a genuinely good biosphere model and a visible layer that is not connected to it. The genome spans 1.6 × 10²⁸ bodies and `agentsTick` reads two fields off it. The food web computes chirality-gated trophic links and applies them to one number per lineage for the whole planet. `sensory.js` integrates Planck spectra against atmospheric transmission and nothing that acts asks it anything. Closing that gap is most of this backlog, and almost none of it is hard — it is arithmetic that nobody has written because the layer it belongs to was never in the simulation.');
  L.push('');
  L.push('The one thing that must go first is time. Three hundred ticks and zero years is not a tuning problem; it means the default experience of this product is a still picture of a declining biosphere. Unpin the clock, give life its own rate, sub-step the cheap systems, and every item below becomes something a player can actually watch happen.');
  L.push('');
  L.push('And the agentic part is smaller than it sounds. A drive vector, an authored action table, and the weights that score them carried in the genome gets you life that behaves, adapts and diverges — selected by the same process that already shapes bodies, deterministic, offline, and under a tenth of a millisecond for the whole population. A generative model is genuinely useful here, at authoring time, compiled to frozen data with a provenance tag and a review gate, exactly as `lifegrammar.mjs` already does for the life grammar. Those two sentences are the design for beings; the rest is doing it and measuring it.');
  L.push('');
  L.push('The planetary mind is the same design one level up. `gaiaTick` is the sensory stream, the tips and the rates are the drives, the god verbs are the actuators, the energy budget is the metabolic cost of thought. Wire them, label the mode so Daisyworld stays a proof and a talking Earth stays a fiction you opted into, paint the metabolism and the organs on the disc, and let the planet notice the hand. Watson and Lovelock never claimed a mind; this product should not either unless the switch is on. Silence is the default across a hundred and twenty worlds. Speech is rare. That rarity is the claim.');
  L.push('');

  return L.join('\n');
}

/* ----------------------------------------------------------------- html -- */
function html() {
  const data = JSON.stringify(D.map((x) => ({
    id: x.id, c: x.c, t: x.t, d: x.d, k: x.k, e: x.e, i: x.i, g: x.g || '', n: x.n || [],
  })));
  const cats = JSON.stringify(CATS.map(([id, name, blurb]) => ({ id, name, blurb })));
  const crit = JSON.stringify(CRITICAL.slice(0, 20).map((r) => ({ k: r.k, id: r.x.id, t: r.x.t, n: r.n })));
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ORRERY — thrive</title>
<style>
:root{
  --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#c69a4f; --accent-soft:rgba(198,154,79,.13); --accent-line:rgba(198,154,79,.36);
  --make:#7fc8a9; --make-soft:rgba(127,200,169,.14);
  --hand:#7fb0e0; --hand-soft:rgba(127,176,224,.14);
  --play:#d59ad0; --play-soft:rgba(213,154,208,.14);
  --sans:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
}
@media (prefers-color-scheme: light){
  :root:not([data-theme="dark"]){ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
    --text:#12151c; --dim:#4e5768; --faint:#727d90;
    --accent:#8a6420; --accent-soft:rgba(138,100,32,.09); --accent-line:rgba(138,100,32,.32);
    --make:#22705a; --make-soft:rgba(34,112,90,.09); --hand:#215e93; --hand-soft:rgba(33,94,147,.09);
    --play:#8a3f83; --play-soft:rgba(138,63,131,.09); }
}
:root[data-theme="dark"]{ --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#c69a4f; --accent-soft:rgba(198,154,79,.13); --accent-line:rgba(198,154,79,.36);
  --make:#7fc8a9; --make-soft:rgba(127,200,169,.14); --hand:#7fb0e0; --hand-soft:rgba(127,176,224,.14);
  --play:#d59ad0; --play-soft:rgba(213,154,208,.14); }
:root[data-theme="light"]{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
  --text:#12151c; --dim:#4e5768; --faint:#727d90;
  --accent:#8a6420; --accent-soft:rgba(138,100,32,.09); --accent-line:rgba(138,100,32,.32);
  --make:#22705a; --make-soft:rgba(34,112,90,.09); --hand:#215e93; --hand-soft:rgba(33,94,147,.09);
  --play:#8a3f83; --play-soft:rgba(138,63,131,.09); }

*{box-sizing:border-box;}
body{margin:0; background:var(--ground); color:var(--text);
     font:400 16px/1.6 var(--sans); -webkit-font-smoothing:antialiased;}
.wrap{max-width:1080px; margin:0 auto; padding:40px 26px 110px;}

header{border-bottom:1px solid var(--rule); padding-bottom:28px;}
.eyebrow{font:500 10.5px/1 var(--mono); letter-spacing:.24em; text-transform:uppercase; color:var(--accent);}
h1{font:700 clamp(34px,5.4vw,54px)/1.03 var(--sans); letter-spacing:-.035em; margin:15px 0 0; text-wrap:balance;}
.sub{font:italic 400 clamp(17px,2.2vw,21px)/1.45 var(--serif); color:var(--dim);
     margin:18px 0 0; max-width:50ch;}
.nav{margin-top:20px; font:400 12.5px/1.7 var(--mono); color:var(--faint);}
.nav a{color:var(--dim); text-decoration:none; border-bottom:1px solid var(--rule);}
.nav a:hover{color:var(--accent); border-color:var(--accent-line);}

.tally{display:grid; grid-template-columns:repeat(auto-fit,minmax(126px,1fr)); gap:1px;
       background:var(--rule); border:1px solid var(--rule); border-radius:8px;
       overflow:hidden; margin-top:26px;}
.tally > div{background:var(--panel); padding:13px 15px;}
.tally dt{font:500 9.5px/1 var(--mono); letter-spacing:.15em; text-transform:uppercase; color:var(--faint);}
.tally dd{margin:9px 0 0; font:600 26px/1 var(--sans); letter-spacing:-.02em;
          font-variant-numeric:tabular-nums;}
.tally dd small{display:block; font:400 11px/1.5 var(--mono); color:var(--faint); margin-top:6px; letter-spacing:0;}

.prose{margin-top:40px;}
.prose h2{font:650 21px/1.2 var(--sans); letter-spacing:-.022em; margin:0 0 12px;
          border-bottom:1px solid var(--rule); padding-bottom:10px;}
.prose p{color:var(--dim); max-width:74ch; font-size:14.5px;}
.state{list-style:none; margin:14px 0 0; padding:0; display:flex; flex-direction:column; gap:1px;
       background:var(--rule); border:1px solid var(--rule); border-radius:8px; overflow:hidden;}
.state li{background:var(--panel); padding:13px 16px; color:var(--dim); font-size:13.5px; line-height:1.6;}
.state b{color:var(--text); font-weight:600;}
.critwrap{overflow-x:auto;}
.crit{width:100%; border-collapse:collapse; margin-top:14px; font-size:13.5px;}
.crit td{border-top:1px solid var(--rule); padding:9px 12px; color:var(--dim);}
.crit td:first-child{font:500 11.5px/1.6 var(--mono); color:var(--accent); width:1%; white-space:nowrap;}
.crit td:last-child{text-align:right; font:500 11.5px/1.6 var(--mono); color:var(--faint); white-space:nowrap;}
.seq{margin:14px 0 0; padding-left:20px; color:var(--dim); font-size:14px;}
.seq li{margin-bottom:9px; max-width:74ch;}
.seq b{color:var(--text);}
code{font:500 12.5px/1 var(--mono); background:var(--panel2); border:1px solid var(--rule);
     padding:2px 5px; border-radius:4px; color:var(--accent);}

.controls{position:sticky; top:0; z-index:5; background:var(--ground);
          padding:18px 0 14px; border-bottom:1px solid var(--rule); margin:44px 0 6px;}
.filters{display:flex; flex-wrap:wrap; gap:7px; align-items:center;}
.flabel{font:500 9.5px/1 var(--mono); letter-spacing:.17em; text-transform:uppercase;
        color:var(--faint); margin-right:3px;}
button.f{font:500 11.5px/1 var(--mono); color:var(--dim); cursor:pointer; background:transparent;
         border:1px solid var(--rule); border-radius:5px; padding:7px 10px;}
button.f:hover{border-color:var(--accent-line); color:var(--text);}
button.f[aria-pressed="true"]{background:var(--accent-soft); border-color:var(--accent-line); color:var(--accent);}
button.f.make[aria-pressed="true"]{background:var(--make-soft); border-color:var(--make); color:var(--make);}
button.f.hand[aria-pressed="true"]{background:var(--hand-soft); border-color:var(--hand); color:var(--hand);}
button.f.doit[aria-pressed="true"]{background:var(--play-soft); border-color:var(--play); color:var(--play);}
#q{flex:1; min-width:170px; font:400 13px/1 var(--sans); color:var(--text);
   background:var(--panel); border:1px solid var(--rule); border-radius:5px; padding:8px 11px;}
#q::placeholder{color:var(--faint);}
.tally2{margin-top:11px; font:500 11px/1 var(--mono); color:var(--faint); font-variant-numeric:tabular-nums;}

section{padding-top:38px; scroll-margin-top:120px;}
.sechead{display:flex; align-items:baseline; gap:12px; flex-wrap:wrap;
         border-bottom:1px solid var(--rule); padding-bottom:10px;}
.sechead h2{font:650 21px/1.2 var(--sans); letter-spacing:-.022em; margin:0;}
.sechead .n{font:500 10.5px/1 var(--mono); color:var(--accent); background:var(--accent-soft);
            border:1px solid var(--accent-line); padding:4px 7px; border-radius:4px;}
.blurb{margin:13px 0 0; color:var(--dim); max-width:74ch; font-size:14.5px;}

ol{list-style:none; margin:16px 0 0; padding:0; display:flex; flex-direction:column; gap:1px;
   background:var(--rule); border:1px solid var(--rule); border-radius:8px; overflow:hidden;}
li.item{background:var(--panel); padding:13px 16px; display:grid;
   grid-template-columns:38px minmax(0,1fr) auto; gap:4px 14px; align-items:baseline;}
li .id{font:500 11px/1.5 var(--mono); color:var(--faint); font-variant-numeric:tabular-nums;}
li .t{font:600 14.5px/1.4 var(--sans); letter-spacing:-.008em;}
li .d{grid-column:2; color:var(--dim); font-size:13.5px; line-height:1.55; max-width:76ch;}
li .dep{grid-column:2; font:400 11px/1.6 var(--mono); color:var(--faint); margin-top:4px;}
li .dep .gives{color:var(--accent);}
li .tags{display:flex; gap:5px; align-items:center; grid-row:1; grid-column:3;}
.tag{font:600 9px/1 var(--mono); letter-spacing:.1em; text-transform:uppercase;
     padding:4px 6px; border-radius:3px; white-space:nowrap; border:1px solid transparent;}
.tag.make{background:var(--make-soft); color:var(--make); border-color:var(--make);}
.tag.hand{background:var(--hand-soft); color:var(--hand); border-color:var(--hand);}
.tag.doit{background:var(--play-soft); color:var(--play); border-color:var(--play);}
.tag.pick{background:transparent; color:var(--dim); border-color:var(--rule);}
.tag.e{background:transparent; color:var(--faint); border-color:var(--rule);}
.dots{display:inline-flex; gap:2px;}
.dots i{width:5px; height:5px; border-radius:50%; background:var(--rule); display:block;}
.dots i.on{background:var(--accent);}
.empty{padding:44px 16px; text-align:center; color:var(--faint); font:400 13.5px/1.6 var(--mono);}
:focus-visible{outline:2px solid var(--accent); outline-offset:2px; border-radius:4px;}
footer{margin-top:64px; padding-top:22px; border-top:1px solid var(--rule);
       font:400 12px/1.7 var(--mono); color:var(--faint);}
@media (max-width:640px){
  li.item{grid-template-columns:30px minmax(0,1fr);}
  li .tags{grid-row:auto; grid-column:2; margin-top:7px;}
}
@media (prefers-reduced-motion: reduce){ *{transition:none !important;} }
</style>
<link rel="stylesheet" href="doc-responsive.css">

<div class="wrap">
<header>
  <div class="eyebrow">Deep dive · life that grows, and a planet that can think</div>
  <h1>Thrive</h1>
  <p class="sub">Ecosystems, hunting, swarms, colonisation fronts, settlements that become
  cities, the in-app drive model — and the planet itself as something that can regulate,
  fight, notice, and (when labelled) think. Measured first: on the world the app opens
  with, 300 ticks advance the clock by zero years and the biosphere shrinks 38%.</p>
  <p class="nav"><a href="./">Pitch</a> · <a href="backlog.html">Systems</a> ·
  <a href="worlds.html">Worlds</a> · <a href="evolution.html">Evolution</a> ·
  <a href="godgame.html">God layer</a> · <a href="next.html">Next 200</a> ·
  <a href="tides-weather.html">Tides &amp; weather</a> · <a href="geology.html">Geology</a> ·
  <a href="exoparams.html">Real parameters</a> · <a href="living.html">Alive</a> ·
  <a href="currents.html">Currents</a> · <a href="realism.html">Realism</a> ·
  <a href="landscape.html">Landscape</a> · <a href="life.html">Life</a> ·
  <a href="surface.html">Surface</a> · <a href="worldspace.html">World space</a> ·
  <a href="openworld.html">Open world</a> · <a href="../vr/">Prototype</a></p>
  <dl class="tally">
    <div><dt>Items</dt><dd>${D.length}<small>${CATS.length} categories</small></dd></div>
    <div><dt>Kind</dt><dd>${count((x) => x.k === 'MODEL')}/${count((x) => x.k === 'SHOW')}/${count((x) => x.k === 'PLAY')}/${count((x) => x.k === 'PROVE')}<small>model · show · play · prove</small></dd></div>
    <div><dt>Impact 3</dt><dd>${count((x) => x.i === 3)}<small>of ${D.length}</small></dd></div>
    <div><dt>Effort</dt><dd>${count((x) => x.e === 'S')}/${count((x) => x.e === 'M')}/${count((x) => x.e === 'L')}<small>S / M / L</small></dd></div>
  </dl>
</header>

<div class="prose">
  <h2>What the audit found</h2>
  <ul class="state" id="fixed"></ul>

  <h2 style="margin-top:40px">Where the living layer actually is</h2>
  <ul class="state" id="now"></ul>

  <h2 style="margin-top:40px">The critical path</h2>
  <p>The capabilities the largest number of other items wait on.</p>
  <div class="critwrap"><table class="crit"><tbody id="crit"></tbody></table></div>
</div>

<div class="controls">
  <div class="filters">
    <span class="flabel">Kind</span>
    <button class="f make" data-k="k" data-v="MODEL" aria-pressed="false">Model</button>
    <button class="f hand" data-k="k" data-v="SHOW" aria-pressed="false">Show</button>
    <button class="f doit" data-k="k" data-v="PLAY" aria-pressed="false">Play</button>
    <button class="f" data-k="k" data-v="PROVE" aria-pressed="false">Prove</button>
    <span class="flabel" style="margin-left:9px">Effort</span>
    <button class="f" data-k="e" data-v="S" aria-pressed="false">S</button>
    <button class="f" data-k="e" data-v="M" aria-pressed="false">M</button>
    <button class="f" data-k="e" data-v="L" aria-pressed="false">L</button>
    <span class="flabel" style="margin-left:9px">Impact</span>
    <button class="f" data-k="i" data-v="3" aria-pressed="false">3</button>
    <button class="f" data-k="i" data-v="2" aria-pressed="false">2</button>
    <button class="f" data-k="i" data-v="1" aria-pressed="false">1</button>
    <input id="q" type="search" placeholder="Search ${D.length} items…" aria-label="Search items">
  </div>
  <div class="tally2" id="shown"></div>
</div>

<div id="list"></div>

<div class="prose" style="margin-top:56px">
  <h2>Sequencing</h2>
  <ol class="seq" id="seq"></ol>
  <p style="margin-top:16px">The through-line: this product has a genuinely good biosphere
  model and a visible layer that is not connected to it. The genome spans 1.6&nbsp;×&nbsp;10²⁸
  bodies and <code>agentsTick</code> reads two fields off it. The food web computes
  chirality-gated trophic links and applies them to one number per lineage for the whole planet.
  <code>sensory.js</code> integrates Planck spectra against atmospheric transmission and nothing
  that acts asks it anything. Closing that gap is most of this backlog, and almost none of it is
  hard — it is arithmetic nobody has written, because the layer it belongs to was never in the
  simulation.</p>
  <p>The one thing that must go first is time. Three hundred ticks and zero years is not a tuning
  problem; it means the default experience of this product is a still picture of a declining
  biosphere. Unpin the clock, give life its own rate, sub-step the cheap systems, and every item
  below becomes something a player can actually watch happen.</p>
  <p>And the agentic part is smaller than it sounds. A drive vector, an authored action table, and
  the weights that score them carried in the genome gets you life that behaves, adapts and
  diverges — selected by the same process that already shapes bodies, deterministic, offline, and
  under a tenth of a millisecond for the whole population. A generative model is genuinely useful
  here, at authoring time, compiled to frozen data with a provenance tag and a review gate, exactly
  as <code>lifegrammar.mjs</code> already does for the life grammar. Those two sentences are the
  design for beings; the rest is doing it and measuring it.</p>
  <p>The planetary mind is the same design one level up. <code>gaiaTick</code> is the sensory
  stream, the tips and the rates are the drives, the god verbs are the actuators, the energy budget
  is the metabolic cost of thought. Wire them, label the mode so Daisyworld stays a proof and a
  talking Earth stays a fiction you opted into, paint the metabolism and the organs on the disc,
  and let the planet notice the hand. Watson and Lovelock never claimed a mind; this product should
  not either unless the switch is on. Silence is the default across a hundred and twenty worlds.
  Speech is rare. That rarity is the claim.</p>
</div>

<footer>
  Generated from <code>scripts/thrive.mjs</code> — edit the source and re-run, do not edit the output.
</footer>
</div>

<script>
"use strict";
var DATA = ${data};
var CATS = ${cats};
var CRIT = ${crit};
var NOW = ${JSON.stringify(NOW)};
var FIXED = ${JSON.stringify(FOUND)};
var SEQ = ${JSON.stringify(SEQ)};
var KLABEL = {MODEL:'Model', SHOW:'Show', PLAY:'Play', PROVE:'Prove'};
var active = {k:new Set(), e:new Set(), i:new Set()};
var query = '';
var listEl = document.getElementById('list');
var shownEl = document.getElementById('shown');

function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

document.getElementById('now').innerHTML = NOW.map(function(r){
  return '<li><b>' + esc(r[0]) + '.</b> ' + esc(r[1]) + '</li>'; }).join('');
document.getElementById('fixed').innerHTML = FIXED.map(function(r){
  return '<li><b>' + esc(r[0]) + '.</b> ' + esc(r[1]) + '</li>'; }).join('');
document.getElementById('crit').innerHTML = CRIT.map(function(r){
  return '<tr><td>' + esc(r.k) + '</td><td>' + r.id + '. ' + esc(r.t) +
         '</td><td>' + r.n + ' items</td></tr>'; }).join('');
document.getElementById('seq').innerHTML = SEQ.map(function(r){
  return '<li><b>' + esc(r[0]) + '.</b> ' + esc(r[1]) + '</li>'; }).join('');

function match(o){
  if (active.k.size && !active.k.has(o.k)) return false;
  if (active.e.size && !active.e.has(o.e)) return false;
  if (active.i.size && !active.i.has(String(o.i))) return false;
  if (query){
    var hay = (o.t + ' ' + o.d + ' ' + o.g + ' ' + o.n.join(' ')).toLowerCase();
    if (hay.indexOf(query) === -1) return false;
  }
  return true;
}

function dots(n){
  var out = '<span class="dots" title="Impact ' + n + ' of 3">';
  for (var k = 1; k <= 3; k++) out += '<i class="' + (k <= n ? 'on' : '') + '"></i>';
  return out + '</span>';
}

function render(){
  var html = '', total = 0;
  for (var ci = 0; ci < CATS.length; ci++){
    var cat = CATS[ci];
    var items = DATA.filter(function(o){ return o.c === cat.id && match(o); });
    if (!items.length) continue;
    total += items.length;
    html += '<section id="' + cat.id + '"><div class="sechead"><h2>' + esc(cat.name) +
            '</h2><span class="n">' + items.length + '</span></div>' +
            '<p class="blurb">' + esc(cat.blurb) + '</p><ol>';
    for (var k = 0; k < items.length; k++){
      var o = items[k];
      var cls = o.k === 'MODEL' ? 'make' : o.k === 'SHOW' ? 'hand' : o.k === 'PLAY' ? 'doit' : 'pick';
      var dep = '';
      if (o.g) dep += '<span class="gives">gives ' + esc(o.g) + '</span>';
      if (o.n.length) dep += (dep ? ' · ' : '') + 'needs ' + o.n.map(esc).join(' ');
      html += '<li class="item"><span class="id">' + o.id + '</span>' +
              '<span class="t">' + esc(o.t) + '</span>' +
              '<span class="tags"><span class="tag ' + cls + '">' + KLABEL[o.k] + '</span>' +
              '<span class="tag e">' + o.e + '</span>' + dots(o.i) + '</span>' +
              '<span class="d">' + esc(o.d) + '</span>' +
              (dep ? '<span class="dep">' + dep + '</span>' : '') + '</li>';
    }
    html += '</ol></section>';
  }
  if (!total) html = '<p class="empty">Nothing matches those filters.</p>';
  listEl.innerHTML = html;
  shownEl.textContent = 'Showing ' + total + ' of ' + DATA.length;
}

var btns = document.querySelectorAll('button.f');
for (var b = 0; b < btns.length; b++){
  btns[b].addEventListener('click', function(){
    var k = this.dataset.k, v = this.dataset.v;
    if (active[k].has(v)) { active[k].delete(v); this.setAttribute('aria-pressed','false'); }
    else { active[k].add(v); this.setAttribute('aria-pressed','true'); }
    render();
  });
}
document.getElementById('q').addEventListener('input', function(){
  query = this.value.trim().toLowerCase(); render();
});
render();
</script>
`;
}

/* ----------------------------------------------------------------- emit -- */
await mkdir(join(ROOT, 'briefs'), { recursive: true });
await mkdir(join(ROOT, 'site'), { recursive: true });
await writeFile(join(ROOT, 'briefs', 'thrive-backlog.md'), markdown() + '\n');
await writeFile(join(ROOT, 'site', 'thrive.html'), html());

console.log(`thrive: ${D.length} items across ${CATS.length} categories`);
for (const [id, name] of CATS) console.log(`  ${String(byCat(id).length).padStart(3)}  ${name}`);
console.log(`\nkind     model ${count((x) => x.k === 'MODEL')} · show ${count((x) => x.k === 'SHOW')} · play ${count((x) => x.k === 'PLAY')} · prove ${count((x) => x.k === 'PROVE')}`);
console.log(`effort   S ${count((x) => x.e === 'S')} · M ${count((x) => x.e === 'M')} · L ${count((x) => x.e === 'L')}`);
console.log(`impact   3 ${count((x) => x.i === 3)} · 2 ${count((x) => x.i === 2)} · 1 ${count((x) => x.i === 1)}`);
console.log('\ncritical path:');
for (const r of CRITICAL.slice(0, 20)) {
  console.log(`  ${String(r.n).padStart(3)}  ${r.k.padEnd(12)} ${r.x.t}`);
}
const unmet = new Set();
for (const x of D) for (const t of x.n || []) if (!provides.has(t)) unmet.add(t);
if (unmet.size) console.log(`\nWARNING unmet tokens: ${[...unmet].join(', ')}`);
const dup = new Map();
for (const x of D) dup.set(x.t, (dup.get(x.t) || 0) + 1);
const dupes = [...dup].filter(([, n]) => n > 1);
if (dupes.length) console.log(`\nWARNING duplicate titles: ${dupes.map(([t]) => t).join(' | ')}`);
const badCat = D.filter((x) => !CATS.some(([id]) => id === x.c));
if (badCat.length) console.log(`\nWARNING unknown categories: ${[...new Set(badCat.map((x) => x.c))].join(', ')}`);
const noG = CATS.filter(([id]) => !byCat(id).some((x) => x.g));
if (noG.length) console.log(`\nnote: categories with no capability token: ${noG.map(([, n]) => n).join(' | ')}`);
console.log('\nwrote briefs/thrive-backlog.md and site/thrive.html');
