# ORRERY — the sky as a system: 500 steps

**Status:** register, not a queue. Nothing here is "next" until promoted into [`NEXT.md`](../NEXT.md).
**Scope:** one shared ephemeris, then spin, then N moons, then N suns, then life under many lights.
**Date:** 2026-08-22

---

## Why this exists

The question was: *would making the Sun and Moon more realistic help everything?* The answer is yes,
but the reason is not realism. It is **coupling**. Today the sky is computed four independent times
and the four answers disagree.

| Clock | Owner | What it says |
|---|---|---|
| `S.sunAng += dt * 0.055` | [`vr/main.js:1868`](../vr/main.js#L1868) | The lit face sweeps at a fixed rate with the sub-solar latitude pinned at `y = 0.34` (≈ 20°N), forever, on every world |
| `W.season` | [`clockFace.js`](../vr/sim/clockFace.js) — three writers (`livedTick`, `applySeasonPolicy`, `seasonHold`) | Declination `sin(ε)·sin(season)` inside [`atmo.js`](../vr/sim/atmo.js) `geometricInsolation` |
| `W.moonAngle` / `W._moonDir` | [`tides.js`](../vr/sim/tides.js) *and* `clockFace.js` *and* the renderer | A moon at exactly zero inclination, `13.4` orbits per year, hard-coded |
| `W.rotationPeriod` | [`wind.js`](../vr/sim/wind.js) circulation bands, `climatePanel` | Never reaches the terminator; Venus at −243 d looks identical to Earth |

Consequences, all visible in a 90-second run:

- **The terminator you watch is not the terminator the model integrates.** The renderer's sub-solar
  latitude is a constant; the physics' declination swings with obliquity and season. Tilt the axis
  and the *picture* does not move.
- **Spin is decorative.** `Spin±` changes wind bands and a HUD label. It does not change day length,
  terminator speed, diurnal range, or anything you can see turn.
- **The Moon is a circle in the equatorial plane.** Zero inclination means no eclipses, no nodal
  regression, no tropic tides, no declination inequality — the three things that make a real moon
  legible in a sky.
- **Orbital state does not survive a save.** [`serializeRun`](../vr/world.js#L1292) v9 carries
  `clockFace` and `seasonHold` and nothing else: obliquity, moon, rotation period and season come
  back from the ruleset. Strip the Moon, save, reload — the Moon is back.
- **`W.precession` is written by [`god/climate.js:30`](../vr/sim/god/climate.js#L30) and never read.**

So the first work is not "three suns". It is **one ephemeris that everything reads**. Once the sky
is a single object with a list of lights and a list of satellites, "two moons" and "three suns" stop
being features and become loop bounds — and the payoff arrives across the whole engine at once:
insolation, tides, moonlight, eclipses, climate bands, agent behaviour, the renderer and the panels
all start agreeing because they are all reading the same struct.

## What already exists to build on

The pieces are unusually far along; they are simply not wired together.

- [`exophysics.js`](../vr/sim/exophysics.js) already has `circumbinaryBeat`, `binaryInsolation`,
  `rocheLimitAu`, `hillRadiusAu`, `orbitsStable`, `spinOrbitResonance`, `tidalHeatFluxWm2`,
  `snowLineAu`, `blackbodyRgb`, `faintYoungStar`.
- [`star.js`](../vr/sim/star.js) makes the host a first-class object with `photonFracPlanck`,
  `hz`, `flareRate`, `starAngDeg` — everything a *second* star would need, for one star only.
- [`god/genesis.js`](../vr/sim/god/genesis.js) already models `moons` as an **array**
  (`moons: [{ mass: 1, distance: 1 }]`) and then throws all but `[0]` away in
  `applyGenesisToWorld`. The plural seam is already cut.
- [`atmo.js`](../vr/sim/atmo.js) `insolation()` already reads `rule.binaryBeat` — a two-star hook
  with nothing that sets it.
- [`illum.js`](../vr/sim/illum.js) already illuminates the ground with a star's Planck spectrum —
  for a single `teff`.

## Design decisions this register assumes

1. **Analytic ephemeris, not N-body.** Fixed Keplerian elements plus slow secular drift. An N-body
   integrator cannot survive 200 years per tick, cannot be rewound, and cannot be golden-tested.
   Phase is a pure function of `ageYr` and the elements — deterministic by construction, which is
   what [`determinism.md`](determinism.md) demands.
2. **Two layers, two rates.** `elementsTick` (slow: tidal recession, obliquity damping, resonance
   capture) is separate from `phaseTick` (geometry only, allocation-free, every tick and frame).
3. **The two clock faces stay.** On *Now* the sky is instantaneous. On *Years* the sky reports
   orbit-**averaged** quantities — annual-mean insolation, mean tide range, Milankovitch-band
   forcing — and holds phase. That is already the project's honesty rule; the ephemeris must serve
   both faces rather than forcing one.
4. **Rotation becomes real, and it is the planet that turns.** The light stops orbiting the world.
5. **Everything new is saved (v10), schema'd in [`fields.js`](../vr/sim/fields.js), tagged with
   `@provenance`, and gated by a calibration row** with a number from the Solar System.
6. **Legibility caps the ambition.** Four suns in the sky is a real system (Kepler-64) and an
   unreadable HUD. Every multiplicity row owes a legibility row.

## Could you have life with three suns and two moons?

The model should answer this, and the honest answer is *yes, in a narrower window* — which is
exactly the kind of thing a player should be able to go and find.

- **Three suns must be hierarchical.** A close pair plus a distant third. Planets orbit the pair
  beyond the Holman–Wiegert critical radius (roughly 2–4 × the binary separation for a circular
  near-equal pair) or hug one star inside ~⅕ of the pair separation. Equal-mass, similar-separation
  triples are the unstable case — the interesting fictional one, and the one the stability verdict
  should refuse in red. Real precedents: Kepler-16b and TOI-1338b (two suns), GJ 667C and LTT 1445A
  (planets in triples), Kepler-64/PH1b (a circumbinary planet in a **quadruple** — four suns in one
  sky, and it exists).
- **Three suns are a habitability *bonus* in one specific way:** a planet cannot tidally lock to a
  pair. The M-dwarf habitable zone's worst problem — one face permanently lit — is off the table for
  circumbinary worlds. You keep a day.
- **The cost is variance, not energy.** Summed flux is easy; the killers are the eclipse duty cycle
  and the beat period against the ice-albedo hysteresis loop. A 30% flux dip lasting hours is
  weather; the same dip lasting a fifth of the year is a snowball trap.
- **Photon quality, not just energy.** `photonUsableFractionPlanck` already says a 2,600 K dwarf
  puts ~12–28% of its output in the photosynthetic band against the Sun's ~55%. Three cool suns can
  be energy-sufficient and photon-starved — a productivity ceiling the model can express and the
  player can feel.
- **Two moons is the harder question, and the answer is "usually worse".** One moon of the right
  mass stabilises an axis because it shifts the spin-axis precession frequency clear of the orbital
  resonances. Two comparable moons put that frequency back into a crowded neighbourhood and can
  *destabilise* it, while mutual perturbation drives one of them across the Roche limit into a ring.
  Two small moons (the Mars case) do neither: negligible tides, no stabilisation. A Laplace-style
  resonance instead buys you Io — tidal heat, volcanism, and a sterilised satellite.
- **The early-Moon case is the best origin story in the model.** A moon at half today's distance
  raises tides ~8× — wet–dry cycling on a scale that prebiotic chemistry actually wants. The
  register wires that to [`origin.js`](../vr/sim/origin.js) rather than leaving it a caption.

## How to use this file

Same contract as [`earth-fidelity-500.md`](earth-fidelity-500.md): promote 1–3 rows into `NEXT.md`
at a time; if a row cannot be written as a check that fails now and passes later, delete the row.
Section prefixes are namespaced (`EPH`, `SPN`, `OBL`, `MOON`, `MANY`, `SUNS`, `LIFE`, `PANEL`,
`GATE`) so they never collide with the A–E rows in the fidelity register or the letters in
[`quality-400.md`](quality-400.md).

**Effort:** S ≈ under an hour · M ≈ a session · L ≈ multi-session.
**Impact:** 3 = felt in the first ninety seconds · 2 = felt on a second visit · 1 = felt by the
person maintaining it.

---

## First 25 — the gate

Nothing after this table is worth starting until these land. They are the seam, the save, and the
proof that one sky beats four.

| # | Row | Why it gates |
|---|---|---|
| 1 | EPH1 | The module has to exist before anything can read it |
| 2 | EPH3 EPH4 | Body shapes, or every consumer invents its own |
| 3 | EPH5 | `fields.js` rows — H29 checklist, non-negotiable |
| 4 | EPH6 EPH7 | Adapters, so `W.moon` and `rule.star` keep working during the migration |
| 5 | EPH8 | Phase from absolute epoch — determinism before features |
| 6 | EPH15 | Kill `y = 0.34`; the picture starts telling the truth |
| 7 | EPH18 EPH19 | One tick entry, one frame entry |
| 8 | EPH20 | The two-clock contract, written down before it is coded around |
| 9 | EPH23 EPH24 | Single ownership of `_moonDir` and `season` |
| 10 | EPH25 EPH26 | The consumed struct: lights[] and sats[] |
| 11 | EPH37 EPH38 | Zero-alloc and a millisecond budget, measured on day one |
| 12 | SPN1 SPN2 | Rotation phase owns the terminator |
| 13 | SPN3 | `S.sunAng` demoted to camera courtesy |
| 14 | SPN9 | Terminator speed readout — the first visible proof |
| 15 | MOON3 | Real inclination, so eclipses become possible at all |
| 16 | MOON8 | Correct illuminated fraction |
| 17 | EPH29 EPH31 | Occultation and its insolation consequence |
| 18 | MANY1 | Satellite loop — the plural seam |
| 19 | SUNS8 | Light loop in `insolation()` — the other plural seam |
| 20 | GATE1 GATE2 | Save v10 and the v9 migration |
| 21 | GATE4 | `fields:census` / `fields:report` clean |
| 22 | GATE7 | Provenance tags and a bumped baseline |
| 23 | GATE9 | Golden re-blessed with a written rationale |
| 24 | GATE14 | Calibration: 23.44°, 1361 W/m², 3.8 cm/yr, 23h56m |
| 25 | PANEL41 | One System desk that shows the body list — otherwise none of this is playable |

**Review checkpoint:** after the gate, re-read this file and delete what the gate made unnecessary.
A register that only grows is a wishlist.

---

# EPH · One sky, one truth (60)

*Today: four clocks, one of them a wall-clock animation. Felt payoff: tilt the axis and the picture
moves; strip the Moon and the tide, the night brightness and the sky chip all change together.*

## EPH.1 The module and its shapes (EPH1–EPH12)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| EPH1 | **`vr/sim/sky.js`** | New leaf module owning bodies, elements and derived sky geometry; imports `math.js` / `sphere.js` only | M | 3 | `module-map` lists it as a leaf; no sim module imports it circularly |
| EPH2 | **`SkyFrame` fixed shape** | One preallocated object reused every tick; arrays sized at generate, never grown | M | 3 | `alloc-lint` reports zero allocations in `skyTick` |
| EPH3 | **Light body shape** | `{ id, name, teff, mass, radius, lum, a, e, incl, node, argp, M0, heating }` | S | 3 | JSDoc typedef in `fields.js`; `makeStar` output adapts into it losslessly |
| EPH4 | **Satellite body shape** | `{ id, name, mass, radius, dens, albedo, a, e, incl, node, argp, M0, retro, formedYr }` | S | 3 | Typedef committed; `W.moon` maps in with no field invented |
| EPH5 | **`fields.js` rows** | `bodies`, `sky`, `spinPhase`, `spinAxis`, `precessionPhase` — name, kind, type, unit, owner, saved | S | 3 | `npm run fields:census` and `fields:report` clean; H29 checklist satisfied |
| EPH6 | **`W.moon` adapter** | Getter view over `bodies.sats[0]` so `tides.js`, `render.js`, `localview.js`, `climatePanel.js` keep working | M | 3 | Every existing `W.moon` reader passes untouched; one commit, no behaviour change |
| EPH7 | **`rule.star` adapter** | `bodies.lights[0]` is the same object `applyStarToRule` attached | S | 3 | `star.js` tests unchanged and green |
| EPH8 | **Phase from absolute epoch** | Angles are `f(ageYr, elements)`, never `+= dt` — accumulation is a determinism leak | M | 3 | Two runs reaching the same `ageYr` by different tick sizes agree bit-for-bit |
| EPH9 | **Kepler solver** | 3-iteration Newton on eccentric anomaly, tagged `fitted` with a stated error bound | S | 2 | Unit test: max error < 1e-6 rad for e ≤ 0.4 |
| EPH10 | **Anomaly conversions** | One `trueFromMean` used everywhere; no second copy in `atmo.js` | S | 2 | Grep finds one implementation |
| EPH11 | **Element → direction** | Node / inclination / argument composed once into a 3×3, cached per body per tick | M | 3 | Direction matches a reference table for Luna to < 0.5° over one year |
| EPH12 | **Two bases, written down** | Planet-fixed frame vs sky frame defined in one doc comment; every conversion named | S | 3 | `briefs/sky-model.md` states both; no module converts ad hoc |

## EPH.2 Derived geometry everything reads (EPH13–EPH27)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| EPH13 | **`subsolarPoint`** | Latitude / longitude of the substellar point per light | S | 3 | Equals `asin(sin ε · sin season)` at equinox and solstice to 0.1° |
| EPH14 | **`sublunarPoint`** | Same for each satellite, including declination | S | 2 | Tropic-tide row `MOON19` can be built on it |
| EPH15 | **Kill `y = 0.34`** | Sun direction is built from declination and hour angle; delete the constant at `main.js:1868` | M | 3 | Setting obliquity to 0 flattens the lit band visibly; 90° puts the Sun over a pole |
| EPH16 | **Hour angle** | From rotation phase and longitude; one function | S | 3 | Local solar noon at the inspected cell matches the terminator on screen |
| EPH17 | **One consumer list** | `wind.js`, `tides.js`, `present.js`, `alien.js`, `gpgpu/index.js`, `render.js` all read `W.sky` | M | 3 | Grep for `_sunDir` finds only the compatibility shim |
| EPH18 | **`skyTick(W)`** | Called once in `simTick` before `atmo`, `tides`, `hydro`; ordered in `scheduler.js` | S | 3 | Section appears in the tick profile with its own name |
| EPH19 | **`skyFrame(W, dtSec)`** | Frame-rate entry for the lived clock; shares all maths with `skyTick` | M | 3 | Moon phase on screen and `tideBudget()` never disagree |
| EPH20 | **Two-clock contract** | *Now* = instantaneous; *Years* = orbit-averaged plus held phase. Written into the module header | S | 3 | `briefs/sky-model.md` states it; a test asserts *Years* insolation equals the annual mean |
| EPH21 | **Orbit-averaged insolation** | On *Years*, integrate over anomaly rather than freezing an equinox | M | 3 | Annual-mean insolation at 65°N matches a reference curve within 2% |
| EPH22 | **Held-phase snapshot** | One place stores held season / moon phase; `clockFace.js` stops owning three of them | S | 2 | Switching faces twice returns identical state |
| EPH23 | **`_moonDir` single owner** | `sky.js` writes it; `tides.js` and `clockFace.js` only read | M | 3 | `debugAssert === 'throw'` passes with owner enforcement on |
| EPH24 | **`season` single owner** | Same for `W.season`; `applySeasonPolicy` becomes a policy input, not a writer | M | 3 | Owner assert green; golden unchanged or re-blessed with rationale |
| EPH25 | **`sky.lights[]` payload** | `{ dir, flux, teff, angRad, occluded }` per light | S | 3 | `insolation()` reads only this |
| EPH26 | **`sky.sats[]` payload** | `{ dir, phase, illum, angRad, inShadow, distNow }` per satellite | S | 3 | `tides.js` and the renderer read only this |
| EPH27 | **Angular radius** | Per body, from radius and instantaneous distance | S | 2 | Perigee moon reads ~14% larger than apogee |

## EPH.3 Eclipses as geometry, not decoration (EPH28–EPH34)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| EPH28 | **Shadow cones** | Umbra / penumbra half-angles from the light and occulter angular radii | M | 2 | Totality only when the satellite's disc exceeds the light's |
| EPH29 | **Light × satellite occultation** | Pairwise angular-separation test producing a 0–1 magnitude | M | 3 | A solar eclipse happens on a world with a non-zero lunar inclination and never on one at zero |
| EPH30 | **Satellite in planet shadow** | Lunar eclipse; drops the night-side moonlight term | S | 2 | `uMoon` falls to the coppery floor, not to zero |
| EPH31 | **Eclipse → insolation** | Magnitude multiplies the light's flux for the covered cells only | M | 3 | Cell temperature dips measurably under totality on the lived clock |
| EPH32 | **Path of totality** | Cell mask for the umbral track, available as an overlay | M | 2 | Overlay draws a band, not a disc |
| EPH33 | **Chronicle entry** | Eclipses log with date, magnitude and duration | S | 2 | Event appears in the chronicle and survives a save |
| EPH34 | **`sky.eclipse` summary** | Next eclipse, type, in-how-long, for the HUD and the Moon panel | S | 3 | "Next solar eclipse in 3.4 months" reads correctly on Earth |

## EPH.4 Cost, correctness, and the awkward worlds (EPH35–EPH48)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| EPH35 | **Hoist per-tick trig** | All body trig computed once per tick, never per cell | M | 3 | Profile shows `sky` flat in cell count |
| EPH36 | **Per-cell inner loop** | Insolation inner loop touches only precomputed scalars and `DIR` | M | 3 | Multi-light insolation costs < 1.6× single-light at two lights |
| EPH37 | **Zero allocation** | No array or object created inside `skyTick` / `skyFrame` | M | 3 | `npm run fidelity` alloc-lint passes with `sky.js` in scope |
| EPH38 | **Millisecond budget** | Named budget for `skyTick` at 6 bodies, enforced like the other sections | S | 3 | Budget recorded in `briefs/test-timing.md`; CI fails when exceeded |
| EPH39 | **Pure function** | `skyTick` consumes no RNG and no wall clock | S | 3 | Determinism lint clean; replay from save reproduces the sky exactly |
| EPH40 | **Golden sky hash** | Sky state hashed into `golden.json` at fixed ages | S | 3 | `npm run fidelity` catches an unintended geometry change |
| EPH41 | **Every constant tagged** | `@provenance` on `sky.js`; each literal `measured` / `fitted` / `invented` | M | 2 | Provenance scanner reports `sky.js` above the file baseline |
| EPH42 | **`units.js` entries** | AU, degree, radian, day, `S⊕`, arcsecond/year | S | 2 | Unit schema hash bumped and saved with the run |
| EPH43 | **`elementsTick`** | Secular drift only: recession, damping, resonance flags | M | 3 | Elements change over Myr, never within one lived day |
| EPH44 | **`phaseTick`** | Geometry only; safe to call at frame rate | S | 3 | Called from `skyFrame` with no side effects on elements |
| EPH45 | **Element history** | Ring buffer of `(ageYr, a, e, incl)` per body for Lab plots | S | 2 | Lunar distance-vs-time plots from real stored samples |
| EPH46 | **Element clamps** | Roche floor and Hill ceiling applied in `elementsTick`, with a reason string | S | 3 | A satellite dragged inside Roche is reported, not silently clamped |
| EPH47 | **Hill radius** | Per satellite via `exophysics.hillRadiusAu` | S | 2 | Panel slider shows the ceiling at the right place |
| EPH48 | **Roche limit** | From the satellite's own density, not a shared `0.38` constant | M | 2 | An icy moon and a rocky moon get different floors |

## EPH.5 Worlds that break the assumptions (EPH49–EPH60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| EPH49 | **Generate-time repair** | An unstable authored system is repaired (or refused) at generate with a stated reason | M | 3 | Loading a bad seed string produces a warning, not a silent nonsense sky |
| EPH50 | **`worldGuard` asserts** | No satellite inside Roche or outside Hill; no light with negative flux | S | 3 | Assert fires in `debugAssert === 'throw'` mode on a hand-broken system |
| EPH51 | **Airless / no-surface fast path** | Satellite and tide loops skipped cheaply, sky still valid | S | 2 | Giant and airless profiles show no tide cost |
| EPH52 | **Zero-light worlds** | Free-floating planets: sky with no lights is a legal state everywhere | M | 3 | Rogue-planet catalogue entries run without a special case in each consumer |
| EPH53 | **Particle heating as a light** | Pulsar wind is a light with `heating: 'particle'` and no photosphere colour | S | 2 | Pulsar worlds keep their insolation floor with no `if` in `atmo.js` |
| EPH54 | **Locked worlds, one path** | Tidally locked = rotation phase equals orbital phase; no separate branch in `geometricInsolation` | M | 3 | The locked branch in `atmo.js` shrinks to the redistribution term |
| EPH55 | **Spin–orbit resonance** | `p:q` from `exophysics.spinOrbitResonance` drives rotation phase (Mercury 3:2) | M | 2 | Mercury's solar day is twice its year in the readout |
| EPH56 | **`describeSky(W)`** | One honest sentence: lights, satellites, day length, next eclipse | S | 3 | Appears in inspect and in the HUD's sky chip |
| EPH57 | **Keyboard-readable sky** | The same sentence reachable from the focused canvas per [`accessibility.md`](accessibility.md) | S | 2 | Screen-reader line announced on sky change |
| EPH58 | **Debug ray overlay** | `?sky=1` draws body directions, shadow cones and the sub-solar point | S | 1 | Overlay renders and costs nothing when off |
| EPH59 | **Headless sky dump** | `headless.mjs --sky` prints a table at chosen ages for CI diffing | S | 2 | Output is stable across runs and platforms |
| EPH60 | **`briefs/sky-model.md`** | Limits doc: analytic, no N-body, no secular chaos, equilibrium tides only | S | 3 | Linked from [`model-limits.md`](model-limits.md) |

---

# SPN · Spin: the planet you can see turning (60)

*Today: `Spin±` changes a HUD label and a wind-band count. Felt payoff: a Venus that visibly crawls
backwards, an Earth whose terminator moves at 1,670 km/h, and a dawn you can wait for.*

## SPN.1 Rotation owns the terminator (SPN1–SPN14)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| SPN1 | **`W.spinPhase`** | Rotation angle owned by `sky.js`, derived from `ageYr` and `rotationPeriod` | S | 3 | Field row committed; phase is reproducible from a save |
| SPN2 | **Day length drives phase** | Halving `rotationPeriod` doubles terminator speed | M | 3 | Two worlds with different periods show visibly different day lengths on the lived clock |
| SPN3 | **Demote `S.sunAng`** | Kept only as an idle camera courtesy when the sim is paused; never read by physics | S | 3 | Grep: `S.sunAng` appears in `main.js` presentation code only |
| SPN4 | **Retrograde is visible** | Negative period runs the phase backwards | S | 3 | Venus's terminator moves the other way; a headless assert checks the sign |
| SPN5 | **Solar vs sidereal day** | Both computed from rotation and orbital period, both labelled | S | 2 | Earth reads 23h56m sidereal, 24h00m solar |
| SPN6 | **HUD day/year line** | "day 24h 00m · year 365.25 d" from the model, not the ruleset text | S | 3 | Changing spin updates the line immediately |
| SPN7 | **Lived-clock exchange rate** | State how many sim hours one real second buys, per speed step | S | 2 | Shown in the time panel; matches measured advance |
| SPN8 | **`dayWatch` re-based** | Day-watch speed becomes a multiplier on real day length, not a fixed 0.42 | S | 2 | A slow rotator watched in day-watch still takes longer |
| SPN9 | **Terminator speed readout** | Equatorial surface speed in km/h, from radius and period | S | 3 | Earth reads ≈1,670 km/h; Venus ≈6.5 km/h |
| SPN10 | **The planet turns, not the light** | Decide and document: body-frame rotation with a fixed light | L | 3 | `briefs/sky-model.md` states the choice; renderer implements it once |
| SPN11 | **Body-frame surface** | Land, cover, cities and sprites rotate with the planet, not against it | L | 3 | A city stays over its cell through a full rotation |
| SPN12 | **Camera lock modes** | Inertial (watch it spin) vs co-rotating (hold a place) | M | 3 | Toggle in View; co-rotating keeps the inspected cell centred |
| SPN13 | **Sub-solar marker** | Optional dot at the substellar point | S | 2 | Marker sits on the brightest cell |
| SPN14 | **Sub-lunar marker** | Same for the largest satellite | S | 1 | Marker tracks the tide bulge |

## SPN.2 What rotation should already be doing (SPN15–SPN30)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| SPN15 | **Terminator overlay** | Day/night line as a first-class overlay, not a shading accident | S | 2 | Overlay appears in the View list with a legend |
| SPN16 | **Twilight width** | Band width from scale height and stellar angular size | M | 1 | A thick-air world has a visibly wider twilight than an airless one |
| SPN17 | **Diurnal range from spin** | Replace the `lerp(0.5 + 0.5·day, day, …)` hack in `geometricInsolation` with explicit day/night forcing over the rotation period | L | 3 | Diurnal range vs rotation period matches a reference curve; Earth's ~10 K land range survives |
| SPN18 | **Thermal-inertia coupling** | Slow rotators with low inertia get extreme swings; the existing `k` term becomes derived, not fitted | M | 2 | Mercury and Moon day/night contrasts land in range |
| SPN19 | **Coriolis from Ω** | `wind.js` reads angular velocity from the sky, not `rotationPeriod` directly | S | 2 | One source of Ω; retrograde spin flips the deflection sense |
| SPN20 | **Rossby readout** | Uses the same Ω; the "rotation-dominated" note becomes derived | S | 1 | Panel note changes when spin changes |
| SPN21 | **Jet count wiring** | `rhinesJetCount` / `circulationCellCount` fed from the sky | S | 2 | Band count updates within one tick of a spin edit |
| SPN22 | **Locking timescale** | Tidal-locking time from mass, distance, Q → "this world locks in 400 Myr" | M | 3 | Panel states it; a close-in world locks during a long run |
| SPN23 | **Locked terminator is static** | Substellar point fixed; show the ring, don't fake a sweep | M | 3 | Locked worlds stop animating a false day |
| SPN24 | **Eyeball world** | Substellar ocean, terminator ice ring emerge from the insolation field | M | 3 | A locked ocean world shows the pattern without a painted texture |
| SPN25 | **Libration** | Eccentric locked orbits rock the substellar point; move the existing `lib` term into the sky | S | 2 | Libration amplitude scales with e |
| SPN26 | **Angular momentum ledger** | Spin plus orbital momentum tracked; moon edits move it rather than inventing it | M | 2 | Lab shows the ledger; setting a moon does not create momentum from nothing |
| SPN27 | **Recession ↔ spin-down** | Lunar recession slows the planet's rotation on the same ledger | M | 3 | Over 1 Gyr, day length and lunar distance both grow, coupled |
| SPN28 | **Day-length history** | Devonian 21-hour day plotted from the ledger, not a lookup | M | 2 | Curve passes through the tidal-rhythmite constraint |
| SPN29 | **Rhythmite evidence line** | "Rock says the day was 21 h at 380 Ma" as a citation chip | S | 2 | Chip appears in the Rock dock with its source |
| SPN30 | **Spin tool honesty** | Settling time and receipt for spin edits; no instant climate | S | 2 | Receipt names the response timescale |

## SPN.3 Geometry the player can read off the globe (SPN31–SPN46)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| SPN31 | **Oblateness from spin** | J2 flattening from Ω and density | M | 1 | Fast rotators visibly bulge; Earth's 1/298 is imperceptible and correct |
| SPN32 | **Breakup limit** | Rotational breakup period from density; the spin tool refuses past it | S | 2 | Tool warns and clamps with a reason |
| SPN33 | **Spin-axis vector** | Axis stored as a direction, not only a tilt magnitude — precession needs it | S | 3 | Field row committed; obliquity derives from it |
| SPN34 | **Pole marker** | North pole marked on the globe when the axis tool is active | S | 1 | Marker moves as the axis tilts |
| SPN35 | **Polar day/night length** | Days of midnight sun at the inspected latitude | S | 2 | 0 at the equator, ~186 at the pole, on Earth |
| SPN36 | **Arctic circle drawn** | Latitude from obliquity, drawn as a guide | S | 2 | Circle moves when the axis tilts; disappears at ε = 0 |
| SPN37 | **Tropics drawn** | Same for the tropic latitudes | S | 2 | Guides bound the sub-solar march |
| SPN38 | **Equation of time** | Analemma from e and obliquity | M | 1 | Solar-noon offset varies through the year |
| SPN39 | **Sunrise / sunset at a cell** | Local times for the inspected cell | S | 3 | Inspect line reads "sunrise 06:12 · sunset 18:41" |
| SPN40 | **Solar noon altitude** | Peak sun angle at the inspected cell today | S | 2 | Matches the declination and latitude |
| SPN41 | **Day-length-by-latitude chart** | Small chart in the Sky panel, season-scrubbable | M | 2 | Chart redraws on the season slider |
| SPN42 | **Insolation-by-latitude chart** | Annual-mean and current, overlaid | M | 3 | Curves respond to obliquity edits |
| SPN43 | **Season lag** | Warmest month trails the solstice by thermal inertia | M | 2 | Ocean-dominated cells lag more than continental ones |
| SPN44 | **Hemispheric asymmetry** | Land/ocean split makes the two hemispheres' seasons differ | M | 2 | Southern-ocean world shows a milder cycle |
| SPN45 | **ITCZ migration** | Convergence band follows the sub-solar latitude | M | 3 | Band moves with season in the wind overlay |
| SPN46 | **Monsoon** | Land–sea contrast × seasonal insolation drives a reversing wind | L | 3 | A large continent grows a seasonal reversal in the wind field |

## SPN.4 Night, and what lives in it (SPN47–SPN60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| SPN47 | **Diurnal cloud cycle** | Afternoon convective cloud on the lived clock | M | 2 | Cloud fraction peaks after local noon over land |
| SPN48 | **Night-side cooling** | Explicit radiative loss over the dark hours | M | 2 | Clear nights cool more than cloudy ones |
| SPN49 | **Dawn frost** | Frost where night cooling crosses the dew/frost point | S | 2 | Visible on the lived clock in the right places |
| SPN50 | **Dew** | Dew formation as a small moisture source at dawn | S | 1 | Moisture ticks up in the hour after sunrise |
| SPN51 | **Nocturnal agents** | Agents read the night flag and change behaviour | M | 2 | Some guilds move at night; observable in localview |
| SPN52 | **Moonlit nights** | Existing `localview` moonlit flag fed by real illumination and eclipse state | S | 2 | Full-moon nights are brighter than new-moon nights |
| SPN53 | **Starlit nights** | A moonless world's night has a floor from the sky, not from the Moon term | S | 2 | `uMoon = 0` worlds are dark but not black |
| SPN54 | **Airglow** | Faint night-side emission for thick-air worlds | S | 1 | Renderer shows it only where pressure supports it |
| SPN55 | **Aurora × night** | Aurora brightness follows magnetosphere and the night side | M | 1 | Aurora appears on the dark limb, near the poles |
| SPN56 | **Night length distribution** | Histogram over a year at a latitude, for the Lab | S | 1 | Chart drawn from the ephemeris |
| SPN57 | **Announce spin changes** | Accessible announcement of new day length and its consequence | S | 2 | Live-region text on spin edits |
| SPN58 | **Reduced-motion respect** | Spin animation honours the reduced-motion preference | S | 2 | No rotation animation when the preference is set; state still advances |
| SPN59 | **Retrograde headless test** | Assert terminator longitude decreases over ticks for a retrograde world | S | 3 | Test in the fast tier, under budget |
| SPN60 | **Locked-world test** | Assert the substellar cell index is constant for a locked world | S | 3 | Fast-tier assert added and counted |

---

# OBL · Tilt, precession, and the long cycles (50)

*Today: obliquity is a scalar wobbled by `sin(year · 2e-5)`, and moonless chaos is two hard-coded
sines in [`god/climate.js`](../vr/sim/god/climate.js). `W.precession` is written and never read.
Felt payoff: an ice age you can pace, and an axis whose fate depends on what you hung in the sky.*

## OBL.1 The axis as a vector (OBL1–OBL12)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| OBL1 | **Axis precesses** | Spin axis traces a cone; obliquity and precession phase both derive from it | M | 3 | Precession phase advances over Myr and is saved |
| OBL2 | **Luni-solar torque** | Precession rate from satellite mass, distance and the planet's oblateness | M | 3 | Earth reads ≈26 kyr; a moonless Earth reads the solar-only rate |
| OBL3 | **Precession readout** | Period in kyr in the Sky panel, derived | S | 2 | Value changes when the Moon changes |
| OBL4 | **Wire or delete `W.precession`** | Either becomes the phase of OBL1 or is removed from `setOrbit` | S | 3 | No write-only field remains; `fields:report` shows no orphan |
| OBL5 | **Obliquity oscillation** | Amplitude from the precession frequency against orbital node frequencies | L | 3 | Earth oscillates ±1.3° over 41 kyr; Mars's range is wide |
| OBL6 | **41 kyr band** | Obliquity term in the insolation series | M | 3 | Spectral test finds power at 41 kyr |
| OBL7 | **100 / 400 kyr band** | Eccentricity terms | M | 3 | Spectral test finds both peaks |
| OBL8 | **23 / 19 kyr band** | Climatic precession `e·sin ω̄` | M | 3 | Spectral test finds the precession doublet |
| OBL9 | **65°N July index** | The canonical Milankovitch index computed and plotted | S | 3 | Curve matches a published shape qualitatively over 800 kyr |
| OBL10 | **Ice-volume spectrum** | Fidelity C42/C43 satisfied from the ephemeris rather than a sine | L | 3 | Ice volume shows the expected peaks; row promoted out of the fidelity register |
| OBL11 | **Apsidal precession** | Perihelion longitude drifts | S | 2 | Perihelion migrates through the seasons over ~112 kyr |
| OBL12 | **Perihelion season** | Which hemisphere gets perihelion summer, stated | S | 2 | Panel line names the hemisphere and the asymmetry |

## OBL.2 Chaos, honestly (OBL13–OBL26)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| OBL13 | **Replace the double sine** | `moonTick`'s two sines become a bounded diffusion with a stated Lyapunov time | M | 3 | Constant tagged; two runs from the same seed still agree |
| OBL14 | **Chaos is seeded, not random** | Wander driven by the deterministic ephemeris, not `rngGod` | S | 3 | Determinism lint clean; replay reproduces the wander |
| OBL15 | **State the disagreement** | Laskar's 0–85° vs Lissauer/Li–Batygin's milder range, both cited in the panel | S | 3 | Panel shows a range with two sources, not one number |
| OBL16 | **Stabilisation is a sum** | Whether an axis is stable depends on total satellite torque, not on a boolean "has moon" | M | 3 | A 0.3-Luna moon partially stabilises; the flag disappears |
| OBL17 | **Mars case** | Mars-like worlds get a wide chaotic range from the same model | M | 2 | Mars ruleset shows 15–45° drift over the run |
| OBL18 | **ε = 0 world** | No seasons, permanent polar ice, weak meridional gradient | S | 3 | Zero-tilt world grows caps and holds them |
| OBL19 | **ε = 90 world** | Pole-on: both poles roast and freeze annually | M | 3 | Insolation field inverts across the year; ice migrates pole-to-pole |
| OBL20 | **ε = 98 (Uranus)** | The existing `obliq` catalogue tag produces the real pattern | S | 2 | Uranus-class world reads correctly on the axes line |
| OBL21 | **ε > 90 retrograde** | Venus at 177° is retrograde-with-small-tilt, not upside-down-with-large | S | 2 | Readout distinguishes the two descriptions |
| OBL22 | **Snowball hysteresis** | Obliquity edits can trip and fail to untrip glaciation | L | 3 | Entry and exit thresholds differ measurably |
| OBL23 | **Honest settling** | Tilt tool receipt says 10 kyr, and the model actually takes it | S | 3 | Climate response lags the edit in the tape |
| OBL24 | **Ice-sheet lag** | Thousand-year response built into the ice term, not instantaneous | M | 3 | Step change in insolation produces a lagged ice response |
| OBL25 | **Deep-time obliquity** | Early Earth's axis given a range with a citation, not a constant | S | 1 | Deep-time runs start inside the cited range |
| OBL26 | **Faint young Sun × tilt** | `faintYoungStar` and obliquity interact in the same insolation term | S | 2 | Archean insolation is 75–80% and seasonal, both |

## OBL.3 Reading it, saving it, proving it (OBL27–OBL50)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| OBL27 | **Orbital-forcing overlay** | Map of insolation anomaly against the annual mean | M | 2 | Overlay listed in View with a legend |
| OBL28 | **Forcing time series** | Ring buffer of the 65°N index for the Lab | S | 2 | Series plotted from stored samples |
| OBL29 | **Spectral plot** | FFT of the forcing series in the Lab | M | 2 | Peaks labelled with their periods |
| OBL30 | **Hysteresis loop drawn** | Ice volume vs forcing, as a loop | M | 2 | Loop is visibly open, not a line |
| OBL31 | **Snowball surface** | `(S, ε, CO₂)` habitability slice in the Lab | L | 2 | Slice renders with the current world marked |
| OBL32 | **Obliquity history plot** | Axis tilt vs time from stored samples | S | 2 | Plot renders over the run's length |
| OBL33 | **Precession cone diagram** | Small diagram of axis, cone and orbit normal | M | 2 | Diagram in the Sky panel, theme-aware |
| OBL34 | **Wander toggle** | Player can freeze the axis, flagged as a cheat like the thermostat | S | 2 | Flag recorded; run marked non-scoring |
| OBL35 | **Axis save** | Axis vector, precession phase and wander state in save v10 | S | 3 | Round-trips through a save fixture |
| OBL36 | **Golden coverage** | Obliquity and precession hashed at fixed ages | S | 3 | `fidelity` catches a silent change |
| OBL37 | **Determinism test** | Two runs, different tick sizes, same axis at the same age | S | 3 | Assert in the fast tier |
| OBL38 | **Provenance** | 23.44°, 26 kyr, 41 kyr, 3.8 cm/yr each tagged with a source | S | 2 | Scanner counts them as measured |
| OBL39 | **Calibration row** | Earth obliquity, precession period and Milankovitch periods as baselines | S | 3 | `calibrate-all` includes them |
| OBL40 | **Tilt tool cost** | Energy cost re-checked against the new consequence weight | S | 1 | Cost stated in `god/economy.js` and justified |
| OBL41 | **Chronicle events** | Obliquity crossings and glaciation onsets logged | S | 2 | Events appear with ages |
| OBL42 | **Moments** | "Your axis wandered past 40°" as a moment | S | 2 | Moment fires once, is saved |
| OBL43 | **Teach lesson** | A lesson step that tilts the axis and reads the ice back | M | 3 | Lesson passes its own assertion |
| OBL44 | **Glossary** | Obliquity, precession, Milankovitch, climatic precession | S | 2 | Terms defined and linked from the panel |
| OBL45 | **Accessible readout** | Axis state and its consequence as one announced sentence | S | 2 | Live region updates on edits |
| OBL46 | **Mobile layout** | Tilt controls and charts usable at ≤400 px | S | 2 | Contrast audit and layout check pass |
| OBL47 | **Model-limits paragraph** | Secular model, no true chaos integration, stated plainly | S | 3 | Paragraph in [`model-limits.md`](model-limits.md) |
| OBL48 | **Remove the fitted wobble** | `atmo.js:303`'s `1 + 0.04·sin(year·2e-5)` deleted once OBL5 lands | S | 3 | Grep finds no ad-hoc obliquity modulation |
| OBL49 | **Parity** | CPU and GPGPU insolation agree under a swinging axis | M | 2 | `parity-climate` passes with a season sweep |
| OBL50 | **Promotion note** | Fidelity C42/C43 marked as superseded by this section | S | 1 | Cross-reference written in both files |

---

# MOON · One moon, done properly (60)

*Today: a zero-inclination circle, `13.4` orbits a year, illumination as `0.5 + 0.5·cos`, and a
Roche floor shared by every density. Felt payoff: a moon you can watch rise, whose phase explains
the tide, whose shadow crosses the map, and whose slow retreat lengthens your day.*

## MOON.1 Real orbital geometry (MOON1–MOON14)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| MOON1 | **Elements, not an angle** | `a, e, incl, node, argp` replace `distance` alone | M | 3 | Luna's elements produce a 27.32-day sidereal month |
| MOON2 | **Synodic vs sidereal month** | Both derived; the existing `0.966` fudge in `tides.js` deleted | S | 3 | Synodic month reads 29.53 d for Earth |
| MOON3 | **Inclination** | 5.15° for Luna; drives eclipse rarity and tropic tides | S | 3 | Eclipses happen near nodes only |
| MOON4 | **Nodal regression** | 18.6-year node cycle | M | 2 | Eclipse seasons drift through the year |
| MOON5 | **Apsidal precession** | 8.85-year perigee cycle | S | 1 | Perigee distance cycles correctly |
| MOON6 | **Perigee / apogee** | Instantaneous distance drives angular size and tide amplitude | S | 3 | Perigee tides read ~1.2× apogee tides |
| MOON7 | **Apparent size** | Angular diameter in the readout; "supermoon" is derived, not scripted | S | 2 | Size varies ±7% over a month |
| MOON8 | **Correct illuminated fraction** | Phase from the true elongation geometry, replacing `0.5 + 0.5·dot` | S | 3 | Quarter moon reads 50% at 90° elongation |
| MOON9 | **Phase names** | New / crescent / quarter / gibbous / full, from the fraction | S | 2 | Name matches the drawn terminator on the moon disc |
| MOON10 | **Phase dial** | Small dial in the Moon panel showing the current phase | S | 2 | Dial matches the rendered moon |
| MOON11 | **Moon altitude / azimuth** | At the inspected cell | S | 2 | Inspect line reads "moon 34° above the SW horizon" |
| MOON12 | **Moonrise / moonset** | Times at the inspected cell | S | 2 | Times advance ~50 min per day |
| MOON13 | **Synchronous rotation** | The moon shows one face; near side and far side differ | S | 2 | Rendered maria stay on the near side |
| MOON14 | **Libration** | Small wobble reveals a little of the far side | S | 1 | Libration visible over a month |

## MOON.2 Tides that come from the geometry (MOON15–MOON30)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| MOON15 | **Amplitude from mass and distance** | Keep the equilibrium two-bulge form; take `a` from the ephemeris each tick | S | 3 | Halving distance raises range ~8× |
| MOON16 | **Solar tide ratio derived** | The 0.46 lunar-to-solar ratio derived from masses and distances, not a constant | S | 2 | Ratio recomputes for other systems; Earth stays ≈0.46 |
| MOON17 | **True syzygy** | Spring–neap from the actual sun–moon elongation | S | 3 | Springs fall at new and full moon, not on a proxy |
| MOON18 | **Spring:neap ratio** | Calibrated against Earth's roughly 2:1 | S | 3 | Baseline row in `calibrate-all` |
| MOON19 | **Tropic tides** | Lunar declination raises the diurnal inequality | M | 2 | Successive high tides differ in height at mid-latitudes |
| MOON20 | **Diurnal inequality readout** | Named in the tide budget | S | 1 | Two different high-tide heights shown |
| MOON21 | **Constituent labels** | M2 / S2 / K1 / O1 named in the readout where the model supports them | S | 2 | Labels appear only where honest; limits doc says which are absent |
| MOON22 | **Semidiurnal vs diurnal regime** | Basins classified from the constituent ratio | M | 2 | Overlay distinguishes the two regimes |
| MOON23 | **Fundy vs Mediterranean** | Existing `basinRange` amplification calibrated against ~11 m and ~0.3 m | M | 3 | Both baselines in `calibrate-all` |
| MOON24 | **Open-ocean range** | Deep-ocean range calibrated to ~0.5 m | S | 3 | Baseline committed |
| MOON25 | **Tidal dissipation budget** | Energy dissipated per year, in watts, tracked | M | 2 | Lab shows it; feeds MOON26 and SPN27 |
| MOON26 | **Recession from dissipation** | 3.8 cm/yr for Earth emerges from the budget and Q | M | 3 | Rate matches the measurement; changes with ocean coverage |
| MOON27 | **Recession over deep time** | Lunar distance vs age plotted; early Moon much closer | M | 3 | Curve stays above the Roche limit for the whole history |
| MOON28 | **Formation date** | Giant-impact age recorded and shown; the existing `formed` field surfaced | S | 2 | Panel shows "formed 4.51 Ga" |
| MOON29 | **Tidal bore** | Where range and funnel geometry allow, name it | S | 1 | Only appears in high-range embayments |
| MOON30 | **Tidal-flat sediment** | Intertidal deposition tied to the range field | M | 2 | Sediment appears in the right band |

## MOON.3 Eclipses, shadows, and the moon as a body (MOON31–MOON44)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| MOON31 | **Eclipse frequency** | ~2.4 solar eclipses a year for Earth, emergent | M | 3 | Count over a simulated century lands in range |
| MOON32 | **Saros** | 6,585.3-day repeat recognised and named | M | 1 | Panel names the saros number of the next eclipse |
| MOON33 | **Annular vs total** | Decided by the angular-size comparison | S | 2 | Both types occur; annular when the moon is near apogee |
| MOON34 | **Umbral track on the map** | Track drawn across cells | M | 2 | Band crosses the globe in the correct direction |
| MOON35 | **Totality darkness** | Local insolation and sky brightness drop under the umbra | M | 3 | Temperature dip visible on the lived clock |
| MOON36 | **Lunar eclipse colour** | Coppery moon rather than a black disc | S | 1 | Renderer tints during umbral passage |
| MOON37 | **Moon albedo and colour** | Rendered under the host star's illuminant via `illum.js` | S | 2 | A red-dwarf moon is not grey |
| MOON38 | **Moonlight spectrum** | Night-side wash takes the star's colour, dimmed | S | 2 | `uMoon` tint derives from Teff |
| MOON39 | **Earthshine** | Planet-lit dark limb of the moon | S | 1 | Faint glow on the unlit crescent |
| MOON40 | **Moon's own surface** | Maria, craters and albedo from a seeded generator, tied to the body's density and age | M | 1 | Two moons look different; same seed looks the same |
| MOON41 | **Tidal heating of the moon** | `tidalHeatFluxWm2` applied to the satellite, not only the planet | M | 2 | A close eccentric moon reads as heated |
| MOON42 | **Moon loss** | Escape past Hill or spiral inside Roche, with an event | M | 2 | A retrograde moon dies during a long run |
| MOON43 | **Ring from Roche crossing** | Disruption produces a ring, not a deletion | M | 3 | Ring appears with the moon's mass accounted for |
| MOON44 | **Ring shadow and ring rain** | Ring casts a seasonal shadow band and drains inward | L | 2 | Shadow band moves with season; ring mass declines |

## MOON.4 What the moon is for (MOON45–MOON60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| MOON45 | **Intertidal ecology** | Existing `intertidal` field drives a distinct habitat band with its own productivity | M | 3 | Removing the moon measurably narrows the band and the biomass |
| MOON46 | **Spawning cue** | Full-moon mass spawning as an agent behaviour | M | 2 | Event correlates with phase in the tape |
| MOON47 | **Wet–dry cycling** | Tide range at the origin site feeds `origin.js` abiogenesis odds | M | 3 | A close early moon raises the origin rate, with the mechanism stated |
| MOON48 | **Early-Moon origin bonus** | Deep-time runs get the ~8× tides of a close moon | M | 3 | Archean origin probability responds to lunar distance |
| MOON49 | **Predictability ceiling** | The tide is predictable; the weather is not. Say so in the panel | S | 2 | Panel states which is forecastable and why |
| MOON50 | **Tide overlay upgrade** | Range, phase and current direction in one legible overlay | M | 2 | Overlay readable at both zoom levels |
| MOON51 | **Moon in the localview sky** | Descend and the moon is in the right place, at the right phase | M | 3 | Position matches the globe view |
| MOON52 | **Moon strip warning** | Stripping a moon warns about the axis and the intertidal, with numbers | S | 3 | Warning quotes the predicted new range |
| MOON53 | **Restore is not free** | Re-adding a moon is flagged as an authored change, not a physical one | S | 2 | Receipt says so; run marked |
| MOON54 | **Roche floor per density** | Replace the shared `ROCHE_DISTANCE = 0.38` | S | 2 | Icy and rocky moons differ; constant removed |
| MOON55 | **Save the moon** | Elements, formation age and ring state in save v10 | S | 3 | Strip the moon, save, reload — it stays stripped |
| MOON56 | **Fixture** | A save fixture with a stripped moon and one with a ring | S | 2 | Both in `vr/data/fixtures/saves/` |
| MOON57 | **Fast asserts** | Phase, synodic month and spring alignment asserted | S | 3 | Three asserts in the fast tier, inside budget |
| MOON58 | **Provenance** | 27.32 d, 5.15°, 3.8 cm/yr, 384,400 km, 0.0123 M⊕ all tagged | S | 2 | Scanner counts them measured |
| MOON59 | **Glossary** | Syzygy, neap, node, saros, Roche, Hill | S | 2 | Terms defined; panel links to them |
| MOON60 | **Limits** | Equilibrium tide only — no resonant basin dynamics, no shelf phase lag | S | 3 | Stated in `sky-model.md` and `model-limits.md` |

---

# MANY · More than one moon (50)

*The plural seam is already cut in [`genesis.js`](../vr/sim/god/genesis.js): `moons` is an array and
`applyGenesisToWorld` keeps `[0]`. Felt payoff: two moons whose tides beat against each other, a
resonance that heats one of them, and an axis that is less stable, not more.*

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| MANY1 | **Satellite loop** | `tidesTick` sums over `sky.sats`; single-moon behaviour bit-identical | M | 3 | Golden unchanged for one moon; two moons produce a different field |
| MANY2 | **Genesis keeps the array** | `applyGenesisToWorld` stops discarding `moons[1..]` | S | 3 | A two-moon genesis survives into the run |
| MANY3 | **Tide superposition** | Bulges add as potentials, not as clamped heights | M | 3 | Aligned moons give a larger range than either alone |
| MANY4 | **Beat period** | Spring–neap becomes quasi-periodic; the beat named in the readout | M | 3 | Readout states "tide cycle 41 d (beat of 12 d and 17 d)" |
| MANY5 | **Unpredictable tide flag** | Beyond a complexity threshold the panel says the tide is not simply forecastable | S | 2 | Flag appears only for genuinely aperiodic cases |
| MANY6 | **Mutual perturbation** | Secular interaction shifts elements over Myr | L | 2 | Two close moons visibly exchange eccentricity over a long run |
| MANY7 | **Resonance detection** | Period ratios near small integers flagged | M | 2 | 2:1 and 4:2:1 detected and named |
| MANY8 | **Laplace resonance** | Three-body 4:2:1 as an authorable configuration | M | 2 | Jupiter-like preset locks into it |
| MANY9 | **Resonant tidal heat** | Forced eccentricity drives satellite heating (the Io mechanism) | M | 3 | Inner moon reads ~2 W/m² in the Io preset |
| MANY10 | **Volcanic satellite** | Heated moon renders as resurfaced, and says why | M | 2 | Surface age reflects the heat flux |
| MANY11 | **Retrograde decay** | Retrograde moons spiral inward toward Roche | M | 3 | A Triton-like moon has a stated remaining lifetime |
| MANY12 | **Phobos case** | A close prograde moon inside the synchronous radius also decays | S | 2 | Lifetime readout ~50 Myr for a Phobos analogue |
| MANY13 | **Capture vs co-formation** | Origin recorded per satellite and shown | S | 1 | Panel distinguishes captured from co-formed |
| MANY14 | **Hill sorting** | Satellites ordered and stability-checked pairwise | M | 3 | Overlapping Hill spheres rejected at generate |
| MANY15 | **Collision outcome** | Two colliding moons produce a ring plus a remnant | M | 2 | Mass conserved across the event |
| MANY16 | **Ring plus moon** | A ring and surviving moons coexist | M | 2 | Both render; shepherding noted |
| MANY17 | **Shepherd moons** | Small moons pin ring edges, cosmetically and in the description | S | 1 | Ring edges drawn where the shepherds are |
| MANY18 | **Obliquity as a sum** | Axis stabilisation computed from total satellite torque | M | 3 | Two half-Luna moons ≠ one Luna, and the panel says why |
| MANY19 | **Destabilisation case** | Two comparable moons can push the precession frequency into resonance | L | 3 | A configuration exists where adding a second moon *raises* obliquity variance |
| MANY20 | **Mars pair case** | Two tiny moons: no stabilisation, negligible tides | S | 2 | Mars preset reads "no meaningful tide, no axis help" |
| MANY21 | **Multi-body eclipses** | Any satellite can eclipse any light | M | 2 | Double eclipse occurs in a two-moon preset |
| MANY22 | **Mutual occultation** | Moons occult each other | S | 1 | Event logged when it happens |
| MANY23 | **Moon-on-moon eclipse** | One moon shadows another | S | 1 | Rendered dimming of the shadowed moon |
| MANY24 | **Eclipse calendar** | Upcoming eclipses across all pairs, listed | M | 2 | List renders and stays correct after a time jump |
| MANY25 | **Draw cap** | At most four satellites drawn; the rest summarised | S | 3 | Frame cost flat beyond four moons |
| MANY26 | **Sky-crowding legibility** | Moon discs sized and spaced so phases stay readable | M | 3 | Contrast audit passes with four moons up |
| MANY27 | **Body list UI** | Satellites listed with mass, distance, period; selectable | M | 3 | Selecting one opens its inspector |
| MANY28 | **Add / remove satellite** | Player can add and remove bodies, with cost and receipt | M | 3 | Costs recorded in `god/economy.js`; receipts issued |
| MANY29 | **Drag distance** | Distance drag with Roche and Hill markers on the track | M | 3 | Drag past a marker refuses with a reason |
| MANY30 | **Mass slider** | Per-satellite mass with a live tide-range preview | S | 3 | Preview matches the value after the edit |
| MANY31 | **Naming** | Satellites named from the seed word list | S | 1 | Names are stable for a seed |
| MANY32 | **Presets** | Mars pair · Jupiter quartet · ring world · doomed retrograde · twin moons | M | 3 | Five presets load and are stable |
| MANY33 | **Genesis dial** | Moon count and archetype in the genesis panel | M | 2 | Seed string round-trips the choice |
| MANY34 | **Seed-string round-trip** | Multi-satellite systems encode and decode | S | 3 | `encodeSeedString` / `decodeSeedString` fixture test |
| MANY35 | **Save v10 satellites** | Array of elements saved and restored | S | 3 | Fixture with three moons round-trips |
| MANY36 | **Migration from v9** | A v9 save's single moon becomes `sats[0]` | S | 3 | Old fixtures load unchanged |
| MANY37 | **Field rows** | `sats` array shape documented in `fields.js` | S | 3 | Census clean |
| MANY38 | **Alloc discipline** | Satellite arrays sized at generate, capped, never grown per tick | S | 3 | Alloc-lint clean at the cap |
| MANY39 | **Perf cap** | Named maximum satellite count with the cost measured | S | 3 | Budget in `test-timing.md` |
| MANY40 | **Determinism** | Multi-body phase reproducible from a save at any age | S | 3 | Replay test passes |
| MANY41 | **Golden** | Two-moon and ring worlds hashed | S | 2 | `fidelity` covers them |
| MANY42 | **Fast asserts** | Tide sum, beat period, resonance detection | S | 3 | Three asserts inside the fast budget |
| MANY43 | **Provenance** | Io 2.5 W/m², Laplace 4:2:1, Phobos decay rate, Triton retrograde — tagged | S | 2 | Scanner counts them measured |
| MANY44 | **Catalogue wiring** | Existing moon catalogue entries (Io, Europa, Titan, Triton, Charon) use the satellite model | M | 2 | Moon worlds load with a real parent body in the sky |
| MANY45 | **Parent body in the sky** | For moon worlds, the planet fills part of the sky and eclipses the star | M | 3 | Io's 42-hour Jovian eclipse appears, as the catalogue blurb already promises |
| MANY46 | **Eclipse-driven freeze-out** | Io's SO₂ freezing during eclipse, as an example of the mechanism | M | 2 | Pressure dips during the eclipse and recovers |
| MANY47 | **Tidal heat budget cap** | Total satellite heat bounded by the orbital energy available | M | 2 | No perpetual-motion heating; Lab shows the ledger |
| MANY48 | **Accessibility** | Body list keyboard-navigable; each body announced with its key numbers | S | 2 | Keyboard loop passes on the focused canvas |
| MANY49 | **Docs** | Multi-satellite section in `sky-model.md` with its limits | S | 3 | Section written; secular-only stated |
| MANY50 | **Model limits** | No true N-body, no resonance capture dynamics, no tidal-evolution feedback beyond first order | S | 3 | Paragraph in `model-limits.md` |

---

# SUNS · More than one sun (60)

*`insolation()` already reads `rule.binaryBeat` and nothing sets it; `circumbinaryBeat` and
`binaryInsolation` already exist in [`exophysics.js`](../vr/sim/exophysics.js). Felt payoff: two
shadows on the ground, one warm and one cool; a year that is not one cycle; and a habitable zone
with a wobbling inner edge.*

## SUNS.1 Architectures and stability (SUNS1–SUNS14)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| SUNS1 | **Architecture type** | `single` / `S-type` (around one star of a pair) / `P-type` (around both) / hierarchical triple / quadruple | M | 3 | Type derived from the elements, never authored as a label |
| SUNS2 | **Binary elements** | Separation, eccentricity, mass ratio μ as first-class fields | S | 3 | Field rows committed; saved |
| SUNS3 | **Holman–Wiegert outer limit** | Critical radius for P-type stability from μ and e | M | 3 | An equal-mass circular pair refuses planets inside ≈2.4 × separation |
| SUNS4 | **Holman–Wiegert inner limit** | Critical radius for S-type stability | M | 3 | α Cen A analogue accepts planets inside ~2–3 AU and refuses beyond |
| SUNS5 | **Mardling–Aarseth criterion** | Hierarchical-triple stability check on the period ratio | M | 3 | Equal-separation triples are refused in red with the criterion named |
| SUNS6 | **Stability verdict UI** | Green / amber / red with the criterion and the margin quoted | M | 3 | Verdict changes as the player drags a separation |
| SUNS7 | **`orbitsStable` reuse** | Existing helper extended to multi-star, not duplicated | S | 2 | One implementation; tests cover both cases |
| SUNS8 | **Flux sum in `insolation()`** | Loop over `sky.lights`; identical result for one light | M | 3 | Golden unchanged single-star; two-star world differs correctly |
| SUNS9 | **Per-light direction** | Each light has its own terminator; night is where all are below the horizon | M | 3 | A cell can be lit by one sun and not the other |
| SUNS10 | **Two shadows** | Renderer casts two shadow directions where cost allows | L | 2 | Localview shows two shadows on the ground |
| SUNS11 | **Coloured shadows** | Each shadow is tinted by the *other* star — a real two-sun phenomenon | M | 3 | A red-dwarf-plus-G-star world shows a blue-ish and an orange-ish shadow |
| SUNS12 | **Illuminant mixing** | `illum.js` mixes two Planck spectra weighted by flux instead of taking one Teff | M | 3 | Ground colour shifts through the beat cycle |
| SUNS13 | **Sky colour mixing** | `blackbodyRgb` blend for the atmosphere tint | S | 2 | Sky chip shows the mixed colour |
| SUNS14 | **Render cost gate** | Multi-light shader path behind a capability and a cost budget | M | 3 | Frame budget holds at three lights on the reference device |

## SUNS.2 Light that changes with time (SUNS15–SUNS30)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| SUNS15 | **Beat period** | `circumbinaryBeat` wired to the real elements | S | 3 | Beat matches the binary and planetary periods |
| SUNS16 | **Variability amplitude** | Peak-to-trough flux fraction over a year, reported | S | 3 | Number appears in the Sun panel |
| SUNS17 | **Light-curve strip** | Total flux vs time as a small chart | M | 3 | Strip renders a year and scrubs |
| SUNS18 | **Two-sun seasons** | Seasonality from geometry *and* from the beat, distinguished in the readout | M | 3 | Panel separates "axis season" from "orbit season" |
| SUNS19 | **Irregular calendar** | The year is not one cycle; state the two periods rather than faking one | S | 3 | Time panel shows both, without pretending |
| SUNS20 | **Mutual eclipses** | The stars eclipse each other, dropping total flux | M | 3 | Flux dips at conjunction for an eclipsing pair |
| SUNS21 | **Eclipse season** | Stellar eclipses cluster; the cluster named | M | 2 | Calendar shows the season |
| SUNS22 | **Twin sunrise** | Two sunrises at one cell when the geometry gives them | M | 3 | Localview shows both; inspect lists both times |
| SUNS23 | **No tidal locking** | A planet cannot lock to a pair — stated as a habitability consequence | S | 3 | Panel says so for P-type worlds; the locking check skips them |
| SUNS24 | **Locked to one star (S-type)** | S-type worlds *can* lock to their primary; the second sun still rises | M | 2 | Locked S-type world has a static primary and a moving secondary |
| SUNS25 | **Flux-weighted HZ** | Habitable zone from summed flux, not one star's luminosity | M | 3 | HZ bar shows the combined annulus |
| SUNS26 | **HZ with wobbly edges** | Eccentric binaries give a time-varying HZ; drawn as a band, not a line | M | 3 | Band width reflects the variability |
| SUNS27 | **Dynamical HZ overlap** | Where the stable zone and the habitable zone overlap — or do not | M | 3 | Overlap drawn; a world can be habitable and unstable, and be told so |
| SUNS28 | **Doubled flare risk** | Flare rate sums; the worse star dominates | S | 2 | Flare gauge reflects both |
| SUNS29 | **XUV sum** | Integrated dose from all lights feeds atmospheric retention | M | 2 | `retainsAtmosphere` uses the sum |
| SUNS30 | **Surface UV dose** | Combined UV at the ground, after ozone | M | 2 | Readout in the Lab; drives LIFE21 |

## SUNS.3 Real systems, and the ones people ask for (SUNS31–SUNS44)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| SUNS31 | **`HOSTS` gains companions** | Host records carry companion stars where measured | M | 3 | `worldRecord` schema extended; provenance tiers preserved |
| SUNS32 | **Kepler-16** | The canonical circumbinary; loads from measured elements | M | 3 | World record with measured tier for both stars |
| SUNS33 | **Kepler-47** | Multi-planet circumbinary, one in the HZ | M | 2 | System record with three planets |
| SUNS34 | **TOI-1338 / BEBOP-1** | Two-planet circumbinary | S | 2 | Record loads |
| SUNS35 | **Kepler-64 / PH1b** | Circumbinary planet in a quadruple — four suns in one sky, and it is real | M | 3 | Loads; the sky renders four lights within the draw cap |
| SUNS36 | **α Centauri** | S-type template: 23 AU, e = 0.52 | S | 3 | Stability limits computed from the real elements |
| SUNS37 | **Proxima as tertiary** | The existing Proxima record gains its α Cen AB context | S | 2 | System record links them; distance stated |
| SUNS38 | **GJ 667C** | Planets around the tertiary of a triple | S | 2 | Record loads with the hierarchy |
| SUNS39 | **LTT 1445A** | Transiting planet in a triple M-dwarf | S | 2 | Record loads |
| SUNS40 | **Kepler-1647** | Long-period circumbinary giant | S | 1 | Record loads |
| SUNS41 | **Catalogue entries** | Each system gets a catalogue card with its architecture and blurb | M | 2 | Cards render; category filter includes "many suns" |
| SUNS42 | **Tatooine preset** | Close pair, planet well outside the critical radius | S | 3 | Loads stable, two suns in the sky |
| SUNS43 | **Three-body fiction preset** | The chaotic-triple scenario, loaded *and refused* with the stability criterion shown | M | 3 | Preset exists and explains, in one line, why it cannot last |
| SUNS44 | **Hierarchical triple preset** | The version that *does* work: close pair plus a distant third | M | 3 | Loads stable; three suns, one of them small in the sky |

## SUNS.4 Making it honest and cheap (SUNS45–SUNS60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| SUNS45 | **Angular size per light** | `starAngularDeg` per light from its own distance | S | 2 | The distant tertiary is a bright point, not a disc |
| SUNS46 | **Light draw cap** | At most four lights drawn; more summarised | S | 3 | Frame cost flat beyond the cap |
| SUNS47 | **Per-light `photonFrac`** | PAR fraction per star, then flux-weighted | S | 3 | Feeds LIFE1–LIFE4 |
| SUNS48 | **Faint-young track per star** | `faintYoungStar` applied per light with its own mass and age | S | 2 | Old triples brighten correctly over deep time |
| SUNS49 | **Stellar lifetime mismatch** | A massive companion leaves the main sequence mid-run | M | 2 | Event fires; flux and colour change permanently |
| SUNS50 | **White-dwarf companion** | Post-main-sequence companion path, reusing `whiteDwarfHzWindow` | M | 2 | Transition handled without a special case per consumer |
| SUNS51 | **Genesis star count** | Star count and architecture in the genesis panel | M | 3 | Seed string round-trips |
| SUNS52 | **Sun panel per light** | Each light gets its own inspector page | M | 3 | Switching lights swaps the page cleanly |
| SUNS53 | **Save v10 lights** | Light elements and companion state saved | S | 3 | Three-light fixture round-trips |
| SUNS54 | **Field rows** | `lights` array documented in `fields.js` | S | 3 | Census clean |
| SUNS55 | **Alloc discipline** | Light loop allocation-free; arrays capped at generate | S | 3 | Alloc-lint clean |
| SUNS56 | **Perf budget** | Insolation cost at 1 / 2 / 3 lights measured and recorded | S | 3 | Numbers in `test-timing.md`; CI ratchet |
| SUNS57 | **Parity** | CPU and GPGPU agree with two lights | M | 3 | `parity-climate` extended and passing |
| SUNS58 | **Fast asserts** | Flux sum, stability verdict, beat period | S | 3 | Three asserts inside budget |
| SUNS59 | **Provenance** | Every stability coefficient and stellar constant tagged with its source | M | 3 | Scanner counts them; unsourced fits are labelled `fitted` |
| SUNS60 | **Limits** | Analytic stability criteria, not integration; no circumbinary disc dynamics; no eclipsing-binary light-curve detail | S | 3 | Stated in `sky-model.md` |

---

# LIFE · Life under many lights (40)

*The question the whole register is aimed at: could there be life with three suns and two moons?
`photonUsableFractionPlanck`, `sensory.js` and `lifeColour.js` already integrate stellar spectra —
they just never see more than one star. Felt payoff: a habitability verdict that names its own
reason, and a biosphere that behaves differently under a flickering sky.*

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| LIFE1 | **PAR-weighted flux** | Productivity uses photosynthetically usable flux, summed per light | M | 3 | Three cool suns read energy-sufficient and photon-poor |
| LIFE2 | **Photon vs energy limitation** | Which one binds, named in the readout | M | 3 | Readout says "photon-limited" for M-dwarf systems |
| LIFE3 | **Quantum-yield ceiling** | Photons per carbon fixed as an explicit ceiling | M | 2 | Productivity saturates rather than scaling forever with flux |
| LIFE4 | **Far-red photosynthesis** | Allow a pigment strategy that uses longer wavelengths, at a stated cost | M | 2 | Available only under cool stars; cost visible in growth rate |
| LIFE5 | **Productivity under variance** | Mean flux with a variance penalty, not mean alone | M | 3 | Two worlds with equal mean flux differ in biomass |
| LIFE6 | **Eclipse duty cycle** | Fraction of the year spent in significant eclipse | S | 3 | Number in the panel; feeds LIFE7 |
| LIFE7 | **Duty cycle vs photosynthesis** | Long duty cycles suppress productivity superlinearly | M | 3 | Curve stated and tagged; visible in the biomass response |
| LIFE8 | **Ice-albedo hysteresis under variability** | Flux dips can trip a snowball that the mean would not | L | 3 | A configuration exists that glaciates only because of its variance |
| LIFE9 | **Recovery asymmetry** | Getting out of a variance-triggered snowball is harder than getting in | M | 3 | Hysteresis loop measurable |
| LIFE10 | **Circadian entrainment** | Which cycle does life entrain to when there are two? | M | 2 | Agents pick the dominant period; the panel names it |
| LIFE11 | **Two-clock organisms** | Behaviour with both a diurnal and a beat rhythm | M | 2 | Observable in localview activity |
| LIFE12 | **Night-length distribution** | Life responds to the distribution, not the mean | M | 2 | Nocturnal guild abundance tracks it |
| LIFE13 | **Moonlight entrainment** | Spawning and foraging cued by illumination, across all satellites | M | 2 | Two-moon worlds show a messier cue; stated |
| LIFE14 | **Intertidal richness** | Productivity in the intertidal band scales with tide range and its regularity | M | 3 | Strip the moon and the band's biomass falls measurably |
| LIFE15 | **Tide-pool origin site** | Origin site selection prefers high-range shores | M | 3 | `origin.js` weights include tide range |
| LIFE16 | **Wet–dry prebiotic cycling** | Cycling rate feeds abiogenesis probability with the mechanism named | M | 3 | Deep-time origin odds respond to lunar distance |
| LIFE17 | **Obliquity → biome bands** | Band widths from the insolation field, not a latitude table | M | 3 | Zero-tilt and high-tilt worlds have visibly different biome maps |
| LIFE18 | **Seasonality → migration** | Strong seasons drive movement | M | 2 | Migration observable in the tape |
| LIFE19 | **Seasonality → dormancy** | Strong seasons drive dormancy strategies | M | 2 | Dormancy fraction tracks seasonality |
| LIFE20 | **Extreme-obliquity biomes** | Pole-on worlds get their own biome logic, not Earth's bands | L | 2 | Biome map is not a rotated Earth |
| LIFE21 | **UV shielding** | Combined UV dose drives shielding traits and surface habitability | M | 2 | High-UV worlds favour shielded or aquatic life |
| LIFE22 | **Flare sterilisation** | Flares from any light can sterilise exposed surfaces | M | 3 | Ocean and subsurface refugia survive; surface does not |
| LIFE23 | **Refugia mapping** | Where life survives a flare, mapped | M | 2 | Overlay shows refugia |
| LIFE24 | **Vision under two spectra** | `sensory.js` eye model integrates the mixed illuminant | M | 2 | Eye peak sensitivity shifts with the mix |
| LIFE25 | **Pigment colour** | `lifeColour.js` reflects the mixed illuminant | S | 3 | Plants on a two-sun world are not Earth-green |
| LIFE26 | **IR-dominated vision** | Cool-star worlds evolve different sensors | M | 2 | Trait appears under cool triples |
| LIFE27 | **Habitability score** | Composite: PAR, variance, duty cycle, tide, axis stability, flare risk | L | 3 | Score computed with each term inspectable |
| LIFE28 | **Score decomposition** | Which term is binding, shown as a bar | M | 3 | Bar names the limiting factor |
| LIFE29 | **The verdict page** | A Lab page answering "can life exist here?" from the terms above | M | 3 | Page renders for any system, including three suns and two moons |
| LIFE30 | **Verdict honesty** | The page states which terms are measured, fitted and invented | S | 3 | Provenance tiers shown per term |
| LIFE31 | **Comparison mode** | This world against Earth on the same terms | M | 2 | Side-by-side bars |
| LIFE32 | **Window finding** | A guided search that finds the habitable window in a multi-light system | L | 2 | Tool proposes a separation and distance that pass |
| LIFE33 | **Teach lesson** | "Three suns" lesson: build one, break it, fix it | M | 3 | Lesson passes its own assertions |
| LIFE34 | **Moment** | "Life under three suns" fires once and is saved | S | 2 | Moment recorded in the run |
| LIFE35 | **Chronicle** | Origin and extinction events name the sky conditions at the time | S | 2 | Entries carry the flux and variance |
| LIFE36 | **Glossary** | PAR, duty cycle, entrainment, hysteresis, refugia | S | 2 | Terms defined and linked |
| LIFE37 | **Accessibility** | The verdict readable and announced without the charts | S | 2 | Text alternative complete |
| LIFE38 | **Fast asserts** | PAR sum, duty cycle, verdict determinism | S | 3 | Asserts inside budget |
| LIFE39 | **Provenance** | Quantum yield, PAR band, flare dose thresholds tagged | M | 3 | Scanner counts them |
| LIFE40 | **Limits** | No radiative-transfer spectra, no real photochemistry, no ecology validation beyond Earth | S | 3 | Paragraph in `model-limits.md` and on the verdict page |

---

# PANEL · Sun, Moon, and the orrery itself (60)

*The Sky dock already has desks ([`climatePanel.js`](../vr/sim/climatePanel.js)); the Moon lives in a
corner of one of them and the star has no page at all. The game is called ORRERY — the system view
should be a real instrument, not a metaphor. Felt payoff: you can hold the sky the way you hold the
planet.*

## PANEL.1 The Sun page (PANEL1–PANEL16)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| PANEL1 | **Sun desk exists** | New desk in the Sky dock, or its own dock tab if the dock is full | M | 3 | Desk opens, keyboard reachable, no layout regression |
| PANEL2 | **Identity block** | Name, spectral class, age, distance where known | S | 3 | Reads from the world record with tier chips |
| PANEL3 | **Teff / radius / mass** | Editable where the world is authored; read-only where measured | M | 3 | A measured host refuses edits and says why |
| PANEL4 | **Luminosity is derived** | Shown as derived from R and T, never entered | S | 3 | Panel states the derivation |
| PANEL5 | **Colour swatch** | The star's actual colour from `blackbodyRgb` | S | 2 | Swatch matches the sky tint |
| PANEL6 | **Angular size** | Apparent diameter in degrees, with Earth's 0.53° as a reference | S | 2 | Value updates with distance |
| PANEL7 | **`S⊕` readout** | Insolation at the planet, with the soft clamp disclosed if active | S | 3 | Clamped values are labelled as clamped |
| PANEL8 | **HZ bar** | Inner and outer edges with the planet marked | M | 3 | Marker moves when distance changes |
| PANEL9 | **Snow line** | Marked on the same bar | S | 1 | Position from `snowLineAu` |
| PANEL10 | **Flare gauge** | Rate and the last flare's age | S | 2 | Gauge responds to star age and Teff |
| PANEL11 | **Faint-young track** | Luminosity vs age, with now marked | M | 2 | Curve drawn; deep-time runs move the marker |
| PANEL12 | **Main-sequence lifetime** | Remaining lifetime stated | S | 2 | From `stellarLifetimeGyr` |
| PANEL13 | **PAR fraction** | Photosynthetic band share, with the Sun as reference | S | 3 | Feeds the LIFE verdict and says so |
| PANEL14 | **"What this does to your sky"** | Two sentences of consequence, generated | S | 3 | Text changes with the parameters |
| PANEL15 | **Edits get receipts** | Every star edit issues a receipt with a settling time | S | 3 | Receipt visible in the log |
| PANEL16 | **Provenance chips** | Each number tagged measured / derived / assumed / invented | S | 3 | Chips render; hovering gives the source |

## PANEL.2 The Moon page (PANEL17–PANEL32)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| PANEL17 | **Moon desk exists** | Promoted out of the Sky desk's corner into its own page | M | 3 | Desk opens; old controls removed, not duplicated |
| PANEL18 | **Body picker** | When there are several satellites, pick one | M | 3 | Picker lists all, keyboard navigable |
| PANEL19 | **Mass slider** | With a live tide-range preview | S | 3 | Preview matches the committed value |
| PANEL20 | **Distance slider** | Roche and Hill markers drawn on the track | M | 3 | Dragging past a marker refuses with a reason |
| PANEL21 | **Inclination slider** | Drives eclipse frequency, shown live | M | 3 | Zero inclination shows "eclipses: every month"; 5° shows "twice a year" |
| PANEL22 | **Eccentricity slider** | Drives perigee tides and libration | S | 2 | Perigee/apogee range readout updates |
| PANEL23 | **Retrograde toggle** | With the decay lifetime as the consequence | S | 3 | Toggle states the remaining lifetime |
| PANEL24 | **Phase dial** | Current phase, drawn | S | 3 | Matches the rendered moon |
| PANEL25 | **Tide block** | Mean range, spring/neap, next springs, intertidal share | S | 3 | All four from `tideBudget` |
| PANEL26 | **Recession readout** | cm/yr, and the day-length consequence | S | 3 | Earth reads 3.8 cm/yr |
| PANEL27 | **Next eclipse** | Type, date, magnitude | S | 3 | Matches `sky.eclipse` |
| PANEL28 | **Formation** | Age and origin (impact / capture / co-formed) | S | 2 | Shown for each satellite |
| PANEL29 | **Moon disc preview** | Rendered thumbnail at the current phase and apparent size | M | 2 | Thumbnail updates live |
| PANEL30 | **Strip / restore** | With the numeric warning from MOON52 | S | 3 | Warning quotes predicted range and axis variance |
| PANEL31 | **Axis-help readout** | How much this satellite stabilises the axis | M | 3 | Number, not a boolean |
| PANEL32 | **Add satellite** | From the Moon page, with cost and Roche/Hill validation | M | 3 | New satellite appears in the sky and the list |

## PANEL.3 The System page — the orrery (PANEL33–PANEL48)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| PANEL33 | **System desk** | Top-level page for the whole architecture | M | 3 | Desk opens and lists every body |
| PANEL34 | **Top-down orrery view** | Schematic orbits, to log scale, theme-aware | L | 3 | Renders for single, binary and triple systems |
| PANEL35 | **Reuse `orreryTable`** | The existing table geometry informs the schematic rather than a second implementation | M | 2 | One geometry helper, two consumers |
| PANEL36 | **HZ annulus drawn** | With the planet's orbit against it | M | 3 | Uses `habitableZoneAnnulus` |
| PANEL37 | **Stability zones drawn** | Critical radii shown as forbidden bands | M | 3 | Bands move as the binary separation changes |
| PANEL38 | **Architecture badge** | "P-type circumbinary · 2 lights · 2 satellites" | S | 3 | Badge derived, never authored |
| PANEL39 | **Stability verdict** | Green / amber / red with the criterion named and the margin | M | 3 | Verdict matches SUNS6 |
| PANEL40 | **Total-flux chart** | Flux and variance over a year | M | 3 | Chart scrubs and matches the light curve |
| PANEL41 | **Body list** | Every light and satellite with its key numbers, selectable | M | 3 | Selecting opens the right inspector — this is the gate row |
| PANEL42 | **Add / remove bodies** | From the list, with costs, validation and receipts | M | 3 | Invalid additions refused with a reason |
| PANEL43 | **The "roll" diagram** | Spin axis, precession cone, orbit normal, obliquity, in one small figure | M | 3 | Figure answers "how does the planet roll?" at a glance |
| PANEL44 | **Eclipse calendar** | Upcoming eclipses across all pairs | M | 2 | List correct after a time jump |
| PANEL45 | **Presets row** | The MANY32 and SUNS42–44 presets, one click each | S | 3 | Each loads and is stable or explains why not |
| PANEL46 | **Seed-string round-trip** | The whole system encodes into a shareable string | S | 3 | Fixture test round-trips a triple with two moons |
| PANEL47 | **Compare to Sol** | Sol shown as the reference architecture | S | 2 | Toggle overlays it |
| PANEL48 | **Sky preview** | What the sky looks like from the surface: discs, sizes, colours | M | 3 | Preview matches localview |

## PANEL.4 Making the pages carry their weight (PANEL49–PANEL60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| PANEL49 | **Icons** | Sun, moon, satellite, binary, ring icons in `god/icons.js` | S | 2 | Icons render at both sizes |
| PANEL50 | **Tips entries** | `god/tips.js` rows for every new control | S | 2 | Every control has a tip; none is a restatement of its label |
| PANEL51 | **Glossary links** | Panel terms link into the glossary | S | 2 | Links resolve |
| PANEL52 | **Teach lesson** | "Hold the sky" lesson using the three pages | M | 3 | Lesson passes; fits the 90-second budget |
| PANEL53 | **Focus traps** | New dialogs use the existing `focusTrap` | S | 3 | Keyboard cannot escape into the canvas mid-dialog |
| PANEL54 | **Keyboard loop** | Every control reachable and operable from the focused canvas per `accessibility.md` | M | 3 | Keyboard audit passes |
| PANEL55 | **Contrast audit** | New chips, bars and charts pass | S | 3 | `contrast-audit` clean |
| PANEL56 | **Reduced motion** | Orrery animation and phase dials honour the preference | S | 2 | No motion when set |
| PANEL57 | **Mobile ≤400 px** | Three pages usable one-handed | M | 3 | Layout check passes at the narrow breakpoint |
| PANEL58 | **CSS in the extract** | New styles go through the existing CSS extract, not inline blocks | S | 2 | CSS-bytes ratchet holds |
| PANEL59 | **`index.html` id budget** | New ids counted against the architecture ratchet; reuse where possible | S | 2 | Ratchet baseline moves only with a written reason |
| PANEL60 | **Panel chrome test** | Snapshot the three pages' generated HTML | S | 2 | Test in the fast tier, inside budget |

---

# GATE · Saves, gates, numbers and speed (60)

*Nothing above ships without these. The orbital state does not currently survive a save at all,
which makes every feature in this file unverifiable until GATE1 lands.*

## GATE.1 Saves and schema (GATE1–GATE13)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| GATE1 | **Save v10** | Orbital block: lights, satellites, spin axis, spin phase, precession phase, obliquity, rotation period, season, rings | M | 3 | `serializeRun` v10; a stripped moon stays stripped through a reload |
| GATE2 | **v9 migration** | v9 saves rebuild the orbital block from the ruleset, once, with a note | S | 3 | Every existing fixture in `vr/data/fixtures/saves/` loads |
| GATE3 | **New fixtures** | No-moon · two-moon · ring · binary · triple-with-two-moons | S | 3 | Five fixtures committed and loaded by the test tier |
| GATE4 | **Field rows** | Every new `W` field in `fields.js` with owner, unit and saved flag | S | 3 | `fields:census` and `fields:report` clean; H29 checklist done |
| GATE5 | **Fields hash** | Schema hash bumped and carried in the save | S | 3 | Loading a mismatched save reports the mismatch |
| GATE6 | **Owner enforcement** | `sky` is the sole writer of sky fields; handoffs declared | M | 3 | `debugAssert === 'throw'` passes a full run |
| GATE7 | **Provenance baseline** | New constants tagged; the untagged-share ratchet bumped down, not up | M | 3 | Scanner passes; `provenance.json` regenerated |
| GATE8 | **`units.js`** | AU, day, degree, arcsec/yr, `S⊕`, W/m² registered | S | 2 | Units hash bumped |
| GATE9 | **Golden re-bless** | Golden corpus regenerated once, with a written rationale for each changed number | M | 3 | `golden.json` updated; rationale in `shipped.md` |
| GATE10 | **Determinism lint** | No RNG, no wall clock, no accumulation in the sky path | S | 3 | Lint clean |
| GATE11 | **Replay test** | Save at age A, run to B, reload A, run to B — identical | M | 3 | Test in the smoke tier |
| GATE12 | **Tick-size invariance** | Same age by different tick sizes gives the same sky | S | 3 | Fast-tier assert |
| GATE13 | **Seed-string version** | Genesis seed strings version-bumped for multi-body | S | 2 | Old strings still decode |

## GATE.2 Calibration against real numbers (GATE14–GATE33)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| GATE14 | **Earth spine** | ε 23.44° · S 1361 W/m² · sidereal day 23h56m04s · year 365.256 d | S | 3 | Four baselines in `calibrate-all`, each within tolerance |
| GATE15 | **Lunar spine** | 384,400 km · 0.0123 M⊕ · 27.32 d sidereal · 29.53 d synodic · 5.15° · 3.8 cm/yr | S | 3 | Six baselines committed |
| GATE16 | **Tide spine** | Open ocean ~0.5 m · spring:neap ≈2:1 · Fundy ~11 m · Mediterranean ~0.3 m | M | 3 | Four baselines committed |
| GATE17 | **Eclipse spine** | ~2.4 solar eclipses per year · saros 6,585.3 d | M | 2 | Two baselines committed |
| GATE18 | **Precession spine** | 25,772 yr axial · ~112 kyr apsidal | S | 2 | Two baselines committed |
| GATE19 | **Milankovitch spine** | 41 kyr · 100 kyr · 400 kyr · 23/19 kyr | M | 3 | Spectral test asserts each peak |
| GATE20 | **Venus** | Retrograde 243.02 d sidereal, 116.75 d solar day, 177.4° obliquity | S | 3 | All three read correctly |
| GATE21 | **Mercury** | 3:2 spin–orbit; two years per solar day | S | 2 | Solar day reads 176 d |
| GATE22 | **Mars** | Obliquity range from the literature; two negligible moons | S | 2 | Range and tide both correct |
| GATE23 | **Io** | ~2.5 W/m² tidal heat; 42-hour Jovian eclipse | M | 2 | Both emerge from the model |
| GATE24 | **Europa** | Tidal heat and ice-shell thickness consistent with `iceshell.js` | M | 2 | No contradiction between the two modules |
| GATE25 | **Titan** | Methane cycle unaffected by the sky rewrite | S | 3 | Existing Titan baselines unchanged |
| GATE26 | **Triton** | Retrograde decay lifetime in the right order of magnitude | S | 1 | Lifetime readout sane |
| GATE27 | **Phobos** | ~50 Myr to Roche | S | 1 | Readout matches |
| GATE28 | **Kepler-16** | Measured stellar and planetary elements reproduce the observed flux | M | 2 | Flux within the published range |
| GATE29 | **α Cen stability** | Computed S-type limit matches the published ~2–3 AU | S | 3 | Assert on the limit |
| GATE30 | **Faint young Sun** | 4 Ga insolation 75–80% of today | S | 3 | Baseline committed |
| GATE31 | **Devonian day** | ~21 h at 380 Ma from the momentum ledger | M | 2 | Curve passes the rhythmite constraint |
| GATE32 | **Baseline files** | New baselines land in `vr/data/baselines/` like the rest | S | 3 | `calibrate-all` reads them |
| GATE33 | **Tolerance discipline** | Every baseline carries a tolerance and a source, not a bare number | S | 3 | No baseline without both |

## GATE.3 Speed and cost (GATE34–GATE47)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| GATE34 | **`sky` tick section** | Named section in the profiler with its own budget | S | 3 | Appears in the profile output |
| GATE35 | **Budget table** | Costs at 1/2/3 lights × 1/2/4 satellites recorded | S | 3 | Table in `test-timing.md` |
| GATE36 | **Zero-alloc proof** | Alloc-lint covers `sky.js` and the multi-body loops | S | 3 | `npm run fidelity` passes with them in scope |
| GATE37 | **Scheduler degradation** | Under load, sky geometry degrades last; eclipse tracks degrade first | M | 2 | Degradation order documented and tested |
| GATE38 | **Render cost cap** | Multi-light and multi-satellite draw caps enforced | S | 3 | Frame time flat past the caps |
| GATE39 | **Shader variants** | One-light and multi-light shader variants, compiled on demand | M | 2 | Single-star worlds pay nothing for the multi-light path |
| GATE40 | **GPGPU parity** | Multi-light insolation matches on CPU and GPU | M | 3 | `parity-climate` extended |
| GATE41 | **Fast tier under budget** | New fast asserts keep `test:fast` inside its CI seconds | S | 3 | CI timing unchanged or documented |
| GATE42 | **Smoke tier** | Slow multi-body tests live in smoke, not fast | S | 3 | Tier placement reviewed |
| GATE43 | **Orphan suites** | New suites registered so `orphan-suites` stays clean | S | 2 | Check passes |
| GATE44 | **Architecture ratchet** | Line counts, ids and CSS bytes re-baselined only with a written reason | S | 3 | Baselines moved deliberately, once |
| GATE45 | **Lint and format scope** | New files enter the narrow lint scope from the start | S | 2 | `npm run verify` passes with them included |
| GATE46 | **Typecheck** | JSDoc types for bodies and the sky frame; no `any` leaks | M | 2 | Typecheck ratchet holds or improves |
| GATE47 | **`module-map` regen** | `npm run modules:map` includes the new modules | S | 2 | Map committed |

## GATE.4 Honesty, docs, and knowing when to stop (GATE48–GATE60)

| # | Item | Detail | Effort | Impact | Done when |
|---|---|---|---|---|---|
| GATE48 | **`briefs/sky-model.md`** | The model, its frames, its two clocks, and its limits, in one place | M | 3 | Written and linked from `CLAUDE.md`'s doc list |
| GATE49 | **`model-limits.md` additions** | Analytic ephemeris · equilibrium tides · secular obliquity · no photochemistry | S | 3 | Paragraphs added |
| GATE50 | **Limits sheet in the Lab** | The generated limits sheet picks up the new entries | S | 3 | Sheet shows them without hand-editing |
| GATE51 | **Error codes** | New failure modes get codes in `error-codes.md` | S | 2 | Unstable-system refusal has a code |
| GATE52 | **Glossary sweep** | Every new term defined once | S | 2 | No panel term missing from the glossary |
| GATE53 | **Cold start** | A new player meets one sun and one moon; multiplicity is opt-in | S | 3 | Default world unchanged; `cold-start.md` updated |
| GATE54 | **Dark stays out** | No sky feature depends on `?dark=1`; no Dark expansion rides along | S | 3 | Grep confirms no coupling |
| GATE55 | **Playtest rows** | Three playtest rows specifically on sky legibility | M | 3 | Rows in `PLAYTESTS.md` with comfort and legibility scores |
| GATE56 | **90-second check** | The sky reads in the first ninety seconds without opening a panel | M | 3 | Playtest rows confirm it |
| GATE57 | **`shipped.md` entry** | What landed, with the golden rationale | S | 2 | Entry written when the gate closes |
| GATE58 | **`NEXT.md` pointer** | One line pointing here, in the register list | S | 3 | Line added; this file never becomes the queue |
| GATE59 | **Deletion pass** | After the First-25, delete every row the gate made unnecessary | S | 3 | File is shorter than it was |
| GATE60 | **Retirement condition** | When multiplicity is playtested and gated, retire this file to `RETIRED.md` | S | 2 | Condition stated; the file has an end |
