-- Align Creator/Studio reusable document ownership with the canonical Studio UUID.
-- Forward-only: the parent vault migration initially creates owner_organization_id as TEXT.
-- Existing Testing vault tables are empty; Production does not yet have these tables.
-- This migration is code-only until separately approved for hosted application.

do $$
begin
  if to_regclass('public.bridge_creator_documents') is null then
    raise exception 'bridge_creator_documents must be created by the parent vault migration first';
  end if;
  if to_regclass('public.bridge_organizations') is null then
    raise exception 'bridge_organizations is required before aligning document organization ownership';
  end if;
end
$$;

alter table public.bridge_creator_documents
  alter column owner_organization_id type uuid
  using nullif(owner_organization_id::text, '')::uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bridge_creator_documents'::regclass
      and conname = 'bridge_creator_documents_owner_organization_id_fkey'
  ) then
    alter table public.bridge_creator_documents
      add constraint bridge_creator_documents_owner_organization_id_fkey
      foreign key (owner_organization_id)
      references public.bridge_organizations(id)
      on delete restrict
      not valid;
  end if;
end
$$;

alter table public.bridge_creator_documents
  validate constraint bridge_creator_documents_owner_organization_id_fkey;

alter table public.bridge_creator_documents
  drop constraint if exists bridge_creator_documents_owner_scope_chk;

alter table public.bridge_creator_documents
  add constraint bridge_creator_documents_owner_scope_chk
  check (
    (owner_account_type = 'independent_creator' and owner_organization_id is null)
    or
    (owner_account_type = 'studio' and owner_organization_id is not null)
  );

create index if not exists bridge_creator_documents_owner_org_uuid_idx
  on public.bridge_creator_documents(owner_organization_id, created_at desc)
  where owner_organization_id is not null;
