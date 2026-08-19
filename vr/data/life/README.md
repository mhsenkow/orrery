# Life grammar

Authored source of truth for what a body can be in ORRERY. Compiled by `scripts/lifegrammar.mjs` into `vr/sim/lifeGrammar.js`. Do not edit the compiled file.

## Files

| File | What it is |
|---|---|
| `axes.json` | Categorical axes (habitat, locomotion, …) and counted axes (symmetry order, segments, size class). Index 0 of each list is ancestral. `lockTauMyr` is how fast the axis hardens. |
| `organs.json` | Countable modules, topologically ordered by `needs`. `countFrom` is `symmetry`, `segments`, or `fixed`. Costs are mass and power fractions. |
| `sensors.json` | Receptor bands with wavelength, detector type, required medium, and whether they image. Physics lives in `vr/sim/sensory.js`. |
| `biochem.json` | Solvents (measured dielectric constants and liquid ranges), polymers, energy carriers, chirality, membranes. |
| `coverage.json` | Which of those numbers are measured, fitted, or invented. |

## Adding an organ

1. Give it an `id` in camelCase.
2. Set `class` (`sensor`, `effector`, `feeding`, `defence`, `buoyancy`, `circulation`, `metabolic`, `reproductive`).
3. If it is a sensor, name a `band` that exists in `sensors.json` (or `"any"`).
4. List prerequisites under `needs.organs`, `needs.axes`, `needs.integers`.
5. Set `countFrom` and `cost`.
6. Tag `measured` / `fitted` / `invented` and write `why` in one sentence.
7. Run `node scripts/lifegrammar.mjs` — the validator will refuse a `needs` that names a missing organ or an axis value that is not in the list.

A compound eye that required a skeleton option named `carapace` (an integument) is the kind of error the compiler exists to catch.

## Size class

`sizeClass` is log10 grams offset by 4: 0 is 0.1 µg, 4 is 1 g, 10 is 1 t, 14 is 10 kt. It is never locked.

## Symmetry

0 is no axis (goo). 1 is one mirror plane (bilateral). 5 is pentaradial — five equally good directions, therefore no head. Organ counts follow from this, so three eyes is what a triradial body has.
