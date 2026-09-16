#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { append, verifyChain } from '../src/ledger/index.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const subject = 'DEMO-DENIED-WRITE';
const attemptedTarget = 'data/demo-denied-write.txt';
const hookPayload = {
  tool_name: 'Write',
  tool_input: { file_path: attemptedTarget },
};

const result = spawnSync(process.execPath, ['hooks/publish-gate.mjs'], {
  cwd: REPO_ROOT,
  input: JSON.stringify(hookPayload),
  encoding: 'utf8',
  env: process.env,
});

if (result.error) {
  process.stderr.write(`demo:denied could not run publish gate: ${result.error.message}\n`);
  process.exitCode = 1;
} else if (result.status !== 2) {
  process.stderr.write(`GUARD FAILURE: write was not denied (publish-gate exit ${result.status})\n`);
  process.exitCode = 1;
} else {
  const reason = result.stderr.trim();
  const receipt = append('effect_denied', 'publish-gate', subject, {
    receipt_type: 'DenialReceipt',
    effect_id: 'filesystem-write',
    rule: 'write-boundary',
    verdict: null,
    mismatch: {
      field: 'tool_input.file_path',
      expected: 'policy.writeBoundary.allow',
      actual: attemptedTarget,
    },
    gate_reason: reason,
  });
  const chain = verifyChain(subject);
  console.log(`attempt  ${attemptedTarget}`);
  console.log(`gate     DENIED (exit ${result.status}) — ${reason}`);
  console.log(`ledger   ${receipt.kind} rule=${receipt.payload.rule} target=${receipt.payload.mismatch.actual}`);
  console.log(`chain    ${chain.ok ? 'VALID' : 'BROKEN'}`);
  process.exitCode = chain.ok ? 0 : 1;
}
