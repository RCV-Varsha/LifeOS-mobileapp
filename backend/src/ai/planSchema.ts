export type ProposedPlan = {
  summary: string;
  days: {
    day: number;
    title: string;
    actions: {
      instruction: string;
      minutes: number;
    }[];
  }[];
};

function requireObject(
  value: unknown,
  expectedKeys: string[],
): Record<string, unknown> {
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

function requireText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new Error('Expected text');
  }

  const text = value.trim();

  if (text.length === 0 || text.length > maxLength) {
    throw new Error(`Text must contain 1–${maxLength} characters`);
  }

  return text;
}
export function validateProposedPlan(
  value: unknown,
  dailyMinutes: number,
): ProposedPlan {
  if (
    !Number.isInteger(dailyMinutes) ||
    dailyMinutes < 5 ||
    dailyMinutes > 240
  ) {
    throw new Error('Invalid daily time budget');
  }

  const plan = requireObject(value, ['summary', 'days']);
  const summary = requireText(plan.summary, 600);

  if (!Array.isArray(plan.days) || plan.days.length !== 7) {
    throw new Error('A plan must contain exactly seven days');
  }

  const days = plan.days.map((value: unknown, index: number) => {
    const day = requireObject(value, ['day', 'title', 'actions']);

    if (day.day !== index + 1) {
      throw new Error('Days must be numbered 1–7 in order');
    }

    const title = requireText(day.title, 120);

    if (
      !Array.isArray(day.actions) ||
      day.actions.length < 1 ||
      day.actions.length > 3
    ) {
      throw new Error('Each day must contain 1–3 actions');
    }

    const actions = day.actions.map((value: unknown) => {
      const action = requireObject(value, ['instruction', 'minutes']);
      const instruction = requireText(action.instruction, 500);
      const minutes = action.minutes;

      if (
        typeof minutes !== 'number' ||
        !Number.isInteger(minutes) ||
        minutes <= 0 ||
        minutes > dailyMinutes
      ) {
        throw new Error('Invalid action duration');
      }

      return { instruction, minutes };
    });

    const totalMinutes = actions.reduce(
      (total, action) => total + action.minutes,
      0,
    );

    if (totalMinutes > dailyMinutes) {
      throw new Error('Daily actions exceed the available time');
    }

    return { day: index + 1, title, actions };
  });

  return { summary, days };
}