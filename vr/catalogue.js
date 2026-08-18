/** Auto-generated from scripts/worlds.mjs — do not edit by hand.
 *  Playable BODY entries only. Engine (PHYS) and product (UX) backlog lives in
 *  briefs/worlds-backlog.md and site/worlds.html.
 */
export const CATALOGUE_CATS = [
  {
    "id": "sol",
    "name": "The Solar System as ground truth",
    "blurb": "These eight-plus worlds are the only ones we have measured to death. If the engine cannot reproduce Venus and Titan from first principles, every exoplanet it renders is decoration. Ship them first as a calibration suite."
  },
  {
    "id": "moons",
    "name": "Moons as worlds in their own right",
    "blurb": "The most interesting surfaces humanity has photographed are moons. They also force the hardest engine work — tidal heat, ice shells, eclipses, and a parent planet filling a third of the sky."
  },
  {
    "id": "temperate",
    "name": "Temperate rocky worlds",
    "blurb": "The headline catalogue. Almost all of them orbit M dwarfs, almost all are tidally locked or nearly so, and almost none have a confirmed atmosphere. The honest version of this list is more interesting than the press-release version."
  },
  {
    "id": "furnace",
    "name": "Hot rock, lava and disintegration",
    "blurb": "Ultra-short-period worlds where the surface is molten, the atmosphere is vaporised rock, and in a few cases the planet is visibly coming apart. Spectacular, mechanically distinct, and cheap once magma oceans exist."
  },
  {
    "id": "giant",
    "name": "Giants, hot Jupiters and sub-Neptunes",
    "blurb": "Worlds with no surface at all. They break the core assumption of the engine — that there is a heightfield — which is precisely why building them makes the architecture better."
  },
  {
    "id": "arch",
    "name": "Architectures: young, wide, packed and eccentric",
    "blurb": "Systems whose shape is the story: four planets you can see in one image, orbits at e = 0.95, six planets inside Mercury, and a system older than the thin disc of the galaxy."
  },
  {
    "id": "dark",
    "name": "Worlds with strange suns, or none",
    "blurb": "Two suns, a dead sun, a neutron star, a brown dwarf, or nothing at all. These are the worlds that prove the simulation is a physics engine and not an Earth generator with sliders."
  }
];
export const CATALOGUE = [
  {
    "id": 64,
    "c": "sol",
    "k": "BODY",
    "t": "Earth, as the calibration target",
    "d": "Terra is Earth-flavoured, not Earth. Pin a real Earth ruleset — 1 bar, 78/21 N₂/O₂, 288 K mean, 71% ocean, 23.4° obliquity — and make the test suite assert that it reproduces the observed mean temperature, ice fraction and land fraction within a stated tolerance. Every other world inherits its credibility from this one.",
    "e": "M",
    "i": 3,
    "b": "Earth",
    "s": "",
    "p": [
      "spectrum",
      "hydrostatic"
    ]
  },
  {
    "id": 65,
    "c": "sol",
    "k": "BODY",
    "t": "Venus",
    "d": "92 bar of CO₂, 737 K at the surface, a global H₂SO₄ cloud deck, retrograde rotation once per 243 days, and a super-rotating atmosphere that laps the planet every four. The runaway greenhouse should emerge from the gas model, not be typed in.",
    "e": "M",
    "i": 3,
    "b": "Venus",
    "s": "",
    "p": [
      "sulfur",
      "retro",
      "hydrostatic"
    ]
  },
  {
    "id": 66,
    "c": "sol",
    "k": "BODY",
    "t": "Mars, properly",
    "d": "Ares is a good sketch; the real thing has 6 mbar of CO₂ that seasonally freezes out at the poles (moving several percent of the whole atmosphere), Hellas basin, Olympus Mons, and obliquity that has wandered between roughly 15° and 45° over megayears.",
    "e": "M",
    "i": 3,
    "b": "Mars",
    "s": "",
    "p": [
      "phase",
      "obliq"
    ]
  },
  {
    "id": 67,
    "c": "sol",
    "k": "BODY",
    "t": "Mercury",
    "d": "A 3:2 spin-orbit resonance giving a solar day two years long, 600 K at noon and 100 K before dawn, no atmosphere, a huge iron core — and water ice surviving in permanently shadowed polar craters despite all of it. The clearest demonstration in the Solar System that \"hot planet\" is not a useful category.",
    "e": "M",
    "i": 3,
    "b": "Mercury",
    "s": "",
    "p": [
      "res",
      "airless"
    ]
  },
  {
    "id": 68,
    "c": "sol",
    "k": "BODY",
    "t": "Jupiter",
    "d": "No surface, a dozen alternating jets, a 300-year-old anticyclone, and more heat leaving than arriving from the Sun. It is the first world in the catalogue that breaks the heightfield assumption, which makes it the right one to build the pressure-level substrate against.",
    "e": "L",
    "i": 3,
    "b": "Jupiter",
    "s": "",
    "p": [
      "h2",
      "bands",
      "vortex"
    ]
  },
  {
    "id": 69,
    "c": "sol",
    "k": "BODY",
    "t": "Saturn",
    "d": "Ten percent rotational flattening, a hexagonal polar jet, and the rings — which need the shadow band, the seasonal opening and closing over the 29-year orbit, and the edge-on presentation. Both shape items are paid off by this single body.",
    "e": "M",
    "i": 3,
    "b": "Saturn",
    "s": "",
    "p": [
      "oblate",
      "rings",
      "bands"
    ]
  },
  {
    "id": 70,
    "c": "sol",
    "k": "BODY",
    "t": "Uranus",
    "d": "Obliquity 98°, so each pole gets 42 years of unbroken sunlight and then 42 of darkness. It is the strongest stress test in the Solar System for the seasonal insolation code and it will find bugs the other seven planets hide.",
    "e": "M",
    "i": 3,
    "b": "Uranus",
    "s": "",
    "p": [
      "obliq",
      "h2",
      "rings"
    ]
  },
  {
    "id": 71,
    "c": "sol",
    "k": "BODY",
    "t": "Neptune",
    "d": "The windiest place we know — supersonic equatorial jets near 500 m/s — powered by an internal heat source rather than sunlight, at 30 AU where insolation is a thousandth of Earth's. Dark spots appear and dissipate over a few years.",
    "e": "M",
    "i": 2,
    "b": "Neptune",
    "s": "",
    "p": [
      "bands",
      "vortex",
      "radiogenic"
    ]
  },
  {
    "id": 72,
    "c": "sol",
    "k": "BODY",
    "t": "Pluto",
    "d": "Nitrogen glaciers convecting in Sputnik Planitia, water-ice mountains that behave as bedrock at 40 K, a haze layer in 30 tonnes of atmosphere, a 3:2 resonance with Neptune, and a seasonal atmosphere that may partly collapse near aphelion.",
    "e": "M",
    "i": 3,
    "b": "Pluto",
    "s": "",
    "p": [
      "n2glacier",
      "haze",
      "phase"
    ]
  },
  {
    "id": 73,
    "c": "sol",
    "k": "BODY",
    "t": "Ceres",
    "d": "A dwarf planet with a briny interior, a 4 km cryovolcanic dome at Ahuna Mons, and bright carbonate deposits in Occator crater where subsurface brine reached the surface and froze. The smallest body where the ice-shell machinery still earns its keep.",
    "e": "S",
    "i": 2,
    "b": "Ceres",
    "s": "",
    "p": [
      "cryo",
      "lowg"
    ]
  },
  {
    "id": 74,
    "c": "sol",
    "k": "BODY",
    "t": "The far outer system",
    "d": "Eris is Pluto-sized with a frozen-out atmosphere that will resublimate at perihelion; Sedna's 11,000-year orbit ranges from 76 to roughly 900 AU. Worlds where the year is longer than recorded human history, and the \"seasons\" are the whole plot.",
    "e": "S",
    "i": 1,
    "b": "Eris / Sedna",
    "s": "",
    "p": [
      "phase",
      "ecc"
    ]
  },
  {
    "id": 75,
    "c": "sol",
    "k": "BODY",
    "t": "Small bodies that are not round",
    "d": "Arrokoth is a contact binary; Bennu is a spinning rubble pile that ejects particles; 67P is a duck-shaped comet that grows a coma. These are the direct test of the irregular-shape work, and they are cheap once `radiusAt` accepts an arbitrary field.",
    "e": "M",
    "i": 2,
    "b": "Arrokoth / Bennu / 67P",
    "s": "",
    "p": [
      "irregular",
      "airless"
    ]
  },
  {
    "id": 76,
    "c": "moons",
    "k": "BODY",
    "t": "The Moon, replacing Selene",
    "d": "Selene is already a decent airless world. Make it the actual Moon: 1:1 locked to Earth with 9% extra surface exposed by libration, maria as flood basalt with a real date range, regolith gardening, and water ice in permanently shadowed polar craters.",
    "e": "S",
    "i": 3,
    "b": "Luna",
    "s": "",
    "p": [
      "lock",
      "libration",
      "airless",
      "parent"
    ]
  },
  {
    "id": 77,
    "c": "moons",
    "k": "BODY",
    "t": "Io",
    "d": "Around 400 active volcanoes, resurfacing the entire moon faster than craters can accumulate, powered purely by tidal flexing from the Laplace resonance. Its thin SO₂ atmosphere freezes to the ground during every 42-hour eclipse by Jupiter and sublimates again after.",
    "e": "M",
    "i": 3,
    "b": "Io",
    "s": "",
    "p": [
      "tidalheat",
      "sulfur",
      "eclipse",
      "triaxial"
    ]
  },
  {
    "id": 78,
    "c": "moons",
    "k": "BODY",
    "t": "Europa",
    "d": "A 15–25 km ice shell over a salt-water ocean holding perhaps twice Earth's surface water, a surface younger than 100 Myr, chaos terrain, and long arcuate cracks that record the shell rotating slightly faster than the interior.",
    "e": "M",
    "i": 3,
    "b": "Europa",
    "s": "",
    "p": [
      "iceshell",
      "tidalheat",
      "parent"
    ]
  },
  {
    "id": 79,
    "c": "moons",
    "k": "BODY",
    "t": "Ganymede",
    "d": "The largest moon in the Solar System, the only one with its own magnetic field, with grooved terrain from an ancient extensional episode and an ocean sandwiched between ice layers. The magnetosphere field in the ruleset finally does something.",
    "e": "S",
    "i": 2,
    "b": "Ganymede",
    "s": "",
    "p": [
      "iceshell",
      "moons"
    ]
  },
  {
    "id": 80,
    "c": "moons",
    "k": "BODY",
    "t": "Callisto",
    "d": "The most heavily cratered surface known — saturated, essentially unchanged for four billion years — because it sits outside the Laplace resonance and gets no tidal heat. It is the control experiment for Io and Europa, and it should be built alongside them for exactly that reason.",
    "e": "S",
    "i": 2,
    "b": "Callisto",
    "s": "",
    "p": [
      "iceshell",
      "airless"
    ]
  },
  {
    "id": 81,
    "c": "moons",
    "k": "BODY",
    "t": "Titan",
    "d": "1.5 bar of nitrogen, a full methane hydrological cycle with rivers, lakes and seas, a global tholin haze, dunes of solid organics along the equator, and a subsurface water ocean underneath. The single richest body in this document.",
    "e": "L",
    "i": 3,
    "b": "Titan",
    "s": "",
    "p": [
      "methanecycle",
      "haze",
      "iceshell",
      "lock"
    ]
  },
  {
    "id": 82,
    "c": "moons",
    "k": "BODY",
    "t": "Enceladus",
    "d": "Five hundred kilometres across, venting water, salts, silica and molecular hydrogen from four fissures at its south pole, feeding Saturn's E ring. The hydrogen implies hydrothermal activity on the ocean floor — the strongest habitability case off Earth.",
    "e": "M",
    "i": 3,
    "b": "Enceladus",
    "s": "",
    "p": [
      "cryo",
      "iceshell",
      "tidalheat"
    ]
  },
  {
    "id": 83,
    "c": "moons",
    "k": "BODY",
    "t": "Triton",
    "d": "Orbiting Neptune backwards, so it was captured rather than formed there, and spiralling in toward eventual destruction. Nitrogen geysers, cantaloupe terrain, a tenuous atmosphere, and a surface at 38 K — among the coldest measured anywhere.",
    "e": "M",
    "i": 3,
    "b": "Triton",
    "s": "",
    "p": [
      "retro",
      "cryo",
      "n2glacier",
      "migrate"
    ]
  },
  {
    "id": 84,
    "c": "moons",
    "k": "BODY",
    "t": "Miranda",
    "d": "Four hundred and seventy kilometres of mismatched terrain jammed together, with Verona Rupes — a cliff up to 20 km high, the tallest known. In Uranus's 98° obliquity its seasons are as strange as its geology.",
    "e": "S",
    "i": 2,
    "b": "Miranda",
    "s": "",
    "p": [
      "iceshell",
      "obliq",
      "irregular"
    ]
  },
  {
    "id": 85,
    "c": "moons",
    "k": "BODY",
    "t": "Iapetus",
    "d": "One hemisphere as dark as coal, the other as bright as snow, from a runaway thermal-segregation feedback as it sweeps up dust from Phoebe — plus a 13 km equatorial ridge that no one has explained. A world whose albedo map is a physical process, not a texture.",
    "e": "M",
    "i": 2,
    "b": "Iapetus",
    "s": "",
    "p": [
      "lock",
      "airless"
    ]
  },
  {
    "id": 86,
    "c": "moons",
    "k": "BODY",
    "t": "Mimas",
    "d": "A 396 km moon with a 130 km crater, and 2024 libration measurements implying a young subsurface ocean under an unfractured shell — an ocean world that looks nothing like one. The strongest argument in the catalogue for not judging a world by its surface.",
    "e": "S",
    "i": 2,
    "b": "Mimas",
    "s": "",
    "p": [
      "triaxial",
      "iceshell",
      "libration"
    ]
  },
  {
    "id": 87,
    "c": "moons",
    "k": "BODY",
    "t": "Pluto and Charon as a locked pair",
    "d": "Both bodies are locked to each other, so each hangs motionless in the other's sky, orbiting a barycentre outside Pluto. Charon has a canyon system four times the length of the Grand Canyon and a red polar cap of Pluto-sourced methane.",
    "e": "M",
    "i": 3,
    "b": "Charon",
    "s": "",
    "p": [
      "lock",
      "parent",
      "cryo"
    ]
  },
  {
    "id": 88,
    "c": "moons",
    "k": "BODY",
    "t": "Ariel, Umbriel, Titania, Oberon",
    "d": "Four mid-size icy moons around a planet tipped on its side, with resurfaced grabens on Ariel, an ancient dark surface on Umbriel, and possible ocean signatures on Titania. Ship them as a set — they share a substrate and cost far less than four separate builds.",
    "e": "M",
    "i": 1,
    "b": "Uranian moons",
    "s": "",
    "p": [
      "iceshell",
      "obliq"
    ]
  },
  {
    "id": 89,
    "c": "moons",
    "k": "BODY",
    "t": "The rest of the Saturn system",
    "d": "Dione and Tethys share their orbits with trojan moons; Tethys has Ithaca Chasma running most of the way around it; Rhea may once have had a ring. Hyperion earns its own line: it tumbles chaotically, with genuinely non-periodic rotation — the clearest macroscopic example of chaos in the Solar System — and is so porous it looks like a sponge.",
    "e": "M",
    "i": 2,
    "b": "Rhea / Dione / Tethys / Hyperion",
    "s": "",
    "p": [
      "iceshell",
      "moons",
      "irregular",
      "res"
    ]
  },
  {
    "id": 90,
    "c": "moons",
    "k": "BODY",
    "t": "Phobos and Deimos",
    "d": "Phobos orbits below synchronous altitude, is spiralling inward, is grooved by tidal stress, and will break up into a ring within about 50 Myr. A moon with a countdown on it, and the cleanest possible demonstration of the migration item.",
    "e": "S",
    "i": 2,
    "b": "Phobos / Deimos",
    "s": "",
    "p": [
      "irregular",
      "migrate",
      "lowg"
    ]
  },
  {
    "id": 91,
    "c": "temperate",
    "k": "BODY",
    "t": "TRAPPIST-1 e",
    "d": "0.92 R⊕, 0.69 M⊕, 6.10-day orbit, S = 0.65 — the closest thing to an Earth-analogue in the catalogue, and the primary JWST target. Locked, red-lit, flare-battered, and its atmosphere is still unresolved as of the last published spectra. Ship the uncertainty, not a conclusion.",
    "e": "M",
    "i": 3,
    "b": "TRAPPIST-1 e",
    "s": "",
    "p": [
      "ucd",
      "lock",
      "eyeball",
      "flare",
      "redlight"
    ]
  },
  {
    "id": 92,
    "c": "temperate",
    "k": "BODY",
    "t": "TRAPPIST-1 f",
    "d": "1.05 R⊕ at S = 0.37, 9.21-day orbit, T_eq 218 K. Cold enough that it needs a real greenhouse to be temperate at all — which makes it the test of whether the gas model can rescue a world the insolation cannot.",
    "e": "S",
    "i": 3,
    "b": "TRAPPIST-1 f",
    "s": "",
    "p": [
      "ucd",
      "lock",
      "collapse"
    ]
  },
  {
    "id": 93,
    "c": "temperate",
    "k": "BODY",
    "t": "TRAPPIST-1 g and h, the cold pair",
    "d": "g is 1.13 R⊕ at S = 0.27 — the outer edge of the optimistic zone, and the most likely of the seven to be a genuine water world given the density estimates. h is 0.76 R⊕ at S = 0.13 and T_eq 172 K on an 18.77-day year: frozen unless something unexpected is going on.",
    "e": "S",
    "i": 2,
    "b": "TRAPPIST-1 g, h",
    "s": "",
    "p": [
      "ucd",
      "lock",
      "waterworld"
    ]
  },
  {
    "id": 94,
    "c": "temperate",
    "k": "BODY",
    "t": "TRAPPIST-1 d",
    "d": "0.79 R⊕, 0.39 M⊕, S = 1.12 — right at the inner edge, small enough that atmospheric retention is genuinely marginal. The natural Venus-versus-Earth fork in the system.",
    "e": "S",
    "i": 2,
    "b": "TRAPPIST-1 d",
    "s": "",
    "p": [
      "ucd",
      "lock",
      "escape"
    ]
  },
  {
    "id": 95,
    "c": "temperate",
    "k": "BODY",
    "t": "TRAPPIST-1 b and c, the airless pair",
    "d": "S = 4.15 and 2.21. JWST thermal measurements are consistent with bare rock and little or no atmosphere on both. Shipping the negative result matters as much as shipping the hopeful ones, and it costs almost nothing on top of the shared host.",
    "e": "S",
    "i": 3,
    "b": "TRAPPIST-1 b, c",
    "s": "",
    "p": [
      "ucd",
      "lock",
      "collapse",
      "airless"
    ]
  },
  {
    "id": 96,
    "c": "temperate",
    "k": "BODY",
    "t": "The resonant chain as a playable system",
    "d": "All seven planets are in a near-resonant chain, so their transit timings shift each other measurably — which is how their masses were weighed. Present the system as one object the player holds, with the planets tugging each other, rather than seven entries in a list.",
    "e": "M",
    "i": 3,
    "b": "TRAPPIST-1 system",
    "s": "",
    "p": [
      "ucd",
      "moons",
      "migrate"
    ]
  },
  {
    "id": 97,
    "c": "temperate",
    "k": "BODY",
    "t": "Proxima Centauri b",
    "d": "The nearest exoplanet, at 1.30 pc. 1.05 M⊕ minimum, 11.19-day orbit, S = 0.64. Its host is a flare star that has been seen brightening 14,000× in the ultraviolet — the flare and XUV items exist mainly to make this world honest.",
    "e": "M",
    "i": 3,
    "b": "Proxima Cen b",
    "s": "",
    "p": [
      "lock",
      "flare",
      "xuv",
      "eyeball"
    ]
  },
  {
    "id": 98,
    "c": "temperate",
    "k": "BODY",
    "t": "Proxima Centauri d",
    "d": "0.26 M⊕ on a 5.12-day orbit at S = 1.81 — one of the lowest-mass planets ever detected by radial velocity. A sub-Earth close in, around the same violent star as its famous neighbour.",
    "e": "S",
    "i": 2,
    "b": "Proxima Cen d",
    "s": "",
    "p": [
      "lock",
      "escape",
      "lowg"
    ]
  },
  {
    "id": 99,
    "c": "temperate",
    "k": "BODY",
    "t": "LHS 1140 b",
    "d": "1.73 R⊕, 5.6 M⊕, S = 0.43 around a quiet M4.5 dwarf at 15 pc. The density allows either a dense rock-iron world or a substantial water layer, and JWST is actively arguing about it. The best \"is this a water world\" case study we have.",
    "e": "M",
    "i": 3,
    "b": "LHS 1140 b",
    "s": "",
    "p": [
      "waterworld",
      "lock",
      "iceshell"
    ]
  },
  {
    "id": 100,
    "c": "temperate",
    "k": "BODY",
    "t": "TOI-700 d",
    "d": "1.07 R⊕, S = 0.82, 37.4-day orbit around an unusually calm M2.5 dwarf — no flares observed in a year of TESS monitoring. The counterexample to Proxima: same class of star, entirely different radiation environment.",
    "e": "S",
    "i": 3,
    "b": "TOI-700 d",
    "s": "",
    "p": [
      "lock",
      "flare",
      "eyeball"
    ]
  },
  {
    "id": 101,
    "c": "temperate",
    "k": "BODY",
    "t": "TOI-700 e",
    "d": "0.95 R⊕ at S = 1.27, interior to d, found two years later in extended TESS data. Two temperate Earth-size planets in one system, on opposite sides of the Earth-flux line.",
    "e": "S",
    "i": 2,
    "b": "TOI-700 e",
    "s": "",
    "p": [
      "lock",
      "collapse"
    ]
  },
  {
    "id": 102,
    "c": "temperate",
    "k": "BODY",
    "t": "Teegarden's Star b, c and d",
    "d": "b is 1.16 M⊕ at S = 1.08 and T_eq 277 K on a 4.91-day orbit around an M7 dwarf 3.83 pc away — on paper the closest match to Earth's insolation in the whole catalogue, around a star that emits almost nothing a plant could use. c and d follow at S = 0.35 and 0.12. All three were found by radial velocity, so none has a measured radius: good practice at rendering a world with a genuine hole in its data.",
    "e": "S",
    "i": 3,
    "b": "Teegarden b, c, d",
    "s": "",
    "p": [
      "ucd",
      "lock",
      "redlight"
    ]
  },
  {
    "id": 103,
    "c": "temperate",
    "k": "BODY",
    "t": "Ross 128 b",
    "d": "1.4 M⊕, 9.87-day orbit, S = 1.38, 3.4 pc away, around one of the quietest M dwarfs known. Quiet host, moderate flux, close by — the \"boring\" temperate world, which is exactly why it is a useful control.",
    "e": "S",
    "i": 2,
    "b": "Ross 128 b",
    "s": "",
    "p": [
      "lock",
      "eyeball"
    ]
  },
  {
    "id": 104,
    "c": "temperate",
    "k": "BODY",
    "t": "GJ 273 b (Luyten's star b)",
    "d": "2.89 M⊕ at S = 1.06, 18.65 days, 5.9 pc. Notable beyond its parameters: it is one of the few worlds humanity has deliberately transmitted a message to, in 2017. That fact belongs in the chronicle.",
    "e": "S",
    "i": 2,
    "b": "GJ 273 b",
    "s": "",
    "p": [
      "lock",
      "eyeball"
    ]
  },
  {
    "id": 105,
    "c": "temperate",
    "k": "BODY",
    "t": "Wolf 1061 c and K2-3 d",
    "d": "Wolf 1061 c is 3.4 M⊕ at S = 1.30, 4.3 pc away — a super-Earth at the inner edge, where the runaway greenhouse question is open rather than rhetorical. K2-3 d is 1.46 R⊕ at S = 1.36 on a 44.6-day orbit, far enough out that it may not be fully locked, which makes it a useful test of the boundary between the locked and unlocked regimes.",
    "e": "S",
    "i": 2,
    "b": "Wolf 1061 c / K2-3 d",
    "s": "",
    "p": [
      "lock",
      "res",
      "hydrostatic"
    ]
  },
  {
    "id": 106,
    "c": "temperate",
    "k": "BODY",
    "t": "Gliese 12 b",
    "d": "0.93 R⊕, 12.76-day orbit, S = 1.62, T_eq 315 K, 12 pc away — one of the best nearby targets for asking whether a temperate M-dwarf planet kept its atmosphere at all. Effectively a Venus-or-Earth coin flip we can watch being resolved.",
    "e": "S",
    "i": 3,
    "b": "Gliese 12 b",
    "s": "",
    "p": [
      "lock",
      "escape",
      "collapse"
    ]
  },
  {
    "id": 107,
    "c": "temperate",
    "k": "BODY",
    "t": "TOI-715 b",
    "d": "1.55 R⊕ at S = 0.67 on a 19.29-day orbit — a super-Earth squarely in the conservative zone of an M4 dwarf, and large enough that a thick atmosphere is plausible.",
    "e": "S",
    "i": 2,
    "b": "TOI-715 b",
    "s": "",
    "p": [
      "lock",
      "eyeball"
    ]
  },
  {
    "id": 108,
    "c": "temperate",
    "k": "BODY",
    "t": "LP 890-9 c",
    "d": "1.37 R⊕, S = 0.91, around the second-coolest star known to host transiting planets after TRAPPIST-1. It is the natural companion build to the TRAPPIST system and shares almost all of its host physics.",
    "e": "S",
    "i": 2,
    "b": "LP 890-9 c",
    "s": "",
    "p": [
      "ucd",
      "lock"
    ]
  },
  {
    "id": 109,
    "c": "temperate",
    "k": "BODY",
    "t": "GJ 357 d",
    "d": "6.1 M⊕ at S = 0.38, a 55.7-day orbit, 9.4 pc. A cold super-Earth that needs a few bar of CO₂ to be temperate at all — the greenhouse item is what decides whether this world is interesting or a rock.",
    "e": "S",
    "i": 2,
    "b": "GJ 357 d",
    "s": "",
    "p": [
      "hydrostatic",
      "phase"
    ]
  },
  {
    "id": 110,
    "c": "temperate",
    "k": "BODY",
    "t": "Kepler-186 f",
    "d": "1.17 R⊕ at S = 0.29 on a 130-day orbit — the first Earth-size planet found in a habitable zone, in 2014, and still the historical anchor of the whole field. Far enough from its M1 host that it need not be locked.",
    "e": "S",
    "i": 3,
    "b": "Kepler-186 f",
    "s": "",
    "p": [
      "lum",
      "obliq"
    ]
  },
  {
    "id": 111,
    "c": "temperate",
    "k": "BODY",
    "t": "Kepler-442 b",
    "d": "1.34 R⊕, S = 0.70, 112-day orbit around a K dwarf — by most published habitability indices the highest-scoring planet Kepler found. K dwarfs are also the quietest long-lived hosts, which is a point worth making in-game.",
    "e": "S",
    "i": 2,
    "b": "Kepler-442 b",
    "s": "",
    "p": [
      "lum",
      "spectrum"
    ]
  },
  {
    "id": 112,
    "c": "temperate",
    "k": "BODY",
    "t": "Kepler-452 b",
    "d": "1.63 R⊕, S = 1.1, 385-day year around a G2 star six billion years old — a genuine Sun analogue, so this is the one world in the catalogue where an Earth-like day-night cycle needs no special pleading. Its existence as a planet has been questioned; say so.",
    "e": "S",
    "i": 3,
    "b": "Kepler-452 b",
    "s": "",
    "p": [
      "lum",
      "evolve"
    ]
  },
  {
    "id": 113,
    "c": "temperate",
    "k": "BODY",
    "t": "Kepler-1649 c",
    "d": "1.06 R⊕ at S = 0.75 — the closest match to Earth in radius and insolation simultaneously among all Kepler planets, and it was recovered from data an automated pipeline had thrown away.",
    "e": "S",
    "i": 2,
    "b": "Kepler-1649 c",
    "s": "",
    "p": [
      "lock",
      "ucd"
    ]
  },
  {
    "id": 114,
    "c": "temperate",
    "k": "BODY",
    "t": "Kepler-62 e and f",
    "d": "1.61 R⊕ at S = 1.4 and 1.41 R⊕ at S = 0.48, around a K2 dwarf — two temperate planets in one system, both long modelled as ocean worlds. Ship them together against the water-world substrate.",
    "e": "S",
    "i": 2,
    "b": "Kepler-62 e, f",
    "s": "",
    "p": [
      "waterworld",
      "lum"
    ]
  },
  {
    "id": 115,
    "c": "temperate",
    "k": "BODY",
    "t": "Kepler-22 b",
    "d": "2.1 R⊕ at S = 1.0 on a 290-day orbit around a G5 star — the first habitable-zone planet Kepler confirmed, in 2011. At that radius it is more likely a small Neptune than a rock, which is a lesson the catalogue should teach directly.",
    "e": "S",
    "i": 2,
    "b": "Kepler-22 b",
    "s": "",
    "p": [
      "h2",
      "lum"
    ]
  },
  {
    "id": 116,
    "c": "temperate",
    "k": "BODY",
    "t": "Kepler-438 b and Kepler-1229 b",
    "d": "1.12 R⊕ at S = 1.4 and 1.40 R⊕ at S = 0.49. Kepler-438 b was among the most Earth-like on paper until its host was found to flare violently roughly every hundred days, which probably sterilised it. A clean demonstration that habitability is about the star.",
    "e": "S",
    "i": 2,
    "b": "Kepler-438 b, 1229 b",
    "s": "",
    "p": [
      "flare",
      "xuv"
    ]
  },
  {
    "id": 117,
    "c": "temperate",
    "k": "BODY",
    "t": "tau Ceti f and its siblings",
    "d": "1.81 R⊕ at S = 0.28 on a 636-day orbit around a G8 star 3.6 pc away — visible to the naked eye, with a debris disc ten times denser than the Kuiper belt, so the impact rate is part of its story.",
    "e": "S",
    "i": 2,
    "b": "tau Cet f",
    "s": "",
    "p": [
      "lum",
      "ecc"
    ]
  },
  {
    "id": 118,
    "c": "temperate",
    "k": "BODY",
    "t": "Kapteyn c",
    "d": "7 M⊕ at S = 0.17 around a halo star roughly 11 billion years old that orbits the galaxy backwards — probably stripped from a dwarf galaxy the Milky Way ate. A world older than the Solar System by more than twice.",
    "e": "S",
    "i": 2,
    "b": "Kapteyn c",
    "s": "",
    "p": [
      "evolve",
      "lum"
    ]
  },
  {
    "id": 119,
    "c": "temperate",
    "k": "BODY",
    "t": "Barnard's Star's four sub-Earths",
    "d": "Four planets of 0.19–0.34 M⊕ on 2.34–6.74-day orbits around the second-nearest stellar system, at 1.83 pc, all confirmed within the last two years. Too hot and too small to be temperate — and worth shipping precisely because the nearest single star turned out to host a set of tiny scorched worlds rather than an Earth.",
    "e": "S",
    "i": 3,
    "b": "Barnard b–e",
    "s": "",
    "p": [
      "lock",
      "lowg",
      "escape"
    ]
  },
  {
    "id": 120,
    "c": "furnace",
    "k": "BODY",
    "t": "55 Cancri e",
    "d": "1.88 R⊕, 8 M⊕, an 18-hour year, S = 2,658, T_eq 1,958 K. JWST found evidence in 2024 for a genuine secondary atmosphere of CO and CO₂ outgassing from a magma ocean — the first plausible atmosphere on a rocky exoplanet, and it is on the least likely candidate imaginable.",
    "e": "M",
    "i": 3,
    "b": "55 Cnc e",
    "s": "",
    "p": [
      "magma",
      "rockvapour",
      "lock"
    ]
  },
  {
    "id": 121,
    "c": "furnace",
    "k": "BODY",
    "t": "K2-141 b",
    "d": "A 6.7-hour orbit, T_eq 2,103 K, with a magma ocean roughly 100 km deep, an atmosphere of vaporised sodium and silicon monoxide covering only the day side, supersonic winds, and rain made of rock. The purest expression of the rock-vapour cycle.",
    "e": "M",
    "i": 3,
    "b": "K2-141 b",
    "s": "",
    "p": [
      "rockvapour",
      "magma",
      "jet"
    ]
  },
  {
    "id": 122,
    "c": "furnace",
    "k": "BODY",
    "t": "CoRoT-7 b",
    "d": "The first transiting rocky exoplanet, in 2009: 1.68 R⊕, 4.1 M⊕, 20.5-hour orbit, T_eq 1,756 K. It established that the lava-world regime exists at all, and it belongs in the catalogue for that alone.",
    "e": "S",
    "i": 2,
    "b": "CoRoT-7 b",
    "s": "",
    "p": [
      "magma",
      "lock"
    ]
  },
  {
    "id": 123,
    "c": "furnace",
    "k": "BODY",
    "t": "Kepler-10 b",
    "d": "Kepler's first rocky confirmation: 1.47 R⊕, 20-hour year, S = 3,742, T_eq 2,188 K, around a star roughly 11 billion years old. An ancient star with a molten planet.",
    "e": "S",
    "i": 2,
    "b": "Kepler-10 b",
    "s": "",
    "p": [
      "magma",
      "evolve"
    ]
  },
  {
    "id": 124,
    "c": "furnace",
    "k": "BODY",
    "t": "Kepler-78 b",
    "d": "Almost exactly Earth's radius (1.2 R⊕) and Earth's density, on an 8.5-hour orbit at S = 4,070. An Earth twin in every respect except the one that matters, and the clearest single argument that composition and irradiation are independent axes.",
    "e": "S",
    "i": 3,
    "b": "Kepler-78 b",
    "s": "",
    "p": [
      "magma",
      "migrate"
    ]
  },
  {
    "id": 125,
    "c": "furnace",
    "k": "BODY",
    "t": "GJ 367 b",
    "d": "0.72 R⊕, 0.5 M⊕, a 7.7-hour year — a sub-Earth denser than iron-rich rock, roughly 91% core by mass. Probably the stripped remnant of something larger. The high-density end of the mass-radius diagram, with a face.",
    "e": "S",
    "i": 3,
    "b": "GJ 367 b",
    "s": "",
    "p": [
      "magma",
      "chthonian",
      "escape"
    ]
  },
  {
    "id": 126,
    "c": "furnace",
    "k": "BODY",
    "t": "LHS 3844 b",
    "d": "1.29 R⊕ at S = 74, and the Spitzer phase curve shows almost no heat redistribution to the night side — meaning bare rock with essentially no atmosphere, probably basalt. The strongest published case for a locked world that lost everything.",
    "e": "S",
    "i": 3,
    "b": "LHS 3844 b",
    "s": "",
    "p": [
      "lock",
      "collapse",
      "airless"
    ]
  },
  {
    "id": 127,
    "c": "furnace",
    "k": "BODY",
    "t": "GJ 1132 b",
    "d": "1.19 R⊕ at S = 19, 12.6 pc — repeatedly claimed and retracted as having a secondary atmosphere. It is the canonical Venus-analogue target and the canonical example of how hard these measurements are.",
    "e": "S",
    "i": 2,
    "b": "GJ 1132 b",
    "s": "",
    "p": [
      "escape",
      "sulfur",
      "spots"
    ]
  },
  {
    "id": 128,
    "c": "furnace",
    "k": "BODY",
    "t": "GJ 486 b",
    "d": "1.29 R⊕, T_eq 696 K, and a JWST spectrum that is equally consistent with water vapour on the planet and with cool starspots on the host. Build both readings and let the player pick an instrument to distinguish them.",
    "e": "M",
    "i": 3,
    "b": "GJ 486 b",
    "s": "",
    "p": [
      "spots",
      "phase"
    ]
  },
  {
    "id": 129,
    "c": "furnace",
    "k": "BODY",
    "t": "HD 219134 b and HD 3167 b",
    "d": "HD 219134 b is the nearest transiting rocky planet at 6.5 pc — 1.6 R⊕ on a 3.09-day orbit at S = 176, around a host bright enough to see with the naked eye, which makes it the best \"go outside and look at it\" world in the catalogue. HD 3167 b is the same size on a 23-hour orbit at S = 1,650, in a system whose inner and outer orbits are close to mutually perpendicular — a geometry no formation model comfortably explains.",
    "e": "S",
    "i": 2,
    "b": "HD 219134 b / HD 3167 b",
    "s": "",
    "p": [
      "magma",
      "lock",
      "obliq"
    ]
  },
  {
    "id": 130,
    "c": "furnace",
    "k": "BODY",
    "t": "K2-137 b",
    "d": "An Earth-size planet on a 4.3-hour orbit around an M dwarf — one of the shortest years known. It is close to the point where the planet would be torn apart, which makes it the natural pairing with the Roche and migration work.",
    "e": "S",
    "i": 2,
    "b": "K2-137 b",
    "s": "",
    "p": [
      "roche",
      "migrate",
      "magma"
    ]
  },
  {
    "id": 131,
    "c": "furnace",
    "k": "BODY",
    "t": "Kepler-1520 b",
    "d": "A disintegrating planet: its transit depth varies from one 15.7-hour orbit to the next because what is blocking the star is a comet-like tail of condensing mineral dust, not a solid disc. Expected to be gone entirely within roughly 100 Myr.",
    "e": "M",
    "i": 3,
    "b": "Kepler-1520 b",
    "s": "",
    "p": [
      "disintegrate",
      "rockvapour"
    ]
  },
  {
    "id": 132,
    "c": "furnace",
    "k": "BODY",
    "t": "K2-22 b",
    "d": "The second disintegrator, with a 9.1-hour orbit and a tail that sometimes leads and sometimes trails. Two examples make it a class rather than an anomaly, which is the difference between a curiosity and a mechanic.",
    "e": "S",
    "i": 2,
    "b": "K2-22 b",
    "s": "",
    "p": [
      "disintegrate"
    ]
  },
  {
    "id": 133,
    "c": "furnace",
    "k": "BODY",
    "t": "TOI-849 b",
    "d": "41.8 M⊕ inside 3.6 R⊕ on an 18-hour orbit — the exposed core of a gas giant, sitting in the hot-Neptune desert where nothing should survive. Either it lost its envelope or never got one, and the simulation can show both paths.",
    "e": "M",
    "i": 3,
    "b": "TOI-849 b",
    "s": "",
    "p": [
      "chthonian",
      "escape"
    ]
  },
  {
    "id": 134,
    "c": "furnace",
    "k": "BODY",
    "t": "GJ 9827 d",
    "d": "1.98 R⊕ with a JWST-detected water-rich atmosphere and T_eq 675 K — a genuine steam world, where the atmosphere is mostly H₂O rather than hydrogen. A distinct regime between rock and sub-Neptune.",
    "e": "M",
    "i": 2,
    "b": "GJ 9827 d",
    "s": "",
    "p": [
      "phase",
      "waterworld"
    ]
  },
  {
    "id": 135,
    "c": "furnace",
    "k": "BODY",
    "t": "LP 791-18 d",
    "d": "An Earth-size planet whose orbit is kept eccentric by a heavier neighbour, so it should be flexing hard enough to drive Io-like volcanism — possibly the most volcanically active world known, and it sits just outside the habitable zone. Io physics on a planet.",
    "e": "M",
    "i": 3,
    "b": "LP 791-18 d",
    "s": "",
    "p": [
      "tidalheat",
      "ecc",
      "sulfur"
    ]
  },
  {
    "id": 136,
    "c": "furnace",
    "k": "BODY",
    "t": "Kepler-36 b and c",
    "d": "Two planets whose orbits come within about five Earth-Moon distances of each other, yet whose densities differ by a factor of eight — a dense rock and a puffy sub-Neptune as immediate neighbours. From b, the other planet would appear larger than the Moon does from Earth.",
    "e": "M",
    "i": 3,
    "b": "Kepler-36 b, c",
    "s": "",
    "p": [
      "h2",
      "moons",
      "migrate"
    ]
  },
  {
    "id": 137,
    "c": "giant",
    "k": "BODY",
    "t": "51 Pegasi b",
    "d": "The first planet found around a Sun-like star, in 1995: 0.47 Jupiter masses on a 4.23-day orbit, which nobody's formation theory allowed. It should be the first entry a player is handed after the Solar System, for exactly that reason.",
    "e": "M",
    "i": 3,
    "b": "51 Peg b",
    "s": "",
    "p": [
      "h2",
      "lock",
      "jet"
    ]
  },
  {
    "id": 138,
    "c": "giant",
    "k": "BODY",
    "t": "HD 209458 b (Osiris)",
    "d": "The first transiting planet, the first with a detected atmosphere, and the first caught evaporating — a hydrogen envelope escaping fast enough to form a comet-like tail. Almost every technique in the field was invented on this one world.",
    "e": "M",
    "i": 3,
    "b": "HD 209458 b",
    "s": "",
    "p": [
      "h2",
      "tail",
      "escape"
    ]
  },
  {
    "id": 139,
    "c": "giant",
    "k": "BODY",
    "t": "HD 189733 b",
    "d": "Deep blue in reflected light — from silicate clouds, not water — with 2 km/s winds and rain that is molten glass blowing sideways. At 19.8 pc it is the best-characterised hot Jupiter in the sky.",
    "e": "M",
    "i": 3,
    "b": "HD 189733 b",
    "s": "",
    "p": [
      "minclouds",
      "jet",
      "h2"
    ]
  },
  {
    "id": 140,
    "c": "giant",
    "k": "BODY",
    "t": "WASP-12 b",
    "d": "Fills its Roche lobe, is measurably egg-shaped, is losing mass to its star through the inner Lagrange point, and its orbit is decaying by about 29 milliseconds per year — a planet with a measured death date, roughly 3 Myr out.",
    "e": "M",
    "i": 3,
    "b": "WASP-12 b",
    "s": "",
    "p": [
      "roche",
      "shape",
      "migrate",
      "escape"
    ]
  },
  {
    "id": 141,
    "c": "giant",
    "k": "BODY",
    "t": "WASP-76 b",
    "d": "Day side near 2,400 K where iron is vapour, night side cool enough that it condenses — so iron rains out along the terminator. The most vivid single image in exoplanet science, and once the ironrain item exists this world is nearly free.",
    "e": "S",
    "i": 3,
    "b": "WASP-76 b",
    "s": "",
    "p": [
      "ironrain",
      "jet",
      "lock"
    ]
  },
  {
    "id": 142,
    "c": "giant",
    "k": "BODY",
    "t": "WASP-121 b",
    "d": "Tidally distorted into an ellipsoid, T_eq 2,409 K, with magnesium and iron escaping the upper atmosphere entirely, quartz clouds detected on the night side, and — in 2025 — SiO reported. A Roche-distorted world with a full mineral weather system.",
    "e": "M",
    "i": 3,
    "b": "WASP-121 b",
    "s": "",
    "p": [
      "roche",
      "minclouds",
      "escape"
    ]
  },
  {
    "id": 143,
    "c": "giant",
    "k": "BODY",
    "t": "KELT-9 b",
    "d": "T_eq 3,921 K, S = 44,900 — hotter than most K dwarfs. Molecular hydrogen dissociates on the day side and recombines on the night side, so the heat transport is chemical rather than thermal. The single most extreme irradiation regime in the catalogue.",
    "e": "M",
    "i": 3,
    "b": "KELT-9 b",
    "s": "",
    "p": [
      "h2",
      "jet",
      "rockvapour"
    ]
  },
  {
    "id": 144,
    "c": "giant",
    "k": "BODY",
    "t": "TOI-2109 b",
    "d": "The shortest-period hot Jupiter known, at 16 hours, T_eq 3,646 K, and detectably spiralling inward. The clearest candidate for actually watching a planet fall into its star during a long run.",
    "e": "S",
    "i": 2,
    "b": "TOI-2109 b",
    "s": "",
    "p": [
      "migrate",
      "roche"
    ]
  },
  {
    "id": 145,
    "c": "giant",
    "k": "BODY",
    "t": "WASP-33 b",
    "d": "Orbits a pulsating A-type star backwards over its pole, with a temperature inversion driven by TiO absorption high in the atmosphere — a stratosphere made by a metal oxide.",
    "e": "S",
    "i": 2,
    "b": "WASP-33 b",
    "s": "",
    "p": [
      "h2",
      "obliq",
      "minclouds"
    ]
  },
  {
    "id": 146,
    "c": "giant",
    "k": "BODY",
    "t": "WASP-19 b",
    "d": "A 19-hour orbit around a G8 dwarf at T_eq 2,113 K, and among the first hot Jupiters where the host star's activity was shown to contaminate the transmission spectrum. Pair it with the starspot item.",
    "e": "S",
    "i": 1,
    "b": "WASP-19 b",
    "s": "",
    "p": [
      "spots",
      "h2"
    ]
  },
  {
    "id": 147,
    "c": "giant",
    "k": "BODY",
    "t": "WASP-17 b",
    "d": "Nearly twice Jupiter's radius at half its mass, on a retrograde orbit — and in 2023 JWST identified quartz nanocrystal clouds in its atmosphere, the first direct detection of SiO₂ clouds anywhere.",
    "e": "S",
    "i": 2,
    "b": "WASP-17 b",
    "s": "",
    "p": [
      "minclouds",
      "retro",
      "superpuff"
    ]
  },
  {
    "id": 148,
    "c": "giant",
    "k": "BODY",
    "t": "TrES-2 b",
    "d": "Reflects less than 1% of the light that hits it — darker than coal, the least reflective planet known, and yet glowing dull red from its own heat. A world defined entirely by its albedo.",
    "e": "S",
    "i": 2,
    "b": "TrES-2 b",
    "s": "",
    "p": [
      "h2",
      "minclouds"
    ]
  },
  {
    "id": 149,
    "c": "giant",
    "k": "BODY",
    "t": "Kepler-7 b and HAT-P-7 b — the first weather maps",
    "d": "Kepler-7 b was the first exoplanet to have a cloud map made of it: reflective clouds concentrated on the western half of the day side, at a density of 0.17 g/cm³. On HAT-P-7 b, Kepler watched the brightness peak wander, implying clouds forming and dispersing on the night side and blowing across the terminator over weeks. Weather, observed a thousand light years away — and the reference cases for the phase-curve instrument.",
    "e": "M",
    "i": 3,
    "b": "Kepler-7 b / HAT-P-7 b",
    "s": "",
    "p": [
      "minclouds",
      "jet"
    ]
  },
  {
    "id": 150,
    "c": "giant",
    "k": "BODY",
    "t": "WASP-127 b",
    "d": "A puffed-up sub-Saturn where 2025 measurements found supersonic equatorial winds around 9 km/s — the fastest jet measured on any planet. The Rhines-scale work has a hard number to be checked against.",
    "e": "S",
    "i": 2,
    "b": "WASP-127 b",
    "s": "",
    "p": [
      "bands",
      "jet"
    ]
  },
  {
    "id": 151,
    "c": "giant",
    "k": "BODY",
    "t": "KELT-1 b",
    "d": "27 Jupiter masses transiting on a 30-hour orbit — a brown dwarf by mass but a planet by every observational method used to find it. The deliberately ambiguous entry that forces the catalogue to define its own boundary.",
    "e": "S",
    "i": 1,
    "b": "KELT-1 b",
    "s": "",
    "p": [
      "bd",
      "h2"
    ]
  },
  {
    "id": 152,
    "c": "giant",
    "k": "BODY",
    "t": "GJ 436 b",
    "d": "A warm Neptune trailing a hydrogen cloud far larger than its own star, on an eccentric 2.64-day orbit that should have circularised long ago. Both facts point at a third body nobody has found.",
    "e": "M",
    "i": 3,
    "b": "GJ 436 b",
    "s": "",
    "p": [
      "tail",
      "escape",
      "ecc"
    ]
  },
  {
    "id": 153,
    "c": "giant",
    "k": "BODY",
    "t": "GJ 3470 b",
    "d": "A sub-Neptune losing helium in a tail detected from the ground, plus a JWST detection of SO₂ — sulfur photochemistry in a hydrogen atmosphere, which was not predicted.",
    "e": "S",
    "i": 2,
    "b": "GJ 3470 b",
    "s": "",
    "p": [
      "tail",
      "sulfur"
    ]
  },
  {
    "id": 154,
    "c": "giant",
    "k": "BODY",
    "t": "HAT-P-11 b",
    "d": "A Neptune on an eccentric, strongly misaligned orbit around a K dwarf, with water detected in a comparatively clear atmosphere — the counterexample to the flat, hazy spectra of most small planets.",
    "e": "S",
    "i": 2,
    "b": "HAT-P-11 b",
    "s": "",
    "p": [
      "ecc",
      "obliq",
      "phase"
    ]
  },
  {
    "id": 155,
    "c": "giant",
    "k": "BODY",
    "t": "LTT 9779 b",
    "d": "An ultra-hot Neptune that should not exist — sitting inside the desert where irradiation strips envelopes — with an albedo near 0.8 from metallic and silicate clouds. The most reflective planet known, surviving where nothing survives.",
    "e": "M",
    "i": 3,
    "b": "LTT 9779 b",
    "s": "",
    "p": [
      "minclouds",
      "escape",
      "chthonian"
    ]
  },
  {
    "id": 156,
    "c": "giant",
    "k": "BODY",
    "t": "GJ 1214 b",
    "d": "The archetypal hazy sub-Neptune: a featureless transmission spectrum that defeated a decade of instruments, until JWST's phase curve showed a highly reflective, metal-rich, hazy atmosphere. The world that made haze a first-class citizen.",
    "e": "M",
    "i": 3,
    "b": "GJ 1214 b",
    "s": "",
    "p": [
      "haze",
      "h2"
    ]
  },
  {
    "id": 157,
    "c": "giant",
    "k": "BODY",
    "t": "K2-18 b and TOI-270 d — the hycean argument",
    "d": "Both show methane and CO₂ from JWST. K2-18 b's claimed dimethyl sulfide signal is heavily contested, and TOI-270 d may be a miscible hot envelope rather than an ocean under a sky. Ship the disagreement as the content: two interpretations, one dataset, and an instrument that cannot yet separate them.",
    "e": "L",
    "i": 3,
    "b": "K2-18 b / TOI-270 d",
    "s": "",
    "p": [
      "hycean",
      "haze",
      "waterworld"
    ]
  },
  {
    "id": 158,
    "c": "arch",
    "k": "BODY",
    "t": "HR 8799 b, c, d, e",
    "d": "Four giant planets, all directly imaged, all moving visibly in a decade of frames, in a near 8:4:2:1 resonant chain around an A5 star at 41 pc. The only system where a player can be shown the actual photographs next to the simulation.",
    "e": "M",
    "i": 3,
    "b": "HR 8799",
    "s": "",
    "p": [
      "bd",
      "radiogenic",
      "moons"
    ]
  },
  {
    "id": 159,
    "c": "arch",
    "k": "BODY",
    "t": "Beta Pictoris b and c",
    "d": "Two young giants inside a famous edge-on debris disc, one on a 24-year orbit and one on 3.3. The planets are still hot from formation, so their light is their own, not reflected — a fundamentally different rendering problem.",
    "e": "M",
    "i": 2,
    "b": "beta Pic b, c",
    "s": "",
    "p": [
      "radiogenic",
      "young"
    ]
  },
  {
    "id": 160,
    "c": "arch",
    "k": "BODY",
    "t": "51 Eridani b",
    "d": "A young Jupiter with a strong methane signature and a temperature around 700 K — the closest analogue we have imaged to what Jupiter looked like shortly after it formed. The bridge between the giants shelf and the Solar System shelf.",
    "e": "S",
    "i": 2,
    "b": "51 Eri b",
    "s": "",
    "p": [
      "young",
      "radiogenic",
      "h2"
    ]
  },
  {
    "id": 161,
    "c": "arch",
    "k": "BODY",
    "t": "HIP 65426 b",
    "d": "JWST's first directly imaged exoplanet, at 92 AU from an A2 star. A world that can only be studied in the infrared, because its host would drown it at any shorter wavelength.",
    "e": "S",
    "i": 2,
    "b": "HIP 65426 b",
    "s": "",
    "p": [
      "young",
      "spectrum"
    ]
  },
  {
    "id": 162,
    "c": "arch",
    "k": "BODY",
    "t": "The far outliers",
    "d": "GJ 504 b orbits a Sun-like star at roughly 44 AU and is modelled as magenta from a cloudless, methane-poor atmosphere. HD 106906 b sits around 700 AU out and strongly misaligned with its debris disc — the closest thing observed to the hypothesised Planet Nine geometry.",
    "e": "S",
    "i": 2,
    "b": "GJ 504 b / HD 106906 b",
    "s": "",
    "p": [
      "young",
      "radiogenic"
    ]
  },
  {
    "id": 163,
    "c": "arch",
    "k": "BODY",
    "t": "AU Mic b",
    "d": "A Neptune-size planet orbiting a 23-million-year-old M dwarf, inside a debris disc with dust waves visibly propagating outward. A planet being built while you watch, with the impact rate to match.",
    "e": "M",
    "i": 3,
    "b": "AU Mic b",
    "s": "",
    "p": [
      "young",
      "xuv",
      "escape"
    ]
  },
  {
    "id": 164,
    "c": "arch",
    "k": "BODY",
    "t": "Planets still contracting",
    "d": "V1298 Tau b is 9.4 R⊕ at roughly 23 Myr and K2-33 b is 5 R⊕ at around 10 Myr — both far larger than they will end up, because they have not finished cooling and shrinking. Radius as a function of age, on-screen.",
    "e": "M",
    "i": 2,
    "b": "V1298 Tau b / K2-33 b",
    "s": "",
    "p": [
      "young",
      "escape",
      "h2"
    ]
  },
  {
    "id": 166,
    "c": "arch",
    "k": "BODY",
    "t": "The eccentric extremes",
    "d": "HD 80606 b runs e = 0.932 on a 111-day orbit, swinging from about 0.85 AU to 0.03 AU, with its upper atmosphere heating from roughly 800 K to 1,500 K in six hours at closest approach and a shockwave of storms afterwards. HD 20782 b reaches e = 0.95 over 597 days and Kepler-1704 b e = 0.92 over 989. Each spends almost all its year in the cold and a few days being roasted — a seasonal cycle with no Solar System equivalent.",
    "e": "M",
    "i": 3,
    "b": "HD 80606 b / HD 20782 b / Kepler-1704 b",
    "s": "",
    "p": [
      "ecc",
      "jet",
      "h2"
    ]
  },
  {
    "id": 167,
    "c": "arch",
    "k": "BODY",
    "t": "Packed systems",
    "d": "Kepler-11 has six planets inside Mercury's orbit, several with densities too low for their mass. Kepler-90 has eight, the joint record. Both are about architecture rather than any individual world, and both need the system view to make any sense.",
    "e": "M",
    "i": 2,
    "b": "Kepler-11 / Kepler-90",
    "s": "",
    "p": [
      "moons",
      "migrate",
      "h2"
    ]
  },
  {
    "id": 168,
    "c": "arch",
    "k": "BODY",
    "t": "The oldest system, and the exomoon candidate",
    "d": "Kepler-444 hosts five sub-Earths around a star roughly 11.2 billion years old — planets that formed when the galaxy was a fifth its present age. Kepler-1625 b carries the best-known exomoon candidate, a Neptune-size satellite whose existence is still disputed.",
    "e": "M",
    "i": 2,
    "b": "Kepler-444 / Kepler-1625 b",
    "s": "",
    "p": [
      "evolve",
      "moons"
    ]
  },
  {
    "id": 169,
    "c": "dark",
    "k": "BODY",
    "t": "Kepler-16 b — Tatooine",
    "d": "A Saturn-mass planet circling both stars of a 41-day eclipsing binary on a 229-day orbit, T_eq 206 K. Two shadows on the ground, two sunsets at different colours, and an insolation curve that beats rather than cycles.",
    "e": "M",
    "i": 3,
    "b": "Kepler-16 b",
    "s": "",
    "p": [
      "binary",
      "beat"
    ]
  },
  {
    "id": 170,
    "c": "dark",
    "k": "BODY",
    "t": "The rest of the circumbinaries",
    "d": "Kepler-47 c sits in the habitable zone of its pair; Kepler-1647 b is the largest known circumbinary on a 1,108-day orbit; TOI-1338 b was found in TESS data by a high-school intern. Cheap once Kepler-16 b exists, and they turn a novelty into a class.",
    "e": "S",
    "i": 2,
    "b": "Kepler-47 c, Kepler-1647 b, TOI-1338 b",
    "s": "",
    "p": [
      "binary",
      "beat"
    ]
  },
  {
    "id": 171,
    "c": "dark",
    "k": "BODY",
    "t": "PSO J318.5-22",
    "d": "Roughly 8 Jupiter masses, free-floating with no star at all, 24 pc away, and variable in brightness as patchy iron and silicate clouds rotate in and out of view. A planet whose only weather report comes from its own thermal glow.",
    "e": "M",
    "i": 3,
    "b": "PSO J318.5-22",
    "s": "",
    "p": [
      "nostar",
      "minclouds",
      "radiogenic"
    ]
  },
  {
    "id": 172,
    "c": "dark",
    "k": "BODY",
    "t": "WISE 0855-0714",
    "d": "The coldest object of its kind known, around 250 K, only 2.2 pc away — and the first outside the Solar System where water clouds were detected. Below freezing, and it has weather.",
    "e": "M",
    "i": 3,
    "b": "WISE 0855-0714",
    "s": "",
    "p": [
      "nostar",
      "phase",
      "minclouds"
    ]
  },
  {
    "id": 173,
    "c": "dark",
    "k": "BODY",
    "t": "Rogues with weather bands",
    "d": "SIMP J0136 rotates in 2.4 hours and shows banded, layered clouds and aurorae mapped by JWST in 2025; CFBDSIR 2149-0403 is a young free-floating candidate. Banded circulation on a body with no star to drive it.",
    "e": "M",
    "i": 2,
    "b": "SIMP J0136 / CFBDSIR 2149",
    "s": "",
    "p": [
      "nostar",
      "bands",
      "minclouds"
    ]
  },
  {
    "id": 174,
    "c": "dark",
    "k": "BODY",
    "t": "The Earth-mass rogues",
    "d": "Detected by a microlensing event lasting 42 minutes — an Earth-mass or Mars-mass object wandering the galaxy with no star. Population estimates suggest rogues may outnumber stars, which reframes the entire catalogue.",
    "e": "M",
    "i": 3,
    "b": "OGLE-2016-BLG-1928",
    "s": "",
    "p": [
      "nostar",
      "radiogenic"
    ]
  },
  {
    "id": 175,
    "c": "dark",
    "k": "BODY",
    "t": "MOA-2011-BLG-262L b",
    "d": "Either a 17 M⊕ planet around a low-mass star or an Earth-mass moon around a free-floating giant — the data genuinely does not distinguish them. A world that has to be shipped as two mutually exclusive readings.",
    "e": "S",
    "i": 2,
    "b": "MOA-2011-BLG-262L b",
    "s": "",
    "p": [
      "nostar",
      "moons"
    ]
  },
  {
    "id": 176,
    "c": "dark",
    "k": "BODY",
    "t": "2M1207 b",
    "d": "The first exoplanet ever directly imaged, in 2004: about 5 Jupiter masses orbiting a 25-Jupiter-mass brown dwarf at 41 AU, still hot from formation at around 1,160 K. Two objects, neither of them a star.",
    "e": "M",
    "i": 3,
    "b": "2M1207 b",
    "s": "",
    "p": [
      "bd",
      "young",
      "radiogenic"
    ]
  },
  {
    "id": 177,
    "c": "dark",
    "k": "BODY",
    "t": "Luhman 16 AB",
    "d": "The nearest brown dwarf binary at 2 pc, and the first object outside the Solar System to have a surface weather map made of it — patchy clouds rotating in and out of view every five hours. The reference target for the mineral cloud work.",
    "e": "M",
    "i": 2,
    "b": "Luhman 16 AB",
    "s": "",
    "p": [
      "bd",
      "minclouds",
      "bands"
    ]
  },
  {
    "id": 178,
    "c": "dark",
    "k": "BODY",
    "t": "OTS 44",
    "d": "A planetary-mass object of roughly 11 Jupiter masses, free-floating, with its own dust disc and active accretion — forming like a star, at the mass of a planet. It breaks the definition, which is the point of including it.",
    "e": "S",
    "i": 1,
    "b": "OTS 44",
    "s": "",
    "p": [
      "nostar",
      "young"
    ]
  },
  {
    "id": 179,
    "c": "dark",
    "k": "BODY",
    "t": "WD 1856+534 b",
    "d": "A Jupiter-size planet transiting a white dwarf every 34 hours, so deeply that it blocks over half the light. It must have migrated inward after the star died, since its current orbit was inside the former red giant.",
    "e": "M",
    "i": 3,
    "b": "WD 1856+534 b",
    "s": "",
    "p": [
      "wd",
      "postms",
      "migrate"
    ]
  },
  {
    "id": 180,
    "c": "dark",
    "k": "BODY",
    "t": "WD J0914+1914",
    "d": "A white dwarf accreting hydrogen, oxygen and sulfur from a giant planet it is actively evaporating — the first planet found being destroyed by a stellar corpse. The end-state of the postms item, made visible.",
    "e": "M",
    "i": 2,
    "b": "WD J0914+1914",
    "s": "",
    "p": [
      "wd",
      "escape",
      "tail"
    ]
  },
  {
    "id": 181,
    "c": "dark",
    "k": "BODY",
    "t": "The first exoplanets ever found",
    "d": "Detected in 1992 around a millisecond pulsar — 0.02, 4.3 and 3.9 M⊕ on 25-, 67- and 98-day orbits. They predate 51 Peg b by three years, they are bathed in relativistic particles, and they probably formed from the debris of whatever the supernova destroyed.",
    "e": "M",
    "i": 3,
    "b": "PSR B1257+12 b, c, d",
    "s": "",
    "p": [
      "pulsar",
      "nostar"
    ]
  },
  {
    "id": 182,
    "c": "dark",
    "k": "BODY",
    "t": "PSR B1620-26 b — Methuselah",
    "d": "Roughly 12.7 billion years old, in the globular cluster M4, orbiting a pulsar and a white dwarf together. Formed in a metal-poor environment where planets were not supposed to be able to form at all.",
    "e": "S",
    "i": 2,
    "b": "PSR B1620-26 b",
    "s": "",
    "p": [
      "pulsar",
      "binary",
      "evolve"
    ]
  },
  {
    "id": 183,
    "c": "dark",
    "k": "BODY",
    "t": "Planets made from dead stars",
    "d": "PSR J1719-1438 b orbits in 2.2 hours with a density above 23 g/cm³ — a stripped white dwarf core, probably crystalline carbon. KOI-55 b and c orbit a subdwarf B star in under 8 hours at nearly 7,800 K, likely the surviving cores of planets that were swallowed. Three worlds that used to be something else.",
    "e": "M",
    "i": 3,
    "b": "PSR J1719-1438 b / KOI-55",
    "s": "",
    "p": [
      "sdb",
      "pulsar",
      "carbon",
      "chthonian"
    ]
  },
  {
    "id": 184,
    "c": "dark",
    "k": "BODY",
    "t": "OGLE-2005-BLG-390L b — Hoth",
    "d": "5.5 M⊕ at about 2.6 AU from a small M dwarf, 6.6 kpc away toward the galactic bulge, with an estimated surface temperature near 50 K. Found by a microlensing event that will never repeat, so everything we will ever know about it is already known.",
    "e": "S",
    "i": 2,
    "b": "OGLE-2005-BLG-390L b",
    "s": "",
    "p": [
      "lum",
      "phase",
      "n2glacier"
    ]
  }
];
export const CATALOGUE_KIND = { BODY: 'World' };
