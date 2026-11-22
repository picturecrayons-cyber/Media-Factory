-- Reconcile the private Creator / Studio legal evidence vault.
-- The matching root migration exists as migrations/0026_bridge_creator_document_vault.sql.
-- Keep private OCI object keys server-only; no client role receives table access.
create table if not exists public.bridge_creator_documents (
  id text primary key,
  owner_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  owner_account_type text not null check (owner_account_type in ('independent_creator','studio')),
  owner_organization_id text,
  document_type text not null check (document_type in (
    'FINISHED_FILM_AGREEMENT','STORY_CONCEPT_AGREEMENT','DISTRIBUTION_AGREEMENT',
    'OWNERSHIP_CHAIN_OF_TITLE','AUTHOR_ASSIGNMENT','MUSIC_RIGHTS','OTHER'
  )),
  file_name text not null,
  content_type text not null,
  byte_size bigint,
  storage_key text not null unique,
  status text not null default 'PENDING_UPLOAD'
    check (status in ('PENDING_UPLOAD','VERIFIED','REVOKED')),
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (owner_account_type = 'independent_creator' and owner_organization_id is null)
    or owner_account_type = 'studio'
  )
);
create index if not exists bridge_creator_documents_owner_idx
  on public.bridge_creator_documents(owner_user_id, created_at desc);
create index if not exists bridge_creator_documents_org_idx
  on public.bridge_creator_documents(owner_organization_id, created_at desc)
  where owner_organization_id is not null;

create table if not exists public.bridge_title_document_links (
  id text primary key,
  title_id text not null references public.bridge_titles(id) on delete cascade,
  document_id text not null references public.bridge_creator_documents(id) on delete restrict,
  evidence_type text not null check (evidence_type in (
    'FINISHED_FILM_AGREEMENT','STORY_CONCEPT_AGREEMENT','DISTRIBUTION_AGREEMENT',
    'OWNERSHIP_CHAIN_OF_TITLE','AUTHOR_ASSIGNMENT','MUSIC_RIGHTS','OTHER'
  )),
  linked_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(title_id, document_id, evidence_type)
);
create index if not exists bridge_title_document_links_title_idx
  on public.bridge_title_document_links(title_id, created_at desc);

alter table public.bridge_creator_documents enable row level security;
alter table public.bridge_title_document_links enable row level security;
revoke all on table public.bridge_creator_documents from anon, authenticated;
revoke all on table public.bridge_title_document_links from anon, authenticated;
grant select, insert, update on table public.bridge_creator_documents to service_role;
grant select, insert, update on table public.bridge_title_document_links to service_role;
