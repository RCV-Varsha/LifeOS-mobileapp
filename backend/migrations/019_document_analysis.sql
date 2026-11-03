CREATE TABLE public.document_analyses (
 file_id UUID PRIMARY KEY REFERENCES public.document_files(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 summary TEXT NOT NULL,
 extracted_text TEXT NOT NULL,
 proposal_id UUID REFERENCES public.ai_actions(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX document_analysis_owner ON public.document_analyses(owner_id);
