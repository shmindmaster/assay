# assay

A Quality department agent for Kestrel Castings, built as a Claude Code plugin and running
entirely on synthetic foundry data. Kestrel is a sand-casting foundry (aluminum and magnesium,
aerospace and defence customers); this repo is the working prototype behind the the sponsor pursuit —
one department agent for the Quality department, modeled on a proven department-agent pattern
(the same harness as the the reference deployment build), demonstrated end-to-end without touching a real Kestrel
system.

One primary agent (`quality-lead`) routes work to four narrowly scoped subagents (NCR triage,
cert-of-conformance assembly, scrap rollup, audit prep). Behind them: 7 skills, numbered
reference docs (00–04), bounded per-agent memory files, and a read-only MCP server that stands
in for the future AWS warehouse + SharePoint estate. Every subagent output is a schema-shaped
draft; cert-of-conformance completeness comes from a deterministic content-hash verifier. The
post-generation CoC release gate compares the draft with that verifier result — a schema alone
does not prove factual claims. A fail-closed PreToolUse write boundary permits only report drafts
and a guarded published-report path; an eval suite (including refusal cases) exercises the
deterministic checks.

## 60-second quickstart

Requires Node >= 20. No build step.

```powershell
git clone <repo-url> assay
cd assay
npm install
npm run demo
```

`npm run demo` runs the full verification battery (MCP smoke test, schema + fixture validation,
eval suite, both cert verifications) and renders the two HTML reports into `reports/drafts/`.

Then install it the way department agents are installed — the folder *is* the plugin:

- **Claude Desktop:** Settings → Custom plugins → Add folder → select the repo root.
- **Claude Code:** `claude --plugin-dir C:\Repos\shmindmaster\assay` to load it for a session; manage
  with `/plugin`. (`claude plugin install` is for marketplace-registered plugins; a local
  folder needs no install step.)
- **Validate:** `claude plugin validate .` passes (manifest valid; one benign warning that the
  root `CLAUDE.md` is not shipped as plugin context — plugin context ships via `skills/`).

Once loaded, the plugin (`assay` per `.claude-plugin/plugin.json`) exposes the five
agents, seven skills, and starts the `kestrel-foundry-data` MCP server from `.mcp.json`.

## Agents

| Agent | Scope | Model tier |
|---|---|---|
| `quality-lead` (primary) | Routes every request to exactly one subagent; composes the weekly digest. Holds no MCP tools of its own. | sonnet |
| `ncr-triage` | One NCR → defect classification, likely cause code, repeat-offender flag. No dispositions. | haiku |
| `coc-assembler` | One PO → cert-of-conformance completeness report. Fail-closed; missing records reported, never fabricated. | sonnet |
| `scrap-rollup` | Weekly scrap/yield rollup by cell + cause, variance vs trailing 4-week average. | haiku |
| `audit-prep` | One audit → evidence areas mapped to documents, gap list with owners and effort. | sonnet |

Subagents declare their full tool inventory in frontmatter and may not exceed it.

## Demo truths (baked into the synthetic data)

| Baked-in truth | Where it lives | What it proves |
|---|---|---|
| Heat **HT-4471** has no mechanical (tensile) test report → **PO-AER-5519** cert package is incomplete and must be refused | `data/docs/heat-lots/HT-4471/` (file absent); `npm run verify:coc -- PO-AER-5519 --json` exits **3** | The deterministic verifier reports the gap; the post-generation CoC release gate compares a draft with that result before release |
| **PO-MER-5532** (12× KC-1022, HT-4468, Meridian) is complete | `npm run verify:coc -- PO-MER-5532` exits **0** | The verifier discriminates — good packages pass, every record cited by path + sha256 |
| **KC-1015** Transmission Case: 4 shrinkage NCRs in 90 days, all cause P02 (NCR-2026-0091, -0098, -0107, -0114) | `get_ncr` repeat analysis; `data/exports/qms/ncr-export.json` | Cross-record reasoning on a deterministic 90-day window — the repeat-offender flag comes from the tool, not the model |
| Scrap cause **P02** (gating/risering) in Molding rises 4 straight weeks; top mover week 2026-08-02: $29,952 vs $22,718.75 trailing-4 avg (**+31.8%**); the **+17.1%** KPI is the total-scrap variance ($50,438 vs $43,082.25) | `data/exports/erp/scrap-export.csv`; `get_scrap_records` | The digest's headline number is computed from the export — no estimates, no smoothing |
| Audit **AUD-2026-S1**: evidence areas **EA-7** (training records) and **EA-8** (supplier raw-material certs) absent | `get_audit_scope` resolves areas against `data/index.json` | Present/absent is a fact resolved against the index; the gap list is exactly EA-7 and EA-8 |

## Verification commands

| Command | What it proves | Green looks like |
|---|---|---|
| `npm test` | Unit tests for the deterministic layer (`node --test tests/*.test.mjs`) | All tests pass |
| `npm run evals` | Eval suite, including refusal cases (a fabricated "complete" cert report must be rejected) | All cases behave as expected |
| `npm run smoke:mcp` | Real MCP client handshake: exactly the 10 read-only tools, plus assertions on the demo truths | `MCP smoke: all 9 checks passed` |
| `npm run verify:coc -- PO-AER-5519 --json` | The refusal case, agent-free | Exit code **3**, `missing_records: ["mechanical-test"]` |
| `npm run verify:coc -- PO-MER-5532` | The positive case | Exit code **0**, `COMPLETE` |
| `npm run validate:schemas` | All schemas compile; every `evals/expected/` fixture validates or is rejected as named | `ALL GOOD — … fixtures behaved as named` |
| `npm run demo` | The whole battery, then renders both HTML reports into `reports/drafts/` | Exit 0 |
| `npm run generate:data` | Reproduces the dataset byte-identically (seeded, no wall clock) | Same `data/index.json` hashes |
| `claude plugin validate .` | Plugin manifest is well-formed | `Validation passed` |

## Build telemetry

An append-only ledger backs the reuse-curve economics claim with real hours rather than asserted ones. Log each session, then read the rollup:

```powershell
npm run effort:log -- --unit <slug> --hours <n> [--tier assembly|analytical|judgment] [--notes "…"]
npm run effort            # per-unit cost + the reuse curve (platform hours amortised)
npm run effort -- --json  # machine-readable
```

Rows live in `telemetry/effort-log.csv` and are never edited — the ledger is an audit trail. Shared work (data layer, MCP server, schemas, hooks, eval harness) is logged as `--unit platform` and amortised across units in the rollup, which is exactly why unit N+1 costs less than unit N.

## Repository layout

```
shmindmaster/                         plugin root — install = add this folder
├── .claude-plugin/plugin.json      manifest (name, version, description)
├── .mcp.json                       registers the kestrel-foundry-data MCP server
├── CLAUDE.md / AGENTS.md           project memory + change contract
├── package.json                    npm scripts = the verification battery
├── agents/                         quality-lead + 4 subagents (declared tools, model tiers)
├── skills/                         7 skills (SKILL.md each)
├── references/                     numbered domain docs 00–04
├── context/                        per-agent bounded memory files (read every session)
├── schemas/                        JSON Schema output contracts (draft 2020-12)
├── hooks/                          publish-gate.mjs — PreToolUse write gate
├── mcp-servers/kestrel-foundry-data/   read-only MCP server, 10 tools
├── scripts/                        generator, verifier, validators, renderers, eval/demo runners
├── data/                           synthetic dataset (generated; immutable to agents)
│   ├── docs/                       SharePoint-style document tree (markdown)
│   ├── exports/                    QMS / CASTLINE style exports (JSON + CSV)
│   └── index.json                  sha256 per document + counts + anchor date
├── evals/                          cases/ + expected/ fixtures, incl. refusal cases
├── tests/                          node --test unit tests
├── reports/                        drafts/ (the only unguarded agent file-write target; gitignored)
│                                 └ published/ (guarded workflow target)
└── docs/                           architecture, data dictionary, compliance, runbook
```

## What this demonstrates

- **A portable department-agent pattern** — the same harness as the the reference deployment build: a primary
  router agent plus narrow subagents with declared tools, scoped skills, and bounded memory.
- **Access control by construction** — the MCP source server exposes *no write tools at all*;
  `get_document` serves only indexed paths and re-verifies the sha256 before returning content;
  the fail-closed write boundary allows only `reports/drafts/**` and guarded
  `reports/published/**` file targets.
- **Fail-closed verification** — completeness verdicts come from
  `scripts/verify-completeness.mjs` (exit codes). The post-generation
  `validate-coc-report.mjs` release gate compares a CoC draft with that deterministic result;
  the schema validates structure but does not itself make fabrication impossible. The eval suite
  includes refusal cases.
- **Curated context economics** — list/search tools return pruned fields (paths, not bodies);
  memory files are one screen each; models see what they need and no more.
- **Model cost routing** — haiku for bounded extraction/math (ncr-triage, scrap-rollup), sonnet
  where judgment and composition live (coc-assembler, audit-prep, quality-lead).
- **Determinism** — seeded dataset, anchor date from `data/index.json`, byte-identical
  regeneration. The demo behaves identically on any machine, on any day.

## What this deliberately is not

- **Not connected to any real Kestrel system.** No QMS, CASTLINE, SharePoint, or Outlook access.
  The MCP server reads only the synthetic `data/` folder in this repo.
- **No real data.** Every heat lot, NCR, PO, and audit is generated by
  `scripts/generate-data.mjs` (seed 20260806). No customer, personal, or export-controlled
  content ever enters this repo.
- **The warehouse is a boundary, not a build.** The future AWS warehouse + SharePoint estate is
  represented by the read-only MCP contract; swapping in real connectors changes hosting and
  data handling, not the agent architecture. See [docs/compliance-notes.md](docs/compliance-notes.md).
- **Not a decision-maker.** Agents classify, assemble, compute, and report. Dispositions, ship
  approval, and production publishing remain with the human workflow owner. The
  `KESTREL_PUBLISH_CONFIRMED=1` gate flag is a workflow input, not authentication or approval.

## Further reading

- [docs/architecture.md](docs/architecture.md) — layers, design principles, the refusal flow end-to-end
- [docs/synthetic-data.md](docs/synthetic-data.md) — the data dictionary and why each demo truth exists
- [docs/compliance-notes.md](docs/compliance-notes.md) — production-path notes (ITAR/CUI/CMMC, hosting surfaces)
- [docs/walkthrough-runbook.md](docs/walkthrough-runbook.md) — the 3–4 minute demo recording script
