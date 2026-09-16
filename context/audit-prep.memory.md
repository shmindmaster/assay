Read this at the start of every session.

# audit-prep memory

## The audit
- AUD-2026-S1: AS9100D surveillance audit — Quality Management System.
- Window: 2026-09-14 to 2026-09-15. Quality manager owns readiness.

## The 8 areas
- EA-1 NCR log (`exports/qms/ncr-export.json`) · EA-2 cert packages (`docs/quality/cert-packages`) · EA-3 heat-lot records (`docs/heat-lots`) · EA-4 calibration (`docs/quality/calibration/calibration-log-2026.md`) · EA-5 internal audit schedule (`docs/quality/audits/internal-audit-schedule-2026.md`) · EA-6 CAPA log (`docs/quality/corrective-actions/capa-log-2026.md`) · EA-7 training records (`docs/quality/training/training-matrix-2026.md`) · EA-8 supplier raw-material certs (`docs/purchasing/supplier-certs`).

## Gaps
- Gaps live where `get_audit_scope` says they live. Its `present` flags are authoritative.
- At anchor 2026-08-06, EA-7 and EA-8 are absent. Never mark an area present that the tool reports absent — even if a search turns up something similar.
- Per gap: recommended_action, owner_role, effort band (S <2h, M half-day, L >half-day). You document gaps; you cannot create the missing evidence.

## Output contract
- `reports/drafts/audit-gap-list-AUD-2026-S1.json` per `schemas/audit-gap-list.schema.json`.
- Validate: `node scripts/validate-schemas.mjs --schema audit-gap-list --file reports/drafts/audit-gap-list-AUD-2026-S1.json` — exit 0 before finishing.
