# ORRERY — Product Design Brief

**Author:** M. Senkow · Product Design, IC10
**Status:** Draft for review
**Date:** 2026-08-08
**Companion doc:** `engineering-brief.md`
**Reviewers:** Engineering, Research, Art Direction, Audio, Accessibility

> Format note: this is written in the house style of a Meta/Google staff-plus product brief — thesis, bets, non-goals, kill criteria, asks. It is an internal proposal document, not an approved program.

---

## 1. Thesis

**A god game whose god is embodied.** You hold a planet in your hands. When you want to know what is actually happening on it, you shrink and walk in.

That second sentence is the entire product. Everything downstream — the simulation depth, the art pipeline, the platform choice — is in service of making the descent feel inevitable rather than menu-driven.

---

## 2. Why this, why now

**The category is dormant and the appetite is proven.** SimEarth (1990) established planetary simulation as a genre and then nobody meaningfully advanced it for thirty-five years. WorldBox — a 2D pixel map with sprite agents and almost no production value — has sold millions of copies. The demand signal is unambiguous and the supply is a decade behind.

**VR has exactly one superpower that flat screens cannot replicate: scale.** Not immersion, not presence, not 6DoF input — *scale*. The felt difference between holding something and standing inside it. God games are, definitionally, games about being large. This is the single clearest genre/platform fit in VR and nobody has cashed it in.

**The art cost that historically killed this genre is now avoidable.** Planetary sims need thousands of visually distinct entities. That used to require an art department. Vector-native entity art plus procedural rulesets means a small team can ship breadth. See §7.

**The hardware finally clears the bar.** Standalone headsets can now hold 90Hz while running a real simulation, which was not true two generations ago. See the Engineering Brief for the budget analysis and the honest caveats.

---

## 3. Who this is for

Three archetypes, one simulation. The dial between them is **which tools we hand you**, not which content we build.

| Archetype | Reference | Wants | Fails if |
|---|---|---|---|
| **The Tinkerer** | Kerbal, Factorio, Dwarf Fortress | Systems that bite back; legible causality | The sim is decorative — inputs don't propagate visibly |
| **The Gardener** | Animal Crossing, Terrarium, Viridi | A place worth returning to; slow change | Sessions demand constant input; nothing persists meaningfully |
| **The Vandal** | WorldBox, Powder Toy | Immediate spectacular consequence | Destruction is abstracted into a number instead of a place |

The Vandal is the acquisition channel (it clips well). The Gardener is the retention engine. The Tinkerer is who writes the wiki and keeps the game alive for four years. We need all three, and the same simulation serves all three if — and only if — consequences are **spatial** rather than statistical.

---

## 4. Core loop

**Observe → Perturb → Descend → Read → Return.** Target: ~90 seconds, repeatable indefinitely.

1. **Observe (orbital).** Planet at chest height, roughly 40cm across. You spin it, you see climate bands, ice extent, where life has taken hold.
2. **Perturb.** One deliberate act: raise a landmass, tilt the axis, drop a rock, seed a species.
3. **Descend.** You go *look*. This is the beat that doesn't exist in any prior game in this genre.
4. **Read.** At surface scale you see what your perturbation actually did — a coastline drowned, a herd migrating, a forest at its new treeline.
5. **Return.** Back to orbital with new intent.

The loop fails if step 3 is a camera move. It has to be a *journey*, and it has to be cheap enough to do forty times an hour.

---

## 5. Design pillars

### P1 — The planet is an object, not a level.
It has a location in your room. It occludes. You can lean around it. You can set it down. It keeps running when you aren't looking at it. Everything that makes a level feel like software — a fixed frame, a UI border, a pause state — is disallowed.

### P2 — Every number is a place.
No dashboards, no graphs, no stat panels. If you want to know the ocean temperature, you go put your hand in the ocean. This is the constraint that forces the descent loop to carry real informational weight instead of being a scenic detour. It is also the constraint the team will push back on hardest, repeatedly, for two years. Hold it.

### P3 — Legible at every distance, at a different resolution of truth.
From orbit you see *bands*. From 5km you see *biomes and borders*. From 50m you see *individuals*. Each altitude tells the truth; none tells the whole truth. Zoom is the primary information architecture — see §6.

---

## 6. The scale transition — the make-or-break

**This is the riskiest interaction in the product and everything else is downstream of it.**

Two stable anchors:
- **Orbital:** planet is a ~40cm sphere at chest height, arm's reach, you are outside it.
- **Surface:** planet is the horizon, you are 1.7m tall, standing on it.

The problem is the ~1,000,000× scale change between them. Three candidate mechanics:

**A. Pull-through.** Grab a point on the surface and pull it toward your face; the planet grows around you and swallows you. Continuous, no cut, maximally magical. **Risk:** continuous self-scaling is a known vection hazard — the visual field expands while the vestibular system reports nothing.

**B. Pinch-and-step.** Pinch a location; a diorama window opens in front of you; you step through it. Discrete, comfortable, well-understood. **Risk:** breaks the "one continuous world" feeling and re-introduces the sense of a level being loaded.

**C. Telescope.** The planet never changes scale; a held lens shows surface view. Maximally comfortable. **Risk:** loses the entire payoff. This is the flat-screen game with a headset strapped on.

**Recommendation:** prototype A and B head-to-head in week one, before any simulation work exists. Bet on **A with aggressive comfort treatment** — a hand-locked reference frame that stays rigid through the transition, ~350ms, snap-eased, with peripheral vignetting — and ship **B as both the fallback and the permanent accessibility setting.**

**Gate:** if neither transition survives a 20-minute session without discomfort in a n=12 study, this is a flat-screen game and we should know that in week two, not month eight.

### Progressive disclosure ladder

| Altitude | Metaphor | Renders | You can | Sim layer surfaced |
|---|---|---|---|---|
| **Orbital** (planet ≈ 40cm) | Snow globe | Climate bands, ice caps, ocean/land, night lights | Spin, tilt axis, drop impactors, adjust solar constant | Tectonics, climate, albedo |
| **Regional** (~2,000km view) | Relief map | Biomes, rivers, coastlines, territory borders | Paint terrain, seed species, raise/lower land | Hydrology, biome CA, species range |
| **Local** (~20km) | Diorama | Settlements, herds, forest stands, weather cells | Place, remove, redirect | Agent populations, migration |
| **Surface** (1.7m) | Standing there | Individual entities, ground texture, sky | Observe, pick up, listen | Individual agents, audio |

This ladder is *identical* to the renderer's LOD tree. One mechanism, two jobs — that's not a coincidence, it's the design constraint that keeps this affordable (see Engineering Brief §5).

---

## 7. Visual language: extruded vector

Entities are flat vector shapes extruded 2–4mm into thin slabs. Pop-up-book silhouettes on a real terrain.

Why this is the right call, not an art compromise:

- **Crisp at every zoom.** A vector tree is correct at 40cm and at 40mm. This is literally the progressive-disclosure thesis expressed as an asset format.
- **Stereo-correct.** Pure camera-facing billboards are the single most common VR art failure — at arm's length, stereo vision makes flatness obvious in a way a monitor conceals. A 3mm extrusion fixes it entirely and costs nothing.
- **Evolution becomes interpolation.** A species mutating is a path morph and a palette shift, not a new asset. Speciation across a thousand-year sim is generated, not authored.
- **Breadth without headcount.** Thousands of visually distinct entities from a few dozen authored path families.

Art direction: deliberate paper-diorama, not "we couldn't afford models." The commitment has to be total — terrain, water, and clouds all need to sit in the same material language or the entities read as an asset-store mistake.

---

## 8. Ruleset as the content unit

We are not shipping "infinite planets." We are shipping **infinite seeds × authored rulesets**, and the ruleset is the thing we actually make.

A ruleset is: a set of CA equations, a biome table, a palette, an entity family, and one **signature phenomenon** that exists nowhere else.

Launch set (4):

| Ruleset | Chemistry | Signature phenomenon |
|---|---|---|
| **Terra** | Water / carbon | Glacial cycles |
| **Vermis** | Silicate, no free water | Apex megafauna that reshape terrain as they move |
| **Selene** | Airless | Everything is thermal shock and impact history |
| **Ares** | Thin CO₂ | Dust storms that eat a hemisphere |

Ten thousand procedural planets under one ruleset is a screensaver. Four rulesets × infinite seeds is a game. **A ruleset is roughly a designer + engineer for three weeks** — that's the content cadence and the live-ops story.

---

## 9. Non-goals for v1

Explicitly out of scope. Each of these has killed a comparable project.

- **Multiplayer.** Not in v1, and the architecture should not be contorted to preserve the option.
- **Kingdoms, war, diplomacy.** WorldBox's core. We are closer to SimEarth. Adding a civ layer before the planet layer is proven is how this becomes a mediocre 4X.
- **Hand-authored planets.** If a planet needs an artist, the ruleset is wrong.
- **Universal voxel destructibility.** Digging is scoped to where it earns its cost (see Engineering Brief §6).
- **Flat-screen as a co-target.** A flat build is a port after ship, not a parallel design constraint. Co-targeting will silently convert P2 into a dashboard.

---

## 10. Risk register (design)

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| D1 | Scale transition causes discomfort in all variants | **Critical** | Week-1 head-to-head prototype; hard gate before any sim work |
| D2 | Simulation is invisible — players can't perceive causality | **High** | Every perturbation must produce a visible spatial change within 60s of sim time; instrument this as a metric, not a vibe |
| D3 | Sessions have no shape; players bounce after novelty | **High** | Ruleset-specific "pressures" (an ice age arriving, a worm migration) supply pacing without a quest system |
| D4 | P2 (no dashboards) proves unusable for the Tinkerer | **Medium** | Diegetic instruments: a held thermometer, a core sample. Instruments are objects, not overlays |
| D5 | Paper-diorama style reads as cheap rather than intentional | **Medium** | Total material commitment; a strong lighting/atmosphere pass is what sells it |
| D6 | Procedural planets feel same-y | **Medium** | §8 — invest in ruleset count over seed variety |

---

## 11. Slice-1 kill criteria

The first vertical slice exists to answer three questions. It is not a demo.

1. **Comfort.** Median comfort ≥ 4/5 across n=12 in a 20-minute session, ≤ 1 dropout. *Fails → flat-screen pivot or Variant B only.*
2. **Legibility.** ≥ 8/10 naive participants can correctly describe what their own perturbation did, unprompted, after descending. *Fails → the sim is decorative; rework causality before adding systems.*
3. **Performance.** 90Hz held with sim running, no dropped frames over 10 minutes. *Fails → see Engineering Brief §8 platform decision.*

Everything else — rulesets, agents, digging, persistence — is deferred until all three pass.

---

## 12. Asks

- **Week 1–2:** 1 designer + 1 engineer, scale-transition bake-off. No other work starts.
- **Slice 1 (~10 weeks):** 1 PD, 1 tech artist, 2 engineers (see Engineering Brief §9 for the split).
- **Research:** n=12 comfort study slotted for week 3; a second at slice-1 exit.
- **Decision needed from Eng by end of week 1:** target platform (standalone vs. PC-tethered vs. WebXR). This changes what §7 and §8 can afford and I can't finalize the art budget without it.

---

*Open question I do not have a position on yet: whether the planet persists in the player's physical room via passthrough between sessions — a real object on a real table — or lives in a rendered void. The former is a much stronger retention story and a much harder lighting problem.*
