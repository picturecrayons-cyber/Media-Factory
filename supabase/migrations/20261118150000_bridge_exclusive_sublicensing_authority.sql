-- Bridge-exclusive sublicensing decisions.
-- No Creator, Studio, Buyer or Loop identity receives rights-management privileges.
create table if not exists public.bridge_sublicense_authorizations (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  rights_grant_id uuid not null references public.bridge_rights_grants(id) on delete restrict,
  downstream_licensee text not null check (length(trim(downstream_licensee)) between 2 and 200),
  downstream_licensee_reference text not null check (length(trim(downstream_licensee_reference)) between 2 and 500),
  territories jsonb not null check (jsonb_typeof(territories) = 'array' and jsonb_array_length(territories) > 0),
  languages jsonb not null check (jsonb_typeof(languages) = 'array' and jsonb_array_length(languages) > 0),
  media jsonb not null check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) > 0),
  window_start timestamptz not null,
  window_end timestamptz not null,
  restrictions jsonb not null default '[]'::jsonb check (jsonb_typeof(restrictions) = 'array'),
  evidence_document_id uuid not null references public.bridge_creator_documents(id) on delete restrict,
  status text not null default 'AUTHORIZED' check (status in ('AUTHORIZED','SUSPENDED','REVOKED','EXPIRED')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_end > window_start)
);
create index if not exists bridge_sublicense_authorizations_title_idx
  on public.bridge_sublicense_authorizations(title_id, created_at desc);
create index if not exists bridge_sublicense_authorizations_grant_idx
  on public.bridge_sublicense_authorizations(rights_grant_id, status);
alter table public.bridge_sublicense_authorizations enable row level security;
revoke all on table public.bridge_sublicense_authorizations from anon, authenticated;
grant all on table public.bridge_sublicense_authorizations to service_role;

create unique index if not exists bridge_sublicense_authorizations_idempotency_idx
  on public.bridge_sublicense_authorizations(rights_grant_id, downstream_licensee_reference, window_start, window_end);
