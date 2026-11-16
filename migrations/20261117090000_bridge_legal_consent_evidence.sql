-- Immutable, server-written evidence of acknowledgement of the published Bridge documents.
-- This migration is intended for isolated STAGING verification only.
create schema if not exists private;

create table if not exists private.bridge_legal_consents (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  document_key text not null check (document_key in ('terms', 'privacy')),
  document_version text not null,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null default clock_timestamp(),
  acceptance_method text not null default 'authenticated_checkbox'
    check (acceptance_method = 'authenticated_checkbox'),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists bridge_legal_consents_user_document_idx
  on private.bridge_legal_consents (auth_user_id, document_key, accepted_at desc);

alter table private.bridge_legal_consents enable row level security;
revoke all on private.bridge_legal_consents from public, anon, authenticated;

create or replace function private.prevent_bridge_legal_consent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Legal consent evidence is immutable';
end;
$$;

drop trigger if exists bridge_legal_consents_immutable on private.bridge_legal_consents;
create trigger bridge_legal_consents_immutable
before update or delete on private.bridge_legal_consents
for each row execute function private.prevent_bridge_legal_consent_mutation();

revoke all on function private.prevent_bridge_legal_consent_mutation() from public, anon, authenticated;
