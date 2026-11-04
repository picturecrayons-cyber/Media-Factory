-- STAGING-first persistent vendor delivery workflow.
-- Additive schema only. This migration is a reviewed source artifact; it has NOT
-- been applied to STAGING or PRODUCTION. Apply only after explicit approval.
create table if not exists public.bridge_vendor_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.bridge_organizations(id) on delete restrict,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  job_type text not null check (job_type in ('dubbing','loudness_check','imf_request','dcp_request','human_qc')),
  state text not null default 'requested'
    check (state in ('requested','assigned','in_progress','in_review','blocked','signed_off','cancelled')),
  note text not null default '',
  requested_by text not null,
  idempotency_key uuid not null default gen_random_uuid() unique,
  assigned_vendor text,
  assigned_by text,
  assigned_at timestamptz,
  signed_off_by text,
  signed_off_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_vendor_jobs_assignment_pair_chk
    check ((assigned_vendor is null and assigned_by is null and assigned_at is null)
        or (assigned_vendor is not null and assigned_by is not null and assigned_at is not null)),
  constraint bridge_vendor_jobs_signoff_pair_chk
    check ((state <> 'signed_off') or (signed_off_by is not null and signed_off_at is not null))
);

create index if not exists bridge_vendor_jobs_org_created_idx
  on public.bridge_vendor_jobs (organization_id, created_at desc);
create index if not exists bridge_vendor_jobs_title_created_idx
  on public.bridge_vendor_jobs (title_id, created_at desc);
create index if not exists bridge_vendor_jobs_state_created_idx
  on public.bridge_vendor_jobs (state, created_at desc);

create table if not exists public.bridge_vendor_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bridge_vendor_jobs(id) on delete restrict,
  actor_user_id text not null,
  event_type text not null,
  from_state text,
  to_state text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bridge_vendor_job_events_job_created_idx
  on public.bridge_vendor_job_events (job_id, created_at asc);

alter table public.bridge_vendor_jobs enable row level security;
alter table public.bridge_vendor_job_events enable row level security;
revoke all privileges on table public.bridge_vendor_jobs from public, anon, authenticated;
revoke all privileges on table public.bridge_vendor_job_events from public, anon, authenticated;

-- Close the previously observed direct Data API grant on destination packages.
-- Server-side Bridge handlers remain the only intended write path.
alter table public.bridge_destination_packages enable row level security;
revoke all privileges on table public.bridge_destination_packages from public, anon, authenticated;
