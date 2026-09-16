#!/usr/bin/env node
/**
 * publish-gate.mjs — PreToolUse write-boundary hook for assay.
 *
 * A matched file-tool payload must name one target under reports/drafts/, or
 * under reports/published/ when KESTREL_PUBLISH_CONFIRMED=1 is supplied by the
 * human-owned publishing workflow. Everything else fails closed (exit 2).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const DRAFT_RE = /(^|\/)reports\/drafts\/[^/]+/;
const PUBLISHED_RE = /(^|\/)reports\/published\/[^/]+/;
const GROUND_TRUTH_RE = /(^|\/)(data|references|schemas|evals|context)(\/|$)/;

function block(reason) {
  process.stderr.write(`BLOCKED by publish-gate: ${reason}\n`);
  process.exitCode = 2;
}

function normalizeTarget(filePath) {
  const raw = filePath.trim().replace(/\\/g, '/');
  if (!raw) return null;
  if (raw.split('/').includes('..')) return null;
  return path.posix.normalize(raw).toLowerCase();
}

/** Returns null to allow, or a one-line reason to block. */
function decide(filePath) {
  const target = normalizeTarget(filePath);
  if (target === null) {
    return 'file_path must name a file beneath reports/drafts/ or reports/published/';
  }
  if (DRAFT_RE.test(target)) return null;
  const groundTruth = target.match(GROUND_TRUTH_RE);
  if (groundTruth) return `write target is under ${groundTruth[2]}/, outside reports/drafts/`;
  if (PUBLISHED_RE.test(target) && process.env.KESTREL_PUBLISH_CONFIRMED === '1') return null;
  if (PUBLISHED_RE.test(target)) {
    return 'publishing to reports/published/ requires KESTREL_PUBLISH_CONFIRMED=1 from the human workflow owner';
  }
  return 'file writes are limited to reports/drafts/ (or guarded reports/published/)';
}

function main() {
  try {
    const raw = readFileSync(0, 'utf8');
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      block('malformed hook input');
      return;
    }

    const filePath = payload?.tool_input?.file_path;
    if (typeof filePath !== 'string') {
      block('matched file tool payload is missing tool_input.file_path');
      return;
    }

    const reason = decide(filePath);
    if (reason !== null) block(reason);
  } catch {
    block('unexpected hook error');
  }
}

main();
