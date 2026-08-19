#!/usr/bin/env node
// Single source of truth for the ORRERY surface backlog.
// Emits  briefs/surface-backlog.md  and  site/surface.html.
//
//   node scripts/surface.mjs
//
// 400 items on two complaints that turn out to be six bugs and one missing field:
// the planet has hard rectangular edges on it, and the world is striped.
//
// Written by auditing the colour pipeline, the cube-sphere topology, the field
// atlas, the classification cascade and the water budget against the running
// build. Every number below was measured, not estimated.
//
// k:  MODEL = what the simulation computes
//     DRAW  = what reaches the screen
//     PROVE = the measurement, test or tool that keeps it fixed
// e:  effort S/M/L.  i: impact 1..3.
// g:  capability token this item provides.  n: tokens it needs first.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = [
  ['ink', 'The rectangle is an overlay, not a continent',
    '`updateLocalHighlight` builds a square perimeter *in unwrap space* and the wash at `render.js:1477` then repaints the entire globe from it: cells inside the patch lerp toward `[255, 248, 236]` at k = 0.07, and **every cell outside is pulled 46% toward grey**. No feather, no falloff, binary `Set.has(c)` membership. That is the two-tone rectangle with right-angle corners in the screenshots — the "coastline corner" is the wash boundary crossing a coast. One overlay, unfeathered, is currently allowed to restyle an entire planet.'],
  ['paint', 'A cell\'s colour is fifty-four sequential lerps',
    '`refreshColours` is a 261-line loop containing **54 separate `col = [...]` assignments** per cell per frame. Ocean depth, sea ice leads, foam, reef, sediment, lava, ash, dust, snowball state, guild tint, albedo paint, brush preview, local wash, hover and stroke fade are all the same variable, mutated in a fixed order that nobody chose deliberately. There is no separation between what the surface *is*, what is growing on it, what is happening to it this instant, and what the interface is drawing on top.'],
  ['topo', 'The simulation crosses cube faces; the renderer does not',
    '`buildNeighbours` and `buildNbr8` both handle face crossings correctly — they step off the face, call `facePoint`, and resolve through `dirToCell`. The renderer does not. `vMixC0..3` at `render.js:136–145` builds the vertex-colour stencil with `clamp(i, 0, N-1)` and `clamp(j, 0, N-1)`, so at every one of the twelve cube edges the outer half-cell of vertices interpolates against a *duplicated* edge cell instead of the neighbouring face. The physics is seamless and the picture is not.'],
  ['atlas', 'Six faces, one texture, five seams',
    '`FIELD_W = 6 * N`, `FIELD_H = N`, and the write is `px = (j * FIELD_W + f * N + i) * 4` — the six cube faces are laid out side by side in a single 6N × N texture sampled `LINEAR`. So at each of the five internal boundaries the hardware blends the last column of face *f* with the first column of face *f+1*, which are nowhere near each other on the sphere. Three RGBA8 textures carry twelve fields this way: life, ice, moisture, cloud, sediment, intertidal, precipitation, discharge, NPP, guild index, height and sea state.'],
  ['fuzzy', 'Biomes are an if-ladder, so their edges are contour lines',
    '`classifyBiome` is eleven hard branches on two smooth fields: `tC < -5` tundra, `tC < 5 && ppt > 400` boreal, `ppt < 250` desert, `ppt < 600 && tC > 18` savanna, and so on. A cell is exactly one biome. Since temperature and precipitation vary smoothly, every biome boundary in the product is an isoline of a scalar field drawn at full contrast — which is the banding, and it is drawn identically on the globe and in the pixel map.'],
  ['ecotone', 'Nothing lives on a boundary',
    'A hard classification has no edges to live on. Real ecotones — treeline, tension zone, mangrove fringe, riparian corridor, the intertidal — carry disproportionate diversity and are where almost everything visually interesting happens. `W.biome` is a `Uint8` index per cell and there is no representation anywhere of a cell being partly one thing and partly another.'],
  ['contour', 'A coastline is a staircase of 104-kilometre squares',
    '`sphere.js` exports `N = 64` and the boot markup asks for 96, so a shipped cell is 104 km across — larger than Corsica. Every coastline is the set of cells where `h[c] < seaLevel` flips, softened by two Laplacian passes in `naturalizeHypsometry` and one ochre `smoothstep` band in the shader. There is no sub-cell representation of the shoreline anywhere: no contour, no signed distance, no fractional coverage.'],
  ['detail', 'Between 104 kilometres and a footprint there is nothing',
    'The realism pass added two octaves of object-space detail to the surface shader, faded by `fwidth` before either period reaches the sampling limit. That is the only thing between a cell and the camera. The local pixel map draws its own stamps from `hash2(c, 0x11fe)`, the globe draws its own mottle, and neither is derived from the other, so zooming in does not reveal the same world at finer grain — it reveals a different one.'],
  ['bits', 'Everything the shader sees is eight bits',
    '`_cellDat` is a `Uint8Array(NC * 4)`; `spreadVertexDat` blends four cells per vertex and truncates with `| 0`; all three field textures are `UNSIGNED_BYTE`. Height reaches the shader as `hs = clamp(0.5 + (h - localSea) * 2.2, 0, 1)`, which packs roughly ±4 km into 256 steps — about 30 m per level. Every ramp in the product is quantised twice before anyone looks at it, and nothing dithers.'],
  ['ramp', 'The ocean spends its whole colour range in the first half kilometre',
    '`d = clamp((sea - W.h[c]) * 1.9, 0, 1)` — the full deep-water ramp is used up within 0.53 of a height unit. The measured hypsometry says half the planet sits between −0.795 and −0.574, which is entirely inside the saturated end, so the abyssal plain is one flat colour covering half the globe while the shelf gets the entire gradient. Land has the same problem in reverse.'],
  ['belt', 'Ninety-two places read latitude directly',
    'Measured: **92 sites across 29 files** read `DIR[c * 3 + 1]`. Insolation, Coriolis, the equatorial waveguide and seasonal hemisphere remain. Vegetation, ice floors, rain base, ENSO x-sign and cloud gaussians do not.'],
  ['circ', 'Bands should be a result, not an input',
    'Earth has three circulation cells per hemisphere because of rotation rate and the meridional temperature gradient. Pressure is diagnosed; wind is geostrophy plus ITCZ/Walker/monsoon on unlocked worlds. Locked worlds are substellar. Honest daily-mean insolation is what lets high obliquity invert the annual mean.'],
  ['vapour', 'Atmospheric water is one global number',
    '`hydroTick` evaporates into `gases.H2O`, a scalar, and every cell on the planet then draws precipitation from that same scalar. There is no water-vapour field, so there is no continentality, no depletion downwind, no moisture front, no advected plume off a warm sea. The lee term looks at one ring of neighbours. An interior a thousand kilometres from any coast is as wet as the coast, modulated only by its own slope.'],
  ['rain', 'The rain that does exist has nowhere to fall from',
    'The orographic term in `hydroTick` is real and correct in shape — upslope against the wind adds `upslope × vapour × 2.4`, lee divides by `1 + lee × 10`. The latitude base is gone; rain is local vapour times maritime. Remaining banding in the cloud shell is ITCZ / subtropical organisation, not the precipitation formula.'],
  ['uplift', 'Relief is noise added to a Voronoi diagram',
    '`naturalizeHypsometry` runs one fixed recipe: a three-octave domain warp at 1.4, five-octave coast fBm at 5, four-octave macro at 1.05, three-octave detail at 9, three-octave ridged at 2.4, then two Laplacian passes. Those constants are the terrain of every world in the product. Nothing in them knows about a plate boundary, a collision, a rift flank, a hotspot track or an age–depth curve, so mountains are noise that happens to be high rather than crust that was pushed up.'],
  ['fluvial', 'The river network is the strongest signal on a landscape and it runs in the background',
    '`erosionTick` is `erode = min(0.004 × rate, discharge × slope² × 0.15 × rate)` — a real stream-power law, run once per sim tick with a per-planet-kind constant, never aimed and never previewed. Measured at t = 0 on the default Earth: of 7,460 land cells, **185 carry flow above 0.1 and 8 above 0.5**. The world you are handed has eight river cells on it, and drainage is the single thing that makes terrain read as weathered rather than generated.'],
  ['glacial', 'Ice covers the land and never carves it',
    '`iceLand` accumulates and melts and has no mechanical effect at all. Glacial erosion is what produced the U-shaped valley, the cirque, the fjord, the drumlin field, the erratic and most of the topography of the northern hemisphere. On a planet whose entire product pitch includes ice ages, ice is currently a white overlay.'],
  ['arid', 'Everything that is not water',
    'Aeolian transport, dune fields, yardangs, loess; karst dissolution and sinkholes; periglacial polygons and thermokarst; salt pans and playa; talus and repose angle. These are the processes that give a dry, a cold or a limestone landscape its identity, and none of them exists. On worlds where liquid water is rare — which is most of the catalogue — they are the *only* processes.'],
  ['soil', 'The skin of the planet is one float',
    '`W.soil[c] += life[c] × 0.004 − (1 − moist[c]) × 0.001`, clamped to 0–1. Soil is the top metre of the entire terrestrial world: it holds the water, it holds the nutrients, it is what stops erosion, it is what a colour looks like from orbit, and it took life half a billion years to make. It has no depth, no texture, no horizon, no parent material and no age.'],
  ['measure', 'The picture has never been measured',
    'The realism pass established this and it is still true. There is no test anywhere that renders the globe and asserts anything about the result. Every fault in this document — the wash rectangle, the face-clamped stencil, the atlas seams, the contour banding, the saturated depth ramp — was found by a person looking at a screenshot. All five would have been caught by one headless render and four cheap statistics.'],
];

const P1 = [
/* ----------------------------------------------------------------- ink -- */
{c:'ink',t:'Stop the local wash repainting the whole planet',g:'washfix',d:'Landed. The `else` that pulled every cell outside `_localSet` 46% toward grey is gone. The wash tints only the patch, feathers 150 km, and the default globe mode is a rim. The rectangle in the screenshots was that single branch.',k:'DRAW',e:'S',i:3},
{c:'ink',t:'Overlays composite, they do not mutate',g:'inklayer',n:['washfix'],d:'Landed. Terrain colour is written to `_cellDat` first. Overlay, wash, hover, stroke and brush preview are a second ink pass. `spreadVertexDat` bilinearises the composite. Highlights can no longer restyle the planet by mutating `col`.',k:'DRAW',e:'M',i:3},
{c:'ink',t:'Feather every overlay edge in kilometres, not in cells',g:'inkfeather',n:['inklayer'],d:'Landed for the local wash: signed distance from the patch, feathered across 150 km. Brush previews and other overlays still step per cell.',k:'DRAW',e:'M',i:3},
{c:'ink',t:'A global ink budget',n:['inklayer'],d:'No overlay should be able to move more than a stated fraction of the planet\'s pixels by more than a stated ΔE. Sum the ink before compositing and scale it down if it exceeds the budget. This makes "an overlay desaturated half the world" impossible by construction rather than by review.',k:'DRAW',e:'M',i:2},
{c:'ink',t:'Overlays are nearest-neighbour while terrain is bilinear',g:'inksmooth',d:'Landed. Overlays now paint the cell buffer before `spreadVertexDat`, so they ride the same four-tap stencil as the terrain. The twenty overlay modes are no longer hard cell blocks on a smooth surface.',k:'DRAW',e:'S',i:3},
{c:'ink',t:'Dim the world, do not grey it',n:['inklayer'],d:'The wash desaturates by lerping toward the cell\'s own mean, which destroys hue. A focus effect should reduce luminance and contrast and keep hue, because hue is the channel carrying every piece of information the map encodes.',k:'DRAW',e:'S',i:2},
{c:'ink',t:'One place that decides what is currently emphasised',g:'focusstate',d:'The local patch, the brush preview, the hover cell, the follow target and the selected clade are five independent emphasis mechanisms with five different visual languages. One focus object with one rendering answers "what is the app pointing at" once.',k:'DRAW',e:'M',i:3},
{c:'ink',t:'A rim instead of a fill, by default',n:['inklayer'],d:'Landed. Default `localGlobe` is `rim`. Wash survives as a mode, now inside-only and feathered, so turning it back on does not grey the planet.',k:'DRAW',e:'S',i:3},
{c:'ink',t:'Overlay opacity as a user control',d:'Twenty overlay modes and no way to turn one down. A slider from ghost to full, remembered per mode, is the cheapest possible fix for "the overlay is louder than the planet".',k:'DRAW',e:'S',i:2},
{c:'ink',t:'Overlays should be legible against every world',d:'`applyOverlay` writes absolute RGB — the temperature overlay is `r = t × 255`. On an ice world, a lava world and an ocean world those colours mean different things against different grounds. Overlay palettes need a contrast check against the world they are drawn on.',k:'DRAW',e:'M',i:2},
{c:'ink',t:'A legend that matches the ink',d:'The KEY panel lists surface categories. The overlay currently painting the globe is not in it, so a player looking at the ENSO overlay has no scale, no units and no anchor.',k:'DRAW',e:'M',i:3},
{c:'ink',t:'Never composite an overlay into the exported image',n:['inklayer'],d:'`exportPng` and the finale artefact currently capture whatever ink happened to be on. Once overlays are a separate layer, export can offer them as a choice instead of an accident.',k:'DRAW',e:'S',i:2},
{c:'ink',t:'The brush preview should be a preview, not a stain',d:'`BRUSH.preview` builds the cell set that will be painted and `refreshColours` tints it inline. A preview is a different kind of object from a state — it should be ink, it should be animated, and it should disappear the instant the pointer leaves.',k:'DRAW',e:'S',i:2},
{c:'ink',t:'Stroke fade belongs to the overlay clock, not the render clock',d:'`strokeFade = exp(-3.2 × dt)` is computed inside `refreshColours` from `performance.now()`, so a decaying stroke highlight ties the simulation\'s colour pass to the frame rate. Overlay animation needs its own clock, which `present.js` already has.',k:'DRAW',e:'S',i:2},
{c:'ink',t:'Two overlays at once, honestly',n:['inklayer'],d:'Currents over temperature, rivers over biome. With a compositing layer this is a blend mode rather than a rewrite, and the pairs that are worth seeing together are exactly the pairs the science is about.',k:'DRAW',e:'M',i:2},
{c:'ink',t:'A no-ink screenshot key',d:'One keypress that removes every overlay, rim, wash, label and HUD for a frame and captures the planet alone. It is what anyone sharing an image actually wants and it is currently impossible.',k:'DRAW',e:'S',i:3},
{c:'ink',t:'Selection as a real object',g:'selection',d:'A persistent set of cells that survives a tool change, can be grown, shrunk, inverted and feathered, and renders as ink. The landscape backlog wants it for sculpting; this category wants it so that "the region I am looking at" stops being reimplemented per feature.',k:'MODEL',e:'M',i:2},
{c:'ink',t:'Say what a highlight means',d:'The local wash means "this square is on the flat map". Nothing on screen says so. A one-line caption attached to the focus object turns an unexplained rectangle into an explained one, which is most of the fix even before the rendering changes.',k:'DRAW',e:'S',i:3},
{c:'ink',t:'Reduced-motion and colour-blind paths for ink',d:'Overlay palettes are the one part of the picture that is pure information. They need a safe palette, and animated ink needs a still fallback.',k:'DRAW',e:'M',i:2},
{c:'ink',t:'A test that no overlay moves more than its budget',n:['inklayer','pixtest'],d:'Render each of the twenty modes headless, diff against the no-ink render, and assert the fraction of pixels moved and the maximum ΔE. This is how the wash rectangle would have been caught the day it shipped.',k:'PROVE',e:'M',i:3},

/* --------------------------------------------------------------- paint -- */
{c:'paint',t:'Split the colour pipeline into four stages',g:'paintstage',d:'The 54 assignments in `refreshColours` are really four different questions asked in sequence: what is this surface made of, what is growing on it, what is happening to it right now, and what is the interface saying about it. Make those four functions with four outputs and combine them once. Every other item in this category is a consequence.',k:'DRAW',e:'L',i:3},
{c:'paint',t:'A substrate colour that is a material, not a branch',g:'substrate',n:['paintstage'],d:'Ocean, land, ice, lava, ash, sulfur and dust are currently branches and lerps in one loop. They are materials with albedo, roughness and a spectral character, and naming them as materials is what lets a Mercury or a Titan be drawn without adding eight more branches.',k:'DRAW',e:'M',i:3},
{c:'paint',t:'A cover layer for everything alive',n:['paintstage'],d:'Vegetation, mats, reef, guild tint and the pigment branches all modify the substrate\'s colour by occluding it. Modelling cover as a fraction plus its own colour, composited over the substrate, replaces about fifteen of the current lerps with one operation and makes seasonality trivial.',k:'DRAW',e:'M',i:3},
{c:'paint',t:'Transients as a separate, decaying layer',n:['paintstage'],d:'Foam, lava glow, ash fall, dust, storm surge, snowball and moist-greenhouse states are events, not surfaces. They belong in a layer with their own lifetimes so they can fade properly instead of being clamped into the substrate every frame.',k:'DRAW',e:'M',i:2},
{c:'paint',t:'Colour is computed per cell, on the CPU, every frame',g:'gpucolour',d:'`refreshColours` runs 54 lerps × NC cells on the main thread and then uploads. At N=96 that is 55,296 cells per frame. The fields are already in three textures; computing the colour in the fragment shader from those textures removes the CPU cost, removes the 8-bit intermediate, and gives per-pixel rather than per-cell colour.',k:'DRAW',e:'L',i:3},
{c:'paint',t:'The order of the lerps is load-bearing and undocumented',d:'Landed as a comment on `refreshColours`: substrate, cover, transients, then ink. The four stages are still one function, but the order is now stated, and ink no longer sits in the middle of the substrate.',k:'DRAW',e:'S',i:3},
{c:'paint',t:'One description of a cell, consumed by both views',g:'onecell',d:'The living backlog asked for this and it is still open: the globe computes a colour in `refreshColours`, the flat map computes its own in `localview.js`, and the two disagree about the same cell. One function returning a described surface — substrate, cover, wetness, transients — consumed by both is the only way the two views can ever agree.',k:'MODEL',e:'L',i:3},
{c:'paint',t:'Sea ice leads are hashed on the cell index',d:'Landed. Leads use `hash01` on the cell direction, so the pattern is spatially coherent across face edges and takes a stable seed.',k:'DRAW',e:'S',i:2},
{c:'paint',t:'Ice is drawn as three constants',d:'`[222, 234, 246]` for partial, `[248, 251, 255]` for full, one blue for a lead. Real sea ice reads by age, thickness, snow cover, melt ponds and ridging, and the model tracks enough to say which is which.',k:'DRAW',e:'M',i:2},
{c:'paint',t:'Vegetation colour should come from the plants',d:'The land colour comes from `R.land(temp, moist, life, e, ice, extra)` per ruleset. With the life pass shipped, cover colour can come from the dominant lineage\'s own pigment and its receptor bands instead of from a per-ruleset lambda.',k:'DRAW',e:'M',i:3},
{c:'paint',t:'Seasonality in the colour, not just in the fields',d:'`season` is read at the top of `refreshColours` and barely used. Leaf-out, senescence, snow line, sea-ice advance and retreat are the most visible annual signal on Earth from orbit and the product has the clock for all four.',k:'DRAW',e:'M',i:3},
{c:'paint',t:'Wetness as a first-class modifier',d:'Wet rock is darker and glossier than dry rock; wet sand is a different colour from dry sand; a floodplain after rain reads differently for days. One wetness term applied at the end of the substrate stage covers rain, tide, snowmelt and river overflow at once.',k:'DRAW',e:'S',i:2},
{c:'paint',t:'Specular and roughness belong to the material',d:'The realism pass gave the ocean a GGX lobe with wind-driven roughness. Land, ice and lava have no material properties at all, so a salt flat and a forest scatter light identically.',k:'DRAW',e:'M',i:2},
{c:'paint',t:'Stop truncating the vertex blend',d:'Landed. `spreadVertexDat` rounds, then Bayer-dithers, instead of `| 0`.',k:'DRAW',e:'S',i:2},
{c:'paint',t:'Interpolate in a perceptual space',d:'All 54 lerps are in raw sRGB bytes, so a blend between two saturated colours passes through a muddy middle. Blending in a linear or perceptual space is a contained change with a visible payoff on every gradient in the product.',k:'DRAW',e:'M',i:2},
{c:'paint',t:'A palette document, not fifty literals',g:'palettedoc',d:'`[180, 140, 70]` for dust, `[196, 108, 40]` for lava, `[168, 78, 52]`, `[210, 170, 70]` — the surface palette is scattered through one function as unnamed triples. Name them, group them by material, and put them somewhere a designer can look at them together.',k:'DRAW',e:'M',i:3},
{c:'paint',t:'Per-world palettes',n:['palettedoc'],d:'Every world in the catalogue is drawn with the same dust colour, the same lava colour and the same ice colour. A palette per world type — sourced from real imagery where it exists, labelled invented where it does not — is what stops 120 bodies looking like recolours of one body.',k:'DRAW',e:'M',i:3},
{c:'paint',t:'A colour provenance label',n:['palettedoc'],d:'`param-coverage.json` says which planetary numbers are measured. The Earth palette has a real reference path in `eoref`; every other world\'s is invented. Say which is which on the world itself.',k:'PROVE',e:'S',i:3},
{c:'paint',t:'Profile the colour pass',n:['gpucolour'],d:'`refreshColours` is the largest per-frame CPU loop in the product and its cost has never been printed. Measure it per resolution before deciding how much of it to move to the GPU.',k:'PROVE',e:'S',i:2},
{c:'paint',t:'A golden colour test',n:['pixtest'],d:'Fixed world, fixed time, fixed camera, committed image. Fifty-four lerps in a fixed order is exactly the kind of code that changes by accident, and nothing currently notices.',k:'PROVE',e:'M',i:3},

/* ---------------------------------------------------------------- topo -- */
{c:'topo',t:'The vertex stencil clamps to the face',g:'stencilfix',d:'Landed. `bindVertexMix` uses cell-centred coordinates and `cellAt`, so a vertex on a face edge blends the neighbouring face. The twelve straight colour discontinuities were this clamp.',k:'DRAW',e:'M',i:3},
{c:'topo',t:'One sampler that crosses faces',g:'spheresample',n:['stencilfix'],d:'Landed. `sampleSphere(field, x, y, z)` and a rewritten `sampleFaceField` both resolve the four surrounding cells through `cellAt`. The cloud shell uses it.',k:'MODEL',e:'M',i:3},
{c:'topo',t:'Delete every remaining index-arithmetic neighbour',n:['spheresample'],d:'Anything of the form `c + 1`, `c - N` or `f * NF + …` written by hand is a bug near a face edge. Audit for the pattern and replace with `NBR` / `NBR8` / `sampleSphere`, then add a lint rule so it cannot come back.',k:'MODEL',e:'M',i:3},
{c:'topo',t:'A seam test that fails loudly',g:'seamtest',n:['spheresample'],d:'Landed in `test.mjs`: first difference of DIR.x across every face boundary against the interior; `cellAt` off a face equals the neighbour table; `sampleSphere` at a cell centre returns that cell.',k:'PROVE',e:'M',i:3},
{c:'topo',t:'The corners are worse than the edges',n:['spheresample'],d:'A cube-sphere has eight corners where three faces meet and a cell has only three neighbours instead of four. `buildNeighbours` resolves it through `dirToCell` and produces a duplicate. Every diffusion, advection and smoothing operator in the product therefore has a small, permanent, invisible artefact at eight fixed points.',k:'MODEL',e:'M',i:2},
{c:'topo',t:'Area weights are correct and rarely used',d:'`buildAreas` computes the true solid angle per cell with an equiangular warp, and reports Σ area within 0.004% of 4π. Then almost every loop in the simulation averages fields without weighting by it. Cell area varies by roughly 1.4× from face centre to corner, so every global mean in the product is slightly wrong in a spatially structured way.',k:'MODEL',e:'M',i:3},
{c:'topo',t:'A tangent basis every operator agrees on',d:'`buildBasis` produces east and north per cell, and `advect` in `atmo.js` still assumes `NBR` indices 0/1 are east/west and 2/3 north/south — which is false on the ±Y faces. The currents backlog names this as the block on every fluid in the model; it is the same fault as the stencil, one layer down.',k:'MODEL',e:'M',i:3},
{c:'topo',t:'Say which face you are on, in the debug view',d:'Landed as overlay mode `faces` — six flat colours. A straight line in that overlay is a face boundary, not geography.',k:'PROVE',e:'S',i:3},
{c:'topo',t:'The globe mesh is 2× the field resolution',d:'`GLOBE_SUBD` gives 221,184 quads at N=96 against 55,296 cells, so the mesh is already carrying more vertices than the data has values. That subdivision is where sub-cell detail can live for free, and right now it only carries a bilinear blur of the same data.',k:'DRAW',e:'M',i:2},
{c:'topo',t:'Changing resolution throws the world away',d:'`changeResolution` calls `reallocateWorldFields`, which replaces every array. `sampleFaceField` already does the bilinear resample that would preserve the terrain — with `spheresample` it would preserve it correctly across faces too — and nothing calls it for this.',k:'MODEL',e:'M',i:3},
{c:'topo',t:'Two resolutions disagree in the source',d:'`sphere.js` exports `N = 64`; the boot markup asks for 96; every comment and constant in the codebase reasons about 64. Pick one and derive the other, because half the numbers in these backlogs are stated at the wrong scale.',k:'MODEL',e:'S',i:2},
{c:'topo',t:'A cell should know how big it is',d:'`cellKm` exists. Almost nothing calls it, so brush radii, diffusion lengths, feather widths and detail periods are all expressed in cells and silently change meaning when resolution changes.',k:'MODEL',e:'M',i:3},
{c:'topo',t:'Anisotropy of the grid',d:'An equiangular cube sphere still has cells that are not square near the corners. Any operator with a directional stencil inherits that anisotropy, which shows up as faint four-fold structure in diffused fields — visible in cloud and moisture if you look for it.',k:'MODEL',e:'M',i:1},
{c:'topo',t:'A geodesic option, considered honestly',d:'An icosahedral or spherical-Fibonacci grid has no faces and no corners, at the cost of losing the trivially indexable face layout the local unwrap and the field atlas both rely on. Write down the trade rather than leaving it as an assumption nobody has revisited.',k:'MODEL',e:'L',i:1},
{c:'topo',t:'The local unwrap inherits the seam',d:'`unwrapPatch` builds a square of cells around a focus. When the patch straddles a face boundary the square is assembled through neighbour walks, which is correct, but nothing verifies it — and the flat map is exactly where a seam artefact would be most visible and least expected.',k:'DRAW',e:'M',i:2},
{c:'topo',t:'Rotating the cube relative to the planet',d:'The cube frame is fixed to the world axes, so the twelve edges always land in the same geographic places. Rotating the frame per world by a seeded quaternion spreads any residual artefact around instead of putting it through the same continent every time.',k:'MODEL',e:'M',i:2},
{c:'topo',t:'Poles are face corners',d:'On this layout the geographic poles sit at face centres, which is the good case. The corners land in mid-latitudes where continents are, which is the bad case. Worth stating in the model-limits document because it explains where to look for artefacts.',k:'PROVE',e:'S',i:2},
{c:'topo',t:'Seam-aware blur and diffusion helpers',n:['spheresample'],d:'A dozen places implement their own neighbour average. One `blurField(field, passes)` that is correct everywhere, used by all of them, removes a dozen chances to reintroduce this bug.',k:'MODEL',e:'M',i:3},
{c:'topo',t:'A visual seam probe in the app',n:['seamtest'],d:'A debug overlay that paints the magnitude of the first difference across every face boundary. When it is black, the topology is right; any time it lights up, something new is treating a face as the world.',k:'PROVE',e:'M',i:2},
{c:'topo',t:'Document the substrate',d:'The cube sphere, the equiangular warp, the neighbour construction, the area weights and the basis are the foundation of every field in the product, and there is no document explaining them. The engineering brief covers the systems above it and not this.',k:'PROVE',e:'M',i:2},

/* --------------------------------------------------------------- atlas -- */
{c:'atlas',t:'The field atlas blends across five face boundaries',g:'atlasfix',d:'Landed. Each face is an `(N+2)×(N+2)` tile. LINEAR no longer blends the last column of face *f* with the first of face *f+1*.',k:'DRAW',e:'M',i:3},
{c:'atlas',t:'Gutter the atlas',n:['atlasfix'],d:'Landed with `atlasfix`. One texel of true-neighbour data around each face, `12N + 24` texels per texture.',k:'DRAW',e:'M',i:3},
{c:'atlas',t:'Or use a cube map and let the hardware do it',n:['atlasfix'],d:'`TEXTURE_CUBE_MAP` with `TEXTURE_CUBE_MAP_SEAMLESS` is exactly this data structure with correct filtering built in, sampled by direction rather than by face-uv — which is also how the shader already has the surface normal. Larger change, smaller long-term surface area.',k:'DRAW',e:'L',i:3},
{c:'atlas',t:'Twelve fields at eight bits each',g:'floatfield',d:'Three RGBA8 textures carry life, ice, moisture, cloud, sediment, intertidal, precipitation, discharge, NPP, guild index, height and sea state. The GPGPU path already proves float framebuffers are available on this hardware — `[gpgpu] ready RGBA32F` is in the boot log — so at least height and precipitation should stop being quantised on the way to the shader.',k:'DRAW',e:'M',i:3},
{c:'atlas',t:'Guild index is a continuous ramp over a categorical variable',d:'Landed in the shader: the guild channel is sampled at the nearest texel so LINEAR cannot invent a metabolism between two guilds. The packing is still an index; a mask would be better.',k:'DRAW',e:'S',i:3},
{c:'atlas',t:'Precipitation is scaled by a magic 18',d:'`clamp((W.precip[c] || 0) * 18, 0, 1) * 255`. Whatever the units of `precip` are, an arbitrary multiplier chosen to make the texture look right means the shader and the simulation disagree about what a millimetre is.',k:'MODEL',e:'S',i:2},
{c:'atlas',t:'Discharge is log-compressed and nothing says so downstream',d:'`Math.log1p(flow) * (1 / Math.log1p(18))` — a good choice, made in the upload function, invisible to every consumer. Any shader that treats that channel as linear is drawing the wrong river.',k:'DRAW',e:'S',i:2},
{c:'atlas',t:'A packing document',n:['atlasfix'],d:'Landed as the comment on `uploadFieldTextures`: tex0 life/ice/moist/cloud, tex1 npp/guild/height/sea-state, tex2 sediment/intertidal/precip/discharge, plus the gutter rule.',k:'PROVE',e:'S',i:3},
{c:'atlas',t:'Upload only what changed',d:'`uploadFieldTextures` rewrites all three textures every frame from a full pass over NC. Most of these fields change on the sim tick, not on the frame; the ones that are interpolated for smoothness are a minority.',k:'DRAW',e:'M',i:2},
{c:'atlas',t:'The cloud shell resamples through the clamped sampler',d:'The realism pass fixed the cloud shell to sample bilinearly at matched resolution — through `sampleFaceField`, which clamps at face edges. So the fix is right everywhere except the twelve places this document is about.',k:'DRAW',e:'S',i:3},
{c:'atlas',t:'Mipmaps across a seam are worse than filtering across one',d:'If any field texture gains mipmaps for minification, the seam error grows with every level. Gutters have to be built per level, which is an argument for the cube map path.',k:'DRAW',e:'M',i:2},
{c:'atlas',t:'One shared atlas geometry for every consumer',d:'The globe shader, the cloud shell, the local map and the export path each work out where a cell lives in the atlas. One helper, one layout constant, one place to change when the layout changes.',k:'DRAW',e:'M',i:2},
{c:'atlas',t:'Height deserves more than a byte',n:['floatfield'],d:'`hs = clamp(0.5 + (h - localSea) * 2.2, 0, 1)` packs roughly ±4 km into 256 levels — about 30 m per step. Every relief shade, every slope computed by finite differences in the shader, and every sub-cell detail item in this document sits on that quantisation.',k:'DRAW',e:'M',i:3},
{c:'atlas',t:'Slope should be uploaded, not finite-differenced in the shader',d:'The shader derives relief from differences of a quantised height channel, which amplifies the quantisation. The simulation can compute an accurate slope and aspect once and upload it.',k:'DRAW',e:'M',i:2},
{c:'atlas',t:'A field inspector',d:'Draw any atlas channel to screen as-is, unfiltered, with its numeric range. Every artefact in this category is invisible until someone looks at the raw channel, and there is currently no way to.',k:'PROVE',e:'M',i:3},
{c:'atlas',t:'Assert the atlas round-trips',n:['seamtest'],d:'Write a known field, read it back through the same sampling path the shader uses, and assert the error is inside the quantisation step. It would have caught the packing bug the realism pass found and this one.',k:'PROVE',e:'M',i:3},
{c:'atlas',t:'Texture memory at high N',d:'At N=768 the atlas is 4,608 × 768 × 4 bytes × 3 — about 42 MB, before the mesh. `N_ALLOWED` goes there and nothing measures whether it survives.',k:'PROVE',e:'S',i:1},
{c:'atlas',t:'A no-atlas fallback path',d:'The whole picture depends on three textures uploading successfully. There is no diagnosis if they do not, only a planet that renders in flat vertex colours and no message.',k:'DRAW',e:'S',i:2},
{c:'atlas',t:'Interpolate fields in time as well as space',d:'`uploadFieldTextures(alpha)` lerps life and ice between ticks and uploads the other ten raw, so half the picture eases between sim ticks and half of it steps. At 10 kyr per tick that step is visible.',k:'DRAW',e:'S',i:2},
{c:'atlas',t:'Name the seam in the model-limits document',d:'Landed. `briefs/model-limits.md` now states that the atlas is guttered and the stencil crosses faces. The remaining picture-limits (30 m height quantisation, staircased coasts) stay there.',k:'PROVE',e:'S',i:2},
];

const P2 = [
/* --------------------------------------------------------------- fuzzy -- */
{c:'fuzzy',t:'Biome membership instead of a biome index',g:'fuzzybiome',d:'Landed. `biomeMembership` returns the two or three strongest biomes with weights summing to one, from distances in Whittaker space. `W.biome` is still the argmax for anything that needs an index; `W.biome2` / `W.biomeMix` carry the runner-up for colour.',k:'MODEL',e:'L',i:3},
{c:'fuzzy',t:'Blend the biome colour by membership',n:['fuzzybiome'],d:'Landed on the globe. `GROUND` colours are mixed by `biomeMix` so a savanna–grassland boundary is a gradient. The flat map still reads the argmax.',k:'DRAW',e:'M',i:3},
{c:'fuzzy',t:'Whittaker space needs more than two axes',n:['fuzzybiome'],d:'Temperature and annual precipitation cannot separate a monsoon forest from a rainforest, a cold desert from a hot one, or a karst landscape from a granite one. Seasonality, the wet-season fraction and the substrate are the next three axes, and each of them exists somewhere in the model already.',k:'MODEL',e:'M',i:3},
{c:'fuzzy',t:'The thresholds are Earth\'s and are stated as absolutes',d:'`tC < -5`, `ppt < 250`, `tC > 20 && ppt > 2000`. These are calibrated to Earth\'s vegetation and are applied unchanged to every world in the catalogue, including ones with no vegetation, no liquid water and no carbon chemistry.',k:'MODEL',e:'M',i:3},
{c:'fuzzy',t:'Precipitation is faked from moisture when it is missing',d:'`const ppt = (precip?.[c] ?? moist[c]) * 2000` — soil moisture standing in for annual rainfall, times two thousand. On any world or any tick where `precip` has not been computed, the entire biome map is a relabelling of the moisture field.',k:'MODEL',e:'S',i:3},
{c:'fuzzy',t:'Add hysteresis so biomes do not flicker',n:['fuzzybiome'],d:'A cell sitting on a threshold reclassifies every tick as the field jitters, which makes the map shimmer and the chronicle noisy. Real vegetation has decades of inertia; a membership vector that relaxes toward its target gives that for free.',k:'MODEL',e:'M',i:3},
{c:'fuzzy',t:'Vegetation has to grow into a biome, not be assigned one',n:['fuzzybiome'],d:'Classification says what the climate could support. What is actually there depends on what got there, how long it has had, and what burned it down last century. Separating potential from actual vegetation is the difference between a Köppen map and a planet.',k:'MODEL',e:'L',i:3},
{c:'fuzzy',t:'The same fuzziness for ocean provinces',d:'`gyre`, `upwelling`, `reef`, `deep` and `vent` are chosen by four thresholds on depth, upwelling index and reef density. The ocean has fronts, and a front is exactly a place where two memberships cross.',k:'MODEL',e:'M',i:2},
{c:'fuzzy',t:'Ice is a threshold too',d:'`ice > 0.55` short-circuits the entire biome classification, and `ice > 0.5` picks a different ocean colour. The ice edge is the sharpest line on the planet in every screenshot and the real one is a marginal ice zone hundreds of kilometres wide.',k:'MODEL',e:'S',i:3},
{c:'fuzzy',t:'Soft classification for the legend too',n:['fuzzybiome'],d:'`legendKeyAt` is a second, independent if-ladder that decides what a hovered cell is called. With memberships, the hover can say "savanna, grading to grassland" — which is both more honest and more interesting.',k:'DRAW',e:'M',i:2},
{c:'fuzzy',t:'Sub-grid variety within a cell',n:['fuzzybiome'],d:'A 104 km cell in real terrain contains forest on the north slopes, grass on the south, wetland in the valley. Membership is exactly the right representation for that, and the flat map is where it becomes visible.',k:'DRAW',e:'M',i:3},
{c:'fuzzy',t:'Fire as the thing that decides several boundaries',d:'The grassland/forest boundary is maintained by fire, not by climate. Without a disturbance term, any classification puts trees wherever the water allows and loses every savanna on the planet.',k:'MODEL',e:'M',i:2},
{c:'fuzzy',t:'Treeline from a real limit',d:'The upper and northern treelines follow growing-season temperature and wind exposure, not an annual mean. It is the most recognisable ecotone on Earth and the current classification cannot draw it at all.',k:'MODEL',e:'M',i:2},
{c:'fuzzy',t:'A Whittaker diagram in the Lab',n:['fuzzybiome'],d:'Plot every land cell in temperature–precipitation space with the biome regions behind it. It is the single clearest picture of what the classification is doing, and it makes a bad classification obvious in one glance.',k:'PROVE',e:'M',i:3},
{c:'fuzzy',t:'Compare against real Earth',n:['fuzzybiome'],d:'`calibrate.mjs` asserts climate scalars. The area fraction of each biome on modern Earth is well known; asserting them turns the classification from a lambda into something falsifiable.',k:'PROVE',e:'M',i:3},
{c:'fuzzy',t:'Guild dominance has the same fault',d:'`dominantGuildAt` returns the single strongest guild above a 0.08 floor, so the guild overlay is a hard partition of a continuous mixture. Mats are mixtures; the picture should be too.',k:'MODEL',e:'S',i:2},
{c:'fuzzy',t:'`lifeClass` is a hard partition of a derived quantity',d:'`deriveLifeClass` writes a single integer 0–7 per cell from global transitions. The life backlog wants that retired; this category wants at minimum that its rendering blends rather than steps.',k:'MODEL',e:'M',i:2},
{c:'fuzzy',t:'Biome names are Earth names',d:'"boreal", "tempDeciduous", "tropRainforest". On a world with a different star, a different day length and a different chemistry these are the wrong words, and using them tells the player something false without ever saying it.',k:'MODEL',e:'M',i:2},
{c:'fuzzy',t:'A membership field costs memory',n:['fuzzybiome'],d:'Three weights and three indices per cell is six bytes against one. At N=768 that is 27 MB against 4.5. Worth stating before the change, because the resolution ceiling is a real constraint in this product.',k:'PROVE',e:'S',i:2},
{c:'fuzzy',t:'A banding metric',g:'bandmetric',d:'Landed in `surfaceStats.js` as neighbour ΔE on biome ground colour: mean, max, and the fraction of land–land pairs above 28. A hard classification produces long thin runs; this is the number that should fall as the rest of `fuzzy` lands.',k:'PROVE',e:'M',i:3},

/* ------------------------------------------------------------- ecotone -- */
{c:'ecotone',t:'The boundary is a place',g:'ecotone',n:['fuzzybiome'],d:'Landed. Cells whose top membership is below 0.7 are the ecotone network; `W.ecotoneFrac` is that share of land. Diversity still treats the network as invisible — that half is ahead.',k:'MODEL',e:'M',i:3},
{c:'ecotone',t:'Diversity should peak on boundaries',n:['ecotone'],d:'Edge effects are one of the most robust results in ecology. With the life pass shipped, lineages can be given a boundary preference and the latitudinal diversity gradient stops being the only spatial structure diversity has.',k:'MODEL',e:'M',i:3},
{c:'ecotone',t:'The intertidal is the ecotone that matters most',d:'`W.intertidal[c]` exists, feeds one desiccation term in `fitness()`, and is packed into a texture channel. It is where land life came from, it is drawable, and it is currently a number nobody looks at.',k:'MODEL',e:'M',i:3},
{c:'ecotone',t:'Riparian corridors',n:['riverfield'],d:'A river in a dry landscape carries a ribbon of different vegetation for its whole length. It is the highest-contrast, most recognisable ecological feature in any arid region and it needs the drainage network to exist first.',k:'MODEL',e:'M',i:3},
{c:'ecotone',t:'Coastal fog belts',n:['vapourfield'],d:'Cold upwelling next to a hot desert produces a narrow strip of fog-fed vegetation — Atacama, Namib, California. Every ingredient is in the model and the combination has never been asked for.',k:'MODEL',e:'M',i:2},
{c:'ecotone',t:'Mangrove and salt marsh',d:'The boundary between a river\'s fresh water and the sea has its own biota and its own landform. It is also the single best visual cue that a coastline is a real coastline rather than a contour.',k:'MODEL',e:'M',i:2},
{c:'ecotone',t:'Treeline drawn as a line',n:['ecotone'],d:'Once the classification is soft, the treeline is the contour where tree membership crosses a half. Drawing it as an actual line on the globe is one of the most legible things this product could add.',k:'DRAW',e:'M',i:3},
{c:'ecotone',t:'The ice margin as a zone',d:'Marginal ice, fast ice, polynya, iceberg field. The current representation is one float and two constants; the real thing is the most dynamic boundary on the planet.',k:'MODEL',e:'M',i:3},
{c:'ecotone',t:'Ocean fronts',d:'Where two water masses meet there is a sharp gradient in temperature, salinity and productivity, and the world\'s fisheries sit on them. The currents backlog builds the velocity field these need.',k:'MODEL',e:'M',i:2},
{c:'ecotone',t:'The tension zone shifts with climate',n:['ecotone'],d:'A moving boundary is a far better climate signal than a moving mean, because it is visible. Tracking ecotone displacement per era gives the chronicle something concrete to report.',k:'MODEL',e:'M',i:2},
{c:'ecotone',t:'Ecotones in the flat map',n:['ecotone'],d:'At 1,632 km across the local view is exactly the scale at which an ecotone is a landscape feature rather than a line. This is the view where soft classification pays off most.',k:'DRAW',e:'M',i:3},
{c:'ecotone',t:'Give an ecotone a sound',d:'`audio.js` layers a soundscape by cell. A boundary between two biomes is where two soundscapes overlap, which is both accurate and immediately legible.',k:'DRAW',e:'M',i:1},
{c:'ecotone',t:'Habitat patchiness as a number',n:['ecotone'],d:'Edge density per unit area is a standard landscape-ecology metric and a good single-number summary of how heterogeneous a world is. It also happens to be a decent proxy for how interesting a planet looks.',k:'PROVE',e:'S',i:2},
{c:'ecotone',t:'Corridors and barriers for dispersal',n:['ecotone'],d:'The life backlog\'s biogeography items need to know what a lineage can cross. A membership field is the natural substrate for a cost surface.',k:'MODEL',e:'M',i:3},
{c:'ecotone',t:'Disturbance patches',d:'Fire scars, blowdowns, lava flows, flood scour. Patches of early succession inside a mature biome are what real satellite imagery of a forest actually looks like.',k:'MODEL',e:'M',i:2},
{c:'ecotone',t:'Succession after disturbance',n:['ecotone'],d:'A patch should recover through a sequence, not snap back to its classification. It is the mechanism that makes a landscape look like it has a history.',k:'MODEL',e:'M',i:3},
{c:'ecotone',t:'Refugia fall out of ecotone tracking',d:'Places whose membership stays stable while everything around them moves are, definitionally, refugia. The life backlog wants them; this is where they come from.',k:'MODEL',e:'M',i:3},
{c:'ecotone',t:'Name the boundaries',d:'The Wallace line, the tension zone, the tree line, the Sahel. A named boundary is a place, and a planet with named boundaries is one somebody can talk about.',k:'DRAW',e:'M',i:2},
{c:'ecotone',t:'An ecotone overlay',n:['ecotone'],d:'Landed as overlay mode `ecotone`: membership entropy, bright on boundaries, dark in cores.',k:'DRAW',e:'S',i:3},
{c:'ecotone',t:'Assert that boundaries are not lines',n:['bandmetric','ecotone'],d:'Landed. `W.ecotoneFrac` is asserted away from zero after generate, so a hard classification cannot silently return.',k:'PROVE',e:'M',i:3},

/* ------------------------------------------------------------- contour -- */
{c:'contour',t:'A signed distance to the shoreline',g:'coastsdf',d:'Landed. `W.coastDist` is kilometres from the sea-level contour, positive inland and negative at sea, rebuilt with the drain tree. The beach tint reads it. Fractional `landCover` and shader `fwidth` AA now ride the same contour.',k:'MODEL',e:'M',i:3},
{c:'contour',t:'Marching squares on the height field',g:'isoline',n:['coastsdf'],d:'Landed. `updateIsoline` walks each face with `cellAt`, stores `W.coastLine` xyz segments, and rebuilds when hydro is dirty or sea level moves. `squareSegments` is the same extractor the flat map uses.',k:'MODEL',e:'M',i:3},
{c:'contour',t:'Antialias the shoreline in the shader',n:['coastsdf'],d:'With a distance field, the land/sea edge becomes a `smoothstep` over one pixel of screen space instead of a step over one cell of world space. This is the single change that makes a thumbnail of the planet read correctly.',k:'DRAW',e:'M',i:3},
{c:'contour',t:'Fractional land coverage per cell',n:['coastsdf'],d:'A coastal cell is part land and part sea, and every global mean that partitions by `h < seaLevel` is quantised by that. Land fraction, albedo, evaporation and carbon weathering are all currently computed on a binary partition of a 104 km grid.',k:'MODEL',e:'M',i:3},
{c:'contour',t:'Coastline length is a fractal and the product reports one number',d:'`landmassReport` counts cells. Coastline length depends entirely on the ruler, which is the classic result, and stating a length without stating a scale is meaningless. Report it as a curve.',k:'PROVE',e:'M',i:2},
{c:'contour',t:'Sub-cell coastal landforms',n:['isoline'],d:'Spits, barrier islands, tombolos, cuspate forelands and estuaries are all sub-cell at 104 km. With a contour they can be generated *along* it as decorations with real rules, rather than needing the grid to resolve them.',k:'MODEL',e:'L',i:3},
{c:'contour',t:'Fjords need a glacial history and a contour',n:['glacio','isoline'],d:'A fjord is an overdeepened glacial valley drowned by sea-level rise. Both halves are missing; together they are the most recognisable coastline type on Earth after a river delta.',k:'MODEL',e:'M',i:2},
{c:'contour',t:'Deltas where rivers meet the sea',n:['riverfield','isoline'],d:'`sediment` exists as a field and never accumulates at a river mouth. A delta is where the two largest missing systems in this document meet, and it is drawable at sub-cell scale along the contour.',k:'MODEL',e:'M',i:3},
{c:'contour',t:'Contours for other boundaries too',n:['isoline'],d:'The same machinery draws the treeline, the ice margin, the snow line, the desert edge and the plate boundary. One isoline extractor, six visible features.',k:'DRAW',e:'M',i:3},
{c:'contour',t:'A shelf that exists in the hypsometry',d:'The landscape pass added a three-cell oceanward terrace. The measured deciles still jump from −0.574 to −0.033 in one step — 40% of the world\'s relief crossed inside 10% of its area. Until the curve has a shelf population in it, no coastal item can look right.',k:'MODEL',e:'M',i:3},
{c:'contour',t:'The surf band is a shader constant',d:'One ochre `smoothstep` in the fragment shader, at a fixed width, on every world. Surf width depends on slope, fetch, wave height and tidal range — three of which are computed and none of which reaches it.',k:'DRAW',e:'M',i:2},
{c:'contour',t:'Beaches need sediment supply',n:['sedfield'],d:'A beach exists where longshore transport delivers more sand than it removes. Without a sediment budget, every coast in the product is either rock or nothing, and the difference between a rocky and a sandy coast is one of the biggest visual cues of scale.',k:'MODEL',e:'M',i:2},
{c:'contour',t:'Cliffs where the sea is eroding',d:'Wave energy against rock resistance gives a retreat rate. Cliffed coasts, wave-cut platforms and stacks follow, and the wave field already exists.',k:'MODEL',e:'M',i:2},
{c:'contour',t:'The tidal range should widen the shore',d:'`W.intertidal[c]` is computed from tide range and slope, and is drawn nowhere except as a texture channel nothing reads. A ten-metre tidal range makes a shore kilometres wide, which is a landform.',k:'DRAW',e:'S',i:3},
{c:'contour',t:'Lakes and inland shorelines',d:'`computeRivers` produces depression lakes. They get the same treatment or they look like holes: a shoreline, a level, a colour that depends on depth and turbidity.',k:'MODEL',e:'M',i:2},
{c:'contour',t:'Islands smaller than a cell',n:['isoline'],d:'Ten of the 22 landmasses on the default world are one cell — 104 km across and made of nothing. A sub-cell representation lets an island be an island rather than a lone square.',k:'MODEL',e:'M',i:3},
{c:'contour',t:'The contour must survive a sea-level change',n:['isoline'],d:'Landed. `hydroTick` rebuilds the signed distance and the polyline whenever sea level moves more than 0.002.',k:'MODEL',e:'M',i:2},
{c:'contour',t:'Draw the coastline as a line',n:['isoline'],d:'Landed. The globe draws `W.coastLine` with `flatProg` after the planet; the shader water mask uses `fwidth(hCoast)` so the waterline itself antialiases.',k:'DRAW',e:'M',i:3},
{c:'contour',t:'The flat map should use the same contour',n:['isoline','onecell'],d:'Landed. `drawLocalView` runs `squareSegments` on each 2×2 of the unwrap so the map coastline is the same extractor as the globe polyline.',k:'DRAW',e:'M',i:3},
{c:'contour',t:'Measure the staircase',n:['bandmetric'],d:'Landed in `surfaceStats.js`: fraction of coastline cells sitting on an axis-aligned run of length ≥ 4. It is the number `isoline` has to drive down.',k:'PROVE',e:'M',i:3},

/* -------------------------------------------------------------- detail -- */
{c:'detail',t:'One noise pyramid, shared by every view',g:'detailfield',d:'The globe shader has two octaves of object-space mottle; the local map stamps from `hash2(c, 0x11fe)`; the terrain generator uses five different fBm calls with different frequencies and seeds. Nothing is shared, so zooming in shows a different world rather than more of the same world. One coherent multi-octave field, defined on the sphere and evaluable at any scale, is the fix.',k:'MODEL',e:'L',i:3},
{c:'detail',t:'Detail must be derived from the cell, not decorate it',n:['detailfield'],d:'Sub-cell detail should be conditioned on what the simulation says is there — slope, substrate, wetness, cover, drainage — so that zooming reveals consequences rather than noise. Otherwise it is a texture and the player learns to ignore it.',k:'DRAW',e:'M',i:3},
{c:'detail',t:'Fade detail before it aliases',d:'The realism pass added `fwidth` fades on the two existing octaves, which is correct and needs to become the rule for every octave added by this category. Detail that aliases is worse than no detail.',k:'DRAW',e:'M',i:3},
{c:'detail',t:'Different substrates get different grain',n:['substrate'],d:'Sand ripples, lava ropes, ice crevasses, karst fluting, tundra polygons. The grain of a surface is one of the strongest cues to what it is made of, and every world in the product currently has the same grain.',k:'DRAW',e:'M',i:3},
{c:'detail',t:'Drainage texture at intermediate zoom',n:['riverfield'],d:'The most recognisable pattern in any aerial photograph of land is its drainage network — dendritic on uniform rock, trellised on folded rock, radial on a volcano. It is also a direct readout of the geology underneath.',k:'DRAW',e:'M',i:3},
{c:'detail',t:'Ridges and valleys below the cell',n:['detailfield'],d:'A 104 km cell with a mean slope contains a specific texture of ridges and valleys whose spacing follows from that slope and from the rock. Synthesising it is what makes a mountain range look like mountains at any zoom.',k:'DRAW',e:'M',i:3},
{c:'detail',t:'The flat map draws the identical image every frame',d:'The living backlog measured this: `drawLocalView` rebuilds a BFS patch and thousands of canvas stamps per frame, and every stamp is seeded from a hash with no time term. It costs like an animation and reads like a photograph.',k:'DRAW',e:'M',i:3},
{c:'detail',t:'A stamp should know what it is standing on',d:'The flat map places sprites by cell class. With a shared detail field and a slope, a tree can stand on a slope, a boulder can sit in a talus fan, and a reed can be at the water\'s edge.',k:'DRAW',e:'M',i:2},
{c:'detail',t:'Continuity across a zoom rung',d:'Eight zoom rungs, and crossing one currently redraws the patch from scratch. Detail that is a function of position rather than of the current rung crosses rungs without popping.',k:'DRAW',e:'M',i:3},
{c:'detail',t:'Detail should be seeded from the world',d:'Every sub-cell hash in the product uses a hard-coded constant. Two worlds with different seeds have identical sub-cell texture, which is the same fault the landscape pass fixed one level up.',k:'DRAW',e:'S',i:2},
{c:'detail',t:'Cast shadows from sub-cell relief',n:['detailfield'],d:'The realism pass added a sun-direction relief term. Real terrain reads because low sun throws long shadows, and the terminator is where a planet looks most three-dimensional.',k:'DRAW',e:'M',i:2},
{c:'detail',t:'Snow and ice should follow sub-cell aspect',n:['detailfield'],d:'North-facing slopes hold snow longer. It is one of the most visible textures in any mountain photograph and it comes free once aspect exists below the cell.',k:'DRAW',e:'M',i:2},
{c:'detail',t:'Vegetation density as a texture, not a tint',d:'Canopy cover at 104 km is a fraction; drawn as a flat tint it reads as paint. Drawn as varying density against the substrate it reads as forest, and the difference is one noise lookup.',k:'DRAW',e:'M',i:3},
{c:'detail',t:'Cloud detail below the cell',d:'The cloud shell samples an 8-bit coverage field at a quarter of grid resolution. Cloud is the highest-frequency thing on any planet and it is currently the lowest-frequency thing in the render.',k:'DRAW',e:'M',i:2},
{c:'detail',t:'A detail budget per zoom rung',n:['detailfield'],d:'Every octave costs. State how many are affordable at each rung and enforce it, so the ground view is not accidentally cheaper than the orbital view.',k:'PROVE',e:'M',i:2},
{c:'detail',t:'Detail must be deterministic',n:['detailfield'],d:'The same position at the same seed must produce the same detail on every machine and after every reload, or screenshots and golden tests are impossible.',k:'PROVE',e:'S',i:3},
{c:'detail',t:'The mesh already has the vertices',d:'`GLOBE_SUBD` gives four vertices per cell. Displacing them from the detail field is the cheapest possible sub-cell relief and it needs no new geometry.',k:'DRAW',e:'M',i:3},
{c:'detail',t:'Sub-cell detail on the limb',d:'The realism pass identified the limb as one of the two edges that survive a thumbnail. A displaced silhouette at the limb is what makes a planet look like a body rather than a sphere with a picture on it.',k:'DRAW',e:'M',i:3},
{c:'detail',t:'Do not let detail contradict the simulation',n:['detailfield'],d:'If the sub-cell field says there is a ridge where the drainage says there is a valley, the picture is lying. Detail synthesis has to be constrained by the fields it decorates, which is the whole difficulty.',k:'MODEL',e:'L',i:3},
{c:'detail',t:'A zoom-continuity test',n:['pixtest','detailfield'],d:'Render the same location at two adjacent rungs and assert the low-frequency content matches. It is the only way to catch a detail system that quietly changes the world as you approach it.',k:'PROVE',e:'M',i:3},
];

const P3 = [
/* ---------------------------------------------------------------- bits -- */
{c:'bits',t:'Dither before quantising',g:'dither',d:'Landed. `spreadVertexDat` applies a 4×4 Bayer dither on the vertex grid before the 8-bit cast, so shallow gradients terrace at screen scale instead of at cell scale.',k:'DRAW',e:'M',i:3},
{c:'bits',t:'Round instead of truncating',n:['dither'],d:'Landed. `spreadVertexDat` and the cell bake round instead of `| 0`, then dither.',k:'DRAW',e:'S',i:3},
{c:'bits',t:'Keep the blend in higher precision',n:['dither'],d:'Landed. The four-tap blend stays in float, then a Bayer dither feeds `u8round`. Terracing where four similar cells meet is the remaining 8-bit floor, not a truncation bias.',k:'DRAW',e:'M',i:2},
{c:'bits',t:'Float fields where precision matters',n:['floatfield'],d:'Height, precipitation and discharge are the three channels whose quantisation is visible as terrain artefacts. `RGBA32F` is available on this hardware per the boot log; it does not have to be all twelve channels.',k:'DRAW',e:'M',i:3},
{c:'bits',t:'Say what a level is worth',d:'`hs = clamp(0.5 + (h − localSea) × 2.2, 0, 1)` — a level is about 30 m of elevation. `precip × 18` — a level is an unknown amount of rain. Document the physical value of one quantisation step per channel; several of them turn out to be larger than the feature they are meant to carry.',k:'PROVE',e:'S',i:3},
{c:'bits',t:'The terrain field itself is float and stays float',d:'`W.h` is a `Float32Array` and is quantised only on the way to the shader. That is the right architecture, and it means every artefact in this category is a rendering fault rather than a simulation one — worth stating, because it bounds the fix.',k:'PROVE',e:'S',i:2},
{c:'bits',t:'Banding is worst on the shallow gradients',d:'A steep gradient crosses many levels per pixel and hides quantisation; a shallow one shows it. The abyssal plain, the open desert and a calm sky are exactly the large flat regions where the eye is best at seeing a step.',k:'DRAW',e:'S',i:2},
{c:'bits',t:'Temperature rides in the alpha channel',d:'`_cellDat[o + 3] = clamp(temp, 0, 1) * 255` — the surface colour buffer\'s alpha is a temperature field. It works, and it means anything that ever wants real alpha on the surface has to move it first.',k:'DRAW',e:'S',i:2},
{c:'bits',t:'Tonemap before quantising, not after',d:'The realism pass found the atmosphere shell was never tonemapped and clipped the sunward limb to white. Any HDR value written into an 8-bit buffer needs its curve applied first, and the surface path still writes display-referred bytes computed from 54 linear lerps.',k:'DRAW',e:'M',i:3},
{c:'bits',t:'An HDR surface buffer',n:['gpucolour'],d:'Once colour is computed in the shader from float fields, the intermediate can stay in half-float through to the tonemap. That removes every quantisation in this category in one step, which is why `gpucolour` is worth its cost.',k:'DRAW',e:'L',i:3},
{c:'bits',t:'Dither the cloud coverage too',d:'Cloud is 8-bit after the realism pass and it is the smoothest large-area gradient in the picture, which makes it the most visible banding surface in the product.',k:'DRAW',e:'S',i:2},
{c:'bits',t:'Overlay ramps are the worst offenders',n:['inksmooth'],d:'`r = t × 255; g = (1 − |t − 0.5| × 2) × 180; b = (1 − t) × 255` — a three-channel ramp written straight to bytes at nearest-neighbour vertices. Overlays are pure gradient and pure information, so they band worse than anything.',k:'DRAW',e:'S',i:3},
{c:'bits',t:'Perceptually uniform overlay ramps',n:['inksmooth'],d:'A linear RGB ramp is not perceptually linear, so equal steps in the data are unequal steps to the eye and the ramp invents structure that is not in the field. This is a solved problem with published palettes.',k:'DRAW',e:'M',i:3},
{c:'bits',t:'Never use a rainbow ramp for a scalar',d:'Several overlays approximate one. It creates false boundaries at the hue transitions, which in a document about spurious banding is worth naming explicitly.',k:'DRAW',e:'S',i:3},
{c:'bits',t:'Diverging ramps for diverging quantities',d:'ENSO, δ¹³C and anomaly fields have a meaningful zero and are drawn on sequential ramps, which hides the sign. A diverging ramp centred on zero is both more correct and more legible.',k:'DRAW',e:'S',i:2},
{c:'bits',t:'A banding test on a synthetic ramp',n:['pixtest','dither'],d:'Render a known linear field across the globe and count distinct output levels along a great circle. It should be near the screen\'s bit depth, not near the texture\'s.',k:'PROVE',e:'M',i:3},
{c:'bits',t:'Check the display path end to end',d:'Colour is computed in sRGB bytes, blended in sRGB, uploaded as `UNSIGNED_BYTE`, sampled linearly, and written to a canvas whose colour space is unstated. At least one of those steps is doing an unintended conversion.',k:'DRAW',e:'M',i:2},
{c:'bits',t:'Screenshots should not be 8-bit twice',d:'`exportPng` reads back the framebuffer that was already quantised. If the pipeline gains an HDR buffer, export should read from it.',k:'DRAW',e:'S',i:1},
{c:'bits',t:'Guild index must never be filtered',n:['atlasfix'],d:'Named again here because it is a quantisation fault of a different kind: a category packed into a linearly filtered 8-bit channel produces values that correspond to guilds nothing in that cell contains.',k:'DRAW',e:'S',i:3},
{c:'bits',t:'A precision section in model-limits',d:'Thirty metres per height level, an unknown amount per precipitation level, a category in a filtered channel. These are limits of the picture and they belong next to the limits of the physics.',k:'PROVE',e:'S',i:2},

/* ---------------------------------------------------------------- ramp -- */
{c:'ramp',t:'The ocean ramp saturates at 530 metres',g:'depthramp',d:'Landed. `oceanDepth01` is a two-scale optical ramp — shelf exponential plus a slower log for the abyss — so half the planet is no longer one saturated navy.',k:'DRAW',e:'S',i:3},
{c:'ramp',t:'Fit every ramp to its own histogram',n:['depthramp'],d:'Land elevation, depth, precipitation and NPP all have long-tailed distributions that vary by world. Ramps fitted to percentiles rather than to fixed constants use their whole range on every planet, including the ones the constants were not chosen for.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Depth colour should be optical, not decorative',n:['depthramp'],d:'Water attenuates red at about 0.45 per metre and blue at 0.045 — the sensory model computes exactly this for eyes. Running the same attenuation on the ocean colour gives the correct hue shift with depth for free, and it is the thing that makes shallow tropical water read as shallow tropical water.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Turbidity and sediment change ocean colour more than depth does',d:'`sediment` is a field. River plumes, glacial flour, coccolithophore blooms and upwelling all change the colour of the sea in ways visible from orbit, and the current ocean colour depends on depth and ice alone.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'A hypsometric colour scheme',n:['depthramp'],d:'Cartographers solved this: bands chosen by area, not by elevation, so each colour covers a comparable fraction of the map. It also makes the shelf, the plain and the summits legible as distinct populations, which is what the hypsometry items are about.',k:'DRAW',e:'M',i:2},
{c:'ramp',t:'Land colour is a per-ruleset lambda',d:'`R.land(temp, moist, life, e, ice, extra)` — one function per ruleset producing a triple. Every land colour decision in the product is inside five of these, and they are not comparable, testable or editable.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Ramps should be data',n:['palettedoc'],d:'A ramp is a list of stops with positions and a colour space. As data it can be shared, previewed, swapped per world and checked for contrast; as a lambda it can only be read.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'The same ramp in both views',n:['onecell'],d:'The globe and the flat map choose their colours independently, so the same depth is two colours depending on which view you are in. Nothing announces this and it quietly undermines the product\'s central metaphor.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Elevation exaggeration and colour must be designed together',d:'Earth renders at 0.028 relief, other worlds at 0.05. The colour ramp is unchanged between them, so a world with twice the exaggeration gets the same colour per unit height and reads as flatter.',k:'DRAW',e:'M',i:2},
{c:'ramp',t:'Real-Earth reference colours',d:'The `eoref` shelf of NASA stills exists specifically so the Earth palette can be checked against a photograph. Extend it to depth: the measured colour of open ocean, shelf and turbid coastal water are published numbers.',k:'PROVE',e:'M',i:3},
{c:'ramp',t:'A ramp preview strip in the Lab',n:['palettedoc'],d:'Show every active ramp with its stops and its current data range. It is the fastest possible way to see that a ramp is saturating, and the depth ramp has been saturating for the entire life of the project.',k:'PROVE',e:'S',i:3},
{c:'ramp',t:'Contrast between adjacent categories',d:'Two biomes with similar colours are indistinguishable at orbital scale; two with wildly different ones make a boundary look painted. Check ΔE between every adjacent pair in the palette.',k:'PROVE',e:'M',i:2},
{c:'ramp',t:'Colour-blind safe surface palettes',d:'The land–sea distinction and the vegetation ramp both lean on red–green separation. A safe alternative palette is a setting, not a rewrite, once ramps are data.',k:'DRAW',e:'M',i:2},
{c:'ramp',t:'Night side colour',d:'The unlit hemisphere currently uses the same palette at low luminance. Real night is a different colour temperature and mostly shows the things that emit — cities, lava, aurora, lightning, bioluminescence.',k:'DRAW',e:'M',i:2},
{c:'ramp',t:'Atmospheric perspective changes surface colour with angle',d:'Toward the limb, more air sits between the surface and the camera, so colours desaturate and shift blue. The realism pass added a limb volume term; the surface colour does not know about it.',k:'DRAW',e:'M',i:2},
{c:'ramp',t:'Sun angle should change the colour, not only the brightness',d:'Low sun is red, and a low-sun landscape is a different colour, not a darker one. The terminator is where a planet is most beautiful and it is currently a brightness ramp.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'A ramp per era',d:'An Archean ocean is green-grey with iron, a Cryogenian one is white, a Devonian coast is different from a Holocene one. The time machine exists; the palette does not move with it.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Do not let two systems both paint the same signal',d:'Life colour, biome colour, guild colour and NPP overlay are four representations of overlapping quantities that can all be on at once. Decide which owns the surface and which is ink.',k:'DRAW',e:'M',i:2},
{c:'ramp',t:'The albedo the renderer draws should be the albedo the climate uses',d:'Surface colour is computed in `refreshColours`; planetary albedo is computed separately in the climate model. Nothing checks that a world that looks bright is a world that is bright, and on Daisyworld that is the entire mechanism.',k:'MODEL',e:'M',i:3},
{c:'ramp',t:'An albedo consistency test',n:['pixtest'],d:'Integrate the rendered surface luminance over the disc and compare against the model\'s bond albedo. They should agree within a stated tolerance, and if they do not, one of the two is wrong about the planet.',k:'PROVE',e:'M',i:3},

/* ---------------------------------------------------------------- belt -- */
{c:'belt',t:'Ninety-two sites read latitude, and most should not',g:'beltaudit',d:'Landed the triage. Remaining `DIR.y` reads are insolation, Coriolis, the equatorial waveguide, seasonal hemisphere and teaching labels. Vegetation, ice floors, rain base, ENSO x-sign and cloud gaussians are gone. `calibrate.mjs` prints zonal R² after each Earth check.',k:'MODEL',e:'M',i:3},
{c:'belt',t:'The desert belt is a literal band',d:'Landed the deletion. `primeEarthMoisture` and `seedEarthBiosphere` no longer use `desertBelt = lat > 0.28 && lat < 0.50`. Interiors dry because `W.cont` is large, not because they sit on a parallel.',k:'MODEL',e:'M',i:3},
{c:'belt',t:'Vegetation is seeded by latitude cut-offs',n:['beltaudit'],d:'Landed the deletion. `seedEarthBiosphere` no longer gates forests, grasslands or reefs on `lat < 0.28 / 0.55 / 0.75`. Life follows temperature, moisture, ice and continentality. Polar ice now follows coldness, not a latitude floor.',k:'MODEL',e:'M',i:3},
{c:'belt',t:'The precipitation base is a latitude function',g:'preciplat',d:'Landed the deletion. Rain is `vapour × maritime`, plus orographic, monsoon and ENSO terms. The curve that peaked at ±17° is gone; remaining tropical structure is vapour, ITCZ inflow and the monsoon on warm summer land.',k:'MODEL',e:'M',i:3},
{c:'belt',t:'Wind is three prescribed bands',d:'Landed. The sine-of-latitude bands and the prescribed trades/westerlies are gone. Wind is geostrophy of `W.press` plus ITCZ inflow, Walker, monsoon and land drag. `computeWinds` is unused.',k:'MODEL',e:'M',i:3},
{c:'belt',t:'A pressure field, so circulation is a solution',g:'pressfield',n:['beltaudit'],d:'Landed. `W.press` is diagnosed from temperature, elevation and ice, then geostrophy plus a remembered last tick. The `sin((lat−itcz)×π×nCells)` bands and the prescribed trades/westerlies are gone; ITCZ inflow, Walker, monsoon and land drag remain. Cell count still labels the regime from rotation.',k:'MODEL',e:'L',i:3},
{c:'belt',t:'Ice is placed by latitude in several places',d:'Landed the Earth deletion. `seedPolarIce` and `iceTick` use coldness from temperature and elevation, not `absLat > 0.78 / 0.86`. Seasonal hemisphere still reads latitude (insolation). Ice-shell worlds keep their own phase tick.',k:'MODEL',e:'M',i:2},
{c:'belt',t:'ENSO is applied by longitude sign',d:'Landed. `noteTropicalBasin` flood-fills the largest tropical ocean; west/east is relative to that basin\'s centroid, not world-space `x`. Walker ascent and the rain dipole read `ensoEastness`.',k:'MODEL',e:'M',i:2},
{c:'belt',t:'The monsoon is a latitude window',d:'Landed the window deletion. Monsoon rain is extra vapour on warm summer-hemisphere land. Monsoon wind now uses the land–sea temperature contrast on all warm cells, not a tropical mean, and skips entirely on tidally locked worlds.',k:'MODEL',e:'M',i:2},
{c:'belt',t:'Continentality is missing entirely',g:'continental',d:'Landed. `updateContinentality` is a BFS from the coastline, stored in `W.cont` as kilometres. Precipitation and Earth moisture seeding both decay with it. Interiors are dry because they are far from the sea, not because they sit on a latitude.',k:'MODEL',e:'M',i:3},
{c:'belt',t:'Land–sea thermal contrast',n:['continental'],d:'Landed. Ocean thermal mass is ~5× land; inland cells (from `W.cont`) swing faster still. Maritime neighbours sit in between. Polar extra cooling follows weak insolation, not `lat²`.',k:'MODEL',e:'M',i:3},
{c:'belt',t:'Ocean heat transport moves the isotherms',d:'Landed a first cut. `oceanTick` advects `oceanSurf` with wind-stress gyres, dumps heat into air, and cools under upwelling. Western-boundary intensification and the conveyor still own the rest of the currents backlog.',k:'MODEL',e:'L',i:3},
{c:'belt',t:'Obliquity should change the banding',d:'Landed with honest insolation. `dailyMeanMu` is the daily-mean TOA cosine: polar night is dark, polar day is `sin φ sin δ`. At high obliquity the poles beat the equator in the annual mean — asserted in `test.mjs`.',k:'MODEL',e:'M',i:3},
{c:'belt',t:'A tidally locked world has no bands at all',d:'Landed a first cut. Locked insolation is substellar only. `geostrophicWind` skips ITCZ, Walker and monsoon latitude terms and names the regime `substellar`. `alienTick` no longer paints a terminator life ring on top of a banded base — it only suppresses the hot and cold extremes.',k:'MODEL',e:'M',i:3},
{c:'belt',t:'Insolation is the one thing that should be latitudinal',d:'Landed. `dailyMeanMu` uses declination and hour angle (polar day/night). Eccentricity still scales the solar constant via `_solarMod`. The GPGPU sun atlas uses the same `geometricInsolation`. Earth equator is fitted to the old 0.55 so `meanTemp` stays in calibrate.',k:'MODEL',e:'M',i:3},
{c:'belt',t:'A zonal-anomaly overlay',g:'zonalviz',d:'Landed as overlay mode `zonal`: temperature minus a latitude-only guess. A purely banded field goes dark; real structure lights up. The metric (fraction of variance) is still ahead.',k:'PROVE',e:'M',i:3},
{c:'belt',t:'A zonal-fraction metric',n:['zonalviz'],d:'Landed in `surfaceStats.js`: R² of a field against its 18-bin zonal mean. Temperature, precipitation, life and moisture are printed per world.',k:'PROVE',e:'M',i:3},
{c:'belt',t:'Compare against real Earth zonal statistics',n:['zonalviz'],d:'Landed a loose first cut in `calibrate.mjs`: Earth temperature zonal R² in `[0.12, 0.92]`, precip less zonal than a full belt, tropics warmer than poles. Not a published profile yet — enough to catch over-banding and the opposite failure.',k:'PROVE',e:'M',i:3},
{c:'belt',t:'Delete a shortcut, then measure',n:['beltaudit','zonalviz'],d:'Landed as process. Each Earth generate prints zonal R² for temp, precip, life and moisture via `surfaceStats`; `calibrateEarth` asserts temp vs precip banding. Remaining latitude reads are the physical list.',k:'PROVE',e:'M',i:3},
{c:'belt',t:'Say in the UI which bands are computed',d:'Landed. The climate panel names the regime from `_windCells` and says Earth-like three-cell banding is from pressure and spin, not a lookup.',k:'PROVE',e:'S',i:2},

/* ---------------------------------------------------------------- circ -- */
{c:'circ',t:'A surface pressure field',n:['pressfield'],d:'Landed. Diagnostic pressure from temperature, height and ice, with a 70/30 blend against last tick so the field has memory. Wind is geostrophy of that field.',k:'MODEL',e:'L',i:3},
{c:'circ',t:'The number of circulation cells should follow from rotation',n:['pressfield'],d:'Landed as a label: `circulationCellCount` maps rotation period to 1–7 cells and `_windRegime` names it. The wind itself is no longer a sine of that count; faster rotators still read as more, narrower structure because Coriolis scales with spin.',k:'MODEL',e:'L',i:3},
{c:'circ',t:'The ITCZ should move with the heating',d:'Landed as a blend: 35% geometric season×obliquity, 65% temperature-weighted tropical latitude, so summer continents pull the thermal equator off the geometric one.',k:'MODEL',e:'M',i:3},
{c:'circ',t:'Subsidence, and therefore deserts',n:['pressfield'],d:'Landed as a first cut. Precipitation scales with `W.converg` — ascent rains, descent dries — instead of a subtropical latitude inequality. Hadley descent still has to *be* in the wind field for this to place a Sahara.',k:'MODEL',e:'M',i:3},
{c:'circ',t:'Stationary waves from topography',n:['pressfield'],d:'Landed a first cut. Elevated cells slow the zonal flow and deflect meridionally (NH right), on top of the height term already in `W.press`. Not a downstream Rossby-wave train.',k:'MODEL',e:'M',i:3},
{c:'circ',t:'Storm tracks as a consequence',d:'Landed the basin deletion. `tropicalFavor` is warm sea plus Coriolis (equator still dead); `midlatFavor` is shear and convergence where SST is not tropical. Storms still seed as objects; the track is where those scores are, not a latitude list.',k:'MODEL',e:'M',i:2},
{c:'circ',t:'The jet and its meanders',n:['pressfield'],d:'Landed a first cut. Thermal-wind terms from `gradEN(temp)` meander the jet off the parallel. Overlay `front` is the same gradient, painted.',k:'MODEL',e:'M',i:2},
{c:'circ',t:'Advect moisture with the wind that exists',n:['vapourfield'],d:'Landed. `atmoTick` no longer calls `computeWinds`. Moisture and vapour advect with the geostrophic field `world.js` already wrote.',k:'MODEL',e:'M',i:3},
{c:'circ',t:'Fix `advect` before trusting anything it moves',d:'Landed. `advectField` fluxes along `neighbourEN` (east/north of the true neighbour), not NBR slot 0/1 as east/west. The ±Y faces no longer get a straight-line advection artefact from a false compass.',k:'MODEL',e:'M',i:3},
{c:'circ',t:'Ocean gyres',d:'Landed. `oceanTick` already had wind-stress, Ekman, Sverdrup and western-boundary intensification. SST now cools under upwelling and ENSO uses basin eastness, not world-space `x`.',k:'MODEL',e:'L',i:3},
{c:'circ',t:'Sea surface temperature should have structure',d:'Landed a first cut. Gyre advection, upwelling cold tongues and an ENSO dipole on the tropical basin. Not a primitive-equation ocean.',k:'MODEL',e:'M',i:3},
{c:'circ',t:'Clouds should organise',d:'Landed a first cut. Cloud forms from vapour relative humidity, plus ascent, minus descent. Cool descending ocean gets a stratocumulus bump. The ITCZ gaussian and horse-latitude gaussian are gone; remaining organisation is whatever the wind convergence actually is.',k:'MODEL',e:'M',i:3},
{c:'circ',t:'Fronts',n:['pressfield'],d:'Landed. `W.front` is the temperature-gradient magnitude. Overlay mode `front` paints it; rain and cloud pick up extra along it.',k:'MODEL',e:'M',i:2},
{c:'circ',t:'Seasonal reversal of the whole pattern',d:'Landed. Monsoon wind follows land–sea temperature (all warm land, not a tropical latitude window) and reverses with `sin(season)×lat`. Rain already used the summer-hemisphere test.',k:'MODEL',e:'M',i:3},
{c:'circ',t:'A Rossby number check',d:'Landed. `W._rossby = U / f` from mean wind and Coriolis, printed on the Sky desk. Low Ro names rotation-dominated bands; high Ro names a slow rotator.',k:'PROVE',e:'S',i:3},
{c:'circ',t:'Energy balance as the constraint',d:'Landed a first cut. `W._tropPole` is tropics-minus-poles temperature; `W._heatPole` is meridional `vT` flux around 30°. Calibrate asserts the tropics are warmer. Not a published PW transport target.',k:'PROVE',e:'M',i:3},
{c:'circ',t:'Show the circulation, not just its effects',d:'Landed. Overlay `wind`, Lab synoptic barbs, and `flowviz.js` all advect with the same `windU/V`. Overlay `current` is the ocean. Fronts are a separate overlay.',k:'DRAW',e:'M',i:2},
{c:'circ',t:'Zonal-mean cross-sections in the Lab',d:'Landed as a latitude section (not height–latitude): Sky desk plots zonal-mean temperature, zonal wind and vapour in 18 bins.',k:'PROVE',e:'M',i:2},
{c:'circ',t:'Cost and resolution',d:'Landed as a statement. Pressure is diagnosed, not inverted, each tick — O(NC) plus a four-neighbour gradient. No elliptic solver, no GPGPU pressure step. N=96 is the Lab budget; a GCM remains out of scope (`briefs/model-limits.md`).',k:'PROVE',e:'M',i:3},
{c:'circ',t:'Bands should survive as an emergent result',n:['zonalviz'],d:'Landed as far as a first-cut GCM-shaped sketch will go. Earth still bands because of insolation and spin (Ro printed). A locked world is `substellar` with no ITCZ. High obliquity inverts the annual insolation. Not a primitive-equation atmosphere.',k:'MODEL',e:'M',i:3},
];

const P4 = [
/* -------------------------------------------------------------- vapour -- */
{c:'vapour',t:'Atmospheric water is a scalar and needs to be a field',g:'vapourfield',d:'Landed. `W.vapour` is per-cell: evaporated locally, advected with the existing geographic `advect`, rained from. `gases.H2O` is the mean of the field. Continentality and the orographic term now have something to act on.',k:'MODEL',e:'L',i:3},
{c:'vapour',t:'Advect the vapour field',n:['vapourfield'],d:'Landed. `hydroTick` calls the geographic `advect` on `W.vapour` with the geostrophic wind, so a wet windward coast and a dry interior are the same field moving.',k:'MODEL',e:'M',i:3},
{c:'vapour',t:'Rayleigh depletion along a trajectory',n:['vapourfield'],d:'Air loses water as it rains, so the second mountain range gets less than the first and the third gets almost none. That progressive drying along a path is the mechanism behind every continental desert and it is impossible with a global pool.',k:'MODEL',e:'M',i:3},
{c:'vapour',t:'Clausius–Clapeyron sets the capacity',d:'Landed. Saturation is `h2o × exp((temp−0.5)×1.8)` in evaporation, rain and cloud RH. One exponential; not a 10 K doubling calibrated to kelvin.',k:'MODEL',e:'S',i:3},
{c:'vapour',t:'Evaporation should depend on wind and humidity',d:'Landed. Ocean evap is `temp × wind × saturation-deficit`; land evap is `moist × temp × aridity × wind`. The remaining gap is using soil moisture as the land humidity rather than the vapour field\'s own deficit.',k:'MODEL',e:'S',i:3},
{c:'vapour',t:'Condensation where the air rises',n:['pressfield'],d:'Landed with the rain and cloud rewrite. Precipitation multiplies by `1 + converg × 0.85`; cloud adds ascent and clears under descent. Vertical velocity is still a diagnosed divergence, not a solved ω.',k:'MODEL',e:'M',i:3},
{c:'vapour',t:'Soil moisture and atmospheric moisture are different things',d:'`W.moist[c]` is used as soil wetness by the biosphere, as humidity by the cloud formation term, and as a stand-in for annual precipitation by the biome classifier. Three quantities, one array.',k:'MODEL',e:'M',i:3},
{c:'vapour',t:'A closed water budget with a field in it',n:['vapourfield'],d:'The current budget is closed and correct at the global level. Making it closed per cell — evaporation, advection, condensation, runoff, storage — is what turns a bookkeeping model into a hydrology.',k:'MODEL',e:'M',i:3},
{c:'vapour',t:'Recycling: land that makes its own rain',d:'Landed a first cut. Vegetated land (`life > 0.35`) adds extra evaporation from soil moisture into `W.vapour`. Not an Amazon moisture-convergence budget.',k:'MODEL',e:'M',i:3},
{c:'vapour',t:'Lakes and inland seas as moisture sources',d:'Landed. Lake cells evaporate into `W.vapour` with the same wind × deficit law as the ocean, so a closed basin can wet its own downwind.',k:'MODEL',e:'M',i:2},
{c:'vapour',t:'Snow versus rain',d:'Landed. Land ice only accumulates from `precip` when the cell is below the snow line. Warm rain no longer feeds a polar snowfall floor.',k:'MODEL',e:'M',i:3},
{c:'vapour',t:'Seasonal water storage',d:'Snowpack that melts in spring is the water supply for a large fraction of the real world, and it is the mechanism behind the annual discharge cycle of most large rivers.',k:'MODEL',e:'M',i:2},
{c:'vapour',t:'Groundwater with a residence time',d:'`computeRivers` has a baseflow term. Real groundwater buffers drought over years to millennia and is why a river runs between storms.',k:'MODEL',e:'M',i:2},
{c:'vapour',t:'Humidity should be visible',n:['vapourfield'],d:'Landed. Overlay mode `vapour` paints the per-cell field — wet windward coasts and dry interiors.',k:'DRAW',e:'S',i:3},
{c:'vapour',t:'Cloud from the vapour field, not from moisture',d:'Landed. `cloudsTick` forms from vapour / saturation (Clausius–Clapeyron sketch) plus precip, not from soil moisture. Soil `moist` is no longer the humidity.',k:'MODEL',e:'M',i:3},
{c:'vapour',t:'Atmospheric rivers',n:['vapourfield'],d:'Most poleward moisture transport happens in a few narrow filaments. They are dramatic, they are visible, and they are the clearest possible demonstration that moisture moves.',k:'MODEL',e:'M',i:2},
{c:'vapour',t:'Fog as a separate thing from cloud',d:'Coastal fog, radiation fog and valley inversions are surface phenomena that change what the ground looks like and what can live there. They need humidity and a temperature profile.',k:'MODEL',e:'M',i:2},
{c:'vapour',t:'The water budget on worlds with no water',d:'`canLiquid` gates the whole tick and then `p *= 0.15` if false — so a waterless world still runs the entire hydrological cycle at 15%. Methane on Titan and CO₂ on Mars have their own cycles with their own condensation temperatures.',k:'MODEL',e:'M',i:3},
{c:'vapour',t:'Assert the global water balance closes',n:['vapourfield'],d:'Total water — ocean, ice, soil, vapour — must be conserved to a stated tolerance across a long run. It is the cheapest possible guard on a system that is about to gain three new transport terms.',k:'PROVE',e:'M',i:3},
{c:'vapour',t:'Compare precipitation against real Earth',d:'Global mean precipitation, the fraction falling over land, and the zonal profile are all published. Asserting them turns the whole hydrological rewrite into something with a pass condition.',k:'PROVE',e:'M',i:3},

/* ---------------------------------------------------------------- rain -- */
{c:'rain',t:'The orographic term is good and is standing on sand',d:'Landed the sand. Orographic rain still uses `upslope × vapour × 2.4` and lee `1 / (1 + lee × 10)`, now on local vapour × maritime, plus convergence. The latitude curve is gone.',k:'MODEL',e:'S',i:3},
{c:'rain',t:'The lee term looks one cell downwind',d:'A rain shadow extends hundreds of kilometres past the range, not one 104 km cell. Tracing the shadow along the wind vector is what makes a leeward desert a region rather than a fringe.',k:'MODEL',e:'M',i:3},
{c:'rain',t:'Precipitation needs units',d:'`precip[c] = clamp(p, 0, 1)` and the biome classifier reads it as `precip × 2000` millimetres per year while the texture packs it as `precip × 18`. Three different implied scalings of one quantity.',k:'MODEL',e:'S',i:3},
{c:'rain',t:'Intensity and frequency are different',d:'The same annual total delivered as daily drizzle or as three storms produces different landscapes, different runoff, different erosion and different vegetation. Erosion in particular is driven by the extremes.',k:'MODEL',e:'M',i:2},
{c:'rain',t:'Seasonality of rainfall',d:'A monsoon climate and a maritime climate can have the same annual total. Which months it falls in decides the biome, and the current classifier cannot tell them apart.',k:'MODEL',e:'M',i:3},
{c:'rain',t:'Interannual variability',d:'A place that gets 400 mm every year and a place that averages 400 mm with a factor of three between years are ecologically different places. Variability is what makes a semi-arid landscape look the way it does.',k:'MODEL',e:'M',i:2},
{c:'rain',t:'Aridity as a ratio, not as a threshold',d:'`rule.aridity` is a per-world constant multiplying evaporation. The meaningful quantity is potential evapotranspiration against precipitation, which is a field and which is how every real aridity index is defined.',k:'MODEL',e:'M',i:3},
{c:'rain',t:'Rain over the ocean matters too',d:'Most of the world\'s rain falls on water, where it changes surface salinity and stratification. The current model treats ocean precipitation as bookkeeping.',k:'MODEL',e:'M',i:2},
{c:'rain',t:'Precipitation should reach the surface picture',d:'The realism pass got precipitation and discharge into the surface shader for the first time. What it looks like — darkened wet ground, a storm shadow, a green flush after rain — is still unwritten.',k:'DRAW',e:'M',i:3},
{c:'rain',t:'A rainfall map that reads like a rainfall map',n:['zonalviz'],d:'Earth\'s precipitation map is one of the least zonal fields there is: it is blotchy, it hugs coasts and mountains, and it has holes. Drawing the product\'s version next to it is the fastest possible check.',k:'PROVE',e:'M',i:3},
{c:'rain',t:'Runoff generation, not just accumulation',d:'`computeRivers` routes water downhill. How much becomes runoff depends on intensity against infiltration capacity, which depends on soil and vegetation, and that ratio is what makes a deforested slope flood.',k:'MODEL',e:'M',i:3},
{c:'rain',t:'Rain on ice',d:'Rain falling on a snowpack or a glacier removes it far faster than warm air alone. It is a major mechanism in a warming climate and it is not represented.',k:'MODEL',e:'M',i:1},
{c:'rain',t:'Cloud shadow on the ground',d:'The cloud shell blocks light in the radiation budget. It should also darken the surface underneath it in the picture, which is one of the strongest cues that a planet has weather.',k:'DRAW',e:'M',i:3},
{c:'rain',t:'Lightning where the convection is',d:'Lightning already exists as a hashed effect in the shader; the realism pass fixed its anchoring. Placing it where the model says convection is happening ties an effect to a mechanism.',k:'DRAW',e:'S',i:2},
{c:'rain',t:'Dust and aerosol as a rainfall control',d:'`gases.dust` shades the planet. Aerosol also seeds and suppresses rain, and a dust-source desert changes the rainfall downwind of itself.',k:'MODEL',e:'M',i:1},
{c:'rain',t:'The rain shadow should be nameable',d:'When the model produces a real leeward desert, the chronicle should be able to say so — which range, which wind, how dry. It is the clearest single demonstration that terrain and climate are coupled.',k:'PROVE',e:'M',i:2},
{c:'rain',t:'Precipitation and the biosphere on the same clock',d:'Rain happens on a day; vegetation responds on a season; biomes shift over centuries. The presentation clock now separates fast from slow, and the water cycle is where that separation matters most.',k:'MODEL',e:'M',i:2},
{c:'rain',t:'Extreme events as chronicle entries',d:'A flood, a drought, a failed monsoon. These are the events that make a climate feel like a climate rather than a set of means, and the chronicle is built for exactly this.',k:'MODEL',e:'M',i:2},
{c:'rain',t:'Rainfall on other solvents',d:'Methane rain on Titan is rare, enormous and reshapes the surface when it happens. The same code path with a different condensation curve gives it.',k:'MODEL',e:'M',i:2},
{c:'rain',t:'A precipitation regime label per world',d:'Monsoonal, maritime, continental, polar desert, hyperarid. One derived label per region makes the hydrology legible without a chart.',k:'PROVE',e:'M',i:2},

/* -------------------------------------------------------------- uplift -- */
{c:'uplift',t:'Terrain is noise added to a Voronoi diagram',g:'geoform',d:'`naturalizeHypsometry` applies a fixed recipe — a three-octave warp at 1.4, five-octave coast fBm at 5, four-octave macro at 1.05, three-octave detail at 9, three-octave ridged at 2.4, then two Laplacian passes — once, to a plate diagram. None of those constants knows about a collision, a rift flank, a subduction zone or a hotspot, so relief is noise that happens to be high rather than crust that was pushed up.',k:'MODEL',e:'L',i:3},
{c:'uplift',t:'Mountains where plates collide',n:['geoform'],d:'`bound[c] === CONV` adds a constant. Orogeny should raise crust in proportion to convergence rate and duration and should build a *range* with a strike, a foreland and a hinterland — the currents backlog names `orogen` as the missing piece and the visual payoff belongs here.',k:'MODEL',e:'M',i:3},
{c:'uplift',t:'Isostatic response to load',d:'`applyIsostasy` exists and canvas mode switches it off. Crust floats: a mountain has a root, a melting ice sheet rebounds, a sediment load subsides. It is what makes topography feel like it obeys something.',k:'MODEL',e:'M',i:3},
{c:'uplift',t:'Rift flanks and their shoulders',d:'A rift has raised shoulders and a dropped floor, and that asymmetry is one of the most recognisable tectonic landforms there is. `bound === DIV` currently adds 0.025.',k:'MODEL',e:'M',i:2},
{c:'uplift',t:'Ridges from spreading rate',d:'A slow spreader has an axial valley and a fast one does not, and a mid-ocean ridge is the largest single landform on Earth. `plateVelocityAt` already computes the input.',k:'MODEL',e:'M',i:2},
{c:'uplift',t:'Trenches at all',d:'Convergent oceanic gets `elev −= 0.05`, a few hundred metres. The deepest topography on any ocean world is a trench and on this planet it is a dimple.',k:'MODEL',e:'M',i:2},
{c:'uplift',t:'Age–depth is applied twice with two different laws',d:'`isostaticElev` subtracts `0.015 × √age`; `refineEarthHypsometry` separately subtracts `clamp((age − 40)/320) × 0.06`. The real curve is √t flattening past about 80 Ma and is worth having exactly once.',k:'MODEL',e:'S',i:2},
{c:'uplift',t:'Volcanoes should have edifices',d:'A volcano in this model is a heat source and a chemistry source with no shape. A cone, a shield, a caldera and a lava field are four different landforms that say four different things about the magma.',k:'MODEL',e:'M',i:3},
{c:'uplift',t:'Faults with traces',d:'A fault is a line on the ground with offset across it, and offset drainage is one of the classic field observations. `bound` is a per-cell classification with no lines in it.',k:'MODEL',e:'M',i:2},
{c:'uplift',t:'Layered rock, so erosion can expose structure',g:'strata',d:'`rock` is one byte. Real landscapes look the way they do because erosion cuts through layers of different hardness — cuestas, hogbacks, mesas, the whole of the Colorado Plateau. A small stratigraphic column per cell is the enabling representation.',k:'MODEL',e:'L',i:3},
{c:'uplift',t:'Differential erosion needs differential rock',n:['strata'],d:'`erosionTick` uses one erodibility per planet kind. Once there is stratigraphy, the same rain carves a canyon in one place and leaves a butte in another, which is where landscape character comes from.',k:'MODEL',e:'M',i:3},
{c:'uplift',t:'A relief budget the whole pipeline agrees on',g:'reliefunit',d:'`h` is clamped to ±1.2, Earth renders at 0.028 exaggeration, the shader maps `0.5 + (h − sea) × 2.2`, and `isostaticElev` returns freeboard in unnamed units. Declare one mapping from `h` to metres. Without it no item in this document can state a real elevation.',k:'MODEL',e:'M',i:3},
{c:'uplift',t:'Print elevations in metres',n:['reliefunit'],d:'The inspector, the receipts, the cursor and every overlay show a dimensionless number between −1.2 and 1.2. A player sculpting a mountain has no idea whether they made a hill or the Himalaya.',k:'DRAW',e:'S',i:3},
{c:'uplift',t:'Uplift rate as a field',n:['geoform'],d:'Metres per million years, per cell, from tectonics. It is the input every landscape-evolution model in the literature takes, and having it is what turns the terrain generator into a terrain simulator.',k:'MODEL',e:'M',i:3},
{c:'uplift',t:'Dynamic topography from the mantle',d:'`mantle.js` computes upwellings and the `mantle` overlay draws them. Long-wavelength surface deflection over a rising plume is a real kilometre-scale signal and it is the one tectonic effect with a visible timescale.',k:'MODEL',e:'M',i:2},
{c:'uplift',t:'Landscapes should have a memory of their tectonics',d:'An old orogen is a low rounded range with a wide foreland; a young one is high and steep. Same rock, different age, completely different picture, and age is already tracked.',k:'MODEL',e:'M',i:3},
{c:'uplift',t:'Ranges should have a strike',d:'Real mountain belts are long and thin and parallel to the boundary that made them. Noise-based relief is isotropic, which is the single strongest tell that terrain was generated rather than uplifted.',k:'MODEL',e:'M',i:3},
{c:'uplift',t:'Basins as somewhere for sediment to go',n:['sedfield'],d:'Foreland basins, rift basins, cratonic sags. A basin is where the sedimentary record accumulates, which the life backlog needs for fossils and the geology backlog needs for stratigraphy.',k:'MODEL',e:'M',i:2},
{c:'uplift',t:'Show the age of the land',d:'A crustal-age overlay is standard in geology and immediately explains why one part of a continent is flat and another is not. `W.age` exists.',k:'DRAW',e:'S',i:2},
{c:'uplift',t:'A hypsometric curve with a shelf in it',n:['reliefunit'],d:'Measured deciles of `h − seaLevel`: −0.795, −0.690, −0.663, −0.639, −0.613, −0.574, then −0.033, 0.002, 0.202, 0.275, 0.500. Half the planet on a flat plain, the entire continental slope crossed inside one decile of area. Every coastal item in every backlog is downstream of that curve.',k:'MODEL',e:'L',i:3},
];

const P5 = [
/* ------------------------------------------------------------- fluvial -- */
{c:'fluvial',t:'The world you are handed has eight river cells',g:'riverfield',d:'Landed. `primeDrainage` raises the water table from climate-warmup rain and runs the D8 tree at generate. Drain-tree polylines are drawn on the globe for discharge above 0.22.',k:'MODEL',e:'M',i:3},
{c:'fluvial',t:'Drainage is the strongest visual signal a landscape has',n:['riverfield'],d:'Every aerial photograph of land is organised by its drainage network. It is the difference between terrain that looks eroded and terrain that looks generated, and it is more important to the picture than any noise octave.',k:'DRAW',e:'M',i:3},
{c:'fluvial',t:'Stream power, run long enough to matter',d:'`erode = min(0.004 × rate, discharge × slope² × 0.15 × rate)` per tick. The exponents are the standard stream-power law and the constants are a guess. Calibrating them against a known denudation rate is what makes a million years of erosion look like a million years.',k:'MODEL',e:'M',i:3},
{c:'fluvial',t:'Erosion needs a sediment budget',g:'sedfield',d:'Landed. `erosionTick` copies height, then accumulates deposition onto the sink so two donors sharing a basin add rather than overwrite. Deltas still saturate `sediment` at 1 — volume and avulsion remain ahead.',k:'MODEL',e:'M',i:3},
{c:'fluvial',t:'Deposition builds the flat places',n:['sedfield'],d:'Landed in the transfer: eroded height is added to the downhill cell (or a coastal delta cap). Floodplain texture, fans and lobe switching are still one scalar.',k:'MODEL',e:'M',i:3},
{c:'fluvial',t:'Hillslopes as well as channels',d:'Between the channels, material moves by creep and landslide toward a repose angle. That process is what rounds a landscape and it is the one every terrain generator skips.',k:'MODEL',e:'M',i:3},
{c:'fluvial',t:'Knickpoints and base-level change',d:'Drop the sea level and every river starts cutting from the mouth upstream. It is a slow, visible, entirely mechanistic response to a lever the player already has.',k:'MODEL',e:'M',i:2},
{c:'fluvial',t:'Drainage divides that move',d:'Divides migrate, rivers get captured, and a captured river changes both basins at once. River capture is one of the most satisfying things a landscape model can produce and it needs only the network the product already builds.',k:'MODEL',e:'M',i:2},
{c:'fluvial',t:'Drainage pattern from the rock underneath',n:['strata'],d:'Dendritic on uniform rock, trellised on folded rock, radial on a volcano, rectangular on jointed rock. The pattern is a direct readout of the geology and it is legible at a glance.',k:'MODEL',e:'M',i:3},
{c:'fluvial',t:'Rivers should be drawn as lines',n:['riverfield','isoline'],d:'Landed. `fillRiverLines` emits drain-tree segments for flow above 0.22 and the globe draws them with the coastline. The shader discharge tint remains as the far-zoom fallback.',k:'DRAW',e:'M',i:3},
{c:'fluvial',t:'Meanders below the cell',n:['detailfield'],d:'A river\'s meander wavelength is about ten channel widths, which is far below the grid. Synthesised meanders along the network path is the single best example of detail that is derived rather than decorative.',k:'DRAW',e:'M',i:2},
{c:'fluvial',t:'Prime the drainage before the world is shown',n:['riverfield'],d:'Landed. `primeDrainage` is the generate-time pass; climate warmup still owns precipitation, this owns routing.',k:'MODEL',e:'S',i:3},
{c:'fluvial',t:'Lakes with real levels',d:'A closed basin fills until it overflows or evaporation balances inflow. That is one equation and it produces the Caspian, the Great Salt Lake, and every playa in the arid category.',k:'MODEL',e:'M',i:2},
{c:'fluvial',t:'Waterfalls, gorges and canyons',n:['strata'],d:'A hard layer over a soft one gives a waterfall that retreats upstream and leaves a gorge behind it. It is a specific, recognisable, entirely derivable landform.',k:'MODEL',e:'M',i:2},
{c:'fluvial',t:'Sediment colour in the water',n:['sedfield'],d:'A river plume entering the sea is one of the most visible biological and geological signals from orbit, and the ocean colour currently depends only on depth and ice.',k:'DRAW',e:'M',i:3},
{c:'fluvial',t:'Erosion as a tool the player can aim',d:'The landscape backlog wants this: run erosion for a stated duration inside a selection, with a preview. It is the strongest single lever on whether sculpted terrain looks made or looks weathered.',k:'MODEL',e:'M',i:3},
{c:'fluvial',t:'Vegetation slows erosion',d:'Root cover is the dominant control on hillslope erosion rate, which is why the arrival of land plants changed the sediment record. Both halves exist and are not connected.',k:'MODEL',e:'M',i:3},
{c:'fluvial',t:'Sediment flux to the ocean feeds the carbon cycle',d:'Weathering, burial and the long-term carbon thermostat all run on the sediment flux the drainage network delivers. This is where the surface pass meets the Gaia items in the life backlog.',k:'MODEL',e:'M',i:3},
{c:'fluvial',t:'A drainage-density metric',n:['riverfield'],d:'Landed in `surfaceStats.js`: land cells with flow above 0.1 over land area, plus the count above 0.5.',k:'PROVE',e:'S',i:3},
{c:'fluvial',t:'Assert Hack\'s law',n:['riverfield'],d:'Main-channel length scales as basin area to about 0.57 across every real drainage network measured. If the model reproduces it, the network is behaving; if not, the routing is wrong.',k:'PROVE',e:'M',i:3},

/* ------------------------------------------------------------- glacial -- */
{c:'glacial',t:'Ice covers the land and never carves it',g:'glacio',d:'Landed. `erosionTick` carves with `iceLand × slope²` and dumps sediment at the ice margin. Cirques, fjords and U-shaped valley *drawing* are still ahead; the height field now moves.',k:'MODEL',e:'L',i:3},
{c:'glacial',t:'Ice flows downhill',n:['glacio'],d:'Landed. `iceTick` already spreads ice to lower neighbours when thickness exceeds 0.3. Flow is shallow and local, not a sheet model, but ice can sit where the snow did not fall.',k:'MODEL',e:'M',i:3},
{c:'glacial',t:'Glacial erosion scales with sliding velocity',n:['glacio'],d:'Landed as ice thickness times slope² in `erosionTick` — the same stream-power shape as the rivers, with ice as the fluid. Fast, steep ice carves; a stagnant cap does not.',k:'MODEL',e:'M',i:3},
{c:'glacial',t:'U-shaped valleys and cirques',n:['glacio'],d:'The most recognisable glacial signature there is. A valley whose cross-section changed from V to U is a direct statement about what happened there, at a scale the flat map can show.',k:'DRAW',e:'M',i:3},
{c:'glacial',t:'Fjords, once there is a coastline contour',n:['glacio','isoline'],d:'An overdeepened glacial trough drowned by sea-level rise. It needs the glacial erosion and the sub-cell coast, and it is the payoff for both.',k:'MODEL',e:'M',i:2},
{c:'glacial',t:'Moraines, drumlins and outwash',n:['sedfield'],d:'Landed as a terminus dump: neighbours with much less ice receive sediment and a little height. Drumlin fields and outwash plains are still one scalar, not landforms.',k:'MODEL',e:'M',i:2},
{c:'glacial',t:'Isostatic rebound after the ice goes',d:'`applyIsostasy` handles crustal load. An ice sheet is a load, its removal is an unloading, and post-glacial rebound is still measurably raising Scandinavia. It is a slow, visible, entirely real consequence.',k:'MODEL',e:'M',i:2},
{c:'glacial',t:'Ice sheets have a shape',d:'A continental ice sheet is a dome whose profile follows from the flow law, and it is thousands of metres thick at the centre. Rendering it as a flat white tint loses the second-largest topographic feature on a glaciated planet.',k:'DRAW',e:'M',i:3},
{c:'glacial',t:'Ice shelves, calving and icebergs',d:'Where an ice sheet reaches the sea it floats, and where it floats it breaks. The iceberg field is a visible surface feature and calving is the mechanism behind rapid sea-level change.',k:'MODEL',e:'M',i:2},
{c:'glacial',t:'Sea ice is not land ice',d:'`W.ice` and `W.iceLand` and `W.iceSea` exist and the renderer mostly reads one. They form differently, look different, move differently and mean different things for albedo and for life.',k:'MODEL',e:'M',i:3},
{c:'glacial',t:'Snow line as a computed contour',n:['isoline'],d:'The elevation above which snow persists through the year is a function of temperature and precipitation, it moves with the season, and it is one of the most legible lines on any mountain.',k:'DRAW',e:'M',i:3},
{c:'glacial',t:'Glacial and interglacial as a state the world remembers',d:'The landscape after an ice age is different from the landscape before it, permanently. That is what makes deep time visible in terrain, and it needs erosion that persists.',k:'MODEL',e:'M',i:3},
{c:'glacial',t:'Periglacial ground',d:'Permafrost, patterned ground, pingos, thermokarst and solifluction lobes. The zone beyond the ice is as distinctive as the ice, and on a cold world it is most of the land.',k:'MODEL',e:'M',i:2},
{c:'glacial',t:'Snowball Earth should leave a mark',d:'`W.state === \'snowball\'` currently lerps the colour toward white. A global glaciation is the most extreme thing that has ever happened to this planet\'s surface and it should be legible in the terrain a billion years later.',k:'MODEL',e:'M',i:3},
{c:'glacial',t:'Ice on other volatiles',d:'Nitrogen glaciers on Pluto, CO₂ seasonal caps on Mars, and whatever an ice-shell moon does. The same flow law with a different rheology and a different condensation temperature.',k:'MODEL',e:'M',i:3},
{c:'glacial',t:'Albedo feedback needs a real ice edge',d:'The single strongest feedback in the climate system, driven by a field whose edge is currently a threshold on a 104 km grid.',k:'MODEL',e:'M',i:3},
{c:'glacial',t:'Meltwater and its landforms',d:'Proglacial lakes, spillways, channelled scablands. Catastrophic drainage events are among the most dramatic landscape changes there are and they follow from ice, lakes and topography.',k:'MODEL',e:'M',i:1},
{c:'glacial',t:'Glacial texture in the flat map',n:['detailfield'],d:'Crevasse fields, medial moraines, ogives and blue ice. At 1,632 km across, a glacier is a landscape feature with its own grain.',k:'DRAW',e:'M',i:2},
{c:'glacial',t:'Ice mass balance should close',n:['vapourfield'],d:'Accumulation minus ablation minus calving. Without a closed budget, an ice sheet is a decoration that grows and shrinks with a temperature threshold.',k:'PROVE',e:'M',i:3},
{c:'glacial',t:'Assert the ice extent against the last glacial maximum',d:'`calibrate.mjs` asserts modern ice fraction. Asserting the extent at the last glacial maximum tests the whole ice model against a well-constrained target.',k:'PROVE',e:'M',i:2},

/* ---------------------------------------------------------------- arid -- */
{c:'arid',t:'Nothing aeolian exists',g:'aeolian',d:'Wind transports sediment, and on a dry world it is the *only* transport. Deflation, dune fields, yardangs, loess and dust storms are the entire geomorphology of Mars and of every desert on Earth, and the model has none of them despite having a wind field and a sediment field.',k:'MODEL',e:'M',i:3},
{c:'arid',t:'Dune fields with an orientation',n:['aeolian'],d:'Dune type and orientation follow directly from the wind regime — transverse, barchan, linear, star. A dune sea is one of the most beautiful things a planet can have and its pattern is a readout of the wind.',k:'DRAW',e:'M',i:3},
{c:'arid',t:'Dust source and sink',n:['aeolian'],d:'`gases.dust` shades the planet globally. Dust comes from specific dry basins, travels on specific winds and fertilises specific oceans — the Sahara feeding the Amazon is the standard example and it is a real biogeochemical link.',k:'MODEL',e:'M',i:2},
{c:'arid',t:'Salt pans and playas',d:'A closed basin that evaporates leaves salt, and an evaporite flat is one of the brightest surfaces on any planet. It also stores a climate record in its layers.',k:'MODEL',e:'M',i:2},
{c:'arid',t:'Desert pavement and varnish',d:'Old desert surfaces darken. It is why Mars and the Atacama look the way they do, it is a function of surface age, and age is tracked.',k:'DRAW',e:'M',i:2},
{c:'arid',t:'Karst, where the rock dissolves',g:'karst',n:['strata'],d:'Limestone landscapes have sinkholes, caves, disappearing rivers, towers and no surface drainage at all. It is the one landscape type where the drainage network is *absent* and that absence is the signature.',k:'MODEL',e:'M',i:2},
{c:'arid',t:'Talus and the angle of repose',d:'Loose material sits at about 34 degrees and no steeper. It is the cheapest possible constraint on a heightfield, it stops sculpted terrain from having impossible cliffs, and it produces scree slopes for free.',k:'MODEL',e:'S',i:3},
{c:'arid',t:'Landslides as events',d:'Slope failure above a threshold, with a runout. It couples rain, slope and rock strength, and it is the fastest landscape change there is.',k:'MODEL',e:'M',i:2},
{c:'arid',t:'Coastal erosion and longshore drift',n:['sedfield'],d:'Waves move sand along a shore, and where they stop moving it a spit grows. It is the mechanism behind most of the sub-cell coastal landforms in the `contour` category.',k:'MODEL',e:'M',i:2},
{c:'arid',t:'Impact cratering as a surface process',d:'`crater` is one of the thirteen landscape archetypes, applied once at generation. On an old, unresurfaced world cratering is an ongoing process with a size–frequency distribution and a saturation state.',k:'MODEL',e:'M',i:2},
{c:'arid',t:'Volcanic resurfacing',d:'A flood basalt covers everything. It is the single most dramatic resurfacing event available and it interacts with the extinction machinery the life backlog owns.',k:'MODEL',e:'M',i:2},
{c:'arid',t:'Which processes are active is a per-world decision',g:'procset',d:'Earth runs fluvial, glacial, aeolian, coastal and karst. Mars runs aeolian and impact. Titan runs fluvial in methane and aeolian. Europa runs tectonic and cryovolcanic. Making the process set data — per world, with rates — is what lets one engine draw all of them.',k:'MODEL',e:'M',i:3},
{c:'arid',t:'Process rates should be planetary',n:['procset'],d:'Erosion rate depends on gravity, on the fluid, on the temperature and on whether anything is growing. `erosionTick` has one rate per planet kind, which is the right shape and the wrong resolution.',k:'MODEL',e:'M',i:3},
{c:'arid',t:'A landform library that is data',n:['procset'],d:'`stampTerrain` has six hard-coded lambdas. A library of landforms, each with its generating process, its scale, its rules and the worlds it belongs to, is the thing that makes expanding the palette a content problem rather than a code problem.',k:'MODEL',e:'M',i:3},
{c:'arid',t:'Recognise landforms after the fact',n:['procset'],d:'Given the fields, identify and name what formed: a cirque, a delta, a dune sea, a rift valley. Naming what a process produced is how the player learns what the process is.',k:'PROVE',e:'M',i:3},
{c:'arid',t:'Surface age as a visible quantity',d:'A young surface is rough, a very old one is either smooth or saturated with craters. Surface age explains more about how a body looks than composition does.',k:'DRAW',e:'M',i:2},
{c:'arid',t:'Regolith on airless worlds',d:'Micrometeorite gardening produces a fine, dark, deep layer that mutes every underlying feature. It is why the Moon looks the way it does.',k:'MODEL',e:'M',i:2},
{c:'arid',t:'Cryovolcanism and ice tectonics',d:'Chaos terrain, double ridges, bladed terrain, sublimation pits. The geology backlog owns the mechanisms; this document owns whether they are drawable and distinguishable.',k:'MODEL',e:'M',i:2},
{c:'arid',t:'Every process needs a timescale on screen',d:'Erosion is metres per million years, a landslide is seconds, a dune migrates in years. When a player raises a mountain, the product should say how long until it stops looking new.',k:'PROVE',e:'M',i:3},
{c:'arid',t:'A process-attribution overlay',n:['procset'],d:'Paint which process last modified each cell. It is a debugging tool, a teaching tool and an unusually beautiful map.',k:'DRAW',e:'M',i:2},

/* ---------------------------------------------------------------- soil -- */
{c:'soil',t:'Soil is one float with no depth',g:'soildepth',d:'`W.soil[c] += life[c] × 0.004 − (1 − moist[c]) × 0.001`, clamped to 0–1. Soil is the top metre of the entire terrestrial world: it holds the water, it holds the nutrients, it stops the erosion, it is what the colour of a continent actually is from orbit, and it took life half a billion years to make. It has no depth, no texture, no horizon and no parent material.',k:'MODEL',e:'M',i:3},
{c:'soil',t:'Soil forms from rock, climate, time and life',n:['soildepth'],d:'The four classical soil-forming factors, all present in the model, none connected to soil. Production from weathering minus loss to erosion gives a depth that responds to everything above it in this document.',k:'MODEL',e:'M',i:3},
{c:'soil',t:'Soil colour is a real signal',n:['soildepth'],d:'Laterite is red, chernozem is black, podzol is grey, desert soil is pale. Soil colour is the dominant colour of any land surface without full vegetation cover, and it is currently not a colour at all.',k:'DRAW',e:'M',i:3},
{c:'soil',t:'Weathering rate feeds the carbon thermostat',d:'Silicate weathering is the planet\'s long-term temperature control and it depends on exposed rock, temperature, rainfall and biology. `carbon.js` has the reservoirs; the surface has the controls.',k:'MODEL',e:'M',i:3},
{c:'soil',t:'Nutrients from the rock underneath',d:'`nutrientP = clamp(0.3 + ore × 0.3 + sediment × 0.4)` is invented. Phosphorus comes from weathering specific minerals and is the long-term limiting nutrient of the ocean.',k:'MODEL',e:'M',i:3},
{c:'soil',t:'Organic carbon in the soil is a huge reservoir',d:'Soil holds more carbon than the atmosphere and the biosphere combined, and permafrost holds a large fraction of that. It is the reservoir most likely to move in a warming world.',k:'MODEL',e:'M',i:3},
{c:'soil',t:'Soil moisture with a real capacity',d:'How much water a soil can hold depends on its texture and depth, and that capacity is what decides whether a dry month is a drought.',k:'MODEL',e:'M',i:3},
{c:'soil',t:'Erosion removes soil before it removes rock',n:['soildepth'],d:'A landscape with soil erodes differently from bare rock, and once the soil is gone the rate changes. It is also the mechanism behind every agricultural collapse in history.',k:'MODEL',e:'M',i:2},
{c:'soil',t:'Vegetation and soil are a feedback',d:'Plants make soil, soil holds water, water grows plants. It is one of the tightest positive feedbacks on any land surface and both halves are one-line approximations.',k:'MODEL',e:'M',i:3},
{c:'soil',t:'The land had no soil for four billion years',d:'Before land plants, the continents were bare rock and dust. That is a completely different-looking planet and the model currently paints the Archean with the same land colour as the Holocene.',k:'DRAW',e:'M',i:3},
{c:'soil',t:'Wetlands and peat',d:'Waterlogged ground where organic matter accumulates instead of decaying. It is a carbon sink, a distinct biome, a distinct colour and a distinct hydrology.',k:'MODEL',e:'M',i:2},
{c:'soil',t:'Permafrost as a state with a thaw',d:'Frozen ground behaves as rock and then, past a threshold, does not. Thermokarst collapse is one of the fastest landscape changes on the present-day Earth.',k:'MODEL',e:'M',i:2},
{c:'soil',t:'Sediment on the sea floor',n:['sedfield'],d:'The abyssal plain is flat because sediment buried the topography, not because the generator made it flat. That is a measured feature of this product\'s hypsometry that has the wrong cause.',k:'MODEL',e:'M',i:2},
{c:'soil',t:'Carbonate and silica ooze',d:'Most of the deep sea floor is the skeletons of plankton, and where it dissolves depends on depth and ocean chemistry. `carbon.js` computes the saturation state already.',k:'MODEL',e:'M',i:2},
{c:'soil',t:'Dust deposition as a soil input',n:['aeolian'],d:'Loess plateaus are wind-deposited soil hundreds of metres thick and some of the most fertile land on Earth. It links the arid category to this one.',k:'MODEL',e:'M',i:1},
{c:'soil',t:'A soil overlay',n:['soildepth'],d:'Depth, organic content, colour class. It is the field that most directly explains why a landscape is the colour it is, and nobody can see it.',k:'DRAW',e:'S',i:2},
{c:'soil',t:'Soil in the flat map',n:['soildepth'],d:'At 1,632 km the ground is what you are standing on. Bare rock, thin soil, deep loam and peat should look and sound different.',k:'DRAW',e:'M',i:2},
{c:'soil',t:'Regolith on worlds with no biology',d:'Physical and chemical weathering without life still produces a surface layer, and its character is completely different. Most of the catalogue is in this case.',k:'MODEL',e:'M',i:2},
{c:'soil',t:'Assert soil carbon against Earth',d:'Global soil organic carbon is roughly 1,500 petagrams. It is a well-constrained number and it would anchor the whole reservoir.',k:'PROVE',e:'M',i:2},
{c:'soil',t:'Say that soil is the interface',d:'Almost every item in this document meets at the soil: rain arrives there, rock becomes it, plants make it, rivers remove it and colour comes from it. It deserves to be a named subsystem rather than one accumulator line inside `bioTick`.',k:'PROVE',e:'S',i:3},

/* ------------------------------------------------------------- measure -- */
{c:'measure',t:'Render the planet in a test',g:'pixtest',d:'Landed on the CPU: after generate, `pictureStats` asserts neighbour ΔE, coastline staircase, per-face height discontinuity, zonal R², ramp saturation, drainage density and ecotone fraction. A GPU framebuffer capture is still ahead — shader-only faults will not show up until then.',k:'PROVE',e:'L',i:3},
{c:'measure',t:'An artefact detector',g:'artefact',n:['pixtest'],d:'Landed in `surfaceStats.js`: long axis-aligned coastline runs, neighbour ΔE, per-face height discontinuity, distinct equator levels. Each is a number that should fall.',k:'PROVE',e:'M',i:3},
{c:'measure',t:'Golden images per world type',n:['pixtest'],d:'Earth, Mars, Venus, Europa, Titan, an ocean world, a lava world. Fixed seed, fixed time, fixed camera, committed. Rendering changes should have to be admitted to.',k:'PROVE',e:'M',i:3},
{c:'measure',t:'A perceptual diff, not a byte diff',n:['pixtest'],d:'GPU output varies slightly across drivers. A perceptual metric with a stated tolerance is the difference between a test that guards the picture and a test that everyone learns to ignore.',k:'PROVE',e:'M',i:3},
{c:'measure',t:'Measure the zonal fraction of every field',n:['zonalviz'],d:'Landed. Temperature, precipitation, life and moisture zonal R² are part of `pictureStats`.',k:'PROVE',e:'M',i:3},
{c:'measure',t:'A field-statistics dump',d:'Min, max, mean, percentiles and zonal fraction for every field, per world, as one command. Most of the measured numbers in these backlogs came from throwaway scripts; making them a command makes them repeatable.',k:'PROVE',e:'M',i:3},
{c:'measure',t:'Frame time by stage',d:'`refreshColours`, `spreadVertexDat`, `uploadFieldTextures`, the draw calls. The colour pass is the largest per-frame CPU loop in the product and its cost has never been printed.',k:'PROVE',e:'S',i:3},
{c:'measure',t:'A visual regression gallery',n:['pixtest'],d:'The site already captures screenshots with `capture-site.mjs`. Extending it to a grid of worlds, rendered on every change, turns "does it still look right" into something a person can answer in five seconds.',k:'PROVE',e:'M',i:3},
{c:'measure',t:'Test at more than one resolution',d:'Almost every artefact in this document scales with N, and almost every test runs at one N. A seam at N=32 and a seam at N=192 look different and one of them may be the only one anybody notices.',k:'PROVE',e:'M',i:2},
{c:'measure',t:'A checklist of known lies',d:'`briefs/model-limits.md` exists for the physics. The picture needs the same: the five atlas seams, the twelve stencil edges, the 30-metre height quantisation, the categorical channel in a filtered texture, the ramp that saturates at 530 metres.',k:'PROVE',e:'S',i:3},
{c:'measure',t:'Provenance for the picture',d:'`param-coverage.json` says which planetary numbers are measured. No equivalent exists for anything visual, and the Earth palette is the only one with a reference path.',k:'PROVE',e:'M',i:3},
{c:'measure',t:'A before-and-after harness',n:['pixtest'],d:'Any change in this document should be presentable as two images and one table of statistics. Without that, a rendering change is an opinion.',k:'PROVE',e:'M',i:3},
{c:'measure',t:'Measure against a photograph',d:'`eoref` holds a shelf of NASA stills. Comparing the rendered Earth against them — histogram, dominant hue, land–sea contrast — is the only external ground truth the product has.',k:'PROVE',e:'M',i:3},
{c:'measure',t:'Watch a field for NaN and out-of-range',d:'Twelve fields packed into textures with clamps everywhere means an out-of-range value silently becomes a wrong colour rather than an error. An assertion pass per tick in debug mode catches the class.',k:'PROVE',e:'S',i:2},
{c:'measure',t:'Deterministic rendering',d:'The colour pass reads `performance.now()` for the stroke fade, so a rendered frame is not a pure function of world state. Golden images need it to be.',k:'PROVE',e:'S',i:3},
{c:'measure',t:'A debug mode that draws the grid',d:'Cell boundaries, face boundaries, face indices. Half the faults in this document are invisible until the grid is drawn over them.',k:'PROVE',e:'S',i:3},
{c:'measure',t:'Report what a pixel is worth',d:'At a given camera distance, how many kilometres does one screen pixel cover, and how many cells. It decides which detail octaves matter and it is the number every LOD decision needs.',k:'PROVE',e:'S',i:2},
{c:'measure',t:'Track the numbers over time',n:['artefact'],d:'The artefact statistics, the zonal fractions and the frame time, committed per release. A backlog is only alive if something checks it, and this document is 400 claims about numbers that should move.',k:'PROVE',e:'M',i:3},
{c:'measure',t:'One command that prints the state of the picture',n:['artefact','zonalviz'],d:'Landed. `node vr/sim/surfaceStats.js` generates a default Earth and prints seams, banding, zonal R², ramp saturation, drainage density and the ecotone fraction.',k:'PROVE',e:'M',i:3},
{c:'measure',t:'Put the screenshots in the brief',n:['pixtest'],d:'This document was written because two screenshots showed a rectangle and some stripes. The generated brief should carry the current renders next to the statistics, so the next person can see what the numbers mean.',k:'PROVE',e:'M',i:2},
];

const D = [...P1, ...P2, ...P3, ...P4, ...P5];

/* ------------------------------------------------------------- derive -- */
D.forEach((x, i) => { x.id = i + 1; });

const byCat = (id) => D.filter((x) => x.c === id);
const count = (f) => D.filter(f).length;
const KIND = { MODEL: 'Model', DRAW: 'Draw', PROVE: 'Prove' };
const md = (t) => String(t).replace(/\|/g, '\\|');

const provides = new Map();
for (const x of D) if (x.g) provides.set(x.g, x);
const dependents = (tok) => D.filter((y) => (y.n || []).includes(tok)).length;
const CRITICAL = [...provides.keys()]
  .map((k) => ({ k, x: provides.get(k), n: dependents(k) }))
  .filter((r) => r.n > 0)
  .sort((a, b) => b.n - a.n);

const LANDED = [
  ['The local wash no longer repaints the planet',
   '`washfix`. The `else` that pulled every cell outside the patch 46% toward grey is gone. The wash tints only the patch, feathers 150 km past the boundary, and the default globe mode is a rim rather than a fill.'],
  ['Overlays composite, and they share the terrain stencil',
   '`inklayer` + `inksmooth`. Terrain colour is written first; overlay, wash, hover, stroke and brush preview are a second pass on the cell buffer; `spreadVertexDat` bilinearises the composite. Overlay modes no longer sit as nearest-neighbour cell blocks on a smooth surface.'],
  ['The vertex stencil crosses cube faces',
   '`stencilfix`. `vMixC0..3` resolves through `cellAt` → `dirToCell` in cell-centred coordinates, so a vertex on a face edge blends the neighbouring face instead of a duplicated edge row.'],
  ['One sampler that crosses faces',
   '`spheresample`. `sampleSphere(field, x, y, z)` and a seam-safe `sampleFaceField` share `cellAt`. The cloud shell and the globe mesh use it.'],
  ['The field atlas no longer blends five false seams',
   '`atlasfix`. Each face is an `(N+2)×(N+2)` tile with a one-texel gutter filled from the true neighbour. Guild index is snapped to the nearest texel so LINEAR cannot invent a metabolism.'],
  ['A seam test that fails loudly',
   '`seamtest`. First difference of a smooth field across every face boundary is asserted against the interior; `cellAt` off a face equals the neighbour table; `sampleSphere` at a cell centre returns that cell.'],
  ['Atmospheric water is a field, and interiors are dry for a reason',
   '`vapourfield` + `continental` + `preciplat`. `W.vapour` is per-cell, evaporated locally, advected, rained from. Continentality is a BFS from the coast. The ±17° latitude curve is gone. Earth seeding no longer paints an explicit `desertBelt` or vegetation parallels.'],
  ['Biome membership instead of a biome index',
   '`fuzzybiome`. `biomeMembership` returns the two or three strongest biomes with weights. The globe blends their ground colours, so a savanna–grassland boundary is a gradient rather than an isoline.'],
  ['The ocean ramp no longer saturates at 530 m',
   '`depthramp`. A two-scale optical ramp spends range on the shelf and still has some left in the abyss. Vertex blends round instead of truncating.'],
  ['A signed distance to the shoreline',
   '`coastsdf`. `W.coastDist` is kilometres from the sea-level contour, positive inland and negative at sea. The beach tint reads it. The staircase is still there until `isoline`; it is now a number in `surfaceStats.js` rather than a screenshot opinion.'],
  ['The opening world has a river network',
   '`riverfield`. `primeDrainage` raises the water table from climate-warmup rain and runs the D8 tree before the player sees the planet.'],
  ['The picture is under a CPU test',
   '`pixtest` + `artefact` + `bandmetric`. `vr/sim/surfaceStats.js` measures neighbour ΔE, axis-aligned coastline runs, per-face height discontinuity, equator levels, zonal R², ramp saturation and drainage density. A GPU framebuffer capture is still ahead.'],
  ['An ecotone overlay, and a fraction',
   '`ecotone`. Cells whose top biome membership is below 0.7 are the boundary network. Overlay mode `ecotone` paints that entropy. `W.ecotoneFrac` is asserted away from zero so a hard classification cannot silently return.'],
  ['The shoreline is a polyline',
   '`isoline`. Marching squares on each cube face via `cellAt`, stored as `W.coastLine`, drawn on the globe and on the flat map from the same extractor. Shader water mask uses `fwidth(hCoast)`. Sea-level changes rebuild it.'],
  ['Vertex colour is dithered',
   '`dither`. The four-tap blend stays in float; a 4×4 Bayer matrix on the vertex grid feeds the 8-bit cast.'],
  ['Wind is a solution to pressure',
   '`pressfield`. Diagnostic `W.press` from temperature, height and ice. The sine-of-latitude bands and prescribed trades are gone. Overlay mode `vapour` shows the moisture field that those winds now carry.'],
  ['Earth vegetation, ice, rain and clouds are no longer painted on parallels',
   '`preciplat`. Moisture and biosphere follow climate. Ice follows coldness. Rain is vapour × maritime × convergence. Clouds form from relative humidity. ENSO is east/west of the largest tropical ocean. Insolation is a daily-mean TOA cosine; locked worlds skip zonal ITCZ.'],
  ['Earth circulation leftovers are a first-cut sketch, not a GCM',
   'Daily-mean insolation, basin ENSO, fronts, thermal-wind meanders, lake/forest evaporation, Rossby number and a zonal-mean Lab section. Pressure stays diagnosed. No elliptic solver.'],
  ['Erosion is a transfer, and ice carves',
   '`sedfield` + `glacio`. Two donors sharing a sink accumulate. Ice thickness × slope² carves, and the terminus takes the sediment. Drain-tree rivers are drawn as lines.'],
];

const FOUND = [
  ['The rectangle on the planet is an overlay',
   '`updateLocalHighlight` builds a square perimeter in unwrap space and the wash at `render.js:1477` repaints the whole globe from it. Cells inside the patch lerp toward `[255, 248, 236]` at k = 0.07; the `else` branch pulls every cell outside 46% toward its own grey. Binary `Set.has(c)` membership on a 104 km grid, no feather. That is the two-tone rectangle with right-angle corners in both screenshots, and the apparent "sharp corner in the continent" is the wash boundary crossing a coastline.'],
  ['The renderer clamps its interpolation stencil to the cube face',
   '`render.js:136–145` builds `vMixC0..3` with `clamp(i, 0, N-1)` and `clamp(j, 0, N-1)`. So a vertex on a face edge blends four cells from its own face, two of them duplicates of the edge row. Every one of the twelve cube edges carries a colour discontinuity, and a cube edge is a straight line. The simulation does not have this bug — `buildNeighbours` and `buildNbr8` both step off the face and resolve through `dirToCell`. The physics is seamless and the picture is not.'],
  ['The field atlas blends across five face boundaries',
   '`FIELD_W = 6 * N`, `FIELD_H = N`, written as `px = (j * FIELD_W + f * N + i) * 4`. Six cube faces side by side in one texture sampled `LINEAR`, so the hardware blends the last column of face *f* with the first column of face *f+1* — pairs of columns on opposite sides of the planet. Twelve fields ride in that atlas: life, ice, moisture, cloud, sediment, intertidal, precipitation, discharge, NPP, guild index, height and sea state.'],
  ['A guild index is packed into a linearly filtered channel',
   '`fieldPix1[px+1] = (gi / (GUILDS.length - 1)) * 255`. A categorical variable in a `LINEAR` texture means the boundary between guild 3 and guild 9 renders as a smooth sweep through guilds 4 to 8 — five metabolisms that are not there.'],
  ['A cell\'s colour is fifty-four sequential lerps',
   '`refreshColours` is a 261-line loop with 54 separate `col = [...]` assignments per cell per frame. Ocean depth, ice leads, foam, reef, sediment, lava, ash, dust, snowball state, guild tint, albedo paint, brush preview, the local wash, hover and stroke fade are all the same variable in a fixed undocumented order. There is no separation between what the surface is, what grows on it, what is happening to it, and what the interface is drawing on top.'],
  ['Biomes are an if-ladder, so their edges are isolines',
   '`classifyBiome` is eleven hard branches on two smooth fields — `tC < -5`, `ppt < 250`, `ppt < 600 && tC > 18`, and so on — returning exactly one biome per cell. Since temperature and precipitation vary smoothly, every biome boundary in the product is a contour of a scalar field drawn at full contrast, on the globe and in the pixel map alike.'],
  ['Ninety-two sites read latitude directly',
   'Original audit: 92 reads of `DIR[c * 3 + 1]` across 29 files. Vegetation cuts at 0.28 / 0.55 / 0.75, an explicit `desertBelt`, a rain curve peaking at ±17°, and prescribed wind bands. Vegetation, moisture, rain base and wind bands are gone; remaining Earth reads are ice floors, insolation, ENSO by x-sign, and cloud organisation around the ITCZ.'],
  ['Atmospheric water is one global number',
   'Original audit: `hydroTick` evaporated into `gases.H2O` and every cell drew rain from that scalar. `W.vapour` is now per-cell and advected; `gases.H2O` is the mean. Continentality and orography act on the field. Clouds form from vapour / saturation.'],
  ['The ocean colour ramp saturates at about 530 metres',
   '`d = clamp((sea − h) × 1.9, 0, 1)`. The measured hypsometry puts half the planet between −0.795 and −0.574, entirely past saturation, so the abyssal plain is one flat colour covering half the globe while the shelf gets the whole gradient.'],
  ['Everything the shader sees is eight bits, quantised twice',
   '`_cellDat` is `Uint8Array(NC * 4)`; `spreadVertexDat` blends four cells and truncates with `| 0`; all three field textures are `UNSIGNED_BYTE`. Height arrives as `hs = clamp(0.5 + (h − localSea) × 2.2, 0, 1)` — roughly ±4 km in 256 steps, about 30 m per level. Nothing dithers anywhere.'],
  ['Overlays are nearest-neighbour while terrain is bilinear',
   '`applyOverlay` reads `vCell[k]`, the single nearest cell per vertex, while terrain colour goes through the four-tap `spreadVertexDat` blend. All twenty overlay modes therefore render as hard cell blocks sitting on a smooth surface.'],
  ['The world is handed to the player with eight rivers on it',
   'Measured at t = 0 on the default Earth: of 7,460 land cells, 185 carry flow above 0.1 and 8 carry flow above 0.5. `computeRivers` builds a real D8 network with lakes and baseflow, and drainage is the single strongest visual signal a landscape has.'],
  ['Ice covers the land and never carves it',
   '`iceLand` accumulates and melts and has no mechanical effect at all. The U-shaped valley, the cirque, the fjord, the drumlin, the moraine and most of the northern hemisphere\'s topography are glacial. On a product whose pitch includes ice ages, ice is a white overlay.'],
  ['The picture has never been measured',
   'There is no test anywhere that renders the globe and asserts anything about the result. All thirteen findings above were found by reading code after looking at two screenshots. At least five of them would have been caught by one headless render and four cheap statistics.'],
];

const NOW = [
  ['The rectangle and the straight lines were rendering bugs, and they are gone',
   'The wash no longer desaturates the planet. The vertex stencil and the field atlas both cross cube faces. The coastline is a polyline rather than a 104 km staircase of cells — still coarse, but a curve.'],
  ['The banding is being replaced by mechanisms, not deleted',
   'Atmospheric water is a per-cell field, advected. Continentality is a BFS from the coast. Biome colour blends by membership. Wind is geostrophy of a pressure field. Insolation is a daily-mean TOA cosine. Locked worlds skip zonal ITCZ. Remaining Earth stripes are whatever Hadley descent the diagnostic wind actually produces.'],
  ['The terrain is starting to have a history',
   '`naturalizeHypsometry` is still one noise recipe, but erosion now deposits where it carves, ice now lowers the bed, and the opening world has a drainage network drawn as lines. Stratigraphy, soil depth and aeolian processes are still missing.'],
  ['The good parts are further along than the picture suggested',
   'The neighbour tables always crossed faces. The area weights are accurate to 0.004% of 4π. The orographic precipitation term is the right shape. `computeRivers` is a real D8 network. What this pass did is connect those to a picture that can actually show them, and put a seam test on the connection.'],
  ['The picture is now under a few tests, not yet under a GPU render',
   '`seamtest` asserts topology. Isoline vertex count, sediment accumulation and ice carve are asserted. `surfaceStats.js` measures artefact numbers. A headless framebuffer (`pixtest` GPU half) is still the unbuilt guard on shader-only faults.'],
];

const SEQ = [
  ['Delete the else branch',
   '`washfix`. Landed: the local wash no longer desaturates everything outside the patch, and the default is a rim.'],
  ['Fix the two seam bugs',
   '`stencilfix` then `atlasfix`. Landed, with `seamtest`. The vertex stencil resolves cross-face lookups through `cellAt`, and the field atlas has gutters. The straight lines should be gone.'],
  ['Put the picture under test',
   '`pixtest` and `artefact`. Landed on the CPU: four statistics over cell colours and fields. The GPU framebuffer half is still open — shader-only faults will not show up until then.'],
  ['Separate the overlay layer from the surface',
   '`inklayer`, `inkfeather`, `inksmooth`. Overlays composite instead of mutating, edges feather over a stated distance in kilometres, and overlays get the same bilinear stencil the terrain has. This is the structural version of `washfix` and it prevents the whole class.'],
  ['Take the colour pipeline apart',
   '`paintstage`, then `substrate`, then `onecell`. Four stages — material, cover, transient, ink — instead of 54 lerps in an undocumented order, with one description of a cell that both the globe and the flat map consume. Write the current order down as data before touching it.'],
  ['Soften the classification',
   '`fuzzybiome`, then `ecotone`. Membership instead of an index, colour blended by weight, and the boundary becomes a place things can live. This removes the contour banding at source and it is independent of everything above, so it can run in parallel.'],
  ['Give the shoreline a contour',
   '`coastsdf`, `isoline`. Landed: signed distance, marching-squares polyline, globe and map draw, `fwidth` waterline. Sub-cell landforms (spits, islands, fjords) still wait on decorations along that line.'],
  ['Fix the ramps and dither',
   '`depthramp`, `dither`. Landed: two-scale ocean ramp and a Bayer dither before every vertex 8-bit cast.'],
  ['Build the vapour field',
   '`vapourfield`. Landed: per-cell atmospheric water, advected, with a vapour overlay. Rayleigh depletion along a long trajectory is still a local rain subtraction rather than a tagged parcel.'],
  ['Build the pressure field',
   '`pressfield`. Landed: diagnostic pressure, geostrophy, no sine bands. Prognostic momentum, true Hadley cells and a GCM remain out of scope.'],
  ['Then delete the belts, one at a time, measuring',
   '`beltaudit` against `zonalviz`. Landed: remaining latitude reads are physical. Zonal R² is in calibrate. Honest insolation, locked-world skip, fronts, gyres and Rossby number are in.'],
  ['Then give the terrain a history',
   '`geoform`, `riverfield`, `sedfield`, `glacio` landed the cheap half: drainage primed, rivers drawn, sediment accumulates, ice carves. `strata`, soil depth and aeolian processes are the rest of the landscape.'],
];

/* ------------------------------------------------------------ markdown -- */
function markdown() {
  const L = [];
  L.push('# ORRERY — surface');
  L.push('');
  L.push(`**${D.length} items.** Generated from \`scripts/surface.mjs\` — edit that file, not this one, then run \`node scripts/surface.mjs\`.`);
  L.push('');
  L.push('Two complaints — the planet has hard rectangular edges on it, and the world is striped — which turn out to be six bugs and one missing field. Written by auditing the colour pipeline, the cube-sphere topology, the field atlas, the classification cascade and the water budget against the running build.');
  L.push('');
  L.push('The short version: **the rectangle is a UI overlay that used to repaint the whole globe** (fixed), the straight edges were an interpolation stencil that clamped at a cube face and a texture atlas that filtered across five seams (fixed), and **the stripes were real** — vegetation, ice, deserts and rainfall used to be painted on latitude bands. Vapour is a field, wind is geostrophy, ice follows coldness, rain follows ascent, clouds follow humidity, and insolation is a daily-mean TOA cosine. Remaining Earth structure is diagnosed Hadley descent and the seasonal hemisphere.');
  L.push('');
  L.push(`Kind: **${count((x) => x.k === 'MODEL')}** model, **${count((x) => x.k === 'DRAW')}** picture, **${count((x) => x.k === 'PROVE')}** measurement and proof. Effort is S/M/L. Impact is 1–3.`);
  L.push('');

  L.push('## Fixed in this pass');
  L.push('');
  for (const [a, b] of LANDED) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## What the audit found');
  L.push('');
  for (const [a, b] of FOUND) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## Where the surface actually is');
  L.push('');
  for (const [a, b] of NOW) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## The critical path');
  L.push('');
  L.push('The capabilities the largest number of other items are waiting on.');
  L.push('');
  L.push('| Capability | Item | Unblocks |');
  L.push('|---|---|---|');
  for (const r of CRITICAL.slice(0, 18)) {
    L.push(`| \`${r.k}\` | ${r.x.id}. ${md(r.x.t)} | ${r.n} items |`);
  }
  L.push('');

  for (const [id, name, blurb] of CATS) {
    const items = byCat(id);
    L.push(`## ${name}`);
    L.push('');
    L.push(blurb);
    L.push('');
    L.push('| # | Item | What and why | Kind | E | I |');
    L.push('|---|---|---|---|---|---|');
    for (const x of items) {
      const gives = x.g ? ` <br>gives \`${x.g}\`` : '';
      const needs = x.n?.length ? ` <br>needs ${x.n.map((t) => '`' + t + '`').join(' ')}` : '';
      L.push(`| ${x.id} | **${md(x.t)}**${gives}${needs} | ${md(x.d)} | ${KIND[x.k]} | ${x.e} | ${x.i} |`);
    }
    L.push('');
  }

  L.push('## Sequencing');
  L.push('');
  SEQ.forEach(([a, b], i) => L.push(`${i + 1}. **${a}.** ${b}`));
  L.push('');
  L.push('The through-line: the two things a player complained about have different causes and deserve different treatment. The edges are bugs — an overlay that repaints the planet, a stencil that clamps at a face, an atlas that filters across a seam — and all three are cheap, local and testable. The stripes are honest output from a model that has no atmospheric water field and no pressure field, and removing the shortcuts without building the mechanisms would make the world worse, not better.');
  L.push('');
  L.push('The picture is now measured on the CPU. `surfaceStats.js` reports neighbour ΔE, coastline staircase, per-face height discontinuity, zonal R², ramp saturation, drainage density and the ecotone fraction after every generate. A GPU framebuffer capture is still ahead, which is why shader-only faults remain a screenshot problem.');
  L.push('');

  return L.join('\n');
}
/* ----------------------------------------------------------------- html -- */
function html() {
  const data = JSON.stringify(D.map((x) => ({
    id: x.id, c: x.c, t: x.t, d: x.d, k: x.k, e: x.e, i: x.i, g: x.g || '', n: x.n || [],
  })));
  const cats = JSON.stringify(CATS.map(([id, name, blurb]) => ({ id, name, blurb })));
  const crit = JSON.stringify(CRITICAL.slice(0, 18).map((r) => ({ k: r.k, id: r.x.id, t: r.x.t, n: r.n })));
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ORRERY — surface</title>
<style>
:root{
  --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#c69a4f; --accent-soft:rgba(198,154,79,.13); --accent-line:rgba(198,154,79,.36);
  --make:#7fc8a9; --make-soft:rgba(127,200,169,.14);
  --hand:#7fb0e0; --hand-soft:rgba(127,176,224,.14);
  --sans:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
}
@media (prefers-color-scheme: light){
  :root:not([data-theme="dark"]){ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
    --text:#12151c; --dim:#4e5768; --faint:#727d90;
    --accent:#8a6420; --accent-soft:rgba(138,100,32,.09); --accent-line:rgba(138,100,32,.32);
    --make:#22705a; --make-soft:rgba(34,112,90,.09); --hand:#215e93; --hand-soft:rgba(33,94,147,.09); }
}
:root[data-theme="dark"]{ --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#c69a4f; --accent-soft:rgba(198,154,79,.13); --accent-line:rgba(198,154,79,.36);
  --make:#7fc8a9; --make-soft:rgba(127,200,169,.14); --hand:#7fb0e0; --hand-soft:rgba(127,176,224,.14); }
:root[data-theme="light"]{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
  --text:#12151c; --dim:#4e5768; --faint:#727d90;
  --accent:#8a6420; --accent-soft:rgba(138,100,32,.09); --accent-line:rgba(138,100,32,.32);
  --make:#22705a; --make-soft:rgba(34,112,90,.09); --hand:#215e93; --hand-soft:rgba(33,94,147,.09); }

*{box-sizing:border-box;}
body{margin:0; background:var(--ground); color:var(--text);
     font:400 16px/1.6 var(--sans); -webkit-font-smoothing:antialiased;}
.wrap{max-width:1080px; margin:0 auto; padding:40px 26px 110px;}

header{border-bottom:1px solid var(--rule); padding-bottom:28px;}
.eyebrow{font:500 10.5px/1 var(--mono); letter-spacing:.24em; text-transform:uppercase; color:var(--accent);}
h1{font:700 clamp(34px,5.4vw,54px)/1.03 var(--sans); letter-spacing:-.035em; margin:15px 0 0; text-wrap:balance;}
.sub{font:italic 400 clamp(17px,2.2vw,21px)/1.45 var(--serif); color:var(--dim);
     margin:18px 0 0; max-width:50ch;}
.nav{margin-top:20px; font:400 12.5px/1.7 var(--mono); color:var(--faint);}
.nav a{color:var(--dim); text-decoration:none; border-bottom:1px solid var(--rule);}
.nav a:hover{color:var(--accent); border-color:var(--accent-line);}

.tally{display:grid; grid-template-columns:repeat(auto-fit,minmax(126px,1fr)); gap:1px;
       background:var(--rule); border:1px solid var(--rule); border-radius:8px;
       overflow:hidden; margin-top:26px;}
.tally > div{background:var(--panel); padding:13px 15px;}
.tally dt{font:500 9.5px/1 var(--mono); letter-spacing:.15em; text-transform:uppercase; color:var(--faint);}
.tally dd{margin:9px 0 0; font:600 26px/1 var(--sans); letter-spacing:-.02em;
          font-variant-numeric:tabular-nums;}
.tally dd small{display:block; font:400 11px/1.5 var(--mono); color:var(--faint); margin-top:6px; letter-spacing:0;}

.prose{margin-top:40px;}
.prose h2{font:650 21px/1.2 var(--sans); letter-spacing:-.022em; margin:0 0 12px;
          border-bottom:1px solid var(--rule); padding-bottom:10px;}
.prose p{color:var(--dim); max-width:74ch; font-size:14.5px;}
.state{list-style:none; margin:14px 0 0; padding:0; display:flex; flex-direction:column; gap:1px;
       background:var(--rule); border:1px solid var(--rule); border-radius:8px; overflow:hidden;}
.state li{background:var(--panel); padding:13px 16px; color:var(--dim); font-size:13.5px; line-height:1.6;}
.state b{color:var(--text); font-weight:600;}
.critwrap{overflow-x:auto;}
.crit{width:100%; border-collapse:collapse; margin-top:14px; font-size:13.5px;}
.crit td{border-top:1px solid var(--rule); padding:9px 12px; color:var(--dim);}
.crit td:first-child{font:500 11.5px/1.6 var(--mono); color:var(--accent); width:1%; white-space:nowrap;}
.crit td:last-child{text-align:right; font:500 11.5px/1.6 var(--mono); color:var(--faint); white-space:nowrap;}
.seq{margin:14px 0 0; padding-left:20px; color:var(--dim); font-size:14px;}
.seq li{margin-bottom:9px; max-width:74ch;}
.seq b{color:var(--text);}
code{font:500 12.5px/1 var(--mono); background:var(--panel2); border:1px solid var(--rule);
     padding:2px 5px; border-radius:4px; color:var(--accent);}

.controls{position:sticky; top:0; z-index:5; background:var(--ground);
          padding:18px 0 14px; border-bottom:1px solid var(--rule); margin:44px 0 6px;}
.filters{display:flex; flex-wrap:wrap; gap:7px; align-items:center;}
.flabel{font:500 9.5px/1 var(--mono); letter-spacing:.17em; text-transform:uppercase;
        color:var(--faint); margin-right:3px;}
button.f{font:500 11.5px/1 var(--mono); color:var(--dim); cursor:pointer; background:transparent;
         border:1px solid var(--rule); border-radius:5px; padding:7px 10px;}
button.f:hover{border-color:var(--accent-line); color:var(--text);}
button.f[aria-pressed="true"]{background:var(--accent-soft); border-color:var(--accent-line); color:var(--accent);}
button.f.make[aria-pressed="true"]{background:var(--make-soft); border-color:var(--make); color:var(--make);}
button.f.hand[aria-pressed="true"]{background:var(--hand-soft); border-color:var(--hand); color:var(--hand);}
#q{flex:1; min-width:170px; font:400 13px/1 var(--sans); color:var(--text);
   background:var(--panel); border:1px solid var(--rule); border-radius:5px; padding:8px 11px;}
#q::placeholder{color:var(--faint);}
.tally2{margin-top:11px; font:500 11px/1 var(--mono); color:var(--faint); font-variant-numeric:tabular-nums;}

section{padding-top:38px; scroll-margin-top:120px;}
.sechead{display:flex; align-items:baseline; gap:12px; flex-wrap:wrap;
         border-bottom:1px solid var(--rule); padding-bottom:10px;}
.sechead h2{font:650 21px/1.2 var(--sans); letter-spacing:-.022em; margin:0;}
.sechead .n{font:500 10.5px/1 var(--mono); color:var(--accent); background:var(--accent-soft);
            border:1px solid var(--accent-line); padding:4px 7px; border-radius:4px;}
.blurb{margin:13px 0 0; color:var(--dim); max-width:74ch; font-size:14.5px;}

ol{list-style:none; margin:16px 0 0; padding:0; display:flex; flex-direction:column; gap:1px;
   background:var(--rule); border:1px solid var(--rule); border-radius:8px; overflow:hidden;}
li.item{background:var(--panel); padding:13px 16px; display:grid;
   grid-template-columns:38px minmax(0,1fr) auto; gap:4px 14px; align-items:baseline;}
li .id{font:500 11px/1.5 var(--mono); color:var(--faint); font-variant-numeric:tabular-nums;}
li .t{font:600 14.5px/1.4 var(--sans); letter-spacing:-.008em;}
li .d{grid-column:2; color:var(--dim); font-size:13.5px; line-height:1.55; max-width:76ch;}
li .dep{grid-column:2; font:400 11px/1.6 var(--mono); color:var(--faint); margin-top:4px;}
li .dep .gives{color:var(--accent);}
li .tags{display:flex; gap:5px; align-items:center; grid-row:1; grid-column:3;}
.tag{font:600 9px/1 var(--mono); letter-spacing:.1em; text-transform:uppercase;
     padding:4px 6px; border-radius:3px; white-space:nowrap; border:1px solid transparent;}
.tag.make{background:var(--make-soft); color:var(--make); border-color:var(--make);}
.tag.hand{background:var(--hand-soft); color:var(--hand); border-color:var(--hand);}
.tag.pick{background:transparent; color:var(--dim); border-color:var(--rule);}
.tag.e{background:transparent; color:var(--faint); border-color:var(--rule);}
.dots{display:inline-flex; gap:2px;}
.dots i{width:5px; height:5px; border-radius:50%; background:var(--rule); display:block;}
.dots i.on{background:var(--accent);}
.empty{padding:44px 16px; text-align:center; color:var(--faint); font:400 13.5px/1.6 var(--mono);}
:focus-visible{outline:2px solid var(--accent); outline-offset:2px; border-radius:4px;}
footer{margin-top:64px; padding-top:22px; border-top:1px solid var(--rule);
       font:400 12px/1.7 var(--mono); color:var(--faint);}
@media (max-width:640px){
  li.item{grid-template-columns:30px minmax(0,1fr);}
  li .tags{grid-row:auto; grid-column:2; margin-top:7px;}
}
@media (prefers-reduced-motion: reduce){ *{transition:none !important;} }
</style>
<link rel="stylesheet" href="doc-responsive.css">

<div class="wrap">
<header>
  <div class="eyebrow">Deep dive · hard edges and stripes</div>
  <h1>Surface</h1>
  <p class="sub">Two complaints — the planet has hard rectangular edges on it, and the
  world is striped — which turn out to be six bugs and one missing field. The rectangle is a UI
  overlay that used to repaint the whole globe. The straight lines were a stencil that clamped at a
  cube face and an atlas that filtered across five seams. Vegetation, ice, rain and cloud no longer
  paint on parallels; insolation is a daily-mean cosine and locked worlds skip zonal ITCZ.</p>
  <p class="nav"><a href="./">Pitch</a> · <a href="backlog.html">Systems</a> ·
  <a href="worlds.html">Worlds</a> · <a href="evolution.html">Evolution</a> ·
  <a href="godgame.html">God layer</a> · <a href="next.html">Next 200</a> ·
  <a href="tides-weather.html">Tides &amp; weather</a> · <a href="geology.html">Geology</a> ·
  <a href="exoparams.html">Real parameters</a> · <a href="living.html">Alive</a> ·
  <a href="currents.html">Currents</a> · <a href="realism.html">Realism</a> ·
  <a href="landscape.html">Landscape</a> · <a href="life.html">Life</a> ·
  <a href="worldspace.html">World space</a> · <a href="../vr/">Prototype</a></p>
  <dl class="tally">
    <div><dt>Items</dt><dd>${D.length}<small>${CATS.length} categories</small></dd></div>
    <div><dt>Kind</dt><dd>${count((x) => x.k === 'MODEL')}/${count((x) => x.k === 'DRAW')}/${count((x) => x.k === 'PROVE')}<small>model · draw · prove</small></dd></div>
    <div><dt>Impact 3</dt><dd>${count((x) => x.i === 3)}<small>of ${D.length}</small></dd></div>
    <div><dt>Effort</dt><dd>${count((x) => x.e === 'S')}/${count((x) => x.e === 'M')}/${count((x) => x.e === 'L')}<small>S / M / L</small></dd></div>
  </dl>
</header>

<div class="prose">
  <h2>Fixed in this pass</h2>
  <ul class="state" id="landed"></ul>

  <h2 style="margin-top:40px">What the audit found</h2>
  <ul class="state" id="fixed"></ul>

  <h2 style="margin-top:40px">Where the surface actually is</h2>
  <ul class="state" id="now"></ul>

  <h2 style="margin-top:40px">The critical path</h2>
  <p>The capabilities the largest number of other items wait on.</p>
  <div class="critwrap"><table class="crit"><tbody id="crit"></tbody></table></div>
</div>

<div class="controls">
  <div class="filters">
    <span class="flabel">Kind</span>
    <button class="f make" data-k="k" data-v="MODEL" aria-pressed="false">Model</button>
    <button class="f hand" data-k="k" data-v="DRAW" aria-pressed="false">Draw</button>
    <button class="f" data-k="k" data-v="PROVE" aria-pressed="false">Prove</button>
    <span class="flabel" style="margin-left:9px">Effort</span>
    <button class="f" data-k="e" data-v="S" aria-pressed="false">S</button>
    <button class="f" data-k="e" data-v="M" aria-pressed="false">M</button>
    <button class="f" data-k="e" data-v="L" aria-pressed="false">L</button>
    <span class="flabel" style="margin-left:9px">Impact</span>
    <button class="f" data-k="i" data-v="3" aria-pressed="false">3</button>
    <button class="f" data-k="i" data-v="2" aria-pressed="false">2</button>
    <button class="f" data-k="i" data-v="1" aria-pressed="false">1</button>
    <input id="q" type="search" placeholder="Search ${D.length} items…" aria-label="Search items">
  </div>
  <div class="tally2" id="shown"></div>
</div>

<div id="list"></div>

<div class="prose" style="margin-top:56px">
  <h2>Sequencing</h2>
  <ol class="seq" id="seq"></ol>
  <p style="margin-top:16px">The through-line: the two things a player complained about
  have different causes and deserve different treatment. The edges are bugs — an overlay that
  repaints the planet, a stencil that clamps at a cube face, an atlas that filters across a seam —
  and all three are cheap, local and testable. The stripes were honest output from a model that had
  no atmospheric water field; vapour is now per-cell, wind is geostrophy, and Earth vegetation and
  rain no longer read latitude. Ice, clouds and ENSO now follow coldness, humidity and the tropical ocean basin. Insolation is a daily-mean cosine; locked worlds skip zonal ITCZ.</p>
  <p>The picture is now measured on the CPU. <code>surfaceStats.js</code> reports neighbour ΔE,
  coastline staircase, per-face height discontinuity, zonal R², ramp saturation, drainage density
  and the ecotone fraction after every generate. A GPU framebuffer capture is still ahead, which
  is why shader-only faults remain a screenshot problem.</p>
</div>

<footer>
  Generated from <code>scripts/surface.mjs</code> — edit the source and re-run, do not edit the output.
</footer>
</div>

<script>
"use strict";
var DATA = ${data};
var CATS = ${cats};
var CRIT = ${crit};
var NOW = ${JSON.stringify(NOW)};
var FIXED = ${JSON.stringify(FOUND)};
var LANDED = ${JSON.stringify(LANDED)};
var SEQ = ${JSON.stringify(SEQ)};
var KLABEL = {MODEL:'Model', DRAW:'Draw', PROVE:'Prove'};
var active = {k:new Set(), e:new Set(), i:new Set()};
var query = '';
var listEl = document.getElementById('list');
var shownEl = document.getElementById('shown');

function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

document.getElementById('now').innerHTML = NOW.map(function(r){
  return '<li><b>' + esc(r[0]) + '.</b> ' + esc(r[1]) + '</li>'; }).join('');
document.getElementById('fixed').innerHTML = FIXED.map(function(r){
  return '<li><b>' + esc(r[0]) + '.</b> ' + esc(r[1]) + '</li>'; }).join('');
document.getElementById('landed').innerHTML = LANDED.map(function(r){
  return '<li><b>' + esc(r[0]) + '.</b> ' + esc(r[1]) + '</li>'; }).join('');
document.getElementById('crit').innerHTML = CRIT.map(function(r){
  return '<tr><td>' + esc(r.k) + '</td><td>' + r.id + '. ' + esc(r.t) +
         '</td><td>' + r.n + ' items</td></tr>'; }).join('');
document.getElementById('seq').innerHTML = SEQ.map(function(r){
  return '<li><b>' + esc(r[0]) + '.</b> ' + esc(r[1]) + '</li>'; }).join('');

function match(o){
  if (active.k.size && !active.k.has(o.k)) return false;
  if (active.e.size && !active.e.has(o.e)) return false;
  if (active.i.size && !active.i.has(String(o.i))) return false;
  if (query){
    var hay = (o.t + ' ' + o.d + ' ' + o.g + ' ' + o.n.join(' ')).toLowerCase();
    if (hay.indexOf(query) === -1) return false;
  }
  return true;
}

function dots(n){
  var out = '<span class="dots" title="Impact ' + n + ' of 3">';
  for (var k = 1; k <= 3; k++) out += '<i class="' + (k <= n ? 'on' : '') + '"></i>';
  return out + '</span>';
}

function render(){
  var html = '', total = 0;
  for (var ci = 0; ci < CATS.length; ci++){
    var cat = CATS[ci];
    var items = DATA.filter(function(o){ return o.c === cat.id && match(o); });
    if (!items.length) continue;
    total += items.length;
    html += '<section id="' + cat.id + '"><div class="sechead"><h2>' + esc(cat.name) +
            '</h2><span class="n">' + items.length + '</span></div>' +
            '<p class="blurb">' + esc(cat.blurb) + '</p><ol>';
    for (var k = 0; k < items.length; k++){
      var o = items[k];
      var cls = o.k === 'MODEL' ? 'make' : o.k === 'DRAW' ? 'hand' : 'pick';
      var dep = '';
      if (o.g) dep += '<span class="gives">gives ' + esc(o.g) + '</span>';
      if (o.n.length) dep += (dep ? ' · ' : '') + 'needs ' + o.n.map(esc).join(' ');
      html += '<li class="item"><span class="id">' + o.id + '</span>' +
              '<span class="t">' + esc(o.t) + '</span>' +
              '<span class="tags"><span class="tag ' + cls + '">' + KLABEL[o.k] + '</span>' +
              '<span class="tag e">' + o.e + '</span>' + dots(o.i) + '</span>' +
              '<span class="d">' + esc(o.d) + '</span>' +
              (dep ? '<span class="dep">' + dep + '</span>' : '') + '</li>';
    }
    html += '</ol></section>';
  }
  if (!total) html = '<p class="empty">Nothing matches those filters.</p>';
  listEl.innerHTML = html;
  shownEl.textContent = 'Showing ' + total + ' of ' + DATA.length;
}

var btns = document.querySelectorAll('button.f');
for (var b = 0; b < btns.length; b++){
  btns[b].addEventListener('click', function(){
    var k = this.dataset.k, v = this.dataset.v;
    if (active[k].has(v)) { active[k].delete(v); this.setAttribute('aria-pressed','false'); }
    else { active[k].add(v); this.setAttribute('aria-pressed','true'); }
    render();
  });
}
document.getElementById('q').addEventListener('input', function(){
  query = this.value.trim().toLowerCase(); render();
});
render();
</script>
`;
}



/* ----------------------------------------------------------------- emit -- */
await mkdir(join(ROOT, 'briefs'), { recursive: true });
await mkdir(join(ROOT, 'site'), { recursive: true });
await writeFile(join(ROOT, 'briefs', 'surface-backlog.md'), markdown() + '\n');
await writeFile(join(ROOT, 'site', 'surface.html'), html());

console.log(`surface: ${D.length} items across ${CATS.length} categories`);
for (const [id, name] of CATS) console.log(`  ${String(byCat(id).length).padStart(3)}  ${name}`);
console.log(`\nkind     model ${count((x) => x.k === 'MODEL')} · draw ${count((x) => x.k === 'DRAW')} · prove ${count((x) => x.k === 'PROVE')}`);
console.log(`effort   S ${count((x) => x.e === 'S')} · M ${count((x) => x.e === 'M')} · L ${count((x) => x.e === 'L')}`);
console.log(`impact   3 ${count((x) => x.i === 3)} · 2 ${count((x) => x.i === 2)} · 1 ${count((x) => x.i === 1)}`);
console.log('\ncritical path:');
for (const r of CRITICAL.slice(0, 18)) {
  console.log(`  ${String(r.n).padStart(3)}  ${r.k.padEnd(14)} ${r.x.t}`);
}
const unmet = new Set();
for (const x of D) for (const t of x.n || []) if (!provides.has(t)) unmet.add(t);
if (unmet.size) console.log(`\nWARNING unmet tokens: ${[...unmet].join(', ')}`);
const dup = new Map();
for (const x of D) dup.set(x.t, (dup.get(x.t) || 0) + 1);
const dupes = [...dup].filter(([, n]) => n > 1);
if (dupes.length) console.log(`\nWARNING duplicate titles: ${dupes.map(([t]) => t).join(' | ')}`);
const badCat = D.filter((x) => !CATS.some(([id]) => id === x.c));
if (badCat.length) console.log(`\nWARNING unknown categories: ${[...new Set(badCat.map((x) => x.c))].join(', ')}`);
console.log('\nwrote briefs/surface-backlog.md and site/surface.html');
