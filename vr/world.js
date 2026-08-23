/** World state: fields, generation, coupled tick. */

import { clamp } from './math.js';
import { NC, AREA, DIR, NBR, setResolution, N as SIM_N } from './sphere.js';
import { RULESETS } from './rulesets.js';
import { createChronicle, logEvent, maybeNameEra } from './chronicle.js';
import { generateTectonics, tectonicsTick, erosionTick } from './sim/tectonics.js';
import { applyOriginDigestToWorld } from './sim/originSketch.js';
import { roundCoastTips, laplacianCoast } from './sim/terrainShape.js';
import { planetGeoTick } from './sim/planetTick.js';
import { hydroTick, tsunamiTick, liquidWaterOk, startTsunami, primeDrainage } from './sim/hydro.js';
import {
  atmoTick, atmoMetaTick, aerosolDecayTick, applyWarShade, cloudsTick, advect, advectScalar,
} from './sim/atmo.js';
import { bioTick, seedLife, LIFE_CLASSES } from './sim/bio.js';
import { gaiaTick } from './sim/gaia.js';
import { fitSeaLevel, seedPolarIce, seedEarthBiosphere, primeEarthMoisture } from './sim/earth.js';
import { refineEarthHypsometry } from './sim/earthTerrain.js';
import { refinePlanetHypsometry } from './sim/planetTerrain.js';
import { worldAxes } from './sim/worldAxes.js';
import { cachePlanetKind, hasSurface } from './sim/planetKind.js';
import { applyWorldLook, definitionOf } from './sim/definition.js';
import { stampSubstrate, packSubstrate, unpackSubstrate } from './sim/substrateField.js';
import { stampCover } from './sim/cover.js';
import { noteColumn } from './sim/columnSketch.js';
import { stampColumn } from './sim/columnField.js';
import { stampStack, packStack, unpackStack } from './sim/colstack.js';
import { stampLandforms } from './sim/landform.js';
import { reliefFromGravity } from './sim/exophysics.js';
import { applyLandscape, landmassReport, nameWorld } from './sim/landscapes.js';
import { encodeWorldId } from './sim/seedword.js';
import {
  initLayerStack, captureBase, absorbSimDelta, packLayerStack, unpackLayerStack,
} from './sim/layers.js';
import {
  initDeepTime, advanceClock, hadeanTick, formatAge, maybeCaptureMoment,
} from './sim/time.js';
import { UNIT_MAP, unitsSchemaHash } from './sim/units.js';
import { fieldsSchemaHash, FIELDS } from './sim/fields.js';
import {
  wrapWorldDebug,
  withOwner,
} from './sim/worldGuard.js';
export { wrapWorldDebug, withOwner };
import { createCarbonState, carbonTick } from './sim/carbon.js';
import { initRedox, redoxTick, seedModernGuilds, initSpeciesFields } from './sim/redox.js';
export { UNIT_MAP };
import { initEvolution, evolveTick, forkWorldSeed, treeSummary, packTree, unpackTree, seedHoloceneTree } from './sim/evolve.js';
import { deriveLifeClass, unlockedClassFromPool } from './sim/lifeclass.js';
import { ecologyTick } from './sim/ecology.js';
import { extinctionTick, noteImpact } from './sim/extinction.js';
import { alienTick } from './sim/alien.js';
import { multiRateMask } from './sim/meta.js';
import {
  profileEnabled, beginTickProfile, publishMs, addTickAcc, recordMs, shouldRun,
} from './sim/scheduler.js';
import { initGod, godTick } from './sim/god/index.js';
import { attachWorldRng } from './sim/rng.js';
import { assertBudgets } from './sim/assert.js';
import { initOcean, oceanTick } from './sim/ocean.js';
import { geostrophicWind } from './sim/wind.js';
import { frontsTick, frontBudget } from './sim/fronts.js';
import { giantTick } from './sim/jets.js';
import { skyFromStarAtmosphere } from './sim/scatter.js';
import { applyIceShell, iceShellTick } from './sim/iceshell.js';
import { initTides, tidesTick } from './sim/tides.js';
import { initSky, skyTick, packOrbital, unpackOrbital, migrateOrbitalFromRuleset } from './sim/sky.js';
import { applyCatalogueSky } from './sim/skyScenarios.js';
import { initStorms, resetStorms, stormsTick } from './sim/storms.js';
import { airColumnTick, allocAir, resetAir } from './sim/aircol.js';
import { allocWeatherClock, weatherClockTick } from './sim/weatherClock.js';
import { initWeather, resetWeather, severeTick, droughtTick, convectTick, wireWeatherModules, droughtBudget } from './sim/weather.js';
import { orgConvectionTick } from './sim/convect.js';
import { applyInterior, interiorTick } from './sim/core.js';
import { initMantle, mantleTick } from './sim/mantle.js';
import { gpgpuClimateTick } from './sim/gpgpu/index.js';
import { isModernEarth, isDeepTimeEarth, cloneRuleForRun, isPinnedEarth } from './sim/ruleMode.js';
import { initClockFace, shouldHoldCalendar, applyLivedClimateDt, setClockFace } from './sim/clockFace.js';
import { applyEpochAtGenerate } from './sim/epoch.js';
import { seedTechnosphere, technoTick } from './sim/techno.js';
import { agentsTick, resetEntities, packEntities, restoreEntities } from './agents.js';
import { fireTick, resetFireState, igniteFire } from './sim/fire.js';
import { lightningTick, resetLightning, strike as lightningStrike } from './sim/lightning.js';
import { anthroTick, resetAnthro } from './sim/anthro.js';
import { ordnanceTick, resetOrdnance } from './sim/ordnance.js';
import {
  resetPolities, ensureOwner, seedPolitiesFromCities, claimTerritory,
  ensurePlayerPolity,
  splitDisconnected, packPolities, unpackPolities, remapOwner,
} from './sim/polity.js';
import { resetDiplomacy, diplomacyTick } from './sim/diplomacy.js';
import { resetDeterrence, deterrenceTick } from './sim/deterrence.js';
import { resetDark, darkTick } from './sim/dark.js';
import { darkEnabled } from './sim/darkGate.js';
import { resetWear } from './sim/present.js';

function buf() { return new Float32Array(NC); }
function ibuf() { return new Int32Array(NC); }
function u8() { return new Uint8Array(NC); }

/** Reallocate all NC-sized fields after setResolution.
 *  H9 — curated FIELDS float32/uint8 rows allocate from the schema first. */
export function reallocateWorldFields(target = W) {
  const fromSchema = new Set();
  for (const row of FIELDS) {
    if (row.kind !== 'field') continue;
    if (row.type === 'float32[]') {
      target[row.name] = buf();
      fromSchema.add(row.name);
    } else if (row.type === 'uint8[]') {
      target[row.name] = u8();
      fromSchema.add(row.name);
    }
  }
  const keys = [
    'h', 'crust', 'age', 'strain', 'ore', 'sediment', 'ash', 'dust',
    'frost', 'lag', 'grain',
    'temp', 'moist', 'precip', 'clouds', 'ice', 'iceLand', 'iceSea',
    'flow', 'lake', 'windU', 'windV', 'life', 'soil', 'nutrientN', 'nutrientP',
    'reef', 'build', 'blackDaisy', 'whiteDaisy',
    'press', 'converg', 'tideRange', 'tideHeight', 'intertidal', 'tideWet', 'tideU', 'tideV',
    'stormField', 'surgeField', 'stormTrail',
    'oceanU', 'oceanV', 'waveHt', 'lava', 'mixDepth', 'groundW',
    'mantleU', 'mantleV', 'dynTopo', 'vapour', 'cont', 'coastDist', 'biomeMix',
    '_t', '_m', '_l', '_h', '_adv', 'prevTemp', 'prevLife', 'prevIce',
    'macroDens', 'cladeCount', 'hydrotherm', 'protoOrg', 'detritus',
    'fire', 'nutrientPlume',
    'trophProd', 'trophHerb', 'trophCarn', 'trophDecomp', 'trophOccHerb', 'trophOccCarn',
    'preyFear', 'carcassField',
    'lifeFront', 'lifeFlux', 'lifePrevTick',
  ].filter((k) => !fromSchema.has(k));
  for (const k of keys) target[k] = buf();
  // Anthro harm fields — allocated here so generate after N-change does not
  // leave them null while a later tick creates them (reset digest contract).
  target.toxin = buf();
  target.rad = buf();
  target.disease = buf();
  target.warFront = buf();
  target.immune = buf();
  target.rock = u8();
  if (!fromSchema.has('substrate')) target.substrate = u8();
  target.landform = u8();
  target.lifeClass = u8();
  target.biome = u8();
  target.biome2 = u8();
  target.plateId = ibuf();
  target.popId = ibuf();
  target.drainTo = ibuf();
  target.drainTo2 = ibuf();
  /* Every prognostic field above has just been replaced with zeros, so the
     solvers that carry state across ticks have to be told they are starting
     again. Without this, `changeResolution` — which the app does at startup,
     going from the default grid to the one the device can afford — left the
     shallow-water solvers with `_sweBoot` still true: no diagnostic
     initialisation, a wind field of exactly zero, and a planet that had to
     accelerate the whole atmosphere from rest through surface drag. Hundreds of
     ticks of a windless world, which is what the app actually opened with.
     `_vapourInit` and the drainage tree are in the same position. */
  target._sweBoot = false;
  target._osweBoot = false;
  target._vapourInit = false;
  target._orderReady = false;
  target._hydroDirty = true;
  target._drainTick = null;
  target._freshBase = null;
  target._contTick = null;
  target._coastTick = null;
  target._shoreCells = null;
  target._waterMass0 = null;
  target.storms = [];
  target._fireCells = [];
  target._flashCells = [];
  target._toxinCells = [];
  target._radCells = [];
  target._diseaseCells = [];
  target._warCells = [];
  target._tracerCells = [];
  target.flight = [];
  target.interceptors = [];
  target.batteries = new Map();
  target._battFatigue = new Map();
  target.wars = [];
  target.owner = new Int16Array(NC);
  target.owner.fill(-1);
  target.border = new Float32Array(NC);
  target.fought = new Float32Array(NC);
  target.radar = new Float32Array(NC);
  target.tracer = new Float32Array(NC);
  target.shockwave = new Float32Array(NC);
  target.smoke = new Float32Array(NC);
  target.fireball = new Float32Array(NC);
  target._shockEvents = [];
  target._blastPunch = 0;
  target.radShort = new Float32Array(NC);
  target.exclusion = new Float32Array(NC);
  target.rubble = new Float32Array(NC);
  target.casualty = new Float32Array(NC);
  target.fogOfWar = new Float32Array(NC);
  target.fogReveal = new Float32Array(NC);
  target.fort = new Float32Array(NC);
  target.polityTint = new Float32Array(NC);
  target.frontDir = new Float32Array(NC);
  target.arsenalFired = Object.create(null);
  target.defenceStats = { shots: 0, intercepts: 0, leaks: 0, salvoLog: [] };
  target.polities = [];
  target._polityIndex = null;
  target.playerPolity = -1;
  target.polityCount = 0;
  target.borderLen = 0;
  target.diplo = null;
  target.doomsday = 0;
  target.exchangesConsidered = 0;
  target.exchangesLaunched = 0;
  target.exchangesRetaliated = 0;
  target.exchangesDeclined = 0;
  target.darkToll = null;
  target.warCrimes = [];
  target.dark = null;
  target.mushrooms = [];
  target._blastFlash = 0;
  target.bound = new Int8Array(NC);
  target._order = new Int32Array(NC);
  target.shellLid = target.shellOcean = target.shellMantle = target.shellVent = null;
  target._iceShell = false;
  target._simN = SIM_N;
  // Prognostic ocean/isostasy live outside the buf() list — leftover values
  // from a previous generate() make the next golden run diverge.
  target.oceanSurf = target.oceanDeep = target.oceanSalt = target.upwell = null;
  target.upwelling = null;
  target.vort = null;
  target.pSeen = target.chroma = target.spot = null;
  target._chromaTmp = null;
  target._jetCount = 0;
  target._jetSpin = null;
  target._spotSeeded = false;
  target._spotCell = 0;
  target._hotspotLon = 0;
  target._tauE = target._tauN = null;
  target._iso0 = null;
  target._mantle = null;
  target._dyn0 = null;
  target.layerStack = null;
  target._ensoIndex = 0;
  target._thermoclineTilt = 0;
  target._walkerSST = 0;
  target._ensoPhase = 'neutral';
  target._ensoEvent = null;
  target._ensoBasinN = null;
  target._ensoBasinLon = null;
  target._ensoBasinSea = null;
  target._ensoBasinTick = -1;
  target._fetchTick = -1;
  target._fetch = null;
  target._ssh = null;
  target._fluidMask = null;
  target._fluidMaskSea = null;
  target._osweBoot = false;
  target._sweBoot = false;
  target._orderReady = false;
  target._drainTick = null;
  target._hydroDirty = true;
  target._vapourInit = false;
  target._mocSv = 17;
  target._jetLat = 0;
  target._monsoon = 0.5;
  target.conveyor = 1;
  target._amoc = 1;
  target.thermohaline = 'on';
  target._conveyorNote = null;
}

/** Change cube-sphere resolution; pair with remeshPlanet() in render. */
export function changeResolution(n) {
  const oldOwner = W.owner;
  const oldN = SIM_N;
  const savedPolities = W.polities ? W.polities.map((p) => ({ ...p })) : [];
  const playerPolity = W.playerPolity;
  const r = setResolution(n);
  reallocateWorldFields(W);
  W.owner = remapOwner(oldOwner, oldN, SIM_N);
  W.polities = savedPolities;
  W.playerPolity = playerPolity ?? -1;
  return r;
}

export function createWorld() {
  const W = {
    h: buf(), crust: buf(), age: buf(), rock: u8(), substrate: u8(), landform: u8(), plateId: ibuf(), bound: new Int8Array(NC),
    strain: buf(), ore: buf(), sediment: buf(), ash: buf(), dust: buf(),
    frost: buf(), lag: buf(), grain: buf(),
    temp: buf(), moist: buf(), precip: buf(), clouds: buf(),
    ice: buf(), iceLand: buf(), iceSea: buf(),
    flow: buf(), lake: buf(),
    windU: buf(), windV: buf(),
    life: buf(), lifeClass: u8(), soil: buf(), nutrientN: buf(), nutrientP: buf(), reef: buf(),
    build: buf(), fire: buf(), nutrientPlume: buf(), flash: buf(),
    toxin: buf(), rad: buf(), disease: buf(), warFront: buf(), immune: buf(), tracer: buf(),
    blackDaisy: buf(), whiteDaisy: buf(),
    _t: buf(), _m: buf(), _l: buf(), _h: buf(), _adv: buf(), _order: new Int32Array(NC),

    gases: { N2: 0.7808, O2: 0.2095, CO2: 0.00042, CH4: 0.0000019, H2O: 0.01, dust: 0, sulphate: 0 },
    seaLevel: 0.0, solar: 1, obliquity: 0.4, season: 0, rotationPeriod: 1, greenhouse: 0.1,
    year: 0, ageYr: 0, dtYr: 200, seed: 0, rule: RULESETS[0],
    unlockedClass: 0, ozone: 0, bodyScale: 1,
    meanTemp: 0.5, meanLife: 0, iceFrac: 0, landFrac: 0.3, health: 0.5, resilience: 0.5,
    habitability: 0.5, inhabitance: 0, disequilibrium: 0,
    state: 'stable', autopilot: false, plague: 0,
    energy: 100, energyCap: 100, budgetMode: false, energyIncome: 1,
    plates: null, volcanoes: [], hotspots: [], tsunamis: [],
    chron: createChronicle(),
    _waterMass0: null, waterMass: 0, waterDrift: 0,
    _oxEvent: false, pausedSolar: false, _pauseBio: false,
    prevTemp: buf(), prevLife: buf(), prevIce: buf(),
    carbon: null, tree: null, transitions: null, guildDens: null, species: null,
    moments: {}, ics: null, rng: null, rngState: 0,
  };
  return W;
}

export let W = createWorld();

/** Opt-in P21/P41 — reassigns the live `W` export to a Proxy when wrap is true. */
export function enableWorldAsserts(wrap = true) {
  W.debugAssert = 'throw';
  if (wrap) W = wrapWorldDebug(W, { seal: true, owners: true });
  return W;
}

function chronLog(year, kind, cell, mag, label, meta) {
  logEvent(W.chron, year, kind, cell, mag, label, meta);
}

function attachRng(seed) {
  attachWorldRng(W, seed);
}

function bootPhase(label, detail = '') {
  if (typeof W._bootPhase === 'function') W._bootPhase(label, detail);
}

/* SEV32/34: wire lightning and fire into weather's lazy references */
wireWeatherModules({ strike: lightningStrike }, { igniteFire });


export function generate(seed, ruleIn) {
  const rule = cloneRuleForRun(ruleIn);
  bootPhase('Forming world', rule.name || 'planet');
  W.seed = seed;
  W.landSeed = seed;
  W._sculpted = false;
  W.rule = rule;
  reallocateWorldFields(W);
  attachRng(seed);
  W.chron = createChronicle();
  W._waterMass0 = null;
  /* The substrate column stack is built by `stampStack` late in `generate`, well
     after the climate warm-up — but `erosionTick` branches on this flag, so during
     the warm-up it was reading whether the *previous* world had a stack. Generate
     a moon and then a Mars and Mars eroded through the stack path; generate Mars
     first and it did not. Same seed, same rule, two different planets, and the
     divergence showed up as a 21 K difference across 151 cells. */
  W._stackLive = false;
  /* Ignition switch. `fireTick` honours this now, and the fire-danger scan lives
     behind the same gate — so a world that inherited it from a previous run had
     both its ignitions and its danger readout switched off, and `fireDangerMax`
     decayed quietly to zero. */
  W._noIgnite = false;
  /* Height-rank ladder for the map-square rules. Sampled from this world's own
     hypsometry, so it must not survive into the next one — Io ranked itself
     against Mars and came out uniformly `patera`. */
  W._hypsoQ = null;
  W._hypsoStamp = null;
  W._oxEvent = false;
  W.unlockedClass = 0;
  W.state = 'stable';
  W.techno = null;
  W._epoch = null;
  W._epochStarted = false;
  W._epochArrived = false;
  W._postbio = false;
  W.plague = 0;
  W._moonImpact = false;
  W._zirconWater = false;
  W._namedExt = {};
  W._chicxulub = false;
  W._extinctionPulse = 0;
  W._recoveryBoost = 0;
  W._inMassExt = false;
  W._lomagundi = false;
  W._tickIndex = 0;
  W._prevLiving = undefined;
  W.extinctionDebt = 0;
  W.endemicCount = 0;
  W.refuge = null;
  W.albedoPaint = null;
  W.touchHeat = null;
  W.erosionLock = null;
  W.fossils = null;
  W.traces = null;
  W._speciesScratch = null;
  W.hazeAntiGreenhouse = 0;
  // Derived biosphere scalars. `bodyScale` in particular survives a run through
  // `bio.js`'s `W.bodyScale = W.bodyScale || …`, so a second generate in the same
  // process inherited the previous world's value and the golden hash stopped being
  // reproducible — a fresh generate and a post-tick generate differed in life,
  // meanLife, health, resilience, inhabitance, detritus, popId and shannon.
  W.bodyScale = 1;
  // Fields that only exist once a tick has run. `generate` has to clear them or a
  // second generate in the same process inherits the previous world's values, which
  // is what broke the golden hash: `ecology.js` reads `if (W.photonUsable != null)
  // npp *= W.photonUsable`, so a fresh run left NPP unscaled and a post-tick run
  // scaled it, and `life` diverged from there through meanLife, health, resilience,
  // inhabitance, detritus, popId and shannon.
  W.photonUsable = null;
  W.bioRate = null;
  W.chemoPower = 0;
  W.terminatorHab = null;
  W.marineOnly = false;
  W.sterileWhy = null;
  W.lifeGrown = 0;
  W.lifeDied = 0;
  W.keelingHistory = null;
  W.latDiversity = null;
  // `origin.js` guards with `W.vents = W.vents || []` and only seeds when the list is
  // empty, so without this a second generate inherited the previous planet's vent
  // field — 173 stale vents on a brand-new world — and `seedVents` forks its RNG from
  // `W.vents.length`, so the seeding was order-dependent too.
  W.vents = null;
  W.originBudget = null;
  W.originCell = null;
  // `updateIsoline` reuses the buffer and only writes `coastCount * 3` floats, so the
  // tail keeps the previous planet's coastline. Harmless to the draw call, which uploads
  // a subarray, but it is stale world state and it breaks the reset contract.
  // Same reset contract across *different* rules, not just a second generate of the
  // same one: each of these is written with `??`/`== null`/`||` by its owner, so a
  // leftover from the previous world survived into the next one.
  W.magTilt = null;        // core.js: W.magTilt ?? …
  W.lucaId = null;         // evolve.js stamps the first lineage id
  W._angMom = null;        // assert.js latches the first reading as the reference
  W._angMom0 = null;
  W._carbonMass0 = null;
  W.carbonDrift = 0;
  W._waterProxy0 = null;   // assert.js latches the first reading it sees
  W.waterProxy = 0;
  W.waterProxyDrift = 0;
  W._contamAg = 0;
  W._anyHarm = false;
  W.beingDens = null;
  W._relaxScratch = null;  // redox.js relaxation scratch buffers
  W.coastLine = null;
  W.coastCount = 0;
  W._isoTick = -1;
  W._isoSea = null;
  // Derived readouts written during a tick. Enumerated by running every playable
  // ruleset through generate → 40 ticks → generate and diffing the world; the test
  // `a generate after a run equals a fresh generate` keeps the list honest. Without
  // them two identical generates of Selene reported habitability 0.5 and then 0.3.
  W.habitability = null;
  W.npp = null;
  W.biomeCounts = null;
  W.ecotoneFrac = 0;
  W.herbivore = 0;
  W.carnivore = 0;
  W.trophic = null;
  W.biosphereWatts = 0;
  W.bioticTerm = 0;
  W.redQueen = 0;
  W.oxyInvent = null;
  W.oxyThresh = null;
  W.rnaKb = null;
  W.originReport = null;
  W.shadowBiosphere = null;
  W.planetBiochem = null;
  W._springEvent = false;
  W._ensoSeen = null;
  W._ensoQ = null;
  W.morphFirsts = null;
  W.morphospaceOccupied = 0;
  W.morphChanged = 0;
  W.topSense = null;
  W.senseBands = [];
  W._morphEnvCache = null;
  W.sulfurPaint = null;
  W.mood = null;
  W.huntKills = 0;
  W.huntMisses = 0;
  W.grazeTotal = 0;
  W.carcasses = [];
  W.carcassCount = 0;
  W.gaiaDrive = 'regulator';
  W.gaiaLastAct = null;
  W.gaiaObjective = null;
  W.gaiaTipProx = 0;
  W.gaiaFailed = false;
  W._gaiaLifePrev = null;
  W.trail = null;
  W.popBook = { births: 0, deaths: 0, hunted: 0, immigrated: 0, emigrated: 0 };
  W.bioGen = 0;
  W.dtBio = 0;
  W.lifeStepsLast = 1;
  W.lifeSpeed = 1;
  W.livedRate = 1;
  W.livedDayRate = 1;

  initDeepTime(W, rule);

  // Deep-time Earth starts reducing; modern Earth keeps calibrated air
  if (isDeepTimeEarth(rule)) {
    W.gases = {
      N2: 0.7, O2: 0.0, CO2: 0.12, CH4: 0.001, H2O: 0.02, dust: 0.02, sulphate: 0,
    };
  } else {
    W.gases = { ...rule.gases };
  }
  W.carbon = createCarbonState(W.gases);
  applyEpochAtGenerate(W, 'air');
  initRedox(W);
  initEvolution(W);
  initGod(W);

  // Modern Earth starts with transitions already crossed
  if (isModernEarth(rule)) {
    Object.assign(W.transitions, {
      abiogenesis: true, rnaWorld: true, luca: true, bacteriaArchaea: true,
      oxygenicPhotosynthesis: true, aerobicRespiration: true, eukaryote: true,
      plastid: true, sex: true, multicellular: true, biomineral: true,
      landPlants: true, endothermy: true,
    });
    W.unlockedClass = 6;
    W.fe2Ocean = 0.001;
  } else if (isDeepTimeEarth(rule)) {
    W.fe2Ocean = 0.45;
  }

  W.obliquity = rule.obliquity;
  W._baseObliquity = rule.obliquity;
  W._solarMod = 1;
  W.season = 0;
  initClockFace(W, rule);
  if (ruleIn?.climateAnchor) {
    setClockFace(W, 'years', { force: true });
    W._climateAnchor = true;
  }
  // Earth-like worlds keep a Luna; Selene / airless may not
  W.obliquityWander = false;
  if (rule.earthLike && !rule.airless) {
    W._moonRaw = { mass: 1, distance: 1, formed: 4.51e9 };
  } else if (rule.id === 'selene' || rule.airless) {
    W._moonRaw = null;
  } else {
    W._moonRaw = { mass: 0.6, distance: 1.2, formed: W.ageYr };
  }
  initSky(W, rule);
  applyCatalogueSky(W, rule);
  W.energy = W.energyCap;
  W.moments = {};
  W.argueResponses = [];
  W.receipts = [];
  W.interventionLog = [];
  W.delayedHooks = [];
  W.attribution = { player: 0, planet: 1, acts: 0 };
  W.pendingForecast = null;
  W.overshootWarn = null;
  W.cooldowns = {};
  W.energyDebt = 0;
  W.bankedEnergy = 0;
  W.toolUses = {};
  W.disasterChain = [];
  W.gaiaLog = [];
  W.bookmarks = [];
  W.civ = null;
  W.cities = [];
  W.civPop = 0;
  W.meanBuild = 0;
  W.builtFrac = 0;
  W.builtCells = 0;
  W.groupCount = 0;
  W._cityLights = 0;
  W.buildersActive = 0;
  W._agentTick = 0;
  delete W._buildsDirty;
  resetEntities();
  resetWear();
  resetFireState(W);
  resetLightning(W);
  resetAnthro(W);
  resetOrdnance(W);
  resetPolities(W);
  resetDiplomacy(W);
  resetDeterrence(W);
  resetDark(W);
  W.flareGlow = 0;
  W.auroraPower = 0;
  W.auroraLat = 0.82;
  W.epidemic = null;
  // Chronicle rate-limiters. Objects and counters on W, so they must reset with
  // the world or the next planet starts mid-throttle.
  W._buildLogged = {};
  W._springLogged = 0;
  W._deathLogged = 0;
  W.plates = null;
  W.hotspots = null;
  W.volcanoes = [];
  W.ash.fill(0); W.dust.fill(0); W.sediment.fill(0);
  resetStorms(W);
  resetAir(W);
  resetWeather(W);
  if (W.frost) W.frost.fill(0);
  if (W.lag) W.lag.fill(0);
  if (W.grain) W.grain.fill(0);
  if (W.landform) W.landform.fill(0);
  W._landPalette = null;
  W._landProcesses = null;
  W._columnRecipe = null;
  W._atmScale = 1;
  W._atmFrozenNote = null;
  W._clathrate = null;
  W._clathrateNote = null;
  W._hpIceFloor = false;
  W._oceanKm = 0;
  W.soil.fill(0); W.reef.fill(0);
  resetFireState(W);
  if (W.nutrientPlume) W.nutrientPlume.fill(0);
  if (W.trophProd) {
    W.trophProd.fill(0); W.trophHerb.fill(0); W.trophCarn.fill(0); W.trophDecomp.fill(0);
    W.trophOccHerb.fill(0); W.trophOccCarn.fill(0);
  }
  if (W.preyFear) W.preyFear.fill(0);
  if (W.carcassField) W.carcassField.fill(0);
  if (W.lifeFront) { W.lifeFront.fill(0); W.lifeFlux.fill(0); W.lifePrevTick.fill(0); }
  W.carcasses = [];
  W.carcassCount = 0;
  W.huntMisses = 0;
  W.grazeTotal = 0;
  W.swarmMarks = [];
  W.swarmCount = 0;
  W.lifeSparks = [];
  W.frontCells = 0;
  W.frontMean = 0;
  W.frontMax = 0;
  W.disperseSeeds = 0;
  W.groupSplits = 0;
  W.groupMerges = 0;
  W._agentTick = 0;
  W._cityLights = 0;
  W.cities = [];
  W.herdMax = 0;
  W.surfaceFeeders = 0;
  W.blackDaisy.fill(0); W.whiteDaisy.fill(0);
  W.life.fill(0); W.lifeClass.fill(0);
  W.build.fill(0);
  W.iceLand.fill(0); W.iceSea.fill(0); W.ice.fill(0);
  W.clouds.fill(0); W.precip.fill(0); W.flow.fill(0); W.lake.fill(0);
  W.windU.fill(0); W.windV.fill(0);
  W.prevTemp.fill(0); W.prevLife.fill(0); W.prevIce.fill(0);
  if (W.press) W.press.fill(0);
  if (W.converg) W.converg.fill(0);
  if (W.tideRange) {
    W.tideRange.fill(0); W.tideHeight.fill(0);
    W.intertidal.fill(0); W.tideWet.fill(0);
  }
  if (W.stormField) { W.stormField.fill(0); W.surgeField.fill(0); }
  if (W.stormTrail) W.stormTrail.fill(0);
  W.storms = [];
  W._stormCount = 0;
  W._stormMax = 0;
  W._stormNameIx = 0;
  W._plateNames = null;
  W._seaBase = null;
  W._lastSpringLog = undefined;
  W.moonAngle = undefined;
  W.moonIllum = undefined;
  W._windRegime = undefined;
  W._itczLat = 0;
  W._lidHeat = 0.35;
  W._ioBurial = 0;
  W._venusOverturns = 0;
  if (W.hydrotherm) W.hydrotherm.fill(0);

  bootPhase('Plates', 'interior · boundaries');
  // Interior before tectonics — vigor & dynamo shape the plates
  applyInterior(W, rule, rule._catalogueItem || null);
  W.rotationPeriod = rule.rotationPeriod ?? W.rotationPeriod;
  // Recompute dynamo with actual spin on W
  applyInterior(W, rule, rule._catalogueItem || null);
  W._worldAxes = worldAxes(rule);
  cachePlanetKind(rule, W);
  applyWorldLook(rule);
  W._worldDef = definitionOf(W);
  W.noSurface = !hasSurface(W);
  if (rule.gravityLocked && Number.isFinite(rule.gravity) && !rule.earthLike) {
    rule.relief = reliefFromGravity(rule.gravity);
  }
  W._nonHydrostatic = !!(W._worldAxes.nonHydrostatic || rule.nonHydrostatic);

  if (!W.noSurface) {
    generateTectonics(W, seed, rule);
  } else {
    W.plates = [];
    W.volcanoes = [];
    W.hotspots = [];
  }
  initMantle(W, seed);
  W._seaBase = null;
  let ls = null;
  let targetLand = null;
  if (W.noSurface) {
    W.seaLevel = 0;
    W._seaBase = 0;
  } else {
    W.seaLevel = -0.05 + rule.totalWater * 0.42;
    ls = applyLandscape(W, seed, rule.landscape, rule);
    targetLand = rule.targetLandFrac ?? ls?.land ?? 0.29;
    if (targetLand != null) fitSeaLevel(W, targetLand);
    const waterK = rule._genesisWater ?? 1;
    if (Math.abs(waterK - 1) > 0.02) {
      W.seaLevel += (waterK - 1) * 0.045;
      W.seaLevel = clamp(W.seaLevel, -0.55, 0.85);
      W._seaBase = W.seaLevel;
    }
  }
  if (rule.earthLike) refineEarthHypsometry(W, seed, rule);
  else if (!rule.iceShell && !rule.daisyworld) refinePlanetHypsometry(W, seed, rule);
  if (ls?.relief) W._reliefScale = ls.relief;

  // Soften Voronoi tips, then stamp Theia scar so smoothing doesn't erase it.
  {
    if (!W.noSurface) {
      roundCoastTips(W, W.seaLevel);
      laplacianCoast(W, W.seaLevel, 3, 0.26);
    }
    const dig = rule._originDigest || W._pendingOriginDigest || null;
    if (dig && !W.noSurface) {
      applyOriginDigestToWorld(W, dig);
      laplacianCoast(W, W.seaLevel, 2, 0.2);
    }
    W._pendingOriginDigest = null;
  }

  for (let c = 0; c < NC; c++) {
    const lat = Math.abs(DIR[c * 3 + 1]);
    /* Start near a plausible profile, not far above one. This seeded the
       equator at 1.09 — 382 K — and left the spin-up to walk it down; sea cells
       relax at 3% a tick, so a generate handed the game a planet still tens of
       degrees hot and visibly cooling for its first few hundred ticks, which is
       also what the calibration harness kept measuring. 0.60 at the equator and
       0.30 at the poles is Earth's own profile on this scale. */
    W.temp[c] = clamp(W.solar * (0.30 + 0.30 * (1 - lat)) + 0.02, 0.12, 1.35);
    W.moist[c] = W.noSurface ? 0 : (W.h[c] < W.seaLevel ? 1 : 0.25);
    W.nutrientN[c] = 0.4; W.nutrientP[c] = 0.35;
  }
  if (rule.earthLike) seedPolarIce(W, rule);
  else if (!W.noSurface) seedVolatileIce(W, rule);
  geostrophicWind(W);
  giantTick(W, null);

  // Climate warmup. Ice albedo is off during spin-up so a fine grid cannot
  // snowball before heat has mixed: neighbour diffusion is per-cell, so the
  // same 24 ticks reach ~a hemisphere at N=32 and ~two cells at N=128.
  // High N keeps CPU climate (GPGPU advection is too weak to replace mix) and
  // skips ocean/tectonics so generate time stays in seconds, not minutes.
  const deepOpen = rule.deepTime || (!rule.earthLike && !rule.daisyworld && !rule.airless);
  W._spinup = true;
  W._gpgpuOff = true;
  W._pauseBio = true;
  bootPhase('Climate', 'warming atmosphere');
  if (deepOpen && W.ageYr < 0.5e9) {
    hadeanTick(W, chronLog);
    for (let i = 0; i < 8; i++) {
      simTick(true);
      hadeanTick(W, null);
    }
  } else {
    const base = rule.daisyworld ? 10 : (rule.earthLike ? 24 : 16);
    const warm = rule.daisyworld ? base : Math.min(256, Math.round(base * Math.max(1, SIM_N / 32)));
    // N≥192: climate-only mix. Full simTick at those sizes is minutes of ocean/bio
    // before the world even appears; golden tests stay on N=32/64 simTick path.
    if (SIM_N >= 192) {
      for (let i = 0; i < warm; i++) {
        if (i % 8 === 0) bootPhase('Climate', `${i + 1} / ${warm}`);
        geostrophicWind(W);
        giantTick(W, null);
        atmoTick(W, sunDirForAtmo());
      }
    } else {
      for (let i = 0; i < warm; i++) {
        if (i % 8 === 0) bootPhase('Climate', `${i + 1} / ${warm}`);
        simTick(true);
      }
    }
  }
  bootPhase('Rivers', 'drainage · coast');
  W._spinup = false;
  W._gpgpuOff = false;
  W._pauseBio = false;

  if (targetLand != null) {
    fitSeaLevel(W, targetLand);
    if (rule.earthLike) seedPolarIce(W, rule);
  } else if (rule.earthLike) {
    seedPolarIce(W, rule);
  }
  if (rule.earthLike && !rule.deepTime) {
    W._pauseBio = true;
    W._spinup = true;
    for (let i = 0; i < 4; i++) simTick(true);
    W._spinup = false;
    W._pauseBio = false;
    W._livedSeason0 = W.season || 0;
    W._livedT = 0;
  }

  if (!rule.daisyworld && !rule.earthLike) {
    const rng = W.rng;
    for (let c = 0; c < NC; c++) {
      if (W.h[c] < W.seaLevel) continue;
      const lat = Math.abs(DIR[c * 3 + 1]);
      if ((lat > 0.28 && lat < 0.52) || W.moist[c] < 0.2) {
        W.moist[c] = Math.min(W.moist[c], 0.08 + rng() * 0.06);
        W.nutrientN[c] = Math.min(W.nutrientN[c], 0.25);
      }
    }
  }

  if (rule.daisyworld) {
    const rng = W.rng;
    for (let c = 0; c < NC; c++) {
      W.h[c] = 0.15 + (W.rngGeo() - 0.5) * 0.1;
      if (rng() < 0.045) W.blackDaisy[c] = 0.75 + rng() * 0.2;
      else if (rng() < 0.045) W.whiteDaisy[c] = 0.75 + rng() * 0.2;
      W.life[c] = Math.min(1, W.blackDaisy[c] + W.whiteDaisy[c]);
    }
    W.seaLevel = -0.5;
    rule.solar = 0.7;
    W.solar = 0.7;
    W._baseSolar = 0.7;
  } else if (isModernEarth(rule)) {
    W.gases.N2 = rule.gases.N2;
    W.gases.O2 = rule.gases.O2;
    W.gases.CO2 = rule.gases.CO2;
    W.gases.CH4 = rule.gases.CH4;
    W.gases.H2O = rule.gases.H2O;
    W.gases.dust = 0;
    W.gases.sulphate = Math.min(W.gases.sulphate, 0.002);
    W.carbon = createCarbonState(W.gases);
    primeEarthMoisture(W);
    seedEarthBiosphere(W);
    seedModernGuilds(W);
    initSpeciesFields(W);
    seedHoloceneTree(W);
    W.unlockedClass = unlockedClassFromPool(W);
    deriveLifeClass(W);
  } else if (!rule.airless && !rule.sterile && !W.noSurface) {
    // Sparse nuclei — or wait for abiogenesis in deep time.
    // `sterile` worlds (Ares / B48) stay empty until a deliberate Life seed.
    if (!deepOpen) {
      const rng = W.rng;
      for (let c = 0; c < NC; c++) {
        if (W.h[c] < W.seaLevel) continue;
        if (W.moist[c] < 0.24) continue;
        if (W.temp[c] < 0.28 || W.temp[c] > 0.88) continue;
        if (rng() < 0.04) {
          W.life[c] = 0.9 + rng() * 0.1;
          W.lifeClass[c] = 0;
          W.moist[c] = Math.max(W.moist[c], 0.5);
        }
      }
    }
  }

  // Chemistry memory seeded once climate + coastlines are stable
  if (!isModernEarth(rule)) initSpeciesFields(W);

  W._waterMass0 = null;
  hydroTick(W);
  if (targetLand != null) {
    fitSeaLevel(W, targetLand);
    if (rule.earthLike) seedPolarIce(W, rule);
    hydroTick(W);
  }
  // Climate warmup already ran hydro. Two extra ticks then a dedicated
  // drainage prime so the opening world has a river network, not eight cells.
  W._hydroDirty = true;
  hydroTick(W);
  hydroTick(W);
  primeDrainage(W);
  if (targetLand != null) fitSeaLevel(W, targetLand);
  initOcean(W);
  if (!rule.airless) oceanTick(W);
  initTides(W);
  initStorms(W);
  allocAir(W);
  allocWeatherClock(W);
  initWeather(W);
  if (rule.iceShell) applyIceShell(W, rule);
  stampSubstrate(W);
  stampCover(W);
  noteColumn(W);
  stampColumn(W);
  stampStack(W);
  // `initRedox` runs ~260 lines above this, before `applyLandscape` and every
  // `fitSeaLevel`, so `seedVents` saw provisional terrain — on a fresh process Ares
  // seeded 0 vents and on a second generate it seeded 8,630 against the previous
  // planet's coastline. Drop them here, once the terrain is final, and the next
  // `originTick` reseeds through `initOrigin` against the world that actually exists.
  W.vents = null;
  /* Hydro's conservation reference, re-latched against the finished world —
     after `fitSeaLevel` and the drainage prime. assert.js uses the same
     `waterInventory` formula on a separate `_waterProxy0` latch (C81). */
  W._waterMass0 = W.waterMass;

  W._landscape = W.noSurface ? 'envelope' : (ls?.id || rule.landscape || 'auto');
  W._landReport = W.noSurface
    ? { count: 0, sizes: [], largestShare: 0, islands: 0, landFrac: 0, coastKm: 0 }
    : landmassReport(W);
  W.worldName = rule.worldName || nameWorld(seed, W._landscape);
  initLayerStack(W, { name: W._landscape });

  // Classify biomes once climate + drainage exist, so the opening picture
  // has membership, not a blank Uint8 field.
  if (!rule.daisyworld && !rule.airless && !W.noSurface) ecologyTick(W, null);

  bootPhase('Ready', W.worldName || rule.name || '');
  applyEpochAtGenerate(W, 'surface');
  seedTechnosphere(W);

  // Refresh planetary means after seeding
  gaiaTick(W, null);
  stampLandforms(W);

  chronLog(W.year, 'genesis', 0, 1,
    `${rule.name} forms (seed ${seed}) @ ${formatAge(W.ageYr)}`);
  W.prevTemp.set(W.temp);
  W.prevLife.set(W.life);
  W.prevIce.set(W.ice);
  skyTick(W);
}

let _sunDir = [1, 0.3, 0];

function sunDirForAtmo() {
  const d = W._sunDir;
  return d && d.length >= 3 ? d : _sunDir;
}

export function setSunDir(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  _sunDir = [x / l, y / l, z / l];
  W._sunDir = _sunDir;
}

/** How many `agentsTick` passes run inside one climate `simTick`. */
export function lifeSubsteps(W, rule = W.rule) {
  if (isPinnedEarth(rule)) return 1;
  const n = W.lifeSpeed | 0;
  if (n >= 8) return 8;
  if (n >= 4) return 4;
  if (n >= 2) return 2;
  return 1;
}

export function setLifeSpeed(n) {
  const v = n >= 8 ? 8 : n >= 4 ? 4 : n >= 2 ? 2 : 1;
  W.lifeSpeed = v;
  return v;
}

export function simTick(silent = false) {
  W.prevTemp.set(W.temp);
  W.prevLife.set(W.life);
  W.prevIce.set(W.ice);

  const log = silent ? null : chronLog;
  const rule = W.rule;
  const profiling = profileEnabled(W);
  // Always schedule rate + degradation accounting so E24 can name reduced work.
  const rate = beginTickProfile(W);
  const section = (name, fn) => {
    if (!shouldRun(W, name)) return undefined;
    if (!profiling) return fn();
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    try { return fn(); }
    finally {
      const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
      recordMs(name, ms);
      addTickAcc(W, ms);
    }
  };

  if (!rule.daisyworld) {
    if (shouldHoldCalendar(W, rule)) {
      /* Now: calendar welded; climate steps at day-scale so one year of sky
         is not decades of geology per breath. */
      applyLivedClimateDt(W);
    } else {
      if (W._dtYrGeologic != null && W.fixedDtYr == null) {
        /* Restore geologic step when leaving Now before adaptive runs. */
        W.dtYr = W._dtYrGeologic;
      }
      advanceClock(W, rule);
      W._dtYrGeologic = W.dtYr;
    }
    if (!silent) hadeanTick(W, log);
  } else {
    W.dtYr = 10;
    W.year += 10;
    W.ageYr = W.year;
  }
  // Dim the sun from war soot / L1 shade before climate integrates.
  applyWarShade(W);

  section('sky', () => skyTick(W));

  if (!rule.daisyworld && !rule.airless && !W.noSurface && rate.tectonics && !W._canvasMode) {
    tectonicsTick(W, W.chron, log);
    erosionTick(W);
  }
  if (!rule.daisyworld) planetGeoTick(W, log);
  if (!rule.daisyworld) interiorTick(W, log);
  if (!rule.daisyworld && !rule.airless && !W.noSurface) mantleTick(W);

  // CPU shallow-water wind always — hydro, storms and overlays read windU/V / converg / front.
  // GPGPU only replaces the thermal relaxation loop.
  geostrophicWind(W);
  frontsTick(W);
  giantTick(W, log);
  const gpu = section('atmo', () => gpgpuClimateTick(W));
  if (!gpu) section('atmo', () => atmoTick(W, sunDirForAtmo()));
  else {
    section('atmo', () => {
      advectScalar(W.temp, W.windU, W.windV, W._adv, 0.35);
      advectScalar(W.moist, W.windU, W.windV, W._adv, 0.3);
      advect(W.ash, W, 0.1);
      cloudsTick(W);
      atmoMetaTick(W);
      aerosolDecayTick(W);
    });
  }
  section('hydro', () => hydroTick(W));
  tsunamiTick(W);
  if (!rule.airless && !W.noSurface) {
    oceanTick(W);
    section('tides', () => tidesTick(W));
    /* The column before the phenomena that read it: instability, shear and
       vertical motion are diagnosed from this tick's winds and moisture, then
       storms, severe convection and the drought index all consume the same
       sounding rather than each inventing one. */
    /* COL21–30: weather clock tick with a short effective dt (1/60s nominal
       per sim tick); the real-time advance happens in the frame loop via
       livedTick path. Here we just prod the diurnal modulations. */
    if (W.wxClock?.enabled) weatherClockTick(W, 1 / 60);
    section('aircol', () => airColumnTick(W));
    section('convect', () => convectTick(W));
    section('orgconv', () => orgConvectionTick(W));
    section('storms', () => stormsTick(W, log));
    section('severe', () => severeTick(W, log));
    section('drought', () => droughtTick(W, log));
    section('lightning', () => lightningTick(W));
  }
  if (W._iceShell) iceShellTick(W);

  // Sky from star spectrum, tinted toward authored look when a definition set one.
  if (rule.star?.teff && rule.atmoStrength > 0.05) {
    const phys = skyFromStarAtmosphere(rule.star.teff, W.gases, rule.atmoStrength);
    const authored = rule.look?.skyRgb;
    if (authored) {
      rule.sky = [
        authored[0] / 255 * 0.65 + phys[0] * 0.35,
        authored[1] / 255 * 0.65 + phys[1] * 0.35,
        authored[2] / 255 * 0.65 + phys[2] * 0.35,
      ];
    } else {
      rule.sky = phys;
    }
  }

  if (!W._pauseBio && !W.noSurface) {
    section('alien', () => alienTick(W, log));
    if (rate.bio) {
      section('ecology', () => ecologyTick(W, log));
      section('redox', () => redoxTick(W, log));
      section('bio', () => bioTick(W, log));
    }
    if (rate.carbon) section('carbon', () => carbonTick(W, log));
    if (rate.phylogeny) {
      section('phylogeny', () => {
        evolveTick(W, log);
        extinctionTick(W, log);
      });
    }
  }
  section('techno', () => technoTick(W, log));
  section('gaia', () => gaiaTick(W, log));
  section('god', () => godTick(W, log));
  /* Beings are part of the world, not part of the view. `agentsTick` used to be
     called from the render loop in `main.js`, which put every individual, every
     settlement and every behaviour outside `runHeadless`, outside the save and
     outside the tests — and made the number of behaviour steps per simulated
     year a function of frame rate. It runs here now, after ecology so beings
     read this tick's life field, and it is skipped during generate's climate
     spin-up where there is no biosphere to walk yet. */
  if (!W._spinup && !rule.daisyworld && !W.noSurface) {
    /* Anthropogenic harm and anything in the air. Before fire, because both can
       start fires, and after the biosphere so this tick's `life` and `build` are
       what they damage. Sparse: a planet nobody has attacked costs five
       array-length checks. */
    ordnanceTick(W, log);
    anthroTick(W, log);
    /* Dark / polity / deterrence — optional second product (PURPOSE). */
    if (darkEnabled()) {
      const warLive = !!(
        (W.flight && W.flight.some((f) => !f.dead))
        || (W.interceptors && W.interceptors.some((ix) => !ix.dead))
        || (W.mushrooms && W.mushrooms.length)
        || (W.detonated | 0)
        || (W.gases?.dust || 0) > 0.012
        || (W.dark?.winter || 0) > 0.01
        || (W._empUntil || 0) > (W._tickIndex | 0)
        || (W._shockEvents && W._shockEvents.length)
      );
      const canPolity = !isPinnedEarth(W.rule) && (W.polities?.length || W.cities?.length);
      if (canPolity) {
        const t = W._tickIndex | 0;
        if (t % 4 === 0) {
          seedPolitiesFromCities(W, log);
          claimTerritory(W);
          splitDisconnected(W, log);
          ensurePlayerPolity(W);
        }
        if (W.polities?.length) {
          diplomacyTick(W, log);
          deterrenceTick(W, log);
        }
      }
      if ((canPolity && W.polities?.length) || warLive) {
        darkTick(W, log);
      }
    }
    fireTick(W, log);
    /* Biology clock: life can sub-step inside one climate tick. Pinned terra
       stays at 1 for golden reproducibility; thrive / lived worlds use
       `W.lifeSpeed` (1–8) so generations stay visible while geology is slow. */
    const lifeSteps = lifeSubsteps(W, rule);
    W.dtBio = (W.dtYr || 10) / Math.max(1, lifeSteps);
    W.bioGen = (W.bioGen || 0) + (W.dtBio / 25);
    for (let s = 0; s < lifeSteps; s++) agentsTick(log);
    W.lifeStepsLast = lifeSteps;
  }
  absorbSimDelta(W);

  /* Conservation check every 32 ticks. This was `(W.year | 0) % 32`, and
     `W.year` is an absolute age up to 4.567e9 — past int32, so `| 0` wrapped it,
     and `dtYr` ranges from 10 to 1e7, so the cadence was either every tick or
     never depending on the world. On pinned Earth it was every tick: three full
     NC sweeps plus a NaN scan, for a debug assertion. `_tickIndex` is the
     counter `multiRateMask` already maintains. */
  if ((W._tickIndex | 0) % 32 === 0) section('assert', () => assertBudgets(W));

  if (profiling) publishMs(W);

  if (!silent) {
    maybeNameEra(W.chron, W);
    if (W._ensoEvent) {
      chronLog(W.year, 'climate', 0, W._ensoIndex || 0, W._ensoEvent);
      W._ensoEvent = null;
    }
    if (W._springEvent) {
      /* Rate-limited. Springs recur twice a lunar month, and at 200 years a tick
         every single tick contains thousands of them — this logged 288 identical
         lines in 800 ticks. Keep it as an occasional reminder that the Moon is
         there, not as a metronome. */
      W._springLogged = (W._springLogged | 0) + 1;
      if (W._springLogged % 24 === 1) {
        chronLog(W.year, 'tide', 0, W.meanTideRange || 0, 'Spring tides');
      }
      W._springEvent = false;
    }
    if (W._lastEulogy) {
      chronLog(W.year, 'eulogy', 0, 1, W._lastEulogy);
      W._lastEulogy = null;
    }
    if (W.moments) {
      for (const m of Object.values(W.moments)) {
        if (!m._logged) {
          m._logged = true;
          W.chron.moments.push(m);
          if (log) log(m.ageYr, 'moment', m.cell || 0, 1, m.label);
        }
      }
    }
  }
}

/**
 * Ice cover on a world that is not Earth.
 *
 * `rule.freeze` says whether ice is *stable* at a temperature; it does not say
 * whether there is any ice to be stable. This used to lay ice on every cell below
 * `freeze + 0.08`, which was survivable while the freeze line was mis-scaled and
 * became absurd once it was corrected: Mars' line sits at 0.895 on the normalised
 * scale — it really is below freezing almost everywhere — so the whole planet came
 * out under a sheet. Every square on the Mars map read `polarIce`, which is also
 * why the tour's Mars step could never be completed: it waits for a `rust` chip
 * that no cell could produce.
 *
 * Mars is below freezing nearly everywhere *and* has bare ground, because its
 * water is a hundredth of Earth's and what there is sits at the poles. So the
 * phase threshold sets where ice *can* survive and the volatile inventory sets
 * how much of that there is: the coldest fraction of the surface gets it. On a
 * dry world that is a polar cap; on an ice-rich one like Pluto it is most of the
 * globe; on Venus or Io the phase gate keeps it at none.
 */
function seedVolatileIce(W, rule) {
  const phase = (rule.freeze ?? 0.3) + 0.08;
  const inventory = clamp(rule.totalWater ?? 0.4, 0, 1);
  // What share of the surface the inventory can actually cover.
  const share = clamp(inventory * 0.62, 0.015, 0.92);
  const temps = [];
  for (let c = 0; c < NC; c++) {
    if (W.temp[c] < phase) temps.push(W.temp[c]);
  }
  if (!temps.length) return;
  temps.sort((a, b) => a - b);
  const want = Math.min(temps.length, Math.max(1, Math.round(NC * share)));
  const cut = temps[want - 1];
  const thick = 0.35 + inventory * 0.55;
  for (let c = 0; c < NC; c++) {
    if (W.temp[c] >= phase || W.temp[c] > cut) continue;
    const sea = W.h[c] < W.seaLevel;
    W.iceLand[c] = sea ? 0 : thick;
    W.iceSea[c] = sea ? Math.min(1, thick + 0.1) : 0;
    W.ice[c] = Math.max(W.iceLand[c], W.iceSea[c]);
  }
}

/** Keep gases, life, and the clock — roll a new geography on this world. */
export function rerollTerrain(Wref = W) {
  const rule = Wref.rule;
  if (!rule || rule.daisyworld) return { ok: false, note: 'No land to reroll' };
  const gases = { ...Wref.gases };
  const year = Wref.year;
  const ageYr = Wref.ageYr;
  const season = Wref.season;
  const worldSeed = Wref.seed;
  Wref._landRoll = (Wref._landRoll | 0) + 1;
  const seed = (worldSeed ^ (Wref._landRoll * 0x9e3779b9)) >>> 0;
  Wref.landSeed = seed;
  generateTectonics(Wref, seed, rule);
  initMantle(Wref, seed);
  Wref.seaLevel = -0.05 + rule.totalWater * 0.42;
  const ls = applyLandscape(Wref, seed, rule.landscape, rule);
  const targetLand = rule.targetLandFrac ?? ls?.land ?? 0.29;
  if (targetLand != null) fitSeaLevel(Wref, targetLand);
  const waterK = rule._genesisWater ?? 1;
  if (Math.abs(waterK - 1) > 0.02) {
    Wref.seaLevel += (waterK - 1) * 0.045;
    Wref.seaLevel = clamp(Wref.seaLevel, -0.55, 0.85);
    Wref._seaBase = Wref.seaLevel;
  }
  if (rule.earthLike) refineEarthHypsometry(Wref, seed, rule);
  else if (!rule.iceShell && !rule.daisyworld) refinePlanetHypsometry(Wref, seed, rule);
  Object.assign(Wref.gases, gases);
  Wref.year = year;
  Wref.ageYr = ageYr;
  Wref.season = season;
  Wref.seed = worldSeed;
  Wref._hydroDirty = true;
  hydroTick(Wref);
  hydroTick(Wref);
  geostrophicWind(Wref);
  if (rule.iceShell) applyIceShell(Wref, rule);
  Wref._landscape = ls?.id || rule.landscape || 'auto';
  Wref._landReport = landmassReport(Wref);
  captureBase(Wref, { keepPaints: true });
  Wref._sculpted = !!Wref.layerStack?._hasPaint;
  const rep = Wref._landReport;
  chronLog(Wref.year, 'reroll', 0, 1,
    `Continents rerolled · ${rep.count} landmasses · ${(rep.landFrac * 100).toFixed(0)}% land`);
  return { ok: true, seed, landSeed: seed, report: rep };
}


/** Rewind-the-tape fork. Item 12 / D46. */
export function forkRun(label = 'fork') {
  const newSeed = forkWorldSeed(W.seed, label + W.ageYr);
  return {
    seed: newSeed,
    ageYr: W.ageYr,
    ruleId: W.rule.id,
    tick: W._tickIndex | 0,
    label,
    // Full Run object available via vr/sim/run.js captureRun / forkRunObject
  };
}

function packHeights(h) {
  const buf = new Int16Array(h.length);
  for (let i = 0; i < h.length; i++) {
    const v = Math.round(h[i] * 8000);
    buf[i] = v < -32767 ? -32767 : v > 32767 ? 32767 : v;
  }
  const u8 = new Uint8Array(buf.buffer);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  }
  return btoa(s);
}

function unpackHeights(b64, into) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const buf = new Int16Array(u8.buffer, u8.byteOffset, (u8.byteLength / 2) | 0);
  const n = Math.min(into.length, buf.length);
  for (let i = 0; i < n; i++) into[i] = buf[i] / 8000;
}

function packFloatField(arr) {
  const f = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  const u8 = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  }
  return btoa(s);
}

function unpackFloatField(b64, into) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const buf = new Float32Array(u8.buffer, u8.byteOffset, (u8.byteLength / 4) | 0);
  const n = Math.min(into.length, buf.length);
  into.set(buf.subarray(0, n));
}

/** Event-log save. Version 11 adds the drought accumulator — the only weather
 *  state with a memory longer than a tick. Version 10 adds orbital block.
 *  Version 9 adds unitsHash / provenanceHash for schema drift detection. */
export function serializeRun() {
  const land = W._landscape || W.rule?.landscape || 'auto';
  const landSeed = (W.landSeed ?? W.seed) >>> 0;
  return {
    version: 11,
    seed: W.seed,
    landSeed,
    landscape: land,
    worldId: encodeWorldId(landSeed, land),
    n: SIM_N,
    unitsHash: unitsSchemaHash(),
    fieldsHash: fieldsSchemaHash(),
    seaLevel: W.seaLevel,
    hB64: packHeights(W.h),
    subB64: packSubstrate(W.substrate),
    stack: packStack(W),
    layers: packLayerStack(W.layerStack),
    ruleId: W.rule.id,
    deepTime: !!W.rule.deepTime,
    ageYr: W.ageYr,
    rngState: W.rngState,
    worldName: W.worldName || null,
    gases: { ...W.gases },
    transitions: { ...W.transitions },
    events: W.chron.events.map((e) => ({ ...e })),
    interventions: (W.interventionLog || W.chron.events.filter((e) =>
      e.kind === 'impact' || e.kind === 'build' || e.kind === 'gaia' || e.kind === 'tool'
      || e.kind === 'god')),
    moments: { ...W.moments },
    treeSummary: treeSummary(W.tree),
    tree: packTree(W.tree),
    originCell: W.originCell ?? null,
    planetBiochem: W.planetBiochem || null,
    originDifficulty: W.originDifficulty ?? 1,
    clockFace: W.clockFace || 'years',
    seasonHold: W.seasonHold ?? null,
    livedRate: W.livedRate ?? 1,
    livedDayRate: W.livedDayRate ?? 1,
    orbital: packOrbital(W),
    buildB64: packFloatField(W.build),
    droughtB64: W.drought ? packFloatField(W.drought) : null,
    cities: (W.cities || []).map((c) => ({ ...c })),
    civPop: W.civPop ?? 0,
    builtFrac: W.builtFrac ?? 0,
    meanBuild: W.meanBuild ?? 0,
    entities: packEntities(),
    polities: packPolities(W),
    playerPolity: W.playerPolity ?? -1,
    doomsday: W.doomsday ?? 0,
    exchangesConsidered: W.exchangesConsidered | 0,
    exchangesLaunched: W.exchangesLaunched | 0,
    exchangesRetaliated: W.exchangesRetaliated | 0,
    exchangesDeclined: W.exchangesDeclined | 0,
    darkToll: W.darkToll ? { ...W.darkToll } : null,
    warCrimes: (W.warCrimes || []).slice(-48),
    attribution: W.attribution ? { ...W.attribution } : null,
    // Flights / hazards / arsenals round-trip (§385). Derived visual fields
    // (smoke, shockwave amplitudes) are re-simulated; mushrooms persist.
    flights: (W.flight || []).filter((f) => !f.dead).slice(0, 48).map((f) => ({
      kind: f.kind, from: f.from, to: f.to, at: f.at, speed: f.speed,
      payload: f.payload, yield: f.yield, path: f.path ? [...f.path] : [],
      ownerPolity: f.ownerPolity, targetPolity: f.targetPolity,
      phase: f.phase, plume: f.plume, mirv: f.mirv || 0,
    })),
    mushrooms: (W.mushrooms || []).slice(-24).map((m) => ({ ...m })),
    arsenals: (W.polities || []).map((p) => ({
      id: p.id, arsenal: p.arsenal | 0, fissile: p.fissile || 0, doctrine: p.doctrine,
    })),
    hazards: {
      radPeak: W.radPeak || 0,
      toxinCells: W.toxinCells | 0,
      radCells: (W._radCells || []).slice(0, 64),
    },
    dark: W.dark ? {
      tribunal: W.dark.tribunal,
      counterfactual: W.dark.counterfactual,
      benefited: W.dark.benefited,
      legacy: W.dark.legacy,
      archiveLoss: W.dark.archiveLoss | 0,
      namedDeaths: W.dark.namedDeaths | 0,
      uninhabitable: !!W.dark.uninhabitable,
      tickBudgetMs: W.dark.tickBudgetMs || 2,
      geomBudgetMs: W.dark.geomBudgetMs || 1.5,
      audioBudgetMs: W.dark.audioBudgetMs || 0.5,
      audioMuted: !!W.dark.audioMuted,
    } : null,
  };
}

export function downloadSave() {
  const data = JSON.stringify(serializeRun(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `orrery-save-${W.rule.id}-${W.seed}.json`;
  a.click();
}

/** Replay from seed + rule (+ optional deepTime). Heightfield restored when present. */
export function loadRunMeta(json) {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch (e) {
    // I22 — corrupt / truncated payload must not touch world state.
    throw new Error(`Corrupt save — could not parse JSON (${e?.message || e}). World untouched.`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Corrupt save — expected a JSON object. World untouched.');
  }
  const ver = data.version ?? 0;
  // D21/D22 — read version; never half-load unknown futures.
  if (ver > 11) {
    throw new Error(`Save version ${ver} is newer than this build (supports ≤11). Update ORRERY or export a fresh save.`);
  }
  if (ver > 0 && ver < 7) {
    throw new Error(`Save version ${ver} is too old to migrate automatically. Re-generate from seed ${data.seed}.`);
  }
  if (data.n != null && data.n !== SIM_N) {
    // I8 / D25 — never half-load at the wrong resolution.
    throw new Error(
      `Save N=${data.n} does not match live N=${SIM_N}. ` +
        `Change resolution to ${data.n} first — will not load a mismatched grid.`,
    );
  }
  if (data.unitsHash && data.unitsHash !== unitsSchemaHash()) {
    console.warn(`[orrery] units schema mismatch: save ${data.unitsHash} vs live ${unitsSchemaHash()}`);
  }
  if (data.fieldsHash && data.fieldsHash !== fieldsSchemaHash()) {
    console.warn(`[orrery] fields schema mismatch: save ${data.fieldsHash} vs live ${fieldsSchemaHash()}`);
  }
  const base = RULESETS.find((r) => r.id === data.ruleId) || RULESETS[0];
  const landscape = data.landscape || 'auto';
  const rule = { ...base, deepTime: !!data.deepTime, landscape };
  const seed = (data.landSeed ?? data.seed) || 0;
  generate(seed, rule);
  if (data.layers && data.n === SIM_N) {
    unpackLayerStack(W, data.layers);
    if (data.seaLevel != null) W.seaLevel = data.seaLevel;
    W._hydroDirty = true;
    hydroTick(W);
    W._landReport = landmassReport(W);
  } else if (data.hB64 && data.n === SIM_N) {
    unpackHeights(data.hB64, W.h);
    if (data.seaLevel != null) W.seaLevel = data.seaLevel;
    initLayerStack(W, { name: landscape });
    W._hydroDirty = true;
    hydroTick(W);
    W._landReport = landmassReport(W);
  }
  if (data.subB64 && data.n === SIM_N && W.substrate) {
    unpackSubstrate(data.subB64, W.substrate);
  }
  if (data.stack && data.n === SIM_N) {
    unpackStack(W, data.stack);
  }
  if (data.worldName) W.worldName = data.worldName;
  W.landSeed = (data.landSeed ?? data.seed) || 0;
  W._landscape = landscape;
  if (data.tree) W.tree = unpackTree(data.tree);
  if (data.planetBiochem) W.planetBiochem = data.planetBiochem;
  if (data.originCell != null) W.originCell = data.originCell;
  if (data.originDifficulty != null) W.originDifficulty = data.originDifficulty;
  if (data.ageYr != null) {
    W.ageYr = data.ageYr;
    W.year = data.ageYr;
  }
  if (data.gases) Object.assign(W.gases, data.gases);
  if (data.rngState != null) W.rngState = data.rngState;
  if (data.buildB64 && data.n === SIM_N) unpackFloatField(data.buildB64, W.build);
  /* v10 and older have no drought block; `resetWeather` has already zeroed it,
     which is the right migration — an unrecorded drought never happened. */
  if (data.droughtB64 && data.n === SIM_N && W.drought) {
    unpackFloatField(data.droughtB64, W.drought);
  }
  if (data.cities) W.cities = data.cities.map((c) => ({ ...c }));
  if (data.civPop != null) W.civPop = data.civPop;
  if (data.builtFrac != null) W.builtFrac = data.builtFrac;
  if (data.meanBuild != null) W.meanBuild = data.meanBuild;
  if (data.entities?.list?.length) restoreEntities(data.entities);
  if (data.polities) unpackPolities(W, data.polities);
  if (data.playerPolity != null) W.playerPolity = data.playerPolity;
  if (data.doomsday != null) W.doomsday = data.doomsday;
  if (data.exchangesConsidered != null) W.exchangesConsidered = data.exchangesConsidered;
  if (data.exchangesLaunched != null) W.exchangesLaunched = data.exchangesLaunched;
  if (data.exchangesRetaliated != null) W.exchangesRetaliated = data.exchangesRetaliated;
  if (data.exchangesDeclined != null) W.exchangesDeclined = data.exchangesDeclined;
  if (data.darkToll) W.darkToll = { ...data.darkToll };
  if (data.warCrimes) W.warCrimes = data.warCrimes.map((x) => ({ ...x }));
  if (data.attribution) W.attribution = { ...data.attribution };
  if (data.flights?.length) {
    W.flight = data.flights.map((f) => ({ ...f, dead: false, path: f.path ? [...f.path] : [] }));
    W.inFlight = W.flight.length;
  }
  if (data.mushrooms) W.mushrooms = data.mushrooms.map((m) => ({ ...m }));
  if (data.arsenals?.length && W.polities?.length) {
    for (const a of data.arsenals) {
      const p = W._polityIndex?.get(a.id);
      if (p) {
        p.arsenal = a.arsenal | 0;
        p.fissile = a.fissile || 0;
        if (a.doctrine) p.doctrine = a.doctrine;
      }
    }
  }
  if (data.dark) {
    W.dark = W.dark || {};
    Object.assign(W.dark, data.dark);
  }
  if (data.clockFace) setClockFace(W, data.clockFace, { force: true });
  if (data.livedRate != null) W.livedRate = data.livedRate;
  if (data.livedDayRate != null) W.livedDayRate = data.livedDayRate;
  if (data.seasonHold != null) {
    W.seasonHold = data.seasonHold;
    if ((W.clockFace || 'years') !== 'now') W.season = data.seasonHold;
  }
  if (data.orbital) {
    unpackOrbital(W, data.orbital);
    skyTick(W);
  } else if (ver < 10) {
    migrateOrbitalFromRuleset(W, rule);
    skyTick(W);
  }
  return data;
}

export { RULESETS, LIFE_CLASSES, seedLife, chronLog, formatAge, treeSummary };
export { setWeatherSpeed, weatherClockState } from './sim/weatherClock.js';
