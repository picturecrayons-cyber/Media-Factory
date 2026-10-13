-- Persistent Bridge vendor delivery requests.
-- Additive only. This file is reviewed in a feature branch; do not apply to production
-- until the normal migration and release gates are explicitly approved.

create table if not exists public.bridge_vendor_jobs (
  id text primary key,
  title_id text not null references public.bridge_titles(id) on delete cascade,
  job_type text not null check (job_type in ('dubbing','loudness_check','imf_request','dcp_request','human_qc')),
  state text not null default 'requested'
    check (state in ('requested','in_review','blocked','signed_off')),
  note text not null default '',
  requested_by text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state <> 'signed_off') or (reviewed_by is not null and reviewed_at is not null))
);

create index if not exists bridge_vendor_jobs_title_created_idx
  on public.bridge_vendor_jobs(title_id, created_at desc);
create index if not exists bridge_vendor_jobs_state_created_idx
  on public.bridge_vendor_jobs(state, created_at desc);

alter table public.bridge_vendor_jobs enable row level security;
revoke all on public.bridge_vendor_jobs from anon, authenticated;
-- Server-side Bridge handlers are authoritative; intentionally no browser policies.
