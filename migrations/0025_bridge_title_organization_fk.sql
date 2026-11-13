-- Add the missing FK for the pre-existing nullable title organization column.
-- Preflight found zero assigned titles and zero orphaned organization references.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bridge_titles_owner_organization_id_fkey'
      and conrelid = 'public.bridge_titles'::regclass
  ) then
    alter table public.bridge_titles
      add constraint bridge_titles_owner_organization_id_fkey
      foreign key (owner_organization_id)
      references public.bridge_organizations(id)
      on delete restrict;
  end if;
end $$;
