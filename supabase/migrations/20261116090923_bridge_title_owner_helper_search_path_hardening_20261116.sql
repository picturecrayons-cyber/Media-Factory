-- Production hotfix: harden the existing title-owner helper search path.
-- Preserve the function signature, owner, SECURITY DEFINER, and RLS role behavior.
-- All referenced application objects are schema-qualified.
CREATE OR REPLACE FUNCTION public.bridge_is_title_owner(p_title_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $bridge_owner$
  SELECT EXISTS (
    SELECT 1
    FROM public.bridge_titles AS t
    JOIN public.bridge_loop_identity_links AS l
      ON l.bridge_user_id = t.owner_user_id
    WHERE t.id = p_title_id
      AND l.auth_user_id = (SELECT auth.uid())
  );
$bridge_owner$;

REVOKE ALL ON FUNCTION public.bridge_is_title_owner(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_is_title_owner(text) TO authenticated;
