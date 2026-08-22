/** Failure reporting — quality-400 J1/J2/J19 subset.
 *  Global handlers route here; showErr is injected from main. */

const RING = [];
const RING_MAX = 50;
let _showErr = null;
let _bootDefer = true;
/** Session id for paste-ready reports (J6). */
let _sessSeq = 0;
export const SESSION_ID = `sess-${Date.now().toString(36)}-${(++_sessSeq).toString(36)}`;

export function setErrorSink(fn) {
  _showErr = typeof fn === 'function' ? fn : null;
}

export function endBootDeferral() {
  _bootDefer = false;
}

export function recentErrors() {
  return RING.slice();
}

/** Paste-ready diagnostics blob — J5/J6/J14. */
export function diagnosticsText(extra = {}) {
  const lines = [
    'ORRERY diagnostics',
    `when: ${new Date().toISOString()}`,
    `session: ${SESSION_ID}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    'errors:',
  ];
  const errs = recentErrors();
  if (!errs.length) lines.push('  (none)');
  else {
    for (const e of errs.slice(-20)) {
      lines.push(`  [${e.level}] ${e.code} ${e.detail}`);
    }
  }
  return lines.join('\n');
}

/**
 * @param {'info'|'degraded'|'broken'} level
 * @param {string} code  e.g. ORR-BOOT-001
 * @param {string} detail
 * @param {object} [extra]
 */
export function report(level, code, detail, extra = {}) {
  const row = {
    t: Date.now(),
    level,
    code,
    detail: String(detail || ''),
    ...extra,
  };
  RING.push(row);
  if (RING.length > RING_MAX) RING.shift();

  const msg = `[${code}] ${row.detail}`;
  if (level === 'broken') console.error(msg, extra);
  else if (level === 'degraded') console.warn(msg, extra);
  else console.info(msg);

  // J23 — do not toast-storm during boot unless broken.
  if (_showErr && (level === 'broken' || (!_bootDefer && level === 'degraded'))) {
    try {
      _showErr(row.detail, code);
    } catch {
      /* sink must not throw */
      void 0;
    }
  }
  return row;
}

/** J9 — greppable swallow for expected failures (private mode, autoplay, …). */
export function expected(code, detail = '') {
  return report('info', code, detail || 'expected', { expected: true });
}

/** Stable codes for J20/J21 — keep briefs/error-codes.md in sync. */
export const ERROR_CODES = Object.freeze({
  'ORR-UNCAUGHT-001': 'window error',
  'ORR-UNCAUGHT-002': 'unhandledrejection',
  'ORR-GPGPU-001': 'GPGPU init failed — CPU climate',
  'ORR-SAVE-001': 'Autosave quota exceeded',
  'ORR-SAVE-002': 'Autosave failed (private mode / other)',
  'ORR-TEST-001': 'Harness self-test',
  'ORR-TEST-DIAG': 'Diagnostics probe',
  'ORR-EXPECTED-STORAGE': 'storage blocked / private mode',
  'ORR-EXPECTED-URL': 'location / search params unavailable',
  'ORR-EXPECTED-FOCUS': 'element focus failed',
  'ORR-EXPECTED-LAYOUT': 'local layout not ready',
  'ORR-EXPECTED-GL': 'GL not ready',
  'ORR-EXPECTED-LAZY': 'optional chunk failed',
  'ORR-EXPECTED-SAVE': 'serialize during boot',
  'ORR-EXPECTED-MEDIA': 'matchMedia unavailable',
  'ORR-EXPECTED-XR': 'XR haptic optional',
});

/** Install window handlers once (J1). */
export function installGlobalErrorHandlers(globalObj = globalThis) {
  if (globalObj.__orreryErrorsInstalled) return;
  globalObj.__orreryErrorsInstalled = true;

  const onError = (event) => {
    const msg =
      event?.message || event?.reason?.message || String(event?.reason || event || 'error');
    const file = event?.filename ? ` (${event.filename}:${event.lineno || '?'})` : '';
    report('broken', 'ORR-UNCAUGHT-001', msg + file, { raw: true });
  };
  const onRej = (event) => {
    const r = event?.reason;
    const msg = r?.message || String(r || 'unhandledrejection');
    report('broken', 'ORR-UNCAUGHT-002', msg, { raw: true });
  };

  if (typeof globalObj.addEventListener === 'function') {
    globalObj.addEventListener('error', onError);
    globalObj.addEventListener('unhandledrejection', onRej);
  } else {
    globalObj.onerror = (message, source, lineno) => {
      report('broken', 'ORR-UNCAUGHT-001', `${message} (${source}:${lineno})`);
    };
    globalObj.onunhandledrejection = onRej;
  }
}
