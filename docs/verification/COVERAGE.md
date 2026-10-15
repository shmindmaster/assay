# Coverage

Rungs: `Planned → Implemented → Integrated → Tested → Demonstrated → Production-Verified`. "Production" for Assay would mean a published release (a GitHub release from `release.yml`). Assay is not a hosted service, so there is no deployment to health-check.

## Capability matrix (commit `bfd326c`)

| Capability | Journey | Surface | Logic | Integration | Test | Demo | Production | Rung reached |
|---|---|---|---|---|---|---|---|---|
| S1 context and trust labels | demo:injection | CLI, Explorer panel | `assembler.mjs` | synthetic data | `context.test.mjs`, verify:all | Film 01 0:14–0:29 | no release | Demonstrated |
| S2 typed decisions (replay) | demo | CLI | `providers/`, `decisions/` | fixtures | `providers.test.mjs`, `decisions.test.mjs` | Film 01 | no release | Demonstrated |
| S2 live Anthropic + provenance | verify:live | CLI, Explorer | `anthropic-live.mjs` | Anthropic API (live) | `live-provider.test.mjs` (stubbed); one live run | Film 01 0:53–1:09 | no release | Demonstrated |
| S2 live OpenAI | verify:live (provider openai) | CLI | `index.mjs` OpenAI path | OpenAI API | stubbed only | none | no release | Implemented |
| S3 policy and write-boundary hook | demo:denied, policy:explain | CLI, Claude Code hook | `publish-gate.mjs` | Claude Code PreToolUse | `hooks.test.mjs`, env-override mutation | Film 01 1:23–1:38 | no release | Demonstrated |
| S4 verifier | verify:coc | CLI | `verify-completeness.mjs` | data index | `completeness.test.mjs`, evals | Film 01 (exit 3) | no release | Demonstrated |
| S5 broker and authorization (ledger-backed single use) | demo, demo:injection | CLI | `effects/` | ledger | `broker.test.mjs` (incl. cross-process replay) | Film 01 0:43–0:53, 1:46–2:12 | no release | Demonstrated |
| S6 ledger, audit, tamper | audit, audit:tamper | CLI | `ledger/`, `audit.mjs` | filesystem | `ledger.test.mjs`, verify:all | Film 01 | no release | Demonstrated |
| Receipt Explorer | explorer | offline HTML | `render-explorer.mjs`, `explorer/chain.mjs` | none (static) | `explorer.test.mjs` (parity, blank lines, tamper bounds) | Film 01 0:00–1:23 | no release | Demonstrated |
| S7 evals, mutations, gate, drill | evals:mutate, gate, gate:drill | CLI, CI | `run-mutations.mjs`, `eval-gate.mjs`, `gate-drill.mjs` | GitHub Actions | CI on every PR and push | Film 01 2:12–2:28 | `release.yml` never run | Demonstrated |
| MCP server (SDK v2) | smoke:mcp, plugin | stdio MCP | `server.mjs` | Claude Code plugin | `smoke:mcp` 12/12 | none | no release | Tested |

## Integrations

| Integration | Verification level | Evidence |
|---|---|---|
| Anthropic Messages API (Sonnet 5.5, strict tool, fallbacks) | Live-verified once; unit-tested against a stubbed transport | `docs/evidence/live-run-2026-10-14/`; `tests/live-provider.test.mjs` |
| OpenAI structured outputs | Unit-tested (schema derivation) only; **never called live** | `tests/providers.test.mjs`, `schemas:report` |
| MCP (stdio, spec 2026-07-28) | Real handshake in CI | `smoke:mcp` |
| Claude Code plugin and PreToolUse hook | Hook unit-tested; plugin manifest validated locally | `tests/hooks.test.mjs`; `claude plugin validate .` |
| GitHub Actions release | Workflow written, **never triggered** | `.github/workflows/release.yml` |

## Gap lists

- **UI without backend:** none. The Explorer renders real ledger files.
- **Backend without UI:** most of the control layer is CLI-only by design. The Explorer covers the ledger. Policy and verifier output have no visual surface beyond the terminal.
- **Untested integrations:** OpenAI live; `release.yml`.
- **Works locally only:** `verify:live` (needs a key; deliberately not in CI); `npm run explorer` (an offline file, not hosted).
