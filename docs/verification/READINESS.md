```yaml
product: Assay
repo: C:\Repos\shmindmaster\assay (github.com/shmindmaster/assay)
commit: bfd326c
verdict: Partially Verified
functional_ready: yes
demo_ready: yes
production_ready: no
deployed_sha: none
tests: "CI Node 20 verify:all: 12/12 @ bfd326c; CI Node 22 verify:all: 12/12 @ bfd326c; CI gate: 5/5 @ bfd326c; CI gate:drill: 2/2 @ bfd326c; local npm test: 92/92 @ 1067715; local evals:mutate: 9/9 @ 1067715; local smoke:mcp: 12/12 @ a0a07c0; live verify:live (anthropic): 1/1 refusal as expected @ 1067715; live verify:live (openai gpt-6.1-sol): 1/1 refusal as expected @ release/v0.3.0; openai adapter tests: 6/6"
films: ["D:\\OneDrive - Maya Modest LLC\\Videos\\Portfolio\\Assay\\01 - The Agent Drafts, Software Decides.mp4"]
blockers: ["No gated release yet: v0.2.0 was published by hand; release.yml has never run"]
next_action: "Tag v0.3.0 on main so release.yml runs the gates and publishes the release with the benchmark attached; record the release URL as the production rung"
updated: 2026-10-15T03:34:45-05:00
```

# Readiness

## Verdict: Partially Verified

Assay works end to end as an offline reference and is fully demonstrable. It is not production-verified: the only release, `v0.2.0` (2026-09-16), was published by hand before the gated release workflow existed. The verdict is not `Verified End-to-End Ready` for that reason alone.

| Readiness | Status | Why |
|---|---|---|
| Functional | **Yes** | Every journey in [FUNCTIONAL.md](FUNCTIONAL.md) runs and is covered by an executed test or CI step on `bfd326c`. The live Anthropic and OpenAI paths each ran against the real API. |
| Demo | **Yes** | Film 01 (format B) is delivered with every release gate passing on the exact file. The Explorer and all demo scripts run offline with no key. Format A is in progress; format C is not started. |
| Production | **No** | `v0.2.0` was published by hand on 2026-09-16; no release has gone through `release.yml`. Assay is deliberately not a hosted service, so "production" here means a published, gate-checked release. |

## Blockers

1. **No gated release.** The gate, the drill and the benchmark run in CI, but the release workflow that would publish them has never run. `v0.3.0` is being cut to exercise it.

Resolved 2026-10-15: the OpenAI live path. It ran live on `gpt-6.1-sol` with full provenance, and the release was refused for `untrusted-context`, the same as on Anthropic.

## Risks

- The ledger has no external anchor, so it is tamper-evident but not unforgeable. This is documented, not hidden: README §8 and threat model §3.5.
- No automated browser test covers the Explorer. A regression in the page would be caught only by the parity tests on its verifier, not by its rendering.
- Four Dependabot PRs (#12, #13, #15, #17) are open and untriaged.

## Next highest-value action

Cut `v0.3.0`: push the tag, let `release.yml` run the gates and publish the release with `docs/benchmark.md` attached, then record the release URL here as the production rung. After that, triage the Dependabot PRs.

## Gap tracking

Linear is the tracker for shmindmaster products. The Linear connector was not authorized in this session, so the gaps above are tracked here until they can be filed.
