CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  goal_id UUID,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=10000),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','archived')),
  deadline TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id,owner_id),
  FOREIGN KEY(goal_id,owner_id) REFERENCES public.goals(id,owner_id)
);
CREATE INDEX projects_owner_updated ON public.projects(owner_id,updated_at DESC,id);

-- Manual tasks share the existing execution table. Existing weekly plans retain their constraints.
ALTER TABLE public.tasks ALTER COLUMN goal_plan_id DROP NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN day_number DROP NOT NULL;
ALTER TABLE public.tasks ALTER COLUMN position DROP NOT NULL;
ALTER TABLE public.tasks ADD COLUMN project_id UUID;
ALTER TABLE public.tasks ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=10000);
ALTER TABLE public.tasks ADD COLUMN deadline TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN priority SMALLINT NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 3);
ALTER TABLE public.tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'general' CHECK(length(category) BETWEEN 1 AND 80);
ALTER TABLE public.tasks ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_project_owner_fk FOREIGN KEY(project_id,owner_id) REFERENCES public.projects(id,owner_id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_plan_coordinates CHECK (
 (goal_plan_id IS NULL AND day_number IS NULL AND position IS NULL) OR
 (goal_plan_id IS NOT NULL AND day_number IS NOT NULL AND position IS NOT NULL));
CREATE INDEX tasks_project_owner ON public.tasks(owner_id,project_id,deadline) WHERE deleted_at IS NULL;

CREATE TABLE public.task_dependencies (
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  task_id UUID NOT NULL,
  depends_on_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(task_id,depends_on_id),
  CHECK(task_id<>depends_on_id),
  FOREIGN KEY(task_id,owner_id) REFERENCES public.tasks(id,owner_id) ON DELETE CASCADE,
  FOREIGN KEY(depends_on_id,owner_id) REFERENCES public.tasks(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX task_dependencies_owner ON public.task_dependencies(owner_id,depends_on_id);

CREATE TABLE public.knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  project_id UUID,
  kind TEXT NOT NULL CHECK(kind IN ('note','document','idea','resource','concept','decision')),
  title TEXT NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
  content TEXT NOT NULL DEFAULT '' CHECK(length(content)<=200000),
  source_url TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id,owner_id),
  FOREIGN KEY(project_id,owner_id) REFERENCES public.projects(id,owner_id)
);
CREATE INDEX knowledge_owner_updated ON public.knowledge_items(owner_id,updated_at DESC,id) WHERE deleted_at IS NULL;
CREATE INDEX knowledge_fts ON public.knowledge_items USING GIN(to_tsvector('english',title||' '||content));
CREATE TABLE public.decisions (
  knowledge_id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  context TEXT NOT NULL,
  options TEXT[] NOT NULL DEFAULT '{}',
  reasoning TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('recorded','superseded','reversed')),
  FOREIGN KEY(knowledge_id,owner_id) REFERENCES public.knowledge_items(id,owner_id) ON DELETE CASCADE
);

-- An identity registry enables foreign keys for heterogeneous graph endpoints.
CREATE TABLE public.entity_nodes (
  id UUID NOT NULL,
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  kind TEXT NOT NULL CHECK(kind IN ('goal','project','task','knowledge','milestone')),
  PRIMARY KEY(id,owner_id)
);
CREATE FUNCTION public.maintain_entity_node() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    DELETE FROM public.entity_nodes WHERE id=OLD.id AND owner_id=OLD.owner_id;
    RETURN OLD;
  END IF;
  INSERT INTO public.entity_nodes(id,owner_id,kind) VALUES(NEW.id,NEW.owner_id,TG_ARGV[0]) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER goals_node AFTER INSERT OR DELETE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.maintain_entity_node('goal');
CREATE TRIGGER projects_node AFTER INSERT OR DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.maintain_entity_node('project');
CREATE TRIGGER tasks_node AFTER INSERT OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.maintain_entity_node('task');
CREATE TRIGGER knowledge_node AFTER INSERT OR DELETE ON public.knowledge_items FOR EACH ROW EXECUTE FUNCTION public.maintain_entity_node('knowledge');
CREATE TRIGGER milestones_node AFTER INSERT OR DELETE ON public.goal_milestones FOR EACH ROW EXECUTE FUNCTION public.maintain_entity_node('milestone');
INSERT INTO public.entity_nodes SELECT id,owner_id,'goal' FROM public.goals;
INSERT INTO public.entity_nodes SELECT id,owner_id,'task' FROM public.tasks;
INSERT INTO public.entity_nodes SELECT id,owner_id,'milestone' FROM public.goal_milestones;
CREATE TABLE public.relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  source_id UUID NOT NULL,
  target_id UUID NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('related_to','supports','informs','contradicts','references')),
  confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  created_by TEXT NOT NULL CHECK(created_by IN ('user','confirmed_ai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id,source_id,target_id,type),
  CHECK(source_id<>target_id),
  FOREIGN KEY(source_id,owner_id) REFERENCES public.entity_nodes(id,owner_id) ON DELETE CASCADE,
  FOREIGN KEY(target_id,owner_id) REFERENCES public.entity_nodes(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX relationships_target ON public.relationships(owner_id,target_id);

CREATE TABLE public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  knowledge_id UUID NOT NULL,
  revision INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK(position>=0),
  content TEXT NOT NULL,
  embedding DOUBLE PRECISION[] NOT NULL,
  embedding_model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(knowledge_id,position),
  CHECK(cardinality(embedding)>0),
  FOREIGN KEY(knowledge_id,owner_id) REFERENCES public.knowledge_items(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX knowledge_chunks_owner ON public.knowledge_chunks(owner_id,knowledge_id);

CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  task_id UUID,
  title TEXT NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(ends_at>starts_at),
  UNIQUE(id,owner_id),
  FOREIGN KEY(task_id,owner_id) REFERENCES public.tasks(id,owner_id)
);
CREATE INDEX calendar_owner_time ON public.calendar_events(owner_id,starts_at,ends_at);

CREATE TABLE public.ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  intent TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  sources JSONB NOT NULL CHECK(jsonb_typeof(sources)='array'),
  response JSONB NOT NULL CHECK(jsonb_typeof(response)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id,owner_id)
);
CREATE TABLE public.ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  interaction_id UUID,
  source TEXT NOT NULL CHECK(source IN ('assistant','planner','capture','knowledge')),
  summary TEXT NOT NULL,
  changes JSONB NOT NULL CHECK(jsonb_typeof(changes)='array'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected','undone')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  FOREIGN KEY(interaction_id,owner_id) REFERENCES public.ai_interactions(id,owner_id)
);
CREATE INDEX ai_actions_owner ON public.ai_actions(owner_id,created_at DESC);
CREATE TABLE public.audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  entity_id UUID,
  entity_type TEXT NOT NULL,
  operation TEXT NOT NULL,
  actor TEXT NOT NULL,
  before_value JSONB,
  after_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_owner_time ON public.audit_logs(owner_id,id DESC);
CREATE FUNCTION public.audit_owned_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_value JSONB; new_value JSONB; identity_value JSONB;
BEGIN
  IF TG_OP<>'INSERT' THEN old_value=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN new_value=to_jsonb(NEW); END IF;
  identity_value=COALESCE(new_value,old_value);
  INSERT INTO public.audit_logs(owner_id,entity_id,entity_type,operation,actor,before_value,after_value)
    VALUES(identity_value->>'owner_id',(identity_value->>'id')::uuid,TG_TABLE_NAME,TG_OP,
      COALESCE(NULLIF(current_setting('lifeos.actor',true),''),'user'),old_value,new_value);
  RETURN COALESCE(NEW,OLD);
END; $$;
CREATE TRIGGER goals_audit AFTER INSERT OR UPDATE OR DELETE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.audit_owned_change();
CREATE TRIGGER tasks_audit AFTER INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.audit_owned_change();
CREATE TRIGGER projects_audit AFTER INSERT OR UPDATE OR DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.audit_owned_change();
CREATE TRIGGER knowledge_audit AFTER INSERT OR UPDATE OR DELETE ON public.knowledge_items FOR EACH ROW EXECUTE FUNCTION public.audit_owned_change();
CREATE TRIGGER relationships_audit AFTER INSERT OR UPDATE OR DELETE ON public.relationships FOR EACH ROW EXECUTE FUNCTION public.audit_owned_change();
CREATE TRIGGER calendar_audit AFTER INSERT OR UPDATE OR DELETE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.audit_owned_change();
CREATE TRIGGER actions_audit AFTER INSERT OR UPDATE OR DELETE ON public.ai_actions FOR EACH ROW EXECUTE FUNCTION public.audit_owned_change();

CREATE TABLE public.sync_operations (
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  operation_id UUID NOT NULL,
  request_hash TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,operation_id)
);
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES public.users(id),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_owner ON public.notifications(owner_id,created_at DESC);
