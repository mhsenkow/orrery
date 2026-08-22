#!/usr/bin/env node
/** Field count / classification publish — quality-400 H3/H28/H38. */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELD_BY_NAME, FIELDS, fieldCount } from '../vr/sim/fields.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const census = JSON.parse(readFileSync(join(ROOT, 'vr/data/fields/census.json'), 'utf8'));
const draft = JSON.parse(readFileSync(join(ROOT, 'vr/data/fields/draft.json'), 'utf8'));

const byKind = {};
for (const r of draft.rows) {
  byKind[r.kind] = (byKind[r.kind] || 0) + 1;
}

// P14 / H28 — ratchet at the live census; growth without a schema row fails.
const BASELINE_PATH = join(ROOT, 'vr/data/fields/census-budget.json');
let BUDGET = 800;
try {
  BUDGET = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).maxNames;
} catch {
  /* first run uses 800 until budget file exists */
}
const nameCount = census.nameCount;
if (nameCount > BUDGET) {
  console.error(`field budget exceeded: ${nameCount} > ${BUDGET} (P14)`);
  process.exit(1);
}

const report = {
  updated: new Date().toISOString().slice(0, 10),
  censusNames: nameCount,
  budget: BUDGET,
  curatedRows: fieldCount(),
  curatedSaved: FIELDS.filter((r) => r.saved).length,
  byKind,
  uncurated: draft.uncurated ?? 0,
  schemaCurated: draft.schemaCurated ?? fieldCount(),
  multiWriterCount: draft.multiWriterCount ?? 0,
  note: 'H3/H28/P1/P22 — classify via fields-census; multi-writers in multi-writers.json',
};

writeFileSync(join(ROOT, 'vr/data/fields/report.json'), JSON.stringify(report, null, 2) + '\n');

// P22 — surface multi-writer list beside the report
try {
  const mw = JSON.parse(readFileSync(join(ROOT, 'vr/data/fields/multi-writers.json'), 'utf8'));
  report.multiWritersTop = (mw.rows || []).slice(0, 15);
} catch {
  /* census may not have run yet */
}

// P24 — resolved handoffs
try {
  const ho = JSON.parse(readFileSync(join(ROOT, 'vr/data/fields/handoffs.json'), 'utf8'));
  report.handoffsResolved = (ho.resolved || []).length;
  report.handoffNames = (ho.resolved || []).map((r) => r.name);
} catch {
  report.handoffsResolved = 0;
}

writeFileSync(join(ROOT, 'vr/data/fields/report.json'), JSON.stringify(report, null, 2) + '\n');

console.log(
  `fields-report · census=${nameCount}/${BUDGET} · curated=${fieldCount()} · uncurated=${draft.uncurated ?? 0} · multiWriters=${report.multiWriterCount} · handoffs=${report.handoffsResolved}`,
);

// Spot-check: every curated name appears in the census.
let missing = 0;
for (const name of Object.keys(FIELD_BY_NAME)) {
  if (census.names[name] == null) missing++;
}
if (missing) {
  console.warn(`warn: ${missing} curated names absent from census (derived/rare)`);
}
