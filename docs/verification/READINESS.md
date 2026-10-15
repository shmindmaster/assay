```yaml
product: Assay
repo: C:\Repos\shmindmaster\assay (github.com/shmindmaster/assay)
commit: bfd326c
verdict: Partially Verified
functional_ready: yes
demo_ready: yes
production_ready: no
deployed_sha: none
tests: "CI Node 20 verify:all: 12/12 @ bfd326c; CI Node 22 verify:all: 12/12 @ bfd326c; CI gate: 5/5 @ bfd326c; CI gate:drill: 2/2 @ bfd326c; local npm test: 92/92 @ 1067715; local evals:mutate: 9/9 @ 1067715; local smoke:mcp: 12/12 @ a0a07c0; live verify:live (anthropic): 1/1 refusal as expected @ 1067715"
films: ["D:\\OneDrive - Maya Modest LLC\\Videos\\Portfolio\\Assay\\01 - The Agent Drafts, Software Decides.mp4"]
blockers: ["No release has been cut: release.yml has never run", "OpenAI live adapter never exercised live"]
next_action: "Push tag v0.3.0 to exercise release.yml and publish the gated release with the benchmark attached (needs owner go-ahead: it is a public release)"
updated: 2026-10-15T02:26:57-05:00
```

# Readiness

## Verdict: Partially Verified

Assay works end to end as an offline reference and is fully demonstrable. It is not production-verified, because nothing has been released. The verdict is not `Verified End-to-End Ready` for that reason alone.

| Readiness | Status | Why |
|---|---|---|
| Functional | **Yes** | Every journey in [FUNCTIONAL.md](FUNCTIONAL.md) runs and is covered by an executed test or CI step on `bfd326c`. The live Anthropic path ran once against the real API. |
| Demo | **Yes** | Film 01 (format B) is delivered with every release gate passing on the exact file. The Explorer and all demo scripts run offline with no key. Format A is in progress; format C is not started. |
| Production | **No** | No GitHub release exists and `release.yml` has never been triggered. Assay is deliberately not a hosted service, so "production" here means a published, gate-checked release. |

## Blockers

1. **No release.** The gate, the drill and the benchmark run in CI, but the release workflow that would publish them has never run. Pushing a `v*` tag would exercise it. That is a public, outward action, so it needs the owner's go-ahead.
2. **OpenAI live path unverified.** The cross-provider claim (one schema, Anthropic and OpenAI) is unit-tested but has never been called live. One `ASSAY_LIVE=1 ASSAY_PROVIDER=openai npm run verify:live` run would move it from Implemented to Demonstrated. Under the media and model cost rule it is a single cheap call.

## Risks

- The ledger has no external anchor, so it is tamper-evident but not unforgeable. This is documented, not hidden: README §8 and threat model §3.5.
- No automated browser test covers the Explorer. A regression in the page would be caught only by the parity tests on its verifier, not by its rendering.
- Four Dependabot PRs (#12, #13, #15, #17) are open and untriaged.

## Next highest-value action

Cut `v0.3.0`: push the tag, let `release.yml` run the gates and publish the release with `docs/benchmark.md` attached, then record the release URL here as the production rung. This needs the owner's approval.

Without that approval, the next best action is the single OpenAI live run, followed by triaging the Dependabot PRs.

## Gap tracking

Linear is the tracker for shmindmaster products. The Linear connector was not authorized in this session, so the gaps above are tracked here until they can be filed.
