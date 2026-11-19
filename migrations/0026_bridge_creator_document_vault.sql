-- Private, reusable Creator/Studio legal evidence vault.
-- Objects stay in the private OCI bucket; only verified object keys are reusable evidence.
create table if not exists public.bridge_creator_documents (
  id text primary key,
  owner_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  owner_account_type text not null check (owner_account_type in ('independent_creator','studio')),
  owner_organization_id uuid references public.bridge_organizations(id) on delete restrict,
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
    or (owner_account_type = 'studio' and owner_organization_id is not null)
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

-- Title-specific Legal Reviewer assignments; an internal role alone grants no document access.
create table if not exists public.bridge_title_document_review_assignments (
  id text primary key,
  title_id text not null references public.bridge_titles(id) on delete cascade,
  reviewer_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  assigned_by text not null references public.bridge_profiles(user_id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(title_id,reviewer_user_id)
);
create index if not exists bridge_title_document_review_assignments_reviewer_idx
  on public.bridge_title_document_review_assignments(reviewer_user_id,title_id)
  where status='ACTIVE';

alter table public.bridge_creator_documents enable row level security;
alter table public.bridge_title_document_links enable row level security;
alter table public.bridge_title_document_review_assignments enable row level security;
revoke all on table public.bridge_creator_documents from anon, authenticated;
revoke all on table public.bridge_title_document_links from anon, authenticated;
revoke all on table public.bridge_title_document_review_assignments from public, anon, authenticated;
grant select, insert, update on table public.bridge_creator_documents to service_role;
grant select, insert, update on table public.bridge_title_document_links to service_role;
grant select, insert, update on table public.bridge_title_document_review_assignments to service_role;
