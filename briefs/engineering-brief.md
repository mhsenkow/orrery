# ORRERY — Engineering Brief

**Author:** Engineering Manager, ORRERY
**Status:** Draft for review
**Date:** 2026-08-08
**Companion doc:** `product-design-brief.md`
**Audience:** Eng leadership, graphics, XR platform, tech art

> Format note: written in the house style of a Meta/Google engineering program brief. Numeric budgets marked **[est]** are design targets derived from published hardware characteristics, not measured results. Everything marked **[est]** must be replaced with profiler output before it is used to make a staffing decision.

---

## 1. System thesis

**One data structure carries the whole product: a quadrilateralized cube sphere.**

Six faces, each an N×N 2D array, projected onto a sphere at render time. Commit to this and most of the hard problems in the concept stop being hard:

- Simulation code becomes plain 2D array code — no spherical geodesics, no pole singularity, no icosahedral neighbor tables.
- Neighbors are `(x±1, y±1)` within a face, plus one adjacency table for the 24 face-edge seams.
- Rendering is a per-face quadtree with chunked LOD — the well-trodden planetary renderer, not a research problem.
- **Entity positions become `(face, u, v)`.** Agent movement and pathfinding are 2D-per-face with a seam-crossing rule. This is the single largest cost saving in the architecture; it converts "navmesh on a sphere" into "navmesh on six squares."
- The renderer's LOD quadtree *is* the product's progressive-disclosure ladder (PD Brief §6). One mechanism, two jobs.

The alternative — geodesic/icosphere — has better area uniformity and worse everything else. Indexing, seams, texture mapping, and agent navigation all get harder. Not worth it.

---

## 2. Cube-sphere specification

### 2.1 Mapping

Uniform grid parameter `s ∈ [-1, 1]` per axis. **Tangent-adjusted** mapping:

```
u = tan(s · π/4)
```

`tan(π/4) = 1`, so the range is preserved. This exists because the naive mapping over-samples face edges: for a point `(1, u, 0)` normalized, `dθ/du = 1/(1+u²)`, which is 1.0 at face center and 0.5 at the edge. Uniform steps in `s` produce uniform steps in angle. Cuts worst-case area distortion from ~1.9× to ~1.3×.

### 2.2 Area weights — do not skip this

The tangent adjustment is exact only along the face axes. Residual distortion remains and it is *not* noise — it is a smooth, systematic bias correlated with position on the face. The exact Jacobian for the cube→sphere projection:

```
dA = du dv / (1 + u² + v²)^(3/2)
```

**Every conserved quantity in the simulation — heat, water mass, biomass, insolation — must be multiplied by a per-cell area weight computed from this.** Precompute once at init into a flat array; it costs 4 bytes per cell and nothing at runtime.

Skipping it does not produce an obvious bug. It produces a planet whose climate is subtly, permanently wrong in eight symmetric patches, and the team finds out six months in when someone asks why deserts always form in the same relative position on every seed.

### 2.3 Corners

The 8 cube corners have **3** neighbors, not 4. Degenerate cells. Two acceptable strategies: special-case them in the neighbor table (recommended), or make the neighbor lookup generic by round-tripping through 3D — take the cell's direction vector, step in a tangent direction, re-project to `(face, i, j)`. The generic path is slower to build but provably correct and doesn't require hand-authoring 24 seam orientations, which is a classic source of long-lived off-by-one bugs. **Recommendation: generic 3D round-trip at init, baked into a static neighbor index array.** Pay once, never think about it again.

---

## 3. Layer architecture

Four layers, deliberately decoupled. The failure mode we're designing against is a monolith where an agent-AI spike drops a VR frame.

```
┌─ L4  Agents (ECS)        CPU, jobified, fixed 10Hz tick
│      thousands of entities, (face,u,v) positions
├─ L3  Voxel skin          GPU, sparse, allocated on demand
│      near-surface bricks only, where digging occurs
├─ L2  Field simulation    GPU compute, fixed 8–15Hz tick
│      tectonics, climate, hydrology, biome CA
└─ L1  Cube-sphere base    Static after generation
       heightfield, area weights, neighbor tables
```

**L2 writes to textures. L4 reads those textures and writes back sparsely** (a settlement stamps its cell; a herd depresses local biomass). No layer calls up. Every layer runs on its own fixed tick with render-side interpolation, so no simulation spike can ever cause a dropped frame — the renderer draws the last completed state, always.

---

## 4. L2 — field simulation

Tectonics, temperature, moisture, ice, and biome CA are all texture-to-texture passes. This is the layer that sounds expensive and isn't.

- Target base resolution: **6 × 256² = 393,216 cells.** For reference, the 1990 original ran roughly 128×64 on a 68000. We are proposing ~48× the cell count and it is not the bottleneck.
- Storage: cubemap array, ping-ponged. ~6 RGBA16F targets covers every field.
- **[est]** A full sim tick is a handful of full-screen-equivalent compute passes over 393k cells. On standalone-class hardware this should land well under 1ms. **Must be measured in M0.**
- Ticks at 8–15Hz, decoupled from the 90Hz render.

Field state is the cheap part of this product. Do not over-engineer it and do not let it drive the platform decision.

---

## 5. Render pipeline

Per-face quadtree, chunked LOD, vertex-displaced by the height texture.

- **Static geometry, dynamic attributes.** Elevation is fixed after generation, so positions and normals are computed once. Only the per-vertex biome/colour attribute updates on sim tick. At 8Hz that's a small `bufferSubData` and nothing else.
- **Ocean as clamped displacement.** `disp = max(elev, seaLevel)` gives a smooth ocean shell for free — no second mesh, no separate water pass at v1.
- **Atmosphere shell.** Inverted sphere, additive Fresnel. Cheap, and it does an enormous amount of work selling the object as a planet rather than a textured ball. Non-negotiable for the slice.
- **Entities: GPU-instanced extruded vector quads.** Oriented with `up = surface normal`, yawed toward the camera — *not* fully camera-facing. Trees should stand on the planet, not pivot with your head. One draw call for all entities of a family.
- **LOD level ↔ disclosure tier.** The quadtree already knows viewer distance. Bind the PD Brief §6 ladder directly to it. Entity fade-in, colour-mode switch, and agent activation are all driven off the same LOD selection.

---

## 6. L3 — voxel skin (scope this hard)

The Womp-style sculpting model — GPU signed distance fields with real-time remeshing via surface nets / dual contouring — is genuinely the right *feel* for terrain sculpting, and it is a multi-month subsystem in its own right. A dense SDF at planet scale is not affordable on any target under consideration.

**Proposal: voxel skin over a heightfield core.**

- The planet is a displaced cube-sphere heightfield (L1). That's the default and it covers ~100% of the surface.
- Sparse voxel bricks are allocated **only where someone digs** — caves, tunnels, overhangs, the Vermis burrow network.
- Bricks are near-surface only, keyed by `(face, quadtree node)`, resident only within a radius of the player.

Heightfields cannot represent overhangs. That is the *only* reason we need voxels. Pay exclusively for that.

**Recommendation: L3 is out of scope for Slice 1 entirely.** It is the correct architecture to plan for and the wrong thing to build before the scale transition is validated.

---

## 7. Frame budget

The binding constraint. **[est] throughout — these are targets derived from published hardware characteristics and must be replaced with measured data in M0.**

| | Standalone (Quest-class) | PC-tethered |
|---|---|---|
| Refresh target | 90Hz | 90Hz |
| Total frame | 11.1ms | 11.1ms |
| Compositor / reprojection reserve | ~2.5ms **[est]** | ~1.5ms **[est]** |
| **App budget** | **~8.5ms [est]** | **~9.5ms [est]** |
| Practical geometry ceiling | ~1–1.5M tri/frame **[est]** | ~10M+ **[est]** |
| Realistic verdict on L3 SDF sculpting | Marginal at best | Comfortable |

Two rules that follow directly and are not negotiable:

1. **Simulation runs on a fixed decoupled tick with interpolated rendering.** A tectonics spike must never be able to drop a frame.
2. **Every system needs a hard per-frame time budget with an enforced degradation path**, not a best-effort one. Agent AI that occasionally takes 4ms is a shipped-product bug, not a tuning issue.

---

## 8. Platform decision — needed by end of week 1

| Option | Pro | Con | Verdict |
|---|---|---|---|
| **Standalone native (Unity)** | Where the install base is; no tether; best XR toolchain maturity, Burst/Jobs, compute shaders | Tightest budget; L3 SDF likely never affordable | **Recommended** |
| **PC-tethered** | ~5× headroom; L3 fully viable | Small addressable market; wrong platform for a 20-min-session game | Reject for v1 |
| **WebXR (three.js / raw WebGL2)** | Zero-install, instantly shareable, excellent for prototyping and stakeholder review | No compute shaders in WebGL2; WebGPU coverage on standalone browsers still uneven; ceiling lower than native | **Use for prototypes and the pitch, not for ship** |

**Recommendation: Unity, standalone-first.** XR maturity, Burst/Jobs, and compute shaders are all ahead of the alternatives, and this design leans on all three. Godot 4 is a credible open alternative but its XR and compute stories are both behind.

**Separately: build the pitch/validation prototype in WebXR.** A no-install URL that runs in the headset browser is worth a great deal for stakeholder review and for early comfort studies, and it costs days rather than weeks. It is a communication tool, not the product. (One shipped and running — see `vr/index.html`.)

---

## 9. Milestones

| | Scope | Exit gate |
|---|---|---|
| **M0** — Bake-off *(2 wks, 1 eng + 1 PD)* | Scale-transition variants A and B. No sim, no art. | Comfort study passes PD Brief §11.1. **Hard gate — nothing else starts.** |
| **M1** — Substrate *(3 wks, 2 eng)* | Cube sphere with tangent adjustment, area weights, generic neighbor table. Quadtree LOD. Procedural generation. Profiler harness. | 90Hz held on target hardware with 6×256² geometry. Unit tests prove seam and corner continuity. |
| **M2** — Simulation *(3 wks, 2 eng + tech artist)* | L2 field sim on GPU. One ruleset (Terra). Extruded-vector entity pipeline. Atmosphere. | Sim tick under budget. A perturbation produces a visible spatial change within 60s of sim time. |
| **M3** — Slice *(2 wks, full team)* | Assembly, one paint tool, comfort/legibility polish. | All three PD Brief §11 kill criteria pass. |

**Slice 1 total: ~10 weeks.** No agents, no voxels, no persistence, one ruleset.

The sequencing is deliberate: M0 is a hard gate because if the scale transition can't be made comfortable, M1–M3 are all wasted. Do not let M1 start "in parallel to de-risk schedule." That is how you spend three engineer-months on a substrate for a game that doesn't exist.

---

## 10. Staffing

| M0 | M1 | M2 | M3 |
|---|---|---|---|
| 1 eng (XR/interaction) | +1 eng (graphics) | +1 tech artist | full team |
| 1 PD | 1 PD | 1 PD | 1 PD + research |

Peak: **2 eng + 1 tech artist + 1 PD.** Deliberately small — the architecture is chosen so that it can be.

Skills that must be on the team by M1: **planetary/quadtree LOD rendering** and **XR frame-budget discipline.** These are the two places where inexperience costs months rather than days.

---

## 11. Risk register (engineering)

| # | Risk | Sev | Mitigation | Detect by |
|---|---|---|---|---|
| E1 | Seam/corner bugs in the neighbor table surface late and everywhere | High | Generic 3D round-trip (§2.3); continuity unit test as an M1 exit gate | M1 |
| E2 | Area-weight omission produces systematically wrong climate | High | Bake weights at init (§2.2); test asserts total surface area sums to 4π within tolerance | M1 |
| E3 | Standalone frame budget doesn't hold with sim + entities | High | Profile in M1 before any content; enforced per-system budgets with degradation paths | M1 |
| E4 | L3 SDF sculpting proves unaffordable on standalone | Medium | Already scoped out of Slice 1 (§6); heightfield covers all v1 needs | M2 |
| E5 | Agent count doesn't scale — bottleneck is per-agent AI, not the sphere | Medium | ECS + Burst from day one; LOD agent AI to match render LOD | M2 (post-slice) |
| E6 | Unity XR toolchain churn between LTS versions | Low | Pin LTS at M0; no mid-program upgrades | ongoing |

---

## 12. Open questions

1. **Persistence model.** Seed-plus-delta is standard and obviously right for terrain edits. It is *not* obviously right for simulation state, which diverges continuously and irreversibly from its seed. Do we snapshot field state periodically, or do we accept that a planet's history is only replayable from its edit log? Affects save size by orders of magnitude.
2. **Sim determinism.** GPU floating-point across vendors is not bit-identical. If we ever want shared or replayable worlds this must be settled early — probably fixed-point for the field sim — and it is much cheaper to decide now than to retrofit.
3. **Passthrough lighting.** PD Brief closing question (planet persisting on a real table) implies matching real-room lighting. Meaningful graphics work, needs an early scope call rather than a late one.
