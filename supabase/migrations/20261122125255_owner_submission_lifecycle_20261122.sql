-- Owner submission intake lifecycle.
-- Applies to the Testing project first; Production deployment remains blocked
-- until migration reconciliation and release approval.

-- Finished Film uses the existing canonical owner-submission row.
alter table public.bridge_title_owner_submissions
  drop constraint if exists bridge_title_owner_submissions_submission_status_check;

alter table public.bridge_title_owner_submissions
  add constraint bridge_title_owner_submissions_submission_status_check
  check (submission_status in ('DRAFT', 'SUBMITTED', 'NEEDS_CORRECTION', 'ACCEPTED_INTAKE'));

-- Story / Concept keeps editorial, legal and buyer-curation statuses independent.
alter table public.bridge_story_concept_submissions
  add column if not exists owner_submission_status text not null default 'DRAFT',
  add constraint bridge_story_concept_owner_submission_status_check
  check (owner_submission_status in ('DRAFT', 'SUBMITTED', 'NEEDS_CORRECTION', 'ACCEPTED_INTAKE'));

create index if not exists bridge_story_concept_owner_submission_queue_idx
  on public.bridge_story_concept_submissions (owner_submission_status, created_at);

-- Append-only lifecycle evidence shared by both canonical submission types.
create table if not exists public.bridge_owner_submission_events (
  id bigserial primary key,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  submission_kind text not null
    check (submission_kind in ('finished_film', 'story_concept')),
  action text not null
    check (action in ('SUBMITTED', 'RESUBMITTED', 'ACCEPTED_INTAKE', 'REQUEST_CHANGES')),
  from_status text,
  to_status text not null
    check (to_status in ('DRAFT', 'SUBMITTED', 'NEEDS_CORRECTION', 'ACCEPTED_INTAKE')),
  actor_user_id text not null references public.bridge_profiles(user_id),
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

-- Prevent accidental history rewrites/deletes, including by ordinary server paths.
create or replace function public.bridge_reject_owner_submission_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  raise exception 'Owner submission history is append-only';
end;
$function$;

revoke all on function public.bridge_reject_owner_submission_event_mutation() from public, anon, authenticated;

drop trigger if exists bridge_owner_submission_events_immutable on public.bridge_owner_submission_events;
create trigger bridge_owner_submission_events_immutable
before update or delete on public.bridge_owner_submission_events
for each row execute function public.bridge_reject_owner_submission_event_mutation();
