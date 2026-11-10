
create table if not exists bridge_private.buyer_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  buyer_name text,
  primary_contact_name text,
  primary_contact_email text,
  normalized_contact_email text,
  account_status text not null default 'active'
    check (account_status in ('active','paused','restricted','closed')),
  source_mailbox text not null default 'hostinger',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_contact_email)
);

create table if not exists bridge_private.buyer_requirements (
  id uuid primary key default gen_random_uuid(),
  buyer_account_id uuid not null references bridge_private.buyer_accounts(id) on delete cascade,
  requirement_key text not null unique,
  requirement_status text not null default 'new'
    check (requirement_status in ('new','active','paused','closed','needs_review')),
  content_types text[] not null default '{}',
  languages text[] not null default '{}',
  genres text[] not null default '{}',
  territories text[] not null default '{}',
  rights_types text[] not null default '{}',
  platforms text[] not null default '{}',
  commercial_models text[] not null default '{}',
  technical_specs jsonb not null default '{}'::jsonb,
  exclusions text[] not null default '{}',
  min_runtime_minutes integer,
  max_runtime_minutes integer,
  release_window text,
  requirement_summary text not null,
  confidence numeric(5,2) not null default 0 check (confidence between 0 and 100),
  last_mail_at timestamptz,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_runtime_minutes is null or min_runtime_minutes >= 0),
  check (max_runtime_minutes is null or max_runtime_minutes >= 0),
  check (min_runtime_minutes is null or max_runtime_minutes is null or min_runtime_minutes <= max_runtime_minutes)
);

create table if not exists bridge_private.buyer_requirement_evidence (
  id uuid primary key default gen_random_uuid(),
  buyer_requirement_id uuid not null references bridge_private.buyer_requirements(id) on delete cascade,
  source_mailbox text not null default 'hostinger',
  source_folder text not null default 'INBOX',
  source_uid text not null,
  thread_id text,
  subject text,
  sender text,
  received_at timestamptz,
  evidence_kind text not null default 'requirement',
  extracted_excerpt text,
  extraction_notes text,
  created_at timestamptz not null default now(),
  unique (source_mailbox, source_folder, source_uid, evidence_kind)
);

create table if not exists bridge_private.buyer_title_matches (
  id uuid primary key default gen_random_uuid(),
  buyer_requirement_id uuid not null references bridge_private.buyer_requirements(id) on delete cascade,
  title_id text not null references public.bridge_titles(id) on delete cascade,
  match_status text not null default 'needs_review'
    check (match_status in ('potential','partial','no_match','rights_blocked','technical_blocked','commercial_mismatch','needs_review')),
  fit_score numeric(5,2) not null default 0 check (fit_score between 0 and 100),
  matched_dimensions jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  unique (buyer_requirement_id, title_id)
);

create index if not exists buyer_requirements_status_idx
  on bridge_private.buyer_requirements (requirement_status, updated_at desc);
create index if not exists buyer_evidence_requirement_idx
  on bridge_private.buyer_requirement_evidence (buyer_requirement_id, received_at desc);
create index if not exists buyer_matches_requirement_idx
  on bridge_private.buyer_title_matches (buyer_requirement_id, match_status, fit_score desc);

alter table bridge_private.buyer_accounts enable row level security;
alter table bridge_private.buyer_requirements enable row level security;
alter table bridge_private.buyer_requirement_evidence enable row level security;
alter table bridge_private.buyer_title_matches enable row level security;

revoke all on bridge_private.buyer_accounts from public, anon, authenticated;
revoke all on bridge_private.buyer_requirements from public, anon, authenticated;
revoke all on bridge_private.buyer_requirement_evidence from public, anon, authenticated;
revoke all on bridge_private.buyer_title_matches from public, anon, authenticated;

grant usage on schema bridge_private to service_role;
grant select, insert, update, delete on bridge_private.buyer_accounts to service_role;
grant select, insert, update, delete on bridge_private.buyer_requirements to service_role;
grant select, insert, update, delete on bridge_private.buyer_requirement_evidence to service_role;
grant select, insert, update, delete on bridge_private.buyer_title_matches to service_role;
