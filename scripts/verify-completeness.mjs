#!/usr/bin/env node
/**
 * verify-completeness.mjs — fail-closed cert-package completeness verifier.
 *
 * Usage: node scripts/verify-completeness.mjs <PO> [--json]
 *
 * Ground truth (never the agent's word):
 *   data/exports/quality/cert-manifests.json  required record types + expected_path per PO
 *   data/index.json                           sha256 per document + anchor_date
 *
 * For every required record the file must exist on disk AND its re-hashed
 * sha256 must equal the index value. integrity: "ok" | "missing" | "hash-mismatch".
 * status is "complete" only when every required record is "ok".
 *
 * Exit codes: 0 = complete | 3 = incomplete | 2 = usage error or unknown PO.
 *
 * --json prints {po, status, items, missing_records, checked_at, exit_code}
 * with checked_at taken from index.anchor_date (deterministic, no wall clock).
 * Human mode prints one line per record and a final verdict line.
 *
 * Pure Node, no dependencies.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = path.join(REPO_ROOT, 'data');
const MANIFESTS_PATH = path.join(DATA_ROOT, 'exports', 'quality', 'cert-manifests.json');
const INDEX_PATH = path.join(DATA_ROOT, 'index.json');

const EXIT = { COMPLETE: 0, USAGE: 2, INCOMPLETE: 3 };

function usage(msg) {
  if (msg) console.error(`error: ${msg}`);
  console.error('usage: node scripts/verify-completeness.mjs <PO> [--json]');
  process.exitCode = EXIT.USAGE;
}

function parseArgs(argv) {
  let po = null;
  let json = false;
  for (const arg of argv) {
    if (arg === '--json') json = true;
    else if (arg.startsWith('--')) return { error: `unknown flag: ${arg}` };
    else if (po === null) po = arg;
    else return { error: `unexpected argument: ${arg}` };
  }
  if (po === null) return { error: 'missing required <PO> argument' };
  return { po, json };
}

function sha256OfText(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function checkRecord(req, documents) {
  const abs = path.join(DATA_ROOT, ...req.expected_path.split('/'));
  if (!existsSync(abs)) {
    return { type: req.type, expected_path: req.expected_path, on_file: false, sha256: null, integrity: 'missing' };
  }
  const sha256 = sha256OfText(readFileSync(abs, 'utf8'));
  const ok = documents[req.expected_path] === sha256;
  return { type: req.type, expected_path: req.expected_path, on_file: true, sha256, integrity: ok ? 'ok' : 'hash-mismatch' };
}

export function verifyCompleteness(po) {
  const manifests = JSON.parse(readFileSync(MANIFESTS_PATH, 'utf8'));
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  const manifest = manifests.manifests?.[po];
  if (!manifest) return null;

  const documents = index.documents ?? {};
  const items = manifest.required.map((req) => checkRecord(req, documents));
  const notOk = items.filter((item) => item.integrity !== 'ok');

  const status = notOk.length === 0 ? 'complete' : 'incomplete';
  const exitCode = notOk.length === 0 ? EXIT.COMPLETE : EXIT.INCOMPLETE;
  const missing_records = notOk.map((item) => item.type);
  const checked_at = index.anchor_date;

  return { po, status, items, missing_records, checked_at, exit_code: exitCode };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    usage(parsed.error);
    return;
  }
  const { po, json } = parsed;
  const result = verifyCompleteness(po);
  if (!result) {
    const manifests = JSON.parse(readFileSync(MANIFESTS_PATH, 'utf8'));
    console.error(`error: unknown PO "${po}" — known POs: ${Object.keys(manifests.manifests ?? {}).join(', ')}`);
    process.exitCode = EXIT.USAGE;
    return;
  }

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const manifest = JSON.parse(readFileSync(MANIFESTS_PATH, 'utf8')).manifests[po];
    const { items, status } = result;
    console.log(`PO ${manifest.po} — ${manifest.customer} / ${manifest.part} / heat HT-${manifest.heat} / ${manifest.cert_req}`);
    for (const item of items) {
      console.log(`  ${item.integrity.padEnd(13)} ${item.type.padEnd(24)} ${item.expected_path}`);
    }
    if (status === 'complete') {
      console.log(`COMPLETE — all ${items.length} required records on file and hash-verified against data/index.json`);
    } else {
      const fmt = (item) =>
        item.integrity === 'missing'
          ? `${item.type} (${item.expected_path})`
          : `${item.type} (${item.expected_path}) [${item.integrity}]`;
      console.log(`INCOMPLETE — missing: ${items.filter((item) => item.integrity !== 'ok').map(fmt).join(', ')}`);
    }
  }

  process.exitCode = result.exit_code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
