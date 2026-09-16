# 03 — Cert-of-conformance requirements by customer

The 5 customer COC specs, verbatim from `CERT_REQUIREMENTS` in `scripts/generate-data.mjs`. Mirrored in `data/docs/quality/cert-requirements/` and `data/exports/customers/cert-requirements.json`; served by `mcp__kestrel-foundry-data__list_cert_requirements`.

## COC-AER-001 — Aerbridge Systems
1. `chemistry-cert`
2. `mechanical-test`
3. `heat-treat-cert`
4. `dimensional-report`
5. `traceability-statement`

## COC-HEL-002 — Helix Rotorcraft
1. `chemistry-cert`
2. `mechanical-test`
3. `heat-treat-cert`
4. `dimensional-report`
5. `traceability-statement`
6. `radiographic-report`
7. `penetrant-report`

## COC-MER-001 — Meridian Aerostructures
1. `chemistry-cert`
2. `mechanical-test`
3. `traceability-statement`

## COC-KES-003 — Kestrel Defense Systems
1. `chemistry-cert`
2. `mechanical-test`
3. `heat-treat-cert`
4. `dimensional-report`
5. `traceability-statement`
6. `radiographic-report`
7. `penetrant-report`
8. `first-article`

## COC-SUM-002 — Summit Aero Engines
1. `chemistry-cert`
2. `mechanical-test`
3. `heat-treat-cert`
4. `dimensional-report`

## Where each record lives (canonical paths)

The generator, the completeness verifier (`scripts/verify-completeness.mjs`), and the MCP tools share one path map (`RECORD_PATHS`). Agents never invent paths.

| Record type | Expected path |
|---|---|
| chemistry-cert | `docs/heat-lots/HT-<heat>/chemistry-cert-HT-<heat>.md` |
| mechanical-test | `docs/heat-lots/HT-<heat>/mechanical-test-HT-<heat>.md` |
| heat-treat-cert | `docs/heat-lots/HT-<heat>/heat-treat-cert-HT-<heat>.md` |
| dimensional-report | `docs/heat-lots/HT-<heat>/dimensional-report-HT-<heat>.md` |
| radiographic-report | `docs/heat-lots/HT-<heat>/radiographic-report-HT-<heat>.md` |
| penetrant-report | `docs/heat-lots/HT-<heat>/penetrant-report-HT-<heat>.md` |
| traceability-statement | `docs/quality/cert-packages/<PO>/traceability-statement.md` |
| first-article | `docs/quality/fai/FAI-<part>.md` |

## The escalation rule (from every customer spec)

> Missing records must be escalated to the quality manager before ship approval. Do not substitute or summarize a record that is not on file.

No exceptions. A package with a missing record is incomplete, full stop. The completeness verdict itself comes only from `scripts/verify-completeness.mjs` — see the `completeness-verification` skill.
