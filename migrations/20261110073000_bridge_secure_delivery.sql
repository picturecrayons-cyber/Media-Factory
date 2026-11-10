-- Secure recipient-bound delivery grants and acceptance receipts.
create table if not exists public.bridge_delivery_access_grants (
  package_id uuid not null,
  title_id text not null,
  buyer_user_id text not null references public.bridge_profiles(user_id) on delete cascade,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  primary key (package_id, buyer_user_id),
  foreign key (package_id, title_id)
    references public.bridge_destination_packages(id, title_id) on delete cascade,
  constraint bridge_delivery_access_expiry_check check (expires_at > granted_at)
);
create index if not exists bridge_delivery_access_buyer_idx
  on public.bridge_delivery_access_grants(buyer_user_id, package_id)
  where revoked_at is null;

create table if not exists public.bridge_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null,
  title_id text not null,
  buyer_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  manifest_sha256 char(64) not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  accepted_asset_count integer not null check (accepted_asset_count > 0),
  acceptance_note text,
  accepted_at timestamptz not null default now(),
  unique (package_id, buyer_user_id),
  foreign key (package_id, title_id)
    references public.bridge_destination_packages(id, title_id) on delete restrict
);
alter table public.bridge_delivery_access_grants enable row level security;
alter table public.bridge_delivery_receipts enable row level security;
revoke all on public.bridge_delivery_access_grants from anon, authenticated;
revoke all on public.bridge_delivery_receipts from anon, authenticated;
comment on table public.bridge_delivery_access_grants is
  'Server-only recipient-bound buyer access to an authorized destination package; expires and revokes at signer boundary.';
comment on table public.bridge_delivery_receipts is
  'Server-computed manifest hash and buyer acceptance evidence for a specific destination package.';
