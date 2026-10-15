```yaml
product: Assay
repo: C:\Repos\shmindmaster\assay (github.com/shmindmaster/assay)
commit: 46cc33d
verdict: Verified End-to-End Ready
functional_ready: yes
demo_ready: yes
production_ready: yes
deployed_sha: 46cc33d (release v0.3.0, https://github.com/shmindmaster/assay/releases/tag/v0.3.0)
tests: "CI Node 20 verify:all: 12/12 @ 46cc33d; CI Node 22 verify:all: 12/12 @ 46cc33d; release.yml gate + drill: pass @ 46cc33d (run 38707067941); release report.json: 5/5 checks allowed; release smoke from published archive: 3/3 @ v0.3.0; local npm test: 98/98 @ 2555f12; live verify:live (anthropic claude-sonnet-5-5): 1/1 refusal as expected @ 1067715; live verify:live (openai gpt-6.1-sol): 1/1 refusal as expected @ 2555f12"
films: ["D:\\OneDrive - Maya Modest LLC\\Videos\\Portfolio\\Assay\\01 - The Agent Drafts, Software Decides.mp4"]
blockers: []
api_surface: "No HTTP API by design (no OpenAPI/Scalar). JSON Schema 2020-12 decision contracts with generated reference. MCP justified and read-only: SDK 2.3.1, dual era on stdio and loopback HTTP, conformance at 2026-07-28 and 2025-11-25 in CI with a shrink-only baseline. See TECHNICAL.md, API surface and MCP decision."
next_action: "Add an accessibility (axe) pass to the Explorer browser test; cut v0.3.1 so the MCP conformance work is in a release; deliver the format A executive cut when a heavy-work slot frees"
updated: 2026-10-15T05:00:00-05:00
```

# Readiness

## Verdict: Verified End-to-End Ready

Assay is complete for what it claims to be: an offline, open-source reference implementation of a deterministic control layer. Every journey runs and is tested. Both live providers have been exercised against the real APIs, and the product is demonstrated on film. On 2026-10-15 it was released through the gated workflow, and the published artifact was smoke-tested.

| Readiness | Status | Why |
|---|---|---|
| Functional | **Yes** | Every journey in [FUNCTIONAL.md](FUNCTIONAL.md) runs and is covered by an executed test or CI step. The live Anthropic (`claude-sonnet-5-5`) and OpenAI (`gpt-6.1-sol`) paths each ran against the real API and refused the injected release for `untrusted-context`. |
| Demo | **Yes** | Film 01 (format B) is delivered with every release gate passing on the exact file. The Explorer and all demo scripts run offline with no key. Format A (executive cut) is staged and waiting for a heavy-work slot; format C is not started. |
| Production | **Yes** | [v0.3.0](https://github.com/shmindmaster/assay/releases/tag/v0.3.0) was published by `release.yml` (run 38707067941) only after its gate and drill passed. The attached `report.json` records `allowed: true` with 5/5 checks. A clean install from the published source archive passed the path smoke test. |

"Production" for Assay means a published, gate-checked release. It is deliberately not a hosted service, so there is nothing to health-check. The smoke test is the production check for the path.

## Production evidence (v0.3.0)

| Check | Result |
|---|---|
| Tag | `v0.3.0` (annotated) on `46cc33d`, the squash-merge of PR #19 |
| Release workflow | Run 38707067941: `Release gate` success, then `Publish release` success; published 2026-10-15T08:40:12Z |
| Attached gate report | `report.json`: `allowed: true`; eval-suite, guard-coverage, refusal-correctness, replay-determinism and audit-replay all pass |
| Attached benchmark | `benchmark.md`, identical to the committed copy (CI enforces the match) |
| Smoke from the published archive | `npm ci` clean; `verify:coc PO-AER-5519` exit 3 (incomplete); `verify:coc PO-MER-5532` exit 0 (complete); `demo:injection` exit 0 with the authorization refused and the effect denied under `untrusted-context`; 6 receipts, chain verified |

## API surface and contract enforcement (2026-10-15)

The engineering quality pass found two real gaps in the MCP contract and fixed both, with tests that fail on the old behavior. Tool inputs silently dropped unknown arguments, and `tools:report` carried a hand-copied set of schemas that had drifted from the server. Conformance at both protocol revisions now runs in CI and in the release gate. The baselines list only features the server deliberately does not offer, so the verdict stands. Details: [TECHNICAL.md](TECHNICAL.md#api-surface-and-mcp-decision). These changes are merged but not yet in a release (v0.3.0 predates them).

## Blockers

None.

Resolved 2026-10-15:
- The first gated release was cut (v0.3.0).
- The OpenAI live path was verified with full provenance.

## Risks

- The ledger has no external anchor, so it is tamper-evident but not unforgeable. This is documented, not hidden: README §8 and threat model §3.5.
- Accessibility of the Explorer is designed for (focus styles, reduced motion, a narrow layout) but not measured.

## Next highest-value action

Measure the Explorer's accessibility (an axe pass in the browser test), then deliver the format A executive cut once a heavy-work slot frees.

## Gap tracking

Linear is the tracker for shmindmaster products. The Linear connector was not authorized in this session, so the gaps above are tracked here until they can be filed.
