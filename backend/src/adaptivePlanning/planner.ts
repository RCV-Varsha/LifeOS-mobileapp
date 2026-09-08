import type { PlanEvaluation, PlanningTask } from './types.ts';

export function evaluateDailyPlan(
  tasks: PlanningTask[],
  availableMinutes: number,
  priorityTaskId: string | null,
): PlanEvaluation {
  if (!Number.isInteger(availableMinutes) || availableMinutes < 0 || availableMinutes > 1440) {
    throw new Error('Available minutes must be an integer from 0–1440');
  }

  const eligible = tasks.filter((task) => task.status === 'pending');
  const ranked = [...eligible].sort((left, right) => {
    const leftPinned = left.id === priorityTaskId ? 1 : 0;
    const rightPinned = right.id === priorityTaskId ? 1 : 0;
    return rightPinned - leftPinned || right.goalPriority - left.goalPriority ||
      left.planOrder - right.planOrder || left.taskOrder - right.taskOrder || left.id.localeCompare(right.id);
  });
  const known = eligible.filter((task) => task.estimatedMinutes !== null);
  const requiredMinutes = known.reduce((sum, task) => sum + task.estimatedMinutes!, 0);
  const uncertainty = eligible
    .filter((task) => task.estimatedMinutes === null)
    .map((task) => ({
      code: 'unknown_duration' as const,
      taskId: task.id,
      message: `“${task.instruction}” has no reliable duration estimate.`,
    }));
  const currentPlanFits = uncertainty.length === 0 && requiredMinutes <= availableMinutes;

  if (currentPlanFits) {
    return {
      availableMinutes,
      requiredMinutes,
      selected: ranked.map((task) => ({ taskId: task.id, allocationMinutes: task.estimatedMinutes! })),
      omittedTaskIds: [],
      remainingMinutes: availableMinutes - requiredMinutes,
      conflicts: [],
      uncertainty,
      currentPlanFits: true,
    };
  }

  let remainingMinutes = availableMinutes;
  const selected: PlanEvaluation['selected'] = [];
  const omittedTaskIds: string[] = [];
  const conflicts: PlanEvaluation['conflicts'] = [];
  for (const task of ranked) {
    if (task.estimatedMinutes === null) {
      omittedTaskIds.push(task.id);
      continue;
    }
    if (task.estimatedMinutes <= remainingMinutes) {
      selected.push({ taskId: task.id, allocationMinutes: task.estimatedMinutes });
      remainingMinutes -= task.estimatedMinutes;
    } else {
      omittedTaskIds.push(task.id);
      if (task.id === priorityTaskId) {
        conflicts.push({
          code: 'priority_does_not_fit',
          taskId: task.id,
          message: `The priority task needs ${task.estimatedMinutes} minutes but only ${remainingMinutes} are available.`,
        });
      }
    }
  }
  if (requiredMinutes > availableMinutes) {
    conflicts.push({
      code: 'insufficient_capacity',
      taskId: null,
      message: `The known work needs ${requiredMinutes} minutes, exceeding capacity by ${requiredMinutes - availableMinutes}.`,
    });
  }

  return { availableMinutes, requiredMinutes, selected, omittedTaskIds, remainingMinutes, conflicts, uncertainty, currentPlanFits: false };
}

export function validateEditedSelection(
  tasks: PlanningTask[],
  availableMinutes: number,
  selected: { taskId: string; allocationMinutes: number }[],
): PlanEvaluation {
  const eligible = new Map(tasks.filter((task) => task.status === 'pending').map((task) => [task.id, task]));
  const seen = new Set<string>();
  let allocated = 0;
  for (const item of selected) {
    if (!eligible.has(item.taskId) || seen.has(item.taskId)) throw new Error('Selection contains an ineligible or duplicate task');
    if (!Number.isInteger(item.allocationMinutes) || item.allocationMinutes < 1 || item.allocationMinutes > 1440) {
      throw new Error('Allocation must be a positive whole number of minutes');
    }
    seen.add(item.taskId);
    allocated += item.allocationMinutes;
  }
  if (allocated > availableMinutes) throw new Error('Selected allocations exceed available capacity');
  const requiredMinutes = [...eligible.values()].reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0);
  const uncertainty = [...eligible.values()].filter((task) => task.estimatedMinutes === null).map((task) => ({
    code: 'unknown_duration' as const, taskId: task.id, message: `“${task.instruction}” has no reliable duration estimate.`,
  }));
  return {
    availableMinutes,
    requiredMinutes,
    selected,
    omittedTaskIds: [...eligible.keys()].filter((id) => !seen.has(id)),
    remainingMinutes: availableMinutes - allocated,
    conflicts: requiredMinutes > availableMinutes ? [{ code: 'insufficient_capacity', taskId: null, message: `The known work needs ${requiredMinutes} minutes, exceeding capacity by ${requiredMinutes - availableMinutes}.` }] : [],
    uncertainty,
    currentPlanFits: uncertainty.length === 0 && requiredMinutes <= availableMinutes,
  };
}
