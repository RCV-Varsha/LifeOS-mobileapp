import { validatePreference } from './registry.ts';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: unknown, keys: string[]) {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error('Unexpected or missing preference fields.');
  }
  return value;
}

export function parseCreatePreference(value: unknown) {
  const body = exact(value, ['key', 'category', 'value']);
  return validatePreference(body.key, body.category, body.value);
}

export function parsePreferenceChange(value: unknown) {
  const body = exact(value, ['value', 'expectedRevision']);
  if (!Number.isInteger(body.expectedRevision) || (body.expectedRevision as number) < 1) throw new Error('Expected revision must be a positive integer.');
  return { value: body.value, expectedRevision: body.expectedRevision as number };
}

export function parseCorrection(value: unknown) {
  if (!object(value) || Object.keys(value).some((key) => !['value', 'expectedRevision', 'note'].includes(key)) ||
      !Object.hasOwn(value, 'value') || !Object.hasOwn(value, 'expectedRevision')) throw new Error('Invalid correction fields.');
  if (!Number.isInteger(value.expectedRevision) || (value.expectedRevision as number) < 1) throw new Error('Expected revision must be a positive integer.');
  if (!(value.note === undefined || (typeof value.note === 'string' && value.note.trim().length >= 1 && value.note.trim().length <= 500))) {
    throw new Error('Correction note must contain 1–500 characters.');
  }
  return { value: value.value, expectedRevision: value.expectedRevision as number, note: typeof value.note === 'string' ? value.note.trim() : null };
}

export function parseExpectedRevision(value: unknown) {
  const body = exact(value, ['expectedRevision']);
  if (!Number.isInteger(body.expectedRevision) || (body.expectedRevision as number) < 1) throw new Error('Expected revision must be a positive integer.');
  return body.expectedRevision as number;
}

export function parseSuggestionRequest(value: unknown) {
  const body = exact(value, ['statement']);
  if (typeof body.statement !== 'string' || body.statement.trim().length < 3 || body.statement.trim().length > 500) {
    throw new Error('Statement must contain 3–500 characters.');
  }
  return body.statement.trim();
}

export function parseSuggestionApproval(value: unknown) {
  const body = exact(value, ['suggestion']);
  if (!object(body.suggestion)) throw new Error('Invalid preference suggestion.');
  return parseCreatePreference(body.suggestion);
}
