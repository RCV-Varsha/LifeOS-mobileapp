CREATE TABLE public.users (
  id TEXT PRIMARY KEY CHECK (id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.users (id)
VALUES ('00000000-0000-4000-8000-000000000001');

-- Preserve every row created by the former server-controlled `local` owner.
UPDATE public.goals SET owner_id = '00000000-0000-4000-8000-000000000001' WHERE owner_id = 'local';
UPDATE public.goal_plans SET owner_id = '00000000-0000-4000-8000-000000000001' WHERE owner_id = 'local';
UPDATE public.tasks SET owner_id = '00000000-0000-4000-8000-000000000001' WHERE owner_id = 'local';
UPDATE public.daily_contexts SET owner_id = '00000000-0000-4000-8000-000000000001' WHERE owner_id = 'local';
UPDATE public.daily_plans SET owner_id = '00000000-0000-4000-8000-000000000001' WHERE owner_id = 'local';
UPDATE public.daily_plan_proposals SET owner_id = '00000000-0000-4000-8000-000000000001' WHERE owner_id = 'local';
UPDATE public.daily_plan_changes SET owner_id = '00000000-0000-4000-8000-000000000001' WHERE owner_id = 'local';
UPDATE public.goal_outcomes SET owner_id = '00000000-0000-4000-8000-000000000001' WHERE owner_id = 'local';
UPDATE public.goal_milestones SET owner_id = '00000000-0000-4000-8000-000000000001' WHERE owner_id = 'local';

ALTER TABLE public.daily_reviews
  ADD COLUMN owner_id TEXT NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE public.daily_reviews DROP CONSTRAINT daily_reviews_review_date_time_zone_key;
ALTER TABLE public.daily_reviews ADD CONSTRAINT daily_reviews_owner_date_zone_unique UNIQUE (owner_id, review_date, time_zone);

ALTER TABLE public.daily_plan_items ADD COLUMN owner_id TEXT;
UPDATE public.daily_plan_items dpi SET owner_id = dp.owner_id FROM public.daily_plans dp WHERE dp.id = dpi.daily_plan_id;
ALTER TABLE public.daily_plan_items ALTER COLUMN owner_id SET NOT NULL;

ALTER TABLE public.goals ALTER COLUMN owner_id DROP DEFAULT;
ALTER TABLE public.goal_plans ALTER COLUMN owner_id DROP DEFAULT;
ALTER TABLE public.tasks ALTER COLUMN owner_id DROP DEFAULT;

ALTER TABLE public.goal_plans ADD CONSTRAINT goal_plans_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE public.goal_milestones ADD CONSTRAINT goal_milestones_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE public.daily_plans ADD CONSTRAINT daily_plans_id_owner_unique UNIQUE (id, owner_id);
ALTER TABLE public.daily_plan_proposals ADD CONSTRAINT daily_plan_proposals_id_owner_unique UNIQUE (id, owner_id);

ALTER TABLE public.goal_plans DROP CONSTRAINT goal_plans_goal_id_fkey;
ALTER TABLE public.goal_plans ADD CONSTRAINT goal_plans_goal_owner_fkey FOREIGN KEY (goal_id, owner_id) REFERENCES public.goals(id, owner_id) ON DELETE CASCADE;
ALTER TABLE public.tasks DROP CONSTRAINT tasks_goal_plan_id_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_plan_owner_fkey FOREIGN KEY (goal_plan_id, owner_id) REFERENCES public.goal_plans(id, owner_id) ON DELETE CASCADE;
ALTER TABLE public.tasks DROP CONSTRAINT tasks_milestone_id_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_milestone_owner_fkey FOREIGN KEY (milestone_id, owner_id) REFERENCES public.goal_milestones(id, owner_id) ON DELETE SET NULL (milestone_id);

ALTER TABLE public.daily_contexts DROP CONSTRAINT daily_contexts_priority_task_id_fkey;
ALTER TABLE public.daily_contexts ADD CONSTRAINT daily_contexts_priority_task_owner_fkey FOREIGN KEY (priority_task_id, owner_id) REFERENCES public.tasks(id, owner_id) ON DELETE SET NULL (priority_task_id);

ALTER TABLE public.daily_plan_items DROP CONSTRAINT daily_plan_items_daily_plan_id_fkey;
ALTER TABLE public.daily_plan_items DROP CONSTRAINT daily_plan_items_task_id_fkey;
ALTER TABLE public.daily_plan_items ADD CONSTRAINT daily_plan_items_plan_owner_fkey FOREIGN KEY (daily_plan_id, owner_id) REFERENCES public.daily_plans(id, owner_id) ON DELETE CASCADE;
ALTER TABLE public.daily_plan_items ADD CONSTRAINT daily_plan_items_task_owner_fkey FOREIGN KEY (task_id, owner_id) REFERENCES public.tasks(id, owner_id) ON DELETE RESTRICT;

ALTER TABLE public.daily_plan_changes DROP CONSTRAINT daily_plan_changes_daily_plan_id_fkey;
ALTER TABLE public.daily_plan_changes DROP CONSTRAINT daily_plan_changes_proposal_id_fkey;
ALTER TABLE public.daily_plan_changes ADD CONSTRAINT daily_plan_changes_plan_owner_fkey FOREIGN KEY (daily_plan_id, owner_id) REFERENCES public.daily_plans(id, owner_id) ON DELETE CASCADE;
ALTER TABLE public.daily_plan_changes ADD CONSTRAINT daily_plan_changes_proposal_owner_fkey FOREIGN KEY (proposal_id, owner_id) REFERENCES public.daily_plan_proposals(id, owner_id);

ALTER TABLE public.goals ADD CONSTRAINT goals_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.goal_plans ADD CONSTRAINT goal_plans_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.daily_contexts ADD CONSTRAINT daily_contexts_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.daily_plans ADD CONSTRAINT daily_plans_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.daily_plan_items ADD CONSTRAINT daily_plan_items_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.daily_plan_proposals ADD CONSTRAINT daily_plan_proposals_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.daily_plan_changes ADD CONSTRAINT daily_plan_changes_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.daily_reviews ADD CONSTRAINT daily_reviews_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.goal_outcomes ADD CONSTRAINT goal_outcomes_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.goal_milestones ADD CONSTRAINT goal_milestones_owner_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;
