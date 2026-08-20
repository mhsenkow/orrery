# The living-planet demo — how to see it

Five things should be visible within ten minutes of opening the app with the sim
running: settlement lights growing on the night side, a fire you started spreading
through forest with smoke ahead of it and animals running from it, a herd moving
with one heading, and a nutrient plume where marine animals surface-feed.

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
tick  builtFrac  meanBuild  lights  settlements
 150    0.0266     0.0132    0.303      45
 450    0.0419     0.0153    0.392      45
 900    0.0627     0.0197    0.513      44
1350    0.1152     0.0317    0.816      42
1500    0.1365     0.0357    0.935      42
```

At roughly eleven ticks a second that is a night side that brightens steadily for
four to five minutes. First settlement at tick 9; first light at tick 9.

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

Grazers (kind 7, the largest base sprite scale) now exist on open ground where
animals are unlocked, and they are **seeded as groups**: `writeHerd` in
`vr/agents.js` writes four to eight animals into a cell and its neighbours.
A herd seeded one animal at a time never forms — cohesion only sees a cell and
its four neighbours, and 560 beings over 24 576 cells is a 2% density.

The clump code had cohesion and separation but no alignment, so a group had no
heading and milled. It averages neighbours' heading vectors now
(`m.hx/hy/hz`, a smoothed tangent), which is what reads on screen as a herd
rather than a crowd. Fire in or next to the cell sets `panic`, and a panicked
animal in a herd of four or more moves with probability 0.92 instead of 0.4 —
that is the stampede.

One other change made this stick: kind used to be re-derived from the destination
cell on every step, so a grazer that walked into a forest cell was **redrawn as a
tree**. Animals keep their kind now (`isAnimalKind`); vegetation sprites still
track the biome they stand in.

A group of eight or more gets a line in the chronicle, at most once per 120 ticks.

**Best view:** zoom in until sprites separate, or open the local grid. Measured
peak herd: 9 (the neighbour scan caps at 8 companions).

## 4 · The nutrient plume

Kind 15 swimmers in water with `npp > 0.22` take a `surface` behaviour — distinct
from `forage` because it is the one that writes the plume. `bumpNutrient` raises
`nutrientN`, `nutrientP` and a small direct `life` pulse in the cell and its four
neighbours, scaled by body size when the lineage expresses a plan.

`nppField` in `vr/sim/ecology.js` already reads N and P through a Redfield
limitation, so the bloom is a consequence rather than a decoration. `W.nutrientPlume`
is a separate visible marker with a half-life, decayed sparsely — only cells that
were actually written to are visited.

Measured over 500 ticks at N=32: 63 surface feeders, 400 plume cells, peak 0.94,
mean N lifted from the seeded 0.400 to 0.423 and P from 0.350 to 0.367.

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
