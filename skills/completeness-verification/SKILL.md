---
name: completeness-verification
description: Use when deciding whether a cert-of-conformance package is complete. Fail-closed — the verifier script's exit code is the only verdict.
---

# Completeness verification (fail-closed)

Completeness is decided by `scripts/verify-completeness.mjs` and nothing else.

## The law

1. Run via Bash: `node scripts/verify-completeness.mjs <po> --json`.
2. Exit 0 => `complete`. Exit 3 => `incomplete`. Any other exit code => verification failed; treat the package as NOT verified and say so.
3. Never decide from memory. Never infer from a folder listing. Never accept "it was complete last week". Re-run the verifier every time.

## On incomplete

- Report each missing record plainly, with its `expected_path` from the verifier output: "the mechanical test report for heat HT-4471 is not in the folder".
- Stop. Do not assemble a partial package. Do not fabricate, summarize, or substitute the missing record.
- Escalate to the quality manager, per every customer spec (`references/03-cert-requirements-by-customer.md`).

## On complete

- Every present item must carry its `expected_path` and `sha256` from the verifier output. A record is present only when its sha256 matches `data/index.json`.
- Trust hashes, not filenames. `mcp__kestrel-foundry-data__get_document` re-checks the hash before serving content; so does the verifier. A named file without a matching hash is not evidence.
