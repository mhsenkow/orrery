#!/usr/bin/env node
// Single source of truth for the ORRERY world-space backlog.
// Emits  briefs/worldspace-backlog.md  and  site/worldspace.html.
//
//   node scripts/worldspace.mjs
//
// 400 items on the palette of worlds: what a world *is* in this engine, what it
// is made of, what happens when it has no surface, what its landforms should be,
// which moment in its history you are looking at, and what comes after life.
//
// Written by auditing planetKind, planetTerrain, iceshell, worldParams, the
// catalogue and the era presets against the running build. The headline number
// was measured, not estimated: resolving all 120 catalogue bodies through their
// real rulesets used to yield **40 Io**. The parametric fallbacks now require
// airless for Io and put magma before dust; seven axes are computed per world;
// the committed table is `vr/data/worlds/kinds.json`. This pass is closed.
// Remaining work is giants — not name-matching, and not
// "what is the surface made of". That table exists; the cycle is told which
// substance it is carrying. Landform grammar is a palette and an overlay;
// the twenty-seven stamps still own the heightfield. The column is a recipe
// plus per-cell thicknesses from the shell fields, not a saved stratigraphy.
//
// k:  MODEL = what the simulation computes
//     DRAW  = what reaches the screen
//     PROVE = the measurement, data or test that keeps it honest
// e:  effort S/M/L.  i: impact 1..3.
// g:  capability token this item provides.  n: tokens it needs first.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = [
  ['kind', 'A world\'s identity was a regex on its name',
    '`planetKind` still has named-body regexes for Solar System stamps (validation cases). Catalogue fallbacks are parametric via `worldAxes` interior. `auditCatalogueKinds` plus `vr/data/worlds/kinds.json` keep the old 40-Io result from coming back. Kind is cached once on the ruleset.'],
  ['axes', 'The axes a taxonomy would need are computed and starting to reach the sim',
    '`worldAxes` numbers seven axes per world. Dominant volatile gates the water cycle and picks substrate cover; gravity sets the relief ceiling on locked worlds; snow-line position scales volatile inventory; retention, spin–orbit and non-hydrostatic sit as extras.'],
  ['space', 'Worlds as points in a space, and the space\'s empty regions',
    'Seven axes — surface gravity, volatile inventory, dominant volatile, interior state, insolation, age, resurfacing rate — define a space in which Mercury, an ocean world, Pluto and Saturn are regions rather than special cases. The catalogue occupies a thin shell of it because the catalogue is the worlds humanity has found, which is a selection effect, not a census. The gaps are the interesting part and nothing in the product can currently point at one.'],
  ['matter', 'The surface is made of a substrate, not eight Earth rocks',
    '`vr/data/worlds/substrates.json` holds 24 materials compiled by `scripts/substrates.mjs`. `W.substrate` is a byte into that table. Earth still maps `W.rock` 0–7 onto the same slots; Pluto\'s basins are nitrogen ice over water-ice bedrock. `W.rock` is unchanged. Climate, diurnal swing, slope and save now read the row on non-Earth worlds.'],
  ['phase', 'Nothing melts, freezes, sublimates or condenses except water',
    'The engine has one volatile with a phase diagram. `phaseAt` looks it up; `hydroTick` is told which substance to carry (`cycleMaterial`). Liquid rain still needs `liquidWaterOk` (Earth water, Titan methane). CO₂ / N₂ run a frost/sublimation path and a pressure reservoir. Clathrate is a T/P store; ice VI is a one-number floor. A full latent-heat budget and a per-cell column are not this cut.'],
  ['column', 'There is no underneath',
    '`vr/data/worlds/columns.json` compiles to recipes. `columnAt` returns a stack with kilometre thicknesses: Europa ice over ocean over rock, the Moon regolith over megaregolith over crust, Titan organics over ice over ocean over ice VI. Earth stays silent so the golden core still reconstructs from `W.rock`. Not a saved per-cell array and not deposition history.'],
  ['nosurf', 'A gas giant is a sphere with everything set to zero',
    '`stampGas` is nine lines: `h[c] = 0`, `crust[c] = 0`, `age[c] = 0`, `seaLevel = 0`, `volcanoes = []`, `hotspots = []`. Then every downstream system that branches on `h[c] < seaLevel` gets `0 < 0`, which is false, so a gas giant is treated as a planet whose surface is entirely land at exactly sea level. **Twenty-one of the 120 catalogue bodies are in the `giant` category** and its own blurb says they "break the core assumption of the engine — that there is a heightfield", which is exactly right and is why nothing was built.'],
  ['jet', 'Banding that is actually banded',
    'The surface backlog\'s complaint is that a rocky world is striped by accident. A giant is striped on purpose, and the mechanism is different: zonal jets at a Rhines scale set by rotation rate and the deep heat flux, with alternating retrograde and prograde bands, long-lived vortices and no solid boundary to stop them. The data already knows this — Jupiter\'s own note in `SEED_WORLDS` reads "Banded at a Rhines scale set by a 9.9-hour day" — and the engine ignores it.'],
  ['deep', 'The depth axis, and the renderer contract it needs',
    'Every renderer path in the product assumes a radius derived from `h` and a camera that can approach a solid surface. A giant needs pressure as its vertical coordinate, cloud decks at levels rather than at elevations, and a descent that goes *into* the atmosphere and never lands. This is the biggest single break in the rendering contract and it is also the most spectacular thing this product could show.'],
  ['grammar', 'Twenty-seven hand-written functions, one per named body',
    '`planetTerrain.js` has sixteen `stamp*` functions and `iceshell.js` has eleven `paint*` functions — twenty-seven bodies with bespoke code. A compiled grammar now names the palette and paints `W.landform`. The heightfield is still those twenty-seven functions. Mercury\'s scarps are still `Math.sin(x * 7.5 + z * 4.2) * Math.cos(y * 5.5) > 0.62`.'],
  ['forms', 'The landforms themselves, and what makes each one',
    'Hollows, lobate scarps, sublimation pits, bladed terrain, paterae, chaos, double ridges, cryovolcanic domes, dune seas, methane lakes, karst, yardangs, pingos, spatter cones, salt polygons, wrinkle ridges, palimpsests. Each is a specific process acting on a specific material in a specific environment, each is recognisable in one frame, and the engine has approximations of maybe six.'],
  ['sig', 'Does the world look like itself?',
    'The test is a thumbnail: could someone who knows the Solar System name the body from one frame? Today, Mercury and the Moon are both grey cratered spheres, and lava worlds share a stamp. Temperate rocky worlds are no longer painted as Io; they look like tinted Earths, which is a different honesty problem (`generic` + Whittaker).'],
  ['epoch', 'An epoch is a start time, not a world',
    '`ERA_PRESETS` has five entries — present, origin, Cambrian, Permian, 10 ka — and `eraPatch` returns exactly `{ deepTime, startAgeGa }`. Nothing about the palette, the atmosphere, the biosphere state, the land configuration or the ice changes. `availableEras` returns `[]` for any world that is not `earthLike`, so no other body in the catalogue has a history you can visit at all.'],
  ['hist', 'A world is a trajectory, not a point',
    'Every body in the catalogue is a snapshot of something that has been moving through the world space for billions of years: Venus had oceans, Mars had rivers, Earth has been a snowball twice, Titan\'s methane is being destroyed faster than it is replaced. The engine models the present state of each and the transitions between states are where the physics is most interesting and most testable.'],
  ['techno', 'The technosphere is a float called build',
    '`W.build[c]` is a scalar, `settleCities` thresholds it into camp / village / town / city, a population comes out of one formula, and `cityLights` turns it into night lights. Thirty-five read sites. There is no energy use, no waste heat, no emissions, no resource extraction, no land use, no infrastructure, no orbital anything — and therefore no way for a civilisation to be a planetary process the way the biosphere is.'],
  ['mega', 'Engineering at planetary and system scale',
    'Once a technosphere has thermodynamics, the next states are reachable and each is a real proposal with real numbers: albedo modification, orbital shades, atmospheric processing, terraforming, orbital rings, statites, mass drivers, a Dyson swarm. They are also the only planetary processes in this whole product with an *intent* behind them, which makes them a different kind of object from tectonics.'],
  ['after', 'What comes after biology',
    'A future where computers take over is a legitimate planetary state with a distinctive signature: waste heat that shows in the thermal budget, a spectrum with no seasonal CO₂ cycle, a surface reorganised into structure rather than ecosystem, and a self-replication term that behaves like life and obeys different constraints. It is also the state most of this catalogue would be in if anything had ever got there.'],
  ['biome', 'Two axes and fifteen names, all Earth\'s',
    '`BIOMES` is fifteen strings and `classifyBiome` chooses between them on temperature and annual precipitation. That cannot separate a monsoon forest from a rainforest, a cold desert from a hot one, or limestone from granite — and the surface backlog\'s `fuzzybiome` makes the boundaries soft without adding a single new axis. Seasonality and substrate are the next two, and after them the biome list stops being a list of fourteen temperate-zone words.'],
  ['cover', 'What covers a world with no biology',
    '`usesWhittakerCover` returns true for earth, daisy and generic. Temperate catalogue worlds are now generic on purpose, so they *do* get biomes. Other bodies have a cover field: frost, dust, lag, tholin, sulfur, evaporite, rays, mats. Grain size and hemispheric albedo pins (Iapetus, Enceladus) are first-cut. GPGPU cover is not.'],
  ['proof', 'Make the palette data, and measure it',
    'Twenty-seven bespoke functions, twenty-six name regexes, eight rock types, five era presets and one build float are all code. The life pass showed the alternative: author the grammar as JSON, compile it with a validating script, and put the result under test. Nothing in this document is safe until a world\'s definition is data and a world\'s appearance is measured.'],
];

const P1 = [
/* ---------------------------------------------------------------- kind -- */
{c:'kind',t:'Twenty-eight of twenty-nine temperate worlds are rendered as Io',g:'kindaudit',d:'Landed. The fallback now requires `tidalHeat > 0.8` *and* `airless`. Temperate catalogue worlds resolve as `generic` and keep Whittaker cover. `auditCatalogueKinds` asserts `temperateIo === 0` against the live catalogue on every test run.',k:'MODEL',e:'S',i:3},
{c:'kind',t:'Seventeen of seventeen lava worlds are rendered as Mars',n:['kindaudit'],d:'Landed. `magmaOcean` and the furnace catalogue category beat the dust/Mars stamp. All 17 furnace bodies resolve as `magma` and hit `stampMagma`. `furnaceMars === 0`.',k:'MODEL',e:'S',i:3},
{c:'kind',t:'The identity test runs on a concatenated string',d:'`const name = \`${rule.id} ${rule.name} ${rule._catalogueItem?.b} ${rule._catalogueItem?.t}\`.toLowerCase()` and then 26 regexes run against it. Two of them already carry hand-written exclusions — `saturn` excludes eight moon names, `uranus` excludes six — because the approach collides with itself, and every new body is a chance for a new collision. Named Earth now keys off `b`/`name` so a blurb mentioning Earth cannot steal the stamp.',k:'MODEL',e:'S',i:3},
{c:'kind',t:'Kind should be derived from parameters, not from a label',g:'kindderive',n:['kindaudit'],d:'Partial. Unnamed bodies now take `worldAxes` interior: fluid → gas (sub-Neptunes), magma → magma, ice → europa only if cold, heatpipe + airless → Io. A temperate `iceshell` tag is no longer Europa. Named Solar System regexes remain as validation cases.',k:'MODEL',e:'M',i:3},
{c:'kind',t:'One kind cannot carry the information a world needs',n:['kindderive'],d:'`W._planetKind` is a single string consumed by the terrain stamp, the ice-shell painter, the cover model, the look table and the presentation layer. Those five want different distinctions: Europa and Enceladus share an ice shell and not a resurfacing rate; Mars and Titan share a dust cycle and nothing else.',k:'MODEL',e:'M',i:3},
{c:'kind',t:'Kind is computed twice and cached once',d:'Landed. `cachePlanetKind` writes `{ kind, why }` onto the ruleset; `generate` copies it to `W`; `applyPlanetLook`, `refinePlanetHypsometry` and `applyIceShell` read `kindOf` so look/stamp/shell agree. Earth\'s generate path now caches too.',k:'MODEL',e:'S',i:2},
{c:'kind',t:'Say which kind was chosen and why',n:['kindderive'],d:'Landed. `planetKindWhy` returns `{ kind, why }` onto `W._planetKind` / `W._planetKindWhy`. The world chip prints `kind (why)` so a misclassification is visible without the debugger.',k:'DRAW',e:'S',i:3},
{c:'kind',t:'A kind-resolution table, committed',n:['kindaudit'],d:'Landed. `vr/data/worlds/kinds.json` is regenerated by `scripts/worldspace.mjs`. Tests fail if live `auditCatalogueKinds` drifts from the committed counts.',k:'PROVE',e:'S',i:3},
{c:'kind',t:'`generic` is a rocky Earth in disguise',d:'Temperate catalogue worlds now *intentionally* resolve as `generic`, which `usesWhittakerCover` accepts, so they get Earth\'s biome model rather than Io\'s sulfur. That is the right cover until a non-Earth temperate cover exists — and it is still the least safe default for giants and dark worlds that also fall through to `generic`.',k:'MODEL',e:'S',i:3},
{c:'kind',t:'An unknown world should look unknown',n:['kindderive'],d:'The realism backlog\'s argument about honesty applies hardest here. When the parameters are not enough to decide, the product should say so and draw something deliberately provisional rather than confidently drawing Earth.',k:'DRAW',e:'M',i:3},
{c:'kind',t:'Kind should be able to change during a run',d:'A world that loses its atmosphere, freezes over, melts, or gets resurfaced has become a different kind of world. `_planetKind` is set once in `stampPlanet` and never revisited.',k:'MODEL',e:'M',i:2},
{c:'kind',t:'Moons are not small planets',d:'Fifteen catalogue bodies are moons. Their identity is set by their parent — tidal heat, eclipses, a magnetosphere they sit inside, a sky with a planet filling a third of it — and `MOON_PARENTS` exists in `exophysics.js` and reaches almost nothing.',k:'MODEL',e:'M',i:3},
{c:'kind',t:'Kind for a body that is not round',d:'Landed as a stated limit. `isNonHydrostatic` is copied onto the axes and the world chip prints `not round`. Phobos, Arrokoth and 67P are still cube-spheres — the engine has no irregular-body mesh. Do not draw a round comet and call it done; the flag is the honest part.',k:'PROVE',e:'S',i:2},
{c:'kind',t:'The five invented rulesets are still the spine',d:'`RULESETS` holds terra, vermis, selene, ares and daisy, and every catalogue world is a merge on top of one of them. Which base a world inherits is invisible and changes almost everything downstream.',k:'MODEL',e:'M',i:2},
{c:'kind',t:'Confidence as a first-class property of a world',d:'`param-coverage.json` records which parameters are measured. A world whose mass is measured and whose atmosphere is unknown should be a different *object* from one where both are known, not the same object with a footnote.',k:'PROVE',e:'M',i:3},
{c:'kind',t:'Group the catalogue by what a world is, not by how it was found',d:'The seven categories — sol, moons, temperate, furnace, giant, arch, dark — are discovery categories and press categories. A physical grouping cuts across all of them and would put Venus next to the hot sub-Neptunes it may actually resemble.',k:'DRAW',e:'M',i:2},
{c:'kind',t:'Two worlds with the same parameters should look the same',n:['kindderive'],d:'Partial. Earth\'s numbers under a false name resolve as habitable / H₂O / mobile / Whittaker, not Io. Kepler-452 b is not Io. The named `earth` stamp stays the calibration flag (`earthLike`); parametric Earth-twins are `generic` on purpose until a non-Earth temperate cover exists.',k:'PROVE',e:'M',i:3},
{c:'kind',t:'Retire the regexes one at a time',n:['kindderive'],d:'Twenty-six deletions, each one paired with a parametric rule and a check that the named body still resolves correctly. This is the same shape as the surface backlog\'s latitude-belt deletion project and it has the same failure mode if done without measurement.',k:'MODEL',e:'M',i:3},
{c:'kind',t:'Kind should not gate the biosphere',d:'`usesWhittakerCover(kind)` decides whether a world gets vegetation colour at all, from a set of three strings. Whether a world has a biosphere is a question the life model can answer and this one cannot.',k:'MODEL',e:'M',i:3},
{c:'kind',t:'The taxonomy is the interface to everything in this document',n:['kindderive'],d:'Substrate, landform grammar, cover model, palette, epoch set and technosphere availability are all per-world decisions, and every one of them currently keys off this string. Getting it right first makes the other nineteen categories tractable.',k:'MODEL',e:'M',i:3},

/* ---------------------------------------------------------------- axes -- */
{c:'axes',t:'Seven axes, named and computed',g:'worldaxes',d:'Landed. `vr/sim/worldAxes.js` computes gravity, volatile inventory, dominant volatile, interior, insolation, age and resurfacing once per ruleset. Four read the WorldRecord; volatiles, dominant volatile and crater-retention age are inferred and tagged invented/assumed. `W._worldAxes` is set at generate.',k:'MODEL',e:'L',i:3},
{c:'axes',t:'Volatile inventory as a real budget',g:'volatiles',n:['worldaxes'],d:'First cut. `volatiles` is an Earth-ocean scalar from envelope / airless / density-water / `totalWater`, tagged invented. Forming beyond `snowLineAu` (not moons) triples the inventory. Still not a per-species reservoir budget.',k:'MODEL',e:'L',i:3},
{c:'axes',t:'The dominant volatile decides the whole surface',n:['volatiles'],d:'Partial. `volatile` gates `liquidWaterOk` and picks substrate cover. `cycleMaterial` tells the hydro cycle which row to carry. Colour and ice stamps are still kind-keyed.',k:'MODEL',e:'M',i:3},
{c:'axes',t:'Interior state, computed rather than named',d:'Partial. `interiorState` maps envelope / radius-valley / r > 4 to fluid, teq > 1700 to magma, cold ice-shell tags to ice, and high tidal heat on an airless moon to heatpipe. Named-body regexes in `interiorProfileFor` still exist; Rayleigh-number thresholds do not.',k:'MODEL',e:'M',i:3},
{c:'axes',t:'Resurfacing rate as the axis that explains appearance',g:'resurf',n:['worldaxes'],d:'First cut. `resurface` is crater-retention age in Myr from interior + tidal heat + radiogenic heat, tagged invented. Io comes out much younger than the Moon. Volcanism, tectonics and impact flux as real rates are still missing.',k:'MODEL',e:'M',i:3},
{c:'axes',t:'Age as a real quantity with consequences',d:'Partial. Age is read from the host / record when present, else 4.6 Gyr for Earth and 5 Gyr tagged invented. `radiogenicHeat` and `integratedXuvDose` can now be fed a real number; SEED_WORLDS still has no age column.',k:'MODEL',e:'M',i:3},
{c:'axes',t:'Surface gravity reaches almost nothing',d:'Partial. `reliefFromGravity` is the relief ceiling on `gravityLocked` worlds through generate. Scale height and escape already live on the record. Wave height, dune spacing, crater size and living body size are still unwired.',k:'MODEL',e:'M',i:3},
{c:'axes',t:'Atmospheric retention as a computed outcome',d:'Partial. `retain` and `shoreline` sit on the axes extras. The chip prints `lost air` only for `measured-absent` (the Jeans sketch currently strips Titan, which is wrong, so it must not talk over a known atmosphere). Unmeasured atmospheres are not auto-stripped.',k:'MODEL',e:'M',i:3},
{c:'axes',t:'Composition from density is already there',d:'Landed as an input. `worldAxes` reads `composition.envelope` / `composition.water` to decide fluid vs rock and to scale volatile inventory. `stampSubstrate` reads the axes, not the mix fractions directly.',k:'MODEL',e:'S',i:3},
{c:'axes',t:'The axes need units and ranges stated',n:['worldaxes'],d:'Landed. `AXIS_SPEC` names unit, range, log/linear scale, and which end is which for each axis. `formatAxesLine` prints them.',k:'PROVE',e:'S',i:3},
{c:'axes',t:'Derived axes must say what they were derived from',n:['worldaxes'],d:'Landed. Each axis carries `tier` (measured / derived / assumed / invented) and `source`. Resurfacing and most volatile calls are invented on purpose.',k:'PROVE',e:'M',i:3},
{c:'axes',t:'Axis values should be visible on the world card',n:['worldaxes'],d:'Landed. The world chip title and `#axesline` in the land dock print the seven numbers with units plus the fingerprint.',k:'DRAW',e:'M',i:3},
{c:'axes',t:'Add the axes to the parameter table',n:['worldaxes'],d:'`scripts/exoparams.mjs` generates `worldParams.js` from a hand table plus the NASA archive. The three missing axes belong in that table with the same provenance discipline as the rest.',k:'PROVE',e:'M',i:3},
{c:'axes',t:'Magnetic field as a minor axis with real consequences',d:'Partial. `magnetosphere` is copied onto the axes extras from the dynamo already computed in `core.js`. It still gates atmospheric leak and aurora. Not a new derivation.',k:'MODEL',e:'M',i:2},
{c:'axes',t:'Obliquity and eccentricity are climate axes',d:'Both are in `SEED_WORLDS` for every body. Uranus at 97.8° and the eccentric worlds at e = 0.95 are the extreme tests of the seasonal machinery, and the seasonal machinery is written for Earth.',k:'MODEL',e:'M',i:3},
{c:'axes',t:'Rotation rate is the axis the atmosphere cares about most',d:'It sets the Coriolis parameter, the Rhines scale, the number of circulation cells and — on a giant — the entire band structure. `rot` is in the table for every body and reaches the model as a wind-speed multiplier.',k:'MODEL',e:'M',i:3},
{c:'axes',t:'Tidal state as an axis, not a boolean',d:'Partial. `spinOrbit` sits on the axes extras; 3:2 (Mercury) prints on the chip. `tidallyLocked` remains a flag for climate. A full resonance spectrum driving the seasonal machinery is still missing.',k:'MODEL',e:'M',i:3},
{c:'axes',t:'A world fingerprint',n:['worldaxes'],d:'Landed. Seven axes quantised into `g#v#XIS#A#R#` (e.g. Earth `g5v4WmS5A3R4`). Written onto `kinds.json` per body. Appearance does not yet key off it.',k:'MODEL',e:'M',i:2},
{c:'axes',t:'Which axes actually matter — measure it',n:['worldaxes'],d:'Vary each axis alone and measure how much the rendered world changes. An axis that changes nothing is either unwired or not an axis, and both are worth knowing before building on it.',k:'PROVE',e:'M',i:3},
{c:'axes',t:'Do not let a taxonomy become a lookup table',n:['worldaxes'],d:'The failure mode is quantising the axes into fifteen named types and switching on the name, which is where the engine already is. The axes must stay continuous and the appearance must be a continuous function of them.',k:'MODEL',e:'M',i:3},

/* --------------------------------------------------------------- space -- */
{c:'space',t:'Draw the world space',g:'spaceviz',n:['worldaxes'],d:'Two axes at a time, every catalogue body plotted, the Solar System highlighted, the habitable region shaded. It is the picture that makes "Mercury and Pluto are regions of one space" true rather than asserted, and every body already has the numbers.',k:'DRAW',e:'M',i:3},
{c:'space',t:'Show where the catalogue is empty',n:['spaceviz'],d:'The occupied region of the space is a selection effect: transit surveys find big hot planets, radial velocity finds massive ones. The empty regions include worlds that certainly exist and nobody has looked at, and pointing at one is the most interesting thing this product could do.',k:'DRAW',e:'M',i:3},
{c:'space',t:'Generate a world from a point in the space',g:'fromaxes',n:['worldaxes'],d:'Click an empty region and get a world. This is the payoff for the entire taxonomy: not a better classification of known bodies, but the ability to make the unknown ones. It also becomes the test — a generated world at Earth\'s coordinates must be Earth-like.',k:'MODEL',e:'L',i:3},
{c:'space',t:'Interpolate between two worlds',n:['fromaxes'],d:'Morph from Earth to Venus along the insolation axis and watch where the transition happens. The runaway greenhouse is a real threshold in that space and crossing it in one continuous motion is a lesson nothing else delivers.',k:'PLAY',e:'M',i:3},
{c:'space',t:'The habitable zone is a region, not a band',d:'`whiteDwarfHzWindow` exists. The real habitable region depends on insolation, mass, atmosphere, volatile inventory and age, and drawing it as a two-dimensional region in the world space is far more honest than the standard orbital-distance band.',k:'DRAW',e:'M',i:3},
{c:'space',t:'The radius valley as a visible feature of the space',d:'`radiusValleySide` is implemented. The gap at 1.5–2 R⊕ is one of the most robust results in exoplanet science and it should be a visible groove in the plotted space.',k:'DRAW',e:'S',i:2},
{c:'space',t:'The cosmic shoreline, drawn',d:'`cosmicShoreline(S, vescKmS)` divides worlds that keep an atmosphere from worlds that lose one, and it is a line on a plot of insolation against escape velocity that fits the Solar System remarkably well. It is one of the best single pictures in planetary science.',k:'DRAW',e:'S',i:3},
{c:'space',t:'The snow line as a boundary in the space',d:'Partial. Forming beyond `snowLineAu` (heliocentric, not planetocentric moons) triples volatile inventory. The line is not yet drawn on a plot of the space.',k:'MODEL',e:'M',i:3},
{c:'space',t:'Cluster the catalogue and see what falls out',n:['worldaxes'],d:'Run a clustering over the seven axes and compare the result against the seven hand-written discovery categories. Where they disagree is where the current organisation is telling the wrong story.',k:'PROVE',e:'M',i:2},
{c:'space',t:'A world\'s nearest neighbours',n:['worldaxes'],d:'"The five worlds most like this one." It is a better navigation primitive than a category list and it makes the catalogue feel like a space rather than a menu.',k:'DRAW',e:'M',i:3},
{c:'space',t:'Name the regions',n:['spaceviz'],d:'Ocean world, desert world, snowball, hycean, lava world, super-Venus, sub-Neptune, cold rock, ice dwarf, gas giant. Named regions give the space a vocabulary, and the boundaries between them are where the physics is.',k:'MODEL',e:'M',i:3},
{c:'space',t:'The boundaries are the interesting part',n:['spaceviz'],d:'Runaway greenhouse, atmospheric collapse, the moist greenhouse, the snowball bifurcation, the radius valley, the mobile-to-stagnant lid transition. Each is a surface in the space with hysteresis, and each is a thing the model could cross in front of the player.',k:'MODEL',e:'L',i:3},
{c:'space',t:'Hysteresis, so a world remembers which way it came',d:'A snowball planet does not deglaciate at the temperature it froze at. Any boundary with hysteresis makes the world space a place with history rather than a lookup, and the snowball case is already half in the model.',k:'MODEL',e:'M',i:3},
{c:'space',t:'Roll a world from a region',n:['fromaxes'],d:'"Give me a cold ocean world around an M dwarf." The seed-word system already names worlds; naming a *region* and rolling inside it is how a catalogue of 120 becomes a generator of thousands.',k:'PLAY',e:'M',i:3},
{c:'space',t:'The space should include worlds that cannot exist',n:['spaceviz'],d:'Marking the forbidden regions — below the density of hydrogen, above the mass where fusion starts, inside the Roche limit — teaches more than the allowed ones. `rocheLimitAu` is already implemented.',k:'DRAW',e:'M',i:2},
{c:'space',t:'Free-floating worlds have no insolation axis',d:'The `dark` category has 16 bodies including rogue planets. An axis that is zero for a whole class means the classification needs a different organising variable there — internal heat.',k:'MODEL',e:'M',i:2},
{c:'space',t:'Binary and circumbinary insolation is not a number',d:'`binaryInsolation` and `circumbinaryBeat` exist. On a circumbinary world insolation is a periodic function, not a scalar, and the axis has to carry the variability as well as the mean.',k:'MODEL',e:'M',i:2},
{c:'space',t:'A trajectory through the space is a history',n:['spaceviz'],d:'Plot a world\'s path over its lifetime: Venus moving right along insolation as the Sun brightens, Mars falling in atmospheric retention. This links this category to `hist` and turns a static plot into a narrative.',k:'DRAW',e:'M',i:3},
{c:'space',t:'Share a point in the space',d:'The seed-word system encodes a world in four words. A point in the world space plus a seed is a complete, shareable specification of a planet nobody has ever seen.',k:'PLAY',e:'M',i:2},
{c:'space',t:'Assert the Solar System lands where it should',n:['fromaxes'],d:'Landed. Tests pin Earth as habitable, Titan as titanian (not desert), Mars as desert, Jupiter as giant. If Titan comes out as a desert the axes are wrong, and that test is cheap and permanent.',k:'PROVE',e:'M',i:3},
];

const P2 = [
/* -------------------------------------------------------------- matter -- */
{c:'matter',t:'A substrate table, authored as data',g:'substrates',d:'Landed. `vr/data/worlds/substrates.json` compiled by `scripts/substrates.mjs` into `vr/sim/substrates.js`. Twenty-four materials: the eight Earth rocks in slots 0–7, then water ice, CO₂ ice, N₂ ice, CH₄ ice, NH₃–water, clathrate, tholin, silicate, regolith, sulfur, evaporite, hydrocarbon liquid, supercritical CO₂, iron, graphite, envelope. Density, melt/triple/boil, albedo, k, strength, erode, rgb, tag, why.',k:'MODEL',e:'L',i:3},
{c:'matter',t:'Eight Earth rocks is the whole material model',n:['substrates'],d:'Landed as closed. `W.rock` still has eight values and Earth still uses them. Pluto is no longer stamped sediment: `W.substrate` carries nitrogen ice over water-ice bedrock. The two fields run in parallel so Earth golden does not move.',k:'MODEL',e:'S',i:3},
{c:'matter',t:'Rheology, so materials deform differently',n:['substrates'],d:'Partial. `rheologyAt` returns solid / convecting-ice / liquid / gas / supercritical from T, P and `convectK`. Pluto N₂ at 40 K is convecting-ice; CH₄ is a rigid solid; water ice is bedrock. Nothing yet flows because of that verdict — `phasediag` and the landform grammar consume it.',k:'MODEL',e:'L',i:3},
{c:'matter',t:'Erodibility per substrate',n:['substrates'],d:'Partial. Each row has `erode` (Earth rain = 1). `erosionTick` multiplies by it on non-Earth worlds. Earth stays at 1 so golden does not move. Full strata still waits on a column.',k:'MODEL',e:'M',i:3},
{c:'matter',t:'Albedo per substrate, per grain size',n:['substrates'],d:'Partial. Climate reads the row on non-Earth worlds. `W.grain` lerps frost 0.90 → 0.38. Earth keeps 0.06 / 0.18.',k:'MODEL',e:'M',i:3},
{c:'matter',t:'Colour per substrate, with provenance',n:['substrates'],d:'Landed for the overlay. Each row has `rgb` and a measured/fitted/invented tag. The Substrate overlay paints it. Globe colour still comes from the look table.',k:'DRAW',e:'M',i:3},
{c:'matter',t:'A substrate field, not a rock byte',g:'substratefield',n:['substrates'],d:'Landed as a parallel field. `W.substrate` is a Uint8 index stamped at generate from axes + T/P (`stampSubstrate`). Earth copies `W.rock`. Does not replace `rock`. Mixtures are still one index; `colfield` is the stack.',k:'MODEL',e:'M',i:3},
{c:'matter',t:'Thermal properties decide the diurnal cycle',n:['substrates'],d:'Partial. Non-Earth diurnal swing and `thermalMass` scale with `thermalInertia` (regolith ~50, bare rock ~2000). Earth is unchanged.',k:'MODEL',e:'M',i:3},
{c:'matter',t:'Strength decides the maximum slope',n:['substrates'],d:'Partial. `erosionTick` fails slopes above `slopeCap` from strength (N₂ ice cannot hold a cliff). Earth returns 9 — no cap, golden does not move.',k:'MODEL',e:'M',i:3},
{c:'matter',t:'Porosity and regolith depth',n:['substrates'],d:'Partial. `porosity` is on regolith and ejecta. Depth is not a field — that is `colfield`.',k:'MODEL',e:'M',i:2},
{c:'matter',t:'Grain size as a visible variable',n:['substrates'],d:'First cut. `W.grain` 0 = fine frost (albedo 0.9), 1 = coarse (0.38). Coarsens while frost sits; new deposition resets it. Overlay does not draw grain texture — `detailfield` still wants that.',k:'MODEL',e:'M',i:2},
{c:'matter',t:'Substrate should follow from composition',n:['substrates'],d:'Partial. `pickMaterials` follows axes (interior, dominant volatile) plus T/P, not a per-body stamp. `compositionFromDensity` is not the direct input — the axes already read it.',k:'MODEL',e:'M',i:3},
{c:'matter',t:'Mixtures, because real surfaces are mixed',n:['substratefield'],d:'Mars is basalt plus dust plus salt plus water ice. Titan is water ice bedrock with organic sand on top. A single index per cell will not carry that and a two- or three-component mixture will.',k:'MODEL',e:'M',i:2},
{c:'matter',t:'Substrate decides which processes run',n:['substratefield'],d:'The surface backlog\'s `procset` asks which geomorphic processes are active per world. Substrate is the answer: karst needs a soluble rock, dunes need loose grains, glaciers need something that flows.',k:'MODEL',e:'M',i:3},
{c:'matter',t:'Substrate decides what life can do to it',n:['substratefield'],d:'The life pass has an `endolithic` habitat and a `silicaSpicule` skeleton, and no rock for either to be in. Weathering, boring, soil formation and biomineralisation all need a material to act on.',k:'MODEL',e:'M',i:2},
{c:'matter',t:'A substrate overlay',n:['substratefield'],d:'Landed. Overlay id `substrate` paints each cell from the row\'s `rgb`. View picker, after Crust.',k:'DRAW',e:'S',i:3},
{c:'matter',t:'Name the substrate in the inspector',n:['substratefield'],d:'Landed. Inspector and `coreSample` print `describeSubstrate` — "nitrogen ice over water-ice bedrock" on Pluto basins, "liquid methane over water-ice bedrock" on Titan lakes.',k:'DRAW',e:'S',i:3},
{c:'matter',t:'Substrate must survive a save',n:['substratefield'],d:'Landed. `serializeRun` version 6 stores `subB64`. Old saves without the byte restamp at generate. Tests round-trip Pluto\'s nitrogen ice.',k:'MODEL',e:'S',i:2},
{c:'matter',t:'Say which substrate properties are measured',n:['substrates'],d:'Landed. Every row has `tag` (measured / fitted / invented) and `why`. Water-ice triple point is measured; tholin strength is invented; N₂ convection at Pluto T is measured-and-extrapolated, tagged measured with the caveat in `why`.',k:'PROVE',e:'M',i:3},
{c:'matter',t:'A substrate test against known bodies',n:['substrates'],d:'Landed. Pluto 40 K / 1e-5 bar: N₂ convecting-ice, CH₄ solid, H₂O solid. Earth 288 K / 1 bar: water liquid. Titan 94 K / 1.5 bar: CH₄ liquid, water solid. Venus 737 K / 92 bar: CO₂ supercritical. Generate: Pluto has nitrogen ice (not sediment), Titan has hydrocarbon lakes, Jupiter is envelope, Earth still maps `rock`.',k:'PROVE',e:'M',i:3},

/* --------------------------------------------------------------- phase -- */
{c:'phase',t:'One volatile has a phase diagram and it is hard-coded to water',g:'phasediag',d:'Partial, first cut landed. `cycleMaterial` tells `hydroTick` which row it is carrying. Earth water and Titan methane still enter through `liquidWaterOk`. CO₂ / N₂ take the frost path. Water worlds that are not `earthLike` keep the snowline ice tick so temperate catalogue worlds do not freeze solid.',k:'MODEL',e:'L',i:3},
{c:'phase',t:'A volatile cycle per dominant volatile',n:['phasediag'],d:'First cut. Evaporate / transport / precipitate still share `hydroTick`. The substance is `cycleMaterial`; `cycleMode` is liquid / frost / none. CO₂ / N₂ now share a pressure reservoir with the frost field. Per-species lakes-plus-air columns are not this cut.',k:'MODEL',e:'L',i:3},
{c:'phase',t:'Sublimation, which is most of the outer Solar System',n:['phasediag'],d:'First cut. Below the triple point `iceTickFromPhase` grows ice when the cell is solid and ablates when it is gas. Pluto N₂ is frost; Mars CO₂ has no liquid window at 6 mbar.',k:'MODEL',e:'M',i:3},
{c:'phase',t:'Seasonal atmospheric collapse',n:['phasediag'],d:'Landed, first cut. `W._atmScale` is the condensable fraction still in the air. Mars CO₂ winter draws the column down toward 72% onto polar frost (cap 28%). Pluto N₂ thins at aphelion and returns at perihelion. Titan\'s 1.5 bar is not a condensable reservoir. Earth is unchanged. Live pressure feeds greenhouse, thermal mass and the inspector.',k:'MODEL',e:'M',i:3},
{c:'phase',t:'Clathrates as a reservoir with a threshold',n:['phasediag'],d:'Landed, first cut. `clathrateStable` is Q1 ~272 K at 25 bar. Titan holds an interior store and does not auto-strip. Warm dissociation writes CH₄ and a chronicle line. Holocene Earth does not tick. Not a seafloor map.',k:'MODEL',e:'M',i:2},
{c:'phase',t:'Supercritical fluids have no phase boundary',n:['phasediag'],d:'Venus\'s lower atmosphere is supercritical CO₂ and the surface is not a liquid–gas interface in any normal sense. The life pass already carries supercritical CO₂ as a solvent; the physics side has nothing.',k:'MODEL',e:'M',i:2},
{c:'phase',t:'Magma is a phase, not a paint',d:'`stampMagma` exists and one body reaches it. A magma ocean has a surface with a temperature, a viscosity, a crust that forms and founders, and a vapour atmosphere of rock. It is a fluid world with a heightfield, which is a genuinely novel case.',k:'MODEL',e:'M',i:3},
{c:'phase',t:'Rock vapour atmospheres',d:'On the ultra-short-period lava worlds the atmosphere is vaporised silicate that condenses on the night side and rains rock. Seventeen catalogue bodies are in the furnace category and they now resolve as magma — the stamp is lava, the atmosphere is still Earth air.',k:'MODEL',e:'M',i:3},
{c:'phase',t:'Sulfur has many solid phases and they are all different colours',d:'Io\'s colour range — yellow, orange, red, black, white — is largely allotropes and temperature history of sulfur and SO₂ frost. It is the most colourful body in the Solar System and the reason is phase chemistry.',k:'MODEL',e:'M',i:2},
{c:'phase',t:'Ammonia–water eutectic as a cryolava',n:['phasediag'],d:'Landed, first cut. `nh3Water` now has boilK 240 so `liquidWindow` is 176–240 K at 1 bar. `cycleMaterial` maps NH₃. No catalogue body carries NH₃ as the dominant volatile yet.',k:'MODEL',e:'M',i:2},
{c:'phase',t:'Ice phases, because pressure matters',n:['phasediag'],d:'First cut as a world-level floor, not ice III–VII per cell. `highPressureIceFloor`: Europa sits on rock; a 2 R⊕ / 50-ocean world bottoms on ice VI and origin loses water–rock chemistry.',k:'MODEL',e:'M',i:3},
{c:'phase',t:'The liquid window as a computed band',n:['phasediag'],d:'Landed. `liquidWindow` is melt–boil at this P, or null below the triple. The world card and inspect HUD print it — Titan CH₄ 91–112 K, Mars CO₂ no liquid at 6 mbar.',k:'DRAW',e:'M',i:3},
{c:'phase',t:'Frost as a surface cover with a season',n:['phasediag'],d:'Landed, first cut. `W.frost` is optical cover on the winter pole. Cover overlay and inspect name it; `groundAlbedo` brightens. Not a landform, and the photograph globe still keys off kind.',k:'MODEL',e:'M',i:3},
{c:'phase',t:'Latent heat, so phase change buffers temperature',n:['phasediag'],d:'Sketch only. Depositing frost warms the cell slightly; sublimation cools it. Not a latent-heat budget and not a reason an ice sheet resists a warm summer.',k:'MODEL',e:'M',i:2},
{c:'phase',t:'Deposition and lag',n:['phasediag'],d:'First cut. When frost retreats, `W.lag` gains a little involatile residue and darkens albedo. Not a cometary crust model.',k:'MODEL',e:'M',i:2},
{c:'phase',t:'Boiling, on a world with low pressure',n:['phasediag'],d:'Landed as the liquid window. Below the triple pressure there is no liquid band — Mars CO₂ at 6 mbar, Pluto N₂. The engine used to only ask temperature.',k:'MODEL',e:'S',i:3},
{c:'phase',t:'A phase-state overlay',n:['phasediag'],d:'Landed. Overlay id `phase` paints solid / convecting-ice / liquid / gas / supercritical from `phaseAtCell`. After Substrate in the View picker.',k:'DRAW',e:'M',i:3},
{c:'phase',t:'Phase change should be a chronicle event',n:['phasediag'],d:'Landed. `cycleMode` shifts log "The atmosphere has begun to freeze out" / melted / sublimated. One line per transition, not per tick.',k:'MODEL',e:'S',i:3},
{c:'phase',t:'Phase data with sources',n:['phasediag'],d:'Landed, first cut. Ice rows in `substrates.json` carry `cite` (Wagner/Pruß, Span/Wagner, Fray/Schmitt, Kargel, Sloan/Koh). The compiler refuses an ice without one.',k:'PROVE',e:'M',i:3},
{c:'phase',t:'Assert the Solar System\'s phases',n:['phasediag'],d:'Landed. Lookup pins plus cycle: Titan `cycleMode` is liquid, Pluto is frost, Mars CO₂ has no liquid window, Earth water still runs. `hydroTick` reads those verdicts.',k:'PROVE',e:'M',i:3},

/* -------------------------------------------------------------- column -- */
{c:'column',t:'A vertical column per cell',g:'colfield',n:['substratefield'],d:'Landed, first cut. `columns.json` recipes pick a stack from axes and flags. `columnAt` scales ice-shell lid and ocean from `W.shellLid` / `W.shellOcean`. Overlay `column` paints the top layer; inspect names thicknesses. Not a packed per-cell array; deposition and the cross-section wait.',k:'MODEL',e:'L',i:3},
{c:'column',t:'The column is what the surface backlog\'s stratigraphy needs',n:['colfield'],d:'Partial. The stack exists as a recipe plus thicknesses. Erosion exposing beds, hiatus and unconformity are still `strata` in the geology backlog.',k:'MODEL',e:'M',i:3},
{c:'column',t:'Depth to the ocean on an ice world',n:['colfield'],d:'Landed, first cut. Europa lid is the 15–25 km class; ocean ~100 km. Enceladus south pole is thinner than the north. Exact 5 km / 30 km Enceladus pin is not claimed — lid follows `shellLid`.',k:'MODEL',e:'M',i:3},
{c:'column',t:'A high-pressure ice floor',n:['colfield'],d:'First cut as a column layer. Titan\'s CH₄ + atmosphere recipe always includes ice VI. Europa stays on rock (`when: hpIce` plus the 0.8 R⊕ origin flag). Origin still reads the one-number floor.',k:'MODEL',e:'M',i:3},
{c:'column',t:'Crustal composition, not just thickness',d:'`W.crust` is a thickness. Continental versus oceanic crust is a density difference and it is why Earth\'s hypsometry is bimodal; the geology backlog has this and the column is where it lives.',k:'MODEL',e:'M',i:3},
{c:'column',t:'Megaregolith and the impact-shattered layer',n:['colfield'],d:'Landed, first cut. Airless recipe is 8 m regolith over 2 km megaregolith over 40 km crust. Strength and thermal conductivity do not yet read it.',k:'MODEL',e:'M',i:2},
{c:'column',t:'Aquifers and subsurface volatiles',n:['colfield'],d:'Ground ice on Mars, subsurface brine on Ceres, water in the lunar polar cold traps. Volatiles hidden below the surface are the reason several of these bodies are interesting at all.',k:'MODEL',e:'M',i:2},
{c:'column',t:'Geothermal gradient per world',n:['colfield'],d:'`radiogenicHeat` and `tidalHeatFluxWm2` exist. The gradient decides where ice melts, where rock softens, and how deep a habitable layer sits — which the life pass needs for its chemosynthetic biospheres.',k:'MODEL',e:'M',i:3},
{c:'column',t:'A drill that reads the column',n:['colfield'],d:'Landed, first cut. Non-Earth `coreSample` returns `columnLayers`. Lab SVG uses layer rgb. Earth still reconstructs from rock, BIF, coal, fossils.',k:'DRAW',e:'M',i:3},
{c:'column',t:'Draw the column as a cross-section',n:['colfield'],d:'A vertical slice through the planet along a great circle, with the layers labelled. It is the standard planetary-science figure and it would be the clearest single image this product produces.',k:'DRAW',e:'M',i:3},
{c:'column',t:'Deposition adds to the column',n:['colfield'],d:'The surface backlog wants a sediment budget. Sediment has to go somewhere and the column is where — which is also how a fossil record accumulates for the life pass.',k:'MODEL',e:'M',i:3},
{c:'column',t:'Burial changes what a layer is',n:['colfield'],d:'Sediment becomes rock, ice recrystallises, organic matter becomes kerogen and then oil. Diagenesis is what makes a column a history rather than a pile.',k:'MODEL',e:'M',i:2},
{c:'column',t:'The column decides the surface\'s thermal response',n:['colfield'],d:'Thermal inertia is a property of the top few centimetres and the depth of the diurnal wave depends on conductivity. This is what makes a dusty surface and a rocky one behave differently in the same sunlight.',k:'MODEL',e:'M',i:2},
{c:'column',t:'Column depth should be adaptive',n:['colfield'],d:'Landed, first cut. No packed per-cell array. A world recipe plus lid/ocean scalars already on the shell fields. Twenty-layer cells and run-length packing wait.',k:'MODEL',e:'M',i:2},
{c:'column',t:'Isostasy should read the column',d:'`applyIsostasy` uses a crust thickness and a density. With a real column the buoyancy is an integral, and ice, sediment and rock all contribute differently.',k:'MODEL',e:'M',i:2},
{c:'column',t:'Cryovolcanism needs a plumbing model',n:['colfield'],d:'Getting liquid from an ocean to the surface through kilometres of ice requires either a crack or a buoyant diapir, and both are column problems. It is the mechanism behind Enceladus\'s plumes and every cryovolcanic dome on Pluto.',k:'MODEL',e:'M',i:2},
{c:'column',t:'The column is where the life pass\'s endolithic habitat lives',d:'`endolithic` is an option on the habitat axis with nowhere to be. On a dry cold world the only refuge is inside the rock, at a depth set by the thermal gradient and the water availability.',k:'MODEL',e:'M',i:2},
{c:'column',t:'Show the column in the local map',n:['colfield'],d:'At 1,632 km across, a cut bank, a cliff face or a crater wall exposes the column. It is the most natural place to show stratigraphy and it needs no new view.',k:'DRAW',e:'M',i:2},
{c:'column',t:'Save the column',n:['colfield'],d:'Same argument as the substrate field and the genome: a world whose history is not serialised has no history after a reload.',k:'MODEL',e:'M',i:2},
{c:'column',t:'Assert the known columns',n:['colfield'],d:'Landed, first cut. Europa: ice 15–25 km class, ocean ~100 km, rock. Titan: organics, ice I, ocean, ice VI, rock. Moon: 8 m regolith, 2 km megaregolith, 40 km crust. Jupiter: no surface. Earth silent.',k:'PROVE',e:'M',i:3},
];

const P3 = [
/* -------------------------------------------------------------- nosurf -- */
{c:'nosurf',t:'A giant is nine lines that set everything to zero',g:'nosurface',d:'`stampGas` writes `h[c] = 0`, `crust[c] = 0`, `age[c] = 0`, `seaLevel = 0`, and empties the volcano and hotspot lists. Every downstream branch then evaluates `h[c] < seaLevel` as `0 < 0` — false — so a gas giant is a planet whose surface is entirely land at exactly sea level. Fifteen of the 21 catalogue giants reach this path; the other six are misrouted to Io, magma or generic.',k:'MODEL',e:'S',i:3},
{c:'nosurf',t:'Pressure as the vertical coordinate',g:'plevel',n:['nosurface'],d:'A giant has no radius to hang a heightfield from. The correct coordinate is pressure — the 1-bar level as the nominal surface, cloud decks at their condensation levels, and everything else measured in bars above or below. It is a different contract and it is a small one: the fields are already per-cell.',k:'MODEL',e:'L',i:3},
{c:'nosurf',t:'Cloud decks at their condensation levels',n:['plevel'],d:'On Jupiter: ammonia ice near 0.7 bar, ammonium hydrosulfide near 2 bar, water near 5 bar. Which deck you see through decides the colour, and the belts and zones are exactly the places where you see deeper or shallower.',k:'MODEL',e:'M',i:3},
{c:'nosurf',t:'The "surface" the player sees is an optical depth',n:['plevel'],d:'Not a solid boundary but the level where the atmosphere becomes opaque, which varies by wavelength and by cloud cover. This is why the giants look different in methane band images and it is a rendering concept the engine has never needed before.',k:'DRAW',e:'M',i:3},
{c:'nosurf',t:'A giant still has a heat budget',n:['nosurface'],d:'Jupiter emits about 1.7 times what it receives; Saturn about 1.8; Neptune 2.6. Internal heat dominates the energy balance and drives the weather, which inverts the usual insolation-driven model. `internalHeatFraction` exists in `exophysics.js`.',k:'MODEL',e:'M',i:3},
{c:'nosurf',t:'Sub-Neptunes are the commonest planet and the least modelled',n:['nosurface'],d:'They sit between rock and gas — a possibly-solid core under a thick envelope, possibly a hycean ocean under hydrogen. The radius valley separates them from super-Earths and `radiusValleySide` already computes which side a world is on.',k:'MODEL',e:'L',i:3},
{c:'nosurf',t:'Hycean worlds are a real intermediate',n:['nosurface'],d:'A deep ocean under a hydrogen atmosphere, warm and high-pressure. They are one of the more plausible habitable classes and they need both a surface and a pressure-level model at once.',k:'MODEL',e:'L',i:2},
{c:'nosurf',t:'A brown dwarf is a giant with weather and no star',d:'The `dark` category has them. They are the extreme case: internally heated, rapidly rotating, with silicate and iron clouds and observed variability. Everything a giant needs, with the insolation term set to zero.',k:'MODEL',e:'M',i:2},
{c:'nosurf',t:'Hot Jupiters are tidally locked giants',d:'51 Pegasi b, HD 209458 b, WASP-12 b — the biggest single group in the catalogue. Permanent day and night sides, an equatorial jet that shifts the hot spot downwind, and a temperature contrast measurable from Earth. `daysideNightside` and `redistributionGuess` already exist.',k:'MODEL',e:'M',i:3},
{c:'nosurf',t:'Escape and mass loss for the extreme cases',d:'WASP-12 b is being consumed; several catalogue worlds have comet-like tails. `integratedXuvDose` and `orbitalDecayLifetimeYr` are implemented and the visible consequence — a planet with a tail — is not.',k:'MODEL',e:'M',i:2},
{c:'nosurf',t:'Rings as a first-class object',d:'Saturn is in the catalogue and its rings are the most recognisable structure in the Solar System. They are also physics — a Roche-limit consequence, with gaps at resonances — and `rocheLimitAu` is already there.',k:'DRAW',e:'M',i:3},
{c:'nosurf',t:'A giant\'s moons are part of the picture',d:'Jupiter with the Galileans, Saturn with Titan and the shepherds. Fifteen catalogue bodies are moons and every one of them has a parent that should be visible in its sky and in the parent\'s own view.',k:'DRAW',e:'M',i:2},
{c:'nosurf',t:'The tools have to mean something on a giant',n:['plevel'],d:'Thicken crust, carve river, plate pole — the entire land toolbox is meaningless on a world with no surface. Either the toolbox changes per world kind, or a giant is a world you can only watch.',k:'PLAY',e:'M',i:3},
{c:'nosurf',t:'A giant should be a world you fly through',n:['plevel'],d:'The product\'s pitch is "hold a planet, shrink, walk in". On a giant the equivalent is descending until the pressure crushes you, and it is a better demonstration of scale than any solid world offers.',k:'PLAY',e:'L',i:3},
{c:'nosurf',t:'What does life mean here',d:'The life pass has an `aerosol` habitat and a `balloon` locomotion mode. An aerial biosphere in a giant\'s temperate cloud layer is a serious proposal with a real energy budget, and the machinery for it now exists.',k:'MODEL',e:'M',i:2},
{c:'nosurf',t:'The interior, all the way down',d:'Molecular hydrogen, then metallic hydrogen, then possibly a core. It is where the magnetic field comes from and it is one of the few places a cross-section is more interesting than a surface.',k:'MODEL',e:'M',i:2},
{c:'nosurf',t:'Aurorae, which are spectacular and computable',d:'Jupiter\'s are the brightest in the Solar System and are powered by Io\'s plasma torus rather than by the solar wind. Magnetosphere, rotation and a plasma source are all quantities the engine has.',k:'DRAW',e:'M',i:2},
{c:'nosurf',t:'The limb of a giant is atmosphere all the way',d:'The realism backlog found the limb is one of two edges that survive a thumbnail. On a giant the limb *is* the world, and haze layers stacked at different altitudes are what make it read as depth.',k:'DRAW',e:'M',i:3},
{c:'nosurf',t:'Say what has no surface, in the interface',n:['nosurface'],d:'Landed, first cut. Envelope worlds print `no surface · envelope` on the chip via `columnRecipe`. The landscaping panel is still there. Pressure levels are not.',k:'DRAW',e:'S',i:3},
{c:'nosurf',t:'Assert that a giant is not a rocky world',n:['nosurface'],d:'A test that picks each of the 21 giants and asserts the engine does not run tectonics, erosion, hydrology or biome classification on it. Today several of them run all four.',k:'PROVE',e:'M',i:3},

/* ----------------------------------------------------------------- jet -- */
{c:'jet',t:'Zonal jets at a Rhines scale',g:'rhines',n:['plevel'],d:'The number and width of bands on a giant follows from rotation rate and the depth of the weather layer through the Rhines scale. Jupiter\'s own note in `SEED_WORLDS` says exactly this — "Banded at a Rhines scale set by a 9.9-hour day" — and the engine has never read it.',k:'MODEL',e:'L',i:3},
{c:'jet',t:'Belts and zones are different depths, not different paints',n:['rhines'],d:'Zones are rising, cloudy and bright; belts are sinking, clearer and darker because you see deeper. Getting that mechanism right means the banding colour follows from the dynamics rather than being a stripe texture.',k:'MODEL',e:'M',i:3},
{c:'jet',t:'Alternating prograde and retrograde jets',n:['rhines'],d:'The alternation is the signature. A model that produces bands but not alternating shear is producing stripes, and the difference is visible in how the vortices behave between them.',k:'MODEL',e:'M',i:3},
{c:'jet',t:'Long-lived vortices',n:['rhines'],d:'The Great Red Spot has lasted centuries because a two-dimensional turbulent flow between opposing jets conserves vorticity. Vortices merging, drifting and persisting is the thing that makes a giant look alive rather than striped.',k:'MODEL',e:'L',i:3},
{c:'jet',t:'The polar hexagon and polar cyclone clusters',d:'Saturn has a hexagonal polar jet; Jupiter has a stable polygon of circumpolar cyclones. Both are emergent from the same dynamics and both are among the most striking images in planetary science.',k:'MODEL',e:'M',i:2},
{c:'jet',t:'Rotation rate should change the band count',n:['rhines'],d:'This is the payoff and the test: a slower rotator gets fewer, wider bands and a faster one gets more. Uranus and Neptune have far fewer jets than Jupiter, and the reason is in the numbers the catalogue already carries.',k:'MODEL',e:'M',i:3},
{c:'jet',t:'Obliquity drives Uranus\'s seasons in a way nothing else does',d:'At 97.8° each pole faces the Sun for 42 years. The seasonal machinery in this product is written for Earth and Uranus is the case that breaks it hardest.',k:'MODEL',e:'M',i:3},
{c:'jet',t:'Neptune\'s winds are the fastest and its insolation is nearly zero',d:'2,000 km/h on 0.1% of Earth\'s sunlight. Any model that drives circulation from insolation gets this exactly backwards, which makes Neptune the best single test of whether internal heat is wired in.',k:'MODEL',e:'M',i:3},
{c:'jet',t:'Storms that erupt and fade',d:'Saturn\'s Great White Spots recur roughly every Saturnian year and wrap the planet. A giant\'s weather has events, and events are what the chronicle exists to report.',k:'MODEL',e:'M',i:2},
{c:'jet',t:'The banding should advect its own colour',n:['rhines'],d:'Chromophores get carried by the flow, sheared into filaments and wrapped around vortices. The turbulent detail between the bands is where a giant stops looking like a beach ball.',k:'DRAW',e:'M',i:3},
{c:'jet',t:'A hot Jupiter\'s jet shifts its hot spot',d:'The equatorial superrotating jet carries heat downwind so the hottest point is not the substellar point — a measured result from phase curves and one of the few exoplanet observations that constrains dynamics directly.',k:'MODEL',e:'M',i:3},
{c:'jet',t:'Reuse the rocky-world circulation machinery',n:['rhines'],d:'The surface backlog\'s `pressfield` builds a pressure field so a rocky world\'s bands are a solution. A giant is the same solver with no lower boundary and a different heat source, which argues for building it once.',k:'MODEL',e:'M',i:3},
{c:'jet',t:'Two-dimensional turbulence is a different regime',n:['rhines'],d:'Energy cascades to larger scales rather than smaller, which is why the vortices persist and why the jets organise at all. It is the reason a giant\'s weather is not just weather at a bigger scale.',k:'MODEL',e:'L',i:2},
{c:'jet',t:'Cloud chemistry sets the colours',d:'Ammonia ice is white, ammonium hydrosulfide is brown-orange, and the chromophores are still argued about. Saying which parts of a giant\'s palette are known and which are invented is exactly the honesty discipline the rest of the product uses.',k:'DRAW',e:'M',i:2},
{c:'jet',t:'Lightning and moist convection',d:'Jupiter has water-driven convective storms with lightning detected from orbit. It is the one place where a giant\'s weather couples to a condensable, and it links to the `phase` category.',k:'MODEL',e:'M',i:2},
{c:'jet',t:'Show the wind profile',n:['rhines'],d:'Zonal wind speed against latitude is *the* diagnostic plot for a giant, it is measured for all four Solar System giants, and it is a one-line comparison against the model.',k:'PROVE',e:'M',i:3},
{c:'jet',t:'Let the player change the rotation and watch the bands reorganise',n:['rhines'],d:'The single most legible demonstration of a planetary parameter driving a picture that this product could offer. The lever already exists for rocky worlds.',k:'PLAY',e:'M',i:3},
{c:'jet',t:'Bands on a rocky world are the same physics, weaker',d:'The surface backlog\'s complaint is stripes on a rocky planet. Building the giant case properly clarifies what a real band is, which makes the rocky case easier to judge.',k:'MODEL',e:'M',i:2},
{c:'jet',t:'Frame rate on a turbulent solver',n:['rhines'],d:'A two-dimensional turbulence solver at N=96 every tick is a serious budget item. The GPGPU path already carries climate fields; state the cost before designing it.',k:'PROVE',e:'M',i:3},
{c:'jet',t:'Assert Jupiter\'s band count and jet speeds',n:['rhines'],d:'Jupiter has roughly a dozen alternating jets with peak speeds near 150 m/s. That is a measured target, and hitting it is the difference between a model and a texture.',k:'PROVE',e:'M',i:3},

/* ---------------------------------------------------------------- deep -- */
{c:'deep',t:'A depth axis instead of an elevation axis',g:'depthaxis',n:['plevel'],d:'Everything in the renderer derives a radius from `h`. A giant needs the opposite: a nominal radius at 1 bar and everything else expressed as a pressure, with the camera able to pass through. It is the single largest change to the rendering contract in any of these documents.',k:'DRAW',e:'L',i:3},
{c:'deep',t:'Descending into a giant',n:['depthaxis'],d:'Cloud decks passing, light reddening and failing, pressure climbing, temperature climbing, until nothing survives. The zoom rungs the living backlog established are the right structure and the destination is different.',k:'DRAW',e:'L',i:3},
{c:'deep',t:'Volumetric cloud, not a shell',n:['depthaxis'],d:'The existing cloud shell is a displaced sphere at one radius. A giant needs several layers with real thickness, which is also what the realism backlog wants for a rocky world\'s limb.',k:'DRAW',e:'L',i:3},
{c:'deep',t:'Light transport through a deep atmosphere',n:['depthaxis'],d:'Rayleigh scattering, methane absorption in the red, multiple scattering in the clouds. It is why Uranus and Neptune are blue and why Jupiter is not, and it is computable from composition.',k:'DRAW',e:'M',i:3},
{c:'deep',t:'The terminator on a giant is enormous',d:'A body eleven Earth radii across has a terminator thousands of kilometres wide with real scattering through it. It is where a giant looks best and where the existing single-shell model looks worst.',k:'DRAW',e:'M',i:2},
{c:'deep',t:'Pressure and temperature readouts as you descend',n:['depthaxis'],d:'Bars and kelvin on screen, with the phase state of each condensable. It is the instrumentation that makes the descent a measurement rather than a ride.',k:'DRAW',e:'M',i:3},
{c:'deep',t:'A local view for a world with no ground',n:['depthaxis'],d:'The flat map is a patch of surface. On a giant the equivalent is a patch of cloud at a chosen pressure level, advecting, with vortices crossing it. Same view, different substrate.',k:'DRAW',e:'M',i:3},
{c:'deep',t:'Where the probe stops',d:'Galileo\'s probe survived to 22 bar. Putting a real limit on the descent, with a reason, turns a graphics feature into a fact about the world.',k:'DRAW',e:'S',i:2},
{c:'deep',t:'Scale height varies enormously',d:'`scaleHeightKm(teqK, gEarth, mu)` is implemented. A hydrogen atmosphere on a low-gravity world is puffy; the same temperature over high gravity with heavy molecules is thin. It is what sets how a limb looks.',k:'MODEL',e:'M',i:3},
{c:'deep',t:'The same machinery gives rocky worlds a real atmosphere',n:['depthaxis'],d:'Venus at 92 bar and Mars at 6 mbar are the same problem at different scales, and the realism backlog\'s complaint that the atmosphere shell clips to white is a symptom of not having this.',k:'DRAW',e:'M',i:3},
{c:'deep',t:'Haze layers, which are what Titan and Pluto actually look like',d:'Pluto\'s haze is layered to 200 km and backlit images of it are among the most beautiful planetary photographs there are. It is a stack of thin shells and it is cheap.',k:'DRAW',e:'M',i:3},
{c:'deep',t:'Atmospheric refraction at the limb',d:'A dense atmosphere bends light around the limb and can produce a full ring at the right geometry. It is a small effect with a big visual payoff on the thick-atmosphere worlds.',k:'DRAW',e:'M',i:1},
{c:'deep',t:'A transit view',d:'The Lab draws a transit spectrum. Actually watching the world transit its star, with the atmosphere\'s annulus lit, connects the simulation to the observation that found it.',k:'DRAW',e:'M',i:2},
{c:'deep',t:'A cross-section view for any world',n:['depthaxis','colfield'],d:'One control that cuts the planet open — column for a rocky world, pressure levels for a giant. It is the same widget and it is the most educational thing in this document.',k:'DRAW',e:'M',i:3},
{c:'deep',t:'Sound at depth',d:'`audio.js` layers a soundscape. In a dense atmosphere sound carries further and lower; on an airless world there is nothing. It is an unusually direct way to communicate atmospheric density.',k:'DRAW',e:'M',i:1},
{c:'deep',t:'What the sky looks like from inside',d:'The life pass computes which bands a world delivers. From inside a giant the sky is orange, then red, then dark, and the sensory model already knows why.',k:'DRAW',e:'M',i:2},
{c:'deep',t:'Do not pretend there is a floor',n:['depthaxis'],d:'The temptation is to bottom the descent out on a surface. The truth — that it keeps going until the physics stops you — is stranger and better, and it is the point of including giants at all.',k:'DRAW',e:'M',i:3},
{c:'deep',t:'Performance of a volumetric path',n:['depthaxis'],d:'Ray marching through several cloud layers at full frame rate is a real cost on integrated GPUs. Measure it against the existing shell before committing.',k:'PROVE',e:'M',i:3},
{c:'deep',t:'A giant needs its own golden image',n:['depthaxis'],d:'The surface backlog wants golden images per world type. A giant is the type most likely to regress unnoticed because nobody looks at it.',k:'PROVE',e:'M',i:2},
{c:'deep',t:'Assert the pressure–temperature profile',n:['depthaxis'],d:'Jupiter\'s profile is measured to 22 bar by direct probe. Asserting the model against it is the strongest single check available for the whole no-surface path.',k:'PROVE',e:'M',i:3},
];

const P4 = [
/* ------------------------------------------------------------- grammar -- */
{c:'grammar',t:'Twenty-seven bespoke functions, one per named body',g:'landgram',d:'Landed, first cut. `vr/data/worlds/processes.json` + `landforms.json` compile through `scripts/landgram.mjs` to `landGrammar.js`. `landformPalette` selects by axes and flags. `W.landform` is a Uint8 overlay; inspect names the process. The twenty-seven `stamp*` / `paint*` functions still own the heightfield and are not retired this cut.',k:'MODEL',e:'L',i:3},
{c:'grammar',t:'A landform is a process acting on a material',n:['landgram','substratefield'],d:'Landed, first cut. Gates are interior, volatile, airless, ice-shell, teq, gravity, resurface, tidal — not `/mercury/`. Mercury gets scarps because it is a cooling stagnant lid, Io gets paterae because it is heat-pipe. The stamp is still the sine wave.',k:'MODEL',e:'L',i:3},
{c:'grammar',t:'Mercury\'s scarps are a trigonometric pattern',n:['landgram'],d:'`const sc = Math.sin(x * 7.5 + z * 4.2) * Math.cos(y * 5.5); if (sc > 0.62) elev += (sc - 0.62) * 0.07`. A world-space sine wave standing in for global thermal contraction of a one-plate planet. The grammar now *names* the scarp; the heightfield is still this line. Do not delete it in this cut.',k:'MODEL',e:'S',i:3},
{c:'grammar',t:'The grammar should be authored as JSON',n:['landgram'],d:'Landed. Twelve processes, twenty-one forms, tags measured/fitted/invented, `why` a sentence, rgb, scale, relief, hint, needs. The compiler refuses an unknown process, a bad tag, or a missing why.',k:'MODEL',e:'M',i:3},
{c:'grammar',t:'Each form needs a characteristic scale',n:['landgram'],d:'Landed as data. `scaleKm` / `reliefM` sit on every row. At 104 km per cell most of these are still sub-cell — the overlay names them; `detailfield` is what would draw them. The heightfield is unchanged.',k:'MODEL',e:'M',i:3},
{c:'grammar',t:'Which forms are possible on this world',n:['landgram'],d:'Landed. `landformPalette` / `processSet` filter the library. The land dock prints the palette; exo rows are marked invented. Giants get none. Earth computes a palette (fluvial, glacial) and does not stamp.',k:'MODEL',e:'M',i:3},
{c:'grammar',t:'Forms compose and overprint',n:['landgram'],d:'A crater with dunes in it, a rift filled with lava, a valley later glaciated. Real surfaces are a stack of episodes and the current stamps apply once in a fixed order.',k:'MODEL',e:'M',i:3},
{c:'grammar',t:'Crater size–frequency as the universal clock',g:'craters',d:'Partial. `craterCounts` derives nLarge / nMid / depth / micro from age, resurface and g. Not wired into `stampCraters` — that would move every moon. The stamp still takes four hand-tuned numbers.',k:'MODEL',e:'M',i:3},
{c:'grammar',t:'Crater morphology changes with size and gravity',n:['craters'],d:'Simple bowls become complex craters with central peaks above a transition diameter that scales inversely with gravity, then peak rings, then multi-ring basins. One formula, four recognisable landforms.',k:'MODEL',e:'M',i:3},
{c:'grammar',t:'Craters relax on a warm ice shell',n:['craters'],d:'Ganymede and Callisto have palimpsests — craters that have flattened because the ice flowed. It is the clearest possible demonstration that ice is a fluid on long timescales.',k:'MODEL',e:'M',i:2},
{c:'grammar',t:'Ejecta, rays and secondaries',n:['craters'],d:'A fresh crater has bright rays reaching hundreds of kilometres and they darken with age. It is the single strongest cue to surface age on an airless body and the current stamp has none.',k:'MODEL',e:'M',i:2},
{c:'grammar',t:'Impact flux should vary by world and by time',n:['craters'],d:'The late heavy bombardment, the asteroid belt\'s proximity, a giant\'s gravitational focusing. Impact rate is a property of a place in a system at a time, not a constant.',k:'MODEL',e:'M',i:2},
{c:'grammar',t:'Tectonic forms from the lid mode',n:['landgram'],d:'Mobile lid gives plate boundaries; stagnant lid gives contraction scarps and volcanic provinces; episodic gives a resurfaced world with wrinkle ridges; heat-pipe gives Io. Four lid modes, four landform families, and `interiorFromComposition` already returns the mode.',k:'MODEL',e:'M',i:3},
{c:'grammar',t:'Volcanic forms from magma properties',n:['landgram'],d:'Viscosity and gas content decide between a shield, a stratocone, a fissure flow, a patera and a dome. Io\'s paterae and Mars\'s shields are the same process with different numbers.',k:'MODEL',e:'M',i:3},
{c:'grammar',t:'Cryovolcanic forms',n:['landgram'],d:'Domes, flows, plumes and pits, made of ammonia-water or nitrogen. Same volcanic grammar, different rheology — which is the argument for having a grammar at all.',k:'MODEL',e:'M',i:2},
{c:'grammar',t:'Tidal forms',n:['landgram'],d:'Europa\'s double ridges and cycloids follow the diurnal tidal stress field on a 3.55-day cycle; Enceladus\'s tiger stripes sit at the south pole. Both are computable from an orbit the catalogue already carries.',k:'MODEL',e:'M',i:3},
{c:'grammar',t:'Sublimation forms',n:['landgram'],d:'Pits, scarps, spiders, bladed terrain, penitentes. These have no terrestrial analogue in the current library and they are most of what the outer Solar System looks like up close.',k:'MODEL',e:'M',i:3},
{c:'grammar',t:'A form should say what made it',n:['landgram'],d:'Landed. Inspect prints `explainForm` — name, process, scale, invented flag — plus the authored `why`. Overlay id `forms` paints the row rgb. Stamps still own height.',k:'DRAW',e:'M',i:3},
{c:'grammar',t:'Retire the stamps as the grammar covers them',n:['landgram'],d:'Not this cut. Each of the twenty-seven functions should become a validation case. Start with the Io and Mars fallbacks, not Iapetus. `c % 47` Enceladus stripes stay until then.',k:'MODEL',e:'M',i:3},
{c:'grammar',t:'A landform census per world',n:['landgram'],d:'Landed, first cut. `landformCensus` counts area fraction per form from `W.landform`. It is a one-line summary, not a claim that the heightfield matches.',k:'PROVE',e:'M',i:3},

/* --------------------------------------------------------------- forms -- */
{c:'forms',t:'Mercury: hollows',d:'Shallow irregular depressions with bright halos, formed where a volatile-bearing phase is being lost to space. They are unique to Mercury, they were a genuine surprise from MESSENGER, and they are a sublimation landform on a world with no atmosphere.',k:'MODEL',e:'M',i:2},
{c:'forms',t:'Mercury: lobate scarps from global contraction',n:['landgram'],d:'Landed as a palette row. Mercury is a cooling stagnant lid, so `scarp` is in the palette and the overlay will name high ridges that way. The heightfield is still the sine wave in `stampMercury`.',k:'MODEL',e:'M',i:3},
{c:'forms',t:'Mercury: Caloris and its antipode',d:'`stampMercury` places Caloris and antipodal chaotic terrain, which is correct and hand-placed. Seismic focusing at the antipode of a large impact is a general mechanism and it should be a consequence of the impact, not a second stamp.',k:'MODEL',e:'M',i:2},
{c:'forms',t:'The Moon: maria and highlands as two crusts',d:'The nearside/farside asymmetry, the anorthositic highlands and the basaltic maria are two materials with different albedo and different crater retention. `stampMoon` gets the look; the mechanism is a flotation crust and later flood basalts.',k:'MODEL',e:'M',i:3},
{c:'forms',t:'Mars: Tharsis, Valles Marineris and the dichotomy',d:'Three features that dominate the planet and are all consequences of one another. `stampMars` places them; the geology backlog wants Tharsis to reorient the whole planet through true polar wander.',k:'MODEL',e:'M',i:3},
{c:'forms',t:'Mars: layered polar deposits',d:'Kilometres of alternating dust and ice recording obliquity cycles. It is a climate archive written in landform, and Mars\'s obliquity chaos is already in the model\'s vocabulary.',k:'MODEL',e:'M',i:2},
{c:'forms',t:'Venus: tesserae, coronae and wrinkle ridges',d:'`planetTick.js:84` already has `if (rock[c] === 2) continue; // tesserae survive`. Venus is a world that resurfaced itself and left islands of the old crust, which is the most distinctive thing about it.',k:'MODEL',e:'M',i:3},
{c:'forms',t:'Io: paterae, lava flows and mountains that are not volcanoes',d:'Landed as a palette row. Heat-pipe interior selects patera / burial mountain / lava flow. The stamp is still `stampIo`. Temperate catalogue worlds no longer take this path.',k:'MODEL',e:'M',i:3},
{c:'forms',t:'Europa: chaos, double ridges, cycloids and lenticulae',d:'Landed as a palette row for chaos and double ridge. `iceshell.js` still produces the height from a lid and a vent field. Cycloids are not this cut.',k:'MODEL',e:'M',i:3},
{c:'forms',t:'Enceladus: tiger stripes and the south polar terrain',d:'Four parallel fractures venting to space from one hemisphere. `paintEnceladus` places a south stripe with `c % 47 === 0` — an index modulus, which on a cube sphere is spatially incoherent near the seams.',k:'MODEL',e:'M',i:2},
{c:'forms',t:'Titan: dune seas, methane lakes and river networks',d:'Landed as a palette row. Not-airless + CH₄ selects dune, methane lake, channel. The heightfield and hydro cycle are unchanged.',k:'MODEL',e:'M',i:3},
{c:'forms',t:'Titan: labyrinth terrain and karst in ice',d:'Dissolution landforms in an organic-covered ice bedrock. It is karst with a different solvent and a different rock, which is exactly what a grammar is for.',k:'MODEL',e:'M',i:2},
{c:'forms',t:'Pluto: Sputnik Planitia and its convection cells',d:'A nitrogen ice sheet convecting in polygonal cells tens of kilometres across, in a basin that migrated to the tidal axis. It is the most surprising surface humanity has photographed and the engine paints it as sediment.',k:'MODEL',e:'M',i:3},
{c:'forms',t:'Pluto: bladed terrain and sublimation pits',d:'Methane ice ridges hundreds of metres tall, like penitentes at planetary scale. A sublimation landform with no analogue anywhere else in the Solar System.',k:'MODEL',e:'M',i:3},
{c:'forms',t:'Triton: cantaloupe terrain and nitrogen geysers',d:'`paintTriton` produces geysers. Cantaloupe terrain is probably diapiric — buoyant ice rising through denser ice — and it is a rheology landform, which the substrate table would enable.',k:'MODEL',e:'M',i:2},
{c:'forms',t:'Iapetus: the ridge and the two-tone surface',d:'`stampIapetus` places an equatorial ridge and splits the albedo by longitude. The dark material is swept-up dust from Phoebe and the bright side is thermally segregated water ice — a two-process explanation for one picture.',k:'MODEL',e:'M',i:2},
{c:'forms',t:'Miranda: the coronae',d:'Three enormous ovoids of concentric ridges on a 470 km moon. Nobody is certain what made them, which makes it a good place to say so on screen.',k:'MODEL',e:'M',i:1},
{c:'forms',t:'Small bodies: rubble piles, boulders and no gravity to speak of',d:'Bennu, Arrokoth and 67P are not planets in any modelling sense. `isNonHydrostatic` exists; the honest move is a different representation rather than a small sphere.',k:'MODEL',e:'M',i:2},
{c:'forms',t:'Exoplanet forms are all invented and must say so',n:['landgram'],d:'Landed. Catalogue temperate / furnace / giant / arch / dark palettes set `invented`. Solar System `sol` / `moons` do not. Inspect and the land dock print the flag.',k:'PROVE',e:'M',i:3},
{c:'forms',t:'A reference image shelf per body',d:'`eoref` holds NASA stills for Earth. Every Solar System body in this list has public imagery, and comparing the render against it is the only external ground truth available.',k:'PROVE',e:'M',i:3},

/* ----------------------------------------------------------------- sig -- */
{c:'sig',t:'The thumbnail test',g:'sigtest',d:'Could somebody who knows the Solar System name the body from one frame? Today: Mercury and the Moon are both grey cratered spheres, 17 lava worlds share Mars\'s stamp, and 28 temperate worlds share Io\'s. Make it an actual test — render every body at thumbnail size into a contact sheet and look at it.',k:'PROVE',e:'M',i:3},
{c:'sig',t:'A world\'s palette is part of its identity',n:['sigtest'],d:'The surface backlog wants `palettedoc` and per-world palettes. This is the content: Io\'s sulfur yellows, Titan\'s orange haze, Europa\'s white and rust, Pluto\'s tan and off-white, Mars\'s butterscotch.',k:'DRAW',e:'M',i:3},
{c:'sig',t:'Albedo pattern is often the whole signature',d:'Iapetus is two-tone; Enceladus is uniformly bright; Callisto is dark and uniform. On several bodies the pattern of light and dark carries more identity than the topography.',k:'DRAW',e:'M',i:3},
{c:'sig',t:'The limb says what the atmosphere is',d:'A hard limb means airless. A soft blue one means thin. A layered orange one means Titan. It is the fastest single read on a world and the realism backlog already identified the limb as a thumbnail-surviving edge.',k:'DRAW',e:'M',i:3},
{c:'sig',t:'Give each world a signature landform you can find',n:['sigtest'],d:'Sputnik Planitia, Valles Marineris, the Great Red Spot, Caloris, the tiger stripes. One feature per world that is placed, named, and findable — which also gives the camera somewhere to fly to.',k:'DRAW',e:'M',i:3},
{c:'sig',t:'A named-feature layer',d:'`W._plateNames` names plates and nothing names landforms. Real place names are what turn a rendered sphere into a world people can talk about, and for the Solar System bodies they are known.',k:'DRAW',e:'M',i:3},
{c:'sig',t:'Generated names for generated worlds',d:'The seed-word system names worlds. Named landforms on an invented planet is what makes it a place rather than a heightfield, and the life pass already does this for clades.',k:'DRAW',e:'M',i:2},
{c:'sig',t:'The first frame is the product',n:['sigtest'],d:'The landscape backlog made the opening world a choice. Which frame of which world you see first, at what angle and lighting, is a per-world art decision and it is currently the same camera for all 120.',k:'DRAW',e:'M',i:3},
{c:'sig',t:'Lighting per world',d:'Mercury at 6.7 solar constants, Pluto at 0.001. Exposure, contrast and colour temperature should differ enormously and the realism backlog\'s eye-adaptation work is the mechanism.',k:'DRAW',e:'M',i:3},
{c:'sig',t:'The sky from the surface',d:'Titan\'s orange gloom, Mars\'s butterscotch with a blue sunset, the Moon\'s black noon, Europa with Jupiter filling a third of the sky. The sky is half of what a place feels like.',k:'DRAW',e:'M',i:3},
{c:'sig',t:'Sound per world',d:'`audio.js` layers a soundscape and it is Earth\'s. Wind needs an atmosphere; an airless world is silent; a dense atmosphere carries low frequencies. It is a strong identity cue almost nobody uses.',k:'DRAW',e:'M',i:2},
{c:'sig',t:'A world should be recognisable at every zoom rung',n:['sigtest'],d:'The living backlog established the zoom contract. Identity has to survive from orbital thumbnail to the ground, and the surface backlog\'s `detailfield` is where the fine grain comes from.',k:'DRAW',e:'M',i:3},
{c:'sig',t:'Avoid the uniform-grey failure mode',d:'Half the bodies in the Solar System are grey rock or dirty ice and the temptation is to make them all the same grey. Real albedo differences between Callisto, Ganymede, the Moon and Mercury are measurable and larger than they look.',k:'DRAW',e:'M',i:2},
{c:'sig',t:'A contact sheet of every world',n:['sigtest'],d:'`capture-site.mjs` already renders screenshots. One hundred and twenty thumbnails on one page, regenerated on every change, is the most useful review artefact this product could have.',k:'PROVE',e:'M',i:3},
{c:'sig',t:'Measure pairwise distinguishability',n:['sigtest'],d:'Compute a perceptual distance between every pair of world thumbnails. The pairs that are too close are the ones sharing a stamp, and today that would find the Io cluster instantly.',k:'PROVE',e:'M',i:3},
{c:'sig',t:'Say which parts of a signature are measured',d:'Mercury\'s albedo is measured. TRAPPIST-1e\'s appearance is entirely extrapolated. A visual honesty label per world is a realism-backlog item and it matters most here.',k:'PROVE',e:'M',i:3},
{c:'sig',t:'Do not let the god layer erase a signature',d:'The tools can raise crust and paint life anywhere. A player who terraforms Mars should get a Mars that has been terraformed and still reads as Mars, not a generic green world.',k:'PLAY',e:'M',i:2},
{c:'sig',t:'A world card worth sharing',d:'Thumbnail, seven axis values, signature landform, palette, one sentence. It is the artefact somebody posts, and every field on it already exists or is in this document.',k:'DRAW',e:'M',i:3},
{c:'sig',t:'Compare a render against the reference photograph',n:['sigtest'],d:'Histogram, dominant hue, land–sea or light–dark contrast, limb profile. For every Solar System body there is a public image to check against, which is the only external truth the picture has.',k:'PROVE',e:'M',i:3},
{c:'sig',t:'Regression on identity, not just on pixels',n:['sigtest'],d:'A rendering change that makes Europa look slightly different is fine. One that makes Europa look like Ganymede is a bug, and only a pairwise-distance test catches the difference.',k:'PROVE',e:'M',i:3},
];

const P5 = [
/* --------------------------------------------------------------- epoch -- */
{c:'epoch',t:'An epoch is currently two fields',g:'epochobj',d:'`eraPatch(eraId)` returns `{ deepTime, startAgeGa }` and nothing else. Five presets — present, origin, Cambrian, Permian, 10 ka. An epoch should be a complete world specification: land configuration, sea level, atmospheric composition, biosphere state, ice extent, palette and landform set.',k:'MODEL',e:'L',i:3},
{c:'epoch',t:'No world except Earth has a history you can visit',n:['epochobj'],d:'`availableEras(rule)` returns `rule?.earthLike ? ERA_PRESETS : []`. Venus with oceans, early Mars with rivers, a young hot Io and a pre-collapse Titan are among the most interesting worlds in the catalogue and none of them is reachable.',k:'MODEL',e:'M',i:3},
{c:'epoch',t:'Hadean Earth',n:['epochobj'],d:'Magma ocean cooling, no continents, a steam atmosphere, a Moon three times closer with tides to match, and a bombardment still running. It is the most visually different Earth there has ever been and the tidal machinery is already in the model.',k:'MODEL',e:'M',i:3},
{c:'epoch',t:'Archean Earth',n:['epochobj'],d:'Green-grey iron-rich ocean, no oxygen, purple or green microbial mats, a faint young Sun and a methane greenhouse holding it up. The life pass produces the biosphere; this makes it a place you can start.',k:'MODEL',e:'M',i:3},
{c:'epoch',t:'Snowball Earth',n:['epochobj'],d:'`W.state === \'snowball\'` exists as a climate state that lerps colour toward white. As an epoch it is a startable world with its own hysteresis, its own escape route through volcanic CO₂, and a bifurcation the player can push either way.',k:'MODEL',e:'M',i:3},
{c:'epoch',t:'Carboniferous Earth',n:['epochobj'],d:'Thirty-five per cent oxygen, giant arthropods, coal swamps burying carbon because nothing could digest lignin yet. It is the clearest case in the record of biology changing the atmosphere and the life pass already has the mechanism.',k:'MODEL',e:'M',i:3},
{c:'epoch',t:'Cretaceous Earth',n:['epochobj'],d:'No polar ice, sea level 200 m higher, an interior seaway across North America. It is the standard hothouse and the best available test of the sea-level and circulation machinery.',k:'MODEL',e:'M',i:2},
{c:'epoch',t:'Earth at the last glacial maximum',n:['epochobj'],d:'Sea level 120 m lower, Beringia open, continental ice to 40° north. It is well constrained, it is only 20,000 years ago, and it is the cheapest epoch to validate against.',k:'MODEL',e:'M',i:3},
{c:'epoch',t:'Earth in 50 million years',n:['epochobj'],d:'Africa closing the Mediterranean, Australia into Asia, the Atlantic wider. Plate motions are already in the model and running them forward is one of the few genuinely predictive things it can do.',k:'MODEL',e:'M',i:3},
{c:'epoch',t:'Earth at the end',n:['epochobj'],d:'A brightening Sun, silicate weathering failing, CO₂ below the C4 threshold, then a moist greenhouse, then oceans gone. `faintYoungStar` already models the luminosity track in both directions.',k:'MODEL',e:'M',i:3},
{c:'epoch',t:'Venus with an ocean',n:['epochobj'],d:'Possibly habitable for two billion years before the runaway. It is the same world in a different region of the world space and it is the best possible demonstration that the space is continuous.',k:'MODEL',e:'M',i:3},
{c:'epoch',t:'Early Mars',n:['epochobj'],d:'Valley networks, a possible northern ocean, a magnetic field, and a thicker atmosphere leaving. It is the most complete story of planetary volatile loss and every piece is in `exophysics.js`.',k:'MODEL',e:'M',i:3},
{c:'epoch',t:'Palaeogeography needs a real land configuration',n:['epochobj'],d:'Pangaea is one of the thirteen landscape archetypes; Rodinia and Pannotia are not. An epoch that only changes the clock and not the map is a lighting change.',k:'MODEL',e:'M',i:3},
{c:'epoch',t:'An epoch needs its own palette',n:['epochobj'],d:'The surface backlog wants a ramp per era. A green Archean ocean, a white Cryogenian, a Carboniferous with no grass, a Cretaceous with no ice. Colour is most of what makes an epoch feel different.',k:'DRAW',e:'M',i:3},
{c:'epoch',t:'An epoch should be shareable',n:['epochobj'],d:'The seed-word system encodes a world in four words. An epoch is another coordinate and the same encoding carries it, so "Archean Earth, this seed" is a link.',k:'PLAY',e:'M',i:2},
{c:'epoch',t:'Starting in an epoch is not the same as arriving in one',n:['epochobj'],d:'A world initialised into the Carboniferous has no history behind it and a world that ran there does. Say which one the player is in, because everything about the record depends on it.',k:'MODEL',e:'M',i:2},
{c:'epoch',t:'Epoch as a scenario with a question',n:['epochobj'],d:'`god/scenarios.js` exists. "Stop the snowball", "keep Venus wet", "get through the Permian" are goals that use the whole engine and that a player can lose.',k:'PLAY',e:'M',i:3},
{c:'epoch',t:'The epoch picker should show pictures',n:['epochobj'],d:'The landscape backlog replaced a seed field with a nine-globe picker. Epochs deserve the same: a strip of thumbnails of the same world at six moments, which is also the clearest way to show deep time exists.',k:'DRAW',e:'M',i:3},
{c:'epoch',t:'Epoch data with sources',n:['epochobj'],d:'Sea level, CO₂, O₂, mean temperature and ice extent for each epoch are published with uncertainties. This is one of the most citable tables in the product and it should carry its references.',k:'PROVE',e:'M',i:3},
{c:'epoch',t:'Assert each epoch against its proxies',n:['epochobj'],d:'`calibrate.mjs` asserts modern Earth. Asserting the last glacial maximum and the Cretaceous hothouse would test the model across a range of states rather than at one point.',k:'PROVE',e:'M',i:3},

/* ---------------------------------------------------------------- hist -- */
{c:'hist',t:'A world\'s history is a path through the world space',g:'traj',n:['worldaxes'],d:'Venus moving right along insolation as the Sun brightened until it crossed the runaway threshold. Mars falling out of atmospheric retention as its dynamo died. Drawing those paths on the same plot as the catalogue turns a classification into an explanation.',k:'MODEL',e:'L',i:3},
{c:'hist',t:'Thresholds crossed, with hysteresis',n:['traj'],d:'Runaway greenhouse, atmospheric collapse, snowball onset and escape, the mobile-to-stagnant lid transition. Each is a surface in the space that a trajectory can cross, and several are irreversible on any human timescale.',k:'MODEL',e:'L',i:3},
{c:'hist',t:'Volatile loss integrated over time',d:'`integratedXuvDose` and `retainsAtmosphere` exist. A world\'s present atmosphere is the residue of four billion years of escape and it is the single most consequential number the engine could compute and does not.',k:'MODEL',e:'M',i:3},
{c:'hist',t:'The dynamo dies and the atmosphere goes',d:'Mars\'s magnetic field failed early and the solar wind stripped what was left. `magnetosphere` exists on the ruleset as a constant; making it a consequence of core state and age links the interior to the sky.',k:'MODEL',e:'M',i:3},
{c:'hist',t:'Stellar evolution as the driver of everything slow',d:'`faintYoungStar` models the luminosity track. Over four billion years the Sun brightened by 30%, which is the forcing behind the faint young sun paradox, the eventual end of Earth\'s biosphere, and the habitable zone moving outward.',k:'MODEL',e:'M',i:3},
{c:'hist',t:'Orbital migration',d:'Hot Jupiters did not form where they are. Migration reshapes systems and the `arch` category has ten of them — including one with six planets inside Mercury\'s orbit.',k:'MODEL',e:'M',i:2},
{c:'hist',t:'Giant impacts as history-defining events',d:'The Moon-forming impact, Uranus\'s tilt, Mercury\'s stripped mantle, Pluto\'s Charon. Several worlds in this catalogue are what they are because of one collision.',k:'MODEL',e:'M',i:3},
{c:'hist',t:'Tidal evolution moves the Moon and slows the day',d:'`tides.js` computes range from a moon distance. The Moon has receded from about 20 Earth radii and Earth\'s day has lengthened from perhaps six hours. Both are computable and both change the Hadean picture completely.',k:'MODEL',e:'M',i:3},
{c:'hist',t:'Resurfacing history explains the crater record',n:['craters','resurf'],d:'A surface\'s crater density is its age since last resurfacing. Venus is uniformly ~700 Myr because it resurfaced globally; Io is zero everywhere; the lunar highlands are 4.4 Gyr. One mechanism, four completely different worlds.',k:'MODEL',e:'M',i:3},
{c:'hist',t:'Titan\'s methane is running out',d:'Photolysis destroys atmospheric methane faster than any known source replaces it, so Titan\'s current state may be transient. It is one of the clearest cases of a world being caught mid-transition.',k:'MODEL',e:'M',i:2},
{c:'hist',t:'A history readout per world',n:['traj'],d:'What this world was, what changed it, and where it is going. Every Solar System body has one and the exoplanets have plausible ones; it is the paragraph that makes a body a story.',k:'DRAW',e:'M',i:3},
{c:'hist',t:'Run a world\'s history forward from an earlier state',n:['traj','epochobj'],d:'Start Venus wet and see whether the model produces the runaway on its own. That is the strongest possible validation of the coupled climate and volatile systems, and it is a scenario a player can watch.',k:'PLAY',e:'L',i:3},
{c:'hist',t:'Counterfactual histories',n:['traj'],d:'Venus 10% further out. Earth without the Moon. Mars at Earth\'s mass. The engine is one parameter change away from each and the answers are genuinely contested science.',k:'PLAY',e:'M',i:3},
{c:'hist',t:'The trajectory should be visible while you play',n:['traj','spaceviz'],d:'A moving dot on the world-space plot as the run proceeds. It makes the abstract space concrete and it shows a threshold approaching before it is crossed.',k:'DRAW',e:'M',i:3},
{c:'hist',t:'Rate of change matters as much as state',d:'A world warming at a degree per century and one at a degree per million years are different worlds at the same temperature. The chronicle already timestamps; the derivative is what makes an event urgent.',k:'MODEL',e:'M',i:2},
{c:'hist',t:'Not every history is a decline',d:'Earth got more habitable for three billion years. Oxygenation, the ozone shield and the land biosphere were all improvements, and a product that only models loss teaches the wrong lesson.',k:'MODEL',e:'M',i:2},
{c:'hist',t:'A world\'s age should be on the card',d:'`SEED_WORLDS` has no age column and age is the axis that makes crater density, radiogenic heat and atmospheric loss interpretable. Add it, with uncertainty.',k:'PROVE',e:'M',i:3},
{c:'hist',t:'Systems have histories too',d:'The `arch` category has a system older than the galaxy\'s thin disc and one packed inside Mercury\'s orbit. Stability, resonance and migration are system-level properties and `orbitsStable` already exists.',k:'MODEL',e:'M',i:2},
{c:'hist',t:'Say which history is measured and which is inferred',n:['traj'],d:'The lunar bombardment record is measured from returned samples. Venus\'s ocean is inferred and contested. TRAPPIST-1e\'s history is entirely modelled. Three different confidence levels presented identically today.',k:'PROVE',e:'M',i:3},
{c:'hist',t:'Assert a trajectory against a known outcome',n:['traj'],d:'Run Earth from 4.5 Ga with the real solar track and check it is still habitable at the present. It is the strongest single integration test the engine could have and the deep-time probe is most of the harness.',k:'PROVE',e:'L',i:3},

/* -------------------------------------------------------------- techno -- */
{c:'techno',t:'The technosphere is one float and four thresholds',g:'technolayer',d:'`W.build[c]` is a scalar; `settleCities` thresholds it into camp / village / town / city; population comes from one formula; `cityLights` makes night lights. Thirty-five read sites and no physics. A civilisation is currently the only planetary process in this engine with no energy budget.',k:'MODEL',e:'L',i:3},
{c:'techno',t:'Energy use as the defining variable',n:['technolayer'],d:'A technosphere is measurable in watts, and its ratio to the insolation the planet receives is the number that decides whether it shows up in the picture at all. Humanity is at about 0.01% of Earth\'s absorbed sunlight; the interesting states are far above that.',k:'MODEL',e:'M',i:3},
{c:'techno',t:'Waste heat is thermodynamically unavoidable',n:['technolayer'],d:'Every watt used becomes heat. Past roughly one per cent of absorbed insolation it is a climate forcing on its own, independent of any greenhouse effect, and it is the hard limit on any planet-bound civilisation.',k:'MODEL',e:'M',i:3},
{c:'techno',t:'Emissions as a coupling into the carbon model',n:['technolayer'],d:'`carbon.js` has reservoirs and a burial path. A technosphere that oxidises buried carbon is running the carbon cycle backwards at a rate a thousand times faster than the geology, which is the actual story of the present epoch.',k:'MODEL',e:'M',i:3},
{c:'techno',t:'Land use as a surface cover',n:['technolayer'],d:'Cropland, pasture, forestry, urban, mine, reservoir. Roughly half of Earth\'s habitable land is now used, its albedo has changed, and none of it is representable in a `build` float.',k:'MODEL',e:'M',i:3},
{c:'techno',t:'Resource extraction with a depletion curve',n:['technolayer'],d:'`W.ore` exists. A technosphere that draws down a finite stock and gets harder to sustain as it does is a far more interesting object than one that grows monotonically.',k:'MODEL',e:'M',i:2},
{c:'techno',t:'Infrastructure as a network, not a density',n:['technolayer'],d:'Roads, grids, ports and cables connect settlements and their pattern follows terrain, rivers and coastlines. A network is drawable at every zoom rung and a density field is not.',k:'MODEL',e:'M',i:2},
{c:'techno',t:'Population from carrying capacity, with a technology term',n:['technolayer'],d:'`settleCities` already multiplies NPP, soil, moisture and a technology proxy. Making that a real carrying-capacity calculation with agriculture, trade and energy is what makes population respond to the planet.',k:'MODEL',e:'M',i:2},
{c:'techno',t:'A technosphere should be able to fail',n:['technolayer'],d:'Overshoot, collapse, fragmentation, recovery. `god/economy.js` has an overshoot warning for the player; the civilisation has no equivalent for itself.',k:'MODEL',e:'M',i:3},
{c:'techno',t:'The technosphere is a successor in the tick order',n:['technolayer'],d:'The life pass established the tick order for the biosphere. A technosphere slots after it, reads the same fields, and writes to climate, carbon, land cover and albedo — with the same discipline about who owns what.',k:'MODEL',e:'M',i:3},
{c:'techno',t:'Authored as data, like the life grammar',n:['technolayer'],d:'`vr/data/techno/*.json`: capability tiers, energy sources, their power densities, their emissions, their land footprints, their prerequisites. A validating compiler, the same as `lifegrammar.mjs`.',k:'MODEL',e:'M',i:3},
{c:'techno',t:'Energy sources with real power densities',n:['technolayer'],d:'Biomass, hydro, fossil, fission, fusion, orbital solar — each has a power density per square metre and a footprint. Which one a civilisation is on decides how much land it needs and how hot it runs.',k:'MODEL',e:'M',i:2},
{c:'techno',t:'The biosignature changes',n:['technolayer'],d:'The life pass computes disequilibrium and a transit spectrum. A technosphere adds CFCs, NO₂ and a very different seasonal cycle — and it removes the biological one. That contrast is the technosignature literature in one chart.',k:'MODEL',e:'M',i:3},
{c:'techno',t:'Night lights already exist and mean almost nothing',d:'`cityLights` returns a scalar from city count and mean build. Night side illumination is the single most recognisable technosignature and it should follow the settlement network and the energy budget.',k:'DRAW',e:'M',i:3},
{c:'techno',t:'Radio leakage and directed emission',n:['technolayer'],d:'The life pass computes which bands a world delivers and radio is one of them. A technosphere that emits in a band nothing biological uses is the cleanest possible signal.',k:'MODEL',e:'M',i:2},
{c:'techno',t:'Show the technosphere as a layer',n:['technolayer'],d:'An overlay of energy use, land use and waste heat. The surface backlog\'s `inklayer` is the mechanism and this is one of the more legible things to put in it.',k:'DRAW',e:'M',i:3},
{c:'techno',t:'A technosphere on a world that is not Earth',n:['technolayer'],d:'The catalogue has 120 bodies. A civilisation on a tidally locked M-dwarf world, or under an ice shell, faces completely different constraints — which is exactly the kind of question the taxonomy makes askable.',k:'MODEL',e:'M',i:2},
{c:'techno',t:'The player\'s hand and the civilisation\'s hand',d:'`W.attribution` already splits change between the player and the planet. A third agent that acts with intent is a genuinely different thing and the attribution model should have a column for it.',k:'PLAY',e:'M',i:3},
{c:'techno',t:'Assert against the present Earth',n:['technolayer'],d:'Roughly 20 TW of primary energy, 0.01% of absorbed insolation, half the habitable land used, 420 ppm CO₂. Four numbers, all measured, all a calibration target.',k:'PROVE',e:'M',i:3},
{c:'techno',t:'Say what is modelled and what is speculation',n:['technolayer'],d:'Waste heat is physics. Fusion power density is engineering. A self-replicating swarm is speculation. The same three-tag discipline the life grammar uses.',k:'PROVE',e:'M',i:3},
];

const P6 = [
/* ---------------------------------------------------------------- mega -- */
{c:'mega',t:'Albedo engineering as the cheapest planetary lever',g:'megaeng',n:['technolayer'],d:'Surface brightening, stratospheric aerosol, marine cloud brightening. All three are real proposals with published forcing estimates, all three are a change to a field the climate model already has, and all three have side effects the model can show.',k:'MODEL',e:'M',i:3},
{c:'mega',t:'An orbital shade at L1',n:['megaeng'],d:'A statite or a swarm at the inner Lagrange point reduces insolation by a stated percentage. `W.solarShade` already exists as a scalar in the HUD; making it an object with a mass, a cost and a failure mode makes it a decision.',k:'MODEL',e:'M',i:3},
{c:'mega',t:'Atmospheric processing',n:['megaeng'],d:'Adding a greenhouse gas to warm Mars, removing CO₂ from Venus, thickening an atmosphere a world cannot retain. Each has a mass budget and a timescale, and `retainsAtmosphere` says which ones are futile.',k:'MODEL',e:'M',i:3},
{c:'mega',t:'Terraforming as a long project with a failure mode',n:['megaeng'],d:'The interesting part is not whether it works but what maintains it. A world outside its own stable region needs continuous work, and the moment the work stops it goes back. That is a far better model than a success state.',k:'PLAY',e:'L',i:3},
{c:'mega',t:'Paraterraforming and enclosed habitats',n:['megaeng'],d:'Covering part of a world rather than changing all of it is orders of magnitude cheaper and it is a distinctive visual: a planet with a lid on part of it.',k:'MODEL',e:'M',i:2},
{c:'mega',t:'Orbital rings, elevators and mass drivers',n:['megaeng'],d:'Structures visible from the surface and from orbit, with real material limits. They are the first technosphere elements that change the *silhouette* of a world rather than its surface.',k:'DRAW',e:'M',i:2},
{c:'mega',t:'Spin-up, spin-down and moving a moon',n:['megaeng'],d:'Rotation rate drives banding, Coriolis and the day. Tidal machinery already models a moon\'s distance. Changing either is an enormous, slow, expensive intervention with consequences everywhere.',k:'PLAY',e:'M',i:2},
{c:'mega',t:'Moving a planet',n:['megaeng'],d:'A gravity tractor or a stellar engine, over millions of years, to keep a world in a habitable zone that is moving outward. It is the logical endpoint of `hist` and it is a real proposal.',k:'MODEL',e:'M',i:1},
{c:'mega',t:'A Dyson swarm is a system-scale object',n:['megaeng'],d:'Not a shell — a swarm of collectors, each in an orbit, intercepting a fraction of the star\'s output. It changes the star\'s apparent spectrum and dims it in a characteristic way, which is a technosignature with actual observational literature.',k:'MODEL',e:'L',i:2},
{c:'mega',t:'Every megastructure needs a material and a mass budget',n:['megaeng'],d:'The reason these are hard is not energy but material strength and total mass. Stating both, and where the mass came from, is what separates a plan from a picture.',k:'PROVE',e:'M',i:3},
{c:'mega',t:'Waste heat sets the ceiling on all of it',n:['megaeng'],d:'Every megastructure is ultimately limited by radiating area. It is the same physics as the technosphere\'s heat budget and it is what makes the answers finite.',k:'MODEL',e:'M',i:3},
{c:'mega',t:'Engineering should be visible from orbit',n:['megaeng'],d:'Regular geometry, unnatural albedo boundaries, straight lines. Nature does not do straight lines at planetary scale, which is precisely why they read instantly.',k:'DRAW',e:'M',i:3},
{c:'mega',t:'Ruins of engineering',n:['megaeng'],d:'A half-finished ring, a failed shade, an abandoned terraform reverting. The visual language of a project that stopped is more interesting than one that succeeded.',k:'DRAW',e:'M',i:3},
{c:'mega',t:'The ethics belong here',n:['megaeng'],d:'The god backlog raises the morality of intervention. Terraforming a world that already has a biosphere is the sharpest version of that question and the product should be willing to ask it.',k:'PLAY',e:'M',i:2},
{c:'mega',t:'Price megaprojects on the same ledger as miracles',n:['megaeng'],d:'`god/economy.js` has a thermodynamic cost model for player acts. A megastructure is the same kind of object at a different scale and using one ledger for both is unusual and correct.',k:'PLAY',e:'M',i:2},
{c:'mega',t:'A planetary engineering scenario',n:['megaeng'],d:'"Make Mars habitable and keep it that way for ten thousand years." It exercises volatile inventory, atmospheric retention, climate, biosphere seeding and maintenance, and it can be lost.',k:'PLAY',e:'M',i:3},
{c:'mega',t:'Kardashev as a readout, not a badge',n:['megaeng'],d:'The scale is a logarithm of power use and the product would be computing that number anyway. Showing it as a continuous quantity rather than a tier avoids the usual nonsense.',k:'DRAW',e:'S',i:2},
{c:'mega',t:'Engineering leaves a geological record',n:['megaeng','colfield'],d:'Concrete, plastics, radionuclides, a spike in metals. The Anthropocene debate is exactly about whether this is a stratigraphic boundary, and the column is where it would appear.',k:'MODEL',e:'M',i:2},
{c:'mega',t:'What a megastructure does to the sky',n:['megaeng'],d:'An orbital ring is visible from the ground as an arc; a swarm dims the star from inside. The sky is the other half of what engineering looks like and the product renders skies.',k:'DRAW',e:'M',i:2},
{c:'mega',t:'Label all of it speculative',n:['megaeng'],d:'None of this has been observed anywhere. The forcing numbers for aerosol injection are real; a Dyson swarm is not. Same three-tag discipline, applied strictly, because this is the category most likely to be mistaken for a claim.',k:'PROVE',e:'S',i:3},

/* --------------------------------------------------------------- after -- */
{c:'after',t:'A post-biological layer with its own thermodynamics',g:'postbio',n:['technolayer'],d:'Not a narrative ending but a planetary state: computation as the dominant energy sink, waste heat as the dominant surface flux, and a self-replication term with different constraints from biology. It slots into the tick order after life, reads the same fields, and is authored as data.',k:'MODEL',e:'L',i:3},
{c:'after',t:'Computation has a thermodynamic floor',n:['postbio'],d:'Landauer\'s limit puts a minimum energy on erasing a bit, and the temperature it runs at sets that floor. A cold world is therefore a *better* substrate for computation than a warm one, which inverts the whole habitability intuition.',k:'MODEL',e:'M',i:3},
{c:'after',t:'A computronium world is cold on purpose',n:['postbio'],d:'If the limit is thermal, the optimal move is to migrate outward and radiate. That is a genuine argument in the literature and it makes the outer Solar System the interesting real estate, which is a startling thing for this product to be able to show.',k:'MODEL',e:'M',i:3},
{c:'after',t:'Self-replication with real constraints',n:['postbio'],d:'The life pass has population dynamics, resource limits and mutation. A replicating machine population uses the same machinery with different numbers — no metabolism, different materials, different failure modes.',k:'MODEL',e:'M',i:3},
{c:'after',t:'Resurfacing by machinery',n:['postbio'],d:'A technosphere that disassembles and rebuilds a surface at scale is a geological process with a rate, and `resurf` is the axis it moves. It is the only resurfacing mechanism in this document with intent behind it.',k:'MODEL',e:'M',i:2},
{c:'after',t:'The signature of a post-biological world',n:['postbio'],d:'No seasonal CO₂ cycle, no red edge, a thermal excess, geometric surface structure, and possibly an unnaturally narrow spectral feature. Every one of those is computable in the existing spectrum path.',k:'MODEL',e:'M',i:3},
{c:'after',t:'The transition, not the endpoint',n:['postbio'],d:'The interesting state is the fifty thousand years where a biosphere and a technosphere overlap and compete for the same energy and land. An endpoint is a picture; a transition is a simulation.',k:'MODEL',e:'M',i:3},
{c:'after',t:'It may not be an ending',n:['postbio'],d:'A technosphere that stabilises its planet, maintains a biosphere and lasts a billion years is as plausible as collapse and much less often modelled. The product should be able to produce both.',k:'MODEL',e:'M',i:3},
{c:'after',t:'Ruins as a surface class',n:['postbio'],d:'Structure decaying at a rate set by the environment. On an airless world it lasts effectively forever; in a wet biosphere it is gone in centuries. That contrast is a good teaching moment about erosion.',k:'MODEL',e:'M',i:2},
{c:'after',t:'A dead technosphere leaves a signature that fades',n:['postbio'],d:'Radionuclides with known half-lives, a metals anomaly, a plastic layer, orbital debris decaying. Each has a timescale and together they say how long a civilisation is detectable after it stops.',k:'MODEL',e:'M',i:2},
{c:'after',t:'Life after the technosphere',n:['postbio'],d:'The life pass models recovery after mass extinction. A biosphere reoccupying an engineered world, growing through the structures, is one of the more evocative states this engine could reach.',k:'MODEL',e:'M',i:3},
{c:'after',t:'Uplift, uploading and other things to name carefully',n:['postbio'],d:'The product is a planetary simulator, not a philosophy engine. Model the planetary consequences — energy, heat, land, signature — and leave the interior question alone rather than pretending to answer it.',k:'MODEL',e:'M',i:2},
{c:'after',t:'A post-biological world in the catalogue',n:['postbio'],d:'None of the 120 bodies is one. Adding a small set of speculative worlds, clearly labelled, extends the catalogue into a region the axes allow and observation has never sampled.',k:'MODEL',e:'M',i:2},
{c:'after',t:'The Fermi question, posed rather than answered',n:['postbio'],d:'Once the engine can produce a technosphere and a signature, the honest thing is to let the player see how loud one would be and how long it lasts. That is the actual content of the argument.',k:'PLAY',e:'M',i:2},
{c:'after',t:'A great filter as a threshold in the world space',n:['postbio','traj'],d:'If there is one, it is a surface in the same space as the runaway greenhouse. Drawing candidate filters as regions is a legitimate way to present a contested idea without asserting it.',k:'DRAW',e:'M',i:2},
{c:'after',t:'What the player is, in this frame',n:['postbio'],d:'The god layer already asks who is acting. A post-biological successor is another agent with intent, and the attribution model that already splits player from planet needs a third column.',k:'PLAY',e:'M',i:2},
{c:'after',t:'It should be reachable by playing, not by picking',n:['postbio'],d:'A state you arrive at because your biosphere produced a technosphere that got large enough is worth far more than a menu entry, and every prerequisite is in this document.',k:'PLAY',e:'L',i:3},
{c:'after',t:'The finale artefact should carry it',n:['postbio'],d:'`finale.js` produces an end-of-run artefact. What the world became, how much energy it used, what it left, and how long the signature lasts, is the ending this product has been building toward.',k:'DRAW',e:'M',i:3},
{c:'after',t:'Keep it falsifiable where it can be',n:['postbio'],d:'Landauer\'s limit is physics. Radiating area is physics. Migration outward is an argument. Everything else is fiction and must be labelled, because this is the category where a simulator most easily becomes a story.',k:'PROVE',e:'M',i:3},
{c:'after',t:'A test that the thermodynamics closes',n:['postbio'],d:'Energy in, computation done, heat radiated. If the budget does not balance the whole category is decoration, and the check is a few lines.',k:'PROVE',e:'M',i:3},

/* --------------------------------------------------------------- biome -- */
{c:'biome',t:'Seasonality as the third axis',g:'biomeaxes',d:'`classifyBiome` uses annual temperature and annual precipitation and cannot separate a monsoon forest from a rainforest or a Mediterranean scrub from a steppe. When the rain falls matters as much as how much falls, and the seasonal machinery exists.',k:'MODEL',e:'M',i:3},
{c:'biome',t:'Substrate as the fourth axis',n:['biomeaxes','substratefield'],d:'Limestone gives karst, serpentine gives a distinctive flora, sand gives a dune ecosystem, peat gives a bog. Two identical climates on two rocks are two different biomes, and this is where the substrate table pays off biologically.',k:'MODEL',e:'M',i:3},
{c:'biome',t:'Jungle is not one thing',n:['biomeaxes'],d:'`tropRainforest` is one entry. Lowland rainforest, montane cloud forest, mangrove, flooded várzea, monsoon forest and bamboo are six biomes with different structures, and the tropics are where most of the planet\'s diversity is.',k:'MODEL',e:'M',i:3},
{c:'biome',t:'Cloud forest needs a cloud base',n:['biomeaxes'],d:'A montane forest fed by fog at a specific elevation band. It requires the surface backlog\'s vapour field and it is one of the most visually distinctive biomes there is.',k:'MODEL',e:'M',i:2},
{c:'biome',t:'Mangrove and salt marsh at the coast',n:['biomeaxes'],d:'A biome defined by salinity and tidal range rather than by temperature and rainfall. `W.intertidal` exists and feeds one desiccation term.',k:'MODEL',e:'M',i:2},
{c:'biome',t:'Wetlands, peat and bog',n:['biomeaxes'],d:'Defined by drainage, not climate — waterlogged ground where organic matter accumulates instead of decaying. They are a major carbon reservoir and they need the drainage network to exist.',k:'MODEL',e:'M',i:3},
{c:'biome',t:'Karst as a biome as well as a landform',n:['biomeaxes','substratefield'],d:'No surface water, thin soil, caves, endemic species in isolated towers. It is where the landform grammar and the biome model are the same question.',k:'MODEL',e:'M',i:2},
{c:'biome',t:'Salt flat and playa',n:['biomeaxes'],d:'Almost no life, extremely high albedo, and a distinctive crust pattern. One of the brightest surfaces on any planet and a biome by absence.',k:'MODEL',e:'M',i:2},
{c:'biome',t:'Dune sea as an ecosystem',n:['biomeaxes'],d:'Mobile substrate, no soil, life concentrated at interdune water. It exists on Earth, on Titan and probably on Mars, which makes it one of the few genuinely cross-world biomes.',k:'MODEL',e:'M',i:2},
{c:'biome',t:'Permafrost polygon and thermokarst',n:['biomeaxes'],d:'Patterned ground on a scale of tens of metres, and a carbon reservoir that is currently moving. The pattern is a landform and the ecology on it is a biome.',k:'MODEL',e:'M',i:2},
{c:'biome',t:'Geyser field and hot spring',n:['biomeaxes'],d:'Extremophile mats with distinctive colour bands set by temperature. `W.vent` exists and the life pass has the chemistry; this is where the two meet visibly.',k:'MODEL',e:'M',i:2},
{c:'biome',t:'Alpine as a real zone, not a temperature',n:['biomeaxes'],d:'Above treeline: wind, UV, a short season and a distinctive growth form. It is an elevation biome and elevation currently only reaches the classifier through temperature.',k:'MODEL',e:'M',i:2},
{c:'biome',t:'Ocean biomes deserve more than five',d:'`reef`, `upwelling`, `gyre`, `vent`, `deep`. Kelp forest, seagrass, polar marginal ice, oxygen minimum zone, seamount and abyssal plain are all distinct and the ocean is 71% of the planet.',k:'MODEL',e:'M',i:3},
{c:'biome',t:'Biome names should not all be Earth\'s',d:'"boreal", "tempDeciduous", "tropRainforest". On a world with a different star, a different day length and a different chemistry these words are wrong, and using them asserts something false silently.',k:'MODEL',e:'M',i:2},
{c:'biome',t:'A biome should be derivable, not enumerated',n:['biomeaxes'],d:'The endpoint is not a longer list but a function from environment to structure — canopy height, cover fraction, leaf strategy, root depth, seasonality — with the names as labels on regions of that space.',k:'MODEL',e:'L',i:3},
{c:'biome',t:'Vegetation structure over vegetation name',n:['biomeaxes'],d:'What the renderer needs is height, density, colour and seasonality, not a string. Deriving structure directly makes the picture right even where the name is wrong.',k:'DRAW',e:'M',i:3},
{c:'biome',t:'Biomes on a world with a different star',n:['biomeaxes'],d:'The life pass showed an M-dwarf world\'s best imaging band is red and weak. Vegetation there would be structured for a different photon budget, which changes canopy strategy and therefore biome structure.',k:'MODEL',e:'M',i:3},
{c:'biome',t:'A Whittaker plot with the extra axes',n:['biomeaxes'],d:'The surface backlog wants the two-axis plot. With four axes it becomes a small-multiple grid, which is how ecologists actually present it.',k:'PROVE',e:'M',i:2},
{c:'biome',t:'Biome area fractions against real Earth',n:['biomeaxes'],d:'The area of each biome on modern Earth is well known. It is the calibration target for the whole classification and it is currently unasserted.',k:'PROVE',e:'M',i:3},
{c:'biome',t:'Do not let the list grow without the axes',n:['biomeaxes'],d:'Adding names to a fifteen-entry list without adding the axes that separate them produces a classifier that cannot reach half its own categories. Axes first.',k:'MODEL',e:'S',i:3},

/* --------------------------------------------------------------- cover -- */
{c:'cover',t:'A hundred and seventeen worlds have no cover model',g:'covermodel',d:'Partial, first cut landed. Non-Whittaker bodies carry frost / lag / grain plus dust. `coverAt` names frost, dust, lag, tholin, sulfur, evaporite, rays, mats or regolith. Grain, Iapetus/Enceladus pins and cover.json landed. GPGPU cover is not this cut.',k:'MODEL',e:'L',i:3},
{c:'cover',t:'Frost as the commonest cover in the Solar System',n:['covermodel','phasediag'],d:'Landed, first cut. Seasonal CO₂ / N₂ frost is `W.frost`, painted by the cover overlay, feeding CPU albedo. Water frost on icy moons is still the ice-shell stamp.',k:'MODEL',e:'M',i:3},
{c:'cover',t:'Dust as a cover with a source and a sink',n:['covermodel'],d:'First cut. `gases.dust` still shades globally; `coverAt` reads `W.dust` as surface cover and `groundAlbedo` darkens toward 0.25. The loft/settle loop is the existing Mars signature tick, not a new dust budget.',k:'MODEL',e:'M',i:3},
{c:'cover',t:'Regolith and space weathering',n:['covermodel'],d:'First cut. Airless CPU albedo darkens with cell `age` (`1 - exp(-age/800)`). Fresh ejecta undoes it. Photograph globe still keys off kind.',k:'MODEL',e:'M',i:3},
{c:'cover',t:'Tholin haze deposit',n:['covermodel'],d:'First cut. Titan land stamped `tholin` reads as tholin cover. Not an accumulation rate from photochemistry.',k:'MODEL',e:'M',i:3},
{c:'cover',t:'Sulfur allotropes on Io',n:['covermodel'],d:'First cut. Cover overlay rgb follows cell T (pale / yellow / red / dark). The photograph globe stays the kind-keyed Io look.',k:'MODEL',e:'M',i:2},
{c:'cover',t:'Salt crust and evaporite',n:['covermodel'],d:'First cut. Ceres Occator ice cells stamp as evaporite substrate after generate. Cover overlay names them. Not a Europa salt-from-below cycle.',k:'MODEL',e:'M',i:2},
{c:'cover',t:'Ice grain size is an albedo variable',n:['covermodel'],d:'Landed, first cut. `W.grain` lerps frost 0.90 → 0.38. New frost resets toward fine; sitting frost coarsens. CPU albedo only.',k:'MODEL',e:'M',i:2},
{c:'cover',t:'Sublimation lag',n:['covermodel','phasediag'],d:'First cut. Frost retreat writes `W.lag`; lag darkens albedo until new frost buries it. Feedback exists in the CPU climate path only.',k:'MODEL',e:'M',i:2},
{c:'cover',t:'Ejecta rays as a cover, not a landform',n:['craters','covermodel'],d:'First cut. `coverAt` reads `W.ejecta` as `ray` on airless worlds. Brightens CPU albedo. Fade is space weathering, not topography. No ray stamp at generate.',k:'DRAW',e:'M',i:2},
{c:'cover',t:'Snow on a world with a different volatile',n:['covermodel','phasediag'],d:'Landed, first cut. Frost cover uses the cycle species\' albedo (CO₂ / N₂ / CH₄ rows). The photograph globe still paints kind, not cover.',k:'DRAW',e:'M',i:3},
{c:'cover',t:'Cover changes the thermal balance',n:['covermodel'],d:'Landed, first cut. CPU `groundAlbedo` mixes frost / dust / lag on non-Earth worlds. GPGPU climate does not read cover. Do not claim the GPU path.',k:'MODEL',e:'M',i:3},
{c:'cover',t:'Cover has a texture as well as a colour',n:['covermodel'],d:'The surface backlog\'s `detailfield` needs to know what it is texturing. Frost, dust, regolith and lag all have different grain and different behaviour at the sub-cell scale.',k:'DRAW',e:'M',i:2},
{c:'cover',t:'Biological cover is one case of a general model',n:['covermodel'],d:'First cut. Whittaker vegetation is `biome`; non-Whittaker life is `mat`. Same `coverAt` function.',k:'MODEL',e:'M',i:3},
{c:'cover',t:'Microbial cover on a world with no plants',n:['covermodel'],d:'First cut. Non-Whittaker cells with life > 0.18 read as `mat` in the cover overlay. Not a renderer for two billion years of Earth mats.',k:'DRAW',e:'M',i:3},
{c:'cover',t:'A cover overlay',n:['covermodel'],d:'Landed. Overlay id `cover` paints frost / dust / lag / tholin / sulfur / regolith from `coverAt`. After Phase in the View picker.',k:'DRAW',e:'S',i:3},
{c:'cover',t:'Cover thickness matters at the margin',n:['covermodel'],d:'A millimetre of frost changes the albedo completely and has no thermal mass. A metre of dust has both. Carrying thickness as well as fraction is what makes the feedbacks behave.',k:'MODEL',e:'M',i:2},
{c:'cover',t:'Cover in the local map',n:['covermodel'],d:'Landed, first cut. The local cell description tints frost white on non-Whittaker worlds. Kind look remains underneath.',k:'DRAW',e:'M',i:3},
{c:'cover',t:'Cover data with measured albedos',n:['covermodel'],d:'Landed, first cut. `vr/data/worlds/cover.json` compiled by `scripts/cover.mjs`. Fine/coarse albedo, rgb, tag, why, cite. Do not claim Bond albedo calibration except the Iapetus ratio / Enceladus-is-bright tests.',k:'PROVE',e:'M',i:3},
{c:'cover',t:'Assert hemispheric albedo against measurement',n:['covermodel'],d:'Landed, first cut. Iapetus leading/trailing CPU albedo ratio > 6. Enceladus hemispheric albedo > 0.55. Not a 0.81 Bond pin and not the photograph globe.',k:'PROVE',e:'M',i:3},

/* --------------------------------------------------------------- proof -- */
{c:'proof',t:'World definitions as authored data',g:'worlddata',d:'Foothold. `vr/data/worlds/` has `kinds.json`, `substrates.json`, `cover.json`, `processes.json`, `landforms.json` and `columns.json`, each with a compiler. Not 120 JSON files per body. Look is still code. Stamps are still code.',k:'MODEL',e:'L',i:3},
{c:'proof',t:'A validating compiler',n:['worlddata'],d:'Partial. `scripts/substrates.mjs`, `scripts/cover.mjs`, `scripts/landgram.mjs` and `scripts/columns.mjs` validate ids, tags, cites, process→form and recipe→layer links. Adding Pluto without JavaScript is still not the test this document asked for.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'Adding a world should be a data change',n:['worlddata'],d:'Today it is a regex, a stamp function, a paint function and a look-table entry. The test of this whole document is whether Pluto could be added by someone who cannot write JavaScript.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'Provenance on every world-level claim',n:['worlddata'],d:'`param-coverage.json` does this for orbital parameters. Substrate, landforms, cover and palette need the same measured / fitted / invented tagging, and for the 94 exoplanets almost everything is invented.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'The kind-resolution table, committed',n:['kindaudit'],d:'Landed. `vr/data/worlds/kinds.json` lists all 120 bodies with kind and why. Regenerated by `scripts/worldspace.mjs`; tests fail if live counts drift.',k:'PROVE',e:'S',i:3},
{c:'proof',t:'A world-space coverage report',n:['worldaxes'],d:'Landed, first cut. `worldAxesCoverage` reports per-axis min/max and names empty regions (no silicate volatile, nothing as rubble as 0.01 g⊕, …). Not a product page.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'A contact sheet of all 120 worlds',n:['sigtest'],d:'`capture-site.mjs` renders screenshots already. One page, 120 thumbnails, regenerated on every change. It is the review artefact that makes every claim in this document checkable by eye in five seconds.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'Golden images per world class',n:['worlddata'],d:'The surface backlog wants these; this document defines the classes they should cover — rocky, ocean, ice shell, airless, lava, giant, ice dwarf, engineered.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'A per-world calibration suite',n:['worlddata'],d:'`calibrate.mjs` asserts modern Earth. The catalogue\'s own blurb says it: "If the engine cannot reproduce Venus and Titan from first principles, every exoplanet it renders is decoration."',k:'PROVE',e:'L',i:3},
{c:'proof',t:'Assert that no two worlds share a stamp',n:['sigtest'],d:'The Io problem in one test. Compute the pairwise perceptual distance across the contact sheet and fail if any pair is below a threshold that is not physically justified.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'Measure how much each axis changes the picture',n:['worldaxes'],d:'Vary one axis, render, diff. An axis that does not change the picture is not wired in, and this is the only way to find out which of the seven are decorative.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'A world-model limits document',d:'`briefs/model-limits.md` covers the physics. This needs its own: no surface model for giants, one volatile with a phase diagram, eight Earth rocks, no cover model on 117 bodies, an epoch that is two fields.',k:'PROVE',e:'S',i:3},
{c:'proof',t:'Cite the planetary science',n:['worlddata'],d:'Partial. Ice triples cite Wagner/Pruß, Span/Wagner, Fray/Schmitt, Kargel, Sloan/Koh. Cover albedos cite Wiscombe/Warren, De Sanctis, Pieters. Not a bibliography for Rhines / Landauer.',k:'PROVE',e:'S',i:2},
{c:'proof',t:'One command that prints the state of the palette',n:['worlddata'],d:'Kinds resolved, axes computed, substrates in use, landforms available per world, cover models present, epochs reachable, and every unmet dependency in this document.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'Keep the catalogue and the engine in step',d:'`validateCatalogueWorlds` exists. Extend it: every body must resolve to a kind that has a substrate, a process set and a palette, or the build fails.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'Performance per world class',n:['worlddata'],d:'A giant with a turbulence solver, an ocean world with a deep column, an ice moon with a shell model. Each has a different cost profile and none has ever been measured.',k:'PROVE',e:'M',i:2},
{c:'proof',t:'Determinism across world types',n:['worlddata'],d:'The golden hash covers Earth. Every new world type is a new chance to introduce a non-deterministic path, and the seed-word system promises that a shared world is reproducible.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'A migration plan for the twenty-seven stamps',n:['landgram','worlddata'],d:'Each becomes a data entry plus a validation case. Do them in an order — the ones with the most catalogue bodies behind them first, which means the Io and Mars fallbacks before Iapetus.',k:'PROVE',e:'M',i:3},
{c:'proof',t:'Do not let the data become a lookup table',n:['worlddata'],d:'The failure mode of this whole document is 120 JSON files, one per body, which is the twenty-seven stamps with a different file extension. The data must describe *materials and processes*, and the worlds must be points in the space that selects them.',k:'MODEL',e:'M',i:3},
{c:'proof',t:'Ship the audit numbers with the document',n:['kindaudit'],d:'Landed for kind: `scripts/worldspace.mjs` prints the live kind histogram and writes `kinds.json`. Giants-as-land, eight Earth rocks, cover-model count and era-preset emptiness still need the same treatment as those models land.',k:'PROVE',e:'S',i:3},
];

const D = [...P1, ...P2, ...P3, ...P4, ...P5, ...P6];

/* ------------------------------------------------------------- derive -- */
D.forEach((x, i) => { x.id = i + 1; });

const byCat = (id) => D.filter((x) => x.c === id);
const count = (f) => D.filter(f).length;
const KIND = { MODEL: 'Model', DRAW: 'Draw', PROVE: 'Prove' };
const md = (t) => String(t).replace(/\|/g, '\\|');

const provides = new Map();
for (const x of D) if (x.g) provides.set(x.g, x);
const dependents = (tok) => D.filter((y) => (y.n || []).includes(tok)).length;
const CRITICAL = [...provides.keys()]
  .map((k) => ({ k, x: provides.get(k), n: dependents(k) }))
  .filter((r) => r.n > 0)
  .sort((a, b) => b.n - a.n);

const FOUND = [
  ['The 40-Io result is closed; kind is still a string',
   'Live `auditCatalogueKinds` is the measurement. Temperate worlds are no longer Io; furnace worlds are no longer Mars; LHS 1140 b is not Europa; pulsar planets are not Io. Named Solar System stamps are still regexes. Kind is still one string.'],
  ['Every furnace world used to be Mars',
   'Closed. Magma-ocean / furnace category now beats `signature: \'dust\'`. `stampMagma` is the furnace path. Remaining look-alikes are Mercury vs Moon (both cratered grey), not lava vs desert.'],
  ['A world\'s identity is still partly a regex on its name',
   '`planetKind` still matches named Solar System bodies against a concatenated string, with hand-written exclusions on Saturn and Uranus. Unnamed catalogue bodies take the parametric path. The regexes are validation cases until `worldaxes` can replace them.'],
  ['A gas giant is a sphere with everything set to zero',
   '`stampGas` is nine lines: `h[c] = 0`, `crust[c] = 0`, `age[c] = 0`, `seaLevel = 0`, and the volcano and hotspot lists emptied. Every downstream branch then evaluates `h[c] < seaLevel` as `0 < 0`, which is false, so a giant is treated as a planet whose surface is entirely land at exactly sea level. Twenty-one of 120 bodies are giants; most reach this path and a few still fall through to magma or generic.'],
  ['The surface used to be one of eight Earth rocks',
   '`W.rock` is still eight terrestrial values. `W.substrate` is a second byte into a 24-row table, stamped from axes + T/P. Pluto basins are nitrogen ice, Titan lakes are liquid methane, Jupiter is envelope. Earth copies `rock` so golden does not move. Non-Earth climate, diurnal swing, slope and save now read the row.'],
  ['Twenty-seven hand-written functions, one per named body',
   '`planetTerrain.js` has sixteen `stamp*` functions and `iceshell.js` has eleven `paint*` functions. The grammar now names a palette per world and paints `W.landform`; the heightfield is still these twenty-seven functions. Mercury\'s scarps are still `Math.sin(x * 7.5 + z * 4.2) * Math.cos(y * 5.5) > 0.62`.'],
  ['One volatile has a phase diagram and it is hard-coded to water',
   '`cycleMaterial` tells `hydroTick` which row to carry. Earth water and Titan methane still enter through `liquidWaterOk`. CO₂ / N₂ take a frost path and a pressure reservoir (`W._atmScale`). Clathrate is a T/P store; ice VI is a one-number floor. No full latent-heat budget.'],
  ['Most non-temperate worlds still have no surface-cover model',
   '`usesWhittakerCover` is true for earth, daisy and generic. Other bodies now have frost / dust / lag / grain, Iapetus two-tone and Enceladus brightness on the CPU path. The photograph globe still keys off kind. GPGPU climate does not read cover.'],
  ['An epoch is two fields',
   '`ERA_PRESETS` has five entries and `eraPatch` returns exactly `{ deepTime, startAgeGa }`. Nothing about the palette, the atmosphere, the biosphere state, the land configuration or the ice changes. `availableEras` returns `[]` for any world that is not `earthLike`, so no other body in the catalogue has a history you can visit.'],
  ['The technosphere is a float called build',
   '`W.build[c]` is a scalar; `settleCities` thresholds it into camp / village / town / city; population comes from one formula; `cityLights` makes night lights. Thirty-five read sites. No energy use, no waste heat, no emissions, no land use, no infrastructure — so a civilisation is the only planetary process in this engine with no thermodynamics.'],
  ['The axes a taxonomy needs are computed; substrates now read them',
   '`worldAxes` writes seven numbered axes plus extras. Kind fallbacks, the water-cycle gate, gravity relief, snow-line inventory and `stampSubstrate` read them. Appearance still keys off the kind string for look/stamp; do not let a later pass switch on the fingerprint.'],
  ['The data already knows things the engine ignores',
   'Jupiter\'s own note in `SEED_WORLDS` reads "Banded at a Rhines scale set by a 9.9-hour day." Neptune\'s reads "Fastest winds in the Solar System at ~2,000 km/h on almost no sunlight." Uranus\'s reads "The extreme test of the obliquity code." The catalogue was written by someone who knew exactly what these worlds do; nothing downstream reads it.'],
];

const LANDED = [
  ['Temperate worlds are no longer painted as Io',
   'The Io fallback now requires `tidalHeat > 0.8` and `airless`. TRAPPIST-1e and the rest of the temperate catalogue resolve as `generic` and keep Whittaker cover. `auditCatalogueKinds` asserts `temperateIo === 0`.'],
  ['Furnace worlds are magma, not Mars',
   '`magmaOcean` and the furnace category beat the dust/Mars stamp. All 17 lava worlds resolve as `magma` and hit `stampMagma`. `furnaceMars === 0`.'],
  ['Kind says why, on the world chip',
   '`planetKindWhy` writes `{ kind, why }` onto the world. The chip prints `kind (why)` so a misclassification is visible without the debugger.'],
  ['The kind-resolution table is committed',
   '`vr/data/worlds/kinds.json` is regenerated by this script. Tests fail if a live audit drifts from the committed counts.'],
  ['Seven axes, computed once per world',
   '`worldAxes` writes gravity, volatiles, dominant volatile, interior, insolation, age and resurfacing onto `W._worldAxes`, with units, provenance and a fingerprint. The chip title and the land dock print them.'],
  ['Kind leftover fallbacks follow the axes',
   'Sub-Neptunes are gas (fluid interior), LHS 1140 b is not Europa, pulsar planets are not Io. Temperate `iceshell` tags no longer freeze a water world.'],
  ['Kind is cached once',
   '`cachePlanetKind` writes onto the ruleset; generate copies it to `W`; look, stamp and ice-shell read the same cache. Earth\'s generate path is included.'],
  ['Tidal heat is Io-normalised',
   '`tidalHeatFluxWm2` is scaled so Io is ~2 W/m² and the Moon is far smaller. Planetocentric moons no longer share a clamped overflow.'],
  ['The Solar System lands in the right regions',
   'Earth is habitable, Titan is titanian, Mars is desert, Jupiter is giant. Tests fail if Titan comes out as a desert.'],
  ['A substrate table, compiled like the life grammar',
   '`vr/data/worlds/substrates.json` → `scripts/substrates.mjs` → `vr/sim/substrates.js`. Twenty-four materials, Earth rocks in slots 0–7, every row tagged measured/fitted/invented.'],
  ['Pluto is nitrogen ice, not sediment',
   '`W.substrate` is stamped at generate. Pluto basins are N₂ ice over water-ice bedrock; Titan lakes are liquid methane over tholin/ice; Jupiter is envelope. `phaseAt` pins the Solar System phases.'],
  ['The cycle is told which substance it is carrying',
   '`cycleMaterial` + `cycleMode`. Titan is liquid methane; Pluto is N₂ frost; Mars CO₂ has no liquid window at 6 mbar. Earth water is unchanged. Inspect names the phase; View has a Phase overlay; save version 6 stores the substrate byte.'],
  ['Atmosphere is a reservoir on thin CO₂ / N₂ worlds',
   '`W._atmScale` times authored pressure. Mars winter polar frost holds up to 28% of the column; Pluto thins at aphelion. Titan does not collapse. Live pressure feeds CPU greenhouse and the inspector. Earth golden does not move.'],
  ['Non-Whittaker worlds have a cover field',
   '`W.frost` / `W.lag` / `W.grain` plus `W.dust`. Cover overlay, inspect, local-map frost/lag tint, CPU albedo. Iapetus leading/trailing ratio and Enceladus-is-bright are asserted from fields. Photograph globe still keys off kind.'],
  ['Clathrate and ice VI sit in the column',
   'Titan holds a clathrate store; a warm window releases methane. Europa sits on rock; Titan\'s recipe includes ice VI. Origin still reads the one-number floor. `coreSample` reads `columnAt`.'],
  ['Landform grammar is a palette, not a replacement for the stamps',
   '`processes.json` + `landforms.json` → `landGrammar.js`. Mercury gets scarps, Io paterae, Titan dunes and lakes, Europa chaos; Jupiter gets none; Earth does not stamp; exo palettes say invented. Height is still twenty-seven functions. `craterCounts` is not wired.'],
  ['The column is a recipe, not a saved stratigraphy',
   '`columns.json` → `columnTable.js`. Europa ice over ocean over rock, Moon regolith over megaregolith over crust, Titan organics over ice VI, Jupiter no surface. Earth silent. Deposition, the cross-section and a packed field wait.'],
];

const NOW = [
  ['The column has a first cut; deposition and giants wait',
   'Recipes, overlay, inspect, Lab core. Europa / Moon / Titan / Jupiter pins. Not a saved per-cell array. Next is `nosurface`.'],
  ['Landform grammar has a first cut; the stamps still own height',
   'Palette, overlay, inspect, census. Io and Mars fallbacks are named, not retired.'],
  ['The physics is wired into the axes, not yet into the picture',
   'Retention, snow line, spin–orbit and tidal heat sit on the axes object. Appearance still keys off the kind string. Do not let a later pass switch on the fingerprint.'],
  ['Five constructs still need a representation the engine did not have',
   'Phase diagrams for the cycle, no-surface worlds, the landform grammar, the column, and the technosphere. Grammar is a palette; the column is a recipe. `worlddata` is still the test of whether Pluto can be added without JavaScript.'],
  ['This pass depends on the surface pass',
   'The surface backlog landed isoline, dither, pressure wind, sediment budget and glacial carve. Its `procset`, `strata`, `palettedoc` and `detailfield` can now read a material; they are not yet written.'],
  ['Nothing measures whether a world looks like itself',
   'Kind is now audited. Appearance is not. There is no contact sheet, no pairwise distinguishability metric, no per-world calibration, and no test that a giant is not run through the tectonics model. Every look fix here regresses silently without `sigtest`.'],
];

const SEQ = [
  ['Kindaudit is closed — keep regenerating the table',
   '`kindaudit` landed. `temperateIo` and `furnaceMars` are zero; `vr/data/worlds/kinds.json` is the committed histogram. Next changes to `planetKind` must leave that file in step.'],
  ['Axes are computed and starting to reach the sim',
   '`worldaxes` landed. Dominant volatile gates hydro; gravity sets relief; snow line scales inventory; extras carry retain / spin–orbit / not-round. Do not let a later pass switch on the fingerprint.'],
  ['Author the substrate table',
   'Landed. `substrates` then `substratefield`. Twenty-four materials, a Uint8 field, overlay, inspector, save version 6, Pluto/Titan/Earth/Jupiter tests. Non-Earth climate, diurnal and slope read the row. Earth golden does not move.'],
  ['Give every volatile a phase diagram',
   'First cut landed. `cycleMaterial` / `cycleMode` / `liquidWindow` / `iceTickFromPhase`. Atmosphere-as-reservoir, frost cover, clathrate store, NH₃ eutectic window, ice VI floor. Then `landgram` and `nosurface`.'],
  ['Derive kind from the axes and delete the regexes',
   '`kindderive`. Unnamed bodies already take the parametric path. Twenty-six named-body deletions still need axes so Mercury is not `/mercury/`. Same shape as the surface backlog\'s latitude deletion project, same failure mode without measurement. After substrates, not before.'],
  ['Build the cover model',
   'First cut landed. Frost / dust / lag / grain feeding CPU albedo. Iapetus and Enceladus pins from fields. Remaining: GPGPU climate reading cover, ray stamps at generate, cover thickness.'],
  ['Make world definitions data',
   '`worlddata` foothold: kinds + substrates + cover + processes + landforms + columns JSON. The test of the whole document is still whether Pluto can be added by someone who cannot write JavaScript.'],
  ['Then the landform grammar',
   'First cut landed. Palette, overlay, inspect, census. Stamps not retired. `craterCounts` not wired. Start retirement with the Io and Mars fallbacks, not Iapetus.'],
  ['Then the column',
   'First cut landed. Recipes from JSON, `columnAt` reads lid/ocean fields. Europa/Moon/Titan/Jupiter pins. `coreSample` reads the stack. Not a saved per-cell array. Deposition and the cross-section wait.'],
  ['Then worlds with no surface',
   '`nosurface`, `plevel`, `rhines`, `depthaxis`. Twenty-one catalogue bodies and the biggest single expansion available. The pressure-level model, then zonal jets at a Rhines scale, then a descent that never lands. Reuse the rocky-world pressure solver rather than writing a second one.'],
  ['Then epochs as worlds',
   '`epochobj`. A complete specification rather than a start time, with palaeogeography, palette and biosphere state — and available for bodies other than Earth, which is where Venus-with-an-ocean and early Mars live.'],
  ['Then the technosphere and what follows it',
   '`technolayer`, `megaeng`, `postbio`. Energy, waste heat, land use and emissions first, because they are the physics; megastructures and post-biological states after, because they are extrapolation and must be labelled as such. It should be reachable by playing rather than by picking.'],
];

/* ------------------------------------------------------------ markdown -- */
function markdown() {
  const L = [];
  L.push('# ORRERY — world space');
  L.push('');
  L.push(`**${D.length} items.** Generated from \`scripts/worldspace.mjs\` — edit that file, not this one, then run \`node scripts/worldspace.mjs\`.`);
  L.push('');
  L.push('The palette of worlds: what a world *is* in this engine, what it is made of, what happens when it has no surface, what its landforms should be, which moment in its history you are looking at, and what comes after life.');
  L.push('');
  L.push('The measurement this pass started from: resolve all 120 catalogue bodies and **40 came out as Io**, including 28 of 29 temperate rocky worlds. That path is closed. Parametric fallbacks now require airless for Io and put magma before dust; `worldAxes` numbers seven axes per world; `vr/data/worlds/kinds.json` is the committed table. Kind is still a string. The substrate table exists; `hydroTick` is told which substance it is carrying; thin CO₂ / N₂ atmospheres are a reservoir with a frost cover field; landform grammar is a palette; the column is a recipe with per-cell thicknesses. Next is worlds with no surface.');
  L.push('');
  L.push(`Kind: **${count((x) => x.k === 'MODEL')}** model, **${count((x) => x.k === 'DRAW')}** picture, **${count((x) => x.k === 'PROVE')}** measurement and proof. Effort is S/M/L. Impact is 1–3.`);
  L.push('');

  L.push('## Fixed in this pass');
  L.push('');
  for (const [a, b] of LANDED) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## What the audit found');
  L.push('');
  for (const [a, b] of FOUND) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## Where the palette actually is');
  L.push('');
  for (const [a, b] of NOW) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## The critical path');
  L.push('');
  L.push('The capabilities the largest number of other items are waiting on.');
  L.push('');
  L.push('| Capability | Item | Unblocks |');
  L.push('|---|---|---|');
  for (const r of CRITICAL.slice(0, 18)) {
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
  L.push('The through-line: this product has 120 worlds and about six appearances. Kind used to send 40 of them to Io and 17 to Mars; that misclassification is closed. Axes are numbered. Materials are a table. The cycle is told which substance it is carrying. The column is a recipe. What remains is worlds with no surface.');
  L.push('');
  L.push('The physics is starting to be asked. Dominant volatile gates the water cycle and picks substrate cover, gravity sets the relief ceiling, snow line scales inventory, tidal heat is Io-normalised. `SEED_WORLDS` still carries notes the picture does not read — Jupiter banded at a Rhines scale, Neptune\'s winds — and those wait on `nosurface`.');
  L.push('');
  L.push('Order matters and the top of it is not negotiable: kind is audited, axes are computed, materials are authored. Substrates before landforms, because a landform is a process acting on a material. Data before either, because twenty-seven bespoke functions is the failure mode this whole document exists to end — and the failure mode of the fix is 120 JSON files, one per body, which is the same thing with a different file extension.');
  L.push('');

  return L.join('\n');
}
/* ----------------------------------------------------------------- html -- */
function html() {
  const data = JSON.stringify(D.map((x) => ({
    id: x.id, c: x.c, t: x.t, d: x.d, k: x.k, e: x.e, i: x.i, g: x.g || '', n: x.n || [],
  })));
  const cats = JSON.stringify(CATS.map(([id, name, blurb]) => ({ id, name, blurb })));
  const crit = JSON.stringify(CRITICAL.slice(0, 18).map((r) => ({ k: r.k, id: r.x.id, t: r.x.t, n: r.n })));
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ORRERY — world space</title>
<style>
:root{
  --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#c69a4f; --accent-soft:rgba(198,154,79,.13); --accent-line:rgba(198,154,79,.36);
  --make:#7fc8a9; --make-soft:rgba(127,200,169,.14);
  --hand:#7fb0e0; --hand-soft:rgba(127,176,224,.14);
  --sans:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
}
@media (prefers-color-scheme: light){
  :root:not([data-theme="dark"]){ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
    --text:#12151c; --dim:#4e5768; --faint:#727d90;
    --accent:#8a6420; --accent-soft:rgba(138,100,32,.09); --accent-line:rgba(138,100,32,.32);
    --make:#22705a; --make-soft:rgba(34,112,90,.09); --hand:#215e93; --hand-soft:rgba(33,94,147,.09); }
}
:root[data-theme="dark"]{ --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#c69a4f; --accent-soft:rgba(198,154,79,.13); --accent-line:rgba(198,154,79,.36);
  --make:#7fc8a9; --make-soft:rgba(127,200,169,.14); --hand:#7fb0e0; --hand-soft:rgba(127,176,224,.14); }
:root[data-theme="light"]{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
  --text:#12151c; --dim:#4e5768; --faint:#727d90;
  --accent:#8a6420; --accent-soft:rgba(138,100,32,.09); --accent-line:rgba(138,100,32,.32);
  --make:#22705a; --make-soft:rgba(34,112,90,.09); --hand:#215e93; --hand-soft:rgba(33,94,147,.09); }

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
  <div class="eyebrow">Deep dive · the palette of worlds</div>
  <h1>World space</h1>
  <p class="sub">What a world <em>is</em> in this engine, what it is made of, what
  happens when it has no surface, what its landforms should be, which moment in its history you
  are looking at, and what comes after life. The 40-Io catalogue result is closed; kind is still
  a string, and the next object is worlds with no surface.</p>
  <p class="nav"><a href="./">Pitch</a> · <a href="backlog.html">Systems</a> ·
  <a href="worlds.html">Worlds</a> · <a href="evolution.html">Evolution</a> ·
  <a href="godgame.html">God layer</a> · <a href="next.html">Next 200</a> ·
  <a href="tides-weather.html">Tides &amp; weather</a> · <a href="geology.html">Geology</a> ·
  <a href="exoparams.html">Real parameters</a> · <a href="living.html">Alive</a> ·
  <a href="currents.html">Currents</a> · <a href="realism.html">Realism</a> ·
  <a href="landscape.html">Landscape</a> · <a href="life.html">Life</a> ·
  <a href="surface.html">Surface</a> · <a href="../vr/">Prototype</a></p>
  <dl class="tally">
    <div><dt>Items</dt><dd>${D.length}<small>${CATS.length} categories</small></dd></div>
    <div><dt>Kind</dt><dd>${count((x) => x.k === 'MODEL')}/${count((x) => x.k === 'DRAW')}/${count((x) => x.k === 'PROVE')}<small>model · draw · prove</small></dd></div>
    <div><dt>Impact 3</dt><dd>${count((x) => x.i === 3)}<small>of ${D.length}</small></dd></div>
    <div><dt>Effort</dt><dd>${count((x) => x.e === 'S')}/${count((x) => x.e === 'M')}/${count((x) => x.e === 'L')}<small>S / M / L</small></dd></div>
  </dl>
</header>

<div class="prose">
  <h2>Fixed in this pass</h2>
  <ul class="state" id="landed"></ul>

  <h2 style="margin-top:40px">What the audit found</h2>
  <ul class="state" id="fixed"></ul>

  <h2 style="margin-top:40px">Where the palette actually is</h2>
  <ul class="state" id="now"></ul>

  <h2 style="margin-top:40px">The critical path</h2>
  <p>The capabilities the largest number of other items wait on.</p>
  <div class="critwrap"><table class="crit"><tbody id="crit"></tbody></table></div>
</div>

<div class="controls">
  <div class="filters">
    <span class="flabel">Kind</span>
    <button class="f make" data-k="k" data-v="MODEL" aria-pressed="false">Model</button>
    <button class="f hand" data-k="k" data-v="DRAW" aria-pressed="false">Draw</button>
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
  <p style="margin-top:16px">The through-line: this product has 120 worlds and about six
  appearances. Kind used to send 40 of them to Io and 17 to Mars; that misclassification is
  closed. The substrate table exists. The cycle is told which substance it is carrying.
  Landforms are a palette. The column is a recipe. What remains is worlds with no surface.</p>
  <p>The physics for the replacement is already written. <code>exophysics.js</code> has the cosmic
  shoreline, the radius valley, atmospheric retention, tidal heating, spin–orbit resonance and
  snow lines, all implemented and starting to be asked. <code>SEED_WORLDS</code> carries
  measured parameters for every body, and Jupiter's own note in that table says it is banded at a
  Rhines scale set by a 9.9-hour day. Giants still wait on <code>nosurface</code>.</p>
  <p>Order matters and the top of it is not negotiable: measure the misclassification, compute the
  axes, author the materials. Substrates before
  landforms, because a landform is a process acting on a material. Data before either — because
  twenty-seven bespoke functions is the failure mode this document exists to end, and the failure
  mode of the fix is 120 JSON files, one per body, which is the same thing with a different file
  extension.</p>
</div>

<footer>
  Generated from <code>scripts/worldspace.mjs</code> — edit the source and re-run, do not edit the output.
</footer>
</div>

<script>
"use strict";
var DATA = ${data};
var CATS = ${cats};
var CRIT = ${crit};
var NOW = ${JSON.stringify(NOW)};
var FIXED = ${JSON.stringify(FOUND)};
var LANDED = ${JSON.stringify(LANDED)};
var SEQ = ${JSON.stringify(SEQ)};
var KLABEL = {MODEL:'Model', DRAW:'Draw', PROVE:'Prove'};
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
document.getElementById('landed').innerHTML = LANDED.map(function(r){
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
      var cls = o.k === 'MODEL' ? 'make' : o.k === 'DRAW' ? 'hand' : 'pick';
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
await mkdir(join(ROOT, 'vr', 'data', 'worlds'), { recursive: true });
await writeFile(join(ROOT, 'briefs', 'worldspace-backlog.md'), markdown() + '\n');
await writeFile(join(ROOT, 'site', 'worldspace.html'), html());

const { CATALOGUE_WORLDS, rulesetFromCatalogue } = await import('../vr/catalogue-rules.js');
const { auditCatalogueKinds } = await import('../vr/sim/planetKind.js');
const audit = auditCatalogueKinds(CATALOGUE_WORLDS, rulesetFromCatalogue);
const kindsPath = join(ROOT, 'vr', 'data', 'worlds', 'kinds.json');
await writeFile(kindsPath, JSON.stringify({
  generatedBy: 'scripts/worldspace.mjs',
  n: audit.n,
  temperateIo: audit.temperateIo,
  furnaceMars: audit.furnaceMars,
  counts: audit.counts,
  rows: audit.rows,
}, null, 2) + '\n');

console.log(`worldspace: ${D.length} items across ${CATS.length} categories`);
for (const [id, name] of CATS) console.log(`  ${String(byCat(id).length).padStart(3)}  ${name}`);
console.log(`\nkind     model ${count((x) => x.k === 'MODEL')} · draw ${count((x) => x.k === 'DRAW')} · prove ${count((x) => x.k === 'PROVE')}`);
console.log(`effort   S ${count((x) => x.e === 'S')} · M ${count((x) => x.e === 'M')} · L ${count((x) => x.e === 'L')}`);
console.log(`impact   3 ${count((x) => x.i === 3)} · 2 ${count((x) => x.i === 2)} · 1 ${count((x) => x.i === 1)}`);
console.log('\ncritical path:');
for (const r of CRITICAL.slice(0, 18)) {
  console.log(`  ${String(r.n).padStart(3)}  ${r.k.padEnd(14)} ${r.x.t}`);
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
console.log('\nwrote briefs/worldspace-backlog.md and site/worldspace.html');
console.log(`wrote vr/data/worlds/kinds.json  n=${audit.n}  temperateIo=${audit.temperateIo}  furnaceMars=${audit.furnaceMars}`);
const hist = Object.entries(audit.counts).sort((a, b) => b[1] - a[1]);
console.log('kind histogram: ' + hist.map(([k, n]) => `${n} ${k}`).join(', '));
if (audit.temperateIo || audit.furnaceMars) {
  console.log(`\nWARNING kindaudit regressions: temperateIo=${audit.temperateIo} furnaceMars=${audit.furnaceMars}`);
}
