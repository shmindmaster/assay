---
name: audit-evidence-mapping
description: Use when mapping audit scope evidence areas to indexed documents — present/absent comes from the audit-scope tool, not from searching.
---

# Audit evidence mapping

Map each evidence area of an audit scope to what exists in the document index.

## Method

1. `mcp__kestrel-foundry-data__get_audit_scope` with the audit id. It resolves every area against `data/index.json` and returns `present: true/false` per area, plus the gap list.
2. Record per area: id, area text, `expected_path`, `present`. File paths (`.md` / `.json`) must exist exactly; directory paths (e.g. `docs/heat-lots`) are present when any indexed document sits under them.
3. `references/04-audit-evidence-standards.md` describes what good evidence looks like for each of the 8 areas — use it to write informed commentary, never to override the flag.
4. `search_documents` / `get_document` may add detail (e.g. how many NCRs EA-1 covers, what a calibration due date is). They never flip a flag.

## Rules

- The tool's `present` flag is authoritative. Absent stays absent even if you find something similar elsewhere.
- At anchor 2026-08-06, EA-7 (training records) and EA-8 (supplier raw-material certificates) are absent. That is the demo's gap case — report it straight.
