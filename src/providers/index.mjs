/**
 * Provider selection.
 *
 * Default: replay (fixtures/provider). No API key, no network.
 * Live Anthropic / OpenAI calls require ASSAY_LIVE=1 and are not on the
 * npm test / npm run demo path. With ASSAY_LIVE unset, no code path reaches
 * the network — requesting a live provider is an error, not a fallthrough.
 */
import { getDecision } from '../decisions/registry.mjs';
import { toStrictTool } from './anthropic.mjs';
import { toStructuredOutput } from './openai.mjs';
import { repair } from './repair.mjs';
import { replayProvider } from './replay.mjs';

export { getDecision, listDecisions } from '../decisions/registry.mjs';
export { toStrictTool, transformForAnthropic, ANTHROPIC_GRAMMAR } from './anthropic.mjs';
export { toStructuredOutput, transformForOpenAI, toFunctionDefinition, isOpenAICompliant, OPENAI_STRUCTURED } from './openai.mjs';
export { repair, RepairClosedError, MAX_RETRIES } from './repair.mjs';
export { replayProvider, complete as replayComplete, fixtureKey, keyFor, MissingFixtureError } from './replay.mjs';

function liveEnabled() {
  return process.env.ASSAY_LIVE === '1';
}

/**
 * The only function that may call globalThis.fetch. Refuses unless ASSAY_LIVE=1,
 * so a mistaken call with the flag unset cannot reach the network.
 */
export function liveFetch(url, options) {
  if (!liveEnabled()) {
    throw new Error(`blocked network call to ${url}: ASSAY_LIVE is unset; the default provider is replay`);
  }
  if (typeof globalThis.fetch !== 'function') {
    throw new Error(`live fetch is unavailable for ${url}`);
  }
  return globalThis.fetch(url, options);
}

async function completeAnthropicLive({ decision, prompt }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ASSAY_LIVE=1 requires ANTHROPIC_API_KEY for provider anthropic');
  const tool = toStrictTool(decision.schema, { name: decision.id });
  const res = await liveFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ASSAY_ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      tools: [{ name: tool.name, description: tool.description, strict: tool.strict, input_schema: tool.input_schema }],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic live HTTP ${res.status}`);
  const body = await res.json();
  const block = (body.content ?? []).find((b) => b.type === 'tool_use' && b.name === tool.name);
  if (!block) throw new Error('anthropic live response contained no matching tool_use block');
  return block.input;
}

async function completeOpenAILive({ decision, prompt }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('ASSAY_LIVE=1 requires OPENAI_API_KEY for provider openai');
  const format = toStructuredOutput(decision.schema, { name: decision.id });
  const res = await liveFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.ASSAY_OPENAI_MODEL ?? 'gpt-4o-2024-08-06',
      messages: [{ role: 'user', content: prompt }],
      response_format: {
        type: format.type,
        json_schema: {
          name: format.json_schema.name,
          description: format.json_schema.description,
          strict: format.json_schema.strict,
          schema: format.json_schema.schema,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`openai live HTTP ${res.status}`);
  const body = await res.json();
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('openai live response contained no content');
  return JSON.parse(text);
}

const anthropicLiveProvider = Object.freeze({
  name: 'anthropic',
  strict: true,
  needsRepair: false,
  complete: ({ decision, prompt }) => completeAnthropicLive({ decision, prompt }),
});

const openaiLiveProvider = Object.freeze({
  name: 'openai',
  strict: true,
  needsRepair: false,
  complete: ({ decision, prompt }) => completeOpenAILive({ decision, prompt }),
});

export function selectProvider(name) {
  const requested = name ?? process.env.ASSAY_PROVIDER ?? 'replay';
  if (requested === 'replay') return replayProvider;
  if (requested === 'anthropic' || requested === 'openai') {
    if (!liveEnabled()) {
      throw new Error(
        `provider "${requested}" is live-only. Set ASSAY_LIVE=1 to opt in; the default provider is replay and never reaches the network.`,
      );
    }
    return requested === 'anthropic' ? anthropicLiveProvider : openaiLiveProvider;
  }
  throw new Error(`unknown provider "${requested}"`);
}

/**
 * Run a typed decision. Replay (default) is wrapped in the repair loop because
 * it has no grammar. Live strict providers still pass through Ajv against the
 * canonical schema before anything is returned.
 */
export async function complete({ decisionId, prompt, provider: providerName } = {}) {
  if (decisionId == null || prompt == null) {
    throw new Error('complete() requires decisionId and prompt');
  }
  const decision = getDecision(decisionId);
  const provider = selectProvider(providerName);
  const generate = () => provider.complete({ decisionId, prompt, decision, providerName: provider.name });
  if (provider.needsRepair) {
    return repair(generate, decision.schema);
  }
  const value = await generate();
  return repair(async () => value, decision.schema, { maxRetries: 0 });
}
