/**
 * Decision registry: one schema per registered decision, owner matches
 * policy.json, missing schema is a startup error, refusal fixtures exist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDecision, listDecisions, REPO_ROOT } from '../src/decisions/registry.mjs';

const policy = JSON.parse(readFileSync(path.join(REPO_ROOT, 'policy', 'policy.json'), 'utf8'));

test('five schema-backed decisions are registered', () => {
  const ids = listDecisions().map((d) => d.id).sort();
  assert.deepEqual(ids, ['audit-gap-list', 'coc-report', 'compose-digest', 'ncr-triage', 'scrap-rollup']);
});

test('route-request is a policy routing decision, not a typed output', () => {
  assert.equal(policy.agents['quality-lead'].decisions.includes('route-request'), true);
  assert.equal(listDecisions().some((d) => d.id === 'route-request'), false);
  assert.throws(() => getDecision('route-request'), /unknown decision/);
});

test('every registered decision has a schema file, an owner in policy, and a refusal fixture', () => {
  for (const decision of listDecisions()) {
    assert.equal(existsSync(path.join(REPO_ROOT, decision.schemaFile)), true, decision.schemaFile);
    assert.equal(decision.schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(policy.agents[decision.agent].decisions.includes(decision.id), true, `${decision.id} owner ${decision.agent}`);
    assert.equal(existsSync(path.join(REPO_ROOT, ...decision.refusal.path.split('/'))), true, decision.refusal.path);
    assert.equal(typeof decision.refusal.bites, 'string');
    assert.equal(typeof decision.refusal.constraint, 'string');
  }
});

test('getDecision returns the same object as listDecisions for coc-report', () => {
  const listed = listDecisions().find((d) => d.id === 'coc-report');
  const got = getDecision('coc-report');
  assert.equal(got.agent, 'coc-assembler');
  assert.equal(got.schemaName, 'coc-report');
  assert.equal(got.schema.title, listed.schema.title);
  assert.equal(got.schema, listed.schema);
});

test('compose-digest is bound to digest-input, ncr-triage to ncr-triage-output', () => {
  assert.equal(getDecision('compose-digest').schemaName, 'digest-input');
  assert.equal(getDecision('compose-digest').agent, 'quality-lead');
  assert.equal(getDecision('ncr-triage').schemaName, 'ncr-triage-output');
  assert.equal(getDecision('ncr-triage').agent, 'ncr-triage');
});

test('unknown decision is an error naming the registered ids', () => {
  assert.throws(() => getDecision('ship-approval'), /unknown decision "ship-approval"/);
  assert.throws(() => getDecision('ship-approval'), /coc-report/);
});
