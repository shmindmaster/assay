Read this at the start of every session.

# ncr-triage memory

## Repeat rules
- Window: 90 days before the NCR date. Threshold: `occurrence_count_90d >= 3` => repeat offender.
- `get_ncr` returns `repeat_analysis` with both numbers. It is authoritative — never count priors by hand.

## Known pattern
- KC-1015 Transmission Case (ZE41A, Helix Rotorcraft): rotor-boss shrinkage, cause P02 — the plant's chronic issue.
- 4 occurrences: NCR-2026-0091 (2026-05-19), NCR-2026-0098 (2026-06-09), NCR-2026-0107 (2026-07-08, scrapped), NCR-2026-0114 (2026-07-30, open).
- Heats: HT-4463, HT-4469, HT-4474, HT-4478.

## Classification honesty
- 6 defect types, 12 cause codes. Never invent either.
- State confidence (high/medium/low) with a reason. Ambiguous => report candidates; never force.
- The NCR's own defect_type/cause_code fields are ground truth; narrative classification corroborates.

## Output contract
- `reports/drafts/ncr-triage-<id>.json` per `schemas/ncr-triage-output.schema.json`.
- Validate: `node scripts/validate-schemas.mjs --schema ncr-triage-output --file reports/drafts/ncr-triage-<id>.json` — exit 0 before finishing.
- No dispositions. No document edits. No cert work.
