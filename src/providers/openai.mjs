/**
 * OpenAI adapter — canonical JSON Schema -> structured-output response format.
 *
 * Structured Outputs (`strict: true`) require a subset of JSON Schema, notably:
 *   - every object has additionalProperties: false
 *   - every property listed in required
 *   - no allOf / if / then / else / not / dependentRequired / dependentSchemas
 *   - const is not accepted; this transform rewrites it to a single-value enum
 *
 * The transform derives the compliant variant from the canonical schema. There
 * is no second hand-written copy. Constraints the subset cannot express remain
 * on the canonical document and are enforced by Ajv in the repair loop (and,
 * for CoC completeness, by the deterministic verifier).
 *
 * Subset (developers.openai.com structured-outputs supported schemas):
 *   Enforced: type, properties, required, additionalProperties:false, items,
 *             enum, anyOf, pattern, format (date-time|time|date|duration|email|
 *             hostname|ipv4|ipv6|uuid), number bounds, minItems, maxItems.
 *   Not supported: allOf, not, if, then, else, const (rewritten), minLength,
 *             maxLength, uniqueItems, patternProperties.
 *   Optional fields: emulate with type [T, "null"] and still list them in required.
 */
const META = new Set(['$schema', '$id', '$comment']);
const STRIP = new Set([
  'allOf', 'if', 'then', 'else', 'not',
  'dependentRequired', 'dependentSchemas',
  'unevaluatedProperties', 'unevaluatedItems',
  'patternProperties', 'propertyNames',
  'minProperties', 'maxProperties',
  'minLength', 'maxLength',
  'uniqueItems', 'contains', 'minContains', 'maxContains',
]);

export const OPENAI_STRUCTURED = Object.freeze({
  enforced: Object.freeze([
    'type', 'properties', 'required', 'additionalProperties', 'items',
    'enum', 'anyOf', 'pattern', 'format',
    'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
    'minItems', 'maxItems',
  ]),
  notSupported: Object.freeze([
    'allOf', 'if', 'then', 'else', 'not', 'const',
    'minLength', 'maxLength', 'uniqueItems',
  ]),
  requires: Object.freeze({
    additionalProperties: false,
    allPropertiesRequired: true,
  }),
  notes: Object.freeze({
    const: 'rewritten to enum: [value]',
    required: 'every property must be listed; optional fields become type [T, "null"]',
    additionalProperties: 'must be false on every object or the API 400s',
    allOf: 'composition is rejected; if/then completeness rules are dropped',
  }),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function schemaName(schema, fallback) {
  const raw = fallback ?? schema.title ?? 'decision';
  return String(raw).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'decision';
}

function makeNullable(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return { anyOf: [node, { type: 'null' }] };
  if (Object.prototype.hasOwnProperty.call(node, 'type')) {
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (!types.includes('null')) node.type = [...types, 'null'];
    return node;
  }
  if (Array.isArray(node.anyOf)) {
    const hasNull = node.anyOf.some((entry) => entry && entry.type === 'null');
    if (!hasNull) node.anyOf = [...node.anyOf, { type: 'null' }];
    return node;
  }
  return { anyOf: [node, { type: 'null' }] };
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
    if (key === 'const') {
      dropped.push('const');
      out.enum = [value];
      continue;
    }
    out[key] = transformNode(value, dropped);
  }

  const isObject = out.type === 'object' || (out.properties && out.type == null);
  if (isObject && out.properties && typeof out.properties === 'object') {
    out.type = 'object';
    out.additionalProperties = false;
    const originalRequired = new Set(out.required ?? []);
    for (const [propName, propSchema] of Object.entries(out.properties)) {
      if (!originalRequired.has(propName)) {
        out.properties[propName] = makeNullable(propSchema);
      }
    }
    out.required = Object.keys(out.properties);
  }
  return out;
}

/**
 * Derive the Structured Outputs-compliant variant from a canonical schema.
 * @returns {{ schema: object, dropped: string[] }}
 */
export function transformForOpenAI(schema) {
  const dropped = [];
  const next = transformNode(clone(schema), dropped);
  return { schema: next, dropped: [...new Set(dropped)] };
}

/**
 * Chat Completions / Responses `response_format` for structured outputs.
 */
export function toStructuredOutput(schema, { name, description } = {}) {
  const { schema: compliant, dropped } = transformForOpenAI(schema);
  return {
    type: 'json_schema',
    json_schema: {
      name: schemaName(schema, name),
      description: description ?? schema.description ?? schema.title ?? '',
      strict: true,
      schema: compliant,
    },
    _dropped: dropped,
  };
}

/**
 * OpenAI function-calling tool derived from the same transform (MCP tools).
 */
export function toFunctionDefinition(schema, { name, description } = {}) {
  const { schema: parameters, dropped } = transformForOpenAI(schema);
  return {
    type: 'function',
    function: {
      name: schemaName(schema, name),
      description: description ?? schema.description ?? schema.title ?? '',
      parameters,
      strict: true,
    },
    _dropped: dropped,
  };
}

export function isOpenAICompliant(schema) {
  const issues = [];
  walkCompliance(schema, '$', issues);
  return { ok: issues.length === 0, issues };
}

function walkCompliance(node, pointer, issues) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkCompliance(item, `${pointer}/${i}`, issues));
    return;
  }
  if (!node || typeof node !== 'object') return;

  for (const banned of ['allOf', 'if', 'then', 'else', 'not', 'const']) {
    if (Object.prototype.hasOwnProperty.call(node, banned)) {
      issues.push(`${pointer}: contains unsupported keyword ${banned}`);
    }
  }

  const isObject = node.type === 'object' || node.properties;
  if (isObject && node.properties) {
    if (node.additionalProperties !== false) {
      issues.push(`${pointer}: additionalProperties must be false`);
    }
    const required = new Set(node.required ?? []);
    for (const key of Object.keys(node.properties)) {
      if (!required.has(key)) issues.push(`${pointer}: property "${key}" is not in required`);
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && value && typeof value === 'object') {
      for (const [prop, schema] of Object.entries(value)) {
        walkCompliance(schema, `${pointer}/properties/${prop}`, issues);
      }
    } else if (key === '$defs' && value && typeof value === 'object') {
      for (const [definition, schema] of Object.entries(value)) {
        walkCompliance(schema, `${pointer}/$defs/${definition}`, issues);
      }
    } else if (key === 'items' || key === 'anyOf') {
      walkCompliance(value, `${pointer}/${key}`, issues);
    }
  }
}

export function openaiEnforces(keyword) {
  if (keyword === 'const') return 'rewritten-to-enum';
  if (OPENAI_STRUCTURED.enforced.includes(keyword)) return 'enforced';
  if (OPENAI_STRUCTURED.notSupported.includes(keyword)) return 'not-supported';
  return 'unlisted';
}
