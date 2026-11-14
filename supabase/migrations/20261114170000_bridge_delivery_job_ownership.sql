-- Persist requester identity and request notes for Bridge delivery workflows.
alter table public.bridge_delivery_jobs
  add column if not exists requested_by text,
  add column if not exists request_note text;

create index if not exists bridge_delivery_jobs_requested_by_idx
  on public.bridge_delivery_jobs(requested_by, created_at desc);

comment on column public.bridge_delivery_jobs.requested_by is
  'Verified Bridge user who requested the delivery job; used for account-scoped read access.';
comment on column public.bridge_delivery_jobs.request_note is
  'Requester-supplied delivery instructions; must not contain secrets or credentials.';
