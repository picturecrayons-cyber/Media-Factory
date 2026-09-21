-- Crayons Bridge canonical schema (Postgres).
-- Apply to canonical Supabase project uakpqqardziifcwzvgfx only.
-- Do not seed demo titles, fake payments, or revenue.

create table if not exists bridge_profiles (
  user_id text primary key,
  email text not null,
  display_name text not null default '',
  account_type text not null,
  organization_name text,
  internal_role text,
  email_verified boolean not null default false,
  invited_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_profiles_account_type_chk
    check (account_type in ('independent_creator', 'studio', 'buyer')),
  constraint bridge_profiles_internal_role_chk
    check (
      internal_role is null
      or internal_role in ('admin', 'super_admin', 'qc_reviewer', 'legal_reviewer', 'finance', 'viewer')
    )
);
create unique index if not exists bridge_profiles_email_idx on bridge_profiles (lower(email));

create table if not exists bridge_titles (
  id text primary key,
  slug text unique not null,
  name text not null,
  name_ml text,
  owner_user_id text not null,
  owner_account_type text not null,
  status text not null default 'DRAFT',
  synopsis text not null default '',
  language text not null default 'Malayalam',
  year int,
  runtime_minutes int,
  licensing_fee_paise int not null default 0,
  poster_key text,
  master_key text,
  legacy_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_titles_status_chk check (status in (
    'DRAFT','UPLOADING','PREPARING','QC_REVIEW','RIGHTS_REVIEW',
    'LICENSING_READY','LIVE_FOR_BUYERS','IN_NEGOTIATION','LICENSED','DELIVERED'
  ))
);
create index if not exists bridge_titles_owner_idx on bridge_titles (owner_user_id);
create index if not exists bridge_titles_status_idx on bridge_titles (status);

create table if not exists bridge_title_events (
  id serial primary key,
  title_id text not null references bridge_titles (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists bridge_assets (
  id text primary key,
  title_id text not null references bridge_titles (id) on delete cascade,
  kind text not null,
  s3_key text not null unique,
  content_type text,
  byte_size bigint,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint bridge_assets_kind_chk check (kind in ('poster', 'screener', 'master', 'subtitle'))
);

create table if not exists bridge_payments (
  id text primary key,
  user_id text not null,
  title_id text,
  purpose text not null,
  provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text,
  amount_paise int not null,
  currency text not null default 'INR',
  status text not null default 'created',
  idempotency_key text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, purpose, idempotency_key)
);

create table if not exists bridge_webhook_events (
  event_id text primary key,
  event_name text not null,
  payload_hash text not null,
  status text not null default 'received',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists bridge_entitlements (
  id serial primary key,
  user_id text not null,
  title_id text not null,
  payment_id text not null,
  access_type text not null,
  created_at timestamptz not null default now(),
  unique (user_id, title_id, access_type)
);

create table if not exists bridge_audit_logs (
  id serial primary key,
  actor_user_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata text not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists bridge_audit_actor_idx on bridge_audit_logs (actor_user_id, created_at desc);

create table if not exists bridge_email_challenges (
  id text primary key,
  user_id text,
  email text not null,
  purpose text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists bridge_invites (
  id text primary key,
  email text not null,
  internal_role text not null,
  invited_by text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
