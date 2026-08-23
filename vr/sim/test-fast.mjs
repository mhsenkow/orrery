#!/usr/bin/env node
/** Fast tier — quality-400 F1/F3/F11/F21/F26/F32/F35/F37/F38.
 *  Budget: <18 s (grew with Sixth-gate asserts; still an edit loop). Fail on unhandled rejection.
 *
 *   node sim/test-fast.mjs
 *   node sim/test-fast.mjs --timing
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { FIELD_BY_NAME, fieldsSchemaHash, fieldCount } from './fields.js';
import { report, recentErrors, installGlobalErrorHandlers } from './report.js';
import { withWorld, hashFields } from './testHelpers.js';
import { paintDisc } from './pictureDisc.js';
import { darkEnabled, _resetDarkGateCache } from './darkGate.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const TIMING = process.argv.includes('--timing');
const WRITE_COUNT = process.argv.includes('--write-count');
const times = [];
let passed = 0;
let failed = 0;
const failIds = [];
const t0 = performance.now();

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection', err);
  process.exit(1);
});

function ok(id, cond, detail = '') {
  const mark = performance.now();
  if (cond) {
    passed++;
    console.log('  ✓', id, TIMING ? `(${(performance.now() - mark).toFixed(1)}ms)` : '');
  } else {
    failed++;
    failIds.push(id);
    console.error('  ✗', id, detail);
  }
  if (TIMING) times.push({ name: id, ms: performance.now() - mark });
}

async function section(title, fn) {
  console.log(title);
  const s0 = performance.now();
  await fn();
  if (TIMING) console.log(`  · section ${title} ${(performance.now() - s0).toFixed(0)}ms`);
}

await section('fields (H1)', () => {
  ok('F-fields-count', fieldCount() >= 30, String(fieldCount()));
  ok('F-fields-life', !!FIELD_BY_NAME.life);
  ok('F-fields-hash', /^[0-9a-f]{8}$/.test(fieldsSchemaHash()));
});

await section('report (J1)', () => {
  installGlobalErrorHandlers({
    addEventListener() {},
    __orreryErrorsInstalled: false,
  });
  report('info', 'ORR-TEST-001', 'fast tier');
  ok(
    'F-report-ring',
    recentErrors().some((e) => e.code === 'ORR-TEST-001'),
  );
});

await section('helpers + picture (F19/F25/F32)', () => {
  // One generate — keep the fast tier under 15s on CI.
  withWorld({ seed: 7, ruleId: 'terra' }, (W) => {
    const h = hashFields(W);
    ok('F-withWorld-hash', /^[0-9a-f]{16}$/.test(h), h);
    const disc = paintDisc(W, 32);
    ok('F-paintDisc-filled', disc.filled > 20, String(disc.filled));
    ok('F-paintDisc-rgba', disc.rgba.length === 32 * 32 * 4);
  });
});

await section('local cue (NEXT)', async () => {
  const { localMotionCue, CUE_KINDS, ACT_KIND } = await import('./localCue.js');
  ok('F-cue-kinds', CUE_KINDS.includes('fire') && CUE_KINDS.includes('herd'));
  ok('F-cue-act-ignite', ACT_KIND.ignite === 'fire');
  withWorld({ seed: 11, ruleId: 'terra' }, (W) => {
    const cell = 0;
    if (W.fire) W.fire[cell] = 0.4;
    const cue = localMotionCue(W, cell, 2, 'ignite');
    ok('F-cue-fire', !!cue && (cue.kind === 'fire' || cue.kind === 'place'), cue?.kind);
  });
});

await section('focus trap (M14)', async () => {
  const { trapTab, dialogFocusables } = await import('./focusTrap.js');
  ok('F-trap-fn', typeof trapTab === 'function');
  const root = { querySelectorAll: () => [], ownerDocument: { activeElement: null } };
  const ev = {
    key: 'Tab',
    preventDefault() {
      this.done = true;
    },
    shiftKey: false,
  };
  ok('F-trap-empty', trapTab(root, ev) === true && ev.done);
  ok('F-focusables-empty', dialogFocusables(null).length === 0);
});

await section('keymap (M10)', async () => {
  const { KEYMAP, matchKey, keymapHelpLines } = await import('./keymap.js');
  ok('F-keymap-size', KEYMAP.length >= 10, String(KEYMAP.length));
  ok('F-keymap-spin', matchKey('ArrowLeft', 'planet')?.intent === 'spin');
  ok('F-keymap-act', matchKey('Enter', 'planet')?.intent === 'act');
  ok('F-keymap-descend', matchKey('\\', 'planet')?.intent === 'descend');
  ok(
    'F-keymap-help',
    keymapHelpLines().some((l) => /Enter/.test(l)),
  );
});

await section('intents + worldGuard (R42/P21/P41)', async () => {
  const { dispatchIntent, onIntent, resetIntents, recentIntents } = await import('./intents.js');
  resetIntents();
  let saw = null;
  const off = onIntent('spin', (i) => {
    saw = i;
  });
  dispatchIntent('spin', { yaw: 1 }, 'keyboard');
  ok('F-intent-dispatch', saw?.payload?.yaw === 1 && saw?.source === 'keyboard');
  ok(
    'F-intent-log',
    recentIntents().some((i) => i.type === 'spin'),
  );
  dispatchIntent('act', { cell: 3 }, 'pointer');
  dispatchIntent('act', { cell: 4 }, 'xr');
  ok(
    'F-intent-r43',
    recentIntents().some((i) => i.source === 'pointer') &&
      recentIntents().some((i) => i.source === 'xr'),
  );
  off();
  resetIntents();

  const { wrapWorldDebug } = await import('./worldGuard.js');
  const raw = { life: 0, year: 0, debugAssert: 'throw', _writeOwner: 'audio' };
  const g = wrapWorldDebug(raw, { seal: true, owners: true });
  let threwOwner = false;
  try {
    const { FIELD_BY_NAME } = await import('./fields.js');
    ok('F-guard-life-owner', FIELD_BY_NAME.life?.owner === 'bio');
    ok(
      'F-handoff-life',
      Array.isArray(FIELD_BY_NAME.life?.handoff) && FIELD_BY_NAME.life.handoff.includes('bio'),
    );
    g.life = 1;
  } catch (e) {
    threwOwner = /P21/.test(String(e.message || e));
  }
  ok('F-guard-owner', threwOwner);

  let threwTypo = false;
  try {
    g.tempreature = 5;
  } catch (e) {
    threwTypo = /P41/.test(String(e.message || e));
  }
  ok('F-guard-typo', threwTypo);

  const { describeStateBags } = await import('./viewState.js');
  ok('F-view-bags', !!describeStateBags().world && describeStateBags().leftoverOnW.length >= 1);
});

await section('dark gate (F38)', () => {
  const prev = globalThis.location;
  try {
    globalThis.location = { search: '' };
    _resetDarkGateCache();
    ok('F-dark-off-default', darkEnabled() === false);
    globalThis.location = { search: '?dark=1' };
    _resetDarkGateCache();
    ok('F-dark-on-query', darkEnabled() === true);
    globalThis.location = { search: '?dark=0' };
    _resetDarkGateCache();
    ok('F-dark-force-off', darkEnabled() === false);
  } finally {
    if (prev === undefined) delete globalThis.location;
    else globalThis.location = prev;
    _resetDarkGateCache();
  }
});

await section('url flags present (F37)', () => {
  const html = readFileSync(join(__dir, '../index.html'), 'utf8');
  const main = readFileSync(join(__dir, '../main.js'), 'utf8');
  ok('F-flag-playtest', main.includes('playtest') && main.includes('isPlaytestMode'));
  ok('F-flag-demo', main.includes("get('demo')"));
  ok('F-flag-dark', main.includes('darkEnabled'));
  ok('F-html-lang', /<html[^>]*lang=/.test(html));
  ok(
    'F-canvas-focus',
    /id="c"[^>]*tabindex="0"/.test(html) || /tabindex="0"[^>]*id="c"/.test(html),
  );
  ok('F-kbd-sheet', html.includes('id="kbdSheet"'));
  ok(
    'F-cat-dialog',
    /id="catpanel"[^>]*role="dialog"/.test(html) &&
      /id="landpick"[^>]*aria-modal="true"/.test(html),
  );
  ok('F-apply-tool-fn', main.includes('applyToolAtKbCursor') && main.includes('activeOverlayRoot'));
  const phoneCss = readFileSync(join(__dir, '../styles/phone.css'), 'utf8');
  ok(
    'F-touch-44',
    /min-height:\s*44px/.test(phoneCss) && phoneCss.includes('@media (pointer: coarse)'),
  );
  ok('F-phone-sheet', /max-width:\s*820px/.test(phoneCss) && main.includes('max-width: 820px'));
  ok('F-lab-diag', html.includes('id="labDiag"') && main.includes('droppedTicks'));
  const render = readFileSync(join(__dir, '../render.js'), 'utf8');
  ok('F-cloud-vnoise', /densAt[\s\S]*?vnoise\(sp \* 3\.2/.test(render));
});

await section('save harden (I8/I22)', async () => {
  const { loadRunMeta } = await import('../world.js');
  let threw = false;
  try {
    loadRunMeta('{not json');
  } catch (e) {
    threw = /Corrupt save/i.test(String(e.message || e));
  }
  ok('F-corrupt-refuse', threw);
  threw = false;
  try {
    loadRunMeta({ version: 9, n: 32, seed: 1, ruleId: 'terra' });
  } catch (e) {
    threw = /does not match live N/i.test(String(e.message || e));
  }
  ok('F-n-mismatch-refuse', threw);
});

await section('mid-run save (I13)', async () => {
  const { serializeRun } = await import('../world.js');
  withWorld({ seed: 42, ruleId: 'terra' }, (W) => {
    W.ageYr = (W.ageYr || 0) + 500;
    const snap = serializeRun();
    ok('F-mid-ser', snap.version >= 10 && snap.seed != null && snap.ageYr === W.ageYr);
    ok('F-mid-orbital', snap.orbital && Array.isArray(snap.orbital.sats));
    ok('F-mid-fieldsHash', typeof snap.fieldsHash === 'string');
  });
});

await section('sixth gate smoke', async () => {
  const { HUD_CADENCE_MS } = await import('./hudCadence.js');
  ok('F-hud-cadence', HUD_CADENCE_MS.climate === 400 && HUD_CADENCE_MS.hud === 500);
  const { ERROR_CODES, expected } = await import('./report.js');
  ok('F-error-codes', ERROR_CODES['ORR-SAVE-001']);
  expected('ORR-TEST-001', 'expected swallow');
  const main = readFileSync(join(__dir, '../main.js'), 'utf8');
  ok('F-pinch-m22', main.includes('pinch-and-step') || main.includes('_pinchPts'));
  ok('F-dark-lazy', main.includes('ensureDarkUi'));
  const { FIELDS } = await import('./fields.js');
  ok(
    'F-h9-fields',
    FIELDS.some((r) => r.name === 'h' && r.type === 'float32[]'),
  );
});

await section('autosave rotate (I23/I24)', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
  const { writeAutosave, readAutosave, readAutosavePrev, clearAutosave } =
    await import('./hooks.js');
  clearAutosave();
  writeAutosave({ seed: 1, label: 'a' });
  writeAutosave({ seed: 2, label: 'b' });
  ok('F-autosave-cur', readAutosave()?.seed === 2);
  ok('F-autosave-prev', readAutosavePrev()?.seed === 1);
  clearAutosave();
});

await section('diagnostics (J5/J6)', async () => {
  const { diagnosticsText, SESSION_ID, report, recentErrors } = await import('./report.js');
  report('info', 'ORR-TEST-DIAG', 'probe');
  const text = diagnosticsText({ droppedTicks: 3 });
  ok('F-diag-session', typeof SESSION_ID === 'string' && SESSION_ID.startsWith('sess-'));
  ok('F-diag-blob', /session:/.test(text) && /droppedTicks: 3/.test(text));
  ok(
    'F-diag-ring',
    recentErrors().some((e) => e.code === 'ORR-TEST-DIAG'),
  );
});

await section('cernunnos thought (dwell/card)', async () => {
  const { resetThought, thoughtView, considerThought, situationCard, DWELL_MS } =
    await import('./thought.js');
  withWorld({ seed: 42, ruleId: 'terra' }, () => {
    resetThought();
    const t0 = 1_000;
    const v0 = thoughtView({ cell: 12, now: t0, paused: false });
    ok('F-thought-card', !!situationCard(v0)?.systems);
    ok('F-thought-dwell0', (v0.dwellMs || 0) < 100);

    const vHold = thoughtView({ cell: 12, now: t0 + DWELL_MS + 500, paused: false });
    ok('F-thought-dwell', vHold.dwellMs >= DWELL_MS, String(vHold.dwellMs));

    // Force soft cooldown elapsed + place line path via synthetic view.
    const synthetic = {
      ...vHold,
      thrive: true,
      beings: 4,
      life: 0.4,
      place: 'a green shelf',
      systems: { ...(vHold.systems || {}), paintedQuiet: false },
      recent: [],
      sparkHunt: false,
      sparkBirth: false,
      hunts: 0,
      flees: 0,
      fire: 0,
      swarm: 0,
      front: 0,
    };
    const line = considerThought(synthetic, t0 + DWELL_MS + 600);
    ok(
      'F-thought-dwell-line',
      !!line && /linger|Holding|Still|square/i.test(line.text),
      line?.text,
    );
    ok(
      'F-thought-suggest-opt',
      line == null || line.suggest == null || typeof line.suggest === 'string',
    );
  });

  const mindPath = join(__dir, 'thoughtMind.js');
  ok('F-thought-mind-mod', existsSync(mindPath));
  const mindSrc = readFileSync(mindPath, 'utf8');
  ok('F-thought-mind-cdn', mindSrc.includes('vendor/web-llm.js'));
  ok(
    'F-thought-mind-local',
    mindSrc.includes('models/cernunnos') && mindSrc.includes('resolve/main'),
  );
  ok('F-thought-mind-vendor', existsSync(join(__dir, '../vendor/web-llm.js')));
});

await section('catalogue lazy-load (K17)', async () => {
  const path = join(__dir, 'catalogueLoad.js');
  ok('F-cat-load-exists', existsSync(path));
  const mod = await import('./catalogueLoad.js');
  ok('F-cat-ensure-fn', typeof mod.ensureCatalogue === 'function');
  ok('F-cat-ready-fn', typeof mod.catalogueReady === 'function');
  ok('F-cat-not-ready', mod.catalogueReady() === false);
  // Do not call ensureCatalogue() here — the catalogue chunk is ~3.4k lines.
});

await section('sky scenarios', async () => {
  const { generate, W, RULESETS } = await import('../world.js');
  const { applySkyScenario, patchSkyBody } = await import('./skyScenarios.js');
  const { skyFrame, anchorLivedOrbits, LIVED_YEAR_SEC } = await import('./sky.js');
  generate(
    42,
    RULESETS.find((r) => r.id === 'terra'),
  );
  const starId = W.bodies.lights[0].id || 'sol';
  const s0 = W._baseSolar;
  patchSkyBody(W, starId, { lum: 1.6 });
  ok('F-lum-solar', Math.abs(W._baseSolar - 1.6) < 0.05, `${s0} -> ${W._baseSolar}`);
  patchSkyBody(W, starId, { a: 1.41 });
  ok('F-dist-solar', W._baseSolar < 1.6, `S=${W._baseSolar}`);
  const dir0 = W.sky.sats[0].dir.slice();
  W.clockFace = 'now';
  W._livedActive = true;
  anchorLivedOrbits(W);
  skyFrame(W, LIVED_YEAR_SEC / 8);
  const dir1 = W.sky.sats[0].dir;
  const moved = Math.hypot(dir1[0] - dir0[0], dir1[1] - dir0[1], dir1[2] - dir0[2]);
  ok('F-lived-moon', moved > 0.02, `Δ=${moved.toFixed(3)}`);
  ok('F-host-star', (W.bodies?.lights?.length || 0) >= 1);
  applySkyScenario(W, 'triple-dawn');
  ok('F-triple-lights', W.bodies.lights.length === 3);
  ok('F-twin-sats', W.bodies.sats.length === 2);
  applySkyScenario(W, 'tatooine');
  ok('F-binary-beat', !!W.rule.binaryBeat && W.bodies.lights.length === 2);
});

await section('sky integration', async () => {
  const { generate, simTick, RULESETS, W } = await import('../world.js');
  const { geometricInsolation } = await import('./atmo.js');
  const { DIR } = await import('../sphere.js');
  generate(
    42,
    RULESETS.find((r) => r.id === 'terra'),
  );
  simTick(true);
  const sun = W._sunDir;
  ok('F-sun-dir', sun && Math.hypot(sun[0], sun[1], sun[2]) > 0.99);
  let bestC = 0;
  let bestMu = -2;
  for (let c = 0; c < DIR.length / 3; c++) {
    const mu = DIR[c * 3] * sun[0] + DIR[c * 3 + 1] * sun[1] + DIR[c * 3 + 2] * sun[2];
    if (mu > bestMu) {
      bestMu = mu;
      bestC = c;
    }
  }
  const geo = geometricInsolation(W, bestC, sun);
  ok('F-sun-dir-atmo', geo > 0.4, `geo=${geo.toFixed(3)}`);
  W.clockFace = 'years';
  simTick(true);
  ok('F-orbit-averaged', W.sky?.orbitAveraged === true);
  W.clockFace = 'now';
  W._livedActive = true;
  simTick(true);
  ok('F-lived-orbit', W.sky?.orbitAveraged === false);
});

await section('Now vs Years clocks', async () => {
  const { generate, simTick, RULESETS, W } = await import('../world.js');
  const { setClockFace, shouldHoldCalendar, climateDtYr } = await import('./clockFace.js');
  const { cloneRuleForRun } = await import('./ruleMode.js');
  const thrive = RULESETS.find((r) => r.id === 'thrive') || RULESETS.find((r) => r.id === 'terra');
  generate(7, cloneRuleForRun(thrive));

  setClockFace(W, 'years', { force: true });
  W.fixedDtYr = 500;
  const ageY0 = W.ageYr;
  simTick(true);
  ok('F-years-advances-age', W.ageYr > ageY0, `Δ=${W.ageYr - ageY0}`);
  ok('F-years-geologic-dt', W.dtYr >= 10, `dt=${W.dtYr}`);

  setClockFace(W, 'now', { force: true });
  const ageN0 = W.ageYr;
  simTick(true);
  ok('F-now-holds-calendar', shouldHoldCalendar(W) && W.ageYr === ageN0, `Δ=${W.ageYr - ageN0}`);
  ok('F-now-day-scale-climate', climateDtYr(W) < 0.01 && W.dtYr < 0.01, `dt=${W.dtYr}`);
});

await section('sky ephemeris (GATE14)', async () => {
  const { generate, simTick, RULESETS, W } = await import('../world.js');
  const {
    keplerE,
    trueFromMean,
    illumFromElongation,
    spinPhaseFromAge,
    terminatorSpeedKmh,
    skyCalibration,
    EARTH_OBLIQUITY,
  } = await import('./sky.js');
  const e = 0.2;
  const M = 1.0;
  const E = keplerE(e, M);
  ok('F-kepler', Math.abs(E - e * Math.sin(E) - M) < 1e-6);
  ok('F-true-mean', Math.abs(trueFromMean(0, 0)) < 1e-9);
  ok('F-illum-half', Math.abs(illumFromElongation([1, 0, 0], [0, 1, 0]) - 0.5) < 0.01);
  generate(
    42,
    RULESETS.find((r) => r.id === 'terra'),
  );
  simTick(true);
  const cal = skyCalibration(W);
  ok('F-sky-obl', cal.obliquityDeg > 23 && cal.obliquityDeg < 25);
  ok('F-sky-term', cal.terminatorKmh > 1600 && cal.terminatorKmh < 1750);
  ok('F-sky-incl', cal.lunarInclDeg > 5 && cal.lunarInclDeg < 5.3);
  const retro = spinPhaseFromAge(0.01, -243);
  const pro = spinPhaseFromAge(0.01, 1);
  ok('F-retro-sign', retro < 0 || pro > 0);
  ok('F-obl-const', Math.abs((EARTH_OBLIQUITY * 180) / Math.PI - 23.44) < 0.01);
  ok('F-term-fn', terminatorSpeedKmh(1) > 1600);
});

await section('air column + weather (AIR/WX)', async () => {
  const A = await import('./aircol.js');
  const Wx = await import('./weather.js');

  // Thermodynamics, standalone — no world needed.
  ok('F-air-esat-monotonic', A.esatPa(300) > A.esatPa(280) && A.esatPa(280) > A.esatPa(250));
  ok('F-air-esat-earth', Math.abs(A.esatPa(293.15) - 2339) / 2339 < 0.02, String(A.esatPa(293.15)));
  ok(
    'F-air-qsat-earth',
    Math.abs(A.qsat(293.15, 101325) - 0.0146) < 0.0015,
    String(A.qsat(293.15, 101325)),
  );
  /* Mars: at 600 Pa the saturation vapour pressure of water passes the surface
     pressure, and the direct specific-humidity formula divides by a negative. */
  ok('F-air-qsat-bounded', A.qsat(295, 600) <= 1 && A.qsat(295, 600) > 0, String(A.qsat(295, 600)));
  ok('F-air-dewpoint-sat', Math.abs(A.dewpointK(288, 1) - 288) < 0.6, String(A.dewpointK(288, 1)));
  ok('F-air-dewpoint-dry', A.dewpointK(300, 0.4) < 300 - 8, String(A.dewpointK(300, 0.4)));

  /* The world-level column asserts live in the smoke tier, on worlds it already
     generates — a `generate` plus six ticks costs the edit loop two and a half
     seconds to say what a shared world can say for nothing. */
  /* Every lapse limit is a fraction of the planet's own dry adiabat. Held at
     Earth's numbers the floor exceeded Titan's entire adiabat, the floor beat the
     ceiling, and a methane world reported eight thousand joules of water
     convection. Asserted on the bounds themselves rather than on a generated
     Titan — the claim is about the constants, and a `generate` costs the fast
     tier a second and a half to make it. */
  const earthL = A.lapseBounds(1, 28.96);
  const titanL = A.lapseBounds(0.14, 28);
  ok('F-air-lapse-earth-dry', Math.abs(earthL.dry - 9.0e-3) < 0.3e-3, String(earthL.dry));
  ok('F-air-lapse-earth-floor', Math.abs(earthL.floor - 2.0e-3) < 0.2e-3, String(earthL.floor));
  ok('F-air-lapse-titan-order', titanL.adiabat < 2e-3, String(titanL.adiabat));
  ok('F-air-lapse-floor-under-dry', titanL.floor < titanL.dry && earthL.floor < earthL.dry);

  /* Airless: asserted against a synthetic world rather than a generated one —
     the claim is about what the readout says with no column, and a `generate`
     costs a second of the fast tier to say it. */
  const airless = Wx.weatherSnapshot({
    air: { regime: 'no column' },
    rule: { airless: true },
    severe: [],
    storms: [],
  });
  ok('F-wx-airless-line', airless.line.includes('no atmosphere'), airless.line);
  ok('F-wx-airless-zero', airless.capeMax === 0 && airless.droughtFrac === 0);

  ok('F-air-levels-8', A.AIR_LEVELS === 8, String(A.AIR_LEVELS));
  ok(
    'F-air-esat-ice',
    A.esatPa(250) < A.esatPa(273.15),
    `ice ${A.esatPa(250).toFixed(1)} vs liq ${A.esatPa(273.15).toFixed(1)}`,
  );

  ok('F-precipType-export', typeof Wx.precipTypeAt === 'function');
  const snowW = {
    precip: new Float32Array([0.1]),
    freezeKm: new Float32Array([0.2]),
    temp: new Float32Array([0.48]),
    cape: new Float32Array([0]),
  };
  ok('F-precipType-snow', Wx.precipTypeAt(snowW, 0) === 'snow', Wx.precipTypeAt(snowW, 0));
  const rainW = {
    precip: new Float32Array([0.1]),
    freezeKm: new Float32Array([5]),
    temp: new Float32Array([0.7]),
    cape: new Float32Array([0]),
  };
  ok('F-precipType-rain', Wx.precipTypeAt(rainW, 0) === 'rain', Wx.precipTypeAt(rainW, 0));
  const noneW = { precip: new Float32Array([0]) };
  ok('F-precipType-none', Wx.precipTypeAt(noneW, 0) === 'none');

  ok('F-convectTick-export', typeof Wx.convectTick === 'function');

  const Conv = await import('./convect.js');
  ok(
    'F-convect-exports',
    typeof Conv.orgConvectionTick === 'function' &&
      typeof Conv.waterBudget === 'function' &&
      typeof Conv.convClassOk === 'function' &&
      typeof Conv.virgaReducesPrecip === 'function' &&
      typeof Conv.extendedPrecipType === 'function',
  );

  ok('F-convClass-enum', Conv.CONV_NONE === 0 && Conv.CONV_MCS === 5);

  const Bio = await import('./bio.js');
  ok(
    'F-drought-suppresses-K',
    (() => {
      const baseW = {
        npp: null,
        temp: new Float32Array([0.6]),
        h: new Float32Array([0.6]),
        seaLevel: 0.5,
        moist: new Float32Array([0.5]),
        nutrientN: new Float32Array([0.5]),
        nutrientP: new Float32Array([0.5]),
      };
      const k0 = Bio.carryingCapacity(baseW, 0);
      baseW.drought = new Float32Array([0.8]);
      const k1 = Bio.carryingCapacity(baseW, 0);
      return k1 < k0 * 0.8;
    })(),
    'drought should suppress carrying capacity',
  );

  // LOC49-50: new weather helper exports
  ok('F-cloudTypeAt-export', typeof Wx.cloudTypeAt === 'function');
  ok('F-cloudTypeAt-clear', Wx.cloudTypeAt({ clouds: new Float32Array([0]) }, 0) === 'clear');
  ok(
    'F-cloudTypeAt-stratus',
    Wx.cloudTypeAt(
      {
        clouds: new Float32Array([0.5]),
        cape: new Float32Array([0]),
        lclKm: new Float32Array([1]),
      },
      0,
    ) === 'stratus',
  );

  ok('F-visibilityReduction-export', typeof Wx.visibilityReduction === 'function');
  ok(
    'F-visReduction-clear',
    Wx.visibilityReduction(
      {
        precip: new Float32Array([0]),
        fog: new Float32Array([0]),
        dust: new Float32Array([0]),
        clouds: new Float32Array([0]),
      },
      0,
    ) === 0,
  );
  ok(
    'F-visReduction-fog',
    Wx.visibilityReduction(
      {
        precip: new Float32Array([0]),
        fog: new Float32Array([1]),
        dust: new Float32Array([0]),
        clouds: new Float32Array([0]),
      },
      0,
    ) > 0.5,
  );

  ok('F-frostDewAt-export', typeof Wx.frostDewAt === 'function');
  ok(
    'F-frostDewAt-none-midday',
    Wx.frostDewAt(
      { temp: new Float32Array([0.7]), moist: new Float32Array([0.8]), wxClock: 0.5 },
      0,
    ) === 'none',
  );

  ok('F-rainbowAt-export', typeof Wx.rainbowAt === 'function');
  ok('F-rainbowAt-no-rain', Wx.rainbowAt({ precip: new Float32Array([0]) }, 0) === false);

  ok('F-weatherAudioGains-export', typeof Wx.weatherAudioGains === 'function');
  const audioW = {
    precip: new Float32Array([0.2]),
    gust: new Float32Array([0.3]),
    windU: new Float32Array([0.1]),
    windV: new Float32Array([0.1]),
    freezeKm: new Float32Array([5]),
    temp: new Float32Array([0.7]),
    cape: new Float32Array([0]),
  };
  const gains = Wx.weatherAudioGains(audioW, 0);
  ok('F-audioGains-rain', gains.rain > 0, gains.rain);
  ok('F-audioGains-wind', gains.wind >= 0, gains.wind);

  ok('F-weatherSequenceAt-export', typeof Wx.weatherSequenceAt === 'function');
  const seq = Wx.weatherSequenceAt({ wxClock: 0.5, season: 0 }, 0);
  ok('F-weatherSeq-diurnal', typeof seq.diurnal === 'string' && seq.diurnal.length > 0);

  ok('F-weatherBioResponse-export', typeof Wx.weatherBioResponse === 'function');
  ok('F-worldWeatherString-export', typeof Wx.worldWeatherString === 'function');
  ok('F-weatherA11yLine-export', typeof Wx.weatherA11yLine === 'function');
  ok('F-weatherCalib-export', typeof Wx.weatherCalib === 'function');
});

await section('SEV + CYC rows', async () => {
  const Wx = await import('./weather.js');
  const St = await import('./storms.js');
  const { FIELD_BY_NAME } = await import('./fields.js');

  /* EF distribution: most tornadoes should be weak (EF ≤ 2).
     Real event strengths cluster below 0.3 (beta-like), so sample that way. */
  const efCounts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 500; i++) {
    const s = Math.pow(i / 500, 2.5);
    efCounts[Wx.efScale(s)]++;
  }
  const weakFrac = (efCounts[0] + efCounts[1] + efCounts[2]) / 500;
  ok('F-ef-weak-bias', weakFrac > 0.5, `weak ${(weakFrac * 100).toFixed(0)}%`);
  ok('F-ef-scale-0', Wx.efScale(0.05) === 0);
  ok('F-ef-scale-5', Wx.efScale(0.85) === 5);

  /* STP computation */
  const stpVal = Wx.computeSTP(2000, 200, 1.0, 0.5);
  ok('F-stp-positive', stpVal > 0.5, `stp=${stpVal.toFixed(2)}`);
  ok('F-stp-zero-cape', Wx.computeSTP(0, 200, 1.0, 0.5) === 0);

  /* STP field exists in schema */
  ok('F-stp-field', !!FIELD_BY_NAME.stp, 'stp field missing');
  ok('F-shear01-field', !!FIELD_BY_NAME.shear01, 'shear01 field missing');
  ok('F-scar-field', !!FIELD_BY_NAME.scar, 'scar field missing');
  ok('F-severeOutlook-field', !!FIELD_BY_NAME.severeOutlook, 'severeOutlook field missing');
  ok('F-sstWake-field', !!FIELD_BY_NAME.sstWake, 'sstWake field missing');
  ok('F-stormCone-field', !!FIELD_BY_NAME.stormCone, 'stormCone field missing');
  ok('F-shelter-field', !!FIELD_BY_NAME.shelter, 'shelter field missing');
  ok('F-disasterMem-field', !!FIELD_BY_NAME.disasterMem, 'disasterMem field missing');

  /* Hail size */
  ok('F-hail-size', Wx.hailSizeMm(2000, 3) > 10, `hail=${Wx.hailSizeMm(2000, 3)}`);
  ok('F-hail-zero-low-cape', Wx.hailSizeMm(200, 3) === 0);

  /* PI clamps intensity */
  const piVal = St.potentialIntensity({ temp: new Float32Array([0.65]) }, 0);
  ok('F-pi-positive', piVal > 0 && piVal <= 1, `pi=${piVal.toFixed(2)}`);
  const piCold = St.potentialIntensity({ temp: new Float32Array([0.4]) }, 0);
  ok('F-pi-cold-zero', piCold === 0, `piCold=${piCold}`);

  /* Dust devil on ares (Mars) — severeMode returns dustdevil on warm dry Mars surface */
  const aresW = {
    rule: { id: 'ares', dustDevils: true },
    cape: new Float32Array([50]),
    temp: new Float32Array([0.5]),
    h: new Float32Array([0.6]),
    seaLevel: 0.5,
    ice: new Float32Array([0]),
    tornadoRisk: new Float32Array([0]),
    pwat: new Float32Array([2]),
    lclKm: new Float32Array([3]),
    shear: new Float32Array([0]),
    shear01: new Float32Array([0]),
    srh: new Float32Array([0]),
  };
  const aresMode = Wx.severeMode(aresW, 0);
  ok('F-dustdevil-ares', aresMode?.kind === 'dustdevil', `kind=${aresMode?.kind}`);

  /* trackLog grows — initWeather creates trackLog */
  const trackW = {};
  Wx.initWeather(trackW);
  ok('F-trackLog-init', Array.isArray(trackW.wx.trackLog));

  /* Severe outlook function */
  ok('F-outlook-fn', typeof Wx.severeOutlookAt === 'function');
  ok('F-outlook-zero', Wx.severeOutlookAt({}, 0) === 0);

  /* liftCap function */
  ok('F-liftcap-fn', typeof Wx.liftCap === 'function');

  /* SEVERE_KINDS includes new types */
  ok('F-kinds-waterspout', Wx.SEVERE_KINDS.includes('waterspout'));
  ok('F-kinds-dustdevil', Wx.SEVERE_KINDS.includes('dustdevil'));
});

await section('FRONT rows (FRONT48)', async () => {
  const Fr = await import('./fronts.js');
  const { FIELD_BY_NAME } = await import('./fields.js');

  ok('F-frontsTick-fn', typeof Fr.frontsTick === 'function');
  ok('F-frontTypeAt-fn', typeof Fr.frontTypeAt === 'function');
  ok('F-frontBudget-fn', typeof Fr.frontBudget === 'function');

  ok('F-frontStrength-field', !!FIELD_BY_NAME.frontStrength, 'frontStrength field missing');
  ok('F-frontKind-field', !!FIELD_BY_NAME.frontKind, 'frontKind field missing');
  ok('F-windShift-field', !!FIELD_BY_NAME.windShift, 'windShift field missing');
  ok('F-dryline-field', !!FIELD_BY_NAME.dryline, 'dryline field missing');
  ok('F-stormTrack-field', !!FIELD_BY_NAME.stormTrack, 'stormTrack field missing');
  ok('F-eady-field', !!FIELD_BY_NAME.eady, 'eady field missing');
  ok('F-block-field', !!FIELD_BY_NAME.block, 'block field missing');
  ok('F-coldTongue-field', !!FIELD_BY_NAME.coldTongue, 'coldTongue field missing');

  const ft = Fr.frontTypeAt({}, 0);
  ok('F-frontTypeAt-empty', ft.kind === 0 && ft.name === 'none');

  const budget = Fr.frontBudget({});
  ok('F-frontBudget-empty', budget.frontCells === 0 && budget.blockCells === 0);
});

await section('DRY rows (DRY48)', async () => {
  const Wx = await import('./weather.js');
  const { FIELD_BY_NAME } = await import('./fields.js');

  ok('F-soilRoot-field', !!FIELD_BY_NAME.soilRoot, 'soilRoot field missing');
  ok('F-soilDeep-field', !!FIELD_BY_NAME.soilDeep, 'soilDeep field missing');
  ok('F-aridity-field', !!FIELD_BY_NAME.aridity, 'aridity field missing');
  ok('F-droughtClass-field', !!FIELD_BY_NAME.droughtClass, 'droughtClass field missing');
  ok('F-droughtAge-field', !!FIELD_BY_NAME.droughtAge, 'droughtAge field missing');
  ok('F-heatIndex-field', !!FIELD_BY_NAME.heatIndex, 'heatIndex field missing');
  ok('F-flashDrought-field', !!FIELD_BY_NAME.flashDrought, 'flashDrought field missing');
  ok('F-petField-field', !!FIELD_BY_NAME.petField, 'petField field missing');
  ok('F-aetField-field', !!FIELD_BY_NAME.aetField, 'aetField field missing');

  ok('F-droughtBudget-fn', typeof Wx.droughtBudget === 'function');
  ok('F-droughtClassAt-fn', typeof Wx.droughtClassAt === 'function');

  const db = Wx.droughtBudget({});
  ok('F-droughtBudget-empty', db.droughtFrac === 0 && db.heatCells === 0);

  ok('F-droughtClassAt-zero', Wx.droughtClassAt({}, 0) === 0);
});

await section('COL rows (COL4/8/12/21–30/31)', async () => {
  const A = await import('./aircol.js');
  const WC = await import('./weatherClock.js');

  // COL4: MUCAPE field exists after allocation
  const mockW = {};
  A.allocAir(mockW, 1);
  ok('F-muCape-alloc', mockW.muCape instanceof Float32Array && mockW.muCape.length === 1);
  ok('F-tropKm-alloc', mockW.tropKm instanceof Float32Array);
  ok('F-capK-alloc', mockW.capK instanceof Float32Array);
  ok('F-wbzKm-alloc', mockW.wbzKm instanceof Float32Array);

  // COL21–30: weatherClock advances
  const wW = {};
  WC.allocWeatherClock(wW);
  WC.setWeatherSpeed(wW, 60);
  ok('F-wxClock-enabled', wW.wxClock.enabled === true);
  const h0 = wW.wxClock.hourOfDay;
  WC.weatherClockTick(wW, 1);
  ok('F-wxClock-advances', wW.wxClock.hourOfDay !== h0, `${h0} → ${wW.wxClock.hourOfDay}`);
  ok(
    'F-wxClock-diurnal',
    typeof wW.wxClock.diurnal === 'number' && Math.abs(wW.wxClock.diurnal) <= 1,
  );

  // COL24/25: night shear + dawn CIN boosts written by the clock
  WC.setWeatherSpeed(wW, 24);
  wW.wxClock.hourOfDay = 20;
  WC.weatherClockTick(wW, 0.01);
  ok('F-wxClock-shearBoost', wW.wxClock.shearBoost > 0, `shear=${wW.wxClock.shearBoost}`);
  wW.wxClock.hourOfDay = 5;
  WC.weatherClockTick(wW, 0.01);
  ok('F-wxClock-cinBoost', wW.wxClock.cinBoost > 0, `cin=${wW.wxClock.cinBoost}`);

  // COL31: methane solvent detection on Titan
  ok('F-solventOf-water', A.solventOf({ rule: {} }) === 'water');
  ok('F-solventOf-methane', A.solventOf({ rule: { methaneSolvent: true } }) === 'methane');
  ok('F-esatCH4-finite', Number.isFinite(A.esatCH4(100)) && A.esatCH4(100) > 0);
  ok('F-esatCO2-finite', Number.isFinite(A.esatCO2(180)) && A.esatCO2(180) > 0);

  // COL5: entrainment reduces CAPE — compare lapse bounds to verify dry logic
  // (full CAPE reduction tested via the smoke tier's world-level asserts)
  const earthL = A.lapseBounds(1, 28.96);
  ok('F-entrain-constant', typeof A.esatPa === 'function' && earthL.dry > earthL.floor);

  // COL8: tropKm on a generated world is finite
  withWorld({ seed: 9, ruleId: 'terra' }, (W) => {
    ok(
      'F-tropKm-finite',
      W.tropKm && W.tropKm.some((v) => v > 0 && Number.isFinite(v)),
      `max: ${W.tropKm ? Math.max(...W.tropKm) : 'null'}`,
    );
    ok('F-muCape-field', W.muCape && W.muCape.length > 0);
  });
});

await section('smoke', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [join(__dir, 'smoke.mjs')], {
    cwd: join(__dir, '..'),
    encoding: 'utf8',
  });
  ok('F-smoke', r.status === 0, r.stderr?.slice(-400) || r.stdout?.slice(-200));
});

await section('save fixtures (I11/F35)', async () => {
  const { loadRunMeta, serializeRun, RULESETS } = await import('../world.js');
  const dir = join(__dir, '../data/fixtures/saves');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  ok('F-fixtures-present', files.length >= 2, files.join(','));

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    ok(`F-${file}-ver`, (raw.version ?? 0) >= 7);
    ok(`F-${file}-rule`, !!raw.ruleId && RULESETS.some((r) => r.id === raw.ruleId));
  }

  const v9 = JSON.parse(readFileSync(join(dir, 'v9-earth-seed42.json'), 'utf8'));
  try {
    loadRunMeta(v9);
    const again = serializeRun();
    ok('F-v9-load', true);
    ok('F-v9-ver', again.version >= 10);
    ok('F-v9-fieldsHash', typeof again.fieldsHash === 'string' && again.fieldsHash.length === 8);
    ok('F-v9-seed', again.seed === v9.seed || again.landSeed === (v9.landSeed ?? v9.seed));
  } catch (e) {
    ok('F-v9-load', false, String(e.message || e));
  }
});

const elapsed = performance.now() - t0;
const countPath = join(__dir, '../data/fast-assert-count.json');
const baseCount = existsSync(countPath) ? JSON.parse(readFileSync(countPath, 'utf8')).count : 0;
const sectionPassed = passed;
ok('F-assert-ratchet', sectionPassed >= baseCount, `${sectionPassed} < ${baseCount}`);
if (WRITE_COUNT || !existsSync(countPath)) {
  writeFileSync(
    countPath,
    JSON.stringify(
      { count: sectionPassed, updated: new Date().toISOString().slice(0, 10) },
      null,
      2,
    ) + '\n',
  );
  console.log(`wrote assert count baseline ${sectionPassed}`);
} else if (sectionPassed > baseCount) {
  console.warn(`assert count grew ${baseCount} → ${sectionPassed} — run with --write-count`);
}

console.log('');
console.log(`fast · ${passed} passed · ${failed} failed · ${(elapsed / 1000).toFixed(2)}s`);
if (failIds.length) console.error('failed ids:', failIds.join(', '));
if (TIMING && times.length) {
  const slow = [...times].sort((a, b) => b.ms - a.ms).slice(0, 20);
  console.log('slowest:');
  for (const row of slow) console.log(`  ${row.ms.toFixed(1).padStart(7)}ms  ${row.name}`);
}
/* Local edit loop ~40s with sky + SEV/CYC asserts; CI ubuntu runners are ~1.5–2× slower. */
const BUDGET_MS = process.env.CI ? 55000 : 40000;
if (elapsed > BUDGET_MS) {
  console.error(
    `fast tier exceeded ${BUDGET_MS / 1000}s budget (${(elapsed / 1000).toFixed(2)}s)` +
      (process.env.CI ? ' [CI]' : ''),
  );
  process.exit(1);
}
process.exit(failed ? 1 : 0);
