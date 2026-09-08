import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import express from 'express';
import { calculateReviewMetrics, type DailyReviewMetrics, type ReviewTask } from './reviewData.ts';
import { parseReviewDate } from './date.ts';
import { validateDailyReviewInsight } from './reviewSchema.ts';
import { generateDailyReviewInsight } from './groqDailyReviewService.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function task(status: 'pending' | 'completed', id = crypto.randomUUID()): ReviewTask {
  return { id, goalId: 'goal-1', goalTitle: 'Read', instruction: 'Read ten pages', plannedMinutes: 20, status };
}

test('metrics handle zero tasks', () => assert.deepEqual(calculateReviewMetrics([]), { totalTasks: 0, completedTasks: 0, incompleteTasks: 0, completionRate: 0, goals: [], tasks: [] }));
test('metrics handle all completed tasks', () => assert.equal(calculateReviewMetrics([task('completed'), task('completed')]).completionRate, 100));
test('metrics handle partially completed tasks', () => {
  const result = calculateReviewMetrics([task('completed'), task('pending')]);
  assert.deepEqual({ ...result, tasks: [] }, { totalTasks: 2, completedTasks: 1, incompleteTasks: 1, completionRate: 50, goals: [{ id: 'goal-1', title: 'Read' }], tasks: [] });
});
test('metrics handle no completed tasks', () => assert.equal(calculateReviewMetrics([task('pending'), task('pending')]).completionRate, 0));
test('date validation rejects invalid dates', () => assert.equal(parseReviewDate('2026-02-30', 'UTC', new Date('2026-09-08T00:00:00Z')), null));
test('date validation rejects future dates', () => assert.equal(parseReviewDate('2026-09-09', 'UTC', new Date('2026-09-08T12:00:00Z')), null));

const rawInsight = { summary: 'A focused day.', observations: ['You finished one task.'], strengths: ['Follow-through'], areas_to_improve: ['Finish the remaining task.'], recommended_next_action: 'Start with the remaining task tomorrow.' };
test('valid AI insight is normalized', () => assert.equal(validateDailyReviewInsight(rawInsight).areasToImprove[0], 'Finish the remaining task.'));
test('malformed AI insight and invented statistic fields are rejected', () => assert.throws(() => validateDailyReviewInsight({ ...rawInsight, completion_rate: 100 })));

test('Groq service returns only a validated insight', async () => {
  process.env.GROQ_API_KEY = 'test'; process.env.GROQ_MODEL = 'test-model';
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(rawInsight) } }] }), { status: 200 });
  const result = await generateDailyReviewInsight(calculateReviewMetrics([task('completed')]));
  assert.equal(result.recommendedNextAction, rawInsight.recommended_next_action);
});

type Review = { id: string; reviewDate: string; timeZone: string; metrics: DailyReviewMetrics; insight: ReturnType<typeof validateDailyReviewInsight>; provider: string; model: string; createdAt: Date; updatedAt: Date };
const metrics = calculateReviewMetrics([task('completed')]);
function review(): Review { return { id: 'review-1', reviewDate: '2026-09-08', timeZone: 'UTC', metrics, insight: validateDailyReviewInsight(rawInsight), provider: 'groq', model: 'test-model', createdAt: new Date(), updatedAt: new Date() }; }

async function apiRequest(repository: object, generate: (input: DailyReviewMetrics) => Promise<ReturnType<typeof validateDailyReviewInsight>>, method = 'GET', date = '2026-09-08') {
  process.env.PGHOST = 'localhost'; process.env.PGPORT = '5432'; process.env.PGDATABASE = 'test'; process.env.PGUSER = 'test'; process.env.PGPASSWORD = 'test'; process.env.GROQ_API_KEY = 'test'; process.env.GROQ_MODEL = 'test-model';
  const { createDailyReviewRouter } = await import('../dailyReviewRoutes.ts');
  const app = express(); app.use(express.json()); app.use(createDailyReviewRouter(repository as never, generate, () => new Date('2026-09-08T12:00:00Z')));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test address');
  try { return await fetch(`http://127.0.0.1:${address.port}/daily-reviews/${date}?timeZone=UTC`, { method }); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('API retrieves an existing review without AI', async () => {
  let generated = false;
  const response = await apiRequest({ find: async () => review(), metricsForDate: async () => metrics }, async () => { generated = true; return validateDailyReviewInsight(rawInsight); });
  assert.equal(response.status, 200); assert.equal(generated, false); assert.equal((await response.json()).review.id, 'review-1');
});

test('API persists a generated review', async () => {
  let saved = false;
  const repository = { find: async () => null, metricsForDate: async () => metrics, save: async () => { saved = true; return review(); } };
  const response = await apiRequest(repository, async () => validateDailyReviewInsight(rawInsight), 'POST');
  assert.equal(response.status, 201); assert.equal(saved, true);
});

test('API reports AI failure without persistence', async () => {
  let saved = false;
  const repository = { find: async () => null, metricsForDate: async () => metrics, save: async () => { saved = true; return review(); } };
  const response = await apiRequest(repository, async () => { throw new Error('bad AI'); }, 'POST');
  assert.equal(response.status, 502); assert.equal(saved, false);
});

test('API reports database failure', async () => {
  const response = await apiRequest({ find: async () => { throw new Error('database down'); } }, async () => validateDailyReviewInsight(rawInsight));
  assert.equal(response.status, 500);
});

test('API reports review persistence failure as a database error', async () => {
  const repository = { find: async () => null, metricsForDate: async () => metrics, save: async () => { throw new Error('write failed'); } };
  const response = await apiRequest(repository, async () => validateDailyReviewInsight(rawInsight), 'POST');
  assert.equal(response.status, 500);
});
