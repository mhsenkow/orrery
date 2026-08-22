# What actually ships

**Status:** living description of the codebase (2026-08).  
**Replaces:** the Aug 8 `engineering-brief.md` Unity / ECS / 10-week Slice-1 plan — that document is retired fiction.

Companion product intent: [`product.md`](product.md). Limits: [`model-limits.md`](model-limits.md). Priorities: [`../NEXT.md`](../NEXT.md).

---

## Platform (reality)

| Brief said | Reality |
|---|---|
| Unity standalone, jobified ECS agents, GPU field compute as the bet | **WebGL2 + JavaScript** under `vr/`, GitHub Pages |
| WebXR “for prototypes, not ship” | WebXR is optional; **flat desktop/mobile is the shipped surface** |
| Slice 1 with no agents (~10 weeks) | Agents, herds, cities, fire, god tools, catalogue — already in tree (~80k+ LOC) |
| Cube-sphere N=256 GPU textures | Cube-sphere with **runtime N** (32 / 64 / 96); CPU sim + optional GPGPU climate |

Do not staff or schedule against the retired brief.

---

## Architecture (what exists)

```
vr/
  main.js, render.js, world.js, tools.js, agents.js, …
  sim/          field tick, life, god, climate, anthro, …
  sim/gpgpu/    optional float-FB climate
  sim/god/      brush, receipts, economy, scenarios
  data/         authored JSON (worlds, life, techno) → compiled modules
scripts/        data compilers + catalogue emitter (not wishlist generators)
```

- **Grid:** cube-sphere, seam-aware neighbours, area weights where conserved quantities need them.
- **Tick:** adaptive `dtYr`; bio/redox/phylogeny on CPU; climate on GPU when float framebuffers exist.
- **God layer:** tools dock (Land / Life / Strike / Climate / Sample); receipts and thermo scarcity.
- **Dark / Evil:** war, ordnance, deterrence, diplomacy modules — **optional product layer**, off by default (`?dark=1`). See PURPOSE.

---

## How to run

```bash
python3 -m http.server 8765
# http://localhost:8765/vr/
npm test --prefix vr
```

WebXR needs HTTPS or localhost.

---

## Regenerating data (not backlogs)

```bash
node scripts/data.mjs       # world compilers + site/world-data.html
node scripts/worlds.mjs     # vr/catalogue.js only
node scripts/lifegrammar.mjs
# … other compilers listed in README
```

Wishlist backlog emitters were removed. Work order lives in [`../NEXT.md`](../NEXT.md).

---

## Earth-fidelity gate (2026-08-21)

First 25 from [`earth-fidelity-500.md`](earth-fidelity-500.md) landed as tooling:

| Area | Shipped |
|---|---|
| **A** | `scripts/provenance.mjs` (+ ratchet, `vr/data/provenance.json`), `vr/sim/units.js`, generated provenance block in model-limits |
| **B** | `calibrateWorld`, `vr/data/baselines/*`, `scripts/calibrate-all.mjs`, Earth reference freeze, B86 failure messages |
| **C** | `scripts/parity-climate.mjs`, shared `waterInventory`, `craterCounts` → `stampCraters` (airless / authored) |
| **D** | `briefs/determinism.md` audit, save **v9** + version reject, `vr/data/golden.json` corpus, `vr/sim/run.js` Run object |
| **E** | `vr/sim/scheduler.js` timing ring + degradation order, Lab tick ms, `_rate` pattern retained |

Commands: `npm run provenance|calibrate:all|golden:corpus|parity|determinism|fidelity --prefix vr`.

### Second wave (same day)

| Item | Shipped |
|---|---|
| A8–A10 | `terraParams.js` + tagged-module `atmo.js` / `hydro.js`; rulesets palettes `@provenance look` |
| B21–B25 | Tightened Earth `TOL` + `baselines/earth.json` |
| A88 | Lab limits summary (`limitsSheet.js`), once per session |
| Picture | Orbit night/life + snow-line readable without Lab |
| Garden | Named place delta (`… on {worldName}.`) |
| CI | `npm run fidelity` bundles provenance + calibrate + golden + parity |

### Third wave (same day)

| Item | Shipped |
|---|---|
| A11–A13 | `carbon.js` / `evolve.js` tagged-module; `redox` GUILDS all `tag:`; hotspot assert green |
| B46/B48 | Ares `sterile: true` — no sparse nuclei / no origin; Mars baseline `meanLife≈0` |
| Baselines | Vermis + Daisy smoke; Selene tightened; `calibrate-all` 6/6 |
| D50 | Receipt **What if I hadn’t** (undo snap) + **Fork twin** (`applyRun`, land kept, RNG forked) |
| E24 | HUD `sim reduced: …` from `W._degraded` |
| A82 | Lab provenance chip (`provenanceChipText`) |
| Descent | `localCue.js` motion on vandal finish / local expand |
| Pivot | Flat-screen first recorded in [`PLAYTESTS.md`](../PLAYTESTS.md) |
| Ratchet | Provenance baseline ~97.6% untagged share |

### Fourth wave (same day)

| Item | Shipped |
|---|---|
| B49/B52/B55 | Type rulesets `venus` / `titan` / `europa` + baselines; calibrate **9/9** |
| B46 | Ares `surfacePressureBar: 0.006` + cooler solar — meanTemp ~0.30 (was ~1.14) |
| D50 shelf | Lab **Forked runs** list + load by id |
| Descent | `localMotionCue(…, prefer)` keyed off Ignite/Meteor/etc. |
| Provenance | Skip generated `substrates` / `worldDef` / `earthRecord`; resolution `@provenance look` |
| E49/E46 | Lazy fossil slots; reused redox relax plan buffer |
| CI | `.github/workflows/fidelity.yml` + optional `parity-gpu` via `ORRERY_REQUIRE_GPU` |
| B23 | Earth `iceFrac` upper band 0.18 → 0.12 |

### Fifth wave (same day)

| Item | Shipped |
|---|---|
| B49 | Thick-air mix + mean damp → Venus trop–pole ~0.02; baseline ≤0.08 |
| B47 | Smoke asserts Ares winter ~28% column freeze + pressure drop |
| B53/B54 | Titan `cycleMaterial` → `ch4Ice` + liquid window; Mars CO₂ no liquid at 6 mbar |
| Descent | Local map **cue pulse** (fire/smoke/herd/life) for ~4.5 s |
| Provenance | `overlay.js` / `core.js` `@provenance look` |
| E9 lint | `scripts/alloc-lint.mjs` wired into `npm run fidelity` |

### Quality First-20 gate (2026-08-21)

| Row | Shipped |
|---|---|
| H1/H2 | `vr/sim/fields.js` + `scripts/fields-census.mjs` → `vr/data/fields/` |
| G1/G6/G11/G21 | root eslint + prettier + `jsconfig` (`npm run lint` / `format` / `typecheck`) |
| G31 | `.github/workflows/ci.yml` — verify + fidelity (+ optional GPU) |
| F1/F3/F11 | `npm run test:fast` (smoke + fixtures); `--timing`; `test:full` for long suite |
| K1/K11 | [`cold-start.md`](cold-start.md); self-hosted `vr/fonts/` (no Google Fonts) |
| J1/J2 | `vr/sim/report.js` → `showErr` |
| I1/I11 | save v9 + fixtures `vr/data/fixtures/saves/v8`/`v9` |
| N1/N9/N2 | `CLAUDE.md`, `briefs/module-map.md`, `<html lang>`, canvas `tabindex=0` |
| M1 | `shared/tokens.css` used by `vr/` + `site/` |

### Quality Second-20 (same day)

| Row | Shipped |
|---|---|
| F12–F21, F25–F27, F32–F39 | test timing doc, sweep/watch, `withWorld`/`hashFields`, paintDisc + dark/URL asserts, assert ratchet |
| G5/G13/G22/G23 | `.editorconfig`, typecheck ratchet, lint include expand |
| H3/H28/H29/H37 | fields report + budget, field checklist, `fieldsHash` on save |
| J5/J12 | Lab Diagnostics copy; climate path in limits |
| K14/L7/L35/M16 | font preload, reduced-motion, focus ring, skip link |
| O | [`orphaned-suites.md`](orphaned-suites.md) |

### Quality Third-20 — keyboard loop (same day)

| Row | Shipped |
|---|---|
| M4–M6 | Focused globe: arrows spin, WASD cursor, +/− zoom, Enter descend |
| M8–M11 | Hover highlight cursor; `keymap.js`; Keys desk help lines |
| M3/M40 | `#planetLive` live region; [`accessibility.md`](accessibility.md) |
| J11 | GPGPU init → `ORR-GPGPU-001` via `report()` |

### Quality Fourth — tool at cursor (same day)

| Row | Shipped |
|---|---|
| M7 | Letter arms tool; Enter applies at kb cursor; Inspect / `\` / Shift+Enter descend |
| M11/M15 | Shift+`?` `#kbdSheet`; Escape closes catalogue, land pick, limits, sheet |
| M17/M20 | Live announces; non-XR descent documented as the a11y path |

### Local cue sprites (same day)

| Item | Shipped |
|---|---|
| Cue motion | `paintCueSprites` — fire embers, smoke ellipses, herd chevrons while cue is live |
| Gait boost | Entities bob/lean harder under herd/fire/smoke cues |
| Arm paths | Vandal finish, local expand, keyboard descend share `armLocalCue` |

### Dialog focus traps (M14)

| Item | Shipped |
|---|---|
| Trap helper | `vr/sim/focusTrap.js` — Tab / Shift+Tab cycles focusables |
| Dialogs | Land picker, Worlds catalogue, shortcuts sheet, map legend |
| Restore | Close / Esc returns focus to the prior control or globe |

### Quality Fifth-20 (same day)

| Area | Shipped |
|---|---|
| M23 / M35 | Phone + coarse pointer primary controls ≥44px; dock type slightly larger |
| J3 / J5 / J6 / J14 | Error ring; Lab Diagnostics copy with `SESSION_ID` + dropped ticks |
| I8 / I22 | Always refuse N mismatch; corrupt JSON refuses without mutating |
| I23 / I24 | Autosave staging + previous slot |
| K4 / K39 | Cold-start budget in [`cold-start.md`](cold-start.md) |
| O3 / O4 | `npm run test:origin` / `test:deeptime --prefix vr` |
| L33 / L32 | Brighter mute/faint tokens; `prefers-contrast: more` |
| G14 / G15 | `scripts/determinism-lint.mjs` in `npm run verify` |
| Look | Soft cloud shell (`vnoise` densAt) — salt-pixel decks gone |

### Quality Sixth-20 (same day)

| Area | Shipped |
|---|---|
| K17 / K16 | Catalogue + Dark UI lazy-load |
| K12 | Latin `unicode-range` on self-hosted fonts |
| M22 / M24 | Pinch-and-step descend; button/keyboard equivalents documented |
| I13 / I26 / I30 | Mid-run save assert; quota report; shelf in Diagnostics |
| J9 / J20 / J21 | `expected()` + [`error-codes.md`](error-codes.md) |
| L17 / H9 / G24 | HUD cadence table; schema-first alloc; `WorldFieldsCore` typedef |
| O1 / O2 / O11 | Dark test scripts + orphan-suites gate in verify |

### Cold-start budget (K4)

| Surface | Budget |
|---|---|
| Desktop localhost | First globe paint **&lt; 4 s** (measured ~1.5–3 s) |
| Headset / phone | Stretch **&lt; 8 s** — not yet measured on-device |

---

## What this doc is not

- Not a staffing plan.
- Not a promise of standalone Quest ship dates.
- Not a second backlog.
