# 00 — Quality system overview (Kestrel Castings, Ardmore facility)

Synthetic demo dataset. Anchor date: **2026-08-06** (read from `data/index.json` `anchor_date`; never the wall clock). All recency math in this system is relative to it.

## Plant

One facility (Ardmore). 6 production cells:

| Cell | Role |
|---|---|
| Molding | Green-sand molds and pouring |
| Melting | Furnaces F-1, F-2, F-3; alloy chemistry |
| Core Room | Core making and setting |
| Heat Treat | T6 temper: solution heat treat, water quench, artificial age |
| Finishing | Machining and finishing |
| Inspection | Visual, CMM, NDT (X-ray per ASTM E155; penetrant per ASTM E1417) |

## Alloys (4) — chemistry spec ranges, weight percent

### A356-T6 (aluminum)
| Si | Mg | Cu | Fe | Ti | Sr |
|---|---|---|---|---|---|
| 6.5–7.5 | 0.30–0.45 | 0–0.20 | 0–0.20 | 0–0.20 | 0.010–0.030 |

Nominal mechanicals: 34 ksi tensile, 24 ksi yield, 3.5% elongation, 80 BHN.

### C355-T6 (aluminum)
| Si | Cu | Mg | Fe | Ti |
|---|---|---|---|---|
| 4.5–5.5 | 1.0–1.5 | 0.40–0.60 | 0–0.20 | 0–0.20 |

Nominal mechanicals: 39 ksi tensile, 28 ksi yield, 3.0% elongation, 90 BHN.

### AZ91D (magnesium)
| Al | Zn | Mn | Si | Cu | Fe |
|---|---|---|---|---|---|
| 8.5–9.5 | 0.45–0.90 | 0.17–0.40 | 0–0.08 | 0–0.025 | 0–0.004 |

Nominal mechanicals: 33 ksi tensile, 22 ksi yield, 3.0% elongation, 66 BHN. The Fe limit (0.004%) is tight — HT-4466 exceeded it (NCR-2026-0089).

### ZE41A (magnesium)
| Zn | Zr | RE | Cu | Fe |
|---|---|---|---|---|
| 3.5–5.0 | 0.40–1.00 | 0.75–1.75 | 0–0.03 | 0–0.010 |

Nominal mechanicals: 30 ksi tensile, 20 ksi yield, 2.5% elongation, 62 BHN.

## Parts (10)

| PN | Name | Alloy | Weight (lbs) | Customer |
|---|---|---|---|---|
| KC-1001 | Gearbox Housing | A356-T6 | 1850 | Aerbridge Systems |
| KC-1002 | Impeller | C355-T6 | 220 | Summit Aero Engines |
| KC-1004 | Pump Body | A356-T6 | 640 | Meridian Aerostructures |
| KC-1007 | Bell Crank | C355-T6 | 95 | Kestrel Defense Systems |
| KC-1011 | Valve Body | AZ91D | 140 | Meridian Aerostructures |
| KC-1015 | Transmission Case | ZE41A | 2400 | Helix Rotorcraft |
| KC-1018 | Bracket Assembly | A356-T6 | 60 | Kestrel Defense Systems |
| KC-1022 | Compressor Housing | C355-T6 | 480 | Meridian Aerostructures |
| KC-1026 | Sump Cover | AZ91D | 85 | Summit Aero Engines |
| KC-1030 | Main Rotor Hub Housing | ZE41A | 3900 | Helix Rotorcraft |

Customers (5): Aerbridge Systems, Helix Rotorcraft, Meridian Aerostructures, Kestrel Defense Systems, Summit Aero Engines.

## Data layout (`data/`)

- `docs/heat-lots/HT-4460..HT-4479/` — per-heat records: chemistry-cert, mechanical-test (**absent for HT-4471**), heat-treat-cert, dimensional-report; radiographic-report + penetrant-report only on heats casting KC-1015 / KC-1030.
- `docs/quality/ncrs/` — 36 NCRs, NCR-2026-0081..NCR-2026-0116.
- `docs/quality/cert-packages/<PO>/traceability-statement.md` — per open PO.
- `docs/quality/cert-requirements/` — the 5 customer COC specs (see `references/03-cert-requirements-by-customer.md`).
- `docs/quality/calibration/`, `docs/quality/audits/`, `docs/quality/corrective-actions/`, `docs/quality/fai/` (one FAI per part).
- `docs/purchasing/` — PO documents.
- `exports/qms/ncr-export.json`; `exports/erp/` (heat-lot export, open POs, scrap CSV); `exports/customers/cert-requirements.json`; `exports/quality/` (audit scope, cert manifests).
- `index.json` — sha256 per document. The integrity backbone every verification cites.

## The MCP boundary

Agents never read `data/` directly. All reads go through the read-only MCP server `kestrel-foundry-data` (tools prefixed `mcp__kestrel-foundry-data__`), the stand-in for the future AWS warehouse + SharePoint estate. The boundary is enforced in code: no write tools exist; `get_document` serves only paths present in `data/index.json` and re-verifies the sha256 before returning content; list/search tools return pruned fields, not whole documents. `data/` is immutable to agents — `hooks/publish-gate.mjs` blocks writes.

## Volume

160 indexed documents: 20 heat lots (HT-4460..HT-4479, poured May–Aug 2026), 36 NCRs, 72 scrap rows across 8 weeks (Sundays 2026-06-14 through 2026-08-02), 2 open POs, 1 scheduled audit (AUD-2026-S1).
