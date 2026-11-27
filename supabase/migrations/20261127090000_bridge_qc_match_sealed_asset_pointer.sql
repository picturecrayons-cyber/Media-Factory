-- Match the canonical sealed pointer to its verified asset row without
-- weakening the requirement for a non-empty asset and a .verified/ pointer.
CREATE OR REPLACE FUNCTION public.bridge_require_verified_assets_before_qc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'QC_REVIEW'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.master_key IS NULL
       OR NEW.poster_key IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.bridge_assets a
         WHERE a.title_id = NEW.id
           AND a.kind = 'master'
           AND (
             a.s3_key = NEW.master_key
             OR a.s3_key || '.verified/' || a.id::text = NEW.master_key
           )
           AND COALESCE(a.byte_size, 0) > 0
           AND strpos(NEW.master_key, '.verified/') > 0
       )
       OR NOT EXISTS (
         SELECT 1
         FROM public.bridge_assets a
         WHERE a.title_id = NEW.id
           AND a.kind IN ('poster', 'poster_vertical')
           AND (
             a.s3_key = NEW.poster_key
             OR a.s3_key || '.verified/' || a.id::text = NEW.poster_key
           )
           AND COALESCE(a.byte_size, 0) > 0
           AND strpos(NEW.poster_key, '.verified/') > 0
       ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'QC_BLOCKED_VERIFIED_ASSETS_REQUIRED',
        DETAIL = 'A title requires a verified master and verified poster artwork before QC.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
