<div align="center">

<img src="docs/media/social-preview.png" alt="Assay: the agent drafts, software decides. A deterministic control layer for AI agents." width="100%">

# Assay

### The agent drafts. Software decides.

**An open-source control layer that stops an AI agent's mistake, or a prompt injection, from becoming a real-world effect.**

[![CI](https://github.com/shmindmaster/assay/actions/workflows/ci.yml/badge.svg)](https://github.com/shmindmaster/assay/actions/workflows/ci.yml)
[![CodeQL](https://github.com/shmindmaster/assay/actions/workflows/codeql.yml/badge.svg)](https://github.com/shmindmaster/assay/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/shmindmaster/assay?sort=semver)](https://github.com/shmindmaster/assay/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](package.json)

[Quickstart](#quickstart-60-seconds-no-api-key) · [Watch the film](#see-it-run) · [Architecture](#how-it-works) · [Guardrails](#guardrails) · [Status and limits](#status-and-limits) · [Contributing](#contributing-security-and-license)

</div>

---

## Why it exists

AI agents now draft decisions that release parts, move money and file records.
Most guardrails still ask the model to behave: a sterner system prompt, a
classifier in front of it, a reviewer who skims the output. A prompt injection
changes what the model says, so every one of those defenses sits on the side
of the line the attacker controls.

Assay moves the decision across that line. The model supplies judgment and
language. Code owns everything that needs a hard guarantee: the schema, the
permission, the computed facts, the authorization, the side effect and the
record. Every boundary between the two is typed, enforced and written to a
hash-chained receipt.

It is a runnable reference implementation of what published guidance from
Anthropic and OpenAI converges on (externalize state, type the decisions, put
policy in configuration, route effects through code, record what happened),
demonstrated on a domain where being wrong leaves a paper trail: releasing an
aerospace certificate of conformance at a fictional foundry. The vendors do not
endorse this project; their guidance is [linked below](#why-this-shape) so every
mapping can be checked.

## Quickstart (60 seconds, no API key)

```bash
git clone https://github.com/shmindmaster/assay
cd assay && npm install
npm run demo
```

Past `npm install` there is no API key, no account and no network call in any
documented command. The default provider replays recorded model responses, so
every run is byte-for-byte reproducible and free. Node 20 or later.

The demo ends on a refusal, and exits `3` on purpose:

```
PO-AER-5519   heat HT-4471
  draft verdict    (model)   COMPLETE
  computed verdict (code)    INCOMPLETE — missing: mechanical-test
  context                    10 blocks, 1 untrusted (data/docs/purchasing/PO-AER-5519.md)
  authorization              REFUSED — untrusted-context
  effect publish-coc         DENIED
  receipt                    ledger/PO-AER-5519.jsonl (chain verified, 6 receipts)

 The model said complete. The files said otherwise. Nothing shipped.
```

Then run these three:

```bash
npm run demo:injection   # an injected note fools the model, and still cannot release anything
npm run evals:mutate     # 8/8 deliberate regressions caught: every guard is proven able to fail
npm run explorer         # offline page that recomputes the receipt chain; tamper one byte and watch it break
```

## See it run

<a href="https://saroshhussain.com/films/assay-the-agent-drafts-software-decides.mp4">
  <img src="docs/media/assay-demo.gif" alt="Assay demo: the model drafts COMPLETE, the verifier computes INCOMPLETE, the broker refuses, and the Receipt Explorer shows a one-byte tamper breaking the chain." width="100%">
</a>

**[Watch the 2½-minute walkthrough film →](https://saroshhussain.com/films/assay-the-agent-drafts-software-decides.mp4)**
It follows one injected purchase order receipt by receipt, shows a live run on
Claude Sonnet 5.5 with its request ID and token counts on the decision receipt,
and ends in the source of the broker and the mutation harness.

## How it works

```mermaid
flowchart LR
  REQ([Typed request]) --> S1
  subgraph MODEL[" The model's lane "]
    S2["S2 · Typed decision<br/>schema-constrained draft"]
  end
  subgraph CODE[" Code's lane: deterministic "]
    S1["S1 · Context assembler<br/>trust-labels every block"]
    S4["S4 · Verifier<br/>computes facts from files"]
    S5{"S5 · Effect broker<br/>the only code that can publish"}
    S3[["S3 · policy.json + hooks"]]
    S6[("S6 · Receipt ledger<br/>hash-chained, replayable")]
  end
  S1 --> S2 --> S4 --> S5
  S3 -. permissions, write boundary .-> S5
  S5 -- "authorization bound to payload<br/>and verdict hashes" --> OUT([Effect: publish CoC])
  S5 -- refused --> NO([No effect])
  S1 & S2 & S4 & S5 --> S6
  S7["S7 · Evals + mutation harness"] -. proves each guard can fail .-> CODE
```

The model runs in exactly one place (S2). Its draft is evidence for the
verifier, never an instruction to the broker. An authorization is minted only
from a computed verdict, is bound to the payload hash and the verdict's input
hashes, is single-use, and is refused outright if any context block that fed
the decision was labelled untrusted. The [seven control surfaces](#the-seven-control-surfaces)
section walks through each one with the command that demonstrates it.

## Guardrails

| Guarantee | Enforced by | Prove it |
|---|---|---|
| Injected instructions are labelled, not hidden, and anything downstream of them is refused | S1 tripwire + S5 broker | `npm run demo:injection` |
| Facts are computed from files and cited by path and sha256, never asserted by the model | S4 verifier | `npm run verify:coc -- PO-AER-5519` (exit 3) and `-- PO-MER-5532` (exit 0) |
| No side effect without a single-use, hash-bound authorization | S5 broker + S6 ledger | `npm run demo:denied` |
| Permissions and write boundaries live in data, not in a prompt | S3 `policy/policy.json`, `hooks/publish-gate.mjs` | `npm run policy:explain -- --agent coc-assembler` |
| No override flag, and that claim is tested | S7 mutation `hooks/honour-env-override` | `npm run evals:mutate` |
| A changed byte in any receipt is detected and the broken link is named | S6 ledger | `npm run audit:tamper` |
| A release cannot ship if a guard stops catching its regression | `evals/gate.json` floors | `npm run gate` and `npm run gate:drill` |

## Status and limits

**v0.3.0, released 2026-10-15.** A reference implementation, not a hosted
product. Every record under `data/` is synthetic and generated from a seed.
The replay provider is the default; live paths for Anthropic (Claude Sonnet 5.5,
strict tool use) and OpenAI (structured outputs) are verified with recorded
evidence under [`docs/evidence/`](docs/evidence/) and run only when you opt in
with `ASSAY_LIVE=1` and your own key.

What it does not do, stated plainly: the receipt chain detects partial
tampering but is not unforgeable, because the chain head lives on the same host
and nothing anchors it externally. Single use is recorded on that same ledger,
and two processes appending to one subject at the same instant are not
serialised. It cannot save you from a deterministic rule that is wrong, a schema
that permits too much, a compromised host, or a verifier fed the wrong inputs.
What it buys is that each of those failures leaves a receipt.
[`docs/threat-model.md`](docs/threat-model.md) sets this out in full.

> **Everything here is synthetic.** Kestrel Castings is a fictional aluminium and
> magnesium sand-casting foundry. Every heat lot, nonconformance, purchase order
> and certificate under `data/` is generated by `scripts/generate-data.mjs`. No
> real company, system or record is involved. The domain is specific on purpose:
> a generic widget dataset cannot demonstrate a refusal that matters.

---

## The demos in detail

### `npm run demo` — the refusal

The output is shown in the [quickstart](#quickstart-60-seconds-no-api-key).

The exit code is deliberate: `3` is what the verifier returns for an incomplete
package, and the demo working means the release not happening.

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
mutation  authorization/accept-already-used         CAUGHT by authorization-replay
mutation  authorization/skip-outcome-binding        CAUGHT by authorization-verdict-outcome-binding
mutation  authorization/skip-verdict-shape           CAUGHT by authorization-verdict-shape
mutation  hooks/honour-env-override                 CAUGHT by no-env-override
mutation  ledger/skip-chain-check                   CAUGHT by audit-tamper
mutation  policy/widen-write-path                   CAUGHT by policy-escape
mutation  schema/remove-required-field              CAUGHT by schema-required-sha256
mutation  verifier/flip-completeness-comparison     CAUGHT by coc-po-aer-5519-refusal

8/8 mutations caught — every guard in this repo is demonstrably able to fail.
```

`hooks/honour-env-override` is the one to look at. This repository claims there
is no override path; an earlier revision of `hooks/publish-gate.mjs` shipped one
anyway, an environment variable that waved a guarded write through. That mutation
puts the line back and asserts a test notices, so the claim is enforced rather
than remembered.

Each mutation is a declarative patch in `evals/mutations/`, applied to a scratch
copy and reverted. A mutation the suite survives is reported as a coverage gap
and fails the run.

### `npm run explorer` — see the chain

```bash
npm run demo && npm run explorer
```

Renders `reports/explorer/index.html`, one offline page you open straight from
disk. Every receipt is a tag on a chain; the page recomputes every hash itself,
shows the context the agent saw with its trust labels, the records the verifier
found, and who produced each decision. Press **Tamper one byte** and a single
byte of the selected receipt changes: the chain turns red at that link, names
the mismatch, and marks every later receipt unverifiable. The page's verifier is
tested against the ledger's own, tamper by tamper, so it cannot show green for a
chain the broker would refuse.

The explorer also carries recorded live runs against OpenAI `gpt-6.1-sol` (structured outputs)
(`docs/evidence/live-run-2026-10-15-openai/`) and against Claude Sonnet 5.5
(`docs/evidence/live-run-2026-10-14/`), with the provider, model, request id,
tokens and latency on the decision receipt. The live model was not fooled by the
injected note; the release was refused anyway, because an authorization tracing
to an untrusted block is never minted, whatever the model says.

### `npm run gate` — releases are eval-gated

The release gate measures the tree against floors in `evals/gate.json`: eval
suite, guard coverage, refusal correctness, replay determinism, audit replay.
Deleting an eval case or a mutation drops a count below its floor, so coverage
cannot be "restored" by removing the test that caught a regression. The result
is committed as `docs/benchmark.md`, and CI fails if that file is stale.
`npm run gate:drill` applies deliberate regressions to a scratch copy and
requires the gate to block each one; a tagged release is published only after
the gate passes.

---

## Why this shape

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

Primary guidance used for the mapping:

- Anthropic: [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs),
  [strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use),
  [Claude Code hooks](https://code.claude.com/docs/en/hooks-guide),
  [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents),
  [agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents),
  [tool design](https://www.anthropic.com/engineering/writing-tools-for-agents), and
  [effective agents](https://www.anthropic.com/engineering/building-effective-agents).
- OpenAI: [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
  [function calling](https://developers.openai.com/api/docs/guides/function-calling),
  [Agents SDK guardrails](https://openai.github.io/openai-agents-python/guardrails/),
  [evals](https://developers.openai.com/api/docs/guides/evals), and the
  [practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf).

---

## The seven control surfaces

The Mermaid diagram under [How it works](#how-it-works) shows how these fit together.

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
Single use is a receipt on the ledger, not a flag in memory, so a restarted
process cannot replay a spent authorization, and an authorization is honoured
only if the ledger shows it being minted.
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

## Capability matrix

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

## The agents

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

## The facts the data is built around

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

## Verification

| Command | Proves | Green |
|---|---|---|
| `npm test` | Unit tests across the deterministic layer | all pass |
| `npm run evals` | Eval suite including refusal cases | all cases behave as named |
| `npm run evals:mutate` | Every guard can fail | all mutations caught |
| `npm run smoke:mcp` | Real MCP handshake (spec 2026-07-28), ten annotated read-only tools with output schemas, plus the data facts | 12 checks pass |
| `npm run verify:coc -- PO-AER-5519 --json` | The refusal, agent-free | exit **3**, `missing_records: ["mechanical-test"]` |
| `npm run verify:coc -- PO-MER-5532` | The positive case | exit **0** |
| `npm run validate:schemas` | Schemas compile; fixtures validate or are rejected as named | all good |
| `npm run audit:tamper` | A tampered receipt breaks the chain | detected, link named |
| `npm run generate:data` | The dataset reproduces byte-identically | same `data/index.json` hashes |
| `npm run verify:all` | Everything above, in order | exit 0 |
| `npm run gate` | Release gate: every floor in `evals/gate.json` holds | `RELEASE ALLOWED` |
| `npm run gate:drill` | The gate blocks each deliberate regression | 2/2 blocked |
| `npm run explorer` | Offline Receipt Explorer over the ledger | page written |
| `ASSAY_LIVE=1 npm run verify:live` | Opt-in: the live adapter against the real API (one paid call) | exit **3**, release refused |

---

## What this does not do

Worth stating plainly, because a control layer that claims too much is worse than
none. This design stops an injected instruction from changing an outcome, a model
from asserting a fact it cannot evidence, an effect from happening without an
authorization, and a draft from being edited between approval and publication.

It makes a record *partially* alterable without detection impossible. It does not
make the record unforgeable: the chain head lives on the same host, so anyone with
write access can regenerate a consistent chain. That needs an external anchor,
which this repository does not have and does not pretend to. The same limit
applies to single use: it is recorded on that ledger, so whoever can rewrite the
ledger can also forget a consumed authorization, and two processes appending to
one subject at the same instant are not serialised.

It does not save you from a deterministic rule that is wrong, a schema that
permits something it should not, a compromised host, or a verifier fed the wrong
inputs. Those failures are still yours. What the layer buys is that they are
*findable* — every one of them leaves a receipt.

`docs/threat-model.md` sets this out properly.

---

## Layout

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

---

## Contributing, security and license

- **Contributing:** issues and pull requests are welcome. Read
  [CONTRIBUTING.md](CONTRIBUTING.md) first; every change must keep
  `npm run verify:all` and `npm run gate` green, and a new guard needs a
  mutation that proves it can fail. Design proposals follow
  [GOVERNANCE.md](GOVERNANCE.md); planned work is in [ROADMAP.md](ROADMAP.md).
- **Security:** report vulnerabilities privately through a
  [GitHub security advisory](https://github.com/shmindmaster/assay/security/advisories/new),
  as described in [SECURITY.md](SECURITY.md). Please do not open a public issue.
- **License:** [Apache-2.0](LICENSE).

Created and maintained by [Sarosh Hussain](https://saroshhussain.com). Related
open source: [CrewScore](https://github.com/shmindmaster/crewscore) checks
whether an agent's prompt writes its safeguards down;
[GitPin](https://github.com/shmindmaster/gitpin) makes agent-authored pull
requests carry exact, re-checkable evidence.
