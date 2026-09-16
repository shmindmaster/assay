/**
 * Decision registry — one typed output contract per registered decision.
 *
 * schemas/ is the single source of truth. This module binds each decision id
 * to a draft-2020-12 document, the owning agent in policy/policy.json, and
 * the refusal fixture that proves a named constraint actually bites.
 *
 * A missing schema file is a startup error. route-request is listed in policy
 * as a routing decision and has no output schema, so it is not registered.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMAS_DIR = path.join(REPO_ROOT, 'schemas');
const POLICY_PATH = path.join(REPO_ROOT, 'policy', 'policy.json');

function loadJson(abs) {
  return JSON.parse(readFileSync(abs, 'utf8'));
}

function schemaPathFor(schemaName) {
  return path.join(SCHEMAS_DIR, `${schemaName}.schema.json`);
}

function ownerAgent(decisionId, policy) {
  const owners = Object.entries(policy.agents)
    .filter(([, agent]) => Array.isArray(agent.decisions) && agent.decisions.includes(decisionId))
    .map(([name]) => name);
  if (owners.length !== 1) {
    throw new Error(
      `startup: decision "${decisionId}" must be listed under exactly one policy.agents.*.decisions (found ${owners.length}: ${owners.join(', ') || 'none'})`,
    );
  }
  return owners[0];
}

/**
 * Registered typed decisions. ids match policy.json agents.<name>.decisions
 * except route-request, which has no schema and is therefore not a typed
 * decision (quality-lead still owns it as a router, not an output contract).
 */
const DECISION_DEFS = [
  {
    id: 'coc-report',
    schemaName: 'coc-report',
    refusal: {
      path: 'evals/expected/coc-report.fabricated.invalid.json',
      constraint: 'status=complete forbids missing_records and requires every item on_file=true with a 64-hex sha256; on_file=true forbids a null hash',
      bites: 'allOf/if-then plus the item-level sha256 rule',
    },
  },
  {
    id: 'ncr-triage',
    schemaName: 'ncr-triage-output',
    refusal: {
      path: 'evals/expected/ncr-triage.invalid.json',
      constraint: 'cause_code must match the foundry vocabulary ^(P0[1-3]|M0[1-3]|C0[12]|D0[12]|H01|S01)$',
      bites: 'pattern',
    },
  },
  {
    id: 'scrap-rollup',
    schemaName: 'scrap-rollup',
    refusal: {
      path: 'fixtures/provider/scrap-rollup-refusal.json',
      constraint: 'top_mover.cause_code must match the foundry vocabulary; generated_from is const exports/erp/scrap-export.csv',
      bites: 'pattern + const',
    },
  },
  {
    id: 'audit-gap-list',
    schemaName: 'audit-gap-list',
    refusal: {
      path: 'fixtures/provider/audit-gap-list-refusal.json',
      constraint: 'additionalProperties is false; gaps items require recommended_action and owner_role',
      bites: 'additionalProperties + required',
    },
  },
  {
    id: 'compose-digest',
    schemaName: 'digest-input',
    refusal: {
      path: 'fixtures/provider/compose-digest-refusal.json',
      constraint: 'ncr_ageing.buckets must be exactly the four canonical labels, minItems=4 and maxItems=4',
      bites: 'minItems/maxItems + enum',
    },
  },
];

function freezeDecision(def, policy) {
  const schemaFile = schemaPathFor(def.schemaName);
  if (!existsSync(schemaFile)) {
    throw new Error(`startup: decision "${def.id}" schema file is absent: ${schemaFile}`);
  }
  const refusalAbs = path.join(REPO_ROOT, ...def.refusal.path.split('/'));
  if (!existsSync(refusalAbs)) {
    throw new Error(`startup: decision "${def.id}" refusal fixture is absent: ${def.refusal.path}`);
  }
  const schema = loadJson(schemaFile);
  const agent = ownerAgent(def.id, policy);
  return Object.freeze({
    id: def.id,
    schemaName: def.schemaName,
    schemaFile: path.relative(REPO_ROOT, schemaFile).replaceAll('\\', '/'),
    schema,
    agent,
    refusal: Object.freeze({
      path: def.refusal.path,
      constraint: def.refusal.constraint,
      bites: def.refusal.bites,
    }),
  });
}

function buildRegistry() {
  const policy = loadJson(POLICY_PATH);
  const byId = new Map();
  for (const def of DECISION_DEFS) {
    const decision = freezeDecision(def, policy);
    byId.set(decision.id, decision);
  }
  return byId;
}

const REGISTRY = buildRegistry();

export function getDecision(id) {
  const decision = REGISTRY.get(id);
  if (!decision) {
    const known = [...REGISTRY.keys()].join(', ');
    throw new Error(`unknown decision "${id}". registered: ${known}`);
  }
  return decision;
}

export function listDecisions() {
  return [...REGISTRY.values()];
}

export { REPO_ROOT, SCHEMAS_DIR };
