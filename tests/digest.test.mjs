/**
 * digest.test.mjs — the weekly digest render contract:
 *   1. scripts/render-digest.mjs --from-data exits 0 and emits both artifacts.
 *   2. The HTML carries the demo story (PO-AER-5519 gap, mechanical-test,
 *      KC-1015 repeat offender, P02 top mover, EA-7 audit gap, inline SVG) and
 *      makes zero external requests (no http:// or https:// anywhere).
 *   3. The emitted digest-input JSON validates against
 *      schemas/digest-input.schema.json (ajv, draft 2020-12).
 *
 * Run: node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRAFTS = path.join(REPO_ROOT, 'reports', 'drafts');
const HTML_PATH = path.join(DRAFTS, 'quality-digest-2026-08-02.html');
const JSON_PATH = path.join(DRAFTS, 'digest-input-2026-08-02.json');
const loadJson = (rel) => JSON.parse(readFileSync(path.join(REPO_ROOT, ...rel.split('/')), 'utf8'));

test('render-digest exits 0 and emits the draft HTML + input JSON', () => {
  const res = spawnSync(process.execPath, ['scripts/render-digest.mjs', '--from-data'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.ifError(res.error);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /quality-digest-2026-08-02\.html/);
});

test('digest HTML contains the demo story and inline SVG', () => {
  const html = readFileSync(HTML_PATH, 'utf8');
  for (const s of ['PO-AER-5519', 'mechanical-test', 'KC-1015', 'P02', 'EA-7', '<svg']) {
    assert.ok(html.includes(s), `digest HTML must contain ${JSON.stringify(s)}`);
  }
});

test('digest HTML leads with management decisions and their evidence boundaries', () => {
  const html = readFileSync(HTML_PATH, 'utf8');
  for (const heading of [
    'Investigate P02 Molding',
    'Do not complete PO-AER-5519',
    'Follow up on audit evidence',
  ]) {
    assert.ok(html.includes(heading), `digest HTML must contain decision heading ${JSON.stringify(heading)}`);
  }
  assert.equal((html.match(/>Evidence</g) ?? []).length, 3, 'each decision card must show an Evidence label');
  assert.equal((html.match(/>Next action</g) ?? []).length, 3, 'each decision card must show a Next action label');
  assert.ok(
    html.includes('Signals are not root-cause, disposition, shipment, audit, or release decisions.'),
    'digest HTML must state the decision boundary',
  );
});

test('digest HTML is fully self-contained (no external requests)', () => {
  const html = readFileSync(HTML_PATH, 'utf8');
  assert.ok(!html.includes('http://'), 'digest HTML must not contain http://');
  assert.ok(!html.includes('https://'), 'digest HTML must not contain https://');
});

test('emitted digest-input JSON validates against digest-input.schema.json', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  // Same local date format registration as scripts/validate-schemas.mjs.
  ajv.addFormat('date', {
    type: 'string',
    validate: (s) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
      const d = new Date(`${s}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    },
  });
  const validate = ajv.compile(loadJson('schemas/digest-input.schema.json'));
  const digest = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  assert.equal(validate(digest), true, JSON.stringify(validate.errors, null, 2));
  assert.equal(digest.week_ending, '2026-08-02');
});
