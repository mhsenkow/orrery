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
/* Local edit loop ~30s with sky asserts; CI ubuntu runners are ~1.5–2× slower. */
const BUDGET_MS = process.env.CI ? 45000 : 30000;
if (elapsed > BUDGET_MS) {
  console.error(
    `fast tier exceeded ${BUDGET_MS / 1000}s budget (${(elapsed / 1000).toFixed(2)}s)` +
      (process.env.CI ? ' [CI]' : ''),
  );
  process.exit(1);
}
process.exit(failed ? 1 : 0);
