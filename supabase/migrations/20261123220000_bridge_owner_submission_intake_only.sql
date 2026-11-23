-- Narrow Bridge owner-submission intake schema.
-- Source-only migration: do not apply to hosted databases without a separate approval.
-- Owner intake remains independent from QC, Rights, Legal, Licensing and Loop publication.

create table if not exists public.bridge_title_owner_submissions (
  id text primary key,
  title_id text not null unique references public.bridge_titles(id) on delete cascade,
  owner_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  owner_organization_id uuid,
  details jsonb not null default '{}'::jsonb,
  submission_status text not null default 'DRAFT'
    check (submission_status in ('DRAFT', 'SUBMITTED', 'NEEDS_CORRECTION', 'ACCEPTED_INTAKE', 'WITHDRAWN', 'REJECTED', 'ARCHIVED')),
  submitted_at timestamptz,
  submitted_by text references public.bridge_profiles(user_id) on delete restrict,
  updated_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_title_owner_submissions_org_fk
    foreign key (owner_organization_id) references public.bridge_organizations(id) on delete restrict
);

create index if not exists bridge_title_owner_submissions_status_idx
  on public.bridge_title_owner_submissions(submission_status, submitted_at);

create table if not exists public.bridge_owner_submission_events (
  id bigserial primary key,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  submission_kind text not null check (submission_kind = 'finished_film'),
  action text not null check (action in ('SUBMITTED', 'RESUBMITTED', 'ACCEPTED_INTAKE', 'REQUEST_CHANGES', 'WITHDRAWN', 'REJECTED', 'ARCHIVED', 'RESTORED')),
  from_status text check (from_status is null or from_status in ('DRAFT', 'NEEDS_CORRECTION', 'SUBMITTED', 'ACCEPTED_INTAKE', 'WITHDRAWN', 'REJECTED', 'ARCHIVED')),
  to_status text not null check (to_status in ('DRAFT', 'SUBMITTED', 'NEEDS_CORRECTION', 'ACCEPTED_INTAKE', 'WITHDRAWN', 'REJECTED', 'ARCHIVED')),
  actor_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  constraint bridge_owner_submission_events_reason_check
    check (reason is null or length(reason) <= 2000)
);

create index if not exists bridge_owner_submission_events_title_created_idx
  on public.bridge_owner_submission_events(title_id, created_at desc);

alter table public.bridge_title_owner_submissions enable row level security;
revoke all on table public.bridge_title_owner_submissions from public, anon, authenticated;
grant select, insert, update on table public.bridge_title_owner_submissions to postgres, service_role;

alter table public.bridge_owner_submission_events enable row level security;
revoke all on table public.bridge_owner_submission_events from public, anon, authenticated, service_role;
grant select, insert on table public.bridge_owner_submission_events to service_role;
revoke all on sequence public.bridge_owner_submission_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.bridge_owner_submission_events_id_seq to service_role;

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

