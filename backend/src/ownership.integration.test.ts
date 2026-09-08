import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg, { type PoolClient } from 'pg';

const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';

async function createSlice(client: PoolClient, ownerId: string, suffix: string) {
  const goal = (await client.query<{ id: string }>(
    `INSERT INTO public.goals(title,reason,minutes_per_day,owner_id)
     VALUES($1,'Ownership smoke test',30,$2) RETURNING id`,
    [`Smoke goal ${suffix}`, ownerId],
  )).rows[0]!;
  const outcome = (await client.query<{ id: string }>(
    `INSERT INTO public.goal_outcomes(goal_id,owner_id,title,description,outcome_type)
     VALUES($1,$2,$3,'','qualitative') RETURNING id`,
    [goal.id, ownerId, `Smoke outcome ${suffix}`],
  )).rows[0]!;
  const milestone = (await client.query<{ id: string }>(
    `INSERT INTO public.goal_milestones(goal_id,outcome_id,owner_id,title,sequence)
     VALUES($1,$2,$3,$4,1) RETURNING id`,
    [goal.id, outcome.id, ownerId, `Smoke milestone ${suffix}`],
  )).rows[0]!;
  const plan = (await client.query<{ id: string }>(
    `INSERT INTO public.goal_plans(goal_id,goal_title,goal_reason,minutes_per_day,plan,provider,model,status,accepted_at,owner_id)
     VALUES($1,$2,'',30,'{}','groq','smoke','accepted',CURRENT_TIMESTAMP,$3) RETURNING id`,
    [goal.id, `Smoke goal ${suffix}`, ownerId],
  )).rows[0]!;
  const task = (await client.query<{ id: string }>(
    `INSERT INTO public.tasks(goal_plan_id,day_number,position,instruction,planned_minutes,status,completed_at,owner_id,milestone_id)
     VALUES($1,1,1,$2,30,'completed',CURRENT_TIMESTAMP,$3,$4) RETURNING id`,
    [plan.id, `Smoke task ${suffix}`, ownerId, milestone.id],
  )).rows[0]!;
  await client.query(
    `INSERT INTO public.daily_contexts(owner_id,local_date,time_zone,available_minutes,priority_task_id)
     VALUES($1,'2026-09-08','UTC',30,$2)`,
    [ownerId, task.id],
  );
  await client.query(
    `INSERT INTO public.daily_reviews(owner_id,review_date,time_zone,metrics,insight,provider,model)
     VALUES($1,'2026-09-08','UTC','{}','{}','groq','smoke')`,
    [ownerId],
  );
  const dailyPlan = (await client.query<{ id: string }>(
    `INSERT INTO public.daily_plans(owner_id,local_date,time_zone,active)
     VALUES($1,'2026-09-08','UTC',TRUE) RETURNING id`,
    [ownerId],
  )).rows[0]!;
  await client.query(
    `INSERT INTO public.daily_plan_items(daily_plan_id,task_id,position,allocated_minutes,owner_id)
     VALUES($1,$2,1,30,$3)`,
    [dailyPlan.id, task.id, ownerId],
  );
  const proposal = (await client.query<{ id: string }>(
    `INSERT INTO public.daily_plan_proposals(owner_id,local_date,time_zone,context_revision,base_daily_plan_version,
       task_revisions,plan_versions,proposal,request_key,request_hash)
     VALUES($1,'2026-09-08','UTC',1,0,'{}','{}','{}',$2,repeat('a',64)) RETURNING id`,
    [ownerId, `smoke-${suffix}`],
  )).rows[0]!;
  return { goal, outcome, milestone, plan, task, dailyPlan, proposal };
}

test('live database enforces two-user isolation and cross-user relationship integrity', async () => {
  const pool = new pg.Pool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO public.users(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET status='ACTIVE'`, [userA]);
    await client.query(`INSERT INTO public.users(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET status='ACTIVE'`, [userB]);
    const a = await createSlice(client, userA, 'A');
    const b = await createSlice(client, userB, 'B');

    for (const table of ['goals', 'goal_outcomes', 'goal_milestones', 'goal_plans', 'tasks', 'daily_contexts', 'daily_reviews', 'daily_plans', 'daily_plan_proposals']) {
      const own = await client.query(`SELECT count(*)::int AS count FROM public.${table} WHERE owner_id=$1`, [userA]);
      assert.ok(own.rows[0].count > 0, `${table} should contain User A data`);
    }
    assert.equal((await client.query('SELECT count(*)::int AS count FROM public.goals WHERE id=$1 AND owner_id=$2', [b.goal.id, userA])).rows[0].count, 0);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM public.tasks WHERE id=$1 AND owner_id=$2', [b.task.id, userA])).rows[0].count, 0);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM public.goal_outcomes WHERE id=$1 AND owner_id=$2', [b.outcome.id, userA])).rows[0].count, 0);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM public.goal_milestones WHERE id=$1 AND owner_id=$2', [b.milestone.id, userA])).rows[0].count, 0);
    assert.equal((await client.query(`SELECT count(*)::int AS count FROM public.daily_contexts WHERE owner_id=$1 AND local_date='2026-09-08' AND time_zone='UTC'`, [userA])).rows[0].count, 1);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM public.daily_reviews WHERE owner_id=$1 AND id IN (SELECT id FROM public.daily_reviews WHERE owner_id=$2)', [userA, userB])).rows[0].count, 0);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM public.daily_plan_proposals WHERE id=$1 AND owner_id=$2', [b.proposal.id, userA])).rows[0].count, 0);
    assert.equal((await client.query('UPDATE public.goals SET priority=1 WHERE id=$1 AND owner_id=$2', [b.goal.id, userA])).rowCount, 0);
    assert.equal((await client.query(`UPDATE public.tasks SET status='pending',completed_at=NULL WHERE id=$1 AND owner_id=$2`, [b.task.id, userA])).rowCount, 0);
    assert.equal((await client.query('UPDATE public.goal_outcomes SET description=$1 WHERE id=$2 AND owner_id=$3', ['foreign write', b.outcome.id, userA])).rowCount, 0);
    assert.equal((await client.query(`UPDATE public.daily_contexts SET note='foreign write' WHERE owner_id=$1 AND priority_task_id=$2`, [userA, b.task.id])).rowCount, 0);

    await client.query('SAVEPOINT cross_milestone');
    await assert.rejects(client.query('UPDATE public.tasks SET milestone_id=$1 WHERE id=$2 AND owner_id=$3', [b.milestone.id, a.task.id, userA]));
    await client.query('ROLLBACK TO SAVEPOINT cross_milestone');
    await client.query('SAVEPOINT cross_plan');
    await assert.rejects(client.query('UPDATE public.goal_plans SET goal_id=$1 WHERE id=$2 AND owner_id=$3', [b.goal.id, a.plan.id, userA]));
    await client.query('ROLLBACK TO SAVEPOINT cross_plan');
    await client.query('SAVEPOINT cross_daily_item');
    await assert.rejects(client.query(
      'INSERT INTO public.daily_plan_items(daily_plan_id,task_id,position,allocated_minutes,owner_id) VALUES($1,$2,2,10,$3)',
      [a.dailyPlan.id, b.task.id, userA],
    ));
    await client.query('ROLLBACK TO SAVEPOINT cross_daily_item');
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
    await pool.end();
  }
});
