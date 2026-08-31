export const planJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'days'],
  properties: {
    summary: { type: 'string' },
    days: {
      type: 'array',
      minItems: 7,
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['day', 'title', 'actions'],
        properties: {
          day: { type: 'integer', minimum: 1, maximum: 7 },
          title: { type: 'string' },
          actions: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['instruction', 'minutes'],
              properties: {
                instruction: { type: 'string' },
                minutes: { type: 'integer', minimum: 1 },
              },
            },
          },
        },
      },
    },
  },
};