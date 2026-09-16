/**
 * schemas.test.mjs — the schema contract gate:
 *   1. scripts/validate-schemas.mjs (default fixture mode) exits 0 — every
 *      evals/expected fixture behaves as named.
 *   2. With ajv directly: the fabricated CoC report (a missing record claimed
 *      present) is REJECTED by schemas/coc-report.schema.json, and the
 *      complete report validates. This is the anti-fabrication guarantee.
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
const loadJson = (rel) => JSON.parse(readFileSync(path.join(REPO_ROOT, ...rel.split('/')), 'utf8'));

function makeAjv() {
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
  return ajv;
}

test('validate-schemas default mode exits 0 (all fixtures behave as named)', () => {
  const res = spawnSync(process.execPath, ['scripts/validate-schemas.mjs'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.ifError(res.error);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /ALL GOOD/);
});

test('fabricated CoC report is rejected by coc-report.schema.json', () => {
  const ajv = makeAjv();
  const validate = ajv.compile(loadJson('schemas/coc-report.schema.json'));
  const fabricated = loadJson('evals/expected/coc-report.fabricated.invalid.json');
  assert.equal(validate(fabricated), false, 'a missing record claimed present must not validate');
});

test('complete CoC report validates against coc-report.schema.json', () => {
  const ajv = makeAjv();
  const validate = ajv.compile(loadJson('schemas/coc-report.schema.json'));
  const complete = loadJson('evals/expected/coc-report.complete.valid.json');
  assert.equal(validate(complete), true, JSON.stringify(validate.errors));
});

test('complete CoC report with verifier exit code 3 is rejected', () => {
  const ajv = makeAjv();
  const validate = ajv.compile(loadJson('schemas/coc-report.schema.json'));
  const complete = loadJson('evals/expected/coc-report.complete.valid.json');
  complete.verifier.exit_code = 3;
  assert.equal(validate(complete), false, 'a complete report must carry verifier exit code 0');
});
