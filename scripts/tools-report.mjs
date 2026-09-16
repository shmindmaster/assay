#!/usr/bin/env node
/**
 * tools:report — per MCP tool in mcp-servers/kestrel-foundry-data/:
 *   input schema, median response token cost against fixtures/provider,
 *   and the eval case that exercises it.
 *
 * Ends with "Tools deliberately not added, and why".
 *
 *   npm run tools:report
 *   npm run tools:report -- --provider openai
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toFunctionDefinition } from '../src/providers/openai.mjs';
import { listToolFixtures } from '../src/providers/replay.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const openPos = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data', 'exports', 'erp', 'open-pos.json'), 'utf8'));
const auditScope = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data', 'exports', 'quality', 'audit-scope.json'), 'utf8'));

const HEAT_RECORD_TYPES = [
  'chemistry-cert', 'mechanical-test', 'heat-treat-cert',
  'dimensional-report', 'radiographic-report', 'penetrant-report',
];
const DEFECT_TYPES = ['porosity', 'shrinkage', 'sand-inclusion', 'misrun-cold-shut', 'dimensional', 'chemistry'];
const PO_ENUM = openPos.purchase_orders.map((p) => p.po);

/**
 * Input contracts mirrored from mcp-servers/kestrel-foundry-data/src/server.mjs
 * registerTool zod schemas. Optional fields stay optional here; the OpenAI
 * transform promotes them to required + nullable.
 */
const TOOLS = [
  {
    name: 'list_ncrs',
    description: 'List non-conformance reports (compact fields). Filter by status, defect type, cell, or recency (days before the dataset anchor date).',
    evalCase: 'ncr-0114-repeat-offender',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['open', 'closed'] },
        defect_type: { type: 'string', enum: DEFECT_TYPES },
        cell: { type: 'string' },
        since_days: { type: 'integer', exclusiveMinimum: 0 },
      },
    },
  },
  {
    name: 'get_ncr',
    description: 'Get one NCR in full, including repeat-offender history: prior NCRs on the same part + defect + cause within 90 days before its date.',
    evalCase: 'ncr-0114-repeat-offender',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ncr_id'],
      properties: {
        ncr_id: { type: 'string', pattern: '^NCR-2026-\\d{4}$' },
      },
    },
  },
  {
    name: 'get_heat_lot',
    description: 'Get a heat lot: alloy, chemistry, mechanical results, which certification records are on file, and NCRs referencing it.',
    evalCase: 'coc-po-aer-5519-refusal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['heat_number'],
      properties: {
        heat_number: { type: 'integer', minimum: 4460, maximum: 4479 },
      },
    },
  },
  {
    name: 'get_test_record',
    description: 'Resolve a single certification record for a heat lot. Returns found:false with the expected path when the record is not on file — it never invents one.',
    evalCase: 'coc-po-aer-5519-refusal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['heat_number', 'record_type'],
      properties: {
        heat_number: { type: 'integer', minimum: 4460, maximum: 4479 },
        record_type: { type: 'string', enum: HEAT_RECORD_TYPES },
      },
    },
  },
  {
    name: 'search_documents',
    description: 'Search the document index by path tokens (AND-matched, case-insensitive). Returns paths + sha256, never content — call get_document for the body.',
    evalCase: 'dataset-truths',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1 },
        prefix: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: 'get_document',
    description: 'Fetch one document body by its indexed path. The sha256 is re-verified against the index before anything is returned; unindexed paths are refused.',
    evalCase: 'ncr-0114-repeat-offender',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', minLength: 1 },
      },
    },
  },
  {
    name: 'list_cert_requirements',
    description: 'List customer certificate-of-conformance requirement specifications (required record types per customer).',
    evalCase: 'coc-po-aer-5519-refusal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        customer: { type: 'string' },
      },
    },
  },
  {
    name: 'get_purchase_order',
    description: 'Get a purchase order with its cert-of-conformance manifest: every required record, its expected path, and whether it is actually on file. The completeness verdict comes from the index, not from the model.',
    evalCase: 'coc-po-aer-5519-refusal',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['po'],
      properties: {
        po: { type: 'string', enum: PO_ENUM },
      },
    },
  },
  {
    name: 'get_scrap_records',
    description: 'Scrap/yield rows by week, cell and cause code (CASTLINE export). Pruned to the requested number of most recent weeks; includes weekly totals.',
    evalCase: 'scrap-top-mover',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        weeks: { type: 'integer', minimum: 1, maximum: 8 },
      },
    },
  },
  {
    name: 'get_audit_scope',
    description: 'Get an audit scope with each evidence area resolved against the document index: present:true/false per area. Absent areas are the gap list.',
    evalCase: 'audit-gaps',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['audit_id'],
      properties: {
        audit_id: { type: 'string', enum: [auditScope.audit_id] },
      },
    },
  },
];

const NOT_ADDED = [
  {
    name: 'write_document / update_ncr / close_ncr / create_record',
    why: 'The MCP boundary is read-only by construction. A write tool would let the model mutate the ground truth the verifier hashes against.',
  },
  {
    name: 'read_file / list_directory / glob_data',
    why: 'Those bypass get_document\'s index allowlist and sha256 re-check. Agents never read data/ directly.',
  },
  {
    name: 'execute_sql / query_warehouse / dump_corpus',
    why: 'Unconstrained query is how context budgets die. List/search tools return pruned fields; bodies are fetched one indexed path at a time.',
  },
  {
    name: 'approve_shipment / sign_coc / publish_report / send_email',
    why: 'Side effects belong to the effect broker. A tool that ships, signs, or mails would move a decision the model is not allowed to make.',
  },
  {
    name: 'get_ncr_history / get_part / get_po / get_cert_manifest / list_documents',
    why: 'Policy.json names capabilities; the server implements the smallest tool that actually answers them (get_ncr already returns 90-day priors; get_purchase_order already returns the manifest). Duplicate tools add tokens without adding facts.',
  },
];

export function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil(text.length / 4);
}

function median(nums) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function tokensFor(toolName) {
  const fixture = listToolFixtures().find((f) => f.name === toolName);
  const responses = (fixture?.calls ?? []).map((call) => call.response);
  const tokens = responses.map((response) => estimateTokens(response));
  return {
    n: tokens.length,
    median: median(tokens),
    samples: tokens,
    fixture: fixture ? `fixtures/provider/${fixture.file}` : null,
  };
}

function parseArgs(argv) {
  let provider = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--provider') provider = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('usage: node scripts/tools-report.mjs [--provider openai]');
      process.exit(0);
    } else {
      console.error(`unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  return { provider };
}

function printTool(tool, { provider }) {
  const cost = tokensFor(tool.name);
  console.log('-'.repeat(78));
  console.log(`tool      ${tool.name}`);
  console.log(`eval      evals/cases/${tool.evalCase}.json`);
  console.log(`tokens    median ${cost.median ?? 'n/a'}  (n=${cost.n}, 4-char estimate, fixtures/provider)`);
  if (cost.samples.length) console.log(`samples   ${cost.samples.join(', ')}`);
  console.log(`desc      ${tool.description}`);
  console.log('');
  if (provider === 'openai') {
    const fn = toFunctionDefinition(tool.inputSchema, { name: tool.name, description: tool.description });
    fn.function.name = tool.name;
    console.log('OpenAI function definition (strict, derived from the same input schema)');
    console.log(JSON.stringify({ type: fn.type, function: fn.function }, null, 2));
  } else {
    console.log('input schema');
    console.log(JSON.stringify(tool.inputSchema, null, 2));
  }
  console.log('');
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  console.log('assay tools:report — kestrel-foundry-data, 10 read-only tools');
  console.log('Token costs are median JSON.stringify(response).length/4 against fixtures/provider.');
  console.log('That is a deterministic estimate, not a vendor tokenizer.');
  if (flags.provider === 'openai') {
    console.log('Rendering OpenAI function definitions (strict: true) via src/providers/openai.mjs.');
  }
  console.log('');
  console.log(`tools on the server: ${TOOLS.length}`);
  console.log('');

  for (const tool of TOOLS) printTool(tool, flags);

  console.log('='.repeat(78));
  console.log('Tools deliberately not added, and why');
  console.log('');
  console.log('Tool restraint is a design decision. Ten read-only tools is the inventory;');
  console.log('everything below was considered and rejected.');
  console.log('');
  for (const item of NOT_ADDED) {
    console.log(`  ${item.name}`);
    console.log(`    ${item.why}`);
    console.log('');
  }
}

main();
