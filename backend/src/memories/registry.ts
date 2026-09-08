import type { MemoryCategory, MemoryKey } from './types.ts';

export const memoryRegistry = {
  'planning.daily_buffer_minutes': {
    category: 'CONSTRAINT',
    description: 'Minutes that Adaptive Planning must leave unallocated each day.',
    validate(value: unknown) {
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 240) {
        throw new Error('Daily buffer must be a whole number from 0–240 minutes.');
      }
      return value as number;
    },
  },
} satisfies Record<MemoryKey, { category: MemoryCategory; description: string; validate(value: unknown): number }>;

export function isMemoryKey(value: unknown): value is MemoryKey {
  return typeof value === 'string' && Object.hasOwn(memoryRegistry, value);
}

export function validateMemory(key: unknown, category: unknown, value: unknown) {
  if (!isMemoryKey(key)) throw new Error('Unsupported memory key.');
  const definition = memoryRegistry[key];
  if (category !== definition.category) throw new Error('Memory category does not match its key.');
  return { key, category: definition.category, value: definition.validate(value) };
}

export type PlanningMemoryContext = { dailyBufferMinutes: number };
