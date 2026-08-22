# Playtests

Audience validation for the 90-second loop and PD kill criteria.
No claim about comfort, legibility, or “the descent works” without a row here.

## Protocol (minimum)

| Field | Record |
|---|---|
| Date | ISO date |
| Build | git short SHA or `vr/` note |
| Platform | flat / Quest / other |
| n | participants this session batch |
| Length | median minutes |
| Comfort | median 1–5 (5 = fine); dropouts |
| Loop | timed Observe→Perturb→Descend→Read (seconds) if measured |
| Legibility | could they name what *their* act did, unprompted? (yes/partial/no) |
| Hook | which first act (Ignite / Meteor / other) |
| Notes | one paragraph max |
| Decision | ship / fix / kill / pivot |

**Hard gates**

1. Comfort — median ≥4/5, ≤1 dropout in a 20-minute session (target n=12; start logging before 12).
2. Legibility — ≥8/10 correctly describe their own perturbation after descending (≥⅔ for early batches).
3. Loop — median timed loop ≤90 s without coaching.

If a gate fails, write the decision in the row. Do not absorb failure into a larger backlog.

---

## Instrumented run (`?playtest=1`)

```text
http://localhost:8765/vr/?playtest=1
# or demo + playtest:
http://localhost:8765/vr/?demo=1&playtest=1
```

1. Overlay times the loop from first Strike act to local-map descend.
2. Asks comfort 1–5 and place-legibility (yes / partial / no).
3. **Save row + copy** puts a markdown table row on the clipboard — paste below.

Do not invent rows. Human sessions only.

---

## Script (flat-screen, ~20 min)

1. Open [`vr/?demo=1`](vr/?demo=1) — or `?playtest=1` for the timer.
2. Do **not** coach past “drag to spin, scroll to zoom.” Strike only — never Evil.
3. One act (Ignite or Meteor).
4. Descend / open the local map.
5. Ask: “What did you change?” — write their words.
6. Rate comfort; note session length; stop.

---

## Platform decision — flat-screen first

**Date:** 2026-08-21  
**Decision:** **pivot** — ship and playtest as **flat desktop/mobile** first. WebXR remains optional.

**Why:** headset n≥12 comfort cohort has not run; the 90s loop, Strike hook, and Lab instruments already ship on flat. Pretending Quest-first blocks the only audience we can recruit today.

**What this does not kill:** WebXR path stays in tree; comfort gates in the protocol still apply when a headset cohort appears.

**Next human work:** paste ≥6 flat-screen rows into the Log below using `?playtest=1`.

---

| Date | Build | Platform | n | Length | Comfort | Loop s | Legibility | Hook | Notes | Decision |
|---|---|---|---|---|---|---|---|---|---|---|
| — | — | — | 0 | — | — | — | — | — | Harness shipped (`?playtest=1`). No human sessions yet. | open |
