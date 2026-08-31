import express from 'express'
import { pool } from './db.ts';
const app=express()
const port=3000
app.use(express.json({ limit: '10kb' }));
app.post('/goals', async (req, res) => {
  const body: unknown = req.body;

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.status(400).json({ error: 'Send a JSON object.' });
    return;
  }

  const goal = 'goal' in body ? body.goal : undefined;
  const reason = 'reason' in body ? body.reason : '';
  const minutes = 'minutesPerDay' in body ? body.minutesPerDay : undefined;

  if (
    typeof goal !== 'string' ||
    goal.trim().length < 3 ||
    goal.trim().length > 120
  ) {
    res.status(400).json({ error: 'Goal must be 3–120 characters.' });
    return;
  }

  if (typeof reason !== 'string' || reason.trim().length > 500) {
    res.status(400).json({ error: 'Reason must be text up to 500 characters.' });
    return;
  }

  if (
    typeof minutes !== 'number' ||
    !Number.isInteger(minutes) ||
    minutes < 5 ||
    minutes > 240
  ) {
    res.status(400).json({ error: 'Minutes per day must be an integer from 5–240.' });
    return;
  }

try {
  const result = await pool.query<{
    id: string;
    goal: string;
    reason: string;
    minutesPerDay: number;
    createdAt: Date;
  }>(
    `INSERT INTO public.goals (title, reason, minutes_per_day)
     VALUES ($1, $2, $3)
     RETURNING id, title AS goal, reason,
               minutes_per_day AS "minutesPerDay",
               created_at AS "createdAt"`,
    [goal.trim(), reason.trim(), minutes],
  );

  res.status(201).json({ goal: result.rows[0] });
}  catch {
  console.error('Goal save failed.');
  res.status(500).json({ error: 'Could not save goal.' });
}
});
app.get('/health',(req,res)=>{
    res.status(200).json({
        status:'ok'
    })
})

app.get('/goals', async (_req, res) => {
  res.set('Cache-Control', 'no-store');

  try {
    const result = await pool.query<{
      id: string;
      goal: string;
      reason: string;
      minutesPerDay: number;
      createdAt: Date;
    }>(
      `SELECT id,
              title AS goal,
              reason,
              minutes_per_day AS "minutesPerDay",
              created_at AS "createdAt"
       FROM public.goals
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
    );

    res.status(200).json({ goals: result.rows });
  } catch {
    console.error('Goal list request failed.');
    res.status(500).json({ error: 'Could not load goals.' });
  }
});

app.listen(port,'0.0.0.0',()=>{
    console.log(`LifeOS backend: http://127.0.0.1:${port}`);
})