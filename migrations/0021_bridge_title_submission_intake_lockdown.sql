-- The submission intake table is accessed only by the Bridge server runtime.
-- Better Auth + server-side RBAC are the identity and authorization boundary.
-- Keep RLS enabled with no client policies, and explicitly remove Data API grants.
ALTER TABLE public.bridge_title_submission_intake ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.bridge_title_submission_intake FROM anon, authenticated;
