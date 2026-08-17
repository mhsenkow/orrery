/** Shelf of worlds — persist several runs.
 *  Backlog many 166–177. */

const KEY = 'orrery.shelf.v2';

export function loadShelf() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveShelf(shelf) {
  try {
    localStorage.setItem(KEY, JSON.stringify(shelf.slice(0, 24)));
  } catch { /* quota */ }
}

export function shelfEntryFromWorld(W, serializeRun) {
  const data = serializeRun();
  return {
    id: `${W.seed}-${Date.now()}`,
    name: W.worldName || W.rule?.name || 'World',
    seed: W.seed,
    ruleId: W.rule?.id,
    ageYr: W.ageYr,
    meanLife: W.meanLife,
    meanTemp: W.meanTemp,
    disequilibrium: W.disequilibrium || 0,
    diversity: W.tree?.living?.length || 0,
    playerFrac: W.attribution?.player || 0,
    style: W.interventionLog ? undefined : undefined,
    savedAt: Date.now(),
    data,
  };
}

export function addToShelf(W, serializeRun) {
  const shelf = loadShelf();
  const entry = shelfEntryFromWorld(W, serializeRun);
  shelf.unshift(entry);
  saveShelf(shelf);
  return entry;
}

export function removeFromShelf(id) {
  const shelf = loadShelf().filter((e) => e.id !== id);
  saveShelf(shelf);
  return shelf;
}

/** Rank by biosignature. Item 173. */
export function rankByBiosignature(shelf = loadShelf()) {
  return shelf.slice().sort((a, b) => (b.disequilibrium || 0) - (a.disequilibrium || 0));
}

/** Twin-world control metadata. Item 69 / 169. */
export function twinPair(baseGenesis, variable, valueA, valueB) {
  return {
    a: { ...baseGenesis, [variable]: valueA, name: `${baseGenesis.name || 'Twin'}-A` },
    b: { ...baseGenesis, [variable]: valueB, name: `${baseGenesis.name || 'Twin'}-B` },
    variable,
  };
}

/** Garden of runs you have actually finished. Item 171. */
export function gardenOfRuns(shelf = loadShelf()) {
  return shelf.filter((e) => (e.ageYr || 0) > 1e6 || (e.meanLife || 0) > 0.1);
}

/** Share string from shelf entry. Item 175. */
export function shareEntry(entry) {
  try {
    return 'orrery-world:' + btoa(unescape(encodeURIComponent(JSON.stringify({
      seed: entry.seed,
      ruleId: entry.ruleId,
      name: entry.name,
      interventions: entry.data?.interventions?.slice(-30),
    }))));
  } catch {
    return null;
  }
}
