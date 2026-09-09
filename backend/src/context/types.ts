import type { DailyReviewMetrics } from '../dailyReview/reviewData.ts';
import type { PlanningTask } from '../adaptivePlanning/types.ts';
import type { MemoryConfidence, MemorySource } from '../memories/types.ts';

export type ContextAuthorization = { userId: string; basis: 'AUTHENTICATED_CURRENT_USER' };
export type ContextValue<T> = { value: T; reason: string };
export type MemoryContextValue = ContextValue<number> & {
  provenance: MemorySource | 'SYSTEM_DEFAULT';
  confidence: MemoryConfidence | 'DEFAULT';
  revision: number | null;
  validFrom: string | null;
  validUntil: string | null;
};

export type AdaptivePlanningContext = {
  policy: 'ADAPTIVE_PLANNING_V1';
  authorization: ContextAuthorization;
  situation: { date: string; timeZone: string; availableMinutes: number; priorityTaskId: string | null };
  goals: { id: string; title: string }[];
  tasks: Pick<PlanningTask, 'id'|'goalId'|'goalTitle'|'instruction'|'estimatedMinutes'|'status'>[];
  preferences: {
    maxMajorTasks: ContextValue<number|null>;
    explanationLength: ContextValue<'concise'|'standard'>;
  };
  memories: { dailyBufferMinutes: MemoryContextValue };
};

export type DailyReviewContext = {
  policy: 'DAILY_REVIEW_V1';
  authorization: ContextAuthorization;
  situation: { date: string; timeZone: string };
  execution: Pick<DailyReviewMetrics,'totalTasks'|'completedTasks'|'incompleteTasks'|'completionRate'|'goals'|'milestoneProgress'>;
  preferences: { explanationLength: ContextValue<'concise'|'standard'> };
  memories: [];
};

export type AdaptivePlanningAiContext = Omit<AdaptivePlanningContext,'authorization'>;
export type DailyReviewAiContext = Omit<DailyReviewContext,'authorization'>;
