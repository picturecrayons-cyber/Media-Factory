-- Contract-backed licensing and broadcast partner workflows.
-- Additive only. RLS remains service-role mediated; no client grants are added.
create table if not exists public.bridge_distribution_partners (
  id uuid primary key default gen_random_uuid(),
  partner_type text not null check (partner_type in ('TV_CHANNEL','BROADCASTER')),
  legal_name text not null check (length(trim(legal_name)) between 2 and 200),
  display_name text not null check (length(trim(display_name)) between 2 and 160),
  country text not null check (length(trim(country)) between 2 and 80),
  contact_name text,
  contact_email text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bridge_distribution_partners_type_idx
  on public.bridge_distribution_partners(partner_type,status);

create table if not exists public.bridge_distribution_deals (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  deal_type text not null check (deal_type in ('EXTERNAL_BUYER','BROADCAST')),
  partner_id uuid references public.bridge_distribution_partners(id) on delete restrict,
  buyer_user_id text references public.bridge_profiles(user_id) on delete restrict,
  territories jsonb not null default '[]'::jsonb,
  languages jsonb not null default '[]'::jsonb,
  media jsonb not null default '[]'::jsonb,
  window_start timestamptz,
  window_end timestamptz,
  exclusivity text not null default 'NON_EXCLUSIVE' check (exclusivity in ('EXCLUSIVE','NON_EXCLUSIVE')),
  offer_fee_paise bigint check (offer_fee_paise is null or offer_fee_paise >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  delivery_specs jsonb not null default '{}'::jsonb,
  agreement_reference text,
  rights_grant_id uuid references public.bridge_rights_grants(id) on delete restrict,
  status text not null default 'DRAFT' check (status in ('ENQUIRY','DRAFT','OFFERED','NEGOTIATION','AGREEMENT_PENDING','AGREEMENT_RECORDED','APPROVED','REJECTED','CANCELLED')),
  delivery_status text not null default 'HOLD' check (delivery_status in ('HOLD','SPECIFICATION_PENDING','READY_FOR_QC','QC_PASSED','DELIVERED')),
  notes text,
  created_by text not null,
  updated_by text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_start is null or window_end is null or window_end > window_start),
  check (
    (deal_type = 'BROADCAST' and partner_id is not null and buyer_user_id is null)
    or
    (deal_type = 'EXTERNAL_BUYER' and buyer_user_id is not null and partner_id is null)
  )
);
create index if not exists bridge_distribution_deals_title_idx
  on public.bridge_distribution_deals(title_id,created_at desc);
create index if not exists bridge_distribution_deals_partner_idx
  on public.bridge_distribution_deals(partner_id,status);
create index if not exists bridge_distribution_deals_buyer_idx
  on public.bridge_distribution_deals(buyer_user_id,status);

alter table public.bridge_distribution_partners enable row level security;
alter table public.bridge_distribution_deals enable row level security;
