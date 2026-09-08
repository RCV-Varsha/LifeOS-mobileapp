import type { MilestoneInput, OutcomeInput } from './types.ts';

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${field} must be ${min}–${max} characters.`);
  }
  return normalized;
}

function optionalDate(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Target date must be YYYY-MM-DD.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) throw new Error('Target date is invalid.');
  return value;
}

function baseInput(value: unknown, allowed: string[]): OutcomeInput {
  if (!isObject(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Unexpected fields.');
  const title = text(value.title, 'Title', 3, 200);
  const description = value.description === undefined ? '' : text(value.description, 'Description', 0, 1000);
  const targetValue = value.targetValue === undefined || value.targetValue === null ? null : value.targetValue;
  if (targetValue !== null && (typeof targetValue !== 'number' || !Number.isFinite(targetValue) || targetValue < 0 || targetValue > 1_000_000_000)) throw new Error('Target value must be a non-negative number.');
  const targetUnit = value.targetUnit === undefined || value.targetUnit === null || value.targetUnit === '' ? null : text(value.targetUnit, 'Target unit', 1, 40);
  if ((targetValue === null) !== (targetUnit === null)) throw new Error('Target value and unit must be provided together.');
  return { title, description, targetValue, targetUnit, targetDate: optionalDate(value.targetDate) };
}

export function validateOutcomeInput(value: unknown): OutcomeInput {
  return baseInput(value, ['title', 'description', 'targetValue', 'targetUnit', 'targetDate']);
}

export function validateMilestoneInput(value: unknown): MilestoneInput {
  const input = baseInput(value, ['title', 'description', 'targetValue', 'targetUnit', 'targetDate', 'sequence']);
  const sequence = isObject(value) ? value.sequence : undefined;
  if (sequence !== undefined && (!Number.isInteger(sequence) || (sequence as number) < 1 || (sequence as number) > 100)) throw new Error('Sequence must be an integer from 1–100.');
  return { ...input, sequence: sequence as number | undefined };
}

export function validateExpectedRevision(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error('expectedRevision must be a positive integer.');
  return value as number;
}

export function parseRevisionedInput(value: unknown, milestone = false) {
  if (!isObject(value)) throw new Error('Send a JSON object.');
  const { expectedRevision, ...input } = value;
  return { expectedRevision: validateExpectedRevision(expectedRevision), input: milestone ? validateMilestoneInput(input) : validateOutcomeInput(input) };
}
