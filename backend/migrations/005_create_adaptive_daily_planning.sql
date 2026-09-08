ALTER TABLE public.goals
  ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN priority SMALLINT NOT NULL DEFAULT 0 CHECK (priority BETWEEN -10 AND 10);

ALTER TABLE public.goal_plans
  ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);

ALTER TABLE public.tasks
  ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN actual_minutes INTEGER CHECK (actual_minutes BETWEEN 1 AND 1440),
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE public.daily_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  local_date DATE NOT NULL,
  time_zone TEXT NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 100),
  available_minutes INTEGER NOT NULL CHECK (available_minutes BETWEEN 0 AND 1440),
  priority_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  blocker TEXT NOT NULL DEFAULT '' CHECK (char_length(blocker) <= 500),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (owner_id, local_date, time_zone)
);

CREATE TABLE public.daily_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  local_date DATE NOT NULL,
  time_zone TEXT NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 100),
  active BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (owner_id, local_date, time_zone)
);

CREATE TABLE public.daily_plan_items (
  daily_plan_id UUID NOT NULL REFERENCES public.daily_plans(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 100),
  allocated_minutes INTEGER NOT NULL CHECK (allocated_minutes BETWEEN 1 AND 1440),
  PRIMARY KEY (daily_plan_id, task_id),
  UNIQUE (daily_plan_id, position)
);

CREATE TABLE public.daily_plan_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  local_date DATE NOT NULL,
  time_zone TEXT NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'accepted', 'rejected', 'stale')),
  context_revision INTEGER NOT NULL CHECK (context_revision > 0),
  base_daily_plan_version INTEGER NOT NULL CHECK (base_daily_plan_version >= 0),
  task_revisions JSONB NOT NULL CHECK (jsonb_typeof(task_revisions) = 'object'),
  plan_versions JSONB NOT NULL CHECK (jsonb_typeof(plan_versions) = 'object'),
  proposal JSONB NOT NULL CHECK (jsonb_typeof(proposal) = 'object'),
  explanation JSONB CHECK (explanation IS NULL OR jsonb_typeof(explanation) = 'object'),
  request_key TEXT NOT NULL CHECK (char_length(request_key) BETWEEN 1 AND 200),
  request_hash TEXT NOT NULL CHECK (char_length(request_hash) = 64),
  decision_key TEXT,
  decision_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMPTZ,
  UNIQUE (owner_id, request_key),
  CHECK ((decision_key IS NULL AND decision_hash IS NULL) OR
         (decision_key IS NOT NULL AND decision_hash IS NOT NULL))
);

CREATE TABLE public.daily_plan_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  daily_plan_id UUID NOT NULL REFERENCES public.daily_plans(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL UNIQUE REFERENCES public.daily_plan_proposals(id),
  context_revision INTEGER NOT NULL,
  previous_active BOOLEAN NOT NULL,
  previous_version INTEGER NOT NULL,
  new_version INTEGER NOT NULL,
  previous_items JSONB NOT NULL CHECK (jsonb_typeof(previous_items) = 'array'),
  new_items JSONB NOT NULL CHECK (jsonb_typeof(new_items) = 'array'),
  undone_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (new_version = previous_version + 1)
);

CREATE INDEX daily_plan_proposals_lookup_idx
  ON public.daily_plan_proposals (owner_id, local_date, time_zone, status, created_at DESC);
CREATE INDEX daily_plan_items_task_idx ON public.daily_plan_items (task_id);
CREATE INDEX daily_plan_changes_plan_idx ON public.daily_plan_changes (daily_plan_id, created_at DESC);
