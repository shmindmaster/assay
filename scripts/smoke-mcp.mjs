#!/usr/bin/env node
/**
 * smoke-mcp.mjs — real client handshake against the kestrel-foundry-data MCP server.
 * Spawns the server over stdio, negotiates the protocol revision, checks the tool surface
 * (ten tools, each read-only and typed with an outputSchema), and asserts the demo-critical truths:
 *   1. HT-4471 has no mechanical-test record on file (refusal case)
 *   2. PO-MER-5532 resolves complete (positive case)
 *   3. NCR-2026-0114 carries 3 prior occurrences (repeat offender)
 * Exits non-zero on any failure.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

// The MCP spec revision this repository targets. Pinned here on purpose: if the SDK ever
// negotiated something older, the smoke test must fail rather than follow it.
const EXPECTED_REVISION = '2026-07-28';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(REPO_ROOT, 'mcp-servers', 'kestrel-foundry-data', 'src', 'server.mjs');

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER] });
const client = new Client({ name: 'kestrel-smoke-test', version: '0.2.0' }, { versionNegotiation: { mode: 'auto' } });

try {
  await client.connect(transport);

  check(`negotiated protocol revision is ${EXPECTED_REVISION} (modern era)`,
    client.getNegotiatedProtocolVersion() === EXPECTED_REVISION && client.getProtocolEra() === 'modern',
    `${client.getNegotiatedProtocolVersion()} / ${client.getProtocolEra()}`);

  const tools = await client.listTools();
  const expected = ['list_ncrs', 'get_ncr', 'get_heat_lot', 'get_test_record', 'search_documents',
    'get_document', 'list_cert_requirements', 'get_purchase_order', 'get_scrap_records', 'get_audit_scope'];
  const names = tools.tools.map((t) => t.name).sort();
  check('tools/list exposes exactly the 10 read-only tools',
    JSON.stringify(names) === JSON.stringify(expected.sort()), names.join(', '));

  const untyped = tools.tools.filter((t) => !t.outputSchema || t.outputSchema.type !== 'object').map((t) => t.name);
  check('every tool declares an object outputSchema', untyped.length === 0, untyped.join(', '));
  const notReadOnly = tools.tools.filter((t) => t.annotations?.readOnlyHint !== true
    || t.annotations?.destructiveHint !== false || t.annotations?.idempotentHint !== true).map((t) => t.name);
  check('every tool is annotated read-only, idempotent, non-destructive', notReadOnly.length === 0, notReadOnly.join(', '));

  // Successful calls must carry typed structuredContent (the client validates it against the
  // tool's outputSchema); an error result carries the NOT_FOUND text instead.
  const call = async (name, args) => {
    const res = await client.callTool({ name, arguments: args });
    if (res.isError) return JSON.parse(res.content[0].text);
    if (!res.structuredContent) throw new Error(`${name}: missing structuredContent`);
    return res.structuredContent;
  };

  const heat = await call('get_heat_lot', { heat_number: 4471 });
  check('HT-4471 mechanical-test record is absent', heat.records_on_file['mechanical-test'] === false);

  const rec = await call('get_test_record', { heat_number: 4471, record_type: 'mechanical-test' });
  check('get_test_record(4471, mechanical-test) returns found:false', rec.found === false && Boolean(rec.expected_path));

  const poAer = await call('get_purchase_order', { po: 'PO-AER-5519' });
  check('PO-AER-5519 is incomplete with mechanical-test missing',
    poAer.status === 'incomplete' && poAer.missing_records.includes('mechanical-test'));

  const poMer = await call('get_purchase_order', { po: 'PO-MER-5532' });
  check('PO-MER-5532 is complete', poMer.status === 'complete');

  const ncr = await call('get_ncr', { ncr_id: 'NCR-2026-0114' });
  check('NCR-2026-0114 repeat offender (3 priors)',
    ncr.repeat_analysis?.prior_occurrences?.length === 3 && ncr.repeat_analysis?.repeat_offender === true);

  const audit = await call('get_audit_scope', { audit_id: 'AUD-2026-S1' });
  const gapIds = audit.gaps.map((g) => g.id).sort();
  check('Audit gaps are exactly EA-7 and EA-8', JSON.stringify(gapIds) === JSON.stringify(['EA-7', 'EA-8']));

  const doc = await call('get_document', { path: 'docs/quality/ncrs/NCR-2026-0114.md' });
  check('get_document returns hash-verified content', typeof doc.content === 'string' && doc.content.includes('NCR-2026-0114'));

  const refused = await call('get_document', { path: 'docs/../../package.json' });
  check('get_document refuses unindexed path traversal', refused.error === 'NOT_FOUND');
} finally {
  await client.close();
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? `\nMCP smoke: all ${results.length} checks passed` : `\nMCP smoke: ${failed.length} FAILED`);
process.exit(failed.length === 0 ? 0 : 1);
