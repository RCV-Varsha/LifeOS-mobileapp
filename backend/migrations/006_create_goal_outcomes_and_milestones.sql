ALTER TABLE public.goals ADD CONSTRAINT goals_id_owner_unique UNIQUE (id, owner_id);

CREATE TABLE public.goal_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  outcome_type TEXT NOT NULL CHECK (outcome_type IN ('qualitative', 'measurable')),
  target_value NUMERIC CHECK (target_value IS NULL OR target_value >= 0),
  target_unit TEXT CHECK (target_unit IS NULL OR char_length(btrim(target_unit)) BETWEEN 1 AND 40),
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'achieved')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, goal_id, owner_id),
  FOREIGN KEY (goal_id, owner_id) REFERENCES public.goals(id, owner_id) ON DELETE CASCADE,
  CHECK ((target_value IS NULL AND target_unit IS NULL) OR
         (target_value IS NOT NULL AND target_unit IS NOT NULL)),
  CHECK ((outcome_type = 'qualitative' AND target_value IS NULL) OR
         outcome_type = 'measurable')
);

CREATE TABLE public.goal_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL,
  outcome_id UUID NOT NULL,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  sequence SMALLINT NOT NULL CHECK (sequence BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  target_value NUMERIC CHECK (target_value IS NULL OR target_value >= 0),
  target_unit TEXT CHECK (target_unit IS NULL OR char_length(btrim(target_unit)) BETWEEN 1 AND 40),
  target_date DATE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (goal_id, sequence) DEFERRABLE INITIALLY IMMEDIATE,
  UNIQUE (id, goal_id, owner_id),
  FOREIGN KEY (outcome_id, goal_id, owner_id)
    REFERENCES public.goal_outcomes(id, goal_id, owner_id) ON DELETE CASCADE,
  CHECK ((target_value IS NULL AND target_unit IS NULL) OR
         (target_value IS NOT NULL AND target_unit IS NOT NULL))
);

ALTER TABLE public.tasks ADD COLUMN milestone_id UUID REFERENCES public.goal_milestones(id) ON DELETE SET NULL;
CREATE INDEX tasks_milestone_idx ON public.tasks (milestone_id) WHERE milestone_id IS NOT NULL;

CREATE FUNCTION public.validate_task_milestone() RETURNS trigger AS $$
BEGIN
  IF NEW.milestone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.goal_milestones gm
    INNER JOIN public.goal_plans gp ON gp.goal_id = gm.goal_id
    WHERE gm.id = NEW.milestone_id
      AND gp.id = NEW.goal_plan_id
      AND gm.owner_id = NEW.owner_id
      AND gp.owner_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION 'task milestone must belong to the same goal and owner'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_validate_milestone
  BEFORE INSERT OR UPDATE OF milestone_id, goal_plan_id, owner_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_task_milestone();
