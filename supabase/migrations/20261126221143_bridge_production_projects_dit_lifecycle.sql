-- Canonical Studio Production project and DIT lifecycle schema.
-- This migration reconstructs the Testing schema baseline for clean migration replay.
-- Server-only access: no browser-role grants or RLS policies are added.

create table if not exists public.bridge_production_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bridge_organizations(id) on delete restrict,
  name text not null check (length(trim(name)) >= 2),
  project_code text,
  production_type text not null default 'FEATURE'
    check (production_type in ('FEATURE','SHORT','SERIES','DOCUMENTARY','OTHER')),
  status text not null default 'PRE_PRODUCTION'
    check (status in ('PRE_PRODUCTION','IN_PRODUCTION','WRAP','POST_PRODUCTION','COMPLETED','ON_HOLD')),
  planned_start_date date,
  planned_end_date date,
  primary_location text,
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  updated_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_start_date is null or planned_end_date is null or planned_end_date >= planned_start_date),
  constraint bridge_production_projects_id_organization_key unique (id, organization_id)
);

create unique index if not exists bridge_production_projects_org_code_uidx
  on public.bridge_production_projects (organization_id, lower(project_code))
  where project_code is not null and length(trim(project_code)) > 0;
create index if not exists bridge_production_projects_org_updated_idx
  on public.bridge_production_projects (organization_id, updated_at desc);
create index if not exists bridge_production_projects_created_by_idx
  on public.bridge_production_projects (created_by);
create index if not exists bridge_production_projects_updated_by_idx
  on public.bridge_production_projects (updated_by);

create table if not exists public.bridge_production_shoot_days (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bridge_production_projects(id) on delete restrict,
  shoot_date date not null,
  day_label text,
  location text,
  notes text,
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  updated_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, shoot_date),
  unique (id, project_id)
);
create index if not exists bridge_production_shoot_days_project_date_idx
  on public.bridge_production_shoot_days (project_id, shoot_date);
create index if not exists bridge_production_shoot_days_created_by_idx
  on public.bridge_production_shoot_days (created_by);
create index if not exists bridge_production_shoot_days_updated_by_idx
  on public.bridge_production_shoot_days (updated_by);

create table if not exists public.bridge_production_schedule_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bridge_organizations(id) on delete restrict,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  event_type text not null
    check (event_type in ('PRE_PRODUCTION','SHOOT_DAY','WRAP','DIT_HANDOFF','POST_PRODUCTION','DELIVERY','OTHER')),
  event_name text not null check (length(trim(event_name)) between 1 and 180),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  location text check (location is null or length(location) <= 240),
  notes text check (notes is null or length(notes) <= 4000),
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  updated_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bridge_production_schedule_org_start_idx
  on public.bridge_production_schedule_events (organization_id, starts_at);
create index if not exists bridge_production_schedule_title_start_idx
  on public.bridge_production_schedule_events (title_id, starts_at);

create table if not exists public.bridge_production_title_links (
  id uuid primary key default gen_random_uuid(),
  production_project_id uuid not null references public.bridge_production_projects(id) on delete restrict,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  link_type text not null check (link_type = 'FINISHED_FILM_OUTPUT'),
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (production_project_id, title_id, link_type)
);

alter table public.bridge_dit_ingest_sessions
  alter column title_id drop not null;
alter table public.bridge_dit_ingest_sessions
  add column if not exists production_project_id uuid;
alter table public.bridge_dit_ingest_sessions
  add column if not exists shoot_day_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bridge_dit_ingest_sessions_project_day_pair_check') then
    alter table public.bridge_dit_ingest_sessions
      add constraint bridge_dit_ingest_sessions_project_day_pair_check
      check ((production_project_id is null) = (shoot_day_id is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bridge_dit_ingest_sessions_project_fk') then
    alter table public.bridge_dit_ingest_sessions
      add constraint bridge_dit_ingest_sessions_project_fk
      foreign key (production_project_id) references public.bridge_production_projects(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bridge_dit_ingest_sessions_shoot_day_project_fk') then
    alter table public.bridge_dit_ingest_sessions
      add constraint bridge_dit_ingest_sessions_shoot_day_project_fk
      foreign key (shoot_day_id, production_project_id)
      references public.bridge_production_shoot_days(id, project_id) on delete restrict;
  end if;
end $$;

create index if not exists bridge_dit_ingest_sessions_project_created_idx
  on public.bridge_dit_ingest_sessions (production_project_id, created_at desc);
create index if not exists bridge_dit_ingest_sessions_shoot_day_idx
  on public.bridge_dit_ingest_sessions (shoot_day_id, production_project_id);
create index if not exists bridge_dit_ingest_sessions_created_by_idx
  on public.bridge_dit_ingest_sessions (created_by);
create index if not exists bridge_dit_ingest_sessions_signed_off_by_idx
  on public.bridge_dit_ingest_sessions (signed_off_by)
  where signed_off_by is not null;

alter table public.bridge_production_projects enable row level security;
alter table public.bridge_production_shoot_days enable row level security;
alter table public.bridge_production_schedule_events enable row level security;
alter table public.bridge_production_title_links enable row level security;
revoke all privileges on table public.bridge_production_projects from public, anon, authenticated;
revoke all privileges on table public.bridge_production_shoot_days from public, anon, authenticated;
revoke all privileges on table public.bridge_production_schedule_events from public, anon, authenticated;
revoke all privileges on table public.bridge_production_title_links from public, anon, authenticated;
grant all privileges on table public.bridge_production_projects to service_role;
grant all privileges on table public.bridge_production_shoot_days to service_role;
grant all privileges on table public.bridge_production_schedule_events to service_role;
grant all privileges on table public.bridge_production_title_links to service_role;
