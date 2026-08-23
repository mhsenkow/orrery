# ORRERY — weather: 500 steps

**Status:** register, not a queue. Nothing here is "next" until promoted into [`NEXT.md`](../NEXT.md).
**Scope:** the air column and everything that can now be built on it — convection, severe weather,
cyclones, fronts, drought, and how any of it is read.
**Date:** 2026-08-23

---

## What already landed (do not re-queue)

**Keystone + register wave (code).** [`vr/sim/aircol.js`](../vr/sim/aircol.js) is an
**eight-level** column with ice-phase saturation, `tSurfK` anchors, mixed-layer depth,
MLCAPE/MUCAPE, freeze/EL/tropopause, per-level winds, and a **lived weather clock**
([`weatherClock.js`](../vr/sim/weatherClock.js)) that engages column memory and writes
diurnal / dawn-CIN / night-shear boosts the column consumes. [`weather.js`](../vr/sim/weather.js)
adds `convectTick`, severe footprints/scars, ENSO drought; [`convect.js`](../vr/sim/convect.js)
organises MCS/squall/supercell modes; [`fronts.js`](../vr/sim/fronts.js) diagnoses synoptic
boundaries. Storms read the column for favour and RI. Bio feels drought. Climate panel:
sounding, hodograph mini, weather desk + **hours/s dial**, overlays (CAPE/ascent/drought/PWAT/
reflectivity/IR/WV). Save stays **v11** — drought persisted; soil/scar/convRain ephemeral by design
(GATE31 closed). Limits: [`weather-model.md`](weather-model.md).

**First-25 gate: complete.** LOC localview rendering, VIZ desk + overlays, GATE calibration spine
in `calibrate-all` (Earth `weather` bands), golden re-blessed (CONV20) with rationale in
`shipped.md`. Human playtest rows (GATE41–43) and Earth physical retune (CONV11 north star) remain
outside code closure.

## Retirement condition (GATE50)

This file retires when: (1) convection owns rain and the golden hash includes weather fields,
(2) severe weather has visible consequences (scars, bio response) confirmed by ≥3 playtest rows,
and (3) drought recurs at Earth-like rates confirmed by calibration spine. At that point the weather
system is load-bearing infrastructure, not a feature under development, and its rows belong in the
fidelity register rather than here.

## Why a column was the right keystone

Everything about weather that a single surface cannot answer is a question about the *profile*:

- **A hurricane** needs a warm core aloft over low-level convergence, and dies on vertical shear.
- **A tornado** needs instability *and* a turning wind *and* a low cloud base — three numbers from
  three different heights, of which the grid can resolve none.
- **A drought** needs subsiding air, which needs mass continuity between two levels.
- **A thunderstorm** needs a parcel that keeps rising once you have lifted it, which is a sounding.

One column answers all four, which is why it came before any of them.

## How to use this file

Same contract as [`earth-fidelity-500.md`](earth-fidelity-500.md) and
[`sky-system-500.md`](sky-system-500.md): promote 1–3 rows at a time; if a row cannot be written as a
check that fails now and passes later, delete it. Row IDs are namespaced (`COL`, `CONV`, `SEV`,
`CYC`, `FRONT`, `DRY`, `LOC`, `VIZ`, `GATE`) so they never collide with the other registers.

**Effort:** S ≈ under an hour · M ≈ a session · L ≈ multi-session.
**Impact:** 3 = felt in the first ninety seconds · 2 = felt on a second visit · 1 = felt by whoever
maintains it.

---

## First 25 — the gate

| # | Row | Why it gates |
|---|---|---|
| 1 | COL41 | Every ruleset gets a measured surface-temperature anchor — until then CAPE in joules is a sketch off Earth |
| 2 | COL42 | Ice-phase saturation below freezing; the whole cold half of every planet depends on it |
| 3 | COL1 COL2 | Two more levels and a real boundary layer, or the LFC stays unresolvable |
| 4 | COL21 | A lived-time weather clock — the prognostic path exists and nothing engages it |
| 5 | CONV1 | Convection makes rain. The big one, and it moves the golden corpus |
| 6 | CONV2 | Mass-flux closure, so the rain it makes is bounded by the moisture supply |
| 7 | CONV11 | Re-calibrate Earth's precipitation against the new source |
| 8 | CONV20 | Golden re-bless with a written rationale per changed number |
| 9 | SEV1 | Severe markers gain footprints, not just a cell |
| 10 | SEV11 | Damage: a downburst flattens forest, hail costs a harvest |
| 11 | CYC1 | Cyclone intensity from the column, replacing the surface proxy |
| 12 | CYC11 | Rapid intensification, and the shear that stops it |
| 13 | FRONT1 | Frontogenesis from the deformation field rather than a neighbour temperature jump |
| 14 | DRY11 | ENSO drives drought — the index exists and nothing reads it |
| 15 | DRY21 | Drought suppresses growth; the first consequence |
| 16 | LOC1 | Weather in localview: what it is doing where you are standing |
| 17 | LOC11 | Precipitation type — rain, snow, sleet, hail — from the column |
| 18 | VIZ1 | A sounding you can look at |
| 19 | VIZ11 | A hodograph, once there is a third wind level to draw one from |
| 20 | VIZ21 | The weather overlay set: CAPE, shear, ascent, drought |
| 21 | GATE1 | Calibration spine: Earth's rain, CAPE, tornado count, drought share |
| 22 | GATE11 | Per-section millisecond budgets, enforced |
| 23 | GATE21 | Determinism under striping — two runs, same age, same weather |
| 24 | GATE31 | Save v12 for whatever CONV1 makes stateful |
| 25 | GATE41 | Playtest rows on weather legibility |

**Review checkpoint:** after the gate, delete every row it made unnecessary.

---

# COL · The column, deeper (60)

*Today: six diagnostic levels, water thermodynamics, one anchor problem. Felt payoff: a sounding you
can trust on any world, and an atmosphere that has a life of its own when you watch it live.*

## COL.1 Resolution and structure (COL1–COL14)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| COL1 | **Eight levels, not six** | Add σ 0.95 and 0.55; the level of free convection falls between 0.80 and 0.65 today and is never resolved | M | 3 | CAPE against a 25 hPa reference sounding within 15%; `CAPE_GAIN` falls toward 1 |
| COL2 | **A real boundary layer** | Bottom two levels get a mixed-layer treatment with a diagnosed depth | L | 3 | Mixed-layer depth responds to surface heating and wind; diurnal range improves |
| COL3 | **Mixed-layer parcel** | Lift the mean of the lowest 100 hPa, not the surface point — the operational default | S | 3 | MLCAPE reported beside SBCAPE; MLCAPE is the one severe weather reads |
| COL4 | **Most-unstable parcel** | Search the lowest levels for the highest θe | M | 2 | MUCAPE reported; elevated convection appears above a cold front |
| COL5 | **Entrainment** | Dilute the parcel with environmental air as it rises | M | 2 | CAPE falls where the mid-levels are dry, which is where it should |
| COL6 | **Virtual temperature everywhere** | Already in the buoyancy; carry it into the thickness too | S | 1 | Hypsometric heights shift by the right fraction of a percent |
| COL7 | **Level heights stored** | Geopotential height per level, so overlays can say "5 km" | S | 2 | Field row committed; heights match the hypsometric march |
| COL8 | **Tropopause height** | Found from the lapse-rate criterion rather than assumed at 0.75·T | M | 2 | Height rises in the tropics and falls at the poles |
| COL9 | **Stratospheric layer** | One level above the tropopause with its own behaviour | M | 1 | Volcanic aerosol has somewhere to sit for a decade |
| COL10 | **Inversions** | Detect and report a capping inversion explicitly | S | 2 | Cap strength named in the sounding; severe rows can use it |
| COL11 | **Freezing level** | Height of the 0 °C isotherm per cell | S | 3 | Field committed; `LOC11` and hail both read it |
| COL12 | **Wet-bulb zero** | The hail discriminant | S | 2 | Computed and used by `SEV21` |
| COL13 | **Equilibrium level** | Top of the buoyant layer — the anvil height | S | 2 | Reported; storm top height follows from it |
| COL14 | **Column memory field** | Store the tick the column was built at, beside the temperature | S | 1 | Staleness visible in the debug overlay |

## COL.2 Making it prognostic (COL15–COL30)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| COL15 | **Horizontal advection per level** | Each level advected by its own wind, using the existing flux-limited advection | L | 3 | A dry intrusion aloft is carried downwind and shows up as a lowered CAPE |
| COL16 | **Vertical advection** | Move heat and moisture with the continuity vertical velocity | L | 3 | Ascent moistens the column above it, subsidence dries it |
| COL17 | **Wind per level** | Interpolate surface to jet by σ and store it — needed for advection and for a hodograph | M | 3 | Three wind levels stored; `VIZ11` can draw a curve |
| COL18 | **Third wind level** | A genuine mid-level wind rather than an interpolation, from the 700 hPa thermal wind | L | 3 | Hodograph curves; SRH stops being a closed form |
| COL19 | **Curved hodograph SRH** | Integrate properly once there are three levels | M | 3 | SRH differs between straight and curved cases; both tested |
| COL20 | **Conservation check** | Column water and enthalpy conserved by the advection to a stated tolerance | M | 3 | Assert in the smoke tier |
| COL21 | **Lived-time weather clock** | A clock face where a tick is hours, so the prognostic path engages | L | 3 | `keep > 0` in `aircol`; the column develops between frames |
| COL22 | **Weather-speed control** | Hours-per-second dial beside the existing year dial | M | 3 | Control exists; state advances at the stated rate |
| COL23 | **Diurnal convective cycle** | Afternoon CAPE build, evening collapse, on the lived clock | M | 3 | CAPE at one cell peaks after local noon |
| COL24 | **Nocturnal low-level jet** | Overnight decoupling accelerates the layer above the surface | M | 2 | Appears in the wind profile after sunset |
| COL25 | **Morning inversion** | Radiative cooling caps the column overnight | S | 2 | CIN peaks at dawn |
| COL26 | **Cold pools** | Downdraught outflow spreads and lifts the air ahead of it | L | 2 | Convection propagates rather than sitting still |
| COL27 | **Gust fronts** | The leading edge of a cold pool as a wind and lifting feature | M | 2 | Visible in the wind field, triggers new cells |
| COL28 | **Convective memory** | A cell that has just convected is stabilised for a while | S | 2 | No perpetual convection at one cell |
| COL29 | **Two-clock contract** | Written down: hours-per-tick is prognostic, years-per-tick is diagnostic | S | 3 | Stated in `weather-model.md`; a test asserts each regime |
| COL30 | **Determinism under both** | Same age by different tick sizes gives the same climate, not the same weather — and the difference is stated | M | 3 | Test asserts climate means agree within tolerance |

## COL.3 Off Earth, honestly (COL31–COL46)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| COL31 | **Methane thermodynamics** | A second saturation table, latent heat and molar ratio for CH₄ | L | 3 | Titan convects on methane; `airBudget().solvent` says methane and means it |
| COL32 | **CO₂ thermodynamics** | Mars's condensable, for the polar cap cycle | M | 2 | Winter CO₂ condensation appears in the column, consistent with `reservoirTick` |
| COL33 | **Ammonia and N₂** | Two more solvents from the substrate table | M | 1 | Cold worlds convect on the right species |
| COL34 | **Solvent from the substrate table** | Read the condensable from `substrates.js` rather than a branch per species | M | 3 | One code path; adding a solvent is a table row |
| COL35 | **Sulphuric acid clouds** | Venus's actual cloud deck | M | 1 | Cloud layer at the right altitude |
| COL36 | **Dust as a heating agent** | Mars's dust absorbs sunlight aloft and changes the profile | M | 2 | Dust storm warms the mid-levels and stabilises the surface |
| COL37 | **Hydrogen envelopes** | Giants: the column is the planet, with no surface | M | 1 | No-surface worlds get a legal, cheap path |
| COL38 | **Composition-dependent cp** | `3.5·R` is diatomic; polyatomic air differs | S | 2 | cp derived from composition; CO₂ atmospheres get 4·R |
| COL39 | **Pressure beyond 1 bar** | Venus at 92 bar and giants: sigma levels are fine, the constants are not | M | 2 | Venus column plausible against a measured profile |
| COL40 | **Non-hydrostatic worlds** | Rubble piles and tiny bodies: refuse a column rather than fake one | S | 2 | `airBudget` reports "no column" with a reason |
| COL41 | **`tSurfK` for every ruleset** | The single biggest gap: absolute temperature is only real where the ruleset carries an anchor | M | 3 | `air.calibrated` true for every ruleset; Mars reads 215 K and Venus 735 K |
| COL42 | **Ice-phase saturation** | Below freezing, saturation is over ice, not water — a 10% error at −20 °C and rising | S | 3 | Second branch in the table; snow and frost improve |
| COL43 | **Supercooled water** | The band between them, which is where icing lives | S | 1 | Reported in the sounding |
| COL44 | **Anchor from the world record** | Prefer measured `tSurf` from `worldRecord` over any ruleset guess | M | 3 | Measured worlds use measured temperatures, with the tier shown |
| COL45 | **Equilibrium-temperature fallback** | Where nothing is measured, anchor on `278·S^¼` plus greenhouse, not on Earth's 288 K | M | 3 | Fallback stated in the readout as assumed |
| COL46 | **Provenance sweep** | Every constant in `aircol.js` tagged with a source | S | 2 | Scanner reports the file above baseline |

## COL.4 Cost, correctness and the awkward cases (COL47–COL60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| COL47 | **Typed-array packing** | Pack the eight diagnostics into one interleaved array for locality | M | 1 | Measured cache win; field count falls |
| COL48 | **SIMD-shaped inner loop** | Restructure the level march so it vectorises | L | 1 | Measured speedup; numbers unchanged |
| COL49 | **GPGPU column** | Move the march to a shader beside the existing climate path | L | 2 | CPU↔GPU parity within tolerance |
| COL50 | **Adaptive striping** | Stripe count from measured cost against the budget | S | 2 | Stripes widen on slow devices, narrow on fast |
| COL51 | **Skip the settled** | Cells whose profile has not moved skip the parcel march entirely | M | 2 | Cost falls on a quiet planet, unchanged on a stormy one |
| COL52 | **Ocean-only fast path** | Uniform warm ocean columns are nearly identical; exploit it | M | 1 | Measured saving, bounded error stated |
| COL53 | **Alloc discipline** | Stay at zero allocations as levels grow | S | 3 | `alloc-lint` covers `aircol.js` |
| COL54 | **Budget row** | Cost at 6 / 8 / 10 levels recorded | S | 3 | Table in `test-timing.md` |
| COL55 | **Polar night** | No insolation for months: the column must not invent instability | S | 2 | Winter pole reports stable, always |
| COL56 | **Tidally locked columns** | The substellar column and the antistellar one are different animals | M | 2 | Both plausible; terminator ring visible in ascent |
| COL57 | **Snowball worlds** | A frozen planet's column, with the whole surface at once | S | 2 | No spurious convection over ice |
| COL58 | **Post-impact columns** | An impact winter's profile, with the dust aloft | M | 2 | Column responds to the aerosol load |
| COL59 | **Debug overlay** | `?air=1` draws the column at the inspected cell as a live sounding | S | 2 | Overlay renders, costs nothing when off |
| COL60 | **Headless dump** | `headless.mjs --sounding <cell>` prints a table | S | 2 | Output stable across platforms |

---

# CONV · Convection as the precipitation engine (60)

*Today: `hydro.js` owns rain, and storms paint most of it. The column knows where the air wants to
rise and is not allowed to say so. Felt payoff: rain that falls because the atmosphere is unstable,
in the places instability actually is — and a squall line you can watch cross a continent.*

## CONV.1 The handover (CONV1–CONV20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| CONV1 | **Convection makes rain** | Convective precipitation from the column, behind a flag, then on by default | L | 3 | Rain appears where CAPE is consumed; flag removed after `CONV20` |
| CONV2 | **Mass-flux closure** | Rain rate bounded by the moisture the updraught can carry, not by CAPE alone | L | 3 | Precipitation cannot exceed the column's water supply; conservation asserted |
| CONV3 | **CAPE consumption** | Convection stabilises the column it rains out of | M | 3 | CAPE falls after a convective tick and rebuilds |
| CONV4 | **Trigger function** | CIN has to be overcome — by heating, lifting or a cold pool | M | 3 | Capped columns do not rain; uncapped ones do |
| CONV5 | **Shallow vs deep** | Shallow convection moistens, deep convection rains | M | 2 | Two regimes distinguished in the readout |
| CONV6 | **Convective vs stratiform split** | Two precipitation fields, reported separately | M | 2 | Tropics convective-dominated, midlatitudes stratiform-dominated |
| CONV7 | **Orographic interaction** | The existing upslope term composes with convection rather than competing | M | 2 | Windward rain increases without double counting |
| CONV8 | **Frontal lifting** | Fronts supply the lift the trigger needs | M | 3 | Rain bands follow fronts |
| CONV9 | **ITCZ from convection** | The convergence band rains because it convects | M | 3 | ITCZ rainfall emerges rather than being painted |
| CONV10 | **Subsidence suppression** | Descending air suppresses rain, hard | M | 3 | Subtropical dry zones appear at the right latitudes |
| CONV11 | **Earth precipitation re-calibration** | Global mean ~1,000 mm/yr, tropics 2,000+, deserts under 250 | L | 3 | Baselines in `calibrate-all`; zonal-mean curve matches reference |
| CONV12 | **Rain-shadow calibration** | Named cases: Atacama, Death Valley, the Gobi | M | 2 | Each lands in its band |
| CONV13 | **Monsoon rainfall** | The existing monsoon push produces the rain to match | M | 3 | Seasonal reversal carries a seasonal rainfall signal |
| CONV14 | **Storm rainfall re-based** | `paintStorm`'s 0.7 becomes a physical rain rate from the column | M | 3 | Cyclone rain totals plausible; `storms.js` stops being the main water source |
| CONV15 | **Evaporation balance** | Global evaporation and precipitation balance to a stated tolerance | M | 3 | Assert in the smoke tier |
| CONV16 | **Runoff and rivers** | The existing drainage reads the new rainfall unchanged | M | 2 | River discharge plausible; no regression in `computeRivers` |
| CONV17 | **Snowfall** | Cold-column precipitation falls as snow and feeds `iceLand` | M | 3 | Snow line matches the freezing level |
| CONV18 | **Ice-sheet accumulation** | Snowfall feeds the cryosphere rather than a parameterisation | L | 2 | Ice growth responds to precipitation, not only to temperature |
| CONV19 | **Parity** | CPU and GPGPU paths agree with convection on | M | 3 | `parity-climate` extended and passing |
| CONV20 | **Golden re-bless** | One regeneration, a written rationale per changed number | M | 3 | `golden.json` updated; rationale in `shipped.md` |

## CONV.2 Organised convection (CONV21–CONV40)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| CONV21 | **Single cells** | Short-lived, no shear: the default summer shower | S | 2 | Classified and named in the readout |
| CONV22 | **Multicell clusters** | Moderate shear, propagating by cold pool | M | 2 | Cluster lifetime exceeds a single cell's |
| CONV23 | **Squall lines** | Strong shear perpendicular to a line of lift | L | 3 | A line forms, propagates, and is visible as a rain band |
| CONV24 | **Bow echoes** | The bowing squall line that makes the worst downbursts | M | 2 | Shape appears in the rain field; feeds `SEV31` |
| CONV25 | **Supercells** | High shear, high instability, a rotating updraught | L | 3 | Classified where EHI supports it; feeds `SEV1` |
| CONV26 | **Mesoscale convective systems** | The overnight continental rain machine | L | 2 | MCS lifetime spans a night; rainfall total dominates the local budget |
| CONV27 | **Mesoscale convective complexes** | The largest organised systems, tracked as objects | M | 1 | Tracked like cyclones, with their own list |
| CONV28 | **Tropical cloud clusters** | Pre-cyclone disturbances, and where genesis starts | M | 3 | Cyclone genesis begins from a tracked cluster |
| CONV29 | **Diurnal land–sea contrast** | Sea breeze convergence rains in the afternoon | M | 2 | Coastal rainfall peaks in the afternoon on the lived clock |
| CONV30 | **Lake-effect snow** | Cold air over warm water, downwind band | M | 1 | Band appears downwind of a warm lake in winter |
| CONV31 | **Convective organisation index** | One number for how organised the convection is | S | 2 | Reported; drives the classification above |
| CONV32 | **Storm motion** | Bunkers left and right movers, from the hodograph | M | 2 | Two motions computed; the right mover is the severe one |
| CONV33 | **Propagation vs advection** | Systems that move faster than the wind, because they propagate | M | 2 | Squall lines outrun the mean flow |
| CONV34 | **Anvil cirrus** | The outflow cloud, which is most of the cloud a storm makes | M | 2 | Cloud field shows the anvil downshear |
| CONV35 | **Overshooting tops** | The strongest updraughts punch the tropopause | S | 1 | Reported for the strongest cells |
| CONV36 | **Mammatus and shelf clouds** | Cosmetic, but the recognisable ones | S | 1 | Rendered in localview under the right conditions |
| CONV37 | **Virga** | Rain that evaporates before landing, over dry air | S | 2 | Precipitation reaching the ground differs from what falls |
| CONV38 | **Convective inhibition map** | Where the cap is holding, as an overlay | S | 2 | Overlay drawn; explains dry days under high CAPE |
| CONV39 | **Cloud fraction per level** | Replaces one cloud number with a profile | L | 2 | Renderer can draw layered cloud |
| CONV40 | **Cloud-radiation feedback per level** | High thin cloud warms, low thick cloud cools | L | 2 | Two signs distinguished; net effect calibrated |

## CONV.3 The water it moves (CONV41–CONV60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| CONV41 | **Rain rate, not rain amount** | mm/hr as the field, integrated over the tick | S | 3 | Units stated; readouts in mm/hr and mm/yr |
| CONV42 | **Extreme rainfall statistics** | The tail matters more than the mean for floods | M | 2 | Return-period curve available in the Lab |
| CONV43 | **Flash flooding** | Rain rate against terrain and soil saturation | M | 3 | Floods appear in steep catchments after extreme rain |
| CONV44 | **Atmospheric rivers** | Narrow filaments of vapour transport | M | 3 | Filaments visible in a vapour-transport overlay |
| CONV45 | **Landfalling AR rainfall** | Where those rivers hit mountains | M | 2 | Windward totals spike |
| CONV46 | **Drizzle vs downpour** | Same total, different consequence for soil and life | S | 2 | Two regimes distinguished; runoff differs |
| CONV47 | **Interception by canopy** | Vegetation catches rain before the soil sees it | M | 2 | Forested cells buffer rainfall |
| CONV48 | **Soil infiltration** | Not all rain becomes soil moisture | M | 2 | Infiltration capacity limits it; excess runs off |
| CONV49 | **Hail as precipitation** | Hail is water too, and it lands cold | S | 1 | Accounted in the water budget |
| CONV50 | **Fog and dew** | The existing fog field reads the column's saturation | S | 2 | Fog appears where the column is saturated at the surface |
| CONV51 | **Freezing rain** | Warm layer over a cold surface | M | 2 | Reported where the profile supports it |
| CONV52 | **Graupel and sleet** | The middle of the frozen family | S | 1 | Classified from the profile |
| CONV53 | **Water budget audit** | Every term in and out, per tick, in the Lab | M | 3 | Budget closes to a stated tolerance |
| CONV54 | **Vapour transport map** | Where the water is going, as a vector overlay | S | 2 | Overlay drawn |
| CONV55 | **Recycling ratio** | How much of a continent's rain is its own evaporation | M | 1 | Number reported; Amazon-like basins score high |
| CONV56 | **Precipitation seasonality** | Wet and dry seasons from the seasonal cycle | M | 3 | Seasonality index maps onto biomes |
| CONV57 | **Interannual variability** | Rain differs year to year, and by how much | M | 2 | Variance reported; feeds `DRY11` |
| CONV58 | **Provenance** | Every convective constant tagged | S | 2 | Scanner above baseline |
| CONV59 | **Limits paragraph** | No microphysics, no drop-size distribution, bulk closure only | S | 3 | Written into `weather-model.md` |
| CONV60 | **Fast asserts** | Rain where CAPE is consumed; water conserved; no rain in a stable column | S | 3 | Three asserts, inside budget |

---

# SEV · Severe convective weather (60)

*Today: markers with an estimated count, a strength and a gust footprint. Nothing they do has a
consequence. Felt payoff: a tornado outbreak that leaves a scar you can find, and a hail season a
civilisation has to plan around.*

## SEV.1 Tornadoes (SEV1–SEV20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| SEV1 | **Footprint, not a cell** | A track: length, width, bearing, from the storm motion | M | 3 | Track drawn on the map, oriented along the hodograph |
| SEV2 | **Intensity scale** | An EF-like scale from the ingredients, with the mapping stated | M | 3 | Distribution matches the real one: most weak, few violent |
| SEV3 | **Significant-tornado parameter** | The operational composite, not just EHI | M | 2 | STP computed; violent events require it |
| SEV4 | **Low-level shear term** | 0–1 km shear, which discriminates tornadoes better than 0–6 km | M | 3 | Needs `COL17`; distribution tightens |
| SEV5 | **LCL height gate** | Already a factor; calibrate it against the observed relationship | S | 2 | Gate reproduces the observed dependence |
| SEV6 | **Cold-season tornadoes** | High shear, low CAPE — the deadly kind the current gate excludes | M | 2 | Winter outbreaks possible where shear is extreme |
| SEV7 | **Tornado alley** | A geographic pattern emerges rather than being placed | M | 3 | Frequency map concentrates where the ingredients overlap |
| SEV8 | **Seasonality** | A season, with a peak month | M | 2 | Annual cycle visible in the count |
| SEV9 | **Diurnal timing** | Late afternoon and evening | S | 2 | On the lived clock, timing matches |
| SEV10 | **Outbreak clustering** | Many on one day, then nothing for weeks | M | 2 | Count distribution is clustered, not Poisson |
| SEV11 | **Damage to build** | A track through a city damages `build` | M | 3 | Damage proportional to intensity and width |
| SEV12 | **Damage to forest** | A track through canopy leaves a scar in the cover field | M | 3 | Scar visible and persists until regrowth |
| SEV13 | **Casualties** | Population in the path, with warning time as a modifier | M | 2 | Recorded in the chronicle, not gamified |
| SEV14 | **Warning time** | A civilisation with the right tech gets one | M | 2 | Casualties fall once radar exists (`VIZ31`) |
| SEV15 | **Waterspouts** | Already at a quarter rate over water; make them their own kind | S | 1 | Named separately; no land damage |
| SEV16 | **Landspouts** | Non-mesocyclonic, needs no supercell | S | 1 | Separate, weaker path |
| SEV17 | **Dust devils** | Dry convection on Mars and in deserts, no moisture required | M | 2 | Appear on Mars, visible in localview |
| SEV18 | **Track record** | Every track kept for the run's history | S | 2 | Queryable; drawn as a heat map over time |
| SEV19 | **Named outbreaks** | The big ones get a name and a chronicle entry | S | 2 | Entry with date, count and place |
| SEV20 | **Fast asserts** | Track geometry, intensity distribution, no tornadoes in a stable column | S | 3 | Three asserts |

## SEV.2 Hail and wind (SEV21–SEV40)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| SEV21 | **Hail size from the column** | Updraught strength against the wet-bulb-zero height | M | 3 | Size distribution plausible; giant hail is rare |
| SEV22 | **Hail swath** | A footprint along the storm track, not a point | M | 2 | Swath drawn |
| SEV23 | **Melting** | A deep warm layer melts hail before it lands | S | 2 | Tropical hail is rare at the surface, as observed |
| SEV24 | **Crop damage** | Hail costs a harvest where there is one | M | 3 | Yield loss recorded; civ notices |
| SEV25 | **Hail climatology** | High plains and lee-of-mountain concentration emerges | M | 2 | Frequency map plausible |
| SEV26 | **Downburst outflow** | Radial wind field, not a blob | M | 2 | Wind field shows divergence at the surface |
| SEV27 | **Wet vs dry microburst** | Two mechanisms, two signatures | S | 2 | Distinguished by mid-level moisture |
| SEV28 | **Derechos** | Long-lived, long-track wind events from a bow echo | M | 2 | Track spans hundreds of km |
| SEV29 | **Wind damage curve** | Damage against wind speed, with the exponent stated | S | 2 | Curve tagged and used by both hail and wind |
| SEV30 | **Treefall alignment** | Downburst scars are radial, tornado scars convergent — the classic discriminant | M | 1 | Visible at localview scale |
| SEV31 | **Bow-echo coupling** | Where `CONV24` bows, downbursts follow | M | 2 | Correlation visible in the tape |
| SEV32 | **Lightning coupling** | The existing `lightning.js` reads updraught strength instead of guessing | M | 3 | Flash rate scales with CAPE and ice flux |
| SEV33 | **Lightning-started fire** | Existing fire module ignited by the flash field where fuel is dry | M | 3 | Ignition where lightning meets dry fuel |
| SEV34 | **Dry lightning** | Storms whose rain evaporates but whose lightning lands | M | 2 | The worst fire case exists |
| SEV35 | **Sprites and elves** | Cosmetic upper-atmosphere discharge over the biggest storms | S | 1 | Rendered rarely, over MCSs |
| SEV36 | **Thunder audio** | Delay from distance, rumble from extent | S | 1 | Audible in localview at the right delay |
| SEV37 | **Squall-line wind** | The straight-line wind that does more damage than tornadoes | M | 2 | Damage totals reflect it |
| SEV38 | **Marker cap review** | Six concurrent markers, revisited once footprints exist | S | 2 | Cap justified by legibility measurement |
| SEV39 | **Severe overlay** | Risk categories drawn like an outlook map | M | 3 | Overlay with named categories |
| SEV40 | **Provenance** | NOAA counts, EF distribution, hail-size relationships tagged | S | 2 | Scanner above baseline |

## SEV.3 Living with it (SEV41–SEV60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| SEV41 | **Agents shelter** | Life and cities respond to severe weather | M | 2 | Behaviour change observable |
| SEV42 | **Building codes** | Tech level changes how much damage a storm does | M | 2 | Damage falls with tech, stated in the readout |
| SEV43 | **Storm cellars** | A cheap civ adaptation with a visible effect | S | 1 | Casualties fall where built |
| SEV44 | **Insurance-style ledger** | Cumulative damage tracked per region | S | 1 | Ledger in the Lab |
| SEV45 | **Disaster memory** | A region that was hit recently behaves differently | S | 2 | Memory field with a decay |
| SEV46 | **Migration away from risk** | Persistent risk shifts settlement | M | 2 | City placement responds over centuries |
| SEV47 | **Ecological role** | Windthrow gaps let light in — disturbance is not only loss | M | 3 | Gap regeneration follows a scar |
| SEV48 | **Fire–storm cycle** | Lightning, fire, regrowth, fuel, lightning | M | 3 | Cycle visible over centuries |
| SEV49 | **Pollination and dispersal by wind** | Storms move seeds and pollen | M | 1 | Dispersal distance responds to wind |
| SEV50 | **Severe weather on other worlds** | Mars dust devils, Titan methane storms, Venus lightning | M | 2 | Each world's severe mode is its own |
| SEV51 | **Tool: seed a storm** | The existing seed tool reads the column and says what is missing | S | 3 | Failure message names the missing ingredient |
| SEV52 | **Tool: lift the cap** | A god tool that removes CIN locally, with a receipt | S | 2 | Convection fires; receipt states the settling |
| SEV53 | **Tool: shear the column** | Add or remove vertical shear locally | M | 2 | Supercells become possible or impossible |
| SEV54 | **Receipts** | Every weather tool issues one with the honest timescale | S | 3 | Receipts visible |
| SEV55 | **Chronicle entries** | Outbreaks, derechos, hail seasons logged | S | 2 | Entries with places and counts |
| SEV56 | **Moments** | "Your first violent tornado" fires once | S | 2 | Saved with the run |
| SEV57 | **Glossary** | CAPE, CIN, shear, helicity, EHI, derecho, supercell | S | 2 | Terms defined and linked |
| SEV58 | **Accessibility** | Severe weather announced, not only drawn | S | 2 | Live-region text on new outbreaks |
| SEV59 | **Save** | Markers and tracks round-trip where they should | M | 2 | Fixture test; transient markers deliberately not saved |
| SEV60 | **Limits** | Ingredient-based, not resolved; a marker is a rate | S | 3 | Stated in `weather-model.md` |

---

# CYC · Cyclones done properly (60)

*Today: tracked objects with a favour function, steered by the jet, with surge at landfall. They
were the first weather this model had and they are now the least connected to the column. Felt
payoff: a hurricane whose intensity you can explain, and a forecast cone you can be wrong about.*

## CYC.1 Intensity from physics (CYC1–CYC20)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| CYC1 | **Intensity from the column** | Warm core, surface enthalpy flux and shear, replacing the surface proxy | L | 3 | Intensity responds to SST, mid-level humidity and shear separately |
| CYC2 | **Potential intensity** | The thermodynamic ceiling for this SST and outflow temperature | M | 3 | Ceiling reported; no storm exceeds it |
| CYC3 | **Genesis from a cluster** | Genesis begins at a tracked tropical cloud cluster (`CONV28`) | M | 3 | Genesis location is a place with a history, not a sample |
| CYC4 | **Genesis potential index** | The standard composite, from the column | M | 3 | Index map matches the basins |
| CYC5 | **Mid-level humidity gate** | Dry air aloft kills a storm; `pwat` already knows | S | 3 | Storms die crossing a dry intrusion |
| CYC6 | **Ocean heat content** | Depth of warm water, not just the surface | M | 3 | Shallow warm layers give weaker storms |
| CYC7 | **Cold wake** | A storm mixes the ocean it crosses and weakens behind itself | M | 3 | Second storm on the same track is weaker |
| CYC8 | **Eyewall structure** | A ring of maximum wind, not a decaying blob | M | 3 | Radial wind profile has a maximum off-centre |
| CYC9 | **Radius of maximum wind** | Its own variable, which controls surge more than intensity does | M | 3 | Surge scales with size, not only intensity |
| CYC10 | **Storm size** | Outer radius as a separate variable | M | 2 | Large weak storms and small intense ones both exist |
| CYC11 | **Rapid intensification** | The low-shear, high-OHC case that gets people killed | M | 3 | RI events occur at the observed rate |
| CYC12 | **Eyewall replacement** | The intensity plateau and dip | M | 1 | Visible in the intensity trace of long-lived storms |
| CYC13 | **Extratropical transition** | A tropical storm that moves poleward becomes something else | M | 3 | Kind changes mid-life; wind field broadens |
| CYC14 | **Baroclinic reintensification** | And can then deepen again | M | 2 | Happens for the right tracks |
| CYC15 | **Landfall decay** | Decay rate from terrain and moisture, not a flat 0.82 | M | 3 | Wet flat land decays slower than dry mountains |
| CYC16 | **Brown ocean effect** | A storm surviving over saturated ground | S | 1 | Occurs rarely, over swamp |
| CYC17 | **Recurvature** | The poleward turn as the storm leaves the trades | M | 2 | Tracks recurve without the hard-coded nudges |
| CYC18 | **Steering by layer-mean flow** | Deep-layer mean rather than a jet-plus-surface blend | M | 3 | Tracks match the flow they should |
| CYC19 | **Beta drift** | The small poleward-westward drift from the vorticity gradient | S | 1 | Present, replacing a hard-coded constant |
| CYC20 | **Fujiwhara interaction** | Two nearby storms rotate around each other | M | 1 | Occurs when two are close |

## CYC.2 What they do (CYC21–CYC40)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| CYC21 | **Rain shield** | Rainfall from the column, asymmetric, ahead and left of track | M | 3 | Rain field asymmetric; totals plausible |
| CYC22 | **Inland flooding** | Often the real killer; rain over terrain after landfall | M | 3 | Flooding recorded away from the coast |
| CYC23 | **Surge from size and shelf** | The existing surge reads radius, forward speed and shelf slope | M | 3 | Shallow wide shelves flood far more |
| CYC24 | **Surge timing against tide** | Already spring-aware; make it phase-aware | S | 3 | Worst case is surge at high spring tide |
| CYC25 | **Wave field** | Wind waves and swell, radiating outward | M | 2 | Swell arrives before the storm |
| CYC26 | **Coastal erosion** | A surge moves sediment and reshapes the shore | M | 2 | Coastline changes after a major landfall |
| CYC27 | **Saltwater intrusion** | Surge poisons soil and groundwater for years | M | 2 | Soil recovery takes decades |
| CYC28 | **Mangrove protection** | Coastal vegetation reduces surge | M | 3 | Cleared coasts flood worse — a legible lesson |
| CYC29 | **Reef protection** | And so do reefs | S | 2 | Same mechanism, different cover |
| CYC30 | **Heat transport** | Cyclones move heat poleward; count it in the budget | M | 2 | Contribution reported in the Lab |
| CYC31 | **Ocean mixing** | They stir the thermocline, which matters over centuries | M | 2 | Mixing feeds back into ocean heat content |
| CYC32 | **Nutrient upwelling** | And bring nutrients up, which feeds the biosphere | M | 2 | Productivity bloom follows a track |
| CYC33 | **Basins** | Named basins with their own seasons | M | 2 | Basins derived from geography, not authored |
| CYC34 | **Season length** | A season with a start, peak and end | M | 3 | Annual cycle in genesis rate |
| CYC35 | **ENSO modulation** | Basin activity shifts with the existing ENSO index | M | 3 | Correlation visible over decades |
| CYC36 | **Accumulated cyclone energy** | One number for a season's activity | S | 2 | Reported per basin per year |
| CYC37 | **Climate-change response** | Fewer but stronger, as the model's own physics predicts | M | 2 | Trend emerges under warming, with the mechanism named |
| CYC38 | **Cyclones on other worlds** | A slow rotator's storms, a locked world's, a giant's | M | 2 | Each plausible; Jovian vortices persist |
| CYC39 | **Polar lows** | The small cold-season maritime cyclone | M | 1 | Occurs at high latitudes in winter |
| CYC40 | **Medicanes** | The hybrid subtropical case | S | 1 | Occurs in enclosed warm seas |

## CYC.3 Watching and forecasting (CYC41–CYC60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| CYC41 | **Forecast cone** | A track forecast with honest uncertainty growth | M | 3 | Cone widens with lead time; sometimes wrong |
| CYC42 | **Forecast skill readout** | How good the forecast has been, measured | M | 3 | Skill score shown; improves with tech |
| CYC43 | **Predictability horizon** | State it: two weeks for weather, and why | S | 3 | Stated in the panel, as the storm desk already hints |
| CYC44 | **Ensemble spread** | Several perturbed tracks rather than one line | M | 2 | Spread drawn; spread reflects the flow's own instability |
| CYC45 | **Warning system** | Civ tech gates whether a warning exists | M | 2 | Casualties respond |
| CYC46 | **Evacuation** | Population moves ahead of a forecast landfall | M | 2 | Movement visible; false alarms cost trust |
| CYC47 | **Satellite view** | The recognisable image: eye, bands, anvil | M | 2 | Render mode that looks like a satellite loop |
| CYC48 | **Radar view** | Reflectivity from the rain field | M | 2 | Overlay reads like radar |
| CYC49 | **Recon flight** | Descend into the eye — the game's own hold-and-descend loop | M | 3 | Localview inside the eye works and is legible |
| CYC50 | **Eye calm** | Wind drops, sky opens, then it returns | M | 3 | Sequence observable on the lived clock |
| CYC51 | **Storm chase** | Follow a storm at localview scale | M | 2 | Follow mode works for severe markers too |
| CYC52 | **Names and retirement** | The naming list, and retiring the worst | S | 1 | Retired names recorded in the chronicle |
| CYC53 | **Historical record** | Every storm the world has had, queryable | S | 2 | Track archive in the Lab |
| CYC54 | **Return periods** | How often this coast sees a major storm | M | 2 | Number per coastline segment |
| CYC55 | **Calibration: Atlantic** | ~14 named storms a year, ~7 hurricanes, ~3 major | M | 3 | Baselines in `calibrate-all` |
| CYC56 | **Calibration: intensity distribution** | Most storms are weak; category 5 is rare | M | 3 | Distribution matches observation |
| CYC57 | **Calibration: landfall rate** | Fraction of storms that make landfall | S | 2 | Baseline committed |
| CYC58 | **Perf** | Cyclone cost bounded as the object count grows | S | 2 | Budget recorded |
| CYC59 | **Fast asserts** | Genesis needs the ingredients; shear kills; potential intensity caps | S | 3 | Three asserts |
| CYC60 | **Limits** | Parameterised vortices on a 90 km grid, not a resolved eyewall | S | 3 | Stated plainly |

---

# FRONT · Fronts, jets and storm tracks (50)

*Today: `W.front` is the largest temperature jump to a neighbour, and the jet comes from thermal
wind. Both are better than nothing and neither is a front. Felt payoff: weather that arrives — a
band of cloud and rain crossing the map from the west, with a wind shift behind it.*

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| FRONT1 | **Frontogenesis function** | Fronts from the deformation of the wind field acting on the temperature gradient, not from a neighbour jump | L | 3 | Fronts form where flow converges across a gradient, and only there |
| FRONT2 | **Frontal zones, not cells** | A front is a line with an orientation and a strength | M | 3 | Line drawn with a direction; not a scattered field |
| FRONT3 | **Cold and warm fronts** | Distinguished by which air is advancing | M | 3 | Both types identified and drawn conventionally |
| FRONT4 | **Occluded fronts** | The cold front catching the warm one | M | 2 | Occlusion appears in mature cyclones |
| FRONT5 | **Stationary fronts** | And the long rain events they cause | S | 2 | Identified; rainfall totals reflect the persistence |
| FRONT6 | **Frontal slope** | Warm fronts are shallow, cold fronts steep — which sets the rain pattern | M | 2 | Rain ahead of the warm front, along the cold one |
| FRONT7 | **Frontal rain bands** | Rain from frontal lifting via the convective trigger | M | 3 | Bands follow the lines |
| FRONT8 | **Wind shift** | Direction changes as a front passes | M | 3 | Observable at a cell on the lived clock |
| FRONT9 | **Temperature drop** | The classic post-frontal drop | S | 3 | Observable and of the right size |
| FRONT10 | **Pressure trough** | The front sits in one | S | 2 | Pressure field shows the trough |
| FRONT11 | **Dry line** | The moisture boundary that makes severe weather on the plains | M | 3 | Appears where a moist and a dry air mass meet over land |
| FRONT12 | **Cyclone families** | Fronts spawning cyclones in sequence along the track | M | 2 | Several cyclones on one front, staggered |
| FRONT13 | **Storm track as a field** | Where cyclones go, accumulated | S | 3 | Overlay drawn; matches the jet |
| FRONT14 | **Eady growth rate** | The baroclinic instability rate, properly, replacing `midlatFavor`'s composite | M | 3 | Growth rate map matches the storm track |
| FRONT15 | **Jet streaks** | Local maxima in the jet, where cyclones deepen | M | 2 | Streaks identified; genesis correlates |
| FRONT16 | **Divergence quadrants** | The right-entrance and left-exit lifting | M | 2 | Ascent field shows the four-quadrant pattern |
| FRONT17 | **Rossby waves** | The long waves the jet meanders in | L | 3 | Wave number and amplitude reported; meanders visible |
| FRONT18 | **Wave breaking** | And how they break | M | 1 | Cutoff features appear |
| FRONT19 | **Cutoff lows** | Detached cold pools aloft, which sit and rain | M | 2 | Occur and persist |
| FRONT20 | **Blocking highs** | The persistent ridge that causes heat waves and droughts | M | 3 | Blocks identified, persist for weeks, feed `DRY13` |
| FRONT21 | **Omega blocks** | The recognisable shape | S | 1 | Detected and named |
| FRONT22 | **Zonal vs meridional regimes** | Two circulation modes, and switching between them | M | 2 | Regime index reported |
| FRONT23 | **Annular modes** | The leading pattern of variability | M | 1 | Index computed; correlates with storm-track latitude |
| FRONT24 | **Sudden stratospheric warming** | Needs `COL9`; the cold-winter mechanism | M | 1 | Event occurs; cold outbreak follows |
| FRONT25 | **Cold-air outbreaks** | Arctic air spilling equatorward behind a trough | M | 3 | Visible as a cold tongue; damages life at the edge |
| FRONT26 | **Lee troughs** | Downwind of mountains, where cyclones form | M | 2 | Appear behind ranges |
| FRONT27 | **Chinook and foehn** | Downslope warming, dramatic and legible | M | 2 | Temperature spike in the lee of a range |
| FRONT28 | **Katabatic wind** | Cold dense air draining off an ice sheet | M | 2 | Persistent offshore wind at ice margins |
| FRONT29 | **Barrier jets** | Flow blocked and turned by a range | S | 1 | Present along windward slopes |
| FRONT30 | **Gap winds** | Accelerated flow through a pass | S | 1 | Present at gaps |
| FRONT31 | **Sea breeze front** | The daily coastal convergence line | M | 2 | Appears in the afternoon, inland-propagating |
| FRONT32 | **Land breeze** | And reverses overnight | S | 1 | Present on the lived clock |
| FRONT33 | **Mountain–valley wind** | Diurnal upslope and downslope | S | 1 | Present in terrain |
| FRONT34 | **Urban heat island** | Cities make their own circulation | M | 1 | Temperature and convergence anomaly over `build` |
| FRONT35 | **Front overlay** | Fronts drawn with conventional symbols | M | 3 | Overlay legible at both zoom levels |
| FRONT36 | **Pressure-map overlay** | Isobars, which is how a person reads weather | M | 3 | Isobars drawn from the existing pressure field |
| FRONT37 | **Thickness overlay** | The 1000–500 hPa thickness, the forecaster's snow line | S | 2 | Overlay drawn once `COL7` lands |
| FRONT38 | **Air masses** | Named air masses tracked as regions | M | 2 | Regions identified with a source and a history |
| FRONT39 | **Air-mass source regions** | Continental polar, maritime tropical, and the rest | M | 2 | Sources derived from geography |
| FRONT40 | **Air-mass modification** | An air mass changes as it travels | M | 2 | Properties evolve along a trajectory |
| FRONT41 | **Trajectory tool** | Where has this air been, and where is it going | M | 2 | Back- and forward-trajectories drawn from a cell |
| FRONT42 | **Teleconnection map** | What correlates with what, computed over the run | M | 1 | Correlation map in the Lab |
| FRONT43 | **Calibration: jet latitude** | ~30–35° in winter, ~45–50° in summer | M | 3 | Baselines in `calibrate-all` |
| FRONT44 | **Calibration: jet speed** | 30–60 m/s core, and the `WIND_MS` anchor checked against it | M | 3 | Baseline committed; the anchor stops being purely fitted |
| FRONT45 | **Calibration: storm-track density** | Cyclones per winter across the North Atlantic | M | 2 | Baseline committed |
| FRONT46 | **Calibration: Rossby wave number** | 4–6 for Earth | S | 2 | Baseline committed |
| FRONT47 | **Perf** | Frontogenesis is a second-derivative field; keep it striped or cheap | M | 2 | Budget recorded |
| FRONT48 | **Fast asserts** | Fronts only where deformation and gradient coexist; jet where thermal wind says | S | 3 | Two asserts |
| FRONT49 | **Provenance** | Eady rate, frontogenesis constants, blocking thresholds tagged | S | 2 | Scanner above baseline |
| FRONT50 | **Limits** | No potential-vorticity inversion, no quasi-geostrophic omega equation, no wave–mean-flow interaction | S | 3 | Stated in `weather-model.md` |

---

# DRY · Drought, heat and aridity (50)

*Today: an accumulator against each cell's own rainfall normal, weighted by subsidence, decaying with
a thirty-year memory. It fires and it fades. Nothing it does has a consequence, and it does not
recur. Felt payoff: a drought you watch build over a century, kill a forest, and break.*

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| DRY1 | **Soil moisture with layers** | A root zone and a deep store, not one number | M | 3 | Deep store buffers; shallow store responds within a season |
| DRY2 | **Groundwater** | The slowest store, and the one that runs out last | M | 2 | Multi-century depletion possible |
| DRY3 | **Field capacity and wilting point** | Real soil hydraulics from the substrate | M | 3 | Sand and clay behave differently |
| DRY4 | **Penman-style PET** | Net radiation, wind and humidity, replacing the fitted proxy | L | 3 | PET plausible in mm/day; the fitted constant retires |
| DRY5 | **Actual evapotranspiration** | Limited by supply, not just demand | M | 3 | AET below PET in dry soil |
| DRY6 | **Aridity index** | The climatological ratio, distinct from drought | S | 3 | Two fields, two meanings; deserts are arid and not in drought |
| DRY7 | **Köppen-style classification** | From the model's own rain and temperature | M | 2 | Map drawn; matches Earth reasonably |
| DRY8 | **Drought classes** | Named severity bands with area statistics | S | 3 | Already labelled; add area per class |
| DRY9 | **Drought regions** | Contiguous regions labelled and named, not just a fraction | M | 3 | Largest drought has a place and an extent |
| DRY10 | **Drought duration** | How long this one has run | S | 3 | Duration tracked and reported |
| DRY11 | **ENSO drives drought** | The model already carries `_ensoIndex` and nothing reads it | M | 3 | Drought probability shifts with ENSO phase, in the right places |
| DRY12 | **ENSO variability** | The index needs to actually oscillate over decades | M | 3 | Spectral peak at 3–7 years |
| DRY13 | **Blocking drives heat waves** | `FRONT20`'s blocks sit over land and bake it | M | 3 | Heat wave under a block, and only there |
| DRY14 | **Heat-wave index** | Duration above a percentile, not an absolute | M | 3 | Index computed; a cold place can have one |
| DRY15 | **Wet-bulb temperature** | The number that decides whether a place is survivable | M | 3 | Field computed; the 35 °C threshold named |
| DRY16 | **Humid-heat mortality** | Consequence for life and cities at high wet bulb | M | 3 | Recorded in the chronicle |
| DRY17 | **Flash drought** | The fast-onset kind, driven by heat rather than rainfall | M | 2 | Occurs; distinguished from slow drought |
| DRY18 | **Pluvials** | The opposite: unusually wet decades | S | 2 | Tracked with the same index, negative |
| DRY19 | **Megadrought** | Multi-decadal, the kind that ends civilisations | M | 3 | Possible; rare; logged when it happens |
| DRY20 | **Drought recurrence** | Droughts come back, because the driver oscillates | M | 3 | Time series shows repeated events, not one fade |
| DRY21 | **Drought suppresses growth** | The first consequence: NPP falls in drought | M | 3 | Biomass responds; recovery lags |
| DRY22 | **Tree mortality** | Sustained drought kills canopy, and it does not come straight back | M | 3 | Cover changes persist for centuries |
| DRY23 | **Grassland resilience** | Grass survives what forest does not — the mechanism of biome shift | M | 3 | Biome boundaries move under drought |
| DRY24 | **Desertification** | Vegetation loss reduces rainfall, which reduces vegetation | L | 3 | Feedback demonstrable; a threshold exists |
| DRY25 | **Dust from bare ground** | Drought makes dust, dust changes climate | M | 2 | The existing dust field is fed by drought |
| DRY26 | **Dust storms** | The event, with a front and a wall | M | 2 | Occurs on Earth as well as Mars |
| DRY27 | **Fire danger from drought** | Existing `fire.js` reads the drought index | M | 3 | Fire danger rises with drought, not just with dryness |
| DRY28 | **Fire–drought–fuel cycle** | The full loop over centuries | M | 3 | Cycle visible in the tape |
| DRY29 | **Crop failure** | Yield loss in drought where there is agriculture | M | 3 | Recorded; civ responds |
| DRY30 | **Famine and migration** | The human consequence, recorded honestly and not gamified | M | 2 | Chronicle entries; population moves |
| DRY31 | **Water storage** | A civilisation that builds reservoirs buffers drought | M | 2 | Tech reduces impact, visibly |
| DRY32 | **Irrigation** | And changes the local water balance, with a cost | M | 2 | Local humidity rises; the store depletes |
| DRY33 | **Aquifer depletion** | The slow bill for irrigation | M | 2 | Multi-century decline; recorded |
| DRY34 | **Salinisation** | Irrigation's other bill | S | 1 | Soil quality declines |
| DRY35 | **Lake desiccation** | The existing lake field drains under drought | M | 2 | Playa formation, as the hydro comment already promises |
| DRY36 | **River drying** | Discharge falls; some rivers stop | M | 3 | Visible in the river field |
| DRY37 | **Snowpack drought** | Warm winters as a water-supply failure | M | 2 | Distinguished from rainfall drought |
| DRY38 | **Permafrost thaw** | Not drought, but the same slow-store logic | M | 2 | Thaw depth tracked; carbon released |
| DRY39 | **Drought on other worlds** | Mars's whole surface; Titan's methane droughts | S | 2 | Each world's version named honestly |
| DRY40 | **Drought overlay** | The index drawn with its severity classes | S | 3 | Overlay in the View list |
| DRY41 | **Time series panel** | Index against time, with events marked | M | 3 | Panel drawn from stored samples |
| DRY42 | **Spectral check** | ENSO and other drivers show up as peaks | M | 2 | Test finds the expected peaks |
| DRY43 | **Calibration: drought share** | ~10–20% of land in moderate-or-worse drought at any time | M | 3 | Baseline in `calibrate-all` |
| DRY44 | **Calibration: aridity share** | ~33% of Earth's land is arid or semi-arid | M | 3 | Baseline committed |
| DRY45 | **Calibration: PET** | Earth's mean PET, and the tropical maximum | M | 2 | Baseline committed |
| DRY46 | **Save** | Soil stores and drought state round-trip | M | 3 | Fixture test; save version bumped if needed |
| DRY47 | **Perf** | Drought is cheap and must stay cheap | S | 2 | Budget recorded |
| DRY48 | **Fast asserts** | Bounded; land-only; responds to a rainfall step | S | 3 | Three asserts |
| DRY49 | **Provenance** | PET constants, drought thresholds, soil parameters tagged | S | 2 | Scanner above baseline |
| DRY50 | **Limits** | No plant hydraulics, no groundwater flow, no crop model | S | 3 | Stated in `weather-model.md` |

---

# LOC · Weather where you are standing (50)

*The game's loop is hold → perturb → **descend** → read → return. Everything above happens at orbital
scale. Felt payoff: you descend into the storm and it is the same storm.*

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| LOC1 | **Weather in localview** | The cell's column drives what the ground looks like | M | 3 | Descending into a convective cell shows convective weather |
| LOC2 | **Sky state from the column** | Cloud base, cloud type, cover, from the profile | M | 3 | Sky matches the sounding |
| LOC3 | **Cloud types** | Cumulus, stratus, cirrus, cumulonimbus, from the profile | M | 3 | Type follows stability and level |
| LOC4 | **Cloud base height** | The LCL is already computed; draw it | S | 3 | Base height visibly differs between humid and dry days |
| LOC5 | **Towering cumulus** | The growth sequence on the lived clock | M | 2 | Cloud grows over minutes |
| LOC6 | **Anvil overhead** | Under a mature storm | S | 2 | Rendered |
| LOC7 | **Precipitation falling** | Visible rain, snow, hail, at the right rate | M | 3 | Type and rate match the column |
| LOC8 | **Wind in the grass** | The existing sway reads the actual wind and gust | S | 3 | Sway responds to the gust field |
| LOC9 | **Gust fronts felt** | A wind surge before the rain | M | 2 | Sequence observable |
| LOC10 | **Visibility** | Rain, dust, fog and snow reduce it | M | 2 | Draw distance responds |
| LOC11 | **Precipitation type** | Rain, snow, sleet, freezing rain, graupel, hail — from the profile | M | 3 | Correct type at the freezing level and above |
| LOC12 | **Snow on the ground** | Accumulation and melt at localview scale | M | 3 | Cover appears and goes |
| LOC13 | **Puddles and mud** | After rain, before it dries | S | 2 | Surface state responds to recent rain |
| LOC14 | **Frost on surfaces** | At dawn, where the column says so | S | 2 | Appears and burns off |
| LOC15 | **Dew** | The other dawn phenomenon | S | 1 | Appears at high humidity |
| LOC16 | **Fog rolling in** | The existing fog field, seen from inside | M | 2 | Visibility drops as fog arrives |
| LOC17 | **Heat shimmer** | Over hot dry ground | S | 1 | Rendered above a threshold |
| LOC18 | **Dust in the air** | Haze from the dust field | S | 2 | Sky colour shifts |
| LOC19 | **Rainbow** | Sun behind, rain ahead — the geometry is available | S | 1 | Appears when the geometry holds |
| LOC20 | **Lightning seen and heard** | Flash then thunder, delayed by distance | M | 2 | Delay matches distance |
| LOC21 | **Rain audio** | Rate-dependent | S | 2 | Audible, scales with rate |
| LOC22 | **Wind audio** | Speed-dependent | S | 2 | Audible, scales with speed |
| LOC23 | **Hail audio** | Distinctive, and alarming | S | 1 | Audible during hail |
| LOC24 | **Storm approach** | The whole sequence: cirrus, thickening, wind, rain, clearing | L | 3 | Watchable at one place on the lived clock |
| LOC25 | **Frontal passage felt** | Wind shift, temperature drop, pressure rise | M | 3 | All three observable in sequence |
| LOC26 | **Diurnal cycle felt** | Morning calm, afternoon build, evening collapse | M | 3 | Observable across a lived day |
| LOC27 | **Seasonal cycle felt** | The same place across a year | M | 3 | Observable with the season slider |
| LOC28 | **Creatures respond** | Shelter before rain, forage after | M | 3 | Behaviour change observable |
| LOC29 | **Birds before a storm** | The classic pressure-drop behaviour | S | 1 | Observable |
| LOC30 | **Plants respond** | Stomata, wilting, turgor — visible at localview scale | M | 2 | Wilting under drought, recovery after rain |
| LOC31 | **Flowering after rain** | Desert bloom, the most legible drought-break there is | M | 3 | Bloom follows a rain event in an arid cell |
| LOC32 | **Cities respond** | Smoke, lights, activity under weather | M | 1 | Observable difference |
| LOC33 | **Weather in the inspect line** | `weatherAt` extended with the sounding summary | S | 3 | One honest line per cell |
| LOC34 | **Forecast at a cell** | What the next few hours hold, with honest uncertainty | M | 3 | Panel line; sometimes wrong |
| LOC35 | **Weather history at a cell** | What it has been doing | S | 2 | Sparkline from stored samples |
| LOC36 | **Records at a cell** | Hottest, coldest, wettest, windiest | S | 2 | Tracked and shown |
| LOC37 | **Climate normals at a cell** | The 30-year means the drought index already keeps | S | 2 | Shown beside today's weather |
| LOC38 | **Weather on other worlds' surfaces** | Mars dust, Titan methane drizzle, Venus's gloom | M | 3 | Each surface reads as its own world |
| LOC39 | **Methane drizzle** | Once `COL31` lands | M | 2 | Titan drizzles methane |
| LOC40 | **Sulphuric rain that never lands** | Venus's virga | S | 1 | Rendered aloft, evaporating |
| LOC41 | **Reduced motion** | All weather animation honours the preference | S | 2 | Static but still informative |
| LOC42 | **Accessibility** | Weather state announced as text | S | 3 | Live region on change |
| LOC43 | **Mobile performance** | Localview weather within the frame budget on a phone | M | 3 | Measured on the reference device |
| LOC44 | **Draw caps** | Precipitation and cloud sprites capped | S | 3 | Frame cost flat |
| LOC45 | **Screenshot legibility** | A still frame reads as weather, not noise | M | 2 | Playtest confirms |
| LOC46 | **Photo mode** | Because people will want the storm picture | S | 1 | Existing PNG export includes weather |
| LOC47 | **Weather and time-of-day interaction** | The sky at dusk under cloud | M | 2 | Renders correctly with the sky ephemeris |
| LOC48 | **Moonlight through cloud** | Cloud dims the moonlight term | S | 2 | Night brightness responds to cover |
| LOC49 | **Fast asserts** | Precipitation type matches the profile at three test soundings | S | 3 | Three asserts |
| LOC50 | **Limits** | Localview weather is a *reading* of the cell's column, not its own simulation | S | 3 | Stated plainly |

---

# VIZ · Reading it (60)

*A weather model nobody can read is a screensaver. Felt payoff: an instrument face you learn to read,
and then trust.*

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| VIZ1 | **A sounding you can look at** | Temperature and dewpoint against height, parcel path shaded | M | 3 | Drawn for the inspected cell, theme-aware |
| VIZ2 | **Skew-T or simplified** | Decide and document; a simplified linear plot may read better | M | 3 | Choice stated with a reason |
| VIZ3 | **CAPE area shaded** | The positive area, which is the whole point | S | 3 | Shaded region matches the reported number |
| VIZ4 | **CIN area shaded** | In a different colour | S | 2 | Shaded and labelled |
| VIZ5 | **LCL, LFC, EL marked** | The three levels a forecaster reads first | S | 3 | Marked with labels |
| VIZ6 | **Freezing level marked** | Once `COL11` lands | S | 2 | Marked |
| VIZ7 | **Sounding at a tap** | Tap any cell, get its sounding | M | 3 | Works at both zoom levels |
| VIZ8 | **Sounding comparison** | Two cells side by side | M | 2 | Two profiles overlaid |
| VIZ9 | **Sounding over time** | The same cell across a day or a year | M | 2 | Animated or scrubbable |
| VIZ10 | **Sounding export** | As text, for someone who wants to check the numbers | S | 1 | Copyable block |
| VIZ11 | **Hodograph** | Wind with height, as a curve | M | 3 | Drawn once `COL17`/`COL18` land |
| VIZ12 | **Storm motion on the hodograph** | Left and right movers marked | S | 2 | Both marked |
| VIZ13 | **SRH area shaded** | The swept area, which is what helicity is | S | 2 | Shaded |
| VIZ14 | **Wind profile** | Speed and direction against height, plainly | S | 2 | Drawn |
| VIZ15 | **Shear vectors on the map** | Where the shear is, and which way | S | 2 | Overlay drawn |
| VIZ16 | **CAPE overlay** | The instability map | S | 3 | Overlay with a legend and units |
| VIZ17 | **CIN overlay** | Where the cap is holding | S | 2 | Overlay drawn |
| VIZ18 | **Ascent overlay** | Rising and sinking air, signed | S | 3 | Overlay drawn; explains the dry subtropics |
| VIZ19 | **Precipitable water overlay** | The moisture map | S | 3 | Overlay drawn; atmospheric rivers visible |
| VIZ20 | **Drought overlay** | With severity classes | S | 3 | Overlay drawn |
| VIZ21 | **The overlay set, curated** | One weather group in the View dock, not fifteen loose entries | M | 3 | Grouped, with the group explained once |
| VIZ22 | **Overlay legends with units** | Every one, no exceptions | S | 3 | Contrast audit passes |
| VIZ23 | **Radar view** | Reflectivity from the precipitation field | M | 3 | Reads like radar; recognisable |
| VIZ24 | **Satellite view** | Visible and infrared modes from cloud and temperature | M | 3 | Reads like satellite imagery |
| VIZ25 | **Water-vapour channel** | The forecaster's favourite, and it shows the waves | M | 2 | Rossby waves visible in it |
| VIZ26 | **Time-lapse loop** | The last N ticks as a loop, which is how weather is read | M | 3 | Loop plays; frames stored cheaply |
| VIZ27 | **Weather timeline** | Events on a strip: storms, outbreaks, droughts | M | 3 | Strip drawn; clicking jumps to the moment |
| VIZ28 | **Severe outlook map** | Risk categories, drawn like an outlook | M | 3 | Categories named and drawn |
| VIZ29 | **Warning boxes** | Where a warning is active | M | 2 | Boxes drawn while active |
| VIZ30 | **Forecast panel** | What the model thinks happens next, and how sure it is | M | 3 | Panel with an honest uncertainty band |
| VIZ31 | **Observation network** | A civilisation builds one, and the forecast improves | M | 2 | Skill improves with coverage |
| VIZ32 | **Forecast skill history** | Kept and shown, so improvement is visible | S | 2 | Chart drawn |
| VIZ33 | **Predictability statement** | Two weeks, and why, stated once and well | S | 3 | In the panel, in the glossary |
| VIZ34 | **Weather desk** | Its own desk in the Sky dock, beyond the storm block | M | 3 | Desk opens; the storm block moves into it |
| VIZ35 | **Column desk** | The sounding and hodograph get their own page | M | 3 | Page opens and is keyboard-reachable |
| VIZ36 | **Drought desk** | Index, regions, duration, drivers | M | 2 | Page opens |
| VIZ37 | **Weather chips in the HUD** | Two or three numbers, always visible | S | 3 | Chips fit the existing HUD cadence |
| VIZ38 | **The one-line summary** | `weatherSnapshot().line`, in the HUD | S | 3 | Line visible without opening a panel |
| VIZ39 | **90-second legibility** | A new player can tell what the weather is doing without a panel | M | 3 | Playtest rows confirm |
| VIZ40 | **Colour scales that work** | Diverging for ascent, sequential for CAPE, both colour-blind safe | S | 3 | Contrast and colour-blind audit pass |
| VIZ41 | **Dark and light themes** | Every new chart in both | S | 3 | Both audited |
| VIZ42 | **Mobile layout** | Every weather page usable at ≤400 px | M | 3 | Layout check passes |
| VIZ43 | **Keyboard loop** | Every control reachable from the focused canvas | M | 3 | Keyboard audit passes |
| VIZ44 | **Screen-reader text** | Charts have text alternatives that say the same thing | M | 3 | Alternatives complete |
| VIZ45 | **Reduced motion** | Loops and animations honour it | S | 2 | Static fallbacks |
| VIZ46 | **Tips entries** | Every new control gets a tip that adds something | S | 2 | No tip restates its label |
| VIZ47 | **Glossary sweep** | Every term defined once | S | 3 | No panel term undefined |
| VIZ48 | **Teach lesson: read a sounding** | The single most transferable thing this model can teach | M | 3 | Lesson passes its own assertions |
| VIZ49 | **Teach lesson: make a storm** | Assemble the ingredients deliberately | M | 3 | Lesson passes |
| VIZ50 | **Teach lesson: break a drought** | And find out you mostly cannot | M | 3 | Lesson passes; the honest answer is the lesson |
| VIZ51 | **Provenance chips** | Every weather number carries its tier | S | 3 | Chips render |
| VIZ52 | **Uncalibrated warning** | Worlds without a temperature anchor say so where the numbers appear | S | 3 | Already in `airBudget`; surface it everywhere |
| VIZ53 | **CSS through the extract** | No inline style blocks | S | 2 | CSS ratchet holds |
| VIZ54 | **`index.html` id budget** | New ids counted; reuse where possible | S | 2 | Ratchet moves only with a reason |
| VIZ55 | **Panel chrome tests** | Snapshot the generated HTML of each new page | S | 2 | Tests in the fast tier, inside budget |
| VIZ56 | **Overlay registry test** | Every overlay id exists and has a legend | S | 2 | Smoke assert |
| VIZ57 | **Screenshot regression** | A reference frame per overlay | M | 1 | Manual but recorded |
| VIZ58 | **Perf: charts** | Sounding and hodograph redraw within the frame budget | S | 2 | Measured |
| VIZ59 | **Perf: overlays** | Weather overlays cost no more than existing ones | S | 3 | Measured |
| VIZ60 | **Limits on the face** | Every panel that shows a number says what kind of number it is | S | 3 | Audit passes |

---

# GATE · Calibration, cost and honesty (50)

*The gates are what make the rest of this trustworthy. Everything in this section is a number with a
source, a budget with a measurement, or a sentence that admits something.*

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| GATE1 | **Earth calibration spine** | Global mean rain ~1,000 mm/yr · mean PWAT ~25 mm · tropical CAPE 1,000–2,500 J/kg · ~1,200 US tornadoes/yr · 10–20% of land in drought | L | 3 | Five baselines in `calibrate-all`, each with a tolerance and a source |
| GATE2 | **Zonal-mean rainfall curve** | The double-peaked ITCZ and the subtropical minima | M | 3 | Curve within tolerance of reference |
| GATE3 | **Seasonal rainfall cycle** | Monsoon amplitude at the right latitudes | M | 2 | Baseline committed |
| GATE4 | **CAPE distribution** | Not just the max: the whole distribution, tropics vs midlatitudes | M | 3 | Percentiles within tolerance |
| GATE5 | **Diurnal rainfall timing** | Afternoon over land, early morning over ocean | M | 2 | Timing correct on the lived clock |
| GATE6 | **Extreme-value check** | The one-in-a-century rain event is roughly right | M | 2 | Return-period curve plausible |
| GATE7 | **Wind-speed anchor** | `WIND_MS = 35` is fitted; check it against a jet core and a hurricane | M | 3 | Anchor becomes derived, or stays fitted with a stated reason |
| GATE8 | **Mars calibration** | Dust-devil season, CO₂ cycle, near-zero precipitable water | M | 2 | Three baselines |
| GATE9 | **Titan calibration** | Methane humidity, drizzle rate, polar lakes | M | 2 | Baselines once `COL31` lands |
| GATE10 | **Venus calibration** | Super-rotation, cloud deck altitude, no surface convection | M | 2 | Baselines committed |
| GATE11 | **Per-section budgets** | `aircol`, `severe`, `drought`, `convection` each with a measured budget | S | 3 | Table in `test-timing.md`; CI ratchet |
| GATE12 | **Budget at N=96 and N=128** | Cost measured at the resolutions the app actually opens at | S | 3 | Numbers recorded |
| GATE13 | **Mobile budget** | The whole weather stack within a phone's frame budget | M | 3 | Measured on the reference device |
| GATE14 | **Degradation order review** | Weather sits last; check that shedding it degrades gracefully | S | 3 | Dropping `aircol` for 20 ticks leaves the world coherent |
| GATE15 | **Staleness bound** | State it: eight ticks, or any 3 K surface move | S | 3 | Stated in `weather-model.md`; asserted |
| GATE16 | **Alloc discipline** | Zero allocations across all four sections | S | 3 | `alloc-lint` covers them |
| GATE17 | **Memory budget** | Column plus diagnostics against the `colstack` precedent | S | 2 | Numbers recorded in the module header |
| GATE18 | **GPGPU parity** | Weather fields agree CPU and GPU where both exist | M | 3 | `parity-climate` extended |
| GATE19 | **Field budget review** | The P14 bump to 778 was deliberate; do not let it drift | S | 3 | Any further growth carries a written reason |
| GATE20 | **Multi-writer audit** | No new field with two writers unless declared as a handoff | S | 3 | `fields-report` handoffs list unchanged or explained |
| GATE21 | **Determinism under striping** | Same seed, same tick sequence, same weather; and the *climate* agrees across tick sizes | M | 3 | Two asserts, one per claim |
| GATE22 | **RNG independence** | The weather fork must not shift storm genesis or lightning | S | 3 | Asserted: golden unchanged with weather on |
| GATE23 | **Replay** | Save, run, reload, run — identical weather | M | 3 | Smoke assert |
| GATE24 | **No wall clock** | Determinism lint stays clean as the modules grow | S | 3 | Lint clean |
| GATE25 | **Golden coverage** | Once `CONV1` lands, weather fields enter the golden hash | M | 3 | `hashFields` extended deliberately, with a rationale |
| GATE26 | **Golden re-bless discipline** | One regeneration per landing wave, never per commit | S | 3 | Stated; followed |
| GATE27 | **Fast-tier discipline** | The tier is at 29 s of a 30 s budget; the next addition takes something out | S | 3 | Recorded in `test-timing.md`; honoured |
| GATE28 | **Smoke-tier home** | World-level weather asserts live in smoke, on shared worlds | S | 3 | Already done; keep it that way |
| GATE29 | **Orphan suites** | New suites registered | S | 2 | Check clean |
| GATE30 | **Error codes** | New failure modes get codes | S | 2 | `error-codes.md` updated |
| GATE31 | **Save v12** | Whatever `CONV1` makes stateful — soil stores, convective memory | M | 3 | Version bumped; v11 migrates |
| GATE32 | **Save size** | Weather state must not double the save | S | 2 | Size measured and recorded |
| GATE33 | **Fixtures** | A drought save, a storm save, an uncalibrated-world save | S | 3 | Three fixtures committed |
| GATE34 | **Provenance ratchet** | Weather modules stay above the file baseline as they grow | S | 3 | Scanner passes |
| GATE35 | **Units registry** | J/kg, mm, mm/hr, m²/s², K/m, Pa registered in `units.js` | S | 3 | Units hash bumped |
| GATE36 | **Typecheck** | JSDoc types for the sounding and the marker | M | 2 | Ratchet holds |
| GATE37 | **Lint scope** | New modules enter the narrow lint scope | S | 2 | `npm run verify` passes with them in |
| GATE38 | **Module map** | Regenerated | S | 2 | Committed |
| GATE39 | **`weather-model.md` maintained** | Every row that changes a limit updates the doc in the same commit | S | 3 | Enforced by review |
| GATE40 | **`model-limits.md` cross-link** | Stays accurate | S | 3 | Linked and current |
| GATE41 | **Playtest: legibility** | Three rows on whether weather reads in ninety seconds | M | 3 | Rows in `PLAYTESTS.md` |
| GATE42 | **Playtest: the four-at-once claim** | Does a player actually notice a hurricane, an outbreak and a drought together? | M | 3 | Rows recorded, honestly |
| GATE43 | **Playtest: comfort** | Storm audio and motion at localview scale | M | 2 | Comfort scores recorded |
| GATE44 | **Cold start** | A new player's first world has legible, not maximal, weather | S | 3 | `cold-start.md` updated |
| GATE45 | **Dark stays out** | No weather feature depends on `?dark=1` | S | 3 | Grep confirms |
| GATE46 | **Scope discipline** | Weather does not become the whole game; the pillars still lead | S | 3 | Reviewed against `PURPOSE.md` |
| GATE47 | **`shipped.md` entry** | What landed, with the golden rationale | S | 2 | Written per wave |
| GATE48 | **`NEXT.md` pointer** | One line; this file never becomes the queue | S | 3 | Line added |
| GATE49 | **Deletion pass** | After the First-25, delete every row it made unnecessary | S | 3 | File is shorter than it was |
| GATE50 | **Retirement condition** | When convection owns rain, severe weather has consequences, and drought recurs — retire this file | S | 2 | Condition stated; the file has an end |
