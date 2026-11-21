-- Add idempotent request identity and verifiable receipt metadata to the
-- pre-existing Bridge Delivery Desk baseline. This migration is additive;
-- it does not rewrite existing delivery jobs or change their statuses.
alter table public.bridge_delivery_jobs
  add column if not exists idempotency_key uuid,
  add column if not exists receipt_object_key text,
  add column if not exists receipt_sha256 text,
  add column if not exists receipt_byte_size bigint,
  add column if not exists receipt_verified_at timestamptz,
  add column if not exists receipt_verified_by text;

create unique index if not exists bridge_delivery_jobs_request_idempotency_idx
  on public.bridge_delivery_jobs(requested_by, idempotency_key)
  where requested_by is not null and idempotency_key is not null;

create index if not exists bridge_delivery_jobs_receipt_verified_idx
  on public.bridge_delivery_jobs(receipt_verified_at)
  where receipt_verified_at is not null;

do $delivery_evidence_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bridge_delivery_jobs_receipt_sha256_check'
      and conrelid = 'public.bridge_delivery_jobs'::regclass
  ) then
    alter table public.bridge_delivery_jobs
      add constraint bridge_delivery_jobs_receipt_sha256_check
      check (receipt_sha256 is null or receipt_sha256 ~ '^[A-Fa-f0-9]{64}$') not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'bridge_delivery_jobs_receipt_byte_size_check'
      and conrelid = 'public.bridge_delivery_jobs'::regclass
  ) then
    alter table public.bridge_delivery_jobs
      add constraint bridge_delivery_jobs_receipt_byte_size_check
      check (receipt_byte_size is null or receipt_byte_size > 0) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'bridge_delivery_jobs_verified_receipt_complete_check'
      and conrelid = 'public.bridge_delivery_jobs'::regclass
  ) then
    alter table public.bridge_delivery_jobs
      add constraint bridge_delivery_jobs_verified_receipt_complete_check
      check (
        receipt_verified_at is null
        or (
          receipt_object_key is not null
          and receipt_sha256 is not null
          and receipt_byte_size is not null
          and receipt_verified_by is not null
        )
      ) not valid;
  end if;
end
$delivery_evidence_constraints$;

comment on column public.bridge_delivery_jobs.idempotency_key is
  'Client-generated request key; unique per requester to prevent duplicate retries.';
comment on column public.bridge_delivery_jobs.receipt_object_key is
  'Private OCI object key for vendor receipt evidence; never a public URL.';
comment on column public.bridge_delivery_jobs.receipt_sha256 is
  'SHA-256 digest verified by the server against the private OCI object bytes.';
comment on column public.bridge_delivery_jobs.receipt_byte_size is
  'Exact byte length verified by the server against the private OCI object.';
