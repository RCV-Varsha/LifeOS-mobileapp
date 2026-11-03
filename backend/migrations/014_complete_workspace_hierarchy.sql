CREATE TABLE public.objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  goal_id UUID NOT NULL,
  title TEXT NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id,owner_id),
  UNIQUE(id,goal_id,owner_id),
  FOREIGN KEY(goal_id,owner_id) REFERENCES public.goals(id,owner_id)
);
CREATE INDEX objectives_owner_goal ON public.objectives(owner_id,goal_id);
ALTER TABLE public.projects ADD COLUMN objective_id UUID;
ALTER TABLE public.projects ADD CONSTRAINT projects_objective_goal_owner_fk FOREIGN KEY(objective_id,goal_id,owner_id) REFERENCES public.objectives(id,goal_id,owner_id);
ALTER TABLE public.projects ADD CONSTRAINT projects_objective_requires_goal CHECK(objective_id IS NULL OR goal_id IS NOT NULL);
ALTER TABLE public.goal_milestones ADD COLUMN project_id UUID;
ALTER TABLE public.goal_milestones ADD CONSTRAINT milestones_project_owner_fk FOREIGN KEY(project_id,owner_id) REFERENCES public.projects(id,owner_id);
CREATE OR REPLACE FUNCTION public.validate_task_milestone() RETURNS trigger AS $$
BEGIN
  IF NEW.milestone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.goal_milestones gm
    WHERE gm.id=NEW.milestone_id AND gm.owner_id=NEW.owner_id AND (
      EXISTS(SELECT 1 FROM public.goal_plans gp WHERE gp.id=NEW.goal_plan_id AND gp.goal_id=gm.goal_id AND gp.owner_id=NEW.owner_id)
      OR EXISTS(SELECT 1 FROM public.projects p WHERE p.id=NEW.project_id AND p.owner_id=NEW.owner_id AND p.goal_id=gm.goal_id AND (gm.project_id IS NULL OR gm.project_id=p.id))
    )
  ) THEN RAISE EXCEPTION 'task milestone must belong to the same goal and owner' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER tasks_validate_milestone ON public.tasks;
CREATE TRIGGER tasks_validate_milestone BEFORE INSERT OR UPDATE OF milestone_id,goal_plan_id,project_id,owner_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.validate_task_milestone();

-- General source-backed memories extend the existing versioned memory responsibility.
ALTER TABLE public.user_memories DROP CONSTRAINT user_memories_key_check;
ALTER TABLE public.user_memories ADD CONSTRAINT user_memories_key_check CHECK(key='planning.daily_buffer_minutes' OR key LIKE 'evidence.%');
ALTER TABLE public.user_memories DROP CONSTRAINT user_memories_category_check;
ALTER TABLE public.user_memories ADD CONSTRAINT user_memories_category_check CHECK(category IN ('CONSTRAINT','PREFERENCE','FACT','DECISION','PATTERN','CONTEXT'));
ALTER TABLE public.user_memory_versions ALTER COLUMN integer_value DROP NOT NULL;
ALTER TABLE public.user_memory_versions ADD COLUMN text_value TEXT CHECK(length(text_value) BETWEEN 1 AND 4000);
ALTER TABLE public.user_memory_versions ADD COLUMN source_knowledge_id UUID;
ALTER TABLE public.user_memory_versions ADD COLUMN last_used_at TIMESTAMPTZ;
ALTER TABLE public.user_memory_versions ADD CONSTRAINT memory_source_owner_fk FOREIGN KEY(source_knowledge_id,user_id) REFERENCES public.knowledge_items(id,owner_id);
ALTER TABLE public.user_memory_versions ADD CONSTRAINT memory_value_kind CHECK(
 (integer_value IS NOT NULL AND text_value IS NULL) OR
 (integer_value IS NULL AND text_value IS NOT NULL AND source_knowledge_id IS NOT NULL));
CREATE INDEX memory_evidence_source ON public.user_memory_versions(user_id,source_knowledge_id) WHERE status='ACTIVE';

CREATE TABLE public.document_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  knowledge_id UUID NOT NULL,
  filename TEXT NOT NULL CHECK(length(filename) BETWEEN 1 AND 200),
  media_type TEXT NOT NULL CHECK(media_type IN ('text/plain','text/markdown','application/pdf','image/jpeg','image/png','audio/mpeg','audio/mp4','audio/wav')),
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(octet_length(content)=byte_size),
  FOREIGN KEY(knowledge_id,owner_id) REFERENCES public.knowledge_items(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX document_files_owner ON public.document_files(owner_id,knowledge_id);
