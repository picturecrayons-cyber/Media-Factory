-- Crayons Bridge multilingual rights packaging MVP
-- Additive and fail-closed. No existing title, rights or payment rows are mutated.
begin;

create table if not exists public.bridge_language_rights (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete cascade,
  language text not null,
  right_type text not null check (right_type in ('ORIGINAL','DUBBING','SUBTITLING')),
  territories jsonb not null default '[]'::jsonb,
  media jsonb not null default '[]'::jsonb,
  window_start timestamptz,
  window_end timestamptz,
  exclusivity text not null default 'NON_EXCLUSIVE' check (exclusivity in ('EXCLUSIVE','NON_EXCLUSIVE')),
  asking_price_paise bigint not null default 0 check (asking_price_paise >= 0),
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT','VALID','EXPIRED','REVOKED')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_end is null or window_start is null or window_end > window_start)
);

create index if not exists bridge_language_rights_title_idx
  on public.bridge_language_rights(title_id);
create index if not exists bridge_language_rights_lookup_idx
  on public.bridge_language_rights(title_id, language, right_type, status);

create table if not exists public.bridge_license_packages (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete cascade,
  name text not null,
  language_right_ids jsonb not null default '[]'::jsonb,
  territories jsonb not null default '[]'::jsonb,
  media jsonb not null default '[]'::jsonb,
  window_start timestamptz,
  window_end timestamptz,
  exclusivity text not null default 'NON_EXCLUSIVE' check (exclusivity in ('EXCLUSIVE','NON_EXCLUSIVE')),
  price_paise bigint not null default 0 check (price_paise >= 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','IN_NEGOTIATION','LICENSED','REVOKED')),
  delivery_status text not null default 'HOLD' check (delivery_status in ('HOLD','READY','AUTHORIZED','DELIVERED','REVOKED')),
  buyer_user_id text,
  payment_id text,
  asset_version_ids jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(language_right_ids) = 'array'),
  check (window_end is null or window_start is null or window_end > window_start)
);

create index if not exists bridge_license_packages_title_idx
  on public.bridge_license_packages(title_id);
create index if not exists bridge_license_packages_buyer_idx
  on public.bridge_license_packages(buyer_user_id);

create table if not exists public.bridge_package_entitlements (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.bridge_license_packages(id) on delete restrict,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  buyer_user_id text not null,
  payment_id text not null,
  granted_at timestamptz not null default now(),
  unique (package_id, buyer_user_id)
);

create index if not exists bridge_package_entitlements_buyer_idx
  on public.bridge_package_entitlements(buyer_user_id);

alter table public.bridge_payments
  add column if not exists package_id uuid references public.bridge_license_packages(id) on delete restrict;

create index if not exists bridge_payments_package_idx
  on public.bridge_payments(package_id);

alter table public.bridge_language_rights enable row level security;
alter table public.bridge_license_packages enable row level security;
alter table public.bridge_package_entitlements enable row level security;

commit;
