-- Organization-scoped Studio production calendar.
-- Access is through verified server actions; browser roles receive no direct table privileges.
create table if not exists public.bridge_production_schedule_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bridge_organizations(id) on delete restrict,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  event_type text not null check (
    event_type in ('PRE_PRODUCTION', 'SHOOT_DAY', 'WRAP', 'DIT_HANDOFF', 'POST_PRODUCTION', 'DELIVERY', 'OTHER')
  ),
  event_name text not null check (length(trim(event_name)) between 1 and 180),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  notes text,
  status text not null default 'SCHEDULED' check (
    status in ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
  ),
  created_by text not null references public.bridge_profiles(user_id) on delete restrict,
  updated_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (location is null or length(location) <= 240),
  check (notes is null or length(notes) <= 4000)
);

create index if not exists bridge_production_schedule_org_start_idx
  on public.bridge_production_schedule_events (organization_id, starts_at);

create index if not exists bridge_production_schedule_title_start_idx
  on public.bridge_production_schedule_events (title_id, starts_at);

alter table public.bridge_production_schedule_events enable row level security;
alter table public.bridge_production_schedule_events force row level security;
revoke all privileges on table public.bridge_production_schedule_events from public, anon, authenticated;
