-- ============================================================
-- Product Review Workflow — Realtime Publication
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_drafts;
