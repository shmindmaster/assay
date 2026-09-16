---
name: defect-classification
description: Use when classifying an NCR narrative into one of the 6 Kestrel defect types and a likely cause code.
---

# Defect classification

Classify an NCR narrative into exactly one defect type and one likely cause code.

## The 6 defect types

`porosity`, `shrinkage`, `sand-inclusion`, `misrun-cold-shut`, `dimensional`, `chemistry`.

## Method

1. Read the narrative for visual/NDT cues: "X-ray indication", "confirmed by sectioning", "at the machined face", "spectrometer read", "out of tolerance", "parting line".
2. Match cues to a type. When unsure, read `references/01-defect-taxonomy.md` — it lists definition, cues, and usual causes per type.
3. Pick the cause code from that type's usual set in `references/02-cause-codes.md`. Only the 12 codes P01–S01 exist; never invent one.
4. Cross-check the cell: `chemistry` belongs to Melting, `sand-inclusion` to Molding, `dimensional` to Inspection or Finishing. A mismatch means re-read the narrative, not force the fit.

## Honesty rules

- State confidence — high, medium, or low — with one sentence of why.
- Never force a classification. If the narrative supports two types, report both candidates with low confidence and name the evidence that would decide it.
- The NCR's own `defect_type` and `cause_code` fields (via `get_ncr`) are ground truth when present. Narrative classification corroborates them and covers narratives without codes.
