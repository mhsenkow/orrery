#!/usr/bin/env node
// Single source of truth for the ORRERY god-game backlog.
// Emits  briefs/godgame-backlog.md  and  site/godgame.html  so the two cannot drift.
//
//   node scripts/godgame.mjs
//
// k:  HAND = the act of touching a world · SYS = what the simulation does back
//     PLAY = mode, goal, framing, meaning.
// e:  effort S/M/L.  i: impact 1..3.
// g:  capability token this item provides.  n: tokens it needs first.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = [
  ['hand', 'The hand: direct manipulation',
    'Every god act currently routes through one function — `paintBrush`, a cosine cutoff with linear falloff — and fires once per click. The verb grammar of touching a planet is where this product either feels like divinity or like a paint program with a space theme.'],
  ['land', 'Sculpting the land',
    'Raise and lower push the heightfield by ±0.06 and let erosion sort it out. But the geosphere underneath is now a real plate model with Euler poles, isostasy and crustal thickness — which means the sculpting tools are editing the output of a simulation that already knows better.'],
  ['clim', 'Climate levers',
    'Solar, tilt and spin are three scalars nudged by a fixed delta. The climate model behind them handles orbital forcing, aerosols, escape and a weathering thermostat. The levers should reach the causes rather than the symptoms.'],
  ['life', 'Seeding and gardening life',
    'The single most-requested god verb, and the one the recent biosphere work most changes. `seedLife` paints an 11.5° blotch of whatever class happens to be unlocked. There is now a trait vector, a phylogeny and a redox tower to seed *into*.'],
  ['gen', 'The genesis toolkit',
    'Before you press play, you are a different kind of god — the one who sets the constants. Currently that is a ruleset dropdown and a reseed button. This is the cheapest category to build and one of the most replayable.'],
  ['dis', 'Disasters, honestly',
    'The acquisition channel, and the category most likely to be built badly. WorldBox’s palette is the first impression; the difference here is that every disaster should be a parameterised physical event whose aftermath is the actual content.'],
  ['cons', 'Consequence and feedback',
    'The difference between a god game and a toy is whether the world argues. Right now an act logs one chronicle line and the effect diffuses away silently over the next hundred ticks.'],
  ['cost', 'The economy of miracles',
    'SimEarth charged you for interventions and that scarcity is what made it a game. `budgetMode` is off by default, costs are a hand-written integer per tool, and income is `0.5 + health * 1.5 + meanLife`.'],
  ['goal', 'Intent: scenarios and goals',
    'A sandbox with no proposition is a screensaver with buttons. Scenarios are also the only practical way to teach fifteen coupled systems to somebody who has not read the briefs.'],
  ['obs', 'Watching rather than acting',
    'Half of what this genre is actually for. The player who leaves it running and comes back in an hour is the one who will still be playing in a month, and almost nothing in the build serves them.'],
  ['civ', 'Civilisation and the moral layer',
    'Deliberately out of scope for the current slice, but this is where the god fantasy stops being about landscaping. The moment the things you made can notice you, every earlier system acquires a second meaning.'],
  ['vr', 'Scale and embodiment',
    'The stated thesis — hold a planet, shrink, walk in. XR today is grab-to-spin, squeeze-to-use-tool, throw-to-drop-a-meteor, and a thumbstick that scales the planet. That is a competent prototype of the gesture and not yet the experience.'],
  ['many', 'Many worlds and the orrery',
    'There are 120 real bodies in the catalogue and the app can hold exactly one at a time. The system view is where a catalogue becomes a collection and a collection becomes a reason to come back.'],
  ['legib', 'Legibility of your own power',
    'Instruments for the god specifically, as distinct from the science instruments already built. The question this category answers is: how much of what I am looking at is *me*?'],
  ['feel', 'Feel: audio, haptics, ceremony',
    'Godhood is a feeling before it is a mechanic. `audio.js` is 100 lines of oscillator blips and it is currently the whole of it.'],
];

const D = [
/* --------------------------------------------------------------- hand -- */
{c:'hand',t:'A brush with a real profile',g:'brush',d:'`paintBrush(cell, fn, radius)` takes a cosine threshold and hands the callback a linear falloff. Give it an editable profile curve, a rate applied per frame rather than per click, a hardness, and a preview ring drawn on the terrain before you commit. Every tool below inherits whatever this becomes, so it is worth over-building.',k:'HAND',e:'M',i:3},
{c:'hand',t:'Brush size that means something at each tier',n:['brush'],d:'`radius * 0.04` radians is a continent from orbit and invisible from the ground. Bind brush extent to real surface distance and show it in kilometres, so the same gesture is a mountain range at one scale and a hillside at another — and the player learns the planet’s size by working on it.',k:'HAND',e:'S',i:3},
{c:'hand',t:'Two-handed gestures as the core grammar',g:'twohand',d:'One hand holds the world, the other acts on it. Pull apart to rift, push together to collide, twist to shear, cup to gather. Almost every geological verb is naturally bimanual, and the current one-hand-spins-one-hand-shoots split wastes the headset’s best affordance.',k:'HAND',e:'L',i:3},
{c:'hand',t:'Continuous drag verbs, not click-once',n:['brush'],d:'`useToolAt` fires a discrete event per press. Sculpting wants a held gesture that accumulates while you drag — carving a valley in one stroke, dragging a coastline out, smearing ice across a pole. It is the difference between stamping and drawing.',k:'HAND',e:'M',i:3},
{c:'hand',t:'Undo the act, not the years',d:'A god can take back a gesture; nobody can take back the four hundred thousand years that passed while the consequences propagated. Offer an undo that reverts the direct edit and explicitly does not rewind the simulation, and the asymmetry teaches the game’s whole thesis in one interaction.',k:'HAND',e:'M',i:3},
{c:'hand',t:'A commit gesture for irreversible acts',d:'The planet buster currently guards itself with `window.confirm()`. Irreversible acts deserve a physical commitment — hold both hands on it, or press and hold while a ring fills. The friction is the point, and it makes the act feel like a decision rather than a misclick.',k:'HAND',e:'S',i:3},
{c:'hand',t:'Snap to features',n:['brush'],d:'The brush should know when it is over a plate boundary, a coastline, a river, a caldera or a biome edge, and offer to align to it. Most of what a player wants to do geologically is relative to a feature the simulation has already identified.',k:'HAND',e:'M',i:2},
{c:'hand',t:'Symmetry, repetition and stroke tools',n:['brush'],d:'Mirror across the equator, repeat around a latitude circle, extrude along a great circle. A sphere has strong natural symmetries and giving the player access to them turns twenty minutes of clicking into one gesture.',k:'HAND',e:'M',i:2},
{c:'hand',t:'Masking by field',n:['brush'],d:'Apply this brush only where moisture is below 0.2, or only below the snow line, or only on continental crust. It is a small addition to the brush callback and it converts blunt instruments into precise ones without adding a single new tool.',k:'HAND',e:'S',i:3},
{c:'hand',t:'The terminator as an instrument',d:'Grab the day–night line and drag it to change rotation rate, watching the Coriolis banding reorganise as you do. Making an abstract parameter into a thing you can physically take hold of is the clearest single expression of the "every number is a place" rule.',k:'HAND',e:'M',i:3},
{c:'hand',t:'The planet should resist being spun',d:'`qmul(S.q, tmpQ, S.q)` maps hand rotation straight onto the world with no inertia. Give the sphere angular momentum and a little damping and it acquires mass — the cheapest possible way to make a rendered ball feel like 6×10²⁴ kg.',k:'HAND',e:'S',i:3},
{c:'hand',t:'A haptic vocabulary',d:'Sculpting rock, parting water, seeding life and killing something should each have a distinct signature in the controller — grain, resistance, release. Haptics are the only channel that can tell the hand what a tool is doing without taking the eyes off the world.',k:'HAND',e:'M',i:2},
{c:'hand',t:'A precision mode for gardening',n:['brush'],d:'Slow, small, exact — for when the player is tending rather than smiting. It should have its own posture: bring the planet close, and the brush automatically becomes fine. Most long-session play is gardening, and every tool in the build is currently sized for smiting.',k:'HAND',e:'M',i:3},
{c:'hand',t:'Tool state survives a scale change',d:'Shrinking into the surface with a brush selected should keep the brush, resized to the new tier, rather than dropping you into a different interaction model. Continuity across the scale gesture is what makes the four tiers one place instead of four screens.',k:'HAND',e:'S',i:1},

/* --------------------------------------------------------------- land -- */
{c:'land',t:'Sculpt the cause, not the elevation',g:'isoedit',d:'`raise` adds 0.06 to `h[c]` and 0.03 to `crust[c]`, then isostasy spends the next fifty ticks arguing with it. Let the tool edit crustal thickness and density directly and have elevation emerge, so the mountain you build subsides correctly and erodes into a plateau the way a real one does.',k:'SYS',e:'M',i:3},
{c:'land',t:'Take hold of a plate and set its pole',g:'plateedit',d:'Every plate already has an Euler pole and an angular velocity. Grabbing one and redirecting it is the single most god-like act available in a tectonics model, and it turns the next two hundred million years of the run into a consequence of one gesture.',k:'SYS',e:'M',i:3},
{c:'land',t:'Draw a rift with a two-handed pull',n:['plateedit','twohand'],d:'Set both hands on a continent and pull. Crust thins, the floor drops below sea level, water comes in, and a new spreading centre begins producing ocean floor with an age gradient. Watching Pangaea come apart because you pulled it is a headline moment that the tectonics code can already almost deliver.',k:'HAND',e:'M',i:3},
{c:'land',t:'Push two continents together and get real orogeny',n:['plateedit'],d:'Convergence between two continental plates produces thickening rather than subduction. The model knows this; the tool should let the player cause it, and then leave a range that has an age, a root, and a predictable erosional future.',k:'SYS',e:'M',i:3},
{c:'land',t:'Place a mantle plume in the mantle frame',d:'Hotspots are fixed while plates move over them, which is why island chains have an age gradient. Letting the player drop one and then come back in fifty million years to find a chain is one of the most satisfying delayed payoffs in the whole system.',k:'SYS',e:'S',i:3},
{c:'land',t:'Paint crust type',n:['isoedit'],d:'Continental or oceanic, with the density difference that decides which one subducts. It is a one-byte-per-cell edit that determines the shape of everything for the next half-billion years, and it makes the player’s choices geological rather than cosmetic.',k:'SYS',e:'S',i:2},
{c:'land',t:'Carve a river and hand it to the flow model',d:'Drag downhill and cut a channel; the D8 routing then adopts it, accumulates discharge into it, and either keeps it or abandons it depending on whether it made sense. A tool that can be overruled by the simulation is more interesting than one that cannot.',k:'HAND',e:'M',i:3},
{c:'land',t:'Open and close ocean gateways',d:'The Isthmus of Panama, the Drake Passage, the closing of Tethys — a few cells of land or sea that reorganise global circulation and, through it, climate and biogeography. The highest consequence-per-edit ratio anywhere on the map, and the model already has the currents to respond.',k:'SYS',e:'M',i:3},
{c:'land',t:'Sea level as a lever with the ice budget answering',d:'Pull sea level up and the water has to come from somewhere — thermal expansion, or melted land ice, with the isostatic rebound that follows. A lever that forces the player to confront a conservation law is worth more than one that just moves a number.',k:'SYS',e:'M',i:3},
{c:'land',t:'Freeze or accelerate erosion locally',d:'Hold a canyon open, or let ten million years of stream power run in one tick. It is a time tool disguised as a terrain tool and it is the fastest way to show a player that the landscape they are looking at is a process rather than a mesh.',k:'SYS',e:'M',i:2},
{c:'land',t:'Terrain stamps with geological grammar',d:'Shield, craton, volcanic arc, trench, rift valley, impact basin — not brush shapes but assemblies that set crust type, thickness, age and rock type coherently. It gives a player who does not know geology a way to make terrain that is nonetheless correct.',k:'HAND',e:'M',i:2},
{c:'land',t:'Sculpt underwater',d:'Seventy-one per cent of the surface is bathymetry and the current tools effectively cannot reach it — you cannot see what you are doing under the ocean shell. Ocean floor is where half the tectonic story happens and it should be as editable as the land.',k:'HAND',e:'M',i:3},
{c:'land',t:'Preview the isostatic answer before committing',n:['isoedit'],d:'Show the settled elevation, not the instantaneous one, as a ghost while the brush is held. Sculpting a system with a delayed response is guesswork without it, and the preview is also a free lesson in how isostasy works.',k:'HAND',e:'M',i:3},
{c:'land',t:'Let the planet resist',d:'Holding a mountain above its isostatic equilibrium should cost energy every tick, not once. The most important thing a god game can teach about a planet is that it has opinions, and the sculpting tools are where that lesson is cheapest to deliver.',k:'SYS',e:'M',i:3},
{c:'land',t:'Paint regolith and soil',d:'Soil depth already drives fertility through `nutrientN`. Being able to lay down or strip soil is a genuinely different verb from moving rock — slower, subtler, and the one that actually decides whether anything will grow there.',k:'SYS',e:'S',i:2},

/* --------------------------------------------------------------- clim -- */
{c:'clim',t:'An orbital element editor you can hold',g:'orbit',d:'Semi-major axis, eccentricity, obliquity, precession phase — as a physical orrery you reach into rather than three tools that add a fixed delta. Milankovitch forcing is already in the atmosphere tick; this exposes its causes instead of its symptoms.',k:'HAND',e:'M',i:3},
{c:'clim',t:'Move the planet’s orbit and argue with the habitable zone',n:['orbit'],d:'Drag the world inward until the oceans boil, or outward until it snowballs, and watch the weathering thermostat try to compensate on its own timescale. It is the most direct possible demonstration of what "habitable zone" actually means.',k:'SYS',e:'M',i:3},
{c:'clim',t:'Aerosol injection with a real decay curve',d:'`gases.sulphate` decays at 0.992 per tick with no spatial structure. A stratospheric injection should be hemispherically asymmetric, peak after a season, and fade over two to three years — which turns geoengineering from a slider into an event with a shape.',k:'SYS',e:'M',i:3},
{c:'clim',t:'Paint albedo directly',d:'Whiten a desert, blacken an ice sheet. It is the crudest possible climate intervention, it is exactly what Daisyworld is about, and it lets a player discover ice–albedo feedback by falling into it rather than being told.',k:'HAND',e:'S',i:3},
{c:'clim',t:'A solar shade at L1',d:'A statite that removes a percentage of incoming flux with no chemistry involved. It is the cleanest experimental control in the game — change one term in the energy budget and nothing else — and it is the intervention every real geoengineering discussion starts with.',k:'SYS',e:'S',i:2},
{c:'clim',t:'A greenhouse mixing board',d:'Every gas as a fader with the resulting radiative forcing shown live, rather than two "inject" buttons that add 0.02. `greenhouseFromGases` already computes log forcing per species; surfacing it turns the atmosphere from a black box into an instrument panel.',k:'HAND',e:'M',i:3},
{c:'clim',t:'Cloud seeding, and how little it does',d:'Ship the tool and let it underperform. A god tool that is honestly weak is more instructive than one that works, and cloud feedbacks are the largest genuine uncertainty in real climate models — which is a thing worth putting in a player’s hands.',k:'SYS',e:'S',i:1},
{c:'clim',t:'Re-route an ocean current',d:'Drag a gyre, or break the conveyor by freshening the North Atlantic analogue. The thermohaline regime states are already implemented with a shutdown condition; giving the player a way to trip it deliberately makes the model’s scariest behaviour reachable.',k:'SYS',e:'M',i:3},
{c:'clim',t:'Trigger or suppress a glaciation',n:['orbit'],d:'Nudge obliquity and precession into a configuration that starts ice growth, then watch it run away on its own. The interesting part is that the trigger is small and the response is enormous, which is a lesson no amount of text delivers as well.',k:'SYS',e:'M',i:3},
{c:'clim',t:'Set the magnetosphere and watch the air leave',d:'`magnetosphere` is a per-ruleset constant feeding an escape term. Making it a lever means the player can strip a planet slowly and deliberately, over tens of millions of years, which is a completely different register of destruction from an impact.',k:'SYS',e:'S',i:3},
{c:'clim',t:'The Moon as a tidal and stability lever',d:'Mass and distance, driving tidal heating, day length and — most importantly — obliquity stability. Earth’s axis is steady because of the Moon; removing it should let the tilt wander chaotically, which is one of the most under-appreciated facts about why this planet works.',k:'SYS',e:'M',i:3},
{c:'clim',t:'An honest thermostat override',d:'A pin-the-temperature cheat, clearly labelled as a cheat, that disables the run from counting toward anything. Players will want to hold conditions steady while they study something else, and providing it openly is better than watching them fight the model to do it.',k:'PLAY',e:'S',i:2},
{c:'clim',t:'Weather at the local tier',d:'Make it rain on one valley. At the scale where the player is standing on the ground, the god verbs should shrink to match — a storm, a frost, a drought over a single basin, all feeding back into the same fields.',k:'HAND',e:'M',i:3},
{c:'clim',t:'Every climate lever has a settling time you must wait out',d:'Ocean thermal inertia is decades, ice sheets are millennia, the weathering thermostat is hundreds of thousands of years. Make the tool tell you which one you have just pulled, and the player learns the hierarchy of timescales by being made to wait in it.',k:'SYS',e:'M',i:3},

/* --------------------------------------------------------------- life -- */
{c:'life',t:'Seed a guild, not a class index',g:'seedguild',d:'`seedLife(W, cell, W.unlockedClass)` paints an 11.5° blotch of whatever rung is currently unlocked. With the redox tower in place the player should be choosing a metabolism — methanogens, anoxygenic phototrophs, iron oxidisers — and the choice should determine what the planet becomes.',k:'SYS',e:'M',i:3},
{c:'life',t:'An organism designer',g:'design',n:['seedguild'],d:'Set the trait vector directly: body mass, thermal optimum and breadth, desiccation tolerance, dispersal, reproductive strategy. Then release it and find out whether the planet agrees. This is the single most requested thing a god game about life can offer and the trait system now exists to support it.',k:'HAND',e:'L',i:3},
{c:'life',t:'Transplant a lineage',g:'transplant',n:['design'],d:'Pick up a clade from one continent and put it on another. Biogeography is currently something that happens to the player; this makes it something they can do, with all the invasive-species consequences that follow.',k:'HAND',e:'M',i:3},
{c:'life',t:'Force a major transition, at a price',n:['seedguild'],d:'Buy the mitochondrion. Buy multicellularity. The transitions are contingent gates with real preconditions — letting the player pay to force one, at a cost that scales with how unready the world is, makes the gates legible without making them automatic.',k:'SYS',e:'M',i:3},
{c:'life',t:'Directed selection',n:['design'],d:'Point at a trait and push it — larger, colder-tolerant, faster-dispersing — and watch the correlated costs appear elsewhere in the vector. It is animal breeding at planetary scale and it teaches trade-offs better than any tooltip.',k:'SYS',e:'M',i:3},
{c:'life',t:'Declare a refuge',d:'Mark a region where extinction is suppressed. It is a defensive god power, which the toolset currently has none of, and it sets up the most interesting failure mode in the genre: the preserve that survives and the world outside it that does not.',k:'SYS',e:'M',i:3},
{c:'life',t:'Cull precisely',d:'The `plague` scalar multiplies life by 0.55 at random. Let the player name a clade and remove it, then watch the food web restructure around the hole. Precision makes extinction a scalpel rather than a blunt instrument, and a scalpel is far more disturbing.',k:'SYS',e:'M',i:3},
{c:'life',t:'Introduce an invasive and watch the web fail',n:['transplant'],d:'A generalist with no local predators, dropped onto an island with high endemism. The trophic link matrix should do the rest. It is the clearest demonstration available that ecosystems are structures rather than piles.',k:'SYS',e:'M',i:3},
{c:'life',t:'Terraform toward a target biome, and be told what is missing',d:'Pick "temperate forest" for a region and have the game report the gap — not enough rainfall, wrong soil, no ozone, no lineage in range with the right traits. A goal-directed tool that answers with a diagnosis is worth ten tools that just apply an effect.',k:'PLAY',e:'M',i:3},
{c:'life',t:'Panspermia between your own worlds',n:['shelf'],d:'Take a lineage from one planet in the orrery and seed it onto another. Two worlds sharing one phylogenetic tree is a striking object, and it is the payoff for having a catalogue rather than a single world.',k:'SYS',e:'M',i:2},
{c:'life',t:'Revive from the fossil record',d:'Core a rock layer, find a lineage, bring it back. It closes the loop between the instruments and the tools, gives the stratigraphy a gameplay purpose, and raises the obvious question of whether a four-hundred-million-year-old organism has anywhere left to live.',k:'PLAY',e:'M',i:3},
{c:'life',t:'Force a symbiosis',n:['design'],d:'Merge two lineages into one. Endosymbiosis is how eukaryotes happened, it is the least intuitive major transition, and being able to perform it by hand is the fastest way to understand what it actually was.',k:'SYS',e:'M',i:2},
{c:'life',t:'Set the mutation rate',d:'Turn evolution’s clock speed up and watch adaptation outrun stability, or down and watch lineages fail to track a changing climate. One number, two opposite failure modes, and a very direct feel for what mutation–selection balance means.',k:'SYS',e:'S',i:2},
{c:'life',t:'A gardening posture, with tools sized for it',n:['brush'],d:'Most of the hours a player spends with a living planet are spent tending it — nudging a range, encouraging a bloom, thinning a monoculture. The entire current toolset is sized for catastrophe and there is nothing between "seed a continent" and "delete".',k:'HAND',e:'M',i:3},
{c:'life',t:'Let life refuse, and say why',d:'A seed dropped where the photon flux is too low, the acceptor is absent or the UV is lethal should fail and report the reason. `alienTick` already computes a sterility cause. Surfacing it turns every failed attempt into a lesson rather than a dud click.',k:'SYS',e:'S',i:3},

/* ---------------------------------------------------------------- gen -- */
{c:'gen',t:'A world-authoring pass before you press play',g:'genesis',d:'Currently: pick one of five rulesets or one of 120 catalogue bodies, and reseed. A genesis screen where the player sets the constants themselves is a second, quieter kind of god-play, and it is the cheapest replayability in the entire product.',k:'PLAY',e:'M',i:3},
{c:'gen',t:'A star picker with real spectra',n:['genesis'],d:'Effective temperature, radius, mass, age — and therefore insolation, sky colour, photon flux in the photosynthetic band, flare rate and XUV history. One choice at genesis that reaches into six systems downstream.',k:'PLAY',e:'M',i:3},
{c:'gen',t:'Bulk composition and volatile inventory',n:['genesis'],d:'Iron fraction sets the core and the magnetic field; water inventory decides between a desert, an Earth and an ocean world; the volatile budget decides whether there is an atmosphere at all. Three sliders that produce genuinely different planets rather than reskins.',k:'PLAY',e:'M',i:3},
{c:'gen',t:'Draw the initial plate configuration',n:['genesis'],d:'Number of plates, and where the first supercontinent sits. The Wilson cycle will take it from there. Being handed a blank sphere and asked to place the continents is an unusually strong opening beat.',k:'HAND',e:'M',i:2},
{c:'gen',t:'A moon system builder',n:['genesis'],d:'Count, mass and distance, driving tides, obliquity stability and the night sky. It is also the cheapest way to make the view from the surface differ dramatically between worlds.',k:'PLAY',e:'M',i:1},
{c:'gen',t:'Start anywhere on the timeline',n:['genesis'],d:'Begin at the Cambrian, or at the Permian boundary, or ten thousand years before the present. The deep-time clock and the ICS chart already exist; letting the player skip to the era they want removes the single largest barrier to a short session.',k:'PLAY',e:'M',i:3},
{c:'gen',t:'Randomise within constraints',n:['genesis'],d:'"Surprise me, but keep it habitable" — or explicitly not. Constrained randomness is what makes a generator feel like a collaborator rather than a dice roll, and it is how most players will actually find the worlds they love.',k:'PLAY',e:'S',i:2},
{c:'gen',t:'Import a real body, then break it',n:['genesis'],d:'Load Venus from the catalogue and give it Earth’s rotation rate. Load Mars and triple its mass. The catalogue currently produces read-only worlds; making them a starting point rather than a destination doubles what it is worth.',k:'PLAY',e:'S',i:3},
{c:'gen',t:'A world is a seed string',d:'Genesis parameters plus RNG seed plus intervention log, encoded compactly enough to paste into a message. It is the sharing primitive the whole product needs and it costs almost nothing once the RNG is properly seeded.',k:'PLAY',e:'M',i:3},
{c:'gen',t:'"What if" presets',n:['genesis'],d:'Earth without the Moon. Earth with 35% oxygen. Earth with no plate tectonics. Each is a one-parameter change from a well-calibrated baseline and each produces a world that is recognisably wrong in an instructive way.',k:'PLAY',e:'S',i:3},
{c:'gen',t:'A twin-world control',n:['genesis'],d:'Generate two identical planets, change exactly one variable, and run them side by side. It is the scientific method as a game mode, and it is the strongest possible argument that the simulation is a model rather than a story.',k:'PLAY',e:'M',i:3},
{c:'gen',t:'Difficulty as physical parameters',n:['genesis'],d:'Not a multiplier on a health bar — a dimmer star, a thinner atmosphere, a weaker magnetic field, a shorter window before the sun brightens. Difficulty that is made of the same stuff as the simulation is difficulty a player can reason about.',k:'PLAY',e:'S',i:2},
{c:'gen',t:'Name your world, and let the name travel',d:'Into the chronicle, the exported paper, the era names, the clade names, the shared seed string. It costs nothing and it is the difference between "the simulation" and "my planet".',k:'PLAY',e:'S',i:2},

/* ---------------------------------------------------------------- dis -- */
{c:'dis',t:'The impactor, parameterised',g:'impactor',d:'`applyImpact(cell, power)` takes one scalar. Give it mass, velocity, density and — critically — impact angle, because an oblique strike produces an asymmetric ejecta pattern and a very different climate outcome. Chicxulub’s angle is why it was as bad as it was.',k:'SYS',e:'M',i:3},
{c:'dis',t:'Show the consequence chain as it propagates',n:['impactor','receipt'],d:'Thermal pulse, then ejecta reentry heating, then tsunami, then dust, then years of cold, then acid rain, then recovery. Each arriving in order with its own timescale. The chain *is* the drama; a single flash and a lower life number is not.',k:'SYS',e:'M',i:3},
{c:'dis',t:'Large igneous provinces as a placeable multi-million-year event',d:'The Siberian Traps erupted for roughly a million years and killed 81% of marine species — not through the lava but through what it cooked on the way up. A disaster that unfolds over a thousand ticks is a completely different play experience from one that resolves instantly.',k:'SYS',e:'M',i:3},
{c:'dis',t:'A nearby supernova or gamma-ray burst',d:'Strips ozone, spikes surface UV, and leaves the ocean untouched below a few metres. It is the one catastrophe that discriminates precisely between the marine and terrestrial biosphere, which makes it a genuinely different weapon from everything else in the palette.',k:'SYS',e:'M',i:2},
{c:'dis',t:'A stellar flare with a recovery curve',d:'Proxima brightened 14,000-fold in the ultraviolet for seven seconds in 2019. Ozone strips in hours and takes years to rebuild, so the damage is a function of flare *frequency* rather than magnitude — which is exactly why M-dwarf habitability is contested.',k:'SYS',e:'M',i:2},
{c:'dis',t:'A clathrate release',d:'Destabilise the seafloor methane and put thousands of gigatonnes of carbon into the system in under twenty thousand years. The PETM did this and the recovery took a hundred and fifty thousand. It is the disaster whose timescale is closest to the one the player will recognise.',k:'SYS',e:'M',i:3},
{c:'dis',t:'A pathogen with a model behind it',d:'`W.plague` is a scalar that multiplies life by 0.55 with 3% probability per cell. Give it a host range keyed to the trait vector, a transmission rate, a virulence–transmissibility trade-off, and the ability to burn out or to jump clades. Suddenly it is a strategy rather than a smite.',k:'SYS',e:'M',i:3},
{c:'dis',t:'Every disaster writes into the rock',n:['impactor'],d:'An ejecta layer with an iridium anomaly, a volcanic ash bed, a black shale from an anoxic event. The core sampler already reads strata; making catastrophes deposit their own signature means the player can rediscover their own crimes ten million years later.',k:'SYS',e:'M',i:3},
{c:'dis',t:'State irreversibility before the act, not after',d:'Some things cannot be undone at any price — a stripped atmosphere, a sterilised biosphere, a lost metabolic pathway. The interface should say so *before* the commit gesture, because a warning after the fact is just a taunt.',k:'PLAY',e:'S',i:3},
{c:'dis',t:'Scale the drama to the tier you are standing at',d:'From orbit an impact is a bright dot and a spreading grey. From the ground it is a light on the horizon, then silence, then the ground arriving. The same event needs two entirely different presentations and the second one is the reason to build a Local tier at all.',k:'HAND',e:'M',i:3},
{c:'dis',t:'The aftermath is the content',d:'Disaster taxa blooming into the emptiness, ferns and then forests, ten million years of truncated food webs slowly rebuilding. If the recovery is not watchable then the catastrophe was just a number going down, and the whole category is wasted.',k:'SYS',e:'M',i:3},
{c:'dis',t:'Compound disasters',d:'The end-Permian was volcanism *and* warming *and* anoxia *and* acidification, which is why it was the worst one. Let effects stack and interact rather than resolving independently, and the difference between a bad day and an extinction becomes something the player can engineer.',k:'SYS',e:'M',i:3},
{c:'dis',t:'A disaster forecast that is honestly uncertain',d:'Show a range, not a number, and let the outcome land somewhere inside it. Every real catastrophe model produces a distribution; presenting one teaches more than a deterministic preview and it makes the big buttons genuinely tense.',k:'PLAY',e:'M',i:2},
{c:'dis',t:'Retire the planet buster, or earn it',d:'It currently sets every cell to `h -= 0.3 + rand`, `life = 0`, `temp = 1.4` and calls it a moist greenhouse. Either make it a real physical event — a Theia-class impact with an ejecta disc and a possible moon — or remove it, because a joke button in a model this careful undercuts everything around it.',k:'SYS',e:'M',i:2},

/* --------------------------------------------------------------- cons -- */
{c:'cons',t:'Every act gets a receipt',g:'receipt',d:'What you changed, by how much, in what units, and what it is expected to do. `chronLog(W.year, "tool", cell, W.solar, "Solar → 1.09")` is a log line, not a receipt. This is the foundation for the entire category and it is not expensive.',k:'PLAY',e:'M',i:3},
{c:'cons',t:'Forecast before you commit',n:['receipt'],d:'Hold the tool and see the projected effect over the next ten, hundred and thousand ticks as a ghosted curve. Committing blind to an act whose consequences arrive over geological time is not a meaningful decision; it is a coin flip with extra steps.',k:'PLAY',e:'M',i:3},
{c:'cons',t:'Delayed consequences that point back at you',n:['receipt'],d:'When the ice sheet you triggered finally collapses four hundred thousand years later, the notification should name the act that started it. The lag *is* the lesson, and it only lands if the causal link survives the wait.',k:'PLAY',e:'M',i:3},
{c:'cons',t:'Attribute chronicle events to the player by name',n:['receipt'],d:'"The Long Freeze" reads very differently as "The Long Freeze, which you began". The chronicle currently records the world’s history as though nobody were in the room.',k:'PLAY',e:'S',i:3},
{c:'cons',t:'A causal trace from any outcome back to its causes',n:['receipt'],d:'Select an extinction and walk backward through the field values, the thresholds crossed, and the interventions that moved them. It is the same machinery the science instruments need, pointed at the player instead of at the planet.',k:'PLAY',e:'L',i:3},
{c:'cons',t:'The planet should argue',d:'Silicate weathering opposes a CO₂ injection. Ice–albedo amplifies a cooling. Life colonises the niche you emptied. Making the direction and strength of the response visible turns every act into a conversation rather than a command.',k:'SYS',e:'M',i:3},
{c:'cons',t:'Overshoot warnings',d:'"You are 0.3 from a snowball you will not be able to reverse." The runaway states already have hysteresis; telling the player where the cliff is, before they are over it, is the difference between a system with tipping points and a system that just breaks.',k:'PLAY',e:'M',i:3},
{c:'cons',t:'Show the counterfactual',n:['receipt'],d:'Run a shadow simulation without the player’s interventions and plot it alongside the real one. It is expensive and it is the single most convincing way to answer "did I actually do anything?"',k:'SYS',e:'L',i:3},
{c:'cons',t:'Make extinction debt visible at the moment you cause it',d:'The population is already gone; it has not finished yet. Showing the committed loss at the moment of the act, rather than when the last individual dies, is the most important thing this genre can teach and it is currently invisible.',k:'PLAY',e:'M',i:3},
{c:'cons',t:'Let the biosphere look wounded',d:'Not a lower number — a visibly truncated food web, a monoculture where a forest was, an ocean the wrong colour. Damage should be legible in the view, not in the HUD, because the HUD is where the player is not looking.',k:'HAND',e:'M',i:3},
{c:'cons',t:'Signpost second-order effects as second-order',d:'"The reef died because the ocean acidified because you injected CO₂" is three linked statements, and presenting them as a chain rather than a list is what makes a coupled model comprehensible.',k:'PLAY',e:'M',i:3},
{c:'cons',t:'An attribution fraction',d:'What proportion of the current state is downstream of the player versus the planet’s own dynamics? One honest number, recomputed continuously, and probably the most uncomfortable readout in the product.',k:'SYS',e:'L',i:2},
{c:'cons',t:'Let the player find out, later, which act started it',d:'The chronicle should support the question "when did this go wrong" and answer it with a specific gesture, at a specific date, that seemed reasonable at the time. That is the emotional payload the whole simulation exists to deliver.',k:'PLAY',e:'M',i:3},

/* --------------------------------------------------------------- cost -- */
{c:'cost',t:'Cost from thermodynamics, not a hand-written table',g:'thermo',d:'`{ id: "meteor", cost: 25 }`. Derive the price from the energy the act actually adds to or removes from the system, in the same units the model uses. Then a small nudge is cheap, a planet-scale change is not, and the economy becomes explicable rather than tuned.',k:'SYS',e:'M',i:3},
{c:'cost',t:'Cheap with the grain, expensive against it',n:['thermo'],d:'Nudging a glaciation that the orbit was already going to produce should cost a fraction of forcing one against the forcing. It rewards understanding the system over brute force, which is the only reward structure that makes a simulation worth learning.',k:'SYS',e:'M',i:3},
{c:'cost',t:'Make biosphere income actually matter',n:['thermo'],d:'`energyIncome = 0.5 + health * 1.5 + meanLife` is computed every tick and, with budget mode off by default, almost never read. If the player’s power comes from the biosphere’s health, then every act of destruction is also an act of self-harm — which is the whole thesis, expressed as an economy.',k:'PLAY',e:'S',i:3},
{c:'cost',t:'Cooldowns on the system’s own timescale',d:'You should not be able to move the orbit twice in a century. Tie each tool’s recharge to the characteristic time of the system it touches, and the player learns the hierarchy of timescales through their own impatience.',k:'SYS',e:'M',i:3},
{c:'cost',t:'You cannot push a planet faster than it moves',d:'A hard rate limit on each field, independent of energy. Some things are not expensive, they are impossible, and a god game that has no impossible is a god game with no shape.',k:'SYS',e:'M',i:3},
{c:'cost',t:'Three scarcity modes, honestly labelled',d:'Free play, budgeted, and a middle where observation is free but intervention is not. Currently it is a toggle that is off by default, which means the intended experience is the one almost nobody sees.',k:'PLAY',e:'S',i:3},
{c:'cost',t:'Bank energy across an era',d:'Save for a hundred thousand years to afford one enormous act. Deferred gratification at geological scale is a genuinely novel pacing mechanic and it fits the subject matter exactly.',k:'PLAY',e:'S',i:1},
{c:'cost',t:'Show the price before the gesture, not after',d:'`afford()` silently deducts and returns false with "No energy". The cost, the remaining balance and the projected income should all be visible while the tool is held.',k:'HAND',e:'S',i:3},
{c:'cost',t:'Let the player go into debt',d:'Overspend and the planet pays — the biosphere is drawn down to cover it. It gives the economy teeth without ever blocking an action, which is almost always the better design.',k:'SYS',e:'M',i:2},
{c:'cost',t:'Observation is always free',d:'Inspect, core, ice core, every instrument, every chart. Charging for looking would be the single fastest way to stop players from learning the model, and the current table gets this right — it should be stated as a principle so it stays right.',k:'PLAY',e:'S',i:3},
{c:'cost',t:'Leverage points cost less',n:['thermo'],d:'The same intervention at a bifurcation is worth a hundred times what it is worth in a stable regime. Pricing that difference — and showing it — turns the game into a hunt for the moment rather than a hunt for the button.',k:'SYS',e:'M',i:3},
{c:'cost',t:'The cost of doing nothing',d:'Show what the trajectory costs if the player does not act. Inaction is a choice with a price and the interface currently presents it as the absence of one.',k:'PLAY',e:'M',i:2},
{c:'cost',t:'Different archetypes, different economies',d:'The Gardener earns from biosphere health; the Vandal earns from entropy released; the Scientist earns from measurements taken. Same simulation, three incompatible reward functions, and an enormous amount of replay for very little code.',k:'PLAY',e:'M',i:2},

/* --------------------------------------------------------------- goal -- */
{c:'goal',t:'A scenario format',g:'scenario',d:'Initial world state, a stated objective, available tools, a time limit in the world’s own units, and a scoring function. Everything below is data once this exists, which makes it the highest-leverage item in the category by a distance.',k:'PLAY',e:'M',i:3},
{c:'goal',t:'Terraform Mars, properly',n:['scenario'],d:'A real body from the catalogue, a real set of obstacles — no magnetic field, insufficient volatiles, 38% gravity — and no guarantee it can be done. The honest version of the most famous god-game fantasy there is.',k:'PLAY',e:'M',i:3},
{c:'goal',t:'Recreate Earth, and be scored on divergence',n:['scenario'],d:'Start at 4.5 Ga and try to land the Great Oxidation, the Cambrian and the K–Pg within tolerance. It doubles as the regression test for the whole simulation, which means the scenario and the engineering discipline pay for each other.',k:'PLAY',e:'M',i:3},
{c:'goal',t:'Save a doomed world',n:['scenario'],d:'Arrive at a planet already in a moist greenhouse, or a snowball, or with a biosphere in freefall, and find the intervention that works. Rescue is a completely different skill from creation and the current toolset has never been tested against it.',k:'PLAY',e:'M',i:3},
{c:'goal',t:'Grow a biosphere on a hostile world',n:['scenario'],d:'Europa, Titan, an eyeball planet around an M dwarf. The alien-biosphere systems exist; the scenario is what makes a player actually engage with a chemistry that is not Earth’s.',k:'PLAY',e:'M',i:3},
{c:'goal',t:'Hands-off: set the initial conditions and let go',n:['scenario'],d:'One genesis configuration, no interventions, four and a half billion years. It is the purest test of whether the model is generative, and it is a genuinely tense twenty minutes.',k:'PLAY',e:'S',i:3},
{c:'goal',t:'The Fermi scenario',n:['scenario'],d:'Run a whole system of catalogue worlds and see how many produce anything at all. The Gaian bottleneck as a playable proposition rather than a paragraph, and the natural endgame for the orrery view.',k:'PLAY',e:'M',i:2},
{c:'goal',t:'Constraint challenges',n:['scenario'],d:'No impacts. No direct life seeding. Climate levers only. Removing tools is the cheapest way to produce new play out of an existing system, and constraint is what turns a sandbox into a puzzle.',k:'PLAY',e:'S',i:3},
{c:'goal',t:'Twenty-minute historical vignettes',n:['scenario'],d:'The Great Oxidation. Snowball Earth. The end-Permian. Each a set piece with a beginning and an end, playable in one sitting, and each teaching one coupled loop properly. This is how a player who will never read the briefs learns the model.',k:'PLAY',e:'M',i:3},
{c:'goal',t:'Scoring that is not a score',n:['scenario'],d:'Report what the world became — biosphere complexity, time spent regulating, diversity at the end, how much of it was you. Rank on nothing. A number out of a hundred would flatten fifteen coupled systems into a leaderboard and lose everything interesting about them.',k:'PLAY',e:'M',i:3},
{c:'goal',t:'Failure states worth reaching',d:'A sterile world, a runaway greenhouse, a snowball that never breaks. Each should have a distinct, well-made ending screen with the history that produced it, because a failure the player wants to show someone is not a failure.',k:'PLAY',e:'M',i:3},
{c:'goal',t:'Scenario authoring for players',n:['scenario'],d:'If the format is data, the editor is mostly UI. User-authored challenges are the cheapest long-tail content available and they turn the seed-string sharing item into something worth having.',k:'PLAY',e:'M',i:2},
{c:'goal',t:'A daily world',n:['scenario'],d:'One shared seed, one shared constraint, everyone gets the same planet. It is a well-proven retention mechanic and it costs a seed and a date.',k:'PLAY',e:'S',i:1},
{c:'goal',t:'A campaign that introduces the systems in order',n:['scenario'],d:'Daisyworld for feedback, then the carbon cycle, then the redox tower, then evolution, then the whole coupled thing. Fifteen systems is too many to meet at once, and the current build meets the player with all of them and a dock full of buttons.',k:'PLAY',e:'M',i:3},

/* ---------------------------------------------------------------- obs -- */
{c:'obs',t:'Time controls that respect deep time',g:'timeui',d:'The adaptive clock already runs from 10 Myr per tick to 10 yr per tick. The player needs a control that exposes that — a rate they choose, in years, with the tick length shown, rather than a pause button and whatever the simulation feels like doing.',k:'HAND',e:'M',i:3},
{c:'obs',t:'Fast-forward that stops at anomalies',n:['timeui'],d:'Run at maximum rate and halt automatically on a first occurrence, a threshold crossing or an extinction. It is the only way to traverse four billion years without either watching all of it or missing all of it.',k:'PLAY',e:'M',i:3},
{c:'obs',t:'A genuine let-it-run mode',d:'No dock, no HUD, no tools — the planet, the sound, and the clock. Some of the best hours anyone will spend with this will be spent not touching it, and there is currently no way to have them.',k:'PLAY',e:'S',i:3},
{c:'obs',t:'Autopilot as a character rather than a checkbox',d:'`W.autopilot` nudges solar by 0.002 and CO₂ by 0.0005 when things drift. Make Gaia an agent with a visible policy, a stated goal and a log of what it did and why — then let the player argue with it, override it, or hand it the planet and watch.',k:'PLAY',e:'M',i:3},
{c:'obs',t:'Cameras that find the interesting thing',d:'A terminator pass over a storm, a low orbit along a coastline, a slow push into a bloom. The simulation knows where the anomalies are; pointing a camera at them is a small piece of code and a large part of what makes a build look finished.',k:'HAND',e:'M',i:3},
{c:'obs',t:'A window seat',d:'Sit on the surface, at one place, and watch the weather and the seasons go past for a few million years. It is the strongest argument for the Local tier existing and it requires almost nothing beyond a fixed camera and patience.',k:'PLAY',e:'S',i:3},
{c:'obs',t:'An ambient mode',d:'Something worth leaving on a second monitor. The visual work in the fidelity backlog earns most of its value here, and this is the mode most likely to be the reason somebody shows the product to somebody else.',k:'PLAY',e:'S',i:2},
{c:'obs',t:'Bookmarks you can return to',d:'The moments system already auto-captures first occurrences. Letting the player mark their own — and jump back to the state, not just the camera — turns a four-billion-year run into something navigable.',k:'PLAY',e:'M',i:3},
{c:'obs',t:'Timelapse export',d:'A run compressed into thirty seconds, with the era ribbon running underneath. It is the artefact people share, and sharing is the only distribution this kind of project ever gets.',k:'PLAY',e:'M',i:3},
{c:'obs',t:'Notification design for deep time',d:'What deserves to interrupt, at what tick rate, and what should quietly accumulate in a list. At 10 Myr per tick almost everything is an event; at 10 yr per tick almost nothing is. The threshold has to move with the clock.',k:'PLAY',e:'M',i:2},
{c:'obs',t:'The chronicle as something you read',d:'`exportChronicle` produces a flat markdown list. A reading mode — typeset, paginated, with the era structure and the figures inline — makes the history of the world an artefact rather than a log file.',k:'PLAY',e:'M',i:2},
{c:'obs',t:'Reward restraint',d:'A world that reached complexity with almost no intervention is a better outcome than one that was micromanaged there, and nothing in the product currently says so. The observer needs to know that watching is a way of playing, not a failure to.',k:'PLAY',e:'S',i:3},

/* ---------------------------------------------------------------- civ -- */
{c:'civ',t:'Make them notice you',g:'notice',d:'Settlers already raise `build[c]` and found villages. The moment a civilisation registers that its climate excursions correlate with something outside the world, every tool in this document acquires a second meaning. This is the hinge the whole category turns on.',k:'PLAY',e:'L',i:3},
{c:'civ',t:'Prayer and request as an input channel',n:['notice'],d:'They ask for rain, for the ice to stop, for the neighbours to be dealt with. It is the only mechanism in the genre that gives the player a *reason* to intervene that comes from inside the world, and it costs one message queue.',k:'PLAY',e:'M',i:3},
{c:'civ',t:'Worship that responds to what you actually do',n:['notice'],d:'Not a resource — a description. A god who withholds is understood differently from one who intervenes constantly, and the culture that grows around each is different. Let the belief system be an output of the play style.',k:'PLAY',e:'M',i:3},
{c:'civ',t:'Intervention has a cultural cost',n:['notice'],d:'Every miracle makes them more dependent and less capable. The god who saves a civilisation from every drought produces one that cannot survive a drought, which is a genuinely uncomfortable and genuinely true mechanic.',k:'PLAY',e:'M',i:3},
{c:'civ',t:'Sacrifice and bargain',n:['notice'],d:'They offer something to get something. Whether the player accepts, and what the offer does to them, is the most direct moral instrument available and it needs almost no simulation behind it.',k:'PLAY',e:'M',i:2},
{c:'civ',t:'Let them write the chronicle',n:['notice'],d:'The same events, recorded by people who were there and did not understand them — a flood as a punishment, a volcanic winter as a betrayal, an extinction as a myth. Running the history through an unreliable narrator is worth more than any amount of additional accuracy.',k:'PLAY',e:'M',i:3},
{c:'civ',t:'Named individuals whose deaths land',n:['notice'],d:'The entity system already generates names and tracks a birth year. A handful of followed individuals, with lives long enough to care about, converts a population statistic into something the player will hesitate before flooding.',k:'PLAY',e:'M',i:3},
{c:'civ',t:'A technology path made of this planet’s actual geology',n:['notice'],d:'No accessible copper, no bronze age. No Carboniferous coal, no industrial revolution. The ore and carbon burial models already place these; letting them gate a civilisation makes the deep-time geology matter four billion years later.',k:'PLAY',e:'L',i:3},
{c:'civ',t:'They work out their own deep time, and get it wrong',n:['notice'],d:'Their geologists date the planet, misread the record, and revise. Watching a civilisation reconstruct a history the player watched happen is a joke the player is uniquely positioned to enjoy, and it is also a real point about how science works.',k:'PLAY',e:'M',i:2},
{c:'civ',t:'They work out that you exist',n:['notice'],d:'Statistically, eventually, someone notices the anomalies correlate. What they do with that — worship, denial, an attempt to communicate, an attempt to stop you — is the strongest endgame this design has available.',k:'PLAY',e:'L',i:3},
{c:'civ',t:'Let them leave',n:['notice'],d:'A civilisation that gets off the planet has escaped you. In a multi-world orrery it can arrive somewhere else. It is the one outcome that resolves the god relationship rather than continuing it.',k:'PLAY',e:'L',i:2},
{c:'civ',t:'Let them refuse you',n:['notice'],d:'Reject the miracle, reject the god, build the thing you told them not to. Agency that can be pointed back at the player is what separates inhabitants from decoration.',k:'PLAY',e:'M',i:2},
{c:'civ',t:'Their extinction should not read like a bacterial one',n:['notice'],d:'Same mechanism, entirely different presentation. If the chronicle logs the end of a civilisation with the same typography as a guild dying out, the game has quietly said they are equivalent — and it should mean that on purpose or not at all.',k:'PLAY',e:'M',i:3},
{c:'civ',t:'Show the moral weight, do not assign it',n:['notice'],d:'Report what happened and who it happened to. No approval meter, no karma. The genre’s besetting sin is telling the player how to feel about an act the simulation has already made perfectly legible.',k:'PLAY',e:'M',i:3},

/* ----------------------------------------------------------------- vr -- */
{c:'vr',t:'Two-handed scale as the primary verb',g:'scale',n:['twohand'],d:'Pull your hands apart and the planet grows; push them together and it shrinks. Currently scale is a thumbstick axis (`S.scaleXR -= ay * 0.006`). The stated thesis of the product is a scale gesture and it is presently bound to a joystick.',k:'HAND',e:'M',i:3},
{c:'vr',t:'The planet in your palm, with weight',n:['scale'],d:'Held, it should have inertia, a slight resistance to being turned, and a haptic hum. It is the first thing anybody will do in the headset and it is the moment the product either lands or does not.',k:'HAND',e:'M',i:3},
{c:'vr',t:'Make the transition the experience',n:['scale'],d:'Shrinking from orbit to standing on the ground should be continuous, with the atmosphere thickening, the horizon flattening, the exposure adapting and the sound changing. A jump cut between tiers throws away the single most novel thing this design has.',k:'HAND',e:'L',i:3},
{c:'vr',t:'Kneel to look at something small',n:['scale'],d:'At the Local tier the player’s real body position should matter — crouching to look under a canopy, leaning to see into a rock pool. Physical posture as a camera control is free, and it is the reason to be in a headset rather than at a monitor.',k:'HAND',e:'M',i:3},
{c:'vr',t:'Hands as weather',d:'A palm held over a region casts a shadow, cools it, and eventually condenses cloud. It is physically nonsense and it is exactly the kind of nonsense a god game should have, because it makes the connection between body and world immediate.',k:'HAND',e:'M',i:2},
{c:'vr',t:'Breath as wind',d:'The headset knows where your head is; a controller can approximate the rest. Blowing across a planet to move a dust storm is the sort of detail that people describe to other people afterwards.',k:'HAND',e:'M',i:1},
{c:'vr',t:'The orrery table',n:['shelf'],d:'A physical surface at waist height with the worlds on it. It gives the whole product a place to be, solves the navigation problem between planets, and is the natural home for the instruments.',k:'HAND',e:'L',i:3},
{c:'vr',t:'Reach into the ocean',n:['scale'],d:'Put a hand through the surface and the water should part around it, the temperature should read in the haptics, and whatever lives there should react. Volume — as opposed to surface — is the thing VR does that a screen cannot.',k:'HAND',e:'M',i:2},
{c:'vr',t:'Look up from the surface and see yourself',n:['scale'],d:'At the Local tier, the sky should contain an implication of the enormous presence that was holding the planet a moment ago. It is the single image that would sell this product and it is a rendering trick, not a system.',k:'HAND',e:'M',i:3},
{c:'vr',t:'Comfort as a hard constraint',d:'The scale gesture moves the world past the player at high apparent velocity, which is the classic vection trigger. Vignetting, a stable horizon reference, and a comfort setting that does not degrade the experience are not polish items — they decide whether people can use it.',k:'HAND',e:'M',i:3},
{c:'vr',t:'Seated and standing parity',d:'The whole interaction model should work from a chair. Room-scale-only design excludes most of the people who would spend the longest with something this contemplative.',k:'HAND',e:'M',i:3},
{c:'vr',t:'Hand tracking without controllers',d:'Pinch to sculpt, cup to gather, spread to scale. The gesture vocabulary in this category is almost all bare-handed by nature, and controller-free is the mode in which "hold a planet" stops being a metaphor.',k:'HAND',e:'L',i:2},
{c:'vr',t:'Decide what a god’s body is',d:'Hands, or a presence, or nothing at all? The design has not answered this and it determines the shape of every interaction above. Rendered hands are the safe answer; being the weather is the interesting one.',k:'HAND',e:'M',i:2},
{c:'vr',t:'Passthrough: the planet on your actual desk',d:'Mixed reality turns a twenty-minute session into something you can leave running on the table beside you. It is also the cheapest way to get the ambient mode into a space where people will actually keep it.',k:'HAND',e:'M',i:2},

/* --------------------------------------------------------------- many -- */
{c:'many',t:'A shelf of worlds',g:'shelf',d:'The app holds one planet at a time and there are 120 in the catalogue. Persisting several runs simultaneously — visible together, in one space — is the change that makes the catalogue a collection rather than a menu.',k:'PLAY',e:'L',i:3},
{c:'many',t:'The orrery as the system view',n:['shelf'],d:'The product is named for it. Worlds in their real orbits around a real star, with the habitable zone drawn, and a time control that runs all of them at once.',k:'PLAY',e:'L',i:3},
{c:'many',t:'Seed one world from another',n:['shelf'],d:'Carry a lineage, a guild, or an atmosphere across. It gives the shelf a mechanic rather than just a display, and it is the natural home for panspermia.',k:'PLAY',e:'M',i:2},
{c:'many',t:'Run two worlds side by side',n:['shelf'],d:'The twin-world control, in the interface rather than in principle. One variable different, both clocks synchronised, both histories visible. It is the strongest demonstration of causality the product can stage.',k:'PLAY',e:'M',i:3},
{c:'many',t:'Compare worlds on the same axes',n:['shelf'],d:'Diversity, disequilibrium, mean temperature, time spent regulating. Once several worlds exist, the comparison view is where the catalogue’s scientific claim actually gets made.',k:'PLAY',e:'M',i:3},
{c:'many',t:'A garden of the ones you have actually run',n:['shelf'],d:'Not the catalogue — the subset the player has personally taken through deep time, with their outcomes. Progress through 120 real bodies is a collection mechanic that happens to also be an education.',k:'PLAY',e:'M',i:3},
{c:'many',t:'Inherit between runs',n:['shelf'],d:'Carry a clade, a design, or a genesis configuration forward. A small amount of persistence across sessions changes the relationship from "a thing I opened" to "a thing I am doing".',k:'PLAY',e:'M',i:2},
{c:'many',t:'Rank your worlds by biosignature strength',n:['shelf'],d:'Thermodynamic disequilibrium is already computed. Sorting a shelf of planets by how detectable their life is from a distance is the single most interesting list this product could produce.',k:'PLAY',e:'S',i:3},
{c:'many',t:'A system-scale energy budget',n:['shelf','thermo'],d:'One pool across several worlds forces a real strategic choice: tend the promising one, or spread the effort. Scarcity across a portfolio is a completely different game from scarcity within one planet.',k:'PLAY',e:'M',i:2},
{c:'many',t:'Share a world as a seed and an intervention log',d:'Small enough to paste, complete enough to reproduce exactly. It is the distribution mechanism, the bug report format, and the scenario format, all at once.',k:'PLAY',e:'M',i:3},
{c:'many',t:'Continue someone else’s world',d:'Load their log, then diverge. Asynchronous multiplayer with no server, no lobby and no latency, on a subject where a hundred million years of divergence is the point.',k:'PLAY',e:'M',i:2},
{c:'many',t:'The collection as the long game',n:['shelf'],d:'Not achievements — a record of which of the real bodies you have taken from formation to whatever they became. It is the meta-structure that gives a sandbox a reason to be opened a fortieth time.',k:'PLAY',e:'M',i:2},

/* -------------------------------------------------------------- legib -- */
{c:'legib',t:'A power meter',g:'attrib',n:['receipt'],d:'How much of this planet’s current state is attributable to the player? One number, continuously recomputed, prominently placed. It is the readout the entire god fantasy is actually about and no god game has ever shown it honestly.',k:'PLAY',e:'L',i:3},
{c:'legib',t:'The intervention log as a document',n:['receipt'],d:'Every act, dated in the world’s own time, with its cost, its intent and its outcome. Separate from the chronicle, because the chronicle is the planet’s history and this is yours.',k:'PLAY',e:'M',i:3},
{c:'legib',t:'Your Earth against the real Earth',d:'Overlay the actual record — oxygen curve, temperature, diversity, extinction dates — on the player’s run. The calibration harness already needs this comparison; surfacing it costs a chart and it is one of the most compelling things in the product.',k:'PLAY',e:'M',i:3},
{c:'legib',t:'A heatmap of where you have touched',n:['receipt'],d:'Paint the sphere by intervention density. Most players will be astonished by how concentrated their attention has been, and by how much of the world they have never once looked at.',k:'PLAY',e:'S',i:3},
{c:'legib',t:'Show the leverage',d:'Where would a small act do the most right now? Sensitivity analysis over the field set, rendered as a map. It converts the game from a search for the right button into a search for the right moment and place.',k:'SYS',e:'L',i:3},
{c:'legib',t:'Show the futility',d:'Where will nothing you do matter? Regions and variables that are locked by their own dynamics. A god game that never says "not this, not now" has no shape, and honesty about powerlessness is more interesting than unlimited power.',k:'SYS',e:'M',i:2},
{c:'legib',t:'Uncertainty bands on every forecast',n:['receipt'],d:'The model is a model. Any projection it offers should come with a range that widens with the horizon, and the player should watch outcomes land inside — and occasionally outside — it.',k:'PLAY',e:'M',i:3},
{c:'legib',t:'The model’s limits, in the game',d:'`briefs/model-limits.md` exists on disk. Put it in the product, reachable from any instrument, so a player who wonders whether a number is real can find out immediately. Stating the boundary is what earns trust for everything inside it.',k:'PLAY',e:'S',i:3},
{c:'legib',t:'Separate what you did from what it did',n:['attrib'],d:'Two columns in every summary. The most common failure of understanding in this genre is a player taking credit for, or blame for, a dynamic the planet was always going to produce.',k:'PLAY',e:'M',i:3},
{c:'legib',t:'Measure restraint',n:['attrib'],d:'Interventions per million years, energy unspent, time spent observing. Report it without judging it — some of the best runs will have the lowest numbers and the player should be able to see that themselves.',k:'PLAY',e:'S',i:2},
{c:'legib',t:'Which tools you actually use',d:'A histogram. It is a design instrument as much as a player-facing one, and it will almost certainly reveal that fourteen of the seventeen tools are never touched.',k:'PLAY',e:'S',i:1},
{c:'legib',t:'A scoreboard for style, not success',d:'Gardener, vandal, scientist, absentee — derived from the intervention log and stated as a description rather than a rank. It tells the player something true about themselves, which is a rarer thing for a game to do than winning.',k:'PLAY',e:'M',i:2},

/* --------------------------------------------------------------- feel -- */
{c:'feel',t:'A sound per act, with mass behind it',d:'`audio.js` is a hundred lines of oscillator blips. Sculpting rock, parting an ocean, seeding life and ending a lineage should each have a distinct sound with real low end. Weight is carried in audio more than in any other channel.',k:'HAND',e:'M',i:3},
{c:'feel',t:'The planet’s own soundscape',d:'Wind by pressure and speed, ocean by roughness, rain by intensity, ice by mass. A world that sounds different because it *is* different does more for the sense of place than any texture, and every input it needs is already simulated.',k:'HAND',e:'M',i:3},
{c:'feel',t:'Silence as a resource',d:'Airless worlds should be genuinely, uncomfortably silent. A snowball should be muffled. Knowing when to remove sound is most of what separates a designed soundscape from a busy one.',k:'HAND',e:'S',i:3},
{c:'feel',t:'Ceremony before the irreversible',d:'A pause, a change in the light, the ambient sound dropping out. Not a confirmation dialog — a moment. It is the cheapest way to make an act feel like it matters and the current `window.confirm()` is the opposite of it.',k:'HAND',e:'M',i:3},
{c:'feel',t:'The first-life moment',d:'The single most important event in any run, currently a chronicle line and a colour change. It deserves the full apparatus — time slowing, the sound thinning, the camera finding it, and then nothing but the planet for a few seconds.',k:'HAND',e:'M',i:3},
{c:'feel',t:'Haptic weight for the sphere',d:'A low continuous rumble while it is held, modulated by rotation speed. Two lines of code, and it is the difference between holding an object and holding a rendering of one.',k:'HAND',e:'S',i:3},
{c:'feel',t:'Music that tracks the era, not the action',d:'Scored to the geological age rather than to whether something exciting just happened. It reinforces the timescale continuously, which is the hardest thing about this subject to communicate and the thing music is best at.',k:'HAND',e:'M',i:2},
{c:'feel',t:'The buster should be hard to do and awful to hear',d:'If the game keeps a world-ending button, everything about performing it should discourage it — the gesture, the delay, the sound, the aftermath. A destruction that is fun and consequence-free contradicts every other decision in the project.',k:'HAND',e:'S',i:2},
{c:'feel',t:'Ceremony in light, not particles',d:'Big moments should be expressed through exposure, colour temperature and the terminator rather than through sparks. The rendering direction in the fidelity backlog gives all of this for free and it will age far better than an effects layer.',k:'HAND',e:'M',i:2},
{c:'feel',t:'Make the quiet acts audible',d:'Seeding a refuge, letting a bloom spread, choosing not to act. If only the catastrophes have sound design, the game has told the player what it wants them to do, whatever the text says.',k:'HAND',e:'M',i:3},
{c:'feel',t:'A finale',d:'Every run ends — heat death, red giant, a sterile world, or the player putting it down. There should be an ending worth reaching, that gathers the history and hands it over as something to keep. Nothing in the build currently knows how to end.',k:'PLAY',e:'M',i:3},
];

/* ------------------------------------------------------------- derive -- */
D.forEach((x, i) => { x.id = i + 1; });

const byCat = (id) => D.filter((x) => x.c === id);
const count = (f) => D.filter(f).length;
const KIND = { HAND: 'Hand', SYS: 'System', PLAY: 'Play' };

const provides = new Map();
for (const x of D) if (x.g) provides.set(x.g, x);
const dependents = (tok) => D.filter((y) => (y.n || []).includes(tok)).length;
const CRITICAL = [...provides.keys()]
  .map((k) => ({ k, x: provides.get(k), n: dependents(k) }))
  .filter((r) => r.n > 0)
  .sort((a, b) => b.n - a.n);

const NOW = [
  ['Seventeen tools, one code path', 'Every god act is an entry in `TOOLS` with a hand-written integer cost, dispatched through a `switch` in `useToolAt`. Fourteen of the seventeen fire once and mutate a field directly. There is no brush state, no drag, no preview, no undo.'],
  ['One brush, one falloff', '`paintBrush(cell, fn, radius)` takes a cosine threshold at `radius * 0.04` radians and hands the callback a linear falloff. It is the whole of the manipulation layer, and it is called by four tools.'],
  ['Sculpting edits the output', '`raise` adds 0.06 to the heightfield and 0.03 to crustal thickness, then isostasy, erosion and sea level spend the next fifty ticks disagreeing with it. Meanwhile the tectonics model underneath has Euler poles, boundary classification and crust age that nothing in the toolset can reach.'],
  ['Seeding ignores everything that was just built', '`seedLife(W, cell, W.unlockedClass)` paints an 11.5° blotch of whatever class is unlocked. Behind it now sit a redox tower of metabolic guilds, a trait vector, a live phylogeny and a set of contingent major transitions — none of which the seed tool knows exist.'],
  ['The economy is off by default', '`budgetMode` starts false, so most players never meet the scarcity that made SimEarth a game. Income is `0.5 + health * 1.5 + meanLife`, computed every tick and, in the default configuration, never read.'],
  ['Consequence is one log line', 'An act writes a `chronLog` entry and diffuses away silently. There is no receipt, no forecast, no attribution, and no way to ask later which gesture started something.'],
  ['XR is a competent prototype of the gesture', 'Grab to spin, squeeze to use the tool at the aim ray, release with velocity to throw a meteor, thumbstick to scale. The stated thesis — hold a planet, shrink, walk in — is currently a joystick axis clamped between 0.07 and 0.95.'],
  ['The science instruments are ahead of the play', 'Core sampler, ice core, diversity curve, Keeling curve, Whittaker diagram, transit spectrum, redox gauge, phylogeny view. The world is now far better at explaining itself than the player is at acting on it, which is exactly the gap this document is for.'],
];

const SEQ = [
  ['Make the hand real', '`brush`, `twohand`, drag verbs, masking, undo, the commit gesture. Every other category routes through the manipulation layer, and it is currently one function with a cosine cutoff. Cheapest block here and the one that changes how everything else feels.'],
  ['Make the world answer', '`receipt`, forecast, attribution, the causal trace, and the planet visibly opposing you. A god game is a conversation; right now only one party speaks.'],
  ['Make the acts reach the causes', '`isoedit`, `plateedit`, `orbit`, `seedguild`, `design`. The simulation grew a great deal of depth recently and the tools are still editing its surface. This is where the recent work gets paid off.'],
  ['Give it a proposition', '`scenario`, `genesis`, `thermo`, and the observer mode. Fifteen coupled systems and a dock full of buttons is not an experience until something asks the player for a thing.'],
  ['Then embodiment and the shelf', '`scale`, the orrery table, `shelf`, and the feel category. These are the items that make it the product the brief describes rather than a very good simulation with a UI.'],
];

/* ------------------------------------------------------------ markdown -- */
function markdown() {
  const L = [];
  L.push('# ORRERY — god-game backlog');
  L.push('');
  L.push(`**${D.length} items.** Generated from \`scripts/godgame.mjs\` — edit that file, not this one, then run \`node scripts/godgame.mjs\`.`);
  L.push('');
  L.push('The fourth backlog. The first covers the systems, the second the worlds, the third the biosphere. This one covers the only part the player actually touches: **what it is to act on a world, and to be answered by it.**');
  L.push('');
  L.push(`Kind: **${count((x) => x.k === 'HAND')}** hand (the act of touching a world), **${count((x) => x.k === 'SYS')}** system (what the simulation does back), **${count((x) => x.k === 'PLAY')}** play (mode, goal, framing). Effort is S/M/L. Impact is 1–3.`);
  L.push('');

  L.push('## Where the god layer actually is');
  L.push('');
  L.push('The simulation moved a long way recently — `redox.js`, `evolve.js`, `carbon.js`, `time.js`, `extinction.js`, `instruments.js`. The player-facing layer did not move with it, and the gap is now the most interesting thing about the codebase.');
  L.push('');
  for (const [a, b] of NOW) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## The critical path');
  L.push('');
  L.push('The capabilities the largest number of other items are waiting on.');
  L.push('');
  L.push('| Capability | Item | Unblocks |');
  L.push('|---|---|---|');
  for (const r of CRITICAL.slice(0, 12)) {
    L.push(`| \`${r.k}\` | ${r.x.id}. ${r.x.t} | ${r.n} items |`);
  }
  L.push('');

  for (const [id, name, blurb] of CATS) {
    const items = byCat(id);
    L.push(`## ${name} — ${items.length}`);
    L.push('');
    L.push(`_${blurb}_`);
    L.push('');
    L.push('| # | Item | Detail | Kind | Effort | Impact |');
    L.push('|---|---|---|---|---|---|');
    for (const x of items) {
      const gives = x.g ? ` <br>gives \`${x.g}\`` : '';
      const needs = x.n?.length ? ` <br>needs ${x.n.map((t) => '`' + t + '`').join(' ')}` : '';
      L.push(`| ${x.id} | **${x.t}**${gives}${needs} | ${x.d} | ${KIND[x.k]} | ${x.e} | ${x.i} |`);
    }
    L.push('');
  }

  L.push('## Sequencing');
  L.push('');
  L.push('Five blocks, in order. Each is worth shipping alone.');
  L.push('');
  SEQ.forEach(([a, b], i) => L.push(`${i + 1}. **${a}.** ${b}`));
  L.push('');
  L.push('The through-line: the simulation is now good enough that the player should be arguing with it rather than painting on it. Almost every item above is a way of turning a one-way write into an exchange.');
  L.push('');

  return L.join('\n');
}

/* ----------------------------------------------------------------- html -- */
function html() {
  const data = JSON.stringify(D.map((x) => ({
    id: x.id, c: x.c, t: x.t, d: x.d, k: x.k, e: x.e, i: x.i, g: x.g || '', n: x.n || [],
  })));
  const cats = JSON.stringify(CATS.map(([id, name, blurb]) => ({ id, name, blurb })));
  const crit = JSON.stringify(CRITICAL.slice(0, 12).map((r) => ({ k: r.k, id: r.x.id, t: r.x.t, n: r.n })));
  const now = JSON.stringify(NOW);
  const seq = JSON.stringify(SEQ);
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ORRERY — 200 ways to act like a god</title>
<style>
:root{
  --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#c89ad6; --accent-soft:rgba(200,154,214,.13); --accent-line:rgba(200,154,214,.34);
  --hand:#e0a050; --hand-soft:rgba(224,160,80,.14);
  --sys:#7fb0e0; --sys-soft:rgba(127,176,224,.14);
  --sans:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
}
@media (prefers-color-scheme: light){
  :root{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
    --text:#12151c; --dim:#4e5768; --faint:#727d90;
    --accent:#7c3d8c; --accent-soft:rgba(124,61,140,.09); --accent-line:rgba(124,61,140,.3);
    --hand:#9a5f14; --hand-soft:rgba(154,95,20,.09); --sys:#215e93; --sys-soft:rgba(33,94,147,.09); }
}
:root[data-theme="dark"]{ --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#c89ad6; --accent-soft:rgba(200,154,214,.13); --accent-line:rgba(200,154,214,.34);
  --hand:#e0a050; --hand-soft:rgba(224,160,80,.14); --sys:#7fb0e0; --sys-soft:rgba(127,176,224,.14); }
:root[data-theme="light"]{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
  --text:#12151c; --dim:#4e5768; --faint:#727d90;
  --accent:#7c3d8c; --accent-soft:rgba(124,61,140,.09); --accent-line:rgba(124,61,140,.3);
  --hand:#9a5f14; --hand-soft:rgba(154,95,20,.09); --sys:#215e93; --sys-soft:rgba(33,94,147,.09); }

*{box-sizing:border-box;}
body{margin:0; background:var(--ground); color:var(--text);
     font:400 16px/1.6 var(--sans); -webkit-font-smoothing:antialiased;}
.wrap{max-width:1080px; margin:0 auto; padding:40px 26px 110px;}

header{border-bottom:1px solid var(--rule); padding-bottom:28px;}
.eyebrow{font:500 10.5px/1 var(--mono); letter-spacing:.24em; text-transform:uppercase; color:var(--accent);}
h1{font:700 clamp(34px,5.4vw,54px)/1.03 var(--sans); letter-spacing:-.035em; margin:15px 0 0; text-wrap:balance;}
.sub{font:italic 400 clamp(17px,2.2vw,21px)/1.45 var(--serif); color:var(--dim);
     margin:18px 0 0; max-width:48ch;}
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
button.f.hand[aria-pressed="true"]{background:var(--hand-soft); border-color:var(--hand); color:var(--hand);}
button.f.sys[aria-pressed="true"]{background:var(--sys-soft); border-color:var(--sys); color:var(--sys);}
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
.tag.hand{background:var(--hand-soft); color:var(--hand); border-color:var(--hand);}
.tag.sys{background:var(--sys-soft); color:var(--sys); border-color:var(--sys);}
.tag.play{background:transparent; color:var(--dim); border-color:var(--rule);}
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
  <div class="eyebrow">Backlog four · the god layer</div>
  <h1>200 ways to act like a god</h1>
  <p class="sub">The simulation now argues with itself in fifteen coupled systems. The player still
  paints on it with one brush and a cosine falloff. This is the list that closes that gap.</p>
  <p class="nav"><a href="./">Pitch</a> · <a href="backlog.html">Systems</a> ·
  <a href="worlds.html">Worlds</a> · <a href="evolution.html">Evolution</a> ·
  <a href="next.html">Next 200</a> ·
  <a href="tides-weather.html">Tides &amp; weather</a> · <a href="geology.html">Geology</a> · <a href="exoparams.html">Real parameters</a> · <a href="living.html">Alive</a> · <a href="currents.html">Currents</a> ·
  <a href="realism.html">Realism</a> · <a href="life.html">Life</a> · <a href="surface.html">Surface</a> · <a href="worldspace.html">World space</a> · <a href="openworld.html">Open world</a> · <a href="../vr/">Prototype</a></p>
  <dl class="tally">
    <div><dt>Items</dt><dd>200<small>15 categories</small></dd></div>
    <div><dt>Kind</dt><dd>${count((x) => x.k === 'HAND')}/${count((x) => x.k === 'SYS')}/${count((x) => x.k === 'PLAY')}<small>hand · system · play</small></dd></div>
    <div><dt>Impact 3</dt><dd>${count((x) => x.i === 3)}<small>of 200</small></dd></div>
    <div><dt>Effort</dt><dd>${count((x) => x.e === 'S')}/${count((x) => x.e === 'M')}/${count((x) => x.e === 'L')}<small>S / M / L</small></dd></div>
  </dl>
</header>

<div class="prose">
  <h2>Where the god layer actually is</h2>
  <p>The simulation moved a long way recently. The player-facing layer did not move with it, and
  the gap is now the most interesting thing about the codebase.</p>
  <ul class="state" id="now"></ul>

  <h2 style="margin-top:40px">The critical path</h2>
  <p>The capabilities the largest number of other items wait on.</p>
  <table class="crit"><tbody id="crit"></tbody></table>
</div>

<div class="controls">
  <div class="filters">
    <span class="flabel">Kind</span>
    <button class="f hand" data-k="k" data-v="HAND" aria-pressed="false">Hand</button>
    <button class="f sys" data-k="k" data-v="SYS" aria-pressed="false">System</button>
    <button class="f" data-k="k" data-v="PLAY" aria-pressed="false">Play</button>
    <span class="flabel" style="margin-left:9px">Effort</span>
    <button class="f" data-k="e" data-v="S" aria-pressed="false">S</button>
    <button class="f" data-k="e" data-v="M" aria-pressed="false">M</button>
    <button class="f" data-k="e" data-v="L" aria-pressed="false">L</button>
    <span class="flabel" style="margin-left:9px">Impact</span>
    <button class="f" data-k="i" data-v="3" aria-pressed="false">3</button>
    <button class="f" data-k="i" data-v="2" aria-pressed="false">2</button>
    <button class="f" data-k="i" data-v="1" aria-pressed="false">1</button>
    <input id="q" type="search" placeholder="Search 200 items…" aria-label="Search items">
  </div>
  <div class="tally2" id="shown"></div>
</div>

<div id="list"></div>

<div class="prose" style="margin-top:56px">
  <h2>Sequencing</h2>
  <p>Five blocks, in order. Each is worth shipping alone.</p>
  <ol class="seq" id="seq"></ol>
  <p style="margin-top:16px">The through-line: the simulation is now good enough that the player
  should be arguing with it rather than painting on it. Almost every item above is a way of turning
  a one-way write into an exchange.</p>
</div>

<footer>
  Generated from <code>scripts/godgame.mjs</code> — edit the source and re-run, do not edit the output.<br>
  SimEarth is a trademark of Electronic Arts; WorldBox of Maxim Karpenko. Referenced as prior art only.
</footer>
</div>

<script>
"use strict";
var DATA = ${data};
var CATS = ${cats};
var CRIT = ${crit};
var NOW = ${now};
var SEQ = ${seq};
var KLABEL = {HAND:'Hand', SYS:'System', PLAY:'Play'};
var active = {k:new Set(), e:new Set(), i:new Set()};
var query = '';
var listEl = document.getElementById('list');
var shownEl = document.getElementById('shown');

function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

document.getElementById('now').innerHTML = NOW.map(function(r){
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
      var cls = o.k === 'HAND' ? 'hand' : o.k === 'SYS' ? 'sys' : 'play';
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
await writeFile(join(ROOT, 'briefs', 'godgame-backlog.md'), markdown() + '\n');
await writeFile(join(ROOT, 'site', 'godgame.html'), html());

console.log(`godgame: ${D.length} items across ${CATS.length} categories`);
for (const [id, name] of CATS) console.log(`  ${String(byCat(id).length).padStart(3)}  ${name}`);
console.log(`\nkind     hand ${count((x) => x.k === 'HAND')} · system ${count((x) => x.k === 'SYS')} · play ${count((x) => x.k === 'PLAY')}`);
console.log(`effort   S ${count((x) => x.e === 'S')} · M ${count((x) => x.e === 'M')} · L ${count((x) => x.e === 'L')}`);
console.log(`impact   3 ${count((x) => x.i === 3)} · 2 ${count((x) => x.i === 2)} · 1 ${count((x) => x.i === 1)}`);
console.log('\ncritical path:');
for (const r of CRITICAL.slice(0, 12)) {
  console.log(`  ${String(r.n).padStart(3)}  ${r.k.padEnd(10)} ${r.x.t}`);
}
const unmet = new Set();
for (const x of D) for (const t of x.n || []) if (!provides.has(t)) unmet.add(t);
if (unmet.size) console.log(`\nWARNING unmet tokens: ${[...unmet].join(', ')}`);
console.log('\nwrote briefs/godgame-backlog.md and site/godgame.html');
