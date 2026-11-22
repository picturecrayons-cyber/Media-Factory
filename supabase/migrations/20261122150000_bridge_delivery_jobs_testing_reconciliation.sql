-- Reconcile the pre-ledger Delivery Desk baseline in Testing.
-- The table is empty in this environment; this migration creates schema only.
-- Production is not modified by this execution.

create table if not exists public.bridge_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  job_type text not null
    constraint bridge_delivery_jobs_job_type_check
    check (job_type in ('dubbing','loudness','imf','dcp','human_qc','localization')),
  status text not null default 'requested'
    constraint bridge_delivery_jobs_status_check
    check (status in ('requested','in_progress','completed','failed','approved')),
  assigned_vendor text,
  delivery_receipt_url text,
  admin_sign_off boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bridge_delivery_jobs_status_idx
  on public.bridge_delivery_jobs(status);
create index if not exists bridge_delivery_jobs_title_id_idx
  on public.bridge_delivery_jobs(title_id);

alter table public.bridge_delivery_jobs
  add column if not exists requested_by text,
  add column if not exists request_note text;

create index if not exists bridge_delivery_jobs_requested_by_idx
  on public.bridge_delivery_jobs(requested_by,created_at desc);

comment on column public.bridge_delivery_jobs.requested_by is
  'Verified Bridge user who requested the delivery job; used for account-scoped read access.';
comment on column public.bridge_delivery_jobs.request_note is
  'Requester-supplied delivery instructions; must not contain secrets or credentials.';

alter table public.bridge_delivery_jobs enable row level security;
revoke all on table public.bridge_delivery_jobs from public, anon, authenticated;
grant select, insert, update on table public.bridge_delivery_jobs to authenticated;
grant all on table public.bridge_delivery_jobs to postgres, service_role;

do $delivery_policy$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid='public.bridge_delivery_jobs'::regclass
      and polname='bridge_delivery_jobs_internal_only'
  ) then
    if to_regprocedure('public.bridge_current_internal_role()') is null then
      raise exception 'Internal role helper is missing; refusing to create an unsafe Delivery Desk policy';
    end if;
    execute $policy$
      create policy bridge_delivery_jobs_internal_only
      on public.bridge_delivery_jobs
      for all to authenticated
      using ((select public.bridge_current_internal_role()) is not null)
      with check ((select public.bridge_current_internal_role()) is not null)
    $policy$;
  end if;
end
$delivery_policy$;
