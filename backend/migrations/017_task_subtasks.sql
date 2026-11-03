ALTER TABLE public.tasks ADD COLUMN parent_task_id UUID;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_parent_owner_fk
  FOREIGN KEY (parent_task_id,owner_id) REFERENCES public.tasks(id,owner_id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_not_own_parent CHECK (parent_task_id IS DISTINCT FROM id);
CREATE INDEX tasks_parent_active ON public.tasks(owner_id,parent_task_id) WHERE deleted_at IS NULL;
