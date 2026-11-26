-- Three distinct owner submission lanes: finished film, story/concept, production shoot.
-- Production-shoot records are structured separately from finished-film rights/QC records.
alter table public.bridge_titles
  drop constraint if exists bridge_titles_submission_type_check;
alter table public.bridge_titles
  add constraint bridge_titles_submission_type_check
  check (submission_type = any (array['finished_film'::text, 'story_concept'::text, 'production_shoot'::text]));

alter table public.bridge_owner_submission_events
  drop constraint if exists bridge_owner_submission_events_submission_kind_check;
alter table public.bridge_owner_submission_events
  add constraint bridge_owner_submission_events_submission_kind_check
  check (submission_kind = any (array['finished_film'::text, 'story_concept'::text, 'production_shoot'::text]));

create table if not exists public.bridge_production_shoots (
  title_id text primary key references public.bridge_titles(id) on delete restrict,
  production_no text not null,
  production_title text not null,
  production_format text not null default 'FEATURE',
  development_stage text not null default 'PRE_PRODUCTION',
  planned_start_date date,
  planned_end_date date,
  shoot_days integer,
  primary_location text,
  producer_name text,
  director_name text,
  crew jsonb not null default '[]'::jsonb,
  shoot_progress text not null default 'NOT_STARTED',
  media_handover_status text not null default 'NOT_STARTED',
  production_notes text,
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  updated_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_production_shoots_no_length check (length(btrim(production_no)) between 2 and 80),
  constraint bridge_production_shoots_title_length check (length(btrim(production_title)) between 2 and 200),
  constraint bridge_production_shoots_format_check check (production_format in ('FEATURE','SERIES','SHORT','DOCUMENTARY','ADVERTISEMENT','OTHER')),
  constraint bridge_production_shoots_stage_check check (development_stage in ('DEVELOPMENT','PRE_PRODUCTION','PRINCIPAL_PHOTOGRAPHY','POST_PRODUCTION','ON_HOLD','COMPLETED')),
  constraint bridge_production_shoots_dates_check check (planned_end_date is null or planned_start_date is null or planned_end_date >= planned_start_date),
  constraint bridge_production_shoots_days_check check (shoot_days is null or shoot_days between 1 and 1000),
  constraint bridge_production_shoots_progress_check check (shoot_progress in ('NOT_STARTED','IN_PROGRESS','WRAPPED','ON_HOLD')),
  constraint bridge_production_shoots_handover_check check (media_handover_status in ('NOT_STARTED','IN_PROGRESS','PARTIAL','COMPLETE','QC_PENDING'))
);

create unique index if not exists bridge_production_shoots_production_no_owner_uidx
  on public.bridge_production_shoots (production_no, title_id);

create index if not exists bridge_production_shoots_stage_idx
  on public.bridge_production_shoots (development_stage, updated_at desc);

alter table public.bridge_production_shoots enable row level security;
revoke all on public.bridge_production_shoots from anon, authenticated;
