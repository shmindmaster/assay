# AGENTS.md — assay

## Boundary

- Authorized client-pursuit prototype (Kestrel Castings / the sponsor). Synthetic fixtures only.
- Never copy credentials, customer data, export-controlled content, or private evidence here.
- Do not register this plugin in the AgentHub registry; it is client work, not a personal
  capability. AgentHub was pattern inspiration only.

## Change contract

- Dataset changes go through `scripts/generate-data.mjs` (seeded, reproducible) — never edit
  `data/` output by hand.
- Changing a subagent's scope means updating: its agent file, its schema in `schemas/`, its
  eval cases in `evals/cases/`, and `docs/architecture.md` in the same commit.
- Verify before committing: `npm test`, `npm run evals`, `npm run smoke:mcp`,
  `claude plugin validate .`
- Keep implemented / tested / demoed states distinct in commit messages.
