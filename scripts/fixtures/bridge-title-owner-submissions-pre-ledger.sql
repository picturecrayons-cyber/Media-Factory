-- Verified empty pre-ledger Production baseline for owner-provided title submissions.
-- Used only by the local migration replay; no Production rows are copied.
create table if not exists public.bridge_title_owner_submissions (
  id text primary key,
  title_id text not null unique references public.bridge_titles(id) on delete cascade,
  owner_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  owner_organization_id uuid,
  details jsonb not null default '{}'::jsonb,
  submission_status text not null default 'DRAFT'
    check (submission_status in ('DRAFT','SUBMITTED','NEEDS_CORRECTION')),
  submitted_at timestamptz,
  submitted_by text references public.bridge_profiles(user_id) on delete restrict,
  updated_by text not null references public.bridge_profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_title_owner_submissions_org_fk
    foreign key (owner_organization_id) references public.bridge_organizations(id) on delete restrict
);
create index if not exists bridge_title_owner_submissions_status_idx
  on public.bridge_title_owner_submissions(submission_status,updated_at desc);
create index if not exists bridge_title_owner_submissions_owner_idx
  on public.bridge_title_owner_submissions(owner_user_id,updated_at desc);
alter table public.bridge_title_owner_submissions enable row level security;
revoke all on table public.bridge_title_owner_submissions from anon,authenticated;
grant select,insert,update on table public.bridge_title_owner_submissions to service_role;
