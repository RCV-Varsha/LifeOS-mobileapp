import { Router } from 'express';
import { pool } from './db.ts';

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

function validateTimeZone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > 100) {
    return null;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value;
  } catch {
    return null;
  }
}

function calendarDay(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  return {
    key: Math.floor(Date.UTC(year, month - 1, day) / 86_400_000),
    isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
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
                            t.completed_at AS "completedAt"`;

const taskFrom = `FROM public.tasks t
                  INNER JOIN public.goal_plans gp ON gp.id = t.goal_plan_id`;

taskRouter.get('/goals/:goalId/tasks', async (req, res) => {
  const goalId = req.params.goalId;

  if (typeof goalId !== 'string' || !uuidPattern.test(goalId)) {
    res.status(400).json({ error: 'Invalid goal ID.' });
    return;
  }

  try {
    const goal = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM public.goals WHERE id = $1) AS "exists"',
      [goalId],
    );

    if (!goal.rows[0]?.exists) {
      res.status(404).json({ error: 'Goal not found.' });
      return;
    }

    const result = await pool.query<StoredTask>(
      `${taskColumns}
       ${taskFrom}
       WHERE gp.goal_id = $1
         AND gp.status = 'accepted'
       ORDER BY t.day_number, t.position`,
      [goalId],
    );

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      tasks: result.rows,
      progress: progressFor(result.rows),
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
    const result = await pool.query<StoredTask & { acceptedAt: Date }>(
      `${taskColumns},
              gp.accepted_at AS "acceptedAt"
       ${taskFrom}
       WHERE gp.status = 'accepted'
         AND gp.accepted_at IS NOT NULL
       ORDER BY gp.accepted_at DESC, gp.goal_id, t.day_number, t.position`,
    );

    const today = calendarDay(new Date(), timeZone);
    const tasks = result.rows.filter((task) => {
      const acceptedDay = calendarDay(task.acceptedAt, timeZone);
      const planDay = today.key - acceptedDay.key + 1;
      return planDay === task.dayNumber;
    });

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      date: today.isoDate,
      timeZone,
      tasks: tasks.map(({ acceptedAt: _acceptedAt, ...task }) => task),
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
         END
     FROM public.goal_plans gp
     WHERE t.id = $1
       AND gp.id = t.goal_plan_id
       AND gp.status = 'accepted'
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
               t.completed_at AS "completedAt"`,
    [taskId, completed ? 'completed' : 'pending'],
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
