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

const BUDGET = 800; // H28 — growth needs a reason
const nameCount = census.nameCount;
if (nameCount > BUDGET) {
  console.error(`field budget exceeded: ${nameCount} > ${BUDGET}`);
  process.exit(1);
}

const report = {
  updated: new Date().toISOString().slice(0, 10),
  censusNames: nameCount,
  budget: BUDGET,
  curatedRows: fieldCount(),
  curatedSaved: FIELDS.filter((r) => r.saved).length,
  byKind,
  uncurated: draft.uncurated,
  note: 'H3/H28 — classify via fields-census; curate into fields.js',
};

writeFileSync(join(ROOT, 'vr/data/fields/report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  `fields-report · census=${nameCount}/${BUDGET} · curated=${fieldCount()} · uncurated=${draft.uncurated}`,
);

// Spot-check: every curated name appears in the census.
let missing = 0;
for (const name of Object.keys(FIELD_BY_NAME)) {
  if (census.names[name] == null) missing++;
}
if (missing) {
  console.warn(`warn: ${missing} curated names absent from census (derived/rare)`);
}
