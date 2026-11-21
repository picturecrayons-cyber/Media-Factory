-- Buyer CRM and invitation pipeline. Additive, server-managed control-plane tables.
-- This migration is proposed only; do not apply to any live database without review.
create table if not exists bridge_buyer_crm (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references bridge_organizations(id) on delete restrict,
  created_by text not null references bridge_profiles(user_id) on delete restrict,
  company_name text not null check (length(trim(company_name)) between 1 and 180),
  contact_name text,
  contact_email text,
  contact_phone text,
  channel_type text not null default 'buyer'
    check (channel_type in ('buyer', 'channel_partner', 'distributor', 'aggregator', 'other')),
  pipeline_status text not null default 'target'
    check (pipeline_status in ('target', 'contacted', 'qualified', 'invited', 'active', 'negotiating', 'won', 'lost', 'paused')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists bridge_buyer_crm_org_company_email_uidx
  on bridge_buyer_crm (organization_id, lower(company_name), lower(coalesce(contact_email, '')));
create index if not exists bridge_buyer_crm_org_status_idx
  on bridge_buyer_crm (organization_id, pipeline_status, updated_at desc);
create index if not exists bridge_buyer_crm_org_company_idx
  on bridge_buyer_crm (organization_id, lower(company_name));

create table if not exists bridge_buyer_crm_titles (
  crm_id uuid not null references bridge_buyer_crm(id) on delete cascade,
  title_id text not null references bridge_titles(id) on delete restrict,
  assigned_by text not null references bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (crm_id, title_id)
);

create table if not exists bridge_buyer_crm_invitations (
  id uuid primary key default gen_random_uuid(),
  crm_id uuid not null references bridge_buyer_crm(id) on delete restrict,
  organization_id uuid not null references bridge_organizations(id) on delete restrict,
  email text not null check (length(trim(email)) between 3 and 320),
  token_hash text not null unique,
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'accepted', 'expired', 'revoked', 'failed')),
  expires_at timestamptz not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_by text not null references bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index if not exists bridge_buyer_crm_invites_org_status_idx
  on bridge_buyer_crm_invitations (organization_id, status, created_at desc);
create index if not exists bridge_buyer_crm_invites_email_idx
  on bridge_buyer_crm_invitations (lower(email));

create table if not exists bridge_crm_audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references bridge_organizations(id) on delete restrict,
  actor_user_id text not null references bridge_profiles(user_id) on delete restrict,
  crm_id uuid references bridge_buyer_crm(id) on delete set null,
  invitation_id uuid references bridge_buyer_crm_invitations(id) on delete set null,
  action text not null check (length(trim(action)) between 1 and 80),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bridge_crm_audit_org_created_idx
  on bridge_crm_audit_logs (organization_id, created_at desc);

-- Defense in depth: no direct Data API access. Server functions must authorize
-- the verified actor and organization membership before using the DB connection.
alter table bridge_buyer_crm enable row level security;
alter table bridge_buyer_crm_titles enable row level security;
alter table bridge_buyer_crm_invitations enable row level security;
alter table bridge_crm_audit_logs enable row level security;
revoke all privileges on table bridge_buyer_crm from public, anon, authenticated;
revoke all privileges on table bridge_buyer_crm_titles from public, anon, authenticated;
revoke all privileges on table bridge_buyer_crm_invitations from public, anon, authenticated;
revoke all privileges on table bridge_crm_audit_logs from public, anon, authenticated;

-- No client policies are intentionally granted: access is server-only until a
-- separately reviewed authenticated Data API access model is approved.
