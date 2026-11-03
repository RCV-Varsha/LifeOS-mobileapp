ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_owner_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_owner_id_fkey
 FOREIGN KEY(owner_id) REFERENCES public.users(id) ON DELETE CASCADE;
