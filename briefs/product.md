# ORRERY — product

**Status:** active. Rewritten 2026-08 against the shipped WebGL prototype.  
**Companion:** [`shipped.md`](shipped.md) (engineering reality). **Priorities:** [`../NEXT.md`](../NEXT.md). **Validation:** [`../PLAYTESTS.md`](../PLAYTESTS.md).

---

## 1. Thesis

**A god game whose god is embodied.** You hold a planet. When you want to know what is happening on it, you shrink and walk in.

That second sentence is the product. Simulation depth, art, and platform serve making the descent feel inevitable.

---

## 2. Audiences

Three archetypes, one simulation. The dial is **which tools we hand you**.

| Archetype | Wants | Entry ramp (required) |
|---|---|---|
| **Vandal** | Immediate spectacular consequence in a place | ≤15 s Strike hook (Ignite / Meteor) — acquisition |
| **Gardener** | A place worth returning to; slow visible change | Return delta on reopen — retention |
| **Tinkerer** | Systems that bite; legible causality | Tour / lessons (`teach.js`) — depth |

All three ramps exist in code. Validate them with [`../PLAYTESTS.md`](../PLAYTESTS.md) (`?playtest=1`).

---

## 3. Core loop

**Observe → Perturb → Descend → Read → Return.** Target ~90 seconds.

Fails if Descend is only a camera move, or if Perturb’s result is a number instead of a place.

---

## 4. Pillars

1. **Planet is an object** — not a level with a UI border.
2. **Every number is a place** — prefer going there over a dashboard.
3. **Legible at every distance** — bands → biomes → individuals.
4. **Honesty of mechanism** beats cosmetic spectacle (see PURPOSE).
5. **Delight in the first ninety seconds** beats feature count in the dock.

---

## 5. Dark / Evil layer (not a pillar)

Kingdoms, nuclear exchange, drones, and deterrence shipped as code and an Evil desk. That is a **second product**.

- **Default:** layer off — no Evil desk, no dark war tick.
- **Opt-in:** `?dark=1` (or enable in settings when added).
- **Docs:** [`evil.md`](evil.md) describes the desk when unlocked.
- **Non-goal for the core loop:** do not pitch Dark in demos or the Tour.

Scarce vandalism without this layer: Strike tools (Ignite, Meteor, quake) already give spatial spectacle.

---

## 6. Non-goals (core product)

- Multiplayer
- Promoting Dark to a default face of ORRERY
- Hand-authored one-off planets as the content model
- Co-targeting “dashboard SimEarth” as the primary design
- Generating thousand-item backlogs instead of shipping the next 10

---

## 7. Kill criteria (still binding)

Log results in [`../PLAYTESTS.md`](../PLAYTESTS.md).

1. **Comfort** — median ≥4/5, ≤1 dropout, target n=12 (start logging before 12).
2. **Legibility** — ≥8/10 name what their perturbation did after descending.
3. **Loop** — median timed loop ≤90 s without coaching.

Fail → fix causality / comfort before adding systems. Do not absorb failure into a larger backlog.

---

## 8. Showing someone

Use [`thrive-demo.md`](thrive-demo.md) and `vr/?demo=1`. **Strike only** (Ignite /
Meteor). No Evil. First visit arms the Vandal hook automatically. Tour is for
the Tinkerer — optional on a pitch.

Playtest batch: `vr/?playtest=1` → paste rows into [`../PLAYTESTS.md`](../PLAYTESTS.md).
