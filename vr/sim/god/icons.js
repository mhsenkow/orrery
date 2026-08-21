/** Compact line icons for tools and play actions — 16×16 viewBox. */

const PATHS = {
  inspect: 'M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm4.2 7.1 2.5 2.5',
  core: 'M8 2.5v11M4 5.5h8M5 8.5h6M4.5 11.5h7M3.5 3.5h9v9h-9z',
  icecore: 'M8 2l1.2 2.8L12 6l-2.2 1.5L10.5 11 8 9.2 5.5 11l.7-3.5L4 6l2.8-1.2zM5 13h6',
  seedGuild: 'M8 13V7M8 7c-2 0-3.5-1.5-3.5-3.2C4.5 2.5 6 2 8 3.5 10 2 11.5 2.5 11.5 3.8 11.5 5.5 10 7 8 7zm-3 6h6',
  seed: 'M8 13c0-4 3-5 3-8a3 3 0 0 0-6 0c0 3 3 4 3 8zm-3 0h6',
  refuge: 'M3 13V7l5-4 5 4v6H3zm2-1h6V7.8L8 5.5 5 7.8V12z',
  raise: 'M3 12h10M5 12V8l3-4 3 4v4',
  lower: 'M3 4h10M5 4v4l3 4 3-4V4',
  flatten: 'M3 8h10M3 11h10M5 5h6M5 14h6',
  heightlayer: 'M3 4h10v2.2H3zM3 7.9h10v2.2H3zM3 11.8h10V14H3z',
  smooth: 'M3 11c2-4 4-4 5 0s3 4 5 0',
  sharpen: 'M8 3v10M5 6l3-3 3 3M5 10l3 3 3-3',
  roughen: 'M3 11l2-3 2 2 2-4 2 3 2-2',
  crust: 'M3 12.5c2-6 4-8 5-8s3 2 5 8M4 12.5h8',
  plume: 'M8 13V8M8 8c-2.5-1-3-3-2-4.5S9 2 9.5 4 10 7 8 8zm-2.5 5h5',
  plate: 'M8 3v10M3.5 8h9M5 5.2l6 5.6M5 10.8l6-5.6',
  river: 'M3 4c2 2 2 3 0 5s-2 3 0 4M7 3c2 2 2 3 0 5s-2 3 0 5M11 4c2 2 2 3 0 5s-2 3 0 4',
  albedo: 'M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3zm0 0v10M8 3c2.5 1.5 2.5 7.5 0 10',
  solar: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1.1 1.1M11.1 11.1l1.1 1.1M3.8 12.2l1.1-1.1M11.1 4.9l1.1-1.1',
  co2: 'M4 10.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm8-1a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM7 8h3M5.5 12.5h5',
  o2: 'M5.5 10.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm5 0a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',
  shade: 'M3 11l5-8 5 8H3zm5-5.5v4M2 13h12',
  aerosol: 'M4 12c0-2 1.5-3 1.5-5S4 4 4 4M8 13c0-2.5 2-3.5 2-6S8 3 8 3M12 12c0-2 1-3 1-5s-1-3-1-3',
  weather: 'M5 9.5a2.5 2.5 0 0 1 .4-5 3.2 3.2 0 0 1 6.2 1A2.3 2.3 0 0 1 12 9.5H5zM6 11.5v2M8 11v2.5M10 11.5v2',
  meteor: 'M11.5 2.5l-7 7 1.5 1.5 7-7-1.5-1.5zM4 12.5l2-1 1 2-2 1-1-2z',
  volcano: 'M3 13h10L9.5 6 8 9 6.5 6 3 13zm5-10v2',
  lip: 'M2 13h12L10 7H6L2 13zm3-1h6M4.5 10h7M8 3v3',
  quake: 'M2 8h2l1.5-3 2 6L9 6.5 11 8h3',
  plague: 'M8 3v2M8 11v2M3.5 5.5l1.5 1.5M11 9l1.5 1.5M3.5 10.5l1.5-1.5M11 7l1.5-1.5M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  ice: 'M8 2v12M4.5 4.5 8 8l3.5-3.5M4.5 11.5 8 8l3.5 3.5M2.5 8H13.5',
  tilt: 'M8 2.5v11M4 5l4 3 4-3M4.5 12a5 5 0 0 0 7 0',
  spin: 'M11.5 5.5A4.5 4.5 0 1 0 12 9M11.5 5.5V3M11.5 5.5H14',
  moon: 'M4 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0zm1.2-1.2c.5-.3 1.2 0 1.5.6M10 9.5c.4.5 0 1.2-.6 1.4',
  // Sky suite desks
  sky: 'M3 11.5a3 3 0 0 1 .5-6 3.8 3.8 0 0 1 7.3 1.2A2.7 2.7 0 0 1 13 11.5H3zM8 2.5v1.8M2.5 8H4M12 8h1.5M4 4.2l1.1 1.1M11 5.3l1-1',
  stormdesk: 'M8 3.5a3.2 3.2 0 0 1 0 6.4A2.4 2.4 0 0 1 5.8 13H4.2a2.4 2.4 0 0 1 0-4.8 3.2 3.2 0 0 1 3.8-4.7zM9.5 11.5c1.2.8 2.5.8 3.5 0',
  coastdesk: 'M2 11c2-1 3.5-3 6-3s4 2 6 3M3 13h10M4.5 8.5c1-.8 2.2-1.3 3.5-1.3s2.5.5 3.5 1.3M8 3v3.5',
  compare: 'M3.5 4.5h4v7h-4zM8.5 4.5h4v7h-4zM5.5 6.5v3M11.5 6.5v3',
  seedstorm: 'M8 2.5v2M8 11.5v2M3.5 8H5.5M10.5 8H12.5M4.5 4.5l1.4 1.4M10.1 10.1l1.4 1.4M4.5 11.5l1.4-1.4M10.1 5.9l1.4-1.4M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  surge: 'M2 10c1.5-2 3-3 5-3s3.5 1 5 3M3 12.5c1.2-1.5 2.5-2.2 4-2.2s2.8.7 4 2.2M8 3l1.2 2.5H12l-2.2 1.8.8 2.7L8 8.5 5.2 10l.8-2.7L3.8 5.5h2.8L8 3z',
  flats: 'M2 12h12M3 10h10M4.5 8h7M5.5 6h5M6.5 4h3',
  freeze: 'M8 2v12M4.2 4.5 8 8l3.8-3.5M4.2 11.5 8 8l3.8 3.5M2.5 8H13.5M5.5 2.8l2.5 2.2 2.5-2.2',
  orbitguides: 'M8 2v12M3 8h10M4.5 4.5l7 7M4.5 11.5l7-7',
  buster: 'M8 2l1 3h3l-2.5 2 1 3L8 8.5 5.5 10l1-3L4 5h3L8 2zm-4 11h8',
  // Play / chrome
  godundo: 'M5 7H3l3-3 3 3H7a3 3 0 1 1-2.1 5.1',
  godredo: 'M11 7h2l-3-3-3 3h2a3 3 0 1 0 2.1 5.1',
  godff: 'M4 4v8l5-4-5-4zm6 0v8h1.5V4H10z',
  godwatch: 'M2 8h3l1.5-3L9 12l1.5-4H14',
  godbookmark: 'M5 2.5h6v11l-3-2-3 2v-11z',
  godcull: 'M3 13h10L9.5 6 8 9 6.5 6 3 13zM8 3v2M4 8h8',
  scenariostart: 'M4 3.5v9l9-4.5-9-4.5z',
  genesisgo: 'M3 8h7M8 4l4 4-4 4M3 12h4',
  genesisrand: 'M5 4h2.5a3 3 0 0 1 0 6H7M11 12H8.5a3 3 0 0 1 0-6H9M10 3.5l1.5 1.5L10 6.5M6 9.5 4.5 11 6 12.5',
  dailyseed: 'M4.5 3.5h7v2h-7zM4.5 5.5h7v7h-7zM6.5 8h1v3h-1zm2.5 0h1v3h-1z',
  godshelf: 'M3 4h10v2H3zM3 8h10v2H3zM3 12h10v1.5H3z',
  godshare: 'M6 8a2 2 0 1 1-2-2m8-1a2 2 0 1 1 0 4M4.8 7.2l6.4 3.6M4.8 8.8l6.4-3.6',
  budget: 'M8 2.5v11M5 5.5c0-1.5 1.2-2.5 3-2.5s3 1 3 2.5-1.2 2-3 2.5-3 1-3 2.5 1.2 2.5 3 2.5 3-1 3-2.5',
  autopilot: 'M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM8 6v2.5l2 1',
  deeptime: 'M8 3a5 5 0 1 0 4.5 3M12.5 3v3h-3',
  more: 'M3 8.5h2v-1H3v1zm4 0h2v-1H7v1zm4 0h2v-1h-2v1z',
  // Dock tabs
  tabtools: 'M5.5 2.5 3 5l2.5 2.5M3 5h6.5a2.5 2.5 0 0 1 0 5H8M10.5 13.5 13 11l-2.5-2.5M13 11H6.5a2.5 2.5 0 0 1 0-5H8',
  tabplay: 'M4 3.5v9l9-4.5-9-4.5z',
  tabview: 'M8 3.5C4.5 3.5 2 8 2 8s2.5 4.5 6 4.5S14 8 14 8s-2.5-4.5-6-4.5zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  tablab: 'M6 2.5h4v3.2L12.5 13H3.5L6 5.7V2.5zM5.5 2.5h5M7 8.5h2',
  tabworld: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM2.5 8h11M8 2.5c1.8 1.8 1.8 9 0 11M8 2.5c-1.8 1.8-1.8 9 0 11',
  tabrock: 'M3 12.5h10L10 6.5 8 9 6 6.5 3 12.5zM8 2.5v3M5.5 5l2.5-2 2.5 2',
  // Panel section heads
  brush: 'M4 12.5c2-1 3-3 4-5.5L9.5 4l2.5 2.5L9 9.5c-2.5 1-4.5 2-5 3zM10.2 4.8l1.5-1.5',
  challenge: 'M8 2.5l1.2 2.6 2.8.3-2.1 1.9.6 2.8L8 8.6 5.5 10.1l.6-2.8L4 5.4l2.8-.3z',
  genesis: 'M8 2v3M8 11v3M2 8h3M11 8h3M4.2 4.2l2.1 2.1M9.7 9.7l2.1 2.1M4.2 11.8l2.1-2.1M9.7 6.3l2.1-2.1',
  appear: 'M3 10.5h10M5 10.5V6.5l3-3 3 3v4M8 13v-2',
  slice: 'M3 4.5h10v7H3zM8 4.5v7M5.5 7.5h5',
  keys: 'M3 5.5h4v3H3zM9 5.5h4v3H9zM6 10h4v2.5H6z',
  planet: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM3.5 6.5h9M3.5 9.5h9',
  modes: 'M3 5h4v6H3zM9 5h4v6H9zM5 7h0.01M11 7h0.01M5 9h0.01M11 9h0.01',
  archive: 'M3.5 4h9v2h-9zM4.5 6h7v6.5h-7zM6.5 8.5h3',
  station: 'M3 12.5h10M4 12.5V7l4-3.5 4 3.5v5.5M6.5 9.5h3',
  curves: 'M2.5 11.5c2-4 3.5-6 5.5-6s3.5 2 5.5 6M2.5 4.5h11',
  survey: 'M3 12.5h10L8 3.5 3 12.5zm2.5-2h5',
  notes: 'M4.5 2.5h5l2 2v9h-7v-11zM9.5 2.5V5h2.5M6 8h4M6 10.5h3',
  refresh: 'M12.5 8A4.5 4.5 0 1 1 11 4.2M12.5 8V5M12.5 8H10',
  paper: 'M4 2.5h6l2 2v9H4v-11zM10 2.5V5h2M6 7.5h4M6 10h3',
  save: 'M3.5 3.5h7l2 2v7h-9v-9zM5.5 3.5v3h4v-3M5.5 11h5',
  finale: 'M4 3.5h8v9l-4-2.2L4 12.5v-9z',
  png: 'M3.5 4.5h9v7h-9zM5.5 9.5l1.5-2 1.5 1.5 1.5-2.5 2 3H5.5zM6 6.5h.01',
  dual: 'M3.5 4.5h4v7h-4zM8.5 4.5h4v7h-4z',
  table: 'M3 4h10v2H3zM3 6h10v6H3zM8 6v6M3 9h10',
  chronicle: 'M4 2.5h6.5l1.5 1.5V13.5H4zM6 6h4M6 8.5h4M6 11h2.5',
  resolution: 'M3 12.5h10M5 12.5V7l3-4 3 4v5.5M7 9.5h2',
};

/* Evil desk. `iconSVG` falls back to the magnifying glass for an unknown id, so
   without these ten the whole desk renders as ten identical Inspect buttons —
   silently, because a fallback is not an error. Same 16×16 single-path style. */
Object.assign(PATHS, {
  // A drop with a slash through it: chemical, and not to be touched.
  poison: 'M8 2.5C6.2 5.4 4.8 7.1 4.8 8.8a3.2 3.2 0 0 0 6.4 0c0-1.7-1.4-3.4-3.2-6.3zM5 13.5l6-2',
  // A drum with bands.
  waste: 'M4.5 4.8h7v7.7h-7zM4.5 7.4h7M4.5 10h7M6.2 2.6h3.6v2.2H6.2z',
  // Stem and cap.
  nuke: 'M3.5 13.5h9M8 13.5V8.2M4.2 8.2h7.6C11.8 5.6 10.1 4 8 4S4.2 5.6 4.2 8.2z',
  // A ballistic arc with a nose cone.
  icbm: 'M2.5 13.5C6 12 9.5 8.5 12.8 2.9M12.8 2.9H9.6M12.8 2.9v3.2M4.6 11.6l1.8 1.8',
  // The same arc, leaving the water.
  slbm: 'M2.5 12.4c1.4-1.1 2.8-1.1 4.2 0M8.4 9.6 12.9 3M12.9 3h-2.9M12.9 3v2.9M2.5 14.2c1.4-1.1 2.8-1.1 4.2 0',
  // One aircraft, seen from above.
  airstrike: 'M8 2.6v10.8M2.6 7.6h10.8M5.4 12.2h5.2',
  // Three of them.
  swarm: 'M4.2 4.4 5.7 7H2.7zM11.8 4.4 13.3 7h-3zM8 9.2 9.5 11.8h-3zM8 4.4v1.6M4.2 8.6v1.4M11.8 8.6v1.4',
  // A capsid with spikes.
  pandemic: 'M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM8 2.4v2.2M8 11.4v2.2M2.4 8h2.2M11.4 8h2.2M4.3 4.3l1.5 1.5M10.2 10.2l1.5 1.5M4.3 11.7l1.5-1.5M10.2 5.8l1.5-1.5',
  // Two blades crossed, hilts down.
  war: 'M3.4 3.4 11.4 11.4M12.6 3.4 4.6 11.4M2.6 11.8l2 2M13.4 11.8l-2 2',
  // A star throwing to one side.
  flare: 'M5.6 8a2.4 2.4 0 1 0 4.8 0 2.4 2.4 0 0 0-4.8 0M10.6 8h3.2M10.2 5.6 12.8 3.4M10.2 10.4 12.8 12.6M5.4 8H2.6M6 6.2 4.2 4.4M6 9.8 4.2 11.6',
  // Yield ladder / exotic payloads (dark-400 §78) — without these, Evil tools
  // silently show as Inspect.
  tactical: 'M8 3.2v9.6M5.2 6.4 8 3.8 10.8 6.4M4.5 12.8h7',
  strategic: 'M8 2.4v11.2M3.6 7.2h8.8M5 4.8 8 2.8 11 4.8M5 11.2 8 13.2 11 11.2',
  citybuster: 'M3.2 12.8h9.6L9.2 6.4 8 9.2 6.8 6.4 3.2 12.8zM8 2.4v3.2M4.8 13.6h6.4',
  neutron: 'M8 3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM8 5.2v5.6M5.2 8h5.6',
  salted: 'M4 4.4h8v1.6H4zM5.2 6h5.6v6.4H5.2zM6.4 8h3.2M6.4 10.4h3.2',
  bunker: 'M4 12.8V7.2L8 3.6l4 3.6v5.6H4zm2.4-2.4h3.2v2.4H6.4z',
  emp: 'M8 2.8v2.4M8 10.8v2.4M2.8 8h2.4M10.8 8h2.4M4.4 4.4l1.6 1.6M10 10l1.6 1.6M4.4 11.6l1.6-1.6M10 6l1.6-1.6M8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z',
  dirty: 'M4.4 3.6h7.2v2.4H4.4zM5.6 6h4.8v6.4H5.6zM7.2 8.8h1.6v2.4H7.2zM3.2 13.6l9.6-1.6',
  thermobaric: 'M8 2.4c-2.4 2.8-3.6 4.8-3.6 6.8a3.6 3.6 0 0 0 7.2 0c0-2-1.2-4-3.6-6.8zM5.6 13.6h4.8',
  cluster: 'M4 4.8h2.4v2.4H4zM9.6 4.8H12v2.4H9.6zM6.8 9.6h2.4v2.4H6.8zM3.2 12.8h2.4v1.6H3.2zM10.4 12.8h2.4v1.6h-2.4z',
  chem_persist: 'M8 2.4C6 5.2 4.8 6.8 4.8 8.4a3.2 3.2 0 0 0 6.4 0c0-1.6-1.2-3.2-3.2-6zM4 13.6h8M5.6 12l4.8 1.6',
  chem_brief: 'M8 2.4C6 5.2 4.8 6.8 4.8 8.4a3.2 3.2 0 0 0 6.4 0c0-1.6-1.2-3.2-3.2-6zM5.6 12.8h4.8',
  bio: 'M8 4.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM8 2.4v1.6M8 12v1.6M3.2 8H4.8M11.2 8h1.6',
  cruise: 'M2.4 10.4c3.2-0.8 6.4-2.4 10.4-5.6M12.8 4.8H10M12.8 4.8v2.4M3.2 12h4',
  drone: 'M8 3.2v9.6M3.2 8h9.6M5.6 11.2h4.8M6.4 4.8h3.2',
});

export function iconSVG(id, className = 'ico') {
  const d = PATHS[id] || PATHS.inspect;
  return `<svg class="${className}" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

export function decorateButton(btn, id, label) {
  btn.innerHTML = `${iconSVG(id)}<span class="btn-label">${label}</span>`;
}

/** Section heading with icon — for god-h / lab-card h3 style rows. */
export function sectionHeading(id, label, className = 'sec-h') {
  return `<div class="${className}">${iconSVG(id)}<span>${label}</span></div>`;
}

/** Dock-tab icon map. */
export const DOCK_TAB_ICONS = {
  tools: 'tabtools',
  god: 'tabplay',
  climate: 'sky',
  rock: 'tabrock',
  view: 'tabview',
  lab: 'tablab',
  sandbox: 'tabworld',
};
