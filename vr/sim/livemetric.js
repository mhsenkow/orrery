/** Headless living-layer scoreboard — eleven numbers in one place.
 *  Thrive backlog `livemetric`. */

import { ENT } from '../agents.js';
import { cityLights } from './city.js';

export function livingMetrics(W, ent = ENT) {
  let alive = 0;
  let settlers = 0;
  let dead = 0;
  let maxAge = 0;
  let herdMax = 0;
  const kinds = Object.create(null);
  const behav = Object.create(null);
  for (let i = 0; i < ent.n; i++) {
    const m = ent.meta[i];
    if (!m) continue;
    if (m.dead) { dead++; continue; }
    alive++;
    kinds[m.kind] = (kinds[m.kind] || 0) + 1;
    behav[m.behav] = (behav[m.behav] || 0) + 1;
    if (m.kind === 5) settlers++;
    if (m.age > maxAge) maxAge = m.age;
    if ((m.herd || 0) > herdMax) herdMax = m.herd;
  }
  const living = W.tree?.living?.length ?? 0;
  const sprites = new Set();
  for (let i = 0; i < ent.n; i++) {
    const m = ent.meta[i];
    if (m && !m.dead) sprites.add(m.kind);
  }
  return {
    alive,
    settlers,
    dead,
    maxAge,
    herdMax,
    kinds,
    behav,
    sprites: sprites.size,
    lineages: living,
    cities: W.cities?.length || 0,
    meanBuild: W.meanBuild || 0,
    builtFrac: W.builtFrac || 0,
    cityLights: cityLights(W),
    fireCells: W.fireCells || 0,
    burntArea: W.burntArea || 0,
    plumeCells: W._plumeCells || 0,
    foodWebLinks: W.foodWeb?.links?.length || 0,
    foodWebDropped: W.foodWeb?.dropped || 0,
    ageYr: W.ageYr,
    meanLife: W.meanLife,
  };
}

/** One line for logs and headless JSON. */
export function formatLivingLine(m) {
  return [
    `alive ${m.alive}`,
    `settlers ${m.settlers}`,
    `herd ${m.herdMax}`,
    `cities ${m.cities}`,
    `build ${m.meanBuild.toFixed(4)}`,
    `lights ${m.cityLights.toFixed(2)}`,
    `fire ${m.fireCells}`,
    `lineages ${m.lineages}`,
    `sprites ${m.sprites}`,
  ].join(' · ');
}
