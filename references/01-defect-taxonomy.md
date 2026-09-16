# 01 — Defect taxonomy (6 types)

The only 6 defect types in this system (`DEFECT_TYPES` in `scripts/generate-data.mjs`). An NCR maps to exactly one.

## porosity
- **Definition:** Gas voids in the casting, surface or subsurface.
- **Cues:** Pin-holes at a machined face; subsurface indications at X-ray; "degassing log requested".
- **Usual causes:** M03 (hydrogen — degassing incomplete), P03 (sand moisture), P02 (gating/risering).
- **Cells:** Molding, Inspection.
- **Typical disposition:** Rework or repair when within acceptance limits; scrap when beyond.

## shrinkage
- **Definition:** Solidification voids at heavy section junctions; riser feed insufficient for the section.
- **Cues:** Indication at a section junction; "confirmed by sectioning"; X-ray shrinkage network.
- **Usual causes:** P02 (gating/risering inadequate for section thickness), M01 (melt temperature excursion).
- **Cells:** Molding, Inspection.
- **Typical disposition:** Rework when minor; scrap when the network exceeds rework limits (NCR-2026-0107). Chronic on KC-1015: 4 NCRs in 90 days, all P02.

## sand-inclusion
- **Definition:** Mold or core sand entrained in the casting.
- **Cues:** Visible at the parting line at visual; erosion inclusion near the ingate; "mold compaction record pulled".
- **Usual causes:** P01 (mold compaction below spec), P03 (sand moisture above limit).
- **Cells:** Molding.
- **Typical disposition:** Rework (grind/blend) where shallow; scrap by depth.

## misrun-cold-shut
- **Definition:** Incomplete fill; two metal fronts failed to fuse.
- **Cues:** Cold shut on a thin-wall run; pour temperature log shows the ladle at the low limit.
- **Usual causes:** M01 (melt temperature excursion), P02 (gating).
- **Cells:** Molding.
- **Typical disposition:** Usually scrap for cold shut; minor misrun may rework.

## dimensional
- **Definition:** A feature out of drawing tolerance.
- **Cues:** Boss location out of tolerance (e.g. 0.9 mm); flatness exceeds callout after heat treat; "fixture inspected".
- **Usual causes:** C01 (core shift), D02 (fixture wear), H01 (heat-treat distortion).
- **Cells:** Inspection, Finishing.
- **Typical disposition:** Rework (straightening, re-machine) or use-as-is with engineering approval.

## chemistry
- **Definition:** Alloy chemistry outside the spec range.
- **Cues:** Spectrometer verification outside the control band (e.g. Fe 0.006% against a 0.004% limit on AZ91D — NCR-2026-0089, heat HT-4466 diverted).
- **Usual causes:** M02 (chemistry off-specification). Only M02.
- **Cells:** Melting.
- **Typical disposition:** Heat diverted; castings scrapped. Critical severity.

## Using this reference

Match narrative cues to one type. If two types fit, report both with low confidence — never force. Full cause-code text: `references/02-cause-codes.md`. Dispositions here are domain guidance; the disposition on any specific NCR belongs to the quality manager, never to the triage agent.
