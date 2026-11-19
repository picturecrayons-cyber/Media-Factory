-- Studio-specific invitation acceptance and dual-control ownership transfer.
-- Server actions perform all writes; client roles have no direct table access.
create table if not exists public.bridge_studio_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bridge_organizations(id) on delete restrict,
  email text not null check (length(trim(email)) between 3 and 320),
  membership_role text not null check (membership_role in ('admin', 'producer', 'dit', 'member')),
  invited_by text not null references public.bridge_profiles(user_id) on delete restrict,
  token_hash char(64) not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  accepted_by text references public.bridge_profiles(user_id) on delete restrict,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((accepted_at is null) = (accepted_by is null)),
  check (accepted_at is null or revoked_at is null)
);
create unique index if not exists bridge_studio_invites_pending_email_idx
  on public.bridge_studio_invites (organization_id, lower(trim(email)))
  where accepted_at is null and revoked_at is null;

create index if not exists bridge_studio_invites_org_created_idx
  on public.bridge_studio_invites (organization_id, created_at desc);

alter table public.bridge_studio_invites enable row level security;
alter table public.bridge_studio_invites force row level security;
revoke all privileges on table public.bridge_studio_invites from public, anon, authenticated;

create table if not exists public.bridge_studio_ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bridge_organizations(id) on delete restrict,
  current_owner_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  proposed_owner_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'CANCELLED')),
  reason text not null check (length(trim(reason)) between 8 and 1000),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  check (current_owner_user_id <> proposed_owner_user_id),
  check ((status = 'ACCEPTED') = (accepted_at is not null)),
  check ((status = 'CANCELLED') = (cancelled_at is not null))
);

create unique index if not exists bridge_studio_ownership_transfer_pending_org_idx
  on public.bridge_studio_ownership_transfers (organization_id)
  where status = 'PENDING';

create index if not exists bridge_studio_ownership_transfer_target_idx
  on public.bridge_studio_ownership_transfers (proposed_owner_user_id, status, created_at desc);

alter table public.bridge_studio_ownership_transfers enable row level security;
alter table public.bridge_studio_ownership_transfers force row level security;
revoke all privileges on table public.bridge_studio_ownership_transfers from public, anon, authenticated;
