CREATE TABLE public.daily_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_date DATE NOT NULL,
  time_zone TEXT NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 100),
  metrics JSONB NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
  insight JSONB NOT NULL CHECK (jsonb_typeof(insight) = 'object'),
  provider TEXT NOT NULL CHECK (provider = 'groq'),
  model TEXT NOT NULL CHECK (char_length(btrim(model)) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (review_date, time_zone)
);
