ALTER TABLE public.notifications ADD COLUMN action_id UUID REFERENCES public.ai_actions(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX notifications_action_unique ON public.notifications(action_id) WHERE action_id IS NOT NULL;
CREATE FUNCTION public.notify_action_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   INSERT INTO public.notifications(owner_id,title,detail,action_id)
     VALUES(NEW.owner_id,'Changes ready for review',NEW.summary,NEW.id);
 ELSE
   IF NEW.status<>'pending' THEN UPDATE public.notifications SET read_at=COALESCE(read_at,now()) WHERE action_id=NEW.id AND owner_id=NEW.owner_id; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER action_notification AFTER INSERT OR UPDATE OF status ON public.ai_actions FOR EACH ROW EXECUTE FUNCTION public.notify_action_review();
CREATE TRIGGER objectives_audit AFTER INSERT OR UPDATE OR DELETE ON public.objectives FOR EACH ROW EXECUTE FUNCTION public.audit_owned_change();
