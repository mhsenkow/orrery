# The living-planet demo — how to see it

**Demo rule:** Strike only (Ignite / Meteor). Never open Evil / Dark. Unlocking
war tools with `?dark=1` is out of scope for a first pitch.

Five things should be visible within ten minutes of opening the app with the sim
running: settlement lights growing on the night side, a fire you started spreading
through forest with smoke ahead of it and animals running from it, a herd moving
with one heading, and a nutrient plume where marine animals surface-feed.

**Fast open:** [`vr/?demo=1`](../vr/?demo=1) — living Earth, Strike hook if this
browser has not done the first act yet.

This is what to open, what to look at, and what the numbers are.

## Open this

**Catalogue → Type → `thrive` · Earth Thrive.**

It is the last entry in the ruleset list. Same physics, same palette and the same
seeded Holocene biosphere as `terra`; three differences:

| | `terra` (Earth) | `thrive` (Earth Thrive) |
|---|---|---|
| clock | welded to the present, `dtYr` 10, `ageYr` never moves | starts 2 Ma BP, `dtYr` 200, advances every tick |
| settlement | build rate ×0.12, ceiling 0.55, settler chance 0.03 | full rate, ceiling 1.0, settler chance 0.14 + build×0.55 |
| land / sea fauna | ice fauna only; reef wins every productive cell | grazers on open ground, swimmers in productive water |

`terra` stays the pinned calibration target. `vr/sim/calibrate.mjs` and the golden
run are measured against it and nothing here moved them — never calibrate against
`thrive`.

The switch is `rule.thrive`, read through `isPinnedEarth` / `isThriveEarth` in
`vr/sim/ruleMode.js`. Every throttle that used to key off `rule.earthLike` — and
therefore fired on *every* Earth-like world including deep time — now keys off
`isPinnedEarth`.

## 1 · Settlement lights on the night side

Rotate to the dark limb, or hit day-watch to bring the terminator round.

Night lights are the `uNight` uniform in the planet shader
(`vr/render.js:2093`), fed by `W._cityLights` from `cityLights(W)` in
`vr/sim/city.js`. That is now computed **inside the tick** (in `agentsTick`, every
fourth tick, alongside `settleCities`) rather than once per frame in the render
loop, so a save and a headless run carry it.

The old formula was dominated by `W.cities.length × 0.04`, and `settleCities`
caps its list at 48 — so lights hit full brightness about twenty seconds after
the first village and then never changed again. It is driven by settled **area**
now (`W.builtFrac`), which keeps climbing for thousands of ticks.

Measured, N=32, seed 20260808, demo world:

```
tick    n   builtFrac  lights  settlements  settlers  grazers  meanLife
 250   553    0.1141   0.582        18          26      217     0.1356
 500   559    0.1761   0.825        23          30      230     0.1146
 750   558    0.2394   1.000        29          39      198     0.1089
1000   558    0.3028   1.000        29          56      178     0.1039
1250   545    0.3501   1.000        27          51      198     0.1019
1500   558    0.3805   1.000        26          30      217     0.1042
```

At roughly eleven ticks a second the night side brightens for about the first
seventy seconds and then saturates, while settled area keeps growing visibly on
the day side for the rest of the run. First settlement at tick 9; first light at
tick 9. If the brightening wants to be slower, the two coefficients are named and
commented in `cityLights`.

**Best view:** globe, no overlay, night side. For the mechanism rather than the
picture, use the **Technosphere** overlay — it paints `W.build` directly, so you
can watch the frontier advance on the day side too.

## 2 · Fire

**Tools → Strike → Ignite** (key `j`, 6 units — the cheapest disaster in the
table on purpose), then right-click a forest cell.

If the cell refuses, it tells you why: *water does not burn*, *nothing here to
burn*, *too wet or too frozen to catch*. Inspect reports `fireDanger` for any
cell, so you can hunt for dry fuel instead of guessing. Dry lightning also lights
fires on its own, roughly one per 75 ticks — the pinned Earth is exempt so the
calibration snapshot cannot burn itself off target.

What happens, in `vr/sim/fire.js`:

- `life` is the fuel and it is consumed — the cell goes dark green to brown.
- `ash` rises where it burns **and one ring ahead of the flame**, which is the
  smoke you see from orbit.
- `temp` rises, `CO2` and `dust` tick up, `nutrientP` and `soil` rise in the scar
  so the regrowth is richer than what burned.
- `ash` smears outward and decays, so the scar heals instead of being permanent.
- `pickBehav` in `vr/agents.js` already routed ash and dust to `flee`; fire joins
  them, so nothing new had to be taught to the animals.

The front is tuned to roughly 1.5–3 expected offspring per burning cell:
supercritical enough to run, subcritical enough to stop at the first wet valley.

**Best view:** the new **Fire** overlay. It paints three stages of one event at
once — dim red is danger (dry fuelled land that has not caught), orange is flame,
grey is ash. Watch it before you strike to find the driest patch.

## 3 · Herds and stampedes

Grazers (kind 7, the largest base sprite scale) exist on open ground where
animals are unlocked, and they are **seeded as groups**: `writeHerd` in
`vr/agents.js` writes four to eight animals into a cell and its neighbours.
A herd seeded one animal at a time never forms — cohesion only sees a cell and
its four neighbours, and 560 beings over 24 576 cells is a 2% density.

The clump code had cohesion and separation but no alignment, so a group had no
heading and milled. It averages neighbours' heading vectors now
(`m.hx/hy/hz`, a smoothed tangent), which is what reads on screen as a herd
rather than as a crowd. Fire in or next to the cell sets `panic`, and a panicked
animal in a herd of four or more moves with probability 0.92 instead of 0.4 —
that is the stampede.

One other change made this stick: kind used to be re-derived from the destination
cell on every step, so a grazer that walked into a forest cell was **redrawn as a
tree**. Animals keep their kind now (`isAnimalKind`); vegetation sprites still
track the biome they stand in.

A group of eight or more gets a line in the chronicle, at most once per 120 ticks.

**Best view:** zoom in until sprites separate, or open the local grid. Measured
peak herd: 9 (the neighbour scan caps at 8 companions), held for the whole run.

Grazers sit around 180–230 individuals indefinitely. Three separate defects used
to end that within a few minutes, and all three are worth knowing about because
they are the shape of bug this layer produces:

- Every founder was created at `age: 0`, so the whole planet was one cohort and
  501 of 560 animals died of old age between tick 300 and 600. `stagger` spreads
  founders across their lifespan.
- Births ran at 9.4e-4 per being per tick against a ~360-tick adult span — 0.34
  offspring per lifetime, a third of replacement — because two nested magic
  probabilities multiplied. One knob now, sized against replacement.
- The being cap is an array length, and with no per-kind rule the fastest breeder
  took every slot: grazers reached 376 of 560 and settlers were squeezed to zero.
  `KIND_SHARE` caps any one kind at 42% of the buffer and `KIND_FLOOR` lets a
  scarce kind be born even at the cap, so the buffer can never be the thing that
  extinguishes a lineage.

Population is now genuinely turning over rather than persisting: 1 477 births,
1 980 deaths and 501 immigrations over 1 500 ticks, with `n` steady near 557.

## 4 · The nutrient plume

Kind 15 swimmers in water with `npp > 0.22` take a `surface` behaviour — distinct
from `forage` because it is the one that writes the plume. `bumpNutrient` raises
`nutrientN`, `nutrientP` and a small direct `life` pulse in the cell and its four
neighbours, scaled by body size when the lineage expresses a plan.

`nppField` in `vr/sim/ecology.js` already reads N and P through a Redfield
limitation, so the bloom is a consequence rather than a decoration. `W.nutrientPlume`
is a separate visible marker with a half-life, decayed sparsely — only cells that
were actually written to are visited.

Measured over 1 500 ticks at N=32: 83 surface feeders, 191 live plume cells, and
mean ocean nutrients lifted from the seeded 0.400 / 0.350 to 0.522 / 0.437.

Reef used to win every productive cell — 47% of all beings on Earth were sessile
coral sprites and nothing swam. Productive water gets swimmers now, which is also
exactly where the plume belongs.

**Best view:** the new **Nutrient plume** overlay — dark land, nutrient field in
muted green, plumes bright. Then switch to **NPP** to see the bloom the plume
caused.

## Measuring it instead of believing it

```bash
node scripts/thrive-probe.mjs --ticks=500
```

```bash
node scripts/thrive-probe.mjs --ticks=500 --fire --json
```

`--rule=terra` runs the same probe against the pinned Earth for contrast; over
500 ticks it reaches 2 settlements, `meanBuild` 0.0013, zero grazers, zero fires.

The probe prints beings by kind, behaviours, births, deaths and causes, max age,
`meanBuild`, settlements by stage, city lights, herd size, fire front, burnt
area, surface feeders, plume extent — and the clock, because a world where
`ageYr` does not move cannot grow anything.

Thirty assertions in `vr/sim/test.mjs` cover the above (`npm test` in `vr/`).
Before this, exactly one of 563 assertions mentioned an agent, a city or a
behaviour, because `agentsTick` ran on the render loop and was therefore invisible
to every test, every headless run and every save.

## 6 · Weather, lightning and volcanism

Three systems that existed and produced nothing visible.

**Cyclones had never once formed in the shipped app.** `stormsTick` builds named
storms with tracks, landfall, surge and an eye, `paintStorm` writes cloud and
rain, the storm overlay and the storm desk are wired — and genesis was closed by
three separate gates. It required a non-silent tick (so every headless run,
probe and test measured a planet with no weather); the cadence was
`(W.ageYr | 0) % 7`, the wrapped-year bug, permanently false on the pinned Earth;
and it drew **one** candidate cell per attempt from the whole planet when only
~3.5% of cells clear the favourability threshold. Combined: one storm per ~2 500
ticks.

Genesis now attempts every tick and samples twelve candidates, taking the most
favourable — a basin is a place, not a lottery ticket. Measured over 600 ticks at
N=32: up to five simultaneous storms, weather present 60–70% of the time, sixteen
distinct named cyclones, landfalls, and surge reaching 176–220 coastal cells.

That also fixed the rain. `paintStorm` writes up to 0.7 into `precip`, and with
no storms the planetary maximum was **0.003** — so the Miami NPP term in
`nppField` saw six millimetres a year everywhere and land productivity was
carried entirely by the 0.2 floor in `carryingCapacityNPP`. Peak precipitation is
0.700 now and mean precipitation is up an order of magnitude.

**Lightning** (`vr/sim/lightning.js`) is new, and it is the shared cause rather
than an effect. `fire.js` already modelled ignition as "dry lightning" and drew
nothing, so wildfires appeared out of clear ground. Now the bolt lands first,
storms throw bolts from their rainbands, and `fireTick` checks *this tick's
strikes* — a short list, no scan — and lights the ones that fell on dry fuel.
Most land on water or wet ground and do nothing, which is the point: same cause,
and the ground decides. Measured: ~340 strikes per 600 ticks, lightning visible
on 70% of ticks, bounded at 512 live flashes.

**Volcanoes** erupt about fifty times per 800 ticks and always did — but
eruptions on this planet are mostly explosive (silica above 0.58 makes ash, not
lava), and **ash reached no renderer at all**. All twelve field-texture channels
were spoken for and no branch of the surface-colour path read `ash` or `fire`, so
a caldera collapse and a continental wildfire were both drawn as nothing. Ash and
flame are painted now, in the same place lava and storms already were, and
explosive vents get an incandescent glow so a Plinian column is visible on the
night side.

**Pyrocumulus**: a fire whose front passes twenty cells seeds a storm over
itself, and the rain puts it out. One of the few loops in the model that closes
inside a minute of watching. It fired four times per 800 ticks.

**Earthquakes** were all M7.3 to M10.0 — `mag` was the strain scalar mapped
linearly onto a magnitude scale, `strain` is capped at 2 and the event fires
above 1.1. Four hundred and six of them per 800 ticks, every one larger than any
earthquake in recorded history. Magnitudes are log-frequency now
(Gutenberg–Richter, accumulated strain setting the ceiling), which gives nineteen
logged quakes instead of 406, with realistic sizes. Terrain still moves with the
strain released, not with the label.

## 7 · Seeing the animals

`entFade` used to read *"Hide sprites at orbit — Earth biomes carry the look"*:
forced to zero above alt 0.85 on any Earth-like world, and multiplied by 0.55
twice below it. So on the one world the demo is about, the animal layer was
invisible from orbit and at 30% opacity in the regional view. There is a floor
now, and `S.entGain` grows sprites with camera distance so a being stays a few
pixels across instead of shrinking to nothing — the layer thins with altitude
rather than vanishing.

Three other changes:

- Kind 7 is the large-body slot and its palette entry is Vermis purple. Grazers
  on Earth get a warm hide instead; Vermis keeps its worms.
- `W.beingDens` is published, filled on the pass `rebuildBuckets` already makes.
  The **Beings** overlay paints it, so herds and pods are findable at any zoom
  even where sprites are faint.
- **Tracks.** `noteWear` has recorded every step every being takes since before
  beings could move, and only the close-up grid ever drew it. Trodden ground now
  shows on the globe. Its decay also moved out of `presentAdvance` into
  `agentsTick`: wear is a world field, and on the render clock it faded at a rate
  set by frame rate and did not fade at all headless — the field had saturated
  across a quarter of the planet.

**New overlays:** Fire, Nutrient plume, Beings, Weather. The last is one picture
of the sky — cloud grey, rain blue, cyclone cores white, lightning yellow —
because none of the individual field overlays is what a player means by "the
weather".

## The chronicle is a history, not a syslog

With all of the above running, 800 ticks produced 3 411 chronicle entries, of
which 1 622 were "Settlers founded a village" and 406 were impossible
earthquakes. The storms, eruptions, speciations and the one mass extinction were
buried in it.

Rate limits now sit on the routine events — settlement stage crossings (towns and
cities only, first three then every twenty-fifth), spring tides, routine deaths,
ignitions — while anything unusual always logs. 800 ticks now produce ~550
entries: births and named deaths, storms forming and making landfall, fires
started by lightning, eruptions, physical earthquakes, herds, speciation,
extinction.

## The biosphere underneath all five

None of the beats above survive a dying planet, and Earth's was dying.

`bioTick` and `redoxTick` each deferred ownership of `life[]` to the other on
modern Earth — bio.js said "deep-time redox owns life[]", redox.js said "bio.js +
seedEarth own life[]" — so **nothing grew life at all**, and the cap-only branch
that was left fell through to a 5%-per-tick decay wherever the carrying cap was
under 0.05, which is the entire deep ocean (`seaCap` is 0.05 below 0.2 depth).

Measured on the **pinned calibration Earth**, 3 500 ticks:

```
             tick 0    tick 3500
sea life      0.090      0.013     -86%
land life     0.259      0.051     -80%
meanLife      0.139      0.023     -83%, still falling
```

Every one of 675 tests was green the whole time, because `calibrateEarth` runs
eight ticks and accepts `meanLife` anywhere in [0.04, 0.45] — a band wide enough
to pass a planet that has lost four fifths of its biosphere.

`useRedox` now excludes modern Earth, so bio.js owns and grows the seeded
biosphere there, and the deep-ocean guard that already existed on the deep-time
path applies to both. After the fix, over the same 3 500 ticks, `meanLife` dips
from 0.139 to 0.103 and recovers to ~0.125, oscillating with sea ice rather than
draining away.

`biosphereHolds` in `vr/sim/calibrate.mjs` is the guard: it runs 750 ticks,
checks that something is growing life at all, that `meanLife` retains ≥72% of its
early value, and that the ocean specifically has not been the part that died.
It was checked against the bug — with the fix reverted it fails on all three.

## Known, measured, not yet fixed

**The energy economy is inert.** Mean being energy is 1.16 against a 1.25 cap and
essentially every animal sits at the ceiling, so `hunger` never crosses the 0.38
threshold that starts a hunt: predation stops entirely once the population is fed
— 3 kills in 900 ticks with twenty hunters alive, and `huntKills` frozen from
tick 150 onward. Foraging gain exceeds metabolic cost by enough that energy
constrains nothing, which also makes the birth energy gate (0.68) free. Fixing it
means rebalancing metabolism against forage, and that moves births, starvation
and hunting together — it wants its own pass with its own measurements.

## What moved, and what deliberately did not

`agentsTick` and `fireTick` run inside `simTick` (`vr/world.js`), after ecology so
beings read this tick's life field, and skipped during generate's climate spin-up.
Behaviour steps per simulated year no longer depend on frame rate.

Cadence was `W.year % 40` and `W.year % 4000`. On the pinned Earth `W.year` is a
constant divisible by both, so the settlement scan and the population top-up ran
*every single tick*; on a fast clock they ran *never*. Both are on a tick counter
now.

Deliberately not touched: the night shader, the sprite atlas, the species art,
`MAX_ENT`, the 560-being cap on Earth-like worlds, and anything that would move
the golden hash or the Earth calibration. Both still pass.
