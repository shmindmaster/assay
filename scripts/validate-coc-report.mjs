#!/usr/bin/env node
/**
 * validate-coc-report.mjs — bind a CoC draft to the deterministic verifier.
 *
 * Usage: node scripts/validate-coc-report.mjs <draft-json-path>
 * Exit 0 only when the report's verifier-bound fields exactly match the
 * canonical result for its PO; 1 for a contract mismatch; 2 for usage/IO.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { verifyCompleteness } from './verify-completeness.mjs';

const TOOL = 'scripts/verify-completeness.mjs';

function usage(message) {
  if (message) console.error(`error: ${message}`);
  console.error('usage: node scripts/validate-coc-report.mjs <draft-json-path>');
  process.exitCode = 2;
}

function mismatch(field, actual, expected) {
  console.error(`${field} mismatch: draft ${JSON.stringify(actual)} != canonical ${JSON.stringify(expected)}`);
  process.exitCode = 1;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    usage(args.length === 0 ? 'missing required <draft-json-path>' : 'unexpected arguments');
    return;
  }

  let draft;
  try {
    draft = JSON.parse(readFileSync(path.resolve(args[0]), 'utf8'));
  } catch (err) {
    usage(`cannot read/parse ${args[0]}: ${err.message}`);
    return;
  }
  if (!draft || typeof draft !== 'object' || typeof draft.po !== 'string') {
    mismatch('po', draft?.po, 'a known PO string');
    return;
  }

  const canonical = verifyCompleteness(draft.po);
  if (!canonical) {
    mismatch('po', draft.po, 'a known PO');
    return;
  }

  const checks = [
    ['status', draft.status, canonical.status],
    ['items', draft.items, canonical.items],
    ['missing_records', draft.missing_records, canonical.missing_records],
    ['verifier.tool', draft.verifier?.tool, TOOL],
    ['verifier.exit_code', draft.verifier?.exit_code, canonical.exit_code],
    ['verifier.checked_at', draft.verifier?.checked_at, canonical.checked_at],
  ];
  for (const [field, actual, expected] of checks) {
    if (!isDeepStrictEqual(actual, expected)) {
      mismatch(field, actual, expected);
      return;
    }
  }

  console.log(`VALID deterministic CoC contract for ${canonical.po}`);
}

main();
