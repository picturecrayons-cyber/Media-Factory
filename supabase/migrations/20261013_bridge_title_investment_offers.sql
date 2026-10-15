-- Draft-only investment offer configuration. Never apply automatically in production.
create table if not exists public.bridge_title_investment_offers (
  id text primary key,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  created_by text not null,
  minimum_amount_paise bigint not null check (minimum_amount_paise > 0),
  target_amount_paise bigint not null check (target_amount_paise > 0),
  maximum_amount_paise bigint not null check (maximum_amount_paise > 0),
  participation_basis text not null check (participation_basis in ('NET_DISTRIBUTION_RECEIPTS','GROSS_DISTRIBUTION_RECEIPTS','FIXED_ECONOMIC_SHARE')),
  participation_percent numeric(7,4),
  tenure_months integer not null check (tenure_months between 1 and 240),
  rights_included jsonb not null,
  rights_excluded jsonb not null,
  territories text[] not null,
  languages text[] not null,
  media text[] not null,
  window_start date,
  window_end date,
  terms_summary text not null,
  status text not null check (status in ('DRAFT','LEGAL_REVIEW','APPROVED','PUBLISHED','PAUSED','CLOSED')),
  review_reference text,
  reviewed_by text,
  approved_at timestamptz,
  published_by text,
  published_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimum_amount_paise <= target_amount_paise and target_amount_paise <= maximum_amount_paise),
  check ((participation_basis = 'FIXED_ECONOMIC_SHARE' and participation_percent is null) or (participation_basis in ('NET_DISTRIBUTION_RECEIPTS','GROSS_DISTRIBUTION_RECEIPTS') and participation_percent between 0.01 and 100)),
  check (window_start is null or window_end is null or window_start <= window_end),
  check (status not in ('APPROVED','PUBLISHED') or (review_reference is not null and reviewed_by is not null and approved_at is not null))
);
create index if not exists bridge_title_investment_offers_status_idx on public.bridge_title_investment_offers(status, published_at desc);
alter table public.bridge_title_investment_offers enable row level security;
revoke all on public.bridge_title_investment_offers from anon, authenticated;

create table if not exists public.bridge_investment_interests (
  id text primary key,
  offer_id text not null references public.bridge_title_investment_offers(id) on delete restrict,
  investor_user_id text not null,
  requested_amount_paise bigint not null check (requested_amount_paise > 0),
  note text,
  status text not null check (status in ('INFORMATION_REQUESTED','CONTACTED','DECLINED','WITHDRAWN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, investor_user_id)
);
create index if not exists bridge_investment_interests_investor_idx on public.bridge_investment_interests(investor_user_id, created_at desc);
alter table public.bridge_investment_interests enable row level security;
revoke all on public.bridge_investment_interests from anon, authenticated;
