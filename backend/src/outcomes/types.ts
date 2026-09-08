export const LOCAL_OWNER_ID = 'local';

export type OutcomeStatus = 'in_progress' | 'achieved';
export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed';

export type GoalOutcome = {
  id: string; goalId: string; ownerId: string; title: string; description: string;
  outcomeType: 'qualitative' | 'measurable'; targetValue: number | null;
  targetUnit: string | null; targetDate: string | null; status: OutcomeStatus;
  revision: number; createdAt: Date; updatedAt: Date;
};

export type GoalMilestone = {
  id: string; goalId: string; outcomeId: string; ownerId: string; title: string;
  description: string; sequence: number; status: MilestoneStatus;
  targetValue: number | null; targetUnit: string | null; targetDate: string | null;
  revision: number; createdAt: Date; updatedAt: Date;
};

export type OutcomeInput = {
  title: string; description: string; targetValue: number | null;
  targetUnit: string | null; targetDate: string | null;
};

export type MilestoneInput = OutcomeInput & { sequence?: number };
