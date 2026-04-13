-- Step 5 needs Realtime on demo_drafts so the analyst sees the AI draft appear
-- as soon as the Python backend inserts it. RLS still gates the payload —
-- clients only receive events for demos they have read access to.
ALTER PUBLICATION supabase_realtime ADD TABLE public.demo_drafts;
