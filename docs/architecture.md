# Architecture — assay

Seven layers, each with one job. The load-bearing idea: **anything the business will rely on is
decided by deterministic code, not by the model.** The model classifies, composes, and explains;
scripts, schemas, and hooks decide.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 7 GOVERNANCE     hooks/publish-gate.mjs (PreToolUse) · evals (cases +      │
│                  refusal fixtures) · scripts/demo-run.mjs · tests/         │
├────────────────────────────────────────────────────────────────────────────┤
│ 6 PRESENTATION   scripts/render-digest.mjs · scripts/render-atlas.mjs →    │
│                  zero-dependency HTML in reports/drafts/                   │
├────────────────────────────────────────────────────────────────────────────┤
│ 5 CONTRACT       schemas/ — 5 JSON Schemas (draft 2020-12) ·               │
│                  scripts/validate-schemas.mjs ·                            │
│                  scripts/verify-completeness.mjs (fail-closed, exit 0/3)   │
├────────────────────────────────────────────────────────────────────────────┤
│ 4 KNOWLEDGE      skills/ (7 SKILL.md) · references/ 00–04 (numbered) ·     │
│                  context/*.memory.md (one bounded file per agent)          │
├────────────────────────────────────────────────────────────────────────────┤
│ 3 AGENT          quality-lead (router + digest composer, sonnet; no MCP)   │
│                  ├── ncr-triage (haiku)      ├── scrap-rollup (haiku)      │
│                  ├── coc-assembler (sonnet)  └── audit-prep (sonnet)       │
│                  Subagents declare their full tool inventory in            │
│                  frontmatter and may not exceed it.                        │
├────────────────────────────────────────────────────────────────────────────┤
│ 2 MCP BOUNDARY   kestrel-foundry-data — 10 READ-ONLY tools, pruned         │
│                  outputs, hash-verified get_document, no write tools.      │
│                  Stands in for the AWS warehouse + SharePoint estate.      │
├────────────────────────────────────────────────────────────────────────────┤
│ 1 SYNTHETIC DATA data/docs/ (SharePoint-style tree) · data/exports/        │
│                  (QMS / CASTLINE style JSON+CSV) · data/index.json          │
│                  (sha256 per document, anchor date, counts)                │
└────────────────────────────────────────────────────────────────────────────┘
```

Layer notes, bottom to top:

1. **Synthetic data.** `scripts/generate-data.mjs` (seeded PRNG, anchor 2026-08-06, no wall
   clock) writes the document tree, the ERP-style exports, and `data/index.json` — a sha256 per
   document that every verification cites. `npm run generate:data` reproduces every byte.
2. **MCP boundary.** Agents never read `data/` directly. The server exposes exactly 10 tools:
   `list_ncrs`, `get_ncr`, `get_heat_lot`, `get_test_record`, `search_documents`,
   `get_document`, `list_cert_requirements`, `get_purchase_order`, `get_scrap_records`,
   `get_audit_scope`. List/search outputs are pruned (paths and hashes, not bodies);
   `get_document` serves only indexed paths and re-verifies the sha256 before returning
   content. There are no write tools — read-only is a fact of the server, not a policy.
3. **Agent layer.** `quality-lead` routes each request to exactly one subagent via the Task
   tool and composes the weekly digest from their validated drafts; it holds no MCP tools.
   Each subagent owns one workflow, one output file pattern, one schema.
4. **Knowledge layer.** Seven skills carry method (how to classify, match, verify, roll up,
   map, gap-analyze). References 00–04 carry the domain vocabulary (plant, alloys, defects,
   cause codes, cert specs, audit standards). Each agent re-reads its bounded memory file at
   session start — state lives in files, not in chat history.
5. **Contract layer.** Five JSON Schemas — `ncr-triage-output`, `coc-report`, `scrap-rollup`,
   `audit-gap-list`, `quality-digest` (the digest-input contract) — constrain every output.
   `verify-completeness.mjs` owns the cert verdict: exit 0 complete, exit 3 incomplete,
   exit 2 usage error. The `coc-report` schema constrains the draft's shape; the post-generation
   `validate-coc-report.mjs` release gate compares the draft with the verifier result before a
   CoC can proceed in the workflow.
6. **Presentation.** Two renderers turn validated JSON into zero-dependency HTML (inline CSS,
   no JS, no network) in `reports/drafts/` — the weekly quality digest and the data atlas.
7. **Governance.** `hooks/publish-gate.mjs` (PreToolUse) fails closed: matched file tools may
   write only beneath `reports/drafts/`, or beneath `reports/published/` when the workflow
   supplies `KESTREL_PUBLISH_CONFIRMED=1`. That flag is not authentication or a publishing
   decision; production authority remains with the human workflow owner. The MCP source server
   exposes no write tools. The eval suite (`evals/cases/`, `evals/expected/`,
   `scripts/run-evals.mjs`) includes refusal cases.
   `scripts/demo-run.mjs` runs the whole battery end to end.

## Eight design principles → concrete mechanisms

| # | Principle | Mechanism in this repo |
|---|---|---|
| 1 | **Guarantees live in deterministic layers** | `verify-completeness.mjs` exit codes (0 complete / 3 incomplete / 2 usage) decide cert completeness; `validate-coc-report.mjs` compares the generated CoC draft with that result before release; `coc-report.schema.json` constrains fields such as `missing_records` and sha256 shape; `hooks/publish-gate.mjs` enforces write boundaries. None of the deterministic gates consult the model. |
| 2 | **Context is curated, not dumped** | `list_ncrs` strips narratives (compact fields only); `search_documents` returns paths + sha256, never bodies; `get_scrap_records` prunes to the requested weeks; each agent's memory file is one bounded screen, read at session start. |
| 3 | **Explore, then act** | `data/index.json` + `search_documents` locate candidate paths before any `get_document` body fetch; `get_purchase_order` shows the manifest (required records, expected paths, on-file flags) before the verifier runs. Agents never read whole folders. |
| 4 | **Verification is independent of the agents** | `validate-schemas.mjs`, `run-evals.mjs`, and `smoke-mcp.mjs` are separate processes with their own exit codes; the fixture suite (`evals/expected/`) includes outputs the agents *should* produce and outputs that *must be rejected*. No agent grades itself. |
| 5 | **Structure plus verification** | Every output is a JSON document conforming to a schema: cause codes constrained by regex (`^(P0[1-3]|…|S01)$`), defect types by enum, verdicts by exit code. Structure does not establish factual truth, so CoC release also requires comparison with the deterministic verifier result. |
| 6 | **Stateless-safe** | The calendar anchor ("today" = 2026-08-06) comes from `data/index.json`, never the wall clock; memory files are re-read every session; the dataset regenerates byte-identically from seed 20260806. Kill the session, lose nothing. |
| 7 | **Model cost routing** | haiku for bounded extraction and arithmetic (`ncr-triage`, `scrap-rollup`); sonnet where judgment, refusal wording, and composition live (`coc-assembler`, `audit-prep`, `quality-lead`). Tiers are declared in each agent's frontmatter. |
| 8 | **Bounded autonomy** | The write boundary confines agent file writes to `reports/drafts/`, with a guarded `reports/published/` workflow path. The environment flag enabling that path is not authentication; the human workflow owner retains production authority. Refusal is a first-class, schema-valid outcome — not an error. |

## The refusal flow, end to end (PO-AER-5519)

The demo's central case: heat HT-4471 has **no mechanical (tensile) test report**, so the
Aerodyne cert package cannot be issued. Exactly what happens:

1. **Request.** The user asks "Assemble the cert package for PO-AER-5519" (or `quality-lead`
   delegates it via the Task tool). `coc-assembler` picks it up and reads
   `context/coc-assembler.memory.md` — the refusal doctrine is in front of it before any tool call.
2. **Manifest.** It calls `mcp__kestrel-foundry-data__get_purchase_order`. The tool resolves the
   COC-AER-001 manifest against `data/index.json`: 5 required records, each with an
   `expected_path` and an `on_file` flag. `mechanical-test` → `on_file: false`. This flag comes
   from the index, not from the model.
3. **The verifier decides.** Per the `completeness-verification` skill, the manifest informs but
   never decides. The deterministic workflow supplies the result of
   `node scripts/verify-completeness.mjs PO-AER-5519 --json`.
4. **Deterministic check.** The verifier reads `cert-manifests.json` + `data/index.json`. For
   each required record: the file must exist on disk **and** its re-hashed sha256 must equal the
   index value. `docs/heat-lots/HT-4471/mechanical-test-HT-4471.md` does not exist →
   `integrity: "missing"`.
5. **Exit 3.** The verifier prints the JSON verdict (`status: "incomplete"`,
   `missing_records: ["mechanical-test"]`, `checked_at` from the index anchor) and exits with
   code 3. Exit 0 would mean complete; anything else means the package is not verified.
6. **The agent reports, then stops.** It sets `status: "incomplete"`, states the missing record
   plainly — "the mechanical test report for heat HT-4471 is not in the folder" — with the
   `expected_path`, notes the escalation rule (quality manager before ship approval, per
   `references/03-cert-requirements-by-customer.md`), and stops. No partial package, no
   fabrication, no summarizing a record that is not on file, no substitution.
7. **Present items carry proof.** Each present record is cited with its `expected_path` and
   `sha256` from the verifier output. No hash, no "present".
8. **The draft is release-gated after generation.** The agent writes the schema-shaped
   `reports/drafts/coc-PO-AER-5519.json`. The deterministic workflow then runs
   `node scripts/validate-coc-report.mjs --file reports/drafts/coc-PO-AER-5519.json`; it
   compares the draft with the verifier result before release.
9. **Why a hallucinated "complete" is not evidence.** The schema's `allOf` rules constrain
   `status:"complete"`, `missing_records`, and sha256 shape, but do not prove that a generated
   value reflects a real record. The release gate supplies that comparison against the verifier;
   `evals/expected/coc-report.fabricated.invalid.json` remains a structural rejection case.
10. **The path out is data, not persuasion.** The package stays incomplete until the tensile
    report exists in `data/` with a matching hash and the deterministic workflow produces a
    complete verifier result. The MCP source server exposes no write tools, agent file writes are
    constrained by the hook, and the human workflow owner retains production authority.

## Changing a scope changes four files

Per `AGENTS.md`, changing a subagent's scope means updating its agent file, its schema in
`schemas/`, its eval cases in `evals/cases/`, and this document — in the same commit. Dataset
changes go through `scripts/generate-data.mjs`, never hand edits. Before committing:
`npm test`, `npm run evals`, `npm run smoke:mcp`, `claude plugin validate .`.
