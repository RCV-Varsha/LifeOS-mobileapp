export type DailyReviewInsight = {
  summary: string;
  observations: string[];
  strengths: string[];
  areasToImprove: string[];
  recommendedNextAction: string;
};

function requireObject(value: unknown, expectedKeys: string[]) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an object');
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object);
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(object, key))
  ) {
    throw new Error('Unexpected or missing fields');
  }
  return object;
}

function requireText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') throw new Error('Expected text');
  const text = value.trim();
  if (text.length < 1 || text.length > maxLength) {
    throw new Error(`Text must contain 1–${maxLength} characters`);
  }
  return text;
}

function requireTextList(value: unknown, maxItems: number) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`Expected no more than ${maxItems} items`);
  }
  return value.map((item) => requireText(item, 240));
}

export function validateDailyReviewInsight(value: unknown): DailyReviewInsight {
  const insight = requireObject(value, [
    'summary',
    'observations',
    'strengths',
    'areas_to_improve',
    'recommended_next_action',
  ]);

  return {
    summary: requireText(insight.summary, 600),
    observations: requireTextList(insight.observations, 3),
    strengths: requireTextList(insight.strengths, 3),
    areasToImprove: requireTextList(insight.areas_to_improve, 3),
    recommendedNextAction: requireText(insight.recommended_next_action, 300),
  };
}

export const dailyReviewJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'observations',
    'strengths',
    'areas_to_improve',
    'recommended_next_action',
  ],
  properties: {
    summary: { type: 'string' },
    observations: { type: 'array', maxItems: 3, items: { type: 'string' } },
    strengths: { type: 'array', maxItems: 3, items: { type: 'string' } },
    areas_to_improve: { type: 'array', maxItems: 3, items: { type: 'string' } },
    recommended_next_action: { type: 'string' },
  },
} as const;
