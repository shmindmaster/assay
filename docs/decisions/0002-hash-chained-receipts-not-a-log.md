# 2. Hash-chained receipts, not a log

**Status:** accepted
**Surface:** S6

## 2.1 Decision

Decisions, verdicts, authorizations, effects, denials and tripwire firings are
recorded as receipts in an append-only chain under `ledger/`, each carrying the
hash of its canonicalized payload and of its predecessor. Sequence is a monotonic
logical counter, not a wall clock.

## 2.2 The constraint that forced it

The record has to answer a question after the fact, to someone who was not
present and has no reason to trust the operator: *on what basis was this
released?* A log answers a weaker question — what the process printed about
itself — and it answers that only if nobody has edited it since.

The logical counter is a second constraint, and a less obvious one. Wall-clock
timestamps make every run differ, which means a reviewer cannot diff two runs and
a test cannot assert on output. The demo has to be reproducible byte-for-byte to
be checkable at all, so time in the record is ordinal, not clock.

## 2.3 Alternatives rejected

**Structured logging to stdout or a file.** Rejected: silently editable, and
correlating a decision across lines is reconstruction rather than reading.

**A database with an audit table.** Rejected on dependency cost for a repository
whose first property is `npm install` and nothing else, and because a row is as
editable as a line unless something else makes it not.

**Signing each receipt with a private key.** Rejected for now as scope, not as a
bad idea. It answers *who wrote this* where the chain answers *has this been
altered*, and it needs key management that a clone-and-run repository should not
require. Recorded as an open question in the threat model.

**Recording only releases.** Rejected. Refusals are the more interesting record —
`npm run demo:injection` is a refusal, and a system that logs only its successes
cannot show that it declined when it should have.

## 2.4 Consequences accepted

**A local chain detects alteration, not replacement.** Anyone with write access
to `ledger/` can regenerate a whole consistent chain. This is stated plainly in
the threat model, section 3.5, rather than papered over. Closing it needs an
external anchor, which this repository does not have.

Canonicalization is load-bearing. Hashes are taken over JSON with object keys
sorted recursively; without that, an identical payload serialized differently
hashes differently and the chain breaks for no reason. This is a small function
that must not be treated as incidental.

The ledger grows without bound. Acceptable at demonstration scale; a real
deployment needs a retention policy, and a retention policy that truncates a hash
chain has to think about where the new genesis gets its trust.
