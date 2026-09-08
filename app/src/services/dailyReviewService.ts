import { API_URL } from '../config/api';

export type ReviewMetrics = {
  totalTasks: number;
  completedTasks: number;
  incompleteTasks: number;
  completionRate: number;
  goals: { id: string; title: string }[];
};

export type DailyReview = {
  id: string;
  reviewDate: string;
  timeZone: string;
  metrics: ReviewMetrics;
  insight: {
    summary: string;
    observations: string[];
    strengths: string[];
    areasToImprove: string[];
    recommendedNextAction: string;
  };
  createdAt: string;
};

export class DailyReviewRequestError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
    this.name = 'DailyReviewRequestError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMetrics(value: unknown): ReviewMetrics {
  if (!isObject(value) || !Array.isArray(value.goals)) throw new Error('Unexpected review metrics');
  const numbers = ['totalTasks', 'completedTasks', 'incompleteTasks', 'completionRate'] as const;
  if (numbers.some((key) => typeof value[key] !== 'number' || !Number.isInteger(value[key]) || (value[key] as number) < 0)) {
    throw new Error('Unexpected review metrics');
  }
  const goals = value.goals.map((goal) => {
    if (!isObject(goal) || typeof goal.id !== 'string' || typeof goal.title !== 'string') throw new Error('Unexpected review goal');
    return { id: goal.id, title: goal.title };
  });
  const totalTasks = value.totalTasks as number;
  const completedTasks = value.completedTasks as number;
  const incompleteTasks = value.incompleteTasks as number;
  const completionRate = value.completionRate as number;
  if (
    completionRate > 100 ||
    completedTasks + incompleteTasks !== totalTasks ||
    completionRate !== (totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100))
  ) throw new Error('Inconsistent review metrics');
  return { totalTasks, completedTasks, incompleteTasks, completionRate, goals };
}

function textList(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) throw new Error('Unexpected insight list');
  return value as string[];
}

function parseReview(value: unknown): DailyReview {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.reviewDate !== 'string' || typeof value.timeZone !== 'string' || typeof value.createdAt !== 'string' || !isObject(value.insight)) {
    throw new Error('Unexpected daily review');
  }
  const insight = value.insight;
  if (typeof insight.summary !== 'string' || typeof insight.recommendedNextAction !== 'string') throw new Error('Unexpected daily review insight');
  return {
    id: value.id,
    reviewDate: value.reviewDate,
    timeZone: value.timeZone,
    metrics: parseMetrics(value.metrics),
    insight: {
      summary: insight.summary,
      observations: textList(insight.observations),
      strengths: textList(insight.strengths),
      areasToImprove: textList(insight.areasToImprove),
      recommendedNextAction: insight.recommendedNextAction,
    },
    createdAt: value.createdAt,
  };
}

function requestUrl(date: string) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return `${API_URL}/daily-reviews/${encodeURIComponent(date)}?timeZone=${encodeURIComponent(timeZone)}`;
}

export async function getDailyReview(date: string, signal: AbortSignal) {
  const response = await fetch(requestUrl(date), { signal });
  if (!response.ok) throw new DailyReviewRequestError('Could not load the daily review.', null);
  const data: unknown = await response.json();
  if (!isObject(data)) throw new Error('Unexpected daily review response');
  return { metrics: parseMetrics(data.metrics), review: data.review === null ? null : parseReview(data.review) };
}

export async function generateDailyReview(date: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(requestUrl(date), { method: 'POST', signal: controller.signal });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = isObject(data) && typeof data.code === 'string' ? data.code : null;
      const message = isObject(data) && typeof data.error === 'string' ? data.error : 'Could not generate the daily review.';
      throw new DailyReviewRequestError(message, code);
    }
    if (!isObject(data)) throw new Error('Unexpected generation response');
    return parseReview(data.review);
  } finally {
    clearTimeout(timeout);
  }
}
