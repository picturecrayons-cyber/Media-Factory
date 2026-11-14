-- Crayons Bridge Production security hardening (2026-11-14)
-- Private media buckets are server-only until ownership-scoped client policies are designed.
-- The five buckets were confirmed empty before the Production migration.
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads from studio vault" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to studio vault" ON storage.objects;

-- RLS helper functions are needed by row policies, so authenticated callers retain
-- EXECUTE, but the functions are moved out of the PostgREST-exposed public schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.bridge_current_user_id() SET SCHEMA private;
ALTER FUNCTION public.bridge_current_internal_role() SET SCHEMA private;
ALTER FUNCTION public.bridge_is_internal() SET SCHEMA private;
ALTER FUNCTION public.bridge_can_read_title(text) SET SCHEMA private;

CREATE OR REPLACE FUNCTION private.bridge_current_user_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (SELECT l.bridge_user_id FROM public.bridge_loop_identity_links AS l
      WHERE l.auth_user_id = (SELECT auth.uid()) LIMIT 1),
    (SELECT p.user_id FROM public.bridge_profiles AS p
      WHERE p.user_id = (SELECT auth.uid())::text LIMIT 1)
  );
$function$;

CREATE OR REPLACE FUNCTION private.bridge_current_internal_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT p.internal_role FROM public.bridge_profiles AS p
  WHERE p.user_id = private.bridge_current_user_id()
    AND p.email_verified = true
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION private.bridge_is_internal()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT COALESCE(
    private.bridge_current_internal_role() IN
      ('viewer', 'qc_reviewer', 'legal_reviewer', 'finance', 'admin', 'super_admin'),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION private.bridge_can_read_title(p_title_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.bridge_titles AS t
    WHERE t.id = p_title_id
      AND (
        t.owner_user_id = private.bridge_current_user_id()
        OR private.bridge_is_internal()
        OR EXISTS (
          SELECT 1 FROM public.bridge_buyer_title_access AS a
          WHERE a.title_id = t.id
            AND a.buyer_user_id = private.bridge_current_user_id()
            AND a.revoked_at IS NULL
            AND (a.expires_at IS NULL OR a.expires_at > now())
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.bridge_current_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.bridge_current_internal_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.bridge_is_internal() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.bridge_can_read_title(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.bridge_current_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.bridge_current_internal_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.bridge_is_internal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.bridge_can_read_title(text) TO authenticated, service_role;
