-- Super Admin support case management built on metadata-only inbound mail events.
-- No message body or attachment content is stored; no outbound customer email is sent.
create table if not exists private.bridge_support_cases (
  id uuid primary key default gen_random_uuid(),
  case_number bigint generated always as identity unique,
  source_event_id uuid references private.bridge_inbound_mail_events(id) on delete set null,
  requester_email text not null check (length(requester_email) <= 320),
  subject text not null check (length(subject) <= 998),
  status text not null default 'OPEN'
    check (status in ('OPEN','IN_PROGRESS','WAITING_INTERNAL','WAITING_CUSTOMER','RESOLVED','CLOSED')),
  priority text not null default 'NORMAL'
    check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  assigned_to text references public.bridge_profiles(user_id) on delete set null,
  created_by text not null references public.bridge_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists bridge_support_cases_source_event_uidx
  on private.bridge_support_cases(source_event_id);
create index if not exists bridge_support_cases_queue_idx
  on private.bridge_support_cases(status, priority, updated_at desc);

create table if not exists private.bridge_support_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references private.bridge_support_cases(id) on delete cascade,
  actor_user_id text not null references public.bridge_profiles(user_id),
  event_type text not null check (event_type in ('CREATED','STATUS_CHANGED','PRIORITY_CHANGED','ASSIGNED','INTERNAL_NOTE')),
  from_value text,
  to_value text,
  note text check (note is null or length(note) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists bridge_support_case_events_case_idx
  on private.bridge_support_case_events(case_id, created_at desc);

alter table private.bridge_support_cases enable row level security;
alter table private.bridge_support_case_events enable row level security;
revoke all privileges on table private.bridge_support_cases from public, anon, authenticated;
revoke all privileges on table private.bridge_support_case_events from public, anon, authenticated;
grant all privileges on table private.bridge_support_cases to service_role;
grant all privileges on table private.bridge_support_case_events to service_role;
grant select on table private.bridge_inbound_mail_events to service_role;
