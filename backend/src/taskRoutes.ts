import { Router } from 'express';
import { pool } from './db.ts';
import { calendarDay, validateTimeZone } from './dailyReview/date.ts';
import { goalProgress } from './outcomes/progress.ts';
import { LOCAL_OWNER_ID } from './outcomes/types.ts';

export const taskRouter = Router();

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TaskStatus = 'pending' | 'completed';

type StoredTask = {
  id: string;
  goalId: string;
  goalPlanId: string;
  goalTitle: string;
  dayNumber: number;
  position: number;
  instruction: string;
  plannedMinutes: number;
  status: TaskStatus;
  createdAt: Date;
  completedAt: Date | null;
  milestoneId: string | null;
  milestoneTitle: string | null;
  outcomeTitle: string | null;
};

function progressFor(tasks: StoredTask[]) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === 'completed').length;

  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

function hasUnexpectedBody(body: unknown): boolean {
  if (body === undefined) return false;

  return (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length > 0
  );
}

const taskColumns = `SELECT t.id,
                            gp.goal_id AS "goalId",
                            t.goal_plan_id AS "goalPlanId",
                            gp.goal_title AS "goalTitle",
                            t.day_number AS "dayNumber",
                            t.position,
                            t.instruction,
                            t.planned_minutes AS "plannedMinutes",
                            t.status,
                            t.created_at AS "createdAt",
                            t.completed_at AS "completedAt",
                            gm.id AS "milestoneId",
                            gm.title AS "milestoneTitle",
                            go2.title AS "outcomeTitle"`;

const taskFrom = `FROM public.tasks t
                  INNER JOIN public.goal_plans gp ON gp.id = t.goal_plan_id
                  LEFT JOIN public.goal_milestones gm ON gm.id = t.milestone_id
                  LEFT JOIN public.goal_outcomes go2 ON go2.goal_id = gp.goal_id`;

taskRouter.get('/goals/:goalId/tasks', async (req, res) => {
  const goalId = req.params.goalId;

  if (typeof goalId !== 'string' || !uuidPattern.test(goalId)) {
    res.status(400).json({ error: 'Invalid goal ID.' });
    return;
  }

  try {
    const goal = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM public.goals WHERE id = $1 AND owner_id = $2) AS "exists"',
      [goalId, LOCAL_OWNER_ID],
    );

    if (!goal.rows[0]?.exists) {
      res.status(404).json({ error: 'Goal not found.' });
      return;
    }

    const result = await pool.query<StoredTask>(
      `${taskColumns}
       ${taskFrom}
       WHERE gp.goal_id = $1
         AND t.owner_id = $2 AND gp.owner_id = $2
         AND gp.status = 'accepted'
       ORDER BY t.day_number, t.position`,
      [goalId, LOCAL_OWNER_ID],
    );
    const milestones = await pool.query<{ status: string }>('SELECT status FROM public.goal_milestones WHERE goal_id=$1 AND owner_id=$2', [goalId, LOCAL_OWNER_ID]);

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      tasks: result.rows,
      progress: goalProgress(result.rows, milestones.rows),
    });
  } catch {
    console.error('Goal task list request failed.');
    res.status(500).json({ error: 'Could not load goal tasks.' });
  }
});

taskRouter.get('/tasks/today', async (req, res) => {
  const timeZone = validateTimeZone(req.query.timeZone);

  if (!timeZone) {
    res.status(400).json({
      error: 'Provide a valid IANA timeZone query parameter.',
    });
    return;
  }

  try {
    const today = calendarDay(new Date(), timeZone);
    const dailyPlan = await pool.query<{ id: string }>(
      `SELECT id FROM public.daily_plans WHERE owner_id=$3 AND local_date=$1 AND time_zone=$2 AND active=TRUE`,
      [today.isoDate,timeZone,LOCAL_OWNER_ID],
    );
    const adaptive = await pool.query<StoredTask & { allocatedMinutes: number }>(
      `SELECT t.id,gp.goal_id AS "goalId",t.goal_plan_id AS "goalPlanId",gp.goal_title AS "goalTitle",
       t.day_number AS "dayNumber",dpi.position,t.instruction,t.planned_minutes AS "plannedMinutes",
       dpi.allocated_minutes AS "allocatedMinutes",t.status,t.created_at AS "createdAt",t.completed_at AS "completedAt",
       gm.id AS "milestoneId",gm.title AS "milestoneTitle",go2.title AS "outcomeTitle"
       FROM public.daily_plans dp INNER JOIN public.daily_plan_items dpi ON dpi.daily_plan_id=dp.id
       INNER JOIN public.tasks t ON t.id=dpi.task_id INNER JOIN public.goal_plans gp ON gp.id=t.goal_plan_id
       LEFT JOIN public.goal_milestones gm ON gm.id=t.milestone_id LEFT JOIN public.goal_outcomes go2 ON go2.goal_id=gp.goal_id
       WHERE dp.owner_id=$3 AND t.owner_id=$3 AND gp.owner_id=$3 AND dp.local_date=$1 AND dp.time_zone=$2 ORDER BY dpi.position`,[today.isoDate,timeZone,LOCAL_OWNER_ID]);
    const result = dailyPlan.rows.length>0?null:await pool.query<StoredTask & { acceptedAt: Date; allocatedMinutes:null }>(
      `${taskColumns},
              gp.accepted_at AS "acceptedAt"
       ${taskFrom}
       WHERE gp.status = 'accepted'
         AND t.owner_id = $1 AND gp.owner_id = $1
         AND gp.accepted_at IS NOT NULL
       ORDER BY gp.accepted_at DESC, gp.goal_id, t.day_number, t.position`,
      [LOCAL_OWNER_ID],
    );

    const tasks = dailyPlan.rows.length>0?adaptive.rows:result!.rows.filter((task) => {
      const acceptedDay = calendarDay(task.acceptedAt, timeZone);
      const planDay = today.key - acceptedDay.key + 1;
      return planDay === task.dayNumber;
    });

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      date: today.isoDate,
      timeZone,
      tasks: tasks.map((task) => {
        const { acceptedAt: _acceptedAt, ...rest } = task as typeof task & {acceptedAt?:Date};
        return rest;
      }),
      progress: progressFor(tasks),
    });
  } catch {
    console.error('Today task list request failed.');
    res.status(500).json({ error: "Could not load today's tasks." });
  }
});

async function setTaskCompletion(
  taskId: string,
  completed: boolean,
): Promise<StoredTask | null> {
  const result = await pool.query<StoredTask>(
    `UPDATE public.tasks t
     SET status = $2,
         completed_at = CASE
           WHEN $2 = 'completed' THEN COALESCE(t.completed_at, CURRENT_TIMESTAMP)
           ELSE NULL
         END,
         revision = CASE WHEN t.status = $2 THEN t.revision ELSE t.revision + 1 END,
         updated_at = CASE WHEN t.status = $2 THEN t.updated_at ELSE CURRENT_TIMESTAMP END
     FROM public.goal_plans gp
     WHERE t.id = $1
       AND gp.id = t.goal_plan_id
       AND gp.status = 'accepted'
       AND t.owner_id = $3 AND gp.owner_id = $3
     RETURNING t.id,
               gp.goal_id AS "goalId",
               t.goal_plan_id AS "goalPlanId",
               gp.goal_title AS "goalTitle",
               t.day_number AS "dayNumber",
               t.position,
               t.instruction,
               t.planned_minutes AS "plannedMinutes",
               t.status,
               t.created_at AS "createdAt",
               t.completed_at AS "completedAt",
               t.milestone_id AS "milestoneId",
               (SELECT title FROM public.goal_milestones WHERE id=t.milestone_id) AS "milestoneTitle",
               (SELECT title FROM public.goal_outcomes WHERE goal_id=gp.goal_id AND owner_id=$3) AS "outcomeTitle"`,
    [taskId, completed ? 'completed' : 'pending', LOCAL_OWNER_ID],
  );

  return result.rows[0] ?? null;
}

taskRouter.post('/tasks/:taskId/complete', async (req, res) => {
  const taskId = req.params.taskId;

  if (typeof taskId !== 'string' || !uuidPattern.test(taskId)) {
    res.status(400).json({ error: 'Invalid task ID.' });
    return;
  }

  if (hasUnexpectedBody(req.body)) {
    res.status(400).json({ error: 'This request does not accept a body.' });
    return;
  }

  try {
    const task = await setTaskCompletion(taskId, true);

    if (!task) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }

    res.status(200).json({ task });
  } catch {
    console.error('Task completion failed.');
    res.status(500).json({ error: 'Could not complete the task.' });
  }
});

taskRouter.post('/tasks/:taskId/uncomplete', async (req, res) => {
  const taskId = req.params.taskId;

  if (typeof taskId !== 'string' || !uuidPattern.test(taskId)) {
    res.status(400).json({ error: 'Invalid task ID.' });
    return;
  }

  if (hasUnexpectedBody(req.body)) {
    res.status(400).json({ error: 'This request does not accept a body.' });
    return;
  }

  try {
    const task = await setTaskCompletion(taskId, false);

    if (!task) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }

    res.status(200).json({ task });
  } catch {
    console.error('Task reversal failed.');
    res.status(500).json({ error: 'Could not return the task to pending.' });
  }
});
