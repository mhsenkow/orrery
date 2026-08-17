/** Settlements as entities — not only a build scalar.
 *  Next backlog city capability foundation. */

import { NC, DIR, NBR } from '../sphere.js';
import { ENT } from '../agents.js';

/** Scan build field into named settlements. */
export function settleCities(W) {
  const cities = [];
  const seen = new Uint8Array(NC);
  for (let c = 0; c < NC; c++) {
    if (seen[c] || (W.build[c] || 0) < 0.28) continue;
    const stack = [c];
    seen[c] = 1;
    let sum = 0, n = 0, best = c, bestB = W.build[c];
    while (stack.length && n < 40) {
      const x = stack.pop();
      sum += W.build[x];
      n++;
      if (W.build[x] > bestB) { bestB = W.build[x]; best = x; }
      for (let k = 0; k < 4; k++) {
        const nb = NBR[x * 4 + k];
        if (!seen[nb] && W.build[nb] >= 0.22) {
          seen[nb] = 1;
          stack.push(nb);
        }
      }
    }
    if (n < 2 && bestB < 0.4) continue;
    const stage = bestB >= 0.85 ? 'city' : bestB >= 0.55 ? 'town' : bestB >= 0.3 ? 'village' : 'camp';
    let name = null;
    for (let i = 0; i < ENT.n; i++) {
      const m = ENT.meta[i];
      if (m?.kind === 5 && m.name && m.cell === best) { name = m.name; break; }
    }
    const npp = W.npp?.[best] || W.life[best] || 0;
    const soil = W.soil?.[best] || 0;
    const moist = W.moist?.[best] || 0;
    const tech = Math.min(1, (W.unlockedClass || 0) / 6);
    // Carrying capacity → population (relative)
    const pop = Math.max(10, Math.floor(
      (80 + bestB * 4000) * (0.35 + npp * 0.5 + soil * 0.2 + moist * 0.15) * (0.6 + tech * 0.8) * n
    ));
    const tide = W.tideRange?.[best] || 0;
    const coastal = W.h[best] < W.seaLevel + 0.04;
    const harbour = coastal && tide > 0.006 && tide < 0.04; // sheltered useful range
    const drowned = coastal && (W.intertidal?.[best] || 0) > 0.7 && bestB < 0.5;
    cities.push({
      cell: best,
      build: bestB,
      mass: sum,
      cells: n,
      stage,
      name: name || `${stage}-${best}`,
      pos: [DIR[best * 3], DIR[best * 3 + 1], DIR[best * 3 + 2]],
      pop,
      npp,
      harbour,
      drowned,
      tideRange: tide,
    });
  }
  cities.sort((a, b) => {
    const score = (x) => x.build + (x.harbour ? 0.08 : 0) - (x.drowned ? 0.12 : 0);
    return score(b) - score(a);
  });
  W.cities = cities.slice(0, 48);
  let mb = 0;
  for (let c = 0; c < NC; c += 7) mb += W.build[c];
  W.meanBuild = mb / Math.ceil(NC / 7);
  W.civPop = W.cities.reduce((s, x) => s + (x.pop || 0), 0);
  return W.cities;
}

/** Night lights strength from cities. */
export function cityLights(W) {
  if (!W.cities?.length) return 0;
  const popTerm = Math.min(0.5, Math.log10(1 + (W.civPop || 0)) / 8);
  return Math.min(1, W.cities.length * 0.04 + (W.meanBuild || 0) * 0.8 + popTerm);
}
