import type { PreferenceCategory, PreferenceKey, PreferenceValue } from './types.ts';

export const preferenceRegistry = {
  'planning.max_major_tasks': {
    category: 'PLANNING',
    description: 'Maximum number of tasks selected by adaptive planning.',
    validate(value: unknown): PreferenceValue {
      if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 10) {
        throw new Error('Maximum major tasks must be a whole number from 1–10.');
      }
      return value as number;
    },
  },
  'interaction.explanation_length': {
    category: 'INTERACTION',
    description: 'Preferred length for AI-generated explanations.',
    validate(value: unknown): PreferenceValue {
      if (value !== 'concise' && value !== 'standard') {
        throw new Error("Explanation length must be 'concise' or 'standard'.");
      }
      return value;
    },
  },
} satisfies Record<PreferenceKey, { category: PreferenceCategory; description: string; validate(value: unknown): PreferenceValue }>;

export function isPreferenceKey(value: unknown): value is PreferenceKey {
  return typeof value === 'string' && Object.hasOwn(preferenceRegistry, value);
}

export function validatePreference(key: unknown, category: unknown, value: unknown) {
  if (!isPreferenceKey(key)) throw new Error('Unsupported preference key.');
  const definition = preferenceRegistry[key];
  if (category !== definition.category) throw new Error('Preference category does not match its key.');
  return { key, category: definition.category, value: definition.validate(value) };
}

export type PreferenceContext = {
  maxMajorTasks: number | null;
  explanationLength: 'concise' | 'standard';
};
