-- Bridge licensing evidence verification (additive; do not apply without separate DB approval).
-- Evidence must point to a processed, checksummed DOCUMENT asset version.
-- Verification is a human legal-review attestation; this schema does not claim automated authenticity.

create table if not exists public.bridge_rights_evidence (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  rights_grant_id uuid not null references public.bridge_rights_grants(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('EXECUTED_AGREEMENT','OWNERSHIP_CHAIN')),
  asset_version_id uuid not null references public.bridge_asset_versions(id) on delete restrict,
  checksum_sha256 char(64) not null check (checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
  submitted_by text not null,
  status text not null default 'PENDING' check (status in ('PENDING','VERIFIED','REJECTED')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  check (
    (status = 'PENDING' and reviewed_by is null and reviewed_at is null)
    or
    (status in ('VERIFIED','REJECTED') and reviewed_by is not null and reviewed_at is not null)
  ),
  unique (rights_grant_id, evidence_type, asset_version_id)
);

create index if not exists bridge_rights_evidence_grant_status_idx
  on public.bridge_rights_evidence(rights_grant_id, status, evidence_type);

create table if not exists public.bridge_rights_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.bridge_rights_evidence(id) on delete restrict,
  decision text not null check (decision in ('VERIFIED','REJECTED')),
  reviewer_user_id text not null,
  evidence_checksum_sha256 char(64) not null check (evidence_checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists bridge_rights_evidence_reviews_evidence_idx
  on public.bridge_rights_evidence_reviews(evidence_id, created_at);

alter table public.bridge_rights_evidence enable row level security;
alter table public.bridge_rights_evidence_reviews enable row level security;

-- No anon/authenticated grants or policies are added. Mutations remain server-side only.
