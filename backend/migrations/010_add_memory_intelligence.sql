ALTER TABLE public.user_memory_versions
  ADD COLUMN valid_from DATE,
  ADD COLUMN valid_until DATE,
  ADD COLUMN confidence TEXT NOT NULL DEFAULT 'CONFIRMED';

UPDATE public.user_memory_versions
SET valid_from = created_at::date,
    confidence = CASE WHEN source = 'USER_CORRECTION' THEN 'CORRECTED' ELSE 'CONFIRMED' END;

ALTER TABLE public.user_memory_versions
  ALTER COLUMN valid_from SET DEFAULT CURRENT_DATE,
  ALTER COLUMN valid_from SET NOT NULL;

ALTER TABLE public.user_memory_versions
  ADD CONSTRAINT user_memory_versions_validity_check
    CHECK (valid_until IS NULL OR valid_until >= valid_from),
  ADD CONSTRAINT user_memory_versions_confidence_check
    CHECK (confidence IN ('CONFIRMED', 'CORRECTED')),
  ADD CONSTRAINT user_memory_versions_correction_confidence_check
    CHECK ((source = 'USER_CORRECTION') = (confidence = 'CORRECTED'));

CREATE INDEX user_memory_versions_context_selection_idx
  ON public.user_memory_versions(user_id, status, valid_from, valid_until, memory_id, revision DESC);
