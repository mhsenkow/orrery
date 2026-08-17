/** Diegetic instruments — core sampler, curves, redox gauge, paper export.
 *  Backlog items 181–192 (partial UI + data). */

import { NC, AREA, DIR } from '../sphere.js';
import { formatAge, ageYrToMaBP } from './time.js';
import { GUILDS } from './redox.js';
import { BIOMES } from './ecology.js';
import { TRAITS } from './evolve.js';
import { UNIT_MAP } from './carbon.js';
import { whyDidThisHappen } from '../chronicle.js';
import { rngOf } from './rng.js';

const ROCK_NAMES = {
  0: 'basalt',
  1: 'granite',
  2: 'sediment',
  3: 'metamorphic',
  4: 'banded iron',
  5: 'impact ejecta',
  6: 'coal measure',
  7: 'glacial till',
};

/** Drill a cell and read deposited strata. Item 183. */
export function coreSample(W, cell) {
  const layers = [];
  const age = W.age?.[cell] ?? 0;
  const rock = W.rock?.[cell] ?? 0;
  layers.push({
    depth: 0,
    name: ROCK_NAMES[rock] || `rock-${rock}`,
    ageMyr: age,
    note: W.h[cell] >= W.seaLevel ? 'continental crust' : 'oceanic crust',
  });
  if (W.bifRock?.[cell] > 0.05) {
    layers.push({
      depth: 0.1,
      name: 'banded iron formation',
      ageMyr: Math.max(1800, ageYrToMaBP(W.ageYr)),
      note: `Fe deposit ${(W.bifRock[cell] * 100) | 0}%`,
    });
  }
  if (W.ejecta?.[cell] > 0.05) {
    layers.push({
      depth: 0.05,
      name: 'impact ejecta / iridium anomaly',
      ageMyr: ageYrToMaBP(W.ageYr),
      note: `ejecta ${(W.ejecta[cell] * 100) | 0}%`,
    });
  }
  if (W.carbon?.coal > 0.01 && W.h[cell] >= W.seaLevel && W.life[cell] > 0.3) {
    layers.push({ depth: 0.2, name: 'coal measure', ageMyr: 300, note: 'Carboniferous-window burial' });
  }
  if (W.stromatolite?.[cell] > 0.1) {
    layers.push({
      depth: 0.02,
      name: 'stromatolite laminate',
      ageMyr: ageYrToMaBP(W.ageYr),
      note: `mat ${(W.stromatolite[cell] * 100) | 0}%`,
    });
  }
  if (W.fossils?.[cell]?.length) {
    for (const f of W.fossils[cell].slice(0, 4)) {
      layers.push({
        depth: 0.15 + rngOf(W, 'rngViz')() * 0.1,
        name: `fossil: ${f.name}`,
        ageMyr: ageYrToMaBP(f.ageYr),
        note: f.reason || 'burial',
      });
    }
  }
  if (W.ice[cell] > 0.4) {
    layers.push({ depth: -0.01, name: 'glacial till / ice', ageMyr: 0, note: `ice ${W.ice[cell].toFixed(2)}` });
  }
  layers.sort((a, b) => a.depth - b.depth);
  return {
    cell,
    lat: DIR[cell * 3 + 1],
    elev: W.h[cell],
    biome: W.biome ? BIOMES[W.biome[cell]] : '—',
    layers,
    proxies: W.carbon ? {
      d13C: W.carbon.d13C,
      d18O: W.carbon.d18O,
      d34S: W.carbon.d34S,
      sr87: W.carbon.sr87,
      pH: W.carbon.surfacePH,
    } : null,
  };
}

/** Ice core with trapped air. Item 184. */
export function iceCore(W, cell) {
  if (W.ice[cell] < 0.25) return { ok: false, reason: 'insufficient ice' };
  const hist = W.keelingHistory || [];
  const samples = [];
  const n = Math.min(12, hist.length);
  for (let i = 0; i < n; i++) {
    const h = hist[hist.length - 1 - i * Math.max(1, (hist.length / n) | 0)];
    if (!h) continue;
    samples.push({
      ageYr: h.t,
      age: formatAge(h.t),
      co2: h.co2,
      d13C: h.d13C,
      d18O: W.carbon?.d18O ?? 0,
    });
  }
  return {
    ok: true,
    cell,
    iceFrac: W.ice[cell],
    samples,
    note: 'δ¹⁸O tracks ice volume / temperature; bubbles hold atmosphere at deposition',
  };
}

/** Sepkoski-style diversity curve points. Item 185. */
export function diversityCurve(W) {
  const hist = W.tree?.diversityHistory || [];
  return hist.map((p) => ({
    t: p.t,
    age: formatAge(p.t),
    maBP: ageYrToMaBP(p.t),
    n: p.n,
  }));
}

/** Keeling curve (CO₂ vs time). Item 186. */
export function keelingCurve(W) {
  return (W.keelingHistory || []).map((p) => ({
    t: p.t,
    age: formatAge(p.t),
    co2ppm: p.co2 * 1e6,
    d13C: p.d13C,
  }));
}

/** Whittaker diagram points for land cells. Item 187. */
export function whitakerPoints(W, maxPts = 400) {
  const pts = [];
  const step = Math.max(1, (NC / maxPts) | 0);
  for (let c = 0; c < NC; c += step) {
    if (W.h[c] < W.seaLevel) continue;
    const tC = (W.temp[c] - 0.5) * 80 + 15;
    const ppt = W.moist[c] * 2000;
    pts.push({
      tC,
      ppt,
      biome: W.biome ? BIOMES[W.biome[c]] : '—',
      life: W.life[c],
    });
  }
  return pts;
}

/** Redox tower gauge occupancy. Item 189. */
export function redoxGauge(W) {
  return GUILDS.map((g) => ({
    id: g.id,
    donor: g.donor,
    acceptor: g.acceptor,
    yield: g.yield,
    mean: W.guilds?.[g.id] || 0,
    color: g.color,
    active: (W.guilds?.[g.id] || 0) > 0.01,
  }));
}

/** Observe own planet as exoplanet transmission sketch. Item 188. */
export function transitSpectrum(W) {
  const g = W.gases;
  const R = W.rule || {};
  const H = R.scaleHeightKm || 8;
  const scale = Math.max(0.2, Math.min(12, H / 8));
  const spots = R.observed?.result === 'ambiguous' || /gj 486/i.test(R.name || '');
  const noise = () => (rngOf(W, 'rngViz')() - 0.5) * (0.15 + (spots ? 0.25 : 0));
  const lines = [
    { species: 'H2O', wl: 1.4, depth: clamp01(g.H2O * 8 * scale + noise()) },
    { species: 'CO2', wl: 4.3, depth: clamp01(g.CO2 * 40 * scale + noise()) },
    { species: 'CH4', wl: 3.3, depth: clamp01((g.CH4 || 0) * 200 * scale + noise()) },
    { species: 'O2', wl: 0.76, depth: clamp01(g.O2 * 3 * scale + noise() * 0.5) },
    { species: 'O3', wl: 0.6, depth: clamp01(W.ozone * 0.8 + noise() * 0.3) },
  ];
  const ambiguous = spots || (g.O2 > 0.05 && lines.find((l) => l.species === 'O2').depth < 0.25);
  return {
    lines,
    disequilibrium: W.disequilibrium || 0,
    scaleHeightKm: H,
    note: spots
      ? 'Starspot contamination — water vs unocculted spots (GJ 486 b lesson)'
      : ambiguous
        ? 'O₂ line near noise floor — detection ambiguous'
        : `Transmission · H ≈ ${H.toFixed(0)} km`,
  };
}

/** Phylogeny summary for the holdable tree. Item 182. */
export function phylogenyView(W) {
  if (!W.tree) return { nodes: [], living: 0 };
  const nodes = W.tree.nodes.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    name: n.name,
    birth: formatAge(n.birth),
    death: n.death != null ? formatAge(n.death) : null,
    pop: n.pop,
    traits: {
      mass: n.traits[TRAITS.bodyMass],
      trophic: n.traits[TRAITS.trophic],
      tOpt: n.traits[TRAITS.tOpt],
      o2: n.traits[TRAITS.o2Affinity],
    },
    substitutions: n.substitutions | 0,
  }));
  return {
    nodes,
    living: W.tree.living.length,
    convergences: W.tree.convergences.slice(-5),
    extinctions: W.tree.extinctions.slice(-8),
  };
}

/** Diff two serialized runs. Item 190. */
export function diffRuns(a, b) {
  const out = [];
  if (a.seed !== b.seed) out.push(`seed ${a.seed} → ${b.seed}`);
  if (Math.abs((a.ageYr || 0) - (b.ageYr || 0)) > 1e6) {
    out.push(`age diverged: ${formatAge(a.ageYr)} vs ${formatAge(b.ageYr)}`);
  }
  const ea = new Set((a.events || []).map((e) => e.label));
  const eb = new Set((b.events || []).map((e) => e.label));
  for (const x of ea) if (!eb.has(x)) out.push(`only A: ${x}`);
  for (const x of eb) if (!ea.has(x)) out.push(`only B: ${x}`);
  return out.slice(0, 40);
}

/** Full paper export. Item 192. */
export function exportPaper(W, chron) {
  const lines = [
    `# ${W.rule.name}: a planetary history`,
    '',
    `*Seed ${W.seed} · ${formatAge(W.ageYr)} · ${W.ics?.eon || ''} / ${W.ics?.period || ''}*`,
    '',
    '## Abstract',
    `Habitability ${(W.habitability * 100) | 0}%, inhabitance ${(W.inhabitance * 100) | 0}%. ` +
    `Disequilibrium biosignature ${(W.disequilibrium * 100) | 0}%. ` +
    `Gaia mode: ${W.gaiaMode || '—'}.`,
    '',
    '## Atmosphere',
    `- CO₂ ${(W.gases.CO2 * 1e6).toFixed(0)} ppm · O₂ ${(W.gases.O2 * 100).toFixed(1)}% · CH₄ ${((W.gases.CH4 || 0) * 1e6).toFixed(0)} ppm`,
    W.carbon ? `- δ¹³C ${W.carbon.d13C.toFixed(2)}‰ · δ¹⁸O ${W.carbon.d18O.toFixed(2)}‰ · pH ${W.carbon.surfacePH.toFixed(2)}` : '',
    '',
    '## Diversity',
    `- Living clades: ${W.tree?.living.length || 0} · Total nodes: ${W.tree?.nodes.length || 0}`,
    `- Mass extinction pulses: ${W._extinctionPulse || 0}`,
    '',
    '## Firsts',
  ];
  for (const m of Object.values(W.moments || {})) {
    lines.push(`- ${m.label} @ ${formatAge(m.ageYr)}`);
  }
  lines.push('', '## Eras');
  for (const e of chron.eras || []) {
    lines.push(`- **${e.name}** (${formatAge(e.start)} – ${formatAge(e.end)})`);
  }
  lines.push('', '## Extinctions');
  for (const x of (W.tree?.extinctions || []).slice(-15)) {
    lines.push(`- ${x.name} @ ${formatAge(x.t)} (${x.reason})`);
  }
  lines.push('', '## Units', '');
  for (const [k, v] of Object.entries(UNIT_MAP)) {
    lines.push(`- \`${k}\`: ${v.sim} → ${v.si} _(${v.note})_`);
  }
  lines.push('', '## Limits', 'See `briefs/model-limits.md`.', '');
  return lines.filter(Boolean).join('\n');
}

/** Causal trace wrapper. Item 191. */
export function explainEvent(chron, index) {
  const ev = chron.events[index];
  if (!ev) return null;
  return {
    event: ev,
    causes: whyDidThisHappen(chron, index),
    summary: ev.meta?.cause || ev.label,
  };
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Tiny sparkline as HTML. */
export function sparklineSVG(values, w = 180, h = 36, color = '#7dd6a0') {
  if (!values?.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<polyline fill="none" stroke="${color}" stroke-width="1.5" points="${pts}"/></svg>`;
}
