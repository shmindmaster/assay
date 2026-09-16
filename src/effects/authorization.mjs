import { createHash } from 'node:crypto';
import { append } from '../ledger/index.mjs';
import { verifyCompleteness } from '../../scripts/verify-completeness.mjs';

const usedAuthorizations = new Set();

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value), 'utf8').digest('hex');
}

function verdictBody(verifier, contextBlocks) {
  const inputHashes = verifier.items.map((item) => ({
    source: item.expected_path,
    sha256: sha256({
      type: item.type,
      expected_path: item.expected_path,
      on_file: item.on_file,
      sha256: item.sha256,
      integrity: item.integrity,
    }),
  }));
  const normalizedContext = contextBlocks.map((block) => ({
    source: block.source,
    sha256: block.sha256,
    trust: block.trust,
  }));
  return {
    type: 'VerdictRecord',
    rule: 'coc-completeness',
    subject: verifier.po,
    outcome: verifier.status.toUpperCase(),
    missing_records: [...verifier.missing_records],
    checked_at: verifier.checked_at,
    input_hashes: inputHashes,
    context_blocks: normalizedContext,
  };
}

function contextBlockError(contextBlocks) {
  for (const block of contextBlocks) {
    if (!block || typeof block.source !== 'string' || !/^[0-9a-f]{64}$/.test(block.sha256)) {
      return 'each context block must name source and sha256';
    }
    if (block.trust !== 'trusted' && block.trust !== 'untrusted') {
      return 'each context block trust must be "trusted" or "untrusted"';
    }
  }
  return null;
}

export function createVerdictRecord(subject, { contextBlocks = [] } = {}) {
  const verifier = verifyCompleteness(subject);
  if (verifier === null) throw new Error(`cannot create verdict: unknown subject "${subject}"`);
  if (!Array.isArray(contextBlocks)) throw new TypeError('contextBlocks must be an array');
  const invalidContext = contextBlockError(contextBlocks);
  if (invalidContext) throw new TypeError(invalidContext);

  const body = verdictBody(verifier, contextBlocks);
  return Object.freeze({ ...body, verdict_sha256: sha256(body) });
}

function refusal(rule, verdict, field, expected, actual) {
  return Object.freeze({
    ok: false,
    refusal: {
      rule,
      verdict,
      mismatch: { field, expected, actual },
    },
  });
}

export function mintAuthorization(effect, verdict) {
  if (!effect || typeof effect.id !== 'string' || !effect.payload || typeof effect.payload !== 'object') {
    throw new TypeError('effect must contain id and payload');
  }
  if (!verdict || verdict.type !== 'VerdictRecord') {
    return refusal('verdict-required', verdict ?? null, 'verdict.type', 'VerdictRecord', verdict?.type ?? null);
  }
  const { verdict_sha256: suppliedVerdictHash, ...verdictWithoutHash } = verdict;
  const actualVerdictHash = sha256(verdictWithoutHash);
  if (suppliedVerdictHash !== actualVerdictHash) {
    return refusal('verdict-integrity', verdict, 'verdict_sha256', actualVerdictHash, suppliedVerdictHash ?? null);
  }
  const untrusted = verdict.context_blocks.find((block) => block.trust === 'untrusted');
  if (untrusted) {
    return refusal('untrusted-context', verdict, `context_blocks.${untrusted.source}.trust`, 'trusted', 'untrusted');
  }

  const body = {
    type: 'EffectAuthorization',
    effect_id: effect.id,
    subject: verdict.subject,
    rule: verdict.rule,
    outcome: verdict.outcome,
    payload_sha256: sha256(effect.payload),
    verdict_sha256: verdict.verdict_sha256,
    verdict_input_hashes: structuredClone(verdict.input_hashes),
    context_blocks: structuredClone(verdict.context_blocks),
    verdict: {
      rule: verdict.rule,
      subject: verdict.subject,
      outcome: verdict.outcome,
      missing_records: [...verdict.missing_records],
      checked_at: verdict.checked_at,
    },
  };
  const authorization = Object.freeze({ ...body, authorization_id: sha256(body) });
  append('authorization_minted', 'effect-authorization', verdict.subject, {
    authorization_id: authorization.authorization_id,
    effect_id: effect.id,
    payload_sha256: authorization.payload_sha256,
    verdict_sha256: authorization.verdict_sha256,
    verdict_input_hashes: authorization.verdict_input_hashes,
    rule: authorization.rule,
    outcome: authorization.outcome,
  });
  return Object.freeze({ ok: true, authorization });
}

export function inspectAuthorization(effect, candidate) {
  if (candidate?.ok === false && candidate.refusal) return candidate.refusal;
  if (!candidate || candidate.type !== 'EffectAuthorization') {
    return {
      rule: 'authorization-required',
      verdict: candidate?.verdict ?? null,
      mismatch: { field: 'authorization.type', expected: 'EffectAuthorization', actual: candidate?.type ?? null },
    };
  }
  if (!Array.isArray(candidate.verdict_input_hashes) || !Array.isArray(candidate.context_blocks)) {
    return {
      rule: 'authorization-shape', verdict: candidate.verdict ?? null,
      mismatch: {
        field: 'authorization.bindings',
        expected: 'verdict_input_hashes and context_blocks arrays',
        actual: 'missing or malformed',
      },
    };
  }
  const invalidContext = contextBlockError(candidate.context_blocks);
  if (invalidContext) {
    return {
      rule: 'authorization-shape', verdict: candidate.verdict ?? null,
      mismatch: {
        field: 'authorization.context_blocks',
        expected: 'blocks with source, sha256, and trust',
        actual: invalidContext,
      },
    };
  }
  const verifier = verifyCompleteness(candidate.subject);
  if (verifier === null) {
    return {
      rule: 'authorization-shape', verdict: candidate.verdict ?? null,
      mismatch: {
        field: 'authorization.subject',
        expected: 'known subject',
        actual: candidate.subject ?? null,
      },
    };
  }
  if (candidate.effect_id !== effect.id) {
    return {
      rule: 'effect-binding', verdict: candidate.verdict,
      mismatch: { field: 'effect_id', expected: effect.id, actual: candidate.effect_id },
    };
  }
  const actualPayloadHash = sha256(effect.payload);
  if (candidate.payload_sha256 !== actualPayloadHash) {
    return {
      rule: 'payload-binding', verdict: candidate.verdict,
      mismatch: { field: 'payload_sha256', expected: candidate.payload_sha256, actual: actualPayloadHash },
    };
  }
  const currentVerdict = verdictBody(verifier, candidate.context_blocks);
  if (canonicalJson(candidate.verdict_input_hashes) !== canonicalJson(currentVerdict.input_hashes)) {
    return {
      rule: 'verdict-input-binding', verdict: candidate.verdict,
      mismatch: { field: 'verdict_input_hashes', expected: currentVerdict.input_hashes, actual: candidate.verdict_input_hashes },
    };
  }
  const untrusted = candidate.context_blocks.find((block) => block.trust === 'untrusted');
  if (untrusted) {
    return {
      rule: 'untrusted-context', verdict: candidate.verdict,
      mismatch: { field: `context_blocks.${untrusted.source}.trust`, expected: 'trusted', actual: 'untrusted' },
    };
  }
  const { authorization_id: suppliedId, ...body } = candidate;
  const actualId = sha256(body);
  if (suppliedId !== actualId) {
    return {
      rule: 'authorization-integrity', verdict: candidate.verdict,
      mismatch: { field: 'authorization_id', expected: actualId, actual: suppliedId ?? null },
    };
  }
  if (usedAuthorizations.has(candidate.authorization_id)) {
    return {
      rule: 'single-use', verdict: candidate.verdict,
      mismatch: { field: 'authorization.used', expected: false, actual: true },
    };
  }
  return null;
}

export function consumeAuthorization(authorization) {
  if (usedAuthorizations.has(authorization.authorization_id)) return false;
  usedAuthorizations.add(authorization.authorization_id);
  return true;
}
