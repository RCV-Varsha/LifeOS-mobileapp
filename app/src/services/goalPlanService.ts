import { API_URL } from '../config/api';

export type PlanAction = {
  instruction: string;
  minutes: number;
};

export type PlanDay = {
  day: number;
  title: string;
  actions: PlanAction[];
};

export type GoalPlan = {
  id: string;
  goalId: string;
  goalTitle: string;
  goalReason: string;
  minutesPerDay: number;
  plan: {
    summary: string;
    days: PlanDay[];
  };
  provider: string;
  model: string;
  status: 'proposed' | 'accepted';
  generatedAt: string;
  acceptedAt: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class GoalPlanRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    status: number | null,
    code: string | null = null,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'GoalPlanRequestError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function requestError(response: Response): Promise<GoalPlanRequestError> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const message =
    isObject(body) && typeof body.error === 'string'
      ? body.error
      : `Request returned HTTP ${response.status}`;
  const code = isObject(body) && typeof body.code === 'string' ? body.code : null;
  const retryAfterSeconds =
    isObject(body) && typeof body.retryAfterSeconds === 'number'
      ? body.retryAfterSeconds
      : null;

  return new GoalPlanRequestError(
    message,
    response.status,
    code,
    retryAfterSeconds,
  );
}

function parseGoalPlan(value: unknown): GoalPlan {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.goalId !== 'string' ||
    typeof value.goalTitle !== 'string' ||
    typeof value.goalReason !== 'string' ||
    typeof value.minutesPerDay !== 'number' ||
    typeof value.provider !== 'string' ||
    typeof value.model !== 'string' ||
    (value.status !== 'proposed' && value.status !== 'accepted') ||
    typeof value.generatedAt !== 'string' ||
    (value.acceptedAt !== null && typeof value.acceptedAt !== 'string') ||
    !isObject(value.plan) ||
    typeof value.plan.summary !== 'string' ||
    !Array.isArray(value.plan.days) ||
    value.plan.days.length !== 7
  ) {
    throw new Error('Unexpected goal plan fields');
  }
  const minutesPerDay = value.minutesPerDay;

  const days = value.plan.days.map((dayValue, index): PlanDay => {
    if (
      !isObject(dayValue) ||
      dayValue.day !== index + 1 ||
      typeof dayValue.title !== 'string' ||
      !Array.isArray(dayValue.actions) ||
      dayValue.actions.length < 1 ||
      dayValue.actions.length > 3
    ) {
      throw new Error('Unexpected plan day');
    }

    const actions = dayValue.actions.map((actionValue): PlanAction => {
      if (
        !isObject(actionValue) ||
        typeof actionValue.instruction !== 'string' ||
        typeof actionValue.minutes !== 'number' ||
        !Number.isInteger(actionValue.minutes) ||
        actionValue.minutes <= 0
      ) {
        throw new Error('Unexpected plan action');
      }

      return {
        instruction: actionValue.instruction,
        minutes: actionValue.minutes,
      };
    });

    const totalMinutes = actions.reduce(
      (total, action) => total + action.minutes,
      0,
    );

    if (totalMinutes > minutesPerDay) {
      throw new Error('Plan exceeds its daily time budget');
    }

    return {
      day: dayValue.day,
      title: dayValue.title,
      actions,
    };
  });

  return {
    id: value.id,
    goalId: value.goalId,
    goalTitle: value.goalTitle,
    goalReason: value.goalReason,
    minutesPerDay: value.minutesPerDay,
    plan: {
      summary: value.plan.summary,
      days,
    },
    provider: value.provider,
    model: value.model,
    status: value.status,
    generatedAt: value.generatedAt,
    acceptedAt: value.acceptedAt,
  };
}

export async function getGoalPlan(
  goalId: string,
  signal: AbortSignal,
): Promise<GoalPlan | null> {
  const response = await fetch(
    `${API_URL}/goals/${encodeURIComponent(goalId)}/plan`,
    { signal },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await requestError(response);
  }

  const data: unknown = await response.json();

  if (!isObject(data) || !('goalPlan' in data)) {
    throw new Error('Unexpected plan response');
  }

  return parseGoalPlan(data.goalPlan);
}

export async function generateGoalPlan(goalId: string): Promise<GoalPlan> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 70000);
  let response: Response;

  try {
    response = await fetch(
      `${API_URL}/goals/${encodeURIComponent(goalId)}/plan`,
      { method: 'POST', signal: controller.signal },
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GoalPlanRequestError(
        'Plan generation took too long. Please try again.',
        null,
        'client_timeout',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw await requestError(response);
  }

  const data: unknown = await response.json();
  if (!isObject(data) || !('goalPlan' in data)) {
    throw new Error('Unexpected plan response');
  }

  return parseGoalPlan(data.goalPlan);
}

export async function acceptGoalPlan(
  goalId: string,
): Promise<{ status: 'accepted'; acceptedAt: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response: Response;

  try {
    response = await fetch(
      `${API_URL}/goals/${encodeURIComponent(goalId)}/plan/accept`,
      { method: 'POST', signal: controller.signal },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw await requestError(response);
  }

  const data: unknown = await response.json();
  if (
    !isObject(data) ||
    !isObject(data.goalPlan) ||
    data.goalPlan.status !== 'accepted' ||
    typeof data.goalPlan.acceptedAt !== 'string'
  ) {
    throw new Error('Unexpected acceptance response');
  }

  return {
    status: 'accepted',
    acceptedAt: data.goalPlan.acceptedAt,
  };
}
