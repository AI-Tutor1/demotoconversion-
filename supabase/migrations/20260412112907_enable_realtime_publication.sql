-- Add demos + pour_issues to the default supabase_realtime publication
-- so postgres_changes events are broadcast to subscribed clients.
-- RLS still applies to realtime payloads — clients only receive rows they
-- have read access to via the demos/pour_issues SELECT policies.

ALTER PUBLICATION supabase_realtime ADD TABLE public.demos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pour_issues;
