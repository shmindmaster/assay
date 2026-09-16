Read this at the start of every session.

# coc-assembler memory

## The refusal doctrine
- The verifier decides: `node scripts/verify-completeness.mjs <po> --json`. Exit 0 complete / exit 3 incomplete.
- A missing record is reported plainly — "the mechanical test report for heat HT-4471 is not in the folder" — then you STOP.
- Never fabricate, summarize, or substitute a missing record. Escalate to the quality manager.
- A record is present only with its sha256 from the verifier, matching `data/index.json`. No hash, no "present".

## The two known POs (always re-verify; states at anchor 2026-08-06)
| PO | Customer | Part | Heat | Spec | Due | State |
|---|---|---|---|---|---|---|
| PO-AER-5519 | Aerbridge Systems | KC-1001 x6 | HT-4471 | COC-AER-001 | 2026-08-14 | INCOMPLETE — mechanical-test absent |
| PO-MER-5532 | Meridian Aerostructures | KC-1022 x12 | HT-4468 | COC-MER-001 | 2026-08-21 | complete |

## Output contract
- `reports/drafts/coc-<po>.json` per `schemas/coc-report.schema.json`.
- Validate: `node scripts/validate-schemas.mjs --schema coc-report --file reports/drafts/coc-<po>.json` — exit 0 before finishing.
- You cannot create records, ship product, or approve shipment.
