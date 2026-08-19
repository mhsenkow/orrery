#!/usr/bin/env node
// Single source of truth for the ORRERY improvement backlog.
// Emits  briefs/backlog.md  and  site/backlog.html  so the two cannot drift.
//
//   node scripts/backlog.mjs
//
// src:  SE = SimEarth lineage · WB = WorldBox lineage · BOTH · NEW (neither, but
//       needed for exactness or for VR). e = effort S/M/L. i = impact 1..3.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = [
  ['geo',   'Geosphere & tectonics',        'The prototype generates terrain from noise. SimEarth generated it from plates. That difference is most of why its worlds felt like planets rather than textures.'],
  ['hydro', 'Hydrosphere',                  'Water is currently one scalar that diffuses. Every interesting coastline, river and ice age comes from treating it as mass that moves and is conserved.'],
  ['atmo',  'Atmosphere',                   'SimEarth’s atmosphere was a real gas mixture with a greenhouse computed from it. Ours is three tuning constants per ruleset.'],
  ['bio',   'Biosphere & evolution',        'Life is presently a single 0–1 scalar that spreads. SimEarth ran a full evolutionary ladder; this is the biggest single gap to it.'],
  ['gaia',  'Gaia & homeostasis',           'The Lovelock feedback loops are the thesis of SimEarth, not a feature of it. Without them the planet is a diorama, not an organism.'],
  ['civ',   'Civilisation',                 'Deliberately out of scope for Slice 1, but this is where SimEarth’s late game lived and where the atmosphere model earns its keep.'],
  ['agent', 'Individuals & factions',       'This is the WorldBox axis almost entirely: named units with lives you can read, and kingdoms that fight over them.'],
  ['chron', 'Chronicle & narrative',        'WorldBox’s real product is the story you tell afterwards. A log that turns emergence into history is cheap and disproportionately valuable.'],
  ['tools', 'God tools & disasters',        'The Vandal archetype is the acquisition channel. WorldBox’s whole first impression is the disaster palette.'],
  ['econ',  'Energy budget & goals',        'SimEarth charged you for interventions. Scarcity is what turned a toy into a game with strategy.'],
  ['info',  'Information display',          'Bound by the "every number is a place" pillar — these have to be diegetic instruments, not overlays.'],
  ['vr',    'VR interaction',               'Where the product either justifies the headset or does not. Most of these are untested assumptions today.'],
  ['art',   'Art & audio',                  'The extruded-vector direction is asserted in the brief and not yet built — current entities are flat quads.'],
  ['tech',  'Engineering & prototype gaps', 'Concrete, honest limitations of what is actually running today, plus the architecture the briefs promise but have not built.'],
];

const D = [
/* ---------------------------------------------------------------- geo -- */
{c:'geo',t:'Drive terrain from plates, not noise',d:'Voronoi-partition the sphere into 8–14 plates, give each an Euler pole and angular velocity, and let elevation be a consequence of plate interaction rather than fBm.',src:'SE',e:'L',i:3},
{c:'geo',t:'Classify every plate boundary',d:'Divergent, convergent or transform, derived from the relative velocity of the two plates at each boundary cell. Every other tectonic feature keys off this one classification.',src:'SE',e:'M',i:3},
{c:'geo',t:'Subduction zones',d:'Oceanic crust dives under continental, producing a trench on one side and a volcanic arc on the other — the Andes and Japan both fall out of this for free.',src:'SE',e:'M',i:3},
{c:'geo',t:'Continental collision and orogeny',d:'When two continental plates converge neither subducts; crust thickens and you get Himalayas. Mountain ranges become historical objects with a cause.',src:'SE',e:'M',i:3},
{c:'geo',t:'Mid-ocean ridges and seafloor spreading',d:'New crust created at divergent boundaries, with an age recorded per cell. This single field unlocks the next two items.',src:'SE',e:'M',i:2},
{c:'geo',t:'Age–depth relation for ocean floor',d:'Ocean depth follows roughly the square root of crustal age as it cools and subsides. Gives real bathymetry instead of inverted noise.',src:'SE',e:'S',i:2},
{c:'geo',t:'Isostasy',d:'Elevation should emerge from crustal thickness and density floating on the mantle, not be authored directly. Makes mountains erode into plateaus correctly.',src:'SE',e:'M',i:3},
{c:'geo',t:'Mantle hotspots fixed in their own frame',d:'Plates drift over a stationary plume and leave an island chain with an age gradient. Hawaii, as a directly observable consequence of your own tectonics.',src:'SE',e:'S',i:2},
{c:'geo',t:'Volcanoes as discrete objects',d:'Not a terrain texture — entities with a magma budget, an eruption schedule, and an ash column that couples into the atmosphere model.',src:'BOTH',e:'M',i:3},
{c:'geo',t:'Earthquakes from accumulated strain',d:'Strain builds along locked transform and convergent boundaries and releases stochastically. Magnitude from accumulated slip deficit, not a random roll.',src:'BOTH',e:'M',i:2},
{c:'geo',t:'Fluvial erosion via the stream power law',d:'Erosion rate proportional to discharge and slope. This is what carves valleys and makes terrain look geological rather than fractal.',src:'NEW',e:'M',i:3},
{c:'geo',t:'Sediment transport and deposition',d:'Material eroded upstream has to go somewhere — deltas, alluvial fans, basin fill. Closes the mass budget and creates fertile land where it belongs.',src:'NEW',e:'M',i:2},
{c:'geo',t:'Rifting and continental breakup',d:'A continent under extension thins, floods and splits. Watching Pangaea come apart on your own planet is a headline moment.',src:'SE',e:'M',i:3},
{c:'geo',t:'The supercontinent (Wilson) cycle',d:'Plates assemble and disperse on a ~400 Myr period, giving the geologic timescale a genuine rhythm instead of monotone drift.',src:'SE',e:'M',i:2},
{c:'geo',t:'Rock type as a real layer',d:'Igneous, sedimentary and metamorphic, tracked per cell and produced by process. Drives soil fertility, resources and surface colour.',src:'SE',e:'M',i:2},
{c:'geo',t:'Ore bodies placed by geology',d:'Deposits form at subduction arcs, rifts and ancient shields rather than being sprinkled at random. Makes prospecting readable to a player who understands the map.',src:'SE',e:'S',i:2},
{c:'geo',t:'Impacts that alter terrain and climate together',d:'A crater in the heightfield, ejecta, a dust injection into the atmosphere and a temperature excursion — one event touching four systems.',src:'BOTH',e:'M',i:3},
{c:'geo',t:'Simplified mantle convection',d:'Convection cells that actually drive plate velocities, so tectonics has an energy source rather than prescribed motion.',src:'SE',e:'L',i:1},

/* -------------------------------------------------------------- hydro -- */
{c:'hydro',t:'Sea level as a global consequence',d:'One scalar driven by ice volume plus thermal expansion, not a per-ruleset constant. Melting the caps should flood the coasts, visibly, while you watch.',src:'SE',e:'S',i:3},
{c:'hydro',t:'Coastlines that recompute continuously',d:'Land/ocean classification derived from live sea level each tick, so drowning and exposure are gradual and reversible.',src:'SE',e:'S',i:3},
{c:'hydro',t:'River networks by flow accumulation',d:'D8 or D-infinity routing over the cube-sphere with seam-aware neighbours, giving dendritic drainage that follows real topography.',src:'SE',e:'M',i:3},
{c:'hydro',t:'Lakes via depression filling',d:'Priority-flood the heightfield so basins hold water and overflow at their lowest sill, rather than water vanishing into local minima.',src:'NEW',e:'M',i:2},
{c:'hydro',t:'Wind-driven surface currents',d:'Gyres emerging from surface wind stress and continental geometry. Currents are what make coastal climate counter-intuitive and interesting.',src:'SE',e:'M',i:2},
{c:'hydro',t:'Thermohaline circulation with regime states',d:'A global conveyor that can shut down when enough freshwater enters the North Atlantic analogue — a discoverable, terrifying tipping point.',src:'SE',e:'M',i:3},
{c:'hydro',t:'Separate deep and surface ocean layers',d:'Deep water is a huge thermal reservoir with a long lag. Without it, ocean temperature responds far too quickly to forcing.',src:'SE',e:'M',i:2},
{c:'hydro',t:'Glaciers with mass balance and flow',d:'Accumulation above the snowline, ablation below, and downhill flow. Ice sheets should advance and retreat as objects, not appear as a threshold on temperature.',src:'SE',e:'M',i:3},
{c:'hydro',t:'Isostatic depression under ice',d:'Ice sheets push crust down and it rebounds for millennia after they melt. Scandinavia is still rising; your planet should too.',src:'SE',e:'S',i:1},
{c:'hydro',t:'Distinguish sea ice from land ice',d:'Only land ice changes sea level when it melts. The prototype conflates them, which makes the sea-level story wrong in an obvious way.',src:'SE',e:'S',i:2},
{c:'hydro',t:'Close the water budget',d:'Evaporation, transport, precipitation and runoff conserving total water mass, so moisture cannot be created by a diffusion kernel as it is today.',src:'NEW',e:'M',i:3},
{c:'hydro',t:'Orographic precipitation and rain shadows',d:'Air rising over a range drops its moisture windward and leaves desert leeward. One rule that explains most of a planet’s desert placement.',src:'SE',e:'M',i:3},
{c:'hydro',t:'Groundwater and aquifers',d:'Slow subsurface storage that keeps oases alive through drought and gives arid rulesets somewhere for life to hide.',src:'NEW',e:'S',i:1},
{c:'hydro',t:'Tsunamis propagating on the sphere',d:'Triggered by quakes and impacts, travelling as a real wavefront and running up on coasts. WorldBox’s tsunami is a headline toy; make ours causal.',src:'WB',e:'M',i:2},

/* --------------------------------------------------------------- atmo -- */
{c:'atmo',t:'Atmosphere as a real gas mixture',d:'Track N₂, O₂, CO₂, CH₄, water vapour and dust as partial pressures. Nearly every SimEarth feedback loop runs through this one state vector.',src:'SE',e:'M',i:3},
{c:'atmo',t:'Greenhouse forcing computed from composition',d:'Radiative forcing derived from gas concentrations rather than the per-ruleset constant the prototype uses today.',src:'SE',e:'M',i:3},
{c:'atmo',t:'Hadley, Ferrel and polar circulation cells',d:'Three-cell banding gives you the trade winds, the horse latitudes and the reason deserts cluster near 30°. Enormous realism per line of code.',src:'SE',e:'M',i:3},
{c:'atmo',t:'Coriolis from rotation rate',d:'Make rotation period a ruleset parameter and derive deflection from it, so a fast-spinning world genuinely has different weather.',src:'SE',e:'S',i:2},
{c:'atmo',t:'Wind as an advection field',d:'Once wind exists, it should carry heat, moisture, dust, ash, spores and pollution. One vector field, six systems improved.',src:'SE',e:'M',i:3},
{c:'atmo',t:'Pressure field and geostrophic flow',d:'Wind derived from pressure gradients rather than prescribed banding, so continents and terrain perturb the circulation.',src:'NEW',e:'M',i:2},
{c:'atmo',t:'Cyclones as tracked objects',d:'Spawning over warm ocean, intensifying, tracking poleward and making landfall. Legible at Regional tier and dramatic at Local.',src:'BOTH',e:'M',i:2},
{c:'atmo',t:'Cloud cover as a field',d:'Clouds raise albedo, cool the surface and feed back into their own formation. Also the single biggest visual upgrade to the orbital view.',src:'SE',e:'M',i:3},
{c:'atmo',t:'Ozone and UV shielding',d:'Gate land colonisation on UV attenuation, reproducing the real sequencing where life stays in the ocean until the shield exists.',src:'SE',e:'S',i:2},
{c:'atmo',t:'Atmospheric escape',d:'Light gases leak away on low-gravity, low-magnetosphere worlds. This is why Selene has no air and why Ares lost most of its own.',src:'SE',e:'S',i:2},
{c:'atmo',t:'Volcanic winter',d:'Large eruptions inject sulphate aerosols, spike albedo and cool the planet for years. A short sharp shock the player can watch propagate.',src:'SE',e:'S',i:2},
{c:'atmo',t:'Actually simulate the Ares dust storm',d:'Currently a line in the ruleset table. Make it a real dust field lofted by wind, self-reinforcing through absorption, capable of eating a hemisphere.',src:'SE',e:'M',i:3},
{c:'atmo',t:'Axial tilt and seasons',d:'The prototype’s sun sits permanently in the equatorial plane. Obliquity gives seasonal migration of the ice line and of everything that tracks it.',src:'SE',e:'M',i:3},
{c:'atmo',t:'Milankovitch cycles',d:'Slow eccentricity, obliquity and precession variation driving glacial cycles — Terra’s signature phenomenon, currently unimplemented.',src:'SE',e:'M',i:3},
{c:'atmo',t:'Diurnal cycle with a real terminator',d:'Day/night temperature swing, extreme on airless worlds and damped by atmosphere. Sells the airless rulesets more than any texture would.',src:'SE',e:'S',i:2},
{c:'atmo',t:'Pressure-dependent liquid water stability',d:'Below the triple point water sublimes rather than pooling. The reason Ares cannot have oceans should be simulated, not asserted.',src:'SE',e:'S',i:2},

/* ---------------------------------------------------------------- bio -- */
{c:'bio',t:'Implement the full evolutionary ladder',d:'Prokaryote → eukaryote → multicellular → arthropod → fish → amphibian → reptile → mammal, each unlocking on conditions. This is the largest single gap to SimEarth.',src:'SE',e:'L',i:3},
{c:'bio',t:'Tolerance envelopes per life class',d:'Each class has a temperature, moisture, pressure and chemistry range it survives in, so climate change reshuffles the biosphere rather than just dimming it.',src:'SE',e:'M',i:3},
{c:'bio',t:'Speciation from range fragmentation',d:'When a population’s range splits, the halves diverge. Islands and mountain ranges become species factories, which is how real biodiversity works.',src:'SE',e:'M',i:3},
{c:'bio',t:'Mass extinction and recovery dynamics',d:'Extinctions should clear niches and be followed by a radiation into them, giving the biosphere a punctuated history worth reading.',src:'SE',e:'M',i:3},
{c:'bio',t:'A real food web',d:'Producers, herbivores, carnivores and decomposers with biomass actually flowing between trophic levels rather than one scalar labelled "life".',src:'SE',e:'M',i:3},
{c:'bio',t:'Carrying capacity from first principles',d:'Derived per cell from insolation, water and nutrients instead of the current hand-tuned habitability function.',src:'SE',e:'M',i:2},
{c:'bio',t:'Photosynthesis draws down CO₂ and emits O₂',d:'The single most important coupling in the whole design: life changes the atmosphere, which changes the climate, which changes life. This is the Gaia loop.',src:'SE',e:'M',i:3},
{c:'bio',t:'Respiration and decay return carbon',d:'Without the return path the carbon cycle is a one-way drain and the atmosphere runs down to nothing over geologic time.',src:'SE',e:'S',i:3},
{c:'bio',t:'Make the Great Oxygenation Event possible',d:'Let early photosynthesisers poison their own world with oxygen and trigger a mass extinction. Emergent, historical and a genuinely great story beat.',src:'SE',e:'M',i:3},
{c:'bio',t:'Nitrogen and phosphorus as limiting nutrients',d:'Productivity limited by whichever nutrient is scarcest, so ocean upwelling zones and volcanic soils become the fertile places.',src:'SE',e:'M',i:2},
{c:'bio',t:'Migration along shifting climate gradients',d:'Populations track their tolerance envelope as bands move. Watching a forest walk poleward during warming is the clearest possible causality demo.',src:'SE',e:'M',i:3},
{c:'bio',t:'Endemism on isolated landmasses',d:'Separated continents evolve distinct assemblages, which makes exploring your own planet worthwhile rather than uniform.',src:'SE',e:'M',i:2},
{c:'bio',t:'Invasive species when landmasses meet',d:'The Great American Interchange as an emergent event when your own tectonics closes an isthmus.',src:'SE',e:'S',i:2},
{c:'bio',t:'Heritable traits per population',d:'WorldBox-style mutation applied to populations rather than individuals — cheap, and it makes lineages feel particular.',src:'WB',e:'M',i:2},
{c:'bio',t:'Predator–prey oscillation',d:'Lotka–Volterra dynamics visible at Local tier as herds boom and crash. Small, legible, and it makes the world feel alive between player actions.',src:'BOTH',e:'S',i:2},
{c:'bio',t:'Wind and animal seed dispersal',d:'Vegetation spread that follows the wind field and animal movement instead of isotropic diffusion to the four neighbours.',src:'SE',e:'S',i:1},
{c:'bio',t:'Reef analogues in shallow warm water',d:'A biome that depends on a narrow depth and temperature band, and therefore bleaches visibly and early under warming.',src:'SE',e:'S',i:2},
{c:'bio',t:'Chemosynthetic life at hydrothermal vents',d:'Life that does not need the sun, so airless and frozen rulesets have a plausible biosphere at all.',src:'SE',e:'S',i:2},
{c:'bio',t:'Body size scaling with atmospheric oxygen',d:'High O₂ permits giant arthropods, exactly as in the Carboniferous. A visible readout of an invisible variable.',src:'SE',e:'S',i:2},
{c:'bio',t:'Coevolution between species pairs',d:'Pollinators and flowers, predators and prey armour — traits that only make sense in the presence of another lineage.',src:'SE',e:'M',i:1},
{c:'bio',t:'Disease as a population-crash mechanic',d:'Transmissible along contact networks, with virulence trading off against spread. Shared implementation with the civilisation plague tool.',src:'BOTH',e:'M',i:2},
{c:'bio',t:'Soil as a distinct, depletable resource',d:'Built slowly by biology and lost quickly to erosion and agriculture, giving land a memory of how it has been treated.',src:'SE',e:'M',i:2},

/* --------------------------------------------------------------- gaia -- */
{c:'gaia',t:'Ship Daisyworld as a playable ruleset',d:'Lovelock’s black-and-white daisy model regulating planetary temperature against a brightening sun. It is the thesis of SimEarth in one screen and it is cheap to build.',src:'SE',e:'S',i:3},
{c:'gaia',t:'A single planetary health readout',d:'SimEarth’s Gaia window: one glanceable synthesis of whether the system is regulating or failing. Must be diegetic under the "every number is a place" pillar.',src:'SE',e:'M',i:3},
{c:'gaia',t:'Negative feedback loops the player can break',d:'The loops should be discoverable by experiment, and breaking one should be a distinct, narratable failure rather than a slow drift.',src:'SE',e:'M',i:3},
{c:'gaia',t:'Explicit runaway terminal states',d:'Snowball and moist-greenhouse as named, reachable end states with their own visuals — losing should look like something.',src:'SE',e:'M',i:3},
{c:'gaia',t:'Hysteresis in the climate system',d:'Once a snowball locks in, removing the original cause must not undo it. The prototype already reproduced this accidentally on Ares; make it intentional and legible.',src:'SE',e:'M',i:3},
{c:'gaia',t:'The silicate weathering thermostat',d:'The long-term carbon regulator: warmer means faster weathering means less CO₂. The reason Earth has stayed habitable for four billion years.',src:'SE',e:'M',i:2},
{c:'gaia',t:'Gaia autopilot mode',d:'Hands off, watch the planet self-correct over deep time. SimEarth had this and it is a genuinely restful mode that suits the Gardener archetype.',src:'SE',e:'S',i:2},
{c:'gaia',t:'A biosphere resilience metric',d:'Something that predicts how large a perturbation the system can absorb, so the player can feel danger before crossing a threshold.',src:'NEW',e:'M',i:2},

/* ---------------------------------------------------------------- civ -- */
{c:'civ',t:'SimEarth’s civilisation stages',d:'Stone, bronze, iron, industrial, atomic, information, nanotech — each with different resource demands and different atmospheric consequences.',src:'SE',e:'L',i:3},
{c:'civ',t:'Technology level per settlement, spread by contact',d:'Tech as a diffusing field rather than a global counter, so isolation genuinely retards development.',src:'SE',e:'M',i:2},
{c:'civ',t:'Energy source per civilisation',d:'Biomass, coal, oil, nuclear, solar, fusion — the choice determines emissions and therefore couples the civ layer to the climate model.',src:'SE',e:'M',i:3},
{c:'civ',t:'Industrial emissions feeding the atmosphere',d:'The payoff for the whole gas-mixture model: your civilisation changes its own climate and can be watched doing it.',src:'SE',e:'M',i:3},
{c:'civ',t:'Resource depletion driving expansion',d:'Settlements exhaust local resources and must expand or decline, which generates conflict without scripting it.',src:'SE',e:'M',i:2},
{c:'civ',t:'Trade routes over terrain cost',d:'Paths that follow rivers and coasts and avoid mountains, visible as real lines at Regional tier.',src:'BOTH',e:'M',i:2},
{c:'civ',t:'Cities as growing extruded-vector clusters',d:'Settlement size legible at a glance from orbit at night and resolvable into individual buildings at Local tier.',src:'BOTH',e:'M',i:2},
{c:'civ',t:'Roads and rails carved into terrain',d:'Infrastructure that physically marks the planet and persists as archaeology after the civilisation falls.',src:'BOTH',e:'M',i:1},
{c:'civ',t:'Agriculture converting biome cells',d:'Farmland as a distinct, visually obvious land cover with its own soil and water demands.',src:'SE',e:'M',i:2},
{c:'civ',t:'A pollution field with real effects',d:'Local health and biomass penalties, transported by wind, accumulating in basins. SimEarth had this and it made industry feel consequential.',src:'SE',e:'M',i:2},
{c:'civ',t:'Civilisational collapse',d:'From climate shift, famine, plague or war — with ruins left behind rather than a population counter reaching zero.',src:'BOTH',e:'M',i:3},
{c:'civ',t:'A space programme as a win state',d:'SimEarth’s exodus ending: the civilisation you nurtured leaves. A real, earned conclusion to a very long game.',src:'SE',e:'M',i:3},
{c:'civ',t:'Nuclear exchange as a player-triggerable catastrophe',d:'Fallout, nuclear winter and a centuries-long recovery, coupling three existing systems.',src:'BOTH',e:'M',i:2},
{c:'civ',t:'Civilisations that terraform on their own',d:'They build the machines from the tool palette themselves, so late game you are negotiating with the planet rather than commanding it.',src:'SE',e:'M',i:3},
{c:'civ',t:'Culture and religion as fields distinct from tech',d:'Spreading on different rules and at different speeds, which is what makes borders interesting rather than concentric.',src:'WB',e:'M',i:2},
{c:'civ',t:'Multiple intelligent species competing',d:'SimEarth let cetaceans or dinosaurs reach intelligence instead of mammals. Preserving that is what keeps replays genuinely different.',src:'SE',e:'M',i:3},

/* -------------------------------------------------------------- agent -- */
{c:'agent',t:'Named individuals with birth and death dates',d:'The cheapest, highest-leverage WorldBox feature. A name and two dates converts a sprite into somebody.',src:'WB',e:'M',i:3},
{c:'agent',t:'Family trees and lineage',d:'Parentage, descendants, dynasties. Enables the "this is the great-great-grandson of the one you saved" moment that WorldBox players screenshot.',src:'WB',e:'M',i:3},
{c:'agent',t:'Personal traits',d:'Brave, greedy, sickly, gifted — heritable, visible in the inspector, and actually altering behaviour rather than being flavour text.',src:'WB',e:'M',i:3},
{c:'agent',t:'A readable biography per individual',d:'Assembled from logged events. This is WorldBox’s actual product and it costs little once a chronicle exists.',src:'WB',e:'M',i:3},
{c:'agent',t:'Deeds, kill counts and notable acts',d:'The statistics that let a random unit become locally famous and give the chronicle its protagonists.',src:'WB',e:'S',i:2},
{c:'agent',t:'Relationships between individuals',d:'Friends, rivals, spouses, grudges — the substrate for feuds that outlive their participants.',src:'WB',e:'M',i:2},
{c:'agent',t:'Ageing and generational turnover',d:'Populations that visibly cycle through generations, so a century of sim time means something at Local tier.',src:'WB',e:'S',i:2},
{c:'agent',t:'Click to inspect anything, at any scale',d:'The universal WorldBox verb. Under our pillars it should be a reach-out-and-touch gesture rather than a cursor.',src:'WB',e:'M',i:3},
{c:'agent',t:'Follow-cam attached to an individual',d:'Pick a creature and live alongside it. In VR this is an extremely strong and cheap emotional hook.',src:'WB',e:'M',i:3},
{c:'agent',t:'Kingdoms with borders, names and banners',d:'Territory as a rendered, contested surface at Regional tier — WorldBox’s most legible visual system.',src:'WB',e:'M',i:3},
{c:'agent',t:'Wars with moving fronts',d:'Not instant resolution: fronts that advance and stall across real terrain, so geography decides outcomes.',src:'WB',e:'M',i:3},
{c:'agent',t:'Alliances, betrayals and vassalage',d:'Diplomatic state between factions, with reversals that the chronicle can name and date.',src:'WB',e:'M',i:2},
{c:'agent',t:'Rebellion and civil war from unrest',d:'Internal pressure as a modelled quantity, so empires fracture from within rather than only from outside.',src:'WB',e:'M',i:2},
{c:'agent',t:'Procedural culture and place names',d:'A per-culture phoneme set so names are internally consistent — the difference between a world and a random string generator.',src:'WB',e:'M',i:3},
{c:'agent',t:'Heroes emerging from ordinary units',d:'Promotion on the basis of logged deeds rather than a spawn table. The story writes itself and is therefore believable.',src:'WB',e:'M',i:2},
{c:'agent',t:'Artifacts and relics with their own histories',d:'Objects that outlive owners, carry a chain of custody and can be found in ruins centuries later.',src:'WB',e:'M',i:2},
{c:'agent',t:'Monsters as an independent faction',d:'WorldBox’s wolves, dragons and worse. On Vermis the apex megafauna already has a design slot waiting for exactly this.',src:'WB',e:'M',i:3},
{c:'agent',t:'Plague and zombie-style outbreaks',d:'A conversion mechanic that spreads along the contact network and is genuinely frightening to watch from orbit.',src:'WB',e:'M',i:2},
{c:'agent',t:'Unit pathfinding on the (face,u,v) grid',d:'The architecture already makes this 2D per face plus a seam rule — the saving the engineering brief claims, finally cashed in.',src:'BOTH',e:'M',i:3},
{c:'agent',t:'Corpses, ruins and archaeology',d:'Physical residue of everything that has happened, discoverable at Local tier long afterwards.',src:'BOTH',e:'S',i:2},

/* -------------------------------------------------------------- chron -- */
{c:'chron',t:'A world chronicle logging every significant event',d:'Timestamped, located, typed. Everything else in this category is a view onto this one log, so build it first.',src:'WB',e:'M',i:3},
{c:'chron',t:'Automatically named eras',d:'"The Long Winter", "The Vermis Ascendancy" — generated from what actually dominated each period. Turns a data series into a history.',src:'WB',e:'M',i:3},
{c:'chron',t:'Named wars, disasters and dynasties',d:'Proper nouns are what make emergent events memorable and shareable.',src:'WB',e:'S',i:3},
{c:'chron',t:'Filter history by region, faction or era',d:'The log is only useful if you can ask it questions. This is the interface that makes 200,000 events legible.',src:'WB',e:'M',i:2},
{c:'chron',t:'"What happened here" on any location',d:'Point at a valley and read its history. Directly serves the "every number is a place" pillar.',src:'BOTH',e:'M',i:3},
{c:'chron',t:'Monuments marking where events happened',d:'Physical markers at Local tier so history is encountered by exploring rather than by reading a menu.',src:'BOTH',e:'M',i:2},
{c:'chron',t:'Export the chronicle',d:'A shareable, readable history of your planet. This is the artefact players post, and therefore the marketing.',src:'WB',e:'S',i:3},
{c:'chron',t:'Timeline scrubber to replay history',d:'Requires the persistence decision in the engineering brief to be settled — snapshots versus replay from the edit log.',src:'NEW',e:'L',i:3},
{c:'chron',t:'Trace causal chains backwards',d:'"Why did this civilisation fall" answered by walking the log. Turns the sim from spectacle into something you can reason about.',src:'NEW',e:'L',i:3},
{c:'chron',t:'A diegetic history object in VR',d:'A book or a second globe you physically consult, rather than a panel. The pillar-compliant form of the chronicle.',src:'NEW',e:'M',i:2},

/* -------------------------------------------------------------- tools -- */
{c:'tools',t:'The full WorldBox disaster palette',d:'Meteor, tornado, tsunami, earthquake, volcano, plague, nuke, black hole. This is the entire first impression of WorldBox and we currently have none of it.',src:'WB',e:'M',i:3},
{c:'tools',t:'Finger of God',d:'Reach in and directly grab, move or delete any single thing. In VR this is the most natural verb available and it should exist on day one.',src:'WB',e:'S',i:3},
{c:'tools',t:'Terrain sculpting with material behaviour',d:'Raise, lower and smooth, with rock, sand and ice responding differently. The heightfield path to the Womp-style feel without the SDF cost.',src:'BOTH',e:'M',i:3},
{c:'tools',t:'A solar constant control',d:'SimEarth’s sun dial. The single most powerful climate lever and the fastest way to demonstrate feedback loops to a new player.',src:'SE',e:'S',i:3},
{c:'tools',t:'Grab the axis and physically tilt it',d:'Obliquity as a two-handed gesture on the planet itself. The clearest example of a VR-native control with no flat-screen equivalent.',src:'NEW',e:'M',i:3},
{c:'tools',t:'Rotation rate control',d:'Spin the planet faster and watch the circulation reorganise — an immediate, visible consequence from an abstract parameter.',src:'SE',e:'S',i:2},
{c:'tools',t:'Atmosphere composition injectors',d:'Add or remove specific gases directly. SimEarth’s most educational tool by a wide margin.',src:'SE',e:'S',i:3},
{c:'tools',t:'A species seeding brush',d:'Paint life onto the planet and watch whether it takes. The core Gardener verb.',src:'BOTH',e:'S',i:3},
{c:'tools',t:'A meteor you physically throw',d:'Wind up and hurl it. Impact energy from actual hand velocity. This is the clip that sells the game.',src:'WB',e:'M',i:3},
{c:'tools',t:'SimEarth’s four time scales',d:'Geologic, evolutionary, civilised and technological, each running the same sim at a different rate. Elegant and it solves the pacing problem for free.',src:'SE',e:'M',i:3},
{c:'tools',t:'Undo and rewind',d:'Sandboxes need forgiveness. WorldBox players experiment because mistakes are cheap; ours are currently permanent.',src:'WB',e:'L',i:3},
{c:'tools',t:'Snapshot and branch a planet',d:'Fork at a moment and explore alternate histories — the strongest possible answer to "what if I had not done that".',src:'NEW',e:'L',i:2},
{c:'tools',t:'Placeable terraforming machines',d:'SimEarth’s atmosphere generators, vaporators and oxygen plants as physical objects you site by hand.',src:'SE',e:'M',i:2},
{c:'tools',t:'The monolith',d:'SimEarth’s intelligence booster. An absurd, beloved, deeply memorable object worth reproducing in spirit.',src:'SE',e:'S',i:2},
{c:'tools',t:'Planet buster',d:'A real terminal action with a real confirmation. Every god game needs a button you are afraid of.',src:'BOTH',e:'S',i:2},
{c:'tools',t:'Ice meteors and other cooling interventions',d:'A counterweight to the heating tools so climate play is two-directional.',src:'SE',e:'S',i:1},
{c:'tools',t:'Localised weather control',d:'Steer a storm, break a drought. Small-scale interventions for players who like precision over spectacle.',src:'SE',e:'M',i:1},
{c:'tools',t:'Sandbox mode versus budgeted mode',d:'WorldBox is pure sandbox, SimEarth was budgeted. Shipping both as explicit modes serves the Vandal and the Tinkerer without compromising either.',src:'BOTH',e:'S',i:3},

/* --------------------------------------------------------------- econ -- */
{c:'econ',t:'Restore an energy budget for interventions',d:'SimEarth’s omega. Scarcity is what turns a toy into a game with decisions, and it is what the current prototype most obviously lacks.',src:'SE',e:'M',i:3},
{c:'econ',t:'Energy income tied to planetary state',d:'A healthy biosphere funds your interventions, so nurturing and spending are in tension.',src:'SE',e:'M',i:3},
{c:'econ',t:'Authored scenarios with win conditions',d:'A starting state and a goal. The on-ramp that a pure sandbox cannot provide.',src:'SE',e:'M',i:3},
{c:'econ',t:'Port SimEarth’s own scenarios',d:'Aquarium, Stag Nation, the Earth epochs, Mars, Venus and Daisyworld — proven, well-designed starting conditions and a clear lineage statement.',src:'SE',e:'M',i:2},
{c:'econ',t:'Difficulty via intervention cost',d:'One multiplier that scales the whole game, rather than separate easy and hard rule sets to maintain.',src:'SE',e:'S',i:2},
{c:'econ',t:'An end-of-run rating',d:'A summary of what your planet became. Gives closure to sessions that otherwise have no shape.',src:'SE',e:'S',i:2},

/* --------------------------------------------------------------- info -- */
{c:'info',t:'SimEarth’s model panels as physical instruments',d:'Geosphere, atmosphere, biosphere and civilisation, each an object you pick up rather than a menu you open.',src:'SE',e:'M',i:3},
{c:'info',t:'Switchable data layers',d:'Temperature, rainfall, biomass, tech, pollution, plate age. The prototype has exactly two colour modes today.',src:'SE',e:'M',i:3},
{c:'info',t:'Cut the planet open',d:'A cross-section showing crust, mantle and core, and where the plates are going. Impossible on a flat screen, trivial to understand in VR.',src:'NEW',e:'M',i:3},
{c:'info',t:'Graphs over time as objects you can hold',d:'The pillar-compliant way to show a time series: a physical strip chart, not an overlay.',src:'NEW',e:'M',i:2},
{c:'info',t:'Compare two moments side by side',d:'Two globes, then and now, held together. The clearest possible way to show what a perturbation did.',src:'NEW',e:'M',i:3},
{c:'info',t:'Per-cell inspector on point',d:'Every field value for the cell under your finger. The debugging tool that doubles as the Tinkerer’s main instrument.',src:'BOTH',e:'S',i:3},
{c:'info',t:'Legends that are readable in a headset',d:'Text legibility at 20/20 in a headset is a real constraint that kills most flat-screen UI. Needs its own type scale.',src:'NEW',e:'S',i:3},
{c:'info',t:'Colourblind-safe layer palettes',d:'The current climate ramp runs green through red, which is the single worst choice for deuteranopia.',src:'NEW',e:'S',i:3},
{c:'info',t:'Isolines as an alternative to heat maps',d:'Contours read far better than gradients for quantitative comparison, and they suit the paper-diorama art direction.',src:'NEW',e:'S',i:1},
{c:'info',t:'The Gaia window equivalent',d:'One object that tells you whether the planet is well, at a glance, from across the room.',src:'SE',e:'M',i:3},
{c:'info',t:'Sonify a data layer',d:'Hear the temperature gradient as you sweep a hand across the surface. Genuinely useful and unavailable on flat screens.',src:'NEW',e:'M',i:1},
{c:'info',t:'A globe-in-globe minimap for surface tier',d:'Once you are standing on the planet you lose all orientation. A held globe solves it diegetically.',src:'NEW',e:'M',i:2},
{c:'info',t:'Search the world',d:'"Show me every volcano" or "where is the oldest city". Essential once the world contains more than you can survey.',src:'WB',e:'M',i:2},
{c:'info',t:'Player annotations pinned to places',d:'Let people mark and name their own landmarks. Ownership of a world comes largely from naming it.',src:'NEW',e:'S',i:2},

/* ----------------------------------------------------------------- vr -- */
{c:'vr',t:'Two-handed scale',d:'Grab with both hands and pull apart to zoom. The most natural scale gesture in VR and a strong candidate the brief does not currently list.',src:'NEW',e:'M',i:3},
{c:'vr',t:'Actually build transition variants A and B',d:'The M0 bake-off is the program’s hard gate and neither variant exists yet. Nothing else should start before this.',src:'NEW',e:'M',i:3},
{c:'vr',t:'Hand tracking for sculpting',d:'Shaping terrain with bare hands is the single most compelling demo this concept can produce.',src:'NEW',e:'M',i:3},
{c:'vr',t:'Haptics on tectonic and impact events',d:'Feel the earthquake through the controller. Cheap, and it makes the simulation physical rather than observed.',src:'NEW',e:'S',i:2},
{c:'vr',t:'A physical tool belt',d:'Tools holstered around your body and drawn by reaching, instead of a radial menu.',src:'NEW',e:'M',i:2},
{c:'vr',t:'Set the planet on a real table via passthrough',d:'The retention story from the design brief’s open question. Also the hardest lighting problem in the project.',src:'NEW',e:'L',i:3},
{c:'vr',t:'Room-scale walking at surface tier',d:'Real steps mapping to real ground, which is the most comfortable locomotion that exists.',src:'NEW',e:'M',i:2},
{c:'vr',t:'Full seated parity',d:'Every interaction reachable seated. Most headset time is seated and designing standing-first quietly excludes it.',src:'NEW',e:'M',i:3},
{c:'vr',t:'Per-transition comfort vignetting',d:'Tuned separately for each locomotion and scale change rather than one global setting.',src:'NEW',e:'S',i:3},
{c:'vr',t:'Snap and smooth turning options',d:'Table stakes for VR accessibility; their absence is a review-score problem.',src:'NEW',e:'S',i:3},
{c:'vr',t:'Handedness and reach settings',d:'Tool placement and dominant-hand assignment configurable, including for one-handed play.',src:'NEW',e:'S',i:3},
{c:'vr',t:'Keep everything within seated arm’s reach',d:'A hard layout constraint, verified in-engine rather than assumed — easy to violate and expensive to fix late.',src:'NEW',e:'S',i:2},
{c:'vr',t:'Voice commands for layer switching',d:'Keeps both hands free while sculpting, which is when you most want to change what you are looking at.',src:'NEW',e:'M',i:1},
{c:'vr',t:'Physical dials instead of sliders',d:'Grab and twist a knob for the solar constant. Flat-screen widgets feel wrong in a headset and read as a port.',src:'NEW',e:'S',i:2},
{c:'vr',t:'Pass-the-headset local multiplayer',d:'Two gods, alternating turns on one planet. Sidesteps every networking problem while still being social.',src:'NEW',e:'M',i:2},
{c:'vr',t:'A spectator view for the flat screen',d:'A framed, stable camera for the person watching or streaming. Currently the mirror view would be unwatchable.',src:'NEW',e:'M',i:2},

/* ---------------------------------------------------------------- art -- */
{c:'art',t:'Actually extrude the vector entities',d:'They are flat quads today. The brief’s central art claim — that a 3 mm extrusion fixes billboard flatness in stereo — is asserted and untested.',src:'NEW',e:'M',i:3,ref:'vr/index.html entProg'},
{c:'art',t:'Animate entities by path morphing',d:'The stated advantage of vector art, currently unused. Trees should sway and creatures should move without new assets.',src:'NEW',e:'M',i:2},
{c:'art',t:'Seasonal palette shifts',d:'Deciduous colour turning with the seasons, which requires axial tilt to exist first.',src:'SE',e:'S',i:2},
{c:'art',t:'A night side with city lights',d:'The single most legible indicator of civilisation from orbit, and one of the most beautiful views in the genre.',src:'SE',e:'S',i:3},
{c:'art',t:'Aurorae at the magnetic poles',d:'Implies a magnetosphere, which also gates atmospheric escape — one visual selling an invisible system.',src:'NEW',e:'S',i:1},
{c:'art',t:'A separately rendered cloud shell',d:'Clouds are the difference between a textured ball and a planet. Also gives the atmosphere model something to show for itself.',src:'SE',e:'M',i:3},
{c:'art',t:'Depth-based water shading',d:'Absorption and scattering with depth rather than the flat two-colour ramp currently used for oceans.',src:'NEW',e:'S',i:2},
{c:'art',t:'Proper atmospheric scattering',d:'Rayleigh and Mie rather than the single Fresnel rim term in the prototype. The limb and the sunset are what sell the object.',src:'NEW',e:'M',i:3,ref:'vr/index.html atmoProg'},
{c:'art',t:'An ambient audio bed per biome',d:'The prototype is silent. Sound is half of presence in VR and biome audio is the cheapest possible half.',src:'NEW',e:'M',i:3},
{c:'art',t:'Positional audio for events',d:'Hear an eruption behind you and turn to find it. Directs attention across a whole sphere without any UI.',src:'NEW',e:'M',i:3},
{c:'art',t:'The planet hums',d:'A continuous sonification of planetary state, so you feel a change before you can see it.',src:'NEW',e:'M',i:2},
{c:'art',t:'Music that tracks biosphere health',d:'Adaptive scoring keyed to the Gaia metric — emotional feedback for a system that is otherwise numeric.',src:'NEW',e:'M',i:2},
{c:'art',t:'Weather particles at surface tier',d:'Rain, snow and dust as local effects, which is the payoff for having simulated precipitation at all.',src:'BOTH',e:'M',i:2},

/* --------------------------------------------------------------- tech -- */
{c:'tech',t:'Build the quadtree LOD',d:'The prototype has none — it draws a fixed 6×64² mesh at every distance. The entire progressive-disclosure argument depends on this existing.',src:'NEW',e:'L',i:3,ref:'vr/index.html buildLattice'},
{c:'tech',t:'Move the field simulation to the GPU',d:'It is a JavaScript loop over 24,576 cells on the main thread today. The engineering brief specifies compute passes; nothing of that is built.',src:'NEW',e:'L',i:3,ref:'vr/index.html simTick'},
{c:'tech',t:'Raise sim resolution to 6×256²',d:'The 393,216 cells the brief specifies, which is only affordable once the sim is off the CPU.',src:'NEW',e:'M',i:2},
{c:'tech',t:'Fix billboards viewed from directly above',d:'Entities degenerate to flat crosses when the camera looks straight down the radial axis. Needs a blend toward camera-facing near the sub-camera point.',src:'NEW',e:'S',i:2,ref:'vr/index.html entProg'},
{c:'tech',t:'Give entities any behaviour at all',d:'They are static decals placed once at generation. They never move, breed or die — there is no agent layer, only scenery.',src:'NEW',e:'L',i:3,ref:'vr/index.html respawnEntities'},
{c:'tech',t:'Make the colour update incremental',d:'Every tick rebuilds and re-uploads all 25,350 vertices regardless of what changed. Should be dirty-region only.',src:'NEW',e:'S',i:2,ref:'vr/index.html refreshColours'},
{c:'tech',t:'Interpolate between sim ticks',d:'The brief promises decoupled ticks with render-side interpolation; the prototype snaps at 11 Hz, which will read as stutter at 90 Hz.',src:'NEW',e:'M',i:3},
{c:'tech',t:'Deterministic fixed-point simulation',d:'Required before replay, sharing or the timeline scrubber are possible. Far cheaper to decide now than to retrofit.',src:'NEW',e:'L',i:2},
{c:'tech',t:'Save and load via seed plus delta',d:'There is no persistence whatsoever today. Also forces the open question in the engineering brief to be settled.',src:'NEW',e:'M',i:3},
];

/* ------------------------------------------------------------- validate -- */
const catIds = new Set(CATS.map(c => c[0]));
D.forEach((x, n) => { if (!catIds.has(x.c)) throw new Error(`item ${n+1} "${x.t}" has unknown category ${x.c}`); });
D.forEach((x, n) => x.id = n + 1);

/* Foundations rebuild (2026-08-08): mark prototype coverage.
   done = real coupled behaviour in vr/ · partial = simplified but present · deferred = out of this pass */
const DEFERRED = new Set([
  18, 68, 79, 80, 81, 82, 83, 84, 86, 87, 88, 89, 90, 91, 92, 93, 94,
  96, 100, 104, 105, 106, 107, 109, 110, 111, 112,
  122, 123, 136, 141, 146, 151, 152, 153, 157, 159, 160, 161,
  164, 165, 168, 169, 175, 177, 178, 180, 183, 190, 191,
  192, 193, 194, 199, 200,
]);
const PARTIAL = new Set([
  14, 27, 31, 38, 39, 46, 60, 61, 62, 64, 67, 69, 70,
  85, 95, 97, 98, 99, 101, 103, 108, 113, 114,
  118, 120, 124, 129, 134, 135, 137, 138,
  145, 147, 148, 149, 150, 158, 162,
  166, 167, 170, 171, 172, 173, 174, 176,
  181, 182, 197,
]);
for (const x of D) {
  if (DEFERRED.has(x.id)) x.st = 'deferred';
  else if (PARTIAL.has(x.id)) x.st = 'partial';
  else x.st = 'done';
}

const SRC = { SE:'SimEarth', WB:'WorldBox', BOTH:'Both', NEW:'Neither' };
const ST = { done:'Done', partial:'Partial', deferred:'Deferred' };
const EFFORT = { S:'Small', M:'Medium', L:'Large' };
const byCat = c => D.filter(x => x.c === c);
const count = f => D.filter(f).length;

/* ------------------------------------------------------------- markdown -- */
function markdown(){
  const L = [];
  L.push('# ORRERY — improvement backlog');
  L.push('');
  L.push(`**${D.length} items.** Generated from \`scripts/backlog.mjs\` — edit that file, not this one, then run \`node scripts/backlog.mjs\`.`);
  L.push('');
  L.push(`Lineage: **${count(x=>x.src==='SE')}** from SimEarth, **${count(x=>x.src==='WB')}** from WorldBox, **${count(x=>x.src==='BOTH')}** from both, **${count(x=>x.src==='NEW')}** from neither (exactness or VR).`);
  L.push('');
  L.push(`Foundations rebuild coverage: **${count(x=>x.st==='done')}** done, **${count(x=>x.st==='partial')}** partial, **${count(x=>x.st==='deferred')}** deferred.`);
  L.push('');
  L.push('Effort is S/M/L against a team of the size in the engineering brief. Impact is 1–3, where 3 means the product is materially different without it.');
  L.push('');
  for (const [id, name, blurb] of CATS){
    const items = byCat(id);
    L.push(`## ${name} — ${items.length}`);
    L.push('');
    L.push(`_${blurb}_`);
    L.push('');
    L.push('| # | Item | Detail | From | Effort | Impact | Status |');
    L.push('|---|---|---|---|---|---|---|');
    for (const x of items){
      const ref = x.ref ? ` <br>`+'`'+x.ref+'`' : '';
      L.push(`| ${x.id} | **${x.t}** | ${x.d}${ref} | ${SRC[x.src]} | ${x.e} | ${x.i} | ${ST[x.st]} |`);
    }
    L.push('');
  }
  return L.join('\n');
}

/* ----------------------------------------------------------------- html -- */
function html(){
  const data = JSON.stringify(D.map(x => ({id:x.id,c:x.c,t:x.t,d:x.d,s:x.src,e:x.e,i:x.i,r:x.ref||'',st:x.st})));
  const cats = JSON.stringify(CATS.map(([id,name,blurb]) => ({id,name,blurb})));
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ORRERY — 200 ways this could be better</title>
<style>
:root{
  --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#e0a050; --accent-soft:rgba(224,160,80,.13); --accent-line:rgba(224,160,80,.34);
  --se:#7fb0e0; --se-soft:rgba(127,176,224,.14);
  --wb:#c98ad6; --wb-soft:rgba(201,138,214,.14);
  --sans:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
}
@media (prefers-color-scheme: light){
  :root{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
    --text:#12151c; --dim:#4e5768; --faint:#727d90;
    --accent:#9a5f14; --accent-soft:rgba(154,95,20,.09); --accent-line:rgba(154,95,20,.3);
    --se:#215e93; --se-soft:rgba(33,94,147,.09); --wb:#7c3d8c; --wb-soft:rgba(124,61,140,.09); }
}
:root[data-theme="dark"]{ --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#e0a050; --accent-soft:rgba(224,160,80,.13); --accent-line:rgba(224,160,80,.34);
  --se:#7fb0e0; --se-soft:rgba(127,176,224,.14); --wb:#c98ad6; --wb-soft:rgba(201,138,214,.14); }
:root[data-theme="light"]{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
  --text:#12151c; --dim:#4e5768; --faint:#727d90;
  --accent:#9a5f14; --accent-soft:rgba(154,95,20,.09); --accent-line:rgba(154,95,20,.3);
  --se:#215e93; --se-soft:rgba(33,94,147,.09); --wb:#7c3d8c; --wb-soft:rgba(124,61,140,.09); }

*{box-sizing:border-box;}
body{margin:0; background:var(--ground); color:var(--text);
     font:400 16px/1.6 var(--sans); -webkit-font-smoothing:antialiased;}
.wrap{max-width:1080px; margin:0 auto; padding:40px 26px 110px;}

header{border-bottom:1px solid var(--rule); padding-bottom:28px;}
.eyebrow{font:500 10.5px/1 var(--mono); letter-spacing:.24em; text-transform:uppercase; color:var(--accent);}
h1{font:700 clamp(34px,5.4vw,54px)/1.03 var(--sans); letter-spacing:-.035em; margin:15px 0 0; text-wrap:balance;}
.sub{font:italic 400 clamp(17px,2.2vw,21px)/1.45 var(--serif); color:var(--dim);
     margin:18px 0 0; max-width:46ch;}

.tally{display:grid; grid-template-columns:repeat(auto-fit,minmax(126px,1fr)); gap:1px;
       background:var(--rule); border:1px solid var(--rule); border-radius:8px;
       overflow:hidden; margin-top:26px;}
.tally > div{background:var(--panel); padding:13px 15px;}
.tally dt{font:500 9.5px/1 var(--mono); letter-spacing:.15em; text-transform:uppercase; color:var(--faint);}
.tally dd{margin:9px 0 0; font:600 26px/1 var(--sans); letter-spacing:-.02em;
          font-variant-numeric:tabular-nums;}
.tally dd small{display:block; font:400 11px/1.5 var(--mono); color:var(--faint); margin-top:6px; letter-spacing:0;}

.controls{position:sticky; top:0; z-index:5; background:var(--ground);
          padding:18px 0 14px; border-bottom:1px solid var(--rule); margin-bottom:6px;}
.filters{display:flex; flex-wrap:wrap; gap:7px; align-items:center;}
.flabel{font:500 9.5px/1 var(--mono); letter-spacing:.17em; text-transform:uppercase;
        color:var(--faint); margin-right:3px;}
button.f{font:500 11.5px/1 var(--mono); color:var(--dim); cursor:pointer; background:transparent;
         border:1px solid var(--rule); border-radius:5px; padding:7px 10px;}
button.f:hover{border-color:var(--accent-line); color:var(--text);}
button.f[aria-pressed="true"]{background:var(--accent-soft); border-color:var(--accent-line); color:var(--accent);}
button.f.se[aria-pressed="true"]{background:var(--se-soft); border-color:var(--se); color:var(--se);}
button.f.wb[aria-pressed="true"]{background:var(--wb-soft); border-color:var(--wb); color:var(--wb);}
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
.blurb{margin:13px 0 0; color:var(--dim); max-width:72ch; font-size:14.5px;}

ol{list-style:none; margin:16px 0 0; padding:0; display:flex; flex-direction:column; gap:1px;
   background:var(--rule); border:1px solid var(--rule); border-radius:8px; overflow:hidden;}
li{background:var(--panel); padding:13px 16px; display:grid;
   grid-template-columns:38px minmax(0,1fr) auto; gap:4px 14px; align-items:baseline;}
li .id{font:500 11px/1.5 var(--mono); color:var(--faint); font-variant-numeric:tabular-nums;}
li .t{font:600 14.5px/1.4 var(--sans); letter-spacing:-.008em;}
li .d{grid-column:2; color:var(--dim); font-size:13.5px; line-height:1.55; max-width:74ch;}
li .r{grid-column:2; font:400 11px/1.5 var(--mono); color:var(--faint); margin-top:3px;}
li .tags{display:flex; gap:5px; align-items:center; grid-row:1; grid-column:3;}
.tag{font:600 9px/1 var(--mono); letter-spacing:.1em; text-transform:uppercase;
     padding:4px 6px; border-radius:3px; white-space:nowrap; border:1px solid transparent;}
.tag.se{background:var(--se-soft); color:var(--se); border-color:var(--se);}
.tag.wb{background:var(--wb-soft); color:var(--wb); border-color:var(--wb);}
.tag.both{background:transparent; color:var(--dim); border-color:var(--rule);}
.tag.new{background:transparent; color:var(--faint); border-color:var(--rule);}
.tag.e{background:transparent; color:var(--faint); border-color:var(--rule);}
.tag.st.done{background:rgba(70,160,110,.18); color:#6dca92; border-color:rgba(70,160,110,.4);}
.tag.st.partial{background:rgba(224,160,80,.15); color:var(--accent); border-color:var(--accent-line);}
.tag.st.deferred{background:transparent; color:var(--faint); border-color:var(--rule);}
li.st-deferred{opacity:.72;}
.dots{display:inline-flex; gap:2px;}
.dots i{width:5px; height:5px; border-radius:50%; background:var(--rule); display:block;}
.dots i.on{background:var(--accent);}
.empty{padding:44px 16px; text-align:center; color:var(--faint); font:400 13.5px/1.6 var(--mono);}
:focus-visible{outline:2px solid var(--accent); outline-offset:2px; border-radius:4px;}
footer{margin-top:64px; padding-top:22px; border-top:1px solid var(--rule);
       font:400 12px/1.7 var(--mono); color:var(--faint);}
.nav{margin-top:20px; font:400 12.5px/1.7 var(--mono); color:var(--faint);}
.nav a{color:var(--dim); text-decoration:none; border-bottom:1px solid var(--rule);}
.nav a:hover{color:var(--accent); border-color:var(--accent-line);}
@media (max-width:640px){
  li{grid-template-columns:30px minmax(0,1fr);}
  li .tags{grid-row:auto; grid-column:2; margin-top:7px;}
}
@media (prefers-reduced-motion: reduce){ *{transition:none !important;} }
</style>
<link rel="stylesheet" href="doc-responsive.css">

<div class="wrap">
<header>
  <div class="eyebrow">Backlog · draft for review</div>
  <h1>200 ways this could be better</h1>
  <p class="sub">The prototype proves the substrate. Foundations rebuild coverage is tracked per item below.</p>
  <p class="nav"><a href="./">Pitch</a> · <a href="worlds.html">Worlds</a> ·
  <a href="evolution.html">Evolution</a> ·
  <a href="godgame.html">God layer</a> · <a href="next.html">The next 200</a> ·
  <a href="tides-weather.html">Tides &amp; weather</a> · <a href="geology.html">Geology</a> ·
  <a href="exoparams.html">Real parameters</a> · <a href="living.html">Alive</a> ·
  <a href="currents.html">Currents</a> ·
  <a href="realism.html">Realism</a> · <a href="life.html">Life</a> · <a href="surface.html">Surface</a> · <a href="worldspace.html">World space</a> · <a href="../vr/">Prototype</a></p>
  <dl class="tally">
    <div><dt>Items</dt><dd>${D.length}</dd></div>
    <div><dt>Done</dt><dd>${count(x=>x.st==='done')}<small>in vr/ prototype</small></dd></div>
    <div><dt>Partial</dt><dd>${count(x=>x.st==='partial')}<small>simplified but present</small></dd></div>
    <div><dt>Deferred</dt><dd>${count(x=>x.st==='deferred')}<small>out of this pass</small></dd></div>
    <div><dt>Impact 3</dt><dd>${count(x=>x.i===3)}<small>materially different without it</small></dd></div>
  </dl>
</header>

<div class="controls">
  <div class="filters">
    <span class="flabel">Status</span>
    <button class="f" data-k="st" data-v="done" aria-pressed="false">Done</button>
    <button class="f" data-k="st" data-v="partial" aria-pressed="false">Partial</button>
    <button class="f" data-k="st" data-v="deferred" aria-pressed="false">Deferred</button>
    <span class="flabel" style="margin-left:9px">Lineage</span>
    <button class="f se" data-k="s" data-v="SE" aria-pressed="false">SimEarth</button>
    <button class="f wb" data-k="s" data-v="WB" aria-pressed="false">WorldBox</button>
    <button class="f" data-k="s" data-v="BOTH" aria-pressed="false">Both</button>
    <button class="f" data-k="s" data-v="NEW" aria-pressed="false">Neither</button>
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

<footer>
  Generated from <code>scripts/backlog.mjs</code> — edit the source and re-run, do not edit the output.<br>
  SimEarth is a trademark of Electronic Arts; WorldBox of Maxim Karpenko. Referenced as prior art only.
</footer>
</div>

<script>
"use strict";
var DATA = ${data};
var CATS = ${cats};
var SRCLABEL = {SE:'SimEarth', WB:'WorldBox', BOTH:'Both', NEW:'Neither'};
var STLABEL = {done:'Done', partial:'Partial', deferred:'Deferred'};
var active = {s:new Set(), e:new Set(), i:new Set(), st:new Set()};
var query = '';
var listEl = document.getElementById('list');
var shownEl = document.getElementById('shown');

function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

function match(x){
  if (active.s.size && !active.s.has(x.s)) return false;
  if (active.e.size && !active.e.has(x.e)) return false;
  if (active.i.size && !active.i.has(String(x.i))) return false;
  if (active.st.size && !active.st.has(x.st)) return false;
  if (query){
    var hay = (x.t + ' ' + x.d + ' ' + x.r + ' ' + (x.st||'')).toLowerCase();
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
    var items = DATA.filter(function(x){ return x.c === cat.id && match(x); });
    if (!items.length) continue;
    total += items.length;
    html += '<section id="' + cat.id + '"><div class="sechead"><h2>' + esc(cat.name) +
            '</h2><span class="n">' + items.length + '</span></div>' +
            '<p class="blurb">' + esc(cat.blurb) + '</p><ol>';
    for (var k = 0; k < items.length; k++){
      var x = items[k];
      var cls = x.s === 'SE' ? 'se' : x.s === 'WB' ? 'wb' : x.s === 'BOTH' ? 'both' : 'new';
      html += '<li class="st-' + (x.st||'') + '"><span class="id">' + x.id + '</span>' +
              '<span class="t">' + esc(x.t) + '</span>' +
              '<span class="tags"><span class="tag st ' + (x.st||'') + '">' + STLABEL[x.st||'done'] + '</span>' +
              '<span class="tag ' + cls + '">' + SRCLABEL[x.s] + '</span>' +
              '<span class="tag e">' + x.e + '</span>' + dots(x.i) + '</span>' +
              '<span class="d">' + esc(x.d) + '</span>' +
              (x.r ? '<span class="r">' + esc(x.r) + '</span>' : '') + '</li>';
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
await mkdir(join(ROOT,'briefs'), {recursive:true});
await mkdir(join(ROOT,'site'),   {recursive:true});
await writeFile(join(ROOT,'briefs','backlog.md'), markdown() + '\n');
await writeFile(join(ROOT,'site','backlog.html'), html());

console.log(`backlog: ${D.length} items across ${CATS.length} categories`);
for (const [id,name] of CATS) console.log(`  ${String(byCat(id).length).padStart(3)}  ${name}`);
console.log(`\nlineage  SimEarth ${count(x=>x.src==='SE')} · WorldBox ${count(x=>x.src==='WB')} · both ${count(x=>x.src==='BOTH')} · neither ${count(x=>x.src==='NEW')}`);
console.log(`effort   S ${count(x=>x.e==='S')} · M ${count(x=>x.e==='M')} · L ${count(x=>x.e==='L')}`);
console.log(`impact   3 ${count(x=>x.i===3)} · 2 ${count(x=>x.i===2)} · 1 ${count(x=>x.i===1)}`);
console.log(`\nwrote briefs/backlog.md and site/backlog.html`);
