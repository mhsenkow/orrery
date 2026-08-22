# The Evil desk — harm with an author

**Gate:** optional Dark layer. Off by default. Unlock with `?dark=1` (or
`localStorage.orrery.dark = "1"`). Not one of PURPOSE’s four faces — do not demo
it as the front door. See [`product.md`](product.md) and [`../NEXT.md`](../NEXT.md).

Everything on the Strike desk is something a **planet** does to itself. A rock
arrives. A fault slips. A plume rises. It is all enormous and none of it has an
author, and after a while that gets morally weightless: you are pressing
*Meteor* on a world, not doing anything to anyone.

This desk is the other half. Same globe, same fields, same tick — but every verb
here has a return address, and the planet's own machinery carries the
consequence. That is the whole design constraint: **no new damage scalar.** Harm
lands in `life`, `build`, `fire`, `ash`, `nutrientN/P` — fields that the
biosphere, the settlements, the animals and the renderer already read — so
nothing downstream had to be taught what a warhead is.

**Where (when unlocked):** Tools → **Evil** (beside Strike).

---

## Why four hazards and not one damage field

Because "damage" is not one thing, and the interesting part is that they *decay
differently*. The half-lives are the design:

| | half-life | kills | ends because |
|---|---|---|---|
| `toxin` | ~460 ticks | slowly | it breaks down, eventually |
| `rad` | ~2 770 ticks | fast, then never | it decays, on a timescale longer than the civilisation |
| `warFront` | ~38 ticks | what is built | somebody wins, or there is nothing left |
| `disease` | ~24 ticks in a cell | people | it runs out of the susceptible |

A war is over inside a session. A poisoned valley is still poisoned when you have
forgotten you poisoned it. Fallout is still there when the city that made it is a
ruin under grass. One number could not have said any of that.

All four live in `vr/sim/anthro.js` and all four are **sparse**: a planet nobody
has attacked costs four array-length checks a tick. Cost scales with the poisoned
area, never with the world.

---

## 1 · Toxin spill

`pourToxin` — a sick yellow-green stain that **creeps downhill and downstream**
(twice as fast in water), takes `life` down by a few per cent a tick, and strips
`nutrientN/P` so the ground stays poor after the poison has gone.

The point of this one is that it does not look like anything. There is no crater
and no fire. You have to open the **Toxin** overlay to find out how far it went,
and by then it is in the river.

## 2 · Nuclear waste

`irradiate` — small, lethal now, and **uninhabitable for thousands of ticks**.
It kills `life` about twice as fast as toxin and it also decays `build`, because
nobody maintains a house in a hot zone. Settlers avoid it, animals flee it.

Bury it and come back in twenty minutes of play. It will still be there.

## 3 · Warhead (placed by hand)

`detonate(payload: 'nuclear')` — no flight, no interception, no warning. The
signature is layered on purpose so the picture tells the story in order:

1. a **flash** (`W.flash`, the same field lightning uses)
2. a **fire ring** ignited a cell out from the centre
3. a **crater** — `h` down at the middle
4. **ash** falling out to the blast radius
5. **fallout** with the long half-life
6. and the **grid goes down** across the hemisphere

That last one is the one that lands emotionally, because the night side is where
you have been watching the lights grow. `cityLights` returns **0** while
`_empUntil` holds, so the thing you built goes dark in the same frame as the
flash.

## 4 · ICBM, SLBM, drone strike, drone swarm

These are the first objects in this simulation with a **journey**.

Nothing here has ever travelled. Storms move and herds move, but every act a
player could take landed instantly on the cell they clicked. A missile launches
from one place, crosses the globe over a dozen ticks leaving a visible track, and
**may never arrive**.

`vr/sim/ordnance.js`. Click the **target**; the launcher picks its own silo — the
most built-up place far enough away to be somebody else, which is also the honest
reading of who owns an ICBM. Paths walk the cube-sphere's four-connected grid
greedily toward the target: not a great circle, within a cell or two of one, and
a handful of dot products instead of trigonometry.

| | speed (cells/tick) | stealth | payload |
|---|---|---|---|
| ICBM | 3.0 | 0.00 | nuclear, MIRV ×2 |
| SLBM | 4.5 | 0.45 | nuclear |
| cruise | 1.6 | 0.62 | conventional |
| drone | 1.1 | 0.78 | conventional |

**And the drones fight them off.** `defenceAt` is not a field — it is whatever is
built nearby, scaled by how advanced the planet is (`unlockedClass`). A
pre-industrial world cannot intercept anything. Empty country cannot either.
Which means the missile aimed at a **city** is the one that gets shot down, and
the missile aimed at wilderness always lands.

Interception is rolled **per tick of flight** over defended ground, so a long
approach across a defended continent is genuinely more dangerous for the attacker
than a short one over open sea — which is the entire argument for a submarine,
arrived at from the mechanics rather than asserted.

A kill is its own visual: a bright burst mid-flight, a counter-track from below,
and a chronicle line naming what was stopped and how far short.

**Saturation.** Every interception uses up capacity (`_defFatigue`, recovering
~3.5% a tick). Without it a densely settled planet is simply invulnerable —
`defenceAt` is non-zero anywhere near `build`, a settled continent is defended
along the whole approach, and the first version stopped five ICBMs out of five at
a city with defence 1.00. Saturation is the real logic and the more interesting
one: the first missile is stopped and the tenth is not, so a salvo is a different
weapon from a shot.

Measured, demo Earth at N=32 after 700 ticks, against a city at defence 1.00:

```
 1 × ICBM   → stopped 1, through 0
 4 × ICBM   → stopped 3, through 1
12 × ICBM   → stopped 5, through 7      ← saturated
 1 × SLBM   → stopped 0, through 1      ← stealth 0.45
 6 × drone  → stopped 3, through 3
```

A single shot at a defended city is a waste of a warhead. A salvo is not. A
submarine does not care. None of that was designed as a rule — it falls out of
per-tick interception, stealth, and a defence that runs out of interceptors.

And it degrades as it is used: firing the whole desk at one target in sequence,
the reported defence falls **33% → 24% → 15% → 6%** as each strike destroys more
of the `build` that was providing it.

## 5 · Engineered plague

`seedDisease` — the only hazard here that **ends on its own**, and the only one
with a real internal model.

It travels **between settlements, not across ground**: a cell infects its
neighbours in proportion to how populated *they* are, plus occasional jumps along
what amount to trade routes. So an outbreak follows the settled corridors and
stalls at empty country. `W.immune` is the burnt-through susceptible pool, which
is what actually ends an epidemic — and it **fades**, so the same disease can
come back a few centuries later.

Measured arc on the demo Earth: peaks at **117 infected districts**, 163 immune,
destroys 64 units of `build` — then burns out, and the survivors rebuild past
where they started. That full curve, sweep → die-off → burnout → recovery, is
visible in the **Plague** overlay, which paints it as an SIR picture: hosts grey,
the sick red, the immune green.

## 6 · Open a war

`openWar` — a **moving front**, not a stamp. Each tick it walks toward the other
side, preferring cells that are worth taking (`build`), and where it sits it
unbuilds, sets fires, and occasionally leaves chemicals behind. Reaching the
objective flips the front around and the counter-push begins at reduced strength.

It ends because `WAR_KEEP` runs it down or because there is nothing left to fight
over. Six simultaneous fronts is the cap, and the code says why: *six fronts is
already too many*.

## 7 · Solar flare

Not new — `stellarFlare` has been in `god/disaster.js` all along. It was **two
lines against `W.ozone` and a receipt**: the most dramatic thing a star can do to
a planet, and the screen did not change.

It does four things now, and all four are visible:

- the sunlit limb **washes out** for a few ticks (`W.flareGlow`)
- **aurora** reach far past their usual latitudes, and how far depends on the
  magnetosphere — `auroraLat` drops to 0.20 for a magnitude-1.8 flare, which is
  aurora in the tropics
- the **grid goes down**, so the night side goes dark exactly when it is
  brightest
- a **radiation storm** reaches the ground where the field is weak

That last one needed care. The first version keyed the ground dose off
`auroraLat` and irradiated **78% of the planet through an intact
magnetosphere** — Carrington-class aurora reached the tropics on an Earth whose
surface dose barely moved. The dose now scales as `(1 − shield)²` and is confined
near the poles: Earth takes **none**, and Ares (magnetosphere 0.05) takes it
seriously. The test asserts both directions.

---

## Impacts, redrawn

The two existing arrival events wrote a complete account of the **aftermath** and
no account of the **event**. `strikeImpact` moved height, temperature, life, dust
and ejecta; Ice meteor was a paint stroke over `temp` and `iceLand`. A rock
crossing the sky and hitting the ground looked like a change of ground colour.

Both now get:

- an **entry track** along the incoming bearing, walked backwards up the
  trajectory and brightest near the ground, because the rock is heating up as it
  comes in — and it uses `W.tracer`, the same field a missile uses
- a **flash** at contact — `W.flash`, the same field lightning uses
- **impact melt**: the crater floor glows and then cools like any other lava

Three existing fields, no fourth. The oblique-ejecta asymmetry `strikeImpact`
already computed is what aims the entry track, so the trajectory and the ejecta
pattern finally agree with each other.

---

## What the overlays show

| overlay | reads |
|---|---|
| **Fallout** | `rad` — violet-white, the long-lived one |
| **Toxin** | `toxin` — the yellow-green stain, and how far downstream it got |
| **Plague** | `disease` red, `immune` green, hosts grey — a live SIR picture |
| **War** | `warFront` char plus every tracer in the air |

Plus the surface itself, with no overlay: toxin stains, fallout bleaches, plague
rusts the settlement it is eating, war chars and craters, tracers are cold
blue-white (deliberately unlike lightning's warm yellow, so a missile track and a
thunderstorm are never confused), aurora is green at the poles, and a flare
whites out the disc.

---

## Cost and honesty

Every tool is priced in `thermoCost`, carries a `forecastAct` slope and issues a
receipt. The forecast slopes are worth reading side by side, because they say
something the names do not:

```
poison   life -0.02    ← barely moves the planetary average
waste    life -0.01    ← barely moves it at all
nuke     life -0.09
pandemic life -0.12    ← the worst number on the desk
```

Poison and waste are *devastating locally and invisible globally*. A pandemic
never leaves a crater and does more damage than a warhead. That asymmetry is the
argument for having them as separate verbs instead of one **Destroy** slider.

Cooldowns: warhead 200 yr, ICBM/SLBM 300, war 2 kyr, pandemic 5 kyr, flare 500.
The `vandal` archetype gets 30% off all of it, which is either a discount or a
diagnosis.

The **pinned calibration Earth is not exempt from any of this** — unlike wildfire,
which is, because dry lightning would drift the Holocene snapshot on its own. An
act with an author only happens when someone chooses it, so there is nothing to
drift.

---

## The ten tools, through the real dispatch

Every one of them priced, forecast, receipted, and reporting in the app's voice:

```
poison     Poured. Nothing looks wrong yet — that is the point
waste      Buried here. It will outlast whoever buried it
nuke       Detonated. The lights are going out
icbm       Away — 1 inbound, 10 ticks out. They will try to stop it (33%).
slbm       Away — 1 inbound, 21 ticks out. They will try to stop it (24%).
airstrike  Away — 1 inbound, 19 ticks out. They will try to stop it (15%).
swarm      Away — 6 inbound, 29 ticks out. They will try to stop it (6%).
pandemic   Released. It will follow the roads
war        Declared. The front will move on its own now
flare      The star flares — grid down, aurora to the tropics
```

Each has its own 16×16 line icon. `iconSVG` falls back to the magnifying glass
for an unknown id — silently, because a fallback is not an error — so without
them the entire desk rendered as ten identical Inspect buttons.

## What it costs to run

Nothing, on a planet nobody has attacked. Profiled at N=64 over 150 ticks,
`anthro.js` and `ordnance.js` do not appear in the CPU profile at all: both
early-out on empty active lists. `lightning.js` and `storms.js` come in at 0.02%
each.

One thing did cost. The hazard penalty added to the movement scorer read three
optional-chained typed arrays *per being per neighbour* — about 6 700 probes a
tick, on fields that were all zero. It is behind a single `_anyHarm` boolean now,
set once a tick from the sparse hazard counters.

## Testing it

`npm test` in `vr/` — slice H. Thirty-odd assertions covering: the desk exists
and is priced; toxin creeps and outlasts a war; fallout is still there 300 ticks
later; radiation kills faster than poison; an epidemic spreads past its seed,
immunises survivors, costs the civilisation and burns out; a war's front moves,
unbuilds and ends; a launch takes time, leaves a track that fades, is sometimes
intercepted and sometimes lands; a defended city defends itself and an undefended
one cannot be saved; a burst takes the grid down; a flare whites out the disc and
drives aurora to the tropics but does **not** dose a shielded planet, while a bare
one takes a storm; impacts draw an entry track, a flash and a molten floor; and
animals flee a hot zone.

The generate-reset digest test picks up new `W` fields automatically, which is how
`beingDens` and `fireDangerMax` were both caught leaking across worlds earlier —
it will catch `toxin`, `rad`, `disease`, `warFront`, `immune`, `tracer`, `flight`
and `wars` the same way.
