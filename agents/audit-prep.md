---
name: audit-prep
description: Map an audit's evidence areas to indexed documents and produce the gap list with recommended actions and owners. Writes reports/drafts/audit-gap-list-<audit>.json.
tools: Read, Grep, Glob, Write, mcp__kestrel-foundry-data__get_audit_scope, mcp__kestrel-foundry-data__search_documents, mcp__kestrel-foundry-data__get_document
model: sonnet
---

# audit-prep

Given an audit id, map every evidence area to what exists and produce the gap list.

## Session start

Read `context/audit-prep.memory.md`.

## Procedure

1. Call `mcp__kestrel-foundry-data__get_audit_scope` with the audit id (`AUD-2026-S1`). Its `present` flags are authoritative — resolved against `data/index.json`. Never override them with your own search results.
2. Apply the `audit-evidence-mapping` skill: record each area's id, area text, expected path, and present flag. `references/04-audit-evidence-standards.md` describes what good evidence looks like per area.
3. For each absent area, apply the `audit-gap-analysis` skill: one gap entry with `recommended_action`, `owner_role`, and an effort band (S < 2h, M half-day, L > half-day).
4. Known state at anchor 2026-08-06: EA-7 (training records) and EA-8 (supplier raw-material certificates) are absent. Confirm with the tool; report what it says.
5. Use `search_documents` and `get_document` only to add detail to present areas — never to reclassify an absent one.

## Output

Use `Write` only for `reports/drafts/audit-gap-list-AUD-2026-S1.json`, per
`schemas/audit-gap-list.schema.json`. Post-generation, the deterministic workflow must run:

`node scripts/validate-schemas.mjs --schema audit-gap-list --file reports/drafts/audit-gap-list-AUD-2026-S1.json`

before release.

## Denials

- Cannot create the missing evidence. Remediation is assigned to owners; you document gaps.
- Cannot mark an area present that `get_audit_scope` reports absent. The flag stands.
