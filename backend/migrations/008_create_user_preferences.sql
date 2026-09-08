CREATE TABLE public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  key TEXT NOT NULL CHECK (key IN ('planning.max_major_tasks', 'interaction.explanation_length')),
  category TEXT NOT NULL CHECK (category IN ('PLANNING', 'INTERACTION')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, key),
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  CHECK ((key = 'planning.max_major_tasks' AND category = 'PLANNING') OR
         (key = 'interaction.explanation_length' AND category = 'INTERACTION'))
);

CREATE TABLE public.user_preference_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preference_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('INTEGER', 'ENUM')),
  integer_value INTEGER,
  text_value TEXT,
  source TEXT NOT NULL CHECK (source IN ('USER_EXPLICIT', 'USER_CORRECTION')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED', 'SUPERSEDED')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  note TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (preference_id, revision),
  UNIQUE (id, user_id),
  FOREIGN KEY (preference_id, user_id) REFERENCES public.user_preferences(id, user_id) ON DELETE CASCADE,
  CHECK ((value_type = 'INTEGER' AND integer_value IS NOT NULL AND text_value IS NULL) OR
         (value_type = 'ENUM' AND integer_value IS NULL AND text_value IS NOT NULL)),
  CHECK ((value_type <> 'INTEGER') OR integer_value BETWEEN 1 AND 10),
  CHECK ((value_type <> 'ENUM') OR text_value IN ('concise', 'standard'))
);

CREATE UNIQUE INDEX user_preference_versions_current_unique
  ON public.user_preference_versions(preference_id)
  WHERE status IN ('ACTIVE', 'ARCHIVED');

CREATE TABLE public.user_preference_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preference_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  previous_version_id UUID NOT NULL,
  new_version_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 1),
  note TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (preference_id, revision),
  FOREIGN KEY (preference_id, user_id) REFERENCES public.user_preferences(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (previous_version_id, user_id) REFERENCES public.user_preference_versions(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (new_version_id, user_id) REFERENCES public.user_preference_versions(id, user_id) ON DELETE RESTRICT,
  CHECK (previous_version_id <> new_version_id)
);

CREATE INDEX user_preference_versions_history_idx
  ON public.user_preference_versions(user_id, preference_id, revision DESC);
