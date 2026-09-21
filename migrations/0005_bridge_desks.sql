-- Additive desks: organizations, QC, rights, delivery, richer audit.
-- Canonical Supabase uakpqqardziifcwzvgfx only. Do not seed fake rows.

create table if not exists bridge_organizations (
  id text primary key,
  name text not null,
  kind text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint bridge_organizations_kind_chk check (kind in ('studio', 'buyer', 'internal'))
);

create table if not exists bridge_organization_members (
  organization_id text not null references bridge_organizations (id) on delete cascade,
  user_id text not null,
  member_role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table bridge_profiles add column if not exists organization_id text;
alter table bridge_titles add column if not exists organization_id text;
alter table bridge_titles add column if not exists genre text not null default '';

create table if not exists bridge_qc_reviews (
  id text primary key,
  title_id text not null references bridge_titles (id) on delete cascade,
  decision text not null,
  checklist text not null default '{}',
  notes text not null default '',
  actor_user_id text not null,
  created_at timestamptz not null default now(),
  constraint bridge_qc_decision_chk check (decision in ('pass', 'fail', 'request_changes'))
);
create index if not exists bridge_qc_title_idx on bridge_qc_reviews (title_id, created_at desc);

create table if not exists bridge_title_rights (
  title_id text primary key references bridge_titles (id) on delete cascade,
  territories text not null default '',
  rights_type text not null default '',
  media_type text not null default '',
  start_date date,
  end_date date,
  exclusive boolean not null default false,
  exclusions text not null default '',
  chain_of_title_status text not null default 'unverified',
  evidence_note text not null default '',
  approved_by text,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint bridge_rights_chain_chk check (
    chain_of_title_status in ('unverified', 'partial', 'verified')
  )
);

create table if not exists bridge_deliveries (
  id text primary key,
  title_id text not null references bridge_titles (id) on delete cascade,
  payment_id text not null,
  recipient_user_id text not null,
  method text not null default 's3_signed',
  status text not null default 'authorized',
  actor_user_id text not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bridge_delivery_status_chk check (status in ('authorized', 'started', 'completed', 'failed')),
  unique (title_id, payment_id)
);

alter table bridge_audit_logs add column if not exists actor_role text;
alter table bridge_audit_logs add column if not exists previous_state text;
alter table bridge_audit_logs add column if not exists new_state text;
alter table bridge_audit_logs add column if not exists reason text;

create index if not exists bridge_titles_org_idx on bridge_titles (organization_id);
create index if not exists bridge_deliveries_recipient_idx on bridge_deliveries (recipient_user_id);
