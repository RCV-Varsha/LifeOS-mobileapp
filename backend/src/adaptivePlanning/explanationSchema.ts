import type { AdaptiveExplanation } from './types.ts';

function objectWithKeys(value: unknown, keys: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected an object');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length || keys.some((key) => !Object.hasOwn(object, key))) throw new Error('Unexpected or missing fields');
  return object;
}

function text(value: unknown, max: number) {
  if (typeof value !== 'string') throw new Error('Expected text');
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > max) throw new Error('Invalid text length');
  return normalized;
}

export function validateAdaptiveExplanation(value: unknown, authorizedTaskIds: Set<string>): AdaptiveExplanation {
  const result = objectWithKeys(value, ['summary', 'reason', 'evidence_task_ids', 'question']);
  if (!Array.isArray(result.evidence_task_ids) || result.evidence_task_ids.length > 20) throw new Error('Invalid evidence');
  const evidenceTaskIds = result.evidence_task_ids.map((id) => {
    if (typeof id !== 'string' || !authorizedTaskIds.has(id)) throw new Error('Unsupported evidence');
    return id;
  });
  return {
    summary: text(result.summary, 300),
    reason: text(result.reason, 600),
    evidenceTaskIds,
    question: result.question === null ? null : text(result.question, 300),
  };
}

export const adaptiveExplanationJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'reason', 'evidence_task_ids', 'question'],
  properties: {
    summary: { type: 'string' }, reason: { type: 'string' },
    evidence_task_ids: { type: 'array', maxItems: 20, items: { type: 'string' } },
    question: { type: ['string', 'null'] },
  },
} as const;
