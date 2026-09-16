# 1. An effect broker, not tool permissions alone

**Status:** accepted
**Surface:** S5

## 1.1 Decision

Every side effect passes through `src/effects/broker.mjs`, which requires an
authorization minted from a deterministic verdict. Tool permissions and the
PreToolUse write boundary remain in force, but they are not the control that
decides whether a certificate is released.

## 1.2 The constraint that forced it

Tool permissions answer *may this agent call this tool*. They cannot answer *is
this particular call warranted by the facts*. Those are different questions, and
only the second one matters for release.

Concretely: `coc-assembler` legitimately needs to write a report. A permission
model can grant that. It cannot distinguish the correct report from one asserting
that a missing tensile test is present, because both are writes of a well-formed
report by an agent entitled to write reports. The distinction lives in the
relationship between the payload and the evidence, which no permission system
sees.

## 1.3 Alternatives rejected

**Tool permissions alone.** Rejected as above: expressive enough for *who*, not
for *whether*.

**A stricter output schema.** Rejected because a schema proves shape, not truth.
`evals/expected/coc-report.fabricated.invalid.json` is the demonstration — a
report citing records that do not exist validates cleanly against
`coc-report.schema.json`. Shape and truth are orthogonal, and conflating them is
the most common error in this design space.

**Human approval before release.** Rejected as the *primary* control, not as a
control. Approval is a judgment about a draft at a moment in time; nothing binds
it to the draft that eventually publishes, which is adversary 2.3 in the threat
model. Approval is worth having on top of the broker. It is not a substitute for
it, and a system that leans on it inherits the reviewer's attention as its
weakest component.

**A post-hoc audit that flags bad releases.** Rejected because the certificate
has already left by then.

## 1.4 Consequences accepted

The broker is a single point of enforcement, so a defect in it is a defect in
every guarantee. That concentration is the reason `evals/mutations/` includes
mutations aimed directly at it, and the reason it has no override path.

Authorizations are single-use and hash-bound, which makes legitimate retries
slightly awkward: a retry must re-verify rather than reuse. That cost is accepted.
A reusable authorization is a bearer token for releasing certificates, and the
convenience is not worth what it gives up.

Deterministic authority means a wrong rule is enforced perfectly. See the threat
model, section 4.
