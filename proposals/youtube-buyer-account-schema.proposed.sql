-- PROPOSAL ONLY — do not apply until STAGING migration reconciliation and CRA-128 isolation pass.
-- YouTube / platform buyer organization extension.
-- No existing rows are backfilled or activated by this proposal.

begin;

alter table public.bridge_organizations
  add column if not exists organization_kind text not null default 'studio'
    check (organization_kind in ('studio', 'buyer', 'platform_buyer', 'distributor', 'aggregator')),
  add column if not exists verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending_review', 'verified', 'rejected', 'suspended')),
  add column if not exists commercial_capacity text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by text references public.bridge_profiles(user_id) on delete set null;

create table if not exists public.bridge_buyer_mandates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bridge_organizations(id) on delete restrict,
  mandate_status text not null default 'pending_review'
    check (mandate_status in ('pending_review', 'verified', 'rejected', 'suspended', 'expired', 'revoked')),
  counterparty_legal_name text not null,
  counterparty_jurisdiction text,
  evidence_storage_key text,
  evidence_sha256 text,
  authorized_representative_name text,
  authorized_representative_title text,
  authorized_representative_email text,
  channels text[] not null default '{}',
  territories text[] not null default '{}',
  languages text[] not null default '{}',
  media_rights text[] not null default '{}',
  exploitation_models text[] not null default '{}',
  exclusivity text not null default 'non_exclusive'
    check (exclusivity in ('exclusive', 'non_exclusive')),
  sublicensing_allowed boolean not null default false,
  onward_delegation_allowed boolean not null default false,
  effective_from timestamptz,
  effective_until timestamptz,
  reviewed_by text references public.bridge_profiles(user_id) on delete set null,
  reviewed_at timestamptz,
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_buyer_mandates_scope_nonempty check (
    cardinality(channels) > 0 and cardinality(territories) > 0
    and cardinality(languages) > 0 and cardinality(media_rights) > 0
  ),
  constraint bridge_buyer_mandates_valid_window check (
    effective_until is null or effective_from is null or effective_until > effective_from
  )
);

create index if not exists bridge_buyer_mandates_org_status_idx
  on public.bridge_buyer_mandates (organization_id, mandate_status, effective_from, effective_until);

alter table public.bridge_buyer_mandates enable row level security;
revoke all privileges on table public.bridge_buyer_mandates from public, anon, authenticated;

-- Server-only access. Runtime must additionally enforce verified actor + admin/legal
-- reviewer permission, organization isolation, active mandate, and exact title-rights
-- scope. No browser policy is introduced in this proposal.
commit;
