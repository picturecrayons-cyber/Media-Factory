-- Producer ownership claims are evidence-review cases only.
-- This migration intentionally does not alter bridge_titles.owner_user_id,
-- bridge_assets.created_by, rights grants, publication, payments or entitlements.

create table if not exists public.bridge_title_ownership_claims (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on update restrict on delete restrict,
  claimant_user_id text not null,
  claimant_account_type text not null check (claimant_account_type = 'independent_creator'),
  claimant_email_verified_snapshot boolean not null default false,
  current_owner_user_id_snapshot text not null,
  producer_entity_name text not null,
  claimant_capacity text not null check (
    claimant_capacity in ('PRODUCER','PROPRIETOR','AUTHORIZED_REPRESENTATIVE','RIGHTS_SUCCESSOR','OTHER')
  ),
  claim_basis text not null check (
    claim_basis in ('SOLE_NEGATIVE_RIGHTS','RIGHTS_OWNER','CHAIN_OF_TITLE','AUTHORIZATION','OTHER')
  ),
  declaration_text text not null,
  attested_at timestamptz not null,
  status text not null default 'DRAFT' check (
    status in ('DRAFT','SUBMITTED','NEEDS_INFORMATION','REFERRED_TO_LEGAL','CLOSED_INTAKE','LEGAL_REVIEWED')
  ),
  intake_reviewed_by text,
  intake_reviewed_at timestamptz,
  intake_review_note text,
  legal_decision text check (legal_decision is null or legal_decision in ('SUPPORTED','NOT_SUPPORTED')),
  legal_reviewed_by text,
  legal_reviewed_at timestamptz,
  legal_review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bridge_title_ownership_claims_title_idx
  on public.bridge_title_ownership_claims(title_id, created_at desc);
create index if not exists bridge_title_ownership_claims_claimant_idx
  on public.bridge_title_ownership_claims(claimant_user_id, created_at desc);
create index if not exists bridge_title_ownership_claims_review_idx
  on public.bridge_title_ownership_claims(status, created_at asc);

create unique index if not exists bridge_title_ownership_claims_one_open_per_claimant_idx
  on public.bridge_title_ownership_claims(title_id, claimant_user_id)
  where status in ('DRAFT','SUBMITTED','NEEDS_INFORMATION','REFERRED_TO_LEGAL');

create table if not exists public.bridge_title_ownership_claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.bridge_title_ownership_claims(id) on update restrict on delete restrict,
  category text not null check (
    category in (
      'SIGNED_OWNERSHIP_DECLARATION',
      'CHAIN_OF_TITLE',
      'NEGATIVE_RIGHTS_CERTIFICATE',
      'CBFC_CERTIFICATE',
      'PRODUCER_ASSOCIATION_CERTIFICATE',
      'PRIOR_ASSIGNMENT',
      'EXCLUDED_RIGHTS_SCHEDULE',
      'AUTHORIZATION_LETTER',
      'OTHER'
    )
  ),
  file_name text not null,
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 41943040),
  object_key text not null unique,
  object_etag text,
  status text not null default 'PENDING_UPLOAD' check (status in ('PENDING_UPLOAD','VERIFIED','REJECTED')),
  uploaded_by text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bridge_title_ownership_claim_evidence_claim_idx
  on public.bridge_title_ownership_claim_evidence(claim_id, created_at);

create table if not exists public.bridge_title_ownership_claim_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.bridge_title_ownership_claims(id) on update restrict on delete restrict,
  actor_user_id text not null,
  action text not null check (
    action in (
      'CLAIM_CREATED',
      'EVIDENCE_UPLOAD_REQUESTED',
      'EVIDENCE_VERIFIED',
      'CLAIM_SUBMITTED',
      'INTAKE_NEEDS_INFORMATION',
      'REFERRED_TO_LEGAL',
      'INTAKE_CLOSED',
      'LEGAL_SUPPORTED',
      'LEGAL_NOT_SUPPORTED',
      'LEGAL_NEEDS_MORE_EVIDENCE'
    )
  ),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bridge_title_ownership_claim_events_claim_idx
  on public.bridge_title_ownership_claim_events(claim_id, created_at);

alter table public.bridge_title_ownership_claims enable row level security;
alter table public.bridge_title_ownership_claim_evidence enable row level security;
alter table public.bridge_title_ownership_claim_events enable row level security;

-- These records and document keys are server-only. No Data API role can read or write them.
revoke all on table public.bridge_title_ownership_claims from public, anon, authenticated;
revoke all on table public.bridge_title_ownership_claim_evidence from public, anon, authenticated;
revoke all on table public.bridge_title_ownership_claim_events from public, anon, authenticated;
grant select, insert, update on table public.bridge_title_ownership_claims to service_role;
grant select, insert, update on table public.bridge_title_ownership_claim_evidence to service_role;
grant select, insert on table public.bridge_title_ownership_claim_events to service_role;

comment on table public.bridge_title_ownership_claims is
  'Private evidence-review cases. No claim status changes title ownership or rights grants.';
comment on table public.bridge_title_ownership_claim_evidence is
  'Private OCI evidence references separate from bridge_assets and historical uploader attribution.';
comment on table public.bridge_title_ownership_claim_events is
  'Append-only audit history for producer ownership claim intake and legal evidence review.';
