/** HUD / stats panel rendering — extracted from main.js (R54). */

import { NC, AREA, DIR } from './sphere.js';
import { W, formatAge, treeSummary } from './world.js';
import { BIOMES } from './sim/ecology.js';
import { LIFE_CLASSES } from './sim/bio.js';
import { describeGenome } from './sim/genome.js';
import { solventBlurb, speciesPage, explainCreature } from './sim/lifeGuide.js';
import { lineageAt } from './sim/evolve.js';
import { seedToWords, worldIdOf } from './sim/seedword.js';
import { formatAxesLine, formatAxesExtras } from './sim/worldAxes.js';
import { describeSubstrate, cycleMaterial, formatLiquidWindow, phaseAtCell, livePressureBar } from './sim/substrateField.js';
import { formatCover, formatLivePressure } from './sim/cover.js';
import { formatColumn } from './sim/columnSketch.js';
import { formatColumnAt } from './sim/columnField.js';
import { featureAt, formatFeatures } from './sim/definition.js';
import { formatPlevel, formatGiantExtras } from './sim/plevel.js';
import { formatEpoch } from './sim/epoch.js';
import { formatTechno, formatMega } from './sim/techno.js';
import { landformAt, explainForm, formatPalette } from './sim/landform.js';
import { landscapeById } from './sim/landscapes.js';
import { currentEraName, whatHappenedHere } from './chronicle.js';
import { timePanelState } from './sim/timePanel.js';
import { timeClockInfo } from './sim/god/observe.js';
import { icsRibbonHTML } from './sim/viz.js';
import { activeTool, pricePreview, inspectCell, brushKm } from './tools.js';
import { ENT } from './agents.js';
import { darkEnabled } from './sim/darkGate.js';
import { HUD_CADENCE_MS } from './sim/hudCadence.js';
import { expected } from './sim/report.js';
import { windBandAt } from './sim/wind.js';
import { currentsAtCell } from './sim/ocean.js';
import { tectonicsAtCell } from './sim/platesPanel.js';
import { placeSentence } from './sim/present.js';
import { xrSession } from './xr.js';

let _api = null;

/**
 * @typedef {object} HUDApi
 * @property {object} S — view state
 * @property {() => void} refreshToolGates
 * @property {(ribbon: HTMLElement) => void} bindRibbonTips
 * @property {(ribbon: HTMLElement, panel: object) => void} refreshLivedRibbonDom
 * @property {() => void} announceNewMoments
 * @property {() => void} refreshWorldModeStrip
 * @property {(kicker: string, title: string, sub: string, rgb?: any) => void} showMoment
 * @property {() => Promise<void>} ensureDarkUi
 * @property {() => object|null} darkHud
 * @property {() => object|null} darkSpec
 * @property {(opts?: object) => void} refreshClimatePanel
 * @property {() => void} refreshPlatesPanel
 */

export function initHUD(api) { _api = api; }

function fmtDt(dt) {
  if (!dt) return '—';
  if (dt >= 1e6) return `${(dt / 1e6).toFixed(1)} Myr`;
  if (dt >= 1e3) return `${(dt / 1e3).toFixed(0)} kyr`;
  return `${dt | 0} yr`;
}

function topGuild(cell) {
  if (!W.guildDens) return null;
  let best = null, v = 0.08;
  for (const id of Object.keys(W.guildDens)) {
    const x = W.guildDens[id][cell];
    if (x > v) { v = x; best = id; }
  }
  return best;
}

function dominantBodyLine() {
  const tr = W.tree;
  if (!tr?.living?.length) return '';
  let best = null;
  for (const id of tr.living) {
    const n = tr.byId.get(id);
    if (n?.genome && (!best || n.pop > best.pop)) best = n;
  }
  if (!best) return '';
  const body = describeGenome(best.genome);
  const pen = best.morphMult != null && best.morphMult < 0.95
    ? ` <span style="color:#e0a060" title="${(best.morphWhy || []).join('; ')}">×${best.morphMult.toFixed(2)}</span>`
    : '';
  const sense = W.topSense ? ` · best sense <b>${W.topSense}</b>` : '';
  return `<span style="color:#9fd6b4">${best.name}</span>: ${body}${pen}${sense}<br>`;
}

function speciesInspectHTML(cell) {
  const node = lineageAt(W, cell);
  if (!node) {
    if (W.originCell === cell) return `<br><span style="color:#c8b56f">origin site</span>`;
    return '';
  }
  const page = speciesPage(W, node);
  if (!page) return '';
  const why = explainCreature(W, node);
  return `<br><span style="color:#9fd6b4"><b>${page.name}</b> · ${page.body}</span><br>` +
    `census ~<b>${page.census | 0}</b> · Ne <b>${page.Ne | 0}</b> · range <b>${((page.rangeKm2 / 1e3) | 0)}</b>k km²` +
    (page.diet?.length ? ` · eats ${page.diet.join(', ')}` : '') + `<br>` +
    (page.card?.lines?.slice(0, 3).map((l) => `<span style="color:#8aa0bc">${l}</span>`).join('<br>') || '') +
    (why ? `<br>${why}` : '');
}

export function updateHUD() {
  if (xrSession) return;
  const { S, refreshToolGates, bindRibbonTips, refreshLivedRibbonDom,
    announceNewMoments, refreshWorldModeStrip, showMoment,
    ensureDarkUi, darkHud, darkSpec,
    refreshClimatePanel, refreshPlatesPanel } = _api;
  const R = W.rule;
  let land = 0;
  for (let c = 0; c < NC; c++) if (W.h[c] >= W.seaLevel) land += AREA[c];
  const pc = (x) => ((x / NC) * 100).toFixed(1) + '%';
  const g = W.gases;
  const lifePct = (W.meanLife * 100).toFixed(1);
  let landCells = 0, greenCells = 0, settleCells = 0;
  for (let c = 0; c < NC; c++) {
    if (W.h[c] < W.seaLevel) continue;
    landCells++;
    if (W.life[c] > 0.15) greenCells++;
    if (W.build[c] > 0.2) settleCells++;
  }
  const landGreen = landCells ? ((greenCells / landCells) * 100).toFixed(0) : '0';
  const bloom = W.lifeGrown > 80 ? ` · <b style="color:#7dff6a">bloom +${W.lifeGrown}</b>` :
    W.lifeDied > 200 ? ` · <b style="color:#e08060">dieback −${W.lifeDied}</b>` : '';
  const builders = W.buildersActive > 0
    ? ` · <b style="color:#e8c48a">building ×${W.buildersActive}</b>` : '';
  let bioLine;
  if (R.daisyworld) {
    let b = 0, w = 0, n = 0;
    for (let c = 0; c < NC; c++) {
      if (W.blackDaisy[c] > 0.25) b++;
      if (W.whiteDaisy[c] > 0.25) w++;
      n++;
    }
    bioLine = `<span style="color:#ddd">daisies <b>${lifePct}%</b> · ` +
      `<b style="color:#222;background:#ccc;padding:0 3px">black ${(b / n * 100) | 0}%</b> · ` +
      `<b style="color:#111;background:#fff;padding:0 3px">white ${(w / n * 100) | 0}%</b>${bloom}</span><br>`;
  } else {
    bioLine = `<span style="color:#7dff6a">life <b>${lifePct}%</b> · land green <b>${landGreen}%</b>${bloom}</span><br>` +
      `<span style="color:#e8c48a">settlements <b>${settleCells}</b>${builders}</span><br>`;
  }
  const co2Str = g.CO2 < 0.005
    ? `${(g.CO2 * 1e6).toFixed(0)} ppm`
    : `${(g.CO2 * 100).toFixed(1)}%`;
  const tK = R.tSurfK != null ? R.tSurfK : (288 + ((W.meanTemp ?? 0.5) - 0.5) * 160);
  const tStr = R.teqK != null
    ? `${tK.toFixed(0)} K` +
      (R.earthLike ? ` (${((W.meanTemp - 0.5) * 80 + 15).toFixed(0)}°C)` : '') +
      (R.greenhouseK != null ? ` · T<sub>eq</sub> ${R.teqK | 0} K · GH +${R.greenhouseK | 0} K` : '')
    : R.earthLike
      ? `${((W.meanTemp - 0.5) * 80 + 15).toFixed(0)}°C`
      : W.meanTemp.toFixed(2);
  const ics = W.ics;
  const icsStr = ics
    ? `${ics.eon}${ics.period && ics.period !== '—' ? ' · ' + ics.period : ''}`
    : '';
  const tree = treeSummary(W.tree);
  const chem = solventBlurb(W);
  const originLine = W.originCell != null && W.transitions?.abiogenesis
    ? `origin cell <b>${W.originCell}</b>` + (W.originBudget ? ` · budget ${(W.originBudget.produced || 0).toExponential(1)}` : '')
    : '';
  const proxy = W.carbon
    ? `δ¹³C <b>${W.carbon.d13C.toFixed(1)}</b> · pH <b>${W.carbon.surfacePH.toFixed(2)}</b><br>`
    : '';
  const bioSig = W.disequilibrium > 0.01
    ? ` · diseq <b>${(W.disequilibrium * 100) | 0}</b>`
    : '';
  const sterile = W.sterileWhy
    ? `<span style="color:#e08060">sterile: ${W.sterileWhy}</span><br>`
    : (R.atmosphereUnknown
      ? `<span style="color:#c8b56f">atmosphere: unmeasured — biosphere unknown</span><br>`
      : '');
  document.getElementById('stats').innerHTML =
    `<span class="era-name">${currentEraName(W.chron, W)}</span>` +
    `<b>${formatAge(W.ageYr || W.year)}</b>` +
    (icsStr ? ` · <span style="color:#9fc0ff">${icsStr}</span>` : '') + `<br>` +
    `dt <b>${fmtDt(W.dtYr)}</b> · L☉ <b>${(W.solar / (W._baseSolar || 1)).toFixed(2)}</b>` +
    (W.solarShade ? ` · shade <b>${((W.solarShade || 0) * 100) | 0}%</b>` : '') + `<br>` +
    `tilt <b>${((W.obliquity || 0) * 180 / Math.PI).toFixed(1)}°</b>` +
    ` · day <b>${(W.rotationPeriod || 1).toFixed(2)}×</b>` +
    (W.sky?.terminatorKmh ? ` · <b>${W.sky.terminatorKmh.toFixed(0)}</b> km/h` : '') +
    (W.magnetosphere != null ? ` · B <b>${W.magnetosphere.toFixed(2)}</b>` : '') +
    (W.interior?.lidMode ? ` · <b>${W.interior.lidMode}</b>` : '') +
    (W.moon && W.moon.mass > 0.1
      ? ` · moon <b>${(W.moon.mass).toFixed(1)} M</b>@${(W.moon.distance || 1).toFixed(1)}`
      : ` · <span style="color:#e08060">no moon</span>`) +
    (W.obliquityWander ? ` · <span style="color:#e4a060">axis wanders</span>` : '') + `<br>` +
    (W.tidePhase
      ? `tide <b>${W.tidePhase}</b>` +
        (W.springsInDays != null ? ` · springs in <b>${W.springsInDays.toFixed(0)}d</b>` : '') +
        ` · range <b>${(W.meanTideRange || 0).toFixed(3)}</b>` +
        (W.moonIllum != null ? ` · moon <b>${(W.moonIllum * 100) | 0}%</b>` : '') + `<br>`
      : '') +
    (W._windRegime
      ? `wind <b>${W._windRegime}</b> · ITCZ <b>${((W._itczLat || 0) * 57.3).toFixed(0)}°</b><br>`
      : '') +
    (W._droppedTicks
      ? `<span style="color:#e08060">dropped ticks <b>${W._droppedTicks}</b>` +
        (W._dropReason ? ` (${W._dropReason})` : '') + `</span><br>`
      : '') +
    (W._degraded?.length
      ? `<span style="color:#c8b56f">sim reduced: <b>${W._degraded.slice(0, 6).join(', ')}</b>` +
        (W._degraded.length > 6 ? '…' : '') + `</span><br>`
      : '') +
    (W._gpgpu
      ? `<span style="color:#6fd6a4">GPGPU climate <b>${(W._gpgpuMs || 0).toFixed(2)} ms</b></span><br>`
      : `<span style="color:#889">climate CPU</span><br>`) +
    `state <b>${W.state}</b> · health <b>${(W.health * 100) | 0}%</b>` +
    (W.mood?.label ? ` · mood <b>${W.mood.label}</b>` : '') +
    ` · hab <b>${((W.habitability || 0) * 100) | 0}</b>/<b>${((W.inhabitance || 0) * 100) | 0}</b>${bioSig}<br>` +
    `T <b>${tStr}</b> · sea <b>${W.seaLevel.toFixed(3)}</b>` +
    (R.surfacePressureBar != null ? ` · <b>${formatLivePressure(W)}</b>` : '') +
    (R.densityPhrase ? `<br>${R.densityPhrase}` : '') +
    (R.orbitalPeriodDays != null
      ? `<br>year <b>${Number(R.orbitalPeriodDays.toPrecision(4))}</b> d` +
        (R.orbitalPeriodDays > 40 ? ` (${(R.orbitalPeriodDays / 365.25).toFixed(2)} yr)` : '') +
        (R.solarDayHours != null ? ` · solar day <b>${(R.solarDayHours / 24).toFixed(2)}</b> d` : '')
      : '') +
    `<br>` +
    `land <b>${pc(land)}</b> · ice <b>${pc(W.iceFrac * NC)}</b><br>` +
    bioLine +
    sterile +
    (chem ? `<span style="color:#9fd6b4">${chem}</span><br>` : '') +
    (originLine ? `<span style="color:#c8b56f">${originLine}</span><br>` : '') +
    `CO₂ <b>${co2Str}</b> O₂ <b>${(g.O2 * 100).toFixed(1)}%</b>` +
    (g.CH4 > 1e-5 ? ` CH₄ <b>${(g.CH4 * 1e6).toFixed(0)} ppm</b>` : '') + `<br>` +
    proxy +
    (tree.total
      ? `clades <b>${tree.living}</b> living / <b>${tree.total}</b> · extinct <b>${tree.extinct}</b>` +
        (tree.maxDepth ? ` · depth <b>${tree.maxDepth}</b>` : '') +
        (W.morphospaceOccupied ? ` · bodies <b>${W.morphospaceOccupied}</b>` : '') +
        (W.shannon ? ` · H′ <b>${W.shannon.toFixed(2)}</b>` : '') + `<br>`
      : '') +
    dominantBodyLine() +
    (W.budgetMode || W.scarcityMode === 'observe' || W.scarcityMode === 'budgeted'
      ? `energy <b>${W.energy.toFixed(0)}</b>${W.energyDebt ? ` · debt <b>${W.energyDebt | 0}</b>` : ''} · `
      : '') +
    (W.attribution ? `you <b>${((W.attribution.player || 0) * 100) | 0}%</b> · ` : '') +
    `<b>${S.fps}</b> fps · ents ${ENT.n}` +
    (W.overshootWarn ? `<br><span style="color:#e4a060">${W.overshootWarn}</span>` : '') +
    (W.argueResponses?.length
      ? `<br><span style="color:#9fc0ff">${W.argueResponses[W.argueResponses.length - 1].text}</span>`
      : '');

  const priceEl = document.getElementById('godprice');
  if (priceEl) {
    const p = pricePreview(activeTool);
    priceEl.textContent = p.free
      ? `free · brush ${brushKm() | 0} km`
      : `cost ${p.cost} · bal ${p.balance | 0} · +${(p.income || 0).toFixed(1)}/t · brush ${brushKm() | 0} km`
        + (p.cooldownYr ? ` · cd` : '');
  }

  const ribbon = document.getElementById('timeribbon');
  if (ribbon) {
    const clock = { ...timeClockInfo(W), paused: S.paused };
    const needle = Math.min(100, Math.max(0, ((4567 - (W.ics?.maBP ?? 0)) / 4567) * 100)) | 0;
    const ageLabel = formatAge(W.ageYr || W.year);
    const panel = timePanelState(W, S);
    const sig = `${ageLabel}|${W.ics?.period}|${W.ics?.eon}|${needle}|${clock.id}|${clock.dt}|${clock.paused ? 1 : 0}|${W.fastForward ? 1 : 0}|${panel.eraId}|${panel.eras.length}|${panel.clockFace}|${panel.seasonHoldId}|${panel.lifeSpeed}|${panel.livedRate}|${panel.livedDayRate}|${panel.winterHint}|${(W.dark?.winter * 100) | 0}`;
    if (ribbon.dataset.sig !== sig) {
      ribbon.dataset.sig = sig;
      ribbon.innerHTML = icsRibbonHTML(W.ics, ageLabel, W.ics?.maBP, clock, panel);
      bindRibbonTips(ribbon);
    }
    refreshLivedRibbonDom(ribbon, panel);
  }

  announceNewMoments();
  refreshToolGates();

  if (darkEnabled()) {
    if (!updateHUD._dark || performance.now() - updateHUD._dark > HUD_CADENCE_MS.dark) {
      updateHUD._dark = performance.now();
      const dh = darkHud();
      if (dh) dh.refreshDarkHud(W);
      else ensureDarkUi().then(() => darkHud()?.refreshDarkHud(W)).catch(() => { expected('ORR-EXPECTED-LAZY', 'dark HUD refresh'); });
    }
    const ds = darkSpec();
    if (ds) {
      const mom = ds.drainDarkMoment(W);
      if (mom) showMoment(mom.title, mom.body, mom.sub || formatAge(W.ageYr));
    }
  }

  if (document.getElementById('pane-climate')?.classList.contains('on')) {
    if (!updateHUD._clim || performance.now() - updateHUD._clim > HUD_CADENCE_MS.climate) {
      updateHUD._clim = performance.now();
      refreshClimatePanel({ skipChart: (updateHUD._climN = (updateHUD._climN || 0) + 1) % 5 !== 0 });
    }
  }
  if (document.getElementById('pane-rock')?.classList.contains('on')) {
    if (!updateHUD._rock || performance.now() - updateHUD._rock > HUD_CADENCE_MS.rock) {
      updateHUD._rock = performance.now();
      refreshPlatesPanel();
    }
  }
  if (document.getElementById('pane-sandbox')?.classList.contains('on')) {
    const modesOn = document.querySelector('.suite-desk[data-suite-panel="sandbox"][data-desk-panel="modes"].on');
    if (modesOn && (!updateHUD._modes || performance.now() - updateHUD._modes > HUD_CADENCE_MS.modes)) {
      updateHUD._modes = performance.now();
      refreshWorldModeStrip();
    }
  }

  const chip = document.getElementById('worldchip');
  if (chip) {
    const mode = R.deepTime ? 'deep time' : (R.tutorial ? 'tutorial' : (S.catalogueId ? 'catalogue' : 'sandbox'));
    const landName = W._landscape && W._landscape !== 'auto' ? landscapeById(W._landscape).name : '';
    const bits = seedToWords((W.landSeed ?? W.seed) >>> 0);
    const short = `${bits[0]}-${bits[1]}`;
    const name = W.worldName || R.name;
    const kindBit = W._planetKind && W._planetKind !== 'earth'
      ? ` · ${W._planetKind}${W._planetKindWhy ? ` (${W._planetKindWhy})` : ''}`
      : '';
    const shapeBit = W._nonHydrostatic ? ' · not round' : '';
    const epochBit = W._epoch?.id && W._epoch.id !== 'present' && W._epoch.id !== 'venus-now'
      && W._epoch.id !== 'mars-now' ? ` · ${W._epoch.name}` : '';
    const surfBit = W.noSurface ? ' · no surface' : '';
    const ax = W._worldAxes;
    chip.innerHTML = S.catalogueId
      ? `<b>${R.name}</b> <small>#${S.catalogueId} · ${mode} · seed ${W.seed}${R.teqK != null ? ` · ${R.teqK | 0} K` : ''}${kindBit}${shapeBit}${surfBit}${epochBit}${R.contested ? ' · contested' : ''}</small>`
      : `<b>${name}</b> <small>${landName ? `${landName} · ` : ''}${short}${kindBit}${shapeBit}${surfBit}${epochBit}</small>`;
    chip.title = [
      S.catalogueId ? 'Open Worlds' : `Open Worlds · ${worldIdOf(W)}`,
      ax ? [formatAxesLine(ax), formatAxesExtras(ax), formatGiantExtras(W), ax.fingerprint].filter(Boolean).join(' · ') : '',
    ].filter(Boolean).join('\n');
    chip.style.cursor = 'pointer';
  }
  const landLine = document.getElementById('landmassline');
  if (landLine && W.noSurface) {
    landLine.textContent = ['no surface · envelope', formatGiantExtras(W)].filter(Boolean).join(' · ');
  } else if (landLine && W._landReport) {
    const r = W._landReport;
    landLine.textContent = `${r.count} landmasses · ${(r.landFrac * 100).toFixed(0)}% land · largest ${(r.largestShare * 100).toFixed(0)}% · coast ${Math.round(r.coastKm).toLocaleString()} km`;
  }
  const axLine = document.getElementById('axesline');
  if (axLine) {
    axLine.textContent = W._worldAxes
      ? [formatAxesLine(W._worldAxes), formatAxesExtras(W._worldAxes), formatGiantExtras(W),
        formatEpoch(W), formatTechno(W), formatMega(W),
        formatLiquidWindow(cycleMaterial(W), livePressureBar(W)),
        formatLivePressure(W),
        formatColumn(W),
        formatPalette(W),
        formatFeatures(W),
        W._worldAxes.fingerprint].filter(Boolean).join(' · ')
      : '';
  }

  const insp = document.getElementById('inspect');
  if (!insp) return;
  if (S.inspect?.cell != null && S.inspect.h == null) {
    S.inspect = { ...inspectCell(S.inspect.cell), ...S.inspect };
  }
  if (S.inspect && S.inspect.h != null) {
    const x = S.inspect;
    insp.style.display = 'block';
    if (W.noSurface) {
      const pLine = x.plevel || formatPlevel(W, x.cell);
      const conv = W.converg?.[x.cell] || 0;
      const band = conv < 0 ? 'belt (sinking · deeper)' : 'zone (rising · cloudy)';
      insp.innerHTML =
        `<b>${placeSentence(x.cell) || 'Cell ' + x.cell}</b><br>` +
        `<span style="color:#8aa0bc">${band} · cell ${x.cell}</span><br>` +
        (pLine ? `<b>${pLine}</b><br>` : '') +
        (formatColumnAt(W, x.cell) ? `${formatColumnAt(W, x.cell)}<br>` : '') +
        (x.wind != null
          ? `wind ${Number(x.wind).toFixed(2)}` +
            (x.windU != null ? ` (u ${Number(x.windU).toFixed(2)} v ${Number(x.windV).toFixed(2)})` : '') + `<br>`
          : '') +
        (W._jetCount ? `${W._jetCount} zonal jets · ${W._windRegime || 'zonal jets'}<br>` : '') +
        (W.rule?.internalHeat > 0.02 ? `internal heat ${W.rule.internalHeat.toFixed(2)}` : '');
    } else {
    const biome = W.biome ? BIOMES[W.biome[x.cell]] : '—';
    const guild = topGuild(x.cell);
    const tec = tectonicsAtCell(W, x.cell);
    const here = placeSentence(x.cell);
    const feat = featureAt(W, x.cell);
    insp.innerHTML =
      `<b>${feat ? feat.name : (here || 'Cell ' + x.cell)}</b><br>` +
      (feat && here ? `<span style="color:#c69a4f">${here}</span><br>` : '') +
      `<span style="color:#8aa0bc">${biome} · cell ${x.cell}</span><br>` +
      `elev ${x.h.toFixed(2)} · T ${x.temp.toFixed(2)} · moist ${x.moist.toFixed(2)}<br>` +
      (W.substrate ? `substrate <b>${describeSubstrate(W, x.cell)}</b>` : '') +
      (W.substrate ? ` · ${phaseAtCell(W, x.cell)}<br>` : '') +
      (() => {
        const cov = formatCover(W, x.cell);
        return cov ? `cover <b>${cov}</b><br>` : '';
      })() +
      (() => {
        const f = landformAt(W, x.cell);
        if (!f) return '';
        return `form <b>${explainForm(f)}</b><br>`
          + `<span style="color:#8aa0bc">${f.why}</span><br>`;
      })() +
      (() => {
        const mat = cycleMaterial(W);
        const win = mat ? formatLiquidWindow(mat, livePressureBar(W)) : '';
        const p = !W.rule?.earthLike && W._atmScale != null && Math.abs(W._atmScale - 1) > 0.02
          ? formatLivePressure(W) : '';
        const line = [win, p].filter(Boolean).join(' · ');
        const col = formatColumnAt(W, x.cell) || formatColumn(W);
        const extra = W.grain?.[x.cell] > 0.04 && (W.frost?.[x.cell] || 0) > 0.08
          ? `grain ${W.grain[x.cell].toFixed(2)}` : '';
        const bitsStr = [line, col, extra].filter(Boolean).join(' · ');
        return bitsStr ? `<span style="color:#9fc0ff">${bitsStr}</span><br>` : '';
      })() +
      `life ${x.life.toFixed(2)} (${LIFE_CLASSES[x.lifeClass]?.id || '—'}) · ice ${x.ice.toFixed(2)}<br>` +
      (guild ? `guild <b>${guild}</b><br>` : '') +
      `build ${(x.build || 0).toFixed(2)} · plate <b>${tec?.name || x.plate}</b>` +
      (tec ? ` · ${tec.oceanic ? 'oceanic' : 'cont'}` : '') +
      ` · crust ${(x.crust ?? W.crust[x.cell]).toFixed(2)}` +
      (W.techno?.watts ? ` · ${formatTechno(W)}` : '') + `<br>` +
      (W.interior
        ? `core ${(W.interior.coreMassFrac * 100) | 0}% · lid <b>${W.interior.lidMode}</b> · B ${(W.magnetosphere || 0).toFixed(2)}<br>`
        : '') +
      (tec?.boundLabel
        ? `bound <b>${tec.boundLabel}</b>` +
          (tec.ageMyr != null ? ` · crust age ${tec.ageMyr.toFixed(0)} Myr` : '') + `<br>`
        : '') +
      `flow ${x.flow.toFixed(2)} · ground ${(x.groundW ?? 0).toFixed(2)}` +
      ((x.lake || 0) > 0.05 ? ` · lake ${Number(x.lake).toFixed(2)}` : '') +
      ` · clouds ${(x.clouds ?? 0).toFixed(2)}` +
      (x.precip != null ? ` · precip ${Number(x.precip).toFixed(2)}` : '') +
      (W.npp ? ` · npp ${W.npp[x.cell].toFixed(2)}` : '') + `<br>` +
      (x.wind != null
        ? `wind ${Number(x.wind).toFixed(2)}` +
          (x.windU != null ? ` (u ${Number(x.windU).toFixed(2)} v ${Number(x.windV).toFixed(2)})` : '') +
          ` · ${windBandAt(DIR[x.cell * 3 + 1], W._itczLat || 0, W._windCells || 3)}` +
          (W.jetU
            ? ` · aloft ${Math.sqrt(W.jetU[x.cell] ** 2 + W.jetV[x.cell] ** 2).toFixed(2)}`
              + ` · shear ${(W.shear?.[x.cell] || 0).toFixed(2)}`
            : '') + `<br>`
        : '') +
      (() => {
        const cur = currentsAtCell(W, x.cell);
        if (!cur) return '';
        return `current ${cur.spd.toFixed(2)} ${cur.dir}` +
          (cur.upwell > 0.15 ? ` · upwell ${cur.upwell.toFixed(2)}` : '') +
          ` · salt ${cur.salt.toFixed(2)}` +
          (cur.wave > 0.12 ? ` · waves ${cur.wave.toFixed(2)}` : '') +
          (cur.mix > 0.05 ? ` · mixed layer ${cur.mix.toFixed(2)}` : '') +
          (W._mocSv != null ? ` · overturning ${W._mocSv.toFixed(0)} Sv` : '') +
          `<br>`;
      })() +
      ((W._ensoPhase && W._ensoPhase !== 'neutral') || (W._monsoon || 0) > 0.55
        ? `${W._ensoPhase || 'ENSO neutral'}` +
          (W._ensoIndex != null ? ` (${W._ensoIndex >= 0 ? '+' : ''}${W._ensoIndex.toFixed(2)})` : '') +
          ((W._monsoon || 0) > 0.5 ? ` · monsoon ${W._monsoon.toFixed(2)}` : '') +
          (W._jetLat != null ? ` · jet lat ${W._jetLat.toFixed(2)}` : '') +
          `<br>`
        : '') +
      (x.press != null ? `P ${Number(x.press).toFixed(2)} · ` : '') +
      (x.tideRange != null
        ? `tide h ${Number(x.tideHeight || 0).toFixed(3)} · range ${Number(x.tideRange).toFixed(3)}` +
          (x.intertidal > 0.05 ? ` · intertidal ${Number(x.intertidal).toFixed(2)}` : '') + `<br>`
        : '') +
      ((W.stormField?.[x.cell] || 0) > 0.08 || (W.surgeField?.[x.cell] || 0) > 0.008
        ? `storm ${(W.stormField[x.cell] || 0).toFixed(2)}` +
          ((W.surgeField?.[x.cell] || 0) > 0.005 ? ` · surge ${(W.surgeField[x.cell] || 0).toFixed(3)}` : '') + `<br>`
        : '') +
      (x.seedOk === false ? `<span style="color:#e08060">seed refuses: ${(x.seedWhy || []).join('; ')}</span>` : '') +
      (x.biomeGap?.gaps?.length ? `<br><span style="color:#c4a060">biome gap: ${x.biomeGap.gaps.join('; ')}</span>` : '') +
      speciesInspectHTML(x.cell);
    }
    const hist = whatHappenedHere(W.chron, x.cell, 2);
    if (hist.length) {
      insp.innerHTML += '<br><span style="color:#9fc0ff">Here:</span> ' +
        hist.slice(0, 3).map((e) => e.label).join(' · ');
    }
  } else insp.style.display = 'none';
}
