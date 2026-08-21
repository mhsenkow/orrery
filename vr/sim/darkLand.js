/** Land war — supply lines, encirclement, forts, scorched earth (dark-400 I §161–180). */

import { NC, NBR } from '../sphere.js';
import { rngOf } from './rng.js';
import { igniteFire } from './fire.js';
import { noteCasualty, noteFought } from './dark.js';
import { amphibiousInvade, isOceanCell, isLandCell } from './darkNaval.js';
import { noteWear } from './present.js';

export function resetLand(W) {
  W.fort = W.fort?.length === NC ? W.fort : new Float32Array(NC);
  W.fort.fill(0);
  if (!W.frontDir || W.frontDir.length !== NC) W.frontDir = new Float32Array(NC);
  else W.frontDir.fill(0);
  W.dark = W.dark || {};
  W.dark.supplyCut = 0;
  W.dark.frontLen = 0;
  W.dark.garrisonCost = 0;
  W.dark.sieges = 0;
  W.dark.warEconomy = 0;
  W.dark.conscripted = 0;
  W._supplyStall = W._supplyStall || new Map();
  W._occupied = W._occupied || new Map();
}

/** BFS along owner cells from capital — returns reachable set. */
export function supplyReachable(W, polityId) {
  const p = W._polityIndex?.get(polityId);
  if (!p || p.capital < 0 || !W.owner) return new Set();
  const own = W.owner;
  const seen = new Set();
  const q = [p.capital | 0];
  seen.add(p.capital | 0);
  while (q.length) {
    const c = q.pop();
    for (let k = 0; k < 4; k++) {
      const n = NBR[c * 4 + k];
      if (seen.has(n)) continue;
      if (own[n] !== polityId) continue;
      // Partisan cuts: cells flagged as cut don't pass supply (§168).
      if (W._partisanCut?.has(n)) continue;
      seen.add(n);
      q.push(n);
    }
  }
  return seen;
}

/** Cell is supplied if it can reach capital along owner cells (§161). */
export function cellSupplied(W, cell, polityId, reach = null) {
  const r = reach || supplyReachable(W, polityId);
  return r.has(cell | 0);
}

function nearestCityName(W, cell) {
  let best = null, bestD = 1e9;
  for (const city of W.cities || []) {
    const d = Math.abs((city.cell | 0) - (cell | 0));
    if (d < bestD) { bestD = d; best = city; }
  }
  return best?.name || 'the frontier';
}

/** Mountain / marsh terrain slows advance (§163). */
function terrainSlow(W, cell) {
  const sea = W.seaLevel ?? 0.5;
  const h = W.h?.[cell] ?? sea;
  const relief = h - sea;
  let slow = 1;
  if (relief > 0.12) slow *= 0.35; // mountains
  else if (relief > 0.07) slow *= 0.55;
  if ((W.moist?.[cell] || 0) > 0.7 && relief < 0.05) slow *= 0.4; // marsh
  return slow;
}

/**
 * Conscription stub — drain young ENT ages into W.dark.pyramids (§172).
 * Age bands: youth (<40), adult (40–120), elder (>120) ticks of life age.
 */
function conscriptionTick(W) {
  const wars = W.diplo?.wars || [];
  W.dark = W.dark || {};
  if (!wars.length) {
    W.dark.conscripted = 0;
    return;
  }
  const atWar = new Set();
  for (const w of wars) { atWar.add(w.a); atWar.add(w.b); }
  const ent = W._ent;
  let taken = 0;
  if (ent?.meta) {
    for (let i = 0; i < ent.n; i++) {
      const m = ent.meta[i];
      if (!m || m.dead || m.kind !== 5) continue; // kind 5 ≈ human/settler
      const owner = W.owner?.[m.cell];
      if (!atWar.has(owner)) continue;
      if ((m.age | 0) < 80 && !m._conscripted) {
        m._conscripted = true;
        m.age = Math.min(200, (m.age | 0) + 30); // aging / removed from youth cohort
        taken++;
      }
    }
  }
  W.dark.conscripted = (W.dark.conscripted | 0) + taken;
  // Population pyramid stub per polity (§197 / §172).
  const pyramids = {};
  for (const p of W.polities || []) {
    pyramids[p.id] = { youth: 0.33, adult: 0.5, elder: 0.17, war: atWar.has(p.id) };
  }
  if (taken > 0) {
    for (const id of atWar) {
      if (!pyramids[id]) continue;
      pyramids[id].youth = Math.max(0.05, pyramids[id].youth - taken * 0.002);
      pyramids[id].adult = Math.min(0.8, pyramids[id].adult + taken * 0.0015);
      pyramids[id].conscripted = (pyramids[id].conscripted | 0) + taken;
    }
  }
  W.dark.pyramids = pyramids;
}

/** War economy: divert build growth into arsenal (§173). */
function warEconomyTick(W) {
  const wars = W.diplo?.wars || [];
  if (!wars.length || !W.polities?.length) {
    W.dark.warEconomy = 0;
    return;
  }
  const atWar = new Set();
  for (const w of wars) { atWar.add(w.a); atWar.add(w.b); }
  let diverted = 0;
  for (const p of W.polities) {
    if (!atWar.has(p.id)) continue;
    const take = Math.min(0.08, (p.build || 0) * 0.002);
    p.arsenal = (p.arsenal || 0) + take * 10;
    // Visibly slow lights: trim a little build at capital / industry.
    const cap = p.capital | 0;
    if (W.build?.[cap] > 0.1) {
      W.build[cap] = Math.max(0.05, W.build[cap] - take * 0.5);
      diverted++;
    }
  }
  W.dark.warEconomy = diverted;
}

export function landWarTick(W, log = null) {
  const wars = W.diplo?.wars || [];
  if (!W.fort || W.fort.length !== NC) W.fort = new Float32Array(NC);
  if (!W.frontDir || W.frontDir.length !== NC) W.frontDir = new Float32Array(NC);
  else W.frontDir.fill(0);
  W.dark = W.dark || {};
  if (!W._partisanCut) W._partisanCut = new Set();
  else W._partisanCut.clear();

  warEconomyTick(W);
  conscriptionTick(W);

  if (!wars.length || !W.owner || !W.border) {
    W.dark.frontLen = 0;
    return;
  }

  const rng = rngOf(W, 'rngGod');
  const stall = W._supplyStall || (W._supplyStall = new Map());
  const occupied = W._occupied || (W._occupied = new Map());
  let frontLen = 0;
  let cutCount = 0;
  let garrisonCost = 0;
  let sieges = 0;

  for (const war of wars) {
    // Insurgency / partisans in occupied territory (§167–168).
    for (const [cell, info] of occupied) {
      if (info.warKey !== `${war.a}:${war.b}` && info.warKey !== `${war.b}:${war.a}`) continue;
      if (rng() < 0.15) W._partisanCut.add(cell | 0);
      // Cultural distance proxy: foreign owner on high-build.
      if ((W.build?.[cell] || 0) > 0.2 && rng() < 0.08) {
        noteCasualty(W, 'war', 5);
        if (W.build) W.build[cell] *= 0.98;
      }
    }

    const reachA = supplyReachable(W, war.a);
    const reachB = supplyReachable(W, war.b);

    for (let c = 0; c < NC; c++) {
      if (!(W.border[c] > 0)) continue;
      const o = W.owner[c];
      if (o !== war.a && o !== war.b) continue;
      let enemy = false;
      let enemyN = -1;
      for (let k = 0; k < 4; k++) {
        const n = W.owner[NBR[c * 4 + k]];
        if ((n === war.a || n === war.b) && n !== o) {
          enemy = true;
          enemyN = NBR[c * 4 + k];
          break;
        }
      }
      if (!enemy) continue;
      frontLen++;
      noteFought(W, c, 1);
      // Front-line trenches as wear scar (§174).
      noteWear(c, 0.08);
      // Front direction: signed toward enemy neighbor (§176) — −1…+1 via nbr index.
      if (enemyN >= 0) {
        W.frontDir[c] = ((enemyN - c) / Math.max(1, NC)) * 8;
        if (Math.abs(W.frontDir[c]) < 0.05) W.frontDir[c] = enemyN > c ? 0.5 : -0.5;
      }

      const supplied = o === war.a ? reachA.has(c) : reachB.has(c);
      const key = `${war.a}:${war.b}:${c}`;
      if (!supplied) {
        cutCount++;
        stall.set(key, (stall.get(key) | 0) + 1);
      } else {
        stall.set(key, 0);
      }

      const fort = W.fort[c] || 0;
      const stalled = (stall.get(key) | 0) >= 2; // halt advance within 2 ticks (§178 stronger)
      W.dark.supplyCutStalls = W.dark.supplyCutStalls || 0;

      // Attrition.
      if (W.build?.[c] > 0) {
        const lost = Math.min(W.build[c], 0.004 * (1 - fort * 0.5));
        W.build[c] -= lost;
        noteCasualty(W, 'war', Math.floor(lost * 200));
      }

      const slow = terrainSlow(W, enemyN >= 0 ? enemyN : c);
      // Advance only if supplied, not stalled, and terrain allows.
      // Cross-water flips only via amphibiousInvade (§150).
      if (!stalled && supplied && enemyN >= 0 && fort < 0.6 && rng() < 0.08 * slow) {
        if (isOceanCell(W, enemyN)) {
          // skip — water
        } else if (isLandCell(W, c) && isLandCell(W, enemyN)) {
          // Check if path crosses only land (adjacent land cells).
          let waterBetween = false;
          // Direct land neighbor is fine.
          W.owner[enemyN] = o;
          if (W.build?.[enemyN] > 0) W.build[enemyN] *= 0.85;
          occupied.set(enemyN, { owner: o, warKey: `${war.a}:${war.b}`, ticks: 0 });
          void waterBetween;
        }
      } else if (stalled) {
        W.dark.supplyCutStalls = (W.dark.supplyCutStalls | 0) + 1;
      }

      // Encirclement: cell whose all land neighbors are enemy (§165).
      let landN = 0, enemyRing = 0;
      for (let k = 0; k < 4; k++) {
        const n = NBR[c * 4 + k];
        if ((W.h?.[n] ?? 1) < (W.seaLevel ?? 0)) continue;
        landN++;
        const no = W.owner[n];
        if (no !== o && no >= 0) enemyRing++;
      }
      if (landN >= 3 && enemyRing >= landN) {
        const flipTo = o === war.a ? war.b : war.a;
        W.owner[c] = flipTo;
        noteCasualty(W, 'war', 80);
        occupied.set(c, { owner: flipTo, warKey: `${war.a}:${war.b}`, ticks: 0 });
        if (log && rng() < 0.3) {
          log(W.year, 'battle', c, 0.7,
            `Battle of ${nearestCityName(W, c)} — encirclement`);
        }
      }

      // Fortify slowly on defended borders (§164).
      if (rng() < 0.05) W.fort[c] = Math.min(1, fort + 0.04);

      // Scorched earth on retreat when weariness high (§169).
      const polity = W._polityIndex?.get(o);
      const wear = polity?.weariness || 0;
      if (wear > 0.6 && rng() < 0.04 && (W.build?.[c] || 0) > 0.1) {
        igniteFire(W, c, 0.7, 1);
        W.build[c] *= 0.5;
        if (log) log(W.year, 'war', c, 0.5, `Scorched earth near ${nearestCityName(W, c)}`);
      }
    }

    // Siege: surrounded city starves (§171).
    for (const city of W.cities || []) {
      const cc = city.cell | 0;
      const co = W.owner?.[cc];
      if (co !== war.a && co !== war.b) continue;
      let ring = 0, land = 0;
      for (let k = 0; k < 4; k++) {
        const n = NBR[cc * 4 + k];
        if (!isLandCell(W, n)) continue;
        land++;
        const no = W.owner[n];
        if (no >= 0 && no !== co && (no === war.a || no === war.b)) ring++;
      }
      const supplied = co === war.a ? reachA.has(cc) : reachB.has(cc);
      if (land >= 2 && (ring >= land || !supplied)) {
        sieges++;
        if (city.pop > 0) {
          const starve = Math.max(1, Math.floor((city.pop | 0) * 0.02));
          city.pop = Math.max(0, (city.pop | 0) - starve);
          noteCasualty(W, 'famine', starve);
        }
        if (W.build?.[cc] > 0) W.build[cc] = Math.max(0, W.build[cc] - 0.01);
        if (log && rng() < 0.05) {
          log(W.year, 'siege', cc, 0.6, `Siege of ${city.name || nearestCityName(W, cc)}`);
        }
      }
    }

    // Named battle chronicle occasionally (§177).
    if (log && frontLen > 0 && rng() < 0.02) {
      const sample = ((W._tickIndex * 97) % NC);
      log(W.year, 'battle', sample, 0.5, `Battle of ${nearestCityName(W, sample)}`);
    }
  }

  // Occupation garrison cost (§166).
  for (const [cell, info] of occupied) {
    info.ticks = (info.ticks | 0) + 1;
    if (W.owner?.[cell] !== info.owner) {
      occupied.delete(cell);
      continue;
    }
    garrisonCost += 1;
    if (W.build?.[cell] > 0.05 && rng() < 0.1) {
      W.build[cell] *= 0.995; // garrison drain
      noteCasualty(W, 'war', 1);
    }
  }

  // Rare amphibious assist when fronts touch coast (§150).
  if (frontLen > 0 && rng() < 0.03 && wars.length) {
    const war = wars[0];
    for (let c = 0; c < NC; c += 17) {
      if (W.owner?.[c] !== war.a || !isLandCell(W, c)) continue;
      for (let k = 0; k < 4; k++) {
        const sea = NBR[c * 4 + k];
        if (!isOceanCell(W, sea)) continue;
        for (let j = 0; j < 4; j++) {
          const land = NBR[sea * 4 + j];
          if (isLandCell(W, land) && W.owner[land] === war.b) {
            amphibiousInvade(W, c, land, war.a);
            break;
          }
        }
      }
    }
  }

  W.dark.frontLen = frontLen;
  W.dark.supplyCut = cutCount;
  W.dark.garrisonCost = garrisonCost;
  W.dark.sieges = sieges;
  if (log && frontLen > 0 && (W._tickIndex | 0) - (W._darkLogTick | 0) > 40) {
    W._darkLogTick = W._tickIndex | 0;
    log(W.year, 'war', 0, frontLen / NC, `Front length ${frontLen}`);
  }
}
