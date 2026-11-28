-- Investor access is request/review/invitation based. No investor workspace is
-- created until a Super Admin approves the request and the applicant accepts
-- a verified, email-bound invitation.
alter table public.bridge_invites
  alter column internal_role drop not null;

alter table public.bridge_invites
  add column if not exists account_type text;

alter table public.bridge_invites
  drop constraint if exists bridge_invites_grant_shape_chk;

alter table public.bridge_invites
  add constraint bridge_invites_grant_shape_chk
  check (
    (internal_role is not null and account_type is null
      and internal_role in ('admin','super_admin','qc_reviewer','legal_reviewer','finance','viewer'))
    or
    (internal_role is null and account_type = 'investor')
  );

create table if not exists public.bridge_investor_access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  organization_name text not null,
  investor_type text not null check (investor_type in ('individual','firm','fund','other')),
  website text,
  purpose text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','REJECTED')),
  review_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  invite_id text references public.bridge_invites(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_investor_access_review_chk check (
    (status = 'PENDING' and reviewed_by is null and reviewed_at is null and invite_id is null)
    or (status = 'REJECTED' and reviewed_by is not null and reviewed_at is not null and invite_id is null)
    or (status = 'APPROVED' and reviewed_by is not null and reviewed_at is not null and invite_id is not null)
  )
);

create index if not exists bridge_investor_access_status_created_idx
  on public.bridge_investor_access_requests(status, created_at desc);
create unique index if not exists bridge_investor_access_one_open_email_idx
  on public.bridge_investor_access_requests(lower(email))
  where status in ('PENDING','APPROVED');

alter table public.bridge_investor_access_requests enable row level security;
revoke all on public.bridge_investor_access_requests from anon, authenticated;
