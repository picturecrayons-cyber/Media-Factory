-- Reconcile title pointers with sealed OCI asset keys before QC submission.
-- bridge_assets.s3_key may retain the source key while bridge_titles points
-- to the sealed object at <source-key>.verified/<asset-id>.
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
           and strpos(a.s3_key, '.verified/') = 0
           and new.master_key = a.s3_key || '.verified/' || a.id::text
       )
       and not exists (
         select 1
         from public.bridge_assets a
         where a.title_id = new.id
           and a.kind = 'master'
           and a.s3_key = new.master_key
           and coalesce(a.byte_size, 0) > 0
           and strpos(a.s3_key, '.verified/') > 0
       )
       or not exists (
         select 1
         from public.bridge_assets a
         where a.title_id = new.id
           and a.kind in ('poster', 'poster_vertical')
           and coalesce(a.byte_size, 0) > 0
           and (
             a.s3_key = new.poster_key
             or (
               strpos(a.s3_key, '.verified/') = 0
               and new.poster_key = a.s3_key || '.verified/' || a.id::text
             )
           )
           and strpos(new.poster_key, '.verified/') > 0
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
