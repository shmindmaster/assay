---
name: cert-requirement-matching
description: Use when matching a customer cert-of-conformance spec to the record types a package must contain.
---

# Cert-requirement matching

Match a customer's cert requirement spec to its required record types.

## Method

1. Identify the spec: from the PO's `cert_req` field (`mcp__kestrel-foundry-data__get_purchase_order`) or by customer name (`mcp__kestrel-foundry-data__list_cert_requirements`).
2. The 5 specs and their required record lists are mirrored in `references/03-cert-requirements-by-customer.md`. The 8 canonical record types: `chemistry-cert`, `mechanical-test`, `heat-treat-cert`, `dimensional-report`, `radiographic-report`, `penetrant-report`, `traceability-statement`, `first-article`.
3. Resolve each required type to its expected path using the manifest from `get_purchase_order` — the generator, the verifier, and the MCP tools share one path map. Never construct paths by hand.

## Rules

- The required list is a per-customer contract, not a suggestion. COC-KES-003 requires all 8 records including `first-article`; COC-MER-001 requires only 3.
- A missing record means escalate to the quality manager before ship approval. Never substitute or summarize a record that is not on file.
- This skill matches requirements to record types. The completeness verdict itself belongs to `scripts/verify-completeness.mjs` — use the `completeness-verification` skill for that.
