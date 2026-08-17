/** System record above the planet — shared host, sibling list, resonances.
 *  Exoparams: system + host sharing (TRAPPIST-1, Kepler-90, …). */

import { HOSTS, bodyKey, makeWorldRecord } from './worldRecord.js';
import { SEED_WORLDS } from '../worldParams.js';

/** Known multi-planet systems keyed by host id or star name. */
export const SYSTEMS = {
  sol: {
    id: 'sol',
    name: 'Solar System',
    hostId: 'sol',
    bodies: [
      'Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn',
      'Uranus', 'Neptune', 'Pluto', 'Ceres',
    ],
    moons: [
      'Luna', 'Io', 'Europa', 'Ganymede', 'Callisto', 'Titan',
      'Enceladus', 'Triton', 'Miranda', 'Iapetus', 'Mimas', 'Charon',
    ],
    note: 'Calibration spine — every other system inherits credibility from these.',
  },
  trappist1: {
    id: 'trappist1',
    name: 'TRAPPIST-1',
    hostId: 'trappist1',
    bodies: [
      'TRAPPIST-1 b, c', 'TRAPPIST-1 d', 'TRAPPIST-1 e',
      'TRAPPIST-1 f', 'TRAPPIST-1 g, h',
    ],
    resonances: ['8:5', '5:3', '3:2', '3:2', '4:3', '3:2'],
    note: 'Seven planets in a near-resonant chain; TTVs give masses to a few percent.',
  },
  proxima: {
    id: 'proxima',
    name: 'Proxima Centauri',
    hostId: 'proxima',
    bodies: ['Proxima Cen b', 'Proxima Cen d'],
    binary: { with: 'α Cen AB', note: 'Proxima is the tertiary of α Centauri.' },
    note: 'Nearest exoplanet host; flares hard.',
  },
  toi700: {
    id: 'toi700',
    name: 'TOI-700',
    hostId: 'toi700',
    bodies: ['TOI-700 d', 'TOI-700 e'],
    note: 'Quiet M dwarf — no flares in a year of TESS monitoring.',
  },
  kepler90: {
    id: 'kepler90',
    name: 'Kepler-90',
    hostId: null,
    bodies: ['Kepler-11 / Kepler-90'],
    note: 'Eight planets — the only system matching our own planet count.',
  },
};

/** Resolve which system a body belongs to. */
export function systemForName(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('trappist')) return SYSTEMS.trappist1;
  if (n.includes('proxima')) return SYSTEMS.proxima;
  if (n.includes('toi-700') || n.includes('toi 700')) return SYSTEMS.toi700;
  if (n.includes('kepler-90') || n.includes('kepler-11')) return SYSTEMS.kepler90;
  if (SYSTEMS.sol.bodies.some((b) => b.toLowerCase() === n)
    || SYSTEMS.sol.moons.some((b) => b.toLowerCase() === n)) {
    return SYSTEMS.sol;
  }
  return null;
}

/** Build a system snapshot with host + sibling seed rows. */
export function makeSystemRecord(systemId) {
  const sys = SYSTEMS[systemId];
  if (!sys) return null;
  const host = sys.hostId ? HOSTS[sys.hostId] : null;
  const siblings = [];
  for (const b of sys.bodies || []) {
    const seed = SEED_WORLDS.find((w) => w.b === b);
    if (seed) siblings.push(makeWorldRecord(seed, { host: host || undefined }));
  }
  return {
    ...sys,
    host,
    siblings,
    key: bodyKey(sys.name),
  };
}

/** Attach system pointer onto a world record. */
export function attachSystem(record) {
  if (!record) return record;
  const sys = systemForName(record.name);
  if (sys) {
    record.systemId = sys.id;
    record.system = { id: sys.id, name: sys.name, resonances: sys.resonances || null };
  }
  return record;
}
