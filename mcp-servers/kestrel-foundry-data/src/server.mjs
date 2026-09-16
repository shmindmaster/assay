#!/usr/bin/env node
/**
 * kestrel-foundry-data — READ-ONLY MCP boundary over the synthetic foundry dataset.
 *
 * This server is the demo's stand-in for the future AWS warehouse + SharePoint estate:
 * agents never read data files directly; they come through these tools. The boundary is
 * enforced in code, not prose:
 *   - there are no write tools at all;
 *   - get_document only serves paths present in data/index.json (no arbitrary file reads)
 *     and re-verifies the sha256 before returning content;
 *   - list/search tools return pruned fields, not whole documents (context budget is real).
 *
 * Determinism: the calendar anchor comes from data/index.json (anchor_date), never the wall
 * clock, so the demo behaves identically on any day it is run.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = process.env.KESTREL_DATA_ROOT
  ? path.resolve(process.env.KESTREL_DATA_ROOT)
  : path.resolve(SERVER_DIR, '..', '..', '..', 'data');

const loadJson = (rel) => JSON.parse(readFileSync(path.join(DATA_ROOT, ...rel.split('/')), 'utf8'));

const index = loadJson('index.json');
const ncrs = loadJson('exports/qms/ncr-export.json').ncrs;
const heats = loadJson('exports/erp/heat-lot-export.json').heat_lots;
const purchaseOrders = loadJson('exports/erp/open-pos.json').purchase_orders;
const certReqs = loadJson('exports/customers/cert-requirements.json').requirements;
const auditScope = loadJson('exports/quality/audit-scope.json');
const certManifests = loadJson('exports/quality/cert-manifests.json').manifests;
const scrapRows = (() => {
  const lines = readFileSync(path.join(DATA_ROOT, 'exports', 'erp', 'scrap-export.csv'), 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row = Object.fromEntries(head.map((h, i) => [h, cols[i]]));
    row.quantity_scrapped = Number(row.quantity_scrapped);
    row.weight_lbs = Number(row.weight_lbs);
    row.cost_usd = Number(row.cost_usd);
    return row;
  });
})();

const ANCHOR = index.anchor_date;
const DAY_MS = 86400000;
const daysBetween = (from, to) => Math.round((new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / DAY_MS);

const HEAT_RECORD_TYPES = ['chemistry-cert', 'mechanical-test', 'heat-treat-cert', 'dimensional-report', 'radiographic-report', 'penetrant-report'];
const onFile = (rel) => Object.prototype.hasOwnProperty.call(index.documents, rel);
const hashOf = (rel) => index.documents[rel] ?? null;
const heatRecordPath = (heat, type) => `docs/heat-lots/HT-${heat}/${type}-HT-${heat}.md`;

const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const notFound = (what) => ({ content: [{ type: 'text', text: JSON.stringify({ error: 'NOT_FOUND', what }) }], isError: true });

const server = new McpServer({ name: 'kestrel-foundry-data', version: '0.1.0' });

server.registerTool('list_ncrs', {
  description: 'List non-conformance reports (compact fields). Filter by status, defect type, cell, or recency (days before the dataset anchor date).',
  inputSchema: {
    status: z.enum(['open', 'closed']).optional(),
    defect_type: z.enum(['porosity', 'shrinkage', 'sand-inclusion', 'misrun-cold-shut', 'dimensional', 'chemistry']).optional(),
    cell: z.string().optional(),
    since_days: z.number().int().positive().optional(),
  },
}, async ({ status, defect_type, cell, since_days }) => {
  let rows = ncrs;
  if (status) rows = rows.filter((n) => n.status === status);
  if (defect_type) rows = rows.filter((n) => n.defect_type === defect_type);
  if (cell) rows = rows.filter((n) => n.cell.toLowerCase() === cell.toLowerCase());
  if (since_days) rows = rows.filter((n) => daysBetween(n.date, ANCHOR) <= since_days);
  return json({
    total: rows.length,
    ncrs: rows.map(({ narrative, ...rest }) => rest),
  });
});

server.registerTool('get_ncr', {
  description: 'Get one NCR in full, including repeat-offender history: prior NCRs on the same part + defect + cause within 90 days before its date.',
  inputSchema: { ncr_id: z.string().regex(/^NCR-2026-\d{4}$/) },
}, async ({ ncr_id }) => {
  const ncr = ncrs.find((n) => n.ncr_id === ncr_id);
  if (!ncr) return notFound(`No NCR with id ${ncr_id}`);
  const priors = ncrs.filter((n) =>
    n.ncr_id !== ncr.ncr_id &&
    n.part_number === ncr.part_number &&
    n.defect_type === ncr.defect_type &&
    n.cause_code === ncr.cause_code &&
    n.date <= ncr.date &&
    daysBetween(n.date, ncr.date) <= 90);
  return json({
    ...ncr,
    repeat_analysis: {
      prior_occurrences: priors.map((p) => ({ ncr_id: p.ncr_id, date: p.date, disposition: p.disposition })),
      occurrence_count_90d: priors.length + 1,
      repeat_offender: priors.length + 1 >= 3,
    },
  });
});

server.registerTool('get_heat_lot', {
  description: 'Get a heat lot: alloy, chemistry, mechanical results, which certification records are on file, and NCRs referencing it.',
  inputSchema: { heat_number: z.number().int().min(4460).max(4479) },
}, async ({ heat_number }) => {
  const heat = heats.find((h) => h.heat_number === heat_number);
  if (!heat) return notFound(`No heat lot HT-${heat_number}`);
  const records_on_file = Object.fromEntries(
    HEAT_RECORD_TYPES.map((t) => [t, onFile(heatRecordPath(heat_number, t))]),
  );
  return json({
    ...heat,
    records_on_file,
    linked_ncrs: ncrs.filter((n) => n.heat_number === heat_number).map((n) => n.ncr_id),
  });
});

server.registerTool('get_test_record', {
  description: 'Resolve a single certification record for a heat lot. Returns found:false with the expected path when the record is not on file — it never invents one.',
  inputSchema: {
    heat_number: z.number().int().min(4460).max(4479),
    record_type: z.enum(HEAT_RECORD_TYPES),
  },
}, async ({ heat_number, record_type }) => {
  const rel = heatRecordPath(heat_number, record_type);
  if (!onFile(rel)) {
    return json({ found: false, heat_number, record_type, expected_path: rel, message: `No ${record_type} on file for HT-${heat_number}.` });
  }
  return json({ found: true, heat_number, record_type, path: rel, sha256: hashOf(rel) });
});

server.registerTool('search_documents', {
  description: 'Search the document index by path tokens (AND-matched, case-insensitive). Returns paths + sha256, never content — call get_document for the body.',
  inputSchema: {
    query: z.string().min(1),
    prefix: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
}, async ({ query, prefix, limit }) => {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = Object.keys(index.documents)
    .filter((p) => (prefix ? p.startsWith(prefix) : true))
    .filter((p) => tokens.every((t) => p.toLowerCase().includes(t)))
    .slice(0, limit ?? 25)
    .map((p) => ({ path: p, sha256: index.documents[p] }));
  return json({ total: matches.length, matches });
});

server.registerTool('get_document', {
  description: 'Fetch one document body by its indexed path. The sha256 is re-verified against the index before anything is returned; unindexed paths are refused.',
  inputSchema: { path: z.string().min(1) },
}, async ({ path: docPath }) => {
  const rel = docPath.replace(/\\/g, '/').replace(/^data\//, '');
  if (!onFile(rel)) return notFound(`No indexed document at ${rel}`);
  const abs = path.join(DATA_ROOT, ...rel.split('/'));
  const content = readFileSync(abs, 'utf8');
  const actual = createHash('sha256').update(content.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
  if (actual !== index.documents[rel]) {
    return notFound(`Integrity check failed for ${rel}: file hash does not match the index`);
  }
  return json({ path: rel, sha256: actual, content });
});

server.registerTool('list_cert_requirements', {
  description: 'List customer certificate-of-conformance requirement specifications (required record types per customer).',
  inputSchema: { customer: z.string().optional() },
}, async ({ customer }) => {
  const rows = customer ? certReqs.filter((r) => r.customer.toLowerCase() === customer.toLowerCase()) : certReqs;
  return json({ total: rows.length, requirements: rows });
});

server.registerTool('get_purchase_order', {
  description: 'Get a purchase order with its cert-of-conformance manifest: every required record, its expected path, and whether it is actually on file. The completeness verdict comes from the index, not from the model.',
  inputSchema: { po: z.enum(purchaseOrders.map((p) => p.po)) },
}, async ({ po }) => {
  const manifest = certManifests[po];
  if (!manifest) return notFound(`No cert manifest for ${po}`);
  const items = manifest.required.map((r) => ({
    ...r,
    on_file: onFile(r.expected_path),
    sha256: hashOf(r.expected_path),
  }));
  const missing = items.filter((i) => !i.on_file);
  return json({
    ...manifest,
    items,
    status: missing.length === 0 ? 'complete' : 'incomplete',
    missing_records: missing.map((m) => m.type),
  });
});

server.registerTool('get_scrap_records', {
  description: 'Scrap/yield rows by week, cell and cause code (CASTLINE export). Pruned to the requested number of most recent weeks; includes weekly totals.',
  inputSchema: { weeks: z.number().int().min(1).max(8).optional() },
}, async ({ weeks }) => {
  const allWeeks = [...new Set(scrapRows.map((r) => r.week_ending))].sort();
  const selected = allWeeks.slice(-(weeks ?? 8));
  const rows = scrapRows.filter((r) => selected.includes(r.week_ending));
  const weekly_totals = selected.map((w) => ({
    week_ending: w,
    cost_usd: rows.filter((r) => r.week_ending === w).reduce((s, r) => s + r.cost_usd, 0),
    weight_lbs: rows.filter((r) => r.week_ending === w).reduce((s, r) => s + r.weight_lbs, 0),
  }));
  return json({ anchor_date: ANCHOR, weeks: selected, weekly_totals, rows });
});

server.registerTool('get_audit_scope', {
  description: 'Get an audit scope with each evidence area resolved against the document index: present:true/false per area. Absent areas are the gap list.',
  inputSchema: { audit_id: z.enum([auditScope.audit_id]) },
}, async ({ audit_id }) => {
  const areas = auditScope.evidence_areas.map((e) => {
    const isDoc = /\.(md|json)$/.test(e.expected_path);
    const present = isDoc ? onFile(e.expected_path)
      : Object.keys(index.documents).some((p) => p.startsWith(e.expected_path + '/'));
    return { ...e, present };
  });
  return json({
    audit_id,
    title: auditScope.title,
    window: auditScope.window,
    evidence_areas: areas,
    gaps: areas.filter((a) => !a.present).map((a) => ({ id: a.id, area: a.area, expected_path: a.expected_path })),
  });
});

// stdio transport. Any logging goes to stderr — stdout is protocol.
console.error(`kestrel-foundry-data: ${Object.keys(index.documents).length} indexed documents, anchor ${ANCHOR}`);
await server.connect(new StdioServerTransport());
