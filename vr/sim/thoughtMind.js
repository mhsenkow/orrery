/** Optional on-device Cernunnos mind — WebLLM + SmolLM2 in the browser.
 *
 *  Two ways to get weights:
 *    1. Prepack: `npm run cernunnos:fetch` → vr/models/cernunnos/resolve/main/
 *       (HF URL shape — WebLLM requests `${model}/resolve/main/<file>`)
 *    2. Download: first enable pulls from Hugging Face into browser storage
 *
 *  Runtime: vendored `@mlc-ai/web-llm` at vr/vendor/web-llm.js
 *  (`npm run cernunnos:runtime`). Do not load via esm.sh — it breaks ArtifactCache.
 *  Templates in thought.js always work without this.
 */

import { situationCard } from './thought.js';
import { expected } from './report.js';

/** Pref key — 'on' means user asked for the local mind. */
export const MIND_PREF_KEY = 'orrery.thoughtMind';

export const MIND_MODEL = {
  /** Small instruct model (~376 MB VRAM q4f16). */
  id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
  idNoF16: 'SmolLM2-360M-Instruct-q4f32_1-MLC',
  hf: 'https://huggingface.co/mlc-ai/SmolLM2-360M-Instruct-q4f16_1-MLC',
  hfNoF16: 'https://huggingface.co/mlc-ai/SmolLM2-360M-Instruct-q4f32_1-MLC',
  /**
   * Local "repo root". WebLLM fetches `${localDir}resolve/main/<file>`.
   * Files live under vr/models/cernunnos/resolve/main/.
   */
  localDir: './models/cernunnos/',
  label: 'SmolLM2 360M',
  approxMb: 220,
};

/** @typedef {'off'|'probing'|'ready'|'loading'|'error'|'unsupported'} MindStatus */

/** @type {{
 *  status: MindStatus,
 *  progress: string,
 *  error: string,
 *  source: 'local'|'cdn'|'',
 *  engine: any,
 *  busy: boolean,
 *  loadPromise: Promise<boolean>|null,
 * }} */
const state = {
  status: 'off',
  progress: '',
  error: '',
  source: '',
  engine: null,
  busy: false,
  loadPromise: null,
};

const listeners = new Set();

export function mindStatus() {
  return {
    status: state.status,
    progress: state.progress,
    error: state.error,
    source: state.source,
    ready: state.status === 'ready' && !!state.engine,
    busy: state.busy,
    modelLabel: MIND_MODEL.label,
    approxMb: MIND_MODEL.approxMb,
  };
}

export function onMindStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  const snap = mindStatus();
  for (const fn of listeners) {
    try { fn(snap); } catch { expected('ORR-EXPECTED-LAZY', 'mind listener'); }
  }
}

function setStatus(status, extra = {}) {
  state.status = status;
  if (extra.progress != null) state.progress = extra.progress;
  if (extra.error != null) state.error = extra.error;
  if (extra.source != null) state.source = extra.source;
  emit();
}

export function mindPrefOn() {
  try { return localStorage.getItem(MIND_PREF_KEY) === 'on'; }
  catch { return false; }
}

export function setMindPref(on) {
  try { localStorage.setItem(MIND_PREF_KEY, on ? 'on' : 'off'); }
  catch { expected('ORR-EXPECTED-STORAGE', 'mind pref'); }
}

/** Probe whether a prepackaged model is sitting under ./models/cernunnos/resolve/main/. */
export async function probeLocalModel() {
  try {
    const base = new URL(MIND_MODEL.localDir, location.href);
    // Only poke small JSON — not the multi‑MB shards.
    for (const rel of [
      'resolve/main/mlc-chat-config.json',
      'resolve/main/tensor-cache.json',
    ]) {
      const r = await fetch(new URL(rel, base).href, { method: 'GET', cache: 'no-cache' });
      if (!r.ok) return false;
      try { r.body?.cancel?.(); } catch { expected('ORR-EXPECTED-LAZY', 'mind probe cancel'); }
    }
    return true;
  } catch {
    return false;
  }
}

export async function webgpuOk() {
  try {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

/** App directory URL (`…/vr/`) so vendor resolves in both source and dist builds. */
function appDirUrl() {
  return new URL('.', location.href);
}

function vendorWebllmUrl() {
  return new URL('vendor/web-llm.js', appDirUrl()).href;
}

async function loadWebllm() {
  const url = vendorWebllmUrl();
  try {
    return await import(url);
  } catch (e) {
    const tip = 'Run npm run cernunnos:runtime (vendors @mlc-ai/web-llm into vr/vendor/).';
    throw new Error(`Mind runtime missing at ${url}. ${tip} (${e?.message || e})`);
  }
}

function preferF16() {
  return true;
}

function explainCacheError(err) {
  const msg = err?.message || String(err);
  if (/ArtifactCache is not a constructor/i.test(msg)) {
    return 'Mind runtime is broken (stale CDN). Run npm run cernunnos:runtime, hard-refresh, retry.';
  }
  if (/Cache['"]?\s*\.\s*add|add' on 'Cache'|Request failed|Network response was not ok|Failed to store/i.test(msg)) {
    return 'Model file missing from prepack (often tensor-cache.json). '
      + 'Run npm run cernunnos:fetch, hard-refresh, retry Local mind.';
  }
  return msg;
}

function buildAppConfig(webllm, { local, useF16 }) {
  const modelId = useF16 ? MIND_MODEL.id : MIND_MODEL.idNoF16;
  // Trailing slash omitted — WebLLM joins `${model}/resolve/main/…`.
  const modelUrl = local
    ? new URL(MIND_MODEL.localDir, location.href).href.replace(/\/?$/, '')
    : (useF16 ? MIND_MODEL.hf : MIND_MODEL.hfNoF16);

  const prebuilt = webllm.prebuiltAppConfig?.model_list?.find((m) => m.model_id === modelId);
  const model_lib = prebuilt?.model_lib;
  if (!model_lib) return null;

  const listEntry = {
    model: modelUrl,
    model_id: local ? `cernunnos-${modelId}` : modelId,
    model_lib,
    low_resource_required: true,
    vram_required_MB: prebuilt.vram_required_MB || 400,
    required_features: prebuilt.required_features,
    overrides: {
      ...(prebuilt.overrides || {}),
      context_window_size: 2048,
      prefill_chunk_size: 1024,
    },
  };

  return {
    ...webllm.prebuiltAppConfig,
    // IndexedDB avoids Cache.add quirks on some Chrome/Mac setups.
    cacheBackend: 'indexeddb',
    useIndexedDBCache: true,
    model_list: local
      ? [listEntry, ...(webllm.prebuiltAppConfig?.model_list || [])]
      : (webllm.prebuiltAppConfig?.model_list || [listEntry]),
  };
}

/**
 * Load the engine. Safe to call repeatedly — shares one promise.
 * @param {{ forceDownload?: boolean }} [opts]
 */
export async function ensureMind(opts = {}) {
  if (state.engine && state.status === 'ready') return true;
  if (state.loadPromise) return state.loadPromise;

  state.loadPromise = (async () => {
    if (!(await webgpuOk())) {
      setStatus('unsupported', { error: 'WebGPU unavailable — richer voice needs a WebGPU browser.' });
      return false;
    }

    setStatus('loading', { progress: 'Loading mind runtime…', error: '' });

    let webllm;
    try {
      webllm = await loadWebllm();
    } catch (e) {
      setStatus('error', { error: explainCacheError(e) });
      return false;
    }

    if (typeof webllm.CreateMLCEngine !== 'function') {
      setStatus('error', {
        error: 'Mind runtime loaded but CreateMLCEngine is missing — re-run npm run cernunnos:runtime.',
      });
      return false;
    }

    const local = !opts.forceDownload && (await probeLocalModel());
    const useF16 = preferF16();

    const tryLoad = async (f16) => {
      const modelId = f16 ? MIND_MODEL.id : MIND_MODEL.idNoF16;
      const engineOpts = {
        initProgressCallback: (r) => {
          const text = r?.text || (r?.progress != null ? `${Math.round(r.progress * 100)}%` : '');
          setStatus('loading', {
            progress: text || 'Downloading model…',
            source: local ? 'local' : 'cdn',
          });
        },
      };

      if (local) {
        const appConfig = buildAppConfig(webllm, { local: true, useF16: f16 });
        if (!appConfig) throw new Error('Could not resolve model_lib for local mind');
        engineOpts.appConfig = appConfig;
        return webllm.CreateMLCEngine(appConfig.model_list[0].model_id, engineOpts);
      }

      engineOpts.appConfig = {
        ...webllm.prebuiltAppConfig,
        cacheBackend: 'indexeddb',
        useIndexedDBCache: true,
      };
      return webllm.CreateMLCEngine(modelId, engineOpts);
    };

    try {
      state.engine = await tryLoad(useF16);
      setMindPref(true);
      setStatus('ready', {
        progress: local ? 'Ready (prepackaged)' : 'Ready (downloaded · cached)',
        source: local ? 'local' : 'cdn',
        error: '',
      });
      return true;
    } catch (e1) {
      try {
        state.engine = await tryLoad(false);
        setMindPref(true);
        setStatus('ready', {
          progress: 'Ready (fp32 fallback)',
          source: local ? 'local' : 'cdn',
          error: '',
        });
        return true;
      } catch (e2) {
        state.engine = null;
        setStatus('error', {
          error: explainCacheError(e2) || explainCacheError(e1),
          progress: '',
        });
        return false;
      }
    } finally {
      state.loadPromise = null;
    }
  })();

  return state.loadPromise;
}

export async function unloadMind() {
  setMindPref(false);
  const eng = state.engine;
  state.engine = null;
  setStatus('off', { progress: '', error: '', source: '' });
  try {
    if (eng?.unload) await eng.unload();
  } catch { expected('ORR-EXPECTED-LAZY', 'mind unload'); }
}

const SYSTEM = `You are Cernunnos, the quiet animal voice of Orrery — a planet god-game.
Write ONE short line (max 28 words) about what the player is viewing. Story first; concrete place and motion; no HUD jargon, no bullet lists, no quotes around the line.
If a suggestion fits, end with " · " and one short imperative (max 10 words). Otherwise no suggestion.
Stay in character. Do not invent species names not in the card.`;

/**
 * Rewrite a template line using the local mind. Returns null if busy/unavailable.
 * @param {{ text: string, tone?: string, suggest?: string }} line
 * @param {object} view from thoughtView()
 */
export async function rewriteThought(line, view) {
  if (!line?.text || !state.engine || state.status !== 'ready' || state.busy) return null;
  if (line.tone === 'warn') return null;

  state.busy = true;
  emit();
  try {
    const card = line.card || situationCard(view);
    const user = [
      `Tone: ${line.tone || 'soft'}`,
      `Template: ${line.text}`,
      line.suggest ? `Template suggestion: ${line.suggest}` : '',
      `Situation JSON: ${JSON.stringify(card)}`,
    ].filter(Boolean).join('\n');

    const out = await state.engine.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      max_tokens: 72,
    });

    let text = out?.choices?.[0]?.message?.content?.trim() || '';
    text = text.replace(/^["'«»]+|["'«»]+$/g, '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 8) return null;

    let suggest = line.suggest || null;
    const split = text.split(/\s·\s|\s•\s/);
    if (split.length >= 2) {
      text = split[0].trim();
      suggest = split.slice(1).join(' · ').trim() || suggest;
    }
    if (text.length > 180) text = text.slice(0, 177) + '…';

    return {
      kicker: line.kicker || 'Cernunnos',
      text,
      tone: line.tone || 'soft',
      key: line.key,
      suggest,
      fromMind: true,
    };
  } catch (e) {
    setStatus('ready', { progress: `Mind hiccup: ${e?.message || e}` });
    return null;
  } finally {
    state.busy = false;
    emit();
  }
}

/** Whether soft/dwell lines should try a mind rewrite. */
export function shouldRewrite(line) {
  if (!line || line.tone === 'warn' || line.tone === 'wild') return false;
  return state.status === 'ready' && !!state.engine && !state.busy;
}
