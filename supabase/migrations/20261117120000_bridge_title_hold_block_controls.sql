-- Persist title-level operational HOLD / BLOCK independently of lifecycle status.
-- Application writes are server-authoritative; browser roles receive no direct write grants.
create table if not exists public.bridge_title_controls (
  title_id text primary key references public.bridge_titles(id) on delete restrict,
  control_state text not null default 'CLEAR'
    check (control_state in ('CLEAR','HOLD','BLOCK')),
  reason text,
  set_by text,
  set_at timestamptz,
  released_by text,
  released_at timestamptz,
  release_reason text,
  updated_at timestamptz not null default now(),
  constraint bridge_title_controls_consistency check (
    (control_state = 'CLEAR' and reason is null and set_by is null and set_at is null)
    or
    (control_state in ('HOLD','BLOCK') and length(trim(coalesce(reason,''))) >= 8
      and set_by is not null and set_at is not null)
  )
);

create table if not exists public.bridge_title_control_events (
  id bigserial primary key,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  control_state text not null check (control_state in ('HOLD','BLOCK','CLEAR')),
  action text not null check (action in ('SET_HOLD','SET_BLOCK','RELEASE_HOLD','UNBLOCK')),
  reason text not null check (length(trim(reason)) >= 8),
  actor_user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists bridge_title_control_events_title_created_idx
  on public.bridge_title_control_events(title_id, created_at desc);

alter table public.bridge_title_controls enable row level security;
alter table public.bridge_title_control_events enable row level security;
revoke all on public.bridge_title_controls from anon, authenticated;
revoke all on public.bridge_title_control_events from anon, authenticated;
