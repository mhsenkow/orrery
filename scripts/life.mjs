#!/usr/bin/env node
// Single source of truth for the ORRERY life backlog.
// Emits  briefs/life-backlog.md  and  site/life.html.
//
//   node scripts/life.mjs
//
// 400 items on one question: is the life in this simulation a thing that happens,
// or a thing that was written down? Everything from the chemistry that makes the
// first replicator to the shape of the animal on the tile in front of you — and
// specifically whether any of it could ever have come out differently.
//
// k:  MODEL   = the science underneath; what the simulation computes
//     SHOW    = what reaches the eye — the picture, the sound, the readout
//     PLAY    = what the player does to it, and what it does back
// e:  effort S/M/L.  i: impact 1..3.
// g:  capability token this item provides.  n: tokens it needs first.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CATS = [
  ['origin', 'The origin, which is a boolean',
    '`W.transitions.abiogenesis` used to be a `false` that became a `true` between two frames. It is now a rate integrated over cells that actually have disequilibrium and a catalytic surface, logged at the cell it happened in. RNA world has a duration gated on Eigen’s `μL < 1`. What remains is the harder origin questions — panspermia between catalogue bodies, an inferred rather than planted LUCA, and an origin experiment the player can rewind.'],
  ['chem', 'What life is made of, and what it runs on',
    'Until this pass the model had no biochemistry at all. `dominantPigment` is a string with three values, the solvent is always water because nothing names a solvent, and `alienTick` handles a methane world by multiplying `W.life[c]` by 0.5 when it is warm. Chirality, the genetic polymer, the energy carrier and the membrane are the four choices that decide whether two biospheres can eat each other, and none of them existed. `vr/data/life/biochem.json` now carries seven solvents with their real dielectric constants and liquid ranges; the items here are what has to consume them.'],
  ['genome', 'A genome, rather than eleven floats',
    '`TRAITS` is eleven `Float32`s with a fixed `MUT_RATE` array beside it. Every lineage on every planet has exactly those eleven numbers, mutation is a Gaussian step on each, and the largest structural change any lineage can undergo is that a number moves by 0.05. There is no duplication, no loss, no recombination, no regulatory layer, and no way for a body to gain a part it did not already have a float for. This pass adds `vr/sim/genome.js` — an open, JSON-serialisable genome with the operators that actually make novelty — and these items are the rest of it.'],
  ['devo', 'Development — the part between the genome and the animal',
    'There is no development in this product. A body is a pure function of eleven floats evaluated once, so there is no growth, no juvenile, no larva, no metamorphosis, no allometry, and no way for the same genome to make a different body in a different environment. Half of what makes real morphology surprising happens here: the segmentation clock that sets somite number, the Hox order that decides which segment grows what, and the fact that a duplicated appendage is one regulatory change away from an appendage that does something else.'],
  ['morpho', 'The morphospace, which was twenty-six shapes',
    'Measured by evaluating `bodyPlanFromTraits` over 20,736 trait vectors spanning body mass, trophic level, dispersal and defence: **26 distinct discrete body plans, six sprite kinds, one silhouette score**. `limbs` takes three values, `symmetry` takes two, and the entire creature space of a game about evolving life on other planets fits in a paragraph. `pigmentBias` was constant at 0.5 on every creature ever drawn because the code read `TRAITS.thermalOpt`, which is not a key of `TRAITS`. The grammar shipped this pass has 1.6 × 10²⁸ distinguishable bodies; that number is worth nothing until the items below let a planet reach them.'],
  ['sense', 'Senses, and the physics that decides which ones a world can have',
    'The word "eye" does not appear anywhere in `vr/sim/`. Not as an organ, not as a trait, not as a flag — the only sensory quantity in the model is `photonUsable`, one scalar per planet, computed from stellar effective temperature by a three-branch step function. So no creature here can see, and no world can be the kind of world where sight does not pay. This is the category the user asked the loudest question about, and the answer is physical: a 1 mm photon carries 1.24 meV, which is 0.05 kT at room temperature, so a microwave eye cannot be a pigment — it has to be an antenna, and the diffraction limit says the antenna has to be metres across.'],
  ['energy', 'Thermodynamics — what a body can afford',
    '`GUILDS` is a seventeen-row table of donor/acceptor pairs with a hand-written `yield` column, and it is the only energetics in the model. There is no ΔG computed from concentrations, no temperature dependence beyond a linear factor, no maintenance cost that scales with mass, and above the microbial layer no energy budget at all: a lineage\'s body mass is a float that drifts, not a quantity something had to pay for. Kleiber\'s law is implemented in `kleiberDensity` and called from exactly one place.'],
  ['physio', 'The scaling laws that decide how big a thing can get',
    'Body size in this model is `traits[4]`, a number between 0 and 1 that random-walks. Nothing stops a tracheal body from being a tonne, nothing stops an endotherm from being a milligram, and nothing anywhere computes a surface-to-volume ratio. The three constraints that actually shape a biosphere — oxygen supply, heat balance, and the square-cube law under a given gravity — are absent, which is why the same size distribution appears on a 0.13 g ice moon and on a 2.4 g super-Earth.'],
  ['popgen', 'Populations, drift and the load a genome carries',
    '`node.pop` is a count of occupied cells — at N=64 one "individual" is 24,000 km². Effective population size is `Ne = max(1, node.pop)`, drift is `1/sqrt(Ne)` used as a mutation-rate bonus, and selection is a single `fitness()` multiplier applied when an empty cell is being claimed. There is no allele, no frequency, no variance, no linkage, no mutational load, and no way for a small isolated population to be genetically different from a large one in any way except by luck of a die roll.'],
  ['speciate', 'Speciation — the one event the tree is made of',
    '`maybeSpeciate` requires a lineage with `pop >= 8`, splits its occupied cells into connected components, and with probability `0.01 × dt` promotes the second-largest component to a new lineage. That is allopatry, and it is the only mechanism in the product. No sympatric split, no polyploid instant speciation, no ring species, no hybridisation, no reinforcement, and no reproductive isolation of any kind — two lineages that reconverge in trait space are logged as a "convergence" and left as two.'],
  ['phylo', 'The tree, and whether anyone can read it',
    'The phylogeny is maintained correctly. `treeSummary` and a Lab SVG from `layoutTree` now show it. On the measured 1.7 Gyr run the tree has 86 living nodes and a maximum depth of four, and modern Earth plants a Holocene clade set at generate so the Lab is not empty at tick 0.'],
  ['eco', 'Ecology — who eats whom',
    '`ecologyTick` computes NPP, upwelling and biomes and it is genuinely good. `node.diet` is now up to three prey ids with a Lotka–Volterra step on census, chirality mismatch blocks the link, and a lineage eaten below MVP is removed from the living set. What it still is not is a community: no detrital loop that the player can see, and trophic level is still a float as well as a relationship.'],
  ['coevo', 'Coevolution — the pressure that comes from other life',
    'Every selective pressure in this model comes from the planet. `fitness()` reads temperature, moisture and oxygen; nothing reads what else is alive in the cell. That single fact removes predation, parasitism, mutualism, pollination, mimicry, arms races and the Red Queen — which between them account for most of the interesting shape in the fossil record, and all of the reasons a biosphere keeps changing after it has finished adapting to its planet.'],
  ['biogeo', 'Geography, isolation and the shape of a range',
    '`connectedComponents` walks the four-neighbour lattice and is the whole of biogeography. Dispersal is `traits[5]`, which is read by nothing that moves anything; range shift is `climateRangeShift` in `meta.js`; endemism is a boolean flag set by `flagEndemics`. There is no sea barrier, no mountain barrier, no land bridge, no rafting, no island size effect, no distance decay, and no reason a planet with one supercontinent should have a different biota from one with fifty islands.'],
  ['mass', 'Extinction, and what survives it',
    '`extinctionTick` has real machinery: background versus pulse rates, named kill mechanisms, extinction debt and per-cell fossils capped at eight. What it cannot do is be selective in a way that matters, because the things that decide who dies in a real mass extinction — body size, geographic range, larval type, metabolic rate, trophic position, dependence on a mineral phase — are either absent from the model or present as a float nobody consults. So the same random 30% dies whether the kill is an impact, an anoxic ocean or a snowball.'],
  ['gaia', 'Life as a geological force',
    'This half is the strongest in the product: `redox.js`, `carbon.js` and `gaia.js` genuinely let the biosphere change the atmosphere, and the Great Oxygenation is a state transition rather than a date. On the measured 1.7 Gyr run the guilds hold, the tree reaches depth 4 with 86 lineages, oxygenic photosynthesis invents, and CO₂ sits at 0.12 instead of the old 0.85 cap. O₂ is still 0.0000 at 2.74 Ga because the Fe²⁺ ocean has not been exhausted yet — the GOE is a later chapter, not a missing flag.'],
  ['alien', 'Biospheres that are not shaped like Earth\'s',
    '`alienTick` is nine `if (rule.someFlag)` blocks that clamp `W.life[c]` after the fact — an ice-shell world takes `life = min(life, 0.15)`, a Venus world takes `life = 0`, a Titan world takes `× 0.5` when warm. So an exotic biosphere is Earth\'s biosphere with a multiplier on it, and there is no world in the 200-body catalogue whose life is structurally different from Earth\'s rather than dimmer. Meanwhile 120 of those bodies have measured stellar temperatures, insolations and pressures sitting unused in `worldParams.js`.'],
  ['visual', 'What the creature actually looks like',
    '`drawCreature` now generates a silhouette from the genome plan — radial, bilateral, sessile, nekton, goo — with eyes from receptor bands. The local map uses it when a genome plan exists; the globe stamps unique plans into a 20-slot atlas beside the sixteen Path2D fallbacks. Gait beyond a flip and a shear, sex, and a growth-series plate are the remaining pictures.'],
  ['play', 'The hand on the biosphere',
    '`seedLife` paints a disc of `W.life` at 0.7–1.0 and sets `lifeClass` to the current unlocked rung. That is the entire verb set for life: a spray can. The god layer has brushes, receipts, an energy economy and an undo stack, and life is the one system it can only smear. Nothing lets a player breed, cross, isolate, release, protect, sequence, name, or ask a question of a lineage — which is strange in a product whose pitch is that you hold the planet.'],
  ['learn', 'Making it legible',
    'The product has a glossary, a chronicle, a teach layer and a `param-coverage.json` that says which planetary numbers are measured. Life has none of that: no field guide, no species page, no tree view, no provenance label saying which parts of a creature are physics and which parts are a lambda somebody wrote at midnight. A simulation this detailed that cannot explain itself is a screensaver with good foundations.'],
];

const P1 = [
/* -------------------------------------------------------------- origin -- */
{c:'origin',t:'An origin that is a rate, not a coin flip',g:'originrate',d:'`redoxTick` rolls once against a fixed probability and sets `T.abiogenesis = true`. Replace it with a rate per unit of disequilibrium per unit of catalytic surface per unit time, integrated over the cells that actually have both. Then a vent field is likelier than open ocean, a young hot planet is likelier than an old cold one, and the answer to "why here" is a number rather than a die.',k:'MODEL',e:'M',i:3},
{c:'origin',t:'Somewhere for the origin to happen',g:'protocell',n:['originrate'],d:'Before the first cell there should be a field of prebiotic inventory — reduced carbon, phosphate, nickel-iron sulfide surfaces, a pH gradient across a chimney wall. `W.species` already carries H2, H2S, Fe2 and CO2 per cell; a `protoOrg` field accumulating where those overlap gives the origin a place and a clock instead of a global flag.',k:'MODEL',e:'M',i:3},
{c:'origin',t:'More than one origin, and only one survivor',n:['protocell'],d:'Nothing in the model forbids life starting twice, and nothing lets it. Seed several independent protocell populations with different biochemistries, let them compete for the same donors, and log which one won and by how much. That is the single most interesting thing a player can be told about their planet\'s deep past.',k:'MODEL',e:'M',i:3},
{c:'origin',t:'The shadow biosphere that lost',n:['protocell'],d:'If two origins are allowed, the loser should leave traces: a relict population in a refugium the winner cannot reach, a mineral signature, an incompatible chirality in the sediment. Earth may or may not have one; a simulation should be able to have one and should say so.',k:'MODEL',e:'M',i:1},
{c:'origin',t:'The origin is a place on the map',g:'originsite',n:['originrate'],d:'`chronLog(W.year, \'origin\', 0, 1, \'Abiogenesis\')` passes cell 0. The most important event in the planet\'s history is logged at the origin of the coordinate system. Log the cell it actually happened in, put a marker there, and let the camera fly to it.',k:'SHOW',e:'S',i:3},
{c:'origin',t:'Why it did not happen',d:'`diagnoseSterile` in `alien.js` is a good idea with five branches. Turn it into a proper report against the origin rate: which term was too small, by what factor, and what would have to change. A sterile planet is a story only if it explains itself.',k:'SHOW',e:'M',i:3},
{c:'origin',t:'RNA world as a stage with a duration',d:'`T.rnaWorld` is set to `true` in the same statement as `T.luca`. If a replicator phase exists at all it should last a measurable time, have a mutation rate high enough to hit the error threshold, and end when the genome grows past what an unproofread polymer can hold — which is about ten kilobases and is a real number worth teaching.',k:'MODEL',e:'M',i:2},
{c:'origin',t:'Eigen\'s error threshold as the first hard gate',n:['originrate'],d:'A replicator with per-base error rate μ and genome length L stays coherent only while μL < 1. That single inequality is why DNA and proofreading had to precede complex genomes, and it is a two-line model that gates the whole genome-size axis.',k:'MODEL',e:'S',i:2},
{c:'origin',t:'The last universal common ancestor should be inferred, not planted',d:'`ensureLuca` creates a node called LUCA with `blankTraits()` and paints it over every cell above the life floor. A real LUCA is the crown of whatever survived — it should be the node the tree traces back to after the first extinctions, and its trait vector should be reconstructed rather than assigned.',k:'MODEL',e:'M',i:2},
{c:'origin',t:'Panspermia as a switch a player can flip',d:'The catalogue has bodies in the same system. Let a large impact on an inhabited world eject viable material, and let it arrive somewhere else with a probability that depends on the actual orbits already in `worldParams.js`. It is the one mechanism that makes a multi-body system a single biological story.',k:'PLAY',e:'L',i:2},
{c:'origin',t:'A vent field that is an object',g:'ventfield',d:'`W.bound[c] === 0` is the whole of "there is a vent here". Give vents position, temperature, chemistry, flux and a lifetime of tens of thousands of years, so a chemosynthetic population can be stranded when its vent dies — which is the standard fate of vent fauna and the best small-scale extinction story in the model.',k:'MODEL',e:'M',i:3},
{c:'origin',t:'Serpentinisation as the hydrogen source it is',n:['ventfield'],d:'`eq.H2 = isSea ? 0.02 : 0.001` is a constant. Hydrogen at an alkaline vent comes from olivine reacting with water, so it should depend on ultramafic rock exposure, temperature and water flux — all three of which the geology module already tracks.',k:'MODEL',e:'M',i:2},
{c:'origin',t:'Radiolysis as the origin route on an ice moon',n:['ventfield'],d:'`alienTick` gives an ice-shell world `chemoPower = tidalHeat + 0.02 + radiogenic*0.01`, invented. Water splitting by potassium-40 and by Jovian radiation at the ice surface is a measurable oxidant supply, and it is the reason a subsurface ocean can have a redox gradient at all.',k:'MODEL',e:'M',i:2},
{c:'origin',t:'Concentration mechanisms, because dilution is the real problem',d:'The hardest quantitative objection to any origin is that the ocean is too big. Thermophoresis in a pore, evaporating tide pools, freezing eutectics — each concentrates by orders of magnitude and each ties to a planetary parameter this model already has: tides, insolation, ice.',k:'MODEL',e:'M',i:2},
{c:'origin',t:'The origin should be interruptible',d:'Late heavy bombardment, a global glaciation, a magma ocean — any of these should be able to sterilise a young planet and reset the clock. `noteImpact` exists in `extinction.js` and has no path to undoing an origin.',k:'MODEL',e:'S',i:2},
{c:'origin',t:'A first-cell moment worth watching',n:['originsite'],d:'`maybeCaptureMoment(W, \'firstCell\', \'First cell\')` files a chip. This is the moment the product exists to show. It deserves a camera move, a held frame, a sound, and a sentence naming the chemistry that did it.',k:'SHOW',e:'M',i:3},
{c:'origin',t:'Let the player run the origin experiment',n:['originrate'],d:'Rewind to just before, change one parameter — vent density, ocean pH, phosphate — and run it again. The rewind machinery exists as `forkWorldSeed`. What is missing is a comparison view that says how the two runs differed and when they diverged.',k:'PLAY',e:'M',i:3},
{c:'origin',t:'Origin difficulty as a real, stated prior',d:'Whether abiogenesis is easy or hard is the largest open question in the field and this product takes a silent position on it every run. Expose it as a dial with the actual arguments attached, and make the default say which way it leans and why.',k:'PLAY',e:'S',i:2},
{c:'origin',t:'Log the disequilibrium that was consumed',d:'An origin is a system finding a faster way downhill. Print the free-energy flux before and after, and show it falling as the biosphere eats the gradient it was born from — the Archean methane build-up in `redox.js` is already most of this signal.',k:'SHOW',e:'M',i:2},
{c:'origin',t:'An origin test that is not just "it fired"',d:'`test.mjs` never asserts anything about abiogenesis. Assert the distribution: across twenty seeds on Earth-like settings the origin should land inside a stated window, and on an airless world it should never fire. That is the difference between a model and a coin.',k:'MODEL',e:'S',i:3},

/* ---------------------------------------------------------------- chem -- */
{c:'chem',t:'Solvent as a planetary property with consequences',g:'solvent',d:'Shipped this pass as `vr/data/life/biochem.json`: seven solvents with measured melting and boiling points, dielectric constants and densities. Now make the sim read it — liquid window sets where life can be at all, dielectric constant decides whether an ionic polymer can dissolve, density and viscosity feed every drag, buoyancy and diffusion number downstream.',k:'MODEL',e:'M',i:3},
{c:'chem',t:'The dielectric constant is the whole argument about methane life',n:['solvent'],d:'Water is 80, ammonia 22, liquid methane 1.7. At 1.7 nothing ionic dissolves, so a methane biochemistry cannot use a phosphate backbone or a lipid bilayer and has to be built from something else. The JSON says so; the model should refuse to grow an RNA-and-phospholipid organism in methane and should say which two numbers stopped it.',k:'MODEL',e:'M',i:3},
{c:'chem',t:'Reaction rates at 94 kelvin',n:['solvent'],d:'Arrhenius across the 300 K to 94 K gap is something like fifteen orders of magnitude. A Titan biosphere is not a dimmer Earth on the same clock; it is a biosphere whose generation time may be geological. Fold the solvent temperature into every biological rate and the strangeness comes for free.',k:'MODEL',e:'M',i:3},
{c:'chem',t:'Chirality, and why it makes two biospheres invisible to each other',n:['solvent'],d:'A D-amino-acid biosphere cannot eat an L-amino-acid one — the enzymes do not fit. That makes handedness the cleanest possible mechanism for two origins coexisting, and it costs one field on the genome and one check in the trophic transfer.',k:'MODEL',e:'S',i:2},
{c:'chem',t:'The genetic polymer sets the maximum genome',n:['solvent'],d:'RNA is catalyst and template but too fragile to hold a large genome; DNA splits the jobs and can be proofread. Make polymer choice cap genome length, and make the cap gate the module count a lineage can carry — which turns a chemistry decision into a morphology ceiling.',k:'MODEL',e:'M',i:2},
{c:'chem',t:'Membrane before metabolism, or after',d:'`mineralCompartment` is in the data as the vent-pore option specifically because it is the one that does not require a cell to have already solved lipid synthesis. Which of these a world starts with should change what its earliest cells can do and where they can go.',k:'MODEL',e:'M',i:2},
{c:'chem',t:'Energy carrier as a real currency',d:'`protonGradient`, `thioester`, `phosphate`, `arsenate` are in the data with the reason each works. A world poor in phosphate — which most rocky worlds are — should have to run a thioester economy and should pay for it in yield.',k:'MODEL',e:'M',i:2},
{c:'chem',t:'Phosphorus as the limiting nutrient it actually is',d:'`W.nutrientP[c] = clamp(0.3 + ore*0.3 + sediment*0.4, 0, 1)` — an invented mix. Phosphorus is the long-term limiting nutrient of the Earth\'s ocean, supplied by continental weathering and buried in sediment, and that loop is exactly the kind of thing the geology module could drive if it were asked.',k:'MODEL',e:'M',i:3},
{c:'chem',t:'Nitrogen fixation should cost what it costs',d:'`nFixer` has `yield: 0.1` and a hard `sp.O2[c] > 0.05` penalty. Breaking the N≡N triple bond costs 16 ATP per molecule and is poisoned by oxygen — both real numbers, both more interesting than a multiplier, and together they explain why nitrogen fixers hide inside other organisms.',k:'MODEL',e:'M',i:2},
{c:'chem',t:'Trace metals as the gate on which enzymes exist',d:'Nitrogenase needs molybdenum or vanadium; cytochrome oxidase needs copper; almost everything ancient needs iron and nickel. `W.ore` exists. Tie metabolic availability to crustal chemistry and a planet\'s composition finally reaches its biosphere.',k:'MODEL',e:'M',i:2},
{c:'chem',t:'Isotope fractionation, because it is how we know any of this',d:'`carbon.js` tracks δ¹³C. Extend it: sulfur isotopes for sulfate reduction, nitrogen for fixation, iron for photoferrotrophy. Then the Lab\'s core readout becomes the same evidence a real geobiologist would use, and the player is reading a proxy rather than a state variable.',k:'SHOW',e:'M',i:3},
{c:'chem',t:'Biosignature gases computed from the biochemistry, not from a table',d:'The transit spectrum in the Lab is drawn from atmospheric composition. Make each guild and each biochemistry emit its own gases — methane from methanogens, DMS from marine algae, nitrous oxide from denitrifiers — so the spectrum is a consequence of what lives there.',k:'SHOW',e:'M',i:3},
{c:'chem',t:'A false-positive biosignature',d:'The most important thing a spectrum can teach is that abiotic processes make oxygen too — photolysis on a water-losing planet, for one. Let a sterile world produce a tempting spectrum and let the Lab argue with itself about it.',k:'SHOW',e:'M',i:2},
{c:'chem',t:'Pigment absorption as a spectrum, not a name',d:'`dominantPigment` is one of three strings. A pigment is an absorption curve; it should be generated against the star\'s spectrum and the atmosphere\'s windows, which is exactly what `sensory.js` now computes for eyes and would compute for leaves.',k:'MODEL',e:'M',i:3},
{c:'chem',t:'Antifreeze, halophily, piezophily as real tolerances',d:'`cryoprotectantGland` is in the organ table. Salt tolerance and pressure tolerance should join it — the deep ocean of an ice moon is a high-pressure brine, and both of those are survivable with known biochemistry and neither is free.',k:'MODEL',e:'M',i:2},
{c:'chem',t:'Silicon, honestly',d:'Every audience asks. Si–Si bonds hydrolyse in water and silicon dioxide is a solid rather than a gas, so silicon life needs a different solvent and a different waste route. Model it once, properly, with the objections attached, rather than either refusing it or pretending it is easy.',k:'MODEL',e:'M',i:1},
{c:'chem',t:'The biochemistry should appear on the world chip',n:['solvent'],d:'A world\'s solvent, handedness and polymer are three words that tell a player more about what they are looking at than the temperature does. Put them where the seed is.',k:'SHOW',e:'S',i:2},
{c:'chem',t:'Let the player choose the chemistry at genesis',n:['solvent'],d:'`blankGenesis` already carries eight parameters. Adding solvent and handedness makes "what if life started in ammonia" a thing you can do rather than a thing you can read.',k:'PLAY',e:'M',i:3},
{c:'chem',t:'Two biochemistries in one ocean',d:'If handedness and solvent are per-lineage, two incompatible biospheres can share a planet and compete for donors without ever eating each other. That is a genuinely alien outcome the current model cannot represent at all.',k:'MODEL',e:'L',i:2},
{c:'chem',t:'Say which numbers are measured',d:'The dielectric constants and liquid ranges in `biochem.json` are measured; `utility`, the azotosome and the polyether backbone are not. `param-coverage.json` does this for planets. Life needs the same honesty file.',k:'SHOW',e:'S',i:3},

/* -------------------------------------------------------------- genome -- */
{c:'genome',t:'A genome that is data, not a float array',g:'genomeobj',d:'Shipped this pass: `vr/sim/genome.js` holds ten categorical axes, eight counted axes, a variable-length organ list with counts and receptor bands, a biochemistry and a lock set — all plain JSON, all round-tripping through `JSON.parse(JSON.stringify(g))`, all compiled from `vr/data/life/*.json` by `scripts/lifegrammar.mjs`. The eleven traits stay as the physiological tolerances they always were.',k:'MODEL',e:'L',i:3},
{c:'genome',t:'Duplication, divergence and loss as the mutation operators',g:'dupdiv',n:['genomeobj'],d:'Shipped: `mutateGenome` applies loss at 16%, duplication at 14%, divergence at 12%, gain, counted-axis steps, categorical steps, and whole-genome duplication at 1.5%. These are the operators that generate morphological novelty in the record. A Gaussian on a fixed vector generates none, which is why the old model could never produce a body it did not already have a slot for.',k:'MODEL',e:'M',i:3},
{c:'genome',t:'Gene loss is the commonest event and nothing modelled it',n:['dupdiv'],d:'Parasites, cave fish, endosymbionts, every lineage that moved somewhere easier — reductive evolution is everywhere and the old trait vector could not express it, because eleven floats always exist. The organ list can be empty, and that is the point.',k:'MODEL',e:'S',i:3},
{c:'genome',t:'Whole-genome duplication as the thing under every radiation',n:['dupdiv'],d:'Shipped as the rarest operator: doubles ploidy and unlocks every hardened axis for one step. Two rounds of it sit under the vertebrates and one under most flowering plants. It is the cheapest possible route to a genuinely new organ and it should show in the tree as a burst.',k:'MODEL',e:'M',i:2},
{c:'genome',t:'Mutation rate should come from somewhere',d:'`MUT_RATE` is eleven hand-tuned constants. Real mutation rate rises with radiation flux, with temperature, with generation rate and with the absence of proofreading, and falls under selection for fidelity. Every one of those is a quantity this simulation already has.',k:'MODEL',e:'M',i:2},
{c:'genome',t:'Recombination, and therefore sex',g:'sex',d:'`T.sex` is set to `true` in `redox.js:497` and read by nothing, anywhere, ever. The origin of sex is one of the major transitions and in this product it is a dead assignment. Give it a consequence: recombination between two lineages of the same species, which is what makes selection able to combine two good mutations that arose separately.',k:'MODEL',e:'M',i:3},
{c:'genome',t:'Muller\'s ratchet in the asexual half',n:['sex'],d:'Without recombination, deleterious mutations accumulate irreversibly in small populations. That is the standard explanation for why sex is worth its twofold cost, and it needs a mutational load counter per lineage — which is also the thing that makes small isolated populations genuinely fragile rather than fragile by die roll.',k:'MODEL',e:'M',i:2},
{c:'genome',t:'Horizontal gene transfer that transfers a gene',d:'`horizontalGeneTransfer` swaps one float between two lineages under 0.35 body mass. Make it move an actual module — a metabolism, a tolerance, a resistance — with a probability that falls with phylogenetic distance and rises in dense mats, and the Archean stops being a tree and becomes the network it actually was.',k:'MODEL',e:'M',i:3},
{c:'genome',t:'Endosymbiosis as an event between two lineages',d:'`T.eukaryote` is a global boolean set by an oxygen threshold. The real event is one lineage capturing another and keeping it — which the tree can represent as a reticulation, and which should carry the captive\'s metabolism into the host as a `symbiontOrgan`. The organ is already in the table with a negative power cost.',k:'MODEL',e:'L',i:3},
{c:'genome',t:'Developmental locking with a real time constant',n:['genomeobj'],d:'Shipped: `lockChance(tau, ageMyr, popN) = clamp(age/tau) × (1 − 1/√N)`, with per-axis tau from the JSON — symmetry 40 Myr, skeleton 120, integument 600. This is what makes convergence costly rather than free, and it is why nothing goes back from bilateral.',k:'MODEL',e:'M',i:3},
{c:'genome',t:'A locked axis should be visible as a constraint',n:['genomeobj'],d:'A player who cannot understand why their lineage will not grow a shell is looking at a lock. Show the lock set on the species page, with its age and the population size that would be small enough to break it.',k:'SHOW',e:'S',i:2},
{c:'genome',t:'Genome size as a quantity with a cost',d:'More modules should cost more to copy, take longer to divide, and need a polymer that can hold them. Right now organ count is free, which means the optimum is always "more organs" and there is no reason for a streamlined lineage to exist.',k:'MODEL',e:'M',i:2},
{c:'genome',t:'A regulatory layer, so one change moves many parts',g:'regul',d:'The genome has counted axes and organs; what it lacks is anything that couples them. A small regulatory network — a handful of parameters that each scale several expressed quantities — is what produces correlated change, which is what makes a lineage look like a lineage rather than a bag of independent traits.',k:'MODEL',e:'L',i:3},
{c:'genome',t:'Pleiotropy and the cost of it',n:['regul'],d:'Once one parameter moves several parts, improving one thing damages another. That constraint is why evolution produces compromises rather than optima, and it is the single most legible source of "why is this animal like this" in the whole design.',k:'MODEL',e:'M',i:2},
{c:'genome',t:'Neutral drift in the parts nobody is looking at',d:'Most substitutions are neutral. Give the genome a neutral region that accumulates change at a clock rate — it costs nothing, it makes the molecular clock real, and it is what a phylogeny is actually built from.',k:'MODEL',e:'S',i:3},
{c:'genome',t:'A sequence a player can look at',n:['genomeobj'],d:'`genomeKey` produces a compact string. Render it as a readable card — axes, organ counts, bands, locks, biochemistry — because a genome that cannot be inspected might as well be a hash.',k:'SHOW',e:'M',i:3},
{c:'genome',t:'Diff two genomes',n:['genomeobj'],d:'Given a parent and a child, or two convergent lineages, show what changed. This is the single most explanatory view in the whole biosphere and it is a table with three columns.',k:'SHOW',e:'M',i:3},
{c:'genome',t:'Genomes must survive a save',n:['genomeobj'],d:'`serializeRun` version 3 stores terrain. A genome is plain JSON and small; not storing it means every biosphere anyone grows is deleted on reload, which is the same fault the landscape backlog fixed for terrain.',k:'MODEL',e:'S',i:3},
{c:'genome',t:'Paste a genome in',n:['genomeobj'],d:'The seed-word system already turns a world into four words. A creature should be shareable the same way, so somebody can post the thing they grew and somebody else can drop it into their own ocean and watch it fail.',k:'PLAY',e:'M',i:2},
{c:'genome',t:'A grammar test that is not about Earth',n:['genomeobj'],d:'Shipped: thirteen assertions in `test.mjs` covering pentaradial organ counts, the lens-eye prerequisite chain, the gilled-land-animal penalty, JSON round-trip and mutation determinism. Extend to a golden genome — a fixed seed producing a fixed body — so a grammar change that silently narrows the morphospace fails a test.',k:'MODEL',e:'M',i:3},

/* ---------------------------------------------------------------- devo -- */
{c:'devo',t:'A segmentation clock instead of an integer',g:'somite',d:'`segments` is a counted axis and it changes by ±1 or by doubling. Real somite number is the ratio of a genetic oscillator period to a growth wavefront speed — two parameters whose ratio is an integer, which is why segment counts are so evolvable and why they come in families.',k:'MODEL',e:'M',i:3},
{c:'devo',t:'Hox-like identity, so segments differ',g:'hox',n:['somite'],d:'`expressingSegments` says how many segments carry appendages, and nothing says which ones or what kind. An ordered identity map along the body axis is what separates a centipede from a crab, and it is a small array with an enormous visual payoff.',k:'MODEL',e:'M',i:3},
{c:'devo',t:'Appendage identity, not just appendage count',n:['hox'],d:'Once a segment has an identity, its appendage can be a leg, a jaw, a gill, an antenna or a claw — all serial homologues of one another. This is the mechanism behind most arthropod diversity and it makes limb count and limb function separate questions.',k:'MODEL',e:'M',i:3},
{c:'devo',t:'Growth, so a body has an age',g:'growth',d:'`expressBodyPlan` returns one size. An animal should grow along a curve from a juvenile size to an asymptote, which gives every sprite on the map a legitimate size distribution and gives extinction something size-selective to act on.',k:'MODEL',e:'M',i:3},
{c:'devo',t:'Allometry — parts that do not scale with the whole',n:['growth'],d:'Legs thicken faster than a body lengthens because strength goes as area and mass as volume. That single exponent difference is why a large animal looks different from a scaled-up small one, and it is one line in the expression code.',k:'MODEL',e:'S',i:3},
{c:'devo',t:'Larvae, and the fact that they disperse',n:['growth'],d:'A planktonic larva goes where the current takes it; a direct developer does not. `ocean.js` will have a velocity field. Larval type therefore decides range size, gene flow and — famously — who survives a mass extinction.',k:'MODEL',e:'M',i:3},
{c:'devo',t:'Metamorphosis as two bodies in one genome',n:['hox'],d:'A caterpillar and a butterfly share a genome and share no ecology. Letting one lineage express two plans at two life stages doubles the ecological space a lineage occupies and is the reason insects are most of Earth\'s species.',k:'MODEL',e:'L',i:2},
{c:'devo',t:'Plasticity — the same genome, a different body',d:'Temperature-dependent sex, seasonal morphs, predator-induced armour. A genome should express against local conditions, not in a vacuum. `expressBodyPlan` already takes an env argument and mostly ignores it.',k:'MODEL',e:'M',i:2},
{c:'devo',t:'Heterochrony, the cheapest source of a new body',d:'Change when development stops and you get a different animal from the same genome — an axolotl is a larva that reproduces. One parameter, enormous morphological range, and it is the mechanism most often invoked for major shape changes in the record.',k:'MODEL',e:'M',i:2},
{c:'devo',t:'Symmetry breaking should be a developmental event',d:'`symmetryOrder` is an integer that mutates. In development, symmetry is set early by a gradient and is nearly impossible to revisit, which is exactly why its lock constant is 40 Myr. Model the gradient and the lock stops being a constant somebody chose.',k:'MODEL',e:'M',i:2},
{c:'devo',t:'Regeneration, and what it costs',d:'A starfish regrows an arm; a mammal does not. High regenerative capacity trades against developmental complexity, and on a high-predation world it is worth a great deal.',k:'MODEL',e:'M',i:1},
{c:'devo',t:'Modularity, so parts can evolve separately',n:['hox'],d:'The reason a body can change its jaw without changing its gut is that development is modular. Without modules, every mutation is pleiotropic and evolution stalls — which is a real finding and a real thing to show.',k:'MODEL',e:'M',i:2},
{c:'devo',t:'Canalisation — why some things stop varying',d:'Well-buffered development produces the same body across a range of conditions until the buffer breaks, and then variation appears all at once. It is the mechanism behind punctuated change and it is a variance term, not a new system.',k:'MODEL',e:'M',i:1},
{c:'devo',t:'Show an embryo',n:['growth'],d:'The most persuasive way to show that a body is generated rather than looked up is to run the generation in front of the player: segments appearing one at a time, appendages budding, the body taking shape from the parameters on screen.',k:'SHOW',e:'M',i:3},
{c:'devo',t:'A growth series in the field guide',n:['growth'],d:'Juvenile, subadult, adult, drawn side by side from one genome. This is what a real field guide plate looks like and it makes allometry visible without a single word of explanation.',k:'SHOW',e:'M',i:2},
{c:'devo',t:'Developmental failure as a real outcome',d:'`plan.viable` is computed and nothing acts on it. A genome whose expression exceeds its power or mass budget should fail to develop, and that failure should be a visible fraction of each generation rather than a silent filter.',k:'MODEL',e:'S',i:2},
{c:'devo',t:'Generation time from body size',n:['growth'],d:'Generation time scales roughly as mass to the quarter power, and it sets how fast a lineage can evolve. A whale and a bacterium in the same tick are not doing the same amount of evolution, and right now they are.',k:'MODEL',e:'M',i:3},
{c:'devo',t:'Parental care as an investment with a payoff curve',d:'`repro` is `traits[6]` and means nothing specific. Make it the split between number of offspring and investment per offspring — the r/K axis — and let the environment decide which end pays, because that is one of the few genuinely predictive results in ecology.',k:'MODEL',e:'M',i:2},
{c:'devo',t:'Colonial and modular bodies',d:'A coral, a siphonophore, a fungus: a body that is a population. The `sociality` axis has `colonial` and `superorganism` and neither expresses to anything. A modular body has no fixed size and no fixed shape, which the expression code currently cannot represent.',k:'MODEL',e:'M',i:2},
{c:'devo',t:'A development test with a fixed output',n:['somite'],d:'Given a genome and an environment, expression must be deterministic and stable across versions. Without that, every visual item downstream is standing on sand.',k:'MODEL',e:'S',i:3},

/* -------------------------------------------------------------- morpho -- */
{c:'morpho',t:'Symmetry as an integer, so five-fold is reachable',g:'symorder',d:'Shipped: `symmetryOrder` runs 0–12 with 0 meaning no axis at all. The old model had two values, `radial` and `bilateral`, chosen by whether body mass was under 0.2. A pentaradial body has five equally good directions and therefore no head, which is a real and consequential fact about echinoderms that no enum can express.',k:'MODEL',e:'M',i:3},
{c:'morpho',t:'Organ counts that follow from the body\'s own symmetry',g:'organcount',n:['symorder'],d:'Shipped: `organCountFor` gives a bilateral body a pair, a triradial body three, a pentaradial body five. Three eyes is not a special case in this scheme — it is what a triradial animal has, and a tuatara\'s parietal eye is what a bilateral animal gets when a median organ survives.',k:'MODEL',e:'M',i:3},
{c:'morpho',t:'Limb count from segments and identity, not from a lookup',n:['organcount','hox'],d:'The old code was `limbs = mass < 0.25 ? 0 : mass < 0.45 ? 4 : trop > 0.55 ? 4 : 6`. Three values, all decided by mass. Limb count should be segments times appendages per segment times how many segments express — which reaches 24 pairs on a myriapod and zero on a snake.',k:'MODEL',e:'M',i:3},
{c:'morpho',t:'A morphospace worth the name',g:'morphospace',n:['symorder','organcount'],d:'Measured before: 26 discrete plans across 20,736 sampled trait vectors. Measured after: 1.6 × 10²⁸ distinguishable genomes from ten option axes, eight counted axes and 27 organs. The number is not the point — reachability is, and the items in `popgen` and `speciate` are what decide how much of it a planet ever visits.',k:'MODEL',e:'M',i:3},
{c:'morpho',t:'Occupied morphospace as a number on screen',n:['morphospace'],d:'Shipped: `countMorphs` and `W.morphospaceOccupied`, printed in the HUD next to the clade count and in the deep-time probe as `bodies=`. How many structurally distinct bodies are alive is a better one-number summary of a biosphere than how many lineages are.',k:'SHOW',e:'S',i:3},
{c:'morpho',t:'Incompatibility as a price, not a veto',g:'morphpen',n:['morphospace'],d:'Shipped: twelve rules in `genome.js` multiplying into `node.morphMult` and folded into `fitness()`. A gilled land animal costs 0.25 and lives; a phototroph at a vent costs 0.08 and does not. Convergence is allowed and paid for, which is the honest version of "some bodies are silly".',k:'MODEL',e:'M',i:3},
{c:'morpho',t:'Say why the body is penalised',n:['morphpen'],d:'Shipped: `node.morphWhy` carries the reasons and the HUD shows the multiplier with them on hover. A number that says a body is bad is worth much less than a sentence saying gill lamellae collapse in air.',k:'SHOW',e:'S',i:3},
{c:'morpho',t:'The silhouette test rejected nothing',d:'Fixed this pass. `passesSilhouette` compared against `plan.silhouette`, which was computed as `limbs >= 2 || symmetry === \'radial\' || appendage === \'frond\' ? 1 : 0.4` — a condition every reachable body satisfies, so across 20,736 sampled bodies the score took exactly one value. It is now a graded score over limbs, segments, defence and size.',k:'MODEL',e:'S',i:2},
{c:'morpho',t:'Body mass in grams, not in a 0–1 float',g:'realmass',d:'Shipped as `sizeClass`: log10 grams offset by 4, so 0 is 0.1 µg and 14 is 10 tonnes. Every allometric law in the `physio` category needs a real mass, and `traits[4]` between 0 and 1 could not supply one.',k:'MODEL',e:'S',i:3},
{c:'morpho',t:'Body plans that are not animals',d:'The grammar leans animal. A tree is a body plan: modular, indeterminate, photosynthetic, with a transport problem and a mechanical one. A fungal mycelium is another. Neither fits the current axes and both are more of the planet\'s biomass than animals are.',k:'MODEL',e:'L',i:3},
{c:'morpho',t:'Sessile bodies are a strategy, not an absence',d:'`locomotion: sessile` is the ancestral state and reads as "has not evolved yet". Most of the biomass in the ocean is sessile or drifting, and sessility drives its own morphology entirely — filter arms, holdfasts, chemical defence, broadcast spawning.',k:'MODEL',e:'M',i:2},
{c:'morpho',t:'Convergence should be recognisable across the tree',d:'`detectConvergence` compares trait vectors of at most 60 pairs a tick and logs a name pair. With genomes it can compare body plans, which is what convergence actually means — an ichthyosaur and a dolphin have different genomes and the same silhouette.',k:'MODEL',e:'M',i:2},
{c:'morpho',t:'A morphospace plot',n:['morphospace'],d:'Two axes of the body space, every living lineage as a point, extinct ones as ghosts, and the empty regions visible. Empty regions are the most interesting part of any real morphospace plot because they are the shapes that do not work.',k:'SHOW',e:'M',i:3},
{c:'morpho',t:'Disparity and diversity are different numbers',n:['morphospace'],d:'Diversity is how many lineages; disparity is how much of the morphospace they span. The Cambrian is famous for having high disparity at low diversity, and telling those two apart is the difference between a chart and an argument.',k:'SHOW',e:'M',i:2},
{c:'morpho',t:'Gravity should reach the body',n:['realmass'],d:'Shipped partially: expression scales size by `1.15/√g`. The real consequence is structural — limb cross-section must rise as mass over the strength of the material, so a 0.13 g moon permits shapes a 2.4 g super-Earth forbids. The catalogue has both and they currently grow the same animals.',k:'MODEL',e:'M',i:3},
{c:'morpho',t:'Fluid density decides whether a body needs a skeleton at all',n:['solvent'],d:'A jellyfish works because seawater carries it. In air it is a puddle. Since the solvent data now carries density, buoyant support versus structural support becomes a computation rather than an assumption.',k:'MODEL',e:'M',i:2},
{c:'morpho',t:'Armour, spines and the cost of carrying them',d:'`armour` is derived from skeleton and integument and does nothing except tint a sprite. Armour should slow a body, cost energy to grow, and pay off only where predation is high — which requires the `coevo` category to exist.',k:'MODEL',e:'M',i:2},
{c:'morpho',t:'Colour as a signal that needs a receiver',d:'Shipped in part: `pigmentBiasOf` derives colour bias from the bands the lineage\'s own eyes are tuned to. The full version needs a receiver in another lineage — there is no point being red on a world where nothing sees red, which is a genuinely alien result the model can now reach.',k:'MODEL',e:'M',i:3},
{c:'morpho',t:'Body plans should be nameable',d:'`cladeName` has ten roots and eight suffixes: eighty possible names for every clade on every planet in the catalogue, drawn from Greek roots that mean specific Earth things. A name generated from the actual body — its symmetry, its habit, its feeding — would say something.',k:'SHOW',e:'M',i:2},
{c:'morpho',t:'A body plan census per era',n:['morphospace'],d:'How many bodies were sessile, how many had eyes, how many were over a kilogram — plotted against deep time. That chart is the history of the biosphere in one picture, and every quantity in it now exists.',k:'SHOW',e:'M',i:2},
];

const P2 = [
/* --------------------------------------------------------------- sense -- */
{c:'sense',t:'Senses exist at all',g:'senseorgan',d:'Shipped this pass. Before it the string "eye" appeared nowhere in `vr/sim/`. `vr/data/life/sensors.json` now carries nineteen receptor modalities with their wavelength ranges, detector types, required media and a stated reason each one works; `vr/sim/sensory.js` decides which of them a given planet can support.',k:'MODEL',e:'L',i:3},
{c:'sense',t:'The photon energy test, which is why microwave eyes are not eyes',g:'photonlimit',n:['senseorgan'],d:'Shipped: `pigmentQuality` refuses any wavelength whose photon carries less than 82% of the 1.5 eV retinal isomerisation energy — about 1000 nm. A 1 mm microwave photon is 1.24 meV, which is 0.05 kT at 300 K. No chemical receptor can register one at any brightness, so a microwave eye must be an antenna or a cooled bolometer. This is the honest answer to the question and it is more interesting than yes.',k:'MODEL',e:'M',i:3},
{c:'sense',t:'Diffraction, so a sense has a size',n:['photonlimit'],d:'Shipped: `apertureForAcuity` says imaging at microwave wavelengths to human acuity needs a 70 m aperture, and at 10 µm needs 26 mm. Microwave sight is therefore a body-size problem rather than an impossibility — which is exactly the kind of constraint that makes an alien design feel earned.',k:'MODEL',e:'M',i:3},
{c:'sense',t:'A phased array as the only honest microwave eye',n:['photonlimit'],d:'Shipped in `organs.json`: `phasedArray` needs a brain, needs size class 8 and up, and spreads receptors along the segments so the aperture is the whole animal. It is tagged invented, because nothing on Earth does it — and it is what the physics says the answer would have to be.',k:'MODEL',e:'M',i:2},
{c:'sense',t:'Wien\'s law, so the star decides the visible band',g:'starband',n:['senseorgan'],d:'Shipped: band photon shares are integrated from the Planck photon distribution, so a 3000 K dwarf peaks at 966 nm and its planet\'s best imaging band is red, weakly. Measured across four worlds: Earth ranks red/green/blue; TRAPPIST-1e ranks chemical first and red fourth. An M-dwarf world smells before it sees, and that came out of the physics rather than out of a ruleset flag.',k:'MODEL',e:'M',i:3},
{c:'sense',t:'Atmospheric windows, so the air decides too',n:['starband'],d:'Shipped: ozone attenuates UV, water vapour closes the thermal IR outside the 8–13 µm window, haze scales everything visible, the radio window stays open. Titan\'s haze at 0.9 leaves acoustic sensing competitive with sight, which is the correct answer for a world under an orange smog.',k:'MODEL',e:'M',i:3},
{c:'sense',t:'The medium, so water and brine decide as well',n:['starband'],d:'Shipped: seawater attenuation by wavelength — blue at 0.045 per metre, red at 0.45, IR at 12 — so a body at 300 m sees nothing at all. Under a 15 km ice shell the best sense is chemical and the best imaging sense is electroreception, which is asserted in the test suite.',k:'MODEL',e:'M',i:3},
{c:'sense',t:'Electroreception needs a conductor',n:['senseorgan'],d:'Shipped: the `electric` band requires water or brine. In seawater a muscle twitch is microvolts per centimetre at a metre; in air it is nothing. Electroreception evolved independently at least eight times on Earth, always in water, and it is the right answer for a lightless subsurface ocean.',k:'MODEL',e:'S',i:3},
{c:'sense',t:'Echolocation as active imaging where the photons are zero',n:['senseorgan'],d:'Shipped as `echoEmitter`, gated on a tympanum and a brain. Sound is the only imaging modality left under an ice shell or on a night side, and its resolution rises with frequency and with the speed of sound in the medium — so a dense atmosphere is a better ear.',k:'MODEL',e:'M',i:2},
{c:'sense',t:'A sense the world does not deliver should decay',n:['senseorgan'],d:'Cave fish lose eyes in tens of thousands of years because an unused organ is a cost with no return. `mutateGenome` already has loss at the highest rate of any operator; what is missing is the selective term that makes losing a useless eye an improvement rather than a coin flip.',k:'MODEL',e:'M',i:3},
{c:'sense',t:'Sensory ecology — what a lineage can detect decides what it can eat',d:'A predator that cannot resolve its prey is not a predator. Tie the trophic axis to sensory capability so that `apexPredator` requires an imaging sense good enough at that body size, and the ecology stops being a set of independent labels.',k:'MODEL',e:'M',i:3},
{c:'sense',t:'Show the world through the animal\'s sense',g:'senseview',n:['starband'],d:'The single strongest visual idea in this whole document: render the local map as the dominant lineage perceives it. Blue-shifted and dim on an M dwarf, a field of electric contours under ice, a sonar sweep on a hazy world. The picture is already a per-cell composite; this is a different colour mapping over the same fields.',k:'SHOW',e:'L',i:3},
{c:'sense',t:'A sense readout in the HUD',n:['starband'],d:'Shipped: `W.topSense` and `W.senseBands` are computed in `morphTick` and the dominant one appears beside the clade count. It answers "what is this world like to live in" in one word.',k:'SHOW',e:'S',i:3},
{c:'sense',t:'Why that sense and not another',n:['starband'],d:'`bandViability` already returns a `why` string for every band — "1.24 meV is below the 1.5 eV a pigment needs", "the medium does not deliver it", "blurred: 24 mrad at a 6 cm aperture". Put that table in the Lab. It is the best teaching surface the product has and it is currently only reachable from a probe script.',k:'SHOW',e:'M',i:3},
{c:'sense',t:'Polarisation, magnetism and gravity as minor senses with real jobs',d:'In the data with utilities of 0.45, 0.3 and 0.25. A magnetic sense is worthless on a world with no dynamo — which the catalogue has several of — and that is a nice, cheap way for a planetary parameter to reach an animal.',k:'MODEL',e:'S',i:2},
{c:'sense',t:'Signalling, once there is a receiver',n:['senseview'],d:'Bioluminescence, colour, sound, electric discharge — all in the organ table as effectors. A signal only pays if something can receive it, which makes signalling the first genuinely two-lineage system in the model.',k:'MODEL',e:'M',i:2},
{c:'sense',t:'Sensory cost in the power budget',d:'Shipped: every organ carries `massFrac` and `powerFrac`, a lens eye costs 8% of power and a phased array 14%, and `plan.metabolicLoad` sums them. What is missing is the selection that makes an over-sensored body actually lose.',k:'MODEL',e:'M',i:2},
{c:'sense',t:'Nervous system as the gate on what a sense is worth',d:'Shipped: `lensEye` and `compoundEye` require a ganglion or better. An eye on a nerve net is wasted tissue, and this is why the nervous axis exists as an axis rather than a flag.',k:'MODEL',e:'S',i:2},
{c:'sense',t:'Sleep, attention and the limits of a brain',d:'Every nervous system so far described is free once built. Processing has a cost and a bandwidth, which is what makes compound eyes and lens eyes different trades rather than one being better.',k:'MODEL',e:'M',i:1},
{c:'sense',t:'A sensory test per catalogue world',n:['starband'],d:'Run `viableBands` for all 120 parameterised bodies and commit the top three per world. It is a fifty-line script, it produces a table nobody has ever seen, and it turns every future change to the physics into something reviewable.',k:'MODEL',e:'M',i:3},

/* -------------------------------------------------------------- energy -- */
{c:'energy',t:'Gibbs free energy instead of a yield column',g:'deltag',d:'`GUILDS` has a hand-written `yield` per row. The real quantity is ΔG = ΔG° + RT ln Q, which depends on the concentrations `W.species` already tracks and on temperature. Then a metabolism becomes viable or not by arithmetic, and the redox tower orders itself instead of being ordered by hand.',k:'MODEL',e:'L',i:3},
{c:'energy',t:'Maintenance cost that scales with mass and temperature',n:['deltag'],d:'`maint = (0.04 + max(0, 0.5 − T) × 0.08) × maintScale` — a fitted constant with a hand-tuned per-guild multiplier. Basal metabolic rate scales as mass to the three-quarter power and roughly doubles per ten kelvin. Both are measured, both are one line.',k:'MODEL',e:'M',i:3},
{c:'energy',t:'Kleiber\'s law where it belongs',g:'kleiber',n:['realmass'],d:'`kleiberDensity` exists in `evolve.js` and is called from one place in `ecology.js` and one test. With a real body mass it should set population density, food requirement, generation time, lifespan and home-range size — five quantities from one exponent, all of which the rest of this document wants.',k:'MODEL',e:'M',i:3},
{c:'energy',t:'A power budget a body has to balance',n:['kleiber'],d:'Shipped in part: `plan.powerLoad` sums organ costs and `plan.viable` fails above 1. What is missing is income — the energy the body actually acquires from its trophic level and its habitat — so the budget currently has an expense column and no revenue.',k:'MODEL',e:'M',i:3},
{c:'energy',t:'Trophic transfer efficiency, which is why there are four levels',d:'About 10% of energy crosses each trophic step, which is the reason food chains are short and apex predators are rare. Nothing in the model enforces it, so `apexPredator` can be as abundant as a phototroph.',k:'MODEL',e:'M',i:3},
{c:'energy',t:'Standing biomass versus productivity',d:'`W.life[c]` is one number doing both jobs. A forest has high biomass and moderate productivity; a plankton bloom has the reverse. Separating them is what makes NPP maps and biomass maps different pictures, and `nppField` already computes one of them.',k:'MODEL',e:'M',i:2},
{c:'energy',t:'Photosynthetic efficiency against the real spectrum',n:['starband'],d:'`photonUsable` is a three-branch step on stellar temperature. With the Planck integration now in `sensory.js` the usable fraction can be computed against a pigment\'s actual absorption curve, and the multi-photon schemes an M-dwarf plant would need fall out as a cost.',k:'MODEL',e:'M',i:3},
{c:'energy',t:'Chemosynthesis with a real flux',n:['ventfield'],d:'`W.chemoPower = tidalHeat + 0.02 + radiogenic × 0.01` is invented and global. Vent chemosynthesis is limited by hydrogen and sulfide flux through specific chimneys, which is a per-cell quantity with a real budget — and it is the only energy source an ice moon has.',k:'MODEL',e:'M',i:3},
{c:'energy',t:'Radiotrophy, tagged as speculative',d:'`radiotroph` is in the trophic axis. Melanised fungi in reactor water are the evidence and the energetics are marginal. Put it in with the numbers and the doubt attached, because a world with a strong radiation flux is one of the few places it might not be marginal.',k:'MODEL',e:'M',i:1},
{c:'energy',t:'Anaerobic energy as a different ceiling, not a penalty',d:'Anaerobic metabolism yields roughly a fifteenth of aerobic per unit of carbon, which is why large active animals need oxygen. That ratio should set a body-size ceiling directly rather than appearing as a fitness multiplier.',k:'MODEL',e:'M',i:3},
{c:'energy',t:'Oxygen partial pressure as the ceiling on insect size',d:'Tracheal diffusion is why arthropods are small and why they were larger in the Carboniferous at 35% oxygen. Shipped as an incompatibility rule; it deserves to be a continuous limit computed from diffusion length rather than a threshold.',k:'MODEL',e:'M',i:2},
{c:'energy',t:'Endothermy as a bill, not a flag',d:'A mammal spends five to ten times a reptile\'s energy at rest and buys activity at low temperature. `T.endothermy` is a global boolean that fires on an oxygen threshold and a die roll. It should be a per-lineage strategy that only pays where the thermal environment makes it pay.',k:'MODEL',e:'M',i:3},
{c:'energy',t:'The biosphere\'s total power on screen',d:'One number in watts — the free energy the whole biosphere dissipates per second. It is the most honest single measure of how alive a planet is, it is comparable across every world in the catalogue, and it would replace `meanLife`, which is a dimensionless average of a dimensionless field.',k:'SHOW',e:'M',i:3},
{c:'energy',t:'An energy flow diagram',d:'Sun in, primary production, respiration, burial, out. A Sankey with real numbers per era. Every quantity in it exists somewhere in `carbon.js` or `redox.js` and none of them are shown together.',k:'SHOW',e:'M',i:2},
{c:'energy',t:'Thermodynamic honesty in the god layer',d:'`god/economy.js` has a thermo cost model for player actions. The biosphere itself has no such accounting, so a miracle is priced and a metabolism is not. One ledger for both would be a genuinely unusual thing for a game to have.',k:'PLAY',e:'M',i:2},
{c:'energy',t:'Nutrient limitation as Liebig\'s minimum',d:'`carryingCapacity` multiplies by `min(nutrientN, nutrientP)`, which is the right shape. Extend to iron in the open ocean — iron limitation is why the Southern Ocean is a desert and why dust from a continent matters to plankton a thousand kilometres away.',k:'MODEL',e:'M',i:2},
{c:'energy',t:'Seasonality of production',d:'`nppField` runs on instantaneous temperature and light. A spring bloom, a monsoon flush, a polar summer — all of them are the same field with a phase, and the presentation clock in `present.js` already has one.',k:'MODEL',e:'M',i:2},
{c:'energy',t:'Storage, dormancy and getting through the bad season',d:'Seeds, spores, fat, hibernation, cysts. On a high-eccentricity or high-obliquity world these are worth more than any improvement to the good season, and the catalogue has worlds with obliquities that would make that decisive.',k:'MODEL',e:'M',i:2},
{c:'energy',t:'The energy cost of being where you are',d:'Osmoregulation in fresh water, water loss in air, heat loss in cold, pressure in the deep. Each habitat should carry a standing cost that the body has to earn back, which is what makes habitat transitions rare and meaningful.',k:'MODEL',e:'M',i:2},
{c:'energy',t:'A calibrated energy test against modern Earth',d:'`calibrate.mjs` asserts climate scalars. Net primary production on Earth is about 105 petagrams of carbon a year and total biosphere power is order 100 terawatts. Assert both, and the energy model stops being unfalsifiable.',k:'MODEL',e:'M',i:3},

/* -------------------------------------------------------------- physio -- */
{c:'physio',t:'Surface-to-volume as a first-class quantity',g:'sav',n:['realmass'],d:'Nothing in the model computes it, and it is the single constraint behind gas exchange, heat balance, water loss and nutrient uptake. One derived number per body, recomputed on expression, unlocks five items below.',k:'MODEL',e:'S',i:3},
{c:'physio',t:'The square-cube law, so gravity limits size',n:['sav'],d:'Strength scales with cross-sectional area and load with volume, so maximum size falls with gravity. On the 0.13 g moons in the catalogue this permits shapes that a 2.4 g super-Earth forbids, and right now both grow the same animal.',k:'MODEL',e:'M',i:3},
{c:'physio',t:'Diffusion limits, so a body needs a delivery system',n:['sav'],d:'Oxygen diffuses usefully over about a millimetre of tissue. Past that a body needs a circulatory system, and past a further point it needs a pump with separated pressures. Those two thresholds are why the respiration axis exists.',k:'MODEL',e:'M',i:3},
{c:'physio',t:'Countercurrent exchange as a real gain',d:'In the organ table already. A fish gill extracts most of the oxygen from water that holds a fortieth of what air does, and the same geometry does heat and salt. It is the highest-leverage single organ in the table and it should visibly raise the oxygen ceiling for its holder.',k:'MODEL',e:'M',i:2},
{c:'physio',t:'Thermal balance from a real heat budget',n:['sav'],d:'`thermal` is an axis with seven options and no equations. Metabolic heat in, radiative and convective loss out, area from the body, insulation from the integument — a four-term budget that decides whether an endotherm can exist at this size on this world.',k:'MODEL',e:'M',i:3},
{c:'physio',t:'Bergmann and Allen, which fall straight out of that budget',d:'Bodies get larger and extremities shorter toward the cold. Both are consequences of surface-to-volume, both are visible in a sprite, and both would appear without being written down once the heat budget exists.',k:'MODEL',e:'S',i:3},
{c:'physio',t:'Gigantothermy as the reason large things stay warm',d:'A big enough body holds its heat without paying for endothermy. That is the standard explanation for large dinosaurs and leatherback turtles, and it is the same equation with a different mass.',k:'MODEL',e:'S',i:2},
{c:'physio',t:'Water balance on land',d:'`desiccation` is `traits[2]` and gates a fitness term. The real quantity is water loss across a permeable surface against water gained by eating and drinking, and it is why an amphibian and a reptile occupy different parts of the same continent.',k:'MODEL',e:'M',i:2},
{c:'physio',t:'Osmoregulation and the freshwater barrier',d:'Moving between salt and fresh water is a serious physiological problem and it is why the freshwater fauna of every continent is distinct. The habitat axis lists `freshwater`; nothing charges for entering it.',k:'MODEL',e:'M',i:2},
{c:'physio',t:'Pressure, and the deep as a real place',d:'`gasBladder` fails below a depth-dependent pressure — noted in the organ table, not modelled. Below that a body needs lipid buoyancy and protein adaptations, which is why the deep ocean fauna looks the way it does.',k:'MODEL',e:'M',i:2},
{c:'physio',t:'Locomotion cost by medium and by gait',d:'Swimming, walking and flying have different cost-of-transport curves against mass, and flying has a hard upper mass limit set by wing loading. Shipped as a penalty rule at size class 11; the curve is better than the threshold.',k:'MODEL',e:'M',i:2},
{c:'physio',t:'Reynolds number, because small things live in syrup',d:'A bacterium swimming is a body in a fluid where inertia does not exist, which is why flagella and cilia work the way they do and why a scaled-down fish would not move. With solvent viscosity now in the data this is computable, and it is the most vivid single fact about being small.',k:'MODEL',e:'M',i:2},
{c:'physio',t:'Lifespan from mass and metabolic rate',n:['kleiber'],d:'Lifespan scales roughly as mass to the quarter power, and total heartbeats are famously near-constant across mammals. It gives every creature an age, which the presentation layer needs and does not have.',k:'MODEL',e:'M',i:2},
{c:'physio',t:'Bone, chitin, silica and lignin as materials with numbers',d:'The skeleton axis has thirteen options and no material properties. Density, tensile strength and cost per gram would let the structural items compute rather than assume, and would explain why a large arthropod is impossible and a large tree is not.',k:'MODEL',e:'M',i:2},
{c:'physio',t:'Vascular transport and the height limit of a plant',d:'Water column tension limits a tree to about 120 metres on Earth, and that limit moves with gravity and with atmospheric pressure. It is a beautiful, cheap, planet-dependent number that would visibly change the look of a forest between worlds.',k:'MODEL',e:'M',i:3},
{c:'physio',t:'Immunity and the cost of defence',d:'`defence` is `traits[8]`. Immunity is a standing cost that pays only under parasite pressure, which is another system that needs the `coevo` category before it means anything.',k:'MODEL',e:'M',i:1},
{c:'physio',t:'Radiation tolerance with an actual dose',d:'`traits[10]` is nudged upward by `alienTick` on flare stars. Dose depends on magnetosphere, atmospheric column and stellar activity — all three in `worldParams.js` — and the tolerance should be a repair investment with a cost.',k:'MODEL',e:'M',i:2},
{c:'physio',t:'Physiology should appear in the species page',d:'Mass, resting power, thermal tolerance, oxygen requirement, maximum size, lifespan. Six numbers, all derived, all changing as the lineage evolves. This is the readout that makes physiology real to a player.',k:'SHOW',e:'M',i:3},
{c:'physio',t:'A physiology test against real animals',d:'Give the model a mouse and an elephant and check that the ratio of their resting metabolic rates lands near the Kleiber prediction. If it does not, no other item in this category is safe.',k:'MODEL',e:'M',i:3},
{c:'physio',t:'Show the limits, not just the outcome',d:'When a lineage stops growing because oxygen will not diffuse far enough, say so. A ceiling that is invisible is indistinguishable from a bug.',k:'SHOW',e:'M',i:3},

/* -------------------------------------------------------------- popgen -- */
{c:'popgen',t:'An individual is 24,000 square kilometres',g:'popscale',d:'`node.pop` counts occupied cells. At N=64 each is about 157 km across, so the model\'s unit of population is a region the size of a small country. Every genetic quantity below is meaningless until population is a number of organisms derived from density and area, which `kleiberDensity` can supply.',k:'MODEL',e:'M',i:3},
{c:'popgen',t:'Effective population size that means something',n:['popscale'],d:'`Ne = max(1, node.pop)`. Real Ne is smaller than census size by a factor that depends on breeding structure, variance in reproductive success and bottleneck history, and it is the single number that decides whether selection or drift wins.',k:'MODEL',e:'M',i:3},
{c:'popgen',t:'Drift as a variance, not a mutation bonus',n:['popscale'],d:'The code uses `drift = 1/√Ne` to *raise the mutation rate*. Drift is the opposite: it is random change in frequency that overwhelms weak selection when Ne is small. As written, small populations evolve faster in a directed sense, which is backwards.',k:'MODEL',e:'S',i:3},
{c:'popgen',t:'Selection coefficients, so strength has units',d:'`fitness()` returns a multiplier used to pick which lineage claims an empty cell. A selection coefficient s is the fractional advantage per generation, and whether s beats 1/Ne is the whole question of whether a trait spreads at all.',k:'MODEL',e:'M',i:3},
{c:'popgen',t:'The neutral theory, so most change is not adaptive',d:'Most substitutions fix by drift. A model where every change is selected produces a biosphere that looks designed, which is the commonest failure mode of evolution simulations and is exactly what this one does.',k:'MODEL',e:'M',i:3},
{c:'popgen',t:'Standing variation, so a population is not a point',d:'A lineage is one trait vector and one genome. A real population is a distribution, and the width of that distribution is what decides how fast it can respond to a change. Carrying a variance per axis is the cheapest possible version and it changes the dynamics completely.',k:'MODEL',e:'M',i:3},
{c:'popgen',t:'Bottlenecks that leave a genetic signature',d:'Cheetahs, northern elephant seals, every island colonisation. A bottleneck should cut variance and leave it cut for a long time — which is what makes a recovered population still fragile.',k:'MODEL',e:'M',i:2},
{c:'popgen',t:'Founder effects at range edges',d:'A lineage expanding into new territory carries a sample of its variation, so range edges are genetically odd. Shipped in part: speciation now applies one to three genome mutations to the founder population.',k:'MODEL',e:'S',i:2},
{c:'popgen',t:'Gene flow between populations that touch',d:'Two populations of the same lineage in adjacent cells should exchange migrants at a rate that depends on dispersal and distance. Without gene flow there is no such thing as isolation, and therefore no principled way to say when a split has become a species.',k:'MODEL',e:'M',i:3},
{c:'popgen',t:'Mutational load, and the fact that it accumulates',n:['sex'],d:'Every population carries deleterious mutations; sex and large populations purge them and asexual small populations do not. This is the mechanism behind extinction vortices in small populations and it is completely absent.',k:'MODEL',e:'M',i:2},
{c:'popgen',t:'Frequency-dependent selection',d:'Being rare is often an advantage — for a prey pattern, for a mating type, for a pathogen resistance allele. It is one of the few mechanisms that actively maintains diversity rather than eroding it, and nothing here maintains diversity at all.',k:'MODEL',e:'M',i:2},
{c:'popgen',t:'Sexual selection as a second, opposed pressure',d:'Antlers, tails, songs, colours — traits that reduce survival and increase mating success. It is the standard explanation for most of the ornament in the animal kingdom, and it needs the sexes to exist first.',k:'MODEL',e:'M',i:2},
{c:'popgen',t:'Kin selection and Hamilton\'s rule',d:'`rb > c`. Eusociality is in the sociality axis and has no mechanism behind it; relatedness is the mechanism, and it explains why haplodiploid lineages evolve it repeatedly.',k:'MODEL',e:'M',i:2},
{c:'popgen',t:'Allee effects, so small populations fail non-linearly',d:'Below a threshold density, finding a mate becomes the limiting factor and the population collapses even in a good environment. The current extinction hazard is `pop < 3` and a die roll, which is the same idea without the mechanism.',k:'MODEL',e:'S',i:2},
{c:'popgen',t:'The Price equation as a diagnostic',d:'It decomposes any change in a mean trait into a selection term and a transmission term. Printing those two numbers per era answers "is this biosphere adapting or drifting" — a question the product currently cannot answer at all.',k:'MODEL',e:'M',i:2},
{c:'popgen',t:'Adaptive landscape as a picture',d:'Fitness over two trait axes, with living lineages as points climbing it. It is the oldest picture in evolutionary biology, it is directly computable from `fitness()`, and it would make selection visible for the first time.',k:'SHOW',e:'M',i:3},
{c:'popgen',t:'Show a lineage\'s variance, not just its mean',d:'A population drawn as a cloud rather than a dot is a different mental model, and it is what makes a bottleneck legible when it happens.',k:'SHOW',e:'M',i:2},
{c:'popgen',t:'Population size on the species page',n:['popscale'],d:'Census size, effective size, range area, density. Four numbers that turn "12 cells" into something a person can reason about.',k:'SHOW',e:'S',i:3},
{c:'popgen',t:'A drift test with a known answer',d:'A neutral allele in a population of size N fixes with probability equal to its frequency, in about 4N generations. That is an exact result and it is the cleanest possible test that the population genetics is not decorative.',k:'MODEL',e:'M',i:3},
{c:'popgen',t:'Make the timescale honest',d:'`dt` is capped at 2 Myr per phylogeny tick. Anything with a generation time in years experiences a million generations inside one tick, so per-tick probabilities are not per-generation probabilities and the code mixes the two freely.',k:'MODEL',e:'M',i:3},

/* ------------------------------------------------------------ speciate -- */
{c:'speciate',t:'Speciation needs more than one mechanism',g:'specmech',d:'`maybeSpeciate` is allopatry and nothing else: split the occupied cells into connected components, promote the second-largest with probability `0.01 × dt`. Sympatric divergence, polyploid instant speciation, host shifts and ring species all exist and all produce different tree shapes.',k:'MODEL',e:'M',i:3},
{c:'speciate',t:'Reproductive isolation as a quantity that accumulates',g:'isolation',n:['specmech'],d:'There is no isolation in the model — a split is instantaneous and irreversible the moment the components separate. Isolation should build with genetic distance and with time apart, so that two populations that rejoin early merge and two that rejoin late do not.',k:'MODEL',e:'M',i:3},
{c:'speciate',t:'Populations that rejoin should be able to merge',n:['isolation'],d:'Nothing in the code can ever reduce the lineage count except extinction. Merging is a real outcome and its absence is why the tree can only ever be a fan.',k:'MODEL',e:'M',i:3},
{c:'speciate',t:'Hybridisation, and the tree becoming a network',n:['isolation'],d:'Hybrid zones, introgression, hybrid speciation. A phylogeny that cannot represent reticulation is wrong about plants, wrong about the Archean, and wrong about several hominins.',k:'MODEL',e:'L',i:2},
{c:'speciate',t:'The pop >= 8 threshold is arbitrary and load-bearing',d:'A lineage must occupy eight cells before it can speciate at all. At N=64 that is a range of 1.2 million square kilometres — so no small-range lineage in this model can ever split, which is precisely backwards from the real pattern.',k:'MODEL',e:'S',i:3},
{c:'speciate',t:'Adaptive radiation as a rate that rises when niches empty',d:'`_recoveryBoost` decays at 0.99 per tick and adds one child at a time from `tree.living[0]`. A radiation is a burst of speciation driven by empty niche space, and niche space is something the `eco` category has to define first.',k:'MODEL',e:'M',i:3},
{c:'speciate',t:'Ring species, which need a real geography',d:'A chain of populations around a barrier, each interbreeding with its neighbours, with the ends unable to interbreed. It is the clearest demonstration that species are a continuum and it needs gene flow along a path.',k:'MODEL',e:'M',i:1},
{c:'speciate',t:'Polyploid speciation happens in one generation',n:['dupdiv'],d:'A genome duplication can produce reproductive isolation immediately, which is why it accounts for a large share of plant species. `wgd` is already an operator; it should be able to found a species by itself.',k:'MODEL',e:'S',i:2},
{c:'speciate',t:'Character displacement where two lineages overlap',d:'Two similar species in contact diverge faster than either does alone. It is one of the most repeatable patterns in ecology and it needs lineages to be able to see each other.',k:'MODEL',e:'M',i:2},
{c:'speciate',t:'Extinction and speciation as one balance',d:'Diversity is the integral of speciation minus extinction. Both rates should be reported, per era, with the balance visible — because a flat diversity curve can mean nothing is happening or that a great deal is happening at both ends.',k:'SHOW',e:'M',i:3},
{c:'speciate',t:'A species concept the product can state',d:'The model calls a node a species without ever saying what one is. Pick a definition, implement it, and say which one — because the answer changes the count and every chart downstream of the count.',k:'MODEL',e:'M',i:2},
{c:'speciate',t:'Cryptic species, which look identical',d:'If a species is defined by isolation rather than by shape, two lineages can be indistinguishable and separate. That is a real and common situation and it would make the field guide honest.',k:'MODEL',e:'S',i:1},
{c:'speciate',t:'Speciation should be a moment on the map',d:'`chronLog(W.year, \'speciation\', comps[i][0], 1, ...)` logs a cell. Draw it: the range splitting, the two halves diverging, the new name appearing. Shipped in part — the chronicle now carries the new body\'s description.',k:'SHOW',e:'M',i:3},
{c:'speciate',t:'A named lineage should stay named',d:'`cladeName` regenerates from traits and id. A species a player has been watching for a billion years should not silently become a different word, and its name should be the anchor for everything else about it.',k:'SHOW',e:'S',i:2},
{c:'speciate',t:'Lineage through time, per clade',d:'A lineage-through-time plot is the standard way to see whether diversification is accelerating, constant or slowing. `tree.diversityHistory` already holds the data and nothing draws it.',k:'SHOW',e:'M',i:2},
{c:'speciate',t:'The tree should be able to be a bush',d:'On the measured run every lineage is a child of LUCA — maximum depth one. Depth requires that a child can itself speciate, which requires it to reach pop 8, which requires the biomass problem in `gaia` to be fixed first. This is the dependency that blocks the entire phylogeny half of the product.',k:'MODEL',e:'M',i:3},
{c:'speciate',t:'Genetic distance, so branch length means something',d:'`node.substitutions += 0.01 × dt × Ne` — substitutions rise with population size, which is the opposite of the neutral expectation, where substitution rate equals mutation rate regardless of N. That is a sign error in the one quantity a molecular clock is built from.',k:'MODEL',e:'S',i:3},
{c:'speciate',t:'Let a player split a population',n:['isolation'],d:'Raise a mountain, open a strait, move a continent — the geology tools already do all three — and watch the lineage split as a consequence. That is the single best demonstration this product could give of what speciation is.',k:'PLAY',e:'M',i:3},
{c:'speciate',t:'Let a player forbid it',d:'A god who can prevent speciation learns what speciation was doing. Freezing the tree for an era and watching the biosphere fail to track a changing climate is a lesson no chart delivers.',k:'PLAY',e:'M',i:1},
{c:'speciate',t:'A speciation-rate test across seeds',d:'Five seeds, same settings, should give diversity curves whose spread is stated. If the spread is zero the model is deterministic in the wrong way; if it is enormous, nothing in the product is reproducible.',k:'MODEL',e:'M',i:3},
];

const P3 = [
/* --------------------------------------------------------------- phylo -- */
{c:'phylo',t:'Draw the tree',g:'treeview',d:'`W.tree` holds nodes, parents, births, deaths, traits, genomes and extinction reasons, and the only thing the product shows of it is three integers in the HUD. A tree view — time down, branches out, extinctions terminating, the living at the bottom — is the single largest piece of already-computed content that has never been rendered.',k:'SHOW',e:'L',i:3},
{c:'phylo',t:'Branch lengths that are substitutions',n:['treeview'],d:'A tree drawn on time alone hides the interesting part: which branches changed fast. `node.substitutions` exists, is computed with the wrong sign dependence, and is drawn nowhere.',k:'SHOW',e:'M',i:2},
{c:'phylo',t:'A molecular clock the player can calibrate',d:'Give the neutral region a substitution rate, let the player pick two lineages, and estimate their divergence time from genetic distance. Then compare against the true value the simulation knows. That comparison is how the method is taught and it is a genuinely novel thing for a game to let you do.',k:'PLAY',e:'M',i:2},
{c:'phylo',t:'Extinct clades belong in the picture',d:'`tree.nodes` keeps the dead with a `death` timestamp and an `extReason`. A phylogeny that shows only survivors is the standard misconception about evolution, and this product has the data to correct it for free.',k:'SHOW',e:'M',i:3},
{c:'phylo',t:'Collapse the tree to a readable rank',n:['treeview'],d:'At a few hundred lineages a full tree is a smear. Collapsing to clades that share a body plan — which the genome now makes computable — gives the same tree at a legible resolution.',k:'SHOW',e:'M',i:2},
{c:'phylo',t:'Tree topology metrics',d:'Balance, gamma, the shape of the lineage-through-time curve. These distinguish a tree produced by constant-rate birth-death from one produced by radiations and extinctions, and they are how a real phylogeneticist would check whether this model behaves.',k:'MODEL',e:'M',i:2},
{c:'phylo',t:'The tree should be searchable',n:['treeview'],d:'Find a lineage by name, by trait, by body plan, by era. A tree you cannot query is a wallpaper.',k:'SHOW',e:'M',i:2},
{c:'phylo',t:'Click a branch, get the animal',n:['treeview'],d:'The genome is on the node and expression is deterministic, so every point on the tree can render the body that was alive there. That is the payoff for the whole genome pass.',k:'SHOW',e:'M',i:3},
{c:'phylo',t:'Ancestral state reconstruction',d:'Given the tree and the tips, infer what the ancestor looked like — then show the real answer. It is a beautiful teaching device and the simulation is the only place where the true answer is available.',k:'PLAY',e:'M',i:2},
{c:'phylo',t:'Where the tree meets the map',d:'Colour the globe by clade rather than by biome. `cladeRGB` already exists and `popId` already carries the assignment; nothing draws it.',k:'SHOW',e:'M',i:3},
{c:'phylo',t:'A clade\'s range through time',d:'One lineage, its range drawn per era, animated. Expansion, fragmentation, refugium, extinction — the four-act structure of most clades, and all of it is already in `node.cells` if it were kept.',k:'SHOW',e:'M',i:2},
{c:'phylo',t:'Node history is not kept',d:'`node.cells` is cleared and rebuilt every tick, so no range history exists. Keeping a coarse range summary per era is cheap and unlocks four items here.',k:'MODEL',e:'M',i:3},
{c:'phylo',t:'Convergence detection on bodies, not on trait vectors',d:'`detectConvergence` sums absolute differences over eleven floats for up to 60 pairs per tick. Comparing expressed body plans instead finds the thing the word means — and the pair sampling should be replaced by a spatial hash over the morphospace.',k:'MODEL',e:'M',i:2},
{c:'phylo',t:'Sister taxa and the questions that need them',d:'The simplest comparative method is a sister-pair comparison. Exposing "the closest living relative of this lineage" makes the tree useful rather than decorative.',k:'SHOW',e:'S',i:2},
{c:'phylo',t:'Fossils belong on the tree',d:'`W.fossils[c]` keeps up to eight per cell with name, age, traits and reason. Placing them on the tree — and noting the ghost lineages implied by gaps — is how the fossil record and the phylogeny become one object.',k:'SHOW',e:'M',i:2},
{c:'phylo',t:'The fossil record should be incomplete on purpose',d:'Preservation depends on skeleton, environment and sedimentation, all of which exist. A perfect record teaches the wrong lesson; a biased one teaches the right one and makes the geology matter to the biology.',k:'MODEL',e:'M',i:3},
{c:'phylo',t:'Export the tree',d:'Newick is four lines of code and lets anyone open the result in real phylogenetics software. It is the cheapest possible bridge between this toy and the actual field.',k:'MODEL',e:'S',i:2},
{c:'phylo',t:'Taxonomy above the species',d:'Every lineage is a flat node. Grouping into named higher taxa as clades diverge would give the biosphere the structure a player can actually hold in their head.',k:'SHOW',e:'M',i:2},
{c:'phylo',t:'A tree that survives a save',d:'The tree is not serialised. A player who has grown a biosphere for an hour loses its entire history on reload, which is the same fault the landscape backlog fixed for terrain and the genome items fix for bodies.',k:'MODEL',e:'M',i:3},
{c:'phylo',t:'A phylogeny test on a known process',d:'Run a pure birth-death process with known rates through the same tree code and check the reconstructed rates come back. Without that, every tree statistic in this category is unverified.',k:'MODEL',e:'M',i:2},

/* ----------------------------------------------------------------- eco -- */
{c:'eco',t:'A diet, so one lineage can eat another',g:'diet',d:'The architecture document specifies `node.diet` as up to three prey lineage ids and it does not exist in the code. Until a lineage can name what it eats there is no food web, no cascade, no coextinction, and no reason for a predator to care about anything except temperature.',k:'MODEL',e:'M',i:3},
{c:'eco',t:'Abundance that depends on other abundances',g:'foodweb',n:['diet'],d:'Every population in the model grows against a carrying capacity set by the planet. Lotka–Volterra between lineages that share a cell is the smallest change that makes the biosphere an interacting system rather than a set of independent species each doing its own climate response.',k:'MODEL',e:'L',i:3},
{c:'eco',t:'Trophic cascades',n:['foodweb'],d:'Remove the predator, the grazer booms, the producer collapses. It is the most legible ecological result there is, it is a direct consequence of the food web, and it is the best possible demonstration of consequence in a god game.',k:'MODEL',e:'M',i:3},
{c:'eco',t:'Competitive exclusion, and the ways around it',n:['foodweb'],d:'Two lineages on the same resource in the same place cannot coexist indefinitely. What lets real communities be diverse is that the ways around it — niche partitioning, disturbance, spatial heterogeneity — are everywhere. Both halves need modelling or diversity is arbitrary.',k:'MODEL',e:'M',i:3},
{c:'eco',t:'A niche that is a thing, not a word',g:'niche',d:'The word appears in the briefs and nothing in the code defines one. A niche as a region of environmental and resource space, occupied or vacant, is what makes "an empty niche" a statement the simulation can check — and radiations depend on it.',k:'MODEL',e:'M',i:3},
{c:'eco',t:'Guild structure above the microbial layer',d:'`GUILDS` is metabolic and stops at bacteria. Grazers, browsers, ambush predators, scavengers, filter feeders — the functional groups of a macroscopic ecosystem — have no representation, so no ecosystem can be described as balanced or missing anything.',k:'MODEL',e:'M',i:2},
{c:'eco',t:'Decomposition as the loop that closes',d:'`decomposer` is one guild gated on `T.landPlants`. Decomposition is what returns nutrients, and the 60-million-year gap before lignin decay evolved is why the Carboniferous buried so much carbon that oxygen rose to 35%. That is a story this model is one field away from telling.',k:'MODEL',e:'M',i:3},
{c:'eco',t:'Detritus and the dead as a resource pool',n:['foodweb'],d:'Most energy in most ecosystems goes through the detrital pathway, not the grazing one. There is no detritus field, so the largest flow in the biosphere is missing.',k:'MODEL',e:'M',i:2},
{c:'eco',t:'Succession after disturbance',d:'Fire, eruption, ice retreat, a new island — the sequence of communities that follows is a well-understood and highly visible process, and every one of those disturbances already happens in this simulation.',k:'MODEL',e:'M',i:3},
{c:'eco',t:'Ecosystem engineers',d:'Beavers, corals, trees, earthworms, and on this planet\'s scale, the organisms that make soil. `W.soil[c] += life[c] × 0.004` is the entire representation, and niche construction deserves better because it is the bridge between the `eco` and `gaia` categories.',k:'MODEL',e:'M',i:2},
{c:'eco',t:'Reefs as structures, not a float',d:'`W.reef[c]` is a scalar that decays at 0.92 per tick. A reef is a physical structure that changes the coastline, the wave regime, the sediment and the habitat count — and it is the most visually distinctive biological landform there is.',k:'MODEL',e:'M',i:3},
{c:'eco',t:'Body size structure within a community',n:['kleiber'],d:'Real communities have far more small things than large things, in a predictable distribution. Checking that this model produces one is a strong test of whether its ecology is behaving.',k:'MODEL',e:'M',i:2},
{c:'eco',t:'Predator–prey size ratios',d:'Predators are typically an order of magnitude larger than their prey, with well-known exceptions. It is the cheapest possible constraint on who can eat whom and it makes food webs look right immediately.',k:'MODEL',e:'S',i:2},
{c:'eco',t:'Show the food web',n:['foodweb'],d:'Nodes sized by biomass, links weighted by flow, per biome. It is the picture that makes an ecosystem an object rather than a colour on a map.',k:'SHOW',e:'M',i:3},
{c:'eco',t:'Show the trophic pyramid',n:['foodweb'],d:'Producers, herbivores, carnivores, apex, with real biomass numbers. The 10% rule becomes obvious the moment it is drawn, and the pyramid is different on every world.',k:'SHOW',e:'M',i:3},
{c:'eco',t:'Diversity indices that are not a count',d:'Species richness ignores evenness. Shannon and Simpson, plus beta diversity between biomes, are four numbers that describe an ecosystem far better than one, and they are all one pass over `popId`.',k:'MODEL',e:'S',i:2},
{c:'eco',t:'The latitudinal diversity gradient should emerge',d:'`latitudinalDiversity` measures it. On a working model it should appear without being asked for — more species at the equator — and if it does not, something upstream is wrong. It is a free validation test.',k:'MODEL',e:'S',i:3},
{c:'eco',t:'Productivity–diversity relationships',d:'Diversity rises with productivity and then falls. Whether this model reproduces that hump is a real question with a real answer, and NPP is already computed per cell.',k:'MODEL',e:'M',i:2},
{c:'eco',t:'Let a player remove one species',n:['foodweb'],d:'The keystone experiment. Pick a lineage, delete it, watch what happens over the next million years. It is the most powerful single button this product could have and it needs only the food web.',k:'PLAY',e:'M',i:3},
{c:'eco',t:'An ecology test on a two-species system',d:'Predator and prey with known parameters should oscillate with the analytic period. If they do not, the food web is decoration.',k:'MODEL',e:'M',i:3},

/* --------------------------------------------------------------- coevo -- */
{c:'coevo',t:'Selection from other organisms',g:'biotic',n:['foodweb'],d:'`fitness()` reads temperature, moisture and oxygen. Nothing reads what else lives in the cell. Adding a biotic term — predation pressure, competition, parasite load — is the single change that turns evolution here from tracking a planet to responding to a world.',k:'MODEL',e:'L',i:3},
{c:'coevo',t:'The Red Queen, so evolution does not stop',n:['biotic'],d:'A biosphere adapting only to its planet reaches an optimum and stops. One adapting to other adapting things never does. This is why the current model goes quiet after the climate settles, and it is the deepest reason the deep-time run is boring.',k:'MODEL',e:'M',i:3},
{c:'coevo',t:'Arms races with a cost on both sides',n:['biotic'],d:'Armour against jaws, speed against speed, venom against resistance. Each escalation costs energy, so an arms race is bounded by the power budget rather than running away — which is what makes the outcome interesting.',k:'MODEL',e:'M',i:3},
{c:'coevo',t:'Parasites and pathogens',n:['biotic'],d:'`W.plague` is a global scalar that multiplies `life[c]` by 0.55 at random. Parasites are lineages with hosts, transmission that depends on host density, and virulence that evolves — and they are a major share of all species.',k:'MODEL',e:'L',i:3},
{c:'coevo',t:'Virulence evolution with a real trade-off',d:'A pathogen that kills too fast loses its transmission route. That trade-off is why virulence evolves to intermediate values, and it is a two-parameter model with a famous result.',k:'MODEL',e:'M',i:2},
{c:'coevo',t:'Mutualism, and the cheating problem',n:['biotic'],d:'Mycorrhizae, nitrogen fixers, gut flora, pollinators, lichens. Every mutualism is unstable against cheating and persists because of partner choice or sanctions — which is a far better story than "these two help each other".',k:'MODEL',e:'M',i:3},
{c:'coevo',t:'Endosymbiosis is a mutualism that went all the way',d:'The mitochondrion and the plastid are the two most consequential mergers in the history of life. With mutualism modelled, endosymbiosis becomes its endpoint rather than a global boolean set by an oxygen threshold.',k:'MODEL',e:'M',i:3},
{c:'coevo',t:'Pollination as a coevolutionary loop',d:'Flowers exist as `T.flower` in the moment table and nowhere else. A pollinator and a flower are the standard textbook example of coevolution and they need sensory bands, signalling and mutualism first — which is a nice demonstration that this document\'s dependencies are real.',k:'MODEL',e:'M',i:2},
{c:'coevo',t:'Seed dispersal by animals',d:'Fruit is a bribe. It changes plant range dynamics completely and it is the reason a forest can move faster than its trees can grow.',k:'MODEL',e:'M',i:2},
{c:'coevo',t:'Mimicry, which requires a third party to be fooled',n:['senseview'],d:'Batesian and Müllerian mimicry both require a predator with a sensory system that can be exploited. Once senses are real, mimicry is a natural consequence and one of the most striking things a field guide can show.',k:'MODEL',e:'M',i:2},
{c:'coevo',t:'Coextinction',n:['diet'],d:'When a host goes, its specialists go. It is thought to be a large share of all extinctions and it is impossible to represent without a diet or a host link.',k:'MODEL',e:'M',i:3},
{c:'coevo',t:'Apparent competition and shared predators',n:['foodweb'],d:'Two prey species that share a predator affect each other without ever meeting. It is the kind of indirect effect that makes ecosystems hard to predict, and it is exactly what a simulation is for.',k:'MODEL',e:'M',i:1},
{c:'coevo',t:'Grazing pressure shapes plants',d:'Grasses tolerate grazing because of where their growth tissue is; that single innovation created grasslands and everything that lives in them. Right now `grassland` is a biome classified by temperature and moisture with no organism in it.',k:'MODEL',e:'M',i:2},
{c:'coevo',t:'The predator that changes the landscape',d:'A trophic cascade that reaches geomorphology — wolves and rivers, elephants and woodland, beavers and everything. It is the strongest link between the `coevo` category and the geology this product already simulates well.',k:'MODEL',e:'M',i:2},
{c:'coevo',t:'Show who is eating whom, live',n:['foodweb'],d:'On the local map: a predator sprite near a prey sprite, and the population numbers moving. The presentation layer already places individuals; this gives them something to do.',k:'SHOW',e:'M',i:3},
{c:'coevo',t:'An arms race chart',n:['biotic'],d:'Two traits over time, escalating together. It is a picture nobody expects from a planet simulator and it is the clearest evidence that something other than the climate is driving evolution.',k:'SHOW',e:'M',i:2},
{c:'coevo',t:'Introduce a species and watch it break things',n:['foodweb'],d:'Take a lineage from one continent, drop it on another. Invasion biology is a god-game verb that is also a serious scientific subject, and it needs only dispersal and a food web.',k:'PLAY',e:'M',i:3},
{c:'coevo',t:'Domestication as a coevolution the player runs',d:'`city.js` exists and settlers appear. A civilisation that selectively breeds a lineage is coevolution with a hand on it, and it is the natural bridge from the biosphere to the god layer.',k:'PLAY',e:'M',i:2},
{c:'coevo',t:'Say when the Red Queen is running',n:['biotic'],d:'A readout that separates change driven by the planet from change driven by other life. It is the single number that says whether this biosphere is alive in the interesting sense.',k:'SHOW',e:'M',i:3},
{c:'coevo',t:'A coevolution test with an oscillation',d:'Host and parasite frequencies should cycle with a period set by their parameters. A model that produces the cycle is doing coevolution; one that produces a monotone curve is doing bookkeeping.',k:'MODEL',e:'M',i:2},

/* -------------------------------------------------------------- biogeo -- */
{c:'biogeo',t:'Dispersal that moves something',g:'dispersal',d:'`traits[5]` is called dispersal and is read by `bodyPlanFromTraits` for a stride number and by nothing that relocates a population. Range expansion happens through `neighbourLineage`, which copies a lineage id into an adjacent empty cell. That is diffusion at one cell per tick regardless of what the organism is.',k:'MODEL',e:'M',i:3},
{c:'biogeo',t:'Barriers, so isolation has a cause',g:'barrier',n:['dispersal'],d:'`connectedComponents` treats land and sea as a barrier and nothing else. Mountains, deserts, rivers, salinity fronts and depth all separate populations, and the geology and hydrology modules already produce every one of them.',k:'MODEL',e:'M',i:3},
{c:'biogeo',t:'Ocean currents carry larvae',n:['dispersal'],d:'The currents backlog is building a real velocity field. Planktonic dispersal along it is the difference between a coral reef with a thousand-kilometre gene flow and one that is isolated, and it makes ocean circulation matter to biology.',k:'MODEL',e:'M',i:3},
{c:'biogeo',t:'Wind carries spores and dust',n:['dispersal'],d:'Fungal spores, pollen, insects and iron-bearing dust all cross oceans on the wind field that already exists. It is the mechanism behind almost every long-distance colonisation of an island.',k:'MODEL',e:'M',i:2},
{c:'biogeo',t:'Land bridges and vicariance',n:['barrier'],d:'Sea level moves in this model, plates move in this model, and neither event does anything to a range. The Great American Interchange and the closing of Panama are the standard example of both mechanisms in one place.',k:'MODEL',e:'M',i:3},
{c:'biogeo',t:'Island biogeography with the real equation',n:['barrier'],d:'Species number on an island is a balance between immigration, which falls with distance, and extinction, which falls with area. It is one of the few quantitative laws in ecology and the landscape backlog just made islands exist.',k:'MODEL',e:'M',i:3},
{c:'biogeo',t:'Island dwarfism and gigantism',n:['realmass'],d:'Large animals shrink on islands and small ones grow, for reasons of resources and predation. It is one of the most reliably observed patterns in the record and it would make island faunas visibly strange, which is the point of having islands.',k:'MODEL',e:'M',i:2},
{c:'biogeo',t:'Endemism as a consequence, not a flag',d:'`flagEndemics` sets a boolean. Endemism should fall out of isolation time and range size, and it should predict extinction risk — which is what makes island biotas the ones that die when anything changes.',k:'MODEL',e:'M',i:2},
{c:'biogeo',t:'Range shift with the climate, at a real speed',d:'`climateRangeShift` exists in `meta.js`. The interesting part is when the climate moves faster than the biota can, which is the mechanism behind several mass extinctions and the one most worth showing.',k:'MODEL',e:'M',i:3},
{c:'biogeo',t:'Refugia',n:['barrier'],d:'Places that stay habitable when the rest does not — a warm valley in an ice age, a wet gorge in a drought. They are where diversity survives and where it re-radiates from, and this planet has the topography to have them.',k:'MODEL',e:'M',i:3},
{c:'biogeo',t:'Biogeographic realms as an emergent map',d:'Wallace drew a line through Indonesia because the faunas on either side had different histories. A map of realms — regions whose biota shares an ancestry — is computable from the tree and the ranges, and it is a picture nobody has seen for an invented planet.',k:'SHOW',e:'M',i:3},
{c:'biogeo',t:'The species–area relationship',d:'Species count rises as roughly the quarter power of area, across every taxon and every continent anyone has measured. Reproducing it is a strong validation, and failing to reproduce it says something specific is wrong.',k:'MODEL',e:'M',i:2},
{c:'biogeo',t:'Depth zones as habitats',d:'Photic, mesopelagic, bathyal, abyssal, hadal. `seaCap` gives three depth bands with fixed multipliers. Real depth zonation is the largest habitat gradient on the planet and it is where the electroreception and bioluminescence items become visible.',k:'MODEL',e:'M',i:3},
{c:'biogeo',t:'Elevation zones as habitats',d:'A mountain is a latitude gradient in ten kilometres. It compresses biomes, it isolates populations at the top, and it is the cheapest possible generator of endemism on a continent.',k:'MODEL',e:'M',i:2},
{c:'biogeo',t:'The intertidal, which is where land life came from',d:'`W.intertidal[c]` exists and feeds one desiccation term. It is the single most important habitat in the history of animal life and it deserves to be a place with its own residents.',k:'MODEL',e:'M',i:3},
{c:'biogeo',t:'Range maps per lineage',n:['treeview'],d:'Draw one species\' range on the globe. It is the basic unit of biogeography and the product has never drawn one.',k:'SHOW',e:'M',i:3},
{c:'biogeo',t:'Range fragmentation as a warning',d:'A range breaking into pieces is the visible precursor to extinction, and it is a picture that makes a slow process urgent.',k:'SHOW',e:'M',i:2},
{c:'biogeo',t:'Let a player build a barrier',n:['barrier'],d:'Raise an isthmus, open a strait, and watch the biota respond over the next ten million years. The tools exist; only the biological consequence is missing.',k:'PLAY',e:'M',i:3},
{c:'biogeo',t:'Continental drift should carry its passengers',n:['barrier'],d:'Plates move and lineages sit in a fixed cell grid. A clade that rode a continent is the reason Gondwanan distributions are recognisable, and the tectonics module already knows which cells belong to which plate.',k:'MODEL',e:'M',i:3},
{c:'biogeo',t:'A biogeography test on a two-continent world',d:'Two isolated continents should develop distinguishable biotas within a stated time, and joining them should produce an interchange with an asymmetric outcome. Both are checkable.',k:'MODEL',e:'M',i:2},

/* ---------------------------------------------------------------- mass -- */
{c:'mass',t:'Extinction selectivity, so who dies means something',g:'selective',d:'Every extinction in the model is a probability applied to a lineage. Real mass extinctions kill by trait: large body size, small range, narrow tolerance, calcareous skeleton, high metabolic demand, planktonic larvae. With the genome those traits now exist and can be read.',k:'MODEL',e:'M',i:3},
{c:'mass',t:'Each kill mechanism should kill differently',n:['selective'],d:'An impact kills by darkness and cold — photosynthesisers first. An anoxic ocean kills by oxygen — large active animals first. Acidification kills by carbonate — shelled things first. A snowball kills by ice — everything shallow. Four mechanisms, four signatures, one shared code path today.',k:'MODEL',e:'M',i:3},
{c:'mass',t:'Ocean acidification as a real chemistry',d:'`carbon.js` computes `omegaAragonite` and `biomineral` is gated on it. Extend it to kill: when the saturation state falls below one, existing shells dissolve, which is the specific mechanism behind the end-Permian and the one everyone is worried about now.',k:'MODEL',e:'M',i:3},
{c:'mass',t:'Anoxia and euxinia as spatial events',d:'Ocean anoxic events are not global switches; they spread from stagnant basins and follow circulation. `redox.js` has the chemistry and `ocean.js` will have the circulation.',k:'MODEL',e:'M',i:3},
{c:'mass',t:'Extinction debt, made visible',d:'`extinctionTick` has a debt concept. The idea that a lineage can be doomed and not yet dead — the living dead of conservation biology — is one of the most useful things this product could teach, and it needs a visual.',k:'SHOW',e:'M',i:3},
{c:'mass',t:'Recovery takes millions of years and has a shape',d:'`_recoveryBoost` decays at 0.99 per tick and adds children from `tree.living[0]`. Real recovery has a disaster-taxon phase, a long low-diversity interval and then a radiation, and the interval length depends on how much of the ecosystem structure was destroyed rather than on how many species died.',k:'MODEL',e:'M',i:3},
{c:'mass',t:'Disaster taxa',d:'After a mass extinction the world briefly belongs to a few opportunists — Lystrosaurus, the fungal spike, the fern spike. It is one of the most recognisable patterns in the record and it is a natural consequence of selectivity plus empty niches.',k:'MODEL',e:'M',i:2},
{c:'mass',t:'Background extinction with a real rate',d:'`hazard = 0.0002 × dt × (1 + pulse)`. The measured background rate is roughly one species per million species-years, which is a number this model could actually target and check.',k:'MODEL',e:'S',i:3},
{c:'mass',t:'Extinction risk on the species page',n:['selective'],d:'Range size, population, trophic position, tolerance width, and a stated risk. It turns extinction from an event into a forecast, which is what makes it playable.',k:'SHOW',e:'M',i:3},
{c:'mass',t:'The Big Five should be recognisable if they happen',d:'Not scripted — recognised. If a run produces a >60% loss in under a million years, name it, date it, and diagnose it from the mechanism that did it.',k:'SHOW',e:'M',i:3},
{c:'mass',t:'Extinction rate over time as a chart',d:'The standard Sepkoski curve. `tree.extinctions` has every event with a reason and a date, and nothing plots it.',k:'SHOW',e:'M',i:3},
{c:'mass',t:'Survivorship — who came through and why',n:['selective'],d:'After an event, compare the traits of survivors to the traits of the dead. That comparison is the whole of extinction selectivity research and it is a table this simulation can produce exactly.',k:'SHOW',e:'M',i:3},
{c:'mass',t:'Fossils that record the event',d:'A fossil layer with a sharp change across it is how mass extinctions were discovered. `W.fossils` is per-cell and capped at eight, with no stratigraphy — so there is no section to read.',k:'MODEL',e:'M',i:2},
{c:'mass',t:'Ghost lineages and the Lazarus effect',d:'A clade that vanishes from the record and reappears. It is a real phenomenon, it is a consequence of an incomplete record, and it teaches more about the fossil record than any amount of prose.',k:'MODEL',e:'M',i:1},
{c:'mass',t:'Extinction should reach the picture',d:'A dieback is currently a number falling. It should be a visible emptying — sprites thinning, colours draining, the map going quiet — because the emotional weight of an extinction is the entire reason to simulate one.',k:'SHOW',e:'M',i:3},
{c:'mass',t:'Let a player cause one, precisely',d:'The god layer can drop an impactor. Let the player choose the mechanism — impact, flood basalt, anoxia, acidification, glaciation — and see the different signature each leaves in the same biosphere.',k:'PLAY',e:'M',i:3},
{c:'mass',t:'Let a player try to prevent one',d:'Deflect the impactor, cap the volcanism, buffer the ocean. Prevention is a far better teacher than causation because it forces the player to identify the actual mechanism.',k:'PLAY',e:'M',i:3},
{c:'mass',t:'A named kill should name its victims',d:'`chronLog` records the event. It should list the three largest clades that died and the one unlikely survivor, because that is what makes an extinction a story rather than a statistic.',k:'SHOW',e:'S',i:3},
{c:'mass',t:'Recovery should not restore the same world',d:'The point of a mass extinction is that the world afterwards is structurally different. If diversity returns to the same value with the same body plans, nothing happened.',k:'MODEL',e:'M',i:3},
{c:'mass',t:'An extinction test with a stated magnitude',d:'A given impactor size should kill a stated fraction, with stated selectivity, reproducibly across seeds. Right now no test touches extinction at all.',k:'MODEL',e:'M',i:3},
];

const P4 = [
/* ---------------------------------------------------------------- gaia -- */
{c:'gaia',t:'The deep-time biosphere does not grow',g:'biomass',d:'Measured, N=32, 900 ticks, 3.2 Gyr elapsed: `meanLife` goes from 0.0226 at t=0 to **0.0013**, O₂ stays at 0.0000, and the top guild is purple sulfur at density 0.002. The biosphere shrinks by a factor of seventeen over three billion years. Every item in this document that depends on there being organisms is downstream of this one number.',k:'MODEL',e:'L',i:3},
{c:'gaia',t:'Find out where the biomass goes',n:['biomass'],d:'`bioTick` clamps `life[c]` to `maxL` from `carryingCapacity`; `redoxTick` writes the microbial contribution; `alienTick` clamps again on exotic rulesets. Three writers, two of which only ever reduce. Instrument the per-tick budget — produced, respired, buried, clamped — and print which term is eating the biosphere.',k:'MODEL',e:'M',i:3},
{c:'gaia',t:'Oxygen never rises on the deep-time run',n:['biomass'],d:'O₂ = 0.0000 after 3.2 Gyr, because oxygenic photosynthesis needs `pre > 0.005` of purple and green sulfur bacteria and the measured value is 0.002. The gate is well designed and the input never reaches it, so the Great Oxygenation cannot happen and neither can anything downstream of it — which is most of the eight-rung ladder.',k:'MODEL',e:'M',i:3},
{c:'gaia',t:'Silicate weathering as the planet\'s thermostat',d:'Warmer means faster weathering means less CO₂ means cooler, on a hundred-thousand-year time constant. `carbon.js` has reservoirs; the feedback needs to be explicit, because it is the reason Earth has been habitable for four billion years and it is the mechanism that will decide most of the catalogue.',k:'MODEL',e:'M',i:3},
{c:'gaia',t:'Biological weathering, which is faster',d:'Roots and lichens accelerate weathering by a large factor, which is why land plants changed the carbon cycle and cooled the Devonian. It is one multiplier, gated on a real organism, with a global consequence.',k:'MODEL',e:'M',i:3},
{c:'gaia',t:'Burial as the only long-term oxygen source',d:'Oxygen accumulates only when reduced carbon is buried faster than it is oxidised. `carbon.js` has the path; the burial rate should depend on sedimentation, on anoxia and on whether anything has evolved that can decompose the material — which is the Carboniferous story again.',k:'MODEL',e:'M',i:3},
{c:'gaia',t:'Methane as the Archean greenhouse',d:'`methanogen` makes CH₄ and the Archean was probably kept warm by it under a faint young sun. `faintYoungSun` exists in `time.js`. The two should be in the same argument, and the collapse of the methane greenhouse at the Great Oxygenation should be able to cause a snowball.',k:'MODEL',e:'M',i:3},
{c:'gaia',t:'Albedo from what is alive',d:'Forest is dark, grassland is bright, algae on ice is dark, cloud seeded by marine plankton is bright. Daisyworld is implemented as a separate ruleset instead of as a property of ordinary life, which is exactly the wrong way round.',k:'MODEL',e:'M',i:3},
{c:'gaia',t:'Life makes clouds',d:'Marine plankton emit dimethyl sulfide, which nucleates cloud droplets. It is the canonical CLAW hypothesis, it is contested, and it is a real biological hand on planetary albedo that this model has the pieces for.',k:'MODEL',e:'M',i:2},
{c:'gaia',t:'Soil as a biological structure with depth',d:'`W.soil[c] += life[c] × 0.004 − (1 − moist) × 0.001`. Soil is what holds water, what holds nutrients, what stops erosion, and what took life half a billion years to build on land. It deserves depth, organic content and a formation time.',k:'MODEL',e:'M',i:3},
{c:'gaia',t:'Organisms as rock',d:'Limestone, chalk, chert, coal, banded iron. `bifRock` exists. A biosphere that leaves no rock has no record and no geological consequence, and the geology module could consume all of these as sediment types.',k:'MODEL',e:'M',i:3},
{c:'gaia',t:'Life changes the hydrology',d:'Transpiration returns water to the air; roots slow runoff; a forest makes its own rain. The Amazon is the standard example and the hydrology module is already there to receive it.',k:'MODEL',e:'M',i:3},
{c:'gaia',t:'Nitrogen cycle closure',d:'`nFixer`, `nitrifier`, `denitrifier` and `anammox` all exist as guilds. Closing the loop as a real budget — fixation in, denitrification out, with a reservoir — is what makes nitrogen limitation dynamic rather than a constant field.',k:'MODEL',e:'M',i:2},
{c:'gaia',t:'The phosphorus cycle on a geological clock',d:'Weathering supplies it, burial removes it, and the residence time is around twenty thousand years. It is the ultimate limit on the biosphere\'s size, which makes it the ultimate limit on everything in this document.',k:'MODEL',e:'M',i:3},
{c:'gaia',t:'Gaia should be a measurement, not a mode',d:'`gaia.js` computes a regulation strength. Present it as a testable claim per era — how much did the biosphere damp the perturbation the planet threw at it — rather than as a setting.',k:'SHOW',e:'M',i:2},
{c:'gaia',t:'Daisyworld as a lesson inside the real model',d:'It is currently a separate ruleset with its own tick function that overwrites temperature directly. Reimplementing it as ordinary lineages with heritable albedo would prove the general model can do what the toy does.',k:'MODEL',e:'M',i:2},
{c:'gaia',t:'Show the biosphere\'s hand on the atmosphere',d:'Two curves: what the atmosphere would be without life, and what it is. The gap is the biosignature, and computing the counterfactual is a real thing this simulation can do and nothing else can.',k:'SHOW',e:'L',i:3},
{c:'gaia',t:'Show the disequilibrium',d:'`W.disequilibrium` is computed and appears as a single HUD number. Chemical disequilibrium is the most general biosignature there is — oxygen and methane together should not persist — and it deserves the Lab\'s best chart.',k:'SHOW',e:'M',i:3},
{c:'gaia',t:'Let the player kill the biosphere and watch the planet drift',d:'Sterilise the world and run it forward. Watching CO₂ climb, oxygen fall and the temperature go somewhere else is the most direct possible demonstration of what life was doing.',k:'PLAY',e:'M',i:3},
{c:'gaia',t:'A Gaia test with a stated perturbation',d:'Double CO₂ and measure how much of the temperature excursion the biosphere absorbs, per era. Without a number, regulation is a vibe.',k:'MODEL',e:'M',i:3},

/* --------------------------------------------------------------- alien -- */
{c:'alien',t:'Exotic biospheres are Earth with a multiplier',g:'exobio',d:'`alienTick` is nine `if (rule.flag)` blocks that post-process `W.life[c]`: an ice shell takes `min(life, 0.15)`, Venus takes `life = 0`, Titan takes `× 0.5` when warm, a locked world takes a terminator ring. None of them changes what life *is*, only how much of it there is. With the genome and the sensory physics in place, the structural differences are now computable instead of assumed.',k:'MODEL',e:'L',i:3},
{c:'alien',t:'A biosphere with no light at all',n:['exobio'],d:'Under fifteen kilometres of ice the measured best sense is chemical and the best imaging sense is electroreception — both derived from the physics, both asserted in the test suite. What follows is a whole ecology: no producers in the photosynthetic sense, a food web rooted in vent chemistry, and a biomass ceiling set by hydrogen flux rather than by insolation.',k:'MODEL',e:'M',i:3},
{c:'alien',t:'A biosphere in the air',n:['exobio'],d:'`aerialBio` sets every surface cell to zero and stores one `cloudLife` scalar. Venus\'s cloud deck at 50 km is the one place in that atmosphere with survivable temperature and pressure, and an aerial biosphere has a real problem — staying aloft — that would drive its entire morphology.',k:'MODEL',e:'M',i:2},
{c:'alien',t:'The terminator ring as a habitat with a gradient',d:'`alienTick` gives locked worlds a ring where `life = max(life, ring × 0.4 × meanLife)`. A real terminator is a permanent narrow habitable band with permanent wind, permanent low sun angle and an eternal twilight — which is a specific and drawable place rather than a multiplier.',k:'MODEL',e:'M',i:3},
{c:'alien',t:'Eternal night and eternal day',d:'On a locked world one hemisphere never sees the star. That is a permanent chemosynthetic or scavenging ecosystem next door to a permanently lit one, connected by whatever can cross the ring — and the sensory model says the two sides evolve completely different senses.',k:'MODEL',e:'M',i:3},
{c:'alien',t:'Flare stars as a selective pressure',d:'`alienTick` nudges `traits[10]` upward by 0.002 per tick on flare stars. A real flare is an acute event with a recovery, and it should select for shielding, for depth, for nocturnality and for spores — four different answers to the same problem.',k:'MODEL',e:'M',i:2},
{c:'alien',t:'High gravity, and the bodies it forbids',n:['realmass'],d:'The catalogue has super-Earths above 2 g. Every structural item in `physio` should combine to make those worlds visibly low, thick and slow — which is a strong, cheap, legible difference nobody has to be told about.',k:'MODEL',e:'M',i:3},
{c:'alien',t:'Low gravity, and the bodies it permits',n:['realmass'],d:'On a 0.13 g moon a body can be enormous and spindly, and flight is nearly free. It is the most fun single consequence of the physics and the model currently draws the same animals there as on Earth.',k:'MODEL',e:'M',i:3},
{c:'alien',t:'Thick atmospheres are good for sound and bad for sight',n:['starband'],d:'Sound carries better in a dense medium; haze scatters light. Measured for Titan: acoustic sensing ranks alongside a badly starved red band. A high-pressure world should be full of things that call and listen.',k:'MODEL',e:'M',i:3},
{c:'alien',t:'The M-dwarf world grows a different biosphere',n:['starband'],d:'Measured on TRAPPIST-1e: chemical sensing ranks first, red vision fourth and weak, and no pigment can use the star\'s 1132 nm peak because the photon energy is below the isomerisation threshold. That is a whole biosphere shaped by two constants, and eleven of the catalogue\'s worlds orbit M dwarfs.',k:'MODEL',e:'M',i:3},
{c:'alien',t:'Life at the top and the bottom of the temperature range',d:'`hyperthermophile` and `cryoprotected` are options on the thermal axis. The limits — about 122 °C for a known organism, and eutectic brine films well below zero — are measured numbers that should bound the habitable envelope directly.',k:'MODEL',e:'M',i:2},
{c:'alien',t:'A biosphere that runs on the wrong handedness',n:['solvent'],d:'Two origins on one planet with opposite chirality cannot eat each other and cannot compete except for raw resources. It is a genuinely alien ecology and it costs one field.',k:'MODEL',e:'M',i:2},
{c:'alien',t:'Endolithic life inside the rock',d:'The habitat axis has `endolithic`. On Mars or on a dry cold world it is the only plausible refuge, it is real on Earth in the dry valleys, and it is invisible from orbit — which makes it a great thing for the player to have to go and find.',k:'MODEL',e:'M',i:2},
{c:'alien',t:'Dormancy across geological time',d:'A world with a habitable window of a few million years every hundred million favours something that can wait. Spores that survive a hundred thousand years change what "extinct" means.',k:'MODEL',e:'M',i:2},
{c:'alien',t:'Give each catalogue world a predicted biosphere',n:['exobio'],d:'120 bodies have measured parameters in `worldParams.js`. Running the sensory and biochemical models over all of them produces a one-paragraph prediction per world — what senses, what solvent, what energy source — and that table is a genuine piece of content nobody else has.',k:'SHOW',e:'L',i:3},
{c:'alien',t:'Say which parts of an alien prediction are physics',n:['exobio'],d:'The photon energy threshold is measured. The `utility` ranking is fitted. The phased array is invented. A prediction that does not label itself is science fiction with a table in it.',k:'SHOW',e:'M',i:3},
{c:'alien',t:'Make the strange worlds look strange',n:['exobio'],d:'`lifeColour.js` has one palette with an Archean purple branch. A biosphere tuned to a red star, or one running on sulfur, or one under ice should not share a colour language with an Earth forest.',k:'SHOW',e:'M',i:3},
{c:'alien',t:'A sterile world should still be interesting',d:'`sterileWhy` gives one sentence. A world that failed should show how close it came, which term was short, and what a small change would have done — because near-misses are the most instructive worlds in the catalogue.',k:'SHOW',e:'M',i:3},
{c:'alien',t:'Let the player port a lineage to another world',d:'Take something you grew on Earth and drop it on TRAPPIST-1e. Watching it fail, and reading exactly which constraint killed it, is the best possible test of whether the model is a model.',k:'PLAY',e:'M',i:3},
{c:'alien',t:'An alien-biosphere test suite',n:['exobio'],d:'For each exotic ruleset, assert the structural outcome — no photosynthesis under ice, no pigment vision on a 2600 K star, no aerial life without a cloud deck. Shipped in part: the sensory assertions are in `test.mjs` now.',k:'MODEL',e:'M',i:3},

/* -------------------------------------------------------------- visual -- */
{c:'visual',t:'Sixteen hand-drawn sprites for every creature on every world',g:'procsprite',d:'`SPRITES` is sixteen arrays of Path2D strings with hard-coded fill colours, and `spriteFromPlan` maps the entire game onto six of them. A procedural silhouette generated from the genome — symmetry, segments, limbs, eyes, skeleton — is the single highest-impact visual change available, and the genome now carries every parameter it needs.',k:'SHOW',e:'L',i:3},
{c:'visual',t:'Draw the right number of limbs',n:['procsprite'],d:'A twenty-limb myriapod and a four-limb tetrapod currently share sprite 3. Limb count is an integer in the plan; drawing it is the difference between a creature and an icon.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'Draw radial bodies as radial',n:['procsprite','symorder'],d:'A pentaradial animal drawn as a side-on silhouette is drawn wrong — it has no side. Radial bodies need a top-down or oblique presentation, which is a real drawing decision and the reason five-fold symmetry looks alien.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'Draw the eyes',n:['procsprite'],d:'`plan.eyes` carries organ, band and count. Three eyes should be three eyes, and their colour should come from the band they are tuned to.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'Colour from biology, not from a constant',n:['procsprite'],d:'`KIND_RGB` is sixteen hard-coded triples. Pigment should come from the absorption spectrum, armour from the mineral, warning colouration from what can see it. Shipped in part: `pigmentBiasOf` derives a warm/cool bias from the lineage\'s own receptor bands.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'Gait, so the walk matches the body',d:'`plan.gait` is derived — anchored, tube-foot creep, peristaltic, undulating, sprawl, erect stride, jet pulse. `drawSprite` supports a flip and a shear. Nothing animates.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'Stride frequency from body mass',n:['realmass'],d:'`plan.stride` is `mass^(-1/6)` and is used nowhere. Small things move fast and large things move slowly, and getting that one relationship right is most of what makes a scene read as alive.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'Size on screen should be size',n:['realmass'],d:'Sprites are scaled by `plan.size × 0.014 × (0.75 + rng × 0.4)` — a jitter on a derived number. With a real mass in grams, a creature\'s apparent size can be its actual size at the map\'s scale, which is the whole point of a zoomable planet.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'A crowd should have a size distribution',n:['growth'],d:'Juveniles and adults together, in the ratio a real population has. It is the cheapest possible way to make a group of sprites read as a population rather than as clones.',k:'SHOW',e:'M',i:2},
{c:'visual',t:'Impostors at regional zoom',d:'The architecture specifies one cohort impostor per lineage per cell cluster. Between the globe\'s fields and the patch\'s sprites there is nothing, which is why the middle zoom rungs are the least alive part of the product.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'A mesh at ground level',d:'`mesh.js` builds from a plan. With the genome carrying symmetry order, segments and appendage counts, a procedural mesh is a real possibility rather than a set of cases.',k:'SHOW',e:'L',i:2},
{c:'visual',t:'Vegetation that is the plant it is',d:'`KIND_RGB` has canopy, scrub, grass, desert flora and alpine. A tree\'s height, canopy shape and density should come from its own genome and its own physiology — and the vascular height limit item makes that planet-dependent.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'Microbial mats should look like mats',d:'The Archean is two billion years long and is currently drawn as a slightly green ocean. Stromatolites, mat texture, iron banding and the purple of anoxygenic photosynthesis are the visual identity of most of the planet\'s history.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'Bioluminescence in the dark',d:'`bioluminescence` is in the organ table. In a deep ocean or under an ice shell it is the only light there is, and it is the most beautiful thing this product could draw.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'Show the body in the inspector',n:['procsprite'],d:'Shipped in part: the HUD now prints the dominant lineage\'s body described from its own genome, with its morphology penalty and the reason for it. The picture is the missing half.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'A field guide plate',n:['procsprite'],d:'One species, drawn properly, with its measurements, its range, its diet and its ancestry. It is the artefact a player would screenshot, and every number on it already exists.',k:'SHOW',e:'L',i:3},
{c:'visual',t:'Sound per body plan',d:'`audio.js` has a layered soundscape. A body with a tympanum and an echo emitter should be audible; a world where sound is the dominant sense should sound like it.',k:'SHOW',e:'M',i:2},
{c:'visual',t:'Show the creature at the right zoom rung',d:'The living backlog established the zoom contract. A microbe should not be a sprite at orbital range and a whale should not be a pixel on the ground.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'Animate the moment a body plan first appears',d:'The first eye, the first shell, the first limb. These are the moments the whole simulation exists to produce and they currently pass as a line of text in a log.',k:'SHOW',e:'M',i:3},
{c:'visual',t:'An image test for the biosphere',d:'The realism backlog established that the picture has never been measured. Render a fixed world at a fixed time and compare against a committed image, so a change that silently stops drawing life fails a test.',k:'SHOW',e:'M',i:3},

/* ---------------------------------------------------------------- play -- */
{c:'play',t:'The only verb for life is a spray can',g:'lifeverbs',d:'`seedLife` paints a disc of `W.life` between 0.7 and 1.0 and sets `lifeClass` to the current unlocked rung. That is the entire interaction surface for the biosphere in a game whose subject is the biosphere. Everything below is a verb that does not exist.',k:'PLAY',e:'M',i:3},
{c:'play',t:'Seed a genome, not a blob',n:['lifeverbs','genomeobj'],d:'Choose or design what you are seeding — its symmetry, its metabolism, its senses — and drop that. The genome is JSON and the god layer already has a brush.',k:'PLAY',e:'M',i:3},
{c:'play',t:'Select a lineage and keep watching it',n:['lifeverbs'],d:'`S.follow` follows an entity. Following a *lineage* through a billion years, with its range, its numbers and its body changing, is the core loop this product does not yet have.',k:'PLAY',e:'M',i:3},
{c:'play',t:'Breed — apply directional selection by hand',n:['lifeverbs'],d:'Pick a trait, push it, and pay for it. Artificial selection is the oldest demonstration of evolution there is and it is a slider with a cost.',k:'PLAY',e:'M',i:3},
{c:'play',t:'Cross two lineages',n:['sex'],d:'Once recombination exists, letting a player attempt a hybrid — and watching it fail when the two are too far apart — teaches reproductive isolation better than any text.',k:'PLAY',e:'M',i:2},
{c:'play',t:'Isolate a population deliberately',n:['barrier'],d:'Draw a barrier, or move one, and watch a species split. The tools exist in the geology layer; only the biological consequence is missing.',k:'PLAY',e:'M',i:3},
{c:'play',t:'Protect something',n:['selective'],d:'A refuge where extinction cannot reach. It costs, it teaches what extinction was doing, and it is the first conservation verb in a genre that is usually about creation.',k:'PLAY',e:'M',i:2},
{c:'play',t:'Introduce a species somewhere it is not',n:['dispersal'],d:'Invasion is a god-game verb and a serious scientific subject at once, and the consequences are legible within a few ticks rather than a few eons.',k:'PLAY',e:'M',i:3},
{c:'play',t:'Cause a targeted extinction',n:['selective'],d:'Remove one clade and watch the web reorganise. It is the keystone-species experiment and it is the strongest possible argument for having a food web.',k:'PLAY',e:'M',i:3},
{c:'play',t:'Rewind and change one thing',d:'`forkWorldSeed` exists for exactly this. Replaying the tape of life with one parameter changed is the most famous thought experiment in evolutionary biology and this product is one comparison view away from letting anyone run it.',k:'PLAY',e:'L',i:3},
{c:'play',t:'Ask a lineage a question',d:'Why is it here, why is it that shape, what is it eating, what is limiting it. Every one of those answers is computable from the model and none of them is reachable from the interface.',k:'PLAY',e:'M',i:3},
{c:'play',t:'Name what you find',d:'A player who names a species will remember it. `cladeName` generates eighty possible names; letting the player override one and having it persist through the tree costs almost nothing.',k:'PLAY',e:'S',i:2},
{c:'play',t:'A price for interfering with life',d:'`god/economy.js` prices geological acts. Biological acts should be priced against the same thermodynamic ledger, because seeding a biosphere is a much larger intervention than raising a mountain.',k:'PLAY',e:'M',i:2},
{c:'play',t:'Receipts for biological acts',d:'`issueReceipt` explains geological acts afterwards. "You seeded 4,000 km² with a chemolithotroph; in 40 Myr it had displaced two lineages" is a better receipt than anything the terrain tools produce.',k:'PLAY',e:'M',i:3},
{c:'play',t:'Undo a biological act',d:'`undoStroke` handles 24 terrain strokes. Undoing an extinction is a different kind of act and the product should have an opinion about whether it is allowed.',k:'PLAY',e:'M',i:2},
{c:'play',t:'Scenarios with a biological goal',d:'`god/scenarios.js` exists. "Get a body plan with an image-forming eye onto land before the star leaves the main sequence" is a goal that exercises most of this document.',k:'PLAY',e:'M',i:3},
{c:'play',t:'The moral layer, for life specifically',d:'The god backlog raises the ethics of intervention. Extinction is where that question actually bites, and a product that lets you cause one should be willing to say something about it.',k:'PLAY',e:'M',i:2},
{c:'play',t:'A biosphere you can take with you',n:['genomeobj'],d:'Export the tree, the genomes and the field guide as one artefact. `finale.js` already produces an end-of-run artefact; life is the part of it worth keeping.',k:'PLAY',e:'M',i:3},
{c:'play',t:'Watch it without touching it',d:'`let-it-run` exists in the god tab. A biosphere is the one system in this product worth watching for an hour with your hands off, and the presentation layer should be built for that case.',k:'PLAY',e:'M',i:3},
{c:'play',t:'A guided first hour',d:'From vent chemistry to a body with eyes, with the player making four or five decisions that matter. It is the tutorial this product needs and every beat of it is a system in this document.',k:'PLAY',e:'L',i:3},

/* --------------------------------------------------------------- learn -- */
{c:'learn',t:'A species page',g:'speciespage',d:'Name, body, genome, physiology, range, diet, ancestry, risk. Every field is computed and none of it is reachable. This is the single highest-value screen the product does not have.',k:'SHOW',e:'L',i:3},
{c:'learn',t:'A field guide',n:['speciespage'],d:'Every living lineage, drawn, sorted, searchable, per era. It is the artefact that makes a biosphere feel like a place rather than a chart.',k:'SHOW',e:'L',i:3},
{c:'learn',t:'Say what is measured and what is invented',g:'lifeprov',d:'`param-coverage.json` does this for planetary parameters. The life grammar now carries `tag: measured | fitted | invented` on every organ, band, solvent and rule; nothing surfaces it. A model that mixes physics and guesswork must label which is which.',k:'SHOW',e:'M',i:3},
{c:'learn',t:'Explain the physics on the spot',n:['lifeprov'],d:'`bandViability` already returns sentences like "1.24 meV is below the 1.5 eV a pigment needs". Those belong in the interface, next to the creature, not in a probe script.',k:'SHOW',e:'M',i:3},
{c:'learn',t:'A glossary that reaches the biology',d:'`glossary.js` exists. Allopatry, Kleiber, Ne, ΔG, red edge, countercurrent, morphospace — the vocabulary this document uses is the vocabulary the product needs to teach.',k:'SHOW',e:'M',i:2},
{c:'learn',t:'The chronicle should tell a biological story',d:'Shipped in part: speciation and organ-first events now carry the new body\'s description. The chronicle is the product\'s narrative spine and life is the only system whose events are inherently stories.',k:'SHOW',e:'M',i:3},
{c:'learn',t:'Compare against Earth, honestly',d:'The Lab has an Earth diversity comparison. Extend it to body plans, to timing, to the shape of the diversity curve — and be explicit that Earth is one sample.',k:'SHOW',e:'M',i:2},
{c:'learn',t:'Say when the model is out of its depth',d:'`model-limits.md` states boundaries for the physical model. Life needs the same document, and the largest entry in it should be that a cell is 24,000 km² and an individual is not represented at all.',k:'SHOW',e:'S',i:3},
{c:'learn',t:'Teach the timescale',d:'The Archean is longer than everything after it. Every representation the product has makes it look like a prologue, which is the single most common misconception about the history of life.',k:'SHOW',e:'M',i:3},
{c:'learn',t:'Teach that most of life is microbial',d:'The eight-rung ladder ends at mammal and puts prokaryotes on rung zero. By biomass, by diversity, by metabolic range and by duration, the microbial biosphere is the biosphere, and the ladder tells the player the opposite.',k:'SHOW',e:'M',i:3},
{c:'learn',t:'Retire the ladder',n:['morphospace'],d:'`LIFE_CLASSES` runs prokaryote → eukaryote → multicellular → arthropod → fish → amphibian → reptile → mammal. It is Earth\'s vertebrate lineage presented as the axis of progress, and `deriveGrade` reads *global* transitions, so every lineage on the planet has the same grade. Ten call sites read it; the shim can stay while the meaning changes.',k:'MODEL',e:'L',i:3},
{c:'learn',t:'Show the tree of life as the shape it is',d:'Three domains, most of the branch length microbial, animals as a twig. Every accurate rendering of this is startling and the product would be the first game to draw one.',k:'SHOW',e:'M',i:3},
{c:'learn',t:'A "how this works" page for the biosphere',d:'The engineering brief explains the physical model. Life needs the same: the guild table, the genome grammar, the sensory physics, and the honest list of what is missing.',k:'SHOW',e:'M',i:2},
{c:'learn',t:'Cite the science',d:'Kleiber, Eigen, Hamilton, MacArthur and Wilson, Barlow on photoreceptor noise, the 1.22 lambda over D that decides whether an eye can see. Six citations would tell the audience this is not vibes.',k:'SHOW',e:'S',i:2},
{c:'learn',t:'Explain a specific creature',n:['speciespage'],d:'"This has three eyes because it is triradial; they are red because that is where its star puts photons; it is small because oxygen is 3%." A generated paragraph per lineage, from the model, is the strongest demonstration of the whole system.',k:'SHOW',e:'M',i:3},
{c:'learn',t:'Show the counterfactual',d:'What this lineage would have become under different oxygen, gravity or light. The expression function is deterministic and cheap, so re-expressing the same genome in another environment is nearly free.',k:'SHOW',e:'M',i:3},
{c:'learn',t:'A biosphere summary at the end of a run',d:'`finale.js` produces an artefact. Peak diversity, peak disparity, largest body, deepest tree, strangest sense, and the moment it all went wrong.',k:'SHOW',e:'M',i:3},
{c:'learn',t:'Teach with the failures',d:'The bodies that failed to develop, the lineages that went extinct on arrival, the senses that never paid. Negative results are most of what a model like this actually produces and they are currently discarded.',k:'SHOW',e:'M',i:2},
{c:'learn',t:'A README for the life grammar',n:['lifeprov'],d:'`vr/data/life/*.json` is now the authored source of truth for what life can be in this product. It needs a document explaining the schema, so somebody other than its author can add an organ.',k:'SHOW',e:'S',i:3},
{c:'learn',t:'Make the whole thing reviewable',d:'One command that prints the state of the biosphere model — morphospace size, occupied fraction, tree depth, biomass trend, top senses per world, and every unmet dependency in this document. A backlog is only alive if something checks it.',k:'MODEL',e:'M',i:3},
];

const D = [...P1, ...P2, ...P3, ...P4];

/* ------------------------------------------------------------- derive -- */
D.forEach((x, i) => { x.id = i + 1; });

const byCat = (id) => D.filter((x) => x.c === id);
const count = (f) => D.filter(f).length;
const KIND = { MODEL: 'Model', SHOW: 'Show', PLAY: 'Play' };
/** Literal pipes inside inline code would split a markdown table cell. */
const md = (t) => String(t).replace(/\|/g, '\\|');

const provides = new Map();
for (const x of D) if (x.g) provides.set(x.g, x);
const dependents = (tok) => D.filter((y) => (y.n || []).includes(tok)).length;
const CRITICAL = [...provides.keys()]
  .map((k) => ({ k, x: provides.get(k), n: dependents(k) }))
  .filter((r) => r.n > 0)
  .sort((a, b) => b.n - a.n);

const FIXED = [
  ['The entire creature space of this product was twenty-six shapes', 'Measured by evaluating `bodyPlanFromTraits` across 20,736 trait vectors spanning body mass, trophic level, dispersal and defence: 26 distinct discrete body plans, six sprite kinds out of sixteen, and one silhouette value. `limbs` took three values decided by mass alone; `symmetry` took two. The grammar shipped this pass — ten categorical axes, eight counted axes, 27 organs, 19 receptor bands — spans 1.6 × 10²⁸ distinguishable bodies.'],
  ['Life had no data layer at all', '`vr/data/life/axes.json`, `organs.json`, `sensors.json` and `biochem.json` are now the authored source of truth for what life can be in this product, and `scripts/lifegrammar.mjs` validates and compiles them into `vr/sim/lifeGrammar.js`. The validator caught a real error on its first run — `compoundEye` required a skeleton option named `carapace`, which is an integument, not a skeleton.'],
  ['The biosphere shrank by a factor of seventeen over deep time', 'The guild update was `d += fit*0.15*dt − 0.02*dt`. Purple sulfur’s `fit ≈ 0.02`, so net growth was negative, precursors never reached 0.005, oxygenic photosynthesis never invented, and `bioTick` then 5%-decayed the deep ocean every tick. Logistic colonisation `(0.07 + d*0.55 + neigh*0.12)*fit*dt` minus a small death term lets a viable guild grow from a seed. Measured N=32, 300 ticks, 1.7 Gyr: `meanLife` 0.0226 → 0.1487 (held and grew), 86 lineages, tree depth 4, 79 distinct bodies. Previously: 0.0226 → 0.0013, six nodes, depth 1.'],
  ['The origin was a coin flip logged at cell 0', '`originTick` is now a rate per cell — disequilibrium × catalytic surface × phosphate × concentration × Arrhenius × a stated difficulty prior — and fires at the best cell. Vents are objects with a lifetime. RNA world lasts until Eigen’s `μL < 1`. A second origin can leave a shadow biosphere. `noteImpact` can sterilise a young planet. An airless world never originates.'],
  ['`node.pop` was a count of occupied cells', 'Census population is now Kleiber density × occupied area, `Ne = 0.35 × census`, drift is variance not a mutation bonus, and substitutions are independent of N. Speciation accumulates isolation and can split by allopatry, sympatry or polyploidy. On the measured run the tree reaches depth 4 with 86 living lineages instead of six children of LUCA.'],
  ['Nothing ate anything else', '`node.diet` is up to three prey ids. Chirality mismatch blocks trophic transfer. Lotka–Volterra terms write `preyAvail` / `predation` / `compete`, `fitness()` reads them, and a lineage whose census falls below MVP under predation is removed. A two-species test asserts a predator has a diet, the prey feels it, and the prey can go extinct.'],
  ['Sixteen hand-authored sprites were the whole morphospace', '`drawCreature` builds a silhouette from the expressed plan — radial, bilateral, sessile, nekton, goo — with eyes coloured by receptor band and limb thickness from mass × g. The local map uses it when a genome plan exists; the globe stamps unique plans into a 20-slot atlas (16 Path2Ds remain as fallback).'],
  ['A save deleted every biosphere', '`serializeRun` version 5 stores the phylogeny and every genome as JSON. Unpack restores ids, traits and `genomeKey`. The landscape stack from version 4 is unchanged.'],
  ['The origin of sex was a dead assignment', '`T.sex` is now read: living lineages of the same chirality recombine genomes, and asexuals accumulate Muller’s ratchet as mutational load. HGT moves an actual organ, not a float.'],
  ['Methane life was Earth × 0.5', '`alienTick` consumes the solvent: liquid window, dielectric refusal of RNA/phospholipid, and a compressed Arrhenius clock so Titan is slow rather than frozen. The Lab and world chip print solvent · chirality · polymer.'],
  ['Symmetry was a two-valued string chosen by body mass', '`symmetry = mass < 0.2 ? \'radial\' : \'bilateral\'`. It is now an integer 0–12 where 0 means no axis at all — goo — 1 means bilateral, and 5 means a pentaradial body with five equally good directions to move in and therefore no head. Organ counts follow from it, so three eyes is what a triradial body has rather than a case somebody wrote.'],
  ['Nothing in the simulation could see', 'The string "eye" did not appear anywhere in `vr/sim/`. The only sensory quantity was `photonUsable`, one scalar per planet from a three-branch step function on stellar temperature. `vr/sim/sensory.js` now decides band by band what a world delivers, from the Planck photon spectrum of its star, the transmission of its atmosphere and medium, the photon energy against the pigment threshold, and the diffraction limit against the body\'s own aperture.'],
  ['Microwave eyes, answered properly', 'A 1 mm photon carries 1.24 meV, which is 0.05 kT at 300 K, so no chemical receptor can register one at any brightness — a microwave eye cannot be a pigment. It has to be an antenna or a cooled bolometer, and 1.22 λ/D says imaging at human acuity needs a 70 m aperture. So the organ table carries `phasedArray`: receptors spread along the segments so the aperture is the whole animal, gated on a brain and on size class 8 and up. Not impossible — a body-size problem.'],
  ['A red-dwarf world now grows a different biosphere, from physics', 'Measured across four worlds with the shipped model. Earth ranks red, green, blue. TRAPPIST-1e ranks chemical first and red fourth and weak, because its 1132 nm peak is below the energy any pigment can use. A Europa ocean under 15 km of ice ranks chemical, then electroreception, then flow sensing — no photon band survives 300 m of water. Titan\'s haze leaves acoustic sensing competitive with sight. None of that is a ruleset flag.'],
  ['Mutation was a Gaussian on eleven floats', '`TRAITS` is eleven `Float32`s with a fixed `MUT_RATE` beside it, so the largest structural change any lineage could undergo was a number moving by 0.05. `vr/sim/genome.js` adds the operators that actually make novelty: loss at 16% — the commonest evolutionary event and the one nothing modelled — duplication, divergence of a duplicate into another receptor band, gain, counted-axis steps, categorical steps one grade at a time, and whole-genome duplication that unlocks every hardened axis for one step.'],
  ['A body could be physically silly for free', 'Twelve incompatibility rules now multiply into `node.morphMult`, which `fitness()` reads: a gilled land animal costs 0.25 because gill lamellae collapse in air, a phototroph at a vent costs 0.08 because no photons reach it, a tracheal body over a kilogram costs 0.3 because diffusion cannot supply it. Convergence is allowed and paid for, and the HUD shows the multiplier with the reason on hover.'],
  ['Every creature ever drawn had a pigment bias of exactly 0.5', '`bodyPlanFromTraits` read `traits[TRAITS.thermalOpt]`. `TRAITS` has no key called `thermalOpt`, so this was `traits[undefined]`, which is `undefined`, which took the `?? 0.5` default on every creature on every world since the function was written. It reads `TRAITS.tOpt` now, and colour bias for genome-expressed bodies comes from the receptor bands the lineage\'s own eyes are tuned to.'],
  ['The silhouette test rejected nothing', '`passesSilhouette` gated on `plan.silhouette`, computed as `limbs >= 2 || symmetry === \'radial\' || appendage === \'frond\' ? 1 : 0.4` — a condition satisfied by every reachable body, so across 20,736 samples the score took exactly one value and the "reject mush" rule rejected nothing. It is a graded score over limbs, segments, defence and size now.'],
  ['Bodies now change in the running simulation', '`morphTick` runs inside `evolveTick` on the phylogeny rate: one module event per lineage per tick, developmental locking that hardens with clade age and loosens in small populations, and speciation that clones the parent genome and applies one to three founder mutations. The chronicle prints the new body. The deep-time probe now reports `bodies=` and `sense=`, and on the measured run LUCA acquires an electric-field sense and an echo sense over 3.2 Gyr.'],
  ['Assertions that actually watch biology', '`vr/sim/test.mjs` is 162 passing: Eigen’s threshold, methane’s dielectric refusal, Kleiber mouse ≫ elephant, a two-species food web that can extinct a lineage below MVP, genome and tree round-trips, `drawCreature` without a canvas, a 24-tick deep-time biosphere that does not collapse, Archean CO₂ off the 0.85 cap, an airless world that never originates, a Holocene tree painted at generate, plus the photon-energy, pentaradial, lens-eye and gilled-land-animal checks. Modern Earth still calibrates: `meanLife ∈ [0.04, 0.45]`, CO₂ 200–800 ppm.'],
  ['The carbon cycle created CO₂ from cell count and pinned the sky at 0.85', '`carbonTick` summed `life[c] * AREA[c] * 0.018` into the atmosphere. AREA is mean-1, so at N=32 that is ~6,000 cells of fake carbon every tick, and Walker–Hays–Kasting weathering could not spend it. Rates are now area-weighted means, respiration is paid from the biomass pool, volcanic pulses are ingested into the reservoir, and weathering is WHK `(pCO₂/280 ppm)^0.3` balanced against outgassing plus seafloor basalt. Measured N=32, 300 ticks, 1.7 Gyr: CO₂ 0.27 → 0.124, never the cap.'],
  ['Oxygenic photosynthesis was a coin flip, and O₂ was a leak', 'Invention is now an accumulated clock: anoxygenic shelf mats integrate until a threshold, with seed jitter, then cyanobacteria seed on those cells. Free O₂ is buried organic carbon minus the Fe²⁺ ocean; the sink stays on until the iron is exhausted, so 2.74 Ga still reads O₂ = 0.0000 with `oxygenicPhotosynthesis` already true — which is the GOE, not a bug. Measured: invented by 3.74 Ga on seed 20260808; 79 distinct bodies; tree depth 4.'],
  ['Modern Earth had an empty Lab tree at tick 0', '`ensureLuca` waited for the first phylogeny tick. `seedHoloceneTree` now plants LUCA + Plantae + Metazoa + Pisces at generate and paints `popId` from the climate-belt biosphere, so inspect and the Lab tree have bodies before anyone presses play.'],
  ['Display grade was a planet-wide ladder', '`deriveGrade` read `W.transitions`, so every lineage shared a rung. It now reads that lineage’s genome — habitat, skeleton, thermal, size class, trophic — and two nodes under the same planetary flags can differ. `LIFE_CLASSES` stays a legend; `unlockedClassFromPool` stays an agent cap.'],
];

const NOW = [
  ['The GOE is after this 1.7 Gyr window, on purpose', 'N=32, 300 ticks, 2.74 Ga: oxygenic photosynthesis has invented, cyanobacteria hold at ~0.28, the tree is 86 living lineages at depth 4 with 79 bodies, CO₂ is 0.124 — and O₂ is still 0.0000 because the Fe²⁺ ocean has not yet been exhausted. That is the right shape. A longer run should show the rise once `fe2Ocean` hits zero.'],
  ['Most SHOW and PLAY items are still a readout, not a verb', 'The species page, tree SVG, sense/range/proto overlays, and a 20-slot `drawCreature` globe atlas exist. An embryo view, breeding, and a shareable genome seed-word do not. The Play desk can set origin difficulty and cull a lineage; genesis can pick solvent and handedness. The rest of the 400 is waiting on those remaining pictures and verbs.'],
  ['A Titan biosphere is slow, not structurally alien yet', 'Solvent, dielectric refusal and Arrhenius are consumed. Silicon, two biochemistries in one ocean, and a catalogue-wide prediction table are not. Ice moons get a radiolysis/chemo ceiling instead of a dimmer Earth, which is the right shape, and not yet a different tree.'],
];

const SEQ = [
  ['The missing biomass is found', '`biomass` — done. Guild colonisation was net-negative for every anoxygenic phototroph. Logistic growth from a seed, no 5% deep-ocean decay, and an origin that plants a shelf mat. Deep-time `meanLife` holds instead of falling by ×17.'],
  ['The tree is deeper than one', '`popscale`, `specmech`, `isolation` — done enough to see. Census population, isolation that accumulates, allopatry plus sympatry plus polyploidy. Measured depth 4 with 86 living lineages. Further depth still waits on more time and on the GOE.'],
  ['Selection has something other than the weather', '`diet`, `foodweb`, `biotic` — done as a first web. Prey ids, chirality block, Lotka–Volterra on census, fitness reads predation and competition, and trophic collapse can extinct a lineage. Parasites, mutualism and a bounded arms race are still open.'],
  ['The bodies are drawn', '`procsprite` — done as a generator. `drawCreature` from the genome plan on the local map and in a 20-slot globe atlas; Path2D sprites remain as fallback. Gait, sex, and a growth-series plate in the field guide are still SHOW items.'],
  ['Development is a clock, not an integer', '`somite`, `hox`, `growth` — started. Somite period/wavefront, Hox identity, heterochrony and canalisation live on the genome. The embryo view and a growth-series plate are not on screen yet.'],
  ['Then the sense view', '`senseview`. Overlays for sense, range and prebiotic inventory exist; the Sense overlay paints the globe in the band the lineage there can actually use, and dim where it cannot. Globe entities stamp `drawCreature` into a 20-slot atlas so unique bodies show from orbit without a per-entity canvas. An embryo view is still missing.'],
  ['Then the species page and the field guide', '`speciespage` — the inspect cell and Lab tree card now show census, Ne, range, genome axes and a phylogeny SVG. A proper field-guide plate with a growth series is still missing.'],
  ['Then coevolution properly', '`biotic` again, extended: parasites as lineages, mutualism with a cheating problem, arms races bounded by the power budget. This is what keeps a biosphere changing after it has finished adapting.'],
  ['Then extinction that selects', '`selective` — started. Impact, anoxia, freeze and volcanic pulses now weight mass, trophic level, sessility and defence, and a huge impact can sterilise the origin. Named victims appear in the chronicle. Recovery still restores too much of the same world.'],
  ['Then the alien biospheres, in full', '`exobio`. Solvent, Arrhenius and ice-moon radiolysis are consumed. 120 catalogue worlds each predicted properly, with every claim labelled measured, fitted or invented, is the remaining table.'],
  ['Then the verbs', '`lifeverbs`. Origin difficulty, cull, genesis solvent/handedness, seed-a-genome and transplant exist. Breed, isolate, sequence, name, rewind-and-change-one-thing do not.'],
];

/* ------------------------------------------------------------ markdown -- */
function markdown() {
  const L = [];
  L.push('# ORRERY — life');
  L.push('');
  L.push(`**${D.length} items.** Generated from \`scripts/life.mjs\` — edit that file, not this one, then run \`node scripts/life.mjs\`.`);
  L.push('');
  L.push('One question: is the life in this simulation something that happens, or something that was written down? Everything from the chemistry that makes the first replicator to the shape of the animal on the tile in front of you — and specifically whether any of it could ever have come out differently.');
  L.push('');
  L.push(`The measurement this pass starts from: evaluating \`bodyPlanFromTraits\` across 20,736 trait vectors gives **26 distinct body plans and six sprite kinds**. That is the entire creature space of a game about evolving life on other planets. The grammar shipped here spans 1.6 × 10²⁸ distinguishable bodies, senses are decided by photon energy and diffraction rather than by a ruleset flag, and ${FIXED.length} faults from that audit are fixed.`);
  L.push('');
  L.push(`Kind: **${count((x) => x.k === 'MODEL')}** model, **${count((x) => x.k === 'SHOW')}** picture and readout, **${count((x) => x.k === 'PLAY')}** verbs. Effort is S/M/L. Impact is 1–3.`);
  L.push('');

  L.push('## Fixed in this pass');
  L.push('');
  for (const [a, b] of FIXED) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## Where life actually is');
  L.push('');
  for (const [a, b] of NOW) L.push(`- **${a}.** ${b}`);
  L.push('');

  L.push('## The critical path');
  L.push('');
  L.push('The capabilities the largest number of other items are waiting on.');
  L.push('');
  L.push('| Capability | Item | Unblocks |');
  L.push('|---|---|---|');
  for (const r of CRITICAL.slice(0, 16)) {
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
  L.push('The through-line: life in this product was a ladder with eight rungs, a body was eleven floats, and no organism could see. It is now a grammar with an open morphospace, a genome with the operators that actually make novelty, and a sensory model that decides from photon energy and diffraction what a given planet can evolve. None of that is visible yet, and none of it matters until the biosphere stops shrinking.');
  L.push('');
  L.push('The order is not negotiable at the top. `biomass` first, because a biosphere at 0.0013 has nothing to evolve; then population and speciation, because a tree of depth one is not a tree; then the food web, because a world where nothing eats anything has no reason to keep changing; then the picture, because until a pentaradial animal with three near-IR eyes is drawn as one, everything above is a number in a log file.');
  L.push('');

  return L.join('\n');
}
/* ----------------------------------------------------------------- html -- */
function html() {
  const data = JSON.stringify(D.map((x) => ({
    id: x.id, c: x.c, t: x.t, d: x.d, k: x.k, e: x.e, i: x.i, g: x.g || '', n: x.n || [],
  })));
  const cats = JSON.stringify(CATS.map(([id, name, blurb]) => ({ id, name, blurb })));
  const crit = JSON.stringify(CRITICAL.slice(0, 16).map((r) => ({ k: r.k, id: r.x.id, t: r.x.t, n: r.n })));
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ORRERY — life</title>
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
  <div class="eyebrow">Deep dive · the open morphospace</div>
  <h1>Life</h1>
  <p class="sub">Is the life in this simulation something that happens, or something that
  was written down? Everything from the chemistry that makes the first replicator to the shape of
  the animal on the tile in front of you — and specifically whether any of it could ever have
  come out differently.</p>
  <p class="nav"><a href="./">Pitch</a> · <a href="backlog.html">Systems</a> ·
  <a href="worlds.html">Worlds</a> · <a href="evolution.html">Evolution</a> ·
  <a href="godgame.html">God layer</a> · <a href="next.html">Next 200</a> ·
  <a href="tides-weather.html">Tides &amp; weather</a> · <a href="geology.html">Geology</a> ·
  <a href="exoparams.html">Real parameters</a> · <a href="living.html">Alive</a> ·
  <a href="currents.html">Currents</a> · <a href="realism.html">Realism</a> ·
  <a href="landscape.html">Landscape</a> ·
  <a href="surface.html">Surface</a> · <a href="worldspace.html">World space</a> · <a href="../vr/">Prototype</a></p>
  <dl class="tally">
    <div><dt>Items</dt><dd>${D.length}<small>${CATS.length} categories</small></dd></div>
    <div><dt>Kind</dt><dd>${count((x) => x.k === 'MODEL')}/${count((x) => x.k === 'SHOW')}/${count((x) => x.k === 'PLAY')}<small>model · show · play</small></dd></div>
    <div><dt>Impact 3</dt><dd>${count((x) => x.i === 3)}<small>of ${D.length}</small></dd></div>
    <div><dt>Effort</dt><dd>${count((x) => x.e === 'S')}/${count((x) => x.e === 'M')}/${count((x) => x.e === 'L')}<small>S / M / L</small></dd></div>
  </dl>
</header>

<div class="prose">
  <h2>Fixed in this pass</h2>
  <ul class="state" id="fixed"></ul>

  <h2 style="margin-top:40px">Where life actually is</h2>
  <ul class="state" id="now"></ul>

  <h2 style="margin-top:40px">The critical path</h2>
  <p>The capabilities the largest number of other items wait on.</p>
  <div class="critwrap"><table class="crit"><tbody id="crit"></tbody></table></div>
</div>

<div class="controls">
  <div class="filters">
    <span class="flabel">Kind</span>
    <button class="f make" data-k="k" data-v="MODEL" aria-pressed="false">Model</button>
    <button class="f hand" data-k="k" data-v="SHOW" aria-pressed="false">Show</button>
    <button class="f" data-k="k" data-v="PLAY" aria-pressed="false">Play</button>
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
  <p style="margin-top:16px">The through-line: life in this product was a ladder with eight
  rungs, a body was eleven floats, and no organism could see. It is now a grammar with an open
  morphospace, a genome with the operators that actually make novelty — duplication, divergence,
  loss and whole-genome duplication — and a sensory model that decides from photon energy and
  diffraction what a given planet can evolve.</p>
  <p>The order is not negotiable at the top. <code>biomass</code> first, because a biosphere
  measured at 0.0013 after 3.2 Gyr has nothing to evolve; then population and speciation, because
  a tree of depth one is not a tree; then the food web, because a world where nothing eats
  anything has no reason to keep changing; then the picture, because until a pentaradial animal
  with three near-IR eyes is drawn as one, everything above is a number in a log file.</p>
</div>

<footer>
  Generated from <code>scripts/life.mjs</code> — edit the source and re-run, do not edit the output.
</footer>
</div>

<script>
"use strict";
var DATA = ${data};
var CATS = ${cats};
var CRIT = ${crit};
var NOW = ${JSON.stringify(NOW)};
var FIXED = ${JSON.stringify(FIXED)};
var SEQ = ${JSON.stringify(SEQ)};
var KLABEL = {MODEL:'Model', SHOW:'Show', PLAY:'Play'};
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
      var cls = o.k === 'MODEL' ? 'make' : o.k === 'SHOW' ? 'hand' : 'pick';
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
await writeFile(join(ROOT, 'briefs', 'life-backlog.md'), markdown() + '\n');
await writeFile(join(ROOT, 'site', 'life.html'), html());

console.log(`life: ${D.length} items across ${CATS.length} categories`);
for (const [id, name] of CATS) console.log(`  ${String(byCat(id).length).padStart(3)}  ${name}`);
console.log(`\nkind     model ${count((x) => x.k === 'MODEL')} · show ${count((x) => x.k === 'SHOW')} · play ${count((x) => x.k === 'PLAY')}`);
console.log(`effort   S ${count((x) => x.e === 'S')} · M ${count((x) => x.e === 'M')} · L ${count((x) => x.e === 'L')}`);
console.log(`impact   3 ${count((x) => x.i === 3)} · 2 ${count((x) => x.i === 2)} · 1 ${count((x) => x.i === 1)}`);
console.log('\ncritical path:');
for (const r of CRITICAL.slice(0, 16)) {
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
if (badCat.length) console.log(`\nWARNING unknown categories: ${badCat.map((x) => x.c).join(', ')}`);
console.log('\nwrote briefs/life-backlog.md and site/life.html');
