-- Ensure Testing and future environments enforce the same QC gate as Production.
do $block$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'bridge_require_verified_assets_before_qc'
      and tgrelid = 'public.bridge_titles'::regclass
      and not tgisinternal
  ) then
    create trigger bridge_require_verified_assets_before_qc
      before insert or update of status on public.bridge_titles
      for each row execute function public.bridge_require_verified_assets_before_qc();
  end if;
end;
$block$;
