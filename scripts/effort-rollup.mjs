#!/usr/bin/env node
/**
 * effort-rollup.mjs — read the effort ledger and print the real economics:
 * hours and cost per unit, and the reuse curve (does unit N+1 cost less than
 * unit N once shared platform hours are amortised?).
 *
 * Usage:
 *   node scripts/effort-rollup.mjs            # human-readable table
 *   node scripts/effort-rollup.mjs --json     # machine-readable
 *
 * Rate is read from --rate <usd/hr>, else KESTREL_RATE, else 100.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = join(ROOT, 'telemetry', 'effort-log.csv');

const args = process.argv.slice(2);
const json = args.includes('--json');
const rateFlag = args.indexOf('--rate');
const rate = rateFlag >= 0 ? Number(args[rateFlag + 1]) : Number(process.env.KESTREL_RATE ?? 100);
if (!Number.isFinite(rate) || rate <= 0) {
  process.stderr.write('effort-rollup: rate must be a positive number\n');
  process.exit(2);
}

if (!existsSync(LOG)) {
  process.stderr.write('effort-rollup: no ledger at telemetry/effort-log.csv yet. Log a session first.\n');
  process.exit(1);
}

const lines = readFileSync(LOG, 'utf8').replace(/^﻿/, '').trim().split('\n');
const rows = lines.slice(1).filter(Boolean).map((line) => {
  // Minimal CSV parse: notes is the only quoted field and is always last.
  const m = line.match(/^([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),"(.*)"$/);
  if (!m) return null;
  const [, ts, unit, hours, tier, activity, notes] = m;
  return { ts, unit, hours: Number(hours), tier, activity, notes: notes.replaceAll('""', '"') };
}).filter(Boolean);

const units = [...new Set(rows.map((r) => r.unit).filter((u) => u !== 'platform'))];
const platformHours = rows.filter((r) => r.unit === 'platform').reduce((s, r) => s + r.hours, 0);
const byActivity = {};
for (const r of rows) byActivity[r.activity] = (byActivity[r.activity] ?? 0) + r.hours;

const perUnit = units.map((unit) => {
  const unitRows = rows.filter((r) => r.unit === unit);
  const hours = unitRows.reduce((s, r) => s + r.hours, 0);
  return { unit, hours, sessions: unitRows.length, tier: unitRows.find((r) => r.tier)?.tier ?? '' };
});
const directHours = perUnit.reduce((s, u) => s + u.hours, 0);
const totalHours = directHours + platformHours;
// Shared platform hours amortised evenly across units — the reuse curve.
const amortisedPerUnit = units.length ? platformHours / units.length : 0;
const blendedCostPerUnit = units.length ? (totalHours * rate) / units.length : 0;

const out = {
  rate_usd_per_hr: rate,
  units_built: units.length,
  per_unit: perUnit.map((u) => ({ ...u, amortised_hours: round(u.hours + amortisedPerUnit), cost_usd: round((u.hours + amortisedPerUnit) * rate) })),
  platform_hours: round(platformHours),
  direct_unit_hours: round(directHours),
  total_hours: round(totalHours),
  by_activity: Object.fromEntries(Object.entries(byActivity).map(([k, v]) => [k, round(v)])),
  blended_cost_per_unit_usd: round(blendedCostPerUnit),
  note: units.length < 2
    ? 'Need 2+ units logged before the reuse curve (falling cost per unit) is visible.'
    : 'Reuse curve: platform hours are shared, so each additional unit carries a smaller share of them.',
};

if (json) {
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\nEffort rollup — ${units.length} unit(s), rate $${rate}/hr\n`);
  console.log(pad('unit', 22) + pad('tier', 12) + pad('hrs', 7) + pad('amortised', 11) + 'cost');
  console.log('-'.repeat(60));
  for (const u of out.per_unit) {
    console.log(pad(u.unit, 22) + pad(u.tier || '-', 12) + pad(u.hours, 7) + pad(u.amortised_hours, 11) + '$' + u.cost_usd);
  }
  console.log('-'.repeat(60));
  console.log(`platform (shared)      ${platformHours}h  →  amortised $${round(amortisedPerUnit * rate)}/unit across ${units.length} unit(s)`);
  console.log(`by activity            ${Object.entries(byActivity).map(([k, v]) => `${k} ${round(v)}h`).join(', ')}`);
  console.log(`TOTAL                  ${round(totalHours)}h  →  $${round(totalHours * rate)}`);
  console.log(`\nblended cost per unit  $${round(blendedCostPerUnit)}   (total cost / units built)`);
  console.log(`\n${out.note}\n`);
}

function round(n) { return Math.round(n * 100) / 100; }
