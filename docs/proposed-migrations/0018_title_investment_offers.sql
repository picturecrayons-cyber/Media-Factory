-- PROPOSED ONLY: title-specific investment offers.
-- This file intentionally lives outside /migrations so it cannot be auto-applied.
-- Apply only to a verified isolated staging database after review. Never run on Production
-- until Indian legal/compliance approval, RLS review, and explicit release authorization.
create table if not exists public.bridge_title_investment_offers (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','LEGAL_REVIEW','APPROVAL_PENDING','APPROVED','PUBLISHED','PAUSED','CLOSED','WITHDRAWN')),
  currency text not null default 'INR' check (currency = 'INR'),
  minimum_amount_paise bigint not null check (minimum_amount_paise > 0),
  maximum_amount_paise bigint not null check (maximum_amount_paise >= minimum_amount_paise),
  target_amount_paise bigint not null check (target_amount_paise between minimum_amount_paise and maximum_amount_paise),
  application_increment_paise bigint not null default 100 check (application_increment_paise > 0),
  participation_basis text not null,
  participation_percent numeric(7,4) check (participation_percent is null or participation_percent between 0 and 100),
  participation_formula text not null,
  receipt_scope text not null,
  tenure_start date,
  tenure_months integer not null check (tenure_months > 0),
  maturity_date date,
  review_dates jsonb not null default '[]'::jsonb check (jsonb_typeof(review_dates) = 'array'),
  rights_included jsonb not null default '[]'::jsonb check (jsonb_typeof(rights_included) = 'array'),
  rights_excluded jsonb not null default '[]'::jsonb check (jsonb_typeof(rights_excluded) = 'array'),
  permitted_costs jsonb not null default '[]'::jsonb check (jsonb_typeof(permitted_costs) = 'array'),
  recoupment_priority text not null,
  distribution_frequency text not null,
  calculation_method text not null,
  information_memorandum_url text,
  terms_document_url text,
  risk_disclosure text not null,
  rights_evidence_reference text not null,
  legal_reviewer_user_id text,
  legal_reviewed_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  published_at timestamptz,
  published_by text,
  eligibility_rules jsonb not null default '{}'::jsonb,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(title_id, version)
);
create index if not exists bridge_title_investment_offers_status_idx on public.bridge_title_investment_offers(status, published_at desc);
create index if not exists bridge_title_investment_offers_title_idx on public.bridge_title_investment_offers(title_id, version desc);

create table if not exists public.bridge_title_investment_applications (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.bridge_title_investment_offers(id) on delete restrict,
  offer_version integer not null,
  investor_user_id text not null,
  requested_amount_paise bigint not null check (requested_amount_paise > 0),
  status text not null default 'INTEREST_SUBMITTED'
    check (status in ('INTEREST_SUBMITTED','ELIGIBILITY_REVIEW','APPROVED_TO_SUBSCRIBE','REJECTED','CANCELLED','PAYMENT_PENDING','PAYMENT_VERIFIED','FUNDED','REFUND_PENDING','REFUNDED')),
  accepted_terms_at timestamptz,
  disclosure_version integer not null,
  eligibility_status text not null default 'PENDING' check (eligibility_status in ('PENDING','PASSED','FAILED','MANUAL_REVIEW')),
  compliance_reference text,
  payment_provider_reference text,
  payment_verified_at timestamptz,
  funded_amount_paise bigint check (funded_amount_paise is null or funded_amount_paise >= 0),
  funded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bridge_title_investment_applications_investor_idx on public.bridge_title_investment_applications(investor_user_id, created_at desc);
create index if not exists bridge_title_investment_applications_offer_idx on public.bridge_title_investment_applications(offer_id, status);
alter table public.bridge_title_investment_offers enable row level security;
alter table public.bridge_title_investment_applications enable row level security;
revoke all on public.bridge_title_investment_offers from anon, authenticated;
revoke all on public.bridge_title_investment_applications from anon, authenticated;
