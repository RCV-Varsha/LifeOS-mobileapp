CREATE TABLE public.goal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  goal_id UUID NOT NULL UNIQUE
    REFERENCES public.goals(id)
    ON DELETE CASCADE,

  goal_title TEXT NOT NULL
    CHECK (char_length(btrim(goal_title)) BETWEEN 3 AND 120),

  goal_reason TEXT NOT NULL DEFAULT ''
    CHECK (char_length(goal_reason) <= 500),

  minutes_per_day INTEGER NOT NULL
    CHECK (minutes_per_day BETWEEN 5 AND 240),

  plan JSONB NOT NULL
    CHECK (jsonb_typeof(plan) = 'object'),

  provider TEXT NOT NULL
    CHECK (provider IN ('groq', 'gemini')),

  model TEXT NOT NULL
    CHECK (char_length(btrim(model)) BETWEEN 1 AND 120),

  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted')),

  generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  accepted_at TIMESTAMPTZ,

  CHECK (
    (status = 'proposed' AND accepted_at IS NULL)
    OR
    (status = 'accepted' AND accepted_at IS NOT NULL)
  )
);