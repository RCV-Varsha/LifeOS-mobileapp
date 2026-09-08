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

  async metricsForDate(ownerId: string, reviewDate: { key: number }, timeZone: string) {
    const date = new Date(reviewDate.key * 86_400_000).toISOString().slice(0, 10);
    const dailyPlan = await this.pool.query<{ id: string }>(
      `SELECT id FROM public.daily_plans WHERE owner_id = $1 AND local_date = $2 AND time_zone = $3 AND active = TRUE`,
      [ownerId, date, timeZone],
    );
    if (dailyPlan.rows[0]) {
      const adaptive = await this.pool.query<ReviewTask>(
        `SELECT t.id, gp.goal_id AS "goalId", gp.goal_title AS "goalTitle", t.instruction,
                dpi.allocated_minutes AS "plannedMinutes", t.status
         FROM public.daily_plan_items dpi
         INNER JOIN public.tasks t ON t.id = dpi.task_id
         INNER JOIN public.goal_plans gp ON gp.id = t.goal_plan_id
         WHERE dpi.daily_plan_id = $1 AND dpi.owner_id = $2 AND t.owner_id = $2 AND gp.owner_id = $2
         ORDER BY dpi.position`,
        [dailyPlan.rows[0].id, ownerId],
      );
      return this.withMilestones(ownerId, calculateReviewMetrics(adaptive.rows));
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
         AND t.owner_id = $1 AND gp.owner_id = $1
       ORDER BY gp.accepted_at DESC, gp.goal_id, t.day_number, t.position`,
      [ownerId],
    );

    const tasks = result.rows
      .filter((task) => reviewDate.key - calendarDay(task.acceptedAt, timeZone).key + 1 === task.dayNumber)
      .map(({ acceptedAt: _acceptedAt, dayNumber: _dayNumber, ...task }) => task);
    return this.withMilestones(ownerId, calculateReviewMetrics(tasks));
  }

  private async withMilestones(ownerId: string, metrics: ReturnType<typeof calculateReviewMetrics>) {
    if (metrics.goals.length === 0) return metrics;
    const result = await this.pool.query<{ goalId:string;goalTitle:string;outcomeTitle:string|null;completed:number;total:number }>(
      `SELECT g.id AS "goalId",g.title AS "goalTitle",o.title AS "outcomeTitle",
       count(m.id) FILTER(WHERE m.status='completed')::int AS completed,count(m.id)::int AS total
       FROM public.goals g LEFT JOIN public.goal_outcomes o ON o.goal_id=g.id AND o.owner_id=g.owner_id
       LEFT JOIN public.goal_milestones m ON m.goal_id=g.id AND m.owner_id=g.owner_id
       WHERE g.owner_id=$1 AND g.id=ANY($2::uuid[]) GROUP BY g.id,g.title,o.title ORDER BY g.title`,
      [ownerId, metrics.goals.map((goal)=>goal.id)],
    );
    return {...metrics,milestoneProgress:result.rows.filter((row)=>row.total>0).map((row)=>({...row,percent:Math.round(row.completed/row.total*100)}))};
  }

  async find(ownerId: string, reviewDate: string, timeZone: string): Promise<DailyReview | null> {
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
       WHERE owner_id = $1 AND review_date = $2 AND time_zone = $3`,
      [ownerId, reviewDate, timeZone],
    );
    const review = result.rows[0];
    return review ? { ...review, insight: validateDailyReviewInsight(review.insight) } : null;
  }

  async save(
    ownerId: string,
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
         (owner_id, review_date, time_zone, metrics, insight, provider, model)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, 'groq', $6)
       ON CONFLICT (owner_id, review_date, time_zone) DO NOTHING`,
      [ownerId, reviewDate, timeZone, JSON.stringify(metrics), JSON.stringify(storedInsight), model],
    );
    const stored = await this.find(ownerId, reviewDate, timeZone);
    if (!stored) throw new Error('Daily review was not persisted');
    return stored;
  }
}
