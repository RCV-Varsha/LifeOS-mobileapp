ALTER TABLE public.projects ADD CONSTRAINT projects_goal_owner_unique UNIQUE(id,goal_id,owner_id);
ALTER TABLE public.goal_milestones ADD CONSTRAINT milestones_project_goal_owner_fk
 FOREIGN KEY(project_id,goal_id,owner_id) REFERENCES public.projects(id,goal_id,owner_id);
CREATE FUNCTION public.audit_dependency_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item JSONB;
BEGIN
 item=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 INSERT INTO public.audit_logs(owner_id,entity_id,entity_type,operation,actor,after_value)
 VALUES(item->>'owner_id',(item->>'task_id')::uuid,'task_dependency',TG_OP,'user',item);
 RETURN COALESCE(NEW,OLD);
END; $$;
CREATE TRIGGER dependency_audit AFTER INSERT OR DELETE ON public.task_dependencies FOR EACH ROW EXECUTE FUNCTION public.audit_dependency_change();
