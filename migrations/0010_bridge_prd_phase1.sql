-- Crayons Bridge PRD Phase 1
-- Additive schema only: preserve the existing canonical bridge_titles authority.

alter table public.bridge_titles
  add column if not exists content_type text not null default 'FEATURE',
  add column if not exists original_title text,
  add column if not exists original_language text,
  add column if not exists country_of_origin text,
  add column if not exists release_date date,
  add column if not exists long_synopsis text,
  add column if not exists genres jsonb not null default '[]'::jsonb,
  add column if not exists credits jsonb not null default '[]'::jsonb,
  add column if not exists keywords jsonb not null default '[]'::jsonb,
  add column if not exists external_ids jsonb not null default '{}'::jsonb;

create table if not exists public.bridge_asset_versions (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete cascade,
  asset_group text not null check (asset_group in ('VIDEO','AUDIO','SUBTITLE','ACCESSIBILITY','ARTWORK','DOCUMENT','PROMO')),
  asset_type text not null,
  version integer not null default 1 check (version > 0),
  language text,
  channel_layout text,
  codec text,
  reference_asset_id uuid references public.bridge_asset_versions(id),
  s3_key text not null,
  checksum_sha256 text,
  byte_size bigint,
  technical_metadata jsonb not null default '{}'::jsonb,
  processing_state text not null default 'PROCESSING' check (processing_state in ('PROCESSING','PASSED','WARNING','ACTION_REQUIRED','FAILED')),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (title_id, asset_type, version, language)
);

create index if not exists bridge_asset_versions_title_idx on public.bridge_asset_versions(title_id);

create table if not exists public.bridge_qc_cases (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete cascade,
  asset_version_id uuid references public.bridge_asset_versions(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING','IN_REVIEW','PASSED','WARNING','ACTION_REQUIRED','FAILED')),
  automated_findings jsonb not null default '[]'::jsonb,
  reviewer_findings jsonb not null default '[]'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bridge_qc_cases_title_idx on public.bridge_qc_cases(title_id);

create table if not exists public.bridge_legal_cases (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','IN_REVIEW','APPROVED','ACTION_REQUIRED','REJECTED')),
  classification text,
  evidence jsonb not null default '[]'::jsonb,
  restrictions jsonb not null default '[]'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bridge_legal_cases_title_idx on public.bridge_legal_cases(title_id);

create table if not exists public.bridge_rights_grants (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete cascade,
  grant_type text not null default 'DISTRIBUTION',
  territories jsonb not null default '[]'::jsonb,
  languages jsonb not null default '[]'::jsonb,
  media jsonb not null default '[]'::jsonb,
  window_start timestamptz,
  window_end timestamptz,
  exclusivity text not null default 'NON_EXCLUSIVE' check (exclusivity in ('EXCLUSIVE','NON_EXCLUSIVE')),
  holdbacks jsonb not null default '[]'::jsonb,
  sublicensing_allowed boolean not null default false,
  promotional_rights boolean not null default false,
  restrictions jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT','VALID','EXPIRED','REVOKED')),
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists bridge_rights_grants_title_idx on public.bridge_rights_grants(title_id);

create table if not exists public.bridge_destination_packages (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete cascade,
  destination text not null,
  package_version integer not null default 1 check (package_version > 0),
  rights_grant_id uuid references public.bridge_rights_grants(id) on delete restrict,
  qc_case_id uuid references public.bridge_qc_cases(id) on delete restrict,
  legal_case_id uuid references public.bridge_legal_cases(id) on delete restrict,
  asset_version_ids jsonb not null default '[]'::jsonb,
  consumer_metadata jsonb not null default '{}'::jsonb,
  monetization jsonb not null default '{}'::jsonb,
  readiness_state text not null default 'HOLD' check (readiness_state in ('HOLD','READY','AUTHORIZED','DELIVERED','REVOKED')),
  authorized_by text,
  authorized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (title_id, destination, package_version)
);

create index if not exists bridge_destination_packages_title_idx on public.bridge_destination_packages(title_id);

-- Server-side access remains fail-closed. The application service role performs
-- authorized mutations after Bridge RBAC checks; no anon/authenticated grants are added here.
alter table public.bridge_asset_versions enable row level security;
alter table public.bridge_qc_cases enable row level security;
alter table public.bridge_legal_cases enable row level security;
alter table public.bridge_rights_grants enable row level security;
alter table public.bridge_destination_packages enable row level security;
