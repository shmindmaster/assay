# 02 — Cause codes (12, verbatim)

Source: `CAUSE_CODES` in `scripts/generate-data.mjs`. Quote these strings verbatim in outputs.

| Code | Description (verbatim) | Usually drives |
|---|---|---|
| P01 | Mold compaction below specification | sand-inclusion |
| P02 | Gating/risering design inadequate for section thickness | shrinkage, misrun-cold-shut, porosity |
| P03 | Sand moisture above control limit | porosity, sand-inclusion |
| M01 | Melt temperature excursion during pour | shrinkage, misrun-cold-shut |
| M02 | Chemistry off-specification | chemistry |
| M03 | Hydrogen porosity — degassing cycle incomplete | porosity |
| C01 | Core shift during mold close | dimensional |
| C02 | Core vent blockage | — (no default defect mapping in this dataset; valid for core-vent findings) |
| D01 | Machining damage at finishing | — (no NCR defect mapping; used in scrap coding, Finishing) |
| D02 | Fixture wear — dimensional drift | dimensional |
| H01 | Heat-treat distortion | dimensional |
| S01 | Handling damage post-cast | — (no NCR defect mapping; used in scrap coding, Inspection) |

## Prefix families

- **P** — molding process (P01–P03)
- **M** — melt (M01–M03)
- **C** — core (C01–C02)
- **D** — finishing/dimensional (D01–D02)
- **H** — heat treat (H01)
- **S** — handling (S01)

## Rules

- Never invent codes. Twelve exist; pick one or report undetermined.
- "Usually drives" comes from `DEFECT_CAUSES` in the generator. The classification skill picks the cause from the defect type's set when the evidence allows.
- P02 is the plant's chronic problem: KC-1015 shrinkage (4 NCRs in 90 days — NCR-2026-0091, -0098, -0107, -0114) and the rising Molding scrap trend. See `references/01-defect-taxonomy.md`.
