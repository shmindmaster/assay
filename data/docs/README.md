# Kestrel Castings — Quality document library (SYNTHETIC DEMO DATA)

SharePoint-style document tree for the quality department demo. All content is synthetic.

| Folder | Contents |
|---|---|
| `heat-lots/` | Per-heat-lot records: chemistry cert, mechanical test, heat treat, dimensional, NDT |
| `quality/ncrs/` | Non-conformance reports (NCR-2026-xxxx) |
| `quality/cert-packages/` | Per-PO cert-of-conformance assembly folders |
| `quality/cert-requirements/` | Customer cert-of-conformance requirement specifications |
| `quality/calibration/` | Calibration log |
| `quality/audits/` | Audit scopes and internal audit schedule |
| `quality/corrective-actions/` | CAPA log |
| `quality/fai/` | First-article inspection reports |
| `purchasing/` | Purchase orders |

Structured exports live in `../exports/` (QMS NCR export; CASTLINE scrap CSV, heat-lot and
open-PO exports; cert requirements; audit scope). The full document inventory with content
hashes is in `../index.json`.
