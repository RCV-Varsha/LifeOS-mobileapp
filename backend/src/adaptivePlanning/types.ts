export const LOCAL_OWNER_ID = 'local';

export type PlanningTask = {
  id: string;
  goalId: string;
  goalPlanId: string;
  goalTitle: string;
  instruction: string;
  estimatedMinutes: number | null;
  status: 'pending' | 'completed';
  goalPriority: number;
  planOrder: number;
  taskOrder: number;
  revision: number;
  planVersion: number;
};

export type PlannedItem = {
  taskId: string;
  allocationMinutes: number;
};

export type PlanConflict = {
  code: 'priority_does_not_fit' | 'insufficient_capacity';
  taskId: string | null;
  message: string;
};

export type PlanUncertainty = {
  code: 'unknown_duration';
  taskId: string;
  message: string;
};

export type PlanEvaluation = {
  availableMinutes: number;
  requiredMinutes: number;
  selected: PlannedItem[];
  omittedTaskIds: string[];
  remainingMinutes: number;
  conflicts: PlanConflict[];
  uncertainty: PlanUncertainty[];
  currentPlanFits: boolean;
};

export type AdaptiveExplanation = {
  summary: string;
  reason: string;
  evidenceTaskIds: string[];
  question: string | null;
};

export type AdaptiveProposal = PlanEvaluation & {
  id: string;
  ownerId: string;
  date: string;
  timeZone: string;
  status: 'ready' | 'accepted' | 'rejected' | 'stale';
  contextRevision: number;
  baseDailyPlanVersion: number;
  eligibleTasks: PlanningTask[];
  explanation: AdaptiveExplanation | null;
  createdAt: Date;
  decidedAt: Date | null;
};
