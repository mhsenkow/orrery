# ORRERY — the weather model, and what it cannot do

**Status:** limits doc for `vr/sim/aircol.js` and `vr/sim/weather.js`.
**Date:** 2026-08-23

---

## Three scales, three treatments

A cell at N=96 is about ninety kilometres across. That single number decides the whole architecture.

| Phenomenon | Real size | Treatment |
|---|---|---|
| Hadley cells, jets, storm tracks | 1,000–10,000 km | **Resolved** on the grid (`wind.js` shallow water + thermal wind) |
| Tropical and extratropical cyclones | 300–1,500 km | **Marginally resolved**: tracked objects steered by the resolved flow (`storms.js`) |
| Convective systems, supercells | 20–200 km | **Parameterised** from a column sounding (`aircol.js`) |
| Tornadoes, hail cores, downbursts | 0.1–10 km | **Ingredient-based markers** standing for a rate, never for one event (`weather.js`) |
| Drought, heat waves, blocking | months–decades | **Accumulators with memory** against a rainfall normal (`weather.js`) |

Pretending a tornado is a grid cell is the usual way weather in a game becomes a lie. A marker here
carries an estimated count and a rate, and `describeRate` says whichever of the two is honest at the
current tick length: *"about forty over this decade"* under a few hundred, *"about twenty a year"*
past it.

## What the column is

**Eight** sigma levels (`0.98, 0.95, 0.90, 0.80, 0.65, 0.55, 0.45, 0.25`) of temperature and specific
humidity per cell, built hydrostatically upward from the surface fields. Same shape as `colstack.js`
does for rock: a fixed shallow stack per cell, read by whoever needs the third dimension.

Derived on the same upward march: **SBCAPE / MLCAPE**, **CIN**, **LCL**, **precipitable water**,
**freezing level**, **equilibrium level**, **mixed-layer depth**, plus **storm-relative helicity**
from the hodograph, **per-level winds**, and a mass-continuity **vertical velocity**.

Saturation uses water above freezing and **ice** below (Magnus), with a short supercooled blend —
so cold columns no longer pretend the air can hold liquid-water amounts.

Absolute temperature is anchored where the ruleset carries `tSurfK` (Earth 288 K, Ares 215 K,
Venus 735 K, Titan 94 K); `airBudget().calibrated` is true on those worlds.

## What convection does now

`convectTick` (after `airColumnTick`) turns CAPE into **convective rain** behind a mass-flux bound:
rain rate cannot exceed precipitable water × efficiency. It writes ephemeral `W.convRain` and adds
to `W.precip`, then lightly dries the lowest airQ levels so the next column rebuild feels the rainout.
Stratiform rain in `hydro.js` still owns the baseline water cycle; convection is the unstable extra.

Severe markers now carry an **elongated footprint** (bearing from the wind) and can scar `life` /
`build`. Tropical cyclone intensity reads column CAPE/PWAT and can **rapidly intensify** only under
low shear + high PWAT + warm SST. Drought listens to **ENSO** and suppresses biosphere carrying
capacity. Local view and the climate panel show **precip type** (rain / snow / sleet / hail) and a
drawn **sounding**. Overlays include CAPE, ascent, drought, and PWAT.

## Organised convection (`convect.js`)

`orgConvectionTick` runs after `convectTick` and classifies cells into organised modes:

| Class | Value | Ingredients |
|---|---|---|
| None | 0 | CAPE < 400 or CIN too high |
| Cell | 1 | CAPE ≥ 400 (shallow if < 800) |
| Multicell | 2 | Deep CAPE + shear ≥ 0.25 |
| Squall line | 3 | Strong shear + linear lift (front > 0.15); cold-pool propagation |
| Supercell | 4 | EHI > 1.5; feeds tornado risk |
| MCS | 5 | Contiguous patch of multicell+ (≥ 3 neighbours) |

Additional physics:

- **Cold pools** (CONV23): squall-line outflow spreads to neighbours, triggers lift.
- **Bunkers storm motion** (CONV32): u/v from mean wind + shear deviation.
- **Anvil** (CONV34): class ≥ supercell boosts clouds downshear.
- **Virga** (CONV37): dry mid-level air evaporates falling rain.
- **Shallow vs deep** (CONV5): CAPE < 800 moistens mid-levels without heavy precip.
- **Conv/strat split** (CONV6): existing precip partitioned by convRain fraction.
- **Rain rate** (CONV41): `rainMmHr` from precip intensity × RAIN_GAIN.
- **Flash flood** (CONV43): precip × terrain slope × soil saturation.
- **AR strengthen** (CONV44): convective precip boosts existing atmospheric rivers.
- **Canopy interception** (CONV47): trees reduce soil moisture gain.
- **Infiltration** (CONV48): soil uptake has a ceiling.
- **Fog/dew** (CONV50): column saturation enhances surface moisture.
- **Freezing rain / graupel** (CONV51–52): extended `precipTypeAt`.
- **Water budget** (CONV53): `waterBudget(W)` returns {evap, precip, runoff, residual}.

## What is honest, and what is a sketch

**Generalises correctly off Earth.** Every lapse-rate limit is a fraction of the planet's *own* dry
adiabat `g/cp`, not a fraction of Earth's.

**The water is the hydrosphere's.** Surface humidity is inverted from precipitable water the hydro
module already carries, then capped by saturation. The column does not keep a second water inventory.

**Latent heat is water's alone.** A methane world is treated as a dry column and `airBudget().solvent`
says so. Methane thermodynamics is a different table and is not written.

## Calibration knobs (CONV11-light)

Two soft knobs live in `vr/sim/convect.js` and `vr/sim/weather.js`:

| Knob | File | Default | What it does |
|---|---|---|---|
| `RAIN_GAIN` | `convect.js` | 1.0 | Scales all convective rain-rate output before it reaches `rainMmHr` |
| `CONV_RAIN_K` | `weather.js` | 0.0008 | Convective rain per J/kg of CAPE consumed (mass-flux efficiency) |

Changing `RAIN_GAIN` scales the diagnostic rain-rate field and flood risk without altering the
prognostic moisture cycle — safe to tweak in a calibration pass. `CONV_RAIN_K` changes actual
precipitation amounts and should be re-calibrated against golden if touched.

If a calibration script exists, these knobs can be swept; golden hashes will shift with `CONV_RAIN_K`
but not with `RAIN_GAIN` alone (rain-rate is derived, not prognostic).

## Staleness bound (GATE15)

The air column refreshes one stripe of eight per tick. A full rebuild takes eight ticks. Any cell
whose surface temperature has moved more than 3 K since its last column build is forced into the
next stripe. This means the *worst-case staleness* is eight ticks for a stable cell, or immediate
for a cell under active heating/cooling (volcanic, ice-albedo, day/night on the lived clock).

At the default geological tick of 200 years, eight ticks is 1,600 years — the column is effectively
diagnostic. On the lived clock at 60 hours/second, eight ticks is about eight hours — the column
tracks the diurnal cycle.

## Predictability (VIZ33)

Weather on this grid is not a forecast. At N=96 the grid resolves synoptic features (the jet, a
cyclone track) but not the mesoscale organisation that gives a forecast skill. The sounding at a
cell is diagnostic: it says what the atmosphere *could* do, not what it *will* do — in the way an
operational sounding says "this environment can produce tornadoes" without saying when or where.

The 90-second loop is too fast for predictability to matter. What matters is legibility: can the
player read the weather as a consequence of their perturbation?

## Local view rendering limits (LOC49-50)

The local view (`localview.js`) renders weather effects on a per-cell canvas:

- **Visibility reduction** dims cells proportional to precip + fog + dust + cloud. Heavy rain makes
  cells hard to read — this is intentional and matches what heavy rain does to vision.
- **Shimmer** appears over hot dry land when sun is high. Static under `reducedMotion`.
- **Snow cover** is an overlay on cells with ice > 0.08 on land.
- **Puddles** appear on wet land after rain. They use `W.wetness` if available, else infer from moisture.
- **Frost/dew** is a dawn phenomenon — thin blue (frost) or green (dew) wash.
- **Rainbow** draws a gradient band when rain + sun coexist at the right time of day.

All animated effects respect `reducedMotion()` and degrade to static fills.

## What this model still does not have

- **No microphysics.** No drop-size distribution, no explicit hail growth — hail is still ingredients.
- **Fronts are diagnostic, not prognostic** — `fronts.js` classifies cold/warm/occluded/stationary
  from deformation × |∇T| each tick (FRONT1–5), but does not carry its own momentum or lifecycle.
  Drylines, blocking, jet streaks, and terrain-driven boundaries (lee trough, foehn, katabatic) are
  similarly diagnosed from the current wind and temperature state. Storm-track accumulation (FRONT13)
  and blocking persistence (FRONT20) are the only fields with tick-to-tick memory.
- **Drought soil stores are ephemeral** — `soilRoot` and `soilDeep` (DRY1–3) are not saved; they
  reinitialise from moist[] at boot (GATE31 closed: no v12). Aridity, drought class, heatwave index,
  and flash drought are diagnostic or short-memory. ENSO drives drought recurrence (DRY18–20) via
  `ocean.js`.
- **Earth physical retune still open (`CONV11`).** Desk/`calibrate-all` score **fitted@model** bands
  (GATE1). Earth ~1,000 mm/yr rain, tropical CAPE 1,000–2,500 J/kg, and 10–20% drought share remain
  the north star in `earthTargets` / register — not claimed as met.
- **Register rows beyond the shipped wave** (insurance ledgers, creature shelter, GPGPU weather
  parity, teach storm-assembly lessons, human playtests GATE41–43) stay register until promoted.
- **Hydro still owns baseline precip.** Convection adds soft rain; GATE50 “convection owns rain” is
  not met.

## The two-clock contract (COL29)

The geological clock (`W.year`, `W.dtYr`) and the weather clock (`W.wxClock`) advance independently.
`weatherClock.js` counts hours-of-day at a player-chosen rate (`hoursPerSec`); it never moves
`W.year`. When enabled it:

1. Shrinks the effective dt the column's `keep` memory sees (`airColumnTick` reads `wxClock`), so
   the column remembers rather than staying fully diagnostic under a long geological tick.
2. Writes a diurnal heating factor (`diurnal`) that modestly lifts CAPE in afternoon and that
   fronts may read for breeze.
3. Boosts low-level shear after sunset (`shearBoost` → SRH) and CIN near dawn (`cinBoost`).

The Weather desk **Hours/s** dial calls `setWeatherSpeed`. Contract: geology can sit at year 4.2 Ga
while the column experiences afternoon heating. Neither clock waits for the other.

## Where to read it

`airBudget(W)` for the column, `weatherSnapshot(W)` for what is happening at once,
`formatSounding(W, c)` / `soundingAt(W, c)` for one place, `precipTypeAt(W, c)` for phase,
`weatherAt(W, c)` for inspect. The Sky dock's storm desk, weather desk, and climate panel show the
sounding. `weatherCalib(W)` returns Earth spine metrics. `weatherA11yLine(W, c)` gives a screen-reader
safe string. The local view (`localview.js`) renders visibility, shimmer, frost/dew, puddles, snow
cover, and rainbow flags from the helpers in `weather.js`.

## Cross-links (GATE40)

- Model limits: [`model-limits.md`](model-limits.md)
- Fidelity register: [`earth-fidelity-500.md`](earth-fidelity-500.md)
- Weather register: [`weather-500.md`](weather-500.md)
- Test timing: [`test-timing.md`](test-timing.md)
- Calibration: `weatherCalib(W)` in `vr/sim/weather.js`
- Convection knobs: `RAIN_GAIN` in `convect.js`, `CONV_RAIN_K` in `weather.js`
