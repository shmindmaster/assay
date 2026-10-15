```yaml
product: Heatlot (rebuild of Assay)
repo: C:\Repos\shmindmaster\assay (github.com/shmindmaster/heatlot; renamed from shmindmaster/assay on 2026-10-15)
commit: e522e8e
verdict: In Development
functional_ready: partial
demo_ready: no
production_ready: no
deployed_sha: 46cc33d (release v0.3.0, published as Assay, https://github.com/shmindmaster/heatlot/releases/tag/v0.3.0)
tests: "CI Node 20 + 22 verify:all 12/12, gate RELEASE ALLOWED with 15/15 mutations @ e522e8e (run 38741917669)"
films: ["D:\\OneDrive - Maya Modest LLC\\Videos\\Portfolio\\Assay\\01 - The Agent Drafts, Software Decides.mp4 (Assay; superseded by the Heatlot film, not yet made)"]
blockers: ["npm publish of heatlot needs the owner's one-time npm login"]
api_surface: "Planned for Heatlot: CLI heatlot verify, HTTP API with generated OpenAPI + Scalar, MCP server. Today: the Assay-era read-only MCP server and the internal packages/broker library."
next_action: "M2: synthetic supplier packets (CoC + MTR PDFs, malicious hidden-text packet) and spec tables"
updated: 2026-10-15T08:45:00-05:00
```

# Readiness

## Verdict: In Development

Re-rated on 2026-10-15. Assay was verified end to end as a reference implementation of the control layer (see the history below and in [TESTS.md](TESTS.md)). The product is now Heatlot, AI verification of supplier certificates at receiving inspection, and its flow (supplier packets, cited extraction, spec rules, inspection console, API) is being built milestone by milestone. Until that flow runs and is tested, the honest verdict is In Development. The control layer it is built on stays green in CI: every guard is proven able to fail, 15 of 15.

| Readiness | Status | Why |
|---|---|---|
| Functional | **Partial** | The control layer (broker, receipts, verifier, mutation harness) works and is tested. The certificate-verification flow is not built yet. |
| Demo | **No** | The Assay film shows the control layer on foundry data. The Heatlot film comes after the product works end to end. |
| Production | **No** | v0.3.0 was released as Assay. No Heatlot release yet; the npm package `heatlot` is not published. |

## History: Assay verification (v0.3.0)

## Production evidence (v0.3.0)

| Check | Result |
|---|---|
| Tag | `v0.3.0` (annotated) on `46cc33d`, the squash-merge of PR #19 |
| Release workflow | Run 38707067941: `Release gate` success, then `Publish release` success; published 2026-10-15T08:40:12Z |
| Attached gate report | `report.json`: `allowed: true`; eval-suite, guard-coverage, refusal-correctness, replay-determinism and audit-replay all pass |
| Attached benchmark | `benchmark.md`, identical to the committed copy (CI enforces the match) |
| Smoke from the published archive | `npm ci` clean; `verify:coc PO-AER-5519` exit 3 (incomplete); `verify:coc PO-MER-5532` exit 0 (complete); `demo:injection` exit 0 with the authorization refused and the effect denied under `untrusted-context`; 6 receipts, chain verified |

## API surface and contract enforcement (2026-10-15)

The engineering quality pass found two real gaps in the MCP contract and fixed both, with tests that fail on the old behavior. Tool inputs silently dropped unknown arguments, and `tools:report` carried a hand-copied set of schemas that had drifted from the server. Conformance at both protocol revisions now runs in CI and in the release gate. The baselines list only features the server deliberately does not offer, so the verdict stands. Details: [TECHNICAL.md](TECHNICAL.md#api-surface-and-mcp-decision). These changes are on main at `d76aa1e`, where CI passed on Node 20 and Node 22 (run 38734598133). They are not yet in a release; v0.3.0 predates them.

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
