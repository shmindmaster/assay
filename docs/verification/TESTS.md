# Tests

Every row is a command that was executed. "Commit" is the tree it ran against; `1067715` (PR head) and `bfd326c` (squash-merged main) have identical trees.

## Continuous integration (GitHub Actions, ubuntu-latest)

| Run | Commit | Job | Result |
|---|---|---|---|
| [38698163920](https://github.com/shmindmaster/assay/actions/runs/38698163920) | `bfd326c` (main) | Node 20 verification | success: `npm audit --omit=dev` 0 vulnerabilities; `verify:all` ALL GREEN 12/12; corpus reproducible; `gate` RELEASE ALLOWED; benchmark unchanged; `gate:drill` 2/2 blocked |
| 38698163920 | `bfd326c` | Node 22 verification | success (same steps, same results) |
| 38698164047 | `bfd326c` | CodeQL JavaScript | success |
| [38674130953](https://github.com/shmindmaster/assay/actions/runs/38674130953) | `1067715` (PR head) | Node 20, Node 22 verification | success (2026-10-15T03:03–03:04Z) |
| [38707061289](https://github.com/shmindmaster/assay/actions/runs/38707061289) | `46cc33d` (main, v0.3.0) | Node 20, Node 22 verification | success |
| [38707067941](https://github.com/shmindmaster/assay/actions/runs/38707067941) | `v0.3.0` tag | Release gate, then Publish release | success: gate and drill passed; release published 2026-10-15T08:40:12Z with `benchmark.md` and `report.json` (`allowed: true`, 5/5) |

`verify:all` runs, each at its expected exit code: `generate:data`, `test`, `validate:schemas`, `evals`, `evals:mutate`, `smoke:mcp`, `verify:coc PO-AER-5519` (3), `verify:coc PO-MER-5532` (0), `audit:tamper`, `demo:denied`, `demo:injection`, `demo` (3).

## Release smoke test (published artifact)

| Command | Artifact | When (CT) | Result |
|---|---|---|---|
| `npm ci` from `assay-0.3.0.tar.gz` (release source archive) | v0.3.0 | 2026-10-15 | clean install |
| `node scripts/verify-completeness.mjs PO-AER-5519` | v0.3.0 | 2026-10-15 | exit 3, INCOMPLETE (mechanical-test missing) |
| `node scripts/verify-completeness.mjs PO-MER-5532` | v0.3.0 | 2026-10-15 | exit 0, COMPLETE |
| `node scripts/demo-injection.mjs` | v0.3.0 | 2026-10-15 | exit 0; authorization refused and effect denied under `untrusted-context`; 6 receipts; chain verified |

## Local (Windows 11, Node 26.11.1)

| Command | Commit | When (CT) | Result |
|---|---|---|---|
| `npm test` (two consecutive runs) | `1067715` | 2026-10-14 | 92/92 pass, 0 fail, both runs |
| `npm run verify:all` | `1067715` | 2026-10-14 | ALL GREEN 12/12 |
| `npm run gate` | `1067715` | 2026-10-14 | RELEASE ALLOWED, 5/5 checks |
| `npm run gate:drill` | `1067715` | 2026-10-14 | 2/2 deliberate regressions blocked |
| `npm run evals:mutate` | `1067715` | 2026-10-14 | 9/9 mutations caught |
| `npm run smoke:mcp` | `a0a07c0` (MCP v2 merge) | 2026-10-14 | 12/12 checks; negotiated revision 2026-07-28 |
| `npm audit --omit=dev --audit-level=high` | `a0a07c0` | 2026-10-14 | 0 vulnerabilities |
| `claude plugin validate .` | `a0a07c0` | 2026-10-14 | passed with two pre-existing warnings |
| `ASSAY_LIVE=1 npm run verify:live` (Anthropic) | `1067715` | 2026-10-14 | exit 3 (expected refusal); `claude-sonnet-5-5`, `req_011Cg3GxmZmrYjTfuCEWQrTL`; denial rule `untrusted-context`; [evidence](../evidence/live-run-2026-10-14/) |
| `ASSAY_LIVE=1 ASSAY_PROVIDER=openai npm run verify:live` (old default `gpt-4o-2024-08-06`) | `4699c2c` | 2026-10-15 | exit 3 (expected refusal); model INCOMPLETE; denial `untrusted-context`; exposed thin provenance (fixed) |
| `ASSAY_LIVE=1 ASSAY_PROVIDER=openai npm run verify:live` (`gpt-6.1-sol`) | release/v0.3.0 | 2026-10-15 | exit 3 (expected refusal); `req_971f4bc010bd427db04b44503f04cff3`, 3423/808 tokens, 13.6 s; model INCOMPLETE; denial `untrusted-context`; [evidence](../evidence/live-run-2026-10-15-openai/) |
| `node --test tests/live-provider-openai.test.mjs` | release/v0.3.0 | 2026-10-15 | 6/6 pass |

## By category

| Category | Coverage | Evidence |
|---|---|---|
| Unit | Ledger, broker, authorization, providers, live adapter (stubbed transport), context, decisions, schemas, completeness, digest, explorer parity | `tests/*.test.mjs` (92 tests) |
| Contract / schema | Every fixture validates or is rejected as named; one schema, three enforcement paths | `validate:schemas`, `tests/schemas.test.mjs`, `schemas:report` |
| Integration (in process) | Context, decision, verdict, mint, broker and ledger end to end | `demo`, `demo:injection`, `demo:denied` inside `verify:all` |
| Integration (live provider) | Anthropic and OpenAI live adapters against the real APIs | One recorded `verify:live` run each |
| Integration (MCP) | Real stdio handshake and the 10 tools | `smoke:mcp` |
| Authorization / negative | Replay after restart (separate process), never-minted forgery, payload edit, forged verdict, untrusted context, broken chain, malformed bindings | `tests/broker.test.mjs` |
| Recovery / failure paths | Classifier refusal, prose answer, HTTP 529, schema-invalid output (provenance kept), bad effort | `tests/live-provider.test.mjs` |
| Guard ability to fail | 9 mutations; release gate with 2 drilled regressions | `evals:mutate`, `gate:drill` |
| End-to-end browser | **No automated browser test in CI.** The Explorer was driven by headless Playwright for the film. Of 20 recorded takes, 19 were valid with every expected response observed; one timed out on a CPU-starved machine and was re-recorded. That is demo evidence, not a test suite. | `docs/verification/DEMOS.md` |
| Accessibility / responsive | **Not tested.** The Explorer has keyboard focus styles, reduced-motion handling and a single-column layout under 1100 px, but nothing measures them. | — |
| Security | CodeQL, `npm audit`, no-network-without-flag test, threat model | CI; `tests/providers.test.mjs`; `docs/threat-model.md` |
| Performance | Not applicable at this scale; not measured | — |

## Failures seen and fixed this cycle

- Five findings from the independent PR #16 review: wrong denial rule recorded, blank lines hidden from the Explorer, lost provenance on a schema failure, unbounded tamper, hard-coded ledger path. Each has a test and was fixed in `1067715`.
- One race introduced and removed on the way: a test that spawned the demo rewrote the shared ledger while another test file appended to it. It was replaced by an in-process `mintAndPerform` test.
