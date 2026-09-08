CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  goal_plan_id UUID NOT NULL
    REFERENCES public.goal_plans(id)
    ON DELETE CASCADE,

  day_number SMALLINT NOT NULL
    CHECK (day_number BETWEEN 1 AND 7),

  position SMALLINT NOT NULL
    CHECK (position BETWEEN 1 AND 3),

  instruction TEXT NOT NULL
    CHECK (char_length(btrim(instruction)) BETWEEN 1 AND 500),

  planned_minutes INTEGER NOT NULL
    CHECK (planned_minutes BETWEEN 1 AND 240),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  completed_at TIMESTAMPTZ,

  UNIQUE (goal_plan_id, day_number, position),

  CHECK (
    (status = 'pending' AND completed_at IS NULL)
    OR
    (status = 'completed' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX tasks_goal_plan_status_idx
  ON public.tasks (goal_plan_id, status);

INSERT INTO public.tasks (
  goal_plan_id,
  day_number,
  position,
  instruction,
  planned_minutes
)
SELECT gp.id,
       (day.value ->> 'day')::SMALLINT,
       action.ordinality::SMALLINT,
       action.value ->> 'instruction',
       (action.value ->> 'minutes')::INTEGER
FROM public.goal_plans gp
CROSS JOIN LATERAL jsonb_array_elements(gp.plan -> 'days') AS day(value)
CROSS JOIN LATERAL jsonb_array_elements(day.value -> 'actions')
  WITH ORDINALITY AS action(value, ordinality)
WHERE gp.status = 'accepted'
ON CONFLICT (goal_plan_id, day_number, position) DO NOTHING;
