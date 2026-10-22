-- Loop analytics telemetry foundation.
-- Server-only table: browser roles never receive direct access. These events are
-- observational analytics, not proof of payment, entitlement, or billable watch time.

create table if not exists public.bridge_loop_analytics_events (
  event_id uuid primary key,
  user_id text not null,
  bridge_title_id text not null references public.bridge_titles(id) on delete restrict,
  loop_title_id text not null references public.loop_titles(id) on delete restrict,
  session_id uuid not null,
  event_type text not null
    check (event_type in ('TITLE_VIEW','PLAYBACK_START','PLAYBACK_PROGRESS','PLAYBACK_COMPLETE')),
  watched_seconds integer not null default 0
    check (watched_seconds >= 0 and watched_seconds <= 30),
  received_at timestamptz not null default now()
);

create index if not exists bridge_loop_analytics_title_time_idx
  on public.bridge_loop_analytics_events(bridge_title_id, received_at desc);
create index if not exists bridge_loop_analytics_loop_title_time_idx
  on public.bridge_loop_analytics_events(loop_title_id, received_at desc);
create index if not exists bridge_loop_analytics_user_time_idx
  on public.bridge_loop_analytics_events(user_id, received_at desc);
create index if not exists bridge_loop_analytics_session_idx
  on public.bridge_loop_analytics_events(session_id, received_at);

alter table public.bridge_loop_analytics_events enable row level security;
revoke all on public.bridge_loop_analytics_events from public, anon, authenticated;

comment on table public.bridge_loop_analytics_events is
  'Server-recorded observational Loop analytics. Client-reported watch intervals are bounded and must not be used as payment, entitlement, or settlement evidence.';
