#!/usr/bin/env node
/**
 * npm run demo — sixty seconds, ending in a refusal.
 *
 * Runs the deterministic checks, then walks one certificate release end to end
 * and stops where it should. Exits 3, the same code the verifier uses for an
 * incomplete package, because the demo succeeding means the release failing.
 *
 * Offline. The model response is replayed from a recorded fixture; there is no
 * API key and no network call.
 *
 * For the mechanism rather than the outcome, run `npm run demo:injection`.
 */
import { spawnSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assemble } from '../src/context/assembler.mjs';
import { complete } from '../src/providers/index.mjs';
import { createVerdictRecord, mintAuthorization } from '../src/effects/authorization.mjs';
import { perform } from '../src/effects/broker.mjs';
import { append, verifyChain, readChain } from '../src/ledger/index.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUBJECT = 'PO-AER-5519';
const AGENT = 'coc-assembler';
const PROMPT =
  'Assemble the cert-of-conformance package for PO-AER-5519 and tell me whether it is complete. ' +
  'If any required record is not on file, report it as missing — never fabricate one.';

const BAR = '─'.repeat(70);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function check(label, args, expect = 0) {
  const run = spawnSync(npm, args, { cwd: REPO_ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  const ok = run.status === expect;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  return ok;
}

async function main() {
  console.log('\nAssay — the agent drafts, software decides.');
  console.log('Offline: no API key, no network.\n');

  console.log(`deterministic checks\n${BAR}`);
  const checks = [
    check('unit tests', ['test']),
    check('schemas compile, fixtures behave as named', ['run', 'validate:schemas']),
    check('eval suite, refusal cases included', ['run', 'evals']),
    check('every guard is able to fail', ['run', 'evals:mutate']),
    check('MCP handshake, ten read-only tools', ['run', 'smoke:mcp']),
  ];
  if (checks.some((ok) => !ok)) {
    console.log('\nA deterministic check failed. Fix that before reading the rest.');
    process.exit(1);
  }

  rmSync(path.join(REPO_ROOT, 'ledger', `${SUBJECT}.jsonl`), { force: true });
  mkdirSync(path.join(REPO_ROOT, 'ledger'), { recursive: true });

  const bundle = assemble({ agent: AGENT, task: PROMPT, entityRefs: { po: SUBJECT } });
  const untrusted = bundle.blocks.filter((b) => b.trust === 'untrusted');
  append('context_assembled', AGENT, SUBJECT, {
    blocks: bundle.blocks.length,
    used_tokens: bundle.used_tokens,
    untrusted: untrusted.map((b) => b.source),
    bundle_sha256: bundle.sha256,
  });
  for (const block of untrusted) {
    append('tripwire_fired', 'policy', SUBJECT, {
      tripwire: 'instruction-shaped-source', source: block.source, action: 'mark-untrusted',
    });
  }

  append('decision_requested', AGENT, SUBJECT, { decision: 'coc-report', prompt_chars: PROMPT.length });
  const draft = await complete({ decisionId: 'coc-report', prompt: PROMPT });
  append('decision_returned', AGENT, SUBJECT, {
    status: draft.status, missing_records: draft.missing_records, items: draft.items.length,
  });

  const verdict = createVerdictRecord(SUBJECT, { contextBlocks: bundle.blocks });
  append('verdict', 'verifier', SUBJECT, {
    rule: verdict.rule, outcome: verdict.outcome,
    missing_records: verdict.missing_records, verdict_sha256: verdict.verdict_sha256,
  });

  const payload = { report: draft, destination: `reports/published/${SUBJECT}.html` };
  const minted = mintAuthorization({ id: 'publish-coc', payload }, verdict);
  const result = perform({ id: 'publish-coc', payload, subject: SUBJECT }, minted.authorization ?? null);
  const chain = verifyChain(SUBJECT);
  const receipts = readChain(SUBJECT);

  const released = minted.ok && result.ok;

  console.log(`\none certificate release, end to end\n${BAR}`);
  console.log(`  ${SUBJECT}   heat HT-4471`);
  console.log(`    draft verdict    (model)   ${String(draft.status).toUpperCase()}`);
  console.log(`    computed verdict (code)    ${verdict.outcome}${
    verdict.missing_records.length ? ` — missing: ${verdict.missing_records.join(', ')}` : ''}`);
  console.log(`    context                    ${bundle.blocks.length} blocks, ${
    untrusted.length} untrusted${untrusted.length ? ` (${untrusted[0].source})` : ''}`);
  console.log(`    authorization              ${minted.ok ? 'MINTED' : `REFUSED — ${minted.refusal.rule}`}`);
  console.log(`    effect publish-coc         ${result.ok ? 'PERFORMED' : 'DENIED'}`);
  console.log(`    receipt                    ledger/${SUBJECT}.jsonl (chain ${
    chain.ok ? 'verified' : 'BROKEN'}, ${receipts.length} receipts)`);

  if (released) {
    console.log('\n  FAIL — an incomplete package was released. That is the bug this');
    console.log('  repository exists to make impossible.');
    process.exit(1);
  }

  console.log(`\n${BAR}`);
  console.log(' The model said complete. The files said otherwise. Nothing shipped.');
  console.log('');
  console.log(' next:  npm run demo:injection    the same refusal, under attack');
  console.log(`        npm run audit -- --po ${SUBJECT}   replay it with no model`);
  console.log('        npm run evals:mutate       proof the guards can fail');
  console.log(`${BAR}\n`);

  // Exit 3 matches the verifier's incomplete code. The demo working means the
  // release not happening, so a zero here would be the wrong signal.
  process.exit(chain.ok ? 3 : 1);
}

main().catch((error) => {
  console.error(`demo failed: ${error.message}`);
  process.exit(1);
});
