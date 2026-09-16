# assay — project memory

Claude Code plugin prototype: a Quality department agent for Kestrel Castings (synthetic
foundry data only — no real client data ever enters this repo).

## Architecture in one paragraph

A read-only MCP server (`mcp-servers/kestrel-foundry-data`) is the data boundary over the
synthetic dataset in `data/` — it stands in for the future AWS warehouse + SharePoint/Outlook
estate. Four narrowly scoped subagents (`agents/`) each own one workflow, with skills in
`skills/`, numbered reference docs in `references/`, and bounded memory files in `context/`.
The primary agent `quality-lead` routes and composes the weekly HTML digest. Every subagent
output conforms to a JSON Schema in `schemas/`; cert-of-conformance completeness is verified
deterministically against content hashes in `data/index.json` — an agent literally cannot mark
a missing record "present" and pass validation.

## Conventions

- Node >= 20, ESM (`.mjs`), zero runtime dependencies outside `package.json`. No build step.
- Scripts are deterministic and idempotent. `npm run generate:data` reproduces the dataset
  byte-identically (seeded PRNG, no wall-clock reads).
- Agent guarantees live in code, schemas, and hooks — never only in prompt prose.
- Subagents declare their full tool inventory in frontmatter and may not exceed it.
- `data/`, `references/`, and `schemas/` are immutable to agents (enforced by
  `hooks/publish-gate.mjs`). Agent-written reports go to `reports/drafts/`; publishing to
  `reports/published/` requires human confirmation.
- Tests: `node --test tests/*.test.mjs`. Plugin manifest: `claude plugin validate .`
- Never commit real Kestrel data, credentials, or export-controlled content. Synthetic only.
