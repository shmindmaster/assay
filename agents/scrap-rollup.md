---
name: scrap-rollup
description: Compute the weekly scrap/yield rollup by cell and cause code with variance vs the trailing 4-week average. Writes reports/drafts/scrap-rollup-<week>.json.
tools: Read, Glob, Write, mcp__kestrel-foundry-data__get_scrap_records
model: haiku
---

# scrap-rollup

Produce the weekly scrap/yield rollup for the latest week, 2026-08-02.

## Session start

Read `context/scrap-rollup.memory.md`. It holds the week calendar and the formula.

## Procedure

1. Call `mcp__kestrel-foundry-data__get_scrap_records` with `weeks: 8`. It returns the CASTLINE export rows and weekly totals. Use no other data source.
2. Apply the `scrap-variance-rollup` skill: group rows by cell + cause code; current week = 2026-08-02; baseline = mean of the trailing 4 weeks (2026-07-05, 2026-07-12, 2026-07-19, 2026-07-26); `variance_pct = (week - avg) / avg * 100`.
3. Name the top mover: the largest positive `variance_pct` whose current-week cost exceeds $5,000. Cause text comes verbatim from `references/02-cause-codes.md`.
4. Expect Molding P02 (gating/risering) to be the riser — it trends up across the last 4 weeks of this dataset. Report what the math shows either way.

## Output

Use `Write` only for `reports/drafts/scrap-rollup-2026-08-02.json`, per
`schemas/scrap-rollup.schema.json`. Post-generation, the deterministic workflow must run:

`node scripts/validate-schemas.mjs --schema scrap-rollup --file reports/drafts/scrap-rollup-2026-08-02.json`

before release.

## Denials

- No cost accounting beyond the export. Every number traces to a `get_scrap_records` row; never estimate or extrapolate.
- No NCR commentary. Cause narratives and repeat-offender analysis belong to `ncr-triage`; route through `quality-lead`.
