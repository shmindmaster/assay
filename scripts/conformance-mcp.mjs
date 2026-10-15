#!/usr/bin/env node
/**
 * npm run conformance:mcp — protocol conformance for the kestrel-foundry-data MCP server.
 *
 * Starts the server in its loopback HTTP mode and runs @modelcontextprotocol/conformance against
 * it twice: at revision 2026-07-28 and at 2025-11-25 (the dual-era path). Each run uses a committed
 * expected-failures baseline, mcp-servers/kestrel-foundry-data/conformance/<revision>.yml.
 *
 * The baseline may only shrink:
 *   - a failure not in the baseline fails the run (the conformance tool enforces this);
 *   - a scenario added to the baseline that the base branch did not list fails the run here, so
 *     a regression cannot be "fixed" by writing it into the baseline. Compare against BASELINE_REF
 *     (default origin/main) when that ref exists.
 *
 * Offline after npm install: the conformance tool is a pinned devDependency, not an npx download.
 * Exit 0 when both revisions pass against their baselines, 1 otherwise.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(REPO_ROOT, 'mcp-servers', 'kestrel-foundry-data', 'src', 'server.mjs');
const BASELINE_DIR = path.join(REPO_ROOT, 'mcp-servers', 'kestrel-foundry-data', 'conformance');
const CONFORMANCE = path.join(REPO_ROOT, 'node_modules', '@modelcontextprotocol', 'conformance', 'dist', 'index.js');
const REVISIONS = ['2026-07-28', '2025-11-25'];
const BASELINE_REF = process.env.BASELINE_REF ?? 'origin/main';

/** Scenario ids listed in a baseline YAML (a flat list under any key, or a top-level list). */
export function baselineEntries(text) {
  return text.split('\n')
    .map((line) => line.match(/^\s*-\s*["']?([^"'#\s]+)["']?\s*(#.*)?$/))
    .filter(Boolean)
    .map((m) => m[1])
    .sort();
}

/** Entries in `current` that `base` did not list: a growing baseline. Empty when it only shrank. */
export function grownEntries(currentText, baseText) {
  const before = new Set(baselineEntries(baseText));
  return baselineEntries(currentText).filter((id) => !before.has(id));
}

function baseVersion(revision) {
  const rel = path.posix.join('mcp-servers', 'kestrel-foundry-data', 'conformance', `${revision}.yml`);
  try {
    return execFileSync('git', ['-C', REPO_ROOT, 'show', `${BASELINE_REF}:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null; // ref or file absent: nothing to compare against yet
  }
}

function startServer() {
  const proc = spawn(process.execPath, [SERVER, '--http', '0'], { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
  const url = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MCP HTTP server did not start within 15 s')), 15000);
    proc.stdout.on('data', (chunk) => {
      const m = String(chunk).match(/listening on (http:\/\/127\.0\.0\.1:\d+\/mcp)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`MCP HTTP server exited with ${code}`)); });
  });
  return { proc, url };
}

function runConformance(url, revision) {
  const baseline = path.join(BASELINE_DIR, `${revision}.yml`);
  const args = [CONFORMANCE, 'server', '--url', url, '--spec-version', revision,
    '--output-dir', path.join(REPO_ROOT, 'reports', 'conformance', revision)];
  if (existsSync(baseline)) args.push('--expected-failures', baseline);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main() {
  if (!existsSync(CONFORMANCE)) {
    console.error('conformance tool not installed: run npm install (it is a devDependency)');
    process.exit(1);
  }
  let failed = false;
  for (const revision of REVISIONS) {
    const file = path.join(BASELINE_DIR, `${revision}.yml`);
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const base = baseVersion(revision);
    if (base === null) {
      console.log(`note  ${revision}: no baseline on ${BASELINE_REF} to compare against`);
    } else {
      const added = grownEntries(current, base);
      if (added.length) {
        console.error(`FAIL  ${revision}: baseline grew (${added.join(', ')}); a baseline may only shrink`);
        failed = true;
      }
    }
  }
  const { proc, url } = startServer();
  try {
    const endpoint = await url;
    for (const revision of REVISIONS) {
      console.log(`\n=== conformance ${revision} against ${endpoint}`);
      const code = await runConformance(endpoint, revision);
      console.log(`${code === 0 ? 'PASS' : 'FAIL'}  conformance ${revision} (exit ${code})`);
      if (code !== 0) failed = true;
    }
  } finally {
    proc.kill();
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
