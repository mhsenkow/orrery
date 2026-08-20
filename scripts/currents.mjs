#!/usr/bin/env node
// Single source of truth for the ORRERY currents backlog.
// Emits  briefs/currents-backlog.md  and  site/currents.html.
//
//   node scripts/currents.mjs
//
// k:  SIM = the fluid physics · EYE = what it looks like · PLAY = instrument, lever, legibility.
// e:  effort S/M/L.  i: impact 1..3.
// g:  capability token this item provides.  n: tokens it needs first.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = [
  ['basis', 'The grid does not know which way is east',
    'Every fluid item in this document is blocked on one missing object. `NBR` is built from face-local steps `[1,0] [-1,0] [0,1] [0,-1]`, and `advect()` in `atmo.js` comments that "NBR layout: 0/1 ≈ E/W face proxy, 2/3 ≈ N/S". On face 0 that is roughly true; on face 2 — the +Y polar cap — `+j` runs toward −Z and the same code advects north into west. There is no per-cell tangent frame, no way to express a vector in geographic components, and no rotation across a face seam. You cannot do fluid dynamics on a grid with no directions in it.'],
  ['gyres', 'The ocean that goes somewhere',
    '`ocean.js` is 71 lines and has no horizontal transport of any kind. `oceanSurf` relaxes toward air temperature, `oceanDeep` relaxes toward the constant 0.25, and `upwell[c] = |u| * 0.4 + (|lat| < 0.15 ? 0.35 : 0)` — the magnitude of the local wind, which is not a divergence. There is no ocean velocity field anywhere in the codebase. Nothing moves water from one cell to another, so there is no Gulf Stream, no Kuroshio, no Antarctic Circumpolar Current, and no reason for western Europe to be warmer than Labrador.'],
  ['deep', 'Overturning, deep water and the conveyor',
    'There are three unconnected AMOCs. `ocean.js` keeps `W.conveyor`, a scalar nudged down 0.02 when a freshwater pulse exceeds `NC * 0.002` and up 0.001 otherwise; it is read in exactly one place, to scale a mixing coefficient. `gaia.js` lists an `amoc` tipping element reading `W._amoc`, which is written once as `W._amoc = W._amoc ?? 0.7` and never again, so it can never trip. `god/climate.js` sets a third variable, `W.thermohaline`, which nothing reads at all. The most famous circulation on the planet is three dead variables with the same name.'],
  ['modes', 'El Niño and the other things that come back',
    'A grep for `nino`, `enso`, `walker` and `ekman` across `vr/` returns nothing. This is the category the request was really about: interannual variability is what makes a climate feel like a system rather than a setting, and every one of these modes is a delay-coupled oscillator between two reservoirs the model already has. ENSO in particular needs almost nothing new — a zonal thermocline tilt, a wind-stress feedback and a Kelvin-wave delay — and it is the single most legible thing weather can do.'],
  ['column', 'The water column: layers, mixing and fronts',
    '`initOcean` allocates `oceanSurf`, `oceanDeep`, `oceanSalt` and `upwell`. Two layers, no depth, no mixed-layer thickness, no thermocline that can shoal or deepen, and `oceanDeep[c] += (0.25 - oceanDeep[c]) * 0.002` means the abyss forgets everything within a few hundred ticks. Salinity increments by a flat 0.0002 per tick and freshens by a factor of 0.998 when it rains; sea ice forms in `iceTick` without rejecting a single gram of brine, which is the actual mechanism that drives the entire deep ocean.'],
  ['waves', 'Waves, swell and the edge of the sea',
    'The only wave in the codebase is `tsunamiTick`, which walks all 24,576 cells per tsunami per tick computing an `acos` for each, marks anything within 0.03 radians of an expanding ring, and sets `moist[c] = 1`. It has no phase speed, no √(gh) dependence on depth, no refraction, no run-up. There are no wind waves at all — no fetch, no sea state, no swell, no breakers — which is why the shoreline in both views is a contour line rather than a place where water is arriving.'],
  ['air', 'The atmosphere as a solver, not a lookup',
    '`geostrophicWind` recomputes pressure from scratch every tick as `(1 - temp) * 0.55 + elevation * 0.22 + ice * 0.18 - landHeat`, then derives wind from its gradient and adds `sin((lat - itcz) * PI * nCells)` as literal prescribed banding. Nothing is prognostic: there is no time derivative, no momentum, no vorticity, so the atmosphere has no memory and cannot meander, block, spin up or overturn. Worse, `atmoTick` calls `computeWinds` — the old three-band field — and then `advect`s temperature and moisture with *that*, before `world.js` throws it away and calls `geostrophicWind`. The pressure-driven wind never advects anything.'],
  ['wx', 'Weather patterns with names',
    'The hooks are there and the mechanisms are not. `hydroTick` computes `maxUp` as the largest drop to any neighbour, calls it orographic, and multiplies it by vapour — with no wind direction in it, so a mountain rains on all four sides equally. A comment reads "Rain shadow: leeward drying approximated by lowering moist diffusion later" and there is no later. `gaia.js` lists a `monsoon` tipping element reading `W._monsoon = W._monsoon ?? 0.5`, a constant. The horse-latitude deserts are a hard-coded band: `if (lat > 0.3 && lat < 0.5 && life < 0.2) moist = min(moist, 0.14)`.'],
  ['land', 'Water on land: rivers, lakes and the way down',
    '`computeRivers` sorts every cell by height each tick — an O(N log N) full sort of 24,576 entries — routes all discharge into the single steepest of eight neighbours, and marks any local minimum as `lake[c] = 1`. A lake in this model is a flag on one cell. It has no level, no volume, no outlet, it never fills, never overflows, never captures a neighbouring basin and never breaches. `erosionTick` deposits into one downhill cell and saturates `sediment` at 1, so there is no delta lobe, no floodplain, no braid.'],
  ['magma', 'Magma is a liquid',
    'A volcano is `{ cell, magma, next }`. `magma` recharges at `0.01 * heatFlow` per tick, and above 0.6 the eruption raises `h` by `power * 0.04`, thickens crust, dumps ash, and injects sulphate and CO₂. There is no composition, so a basaltic shield and a rhyolitic caldera are the same object with different numbers; no viscosity, so nothing flows; no chamber, so nothing can empty and collapse; and no lava field anywhere in `vr/` — a grep for `lava` finds a receipt string in `god/disaster.js` reading "kills via cooked volatiles, not lava" and nothing else.'],
  ['collide', 'Continents that actually collide',
    'The single most surprising finding in this audit. All crustal thickening happens inside `generateTectonics` — `crust[c] = min(1.6, crust[c] + 0.35)` for continental convergence — and `tectonicsTick` never touches `crust` except for `crust[v.cell] += power * 0.05` under a volcano. Elevation is derived from crustal thickness *once*, at generation. So plate centres drift, `reassignPlatesVoronoi` runs every 48 ticks, boundaries reclassify, two continents converge for a billion years — and not one metre of mountain is ever built, because nothing re-runs isostasy and nothing thickens crust during a run.'],
  ['mantle', 'The mantle as the slowest fluid',
    'Shared root with the geology backlog and stated here in fluid terms. `omega: (rng() - 0.5) * 0.08 * omegaScale * vigor` — plate velocity is a random draw, so the lithosphere is a set of rigid caps sliding for no reason over an interior that is five scalars. A mantle with a velocity field turns the plates into the top boundary layer of a convecting fluid, which is what they are, and makes slabs, plumes, dynamic topography and the supercontinent beat all consequences of one solver rather than five separate hacks.'],
  ['couple', 'Coupling, budgets and the tick',
    'The tick order in `simTick` is tectonics → interior → climate → hydro → tsunami → ocean → tides → storms → bio. Ocean therefore sees last tick’s wind and this tick’s temperature; tides run after the ocean that should carry them; storms paint into `clouds` and `precip` after `cloudsTick` has already run, so a cyclone’s cloud is overwritten the following tick. `assertBudgets` checks water and carbon every 32 ticks and nothing checks momentum, salt, or heat. `dtYr` ranges from 10 to tens of thousands of years, and every fluid item here has a real timescale that has to be reconciled with that.'],
  ['see', 'Seeing the flow',
    'The `wind` overlay maps speed to a colour ramp; the `upwell` overlay does the same for a scalar. Neither shows direction, and a field of arrows on a sphere at 24,576 cells is unreadable anyway. The one thing that makes a fluid legible — something carried by it, leaving a trail — does not exist in either view. `synopticChartSVG` is the closest thing to a flow map and it samples cells as `(j * cols + i) * stride`, which is index arithmetic on a cube-sphere: the chart is a scrambled slice of memory with an ITCZ line drawn across it.'],
  ['natural', 'The planet looking like a planet',
    '`naturalizeHypsometry` and `refineEarthHypsometry` are recent, careful and effective — domain-warped fBm, coastal Laplacian passes, craton ridges, age–depth abyss. They work on the shape. What is left is everything that is not shape: the sea reads as a tinted sphere with a specular lobe, cloud is one coverage scalar per cell with no form, rivers are not drawn as lines, and the six cube faces meet at seams that every noise field crosses but no fluid ever will until the basis exists.'],
  ['instr', 'Instruments and levers for moving things',
    'Thirteen instruments read the model — core, ice core, Keeling, Sepkoski, Whittaker, redox tower, transit spectrum, synoptic chart — and every one of them reads a scalar field at the present moment. Nothing in the build can show a section through the ocean, a Hovmöller diagram of an anomaly propagating, a tide gauge trace, a hydrograph, or the same place twice. The god layer has `tripOceanConveyor`, which sets a variable nothing reads.'],
];

const D = [
/* -------------------------------------------------------------- basis -- */
{c:'basis',t:'A local east–north tangent frame at every cell',g:'basis',d:'Two unit vectors per cell — `east = normalize(up × Y)` with a pole fallback, `north = up × east` — precomputed alongside `DIR` in `sphere.js` and rebuilt in `setResolution`. Two `Float32Array(NC * 3)` buffers, about 590 KB at N=64. Every vector quantity in the model can then be stored as a geographic pair instead of a face-local pair, and the question "which way is this water going" stops depending on which cube face you are standing on.',k:'SIM',e:'S',i:3},
{c:'basis',t:'Express windU/windV in the new frame and fix the advection',g:'advect2',n:['basis'],d:'`advect()` picks its upwind neighbour as `u > 0 ? NBR[c*4+1] : NBR[c*4]` and `v > 0 ? NBR[c*4+2] : NBR[c*4+3]`. Replace it with a projection of the velocity onto the four neighbour directions and take the two most upwind. Temperature, moisture and ash are all advected by this function today, on four of six faces in a direction that is not the one the wind is blowing.',k:'SIM',e:'M',i:3},
{c:'basis',t:'Rotate vectors across face seams',n:['basis'],d:'A vector crossing from face 0 to face 2 keeps its components and silently changes meaning. With a geographic frame the rotation is implicit — but any solver that works in face-local `(i, j)` needs an explicit basis change at the seam, and the twelve cube edges are exactly where a jet stream or a boundary current will want to run.',k:'SIM',e:'M',i:3},
{c:'basis',t:'Divergence, curl and gradient as shared operators',g:'vecop',n:['basis'],d:'Every subsystem writes its own. `geostrophicWind` computes `dpx += dp * (DIR[nb*3] - DIR[c*3])`, `oceanTick` fakes divergence as `|u| * 0.4`, `tidesTick` computes `du += dh * (DIR[nb*3] - x)`. One `div(field)`, `curl(u, v)` and `grad(field)` operating on the tangent frame with area weights removes three approximations and makes vorticity available for free.',k:'SIM',e:'M',i:3},
{c:'basis',t:'Area-weighted finite volumes, not neighbour averages',n:['vecop'],d:'`AREA[c]` is already a normalised cell area varying by roughly ±30% across a face, and every diffusion in the model is an unweighted four-neighbour mean: `(temp[n0] + temp[n1] + temp[n2] + temp[n3]) * 0.25 - temp[c]`. On a cube-sphere that quietly pumps heat toward the face centres. Flux-form updates over `AREA` conserve what they move.',k:'SIM',e:'M',i:3},
{c:'basis',t:'Edge lengths and face-normal distances',n:['basis'],d:'A gradient needs a distance and the code uses the chord `DIR[nb] - DIR[c]`, which is fine near a face centre and wrong near a corner where the warp stretches cells. Precomputing the great-circle distance to each of the four neighbours, once, makes every gradient in the model correct to the same order.',k:'SIM',e:'S',i:2},
{c:'basis',t:'A semi-Lagrangian advection step',n:['advect2'],d:'Upwind advection on a 250 km grid is enormously diffusive — it is why a storm painted into `clouds` smears into haze within a few ticks. Trace the departure point back along the velocity, sample bilinearly with `sampleFaceField`, and the same tick length carries a front for hundreds of cells instead of tens.',k:'SIM',e:'M',i:3},
{c:'basis',t:'A conservative limiter so advection cannot create mass',n:['advect2'],d:'`_adv[c] = fromU + (field[upV] - fromU) * rate * av * 0.85` is not conservative and the `0.85` is a stability fudge. With flux-form transport plus a flux limiter, the water budget check in `assert.js` stops being a soft bleed into vapour and starts being a real invariant.',k:'SIM',e:'M',i:2},
{c:'basis',t:'One shared halo exchange for the six faces',n:['basis'],d:'Every solver that touches neighbours pays the seam lookup separately through `NBR`, which is already precomputed — but a GPGPU port needs the halo as an explicit ring of ghost cells per face. Doing it once, in `sphere.js`, is the difference between porting one solver to the GPU and porting six.',k:'SIM',e:'M',i:2},
{c:'basis',t:'Coriolis from the real f = 2Ω sin φ',n:['basis'],d:'`const f = Math.sin(Math.asin(clamp(lat, -1, 1))) * fScale` reduces to `lat * fScale`, which is right in form, and `fScale = clamp(1 / |rotationPeriod|, 0.15, 4)` collapses the whole planetary rotation into a clamped reciprocal. With a tangent frame, `f` is a scalar per cell derived from the actual angular velocity, and the β-plane term ∂f/∂y — the thing that makes Rossby waves and western boundary currents exist — comes with it.',k:'SIM',e:'S',i:3},
{c:'basis',t:'Publish the frame to the renderer',n:['basis'],d:'Any vector overlay, streakline, wave direction or current arrow needs the same east–north basis on the GPU that the simulation uses on the CPU, or the arrows will disagree with the water. Two more channels in the field atlas, written once per resolution change rather than per tick.',k:'EYE',e:'S',i:2},
{c:'basis',t:'A unit test that advects a blob around the sphere',g:'fluidtest',n:['advect2'],d:'Put a Gaussian on the equator, advect it with a constant eastward wind for one full circuit, and assert it comes back to within a cell with its integral preserved to 1%. `test.mjs` has 40-odd assertions and not one of them touches a field solver. This single test would have caught the face-orientation bug on the day it was written.',k:'PLAY',e:'S',i:3},

/* -------------------------------------------------------------- gyres -- */
{c:'gyres',t:'Wind stress on the sea surface',g:'stress',n:['basis'],d:'τ = ρ_air · C_d · |U|·U, with C_d around 1.3e-3. It is two lines and it is the only place the atmosphere touches the ocean mechanically. Today the coupling is `W.upwell[c] = |windU| * 0.4 + ...`, a scalar with no direction, which is why the ocean cannot be pushed anywhere.',k:'SIM',e:'S',i:3},
{c:'gyres',t:'Ekman transport, ninety degrees off the wind',g:'ekman',n:['stress','vecop'],d:'Integrated over the surface layer, transport is τ/(ρf) rotated 90° — right of the wind in the north, left in the south. This one rotation is why the trade winds pile water in the west, why coastal upwelling happens on eastern boundaries, and why the Southern Ocean does what it does. It replaces the `|lat| < 0.15 ? 0.35 : 0` equatorial upwelling hack with the real reason.',k:'SIM',e:'M',i:3},
{c:'gyres',t:'Upwelling from the divergence of Ekman transport',n:['ekman'],d:'w = curl(τ/ρf)/ρ — Ekman pumping. Where the transport diverges, deep water rises. This makes the Peru, Benguela, Canary and California upwelling systems appear on their own coasts for their own reasons, instead of a band painted between ±0.15 of the equator, and it puts the nutrient supply in `nutrientP` where the fisheries actually are.',k:'SIM',e:'M',i:3},
{c:'gyres',t:'An actual ocean velocity field',g:'oceanvel',n:['ekman'],d:'Landed. `oceanU/V` are stepped as rotating shallow water (`vr/sim/swe.js`) with land as a wall and wind stress as body force. Steric SSH (`W._ssh`) relaxes toward SST. Not Ekman/Sverdrup assignment and not primitive equations.',k:'SIM',e:'M',i:3},
{c:'gyres',t:'Sverdrup balance closes the interior',g:'gyre',n:['oceanvel'],d:'Landed as a first cut of the consequence, not the diagnosed formula. Ocean SWE has β (f = lat × Ω) and a land wall; gyres have to come from that. Overlay `current` is the picture. Interior Sverdrup is not enforced as βv = curl τ.',k:'SIM',e:'M',i:3},
{c:'gyres',t:'Western boundary intensification',g:'wbc',n:['gyre'],d:'Landed as a first cut. Free-slip coasts and β replace the old `westNeighbour` cheat. Whether a Gulf Stream appears is a property of the basin, not a switch. Still one-layer, still coarse.',k:'SIM',e:'M',i:3},
{c:'gyres',t:'Poleward heat transport by the ocean, and its consequences',n:['wbc'],d:'The ocean carries roughly a quarter of the total poleward heat flux and most of it is in the western boundary currents. Wire that into the temperature equation and the map answers a question it currently cannot: why is Britain habitable and Labrador not, at the same latitude, on the same planet.',k:'SIM',e:'M',i:3},
{c:'gyres',t:'Eastern boundary currents are cold, slow and wide',n:['gyre'],d:'The mirror of the item above, and the reason the west coast of a continent gets fog and a desert while the east coast at the same latitude gets forest. The Atacama, the Namib and Baja are all downstream of a cold current and an inversion, and the model currently produces its deserts from a hard-coded latitude band instead.',k:'SIM',e:'M',i:3},
{c:'gyres',t:'A circumpolar current where nothing blocks it',n:['gyre'],d:'Give a latitude band no meridional barrier and the wind drives an unbounded zonal jet — the ACC, the largest current on Earth and the thing that thermally isolated Antarctica when Drake Passage opened. It is emergent: the model just needs to not prevent it, and to notice when continental drift opens or closes the gateway.',k:'SIM',e:'M',i:3},
{c:'gyres',t:'Equatorial currents and the undercurrent',n:['oceanvel'],d:'At the equator f vanishes, so the dynamics change character: westward surface currents, a narrow eastward countercurrent between them, and the Equatorial Undercurrent running east along the thermocline. That undercurrent is the pipe that ENSO travels down, so it is a prerequisite as well as a feature.',k:'SIM',e:'M',i:3},
{c:'gyres',t:'Straits, sills and throughflow',n:['oceanvel'],d:'The Indonesian Throughflow, the Strait of Gibraltar, the Bering Strait, the Denmark Strait overflow. Narrow gaps carry enormous transport and control what the basins either side can do — and on a drifting-continent world, opening or closing one is the most consequential thing tectonics can do to climate. At N=64 a strait is one or two cells wide, which means sub-grid parameterisation, not resolution.',k:'SIM',e:'M',i:2},
{c:'gyres',t:'Coastlines that steer water instead of stopping it',n:['oceanvel'],d:'Landed. Ocean SWE is free-slip: no flow into land, tangential current survives. Land cells stay at rest. Not a viscous Munk layer.',k:'SIM',e:'M',i:3},
{c:'gyres',t:'Sea surface height as the pressure the currents balance',n:['gyre'],d:'Landed a first cut. `W._ssh` is the ocean free-surface in the same SWE as the currents. Steric target from SST. No satellite overlay yet; `W.seaLevel` is still the global still-water datum.',k:'SIM',e:'M',i:2},

/* --------------------------------------------------------------- deep -- */
{c:'deep',t:'Kill two of the three AMOCs',d:'`W.conveyor` in `ocean.js`, `W._amoc` in `gaia.js` and `W.thermohaline` in `god/climate.js` are three variables for one process, and none of them reads the others. Pick one name, make it a diagnosed quantity rather than a stored flag, and delete the other two. Half a day, and the AMOC tipping element starts being able to trip for the first time.',k:'SIM',e:'S',i:3},
{c:'deep',t:'Salinity that is actually conserved',g:'salt',n:['oceanvel'],d:'`W.oceanSalt[c] *= 0.998` when it rains and `+= 0.0002` otherwise, clamped to 0.05–0.8. Salt is not created by drying or destroyed by rain — water moves and salt stays. A conserved salt tracer advected by the velocity field, with evaporation and precipitation as freshwater fluxes, is the precondition for everything else here.',k:'SIM',e:'M',i:3},
{c:'deep',t:'Brine rejection when sea ice forms',n:['salt'],d:'`iceTick` grows `iceSea[c]` by 0.06 per tick and never touches salinity. Freezing seawater expels salt into the water below, and that dense brine is the primary engine of Antarctic Bottom Water — the densest, coldest water in the world ocean. It is three lines inside a loop that already exists.',k:'SIM',e:'S',i:3},
{c:'deep',t:'Density from a real equation of state',g:'density',n:['salt'],d:'ρ(T, S, p), even a linearised one: ρ ≈ ρ₀(1 − α(T−T₀) + β(S−S₀)) with α ≈ 2e-4/K and β ≈ 7.7e-4/psu. Without density, "the conveyor" has nothing to overturn. With it, the competition between temperature and salinity — which is the whole drama of the North Atlantic — becomes a number you can watch.',k:'SIM',e:'S',i:3},
{c:'deep',t:'Convective adjustment: dense water sinks',g:'dwform',n:['density'],d:'When a surface cell becomes denser than the water beneath it, swap them. That is the whole algorithm, it is what every ocean model actually does, and it turns deep water formation from a scripted event into something that happens where and when the physics says it does — the Labrador Sea, the Greenland Sea, the Weddell and Ross shelves.',k:'SIM',e:'M',i:3},
{c:'deep',t:'Overturning as a streamfunction, not a flag',g:'moc',n:['dwform'],d:'Integrate the meridional velocity zonally and vertically and you get the MOC streamfunction in sverdrups — the actual quantity oceanographers argue about, around 17 Sv for the modern Atlantic. Then `_amoc` is measured rather than assumed, the tipping threshold in `gaia.js` means something, and the instrument writes itself.',k:'SIM',e:'M',i:3},
{c:'deep',t:'Stommel’s two-box bistability, for free',n:['moc'],d:'Once density has competing temperature and salinity terms with different relaxation times, the overturning has two stable states and a hysteresis loop between them. The model already has a hysteresis field on every tipping element in `gaia.js` and nothing that generates one honestly. This is the honest one.',k:'SIM',e:'M',i:3},
{c:'deep',t:'A freshwater hosing lever that does what the name says',n:['moc'],d:'`tripOceanConveyor` adds 0.15 to `moist[c]` at high latitudes and sets a string. Replace it with a real freshwater flux in sverdrups at a chosen location, and the collapse becomes a consequence with a timescale — decades to centuries — instead of a receipt promising one. This is the god lever the whole category pays off.',k:'PLAY',e:'S',i:3},
{c:'deep',t:'Ventilation age of deep water',n:['dwform'],d:'Tag water with the tick it last touched the surface. Modern Pacific deep water is around 1,000 years old and the Atlantic is much younger, and that difference explains the oxygen and nutrient contrast between the two basins. It is one extra tracer and it makes the abyss have a history instead of relaxing to 0.25.',k:'SIM',e:'M',i:2},
{c:'deep',t:'Ocean anoxia when overturning stops',n:['moc'],d:'`redox.js` already tracks dissolved oxygen and `extinction.js` already has anoxic events. Wiring them to a real overturning rate makes ocean anoxic events a consequence of a stagnant ocean rather than a scripted trigger — which is the current best explanation for the Cretaceous OAEs and a strong candidate for the end-Permian.',k:'SIM',e:'M',i:3},
{c:'deep',t:'The biological pump depends on where the water goes',n:['moc'],d:'Organic carbon sinks, remineralises at depth, and stays out of the atmosphere for as long as the water it is dissolved in stays down. `carbon.js` has burial and `redox.js` has organic carbon; neither knows about circulation, so the ocean’s largest carbon lever is currently a rate constant.',k:'SIM',e:'M',i:3},
{c:'deep',t:'Deep water on worlds that are not Earth',n:['dwform'],d:'A world with no sea ice has no brine rejection; a tidally locked world has one permanent cold pole; a high-salinity world may be stably stratified forever. The catalogue has 120 bodies and the overturning question — does this ocean turn over, and how often — is one of the sharpest ways they can differ.',k:'SIM',e:'M',i:2},
{c:'deep',t:'The conveyor’s effect arrives late, on purpose',n:['moc'],d:'`issueReceipt` already carries `delayYr` and `delayLabel`, and `tripOceanConveyor` sets 200 years. Once the overturning is real, that delay stops being a label and becomes the actual lag between the freshwater going in and the North Atlantic cooling — which is the most instructive thing about the system.',k:'PLAY',e:'S',i:2},

/* -------------------------------------------------------------- modes -- */
{c:'modes',t:'The Walker circulation, east–west',g:'walker',n:['progatm'],d:'Everything in `wind.js` is zonally symmetric except the land-heating term. The Walker cell — rising over the warm west Pacific, sinking over the cold east — is the atmosphere’s response to a zonal SST gradient, and it is the half of the circulation the model does not have. Nothing else in this category is possible without it.',k:'SIM',e:'M',i:3},
{c:'modes',t:'Bjerknes feedback: the coupling that makes ENSO',g:'enso',n:['walker','oceanvel'],d:'Stronger trades → more upwelling in the east → colder east → stronger zonal gradient → stronger trades. A positive feedback between wind stress and SST that the model has both halves of and no loop between. Close it and the coupled system becomes unstable to exactly the right perturbation.',k:'SIM',e:'M',i:3},
{c:'modes',t:'The thermocline tilt is the memory',n:['enso'],d:'The east–west slope of the thermocline stores the anomaly between events — the recharge oscillator. This is why ENSO has a period of three to seven years rather than being white noise: the ocean takes that long to recharge. It is one zonally integrated quantity and it converts a feedback into an oscillator.',k:'SIM',e:'M',i:3},
{c:'modes',t:'Kelvin and Rossby waves carry the signal across the basin',n:['enso'],d:'An eastward Kelvin wave crosses the Pacific in about two months, reflects off the American coast, and returns west as a slower Rossby wave over six to nine months. That round trip is the delay in the delayed oscillator. It is also, visually, the single most satisfying thing an ocean model can show you on a Hovmöller plot.',k:'SIM',e:'M',i:2},
{c:'modes',t:'La Niña is not the absence of El Niño',n:['enso'],d:'The oscillator is asymmetric — warm events are stronger and shorter, cold events weaker and longer, and the skew is a real feature of the observed record. Getting the asymmetry rather than a sine wave is what separates a model of ENSO from a sine wave labelled ENSO.',k:'SIM',e:'S',i:2},
{c:'modes',t:'Teleconnections: what an anomaly does elsewhere',g:'telecon',n:['enso','rossby'],d:'A warm east Pacific shifts the jet, floods Peru, dries Indonesia and Australia, and changes the hurricane count in the Atlantic. Rossby wave trains propagating out of a tropical heating anomaly are the mechanism, and they are the reason an ocean anomaly on one side of the planet is a drought on the other. This is the item that makes the climate feel like one object.',k:'SIM',e:'M',i:3},
{c:'modes',t:'ENSO changes the biosphere, and the model can see it',n:['telecon'],d:'`ecology.js`, `bio.js` and `nutrientP` are all in place. A collapse of eastern Pacific upwelling starves a fishery within one tick of a warm event, and the recovery lags. Interannual variability that reaches biomass is the difference between weather being scenery and weather being a pressure.',k:'SIM',e:'M',i:3},
{c:'modes',t:'An Indian-Ocean-style dipole',n:['enso'],d:'The same zonal coupled mode in a smaller, differently shaped basin, with a different period and a partial phase lock to ENSO. Once the mechanism is general rather than hard-coded to one basin, every ocean the tectonics produces gets its own mode with its own timescale — which is a far better demonstration than reproducing the real one.',k:'SIM',e:'M',i:2},
{c:'modes',t:'Decadal variability: an AMO and a PDO',n:['moc','enso'],d:'Slower modes tied to overturning and to gyre spin-up, with periods of twenty to seventy years. They matter because they are what makes a century of a stationary climate not look stationary, and because the model runs long enough for them to be visible in a chart where a three-year cycle is not.',k:'SIM',e:'M',i:2},
{c:'modes',t:'Annular modes and a wandering jet',n:['jet'],d:'The NAO and SAM are the leading modes of midlatitude variability and they are essentially the jet moving north and south. Once the jet is an object rather than a `sin()` term, its latitude has a distribution, and that distribution is a mode with an index you can plot.',k:'SIM',e:'M',i:2},
{c:'modes',t:'The MJO, or something like it',n:['walker'],d:'An eastward-propagating envelope of tropical convection on a 30–60 day cycle. At 10 kyr per tick it can never be simulated — but the presentation clock in `present.js` runs at human speed, and a coherent convective envelope crossing the tropics is exactly the kind of thing the fast end of the experience is short of.',k:'EYE',e:'M',i:1},
{c:'modes',t:'Mode indices as first-class chronicle events',n:['enso'],d:'`chronicle.js` logs 4,000 events with a cell, a magnitude and a label, and `maybeNameEra` already names eras. "Strong warm event, third in a decade" is a chronicle line that carries interannual variability into the record where a player will actually see it.',k:'PLAY',e:'S',i:2},

/* ------------------------------------------------------------- column -- */
{c:'column',t:'A mixed layer with a thickness',g:'mixedlayer',n:['salt'],d:'`oceanSurf` is a temperature with no depth, so it has no heat capacity — which is why `oceanSurf[c] += (temp[c] - oceanSurf[c]) * 0.08` is the entire air–sea coupling. A mixed-layer depth, deepened by wind stirring and convection and shoaled by warming, gives the ocean the thermal inertia that makes maritime climates maritime.',k:'SIM',e:'M',i:3},
{c:'column',t:'More than two layers',g:'layers',n:['mixedlayer'],d:'`oceanSurf` and `oceanDeep` cannot represent a thermocline, because a thermocline is a gradient. Even four or six levels — surface, thermocline, intermediate, deep — turn the ocean from two numbers into a column, and make the section instrument possible.',k:'SIM',e:'L',i:3},
{c:'column',t:'A seasonal thermocline that forms and breaks',n:['mixedlayer'],d:'Summer warming caps the surface, autumn storms break the cap, and the spring bloom happens when it re-forms with nutrients still in the light. The entire annual rhythm of temperate ocean productivity is that cycle, and `bio.js` currently gets its seasonality from insolation alone.',k:'SIM',e:'M',i:3},
{c:'column',t:'Stratification suppresses mixing, which suppresses everything',n:['mixedlayer'],d:'A Richardson-number-style gate: strongly stratified water resists stirring, so nutrients stay down and oxygen stays up. This is the mechanism behind the modern warming ocean’s declining productivity and behind the stratified, anoxic oceans of the deep past — one dial, two of the most important stories in the model.',k:'SIM',e:'M',i:3},
{c:'column',t:'Mesoscale eddies as objects',g:'eddy',n:['oceanvel'],d:'Boundary currents are unstable and shed rings, and those eddies carry a large fraction of the ocean’s lateral heat and nutrient transport. At 250 km per cell they are sub-grid, so they need parameterising — Gent–McWilliams style — and, separately, a handful of tracked eddy objects for the picture, the way `storms.js` already tracks cyclones.',k:'SIM',e:'M',i:2},
{c:'column',t:'Ocean fronts where water masses meet',n:['oceanvel'],d:'The Gulf Stream north wall, the subtropical convergence, the Antarctic polar front — sharp lines where temperature changes several degrees in a few tens of kilometres. They are where the fish are, they are visible from orbit in colour and in cloud, and they emerge from advection the moment there is any.',k:'SIM',e:'M',i:2},
{c:'column',t:'Tidal mixing fronts, from a tide that already exists',n:['mixedlayer'],d:'`tidesTick` computes `tideU`/`tideV` from the gradient of tidal height. Where tidal stirring exceeds surface heating, the column stays mixed and a sharp front separates it from stratified water offshore. It is a purely mechanical cause with a biological consequence, and both halves are already in the build.',k:'SIM',e:'M',i:2},
{c:'column',t:'Internal waves on the thermocline',n:['mixedlayer'],d:'Tidal flow over a sill radiates internal waves of a hundred metres amplitude that break far away and do a large share of the ocean’s deep mixing. It is also the mechanism by which the tide, which the model has, sets the abyssal stratification, which the model does not.',k:'SIM',e:'M',i:1},
{c:'column',t:'Nutrients that are transported rather than nudged',n:['oceanvel'],d:'`if (W.nutrientP && W.upwell[c] > 0.3) W.nutrientP[c] += W.upwell[c] * 0.02` — nutrients appear where upwelling is strong and never travel. Advect them, remineralise them at depth, and the productivity map becomes a consequence of the circulation instead of a stencil of the wind speed.',k:'SIM',e:'M',i:3},
{c:'column',t:'Sea ice that drifts',n:['stress'],d:'`iceSea[c]` grows and melts in place. Real sea ice is pushed by wind and current, piles into ridges, opens leads, and exports out of the Arctic through Fram Strait at a rate that matters to the North Atlantic’s salinity. The renderer already has a `lead` term in the shader waiting for something to make leads.',k:'SIM',e:'M',i:2},
{c:'column',t:'Ice shelves, calving and freshwater delivery',n:['salt'],d:'`iceLand` flows to lower neighbours at `(iceLand[c] - iceLand[n]) * 0.02` and stops at the coast. Ice that reaches the sea should float, spread, and calve — delivering fresh water in pulses at exactly the latitudes where deep water forms. Heinrich events are that mechanism, and they are one of the sharpest climate switches in the record.',k:'SIM',e:'M',i:2},
{c:'column',t:'The same column model for an ice-shell ocean',n:['mixedlayer'],d:'`iceshell.js` gives Europa and Enceladus a lid, an ocean and a vent field as a sketch. A stratified column with tidally driven convection under a conducting lid is the same code with different boundary conditions, and it is what determines whether the vents at the bottom can supply anything to the ice at the top.',k:'SIM',e:'M',i:2},

/* -------------------------------------------------------------- waves -- */
{c:'waves',t:'A wind-wave field: height, period, direction',g:'wavefield',n:['stress'],d:'Three numbers per ocean cell from wind speed, fetch and duration — an empirical growth law is entirely adequate at this fidelity. There is currently no sea state anywhere in the model, which means the ocean has no texture, no sound, no shore, and no reason for a coast to look different on a calm day.',k:'SIM',e:'M',i:3},
{c:'waves',t:'Fetch is a geometry problem the grid can answer',n:['wavefield'],d:'Distance of open water upwind, which is a walk along the wind direction until land — cheap with a tangent frame. It is why a lee shore is calm and a windward one is not, why the Southern Ocean has the biggest waves on Earth, and why an enclosed sea never does.',k:'SIM',e:'S',i:2},
{c:'waves',t:'Swell that outruns the storm that made it',g:'swell',n:['wavefield'],d:'Long-period waves disperse out of a storm and arrive on a distant coast days later under a clear sky. It is one of the few ways a place can be visibly affected by something happening thousands of kilometres away, and with tracked storms in `storms.js` already generating the source, it is a propagation step rather than a new system.',k:'SIM',e:'M',i:2},
{c:'waves',t:'Shoaling, refraction and breaking',n:['wavefield'],d:'Waves slow in shallow water as √(gh), which bends their crests parallel to the shore and concentrates energy on headlands. That is why headlands erode and bays fill, which is the single most important control on what a coastline looks like after a million years.',k:'SIM',e:'M',i:2},
{c:'waves',t:'Longshore drift and the sediment it moves',n:['wavefield'],d:'Waves arriving at an angle push sand along the beach, building spits, closing lagoons, starving downdrift coasts. `erosionTick` moves sediment downhill on land and abandons it at the coast. Longshore transport is the process that turns a deposited pile into a barrier island.',k:'SIM',e:'M',i:2},
{c:'waves',t:'Storm waves that do the geological work',n:['wavefield'],d:'Almost all coastal erosion happens in a few hours a decade. Coupling wave height to the tracked storm intensity in `storms.js`, and erosion rate to wave height cubed, gives the coast a punctuated history rather than a smooth one — which is how coasts actually change.',k:'SIM',e:'M',i:2},
{c:'waves',t:'A tsunami that is a wave, not an expanding annulus',n:['wavefield'],d:'`tsunamiTick` loops all NC cells per tsunami per tick, computes `Math.acos` for each, and marks a ring at `t.r * 0.04`. A shallow-water pulse propagating at √(gh) refracts around basins, slows and steepens on the shelf, and arrives on some coasts and not others. It is also 24,576 `acos` calls per tsunami per tick cheaper.',k:'SIM',e:'M',i:2},
{c:'waves',t:'Run-up, inundation and drawback',n:['wavefield'],d:'The wave that matters is the one that comes ashore. Run-up height from wave amplitude and coastal slope, water that actually covers cells for a few ticks, and the drawback beforehand — which is the detail everyone knows and no model draws.',k:'SIM',e:'S',i:2},
{c:'waves',t:'Seiches in enclosed basins',n:['wavefield'],d:'A lake or a gulf has a natural period and will slosh for hours after a storm or a quake. `lake[c]` is currently a per-cell flag with no basin behind it, so this item is really a request for lakes to be objects — and then a seiche is one line of harmonic oscillator per basin.',k:'SIM',e:'S',i:1},
{c:'waves',t:'Whitecaps that come from the sea state',n:['wavefield'],d:'`render.js` fakes foam with `pow(clamp(windF, 0, 1), 3) * 0.55` and mixes toward near-white. Driving it from actual wave height and steepness instead means the sea looks rough where it is rough, and the same number can drive the ocean’s sound and its albedo.',k:'EYE',e:'S',i:2},
{c:'waves',t:'Surf as a line, not a contour',n:['wavefield'],d:'The single most legible mark you can put on a coast: a bright band where waves break, wide on a gentle shelf and narrow on a cliff, moving with the tide that `tideRange` already computes. In the flat local view it is the difference between a shoreline and a shore.',k:'EYE',e:'M',i:3},
{c:'waves',t:'Sea state you can hear',n:['wavefield'],d:'`audio.js` splits a two-second noise buffer into bed, wind and ocean gains. Filtering that ocean bus by wave height and period — deep booms on a storm coast, a light hiss on a calm one — is a handful of lines against a field this document is already building for other reasons.',k:'EYE',e:'S',i:2},

/* ---------------------------------------------------------------- air -- */
{c:'air',t:'Prognostic pressure and momentum',g:'progatm',n:['vecop'],d:'Landed, then pushed, then trimmed. One-layer rotating shallow water with flux-form divergence, inertial (u·∇)u, two substeps, cached east–north stencil. Height still relaxes toward a heating target. Not a GCM.',k:'SIM',e:'L',i:3},
{c:'air',t:'Delete the dead wind field',d:'Landed. `computeWinds` is deleted. Moisture and heat advect with `geostrophicWind`. GPU climate no longer skips the CPU wind write — hydro, storms and overlays still need `windU/V`.',k:'SIM',e:'S',i:3},
{c:'air',t:'Absolute and potential vorticity',g:'vort',n:['progatm'],d:'Landed as a diagnostic. `W.vort` is relative vorticity of the SWE wind; overlay `vort` paints it. Potential vorticity (ζ+f)/η is not conserved yet — no stretching term, no invertibility.',k:'SIM',e:'M',i:3},
{c:'air',t:'A jet stream as an object with a latitude',g:'jet',n:['vort'],d:'Today the jet is `band = sin((lat - itczLat) * PI * nCells) * (0.12 + 0.04 * nCells)` added to `u`. A real jet sits at the poleward edge of the Hadley cell, moves with the season, meanders, and has a position you can name. Extracting it as a curve gives the renderer, the instruments and the modes category something to point at.',k:'SIM',e:'M',i:3},
{c:'air',t:'Rossby waves and the meanders they make',g:'rossby',n:['jet'],d:'The β effect turns a displaced parcel back, which makes the jet oscillate in wavenumber 4–6 troughs and ridges. Those meanders are why weather at a fixed longitude alternates between warm-south and cold-north, and why forecasting past two weeks fails. They fall out of the same β term the western boundary currents need.',k:'SIM',e:'M',i:3},
{c:'air',t:'Blocking highs that park for weeks',n:['rossby'],d:'When the wave amplifies enough to cut off, a high sits over one place and the storm track goes around it — which is what a heatwave or a drought actually is. It is the clearest example in the whole model of a persistent regime rather than a mean state, and there is currently nothing in the build that can persist.',k:'SIM',e:'M',i:2},
{c:'air',t:'Baroclinic instability, so midlatitude storms have a cause',n:['progatm'],d:'`midlatFavor` scores a cell as `converg * 0.6 + windSpeed * 0.35 + moist * 0.25` — a heuristic that says storms happen where it is already windy. The real criterion is available potential energy in a meridional temperature gradient with vertical shear. Then the storm track is where it is because that is where the baroclinicity is.',k:'SIM',e:'M',i:3},
{c:'air',t:'Air masses with an origin and a history',g:'airmass',n:['advect2'],d:'Continental polar, maritime tropical, and the rest — parcels that acquire temperature and humidity where they sit and carry them somewhere else. It is the concept that makes weather explainable rather than emergent noise, and it needs advection that actually goes the right way first.',k:'SIM',e:'M',i:2},
{c:'air',t:'Fronts as lines where air masses meet',g:'front',n:['airmass'],d:'Cold, warm and occluded, drawn as curves with a direction of motion. Fronts are how a hundred and fifty years of meteorology chose to summarise the atmosphere, they are what makes a weather map readable at a glance, and `synopticChartSVG` currently has isobars-as-colour and wind barbs with nothing between them.',k:'EYE',e:'M',i:3},
{c:'air',t:'A vertical dimension, even a shallow one',n:['progatm'],d:'Two or three levels — boundary layer, mid-troposphere, tropopause. Almost everything interesting in atmospheric dynamics is a difference between levels: shear, stability, thickness, the thermal wind. A one-level model can produce banding and never a thunderstorm.',k:'SIM',e:'L',i:3},
{c:'air',t:'Convection as a parameterisation, not a cloud recipe',n:['progatm'],d:'`cloudsTick` builds cloud from `moist * (1.1 - temp) * 0.55 + precip * 0.35` plus an ITCZ Gaussian and a subtropical Gaussian. Real convection triggers on instability, consumes CAPE, transports heat and moisture upward, and produces precipitation as a residual — which makes the ITCZ a consequence of where the air is rising rather than a `exp(-(lat - itcz)² / 0.018)`.',k:'SIM',e:'M',i:3},
{c:'air',t:'Hadley cell width from rotation, properly',n:['progatm'],d:'`circulationCellCount` returns 1, 2, 3, 5 or 7 from five thresholds on rotation period. Held–Hou gives the cell width from rotation rate, gravity, height and the equator-to-pole temperature difference as a continuous function — so a slightly faster world gets a slightly narrower Hadley cell, rather than jumping from three cells to five at `rot > 0.28`.',k:'SIM',e:'M',i:3},
{c:'air',t:'Superrotation, and the worlds that have it',n:['progatm'],d:'Venus’s atmosphere circles the planet sixty times faster than the surface turns, and tidally locked planets are expected to develop an equatorial superrotating jet. The catalogue is full of slow rotators and locked worlds getting a `u += -day * 0.22` day-to-night nudge. Momentum transport by eddies is what makes superrotation, and it is the most alien-looking thing an atmosphere can do.',k:'SIM',e:'M',i:2},

/* ----------------------------------------------------------------- wx -- */
{c:'wx',t:'Orographic rain that knows which way the wind blows',d:'`let maxUp = 0; for k<4 { const slope = h[c] - h[n]; if (slope > maxUp) maxUp = slope; }` then `p += maxUp * vapour * 0.5`. That is the steepest *descent*, with no wind in it, applied symmetrically. The correct quantity is the upslope component of the wind, `w = U · ∇h`, positive on the windward side and negative on the lee.',k:'SIM',e:'S',i:3},
{c:'wx',t:'The rain shadow the comment promises',d:'`// Rain shadow: leeward drying approximated by lowering moist diffusion later` — there is no later. Descending air warms and dries, so the lee of a range is arid within a few cells. The Atacama, the Great Basin, Patagonia and the Tibetan rain shadow are all this one process, and the model currently produces deserts by clamping moisture in a latitude band instead.',k:'SIM',e:'S',i:3},
{c:'wx',t:'Delete the hard-coded horse-latitude deserts',n:['progatm'],d:'`if (lat > 0.3 && lat < 0.5 && W.life[c] < 0.2) _m[c] = Math.min(_m[c], 0.14)` — a moisture cap applied in a fixed band, conditional on there being no life there already, described in the comment as keeping barren rock for bloom contrast. Subtropical deserts should exist because the Hadley cell descends there, which means they move when the circulation moves.',k:'SIM',e:'S',i:3},
{c:'wx',t:'A monsoon that reverses',g:'monsoon',n:['progatm'],d:'`gaia.js` has a monsoon tipping element reading `W._monsoon`, permanently 0.5. A monsoon is a seasonal reversal driven by the heat capacity contrast between land and ocean, so it needs the continentality the model already computes and a season it already advances. Half the human population lives under one and the model cannot represent it at all.',k:'SIM',e:'M',i:3},
{c:'wx',t:'A storm track, not scattered genesis',g:'track',n:['front'],d:'`stormsTick` seeds a storm at `(roll * NC * 17) | 0` every seventh tick when the roll passes. Real cyclogenesis clusters downstream of a baroclinic zone and follows a preferred path — the North Atlantic track, the Pacific track — which is why some coasts get hit and others do not. A track is a property of the flow, not of a random index.',k:'SIM',e:'M',i:3},
{c:'wx',t:'Atmospheric rivers',n:['advect2'],d:'Narrow filaments carrying more water than the Amazon, responsible for most of the extreme precipitation on western coasts. They are a direct product of moisture advection along a front, so they arrive free once advection works and fronts exist — and they are strikingly beautiful from orbit.',k:'EYE',e:'M',i:2},
{c:'wx',t:'Sea breeze, land breeze, and the daily turn',n:['progatm'],d:'The coast has its own diurnal circulation from the heat capacity contrast, and it is the weather that anyone standing on a beach actually experiences. `present.js` runs a presentation clock at human speed with a day phase; this is the first thing that clock could drive on the local map.',k:'EYE',e:'M',i:2},
{c:'wx',t:'Föhn, chinook, katabatic and the other named winds',n:['progatm'],d:'`geostrophicWind` has one: `if (ice[c] > 0.55 && h[c] > seaLevel + 0.05) v += -sign(lat) * 0.15`, a katabatic nudge. Downslope warming winds, gap winds through a strait, mistral and bora — local winds are how a region gets a character, and they are all terrain plus a pressure gradient the model will have.',k:'SIM',e:'M',i:2},
{c:'wx',t:'Lake effect and the moisture a warm surface gives up',n:['advect2'],d:'Cold air over warm water picks up heat and moisture and dumps it downwind. It needs an air mass with a history and a surface temperature different from the air, both of which are items above — and it is a small, specific, recognisable pattern that proves the machinery works.',k:'SIM',e:'S',i:1},
{c:'wx',t:'Interannual variability so no two years are the same',n:['enso'],d:'The model has one climate per parameter setting. A player watching a century should see wet years and dry years, an early spring and a late one. Without variability there is no drought, no flood, no failed harvest — and no reason for anything on the surface to be adapted to anything but the mean.',k:'SIM',e:'M',i:3},
{c:'wx',t:'Extremes with a tail, not a mean',n:['progatm'],d:'Almost everything weather does to a landscape or a biosphere happens in the tail — the storm, the flood, the heatwave, the freeze. Tracking the distribution rather than the mean lets `extinction.js` and `ecology.js` respond to the event that actually kills, and lets the chronicle log a year that was different.',k:'SIM',e:'M',i:3},
{c:'wx',t:'Hurricane genesis from the real ingredients',n:['track'],d:'`tropicalFavor` returns 0 outside `0.08 < |lat| < 0.45`, 0 below an SST of 0.62, and otherwise scores shear and moisture. The latitude cut is standing in for the actual reason — Coriolis is too weak within a few degrees of the equator to spin up a vortex — and once f is real, the gap at the equator appears on its own, on any world, at the right width for its rotation.',k:'SIM',e:'S',i:2},
{c:'wx',t:'Weather regimes the chronicle can name',n:['rossby'],d:'"Blocked, sixth week", "westerly, storm after storm". Persistent regimes are how people describe weather, they are what the atmosphere actually does, and `chronicle.js` is a good record with nothing atmospheric to record between eruptions and named storms.',k:'PLAY',e:'S',i:2},

/* --------------------------------------------------------------- land -- */
{c:'land',t:'A river network that persists between ticks',g:'rivernet',d:'`computeRivers` calls `order.sort((a, b) => h[b] - h[a])` on all 24,576 cells every tick and rebuilds the whole routing from nothing. Priority-flood or a persistent tree updated only where the terrain changed is both faster and — more importantly — gives rivers an identity, which is the precondition for naming them, drawing them, or asking how old they are.',k:'SIM',e:'M',i:3},
{c:'land',t:'Multiple flow direction, so rivers can split',n:['rivernet'],d:'All discharge goes to `best`, the single steepest of eight neighbours. That is why the drainage is dendritic everywhere and there is not one braided reach, one anabranching floodplain or one delta distributary in the model. Partitioning flow by slope across all downhill neighbours is a small change with a visible result.',k:'SIM',e:'S',i:2},
{c:'land',t:'Lakes with a level, a volume and an outlet',g:'lakelevel',n:['rivernet'],d:'`lake[c] = 1` marks a local minimum and nothing else happens. A real lake fills its basin until it finds the lowest point on the rim, then spills — and that spill point is where the outlet river starts. Depression filling gives lakes area, shoreline and a level that responds to climate, which is how a lake becomes a place.',k:'SIM',e:'M',i:3},
{c:'land',t:'Lakes that dry, overflow and breach',n:['lakelevel'],d:'The Aral, Lake Bonneville, Lake Agassiz, the Mediterranean refilling through Gibraltar. A lake with a level can lose it in a dry century or breach its rim catastrophically, and the outburst flood is one of the largest single geomorphic events a planet can have.',k:'SIM',e:'M',i:2},
{c:'land',t:'Groundwater as a slow store',n:['rivernet'],d:'`moist[c]` decays at 0.92 per tick with a diffusion term. A separate slow reservoir that fills in the wet season and drains through the dry one is what keeps a river running between storms, what makes a spring, and what makes a drought take years to arrive and years to end.',k:'SIM',e:'M',i:2},
{c:'land',t:'Deltas that build lobes and switch',n:['rivernet'],d:'`erosionTick` deposits at `sediment[sink] = min(1, sediment[sink] + erode * 2)` and caps at 1. A delta grows seaward until its channel is too long, then avulses to a shorter path — which is why the Mississippi has seven lobes and why the Nile is a fan. Sediment with a volume rather than a saturating scalar is the enabling change.',k:'SIM',e:'M',i:2},
{c:'land',t:'Floodplains, meanders and oxbows',n:['rivernet'],d:'Below a slope threshold rivers stop incising and start wandering, cutting the outside of bends and depositing on the inside. Meander migration is where most of the alluvial world comes from, and at 250 km per cell it is a sub-grid process that still needs representing because a floodplain is where people and life actually are.',k:'SIM',e:'M',i:2},
{c:'land',t:'Discharge as a hydrograph, not a steady state',n:['rivernet'],d:'`flow[c]` accumulates area weighted by moisture, so it is a mean. A river with a peak and a recession — snowmelt in spring, monsoon in summer, flash floods in an arid catchment — is a completely different thing to live beside, and the flood is the event that matters.',k:'SIM',e:'M',i:2},
{c:'land',t:'Sediment that keeps going once it reaches the sea',n:['rivernet'],d:'Deposition stops at the coast today. Real sediment is caught by longshore drift, carried down the shelf, and dumped into the abyss by turbidity currents — which are the fastest-flowing large-scale fluid events on the planet and the mechanism that builds the entire continental rise.',k:'SIM',e:'M',i:2},
{c:'land',t:'Glaciers as the other fluid on land',d:'`iceLand[c]` moves to lower neighbours at `(iceLand[c] - iceLand[n]) * 0.02` — pure diffusion, no basal sliding, no erosion. Ice flow is non-Newtonian and it carves a completely different landscape from water: U-valleys, cirques, fjords, drumlins, moraines. Half the northern hemisphere looks the way it does because of it.',k:'SIM',e:'M',i:3},
{c:'land',t:'Wetlands, and the carbon they hold',n:['lakelevel'],d:'Standing water on flat ground with poor drainage, anoxic below the surface, storing organic carbon and emitting methane. `carbon.js` and `redox.js` both want this and neither has anywhere to put it, because the model cannot represent ground that is wet but not submerged.',k:'SIM',e:'M',i:2},
{c:'land',t:'Rivers drawn as lines in both views',n:['rivernet'],d:'`flow[c]` is a per-cell scalar and neither view draws a river. On the globe a bright thread along the high-discharge path; in the local map an actual channel with banks that the settlements can sit on. It is the most recognisable structure any land surface has, and it is currently invisible.',k:'EYE',e:'M',i:3},

/* -------------------------------------------------------------- magma -- */
{c:'magma',t:'Magma composition as the master variable',g:'magmachem',d:'One float per volcano: silica fraction, 45% basalt to 75% rhyolite. It sets viscosity over five orders of magnitude, which sets eruption style, which sets everything else. Today `gases.sulphate += power * 0.015` fires identically for a Hawaiian shield and a Toba supereruption, because a volcano is `{ cell, magma, next }` and has no chemistry.',k:'SIM',e:'S',i:3},
{c:'magma',t:'Viscosity from composition and temperature',n:['magmachem'],d:'Basalt flows like honey and travels tens of kilometres; rhyolite barely flows at all and builds a plug that eventually fails explosively. This single derived quantity is the fork between two completely different landscapes, and it is an Arrhenius fit on the silica fraction.',k:'SIM',e:'S',i:3},
{c:'magma',t:'A magma chamber with a volume and a roof',g:'chamber',n:['magmachem'],d:'`v.magma = Math.min(2, v.magma + 0.01 * heat)` is a scalar that recharges linearly forever. A chamber has a volume, a depth, a pressure, and a roof that can fail. Once it can empty, the roof can collapse — and caldera collapse is the mechanism behind every eruption large enough to change a climate.',k:'SIM',e:'M',i:3},
{c:'magma',t:'Fractional crystallisation: chambers evolve',n:['chamber'],d:'As a chamber cools, crystals settle out and the remaining melt gets more silicic. That is why a long-lived arc volcano erupts basalt early and rhyolite late, and why the most dangerous eruptions come from the systems that have been quiet longest. It is a slow drift on one number with a dramatic consequence.',k:'SIM',e:'M',i:2},
{c:'magma',t:'Volatiles are what makes an eruption explosive',n:['chamber'],d:'Dissolved water and CO₂ exsolve as the magma rises and decompresses, and the expansion is the explosion. Viscous magma cannot let the bubbles escape, which is why silicic eruptions are catastrophic and basaltic ones are not. It also decides how much sulphur reaches the stratosphere, which is the actual climate lever.',k:'SIM',e:'M',i:3},
{c:'magma',t:'Eruption style as a classification with consequences',n:['chamber'],d:'Hawaiian, Strombolian, Vulcanian, Plinian, phreatomagmatic. Each has a different column height, ash distribution, hazard footprint and climate effect, and each falls out of viscosity and volatile content. The chronicle currently logs `power > 1 ? Major eruption : Eruption`.',k:'SIM',e:'M',i:3},
{c:'magma',t:'A plume height that decides where the sulphur goes',n:['chamber'],d:'Only material that reaches the stratosphere cools the planet for years; a tropospheric plume rains out in weeks. `tectonicsTick` has already been patched for this once — `sulphPulse = earthLike ? power * 0.0007 : power * 0.015` with two different caps — which is a symptom of the missing physics rather than a fix for it.',k:'SIM',e:'M',i:3},
{c:'magma',t:'Lava as a field that flows downhill',g:'lavaflow',n:['magmachem'],d:'There is no lava anywhere in `vr/`. An eruption does `h[v.cell] += power * 0.04` — the mountain grows at the vent and nothing goes anywhere. A viscosity-limited flow that spreads down the local gradient and cools to a stop builds the actual shape of a volcanic landscape: fans, tubes, aa and pahoehoe, flow fields tens of kilometres long.',k:'SIM',e:'M',i:3},
{c:'magma',t:'Flood basalts that cover a subcontinent',n:['lavaflow'],d:'`god/disaster.js` pushes `{ cell, magma: 2.5, next: 0, lip: true }` for a large igneous province and the receipt notes it kills via cooked volatiles rather than lava. The Deccan and the Siberian Traps put millions of cubic kilometres of basalt over an area the size of a continent, and the flows themselves are as much of the story as the gas.',k:'SIM',e:'M',i:3},
{c:'magma',t:'Pyroclastic density currents',n:['chamber'],d:'A collapsing eruption column becomes a ground-hugging flow of gas and ash moving at a hundred metres a second and hundreds of degrees. It is the thing that actually kills, it is a gravity current the same solver can handle, and a grep for `pyroclast` in this codebase returns nothing.',k:'SIM',e:'M',i:2},
{c:'magma',t:'Lahars, which are mud and travel further than lava',n:['lavaflow'],d:'Ash on a snow-capped volcano plus rain or melt gives a debris flow that runs down valleys for a hundred kilometres. The model has ash, ice, precipitation and a drainage network, so this is the one volcanic hazard that is nearly free — and historically it is the deadliest.',k:'SIM',e:'S',i:2},
{c:'magma',t:'Ash that is transported by the wind that exists',n:['advect2'],d:'`W.ash[v.cell] += power * 0.4` at the vent, then `advect(ash, W, 0.1)` with the discarded band winds. With correct advection and a plume height, ash falls out downwind in a fan whose thickness decays with distance — which is what makes a tephra layer a dateable horizon in the strata the geology backlog wants.',k:'SIM',e:'S',i:2},
{c:'magma',t:'Submarine eruptions behave differently',n:['lavaflow'],d:'Water pressure suppresses explosivity and quenches lava into pillows, and a shallow-water eruption is violently phreatomagmatic. Since most of the volcanism on this planet is at mid-ocean ridges under three kilometres of water, this is the common case and the model treats every vent as subaerial.',k:'SIM',e:'S',i:2},
{c:'magma',t:'Volcanic edifices with a shape you can read',n:['lavaflow'],d:'A shield is broad and shallow, a stratovolcano is steep and layered, a caldera is a hole. Building the edifice from the accumulated flows rather than adding `power * 0.04` to one cell means the mountain records its own eruptive history in its profile, which is exactly how volcanologists read them.',k:'EYE',e:'M',i:2},

/* ------------------------------------------------------------ collide -- */
{c:'collide',t:'Re-derive elevation from crust every tick',g:'isostatick',d:'The largest single gap in the geosphere. `freeboard = thick * (1 - dens / mantle) * (oceanic ? 1.6 : 3.4)` is evaluated inside `generateTectonics` and never again. `tectonicsTick` changes `crust` only under an erupting volcano. So crust can thicken, thin, load or unload and the surface will not move — which is why nothing that happens tectonically during a run has any topographic consequence at all.',k:'SIM',e:'M',i:3},
{c:'collide',t:'Convergence that thickens crust while it runs',g:'orogen',n:['isostatick'],d:'`crust[c] = Math.min(1.6, crust[c] + 0.35)` exists only in the generation pass. Move thickening into the tick, driven by the convergence rate at the boundary, and two continents closing an ocean will build a range over tens of millions of years — the Himalaya, the Alps, the Appalachians. This is the item the request asked for by name.',k:'SIM',e:'M',i:3},
{c:'collide',t:'Crust as a conserved budget',n:['isostatick'],d:'Ridges clamp crust down to 0.28 and collisions add 0.35, so crustal volume is created and destroyed freely. `assert.js` already checks water and carbon every 32 ticks. Adding crust closes the loop and makes orogeny a redistribution rather than an invention.',k:'SIM',e:'S',i:3},
{c:'collide',t:'Flexure: the lithosphere has strength',n:['isostatick'],d:'Airy isostasy floats every column independently. Real lithosphere bends over a flexural wavelength of a hundred-odd kilometres, which is what produces the foreland basin in front of a mountain belt, the forebulge beyond it, and the delayed rebound still lifting Scandinavia at a centimetre a year.',k:'SIM',e:'M',i:3},
{c:'collide',t:'Sutures that stay in the crust forever',n:['orogen'],d:'When an ocean closes, the join is a weakness that later rifting preferentially reopens — which is why the Atlantic opened close to the line of the Iapetus suture. Recording collisions as persistent structures makes the next Wilson cycle inherit the last one instead of starting from noise.',k:'SIM',e:'M',i:2},
{c:'collide',t:'Terrane accretion: continents grow by collage',n:['orogen'],d:'`crust[c] = pl.baseThick * (0.85 + 0.3 * fbm(...))` and `age[c] = 200 + rng() * 800` — a continent is one number plus noise with a uniform age. Real continents are Archean cratons welded together by younger belts, and that internal structure decides where the next mountain range can form.',k:'SIM',e:'M',i:3},
{c:'collide',t:'Rifting that opens an ocean',g:'platelife',n:['isostatick'],d:'`plates.length` never changes; `reassignPlatesVoronoi` only moves ownership between fixed seeds. A continent that stretches, necks, floods and finally splits — East Africa to the Red Sea to the Atlantic — requires a plate to be born. Nothing in the current model can do that, which is why the Wilson cycle has been listed as partial since the first backlog.',k:'SIM',e:'M',i:3},
{c:'collide',t:'Plates that die',n:['platelife'],d:'The Farallon is gone; the Tethys is gone. Subduction consumes plates entirely, and when the last of a plate goes down the boundary regime of a whole hemisphere changes. Deletion is as important as creation and slightly harder, because the cells have to go somewhere.',k:'SIM',e:'M',i:3},
{c:'collide',t:'Boundaries as curves with a length and a rate',n:['platelife'],d:'Boundary type is recomputed per cell from relative velocity — good — but a boundary is a set of tagged cells, not an object. A trench with a length, a convergence rate and an along-strike variation is what lets a margin have a trench, a forearc, an arc and a back-arc basin in the right order.',k:'SIM',e:'M',i:3},
{c:'collide',t:'The Wilson cycle, finally',n:['platelife','orogen'],d:'Assemble, sit, rift, disperse, reassemble on a 400–600 Myr beat. It drives sea level through ridge volume, climate through weathering and continentality, and evolution through vicariance — and it is the largest missing rhythm in a model whose whole subject is deep time.',k:'SIM',e:'L',i:3},
{c:'collide',t:'Sea level from ridge volume',n:['platelife'],d:'Fast spreading means young, hot, buoyant seafloor, which displaces water onto the continents — Cretaceous sea level was 200 m higher for this reason, and the epicontinental seas it made are where most of the fossil record was deposited. `updateSeaLevel` currently sees only ice volume and thermal expansion.',k:'SIM',e:'M',i:3},
{c:'collide',t:'Gateways that open and close',n:['platelife'],d:'Drake Passage opening thermally isolated Antarctica; the Isthmus of Panama closing reorganised the Atlantic; the Tethys closing ended a global circumequatorial current. On a world with real plate motion these events happen on their own, and each one is a step change in ocean circulation that the gyre and overturning items can actually respond to.',k:'SIM',e:'M',i:3},
{c:'collide',t:'Mountains that are eroded while they grow',n:['orogen'],d:'Uplift and erosion reach a steady state, and the height of a range is set by that balance rather than by the collision alone. It is also why unloading a range by erosion makes its remaining peaks rise — the counterintuitive result that makes isostasy click for people.',k:'SIM',e:'M',i:2},

/* ------------------------------------------------------------- mantle -- */
{c:'mantle',t:'A mantle velocity field under the plates',g:'mantleflow',d:'`omega: (rng() - 0.5) * 0.08 * omegaScale * clamp(vigor, 0.05, 1.5)` — every plate’s motion is a random draw scaled by a vigour scalar. A coarse convection field, even a few spherical harmonics evolving slowly, gives the lithosphere something to ride on and turns tectonics from a prescribed velocity into a force balance.',k:'SIM',e:'L',i:3},
{c:'mantle',t:'Slab pull and ridge push set the speed',n:['mantleflow'],d:'Plates with long subducting margins move several times faster than those without — which is why the Pacific plate outruns Africa. Deriving `omega` from the boundary force balance makes plate speed a consequence of plate geometry, and makes the geometry worth caring about.',k:'SIM',e:'M',i:3},
{c:'mantle',t:'Slabs that sink, stall and flush',g:'slab',n:['mantleflow'],d:'Subducted lithosphere is cold and dense; it descends, often pools at 660 km, and eventually flushes to the core–mantle boundary. Slab graveyards are visible in tomography under every ocean that has ever closed, and they are the plate system’s long-term memory.',k:'SIM',e:'M',i:2},
{c:'mantle',t:'Plumes that rise, arrive as a head, and continue as a tail',n:['mantleflow'],d:'`W.hotspots` are placed by `randomUnit(rng)` at generation and never move, appear or die. A plume head produces a flood basalt province in under a million years; the tail that follows produces an island chain for the next hundred million. Deccan then Réunion — one mechanism, two surface expressions separated in time.',k:'SIM',e:'M',i:3},
{c:'mantle',t:'Dynamic topography',n:['mantleflow'],d:'Mantle flow pushes the surface up over upwellings and pulls it down over downwellings by hundreds of metres, over wavelengths of thousands of kilometres. It explains why southern Africa sits high and why parts of North America flooded when the Farallon slab was under them — and it is a direct addition to elevation that no other process in this model can produce.',k:'SIM',e:'M',i:2},
{c:'mantle',t:'Temperature-dependent viscosity, so lid mode is computed',n:['mantleflow'],d:'`lidMode` is a string — mobile, stagnant, episodic, ice, none — chosen at generation and used to scale plate count and `omega`. Mantle viscosity varies by orders of magnitude with temperature, and the regime is the outcome of that competition, which means a world should be able to change regime during a run.',k:'SIM',e:'M',i:3},
{c:'mantle',t:'Secular cooling and radiogenic decay',n:['mantleflow'],d:'`heatFlow` is a constant per interior profile. Uranium-238, thorium-232 and potassium-40 supply about half the budget and decay on 0.7–14 Gyr timescales, and the mantle has cooled some 200 K since the Archean. Four constants turn interior evolution into a curve, and make the Hadean geologically different from the present.',k:'SIM',e:'S',i:3},
{c:'mantle',t:'LLSVPs as the places plumes come from',n:['mantleflow'],d:'Two vast low-shear-velocity provinces sit beneath Africa and the Pacific, and most large igneous provinces of the last 300 Myr erupted above their margins. Two persistent structures make plume placement structural rather than random, and give the deep mantle a geography.',k:'SIM',e:'M',i:2},
{c:'mantle',t:'Tidal heating as an interior fluid driver',n:['mantleflow'],d:'`R.tidalHeat` is a per-ruleset constant multiplied into insolation. For Io it is the entire energy budget and it is deposited in the interior, not at the surface — which is why Io is the most volcanically active body in the solar system and Europa has an ocean. The catalogue has both and treats the number as a surface term.',k:'SIM',e:'M',i:2},
{c:'mantle',t:'Magma generation where the physics says so',n:['mantleflow','magmachem'],d:'Melt comes from decompression at ridges and plumes, and from flux melting where water comes off a slab under an arc — which is why arc volcanoes are andesitic and ridges are basaltic. Deriving composition from the melting mechanism means a volcano’s chemistry follows from where it is, rather than being drawn from a distribution.',k:'SIM',e:'M',i:3},
{c:'mantle',t:'A cutaway that shows the flow',n:['mantleflow'],d:'`render.js` already draws an ice-shell stack as mantle → ocean → lid for the moons. A quarter-cut sphere with convection cells, slabs and plumes visible inside is the single most explanatory image a geodynamics model can produce, and it is the one the orrery table metaphor is asking for.',k:'EYE',e:'M',i:3},

/* ------------------------------------------------------------- couple -- */
{c:'couple',t:'Fix the tick order for the fluids',g:'fluidclock',d:'`simTick` runs tectonics → interior → climate → hydro → tsunami → ocean → tides → storms. The ocean sees this tick’s air temperature and last tick’s wind; tides run after the ocean they should be moving; storms paint into `clouds` and `precip` after `cloudsTick` has already produced them, so the cyclone’s own cloud is overwritten on the next pass. Write the order down, justify each dependency, and test it.',k:'SIM',e:'S',i:3},
{c:'couple',t:'Sub-cycle the fast fluids inside a slow tick',n:['fluidclock'],d:'`dtYr` runs from 10 years to tens of thousands. An ocean gyre spins up in a decade and an atmosphere adjusts in a week, so at deep-time tick lengths both should be integrated to equilibrium rather than stepped once. Making that explicit — n sub-steps or a direct equilibrium solve, chosen by `dtYr` — is what lets one model span both ends.',k:'SIM',e:'M',i:3},
{c:'couple',t:'Bulk air–sea fluxes',n:['mixedlayer'],d:'`oceanSurf[c] += (temp[c] - oceanSurf[c]) * 0.08` is the whole exchange. Sensible heat, latent heat, longwave and shortwave, each with its own dependence on wind speed and humidity, is the standard bulk formula — and it is what makes evaporation depend on wind, which the hydrological cycle currently does not.',k:'SIM',e:'M',i:3},
{c:'couple',t:'A closed heat budget with a check',n:['fluidtest'],d:'`assertBudgets` checks water and carbon. Nothing checks energy, and `hydroTick` already admits its water is only softly conserved: `if (Math.abs(drift) > 0.5) gases.H2O -= drift * 0.002` bleeds the error into vapour. Top-of-atmosphere in minus out, against the change in stored heat, is the check that catches a whole class of silent errors.',k:'PLAY',e:'M',i:3},
{c:'couple',t:'Conserve salt, momentum and crustal mass too',n:['fluidtest'],d:'Three more invariants for three systems this document makes conservative. Each is a few lines in `assert.js` alongside the ones already there, and each will fail the first time it is run — which is the point.',k:'PLAY',e:'S',i:3},
{c:'couple',t:'Move the ocean solver onto the GPU',n:['oceanvel'],d:'`gpgpu/` already runs climate as float ping-pong atlases on a 6N × N strip with a CPU fallback, resident readback every fourth tick. The ocean is the same shape of problem and it is the one that will otherwise dominate the CPU budget once it has a velocity field.',k:'SIM',e:'L',i:2},
{c:'couple',t:'Golden runs that cover the fluids',n:['fluidtest'],d:'`headless.mjs --golden` hashes field state for reproducibility and `test.mjs` has no field-solver assertions at all. A golden run that includes ocean velocity, overturning and the ENSO index is what stops a performance optimisation from silently changing the climate.',k:'PLAY',e:'M',i:3},
{c:'couple',t:'Calibrate the new fields against modern Earth',n:['fluidtest'],d:'`calibrate.mjs` asserts modern Earth within stated tolerances. Add the ones this document creates: about 17 Sv of Atlantic overturning, a Gulf Stream near 30 Sv, a poleward ocean heat transport peaking around 2 PW, an ENSO period of three to seven years. Numbers with tolerances, in the same file, in the same style.',k:'PLAY',e:'M',i:3},
{c:'couple',t:'A stability guard that reports rather than hides',n:['fluidclock'],d:'The frame budget is `if (elapsed > 12) { simAcc = 0; break; }`, which silently drops ticks. A fluid solver has a CFL condition and will go unstable rather than slow, so it needs an explicit courant check with a visible warning — and a substep count that adapts instead of a tick that vanishes.',k:'SIM',e:'S',i:3},
{c:'couple',t:'Tag every new constant with its provenance',d:'`model-limits.md` asks for measured / fitted / invented on every magic number, and this document introduces dozens — drag coefficients, thermal expansion, flexural rigidity, silica-viscosity fits. Tagging them as they are written is the only time it is cheap.',k:'PLAY',e:'S',i:2},
{c:'couple',t:'Update the stated limits as each falls',n:['moc'],d:'`model-limits.md` currently reads "No real ocean dynamics" and "not a full GCM". Those sentences are load-bearing honesty and each item here that lands makes one of them wrong. Rewriting them is part of finishing the work, not paperwork after it.',k:'PLAY',e:'S',i:3},
{c:'couple',t:'Decide what stays a sketch, on purpose',d:'Not all of this should be built. A 250 km grid cannot resolve an eddy, a front, a squall line or a strait, and pretending otherwise is worse than a stated parameterisation. Writing down which processes are resolved, which are parameterised and which are decoration is what keeps the fidelity claim honest as the model gets better.',k:'PLAY',e:'S',i:3},

/* ---------------------------------------------------------------- see -- */
{c:'see',t:'Advected particles as the primary flow visual',g:'particles',n:['oceanvel'],d:'A few thousand massless tracers stepped along the velocity field and drawn as fading streaks. It is the single highest-value-per-line item in this document: one buffer, one update, and a fluid that was invisible becomes obvious. Nothing else communicates a vector field on a sphere at a glance.',k:'EYE',e:'M',i:3},
{c:'see',t:'Streaklines and line-integral convolution for the overlays',g:'flowviz',n:['particles'],d:'The `wind` overlay maps speed to a colour ramp and shows no direction at all. Convolving noise along the streamlines produces the texture that makes a flow map readable, and it works equally for wind, current, tidal flow and mantle convection from one shared function.',k:'EYE',e:'M',i:3},
{c:'see',t:'Sea surface texture from the actual sea state',n:['wavefield'],d:'`rough = mix(0.85, 0.08, waterMask * (1 - iceF))` — one constant roughness for every ocean on every world. Anisotropic roughness aligned with the wave direction is what makes a real sea photograph the way it does, and it is a shader change against a field this document already builds.',k:'EYE',e:'M',i:2},
{c:'see',t:'Sun glint that reveals the current',n:['oceanvel'],d:'The specular lobe is `pow(max(dot(N, H), 0), gloss) * waterish`. Real glint is modulated by surface slicks and by the roughness change across a current front, which is how boundary currents and internal waves become visible in satellite photographs. It is the most beautiful free consequence of having a sea state.',k:'EYE',e:'M',i:2},
{c:'see',t:'Clouds with form, not coverage',n:['progatm'],d:'`clouds[c]` is one scalar per cell and the shell shader multiplies it. Cumulus fields, cirrus streaks pulled along the jet, the comma of a cyclone, cloud streets in a cold outbreak — form is what distinguishes a photograph of a planet from a diagram of one, and every one of those forms has a dynamical cause the items above supply.',k:'EYE',e:'L',i:3},
{c:'see',t:'The ITCZ as a real feature, not a dashed line',n:['progatm'],d:'`synopticChartSVG` draws it as a dashed gold line at `itczY` and `cloudsTick` builds it from `exp(-(lat - itcz)² / 0.018)`. From orbit the ITCZ is a broken, clumpy chain of convective clusters that migrates seasonally — recognisably a real thing rather than a smooth band.',k:'EYE',e:'M',i:2},
{c:'see',t:'Sediment plumes that follow the water',n:['oceanvel'],d:'`col = mix(col, vec3(0.72, 0.55, 0.28), sedF * waterMask * 0.35)` paints turbidity where sediment is. Once there is a current, a river plume bends along the coast, a bloom follows an eddy, and the ocean colour field starts reporting the circulation. This is how ocean colour is actually used.',k:'EYE',e:'M',i:2},
{c:'see',t:'Fix the synoptic chart’s projection',d:'`const c = Math.min(NC - 1, (j * cols + i) * stride)` — the weather map indexes the cell array directly, so it is a scrambled slice of cube-sphere memory with an ITCZ line drawn across it and wind barbs sampled from unrelated places. Sample by latitude and longitude and the chart becomes a map.',k:'PLAY',e:'S',i:3},
{c:'see',t:'Lava that glows and cools',n:['lavaflow'],d:'Molten rock at 1,100 °C is the brightest thing a planet surface produces, and the black crust with orange cracks that forms as it cools is instantly recognisable. It is also the only self-illuminated surface material in the model and it belongs on the night side.',k:'EYE',e:'M',i:3},
{c:'see',t:'Eruption columns and ash fans visible from orbit',n:['chamber'],d:'A plume with a height, a downwind ash fan with a thickness gradient, and a grey blanket on the ground under it. `W.ash[c]` exists and is drawn as a tint; the vertical column and the shadow it casts are what make an eruption an event rather than a colour change.',k:'EYE',e:'M',i:2},
{c:'see',t:'Weather that reaches the flat local map',n:['progatm'],d:'`briefs/living-backlog.md` establishes that the local view draws the same image every frame because every stamp is seeded from `hash2(c, 0x11fe)`. Rain falling, cloud shadow crossing, wind in the canopy, water rising — the tile is the one place weather could be witnessed rather than read off a gauge.',k:'EYE',e:'M',i:3},
{c:'see',t:'Currents and swell in the local view',n:['wavefield'],d:'At the tile scale the sea should have direction — swell lines marching in, wave trains refracting round a headland, a rip on an ebbing tide. The same fields that drive the orbital picture, rendered at the scale where a person would actually stand.',k:'EYE',e:'M',i:2},
{c:'see',t:'A time-lapse mode for the slow fluids',n:['flowviz'],d:'Mantle convection, plate motion and the Wilson cycle happen over hundreds of millions of years and are invisible at any real playback rate. A dedicated fast-forward that runs the geodynamics and renders the accumulated motion as trails is how those systems become watchable at all.',k:'EYE',e:'M',i:2},

/* ------------------------------------------------------------ natural -- */
{c:'natural',t:'Ocean colour from what is in the water',d:'The sea is tinted by `R.ocean(1 - d)` with depth, then mixed toward sediment and NPP colours. Real ocean colour comes from three things — clear-water absorption, chlorophyll, and coloured dissolved organic matter — and the difference between an oligotrophic blue gyre and a green shelf is one of the strongest visual signals of where life is.',k:'EYE',e:'M',i:3},
{c:'natural',t:'Depth-dependent water, not a flat tint',d:'Shallow water over sand is turquoise because light reaches the bottom and comes back; the same water over mud is brown; deep water is blue because nothing comes back. One absorption term against the bathymetry the model already has makes every coast in the world read correctly.',k:'EYE',e:'M',i:3},
{c:'natural',t:'A shoreline with a wet edge',n:['wavefield'],d:'`tideRange` and `intertidal` are computed per cell and the coast is still drawn as the contour where `heightF` crosses a threshold. Wet sand darkens, foam persists for a second, the line moves with the tide — the shoreline is the most-looked-at line on the planet and it is currently the sharpest.',k:'EYE',e:'M',i:3},
{c:'natural',t:'Hide the cube seams from the fluids',n:['basis'],d:'`naturalizeHypsometry` domain-warps its noise so terrain crosses the seams invisibly. A velocity field will not be so forgiving: any solver with a face-local bias will draw the cube on the ocean. Worth an explicit visual test — run a uniform zonal flow and look for the edges.',k:'EYE',e:'M',i:3},
{c:'natural',t:'Terrain that records the process that made it',n:['orogen'],d:'`refineEarthHypsometry` adds ridged noise where `bound[c] === CONV`, which is the right instinct applied at generation. A range built by ongoing convergence and then dissected by rivers has a grain — parallel ridges, wind gaps, a drainage divide — that noise cannot fake.',k:'EYE',e:'M',i:2},
{c:'natural',t:'Snow and ice that follow the weather',d:'`iceTick` uses `snowline = rule.freeze + 0.05 + Math.sin(season) * 0.04` with a polar floor `iceLand[c] = max(iceLand[c], 0.25 + (absLat - 0.86) * 2.5)` bolted on to stop the caps vanishing. Snow that accumulates from actual precipitation on actual cold ground removes the floor and puts the snow on the windward slopes where it belongs.',k:'EYE',e:'M',i:2},
{c:'natural',t:'Vegetation that follows water, not latitude',n:['rivernet'],d:'Green along the rivers, dark on the windward slope, bare in the rain shadow, a gallery forest through a savanna. The biosphere code already has moisture-dependence; what it lacks is a moisture field with real structure, which is what the orographic and river items produce.',k:'EYE',e:'M',i:3},
{c:'natural',t:'Colour that comes from rock, not from a biome table',n:['magmachem'],d:'Basalt is dark, granite is pale, limestone is white, laterite is red, evaporite is bright. `rock` is a `Uint8Array` with five values and the surface is coloured mostly from life and moisture. Mineral colour is why deserts are not all the same colour and why an old shield looks different from a young arc.',k:'EYE',e:'M',i:2},
{c:'natural',t:'Atmospheric perspective over distance',d:'The planet shader has Rayleigh, ozone, Mie and haze terms tuned for the limb. Looking *across* the surface from a low angle — the thing the local view is for — needs the same scattering applied along the ground path, and it is what gives a landscape its sense of scale.',k:'EYE',e:'M',i:2},
{c:'natural',t:'A terminator that is not a line',d:'Dawn and dusk are a band tens of kilometres wide with a colour gradient across it, and it is where every photograph of Earth from orbit gets its drama. The shader has a `wrap` term; giving the terminator width, warmth and cloud tops catching the last light is a small change with a large effect.',k:'EYE',e:'M',i:2},
{c:'natural',t:'Scale cues so the planet reads as large',d:'Cloud casting a shadow onto the surface, a storm that is visibly smaller than a continent, a mountain range with haze accumulating along it. Without cues the sphere reads as an object about a metre across, which is charming for a toy and works against the sense that this is a world.',k:'EYE',e:'M',i:2},
{c:'natural',t:'Both views agree about the same cell',n:['flowviz'],d:'The living backlog’s central point: the globe and the flat map should be one instrument at two magnifications. Wind direction, wave direction, current direction and the tide phase must be identical in both, or the pair reads as two programs sharing a window.',k:'EYE',e:'M',i:3},
{c:'natural',t:'An aliveness regression for the fluid layer',n:['fluidtest'],d:'Every item here can be reverted by one clever optimisation. A small set of rendered reference frames — a storm, a coast at spring tide, a lava flow, a gyre — diffed against committed images is the cheapest possible guard on the thing that is hardest to measure.',k:'PLAY',e:'M',i:2},

/* -------------------------------------------------------------- instr -- */
{c:'instr',t:'A current desk',g:'currentdesk',n:['oceanvel'],d:'`platesPanel.js` and `climatePanel.js` are both good and both read scalars. The ocean deserves the same: transport through named straits in sverdrups, gyre spin-up, boundary current speed, overturning strength, upwelling index. It is the panel that makes all of the ocean work visible at once.',k:'PLAY',e:'M',i:3},
{c:'instr',t:'A vertical section through the ocean',g:'section',n:['layers'],d:'Temperature and salinity against depth along a great circle — the standard oceanographic figure, and the only way to see a thermocline, a water mass or an overturning cell. `viz.js` already produces eight SVG chart types in this style; this is the ninth.',k:'PLAY',e:'M',i:3},
{c:'instr',t:'A Hovmöller diagram',n:['enso'],d:'One spatial axis, time on the other. It is how propagation is shown — a Kelvin wave crossing the Pacific, a heat anomaly moving up a coast, a monsoon onset marching north. Nothing in the build can currently show a field moving, only a field.',k:'PLAY',e:'M',i:2},
{c:'instr',t:'An ENSO index with a real record',n:['enso'],d:'A single number, plotted for the last few centuries of model time, with the warm and cold events shaded. `sparklineSVG` and `chartAreaSVG` already exist. It is the smallest possible instrument that proves the climate has interannual variability, and it is the one a player will check.',k:'PLAY',e:'S',i:3},
{c:'instr',t:'A tide gauge you can leave somewhere',n:['fluidclock'],d:'`tideBudget` reports mean range, phase, hours to next high. A gauge pinned to one cell, recording a continuous trace with the semi-diurnal cycle, the spring–neap envelope and a storm surge spike on top, is how tides became legible to people in the first place.',k:'PLAY',e:'M',i:2},
{c:'instr',t:'A hydrograph at a river mouth',n:['rivernet'],d:'Discharge against time at a chosen cell — the annual cycle, the flood peaks, the drought recessions. It is the instrument that makes the land part of the water cycle legible, and it sits naturally next to the tide gauge as its freshwater counterpart.',k:'PLAY',e:'S',i:2},
{c:'instr',t:'A wind rose and a wave rose',n:['wavefield'],d:'Direction-binned frequency at a point, accumulated over model time. Two small polar plots that answer "what is the weather like here" in a way no instantaneous field can, and that make the difference between a windward and a leeward coast immediately obvious.',k:'PLAY',e:'S',i:2},
{c:'instr',t:'A meridional heat transport plot',n:['moc'],d:'Atmosphere and ocean contributions against latitude, summing to the required poleward flux. It is the single figure that shows the two fluids sharing one job, and getting the ocean’s share right — roughly a quarter, peaking near 2 PW — is a genuine validation.',k:'PLAY',e:'M',i:2},
{c:'instr',t:'A magma and eruption desk',n:['chamber'],d:'Chamber volume, composition, volatile content, time since last eruption, and the style each volcano is currently loaded for. `platesPanel.js` already lists volcanoes as `{ i, cell, magma, hotspot, next }`; this is that list once a volcano is a real object.',k:'PLAY',e:'M',i:2},
{c:'instr',t:'God levers that act on the fluids',n:['oceanvel'],d:'`sculpt.js` has fifteen verbs that write fields directly. The fluid equivalents — dam a strait, force an upwelling, tilt the thermocline, redirect a jet, trigger an eruption of a chosen composition — are more interesting because the system argues back over a known timescale, which is what `issueReceipt`’s `delayYr` was built for.',k:'PLAY',e:'M',i:3},
{c:'instr',t:'Explain the flow at the cell you clicked',n:['currentdesk'],d:'`climateAtCell`, `coastAtCell` and `tectonicsAtCell` already answer for a cell. Add the fluid answer: this water came from there, arrives in so many years, is this warm and this salty because of that. Provenance is the most teachable thing a circulation model has.',k:'PLAY',e:'M',i:3},
{c:'instr',t:'A glossary entry for every mechanism this adds',d:'`glossary.js` has thirteen entries and a contextual hint system that already fires on `W._conveyorNote`. Ekman transport, Sverdrup balance, Bjerknes feedback, brine rejection, baroclinic instability — each is one sentence, and the hint should appear the first time the model does the thing.',k:'PLAY',e:'S',i:2},
];

/* ------------------------------------------------------------- derive -- */
D.forEach((x, i) => { x.id = i + 1; });

const byCat = (id) => D.filter((x) => x.c === id);
const count = (f) => D.filter(f).length;
const KIND = { SIM: 'Sim', EYE: 'Eye', PLAY: 'Play' };
/** Literal pipes inside inline code would split a markdown table cell. */
const md = (t) => String(t).replace(/\|/g, '\\|');

const provides = new Map();
for (const x of D) if (x.g) provides.set(x.g, x);
const dependents = (tok) => D.filter((y) => (y.n || []).includes(tok)).length;
const CRITICAL = [...provides.keys()]
  .map((k) => ({ k, x: provides.get(k), n: dependents(k) }))
  .filter((r) => r.n > 0)
  .sort((a, b) => b.n - a.n);

const NOW = [
  ['The grid has no directions in it', '`NBR` is built from face-local steps and `advect()` assumes indices 0/1 are east/west and 2/3 north/south. On the ±Y polar faces that is simply false, so temperature, moisture and ash are advected sideways relative to the wind on four of six faces. Nothing that deserves to be called fluid dynamics can be built until every cell knows which way is east.'],
  ['There is no ocean velocity anywhere in the codebase', 'Landed. `oceanU/V` are rotating shallow water with wind stress and a land wall. Remaining gyre items are about whether β and geometry actually make a Gulf Stream, not about allocating the arrays.'],
  ['There are three AMOCs and none of them is connected', '`W.conveyor` in `ocean.js` scales one mixing coefficient. `W._amoc` in `gaia.js` is written once as `?? 0.7` and read by a tipping element that therefore can never trip. `W.thermohaline` is set by `tripOceanConveyor` in `god/climate.js` and read by nothing at all.'],
  ['The pressure-driven wind never advects anything', '`atmoTick` calls `computeWinds`, which overwrites `windU`/`windV` with three prescribed latitude bands; `advect` transports temperature, moisture and ash with those; then `world.js` calls `geostrophicWind`, which overwrites them again. The band field is computed and thrown away every tick, on every world, and the good wind field is used only by storms and overlays.'],
  ['The atmosphere has no memory', 'Landed a first cut. `W.press` and `windU/V` are one-layer rotating shallow water (`vr/sim/swe.js`). Height still relaxes toward a thermal target, so this is not a GCM — but the field has a time derivative.'],
  ['El Niño does not exist, and neither does anything like it', 'A grep for `nino`, `enso`, `walker`, `ekman` and `vorticity` across `vr/` returns nothing. There is no interannual variability of any kind: for a given set of parameters the model has exactly one climate, so there is no wet year, no drought, no failed decade, and nothing on the surface needs to be adapted to anything but the mean.'],
  ['Continents collide and no mountain is built', 'All crustal thickening lives in `generateTectonics`; `tectonicsTick` touches `crust` only under an erupting volcano; and elevation is derived from crustal thickness exactly once, at generation. Plate centres drift, cells are reassigned every 48 ticks, boundaries reclassify — and the surface never responds, because nothing re-runs isostasy during a run.'],
  ['A volcano has no chemistry, and there is no lava', '`{ cell, magma, next }`, recharging at `0.01 * heatFlow`, erupting to `h[cell] += power * 0.04`. Silica content is the master variable of volcanology and it is absent, so a Hawaiian shield and a caldera-forming eruption are the same object. A grep for `lava` in `vr/` finds one receipt string saying an eruption kills via cooked volatiles rather than lava.'],
  ['The only wave in the model is a ring of acos calls', '`tsunamiTick` walks all 24,576 cells per tsunami per tick, computes an `acos` for each, marks anything near an expanding radius and sets `moist[c] = 1`. There are no wind waves at all — no fetch, no sea state, no swell, no surf — which is why the shoreline is a contour rather than a place where water arrives.'],
  ['A lake is a flag on one cell', '`computeRivers` full-sorts every cell by height each tick, routes all discharge into the single steepest of eight neighbours, and sets `lake[c] = 1` at any local minimum. Lakes have no level, no volume and no outlet; rivers cannot split, braid, meander or build a delta lobe; and neither is drawn as a line in either view.'],
  ['The weather map is index arithmetic', '`synopticChartSVG` samples cells as `(j * cols + i) * stride` into a 36 × 18 grid. That is a scrambled slice of cube-sphere memory with an ITCZ line drawn across it and wind barbs taken from unrelated places. It is the best instrument the atmosphere has.'],
  ['The deserts and the polar caps are hard-coded', '`hydroTick` clamps moisture to 0.14 between latitudes 0.3 and 0.5 where life is sparse, with a comment about keeping barren rock for bloom contrast. `iceTick` floors `iceLand` above 0.86 and `iceSea` above 0.88 to stop the caps disappearing. Both are compensating for circulation the model does not have.'],
  ['Nothing that moves is drawn as moving', 'The `wind` and `upwell` overlays map a magnitude to a colour ramp and show no direction. There are no particles, no streaklines, no arrows the eye can follow, no trails. Every fluid in this model is invisible, which is why the fluid layer has been easy to leave half-built.'],
];

const SEQ = [
  ['The basis first, and it is not optional', '`basis`, `vecop`, `advect2`. A tangent frame at every cell, shared divergence/curl/gradient operators, and an advection step that goes the way the wind is blowing. Twelve items in the first category unblock thirty-odd elsewhere, and one of them — a blob advected once around the sphere — is a test that would have caught the face-orientation bug immediately.'],
  ['Then the ocean moves', '`stress`, `ekman`, `oceanvel`, `gyre`, `wbc`. Wind stress, Ekman transport rotated ninety degrees, a real velocity field, the Sverdrup interior and the western boundary jet that closes it. This is the sequence that produces the Gulf Stream, and it produces it as a consequence of β and a coastline rather than as a drawn feature.'],
  ['Then the ocean remembers', '`salt`, `dwform`, `moc`. A conserved salt tracer, brine rejection under growing sea ice, density with competing temperature and salinity terms, convective adjustment, and overturning measured in sverdrups. At the end of this the three dead AMOCs become one live number with two stable states and a hysteresis loop nobody had to author.'],
  ['Then the air becomes a solver, and the modes appear', '`progatm`, `vort`, `jet`, `rossby`, `walker`, `enso`. Prognostic pressure and momentum, vorticity, a jet that is an object, planetary waves — and then the Walker cell and the Bjerknes feedback close the loop that makes El Niño. Interannual variability is the payoff and it reaches everything: the storm track, the biosphere, the chronicle.'],
  ['In parallel, the rock starts moving too', '`isostatick`, `orogen`, `platelife`, `mantleflow`, `magmachem`, `chamber`, `lavaflow`. Re-derive elevation from crust every tick and collisions build mountains for the first time; give plates a birth and a death and the Wilson cycle can finally run; give magma a composition and a chamber and volcanoes stop all being the same volcano. These touch different files from the fluid work and can go in parallel.'],
  ['Then make all of it visible, and keep it', '`particles`, `flowviz`, `section`, `currentdesk`, `fluidtest`. Advected tracers are the highest value per line in the document. After that: streakline overlays, a vertical section, a current desk, an ENSO index — and a golden run plus a calibration target for every new field, because a fluid layer with no test is one optimisation away from being reverted.'],
];
/* ------------------------------------------------------------ markdown -- */
function markdown() {
  const L = [];
  L.push('# ORRERY — currents');
  L.push('');
  L.push(`**${D.length} items.** Generated from \`scripts/currents.mjs\` — edit that file, not this one, then run \`node scripts/currents.mjs\`.`);
  L.push('');
  L.push('A deep dive on everything in this model that is supposed to move and does not: the ocean as a circulating fluid, the atmosphere as a solver rather than a lookup table, the modes of variability that make a climate a system, magma and mantle as the slowest liquids, continents that collide and build something — and what all of it has to look like.');
  L.push('');
  L.push(`Kind: **${count((x) => x.k === 'SIM')}** fluid physics, **${count((x) => x.k === 'EYE')}** picture, **${count((x) => x.k === 'PLAY')}** instrument or lever. Effort is S/M/L. Impact is 1–3.`);
  L.push('');

  L.push('## Where the fluids actually are');
  L.push('');
  for (const [a, b] of NOW) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## The critical path');
  L.push('');
  L.push('The capabilities the largest number of other items are waiting on.');
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
  L.push('The through-line: the tangent frame exists. Air and sea share one-layer rotating shallow water; magma still has no chemistry, and the crust still stops responding the moment generation ends. What remains is a sequence of small honest solvers replacing stand-ins.');
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
<title>ORRERY — currents</title>
<style>
:root{
  --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#4fb0c6; --accent-soft:rgba(79,176,198,.13); --accent-line:rgba(79,176,198,.36);
  --sim:#7fc8a9; --sim-soft:rgba(127,200,169,.14);
  --eye:#7fb0e0; --eye-soft:rgba(127,176,224,.14);
  --sans:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
}
@media (prefers-color-scheme: light){
  :root{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
    --text:#12151c; --dim:#4e5768; --faint:#727d90;
    --accent:#1b6b80; --accent-soft:rgba(27,107,128,.09); --accent-line:rgba(27,107,128,.32);
    --sim:#22705a; --sim-soft:rgba(34,112,90,.09); --eye:#215e93; --eye-soft:rgba(33,94,147,.09); }
}
:root[data-theme="dark"]{ --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#4fb0c6; --accent-soft:rgba(79,176,198,.13); --accent-line:rgba(79,176,198,.36);
  --sim:#7fc8a9; --sim-soft:rgba(127,200,169,.14); --eye:#7fb0e0; --eye-soft:rgba(127,176,224,.14); }
:root[data-theme="light"]{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
  --text:#12151c; --dim:#4e5768; --faint:#727d90;
  --accent:#1b6b80; --accent-soft:rgba(27,107,128,.09); --accent-line:rgba(27,107,128,.32);
  --sim:#22705a; --sim-soft:rgba(34,112,90,.09); --eye:#215e93; --eye-soft:rgba(33,94,147,.09); }

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
button.f.sim[aria-pressed="true"]{background:var(--sim-soft); border-color:var(--sim); color:var(--sim);}
button.f.eye[aria-pressed="true"]{background:var(--eye-soft); border-color:var(--eye); color:var(--eye);}
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
.tag.sim{background:var(--sim-soft); color:var(--sim); border-color:var(--sim);}
.tag.eye{background:var(--eye-soft); color:var(--eye); border-color:var(--eye);}
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
  <div class="eyebrow">Deep dive · the moving parts</div>
  <h1>Currents</h1>
  <p class="sub">Everything here is supposed to move. Air and sea share one-layer rotating
  shallow water. El Niño is a diagnosed basin oscillator, magma has no chemistry, and two continents can converge for a billion years without
  raising a single metre of mountain.</p>
  <p class="nav"><a href="./">Pitch</a> · <a href="backlog.html">Systems</a> ·
  <a href="worlds.html">Worlds</a> · <a href="evolution.html">Evolution</a> ·
  <a href="godgame.html">God layer</a> · <a href="next.html">Next 200</a> ·
  <a href="tides-weather.html">Tides &amp; weather</a> · <a href="geology.html">Geology</a> ·
  <a href="exoparams.html">Real parameters</a> · <a href="living.html">Alive</a> ·
  <a href="realism.html">Realism</a> · <a href="life.html">Life</a> · <a href="surface.html">Surface</a> · <a href="worldspace.html">World space</a> · <a href="openworld.html">Open world</a> · <a href="../vr/">Prototype</a></p>
  <dl class="tally">
    <div><dt>Items</dt><dd>${D.length}<small>${CATS.length} categories</small></dd></div>
    <div><dt>Kind</dt><dd>${count((x) => x.k === 'SIM')}/${count((x) => x.k === 'EYE')}/${count((x) => x.k === 'PLAY')}<small>sim · eye · play</small></dd></div>
    <div><dt>Impact 3</dt><dd>${count((x) => x.i === 3)}<small>of ${D.length}</small></dd></div>
    <div><dt>Effort</dt><dd>${count((x) => x.e === 'S')}/${count((x) => x.e === 'M')}/${count((x) => x.e === 'L')}<small>S / M / L</small></dd></div>
  </dl>
</header>

<div class="prose">
  <h2>Where the fluids actually are</h2>
  <ul class="state" id="now"></ul>

  <h2 style="margin-top:40px">The critical path</h2>
  <p>The capabilities the largest number of other items wait on.</p>
  <table class="crit"><tbody id="crit"></tbody></table>
</div>

<div class="controls">
  <div class="filters">
    <span class="flabel">Kind</span>
    <button class="f sim" data-k="k" data-v="SIM" aria-pressed="false">Sim</button>
    <button class="f eye" data-k="k" data-v="EYE" aria-pressed="false">Eye</button>
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
  <ol class="seq" id="seq"></ol>
  <p style="margin-top:16px">The through-line: the tangent frame exists. Air and sea share
  one-layer rotating shallow water; magma still has no chemistry, and the crust still stops
  responding the moment generation ends.</p>
</div>

<footer>
  Generated from <code>scripts/currents.mjs</code> — edit the source and re-run, do not edit the output.
</footer>
</div>

<script>
"use strict";
var DATA = ${data};
var CATS = ${cats};
var CRIT = ${crit};
var NOW = ${JSON.stringify(NOW)};
var SEQ = ${JSON.stringify(SEQ)};
var KLABEL = {SIM:'Sim', EYE:'Eye', PLAY:'Play'};
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
      var cls = o.k === 'SIM' ? 'sim' : o.k === 'EYE' ? 'eye' : 'play';
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
await writeFile(join(ROOT, 'briefs', 'currents-backlog.md'), markdown() + '\n');
await writeFile(join(ROOT, 'site', 'currents.html'), html());

console.log(`currents: ${D.length} items across ${CATS.length} categories`);
for (const [id, name] of CATS) console.log(`  ${String(byCat(id).length).padStart(3)}  ${name}`);
console.log(`\nkind     sim ${count((x) => x.k === 'SIM')} · eye ${count((x) => x.k === 'EYE')} · play ${count((x) => x.k === 'PLAY')}`);
console.log(`effort   S ${count((x) => x.e === 'S')} · M ${count((x) => x.e === 'M')} · L ${count((x) => x.e === 'L')}`);
console.log(`impact   3 ${count((x) => x.i === 3)} · 2 ${count((x) => x.i === 2)} · 1 ${count((x) => x.i === 1)}`);
console.log('\ncritical path:');
for (const r of CRITICAL.slice(0, 14)) {
  console.log(`  ${String(r.n).padStart(3)}  ${r.k.padEnd(12)} ${r.x.t}`);
}
const unmet = new Set();
for (const x of D) for (const t of x.n || []) if (!provides.has(t)) unmet.add(t);
if (unmet.size) console.log(`\nWARNING unmet tokens: ${[...unmet].join(', ')}`);
console.log('\nwrote briefs/currents-backlog.md and site/currents.html');
