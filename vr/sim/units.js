/** Unit registry — one place for sim field meanings (earth-fidelity A21).
 *  Moved out of carbon.js; instruments and saves import from here. */

export const UNIT_MAP = {
  temp: {
    sim: '0–1.6 field',
    si: 'approx °C via (T−0.5)*80+15 on Earth',
    note: 'fitted@earth',
    tag: 'fitted',
  },
  life: {
    sim: '0–1 density',
    si: 'relative biomass / carrying capacity',
    note: 'invented',
    tag: 'invented',
  },
  ageYr: {
    sim: 'years since CAI',
    si: 'a (years)',
    note: 'measured',
    tag: 'measured',
  },
  CO2: {
    sim: 'volume mixing ratio',
    si: 'mol/mol',
    note: 'measured',
    tag: 'measured',
  },
  carbon: {
    sim: 'reservoir units',
    si: '~relative GtC',
    note: 'fitted',
    tag: 'fitted',
  },
  dtYr: {
    sim: 'years per tick',
    si: 'a/tick',
    note: 'invented for legibility',
    tag: 'invented',
  },
  moist: {
    sim: '0–1 soil moisture',
    si: 'relative water content',
    note: 'invented',
    tag: 'invented',
  },
  vapour: {
    sim: 'column vapour field',
    si: 'relative; inventory via waterInventory()',
    note: 'invented',
    tag: 'invented',
  },
  ice: {
    sim: '0–1 ice cover',
    si: 'relative ice thickness proxy',
    note: 'fitted',
    tag: 'fitted',
  },
  iceLand: {
    sim: '0–1 land ice',
    si: 'relative',
    note: 'fitted',
    tag: 'fitted',
  },
  iceSea: {
    sim: '0–1 sea ice',
    si: 'relative',
    note: 'fitted',
    tag: 'fitted',
  },
  h: {
    sim: 'heightfield (−1.2…1.2)',
    si: 'relative elevation vs seaLevel',
    note: 'invented',
    tag: 'invented',
  },
  press: {
    sim: 'SWE pressure / height anomaly',
    si: 'not optical column — see pSeen',
    note: 'numeric',
    tag: 'numeric',
  },
  pSeen: {
    sim: 'optical / diagnostic pressure',
    si: 'bar-scale for instruments when set',
    note: 'fitted',
    tag: 'fitted',
  },
  dtBio: {
    sim: 'years per biology substep',
    si: 'a/substep',
    note: 'invented',
    tag: 'invented',
  },
  bioGen: {
    sim: 'biology generation counter',
    si: 'advances dtBio/25',
    note: 'invented',
    tag: 'invented',
  },
};

/** Schema hash so saves can detect unit-convention drift (A40). */
export function unitsSchemaHash() {
  const keys = Object.keys(UNIT_MAP).sort();
  let h = 0;
  for (const k of keys) {
    const row = UNIT_MAP[k];
    const s = `${k}:${row.sim}:${row.si}:${row.tag || row.note}`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return `u${(h >>> 0).toString(16)}`;
}
