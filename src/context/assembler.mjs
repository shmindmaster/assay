/**
 * Typed context assembler. State lives in files and JSON stores; this module
 * is the only path that turns them into a prompt-shaped ContextBundle.
 *
 * Token budget: 1 token ≈ 4 characters (JavaScript string length, UTF-16 code
 * units). Documented approximation, deterministic, no tokenizer.
 *
 * Silent truncation is a defect. Anything that does not fit is recorded in
 * `dropped` with the priority at which the budget ran out.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { append, sha256Canonical } from '../ledger/index.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const POLICY_PATH = path.join(REPO_ROOT, 'policy', 'policy.json');
const CHARS_PER_TOKEN = 4;

function loadPolicy() {
  if (!existsSync(POLICY_PATH)) throw new Error('missing policy file: policy/policy.json');
  let policy;
  try {
    policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`malformed policy/policy.json: ${error.message}`);
  }
  if (!policy.agents || typeof policy.agents !== 'object') {
    throw new Error('policy.agents is missing');
  }
  if (!Array.isArray(policy.tripwires?.input)) {
    throw new Error('policy.tripwires.input is missing');
  }
  return policy;
}

function loadJson(repoRelative) {
  const abs = path.join(REPO_ROOT, ...repoRelative.split('/'));
  if (!existsSync(abs)) throw new Error(`missing store: ${repoRelative}`);
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    throw new Error(`malformed ${repoRelative}: ${error.message}`);
  }
}

function readText(repoRelative) {
  const abs = path.join(REPO_ROOT, ...repoRelative.split('/'));
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
}

function requireText(repoRelative) {
  const text = readText(repoRelative);
  if (text === null) throw new Error(`missing required file: ${repoRelative}`);
  return text;
}

function sha256Text(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function countTokens(text) {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeysDeep(value[key])]),
    );
  }
  return value;
}

function stablePretty(value) {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

function compileTripwires(policy) {
  return policy.tripwires.input.map((entry, index) => {
    if (!entry || typeof entry.id !== 'string' || !Array.isArray(entry.patterns)) {
      throw new Error(`policy.tripwires.input[${index}] is missing id or patterns`);
    }
    const regexes = entry.patterns.map((pattern, patternIndex) => {
      if (typeof pattern !== 'string' || pattern === '') {
        throw new Error(`policy.tripwires.input[${index}].patterns[${patternIndex}] is empty`);
      }
      let source = pattern;
      let flags = '';
      if (source.startsWith('(?i)')) {
        source = source.slice(4);
        flags += 'i';
      }
      try {
        return new RegExp(source, flags);
      } catch (error) {
        throw new Error(`invalid tripwire pattern ${entry.id}[${patternIndex}]: ${error.message}`);
      }
    });
    return { id: entry.id, action: entry.action ?? 'mark-untrusted', regexes };
  });
}

function trustFor(text, tripwires) {
  const fired = [];
  for (const tripwire of tripwires) {
    if (tripwire.regexes.some((regex) => regex.test(text))) fired.push(tripwire);
  }
  return fired;
}

function subjectFromRefs(entityRefs) {
  if (entityRefs === null || typeof entityRefs !== 'object' || Array.isArray(entityRefs)) {
    throw new Error('entityRefs must be an object');
  }
  for (const key of ['po', 'ncr', 'audit', 'subject']) {
    if (typeof entityRefs[key] === 'string' && entityRefs[key] !== '') return entityRefs[key];
  }
  throw new Error('entityRefs must name po, ncr, audit, or subject');
}

function addCandidate(candidates, { source, reason, priority, text }) {
  if (typeof source !== 'string' || source === '') throw new Error('block source is required');
  if (typeof reason !== 'string' || reason === '') throw new Error(`block ${source} is missing a reason`);
  if (!Number.isInteger(priority)) throw new Error(`block ${source} is missing an integer priority`);
  if (typeof text !== 'string') throw new Error(`block ${source} is missing text`);
  candidates.push({ source, reason, priority, text });
}

function loadIndexedDocument(repoRelative, index) {
  const text = readText(repoRelative);
  if (text === null) return null;
  const indexKey = repoRelative.replace(/^data\//, '');
  const expected = index.documents?.[indexKey];
  if (typeof expected !== 'string') {
    throw new Error(`unindexed document: ${repoRelative}`);
  }
  const actual = sha256Text(text);
  if (actual !== expected) {
    throw new Error(`hash mismatch for ${repoRelative}`);
  }
  return { text, sha256: actual };
}

function collectPoBlocks(candidates, po, index) {
  const manifests = loadJson('data/exports/quality/cert-manifests.json').manifests;
  const orders = loadJson('data/exports/erp/open-pos.json').purchase_orders;
  if (!manifests || typeof manifests !== 'object') {
    throw new Error('data/exports/quality/cert-manifests.json is missing manifests');
  }
  const manifest = manifests[po];
  if (!manifest) {
    throw new Error(`unknown PO "${po}" — known POs: ${Object.keys(manifests).sort().join(', ')}`);
  }
  const order = Array.isArray(orders) ? orders.find((row) => row.po === po) : null;
  if (!order) {
    throw new Error(`PO "${po}" is missing from data/exports/erp/open-pos.json`);
  }

  const poPath = `data/docs/purchasing/${po}.md`;
  const poDoc = loadIndexedDocument(poPath, index);
  if (poDoc === null) throw new Error(`missing purchase order document: ${poPath}`);
  addCandidate(candidates, {
    source: poPath,
    reason: 'requested purchase order',
    priority: 8,
    text: poDoc.text,
  });

  const items = manifest.required.map((req) => {
    const expectedPath = `data/${req.expected_path}`;
    const indexed = loadIndexedDocument(expectedPath, index);
    return {
      type: req.type,
      expected_path: req.expected_path,
      on_file: indexed !== null,
      sha256: indexed?.sha256 ?? null,
    };
  });
  addCandidate(candidates, {
    source: 'data/exports/quality/cert-manifests.json',
    reason: 'cert manifest for requested PO',
    priority: 7,
    text: stablePretty({
      po: manifest.po,
      customer: manifest.customer,
      part: manifest.part,
      qty: manifest.qty,
      heat: manifest.heat,
      cert_req: manifest.cert_req,
      due: manifest.due,
      items,
      missing_records: items.filter((item) => !item.on_file).map((item) => item.type),
    }),
  });

  const certPath = `data/docs/quality/cert-requirements/${manifest.cert_req}.md`;
  const certDoc = loadIndexedDocument(certPath, index);
  if (certDoc === null) throw new Error(`missing cert requirement document: ${certPath}`);
  addCandidate(candidates, {
    source: certPath,
    reason: 'customer cert specification for requested PO',
    priority: 6,
    text: certDoc.text,
  });

  for (const item of items) {
    if (!item.on_file) continue;
    const repoPath = `data/${item.expected_path}`;
    const body = loadIndexedDocument(repoPath, index);
    addCandidate(candidates, {
      source: repoPath,
      reason: `required ${item.type} on file for ${po}`,
      priority: 6,
      text: body.text,
    });
  }
}

function collectNcrBlocks(candidates, ncrId) {
  const ncrs = loadJson('data/exports/qms/ncr-export.json').ncrs;
  if (!Array.isArray(ncrs)) throw new Error('data/exports/qms/ncr-export.json is missing ncrs');
  const ncr = ncrs.find((row) => row.ncr_id === ncrId);
  if (!ncr) throw new Error(`unknown NCR "${ncrId}"`);
  addCandidate(candidates, {
    source: 'data/exports/qms/ncr-export.json',
    reason: 'requested NCR record',
    priority: 8,
    text: stablePretty(ncr),
  });
}

function collectAuditBlocks(candidates, auditId) {
  const scope = loadJson('data/exports/quality/audit-scope.json');
  if (scope.audit_id !== auditId) {
    throw new Error(`unknown audit "${auditId}" — known: ${scope.audit_id}`);
  }
  addCandidate(candidates, {
    source: 'data/exports/quality/audit-scope.json',
    reason: 'requested audit scope',
    priority: 8,
    text: stablePretty(scope),
  });
}

function collectCandidates({ agent, task, entityRefs }, policy, index) {
  const spec = policy.agents[agent];
  const candidates = [];

  if (!Array.isArray(spec.reads)) {
    throw new Error(`policy.agents.${agent}.reads must be an array`);
  }
  for (const rel of spec.reads) {
    if (typeof rel !== 'string' || rel === '') {
      throw new Error(`policy.agents.${agent}.reads contains an empty path`);
    }
    addCandidate(candidates, {
      source: rel,
      reason: 'declared read for this agent',
      priority: 10,
      text: requireText(rel),
    });
  }

  const memoryPath = `context/${agent}.memory.md`;
  addCandidate(candidates, {
    source: memoryPath,
    reason: 'session memory for this agent',
    priority: 9,
    text: requireText(memoryPath),
  });

  if (entityRefs.po) collectPoBlocks(candidates, entityRefs.po, index);
  if (entityRefs.ncr) collectNcrBlocks(candidates, entityRefs.ncr);
  if (entityRefs.audit) collectAuditBlocks(candidates, entityRefs.audit);

  addCandidate(candidates, {
    source: 'task',
    reason: 'current task',
    priority: 3,
    text: task,
  });

  return candidates;
}

function pack(candidates, budget) {
  const ordered = candidates
    .map((block, index) => ({ ...block, index }))
    .sort((a, b) => b.priority - a.priority || a.source.localeCompare(b.source) || a.index - b.index);

  const blocks = [];
  const dropped = [];
  let used = 0;
  for (const block of ordered) {
    if (used + block.tokens <= budget) {
      used += block.tokens;
      blocks.push({
        source: block.source,
        reason: block.reason,
        priority: block.priority,
        tokens: block.tokens,
        sha256: block.sha256,
        trust: block.trust,
        text: block.text,
      });
    } else {
      dropped.push({
        source: block.source,
        reason: `budget exceeded at priority ${block.priority}`,
        tokens: block.tokens,
      });
    }
  }
  return { blocks, dropped, used_tokens: used };
}

export function assemble(input, options = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('assemble() requires an object {agent, task, entityRefs}');
  }
  const { agent, task, entityRefs } = input;
  if (typeof agent !== 'string' || agent === '') throw new Error('agent is required');
  if (typeof task !== 'string' || task === '') throw new Error('task is required');

  const policy = loadPolicy();
  const spec = policy.agents[agent];
  if (!spec) {
    throw new Error(`unknown agent "${agent}" — known: ${Object.keys(policy.agents).sort().join(', ')}`);
  }
  const budget = spec.contextBudgetTokens;
  if (!Number.isInteger(budget) || budget <= 0) {
    throw new Error(`policy.agents.${agent}.contextBudgetTokens must be a positive integer`);
  }

  const subject = subjectFromRefs(entityRefs);
  const index = loadJson('data/index.json');
  const tripwires = compileTripwires(policy);
  const rawBlocks = collectCandidates({ agent, task, entityRefs }, policy, index);

  const prepared = rawBlocks.map((block) => {
    const fired = trustFor(block.text, tripwires);
    return {
      ...block,
      tokens: countTokens(block.text),
      sha256: sha256Text(block.text),
      trust: fired.length > 0 ? 'untrusted' : 'trusted',
      fired,
    };
  });

  const { blocks, dropped, used_tokens } = pack(prepared, budget);
  const keptSources = new Set(blocks.map((block) => block.source));

  for (const block of prepared) {
    for (const tripwire of block.fired) {
      append('tripwire_fired', agent, subject, {
        tripwire_id: tripwire.id,
        source: block.source,
        action: tripwire.action,
        trust: 'untrusted',
        kept: keptSources.has(block.source),
      }, options);
    }
  }

  const unsigned = {
    agent,
    budget_tokens: budget,
    used_tokens,
    blocks,
    dropped,
  };
  const bundle = {
    ...unsigned,
    sha256: sha256Canonical(unsigned),
  };

  append('context_assembled', agent, subject, {
    agent,
    budget_tokens: budget,
    used_tokens,
    block_count: blocks.length,
    dropped_count: dropped.length,
    sources: blocks.map((block) => block.source),
    dropped_sources: dropped.map((row) => row.source),
    untrusted_sources: blocks.filter((block) => block.trust === 'untrusted').map((block) => block.source),
    bundle_sha256: bundle.sha256,
  }, options);

  return bundle;
}
