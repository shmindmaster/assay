#!/usr/bin/env node
/**
 * PreToolUse filesystem gate. Policy is data; this hook contains no path list.
 * Missing, malformed, or internally inconsistent policy always blocks.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_PATH = path.join(REPO_ROOT, 'policy', 'policy.json');

function block(reason) {
  process.stderr.write(`BLOCKED by publish-gate: ${reason}\n`);
  process.exitCode = 2;
}

function loadBoundary() {
  const policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
  const boundary = policy?.writeBoundary;
  if (!boundary || !Array.isArray(boundary.allow) || !Array.isArray(boundary.guarded) || !Array.isArray(boundary.deny)) {
    throw new Error('policy.writeBoundary must define allow, guarded, and deny arrays');
  }
  const paths = [
    ...boundary.allow,
    ...boundary.deny,
    ...boundary.guarded.map((entry) => entry?.path),
  ];
  if (paths.some((entry) => typeof entry !== 'string' || entry === '' || !entry.endsWith('/'))) {
    throw new Error('every write-boundary path must be a non-empty repo-relative directory ending in /');
  }
  if (boundary.guarded.some((entry) =>
    typeof entry.requiresVerdict !== 'string' || typeof entry.requiresOutcome !== 'string')) {
    throw new Error('every guarded path must name requiresVerdict and requiresOutcome');
  }
  return boundary;
}

function normalizeTarget(filePath) {
  const raw = filePath.trim().replace(/\\/g, '/');
  if (!raw || raw.split('/').includes('..')) return null;
  const repo = REPO_ROOT.replace(/\\/g, '/').toLowerCase();
  const lower = path.posix.normalize(raw).toLowerCase();
  if (/^[a-z]:\//i.test(lower) || lower.startsWith('/')) {
    if (lower === repo || !lower.startsWith(`${repo}/`)) return { relative: null, display: lower };
    return { relative: lower.slice(repo.length + 1), display: lower };
  }
  return { relative: lower.replace(/^\.\//, ''), display: lower };
}

function startsIn(relative, prefix) {
  return relative !== null && relative.startsWith(prefix.toLowerCase());
}

/** Returns null to allow, or a one-line reason to block. */
function decide(filePath, boundary) {
  const target = normalizeTarget(filePath);
  if (target === null) return 'file_path must name a normalized repository path';

  for (const denied of boundary.deny) {
    const deniedPath = denied.toLowerCase();
    if (startsIn(target.relative, deniedPath) || target.display.includes(`/${deniedPath}`)) {
      return `write target is under ${denied}, which policy denies`;
    }
  }
  if (boundary.allow.some((allowed) => startsIn(target.relative, allowed))) return null;

  const guarded = boundary.guarded.find((entry) => startsIn(target.relative, entry.path));
  if (guarded) {
    // This flag belongs to the existing human-owned hook workflow. The effect
    // broker itself has no flag or override and independently requires a bound
    // deterministic authorization before it writes.
    if (process.env.KESTREL_PUBLISH_CONFIRMED === '1') return null;
    return `writing ${guarded.path} requires ${guarded.requiresVerdict}=${guarded.requiresOutcome} and KESTREL_PUBLISH_CONFIRMED=1`;
  }

  return `write target ${target.relative ?? target.display} is outside policy.writeBoundary.allow (${boundary.allow.join(', ')})`;
}

function main() {
  let boundary;
  try {
    boundary = loadBoundary();
  } catch (error) {
    block(`policy unavailable or malformed: ${error.message}`);
    return;
  }

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
    const reason = decide(filePath, boundary);
    if (reason !== null) block(reason);
  } catch (error) {
    block(`unexpected hook error: ${error.message}`);
  }
}

main();
