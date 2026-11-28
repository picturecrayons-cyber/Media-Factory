-- Production workspace foundation: project-owned milestones and crew roster.
-- Additive and safe for existing rows. Server-only tables remain unavailable to browser roles.

alter table public.bridge_production_projects
  add constraint bridge_production_projects_id_organization_key
  unique (id, organization_id);

create unique index bridge_production_projects_org_code_unique
  on public.bridge_production_projects (organization_id, lower(project_code))
  where project_code is not null and length(trim(project_code)) > 0;

create table public.bridge_production_crew_members (
  id uuid primary key default gen_random_uuid(),
  production_project_id uuid not null,
  organization_id uuid not null references public.bridge_organizations(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  department text not null check (length(trim(department)) between 2 and 100),
  role_title text not null check (length(trim(role_title)) between 2 and 120),
  engagement_status text not null default 'PLANNED'
    check (engagement_status in ('PLANNED', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'RELEASED')),
  notes text check (notes is null or length(notes) <= 2000),
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  updated_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_production_crew_members_project_org_fk
    foreign key (production_project_id, organization_id)
    references public.bridge_production_projects(id, organization_id) on delete restrict
);

create unique index bridge_production_crew_members_identity_unique
  on public.bridge_production_crew_members (
    production_project_id, lower(full_name), lower(department), lower(role_title)
  );

create index bridge_production_crew_members_org_project_idx
  on public.bridge_production_crew_members (organization_id, production_project_id, created_at desc);

-- Milestones can belong to a Production Project without creating a placeholder Finished Film.
-- Existing title-linked schedule events remain valid.
alter table public.bridge_production_schedule_events
  alter column title_id drop not null,
  add column project_id uuid;

alter table public.bridge_production_schedule_events
  add constraint bridge_production_schedule_events_project_org_fk
    foreign key (project_id, organization_id)
    references public.bridge_production_projects(id, organization_id) on delete restrict,
  add constraint bridge_production_schedule_events_parent_check
    check (project_id is not null or title_id is not null);

create index bridge_production_schedule_events_project_time_idx
  on public.bridge_production_schedule_events (project_id, starts_at)
  where project_id is not null;

create unique index bridge_production_schedule_events_project_dedupe_idx
  on public.bridge_production_schedule_events (project_id, lower(event_name), starts_at)
  where project_id is not null;

-- DIT sessions may be either legacy title-linked sessions or Production Project + Shoot Day sessions.
-- A project-linked session must carry both project and shoot-day references; title_id is optional.
alter table public.bridge_dit_ingest_sessions
  add constraint bridge_dit_ingest_sessions_valid_parent_check
  check (
    (production_project_id is null and shoot_day_id is null and title_id is not null)
    or
    (production_project_id is not null and shoot_day_id is not null)
  );

alter table public.bridge_production_crew_members enable row level security;
revoke all privileges on table public.bridge_production_crew_members from public, anon, authenticated;

-- Keep all production operations server-authorized, consistent with existing Bridge server-only access.
drop policy if exists deny_browser_access on public.bridge_production_crew_members;
create policy deny_browser_access
  on public.bridge_production_crew_members
  for all
  to anon, authenticated
  using (false)
  with check (false);
