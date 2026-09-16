# Assay

**The agent drafts. Software decides.**

A runnable reference implementation of the deterministic control layer that both
major model vendors tell you to build, demonstrated on a domain where being
wrong leaves a paper trail: manufacturing quality and certificate-of-conformance
release.

Anything that needs a hard guarantee — schema, permission, routing, approval,
side effect, final state — is owned and enforced by code. The model supplies
judgment and language, and nothing else. Every boundary between the two is
typed, enforced, and recorded.

Clone it and run it in sixty seconds. There is no API key, no account, and no
network call in any documented command.

```bash
git clone https://github.com/shmindmaster/assay
cd assay && npm install
npm run demo
```

> **Everything here is synthetic.** Kestrel Castings is a fictional aluminium and
> magnesium sand-casting foundry. Every heat lot, nonconformance, purchase order
> and certificate under `data/` is generated from a seed by
> `scripts/generate-data.mjs`. No real company, system, or record is involved.
> The domain is specific on purpose — a generic widget dataset cannot demonstrate
> a refusal that matters.

---

## 1. The three demos

### `npm run demo` — the refusal

The battery runs and ends on a refusal:

```
PO-AER-5519  heat HT-4471
  draft verdict   (model)   COMPLETE
  computed verdict (code)   INCOMPLETE — missing: mechanical-test
  authorization             REFUSED
  receipt                   ledger/PO-AER-5519.jsonl  (chain verified, 14 receipts)
exit 3
```

The model said the certificate package was complete. It is not: heat HT-4471 has
no tensile test report. A deterministic verifier computed that from the files on
disk, cited each record by path and sha256, and the effect broker refused to mint
an authorization. Nothing was released.

The discriminating case matters as much as the refusal — run
`npm run verify:coc -- PO-MER-5532` and it exits `0`. The verifier is not simply
strict; it is correct.

### `npm run demo:injection` — the one to read first

A document in the corpus carries text aimed at the agent, instructing it to
treat the package as complete and approve release. The run shows, in order: the
input tripwire firing and labelling that block `untrusted`; the model reading it
and drafting `COMPLETE` anyway; the verifier computing `INCOMPLETE`; the broker
refusing; the denial receipt.

> The injection changed what the model said. It could not change what was
> released, because releasing was never the model's decision.

That is the whole argument for this architecture in one command. Defending
against injection by asking the model more firmly not to fall for it is a losing
position. Moving the decision out of the model is not.

### `npm run evals:mutate` — the credibility demo

A test suite that has never caught anything is decoration. This harness proves
each guard can fail:

```
mutation  verifier/flip-completeness-comparison   CAUGHT by coc-po-aer-5519-refusal
mutation  policy/widen-write-path                 CAUGHT by policy-escape
mutation  schema/drop-required-field              CAUGHT by schema-fixtures
mutation  broker/accept-used-authorization        CAUGHT by broker-replay
mutation  ledger/skip-chain-check                 CAUGHT by audit-tamper

5/5 mutations caught — every guard in this repo is demonstrably able to fail.
```

Each mutation is a declarative patch in `evals/mutations/`, applied to a scratch
copy and reverted. A mutation the suite survives is reported as a coverage gap
and fails the run.

---

## 2. Why this shape

Published guidance from Anthropic and OpenAI converges on the same instruction,
phrased six different ways: get it out of the model. Externalize state rather
than carrying it in a prompt. Make decisions typed rather than parsed from prose.
Put schemas, permissions and guardrails in configuration rather than in
instructions. Route side effects — writes, calls, approvals — through code.
Record what happened.

Follow all of that and you have not built a better prompt. You have built a
control layer: software owns the guarantees, the model owns the judgment. Most
demonstrations of this stop at the diagram. This repository is the diagram, run.

The test of such a layer is not whether it works when the model behaves. It is
whether the outcome holds when the model is wrong, or has been manipulated into
being wrong. That is why the headline demo is a refusal rather than a success.

---

## 3. The seven control surfaces

```
   typed request
        │
   ┌────▼─────────────────────────┐
   │  S1  context assembler       │   state, not prose
   ├──────────────────────────────┤
   │  S2  typed decision          │   the model runs here, and only here
   ├──────────────────────────────┤
   │  S3  policy engine + hooks   │   permissions as data
   ├──────────────────────────────┤
   │  S4  deterministic verifier  │   facts, computed
   ├──────────────────────────────┤
   │  S5  effect broker           │   no effect without an authorization
   ├──────────────────────────────┤
   │  S6  receipt ledger          │   hash-chained, replayable
   └──────────────────────────────┘
   ┌──────────────────────────────┐
   │  S7  eval + mutation harness │   proves S1–S6 can fail
   └──────────────────────────────┘
```

**S1 — Context assembler.** No state lives in a prompt. Context is assembled per
turn from typed stores by `src/context/assembler.mjs`, against a token budget
declared in `policy/policy.json`. Run `npm run context -- --agent coc-assembler
--po PO-AER-5519` to see the exact bytes that would reach the model: every block
with its source, its reason for inclusion, its token cost, its hash, and its
trust label — then everything dropped and why. Budget overflow drops by declared
priority and records each drop, because silent truncation is the defect this
surface exists to prevent. Two runs produce a byte-identical bundle.

**S2 — Typed decisions.** `schemas/` holds the five output contracts as JSON
Schema draft 2020-12, and they are the single source of truth. One schema drives
three things: an Anthropic strict tool-use definition, where grammar-constrained
sampling makes an out-of-schema value unrepresentable rather than merely
rejected; an OpenAI structured-output response format, derived by a documented
transform rather than maintained as a second copy; and a bounded
validate-and-repair loop for providers with neither, which retries at most twice
and then fails closed. `npm run schemas:report` prints which constraints each
mechanism actually enforces, and where the two vendors' subsets disagree.

**S3 — Policy and hooks.** `policy/policy.json` is the only place permissions,
write boundaries and tripwires live. `hooks/publish-gate.mjs` enforces the write
boundary at the process boundary and fails closed on a missing or malformed
policy. The input tripwire labels instruction-shaped source content `untrusted`
rather than stripping it — stripping hides the attack; labelling makes it
auditable and lets the broker refuse anything downstream of it.
`npm run policy:explain -- --agent coc-assembler` prints what one agent may read,
write, and call, and which gate stands in front of each effect.

**S4 — Deterministic verifier.** Facts are computed, never asserted. The
completeness verifier resolves each required record against `data/index.json`,
cites it by path and sha256, and returns a typed verdict. Its exit codes are a
tested contract: `0` complete, `3` incomplete.

**S5 — Effect broker.** The only module permitted to publish or write outside
`reports/drafts/`. An authorization is minted only from a verdict, and is bound
to the effect's payload hash, bound to the verdict's input hashes, single-use,
and refused outright if any contributing context block was marked `untrusted`.
Edit the draft after the verdict and the token stops matching. There is no
override flag; adding one would be the bug.

**S6 — Receipt ledger.** Append-only JSONL, one chain per subject, each receipt
carrying the hash of its payload and of its predecessor. Sequence is a monotonic
logical counter, not a wall clock, so a run is reproducible.
`npm run audit -- --po PO-AER-5519` reconstructs the entire decision from
receipts alone — no model, no source documents — and verifies the chain.
`npm run audit:tamper` flips one byte and asserts the verification fails naming
the broken link.

**S7 — Evals and mutations.** Refusal cases are first-class: a fabricated
"complete" report must be rejected, and that rejection is a test, not a hope.
The mutation harness above is what makes the rest of the suite believable.

---

## 4. Capability matrix

Published guidance, mapped to the file that implements it and the command that
demonstrates it. No claim in this table is unaccompanied by something you can run.

| Guidance | Surface | Implementation | Command |
|---|---|---|---|
| Structured outputs (Anthropic) | S2 | `src/providers/anthropic.mjs`, `schemas/` | `npm run schemas:report` |
| Strict tool use (Anthropic) | S2 | `src/providers/anthropic.mjs` | `npm run schemas:report -- --strict` |
| Hooks and deterministic control (Claude Code) | S3 | `hooks/publish-gate.mjs`, `policy/policy.json` | `npm run demo:denied` |
| Effective context engineering (Anthropic) | S1 | `src/context/assembler.mjs` | `npm run context -- --agent coc-assembler` |
| Demystifying evals for agents (Anthropic) | S7 | `evals/`, `evals/mutations/` | `npm run evals:mutate` |
| Writing effective tools for agents (Anthropic) | S2 | `mcp-servers/kestrel-foundry-data/` | `npm run tools:report` |
| Building effective agents (Anthropic) | topology | `agents/`, `docs/architecture.md` | `npm run policy:explain` |
| Structured outputs (OpenAI) | S2 | `src/providers/openai.mjs` | `npm run schemas:report -- --provider openai` |
| Function calling (OpenAI) | S2 | `src/providers/openai.mjs` | `npm run tools:report -- --provider openai` |
| Agents SDK guardrails (OpenAI) | S3 | `policy/policy.json` tripwires | `npm run demo:injection` |
| Evals (OpenAI) | S7 | `evals/` | `npm run evals` |
| Practical guide to building agents (OpenAI) | topology | `docs/architecture.md` | — |

---

## 5. The agents

An orchestrator-workers topology with a deterministic router. The primary agent
holds no tools of its own; it routes each request to exactly one subagent.
Subagents declare their full tool inventory in frontmatter and may not exceed it.

| Agent | Scope | Tier |
|---|---|---|
| `quality-lead` (primary) | Routes every request to one subagent; composes the weekly digest. | sonnet |
| `ncr-triage` | One nonconformance → defect classification, likely cause code, repeat-offender flag. No dispositions. | haiku |
| `coc-assembler` | One purchase order → certificate completeness report. Fail-closed; missing records are reported, never inferred. | sonnet |
| `scrap-rollup` | Weekly scrap and yield rollup by cell and cause, variance against a trailing four-week average. | haiku |
| `audit-prep` | One audit → evidence areas mapped to documents, gap list with owners and effort. | sonnet |

The folder is also a Claude Code plugin. `claude --plugin-dir .` loads it for a
session; `claude plugin validate .` checks the manifest.

---

## 6. The facts the data is built around

Every demo claim resolves to something in `data/`, and the generator is seeded so
these hold on any machine.

| Baked-in fact | Where it lives | What it proves |
|---|---|---|
| Heat **HT-4471** has no mechanical test report, so **PO-AER-5519** must be refused | `data/docs/heat-lots/HT-4471/` (absent) | The verifier reports the gap and the broker refuses release |
| **PO-MER-5532** is complete | `data/docs/heat-lots/HT-4468/` | The verifier discriminates; every record cited by path and sha256 |
| **KC-1015** has four shrinkage nonconformances in 90 days, all cause P02 | `data/exports/qms/ncr-export.json` | Cross-record reasoning over a deterministic window; the flag comes from the tool, not the model |
| Scrap cause **P02** in Molding rises four straight weeks; top mover for week 2026-08-02 is **$29,952 against a $22,718.75 trailing-four average, +31.8%** | `data/exports/erp/scrap-export.csv` | The headline number is computed from the export — no estimate, no smoothing |
| Audit **AUD-2026-S1** is missing evidence areas **EA-7** and **EA-8** | `data/index.json` | Present and absent are resolved against the index, not recalled |

---

## 7. Verification

| Command | Proves | Green |
|---|---|---|
| `npm test` | Unit tests across the deterministic layer | all pass |
| `npm run evals` | Eval suite including refusal cases | all cases behave as named |
| `npm run evals:mutate` | Every guard can fail | all mutations caught |
| `npm run smoke:mcp` | Real MCP handshake, ten read-only tools, plus the data facts | 9 checks pass |
| `npm run verify:coc -- PO-AER-5519 --json` | The refusal, agent-free | exit **3**, `missing_records: ["mechanical-test"]` |
| `npm run verify:coc -- PO-MER-5532` | The positive case | exit **0** |
| `npm run validate:schemas` | Schemas compile; fixtures validate or are rejected as named | all good |
| `npm run audit:tamper` | A tampered receipt breaks the chain | detected, link named |
| `npm run generate:data` | The dataset reproduces byte-identically | same `data/index.json` hashes |
| `npm run verify:all` | Everything above, in order | exit 0 |

---

## 8. What this does not do

Worth stating plainly, because a control layer that claims too much is worse than
none. This design stops an injected instruction from changing an outcome, a model
from asserting a fact it cannot evidence, an effect from happening without an
authorization, and a record from being altered undetected.

It does not save you from a deterministic rule that is wrong, a schema that
permits something it should not, a compromised host, or a verifier fed the wrong
inputs. Those failures are still yours. What the layer buys is that they are
*findable* — every one of them leaves a receipt.

`docs/threat-model.md` sets this out properly.

---

## 9. Layout

```
policy/policy.json              permissions, write boundary, tripwires — as data
schemas/                        JSON Schema output contracts (draft 2020-12)
src/context/                    context assembly against a declared budget
src/decisions/                  the decision registry
src/providers/                  Anthropic strict tool use, OpenAI structured outputs, repair, replay
src/effects/                    authorization minting and the effect broker
src/ledger/                     append-only hash-chained receipts
hooks/publish-gate.mjs          PreToolUse write boundary, fail-closed
agents/                         one primary, four subagents
skills/                         seven skills
references/                     numbered domain docs 00–04
context/                        bounded per-agent memory
mcp-servers/kestrel-foundry-data/   read-only MCP server, ten tools
scripts/                        generator, verifier, reports, demos, runners
data/                           synthetic corpus (generated; immutable to agents)
evals/                          cases, expected fixtures, mutations
fixtures/provider/              recorded model responses — why no key is needed
docs/                           architecture, decision records, threat model, porting
ledger/                         receipts (generated)
reports/drafts/                 the only unguarded agent write target
reports/published/              guarded; requires an authorization
```

`docs/porting.md` covers swapping the domain. The pattern is not welded to
foundries; the foundry is what makes it legible.

---

## 10. Licence

Apache-2.0.
