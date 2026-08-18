/** Hover tip copy — tools, play controls, dock chrome. */

export const TOOL_TIPS = {
  inspect: {
    title: 'Inspect',
    body: 'Click a cell to read elevation, temperature, moisture, life, guild, and crust. Free — looking never costs energy. Left-drag spins the planet. Shift-drag (or middle-mouse) slides it aside so the map can breathe; Home recenters.',
  },
  core: {
    title: 'Core sample',
    body: 'Drill a rock column and open it in Lab. Shows strata, proxies (δ¹³C, pH), and anything disasters wrote into the rock. Free.',
  },
  icecore: {
    title: 'Ice core',
    body: 'Sample ice for trapped atmosphere — CO₂ history and isotope hints. Needs ice on the cell. Free.',
  },
  seedGuild: {
    title: 'Seed guild',
    body: 'Plant a metabolism from the Play → Life menu (cyanobacteria, methanogens, etc.). The planet can refuse if light, water, oxidants, or UV are wrong — and will say why.',
  },
  seed: {
    title: 'Seed class',
    body: 'Legacy seed: paints whatever morphology rung is currently unlocked (microbe → mammal ladder). Prefer Seed guild for chemistry-aware play.',
  },
  refuge: {
    title: 'Refuge',
    body: 'Mark a region where extinction pressure is suppressed. Life outside can still die — useful for preserves, and for watching the world fail around them.',
  },
  raise: {
    title: 'Thicken crust',
    body: 'Adds crustal thickness; elevation rises and then settles via isostasy. Right-drag to stroke a range. Mountains erode into plateaus over time instead of sticking forever.',
  },
  lower: {
    title: 'Thin crust',
    body: 'Thins the crust so the surface can subside — rifts, basins, drowned shelves. Right-drag to carve. The model may flood low spots.',
  },
  plume: {
    title: 'Mantle plume',
    body: 'Drops a hotspot fixed in the mantle frame. As plates drift, you should eventually get an age-graded volcanic chain — delayed payoff on Myr timescales.',
  },
  plate: {
    title: 'Plate pole',
    body: 'Redirects that plate’s Euler pole and speeds its spin. The next tens of millions of years of geography become a consequence of this gesture.',
  },
  river: {
    title: 'Carve river',
    body: 'Cuts a downhill channel and hands it to the flow model. The simulation may keep or abandon it depending on whether the path makes sense.',
  },
  albedo: {
    title: 'Paint albedo',
    body: 'Whiten or darken the surface. Crude climate lever — the same idea as Daisyworld. Ice–albedo feedback can runaway from a small patch.',
  },
  solar: {
    title: 'Solar ±',
    body: 'Nudge insolation. Ocean thermal inertia answers over decades; ice sheets over millennia. Keys + / − also work.',
  },
  co2: {
    title: 'CO₂ inject',
    body: 'Adds greenhouse gas. Warming and acidification follow; silicate weathering will oppose it on a ~10⁵ yr clock. The receipt names that delay.',
  },
  o2: {
    title: 'O₂ inject',
    body: 'Raises free oxygen. Helps aerobes; can hurt anaerobes. On deep-time worlds this is usually something life invents, not something you dump.',
  },
  shade: {
    title: 'L1 shade',
    body: 'A solar shade that removes a slice of incoming light with no chemistry. Clean experimental control — one term in the energy budget.',
  },
  aerosol: {
    title: 'Aerosol',
    body: 'Stratospheric sulphate injection. Peaks after a season and fades over a couple of years — geoengineering with a shape, not a permanent slider.',
  },
  weather: {
    title: 'Local rain / seed storm',
    body: 'Tries to birth a named cyclone where SST and shear allow (most seeds fail — honest). Otherwise paints a valley-scale rain patch. Watch storm cells darken the sea and raise surge on coasts — worse at springs.',
  },
  meteor: {
    title: 'Meteor',
    body: 'Parameterised impact (mass, speed, angle). Chain: thermal pulse → ejecta → tsunami → dust winter → recovery. Aftermath is the content.',
  },
  volcano: {
    title: 'Force erupt',
    body: 'Triggers a volcano: ash, local uplift, sulphate aerosol. Short-term cooling, long-term CO₂ if it keeps cooking.',
  },
  lip: {
    title: 'LIP',
    body: 'Large igneous province — a multi-million-year flood basalt. Kills mostly via volatiles cooked on the way up, not the lava itself.',
  },
  quake: {
    title: 'Quake',
    body: 'Releases strain and can launch a tsunami. Local relief change; useful near coasts and plate boundaries.',
  },
  plague: {
    title: 'Pathogen',
    body: 'Releases a disease with host range and virulence. High virulence burns out; it can jump clades. Precision extinction, not a magic delete.',
  },
  ice: {
    title: 'Ice meteor',
    body: 'Dumps cold and ice — right-drag to smear. Adds a little water vapour. Cheap way to nudge toward glaciation.',
  },
  tilt: {
    title: 'Tilt axis',
    body: 'Change obliquity. Cyan = spin axis, gold = ecliptic — the angle between them is the tilt. Seasons and polar ice respond over 10⁴–10⁵ years.',
  },
  spin: {
    title: 'Spin ±',
    body: 'Lengthen or shorten the day. Faster spin → more, narrower wind bands (Rhines). Watch the synoptic chart and cloud banding reorganise — not just wind speed.',
  },
  moon: {
    title: 'Moon',
    body: 'Toggle a Luna-mass moon. With a moon: stable axis, spring–neap tides, breathing intertidal. Strip it → solar-only range, obliquity wanders. Roche floor clamps distance.',
  },
  buster: {
    title: 'Theia impact',
    body: 'Irreversible. Hold to commit — magma ocean, sterile surface, possible moon. Not a joke button; the ring fill is the warning.',
  },
};

export const PLAY_TIPS = {
  guildsel: {
    title: 'Life type',
    body: 'Only used by Seed guild. Chooses which metabolism you plant — e.g. cyanobacteria make oxygen; methanogens need no O₂. Other tools ignore this menu.',
  },
  timeribbon: {
    title: 'Time ribbon',
    body: 'When: pick Present or From origin (regenerates the world). Speed: years per tick — Adaptive follows the era. ⏸ pause · ⏩ fast frames until an event. Keys: Space , .',
  },
  brushmask: {
    title: 'Only paint on…',
    body: 'Restricts the brush to land, ocean, dry cells, ice, etc. Turns blunt tools into precise ones without adding new tools.',
  },
  brushsnap: {
    title: 'Snap to feature',
    body: 'Pulls the brush toward a coastline, plate boundary, river, or biome edge — most geological acts are relative to something the model already knows.',
  },
  brushhard: {
    title: 'Brush edge',
    body: 'Soft = feathered falloff. Hard = sharper disk. Brush radius in kilometres follows how close you are to the planet.',
  },
  orbitguides: {
    title: 'Axis guides',
    body: 'Cyan line = spin axis (day poles). White ring = equator. Gold ring = ecliptic. The angle between cyan and gold is obliquity — what Tilt axis changes.',
  },
  godundo: {
    title: 'Undo stroke',
    body: 'Reverts the last direct edit (heights, life paint, etc.). Years that already passed stay passed — you can take back a gesture, not deep time. Ctrl+Z.',
  },
  godwatch: {
    title: 'Watch mode',
    body: 'Hides the dock and local panel. Planet, sound, and the time ribbon stay — for leaving it running.',
  },
  godbookmark: {
    title: 'Bookmark',
    body: 'Marks this age and state in your list so you can remember when something mattered. (Jump-back to full state is still light.)',
  },
  localSeek: {
    title: 'Track',
    body: 'Life: a slow tour — the globe turns to a new kind of place (coast, reef, bloom, night), then the map fades in. Stay holds this patch. Click the map to pin; A hunts again.',
  },
  scenariosel: {
    title: 'Challenge',
    body: 'Optional goals with limits — climate levers only, save a snowball, hands-off deep time. Teaches the coupled systems without reading the briefs.',
  },
  scenariostart: {
    title: 'Start challenge',
    body: 'Reseeds into that scenario’s world and objective. Scoring reports what the world became, not a leaderboard points total.',
  },
  genesisname: {
    title: 'World name',
    body: 'Travels into the chronicle and exports. Turns “the simulation” into your planet.',
  },
  genesisseed: {
    title: 'Seed',
    body: 'RNG seed for terrain and chance. Same seed + same settings → same world. Leave blank to roll one.',
  },
  genesispreset: {
    title: 'What-if preset',
    body: 'One-parameter Earth variants: no Moon, high O₂, no plates, dimmer star, start at Cambrian, etc.',
  },
  genesisrand: {
    title: 'Random habitable',
    body: 'Surprise me, but keep insolation, water, and field in a livable band. Constrained randomness, not pure dice.',
  },
  genesisgo: {
    title: 'Create world',
    body: 'Author a new planet from the name, seed, and preset, then drop you into play.',
  },
  dailyseed: {
    title: 'Today’s world',
    body: 'One shared seed from the UTC date — everyone who clicks today gets the same starting planet.',
  },
  godshelf: {
    title: 'Save world',
    body: 'Stores this run on a local shelf so you can keep several planets, not just the one on screen.',
  },
  godshare: {
    title: 'Copy link-seed',
    body: 'Copies a compact string (genesis + recent interventions) you can paste to reproduce or continue a world.',
  },
  budget: {
    title: 'Energy mode',
    body: 'Free: tools are unlimited. Observe: looking is free, acting costs. Budget: SimEarth-style scarcity — income rises with a healthy biosphere.',
  },
  autopilot: {
    title: 'Gaia',
    body: 'Autopilot agent that nudges solar/CO₂ when the climate drifts, and logs why. You can still override it.',
  },
  pause: {
    title: 'Pause',
    body: 'Same control as ⏸ on the time ribbon. Space also toggles. Does not change years-per-tick.',
  },
  newseed: {
    title: 'Reseed',
    body: 'Keep this planet type, roll a new terrain seed. Same settings, different mountains.',
  },
  catbtn: {
    title: 'Worlds',
    body: 'The planet picker — invented types (Earth, Vermis…) and real bodies (Europa, TRAPPIST-1 e). Not the World dock tab, which is this run’s modes.',
  },
  catprev: {
    title: 'Previous body',
    body: 'Step backward through the catalogue. Key [',
  },
  catnext: {
    title: 'Next body',
    body: 'Step forward through the catalogue. Key ]',
  },
  worldchip: {
    title: 'This planet',
    body: 'Name and mode of the world on screen. Click to open the Worlds picker.',
  },
  docktoggle: {
    title: 'Dock',
    body: 'Collapse or expand the left panel. Watch mode hides it entirely; the time ribbon stays.',
  },
  vrbtn: {
    title: 'VR',
    body: 'Enter a headset session when WebXR is available. The same sim, in reach.',
  },
  opacity: {
    title: 'Surface opacity',
    body: 'Fade the crust so overlays, clouds, and the interior cut can be read. Ghost 40% is a preset.',
  },
  grid: {
    title: 'Cell grid',
    body: 'Draws the cube-sphere mesh. Useful when inspecting a single cell; off for a clean globe.',
  },
  xray: {
    title: 'X-ray cut',
    body: 'Hides a slice of the sphere so core / mantle / ice-shell layers show. Pair with Rock → Core.',
  },
  xrayAmt: {
    title: 'Cut depth',
    body: 'How far the slice eats into the globe. Shallow = crust peek; deep = inner core.',
  },
  viewClear: {
    title: 'Clear view',
    body: 'Opacity 100%, grid off. Does not change the overlay — that’s Layers → None.',
  },
  viewGhost: {
    title: 'Ghost 40%',
    body: 'Drops opacity so a field overlay reads through the surface. Overlay still chosen in Layers.',
  },
  viewOrbitGuides: {
    title: 'Axis guides',
    body: 'Cyan = spin axis, white = equator, gold = ecliptic. The angle between cyan and gold is tilt.',
  },
  simN: {
    title: 'Sim cells',
    body: 'Climate, life, and the map all run on this grid. Changing N regenerates the world. Bigger is slower.',
  },
  globeSubd: {
    title: 'Globe quads',
    body: 'Visual mesh only — the sim does not get more cells. Instant. At high N the mesh auto-caps.',
  },
  orreryTable: {
    title: 'Orrery table',
    body: 'Shelf of saved worlds as a 3D table. Click a globe to load it. Play → Genesis → Save world fills the shelf.',
  },
  export: {
    title: 'Chronicle',
    body: 'Download this run’s era log as markdown — what happened, not a screenshot.',
  },
  labRefresh: {
    title: 'Refresh instruments',
    body: 'Redraw Lab charts from the current world. They already tick; use this after a big jump.',
  },
  labPaper: {
    title: 'Paper',
    body: 'Export a short scientific-paper draft of this world (methods, figures, chronicle) as markdown.',
  },
  labSave: {
    title: 'Save file',
    body: 'Download a JSON snapshot you can reload. Shelf (Play → Genesis) keeps worlds inside the app instead.',
  },
  labFinale: {
    title: 'Finale',
    body: 'Write an ending artefact from how this world actually died or settled — not a score screen.',
  },
  labPng: {
    title: 'PNG',
    body: 'Export the first Lab chart as a PNG. Useful for a paper figure or a postcard.',
  },
  labDual: {
    title: 'Dual',
    body: 'Dev check: run 24 ticks in a worker and compare hashes. Not a play control.',
  },
  catsort: {
    title: 'Sort bodies',
    body: 'Catalogue order, nearest to us, easiest to observe, or fewest assumed numbers.',
  },
  catcsv: {
    title: 'CSV import',
    body: 'Replace the body list from a NASA-style table. Types (Earth, Vermis…) stay in the app.',
  },
  climDay: {
    title: 'Day length',
    body: 'Rotation period vs Earth. Faster spin → more, narrower wind bands. Same lever as the Spin± tool.',
  },
  climTilt: {
    title: 'Tilt (obliquity)',
    body: 'Angle between spin axis and orbit. 0° = no seasons; 90° = one pole in the sun for half the year.',
  },
  climSeason: {
    title: 'Season phase',
    body: 'Where you are in the orbit. Moves the ITCZ and which pole is in daylight. Does not change year length.',
  },
  climMoonOn: {
    title: 'Moon',
    body: 'Luna-mass moon on/off. With a moon: spring–neap tides and a steadier axis. Same idea as the Moon tool.',
  },
  climMoonMass: {
    title: 'Moon mass',
    body: 'Heavier moon → stronger tides and a more locked axis. 1.00 M is Luna.',
  },
  climMoonDist: {
    title: 'Moon distance',
    body: 'Closer = huge tides (Roche floor ~0.38). Phobos-close moons do not last.',
  },
  rockHeat: {
    title: 'Mantle heat',
    body: 'Internal heat budget. Wakes volcanoes and plate vigor. Not a surface-temperature slider.',
  },
  rockMag: {
    title: 'Magnetic field',
    body: 'Dynamo strength. Paints aurora and slows atmospheric escape. Comes from core × heat × spin.',
  },
  stormGenesis: {
    title: 'Genesis',
    body: 'Chance a warm basin tries to organise on its own. 0% = only you seed. Default is rare (~8%).',
  },
  stormStrict: {
    title: 'Strict',
    body: 'How often a seed is allowed to die. Easy almost always works. Honest/harsh need a real basin — SST, shear, moisture.',
  },
  stormSize: {
    title: 'Size',
    body: 'How far the rain shield and overlay core spread. Does not change wind physics, only the storm’s footprint.',
  },
  stormVigor: {
    title: 'Vigor',
    body: 'How hard a storm intensifies over warm water. Landfall still guts it.',
  },
};

/** Sub-desks inside each dock tab. */
export const SUITE_TIPS = {
  tools: {
    verbs: { title: 'Verbs', body: 'The ten you use constantly — inspect, seed, raise, strike. Right-click the planet after picking one.' },
    more: { title: 'More', body: 'Secondary verbs: disasters, chemistry, climate brushes. Same click rules as Verbs.' },
    station: { title: 'Station', body: 'Readouts for this cell and the globe — not tools. Inspect left-drags to spin. Shift-drag parks the globe.' },
  },
  god: {
    aim: { title: 'Life', body: 'Which metabolism Seed guild plants, plus undo / watch / bookmark.' },
    brush: { title: 'Brush', body: 'Mask and snap so Raise / Lower / Ice only hit land, coasts, plate edges, etc.' },
    challenge: { title: 'Challenge', body: 'Optional goals with limits. Teaches the coupled systems; skip if you just want a sandbox.' },
    genesis: { title: 'Genesis', body: 'Author a named variant — seed, what-if preset, today’s world. Saves onto the local shelf.' },
  },
  view: {
    look: { title: 'Look', body: 'How see-through the crust is, and whether the cell grid is drawn. Shift-drag slides the globe; Home puts it back.' },
    layers: { title: 'Layers', body: 'Paint one field on the globe. Hover a button for what the colours mean.' },
    slice: { title: 'Slice', body: 'X-ray cut through the globe. Pair with Rock → Core on ice-shell worlds.' },
    guides: { title: 'Guides', body: 'Spin axis / equator / ecliptic, plus the keyboard cheat-sheet.' },
  },
  lab: {
    all: { title: 'All', body: 'Every instrument card. The other desks filter this same list.' },
    tower: { title: 'Tower', body: 'Redox ladder and Gaia — who is eating what, and whether the planet is self-regulating.' },
    curves: { title: 'Curves', body: 'Time series: temperature, gases, diversity. The Keeling-style plots.' },
    survey: { title: 'Survey', body: 'Maps and spectra — cores you have taken, transit sketch, Whitaker biomes.' },
    notes: { title: 'Notes', body: 'Model limits and glossary. What this sim will not pretend to know.' },
  },
  sandbox: {
    modes: { title: 'Modes', body: 'Energy (Free / Observe / Budget), Gaia autopilot, and grid resolution.' },
    archive: { title: 'Archive', body: 'Orrery table of shelf worlds, and a markdown chronicle export.' },
  },
};

export const RIBBON_TIPS = {
  era: {
    title: 'Era',
    body: 'When the world starts. Present vs From origin regenerates Earth. Not the same as clock speed below.',
  },
  rate: {
    title: 'Years per tick',
    body: 'How much time one sim step advances. Adaptive follows the era (Myr in the Hadean, years in the Holocene). Keys , .',
  },
  pause: {
    title: 'Pause',
    body: 'Freeze the clock. Same as Pause in the top bar. Space.',
  },
  slower: { title: 'Slower', body: 'One step coarser on the years-per-tick list. Key ,' },
  faster: { title: 'Faster', body: 'One step finer / faster on the years-per-tick list. Key .' },
  ff: {
    title: 'Fast frames',
    body: 'Run more frames per second until something notable happens. Does not change years per tick.',
  },
  mode: {
    title: 'Run mode',
    body: 'Holocene Earth, deep-time Earth, or an alien/catalogue world. Decides who owns life and how fast the clock may go.',
  },
  track: {
    title: 'Deep-time track',
    body: 'Hadean → Phanerozoic. Needle is now. On Holocene Earth this is a legend; the clock itself stays in years.',
  },
};

export function tipForTool(id) {
  return TOOL_TIPS[id] || null;
}

export function tipForId(id) {
  return PLAY_TIPS[id] || TOOL_TIPS[id] || null;
}
