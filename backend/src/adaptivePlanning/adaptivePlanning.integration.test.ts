import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { AdaptivePlanningRepository, requestHash } from './adaptivePlanningRepository.ts';
import { evaluateDailyPlan } from './planner.ts';
import { parseReviewDate } from '../dailyReview/date.ts';

test('adaptive acceptance after completed work succeeds, undoes, and rejects later task changes', async () => {
  const pool = new pg.Pool(); const client = await pool.connect();
  // Keep every fixture and repository transaction inside one rollback-only transaction.
  const query = (sql: string, values?: unknown[]) => client.query(sql, values);
  const repositoryPool = {
    query,
    connect: async () => ({ release() {}, query: (sql: string, values?: unknown[]) => query(
      sql === 'BEGIN' ? 'SAVEPOINT repository_write' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT repository_write'
        : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT repository_write' : sql, values),
    }),
  } as unknown as pg.Pool;
  try {
    await query('BEGIN');
    const owner = randomUUID();
    await query('INSERT INTO public.users(id) VALUES($1)', [owner]);
    const goal = (await query("INSERT INTO public.goals(owner_id,title,reason,minutes_per_day) VALUES($1,'QA sketching','Regression fixture',20) RETURNING id", [owner])).rows[0].id;
    const plan = (await query("INSERT INTO public.goal_plans(owner_id,goal_id,goal_title,minutes_per_day,plan,provider,model,status,accepted_at) VALUES($1,$2,'QA sketching',20,'{}','groq','fixture','accepted',now()) RETURNING id", [owner, goal])).rows[0].id;
    for (let position = 1; position <= 3; position++) {
      await query(`INSERT INTO public.tasks(owner_id,goal_plan_id,day_number,position,instruction,planned_minutes,status,completed_at)
        VALUES($1,$2,1,$3::smallint,$4,5,$5,CASE WHEN $3::smallint=1 THEN now() ELSE NULL END)`,
      [owner, plan, position, `QA task ${position}`, position === 1 ? 'completed' : 'pending']);
    }
    const date = new Date().toISOString().slice(0, 10);
    const parsed = parseReviewDate(date, 'UTC')!;
    const repo = new AdaptivePlanningRepository(repositoryPool);
    const context = await repo.putContext(owner, date, 'UTC', { availableMinutes: 5, priorityTaskId: null, blocker: '', note: '' });
    const tasks = await repo.tasksForDate(owner, parsed, 'UTC');
    assert.equal(tasks.length, 3);
    const evaluation = evaluateDailyPlan(tasks, 5, null);
    const proposal = await repo.createProposal(owner, date, 'UTC', context, tasks, evaluation, null, randomUUID(), requestHash('fixture'));
    const accepted = await repo.acceptProposal(owner, proposal.proposal.id, randomUUID(), requestHash({ action: 'accept' }));
    assert.equal(accepted?.proposal.status, 'accepted');
    assert.equal((await query('SELECT * FROM public.daily_plan_items WHERE owner_id=$1', [owner])).rowCount, 1);
    await repo.undoChange(owner, accepted!.change.id);
    assert.equal((await query('SELECT * FROM public.daily_plan_items WHERE owner_id=$1', [owner])).rowCount, 0);
    const next = await repo.createProposal(owner, date, 'UTC', context, tasks, evaluation, null, randomUUID(), requestHash('fixture-next'));
    await query("UPDATE public.tasks SET status='completed',completed_at=now() WHERE id=$1", [evaluation.selected[0]!.taskId]);
    await assert.rejects(repo.acceptProposal(owner, next.proposal.id, randomUUID(), requestHash('accept')), /stale/);
  } finally {
    await query('ROLLBACK'); client.release(); await pool.end();
  }
});
