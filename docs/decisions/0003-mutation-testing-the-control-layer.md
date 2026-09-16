# 3. Mutation testing the control layer

**Status:** accepted
**Surface:** S7

## 3.1 Decision

`npm run evals:mutate` applies declared defects to the control layer, runs the
eval suite against each mutated copy, and fails if any mutation survives.
Mutations live in `evals/mutations/*.json` as declarative patches applied to a
scratch copy; broken code is never committed.

## 3.2 The constraint that forced it

A green suite is evidence of nothing on its own. It is consistent with thorough
coverage and equally consistent with assertions that cannot fail — a check that
reads a value the operation never changes, a test that would pass against a
deleted guard.

This matters more here than in an ordinary codebase. Every claim this repository
makes rests on guards: the verifier, the write boundary, the authorization
binding, the chain check. If those guards are decorative, the claims are
decorative, and a reader has no way to tell from the outside. The question "how
do I know your tests mean anything" deserves a command rather than an assurance.

## 3.3 Alternatives rejected

**Coverage percentage.** Rejected: line coverage records that a line executed,
not that anything would have noticed it misbehaving. A suite that calls every
guard and asserts nothing reports excellent coverage.

**An off-the-shelf mutation testing library.** Rejected because generic operators
mutate everything and produce mostly noise — a flipped comparison in a rendering
helper is a survivor nobody should care about, and triaging those buries the five
that matter. The mutations here are chosen to target specific guards and each
names the eval case expected to catch it, which makes a survivor immediately
actionable.

**Manually breaking a guard and observing the failure.** Rejected: it works once,
is never repeated, and is not evidence to anyone who did not watch.

**Committing the mutations as disabled code paths.** Rejected. Deliberately
broken code in the tree will eventually be read as working code, and a flag that
turns a guard off is exactly the override path the design refuses elsewhere.

## 3.4 Consequences accepted

The mutation set is hand-maintained, so a new guard added without a matching
mutation silently reduces the strength of the claim. The harness reports a
survivor but cannot report an absence. `evals/README.md` makes adding a mutation
part of adding a guard.

Applying mutations to a scratch copy means the harness has to copy the repository
and restore cleanly on failure. That is slower than in-place patching and worth
it: in-place patching that dies mid-run leaves a sabotaged working tree.

Five mutations is a floor, not a target. The number in the output is honest about
what is covered, not a score.
