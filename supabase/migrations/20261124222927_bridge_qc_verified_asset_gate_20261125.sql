create or replace function public.bridge_require_verified_assets_before_qc()
returns trigger
language plpgsql
set search_path = public
as $$
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
           and a.s3_key = new.master_key
           and coalesce(a.byte_size, 0) > 0
           and strpos(a.s3_key, '.verified/') > 0
       )
       or not exists (
         select 1
         from public.bridge_assets a
         where a.title_id = new.id
           and a.kind in ('poster', 'poster_vertical')
           and a.s3_key = new.poster_key
           and coalesce(a.byte_size, 0) > 0
           and strpos(a.s3_key, '.verified/') > 0
       ) then
      raise exception using
        errcode = '23514',
        message = 'QC_BLOCKED_VERIFIED_ASSETS_REQUIRED',
        detail = 'A title requires a verified master and verified poster artwork before QC.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bridge_require_verified_assets_before_qc on public.bridge_titles;
create trigger bridge_require_verified_assets_before_qc
before insert or update of status on public.bridge_titles
for each row
execute function public.bridge_require_verified_assets_before_qc();

comment on function public.bridge_require_verified_assets_before_qc() is
'Fail-closed production gate: QC_REVIEW requires title-linked, non-empty, sealed verified master and artwork assets.';
