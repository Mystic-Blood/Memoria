-- Explicit, least-privilege table grants for the API roles.
--
-- This project's default privileges give new tables only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN for
-- anon/authenticated/service_role, so nothing is readable through the API until granted here. Rather
-- than a blanket GRANT ALL, each role gets exactly what the app needs. TRUNCATE is removed because it
-- ignores row-level security.

REVOKE ALL ON public.profiles, public.conversations, public.messages, public.memories, public.memory_events, public.memory_runs
  FROM anon, authenticated;

-- Signed-in users (always further restricted to their own rows by RLS)
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations, public.messages TO authenticated;
GRANT SELECT ON public.memories, public.memory_events, public.memory_runs TO authenticated;

-- Server (background memory step, cron, admin scripts). Memory changes still go through the functions
-- so they are atomic and recorded in memory_events; memory_runs is written directly by the pipeline.
REVOKE TRUNCATE ON public.profiles, public.conversations, public.messages, public.memories, public.memory_events, public.memory_runs
  FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.conversations, public.messages, public.memory_runs TO service_role;
GRANT SELECT ON public.memories, public.memory_events TO service_role;
