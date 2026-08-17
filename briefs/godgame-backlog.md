# ORRERY — god-game backlog

**200 items.** Generated from `scripts/godgame.mjs` — edit that file, not this one, then run `node scripts/godgame.mjs`.

The fourth backlog. The first covers the systems, the second the worlds, the third the biosphere. This one covers the only part the player actually touches: **what it is to act on a world, and to be answered by it.**

Kind: **56** hand (the act of touching a world), **51** system (what the simulation does back), **93** play (mode, goal, framing). Effort is S/M/L. Impact is 1–3.

## Where the god layer actually is

The simulation moved a long way recently — `redox.js`, `evolve.js`, `carbon.js`, `time.js`, `extinction.js`, `instruments.js`. The player-facing layer did not move with it, and the gap is now the most interesting thing about the codebase.

- **Seventeen tools, one code path.** Every god act is an entry in `TOOLS` with a hand-written integer cost, dispatched through a `switch` in `useToolAt`. Fourteen of the seventeen fire once and mutate a field directly. There is no brush state, no drag, no preview, no undo.
- **One brush, one falloff.** `paintBrush(cell, fn, radius)` takes a cosine threshold at `radius * 0.04` radians and hands the callback a linear falloff. It is the whole of the manipulation layer, and it is called by four tools.
- **Sculpting edits the output.** `raise` adds 0.06 to the heightfield and 0.03 to crustal thickness, then isostasy, erosion and sea level spend the next fifty ticks disagreeing with it. Meanwhile the tectonics model underneath has Euler poles, boundary classification and crust age that nothing in the toolset can reach.
- **Seeding ignores everything that was just built.** `seedLife(W, cell, W.unlockedClass)` paints an 11.5° blotch of whatever class is unlocked. Behind it now sit a redox tower of metabolic guilds, a trait vector, a live phylogeny and a set of contingent major transitions — none of which the seed tool knows exist.
- **The economy is off by default.** `budgetMode` starts false, so most players never meet the scarcity that made SimEarth a game. Income is `0.5 + health * 1.5 + meanLife`, computed every tick and, in the default configuration, never read.
- **Consequence is one log line.** An act writes a `chronLog` entry and diffuses away silently. There is no receipt, no forecast, no attribution, and no way to ask later which gesture started something.
- **XR is a competent prototype of the gesture.** Grab to spin, squeeze to use the tool at the aim ray, release with velocity to throw a meteor, thumbstick to scale. The stated thesis — hold a planet, shrink, walk in — is currently a joystick axis clamped between 0.07 and 0.95.
- **The science instruments are ahead of the play.** Core sampler, ice core, diversity curve, Keeling curve, Whittaker diagram, transit spectrum, redox gauge, phylogeny view. The world is now far better at explaining itself than the player is at acting on it, which is exactly the gap this document is for.

## The critical path

The capabilities the largest number of other items are waiting on.

| Capability | Item | Unblocks |
|---|---|---|
| `notice` | 138. Make them notice you | 13 items |
| `scenario` | 112. A scenario format | 12 items |
| `shelf` | 166. A shelf of worlds | 11 items |
| `genesis` | 59. A world-authoring pass before you press play | 10 items |
| `receipt` | 86. Every act gets a receipt | 10 items |
| `brush` | 1. A brush with a real profile | 7 items |
| `scale` | 152. Two-handed scale as the primary verb | 5 items |
| `thermo` | 99. Cost from thermodynamics, not a hand-written table | 4 items |
| `design` | 45. An organism designer | 3 items |
| `twohand` | 3. Two-handed gestures as the core grammar | 2 items |
| `isoedit` | 15. Sculpt the cause, not the elevation | 2 items |
| `plateedit` | 16. Take hold of a plate and set its pole | 2 items |

## The hand: direct manipulation — 14

_Every god act currently routes through one function — `paintBrush`, a cosine cutoff with linear falloff — and fires once per click. The verb grammar of touching a planet is where this product either feels like divinity or like a paint program with a space theme._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 1 | **A brush with a real profile** <br>gives `brush` | `paintBrush(cell, fn, radius)` takes a cosine threshold and hands the callback a linear falloff. Give it an editable profile curve, a rate applied per frame rather than per click, a hardness, and a preview ring drawn on the terrain before you commit. Every tool below inherits whatever this becomes, so it is worth over-building. | Hand | M | 3 |
| 2 | **Brush size that means something at each tier** <br>needs `brush` | `radius * 0.04` radians is a continent from orbit and invisible from the ground. Bind brush extent to real surface distance and show it in kilometres, so the same gesture is a mountain range at one scale and a hillside at another — and the player learns the planet’s size by working on it. | Hand | S | 3 |
| 3 | **Two-handed gestures as the core grammar** <br>gives `twohand` | One hand holds the world, the other acts on it. Pull apart to rift, push together to collide, twist to shear, cup to gather. Almost every geological verb is naturally bimanual, and the current one-hand-spins-one-hand-shoots split wastes the headset’s best affordance. | Hand | L | 3 |
| 4 | **Continuous drag verbs, not click-once** <br>needs `brush` | `useToolAt` fires a discrete event per press. Sculpting wants a held gesture that accumulates while you drag — carving a valley in one stroke, dragging a coastline out, smearing ice across a pole. It is the difference between stamping and drawing. | Hand | M | 3 |
| 5 | **Undo the act, not the years** | A god can take back a gesture; nobody can take back the four hundred thousand years that passed while the consequences propagated. Offer an undo that reverts the direct edit and explicitly does not rewind the simulation, and the asymmetry teaches the game’s whole thesis in one interaction. | Hand | M | 3 |
| 6 | **A commit gesture for irreversible acts** | The planet buster currently guards itself with `window.confirm()`. Irreversible acts deserve a physical commitment — hold both hands on it, or press and hold while a ring fills. The friction is the point, and it makes the act feel like a decision rather than a misclick. | Hand | S | 3 |
| 7 | **Snap to features** <br>needs `brush` | The brush should know when it is over a plate boundary, a coastline, a river, a caldera or a biome edge, and offer to align to it. Most of what a player wants to do geologically is relative to a feature the simulation has already identified. | Hand | M | 2 |
| 8 | **Symmetry, repetition and stroke tools** <br>needs `brush` | Mirror across the equator, repeat around a latitude circle, extrude along a great circle. A sphere has strong natural symmetries and giving the player access to them turns twenty minutes of clicking into one gesture. | Hand | M | 2 |
| 9 | **Masking by field** <br>needs `brush` | Apply this brush only where moisture is below 0.2, or only below the snow line, or only on continental crust. It is a small addition to the brush callback and it converts blunt instruments into precise ones without adding a single new tool. | Hand | S | 3 |
| 10 | **The terminator as an instrument** | Grab the day–night line and drag it to change rotation rate, watching the Coriolis banding reorganise as you do. Making an abstract parameter into a thing you can physically take hold of is the clearest single expression of the "every number is a place" rule. | Hand | M | 3 |
| 11 | **The planet should resist being spun** | `qmul(S.q, tmpQ, S.q)` maps hand rotation straight onto the world with no inertia. Give the sphere angular momentum and a little damping and it acquires mass — the cheapest possible way to make a rendered ball feel like 6×10²⁴ kg. | Hand | S | 3 |
| 12 | **A haptic vocabulary** | Sculpting rock, parting water, seeding life and killing something should each have a distinct signature in the controller — grain, resistance, release. Haptics are the only channel that can tell the hand what a tool is doing without taking the eyes off the world. | Hand | M | 2 |
| 13 | **A precision mode for gardening** <br>needs `brush` | Slow, small, exact — for when the player is tending rather than smiting. It should have its own posture: bring the planet close, and the brush automatically becomes fine. Most long-session play is gardening, and every tool in the build is currently sized for smiting. | Hand | M | 3 |
| 14 | **Tool state survives a scale change** | Shrinking into the surface with a brush selected should keep the brush, resized to the new tier, rather than dropping you into a different interaction model. Continuity across the scale gesture is what makes the four tiers one place instead of four screens. | Hand | S | 1 |

## Sculpting the land — 15

_Raise and lower push the heightfield by ±0.06 and let erosion sort it out. But the geosphere underneath is now a real plate model with Euler poles, isostasy and crustal thickness — which means the sculpting tools are editing the output of a simulation that already knows better._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 15 | **Sculpt the cause, not the elevation** <br>gives `isoedit` | `raise` adds 0.06 to `h[c]` and 0.03 to `crust[c]`, then isostasy spends the next fifty ticks arguing with it. Let the tool edit crustal thickness and density directly and have elevation emerge, so the mountain you build subsides correctly and erodes into a plateau the way a real one does. | System | M | 3 |
| 16 | **Take hold of a plate and set its pole** <br>gives `plateedit` | Every plate already has an Euler pole and an angular velocity. Grabbing one and redirecting it is the single most god-like act available in a tectonics model, and it turns the next two hundred million years of the run into a consequence of one gesture. | System | M | 3 |
| 17 | **Draw a rift with a two-handed pull** <br>needs `plateedit` `twohand` | Set both hands on a continent and pull. Crust thins, the floor drops below sea level, water comes in, and a new spreading centre begins producing ocean floor with an age gradient. Watching Pangaea come apart because you pulled it is a headline moment that the tectonics code can already almost deliver. | Hand | M | 3 |
| 18 | **Push two continents together and get real orogeny** <br>needs `plateedit` | Convergence between two continental plates produces thickening rather than subduction. The model knows this; the tool should let the player cause it, and then leave a range that has an age, a root, and a predictable erosional future. | System | M | 3 |
| 19 | **Place a mantle plume in the mantle frame** | Hotspots are fixed while plates move over them, which is why island chains have an age gradient. Letting the player drop one and then come back in fifty million years to find a chain is one of the most satisfying delayed payoffs in the whole system. | System | S | 3 |
| 20 | **Paint crust type** <br>needs `isoedit` | Continental or oceanic, with the density difference that decides which one subducts. It is a one-byte-per-cell edit that determines the shape of everything for the next half-billion years, and it makes the player’s choices geological rather than cosmetic. | System | S | 2 |
| 21 | **Carve a river and hand it to the flow model** | Drag downhill and cut a channel; the D8 routing then adopts it, accumulates discharge into it, and either keeps it or abandons it depending on whether it made sense. A tool that can be overruled by the simulation is more interesting than one that cannot. | Hand | M | 3 |
| 22 | **Open and close ocean gateways** | The Isthmus of Panama, the Drake Passage, the closing of Tethys — a few cells of land or sea that reorganise global circulation and, through it, climate and biogeography. The highest consequence-per-edit ratio anywhere on the map, and the model already has the currents to respond. | System | M | 3 |
| 23 | **Sea level as a lever with the ice budget answering** | Pull sea level up and the water has to come from somewhere — thermal expansion, or melted land ice, with the isostatic rebound that follows. A lever that forces the player to confront a conservation law is worth more than one that just moves a number. | System | M | 3 |
| 24 | **Freeze or accelerate erosion locally** | Hold a canyon open, or let ten million years of stream power run in one tick. It is a time tool disguised as a terrain tool and it is the fastest way to show a player that the landscape they are looking at is a process rather than a mesh. | System | M | 2 |
| 25 | **Terrain stamps with geological grammar** | Shield, craton, volcanic arc, trench, rift valley, impact basin — not brush shapes but assemblies that set crust type, thickness, age and rock type coherently. It gives a player who does not know geology a way to make terrain that is nonetheless correct. | Hand | M | 2 |
| 26 | **Sculpt underwater** | Seventy-one per cent of the surface is bathymetry and the current tools effectively cannot reach it — you cannot see what you are doing under the ocean shell. Ocean floor is where half the tectonic story happens and it should be as editable as the land. | Hand | M | 3 |
| 27 | **Preview the isostatic answer before committing** <br>needs `isoedit` | Show the settled elevation, not the instantaneous one, as a ghost while the brush is held. Sculpting a system with a delayed response is guesswork without it, and the preview is also a free lesson in how isostasy works. | Hand | M | 3 |
| 28 | **Let the planet resist** | Holding a mountain above its isostatic equilibrium should cost energy every tick, not once. The most important thing a god game can teach about a planet is that it has opinions, and the sculpting tools are where that lesson is cheapest to deliver. | System | M | 3 |
| 29 | **Paint regolith and soil** | Soil depth already drives fertility through `nutrientN`. Being able to lay down or strip soil is a genuinely different verb from moving rock — slower, subtler, and the one that actually decides whether anything will grow there. | System | S | 2 |

## Climate levers — 14

_Solar, tilt and spin are three scalars nudged by a fixed delta. The climate model behind them handles orbital forcing, aerosols, escape and a weathering thermostat. The levers should reach the causes rather than the symptoms._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 30 | **An orbital element editor you can hold** <br>gives `orbit` | Semi-major axis, eccentricity, obliquity, precession phase — as a physical orrery you reach into rather than three tools that add a fixed delta. Milankovitch forcing is already in the atmosphere tick; this exposes its causes instead of its symptoms. | Hand | M | 3 |
| 31 | **Move the planet’s orbit and argue with the habitable zone** <br>needs `orbit` | Drag the world inward until the oceans boil, or outward until it snowballs, and watch the weathering thermostat try to compensate on its own timescale. It is the most direct possible demonstration of what "habitable zone" actually means. | System | M | 3 |
| 32 | **Aerosol injection with a real decay curve** | `gases.sulphate` decays at 0.992 per tick with no spatial structure. A stratospheric injection should be hemispherically asymmetric, peak after a season, and fade over two to three years — which turns geoengineering from a slider into an event with a shape. | System | M | 3 |
| 33 | **Paint albedo directly** | Whiten a desert, blacken an ice sheet. It is the crudest possible climate intervention, it is exactly what Daisyworld is about, and it lets a player discover ice–albedo feedback by falling into it rather than being told. | Hand | S | 3 |
| 34 | **A solar shade at L1** | A statite that removes a percentage of incoming flux with no chemistry involved. It is the cleanest experimental control in the game — change one term in the energy budget and nothing else — and it is the intervention every real geoengineering discussion starts with. | System | S | 2 |
| 35 | **A greenhouse mixing board** | Every gas as a fader with the resulting radiative forcing shown live, rather than two "inject" buttons that add 0.02. `greenhouseFromGases` already computes log forcing per species; surfacing it turns the atmosphere from a black box into an instrument panel. | Hand | M | 3 |
| 36 | **Cloud seeding, and how little it does** | Ship the tool and let it underperform. A god tool that is honestly weak is more instructive than one that works, and cloud feedbacks are the largest genuine uncertainty in real climate models — which is a thing worth putting in a player’s hands. | System | S | 1 |
| 37 | **Re-route an ocean current** | Drag a gyre, or break the conveyor by freshening the North Atlantic analogue. The thermohaline regime states are already implemented with a shutdown condition; giving the player a way to trip it deliberately makes the model’s scariest behaviour reachable. | System | M | 3 |
| 38 | **Trigger or suppress a glaciation** <br>needs `orbit` | Nudge obliquity and precession into a configuration that starts ice growth, then watch it run away on its own. The interesting part is that the trigger is small and the response is enormous, which is a lesson no amount of text delivers as well. | System | M | 3 |
| 39 | **Set the magnetosphere and watch the air leave** | `magnetosphere` is a per-ruleset constant feeding an escape term. Making it a lever means the player can strip a planet slowly and deliberately, over tens of millions of years, which is a completely different register of destruction from an impact. | System | S | 3 |
| 40 | **The Moon as a tidal and stability lever** | Mass and distance, driving tidal heating, day length and — most importantly — obliquity stability. Earth’s axis is steady because of the Moon; removing it should let the tilt wander chaotically, which is one of the most under-appreciated facts about why this planet works. | System | M | 3 |
| 41 | **An honest thermostat override** | A pin-the-temperature cheat, clearly labelled as a cheat, that disables the run from counting toward anything. Players will want to hold conditions steady while they study something else, and providing it openly is better than watching them fight the model to do it. | Play | S | 2 |
| 42 | **Weather at the local tier** | Make it rain on one valley. At the scale where the player is standing on the ground, the god verbs should shrink to match — a storm, a frost, a drought over a single basin, all feeding back into the same fields. | Hand | M | 3 |
| 43 | **Every climate lever has a settling time you must wait out** | Ocean thermal inertia is decades, ice sheets are millennia, the weathering thermostat is hundreds of thousands of years. Make the tool tell you which one you have just pulled, and the player learns the hierarchy of timescales by being made to wait in it. | System | M | 3 |

## Seeding and gardening life — 15

_The single most-requested god verb, and the one the recent biosphere work most changes. `seedLife` paints an 11.5° blotch of whatever class happens to be unlocked. There is now a trait vector, a phylogeny and a redox tower to seed *into*._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 44 | **Seed a guild, not a class index** <br>gives `seedguild` | `seedLife(W, cell, W.unlockedClass)` paints an 11.5° blotch of whatever rung is currently unlocked. With the redox tower in place the player should be choosing a metabolism — methanogens, anoxygenic phototrophs, iron oxidisers — and the choice should determine what the planet becomes. | System | M | 3 |
| 45 | **An organism designer** <br>gives `design` <br>needs `seedguild` | Set the trait vector directly: body mass, thermal optimum and breadth, desiccation tolerance, dispersal, reproductive strategy. Then release it and find out whether the planet agrees. This is the single most requested thing a god game about life can offer and the trait system now exists to support it. | Hand | L | 3 |
| 46 | **Transplant a lineage** <br>gives `transplant` <br>needs `design` | Pick up a clade from one continent and put it on another. Biogeography is currently something that happens to the player; this makes it something they can do, with all the invasive-species consequences that follow. | Hand | M | 3 |
| 47 | **Force a major transition, at a price** <br>needs `seedguild` | Buy the mitochondrion. Buy multicellularity. The transitions are contingent gates with real preconditions — letting the player pay to force one, at a cost that scales with how unready the world is, makes the gates legible without making them automatic. | System | M | 3 |
| 48 | **Directed selection** <br>needs `design` | Point at a trait and push it — larger, colder-tolerant, faster-dispersing — and watch the correlated costs appear elsewhere in the vector. It is animal breeding at planetary scale and it teaches trade-offs better than any tooltip. | System | M | 3 |
| 49 | **Declare a refuge** | Mark a region where extinction is suppressed. It is a defensive god power, which the toolset currently has none of, and it sets up the most interesting failure mode in the genre: the preserve that survives and the world outside it that does not. | System | M | 3 |
| 50 | **Cull precisely** | The `plague` scalar multiplies life by 0.55 at random. Let the player name a clade and remove it, then watch the food web restructure around the hole. Precision makes extinction a scalpel rather than a blunt instrument, and a scalpel is far more disturbing. | System | M | 3 |
| 51 | **Introduce an invasive and watch the web fail** <br>needs `transplant` | A generalist with no local predators, dropped onto an island with high endemism. The trophic link matrix should do the rest. It is the clearest demonstration available that ecosystems are structures rather than piles. | System | M | 3 |
| 52 | **Terraform toward a target biome, and be told what is missing** | Pick "temperate forest" for a region and have the game report the gap — not enough rainfall, wrong soil, no ozone, no lineage in range with the right traits. A goal-directed tool that answers with a diagnosis is worth ten tools that just apply an effect. | Play | M | 3 |
| 53 | **Panspermia between your own worlds** <br>needs `shelf` | Take a lineage from one planet in the orrery and seed it onto another. Two worlds sharing one phylogenetic tree is a striking object, and it is the payoff for having a catalogue rather than a single world. | System | M | 2 |
| 54 | **Revive from the fossil record** | Core a rock layer, find a lineage, bring it back. It closes the loop between the instruments and the tools, gives the stratigraphy a gameplay purpose, and raises the obvious question of whether a four-hundred-million-year-old organism has anywhere left to live. | Play | M | 3 |
| 55 | **Force a symbiosis** <br>needs `design` | Merge two lineages into one. Endosymbiosis is how eukaryotes happened, it is the least intuitive major transition, and being able to perform it by hand is the fastest way to understand what it actually was. | System | M | 2 |
| 56 | **Set the mutation rate** | Turn evolution’s clock speed up and watch adaptation outrun stability, or down and watch lineages fail to track a changing climate. One number, two opposite failure modes, and a very direct feel for what mutation–selection balance means. | System | S | 2 |
| 57 | **A gardening posture, with tools sized for it** <br>needs `brush` | Most of the hours a player spends with a living planet are spent tending it — nudging a range, encouraging a bloom, thinning a monoculture. The entire current toolset is sized for catastrophe and there is nothing between "seed a continent" and "delete". | Hand | M | 3 |
| 58 | **Let life refuse, and say why** | A seed dropped where the photon flux is too low, the acceptor is absent or the UV is lethal should fail and report the reason. `alienTick` already computes a sterility cause. Surfacing it turns every failed attempt into a lesson rather than a dud click. | System | S | 3 |

## The genesis toolkit — 13

_Before you press play, you are a different kind of god — the one who sets the constants. Currently that is a ruleset dropdown and a reseed button. This is the cheapest category to build and one of the most replayable._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 59 | **A world-authoring pass before you press play** <br>gives `genesis` | Currently: pick one of five rulesets or one of 120 catalogue bodies, and reseed. A genesis screen where the player sets the constants themselves is a second, quieter kind of god-play, and it is the cheapest replayability in the entire product. | Play | M | 3 |
| 60 | **A star picker with real spectra** <br>needs `genesis` | Effective temperature, radius, mass, age — and therefore insolation, sky colour, photon flux in the photosynthetic band, flare rate and XUV history. One choice at genesis that reaches into six systems downstream. | Play | M | 3 |
| 61 | **Bulk composition and volatile inventory** <br>needs `genesis` | Iron fraction sets the core and the magnetic field; water inventory decides between a desert, an Earth and an ocean world; the volatile budget decides whether there is an atmosphere at all. Three sliders that produce genuinely different planets rather than reskins. | Play | M | 3 |
| 62 | **Draw the initial plate configuration** <br>needs `genesis` | Number of plates, and where the first supercontinent sits. The Wilson cycle will take it from there. Being handed a blank sphere and asked to place the continents is an unusually strong opening beat. | Hand | M | 2 |
| 63 | **A moon system builder** <br>needs `genesis` | Count, mass and distance, driving tides, obliquity stability and the night sky. It is also the cheapest way to make the view from the surface differ dramatically between worlds. | Play | M | 1 |
| 64 | **Start anywhere on the timeline** <br>needs `genesis` | Begin at the Cambrian, or at the Permian boundary, or ten thousand years before the present. The deep-time clock and the ICS chart already exist; letting the player skip to the era they want removes the single largest barrier to a short session. | Play | M | 3 |
| 65 | **Randomise within constraints** <br>needs `genesis` | "Surprise me, but keep it habitable" — or explicitly not. Constrained randomness is what makes a generator feel like a collaborator rather than a dice roll, and it is how most players will actually find the worlds they love. | Play | S | 2 |
| 66 | **Import a real body, then break it** <br>needs `genesis` | Load Venus from the catalogue and give it Earth’s rotation rate. Load Mars and triple its mass. The catalogue currently produces read-only worlds; making them a starting point rather than a destination doubles what it is worth. | Play | S | 3 |
| 67 | **A world is a seed string** | Genesis parameters plus RNG seed plus intervention log, encoded compactly enough to paste into a message. It is the sharing primitive the whole product needs and it costs almost nothing once the RNG is properly seeded. | Play | M | 3 |
| 68 | **"What if" presets** <br>needs `genesis` | Earth without the Moon. Earth with 35% oxygen. Earth with no plate tectonics. Each is a one-parameter change from a well-calibrated baseline and each produces a world that is recognisably wrong in an instructive way. | Play | S | 3 |
| 69 | **A twin-world control** <br>needs `genesis` | Generate two identical planets, change exactly one variable, and run them side by side. It is the scientific method as a game mode, and it is the strongest possible argument that the simulation is a model rather than a story. | Play | M | 3 |
| 70 | **Difficulty as physical parameters** <br>needs `genesis` | Not a multiplier on a health bar — a dimmer star, a thinner atmosphere, a weaker magnetic field, a shorter window before the sun brightens. Difficulty that is made of the same stuff as the simulation is difficulty a player can reason about. | Play | S | 2 |
| 71 | **Name your world, and let the name travel** | Into the chronicle, the exported paper, the era names, the clade names, the shared seed string. It costs nothing and it is the difference between "the simulation" and "my planet". | Play | S | 2 |

## Disasters, honestly — 14

_The acquisition channel, and the category most likely to be built badly. WorldBox’s palette is the first impression; the difference here is that every disaster should be a parameterised physical event whose aftermath is the actual content._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 72 | **The impactor, parameterised** <br>gives `impactor` | `applyImpact(cell, power)` takes one scalar. Give it mass, velocity, density and — critically — impact angle, because an oblique strike produces an asymmetric ejecta pattern and a very different climate outcome. Chicxulub’s angle is why it was as bad as it was. | System | M | 3 |
| 73 | **Show the consequence chain as it propagates** <br>needs `impactor` `receipt` | Thermal pulse, then ejecta reentry heating, then tsunami, then dust, then years of cold, then acid rain, then recovery. Each arriving in order with its own timescale. The chain *is* the drama; a single flash and a lower life number is not. | System | M | 3 |
| 74 | **Large igneous provinces as a placeable multi-million-year event** | The Siberian Traps erupted for roughly a million years and killed 81% of marine species — not through the lava but through what it cooked on the way up. A disaster that unfolds over a thousand ticks is a completely different play experience from one that resolves instantly. | System | M | 3 |
| 75 | **A nearby supernova or gamma-ray burst** | Strips ozone, spikes surface UV, and leaves the ocean untouched below a few metres. It is the one catastrophe that discriminates precisely between the marine and terrestrial biosphere, which makes it a genuinely different weapon from everything else in the palette. | System | M | 2 |
| 76 | **A stellar flare with a recovery curve** | Proxima brightened 14,000-fold in the ultraviolet for seven seconds in 2019. Ozone strips in hours and takes years to rebuild, so the damage is a function of flare *frequency* rather than magnitude — which is exactly why M-dwarf habitability is contested. | System | M | 2 |
| 77 | **A clathrate release** | Destabilise the seafloor methane and put thousands of gigatonnes of carbon into the system in under twenty thousand years. The PETM did this and the recovery took a hundred and fifty thousand. It is the disaster whose timescale is closest to the one the player will recognise. | System | M | 3 |
| 78 | **A pathogen with a model behind it** | `W.plague` is a scalar that multiplies life by 0.55 with 3% probability per cell. Give it a host range keyed to the trait vector, a transmission rate, a virulence–transmissibility trade-off, and the ability to burn out or to jump clades. Suddenly it is a strategy rather than a smite. | System | M | 3 |
| 79 | **Every disaster writes into the rock** <br>needs `impactor` | An ejecta layer with an iridium anomaly, a volcanic ash bed, a black shale from an anoxic event. The core sampler already reads strata; making catastrophes deposit their own signature means the player can rediscover their own crimes ten million years later. | System | M | 3 |
| 80 | **State irreversibility before the act, not after** | Some things cannot be undone at any price — a stripped atmosphere, a sterilised biosphere, a lost metabolic pathway. The interface should say so *before* the commit gesture, because a warning after the fact is just a taunt. | Play | S | 3 |
| 81 | **Scale the drama to the tier you are standing at** | From orbit an impact is a bright dot and a spreading grey. From the ground it is a light on the horizon, then silence, then the ground arriving. The same event needs two entirely different presentations and the second one is the reason to build a Local tier at all. | Hand | M | 3 |
| 82 | **The aftermath is the content** | Disaster taxa blooming into the emptiness, ferns and then forests, ten million years of truncated food webs slowly rebuilding. If the recovery is not watchable then the catastrophe was just a number going down, and the whole category is wasted. | System | M | 3 |
| 83 | **Compound disasters** | The end-Permian was volcanism *and* warming *and* anoxia *and* acidification, which is why it was the worst one. Let effects stack and interact rather than resolving independently, and the difference between a bad day and an extinction becomes something the player can engineer. | System | M | 3 |
| 84 | **A disaster forecast that is honestly uncertain** | Show a range, not a number, and let the outcome land somewhere inside it. Every real catastrophe model produces a distribution; presenting one teaches more than a deterministic preview and it makes the big buttons genuinely tense. | Play | M | 2 |
| 85 | **Retire the planet buster, or earn it** | It currently sets every cell to `h -= 0.3 + rand`, `life = 0`, `temp = 1.4` and calls it a moist greenhouse. Either make it a real physical event — a Theia-class impact with an ejecta disc and a possible moon — or remove it, because a joke button in a model this careful undercuts everything around it. | System | M | 2 |

## Consequence and feedback — 13

_The difference between a god game and a toy is whether the world argues. Right now an act logs one chronicle line and the effect diffuses away silently over the next hundred ticks._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 86 | **Every act gets a receipt** <br>gives `receipt` | What you changed, by how much, in what units, and what it is expected to do. `chronLog(W.year, "tool", cell, W.solar, "Solar → 1.09")` is a log line, not a receipt. This is the foundation for the entire category and it is not expensive. | Play | M | 3 |
| 87 | **Forecast before you commit** <br>needs `receipt` | Hold the tool and see the projected effect over the next ten, hundred and thousand ticks as a ghosted curve. Committing blind to an act whose consequences arrive over geological time is not a meaningful decision; it is a coin flip with extra steps. | Play | M | 3 |
| 88 | **Delayed consequences that point back at you** <br>needs `receipt` | When the ice sheet you triggered finally collapses four hundred thousand years later, the notification should name the act that started it. The lag *is* the lesson, and it only lands if the causal link survives the wait. | Play | M | 3 |
| 89 | **Attribute chronicle events to the player by name** <br>needs `receipt` | "The Long Freeze" reads very differently as "The Long Freeze, which you began". The chronicle currently records the world’s history as though nobody were in the room. | Play | S | 3 |
| 90 | **A causal trace from any outcome back to its causes** <br>needs `receipt` | Select an extinction and walk backward through the field values, the thresholds crossed, and the interventions that moved them. It is the same machinery the science instruments need, pointed at the player instead of at the planet. | Play | L | 3 |
| 91 | **The planet should argue** | Silicate weathering opposes a CO₂ injection. Ice–albedo amplifies a cooling. Life colonises the niche you emptied. Making the direction and strength of the response visible turns every act into a conversation rather than a command. | System | M | 3 |
| 92 | **Overshoot warnings** | "You are 0.3 from a snowball you will not be able to reverse." The runaway states already have hysteresis; telling the player where the cliff is, before they are over it, is the difference between a system with tipping points and a system that just breaks. | Play | M | 3 |
| 93 | **Show the counterfactual** <br>needs `receipt` | Run a shadow simulation without the player’s interventions and plot it alongside the real one. It is expensive and it is the single most convincing way to answer "did I actually do anything?" | System | L | 3 |
| 94 | **Make extinction debt visible at the moment you cause it** | The population is already gone; it has not finished yet. Showing the committed loss at the moment of the act, rather than when the last individual dies, is the most important thing this genre can teach and it is currently invisible. | Play | M | 3 |
| 95 | **Let the biosphere look wounded** | Not a lower number — a visibly truncated food web, a monoculture where a forest was, an ocean the wrong colour. Damage should be legible in the view, not in the HUD, because the HUD is where the player is not looking. | Hand | M | 3 |
| 96 | **Signpost second-order effects as second-order** | "The reef died because the ocean acidified because you injected CO₂" is three linked statements, and presenting them as a chain rather than a list is what makes a coupled model comprehensible. | Play | M | 3 |
| 97 | **An attribution fraction** | What proportion of the current state is downstream of the player versus the planet’s own dynamics? One honest number, recomputed continuously, and probably the most uncomfortable readout in the product. | System | L | 2 |
| 98 | **Let the player find out, later, which act started it** | The chronicle should support the question "when did this go wrong" and answer it with a specific gesture, at a specific date, that seemed reasonable at the time. That is the emotional payload the whole simulation exists to deliver. | Play | M | 3 |

## The economy of miracles — 13

_SimEarth charged you for interventions and that scarcity is what made it a game. `budgetMode` is off by default, costs are a hand-written integer per tool, and income is `0.5 + health * 1.5 + meanLife`._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 99 | **Cost from thermodynamics, not a hand-written table** <br>gives `thermo` | `{ id: "meteor", cost: 25 }`. Derive the price from the energy the act actually adds to or removes from the system, in the same units the model uses. Then a small nudge is cheap, a planet-scale change is not, and the economy becomes explicable rather than tuned. | System | M | 3 |
| 100 | **Cheap with the grain, expensive against it** <br>needs `thermo` | Nudging a glaciation that the orbit was already going to produce should cost a fraction of forcing one against the forcing. It rewards understanding the system over brute force, which is the only reward structure that makes a simulation worth learning. | System | M | 3 |
| 101 | **Make biosphere income actually matter** <br>needs `thermo` | `energyIncome = 0.5 + health * 1.5 + meanLife` is computed every tick and, with budget mode off by default, almost never read. If the player’s power comes from the biosphere’s health, then every act of destruction is also an act of self-harm — which is the whole thesis, expressed as an economy. | Play | S | 3 |
| 102 | **Cooldowns on the system’s own timescale** | You should not be able to move the orbit twice in a century. Tie each tool’s recharge to the characteristic time of the system it touches, and the player learns the hierarchy of timescales through their own impatience. | System | M | 3 |
| 103 | **You cannot push a planet faster than it moves** | A hard rate limit on each field, independent of energy. Some things are not expensive, they are impossible, and a god game that has no impossible is a god game with no shape. | System | M | 3 |
| 104 | **Three scarcity modes, honestly labelled** | Free play, budgeted, and a middle where observation is free but intervention is not. Currently it is a toggle that is off by default, which means the intended experience is the one almost nobody sees. | Play | S | 3 |
| 105 | **Bank energy across an era** | Save for a hundred thousand years to afford one enormous act. Deferred gratification at geological scale is a genuinely novel pacing mechanic and it fits the subject matter exactly. | Play | S | 1 |
| 106 | **Show the price before the gesture, not after** | `afford()` silently deducts and returns false with "No energy". The cost, the remaining balance and the projected income should all be visible while the tool is held. | Hand | S | 3 |
| 107 | **Let the player go into debt** | Overspend and the planet pays — the biosphere is drawn down to cover it. It gives the economy teeth without ever blocking an action, which is almost always the better design. | System | M | 2 |
| 108 | **Observation is always free** | Inspect, core, ice core, every instrument, every chart. Charging for looking would be the single fastest way to stop players from learning the model, and the current table gets this right — it should be stated as a principle so it stays right. | Play | S | 3 |
| 109 | **Leverage points cost less** <br>needs `thermo` | The same intervention at a bifurcation is worth a hundred times what it is worth in a stable regime. Pricing that difference — and showing it — turns the game into a hunt for the moment rather than a hunt for the button. | System | M | 3 |
| 110 | **The cost of doing nothing** | Show what the trajectory costs if the player does not act. Inaction is a choice with a price and the interface currently presents it as the absence of one. | Play | M | 2 |
| 111 | **Different archetypes, different economies** | The Gardener earns from biosphere health; the Vandal earns from entropy released; the Scientist earns from measurements taken. Same simulation, three incompatible reward functions, and an enormous amount of replay for very little code. | Play | M | 2 |

## Intent: scenarios and goals — 14

_A sandbox with no proposition is a screensaver with buttons. Scenarios are also the only practical way to teach fifteen coupled systems to somebody who has not read the briefs._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 112 | **A scenario format** <br>gives `scenario` | Initial world state, a stated objective, available tools, a time limit in the world’s own units, and a scoring function. Everything below is data once this exists, which makes it the highest-leverage item in the category by a distance. | Play | M | 3 |
| 113 | **Terraform Mars, properly** <br>needs `scenario` | A real body from the catalogue, a real set of obstacles — no magnetic field, insufficient volatiles, 38% gravity — and no guarantee it can be done. The honest version of the most famous god-game fantasy there is. | Play | M | 3 |
| 114 | **Recreate Earth, and be scored on divergence** <br>needs `scenario` | Start at 4.5 Ga and try to land the Great Oxidation, the Cambrian and the K–Pg within tolerance. It doubles as the regression test for the whole simulation, which means the scenario and the engineering discipline pay for each other. | Play | M | 3 |
| 115 | **Save a doomed world** <br>needs `scenario` | Arrive at a planet already in a moist greenhouse, or a snowball, or with a biosphere in freefall, and find the intervention that works. Rescue is a completely different skill from creation and the current toolset has never been tested against it. | Play | M | 3 |
| 116 | **Grow a biosphere on a hostile world** <br>needs `scenario` | Europa, Titan, an eyeball planet around an M dwarf. The alien-biosphere systems exist; the scenario is what makes a player actually engage with a chemistry that is not Earth’s. | Play | M | 3 |
| 117 | **Hands-off: set the initial conditions and let go** <br>needs `scenario` | One genesis configuration, no interventions, four and a half billion years. It is the purest test of whether the model is generative, and it is a genuinely tense twenty minutes. | Play | S | 3 |
| 118 | **The Fermi scenario** <br>needs `scenario` | Run a whole system of catalogue worlds and see how many produce anything at all. The Gaian bottleneck as a playable proposition rather than a paragraph, and the natural endgame for the orrery view. | Play | M | 2 |
| 119 | **Constraint challenges** <br>needs `scenario` | No impacts. No direct life seeding. Climate levers only. Removing tools is the cheapest way to produce new play out of an existing system, and constraint is what turns a sandbox into a puzzle. | Play | S | 3 |
| 120 | **Twenty-minute historical vignettes** <br>needs `scenario` | The Great Oxidation. Snowball Earth. The end-Permian. Each a set piece with a beginning and an end, playable in one sitting, and each teaching one coupled loop properly. This is how a player who will never read the briefs learns the model. | Play | M | 3 |
| 121 | **Scoring that is not a score** <br>needs `scenario` | Report what the world became — biosphere complexity, time spent regulating, diversity at the end, how much of it was you. Rank on nothing. A number out of a hundred would flatten fifteen coupled systems into a leaderboard and lose everything interesting about them. | Play | M | 3 |
| 122 | **Failure states worth reaching** | A sterile world, a runaway greenhouse, a snowball that never breaks. Each should have a distinct, well-made ending screen with the history that produced it, because a failure the player wants to show someone is not a failure. | Play | M | 3 |
| 123 | **Scenario authoring for players** <br>needs `scenario` | If the format is data, the editor is mostly UI. User-authored challenges are the cheapest long-tail content available and they turn the seed-string sharing item into something worth having. | Play | M | 2 |
| 124 | **A daily world** <br>needs `scenario` | One shared seed, one shared constraint, everyone gets the same planet. It is a well-proven retention mechanic and it costs a seed and a date. | Play | S | 1 |
| 125 | **A campaign that introduces the systems in order** <br>needs `scenario` | Daisyworld for feedback, then the carbon cycle, then the redox tower, then evolution, then the whole coupled thing. Fifteen systems is too many to meet at once, and the current build meets the player with all of them and a dock full of buttons. | Play | M | 3 |

## Watching rather than acting — 12

_Half of what this genre is actually for. The player who leaves it running and comes back in an hour is the one who will still be playing in a month, and almost nothing in the build serves them._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 126 | **Time controls that respect deep time** <br>gives `timeui` | The adaptive clock already runs from 10 Myr per tick to 10 yr per tick. The player needs a control that exposes that — a rate they choose, in years, with the tick length shown, rather than a pause button and whatever the simulation feels like doing. | Hand | M | 3 |
| 127 | **Fast-forward that stops at anomalies** <br>needs `timeui` | Run at maximum rate and halt automatically on a first occurrence, a threshold crossing or an extinction. It is the only way to traverse four billion years without either watching all of it or missing all of it. | Play | M | 3 |
| 128 | **A genuine let-it-run mode** | No dock, no HUD, no tools — the planet, the sound, and the clock. Some of the best hours anyone will spend with this will be spent not touching it, and there is currently no way to have them. | Play | S | 3 |
| 129 | **Autopilot as a character rather than a checkbox** | `W.autopilot` nudges solar by 0.002 and CO₂ by 0.0005 when things drift. Make Gaia an agent with a visible policy, a stated goal and a log of what it did and why — then let the player argue with it, override it, or hand it the planet and watch. | Play | M | 3 |
| 130 | **Cameras that find the interesting thing** | A terminator pass over a storm, a low orbit along a coastline, a slow push into a bloom. The simulation knows where the anomalies are; pointing a camera at them is a small piece of code and a large part of what makes a build look finished. | Hand | M | 3 |
| 131 | **A window seat** | Sit on the surface, at one place, and watch the weather and the seasons go past for a few million years. It is the strongest argument for the Local tier existing and it requires almost nothing beyond a fixed camera and patience. | Play | S | 3 |
| 132 | **An ambient mode** | Something worth leaving on a second monitor. The visual work in the fidelity backlog earns most of its value here, and this is the mode most likely to be the reason somebody shows the product to somebody else. | Play | S | 2 |
| 133 | **Bookmarks you can return to** | The moments system already auto-captures first occurrences. Letting the player mark their own — and jump back to the state, not just the camera — turns a four-billion-year run into something navigable. | Play | M | 3 |
| 134 | **Timelapse export** | A run compressed into thirty seconds, with the era ribbon running underneath. It is the artefact people share, and sharing is the only distribution this kind of project ever gets. | Play | M | 3 |
| 135 | **Notification design for deep time** | What deserves to interrupt, at what tick rate, and what should quietly accumulate in a list. At 10 Myr per tick almost everything is an event; at 10 yr per tick almost nothing is. The threshold has to move with the clock. | Play | M | 2 |
| 136 | **The chronicle as something you read** | `exportChronicle` produces a flat markdown list. A reading mode — typeset, paginated, with the era structure and the figures inline — makes the history of the world an artefact rather than a log file. | Play | M | 2 |
| 137 | **Reward restraint** | A world that reached complexity with almost no intervention is a better outcome than one that was micromanaged there, and nothing in the product currently says so. The observer needs to know that watching is a way of playing, not a failure to. | Play | S | 3 |

## Civilisation and the moral layer — 14

_Deliberately out of scope for the current slice, but this is where the god fantasy stops being about landscaping. The moment the things you made can notice you, every earlier system acquires a second meaning._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 138 | **Make them notice you** <br>gives `notice` | Settlers already raise `build[c]` and found villages. The moment a civilisation registers that its climate excursions correlate with something outside the world, every tool in this document acquires a second meaning. This is the hinge the whole category turns on. | Play | L | 3 |
| 139 | **Prayer and request as an input channel** <br>needs `notice` | They ask for rain, for the ice to stop, for the neighbours to be dealt with. It is the only mechanism in the genre that gives the player a *reason* to intervene that comes from inside the world, and it costs one message queue. | Play | M | 3 |
| 140 | **Worship that responds to what you actually do** <br>needs `notice` | Not a resource — a description. A god who withholds is understood differently from one who intervenes constantly, and the culture that grows around each is different. Let the belief system be an output of the play style. | Play | M | 3 |
| 141 | **Intervention has a cultural cost** <br>needs `notice` | Every miracle makes them more dependent and less capable. The god who saves a civilisation from every drought produces one that cannot survive a drought, which is a genuinely uncomfortable and genuinely true mechanic. | Play | M | 3 |
| 142 | **Sacrifice and bargain** <br>needs `notice` | They offer something to get something. Whether the player accepts, and what the offer does to them, is the most direct moral instrument available and it needs almost no simulation behind it. | Play | M | 2 |
| 143 | **Let them write the chronicle** <br>needs `notice` | The same events, recorded by people who were there and did not understand them — a flood as a punishment, a volcanic winter as a betrayal, an extinction as a myth. Running the history through an unreliable narrator is worth more than any amount of additional accuracy. | Play | M | 3 |
| 144 | **Named individuals whose deaths land** <br>needs `notice` | The entity system already generates names and tracks a birth year. A handful of followed individuals, with lives long enough to care about, converts a population statistic into something the player will hesitate before flooding. | Play | M | 3 |
| 145 | **A technology path made of this planet’s actual geology** <br>needs `notice` | No accessible copper, no bronze age. No Carboniferous coal, no industrial revolution. The ore and carbon burial models already place these; letting them gate a civilisation makes the deep-time geology matter four billion years later. | Play | L | 3 |
| 146 | **They work out their own deep time, and get it wrong** <br>needs `notice` | Their geologists date the planet, misread the record, and revise. Watching a civilisation reconstruct a history the player watched happen is a joke the player is uniquely positioned to enjoy, and it is also a real point about how science works. | Play | M | 2 |
| 147 | **They work out that you exist** <br>needs `notice` | Statistically, eventually, someone notices the anomalies correlate. What they do with that — worship, denial, an attempt to communicate, an attempt to stop you — is the strongest endgame this design has available. | Play | L | 3 |
| 148 | **Let them leave** <br>needs `notice` | A civilisation that gets off the planet has escaped you. In a multi-world orrery it can arrive somewhere else. It is the one outcome that resolves the god relationship rather than continuing it. | Play | L | 2 |
| 149 | **Let them refuse you** <br>needs `notice` | Reject the miracle, reject the god, build the thing you told them not to. Agency that can be pointed back at the player is what separates inhabitants from decoration. | Play | M | 2 |
| 150 | **Their extinction should not read like a bacterial one** <br>needs `notice` | Same mechanism, entirely different presentation. If the chronicle logs the end of a civilisation with the same typography as a guild dying out, the game has quietly said they are equivalent — and it should mean that on purpose or not at all. | Play | M | 3 |
| 151 | **Show the moral weight, do not assign it** <br>needs `notice` | Report what happened and who it happened to. No approval meter, no karma. The genre’s besetting sin is telling the player how to feel about an act the simulation has already made perfectly legible. | Play | M | 3 |

## Scale and embodiment — 14

_The stated thesis — hold a planet, shrink, walk in. XR today is grab-to-spin, squeeze-to-use-tool, throw-to-drop-a-meteor, and a thumbstick that scales the planet. That is a competent prototype of the gesture and not yet the experience._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 152 | **Two-handed scale as the primary verb** <br>gives `scale` <br>needs `twohand` | Pull your hands apart and the planet grows; push them together and it shrinks. Currently scale is a thumbstick axis (`S.scaleXR -= ay * 0.006`). The stated thesis of the product is a scale gesture and it is presently bound to a joystick. | Hand | M | 3 |
| 153 | **The planet in your palm, with weight** <br>needs `scale` | Held, it should have inertia, a slight resistance to being turned, and a haptic hum. It is the first thing anybody will do in the headset and it is the moment the product either lands or does not. | Hand | M | 3 |
| 154 | **Make the transition the experience** <br>needs `scale` | Shrinking from orbit to standing on the ground should be continuous, with the atmosphere thickening, the horizon flattening, the exposure adapting and the sound changing. A jump cut between tiers throws away the single most novel thing this design has. | Hand | L | 3 |
| 155 | **Kneel to look at something small** <br>needs `scale` | At the Local tier the player’s real body position should matter — crouching to look under a canopy, leaning to see into a rock pool. Physical posture as a camera control is free, and it is the reason to be in a headset rather than at a monitor. | Hand | M | 3 |
| 156 | **Hands as weather** | A palm held over a region casts a shadow, cools it, and eventually condenses cloud. It is physically nonsense and it is exactly the kind of nonsense a god game should have, because it makes the connection between body and world immediate. | Hand | M | 2 |
| 157 | **Breath as wind** | The headset knows where your head is; a controller can approximate the rest. Blowing across a planet to move a dust storm is the sort of detail that people describe to other people afterwards. | Hand | M | 1 |
| 158 | **The orrery table** <br>needs `shelf` | A physical surface at waist height with the worlds on it. It gives the whole product a place to be, solves the navigation problem between planets, and is the natural home for the instruments. | Hand | L | 3 |
| 159 | **Reach into the ocean** <br>needs `scale` | Put a hand through the surface and the water should part around it, the temperature should read in the haptics, and whatever lives there should react. Volume — as opposed to surface — is the thing VR does that a screen cannot. | Hand | M | 2 |
| 160 | **Look up from the surface and see yourself** <br>needs `scale` | At the Local tier, the sky should contain an implication of the enormous presence that was holding the planet a moment ago. It is the single image that would sell this product and it is a rendering trick, not a system. | Hand | M | 3 |
| 161 | **Comfort as a hard constraint** | The scale gesture moves the world past the player at high apparent velocity, which is the classic vection trigger. Vignetting, a stable horizon reference, and a comfort setting that does not degrade the experience are not polish items — they decide whether people can use it. | Hand | M | 3 |
| 162 | **Seated and standing parity** | The whole interaction model should work from a chair. Room-scale-only design excludes most of the people who would spend the longest with something this contemplative. | Hand | M | 3 |
| 163 | **Hand tracking without controllers** | Pinch to sculpt, cup to gather, spread to scale. The gesture vocabulary in this category is almost all bare-handed by nature, and controller-free is the mode in which "hold a planet" stops being a metaphor. | Hand | L | 2 |
| 164 | **Decide what a god’s body is** | Hands, or a presence, or nothing at all? The design has not answered this and it determines the shape of every interaction above. Rendered hands are the safe answer; being the weather is the interesting one. | Hand | M | 2 |
| 165 | **Passthrough: the planet on your actual desk** | Mixed reality turns a twenty-minute session into something you can leave running on the table beside you. It is also the cheapest way to get the ambient mode into a space where people will actually keep it. | Hand | M | 2 |

## Many worlds and the orrery — 12

_There are 120 real bodies in the catalogue and the app can hold exactly one at a time. The system view is where a catalogue becomes a collection and a collection becomes a reason to come back._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 166 | **A shelf of worlds** <br>gives `shelf` | The app holds one planet at a time and there are 120 in the catalogue. Persisting several runs simultaneously — visible together, in one space — is the change that makes the catalogue a collection rather than a menu. | Play | L | 3 |
| 167 | **The orrery as the system view** <br>needs `shelf` | The product is named for it. Worlds in their real orbits around a real star, with the habitable zone drawn, and a time control that runs all of them at once. | Play | L | 3 |
| 168 | **Seed one world from another** <br>needs `shelf` | Carry a lineage, a guild, or an atmosphere across. It gives the shelf a mechanic rather than just a display, and it is the natural home for panspermia. | Play | M | 2 |
| 169 | **Run two worlds side by side** <br>needs `shelf` | The twin-world control, in the interface rather than in principle. One variable different, both clocks synchronised, both histories visible. It is the strongest demonstration of causality the product can stage. | Play | M | 3 |
| 170 | **Compare worlds on the same axes** <br>needs `shelf` | Diversity, disequilibrium, mean temperature, time spent regulating. Once several worlds exist, the comparison view is where the catalogue’s scientific claim actually gets made. | Play | M | 3 |
| 171 | **A garden of the ones you have actually run** <br>needs `shelf` | Not the catalogue — the subset the player has personally taken through deep time, with their outcomes. Progress through 120 real bodies is a collection mechanic that happens to also be an education. | Play | M | 3 |
| 172 | **Inherit between runs** <br>needs `shelf` | Carry a clade, a design, or a genesis configuration forward. A small amount of persistence across sessions changes the relationship from "a thing I opened" to "a thing I am doing". | Play | M | 2 |
| 173 | **Rank your worlds by biosignature strength** <br>needs `shelf` | Thermodynamic disequilibrium is already computed. Sorting a shelf of planets by how detectable their life is from a distance is the single most interesting list this product could produce. | Play | S | 3 |
| 174 | **A system-scale energy budget** <br>needs `shelf` `thermo` | One pool across several worlds forces a real strategic choice: tend the promising one, or spread the effort. Scarcity across a portfolio is a completely different game from scarcity within one planet. | Play | M | 2 |
| 175 | **Share a world as a seed and an intervention log** | Small enough to paste, complete enough to reproduce exactly. It is the distribution mechanism, the bug report format, and the scenario format, all at once. | Play | M | 3 |
| 176 | **Continue someone else’s world** | Load their log, then diverge. Asynchronous multiplayer with no server, no lobby and no latency, on a subject where a hundred million years of divergence is the point. | Play | M | 2 |
| 177 | **The collection as the long game** <br>needs `shelf` | Not achievements — a record of which of the real bodies you have taken from formation to whatever they became. It is the meta-structure that gives a sandbox a reason to be opened a fortieth time. | Play | M | 2 |

## Legibility of your own power — 12

_Instruments for the god specifically, as distinct from the science instruments already built. The question this category answers is: how much of what I am looking at is *me*?_

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 178 | **A power meter** <br>gives `attrib` <br>needs `receipt` | How much of this planet’s current state is attributable to the player? One number, continuously recomputed, prominently placed. It is the readout the entire god fantasy is actually about and no god game has ever shown it honestly. | Play | L | 3 |
| 179 | **The intervention log as a document** <br>needs `receipt` | Every act, dated in the world’s own time, with its cost, its intent and its outcome. Separate from the chronicle, because the chronicle is the planet’s history and this is yours. | Play | M | 3 |
| 180 | **Your Earth against the real Earth** | Overlay the actual record — oxygen curve, temperature, diversity, extinction dates — on the player’s run. The calibration harness already needs this comparison; surfacing it costs a chart and it is one of the most compelling things in the product. | Play | M | 3 |
| 181 | **A heatmap of where you have touched** <br>needs `receipt` | Paint the sphere by intervention density. Most players will be astonished by how concentrated their attention has been, and by how much of the world they have never once looked at. | Play | S | 3 |
| 182 | **Show the leverage** | Where would a small act do the most right now? Sensitivity analysis over the field set, rendered as a map. It converts the game from a search for the right button into a search for the right moment and place. | System | L | 3 |
| 183 | **Show the futility** | Where will nothing you do matter? Regions and variables that are locked by their own dynamics. A god game that never says "not this, not now" has no shape, and honesty about powerlessness is more interesting than unlimited power. | System | M | 2 |
| 184 | **Uncertainty bands on every forecast** <br>needs `receipt` | The model is a model. Any projection it offers should come with a range that widens with the horizon, and the player should watch outcomes land inside — and occasionally outside — it. | Play | M | 3 |
| 185 | **The model’s limits, in the game** | `briefs/model-limits.md` exists on disk. Put it in the product, reachable from any instrument, so a player who wonders whether a number is real can find out immediately. Stating the boundary is what earns trust for everything inside it. | Play | S | 3 |
| 186 | **Separate what you did from what it did** <br>needs `attrib` | Two columns in every summary. The most common failure of understanding in this genre is a player taking credit for, or blame for, a dynamic the planet was always going to produce. | Play | M | 3 |
| 187 | **Measure restraint** <br>needs `attrib` | Interventions per million years, energy unspent, time spent observing. Report it without judging it — some of the best runs will have the lowest numbers and the player should be able to see that themselves. | Play | S | 2 |
| 188 | **Which tools you actually use** | A histogram. It is a design instrument as much as a player-facing one, and it will almost certainly reveal that fourteen of the seventeen tools are never touched. | Play | S | 1 |
| 189 | **A scoreboard for style, not success** | Gardener, vandal, scientist, absentee — derived from the intervention log and stated as a description rather than a rank. It tells the player something true about themselves, which is a rarer thing for a game to do than winning. | Play | M | 2 |

## Feel: audio, haptics, ceremony — 11

_Godhood is a feeling before it is a mechanic. `audio.js` is 100 lines of oscillator blips and it is currently the whole of it._

| # | Item | Detail | Kind | Effort | Impact |
|---|---|---|---|---|---|
| 190 | **A sound per act, with mass behind it** | `audio.js` is a hundred lines of oscillator blips. Sculpting rock, parting an ocean, seeding life and ending a lineage should each have a distinct sound with real low end. Weight is carried in audio more than in any other channel. | Hand | M | 3 |
| 191 | **The planet’s own soundscape** | Wind by pressure and speed, ocean by roughness, rain by intensity, ice by mass. A world that sounds different because it *is* different does more for the sense of place than any texture, and every input it needs is already simulated. | Hand | M | 3 |
| 192 | **Silence as a resource** | Airless worlds should be genuinely, uncomfortably silent. A snowball should be muffled. Knowing when to remove sound is most of what separates a designed soundscape from a busy one. | Hand | S | 3 |
| 193 | **Ceremony before the irreversible** | A pause, a change in the light, the ambient sound dropping out. Not a confirmation dialog — a moment. It is the cheapest way to make an act feel like it matters and the current `window.confirm()` is the opposite of it. | Hand | M | 3 |
| 194 | **The first-life moment** | The single most important event in any run, currently a chronicle line and a colour change. It deserves the full apparatus — time slowing, the sound thinning, the camera finding it, and then nothing but the planet for a few seconds. | Hand | M | 3 |
| 195 | **Haptic weight for the sphere** | A low continuous rumble while it is held, modulated by rotation speed. Two lines of code, and it is the difference between holding an object and holding a rendering of one. | Hand | S | 3 |
| 196 | **Music that tracks the era, not the action** | Scored to the geological age rather than to whether something exciting just happened. It reinforces the timescale continuously, which is the hardest thing about this subject to communicate and the thing music is best at. | Hand | M | 2 |
| 197 | **The buster should be hard to do and awful to hear** | If the game keeps a world-ending button, everything about performing it should discourage it — the gesture, the delay, the sound, the aftermath. A destruction that is fun and consequence-free contradicts every other decision in the project. | Hand | S | 2 |
| 198 | **Ceremony in light, not particles** | Big moments should be expressed through exposure, colour temperature and the terminator rather than through sparks. The rendering direction in the fidelity backlog gives all of this for free and it will age far better than an effects layer. | Hand | M | 2 |
| 199 | **Make the quiet acts audible** | Seeding a refuge, letting a bloom spread, choosing not to act. If only the catastrophes have sound design, the game has told the player what it wants them to do, whatever the text says. | Hand | M | 3 |
| 200 | **A finale** | Every run ends — heat death, red giant, a sterile world, or the player putting it down. There should be an ending worth reaching, that gathers the history and hands it over as something to keep. Nothing in the build currently knows how to end. | Play | M | 3 |

## Sequencing

Five blocks, in order. Each is worth shipping alone.

1. **Make the hand real.** `brush`, `twohand`, drag verbs, masking, undo, the commit gesture. Every other category routes through the manipulation layer, and it is currently one function with a cosine cutoff. Cheapest block here and the one that changes how everything else feels.
2. **Make the world answer.** `receipt`, forecast, attribution, the causal trace, and the planet visibly opposing you. A god game is a conversation; right now only one party speaks.
3. **Make the acts reach the causes.** `isoedit`, `plateedit`, `orbit`, `seedguild`, `design`. The simulation grew a great deal of depth recently and the tools are still editing its surface. This is where the recent work gets paid off.
4. **Give it a proposition.** `scenario`, `genesis`, `thermo`, and the observer mode. Fifteen coupled systems and a dock full of buttons is not an experience until something asks the player for a thing.
5. **Then embodiment and the shelf.** `scale`, the orrery table, `shelf`, and the feel category. These are the items that make it the product the brief describes rather than a very good simulation with a UI.

The through-line: the simulation is now good enough that the player should be arguing with it rather than painting on it. Almost every item above is a way of turning a one-way write into an exchange.

