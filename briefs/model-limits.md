# ORRERY — model limits

What this simulation deliberately does **not** do. Stating the boundary is what earns trust for everything inside it. (Evolution backlog item 200.)

## Geometry & numerics

- **Grid.** A cube-sphere with **runtime N** (32 / 64 / 96 via Lab `simN`). Topology and field buffers rebuild on change. Coasts remain staircased at coarse N.
- **No real radiative transfer.** Greenhouse forcing is a log approximation over mixing ratios, not a line-by-line or band model. Surface fields reach the GPU as atlases (`uField0`/`uField1`).
- **No real ocean dynamics.** Surface/deep/salt/upwell/conveyor fields and an equilibrium two-bulge tide with shelf-amplified range, breathing shoreline, and spring–neap from Moon–Sun alignment. No primitive equations or amphidromes.
- **Tick coupling.** Adaptive `dtYr` + GPGPU climate when available. Pressure field drives geostrophic wind; Rhines-ish cell count responds to spin; ITCZ migrates with season. Bio/redox stay CPU.
- **Scattering / clouds.** Multi-scatter LUTs + volumetric cloud shell. Cloud banding from ITCZ / subtropical descent is visible from orbit — still not a full GCM.
- **Weather map.** Lab synoptic chart shows pressure, wind barbs, ITCZ. Overlays: pressure, wind, storm, tide, intertidal. Predictability ceiling ~2 weeks is stated, not solved.
- **Ice-shell / orrery.** Lid–ocean–mantle stack; table + XR hand gestures remain as before.

## Chemistry & climate

- **Carbon reservoirs** are relative units, not GtC. Burial → O₂ is the right *mechanism* at toy fidelity.
- **Redox tower** guilds are a curated set, not a genome-resolved metabolome. Syntrophy is one hard-coded pair.
- **Isotope proxies** (δ¹³C, δ¹⁸O, δ³⁴S, Sr) are diagnostic sketches driven by burial / ice / weathering, not mass-balance isotope models.
- **Faint young Sun** uses the standard 1/(1+0.4(1−t/t₀)) luminosity curve; no stellar evolution tracks per catalogue host yet.

## Life & evolution

- **Trait vectors** are ~11 floats, not sequences. Speciation is allopatric-component splitting plus a light ecological nudge — not full population genetics.
- **`lifeClass` and `unlockedClass`** are derived compatibility shims: one writer per tick (`deriveLifeClass`) from guild density and the phylogeny, not morphology gates.
- **Species fields** (`H2S`, `Fe²⁺`, `orgC`, …) relax toward abiotic equilibrium each tick rather than resetting; dissolved chemistry has memory on the slow fields.
- **Phylogeny** is a tree object with ghosts; horizontal gene transfer is only partially sketched.
- **Major transitions** are contingent gates with probabilities, not developmental simulations.
- **Food webs** are sparse trophic links from traits, not measured interaction matrices.
- **Entities** on screen still use the sprite atlas at orbit range; close-in LOD draws low-poly meshes from trait body plans (`mesh.js` / `morphology.js`). Full articulated creatures and octahedral impostors are not finished.
- **Ice-shell catalogue worlds** get a lid + vent biosphere sketch (`iceshell.js`) rather than a true shell–ocean–mantle stack.

## Catalogue & aliens

- Most catalogue bodies still inherit Earth-flavoured biology until ruleset flags (`iceShell`, `methaneSolvent`, `tidallyLocked`, `starTeff`) say otherwise. Host stars are now objects (`sim/star.js`) with Teff-derived photon fraction and sky tint; insolation still soft-clamps for playability.
- Phosphine / Venus aerial life is framed as contested, not affirmed.

## Provenance of constants

Magic numbers in `vr/sim/` should be tagged in comments as one of:

| Tag | Meaning |
|---|---|
| **measured** | Taken from an Earth / lab / spacecraft value |
| **fitted** | Tuned so the model reproduces a known pattern |
| **invented** | Chosen for legibility or playability |

When a constant is unmarked, treat it as **invented** until annotated.

## What *is* claimed

- Deep time is anchored at the CAI age (4.567 Ga) with adaptive tick length and an ICS ribbon.
- Free O₂ accumulates from organic carbon burial, not from raw photosynthesis − respiration imbalance.
- Metabolism is guild-based on a redox tower before morphology.
- Lineages carry heritable traits, can speciate across barriers, and leave ghosts in a live tree.
- Habitability and inhabitance are separate scalars; a sterile but habitable world is a valid outcome.
- Instruments (core, ice core, Keeling, diversity, redox gauge, transit spectrum, paper export) read the live model.
- Surface colour responds to NPP, sediment plumes, seasonal snow, pigment guild, ozone/aerosol rim terms.
- `node vr/sim/calibrate.mjs` asserts modern Earth within stated tolerances.
