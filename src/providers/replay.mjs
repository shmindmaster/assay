/**
 * Replay provider — the default. Serves recorded request/response pairs from
 * fixtures/provider/, keyed by sha256({ decisionId, promptHash, providerName }).
 *
 * A missing fixture is a hard error that names the key and how to record it.
 * There is no fallthrough to a live call. Output is JSON-cloned so two runs
 * are byte-identical.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES_DIR = path.join(REPO_ROOT, 'fixtures', 'provider');

export function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function promptHashOf(prompt) {
  return sha256Hex(prompt);
}

export function fixtureKey({ decisionId, promptHash, providerName }) {
  return sha256Hex(JSON.stringify({ decisionId, promptHash, providerName }));
}

export function keyFor({ decisionId, prompt, providerName = 'replay' }) {
  const promptHash = promptHashOf(prompt);
  return { decisionId, promptHash, providerName, key: fixtureKey({ decisionId, promptHash, providerName }) };
}

function missingMessage({ key, decisionId, promptHash, providerName }) {
  return [
    `missing replay fixture for key ${key}`,
    `  decisionId=${decisionId}`,
    `  promptHash=${promptHash}`,
    `  providerName=${providerName}`,
    `Record it by writing fixtures/provider/${key}.json with:`,
    `{`,
    `  "kind": "decision",`,
    `  "decisionId": ${JSON.stringify(decisionId)},`,
    `  "providerName": ${JSON.stringify(providerName)},`,
    `  "prompt": "<the exact prompt string>",`,
    `  "response": { }`,
    `}`,
    `Never fall through to a live provider — replay is fail-closed.`,
  ].join('\n');
}

export class MissingFixtureError extends Error {
  constructor(lookup) {
    super(missingMessage(lookup));
    this.name = 'MissingFixtureError';
    this.lookup = lookup;
  }
}

function loadAll() {
  if (!existsSync(FIXTURES_DIR)) {
    throw new Error(`replay fixtures directory is absent: ${path.relative(REPO_ROOT, FIXTURES_DIR)}`);
  }
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json')).sort();
  return files.map((file) => {
    const abs = path.join(FIXTURES_DIR, file);
    const data = JSON.parse(readFileSync(abs, 'utf8'));
    return { file, ...data };
  });
}

let cache = null;
export function listFixtures() {
  cache ??= loadAll();
  return cache;
}

export function listDecisionFixtures() {
  return listFixtures().filter((f) => (f.kind ?? 'decision') === 'decision');
}

export function listToolFixtures() {
  return listFixtures().filter((f) => f.kind === 'tool');
}

export function lookupFixture({ decisionId, prompt, providerName = 'replay' }) {
  const lookup = keyFor({ decisionId, prompt, providerName });
  const hit = listDecisionFixtures().find((f) => {
    const promptHash = f.promptHash ?? promptHashOf(f.prompt ?? '');
    const name = f.providerName ?? 'replay';
    const key = f.key ?? fixtureKey({ decisionId: f.decisionId, promptHash, providerName: name });
    return key === lookup.key;
  });
  if (!hit) throw new MissingFixtureError(lookup);
  return { ...hit, ...lookup };
}

export function complete({ decisionId, prompt, providerName = 'replay' }) {
  const hit = lookupFixture({ decisionId, prompt, providerName });
  // JSON clone so callers cannot mutate the cache and so two runs stringify identically.
  return JSON.parse(JSON.stringify(hit.response));
}

export const replayProvider = Object.freeze({
  name: 'replay',
  strict: false,
  needsRepair: true,
  complete,
});
