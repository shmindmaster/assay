/**
 * Bounded validate-and-repair fallback for providers without strict mode.
 *
 * Validate with Ajv (draft 2020-12) against the canonical schema. On failure,
 * feed the errors back to the generator. Retry at most twice (three generate
 * calls in total: the initial attempt plus two retries), then fail closed
 * with the accumulated errors. Never coerce, never loop unbounded, never pass
 * a partial object downstream.
 */
import Ajv2020 from 'ajv/dist/2020.js';

export const MAX_RETRIES = 2;

export class RepairClosedError extends Error {
  constructor(attempts) {
    const last = attempts.at(-1);
    const detail = formatErrors(last?.errors);
    super(`repair failed closed after ${MAX_RETRIES} retries (${attempts.length} attempts): ${detail}`);
    this.name = 'RepairClosedError';
    this.attempts = attempts;
  }
}

export function makeAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addFormat('date', {
    type: 'string',
    validate: (s) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
      const d = new Date(`${s}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    },
  });
  return ajv;
}

export function formatErrors(errors) {
  return (errors ?? [])
    .map((e) => `${e.instancePath || '/'} [${e.keyword}] ${e.message}`)
    .join('; ');
}

export function compile(schema) {
  return makeAjv().compile(schema);
}

/**
 * @param {() => Promise<unknown> | unknown} generate
 *        Called with ({ attempt, previousErrors }). attempt is 1-based.
 * @param {object} schema canonical JSON Schema
 * @param {{ maxRetries?: number, log?: (event: object) => void }} [options]
 */
export async function repair(generate, schema, { maxRetries = MAX_RETRIES, log = () => {} } = {}) {
  if (maxRetries > MAX_RETRIES) {
    throw new Error(`maxRetries ${maxRetries} exceeds the hard bound of ${MAX_RETRIES}`);
  }
  const validate = compile(schema);
  const attempts = [];
  const maxAttempts = 1 + maxRetries;
  let previousErrors = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log({ event: 'repair-attempt', attempt, maxAttempts });
    const value = await generate({ attempt, previousErrors });
    if (validate(value)) {
      log({ event: 'repair-valid', attempt });
      return value;
    }
    previousErrors = (validate.errors ?? []).map((e) => ({ ...e }));
    attempts.push({ attempt, errors: previousErrors });
    log({ event: 'repair-invalid', attempt, errors: formatErrors(previousErrors) });
  }

  log({ event: 'repair-closed', attempts: attempts.length });
  throw new RepairClosedError(attempts);
}
