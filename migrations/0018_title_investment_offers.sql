-- Title-specific investment offers. Draft PR migration only; never auto-applied to Production.
-- Real-money subscriptions remain disabled pending Indian legal/compliance approval.

create table if not exists public.bridge_title_investment_offers (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','LEGAL_REVIEW','APPROVED','PUBLISHED','PAUSED','CLOSED','WITHDRAWN')),
  currency text not null default 'INR' check (currency = 'INR'),
  minimum_amount_paise bigint not null,
  maximum_amount_paise bigint not null,
  target_amount_paise bigint not null,
  application_increment_paise bigint not null default 100,
  participation_basis text not null,
  participation_percent numeric(7,4),
  participation_formula text not null,
  receipt_scope text not null,
  tenure_start date,
  tenure_months integer not null check (tenure_months > 0),
  maturity_date date,
  review_dates jsonb not null default '[]'::jsonb,
  rights_included jsonb not null default '[]'::jsonb,
  rights_excluded jsonb not null default '[]'::jsonb,
  permitted_costs jsonb not null default '[]'::jsonb,
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
  unique(title_id, version),
  check (minimum_amount_paise > 0),
  check (maximum_amount_paise >= minimum_amount_paise),
  check (target_amount_paise >= minimum_amount_paise),
  check (target_amount_paise <= maximum_amount_paise),
  check (application_increment_paise > 0),
  check (participation_percent is null or (participation_percent >= 0 and participation_percent <= 100)),
  check (jsonb_typeof(rights_included) = 'array'),
  check (jsonb_typeof(rights_excluded) = 'array'),
  check (jsonb_typeof(permitted_costs) = 'array'),
  check (jsonb_typeof(review_dates) = 'array')
);

create index if not exists bridge_title_investment_offers_status_idx
  on public.bridge_title_investment_offers(status, published_at desc);
create index if not exists bridge_title_investment_offers_title_idx
  on public.bridge_title_investment_offers(title_id, version desc);

create table if not exists public.bridge_title_investment_applications (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.bridge_title_investment_offers(id) on delete restrict,
  offer_version integer not null,
  investor_user_id text not null,
  requested_amount_paise bigint not null,
  status text not null default 'INTEREST_SUBMITTED'
    check (status in ('INTEREST_SUBMITTED','ELIGIBILITY_REVIEW','APPROVED_TO_SUBSCRIBE','REJECTED','CANCELLED','PAYMENT_PENDING','PAYMENT_VERIFIED','FUNDED','REFUND_PENDING','REFUNDED')),
  accepted_terms_at timestamptz,
  disclosure_version integer not null,
  eligibility_status text not null default 'PENDING'
    check (eligibility_status in ('PENDING','PASSED','FAILED','MANUAL_REVIEW')),
  compliance_reference text,
  payment_provider_reference text,
  payment_verified_at timestamptz,
  funded_amount_paise bigint,
  funded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requested_amount_paise > 0),
  check (funded_amount_paise is null or funded_amount_paise >= 0)
);

create index if not exists bridge_title_investment_applications_investor_idx
  on public.bridge_title_investment_applications(investor_user_id, created_at desc);
create index if not exists bridge_title_investment_applications_offer_idx
  on public.bridge_title_investment_applications(offer_id, status);

alter table public.bridge_title_investment_offers enable row level security;
alter table public.bridge_title_investment_applications enable row level security;
-- All reads/writes go through verified, server-side Bridge functions. Direct
-- browser/API access is denied until narrowly-scoped RLS policies are reviewed.
revoke all on public.bridge_title_investment_offers from anon, authenticated;
revoke all on public.bridge_title_investment_applications from anon, authenticated;
