# ORRERY — model limits

What this simulation deliberately does **not** do. Stating the boundary is what earns trust for everything inside it. (Evolution backlog item 200.)

## Geometry & numerics

- **Grid.** A cube-sphere with **runtime N** (32 / 64 / 96 via Lab `simN`). Topology and field buffers rebuild on change. Neighbour tables and `sampleSphere` cross faces; the vertex colour stencil and the field atlas (guttered `(N+2)` tiles) now do too. `W.coastDist` is a signed kilometre field; `W.coastLine` is a marching-squares polyline at sea level, drawn on the globe and the flat map.
- **No real radiative transfer.** Greenhouse forcing is a log approximation over mixing ratios, not a line-by-line or band model. Surface fields reach the GPU as atlases (`uField0`/`uField1`/`uField2`), each face padded by one true-neighbour texel so LINEAR filtering does not blend opposite sides of the planet. Vertex colour is Bayer-dithered before the 8-bit cast; the waterline antialiases with `fwidth`.
- **No real ocean dynamics.** One-layer rotating shallow water for `oceanU/V` plus SSH, with SST/salt/mix/ENSO diagnosed on top. No primitive equations, no amphidromes, no two-layer ocean SWE. Ocean colour uses a two-scale depth ramp; the abyssal plain is no longer a single saturated swatch.
- **Picture tests are CPU-side.** `vr/sim/surfaceStats.js` measures seams, banding, zonal R², ramp saturation and drainage after generate. `vr/sim/pictureDisc.js` splats `sampleLand` onto a 48px orthographic disc (mean RGB, uniqueness, axis-aligned edge runs) without a GPU. Isoline vertex count, sediment accumulation and ice carve are asserted in `test.mjs`. **Accepted gap (quality F33/F34):** there is still no headless GPU framebuffer in default CI, so shader-only faults are uncaught. `npm test` / `verify` do not require a GPU. Optional: `npm run parity:gpu --prefix vr` when `ORRERY_REQUIRE_GPU=1` on a float-FB host.
- **Tick coupling.** Adaptive `dtYr` + GPGPU climate when available. Air and sea share one explicit rotating shallow-water core (`vr/sim/swe.js`): height + geographic `u,v`, flux-form divergence, inertial advection, free-slip coasts, two substeps, cached neighbour stencil, no elliptic solve. Atmosphere `W.press` still relaxes toward a heating target; ocean SSH toward steric SST. ITCZ/Walker/monsoon skip on tidally locked worlds. GPGPU thermal uses the same `geometricInsolation` as CPU. Bio/redox stay CPU. A GCM is out of scope.
- **Scattering / clouds.** Multi-scatter LUTs + volumetric cloud shell. Clouds form from vapour RH plus ascent. Not a full GCM.
- **Weather map.** Lab synoptic chart shows pressure, wind barbs, ITCZ, plus an 18-bin zonal-mean section. Overlays: pressure, vapour, wind, vorticity, fronts, current, storm, tide, intertidal. Predictability ceiling ~2 weeks is stated, not solved.
- **Insolation.** Daily-mean TOA cosine (declination, hour angle, polar day/night). Eccentricity scales `W._solarMod`. Locked worlds are substellar only. Equator fitted so Earth `meanTemp` stays in calibrate.
- **Ice-shell / orrery.** Lid–ocean–mantle stack; table + XR hand gestures remain as before.
- **Landscape.** Fluvial erosion transfers height into the sink (two donors accumulate). Land ice carves with thickness × slope² and dumps sediment at the margin. A fixed 8-layer per-cell material stack (`W.stackMat` / `W.stackM`) is stamped from the column recipe; erosion peels it and deposition writes sediment. Layer ages and isostasy-from-column are not stored. Aeolian landforms are still a stamp, not a grain-size field.

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

- **Kind.** Catalogue fallbacks follow `worldAxes` interior (fluid → gas, magma → magma, ice only if cold). Named Solar System bodies are still regex validation cases. Kind is cached once on the ruleset (`cachePlanetKind`) so look, stamp and ice-shell agree. `vr/data/worlds/kinds.json` is the committed histogram (`temperateIo` and `furnaceMars` must stay 0).
- **Axes.** Seven numbers per world in `W._worldAxes` (gravity, volatiles, dominant volatile, interior, insolation, age, resurfacing), plus extras (retain, spin–orbit, magnetosphere, snow line, non-hydrostatic). Dominant volatile gates `liquidWaterOk`; gravity sets the relief ceiling on locked worlds; forming beyond the snow line triples invented inventory. They are not a lookup table and must not become one.
- **Substrate.** `vr/data/worlds/substrates.json` is 24 materials compiled into `vr/sim/substrates.js`. `W.substrate` is a Uint8 index stamped at generate from axes + T/P. Earth copies `W.rock` (slots 0–7). `cycleMaterial` tells `hydroTick` which row to carry; `liquidWindow` is null below the triple pressure. Non-Earth climate, diurnal swing and slope read albedo / thermal inertia / strength. Save version 7 stores the byte and the per-cell stack. Earth golden does not move. Surface RGB is authored under the Sun; `illum.js` shifts chromaticity with host Teff (camera white-balanced to 5772 K). Solar-System worlds are unchanged.
- **Atmosphere reservoir.** Thin CO₂ / N₂ columns (`W._atmScale`) exchange mass with polar frost. Mars winter is capped at 28% of the column; Pluto thins at aphelion. Titan's 1.5 bar and Earth's 1 bar do not enter. Live pressure feeds CPU greenhouse; GPGPU climate does not read it.
- **Clathrate.** `clathrateStable` is the Q1 window (~272 K at 25 bar). Titan holds an interior store; Holocene Earth does not run the tick. Dissociation writes CH₄ and a chronicle line. Not a seafloor map.
- **Ice VI.** `highPressureIceFloor` is one number for origin chemistry. Ice-shell moons below 0.8 R⊕ stay on rock (Europa). Titan's column recipe includes ice VI as a layer. A deep high-g ocean bottoms on ice VI and origin loses water–rock chemistry.
- **Cover.** `vr/data/worlds/cover.json` compiled to `coverTable.js`. `W.grain` lerps frost 0.90 → 0.38. Airless age darkens CPU albedo. Iapetus leading/trailing ratio and Enceladus brightness are asserted from fields. Photograph globe still keys off kind. GPGPU climate does not read cover.
- **Landform grammar.** `processes.json` + `landforms.json` compiled by `scripts/landgram.mjs`. `landformPalette` filters by axes and flags, not a name regex. `W.landform` is a Uint8 overlay; stamps still own height. Earth stays empty. Giants get no palette. Exo palettes are marked invented. `craterCounts` is not wired into `stampCraters`. Photograph globe still keys off kind.
- **Column.** `columns.json` compiled by `scripts/columns.mjs`. `columnAt` returns a stack with km thicknesses from a recipe plus `shellLid` / `shellOcean`. A live per-cell copy lives in `W.stackN` / `W.stackMat` / `W.stackM` (49 bytes/cell). Europa / Moon / Titan / Jupiter are pinned. Earth silent on the chip so golden cores still reconstruct from `W.rock`; inspect still reads live thicknesses. Save version 7 round-trips the stack.
- **No surface.** `W.noSurface` from gas kind or fluid interior. Land and sea are both false. Hydro, ecology, tectonics, erosion, ocean, mantle, carbon and phylogeny skip. Land tools lock. `rhinesJetCount` seeds zonal `windU`; amplitude reads `internalHeat`. `W.pSeen` is optical pressure (not SWE `press`); decks NH3 / NH4SH / H2O (CH4 on ice giants); Galileo floor 22 bar; T ∝ P^0.32. Camera may pass 1.03 on giants only (min 0.84). Saturn rings are a line annulus. Not 2-D turbulence, not volumetric cloud, not 150 m/s.
- **Epochs.** `vr/data/worlds/epochs.json` compiled by `scripts/epochs.mjs`. A row is gases, sea, ice, optional landscape archetype, palette, cite — not reconstructed palaeogeography. Present Earth is a no-op (golden). Venus-ocean and early Mars are first-cut. Clock uses Ma BP → age from CAI (Cambrian is 541 Ma ago, not 541 Myr after CAI). LGM/Cretaceous are not proxy-calibrated. Picker is a select, not thumbnails.
- **Technosphere.** `W.techno` is a lazy object, not an NC array. Holocene Earth reads 20 TW / ~0.01% absorbed insolation without extra CO₂. Waste heat applies above 1%. Fossil emissions on uncalibrated worlds. Overlay `techno`. Fusion/orbital/post-bio tagged invented. Giants skip. Not a road network, not a Dyson swarm.
- **Not round.** `isNonHydrostatic` is true below ~400 km. Phobos, Arrokoth and 67P are flagged `not round` on the chip and still drawn as cube-spheres — the engine has no irregular-body mesh.
- **Tidal heat.** `tidalHeatFluxWm2` is Io-normalised (~2 W/m² on Io). The Moon is far smaller. Heat-pipe interiors require a moon (or Io-level heatFlow), not a close-in airless exoplanet.
- **Sky.** One analytic ephemeris (`sim/sky.js`) — Keplerian lights and satellites, equilibrium tides, fitted eclipses. No N-body, no Laskar chaos. See [`sky-model.md`](sky-model.md).
- Most catalogue bodies still inherit Earth-flavoured biology until ruleset flags (`iceShell`, `methaneSolvent`, `tidallyLocked`, `starTeff`) say otherwise. Host stars are now objects (`sim/star.js`) with Teff-derived photon fraction and sky tint; insolation still soft-clamps for playability.
- Phosphine / Venus aerial life is framed as contested, not affirmed.

## Provenance of constants

<!-- BEGIN PROVENANCE (generated — do not hand-edit; scripts/provenance.mjs) -->
As of **2026-08-21**: see `briefs/_provenance-limits.inc.md` and `vr/data/provenance.json`.
Scanner + ratchet: `npm run provenance` / `npm run provenance:ratchet --prefix vr`.
Untagged means **invented** until annotated. Kinds: measured, fitted, invented, numeric, derived, look.
<!-- END PROVENANCE -->

Magic numbers in `vr/sim/` should be tagged as one of:

| Tag | Meaning |
|---|---|
| **measured** | Taken from an Earth / lab / spacecraft value |
| **fitted** | Tuned so the model reproduces a known pattern |
| **invented** | Chosen for legibility or playability |
| **numeric** | Solver / stability constant (neither measured nor play-invention) |
| **derived** | Computed from other tagged constants |

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
