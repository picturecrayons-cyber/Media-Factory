
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.bridge_is_title_owner(p_title_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.bridge_titles AS t
    JOIN public.bridge_loop_identity_links AS l
      ON l.bridge_user_id = t.owner_user_id
    WHERE t.id = p_title_id
      AND l.auth_user_id = (SELECT auth.uid())
  );
$function$;

REVOKE ALL ON FUNCTION private.bridge_is_title_owner(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.bridge_is_title_owner(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.bridge_is_title_owner(text) FROM authenticated, anon, PUBLIC;

DROP POLICY IF EXISTS bridge_production_assets_owner_select ON public.bridge_production_assets;
CREATE POLICY bridge_production_assets_owner_select
ON public.bridge_production_assets
FOR SELECT TO authenticated
USING (private.bridge_is_title_owner(title_id));

DROP POLICY IF EXISTS bridge_production_assets_owner_insert ON public.bridge_production_assets;
CREATE POLICY bridge_production_assets_owner_insert
ON public.bridge_production_assets
FOR INSERT TO authenticated
WITH CHECK (private.bridge_is_title_owner(title_id));

DROP POLICY IF EXISTS bridge_production_assets_owner_update ON public.bridge_production_assets;
CREATE POLICY bridge_production_assets_owner_update
ON public.bridge_production_assets
FOR UPDATE TO authenticated
USING (private.bridge_is_title_owner(title_id))
WITH CHECK (private.bridge_is_title_owner(title_id));

DROP POLICY IF EXISTS bridge_production_assets_owner_delete ON public.bridge_production_assets;
CREATE POLICY bridge_production_assets_owner_delete
ON public.bridge_production_assets
FOR DELETE TO authenticated
USING (private.bridge_is_title_owner(title_id));
