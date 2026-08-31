import { generateProposedPlan } from './groqPlanService.ts';

try {
  const plan = await generateProposedPlan({
    goal: 'Learn beginner Spanish greetings',
    reason: 'Practice a new language as a hobby',
    minutesPerDay: 20,
  });

  console.log(JSON.stringify(plan, null, 2));

  console.table(
    plan.days.map((day) => ({
      day: day.day,
      actions: day.actions.length,
      totalMinutes: day.actions.reduce(
        (total, action) => total + action.minutes,
        0,
      ),
    })),
  );
} catch (error) {
  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
      ? error.status
      : undefined;

  console.error('Plan generation failed.');
  console.error('HTTP status:', status ?? 'Not available');
  console.error(
    'Error type:',
    error instanceof Error ? error.name : 'Unknown',
  );

  process.exitCode = 1;
}