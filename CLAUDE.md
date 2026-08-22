# ORRERY — agent orientation

Keep this file under ~100 lines. Details live in linked docs.

## What this is

WebGL2 + JS planet god-game under `vr/`. Flat desktop/mobile is the product surface; WebXR is optional. Hold a planet → perturb → descend → read → return.

## Run

```bash
python3 -m http.server 8765   # http://localhost:8765/vr/
npm run test:fast --prefix vr # <18s edit loop
npm run smoke --prefix vr
npm run fidelity --prefix vr  # provenance + calibrate + golden + parity + alloc-lint
npm run verify                # lint + format:check + typecheck + test:fast (repo root)
```

## Layout

| Path | Role |
|---|---|
| `vr/main.js` | Boot, UI, input, loop |
| `vr/world.js` | `W`, generate, tick, saves |
| `vr/sim/` | Field systems (atmo, hydro, bio, …) |
| `vr/sim/fields.js` | Curated `W` schema (H1) |
| `vr/data/` | Baselines, golden, fixtures, provenance |
| `scripts/` | Compilers, census, fidelity gates |
| `briefs/` | Registers + shipped truth — not queues |
| `NEXT.md` | Only active backlog (capacity = first 90s) |

Module index: [`briefs/module-map.md`](briefs/module-map.md) (`npm run modules:map`).

## Rules of thumb

- Prefer `NEXT.md` over inventing new backlog files.
- Dark / Evil stays behind `?dark=1`; do not expand until playtests land.
- Saves are versioned (`serializeRun` v9); fixtures in `vr/data/fixtures/saves/`.
- Lint/format scope starts narrow (`eslint.config.js`); expand with a ratchet, not a format-all bomb.
- Provenance tags (`@provenance`) matter for fidelity; see `scripts/provenance.mjs`.
- **New `W` field checklist (H29):** add a row in `vr/sim/fields.js` (name, kind, type, unit?, owner, saved); re-run `npm run fields:census` + `fields:report`; add a fast or smoke assert if it is state.

## Product / limits

- Intent: [`PURPOSE.md`](PURPOSE.md), [`briefs/product.md`](briefs/product.md)
- What ships: [`briefs/shipped.md`](briefs/shipped.md)
- Model honesty: [`briefs/model-limits.md`](briefs/model-limits.md)
- Quality register: [`briefs/quality-400.md`](briefs/quality-400.md)
- Fidelity register: [`briefs/earth-fidelity-500.md`](briefs/earth-fidelity-500.md)
- Access: [`briefs/accessibility.md`](briefs/accessibility.md) — keyboard loop on focused `#c`
