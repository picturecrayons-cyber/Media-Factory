-- Separate Creator/Studio -> Bridge Admin intake record.
-- Source-only until Testing DB migration replay and an explicit DB WRITE approval.
-- Does not change bridge_titles.status, QC state, rights, legal or Loop publication.

create table if not exists public.bridge_owner_submission_events (
  id bigserial primary key,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  submission_kind text not null check (submission_kind in ('finished_film')),
  action text not null check (action in ('SUBMITTED', 'RESUBMITTED')),
  from_status text,
  to_status text not null check (to_status in ('DRAFT', 'SUBMITTED', 'NEEDS_CORRECTION')),
  actor_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  constraint bridge_owner_submission_events_reason_check
    check (reason is null or length(reason) <= 2000)
);

create index if not exists bridge_owner_submission_events_title_created_idx
  on public.bridge_owner_submission_events (title_id, created_at desc);

alter table public.bridge_owner_submission_events enable row level security;
revoke all on table public.bridge_owner_submission_events from public, anon, authenticated;
grant all on table public.bridge_owner_submission_events to postgres, service_role;

create or replace function public.bridge_reject_owner_submission_event_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
begin
  raise exception 'Owner submission history is append-only';
end;
$function$;

revoke all on function public.bridge_reject_owner_submission_event_mutation() from public, anon, authenticated;
drop trigger if exists bridge_owner_submission_events_immutable on public.bridge_owner_submission_events;
create trigger bridge_owner_submission_events_immutable
before update or delete on public.bridge_owner_submission_events
for each row execute function public.bridge_reject_owner_submission_event_mutation();
