CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  title TEXT NOT NULL
    CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),

  reason TEXT NOT NULL DEFAULT ''
    CHECK (char_length(reason) <= 500),

  minutes_per_day INTEGER NOT NULL
    CHECK (minutes_per_day BETWEEN 5 AND 240),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);