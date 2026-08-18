#!/usr/bin/env node
// Single source of truth for the ORRERY real-parameters backlog.
// Emits  briefs/exoparams-backlog.md  and  site/exoparams.html.
//
//   node scripts/exoparams.mjs
//
// The catalogue currently carries 120 named bodies and zero physical parameters.
// This backlog is the route from string-matching to a measured parameter table,
// plus the seed of that table itself (WORLDS, below).
//
// k:  DATA = the numbers · ENG = derivation and engine · UI = panels and legibility.
// e:  effort S/M/L.  i: impact 1..3.
// g:  capability token this item provides.  n: tokens it needs first.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = [
  ['schema', 'The parameter record',
    'A `CATALOGUE` BODY entry is `{ id, c, k, t, d, e, i, b, s, p }` — a title, a description, an effort, an impact, a name and a list of capability tokens. There is not one physical quantity in it. Every item in this document is downstream of deciding what a world *is*, as a record.'],
  ['pipeline', 'Getting real numbers in',
    'The README documents a `pscomppars` query and nothing consumes it. Values reach the simulation as hand-typed constants inside `applyNeeds()`. A world should be data with a provenance, refreshed by a script, not a branch in a function.'],
  ['star', 'Host stars as measured objects',
    '`starFromCatalogueItem` guesses an effective temperature from a regex over the body name. The regex reads `/trapist|proxima|gj |gliese/` — TRAPPIST with one P — so it never matches on name at all, and TRAPPIST-1 e only gets an M8 host because it happens to carry the `ucd` token.'],
  ['orbit', 'Orbit, spin and tides from elements',
    '`applyNeeds` sets `rotationPeriod = max(abs(rotationPeriod), 40)` for anything tagged `lock`, and `-243` for anything tagged `retro`. Semi-major axis, period, eccentricity, inclination and argument of periastron are not represented anywhere, so nothing can be derived from them.'],
  ['bulk', 'Mass, radius, density and interior',
    '`sanitize()` clamps `gravity` to 0.05–3 and `relief` to 0.005–0.15, both authored per world. Radius and mass are the two most commonly measured quantities in the entire exoplanet archive, and neither exists in the model.'],
  ['air', 'Atmosphere from parameters, not from tags',
    '`applyNeeds` assigns whole gas mixtures by tag — `{ N2: 0.95, CO2: 0.01, CH4: 0.05 }` if the name contains "titan". Whether a world retains an atmosphere at all is a computable outcome of escape velocity, temperature and integrated XUV dose.'],
  ['therm', 'Temperature, volatiles and the surface',
    '`rule.freeze` and `rule.solar` are authored numbers that stand in for the entire thermal state. Equilibrium temperature is one line of physics from insolation and albedo, and it is the number every catalogue row already reports.'],
  ['sol', 'The Solar System — 12 bodies',
    'The best-measured objects in existence and the calibration spine for everything else. If the model cannot reproduce Venus, Mars and Titan from their real parameters, no exoplanet built the same way is worth believing.'],
  ['moons', 'The moons — 15 bodies',
    'Fifteen bodies currently routed through `byId("selene")` with a colour tint and a `solar` value between 0.08 and 0.35. Their defining parameters are tidal, not stellar, and almost none of that is represented.'],
  ['temperate', 'Temperate worlds — 29 bodies',
    'The headline category and the one where accuracy matters most, because these are the worlds people have opinions about. Almost all orbit M dwarfs, almost all are tidally locked, and the current model gives them Earth’s ruleset with a hue shift.'],
  ['furnace', 'Lava worlds and ultra-short periods — 17 bodies',
    'Periods measured in hours, daysides above 2,000 K, rock-vapour atmospheres and disintegrating planets. `applyNeeds` handles the whole category with `rule.solar = max(rule.solar, 2.2)` and a red tint.'],
  ['giant', 'Giants and sub-Neptunes — 21 bodies',
    'Twenty-one worlds mapped onto `byId("vermis")` — a silicate world with megafauna — and given a heightfield. Most of the mass in the catalogue has no surface at all.'],
  ['arch', 'Young, imaged and architectural — 10 bodies',
    'Directly imaged giants still glowing from formation, systems with eight planets, orbits at e = 0.95. This category is about the *system* being the object rather than the planet.'],
  ['dark', 'Dark and exotic hosts — 16 bodies',
    'Circumbinaries, free-floaters, brown dwarfs, white dwarfs and pulsars. Sixteen worlds whose host is not a normal star, currently resolved by `if (item.c === "dark")` into either Selene or Terra.'],
  ['panel', 'Panels in real units',
    '`climatePanel` gives every world the same Day slider from 15 to 800 (0.15× to 8×) and the same Tilt from 0 to 90°. A panel that does not know Venus rotates backwards in 243 days, or that TRAPPIST-1 e is locked, cannot tell the player anything true.'],
  ['prov', 'Provenance, error bars and contested claims',
    'Half the interesting rows in the catalogue are argued about — the phosphine, the DMS, the Kapteyn planets, the KOI-55 pulsations. A parameter without a source and a date is a rumour, and the disagreements are more interesting than the claims.'],
  ['valid', 'Validation, tests and calibration',
    '`calibrate.mjs` checks modern Earth. Once every world has real parameters, every world becomes a test case — and the ones the model gets wrong are the most valuable output the project can produce.'],
  ['gap', 'When the data does not exist',
    'Most catalogue rows are missing most columns. Mass without radius, radius without mass, no eccentricity, no age. Deciding what to do about that — honestly, visibly, and the same way every time — is a design problem, not a data problem.'],
];

/**
 * Seed parameter table. This is deliberately part of the backlog rather than an
 * appendix: the first item in the document asks for exactly this table, and the
 * cheapest way to specify it is to write it.
 *
 * r    radius, Earth radii (giants in R⊕ too — convert at 11.21 R⊕ = 1 R_J)
 * m    mass, Earth masses
 * a    semi-major axis, AU
 * P    orbital period, days
 * e    eccentricity
 * obl  obliquity, degrees
 * rot  rotation period, hours (negative = retrograde); 'lock' = synchronous
 * S    insolation, Earth = 1
 * teq  equilibrium / measured surface temperature, K
 * teff host effective temperature, K
 * note the one thing that makes this world itself
 */
const WORLDS = [
/* ---- sol (12) ---- */
{b:'Earth',c:'sol',r:1,m:1,a:1,P:365.256,e:0.0167,obl:23.44,rot:23.934,S:1,teq:288,teff:5772,note:'1 bar, 78/21 N₂/O₂, 71% ocean, Bond albedo 0.306. The calibration target every other row inherits credibility from.'},
{b:'Venus',c:'sol',r:0.9499,m:0.815,a:0.7233,P:224.70,e:0.0068,obl:177.4,rot:-5832.5,S:1.911,teq:737,teff:5772,note:'92 bar CO₂, retrograde 243-day rotation, Bond albedo 0.76, a solar day of 117 Earth days.'},
{b:'Mars',c:'sol',r:0.532,m:0.107,a:1.524,P:686.98,e:0.0934,obl:25.19,rot:24.62,S:0.431,teq:210,teff:5772,note:'6.4 mbar CO₂, obliquity that has varied chaotically without a large moon, global dust storms.'},
{b:'Mercury',c:'sol',r:0.383,m:0.0553,a:0.3871,P:87.97,e:0.2056,obl:0.03,rot:1407.6,S:6.67,teq:440,teff:5772,note:'3:2 spin–orbit resonance, no atmosphere, surface 100–700 K, an outsized iron core at ~85% of the radius.'},
{b:'Jupiter',c:'sol',r:11.21,m:317.8,a:5.204,P:4332.6,e:0.0489,obl:3.13,rot:9.925,S:0.037,teq:165,teff:5772,note:'No surface. Emits more heat than it receives. Banded at a Rhines scale set by a 9.9-hour day.'},
{b:'Saturn',c:'sol',r:9.45,m:95.16,a:9.583,P:10759,e:0.0565,obl:26.73,rot:10.66,S:0.011,teq:134,teff:5772,note:'Mean density 0.687 g/cm³ — less than water. Rings, and a hexagonal polar jet.'},
{b:'Uranus',c:'sol',r:4.007,m:14.54,a:19.19,P:30689,e:0.0463,obl:97.77,rot:-17.24,S:0.0027,teq:76,teff:5772,note:'Tipped on its side, so each pole faces the Sun for 42 years. The extreme test of the obliquity code.'},
{b:'Neptune',c:'sol',r:3.883,m:17.15,a:30.07,P:60195,e:0.0089,obl:28.32,rot:16.11,S:0.0011,teq:72,teff:5772,note:'Fastest winds in the Solar System at ~2,000 km/h on almost no insolation — an internal-heat-driven atmosphere.'},
{b:'Pluto',c:'sol',r:0.186,m:0.00218,a:39.48,P:90560,e:0.2488,obl:122.5,rot:-153.3,S:0.00064,teq:44,teff:5772,note:'~1 Pa N₂ atmosphere that collapses and re-sublimes over its orbit. Nitrogen glaciers. Locked to Charon.'},
{b:'Ceres',c:'sol',r:0.0742,m:0.00016,a:2.768,P:1682,e:0.0785,obl:4,rot:9.07,S:0.13,teq:167,teff:5772,note:'Dwarf planet with a briny subsurface layer and cryovolcanic deposits. The smallest body worth a hydrosphere.'},
{b:'Eris / Sedna',c:'sol',r:0.183,m:0.0028,a:67.8,P:203830,e:0.436,obl:78,rot:378,S:0.00022,teq:38,teff:5772,note:'Eris a = 67.8 AU; Sedna perihelion 76 AU, aphelion ~937 AU, period ~11,400 yr. Sunlight as a bright star.'},
{b:'Arrokoth / Bennu / 67P',c:'sol',r:0.0028,m:1e-10,a:44.6,P:108000,e:0.04,obl:99,rot:15.92,S:0.0005,teq:40,teff:5772,note:'Contact binaries and rubble piles. No hydrostatic equilibrium — the heightfield assumption fails on shape, not just on surface.'},
/* ---- moons (15) ---- */
{b:'Luna',c:'moons',r:0.2727,m:0.0123,a:0.00257,P:27.32,e:0.0549,obl:6.68,rot:'lock',S:1,teq:250,teff:5772,note:'Receding 3.8 cm/yr. Stabilises Earth’s obliquity and supplies ~2.2× the solar tide. Surface 100–390 K.'},
{b:'Io',c:'moons',r:0.286,m:0.015,a:0.00282,P:1.769,e:0.0041,obl:0,rot:'lock',S:0.037,teq:110,teff:5772,note:'~400 active volcanoes, tidal dissipation of order 10¹⁴ W, surface heat flow ~2 W/m² — 20× Earth’s. No impact craters.'},
{b:'Europa',c:'moons',r:0.245,m:0.008,a:0.00449,P:3.551,e:0.0094,obl:0.1,rot:'lock',S:0.037,teq:102,teff:5772,note:'Ice shell 15–25 km over a 60–150 km ocean, twice Earth’s ocean volume. Radiolysis supplies oxidants from above.'},
{b:'Ganymede',c:'moons',r:0.413,m:0.0248,a:0.00716,P:7.155,e:0.0013,obl:0.16,rot:'lock',S:0.037,teq:110,teff:5772,note:'Largest moon in the Solar System and the only one with its own magnetic field. Subsurface ocean between ice layers.'},
{b:'Callisto',c:'moons',r:0.378,m:0.018,a:0.01259,P:16.69,e:0.0074,obl:0,rot:'lock',S:0.037,teq:134,teff:5772,note:'Outside the Laplace resonance, so almost no tidal heating. The most heavily cratered surface known — a control case.'},
{b:'Titan',c:'moons',r:0.404,m:0.0225,a:0.00817,P:15.945,e:0.0288,obl:0.3,rot:'lock',S:0.011,teq:94,teff:5772,note:'1.5 bar N₂ with ~5% CH₄ — the only moon with a substantial atmosphere. Methane lakes, rain and a full hydrological cycle at 94 K.'},
{b:'Enceladus',c:'moons',r:0.0395,m:0.000018,a:0.00159,P:1.370,e:0.0047,obl:0,rot:'lock',S:0.011,teq:75,teff:5772,note:'South-polar plumes venting ocean water into space, sampled in flight. Silica grains imply hydrothermal activity above 90 °C.'},
{b:'Triton',c:'moons',r:0.212,m:0.00359,a:0.00237,P:-5.877,e:0.000016,obl:157,rot:'lock',S:0.0011,teq:38,teff:5772,note:'Retrograde — a captured Kuiper Belt object, spiralling in. Nitrogen geysers on a 38 K surface, the coldest measured in the Solar System.'},
{b:'Miranda',c:'moons',r:0.0371,m:0.0000109,a:0.00087,P:1.413,e:0.0013,obl:0,rot:'lock',S:0.0027,teq:60,teff:5772,note:'Verona Rupes, a scarp up to 20 km high — impossible at Earth gravity. Terrain that looks assembled from pieces.'},
{b:'Iapetus',c:'moons',r:0.115,m:0.0003,a:0.0238,P:79.32,e:0.0283,obl:0,rot:'lock',S:0.011,teq:110,teff:5772,note:'Leading hemisphere albedo 0.05, trailing 0.5 — a factor of ten across one body. An equatorial ridge 20 km high.'},
{b:'Mimas',c:'moons',r:0.0311,m:0.0000063,a:0.00124,P:0.942,e:0.0196,obl:0,rot:'lock',S:0.011,teq:64,teff:5772,note:'Herschel crater is a third of its diameter. Libration implies either an ocean or an irregular core — recently argued to be an ocean.'},
{b:'Charon',c:'moons',r:0.095,m:0.000268,a:0.000117,P:6.387,e:0.00005,obl:0,rot:'lock',S:0.00064,teq:53,teff:5772,note:'Mutually locked with Pluto around a barycentre outside Pluto’s surface — the only true double planet in the Solar System.'},
{b:'Uranian moons',c:'moons',r:0.12,m:0.0002,a:0.00291,P:8.7,e:0.002,obl:98,rot:'lock',S:0.0027,teq:60,teff:5772,note:'Titania, Oberon, Ariel, Umbriel — orbiting in the plane of a planet tipped 98°, so their seasons are 42 years of light and 42 of dark.'},
{b:'Rhea / Dione / Tethys / Hyperion',c:'moons',r:0.12,m:0.0004,a:0.00353,P:4.5,e:0.001,obl:0,rot:'lock',S:0.011,teq:75,teff:5772,note:'Hyperion is the exception: chaotic, tumbling rotation with no stable axis, and a sponge-like 40% porosity.'},
{b:'Phobos / Deimos',c:'moons',r:0.00175,m:1.8e-9,a:0.0000627,P:0.319,e:0.0151,obl:0,rot:'lock',S:0.431,teq:233,teff:5772,note:'Phobos orbits below synchronous altitude and is spiralling in — tidal disruption or impact within ~50 Myr. Tides running backwards.'},
];

/* ---- temperate (29) ---- */
WORLDS.push(
{b:'TRAPPIST-1 e',c:'temperate',r:0.920,m:0.692,a:0.02925,P:6.101,e:0.005,obl:0,rot:'lock',S:0.646,teq:250,teff:2566,note:'The best rocky habitable-zone candidate known. Host is an M8V at 0.0898 M☉, 0.1192 R☉, ~7.6 Gyr, 12.4 pc.'},
{b:'TRAPPIST-1 f',c:'temperate',r:1.045,m:1.039,a:0.03849,P:9.207,e:0.010,obl:0,rot:'lock',S:0.373,teq:219,teff:2566,note:'Outer habitable zone. Likely volatile-rich if anything survived the star’s several-hundred-Myr saturated XUV phase.'},
{b:'TRAPPIST-1 g, h',c:'temperate',r:1.129,m:1.321,a:0.04683,P:12.352,e:0.002,obl:0,rot:'lock',S:0.252,teq:199,teff:2566,note:'g at S = 0.25; h at P = 18.77 d and S = 0.144 — the coldest in the system, a snowball unless the greenhouse is strong.'},
{b:'TRAPPIST-1 d',c:'temperate',r:0.788,m:0.388,a:0.02227,P:4.049,e:0.008,obl:0,rot:'lock',S:1.115,teq:288,teff:2566,note:'Inner edge, insolation near Earth’s. Low density suggests a volatile layer rather than a bare rock.'},
{b:'TRAPPIST-1 b, c',c:'temperate',r:1.116,m:1.374,a:0.01154,P:1.511,e:0.006,obl:0,rot:'lock',S:4.153,teq:400,teff:2566,note:'JWST measured b’s dayside near 503 K with no thick atmosphere, and c near 380 K with little or no CO₂. The first real answers, and both are negative.'},
{b:'TRAPPIST-1 system',c:'temperate',r:1,m:1,a:0.03,P:6.1,e:0.005,obl:0,rot:'lock',S:0.6,teq:250,teff:2566,note:'Seven planets in a near-resonant chain (8:5, 5:3, 3:2, 3:2, 4:3, 3:2). Transit-timing variations give the masses to a few per cent.'},
{b:'Proxima Cen b',c:'temperate',r:1.03,m:1.07,a:0.04857,P:11.186,e:0.02,obl:0,rot:'lock',S:0.65,teq:234,teff:3042,note:'M5.5V at 1.30 pc — the nearest exoplanet. Mass is a minimum from radial velocity; no transit, so no radius. Host flares hard.'},
{b:'Proxima Cen d',c:'temperate',r:0.8,m:0.26,a:0.02885,P:5.122,e:0.04,obl:0,rot:'lock',S:1.8,teq:360,teff:3042,note:'A candidate sub-Earth at 0.26 M⊕ minimum mass — near the detection limit of the method that found it.'},
{b:'LHS 1140 b',c:'temperate',r:1.730,m:5.60,a:0.0946,P:24.737,e:0.096,obl:0,rot:'lock',S:0.43,teq:226,teff:3096,note:'M4.5V at 14.9 pc. Density argues either a rocky world with a thin secondary atmosphere or a water world; JWST hints at nitrogen.'},
{b:'TOI-700 d',c:'temperate',r:1.073,m:1.72,a:0.1633,P:37.426,e:0.03,obl:0,rot:'lock',S:0.87,teq:269,teff:3480,note:'M2V, and unusually quiet — no flares seen in a year of TESS monitoring, which matters more than the insolation.'},
{b:'TOI-700 e',c:'temperate',r:0.953,m:1.0,a:0.134,P:27.810,e:0.03,obl:0,rot:'lock',S:1.27,teq:295,teff:3480,note:'Found in extended-mission data two years after d. Inner edge of the conservative habitable zone.'},
{b:'Teegarden b, c, d',c:'temperate',r:1.02,m:1.05,a:0.0252,P:4.910,e:0.04,obl:0,rot:'lock',S:1.15,teq:264,teff:2904,note:'M7V at 3.83 pc. b at P = 4.91 d, c at 11.4 d, d at 26.13 d. Radial-velocity only — these are minimum masses.'},
{b:'Ross 128 b',c:'temperate',r:1.1,m:1.40,a:0.0496,P:9.866,e:0.116,obl:0,rot:'lock',S:1.38,teq:269,teff:3192,note:'M4V at 3.37 pc and remarkably inactive — the quiet counter-example to Proxima. Minimum mass only.'},
{b:'GJ 273 b',c:'temperate',r:1.3,m:2.89,a:0.09110,P:18.650,e:0.10,obl:0,rot:'lock',S:1.06,teq:265,teff:3382,note:'Luyten’s star, 3.79 pc. A message was transmitted at it in 2017; it arrives in 2030.'},
{b:'Wolf 1061 c / K2-3 d',c:'temperate',r:1.6,m:3.41,a:0.0890,P:17.87,e:0.11,obl:0,rot:'lock',S:1.30,teq:280,teff:3342,note:'Wolf 1061 c at 4.3 pc; K2-3 d is a transiting 1.5 R⊕ at P = 44.6 d — one of the few HZ candidates with both radius and mass.'},
{b:'Gliese 12 b',c:'temperate',r:0.96,m:1.6,a:0.0668,P:12.762,e:0.04,obl:0,rot:'lock',S:1.6,teq:315,teff:3296,note:'Transiting, 12 pc, and quiet — currently one of the most accessible temperate targets for transmission spectroscopy.'},
{b:'TOI-715 b',c:'temperate',r:1.55,m:3.0,a:0.083,P:19.288,e:0.03,obl:0,rot:'lock',S:0.67,teq:234,teff:3470,note:'Sits right at the radius valley, so whether it is a big rock or a small water world is the whole question.'},
{b:'LP 890-9 c',c:'temperate',r:1.367,m:2.5,a:0.0396,P:8.457,e:0.02,obl:0,rot:'lock',S:0.906,teq:272,teff:2850,note:'Second-coolest star known to host transiting temperate planets, after TRAPPIST-1. Found by SPECULOOS.'},
{b:'GJ 357 d',c:'temperate',r:1.8,m:6.1,a:0.204,P:55.661,e:0.05,obl:0,rot:'lock',S:0.38,teq:220,teff:3505,note:'Minimum mass 6.1 M⊕ — likely a mini-Neptune rather than a rocky world, which is the honest reading of most RV super-Earths.'},
{b:'Kepler-186 f',c:'temperate',r:1.17,m:1.4,a:0.432,P:129.944,e:0.04,obl:0,rot:'lock',S:0.29,teq:188,teff:3788,note:'The first Earth-sized planet found in a habitable zone, 2014. 179 pc away, so no follow-up spectroscopy is possible.'},
{b:'Kepler-442 b',c:'temperate',r:1.34,m:2.3,a:0.409,P:112.305,e:0.04,obl:0,rot:'lock',S:0.70,teq:233,teff:4402,note:'Consistently ranks at the top of habitability indices. K-dwarf host, which avoids both the flare problem and the red-light problem.'},
{b:'Kepler-452 b',c:'temperate',r:1.63,m:5.0,a:1.046,P:384.843,e:0.04,obl:23,rot:24,S:1.10,teq:265,teff:5757,note:'A G2V host and a 385-day year — the closest analogue to Earth’s *orbit* in the catalogue. The detection itself has been questioned.'},
{b:'Kepler-1649 c',c:'temperate',r:1.06,m:1.2,a:0.0649,P:19.535,e:0.04,obl:0,rot:'lock',S:0.75,teq:234,teff:3240,note:'Recovered from data an automated pipeline had rejected. Closest match to Earth in radius and insolation together.'},
{b:'Kepler-62 e, f',c:'temperate',r:1.61,m:3.6,a:0.427,P:122.387,e:0.04,obl:0,rot:'lock',S:1.19,teq:270,teff:4925,note:'e at S = 1.19 and f at P = 267.3 d, S = 0.41. A five-planet system with two in or near the zone — a system-scale result.'},
{b:'Kepler-22 b',c:'temperate',r:2.38,m:9.1,a:0.849,P:289.862,e:0.04,obl:23,rot:24,S:1.11,teq:262,teff:5518,note:'The first habitable-zone transit, 2011, and at 2.4 R⊕ almost certainly not rocky. A useful lesson in what "habitable zone" does not mean.'},
{b:'Kepler-438 b, 1229 b',c:'temperate',r:1.12,m:1.3,a:0.166,P:35.233,e:0.03,obl:0,rot:'lock',S:1.38,teq:276,teff:3748,note:'438 b receives heavy flare irradiation which likely stripped it; 1229 b sits at P = 86.8 d and S = 0.49. Two outcomes from similar starting points.'},
{b:'tau Cet f',c:'temperate',r:1.8,m:3.93,a:1.334,P:642,e:0.03,obl:23,rot:24,S:0.30,teq:190,teff:5344,note:'3.65 pc, a G8V naked-eye star. The signal is contested — several claimed planets in this system have not survived reanalysis.'},
{b:'Kapteyn c',c:'temperate',r:1.9,m:7.0,a:0.311,P:121.5,e:0.23,obl:0,rot:'lock',S:0.11,teq:150,teff:3570,note:'Claimed around an 11-Gyr halo star, then argued to be an artefact of stellar rotation. Ship it as the contested row it is.'},
{b:'Barnard b–e',c:'temperate',r:0.7,m:0.30,a:0.0229,P:3.154,e:0.02,obl:0,rot:'lock',S:0.4,teq:210,teff:3195,note:'Four sub-Earths at 0.19–0.34 M⊕ confirmed 2024–2025 around the second-nearest system, 1.83 pc. Too hot for liquid water; historic anyway.'},
);

/* ---- furnace (17) ---- */
WORLDS.push(
{b:'55 Cnc e',c:'furnace',r:1.875,m:7.99,a:0.01544,P:0.7365,e:0.05,obl:0,rot:'lock',S:2200,teq:2000,teff:5172,note:'Dayside ~2,400 K. JWST reported a secondary CO/CO₂ atmosphere over a magma ocean in 2024 — the first for a rocky exoplanet.'},
{b:'K2-141 b',c:'furnace',r:1.51,m:5.08,a:0.00716,P:0.2803,e:0,obl:0,rot:'lock',S:5000,teq:2039,teff:4599,note:'A magma ocean with a rock-vapour atmosphere — sodium and SiO evaporating on the dayside, raining out on the night. Supersonic winds.'},
{b:'CoRoT-7 b',c:'furnace',r:1.585,m:5.74,a:0.0170,P:0.8536,e:0,obl:0,rot:'lock',S:1800,teq:1756,teff:5275,note:'The first confirmed rocky exoplanet, 2009. Established that the radius valley has a rocky floor.'},
{b:'Kepler-10 b',c:'furnace',r:1.47,m:3.33,a:0.0169,P:0.8375,e:0,obl:0,rot:'lock',S:3700,teq:2169,teff:5627,note:'Kepler’s first rocky planet. Density 5.8 g/cm³ — an Earth-composition world at 2,000 K.'},
{b:'Kepler-78 b',c:'furnace',r:1.20,m:1.87,a:0.0089,P:0.3550,e:0,obl:0,rot:'lock',S:3000,teq:2300,teff:5089,note:'Earth-sized, Earth-density, 8.5-hour year. Its orbit is decaying and it will not survive.'},
{b:'GJ 367 b',c:'furnace',r:0.718,m:0.633,a:0.00709,P:0.3219,e:0,obl:0,rot:'lock',S:600,teq:1365,teff:3522,note:'A sub-Earth at 10.2 g/cm³ — about 91% iron by mass. The stripped-core end of the composition range.'},
{b:'LHS 3844 b',c:'furnace',r:1.303,m:2.2,a:0.00622,P:0.4629,e:0,obl:0,rot:'lock',S:70,teq:805,teff:3036,note:'Spitzer phase curve showed no heat redistribution at all — a bare rock with no atmosphere, and the cleanest such result there is.'},
{b:'GJ 1132 b',c:'furnace',r:1.13,m:1.66,a:0.0153,P:1.6289,e:0,obl:0,rot:'lock',S:19,teq:580,teff:3270,note:'Claimed and then disputed secondary atmosphere. A textbook case of a marginal detection at the limit of the instrument.'},
{b:'GJ 486 b',c:'furnace',r:1.305,m:2.82,a:0.01734,P:1.4671,e:0,obl:0,rot:'lock',S:38,teq:700,teff:3291,note:'JWST spectrum is ambiguous between a water-rich atmosphere and unocculted starspots — the contamination problem, in one row.'},
{b:'HD 219134 b / HD 3167 b',c:'furnace',r:1.602,m:4.74,a:0.03876,P:3.0928,e:0.06,obl:0,rot:'lock',S:170,teq:1015,teff:4699,note:'HD 219134 b at 6.5 pc is the nearest transiting rocky planet. HD 3167 b is a USP at P = 0.96 d in a system with a nearly polar outer orbit.'},
{b:'K2-137 b',c:'furnace',r:0.89,m:0.5,a:0.00575,P:0.1795,e:0,obl:0,rot:'lock',S:130,teq:1000,teff:3492,note:'A 4.3-hour year — among the shortest known around a main-sequence star, and close to the Roche limit for a rocky body.'},
{b:'Kepler-1520 b',c:'furnace',r:0.3,m:0.02,a:0.0129,P:0.6536,e:0,obl:0,rot:'lock',S:700,teq:2000,teff:4677,note:'Disintegrating. Transit depth varies from 0.2% to 1.3% between orbits because what transits is a comet-like tail of mineral dust.'},
{b:'K2-22 b',c:'furnace',r:0.4,m:0.03,a:0.0088,P:0.3810,e:0,obl:0,rot:'lock',S:800,teq:2000,teff:3830,note:'The second disintegrating planet, with a leading rather than trailing dust tail. Two objects, two different tail geometries.'},
{b:'TOI-849 b',c:'furnace',r:3.44,m:39.1,a:0.01598,P:0.7654,e:0,obl:0,rot:'lock',S:2900,teq:1800,teff:5329,note:'An exposed planetary core — Neptune mass with almost no envelope, sitting in the middle of the hot-Neptune desert.'},
{b:'GJ 9827 d',c:'furnace',r:2.022,m:3.42,a:0.0562,P:6.2014,e:0,obl:0,rot:'lock',S:36,teq:686,teff:4340,note:'Density argues for a steam world — HST detected water vapour, and the interpretation is either a small envelope or a very wet interior.'},
{b:'LP 791-18 d',c:'furnace',r:1.03,m:0.9,a:0.02,P:2.7526,e:0.001,obl:0,rot:'lock',S:1.5,teq:300,teff:2960,note:'Forced eccentricity from the neighbouring planet drives tidal heating — a plausibly Io-like volcanic world at a temperate insolation.'},
{b:'Kepler-36 b, c',c:'furnace',r:1.486,m:4.45,a:0.1153,P:13.840,e:0.04,obl:0,rot:'lock',S:60,teq:980,teff:5911,note:'Two planets 10% apart in orbital distance whose densities differ by a factor of eight — 7.5 vs 0.9 g/cm³. Formation, made visible.'},
);

/* ---- giant (21) ---- */
WORLDS.push(
{b:'51 Peg b',c:'giant',r:16.9,m:146,a:0.0527,P:4.2308,e:0.013,obl:0,rot:'lock',S:1100,teq:1284,teff:5793,note:'The first planet found around a Sun-like star, 1995, and the discovery that broke every formation model of the time.'},
{b:'HD 209458 b',c:'giant',r:15.46,m:219,a:0.04747,P:3.5247,e:0.0,obl:0,rot:'lock',S:1000,teq:1449,teff:6065,note:'First transit, first atmosphere, first evaporating exosphere. The reference hot Jupiter, and inflated well beyond models.'},
{b:'HD 189733 b',c:'giant',r:12.8,m:365,a:0.03126,P:2.2186,e:0,obl:0,rot:'lock',S:500,teq:1200,teff:4875,note:'Deep blue from Rayleigh scattering off silicate grains. Winds inferred near 2 km/s, and the best-studied atmosphere anywhere.'},
{b:'WASP-12 b',c:'giant',r:20.6,m:446,a:0.0234,P:1.0914,e:0.0,obl:0,rot:'lock',S:6000,teq:2580,teff:6300,note:'Orbital decay measured directly at about 29 ms per year — it will be destroyed within a few Myr. Albedo under 0.1, carbon-rich.'},
{b:'WASP-76 b',c:'giant',r:20.1,m:292,a:0.0330,P:1.8099,e:0,obl:0,rot:'lock',S:4000,teq:2160,teff:6250,note:'Iron rain: Fe vaporised on the dayside, condensing as it crosses the evening terminator. Detected as an asymmetric absorption signal.'},
{b:'WASP-121 b',c:'giant',r:20.5,m:376,a:0.02544,P:1.2749,e:0,obl:0,rot:'lock',S:5000,teq:2358,teff:6460,note:'A thermal inversion from metal-oxide absorption, and heavy metals escaping the Roche lobe. Nearly filling its Roche surface.'},
{b:'KELT-9 b',c:'giant',r:21.2,m:895,a:0.03462,P:1.4811,e:0,obl:0,rot:'lock',S:44000,teq:4050,teff:10170,note:'The hottest planet known — dayside about 4,600 K, hotter than most K dwarfs. H₂ dissociates on the day side and recombines on the night.'},
{b:'TOI-2109 b',c:'giant',r:19.7,m:1130,a:0.01791,P:0.6725,e:0,obl:0,rot:'lock',S:19000,teq:3630,teff:6530,note:'The shortest-period hot Jupiter known, at 16 hours, with measurable orbital decay. The extreme end of the migration story.'},
{b:'WASP-33 b',c:'giant',r:17.3,m:698,a:0.0259,P:1.2199,e:0,obl:0,rot:'lock',S:9000,teq:2710,teff:7430,note:'Orbits a δ Scuti pulsator on a retrograde, nearly polar path. The star’s own oscillations contaminate every measurement.'},
{b:'WASP-19 b',c:'giant',r:15.9,m:363,a:0.01655,P:0.7888,e:0.002,obl:0,rot:'lock',S:4300,teq:2050,teff:5460,note:'One of the shortest-period hot Jupiters around a Sun-like star, and among the first with a detected water feature.'},
{b:'WASP-17 b',c:'giant',r:21.5,m:154,a:0.0515,P:3.7354,e:0,obl:0,rot:'lock',S:800,teq:1740,teff:6550,note:'Retrograde orbit — the discovery that showed hot Jupiters can be scattered rather than migrated. JWST found quartz nanocrystal clouds.'},
{b:'TrES-2 b',c:'giant',r:13.5,m:379,a:0.03556,P:2.4706,e:0,obl:0,rot:'lock',S:700,teq:1500,teff:5795,note:'Geometric albedo under 1% — the darkest known planet, reflecting less light than coal. Nobody fully knows why.'},
{b:'Kepler-7 b / HAT-P-7 b',c:'giant',r:18.2,m:139,a:0.06246,P:4.8855,e:0,obl:0,rot:'lock',S:400,teq:1620,teff:5933,note:'Kepler-7 b has a density of 0.17 g/cm³ and the first cloud map from a phase-curve offset. HAT-P-7 b shows clouds that visibly change.'},
{b:'WASP-127 b',c:'giant',r:15.1,m:52.5,a:0.0484,P:4.1780,e:0,obl:0,rot:'lock',S:600,teq:1400,teff:5750,note:'A third of Saturn’s mass in a larger-than-Jupiter radius — one of the puffiest planets known, and a superb transmission target.'},
{b:'KELT-1 b',c:'giant',r:12.4,m:8500,a:0.02466,P:1.2175,e:0.01,obl:0,rot:'lock',S:6000,teq:2420,teff:6516,note:'27 Jupiter masses — above the deuterium-burning limit, so arguably a brown dwarf. Where the definition of "planet" actually breaks.'},
{b:'GJ 436 b',c:'giant',r:4.19,m:22.1,a:0.0287,P:2.6439,e:0.152,obl:0,rot:'lock',S:40,teq:686,teff:3479,note:'A warm Neptune with an unexplained eccentricity and a comet-like hydrogen tail extending far beyond the planet.'},
{b:'GJ 3470 b',c:'giant',r:4.57,m:13.9,a:0.0348,P:3.3366,e:0.017,obl:0,rot:'lock',S:70,teq:615,teff:3652,note:'Escaping helium detected in a metastable line — the clearest direct measurement of atmospheric loss in progress.'},
{b:'HAT-P-11 b',c:'giant',r:4.36,m:23.4,a:0.05254,P:4.8878,e:0.265,obl:0,rot:'lock',S:120,teq:878,teff:4780,note:'The first Neptune-mass planet with a clear water detection, on a nearly polar orbit around an active K dwarf.'},
{b:'LTT 9779 b',c:'giant',r:4.72,m:29.3,a:0.01679,P:0.7921,e:0,obl:0,rot:'lock',S:800,teq:1978,teff:5443,note:'An ultra-hot Neptune inside the Neptune desert, with a geometric albedo near 0.8 — reflective metallic clouds where nothing should survive.'},
{b:'GJ 1214 b',c:'giant',r:2.742,m:8.17,a:0.01411,P:1.5804,e:0,obl:0,rot:'lock',S:17,teq:596,teff:3250,note:'The archetypal sub-Neptune. A decade of flat spectra resolved by JWST into a metal-rich, hazy atmosphere with strong day–night contrast.'},
{b:'K2-18 b / TOI-270 d',c:'giant',r:2.61,m:8.63,a:0.1591,P:32.940,e:0.09,obl:0,rot:'lock',S:1.28,teq:265,teff:3457,note:'CH₄ and CO₂ detected, consistent with a hycean interpretation. The DMS claim is contested and should ship flagged as such.'},
);

/* ---- arch (10) ---- */
WORLDS.push(
{b:'HR 8799',c:'arch',r:13.4,m:2380,a:16.4,P:16600,e:0.02,obl:0,rot:8,S:0.4,teq:1100,teff:7430,note:'Four directly imaged giants at 16, 27, 43 and 71 AU around a 30-Myr A5V. The only multi-planet system with a real orbital movie.'},
{b:'beta Pic b, c',c:'arch',r:12.9,m:3500,a:9.9,P:8200,e:0.10,obl:0,rot:8.1,S:1.5,teq:1700,teff:8052,note:'Imaged inside an edge-on debris disk. Rotation measured spectroscopically at ~25 km/s — a directly observed exoplanet day length.'},
{b:'51 Eri b',c:'arch',r:12.0,m:800,a:11.1,P:11700,e:0.45,obl:0,rot:12,S:0.6,teq:700,teff:7331,note:'The first imaged planet with a strong methane detection — a genuinely Jupiter-like atmosphere rather than a hot young one.'},
{b:'HIP 65426 b',c:'arch',r:13.0,m:2290,a:92,P:243000,e:0.10,obl:0,rot:10,S:0.02,teq:1400,teff:8840,note:'The first exoplanet directly imaged by JWST, at 92 AU. Demonstrates the mid-infrared contrast floor the instrument actually reaches.'},
{b:'GJ 504 b / HD 106906 b',c:'arch',r:12.0,m:1270,a:43.5,P:110000,e:0.10,obl:0,rot:10,S:0.02,teq:510,teff:6205,note:'GJ 504 b is cold enough to look magenta rather than orange. HD 106906 b sits at 738 AU on a misaligned orbit outside a warped disk.'},
{b:'AU Mic b',c:'arch',r:4.07,m:11.7,a:0.0645,P:8.463,e:0.19,obl:0,rot:'lock',S:15,teq:593,teff:3700,note:'A transiting Neptune around a 22-Myr M dwarf still inside its debris disk. Planetary evolution caught in progress.'},
{b:'V1298 Tau b / K2-33 b',c:'arch',r:10.3,m:100,a:0.1688,P:24.14,e:0.10,obl:0,rot:'lock',S:30,teq:677,teff:4970,note:'V1298 Tau has four planets at ~23 Myr; K2-33 b is ~10 Myr. Both are inflated and will shrink — radius evolution as an observable.'},
{b:'HD 80606 b / HD 20782 b / Kepler-1704 b',c:'arch',r:11.3,m:1300,a:0.4564,P:111.44,e:0.9336,obl:0,rot:39.9,S:0.5,teq:400,teff:5645,note:'HD 80606 b swings from 800 K to 1,500 K in six hours at periastron. HD 20782 b is at e = 0.95 — the most eccentric known.'},
{b:'Kepler-11 / Kepler-90',c:'arch',r:2.0,m:4.3,a:0.091,P:10.304,e:0.05,obl:0,rot:'lock',S:100,teq:900,teff:5680,note:'Kepler-11 has six transiting planets inside Venus’s orbit. Kepler-90 has eight — the only system matching our own planet count.'},
{b:'Kepler-444 / Kepler-1625 b',c:'arch',r:0.4,m:0.03,a:0.0418,P:3.600,e:0.16,obl:0,rot:'lock',S:20,teq:1000,teff:5046,note:'Kepler-444 is five sub-Earths around an 11.2-Gyr star — planets almost as old as the galaxy. Kepler-1625 b carries a contested exomoon claim.'},
);

/* ---- dark (16) ---- */
WORLDS.push(
{b:'Kepler-16 b',c:'dark',r:8.45,m:105,a:0.7048,P:228.78,e:0.0069,obl:0,rot:20,S:0.03,teq:170,teff:4450,note:'Circumbinary. The two stars orbit each other in 41 days inside the planet’s 229-day year, so the received flux beats rather than varies smoothly.'},
{b:'Kepler-47 c, Kepler-1647 b, TOI-1338 b',c:'dark',r:4.65,m:23,a:0.989,P:303.1,e:0.044,obl:0,rot:20,S:0.9,teq:245,teff:5636,note:'Kepler-47 c sits in a circumbinary habitable zone; Kepler-1647 b is the largest at P = 1,107 d; TOI-1338 b was TESS’s first.'},
{b:'PSO J318.5-22',c:'dark',r:15.7,m:2100,a:0,P:0,e:0,obl:0,rot:5.05,S:0,teq:1160,teff:0,note:'Free-floating, ~23 Myr, no host at all. Variable in brightness from patchy silicate clouds — weather on an object with no star.'},
{b:'WISE 0855-0714',c:'dark',r:11.2,m:1900,a:0,P:0,e:0,obl:0,rot:9,S:0,teq:250,teff:250,note:'The coldest known object of its class at ~250 K, 2.2 pc away, with water-ice clouds. Colder than most of the planets in this table.'},
{b:'SIMP J0136 / CFBDSIR 2149',c:'dark',r:13.0,m:4100,a:0,P:0,e:0,obl:0,rot:2.4,S:0,teq:1100,teff:1100,note:'SIMP J0136 rotates in 2.4 hours with strong variability — cloud bands mapped on a planetary-mass object with no illumination.'},
{b:'OGLE-2016-BLG-1928',c:'dark',r:1.0,m:1.0,a:0,P:0,e:0,obl:0,rot:24,S:0,teq:10,teff:0,note:'A terrestrial-mass free-floater found by microlensing — a single, unrepeatable brightening. It will never be observed again.'},
{b:'MOA-2011-BLG-262L b',c:'dark',r:12.0,m:1200,a:0.9,P:400,e:0.1,obl:0,rot:12,S:0,teq:50,teff:1000,note:'Either a moon of a free-floating giant or a planet of a brown dwarf; the microlensing degeneracy cannot be broken. A genuinely unresolved row.'},
{b:'2M1207 b',c:'dark',r:16.5,m:1590,a:41,P:87000,e:0.1,obl:0,rot:10.7,S:0,teq:1600,teff:2550,note:'The first exoplanet ever directly imaged, 2004, orbiting a 25-Jupiter-mass brown dwarf. Underluminous for its temperature — still argued about.'},
{b:'Luhman 16 AB',c:'dark',r:11.0,m:1000,a:3.5,P:9100,e:0.3,obl:0,rot:5,S:0,teq:1300,teff:1350,note:'The closest brown dwarf binary at 2.0 pc, with surface cloud maps produced from Doppler imaging. Weather on a failed star.'},
{b:'OTS 44',c:'dark',r:14.0,m:3650,a:0,P:0,e:0,obl:0,rot:10,S:0,teq:1700,teff:1700,note:'About 11.5 Jupiter masses, free-floating, and still accreting from its own disk. Planet formation without a star anywhere in the picture.'},
{b:'WD 1856+534 b',c:'dark',r:11.0,m:4000,a:0.0204,P:1.4079,e:0,obl:0,rot:'lock',S:0.18,teq:163,teff:4710,note:'Transits a white dwarf the size of Earth every 34 hours. Survived its host’s red giant phase, or arrived afterwards — both are hard.'},
{b:'WD J0914+1914',c:'dark',r:4.0,m:20,a:0.07,P:10,e:0,obl:0,rot:'lock',S:5,teq:1000,teff:27700,note:'A white dwarf accreting hydrogen, oxygen and sulphur from an evaporating giant planet. The only known case of a planet being eaten in real time.'},
{b:'PSR B1257+12 b, c, d',c:'dark',r:1.5,m:4.3,a:0.36,P:66.54,e:0.0186,obl:0,rot:24,S:0,teq:300,teff:0,note:'The first exoplanets ever confirmed, 1992. Masses 0.02, 4.3 and 3.9 M⊕, heated by relativistic particle wind rather than light.'},
{b:'PSR B1620-26 b',c:'dark',r:12.0,m:795,a:23,P:36500,e:0.45,obl:0,rot:12,S:0,teq:20,teff:0,note:'"Methuselah" — 12.7 Gyr old, in the globular cluster M4, orbiting a pulsar–white dwarf binary. Older than almost anything else known.'},
{b:'PSR J1719-1438 b / KOI-55',c:'dark',r:4.6,m:318,a:0.0044,P:0.0908,e:0,obl:0,rot:'lock',S:0,teq:600,teff:0,note:'A stripped white dwarf core of degenerate carbon at ~23 g/cm³ — the "diamond planet". The KOI-55 pulsation planets are contested.'},
{b:'OGLE-2005-BLG-390L b',c:'dark',r:1.7,m:5.5,a:2.6,P:3500,e:0.1,obl:0,rot:24,S:0.0002,teq:50,teff:3200,note:'A 5.5 M⊕ world at 2.6 AU from an M dwarf — cold enough to be nicknamed Hoth. Found by a single microlensing event in 2005.'},
);

const D = [];
const add = (...xs) => D.push(...xs);

/* ------------------------------------------------ per-world pin items -- */
function fmt(w) {
  const bits = [];
  bits.push(`R = ${w.r} R⊕`);
  bits.push(`M = ${w.m} M⊕`);
  if (w.a) bits.push(`a = ${w.a} AU`);
  if (w.P) bits.push(`P = ${w.P} d`);
  bits.push(`e = ${w.e}`);
  bits.push(w.rot === 'lock' ? 'synchronous rotation' : `rotation ${w.rot} h`);
  if (w.rot !== 'lock') bits.push(`obliquity ${w.obl}°`);
  if (w.S) bits.push(`S = ${w.S} S⊕`);
  bits.push(`T ≈ ${w.teq} K`);
  if (w.teff) bits.push(`host ${w.teff} K`);
  return bits.join(' · ');
}
for (const w of WORLDS) {
  add({
    c: w.c,
    t: `Pin ${w.b} to measured parameters`,
    d: `${fmt(w)}. ${w.note}`,
    k: 'DATA', e: 'S', i: 3, n: ['record'],
  });
}

/* ------------------------------------------------------------- schema -- */
add(
{c:'schema',t:'Define what a world is, as a record',g:'record',d:'One flat object per body with radius, mass, semi-major axis, period, eccentricity, inclination, obliquity, rotation period, insolation, equilibrium temperature, host parameters, and a provenance block. Everything else in this document is downstream of this existing.',k:'ENG',e:'M',i:3},
{c:'schema',t:'Separate measured from derived from assumed',g:'tier',n:['record'],d:'Three tiers on every field. Radius from a transit is measured; density is derived; obliquity on a world nobody has measured is assumed. Conflating them is how a model quietly starts asserting things nobody knows.',k:'ENG',e:'S',i:3},
{c:'schema',t:'Every value carries a unit',n:['record'],d:'`rule.solar` is dimensionless, `rule.freeze` is a temperature in a 0–1 scale, `rule.relief` is unitless. Storing SI or a named astronomical unit on every field means the panels can convert rather than guess.',k:'ENG',e:'S',i:3},
{c:'schema',t:'Asymmetric error bars',n:['record'],d:'The archive reports `pl_rade`, `pl_radeerr1` and `pl_radeerr2`, and they are rarely equal. A single ± throws away the shape of the constraint, which for masses near the detection limit is most of the information.',k:'ENG',e:'S',i:3},
{c:'schema',t:'Upper and lower limits as a distinct state',n:['record'],d:'"M < 3 M⊕" is not a mass. A limit flag is what stops the model from treating a non-detection as a measurement — which is the single most common way exoplanet numbers get misused.',k:'ENG',e:'S',i:3},
{c:'schema',t:'Minimum mass is not mass',n:['record'],d:'Radial velocity gives M sin i. For the temperate category, which is mostly RV, roughly a quarter of the entries are systematically underestimated by an unknown factor. Store it as `msini` with the inclination unknown rather than as `m`.',k:'ENG',e:'S',i:3},
{c:'schema',t:'A stable identifier per body',n:['record'],d:'`item.b` is a display string, and several rows hold three bodies — "Rhea / Dione / Tethys / Hyperion". A canonical key per physical object is what lets data, rulesets, saves and instruments refer to the same thing.',k:'ENG',e:'S',i:3},
{c:'schema',t:'Split the multi-body rows',n:['record'],d:'Fourteen catalogue rows bundle two to four distinct worlds because they were written as backlog items. As data they have to be separate records, even if the interface still groups them.',k:'DATA',e:'M',i:3},
{c:'schema',t:'A system record above the planet record',g:'system',n:['record'],d:'Host star, all planets, mutual resonances, debris disks, binarity. TRAPPIST-1 and Kepler-90 are interesting as systems, and there is nowhere to put that today.',k:'ENG',e:'M',i:3},
{c:'schema',t:'Model the host star separately from the planet',n:['system'],d:'Seven TRAPPIST-1 rows currently each carry their own implied host. One star record referenced by seven planets is both correct and the only way a change to the star propagates.',k:'ENG',e:'S',i:3},
{c:'schema',t:'Composition as a vector, not a template',n:['record'],d:'Iron fraction, silicate fraction, water fraction, H/He envelope mass fraction. `templateFor()` picks one of five hand-authored rulesets; a composition vector is what lets a world be 91% iron like GJ 367 b without a new template.',k:'ENG',e:'M',i:3},
{c:'schema',t:'Atmosphere as a record with a pressure',n:['record'],d:'`rule.gases` is a set of mixing ratios with no total pressure anywhere. Venus at 92 bar and Mars at 6 mbar have similar CO₂ fractions and nothing else in common.',k:'ENG',e:'M',i:3},
{c:'schema',t:'Albedo as data',n:['record'],d:'Bond albedo drives equilibrium temperature and geometric albedo drives what the planet looks like. Earth is 0.306 Bond, Venus 0.76, TrES-2 b under 0.01. Neither number exists in the model.',k:'ENG',e:'S',i:3},
{c:'schema',t:'Age, with its own uncertainty',n:['record'],d:'V1298 Tau is 23 Myr and Kepler-444 is 11.2 Gyr — a factor of 500. Age drives radius inflation, XUV dose, interior heat and whether a planet has finished contracting.',k:'ENG',e:'S',i:3},
{c:'schema',t:'Distance and apparent brightness',n:['record'],d:'Not physics, but it decides what is observable. Kepler-186 f at 179 pc will never get a spectrum; Gliese 12 b at 12 pc will. The instrument category needs this to be honest about what the player can measure.',k:'ENG',e:'S',i:2},
{c:'schema',t:'Discovery method and year',n:['record'],d:'Transit, radial velocity, imaging, microlensing, timing. Method determines which parameters exist at all, which is why the schema has to tolerate sparse rows — and it is a good filter in the catalogue browser.',k:'DATA',e:'S',i:2},
{c:'schema',t:'A confidence flag on the detection itself',n:['tier'],d:'Confirmed, candidate, contested, retracted. Kapteyn b was retracted; tau Ceti f is disputed; KOI-55 may be an artefact. A catalogue that shows them identically to TRAPPIST-1 e is misleading by omission.',k:'DATA',e:'S',i:3},
{c:'schema',t:'Keep the backlog text alongside the data',n:['record'],d:'The existing `t` and `d` fields are genuinely good writing about why each world matters. The data layer should sit beside them, not replace them — the catalogue browser wants both.',k:'ENG',e:'S',i:3},
{c:'schema',t:'Version the schema',n:['record'],d:'Saves, shelf entries and shared seed strings will all reference world records. A schema version field now costs nothing and prevents every one of them from silently breaking on the first field rename.',k:'ENG',e:'S',i:3},
{c:'schema',t:'A JSON Schema and a validator',n:['record'],d:'Generated from the record definition and run in CI. With 120 bodies and thirty-odd fields, hand-checking stops working at about the second edit.',k:'ENG',e:'S',i:2},
{c:'schema',t:'Make the record the single source for rulesets',n:['record'],d:'`RULESETS` holds five hand-authored worlds and `catalogue-rules.js` bends them into 120. Inverting that — the record is authoritative, the ruleset is generated — is the structural change this whole document argues for.',k:'ENG',e:'L',i:3},
{c:'schema',t:'Keep the five invented worlds as invented',n:['record'],d:'Terra, Vermis, Selene, Ares and Daisyworld are good design objects and should not be forced into the real-data schema. Flag them as synthetic, exempt them from validation, and stop using them as templates for real bodies.',k:'ENG',e:'S',i:3},
);

/* ----------------------------------------------------------- pipeline -- */
add(
{c:'pipeline',t:'Actually run the archive query',g:'fetch',n:['record'],d:'The README documents a `pscomppars` TAP query and nothing consumes it. A build step that fetches, caches and commits the result — with the query date recorded — is the difference between a catalogue that is current and one that was.',k:'ENG',e:'M',i:3},
{c:'pipeline',t:'Pull the columns that matter',n:['fetch'],d:'`pl_rade`, `pl_bmasse`, `pl_orbsmax`, `pl_orbper`, `pl_orbeccen`, `pl_insol`, `pl_eqt`, `pl_bmassprov`, `st_teff`, `st_rad`, `st_mass`, `st_age`, `sy_dist`, plus the error columns for each. That list is most of the schema.',k:'ENG',e:'S',i:3},
{c:'pipeline',t:'Note that `pl_bmassprov` tells you what the mass is',n:['fetch'],d:'The archive says whether a mass is a true mass, an M sin i, or a mass–radius estimate. Ignoring that column is exactly how minimum masses get published as masses.',k:'ENG',e:'S',i:3},
{c:'pipeline',t:'Solar System bodies come from a different source',n:['fetch'],d:'The exoplanet archive does not contain Earth. JPL’s planetary fact sheets and the SSD ephemerides cover the twelve `sol` rows and the fifteen moons, at far higher precision than anything else in the table.',k:'DATA',e:'S',i:3},
{c:'pipeline',t:'Moons need their own source entirely',n:['fetch'],d:'Fifteen bodies whose defining parameters are orbital radius about a planet, tidal heating rate and ice-shell thickness. None of it is in any exoplanet archive and most of it comes from individual mission papers.',k:'DATA',e:'M',i:3},
{c:'pipeline',t:'Pin a snapshot rather than fetching at runtime',n:['fetch'],d:'A committed data file with a query date is reproducible; a live fetch means two players see different planets and the golden-run test fails for reasons nobody can reconstruct.',k:'ENG',e:'S',i:3},
{c:'pipeline',t:'Diff the snapshot when it is refreshed',n:['fetch'],d:'Published parameters move — masses get revised, planets get retracted. A refresh that prints what changed is how you find out that the world you calibrated against is now a different world.',k:'ENG',e:'S',i:3},
{c:'pipeline',t:'Reconcile the archive against the hand table',n:['fetch'],d:'The `WORLDS` table in this generator is a hand-assembled seed. Where it and the archive disagree, one of them is wrong, and finding out which is a genuinely useful afternoon.',k:'DATA',e:'M',i:3},
{c:'pipeline',t:'Keep a per-field override file',n:['fetch'],d:'Some values are better than the archive default — a newer paper, a better analysis, a Solar System body the archive does not carry. Overrides in a separate file, each with a citation, keeps the fetch reproducible.',k:'ENG',e:'S',i:3},
{c:'pipeline',t:'Generate the catalogue module from the data',n:['fetch'],d:'`vr/catalogue.js` is already generated from `scripts/worlds.mjs`. Extending that emitter to carry parameters means the in-game catalogue and the backlog stay one artefact, which is the convention the repo already runs on.',k:'ENG',e:'M',i:3},
{c:'pipeline',t:'Do not ship 97 KB of parameters on the critical path',n:['fetch'],d:'`catalogue.js` is already parsed before the first frame. Parameters roughly double it. Split the data behind the Worlds panel and load it on demand.',k:'ENG',e:'S',i:3},
{c:'pipeline',t:'A compact binary or column-store form',n:['fetch'],d:'120 bodies × 40 numeric fields is small, but the JSON-in-JS representation is not. Typed arrays with a header would be a fraction of the size and parse instantly.',k:'ENG',e:'S',i:1},
{c:'pipeline',t:'Record the reference for every non-archive value',n:['fetch'],d:'Every number in the `WORLDS` seed table above came from somewhere. Without the citation, the next person cannot check it and the value is unmaintainable.',k:'DATA',e:'M',i:3},
{c:'pipeline',t:'Handle name changes and aliases',n:['fetch'],d:'KIC 12557548 is Kepler-1520. K2-141 has an EPIC number. Gliese, GJ and Wolf catalogues overlap. An alias table is what stops the same world appearing twice.',k:'DATA',e:'S',i:2},
{c:'pipeline',t:'Decide the default parameter set per planet',n:['fetch'],d:'The archive holds multiple published solutions per planet and `pscomppars` picks one. Recording which reference was used, and allowing a different one, is the difference between a value and a choice.',k:'ENG',e:'S',i:2},
{c:'pipeline',t:'A coverage report',n:['fetch'],d:'For each of the 120: which fields are measured, which are derived, which are missing. It is the document that tells you where the work actually is, and it can be generated.',k:'ENG',e:'S',i:3},
{c:'pipeline',t:'Fail loudly on a missing required field',n:['fetch'],d:'A world with no radius should not silently become a 1 R⊕ world. Either it is excluded, or it is flagged in the interface, and the pipeline decides which — not a default parameter deep in `sanitize()`.',k:'ENG',e:'S',i:3},
{c:'pipeline',t:'Expand the catalogue beyond 120',n:['fetch'],d:'The archive holds nearly 6,000 confirmed planets. Once worlds are data rather than hand-written branches, the limit becomes taste rather than effort — and a filtered "all confirmed rocky planets" view becomes possible.',k:'ENG',e:'M',i:2},
{c:'pipeline',t:'Let the player load their own table',n:['fetch'],d:'A CSV drop that adds worlds. It is a small feature for a project that is partly a teaching instrument, and it makes the model usable for somebody else’s research question.',k:'ENG',e:'M',i:2},
{c:'pipeline',t:'Cite the archive properly',n:['fetch'],d:'The NASA Exoplanet Archive has a required acknowledgement. If the data is going to be shipped, the citation ships with it.',k:'DATA',e:'S',i:3},
{c:'pipeline',t:'A refresh cadence, written down',n:['fetch'],d:'Quarterly, or on demand, or never — but decided and stated. A catalogue that claims to be real and is four years stale is worse than one that says when it was taken.',k:'DATA',e:'S',i:2},
{c:'pipeline',t:'Keep the pipeline runnable offline',n:['fetch'],d:'The committed snapshot must be enough to build, test and play without a network. Everything else in the repo already works this way.',k:'ENG',e:'S',i:3},
);

/* --------------------------------------------------------------- star -- */
add(
{c:'star',t:'Fix the TRAPPIST typo',n:['record'],d:'`starFromCatalogueItem` tests `/trapist|proxima|gj |gliese/`. One character, and it means the name branch never fires for the most important system in the catalogue. Fix it, then delete the whole regex when stars become data.',k:'ENG',e:'S',i:3},
{c:'star',t:'Give every system a real host record',g:'host',n:['record'],d:'Effective temperature, radius, mass, luminosity, age, metallicity, distance and activity level. Six of those are in `pscomppars` for almost every row, and everything in this category derives from them.',k:'DATA',e:'M',i:3},
{c:'star',t:'Luminosity from radius and temperature',n:['host'],d:'L = 4πR²σT⁴. `makeStar` already does this as a fallback when `lum` is absent, which is correct — the fix is to stop letting the caller pass a made-up `lum` at all.',k:'ENG',e:'S',i:3},
{c:'star',t:'Insolation from L★ and a',g:'insol',n:['host'],d:'S = L★ / a². It is one line and it replaces every hand-typed `rule.solar` in `applyNeeds()`. The catalogue’s own `pl_insol` column is exactly this quantity, so it is also directly checkable.',k:'ENG',e:'S',i:3},
{c:'star',t:'Span seven orders of magnitude of insolation',n:['insol'],d:'TRAPPIST-1 h receives S = 0.144; KELT-9 b receives about 44,000. `applyStarToRule` clamps `rule.solar` to 8. The clamp is a playability decision that currently erases the entire furnace and giant categories.',k:'ENG',e:'M',i:3},
{c:'star',t:'Stellar spectrum, not just a temperature',n:['host'],d:'`skyFromTeff` interpolates two RGB channels off a linear ramp. A blackbody at the host temperature, convolved with the atmosphere, gives sky colour, surface illumination and photon flux in one calculation rather than three approximations.',k:'ENG',e:'M',i:3},
{c:'star',t:'Photon flux in the photosynthetic band, computed',n:['host'],d:'`photonUsableFraction` is a six-branch lookup on temperature. Integrating the Planck function from 400 to 750 nm is exact, cheap, and makes the M-dwarf photosynthesis question quantitative instead of tabulated.',k:'ENG',e:'S',i:3},
{c:'star',t:'Angular size of the host',n:['host'],d:'`starAngularDeg` already does the trigonometry. From TRAPPIST-1 e the star is about 2° across — four Suns wide and dull red; from WD 1856+534 b it is a white pinprick. It is the most immediately convincing thing a player can be shown.',k:'UI',e:'S',i:3},
{c:'star',t:'Spectral class as a derived label',n:['host'],d:'O B A F G K M L T Y from temperature, with the subclass. It is the vocabulary everyone uses and the catalogue can compute it rather than store it.',k:'ENG',e:'S',i:2},
{c:'star',t:'Main-sequence brightening over the run',n:['host'],d:'The Sun was about 70% as bright at 4 Ga and brightens roughly 1% per 110 Myr. `time.js` has `faintYoungSun`; wiring it to a real stellar mass makes the curve different for every host instead of Earth’s.',k:'ENG',e:'M',i:3},
{c:'star',t:'Stellar lifetime from mass',n:['host'],d:'Roughly M^-2.5 in main-sequence lifetime, so an M8 lasts trillions of years and KELT-9’s A0 host has a few hundred million. It sets how much time a biosphere could possibly have had.',k:'ENG',e:'S',i:3},
{c:'star',t:'Age from the archive, with its error',n:['host'],d:'`st_age` is present for many rows and is often uncertain by a factor of two. It drives XUV dose, radius inflation and whether a giant is still contracting — and for the `arch` category it is the defining parameter.',k:'DATA',e:'S',i:3},
{c:'star',t:'Activity and flare rate from age and rotation',n:['host'],d:'`makeStar` sets `flareRate` from three temperature thresholds. Real activity tracks rotation, which tracks age through gyrochronology — which is why Proxima flares hard and Ross 128, at a similar temperature, does not.',k:'ENG',e:'M',i:3},
{c:'star',t:'Integrated XUV dose over the system’s life',g:'xuv',n:['host'],d:'M dwarfs stay in a saturated high-energy phase for several hundred Myr — long enough to strip an Earth atmosphere many times over. Integrating the dose is what turns "does this world have air" from a tag into an outcome.',k:'ENG',e:'M',i:3},
{c:'star',t:'Metallicity',n:['host'],d:'`st_met` correlates strongly with giant-planet occurrence and sets the available condensible inventory. It is also the parameter that makes Kepler-444, at very low metallicity with five sub-Earths, interesting.',k:'DATA',e:'S',i:2},
{c:'star',t:'Binaries as two stars',n:['system'],d:'Kepler-16, Kepler-47, Kepler-1647, TOI-1338, Luhman 16 and Proxima’s membership of α Cen. Two insolation terms, two shadows, and a habitable zone that is an annulus rather than a band.',k:'ENG',e:'M',i:3},
{c:'star',t:'The circumbinary flux beat',n:['system'],d:'On Kepler-16 b the stars orbit each other in 41 days inside the planet’s 229-day year, so the received flux beats. It is a genuinely different forcing signal and the climate model can express it today.',k:'ENG',e:'M',i:2},
{c:'star',t:'Brown dwarf hosts emit almost nothing visible',n:['host'],d:'2M1207 b orbits a 25-Jupiter-mass primary cooler than a campfire. Luhman 16 is at 1,350 K. A world lit only in the infrared needs a different albedo treatment and a biosphere that cannot use light.',k:'ENG',e:'M',i:3},
{c:'star',t:'White dwarf hosts on a cooling track',n:['host'],d:'WD 1856+534 is Earth-sized and fading. The habitable zone is at a few hundredths of an AU and moves inward over gigayears, so habitability is a window that closes.',k:'ENG',e:'M',i:2},
{c:'star',t:'Pulsar hosts heat by particles, not photons',n:['host'],d:'The PSR B1257+12 planets receive relativistic particle wind and X-rays. Albedo is meaningless and the energy budget needs its own path through the atmosphere tick — `makeStar({teff: 1e6})` is a placeholder standing where the physics should be.',k:'ENG',e:'M',i:2},
{c:'star',t:'No star at all',n:['host'],d:'PSO J318.5-22, WISE 0855, OTS 44 and the microlensing free-floaters have zero external flux. Setting insolation to zero and seeing whether the climate model still does something is the cleanest test that it is physics.',k:'ENG',e:'M',i:3},
{c:'star',t:'Starspots contaminate the spectrum',n:['host'],d:'GJ 486 b’s JWST result is ambiguous between a water atmosphere and unocculted spots. Modelling spot coverage and letting it corrupt the transit-spectrum instrument makes the player earn the distinction — and teaches the single biggest caveat in the field.',k:'ENG',e:'M',i:3},
{c:'star',t:'Habitable zone boundaries from the host',n:['insol'],d:'The runaway-greenhouse inner edge and the maximum-greenhouse outer edge both scale with stellar temperature, not just luminosity. Drawing them per system is what makes "in the habitable zone" a computed claim.',k:'ENG',e:'M',i:3},
{c:'star',t:'Draw the habitable zone in the orrery',n:['insol'],d:'An annulus around the host with every planet plotted in it. One image per system that says more than any amount of table.',k:'UI',e:'S',i:3},
{c:'star',t:'Distance decides what is observable',n:['host'],d:'Kepler-186 f is at 179 pc and will never be characterised; Gliese 12 b is at 12 pc and will. Sorting the catalogue by what is actually reachable is a more useful view than sorting by radius.',k:'UI',e:'S',i:2},
{c:'star',t:'Delete `skyFromTeff` when the spectrum lands',n:['host'],d:'It is a two-line approximation that has done its job. Leaving it beside a real spectral model is how a codebase acquires two answers to the same question.',k:'ENG',e:'S',i:2},
);

/* -------------------------------------------------------------- orbit -- */
add(
{c:'orbit',t:'Store the orbital elements',g:'elements',n:['record'],d:'Semi-major axis, period, eccentricity, inclination, argument of periastron, longitude of ascending node, epoch. `pl_orbsmax`, `pl_orbper` and `pl_orbeccen` cover the three that matter most and are present for most rows.',k:'DATA',e:'S',i:3},
{c:'orbit',t:'Derive period from a and the stellar mass',n:['elements'],d:'Kepler’s third law closes the loop: given two of a, P and M★ the third is determined. It is a free consistency check on every row in the table and it will find errors.',k:'ENG',e:'S',i:3},
{c:'orbit',t:'Eccentricity that varies insolation through the year',n:['elements'],d:'`rule.eccentricity` feeds `W._solarMod = 1 + e * cos(season)`. At e = 0.93 on HD 80606 b that is not a modulation, it is a different planet twice per orbit — and the current formula goes negative above e = 1.',k:'ENG',e:'M',i:3},
{c:'orbit',t:'Rotation period as a signed real number',n:['elements'],d:'`applyNeeds` sets `rotationPeriod = -243` for anything tagged `retro`. Venus is -243.02 days; Triton orbits retrograde but rotates synchronously; Uranus rotates retrograde at -17.24 hours. Three different facts currently collapsed into one tag.',k:'ENG',e:'S',i:3},
{c:'orbit',t:'Tidal locking as a computed timescale',g:'lock',n:['elements'],d:'The locking time scales roughly as a⁶, so it is fast where it happens at all. `applyNeeds` sets `rotationPeriod = max(abs(rotationPeriod), 40)` for the `lock` tag. Computing it means a world can lock during a run.',k:'ENG',e:'M',i:3},
{c:'orbit',t:'Spin–orbit resonances other than 1:1',n:['lock'],d:'Mercury sits in a 3:2 resonance because its orbit is eccentric, giving a solar day of 176 Earth days — twice its year. Assuming synchronous rotation everywhere gets Mercury exactly wrong.',k:'ENG',e:'M',i:2},
{c:'orbit',t:'A solar day distinct from a sidereal day',n:['elements'],d:'Venus rotates in 243 days and has a solar day of 117. The distinction is what the diurnal cycle actually runs on, and no part of the model currently makes it.',k:'ENG',e:'S',i:3},
{c:'orbit',t:'Obliquity as data where it is known and as unknown where it is not',n:['elements','tier'],d:'Uranus is 97.77°, Venus 177.4°, Pluto 122.5°. For every exoplanet in the catalogue it is unmeasured. `applyNeeds` sets 98° for the `obliq` tag and 0 for locked worlds; both should be flagged as assumptions.',k:'DATA',e:'S',i:3},
{c:'orbit',t:'Obliquity stability without a large moon',n:['elements'],d:'Mars’s axis has varied chaotically between roughly 15° and 45°; Earth’s is held near 23° by the Moon. `setMoon` already toggles `obliquityWander`, and this is the parameter that should decide it.',k:'ENG',e:'M',i:3},
{c:'orbit',t:'The substellar point on a locked world',n:['lock'],d:'A permanent day side, a permanent night side and a terminator ring. Twenty-nine temperate rows are almost all locked, and it is their single most important shared property.',k:'ENG',e:'M',i:3},
{c:'orbit',t:'Libration on an eccentric locked orbit',n:['lock'],d:'A synchronous body on an eccentric orbit rocks, so the substellar point moves and the terminator sweeps. On a planet where the terminator is the habitable strip, that motion matters.',k:'ENG',e:'M',i:2},
{c:'orbit',t:'Tidal heating from eccentricity and forced eccentricity',g:'tideheat',n:['elements'],d:'Io radiates of order 10¹⁴ W because the Laplace resonance keeps its orbit eccentric. LP 791-18 d is forced by a neighbour. `R.tidalHeat` is a per-ruleset constant where a computed quantity belongs.',k:'ENG',e:'M',i:3},
{c:'orbit',t:'Mean-motion resonances as system structure',n:['system'],d:'TRAPPIST-1’s seven planets form a near-resonant chain — 8:5, 5:3, 3:2, 3:2, 4:3, 3:2. It is why transit-timing variations give masses to a few per cent, and it is a fact about the system rather than any planet.',k:'DATA',e:'M',i:3},
{c:'orbit',t:'Transit-timing variations as a mass source',n:['system'],d:'For TRAPPIST-1 and Kepler-11 the masses come from planets tugging each other, not from radial velocity. Recording the provenance matters because TTV masses have different systematics.',k:'DATA',e:'S',i:2},
{c:'orbit',t:'Orbital decay for the short-period giants',n:['elements'],d:'WASP-12 b’s period is shortening measurably — of order 29 milliseconds per year — and TOI-2109 b likewise. These worlds have a computable remaining lifetime, which is a striking thing to show.',k:'ENG',e:'M',i:2},
{c:'orbit',t:'The Roche limit as a hard constraint',n:['elements'],d:'K2-137 b at a 4.3-hour period is close to it; Phobos is inside its own. It is the floor on orbital distance, the origin of ring systems, and something the genesis toolkit should enforce rather than clamp.',k:'ENG',e:'S',i:2},
{c:'orbit',t:'Extreme eccentricity as a climate driver',n:['elements'],d:'HD 20782 b at e = 0.95, HD 80606 b at 0.93, Kepler-1704 b at 0.92. Insolation varies by a factor of hundreds over one orbit and the atmosphere cannot equilibrate — a regime the model has never been asked to represent.',k:'ENG',e:'M',i:3},
{c:'orbit',t:'Misaligned and retrograde orbits',n:['elements'],d:'WASP-17 b orbits backwards, WASP-33 b nearly polar, HAT-P-11 b nearly polar. Spin–orbit misalignment is the evidence that hot Jupiters arrived by scattering rather than by disk migration.',k:'DATA',e:'S',i:2},
{c:'orbit',t:'Circumbinary orbits are not Keplerian',n:['system'],d:'A planet around two stars sees a time-varying potential and there is a critical radius inside which no stable orbit exists. Kepler-16 b sits just outside it.',k:'ENG',e:'M',i:2},
{c:'orbit',t:'Moons need a planetocentric orbit',n:['elements'],d:'Fifteen moon rows have a semi-major axis about their planet, not about the Sun. The schema needs a parent body and both orbits, or Io ends up at 5.2 AU with no context.',k:'ENG',e:'S',i:3},
{c:'orbit',t:'Wide-orbit imaged planets have periods in millennia',n:['elements'],d:'HD 106906 b at 738 AU, HIP 65426 b at 92 AU, HR 8799 e at 16 AU. Orbits of thousands to hundreds of thousands of years — deep time in the orrery has a very different meaning for these.',k:'DATA',e:'S',i:2},
{c:'orbit',t:'Free-floaters have no orbit at all',n:['elements'],d:'Six rows in the `dark` category. The schema must tolerate a null orbit rather than defaulting to 1 AU, and the orrery view needs somewhere to put them.',k:'ENG',e:'S',i:3},
{c:'orbit',t:'Precession over deep time',n:['elements'],d:'Milankovitch forcing needs eccentricity, obliquity and precession all varying on their own periods. The atmosphere already has a `season` phase; the orbital elements are what should be driving it.',k:'ENG',e:'M',i:2},
{c:'orbit',t:'Show the orbit, to scale, in the panel',n:['elements'],d:'An ellipse with the star at a focus, the habitable zone shaded, and the planet on it. For the eccentric worlds it explains the entire climate in one picture.',k:'UI',e:'S',i:3},
{c:'orbit',t:'Report the year in days and in Earth years',n:['elements'],d:'TRAPPIST-1 e’s year is 6.1 days. Kepler-1647 b’s is 1,107. Presenting both, with the sidereal day alongside, is how a player understands what a "day" and a "year" mean on a given world.',k:'UI',e:'S',i:3},
{c:'orbit',t:'Sanity-check every orbit against stability',n:['system'],d:'Multi-planet systems in the table should not have crossing orbits or Hill-radius violations. It is a cheap automated check that would catch data-entry errors immediately.',k:'ENG',e:'S',i:2},
{c:'orbit',t:'Derive the tidal force on the planet',n:['elements'],d:'The tidal machinery in `tides.js` needs a real parent mass and distance. For the moons that is the whole story; for the locked temperate worlds it is why they are locked.',k:'ENG',e:'M',i:3},
{c:'orbit',t:'Retire the `lock`, `retro` and `ecc` tags',n:['lock','elements'],d:'They are stand-ins for numbers. Once the elements exist, the tags become derived labels for the interface — and keeping both would give the model two sources of truth.',k:'ENG',e:'S',i:3},
);

/* --------------------------------------------------------------- bulk -- */
add(
{c:'bulk',t:'Radius and mass as the two anchor quantities',g:'rm',n:['record'],d:'`pl_rade` and `pl_bmasse` are the most commonly measured columns in the archive and neither exists in the model. Everything in this category is one arithmetic step from them.',k:'DATA',e:'S',i:3},
{c:'bulk',t:'Surface gravity from mass and radius',g:'grav',n:['rm'],d:'g = GM/R². `sanitize()` clamps an authored `rule.gravity` to 0.05–3. Deriving it means GJ 367 b at 0.72 R⊕ and 0.63 M⊕ gets its real 1.2 g rather than a typed guess.',k:'ENG',e:'S',i:3},
{c:'bulk',t:'Bulk density, and what it rules out',n:['rm'],d:'ρ = 3M/4πR³. GJ 367 b at ~10.2 g/cm³ is mostly iron; WASP-127 b at ~0.09 is mostly nothing. Density is the single most informative derived number in the whole table.',k:'ENG',e:'S',i:3},
{c:'bulk',t:'Escape velocity',g:'escape',n:['grav'],d:'v = √(2GM/R). Together with exospheric temperature it decides which gases a world can hold, which is the physical replacement for tagging worlds `airless`.',k:'ENG',e:'S',i:3},
{c:'bulk',t:'Mass–radius relations for the missing half',n:['rm','gap'],d:'Transits give radius without mass; radial velocity gives mass without radius. A published mass–radius relation fills the gap for display — flagged as derived, never as measured.',k:'ENG',e:'M',i:3},
{c:'bulk',t:'Composition from position in mass–radius space',n:['rm'],d:'Curves for pure iron, rock, water and H/He envelopes bracket what a planet can be. Where a world sits between them is the closest thing to knowing what it is made of.',k:'ENG',e:'M',i:3},
{c:'bulk',t:'The radius valley',n:['rm'],d:'A deficit of planets near 1.8 R⊕, separating rocky super-Earths from gas-enveloped sub-Neptunes, and the strongest evidence that photoevaporation shapes populations. TOI-715 b sits right in it.',k:'ENG',e:'M',i:3},
{c:'bulk',t:'Derive interior structure from density, not from a name',n:['rm'],d:'`interiorProfileFor()` regexes the body name against eleven profiles then falls back to `0.12 + gravity * 0.12`. Core mass fraction follows from bulk density against a composition model — the same arithmetic for every world.',k:'ENG',e:'M',i:3},
{c:'bulk',t:'Iron-rich worlds are a real population',n:['rm'],d:'Mercury at ~85% core radius and GJ 367 b at roughly 91% iron by mass. Whether they are collision remnants or formed that way is open, and both are playable.',k:'DATA',e:'S',i:2},
{c:'bulk',t:'Water worlds as a composition, not a template',n:['rm'],d:'LHS 1140 b, GJ 9827 d and K2-18 b all sit where a substantial water fraction is the natural reading. `rule.totalWater` is authored per world; it should follow from the mass–radius position.',k:'ENG',e:'M',i:3},
{c:'bulk',t:'High-pressure ice phases',n:['rm'],d:'On a deep water world the ocean floor is ice VI or VII, not rock, which cuts the ocean off from silicate weathering and from hydrothermal chemistry. It is the argument against water worlds being habitable.',k:'ENG',e:'M',i:2},
{c:'bulk',t:'H/He envelope mass fraction',n:['rm'],d:'A few per cent of the mass in hydrogen doubles the radius. It is why GJ 1214 b at 8.2 M⊕ is 2.7 R⊕ and Kepler-10 b at 3.3 M⊕ is 1.5 R⊕.',k:'ENG',e:'M',i:3},
{c:'bulk',t:'Radius inflation on young and hot giants',n:['rm'],d:'V1298 Tau’s planets are inflated because they are 23 Myr old and still contracting; the hot Jupiters are inflated for reasons still argued about. Radius is a function of age and irradiation, not a constant.',k:'ENG',e:'M',i:2},
{c:'bulk',t:'Core mass fraction sets the dynamo',n:['rm'],d:'`core.js` already links `coreMassFrac` and `conductivity` to a magnetosphere. Deriving the core from density rather than from a name makes the magnetic field a consequence for all 120 bodies.',k:'ENG',e:'M',i:3},
{c:'bulk',t:'Magnetic field, and whether it protects anything',n:['grav','xuv'],d:'A dynamo needs a liquid conducting core and enough rotation. Venus has neither, Ganymede has one, Mars lost its. It is one of the two things standing between an atmosphere and the stellar wind.',k:'ENG',e:'M',i:3},
{c:'bulk',t:'Moment of inertia as a structure constraint',n:['rm'],d:'For the Solar System bodies it is measured, and it pins the internal distribution far better than density alone. Mimas’s libration is why it may have an ocean.',k:'DATA',e:'S',i:1},
{c:'bulk',t:'Relief limited by gravity and rock strength',n:['grav'],d:'`rule.relief` is authored and clamped to 0.005–0.15. Olympus Mons reaches 22 km partly because Mars pulls at 0.38 g. Deriving the ceiling makes low-gravity worlds visibly different.',k:'ENG',e:'M',i:3},
{c:'bulk',t:'Non-hydrostatic bodies',n:['rm'],d:'Arrokoth, Bennu, 67P, Phobos, Hyperion. Below roughly 400 km these are not spheres, and the cube-sphere heightfield cannot represent their shape at all. Say so rather than rendering a ball.',k:'ENG',e:'M',i:2},
{c:'bulk',t:'Tidal deformation of the shape',n:['tideheat'],d:'Close-in giants are measurably ellipsoidal, and WASP-121 b nearly fills its Roche lobe. It is a visible, computable distortion for the most extreme rows.',k:'ENG',e:'M',i:1},
{c:'bulk',t:'Brown dwarfs are radius-degenerate',n:['rm'],d:'From about 1 to 80 Jupiter masses the radius barely changes, because electron degeneracy takes over. KELT-1 b at 27 M_J is the same size as a Jupiter — which is why mass, not radius, defines the boundary.',k:'DATA',e:'S',i:2},
{c:'bulk',t:'Where "planet" stops',n:['rm'],d:'Deuterium burning near 13 M_J, hydrogen burning near 80. KELT-1 b, 2M1207 b, OTS 44 and Luhman 16 sit on or over the line. The catalogue should show where each falls rather than quietly calling them all planets.',k:'DATA',e:'S',i:2},
{c:'bulk',t:'Scale height from gravity and temperature',n:['grav'],d:'H = kT/μg. It sets how big a transmission signal is, which is why hot low-gravity puffballs like WASP-127 b are the best spectroscopy targets in the catalogue.',k:'ENG',e:'S',i:3},
{c:'bulk',t:'Report density against a reference',n:['rm'],d:'"5.51 g/cm³ — Earth-like rock" or "0.09 — mostly envelope". A number with an interpretation beside it is what makes the panel teach rather than display.',k:'UI',e:'S',i:3},
{c:'bulk',t:'Plot the catalogue in mass–radius space',n:['rm'],d:'Every world as a point, with the composition curves drawn and the radius valley visible. It is the single most informative chart in exoplanet science and the data would already be there.',k:'UI',e:'M',i:3},
{c:'bulk',t:'Let gravity be felt at the Local tier',n:['grav'],d:'Jump height, fall speed, the angle of repose on a slope. The player standing on a 0.38 g world should notice before reading a number.',k:'UI',e:'M',i:2},
{c:'bulk',t:'Delete the authored gravity field',n:['grav'],d:'Once it derives from mass and radius, keeping `rule.gravity` as an override is how the two silently disagree. Make it read-only and computed.',k:'ENG',e:'S',i:3},
);

/* ---------------------------------------------------------------- air -- */
add(
{c:'air',t:'Decide whether there is an atmosphere at all',g:'retain',n:['escape','xuv'],d:'Jeans escape against exospheric temperature, plus integrated XUV-driven hydrodynamic loss over the system’s age. `applyNeeds` sets `rule.airless = true` when the name contains "mercury". This is the physical version.',k:'ENG',e:'M',i:3},
{c:'air',t:'The cosmic shoreline',n:['retain'],d:'Plotting escape velocity against insolation separates the worlds with atmospheres from those without, remarkably cleanly. It is an empirical relation the catalogue could reproduce and be checked against.',k:'ENG',e:'M',i:3},
{c:'air',t:'Surface pressure as a real quantity',g:'press',n:['record'],d:'Venus 92 bar, Earth 1, Mars 0.0064, Titan 1.5, Pluto ~10⁻⁵. `totalPressure()` sums mixing ratios, which is not a pressure. Nearly every atmospheric behaviour in the model keys off this number.',k:'ENG',e:'M',i:3},
{c:'air',t:'Mixing ratios and total pressure are different things',n:['press'],d:'Venus and Mars are both ~95% CO₂ and differ by four orders of magnitude in column mass. `rule.gases` conflates them, which is why the greenhouse term cannot span both.',k:'ENG',e:'S',i:3},
{c:'air',t:'Mean molecular weight',n:['press'],d:'2 for hydrogen, 28 for nitrogen, 44 for CO₂. It sets scale height, escape rate and the size of a transmission signal — the reason a hydrogen atmosphere is easy to detect and a nitrogen one is not.',k:'ENG',e:'S',i:3},
{c:'air',t:'Greenhouse forcing that works at 92 bar',n:['press'],d:'`greenhouseFromGases` is `0.04·log1p(CO₂·40) + 0.08·log1p(CH₄·80) + 0.12·H₂O − 0.18·dust + ghBias`, fitted around Earth. Venus needs a factor of hundreds more forcing than that expression can produce.',k:'ENG',e:'L',i:3},
{c:'air',t:'Band-resolved radiative transfer',n:['press'],d:'Two or four bands with real absorption coefficients, replacing the fitted log expression. It is the only way one greenhouse model covers Mars at 6 mbar and Venus at 92 bar without being retuned per world.',k:'ENG',e:'L',i:3},
{c:'air',t:'Collision-induced absorption in H₂ atmospheres',n:['press'],d:'For the giants and for any primordial-envelope world, H₂–H₂ and H₂–He CIA is the dominant opacity. It is absent from the greenhouse expression entirely.',k:'ENG',e:'M',i:2},
{c:'air',t:'Rock-vapour atmospheres',n:['press'],d:'K2-141 b and 55 Cnc e have atmospheres of Na, SiO and Mg evaporated off a magma ocean, which condense and rain out on the night side. A weather system made of rock.',k:'ENG',e:'M',i:3},
{c:'air',t:'Atmospheric collapse on the night side',n:['lock','press'],d:'Below a threshold pressure, heat transport fails on a locked world and the atmosphere freezes out permanently on the dark hemisphere. It is the actual scientific question about every locked world in the catalogue.',k:'ENG',e:'M',i:3},
{c:'air',t:'Seasonal atmospheric collapse',n:['press'],d:'Pluto’s nitrogen atmosphere sublimes near perihelion and freezes out again; Mars deposits a third of its CO₂ onto the winter pole each year. An atmosphere with a variable total mass.',k:'ENG',e:'M',i:2},
{c:'air',t:'Secondary atmospheres are outgassed, not inherited',n:['press'],d:'Venus, Earth, Mars and Titan all lost their primordial envelopes and built new ones from volcanism and impacts. `tectonics.js` already injects CO₂ and sulphate at eruptions — that is the supply side of a secondary atmosphere.',k:'ENG',e:'M',i:3},
{c:'air',t:'Primordial H/He envelopes',n:['press'],d:'The giants and sub-Neptunes kept theirs. It is a completely different origin, composition and structure, and the `giant` category currently gets `{N2: 0.08, CH4: 0.18}` from a tag.',k:'ENG',e:'M',i:3},
{c:'air',t:'Escaping atmospheres, observed',n:['retain'],d:'HD 209458 b and GJ 436 b have measured hydrogen tails; GJ 3470 b has escaping helium in a metastable line. These are direct measurements of a process the model should be running.',k:'ENG',e:'M',i:2},
{c:'air',t:'Photochemistry and haze',n:['press'],d:'Titan’s tholin haze and the Archean organic haze come from the same chemistry — methane photolysis above a C/O threshold. `atmoTick` has a haze term with nothing producing it.',k:'ENG',e:'M',i:3},
{c:'air',t:'Clouds by condensation species',n:['press'],d:'Water on Earth, sulphuric acid on Venus, methane on Titan, silicates on HD 189733 b, quartz on WASP-17 b, iron on WASP-76 b. Which species condenses is a function of temperature and composition.',k:'ENG',e:'M',i:3},
{c:'air',t:'Metallicity of the atmosphere',n:['press'],d:'GJ 1214 b’s flat spectrum resolved into a metal-rich, hazy envelope. Atmospheric metallicity correlates inversely with planet mass and is one of the few compositional handles observations give.',k:'DATA',e:'S',i:2},
{c:'air',t:'C/O ratio',n:['press'],d:'WASP-12 b is carbon-rich, which changes which molecules dominate and therefore what the spectrum looks like. It is also a fossil of where in the disk the planet formed.',k:'DATA',e:'S',i:2},
{c:'air',t:'Thermal inversions',n:['press'],d:'WASP-121 b has a stratosphere from metal-oxide absorption aloft. An inversion reverses the sign of every spectral feature, which is why some hot Jupiters show emission where others show absorption.',k:'ENG',e:'M',i:2},
{c:'air',t:'Day–night heat redistribution efficiency',n:['lock'],d:'LHS 3844 b redistributes essentially nothing — a bare rock. Hot Jupiters redistribute a lot. It is one number that determines the entire thermal structure of a locked world and it is observable.',k:'ENG',e:'M',i:3},
{c:'air',t:'Molecular dissociation at the top of the range',n:['press'],d:'On KELT-9 b at ~4,600 K dayside, H₂ dissociates and recombines on the night side, carrying enormous energy. Ordinary atmospheric chemistry does not apply.',k:'ENG',e:'M',i:2},
{c:'air',t:'Aerial biospheres need a pressure level, not a surface',n:['press'],d:'The Venus cloud deck at 50 km is Earth-like in temperature and pressure. `alien.js` handles the biology; the atmosphere model has no concept of an altitude to put it at.',k:'ENG',e:'M',i:2},
{c:'air',t:'Transmission spectrum from real composition',n:['press'],d:'`transitSpectrum` in `instruments.js` builds lines from model state. Once composition and scale height are real, the instrument stops being a sketch and becomes a prediction the player can compare to published data.',k:'UI',e:'M',i:3},
{c:'air',t:'Show the observability of each world',n:['press'],d:'Transmission signal scales with scale height, radius ratio and stellar brightness. A ranked list of what is actually characterisable is a genuinely useful view and it is arithmetic.',k:'UI',e:'M',i:2},
{c:'air',t:'Report pressure in bar, everywhere',n:['press'],d:'The HUD reports gases as fractions. A player who knows Venus is 92 bar has no way to check the model agrees, and a player who does not learns nothing.',k:'UI',e:'S',i:3},
{c:'air',t:'Retire the per-tag gas mixtures',n:['press'],d:'Twenty-odd hand-typed `rule.gases` assignments in `applyNeeds()`. Once composition is data, keeping them means the two disagree the first time a value is updated.',k:'ENG',e:'S',i:3},
{c:'air',t:'An atmosphere can be genuinely unknown',n:['tier'],d:'For most of the catalogue nobody knows whether there is one. A world showing "atmosphere: unmeasured" is more honest and more interesting than one silently given nitrogen.',k:'UI',e:'S',i:3},
{c:'air',t:'Model the JWST results as results',n:['press'],d:'TRAPPIST-1 b and c, LHS 3844 b, GJ 486 b, GJ 1214 b, K2-18 b, 55 Cnc e. Half a dozen worlds now have real constraints. Comparing the model against them is the strongest validation available.',k:'DATA',e:'M',i:3},
);

/* --------------------------------------------------------------- therm -- */
add(
{c:'therm',t:'Equilibrium temperature from insolation and albedo',g:'teq',n:['insol'],d:'T_eq = T★√(R★/2a)(1−A)^¼. It is one line, the archive reports it as `pl_eqt` for most rows, and it replaces `rule.freeze` as the anchor of the whole thermal state.',k:'ENG',e:'S',i:3},
{c:'therm',t:'Separate equilibrium from surface temperature',n:['teq'],d:'Venus is 232 K equilibrium and 737 K at the surface. The gap is the greenhouse, and reporting both is the clearest possible demonstration of what a greenhouse does.',k:'ENG',e:'S',i:3},
{c:'therm',t:'Bond albedo as an input, not an outcome',n:['teq'],d:'Earth 0.306, Venus 0.76, Enceladus above 0.8, TrES-2 b under 0.01. It is measured for the Solar System and for a handful of exoplanets, and assumed at 0.3 everywhere else — which should be flagged.',k:'DATA',e:'S',i:3},
{c:'therm',t:'Internal heat as a separate term',n:['teq'],d:'Jupiter emits about 1.7× what it receives; Neptune more than twice. For the free-floaters and the cold giants the internal term is the entire budget and insolation is zero.',k:'ENG',e:'M',i:3},
{c:'therm',t:'Tidal heating in the energy budget',n:['tideheat'],d:'Io’s surface heat flow is ~2 W/m², about twenty times Earth’s, and none of it comes from the Sun. `alien.js` reads `R.tidalHeat` as a constant where a computed flux belongs.',k:'ENG',e:'M',i:3},
{c:'therm',t:'Radiogenic heat with real half-lives',n:['rm'],d:'²³⁸U, ²³²Th and ⁴⁰K supply roughly half of Earth’s budget and decay on 0.7–14 Gyr timescales. For an old world it is much diminished; for a young one it dominates.',k:'ENG',e:'S',i:3},
{c:'therm',t:'Dayside and nightside temperatures on locked worlds',n:['lock','teq'],d:'JWST measured TRAPPIST-1 b’s dayside near 503 K and c’s near 380 K. A single mean temperature cannot represent a world with a permanent day side.',k:'ENG',e:'M',i:3},
{c:'therm',t:'Volatile inventory as data',g:'volat',n:['record'],d:'Water, CO₂, N₂, CH₄, NH₃, SO₂ as masses rather than as `rule.totalWater` clamped to 0.01–2.5. What condenses where follows from the inventory and the temperature.',k:'ENG',e:'M',i:3},
{c:'therm',t:'A phase diagram per volatile',n:['volat','press'],d:'Whether water is ice, liquid or vapour depends on pressure as well as temperature. `liquidWaterOk()` already gates on the triple point; generalising it to every species is what makes Titan’s methane cycle work.',k:'ENG',e:'M',i:3},
{c:'therm',t:'The snow line and where volatiles were available',n:['volat'],d:'Beyond roughly 2.7 AU in the young Solar System, water was ice and could be accreted in bulk. It is why the giants are where they are and why the inner planets are dry.',k:'ENG',e:'M',i:2},
{c:'therm',t:'Methane as the working fluid',n:['volat'],d:'Titan at 94 K has lakes, rain, rivers and a full hydrological cycle in liquid methane. The hydrosphere code is written for water; the phase constants are what actually differ.',k:'ENG',e:'M',i:3},
{c:'therm',t:'Nitrogen glaciers',n:['volat'],d:'Pluto’s Sputnik Planitia is convecting nitrogen ice; Triton has nitrogen geysers at 38 K. Below about 60 K the volatile that behaves like water is N₂.',k:'ENG',e:'M',i:2},
{c:'therm',t:'Supercritical fluids',n:['press'],d:'Above 647 K and 221 bar water has no liquid–gas distinction, which is the state on any steam world and on the deep interiors of the sub-Neptunes.',k:'ENG',e:'M',i:2},
{c:'therm',t:'Magma oceans',n:['teq'],d:'Above roughly 1,700 K silicates melt. 55 Cnc e, K2-141 b and Kepler-78 b have permanent daysides in that state, and the early Earth had a global one.',k:'ENG',e:'M',i:3},
{c:'therm',t:'Ice shell thickness from the heat budget',n:['tideheat'],d:'The balance between tidal heating below and radiative loss above sets how much ice separates Europa’s ocean from space. `iceshell.js` paints a lid; this is what should determine it.',k:'ENG',e:'M',i:3},
{c:'therm',t:'Subsurface ocean depth and volume',n:['tideheat'],d:'Europa’s ocean is 60–150 km deep and holds roughly twice Earth’s surface water. Ganymede, Callisto, Enceladus, Titan, Pluto and possibly Mimas have them too — a large fraction of the catalogue’s liquid water is subsurface.',k:'DATA',e:'M',i:3},
{c:'therm',t:'Thermal inertia and the diurnal swing',n:['press'],d:'The Moon swings 100–390 K over a lunar day; Venus barely varies. `atmoTick` uses a fixed thermal mass of 0.06 for sea and 0.14 for land. It should follow from pressure, composition and surface material.',k:'ENG',e:'M',i:3},
{c:'therm',t:'Surface temperature range, not just a mean',n:['teq'],d:'Mercury runs 100–700 K. A single number for a world with no atmosphere is close to meaningless, and the range is the interesting fact.',k:'UI',e:'S',i:3},
{c:'therm',t:'Report temperature in kelvin and Celsius',n:['teq'],d:'`W.meanTemp` is a 0–1.6 scalar converted for display by `(meanTemp − 0.5) * 80 + 15` on Earth only. Every other world reports a dimensionless number nobody can check.',k:'UI',e:'S',i:3},
{c:'therm',t:'Runaway greenhouse threshold per world',n:['teq','press'],d:'The inner edge of the habitable zone is where water vapour feedback runs away — around S ≈ 1.1 for Earth. Computing it per world tells the player how close their planet is to Venus.',k:'ENG',e:'M',i:3},
{c:'therm',t:'Maximum greenhouse at the outer edge',n:['teq'],d:'Beyond a certain distance no amount of CO₂ helps, because Rayleigh scattering by the CO₂ itself starts to win. It is the other boundary of the habitable zone and it is computable.',k:'ENG',e:'M',i:2},
{c:'therm',t:'Show the greenhouse as a temperature difference',n:['teq'],d:'"232 K equilibrium, 737 K surface, +505 K of greenhouse" for Venus and "+33 K" for Earth. Two numbers and a subtraction, and it is the single most teachable readout in the model.',k:'UI',e:'S',i:3},
{c:'therm',t:'Sanity-check derived T against the archive',n:['teq'],d:'`pl_eqt` is published for most rows. Computing it independently and comparing is a free validation of the insolation chain, and any disagreement means an input is wrong.',k:'ENG',e:'S',i:3},
{c:'therm',t:'Retire `rule.freeze`',n:['teq'],d:'A dimensionless per-world constant standing in for the entire thermal state. Once equilibrium temperature and a phase diagram exist there is nothing left for it to do.',k:'ENG',e:'S',i:3},
);

/* -------------------------------------------------------------- panel -- */
add(
{c:'panel',t:'Every readout in real units',g:'unit',n:['record'],d:'The HUD prints `dt`, `L☉`, a dimensionless `meanTemp` and gas fractions. Kelvin, bar, AU, days, Earth radii, Earth masses, W/m² — the panels should never show a number the player cannot check against a reference.',k:'UI',e:'M',i:3},
{c:'panel',t:'Per-world slider ranges',n:['unit'],d:'`climatePanel` gives every world a Day slider from 15 to 800 and a Tilt from 0 to 90°. The range should come from the world: Venus needs to reach −5,832 hours, TRAPPIST-1 e needs none of it.',k:'UI',e:'M',i:3},
{c:'panel',t:'Disable controls that do not apply',n:['lock'],d:'A tidally locked world has no meaningful obliquity and no day length to set. Greying the control with a one-line reason teaches more than leaving it live and lying.',k:'UI',e:'S',i:3},
{c:'panel',t:'Show the real value beside the slider',n:['unit'],d:'"Day: 24.0 h — Earth’s measured 23.934 h" with a marker on the track. It makes every lever a comparison against reality rather than an abstract adjustment.',k:'UI',e:'S',i:3},
{c:'panel',t:'A reset-to-measured button on every parameter',n:['unit'],d:'Once real values exist, the most useful god tool is putting one back. It also makes it obvious how far a world has been pushed from what it actually is.',k:'UI',e:'S',i:3},
{c:'panel',t:'Mark which values the player has changed',n:['tier'],d:'A modified world is no longer the real one, and the catalogue should say so — otherwise a screenshot of a heavily edited TRAPPIST-1 e reads as a claim about TRAPPIST-1 e.',k:'UI',e:'S',i:3},
{c:'panel',t:'Error bars in the interface',n:['tier'],d:'"R = 1.73 ± 0.03 R⊕" and "M > 1.07 M⊕ (minimum)". The uncertainty is data and hiding it makes every number look better-known than it is.',k:'UI',e:'M',i:3},
{c:'panel',t:'Colour-code measured, derived and assumed',n:['tier'],d:'Three states, one visual convention, applied everywhere a parameter appears. It is the cheapest possible way to make the epistemology visible at a glance.',k:'UI',e:'S',i:3},
{c:'panel',t:'A world data sheet',n:['record'],d:'One panel per body: the parameters, their sources, what is measured and what is not, the derived quantities, and the prose already in the catalogue. It is the page the catalogue browser is currently missing.',k:'UI',e:'M',i:3},
{c:'panel',t:'A system view for multi-planet systems',n:['system'],d:'TRAPPIST-1’s seven planets, Kepler-90’s eight, HR 8799’s four. Showing the system as one object is the only way the resonance chains and architecture are visible.',k:'UI',e:'M',i:3},
{c:'panel',t:'Scale comparison against Earth',n:['rm'],d:'A silhouette of the planet beside Earth, at the same scale. It is the single most-used graphic in every popular exoplanet article, for good reason.',k:'UI',e:'S',i:3},
{c:'panel',t:'Show the sky from the surface',n:['host'],d:'Host colour, angular size and position, plus any moons. From TRAPPIST-1 e a dull red disc four times the Sun’s width; from WD 1856+534 b a white pinprick. Almost pure payoff for parameters that already exist.',k:'UI',e:'M',i:3},
{c:'panel',t:'Filter and sort the catalogue by parameter',n:['record'],d:'By radius, by insolation, by distance, by host temperature, by whether the mass is real. The catalogue panel currently offers a search box and category chips.',k:'UI',e:'M',i:3},
{c:'panel',t:'Compare two worlds side by side',n:['record'],d:'Every parameter, aligned, with the differences highlighted. Kepler-36 b against c — same system, orbits 10% apart, densities eight times apart — is an entire lecture in one screen.',k:'UI',e:'M',i:3},
{c:'panel',t:'Surface the tectonic and interior verdict',n:['rm'],d:'`platesPanel` already shows core mass fraction, heat flow and lid mode. Deriving them from real density rather than a name makes that panel meaningful for all 120 bodies.',k:'UI',e:'S',i:3},
{c:'panel',t:'Show the tidal state',n:['tideheat'],d:'Locked or not, tidal heating in W/m², the range of the tide raised. For the moons this is the whole story and there is nowhere in the interface it appears.',k:'UI',e:'M',i:3},
{c:'panel',t:'A parameter-provenance popover',n:['tier'],d:'Click any number and see where it came from — the archive column, the paper, the derivation, or the assumption. It costs a tooltip and it is what makes the model defensible.',k:'UI',e:'M',i:3},
{c:'panel',t:'Warn when a world is outside the model’s range',n:['tier'],d:'KELT-9 b at 44,000 S⊕ is beyond anything the climate code was calibrated for. Saying so is better than silently clamping and presenting the result as a simulation.',k:'UI',e:'M',i:3},
{c:'panel',t:'Show the clamps that are being applied',n:['unit'],d:'`sanitize()` silently clamps solar to 8, gravity to 3, eccentricity to 0.98 and rotation to 0.05. Every one of those bites on real catalogue worlds and none of them is visible.',k:'UI',e:'S',i:3},
{c:'panel',t:'A discovery timeline',n:['record'],d:'1992 pulsar planets, 1995 51 Peg b, 1999 first transit, 2004 first image, 2017 TRAPPIST-1, 2022 first JWST spectra. The catalogue is also a history of a field.',k:'UI',e:'S',i:2},
{c:'panel',t:'Show the detection method and what it constrains',n:['record'],d:'Transit gives radius; RV gives minimum mass; imaging gives luminosity and separation; microlensing gives a mass ratio and one event. Explaining why a row is sparse is more useful than filling it in.',k:'UI',e:'M',i:3},
{c:'panel',t:'A "what would we actually see" view',n:['host'],d:'Given the distance and the instrument, what could be measured about this world. It is the honest frame for the entire catalogue and it turns each entry into a research question.',k:'UI',e:'M',i:2},
{c:'panel',t:'Let the player edit parameters directly',n:['record'],d:'Type a radius, a period, an eccentricity. The genesis toolkit already builds worlds from sliders; letting it start from a real one and diverge is the twin-world control applied to real data.',k:'UI',e:'M',i:3},
{c:'panel',t:'Unit preference, set once',n:['unit'],d:'Earth radii or kilometres, kelvin or Celsius, AU or millions of kilometres. One setting, applied everywhere, and it makes the product usable by two different audiences.',k:'UI',e:'S',i:2},
{c:'panel',t:'Show insolation as a comparison',n:['insol'],d:'"S = 0.646 S⊕ — like Mars" is instantly graspable in a way that a number is not. Anchoring every exotic value against a Solar System body is cheap and effective.',k:'UI',e:'S',i:3},
{c:'panel',t:'Link the panel to the instruments',n:['unit'],d:'The transit spectrum, the redox tower and the Whittaker diagram should all know which real world they are describing, and say so on the exported image.',k:'UI',e:'S',i:2},
{c:'panel',t:'Name the star, not just the planet',n:['host'],d:'The world chip reads "TRAPPIST-1 e". It should also carry the host: M8V, 2,566 K, 0.089 M☉, 12.4 pc. The star is half of what makes the world what it is.',k:'UI',e:'S',i:3},
{c:'panel',t:'Print the parameter sheet into the exported paper',n:['record'],d:'`exportPaper` produces a run history. Leading with the world’s real parameters, sourced, is what makes the artefact look like a scientific document rather than a game screenshot.',k:'UI',e:'S',i:3},
);

/* --------------------------------------------------------------- prov -- */
add(
{c:'prov',t:'A source on every value',g:'cite',n:['record'],d:'Archive column, published paper, mission fact sheet, or derivation. A parameter without a source cannot be checked, cannot be updated, and should not be shipped as fact.',k:'DATA',e:'M',i:3},
{c:'prov',t:'A query date on the snapshot',n:['cite'],d:'"NASA Exoplanet Archive `pscomppars`, retrieved 2026-08". The worlds backlog already states this convention in prose; the data layer should carry it as a field.',k:'DATA',e:'S',i:3},
{c:'prov',t:'Flag contested detections',g:'contested',n:['cite'],d:'Kapteyn b retracted as a rotation artefact, tau Ceti f disputed, KOI-55 b and c possibly pulsation artefacts, Kepler-452 b’s validation questioned. Four rows in the current catalogue that are not what they appear.',k:'DATA',e:'S',i:3},
{c:'prov',t:'Flag contested interpretations separately from contested detections',n:['contested'],d:'K2-18 b exists; the DMS claim about it does not have consensus. Venus exists; the phosphine result is largely refuted. The planet and the story about it need different flags.',k:'DATA',e:'S',i:3},
{c:'prov',t:'Show the disagreement, do not resolve it',n:['contested'],d:'Where two credible analyses differ, present both. The worlds backlog already committed to this in principle and it is more interesting than picking a winner.',k:'DATA',e:'M',i:3},
{c:'prov',t:'Distinguish confirmed from candidate',n:['cite'],d:'The archive has a disposition column. A candidate shown identically to a confirmed planet is a small dishonesty that compounds across 120 rows.',k:'DATA',e:'S',i:3},
{c:'prov',t:'Record what has been retracted',n:['contested'],d:'Planets get unpublished. Keeping the row with a retraction note is more useful than deleting it, because the retraction is often the more instructive story.',k:'DATA',e:'S',i:2},
{c:'prov',t:'Distinguish a measurement from a model output',n:['tier'],d:'`pl_eqt` in the archive is itself computed under an albedo assumption. Treating it as an observation is a category error the model should not repeat.',k:'DATA',e:'S',i:3},
{c:'prov',t:'State the albedo assumption behind every equilibrium temperature',n:['teq'],d:'Usually 0.3, sometimes 0. It changes the answer by tens of kelvin and it is almost never stated in popular coverage.',k:'DATA',e:'S',i:3},
{c:'prov',t:'Track the version of every derived quantity',n:['cite'],d:'If the mass–radius relation changes, every derived composition changes with it. Recording which relation was used is what makes a result reproducible a year later.',k:'ENG',e:'S',i:2},
{c:'prov',t:'Never present an assumption in the same style as a measurement',n:['tier'],d:'The obliquity of every exoplanet in the catalogue is unknown. Rendering an assumed 0° identically to Earth’s measured 23.44° is the single most misleading thing the interface could do.',k:'UI',e:'S',i:3},
{c:'prov',t:'Cite the archive as it asks to be cited',n:['cite'],d:'There is a required acknowledgement. If the data ships, the acknowledgement ships with it, in the product and not only in the README.',k:'DATA',e:'S',i:3},
{c:'prov',t:'Credit the missions',n:['cite'],d:'Kepler, K2, TESS, CoRoT, Spitzer, HST, JWST, Gaia, OGLE, MOA, SPECULOOS, TRAPPIST. Every row exists because somebody built an instrument, and naming them is both correct and interesting.',k:'DATA',e:'S',i:2},
{c:'prov',t:'A per-world confidence summary',n:['tier'],d:'"Radius measured, mass derived, obliquity assumed, atmosphere unknown." One line that tells the player how much of what they are looking at is real.',k:'UI',e:'S',i:3},
{c:'prov',t:'Say where the model is extrapolating',n:['tier'],d:'For most catalogue worlds the simulation is running physics well outside anything it was calibrated against. That is legitimate and it should be stated on the world, not buried in `model-limits.md`.',k:'UI',e:'S',i:3},
{c:'prov',t:'Separate "invented for legibility" from "fitted" from "measured"',n:['tier'],d:'The codebase already uses this three-way distinction in comments — `star.js` marks `skyFromTeff` as "invented for legibility". Making it a field rather than a comment lets the interface show it.',k:'ENG',e:'M',i:3},
{c:'prov',t:'Keep the five invented worlds visibly invented',n:['tier'],d:'Terra, Vermis, Selene, Ares and Daisyworld sit in the same picker as Europa and TRAPPIST-1 e. They are design objects and the interface should never let them be mistaken for measurements.',k:'UI',e:'S',i:3},
{c:'prov',t:'Record the discovery paper',n:['cite'],d:'One DOI per world. It is the link a curious player follows, and it is the difference between a catalogue and an encyclopaedia entry.',k:'DATA',e:'M',i:2},
{c:'prov',t:'Note when a parameter is a system-wide fit',n:['system'],d:'TRAPPIST-1’s masses come from a global dynamical fit, so the values are correlated. Treating them as seven independent measurements misrepresents the uncertainty.',k:'DATA',e:'S',i:2},
{c:'prov',t:'Handle superseded values',n:['cite'],d:'Published parameters get revised, sometimes substantially. Keeping the previous value with its date is how you find out that a calibration drifted because the data moved, not the model.',k:'DATA',e:'S',i:2},
{c:'prov',t:'A "what changed" note on refresh',n:['cite'],d:'When the snapshot updates, list the rows whose values moved by more than their error bars. That list is often more interesting than the catalogue itself.',k:'ENG',e:'S',i:2},
{c:'prov',t:'Be explicit about Solar System precision',n:['cite'],d:'Earth’s parameters are known to many significant figures; TRAPPIST-1 e’s radius to two. Showing both to the same precision implies a false equivalence.',k:'UI',e:'S',i:3},
{c:'prov',t:'Do not round away the interesting digits',n:['cite'],d:'Venus’s rotation is −243.02 days and its obliquity 177.4°. Rounding to −243 and 177 loses the fact that the retrograde spin and the near-flip are separate measurements.',k:'DATA',e:'S',i:1},
{c:'prov',t:'A machine-readable bibliography',n:['cite'],d:'BibTeX or CSL-JSON alongside the data. It costs nothing, and it makes the exported paper genuinely citable.',k:'DATA',e:'S',i:1},
{c:'prov',t:'Say what is not in the catalogue',n:['cite'],d:'Nearly 6,000 confirmed planets exist and 120 are here. Stating the selection criterion — and that it is editorial — is more honest than implying completeness.',k:'DATA',e:'S',i:2},
{c:'prov',t:'A provenance section in the exported paper',n:['cite'],d:'Sources, query date, assumptions, and where the model extrapolated. It is the section that makes the artefact something a person could show a scientist.',k:'UI',e:'M',i:3},
);

/* -------------------------------------------------------------- valid -- */
add(
{c:'valid',t:'Every world becomes a test case',g:'wtest',n:['record'],d:'`calibrate.mjs` checks modern Earth. With real parameters, each of 120 bodies is an independent check of the same physics — and the ones the model gets wrong are the most valuable output the project has.',k:'ENG',e:'M',i:3},
{c:'valid',t:'Reproduce Venus',n:['wtest'],d:'92 bar CO₂, 737 K surface, 232 K equilibrium, 0.76 Bond albedo, 243-day retrograde rotation. If the greenhouse model cannot produce a 505 K excess, it is fitted to Earth rather than physical.',k:'ENG',e:'M',i:3},
{c:'valid',t:'Reproduce Mars',n:['wtest'],d:'6.4 mbar, 210 K, seasonal CO₂ collapse onto the winter pole, global dust storms. The thin-atmosphere end of the range and the one the dust code was written for.',k:'ENG',e:'M',i:3},
{c:'valid',t:'Reproduce Titan',n:['wtest'],d:'1.5 bar N₂, 94 K, a methane hydrological cycle with lakes and rain. It tests the phase-diagram generalisation more directly than anything else available.',k:'ENG',e:'M',i:3},
{c:'valid',t:'Reproduce the Moon’s diurnal swing',n:['wtest'],d:'100 to 390 K over a 29-day solar day with no atmosphere. The cleanest possible test of the thermal-inertia and insolation code with every other term switched off.',k:'ENG',e:'S',i:3},
{c:'valid',t:'Reproduce LHS 3844 b’s null result',n:['wtest'],d:'Spitzer showed essentially no heat redistribution — a bare rock. A model that gives it an atmosphere is wrong in a way that is directly checkable against published data.',k:'ENG',e:'M',i:3},
{c:'valid',t:'Reproduce the TRAPPIST-1 b and c daysides',n:['wtest'],d:'JWST measured roughly 503 K and 380 K. Two numbers, two planets, one system, and the strongest available test of the locked-world thermal model.',k:'ENG',e:'M',i:3},
{c:'valid',t:'Check derived insolation against `pl_insol`',n:['insol'],d:'The archive publishes it. Computing it independently from L★/a² and comparing across all 120 rows is a free end-to-end test of the stellar chain.',k:'ENG',e:'S',i:3},
{c:'valid',t:'Check derived equilibrium temperature against `pl_eqt`',n:['teq'],d:'Same argument, one step further down the chain. Disagreements localise the error to albedo or to insolation immediately.',k:'ENG',e:'S',i:3},
{c:'valid',t:'Check derived gravity against Solar System values',n:['grav'],d:'Eleven bodies with gravity known to several figures. If g = GM/R² does not reproduce them the units are wrong somewhere, and it is better to find that here than in the biosphere.',k:'ENG',e:'S',i:3},
{c:'valid',t:'Check density against published density',n:['rm'],d:'The archive carries `pl_dens` for many rows. It is fully determined by mass and radius, so a mismatch means the inputs disagree with each other.',k:'ENG',e:'S',i:3},
{c:'valid',t:'A regression suite over the whole catalogue',n:['wtest'],d:'Run every world headless for a fixed number of ticks and assert nothing crashes, no field goes non-finite, and the budgets close. `headless.mjs` and `assert.js` already exist to do it.',k:'ENG',e:'M',i:3},
{c:'valid',t:'Find the worlds that break the model',n:['wtest'],d:'KELT-9 b at 44,000 S⊕, WISE 0855 at zero insolation, Arrokoth with no hydrostatic shape. Cataloguing the failures is a genuine research output, not an embarrassment.',k:'ENG',e:'M',i:3},
{c:'valid',t:'Assert the clamps are never silently hit',n:['unit'],d:'`sanitize()` clamps solar to 8, gravity to 3, eccentricity to 0.98. Each of those bites on real catalogue worlds. A test that fails when a clamp fires turns silent truncation into a visible decision.',k:'ENG',e:'S',i:3},
{c:'valid',t:'Golden-run hashes per world',n:['wtest'],d:'The repo already has a golden-run test. Extending it to a handful of representative worlds catches regressions in the derivation chain that Earth alone would not.',k:'ENG',e:'M',i:3},
{c:'valid',t:'Compare against a published climate model',n:['wtest'],d:'Several catalogue worlds have GCM studies in the literature — TRAPPIST-1 e in particular. Comparing against a real published result is the strongest validation available and the honest way to state the model’s accuracy.',k:'ENG',e:'M',i:2},
{c:'valid',t:'Check the habitable zone boundaries against the standard formulation',n:['insol'],d:'There are published polynomial fits for the runaway-greenhouse and maximum-greenhouse edges as a function of stellar temperature. Reproducing them is a two-line test.',k:'ENG',e:'S',i:3},
{c:'valid',t:'Test the sparse-data paths',n:['gap'],d:'Most rows are missing most columns. The tests should include worlds with no mass, no eccentricity and no age, and assert the model degrades visibly rather than defaulting.',k:'ENG',e:'M',i:3},
{c:'valid',t:'Cross-check the seed table in this generator',n:['wtest'],d:'The `WORLDS` table here was assembled by hand and is certain to contain errors. Diffing it against the archive is the first validation task and it will find them.',k:'DATA',e:'M',i:3},
{c:'valid',t:'Publish the accuracy report',n:['wtest'],d:'For each of the 120: what the model produced, what is observed, and the difference. It is the document that says how much to trust the thing, and it can be generated.',k:'ENG',e:'M',i:3},
{c:'valid',t:'Fail the build when the catalogue regresses',n:['wtest'],d:'The generated-not-edited rule is currently enforced by a sentence in the README. Regenerating all backlogs and the catalogue in CI, and failing on a diff, makes it real.',k:'ENG',e:'S',i:2},
{c:'valid',t:'Track accuracy over time',n:['wtest'],d:'One number per release: how many of the 120 the model reproduces within tolerance. It is the project’s single most meaningful progress metric and it does not exist.',k:'ENG',e:'M',i:3},
);

/* ---------------------------------------------------------------- gap -- */
add(
{c:'gap',t:'Decide the policy for missing data, once',g:'gap',n:['tier'],d:'Exclude the world, show it with a hole, or fill it with a flagged estimate. Currently `sanitize()` silently substitutes a default deep inside a function, which is the one option that teaches the player nothing.',k:'ENG',e:'M',i:3},
{c:'gap',t:'Estimate mass from radius, visibly',n:['gap','rm'],d:'A published mass–radius relation, applied only where mass is absent, rendered in the "derived" style. It fills the transit-only rows without pretending they were weighed.',k:'ENG',e:'M',i:3},
{c:'gap',t:'Estimate radius from mass, visibly',n:['gap','rm'],d:'The inverse problem for the radial-velocity rows, and considerably less certain because of the envelope degeneracy. Both directions need the same flagging.',k:'ENG',e:'M',i:3},
{c:'gap',t:'Assume zero eccentricity, and say so',n:['gap'],d:'`pl_orbeccen` is frequently missing and frequently assumed zero in the literature too. Inheriting that assumption is fine; inheriting it silently is not.',k:'ENG',e:'S',i:3},
{c:'gap',t:'Assume synchronous rotation inside the locking radius',n:['gap','lock'],d:'Defensible for most short-period worlds and wrong for Mercury. Compute the locking timescale, apply the assumption where it holds, and flag it everywhere.',k:'ENG',e:'M',i:3},
{c:'gap',t:'Obliquity is unknown for every exoplanet',n:['gap'],d:'Not one has a measured axial tilt. Whatever the model uses is an assumption, and it should be a single, visible, changeable one rather than a scatter of tag-driven constants.',k:'ENG',e:'S',i:3},
{c:'gap',t:'Albedo defaults to 0.3 because that is the convention',n:['gap','teq'],d:'It is Earth’s. Using it for a lava world or an ice moon is wrong by a large factor, and the equilibrium temperature inherits the error directly.',k:'ENG',e:'S',i:3},
{c:'gap',t:'Atmospheric composition is almost never known',n:['gap','press'],d:'A handful of JWST results and everything else is inference. The default should be an explicit "unmeasured" state that the interface can render, not a plausible-looking mixture.',k:'ENG',e:'M',i:3},
{c:'gap',t:'Stellar age is often uncertain by a factor of two',n:['gap','host'],d:'Which propagates into XUV dose, radius inflation and interior heat. Carrying the uncertainty through to the outputs, rather than picking the central value, is the honest treatment.',k:'ENG',e:'M',i:2},
{c:'gap',t:'Microlensing gives a mass ratio, not a mass',n:['gap'],d:'OGLE-2016-BLG-1928 and MOA-2011-BLG-262L b have irreducible degeneracies — the second may be a moon of a free-floater or a planet of a brown dwarf. Some rows cannot be resolved and the catalogue should say so.',k:'DATA',e:'S',i:3},
{c:'gap',t:'Imaged planets give luminosity, not mass',n:['gap'],d:'Masses for HR 8799 and beta Pic b come from evolutionary models, which depend on an assumed formation history and an age. They are model-dependent in a way transit radii are not.',k:'DATA',e:'S',i:2},
{c:'gap',t:'Interpolate within a system before reaching for a population',n:['gap','system'],d:'A TRAPPIST-1 planet with a missing value is better estimated from its six siblings than from the whole archive. Locality is usually the better prior.',k:'ENG',e:'M',i:2},
{c:'gap',t:'Never let a default propagate silently into a derived value',n:['gap'],d:'An assumed albedo produces an equilibrium temperature that produces a climate that produces a biosphere verdict. The flag has to survive the whole chain or the last step looks like a measurement.',k:'ENG',e:'M',i:3},
{c:'gap',t:'Show the hole',n:['gap'],d:'An empty field rendered as empty. The instinct to fill every cell is what turns a catalogue into a fiction, and a visible gap is a prompt for curiosity rather than a defect.',k:'UI',e:'S',i:3},
{c:'gap',t:'Let the player supply a missing value',n:['gap'],d:'With their assumption recorded as theirs. It turns the gap into a hypothesis they can test, which is the most interesting thing to do with an unknown.',k:'UI',e:'M',i:3},
{c:'gap',t:'Sample the uncertainty instead of taking the central value',n:['gap'],d:'Run the world at the low end and the high end of its error bars and see whether the outcome changes. For worlds near a threshold it usually does, and that is the result.',k:'ENG',e:'M',i:2},
{c:'gap',t:'Rank worlds by how much is actually known',n:['gap'],d:'Earth at one end, a single microlensing event at the other. It is a genuinely novel way to sort a catalogue and it makes the epistemology the subject.',k:'UI',e:'S',i:3},
{c:'gap',t:'Do not extrapolate the biosphere past the physics',n:['gap'],d:'`alien.js` produces a sterility verdict. On a world where the atmosphere is unmeasured, the honest verdict is "unknown", and it should be available as an outcome.',k:'ENG',e:'M',i:3},
{c:'gap',t:'Distinguish "no data" from "measured as absent"',n:['gap'],d:'LHS 3844 b has been shown to have no thick atmosphere. Most rows simply have not been looked at. Those are opposite states and the catalogue currently cannot express either.',k:'DATA',e:'S',i:3},
{c:'gap',t:'Write down what a filled gap costs',n:['gap'],d:'Every assumption is a small loan against the model’s credibility. Listing them in one place — how many, which, and how load-bearing — is the document that keeps the total honest.',k:'DATA',e:'M',i:3},
);

/* ---------------------------------------------------------------- sol -- */
add(
{c:'sol',t:'Make Earth the assertion, not the flavour',n:['wtest'],d:'`RULESETS[0]` is "Earth-flavoured" with `ghBias: 0.048` and `targetMeanTemp: 0.50` — fitted constants that make the answer come out. Pin the real parameters and let 288 K be an output.',k:'ENG',e:'M',i:3},
{c:'sol',t:'Venus is the greenhouse test and the model fails it',n:['press'],d:'`greenhouseFromGases` tops out far below the 505 K excess Venus needs. It is the clearest evidence that the current expression is a fit around Earth rather than radiative physics.',k:'ENG',e:'M',i:3},
{c:'sol',t:'Venus rotates backwards in 243 days',n:['elements'],d:'`applyNeeds` sets `rotationPeriod = -243` from a tag and `sanitize()` clamps the magnitude to 40. The clamp silently destroys the single most distinctive fact about the planet.',k:'ENG',e:'S',i:3},
{c:'sol',t:'Venus has no magnetic field and kept its atmosphere anyway',n:['retain'],d:'The intuition that a magnetosphere is required is wrong, and Venus is the counter-example. Whatever the escape model concludes, it has to get this right.',k:'ENG',e:'M',i:3},
{c:'sol',t:'Mars’s obliquity has wandered chaotically',n:['elements'],d:'Between roughly 15° and 45° over millions of years, with no large moon to stabilise it. `setMoon` already has `obliquityWander`; Mars is the world it should be calibrated against.',k:'ENG',e:'M',i:3},
{c:'sol',t:'Mars deposits a third of its atmosphere on the winter pole',n:['press'],d:'Seasonal CO₂ condensation changes the total surface pressure measurably over a year. An atmosphere whose mass is not constant is a regime the model has never faced.',k:'ENG',e:'M',i:2},
{c:'sol',t:'Mercury is in a 3:2 spin–orbit resonance',n:['lock'],d:'Not locked — resonant, because of its e = 0.206 orbit. The solar day is 176 Earth days, twice the year. Assuming synchronous rotation gets it exactly wrong.',k:'ENG',e:'M',i:2},
{c:'sol',t:'Mercury’s core is ~85% of its radius',n:['rm'],d:'The most extreme iron fraction in the Solar System and the reference point for the iron-rich exoplanet population. `INTERIORS.mercury` exists; deriving it from density would confirm the profile.',k:'DATA',e:'S',i:2},
{c:'sol',t:'The four giants have no surface',n:['press'],d:'`h[c]` is load-bearing throughout the geology, hydrology and biosphere code. Jupiter, Saturn, Uranus and Neptune all currently get a heightfield, which is not an approximation but a category error.',k:'ENG',e:'L',i:3},
{c:'sol',t:'Saturn is less dense than water',n:['rm'],d:'0.687 g/cm³. It is the fact everybody remembers about Saturn and the model has no way to represent or report it.',k:'DATA',e:'S',i:2},
{c:'sol',t:'Uranus is tipped 98°',n:['elements'],d:'Each pole faces the Sun for 42 years. It is the most extreme obliquity in the Solar System and the strongest possible test of the seasonal insolation code.',k:'ENG',e:'M',i:3},
{c:'sol',t:'Neptune has the fastest winds on almost no sunlight',n:['insol'],d:'~2,000 km/h at S = 0.001. It is driven by internal heat, and it is the cleanest demonstration that a circulation does not need a star.',k:'ENG',e:'M',i:2},
{c:'sol',t:'Pluto’s atmosphere collapses and returns',n:['volat'],d:'A ~1 Pa nitrogen atmosphere that sublimes near perihelion and freezes out again, on a 248-year orbit with e = 0.249. Nitrogen as the working volatile, not water.',k:'ENG',e:'M',i:2},
{c:'sol',t:'Ceres has brine, not ocean',n:['volat'],d:'A briny subsurface layer and cryovolcanic deposits on a 940 km body. It is the smallest object in the catalogue worth giving a hydrosphere at all.',k:'DATA',e:'S',i:2},
{c:'sol',t:'Sedna’s orbit is the model’s time-scale test',n:['elements'],d:'Perihelion 76 AU, aphelion around 937, period roughly 11,400 years. One orbit is longer than recorded human history.',k:'DATA',e:'S',i:1},
{c:'sol',t:'Arrokoth and 67P are not spheres',n:['rm'],d:'Contact binaries and rubble piles below hydrostatic equilibrium. The cube-sphere cannot represent their shape, and the honest answer is to say so rather than render a ball.',k:'ENG',e:'M',i:2},
);

/* -------------------------------------------------------------- moons -- */
add(
{c:'moons',t:'Moons orbit planets, not stars',n:['elements'],d:'Fifteen rows need a parent body and a planetocentric orbit. Without it Io ends up at 5.2 AU with no context and every tidal quantity is meaningless.',k:'ENG',e:'S',i:3},
{c:'moons',t:'Insolation is the parent planet’s, and it is tiny',n:['insol'],d:'The Galilean moons all sit at S = 0.037 and the Saturnian system at 0.011. `applyNeeds` assigns `rule.solar` between 0.08 and 0.35 by tag — an order of magnitude out.',k:'ENG',e:'S',i:3},
{c:'moons',t:'Tidal heating is the real energy budget',n:['tideheat'],d:'Io dissipates of order 10¹⁴ W. Sunlight at Jupiter is negligible by comparison. For most of this category the star is irrelevant and the parent planet is everything.',k:'ENG',e:'M',i:3},
{c:'moons',t:'The Laplace resonance is why Europa has an ocean',n:['system'],d:'Io, Europa and Ganymede in a 4:2:1 chain, forcing the eccentricities that drive the heating. Without the resonance it decays away and there is no ocean to argue about.',k:'ENG',e:'M',i:3},
{c:'moons',t:'Callisto is the control',n:['tideheat'],d:'Outside the resonance, almost no tidal heating, and the most heavily cratered surface known. Same system, same composition, no energy — it is the null result that proves the mechanism.',k:'DATA',e:'S',i:3},
{c:'moons',t:'Europa’s ocean holds twice Earth’s surface water',n:['volat'],d:'A 60–150 km ocean under 15–25 km of ice. `iceshell.js` exists; giving it the real shell and ocean depths is what makes the habitability verdict mean something.',k:'DATA',e:'M',i:3},
{c:'moons',t:'Titan is the only moon with a real atmosphere',n:['press'],d:'1.5 bar of N₂ with about 5% methane at 94 K — a higher surface pressure than Earth. `applyNeeds` gets the composition roughly right by name match and has nowhere to put the pressure.',k:'DATA',e:'S',i:3},
{c:'moons',t:'Titan runs a methane hydrological cycle',n:['volat'],d:'Lakes, rain, rivers, seasonal cloud. The hydrosphere code is written around water; what actually differs is the phase constants and the density.',k:'ENG',e:'M',i:3},
{c:'moons',t:'Enceladus vents its ocean into space',n:['volat'],d:'South-polar plumes, sampled in flight, with silica grains implying hydrothermal water above 90 °C. The only place a biosignature could be collected without drilling.',k:'DATA',e:'S',i:3},
{c:'moons',t:'Io has no impact craters at all',n:['tideheat'],d:'Resurfaced faster than they accumulate, with ~400 active volcanoes and a surface heat flow around 2 W/m². Crater counting, the standard dating method, returns zero age.',k:'DATA',e:'S',i:3},
{c:'moons',t:'Ganymede has its own magnetic field',n:['rm'],d:'The only moon that does, from a liquid iron core inside Jupiter’s magnetosphere. `INTERIORS.ganymede` exists and this is why it is a distinct profile.',k:'DATA',e:'S',i:2},
{c:'moons',t:'Triton orbits backwards and is spiralling in',n:['elements'],d:'A captured Kuiper Belt object on a retrograde orbit, so tidal torque brings it closer rather than pushing it away. Nitrogen geysers on a 38 K surface.',k:'ENG',e:'M',i:3},
{c:'moons',t:'Iapetus is two-tone by a factor of ten',n:['record'],d:'Leading hemisphere albedo about 0.05, trailing about 0.5, plus a 20 km equatorial ridge. Albedo as a spatial field rather than a single number.',k:'DATA',e:'S',i:2},
{c:'moons',t:'Phobos orbits below synchronous altitude',n:['tideheat'],d:'Tidal torque is dragging it inward rather than outward — the sign flips when the moon orbits faster than the planet spins. Disruption or impact within roughly 50 Myr.',k:'ENG',e:'M',i:2},
{c:'moons',t:'Pluto and Charon are a true double planet',n:['system'],d:'Mutually locked around a barycentre outside Pluto’s surface. The only such pair in the Solar System and a genuinely different two-body configuration.',k:'ENG',e:'M',i:2},
);

/* ---------------------------------------------------------- temperate -- */
add(
{c:'temperate',t:'One TRAPPIST-1 host record for seven planets',n:['system'],d:'M8V, 2,566 K, 0.0898 M☉, 0.1192 R☉, ~7.6 Gyr, 12.4 pc. Seven rows currently each imply their own star, so a correction to the star has to be made seven times.',k:'DATA',e:'S',i:3},
{c:'temperate',t:'The TRAPPIST-1 resonance chain gives the masses',n:['system'],d:'8:5, 5:3, 3:2, 3:2, 4:3, 3:2. Transit-timing variations from that chain constrain the masses to a few per cent — better than almost anything else in the catalogue.',k:'DATA',e:'M',i:3},
{c:'temperate',t:'Ship the JWST non-detections as results',n:['contested'],d:'TRAPPIST-1 b near 503 K with no thick atmosphere, c near 380 K with little CO₂. The first real answers about these worlds are negative, and that is the finding.',k:'DATA',e:'S',i:3},
{c:'temperate',t:'Almost every world in this category is tidally locked',n:['lock'],d:'Habitable-zone orbits around M dwarfs are at 0.02–0.2 AU, well inside the locking radius. It is the single most important shared property of the category and it is applied by tag.',k:'ENG',e:'M',i:3},
{c:'temperate',t:'M-dwarf flares are the category’s defining hazard',n:['host'],d:'Proxima brightened 14,000-fold in the ultraviolet for seven seconds in 2019. Kepler-438 b was likely stripped. Ross 128 and TOI-700 are notably quiet — the variation matters more than the mean.',k:'ENG',e:'M',i:3},
{c:'temperate',t:'Red light and the limits of photosynthesis',n:['host'],d:'TRAPPIST-1 emits most of its output beyond 750 nm. `photonUsableFraction` returns 0.12 below 2,800 K from a lookup; computing it from the Planck function makes the open question quantitative.',k:'ENG',e:'M',i:3},
{c:'temperate',t:'Proxima Cen b has a minimum mass and no radius',n:['tier'],d:'1.07 M⊕ is M sin i from radial velocity, and there is no transit. Presenting it as a mass, and inventing a radius, is the commonest error made about the nearest exoplanet.',k:'DATA',e:'S',i:3},
{c:'temperate',t:'Proxima is part of a triple system',n:['system'],d:'α Cen A and B at roughly 13,000 AU. It affects the long-term dynamics and it is the reason the system is interesting as a destination.',k:'DATA',e:'S',i:2},
{c:'temperate',t:'LHS 1140 b sits between rock and water world',n:['rm'],d:'1.73 R⊕ and 5.6 M⊕. The density admits either a rocky world with a thin secondary atmosphere or a substantial water layer, and JWST hints at nitrogen. A genuinely open row.',k:'DATA',e:'M',i:3},
{c:'temperate',t:'TOI-700 is quiet, and that is the result',n:['host'],d:'No flares in a year of TESS monitoring. For an M dwarf that is more significant than the insolation, and it is a stellar property the planet record has nowhere to store.',k:'DATA',e:'S',i:3},
{c:'temperate',t:'A quarter of this category is minimum masses',n:['tier'],d:'Teegarden, Ross 128, GJ 273, GJ 357 d, Proxima, tau Ceti, Kapteyn. All radial-velocity, all M sin i, all systematically underestimated by an unknown inclination factor.',k:'DATA',e:'S',i:3},
{c:'temperate',t:'GJ 357 d is probably not rocky',n:['rm'],d:'A 6.1 M⊕ minimum mass most likely means a mini-Neptune. It is the honest reading of most radial-velocity super-Earths and the catalogue should say so rather than implying a surface.',k:'DATA',e:'S',i:3},
{c:'temperate',t:'Kepler-22 b is 2.4 R⊕ and almost certainly not rocky',n:['rm'],d:'The first habitable-zone transit, 2011, and above the radius valley. It is a useful lesson in what "in the habitable zone" does not mean.',k:'DATA',e:'S',i:3},
{c:'temperate',t:'Kepler-452 b is contested',n:['contested'],d:'A G2V host and a 385-day year make it the closest analogue to Earth’s orbit in the catalogue, and the validation has been questioned. Ship it flagged.',k:'DATA',e:'S',i:3},
{c:'temperate',t:'Kapteyn b was retracted',n:['contested'],d:'Claimed around an 11-Gyr halo star and then argued to be an artefact of stellar rotation. The row should stay, with the retraction, because the retraction is the more instructive story.',k:'DATA',e:'S',i:3},
{c:'temperate',t:'Barnard’s planets are new and small',n:['contested'],d:'Four sub-Earths at 0.19–0.34 M⊕ confirmed 2024–2025 around the second-nearest system at 1.83 pc. Too hot for liquid water, historic regardless, and recent enough that the numbers will move.',k:'DATA',e:'S',i:3},
{c:'temperate',t:'Rank the category by what is actually observable',n:['host'],d:'Gliese 12 b at 12 pc and transiting; Kepler-186 f at 179 pc and never characterisable. Distance and transit geometry decide which of these worlds anyone will ever know anything about.',k:'UI',e:'S',i:3},
);

/* ------------------------------------------------------------ furnace -- */
add(
{c:'furnace',t:'Insolation here runs to thousands of Earths',n:['insol'],d:'K2-141 b receives roughly 5,000 S⊕. `applyStarToRule` clamps `rule.solar` to 8, so every world in this category is currently being simulated at under a thousandth of its actual irradiation.',k:'ENG',e:'M',i:3},
{c:'furnace',t:'A permanent magma ocean on the day side',n:['teq'],d:'Above about 1,700 K silicates melt. 55 Cnc e, K2-141 b, Kepler-78 b and CoRoT-7 b all have daysides in that state, and it is the defining surface condition of the category.',k:'ENG',e:'M',i:3},
{c:'furnace',t:'Rock vapour as an atmosphere',n:['press'],d:'Na, SiO and Mg evaporating off the melt, transported by supersonic winds, condensing and raining out on the night side. A hydrological cycle made of rock, which the hydrosphere code could almost express.',k:'ENG',e:'M',i:3},
{c:'furnace',t:'55 Cnc e may have a secondary atmosphere',n:['contested'],d:'JWST reported CO/CO₂ over the magma ocean in 2024 — the first atmosphere detected on a rocky exoplanet. It is recent, significant and should ship with its date.',k:'DATA',e:'S',i:3},
{c:'furnace',t:'LHS 3844 b is the cleanest null result in the catalogue',n:['wtest'],d:'A Spitzer phase curve showed essentially no heat redistribution — a bare rock with no atmosphere. Any model that gives it one is checkably wrong.',k:'DATA',e:'S',i:3},
{c:'furnace',t:'GJ 367 b is ~91% iron',n:['rm'],d:'0.72 R⊕, 0.63 M⊕, about 10.2 g/cm³. A sub-Earth stripped to its core, and the extreme end of the composition range the mass–radius model has to span.',k:'DATA',e:'S',i:3},
{c:'furnace',t:'Two planets in this category are disintegrating',n:['record'],d:'Kepler-1520 b and K2-22 b have transit depths that vary between orbits because what transits is a comet-like tail of mineral dust, not a disc. One tail trails, the other leads.',k:'DATA',e:'M',i:3},
{c:'furnace',t:'Kepler-36 b and c differ eightfold in density',n:['rm'],d:'7.5 versus 0.9 g/cm³, with orbits 10% apart. It is the single best demonstration in the catalogue that composition is not set by distance from the star.',k:'DATA',e:'S',i:3},
{c:'furnace',t:'TOI-849 b is an exposed core',n:['rm'],d:'39 M⊕ at 3.44 R⊕ in the middle of the hot-Neptune desert — a giant planet stripped of its envelope, or one that never got one.',k:'DATA',e:'S',i:3},
{c:'furnace',t:'K2-137 b has a 4.3-hour year',n:['elements'],d:'Among the shortest periods known around a main-sequence star, and close to the Roche limit for a rocky body. The genesis toolkit should refuse to place a planet inside it.',k:'DATA',e:'S',i:2},
{c:'furnace',t:'GJ 486 b shows the starspot problem',n:['host'],d:'Its JWST spectrum is ambiguous between a water-rich atmosphere and unocculted spots on the host. It is the clearest single example of why stellar contamination matters.',k:'DATA',e:'S',i:3},
{c:'furnace',t:'GJ 1132 b’s atmosphere was claimed then disputed',n:['contested'],d:'A marginal detection at the limit of the instrument, later not reproduced. A useful row precisely because it did not hold up.',k:'DATA',e:'S',i:2},
{c:'furnace',t:'LP 791-18 d is volcanic from a neighbour',n:['tideheat'],d:'Forced eccentricity from the adjacent planet drives tidal heating at a temperate insolation — plausibly an Io-like world in the habitable zone. Tidal heating and starlight as independent budgets.',k:'DATA',e:'S',i:3},
{c:'furnace',t:'Several of these orbits are decaying',n:['elements'],d:'Kepler-78 b will not survive. Giving a world a computed remaining lifetime is a striking readout, and for this category it is often shorter than the star’s.',k:'ENG',e:'M',i:2},
{c:'furnace',t:'These worlds are the best atmosphere targets',n:['press'],d:'Bright hosts, deep transits and short periods mean many observations quickly. Ranking the category by transmission signal explains why the JWST results cluster here.',k:'UI',e:'S',i:2},
);

/* -------------------------------------------------------------- giant -- */
add(
{c:'giant',t:'Twenty-one worlds are getting a heightfield they should not have',n:['press'],d:'`templateFor()` maps the whole category onto `byId("vermis")` — a silicate world with megafauna. Most of the mass in the catalogue has no surface, and the geology, hydrology and biosphere all assume one.',k:'ENG',e:'L',i:3},
{c:'giant',t:'A pressure-level substrate instead of a surface',n:['press'],d:'Run the simulation on an isobar and reinterpret `h` as depth into the envelope. The worlds backlog already specifies this; it is the change that makes the giants representable at all.',k:'ENG',e:'L',i:3},
{c:'giant',t:'Radii belong in Jupiter units as well as Earth',n:['rm'],d:'1 R_J = 11.21 R⊕. Reporting WASP-17 b as 21.5 R⊕ is correct and unreadable; 1.92 R_J is what the literature uses.',k:'UI',e:'S',i:3},
{c:'giant',t:'Brown dwarfs are radius-degenerate',n:['rm'],d:'From roughly 1 to 80 M_J the radius barely changes. KELT-1 b at 27 M_J is Jupiter-sized, which is why mass and not radius defines where a planet stops.',k:'DATA',e:'S',i:2},
{c:'giant',t:'KELT-9 b is hotter than most stars',n:['teq'],d:'A dayside near 4,600 K around a 10,170 K A0 host, at roughly 44,000 S⊕. H₂ dissociates on the day side and recombines on the night, carrying enormous energy across the terminator.',k:'DATA',e:'S',i:3},
{c:'giant',t:'WASP-76 b rains iron',n:['volat'],d:'Fe vaporised on the dayside condensing as it crosses the evening terminator, detected as an asymmetric absorption signal. A condensation cycle in a metal.',k:'DATA',e:'S',i:3},
{c:'giant',t:'WASP-17 b has quartz clouds',n:['press'],d:'JWST identified silica nanocrystals — a cloud species with no terrestrial analogue. Which species condenses follows from temperature and composition, and this is the proof.',k:'DATA',e:'S',i:2},
{c:'giant',t:'TrES-2 b reflects under 1% of its light',n:['record'],d:'The darkest known planet, darker than coal, and nobody fully knows why. Geometric albedo as data rather than an assumed 0.3.',k:'DATA',e:'S',i:2},
{c:'giant',t:'WASP-12 b is being destroyed on a measured schedule',n:['elements'],d:'Orbital decay of order 29 milliseconds per year, plus a carbon-rich composition and an albedo under 0.1. A world with a computable expiry date.',k:'DATA',e:'S',i:3},
{c:'giant',t:'WASP-17 b orbits backwards',n:['elements'],d:'A retrograde orbit is direct evidence that hot Jupiters can arrive by scattering rather than by disk migration. WASP-33 b and HAT-P-11 b are nearly polar for the same reason.',k:'DATA',e:'S',i:2},
{c:'giant',t:'Kepler-7 b has a density of 0.17 g/cm³',n:['rm'],d:'And the first cloud map derived from a phase-curve offset. Two facts that between them justify the whole category having real parameters.',k:'DATA',e:'S',i:2},
{c:'giant',t:'GJ 436 b and GJ 3470 b are evaporating, observably',n:['retain'],d:'A comet-like hydrogen tail on one, escaping helium in a metastable line on the other. Direct measurements of a process the escape model should be running.',k:'DATA',e:'S',i:3},
{c:'giant',t:'GJ 1214 b resolved from flat to hazy',n:['press'],d:'A decade of featureless spectra, then a JWST phase curve showing a metal-rich, hazy atmosphere with strong day–night contrast. The archetypal sub-Neptune, finally characterised.',k:'DATA',e:'S',i:3},
{c:'giant',t:'K2-18 b is a hycean candidate and the DMS claim is contested',n:['contested'],d:'CH₄ and CO₂ are detected and consistent with a hydrogen envelope over an ocean. The dimethyl sulphide claim does not have consensus and must ship flagged.',k:'DATA',e:'S',i:3},
{c:'giant',t:'LTT 9779 b is a reflective world in the Neptune desert',n:['press'],d:'A geometric albedo near 0.8 from metallic clouds, at roughly 2,000 K, where no Neptune should have survived. A row that contradicts the population it sits in.',k:'DATA',e:'S',i:2},
);

/* --------------------------------------------------------------- arch -- */
add(
{c:'arch',t:'The system is the object here',n:['system'],d:'HR 8799’s four planets, Kepler-90’s eight, Kepler-11’s six inside Venus’s orbit. This category is about architecture, and there is currently nowhere to store a system.',k:'ENG',e:'M',i:3},
{c:'arch',t:'Imaged masses are model-dependent',n:['tier'],d:'HR 8799 and beta Pic b masses come from evolutionary models given an assumed age and formation history — hot start or cold start changes the answer substantially. Not a measurement in the sense a transit radius is.',k:'DATA',e:'S',i:3},
{c:'arch',t:'Age is the defining parameter of this category',n:['host'],d:'V1298 Tau at ~23 Myr, K2-33 b at ~10, HR 8799 at ~30, beta Pic at ~23. Everything about these worlds — radius, luminosity, temperature — is a function of how recently they formed.',k:'DATA',e:'S',i:3},
{c:'arch',t:'Young giants are still glowing from formation',n:['teq'],d:'Their luminosity is internal, not reflected, which is why they can be imaged at all. Insolation is a minor term in their energy budget.',k:'ENG',e:'M',i:3},
{c:'arch',t:'Young planets are inflated and will shrink',n:['rm'],d:'V1298 Tau’s planets will contract substantially over the next few hundred Myr. Radius as a function of age is directly observable across this category.',k:'ENG',e:'M',i:2},
{c:'arch',t:'beta Pic b has a measured rotation rate',n:['elements'],d:'About 25 km/s at the equator from spectroscopy — a directly observed exoplanet day length, roughly 8 hours. One of very few real spin measurements anywhere in the catalogue.',k:'DATA',e:'S',i:3},
{c:'arch',t:'HR 8799 has an orbital movie',n:['system'],d:'Two decades of imaging show four planets visibly moving. It is the only system where the orrery view would be showing something people have actually watched.',k:'DATA',e:'S',i:3},
{c:'arch',t:'Wide orbits mean periods in millennia',n:['elements'],d:'HD 106906 b at 738 AU, HIP 65426 b at 92, HR 8799 e at 16. Orbital periods of thousands to hundreds of thousands of years change what the time controls mean.',k:'DATA',e:'S',i:2},
{c:'arch',t:'Debris disks are part of the system',n:['system'],d:'beta Pic and AU Mic are both imaged inside their disks, and HD 106906 b sits outside a warped one. The disk is evidence about the planet’s history and there is nowhere to record it.',k:'DATA',e:'M',i:2},
{c:'arch',t:'Extreme eccentricity is a climate regime',n:['elements'],d:'HD 20782 b at e = 0.95, HD 80606 b at 0.93 — which swings from about 800 K to 1,500 K in six hours at periastron. The atmosphere cannot equilibrate, and the model has never been asked to try.',k:'ENG',e:'M',i:3},
{c:'arch',t:'Kepler-11 packs six planets inside Venus’s orbit',n:['system'],d:'Tightly packed and dynamically full, with masses from transit-timing variations. It is the strongest argument that our own architecture is not typical.',k:'DATA',e:'S',i:3},
{c:'arch',t:'Kepler-444 is 11.2 Gyr old',n:['host'],d:'Five sub-Earths around a star almost as old as the galaxy, at low metallicity. It sets the earliest date at which rocky planets existed at all.',k:'DATA',e:'S',i:3},
{c:'arch',t:'The Kepler-1625 b exomoon is contested',n:['contested'],d:'A Neptune-sized moon candidate that later analyses have questioned. It should ship flagged, and it is the only exomoon claim in the catalogue.',k:'DATA',e:'S',i:2},
{c:'arch',t:'51 Eri b has methane and looks Jupiter-like',n:['press'],d:'Rather than the hot, cloudy spectra of most imaged planets. It is the closest thing in the imaged sample to a mature giant.',k:'DATA',e:'S',i:2},
);

/* --------------------------------------------------------------- dark -- */
add(
{c:'dark',t:'Six of these worlds have no host at all',n:['host'],d:'PSO J318.5-22, WISE 0855, OTS 44, SIMP J0136, and the microlensing free-floaters. Insolation is exactly zero, and `templateFor()` currently hands them Terra or Selene.',k:'ENG',e:'M',i:3},
{c:'dark',t:'Free-floaters have weather with no star',n:['press'],d:'PSO J318.5-22 varies in brightness from patchy silicate clouds and SIMP J0136 rotates in 2.4 hours with strong variability. Cloud bands on an object nothing is illuminating.',k:'DATA',e:'S',i:3},
{c:'dark',t:'WISE 0855 is colder than most planets here',n:['teq'],d:'About 250 K, at 2.2 pc, with water-ice clouds. A brown dwarf cooler than Earth’s tropics, and a useful reminder that the categories are about origin, not temperature.',k:'DATA',e:'S',i:3},
{c:'dark',t:'Circumbinary planets see two suns',n:['system'],d:'Kepler-16 b, Kepler-47 c, Kepler-1647 b, TOI-1338 b. Two insolation terms, two shadows, and a habitable zone that is an annulus rather than a band.',k:'ENG',e:'M',i:3},
{c:'dark',t:'The Kepler-16 flux beats',n:['system'],d:'The two stars orbit each other in 41 days inside the planet’s 229-day year, so the received flux beats rather than varying smoothly. A forcing signal with no Solar System analogue.',k:'ENG',e:'M',i:2},
{c:'dark',t:'Circumbinary orbits have a stability radius',n:['elements'],d:'Inside a critical distance no stable orbit exists, and Kepler-16 b sits just outside it. The genesis toolkit should enforce that boundary rather than allow anything.',k:'ENG',e:'M',i:2},
{c:'dark',t:'Pulsar planets are heated by particles',n:['host'],d:'PSR B1257+12 b, c and d receive relativistic particle wind and X-rays, not light. Albedo is meaningless and the energy budget needs its own path through the atmosphere tick.',k:'ENG',e:'M',i:2},
{c:'dark',t:'The first exoplanets ever confirmed were these',n:['record'],d:'PSR B1257+12, 1992, three years before 51 Peg b. Masses of 0.02, 4.3 and 3.9 M⊕ — and two of them are still among the lowest-mass planets known.',k:'DATA',e:'S',i:3},
{c:'dark',t:'PSR B1620-26 b is 12.7 Gyr old',n:['host'],d:'In the globular cluster M4, orbiting a pulsar–white dwarf binary. It sets the upper bound on how long a planet can survive anywhere.',k:'DATA',e:'S',i:2},
{c:'dark',t:'The diamond planet is a stripped white dwarf core',n:['rm'],d:'PSR J1719-1438 b at roughly 23 g/cm³ of degenerate carbon, on a 2.2-hour orbit. The densest object in the catalogue by an enormous margin and a real test of the density code.',k:'DATA',e:'S',i:2},
{c:'dark',t:'The KOI-55 planets may not exist',n:['contested'],d:'Two candidates around a subdwarf B star, inferred from pulsation timing, and plausibly artefacts of the star itself. A row that should ship visibly disputed.',k:'DATA',e:'S',i:3},
{c:'dark',t:'WD 1856+534 b transits a white dwarf every 34 hours',n:['host'],d:'A Jupiter-sized planet around an Earth-sized star at S ≈ 0.18. It either survived the red giant phase or arrived afterwards, and both are hard to explain.',k:'DATA',e:'S',i:3},
{c:'dark',t:'WD J0914+1914 is eating its planet',n:['retain'],d:'A white dwarf accreting hydrogen, oxygen and sulphur from an evaporating giant. The only known case of planetary destruction observed in progress.',k:'DATA',e:'S',i:3},
{c:'dark',t:'2M1207 b was the first planet ever imaged',n:['record'],d:'2004, orbiting a 25-Jupiter-mass brown dwarf at 41 AU, and underluminous for its temperature in a way still argued about. A historic row with an unresolved problem in it.',k:'DATA',e:'S',i:3},
{c:'dark',t:'Some microlensing rows cannot be resolved, ever',n:['gap'],d:'MOA-2011-BLG-262L b is either a moon of a free-floating giant or a planet of a brown dwarf, and the degeneracy is irreducible. The event happened once and will not repeat.',k:'DATA',e:'S',i:3},
{c:'dark',t:'This category is the test that the model is physics',n:['insol'],d:'Set insolation to zero, replace photons with particles, give a world two stars or none. If the climate code still produces something coherent, it is a model; if it only works at S ≈ 1, it is a fit.',k:'ENG',e:'M',i:3},
);

/* == INSERT MORE CATEGORIES ABOVE == */

/* ------------------------------------------------------------- derive -- */
// Pins are generated before the category blocks, so sort into document order
// first and only then number — otherwise ids jump around inside a section.
const CAT_ORDER = new Map(CATS.map(([id], i) => [id, i]));
D.sort((a, b) => (CAT_ORDER.get(a.c) ?? 99) - (CAT_ORDER.get(b.c) ?? 99));
D.forEach((x, i) => { x.id = i + 1; });

const byCat = (id) => D.filter((x) => x.c === id);
const count = (f) => D.filter(f).length;
const KIND = { DATA: 'Data', ENG: 'Engine', UI: 'Panel' };
const md = (t) => String(t).replace(/\|/g, '\\|');

const provides = new Map();
for (const x of D) if (x.g) provides.set(x.g, x);
const dependents = (tok) => D.filter((y) => (y.n || []).includes(tok)).length;
const CRITICAL = [...provides.keys()]
  .map((k) => ({ k, x: provides.get(k), n: dependents(k) }))
  .filter((r) => r.n > 0)
  .sort((a, b) => b.n - a.n);

const NOW = [
  ['The catalogue is a backlog, not a dataset', 'A `CATALOGUE` BODY entry is `{ id, c, k, t, d, e, i, b, s, p }` — a title, a description, an effort, an impact, a body name and a list of capability tokens. There is not one radius, mass, semi-major axis, period, eccentricity, insolation or stellar temperature anywhere in it. All 120 worlds are described and none is specified.'],
  ['Worlds are chosen by string matching', '`templateFor()` picks one of five hand-authored rulesets from `item.c` plus regexes on the name — `if (name.includes("venus")) return byId("ares")`. `applyNeeds()` then layers tag-driven constants on top. A world is whatever a chain of `if` statements decides it is.'],
  ['And the string matching has a typo in it', '`starFromCatalogueItem` tests `/trapist|proxima|gj |gliese/` — TRAPPIST with one P. It never matches on name. TRAPPIST-1 e gets an M8 host only because it separately carries the `ucd` token, and any world relying on that branch by name silently falls through to a generic 5,200 K star.'],
  ['Five templates for a hundred and twenty worlds', 'Terra, Vermis, Selene, Ares and Daisyworld. Twenty-one giants map onto Vermis — a silicate world with megafauna — and get a heightfield. Fifteen moons map onto Selene with a colour tint and a `solar` between 0.08 and 0.35.'],
  ['Interiors are matched by name too', '`interiorProfileFor()` regexes the name against eleven hand-written `INTERIORS` profiles, then falls back to `coreMass = 0.12 + gravity * 0.12`. Real interior structure follows from mass, radius and therefore density — two numbers the archive reports for most transiting planets.'],
  ['Nothing is derived from anything', 'Insolation should be L★/a². Equilibrium temperature should follow from insolation and albedo. Surface gravity should follow from mass and radius. Escape velocity should decide whether an atmosphere exists. Every one of those is currently an authored constant, so changing one changes nothing else.'],
  ['The panels give every world the same controls', '`climatePanel` offers a Day slider from 15 to 800 — 0.15× to 8× Earth — and a Tilt slider from 0 to 90°, identically for Venus, TRAPPIST-1 e and Jupiter. Venus rotates backwards in 243 days; TRAPPIST-1 e is tidally locked and has no tilt to set.'],
  ['There is no uncertainty anywhere', 'Every value in the model is exact. Real exoplanet parameters come with asymmetric error bars, upper limits, and a `pl_bmassprov` column saying whether a mass is a mass at all. About a quarter of the temperate category is minimum masses being read as masses.'],
  ['Contested results look identical to settled ones', 'Kapteyn b was retracted. tau Ceti f is disputed. The KOI-55 planets may be pulsation artefacts. The K2-18 b DMS claim is contested, and the Venus phosphine result largely refuted. The catalogue shows all of them exactly as it shows Earth.'],
  ['The good news is that the writing is already there', 'The 120 body entries contain genuinely good prose about why each world matters, and `scripts/worlds.mjs` already generates `vr/catalogue.js`. The data layer slots in beside the text, through a generator that already exists, on a convention the repo already runs on.'],
];

const SEQ = [
  ['Define the record, then invert the dependency', '`record` and `tier` first, then make the world record authoritative and generate rulesets from it rather than bending five templates into 120 worlds. Nothing else in this document is buildable while `templateFor()` is the source of truth.'],
  ['Turn on the pipeline', '`fetch`. The archive query is already documented in the README and nothing runs it. A committed snapshot with a query date, a coverage report, and a diff on refresh — after which adding a world is a data change rather than a code change.'],
  ['Derive instead of authoring', '`insol`, `teq`, `grav`, `escape`. Insolation from L★/a², equilibrium temperature from insolation and albedo, gravity from mass and radius, atmospheric retention from escape velocity against integrated XUV. Four short functions that between them replace most of `applyNeeds()`.'],
  ['Then fill the table', 'The 120 pin items. They are individually small and collectively the point — and the `WORLDS` seed table in this generator is a starting draft for about a third of them.'],
  ['Then make the panels tell the truth', '`unit` and per-world ranges. A Day slider that knows Venus is retrograde, a Tilt control that disables itself on a locked world, and every readout in units with an error bar. This is where the work becomes visible to somebody who is not reading the code.'],
];

/* ------------------------------------------------------------ markdown -- */
function markdown() {
  const L = [];
  L.push('# ORRERY — real parameters for every world');
  L.push('');
  L.push(`**${D.length} items.** Generated from \`scripts/exoparams.mjs\` — edit that file, not this one, then run \`node scripts/exoparams.mjs\`.`);
  L.push('');
  L.push('The catalogue names 120 real bodies and specifies none of them. This is the route from string-matching to a measured parameter table — and the generator itself carries a seed of that table, because the cheapest way to specify it is to write it.');
  L.push('');
  L.push(`Kind: **${count((x) => x.k === 'DATA')}** data, **${count((x) => x.k === 'ENG')}** engine, **${count((x) => x.k === 'UI')}** panel. Effort is S/M/L. Impact is 1–3.`);
  L.push('');
  L.push('> Every figure quoted below is the current consensus value where consensus exists, and is flagged as contested where it does not. Values in the seed table should be checked against the NASA Exoplanet Archive `pscomppars` table before being treated as authoritative.');
  L.push('');

  L.push('## Where the catalogue actually is');
  L.push('');
  for (const [a, b] of NOW) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## The critical path');
  L.push('');
  L.push('| Capability | Item | Unblocks |');
  L.push('|---|---|---|');
  for (const r of CRITICAL.slice(0, 14)) {
    L.push(`| \`${r.k}\` | ${r.x.id}. ${md(r.x.t)} | ${r.n} items |`);
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
      L.push(`| ${x.id} | **${md(x.t)}**${gives}${needs} | ${md(x.d)} | ${KIND[x.k]} | ${x.e} | ${x.i} |`);
    }
    L.push('');
  }

  L.push('## Sequencing');
  L.push('');
  SEQ.forEach(([a, b], i) => L.push(`${i + 1}. **${a}.** ${b}`));
  L.push('');
  return L.join('\n');
}

/* ----------------------------------------------------------------- html -- */
function html() {
  const data = JSON.stringify(D.map((x) => ({
    id: x.id, c: x.c, t: x.t, d: x.d, k: x.k, e: x.e, i: x.i, g: x.g || '', n: x.n || [],
  })));
  const cats = JSON.stringify(CATS.map(([id, name, blurb]) => ({ id, name, blurb })));
  const crit = JSON.stringify(CRITICAL.slice(0, 14).map((r) => ({ k: r.k, id: r.x.id, t: r.x.t, n: r.n })));
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ORRERY — real parameters for every world</title>
<style>
:root{
  --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#c8b56f; --accent-soft:rgba(200,181,111,.13); --accent-line:rgba(200,181,111,.34);
  --data:#8fce7a; --data-soft:rgba(143,206,122,.14);
  --eng:#7fb0e0; --eng-soft:rgba(127,176,224,.14);
  --sans:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
}
@media (prefers-color-scheme: light){
  :root{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
    --text:#12151c; --dim:#4e5768; --faint:#727d90;
    --accent:#7a6416; --accent-soft:rgba(122,100,22,.09); --accent-line:rgba(122,100,22,.3);
    --data:#3d7a2c; --data-soft:rgba(61,122,44,.09); --eng:#215e93; --eng-soft:rgba(33,94,147,.09); }
}
:root[data-theme="dark"]{ --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#c8b56f; --accent-soft:rgba(200,181,111,.13); --accent-line:rgba(200,181,111,.34);
  --data:#8fce7a; --data-soft:rgba(143,206,122,.14); --eng:#7fb0e0; --eng-soft:rgba(127,176,224,.14); }
:root[data-theme="light"]{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
  --text:#12151c; --dim:#4e5768; --faint:#727d90;
  --accent:#7a6416; --accent-soft:rgba(122,100,22,.09); --accent-line:rgba(122,100,22,.3);
  --data:#3d7a2c; --data-soft:rgba(61,122,44,.09); --eng:#215e93; --eng-soft:rgba(33,94,147,.09); }

*{box-sizing:border-box;}
body{margin:0; background:var(--ground); color:var(--text);
     font:400 16px/1.6 var(--sans); -webkit-font-smoothing:antialiased;}
.wrap{max-width:1080px; margin:0 auto; padding:40px 26px 110px;}
header{border-bottom:1px solid var(--rule); padding-bottom:28px;}
.eyebrow{font:500 10.5px/1 var(--mono); letter-spacing:.24em; text-transform:uppercase; color:var(--accent);}
h1{font:700 clamp(32px,5vw,50px)/1.04 var(--sans); letter-spacing:-.035em; margin:15px 0 0; text-wrap:balance;}
.sub{font:italic 400 clamp(17px,2.2vw,21px)/1.45 var(--serif); color:var(--dim); margin:18px 0 0; max-width:52ch;}
.nav{margin-top:20px; font:400 12.5px/1.7 var(--mono); color:var(--faint);}
.nav a{color:var(--dim); text-decoration:none; border-bottom:1px solid var(--rule);}
.nav a:hover{color:var(--accent); border-color:var(--accent-line);}
.tally{display:grid; grid-template-columns:repeat(auto-fit,minmax(126px,1fr)); gap:1px;
       background:var(--rule); border:1px solid var(--rule); border-radius:8px; overflow:hidden; margin-top:26px;}
.tally > div{background:var(--panel); padding:13px 15px;}
.tally dt{font:500 9.5px/1 var(--mono); letter-spacing:.15em; text-transform:uppercase; color:var(--faint);}
.tally dd{margin:9px 0 0; font:600 26px/1 var(--sans); letter-spacing:-.02em; font-variant-numeric:tabular-nums;}
.tally dd small{display:block; font:400 11px/1.5 var(--mono); color:var(--faint); margin-top:6px; letter-spacing:0;}
.prose{margin-top:40px;}
.prose h2{font:650 21px/1.2 var(--sans); letter-spacing:-.022em; margin:0 0 12px;
          border-bottom:1px solid var(--rule); padding-bottom:10px;}
.prose p{color:var(--dim); max-width:74ch; font-size:14.5px;}
.caveat{margin-top:18px; padding:14px 16px; background:var(--panel); border:1px solid var(--rule);
        border-left:2px solid var(--accent); border-radius:0 7px 7px 0; color:var(--dim); font-size:13.5px; max-width:74ch;}
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
.flabel{font:500 9.5px/1 var(--mono); letter-spacing:.17em; text-transform:uppercase; color:var(--faint); margin-right:3px;}
button.f{font:500 11.5px/1 var(--mono); color:var(--dim); cursor:pointer; background:transparent;
         border:1px solid var(--rule); border-radius:5px; padding:7px 10px;}
button.f:hover{border-color:var(--accent-line); color:var(--text);}
button.f[aria-pressed="true"]{background:var(--accent-soft); border-color:var(--accent-line); color:var(--accent);}
button.f.data[aria-pressed="true"]{background:var(--data-soft); border-color:var(--data); color:var(--data);}
button.f.eng[aria-pressed="true"]{background:var(--eng-soft); border-color:var(--eng); color:var(--eng);}
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
   grid-template-columns:44px minmax(0,1fr) auto; gap:4px 14px; align-items:baseline;}
li .id{font:500 11px/1.5 var(--mono); color:var(--faint); font-variant-numeric:tabular-nums;}
li .t{font:600 14.5px/1.4 var(--sans); letter-spacing:-.008em;}
li .d{grid-column:2; color:var(--dim); font-size:13.5px; line-height:1.55; max-width:76ch;}
li .dep{grid-column:2; font:400 11px/1.6 var(--mono); color:var(--faint); margin-top:4px;}
li .dep .gives{color:var(--accent);}
li .tags{display:flex; gap:5px; align-items:center; grid-row:1; grid-column:3;}
.tag{font:600 9px/1 var(--mono); letter-spacing:.1em; text-transform:uppercase;
     padding:4px 6px; border-radius:3px; white-space:nowrap; border:1px solid transparent;}
.tag.data{background:var(--data-soft); color:var(--data); border-color:var(--data);}
.tag.eng{background:var(--eng-soft); color:var(--eng); border-color:var(--eng);}
.tag.ui{background:transparent; color:var(--dim); border-color:var(--rule);}
.tag.e{background:transparent; color:var(--faint); border-color:var(--rule);}
.dots{display:inline-flex; gap:2px;}
.dots i{width:5px; height:5px; border-radius:50%; background:var(--rule); display:block;}
.dots i.on{background:var(--accent);}
.empty{padding:44px 16px; text-align:center; color:var(--faint); font:400 13.5px/1.6 var(--mono);}
:focus-visible{outline:2px solid var(--accent); outline-offset:2px; border-radius:4px;}
footer{margin-top:64px; padding-top:22px; border-top:1px solid var(--rule);
       font:400 12px/1.7 var(--mono); color:var(--faint);}
@media (max-width:640px){
  li.item{grid-template-columns:34px minmax(0,1fr);}
  li .tags{grid-row:auto; grid-column:2; margin-top:7px;}
}
@media (prefers-reduced-motion: reduce){ *{transition:none !important;} }
</style>
<link rel="stylesheet" href="doc-responsive.css">

<div class="wrap">
<header>
  <div class="eyebrow">Deep dive · 500 items</div>
  <h1>Real parameters for every world</h1>
  <p class="sub">The catalogue names 120 real bodies and specifies none of them. Every playable
  world is chosen by string-matching a name against five hand-authored templates — and the
  regex that picks TRAPPIST-1’s host star spells TRAPPIST with one P.</p>
  <p class="nav"><a href="./">Pitch</a> · <a href="backlog.html">Systems</a> ·
  <a href="worlds.html">Worlds</a> · <a href="evolution.html">Evolution</a> ·
  <a href="godgame.html">God layer</a> · <a href="next.html">Next 200</a> ·
  <a href="tides-weather.html">Tides &amp; weather</a> · <a href="geology.html">Geology</a> ·
  <a href="living.html">Alive</a> · <a href="currents.html">Currents</a> · <a href="../vr/">Prototype</a></p>
  <dl class="tally">
    <div><dt>Items</dt><dd>500<small>18 categories</small></dd></div>
    <div><dt>Bodies</dt><dd>120<small>each pinned</small></dd></div>
    <div><dt>Kind</dt><dd>${count((x) => x.k === 'DATA')}/${count((x) => x.k === 'ENG')}/${count((x) => x.k === 'UI')}<small>data · engine · panel</small></dd></div>
    <div><dt>Effort</dt><dd>${count((x) => x.e === 'S')}/${count((x) => x.e === 'M')}/${count((x) => x.e === 'L')}<small>S / M / L</small></dd></div>
  </dl>
</header>

<div class="prose">
  <h2>Where the catalogue actually is</h2>
  <ul class="state" id="now"></ul>
  <p class="caveat"><b>On the figures.</b> Every value quoted is the current consensus where
  consensus exists, and flagged as contested where it does not. The seed parameter table lives in
  <code>scripts/exoparams.mjs</code> and was assembled by hand — it is a starting draft, and item
  <b>“Cross-check the seed table”</b> exists because it certainly contains errors. Check against the
  NASA Exoplanet Archive <code>pscomppars</code> table before treating anything here as authoritative.</p>

  <h2 style="margin-top:40px">The critical path</h2>
  <table class="crit"><tbody id="crit"></tbody></table>
</div>

<div class="controls">
  <div class="filters">
    <span class="flabel">Kind</span>
    <button class="f data" data-k="k" data-v="DATA" aria-pressed="false">Data</button>
    <button class="f eng" data-k="k" data-v="ENG" aria-pressed="false">Engine</button>
    <button class="f" data-k="k" data-v="UI" aria-pressed="false">Panel</button>
    <span class="flabel" style="margin-left:9px">Effort</span>
    <button class="f" data-k="e" data-v="S" aria-pressed="false">S</button>
    <button class="f" data-k="e" data-v="M" aria-pressed="false">M</button>
    <button class="f" data-k="e" data-v="L" aria-pressed="false">L</button>
    <span class="flabel" style="margin-left:9px">Impact</span>
    <button class="f" data-k="i" data-v="3" aria-pressed="false">3</button>
    <button class="f" data-k="i" data-v="2" aria-pressed="false">2</button>
    <button class="f" data-k="i" data-v="1" aria-pressed="false">1</button>
    <input id="q" type="search" placeholder="Search 500 items — try a planet name…" aria-label="Search items">
  </div>
  <div class="tally2" id="shown"></div>
</div>

<div id="list"></div>

<div class="prose" style="margin-top:56px">
  <h2>Sequencing</h2>
  <ol class="seq" id="seq"></ol>
</div>

<footer>
  Generated from <code>scripts/exoparams.mjs</code> — edit the source and re-run, do not edit the output.<br>
  Parameter figures from the NASA Exoplanet Archive and mission publications; Solar System values from JPL.
</footer>
</div>

<script>
"use strict";
var DATA = ${data};
var CATS = ${cats};
var CRIT = ${crit};
var NOW = ${JSON.stringify(NOW)};
var SEQ = ${JSON.stringify(SEQ)};
var KLABEL = {DATA:'Data', ENG:'Engine', UI:'Panel'};
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
      var cls = o.k === 'DATA' ? 'data' : o.k === 'ENG' ? 'eng' : 'ui';
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

/* ------------------------------------------- emit worldParams module -- */
function worldParamsModule() {
  const rows = WORLDS.map((w) => {
    const o = { b: w.b, c: w.c, r: w.r, m: w.m, a: w.a, P: w.P, e: w.e, obl: w.obl, rot: w.rot, S: w.S, teq: w.teq, teff: w.teff };
    if (w.note) o.note = w.note;
    return o;
  });
  return `/** AUTO-GENERATED by scripts/exoparams.mjs — do not edit.
 *  Seed parameter table for ${rows.length} catalogue bodies.
 *  Cross-check against NASA Exoplanet Archive pscomppars before treating as authoritative.
 *  Schema consumed by vr/sim/worldRecord.js → catalogue-rules.js.
 */
export const SEED_DATE = ${JSON.stringify(new Date().toISOString().slice(0, 10))};
export const SEED_SOURCE = 'scripts/exoparams.mjs WORLDS hand table';
export const SEED_WORLDS = ${JSON.stringify(rows, null, 0)};

/** Lookup by exact display name (item.b). */
export function seedByName(name) {
  if (!name) return null;
  return SEED_WORLDS.find((w) => w.b === name) || null;
}

/** Fuzzy match — catalogue BODY names sometimes differ slightly from seed keys. */
export function seedForCatalogueItem(item) {
  if (!item) return null;
  const b = item.b || '';
  const hit = seedByName(b);
  if (hit) return hit;
  const low = b.toLowerCase();
  return SEED_WORLDS.find((w) => {
    const wb = w.b.toLowerCase();
    return wb === low || wb.startsWith(low) || low.startsWith(wb.split(/[/,]/)[0].trim());
  }) || null;
}
`;
}

/* ----------------------------------------------------------------- emit -- */
await mkdir(join(ROOT, 'briefs'), { recursive: true });
await mkdir(join(ROOT, 'site'), { recursive: true });
await mkdir(join(ROOT, 'vr'), { recursive: true });
await writeFile(join(ROOT, 'briefs', 'exoparams-backlog.md'), markdown() + '\n');
await writeFile(join(ROOT, 'site', 'exoparams.html'), html());
await writeFile(join(ROOT, 'vr', 'worldParams.js'), worldParamsModule());

console.log(`exoparams: ${D.length} items across ${CATS.length} categories`);
for (const [id, name] of CATS) console.log(`  ${String(byCat(id).length).padStart(4)}  ${name}`);
console.log(`\nseed table: ${WORLDS.length} bodies with parameters`);
console.log(`kind     data ${count((x) => x.k === 'DATA')} · engine ${count((x) => x.k === 'ENG')} · panel ${count((x) => x.k === 'UI')}`);
console.log(`effort   S ${count((x) => x.e === 'S')} · M ${count((x) => x.e === 'M')} · L ${count((x) => x.e === 'L')}`);
console.log(`impact   3 ${count((x) => x.i === 3)} · 2 ${count((x) => x.i === 2)} · 1 ${count((x) => x.i === 1)}`);
console.log('\ncritical path:');
for (const r of CRITICAL.slice(0, 14)) {
  console.log(`  ${String(r.n).padStart(3)}  ${r.k.padEnd(11)} ${r.x.t}`);
}
const unmet = new Set();
for (const x of D) for (const t of x.n || []) if (!provides.has(t)) unmet.add(t);
if (unmet.size) console.log(`\nWARNING unmet tokens: ${[...unmet].join(', ')}`);
console.log('\nwrote briefs/exoparams-backlog.md, site/exoparams.html, vr/worldParams.js');
