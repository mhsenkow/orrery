#!/usr/bin/env node
/** Prefetch Cernunnos local-mind weights into vr/models/cernunnos/.
 *
 *  Usage: npm run cernunnos:fetch
 *  Optional: npm run cernunnos:fetch -- --fp32   (no shader-f16)
 *
 *  Layout mirrors Hugging Face so WebLLM's `${model}/resolve/main/…` URLs hit:
 *    vr/models/cernunnos/resolve/main/<files>
 *
 *  Runtime wasm still loads from the MLC CDN (small).
 */

import { createWriteStream, existsSync, mkdirSync, writeFileSync, renameSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Repo-root style URL base — WebLLM appends /resolve/main/<file>. */
const OUT_ROOT = join(ROOT, 'vr/models/cernunnos');
const OUT = join(OUT_ROOT, 'resolve/main');
const FP32 = process.argv.includes('--fp32');
const REPO = FP32
  ? 'mlc-ai/SmolLM2-360M-Instruct-q4f32_1-MLC'
  : 'mlc-ai/SmolLM2-360M-Instruct-q4f16_1-MLC';
const BASE = `https://huggingface.co/${REPO}/resolve/main`;

const SEED_FILES = [
  'mlc-chat-config.json',
  'ndarray-cache.json',
  'tensor-cache.json', // WebLLM / tvmjs loads this name (not only ndarray-cache)
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.json',
  'merges.txt',
];

async function fetchOk(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}

async function downloadFile(rel, destDir) {
  const url = `${BASE}/${rel}`;
  const dest = join(destDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(dest)) {
    console.log('  skip', rel);
    return;
  }
  console.log('  get ', rel);
  const r = await fetchOk(url);
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(r.body), createWriteStream(tmp));
  renameSync(tmp, dest);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`cernunnos:fetch → ${OUT}`);
  console.log(`repo ${REPO}`);

  for (const f of SEED_FILES) {
    try {
      await downloadFile(f, OUT);
    } catch (e) {
      if (f === 'vocab.json' || f === 'merges.txt') {
        console.log('  optional miss', f);
        continue;
      }
      // Older MLC packs only shipped ndarray-cache; WebLLM wants tensor-cache.json.
      if (f === 'tensor-cache.json' && existsSync(join(OUT, 'ndarray-cache.json'))) {
        console.log('  copy ndarray-cache.json → tensor-cache.json');
        cpSync(join(OUT, 'ndarray-cache.json'), join(OUT, 'tensor-cache.json'));
        continue;
      }
      throw e;
    }
  }

  // Safety alias some loaders still probe (seen as …/resolve/cache.json in the wild).
  const tensor = join(OUT, 'tensor-cache.json');
  const alias = join(OUT_ROOT, 'resolve', 'cache.json');
  if (existsSync(tensor)) {
    mkdirSync(dirname(alias), { recursive: true });
    cpSync(tensor, alias);
  }

  const cachePath = join(OUT, 'ndarray-cache.json');
  if (!existsSync(cachePath)) {
    console.error('ndarray-cache.json missing — cannot discover param shards');
    process.exit(1);
  }
  const cache = JSON.parse(await (await import('node:fs/promises')).readFile(cachePath, 'utf8'));
  const records = cache.records || [];
  const files = new Set();
  for (const rec of records) {
    if (rec?.dataPath) files.add(rec.dataPath);
  }
  if (!files.size) {
    for (const guess of ['params_shard_0.bin']) files.add(guess);
  }

  for (const rel of [...files].sort()) {
    await downloadFile(rel, OUT);
  }

  writeFileSync(
    join(OUT, 'SOURCE.json'),
    JSON.stringify(
      {
        repo: REPO,
        fetched: new Date().toISOString().slice(0, 10),
        layout: 'resolve/main (WebLLM HF URL shape)',
        note: 'Prepackaged Cernunnos mind weights. Runtime wasm still from MLC CDN.',
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`done · ${files.size} shard(s) · enable View → Guides → Local mind`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
