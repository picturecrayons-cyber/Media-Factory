-- CRAYONS BRIDGE title licensing finance, owner interests, investor agreements and reconciliation.
-- Source-only migration: do not apply to hosted STAGING or PRODUCTION without separate approval.
-- All financial tables are server-only; no anon/authenticated client grants are introduced.

create table if not exists public.bridge_title_owner_interests (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  owner_user_id text not null,
  owner_account_type text not null check (owner_account_type in ('independent_creator','studio')),
  owner_organization_id text,
  share_bps integer not null check (share_bps > 0 and share_bps <= 10000),
  agreement_reference text not null,
  evidence_document_id text not null references public.bridge_creator_documents(id) on delete restrict,
  status text not null default 'PENDING_VERIFICATION'
    check (status in ('PENDING_VERIFICATION','VERIFIED','REJECTED','SUPERSEDED')),
  verified_by text,
  verified_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_owner_interest_verified_actor_chk
    check ((status = 'VERIFIED' and verified_by is not null and verified_at is not null) or status <> 'VERIFIED')
);
create index if not exists bridge_title_owner_interests_title_idx
  on public.bridge_title_owner_interests(title_id,status,created_at desc);
create index if not exists bridge_title_owner_interests_user_idx
  on public.bridge_title_owner_interests(owner_user_id,status,title_id);

create table if not exists public.bridge_investment_agreements (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  investor_user_id text not null,
  agreement_reference text not null,
  return_model text not null check (return_model in ('REVENUE_SHARE','FIXED_CAP')),
  share_bps integer not null check (share_bps > 0 and share_bps <= 10000),
  cap_amount_paise bigint check (cap_amount_paise is null or cap_amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  evidence_url text not null check (evidence_url like 'https://%'),
  status text not null default 'PENDING_APPROVAL'
    check (status in ('PENDING_APPROVAL','APPROVED','SUSPENDED','CLOSED','REJECTED')),
  approved_by text,
  approved_at timestamptz,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_investment_cap_model_chk
    check ((return_model = 'FIXED_CAP' and cap_amount_paise is not null) or (return_model = 'REVENUE_SHARE' and cap_amount_paise is null)),
  constraint bridge_investment_effective_chk
    check (effective_to is null or effective_to > effective_from),
  constraint bridge_investment_approved_actor_chk
    check ((status = 'APPROVED' and approved_by is not null and approved_at is not null) or status <> 'APPROVED')
);
create index if not exists bridge_investment_agreements_title_idx
  on public.bridge_investment_agreements(title_id,status,effective_from desc);
create index if not exists bridge_investment_agreements_investor_idx
  on public.bridge_investment_agreements(investor_user_id,status,title_id);

create table if not exists public.bridge_licensing_receipts (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  rights_grant_id uuid not null references public.bridge_rights_grants(id) on delete restrict,
  buyer_user_id text,
  contract_reference text not null,
  payment_reference text not null unique,
  gross_amount_paise bigint not null check (gross_amount_paise > 0),
  tax_amount_paise bigint not null default 0 check (tax_amount_paise >= 0),
  deduction_amount_paise bigint not null default 0 check (deduction_amount_paise >= 0),
  net_amount_paise bigint generated always as (gross_amount_paise - tax_amount_paise - deduction_amount_paise) stored,
  currency text not null default 'INR' check (currency = 'INR'),
  evidence_url text not null check (evidence_url like 'https://%'),
  verification_status text not null default 'PENDING'
    check (verification_status in ('PENDING','VERIFIED','REJECTED','REVERSED')),
  verified_by text,
  verified_at timestamptz,
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  constraint bridge_licensing_receipt_net_chk
    check (gross_amount_paise >= tax_amount_paise + deduction_amount_paise),
  constraint bridge_licensing_receipt_verified_actor_chk
    check ((verification_status = 'VERIFIED' and verified_by is not null and verified_at is not null) or verification_status <> 'VERIFIED')
);
create index if not exists bridge_licensing_receipts_title_idx
  on public.bridge_licensing_receipts(title_id,verification_status,recorded_at desc);

create table if not exists public.bridge_licensing_allocations (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.bridge_licensing_receipts(id) on delete restrict,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  beneficiary_type text not null check (beneficiary_type in ('OWNER','INVESTOR','BRIDGE')),
  beneficiary_user_id text,
  owner_interest_id uuid references public.bridge_title_owner_interests(id) on delete restrict,
  investment_agreement_id uuid references public.bridge_investment_agreements(id) on delete restrict,
  amount_paise bigint not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'PENDING_APPROVAL'
    check (status in ('PENDING_APPROVAL','APPROVED','ON_HOLD','PAID','CANCELLED')),
  settlement_reference text,
  settlement_evidence_url text check (settlement_evidence_url is null or settlement_evidence_url like 'https://%'),
  approved_by text,
  approved_at timestamptz,
  paid_by text,
  paid_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint bridge_licensing_allocation_beneficiary_chk check (
    (beneficiary_type = 'OWNER' and beneficiary_user_id is not null and owner_interest_id is not null and investment_agreement_id is null)
    or (beneficiary_type = 'INVESTOR' and beneficiary_user_id is not null and investment_agreement_id is not null and owner_interest_id is null)
    or (beneficiary_type = 'BRIDGE' and beneficiary_user_id is null and owner_interest_id is null and investment_agreement_id is null)
  ),
  constraint bridge_licensing_allocation_approved_actor_chk
    check ((status in ('APPROVED','PAID') and approved_by is not null and approved_at is not null) or status not in ('APPROVED','PAID')),
  constraint bridge_licensing_allocation_paid_actor_chk
    check ((status = 'PAID' and paid_by is not null and paid_at is not null and settlement_reference is not null and settlement_evidence_url is not null) or status <> 'PAID')
);
create index if not exists bridge_licensing_allocations_receipt_idx
  on public.bridge_licensing_allocations(receipt_id,status,created_at);
create index if not exists bridge_licensing_allocations_beneficiary_idx
  on public.bridge_licensing_allocations(beneficiary_user_id,status,title_id);
create unique index if not exists bridge_licensing_allocations_beneficiary_uq
  on public.bridge_licensing_allocations(receipt_id,beneficiary_type,beneficiary_user_id)
  where beneficiary_user_id is not null and status <> 'CANCELLED';
create unique index if not exists bridge_licensing_allocations_bridge_uq
  on public.bridge_licensing_allocations(receipt_id)
  where beneficiary_type='BRIDGE' and status <> 'CANCELLED';

create table if not exists public.bridge_finance_reconciliations (
  id uuid primary key default gen_random_uuid(),
  reconciliation_number text not null unique,
  period_start date not null,
  period_end date not null,
  currency text not null default 'INR' check (currency = 'INR'),
  receipt_count integer not null default 0 check (receipt_count >= 0),
  verified_receipts_paise bigint not null default 0 check (verified_receipts_paise >= 0),
  allocated_paise bigint not null default 0 check (allocated_paise >= 0),
  variance_paise bigint not null default 0,
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_REVIEW','APPROVED','VOID')),
  notes text not null default '',
  created_by text not null,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bridge_finance_reconciliation_period_chk check (period_end >= period_start),
  constraint bridge_finance_reconciliation_approved_actor_chk
    check ((status = 'APPROVED' and approved_by is not null and approved_at is not null) or status <> 'APPROVED')
);
create table if not exists public.bridge_finance_reconciliation_items (
  reconciliation_id uuid not null references public.bridge_finance_reconciliations(id) on delete restrict,
  receipt_id uuid not null references public.bridge_licensing_receipts(id) on delete restrict,
  expected_amount_paise bigint not null check (expected_amount_paise >= 0),
  reconciled_amount_paise bigint not null check (reconciled_amount_paise >= 0),
  match_status text not null check (match_status in ('MATCHED','VARIANCE','UNMATCHED')),
  evidence_url text check (evidence_url is null or evidence_url like 'https://%'),
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (reconciliation_id,receipt_id)
);

alter table public.bridge_title_owner_interests enable row level security;
alter table public.bridge_investment_agreements enable row level security;
alter table public.bridge_licensing_receipts enable row level security;
alter table public.bridge_licensing_allocations enable row level security;
alter table public.bridge_finance_reconciliations enable row level security;
alter table public.bridge_finance_reconciliation_items enable row level security;

revoke all on public.bridge_title_owner_interests,public.bridge_investment_agreements,
  public.bridge_licensing_receipts,public.bridge_licensing_allocations,
  public.bridge_finance_reconciliations,public.bridge_finance_reconciliation_items
from public,anon,authenticated;
grant all on public.bridge_title_owner_interests,public.bridge_investment_agreements,
  public.bridge_licensing_receipts,public.bridge_licensing_allocations,
  public.bridge_finance_reconciliations,public.bridge_finance_reconciliation_items
to postgres,service_role;

create policy bridge_title_owner_interests_deny_client on public.bridge_title_owner_interests
  for all to anon,authenticated using(false) with check(false);
create policy bridge_investment_agreements_deny_client on public.bridge_investment_agreements
  for all to anon,authenticated using(false) with check(false);
create policy bridge_licensing_receipts_deny_client on public.bridge_licensing_receipts
  for all to anon,authenticated using(false) with check(false);
create policy bridge_licensing_allocations_deny_client on public.bridge_licensing_allocations
  for all to anon,authenticated using(false) with check(false);
create policy bridge_finance_reconciliations_deny_client on public.bridge_finance_reconciliations
  for all to anon,authenticated using(false) with check(false);
create policy bridge_finance_reconciliation_items_deny_client on public.bridge_finance_reconciliation_items
  for all to anon,authenticated using(false) with check(false);

comment on table public.bridge_title_owner_interests is 'Super Admin verified title-specific ownership interests backed by chain-of-title evidence; never inferred from account type.';
comment on table public.bridge_investment_agreements is 'Title-specific investor return agreements; no payout is calculated unless agreement is approved.';
comment on table public.bridge_licensing_receipts is 'Separate verified licensing revenue receipts; never contains service-request payments.';
comment on table public.bridge_licensing_allocations is 'Title-specific licensing revenue allocations to verified owners, approved investors and Bridge.';
comment on table public.bridge_finance_reconciliations is 'Super Admin controlled reconciliation snapshots for verified licensing receipts and allocations.';
