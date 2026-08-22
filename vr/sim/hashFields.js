/** Field hash for golden / round-trip — quality-400 F25.
 *  Extracted from headless so tests import without running the CLI. */

import { createHash } from 'node:crypto';

export function hashFields(W) {
  const h = createHash('sha256');
  for (const key of ['h', 'temp', 'life', 'ice', 'moist']) {
    if (W[key]) h.update(Buffer.from(W[key].buffer));
  }
  if (W.gases) h.update(JSON.stringify(W.gases));
  h.update(String(W.ageYr));
  h.update(String(W.meanLife));
  return h.digest('hex').slice(0, 16);
}
