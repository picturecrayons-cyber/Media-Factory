-- Account-level Creator/Studio distribution mandate. Acceptance is versioned and audited.
create table public.bridge_creator_distribution_mandates (
  creator_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  mandate_version integer not null check (mandate_version > 0),
  status text not null check (status in ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  scope jsonb not null check (jsonb_typeof(scope) = 'object'),
  accepted_at timestamptz not null,
  consent_text_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (creator_user_id, mandate_version),
  constraint bridge_creator_distribution_mandates_scope_shape check (
    scope ? 'enabled' and scope ? 'version' and scope ? 'destinations'
    and scope ? 'media' and scope ? 'sublicensingAllowed' and scope ? 'acceptedAt'
    and scope ? 'consentTextVersion'
  )
);
alter table public.bridge_creator_distribution_mandates enable row level security;
revoke all on table public.bridge_creator_distribution_mandates from anon, authenticated;
revoke all on table public.bridge_creator_distribution_mandates from service_role;
grant select, insert on table public.bridge_creator_distribution_mandates to service_role;
create unique index bridge_creator_distribution_mandates_one_active_idx on public.bridge_creator_distribution_mandates (creator_user_id) where status = 'ACTIVE';
create index bridge_creator_distribution_mandates_status_idx on public.bridge_creator_distribution_mandates (status);
