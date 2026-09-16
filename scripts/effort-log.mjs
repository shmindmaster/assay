#!/usr/bin/env node
/**
 * effort-log.mjs — append one work session to the effort ledger.
 *
 * This is the telemetry behind the reuse-curve claim in the Kestrel economics
 * note: real build hours, not asserted ones. Rows are appended, never edited —
 * the ledger is an audit trail.
 *
 * Usage:
 *   node scripts/effort-log.mjs --unit <slug> --hours <n> [--tier assembly|analytical|judgment]
 *                               [--activity build|discovery|process|pm|rework]
 *                               [--notes "free text"]
 *   node scripts/effort-log.mjs --list
 *
 * Shared/platform work (schemas, eval harness, hooks, MCP server, data layer)
 * is logged with --unit platform. Those hours amortise across every unit and
 * are exactly why unit N+1 is cheaper than unit N — the reuse curve made
 * visible in the rollup.
 */
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = join(ROOT, 'telemetry', 'effort-log.csv');
const HEADER = 'ts,unit,hours,tier,activity,notes\n';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!existsSync(LOG)) {
  mkdirSync(dirname(LOG), { recursive: true });
  // Write with UTF-8 BOM so Excel opens it with the right encoding.
  appendFileSync(LOG, '﻿' + HEADER);
}

if (args.includes('--list')) {
  process.stdout.write(readFileSync(LOG, 'utf8'));
  process.exit(0);
}

const unit = flag('--unit');
const hours = Number(flag('--hours'));
const tier = flag('--tier') ?? '';
const activity = flag('--activity') ?? 'build';
const notes = (flag('--notes') ?? '').replaceAll('"', '""'); // CSV-escape

if (!unit) fail('--unit is required (a unit slug, or "platform" for shared work)');
if (!Number.isFinite(hours) || hours <= 0) fail('--hours must be a positive number');
if (tier && !['assembly', 'analytical', 'judgment'].includes(tier)) {
  fail('--tier must be assembly | analytical | judgment');
}
if (!['build', 'discovery', 'process', 'pm', 'rework'].includes(activity)) {
  fail('--activity must be build | discovery | process | pm | rework');
}

const row = [new Date().toISOString(), unit, hours, tier, activity, `"${notes}"`].join(',') + '\n';
appendFileSync(LOG, row);
process.stdout.write(`logged: ${hours}h on ${unit} (${activity}${tier ? ', ' + tier : ''})\n`);

function fail(msg) {
  process.stderr.write(`effort-log: ${msg}\n`);
  process.exit(2);
}
