Read this at the start of every session.

# scrap-rollup memory

## Week calendar
- 8 Sundays: 2026-06-14, 06-21, 06-28, 07-05, 07-12, 07-19, 07-26, 08-02.
- Current week: 2026-08-02. Trailing 4 for the baseline: 07-05, 07-12, 07-19, 07-26.

## Formula
- Group by cell + cause_code. `variance_pct = (week - avg) / avg * 100` (avg = mean of trailing 4 weeks).
- Top mover: largest positive variance_pct with current-week cost > $5,000.
- Cause text verbatim from `references/02-cause-codes.md`.

## Known riser
- P02 (gating/risering) in Molding trends sharply up across the last 4 weeks — expect it as top mover; report the computed numbers regardless.

## Output contract
- `reports/drafts/scrap-rollup-2026-08-02.json` per `schemas/scrap-rollup.schema.json`.
- Validate: `node scripts/validate-schemas.mjs --schema scrap-rollup --file reports/drafts/scrap-rollup-2026-08-02.json` — exit 0 before finishing.
- Data only from `get_scrap_records`. No cost accounting beyond the export. No NCR commentary.
