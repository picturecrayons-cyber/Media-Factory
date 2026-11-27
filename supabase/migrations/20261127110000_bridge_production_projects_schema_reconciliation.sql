-- Reconcile the Testing-only Production project schema into versioned source.
-- Reconstructed from read-only catalog metadata for migration 20261126221143.
-- All tables are server-only. No project, shoot, schedule or asset rows are seeded.
-- CREATE IF NOT EXISTS keeps this additive on environments where the schema exists.

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
  check (planned_start_date is null or planned_end_date is null or planned_end_date >= planned_start_date)
);
create index if not exists bridge_production_projects_created_by_idx
  on public.bridge_production_projects (created_by);
create unique index if not exists bridge_production_projects_org_code_uidx
  on public.bridge_production_projects (organization_id, lower(project_code))
  where project_code is not null and length(trim(project_code)) > 0;
create index if not exists bridge_production_projects_org_updated_idx
  on public.bridge_production_projects (organization_id, updated_at desc);
create index if not exists bridge_production_projects_updated_by_idx
  on public.bridge_production_projects (updated_by);

create table if not exists public.bridge_production_schedule_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bridge_organizations(id) on delete restrict,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  event_type text not null
    check (event_type in ('PRE_PRODUCTION','SHOOT_DAY','WRAP','DIT_HANDOFF','POST_PRODUCTION','DELIVERY','OTHER')),
  event_name text not null
    check (length(trim(event_name)) between 1 and 180),
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
  unique (id, project_id),
  unique (project_id, shoot_date)
);
create index if not exists bridge_production_shoot_days_created_by_idx
  on public.bridge_production_shoot_days (created_by);
create index if not exists bridge_production_shoot_days_project_date_idx
  on public.bridge_production_shoot_days (project_id, shoot_date);
create index if not exists bridge_production_shoot_days_updated_by_idx
  on public.bridge_production_shoot_days (updated_by);

create table if not exists public.bridge_production_shoots (
  title_id text primary key references public.bridge_titles(id) on delete restrict,
  production_no text not null
    check (length(btrim(production_no)) between 2 and 80),
  production_title text not null
    check (length(btrim(production_title)) between 2 and 200),
  production_format text not null default 'FEATURE'
    check (production_format in ('FEATURE','SERIES','SHORT','DOCUMENTARY','ADVERTISEMENT','OTHER')),
  development_stage text not null default 'PRE_PRODUCTION'
    check (development_stage in ('DEVELOPMENT','PRE_PRODUCTION','PRINCIPAL_PHOTOGRAPHY','POST_PRODUCTION','ON_HOLD','COMPLETED')),
  planned_start_date date,
  planned_end_date date,
  shoot_days integer check (shoot_days is null or shoot_days between 1 and 1000),
  primary_location text,
  producer_name text,
  director_name text,
  crew jsonb not null default '[]'::jsonb,
  shoot_progress text not null default 'NOT_STARTED'
    check (shoot_progress in ('NOT_STARTED','IN_PROGRESS','WRAPPED','ON_HOLD')),
  media_handover_status text not null default 'NOT_STARTED'
    check (media_handover_status in ('NOT_STARTED','IN_PROGRESS','PARTIAL','COMPLETE','QC_PENDING')),
  production_notes text,
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  updated_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_end_date is null or planned_start_date is null or planned_end_date >= planned_start_date)
);
create index if not exists bridge_production_shoots_stage_idx
  on public.bridge_production_shoots (development_stage, updated_at desc);

create table if not exists public.bridge_production_title_links (
  id uuid primary key default gen_random_uuid(),
  production_project_id uuid not null references public.bridge_production_projects(id) on delete restrict,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  link_type text not null check (link_type = 'FINISHED_FILM_OUTPUT'),
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (production_project_id, title_id, link_type)
);
create index if not exists bridge_production_title_links_created_by_idx
  on public.bridge_production_title_links (created_by);
create unique index if not exists bridge_production_title_links_one_project_per_output_uidx
  on public.bridge_production_title_links (title_id)
  where link_type = 'FINISHED_FILM_OUTPUT';
create index if not exists bridge_production_title_links_title_idx
  on public.bridge_production_title_links (title_id);

alter table public.bridge_production_projects enable row level security;
alter table public.bridge_production_schedule_events enable row level security;
alter table public.bridge_production_shoot_days enable row level security;
alter table public.bridge_production_shoots enable row level security;
alter table public.bridge_production_title_links enable row level security;

do $policies$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.bridge_production_schedule_events'::regclass
      and polname = 'deny_browser_access'
  ) then
    create policy deny_browser_access on public.bridge_production_schedule_events
      for all to anon, authenticated using (false) with check (false);
  end if;
end
$policies$;

revoke all on table public.bridge_production_projects from public, anon, authenticated;
revoke all on table public.bridge_production_schedule_events from public, anon, authenticated;
revoke all on table public.bridge_production_shoot_days from public, anon, authenticated;
revoke all on table public.bridge_production_shoots from public, anon, authenticated;
revoke all on table public.bridge_production_title_links from public, anon, authenticated;
grant all on table public.bridge_production_projects to service_role;
grant all on table public.bridge_production_schedule_events to service_role;
grant all on table public.bridge_production_shoot_days to service_role;
grant all on table public.bridge_production_shoots to service_role;
grant all on table public.bridge_production_title_links to service_role;
