-- Crayons Bridge generic partner distribution foundation.
-- Additive only. This migration is intentionally not applied to any database by this change.
-- Authorization and delivery are separate persisted states; no row itself publishes a title.

create table if not exists public.bridge_distribution_partners (
  code text primary key,
  display_name text not null,
  adapter_type text not null check (adapter_type in ('LOOP','OTT_API','SFTP','AS2','MANUAL','CUSTOM')),
  status text not null default 'INACTIVE'
    check (status in ('INACTIVE','CONFIGURING','ACTIVE','SUSPENDED','RETIRED')),
  supported_models text[] not null default '{}',
  supported_territories text[] not null default '{}',
  supported_languages text[] not null default '{}',
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(code)) > 0),
  check (length(trim(display_name)) > 0)
);

create table if not exists public.bridge_distribution_deliveries (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  destination_package_id uuid not null,
  partner_code text not null references public.bridge_distribution_partners(code) on delete restrict,
  package_version integer not null check (package_version > 0),

  -- Immutable authorization snapshot for this exact partner delivery scope.
  territories text[] not null check (cardinality(territories) > 0),
  languages text[] not null check (cardinality(languages) > 0),
  exploitation_models text[] not null check (cardinality(exploitation_models) > 0),
  window_start timestamptz,
  window_end timestamptz,
  exclusivity text not null default 'NON_EXCLUSIVE'
    check (exclusivity in ('NON_EXCLUSIVE','EXCLUSIVE')),
  rights_grant_id uuid references public.bridge_rights_grants(id) on delete restrict,
  qc_case_id uuid references public.bridge_qc_cases(id) on delete restrict,
  legal_case_id uuid references public.bridge_legal_cases(id) on delete restrict,
  asset_version_ids uuid[] not null check (cardinality(asset_version_ids) > 0),
  scope_snapshot jsonb not null default '{}'::jsonb,

  authorization_status text not null default 'PENDING'
    check (authorization_status in ('PENDING','AUTHORIZED','REVOKED','EXPIRED','REJECTED')),
  authorized_by text,
  authorized_at timestamptz,
  authorization_expires_at timestamptz,
  revoked_by text,
  revoked_at timestamptz,
  revocation_reason text,

  delivery_status text not null default 'NOT_QUEUED'
    check (delivery_status in ('NOT_QUEUED','QUEUED','IN_PROGRESS','DELIVERED','ACKNOWLEDGED','FAILED','CANCELLED','TAKEDOWN_PENDING','TAKEN_DOWN')),
  idempotency_key text not null,
  partner_delivery_ref text,
  acknowledged_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bridge_distribution_delivery_package_title_fk
    foreign key (destination_package_id, title_id)
    references public.bridge_destination_packages(id, title_id) on delete restrict,
  constraint bridge_distribution_delivery_window_chk
    check (window_end is null or window_start is null or window_end > window_start),
  constraint bridge_distribution_delivery_authorized_evidence_chk
    check (authorization_status <> 'AUTHORIZED' or (authorized_by is not null and authorized_at is not null)),
  constraint bridge_distribution_delivery_revocation_evidence_chk
    check (authorization_status <> 'REVOKED' or (revoked_by is not null and revoked_at is not null)),
  constraint bridge_distribution_delivery_ack_evidence_chk
    check (delivery_status not in ('ACKNOWLEDGED','TAKEN_DOWN') or acknowledged_at is not null),
  constraint bridge_distribution_delivery_idempotency_chk
    check (length(trim(idempotency_key)) > 0)
);

create unique index if not exists bridge_distribution_deliveries_partner_idempotency_uidx
  on public.bridge_distribution_deliveries(partner_code, idempotency_key);
create index if not exists bridge_distribution_deliveries_title_partner_idx
  on public.bridge_distribution_deliveries(title_id, partner_code, created_at desc);
create index if not exists bridge_distribution_deliveries_state_idx
  on public.bridge_distribution_deliveries(authorization_status, delivery_status, next_attempt_at);
create index if not exists bridge_distribution_deliveries_partner_ack_idx
  on public.bridge_distribution_deliveries(partner_code, acknowledged_at desc);

alter table public.bridge_distribution_partners enable row level security;
alter table public.bridge_distribution_deliveries enable row level security;

-- Private control-plane tables: no direct browser role access. Server routes must
-- enforce authenticated role/partner scope before using the privileged DB connection.
revoke all on public.bridge_distribution_partners from anon, authenticated;
revoke all on public.bridge_distribution_deliveries from anon, authenticated;

comment on table public.bridge_distribution_partners is
  'Private partner registry. Credentials must live in a secret manager, never in this table.';
comment on table public.bridge_distribution_deliveries is
  'Partner-specific delivery ledger. Authorization, delivery, acknowledgement and takedown remain separate states; no implicit publication.';
