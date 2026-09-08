import { Router } from 'express';
import { pool } from './db.ts';
import { GroqRequestError } from './ai/groqPlanService.ts';
import { parseReviewDate, validateTimeZone } from './dailyReview/date.ts';
import { DailyReviewRepository } from './dailyReview/dailyReviewRepository.ts';
import { generateDailyReviewInsight } from './dailyReview/groqDailyReviewService.ts';

const generations = new Map<string, Promise<unknown>>();

class DailyReviewDatabaseError extends Error {
  constructor() {
    super('Daily review database operation failed');
    this.name = 'DailyReviewDatabaseError';
  }
}

export function createDailyReviewRouter(
  repository = new DailyReviewRepository(pool),
  generate = generateDailyReviewInsight,
  now = () => new Date(),
) {
  const router = Router();

  function requestContext(req: { params: Record<string, string | undefined>; query: Record<string, unknown> }) {
    const timeZone = validateTimeZone(req.query.timeZone);
    const date = timeZone ? parseReviewDate(req.params.date, timeZone, now()) : null;
    return { timeZone, date };
  }

  router.get('/daily-reviews/:date', async (req, res) => {
    const { timeZone, date } = requestContext(req);
    if (!timeZone) {
      res.status(400).json({ error: 'Provide a valid IANA timeZone query parameter.' });
      return;
    }
    if (!date) {
      res.status(400).json({ error: 'Date must be a valid, non-future YYYY-MM-DD value.' });
      return;
    }

    try {
      const review = await repository.find(date.isoDate, timeZone);
      const metrics = review?.metrics ?? await repository.metricsForDate(date, timeZone);
      res.set('Cache-Control', 'no-store');
      res.status(200).json({ date: date.isoDate, timeZone, metrics, review });
    } catch {
      console.error('Daily review retrieval failed.');
      res.status(500).json({ error: 'Could not load the daily review.' });
    }
  });

  router.post('/daily-reviews/:date', async (req, res) => {
    const { timeZone, date } = requestContext(req);
    if (!timeZone) {
      res.status(400).json({ error: 'Provide a valid IANA timeZone query parameter.' });
      return;
    }
    if (!date) {
      res.status(400).json({ error: 'Date must be a valid, non-future YYYY-MM-DD value.' });
      return;
    }
    if (req.body !== undefined && (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body) || Object.keys(req.body).length > 0)) {
      res.status(400).json({ error: 'This request does not accept a body.' });
      return;
    }

    try {
      const existing = await repository.find(date.isoDate, timeZone).catch(() => {
        throw new DailyReviewDatabaseError();
      });
      if (existing) {
        res.status(200).json({ review: existing, reused: true });
        return;
      }

      const metrics = await repository.metricsForDate(date, timeZone).catch(() => {
        throw new DailyReviewDatabaseError();
      });
      if (metrics.totalTasks === 0) {
        res.status(409).json({ error: 'There are no tasks to review for this date.', code: 'no_tasks' });
        return;
      }
      if (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL) {
        res.status(503).json({ error: 'AI service is not configured.', code: 'ai_not_configured' });
        return;
      }

      const key = `${date.isoDate}|${timeZone}`;
      let generation = generations.get(key) as Promise<Awaited<ReturnType<typeof repository.save>>> | undefined;
      const created = !generation;
      if (!generation) {
        generation = (async () => {
          const insight = await generate(metrics);
          return repository.save(date.isoDate, timeZone, metrics, insight, process.env.GROQ_MODEL!).catch(() => {
            throw new DailyReviewDatabaseError();
          });
        })();
        generations.set(key, generation);
      }
      try {
        const review = await generation;
        res.status(created ? 201 : 200).json({ review, reused: !created });
      } finally {
        if (generations.get(key) === generation) generations.delete(key);
      }
    } catch (error) {
      console.error('Daily review generation failed:', error instanceof Error ? error.name : 'Unknown error');
      if (error instanceof DailyReviewDatabaseError) {
        res.status(500).json({ error: 'Could not save the daily review.' });
      } else if (error instanceof GroqRequestError && error.status === 429) {
        res.status(429).json({ error: 'AI request limit reached. Please try again shortly.', code: 'ai_rate_limited', retryAfterSeconds: error.retryAfterSeconds });
      } else if (error instanceof Error && error.name === 'TimeoutError') {
        res.status(504).json({ error: 'AI review generation timed out.', code: 'ai_timeout' });
      } else {
        res.status(502).json({ error: 'The AI service could not generate a valid review.', code: 'ai_unavailable' });
      }
    }
  });

  return router;
}

export const dailyReviewRouter = createDailyReviewRouter();
