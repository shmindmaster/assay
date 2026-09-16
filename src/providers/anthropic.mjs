/**
 * Anthropic adapter — canonical JSON Schema -> strict tool-use tool definition.
 *
 * Strict mode (`strict: true`) compiles the tool input_schema into a grammar
 * that constrains token sampling. An out-of-schema value is unrepresentable,
 * not merely rejected afterwards.
 *
 * Anthropic's grammar is a subset of draft 2020-12. This adapter derives the
 * wire schema from the canonical document (one source of truth) by dropping
 * keywords the grammar rejects with HTTP 400, and records which canonical
 * keywords the grammar actually enforces. It does not keep a second hand-written
 * schema.
 *
 * Subset (platform.claude.com structured-outputs JSON Schema limitations):
 *   Enforced: type, properties, required, additionalProperties:false, items,
 *             enum, const, anyOf, allOf (no $ref), pattern (limited regex),
 *             format (date-time|time|date|duration|email|hostname|uri|ipv4|ipv6|uuid),
 *             minItems of 0 or 1.
 *   Not enforced / stripped: if/then/else, not, numerical bounds, minLength,
 *             maxLength, maxItems, minItems other than 0|1, uniqueItems.
 *   Optional properties are allowed (unlike OpenAI structured outputs).
 */
const META = new Set(['$schema', '$id', '$comment']);
const STRIP = new Set([
  'if', 'then', 'else', 'not',
  'dependentRequired', 'dependentSchemas',
  'unevaluatedProperties', 'unevaluatedItems',
  'patternProperties', 'propertyNames',
  'minProperties', 'maxProperties',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength',
  'maxItems', 'uniqueItems',
  'contains', 'minContains', 'maxContains',
]);

export const ANTHROPIC_GRAMMAR = Object.freeze({
  enforced: Object.freeze([
    'type', 'properties', 'required', 'additionalProperties', 'items',
    'enum', 'const', 'anyOf', 'allOf', 'pattern', 'format', 'minItems',
  ]),
  notEnforced: Object.freeze([
    'if', 'then', 'else', 'not',
    'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
    'minLength', 'maxLength', 'maxItems', 'uniqueItems',
  ]),
  notes: Object.freeze({
    additionalProperties: 'must be false; other values 400',
    minItems: 'only 0 and 1 are grammar-enforced; other values are stripped',
    allOf: 'supported except allOf+$ref; if/then inside allOf is stripped',
    pattern: 'no backreferences, lookaround, or word boundaries',
    required: 'optional properties are allowed; unlike OpenAI, not every property must be required',
  }),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toolName(schema, fallback) {
  const raw = fallback ?? schema.title ?? 'decision';
  return String(raw).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 128) || 'decision';
}

function transformNode(node, dropped) {
  if (Array.isArray(node)) return node.map((item) => transformNode(item, dropped));
  if (!node || typeof node !== 'object') return node;

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (META.has(key) || STRIP.has(key)) {
      dropped.push(key);
      continue;
    }
    if (key === 'minItems' && value !== 0 && value !== 1) {
      dropped.push('minItems');
      continue;
    }
    if (key === 'allOf' && Array.isArray(value)) {
      const kept = value
        .map((entry) => transformNode(entry, dropped))
        .filter((entry) => entry && typeof entry === 'object' && Object.keys(entry).length > 0);
      if (kept.length === 0) {
        dropped.push('allOf');
        continue;
      }
      out.allOf = kept;
      continue;
    }
    out[key] = transformNode(value, dropped);
  }

  const isObject = out.type === 'object' || (out.properties && out.type == null);
  if (isObject) {
    out.type = 'object';
    out.additionalProperties = false;
  }
  return out;
}

/**
 * Derive the grammar-compatible input_schema from a canonical schema.
 * @returns {{ schema: object, dropped: string[] }}
 */
export function transformForAnthropic(schema) {
  const dropped = [];
  const next = transformNode(clone(schema), dropped);
  return { schema: next, dropped: [...new Set(dropped)] };
}

/**
 * Strict tool-use tool definition. `strict` is always true.
 */
export function toStrictTool(schema, { name, description } = {}) {
  const { schema: input_schema, dropped } = transformForAnthropic(schema);
  return {
    name: toolName(schema, name),
    description: description ?? schema.description ?? schema.title ?? '',
    strict: true,
    input_schema,
    _dropped: dropped,
  };
}

export function anthropicEnforces(keyword) {
  if (ANTHROPIC_GRAMMAR.enforced.includes(keyword)) return 'enforced';
  if (ANTHROPIC_GRAMMAR.notEnforced.includes(keyword)) return 'not-enforced';
  return 'unlisted';
}
