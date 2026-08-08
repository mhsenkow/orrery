# ORRERY — improvement backlog

**200 items.** Generated from `scripts/backlog.mjs` — edit that file, not this one, then run `node scripts/backlog.mjs`.

Lineage: **93** from SimEarth, **31** from WorldBox, **21** from both, **55** from neither (exactness or VR).

Foundations rebuild coverage: **96** done, **49** partial, **55** deferred.

Effort is S/M/L against a team of the size in the engineering brief. Impact is 1–3, where 3 means the product is materially different without it.

## Geosphere & tectonics — 18

_The prototype generates terrain from noise. SimEarth generated it from plates. That difference is most of why its worlds felt like planets rather than textures._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 1 | **Drive terrain from plates, not noise** | Voronoi-partition the sphere into 8–14 plates, give each an Euler pole and angular velocity, and let elevation be a consequence of plate interaction rather than fBm. | SimEarth | L | 3 | Done |
| 2 | **Classify every plate boundary** | Divergent, convergent or transform, derived from the relative velocity of the two plates at each boundary cell. Every other tectonic feature keys off this one classification. | SimEarth | M | 3 | Done |
| 3 | **Subduction zones** | Oceanic crust dives under continental, producing a trench on one side and a volcanic arc on the other — the Andes and Japan both fall out of this for free. | SimEarth | M | 3 | Done |
| 4 | **Continental collision and orogeny** | When two continental plates converge neither subducts; crust thickens and you get Himalayas. Mountain ranges become historical objects with a cause. | SimEarth | M | 3 | Done |
| 5 | **Mid-ocean ridges and seafloor spreading** | New crust created at divergent boundaries, with an age recorded per cell. This single field unlocks the next two items. | SimEarth | M | 2 | Done |
| 6 | **Age–depth relation for ocean floor** | Ocean depth follows roughly the square root of crustal age as it cools and subsides. Gives real bathymetry instead of inverted noise. | SimEarth | S | 2 | Done |
| 7 | **Isostasy** | Elevation should emerge from crustal thickness and density floating on the mantle, not be authored directly. Makes mountains erode into plateaus correctly. | SimEarth | M | 3 | Done |
| 8 | **Mantle hotspots fixed in their own frame** | Plates drift over a stationary plume and leave an island chain with an age gradient. Hawaii, as a directly observable consequence of your own tectonics. | SimEarth | S | 2 | Done |
| 9 | **Volcanoes as discrete objects** | Not a terrain texture — entities with a magma budget, an eruption schedule, and an ash column that couples into the atmosphere model. | Both | M | 3 | Done |
| 10 | **Earthquakes from accumulated strain** | Strain builds along locked transform and convergent boundaries and releases stochastically. Magnitude from accumulated slip deficit, not a random roll. | Both | M | 2 | Done |
| 11 | **Fluvial erosion via the stream power law** | Erosion rate proportional to discharge and slope. This is what carves valleys and makes terrain look geological rather than fractal. | Neither | M | 3 | Done |
| 12 | **Sediment transport and deposition** | Material eroded upstream has to go somewhere — deltas, alluvial fans, basin fill. Closes the mass budget and creates fertile land where it belongs. | Neither | M | 2 | Done |
| 13 | **Rifting and continental breakup** | A continent under extension thins, floods and splits. Watching Pangaea come apart on your own planet is a headline moment. | SimEarth | M | 3 | Done |
| 14 | **The supercontinent (Wilson) cycle** | Plates assemble and disperse on a ~400 Myr period, giving the geologic timescale a genuine rhythm instead of monotone drift. | SimEarth | M | 2 | Partial |
| 15 | **Rock type as a real layer** | Igneous, sedimentary and metamorphic, tracked per cell and produced by process. Drives soil fertility, resources and surface colour. | SimEarth | M | 2 | Done |
| 16 | **Ore bodies placed by geology** | Deposits form at subduction arcs, rifts and ancient shields rather than being sprinkled at random. Makes prospecting readable to a player who understands the map. | SimEarth | S | 2 | Done |
| 17 | **Impacts that alter terrain and climate together** | A crater in the heightfield, ejecta, a dust injection into the atmosphere and a temperature excursion — one event touching four systems. | Both | M | 3 | Done |
| 18 | **Simplified mantle convection** | Convection cells that actually drive plate velocities, so tectonics has an energy source rather than prescribed motion. | SimEarth | L | 1 | Deferred |

## Hydrosphere — 14

_Water is currently one scalar that diffuses. Every interesting coastline, river and ice age comes from treating it as mass that moves and is conserved._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 19 | **Sea level as a global consequence** | One scalar driven by ice volume plus thermal expansion, not a per-ruleset constant. Melting the caps should flood the coasts, visibly, while you watch. | SimEarth | S | 3 | Done |
| 20 | **Coastlines that recompute continuously** | Land/ocean classification derived from live sea level each tick, so drowning and exposure are gradual and reversible. | SimEarth | S | 3 | Done |
| 21 | **River networks by flow accumulation** | D8 or D-infinity routing over the cube-sphere with seam-aware neighbours, giving dendritic drainage that follows real topography. | SimEarth | M | 3 | Done |
| 22 | **Lakes via depression filling** | Priority-flood the heightfield so basins hold water and overflow at their lowest sill, rather than water vanishing into local minima. | Neither | M | 2 | Done |
| 23 | **Wind-driven surface currents** | Gyres emerging from surface wind stress and continental geometry. Currents are what make coastal climate counter-intuitive and interesting. | SimEarth | M | 2 | Done |
| 24 | **Thermohaline circulation with regime states** | A global conveyor that can shut down when enough freshwater enters the North Atlantic analogue — a discoverable, terrifying tipping point. | SimEarth | M | 3 | Done |
| 25 | **Separate deep and surface ocean layers** | Deep water is a huge thermal reservoir with a long lag. Without it, ocean temperature responds far too quickly to forcing. | SimEarth | M | 2 | Done |
| 26 | **Glaciers with mass balance and flow** | Accumulation above the snowline, ablation below, and downhill flow. Ice sheets should advance and retreat as objects, not appear as a threshold on temperature. | SimEarth | M | 3 | Done |
| 27 | **Isostatic depression under ice** | Ice sheets push crust down and it rebounds for millennia after they melt. Scandinavia is still rising; your planet should too. | SimEarth | S | 1 | Partial |
| 28 | **Distinguish sea ice from land ice** | Only land ice changes sea level when it melts. The prototype conflates them, which makes the sea-level story wrong in an obvious way. | SimEarth | S | 2 | Done |
| 29 | **Close the water budget** | Evaporation, transport, precipitation and runoff conserving total water mass, so moisture cannot be created by a diffusion kernel as it is today. | Neither | M | 3 | Done |
| 30 | **Orographic precipitation and rain shadows** | Air rising over a range drops its moisture windward and leaves desert leeward. One rule that explains most of a planet’s desert placement. | SimEarth | M | 3 | Done |
| 31 | **Groundwater and aquifers** | Slow subsurface storage that keeps oases alive through drought and gives arid rulesets somewhere for life to hide. | Neither | S | 1 | Partial |
| 32 | **Tsunamis propagating on the sphere** | Triggered by quakes and impacts, travelling as a real wavefront and running up on coasts. WorldBox’s tsunami is a headline toy; make ours causal. | WorldBox | M | 2 | Done |

## Atmosphere — 16

_SimEarth’s atmosphere was a real gas mixture with a greenhouse computed from it. Ours is three tuning constants per ruleset._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 33 | **Atmosphere as a real gas mixture** | Track N₂, O₂, CO₂, CH₄, water vapour and dust as partial pressures. Nearly every SimEarth feedback loop runs through this one state vector. | SimEarth | M | 3 | Done |
| 34 | **Greenhouse forcing computed from composition** | Radiative forcing derived from gas concentrations rather than the per-ruleset constant the prototype uses today. | SimEarth | M | 3 | Done |
| 35 | **Hadley, Ferrel and polar circulation cells** | Three-cell banding gives you the trade winds, the horse latitudes and the reason deserts cluster near 30°. Enormous realism per line of code. | SimEarth | M | 3 | Done |
| 36 | **Coriolis from rotation rate** | Make rotation period a ruleset parameter and derive deflection from it, so a fast-spinning world genuinely has different weather. | SimEarth | S | 2 | Done |
| 37 | **Wind as an advection field** | Once wind exists, it should carry heat, moisture, dust, ash, spores and pollution. One vector field, six systems improved. | SimEarth | M | 3 | Done |
| 38 | **Pressure field and geostrophic flow** | Wind derived from pressure gradients rather than prescribed banding, so continents and terrain perturb the circulation. | Neither | M | 2 | Partial |
| 39 | **Cyclones as tracked objects** | Spawning over warm ocean, intensifying, tracking poleward and making landfall. Legible at Regional tier and dramatic at Local. | Both | M | 2 | Partial |
| 40 | **Cloud cover as a field** | Clouds raise albedo, cool the surface and feed back into their own formation. Also the single biggest visual upgrade to the orbital view. | SimEarth | M | 3 | Done |
| 41 | **Ozone and UV shielding** | Gate land colonisation on UV attenuation, reproducing the real sequencing where life stays in the ocean until the shield exists. | SimEarth | S | 2 | Done |
| 42 | **Atmospheric escape** | Light gases leak away on low-gravity, low-magnetosphere worlds. This is why Selene has no air and why Ares lost most of its own. | SimEarth | S | 2 | Done |
| 43 | **Volcanic winter** | Large eruptions inject sulphate aerosols, spike albedo and cool the planet for years. A short sharp shock the player can watch propagate. | SimEarth | S | 2 | Done |
| 44 | **Actually simulate the Ares dust storm** | Currently a line in the ruleset table. Make it a real dust field lofted by wind, self-reinforcing through absorption, capable of eating a hemisphere. | SimEarth | M | 3 | Done |
| 45 | **Axial tilt and seasons** | The prototype’s sun sits permanently in the equatorial plane. Obliquity gives seasonal migration of the ice line and of everything that tracks it. | SimEarth | M | 3 | Done |
| 46 | **Milankovitch cycles** | Slow eccentricity, obliquity and precession variation driving glacial cycles — Terra’s signature phenomenon, currently unimplemented. | SimEarth | M | 3 | Partial |
| 47 | **Diurnal cycle with a real terminator** | Day/night temperature swing, extreme on airless worlds and damped by atmosphere. Sells the airless rulesets more than any texture would. | SimEarth | S | 2 | Done |
| 48 | **Pressure-dependent liquid water stability** | Below the triple point water sublimes rather than pooling. The reason Ares cannot have oceans should be simulated, not asserted. | SimEarth | S | 2 | Done |

## Biosphere & evolution — 22

_Life is presently a single 0–1 scalar that spreads. SimEarth ran a full evolutionary ladder; this is the biggest single gap to it._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 49 | **Implement the full evolutionary ladder** | Prokaryote → eukaryote → multicellular → arthropod → fish → amphibian → reptile → mammal, each unlocking on conditions. This is the largest single gap to SimEarth. | SimEarth | L | 3 | Done |
| 50 | **Tolerance envelopes per life class** | Each class has a temperature, moisture, pressure and chemistry range it survives in, so climate change reshuffles the biosphere rather than just dimming it. | SimEarth | M | 3 | Done |
| 51 | **Speciation from range fragmentation** | When a population’s range splits, the halves diverge. Islands and mountain ranges become species factories, which is how real biodiversity works. | SimEarth | M | 3 | Done |
| 52 | **Mass extinction and recovery dynamics** | Extinctions should clear niches and be followed by a radiation into them, giving the biosphere a punctuated history worth reading. | SimEarth | M | 3 | Done |
| 53 | **A real food web** | Producers, herbivores, carnivores and decomposers with biomass actually flowing between trophic levels rather than one scalar labelled "life". | SimEarth | M | 3 | Done |
| 54 | **Carrying capacity from first principles** | Derived per cell from insolation, water and nutrients instead of the current hand-tuned habitability function. | SimEarth | M | 2 | Done |
| 55 | **Photosynthesis draws down CO₂ and emits O₂** | The single most important coupling in the whole design: life changes the atmosphere, which changes the climate, which changes life. This is the Gaia loop. | SimEarth | M | 3 | Done |
| 56 | **Respiration and decay return carbon** | Without the return path the carbon cycle is a one-way drain and the atmosphere runs down to nothing over geologic time. | SimEarth | S | 3 | Done |
| 57 | **Make the Great Oxygenation Event possible** | Let early photosynthesisers poison their own world with oxygen and trigger a mass extinction. Emergent, historical and a genuinely great story beat. | SimEarth | M | 3 | Done |
| 58 | **Nitrogen and phosphorus as limiting nutrients** | Productivity limited by whichever nutrient is scarcest, so ocean upwelling zones and volcanic soils become the fertile places. | SimEarth | M | 2 | Done |
| 59 | **Migration along shifting climate gradients** | Populations track their tolerance envelope as bands move. Watching a forest walk poleward during warming is the clearest possible causality demo. | SimEarth | M | 3 | Done |
| 60 | **Endemism on isolated landmasses** | Separated continents evolve distinct assemblages, which makes exploring your own planet worthwhile rather than uniform. | SimEarth | M | 2 | Partial |
| 61 | **Invasive species when landmasses meet** | The Great American Interchange as an emergent event when your own tectonics closes an isthmus. | SimEarth | S | 2 | Partial |
| 62 | **Heritable traits per population** | WorldBox-style mutation applied to populations rather than individuals — cheap, and it makes lineages feel particular. | WorldBox | M | 2 | Partial |
| 63 | **Predator–prey oscillation** | Lotka–Volterra dynamics visible at Local tier as herds boom and crash. Small, legible, and it makes the world feel alive between player actions. | Both | S | 2 | Done |
| 64 | **Wind and animal seed dispersal** | Vegetation spread that follows the wind field and animal movement instead of isotropic diffusion to the four neighbours. | SimEarth | S | 1 | Partial |
| 65 | **Reef analogues in shallow warm water** | A biome that depends on a narrow depth and temperature band, and therefore bleaches visibly and early under warming. | SimEarth | S | 2 | Done |
| 66 | **Chemosynthetic life at hydrothermal vents** | Life that does not need the sun, so airless and frozen rulesets have a plausible biosphere at all. | SimEarth | S | 2 | Done |
| 67 | **Body size scaling with atmospheric oxygen** | High O₂ permits giant arthropods, exactly as in the Carboniferous. A visible readout of an invisible variable. | SimEarth | S | 2 | Partial |
| 68 | **Coevolution between species pairs** | Pollinators and flowers, predators and prey armour — traits that only make sense in the presence of another lineage. | SimEarth | M | 1 | Deferred |
| 69 | **Disease as a population-crash mechanic** | Transmissible along contact networks, with virulence trading off against spread. Shared implementation with the civilisation plague tool. | Both | M | 2 | Partial |
| 70 | **Soil as a distinct, depletable resource** | Built slowly by biology and lost quickly to erosion and agriculture, giving land a memory of how it has been treated. | SimEarth | M | 2 | Partial |

## Gaia & homeostasis — 8

_The Lovelock feedback loops are the thesis of SimEarth, not a feature of it. Without them the planet is a diorama, not an organism._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 71 | **Ship Daisyworld as a playable ruleset** | Lovelock’s black-and-white daisy model regulating planetary temperature against a brightening sun. It is the thesis of SimEarth in one screen and it is cheap to build. | SimEarth | S | 3 | Done |
| 72 | **A single planetary health readout** | SimEarth’s Gaia window: one glanceable synthesis of whether the system is regulating or failing. Must be diegetic under the "every number is a place" pillar. | SimEarth | M | 3 | Done |
| 73 | **Negative feedback loops the player can break** | The loops should be discoverable by experiment, and breaking one should be a distinct, narratable failure rather than a slow drift. | SimEarth | M | 3 | Done |
| 74 | **Explicit runaway terminal states** | Snowball and moist-greenhouse as named, reachable end states with their own visuals — losing should look like something. | SimEarth | M | 3 | Done |
| 75 | **Hysteresis in the climate system** | Once a snowball locks in, removing the original cause must not undo it. The prototype already reproduced this accidentally on Ares; make it intentional and legible. | SimEarth | M | 3 | Done |
| 76 | **The silicate weathering thermostat** | The long-term carbon regulator: warmer means faster weathering means less CO₂. The reason Earth has stayed habitable for four billion years. | SimEarth | M | 2 | Done |
| 77 | **Gaia autopilot mode** | Hands off, watch the planet self-correct over deep time. SimEarth had this and it is a genuinely restful mode that suits the Gardener archetype. | SimEarth | S | 2 | Done |
| 78 | **A biosphere resilience metric** | Something that predicts how large a perturbation the system can absorb, so the player can feel danger before crossing a threshold. | Neither | M | 2 | Done |

## Civilisation — 16

_Deliberately out of scope for Slice 1, but this is where SimEarth’s late game lived and where the atmosphere model earns its keep._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 79 | **SimEarth’s civilisation stages** | Stone, bronze, iron, industrial, atomic, information, nanotech — each with different resource demands and different atmospheric consequences. | SimEarth | L | 3 | Deferred |
| 80 | **Technology level per settlement, spread by contact** | Tech as a diffusing field rather than a global counter, so isolation genuinely retards development. | SimEarth | M | 2 | Deferred |
| 81 | **Energy source per civilisation** | Biomass, coal, oil, nuclear, solar, fusion — the choice determines emissions and therefore couples the civ layer to the climate model. | SimEarth | M | 3 | Deferred |
| 82 | **Industrial emissions feeding the atmosphere** | The payoff for the whole gas-mixture model: your civilisation changes its own climate and can be watched doing it. | SimEarth | M | 3 | Deferred |
| 83 | **Resource depletion driving expansion** | Settlements exhaust local resources and must expand or decline, which generates conflict without scripting it. | SimEarth | M | 2 | Deferred |
| 84 | **Trade routes over terrain cost** | Paths that follow rivers and coasts and avoid mountains, visible as real lines at Regional tier. | Both | M | 2 | Deferred |
| 85 | **Cities as growing extruded-vector clusters** | Settlement size legible at a glance from orbit at night and resolvable into individual buildings at Local tier. | Both | M | 2 | Partial |
| 86 | **Roads and rails carved into terrain** | Infrastructure that physically marks the planet and persists as archaeology after the civilisation falls. | Both | M | 1 | Deferred |
| 87 | **Agriculture converting biome cells** | Farmland as a distinct, visually obvious land cover with its own soil and water demands. | SimEarth | M | 2 | Deferred |
| 88 | **A pollution field with real effects** | Local health and biomass penalties, transported by wind, accumulating in basins. SimEarth had this and it made industry feel consequential. | SimEarth | M | 2 | Deferred |
| 89 | **Civilisational collapse** | From climate shift, famine, plague or war — with ruins left behind rather than a population counter reaching zero. | Both | M | 3 | Deferred |
| 90 | **A space programme as a win state** | SimEarth’s exodus ending: the civilisation you nurtured leaves. A real, earned conclusion to a very long game. | SimEarth | M | 3 | Deferred |
| 91 | **Nuclear exchange as a player-triggerable catastrophe** | Fallout, nuclear winter and a centuries-long recovery, coupling three existing systems. | Both | M | 2 | Deferred |
| 92 | **Civilisations that terraform on their own** | They build the machines from the tool palette themselves, so late game you are negotiating with the planet rather than commanding it. | SimEarth | M | 3 | Deferred |
| 93 | **Culture and religion as fields distinct from tech** | Spreading on different rules and at different speeds, which is what makes borders interesting rather than concentric. | WorldBox | M | 2 | Deferred |
| 94 | **Multiple intelligent species competing** | SimEarth let cetaceans or dinosaurs reach intelligence instead of mammals. Preserving that is what keeps replays genuinely different. | SimEarth | M | 3 | Deferred |

## Individuals & factions — 20

_This is the WorldBox axis almost entirely: named units with lives you can read, and kingdoms that fight over them._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 95 | **Named individuals with birth and death dates** | The cheapest, highest-leverage WorldBox feature. A name and two dates converts a sprite into somebody. | WorldBox | M | 3 | Partial |
| 96 | **Family trees and lineage** | Parentage, descendants, dynasties. Enables the "this is the great-great-grandson of the one you saved" moment that WorldBox players screenshot. | WorldBox | M | 3 | Deferred |
| 97 | **Personal traits** | Brave, greedy, sickly, gifted — heritable, visible in the inspector, and actually altering behaviour rather than being flavour text. | WorldBox | M | 3 | Partial |
| 98 | **A readable biography per individual** | Assembled from logged events. This is WorldBox’s actual product and it costs little once a chronicle exists. | WorldBox | M | 3 | Partial |
| 99 | **Deeds, kill counts and notable acts** | The statistics that let a random unit become locally famous and give the chronicle its protagonists. | WorldBox | S | 2 | Partial |
| 100 | **Relationships between individuals** | Friends, rivals, spouses, grudges — the substrate for feuds that outlive their participants. | WorldBox | M | 2 | Deferred |
| 101 | **Ageing and generational turnover** | Populations that visibly cycle through generations, so a century of sim time means something at Local tier. | WorldBox | S | 2 | Partial |
| 102 | **Click to inspect anything, at any scale** | The universal WorldBox verb. Under our pillars it should be a reach-out-and-touch gesture rather than a cursor. | WorldBox | M | 3 | Done |
| 103 | **Follow-cam attached to an individual** | Pick a creature and live alongside it. In VR this is an extremely strong and cheap emotional hook. | WorldBox | M | 3 | Partial |
| 104 | **Kingdoms with borders, names and banners** | Territory as a rendered, contested surface at Regional tier — WorldBox’s most legible visual system. | WorldBox | M | 3 | Deferred |
| 105 | **Wars with moving fronts** | Not instant resolution: fronts that advance and stall across real terrain, so geography decides outcomes. | WorldBox | M | 3 | Deferred |
| 106 | **Alliances, betrayals and vassalage** | Diplomatic state between factions, with reversals that the chronicle can name and date. | WorldBox | M | 2 | Deferred |
| 107 | **Rebellion and civil war from unrest** | Internal pressure as a modelled quantity, so empires fracture from within rather than only from outside. | WorldBox | M | 2 | Deferred |
| 108 | **Procedural culture and place names** | A per-culture phoneme set so names are internally consistent — the difference between a world and a random string generator. | WorldBox | M | 3 | Partial |
| 109 | **Heroes emerging from ordinary units** | Promotion on the basis of logged deeds rather than a spawn table. The story writes itself and is therefore believable. | WorldBox | M | 2 | Deferred |
| 110 | **Artifacts and relics with their own histories** | Objects that outlive owners, carry a chain of custody and can be found in ruins centuries later. | WorldBox | M | 2 | Deferred |
| 111 | **Monsters as an independent faction** | WorldBox’s wolves, dragons and worse. On Vermis the apex megafauna already has a design slot waiting for exactly this. | WorldBox | M | 3 | Deferred |
| 112 | **Plague and zombie-style outbreaks** | A conversion mechanic that spreads along the contact network and is genuinely frightening to watch from orbit. | WorldBox | M | 2 | Deferred |
| 113 | **Unit pathfinding on the (face,u,v) grid** | The architecture already makes this 2D per face plus a seam rule — the saving the engineering brief claims, finally cashed in. | Both | M | 3 | Partial |
| 114 | **Corpses, ruins and archaeology** | Physical residue of everything that has happened, discoverable at Local tier long afterwards. | Both | S | 2 | Partial |

## Chronicle & narrative — 10

_WorldBox’s real product is the story you tell afterwards. A log that turns emergence into history is cheap and disproportionately valuable._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 115 | **A world chronicle logging every significant event** | Timestamped, located, typed. Everything else in this category is a view onto this one log, so build it first. | WorldBox | M | 3 | Done |
| 116 | **Automatically named eras** | "The Long Winter", "The Vermis Ascendancy" — generated from what actually dominated each period. Turns a data series into a history. | WorldBox | M | 3 | Done |
| 117 | **Named wars, disasters and dynasties** | Proper nouns are what make emergent events memorable and shareable. | WorldBox | S | 3 | Done |
| 118 | **Filter history by region, faction or era** | The log is only useful if you can ask it questions. This is the interface that makes 200,000 events legible. | WorldBox | M | 2 | Partial |
| 119 | **"What happened here" on any location** | Point at a valley and read its history. Directly serves the "every number is a place" pillar. | Both | M | 3 | Done |
| 120 | **Monuments marking where events happened** | Physical markers at Local tier so history is encountered by exploring rather than by reading a menu. | Both | M | 2 | Partial |
| 121 | **Export the chronicle** | A shareable, readable history of your planet. This is the artefact players post, and therefore the marketing. | WorldBox | S | 3 | Done |
| 122 | **Timeline scrubber to replay history** | Requires the persistence decision in the engineering brief to be settled — snapshots versus replay from the edit log. | Neither | L | 3 | Deferred |
| 123 | **Trace causal chains backwards** | "Why did this civilisation fall" answered by walking the log. Turns the sim from spectacle into something you can reason about. | Neither | L | 3 | Deferred |
| 124 | **A diegetic history object in VR** | A book or a second globe you physically consult, rather than a panel. The pillar-compliant form of the chronicle. | Neither | M | 2 | Partial |

## God tools & disasters — 18

_The Vandal archetype is the acquisition channel. WorldBox’s whole first impression is the disaster palette._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 125 | **The full WorldBox disaster palette** | Meteor, tornado, tsunami, earthquake, volcano, plague, nuke, black hole. This is the entire first impression of WorldBox and we currently have none of it. | WorldBox | M | 3 | Done |
| 126 | **Finger of God** | Reach in and directly grab, move or delete any single thing. In VR this is the most natural verb available and it should exist on day one. | WorldBox | S | 3 | Done |
| 127 | **Terrain sculpting with material behaviour** | Raise, lower and smooth, with rock, sand and ice responding differently. The heightfield path to the Womp-style feel without the SDF cost. | Both | M | 3 | Done |
| 128 | **A solar constant control** | SimEarth’s sun dial. The single most powerful climate lever and the fastest way to demonstrate feedback loops to a new player. | SimEarth | S | 3 | Done |
| 129 | **Grab the axis and physically tilt it** | Obliquity as a two-handed gesture on the planet itself. The clearest example of a VR-native control with no flat-screen equivalent. | Neither | M | 3 | Partial |
| 130 | **Rotation rate control** | Spin the planet faster and watch the circulation reorganise — an immediate, visible consequence from an abstract parameter. | SimEarth | S | 2 | Done |
| 131 | **Atmosphere composition injectors** | Add or remove specific gases directly. SimEarth’s most educational tool by a wide margin. | SimEarth | S | 3 | Done |
| 132 | **A species seeding brush** | Paint life onto the planet and watch whether it takes. The core Gardener verb. | Both | S | 3 | Done |
| 133 | **A meteor you physically throw** | Wind up and hurl it. Impact energy from actual hand velocity. This is the clip that sells the game. | WorldBox | M | 3 | Done |
| 134 | **SimEarth’s four time scales** | Geologic, evolutionary, civilised and technological, each running the same sim at a different rate. Elegant and it solves the pacing problem for free. | SimEarth | M | 3 | Partial |
| 135 | **Undo and rewind** | Sandboxes need forgiveness. WorldBox players experiment because mistakes are cheap; ours are currently permanent. | WorldBox | L | 3 | Partial |
| 136 | **Snapshot and branch a planet** | Fork at a moment and explore alternate histories — the strongest possible answer to "what if I had not done that". | Neither | L | 2 | Deferred |
| 137 | **Placeable terraforming machines** | SimEarth’s atmosphere generators, vaporators and oxygen plants as physical objects you site by hand. | SimEarth | M | 2 | Partial |
| 138 | **The monolith** | SimEarth’s intelligence booster. An absurd, beloved, deeply memorable object worth reproducing in spirit. | SimEarth | S | 2 | Partial |
| 139 | **Planet buster** | A real terminal action with a real confirmation. Every god game needs a button you are afraid of. | Both | S | 2 | Done |
| 140 | **Ice meteors and other cooling interventions** | A counterweight to the heating tools so climate play is two-directional. | SimEarth | S | 1 | Done |
| 141 | **Localised weather control** | Steer a storm, break a drought. Small-scale interventions for players who like precision over spectacle. | SimEarth | M | 1 | Deferred |
| 142 | **Sandbox mode versus budgeted mode** | WorldBox is pure sandbox, SimEarth was budgeted. Shipping both as explicit modes serves the Vandal and the Tinkerer without compromising either. | Both | S | 3 | Done |

## Energy budget & goals — 6

_SimEarth charged you for interventions. Scarcity is what turned a toy into a game with strategy._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 143 | **Restore an energy budget for interventions** | SimEarth’s omega. Scarcity is what turns a toy into a game with decisions, and it is what the current prototype most obviously lacks. | SimEarth | M | 3 | Done |
| 144 | **Energy income tied to planetary state** | A healthy biosphere funds your interventions, so nurturing and spending are in tension. | SimEarth | M | 3 | Done |
| 145 | **Authored scenarios with win conditions** | A starting state and a goal. The on-ramp that a pure sandbox cannot provide. | SimEarth | M | 3 | Partial |
| 146 | **Port SimEarth’s own scenarios** | Aquarium, Stag Nation, the Earth epochs, Mars, Venus and Daisyworld — proven, well-designed starting conditions and a clear lineage statement. | SimEarth | M | 2 | Deferred |
| 147 | **Difficulty via intervention cost** | One multiplier that scales the whole game, rather than separate easy and hard rule sets to maintain. | SimEarth | S | 2 | Partial |
| 148 | **An end-of-run rating** | A summary of what your planet became. Gives closure to sessions that otherwise have no shape. | SimEarth | S | 2 | Partial |

## Information display — 14

_Bound by the "every number is a place" pillar — these have to be diegetic instruments, not overlays._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 149 | **SimEarth’s model panels as physical instruments** | Geosphere, atmosphere, biosphere and civilisation, each an object you pick up rather than a menu you open. | SimEarth | M | 3 | Partial |
| 150 | **Switchable data layers** | Temperature, rainfall, biomass, tech, pollution, plate age. The prototype has exactly two colour modes today. | SimEarth | M | 3 | Partial |
| 151 | **Cut the planet open** | A cross-section showing crust, mantle and core, and where the plates are going. Impossible on a flat screen, trivial to understand in VR. | Neither | M | 3 | Deferred |
| 152 | **Graphs over time as objects you can hold** | The pillar-compliant way to show a time series: a physical strip chart, not an overlay. | Neither | M | 2 | Deferred |
| 153 | **Compare two moments side by side** | Two globes, then and now, held together. The clearest possible way to show what a perturbation did. | Neither | M | 3 | Deferred |
| 154 | **Per-cell inspector on point** | Every field value for the cell under your finger. The debugging tool that doubles as the Tinkerer’s main instrument. | Both | S | 3 | Done |
| 155 | **Legends that are readable in a headset** | Text legibility at 20/20 in a headset is a real constraint that kills most flat-screen UI. Needs its own type scale. | Neither | S | 3 | Done |
| 156 | **Colourblind-safe layer palettes** | The current climate ramp runs green through red, which is the single worst choice for deuteranopia. | Neither | S | 3 | Done |
| 157 | **Isolines as an alternative to heat maps** | Contours read far better than gradients for quantitative comparison, and they suit the paper-diorama art direction. | Neither | S | 1 | Deferred |
| 158 | **The Gaia window equivalent** | One object that tells you whether the planet is well, at a glance, from across the room. | SimEarth | M | 3 | Partial |
| 159 | **Sonify a data layer** | Hear the temperature gradient as you sweep a hand across the surface. Genuinely useful and unavailable on flat screens. | Neither | M | 1 | Deferred |
| 160 | **A globe-in-globe minimap for surface tier** | Once you are standing on the planet you lose all orientation. A held globe solves it diegetically. | Neither | M | 2 | Deferred |
| 161 | **Search the world** | "Show me every volcano" or "where is the oldest city". Essential once the world contains more than you can survey. | WorldBox | M | 2 | Deferred |
| 162 | **Player annotations pinned to places** | Let people mark and name their own landmarks. Ownership of a world comes largely from naming it. | Neither | S | 2 | Partial |

## VR interaction — 16

_Where the product either justifies the headset or does not. Most of these are untested assumptions today._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 163 | **Two-handed scale** | Grab with both hands and pull apart to zoom. The most natural scale gesture in VR and a strong candidate the brief does not currently list. | Neither | M | 3 | Done |
| 164 | **Actually build transition variants A and B** | The M0 bake-off is the program’s hard gate and neither variant exists yet. Nothing else should start before this. | Neither | M | 3 | Deferred |
| 165 | **Hand tracking for sculpting** | Shaping terrain with bare hands is the single most compelling demo this concept can produce. | Neither | M | 3 | Deferred |
| 166 | **Haptics on tectonic and impact events** | Feel the earthquake through the controller. Cheap, and it makes the simulation physical rather than observed. | Neither | S | 2 | Partial |
| 167 | **A physical tool belt** | Tools holstered around your body and drawn by reaching, instead of a radial menu. | Neither | M | 2 | Partial |
| 168 | **Set the planet on a real table via passthrough** | The retention story from the design brief’s open question. Also the hardest lighting problem in the project. | Neither | L | 3 | Deferred |
| 169 | **Room-scale walking at surface tier** | Real steps mapping to real ground, which is the most comfortable locomotion that exists. | Neither | M | 2 | Deferred |
| 170 | **Full seated parity** | Every interaction reachable seated. Most headset time is seated and designing standing-first quietly excludes it. | Neither | M | 3 | Partial |
| 171 | **Per-transition comfort vignetting** | Tuned separately for each locomotion and scale change rather than one global setting. | Neither | S | 3 | Partial |
| 172 | **Snap and smooth turning options** | Table stakes for VR accessibility; their absence is a review-score problem. | Neither | S | 3 | Partial |
| 173 | **Handedness and reach settings** | Tool placement and dominant-hand assignment configurable, including for one-handed play. | Neither | S | 3 | Partial |
| 174 | **Keep everything within seated arm’s reach** | A hard layout constraint, verified in-engine rather than assumed — easy to violate and expensive to fix late. | Neither | S | 2 | Partial |
| 175 | **Voice commands for layer switching** | Keeps both hands free while sculpting, which is when you most want to change what you are looking at. | Neither | M | 1 | Deferred |
| 176 | **Physical dials instead of sliders** | Grab and twist a knob for the solar constant. Flat-screen widgets feel wrong in a headset and read as a port. | Neither | S | 2 | Partial |
| 177 | **Pass-the-headset local multiplayer** | Two gods, alternating turns on one planet. Sidesteps every networking problem while still being social. | Neither | M | 2 | Deferred |
| 178 | **A spectator view for the flat screen** | A framed, stable camera for the person watching or streaming. Currently the mirror view would be unwatchable. | Neither | M | 2 | Deferred |

## Art & audio — 13

_The extruded-vector direction is asserted in the brief and not yet built — current entities are flat quads._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 179 | **Actually extrude the vector entities** | They are flat quads today. The brief’s central art claim — that a 3 mm extrusion fixes billboard flatness in stereo — is asserted and untested. <br>`vr/index.html entProg` | Neither | M | 3 | Done |
| 180 | **Animate entities by path morphing** | The stated advantage of vector art, currently unused. Trees should sway and creatures should move without new assets. | Neither | M | 2 | Deferred |
| 181 | **Seasonal palette shifts** | Deciduous colour turning with the seasons, which requires axial tilt to exist first. | SimEarth | S | 2 | Partial |
| 182 | **A night side with city lights** | The single most legible indicator of civilisation from orbit, and one of the most beautiful views in the genre. | SimEarth | S | 3 | Partial |
| 183 | **Aurorae at the magnetic poles** | Implies a magnetosphere, which also gates atmospheric escape — one visual selling an invisible system. | Neither | S | 1 | Deferred |
| 184 | **A separately rendered cloud shell** | Clouds are the difference between a textured ball and a planet. Also gives the atmosphere model something to show for itself. | SimEarth | M | 3 | Done |
| 185 | **Depth-based water shading** | Absorption and scattering with depth rather than the flat two-colour ramp currently used for oceans. | Neither | S | 2 | Done |
| 186 | **Proper atmospheric scattering** | Rayleigh and Mie rather than the single Fresnel rim term in the prototype. The limb and the sunset are what sell the object. <br>`vr/index.html atmoProg` | Neither | M | 3 | Done |
| 187 | **An ambient audio bed per biome** | The prototype is silent. Sound is half of presence in VR and biome audio is the cheapest possible half. | Neither | M | 3 | Done |
| 188 | **Positional audio for events** | Hear an eruption behind you and turn to find it. Directs attention across a whole sphere without any UI. | Neither | M | 3 | Done |
| 189 | **The planet hums** | A continuous sonification of planetary state, so you feel a change before you can see it. | Neither | M | 2 | Done |
| 190 | **Music that tracks biosphere health** | Adaptive scoring keyed to the Gaia metric — emotional feedback for a system that is otherwise numeric. | Neither | M | 2 | Deferred |
| 191 | **Weather particles at surface tier** | Rain, snow and dust as local effects, which is the payoff for having simulated precipitation at all. | Both | M | 2 | Deferred |

## Engineering & prototype gaps — 9

_Concrete, honest limitations of what is actually running today, plus the architecture the briefs promise but have not built._

| # | Item | Detail | From | Effort | Impact | Status |
|---|---|---|---|---|---|---|
| 192 | **Build the quadtree LOD** | The prototype has none — it draws a fixed 6×64² mesh at every distance. The entire progressive-disclosure argument depends on this existing. <br>`vr/index.html buildLattice` | Neither | L | 3 | Deferred |
| 193 | **Move the field simulation to the GPU** | It is a JavaScript loop over 24,576 cells on the main thread today. The engineering brief specifies compute passes; nothing of that is built. <br>`vr/index.html simTick` | Neither | L | 3 | Deferred |
| 194 | **Raise sim resolution to 6×256²** | The 393,216 cells the brief specifies, which is only affordable once the sim is off the CPU. | Neither | M | 2 | Deferred |
| 195 | **Fix billboards viewed from directly above** | Entities degenerate to flat crosses when the camera looks straight down the radial axis. Needs a blend toward camera-facing near the sub-camera point. <br>`vr/index.html entProg` | Neither | S | 2 | Done |
| 196 | **Give entities any behaviour at all** | They are static decals placed once at generation. They never move, breed or die — there is no agent layer, only scenery. <br>`vr/index.html respawnEntities` | Neither | L | 3 | Done |
| 197 | **Make the colour update incremental** | Every tick rebuilds and re-uploads all 25,350 vertices regardless of what changed. Should be dirty-region only. <br>`vr/index.html refreshColours` | Neither | S | 2 | Partial |
| 198 | **Interpolate between sim ticks** | The brief promises decoupled ticks with render-side interpolation; the prototype snaps at 11 Hz, which will read as stutter at 90 Hz. | Neither | M | 3 | Done |
| 199 | **Deterministic fixed-point simulation** | Required before replay, sharing or the timeline scrubber are possible. Far cheaper to decide now than to retrofit. | Neither | L | 2 | Deferred |
| 200 | **Save and load via seed plus delta** | There is no persistence whatsoever today. Also forces the open question in the engineering brief to be settled. | Neither | M | 3 | Deferred |

