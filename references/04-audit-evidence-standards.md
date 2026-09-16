# 04 — Audit evidence standards (AUD-2026-S1)

AS9100D surveillance audit — Quality Management System. Window: **2026-09-14 to 2026-09-15**. The registrar expects objective evidence in 8 areas. The quality manager owns readiness (per `data/docs/quality/audits/AUD-2026-S1-scope.md`).

## The 8 evidence areas

| ID | Area | Expected path | What good evidence looks like |
|---|---|---|---|
| EA-1 | Nonconformance log and disposition records | `exports/qms/ncr-export.json` | Complete NCR export: id, date, part, defect, cause, disposition, status, cost. 36 records in this dataset. |
| EA-2 | Certificate-of-conformance packages for open POs | `docs/quality/cert-packages/` | One folder per open PO with its traceability statement; per-package completeness verified by `scripts/verify-completeness.mjs`. |
| EA-3 | Heat-lot traceability records | `docs/heat-lots/` | Per-heat folder with chemistry cert, mechanical test, heat-treat cert, dimensional report (NDT where applicable). Known hole: HT-4471 mechanical test absent — expect a finding tied to PO-AER-5519. |
| EA-4 | Calibration records | `docs/quality/calibration/calibration-log-2026.md` | Asset list with last-cal and due dates; nothing overdue at audit time. Spectrometer CAL-014 is due 2026-09-02 — current through the window. |
| EA-5 | Internal audit schedule | `docs/quality/audits/internal-audit-schedule-2026.md` | Year plan with status per quarter (Q3 Finishing & Inspection scheduled 2026-08-24; Q4 Purchasing & Receiving 2026-11-09). |
| EA-6 | Corrective action log | `docs/quality/corrective-actions/capa-log-2026.md` | CAPA entries traced to source NCRs with action and status. |
| EA-7 | Training records | `docs/quality/training/training-matrix-2026.md` | Role-by-person training matrix for the current year, signed. **ABSENT at anchor 2026-08-06 — known gap.** |
| EA-8 | Supplier raw-material certificates | `docs/purchasing/supplier-certs/` | Incoming raw-material certs per supplier lot. **ABSENT at anchor 2026-08-06 — known gap.** |

## Rules

- Present/absent per area comes from `mcp__kestrel-foundry-data__get_audit_scope`, resolved against `data/index.json`. Not from memory, not from a folder hunch.
- EA-7 and EA-8 are the demo's gap case. They are absent; report them absent and put them on the gap list with recommended actions.
- "What good looks like" informs recommended actions in the gap list. It never reclassifies an area.
