
-- Reversible archive and owner-submission lifecycle repair.
-- Forward-only additive repair for the Testing lineage. Never hard-delete data.
alter table public.bridge_titles
  add column if not exists previous_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.bridge_titles'::regclass
      and conname='bridge_titles_archive_state_check'
  ) then
    alter table public.bridge_titles
      add constraint bridge_titles_archive_state_check
      check (
        (archived_at is null and archived_by is null and archive_reason is null and previous_status is null)
        or (archived_at is not null and archived_by is not null
            and length(btrim(archive_reason)) between 3 and 2000
            and previous_status is not null)
      ) not valid;
  end if;
end $$;

create index if not exists bridge_titles_active_owner_updated_idx
  on public.bridge_titles(owner_user_id, updated_at desc)
  where archived_at is null;
create index if not exists bridge_titles_archived_owner_updated_idx
  on public.bridge_titles(owner_user_id, archived_at desc)
  where archived_at is not null;

alter table public.bridge_title_owner_submissions
  drop constraint if exists bridge_title_owner_submissions_submission_status_check;
alter table public.bridge_title_owner_submissions
  add constraint bridge_title_owner_submissions_submission_status_check
  check (submission_status in ('DRAFT','SUBMITTED','NEEDS_CORRECTION','ACCEPTED_INTAKE','WITHDRAWN','REJECTED'))
  not valid;

alter table public.bridge_owner_submission_events
  drop constraint if exists bridge_owner_submission_events_action_check;
alter table public.bridge_owner_submission_events
  add constraint bridge_owner_submission_events_action_check
  check (action in ('SUBMITTED','RESUBMITTED','ACCEPTED_INTAKE','REQUEST_CHANGES','WITHDRAWN','REJECTED','ARCHIVED','RESTORED'))
  not valid;

alter table public.bridge_owner_submission_events
  drop constraint if exists bridge_owner_submission_events_to_status_check;
alter table public.bridge_owner_submission_events
  add constraint bridge_owner_submission_events_to_status_check
  check (to_status in ('DRAFT','SUBMITTED','NEEDS_CORRECTION','ACCEPTED_INTAKE','WITHDRAWN','REJECTED','ARCHIVED'))
  not valid;

alter table public.bridge_story_concept_submissions
  drop constraint if exists bridge_story_concept_owner_submission_owner_submission_status_check;
alter table public.bridge_story_concept_submissions
  add constraint bridge_story_concept_owner_submission_owner_submission_status_check
  check (owner_submission_status in ('DRAFT','SUBMITTED','NEEDS_CORRECTION','ACCEPTED_INTAKE','WITHDRAWN','REJECTED'))
  not valid;

create table if not exists public.bridge_title_archive_events (
  id bigserial primary key,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  action text not null check (action in ('ARCHIVED','RESTORED')),
  actor_user_id text not null references public.bridge_profiles(user_id),
  actor_role text not null,
  organization_id uuid,
  previous_state jsonb not null,
  new_state jsonb not null,
  reason text not null check (length(btrim(reason)) between 3 and 2000),
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists bridge_title_archive_events_title_created_idx
  on public.bridge_title_archive_events(title_id, created_at desc);

alter table public.bridge_title_archive_events enable row level security;
revoke all on table public.bridge_title_archive_events from public, anon, authenticated;
grant all on table public.bridge_title_archive_events to postgres, service_role;

create or replace function public.bridge_reject_title_archive_event_mutation()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception 'Title archive event ledger is append-only';
end $$;
revoke all on function public.bridge_reject_title_archive_event_mutation() from public, anon, authenticated;
drop trigger if exists bridge_title_archive_events_immutable on public.bridge_title_archive_events;
create trigger bridge_title_archive_events_immutable
before update or delete on public.bridge_title_archive_events
for each row execute function public.bridge_reject_title_archive_event_mutation();

-- Owner submission events retain their existing immutable trigger.
