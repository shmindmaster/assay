/**
 * completeness.test.mjs — the fail-closed verifier contract:
 *   PO-AER-5519 -> exit 3, mechanical-test missing (the refusal case)
 *   PO-MER-5532 -> exit 0, complete              (the positive case)
 *   BOGUS-PO    -> exit 2                        (usage error)
 *
 * Run: node --test tests/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCompleteness } from '../scripts/verify-completeness.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function verify(po) {
  const res = spawnSync(process.execPath, ['scripts/verify-completeness.mjs', po, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.ifError(res.error);
  return { status: res.status, report: res.stdout.trim() ? JSON.parse(res.stdout) : null, stderr: res.stderr };
}

test('PO-AER-5519 exits 3 with mechanical-test missing', () => {
  const { status, report } = verify('PO-AER-5519');
  assert.equal(status, 3);
  assert.equal(report.status, 'incomplete');
  assert.deepEqual(report.missing_records, ['mechanical-test']);
  assert.equal(report.exit_code, 3);
  const item = report.items.find((i) => i.type === 'mechanical-test');
  assert.equal(item.integrity, 'missing');
  assert.equal(item.on_file, false);
});

test('PO-MER-5532 exits 0 complete with nothing missing', () => {
  const { status, report } = verify('PO-MER-5532');
  assert.equal(status, 0);
  assert.equal(report.status, 'complete');
  assert.deepEqual(report.missing_records, []);
  assert.ok(report.items.every((i) => i.integrity === 'ok' && i.on_file === true));
});

test('exported verifier result is the same canonical result printed by the CLI', () => {
  const { report } = verify('PO-MER-5532');
  assert.deepEqual(verifyCompleteness('PO-MER-5532'), report);
});

test('BOGUS-PO exits 2 (usage error)', () => {
  const { status, stderr } = verify('BOGUS-PO');
  assert.equal(status, 2);
  assert.match(stderr, /unknown PO/);
});
