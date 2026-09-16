#!/usr/bin/env node
/**
 * context-report.mjs — print the exact context bundle an agent would receive.
 *
 *   node scripts/context-report.mjs --agent coc-assembler --po PO-AER-5519
 *
 * Each kept block is listed with source, reason, priority, token cost, running
 * total against the policy budget, trust label, and full text. Dropped blocks
 * follow with the reason they did not fit. No silent truncation.
 */
import { assemble } from '../src/context/assembler.mjs';

const EXIT = { OK: 0, FAIL: 1, USAGE: 2 };

function usage(message) {
  if (message) console.error(`error: ${message}`);
  console.error('usage: node scripts/context-report.mjs --agent <name> --po <PO> [--task <text>]');
  console.error('       also accepted: --ncr <id>  --audit <id>');
  process.exitCode = EXIT.USAGE;
}

function parseArgs(argv) {
  const out = { agent: null, po: null, ncr: null, audit: null, task: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const take = () => {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      return value;
    };
    if (arg === '--agent') out.agent = take();
    else if (arg === '--po') out.po = take();
    else if (arg === '--ncr') out.ncr = take();
    else if (arg === '--audit') out.audit = take();
    else if (arg === '--task') out.task = take();
    else if (arg.startsWith('--')) throw new Error(`unknown flag: ${arg}`);
    else throw new Error(`unexpected argument: ${arg}`);
  }
  return out;
}

function defaultTask({ agent, po, ncr, audit }) {
  if (po) return `Assemble the cert-of-conformance package for ${po}.`;
  if (ncr) return `Triage ${ncr}.`;
  if (audit) return `Prepare evidence mapping for ${audit}.`;
  throw new Error(`unable to derive a task for agent "${agent}"; pass --task`);
}

function entityRefsFrom(parsed) {
  const refs = {};
  if (parsed.po) refs.po = parsed.po;
  if (parsed.ncr) refs.ncr = parsed.ncr;
  if (parsed.audit) refs.audit = parsed.audit;
  return refs;
}

function printBundle(bundle) {
  const lines = [];
  lines.push(`Context bundle — agent=${bundle.agent}  budget=${bundle.budget_tokens}  sha256=${bundle.sha256}`);
  lines.push('');
  lines.push('KEPT');
  if (bundle.blocks.length === 0) {
    lines.push('  (none)');
  }
  let running = 0;
  for (const block of bundle.blocks) {
    running += block.tokens;
    lines.push(`  ${block.source}`);
    lines.push(`    reason:   ${block.reason}`);
    lines.push(`    priority: ${block.priority}  tokens: ${block.tokens}  running: ${running}/${bundle.budget_tokens}  trust: ${block.trust}`);
    lines.push(`    sha256:   ${block.sha256}`);
    lines.push('    ---');
    for (const row of block.text.split('\n')) lines.push(`    ${row}`);
    lines.push('    ---');
    lines.push('');
  }

  lines.push('DROPPED');
  if (bundle.dropped.length === 0) {
    lines.push('  (none)');
  } else {
    for (const row of bundle.dropped) {
      lines.push(`  ${row.source}`);
      lines.push(`    tokens: ${row.tokens}  reason: ${row.reason}`);
    }
  }
  lines.push('');
  lines.push(`used ${bundle.used_tokens} / budget ${bundle.budget_tokens}`);
  const untrusted = bundle.blocks.filter((block) => block.trust === 'untrusted');
  lines.push(`untrusted blocks: ${untrusted.length}${untrusted.length ? ` (${untrusted.map((block) => block.source).join(', ')})` : ''}`);
  return lines;
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(error.message);
    return;
  }
  if (!parsed.agent) {
    usage('missing required --agent');
    return;
  }
  const entityRefs = entityRefsFrom(parsed);
  if (Object.keys(entityRefs).length === 0) {
    usage('missing required --po, --ncr, or --audit');
    return;
  }

  let task;
  try {
    task = parsed.task ?? defaultTask({ agent: parsed.agent, ...entityRefs });
  } catch (error) {
    usage(error.message);
    return;
  }

  try {
    const bundle = assemble({ agent: parsed.agent, task, entityRefs });
    console.log(printBundle(bundle).join('\n'));
    process.exitCode = EXIT.OK;
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = EXIT.FAIL;
  }
}

main();
