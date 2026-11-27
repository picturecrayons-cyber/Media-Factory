-- Studio Production Management: project-level crew and schedule support.
-- Additive schema change. Apply to Testing first; do not run against Production.
-- Existing DIT project/shoot-day linkage and OCI verification tables are reused.

alter table public.bridge_production_projects
  add constraint bridge_production_projects_id_organization_key
  unique (id, organization_id);

alter table public.bridge_production_schedule_events
  add column if not exists project_id uuid;

alter table public.bridge_production_schedule_events
  alter column title_id drop not null;

alter table public.bridge_production_schedule_events
  add constraint bridge_production_schedule_events_project_org_fkey
  foreign key (project_id, organization_id)
  references public.bridge_production_projects (id, organization_id)
  on delete restrict;

alter table public.bridge_production_schedule_events
  add constraint bridge_production_schedule_events_parent_check
  check (
    (project_id is not null and title_id is null)
    or (project_id is null and title_id is not null)
  );

alter table public.bridge_production_schedule_events
  drop constraint if exists bridge_production_schedule_events_event_type_check;

alter table public.bridge_production_schedule_events
  add constraint bridge_production_schedule_events_event_type_check
  check (event_type in (
    'PRE_PRODUCTION', 'SHOOT_DAY', 'WRAP', 'DIT_HANDOFF',
    'POST_PRODUCTION', 'DELIVERY', 'MILESTONE', 'OTHER'
  ));

create index if not exists bridge_production_schedule_project_start_idx
  on public.bridge_production_schedule_events (project_id, starts_at)
  where project_id is not null;

create table if not exists public.bridge_production_project_crew (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  role text not null check (length(trim(role)) between 2 and 120),
  department text check (department is null or length(department) <= 120),
  notes text check (notes is null or length(notes) <= 2000),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  updated_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_production_project_crew_project_org_fkey
    foreign key (project_id, organization_id)
    references public.bridge_production_projects (id, organization_id)
    on delete restrict
);

create unique index if not exists bridge_production_project_crew_identity_uidx
  on public.bridge_production_project_crew (project_id, lower(full_name), lower(role));

create index if not exists bridge_production_project_crew_org_project_idx
  on public.bridge_production_project_crew (organization_id, project_id, status);

alter table public.bridge_production_project_crew enable row level security;
revoke all privileges on table public.bridge_production_project_crew from public, anon, authenticated;
grant all privileges on table public.bridge_production_project_crew to service_role;
