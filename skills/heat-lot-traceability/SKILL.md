---
name: heat-lot-traceability
description: Use when pulling the full traceability picture for a heat lot — records on file, linked NCRs, and repeat history.
---

# Heat-lot traceability

Build the traceability picture for one heat lot (HT-4460..HT-4479).

## Method

1. `mcp__kestrel-foundry-data__get_heat_lot` — alloy, chemistry vs spec, mechanical results, `records_on_file` flags (the 6 heat-record types), and `linked_ncrs`.
2. `mcp__kestrel-foundry-data__get_test_record` per record type when you need a path + sha256. It returns `found:false` with the expected path when absent; it never invents one.
3. `mcp__kestrel-foundry-data__get_ncr` for each linked NCR when repeat history matters. The `repeat_analysis` block is authoritative.
4. For the plant-wide data map — cells, alloys, parts, folder layout — read `references/00-quality-system-overview.md`.

## Rules

- Report `records_on_file` exactly as the tool returns it. A `false` is a fact, not an error. HT-4471 has no mechanical test report; that absence is the demo's central case.
- NDT reports (radiographic, penetrant) exist only for heats casting KC-1015 and KC-1030. Their absence on other heats is expected, not a gap.
- Never read files under `data/` directly. The MCP boundary is the only read path; `get_document` re-verifies the sha256 against `data/index.json` before serving anything.
