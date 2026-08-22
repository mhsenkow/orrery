# ORRERY

Embodied god-game prototype: hold a planet, shrink, walk in.

[![Orrery — Earth sandbox](site/img/earth-hud.png)](https://mhsenkow.github.io/orrery/vr/)

[Open the live prototype](https://mhsenkow.github.io/orrery/vr/) — drag to spin, scroll to zoom. WebXR on a headset if you have one.

**Showing someone:** [living demo](https://mhsenkow.github.io/orrery/vr/?demo=1) (`thrive` Earth). First visit offers a Strike act (Ignite / Meteor) — not Evil. See [`briefs/thrive-demo.md`](briefs/thrive-demo.md).

**Playtest batch:** [`vr/?playtest=1`](vr/?playtest=1) — times the 90s loop, copies a row for [`PLAYTESTS.md`](PLAYTESTS.md).

## Docs

| Doc | Role |
|---|---|
| [`PURPOSE.md`](PURPOSE.md) | Why it exists; four faces; Dark is optional |
| [`NEXT.md`](NEXT.md) | **Only** prioritized backlog (next 10) |
| [`CLAUDE.md`](CLAUDE.md) | Agent orientation (<100 lines) |
| [`PLAYTESTS.md`](PLAYTESTS.md) | Comfort / loop / legibility log |
| [`briefs/product.md`](briefs/product.md) | Product |
| [`briefs/shipped.md`](briefs/shipped.md) | What the code actually is |
| [`briefs/model-limits.md`](briefs/model-limits.md) | Honesty boundary |
| [`site/`](https://mhsenkow.github.io/orrery/site/) | Public “what / do / why” page |

Retired wishlist backlogs and the Unity engineering fiction: [`briefs/RETIRED.md`](briefs/RETIRED.md).

## Local

```bash
python3 -m http.server 8765
# http://localhost:8765/vr/
```

```bash
npm ci                          # root: eslint / prettier / tsc
npm run verify                  # lint + format:check + typecheck + fields:report + test:fast (~8s)
npm test --prefix vr            # fast tier (<18s); full: test:full · long holds: test:sweep
npm run fidelity --prefix vr    # provenance + calibrate + golden + parity
npm run golden --prefix vr
```

Agent orientation: [`CLAUDE.md`](CLAUDE.md). Cold-start notes: [`briefs/cold-start.md`](briefs/cold-start.md). Suite costs: [`briefs/test-timing.md`](briefs/test-timing.md).

## Data compilers (not backlogs)

World/life tables are authored JSON compiled into `vr/sim/`. Edit sources, then:

```bash
node scripts/data.mjs           # all world compilers + site/world-data.html
node scripts/worlds.mjs         # vr/catalogue.js
node scripts/lifegrammar.mjs
node scripts/substrates.mjs
node scripts/cover.mjs
node scripts/landgram.mjs
node scripts/columns.mjs
node scripts/worlddef.mjs
node scripts/epochs.mjs
node scripts/techno.mjs
node scripts/fleet.mjs          # site/fleet.html contact sheet
node scripts/capture-site.mjs   # site/img/*.png — needs the local server
```

## Optional Dark layer

War / Evil desk is **off by default**. Unlock with `?dark=1`. Do not demo it as the product front door.
