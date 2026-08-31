const API_URL = 'http://192.168.2.103:3000';

type GoalInput = {
  goal: string;
  reason: string;
  minutesPerDay: number;
};

export async function saveGoal(input: GoalInput): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${API_URL}/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (response.status !== 201) {
      throw new Error(`Save request returned HTTP ${response.status}`);
    }

    const data: unknown = await response.json();

    if (
      typeof data !== 'object' ||
      data === null ||
      !('goal' in data) ||
      typeof data.goal !== 'object' ||
      data.goal === null ||
      !('id' in data.goal) ||
      typeof data.goal.id !== 'string' ||
      data.goal.id.length === 0
    ) {
      throw new Error('Missing saved goal ID');
    }

    return data.goal.id;
  } finally {
    clearTimeout(timeout);
  }
}
export type GoalSummary = {
  id: string;
  goal: string;
  minutesPerDay: number;
};

export async function getGoals(signal: AbortSignal): Promise<GoalSummary[]> {
  const response = await fetch(`${API_URL}/goals`, { signal });

  if (!response.ok) {
    throw new Error(`Load request returned HTTP ${response.status}`);
  }

  const data: unknown = await response.json();

  if (
    typeof data !== 'object' ||
    data === null ||
    !('goals' in data) ||
    !Array.isArray(data.goals)
  ) {
    throw new Error('Unexpected goals response');
  }

  return data.goals.map((item: unknown) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('id' in item) ||
      typeof item.id !== 'string' ||
      !('goal' in item) ||
      typeof item.goal !== 'string' ||
      !('minutesPerDay' in item) ||
      typeof item.minutesPerDay !== 'number' ||
      !Number.isInteger(item.minutesPerDay) ||
      item.minutesPerDay < 5 ||
      item.minutesPerDay > 240
    ) {
      throw new Error('Unexpected goal fields');
    }

    return {
      id: item.id,
      goal: item.goal,
      minutesPerDay: item.minutesPerDay,
    };
  });
}