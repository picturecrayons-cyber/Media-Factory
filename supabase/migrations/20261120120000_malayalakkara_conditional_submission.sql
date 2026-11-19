-- One-time conditional submission intake for the existing Malayalakkara Residency title.
-- This records a request only. It does not approve rights, alter title/grant/legal state,
-- authorize sublicensing, or publish to any destination.
create table if not exists public.bridge_conditional_submissions (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  submission_kind text not null check (submission_kind = 'CONDITIONAL_LEGAL_VERIFICATION'),
  status text not null default 'PENDING_LEGAL_VERIFICATION'
    check (status = 'PENDING_LEGAL_VERIFICATION'),
  submitted_by uuid not null,
  submitted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint bridge_conditional_submissions_malayalakkara_only
    check (title_id = '858f0ec5a11bc9acd2e9c20266541a3a'),
  constraint bridge_conditional_submissions_one_time_per_title
    unique (title_id, submission_kind)
);
alter table public.bridge_conditional_submissions enable row level security;
revoke all on table public.bridge_conditional_submissions from anon, authenticated;
grant select, insert on table public.bridge_conditional_submissions to service_role;
