-- Allow QC to validate the immutable sealed-object pointer written by
-- persistVerifiedAsset. The asset row keeps its source key for provenance;
-- bridge_titles.master_key/poster_key point at <source>.verified/<asset-id>.
-- Exact-key matches remain supported for already-normalized rows.
create or replace function public.bridge_require_verified_assets_before_qc()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.status = 'QC_REVIEW'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.master_key is null
       or new.poster_key is null
       or not exists (
         select 1
         from public.bridge_assets a
         where a.title_id = new.id
           and a.kind = 'master'
           and coalesce(a.byte_size, 0) > 0
           and (
             a.s3_key = new.master_key
             or a.s3_key || '.verified/' || a.id::text = new.master_key
           )
       )
       or not exists (
         select 1
         from public.bridge_assets a
         where a.title_id = new.id
           and a.kind in ('poster', 'poster_vertical')
           and coalesce(a.byte_size, 0) > 0
           and (
             a.s3_key = new.poster_key
             or a.s3_key || '.verified/' || a.id::text = new.poster_key
           )
       ) then
      raise exception using
        errcode = '23514',
        message = 'QC_BLOCKED_VERIFIED_ASSETS_REQUIRED',
        detail = 'A title requires a verified master and verified poster artwork before QC.';
    end if;
  end if;
  return new;
end;
$function$;
