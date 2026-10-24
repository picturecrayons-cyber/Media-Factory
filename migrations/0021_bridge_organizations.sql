-- Canonical organization scope for Bridge Studio RBAC.
-- Additive only: do not infer organization identity from organization_name.
-- Existing profiles/titles remain unscoped until reviewed and explicitly mapped.
create table if not exists bridge_organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  normalized_name text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_organizations_normalized_name_nonempty
    check (length(trim(normalized_name)) > 0)
);

create index if not exists bridge_organizations_normalized_name_idx
  on bridge_organizations (lower(trim(normalized_name)));

create table if not exists bridge_organization_memberships (
  organization_id uuid not null references bridge_organizations(id) on delete restrict,
  user_id text not null references bridge_profiles(user_id) on delete cascade,
  membership_role text not null default 'member'
    check (membership_role in ('owner', 'admin', 'member')),
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  created_by text references bridge_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists bridge_organization_memberships_user_idx
  on bridge_organization_memberships (user_id, status);

alter table bridge_profiles
  add column if not exists organization_id uuid
  references bridge_organizations(id) on delete restrict;

alter table bridge_titles
  add column if not exists owner_organization_id uuid
  references bridge_organizations(id) on delete restrict;

create index if not exists bridge_profiles_organization_id_idx
  on bridge_profiles (organization_id);

create index if not exists bridge_titles_owner_organization_id_idx
  on bridge_titles (owner_organization_id);

-- Deliberately no automatic name-based backfill. Access to shared titles must
-- remain denied until an authorized operator verifies the organization and
-- creates active membership records in the isolated staging environment.
