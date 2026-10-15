/**
 * Provider selection.
 *
 * Default: replay (fixtures/provider). No API key, no network.
 * Live Anthropic / OpenAI calls require ASSAY_LIVE=1 and are not on the
 * npm test / npm run demo path. With ASSAY_LIVE unset, no code path reaches
 * the network — requesting a live provider is an error, not a fallthrough.
 */
import { getDecision } from '../decisions/registry.mjs';
import { toStructuredOutput } from './openai.mjs';
import { repair } from './repair.mjs';
import { replayProvider, keyFor } from './replay.mjs';
import { completeAnthropicLive, LiveDecisionError } from './anthropic-live.mjs';

export { getDecision, listDecisions } from '../decisions/registry.mjs';
export { toStrictTool, transformForAnthropic, ANTHROPIC_GRAMMAR } from './anthropic.mjs';
export { toStructuredOutput, transformForOpenAI, toFunctionDefinition, isOpenAICompliant, OPENAI_STRUCTURED } from './openai.mjs';
export { repair, RepairClosedError, MAX_RETRIES } from './repair.mjs';
export { replayProvider, complete as replayComplete, fixtureKey, keyFor, MissingFixtureError } from './replay.mjs';
export { LiveDecisionError, DEFAULT_ANTHROPIC_MODEL, DEFAULT_ANTHROPIC_EFFORT } from './anthropic-live.mjs';

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

async function completeOpenAILive({ decision, prompt }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('ASSAY_LIVE=1 requires OPENAI_API_KEY for provider openai');
  const format = toStructuredOutput(decision.schema, { name: decision.id });
  const model = process.env.ASSAY_OPENAI_MODEL ?? 'gpt-4o-2024-08-06';
  const res = await liveFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
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
  return { value: JSON.parse(text), provenance: { provider: 'openai', model_requested: model, model_served: body.model ?? null } };
}

const anthropicLiveProvider = Object.freeze({
  name: 'anthropic',
  strict: true,
  needsRepair: false,
  complete: ({ decision, prompt }) => completeAnthropicLive({ decision, prompt, fetch: liveFetch }),
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
 * Run a typed decision and say who produced it. Replay (default) is wrapped in
 * the repair loop because it has no grammar. Live strict providers still pass
 * through Ajv against the canonical schema before anything is returned.
 *
 * Provenance is part of the result, not a side channel: replay names the
 * fixture key it served; a live provider names the requested and served model,
 * request id, token usage and latency. A receipt built from it can therefore
 * say exactly which producer a decision came from.
 *
 * @returns {Promise<{ value: object, provenance: object }>}
 */
export async function completeWithProvenance({ decisionId, prompt, provider: providerName } = {}) {
  if (decisionId == null || prompt == null) {
    throw new Error('complete() requires decisionId and prompt');
  }
  const decision = getDecision(decisionId);
  const provider = selectProvider(providerName);
  if (provider.needsRepair) {
    const generate = () => provider.complete({ decisionId, prompt, decision, providerName: provider.name });
    const value = await repair(generate, decision.schema);
    const { key } = keyFor({ decisionId, prompt, providerName: provider.name });
    return { value, provenance: { provider: provider.name, fixture_key: key } };
  }
  const { value: raw, provenance } = await provider.complete({ decisionId, prompt, decision, providerName: provider.name });
  try {
    const value = await repair(async () => raw, decision.schema, { maxRetries: 0 });
    return { value, provenance };
  } catch (error) {
    // The call happened and was billed; a schema failure must not erase who served it.
    throw new LiveDecisionError(`live ${provider.name} output failed the ${decisionId} schema: ${error.message}`, provenance);
  }
}

/** Run a typed decision and return only the validated value. */
export async function complete(args = {}) {
  const { value } = await completeWithProvenance(args);
  return value;
}
