export type CountProgress = { completed: number; total: number; percent: number };

export function countProgress(completed: number, total: number): CountProgress {
  return { completed, total, percent: total === 0 ? 0 : Math.round(completed / total * 100) };
}
export function goalProgress(tasks: { status: string }[], milestones: { status: string }[]) {
  const activity = countProgress(tasks.filter((item) => item.status === 'completed').length, tasks.length);
  const milestone = countProgress(milestones.filter((item) => item.status === 'completed').length, milestones.length);
  return { activity, milestone: milestones.length === 0 ? null : milestone, legacyPercent: milestones.length === 0 ? activity.percent : milestone.percent };
}
