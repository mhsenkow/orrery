#!/usr/bin/env node
/** Copy @mlc-ai/web-llm into vr/vendor for the unbundled /vr/ server.
 *
 *  esm.sh rebundles break `ArtifactCache` (not a constructor). The package's
 *  own lib/index.js is the supported browser bundle.
 *
 *  Usage: npm run cernunnos:runtime
 */

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'vr/vendor');
const OUT = join(OUT_DIR, 'web-llm.js');
const require = createRequire(import.meta.url);

let src;
try {
  src = require.resolve('@mlc-ai/web-llm/lib/index.js');
} catch {
  console.error('cernunnos:runtime — install @mlc-ai/web-llm first (npm install)');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
cpSync(src, OUT);
writeFileSync(
  join(OUT_DIR, 'README.md'),
  `# Vendored runtimes

\`web-llm.js\` is copied from \`@mlc-ai/web-llm\` by \`npm run cernunnos:runtime\`.
Do not edit by hand. Regenerate after upgrading the dependency.

Used by \`vr/sim/thoughtMind.js\` for on-device Cernunnos (Local mind).
`,
);

const kb = (await import('node:fs')).statSync(OUT).size / 1024;
console.log(`cernunnos:runtime → vr/vendor/web-llm.js (${kb.toFixed(0)} KB)`);
