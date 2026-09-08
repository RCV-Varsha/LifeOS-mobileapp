import { API_URL } from '../config/api';

export type TaskStatus = 'pending' | 'completed';

export type LifeTask = {
  id: string;
  goalId: string;
  goalPlanId: string;
  goalTitle: string;
  dayNumber: number;
  position: number;
  instruction: string;
  plannedMinutes: number;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
};

export type TaskProgress = {
  completed: number;
  total: number;
  percent: number;
};

export type TodayTasks = {
  date: string;
  timeZone: string;
  tasks: LifeTask[];
  progress: TaskProgress;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTask(value: unknown): LifeTask {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.goalId !== 'string' ||
    typeof value.goalPlanId !== 'string' ||
    typeof value.goalTitle !== 'string' ||
    typeof value.dayNumber !== 'number' ||
    !Number.isInteger(value.dayNumber) ||
    value.dayNumber < 1 ||
    value.dayNumber > 7 ||
    typeof value.position !== 'number' ||
    !Number.isInteger(value.position) ||
    value.position < 1 ||
    value.position > 3 ||
    typeof value.instruction !== 'string' ||
    typeof value.plannedMinutes !== 'number' ||
    !Number.isInteger(value.plannedMinutes) ||
    value.plannedMinutes < 1 ||
    value.plannedMinutes > 240 ||
    (value.status !== 'pending' && value.status !== 'completed') ||
    typeof value.createdAt !== 'string' ||
    (value.completedAt !== null && typeof value.completedAt !== 'string') ||
    (value.status === 'pending' && value.completedAt !== null) ||
    (value.status === 'completed' && typeof value.completedAt !== 'string')
  ) {
    throw new Error('Unexpected task response');
  }

  return value as LifeTask;
}

function parseProgress(value: unknown): TaskProgress {
  if (
    !isObject(value) ||
    typeof value.completed !== 'number' ||
    !Number.isInteger(value.completed) ||
    typeof value.total !== 'number' ||
    !Number.isInteger(value.total) ||
    typeof value.percent !== 'number' ||
    !Number.isInteger(value.percent) ||
    value.completed < 0 ||
    value.total < value.completed ||
    value.percent < 0 ||
    value.percent > 100
  ) {
    throw new Error('Unexpected progress response');
  }

  return {
    completed: value.completed,
    total: value.total,
    percent: value.percent,
  };
}

export async function getTodayTasks(signal: AbortSignal): Promise<TodayTasks> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const response = await fetch(
    `${API_URL}/tasks/today?timeZone=${encodeURIComponent(timeZone)}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`Today request returned HTTP ${response.status}`);
  }

  const data: unknown = await response.json();

  if (
    !isObject(data) ||
    typeof data.date !== 'string' ||
    typeof data.timeZone !== 'string' ||
    !Array.isArray(data.tasks)
  ) {
    throw new Error('Unexpected today response');
  }

  return {
    date: data.date,
    timeZone: data.timeZone,
    tasks: data.tasks.map(parseTask),
    progress: parseProgress(data.progress),
  };
}

async function changeTaskStatus(
  taskId: string,
  action: 'complete' | 'uncomplete',
): Promise<LifeTask> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(
      `${API_URL}/tasks/${encodeURIComponent(taskId)}/${action}`,
      { method: 'POST', signal: controller.signal },
    );

    if (!response.ok) {
      throw new Error(`Task update returned HTTP ${response.status}`);
    }

    const data: unknown = await response.json();
    if (!isObject(data) || !('task' in data)) {
      throw new Error('Unexpected task update response');
    }

    return parseTask(data.task);
  } finally {
    clearTimeout(timeout);
  }
}

export function completeTask(taskId: string): Promise<LifeTask> {
  return changeTaskStatus(taskId, 'complete');
}

export function uncompleteTask(taskId: string): Promise<LifeTask> {
  return changeTaskStatus(taskId, 'uncomplete');
}
