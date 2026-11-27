-- QC accepts only the immutable sealed pointer written by persistVerifiedAsset.
-- A positive byte_size or a legacy exact source-key match is not verification evidence.
create or replace function public.bridge_require_verified_assets_before_qc()
returns trigger
language plpgsql
set search_path = ''
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
           and a.s3_key = new.master_key
           and a.s3_key like '%.verified/' || a.id
           and exists (
             select 1
             from public.bridge_audit_logs v
             where v.entity_type = 'bridge_asset'
               and v.entity_id = a.id
               and v.action = 'asset.upload_verified'
               and (v.metadata::jsonb ->> 'titleId') = new.id
               and (v.metadata::jsonb ->> 'kind') = a.kind
               and (v.metadata::jsonb ->> 'byteSize') = a.byte_size::text
               and nullif(v.metadata::jsonb ->> 'checksum', '') is not null
           )
       )
       or not exists (
         select 1
         from public.bridge_assets a
         where a.title_id = new.id
           and a.kind in ('poster', 'poster_vertical')
           and coalesce(a.byte_size, 0) > 0
           and a.s3_key = new.poster_key
           and a.s3_key like '%.verified/' || a.id
           and exists (
             select 1
             from public.bridge_audit_logs v
             where v.entity_type = 'bridge_asset'
               and v.entity_id = a.id
               and v.action = 'asset.upload_verified'
               and (v.metadata::jsonb ->> 'titleId') = new.id
               and (v.metadata::jsonb ->> 'kind') = a.kind
               and (v.metadata::jsonb ->> 'byteSize') = a.byte_size::text
               and nullif(v.metadata::jsonb ->> 'checksum', '') is not null
           )
       ) then
      raise exception using
        errcode = '23514',
        message = 'QC_BLOCKED_VERIFIED_ASSETS_REQUIRED',
        detail = 'A title requires sealed master and poster pointers with matching persisted verification evidence before QC.';
    end if;
  end if;
  return new;
end;
$function$;
