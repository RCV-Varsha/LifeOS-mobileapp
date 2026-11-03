CREATE TABLE public.personal_profiles (
  owner_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
