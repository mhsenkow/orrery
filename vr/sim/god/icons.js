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
  godff: 'M4 4v8l5-4-5-4zm6 0v8h1.5V4H10z',
  godwatch: 'M2 8h3l1.5-3L9 12l1.5-4H14',
  godbookmark: 'M5 2.5h6v11l-3-2-3 2v-11z',
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
