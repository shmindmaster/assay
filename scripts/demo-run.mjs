#!/usr/bin/env node
/**
 * demo-run.mjs — end-to-end demo gate + on-camera checklist.
 *
 * Runs the full proof chain in order, each step via child_process.spawnSync
 * with piped/captured stdio:
 *
 *   1. generate:data       regenerate the synthetic dataset (deterministic)
 *   2. smoke:mcp           real MCP client handshake; 10 read-only tools;
 *                          refusal/positive/repeat-offender truths over the wire
 *   3. verify:coc          PO-AER-5519 must exit 3 (refusal) AND
 *                          PO-MER-5532 must exit 0 (complete)
 *   4. validate:schemas    all schemas compile; evals/expected fixtures behave
 *   5. run-evals           deterministic eval harness (6 cases + schema gate)
 *   6. render:digest       weekly digest HTML + digest-input JSON (drafts)
 *   7. render:atlas        platform atlas HTML (drafts)
 *   8. node --test tests/*.test.mjs
 *                          data integrity, completeness, schemas, hooks, digest
 *                          (file-glob form: the bare directory positional
 *                          `node --test tests/` fails on Node 26)
 *
 * Per step prints PASS/FAIL + elapsed seconds. On any FAIL it prints the
 * captured stderr tail and stops immediately. Exit code is the number of
 * failed steps clamped to 1 (0 = fully green).
 *
 * On full green it prints the on-camera walkthrough checklist.
 *
 * Pure Node, no dependencies.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(args) {
  const res = spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (res.error) throw res.error;
  return res; // { status, stdout, stderr }
}

const tail = (text, lines = 15) => {
  const all = String(text ?? '').trimEnd().split('\n');
  return all.slice(-lines).join('\n');
};

// Each step: ok(res) decides the verdict from the captured result(s).
const STEPS = [
  {
    label: 'generate:data',
    run: () => run(['scripts/generate-data.mjs']),
    ok: (r) => r.status === 0,
  },
  {
    label: 'smoke:mcp',
    run: () => run(['scripts/smoke-mcp.mjs']),
    ok: (r) => r.status === 0,
  },
  {
    label: 'verify:coc (PO-AER-5519 refusal exit 3 + PO-MER-5532 complete exit 0)',
    run: () => [
      run(['scripts/verify-completeness.mjs', 'PO-AER-5519', '--json']),
      run(['scripts/verify-completeness.mjs', 'PO-MER-5532', '--json']),
    ],
    ok: ([aer, mer]) => aer.status === 3 && mer.status === 0,
    detail: ([aer, mer]) => `PO-AER-5519 exit ${aer.status} (want 3), PO-MER-5532 exit ${mer.status} (want 0)`,
  },
  {
    label: 'validate:schemas',
    run: () => run(['scripts/validate-schemas.mjs']),
    ok: (r) => r.status === 0,
  },
  {
    label: 'run-evals',
    run: () => run(['scripts/run-evals.mjs']),
    ok: (r) => r.status === 0,
  },
  {
    label: 'render:digest',
    run: () => run(['scripts/render-digest.mjs', '--from-data']),
    ok: (r) => r.status === 0,
  },
  {
    label: 'render:atlas',
    run: () => run(['scripts/render-atlas.mjs']),
    ok: (r) => r.status === 0,
  },
  {
    // NOTE: `node --test tests/` (a bare directory positional) is treated as a
    // module entry and fails on Node 26 (v26.7.0: "Cannot find module ...\tests").
    // The equivalent file glob runs the same suite. Bare `node --test` also works.
    label: 'node --test tests/*.test.mjs',
    run: () => run(['--test', 'tests/*.test.mjs']),
    ok: (r) => r.status === 0,
  },
];

const CHECKLIST = `
ON-CAMERA WALKTHROUGH
---------------------
1. Open reports/drafts/quality-digest-2026-08-02.html
   Weekly digest: KPI cards, scrap Pareto (P02 gating/risering top mover),
   NCR ageing with the KC-1015 repeat offender, cert gaps (PO-AER-5519),
   audit readiness (EA-7, EA-8 gaps). Fully self-contained, zero external
   requests — safe to project.
2. Open reports/drafts/platform-atlas.html
   Radial map of the agent system: quality-lead, 4 subagents, skills,
   references, memory, schemas, and the 10 read-only MCP tools.
3. Demo prompts (type into Claude Code):
   - "Run this week's quality digest"
   - "Assemble the cert package for PO-AER-5519"
4. Refusal proof (run live, then show the exit code):
     node scripts/verify-completeness.mjs PO-AER-5519 --json
   Exit 3, missing_records: ["mechanical-test"] — ground truth comes from the
   hash index, so an agent cannot mark a missing record "present".
5. Enforcement proof (optional): attempt an agent edit under data/ and the
   publish-gate hook blocks it (exit 2); publishing to reports/published/
   requires KESTREL_PUBLISH_CONFIRMED=1.
`;

function main() {
  console.log('demo-run: full proof chain for the assay demo\n');
  let failed = 0;
  for (const step of STEPS) {
    const t0 = performance.now();
    let result;
    try {
      result = step.run();
    } catch (err) {
      failed++;
      console.log(`FAIL  ${step.label} — harness error: ${err.message}`);
      break;
    }
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    if (step.ok(result)) {
      console.log(`PASS  ${step.label} (${secs}s)`);
      continue;
    }
    failed++;
    console.log(`FAIL  ${step.label} (${secs}s)`);
    if (step.detail) console.log(`      ${step.detail(result)}`);
    const results = Array.isArray(result) ? result : [result];
    for (const r of results) {
      const errTail = tail(r.stderr) || tail(r.stdout);
      if (errTail) console.log(`      --- captured tail ---\n${errTail.split('\n').map((l) => `      ${l}`).join('\n')}`);
    }
    console.log('\nStopped at first failure. Fix and re-run: node scripts/demo-run.mjs');
    break;
  }

  if (failed > 0) {
    process.exit(Math.min(failed, 1));
  }
  console.log(`\nALL ${STEPS.length} STEPS GREEN — the demo is ready.`);
  console.log(CHECKLIST);
  process.exit(0);
}

main();
