import { Router } from 'express';
import type { PoolClient } from 'pg';
import { pool } from './db.ts';
import {
  generateProposedPlan,
  GroqRequestError,
} from './ai/groqPlanService.ts';
import {
  validateProposedPlan,
  type ProposedPlan,
} from './ai/planSchema.ts';
import { LOCAL_OWNER_ID } from './outcomes/types.ts';

export const goalPlanRouter = Router();

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SavedGoalPlan = {
  id: string;
  goalId: string;
  goalTitle: string;
  goalReason: string;
  minutesPerDay: number;
  plan: ProposedPlan;
  provider: string;
  model: string;
  status: 'proposed' | 'accepted';
  generatedAt: Date;
  acceptedAt: Date | null;
};

const planGenerations = new Map<string, Promise<SavedGoalPlan>>();

goalPlanRouter.post('/:goalId/plan', async (req, res) => {
  const goalId = req.params.goalId;

  if (typeof goalId !== 'string' || !uuidPattern.test(goalId)) {
    res.status(400).json({ error: 'Invalid goal ID.' });
    return;
  }

  try {
    const goalResult = await pool.query<{
      id: string;
      goal: string;
      reason: string;
      minutesPerDay: number;
    }>(
      `SELECT id,
              title AS goal,
              reason,
              minutes_per_day AS "minutesPerDay"
       FROM public.goals
       WHERE id = $1 AND owner_id = $2`,
      [goalId, LOCAL_OWNER_ID],
    );

    const goal = goalResult.rows[0];

    if (!goal) {
      res.status(404).json({ error: 'Goal not found.' });
      return;
    }

    const existingPlan = await pool.query<{
      id: string;
      goalId: string;
      goalTitle: string;
      goalReason: string;
      minutesPerDay: number;
      plan: unknown;
      provider: string;
      model: string;
      status: 'proposed' | 'accepted';
      generatedAt: Date;
      acceptedAt: Date | null;
    }>(
      `SELECT id,
              goal_id AS "goalId",
              goal_title AS "goalTitle",
              goal_reason AS "goalReason",
              minutes_per_day AS "minutesPerDay",
              plan,
              provider,
              model,
              status,
              generated_at AS "generatedAt",
              accepted_at AS "acceptedAt"
       FROM public.goal_plans
       WHERE goal_id = $1 AND owner_id = $2`,
      [goalId, LOCAL_OWNER_ID],
    );

    const storedPlan = existingPlan.rows[0];

    if (storedPlan) {
      const validatedPlan = validateProposedPlan(
        storedPlan.plan,
        storedPlan.minutesPerDay,
      );

      res.set('Cache-Control', 'no-store');
      res.status(200).json({
        goalPlan: {
          ...storedPlan,
          plan: validatedPlan,
        },
      });
      return;
    }

    const model = process.env.GROQ_MODEL;

    if (!process.env.GROQ_API_KEY || !model) {
      console.error('Groq configuration is missing.');
      res.status(503).json({
        error: 'AI service is not configured.',
        code: 'ai_not_configured',
      });
      return;
    }

    let generation = planGenerations.get(goalId);
    const startedGeneration = generation === undefined;

    if (!generation) {
      generation = (async () => {
        const plan = await generateProposedPlan({
          goal: goal.goal,
          reason: goal.reason,
          minutesPerDay: goal.minutesPerDay,
        });

        const savedResult = await pool.query<SavedGoalPlan>(
          `INSERT INTO public.goal_plans (
             goal_id,
             goal_title,
             goal_reason,
             minutes_per_day,
             plan,
             provider,
             model,
             owner_id
           )
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
           RETURNING id,
                     goal_id AS "goalId",
                     goal_title AS "goalTitle",
                     goal_reason AS "goalReason",
                     minutes_per_day AS "minutesPerDay",
                     plan,
                     provider,
                     model,
                     status,
                     generated_at AS "generatedAt",
                     accepted_at AS "acceptedAt"`,
          [
            goal.id,
            goal.goal,
            goal.reason,
            goal.minutesPerDay,
            JSON.stringify(plan),
            'groq',
            model,
            LOCAL_OWNER_ID,
          ],
        );

        return savedResult.rows[0];
      })();

      planGenerations.set(goalId, generation);
    }

    try {
      const savedPlan = await generation;
      res.status(startedGeneration ? 201 : 200).json({ goalPlan: savedPlan });
    } finally {
      if (planGenerations.get(goalId) === generation) {
        planGenerations.delete(goalId);
      }
    }
  } catch (error) {
    console.error(
      'Goal plan generation failed:',
      error instanceof Error ? error.name : 'Unknown error',
    );

    if (error instanceof GroqRequestError && error.status === 429) {
      res.status(429).json({
        error: 'AI request limit reached. Please try again shortly.',
        code: 'ai_rate_limited',
        retryAfterSeconds: error.retryAfterSeconds,
      });
      return;
    }

    if (error instanceof Error && error.name === 'TimeoutError') {
      res.status(504).json({
        error: 'AI plan generation timed out. Please try again.',
        code: 'ai_timeout',
      });
      return;
    }

    res.status(502).json({
      error: 'The AI service could not generate a valid plan.',
      code: 'ai_unavailable',
    });
  }
});

goalPlanRouter.get('/:goalId/plan', async (req, res) => {
  const goalId = req.params.goalId;

  if (typeof goalId !== 'string' || !uuidPattern.test(goalId)) {
    res.status(400).json({ error: 'Invalid goal ID.' });
    return;
  }

  try {
    const result = await pool.query<{
      id: string;
      goalId: string;
      goalTitle: string;
      goalReason: string;
      minutesPerDay: number;
      plan: unknown;
      provider: string;
      model: string;
      status: 'proposed' | 'accepted';
      generatedAt: Date;
      acceptedAt: Date | null;
    }>(
      `SELECT id,
              goal_id AS "goalId",
              goal_title AS "goalTitle",
              goal_reason AS "goalReason",
              minutes_per_day AS "minutesPerDay",
              plan,
              provider,
              model,
              status,
              generated_at AS "generatedAt",
              accepted_at AS "acceptedAt"
       FROM public.goal_plans
       WHERE goal_id = $1 AND owner_id = $2`,
      [goalId, LOCAL_OWNER_ID],
    );

    const storedPlan = result.rows[0];

    if (!storedPlan) {
      res.status(404).json({
        error: 'This goal does not have a plan.',
      });
      return;
    }

    const validatedPlan = validateProposedPlan(
      storedPlan.plan,
      storedPlan.minutesPerDay,
    );

    const goalPlan: Omit<typeof storedPlan, 'plan'> & {
      plan: ProposedPlan;
    } = {
      ...storedPlan,
      plan: validatedPlan,
    };

    res.set('Cache-Control', 'no-store');
    res.status(200).json({ goalPlan });
  } catch {
    console.error('Stored goal plan could not be loaded.');

    res.status(500).json({
      error: 'Could not load the goal plan.',
    });
  }
});

goalPlanRouter.post('/:goalId/plan/accept', async (req, res) => {
  const goalId = req.params.goalId;

  if (typeof goalId !== 'string' || !uuidPattern.test(goalId)) {
    res.status(400).json({ error: 'Invalid goal ID.' });
    return;
  }

  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const planResult = await client.query<{
      id: string;
      goalId: string;
      minutesPerDay: number;
      plan: unknown;
    }>(
      `SELECT gp.id,
              gp.goal_id AS "goalId",
              gp.minutes_per_day AS "minutesPerDay",
              gp.plan
       FROM public.goal_plans gp
       INNER JOIN public.goals g ON g.id = gp.goal_id
       WHERE gp.goal_id = $1 AND gp.owner_id = $2 AND g.owner_id = $2
       FOR UPDATE OF gp`,
      [goalId, LOCAL_OWNER_ID],
    );

    const storedPlan = planResult.rows[0];

    if (!storedPlan) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'This goal does not have a plan.' });
      return;
    }

    const validatedPlan = validateProposedPlan(
      storedPlan.plan,
      storedPlan.minutesPerDay,
    );

    const acceptedResult = await client.query<{
      id: string;
      goalId: string;
      status: 'accepted';
      acceptedAt: Date;
    }>(
      `UPDATE public.goal_plans
       SET status = 'accepted',
           accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP)
       WHERE id = $1
       RETURNING id,
                 goal_id AS "goalId",
                 status,
                 accepted_at AS "acceptedAt"`,
      [storedPlan.id],
    );

    const tasks = validatedPlan.days.flatMap((day) =>
      day.actions.map((action, index) => ({
        dayNumber: day.day,
        position: index + 1,
        instruction: action.instruction,
        plannedMinutes: action.minutes,
      })),
    );

    for (const task of tasks) {
      await client.query(
        `INSERT INTO public.tasks (
           goal_plan_id,
           day_number,
           position,
           instruction,
           planned_minutes,
           owner_id
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (goal_plan_id, day_number, position) DO NOTHING`,
        [
          storedPlan.id,
          task.dayNumber,
          task.position,
          task.instruction,
          task.plannedMinutes,
          LOCAL_OWNER_ID,
        ],
      );
    }

    const storedTasks = await client.query<{
      dayNumber: number;
      position: number;
      instruction: string;
      plannedMinutes: number;
    }>(
      `SELECT day_number AS "dayNumber",
              position,
              instruction,
              planned_minutes AS "plannedMinutes"
       FROM public.tasks
       WHERE goal_plan_id = $1
       ORDER BY day_number, position`,
      [storedPlan.id],
    );

    const tasksMatch =
      storedTasks.rows.length === tasks.length &&
      storedTasks.rows.every((task, index) => {
        const expected = tasks[index];
        return (
          expected !== undefined &&
          task.dayNumber === expected.dayNumber &&
          task.position === expected.position &&
          task.instruction === expected.instruction &&
          task.plannedMinutes === expected.plannedMinutes
        );
      });

    if (!tasksMatch) {
      throw new Error('Stored tasks do not match the accepted plan');
    }

    await client.query('COMMIT');

    res.status(200).json({
      goalPlan: acceptedResult.rows[0],
      taskCount: tasks.length,
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        console.error('Goal plan acceptance rollback failed.');
      }
    }

    console.error('Goal plan acceptance failed.');
    res.status(500).json({ error: 'Could not accept the goal plan.' });
  } finally {
    client?.release();
  }
});
