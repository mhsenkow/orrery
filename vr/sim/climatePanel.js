/** Sky suite — Atmosphere, Storms, Coast, Compare desks.
 *  Live instruments + levers for the climate constructs you can see from orbit. */

import { clamp } from '../math.js';
import { W, chronLog } from '../world.js';
import { NC, DIR } from '../sphere.js';
import { setOrbit, setMoon } from './god/climate.js';
import { tideBudget, ROCHE_DISTANCE } from './tides.js';
import { circulationCellCount, windBandAt } from './wind.js';
import { synopticChartSVG } from './viz.js';
import { issueReceipt } from './god/receipt.js';
import { iconSVG } from './god/icons.js';
import { dynamoFromInterior } from './core.js';
import {
  seedStorm, steerStorm, stormDeskSnapshot, tropicalFavor, midlatFavor,
} from './storms.js';
import { coastDeskSnapshot, coastAtCell } from './coast.js';

let activeDesk = 'sky';
let selectedStormId = null;
/** @type {{ day: number, svg: string, label: string, cells: number, regime: string } | null} */
let compareA = null;
/** @type {{ day: number, svg: string, label: string, cells: number, regime: string } | null} */
let compareB = null;

/** Snapshot of everything the Sky desk shows. */
export function climateSnapshot(Wref = W) {
  const tide = tideBudget(Wref);
  const day = Wref.rotationPeriod || 1;
  const dayAbs = Math.abs(day);
  const cells = Wref._windCells || circulationCellCount(dayAbs);
  const tiltDeg = ((Wref.obliquity || 0) * 180) / Math.PI;
  const seasonDeg = (((Wref.season || 0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * (180 / Math.PI);
  const moon = Wref.moon && Wref.moon.mass > 0.05 ? Wref.moon : null;
  const meanCloud = meanField(Wref.clouds);
  const meanWind = meanWindSpeed(Wref);
  const wr = Wref.rule?.worldRecord;
  return {
    tide,
    day: dayAbs,
    daySigned: day,
    cells,
    regime: Wref._windRegime || '—',
    itczDeg: (Wref._itczLat || 0) * (180 / Math.PI),
    tiltDeg,
    seasonDeg,
    moon,
    moonIllum: Wref.moonIllum,
    meanCloud,
    meanWind,
    intertidalPct: (Wref.intertidalFrac || 0) * 100,
    meanPress: meanField(Wref.press),
    teqK: Wref.rule?.teqK ?? null,
    pressBar: Wref.rule?.surfacePressureBar ?? null,
    radiusEarth: Wref.rule?.radiusEarth ?? null,
    massEarth: Wref.rule?.massEarth ?? null,
    confidence: Wref.rule?.confidence ?? null,
    contested: Wref.rule?.contested ?? null,
    paramsNote: wr
      ? `${wr.name} · ${wr.radius?.v?.toFixed?.(2) ?? '—'} R⊕ · ${wr.mass?.v?.toFixed?.(2) ?? '—'} M⊕ · S=${wr.S?.v?.toPrecision?.(3) ?? '—'}`
      : null,
    springNote: tide.phase === 'springs'
      ? 'Syzygy — lunar + solar tides add'
      : tide.phase === 'neaps'
        ? 'Quadrature — tides partly cancel'
        : tide.phase === 'solar-only'
          ? 'No moon — solar tide only (~⅓ range)'
          : 'Between springs and neaps',
    spinNote: cells <= 1
      ? 'Slow rotator — one wide Hadley cell to the pole'
      : cells <= 3
        ? 'Earth-like three-cell banding'
        : cells <= 5
          ? 'Fast spin — extra narrow bands'
          : 'Jovian multi-band regime',
  };
}

function meanField(arr) {
  if (!arr?.length) return 0;
  let s = 0, n = 0;
  for (let i = 0; i < arr.length; i += 31) { s += arr[i]; n++; }
  return s / Math.max(1, n);
}

function meanWindSpeed(Wref) {
  if (!Wref.windU) return 0;
  let s = 0, n = 0;
  for (let i = 0; i < Wref.windU.length; i += 31) {
    s += Math.hypot(Wref.windU[i], Wref.windV?.[i] || 0);
    n++;
  }
  return s / Math.max(1, n);
}

/** Ellipse with star at a focus + HZ annulus. */
function orbitSvg(rule) {
  const rec = rule?.worldRecord;
  if (!rec || !(rec.a?.v > 0)) {
    if (rule?.freeFloater) return `<p class="god-note">No orbit — free-floating.</p>`;
    return '';
  }
  const a = rec.a.v;
  const e = Math.min(0.97, rec.e?.v || 0);
  const b = a * Math.sqrt(1 - e * e);
  const c = a * e;
  const hz = rule.star?.hz;
  const maxA = Math.max(a * (1 + e), hz?.outer || 0, 0.02);
  const Wsvg = 220, Hsvg = 120, pad = 12;
  const sx = (x) => pad + ((x + maxA) / (2 * maxA)) * (Wsvg - 2 * pad);
  const sy = (y) => Hsvg / 2 - (y / maxA) * (Hsvg / 2 - pad);
  const cx = sx(c), cy = sy(0);
  const rx = ((a) / (2 * maxA)) * (Wsvg - 2 * pad);
  const ry = ((b) / maxA) * (Hsvg / 2 - pad);
  let hzG = '';
  if (hz) {
    const ri = (hz.inner / maxA) * (Wsvg / 2 - pad);
    const ro = (hz.outer / maxA) * (Wsvg / 2 - pad);
    hzG = `<circle cx="${sx(0)}" cy="${sy(0)}" r="${Math.max(2, ro)}" fill="rgba(80,180,90,.12)" stroke="none"/>` +
      `<circle cx="${sx(0)}" cy="${sy(0)}" r="${Math.max(1, ri)}" fill="var(--ground, #0c0f16)" stroke="none"/>`;
  }
  const star = `<circle cx="${sx(0)}" cy="${sy(0)}" r="4" fill="#ffcc66"/>`;
  const planet = `<circle cx="${sx(a - c)}" cy="${sy(0)}" r="5" fill="#7fb0e0"/>`;
  return `<svg viewBox="0 0 ${Wsvg} ${Hsvg}" width="100%" height="90" aria-label="Orbit to scale">` +
    `${hzG}<ellipse cx="${cx}" cy="${cy}" rx="${Math.max(4, rx)}" ry="${Math.max(3, ry)}" fill="none" stroke="#6c7688" stroke-width="1.2"/>` +
    `${star}${planet}</svg>` +
    `<p class="god-note">a=${a.toPrecision(3)} AU · e=${e.toFixed(3)}` +
    (hz ? ` · HZ ${hz.inner.toFixed(3)}–${hz.outer.toFixed(3)} AU` : '') + `</p>`;
}

/** Per-world day/tilt limits from the attached world record (if any). */
function rangesForWorld() {
  return W.rule?.panelRanges || {
    dayMin: 0.15, dayMax: 40, day: 1,
    tiltMin: 0, tiltMax: 90, tilt: 23,
    locked: false, retro: false, disabledTilt: false, disabledDay: false,
  };
}

/** Apply day-length (spin) from panel. Signed: negative = retrograde. */
export function applyDayLength(day) {
  const ranges = rangesForWorld();
  if (ranges.disabledDay || ranges.locked) {
    const locked = ranges.day || W.rotationPeriod || 1;
    return { ok: false, day: locked, cells: circulationCellCount(Math.abs(locked)), locked: true };
  }
  const mag = clamp(Math.abs(day), ranges.dayMin || 0.15, ranges.dayMax || 40);
  const next = (day < 0 || ranges.retro) && day !== 0 ? -mag : mag;
  // Keep signed period on the rule; climate uses |period| for cell count
  const prev = W.rotationPeriod || 1;
  W.rotationPeriod = next;
  if (W.rule) W.rule.rotationPeriod = next;
  W._gpgpuDirty = true;
  const spin = Math.abs(next) || 1;
  if (W.interior && !W.rule?.magnetosphereLocked) {
    W.interior.dynamo = dynamoFromInterior(W.interior, spin);
    W.magnetosphere = W.interior.dynamo;
    if (W.rule) W.rule.magnetosphere = W.interior.dynamo;
  }
  const cells = circulationCellCount(spin);
  const label = next < 0 ? `−${mag.toFixed(2)}× retro` : `${mag.toFixed(2)}×`;
  issueReceipt({
    tool: 'spin',
    cell: 0,
    intent: 'Day length',
    expected: `Day ${prev.toFixed(2)}× → ${label} · ~${cells} cells/hem`,
  });
  chronLog(W.year, 'tool', 0, next, `Day → ${label} (${cells} bands)`);
  return { ok: true, day: next, cells };
}

/** Apply tilt degrees. Disabled on tidally locked worlds. */
export function applyTiltDeg(deg) {
  const ranges = rangesForWorld();
  if (ranges.disabledTilt || ranges.locked) {
    return setOrbit({ obliquity: 0 });
  }
  const max = ranges.tiltMax ?? 90;
  const rad = clamp(deg, 0, max) * Math.PI / 180;
  return setOrbit({ obliquity: rad });
}

/** Scrub seasonal phase (degrees of orbit). */
export function applySeasonDeg(deg) {
  W.season = (clamp(deg, 0, 360) * Math.PI) / 180;
  W._gpgpuDirty = true;
  return { ok: true, season: W.season };
}

/** Moon mass + distance from panel (0 mass strips). Soft = no day-length multiply. */
export function applyMoonParams(mass, distance, soft = true) {
  const m = clamp(mass, 0, 3);
  const d = clamp(distance, ROCHE_DISTANCE, 3);
  if (m < 0.05) return setMoon(0.02, 2.2, { soft });
  return setMoon(m, d, { soft });
}

function deskTab(id, icon, label, title) {
  return `<button type="button" class="clim-desk-tab" data-desk="${id}" title="${title}" aria-pressed="${id === 'sky' ? 'true' : 'false'}">${iconSVG(icon)}<span class="btn-label">${label}</span></button>`;
}

/** Build inner HTML for the climate pane (suite chrome + desk panels). */
export function climatePanelChrome() {
  return `
    <p class="god-lead">
      <b>Sky suite</b> — atmosphere, storms, coasts, and spin experiments you can read from orbit.
    </p>

    <div class="clim-desks" role="tablist" aria-label="Sky desks">
      ${deskTab('sky', 'sky', 'Sky', 'Circulation, moon, tides')}
      ${deskTab('storm', 'stormdesk', 'Storms', 'Seed and track cyclones')}
      ${deskTab('coast', 'coastdesk', 'Coast', 'Intertidal and flood risk')}
      ${deskTab('compare', 'compare', 'Compare', 'Freeze A/B synoptic')}
    </div>

    <div class="clim-desk on" data-desk-panel="sky" role="tabpanel">
      <div class="clim-strip" id="climStrip" aria-live="polite"></div>

      <div class="god-block clim-chart">
        <div class="god-h">${iconSVG('weather')}<span>Synoptic</span></div>
        <div id="climChart"></div>
        <p class="god-note" id="climChartNote">Pressure · wind barbs · ITCZ. Beyond ~2 weeks weather is not predictable in principle.</p>
      </div>

      <div class="god-block">
        <div class="god-h">${iconSVG('spin')}<span>Circulation</span></div>
        <div class="view-row">
          <label for="climDay" title="Rotation period vs Earth day">Day</label>
          <input type="range" id="climDay" min="15" max="800" value="100" step="5">
          <span class="val" id="climDayVal">1.00×</span>
        </div>
        <div class="view-row">
          <label for="climTilt" title="Obliquity">Tilt</label>
          <input type="range" id="climTilt" min="0" max="90" value="23" step="1">
          <span class="val" id="climTiltVal">23°</span>
        </div>
        <div class="view-row">
          <label for="climSeason" title="Orbital season phase">Season</label>
          <input type="range" id="climSeason" min="0" max="360" value="0" step="5">
          <span class="val" id="climSeasonVal">0°</span>
        </div>
        <p class="god-note" id="climSpinNote">Spin changes how many wind bands form — not just wind speed.</p>
        <div id="climOrbit" class="clim-orbit"></div>
      </div>

      <div class="god-block">
        <div class="god-h">${iconSVG('moon')}<span>Moon &amp; tides</span></div>
        <div class="view-row">
          <label for="climMoonOn">Moon</label>
          <input type="checkbox" id="climMoonOn" checked>
          <span class="val" style="text-align:left;flex:1" id="climMoonState">on</span>
        </div>
        <div class="view-row" id="climMoonMassRow">
          <label for="climMoonMass">Mass</label>
          <input type="range" id="climMoonMass" min="5" max="200" value="100" step="5">
          <span class="val" id="climMoonMassVal">1.00 M</span>
        </div>
        <div class="view-row" id="climMoonDistRow">
          <label for="climMoonDist">Dist</label>
          <input type="range" id="climMoonDist" min="38" max="250" value="100" step="2">
          <span class="val" id="climMoonDistVal">1.00</span>
        </div>
        <p class="god-note" id="climTideNote">Spring / neap from Moon–Sun alignment. Roche floor ~0.38.</p>
      </div>

      <div class="god-block">
        <div class="god-h">${iconSVG('tabview')}<span>See it</span></div>
        <div class="tools clim-overlays" id="climOverlays">
          <button type="button" data-overlay="none">${iconSVG('inspect')}<span class="btn-label">Clear</span></button>
          <button type="button" data-overlay="press">${iconSVG('weather')}<span class="btn-label">Pressure</span></button>
          <button type="button" data-overlay="wind">${iconSVG('spin')}<span class="btn-label">Wind</span></button>
          <button type="button" data-overlay="storm">${iconSVG('stormdesk')}<span class="btn-label">Storms</span></button>
          <button type="button" data-overlay="tide">${iconSVG('moon')}<span class="btn-label">Tide</span></button>
          <button type="button" data-overlay="intertidal">${iconSVG('flats')}<span class="btn-label">Intertidal</span></button>
        </div>
        <p class="god-note">Overlays paint the globe. Inspect a cell for station readout.</p>
      </div>

      <div class="clim-explain" id="climExplain"></div>
    </div>

    <div class="clim-desk" data-desk-panel="storm" role="tabpanel" hidden>
      <div class="clim-strip" id="stormStrip" aria-live="polite"></div>
      <div class="god-block">
        <div class="god-h">${iconSVG('stormdesk')}<span>Active track</span></div>
        <div id="stormList" class="clim-list"></div>
        <p class="god-note" id="stormNote">Toy cyclones — tropical eyes need warm ocean; midlat commas ride convergence.</p>
      </div>
      <div class="god-block">
        <div class="god-h">${iconSVG('seedstorm')}<span>Seed &amp; steer</span></div>
        <div class="tools clim-actions" id="stormActions">
          <button type="button" id="stormSeedAt">${iconSVG('seedstorm')}<span class="btn-label">Seed at inspect</span></button>
          <button type="button" id="stormSeedBest">${iconSVG('weather')}<span class="btn-label">Seed best basin</span></button>
          <button type="button" id="stormSteerW" title="Nudge westward">${iconSVG('spin')}<span class="btn-label">← W</span></button>
          <button type="button" id="stormSteerE" title="Nudge eastward">${iconSVG('spin')}<span class="btn-label">E →</span></button>
          <button type="button" id="stormSteerN" title="Nudge poleward">${iconSVG('tilt')}<span class="btn-label">Pole</span></button>
          <button type="button" id="stormOverlay">${iconSVG('stormdesk')}<span class="btn-label">Storm overlay</span></button>
        </div>
        <p class="god-note">Most seeds fail — favour ≠ certainty. Surge is worst when intensity meets springs.</p>
      </div>
      <div class="clim-callout" id="stormCallout"></div>
    </div>

    <div class="clim-desk" data-desk-panel="coast" role="tabpanel" hidden>
      <div class="clim-strip" id="coastStrip" aria-live="polite"></div>
      <div class="god-block">
        <div class="god-h">${iconSVG('surge')}<span>Flood desk</span></div>
        <div class="clim-meter" id="coastMeter"></div>
        <p class="god-note" id="coastNote">Harbours prefer mid range; flats need large range + gentle slope.</p>
      </div>
      <div class="god-block">
        <div class="god-h">${iconSVG('coastdesk')}<span>Settlements</span></div>
        <div id="coastCities" class="clim-list"></div>
      </div>
      <div class="god-block">
        <div class="god-h">${iconSVG('flats')}<span>See it</span></div>
        <div class="tools clim-overlays" id="coastOverlays">
          <button type="button" data-overlay="tide">${iconSVG('moon')}<span class="btn-label">Tide</span></button>
          <button type="button" data-overlay="intertidal">${iconSVG('flats')}<span class="btn-label">Intertidal</span></button>
          <button type="button" data-overlay="storm">${iconSVG('surge')}<span class="btn-label">Surge</span></button>
        </div>
      </div>
    </div>

    <div class="clim-desk" data-desk-panel="compare" role="tabpanel" hidden>
      <p class="god-note" style="margin-top:0">Freeze a synoptic at one day length, change spin, capture B — see how banding reorganises.</p>
      <div class="god-block">
        <div class="god-h">${iconSVG('compare')}<span>Spin experiment</span></div>
        <div class="view-row">
          <label for="cmpDay">Day</label>
          <input type="range" id="cmpDay" min="15" max="800" value="100" step="5">
          <span class="val" id="cmpDayVal">1.00×</span>
        </div>
        <div class="tools clim-actions" id="cmpActions">
          <button type="button" id="cmpFreezeA">${iconSVG('freeze')}<span class="btn-label">Freeze A</span></button>
          <button type="button" id="cmpCaptureB">${iconSVG('compare')}<span class="btn-label">Capture B</span></button>
          <button type="button" id="cmpClear">${iconSVG('inspect')}<span class="btn-label">Clear</span></button>
        </div>
      </div>
      <div class="clim-compare" id="cmpPanels">
        <div class="clim-compare-pane">
          <div class="clim-compare-h" id="cmpAH">A — empty</div>
          <div id="cmpAChart" class="clim-compare-chart"></div>
        </div>
        <div class="clim-compare-pane">
          <div class="clim-compare-h" id="cmpBH">B — empty</div>
          <div id="cmpBChart" class="clim-compare-chart"></div>
        </div>
      </div>
      <p class="god-note" id="cmpNote">Day length sets Rhines banding — not only wind speed.</p>
    </div>
  `;
}

function setDesk(id) {
  activeDesk = id;
  document.querySelectorAll('.clim-desk-tab').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.desk === id ? 'true' : 'false');
  });
  document.querySelectorAll('.clim-desk').forEach((p) => {
    const on = p.dataset.deskPanel === id;
    p.classList.toggle('on', on);
    p.hidden = !on;
  });
}

function snapFrame(label) {
  const day = W.rotationPeriod || 1;
  const cells = W._windCells || circulationCellCount(day);
  return {
    day,
    cells,
    regime: W._windRegime || '—',
    label,
    svg: synopticChartSVG(W, 140, 100),
  };
}

function renderCompare() {
  const aH = document.getElementById('cmpAH');
  const bH = document.getElementById('cmpBH');
  const aC = document.getElementById('cmpAChart');
  const bC = document.getElementById('cmpBChart');
  if (aH) aH.textContent = compareA
    ? `A · day ${compareA.day.toFixed(2)}× · ${compareA.cells} cells · ${compareA.regime}`
    : 'A — empty';
  if (bH) bH.textContent = compareB
    ? `B · day ${compareB.day.toFixed(2)}× · ${compareB.cells} cells · ${compareB.regime}`
    : 'B — empty';
  if (aC) aC.innerHTML = compareA?.svg || '';
  if (bC) bC.innerHTML = compareB?.svg || '';
  const note = document.getElementById('cmpNote');
  if (note) {
    if (compareA && compareB) {
      const dCells = compareB.cells - compareA.cells;
      note.textContent = dCells === 0
        ? `Same cell count (${compareA.cells}) — banding shape may still differ`
        : `Δ cells ${dCells > 0 ? '+' : ''}${dCells} (${compareA.cells} → ${compareB.cells}) · spin reorganised the atmosphere`;
    } else if (compareA) {
      note.textContent = 'A frozen — scrub Day, then Capture B';
    } else {
      note.textContent = 'Day length sets Rhines banding — not only wind speed.';
    }
  }
}

function findBestStormCell() {
  let best = 0, score = 0;
  for (let c = 0; c < NC; c += 11) {
    const s = Math.max(tropicalFavor(W, c), midlatFavor(W, c));
    if (s > score) { score = s; best = c; }
  }
  return { cell: best, score };
}

function refreshStormDesk() {
  const snap = stormDeskSnapshot(W);
  const strip = document.getElementById('stormStrip');
  if (strip) {
    strip.innerHTML = `
      <div class="clim-chip"><span>Active</span><b>${snap.count}</b></div>
      <div class="clim-chip"><span>Peak</span><b>${snap.max ? snap.max.toFixed(2) : '—'}</b></div>
      <div class="clim-chip"><span>Tide</span><b>${snap.tidePhase}</b></div>
      <div class="clim-chip"><span>Springs</span><b>${W.tidePhase === 'springs' ? 'yes' : 'no'}</b></div>
    `;
  }
  const list = document.getElementById('stormList');
  if (list) {
    if (!snap.list.length) {
      list.innerHTML = `<div class="clim-empty">No storms on the track — seed one or wait for genesis.</div>`;
    } else {
      list.innerHTML = snap.list.map((s) => {
        const sel = s.id === selectedStormId ? ' aria-pressed="true"' : '';
        const tags = [
          s.kind === 'tropical' ? 'eye' : 'comma',
          s.landfall ? 'landfall' : null,
          s.surgeHit ? 'surge' : null,
          s.springRisk ? 'springs!' : null,
        ].filter(Boolean).join(' · ');
        return `<button type="button" class="clim-row" data-storm="${s.id}"${sel}>
          <span class="clim-row-name">${iconSVG('stormdesk')}${s.name}</span>
          <span class="clim-row-meta">${(s.intensity * 100) | 0}% · age ${s.age} · ${tags}</span>
        </button>`;
      }).join('');
      if (!selectedStormId || !snap.list.find((x) => x.id === selectedStormId)) {
        selectedStormId = snap.list[0].id;
      }
    }
  }
  const note = document.getElementById('stormNote');
  if (note) note.textContent = snap.note;
  const call = document.getElementById('stormCallout');
  if (call) {
    const risky = snap.list.find((s) => s.springRisk);
    call.innerHTML = risky
      ? `<b>${risky.name}</b> intense at springs — surge risk on the shelf.`
      : snap.count
        ? 'Steer selected storm; landfall weakens intensity fast.'
        : 'Inspect a warm basin or use Seed best basin.';
  }
}

function refreshCoastDesk() {
  const snap = coastDeskSnapshot(W);
  const strip = document.getElementById('coastStrip');
  if (strip) {
    strip.innerHTML = `
      <div class="clim-chip"><span>Intertidal</span><b>${snap.intertidalPct.toFixed(0)}%</b></div>
      <div class="clim-chip"><span>Flats</span><b>${snap.flatPct.toFixed(0)}%</b></div>
      <div class="clim-chip"><span>Range</span><b>${snap.meanRange.toFixed(3)}</b></div>
      <div class="clim-chip"><span>Harbours</span><b>${snap.harbours}</b></div>
      <div class="clim-chip"><span>Flood</span><b>${(snap.floodScore * 100) | 0}</b></div>
    `;
  }
  const meter = document.getElementById('coastMeter');
  if (meter) {
    const pct = (snap.floodScore * 100) | 0;
    meter.innerHTML = `
      <div class="clim-meter-bar"><i style="width:${pct}%"></i></div>
      <div class="clim-meter-lab">${snap.note}</div>
      <div class="clim-fact">Coast cells ~${snap.coastN} · drowned ${snap.drowned} · surge risk ${snap.surgeRisk}
        ${snap.spring ? ' · <b>springs</b>' : ''}</div>
    `;
  }
  const note = document.getElementById('coastNote');
  if (note) {
    note.textContent = `Max range ${snap.maxRange.toFixed(3)} @ cell ${snap.maxRangeCell}` +
      (snap.tide.highInHours != null ? ` · high in ~${snap.tide.highInHours}h` : '');
  }
  const cities = document.getElementById('coastCities');
  if (cities) {
    if (!snap.topCities.length) {
      cities.innerHTML = `<div class="clim-empty">No coastal settlements yet.</div>`;
    } else {
      cities.innerHTML = snap.topCities.map((c) => {
        const flags = [
          c.harbour ? 'harbour' : null,
          c.drowned ? 'drowning' : null,
          c.surge > 0.012 ? 'surge' : null,
        ].filter(Boolean).join(' · ') || c.stage;
        return `<div class="clim-row static">
          <span class="clim-row-name">${iconSVG('coastdesk')}${c.name}</span>
          <span class="clim-row-meta">pop ${c.pop | 0} · tide ${Number(c.tide || 0).toFixed(3)} · ${flags}</span>
        </div>`;
      }).join('');
    }
  }
}

/** Refresh live readouts; sync slider labels without fighting user drag. */
export function refreshClimatePanel(opts = {}) {
  if (activeDesk === 'storm') refreshStormDesk();
  else if (activeDesk === 'coast') refreshCoastDesk();
  else if (activeDesk === 'compare') {
    const day = W.rotationPeriod || 1;
    syncSlider('cmpDay', Math.round(day * 100), `${day.toFixed(2)}×`, 'cmpDayVal');
  }

  if (activeDesk !== 'sky' && !opts.forceAll) return climateSnapshot();

  const snap = climateSnapshot();
  const strip = document.getElementById('climStrip');
  if (strip) {
    strip.innerHTML = `
      <div class="clim-chip"><span>Tide</span><b>${snap.tide.phase || '—'}</b></div>
      <div class="clim-chip"><span>Range</span><b>${snap.tide.meanRange}</b></div>
      <div class="clim-chip"><span>Wind</span><b>${snap.regime}</b></div>
      <div class="clim-chip"><span>ITCZ</span><b>${snap.itczDeg.toFixed(0)}°</b></div>
      <div class="clim-chip"><span>Moon</span><b>${snap.moonIllum != null ? `${(snap.moonIllum * 100) | 0}%` : '—'}</b></div>
      <div class="clim-chip"><span>Storms</span><b>${W._stormCount || 0}</b></div>
    `;
  }
  const chart = document.getElementById('climChart');
  if (chart && (opts.forceChart || !opts.skipChart)) {
    chart.innerHTML = synopticChartSVG(W, 292, 132);
  }
  const spinNote = document.getElementById('climSpinNote');
  if (spinNote) spinNote.textContent = snap.spinNote;
  const tideNote = document.getElementById('climTideNote');
  if (tideNote) {
    tideNote.textContent = `${snap.springNote}` +
      (snap.tide.springsInDays != null ? ` · springs in ${snap.tide.springsInDays}d` : '') +
      (snap.tide.highInHours != null ? ` · high in ~${snap.tide.highInHours}h` : '');
  }
  const explain = document.getElementById('climExplain');
  if (explain) {
    const band = windBandAt(0.2, W._itczLat || 0, snap.cells);
    explain.innerHTML = `
      <div class="clim-fact"><b>${snap.cells}</b> circulation cells / hemisphere · trades near ITCZ read as <b>${band}</b></div>
      <div class="clim-fact">Cloud cover ~<b>${(snap.meanCloud * 100) | 0}%</b> · mean wind <b>${snap.meanWind.toFixed(2)}</b></div>
      <div class="clim-fact">${snap.moon
        ? `Moon ${snap.moon.mass.toFixed(2)} M @ ${snap.moon.distance.toFixed(2)} · axis ${W.obliquityWander ? 'wanders' : 'stable'}`
        : 'No moon — solar tide only, obliquity may wander'}</div>
      ${snap.paramsNote ? `<div class="clim-fact">${snap.contested ? '⚠ contested · ' : ''}${snap.paramsNote}${snap.teqK != null ? ` · T<sub>eq</sub> <b>${snap.teqK.toFixed(0)} K</b>` : ''}${snap.pressBar != null ? ` · <b>${snap.pressBar}</b> bar` : ''}</div>` : ''}
    `;
    const orbitEl = document.getElementById('climOrbit');
    if (orbitEl) orbitEl.innerHTML = orbitSvg(W.rule);
  }

  if (!opts.dragging) {
    const ranges = rangesForWorld();
    const dayEl = document.getElementById('climDay');
    const tiltEl = document.getElementById('climTilt');
    if (dayEl) {
      // Slider stores |day|×100; retrograde shown in label
      const lo = Math.max(5, Math.round((ranges.dayMin || 0.15) * 100));
      const hi = Math.min(40000, Math.round((ranges.dayMax || 8) * 100));
      dayEl.min = String(lo);
      dayEl.max = String(Math.max(lo + 1, hi));
      dayEl.disabled = !!ranges.disabledDay;
    }
    if (tiltEl) {
      tiltEl.max = String(ranges.tiltMax ?? 90);
      tiltEl.disabled = !!ranges.disabledTilt;
    }
    const dayAbs = Math.abs(snap.day);
    const dayLabel = (W.rotationPeriod < 0 ? '−' : '') + `${dayAbs.toFixed(2)}×`
      + (ranges.locked ? ' lock' : W.rotationPeriod < 0 ? ' retro' : '');
    syncSlider('climDay', Math.round(dayAbs * 100), dayLabel, 'climDayVal');
    syncSlider('climTilt', Math.round(snap.tiltDeg), `${snap.tiltDeg.toFixed(0)}°`, 'climTiltVal');
    syncSlider('climSeason', Math.round(snap.seasonDeg), `${snap.seasonDeg.toFixed(0)}°`, 'climSeasonVal');
    const moonOn = document.getElementById('climMoonOn');
    if (moonOn && document.activeElement !== moonOn) moonOn.checked = !!snap.moon;
    const st = document.getElementById('climMoonState');
    if (st) st.textContent = snap.moon ? 'on' : 'off';
    if (snap.moon) {
      syncSlider('climMoonMass', Math.round(snap.moon.mass * 100), `${snap.moon.mass.toFixed(2)} M`, 'climMoonMassVal');
      syncSlider('climMoonDist', Math.round(snap.moon.distance * 100), snap.moon.distance.toFixed(2), 'climMoonDistVal');
    }
    const massRow = document.getElementById('climMoonMassRow');
    const distRow = document.getElementById('climMoonDistRow');
    if (massRow) massRow.style.opacity = snap.moon ? '1' : '0.4';
    if (distRow) distRow.style.opacity = snap.moon ? '1' : '0.4';
  }
  return snap;
}

function syncSlider(id, value, label, labelId) {
  const el = document.getElementById(id);
  if (el && document.activeElement !== el) el.value = String(value);
  const lab = document.getElementById(labelId);
  if (lab) lab.textContent = label;
}

/**
 * Bind controls once. opts: { setOverlay, showMoment, onChange, getInspectCell }
 */
export function bindClimatePanel(opts = {}) {
  const { setOverlay, showMoment, onChange, getInspectCell } = opts;
  let dragging = false;

  document.querySelectorAll('.clim-desk-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      setDesk(btn.dataset.desk);
      refreshClimatePanel({ forceChart: true, forceAll: true });
    });
  });

  const day = document.getElementById('climDay');
  const tilt = document.getElementById('climTilt');
  const season = document.getElementById('climSeason');
  const moonOn = document.getElementById('climMoonOn');
  const moonMass = document.getElementById('climMoonMass');
  const moonDist = document.getElementById('climMoonDist');

  const markDrag = (el) => {
    if (!el) return;
    el.addEventListener('pointerdown', () => { dragging = true; });
    el.addEventListener('pointerup', () => { dragging = false; refreshClimatePanel({ forceChart: true }); });
    el.addEventListener('change', () => { dragging = false; });
  };
  [day, tilt, season, moonMass, moonDist].forEach(markDrag);

  day?.addEventListener('input', () => {
    const ranges = rangesForWorld();
    let v = (+day.value) / 100;
    if (ranges.retro || (W.rotationPeriod || 0) < 0) v = -Math.abs(v);
    const label = (v < 0 ? '−' : '') + `${Math.abs(v).toFixed(2)}×` + (v < 0 ? ' retro' : '');
    document.getElementById('climDayVal').textContent = label;
    applyDayLength(v);
    document.getElementById('climSpinNote').textContent = climateSnapshot().spinNote;
    onChange?.('day');
  });

  tilt?.addEventListener('input', () => {
    const v = +tilt.value;
    document.getElementById('climTiltVal').textContent = `${v}°`;
    applyTiltDeg(v);
    onChange?.('tilt');
  });

  season?.addEventListener('input', () => {
    const v = +season.value;
    document.getElementById('climSeasonVal').textContent = `${v}°`;
    applySeasonDeg(v);
    onChange?.('season');
  });

  const applyMoonFromUI = () => {
    if (!moonOn?.checked) {
      applyMoonParams(0, 2.2, false);
      document.getElementById('climMoonState').textContent = 'off';
      showMoment?.('Moon', 'Stripped', 'Solar tide only · axis may wander');
    } else {
      const m = (+moonMass.value) / 100;
      const d = Math.max(ROCHE_DISTANCE, (+moonDist.value) / 100);
      applyMoonParams(m, d, true);
      document.getElementById('climMoonState').textContent = 'on';
      document.getElementById('climMoonMassVal').textContent = `${m.toFixed(2)} M`;
      document.getElementById('climMoonDistVal').textContent = d.toFixed(2);
      showMoment?.('Moon', `${m.toFixed(2)} M @ ${d.toFixed(2)}`, 'Tides resume');
    }
    onChange?.('moon');
    refreshClimatePanel({ forceChart: true });
  };

  moonOn?.addEventListener('change', applyMoonFromUI);
  moonMass?.addEventListener('input', () => {
    if (!moonOn.checked) return;
    document.getElementById('climMoonMassVal').textContent = `${((+moonMass.value) / 100).toFixed(2)} M`;
  });
  moonMass?.addEventListener('change', applyMoonFromUI);
  moonDist?.addEventListener('input', () => {
    if (!moonOn.checked) return;
    const d = Math.max(ROCHE_DISTANCE, (+moonDist.value) / 100);
    document.getElementById('climMoonDistVal').textContent = d.toFixed(2);
  });
  moonDist?.addEventListener('change', applyMoonFromUI);

  const wireOverlays = (rootId) => {
    document.getElementById(rootId)?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-overlay]');
      if (!btn) return;
      const mode = btn.dataset.overlay;
      setOverlay?.(mode);
      document.querySelectorAll(`#${rootId} button`).forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.overlay === mode ? 'true' : 'false');
      });
      const sel = document.getElementById('overlayMode');
      if (sel) { sel.value = mode; sel.dispatchEvent(new Event('change')); }
    });
  };
  wireOverlays('climOverlays');
  wireOverlays('coastOverlays');

  // Storm desk
  document.getElementById('stormList')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-storm]');
    if (!row) return;
    selectedStormId = row.dataset.storm;
    refreshStormDesk();
  });

  const doSeed = (cell, label) => {
    const r = seedStorm(W, cell, { log: chronLog, radius: 18 });
    showMoment?.(label, r.ok ? r.storm.name : 'Failed', r.note);
    setOverlay?.('storm');
    onChange?.('storm');
    refreshStormDesk();
    refreshClimatePanel({ forceChart: true });
  };

  document.getElementById('stormSeedAt')?.addEventListener('click', () => {
    const cell = getInspectCell?.() ?? -1;
    if (cell < 0) {
      showMoment?.('Seed storm', 'Need inspect', 'Inspect a cell, then seed');
      return;
    }
    doSeed(cell, 'Seed at inspect');
  });

  document.getElementById('stormSeedBest')?.addEventListener('click', () => {
    const { cell, score } = findBestStormCell();
    if (score < 0.2) {
      showMoment?.('Seed storm', 'No basin', 'Favor too low anywhere');
      return;
    }
    doSeed(cell, 'Seed best');
  });

  const steer = (du, dv) => {
    if (!selectedStormId) {
      showMoment?.('Steer', 'No storm', 'Select a storm first');
      return;
    }
    const r = steerStorm(W, selectedStormId, du, dv);
    showMoment?.('Steer', r.storm?.name || '—', r.ok ? `Δu ${du} · Δv ${dv}` : r.note);
    refreshStormDesk();
  };
  document.getElementById('stormSteerW')?.addEventListener('click', () => steer(-0.35, 0));
  document.getElementById('stormSteerE')?.addEventListener('click', () => steer(0.35, 0));
  document.getElementById('stormSteerN')?.addEventListener('click', () => steer(0, 0.25));
  document.getElementById('stormOverlay')?.addEventListener('click', () => {
    setOverlay?.('storm');
    const sel = document.getElementById('overlayMode');
    if (sel) { sel.value = 'storm'; sel.dispatchEvent(new Event('change')); }
  });

  // Compare desk
  const cmpDay = document.getElementById('cmpDay');
  markDrag(cmpDay);
  cmpDay?.addEventListener('input', () => {
    const v = (+cmpDay.value) / 100;
    document.getElementById('cmpDayVal').textContent = `${v.toFixed(2)}×`;
    applyDayLength(v);
    onChange?.('day');
  });
  document.getElementById('cmpFreezeA')?.addEventListener('click', () => {
    compareA = snapFrame('A');
    renderCompare();
    showMoment?.('Compare', 'Freeze A', `Day ${compareA.day.toFixed(2)}× · ${compareA.cells} cells`);
  });
  document.getElementById('cmpCaptureB')?.addEventListener('click', () => {
    if (!compareA) {
      showMoment?.('Compare', 'Freeze A first', 'Need a baseline spin');
      return;
    }
    compareB = snapFrame('B');
    renderCompare();
    showMoment?.('Compare', 'Capture B', `Day ${compareB.day.toFixed(2)}× · ${compareB.cells} cells`);
  });
  document.getElementById('cmpClear')?.addEventListener('click', () => {
    compareA = null;
    compareB = null;
    renderCompare();
  });

  refreshClimatePanel({ forceChart: true, forceAll: true });
  return () => refreshClimatePanel({ skipChart: dragging, forceChart: !dragging });
}

/** Inspect helper — band name at a cell. */
export function climateAtCell(cell) {
  if (cell < 0) return null;
  const lat = DIR[cell * 3 + 1];
  const coast = coastAtCell(W, cell);
  return {
    band: windBandAt(lat, W._itczLat || 0, W._windCells || 3),
    press: W.press?.[cell],
    tide: W.tideHeight?.[cell],
    range: W.tideRange?.[cell],
    intertidal: W.intertidal?.[cell],
    storm: W.stormField?.[cell] || 0,
    surge: W.surgeField?.[cell] || 0,
    coast,
  };
}
