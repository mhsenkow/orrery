#!/usr/bin/env node
// Single source of truth for the ORRERY *worlds* backlog — the 200 steps that
// take us from five invented rulesets to a catalogue of real planets and moons.
// Emits  briefs/worlds-backlog.md  and  site/worlds.html  so the two can't drift.
// vr/catalogue.js gets playable BODY rows only; PHYS/UX stay in the docs.
//
//   node scripts/worlds.mjs
//
// Every number quoted in a BODY item was pulled from the NASA Exoplanet Archive
// `pscomppars` table (TAP, queried 2026-08) or from the relevant mission page.
// Where a value is contested the item says so rather than picking a side.
//
// k:  PHYS = engine capability (defines a slug)   BODY = a world to ship
//     UX   = instrument, pipeline or play
// s:  slug this item defines.   p: slugs it needs first.
// e:  effort S/M/L.             i: impact 1..3.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = [
  ['star', 'Stellar hosts and the light they cast',
   'Today the sun is a normalised direction vector and the sky is three constants per ruleset. Every world below orbits something with a temperature, a size, a temper and sometimes a corpse. This is the first bottleneck: until the star is an object, none of the catalogue can be honest.'],
  ['spin', 'Orbit, spin, and the shape of a world',
   'The prototype spins every planet once a day on a perfect sphere. Real bodies are locked, resonant, tumbling, flattened, torn into eggs, or wearing rings. This category is where "match them in form and shape" is actually paid for.'],
  ['matter', 'Material regimes and new chemistries',
   'Six gases and one liquid gets you Earth, Mars and a moon. It does not get you a magma ocean, a hydrogen envelope, a nitrogen glacier or rain made of iron. Each item here unlocks a whole shelf of the catalogue.'],
  ['sol', 'The Solar System as ground truth',
   'These eight-plus worlds are the only ones we have measured to death. If the engine cannot reproduce Venus and Titan from first principles, every exoplanet it renders is decoration. Ship them first as a calibration suite.'],
  ['moons', 'Moons as worlds in their own right',
   'The most interesting surfaces humanity has photographed are moons. They also force the hardest engine work — tidal heat, ice shells, eclipses, and a parent planet filling a third of the sky.'],
  ['temperate', 'Temperate rocky worlds',
   'The headline catalogue. Almost all of them orbit M dwarfs, almost all are tidally locked or nearly so, and almost none have a confirmed atmosphere. The honest version of this list is more interesting than the press-release version.'],
  ['furnace', 'Hot rock, lava and disintegration',
   'Ultra-short-period worlds where the surface is molten, the atmosphere is vaporised rock, and in a few cases the planet is visibly coming apart. Spectacular, mechanically distinct, and cheap once magma oceans exist.'],
  ['giant', 'Giants, hot Jupiters and sub-Neptunes',
   'Worlds with no surface at all. They break the core assumption of the engine — that there is a heightfield — which is precisely why building them makes the architecture better.'],
  ['arch', 'Architectures: young, wide, packed and eccentric',
   'Systems whose shape is the story: four planets you can see in one image, orbits at e = 0.95, six planets inside Mercury, and a system older than the thin disc of the galaxy.'],
  ['dark', 'Worlds with strange suns, or none',
   'Two suns, a dead sun, a neutron star, a brown dwarf, or nothing at all. These are the worlds that prove the simulation is a physics engine and not an Earth generator with sliders.'],
  ['instr', 'Instruments and legibility',
   'Bound by the "every number is a place" pillar. A catalogue of 150 worlds is a spreadsheet unless the player can see, in the world, why each one turned out the way it did.'],
  ['pipe', 'Catalogue pipeline and provenance',
   'One hundred and fifty hand-written ruleset literals is a maintenance disaster and a citation problem. The catalogue should be data, imported, dated, and honest about what is unknown.'],
  ['play', 'Play, scenarios and VR',
   'Ninety worlds is a menu, not a game. These are the items that turn the catalogue into something a person spends an evening inside.'],
];

const D = [

/* ------------------------------------------------------------------ star -- */
{c:'star',k:'PHYS',s:'spectrum',t:'Make the star an object, not a vector',d:'Give every ruleset a host with effective temperature, radius, mass and age, and derive everything downstream from those four numbers instead of the per-ruleset `solar` constant. TRAPPIST-1 is 2,566 K and 0.12 R☉; KELT-9 is roughly 10,000 K. Nothing else in this document works until this exists.',e:'M',i:3},
{c:'star',k:'PHYS',s:'lum',t:'Insolation from a real orbit',d:'Replace the hand-tuned `solar` scalar with S = L★/a², expressed in Earth units, so the catalogue can be imported straight from the archive column `pl_insol`. The range we need to span is S = 0.1 (TRAPPIST-1 h) to S = 636,000 (KOI-55 b) — seven orders of magnitude, which the current 0.7–1.2 slider cannot represent.',p:['spectrum'],e:'M',i:3},
{c:'star',k:'PHYS',s:'angsize',t:'The star at its true angular size',d:'From the surface of TRAPPIST-1 e the star is about 2° across — four Suns wide — and a dull ember red. From WD 1856+534 b the star is a white pinprick smaller than Venus looks from Earth. Angular size is one line of trigonometry and it is the single most convincing thing a player can be shown.',p:['spectrum'],e:'S',i:3},
{c:'star',k:'PHYS',s:'skycolor',t:'Sky and surface colour from the stellar spectrum',d:'Rayleigh scattering against a 2,600 K blackbody does not make a blue sky. Compute sky colour from the host spectrum convolved with the actual atmospheric composition, so an M-dwarf world reads as dim, orange and low-contrast without anyone hand-authoring `sky: [r,g,b]`.',p:['spectrum'],e:'M',i:3},
{c:'star',k:'PHYS',s:'redlight',t:'Red light and the limits of photosynthesis',d:'Oxygenic photosynthesis on Earth runs out of usable photons past about 750 nm. An M8 dwarf emits most of its light beyond that, which is why life around TRAPPIST-1 is a genuinely open question. Gate the biosphere on photon flux in a usable band, not on a temperature window.',p:['spectrum'],e:'M',i:3},
{c:'star',k:'PHYS',s:'flare',t:'Flares as discrete, dated events',d:'Proxima Centauri emitted a flare in 2019 that brightened it 14,000-fold in the ultraviolet for seven seconds. Model flares as Poisson events scaled by stellar age and rotation, stripping ozone, spiking surface UV, and writing a line in the chronicle each time.',p:['spectrum'],e:'M',i:3},
{c:'star',k:'PHYS',s:'xuv',t:'Integrated XUV erosion over the age of the system',d:'M dwarfs stay in a saturated high-energy phase for the first few hundred million years — long enough to strip an Earth atmosphere several times over. Integrate cumulative XUV dose against the escape parameter so "does this world have air" is an outcome, not a ruleset flag.',p:['spectrum','lum'],e:'M',i:3},
{c:'star',k:'PHYS',s:'evolve',t:'Stellar evolution across the run',d:'The Sun was about 70% as bright 4 Gyr ago and the faint-young-Sun paradox is the reason Daisyworld is in this codebase at all. Let luminosity track main-sequence brightening over deep time so ancient worlds start cold and end hot.',p:['spectrum'],e:'M',i:2},
{c:'star',k:'PHYS',s:'postms',t:'The red giant phase and engulfment',d:'Run the clock far enough and the host leaves the main sequence: the habitable zone sweeps outward past Mars-analogues and the inner planets are swallowed. It is the natural end-state for a god-game about deep time and it costs one luminosity curve.',p:['evolve'],e:'M',i:2},
{c:'star',k:'PHYS',s:'binary',t:'Binary and hierarchical hosts',d:'Two stars means two insolation terms, two shadows, and a habitable zone that is an annulus rather than a band. GJ 667 C is the third star of a triple; HD 131399 Ab has three suns and a sky that never fully darkens for part of its year.',p:['lum'],e:'M',i:3},
{c:'star',k:'PHYS',s:'beat',t:'The circumbinary insolation beat',d:'On Kepler-16 b the two stars orbit each other every 41 days inside the planet\'s 229-day year, so the received flux beats rather than varies smoothly, and the double shadow crosses the ground on its own cycle. This is the visual payoff of the whole binary item.',p:['binary'],e:'M',i:2},
{c:'star',k:'PHYS',s:'spots',t:'Starspots, and the lie they tell the spectrograph',d:'Half the "atmosphere detected" headlines in the catalogue are contested because an unspotted stellar surface is hard to assume. Model spot coverage, let it contaminate the transit spectrum instrument, and make the player earn the distinction. Nothing else teaches exoplanet science this efficiently.',p:['spectrum'],e:'M',i:2},
{c:'star',k:'PHYS',s:'ucd',t:'Ultracool dwarf hosts',d:'TRAPPIST-1 (M8 V, 2,566 K), LP 890-9 (M6 V) and SPECULOOS-3 (M6.5 V) are barely stars. Their habitable zones sit at 0.01–0.06 AU, which forces tidal locking, extreme flare exposure and orbital periods measured in days — three regimes at once from one host class.',p:['spectrum','lum'],e:'S',i:3},
{c:'star',k:'PHYS',s:'bd',t:'Brown dwarf hosts: infrared-only light',d:'2M1207 b orbits a 25-Jupiter-mass brown dwarf. The primary is cooler than a campfire and emits almost nothing in the visible. A world lit only in the infrared needs a different albedo model, a different sky, and a biosphere that cannot use light at all.',p:['spectrum','skycolor'],e:'M',i:3},
{c:'star',k:'PHYS',s:'wd',t:'White dwarf hosts',d:'WD 1856+534 b orbits a stellar corpse the size of Earth every 34 hours, receiving S ≈ 0.18 with an equilibrium temperature of 163 K. The host is small, blue-white, fading on a cooling track, and the habitable zone is so tight that tidal locking is guaranteed.',p:['spectrum','lum'],e:'M',i:2},
{c:'star',k:'PHYS',s:'pulsar',t:'Pulsar hosts: particles, not photons',d:'The PSR B1257+12 planets are heated by relativistic particle wind and X-rays, not by starlight. Albedo is meaningless, the "day side" is defined by the beam, and the surface chemistry is radiation-driven. It needs its own energy-budget path through the atmosphere tick.',p:['lum'],e:'M',i:2},
{c:'star',k:'PHYS',s:'sdb',t:'Stripped-core and subdwarf hosts',d:'KOI-55 b and c orbit a subdwarf B star — a red giant core stripped of its envelope — at 0.24 and 0.34 days, with equilibrium temperatures near 7,800 K and 6,900 K. They are probably the surviving cores of planets that were inside the giant. A whole story told by two rows in a table.',p:['postms','lum'],e:'S',i:2},
{c:'star',k:'PHYS',s:'nostar',t:'No star at all',d:'For free-floating planets the entire external energy term is zero, and the surface budget is radiogenic heat plus whatever the atmosphere retains. This is the cleanest possible test that the climate model is a physics model: set insolation to zero and see whether it still does something interesting.',p:['lum'],e:'M',i:3},

/* ------------------------------------------------------------------ spin -- */
{c:'spin',k:'PHYS',s:'lock',t:'1:1 tidal locking with a fixed substellar point',d:'`insolation()` currently blends an instantaneous sun-dot with an orbit-average so nothing freezes in shadow. A locked world needs the opposite: a permanent substellar point, a permanent antistellar point, and no diurnal cycle anywhere. This is the single highest-value item in the document, because most of the catalogue is locked.',e:'M',i:3},
{c:'spin',k:'PHYS',s:'eyeball',t:'Eyeball climatology',d:'A locked ocean world develops a substellar hot spot, a habitable terminator ring, and a nightside ice cap that never melts — the "eyeball planet". Getting the ring to emerge from the existing hydro and ice code, rather than being painted, is the proof the coupling works.',p:['lock'],e:'M',i:3},
{c:'spin',k:'PHYS',s:'collapse',t:'Nightside atmospheric collapse',d:'Below a threshold surface pressure, heat transport fails and the atmosphere condenses out permanently on the night side. Above it, circulation keeps the planet aired. Model the threshold and you get the actual scientific question about every locked world in the catalogue as a playable dial.',p:['lock'],e:'M',i:3},
{c:'spin',k:'PHYS',s:'jet',t:'Equatorial superrotation and the hotspot offset',d:'Hot Jupiters show their hottest point offset east of the substellar point because a broad equatorial jet drags heat downwind — measured on HD 189733 b and dozens since. Add a jet term to `computeWinds` for locked bodies and the offset falls out for free.',p:['lock'],e:'M',i:2},
{c:'spin',k:'PHYS',s:'res',t:'Spin-orbit resonances other than 1:1',d:'Mercury is in a 3:2 resonance: three rotations per two orbits, so a solar day lasts two Mercury years. Eccentric worlds prefer higher-order resonances to synchronous rotation, and it changes the whole thermal picture. Generalise the locking code to p:q rather than hard-coding synchronous.',p:['lock'],e:'M',i:2},
{c:'spin',k:'PHYS',s:'libration',t:'Libration and the twilight band',d:'A locked body with any eccentricity rocks back and forth, so the terminator sweeps a band rather than sitting on a line, and a strip of ground sees the star rise and set without a rotation. On the Moon this exposes an extra 9% of the surface. Small code, large flavour.',p:['lock','res'],e:'S',i:2},
{c:'spin',k:'PHYS',s:'ecc',t:'Eccentric orbits and flash heating',d:'HD 80606 b has e = 0.932: over six hours near periastron its upper atmosphere climbs from roughly 800 K to 1,500 K, and the whole planet is a seasonal catastrophe. `eccentricity` is already a ruleset field but only modulates insolation by a few percent — let it drive the orbit properly.',e:'M',i:3},
{c:'spin',k:'PHYS',s:'tidalheat',t:'Tidal heating as an internal energy source',d:'Io dissipates more heat per unit area than anywhere else in the Solar System, entirely because Europa and Ganymede keep its orbit eccentric. Add a tidal dissipation term driven by eccentricity, orbital distance and rigidity, and feed it into the existing volcanism budget rather than a new system.',p:['ecc'],e:'M',i:3},
{c:'spin',k:'PHYS',s:'obliq',t:'Obliquity as a genuinely free parameter',d:'The engine supports obliquity but only ever sees 0–25°. Uranus is at 98°, meaning each pole gets 42 years of continuous daylight then 42 of night; Venus is effectively at 177°. Test the seasonal code across the full range — it will break, and fixing it is worth more than any single world.',e:'S',i:3},
{c:'spin',k:'PHYS',s:'retro',t:'Retrograde and near-stopped rotation',d:'Venus turns backwards once every 243 days, slower than its 225-day year, so the Sun rises in the west twice per Venusian year. Allow negative and very long rotation periods without the Coriolis term (`1 / max(0.15, rotationPeriod)`) degenerating.',e:'S',i:2},
{c:'spin',k:'PHYS',s:'shape',t:'Body shape as a function, not an assumption',d:'The renderer builds a unit sphere and the sim indexes a cube-sphere. Introduce a single `radiusAt(direction)` hook that both consume, defaulting to 1.0. Every remaining shape item in this category becomes a small implementation of that one function.',e:'M',i:3},
{c:'spin',k:'PHYS',s:'oblate',t:'Rotational flattening',d:'Saturn is visibly squashed — about 10% flattening. Haumea spins in under four hours and is a triaxial ellipsoid roughly twice as long as it is thick. Derive flattening from rotation rate, density and gravity through `radiusAt`, and the gas giants stop looking like beach balls.',p:['shape'],e:'S',i:3},
{c:'spin',k:'PHYS',s:'roche',t:'Roche-lobe distortion — the egg-shaped planet',d:'WASP-12 b fills its Roche lobe and is measurably prolate, losing mass to its star through the inner Lagrange point while its orbit decays by tens of milliseconds per year. Nothing sells "this is a different regime" faster than a planet that is not round.',p:['shape'],e:'M',i:3},
{c:'spin',k:'PHYS',s:'triaxial',t:'Tidal bulges on locked moons',d:'A synchronously locked moon is a triaxial ellipsoid with its long axis pointed at the parent. Mimas and Io both show it. Combined with libration this produces real, visible flexing — which is also the geometry that generates the tidal heat.',p:['shape','lock','tidalheat'],e:'S',i:2},
{c:'spin',k:'PHYS',s:'irregular',t:'Bodies too small to be round',d:'Below roughly 400 km, self-gravity loses to material strength: Phobos is a 27 × 22 × 18 km potato, Hyperion is a sponge, Arrokoth is two lobes stuck together. Feed a low-order spherical-harmonic or signed-distance shape into `radiusAt` and the small-body shelf opens up.',p:['shape'],e:'M',i:2},
{c:'spin',k:'PHYS',s:'rings',t:'Rings as geometry and as shadow',d:'Rings need three things: a rendered annulus, a shadow band cast on the planet that migrates with season, and — for Saturn at 26.7° obliquity — an edge-on presentation twice per orbit. The shadow is what makes them feel physical rather than pasted on.',p:['shape','obliq'],e:'M',i:3},
{c:'spin',k:'PHYS',s:'moons',t:'Satellites in the sky',d:'Give a world a satellite list with real orbital elements, render them, and let them raise tides. Once this exists, the moons shelf can be entered from either side: stand on Europa and see Jupiter, or stand on Jupiter and watch four dots.',p:['shape'],e:'M',i:3},
{c:'spin',k:'PHYS',s:'eclipse',t:'Eclipses, and their thermal signature',d:'Io passes into Jupiter\'s shadow every 42 hours and its thin SO₂ atmosphere freezes onto the ground each time, then sublimates again — measured directly in 2023. An eclipse is not a lighting effect here; it is a chemistry event.',p:['moons','lock'],e:'M',i:2},
{c:'spin',k:'PHYS',s:'parent',t:'The parent planet filling the sky',d:'From Europa, Jupiter is about 12° across — twenty-four full Moons — and never moves from its spot in the sky, because Europa is locked. It lights the night side, it eclipses the Sun, and it is the reason the local view exists.',p:['moons','lock'],e:'M',i:3},
{c:'spin',k:'PHYS',s:'migrate',t:'Orbital decay and migration during the run',d:'TOI-2109 b and WASP-12 b are both spiralling in on measurable timescales; Phobos will hit Mars or shatter into a ring within about 50 Myr. Let semi-major axis be a state variable rather than a constant, and long runs acquire an ending.',p:['ecc'],e:'M',i:2},

/* ---------------------------------------------------------------- matter -- */
{c:'matter',k:'PHYS',s:'gassuite',t:'Extend the gas vector past six species',d:'The current mixture is N₂/O₂/CO₂/CH₄/H₂O/dust/sulphate. The catalogue needs H₂, He, NH₃, SO₂, CO, and rock vapour. Make the mixture a keyed map with per-species molar mass, condensation curve and opacity, rather than seven named fields.',e:'M',i:3},
{c:'matter',k:'PHYS',s:'hydrostatic',t:'Surface pressure and scale height from first principles',d:'`totalPressure()` sums mixing ratios, which is dimensionally meaningless. Compute column mass, then pressure from gravity, then scale height from mean molecular weight and temperature. Venus at 92 bar and Mars at 6 mbar should be the same code with different inputs.',p:['gassuite'],e:'M',i:3},
{c:'matter',k:'PHYS',s:'phase',t:'A real phase diagram per volatile',d:'`liquidWaterOk` is a boolean. Replace it with a triple-point-aware check per species, so CO₂ can snow on Mars, N₂ can glaciate on Pluto, methane can rain on Titan, and water can be supercritical on a hot sub-Neptune — all through one function.',p:['gassuite','hydrostatic'],e:'M',i:3},
{c:'matter',k:'PHYS',s:'magma',t:'Magma oceans',d:'Above roughly 1,500 K the surface is liquid rock. It convects, it has an albedo near 0.1, it quenches into a glassy crust on any night side, and it exchanges volatiles with the atmosphere far faster than solid rock does. This is the substrate for the entire furnace shelf.',p:['phase'],e:'M',i:3},
{c:'matter',k:'PHYS',s:'rockvapour',t:'Rock vapour atmospheres',d:'On K2-141 b (T_eq 2,103 K) the atmosphere is vaporised sodium, SiO and SiO₂, it extends only over the day side, winds reach supersonic speeds, and it rains molten rock back into the magma ocean. A closed mineral cycle with the same structure as Earth\'s water cycle.',p:['magma'],e:'M',i:3},
{c:'matter',k:'PHYS',s:'minclouds',t:'Mineral clouds',d:'Silicate and corundum clouds on brown dwarfs, quartz nanocrystals confirmed by JWST on WASP-17 b, and the glass rain of HD 189733 b. Reuse the existing cloud field but let the condensate species be chosen by temperature so clouds carry information about depth.',p:['phase'],e:'M',i:2},
{c:'matter',k:'PHYS',s:'ironrain',t:'Iron condensation and nightside iron rain',d:'On WASP-76 b iron is vapour on the day side at roughly 2,400 K and condenses as it crosses the terminator, so it rains iron on the night side. One extra condensable in the existing precipitation code produces the most famous image in exoplanet science.',p:['minclouds','jet'],e:'S',i:3},
{c:'matter',k:'PHYS',s:'escape',t:'Hydrodynamic escape and the radius valley',d:'The current escape rule is a linear leak on low gravity. Replace it with an energy-limited hydrodynamic model driven by XUV flux, which reproduces the observed scarcity of planets between 1.5 and 2.0 R⊕ as an emergent result rather than a fact stated in a tooltip.',p:['xuv','hydrostatic'],e:'M',i:3},
{c:'matter',k:'PHYS',s:'tail',t:'Escaping atmospheres with visible tails',d:'GJ 436 b trails a hydrogen cloud far larger than its star; GJ 3470 b has a helium tail; HD 209458 b was the first world caught evaporating. Render the tail. It is the only case in the catalogue where the atmosphere is visible from outside the planet.',p:['escape'],e:'M',i:2},
{c:'matter',k:'PHYS',s:'disintegrate',t:'Disintegrating planets',d:'Kepler-1520 b and K2-22 b produce comet-like dust tails whose transit depth varies from one orbit to the next, because the planet is actively boiling away. The body loses mass on-screen, and the run has a hard, dated end.',p:['rockvapour','migrate'],e:'M',i:2},
{c:'matter',k:'PHYS',s:'chthonian',t:'Stripped cores',d:'TOI-849 b has 41.8 M⊕ packed into 3.6 R⊕ — the naked core of a giant that lost its envelope, sitting in the hot-Neptune desert. Model the envelope as a removable layer so the same body can be run before and after.',p:['escape'],e:'M',i:2},
{c:'matter',k:'PHYS',s:'h2',t:'Primordial H₂/He envelopes and the end of the heightfield',d:'Most of the catalogue by mass has no surface. Introduce a pressure-level substrate — the sim runs on an isobar instead of a ground layer — so the existing cube-sphere machinery still works with `h` reinterpreted as depth into the envelope.',p:['gassuite','hydrostatic'],e:'L',i:3},
{c:'matter',k:'PHYS',s:'bands',t:'Banded circulation for giants',d:'The three-cell model in `computeWinds` becomes many-celled on a fast rotator with no surface drag: Jupiter has around a dozen alternating jets, Neptune has 500 m/s equatorial winds. Make the cell count a function of the Rhines scale rather than a constant.',p:['h2'],e:'M',i:3},
{c:'matter',k:'PHYS',s:'vortex',t:'Long-lived vortices',d:'The Great Red Spot has persisted for centuries; Neptune\'s dark spots come and go in years. Track vortices as objects that merge, shear and drift in latitude, which is also the only way a gas giant reads as alive from orbit.',p:['bands'],e:'M',i:2},
{c:'matter',k:'PHYS',s:'superpuff',t:'Super-puffs',d:'Kepler-51 b is 7.1 R⊕ and 2.1 M⊕ — a density around 0.03 g/cm³, less than cotton candy. Whether they are genuinely enormous or are ordinary planets with high hazes is unsettled; both readings should be reachable from the same simulation state.',p:['h2','haze'],e:'S',i:2},
{c:'matter',k:'PHYS',s:'hycean',t:'Hycean worlds',d:'A deep liquid-water ocean under a thick H₂ envelope, with surface pressures and temperatures that could be habitable well outside the classical zone. K2-18 b is the test case. Build it as a genuine regime with a real ocean, not a recoloured Terra.',p:['h2','phase'],e:'M',i:3},
{c:'matter',k:'PHYS',s:'waterworld',t:'Deep water worlds and high-pressure ice',d:'Past roughly 100 km of ocean, the floor is ice VI and VII rather than rock, which cuts off the silicate weathering thermostat that stabilises Earth\'s climate. A water world is not a wetter Earth; it is a world with the carbon cycle disconnected.',p:['phase','hydrostatic'],e:'M',i:3},
{c:'matter',k:'PHYS',s:'iceshell',t:'Ice shells over subsurface oceans',d:'A rigid conducting lid over a convecting liquid layer, with thickness set by the balance of tidal heat below and radiative loss above — 15–25 km on Europa, thinner at Enceladus\'s south pole. This is the most-requested habitat in planetary science and the engine has no concept of it.',p:['tidalheat','phase'],e:'L',i:3},
{c:'matter',k:'PHYS',s:'cryo',t:'Cryovolcanism',d:'Enceladus vents water vapour, salt and silica grains through the tiger stripes at its south pole, supplying Saturn\'s E ring. Reuse the volcano entity wholesale — same magma budget, same eruption schedule, different working fluid.',p:['iceshell'],e:'S',i:3},
{c:'matter',k:'PHYS',s:'n2glacier',t:'Nitrogen and methane glaciers',d:'Sputnik Planitia on Pluto is a convecting nitrogen ice sheet with cells tens of kilometres across, resurfacing itself on a timescale of centuries. The existing glacier mass-balance code should take the condensable species as a parameter.',p:['phase'],e:'M',i:2},
{c:'matter',k:'PHYS',s:'methanecycle',t:'A methane hydrological cycle',d:'Titan has rivers, lakes, seas, rain and a seasonal cycle — all in methane and ethane, at 94 K, under 1.5 bar of nitrogen. The hydro module should be able to run on a different liquid without any of it being special-cased.',p:['phase'],e:'M',i:3},
{c:'matter',k:'PHYS',s:'haze',t:'Photochemical haze and tholins',d:'Titan\'s orange comes from tholins produced when UV breaks up methane and nitrogen. The same process flattens the transmission spectra of sub-Neptunes like GJ 1214 b. Haze is an optical layer, a chemical sink and a plot device about what instruments cannot see.',p:['gassuite'],e:'M',i:3},
{c:'matter',k:'PHYS',s:'sulfur',t:'Sulfur chemistry',d:'Venus has a global sulfuric acid cloud deck that rains and evaporates before reaching the ground; Io is coated in SO₂ frost and sulfur allotropes that make it yellow. `sulphate` currently exists only as a volcanic-winter decay term.',p:['gassuite','phase'],e:'M',i:2},
{c:'matter',k:'PHYS',s:'carbon',t:'Carbon-rich worlds',d:'In a system with C/O above about 0.8 the mantle mineralogy is carbides and graphite instead of silicates, with diamond at depth. 55 Cnc e was the poster child before the ratio was revised downward — which is itself worth teaching.',p:['phase'],e:'M',i:1},
{c:'matter',k:'PHYS',s:'radiogenic',t:'Internal heat as the whole energy budget',d:'For a rogue planet, radiogenic decay plus leftover formation heat is all there is. A thick enough hydrogen envelope can still hold liquid water underneath it. Track internal heat as a decaying reservoir, and this becomes the one number that keeps a starless world alive.',p:['nostar'],e:'M',i:3},

/* ------------------------------------------------------------------- sol -- */
{c:'sol',k:'BODY',b:'Earth',t:'Earth, as the calibration target',d:'Terra is Earth-flavoured, not Earth. Pin a real Earth ruleset — 1 bar, 78/21 N₂/O₂, 288 K mean, 71% ocean, 23.4° obliquity — and make the test suite assert that it reproduces the observed mean temperature, ice fraction and land fraction within a stated tolerance. Every other world inherits its credibility from this one.',p:['spectrum','hydrostatic'],e:'M',i:3},
{c:'sol',k:'BODY',b:'Venus',t:'Venus',d:'92 bar of CO₂, 737 K at the surface, a global H₂SO₄ cloud deck, retrograde rotation once per 243 days, and a super-rotating atmosphere that laps the planet every four. The runaway greenhouse should emerge from the gas model, not be typed in.',p:['sulfur','retro','hydrostatic'],e:'M',i:3},
{c:'sol',k:'BODY',b:'Mars',t:'Mars, properly',d:'Ares is a good sketch; the real thing has 6 mbar of CO₂ that seasonally freezes out at the poles (moving several percent of the whole atmosphere), Hellas basin, Olympus Mons, and obliquity that has wandered between roughly 15° and 45° over megayears.',p:['phase','obliq'],e:'M',i:3},
{c:'sol',k:'BODY',b:'Mercury',t:'Mercury',d:'A 3:2 spin-orbit resonance giving a solar day two years long, 600 K at noon and 100 K before dawn, no atmosphere, a huge iron core — and water ice surviving in permanently shadowed polar craters despite all of it. The clearest demonstration in the Solar System that "hot planet" is not a useful category.',p:['res','airless'],e:'M',i:3},
{c:'sol',k:'BODY',b:'Jupiter',t:'Jupiter',d:'No surface, a dozen alternating jets, a 300-year-old anticyclone, and more heat leaving than arriving from the Sun. It is the first world in the catalogue that breaks the heightfield assumption, which makes it the right one to build the pressure-level substrate against.',p:['h2','bands','vortex'],e:'L',i:3},
{c:'sol',k:'BODY',b:'Saturn',t:'Saturn',d:'Ten percent rotational flattening, a hexagonal polar jet, and the rings — which need the shadow band, the seasonal opening and closing over the 29-year orbit, and the edge-on presentation. Both shape items are paid off by this single body.',p:['oblate','rings','bands'],e:'M',i:3},
{c:'sol',k:'BODY',b:'Uranus',t:'Uranus',d:'Obliquity 98°, so each pole gets 42 years of unbroken sunlight and then 42 of darkness. It is the strongest stress test in the Solar System for the seasonal insolation code and it will find bugs the other seven planets hide.',p:['obliq','h2','rings'],e:'M',i:3},
{c:'sol',k:'BODY',b:'Neptune',t:'Neptune',d:'The windiest place we know — supersonic equatorial jets near 500 m/s — powered by an internal heat source rather than sunlight, at 30 AU where insolation is a thousandth of Earth\'s. Dark spots appear and dissipate over a few years.',p:['bands','vortex','radiogenic'],e:'M',i:2},
{c:'sol',k:'BODY',b:'Pluto',t:'Pluto',d:'Nitrogen glaciers convecting in Sputnik Planitia, water-ice mountains that behave as bedrock at 40 K, a haze layer in 30 tonnes of atmosphere, a 3:2 resonance with Neptune, and a seasonal atmosphere that may partly collapse near aphelion.',p:['n2glacier','haze','phase'],e:'M',i:3},
{c:'sol',k:'BODY',b:'Ceres',t:'Ceres',d:'A dwarf planet with a briny interior, a 4 km cryovolcanic dome at Ahuna Mons, and bright carbonate deposits in Occator crater where subsurface brine reached the surface and froze. The smallest body where the ice-shell machinery still earns its keep.',p:['cryo','lowg'],e:'S',i:2},
{c:'sol',k:'BODY',b:'Eris / Sedna',t:'The far outer system',d:'Eris is Pluto-sized with a frozen-out atmosphere that will resublimate at perihelion; Sedna\'s 11,000-year orbit ranges from 76 to roughly 900 AU. Worlds where the year is longer than recorded human history, and the "seasons" are the whole plot.',p:['phase','ecc'],e:'S',i:1},
{c:'sol',k:'BODY',b:'Arrokoth / Bennu / 67P',t:'Small bodies that are not round',d:'Arrokoth is a contact binary; Bennu is a spinning rubble pile that ejects particles; 67P is a duck-shaped comet that grows a coma. These are the direct test of the irregular-shape work, and they are cheap once `radiusAt` accepts an arbitrary field.',p:['irregular','airless'],e:'M',i:2},

/* ----------------------------------------------------------------- moons -- */
{c:'moons',k:'BODY',b:'Luna',t:'The Moon, replacing Selene',d:'Selene is already a decent airless world. Make it the actual Moon: 1:1 locked to Earth with 9% extra surface exposed by libration, maria as flood basalt with a real date range, regolith gardening, and water ice in permanently shadowed polar craters.',p:['lock','libration','airless','parent'],e:'S',i:3},
{c:'moons',k:'BODY',b:'Io',t:'Io',d:'Around 400 active volcanoes, resurfacing the entire moon faster than craters can accumulate, powered purely by tidal flexing from the Laplace resonance. Its thin SO₂ atmosphere freezes to the ground during every 42-hour eclipse by Jupiter and sublimates again after.',p:['tidalheat','sulfur','eclipse','triaxial'],e:'M',i:3},
{c:'moons',k:'BODY',b:'Europa',t:'Europa',d:'A 15–25 km ice shell over a salt-water ocean holding perhaps twice Earth\'s surface water, a surface younger than 100 Myr, chaos terrain, and long arcuate cracks that record the shell rotating slightly faster than the interior.',p:['iceshell','tidalheat','parent'],e:'M',i:3},
{c:'moons',k:'BODY',b:'Ganymede',t:'Ganymede',d:'The largest moon in the Solar System, the only one with its own magnetic field, with grooved terrain from an ancient extensional episode and an ocean sandwiched between ice layers. The magnetosphere field in the ruleset finally does something.',p:['iceshell','moons'],e:'S',i:2},
{c:'moons',k:'BODY',b:'Callisto',t:'Callisto',d:'The most heavily cratered surface known — saturated, essentially unchanged for four billion years — because it sits outside the Laplace resonance and gets no tidal heat. It is the control experiment for Io and Europa, and it should be built alongside them for exactly that reason.',p:['iceshell','airless'],e:'S',i:2},
{c:'moons',k:'BODY',b:'Titan',t:'Titan',d:'1.5 bar of nitrogen, a full methane hydrological cycle with rivers, lakes and seas, a global tholin haze, dunes of solid organics along the equator, and a subsurface water ocean underneath. The single richest body in this document.',p:['methanecycle','haze','iceshell','lock'],e:'L',i:3},
{c:'moons',k:'BODY',b:'Enceladus',t:'Enceladus',d:'Five hundred kilometres across, venting water, salts, silica and molecular hydrogen from four fissures at its south pole, feeding Saturn\'s E ring. The hydrogen implies hydrothermal activity on the ocean floor — the strongest habitability case off Earth.',p:['cryo','iceshell','tidalheat'],e:'M',i:3},
{c:'moons',k:'BODY',b:'Triton',t:'Triton',d:'Orbiting Neptune backwards, so it was captured rather than formed there, and spiralling in toward eventual destruction. Nitrogen geysers, cantaloupe terrain, a tenuous atmosphere, and a surface at 38 K — among the coldest measured anywhere.',p:['retro','cryo','n2glacier','migrate'],e:'M',i:3},
{c:'moons',k:'BODY',b:'Miranda',t:'Miranda',d:'Four hundred and seventy kilometres of mismatched terrain jammed together, with Verona Rupes — a cliff up to 20 km high, the tallest known. In Uranus\'s 98° obliquity its seasons are as strange as its geology.',p:['iceshell','obliq','irregular'],e:'S',i:2},
{c:'moons',k:'BODY',b:'Iapetus',t:'Iapetus',d:'One hemisphere as dark as coal, the other as bright as snow, from a runaway thermal-segregation feedback as it sweeps up dust from Phoebe — plus a 13 km equatorial ridge that no one has explained. A world whose albedo map is a physical process, not a texture.',p:['lock','airless'],e:'M',i:2},
{c:'moons',k:'BODY',b:'Mimas',t:'Mimas',d:'A 396 km moon with a 130 km crater, and 2024 libration measurements implying a young subsurface ocean under an unfractured shell — an ocean world that looks nothing like one. The strongest argument in the catalogue for not judging a world by its surface.',p:['triaxial','iceshell','libration'],e:'S',i:2},
{c:'moons',k:'BODY',b:'Charon',t:'Pluto and Charon as a locked pair',d:'Both bodies are locked to each other, so each hangs motionless in the other\'s sky, orbiting a barycentre outside Pluto. Charon has a canyon system four times the length of the Grand Canyon and a red polar cap of Pluto-sourced methane.',p:['lock','parent','cryo'],e:'M',i:3},
{c:'moons',k:'BODY',b:'Uranian moons',t:'Ariel, Umbriel, Titania, Oberon',d:'Four mid-size icy moons around a planet tipped on its side, with resurfaced grabens on Ariel, an ancient dark surface on Umbriel, and possible ocean signatures on Titania. Ship them as a set — they share a substrate and cost far less than four separate builds.',p:['iceshell','obliq'],e:'M',i:1},
{c:'moons',k:'BODY',b:'Rhea / Dione / Tethys / Hyperion',t:'The rest of the Saturn system',d:'Dione and Tethys share their orbits with trojan moons; Tethys has Ithaca Chasma running most of the way around it; Rhea may once have had a ring. Hyperion earns its own line: it tumbles chaotically, with genuinely non-periodic rotation — the clearest macroscopic example of chaos in the Solar System — and is so porous it looks like a sponge.',p:['iceshell','moons','irregular','res'],e:'M',i:2},
{c:'moons',k:'BODY',b:'Phobos / Deimos',t:'Phobos and Deimos',d:'Phobos orbits below synchronous altitude, is spiralling inward, is grooved by tidal stress, and will break up into a ring within about 50 Myr. A moon with a countdown on it, and the cleanest possible demonstration of the migration item.',p:['irregular','migrate','lowg'],e:'S',i:2},

/* ------------------------------------------------------------- temperate -- */
{c:'temperate',k:'BODY',b:'TRAPPIST-1 e',t:'TRAPPIST-1 e',d:'0.92 R⊕, 0.69 M⊕, 6.10-day orbit, S = 0.65 — the closest thing to an Earth-analogue in the catalogue, and the primary JWST target. Locked, red-lit, flare-battered, and its atmosphere is still unresolved as of the last published spectra. Ship the uncertainty, not a conclusion.',p:['ucd','lock','eyeball','flare','redlight'],e:'M',i:3},
{c:'temperate',k:'BODY',b:'TRAPPIST-1 f',t:'TRAPPIST-1 f',d:'1.05 R⊕ at S = 0.37, 9.21-day orbit, T_eq 218 K. Cold enough that it needs a real greenhouse to be temperate at all — which makes it the test of whether the gas model can rescue a world the insolation cannot.',p:['ucd','lock','collapse'],e:'S',i:3},
{c:'temperate',k:'BODY',b:'TRAPPIST-1 g, h',t:'TRAPPIST-1 g and h, the cold pair',d:'g is 1.13 R⊕ at S = 0.27 — the outer edge of the optimistic zone, and the most likely of the seven to be a genuine water world given the density estimates. h is 0.76 R⊕ at S = 0.13 and T_eq 172 K on an 18.77-day year: frozen unless something unexpected is going on.',p:['ucd','lock','waterworld'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'TRAPPIST-1 d',t:'TRAPPIST-1 d',d:'0.79 R⊕, 0.39 M⊕, S = 1.12 — right at the inner edge, small enough that atmospheric retention is genuinely marginal. The natural Venus-versus-Earth fork in the system.',p:['ucd','lock','escape'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'TRAPPIST-1 b, c',t:'TRAPPIST-1 b and c, the airless pair',d:'S = 4.15 and 2.21. JWST thermal measurements are consistent with bare rock and little or no atmosphere on both. Shipping the negative result matters as much as shipping the hopeful ones, and it costs almost nothing on top of the shared host.',p:['ucd','lock','collapse','airless'],e:'S',i:3},
{c:'temperate',k:'BODY',b:'TRAPPIST-1 system',t:'The resonant chain as a playable system',d:'All seven planets are in a near-resonant chain, so their transit timings shift each other measurably — which is how their masses were weighed. Present the system as one object the player holds, with the planets tugging each other, rather than seven entries in a list.',p:['ucd','moons','migrate'],e:'M',i:3},
{c:'temperate',k:'BODY',b:'Proxima Cen b',t:'Proxima Centauri b',d:'The nearest exoplanet, at 1.30 pc. 1.05 M⊕ minimum, 11.19-day orbit, S = 0.64. Its host is a flare star that has been seen brightening 14,000× in the ultraviolet — the flare and XUV items exist mainly to make this world honest.',p:['lock','flare','xuv','eyeball'],e:'M',i:3},
{c:'temperate',k:'BODY',b:'Proxima Cen d',t:'Proxima Centauri d',d:'0.26 M⊕ on a 5.12-day orbit at S = 1.81 — one of the lowest-mass planets ever detected by radial velocity. A sub-Earth close in, around the same violent star as its famous neighbour.',p:['lock','escape','lowg'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'LHS 1140 b',t:'LHS 1140 b',d:'1.73 R⊕, 5.6 M⊕, S = 0.43 around a quiet M4.5 dwarf at 15 pc. The density allows either a dense rock-iron world or a substantial water layer, and JWST is actively arguing about it. The best "is this a water world" case study we have.',p:['waterworld','lock','iceshell'],e:'M',i:3},
{c:'temperate',k:'BODY',b:'TOI-700 d',t:'TOI-700 d',d:'1.07 R⊕, S = 0.82, 37.4-day orbit around an unusually calm M2.5 dwarf — no flares observed in a year of TESS monitoring. The counterexample to Proxima: same class of star, entirely different radiation environment.',p:['lock','flare','eyeball'],e:'S',i:3},
{c:'temperate',k:'BODY',b:'TOI-700 e',t:'TOI-700 e',d:'0.95 R⊕ at S = 1.27, interior to d, found two years later in extended TESS data. Two temperate Earth-size planets in one system, on opposite sides of the Earth-flux line.',p:['lock','collapse'],e:'S',i:2},
{c:'temperate',k:'BODY',b:"Teegarden b, c, d",t:"Teegarden's Star b, c and d",d:'b is 1.16 M⊕ at S = 1.08 and T_eq 277 K on a 4.91-day orbit around an M7 dwarf 3.83 pc away — on paper the closest match to Earth\'s insolation in the whole catalogue, around a star that emits almost nothing a plant could use. c and d follow at S = 0.35 and 0.12. All three were found by radial velocity, so none has a measured radius: good practice at rendering a world with a genuine hole in its data.',p:['ucd','lock','redlight'],e:'S',i:3},
{c:'temperate',k:'BODY',b:'Ross 128 b',t:'Ross 128 b',d:'1.4 M⊕, 9.87-day orbit, S = 1.38, 3.4 pc away, around one of the quietest M dwarfs known. Quiet host, moderate flux, close by — the "boring" temperate world, which is exactly why it is a useful control.',p:['lock','eyeball'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'GJ 273 b',t:"GJ 273 b (Luyten's star b)",d:'2.89 M⊕ at S = 1.06, 18.65 days, 5.9 pc. Notable beyond its parameters: it is one of the few worlds humanity has deliberately transmitted a message to, in 2017. That fact belongs in the chronicle.',p:['lock','eyeball'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'Wolf 1061 c / K2-3 d',t:'Wolf 1061 c and K2-3 d',d:'Wolf 1061 c is 3.4 M⊕ at S = 1.30, 4.3 pc away — a super-Earth at the inner edge, where the runaway greenhouse question is open rather than rhetorical. K2-3 d is 1.46 R⊕ at S = 1.36 on a 44.6-day orbit, far enough out that it may not be fully locked, which makes it a useful test of the boundary between the locked and unlocked regimes.',p:['lock','res','hydrostatic'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'Gliese 12 b',t:'Gliese 12 b',d:'0.93 R⊕, 12.76-day orbit, S = 1.62, T_eq 315 K, 12 pc away — one of the best nearby targets for asking whether a temperate M-dwarf planet kept its atmosphere at all. Effectively a Venus-or-Earth coin flip we can watch being resolved.',p:['lock','escape','collapse'],e:'S',i:3},
{c:'temperate',k:'BODY',b:'TOI-715 b',t:'TOI-715 b',d:'1.55 R⊕ at S = 0.67 on a 19.29-day orbit — a super-Earth squarely in the conservative zone of an M4 dwarf, and large enough that a thick atmosphere is plausible.',p:['lock','eyeball'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'LP 890-9 c',t:'LP 890-9 c',d:'1.37 R⊕, S = 0.91, around the second-coolest star known to host transiting planets after TRAPPIST-1. It is the natural companion build to the TRAPPIST system and shares almost all of its host physics.',p:['ucd','lock'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'GJ 357 d',t:'GJ 357 d',d:'6.1 M⊕ at S = 0.38, a 55.7-day orbit, 9.4 pc. A cold super-Earth that needs a few bar of CO₂ to be temperate at all — the greenhouse item is what decides whether this world is interesting or a rock.',p:['hydrostatic','phase'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'Kepler-186 f',t:'Kepler-186 f',d:'1.17 R⊕ at S = 0.29 on a 130-day orbit — the first Earth-size planet found in a habitable zone, in 2014, and still the historical anchor of the whole field. Far enough from its M1 host that it need not be locked.',p:['lum','obliq'],e:'S',i:3},
{c:'temperate',k:'BODY',b:'Kepler-442 b',t:'Kepler-442 b',d:'1.34 R⊕, S = 0.70, 112-day orbit around a K dwarf — by most published habitability indices the highest-scoring planet Kepler found. K dwarfs are also the quietest long-lived hosts, which is a point worth making in-game.',p:['lum','spectrum'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'Kepler-452 b',t:'Kepler-452 b',d:'1.63 R⊕, S = 1.1, 385-day year around a G2 star six billion years old — a genuine Sun analogue, so this is the one world in the catalogue where an Earth-like day-night cycle needs no special pleading. Its existence as a planet has been questioned; say so.',p:['lum','evolve'],e:'S',i:3},
{c:'temperate',k:'BODY',b:'Kepler-1649 c',t:'Kepler-1649 c',d:'1.06 R⊕ at S = 0.75 — the closest match to Earth in radius and insolation simultaneously among all Kepler planets, and it was recovered from data an automated pipeline had thrown away.',p:['lock','ucd'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'Kepler-62 e, f',t:'Kepler-62 e and f',d:'1.61 R⊕ at S = 1.4 and 1.41 R⊕ at S = 0.48, around a K2 dwarf — two temperate planets in one system, both long modelled as ocean worlds. Ship them together against the water-world substrate.',p:['waterworld','lum'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'Kepler-22 b',t:'Kepler-22 b',d:'2.1 R⊕ at S = 1.0 on a 290-day orbit around a G5 star — the first habitable-zone planet Kepler confirmed, in 2011. At that radius it is more likely a small Neptune than a rock, which is a lesson the catalogue should teach directly.',p:['h2','lum'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'Kepler-438 b, 1229 b',t:'Kepler-438 b and Kepler-1229 b',d:'1.12 R⊕ at S = 1.4 and 1.40 R⊕ at S = 0.49. Kepler-438 b was among the most Earth-like on paper until its host was found to flare violently roughly every hundred days, which probably sterilised it. A clean demonstration that habitability is about the star.',p:['flare','xuv'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'tau Cet f',t:'tau Ceti f and its siblings',d:'1.81 R⊕ at S = 0.28 on a 636-day orbit around a G8 star 3.6 pc away — visible to the naked eye, with a debris disc ten times denser than the Kuiper belt, so the impact rate is part of its story.',p:['lum','ecc'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'Kapteyn c',t:'Kapteyn c',d:'7 M⊕ at S = 0.17 around a halo star roughly 11 billion years old that orbits the galaxy backwards — probably stripped from a dwarf galaxy the Milky Way ate. A world older than the Solar System by more than twice.',p:['evolve','lum'],e:'S',i:2},
{c:'temperate',k:'BODY',b:'Barnard b–e',t:"Barnard's Star's four sub-Earths",d:'Four planets of 0.19–0.34 M⊕ on 2.34–6.74-day orbits around the second-nearest stellar system, at 1.83 pc, all confirmed within the last two years. Too hot and too small to be temperate — and worth shipping precisely because the nearest single star turned out to host a set of tiny scorched worlds rather than an Earth.',p:['lock','lowg','escape'],e:'S',i:3},

/* --------------------------------------------------------------- furnace -- */
{c:'furnace',k:'BODY',b:'55 Cnc e',t:'55 Cancri e',d:'1.88 R⊕, 8 M⊕, an 18-hour year, S = 2,658, T_eq 1,958 K. JWST found evidence in 2024 for a genuine secondary atmosphere of CO and CO₂ outgassing from a magma ocean — the first plausible atmosphere on a rocky exoplanet, and it is on the least likely candidate imaginable.',p:['magma','rockvapour','lock'],e:'M',i:3},
{c:'furnace',k:'BODY',b:'K2-141 b',t:'K2-141 b',d:'A 6.7-hour orbit, T_eq 2,103 K, with a magma ocean roughly 100 km deep, an atmosphere of vaporised sodium and silicon monoxide covering only the day side, supersonic winds, and rain made of rock. The purest expression of the rock-vapour cycle.',p:['rockvapour','magma','jet'],e:'M',i:3},
{c:'furnace',k:'BODY',b:'CoRoT-7 b',t:'CoRoT-7 b',d:'The first transiting rocky exoplanet, in 2009: 1.68 R⊕, 4.1 M⊕, 20.5-hour orbit, T_eq 1,756 K. It established that the lava-world regime exists at all, and it belongs in the catalogue for that alone.',p:['magma','lock'],e:'S',i:2},
{c:'furnace',k:'BODY',b:'Kepler-10 b',t:'Kepler-10 b',d:'Kepler\'s first rocky confirmation: 1.47 R⊕, 20-hour year, S = 3,742, T_eq 2,188 K, around a star roughly 11 billion years old. An ancient star with a molten planet.',p:['magma','evolve'],e:'S',i:2},
{c:'furnace',k:'BODY',b:'Kepler-78 b',t:'Kepler-78 b',d:'Almost exactly Earth\'s radius (1.2 R⊕) and Earth\'s density, on an 8.5-hour orbit at S = 4,070. An Earth twin in every respect except the one that matters, and the clearest single argument that composition and irradiation are independent axes.',p:['magma','migrate'],e:'S',i:3},
{c:'furnace',k:'BODY',b:'GJ 367 b',t:'GJ 367 b',d:'0.72 R⊕, 0.5 M⊕, a 7.7-hour year — a sub-Earth denser than iron-rich rock, roughly 91% core by mass. Probably the stripped remnant of something larger. The high-density end of the mass-radius diagram, with a face.',p:['magma','chthonian','escape'],e:'S',i:3},
{c:'furnace',k:'BODY',b:'LHS 3844 b',t:'LHS 3844 b',d:'1.29 R⊕ at S = 74, and the Spitzer phase curve shows almost no heat redistribution to the night side — meaning bare rock with essentially no atmosphere, probably basalt. The strongest published case for a locked world that lost everything.',p:['lock','collapse','airless'],e:'S',i:3},
{c:'furnace',k:'BODY',b:'GJ 1132 b',t:'GJ 1132 b',d:'1.19 R⊕ at S = 19, 12.6 pc — repeatedly claimed and retracted as having a secondary atmosphere. It is the canonical Venus-analogue target and the canonical example of how hard these measurements are.',p:['escape','sulfur','spots'],e:'S',i:2},
{c:'furnace',k:'BODY',b:'GJ 486 b',t:'GJ 486 b',d:'1.29 R⊕, T_eq 696 K, and a JWST spectrum that is equally consistent with water vapour on the planet and with cool starspots on the host. Build both readings and let the player pick an instrument to distinguish them.',p:['spots','phase'],e:'M',i:3},
{c:'furnace',k:'BODY',b:'HD 219134 b / HD 3167 b',t:'HD 219134 b and HD 3167 b',d:'HD 219134 b is the nearest transiting rocky planet at 6.5 pc — 1.6 R⊕ on a 3.09-day orbit at S = 176, around a host bright enough to see with the naked eye, which makes it the best "go outside and look at it" world in the catalogue. HD 3167 b is the same size on a 23-hour orbit at S = 1,650, in a system whose inner and outer orbits are close to mutually perpendicular — a geometry no formation model comfortably explains.',p:['magma','lock','obliq'],e:'S',i:2},
{c:'furnace',k:'BODY',b:'K2-137 b',t:'K2-137 b',d:'An Earth-size planet on a 4.3-hour orbit around an M dwarf — one of the shortest years known. It is close to the point where the planet would be torn apart, which makes it the natural pairing with the Roche and migration work.',p:['roche','migrate','magma'],e:'S',i:2},
{c:'furnace',k:'BODY',b:'Kepler-1520 b',t:'Kepler-1520 b',d:'A disintegrating planet: its transit depth varies from one 15.7-hour orbit to the next because what is blocking the star is a comet-like tail of condensing mineral dust, not a solid disc. Expected to be gone entirely within roughly 100 Myr.',p:['disintegrate','rockvapour'],e:'M',i:3},
{c:'furnace',k:'BODY',b:'K2-22 b',t:'K2-22 b',d:'The second disintegrator, with a 9.1-hour orbit and a tail that sometimes leads and sometimes trails. Two examples make it a class rather than an anomaly, which is the difference between a curiosity and a mechanic.',p:['disintegrate'],e:'S',i:2},
{c:'furnace',k:'BODY',b:'TOI-849 b',t:'TOI-849 b',d:'41.8 M⊕ inside 3.6 R⊕ on an 18-hour orbit — the exposed core of a gas giant, sitting in the hot-Neptune desert where nothing should survive. Either it lost its envelope or never got one, and the simulation can show both paths.',p:['chthonian','escape'],e:'M',i:3},
{c:'furnace',k:'BODY',b:'GJ 9827 d',t:'GJ 9827 d',d:'1.98 R⊕ with a JWST-detected water-rich atmosphere and T_eq 675 K — a genuine steam world, where the atmosphere is mostly H₂O rather than hydrogen. A distinct regime between rock and sub-Neptune.',p:['phase','waterworld'],e:'M',i:2},
{c:'furnace',k:'BODY',b:'LP 791-18 d',t:'LP 791-18 d',d:'An Earth-size planet whose orbit is kept eccentric by a heavier neighbour, so it should be flexing hard enough to drive Io-like volcanism — possibly the most volcanically active world known, and it sits just outside the habitable zone. Io physics on a planet.',p:['tidalheat','ecc','sulfur'],e:'M',i:3},
{c:'furnace',k:'BODY',b:'Kepler-36 b, c',t:'Kepler-36 b and c',d:'Two planets whose orbits come within about five Earth-Moon distances of each other, yet whose densities differ by a factor of eight — a dense rock and a puffy sub-Neptune as immediate neighbours. From b, the other planet would appear larger than the Moon does from Earth.',p:['h2','moons','migrate'],e:'M',i:3},

/* ----------------------------------------------------------------- giant -- */
{c:'giant',k:'BODY',b:'51 Peg b',t:'51 Pegasi b',d:'The first planet found around a Sun-like star, in 1995: 0.47 Jupiter masses on a 4.23-day orbit, which nobody\'s formation theory allowed. It should be the first entry a player is handed after the Solar System, for exactly that reason.',p:['h2','lock','jet'],e:'M',i:3},
{c:'giant',k:'BODY',b:'HD 209458 b',t:'HD 209458 b (Osiris)',d:'The first transiting planet, the first with a detected atmosphere, and the first caught evaporating — a hydrogen envelope escaping fast enough to form a comet-like tail. Almost every technique in the field was invented on this one world.',p:['h2','tail','escape'],e:'M',i:3},
{c:'giant',k:'BODY',b:'HD 189733 b',t:'HD 189733 b',d:'Deep blue in reflected light — from silicate clouds, not water — with 2 km/s winds and rain that is molten glass blowing sideways. At 19.8 pc it is the best-characterised hot Jupiter in the sky.',p:['minclouds','jet','h2'],e:'M',i:3},
{c:'giant',k:'BODY',b:'WASP-12 b',t:'WASP-12 b',d:'Fills its Roche lobe, is measurably egg-shaped, is losing mass to its star through the inner Lagrange point, and its orbit is decaying by about 29 milliseconds per year — a planet with a measured death date, roughly 3 Myr out.',p:['roche','shape','migrate','escape'],e:'M',i:3},
{c:'giant',k:'BODY',b:'WASP-76 b',t:'WASP-76 b',d:'Day side near 2,400 K where iron is vapour, night side cool enough that it condenses — so iron rains out along the terminator. The most vivid single image in exoplanet science, and once the ironrain item exists this world is nearly free.',p:['ironrain','jet','lock'],e:'S',i:3},
{c:'giant',k:'BODY',b:'WASP-121 b',t:'WASP-121 b',d:'Tidally distorted into an ellipsoid, T_eq 2,409 K, with magnesium and iron escaping the upper atmosphere entirely, quartz clouds detected on the night side, and — in 2025 — SiO reported. A Roche-distorted world with a full mineral weather system.',p:['roche','minclouds','escape'],e:'M',i:3},
{c:'giant',k:'BODY',b:'KELT-9 b',t:'KELT-9 b',d:'T_eq 3,921 K, S = 44,900 — hotter than most K dwarfs. Molecular hydrogen dissociates on the day side and recombines on the night side, so the heat transport is chemical rather than thermal. The single most extreme irradiation regime in the catalogue.',p:['h2','jet','rockvapour'],e:'M',i:3},
{c:'giant',k:'BODY',b:'TOI-2109 b',t:'TOI-2109 b',d:'The shortest-period hot Jupiter known, at 16 hours, T_eq 3,646 K, and detectably spiralling inward. The clearest candidate for actually watching a planet fall into its star during a long run.',p:['migrate','roche'],e:'S',i:2},
{c:'giant',k:'BODY',b:'WASP-33 b',t:'WASP-33 b',d:'Orbits a pulsating A-type star backwards over its pole, with a temperature inversion driven by TiO absorption high in the atmosphere — a stratosphere made by a metal oxide.',p:['h2','obliq','minclouds'],e:'S',i:2},
{c:'giant',k:'BODY',b:'WASP-19 b',t:'WASP-19 b',d:'A 19-hour orbit around a G8 dwarf at T_eq 2,113 K, and among the first hot Jupiters where the host star\'s activity was shown to contaminate the transmission spectrum. Pair it with the starspot item.',p:['spots','h2'],e:'S',i:1},
{c:'giant',k:'BODY',b:'WASP-17 b',t:'WASP-17 b',d:'Nearly twice Jupiter\'s radius at half its mass, on a retrograde orbit — and in 2023 JWST identified quartz nanocrystal clouds in its atmosphere, the first direct detection of SiO₂ clouds anywhere.',p:['minclouds','retro','superpuff'],e:'S',i:2},
{c:'giant',k:'BODY',b:'TrES-2 b',t:'TrES-2 b',d:'Reflects less than 1% of the light that hits it — darker than coal, the least reflective planet known, and yet glowing dull red from its own heat. A world defined entirely by its albedo.',p:['h2','minclouds'],e:'S',i:2},
{c:'giant',k:'BODY',b:'Kepler-7 b / HAT-P-7 b',t:'Kepler-7 b and HAT-P-7 b — the first weather maps',d:'Kepler-7 b was the first exoplanet to have a cloud map made of it: reflective clouds concentrated on the western half of the day side, at a density of 0.17 g/cm³. On HAT-P-7 b, Kepler watched the brightness peak wander, implying clouds forming and dispersing on the night side and blowing across the terminator over weeks. Weather, observed a thousand light years away — and the reference cases for the phase-curve instrument.',p:['minclouds','jet'],e:'M',i:3},
{c:'giant',k:'BODY',b:'WASP-127 b',t:'WASP-127 b',d:'A puffed-up sub-Saturn where 2025 measurements found supersonic equatorial winds around 9 km/s — the fastest jet measured on any planet. The Rhines-scale work has a hard number to be checked against.',p:['bands','jet'],e:'S',i:2},
{c:'giant',k:'BODY',b:'KELT-1 b',t:'KELT-1 b',d:'27 Jupiter masses transiting on a 30-hour orbit — a brown dwarf by mass but a planet by every observational method used to find it. The deliberately ambiguous entry that forces the catalogue to define its own boundary.',p:['bd','h2'],e:'S',i:1},
{c:'giant',k:'BODY',b:'GJ 436 b',t:'GJ 436 b',d:'A warm Neptune trailing a hydrogen cloud far larger than its own star, on an eccentric 2.64-day orbit that should have circularised long ago. Both facts point at a third body nobody has found.',p:['tail','escape','ecc'],e:'M',i:3},
{c:'giant',k:'BODY',b:'GJ 3470 b',t:'GJ 3470 b',d:'A sub-Neptune losing helium in a tail detected from the ground, plus a JWST detection of SO₂ — sulfur photochemistry in a hydrogen atmosphere, which was not predicted.',p:['tail','sulfur'],e:'S',i:2},
{c:'giant',k:'BODY',b:'HAT-P-11 b',t:'HAT-P-11 b',d:'A Neptune on an eccentric, strongly misaligned orbit around a K dwarf, with water detected in a comparatively clear atmosphere — the counterexample to the flat, hazy spectra of most small planets.',p:['ecc','obliq','phase'],e:'S',i:2},
{c:'giant',k:'BODY',b:'LTT 9779 b',t:'LTT 9779 b',d:'An ultra-hot Neptune that should not exist — sitting inside the desert where irradiation strips envelopes — with an albedo near 0.8 from metallic and silicate clouds. The most reflective planet known, surviving where nothing survives.',p:['minclouds','escape','chthonian'],e:'M',i:3},
{c:'giant',k:'BODY',b:'GJ 1214 b',t:'GJ 1214 b',d:'The archetypal hazy sub-Neptune: a featureless transmission spectrum that defeated a decade of instruments, until JWST\'s phase curve showed a highly reflective, metal-rich, hazy atmosphere. The world that made haze a first-class citizen.',p:['haze','h2'],e:'M',i:3},
{c:'giant',k:'BODY',b:'K2-18 b / TOI-270 d',t:'K2-18 b and TOI-270 d — the hycean argument',d:'Both show methane and CO₂ from JWST. K2-18 b\'s claimed dimethyl sulfide signal is heavily contested, and TOI-270 d may be a miscible hot envelope rather than an ocean under a sky. Ship the disagreement as the content: two interpretations, one dataset, and an instrument that cannot yet separate them.',p:['hycean','haze','waterworld'],e:'L',i:3},

/* ------------------------------------------------------------------ arch -- */
{c:'arch',k:'BODY',b:'HR 8799',t:'HR 8799 b, c, d, e',d:'Four giant planets, all directly imaged, all moving visibly in a decade of frames, in a near 8:4:2:1 resonant chain around an A5 star at 41 pc. The only system where a player can be shown the actual photographs next to the simulation.',p:['bd','radiogenic','moons'],e:'M',i:3},
{c:'arch',k:'BODY',b:'beta Pic b, c',t:'Beta Pictoris b and c',d:'Two young giants inside a famous edge-on debris disc, one on a 24-year orbit and one on 3.3. The planets are still hot from formation, so their light is their own, not reflected — a fundamentally different rendering problem.',p:['radiogenic','young'],e:'M',i:2},
{c:'arch',k:'BODY',b:'51 Eri b',t:'51 Eridani b',d:'A young Jupiter with a strong methane signature and a temperature around 700 K — the closest analogue we have imaged to what Jupiter looked like shortly after it formed. The bridge between the giants shelf and the Solar System shelf.',p:['young','radiogenic','h2'],e:'S',i:2},
{c:'arch',k:'BODY',b:'HIP 65426 b',t:'HIP 65426 b',d:'JWST\'s first directly imaged exoplanet, at 92 AU from an A2 star. A world that can only be studied in the infrared, because its host would drown it at any shorter wavelength.',p:['young','spectrum'],e:'S',i:2},
{c:'arch',k:'BODY',b:'GJ 504 b / HD 106906 b',t:'The far outliers',d:'GJ 504 b orbits a Sun-like star at roughly 44 AU and is modelled as magenta from a cloudless, methane-poor atmosphere. HD 106906 b sits around 700 AU out and strongly misaligned with its debris disc — the closest thing observed to the hypothesised Planet Nine geometry.',p:['young','radiogenic'],e:'S',i:2},
{c:'arch',k:'BODY',b:'AU Mic b',t:'AU Mic b',d:'A Neptune-size planet orbiting a 23-million-year-old M dwarf, inside a debris disc with dust waves visibly propagating outward. A planet being built while you watch, with the impact rate to match.',p:['young','xuv','escape'],e:'M',i:3},
{c:'arch',k:'BODY',b:'V1298 Tau b / K2-33 b',t:'Planets still contracting',d:'V1298 Tau b is 9.4 R⊕ at roughly 23 Myr and K2-33 b is 5 R⊕ at around 10 Myr — both far larger than they will end up, because they have not finished cooling and shrinking. Radius as a function of age, on-screen.',p:['young','escape','h2'],e:'M',i:2},
{c:'arch',k:'PHYS',s:'young',t:'Youth as a state: hot, inflated, still accreting',d:'A world 10 Myr old is glowing from its own formation heat, is physically larger than its final size, sits inside a disc, and is being hit constantly. Make age a real parameter that drives internal heat, radius and impact rate rather than a label.',p:['radiogenic'],e:'M',i:3},
{c:'arch',k:'BODY',b:'HD 80606 b / HD 20782 b / Kepler-1704 b',t:'The eccentric extremes',d:'HD 80606 b runs e = 0.932 on a 111-day orbit, swinging from about 0.85 AU to 0.03 AU, with its upper atmosphere heating from roughly 800 K to 1,500 K in six hours at closest approach and a shockwave of storms afterwards. HD 20782 b reaches e = 0.95 over 597 days and Kepler-1704 b e = 0.92 over 989. Each spends almost all its year in the cold and a few days being roasted — a seasonal cycle with no Solar System equivalent.',p:['ecc','jet','h2'],e:'M',i:3},
{c:'arch',k:'BODY',b:'Kepler-11 / Kepler-90',t:'Packed systems',d:'Kepler-11 has six planets inside Mercury\'s orbit, several with densities too low for their mass. Kepler-90 has eight, the joint record. Both are about architecture rather than any individual world, and both need the system view to make any sense.',p:['moons','migrate','h2'],e:'M',i:2},
{c:'arch',k:'BODY',b:'Kepler-444 / Kepler-1625 b',t:'The oldest system, and the exomoon candidate',d:'Kepler-444 hosts five sub-Earths around a star roughly 11.2 billion years old — planets that formed when the galaxy was a fifth its present age. Kepler-1625 b carries the best-known exomoon candidate, a Neptune-size satellite whose existence is still disputed.',p:['evolve','moons'],e:'M',i:2},

/* ------------------------------------------------------------------ dark -- */
{c:'dark',k:'BODY',b:'Kepler-16 b',t:'Kepler-16 b — Tatooine',d:'A Saturn-mass planet circling both stars of a 41-day eclipsing binary on a 229-day orbit, T_eq 206 K. Two shadows on the ground, two sunsets at different colours, and an insolation curve that beats rather than cycles.',p:['binary','beat'],e:'M',i:3},
{c:'dark',k:'BODY',b:'Kepler-47 c, Kepler-1647 b, TOI-1338 b',t:'The rest of the circumbinaries',d:'Kepler-47 c sits in the habitable zone of its pair; Kepler-1647 b is the largest known circumbinary on a 1,108-day orbit; TOI-1338 b was found in TESS data by a high-school intern. Cheap once Kepler-16 b exists, and they turn a novelty into a class.',p:['binary','beat'],e:'S',i:2},
{c:'dark',k:'BODY',b:'PSO J318.5-22',t:'PSO J318.5-22',d:'Roughly 8 Jupiter masses, free-floating with no star at all, 24 pc away, and variable in brightness as patchy iron and silicate clouds rotate in and out of view. A planet whose only weather report comes from its own thermal glow.',p:['nostar','minclouds','radiogenic'],e:'M',i:3},
{c:'dark',k:'BODY',b:'WISE 0855-0714',t:'WISE 0855-0714',d:'The coldest object of its kind known, around 250 K, only 2.2 pc away — and the first outside the Solar System where water clouds were detected. Below freezing, and it has weather.',p:['nostar','phase','minclouds'],e:'M',i:3},
{c:'dark',k:'BODY',b:'SIMP J0136 / CFBDSIR 2149',t:'Rogues with weather bands',d:'SIMP J0136 rotates in 2.4 hours and shows banded, layered clouds and aurorae mapped by JWST in 2025; CFBDSIR 2149-0403 is a young free-floating candidate. Banded circulation on a body with no star to drive it.',p:['nostar','bands','minclouds'],e:'M',i:2},
{c:'dark',k:'BODY',b:'OGLE-2016-BLG-1928',t:'The Earth-mass rogues',d:'Detected by a microlensing event lasting 42 minutes — an Earth-mass or Mars-mass object wandering the galaxy with no star. Population estimates suggest rogues may outnumber stars, which reframes the entire catalogue.',p:['nostar','radiogenic'],e:'M',i:3},
{c:'dark',k:'BODY',b:'MOA-2011-BLG-262L b',t:'MOA-2011-BLG-262L b',d:'Either a 17 M⊕ planet around a low-mass star or an Earth-mass moon around a free-floating giant — the data genuinely does not distinguish them. A world that has to be shipped as two mutually exclusive readings.',p:['nostar','moons'],e:'S',i:2},
{c:'dark',k:'BODY',b:'2M1207 b',t:'2M1207 b',d:'The first exoplanet ever directly imaged, in 2004: about 5 Jupiter masses orbiting a 25-Jupiter-mass brown dwarf at 41 AU, still hot from formation at around 1,160 K. Two objects, neither of them a star.',p:['bd','young','radiogenic'],e:'M',i:3},
{c:'dark',k:'BODY',b:'Luhman 16 AB',t:'Luhman 16 AB',d:'The nearest brown dwarf binary at 2 pc, and the first object outside the Solar System to have a surface weather map made of it — patchy clouds rotating in and out of view every five hours. The reference target for the mineral cloud work.',p:['bd','minclouds','bands'],e:'M',i:2},
{c:'dark',k:'BODY',b:'OTS 44',t:'OTS 44',d:'A planetary-mass object of roughly 11 Jupiter masses, free-floating, with its own dust disc and active accretion — forming like a star, at the mass of a planet. It breaks the definition, which is the point of including it.',p:['nostar','young'],e:'S',i:1},
{c:'dark',k:'BODY',b:'WD 1856+534 b',t:'WD 1856+534 b',d:'A Jupiter-size planet transiting a white dwarf every 34 hours, so deeply that it blocks over half the light. It must have migrated inward after the star died, since its current orbit was inside the former red giant.',p:['wd','postms','migrate'],e:'M',i:3},
{c:'dark',k:'BODY',b:'WD J0914+1914',t:'WD J0914+1914',d:'A white dwarf accreting hydrogen, oxygen and sulfur from a giant planet it is actively evaporating — the first planet found being destroyed by a stellar corpse. The end-state of the postms item, made visible.',p:['wd','escape','tail'],e:'M',i:2},
{c:'dark',k:'BODY',b:'PSR B1257+12 b, c, d',t:'The first exoplanets ever found',d:'Detected in 1992 around a millisecond pulsar — 0.02, 4.3 and 3.9 M⊕ on 25-, 67- and 98-day orbits. They predate 51 Peg b by three years, they are bathed in relativistic particles, and they probably formed from the debris of whatever the supernova destroyed.',p:['pulsar','nostar'],e:'M',i:3},
{c:'dark',k:'BODY',b:'PSR B1620-26 b',t:'PSR B1620-26 b — Methuselah',d:'Roughly 12.7 billion years old, in the globular cluster M4, orbiting a pulsar and a white dwarf together. Formed in a metal-poor environment where planets were not supposed to be able to form at all.',p:['pulsar','binary','evolve'],e:'S',i:2},
{c:'dark',k:'BODY',b:'PSR J1719-1438 b / KOI-55',t:'Planets made from dead stars',d:'PSR J1719-1438 b orbits in 2.2 hours with a density above 23 g/cm³ — a stripped white dwarf core, probably crystalline carbon. KOI-55 b and c orbit a subdwarf B star in under 8 hours at nearly 7,800 K, likely the surviving cores of planets that were swallowed. Three worlds that used to be something else.',p:['sdb','pulsar','carbon','chthonian'],e:'M',i:3},
{c:'dark',k:'BODY',b:'OGLE-2005-BLG-390L b',t:'OGLE-2005-BLG-390L b — Hoth',d:'5.5 M⊕ at about 2.6 AU from a small M dwarf, 6.6 kpc away toward the galactic bulge, with an estimated surface temperature near 50 K. Found by a microlensing event that will never repeat, so everything we will ever know about it is already known.',p:['lum','phase','n2glacier'],e:'S',i:2},

/* ----------------------------------------------------------------- instr -- */
{c:'instr',k:'UX',t:'A system browser you hold, not a menu you scroll',d:'The current UI is five buttons and number keys 1–5. Ninety-plus worlds needs a physical shelf: an orrery of systems you reach into, pull a planet out of, and drop into your hands. This is the interaction the product is named after and it does not exist yet.',p:['moons'],e:'L',i:3},
{c:'instr',k:'UX',t:'The transit spectrum instrument',d:'Point an instrument at your own world and get back the spectrum an observer 40 light years away would actually measure — noisy, low-resolution, and degenerate. Then let the player compare it to the real JWST spectrum of that planet. This is the single best teaching device available to us.',p:['gassuite','haze','spots'],e:'L',i:3},
{c:'instr',k:'UX',t:'The phase curve instrument',d:'Watch the brightness of your world over an orbit and read the hotspot offset, the day-night contrast and the cloud asymmetry off the curve — the same way HD 189733 b and Kepler-7 b were characterised. It turns invisible circulation into a line you can watch bend.',p:['jet','lock','minclouds'],e:'M',i:3},
{c:'instr',k:'UX',t:'The habitable zone as a place you stand in',d:'Render the conservative and optimistic zone boundaries as a physical band in the orrery that moves as the star evolves and sweeps outward at the end of the main sequence. Habitability stops being a label and becomes a location.',p:['lum','evolve'],e:'M',i:3},
{c:'instr',k:'UX',t:'Hold two worlds at once',d:'Side-by-side comparison at true relative scale, with the same instruments applied to both. Callisto next to Europa, TRAPPIST-1 b next to e, Venus next to Earth — every important point in this document is a comparison, not a single object.',e:'M',i:3},
{c:'instr',k:'UX',t:'"Why is it like this" — a causal readout',d:'Tap any state and get the chain that produced it: this ice sheet exists because insolation is 0.37 Earth and the CO₂ column is thin because the star stripped it in the first 300 Myr. The engine already computes every link; it just never shows the chain.',e:'M',i:3},
{c:'instr',k:'UX',t:'Make uncertainty visible',d:'Half these worlds have no measured mass, or a radius with 20% error, or a contested atmosphere. Render unknowns as visible fog or flicker rather than picking a number silently. A catalogue that hides its error bars is teaching the wrong lesson.',p:['spots'],e:'M',i:3},
{c:'instr',k:'UX',t:'The sky as the instrument',d:'Stand on the surface in the local view and look up: star colour and angular size, the parent planet, the other moons, the rings edge-on, two shadows, an aurora. Everything in the spin and star categories should be verifiable by looking, not by reading a panel.',p:['angsize','parent','rings','beat'],e:'M',i:3},

/* ------------------------------------------------------------------ pipe -- */
{c:'pipe',k:'UX',t:'Import from the NASA Exoplanet Archive',d:'A build-time script hitting the TAP service at `exoplanetarchive.ipac.caltech.edu/TAP/sync` against the `pscomppars` table, pulling radius, mass, period, semi-major axis, eccentricity, insolation, equilibrium temperature and host parameters. Hand-authoring 150 ruleset literals is not a plan.',e:'M',i:3},
{c:'pipe',k:'UX',t:'Derive ruleset parameters from catalogue columns',d:'A pure function from archive row to ruleset: gravity from mass and radius, freeze point from composition, locking from period and distance, relief from gravity, plate count from radius. Then the hand-authored part of each world is only its character, not its physics.',p:['spectrum','lum'],e:'M',i:3},
{c:'pipe',k:'UX',t:'Provenance and citation on every world',d:'Each entry carries its source, the reference date, and a link. When the archive updates a mass, the world changes and the chronicle records that it changed. This is what separates a science toy from a science instrument.',e:'S',i:3},
{c:'pipe',k:'UX',t:'Pin a snapshot, and be honest about nulls',d:'The archive is a moving target — Barnard\'s Star gained four planets in two years and tau Ceti\'s list has been revised repeatedly. Commit a dated snapshot so builds are reproducible, and give every missing value an explicit "unknown" path rather than a silent default.',e:'S',i:3},

/* ------------------------------------------------------------------ play -- */
{c:'play',k:'UX',t:'An archetype ladder rather than a flat list',d:'Ninety worlds presented at once is a spreadsheet. Order them so each new world introduces exactly one new mechanic — Earth, then Mars, then the Moon, then Venus, then Europa, then TRAPPIST-1 e — and the catalogue teaches itself in the order the physics was built.',e:'M',i:3},
{c:'play',k:'UX',t:'A scenario per world, in one sentence',d:'"Keep TRAPPIST-1 e\'s atmosphere through a thousand flares." "Stop Venus before 92 bar." "Find the terminator band where anything can live." Each world in this document has one obvious question attached to it; write it down and make it a win condition.',e:'M',i:3},
{c:'play',k:'UX',t:'A chronicle voice per regime',d:'The chronicle currently narrates a temperate Earth. A magma world needs a different vocabulary, a rogue planet needs a colder one, and a pulsar planet\'s history is measured in the star\'s pulses. Cheap, and it is most of what the player takes away.',e:'S',i:2},
{c:'play',k:'UX',t:'The scale moment in VR',d:'Hold TRAPPIST-1 in two hands at once — all seven planets fit inside Mercury\'s orbit, so the whole system is a grapefruit. Then shrink to stand on e and look up at a star four times the width of the Sun. That single transition is the argument for the headset.',p:['angsize','ucd'],e:'M',i:3},
];

/* --------------------------------------------------------------- assemble -- */
const catIds = new Set(CATS.map(c => c[0]));
for (const x of D) if (!catIds.has(x.c)) throw new Error(`unknown category "${x.c}" on "${x.t}"`);
D.forEach((x, n) => { x.id = n + 1; });

// Every prerequisite slug must be defined by some PHYS item.
const slugs = new Set(D.filter(x => x.s).map(x => x.s));
// Slugs the existing engine already provides.
for (const s of ['airless', 'lowg']) slugs.add(s);
const missing = new Set();
for (const x of D) for (const p of x.p || []) if (!slugs.has(p)) missing.add(`${p} (needed by "${x.t}")`);
if (missing.size) throw new Error('undefined prerequisite slugs:\n  ' + [...missing].join('\n  '));

const byCat = c => D.filter(x => x.c === c);
const count = f => D.filter(f).length;
const KIND = { PHYS: 'Engine', BODY: 'World', UX: 'Product' };
const dependents = s => D.filter(x => (x.p || []).includes(s)).length;

/* ----------------------------------------------------------------- md -- */
function markdown() {
  const L = [];
  L.push('# ORRERY — worlds backlog');
  L.push('');
  L.push(`**${D.length} items.** Generated from \`scripts/worlds.mjs\` — edit that file, not this one, then run \`node scripts/worlds.mjs\`.`);
  L.push('');
  L.push(`The prototype ships five invented rulesets. This is the route from there to a catalogue of real planets and moons, built so that each world is a *consequence* of parameters rather than a hand-painted skin.`);
  L.push('');
  L.push(`Composition: **${count(x => x.k === 'PHYS')}** engine capabilities, **${count(x => x.k === 'BODY')}** worlds to ship, **${count(x => x.k === 'UX')}** instrument, pipeline and play items.`);
  L.push('');
  L.push('The in-app Worlds picker lists playable bodies only. Engine (PHYS) and product (UX) items are a roadmap — they live here and in `site/worlds.html`, not as clickable catalogue entries.');
  L.push('');
  L.push(`Effort is S/M/L. Impact is 1–3, where 3 means the catalogue is materially worse without it. **Needs** lists the engine capabilities an item depends on — a world cannot be built before its physics exists.`);
  L.push('');
  L.push('Every quoted figure comes from the NASA Exoplanet Archive `pscomppars` table (queried 2026-08) or the relevant mission publication. Contested results are flagged as contested rather than resolved.');
  L.push('');
  L.push('## The critical path');
  L.push('');
  L.push('The engine capabilities that the largest number of other items are waiting on:');
  L.push('');
  L.push('| Capability | Item | Unblocks |');
  L.push('|---|---|---|');
  for (const x of D.filter(y => y.s).sort((a, b) => dependents(b.s) - dependents(a.s)).slice(0, 12)) {
    L.push(`| \`${x.s}\` | ${x.id}. ${x.t} | ${dependents(x.s)} items |`);
  }
  L.push('');
  for (const [id, name, blurb] of CATS) {
    const items = byCat(id);
    L.push(`## ${name} — ${items.length}`);
    L.push('');
    L.push(`_${blurb}_`);
    L.push('');
    L.push('| # | Item | Detail | Kind | Needs | Effort | Impact |');
    L.push('|---|---|---|---|---|---|---|');
    for (const x of items) {
      const body = x.b ? ` <br>\`${x.b}\`` : '';
      const needs = (x.p || []).length ? (x.p || []).map(p => '`' + p + '`').join(' ') : '—';
      const gives = x.s ? ` <br>gives \`${x.s}\`` : '';
      L.push(`| ${x.id} | **${x.t}**${gives} | ${x.d}${body} | ${KIND[x.k]} | ${needs} | ${x.e} | ${x.i} |`);
    }
    L.push('');
  }
  return L.join('\n');
}

/* --------------------------------------------------------------- html -- */
function html() {
  const data = JSON.stringify(D.map(x => ({
    id: x.id, c: x.c, t: x.t, d: x.d, k: x.k, e: x.e, i: x.i,
    b: x.b || '', s: x.s || '', p: x.p || [],
  })));
  const cats = JSON.stringify(CATS.map(([id, name, blurb]) => ({ id, name, blurb })));
  const dep = JSON.stringify(Object.fromEntries(D.filter(x => x.s).map(x => [x.s, dependents(x.s)])));
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ORRERY — 200 real worlds</title>
<style>
:root{
  --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#e0a050; --accent-soft:rgba(224,160,80,.13); --accent-line:rgba(224,160,80,.34);
  --phys:#7fb0e0; --phys-soft:rgba(127,176,224,.14);
  --body:#7dd6a0; --body-soft:rgba(125,214,160,.14);
  --ux:#c98ad6;  --ux-soft:rgba(201,138,214,.14);
  --sans:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--text);font:15px/1.55 var(--sans);
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:0 22px 90px}
header{padding:60px 0 26px;border-bottom:1px solid var(--rule)}
h1{font:600 34px/1.15 var(--serif);margin:0 0 12px;letter-spacing:-.01em}
.sub{color:var(--dim);max-width:64ch;font-size:15px}
.sub b{color:var(--text)}
.counts{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.pill{font:500 12px/1 var(--mono);padding:6px 10px;border-radius:999px;
  border:1px solid var(--rule);background:var(--panel);color:var(--dim)}
.pill.phys{color:var(--phys);border-color:rgba(127,176,224,.3);background:var(--phys-soft)}
.pill.body{color:var(--body);border-color:rgba(125,214,160,.3);background:var(--body-soft)}
.pill.ux{color:var(--ux);border-color:rgba(201,138,214,.3);background:var(--ux-soft)}

.crit{margin:34px 0 0;padding:20px 22px;background:var(--panel);border:1px solid var(--rule);border-radius:12px}
.crit h2{font:600 13px/1 var(--sans);letter-spacing:.09em;text-transform:uppercase;color:var(--accent);margin:0 0 4px}
.crit p{color:var(--dim);font-size:13.5px;margin:0 0 14px;max-width:66ch}
.crit ol{margin:0;padding:0;list-style:none;display:grid;gap:7px;
  grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.crit li{display:flex;align-items:baseline;gap:8px;font-size:13.5px;padding:7px 10px;
  background:var(--panel2);border:1px solid var(--rule);border-radius:8px}
.crit code{font:500 11.5px var(--mono);color:var(--phys);background:var(--phys-soft);
  padding:2px 6px;border-radius:5px;flex:none}
.crit .u{margin-left:auto;color:var(--faint);font:500 11.5px var(--mono);flex:none}

.controls{position:sticky;top:0;z-index:5;background:rgba(12,15,22,.93);
  backdrop-filter:blur(12px);border-bottom:1px solid var(--rule);margin-top:34px;
  padding:14px 0 13px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
button.f{font:500 12px/1 var(--sans);color:var(--dim);background:var(--panel);
  border:1px solid var(--rule);border-radius:7px;padding:7px 11px;cursor:pointer}
button.f:hover{color:var(--text);border-color:var(--faint)}
button.f[aria-pressed="true"]{color:var(--ground);background:var(--accent);border-color:var(--accent)}
.sep{width:1px;height:20px;background:var(--rule);margin:0 4px}
#q{font:13px var(--sans);color:var(--text);background:var(--panel);border:1px solid var(--rule);
  border-radius:7px;padding:7px 11px;min-width:190px;flex:1}
#q:focus{outline:none;border-color:var(--accent-line)}
#shown{color:var(--faint);font:500 12px var(--mono);margin-left:auto}

section{padding-top:46px}
.sechead{display:flex;align-items:baseline;gap:12px;border-bottom:1px solid var(--rule);padding-bottom:9px}
.sechead h2{font:600 22px/1.2 var(--serif);margin:0}
.sechead .n{font:500 12px var(--mono);color:var(--faint)}
.blurb{color:var(--dim);font-size:13.5px;max-width:70ch;margin:12px 0 4px}
ol.items{list-style:none;margin:14px 0 0;padding:0}
ol.items li{display:grid;grid-template-columns:42px 1fr;gap:0 14px;padding:15px 0;
  border-bottom:1px solid var(--rule)}
.id{font:500 12px var(--mono);color:var(--faint);padding-top:3px}
.t{font-weight:600;font-size:15.5px;grid-column:2}
.tags{grid-column:2;display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;align-items:center}
.tag{font:500 11px/1 var(--mono);padding:4px 7px;border-radius:5px;border:1px solid var(--rule);color:var(--dim)}
.tag.PHYS{color:var(--phys);background:var(--phys-soft);border-color:rgba(127,176,224,.28)}
.tag.BODY{color:var(--body);background:var(--body-soft);border-color:rgba(125,214,160,.28)}
.tag.UX{color:var(--ux);background:var(--ux-soft);border-color:rgba(201,138,214,.28)}
.tag.gives{color:var(--accent);background:var(--accent-soft);border-color:var(--accent-line)}
.dots{display:inline-flex;gap:3px;align-items:center;padding-left:2px}
.dots i{width:5px;height:5px;border-radius:50%;background:var(--rule)}
.dots i.on{background:var(--accent)}
.d{grid-column:2;color:var(--dim);font-size:14px;margin-top:8px;max-width:74ch}
.needs{grid-column:2;margin-top:8px;font:11.5px var(--mono);color:var(--faint)}
.needs code{color:var(--phys);background:var(--phys-soft);padding:2px 5px;border-radius:4px;margin-right:4px}
.ref{grid-column:2;margin-top:7px;font:11.5px var(--mono);color:var(--faint)}
.empty{color:var(--faint);padding:60px 0;text-align:center}
footer{margin-top:70px;padding-top:22px;border-top:1px solid var(--rule);
  color:var(--faint);font-size:12.5px}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
@media (max-width:640px){
  ol.items li{grid-template-columns:1fr}
  .id{grid-column:1}.t,.tags,.d,.needs,.ref{grid-column:1}
  h1{font-size:27px}
}
</style>
<link rel="stylesheet" href="doc-responsive.css">
<div class="wrap">
<header>
  <h1>Two hundred real worlds</h1>
  <p class="sub">ORRERY ships five invented rulesets. This is the route from there to a catalogue of
  actual planets and moons — tidally locked worlds, moons with oceans under ice, planets orbiting
  brown dwarfs, pulsars and white dwarfs, and planets orbiting nothing at all — built so that each
  world is a <b>consequence</b> of its parameters rather than a hand-painted skin.
  Engine and product items here are a roadmap; the in-app Worlds picker only lists playable bodies.</p>
  <div class="counts" id="counts"></div>
</header>

<div class="crit">
  <h2>The critical path</h2>
  <p>Engine capabilities ordered by how many other items are waiting on them. A world cannot be
  built before its physics exists, so these come first.</p>
  <ol id="crit"></ol>
</div>

<div class="controls">
  <button class="f" data-k="k" data-v="PHYS" aria-pressed="false">Engine</button>
  <button class="f" data-k="k" data-v="BODY" aria-pressed="false">Worlds</button>
  <button class="f" data-k="k" data-v="UX" aria-pressed="false">Product</button>
  <span class="sep"></span>
  <button class="f" data-k="e" data-v="S" aria-pressed="false">S</button>
  <button class="f" data-k="e" data-v="M" aria-pressed="false">M</button>
  <button class="f" data-k="e" data-v="L" aria-pressed="false">L</button>
  <span class="sep"></span>
  <button class="f" data-k="i" data-v="3" aria-pressed="false">Impact 3</button>
  <button class="f" data-k="i" data-v="2" aria-pressed="false">2</button>
  <button class="f" data-k="i" data-v="1" aria-pressed="false">1</button>
  <input id="q" placeholder="Search worlds, mechanics, numbers…">
  <span id="shown"></span>
</div>

<div id="list"></div>

<footer>
  Generated from <code>scripts/worlds.mjs</code>. Planetary parameters from the
  <a href="https://exoplanetarchive.ipac.caltech.edu/">NASA Exoplanet Archive</a>
  <code>pscomppars</code> table, queried 2026-08, plus mission publications.
  Contested results are marked contested, not resolved.
</footer>
</div>

<script>
var DATA = ${data};
var CATS = ${cats};
var DEP  = ${dep};
var KIND = {PHYS:'Engine', BODY:'World', UX:'Product'};
var active = {k:new Set(), e:new Set(), i:new Set()};
var query = '';
var listEl = document.getElementById('list');
var shownEl = document.getElementById('shown');

function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

(function(){
  var n = {PHYS:0, BODY:0, UX:0};
  for (var i=0;i<DATA.length;i++) n[DATA[i].k]++;
  document.getElementById('counts').innerHTML =
    '<span class="pill">' + DATA.length + ' items</span>' +
    '<span class="pill phys">' + n.PHYS + ' engine capabilities</span>' +
    '<span class="pill body">' + n.BODY + ' worlds to ship</span>' +
    '<span class="pill ux">' + n.UX + ' instruments &amp; pipeline</span>';
})();

(function(){
  var slugs = Object.keys(DEP).sort(function(a,b){ return DEP[b]-DEP[a]; }).slice(0,12);
  var byslug = {};
  for (var i=0;i<DATA.length;i++) if (DATA[i].s) byslug[DATA[i].s] = DATA[i];
  var h = '';
  for (var j=0;j<slugs.length;j++){
    var x = byslug[slugs[j]];
    h += '<li><code>' + esc(x.s) + '</code><span>' + esc(x.t) + '</span>' +
         '<span class="u">' + DEP[x.s] + '</span></li>';
  }
  document.getElementById('crit').innerHTML = h;
})();

function match(x){
  if (active.k.size && !active.k.has(x.k)) return false;
  if (active.e.size && !active.e.has(x.e)) return false;
  if (active.i.size && !active.i.has(String(x.i))) return false;
  if (query){
    var hay = (x.t + ' ' + x.d + ' ' + x.b + ' ' + x.s + ' ' + x.p.join(' ')).toLowerCase();
    if (hay.indexOf(query) === -1) return false;
  }
  return true;
}

function dots(n){
  var out = '<span class="dots">';
  for (var i=1;i<=3;i++) out += '<i class="' + (i<=n?'on':'') + '"></i>';
  return out + '</span>';
}

function render(){
  var html = '', total = 0;
  for (var ci=0; ci<CATS.length; ci++){
    var cat = CATS[ci];
    var items = DATA.filter(function(x){ return x.c === cat.id && match(x); });
    if (!items.length) continue;
    total += items.length;
    html += '<section id="' + cat.id + '"><div class="sechead"><h2>' + esc(cat.name) +
            '</h2><span class="n">' + items.length + '</span></div>' +
            '<p class="blurb">' + esc(cat.blurb) + '</p><ol class="items">';
    for (var k=0;k<items.length;k++){
      var x = items[k];
      html += '<li><span class="id">' + x.id + '</span>' +
              '<span class="t">' + esc(x.t) + '</span>' +
              '<span class="tags"><span class="tag ' + x.k + '">' + KIND[x.k] + '</span>' +
              (x.s ? '<span class="tag gives">gives ' + esc(x.s) + ' &middot; unblocks ' + (DEP[x.s]||0) + '</span>' : '') +
              '<span class="tag">' + x.e + '</span>' + dots(x.i) + '</span>' +
              '<span class="d">' + esc(x.d) + '</span>' +
              (x.p.length ? '<span class="needs">needs ' + x.p.map(function(p){
                 return '<code>' + esc(p) + '</code>'; }).join('') + '</span>' : '') +
              (x.b ? '<span class="ref">' + esc(x.b) + '</span>' : '') +
              '</li>';
    }
    html += '</ol></section>';
  }
  if (!total) html = '<p class="empty">Nothing matches those filters.</p>';
  listEl.innerHTML = html;
  shownEl.textContent = 'Showing ' + total + ' of ' + DATA.length;
}

var btns = document.querySelectorAll('button.f');
for (var b=0;b<btns.length;b++){
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
await mkdir(join(ROOT, 'vr'), { recursive: true });
await writeFile(join(ROOT, 'briefs', 'worlds-backlog.md'), markdown() + '\n');
await writeFile(join(ROOT, 'site', 'worlds.html'), html());
await writeFile(join(ROOT, 'vr', 'catalogue.js'), catalogueModule());

console.log(`worlds: ${D.length} items across ${CATS.length} categories`);
for (const [id, name] of CATS) console.log(`  ${String(byCat(id).length).padStart(3)}  ${name}`);
console.log(`\nkind     engine ${count(x => x.k === 'PHYS')} · worlds ${count(x => x.k === 'BODY')} · product ${count(x => x.k === 'UX')}`);
console.log(`effort   S ${count(x => x.e === 'S')} · M ${count(x => x.e === 'M')} · L ${count(x => x.e === 'L')}`);
console.log(`impact   3 ${count(x => x.i === 3)} · 2 ${count(x => x.i === 2)} · 1 ${count(x => x.i === 1)}`);
console.log('\ncritical path:');
for (const x of D.filter(y => y.s).sort((a, b) => dependents(b.s) - dependents(a.s)).slice(0, 8)) {
  console.log(`  ${String(dependents(x.s)).padStart(3)}  ${x.s.padEnd(12)} ${x.t}`);
}
console.log('\nwrote briefs/worlds-backlog.md, site/worlds.html, vr/catalogue.js');

/* ------------------------------------------- in-game catalogue module -- */
function catalogueModule() {
  const bodies = D.filter((x) => x.k === 'BODY');
  const bodyCats = new Set(bodies.map((x) => x.c));
  const cats = CATS.filter(([id]) => bodyCats.has(id)).map(([id, name, blurb]) => ({ id, name, blurb }));
  const items = bodies.map((x) => ({
    id: x.id,
    c: x.c,
    k: x.k,
    t: x.t,
    d: x.d,
    e: x.e,
    i: x.i,
    b: x.b || '',
    s: x.s || '',
    p: x.p || [],
  }));
  return `/** Auto-generated from scripts/worlds.mjs — do not edit by hand.
 *  Playable BODY entries only. Engine (PHYS) and product (UX) backlog lives in
 *  briefs/worlds-backlog.md and site/worlds.html.
 */
export const CATALOGUE_CATS = ${JSON.stringify(cats, null, 2)};
export const CATALOGUE = ${JSON.stringify(items, null, 2)};
export const CATALOGUE_KIND = { BODY: 'World' };
`;
}
