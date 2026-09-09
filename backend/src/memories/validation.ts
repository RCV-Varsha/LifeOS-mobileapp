import { validateMemory } from './registry.ts';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: unknown, keys: string[]) {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error('Unexpected or missing memory fields.');
  }
  return value;
}

function date(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
  return value;
}

function validity(value: Record<string, unknown>) {
  const validFrom = value.validFrom === undefined ? undefined : date(value.validFrom, 'Valid from');
  const validUntil = value.validUntil === undefined || value.validUntil === null ? value.validUntil : date(value.validUntil, 'Valid until');
  if (validFrom && validUntil && validUntil < validFrom) throw new Error('Valid until cannot be before valid from.');
  return { validFrom, validUntil };
}

export function parseCreateMemory(value: unknown) {
  if (!object(value) || Object.keys(value).some((key) => !['key', 'category', 'value', 'validFrom', 'validUntil'].includes(key)) ||
      !Object.hasOwn(value, 'key') || !Object.hasOwn(value, 'category') || !Object.hasOwn(value, 'value')) throw new Error('Unexpected or missing memory fields.');
  return { ...validateMemory(value.key, value.category, value.value), ...validity(value) };
}

export function parseMemoryChange(value: unknown) {
  if (!object(value) || Object.keys(value).some((key) => !['value', 'expectedRevision', 'validFrom', 'validUntil'].includes(key)) ||
      !Object.hasOwn(value, 'value') || !Object.hasOwn(value, 'expectedRevision')) throw new Error('Unexpected or missing memory fields.');
  if (!Number.isInteger(value.expectedRevision) || (value.expectedRevision as number) < 1) throw new Error('Expected revision must be a positive integer.');
  return { value: value.value, expectedRevision: value.expectedRevision as number, ...validity(value) };
}

export function parseMemoryCorrection(value: unknown) {
  if (!object(value) || Object.keys(value).some((key) => !['value', 'expectedRevision', 'note', 'validFrom', 'validUntil'].includes(key)) ||
      !Object.hasOwn(value, 'value') || !Object.hasOwn(value, 'expectedRevision')) throw new Error('Invalid correction fields.');
  if (!Number.isInteger(value.expectedRevision) || (value.expectedRevision as number) < 1) throw new Error('Expected revision must be a positive integer.');
  if (!(value.note === undefined || (typeof value.note === 'string' && value.note.trim().length >= 1 && value.note.trim().length <= 500))) throw new Error('Correction note must contain 1–500 characters.');
  return { value: value.value, expectedRevision: value.expectedRevision as number, note: typeof value.note === 'string' ? value.note.trim() : null, ...validity(value) };
}

export function parseMemoryRevision(value: unknown) {
  const body = exact(value, ['expectedRevision']);
  if (!Number.isInteger(body.expectedRevision) || (body.expectedRevision as number) < 1) throw new Error('Expected revision must be a positive integer.');
  return body.expectedRevision as number;
}

export function parseMemorySuggestionRequest(value: unknown) {
  const body = exact(value, ['statement']);
  if (typeof body.statement !== 'string' || body.statement.trim().length < 3 || body.statement.trim().length > 500) throw new Error('Statement must contain 3–500 characters.');
  return body.statement.trim();
}

export function parseMemorySuggestionApproval(value: unknown) {
  const body = exact(value, ['suggestion']);
  if (!object(body.suggestion)) throw new Error('Invalid memory suggestion.');
  return parseCreateMemory(body.suggestion);
}
