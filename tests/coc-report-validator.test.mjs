/**
 * coc-report-validator.test.mjs — draft reports must exactly match the
 * deterministic completeness verifier, including re-hashed document claims.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const complete = JSON.parse(readFileSync(path.join(REPO_ROOT, 'evals', 'expected', 'coc-report.complete.valid.json'), 'utf8'));

function validateDraft(draft) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kestrel-coc-validator-'));
  const file = path.join(dir, 'draft.json');
  writeFileSync(file, JSON.stringify(draft), 'utf8');
  try {
    const res = spawnSync(process.execPath, ['scripts/validate-coc-report.mjs', file], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.ifError(res.error);
    return res;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('validator accepts the canonical complete report', () => {
  const res = validateDraft(complete);
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test('validator rejects a complete report whose item hash is fabricated', () => {
  const fabricated = structuredClone(complete);
  fabricated.items[0].sha256 = '0'.repeat(64);
  const res = validateDraft(fabricated);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stderr, /items mismatch/);
});

test('evals run deterministic CoC draft contract checks without model runs', () => {
  const res = spawnSync(process.execPath, ['scripts/run-evals.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.ifError(res.error);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /deterministic CoC draft contract checks/);
  assert.match(res.stdout, /no model runs/);
});
