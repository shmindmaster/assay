---
name: audit-gap-analysis
description: Use when turning absent audit evidence areas into a gap list with recommended action, owner role, and effort band.
---

# Audit gap analysis

Turn each absent evidence area into one actionable gap entry.

## Per gap

1. `recommended_action`: the smallest concrete step that produces the evidence. Name the artifact, not a sentiment — e.g. "Compile the 2026 training matrix at `docs/quality/training/training-matrix-2026.md`".
2. `owner_role`: the role that can produce it. EA-7 training records -> training coordinator, quality manager signs. EA-8 supplier certs -> purchasing / supplier quality. Match the role to the evidence, not to whoever asked.
3. `effort`: S (< 2 hours), M (half-day), L (> half-day). Base it on the artifact: a one-page matrix is S or M; chasing raw-material certs from suppliers is L.

## Rules

- One gap entry per absent area. Do not merge areas.
- Never downgrade or close a gap the tool still reports absent.
- `references/04-audit-evidence-standards.md` defines what "good" looks like per area; the action must produce exactly that artifact.
- The AUD-2026-S1 window is 2026-09-14 to 2026-09-15 — recommend effort that lands remediation before that window.
