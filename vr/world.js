/** World state: fields, generation, coupled tick. */

import { clamp } from './math.js';
import { NC, AREA, DIR, NBR, setResolution, N as SIM_N } from './sphere.js';
import { RULESETS } from './rulesets.js';
import { createChronicle, logEvent, maybeNameEra } from './chronicle.js';
import { generateTectonics, tectonicsTick, erosionTick } from './sim/tectonics.js';
import { planetGeoTick } from './sim/planetTick.js';
import { hydroTick, tsunamiTick, liquidWaterOk, startTsunami, primeDrainage } from './sim/hydro.js';
import { atmoTick, atmoMetaTick } from './sim/atmo.js';
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
import { createCarbonState, carbonTick, UNIT_MAP } from './sim/carbon.js';
import { initRedox, redoxTick, seedModernGuilds, initSpeciesFields } from './sim/redox.js';
import { initEvolution, evolveTick, forkWorldSeed, treeSummary, packTree, unpackTree, seedHoloceneTree } from './sim/evolve.js';
import { deriveLifeClass, unlockedClassFromPool } from './sim/lifeclass.js';
import { ecologyTick } from './sim/ecology.js';
import { extinctionTick, noteImpact } from './sim/extinction.js';
import { alienTick } from './sim/alien.js';
import { multiRateMask } from './sim/meta.js';
import { initGod, godTick } from './sim/god/index.js';
import { attachWorldRng } from './sim/rng.js';
import { assertBudgets } from './sim/assert.js';
import { initOcean, oceanTick } from './sim/ocean.js';
import { geostrophicWind } from './sim/wind.js';
import { giantTick } from './sim/jets.js';
import { skyFromStarAtmosphere } from './sim/scatter.js';
import { applyIceShell, iceShellTick } from './sim/iceshell.js';
import { initTides, tidesTick } from './sim/tides.js';
import { initStorms, stormsTick } from './sim/storms.js';
import { applyInterior, interiorTick } from './sim/core.js';
import { initMantle, mantleTick } from './sim/mantle.js';
import { gpgpuClimateTick } from './sim/gpgpu/index.js';
import { isModernEarth, isDeepTimeEarth, cloneRuleForRun } from './sim/ruleMode.js';
import { applySeasonPolicy, initClockFace, shouldHoldCalendar } from './sim/clockFace.js';
import { applyEpochAtGenerate } from './sim/epoch.js';
import { seedTechnosphere, technoTick } from './sim/techno.js';
import { agentsTick, resetEntities, packEntities, restoreEntities } from './agents.js';
import { fireTick, resetFireState } from './sim/fire.js';

function buf() { return new Float32Array(NC); }
function ibuf() { return new Int32Array(NC); }
function u8() { return new Uint8Array(NC); }

/** Reallocate all NC-sized fields after setResolution. */
export function reallocateWorldFields(target = W) {
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
  ];
  for (const k of keys) target[k] = buf();
  target.rock = u8();
  target.substrate = u8();
  target.landform = u8();
  target.lifeClass = u8();
  target.biome = u8();
  target.biome2 = u8();
  target.plateId = ibuf();
  target.popId = ibuf();
  target.drainTo = ibuf();
  target.drainTo2 = ibuf();
  target.storms = [];
  target._fireCells = [];
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
  const r = setResolution(n);
  reallocateWorldFields(W);
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
    build: buf(), fire: buf(), nutrientPlume: buf(),
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

export const W = createWorld();

function chronLog(year, kind, cell, mag, label, meta) {
  logEvent(W.chron, year, kind, cell, mag, label, meta);
}

function attachRng(seed) {
  attachWorldRng(W, seed);
}

function bootPhase(label, detail = '') {
  if (typeof W._bootPhase === 'function') W._bootPhase(label, detail);
}

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
  W.carcasses = [];
  W.carcassCount = 0;

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
  // Earth-like worlds keep a Luna; Selene / airless may not
  if (rule.earthLike && !rule.airless) {
    W.moon = { mass: 1, distance: 1, formed: 4.51e9 };
    W.obliquityWander = false;
  } else if (rule.id === 'selene' || rule.airless) {
    W.moon = null;
  } else {
    W.moon = W.moon || { mass: 0.6, distance: 1.2, formed: W.ageYr };
  }
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
  resetFireState(W);
  W.plates = null;
  W.hotspots = null;
  W.volcanoes = [];
  W.ash.fill(0); W.dust.fill(0); W.sediment.fill(0);
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
  W.carcasses = [];
  W.carcassCount = 0;
  W.huntMisses = 0;
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

  if (!W.noSurface) generateTectonics(W, seed, rule);
  else {
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

  for (let c = 0; c < NC; c++) {
    const lat = Math.abs(DIR[c * 3 + 1]);
    W.temp[c] = clamp(W.solar * (0.42 + 0.55 * (1 - lat)) + 0.08, 0.15, 1.2);
    W.moist[c] = W.noSurface ? 0 : (W.h[c] < W.seaLevel ? 1 : 0.25);
    W.nutrientN[c] = 0.4; W.nutrientP[c] = 0.35;
  }
  if (rule.earthLike) seedPolarIce(W, rule);
  else if (!W.noSurface) {
    for (let c = 0; c < NC; c++) {
      if (W.temp[c] < rule.freeze + 0.08) {
        W.iceLand[c] = W.h[c] >= W.seaLevel ? 0.6 : 0;
        W.iceSea[c] = W.h[c] < W.seaLevel ? 0.7 : 0;
        W.ice[c] = Math.max(W.iceLand[c], W.iceSea[c]);
      }
    }
  }
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
        atmoTick(W, _sunDir);
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
  } else if (!rule.airless && !W.noSurface) {
    // Sparse nuclei — or wait for abiogenesis in deep time
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
}

let _sunDir = [1, 0.3, 0];

export function setSunDir(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  _sunDir = [x / l, y / l, z / l];
  W._sunDir = _sunDir;
}

export function simTick(silent = false) {
  W.prevTemp.set(W.temp);
  W.prevLife.set(W.life);
  W.prevIce.set(W.ice);

  const log = silent ? null : chronLog;
  const rule = W.rule;
  const rate = multiRateMask(W);

  if (!rule.daisyworld) {
    if (!shouldHoldCalendar(W, rule)) advanceClock(W, rule);
    if (!silent) hadeanTick(W, log);
  } else {
    W.dtYr = 10;
    W.year += 10;
    W.ageYr = W.year;
  }

  applySeasonPolicy(W, rule);

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
  giantTick(W, log);
  const gpu = gpgpuClimateTick(W);
  if (!gpu) atmoTick(W, _sunDir);
  else atmoMetaTick(W);
  hydroTick(W);
  tsunamiTick(W);
  if (!rule.airless && !W.noSurface) {
    oceanTick(W);
    tidesTick(W);
    stormsTick(W, log);
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
    alienTick(W, log);
    if (rate.bio) {
      ecologyTick(W, log);
      redoxTick(W, log);
      bioTick(W, log);
    }
    if (rate.carbon) carbonTick(W, log);
    if (rate.phylogeny) {
      evolveTick(W, log);
      extinctionTick(W, log);
    }
  }
  technoTick(W, log);
  gaiaTick(W, log);
  godTick(W, log);
  /* Beings are part of the world, not part of the view. `agentsTick` used to be
     called from the render loop in `main.js`, which put every individual, every
     settlement and every behaviour outside `runHeadless`, outside the save and
     outside the tests — and made the number of behaviour steps per simulated
     year a function of frame rate. It runs here now, after ecology so beings
     read this tick's life field, and it is skipped during generate's climate
     spin-up where there is no biosphere to walk yet. */
  if (!W._spinup && !rule.daisyworld && !W.noSurface) {
    fireTick(W, log);
    agentsTick(log);
  }
  absorbSimDelta(W);

  // Conservation check every ~32 ticks (cheap enough, catches silent drift)
  if ((W.year | 0) % 32 === 0) assertBudgets(W);

  if (!silent) {
    maybeNameEra(W.chron, W);
    if (W._ensoEvent) {
      chronLog(W.year, 'climate', 0, W._ensoIndex || 0, W._ensoEvent);
      W._ensoEvent = null;
    }
    if (W._springEvent) {
      chronLog(W.year, 'tide', 0, W.meanTideRange || 0, 'Spring tides');
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

export function applyImpact(cell, power, log = chronLog) {
  const r = Math.max(1, power * 4);
  for (let c = 0; c < NC; c++) {
    const d = Math.acos(clamp(
      DIR[c * 3] * DIR[cell * 3] + DIR[c * 3 + 1] * DIR[cell * 3 + 1] + DIR[c * 3 + 2] * DIR[cell * 3 + 2],
      -1, 1
    ));
    if (d < r * 0.05) {
      const f = 1 - d / (r * 0.05);
      W.h[c] -= power * 0.12 * f;
      W.temp[c] = Math.min(1.5, W.temp[c] + power * 0.3 * f);
      W.life[c] *= 1 - 0.8 * f;
      W.dust[c] = Math.min(1, W.dust[c] + power * 0.4 * f);
    }
  }
  W.gases.dust = Math.min(0.5, W.gases.dust + power * 0.05);
  W.gases.CO2 = Math.min(0.5, W.gases.CO2 + power * 0.01);
  if (W.carbon) W.carbon.atmosphere += power * 1.5;
  if (liquidWaterOk(W)) startTsunami(W, cell, power);
  noteImpact(W, power);
  if (log) log(W.year, 'impact', cell, power, `Impact (E=${power.toFixed(2)})`);
}

/** Rewind-the-tape fork. Item 12. */
export function forkRun(label = 'fork') {
  const newSeed = forkWorldSeed(W.seed, label + W.ageYr);
  return { seed: newSeed, ageYr: W.ageYr, ruleId: W.rule.id };
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

/** Event-log save. Version 8 adds build, settlements and the living population. */
export function serializeRun() {
  const land = W._landscape || W.rule?.landscape || 'auto';
  const landSeed = (W.landSeed ?? W.seed) >>> 0;
  return {
    version: 8,
    seed: W.seed,
    landSeed,
    landscape: land,
    worldId: encodeWorldId(landSeed, land),
    n: SIM_N,
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
    buildB64: packFloatField(W.build),
    cities: (W.cities || []).map((c) => ({ ...c })),
    civPop: W.civPop ?? 0,
    builtFrac: W.builtFrac ?? 0,
    meanBuild: W.meanBuild ?? 0,
    entities: packEntities(),
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
  const data = typeof json === 'string' ? JSON.parse(json) : json;
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
  if (data.cities) W.cities = data.cities.map((c) => ({ ...c }));
  if (data.civPop != null) W.civPop = data.civPop;
  if (data.builtFrac != null) W.builtFrac = data.builtFrac;
  if (data.meanBuild != null) W.meanBuild = data.meanBuild;
  if (data.entities?.list?.length) restoreEntities(data.entities);
  if (data.clockFace) W.clockFace = data.clockFace;
  if (data.seasonHold != null) {
    W.seasonHold = data.seasonHold;
    W.season = data.seasonHold;
  }
  return data;
}

export { RULESETS, LIFE_CLASSES, seedLife, chronLog, formatAge, treeSummary, UNIT_MAP };
