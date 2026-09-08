CREATE TABLE public.user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  key TEXT NOT NULL CHECK (key = 'planning.daily_buffer_minutes'),
  category TEXT NOT NULL CHECK (category = 'CONSTRAINT'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, key),
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);

CREATE TABLE public.user_memory_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  integer_value INTEGER NOT NULL CHECK (integer_value BETWEEN 0 AND 240),
  source TEXT NOT NULL CHECK (source IN ('USER_EXPLICIT', 'USER_CONFIRMED_AI_SUGGESTION', 'USER_CORRECTION')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED', 'SUPERSEDED')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  note TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (memory_id, revision),
  UNIQUE (id, user_id),
  FOREIGN KEY (memory_id, user_id) REFERENCES public.user_memories(id, user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX user_memory_versions_current_unique
  ON public.user_memory_versions(memory_id)
  WHERE status IN ('ACTIVE', 'ARCHIVED');

CREATE TABLE public.user_memory_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  previous_version_id UUID NOT NULL,
  new_version_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 1),
  note TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (memory_id, revision),
  FOREIGN KEY (memory_id, user_id) REFERENCES public.user_memories(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (previous_version_id, user_id) REFERENCES public.user_memory_versions(id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (new_version_id, user_id) REFERENCES public.user_memory_versions(id, user_id) ON DELETE RESTRICT,
  CHECK (previous_version_id <> new_version_id)
);

CREATE INDEX user_memory_versions_history_idx
  ON public.user_memory_versions(user_id, memory_id, revision DESC);
