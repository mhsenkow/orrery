#!/usr/bin/env node
// Single source of truth for the ORRERY open-world backlog.
// Emits  briefs/openworld-backlog.md  and  site/openworld.html.
//
//   node scripts/openworld.mjs
//
// 400 items on the machinery that keeps the palette open: world definitions as
// authored data, a material layer stack, palettes with provenance, an artefact
// detector that looks at pixels, and per-world art direction as a unit.
//
// Written by auditing the shipped data layer against the code it was meant to
// replace. Appearance (PAINT, stamps, ice-shell maps) is now data; kind
// selection is still a regex. `node scripts/data.mjs` prints the scoreboard.
//
// k:  MODEL = what the simulation computes
//     DRAW  = what reaches the screen
//     PROVE = the measurement, data or test that keeps it honest
// e:  effort S/M/L.  i: impact 1..3.
// g:  capability token this item provides.  n: tokens it needs first.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = [
  ['wdata', 'The data layer replaced the per-body appearance functions',
    'PAINT, stamps and ice-shell maps are authored JSON with compilers and fixtures. Named kinds are `kindRules.json`. `node scripts/data.mjs` prints `dataratio` and `newworldcost` (named-kind regexes left in `planetKind`).'],
  ['wschema', 'What a world definition would have to say',
    'A definition is not a list of properties, it is a contract: which axes place this world, which substrate mixture its surface is, which processes run and at what rates, which landforms those processes can make, which cover accumulates, what the column looks like, what it is lit by, and how confident we are about each of those. Today the first six exist in five separate files with no object tying them to a world, and the last two do not exist at all.'],
  ['wcompile', 'Compilers, validation and the build',
    'Five compilers exist — `substrates.mjs`, `cover.mjs`, `processes` and `landforms` via `landgram.mjs`, `columns.mjs` — on the pattern `lifegrammar.mjs` proved, and they validate cross-references. What is missing is the thing that makes a data layer trustworthy: one build that runs them all, fails on a broken reference, and refuses to ship a world whose definition is incomplete.'],
  ['wauthor', 'Adding Pluto should be a JSON file and a review',
    'Named kinds are `kindRules.json`. Paint, stamps and ice-shell maps are data. `newworldcost` is leftover name-regexes in `planetKind`.'],
  ['stack', 'The surface is one byte deep',
    '`W.substrate` is a `Uint8Array` — one index per cell into the material table, the top material and nothing else. `W.rock` is a second `Uint8Array` with eight Earth rock types. `columnAt` builds a stack on demand from **one recipe per world** cached in `W._columnRecipe`, so every cell on a planet has the same layer sequence with per-cell depths. There is no per-cell stack anywhere, which means nothing can bury anything, expose anything, or accumulate.'],
  ['strat', 'A stack is a history, or it is a texture',
    'The point of layers is not that a surface is made of several things — it is that the order records what happened and in what sequence. Sediment over lava over impact melt is a story. The column recipe cannot hold a story because it is a property of the world, not of the cell, and it is recomputed rather than accumulated.'],
  ['stackops', 'The verbs a stack needs',
    'Erode takes from the top. Deposit adds to the top. Intrude inserts. Melt removes and re-adds elsewhere. Weather transforms in place. Compact reduces thickness. Every geomorphic process in `processes.json` is one of these six operations on a column, and none of the six exists because the column is not a field.'],
  ['stackperf', 'What a stack costs',
    'At N=96 there are 55,296 cells. A fixed eight-layer stack of one material byte and one depth float is 40 bytes a cell — 2.2 MB, which is nothing. A variable-length stack with a real history is a different shape and a different problem. `N_ALLOWED` reaches 768, where the same structure is 142 MB. The design has to state which it is before it is written.'],
  ['ramp', 'A colour is one triple with no light in it',
    '`substrates.json` gives each of 24 materials an `rgb` triple, an `albedo` and a `tag`. That is more honest than what it replaced and it is still a single colour: no ramp against depth, wetness, grain size, age or angle, and no dependence on what is illuminating it. Meanwhile **154 hardcoded triples remain in code** — 76 in `lifeColour.js`, 67 in `planetLook.js`, 11 in `render.js`.'],
  ['spectra', 'Where a colour comes from, and how sure we are',
    '`substrates.json` and `cover.json` carry 35 provenance tags between them, which is the right discipline. But a tag on a hand-picked triple says only that somebody was honest about guessing. The materials that have published reflectance spectra — basalt, water ice, sulfur, tholin, hematite, olivine — could carry the spectrum and derive the triple, and then the tag would mean something stronger.'],
  ['light', 'The same rock under a different sun',
    'A surface colour is a reflectance spectrum multiplied by an illuminant. `EOREF` holds a shelf of Earth stills; `planetLook.js` returns display-referred bytes from `lerp` constants tuned under a G star. On a 2,560 K dwarf the same basalt is a different colour, and the life pass already computes exactly this integral for eyes and never for surfaces.'],
  ['palops', 'Tooling for a palette that is data',
    'Once ramps are data they can be previewed, diffed, swapped, checked for contrast and shipped per world. None of that tooling exists, and without it a data palette is a JSON file nobody can evaluate — which is worse than a lambda somebody can at least read next to the thing it paints.'],
  ['pixel', 'There is no pixel in the test suite',
    '`pictureStats` is good work and it measures **fields** — height, temperature, precipitation, life, moisture. It never renders anything. `readPixels`, `toDataURL` and any headless GL context appear nowhere in `vr/sim/test.mjs`. `capture-site.mjs` drives Playwright and screenshots four site pages, not worlds. So the realism backlog\'s central finding — that the picture has never been measured — is still true; what has been measured is the data behind the picture.'],
  ['metrics', 'What to count once there are pixels',
    'Axis-aligned edge runs, a contour-step histogram, per-face discontinuity across all twelve cube edges, palette entropy, luminance histogram, dominant hue, limb profile, and the perceptual distance between two worlds. Each targets a named fault from the surface and worldspace passes, and each is a number that should move in a stated direction.'],
  ['fleet', 'One world is measured; there are a hundred and twenty',
    '`pictureStats(Wcont)` runs on a single continental test world inside one test block, with 14 assertions on it. The catalogue has 120 bodies across seven categories. A detector that samples 0.8% of the catalogue cannot see the class of fault this whole programme is about — the one where 40 worlds looked like Io and nobody noticed for months.'],
  ['guard', 'A measurement nobody looks at is not a guard',
    'The numbers exist and one world asserts eight of them. What is missing is the loop: committed baselines, a budget per metric, a diff on every change, and a failure that names which world got worse. Without it the artefact detector is a script somebody ran once, which is what the realism backlog warned about.'],
  ['direction', 'Art direction is two lambdas',
    '`applyPlanetLook(rule)` sets exactly two fields: `rule.land` and `rule.ocean`. That is the whole of a world\'s art direction. Lighting, exposure, atmosphere, sky colour, limb, haze layering, detail grammar, sound, named features and the camera that introduces it are decided elsewhere, by code that does not know which world it is drawing, or not decided at all.'],
  ['look', 'Light, air and the edge of the disc',
    'Mercury at 6.7 solar constants and Pluto at 0.001 are drawn with the same exposure curve. A hard limb means airless, a soft blue one means thin, a layered orange one means Titan — and the limb is one of the two edges the realism pass identified as surviving a thumbnail. None of that is per-world today.'],
  ['place', 'A world with no names is a texture',
    'Sputnik Planitia, Caloris, Valles Marineris, the tiger stripes, the Great Red Spot. Every Solar System body has named features that are the reason anyone recognises it, and `W._plateNames` names plates while nothing names a landform. Sound is Earth\'s everywhere. A place is a name, a sound and a thing worth flying to.'],
  ['curate', 'Somebody has to look at all of them',
    'One hundred and twenty worlds, and no view that shows more than one. The contact sheet has been asked for in two previous passes and does not exist. Art direction is not a per-world decision made 120 times in isolation; it is a set of decisions made against each other, which requires seeing them together.'],
];

const P1 = [
/* --------------------------------------------------------------- wdata -- */
{c:'wdata',t:'Count what is data and what is code, and print it',g:'dataratio',d:'Landed. `node scripts/data.mjs` prints authored rows against remaining per-body functions (`land*`/`stamp*`/`paint*`). The migration scoreboard, not a feeling.',k:'PROVE',e:'S',i:3},
{c:'wdata',t:'A world object that ties the five files together',g:'worldrec',d:'`substrates.json`, `cover.json`, `processes.json`, `landforms.json` and `columns.json` are five parallel tables with no record joining them to a world. A world definition is the join: which materials, which processes at which rates, which landforms, which cover, which column. Without it the data describes a vocabulary and never a sentence.',k:'MODEL',e:'L',i:3},
{c:'wdata',t:'Retire the PAINT table into data',g:'paintdata',n:['worldrec'],d:'Landed. Thirty kinds live in `paint.json`, compile through `paint.mjs`, and run in `paintEval.js`. `planetLook.js` binds ramps. Earth / Daisyworld / temperate generic keep Whittaker.',k:'DRAW',e:'L',i:3},
{c:'wdata',t:'Retire the stamps into the landform grammar',n:['worldrec'],d:'Landed. Rocky hypsometry is `stamps.json` ops in `stampApply.js`. Ice-shell maps are fill/add/set of masks (bowl, cycloid, ridged pit, south stripe) in `shellApply.js`, not `opEuropa`. Fixtures stay the validation cases. A genuinely new primitive still needs an interpreter op.',k:'MODEL',e:'L',i:3},
{c:'wdata',t:'`kinds.json` is an audit table, not a definition',d:'It is 27 KB listing all 120 bodies with their resolved kind and the term that decided it, regenerated by `scripts/worldspace.mjs`, and it is exactly the right artefact — it is what keeps the 40-Io result from returning. It is not a world definition and the README should say which of the six files is which.',k:'PROVE',e:'S',i:2},
{c:'wdata',t:'Provenance on the join, not just on the rows',n:['worldrec'],d:'Basalt is measured. That Mars\'s surface is basalt-plus-dust is an inference. That a given exoplanet is basalt at all is a guess. Tagging the material and not the assignment launders the guess.',k:'PROVE',e:'M',i:3},
{c:'wdata',t:'Which worlds have a complete definition',n:['worldrec','dataratio'],d:'A coverage report per body: axes computed, substrate assigned, processes selected, landforms available, cover model, column recipe, palette, art direction. Most bodies will show gaps and the gaps are the work list.',k:'PROVE',e:'M',i:3},
{c:'wdata',t:'The data should be able to say "unknown"',d:'For 94 exoplanets almost every field is an extrapolation. A schema that requires a value forces a fabrication; one that admits absence lets the renderer draw something deliberately provisional, which the worldspace pass argued for and nothing implements.',k:'MODEL',e:'M',i:3},
{c:'wdata',t:'Version the data',d:'`lifeGrammar.js` carries a `GRAMMAR_VERSION`. The world tables do not. A save that references material 17 needs to know which table that was.',k:'MODEL',e:'S',i:2},
{c:'wdata',t:'One directory, one README, one contract',d:'`vr/data/worlds/README.md` exists and is good. It should also state the invariant: nothing in `vr/sim/` may name a specific body except as a validation case.',k:'PROVE',e:'S',i:3},
{c:'wdata',t:'A lint that fails on a new body name in sim code',n:['dataratio'],d:'The regression risk for this whole construct is somebody adding `if (kind === \'triton\')` because it is faster than editing JSON. A grep-level check in the test suite makes that a deliberate act rather than an accident.',k:'PROVE',e:'M',i:3},
{c:'wdata',t:'Keep the named-body functions as fixtures',d:'Landed. `stampFixtures.js` and `shellFixtures.js` keep the old heightfields. Tests assert data ≈ fixture for Mars / Mercury / Moon and Europa / Enceladus / Titan / Pluto / Miranda.',k:'PROVE',e:'M',i:3},
{c:'wdata',t:'Data should be diffable',d:'A 27 KB generated JSON with 120 rows changes constantly. Stable key order, stable number formatting and one row per line make a review possible; a re-serialised blob makes every change look total.',k:'PROVE',e:'S',i:2},
{c:'wdata',t:'Separate authored data from generated data',d:'`vr/data/worlds/` currently mixes both — five authored tables and one generated audit. Two directories, or one naming convention, so nobody hand-edits a generated file.',k:'PROVE',e:'S',i:3},
{c:'wdata',t:'The catalogue and the definitions must agree',d:'`validateCatalogueWorlds` exists. Extend it so every one of the 120 bodies resolves to a definition that exists, and the build fails otherwise.',k:'PROVE',e:'M',i:3},
{c:'wdata',t:'Loading cost of the data layer',d:'Six JSON files compiled into runtime modules, imported at boot. Measure the parse and evaluation cost before adding palettes and art direction to it.',k:'PROVE',e:'S',i:2},
{c:'wdata',t:'A world definition should be shareable',d:'The seed-word system encodes a world in four words. A full definition is bigger, and a URL that carries a whole invented world is the natural endpoint of making it data.',k:'PLAY',e:'M',i:2},
{c:'wdata',t:'Let a player edit a definition',n:['worldrec'],d:'The strongest argument that something is data is that it can be changed without a build. A definition editor in the Lab — change the dominant volatile, watch the world change — is what makes the layer visible.',k:'PLAY',e:'L',i:3},
{c:'wdata',t:'Do not let the join become 120 files',n:['worldrec'],d:'Stated in the worldspace pass and worth restating because it is the failure mode: one JSON per body is 64 lambdas with a different extension. The join must be a small set of rules that *select* from the tables, with per-body overrides as the exception.',k:'MODEL',e:'M',i:3},
{c:'wdata',t:'A migration order',n:['dataratio'],d:'Sixty-four functions is a long list. Do them by how many catalogue bodies each serves: the `io` and `mars` fallbacks first because they cover 58 bodies between them, and Iapetus last because it covers one.',k:'PROVE',e:'S',i:3},

/* ------------------------------------------------------------- wschema -- */
{c:'wschema',t:'Write the schema down',g:'wschema',d:'Six tables exist with no document saying what a world definition is. Write it as a schema — required fields, optional fields, defaults, units, allowed references — and generate the validator from it rather than hand-writing checks per compiler.',k:'MODEL',e:'M',i:3},
{c:'wschema',t:'Axes place the world; the definition describes it',n:['wschema'],d:'`worldAxes` computes seven physical numbers. Those select a definition; they are not the definition. Keeping the two separate is what stops the taxonomy from becoming a lookup table, which the worldspace pass named as the failure mode.',k:'MODEL',e:'M',i:3},
{c:'wschema',t:'Selection rules, not assignments',n:['wschema'],d:'"A world with this gravity, this dominant volatile and this interior state gets these materials" is a rule that covers worlds nobody has named. "Pluto gets nitrogen ice" is an assignment that covers one.',k:'MODEL',e:'L',i:3},
{c:'wschema',t:'Overrides, and a rule about when they are allowed',n:['wschema'],d:'Some bodies genuinely are exceptions — Iapetus\'s two-tone surface is a dust-sweeping accident of its orbit. Allow overrides, require a `why`, and count them, because the count is the honest measure of how well the rules work.',k:'MODEL',e:'M',i:3},
{c:'wschema',t:'Units on every quantity',n:['wschema'],d:'`substrates.json` has `density` 2900, `meltK` 1473, `k` 2.0, `thermalInertia` 2200, `strength` 250. Four of those five units are guessable and none is stated. The life grammar states them; this should too.',k:'PROVE',e:'S',i:3},
{c:'wschema',t:'Ranges and sanity bounds',n:['wschema'],d:'A validator that only checks references will happily accept an albedo of 4. Bounds per field turn the compiler into something that catches an author\'s slip, which is the main thing an author wants from it.',k:'PROVE',e:'S',i:3},
{c:'wschema',t:'A definition needs a confidence, not just tags per row',n:['wschema'],d:'Three levels — measured, inferred, invented — at the level of the whole world, so the interface can say "most of this world is extrapolated" without summing 30 tags.',k:'PROVE',e:'M',i:3},
{c:'wschema',t:'Timescales belong in the schema',n:['wschema'],d:'`processes.json` has 12 processes. A process without a rate is a label. Rates in metres per million years, with the gravity and material dependence stated, are what let the same process produce different landscapes on different worlds.',k:'MODEL',e:'M',i:3},
{c:'wschema',t:'The schema should carry the epoch axis',n:['wschema'],d:'The worldspace pass established that a body at a different time is a different world. A definition that cannot express "Mars, 3.5 Ga" will be copied and edited, which is how 120 files happen.',k:'MODEL',e:'M',i:3},
{c:'wschema',t:'Inheritance between definitions',n:['wschema'],d:'Icy moons share most of their definition. A base plus a diff is how this stays small; a flat table is how it stops being maintainable at 120 entries.',k:'MODEL',e:'M',i:3},
{c:'wschema',t:'Reference by id, never by name',n:['wschema'],d:'The whole reason `planetKind` produced 40 Ios is that identity was a string match. Ids in the data, validated at compile time, are the structural fix.',k:'MODEL',e:'S',i:3},
{c:'wschema',t:'Say what a field is for',n:['wschema'],d:'`substrates.json` carries a `why` on every material and it is the best thing about the file. Extend the convention: every field in the schema gets a sentence, because that sentence is the documentation nobody writes separately.',k:'PROVE',e:'S',i:3},
{c:'wschema',t:'Schema for the things that are not yet data',n:['wschema'],d:'Palette, art direction, sound and named features are all in this document and none is in the schema. Design their shape now, even if they land later, or the schema will be retrofitted twice.',k:'MODEL',e:'M',i:3},
{c:'wschema',t:'Machine-readable, so the tooling is cheap',n:['wschema'],d:'A JSON Schema file lets an editor autocomplete, a CI step validate, and a doc page generate itself. `world-record.schema.json` already exists in `vr/data/` as a precedent.',k:'PROVE',e:'M',i:2},
{c:'wschema',t:'A definition should round-trip',n:['wschema'],d:'Compile it, run a world from it, serialise that world, reload it, and get the same world. The life pass asserts this for genomes and it is the only real proof that a definition is complete.',k:'PROVE',e:'M',i:3},
{c:'wschema',t:'Deprecation, because tables change',n:['wschema'],d:'When a material is removed, saves that reference it have to do something defined. A deprecation field and a migration path are cheaper to add now than to retrofit after the first save breaks.',k:'MODEL',e:'M',i:2},
{c:'wschema',t:'Keep the schema smaller than the data',n:['wschema'],d:'If the schema needs a field for every special case, the special cases are the model. A schema growing faster than the table is the signal that the selection rules are wrong.',k:'PROVE',e:'S',i:2},
{c:'wschema',t:'One page that documents the whole layer',n:['wschema'],d:'Generated from the schema: every table, every field, every unit, every provenance tag, with counts. It is the document that lets somebody else contribute a world.',k:'PROVE',e:'M',i:3},
{c:'wschema',t:'Validate against the real bodies first',n:['wschema'],d:'If the schema cannot express Titan — organic sand over ice bedrock over an ammonia ocean, methane hydrology, a haze that hides the surface — it is not ready for the 94 worlds nobody has seen.',k:'PROVE',e:'M',i:3},
{c:'wschema',t:'Then validate against a world nobody has built',n:['wschema'],d:'A hot super-Earth with a supercritical CO₂ ocean and a silicate atmosphere. If the schema handles it without a new field, the selection rules are doing their job.',k:'PROVE',e:'M',i:3},

/* ------------------------------------------------------------ wcompile -- */
{c:'wcompile',t:'One build that runs every compiler',g:'onebuild',d:'Five compilers exist and each is run by hand. `npm run data` that runs all of them, fails on any error, and leaves the tree clean is the difference between a data layer and five scripts.',k:'PROVE',e:'S',i:3},
{c:'wcompile',t:'Fail the test suite if the generated modules are stale',n:['onebuild'],d:'`lifeGrammar.js`, and the world tables, are generated and committed. Nothing checks that they match their sources, so an edit to the JSON that nobody compiled is invisible until it is not.',k:'PROVE',e:'M',i:3},
{c:'wcompile',t:'Cross-file validation in one place',n:['onebuild'],d:'`landforms.json` references materials and processes; `columns.json` references materials; `cover.json` references materials. Each compiler validates its own file. One pass over the whole set catches the references that cross.',k:'PROVE',e:'M',i:3},
{c:'wcompile',t:'The validator should report, not just throw',n:['onebuild'],d:'`lifegrammar.mjs` prints every problem and then exits non-zero, which is the right shape. Match it everywhere: an author wants the whole list, not the first error.',k:'PROVE',e:'S',i:3},
{c:'wcompile',t:'Freeze the output',d:'The compilers emit `Object.freeze`d tables, which is right. Assert it in a test, because a mutable shared table is a bug that appears months later as a world that changed itself.',k:'PROVE',e:'S',i:2},
{c:'wcompile',t:'Emit derived indexes, not lookups at runtime',d:'`ORGAN_BY_ID` and `BAND_BY_ID` in the life grammar are the pattern. Every table wants its id map emitted rather than built on first use.',k:'MODEL',e:'S',i:2},
{c:'wcompile',t:'Print a summary the reviewer can read',d:'`lifegrammar.mjs` prints the morphospace size. The world compilers should print counts, coverage and the number of overrides, so a diff on the summary line says whether the change was structural.',k:'PROVE',e:'S',i:3},
{c:'wcompile',t:'A dry-run mode',n:['onebuild'],d:'Validate without writing. It is what a pre-commit hook needs and it is three lines.',k:'PROVE',e:'S',i:2},
{c:'wcompile',t:'Deterministic output',n:['onebuild'],d:'Same input, same bytes. Sorted keys, fixed precision. Without it every regeneration is a diff and reviewers stop reading them.',k:'PROVE',e:'S',i:3},
{c:'wcompile',t:'The compiler should refuse an incomplete world',n:['onebuild','worldrec'],d:'A body with no substrate assignment should fail the build, not render as generic. That is the whole argument of the worldspace pass expressed as a build step.',k:'PROVE',e:'M',i:3},
{c:'wcompile',t:'Warn on unused rows',d:'A material nothing selects, a landform no process makes, a cover kind no world uses. Unused rows are either dead or a missing rule, and both are worth surfacing.',k:'PROVE',e:'S',i:2},
{c:'wcompile',t:'Generate the documentation',n:['wschema'],d:'The tables carry `why` on every row. A generated reference page is free and it is the artefact that makes the layer contributable.',k:'PROVE',e:'M',i:3},
{c:'wcompile',t:'Compile-time cost of the whole set',n:['onebuild'],d:'Six files, five compilers. Measure it, because this runs on every data change and a slow build is a build people skip.',k:'PROVE',e:'S',i:1},
{c:'wcompile',t:'Source maps back to the JSON',d:'When a runtime error names material 17, the developer wants the line in `substrates.json`. Emitting the source row index costs nothing.',k:'PROVE',e:'S',i:1},
{c:'wcompile',t:'A schema-driven validator',n:['wschema','onebuild'],d:'Five hand-written validators drift. One generated from the schema does not, and it is the difference between a convention and a contract.',k:'PROVE',e:'M',i:3},
{c:'wcompile',t:'Test the compilers themselves',n:['onebuild'],d:'Feed each a known-bad file and assert it fails with the right message. The `lifegrammar.mjs` validator caught a real error on its first run; nothing proves it still would.',k:'PROVE',e:'M',i:3},
{c:'wcompile',t:'Keep the runtime module free of build concerns',d:'The emitted module should be data and index maps, nothing else. Every helper that creeps into it is a thing that cannot be swapped for a different table.',k:'MODEL',e:'S',i:2},
{c:'wcompile',t:'Support a partial rebuild',n:['onebuild'],d:'Editing one material should not regenerate six files. It matters for the diff more than for the seconds.',k:'PROVE',e:'S',i:1},
{c:'wcompile',t:'The build should run in CI',n:['onebuild'],d:'Everything above is a convention until something enforces it on a machine that is not the author\'s.',k:'PROVE',e:'M',i:3},
{c:'wcompile',t:'One command that reports the state of the data layer',n:['onebuild','dataratio'],d:'Rows per table, coverage per body, overrides, unused rows, provenance mix, and the data-to-code ratio. The review surface for this entire construct.',k:'PROVE',e:'M',i:3},

/* ------------------------------------------------------------- wauthor -- */
{c:'wauthor',t:'Count the code sites a new world still needs',g:'newworldcost',d:'Landed as a generated metric. Named kinds, paint, stamps and ice-shell maps are data; `newworldcost` is remaining name-regexes in `planetKind` (0). Axis fallbacks stay in code because they are physics.',k:'PROVE',e:'S',i:3},
{c:'wauthor',t:'A worked example, end to end',n:['newworldcost'],d:'Pick a body that is not in the catalogue, add it entirely through data, and write down every place the attempt failed. That list is the real backlog for this category and it will be shorter and more specific than anything written in advance.',k:'PROVE',e:'M',i:3},
{c:'wauthor',t:'A template definition',n:['wschema'],d:'A commented skeleton with every field, its unit and its provenance slot. It is the single cheapest thing that makes contribution possible.',k:'PROVE',e:'S',i:3},
{c:'wauthor',t:'Errors an author can act on',n:['onebuild'],d:'"material `nitrogenIce` not found — did you mean `n2Ice`?" is a different experience from a stack trace. The compiler already knows the valid set.',k:'PROVE',e:'S',i:3},
{c:'wauthor',t:'Preview without a full run',n:['newworldcost'],d:'A definition should be renderable to a thumbnail in a second, not by launching the app and navigating to a world. Authoring loops are won or lost on this.',k:'DRAW',e:'M',i:3},
{c:'wauthor',t:'Show what a definition implies',n:['newworldcost'],d:'Given a definition, print the derived consequences — liquid window, viable senses, available processes, expected landforms. Most authoring errors are visible in that list before anything is rendered.',k:'PROVE',e:'M',i:3},
{c:'wauthor',t:'Copy an existing world as a starting point',n:['wschema'],d:'Inheritance makes this safe. Without it, copying is duplication and duplication is how the table becomes 120 files.',k:'PROVE',e:'S',i:2},
{c:'wauthor',t:'A contribution guide',n:['wschema'],d:'What a world needs, what evidence is expected for a `measured` tag, and what happens to a world that is mostly invented. The project has this discipline for planetary parameters and not for worlds.',k:'PROVE',e:'M',i:3},
{c:'wauthor',t:'Review as a diff of pictures',n:['contact'],d:'A pull request that adds a world should show the thumbnail. This is the review surface that makes an art-direction change discussable.',k:'PROVE',e:'M',i:3},
{c:'wauthor',t:'A world that fails review should say why',n:['newworldcost'],d:'Too close to an existing world, missing provenance, out-of-range values, no named feature. Machine-checkable review criteria are what let this scale past one author.',k:'PROVE',e:'M',i:2},
{c:'wauthor',t:'Let the app write a definition',n:['newworldcost'],d:'A player who builds a world in the sandbox should be able to export it as a definition. It is the shortest path from playing to contributing.',k:'PLAY',e:'M',i:3},
{c:'wauthor',t:'Import a definition at runtime',n:['newworldcost'],d:'Paste JSON, get a world. It makes the data layer testable by anyone and it is how somebody proves a schema gap.',k:'PLAY',e:'M',i:2},
{c:'wauthor',t:'Name the authorship',d:'Who wrote this definition and against what sources. The catalogue credits the NASA archive; the worlds should credit their authors.',k:'PROVE',e:'S',i:2},
{c:'wauthor',t:'Definitions for the invented rulesets too',d:'Vermis, Selene, Ares and Daisyworld predate all of this and live in `rulesets.js`. They should go through the same door or they are a permanent exception.',k:'MODEL',e:'M',i:3},
{c:'wauthor',t:'A definition for the unknown case',d:'The honest default for a world with three measured parameters. It should look provisional on purpose, and it is the definition 94 bodies will actually use.',k:'MODEL',e:'M',i:3},
{c:'wauthor',t:'Authoring is where provenance is decided',n:['wschema'],d:'The tag is easy to add and easy to inflate. A `measured` tag should require a source field, which makes the honest thing the easy thing.',k:'PROVE',e:'S',i:3},
{c:'wauthor',t:'A changelog per world',d:'When a world\'s appearance changes, somebody should be able to find out why. This is the thing that makes 120 worlds maintainable rather than 120 things nobody dares touch.',k:'PROVE',e:'M',i:2},
{c:'wauthor',t:'Bulk edits should be possible',d:'"Every ice moon gets a slightly bluer ice" is a reasonable art direction change and today it is 11 file edits. Inheritance and shared palettes make it one.',k:'PROVE',e:'M',i:2},
{c:'wauthor',t:'A definition should be smaller than the code it replaced',n:['dataratio'],d:'If Pluto\'s JSON is longer than `paintPluto`, the schema is carrying the wrong things. Track the ratio per migrated body.',k:'PROVE',e:'S',i:2},
{c:'wauthor',t:'The success condition, stated',n:['newworldcost'],d:'Adding a world touches zero files under `vr/sim/`. Until then this construct is open, whatever the row counts say.',k:'PROVE',e:'S',i:3},
];

const P2 = [
/* --------------------------------------------------------------- stack -- */
{c:'stack',t:'A per-cell material stack',g:'colstack',d:'`W.substrate` is a `Uint8Array` holding the top material and nothing else; `columnAt` builds a stack on demand from **one recipe per world** cached in `W._columnRecipe`. So every cell on a planet has the same layer sequence and the surface is one byte deep. A real stack is per cell: an ordered list of (material, thickness) that processes read and write.',k:'MODEL',e:'L',i:3},
{c:'stack',t:'Fixed depth first, variable later',n:['colstack'],d:'Eight layers of one material byte and one thickness float is 40 bytes a cell — 2.2 MB at N=96. Start there, because a fixed stack is a typed array and a variable one is an allocation problem, and the fixed version already unlocks every process in this category.',k:'MODEL',e:'M',i:3},
{c:'stack',t:'The recipe becomes the initial condition',n:['colstack'],d:'`columnAt`\'s recipe is good work and it is exactly the right thing to *stamp with*. Run it once per cell at generate to fill the stack, then let processes change it. Nothing about the recipe is wasted; it stops being the answer and becomes the starting point.',k:'MODEL',e:'M',i:3},
{c:'stack',t:'Thickness in metres, everywhere',n:['colstack'],d:'`columnAt` already returns `depthKm`. Keep one unit through the whole stack and state it, because the surface pass found three different implied scalings of one quantity in the field atlas and this is the same trap.',k:'MODEL',e:'S',i:3},
{c:'stack',t:'The top of the stack is the surface',n:['colstack'],d:'`W.substrate` becomes derived — the material of layer zero — rather than an independent field that can disagree with the column. One writer, as the biosphere architecture insisted for `lifeClass`.',k:'MODEL',e:'M',i:3},
{c:'stack',t:'`W.rock` is the Earth stack in disguise',n:['colstack'],d:'Eight Earth rock types in a parallel byte array, written by the tectonics and extinction code. Once the stack exists, `rock` is layer zero on an Earth-like world and the two arrays stop being able to contradict each other.',k:'MODEL',e:'M',i:3},
{c:'stack',t:'A layer needs an age',n:['colstack'],d:'`W.age` is one number per cell. A layer has its own age, and the difference between the top layer\'s age and the one below it is an unconformity — which is how a geologist reads a cliff.',k:'MODEL',e:'M',i:3},
{c:'stack',t:'Mixtures within a layer',n:['colstack'],d:'Mars is basalt plus dust plus salt plus ice, not four layers. A layer wants a dominant material and a minor fraction, which is two bytes instead of one and covers most real surfaces.',k:'MODEL',e:'M',i:2},
{c:'stack',t:'Porosity, because it changes everything mechanical',n:['colstack'],d:'Regolith is 40% void. It changes density, thermal conductivity, strength and how much volatile a layer can hold. It is one float and it is the difference between rock and rubble.',k:'MODEL',e:'M',i:2},
{c:'stack',t:'The stack under the ocean',n:['colstack'],d:'Sediment on the abyssal plain is the reason it is flat, which the landscape pass measured as half the planet at one elevation with the wrong cause. Ocean cells need a stack as much as land cells.',k:'MODEL',e:'M',i:3},
{c:'stack',t:'The stack under an ice shell',n:['colstack'],d:'Ice, ocean, high-pressure ice, rock. `columnAt`\'s recipes already express this per world; per cell it becomes a shell thickness that varies — which is what makes Enceladus\'s south pole different from its equator.',k:'MODEL',e:'M',i:3},
{c:'stack',t:'A stack for a world with no surface',n:['colstack'],d:'The worldspace pass wants pressure as the vertical coordinate on a giant. That is the same data structure with a different axis, and designing them together is cheaper than twice.',k:'MODEL',e:'M',i:2},
{c:'stack',t:'Isostasy should integrate the column',n:['colstack'],d:'`applyIsostasy` uses a crust thickness and a density. With a stack it is a sum over layers, and an ice sheet, a sediment pile and a lava flow all load the crust correctly and for the same reason.',k:'MODEL',e:'M',i:3},
{c:'stack',t:'Thermal conductivity through the stack',n:['colstack'],d:'`substrates.json` carries `k` and `thermalInertia` per material and nothing integrates them. The surface temperature response depends on the top few centimetres and the geothermal gradient depends on the whole column.',k:'MODEL',e:'M',i:2},
{c:'stack',t:'The stack decides erodibility',n:['colstack'],d:'`erodeFactor` reads the top material. With a stack, erosion cuts down into the next one and the rate changes — which is the mechanism behind every mesa, cuesta and waterfall.',k:'MODEL',e:'M',i:3},
{c:'stack',t:'Save the stack',n:['colstack'],d:'A quantised heightfield is in the save format. A stack is bigger and compresses well — run-length by layer is the natural encoding since most cells have the same sequence.',k:'MODEL',e:'M',i:2},
{c:'stack',t:'A stack inspector',n:['colstack'],d:'`coreSample` and `formatColumnAt` exist and read the recipe. Pointed at a real per-cell stack they become the instrument that explains a landscape, which is what the geology backlog wanted from a drill.',k:'DRAW',e:'M',i:3},
{c:'stack',t:'Do not let the stack drift from the picture',n:['colstack'],d:'The surface backlog\'s rule: one description of a cell consumed by every view. A stack whose top material is not what the shader paints is a new class of the same bug.',k:'DRAW',e:'M',i:3},
{c:'stack',t:'Layer count as a diagnostic',n:['colstack'],d:'A world whose cells all have three layers has had no history. Mean layer count per world is a one-number summary of how much has happened.',k:'PROVE',e:'S',i:2},
{c:'stack',t:'Assert the known columns per cell',n:['colstack'],d:'The worldspace pass asserted Europa, Titan and the Moon at the world level. At cell level the assertion gets sharper: Enceladus\'s south pole shell is 5 km and its equator is 30.',k:'PROVE',e:'M',i:3},

/* --------------------------------------------------------------- strat -- */
{c:'strat',t:'Deposition writes a layer',g:'deposit',n:['colstack'],d:'The surface backlog asks for a sediment budget; this is where the sediment goes. Material removed from a slope arrives somewhere and becomes a layer with a thickness, a material and an age. Without it erosion is subtraction and the abyssal plain is flat for no reason.',k:'MODEL',e:'M',i:3},
{c:'strat',t:'Burial, and what it does to what is buried',n:['deposit'],d:'Compaction, cementation, and the transition from sediment to rock. It is why a layer\'s properties change with depth and why the column is not just a stack of the things that landed on it.',k:'MODEL',e:'M',i:2},
{c:'strat',t:'Exposure, and the unconformity it leaves',n:['deposit'],d:'When erosion removes layers and deposition resumes, the gap is the most information-dense feature in any cliff face. It is free once the stack has ages.',k:'MODEL',e:'M',i:2},
{c:'strat',t:'Lava flows lay down a layer',n:['deposit'],d:'`W.lava` exists as a field. A flow that cools becomes basalt at the top of the column, which is how Venus resurfaced itself and how the lunar maria formed.',k:'MODEL',e:'M',i:3},
{c:'strat',t:'Impact ejecta is a layer',n:['deposit'],d:'`ROCK_NAMES` already has `impact ejecta` as rock type 5. A crater throws a blanket over everything around it and the blanket is a datable layer — which is how the entire lunar timescale was built.',k:'MODEL',e:'M',i:3},
{c:'strat',t:'Ash falls',n:['deposit'],d:'`W.ash` is a field that shades the planet and never lands. An ash layer is thin, widespread and instantaneous, which makes it the best correlation marker a stratigraphy can have.',k:'MODEL',e:'M',i:2},
{c:'strat',t:'Evaporites when a basin dries',n:['deposit'],d:'A closed basin that evaporates leaves salt in layers, and the layers record the wet and dry cycles. It links the arid processes to the column and it produces one of the brightest surfaces a world can have.',k:'MODEL',e:'M',i:2},
{c:'strat',t:'Biological layers',n:['deposit'],d:'Limestone, chalk, chert, coal, banded iron. `bifRock` exists. The life pass wants organisms to be a geological force and this is the mechanism — biology writing rock.',k:'MODEL',e:'M',i:3},
{c:'strat',t:'The fossil record lives in the stack',n:['deposit'],d:'`W.fossils[c]` is a per-cell array capped at eight with no depth. Fossils in layers means a section you can read, which is what the life pass asked for and could not have.',k:'MODEL',e:'M',i:3},
{c:'strat',t:'Preservation should be biased',n:['deposit'],d:'Skeleton, environment and sedimentation rate decide what survives. A perfect record teaches the wrong lesson; a biased one teaches the right one and makes the geology matter to the biology.',k:'MODEL',e:'M',i:3},
{c:'strat',t:'Correlate two sections',n:['deposit'],d:'Two cliffs on opposite sides of a continent with the same ash layer in them. Matching them is what stratigraphy *is*, and it is a genuinely playable instrument.',k:'PLAY',e:'M',i:2},
{c:'strat',t:'A dated column is a clock',n:['deposit'],d:'Layer ages give a sedimentation rate, and a rate plus a thickness gives a date for anything in it. It is the same inference chain a real geologist uses and the simulation knows the true answer.',k:'PLAY',e:'M',i:2},
{c:'strat',t:'Deformation folds and faults the stack',n:['deposit'],d:'Layers tilt, fold and offset. Once they are a stack rather than a recipe, tectonics has something to deform, and a folded sequence exposed by erosion is the most legible geology there is.',k:'MODEL',e:'L',i:2},
{c:'strat',t:'Metamorphism changes a layer in place',n:['deposit'],d:'`ROCK_NAMES` has `metamorphic` as a type. It is a transformation of whatever was there under heat and pressure, which the stack makes expressible for the first time.',k:'MODEL',e:'M',i:2},
{c:'strat',t:'The Anthropocene is a layer',n:['deposit'],d:'Concrete, plastics, radionuclides, a metals spike. The worldspace pass put this under the technosphere; the stack is where it would actually appear.',k:'MODEL',e:'M',i:2},
{c:'strat',t:'A stratigraphic column view',n:['deposit'],d:'The standard figure in the field: layers drawn to scale with materials, ages and a description. `formatColumnAt` is most of the text version.',k:'DRAW',e:'M',i:3},
{c:'strat',t:'Layers exposed on a cliff',n:['deposit'],d:'The local map at 1,632 km is exactly the scale where a cut bank or crater wall shows a section. It is the payoff for the whole category and it needs the sub-cell work from the surface pass.',k:'DRAW',e:'M',i:3},
{c:'strat',t:'Colour banding from real layers, not noise',n:['deposit'],d:'The banded terrain of Mars\'s polar deposits and the Grand Canyon are layers seen edge-on. It is the one kind of banding this project should be trying to produce.',k:'DRAW',e:'M',i:3},
{c:'strat',t:'Sedimentation rate per world',n:['deposit'],d:'Earth deposits centimetres per thousand years; the Moon deposits almost nothing. It is a per-world rate that follows from the process set and it is a good one-number check.',k:'PROVE',e:'M',i:2},
{c:'strat',t:'Assert a known section',n:['deposit'],d:'Build a world, run it a billion years, and check the column at a delta looks like a delta: young sediment over older sediment over basement.',k:'PROVE',e:'M',i:3},

/* ------------------------------------------------------------ stackops -- */
{c:'stackops',t:'Six operations, defined once',g:'stackops',n:['colstack'],d:'Erode from the top, deposit to the top, intrude between, melt out, weather in place, compact. Every process in `processes.json` is one of these six on a column, and defining them once means a new process is a parameter set rather than new code.',k:'MODEL',e:'M',i:3},
{c:'stackops',t:'Erosion must know what it is cutting',n:['stackops'],d:'`erodeFactor(W, c)` reads the top material. With a stack it reads the layer at the current depth, which is what makes differential erosion possible and what the surface backlog\'s `strata` item is waiting for.',k:'MODEL',e:'M',i:3},
{c:'stackops',t:'Conservation: what leaves must arrive',n:['stackops','deposit'],d:'A stack makes mass balance checkable for the first time. Sum the material removed against the material deposited and assert it closes, the same way the water budget does.',k:'PROVE',e:'M',i:3},
{c:'stackops',t:'Weathering transforms rather than moves',n:['stackops'],d:'Rock becomes regolith becomes soil in place. It is the operation that makes a surface look old without moving anything, and it is how a fresh lava flow stops looking fresh.',k:'MODEL',e:'M',i:3},
{c:'stackops',t:'Space weathering on an airless world',n:['stackops'],d:'Micrometeorite gardening darkens and matures the top layer over billions of years. It is why fresh craters are bright and old terrain is not, and it is a direct readout of surface age.',k:'MODEL',e:'M',i:3},
{c:'stackops',t:'Sublimation removes a layer and leaves a lag',n:['stackops'],d:'The involatile fraction stays behind, darkens the surface and slows further loss. Two operations composed, and it is most of what happens on a comet and on Pluto.',k:'MODEL',e:'M',i:3},
{c:'stackops',t:'Melting moves material between layers',n:['stackops'],d:'Ice at the base of a glacier, permafrost thawing, a magma body rising. All three are the same operation with different materials and different depths.',k:'MODEL',e:'M',i:2},
{c:'stackops',t:'Intrusion, because not everything arrives from above',n:['stackops'],d:'A sill, a dyke, a salt diapir, a cryovolcanic diapir. Inserting into the middle of a stack is the operation that produces Triton\'s cantaloupe terrain and Europa\'s lenticulae.',k:'MODEL',e:'M',i:2},
{c:'stackops',t:'Mixing at the top',n:['stackops'],d:'Bioturbation, cryoturbation, impact gardening, ploughing. Mixing destroys the record and that destruction is itself informative.',k:'MODEL',e:'M',i:2},
{c:'stackops',t:'Operations should be reversible in the log',n:['stackops'],d:'The god layer has receipts and undo for terrain. A stack operation is a better receipt than a height delta because it says what material moved and where it went.',k:'PLAY',e:'M',i:2},
{c:'stackops',t:'Rates come from the process table',n:['stackops'],d:'`processes.json` has 12 processes. Each needs a rate, a material dependence and a gravity dependence, and then the same process gives different answers on different worlds — which is the whole point.',k:'MODEL',e:'M',i:3},
{c:'stackops',t:'Order of operations within a tick',n:['stackops'],d:'Erode then deposit, or deposit then erode, give different columns. The life pass had to write its tick order down; this needs the same.',k:'MODEL',e:'M',i:3},
{c:'stackops',t:'Numerical stability at long timesteps',n:['stackops'],d:'A 10 kyr tick can erode more than a layer is thick. Sub-stepping or a flux limiter is required or the stack will develop negative thicknesses on the first mountain.',k:'MODEL',e:'M',i:3},
{c:'stackops',t:'Merge thin layers',n:['stackops'],d:'A fixed-depth stack fills up. Merging adjacent layers of the same material, and dropping layers below a thickness threshold, is what keeps the depth bounded without losing the sequence.',k:'MODEL',e:'M',i:3},
{c:'stackops',t:'The player should be able to add a layer',n:['stackops'],d:'The god layer can raise crust. Laying down a flood basalt, an ash fall or an ice sheet is a more interesting verb and it is legible for the rest of the run.',k:'PLAY',e:'M',i:2},
{c:'stackops',t:'Operations must be deterministic',n:['stackops'],d:'The golden run covers the fields. A stack is new state and it needs the same guarantee, especially with merging and thresholds involved.',k:'PROVE',e:'M',i:3},
{c:'stackops',t:'Profile the stack tick',n:['stackops'],d:'Six operations over 55,296 cells with eight layers each. Measure it before wiring every process through it.',k:'PROVE',e:'M',i:3},
{c:'stackops',t:'Operations on a world with no surface',n:['stackops'],d:'On a giant the equivalents are condensation, precipitation and mixing between pressure levels. Same six verbs, different axis.',k:'MODEL',e:'M',i:2},
{c:'stackops',t:'An operation log per cell, capped',n:['stackops'],d:'What last happened here, and when. It is what the surface backlog\'s process-attribution overlay needs and it is a byte per cell.',k:'PROVE',e:'M',i:2},
{c:'stackops',t:'Assert a simple case analytically',n:['stackops'],d:'Constant uplift against constant erosion reaches a known steady-state elevation. If the stack cannot reproduce that, none of the landscapes built on it mean anything.',k:'PROVE',e:'M',i:3},

/* ----------------------------------------------------------- stackperf -- */
{c:'stackperf',t:'State the memory budget before writing it',g:'stackbudget',d:'At N=96, 55,296 cells: eight layers of one material byte plus one float thickness is 2.2 MB. At N=768, 3.5 million cells, the same structure is 142 MB. `N_ALLOWED` reaches 768 and nothing measures what the world already costs there.',k:'PROVE',e:'S',i:3},
{c:'stackperf',t:'Structure of arrays, not array of structures',n:['stackbudget'],d:'One `Uint8Array(NC * L)` for materials and one `Float32Array(NC * L)` for thicknesses beats 55,296 little objects by orders of magnitude in both memory and cache behaviour.',k:'MODEL',e:'M',i:3},
{c:'stackperf',t:'Most cells share a sequence',n:['stackbudget'],d:'A palette of common sequences with a per-cell index, and a full stack only where a cell has diverged. It is the compression the data suggests and it may make the variable-depth version affordable.',k:'MODEL',e:'M',i:2},
{c:'stackperf',t:'Only the top layers change often',n:['stackbudget'],d:'Deep layers are inert for most of a run. Splitting an active top window from a frozen tail cuts the per-tick cost to a fraction of the storage.',k:'MODEL',e:'M',i:3},
{c:'stackperf',t:'Reallocation on resolution change',n:['stackbudget'],d:'`changeResolution` replaces every array and the surface pass already notes that this throws terrain away. A stack makes the loss larger and the resample harder.',k:'MODEL',e:'M',i:2},
{c:'stackperf',t:'The stack must not reach the GPU whole',n:['stackbudget'],d:'The field atlas carries twelve channels at eight bits. The shader needs the top material and maybe the one below it, not the column.',k:'DRAW',e:'M',i:3},
{c:'stackperf',t:'Serialisation size',n:['stackbudget'],d:'Run-length by layer, quantised thickness. A save that doubles in size for a feature nobody sees will get cut, so measure it against the current format.',k:'PROVE',e:'M',i:2},
{c:'stackperf',t:'Allocation-free per tick',n:['stackbudget'],d:'The renderer already learned this lesson with scratch buffers. A stack operation that allocates per cell per tick will show up as a stutter every tick.',k:'MODEL',e:'M',i:3},
{c:'stackperf',t:'Bound the layer count hard',n:['stackbudget'],d:'A merge policy that can fail leaves an unbounded structure. Pick the cap, enforce it, and make the merge lossy in a stated way.',k:'MODEL',e:'M',i:3},
{c:'stackperf',t:'Measure at three resolutions',n:['stackbudget'],d:'N=32 for the probes, 96 for play, 192 for the ambitious case. A structure that only works at one of them is a structure that will be rewritten.',k:'PROVE',e:'M',i:3},
{c:'stackperf',t:'The GPGPU path should not be blocked by it',n:['stackbudget'],d:'Climate fields already run on the GPU. Keeping the stack CPU-side is fine; keeping it in a place that stalls the readback is not.',k:'MODEL',e:'M',i:2},
{c:'stackperf',t:'A degraded mode',n:['stackbudget'],d:'On a machine that cannot afford the stack, fall back to the recipe that exists today rather than failing. The recipe is already written and already correct as an initial condition.',k:'MODEL',e:'M',i:2},
{c:'stackperf',t:'Worker-side stack updates',n:['stackbudget'],d:'`worker.js` exists. Column operations are local per cell and are the most parallelisable thing in the simulation.',k:'MODEL',e:'L',i:1},
{c:'stackperf',t:'Do not let the stack force a resolution cap',n:['stackbudget'],d:'The sub-cell items in the surface backlog want higher N. If the stack is what stops that, the trade has to be made deliberately rather than discovered.',k:'PROVE',e:'M',i:3},
{c:'stackperf',t:'Benchmark the six operations separately',n:['stackops','stackbudget'],d:'Erode, deposit, intrude, melt, weather, compact. One of them will dominate and it will not be the one anybody guesses.',k:'PROVE',e:'M',i:2},
{c:'stackperf',t:'Memory report in the HUD',n:['stackbudget'],d:'The product already prints GPGPU timing. Field memory, and what the stack costs of it, belongs next to it.',k:'PROVE',e:'S',i:2},
{c:'stackperf',t:'A stack-free world should cost nothing',n:['stackbudget'],d:'Modern Earth in the Holocene does not need a deep column. Allocating lazily means the common case pays nothing.',k:'MODEL',e:'M',i:2},
{c:'stackperf',t:'Growth over a long run',n:['stackbudget'],d:'A 4.5 Gyr run deposits a lot. Measure whether the stack converges to a steady layer count or grows without bound, because the merge policy is what decides it.',k:'PROVE',e:'M',i:3},
{c:'stackperf',t:'Compare against doing nothing',n:['stackbudget'],d:'The honest baseline: how much does the picture actually improve per megabyte. It is the question that decides whether this construct is worth its cost.',k:'PROVE',e:'M',i:2},
{c:'stackperf',t:'Write the budget into the limits document',n:['stackbudget'],d:'`briefs/model-limits.md` states the physical limits. Memory and resolution limits belong there too, because they bound every visual item in three backlogs.',k:'PROVE',e:'S',i:3},
];

const P3 = [
/* ---------------------------------------------------------------- ramp -- */
{c:'ramp',t:'A material needs a ramp, not a triple',g:'matramp',d:'`substrates.json` gives each of 24 materials one `rgb`, one `albedo` and a `tag`. A real surface colour varies with wetness, grain size, age, depth and viewing angle. Make the colour a small ramp keyed on those, which is the same shape `landMars` already implements in code with four `lerp` calls.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'One hundred and fifty-four triples are still in code',g:'triplecount',d:'Measured: 76 in `lifeColour.js`, 67 in `planetLook.js`, 11 in `render.js`. Every one is a colour decision nobody can review, swap or check for contrast. Count them in a test so the number can only fall.',k:'PROVE',e:'S',i:3},
{c:'ramp',t:'Ramp stops with positions and a colour space',n:['matramp'],d:'A ramp as data is a list of (position, colour) plus an interpolation space. Blending in sRGB bytes — which is what all 85 `lerp` calls in `planetLook.js` do — passes through a muddy middle, and the surface backlog already flagged this.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Depth ramps for anything submerged',n:['matramp'],d:'The surface pass fitted the ocean ramp so it no longer saturates at 530 m. That fix belongs to a *material* — water — not to the ocean branch of `refreshColours`, and then a methane sea and a brine ocean get the same treatment for free.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Wetness darkens, and it is one term',n:['matramp'],d:'Wet rock, wet sand, wet soil are all darker and glossier. One modifier on the material ramp covers rain, tide, snowmelt and river overflow, and the surface backlog asked for exactly this and put it in the wrong category.',k:'DRAW',e:'S',i:3},
{c:'ramp',t:'Grain size is an albedo axis',n:['matramp'],d:'Fresh fine frost is near 0.9 and coarse old ice below 0.4 — same material, different history. `substrates.json` has one albedo per material and the difference between Enceladus and Callisto is largely this.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Age darkens an airless surface',n:['matramp'],d:'Space weathering matures regolith over billions of years. It is a ramp against surface age and it is why the lunar rays fade.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Cover composites over substrate, it does not replace it',n:['matramp'],d:'`cover.json` has 11 kinds with their own triples. Frost over basalt at 30% coverage is a blend, not a switch, and the surface backlog\'s four-stage pipeline is where that blend belongs.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Retire the PAINT lambdas into ramps',n:['matramp','paintdata'],d:'Thirty kinds, 37 functions, 85 `lerp` calls. Each is a function of elevation, ice, temperature and moisture — four inputs, which is a small ramp table. This is the concrete migration for construct 18.',k:'DRAW',e:'L',i:3},
{c:'ramp',t:'Ramps must be dithered on the way to eight bits',d:'The surface pass landed vertex dithering. A data ramp has more stops and shallower gradients, which makes banding more likely, not less.',k:'DRAW',e:'S',i:3},
{c:'ramp',t:'A ramp per era',n:['matramp'],d:'An Archean ocean is iron-green, a Cryogenian one is white. The worldspace pass wants an epoch to be a world; a palette is a large part of what makes it feel like one.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Ramps for overlays are a separate family',n:['matramp'],d:'Surface ramps describe materials; overlay ramps encode data and need perceptual uniformity and a diverging option. Same file format, different rules, and mixing them produces rainbow scalars.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Named ramps, reused across worlds',n:['matramp'],d:'"Dirty ice", "oxidised basalt", "organic haze". Named ramps shared by several worlds are what stop the palette becoming per-body, which is the failure mode this whole document is about.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'A ramp is not a biome',n:['matramp'],d:'`lifeColour.js` has 76 triples covering guilds, classes, biomes and kinds. Some of those are materials and some are living cover, and separating them is what lets the life pass\'s pigment work reach the picture.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Interpolate in a perceptual space',n:['matramp'],d:'Oklab or CIELAB for ramp evaluation. It is a contained change with a visible payoff on every gradient, and it is a precondition for any contrast check being meaningful.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'The ocean is a material too',n:['matramp'],d:'`rule.ocean` is a second lambda per kind in the PAINT table. Water, brine, methane and magma are materials in `substrates.json`, and a sea is a material with a depth ramp.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Sea ice is three constants',d:'`[222, 234, 246]` partial, `[248, 251, 255]` full, one blue for a lead. Age, thickness, snow cover, melt ponds and ridging are all tracked or trackable and none reaches the colour.',k:'DRAW',e:'M',i:2},
{c:'ramp',t:'Emissive materials need a separate channel',n:['matramp'],d:'Lava glows, aurorae glow, bioluminescence glows, cities glow. A reflectance ramp cannot express emission and the night side is where all four live.',k:'DRAW',e:'M',i:3},
{c:'ramp',t:'Specular and roughness belong with the ramp',n:['matramp'],d:'The realism pass gave the ocean a GGX lobe with wind-driven roughness. Land, ice and lava have no material response at all, so a salt flat and a forest scatter light identically.',k:'DRAW',e:'M',i:2},
{c:'ramp',t:'Assert every material has a ramp',n:['matramp','onebuild'],d:'Twenty-four materials, 11 cover kinds, 21 landforms. The compiler should refuse a row without one, which is how the count of code triples gets driven down and stays down.',k:'PROVE',e:'M',i:3},

/* ------------------------------------------------------------- spectra -- */
{c:'spectra',t:'Carry a spectrum where one exists',g:'spectrum',d:'`substrates.json` has 24 materials with a `tag` on each. Basalt, water ice, sulfur, tholin, hematite and olivine all have published reflectance spectra. Carrying a few sampled bands and deriving the triple makes `measured` mean something stronger than "somebody was honest about guessing".',k:'PROVE',e:'L',i:3},
{c:'spectra',t:'Cite the source on the row',n:['spectrum'],d:'A `measured` tag with no reference is an assertion. The catalogue credits the NASA Exoplanet Archive by name; material optics deserve the same discipline.',k:'PROVE',e:'M',i:3},
{c:'spectra',t:'Derive the triple, do not author both',n:['spectrum'],d:'If a spectrum exists, the RGB must be computed from it under a stated illuminant. Two sources of truth for one colour is how they drift.',k:'DRAW',e:'M',i:3},
{c:'spectra',t:'The Earth reference path already exists',n:['spectrum'],d:'`EOREF` holds a shelf of NASA stills and the realism pass built the comparison path. Extend it from "does Earth look right" to "does this material look right", which is a much sharper question.',k:'PROVE',e:'M',i:3},
{c:'spectra',t:'Bond albedo should agree with the picture',n:['spectrum'],d:'The surface backlog asks for this and it belongs here: integrate the rendered disc luminance and compare against the model\'s albedo. If a world looks brighter than it is, one of the two is wrong.',k:'PROVE',e:'M',i:3},
{c:'spectra',t:'Measured albedos for every Solar System body',n:['spectrum'],d:'Enceladus 0.81, Iapetus a factor of ten between hemispheres, the Moon 0.12. These are published, they are unambiguous, and they are the cheapest possible calibration for the whole palette.',k:'PROVE',e:'M',i:3},
{c:'spectra',t:'Phase angle changes brightness',n:['spectrum'],d:'The opposition surge is real and large on regolith surfaces. It is one term and it is why the full Moon is more than twice as bright as the half Moon.',k:'DRAW',e:'M',i:2},
{c:'spectra',t:'Say when a colour is a guess, on the world',n:['spectrum'],d:'The realism backlog wants a visual honesty label. For 94 exoplanets every colour is invented, and the interface presenting them identically to Mars is the problem.',k:'PROVE',e:'M',i:3},
{c:'spectra',t:'Colour for a material nobody has seen',n:['spectrum'],d:'Supercritical CO₂, high-pressure ice, a silicate vapour atmosphere. Derive from composition and physics where possible, label invented where not, and never quietly pick something pretty.',k:'PROVE',e:'M',i:3},
{c:'spectra',t:'Spectra let the life pass reach the surface',n:['spectrum'],d:'`sensory.js` integrates a Planck spectrum against band transmission for eyes. The same integral against a surface reflectance gives the colour under any star, and the code is already written.',k:'DRAW',e:'M',i:3},
{c:'spectra',t:'The red edge is a spectral feature',n:['spectrum'],d:'Vegetation\'s reflectance jump near 700 nm is the canonical biosignature. It is a spectrum, not a triple, and drawing it as one is what makes the transit spectrum and the surface agree.',k:'MODEL',e:'M',i:3},
{c:'spectra',t:'Store spectra coarsely',n:['spectrum'],d:'Eight to sixteen bands from 300 nm to 2500 nm is enough for colour and for the biosignature work, and it keeps the table readable.',k:'MODEL',e:'M',i:2},
{c:'spectra',t:'A spectrum viewer in the Lab',n:['spectrum'],d:'Pick a material, see its reflectance and the resulting colour under the current star. It is the tool that makes the whole construct inspectable.',k:'DRAW',e:'M',i:2},
{c:'spectra',t:'Provenance mix as a number per world',n:['spectrum'],d:'"This world\'s appearance is 20% measured, 30% inferred, 50% invented." One number, on the world card, computed from the tags already present.',k:'PROVE',e:'M',i:3},
{c:'spectra',t:'Do not let provenance become decoration',n:['spectrum'],d:'Thirty-five tags exist and nothing surfaces them. A tag nobody reads is worse than no tag because it implies a rigour that is not being exercised.',k:'PROVE',e:'S',i:3},
{c:'spectra',t:'Reference imagery per body',n:['spectrum'],d:'`site/img/` has four screenshots and none is a reference photograph. Every Solar System body has public imagery, and the comparison is the only external truth the picture has.',k:'PROVE',e:'M',i:3},
{c:'spectra',t:'Colour-match against the reference',n:['spectrum'],d:'Histogram, dominant hue, light–dark contrast, limb profile. Four numbers per body against its photograph, and a stated tolerance.',k:'PROVE',e:'M',i:3},
{c:'spectra',t:'Beware the enhanced-colour trap',n:['spectrum'],d:'Most published planetary images are stretched or false-colour. Matching against them without saying so would encode a processing choice as a physical fact — and the honest version is more interesting.',k:'PROVE',e:'M',i:3},
{c:'spectra',t:'Human colour vision is the last step',n:['spectrum'],d:'A spectrum becomes a colour only through an observer. State which observer, because on a red-dwarf world the interesting question is what its own inhabitants would see, and the life pass computes that.',k:'DRAW',e:'M',i:2},
{c:'spectra',t:'Assert a known colour end to end',n:['spectrum'],d:'Basalt under the Sun should come out near the measured lunar mare reflectance. One assertion that pins spectrum, illuminant and tonemap together.',k:'PROVE',e:'M',i:3},

/* --------------------------------------------------------------- light -- */
{c:'light',t:'Colour is reflectance times illuminant',g:'illum',n:['spectrum'],d:'`planetLook.js` returns display-referred bytes from constants tuned under a G star. The same basalt under a 2,560 K dwarf is a different colour, and `sensory.js` already integrates Planck spectra for eyes — the machinery exists and never touches a surface.',k:'DRAW',e:'M',i:3},
{c:'light',t:'Exposure per world, from insolation',n:['illum'],d:'Mercury at 6.7 solar constants and Pluto at 0.001 are drawn with the same exposure. The realism pass added eye adaptation; making its target per-world is a small change with an enormous effect on whether a world reads as far from its star.',k:'DRAW',e:'M',i:3},
{c:'light',t:'The sky is a second light source',n:['illum'],d:'On Earth shadows are blue because the sky fills them. On an airless world they are black. It is the strongest single cue for whether a world has air and it is one term.',k:'DRAW',e:'M',i:3},
{c:'light',t:'Sky colour from the atmosphere it has',n:['illum'],d:'Rayleigh gives blue, Mars\'s dust gives butterscotch with a blue sunset, Titan\'s haze gives orange gloom. Composition and optical depth are in the model.',k:'DRAW',e:'M',i:3},
{c:'light',t:'Low sun is red, not dim',n:['illum'],d:'The terminator is where a planet looks best and it is currently a brightness ramp. Reddening through a long air path is the physics and it is the same integral as the sky colour.',k:'DRAW',e:'M',i:3},
{c:'light',t:'Atmospheric perspective toward the limb',n:['illum'],d:'More air between surface and camera means desaturation and a blue shift. The realism pass added a limb volume term and the surface colour does not know about it.',k:'DRAW',e:'M',i:2},
{c:'light',t:'Night is a different colour, not a darker one',n:['illum'],d:'Real night shows what emits — lava, aurorae, lightning, cities, bioluminescence — plus whatever a moon reflects onto it. Four of those five exist as fields.',k:'DRAW',e:'M',i:3},
{c:'light',t:'Moonlight, and a sky with a planet in it',n:['illum'],d:'Europa has Jupiter filling a third of its sky. Reflected light from a parent body is a real illuminant with a real colour and `MOON_PARENTS` already knows the geometry.',k:'DRAW',e:'M',i:2},
{c:'light',t:'Two suns',n:['illum'],d:'`binaryInsolation` and `circumbinaryBeat` exist. Two illuminants of different temperatures means two shadows of different colours, which is the most legible possible statement that this is not the Solar System.',k:'DRAW',e:'M',i:2},
{c:'light',t:'Eclipses and transits as lighting events',n:['illum'],d:'A moon crossing the star, a parent planet eclipsing its moon for hours. These are dramatic, computable from orbits already in the catalogue, and they change the light rather than the surface.',k:'DRAW',e:'M',i:2},
{c:'light',t:'A rogue world has no illuminant',n:['illum'],d:'Sixteen bodies in the `dark` category. Lit only by internal heat and starlight, which is a rendering problem nobody has had to solve here and the honest answer is nearly black.',k:'DRAW',e:'M',i:2},
{c:'light',t:'Tone mapping is per world too',n:['illum'],d:'The realism pass found the atmosphere shell clipped to white because it was never tonemapped. A world at 6.7 solar constants and one at 0.001 cannot share a curve.',k:'DRAW',e:'M',i:3},
{c:'light',t:'White balance is a choice, so state it',n:['illum'],d:'Rendering a red-dwarf world as the eye would adapt to it, or as a camera calibrated to the Sun would record it, are different pictures. Both are defensible; picking silently is not.',k:'DRAW',e:'M',i:3},
{c:'light',t:'Show the same material under three stars',n:['illum'],d:'A strip of the same surface under a G, K and M star. It is the clearest demonstration that colour is not a property of a thing, and it is a Lab panel.',k:'DRAW',e:'M',i:3},
{c:'light',t:'Illumination belongs in the world definition',n:['illum','worldrec'],d:'Star temperature, insolation, sky model, exposure target and white balance decided together per world — which is where this construct meets art direction.',k:'MODEL',e:'M',i:3},
{c:'light',t:'Cloud shadow on the ground',n:['illum'],d:'The cloud shell blocks light in the radiation budget and not in the picture. It is one of the strongest cues that a planet has weather.',k:'DRAW',e:'M',i:3},
{c:'light',t:'Ring shadows',n:['illum'],d:'Saturn\'s rings cast a hard band across its cloud tops and the shadow moves with the season. It is one of the most recognisable images in the Solar System.',k:'DRAW',e:'M',i:2},
{c:'light',t:'Specular highlight as a diagnostic',n:['illum'],d:'The glint off Titan\'s lakes is how they were confirmed. A specular return says "liquid" more clearly than any colour.',k:'DRAW',e:'M',i:2},
{c:'light',t:'Do not fake it with a colour grade',n:['illum'],d:'A per-world LUT would get most of the way there and would encode a look rather than a physics. Where the physics is cheap, spend it; where a grade is used, label it.',k:'DRAW',e:'M',i:3},
{c:'light',t:'Assert the illuminant path',n:['illum'],d:'Same material, three star temperatures, three different output colours in the right direction. If the surface colour does not move with the star, the whole construct is inert.',k:'PROVE',e:'M',i:3},

/* -------------------------------------------------------------- palops -- */
{c:'palops',t:'A palette preview page',g:'palview',n:['matramp'],d:'Every material, every cover kind, every landform, every ramp, with its stops, its provenance tag and its current data range. Generated from the tables. It is the fastest way to see that a ramp is saturating, which is how the ocean ramp went unnoticed for the life of the project.',k:'PROVE',e:'M',i:3},
{c:'palops',t:'Diff two palettes',n:['palview'],d:'A change to a shared ramp affects many worlds. Showing which, and by how much, is what makes a palette edit reviewable rather than terrifying.',k:'PROVE',e:'M',i:3},
{c:'palops',t:'Contrast check between adjacent categories',n:['palview'],d:'Two materials with similar colours are indistinguishable at orbital scale; two with wildly different ones make a boundary look painted. Compute ΔE between every adjacent pair.',k:'PROVE',e:'M',i:3},
{c:'palops',t:'Colour-blind safe variants',n:['palview'],d:'The land–sea distinction and the vegetation ramp both lean on red–green separation. Once ramps are data, an alternative palette is a setting rather than a rewrite.',k:'DRAW',e:'M',i:2},
{c:'palops',t:'Edit a ramp live',n:['palview'],d:'Change a stop and see the globe change. It is the tool that makes art direction possible for somebody who is not going to edit JSON and rebuild.',k:'PLAY',e:'M',i:2},
{c:'palops',t:'Palette entropy per world',g:'palentropy',n:['palview'],d:'How many distinct colours a world actually uses. A world drawing three colours is flat; one drawing thousands is noise. It is one of the four metrics construct 19 asks for and it is computable from a render.',k:'PROVE',e:'M',i:3},
{c:'palops',t:'A palette should be exportable',n:['palview'],d:'Somebody who wants to make art from a world wants its colours. It is a small, generous feature and it makes the palette work visible outside the app.',k:'DRAW',e:'S',i:1},
{c:'palops',t:'Version and freeze the shipped palettes',n:['palview'],d:'A screenshot in the README is a claim about a palette. When the palette changes the screenshot is stale, and nothing currently connects them.',k:'PROVE',e:'M',i:2},
{c:'palops',t:'Which ramp painted this pixel',n:['palview'],d:'A debug mode that names the ramp under the cursor. Half the palette faults in this document are invisible until somebody can attribute a colour.',k:'PROVE',e:'M',i:3},
{c:'palops',t:'Find unused ramps',n:['palview','onebuild'],d:'A ramp no world selects is either dead or a missing rule. The compiler already walks the tables.',k:'PROVE',e:'S',i:2},
{c:'palops',t:'Find worlds sharing a palette',n:['palview'],d:'This is the Io problem in colour form. If eleven ice moons all draw the same ramp, the palette is doing no work and nobody can tell them apart.',k:'PROVE',e:'M',i:3},
{c:'palops',t:'A palette budget per world',n:['palentropy'],d:'State how many distinct ramps a world should use. Too few and it is flat; too many and it is incoherent. It is an art-direction decision that can be checked.',k:'PROVE',e:'M',i:2},
{c:'palops',t:'Ramps in the legend',n:['palview'],d:'The KEY panel lists surface categories with swatches from code. Driving it from the same data as the surface guarantees the legend cannot lie.',k:'DRAW',e:'M',i:3},
{c:'palops',t:'Palette in the world card',n:['palview'],d:'Five swatches and a provenance mix. It is the thumbnail of a palette and it makes 120 worlds comparable at a glance.',k:'DRAW',e:'M',i:3},
{c:'palops',t:'Let a player reskin a world',n:['palview'],d:'The god layer changes physics. Changing the look — and having the app say which parts are now invented — is a different kind of authorship and a natural sharing surface.',k:'PLAY',e:'M',i:1},
{c:'palops',t:'Keep the ramp count small',n:['palview'],d:'The temptation once ramps are data is one per world. The measure of the system working is that 120 worlds draw from far fewer than 120 palettes.',k:'PROVE',e:'M',i:3},
{c:'palops',t:'Document why a palette is what it is',n:['palview'],d:'`substrates.json` carries a `why` per material and it is the best thing about the file. Ramps need the same, because a colour choice without a reason cannot be argued with.',k:'PROVE',e:'S',i:3},
{c:'palops',t:'Palette review as part of adding a world',n:['palview','contact'],d:'A new world\'s palette should be shown against its nearest neighbours before it is merged. That is the review that stops the catalogue converging on one look.',k:'PROVE',e:'M',i:3},
{c:'palops',t:'Regression on palette, not just on pixels',n:['palentropy'],d:'A change that shifts every world slightly is fine. One that collapses two worlds onto the same palette is a bug, and only a pairwise measure sees it.',k:'PROVE',e:'M',i:3},
{c:'palops',t:'The palette is the product',n:['palview'],d:'Most people will see this project as a set of images. The palette is the largest single determinant of whether those images are worth looking at, and it currently lives in 154 unnamed triples.',k:'DRAW',e:'S',i:3},
];

const P4 = [
/* --------------------------------------------------------------- pixel -- */
{c:'pixel',t:'Nothing in the test suite renders anything',g:'headlessgl',d:'`pictureStats` measures fields — height, temperature, precipitation, life, moisture — and is good work. `readPixels`, `toDataURL` and any headless GL context appear nowhere in `vr/sim/test.mjs`. `capture-site.mjs` drives Playwright and screenshots four *site pages*, not worlds. So the realism backlog\'s finding stands: the picture has never been measured, only the data behind it.',k:'PROVE',e:'L',i:3},
{c:'pixel',t:'Pick the rendering path and commit to it',n:['headlessgl'],d:'Three options: a headless GL context in Node, Playwright driving the real app, or a CPU reimplementation of the shader. The first is fastest and fragile, the second is honest and slow, the third drifts from what ships. `capture-site.mjs` already proves the second works here.',k:'PROVE',e:'M',i:3},
{c:'pixel',t:'Render one world, save one PNG, assert one number',n:['headlessgl'],d:'The smallest possible version, landed end to end, before any of the metrics below. Every ambitious testing plan in this project has been blocked on not having this.',k:'PROVE',e:'M',i:3},
{c:'pixel',t:'Determinism of a rendered frame',n:['headlessgl'],d:'The surface pass found `refreshColours` reading `performance.now()` for the stroke fade, so a frame was not a pure function of world state. A render test needs a fixed clock, a fixed camera and a fixed sun.',k:'PROVE',e:'M',i:3},
{c:'pixel',t:'A fixed camera rig per world',n:['headlessgl'],d:'Same distance, same sun angle, same up vector, or every comparison is measuring the camera. It is also the thing art direction wants for a hero shot.',k:'PROVE',e:'S',i:3},
{c:'pixel',t:'GPU output varies across drivers',n:['headlessgl'],d:'Byte-exact comparison will fail on somebody else\'s machine. A perceptual metric with a stated tolerance is the difference between a test that guards the picture and one everybody learns to skip.',k:'PROVE',e:'M',i:3},
{c:'pixel',t:'Render at a small size',n:['headlessgl'],d:'256×256 is enough for every metric in the next category and it makes 120 worlds affordable. Hero shots are a separate, rarer job.',k:'PROVE',e:'S',i:3},
{c:'pixel',t:'Keep the CPU field stats',n:['headlessgl'],d:'`surfaceStats` is fast, deterministic and driver-independent. Pixels are the ground truth; fields are the cheap check that runs on every commit. Both, not one.',k:'PROVE',e:'S',i:3},
{c:'pixel',t:'Render the flat map too',n:['headlessgl'],d:'The product\'s pitch is two views at once. The local map has its own colour path in `localview.js` and its own chance to disagree with the globe.',k:'PROVE',e:'M',i:3},
{c:'pixel',t:'Render the overlays',n:['headlessgl'],d:'Twenty overlay modes, each a full-globe repaint. The surface pass fixed the wash and the stencil; nothing checks the other nineteen.',k:'PROVE',e:'M',i:3},
{c:'pixel',t:'Render at two resolutions',n:['headlessgl'],d:'Almost every artefact in the surface backlog scales with N. A seam at N=32 and one at N=192 look different and one of them may be the only one anybody notices.',k:'PROVE',e:'M',i:2},
{c:'pixel',t:'Render at two zoom rungs',n:['headlessgl'],d:'The zoom contract says the same world at different scales should be the same world. A test that renders orbital and regional and compares low-frequency content is what enforces it.',k:'PROVE',e:'M',i:3},
{c:'pixel',t:'A no-ink render mode',n:['headlessgl'],d:'The surface pass asked for a screenshot key that strips every overlay and HUD. The test harness needs the same switch and it is the same code.',k:'DRAW',e:'S',i:3},
{c:'pixel',t:'Store the reference images somewhere sane',n:['headlessgl'],d:'One hundred and twenty PNGs regenerated on every change will make the repository unpleasant. Low resolution, lossy, and a stated policy on when they are regenerated.',k:'PROVE',e:'M',i:2},
{c:'pixel',t:'Fail with the image, not just the number',n:['headlessgl'],d:'A failing render test should write the actual, the expected and the difference. Otherwise the first thing anybody does is reproduce it by hand.',k:'PROVE',e:'M',i:3},
{c:'pixel',t:'Time budget for the render suite',n:['headlessgl'],d:'One hundred and twenty worlds at two rungs is 240 renders. If that is ten minutes it runs nightly; if it is thirty seconds it runs on every commit. Measure before designing the cadence.',k:'PROVE',e:'M',i:3},
{c:'pixel',t:'Run it in CI',n:['headlessgl'],d:'A render test on the author\'s machine is a screenshot habit. On a machine that is not theirs it is a guard.',k:'PROVE',e:'M',i:3},
{c:'pixel',t:'The WebGL path must be optional',n:['headlessgl'],d:'The existing suites run anywhere with Node. Do not make `npm test` require a GPU; make the render suite a separate command that CI runs.',k:'PROVE',e:'S',i:3},
{c:'pixel',t:'A render is also an artefact for humans',n:['headlessgl','contact'],d:'The same harness that measures produces the contact sheet, the README images and the world cards. Building it once for tests pays three times.',k:'PROVE',e:'M',i:3},
{c:'pixel',t:'Say in the limits document that the picture is untested',n:['headlessgl'],d:'Until this lands it is the largest known gap in the project\'s verification, and `briefs/model-limits.md` is where the known gaps are supposed to live.',k:'PROVE',e:'S',i:3},

/* ------------------------------------------------------------- metrics -- */
{c:'metrics',t:'Axis-aligned edge runs',g:'edgemetric',n:['headlessgl'],d:'Count pixels lying on a straight horizontal or vertical run longer than a threshold. It targets the cube-seam class directly, it goes to zero as those fixes land, and nature almost never produces a straight line at planetary scale — which is why it is a good detector.',k:'PROVE',e:'M',i:3},
{c:'metrics',t:'A contour-step histogram',n:['headlessgl'],d:'Distribution of neighbour-pixel ΔE. A hard classification produces long thin connected runs at a characteristic contrast, which is a signature you can detect rather than a thing you have to notice.',k:'PROVE',e:'M',i:3},
{c:'metrics',t:'Per-face discontinuity, in pixels',n:['edgemetric'],d:'`pictureStats.heightSeam` measures this on the *field* and the assertion passes. The rendered version measures whether the shader, the atlas and the mesh agree — which is where the surface pass found two separate bugs.',k:'PROVE',e:'M',i:3},
{c:'metrics',t:'Palette entropy',n:['palentropy','headlessgl'],d:'Distinct colours in a rendered frame, and their distribution. Too few is flat, too many is noise, and the number distinguishes a world that is drawing detail from one that is drawing dither.',k:'PROVE',e:'M',i:3},
{c:'metrics',t:'Luminance histogram and clipping',n:['headlessgl'],d:'The realism pass found the atmosphere shell clipping the sunward limb to flat white. Counting clipped pixels is a one-line detector for the whole class of tonemapping faults.',k:'PROVE',e:'S',i:3},
{c:'metrics',t:'Dominant hue and saturation',n:['headlessgl'],d:'The single number that says Mars is red and Europa is not. It is also the number that would have shown 40 worlds converging on Io.',k:'PROVE',e:'S',i:3},
{c:'metrics',t:'The limb profile',n:['headlessgl'],d:'A radial slice through the edge of the disc. Hard means airless, soft means atmosphere, layered means haze. It is one of the two edges that survive a thumbnail and it is a one-dimensional signal.',k:'PROVE',e:'M',i:3},
{c:'metrics',t:'Spatial frequency spectrum',n:['headlessgl'],d:'A radially averaged power spectrum says whether a world has detail at every scale or only at the cell size. It is the direct measure of whether the detail synthesis is doing anything.',k:'PROVE',e:'M',i:2},
{c:'metrics',t:'Pairwise perceptual distance between worlds',g:'pairdist',n:['headlessgl'],d:'The Io detector. Compute the distance between every pair of world renders; pairs below a threshold that are not physically justified are the bug. This is the metric this whole programme has needed from the start.',k:'PROVE',e:'M',i:3},
{c:'metrics',t:'Coastline staircase, in pixels',n:['headlessgl'],d:'`pictureStats.staircase` measures cell-level runs and sits at 0.771, which is expected until sub-cell coverage lands. The pixel version measures what the player sees, which is the number that should actually fall.',k:'PROVE',e:'M',i:3},
{c:'metrics',t:'Terminator gradient',n:['headlessgl'],d:'How smoothly the day side becomes the night side. Banding there is the most visible quantisation artefact on any render and it is a one-dimensional profile.',k:'PROVE',e:'M',i:2},
{c:'metrics',t:'Overlay ink budget, measured',n:['headlessgl'],d:'The surface pass specified a budget: no overlay may move more than a stated fraction of pixels by more than a stated ΔE. Diff each overlay render against the no-ink render.',k:'PROVE',e:'M',i:3},
{c:'metrics',t:'Every metric needs a direction and a target',n:['edgemetric'],d:'A number with no stated direction is a fact, not a guard. Each metric gets: what it detects, which way is better, the current value, and the budget.',k:'PROVE',e:'S',i:3},
{c:'metrics',t:'Metrics must be cheap enough to run on all of them',n:['edgemetric'],d:'Twelve metrics over 240 renders. Anything requiring a full-image transform per metric should share one pass over the pixels.',k:'PROVE',e:'M',i:2},
{c:'metrics',t:'Do not over-fit to the metric',n:['edgemetric'],d:'A world can score well on all twelve and look wrong. The contact sheet is the check on the metrics, which is why construct 20 and construct 19 belong in the same document.',k:'PROVE',e:'S',i:3},
{c:'metrics',t:'Compare against a photograph, not only against yesterday',n:['spectrum','headlessgl'],d:'A regression suite measures drift from your own last answer. For twelve Solar System bodies there is an external answer and it is the only one that can say the picture is wrong rather than different.',k:'PROVE',e:'M',i:3},
{c:'metrics',t:'Report per world, not aggregated',n:['edgemetric'],d:'A mean over 120 worlds hides the one that broke. The output is a table with a row per world and a column per metric.',k:'PROVE',e:'S',i:3},
{c:'metrics',t:'Metrics for the flat map',n:['headlessgl'],d:'Stamp density, colour agreement with the globe for the same cells, and whether anything moves between frames — the living backlog measured that the flat map draws the identical image every frame.',k:'PROVE',e:'M',i:3},
{c:'metrics',t:'A single headline number',n:['edgemetric'],d:'One score per world, from the twelve, so a change can be summarised in a sentence. It is how anybody will actually consume this.',k:'PROVE',e:'M',i:2},
{c:'metrics',t:'Publish the metrics with the site',n:['edgemetric'],d:'The backlogs are published as pages. The picture\'s numbers, per world, per release, is the same kind of artefact and it makes the claim checkable by a stranger.',k:'PROVE',e:'M',i:2},

/* --------------------------------------------------------------- fleet -- */
{c:'fleet',t:'One world is measured; there are a hundred and twenty',g:'fleetrun',n:['headlessgl'],d:'`pictureStats(Wcont)` runs on a single continental test world with 14 assertions on it. That is 0.8% of the catalogue. The fault this whole programme exists to catch — 40 worlds resolving to Io — is invisible at that sample size, and it went unnoticed for months.',k:'PROVE',e:'M',i:3},
{c:'fleet',t:'Generate every catalogue body headlessly',n:['fleetrun'],d:'`auditCatalogueKinds` already walks all 120 through `rulesetFromCatalogue`. Extend it to generate each at N=32 and record whether it completes without throwing — several probably do not, and nobody knows which.',k:'PROVE',e:'M',i:3},
{c:'fleet',t:'A world that fails to generate is a bug nobody sees',n:['fleetrun'],d:'The catalogue has free-floating planets, disintegrating worlds, magma oceans and bodies that are not round. `isNonHydrostatic` exists. Which of the 120 actually run is a fact nobody currently has.',k:'PROVE',e:'M',i:3},
{c:'fleet',t:'Cover the seven categories deliberately',n:['fleetrun'],d:'sol 12, moons 15, temperate 29, furnace 17, giant 21, arch 10, dark 16. A sample that misses giants misses the case where the engine has no heightfield at all.',k:'PROVE',e:'S',i:3},
{c:'fleet',t:'Include the invented rulesets',n:['fleetrun'],d:'Vermis, Selene, Ares and Daisyworld are what most players see first and they are not in the catalogue. The reset test I added covers them; the picture tests do not.',k:'PROVE',e:'S',i:3},
{c:'fleet',t:'Include epochs',n:['fleetrun'],d:'Five era presets on Earth. An Archean render and a Holocene render are different pictures of the same body and both should be measured.',k:'PROVE',e:'M',i:2},
{c:'fleet',t:'Fixed seeds per world',n:['fleetrun'],d:'One seed per body, committed, so a change in the picture is a change in the code rather than a different roll. The landscape pass learned this with openings.',k:'PROVE',e:'S',i:3},
{c:'fleet',t:'Run the fleet at a fixed age',n:['fleetrun'],d:'A world at t=0 and one after a hundred ticks look different. Pick one, state it, and make it the same for every body.',k:'PROVE',e:'S',i:3},
{c:'fleet',t:'A fleet run is a data set',n:['fleetrun'],d:'One hundred and twenty rows of twelve metrics. That is a table you can sort, cluster and plot — and clustering it is how you find the worlds that share a look.',k:'PROVE',e:'M',i:3},
{c:'fleet',t:'Cluster the fleet by appearance',n:['fleetrun','pairdist'],d:'Compare the clusters against the physical taxonomy from `worldAxes`. Where two worlds are physically distant and visually identical, the appearance path is not reading the physics.',k:'PROVE',e:'M',i:3},
{c:'fleet',t:'Find the worlds nobody has looked at',n:['fleetrun'],d:'Of 120 bodies, a handful have ever been opened. The fleet run is the first time anybody sees the rest, and that alone is worth building it.',k:'PROVE',e:'M',i:3},
{c:'fleet',t:'Rank worlds by how wrong they look',n:['fleetrun'],d:'Sort by metric violations and fix from the top. It converts a vague sense that the catalogue is uneven into a work list.',k:'PROVE',e:'M',i:3},
{c:'fleet',t:'Fleet run cost and cadence',n:['fleetrun'],d:'One hundred and twenty generates plus renders. If it is minutes it runs nightly; if it is an hour it runs on release. Measure, then decide, rather than the reverse.',k:'PROVE',e:'M',i:3},
{c:'fleet',t:'Incremental fleet runs',n:['fleetrun'],d:'A change to Titan\'s definition should re-measure Titan and whatever shares its ramps. Full runs on demand, targeted runs on commit.',k:'PROVE',e:'M',i:2},
{c:'fleet',t:'The fleet run should also check the sim, not just the picture',n:['fleetrun'],d:'Does every world conserve water, stay inside its temperature bounds, and avoid NaN. Twelve metrics of appearance and half a dozen of physical sanity, from the same pass.',k:'PROVE',e:'M',i:3},
{c:'fleet',t:'Timing per world',n:['fleetrun'],d:'A world that takes ten times longer than its neighbours is doing something wrong. The fleet run is the only place that shows up.',k:'PROVE',e:'S',i:2},
{c:'fleet',t:'Memory per world',n:['fleetrun','stackbudget'],d:'Especially once the stack lands. An ice giant with a deep column and an ocean world with a deep ocean are the two expensive cases.',k:'PROVE',e:'M',i:2},
{c:'fleet',t:'Keep the fleet result in the repository',n:['fleetrun'],d:'A committed table means a diff. It is the same discipline as `kinds.json`, which is what keeps the Io result from returning.',k:'PROVE',e:'S',i:3},
{c:'fleet',t:'Publish the fleet table',n:['fleetrun'],d:'One hundred and twenty worlds with their axes, their kind, their metrics and their thumbnail. That page is genuinely novel content and it is a by-product of the tests.',k:'DRAW',e:'M',i:3},
{c:'fleet',t:'A fleet run is the acceptance test for this whole programme',n:['fleetrun'],d:'Five backlogs have argued that the catalogue is a set of recolours. The fleet run is what turns that argument into a number and eventually into a refutation.',k:'PROVE',e:'M',i:3},

/* --------------------------------------------------------------- guard -- */
{c:'guard',t:'Commit the baselines',g:'baseline',n:['fleetrun'],d:'Every metric, every world, committed as a table. Without a baseline a measurement is a reading; with one it is a guard. `kinds.json` already proves the pattern works in this repository.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'A budget per metric, not an exact value',n:['baseline'],d:'Rendered output moves slightly for legitimate reasons. A budget with a stated tolerance fails on regressions and tolerates noise, which is the only way a picture test survives contact with a second machine.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'Fail with the world name and the metric',n:['baseline'],d:'"Europa: axis-aligned runs 0.02 → 0.31" is actionable. "picture test failed" is not, and the difference decides whether the suite gets maintained.',k:'PROVE',e:'S',i:3},
{c:'guard',t:'Ratchet the budgets down',n:['baseline'],d:'When a metric improves, tighten it. It is what stops a fix from silently eroding, and it converts the backlog into a monotone process.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'A deliberate change should be easy to accept',n:['baseline'],d:'An art-direction change moves every number. Regenerating baselines must be one command with a reviewable diff, or people will disable the test instead.',k:'PROVE',e:'S',i:3},
{c:'guard',t:'Separate "different" from "worse"',n:['baseline'],d:'Most metric changes are neutral. The suite needs to distinguish a drift from a violation, or it cries wolf and stops being read.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'Track the numbers over releases',n:['baseline'],d:'A time series per metric. The surface backlog is 400 claims about numbers that should move; this is where anyone can check whether they did.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'Guard the field stats too',n:['baseline'],d:'`pictureStats` has 14 assertions on one world with hand-picked thresholds. Baselined across the fleet, the same code becomes a real guard rather than eight sanity checks.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'Guard the data layer',n:['baseline','dataratio'],d:'Rows per table, coverage per body, override count, provenance mix, data-to-code ratio. All computable, all currently unwatched, and all in this document as targets.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'Guard determinism across the fleet',n:['fleetrun'],d:'The golden run covers one world. Generating each of 120 twice and comparing is the fleet-scale version, and it is how the vent leak would have been caught the day it landed.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'A nightly job, and a fast subset',n:['baseline'],d:'Twelve worlds on every commit, 120 nightly. The fast subset should be chosen to span the categories, not to be the first twelve.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'Report to somewhere people look',n:['baseline'],d:'A generated page with the contact sheet, the metric table and the deltas since last release. The project already publishes fifteen generated pages; this is the sixteenth and the most operational.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'Do not let the guard become the goal',n:['baseline'],d:'Every metric here is a proxy. The moment a change is made to move a number rather than to improve a picture, the suite has started doing harm.',k:'PROVE',e:'S',i:3},
{c:'guard',t:'Test the tests',n:['baseline'],d:'Inject a known artefact — a face seam, a flattened palette, a clipped highlight — and assert the detector catches it. A detector nobody has proven can detect anything is decoration.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'Record what each metric caught',n:['baseline'],d:'Over a year, which detectors earned their keep. It is how the suite gets pruned rather than accumulating forever.',k:'PROVE',e:'S',i:2},
{c:'guard',t:'Keep the whole suite runnable offline',n:['baseline'],d:'Every probe in this project runs from the repository with no network. The render suite should keep that property, which rules out fetching reference imagery at test time.',k:'PROVE',e:'S',i:3},
{c:'guard',t:'A single command for the picture',n:['baseline'],d:'`npm run picture` — render the fleet, compute the metrics, diff the baselines, write the contact sheet, print the table. The review surface for constructs 19 and 20 together.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'Write the acceptance criteria down',n:['baseline'],d:'What must be true for the picture to ship. Nothing in this project currently states that, which is why every rendering change is a matter of taste and memory.',k:'PROVE',e:'M',i:3},
{c:'guard',t:'Guard the guards\' cost',n:['baseline'],d:'A test suite that takes an hour gets skipped. Track its runtime as one of the metrics.',k:'PROVE',e:'S',i:2},
{c:'guard',t:'The realism backlog\'s finding, closed',n:['baseline','fleetrun'],d:'"The picture has never been measured" has been true through five backlogs. Baselines across the fleet is the sentence that ends it, and nothing smaller does.',k:'PROVE',e:'M',i:3},
];

const P5 = [
/* ----------------------------------------------------------- direction -- */
{c:'direction',t:'Art direction is two lambdas',g:'artdir',d:'`applyPlanetLook(rule)` sets exactly `rule.land` and `rule.ocean` — two functions from the 30-entry PAINT table. That is the whole of a world\'s art direction. Lighting, exposure, sky, limb, haze, detail grammar, sound, named features and the camera that introduces it are decided elsewhere by code that does not know which world it is drawing.',k:'DRAW',e:'L',i:3},
{c:'direction',t:'One object per world type, decided together',n:['artdir'],d:'Palette, illumination, atmosphere, limb, detail grammar, soundscape, named features, hero camera. The argument for a single object is that these are not independent: a hard limb, a black sky and high-contrast regolith are one decision about an airless world, made three times today in three files.',k:'DRAW',e:'L',i:3},
{c:'direction',t:'Art direction belongs in the world definition',n:['artdir','worldrec'],d:'It is the part of construct 16 that was explicitly left out — the worldspace pass\'s own note says "Look is still code". This is where the two constructs meet and it is the largest single block of code left to move.',k:'DRAW',e:'M',i:3},
{c:'direction',t:'Direction by class, override by body',n:['artdir'],d:'Airless rock, icy moon, ocean world, lava world, gas giant, ice dwarf. Eight or ten classes with per-body overrides, not 120 art directions — the same inheritance argument that keeps the data table small.',k:'DRAW',e:'M',i:3},
{c:'direction',t:'A world should read at thumbnail size',n:['artdir','contact'],d:'The stated test from the worldspace pass: could somebody who knows the Solar System name the body from one frame. Art direction is the discipline that makes that true and the contact sheet is how it is judged.',k:'DRAW',e:'M',i:3},
{c:'direction',t:'Direction has to survive the god layer',n:['artdir'],d:'A player who terraforms Mars should get a Mars that has been terraformed, not a generic green world. That means direction is a function of state, not a skin applied at generate.',k:'PLAY',e:'M',i:2},
{c:'direction',t:'Direction has to survive an epoch change',n:['artdir'],d:'Archean Earth and Holocene Earth are the same body and different pictures. If direction is keyed on kind alone it cannot express that, and the worldspace pass wants epochs to be worlds.',k:'DRAW',e:'M',i:3},
{c:'direction',t:'Say what a world is meant to feel like',n:['artdir'],d:'One sentence per class, in the data, next to the numbers. "Old, still, high-contrast, no air" is a direction; a palette is its consequence. Without the sentence the numbers drift and nobody can say why they are wrong.',k:'PROVE',e:'S',i:3},
{c:'direction',t:'The unknown world needs a direction too',n:['artdir'],d:'Ninety-four exoplanets whose appearance is entirely extrapolated. "Provisional" is a legitimate art direction — desaturated, softly lit, deliberately unresolved — and it is more honest than confident invention.',k:'DRAW',e:'M',i:3},
{c:'direction',t:'Avoid the uniform-grey failure',n:['artdir'],d:'Half the Solar System is grey rock or dirty ice and the temptation is one grey. The measured albedo differences between Callisto, Ganymede, the Moon and Mercury are larger than they look and they are published.',k:'DRAW',e:'M',i:2},
{c:'direction',t:'Direction should name its references',n:['artdir'],d:'Which photograph, which mission, which processing. It is the provenance discipline applied to look rather than to physics, and it is what lets a second person continue the work.',k:'PROVE',e:'M',i:3},
{c:'direction',t:'A hero camera per world',n:['artdir','headlessgl'],d:'The angle, distance and sun position that show a world at its best. It is what the picker uses, what the contact sheet uses, and what the render test fixes so comparisons mean something.',k:'DRAW',e:'M',i:3},
{c:'direction',t:'The first frame is the product',n:['artdir'],d:'The landscape pass made the opening world a choice and the worldspace pass restated it. Which frame of which world you see first is an art-direction decision currently made by a default camera.',k:'DRAW',e:'M',i:3},
{c:'direction',t:'Direction across zoom rungs',n:['artdir'],d:'A world must stay itself from orbital thumbnail to the ground. The detail grammar is the part of direction that operates below the cell and it is currently shared by every world.',k:'DRAW',e:'M',i:3},
{c:'direction',t:'Two worlds should be comparable on purpose',n:['artdir','pairdist'],d:'Europa and Enceladus are both bright ice moons and should look related and distinguishable. That is a decision about a pair, which is why direction cannot be made 120 times in isolation.',k:'DRAW',e:'M',i:3},
{c:'direction',t:'Direction is where the physics gets a vote',n:['artdir'],d:'The temptation is to art-direct toward the reference photograph and quietly override the model. Where they disagree, the honest move is to say so — the picture is a claim about the model.',k:'PROVE',e:'M',i:3},
{c:'direction',t:'A style guide for the whole catalogue',n:['artdir'],d:'What this project\'s planets look like: how saturated, how contrasty, how much detail, how the limb reads. A per-world direction without a house style produces 120 unrelated pictures.',k:'DRAW',e:'M',i:3},
{c:'direction',t:'Let direction be edited live',n:['artdir','palview'],d:'The palette editor extended to the whole direction object. It is the difference between art direction as a code change and art direction as a craft.',k:'PLAY',e:'M',i:2},
{c:'direction',t:'Direction should be diffable and reviewable',n:['artdir'],d:'As data with a thumbnail, a change to Titan\'s look is a pull request with a picture in it. As 37 lambdas it is a diff of `lerp` constants.',k:'PROVE',e:'M',i:3},
{c:'direction',t:'The success condition',n:['artdir'],d:'A world\'s entire look is data, a new world needs no code, and the contact sheet shows 120 distinguishable places. Everything else in this category is a step toward that sentence.',k:'PROVE',e:'S',i:3},

/* ---------------------------------------------------------------- look -- */
{c:'look',t:'Exposure and tonemap per world',n:['illum','artdir'],d:'Mercury at 6.7 solar constants and Pluto at 0.001 share a curve today. It is the single largest reason a distant world does not read as distant, and the realism pass built the eye-adaptation machinery it needs.',k:'DRAW',e:'M',i:3},
{c:'look',t:'The limb is the world\'s signature',n:['artdir'],d:'Hard means airless, soft blue means thin, layered orange means Titan. The realism pass identified the limb as one of two edges surviving a thumbnail and it is drawn by one shared shell.',k:'DRAW',e:'M',i:3},
{c:'look',t:'Haze in layers',n:['artdir'],d:'Pluto\'s haze is layered to 200 km and the backlit images are among the most beautiful planetary photographs there are. It is a stack of thin shells and it is cheap.',k:'DRAW',e:'M',i:3},
{c:'look',t:'Atmosphere thickness should be visible',n:['artdir'],d:'`scaleHeightKm` is implemented. A puffy hydrogen envelope on a low-gravity world and a thin cold one look completely different at the limb and the number already exists.',k:'DRAW',e:'M',i:3},
{c:'look',t:'The sky as seen from the ground',n:['illum'],d:'Rayleigh blue, Mars butterscotch with a blue sunset, Titan orange gloom, Venus a dim yellow-grey. It is half of what a place feels like from the ground and the local view has never shown a sky.',k:'DRAW',e:'M',i:3},
{c:'look',t:'A sky with something in it',n:['artdir'],d:'Europa with Jupiter filling a third of the sky; a binary with two suns; a rogue world with nothing. `MOON_PARENTS` knows the geometry and nothing draws it.',k:'DRAW',e:'M',i:3},
{c:'look',t:'Rings, and their shadow',n:['artdir'],d:'Saturn is in the catalogue. The rings are the most recognisable structure in the Solar System, they are a Roche-limit consequence, and their shadow band on the cloud tops moves with the season.',k:'DRAW',e:'M',i:3},
{c:'look',t:'Aurorae where there is a field',n:['artdir'],d:'`magnetosphere` exists on the ruleset. Jupiter\'s aurorae are powered by Io\'s plasma torus rather than the solar wind, which is a nice example of a look that is a physical argument.',k:'DRAW',e:'M',i:2},
{c:'look',t:'Night side content',n:['illum'],d:'Lava glow, lightning, aurorae, bioluminescence, city lights. Five emissive sources, four of which exist as fields, and the night side is currently the day side at low brightness.',k:'DRAW',e:'M',i:3},
{c:'look',t:'Detail grammar per substrate',n:['artdir'],d:'Sand ripples, lava ropes, ice crevasses, karst fluting, tundra polygons, regolith mottle. The surface backlog\'s `detailfield` is the mechanism; which grain a world uses is art direction.',k:'DRAW',e:'M',i:3},
{c:'look',t:'Cloud character, not just coverage',n:['artdir'],d:'Earth\'s cloud is structured by fronts and the ITCZ; Venus is a smooth deck; a giant is banded. Same field, three completely different looks.',k:'DRAW',e:'M',i:3},
{c:'look',t:'Specular as a material statement',n:['illum'],d:'The glint off Titan\'s lakes is how they were confirmed. A specular return says "liquid" more clearly than any colour, and the ocean already has a GGX lobe nothing else does.',k:'DRAW',e:'M',i:2},
{c:'look',t:'Shadow length and terrain relief',n:['artdir'],d:'Low sun throws long shadows and that is when terrain reads. The exaggeration is per-ruleset — Earth 0.028, others 0.05 — and it is an art-direction constant hiding in the physics.',k:'DRAW',e:'M',i:3},
{c:'look',t:'A world seen from its own surface',n:['artdir'],d:'The pitch is "hold a planet, shrink, walk in". What you see when you get there — the sky, the ground, the light, the horizon distance — is a per-world direction that has never been made.',k:'DRAW',e:'L',i:3},
{c:'look',t:'Horizon distance is a giveaway',n:['artdir'],d:'On a small moon the horizon is a few kilometres away and visibly curved. It is one of the strongest cues to scale and it follows from the radius.',k:'DRAW',e:'M',i:2},
{c:'look',t:'Motion is part of the look',n:['artdir'],d:'A fast rotator, a locked world, a wobbling moon. How a world moves under the camera is direction and it is currently one rotation speed.',k:'DRAW',e:'M',i:2},
{c:'look',t:'The picker thumbnail is a different crop',n:['artdir','contact'],d:'A thumbnail is not a small hero shot; it needs more contrast and a tighter crop. The landscape pass built a nine-globe picker and it is where this is judged.',k:'DRAW',e:'M',i:2},
{c:'look',t:'Do not let one shader own every world',n:['artdir'],d:'The surface path is shared and that is right for correctness. Direction has to be able to change what it does per world without forking it, which means uniforms and data rather than branches.',k:'DRAW',e:'M',i:3},
{c:'look',t:'Look budget per world',n:['artdir'],d:'Haze layers, cloud shells, emissive passes and detail octaves all cost. A world with rings and aurorae and layered haze is more expensive than a bare rock, and the budget should be stated per class.',k:'PROVE',e:'M',i:2},
{c:'look',t:'Assert the look responds to the physics',n:['artdir','headlessgl'],d:'Halve the insolation and the render should get dimmer and redder. Remove the atmosphere and the limb should harden. Two assertions that prove direction is wired to the model rather than painted on.',k:'PROVE',e:'M',i:3},

/* --------------------------------------------------------------- place -- */
{c:'place',t:'Named features, per world',g:'placenames',d:'`W._plateNames` names plates and nothing names a landform. Sputnik Planitia, Caloris, Valles Marineris, the tiger stripes, the Great Red Spot — these are the reason anyone recognises a body, they are published for every Solar System world, and they are absent.',k:'DRAW',e:'M',i:3},
{c:'place',t:'Generated names for generated worlds',n:['placenames'],d:'The seed-word system names worlds and the life pass names clades. A named continent, range, sea or crater is what turns a heightfield into a place somebody can talk about.',k:'DRAW',e:'M',i:3},
{c:'place',t:'A place worth flying to',n:['placenames','artdir'],d:'Each world gets one signature feature, placed, named and findable, which also gives the camera a destination and the picker a subject.',k:'DRAW',e:'M',i:3},
{c:'place',t:'Naming conventions per world',n:['placenames'],d:'The IAU has themed nomenclature per body — Pluto\'s features are named for explorers of the underworld. Copying the *convention* rather than the names is what makes generated names feel deliberate.',k:'DRAW',e:'M',i:2},
{c:'place',t:'Labels that survive a zoom',n:['placenames'],d:'A name at orbital scale, a name at regional scale, a name on the ground. Which names appear at which rung is a cartography problem with a well-known answer.',k:'DRAW',e:'M',i:2},
{c:'place',t:'Sound per world',g:'worldsound',d:'`audio.js` layers a soundscape and it is Earth\'s everywhere. Wind needs an atmosphere; an airless world is silent; a dense atmosphere carries low frequencies further. It is a strong identity cue and almost nothing uses it.',k:'DRAW',e:'M',i:2},
{c:'place',t:'Silence is a legitimate soundscape',n:['worldsound'],d:'On the Moon there is nothing to carry sound. Doing that honestly — and letting the interface say why — is more effective than inventing ambience.',k:'DRAW',e:'S',i:2},
{c:'place',t:'Sound from the material',n:['worldsound'],d:'Regolith, ice, sand and rock sound different underfoot. The substrate field already knows which, and the local view is where a footstep would be.',k:'DRAW',e:'M',i:1},
{c:'place',t:'Sound from the processes',n:['worldsound'],d:'A geyser field, a lava lake, a storm, a river. The events exist in the chronicle and none of them makes a noise.',k:'DRAW',e:'M',i:2},
{c:'place',t:'A world description worth reading',n:['placenames'],d:'The catalogue already carries good prose per body. What is missing is the generated half — what this run of this world actually became — which the life and worldspace passes both produce material for.',k:'DRAW',e:'M',i:3},
{c:'place',t:'A world card',n:['placenames','contact'],d:'Thumbnail, seven axes, signature feature, palette swatches, provenance mix, one sentence. It is the artefact somebody shares and every field on it exists or is in this document.',k:'DRAW',e:'M',i:3},
{c:'place',t:'The chronicle should name the place',n:['placenames'],d:'"A flood basalt covered the northern plain" is a sentence; "volcanism event at cell 14822" is a log line. Names are what make the chronicle narrative rather than telemetry.',k:'DRAW',e:'M',i:3},
{c:'place',t:'Places should persist across a save',n:['placenames'],d:'A named feature a player has visited must survive a reload, or naming is decoration. The save format has grown to hold terrain and genomes; names are small.',k:'MODEL',e:'S',i:3},
{c:'place',t:'Let a player name something',n:['placenames'],d:'A player who names a mountain remembers it. It costs almost nothing and it is one of the strongest attachment mechanisms a world simulator has.',k:'PLAY',e:'S',i:3},
{c:'place',t:'A place needs a scale cue',n:['placenames'],d:'Valles Marineris is 4,000 km long. Without a stated size a named feature is a label on a texture, and the product has struggled to communicate scale since the first backlog.',k:'DRAW',e:'M',i:3},
{c:'place',t:'Real names only where they are real',n:['placenames'],d:'A generated coastline must never carry an Earth name, and an exoplanet must never carry an invented name presented as established. The landscape pass made this rule for terrain and it applies harder here.',k:'PROVE',e:'S',i:3},
{c:'place',t:'The named features should be findable from the interface',n:['placenames'],d:'A list per world, click to fly. It is the navigation primitive the catalogue has never had and it makes 120 worlds explorable rather than listed.',k:'DRAW',e:'M',i:3},
{c:'place',t:'Features from the landform grammar',n:['placenames'],d:'`landforms.json` has 21 forms. A named feature should be an instance of one, so the name comes with a process and an explanation rather than being decoration.',k:'MODEL',e:'M',i:3},
{c:'place',t:'Say which names are real',n:['placenames'],d:'Caloris is real. A generated crater name is not. Same provenance discipline, applied to nomenclature, and it is exactly the kind of thing that quietly misinforms.',k:'PROVE',e:'S',i:3},
{c:'place',t:'A place is a name, a sound and a reason to go',n:['placenames','worldsound'],d:'Three cheap things that between them are most of the difference between a rendered sphere and somewhere. None of the three is a rendering problem.',k:'DRAW',e:'M',i:3},

/* -------------------------------------------------------------- curate -- */
{c:'curate',t:'The contact sheet',g:'contact',n:['headlessgl'],d:'One hundred and twenty thumbnails on one page, regenerated on every change. It has been asked for in two previous passes and does not exist. It is the review artefact that makes every claim in this document checkable by eye in five seconds, and it is a by-product of the render harness.',k:'PROVE',e:'M',i:3},
{c:'curate',t:'Sort the sheet by physics, not by category',n:['contact'],d:'Grouped by the seven axes rather than by how each body was discovered. Worlds that are physically similar should sit together, and the ones that look identical without being similar are the bug.',k:'PROVE',e:'M',i:3},
{c:'curate',t:'Show the nearest neighbours',n:['contact','pairdist'],d:'For each world, the five that look most like it. It is how a person finds the Io cluster without being told to look for it.',k:'PROVE',e:'M',i:3},
{c:'curate',t:'Diff two contact sheets',n:['contact'],d:'Before and after a change, side by side, with the biggest movers first. It turns a rendering change from an assertion into an argument.',k:'PROVE',e:'M',i:3},
{c:'curate',t:'A sheet per category',n:['contact'],d:'All 21 giants together; all 15 moons together. Within-category sameness is the failure that matters and it is invisible on a mixed sheet.',k:'PROVE',e:'S',i:3},
{c:'curate',t:'Reference photographs beside the renders',n:['contact','spectrum'],d:'Twelve Solar System bodies have public imagery. Putting the render next to the photograph on the same sheet is the only external check the picture has.',k:'PROVE',e:'M',i:3},
{c:'curate',t:'The sheet should carry the metrics',n:['contact','edgemetric'],d:'A thumbnail with its numbers underneath. Pictures alone become a taste conversation; numbers alone become a metric-gaming exercise. Together they are a review.',k:'PROVE',e:'M',i:3},
{c:'curate',t:'Publish the sheet',n:['contact'],d:'The project publishes fifteen generated pages. A contact sheet of every world in the catalogue is more compelling than any of them and it costs one more generator.',k:'DRAW',e:'M',i:3},
{c:'curate',t:'A curation pass is a scheduled activity',n:['contact'],d:'Somebody looks at all 120 and writes down what is wrong. It is not automatable, it is the thing the automation exists to support, and it has never happened.',k:'PROVE',e:'M',i:3},
{c:'curate',t:'Keep a list of known-bad worlds',n:['contact'],d:'Which bodies currently look wrong and why. It is the work list that the fleet run produces and the contact sheet confirms.',k:'PROVE',e:'S',i:3},
{c:'curate',t:'Curate the opening set',n:['contact'],d:'The landscape pass built a picker with nine worlds. Which nine, and in what order, is a curation decision that shapes everyone\'s first impression.',k:'DRAW',e:'M',i:3},
{c:'curate',t:'A hero shot per world',n:['contact','artdir'],d:'Higher resolution, best angle, best light. It is what the world card, the README and any sharing surface want, and it is the hero camera from the direction object.',k:'DRAW',e:'M',i:3},
{c:'curate',t:'The README should show more than Earth',n:['contact'],d:'`site/img/` has four screenshots, all Earth. A project whose argument is that it has 120 worlds shows one.',k:'DRAW',e:'S',i:3},
{c:'curate',t:'An animated sheet',n:['contact'],d:'Each thumbnail rotating, or stepping through an epoch. Motion reveals the seams and the banding that a still frame hides.',k:'DRAW',e:'M',i:1},
{c:'curate',t:'Curate across zoom, not just across worlds',n:['contact'],d:'The same world at four rungs, in a row. It is how the zoom contract gets reviewed and it is where detail synthesis succeeds or fails.',k:'PROVE',e:'M',i:3},
{c:'curate',t:'Show what a world is meant to feel like next to what it does',n:['contact','artdir'],d:'The direction sentence beside the render. When they disagree, one of them is wrong, and the disagreement is the most useful thing on the page.',k:'PROVE',e:'M',i:3},
{c:'curate',t:'Let somebody else review it',n:['contact'],d:'Everything in these five backlogs has been produced by looking at the code. A person who knows planetary science looking at the contact sheet would find things no metric will.',k:'PROVE',e:'S',i:3},
{c:'curate',t:'Track how the sheet changes over releases',n:['contact','baseline'],d:'A year of contact sheets is the clearest possible record of whether this programme worked.',k:'PROVE',e:'M',i:2},
{c:'curate',t:'Curation feeds back into the data',n:['contact','worldrec'],d:'The output of looking at 120 worlds is edits to definitions, not edits to code. That is the loop this entire document is trying to close.',k:'PROVE',e:'M',i:3},
{c:'curate',t:'One hundred and twenty places',n:['contact'],d:'The stated goal of construct 20. The test is not that the catalogue has 120 entries — it has had that for a year — but that somebody scrolling the sheet sees 120 places and can say what each one is.',k:'PROVE',e:'S',i:3},
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

const FOUND = [
  ['The data layer landed and it is real',
   '`vr/data/worlds/` holds 24 materials, 11 cover kinds, 12 processes, 21 landforms and 10 column layers — 78 authored rows — each with a compiler on the pattern `lifegrammar.mjs` proved, and `substrates.json` and `cover.json` carry 35 provenance tags between them. `kinds.json` lists all 120 bodies with their resolved kind and is what keeps the 40-Io result from returning. This is a genuine foothold and the worldspace pass was right to call it one.'],
   ['Appearance is data; kind selection is a table plus axes',
   'PAINT, stamps and ice-shell maps compile from JSON. Named kinds are `kindRules.json`. A new body with an existing shape is a JSON review. Axis fallbacks (ice → europa, heatpipe → Io) stay in `planetKind` because they are physics, not a body list.'],
  ['The surface is one byte deep',
   '`W.substrate` is a `Uint8Array` holding the top material and nothing else, `W.rock` is a second byte array with eight Earth rock types, and `columnAt` builds a stack on demand from **one recipe per world** cached in `W._columnRecipe`. So every cell on a planet has the same layer sequence with per-cell depths. There is no per-cell stack, which means nothing can bury anything, expose anything or accumulate — and `layers.js`, which does have a real non-destructive stack, only ever operates on height.'],
  ['A colour is one triple with no light in it',
   '`substrates.json` gives each material one `rgb`, one `albedo` and a tag — no ramp against depth, wetness, grain size, age or angle, and no dependence on the illuminant. Meanwhile 154 hardcoded triples remain in code: 76 in `lifeColour.js`, 67 in `planetLook.js`, 11 in `render.js`. `sensory.js` already integrates Planck spectra against band transmission for eyes and no surface colour has ever asked it anything.'],
  ['Nothing in the test suite renders anything',
   '`pictureStats` is good work and it measures *fields* — height, temperature, precipitation, life, moisture. `readPixels`, `toDataURL` and any headless GL context appear nowhere in `vr/sim/test.mjs`. `capture-site.mjs` drives Playwright and screenshots four site pages, not worlds. The realism backlog\'s central finding — that the picture has never been measured — is still literally true; what has been measured is the data behind the picture.'],
  ['The artefact detector runs on one world out of a hundred and twenty',
   '`pictureStats(Wcont)` runs on a single continental test world inside one test block, with 14 assertions. That is 0.8% of the catalogue. The fault this entire programme exists to catch — 40 bodies resolving to Io — is invisible at that sample size, and it went unnoticed for months.'],
  ['Art direction is two lambdas',
   'Lighting, exposure, atmosphere, sky colour, limb, haze layering, detail grammar, sound, named features and the camera that introduces a world are decided elsewhere by code that does not know which world it is drawing, or not decided at all. `site/img/` holds four screenshots and all four are Earth.'],
  ['Nothing names a landform',
   '`W._plateNames` names plates. Sputnik Planitia, Caloris, Valles Marineris, the tiger stripes and the Great Red Spot are the reason anyone recognises those bodies, they are published for every Solar System world, and none of them exists in the product. `audio.js` layers one soundscape and it is Earth\'s everywhere.'],
];

const NOW = [
  ['Construct 16 is a foothold, and its own note says so',
   'The join landed: `definitions.json` + `worldDef.js` tie column, bedrock, cover, paint and features per body; `node scripts/data.mjs` is the one-build compiler and scoreboard (`newworldcost 0`, paint/stamps/shell in data). Remaining: per-cell deposition in play, pixel baselines, illuminant art direction, schema CI.'],
  ['Construct 17 has not started, and it blocks the most',
   'The column recipe is good work aimed at a different problem — describing a world\'s layering rather than storing a cell\'s. Deposition, burial, exposure, differential erosion, the fossil record, stratigraphic colour banding and the surface backlog\'s `strata` item are all waiting on a per-cell stack that does not exist.'],
  ['Construct 18 is a third done and the remaining two thirds are the hard part',
   'Materials have colours with provenance, which is the part that needed authoring discipline. What is left is the part that needs physics: a ramp instead of a triple, a spectrum instead of a ramp, and an illuminant so the same rock is a different colour under a different star.'],
  ['Constructs 19 and 20 are the same missing machine',
   'A render harness produces both the metrics and the contact sheet. Building it once serves the artefact detector, the art-direction review, the world cards, the picker thumbnails and the README images. Neither construct is reachable without it and both are cheap once it exists.'],
  ['The measurement discipline is working where it exists',
   '`kinds.json` is committed and tested against a live audit, so the Io result cannot return silently. `pictureStats` has 14 assertions that caught real regressions. The generate-reset test added this session found four separate leaks including a vent field that carried 173 vents from one planet to the next. The pattern is proven; it is the coverage that is thin.'],
];

const SEQ = [
  ['Count what is code and print it',
   '`dataratio` and `newworldcost` are generated by `node scripts/data.mjs`. Per-body `land*`/`stamp*`/`paint*` are gone; named kinds are a table.'],
  ['Build the render harness',
   '`headlessgl`. One world, one PNG, one number, end to end. Every ambitious testing plan in five backlogs has been blocked on not having this, and it is the same machine that produces the contact sheet.'],
  ['Make the contact sheet',
   '`contact` and `fleetrun`. One hundred and twenty thumbnails on one page. It has been asked for in two previous passes; it is a by-product of the harness; and it is the first time anybody will have seen most of this catalogue.'],
  ['Then the metrics and the baselines',
   '`edgemetric`, `pairdist`, `baseline`. Axis-aligned runs, contour steps, per-face discontinuity, palette entropy, and the pairwise distance that finds worlds sharing a look. Commit them, budget them, ratchet them.'],
  ['Then the world record that joins the tables',
   '`worldrec`. The five data files plus a join is what turns a vocabulary into a definition. Selection rules rather than assignments, inheritance rather than duplication, and overrides that have to state a reason.'],
  ['Then move the PAINT table into ramps',
   '`matramp`, `paintdata`. Thirty kinds, 37 lambdas, 85 `lerp` calls, each a function of four inputs — which is a ramp table. It is the largest single block of appearance code and the one most worth having as data.'],
  ['Then the illuminant',
   '`illum`. Reflectance times illuminant, exposure per world, sky as a second light source. `sensory.js` already does this integral for eyes. It is the change that makes a red-dwarf world look like one rather than like Earth with a filter.'],
  ['Then the per-cell stack',
   '`colstack`, fixed depth first. Eight layers is 2.2 MB at N=96. The recipe becomes the stamp rather than the answer, `W.substrate` becomes derived, and deposition finally has somewhere to put things.'],
  ['Then the stack operations',
   '`stackops`, `deposit`. Six verbs — erode, deposit, intrude, melt, weather, compact — defined once, with rates from `processes.json`, mass balance asserted, and a merge policy that bounds the depth.'],
  ['Then stratigraphy as history',
   'Unconformities, ash markers, biological rock, the fossil record in layers, and colour banding that comes from real layers rather than from a classifier threshold. This is where the geology, life and surface passes all meet.'],
  ['Then art direction as an object',
   '`artdir`, `placenames`. Palette, illumination, atmosphere, limb, detail grammar, sound, named features and a hero camera, decided together per class with per-body overrides — and moved into the world definition, which is the half of construct 16 that was explicitly deferred.'],
  ['Then curate, and let the loop close',
   'Somebody looks at all 120, writes down what is wrong, and the output is edits to data rather than edits to code. That sentence is the whole programme, and every item above exists to make it true.'],
];

/* ------------------------------------------------------------ markdown -- */
function markdown() {
  const L = [];
  L.push('# ORRERY — open world');
  L.push('');
  L.push(`**${D.length} items.** Generated from \`scripts/openworld.mjs\` — edit that file, not this one, then run \`node scripts/openworld.mjs\`.`);
  L.push('');
  L.push('The machinery that keeps the palette open: world definitions as authored data, a material layer stack, palettes with provenance, an artefact detector that looks at pixels, and per-world art direction as a unit.');
  L.push('');
  L.push('The measurement this pass starts from: the data layer landed — **78 authored rows** across five files with compilers and 35 provenance tags — and **64 hand-written per-body functions** still decide what a world looks like. `planetLook.js` alone carries 30 PAINT kinds built from 37 lambdas and 85 `lerp` calls, and `applyPlanetLook` sets exactly two fields. The surface is one byte deep. One hundred and fifty-four colour triples remain in code. And nothing in the test suite renders anything at all.');
  L.push('');
  L.push(`Kind: **${count((x) => x.k === 'MODEL')}** model, **${count((x) => x.k === 'DRAW')}** picture, **${count((x) => x.k === 'PROVE')}** measurement and proof. Effort is S/M/L. Impact is 1–3.`);
  L.push('');

  L.push('## What the audit found');
  L.push('');
  for (const [a, b] of FOUND) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## Where the machinery actually is');
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
  L.push('The through-line: four of the five constructs in this pass are one machine each, and two of those are the same machine. A render harness produces the artefact detector *and* the contact sheet *and* the world cards *and* the picker thumbnails *and* the README images — and until it exists, five backlogs\' worth of visual claims are unverifiable by anything except somebody looking at a screenshot, which is how every fault in this programme has been found so far.');
  L.push('');
  L.push('The data layer is real and it stopped short of the thing that matters. Five tables describe a vocabulary; what is missing is the join that makes a sentence, and in its absence 64 hand-written functions are still the grammar. The worldspace pass\'s own note says it plainly: look is still code, stamps are still code. Moving them is the work, and the order is: count what is code, build the harness so the move is checkable, then move the largest block first.');
  L.push('');
  L.push('The stack is the one construct here that has not started, and it is the one the most other work waits on — deposition, burial, differential erosion, the fossil record and stratigraphic colour all need a surface that is more than one byte deep. Eight layers is 2.2 MB at play resolution. The recipe that exists today is not wasted: it becomes the thing that stamps the initial condition, and then processes get to change it, which is the entire difference between a description and a history.');
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
<title>ORRERY — open world</title>
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
  <div class="eyebrow">Deep dive · the machinery that keeps it open</div>
  <h1>Open world</h1>
  <p class="sub">World definitions as authored data, a material layer stack, palettes
  with provenance, an artefact detector that looks at pixels, and per-world art direction as a
  unit. The data layer landed — 78 authored rows — and 64 hand-written per-body functions still
  decide what a world looks like.</p>
  <p class="nav"><a href="./">Pitch</a> · <a href="backlog.html">Systems</a> ·
  <a href="worlds.html">Worlds</a> · <a href="evolution.html">Evolution</a> ·
  <a href="godgame.html">God layer</a> · <a href="next.html">Next 200</a> ·
  <a href="tides-weather.html">Tides &amp; weather</a> · <a href="geology.html">Geology</a> ·
  <a href="exoparams.html">Real parameters</a> · <a href="living.html">Alive</a> ·
  <a href="currents.html">Currents</a> · <a href="realism.html">Realism</a> ·
  <a href="landscape.html">Landscape</a> · <a href="life.html">Life</a> ·
  <a href="surface.html">Surface</a> · <a href="worldspace.html">World space</a> ·
  <a href="../vr/">Prototype</a></p>
  <dl class="tally">
    <div><dt>Items</dt><dd>${D.length}<small>${CATS.length} categories</small></dd></div>
    <div><dt>Kind</dt><dd>${count((x) => x.k === 'MODEL')}/${count((x) => x.k === 'DRAW')}/${count((x) => x.k === 'PROVE')}<small>model · draw · prove</small></dd></div>
    <div><dt>Impact 3</dt><dd>${count((x) => x.i === 3)}<small>of ${D.length}</small></dd></div>
    <div><dt>Effort</dt><dd>${count((x) => x.e === 'S')}/${count((x) => x.e === 'M')}/${count((x) => x.e === 'L')}<small>S / M / L</small></dd></div>
  </dl>
</header>

<div class="prose">
  <h2>What the audit found</h2>
  <ul class="state" id="fixed"></ul>

  <h2 style="margin-top:40px">Where the machinery actually is</h2>
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
  <p style="margin-top:16px">The through-line: four of the five constructs in this pass are
  one machine each, and two of those are the same machine. A render harness produces the artefact
  detector <em>and</em> the contact sheet <em>and</em> the world cards <em>and</em> the picker
  thumbnails <em>and</em> the README images — and until it exists, five backlogs' worth of visual
  claims are unverifiable by anything except somebody looking at a screenshot, which is how every
  fault in this programme has been found so far.</p>
  <p>The data layer is real and it stopped short of the thing that matters. Five tables describe a
  vocabulary; what is missing is the join that makes a sentence, and in its absence 64 hand-written
  functions are still the grammar. The worldspace pass's own note says it plainly: look is still
  code, stamps are still code. Moving them is the work, and the order is: count what is code, build
  the harness so the move is checkable, then move the largest block first.</p>
  <p>The stack is the one construct here that has not started, and it is the one the most other
  work waits on — deposition, burial, differential erosion, the fossil record and stratigraphic
  colour all need a surface more than one byte deep. Eight layers is 2.2&nbsp;MB at play
  resolution. The recipe that exists today is not wasted: it becomes the thing that stamps the
  initial condition, and then processes get to change it, which is the entire difference between a
  description and a history.</p>
</div>

<footer>
  Generated from <code>scripts/openworld.mjs</code> — edit the source and re-run, do not edit the output.
</footer>
</div>

<script>
"use strict";
var DATA = ${data};
var CATS = ${cats};
var CRIT = ${crit};
var NOW = ${JSON.stringify(NOW)};
var FIXED = ${JSON.stringify(FOUND)};
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
await writeFile(join(ROOT, 'briefs', 'openworld-backlog.md'), markdown() + '\n');
await writeFile(join(ROOT, 'site', 'openworld.html'), html());

console.log(`openworld: ${D.length} items across ${CATS.length} categories`);
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
console.log('\nwrote briefs/openworld-backlog.md and site/openworld.html');
