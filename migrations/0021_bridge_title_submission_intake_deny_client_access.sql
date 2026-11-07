-- Explicitly document the intended backend-only access model for title submission intake.
-- Application writes use the server-side SQL client after auth, account-type, and RBAC checks.
-- Browser-facing anon/authenticated roles must not access this table directly.
-- This policy is intentionally deny-all; do not replace it with a permissive client policy
-- without a reviewed ownership model and role-specific tests.

ALTER TABLE public.bridge_title_submission_intake ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_direct_client_access
  ON public.bridge_title_submission_intake;

CREATE POLICY deny_direct_client_access
  ON public.bridge_title_submission_intake
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
