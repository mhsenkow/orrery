/** Hover tip copy — tools, play controls, dock chrome. */

export const TOOL_TIPS = {
  inspect: {
    title: 'Inspect',
    body: 'Click a cell to read elevation, temperature, moisture, life, guild, and crust. Free — looking never costs energy. Left-drag spins the planet.',
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
  timerate: {
    title: 'Clock speed',
    body: 'Years that pass per simulation tick — from seasons (1 yr) to geologic (10 Myr), or Adaptive which follows the era. Also on the deep-time ribbon; , / . to step.',
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
  godff: {
    title: 'Skip ahead',
    body: 'Runs the clock fast and stops on a first occurrence, state change, or extinction so you don’t miss the interesting beat.',
  },
  godwatch: {
    title: 'Watch mode',
    body: 'Hides the dock and local panel. Planet, sound, clock — for leaving it running. Click again to get the UI back.',
  },
  godbookmark: {
    title: 'Bookmark',
    body: 'Marks this age and state in your list so you can remember when something mattered. (Jump-back to full state is still light.)',
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
  deeptime: {
    title: 'Deep time',
    body: 'Start at formation (~4.57 Ga) with adaptive ticks from Myr to years. Modern Earth mode stays near the present.',
  },
};

export function tipForTool(id) {
  return TOOL_TIPS[id] || null;
}

export function tipForId(id) {
  return PLAY_TIPS[id] || TOOL_TIPS[id] || null;
}
