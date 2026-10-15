-- Accepted licensing deal -> order -> entitlement linkage.
-- Additive only; apply in non-production after review and E2E evidence.
begin;

create table if not exists public.bridge_license_deals (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  buyer_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  rights_category text not null,
  territories jsonb not null default '[]'::jsonb check (jsonb_typeof(territories) = 'array'),
  languages jsonb not null default '[]'::jsonb check (jsonb_typeof(languages) = 'array'),
  media_modes jsonb not null default '[]'::jsonb check (jsonb_typeof(media_modes) = 'array'),
  term_start date not null,
  term_end date not null,
  exclusivity text not null check (exclusivity in ('EXCLUSIVE','NON_EXCLUSIVE')),
  agreed_fee_paise bigint not null check (agreed_fee_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'DRAFT' check (status in ('DRAFT','PROPOSED','ACCEPTED','PAYMENT_PENDING','LICENSED','EXPIRED','CANCELLED')),
  contract_reference text,
  terms_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(terms_snapshot) = 'object'),
  created_by text not null,
  accepted_by text,
  accepted_at timestamptz,
  licensed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (term_end > term_start),
  check ((status not in ('ACCEPTED','PAYMENT_PENDING','LICENSED')) or (accepted_at is not null and contract_reference is not null))
);

create index if not exists bridge_license_deals_buyer_status_idx
  on public.bridge_license_deals(buyer_user_id, status, term_start, term_end);
create index if not exists bridge_license_deals_title_idx
  on public.bridge_license_deals(title_id, status);

alter table public.bridge_payments
  add column if not exists deal_id uuid references public.bridge_license_deals(id) on delete restrict;
create index if not exists bridge_payments_deal_idx on public.bridge_payments(deal_id);
-- One accepted deal can create only one canonical payment order; retries must reuse it.
create unique index if not exists bridge_payments_deal_unique
  on public.bridge_payments(deal_id) where deal_id is not null;

create table if not exists public.bridge_deal_entitlements (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.bridge_license_deals(id) on delete restrict,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  buyer_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  payment_id text not null references public.bridge_payments(id) on delete restrict,
  granted_at timestamptz not null default now(),
  unique (deal_id, buyer_user_id)
);
create index if not exists bridge_deal_entitlements_buyer_idx
  on public.bridge_deal_entitlements(buyer_user_id, granted_at desc);

alter table public.bridge_license_deals enable row level security;
alter table public.bridge_deal_entitlements enable row level security;

commit;
