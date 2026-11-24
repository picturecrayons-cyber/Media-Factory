-- Preview implementation prerequisite. Apply only after separate STAGING DB approval and schema reconciliation.
create table if not exists public.bridge_creator_distribution_mandates (
  creator_user_id text primary key references public.bridge_profiles(user_id) on delete restrict,
  mandate_version integer not null check (mandate_version > 0),
  status text not null check (status in ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  scope jsonb not null check (jsonb_typeof(scope) = 'object'),
  accepted_at timestamptz not null,
  consent_text_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_creator_distribution_mandates_scope_shape check (
    scope ? 'destinations' and scope ? 'media' and scope ? 'sublicensingAllowed'
  )
);
alter table public.bridge_creator_distribution_mandates enable row level security;
revoke all on table public.bridge_creator_distribution_mandates from public, anon, authenticated;
grant select, insert, update on public.bridge_creator_distribution_mandates to service_role;
create index if not exists bridge_creator_distribution_mandates_status_idx
  on public.bridge_creator_distribution_mandates(status);
