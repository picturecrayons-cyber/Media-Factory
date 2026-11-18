-- Draftable, scheduled Loop homepage merchandising. Public reads are restricted to active published windows.
create table if not exists public.loop_merchandising_documents (
  document_key text primary key check (document_key = 'homepage'),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT','SCHEDULED','PUBLISHED','ARCHIVED')),
  publish_at timestamptz,
  unpublish_at timestamptz,
  version integer not null default 1 check (version > 0),
  updated_by text references public.bridge_profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (unpublish_at is null or publish_at is null or unpublish_at > publish_at)
);
alter table public.loop_merchandising_documents enable row level security;
revoke all privileges on table public.loop_merchandising_documents from public;
revoke insert, update, delete on table public.loop_merchandising_documents from anon, authenticated;
grant select (document_key,payload,publish_at,unpublish_at)
  on table public.loop_merchandising_documents to anon, authenticated;
grant all privileges on table public.loop_merchandising_documents to service_role;
drop policy if exists loop_merchandising_public_active_read on public.loop_merchandising_documents;
create policy loop_merchandising_public_active_read
on public.loop_merchandising_documents for select to anon, authenticated
using (
  status in ('PUBLISHED','SCHEDULED')
  and publish_at is not null and publish_at <= now()
  and (unpublish_at is null or unpublish_at > now())
);

-- Safe public projection: never expose editor identity, revision, audit or internal timestamps.
create or replace view public.loop_public_merchandising
with (security_invoker = true) as
select document_key, payload, publish_at, unpublish_at
from public.loop_merchandising_documents
where status in ('PUBLISHED','SCHEDULED')
  and publish_at is not null and publish_at <= now()
  and (unpublish_at is null or unpublish_at > now());
grant select on public.loop_public_merchandising to anon, authenticated;
