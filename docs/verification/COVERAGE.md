# Coverage

Rungs: `Planned → Implemented → Integrated → Tested → Demonstrated → Production-Verified`. "Production" for Assay means a published, gate-checked release. [v0.3.0](https://github.com/shmindmaster/assay/releases/tag/v0.3.0) was published by `release.yml` on 2026-10-15, and its source archive was smoke-tested (see [TESTS.md](TESTS.md)). A capability is marked Production-Verified only if that release run (which executes `verify:all`, the gate and the drill before publishing) or the artifact smoke test exercised it. The live-provider rows stay at Demonstrated: the release does not call either API.

## Capability matrix (commit `46cc33d`, release v0.3.0)

| Capability | Journey | Surface | Logic | Integration | Test | Demo | Production | Rung reached |
|---|---|---|---|---|---|---|---|---|
| S1 context and trust labels | demo:injection | CLI, Explorer panel | `assembler.mjs` | synthetic data | `context.test.mjs`, verify:all | Film 01 0:14–0:29 | v0.3.0 gate + smoke | Production-Verified |
| S2 typed decisions (replay) | demo | CLI | `providers/`, `decisions/` | fixtures | `providers.test.mjs`, `decisions.test.mjs` | Film 01 | v0.3.0 gate + smoke | Production-Verified |
| S2 live Anthropic + provenance | verify:live | CLI, Explorer | `anthropic-live.mjs` | Anthropic API (live) | `live-provider.test.mjs` (stubbed); one live run | Film 01 0:53–1:09 | in v0.3.0, not smoke-tested | Demonstrated |
| S2 live OpenAI + provenance | verify:live (provider openai) | CLI, Explorer | `openai-live.mjs` | OpenAI API (live) | `live-provider-openai.test.mjs` (stubbed); one live run | Explorer tab "Live run, OpenAI" | in v0.3.0, not smoke-tested | Demonstrated |
| S3 policy and write-boundary hook | demo:denied, policy:explain | CLI, Claude Code hook | `publish-gate.mjs` | Claude Code PreToolUse | `hooks.test.mjs`, env-override mutation | Film 01 1:23–1:38 | v0.3.0 release gate (verify:all) | Production-Verified |
| S4 verifier | verify:coc | CLI | `verify-completeness.mjs` | data index | `completeness.test.mjs`, evals | Film 01 (exit 3) | v0.3.0 gate + smoke | Production-Verified |
| S5 broker and authorization (ledger-backed single use) | demo, demo:injection | CLI | `effects/` | ledger | `broker.test.mjs` (incl. cross-process replay) | Film 01 0:43–0:53, 1:46–2:12 | v0.3.0 gate + smoke | Production-Verified |
| S6 ledger, audit, tamper | audit, audit:tamper | CLI | `ledger/`, `audit.mjs` | filesystem | `ledger.test.mjs`, verify:all | Film 01 | v0.3.0 gate + smoke | Production-Verified |
| Receipt Explorer | explorer | offline HTML | `render-explorer.mjs`, `explorer/chain.mjs` | none (static) | `explorer.test.mjs` (parity, blank lines, tamper bounds); `test:browser` (real Chromium) | Film 01 0:00–1:23 | v0.3.0 release gate (verify:all) | Production-Verified |
| S7 evals, mutations, gate, drill | evals:mutate, gate, gate:drill | CLI, CI | `run-mutations.mjs`, `eval-gate.mjs`, `gate-drill.mjs` | GitHub Actions | CI on every PR and push | Film 01 2:12–2:28 | v0.3.0 gate + smoke | Production-Verified |
| MCP server (SDK v2, dual era) | smoke:mcp | stdio MCP; loopback HTTP (`--http`) | `server.mjs` | `.mcp.json` (any MCP client) | `smoke:mcp` 21/21; `conformance:mcp` at 2026-07-28 and 2025-11-25 | none | v0.3.0 release gate (stdio, 12 checks). The HTTP mode, strict inputs and conformance run are not yet in a release | Production-Verified (stdio); Tested (HTTP mode, conformance) |
| Generated developer reference | docs:reference | Markdown, `catalog.json` | `reference-docs.mjs` | MCP client + schema registry | `docs:reference --check` in CI | none | not yet released | Tested |

## Integrations

| Integration | Verification level | Evidence |
|---|---|---|
| Anthropic Messages API (Sonnet 5.5, strict tool, fallbacks) | Live-verified once; unit-tested against a stubbed transport | `docs/evidence/live-run-2026-10-14/`; `tests/live-provider.test.mjs` |
| OpenAI structured outputs (`gpt-6.1-sol`, strict json_schema) | Live-verified once; unit-tested against a stubbed transport | `docs/evidence/live-run-2026-10-15-openai/`; `tests/live-provider-openai.test.mjs` |
| MCP (stdio and loopback HTTP, 2026-07-28 and 2025-11-25) | Real handshakes in CI; protocol conformance with a shrink-only baseline | `smoke:mcp`, `conformance:mcp` |
| PreToolUse write-boundary hook | Hook unit-tested; the Claude Code plugin packaging was removed on 2026-10-15 | `tests/hooks.test.mjs` |
| GitHub Actions release | Ran once for v0.3.0: gate, drill, publish | Run 38707067941; [release](https://github.com/shmindmaster/assay/releases/tag/v0.3.0) |

## Gap lists

- **UI without backend:** none. The Explorer renders real ledger files.
- **Backend without UI:** most of the control layer is CLI-only by design. The Explorer covers the ledger. Policy and verifier output have no visual surface beyond the terminal.
- **Untested integrations:** none.
- **Works locally only:** `verify:live` (needs a key; deliberately not in CI); `npm run explorer` (an offline file, not hosted).
