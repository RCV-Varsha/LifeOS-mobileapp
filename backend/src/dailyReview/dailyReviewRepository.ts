import type { Pool } from 'pg';
import { calendarDay } from './date.ts';
import { calculateReviewMetrics, type ReviewTask } from './reviewData.ts';
import { validateDailyReviewInsight, type DailyReviewInsight } from './reviewSchema.ts';

export type DailyReview = {
  id: string;
  reviewDate: string;
  timeZone: string;
  metrics: ReturnType<typeof calculateReviewMetrics>;
  insight: DailyReviewInsight;
  provider: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
};

type TaskRow = ReviewTask & { acceptedAt: Date; dayNumber: number };

export class DailyReviewRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async metricsForDate(reviewDate: { key: number }, timeZone: string) {
    const date = new Date(reviewDate.key * 86_400_000).toISOString().slice(0, 10);
    const dailyPlan = await this.pool.query<{ id: string }>(
      `SELECT id FROM public.daily_plans WHERE owner_id = 'local' AND local_date = $1 AND time_zone = $2 AND active = TRUE`,
      [date, timeZone],
    );
    if (dailyPlan.rows[0]) {
      const adaptive = await this.pool.query<ReviewTask>(
        `SELECT t.id, gp.goal_id AS "goalId", gp.goal_title AS "goalTitle", t.instruction,
                dpi.allocated_minutes AS "plannedMinutes", t.status
         FROM public.daily_plan_items dpi
         INNER JOIN public.tasks t ON t.id = dpi.task_id
         INNER JOIN public.goal_plans gp ON gp.id = t.goal_plan_id
         WHERE dpi.daily_plan_id = $1
         ORDER BY dpi.position`,
        [dailyPlan.rows[0].id],
      );
      return calculateReviewMetrics(adaptive.rows);
    }
    const result = await this.pool.query<TaskRow>(
      `SELECT t.id,
              gp.goal_id AS "goalId",
              gp.goal_title AS "goalTitle",
              t.instruction,
              t.planned_minutes AS "plannedMinutes",
              t.status,
              t.day_number AS "dayNumber",
              gp.accepted_at AS "acceptedAt"
       FROM public.tasks t
       INNER JOIN public.goal_plans gp ON gp.id = t.goal_plan_id
       WHERE gp.status = 'accepted' AND gp.accepted_at IS NOT NULL
       ORDER BY gp.accepted_at DESC, gp.goal_id, t.day_number, t.position`,
    );

    const tasks = result.rows
      .filter((task) => reviewDate.key - calendarDay(task.acceptedAt, timeZone).key + 1 === task.dayNumber)
      .map(({ acceptedAt: _acceptedAt, dayNumber: _dayNumber, ...task }) => task);
    return calculateReviewMetrics(tasks);
  }

  async find(reviewDate: string, timeZone: string): Promise<DailyReview | null> {
    const result = await this.pool.query<Omit<DailyReview, 'insight'> & { insight: unknown }>(
      `SELECT id,
              review_date::text AS "reviewDate",
              time_zone AS "timeZone",
              metrics,
              insight,
              provider,
              model,
              created_at AS "createdAt",
              updated_at AS "updatedAt"
       FROM public.daily_reviews
       WHERE review_date = $1 AND time_zone = $2`,
      [reviewDate, timeZone],
    );
    const review = result.rows[0];
    return review ? { ...review, insight: validateDailyReviewInsight(review.insight) } : null;
  }

  async save(
    reviewDate: string,
    timeZone: string,
    metrics: DailyReview['metrics'],
    insight: DailyReviewInsight,
    model: string,
  ) {
    const storedInsight = {
      summary: insight.summary,
      observations: insight.observations,
      strengths: insight.strengths,
      areas_to_improve: insight.areasToImprove,
      recommended_next_action: insight.recommendedNextAction,
    };
    await this.pool.query(
      `INSERT INTO public.daily_reviews
         (review_date, time_zone, metrics, insight, provider, model)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, 'groq', $5)
       ON CONFLICT (review_date, time_zone) DO NOTHING`,
      [reviewDate, timeZone, JSON.stringify(metrics), JSON.stringify(storedInsight), model],
    );
    const stored = await this.find(reviewDate, timeZone);
    if (!stored) throw new Error('Daily review was not persisted');
    return stored;
  }
}
