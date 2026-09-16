/**
 * data-integrity.test.mjs — the synthetic dataset is the ground truth every
 * agent guarantee rests on. These tests prove the index matches disk after
 * canonical LF normalization, and that the baked-in demo truths still hold.
 *
 * Run: node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = path.join(REPO_ROOT, 'data');
const loadData = (rel) => JSON.parse(readFileSync(path.join(DATA_ROOT, ...rel.split('/')), 'utf8'));
const absOf = (rel) => path.join(DATA_ROOT, ...rel.split('/'));

const index = loadData('index.json');
const ncrs = loadData('exports/qms/ncr-export.json').ncrs;
const heats = loadData('exports/erp/heat-lot-export.json').heat_lots;
const manifests = loadData('exports/quality/cert-manifests.json').manifests;
const scrapLines = readFileSync(path.join(DATA_ROOT, 'exports', 'erp', 'scrap-export.csv'), 'utf8').trim().split('\n');

const sha256 = (rel) =>
  createHash('sha256').update(readFileSync(absOf(rel), 'utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex');

test('every data/index.json entry exists on disk and re-hashes after CRLF-to-LF normalization', () => {
  const entries = Object.entries(index.documents);
  assert.ok(entries.length > 0, 'index has no documents');
  for (const [rel, recorded] of entries) {
    assert.ok(existsSync(absOf(rel)), `missing on disk: ${rel}`);
    assert.equal(sha256(rel), recorded, `hash mismatch: ${rel}`);
  }
});

test('counts match: 160 docs, 36 NCRs, 20 heats, 72 scrap rows', () => {
  assert.equal(Object.keys(index.documents).length, 160);
  assert.equal(index.counts.documents, 160);
  assert.equal(ncrs.length, 36);
  assert.equal(index.counts.ncrs, 36);
  assert.equal(heats.length, 20);
  assert.equal(index.counts.heat_lots, 20);
  assert.equal(scrapLines.length - 1, 72); // minus header
  assert.equal(index.counts.scrap_rows, 72);
});

test('every NCR heat_number exists in the heat-lot export', () => {
  const known = new Set(heats.map((h) => h.heat_number));
  for (const n of ncrs) {
    assert.ok(known.has(n.heat_number), `${n.ncr_id} references unknown heat ${n.heat_number}`);
  }
});

test('both PO heats exist in the heat-lot export', () => {
  const known = new Set(heats.map((h) => h.heat_number));
  for (const [po, m] of Object.entries(manifests)) {
    assert.ok(known.has(m.heat), `${po} references unknown heat ${m.heat}`);
  }
  assert.ok(known.has(4471) && known.has(4468));
});

test('HT-4471 mechanical-test is absent; HT-4468 mechanical-test is present', () => {
  const absent = 'docs/heat-lots/HT-4471/mechanical-test-HT-4471.md';
  const present = 'docs/heat-lots/HT-4468/mechanical-test-HT-4468.md';
  assert.equal(Object.hasOwn(index.documents, absent), false, `${absent} must not be indexed`);
  assert.equal(existsSync(absOf(absent)), false, `${absent} must not exist on disk`);
  assert.ok(Object.hasOwn(index.documents, present), `${present} must be indexed`);
  assert.ok(existsSync(absOf(present)), `${present} must exist on disk`);
  // HT-4471's other records ARE on file — the gap is exactly one record.
  assert.ok(Object.hasOwn(index.documents, 'docs/heat-lots/HT-4471/chemistry-cert-HT-4471.md'));
});

test('KC-1015 has exactly the 4 story NCRs (shrinkage / P02 series)', () => {
  const story = ncrs
    .filter((n) => n.part_number === 'KC-1015' && n.defect_type === 'shrinkage' && n.cause_code === 'P02')
    .map((n) => n.ncr_id)
    .sort();
  assert.deepEqual(story, ['NCR-2026-0091', 'NCR-2026-0098', 'NCR-2026-0107', 'NCR-2026-0114']);
});
