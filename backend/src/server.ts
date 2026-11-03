import express from 'express'
import { fileURLToPath } from 'node:url';
import { pool } from './db.ts';
import { goalPlanRouter } from './goalPlanRoutes.ts';
import { taskRouter } from './taskRoutes.ts';
import { dailyReviewRouter } from './dailyReviewRoutes.ts';
import { adaptivePlanningRouter } from './adaptivePlanningRoutes.ts';
import { outcomeRouter } from './outcomeRoutes.ts';
import { validateMilestoneInput, validateOutcomeInput } from './outcomes/validation.ts';
import { currentUser, rejectClientOwnership } from './auth.ts';
import { authentication, authRouter } from './platform/authentication.ts';
import { workspaceRouter, apiErrors } from './workspace/routes.ts';
import { extensionRouter } from './workspace/extensionRoutes.ts';
import { privacyRouter } from './platform/privacy.ts';
import { profileRouter } from './profile.ts';
import { agentRouter } from './workspace/agents.ts';
import { preferenceRouter } from './preferenceRoutes.ts';
import { memoryRouter } from './memoryRoutes.ts';
import { nowRouter } from './nowRoutes.ts';


const app=express()


const configuredPort = Number(process.env.PORT ?? 3000);
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535
  ? configuredPort
  : 3000;
app.disable('x-powered-by');
app.use((req,res,next)=>{
  const origin=req.headers.origin;
  const allowed=(process.env.WEB_ORIGINS??'http://localhost:8081,http://localhost:8082').split(',');
  if(origin&&allowed.includes(origin)) {res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');res.set('Access-Control-Allow-Headers','Content-Type,Authorization,Idempotency-Key');res.set('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');}
  res.set('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS'){res.status(204).end();return;}
  next();
});
app.use(express.json({ limit: '256kb' }));
app.get('/health',(req,res)=>{
    res.status(200).json({ status:'ok' })
})
if(process.env.SERVE_WEB==='1')app.use(express.static(fileURLToPath(new URL('../../app/dist-web/',import.meta.url))));
app.use(rejectClientOwnership);
app.use('/auth',authRouter(pool));
app.use(authentication(pool));
app.get('/me', (req, res) => {
  const user = currentUser(req);
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ user });
});
app.use(taskRouter);
app.use(dailyReviewRouter);
app.use(adaptivePlanningRouter);
app.use(outcomeRouter);
app.use(preferenceRouter);
app.use(memoryRouter);
app.use(nowRouter);
app.use(workspaceRouter(pool));
app.use(extensionRouter(pool));
app.use(privacyRouter(pool));
app.use(profileRouter(pool));
app.use(agentRouter(pool));
app.use('/goals', goalPlanRouter);
app.post('/goals', async (req, res) => {
  const ownerId = currentUser(req).id;
  const body: unknown = req.body;

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.status(400).json({ error: 'Send a JSON object.' });
    return;
  }

  const goal = 'goal' in body ? body.goal : undefined;
  const reason = 'reason' in body ? body.reason : '';
  const minutes = 'minutesPerDay' in body ? body.minutesPerDay : undefined;
  const desiredOutcome = 'desiredOutcome' in body ? body.desiredOutcome : undefined;
  const milestones = 'milestones' in body ? body.milestones : undefined;

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

  let outcomeInput: ReturnType<typeof validateOutcomeInput> | null = null;
  let milestoneInputs: ReturnType<typeof validateMilestoneInput>[] = [];
  try {
    if (desiredOutcome !== undefined && desiredOutcome !== null) outcomeInput = validateOutcomeInput(desiredOutcome);
    if (milestones !== undefined) {
      if (!Array.isArray(milestones) || milestones.length > 8) throw new Error('Milestones must contain no more than 8 items.');
      milestoneInputs = milestones.map(validateMilestoneInput);
      if (!outcomeInput && milestoneInputs.length > 0) throw new Error('An outcome is required before milestones.');
    }
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid outcome.' });
    return;
  }

let client;
try {
  client = await pool.connect();
  await client.query('BEGIN');
  const result = await client.query<{
    id: string;
    goal: string;
    reason: string;
    minutesPerDay: number;
    createdAt: Date;
  }>(
    `INSERT INTO public.goals (title, reason, minutes_per_day, owner_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title AS goal, reason,
               minutes_per_day AS "minutesPerDay",
               created_at AS "createdAt"`,
    [goal.trim(), reason.trim(), minutes, ownerId],
  );

  if (outcomeInput) {
    const outcome = await client.query<{ id: string }>(
      `INSERT INTO public.goal_outcomes(goal_id,owner_id,title,description,outcome_type,target_value,target_unit,target_date)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [result.rows[0]!.id,ownerId,outcomeInput.title,outcomeInput.description,outcomeInput.targetValue===null?'qualitative':'measurable',outcomeInput.targetValue,outcomeInput.targetUnit,outcomeInput.targetDate],
    );
    for (const [index, milestone] of milestoneInputs.entries()) {
      await client.query(
        `INSERT INTO public.goal_milestones(goal_id,outcome_id,owner_id,title,description,sequence,target_value,target_unit,target_date)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [result.rows[0]!.id,outcome.rows[0]!.id,ownerId,milestone.title,milestone.description,index+1,milestone.targetValue,milestone.targetUnit,milestone.targetDate],
      );
    }
  }

  await client.query('COMMIT');

  res.status(201).json({ goal: result.rows[0] });
}  catch {
  if (client) await client.query('ROLLBACK').catch(() => undefined);
  console.error('Goal save failed.');
  res.status(500).json({ error: 'Could not save goal.' });
} finally {
  client?.release();
}
});
app.get('/goals', async (req, res) => {
  const ownerId = currentUser(req).id;
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
       WHERE owner_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [ownerId],
    );

    res.status(200).json({ goals: result.rows });
  } catch {
    console.error('Goal list request failed.');
    res.status(500).json({ error: 'Could not load goals.' });
  }
});

app.use(apiErrors);
app.listen(port,'0.0.0.0',()=>{
    console.log(`LifeOS backend: http://127.0.0.1:${port}`);
})
