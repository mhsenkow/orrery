/** Glossary + causal explainers for teaching.
 *  Next backlog teach 154–158, 160–161. */

export const GLOSSARY = {
  'δ¹³C': 'Carbon isotope ratio — tracks organic burial vs carbonate. Heavy values mean more burial.',
  'δ¹⁸O': 'Oxygen isotope ratio — proxy for ice volume and temperature.',
  euxinia: 'Sulfidic anoxic water — mid-depth ocean poisoned by H₂S, starves metals and nitrogenase.',
  NPP: 'Net primary productivity — carbon fixed by photosynthesis minus plant respiration.',
  Chappuis: 'Ozone absorption bands that turn twilight deep blue instead of orange.',
  allopatric: 'Speciation by geographic split — a barrier cuts gene flow until lineages diverge.',
  Redfield: 'C:N:P ≈ 106:16:1 in marine plankton — whoever runs out first limits the bloom.',
  redox: 'Who donates and who accepts electrons — the Archean’s real ladder.',
  LUCA: 'Last universal common ancestor — the root of your live phylogeny.',
  GOE: 'Great Oxidation Event — free O₂ rises once sinks are overwhelmed; anaerobes die.',
  CCD: 'Carbonate compensation depth — below it, shells dissolve rather than bury.',
  AMOC: 'Atlantic-style overturning — freshwater can shut the conveyor.',
  Kleiber: 'Metabolic rate scales as mass^¾ — sets density and lifespan.',
  Whittaker: 'Biome diagram in temperature–precipitation space.',
  springs: 'Syzygy tides — Moon and Sun aligned; lunar and solar bulges add.',
  neaps: 'Quadrature tides — Moon and Sun at right angles; range is smallest.',
  intertidal: 'Cells alternately wet and dry each lunar day — desiccation selects hard here.',
  Roche: 'Inside ~2.9 planetary radii a moon is torn apart; the lever clamps to that floor.',
  chaos: 'Weather predictability ceiling is ~2 weeks — beyond that, forecasts are scenarios not predictions.',
};

export function defineTerm(term) {
  return GLOSSARY[term] || GLOSSARY[term?.replace?.(/^./, (c) => c.toUpperCase())] || null;
}

/** Short unprompted explanation when drama happens. */
export function explainDrama(W) {
  if (W._conveyorNote && W.conveyor < 0.4) {
    return { title: 'Overturning weakening', body: 'Fresh surface water is capping the deep. The conveyor slows — high latitudes cool, tropics can warm.', settle: 'decades–centuries' };
  }
  if (W.state === 'snowball') {
    return { title: 'Snowball', body: 'Ice–albedo feedback ran away. Volcanoes must rebuild CO₂ under the lid before melt.', settle: '10⁵–10⁶ yr' };
  }
  if (W.state === 'moist-greenhouse') {
    return { title: 'Moist greenhouse', body: 'Water is reaching altitudes where it can escape. The thermostat may not save this.', settle: 'irreversible on human scales' };
  }
  if ((W.gases?.O2 || 0) > 0.05 && W._oxEvent) {
    return { title: 'Oxygen rising', body: 'Burial outran the sinks. Free O₂ is a poison to the old biosphere and fuel for the new.', settle: 'Myr' };
  }
  if ((W._extinctionPulse || 0) > 0.5) {
    return { title: 'Extinction pulse', body: 'A kill mechanism crossed a threshold — thermal, hypoxic, acid, UV, or habitat. Check the chronicle for attribution.', settle: 'recovery 1–10 Myr' };
  }
  return null;
}

export const READING_LIST = [
  { author: 'Lovelock', title: 'Gaia', note: 'Regulation without foresight' },
  { author: 'Lenton', title: 'Earth System Science', note: 'Tipping elements' },
  { author: 'Canfield', title: 'Oxygen', note: 'The redox history' },
  { author: 'Knoll', title: 'Life on a Young Planet', note: 'Precambrian biosphere' },
  { author: 'Lane', title: 'The Vital Question', note: 'Energy and complexity' },
  { author: 'Sepkoski', title: 'Marine diversity curves', note: 'Mass extinction notches' },
];

/** Progressive tool unlock by world state. */
export const TOOL_GATES = {
  inspect: () => true,
  core: (W) => true,
  icecore: (W) => (W.iceFrac || 0) > 0.02,
  seedGuild: (W) => (W.habitability || 0) > 0.2,
  seed: (W) => (W.transitions?.abiogenesis || W.meanLife > 0.05),
  raise: () => true,
  lower: () => true,
  solar: () => true,
  co2: () => true,
  albedo: (W) => (W.iceFrac || 0) > 0.05 || (W.meanLife || 0) > 0.1,
  meteor: (W) => (W.ageYr || 0) > 1e8 || !W.rule?.deepTime,
  plague: (W) => (W.meanLife || 0) > 0.15,
  refuge: (W) => (W.tree?.living?.length || 0) > 2,
  plate: (W) => !W.rule?.airless,
  plume: (W) => !W.rule?.airless,
  buster: (W) => (W.attribution?.acts || 0) > 10,
};

export function toolsUnlocked(W) {
  const out = {};
  for (const [id, gate] of Object.entries(TOOL_GATES)) out[id] = !!gate(W);
  return out;
}
