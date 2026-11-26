-- Production-first DIT lifecycle. Additive and backward-compatible for existing title-linked ingest sessions.
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
create unique index if not exists bridge_production_projects_org_code_uidx
  on public.bridge_production_projects(organization_id, lower(project_code))
  where project_code is not null and length(trim(project_code)) > 0;
create index if not exists bridge_production_projects_org_updated_idx
  on public.bridge_production_projects(organization_id, updated_at desc);

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
  unique(project_id, shoot_date)
);
create index if not exists bridge_production_shoot_days_project_date_idx
  on public.bridge_production_shoot_days(project_id, shoot_date);

create table if not exists public.bridge_production_title_links (
  id uuid primary key default gen_random_uuid(),
  production_project_id uuid not null references public.bridge_production_projects(id) on delete restrict,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  link_type text not null check (link_type in ('FINISHED_FILM_OUTPUT')),
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(production_project_id, title_id, link_type)
);
create index if not exists bridge_production_title_links_title_idx
  on public.bridge_production_title_links(title_id);

alter table public.bridge_dit_ingest_sessions
  alter column title_id drop not null,
  add column if not exists production_project_id uuid,
  add column if not exists shoot_day_id uuid;
alter table public.bridge_dit_ingest_sessions
  add constraint bridge_dit_ingest_sessions_project_fk
    foreign key (production_project_id) references public.bridge_production_projects(id) on delete restrict,
  add constraint bridge_dit_ingest_sessions_shoot_day_fk
    foreign key (shoot_day_id) references public.bridge_production_shoot_days(id) on delete restrict;
create index if not exists bridge_dit_ingest_sessions_project_created_idx
  on public.bridge_dit_ingest_sessions(production_project_id, created_at desc);
create index if not exists bridge_dit_ingest_sessions_shoot_day_idx
  on public.bridge_dit_ingest_sessions(shoot_day_id);

alter table public.bridge_production_projects enable row level security;
alter table public.bridge_production_projects force row level security;
alter table public.bridge_production_shoot_days enable row level security;
alter table public.bridge_production_shoot_days force row level security;
alter table public.bridge_production_title_links enable row level security;
alter table public.bridge_production_title_links force row level security;
revoke all privileges on table public.bridge_production_projects from public, anon, authenticated;
revoke all privileges on table public.bridge_production_shoot_days from public, anon, authenticated;
revoke all privileges on table public.bridge_production_title_links from public, anon, authenticated;
