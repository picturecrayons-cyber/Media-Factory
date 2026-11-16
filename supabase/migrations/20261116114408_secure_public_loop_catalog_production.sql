-- Public Loop catalogue is a server-only projection of Bridge-authorized publications.
-- Compatible with the canonical Production loop_titles and bridge_loop_publications schemas.
CREATE OR REPLACE FUNCTION public.public_loop_catalog()
RETURNS TABLE (
  id text,
  bridge_title_id text,
  slug text,
  title text,
  synopsis text,
  description text,
  content_type text,
  language text,
  year integer,
  duration_minutes integer,
  maturity_rating text,
  director text,
  is_original boolean,
  original_badge text,
  status text,
  listed boolean,
  published boolean,
  featured boolean,
  access_tier text,
  tvod_rental_price numeric,
  poster_available boolean,
  backdrop_available boolean,
  trailer_available boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    l.id::text,
    l.bridge_title_id,
    l.slug,
    l.title,
    l.synopsis,
    l.description,
    COALESCE(l.content_type, 'Film'),
    l.language,
    l.year,
    l.duration_minutes,
    l.maturity_rating,
    NULL::text AS director,
    false AS is_original,
    NULL::text AS original_badge,
    lower(l.status),
    l.listed,
    l.published,
    l.featured,
    l.access_tier,
    l.tvod_rental_price,
    NULLIF(l.poster_path, '') IS NOT NULL,
    NULLIF(l.backdrop_path, '') IS NOT NULL,
    NULLIF(l.trailer_path, '') IS NOT NULL
  FROM public.loop_titles AS l
  INNER JOIN public.bridge_loop_publications AS p
    ON p.loop_title_id = l.id
   AND p.bridge_title_id = l.bridge_title_id
  WHERE lower(p.authorization_status) = 'authorized'
    AND p.approved_at IS NOT NULL
    AND p.revoked_at IS NULL
    AND p.window_start IS NOT NULL
    AND p.window_end IS NOT NULL
    AND p.window_start <= now()
    AND p.window_end > now()
    AND p.territories @> ARRAY['WORLDWIDE']::text[]
    AND p.languages @> ARRAY[l.language]::text[]
    AND p.exploitation_models @> ARRAY[l.access_tier]::text[]
    AND lower(l.status) IN ('approved', 'published')
    AND l.listed IS TRUE
    AND l.published IS TRUE
  ORDER BY l.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.public_loop_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_loop_catalog() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_loop_catalog() TO service_role;
