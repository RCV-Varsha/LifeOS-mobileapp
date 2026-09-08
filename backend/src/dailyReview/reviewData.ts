export type ReviewTask = {
  id: string;
  goalId: string;
  goalTitle: string;
  instruction: string;
  plannedMinutes: number;
  status: 'pending' | 'completed';
};

export type DailyReviewMetrics = {
  totalTasks: number;
  completedTasks: number;
  incompleteTasks: number;
  completionRate: number;
  goals: { id: string; title: string }[];
  tasks: ReviewTask[];
};

export function calculateReviewMetrics(tasks: ReviewTask[]): DailyReviewMetrics {
  const completedTasks = tasks.filter((task) => task.status === 'completed').length;
  const goals = new Map<string, string>();
  for (const task of tasks) goals.set(task.goalId, task.goalTitle);

  return {
    totalTasks: tasks.length,
    completedTasks,
    incompleteTasks: tasks.length - completedTasks,
    completionRate:
      tasks.length === 0 ? 0 : Math.round((completedTasks / tasks.length) * 100),
    goals: [...goals].map(([id, title]) => ({ id, title })),
    tasks,
  };
}
