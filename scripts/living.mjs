#!/usr/bin/env node
// Single source of truth for the ORRERY "alive" backlog — 300 items on making the
// thing feel like a living world rather than a correct one.
// Emits  briefs/living-backlog.md  and  site/living.html  so the two cannot drift.
//
//   node scripts/living.mjs
//
// k:  PIC = what you see · SIM = what the world does · PLAY = what you feel · ENG = the machine.
// e:  effort S/M/L.  i: impact 1..3.
// g:  capability token this item provides.  n: tokens it needs first.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = [
  ['duet', 'The two views as one instrument',
    'A 3D globe and a flat pixel map of one patch of it, on screen at the same time. That pairing is the most distinctive thing about the product and it is currently two programs sharing a window: `drawLocalView` runs its own BFS unwrap every frame and `updateLocalHighlight` draws a wire square back onto the sphere, and that wire square is the entire conversation between them. They should read as one instrument at two magnifications — the same world, the same materials, the same light, the same moment.'],
  ['tile', 'The tile as a place',
    'The flat map is where life is actually drawn — six stamp layers deep, mats through stromatolites through daisies through flora through fauna. It is the best-observed surface in the codebase and every mark on it is seeded from `hash2(c, 0x11fe)`, a hash of the cell index with no time term. The result is a still life that changes colour. Everything in this category is about making a 250 km tile read as somewhere, with an inside, a history and a today.'],
  ['ladder', 'The scale ladder',
    'Orbit → hemisphere → patch → tile → ground → organism. The product promises you can shrink and walk in; the build has an orbital sphere, a flat map at one arbitrary magnification chosen from `LOCAL_RADII`, and nothing between or below. The rungs that are missing are exactly the ones where life lives, and the transitions between rungs are where the 2D/3D metaphor either becomes the idea or stays a minimap.'],
  ['motion', 'Motion, and the still life problem',
    'The single largest gap between this build and a living world. `drawLocalView` is called from the render loop, so it pays for sixty animations a second and draws the same frame each time: every stamp position comes from a hash of the cell index, entity jitter comes from `hash2(m.cell, n)`, and movement is `m.cell = best` — a teleport of a quarter of a million kilometres. Nothing on screen is ever mid-anything.'],
  ['indiv', 'Individuals with names and ends',
    '`nameFrom` generates names, `writeEnt` records `born: W.year`, `agentsTick` increments `m.age` — and then `respawnEntities()` fires on `lifeGrown > 80 || year % 2000 < 250` and overwrites all 1,400 `ENT.meta` slots. Every name, every birth year and every accumulated age in the world is destroyed a few times per minute. `followTarget()` returns an individual and nothing follows it.'],
  ['behav', 'Behaviour: what things do all day',
    'An entity in this world evaluates four neighbours for `life + moist*0.3 - ice*0.5`, moves with probability 0.4, and that is its whole behavioural repertoire. Settlers add `W.build[c] += rate`. Nothing rests, feeds, hunts, nests, migrates, competes, waits or fails. Behaviour is the cheapest aliveness in the project per line of code and it is almost entirely unwritten.'],
  ['chorus', 'The biosphere you can hear',
    'One 55 Hz sine, one two-second noise buffer split into bed, wind and ocean gains, and `playEvent` with seven branches. Only impacts are spatialised, at a fixed position 0.55 units ahead of the listener. Everything the player knows about this planet arrives through their eyes, which is not how anyone has ever experienced a living place.'],
  ['wx', 'Weather where you are standing',
    'The climate model tracks temperature, moisture, precipitation, cloud, wind, ash and dust per cell, and the flat map shows dust as a flat brown rectangle over the tile and ash as four to fourteen grey pixels. Weather is the fastest thing this world does and the tile view — the one place it could be witnessed rather than read off a gauge — barely acknowledges it.'],
  ['rhythm', 'Rhythms: day, tide, season, century',
    'A living world is legible because it repeats. `W.season` exists and drives insolation, the Keeling sawtooth and the green wave; there is no day phase anywhere in the codebase, because at 10 kyr per tick a day cannot be a simulation quantity. It has to be a presentation quantity instead, and admitting that unlocks the entire fast end of the experience.'],
  ['trace', 'The world remembers',
    'Fields in this model are state, not history. `W.build[c]` decays by 0.004 per tick when life falls away and the settlement is simply gone — no ruin, no cleared ground, no field boundaries under the forest. A world that never keeps a mark reads as a simulation being computed; a world covered in the residue of what happened reads as a place that has been lived in.'],
  ['news', 'News from the world',
    '`chronicle.js` logs 4,000 events with a cell, a magnitude and a label, and `whatHappenedHere` finds nearby ones with `Math.abs(e.cell - cell) < radiusCells * 10` — index arithmetic on a cube-sphere, which is not geography. There is a genuine record of everything that has happened on this planet and almost no path by which it reaches the person watching.'],
  ['instrument', 'The interface as a living instrument',
    'Twenty-seven tools, a legend strip, a status line reading `FOCUS pinned CELL 16417 LIFE reptile BIOME desert VIEW 25×25`, and a deep-time ribbon. The information is good and the presentation is a debug overlay: nothing in the chrome is alive, nothing responds to the world behind it, and the numbers are shown at a precision the model cannot support.'],
  ['touch', 'Presence: it knows you are there',
    'The gap between a diorama and a place is whether it responds. The brush has a radius, a profile, masks and undo, and once the act is committed the world carries on exactly as if a god had not just put a hand through the sky. Nothing flinches, nothing notices locally, nothing is disturbed and then settles.'],
  ['pace', 'Pacing, idleness and the long look',
    'Deep time is the pitch and 10 kyr per tick is the reality, so every human-scale event in four and a half billion years is invisible. The design question this category is about is not speed, it is what the player is given to watch during the ninety-nine per cent of the time when nothing on the geological clock is happening.'],
  ['craft', 'The craft of aliveness',
    'Aliveness is a property that can be measured, regressed and lost. It is also the one property in this project with no test, no budget and no stated definition, which means every item above is one clever optimisation away from being reverted. This category is about keeping it once it arrives.'],
];

const D = [
/* --------------------------------------------------------------- duet -- */
{c:'duet',t:'One description of a cell, consumed by both views',g:'tileframe',d:'`cellColor` in `localview.js` and `refreshColours` in `render.js` are two independent readings of the same fields, and they disagree — the flat map decides water from `W.h[c] < W.seaLevel` and three depth bands, the globe shader guesses it from `smoothstep(0.55, 0.12, biome.r)`. Build one function that turns a cell into a described surface — material, cover, wetness, cover density, pigment, wear — and have the globe, the flat map and every future ground view all read it. Every item in this backlog that has to look consistent across magnifications is waiting on this.',k:'ENG',e:'M',i:3},
{c:'duet',t:'Make the patch rim a window, not a wire square',n:['tileframe'],d:'`updateLocalHighlight` walks the outer ring of the unwrapped patch and emits a line loop at `lift = 1.005`. It reads as an annotation on a globe. A framed aperture — brightened inside, dimmed and slightly desaturated outside, with the frame catching the terminator light — reads as the place the flat map is looking, which is the actual claim the interface is making.',k:'PIC',e:'S',i:3},
{c:'duet',t:'Fix the build lift disagreement between the two views',d:'`cellSurfPos` in `render.js` lifts the rim by `W.build[c] * 0.12`; `writeEnt` in `agents.js` lifts entities by `W.build[c] * 0.012`, or `0.0035` on earthLike worlds. The same settlement sits at three different altitudes depending on which code drew it, and over a dense city the rim floats visibly above its own inhabitants.',k:'ENG',e:'S',i:2},
{c:'duet',t:'Animate the focus change as a movement, not a cut',d:'`stepFocus` reassigns the focus cell and the next frame draws a completely different patch. A living instrument pans: hold the outgoing patch, slide the new cells in along the unwrap axis over about 180 ms, and carry the globe rim with it. The gesture already exists in `main.js` as an accumulated drag; only the visual continuity is missing.',k:'PLAY',e:'M',i:3},
{c:'duet',t:'Let the flat map inherit the globe’s light',n:['tileframe'],d:'The globe has a terminator, a Rayleigh rim, aerosol reddening and an exposure that adapts. The flat map is lit by nothing — `#2a6a8a` is `#2a6a8a` at local midnight. Multiplying the tile palette by the same sun direction and exposure the shader uses makes the two views the same world at the same instant, and it costs one dot product per cell.',k:'PIC',e:'M',i:3},
{c:'duet',t:'Draw the terminator across the flat map',n:['tileframe','dielfield'],d:'When the patch straddles the day–night line the map should show it: warm low-angle light on one side, blue shadow and settlement lights on the other, and the line creeping across the tiles as the planet turns. It is the single clearest demonstration that the flat map is a window onto the sphere rather than a schematic beside it.',k:'PIC',e:'M',i:3},
{c:'duet',t:'Project the patch as a quad on the globe, not a rim',n:['tileframe'],d:'Render the flat map’s own canvas as a texture on the sphere inside the rim, at the resolution the flat map is drawing. The player sees the detailed view in place on the planet, and the 2D and 3D representations stop being two pictures and become one picture at two densities.',k:'PIC',e:'L',i:3},
{c:'duet',t:'Show where the flat map is when it is off-screen',d:'The focus cell can be on the far side of the planet, and the flat map goes on cheerfully drawing a patch the globe is not showing. A soft directional indicator at the limb — or a dimmed rim drawn through the sphere with a depth test — keeps the two views honestly connected.',k:'PLAY',e:'S',i:2},
{c:'duet',t:'Click a cell on the globe, watch the map fly to it',d:'`desktopPick` already resolves a screen position to a cell. Making that gesture drive the flat map’s focus with the pan animation above turns the pairing into a navigation instrument instead of two panels that happen to be synchronised.',k:'PLAY',e:'S',i:3},
{c:'duet',t:'Hover on the flat map, glow on the globe',d:'`S.localHoverCell` is tracked and dims non-matching legend keys on the flat map. The same hover should light the corresponding cell on the sphere. Two-way highlight is the cheapest possible proof to a new player that these are the same cells.',k:'PLAY',e:'S',i:3},
{c:'duet',t:'Stop repainting 24,576 cells when the focus moves',d:'`main.js` calls `refreshColours(1)` whenever `S._localFocus` changes and the globe wash is on — a full vertex-colour rewrite of the entire planet because a 25-cell window slid one tile sideways. Write the wash as a separate uniform or a mask texture and the most-used gesture in the interface stops costing the most expensive operation in the frame.',k:'ENG',e:'M',i:3},
{c:'duet',t:'Cache the patch topology',g:'mapcache',d:'`unwrapPatch` runs every frame from `drawLocalView`: a BFS over a `Map` whose keys are concatenated coordinate strings, using `q.shift()` on a plain array, up to 3,249 cells at radius 28. The topology only changes when the focus or radius changes. Cache it, and the entire animation budget this backlog needs appears out of nowhere.',k:'ENG',e:'S',i:3},
{c:'duet',t:'Stop scanning the planet to find the focus',n:['mapcache'],d:'`pickFocusCell` walks all `NC` cells scoring `build*3 + life` whenever there is no pin and no inspect — once per frame, forever, to answer a question whose answer changes over geological time. Recompute it when the biosphere changes, not when the monitor refreshes.',k:'ENG',e:'S',i:2},
{c:'duet',t:'Keep the two views at the same visual density',d:'On a 200 px panel at radius 28 a cell is about six device pixels and the detailed stamp path switches off at `cellPx >= 10`, so the map silently becomes a different visual language mid-zoom while the globe stays as it was. Either interpolate between the two languages or pick the radius from the panel size so the crossover never happens during play.',k:'PIC',e:'M',i:2},
{c:'duet',t:'Give the flat map the globe’s weather',n:['tileframe'],d:'Cloud cover is a field, and it shades the sphere. Over the flat map it does not exist, so the tile is always in full sun while the globe above it is overcast. Drifting cloud shadow across the tiles is the same data, the same tick, and it is the most animated thing the map could possibly show.',k:'PIC',e:'M',i:3},
{c:'duet',t:'Reconcile the two hit-tests',d:'`cellAtLocalPixel` and `hoverCellAt` are two functions doing the same arithmetic against the same layout with slightly different signatures, one taking device pixels and one taking CSS pixels. They will drift, and when they do, clicking will select a different cell from the one under the cursor.',k:'ENG',e:'S',i:2},
{c:'duet',t:'Let the flat map be the brush target',d:'Every god tool takes its target from a right-click on the sphere. The flat map is a far better aiming surface — it is flat, it is magnified and it shows what is actually there. Painting into the map and watching the consequence appear on the globe is the whole 2D/3D metaphor in one gesture.',k:'PLAY',e:'M',i:3},
{c:'duet',t:'Show the patch’s own scale bar and area',d:'The status strip says `VIEW 25×25`. At N=64 that is a window roughly 6,000 km across containing 625 cells of about 62,000 km² each. A scale bar and a named comparison — "about Australia" — is the difference between a player believing the map is a village and knowing it is a continent.',k:'PLAY',e:'S',i:3},
{c:'duet',t:'Distort the flat map honestly at the cube corners',d:'`unwrapPatch` assigns integer x,y by BFS and the comment in `neighborAt` quietly admits the axes are approximate. Near a cube-sphere corner a cell has five neighbours and the square grid cannot hold it. Show the seam — a visible fold or a marked missing tile — rather than papering over it with a `-1` that draws as background.',k:'ENG',e:'M',i:2},
{c:'duet',t:'Let the globe rim breathe with the world, not the frame',d:'The rim is rebuilt in full every call and the computed `_localKey` that could skip the rebuild is assigned and never compared. Once it is cached, spend the freed budget on making it pulse gently with local activity — a bloom, an eruption, a settlement founding — so the frame itself reports that something is happening inside it.',k:'PIC',e:'S',i:2},
{c:'duet',t:'Two magnifications of one material, not two palettes',n:['tileframe'],d:'Desert on the flat map is `#b89460`; desert on the globe comes out of the ruleset colour ramp. Nobody authored them to match and they do not. A shared material table with one entry per surface type, sampled by both, is a half-day of work and it is what makes the pairing read as a lens rather than as a legend.',k:'PIC',e:'S',i:3},
{c:'duet',t:'Give the pair a name and teach it in the first ten seconds',d:'A new player sees a planet and a pixel-art square in the corner and has no reason to connect them. One authored moment on load — the rim sweeping to a living coast, the map filling in behind it — establishes the relationship permanently, and it is the cheapest teaching in the whole product.',k:'PLAY',e:'S',i:3},

/* --------------------------------------------------------------- tile -- */
{c:'tile',t:'Put a time term in every sub-cell hash',g:'preclock',d:'`stampLife` seeds from `hash2(c, 0x11fe)`, `paintCellDetail` from `hash2(c, W.seed ^ 0x9e3779b9)`, `ditherCell` from `c * 1103515245`. None of them contain the year, the season, the tick or the wall clock, so the flat map draws an identical image every frame it is asked for. Introduce one presentation clock — decoupled from the 10 kyr sim tick — feed it into these seeds, and the map comes alive without a single new system.',k:'PIC',e:'S',i:3},
{c:'tile',t:'Sub-cell state for the focused patch only',g:'patchsim',d:'A cell is 250 km across and the flat map draws individual trees in it. The honest version is a second, finer state — a few hundred sub-cells per tile — simulated only for the patch under the window and seeded from the coarse cell it lives in. It is the same idea as the regional refinement patch, scoped to the one place the player is looking.',k:'SIM',e:'L',i:3},
{c:'tile',t:'Fifteen biomes, fifteen textures',n:['tileframe'],d:'`BIOMES` has fifteen entries. `paintCellDetail` branches on desert, boreal and tundra, and everything else falls into one generic case that brightens green slightly. Upwelling, gyre, vent, reef, savanna, tropical seasonal and temperate rainforest are all currently the same handful of pixels.',k:'PIC',e:'M',i:3},
{c:'tile',t:'Stop drawing 128 px sprites at 6 px with smoothing off',d:'`drawLocalView` sets `imageSmoothingEnabled = !hiFi`, so in exactly the mode where the detailed stamps are used, the 128 px atlas tiles are point-sampled down to five or six pixels. Either author real small-size sprites, or mip the atlas, or turn smoothing back on for the stamp pass. Every organism in the best view in the product is currently aliased mush.',k:'PIC',e:'S',i:3},
{c:'tile',t:'Give the tile a horizon and a sense of down',d:'The flat map is a top-down grid and the stamps are side-on — trees have trunks, houses have roofs and doors, stromatolites have layered domes. It is already an oblique view pretending to be a plan view. Commit to the oblique: consistent light direction, consistent ground line per tile, and short cast shadows. The pixel-art tradition this borrows from is oblique for exactly this reason.',k:'PIC',e:'M',i:3},
{c:'tile',t:'Slope inside the tile',n:['patchsim'],d:'`W.h` gives one elevation per cell and the map draws every tile as flat ground. Deriving an intra-tile gradient from the neighbours — and shading the tile accordingly — gives the flat map topography, which is the main thing a plan view of a landscape is supposed to convey.',k:'PIC',e:'M',i:3},
{c:'tile',t:'Rivers that cross tiles',n:['patchsim'],d:'The hydrology model routes discharge cell to cell. On the flat map there is no river at all — the wettest inland tile and a floodplain look identical. A drawn channel entering one edge and leaving another, widening downstream, is the strongest single cue that the tiles are part of a continuous landscape.',k:'PIC',e:'M',i:3},
{c:'tile',t:'Coastlines with a shape',d:'`touchesSea` returns a boolean and the response is a sand rectangle along the bottom edge of the tile, regardless of which side the sea is on. Use the four neighbour tests to place the fringe on the correct edges, curve it, and let the water intrude — a bay, a spit, an estuary. Coast is where a player’s eye goes first.',k:'PIC',e:'S',i:3},
{c:'tile',t:'Let the tile show what is under it',n:['tileframe'],d:'`rock`, `sediment`, `ore`, soil depth and crustal age are all tracked and none of them reach the flat map. Exposed bedrock on a scoured shield, dark volcanic soil, pale evaporite, ochre laterite — surface colour that reports geology is how a real landscape tells you its history at a glance.',k:'PIC',e:'M',i:3},
{c:'tile',t:'Make the mat layer a carpet, not confetti',d:'`stampMats` places up to sixty independent rectangles at hashed positions. Real microbial mats are continuous, wrinkled sheets with edges, tears and a colour that varies across the sheet. A coherent noise field clipped to the tile would read as a living crust rather than as speckle.',k:'PIC',e:'S',i:2},
{c:'tile',t:'Cap the flora count with a canopy, not a number',d:'`stampFlora` draws `Math.min(1 + life*5, 7)` trees. A closed tropical canopy at NPP 0.9 and a savanna at 0.3 therefore differ by four sprites. Model cover fraction instead: at high cover the crowns merge into a continuous canopy with gaps, at low cover they are discrete individuals with ground between them.',k:'PIC',e:'M',i:3},
{c:'tile',t:'Trees with an age',n:['preclock'],d:'Every stamp is drawn at a size hashed from its index. Carrying a per-stamp age — seeded on establishment, growing over ticks, resetting after fire or clearance — means a recovering forest looks like a recovering forest, which is a thing the model already simulates and the picture currently cannot say.',k:'PIC',e:'M',i:3},
{c:'tile',t:'Understorey, litter and bare ground',d:'The flora layer draws crowns onto a flat base colour, so a forest floor and a mown lawn are the same pixels. Litter, shadow pooling under the crowns, and visible bare soil where cover is low are what make vegetation sit on the ground instead of floating over it.',k:'PIC',e:'S',i:2},
{c:'tile',t:'Draw the reef as a structure with a depth',d:'`stampOceanLife` places up to four reef sprites at random heights in the tile. A reef has a crest, a lagoon, a fore-reef slope and a break where the surf is — and `W.reef` plus depth plus the wave direction is enough to place them. It would be the most legible marine feature in the product.',k:'PIC',e:'M',i:2},
{c:'tile',t:'Water that reads as water',d:'Sea tiles get sparkle pixels when shallower than 0.08 and dark flecks otherwise. Add a wave direction from the wind field, a shoreline break, wet sand between the tide marks, and a translucency that shows the bottom in the shallows. It is the largest surface on most worlds and the least drawn.',k:'PIC',e:'M',i:3},
{c:'tile',t:'Ice with texture and age',d:'`ice > 0.45` produces `#d8e4f0` and a scatter of bright pixels. Fresh snow, old firn, blue glacial ice, sastrugi, crevasse fields, melt ponds and open leads are all visually distinct and the model has enough state to pick between them. Half the catalogue is an ice world.',k:'PIC',e:'M',i:2},
{c:'tile',t:'Show the dust storm arriving',d:'`dust > 0.12` fills the tile with one flat brown rectangle at up to 0.4 alpha. On a world whose signature phenomenon is a hemispheric dust storm, that is the whole depiction. A leading edge, streamers aligned to the wind, and a visibility falloff that hides the ground would make it an event you watch arrive.',k:'PIC',e:'M',i:3},
{c:'tile',t:'Volcanic ash as fall, not as speckle',d:'Ash draws four to fourteen grey pixels. Fall thickness accumulating over ticks, mantling the terrain, killing the flora layer, then weathering into a fertile dark soil over millennia — the model already tracks ash, and this is three visual states from one field.',k:'PIC',e:'M',i:2},
{c:'tile',t:'Buildings that fit their site',d:'`stampBuildings` draws up to three identical huts with a roof triangle and one dirt path, positioned by hash. Placing them on flat ground, off the water, along the road, facing it, and clustered rather than scattered is the difference between a settlement and three sprites in a square.',k:'PIC',e:'M',i:2},
{c:'tile',t:'Fields, walls and cleared ground around a settlement',d:'A `build` value of 0.85 draws three houses and no agriculture whatsoever. The visible footprint of a human settlement is overwhelmingly its fields, not its buildings, and cleared ground with boundaries is both easy to draw and the clearest signal that something intends to stay.',k:'PIC',e:'M',i:3},
{c:'tile',t:'Roads that leave the tile',d:'The dirt path is drawn from the tile’s midpoint to its own edges with no reference to the neighbours. Connecting to the adjacent settled tiles turns a hundred unrelated paths into a network, and a network is the most inhabited-looking thing a map can contain.',k:'PIC',e:'S',i:3},
{c:'tile',t:'Let the tile be inspected as a place, not a row of numbers',d:'The status strip reads `CELL 16417 LIFE reptile BIOME desert`. A written sentence — what grows here, who lives here, what happened here recently, what it was like ten million years ago — is the same data and it is the difference between a debug readout and a place with a description.',k:'PLAY',e:'M',i:3},

/* ------------------------------------------------------------- ladder -- */
{c:'ladder',t:'Name the rungs and make them explicit',g:'rungs',d:'The build has orbit and one flat map whose magnification is a six-way toggle over `LOCAL_RADII`. Declare the ladder — orbital, hemispheric, regional, patch, tile, ground, organism — decide which representation serves each, and the question "what should the 2D map show" stops being answered per feature.',k:'PLAY',e:'S',i:3},
{c:'ladder',t:'A regional rung between the globe and the patch',n:['rungs'],d:'Radius 28 is 57 cells across and radius 3 is seven; there is nothing that shows a continent. A regional view — coarse tiles, no organisms, biome and weather and settlement pattern only — is the rung where biogeography becomes visible, and biogeography is the most legible thing the ecology model produces.',k:'PIC',e:'M',i:3},
{c:'ladder',t:'A ground rung inside a single tile',n:['patchsim'],d:'The pitch is that you shrink and walk in. The deepest rung in the build is a 17-pixel tile seen from above. A first-person view inside one tile — canopy overhead, ground underfoot, the sky from `scatter`, the local organisms at body scale — is where every visual system in the project finally pays off at once.',k:'PIC',e:'L',i:3},
{c:'ladder',t:'An organism rung: hold one and look at it',n:['spritegram'],d:'`evolve.js` carries a trait vector, `morphology.js` turns it into a body plan, and the player is shown one of sixteen SVG paths at six pixels. Being able to pick up a lineage and turn it over is the payoff for the entire evolution model and it needs no new simulation at all.',k:'PLAY',e:'M',i:3},
{c:'ladder',t:'Make the transitions continuous',n:['rungs'],d:'Changing `S.localRadius` swaps the whole image on the next frame. A zoom that interpolates — tiles subdividing, stamps resolving into individuals, the grid fading out — is what makes the ladder feel like one continuous world rather than a set of unrelated pictures of it.',k:'PLAY',e:'M',i:3},
{c:'ladder',t:'Keep the moment across a rung change',d:'A player who descends from orbit into a tile should arrive at the same instant they left, with the same weather, the same light and the same animals in the same places. Nothing in the current code guarantees this, because nothing at the tile scale persists between draws.',k:'ENG',e:'M',i:3},
{c:'ladder',t:'A different question at every rung',n:['rungs'],d:'Orbit answers "what kind of planet is this". Region answers "why is it like that here". Tile answers "what is it like to be here". Ground answers "what is happening right now". If two rungs answer the same question, one of them is decoration — and that is the test for whether the ladder is doing any work.',k:'PLAY',e:'S',i:2},
{c:'ladder',t:'Statistical at the top, individual at the bottom',n:['being'],d:'`MAX_ENT = 1400` sprites are spread over the whole planet by striding the living-cell list, which means the orbital view shows individuals it cannot afford and the tile view shows fewer than it should. Density from orbit, cohorts at regional range, individuals at tile range, and one population model underneath all three.',k:'ENG',e:'M',i:3},
{c:'ladder',t:'Let the ladder be driven by the body in VR',d:'Two-finger pinch scaling landed. The scale gesture should move the player down the rungs — hold the planet, bring it to your face, and the flat map becomes the ground. That is the product’s central promise and it is currently a slider in a dock panel.',k:'PLAY',e:'L',i:3},
{c:'ladder',t:'Say what a cell is, in the interface, at every rung',d:'A cell is roughly 250 km across and about 62,000 km². A player looking at a tile with three houses and four trees on it is being invited to a wrong conclusion by four orders of magnitude, and one honest label per rung fixes it.',k:'PLAY',e:'S',i:3},
{c:'ladder',t:'Sub-cell detail that is derived, never invented',n:['patchsim'],d:'Everything drawn below cell resolution must be a function of cell state plus a stable seed, so descending never contradicts the view above. The stamps mostly obey this by accident; writing it down as a rule is what stops the ground rung from becoming a diorama that disagrees with the planet.',k:'ENG',e:'M',i:3},
{c:'ladder',t:'Cost the rungs and budget them',d:'The flat map currently rebuilds a BFS and repaints thousands of stamps every frame at every magnification. Before adding four rungs, give each one a millisecond allowance and a measured cost, or the ladder will be built and then quietly disabled on the target hardware.',k:'ENG',e:'S',i:3},
{c:'ladder',t:'A second window, so two rungs are visible at once',d:'The pairing of globe and patch is the product’s signature; the same argument applies to patch and ground, or to two patches on opposite sides of an ocean. The panel code already supports four snap corners and a size ladder — supporting two instances is mostly bookkeeping.',k:'PLAY',e:'M',i:1},
{c:'ladder',t:'Pin a place and keep it',d:'`S.localPin` exists and holds one cell. Named, saved bookmarks — the reef you seeded, the isthmus that closed, the valley where the first settlement was — turn the ladder into a way of revisiting a world rather than a way of looking at it.',k:'PLAY',e:'S',i:3},
{c:'ladder',t:'Follow something down the ladder',n:['attn'],d:'Selecting a clade at orbital range and descending should land on a population of it; selecting an individual at tile range and ascending should show its range on the globe. Attention that survives a change of magnification is what makes the rungs one instrument.',k:'PLAY',e:'M',i:3},
{c:'ladder',t:'Level-of-detail for behaviour, not only for pixels',n:['behavcore'],d:'A thousand individuals cannot each run a full behaviour model at orbital range, and four of them in a tile absolutely should. Behaviour needs the same LOD ladder as geometry: aggregate statistics far away, full state machines where the player is looking.',k:'ENG',e:'M',i:3},
{c:'ladder',t:'The far side of the planet still has to be alive',d:'If aliveness only exists inside the patch window, the world becomes a stage set that assembles itself where the player looks. Coarse but real activity everywhere — populations moving, settlements founded, blooms spreading — with detail only near the window, is the compromise that holds up.',k:'SIM',e:'M',i:3},
{c:'ladder',t:'Motion sickness and the descent',d:'Scaling a player from orbital to ground scale in a headset is one of the more reliable ways to make them ill. The transition needs a fixed reference — the horizon, the frame, a held object — and it needs testing on the device before the ground rung is designed around it.',k:'PLAY',e:'M',i:3},
{c:'ladder',t:'One camera model, all rungs',d:'The desktop path has an orbit camera, the flat map has a focus cell and a radius, and XR has a room-scale rig. Three navigation models with three sets of state is why the views drift apart; a single camera whose scale parameter selects the rung is the version that stays coherent.',k:'ENG',e:'L',i:2},
{c:'ladder',t:'Show the ladder itself',n:['rungs'],d:'A small indicator of where the player is in the scale ladder — with the cell size, the area shown and the rung name — is both a navigation aid and a constant reminder that the pixel square in the corner is a window into a planet rather than a map of a village.',k:'PLAY',e:'S',i:2},

/* ------------------------------------------------------------- motion -- */
{c:'motion',t:'A presentation clock that is not the sim clock',n:['preclock'],d:'The sim runs at up to 10 kyr per tick and the screen refreshes sixty times a second. Everything in this category needs a second clock — seconds, not millennia — that drives animation, wind, waves, wingbeats and light without touching the simulation state. Naming it and putting it in `W` is the single highest-leverage line of code in this backlog.',k:'ENG',e:'S',i:3},
{c:'motion',t:'Interpolate between sim ticks everywhere',d:'`refreshColours(simAlpha)` already interpolates the globe’s vertex colours between ticks. The flat map does not interpolate anything: a cell crosses `life > 0.45` and its entire stamp set changes in one frame. The same alpha is available to the map and would smooth every transition on it.',k:'PIC',e:'M',i:3},
{c:'motion',t:'Give entities a position, not a cell',g:'being',d:'`ENT.data` holds a normalised direction recomputed from `DIR[c*3]` whenever `m.cell` changes, so an animal is always exactly at a cell centre and gets from one to the next instantaneously. A continuous position with a velocity, updated against the presentation clock and constrained to the local neighbourhood, is the foundation of every moving thing below.',k:'SIM',e:'M',i:3},
{c:'motion',t:'Walk, do not teleport',n:['being'],d:'`m.cell = best` moves an organism roughly 250 km between frames. Once entities have positions, movement becomes a traversal at a plausible speed — and at tile scale the player watches something cross the ground rather than blink to a new square.',k:'PIC',e:'S',i:3},
{c:'motion',t:'Face the direction of travel',n:['being'],d:'Sprites are drawn axis-aligned from a 4×4 atlas with no notion of heading. A heading, a mirrored sprite for leftward travel, and a slight lean into turns is a handful of lines and it is the difference between animals and stickers.',k:'PIC',e:'S',i:3},
{c:'motion',t:'A gait, from the allometry that is already there',n:['being'],d:'`morphology.js` produces a `stride` and `bodyPlanFromTraits` knows the body mass. Stride frequency scales roughly as mass to the minus one-sixth, so small things should be frantic and large things ponderous — driven by the same numbers that set population density, so the picture and the model cannot drift.',k:'PIC',e:'M',i:3},
{c:'motion',t:'Vegetation that moves in the wind',n:['preclock'],d:'`windU` and `windV` are per-cell fields. Swaying the canopy stamps by a phase offset per tree, amplitude from wind speed and direction from the wind vector, makes the wind field visible for the first time and makes a still forest into a breathing one. It is the classic cheapest aliveness trick in the medium.',k:'PIC',e:'S',i:3},
{c:'motion',t:'Water that is never still',n:['preclock'],d:'Sea tiles get static sparkle pixels. Scrolling the sparkle along the wind direction, animating a shoreline break, and letting the swell height come from `meanWind` costs almost nothing and removes the strongest static-image cue on any ocean world.',k:'PIC',e:'S',i:3},
{c:'motion',t:'Clouds that drift over the tile',n:['preclock','tileframe'],d:'Cloud cover exists as a field and the flat map ignores it entirely. Advecting a cloud-shadow pattern across the tiles at the local wind speed is the largest visible motion a landscape has, and it is one texture lookup offset by the presentation clock.',k:'PIC',e:'M',i:3},
{c:'motion',t:'Smoke, steam and plumes that rise',d:'Volcanoes are discrete objects with eruption schedules; on the flat map an erupting volcano is a slightly greyer tile. A rising column, bending downwind, is one of the few things in a landscape that unambiguously means "this is happening right now".',k:'PIC',e:'M',i:2},
{c:'motion',t:'Fire that spreads and leaves a scar',n:['tracefield'],d:'Nothing in the model burns. Fire is the fastest visible ecological process on a vegetated planet, it is a genuine carbon flux, it propagates against wind and moisture, and it leaves a burn scar that greens back over decades. It is the highest ratio of drama to code in this entire list.',k:'SIM',e:'M',i:3},
{c:'motion',t:'Growth that happens in front of you',n:['preclock'],d:'Life crossing a threshold currently swaps one stamp set for another. A sprout that lengthens, a crown that fills, a mat that spreads across the tile over several seconds of wall clock, is the same state change presented as an event rather than as an edit.',k:'PIC',e:'M',i:3},
{c:'motion',t:'Death that is visible as an event',n:['being'],d:'When `W.life[c]` falls, stamps stop being drawn. Wilting, browning, thinning and then standing dead wood is a sequence, and it is what makes a drought or a poisoning land as a loss rather than as a colour change.',k:'PIC',e:'M',i:3},
{c:'motion',t:'Settlement lights that flicker on at dusk',n:['dielfield'],d:'`cityLights` computes a night-side glow for the globe. The flat map has no night and no lights. Windows lighting up across a valley as the terminator passes is the most human signal a map can carry, and both views have the data to draw it.',k:'PIC',e:'S',i:3},
{c:'motion',t:'Never animate everything at once',d:'Coherent motion across a whole tile reads as a screensaver. Per-stamp phase offsets from the existing hashes, a small fraction of stamps active at any moment, and occasional idle breaks are what make motion read as many independent things rather than one animated texture.',k:'PIC',e:'S',i:3},
{c:'motion',t:'Ease every interface transition',d:'Panel resizes jump between the four `LOCAL_SIZES`, the radius toggle swaps the image, and the globe wash appears in one frame. Short eased transitions on all three cost nothing and are most of the difference between a prototype and a product.',k:'PLAY',e:'S',i:2},
{c:'motion',t:'Animate the sim tick itself, so the player can feel it',d:'The clock says 10 kyr/tick and nothing on screen indicates when a tick lands. A subtle pulse in the deep-time ribbon on each tick gives the player a heartbeat to read the world’s pace against, which matters enormously once they can change that pace.',k:'PLAY',e:'S',i:1},
{c:'motion',t:'Decouple animation from the sim pause',d:'When the world is paused the biosphere should keep breathing — leaves move, water shimmers, animals shift their weight — because a paused simulation should look like a held moment rather than a crashed program. This falls out of the presentation clock for free and needs to be an explicit decision.',k:'PLAY',e:'S',i:3},
{c:'motion',t:'Budget the animation, and make it degradable',d:'The flat map already spends a full BFS and thousands of canvas calls per frame. Adding motion without a measured budget guarantees that the first performance pass deletes the aliveness. Name the cost, cap it, and degrade by dropping stamp animation before dropping stamps.',k:'ENG',e:'S',i:3},
{c:'motion',t:'Draw the flat map on its own cadence',n:['mapcache'],d:'The map is redrawn every frame whether or not anything changed. Once motion exists, the right design is the opposite: redraw at a fixed 20–30 Hz on a dirty-rect basis, so the animation is deliberate and the cost is predictable rather than tied to the globe’s frame rate.',k:'ENG',e:'M',i:2},
{c:'motion',t:'Respect prefers-reduced-motion',d:'A living tile view is by definition a lot of small movement, and for some players that is unusable. The generated backlog pages already honour the media query; the product itself must, with motion reduced to slow colour change rather than removed entirely.',k:'PLAY',e:'S',i:2},
{c:'motion',t:'Motion has to survive the seam',d:'Wind-driven sway and cloud drift are computed in the unwrapped patch’s local x,y, and those axes rotate across a cube face boundary. Without a shared tangent frame per cell, a storm crossing a seam will visibly turn ninety degrees, which is worse than no motion at all.',k:'ENG',e:'M',i:2},

/* -------------------------------------------------------------- indiv -- */
{c:'indiv',t:'Stop destroying every individual twice a minute',n:['being'],d:'`respawnEntities()` fires on `W.lifeGrown > 80` or `W.year % 2000 < 250` and rewrites all 1,400 `ENT.meta` slots — names, birth years, ages and body plans included. Replace the wholesale respawn with births and deaths at the edges, and the population becomes a population rather than a periodically reshuffled sample.',k:'SIM',e:'M',i:3},
{c:'indiv',t:'Give every entity a stable identity',n:['being'],d:'An entity is identified by its slot index, which is reused on the next respawn. A monotonic id that survives reallocation is what makes it possible to follow, name, remember or mourn anything at all.',k:'ENG',e:'S',i:3},
{c:'indiv',t:'Name more than settlers and worms',d:'`writeEnt` assigns a name only when `kind === 5 || kind === 7 || kind >= 14`. Names are the cheapest attachment mechanism ever invented and there is no reason a herd animal, a founding tree or a reef should not have one.',k:'PLAY',e:'S',i:2},
{c:'indiv',t:'Names that come from somewhere',d:'`nameFrom` concatenates one of twenty prefixes with one of ten suffixes, so two hundred names exist for all time on every world. Deriving naming style from the culture, the lineage or the ruleset makes a name a piece of information rather than a label.',k:'PLAY',e:'M',i:1},
{c:'indiv',t:'A follow camera that actually follows',n:['attn'],d:'`followTarget()` returns a named individual and no caller does anything with it. Following one animal or settler — the flat map keeping it centred, the globe rim tracking it — is the single feature most likely to make a player care about anything in this world.',k:'PLAY',e:'M',i:3},
{c:'indiv',t:'A life panel: who this is, what it is doing, how long it has left',n:['being','behavcore'],d:'`m.born`, `m.age`, `m.plan`, `m.kind` and `m.cell` are all recorded and none of them are ever displayed. A small card — name, clade, age, current state, where it was born — converts a sprite into a subject at almost no cost.',k:'PLAY',e:'S',i:3},
{c:'indiv',t:'Let individuals age visibly',n:['being'],d:'`m.age++` runs every tick and affects nothing. Size, colour, gait and stamp variant changing with age means a herd contains juveniles and old animals, which is one of the most reliable readings of a real population.',k:'PIC',e:'M',i:2},
{c:'indiv',t:'Deaths that are recorded with a cause',n:['being','evfeed'],d:'An entity that lands on a cell with `life < 0.04` is teleported to a random cell with `life > 0.25` and given a new name. It did not die; it was recycled. Real deaths, with a cause drawn from the mechanism that killed it, are the raw material for every emotional beat in the product.',k:'SIM',e:'M',i:3},
{c:'indiv',t:'Lineages, not just individuals',n:['being'],d:'`evolve.js` maintains a phylogeny of clades and `agents.js` picks a living node with `W.tree.living[(c + n) % length]` — an arbitrary pairing recomputed on every respawn. Individuals should belong to a lineage permanently, so that watching a family group is watching a branch of the tree.',k:'SIM',e:'M',i:3},
{c:'indiv',t:'A founder you are told about',n:['evfeed'],d:'The first organism to cross onto land, the first to breathe oxygen, the first settler on a new continent. `meta.js` already records firsts as `moments`; attaching them to a specific named individual makes the milestone a story instead of a log line.',k:'PLAY',e:'S',i:3},
{c:'indiv',t:'Family groups and kinship',n:['being'],d:'Parents, offspring and siblings moving together, with juveniles staying close. It is a small addition to the flocking code and it is the behaviour humans are most primed to recognise as life.',k:'SIM',e:'M',i:2},
{c:'indiv',t:'Settlers who are people, not build increments',d:'A kind-5 entity raises `W.build[c]` by about 0.02 per tick and wanders toward the highest score. Giving it an occupation, a household, a destination and a reason for going there is what makes a settlement look founded rather than accumulated.',k:'SIM',e:'M',i:3},
{c:'indiv',t:'Let the player name things',d:'A player who names a continent, a clade or an animal has committed to it. It is the oldest trick in this genre, it is nearly free, and every artefact the product exports — chronicle, paper, finale — becomes more specific because of it.',k:'PLAY',e:'S',i:3},
{c:'indiv',t:'A handful of tracked lives, not fourteen hundred',d:'Full individual state for 1,400 entities is unaffordable and unnecessary. Promote a few — the ones the player has looked at, named, or that are doing something notable — to full simulation with history, and leave the rest statistical.',k:'ENG',e:'M',i:3},
{c:'indiv',t:'Individuals survive a save and a reload',d:'`serializeRun` writes world fields; entities are regenerated from scratch on load. A named animal the player has been following disappearing across a save is worse than never having named it.',k:'ENG',e:'M',i:2},
{c:'indiv',t:'One organism you can hold and examine',n:['spritegram'],d:'The end point of the whole morphology system: pick up the thing, see the body plan the trait vector produced, read its tolerances, and put it back. In VR this is the product’s best possible thirty seconds.',k:'PLAY',e:'L',i:3},
{c:'indiv',t:'Draw attention to the interesting one',n:['attn','evfeed'],d:'In a field of a thousand sprites nothing stands out. The individual that just did something — crossed a strait, founded a settlement, survived an extinction — should be quietly marked so the player’s eye is led to the place where the story is.',k:'PLAY',e:'M',i:3},
{c:'indiv',t:'A eulogy for one animal, not only for a clade',n:['evfeed'],d:'The next backlog asks for a eulogy when a lineage dies. The smaller version lands harder: the named animal the player watched for ten minutes, where it was born, how far it travelled, what killed it.',k:'PLAY',e:'S',i:3},
{c:'indiv',t:'Do not fake it',d:'Names attached to sprites that are re-rolled every two thousand years are a lie the player will eventually notice, and noticing it retroactively cheapens everything else. Either identity persists or nothing should be named — this is the one item here that is about restraint.',k:'PLAY',e:'S',i:3},
{c:'indiv',t:'Cap the emotional load deliberately',d:'A thousand named animals dying in an extinction is noise; one named animal dying is a scene. Deciding how many subjects the player is asked to care about at once is a design decision that should be made explicitly rather than falling out of `MAX_ENT`.',k:'PLAY',e:'S',i:2},

/* -------------------------------------------------------------- behav -- */
{c:'behav',t:'A behaviour state machine per individual',g:'behavcore',n:['being'],d:'The whole behavioural model is a four-neighbour score and a 0.4 movement probability. Even five states — rest, forage, travel, flee, tend — with transitions driven by the fields that already exist, would make the tile view legible as activity rather than as drift.',k:'SIM',e:'M',i:3},
{c:'behav',t:'Foraging that depletes and recovers',n:['behavcore'],d:'Herbivores eat `W.life[c]` and it never notices. A local grazing pressure that drops cover and regrows over time produces patch dynamics, movement with a reason, and the visible mark of a herd having been somewhere.',k:'SIM',e:'M',i:3},
{c:'behav',t:'Predation as an encounter, not a coefficient',n:['behavcore'],d:'`ecology.js` has trophic levels and `evolve.js` has a trophic trait. Nothing ever hunts anything. A pursuit, a kill, a carcass and scavengers is a chain of visible events, and it is the reason predator–prey oscillation is worth simulating at all.',k:'SIM',e:'M',i:3},
{c:'behav',t:'Nests, dens, burrows and territories',n:['behavcore','tracefield'],d:'Animals with a home have somewhere to return to, which turns wandering into commuting and produces the spatial structure — spacing, edges, contested boundaries — that makes a populated landscape look organised rather than sprinkled.',k:'SIM',e:'M',i:2},
{c:'behav',t:'Fix the flocking distance test',d:'The cohesion loop skips a neighbour when `Math.abs(o.cell - c) > 40 && dcell < NC - 40`. That is a comparison of array indices on a cube-sphere, so a flock can be spread across three faces and a genuine neighbour can be excluded. Use the dot product of `DIR` vectors, which is right there in the same loop.',k:'ENG',e:'S',i:3},
{c:'behav',t:'Flocking that is not O(n²)',d:'The cohesion branch loops over all `ENT.n` entities for each entity, breaking at eight matches — so with 1,400 entities and a rare kind it scans nearly two million pairs a tick. A per-cell bucket index makes it linear and makes real flocks affordable.',k:'ENG',e:'S',i:3},
{c:'behav',t:'Separation, not just cohesion',d:'The flock code steers toward the centroid with nothing pushing individuals apart, so groups collapse onto a point. Adding separation and alignment is the other two-thirds of a boid and it is what produces a shape that reads as a flock rather than a clump.',k:'PIC',e:'S',i:2},
{c:'behav',t:'Seasonal migration along the gradient',n:['behavcore'],d:'`W.season` drives the green wave in `nppField`. Animals following that wave poleward and back is the single most legible annual behaviour on Earth, it needs no new state, and it makes the seasonal cycle something you watch instead of something you infer from a sawtooth.',k:'SIM',e:'M',i:3},
{c:'behav',t:'Diel activity: who is out when',n:['dielfield','behavcore'],d:'Once a day phase exists, nocturnal, diurnal and crepuscular niches follow immediately — and a tile that empties at dusk and fills with different animals is one of the strongest possible signals that this is an ecosystem rather than a texture.',k:'SIM',e:'M',i:3},
{c:'behav',t:'Reactions to the weather',n:['behavcore'],d:'Sheltering from a storm, crowding to water in a drought, dispersing after rain. The climate fields are per-cell and available; behaviour that responds to them makes weather consequential at the scale the player can see.',k:'SIM',e:'M',i:3},
{c:'behav',t:'Fleeing the god',n:['behavcore'],d:'A meteor, a flood or a brush stroke lands and every animal in the region continues scoring its four neighbours. Panic, flight away from the event, and a slow return over minutes is the clearest possible feedback that the world is inhabited by things with interests.',k:'PLAY',e:'M',i:3},
{c:'behav',t:'Competition for the same cell',n:['behavcore'],d:'Two lineages with overlapping tolerances currently coexist by ignoring each other. Local exclusion — one displacing the other at a contested boundary — is how a range map becomes a map of pressure, and the trait vectors needed to arbitrate it already exist.',k:'SIM',e:'M',i:2},
{c:'behav',t:'Dispersal that is a journey with a failure rate',d:'When a cell dies, its occupant is teleported to a random cell with `life > 0.25`. Real dispersal is directed, slow and usually fatal, and modelling it that way makes islands, isthmuses and barriers matter — which is the entire point of biogeography.',k:'SIM',e:'M',i:3},
{c:'behav',t:'Trails worn by repeated movement',n:['tracefield'],d:'Animals following the same route between water and forage wear a visible path, and the path then attracts others. It is a positive feedback loop with a visible output and it is the cheapest way to make a landscape look used.',k:'PIC',e:'M',i:2},
{c:'behav',t:'Idle behaviour is the point',n:['behavcore'],d:'A world where every creature is always doing something purposeful reads as a machine. Standing still, looking around, grooming, false starts and doing nothing at all is what makes the purposeful behaviour read as behaviour.',k:'PIC',e:'S',i:3},
{c:'behav',t:'Plants have behaviour too',n:['preclock'],d:'Leaf-out, flowering, fruiting, senescence, drought closure and mast years are all behaviours on a plant’s own timescale. `nppField` already computes a phenology term and throws away everything except its effect on productivity.',k:'SIM',e:'M',i:2},
{c:'behav',t:'Microbial mats behave as well',d:'The redox guilds respond to light, to their electron donor and to each other. Mats that thicken, laminate, gas over, tear and are buried are the behaviour of the biosphere for its first two billion years — which on the current build is a static speckle.',k:'SIM',e:'M',i:2},
{c:'behav',t:'Settlers who react to their own history',d:'A settlement that failed here once should be less likely to be founded here again. `chronicle.js` records where things happened; using that record as an input to behaviour is what makes inhabitants seem to learn.',k:'SIM',e:'M',i:2},
{c:'behav',t:'Behaviour must be readable at tile scale',n:['spritegram'],d:'A state machine nobody can see is a waste of a tick. Every state needs a distinct pose or motion at the size the sprite is actually drawn, and the state should be nameable in the inspect panel so the player can learn the vocabulary.',k:'PIC',e:'M',i:3},
{c:'behav',t:'Behaviour on a seeded stream',d:'Behaviour will be the largest new consumer of random numbers in the codebase, and `agentsTick` already draws from `rngOf(W, "rngAgents")` while other paths still call `Math.random()`. Put behaviour on its own forked stream now, or the golden-run test dies the day this ships.',k:'ENG',e:'S',i:3},
{c:'behav',t:'Do not let behaviour contradict the ecology',d:'If the trophic model says a cell supports two hundred herbivores and the tile shows four, or the ecology says a lineage is extinct and an individual of it is still walking around, the player learns to distrust both. The behaviour layer must be a view of the population model, not a parallel one.',k:'ENG',e:'M',i:3},
{c:'behav',t:'One behaviour, done well, before twenty',d:'The temptation here is a large state machine that is illegible at six pixels. Ship grazing — depletion, movement, recovery, visible marks — end to end, at every rung, with sound, before adding a second behaviour.',k:'PLAY',e:'S',i:3},

/* ------------------------------------------------------------- chorus -- */
{c:'chorus',t:'A layered soundscape bus',g:'soundfield',d:'`audio.js` has one master gain, one hum, one noise buffer feeding three filters, and one HRTF panner used only for impacts. Everything below needs a real bus architecture — geophony, biophony, anthrophony and event layers, each with its own send, filtering and ducking. It is the single biggest missing system in the product measured by effect per line.',k:'ENG',e:'M',i:3},
{c:'chorus',t:'Give each biome a sound',n:['soundfield'],d:'Fifteen biomes and one lowpass-filtered noise bed whose cutoff is set by geological age. A rainforest, a tundra, a reef and a desert are among the most acoustically distinctive places on Earth, and the flat map already knows exactly which one the player is looking at.',k:'PLAY',e:'M',i:3},
{c:'chorus',t:'A dawn chorus',n:['soundfield','dielfield'],d:'The loudest hour of the biological day, and the one that most immediately communicates that a place is full of animals. It needs a day phase, a species list and nothing else, and it would be the most memorable thing in the build.',k:'PLAY',e:'M',i:3},
{c:'chorus',t:'Voices derived from the body plan',n:['soundfield','spritegram'],d:'Body mass sets the fundamental frequency of almost every animal call. `bodyPlanFromTraits` produces a size; using it to pitch a synthesised call means a planet of giant lowing things and a planet of tiny shrill things sound as different as they look, from the same data.',k:'PLAY',e:'M',i:3},
{c:'chorus',t:'Acoustic niche partitioning',n:['soundfield'],d:'Real soundscapes are frequency-partitioned between species because overlapping calls are wasted. Assigning each lineage a band and letting a crowded biosphere fill the spectrum turns species richness into something you can hear — a genuinely novel way to read a diversity curve.',k:'PLAY',e:'L',i:1},
{c:'chorus',t:'Silence as a state you notice',n:['soundfield'],d:'`audioUpdate` already scales everything by a `silence` factor for airless and snowball worlds. Extending that to extinction — the chorus thinning species by species, then stopping — is the most powerful thing sound can do in this product and it is nearly free once the layers exist.',k:'PLAY',e:'M',i:3},
{c:'chorus',t:'Weather you hear before you see',n:['soundfield'],d:'Wind rising, rain arriving, thunder at a distance whose delay reports how far away the storm is. The wind and precipitation fields are per-cell; the current implementation is one bandpass filter whose gain tracks `meanWind`.',k:'PLAY',e:'M',i:3},
{c:'chorus',t:'Position the sound where the thing is',n:['soundfield'],d:'The HRTF panner is hardcoded at `(0, 0.1, -0.55)` and only impacts use it. Everything with a location — an eruption, a settlement, a herd, a storm — should be pannable from the cell position, which is the difference between a soundtrack and a place.',k:'ENG',e:'M',i:3},
{c:'chorus',t:'Sound at every rung of the ladder',n:['soundfield','rungs'],d:'From orbit you hear the planet as a whole — a hum, a whole-biosphere texture. On the ground you hear individual animals a few metres away. The mix should crossfade with the scale gesture, which makes descending an audible event.',k:'PLAY',e:'M',i:3},
{c:'chorus',t:'The sound of the tile you are looking at',n:['soundfield'],d:'The flat map has a focus cell and a hover cell. Making the ambient bed follow the focus — so panning the map changes what you hear — welds the audio to the interface and gives the 2D view a dimension the globe does not have.',k:'PLAY',e:'M',i:3},
{c:'chorus',t:'Water, the loudest thing in most landscapes',n:['soundfield'],d:'Surf whose level comes from the wave height and the coastal fraction of the patch, a river whose sound comes from discharge and gradient, rain on a canopy versus rain on rock. `oceanGain` is currently one lowpass on `1 - landFrac`.',k:'PLAY',e:'M',i:2},
{c:'chorus',t:'Give geology a voice',n:['soundfield'],d:'`playEvent` handles eruption and quake with two oscillator tones. Infrasound before a large eruption, the long roll of a distant quake, ice groaning on a snowball, the ringing of a large impact — geology is the loudest thing a planet does and it currently sounds like a synthesiser.',k:'PLAY',e:'M',i:2},
{c:'chorus',t:'Human sound as a separate layer',n:['soundfield'],d:'Anthrophony is the third component of every soundscape-ecology model and it is the one that tells the player a civilisation has arrived. It should be audible before it is visible from orbit, and it should be the layer that displaces the others.',k:'PLAY',e:'M',i:2},
{c:'chorus',t:'Each god act has a weight you can hear',n:['soundfield'],d:'`playEvent` gives sculpt, raise and lower the same 110 Hz triangle at 0.35 s. The economy of miracles measures cost, restraint and power, and none of that reaches the ear. A cheap act should sound cheap and an irreversible one should sound expensive.',k:'PLAY',e:'M',i:3},
{c:'chorus',t:'Sound for the interface, in the same world',n:['soundfield'],d:'The dock is silent, so every click lands in a vacuum while the planet hums behind it. Interface sound that is made of the same materials as the world — filtered through the same reverb — is what stops the chrome from feeling bolted on.',k:'PLAY',e:'S',i:2},
{c:'chorus',t:'One reverb space per world',n:['soundfield'],d:'Ninety bars of CO₂ carries sound very differently from a thin Martian atmosphere, and vacuum carries none. A convolution or algorithmic space whose parameters come from surface pressure makes the catalogue audibly diverse from a single number that is already in `worldParams`.',k:'PLAY',e:'M',i:2},
{c:'chorus',t:'Duck, mix and never let it become mush',d:'Twenty layers with independent gains will turn into brown noise the first time a busy world is loaded. A real mix — priority, ducking, a limiter, a per-layer budget — is what makes the difference between a soundscape and a hiss.',k:'ENG',e:'M',i:3},
{c:'chorus',t:'Deterministic audio, seeded like everything else',d:'The noise buffer is already filled from a fixed seed, which is exactly right. Every generative layer added below must follow it, or two replays of the same seed will sound different and the audio will be the thing that breaks reproducibility.',k:'ENG',e:'S',i:2},
{c:'chorus',t:'A volume control and a mute that are easy to find',d:'The master gain is 0.22 in code with no interface. Anyone who plays this at a desk with other people needs one control, and anyone who plays it in a headset needs the balance between world and interface.',k:'PLAY',e:'S',i:3},
{c:'chorus',t:'Test it on the target hardware’s speakers',d:'A Quest’s open speakers reproduce almost nothing below 100 Hz, and the entire current design rests on a 55 Hz hum and a 42 Hz impact sub. The most-heard part of the audio may be inaudible on the device the product is aimed at.',k:'ENG',e:'S',i:3},

/* ----------------------------------------------------------------- wx -- */
{c:'wx',t:'Precipitation you can see falling',n:['tileframe','preclock'],d:'`W.precip[c]` drives NPP, erosion and the hydrological budget and is never drawn. Rain streaks over a tile, snow settling and accumulating into the ice field, and a dry tile that is visibly dry is the fastest-changing thing the model computes and the least visible.',k:'PIC',e:'M',i:3},
{c:'wx',t:'Wet ground after rain',n:['tracefield'],d:'A surface that darkens when wet and dries out over the following ticks is one of the cheapest and most convincing weather cues in any medium, and `moist[c]` is already a per-cell number with the right dynamics.',k:'PIC',e:'S',i:3},
{c:'wx',t:'Puddles, floods and standing water',n:['patchsim'],d:'The hydrology model fills depressions and routes runoff. On the flat map a flooded tile and a dry one differ by a slightly different green. Standing water in the low ground, spreading and draining, is how a flood becomes an event with a location.',k:'PIC',e:'M',i:2},
{c:'wx',t:'Draw the storm as an object on the tile',d:'Cyclones are tracked objects. At tile scale a storm should be a wall of rain with an edge, a wind direction, a spiral you can see the arms of if the patch is wide enough, and a passage that takes real seconds to arrive and leave.',k:'PIC',e:'M',i:3},
{c:'wx',t:'Lightning where the model says convection is',d:'Convective cells are identified for cloud formation and no flash is ever drawn. On the night side of a stormy tile, flashes clustered on the strongest convection is the most convincing single frame of weather this build could produce.',k:'PIC',e:'S',i:3},
{c:'wx',t:'Wind you can read without a vector overlay',d:'`windU` and `windV` reach the player as an arrow field in an overlay mode. Bent grass, streaming smoke, aligned dune crests, wave direction and drifting dust all report the same vector diegetically, which is the stated pillar of the whole interface design.',k:'PIC',e:'M',i:3},
{c:'wx',t:'Fog, mist and haze in the low ground',d:'Radiation fog in valleys at dawn, sea fog on a cold current, orographic cloud on a windward slope. Each is a specific combination of temperature, moisture and terrain that the model already resolves, and each is unmistakable when drawn.',k:'PIC',e:'M',i:2},
{c:'wx',t:'Frost, melt and the daily freeze line',n:['dielfield'],d:'The freeze–thaw boundary moves every day and every season, and it is the single most consequential line on a cold planet. At tile scale it is frost appearing overnight and burning off by mid-morning.',k:'PIC',e:'M',i:2},
{c:'wx',t:'A local forecast, in the world’s own terms',d:'The god layer has forecasts for interventions. A tile the player is watching should be able to say what the next few ticks hold — wetter, drier, colder — with an honest confidence, which is both a teaching device and a reason to keep watching.',k:'PLAY',e:'M',i:2},
{c:'wx',t:'Extremes that are events, not averages',d:'Every climate field is a mean. A heat wave, a cold snap, a downpour or a drought is a deviation with a duration and a footprint, and the biosphere responds to those far more than to the mean. Without variance, weather cannot be dramatic.',k:'SIM',e:'M',i:3},
{c:'wx',t:'Weather sounds like weather where you are',n:['soundfield'],d:'Wind speed, rain intensity and thunder distance all exist as numbers per cell. Binding them to the audio layers, positioned at the focus cell, means the player hears the storm coming across the patch before the tiles change.',k:'PLAY',e:'M',i:3},
{c:'wx',t:'Aftermath, not just the event',n:['tracefield'],d:'A storm passes and the tile returns to exactly what it was. Snapped canopy, scoured soil, a debris line at the flood’s high water mark, and a recovery that takes decades is what makes weather part of the world’s history rather than a visual effect.',k:'SIM',e:'M',i:3},
{c:'wx',t:'Seasonal weather, not perpetual conditions',d:'`W.season` modulates insolation and NPP. It should modulate storm frequency, precipitation pattern, wind strength and cloud type, so a place has a wet season and a dry one rather than one climate applied all year.',k:'SIM',e:'M',i:3},
{c:'wx',t:'Weather that differs across the patch',d:'A 25×25 patch is thousands of kilometres across and currently shows one weather state per tile with no coherence between them. Weather is spatially organised — fronts, bands, cells — and the patch is exactly wide enough for that organisation to be the thing you are looking at.',k:'SIM',e:'M',i:3},
{c:'wx',t:'Dust devils, squalls and small transient things',d:'Not every weather event needs to be a hemispheric dust storm. Small, brief, local phenomena are what make a landscape feel like it is being actively weathered rather than statically parameterised, and they are cheap because nothing depends on them.',k:'PIC',e:'S',i:1},
{c:'wx',t:'The tile’s microclimate',n:['patchsim'],d:'North-facing slopes hold snow, hollows trap cold air, coasts are moderated, cities are warmer. Sub-cell microclimate is why real landscapes are mosaics, and it makes the tile view show variation that the coarse grid cannot.',k:'SIM',e:'M',i:2},
{c:'wx',t:'Weather on the worlds that are not Earth',d:'Methane rain, sulphuric acid virga that evaporates before landing, CO₂ frost, glass shard winds. The catalogue has the worlds and the parameters; weather is where their strangeness would actually be witnessed rather than tabulated.',k:'PIC',e:'M',i:3},
{c:'wx',t:'Make the wind overlay a last resort',d:'Overlay modes exist for temp, moisture, ice, wind and more, and they are the current answer to every "how do I see this" question. Each one that becomes unnecessary because the world shows the field directly is a win for the diegetic pillar.',k:'PLAY',e:'S',i:2},
{c:'wx',t:'Never contradict the fields',d:'Rain drawn on a tile whose `precip` is zero, or a calm tile in a hurricane, destroys the player’s trust in every other reading. Weather presentation must be a pure function of the fields, and there should be a debug mode that proves it.',k:'ENG',e:'S',i:3},
{c:'wx',t:'Weather has to be affordable at 20 Hz',d:'Rain, cloud shadow, wind sway and lightning are all per-frame effects on a canvas that already redraws thousands of stamps. They need to share one animated noise source and one pass, not four independent ones.',k:'ENG',e:'M',i:2},

/* ------------------------------------------------------------- rhythm -- */
{c:'rhythm',t:'A day phase, as presentation state',g:'dielfield',n:['preclock'],d:'There is no day anywhere in the codebase — `grep` finds no `dayPhase`, no local time, nothing — because at 10 kyr per tick a day cannot be a simulation quantity. It can be a presentation quantity derived from the rotation period and the wall clock, and once it exists the terminator, the dawn chorus, city lights, diel behaviour, frost and dusk all become possible in one move.',k:'ENG',e:'S',i:3},
{c:'rhythm',t:'Sunrise and sunset as moments',n:['dielfield'],d:'The low sun is the most beautiful light a landscape gets and the interface currently has no notion of it. Warm long light across the tiles, long shadows, the terminator visibly moving — this is the payoff item for the day phase.',k:'PIC',e:'M',i:3},
{c:'rhythm',t:'Let the player watch one day pass',n:['dielfield'],d:'A mode where the sim clock holds and the day runs at a watchable rate. Everything the biosphere does on a daily cycle becomes visible, and it gives the fast end of the experience something real to be, rather than a faster geological clock.',k:'PLAY',e:'M',i:3},
{c:'rhythm',t:'The tide, breathing',d:'`tides.js` exists and the tides backlog opens by pointing out that `setMoon` issues a receipt reading "tides resume" and nothing does. On the flat map a coastal tile with a real tidal range should visibly wet and dry, twice a day, forever. It is the most reliable rhythm a coast has.',k:'PIC',e:'M',i:3},
{c:'rhythm',t:'Make the seasonal cycle visible on the tile',d:'`nppField` computes a phenology term and applies it to productivity. The same term should drive leaf colour, canopy density, snow cover and animal presence, so that watching one tile through a year is watching four different places.',k:'PIC',e:'M',i:3},
{c:'rhythm',t:'A year that the interface counts',d:'The clock reads years and kyr per tick. Nothing marks the passing of a single year, which is the unit every rhythm above is measured in and the one a human actually understands.',k:'PLAY',e:'S',i:2},
{c:'rhythm',t:'Nest the clocks and show them together',n:['preclock','dielfield'],d:'Day inside season inside year inside the geological tick. A single compact display that shows where the world is in all four at once is the honest answer to a model whose timescales span fourteen orders of magnitude.',k:'PLAY',e:'M',i:3},
{c:'rhythm',t:'Multi-year cycles that are not forced',d:'An ENSO-like oscillation gives a climate variability without a cause, which is the clearest possible demonstration that a system can be restless on its own. It also gives the decade scale — currently empty — something to contain.',k:'SIM',e:'L',i:2},
{c:'rhythm',t:'Boom and bust in the populations',d:'Predator–prey oscillation exists in the backlog and not in the build. A herd that grows for a century and crashes is a rhythm at exactly the timescale between weather and geology, which is the scale with nothing in it today.',k:'SIM',e:'M',i:3},
{c:'rhythm',t:'Let the moon move in the sky',d:'The Sky panel has moon mass and distance levers. A moon that visibly rises, sets, phases and eclipses is the most legible clock a planet has, and on the catalogue’s multi-moon systems it would be spectacular.',k:'PIC',e:'M',i:2},
{c:'rhythm',t:'Rhythm in the sound, not just the picture',n:['soundfield','dielfield'],d:'Dawn, midday quiet, dusk chorus, night. A soundscape that cycles is how a player knows time is passing without looking at a clock, and it works even when they are not looking at the screen at all.',k:'PLAY',e:'M',i:3},
{c:'rhythm',t:'Do not let the fast clocks lie',d:'A day that runs at a watchable rate while the sim advances 10 kyr per tick means the day cycle is a fiction laid over deep time. Say so, in the interface, once — because the alternative is a player concluding the model is wrong when it is being honest.',k:'PLAY',e:'S',i:3},
{c:'rhythm',t:'Make the ICS ribbon a rhythm, not a bar',d:'The deep-time strip shows Hadean through Phanerozoic as a coloured gradient with a marker. Eras have characteristic lengths and the ribbon could show the acceleration of events toward the present, which is the actual shape of planetary history.',k:'PLAY',e:'M',i:1},
{c:'rhythm',t:'Anniversaries and returns',n:['evfeed'],d:'"A thousand years since the reef bleached." "The ice has come back for the fourth time." Recognising recurrence is what turns a log of events into a sense of history, and `chronicle.js` has every date needed.',k:'PLAY',e:'M',i:2},
{c:'rhythm',t:'Let the player set the tempo, and see what it costs',d:'The tick rate control changes 10 kyr/tick. Fast rates skip everything human; slow rates make geology invisible. Show the trade explicitly — what you can see at this tempo and what you cannot — so choosing a speed is a decision rather than a setting.',k:'PLAY',e:'M',i:3},
{c:'rhythm',t:'Pause should be a held breath',d:'`Pause` stops the world. With a presentation clock the paused world can still be alive — wind, water, light, small movement — which reads as the player having stopped time rather than having stopped the program.',k:'PLAY',e:'S',i:3},
{c:'rhythm',t:'Milankovitch as something you feel',d:'Eccentricity, obliquity and precession give glacial cycles a 100 kyr rhythm that is exactly at the current tick scale — one tick per ten cycles. Making it perceptible may mean rendering the cycle rather than only simulating it.',k:'SIM',e:'M',i:2},
{c:'rhythm',t:'Sync the animation phases to something shared',n:['preclock'],d:'Independent per-stamp phases produce visual noise; entirely shared phases produce a pulsing screensaver. Loose coupling — a per-cell phase offset plus a global driver — is how real chorus behaviour looks, from crickets to leaf flutter.',k:'PIC',e:'S',i:2},
{c:'rhythm',t:'The rhythm survives a save',d:'The presentation clock, the day phase and the animation phases all need to be in the save, or reloading a world drops the player into a different moment of the day and the illusion of continuity breaks at exactly the point it matters most.',k:'ENG',e:'S',i:2},
{c:'rhythm',t:'Give the world a resting heartbeat',d:'Under everything above, one very slow global cycle — the hum shifting, the light drifting, the bed thickening and thinning — so that even a dead planet is doing something. `playEraDrone` is the beginning of this and it moves only when the eon changes.',k:'PLAY',e:'S',i:2},

/* -------------------------------------------------------------- trace -- */
{c:'trace',t:'A persistent trace field',g:'tracefield',d:'Every field in the model is current state. Add one thin layer that only accumulates — trampling, burning, clearing, wear, disturbance age — decaying far more slowly than anything else. It is the substrate for every item in this category and it is one `Float32Array`.',k:'SIM',e:'M',i:3},
{c:'trace',t:'Ruins where settlements failed',n:['tracefield'],d:'`agentsTick` decays `W.build[c]` by 0.004 per tick when life falls away, and the settlement simply ceases to exist. Abandoned structures, then rubble, then a mound under the vegetation, is how a landscape carries its own failures — and it is the strongest possible argument the world can make about consequence.',k:'PIC',e:'M',i:3},
{c:'trace',t:'Cleared ground that stays cleared',n:['tracefield'],d:'Land that has been farmed or logged does not return to primary forest for centuries, and the difference is visible from the air. Secondary growth as a distinct visual state is both ecologically true and the clearest possible record of where people have been.',k:'PIC',e:'M',i:2},
{c:'trace',t:'Field boundaries under the forest',n:['tracefield'],d:'Old walls, terraces and lynchets survive millennia of regrowth and are the reason aerial archaeology works. A faint geometric pattern persisting long after the settlement is gone is an extraordinarily cheap way to make a landscape feel ancient.',k:'PIC',e:'M',i:1},
{c:'trace',t:'The scar of a god act, left behind',n:['tracefield'],d:'The receipts system records every intervention with a cell and a date. The land does not. A crater rim softening over ten million years, a raised ridge that erodes into hills, a burn line that greens over — attribution written into the terrain rather than into a log.',k:'PLAY',e:'M',i:3},
{c:'trace',t:'Wear where things have moved',n:['tracefield'],d:'Game trails, migration routes, roads, ruts, the bare ground around a water hole. Movement that leaves a mark is what distinguishes a landscape animals live in from one animals are drawn on.',k:'PIC',e:'M',i:2},
{c:'trace',t:'Driftwood, bones, shells and litter',d:'Real ground is covered in the remains of what used to be alive. Deadfall in a forest, bone accumulations at a kill site, shell beds on a beach, a strandline of wrack at the high tide mark — small, static, and enormously convincing.',k:'PIC',e:'S',i:2},
{c:'trace',t:'Stratigraphy visible where the land is cut',d:'The core sampler reads real deposited layers and the same layers should be exposed in a river cliff, a coastal scarp or a fault face. It is the moment the geological bookkeeping becomes scenery, and the flat map is where a player would notice it.',k:'PIC',e:'M',i:3},
{c:'trace',t:'Erosion that visibly progresses',d:'The stream power law runs and the resulting elevation change reaches the player as a slowly different colour. A gully that lengthens, a cliff that retreats, a delta that grows outward over a visible number of ticks is the erosion model’s own proof of work.',k:'PIC',e:'M',i:2},
{c:'trace',t:'Let the trace field feed back into the model',n:['tracefield'],d:'A worn trail is easier to walk, so more things use it. Compacted ground sheds water, so it floods. Cleared land is more erodible. A history layer that only affects the picture is decoration; one that affects behaviour and hydrology is a memory.',k:'SIM',e:'M',i:3},
{c:'trace',t:'Fossils in the ground where the animal actually died',n:['being'],d:'`recordFossil` in `meta.js` logs lineages that die in depositing cells. Tying it to the individual’s last position means a core sample can return an animal the player watched, which is the single most affecting thing this model could do with its own data.',k:'PLAY',e:'M',i:3},
{c:'trace',t:'The tile remembers what it used to be',n:['tracefield'],d:'Relict species in a refugium, drought-adapted plants left over from a drier era, a peat layer under a grassland. A cell whose state disagrees slightly with its current climate because of its history is how real ecosystems reveal their age.',k:'SIM',e:'M',i:2},
{c:'trace',t:'Show the tile’s own history on demand',n:['evfeed'],d:'`whatHappenedHere` exists and finds events by index arithmetic. Fixed to use real distance, and rendered as a small local timeline in the inspect panel, it turns any tile into a place with a past — and gives the chronicle a reason to be kept.',k:'PLAY',e:'M',i:3},
{c:'trace',t:'A before-and-after for any tile',d:'The player who floods a valley should be able to see what it looked like before. Keeping a small ring buffer of tile snapshots at coarse intervals makes that possible, and it is the most direct possible presentation of consequence.',k:'PLAY',e:'M',i:3},
{c:'trace',t:'Let the marks be readable as a sequence',n:['tracefield'],d:'A landscape with ten overlapping traces is only meaningful if the player can tell which came first. Age-dependent softening, colour and coherence are how real palimpsests are read, and they need to be designed rather than layered arbitrarily.',k:'PIC',e:'M',i:2},
{c:'trace',t:'Do not let the world become uniformly scarred',d:'A trace field that only accumulates ends with every cell at maximum wear after a billion years, and the information content goes to zero. Every trace needs a decay whose timescale is stated, and the field needs an assertion that its distribution stays informative.',k:'ENG',e:'S',i:3},
{c:'trace',t:'Traces have to reach both views',n:['tileframe'],d:'A crater that is visible on the flat map and absent from the globe is worse than one that is on neither, because it teaches the player that the two views cannot be trusted against each other. Anything in the trace field belongs in the shared cell description.',k:'ENG',e:'S',i:2},
{c:'trace',t:'Save the traces, and version them',d:'The trace field is the world’s memory and `serializeRun` writes an untagged object into `localStorage`. A shelf world that loads without its history is a world whose whole claim to being lived in has been thrown away by a schema change.',k:'ENG',e:'S',i:2},
{c:'trace',t:'Traces are the material for the ending',n:['evfeed'],d:'Whatever the finale turns out to be, the most affecting version of it is a tour of the marks left on the planet — the crater, the ruins, the burn scar, the drowned coast — each with its date and its cause. The trace field is what makes that possible.',k:'PLAY',e:'M',i:3},
{c:'trace',t:'One trace, end to end, first',d:'Fire is the right first trace: fast enough to watch, ecologically real, visible at every rung, audible, consequential for carbon, and it recovers on a timescale the player experiences. Build the whole chain for fire before generalising the field.',k:'PLAY',e:'M',i:3},

/* --------------------------------------------------------------- news -- */
{c:'news',t:'A structured, spatial event feed',g:'evfeed',d:'`logEvent` records `{t, kind, cell, mag, label}` and 4,000 of them accumulate before the array is spliced. There is no severity, no subject, no duration, no relation to other events and no geographic index. Everything below needs the record to be queryable by place, by importance and by what it was about.',k:'ENG',e:'M',i:3},
{c:'news',t:'Fix whatHappenedHere',d:'`Math.abs(e.cell - cell) < radiusCells * 10` treats cell indices as positions, so it returns events from a random scatter of the planet and misses the ones next door. Use the neighbour tables or the `DIR` dot product — this function is the entry point to the entire historical record and it does not work.',k:'ENG',e:'S',i:3},
{c:'news',t:'Tell the player about the thing they would care about',n:['evfeed'],d:'Every event is currently equal, so nothing is surfaced. A ranking — by magnitude, by whether it touches something the player has named, seeded or looked at, and by novelty — is what turns a log into news.',k:'PLAY',e:'M',i:3},
{c:'news',t:'Take the player there',n:['attn','evfeed'],d:'A notification that names a cell and cannot move the view to it is a dead end. One click that flies the flat map and the globe rim to where it happened is what makes the feed a way of exploring the world rather than reading about it.',k:'PLAY',e:'S',i:3},
{c:'news',t:'Firsts, announced properly',d:'`meta.js` records `moments` — first life, first land, first oxygen. They land in an exported markdown file. The first time anything crawls onto land on this planet deserves a held moment, a sound and a location, not a log line.',k:'PLAY',e:'M',i:3},
{c:'news',t:'Say what caused it',d:'`logEvent` accepts a `meta.cause` string and almost nothing passes one; `whyDidThisHappen` finds preceding events by matching on `kind`, which is a guess rather than a causal chain. Recording the actual mechanism at the point of the event is cheap and it is the difference between narration and explanation.',k:'SIM',e:'M',i:3},
{c:'news',t:'Group related events into episodes',n:['evfeed'],d:'An impact, an ash injection, a temperature excursion, a mass extinction and a recovery are five log lines and one story. Episode grouping is what makes the chronicle readable at a glance and what the finale would be built out of.',k:'SIM',e:'M',i:3},
{c:'news',t:'A running ticker that is not a debug log',d:'The world is producing events continuously and the player sees none of them unless they open a panel. A quiet, slow ticker — one line at a time, dismissible, never modal — is how a player learns that things are happening while they are not looking.',k:'PLAY',e:'M',i:3},
{c:'news',t:'Do not interrupt for anything small',d:'The failure mode of every feed like this is a stream of toasts that trains the player to ignore it. Interruption should be reserved for the handful of events that genuinely change the world, and the threshold should be tunable.',k:'PLAY',e:'S',i:3},
{c:'news',t:'Written by someone who was there',d:'`civChronicleMarkdown` already exists. Once a civilisation can observe, its account of an event — wrong, mythologised, self-centred — is worth far more than an accurate one, and the contrast between the two records is the most interesting thing the narrative layer can do.',k:'PLAY',e:'M',i:3},
{c:'news',t:'The record of your own acts, in the same feed',d:'Receipts live in the god layer and events live in the chronicle, so the player’s interventions and the world’s history are two separate documents. Interleaved, they become the actual story of the planet, which is what the whole god layer has been arguing for.',k:'PLAY',e:'M',i:3},
{c:'news',t:'Silence is news too',d:'Nothing happening for a hundred million years is a genuine finding about a planet, and the current design has no way to say it. Noting the absence — the longest quiet interval, the era with no events — is what makes the busy parts read as busy.',k:'PLAY',e:'S',i:2},
{c:'news',t:'A map of the record',n:['evfeed'],d:'Every event has a cell. Plotting them on the globe as a density — impacts here, extinctions there, all the volcanism along one arc — turns four thousand log lines into a picture of the planet’s history, which no instrument currently produces.',k:'PLAY',e:'M',i:2},
{c:'news',t:'Stop losing the early history',d:'`MAX_EVENTS` is 4,000 and the array is spliced from the front, so on a long run the Hadean and Archean are silently deleted while the last few million years are kept in full. Downsample by era instead, keeping the significant events forever.',k:'ENG',e:'S',i:3},
{c:'news',t:'Make the era names earn their place',d:'`maybeNameEra` names an era from a state transition or falls back to the ICS period. The names are the coarsest summary of the planet’s history the player will ever see and they deserve to be specific — what defined this era here, not which chart interval it fell in.',k:'PLAY',e:'M',i:1},
{c:'news',t:'A single sentence about the state of the world',d:'The HUD reports numbers. One generated sentence — cooling, drying, recovering, running away — read from the same state, is what a person actually wants when they come back after making a cup of tea.',k:'PLAY',e:'M',i:3},
{c:'news',t:'Let the player ask what is happening right now',d:'The inverse of the feed: a query that gathers the most active places on the planet and offers to take you to them. It is a tour of your own world, generated from the record, and it is the answer to "there is nothing to do".',k:'PLAY',e:'M',i:3},
{c:'news',t:'The events an instrument shows should be clickable',d:'`viz.js` draws Sepkoski curves and extinction tables from the same record. Every spike on every chart is an event with a cell and a date, and clicking it should take you there — the charts become navigation, which is what the next backlog asked for and the record already supports.',k:'PLAY',e:'M',i:2},
{c:'news',t:'Keep the tone dry',d:'The world is producing genuinely dramatic material and the temptation is to write it up dramatically. Understatement is what makes a log entry about the end of ninety per cent of life land, and it is consistent with the stated rule about not assigning moral weight.',k:'PLAY',e:'S',i:3},
{c:'news',t:'Test the feed against a long run',d:'A headless four-billion-year run should produce a feed a person can read in ten minutes and come away knowing what kind of planet this was. If it does not, the ranking is wrong, and that is measurable rather than a matter of taste.',k:'ENG',e:'M',i:2},

/* --------------------------------------------------------- instrument -- */
{c:'instrument',t:'Round the numbers to the model’s honesty',d:'The status strip reads `CELL 16417 LIFE reptile BIOME desert`, and elsewhere numbers appear at two and three decimals from fields whose constants are admittedly fitted or invented. Displayed precision is a claim about accuracy, and it is a claim this model should not be making.',k:'PLAY',e:'S',i:3},
{c:'instrument',t:'Say it in words before numbers',d:'`life 0.42` means nothing to anyone who has not read `ecology.js`. "Patchy scrub, drying" is the same information, correct at the model’s real precision, and legible in the first second rather than the first hour.',k:'PLAY',e:'M',i:3},
{c:'instrument',t:'Make the legend live',d:'The legend strip lists categories present in the patch and supports hover dimming. Showing each entry’s share of the patch, and letting it change as the world changes, turns the legend into the composition readout for the place you are looking at.',k:'PLAY',e:'S',i:3},
{c:'instrument',t:'Let the numbers move with a rate, not a value',d:'Every readout is an instantaneous value. A small trend indicator — rising, falling, how fast — is the difference between a gauge and an instrument, and it is what tells a player whether to act now or wait.',k:'PLAY',e:'M',i:3},
{c:'instrument',t:'Instruments that respond to being watched',d:'A needle that settles, a chart that draws in, a readout that flickers when the underlying field is noisy. Instruments in the world should behave like objects, which is both the stated diegetic pillar and the reason people find real instruments satisfying.',k:'PLAY',e:'M',i:2},
{c:'instrument',t:'Put the instruments in the world, not in a dock',d:'Twenty-seven tools and ten instruments live in HTML panels floating over a 3D planet. The product is named for a table with worlds and instruments on it. Every panel moved onto that table stops being a website over a game.',k:'PLAY',e:'L',i:3},
{c:'instrument',t:'One thing at a time in the first minute',d:'A new player is shown a tool palette of eleven verbs, six tabs, a deep-time ribbon, a legend, a status line and a pixel map. Progressive disclosure is not a nicety here — it is the difference between the simulation being experienced and being bounced off.',k:'PLAY',e:'M',i:3},
{c:'instrument',t:'Every name in the interface can explain itself',d:'`glossary.js` exists. Every field name in the interface should be able to say what it is, how it is computed, and how confident the model is — which turns the interface into the teaching layer instead of needing a separate one.',k:'PLAY',e:'M',i:3},
{c:'instrument',t:'Show the model’s own uncertainty',d:'`briefs/model-limits.md` is honest and unreachable from the product. A confidence mark beside any number whose constant is fitted or invented is the smallest possible version of publishing the limits inside the interface, and it is the most credible thing a toy-fidelity instrument can do.',k:'PLAY',e:'M',i:3},
{c:'instrument',t:'A cursor that reports what it will do',d:'Tools are selected in a palette and applied with a right-click. The cursor over the planet should show the brush footprint, the affected cells and the expected cost before the act, so intention and consequence are connected at the point of action.',k:'PLAY',e:'M',i:3},
{c:'instrument',t:'Let the chrome know what the world is doing',d:'The panels are the same colour on a snowball as in a runaway greenhouse. Tinting the interface with the planet’s own light, or letting a catastrophe visibly disturb the chrome, is a small thing that makes the interface part of the same object.',k:'PIC',e:'S',i:2},
{c:'instrument',t:'Keep the map’s status strip to one idea',d:'`FOCUS pinned CELL 16417 LIFE reptile BIOME desert VIEW 25×25` is six facts in one line of monospace, all at the same weight. One primary reading, with the rest available on demand, is what makes a status line glanceable.',k:'PLAY',e:'S',i:2},
{c:'instrument',t:'Distinguish measurement from simulation',d:'A transit spectrum is what an observer would see; a temperature field is what the model believes. Presenting them identically implies the model is data. Marking which readings are synthetic observations is central to the scientific-instrument face of the product.',k:'PLAY',e:'M',i:2},
{c:'instrument',t:'A comparison that is always available',d:'Every number is meaningless without a reference. `earthRecord.js` holds modern Earth values; showing them beside the current world by default makes every reading immediately interpretable, on all 120 catalogue worlds.',k:'PLAY',e:'S',i:3},
{c:'instrument',t:'Make the overlays diegetic or make them modal',d:'Overlay modes recolour the planet with abstract data and sit halfway between the world and a chart. Either present them as an instrument the player picks up and looks through, or make it unmistakable that the world is being suppressed to show data.',k:'PLAY',e:'M',i:2},
{c:'instrument',t:'Give the panels a resting state',d:'The dock is always fully open with everything visible. A resting state that shows the world and three readings, expanding on demand, is what lets the planet be the thing on screen — which is the entire argument of the visual design.',k:'PLAY',e:'S',i:3},
{c:'instrument',t:'Keyboard and gamepad, all the way through',d:'The flat map is driven by drag accumulation and segmented buttons. A player who wants to sit back and watch their planet cannot, and the long-look mode this backlog keeps asking for needs an input method that does not require aiming.',k:'PLAY',e:'M',i:2},
{c:'instrument',t:'Accessibility of the colour language',d:'The entire map, legend and overlay system is colour-encoded, including the guild highlight which dims non-matching cells to 35 per cent. Redundant encoding — shape, texture, pattern — is both an accessibility requirement and a legibility improvement for everyone.',k:'PLAY',e:'M',i:3},
{c:'instrument',t:'Never lie for legibility without saying so',d:'Some things must be exaggerated to be seen at all — relief is already scaled by `W.rule.relief`, and sub-cell detail is invented from hashes. Each exaggeration should be discoverable, because the difference between a teaching tool and a misleading one is whether it admits its own scale factors.',k:'PLAY',e:'S',i:3},
{c:'instrument',t:'Watch somebody use it and change nothing else that day',d:'Eight backlogs, seventeen thousand lines and no recorded session of a person who did not write it trying to use it. Every item in this category is a guess until then, and the guesses are cheap to test.',k:'PLAY',e:'S',i:3},

/* -------------------------------------------------------------- touch -- */
{c:'touch',t:'The world knows where you are looking',g:'attn',d:'`S.inspect`, `S.localPin`, `S.localHoverCell` and `S._localFocus` are four independent pieces of attention state used only for drawing. One attention model — what the player has selected, is hovering, has pinned, has named and is following — read by the sim, the views, the audio and the feed, is what lets the world respond to being watched.',k:'ENG',e:'M',i:3},
{c:'touch',t:'Disturb the world where the hand goes in',n:['behavcore'],d:'A brush stroke changes fields and nothing reacts. Animals scattering from the point of contact, birds lifting off the canopy, dust raised and settling over the following seconds — the disturbance and its settling are what make the touch feel like it landed on something living.',k:'PLAY',e:'M',i:3},
{c:'touch',t:'A settling period after every act',d:'The god layer commits an act and the next tick proceeds as though nothing happened. A short, visible relaxation — the world absorbing the shock, the sound returning, the animals coming back — is the beat that makes an intervention feel consequential rather than administrative.',k:'PLAY',e:'M',i:3},
{c:'touch',t:'Weight and resistance in the sculpt gesture',d:'Raising crust and thinning it feel identical: a click and a field edit. Resistance that varies with crustal thickness, a gesture that takes time to complete, and a release that settles is how a tool communicates that it is moving something massive.',k:'PLAY',e:'M',i:3},
{c:'touch',t:'Haptics tied to the material',d:'The XR controllers have haptics and the code does not use them. Rock, water, ice and canopy under the brush should each feel different, and a large act should be felt in the hands before it is seen on the planet.',k:'PLAY',e:'S',i:2},
{c:'touch',t:'Read the hand skeleton that is already requested',d:'`hand-tracking` is requested as an optional WebXR feature and `handIk.js` exists, and the skeleton is never read. Reaching into a planet with your own fingers, and having the world respond at the fingertip, is the reason this is an XR product.',k:'PLAY',e:'L',i:3},
{c:'touch',t:'Let the player hold still and be present',d:'Every interaction is an act. A mode with no tool selected, where holding the planet and looking is the whole activity, is what the observe verbs gesture at and the interface does not support — and it is where aliveness is actually experienced.',k:'PLAY',e:'M',i:3},
{c:'touch',t:'The planet should feel like it has mass',d:'Left-drag spins the globe. Inertia, a damped stop, a slight wobble, and a resistance proportional to the world’s actual mass from `worldParams` would make holding a super-Earth different from holding a moon, which is free realism from data already loaded.',k:'PLAY',e:'S',i:3},
{c:'touch',t:'Breath and proximity',d:'Bringing your face close to the planet in a headset should do something — the view resolving, the sound coming up, the tile detail sharpening. Proximity is the most natural zoom control that exists and it needs no input device at all.',k:'PLAY',e:'M',i:2},
{c:'touch',t:'The inhabitants notice the hand, not just the outcome',d:'`notice.js` gives the civilisation awareness of the player and a prayer queue. What it lacks is the local, immediate reaction — the moment a hand comes through the sky above one valley, and the people in that valley respond before the theology does.',k:'PLAY',e:'M',i:3},
{c:'touch',t:'Let something refuse to be moved',d:'Every brush stroke succeeds. A world that occasionally resists — crust too thick, a lineage that will not take, a settlement that will not be founded where you want it — is a world with its own character rather than a canvas.',k:'PLAY',e:'M',i:2},
{c:'touch',t:'A cost the player feels physically',d:'The thermodynamic economy computes `thermoCost` and displays it. Making an expensive act slower, heavier and louder means the economy is felt through the gesture rather than read off a counter, which is what makes scarcity land.',k:'PLAY',e:'M',i:3},
{c:'touch',t:'Undo that is a reversal, not a state restore',d:'Undo-the-act exists and snaps the world back. Watching the crater fill in, the water recede, the ash lift — a visible rewind over a second or two — is both clearer and considerably more powerful as an expression of the player’s position relative to this world.',k:'PLAY',e:'M',i:2},
{c:'touch',t:'The instrument you hold should be an object',d:'Tools are palette buttons. In XR they should be things picked up off the orrery table, with a shape that indicates what they do and a place they get put back. It solves the twenty-seven-tools problem spatially instead of with more tabs.',k:'PLAY',e:'L',i:2},
{c:'touch',t:'Do not startle the player',d:'Sudden loud impacts and hard visual flashes are unpleasant in a headset and actively harmful for some players. Every dramatic beat needs a ramp, and the disaster palette — which is the acquisition channel — is exactly where this will be got wrong.',k:'PLAY',e:'S',i:3},
{c:'touch',t:'Latency budget for the gesture, separately from the frame',d:'`rebuildGeometry` fires on any sculpt and regenerates the whole cube-sphere. Direct manipulation lives or dies on the delay between the hand moving and the world responding, and that number is currently unmeasured and coupled to the most expensive function in the codebase.',k:'ENG',e:'M',i:3},
{c:'touch',t:'Presence at the tile scale, in 2D',d:'The flat map is a canvas element and the mouse is a cursor. Even in two dimensions presence is possible — a shadow of the hand over the tiles, the stamps reacting to the cursor’s passage, a click that lands with weight. The 2D half of the metaphor should not be the inert half.',k:'PLAY',e:'M',i:3},
{c:'touch',t:'Leave the world alone sometimes and see if it holds up',d:'Every item in this category makes the world respond to the player. The test of aliveness is the opposite: put the controller down for five minutes and see whether anything on screen makes you want to pick it back up.',k:'PLAY',e:'S',i:3},

/* --------------------------------------------------------------- pace -- */
{c:'pace',t:'Decide what the player watches when nothing is happening',d:'At 10 kyr per tick, geology is quiet for the overwhelming majority of any session and the fast systems are invisible. This is the central pacing problem of the product and it has never been stated as one, which is why the answer keeps being "another instrument".',k:'PLAY',e:'S',i:3},
{c:'pace',t:'A watchable mode where the clock is slow on purpose',n:['dielfield'],d:'Not paused and not fast: a tempo at which the day passes, weather crosses the patch, animals move and the geology is effectively still. It is a different product mode from deep time and it is the one that shows off everything in this backlog.',k:'PLAY',e:'M',i:3},
{c:'pace',t:'Let the player follow one place for a long time',n:['attn'],d:'The most affecting way to experience four billion years is to watch a single valley through all of it. Pin a place, let time run, and the same tile becomes seabed, reef, desert, forest and city. Nothing in the build supports this and almost everything needed for it exists.',k:'PLAY',e:'M',i:3},
{c:'pace',t:'Time-lapse one tile',n:['preclock'],d:'The inverse of the long look: compress ten million years of one tile into twenty seconds. It is the clearest possible demonstration that the model is doing something, and it makes an artefact a player would show somebody else.',k:'PLAY',e:'M',i:3},
{c:'pace',t:'Vary the tick rate with what is happening',d:'`adaptiveTickYears` already scales the clock by geological age. Slowing automatically when something interesting begins — an extinction, a bloom, a first — and speeding through the quiet is the pacing tool the model is already half-way to having.',k:'SIM',e:'M',i:3},
{c:'pace',t:'Interesting things should be findable, not stumbled on',n:['evfeed','attn'],d:'A planet is 24,576 cells and the player sees 625 of them at a time. Without a way to be led to where something is happening, most of what the simulation produces is never witnessed by anyone.',k:'PLAY',e:'M',i:3},
{c:'pace',t:'Do not fill the quiet with notifications',d:'The obvious fix for a slow middle is to interrupt more, and it is the wrong one. The quiet should be filled with things worth looking at — weather, animals, light, sound — not with things demanding to be read.',k:'PLAY',e:'S',i:3},
{c:'pace',t:'Give the session a shape',d:'A run currently begins in the Holocene and continues until the player stops. A first ten minutes with something to find, a middle with something to tend, and an end that arrives is the difference between a toy and an experience — and the ending is on the next backlog and still unbuilt.',k:'PLAY',e:'M',i:3},
{c:'pace',t:'Let it run while nobody is watching',d:'Let-it-run exists in the god tab. Coming back to a planet that has advanced fifty million years and being told what happened while you were away is a genuinely distinctive pleasure and it is nearly free given the chronicle.',k:'PLAY',e:'S',i:3},
{c:'pace',t:'An idle attract mode that is the actual product',d:'A world left alone should be worth looking at — the camera drifting slowly, the terminator crossing, the sound cycling. It doubles as the demo, the screensaver and the proof that aliveness does not require the player to do anything.',k:'PLAY',e:'M',i:2},
{c:'pace',t:'Reward returning to a place',n:['tracefield'],d:'A tile the player pinned a hundred million years ago and comes back to should be recognisably the same place and obviously changed. That requires persistent traces and stable identity, and it is the strongest emotional mechanic available in a deep-time simulation.',k:'PLAY',e:'M',i:3},
{c:'pace',t:'Anticipation before the event',d:'An eruption with a precursor, a bloom with a lag, an ice advance with a first cold century. Being able to see something coming is what converts a passive viewer into someone leaning forward, and the model produces the precursors already.',k:'SIM',e:'M',i:3},
{c:'pace',t:'Consequences on human timescales, sometimes',d:'Nearly every feedback in the model resolves over millions of years, which is honest and unwatchable. Identifying the handful that resolve in decades — a bloom, a bleaching, a fire, a settlement — and making them the visible ones is a legibility decision, not a fidelity compromise.',k:'PLAY',e:'M',i:3},
{c:'pace',t:'Let the player look away safely',d:'A simulation that punishes inattention teaches people to stare at it. Nothing irreversible should happen while the player is reading an instrument, and if something is about to, the world should say so first.',k:'PLAY',e:'S',i:2},
{c:'pace',t:'Sessions should end somewhere worth stopping',d:'There is no natural pause point in four and a half billion years. Era boundaries, firsts and state transitions are all natural rest points that already exist in the code and are never used as such.',k:'PLAY',e:'M',i:2},
{c:'pace',t:'Boredom is data',d:'The moment a tester’s attention drifts is the most valuable single measurement available for this backlog, and it costs one stopwatch. Log it, and every aliveness item can be prioritised against something real.',k:'PLAY',e:'S',i:3},
{c:'pace',t:'The long look must not cost more than the short one',n:['mapcache'],d:'A player who watches one tile for ten minutes is running the flat map’s full draw path at sixty frames a second for thirty-six thousand frames to observe a handful of state changes. The dirty-rect and cadence work is what makes the product’s most contemplative mode also its cheapest.',k:'ENG',e:'M',i:2},
{c:'pace',t:'Write down what a good ten minutes looks like',d:'Before any of the above: one paragraph describing minute by minute what a player should see, hear and feel in their first ten minutes. Every pacing item then has something to be measured against, and the answer stops depending on who is asked.',k:'PLAY',e:'S',i:3},

/* -------------------------------------------------------------- craft -- */
{c:'craft',t:'Sixteen sprites cannot carry a biosphere',g:'spritegram',d:'`SPRITES` in `sprites.js` is sixteen hand-authored Path2D entries in a 4×4 atlas, shared by the globe billboards and the flat map, and `kindForCell` picks between them with thresholds on `life`, `moist`, `ice` and elevation. A parameterised grammar — driven by the trait vector that `morphology.js` already produces — is the precondition for organisms that look like the ones in the model.',k:'PIC',e:'L',i:3},
{c:'craft',t:'Write down what aliveness means here',d:'Nine backlogs and no definition. The working one this list uses is: the impression that the world was already doing this before you looked and will continue after you stop. Committing to a definition is what makes the property reviewable instead of a matter of taste.',k:'PLAY',e:'S',i:3},
{c:'craft',t:'A ten-second test, run on every build',d:'Open the build, watch for ten seconds, count the number of independent things that visibly change. Today the answer is close to zero. It is a crude metric and it would have caught the still-life problem years earlier than a code review did.',k:'ENG',e:'S',i:3},
{c:'craft',t:'Budget aliveness explicitly, so it survives optimisation',d:'Every item in this backlog costs frame time on a build that already drops ticks under a 12 ms guard. Without a named, defended budget for motion, sound and detail, the first performance pass will delete all of it and the reason will be lost.',k:'ENG',e:'S',i:3},
{c:'craft',t:'Golden-image tests for the flat map',d:'The 2D map is a canvas, which means it can be hashed. A seeded world at a fixed year should produce a fixed image, and that test would protect the most carefully built visual surface in the project from silent regression.',k:'ENG',e:'M',i:3},
{c:'craft',t:'Make the presentation clock deterministic too',n:['preclock'],d:'The obvious implementation reaches for `performance.now()`, which makes every animated thing unreproducible and breaks the golden run. Derive it from the tick count plus a seeded phase, so that the same seed produces the same motion.',k:'ENG',e:'S',i:3},
{c:'craft',t:'Profile the flat map before optimising it',d:'The BFS rebuild, the CSS colour string round-trip through `parseRGB`, the full-planet `pickFocusCell` scan and the stamp passes are all suspects and none of them have been measured. One afternoon with a profiler could redirect a third of this backlog.',k:'ENG',e:'S',i:3},
{c:'craft',t:'Stop round-tripping colours through strings',d:'`cellColor` builds `rgb(...)` strings, `parseRGB` parses them back with a regex, and the guild highlight path parses the same string three times in one expression. For 3,249 cells a frame that is thousands of allocations and regex matches per frame in the hot path.',k:'ENG',e:'S',i:2},
{c:'craft',t:'One tick, one moment, everywhere',d:'The globe interpolates colours at `simAlpha`, the flat map does not interpolate at all, and entities are written on tick boundaries. Until every view agrees on what instant it is depicting, the two-view metaphor will have a subtle wrongness nobody can name.',k:'ENG',e:'M',i:3},
{c:'craft',t:'Measure it on the Quest, not on the laptop',d:'The product is aimed at standalone XR and nothing in the repository records the frame time on that device. Aliveness is the most frame-time-hungry category of work in the project and it is being designed against unknown hardware limits.',k:'ENG',e:'S',i:3},
{c:'craft',t:'Beware the uncanny middle',d:'Half-animated things read worse than static ones — a tree that sways while the animal beside it teleports is more obviously fake than a still image. Aliveness has to land per scene, not per feature, which is an argument for shipping one complete vertical slice at a time.',k:'PIC',e:'S',i:3},
{c:'craft',t:'Do not let aliveness become noise',d:'The failure mode of this entire backlog is a screen where everything moves, everything makes a sound and nothing can be read. Every item added should be checked against whether the player can still see the thing they were looking at.',k:'PIC',e:'S',i:3},
{c:'craft',t:'Keep it honest: no motion without a cause in the model',d:'It would be easy to animate grass, waves and animals with pure noise and no reference to the fields. That is the one thing this project should not do, because the whole argument of `PURPOSE.md` is that mechanism beats cosmetic spectacle — and animation driven by real fields is more interesting anyway.',k:'ENG',e:'S',i:3},
{c:'craft',t:'Name the reference works and study them properly',d:'The tile view is doing something specific — oblique pixel-art tiles reporting a simulation — and the traditions that solved it are decades old, from Dwarf Fortress through Rimworld through Ultima. A page of noted solutions would be worth more than several of the items above.',k:'PLAY',e:'S',i:2},
{c:'craft',t:'Aliveness has to survive the headless path',d:'`headless.mjs` and the golden run use the CPU climate path and no rendering at all. Every new system here must be presentation-only or fully deterministic, or the test harness that protects the whole codebase becomes unmaintainable.',k:'ENG',e:'S',i:2},
{c:'craft',t:'Ship the two-day version first',n:['preclock','mapcache'],d:'Cache the patch topology, add a presentation clock, put it into the existing sub-cell hashes, and sway the canopy with the wind field. Four changes, no new systems, and the flat map moves for the first time. If that does not visibly transform the product, most of the remaining 296 items need rethinking.',k:'ENG',e:'S',i:3},

/* == APPEND == */
];

D.forEach((x, i) => { x.id = i + 1; });

const byCat = (id) => D.filter((x) => x.c === id);
const count = (f) => D.filter(f).length;
const KIND = { PIC: 'Picture', SIM: 'World', PLAY: 'Feel', ENG: 'Engine' };

const provides = new Map();
for (const x of D) if (x.g) provides.set(x.g, x);
const dependents = (tok) => D.filter((y) => (y.n || []).includes(tok)).length;
const CRITICAL = [...provides.keys()]
  .map((k) => ({ k, x: provides.get(k), n: dependents(k) }))
  .filter((r) => r.n > 0)
  .sort((a, b) => b.n - a.n);

const NOW = [
  ['The flat map costs like an animation and reads like a photograph', '`drawLocalView` is called from the render loop. Every frame it rebuilds `unwrapPatch` — a BFS over a `Map` with string keys, using `q.shift()`, up to 3,249 cells — scans all 24,576 cells in `pickFocusCell`, builds CSS colour strings in `cellColor` and re-parses them in `parseRGB`, and stamps thousands of sprites. Then it draws the identical image it drew last frame, because every stamp position comes from `hash2(c, 0x11fe)` and that hash has no time term.'],
  ['Nothing on screen is ever mid-anything', 'Movement is `m.cell = best` — a discrete jump of roughly 250 km. Growth is a threshold on `W.life[c]`. A settlement appears at `build > 0.12` and vanishes below it. There is no interpolation, no easing, no in-between state and no animation clock anywhere in the codebase. A living world is almost entirely made of things that are part-way through happening.'],
  ['Individuals are destroyed several times a minute', '`respawnEntities()` fires whenever `W.lifeGrown > 80` or `W.year % 2000 < 250` and overwrites all 1,400 `ENT.meta` slots. Names from `nameFrom`, `born: W.year`, accumulated `age` and the derived `plan` are all discarded. `followTarget()` exists, returns a named individual, and nothing in the renderer follows it.'],
  ['Behaviour is one line of arithmetic', 'An entity scores four neighbours on `life + moist*0.3 - ice*0.5`, moves with probability 0.4, and that is the complete repertoire. The flocking branch compares `Math.abs(o.cell - c) > 40` — index distance on a cube-sphere, which is not a distance. Nothing feeds, rests, hunts, nests, migrates, competes or fails.'],
  ['The world is heard through three gain nodes', '`audio.js` has one 55 Hz sine hum, one two-second noise buffer split into bed, wind and ocean, and seven event branches. Only impacts are spatialised, at a fixed point 0.55 units in front of the listener. No biome has a sound. No animal makes one. Nothing is quieter at night.'],
  ['The record exists and cannot be read', '`chronicle.js` holds 4,000 events with cells, magnitudes and labels, plus named eras and firsts. `whatHappenedHere` retrieves nearby events with `Math.abs(e.cell - cell) < radiusCells * 10`, which is arithmetic on array indices rather than geography. The planet has a history and the interface has a status strip.'],
  ['Fifteen biomes share three textures', '`BIOMES` lists fifteen entries. `paintCellDetail` branches on desert, boreal and tundra; everything else takes one generic case. Reef, vent, upwelling, gyre, savanna, tropical seasonal and both rainforests are drawn identically, on the one surface in the product where the difference would be visible.'],
];

const SEQ = [
  ['Give it a clock and stop redrawing the same frame', 'One presentation clock decoupled from the 10 kyr sim tick, a cached patch topology, and a time term in every sub-cell hash. This is a day or two of work, it makes the flat map move for the first time, and it frees the budget everything else needs. Nothing in this backlog is worth starting before it.'],
  ['Then let individuals survive', 'Persistent beings with identity across respawns, real positions between cells, and a behaviour state machine to be in. The gap between "1,400 sprites re-rolled twice a minute" and "a population of animals that are somewhere doing something" is the largest single aliveness win available.'],
  ['Then make the two views one instrument', 'A shared description of a cell, shared materials, shared light, a framed window instead of a wire square, and a continuous zoom between them. This is the part that is specific to this product rather than to god games in general.'],
  ['Then sound, weather and rhythm', 'A layered soundscape, weather that is witnessed at the tile rather than read off a gauge, and a day that exists. These are the three systems that a player reads as "this place is happening" without being able to say why.'],
  ['Then the record and the long look', 'Traces that persist, news that finds the player, and something worth watching during the ninety-nine per cent of deep time when the geology is quiet. This is what makes a session end with a story instead of a save file.'],
];

/* ------------------------------------------------------------ markdown -- */
function markdown() {
  const L = [];
  L.push('# ORRERY — alive');
  L.push('');
  L.push(`**${D.length} items.** Generated from \`scripts/living.mjs\` — edit that file, not this one, then run \`node scripts/living.mjs\`.`);
  L.push('');
  L.push('The ninth backlog, and the only one that is not about being right. The eight before it made the model correct, the worlds real, the biosphere deep, the geology honest and the god layer meaningful. This one is about a different property: whether the thing on screen reads as **a place where things are happening** rather than a state vector being integrated correctly.');
  L.push('');
  L.push('It is written around the product’s own metaphor — **a 3D planet you hold and a 2D pixel map of one patch of it, at the same time** — because that pairing is where aliveness either lands or does not.');
  L.push('');
  L.push(`Kind: **${count((x) => x.k === 'PIC')}** picture, **${count((x) => x.k === 'SIM')}** world, **${count((x) => x.k === 'PLAY')}** feel, **${count((x) => x.k === 'ENG')}** engine. Effort is S/M/L. Impact is 1–3.`);
  L.push('');

  L.push('## Where it actually is');
  L.push('');
  for (const [a, b] of NOW) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## The critical path');
  L.push('');
  L.push('The capabilities the largest number of other items are waiting on.');
  L.push('');
  L.push('| Capability | Item | Unblocks |');
  L.push('|---|---|---|');
  for (const r of CRITICAL.slice(0, 12)) {
    L.push(`| \`${r.k}\` | ${r.x.id}. ${r.x.t} | ${r.n} items |`);
  }
  L.push('');

  for (const [id, name, blurb] of CATS) {
    const items = byCat(id);
    L.push(`## ${name} — ${items.length}`);
    L.push('');
    L.push(`_${blurb}_`);
    L.push('');
    L.push('| # | Item | Detail | Kind | Effort | Impact |');
    L.push('|---|---|---|---|---|---|');
    for (const x of items) {
      const gives = x.g ? ` <br>gives \`${x.g}\`` : '';
      const needs = x.n?.length ? ` <br>needs ${x.n.map((t) => '`' + t + '`').join(' ')}` : '';
      L.push(`| ${x.id} | **${x.t}**${gives}${needs} | ${x.d} | ${KIND[x.k]} | ${x.e} | ${x.i} |`);
    }
    L.push('');
  }

  L.push('## Sequencing');
  L.push('');
  L.push('Five blocks, in order. The first is small enough to do this week and everything else depends on it.');
  L.push('');
  SEQ.forEach(([a, b], i) => L.push(`${i + 1}. **${a}.** ${b}`));
  L.push('');
  L.push('One rule holds the whole list together: **aliveness is not accuracy, and it is not spectacle.** It is the impression that the world was already doing this before you looked and will carry on after you stop. Every item here is judged against that and nothing else.');
  L.push('');

  return L.join('\n');
}

/* ----------------------------------------------------------------- html -- */
function html() {
  const data = JSON.stringify(D.map((x) => ({
    id: x.id, c: x.c, t: x.t, d: x.d, k: x.k, e: x.e, i: x.i, g: x.g || '', n: x.n || [],
  })));
  const cats = JSON.stringify(CATS.map(([id, name, blurb]) => ({ id, name, blurb })));
  const crit = JSON.stringify(CRITICAL.slice(0, 12).map((r) => ({ k: r.k, id: r.x.id, t: r.x.t, n: r.n })));
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ORRERY — alive</title>
<style>
:root{
  --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#7fd4a8; --accent-soft:rgba(127,212,168,.13); --accent-line:rgba(127,212,168,.34);
  --pic:#e0a050; --pic-soft:rgba(224,160,80,.14);
  --eng:#7fb0e0; --eng-soft:rgba(127,176,224,.14);
  --wld:#8fce7a; --wld-soft:rgba(143,206,122,.14);
  --ply:#d792d0; --ply-soft:rgba(215,146,208,.14);
  --sans:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
}
@media (prefers-color-scheme: light){
  :root{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
    --text:#12151c; --dim:#4e5768; --faint:#727d90;
    --accent:#1a7350; --accent-soft:rgba(26,115,80,.09); --accent-line:rgba(26,115,80,.3);
    --pic:#9a5f14; --pic-soft:rgba(154,95,20,.09); --eng:#215e93; --eng-soft:rgba(33,94,147,.09);
    --wld:#3d7a2c; --wld-soft:rgba(61,122,44,.09); --ply:#8a3480; --ply-soft:rgba(138,52,128,.09); }
}
:root[data-theme="dark"]{ --ground:#0c0f16; --panel:#151a24; --panel2:#1b2231; --rule:#252d3d;
  --text:#dbe1ec; --dim:#98a3b7; --faint:#6c7688;
  --accent:#7fd4a8; --accent-soft:rgba(127,212,168,.13); --accent-line:rgba(127,212,168,.34);
  --pic:#e0a050; --pic-soft:rgba(224,160,80,.14); --eng:#7fb0e0; --eng-soft:rgba(127,176,224,.14);
  --wld:#8fce7a; --wld-soft:rgba(143,206,122,.14); --ply:#d792d0; --ply-soft:rgba(215,146,208,.14); }
:root[data-theme="light"]{ --ground:#eef0f3; --panel:#fff; --panel2:#f5f6f9; --rule:#d9dde5;
  --text:#12151c; --dim:#4e5768; --faint:#727d90;
  --accent:#1a7350; --accent-soft:rgba(26,115,80,.09); --accent-line:rgba(26,115,80,.3);
  --pic:#9a5f14; --pic-soft:rgba(154,95,20,.09); --eng:#215e93; --eng-soft:rgba(33,94,147,.09);
  --wld:#3d7a2c; --wld-soft:rgba(61,122,44,.09); --ply:#8a3480; --ply-soft:rgba(138,52,128,.09); }

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
button.f.pic[aria-pressed="true"]{background:var(--pic-soft); border-color:var(--pic); color:var(--pic);}
button.f.eng[aria-pressed="true"]{background:var(--eng-soft); border-color:var(--eng); color:var(--eng);}
button.f.wld[aria-pressed="true"]{background:var(--wld-soft); border-color:var(--wld); color:var(--wld);}
button.f.ply[aria-pressed="true"]{background:var(--ply-soft); border-color:var(--ply); color:var(--ply);}
#q{flex:1; min-width:170px; font:400 13px/1 var(--sans); color:var(--text);
   background:var(--panel); border:1px solid var(--rule); border-radius:5px; padding:8px 11px;}
#q::placeholder{color:var(--faint);}
.tally2{margin-top:11px; font:500 11px/1 var(--mono); color:var(--faint); font-variant-numeric:tabular-nums;}

section{padding-top:38px; scroll-margin-top:120px;}
.sechead{display:flex; align-items:baseline; gap:10px; border-bottom:1px solid var(--rule);
         padding-bottom:9px;}
.sechead h2{font:650 20px/1.25 var(--sans); letter-spacing:-.022em; margin:0;}
.sechead .n{font:500 11px/1 var(--mono); color:var(--faint);}
.blurb{color:var(--dim); font:italic 400 14.5px/1.6 var(--serif); margin:12px 0 0; max-width:78ch;}
section ol{list-style:none; margin:16px 0 0; padding:0; display:flex; flex-direction:column; gap:1px;
           background:var(--rule); border:1px solid var(--rule); border-radius:8px; overflow:hidden;}
.item{background:var(--panel); padding:13px 16px; display:grid;
      grid-template-columns:34px 1fr auto; gap:4px 12px; align-items:baseline;}
.item:hover{background:var(--panel2);}
.item .id{font:500 11px/1.7 var(--mono); color:var(--faint); font-variant-numeric:tabular-nums;}
.item .t{font:600 14.5px/1.45 var(--sans); letter-spacing:-.01em;}
.item .tags{display:flex; gap:5px; align-items:center; white-space:nowrap;}
.tag{font:500 9.5px/1 var(--mono); letter-spacing:.09em; text-transform:uppercase;
     border:1px solid var(--rule); border-radius:3px; padding:4px 5px; color:var(--faint);}
.tag.pic{color:var(--pic); border-color:var(--pic); background:var(--pic-soft);}
.tag.eng{color:var(--eng); border-color:var(--eng); background:var(--eng-soft);}
.tag.wld{color:var(--wld); border-color:var(--wld); background:var(--wld-soft);}
.tag.ply{color:var(--ply); border-color:var(--ply); background:var(--ply-soft);}
.dots{display:inline-flex; gap:2px;}
.dots i{width:5px; height:5px; border-radius:50%; background:var(--rule);}
.dots i.on{background:var(--accent);}
.item .d{grid-column:2/4; color:var(--dim); font-size:13.5px; line-height:1.62; max-width:82ch;}
.item .dep{grid-column:2/4; font:500 10.5px/1.6 var(--mono); color:var(--faint);}
.item .dep .gives{color:var(--accent);}
.empty{color:var(--faint); font:italic 400 15px/1.6 var(--serif); padding:44px 0;}

footer{margin-top:70px; padding-top:22px; border-top:1px solid var(--rule);
       font:400 11.5px/1.8 var(--mono); color:var(--faint);}
@media (max-width:640px){
  .item{grid-template-columns:26px 1fr;}
  .item .tags{grid-column:2; margin-top:5px;}
  .item .d, .item .dep{grid-column:1/3;}
}
@media (prefers-reduced-motion: reduce){ *{transition:none !important;} }
</style>
<link rel="stylesheet" href="doc-responsive.css">

<div class="wrap">
<header>
  <div class="eyebrow">Backlog nine · aliveness</div>
  <h1>Alive</h1>
  <p class="sub">Eight backlogs made the model correct. This one asks a different question:
  does it read as a place where things are happening — a planet you hold, and a patch of it
  you can see the grass moving on.</p>
  <p class="nav"><a href="./">Pitch</a> · <a href="backlog.html">Systems</a> ·
  <a href="worlds.html">Worlds</a> · <a href="evolution.html">Evolution</a> ·
  <a href="godgame.html">God layer</a> · <a href="next.html">The next 200</a> ·
  <a href="tides-weather.html">Tides &amp; weather</a> · <a href="geology.html">Geology</a> ·
  <a href="exoparams.html">Real parameters</a> · <a href="currents.html">Currents</a> ·
  <a href="realism.html">Realism</a> · <a href="../vr/">Prototype</a></p>
  <dl class="tally">
    <div><dt>Items</dt><dd>${D.length}<small>${CATS.length} categories</small></dd></div>
    <div><dt>Kind</dt><dd>${count((x) => x.k === 'PIC')}/${count((x) => x.k === 'SIM')}/${count((x) => x.k === 'PLAY')}/${count((x) => x.k === 'ENG')}<small>pic · world · feel · eng</small></dd></div>
    <div><dt>Impact 3</dt><dd>${count((x) => x.i === 3)}<small>of ${D.length}</small></dd></div>
    <div><dt>Effort</dt><dd>${count((x) => x.e === 'S')}/${count((x) => x.e === 'M')}/${count((x) => x.e === 'L')}<small>S / M / L</small></dd></div>
  </dl>
</header>

<div class="prose">
  <h2>Where it actually is</h2>
  <ul class="state" id="now"></ul>

  <h2 style="margin-top:40px">The critical path</h2>
  <p>The capabilities the largest number of other items wait on.</p>
  <table class="crit"><tbody id="crit"></tbody></table>
</div>

<div class="controls">
  <div class="filters">
    <span class="flabel">Kind</span>
    <button class="f pic" data-k="k" data-v="PIC" aria-pressed="false">Picture</button>
    <button class="f wld" data-k="k" data-v="SIM" aria-pressed="false">World</button>
    <button class="f ply" data-k="k" data-v="PLAY" aria-pressed="false">Feel</button>
    <button class="f eng" data-k="k" data-v="ENG" aria-pressed="false">Engine</button>
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
  <p>Five blocks, in order. The first is small enough to do this week and everything else depends on it.</p>
  <ol class="seq" id="seq"></ol>
  <p style="margin-top:16px">One rule holds the whole list together: <b>aliveness is not accuracy,
  and it is not spectacle.</b> It is the impression that the world was already doing this before you
  looked and will carry on after you stop. Every item here is judged against that and nothing else.</p>
</div>

<footer>
  Generated from <code>scripts/living.mjs</code> — edit the source and re-run, do not edit the output.<br>
  SimEarth is a trademark of Electronic Arts; WorldBox of Maxim Karpenko. Referenced as prior art only.
</footer>
</div>

<script>
"use strict";
var DATA = ${data};
var CATS = ${cats};
var CRIT = ${crit};
var NOW = ${JSON.stringify(NOW)};
var SEQ = ${JSON.stringify(SEQ)};
var KLABEL = {PIC:'Picture', SIM:'World', PLAY:'Feel', ENG:'Engine'};
var active = {k:new Set(), e:new Set(), i:new Set()};
var query = '';
var listEl = document.getElementById('list');
var shownEl = document.getElementById('shown');

function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

document.getElementById('now').innerHTML = NOW.map(function(r){
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

function clsFor(k){
  return k === 'PIC' ? 'pic' : k === 'ENG' ? 'eng' : k === 'SIM' ? 'wld' : 'ply';
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
      var cls = clsFor(o.k);
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
await writeFile(join(ROOT, 'briefs', 'living-backlog.md'), markdown() + '\n');
await writeFile(join(ROOT, 'site', 'living.html'), html());

console.log(`living: ${D.length} items across ${CATS.length} categories`);
for (const [id, name] of CATS) console.log(`  ${String(byCat(id).length).padStart(3)}  ${name}`);
console.log(`\nkind     pic ${count((x) => x.k === 'PIC')} · world ${count((x) => x.k === 'SIM')} · feel ${count((x) => x.k === 'PLAY')} · eng ${count((x) => x.k === 'ENG')}`);
console.log(`effort   S ${count((x) => x.e === 'S')} · M ${count((x) => x.e === 'M')} · L ${count((x) => x.e === 'L')}`);
console.log(`impact   3 ${count((x) => x.i === 3)} · 2 ${count((x) => x.i === 2)} · 1 ${count((x) => x.i === 1)}`);
console.log('\ncritical path:');
for (const r of CRITICAL.slice(0, 12)) {
  console.log(`  ${String(r.n).padStart(3)}  ${r.k.padEnd(11)} ${r.x.t}`);
}
const unmet = new Set();
for (const x of D) for (const t of x.n || []) if (!provides.has(t)) unmet.add(t);
if (unmet.size) console.log(`\nWARNING unmet tokens: ${[...unmet].join(', ')}`);
const dupes = new Set();
const seen = new Set();
for (const x of D) { if (seen.has(x.t)) dupes.add(x.t); seen.add(x.t); }
if (dupes.size) console.log(`\nWARNING duplicate titles: ${[...dupes].join(' | ')}`);
console.log('\nwrote briefs/living-backlog.md and site/living.html');
