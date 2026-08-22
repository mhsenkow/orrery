/** Origin as a rate, not a coin flip. Prebiotic inventory, vents as objects.
 *  Life backlog: originrate, protocell, originsite, ventfield, Eigen, RNA duration. */

import { clamp } from '../math.js';
import { NC, AREA } from '../sphere.js';
import { maybeCaptureMoment } from './time.js';
import { isModernEarth, isDeepTimeEarth } from './ruleMode.js';
import { rngOf, forkRng } from './rng.js';
import { BIOCHEM } from './lifeGrammar.js';

const SOLVENT_BY_ID = Object.fromEntries((BIOCHEM.solvents || []).map((s) => [s.id, s]));

/** ~10 kb is the unproofread RNA ceiling (Eigen). provenance: measured */
export const EIGEN_GENOME_KB = 10;
/** Per-base error without proofreading. provenance: measured-order */
export const RNA_MU = 0.05;

export function eigenCoherent(mu = RNA_MU, lengthKb = EIGEN_GENOME_KB) {
  return mu * lengthKb < 1;
}

export function solventOf(rule) {
  if (rule?.methaneSolvent) return SOLVENT_BY_ID.methane;
  if (rule?.iceShell) return SOLVENT_BY_ID.brine;
  if (rule?.aerialBio || /venus/i.test(rule?.name || '')) return SOLVENT_BY_ID.sulfuricAcid;
  if (rule?.tSurfK && rule.tSurfK < 200 && !rule.iceShell) return SOLVENT_BY_ID.ammonia;
  return SOLVENT_BY_ID.water;
}

export function biochemForWorld(rule, rng) {
  if (rule?.forcedSolvent || rule?.forcedChirality) {
    const sol = rule.forcedSolvent || solventOf(rule)?.id || 'water';
    const base = biochemForWorld({
      ...rule,
      forcedSolvent: null,
      forcedChirality: null,
      methaneSolvent: sol === 'methane',
      iceShell: sol === 'brine' || !!rule.iceShell,
      tSurfK: sol === 'ammonia' ? (rule.tSurfK ?? 220) : rule.tSurfK,
    }, rng);
    if (rule.forcedSolvent) base.solvent = rule.forcedSolvent;
    if (rule.forcedChirality) base.chirality = rule.forcedChirality;
    return base;
  }
  const sol = solventOf(rule);
  const id = sol?.id || 'water';
  const roll = rng ? rng() : 0.31;
  if (id === 'methane') {
    return { solvent: 'methane', polymer: 'polyether', carrier: 'thioester', chirality: roll < 0.5 ? 'L' : 'D', membrane: 'azotosome' };
  }
  if (id === 'brine') {
    return { solvent: 'brine', polymer: 'rna', carrier: 'protonGradient', chirality: roll < 0.5 ? 'L' : 'D', membrane: 'mineralCompartment' };
  }
  if (id === 'sulfuricAcid') {
    return { solvent: 'sulfuricAcid', polymer: 'pna', carrier: 'thioester', chirality: 'racemic', membrane: 'isoprenoidEther' };
  }
  if (id === 'ammonia') {
    return { solvent: 'ammonia', polymer: 'pna', carrier: 'thioester', chirality: roll < 0.5 ? 'L' : 'D', membrane: 'isoprenoidEther' };
  }
  return { solvent: 'water', polymer: 'rna', carrier: 'protonGradient', chirality: roll < 0.5 ? 'L' : 'D', membrane: 'mineralCompartment' };
}

/** Dielectric < ~10 cannot dissolve an ionic backbone. provenance: measured */
export function biochemAllowed(biochem) {
  const sol = SOLVENT_BY_ID[biochem?.solvent] || SOLVENT_BY_ID.water;
  const eps = sol.dielectric ?? 80;
  const why = [];
  if (eps < 10 && (biochem.polymer === 'rna' || biochem.polymer === 'dna')) {
    why.push(`dielectric ${eps} cannot dissolve a phosphate backbone`);
  }
  if (eps < 10 && biochem.membrane === 'phospholipid') {
    why.push(`dielectric ${eps} cannot assemble a lipid bilayer`);
  }
  if (biochem.polymer === 'rna' && biochem.solvent === 'sulfuricAcid') {
    why.push('RNA hydrolyses in concentrated acid');
  }
  return { ok: why.length === 0, why, dielectric: eps, solvent: sol };
}

/**
 * Compressed Arrhenius so Titan is slow rather than frozen.
 * Honest ratio is logged; the sim uses /8 on the exponent (fitted for playability).
 */
export function bioRateScale(TK, solvent) {
  const T = Math.max(40, TK || 288);
  const Tref = solvent ? (solvent.meltK + solvent.boilK) * 0.5 : 288;
  // provenance: fitted — real peptide Ea is ~50–80 kJ/mol and would stall the clock
  const Ea_k = 25 / 0.008314;
  const ln = -Ea_k * (1 / T - 1 / Tref);
  return clamp(Math.exp(ln / 8), 1e-3, 6);
}

export function tempKOf(W, c) {
  const R = W.rule || {};
  if (R.tSurfK != null) {
    return R.tSurfK + ((W.temp[c] ?? 0.5) - 0.5) * 80;
  }
  return 288 + ((W.temp[c] ?? 0.5) - 0.5) * 160;
}

export function initOrigin(W) {
  if (!W.protoOrg || W.protoOrg.length !== NC) W.protoOrg = new Float32Array(NC);
  W.vents = W.vents || [];
  W.originCell = W.originCell ?? null;
  W.originDifficulty = W.rule?.originDifficulty ?? 1;
  W.originBudget = W.originBudget || { produced: 0, respired: 0, buried: 0, clamped: 0 };
  W.rnaKb = W.rnaKb ?? 0;
  W.shadowBiosphere = W.shadowBiosphere || null;
  W.solvent = solventOf(W.rule);
  W.planetBiochem = W.planetBiochem || biochemForWorld(W.rule, forkRng(W.seed || 1, 'originChem'));
  if (!W.vents.length) seedVents(W);
}

export function seedVents(W) {
  // Own stream — must not steal from rngGeo (tectonics) or rngBio (modern biosphere).
  const rng = forkRng((W.seed || 1) ^ ((W.vents?.length || 0) * 0x9e3779b1), 'vents');
  const vents = [];
  for (let c = 0; c < NC; c++) {
    const sea = W.h[c] < W.seaLevel;
    const ridge = W.bound[c] === 0;
    const hydro = (W.hydrotherm?.[c] || 0) > 0.15;
    const shell = (W.shellVent?.[c] || 0) > 0.2;
    if (!((ridge && sea) || hydro || shell)) continue;
    if (W._hpIceFloor && !shell) continue;
    if (rng() > 0.35 && !shell) continue;
    vents.push({
      cell: c,
      // provenance: fitted — black-smoker ~350 °C mapped into 0–1 temp
      temp: clamp(0.55 + rng() * 0.4, 0.4, 1),
      H2: 0.4 + rng() * 0.4,
      H2S: 0.3 + rng() * 0.4,
      Fe2: 0.2 + rng() * 0.3,
      born: W.ageYr || 0,
      // tens of kyr to a few Myr; deep-time ticks are Myr so this is 2–20 ticks
      lifeYr: (2e4 + rng() * 8e4) * (isDeepTimeEarth(W.rule) ? 400 : 1),
      alive: true,
    });
  }
  W.vents = vents;
}

function ventAt(W, c) {
  if (!W.vents?.length) return null;
  for (const v of W.vents) if (v.alive && v.cell === c) return v;
  return null;
}

/** Disequilibrium × catalytic surface × liquid window, per cell. */
export function originRateAt(W, c) {
  const sea = W.h[c] < W.seaLevel;
  const t = W.temp[c];
  const ice = W.ice[c] || 0;
  const sol = W.solvent || solventOf(W.rule);
  const TK = tempKOf(W, c);
  const liquid = sol
    ? TK > sol.meltK - 15 && TK < sol.boilK + 20
    : t > 0.28 && t < 0.95;
  if (!liquid || ice > 0.85) return { rate: 0, why: ice > 0.85 ? 'frozen' : 'outside liquid window' };
  if (W._hpIceFloor && !(W.shellVent?.[c] > 0.2)) {
    return { rate: 0, why: 'high-pressure ice floor — no rock contact' };
  }

  const sp = W.species;
  const reduced = sp
    ? (sp.H2?.[c] || 0) + (sp.H2S?.[c] || 0) + (sp.Fe2?.[c] || 0) + (sp.CO2?.[c] || 0) * 0.3
    : 0.2;
  const phosphate = W.nutrientP?.[c] || 0.3;
  const vent = ventAt(W, c);
  const catalytic = vent ? 1.4 : ((W.bound[c] === 0 && sea) ? 0.8 : (W.ore?.[c] || 0) * 0.4);
  const pHgrad = vent ? 1 : (sea ? 0.25 : 0.05);
  const concentrate = tidePoolFactor(W, c);
  const rateScale = bioRateScale(TK, sol);
  const prior = 1 / Math.max(0.15, W.originDifficulty || 1);
  const rate = reduced * catalytic * pHgrad * phosphate * concentrate * rateScale * prior;
  let why = 'ok';
  if (reduced < 0.08) why = 'disequilibrium too small';
  else if (catalytic < 0.15) why = 'no catalytic surface';
  else if (phosphate < 0.08) why = 'phosphate scarce';
  else if (rateScale < 0.05) why = 'too cold for chemistry';
  return { rate, why, reduced, catalytic, phosphate, rateScale, vent: !!vent };
}

function tidePoolFactor(W, c) {
  const inter = W.intertidal?.[c] || 0;
  const tide = W.tideRange?.[c] || 0;
  const ice = W.ice[c] || 0;
  // thermophoresis in a pore / evaporating pool / freezing eutectic
  return 1 + inter * 4 + tide * 12 + (ice > 0.2 && ice < 0.7 ? 2 : 0);
}

export function originTick(W, chronLog) {
  if (W.rule?.daisyworld || W.rule?.airless) return;
  // B48 — sterile worlds never originate unless Life tools already flipped abiogenesis.
  if (W.rule?.sterile && !W.transitions?.abiogenesis) return;
  initOrigin(W);
  const T = W.transitions;
  if (!T) return;
  // Modern Earth is already inhabited; do not consume bio/geo RNG or run RNA duration.
  if (isModernEarth(W.rule)) {
    T.abiogenesis = true;
    T.rnaWorld = true;
    T.luca = true;
    T.dnaWorld = true;
    W.originCell = W.originCell ?? 0;
    return;
  }
  const rng = rngOf(W, 'rngBio');
  const dt = Math.min(2, (W.dtYr || 200) / 1e6);

  tickVents(W, dt);
  accumulateProto(W, dt);

  if (!T.abiogenesis) {
    maybeOriginate(W, chronLog, rng, dt);
    return;
  }

  // RNA world is a duration, not a simultaneous flag with LUCA.
  if (T.rnaWorld && !T.dnaWorld) {
    W.rnaKb = (W.rnaKb || 0.4) + 0.8 * dt * (1 + (W.meanLife || 0));
    if (!eigenCoherent(RNA_MU, W.rnaKb)) {
      // error threshold: either invent proofreading (DNA) or crash back
      if (rng() < 0.4 * dt || W.rnaKb > EIGEN_GENOME_KB * 1.4) {
        T.dnaWorld = true;
        T.rnaWorld = false;
        if (W.planetBiochem) W.planetBiochem.polymer = 'dna';
        if (chronLog) chronLog(W.year, 'evolution', W.originCell || 0, 1, 'DNA / proofreading — past Eigen\'s limit');
      }
    } else if (W.rnaKb > 4 && rng() < 0.08 * dt) {
      T.luca = true;
    }
  }
}

function tickVents(W, dt) {
  if (!W.vents?.length) return;
  const yr = W.dtYr || 200;
  for (const v of W.vents) {
    if (!v.alive) continue;
    if ((W.ageYr - v.born) > v.lifeYr) {
      v.alive = false;
      continue;
    }
    const c = v.cell;
    if (!W.species) continue;
    if (W.species.H2) W.species.H2[c] = clamp((W.species.H2[c] || 0) + v.H2 * 0.04 * dt, 0, 1);
    if (W.species.H2S) W.species.H2S[c] = clamp((W.species.H2S[c] || 0) + v.H2S * 0.03 * dt, 0, 1);
    if (W.species.Fe2) W.species.Fe2[c] = clamp((W.species.Fe2[c] || 0) + v.Fe2 * 0.03 * dt, 0, 1);
    if (W.hydrotherm) W.hydrotherm[c] = Math.max(W.hydrotherm[c], 0.35);
  }
  // replenish a few vents so the field does not go extinct in deep time
  let alive = 0;
  for (const v of W.vents) if (v.alive) alive++;
  if (alive < 4 && (W._tickIndex || 0) % 8 === 0) seedVents(W);
  void yr;
}

function accumulateProto(W, dt) {
  const proto = W.protoOrg;
  for (let c = 0; c < NC; c++) {
    const { rate } = originRateAt(W, c);
    const inflow = rate * 0.08 * dt;
    proto[c] = clamp(proto[c] * (1 - 0.04 * dt) + inflow, 0, 1);
  }
}

function maybeOriginate(W, chronLog, rng, dt) {
  const T = W.transitions;
  let bestC = 0, bestRate = 0, sum = 0;
  const terms = { disequilibrium: 0, surface: 0, phosphate: 0, cold: 0, n: 0 };
  for (let c = 0; c < NC; c++) {
    const r = originRateAt(W, c);
    const p = (W.protoOrg[c] || 0);
    const local = r.rate * (0.3 + p);
    sum += local * AREA[c];
    if (local > bestRate) { bestRate = local; bestC = c; }
    terms.n++;
    if (r.why === 'disequilibrium too small') terms.disequilibrium++;
    else if (r.why === 'no catalytic surface') terms.surface++;
    else if (r.why === 'phosphate scarce') terms.phosphate++;
    else if (r.why === 'too cold for chemistry') terms.cold++;
  }
  W.originReport = {
    meanRate: sum / NC,
    bestCell: bestC,
    bestRate,
    terms,
  };
  // provenance: fitted — Earth-like worlds originate inside 3.8–4.2 Ga on most seeds
  const p = clamp(sum * 0.00012 * dt, 0, 0.35);
  if (rng() < p && bestRate > 0.02) {
    fireOrigin(W, bestC, chronLog, rng);
    return;
  }
  // second, independent origin as a shadow — rare
  if (T.abiogenesis && rng() < p * 0.08) {
    const other = (bestC + (NC >> 1)) % NC;
    W.shadowBiosphere = {
      cell: other,
      chirality: W.planetBiochem?.chirality === 'L' ? 'D' : 'L',
      lost: false,
    };
    if (chronLog) chronLog(W.year, 'origin', other, 0.4, 'Second origin — shadow biosphere');
  }
}

function fireOrigin(W, cell, chronLog, rng) {
  const T = W.transitions;
  T.abiogenesis = true;
  T.rnaWorld = true;
  T.luca = false; // inferred later; LUCA is planted only after a duration
  W.originCell = cell;
  W.rnaKb = 0.5;
  W.planetBiochem = W.planetBiochem || biochemForWorld(W.rule, rng);
  const check = biochemAllowed(W.planetBiochem);
  if (!check.ok && W.planetBiochem.solvent === 'methane') {
    W.planetBiochem.polymer = 'polyether';
    W.planetBiochem.membrane = 'azotosome';
  }
  seedFirstCells(W, cell);
  if (chronLog) {
    const chem = W.planetBiochem;
    chronLog(W.year, 'origin', cell, 1,
      `Abiogenesis at cell ${cell} · ${chem.solvent} / ${chem.polymer} / ${chem.chirality}`,
      { cell, biochem: { ...chem } });
  }
  maybeCaptureMoment(W, 'firstCell', 'First cell');
  // LUCA follows once the replicator holds; plant a root so the tree can start.
  T.luca = true;
}

function seedFirstCells(W, originCell) {
  if (!W.guildDens) return;
  const around = new Set([originCell]);
  for (const v of W.vents || []) if (v.alive) around.add(v.cell);
  for (let c = 0; c < NC; c++) {
    if (W.bound[c] === 0 && W.h[c] < W.seaLevel) around.add(c);
  }
  for (const c of around) {
    if (W.guildDens.chemolithotroph) W.guildDens.chemolithotroph[c] = Math.max(W.guildDens.chemolithotroph[c], 0.45);
    if (W.guildDens.methanogen) W.guildDens.methanogen[c] = Math.max(W.guildDens.methanogen[c], 0.28);
    if (W.guildDens.fermenter) W.guildDens.fermenter[c] = Math.max(W.guildDens.fermenter[c], 0.32);
    W.life[c] = Math.max(W.life[c], 0.28);
  }
  // Anoxygenic photosynthesis needs a lit-shelf seed or it never reaches the oxygenic gate.
  for (let c = 0; c < NC; c++) {
    if (W.h[c] >= W.seaLevel) continue;
    const depth = W.seaLevel - W.h[c];
    if (depth > 0.12) continue;
    const lit = W.species?.light?.[c] ?? W.temp[c];
    if (lit < 0.45) continue;
    if (W.guildDens.purpleSulfur) W.guildDens.purpleSulfur[c] = Math.max(W.guildDens.purpleSulfur[c], 0.12);
    if (W.guildDens.greenSulfur) W.guildDens.greenSulfur[c] = Math.max(W.guildDens.greenSulfur[c], 0.08);
    if (W.guildDens.photoferrotroph) W.guildDens.photoferrotroph[c] = Math.max(W.guildDens.photoferrotroph[c], 0.06);
    W.life[c] = Math.max(W.life[c], 0.1);
  }
}

/** Late heavy bombardment / magma ocean / snowball can undo an origin. */
export function steriliseOrigin(W, reason, chronLog) {
  const T = W.transitions;
  if (!T?.abiogenesis) return false;
  if (isModernEarth(W.rule)) return false;
  T.abiogenesis = false;
  T.rnaWorld = false;
  T.luca = false;
  T.dnaWorld = false;
  T.oxygenicPhotosynthesis = false;
  W.originCell = null;
  W.rnaKb = 0;
  if (W.protoOrg) W.protoOrg.fill(0);
  if (W.guildDens) {
    for (const arr of Object.values(W.guildDens)) arr.fill(0);
  }
  if (W.life) W.life.fill(0);
  if (W.tree) {
    W.tree.living.length = 0;
    W.tree.livingSet?.clear();
  }
  if (W.popId) W.popId.fill(0);
  if (chronLog) chronLog(W.year, 'origin', 0, 0, `Origin reset: ${reason}`);
  return true;
}

export function diagnoseOriginFailure(W) {
  if (W.meanLife > 0.02 || W.transitions?.abiogenesis) return null;
  const rep = W.originReport;
  if (!rep) return W.sterileWhy || 'no origin yet';
  const t = rep.terms || {};
  const n = Math.max(1, t.n || 1);
  const rows = [
    ['disequilibrium', t.disequilibrium / n],
    ['catalytic surface', t.surface / n],
    ['phosphate', t.phosphate / n],
    ['temperature', t.cold / n],
  ].sort((a, b) => b[1] - a[1]);
  const [name, frac] = rows[0];
  const factor = Math.max(1, 1 / Math.max(1e-6, rep.meanRate));
  return `${name} too small (${(frac * 100) | 0}% of cells) · rate short by ×${factor.toFixed(0)}`;
}
