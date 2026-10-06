-- CRAYONS Bridge service revenue engine
-- Non-license service revenue only. No seeded production prices.
-- Prices become active only after Finance configures real CRAYONS cost-backed rates.

create table if not exists public.bridge_service_catalog (
  code text primary key,
  category text not null check (category in ('PREPARE','MASTER','QC','RIGHTS','LOCALIZE','PACKAGE','DELIVER','ARCHIVE')),
  name text not null,
  description text not null default '',
  classification text not null check (classification in ('BILLABLE','INCLUDED','INTERNAL_COST','PASS_THROUGH')),
  pricing_method text not null check (pricing_method in ('FIXED_PER_TITLE','PER_FINISHED_MINUTE','PER_LANGUAGE','PER_DESTINATION','PER_ASSET','PER_GB','PER_HOUR','PER_REVISION','PER_TRANSACTION','PASS_THROUGH','CUSTOM_QUOTE')),
  unit_label text not null,
  active boolean not null default false,
  customer_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bridge_service_rates (
  id uuid primary key default gen_random_uuid(),
  service_code text not null references public.bridge_service_catalog(code) on delete restrict,
  currency text not null default 'INR',
  base_price_paise bigint,
  minimum_price_paise bigint,
  cost_basis_paise bigint,
  margin_basis_percent numeric(7,4),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  version integer not null default 1,
  active boolean not null default false,
  source_note text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  check (base_price_paise is null or base_price_paise >= 0),
  check (minimum_price_paise is null or minimum_price_paise >= 0),
  check (cost_basis_paise is null or cost_basis_paise >= 0),
  check (margin_basis_percent is null or (margin_basis_percent >= 0 and margin_basis_percent <= 100)),
  check (effective_to is null or effective_to > effective_from)
);

create index if not exists bridge_service_rates_lookup_idx
  on public.bridge_service_rates(service_code, currency, active, effective_from desc);

create table if not exists public.bridge_service_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  user_id text not null,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  currency text not null default 'INR',
  status text not null default 'ESTIMATED'
    check (status in ('DRAFT','ESTIMATED','QUOTED','ACCEPTED','PAYMENT_PENDING','PAID','IN_PROGRESS','COMPLETED','REFUNDED','CANCELLED')),
  runtime_minutes integer,
  selected_destinations jsonb not null default '[]'::jsonb,
  detected_assets jsonb not null default '[]'::jsonb,
  required_work jsonb not null default '[]'::jsonb,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  subtotal_paise bigint not null default 0 check (subtotal_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  tax_paise bigint not null default 0 check (tax_paise >= 0),
  total_paise bigint not null default 0 check (total_paise >= 0),
  expires_at timestamptz,
  accepted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bridge_service_quotes_user_idx on public.bridge_service_quotes(user_id, created_at desc);
create index if not exists bridge_service_quotes_title_idx on public.bridge_service_quotes(title_id, created_at desc);

create table if not exists public.bridge_service_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.bridge_service_quotes(id) on delete cascade,
  service_code text not null references public.bridge_service_catalog(code) on delete restrict,
  rate_id uuid references public.bridge_service_rates(id) on delete restrict,
  classification text not null check (classification in ('BILLABLE','INCLUDED','INTERNAL_COST','PASS_THROUGH')),
  pricing_method text not null,
  unit_label text not null,
  quantity numeric(14,4) not null default 1 check (quantity >= 0),
  unit_price_paise bigint not null default 0 check (unit_price_paise >= 0),
  line_total_paise bigint not null default 0 check (line_total_paise >= 0),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bridge_service_quote_lines_quote_idx on public.bridge_service_quote_lines(quote_id);

create table if not exists public.bridge_service_orders (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.bridge_service_quotes(id) on delete restrict,
  user_id text not null,
  title_id text not null references public.bridge_titles(id) on delete restrict,
  status text not null default 'PAYMENT_PENDING'
    check (status in ('PAYMENT_PENDING','PAID','IN_PROGRESS','COMPLETED','REFUNDED','CANCELLED')),
  amount_paise bigint not null check (amount_paise >= 0),
  currency text not null default 'INR',
  payment_id text references public.bridge_payments(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bridge_service_orders_user_idx on public.bridge_service_orders(user_id, created_at desc);
create index if not exists bridge_service_orders_title_idx on public.bridge_service_orders(title_id, created_at desc);

create table if not exists public.bridge_service_order_events (
  id bigserial primary key,
  order_id uuid not null references public.bridge_service_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.bridge_service_costs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.bridge_service_orders(id) on delete cascade,
  service_code text references public.bridge_service_catalog(code) on delete set null,
  cost_type text not null check (cost_type in ('INTERNAL_COST','PASS_THROUGH','PAYMENT_PROCESSING','TAX')),
  amount_paise bigint not null check (amount_paise >= 0),
  currency text not null default 'INR',
  vendor_reference text,
  evidence jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bridge_service_invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.bridge_service_orders(id) on delete restrict,
  invoice_number text not null unique,
  status text not null default 'ISSUED' check (status in ('ISSUED','PAID','VOID','REFUNDED')),
  subtotal_paise bigint not null check (subtotal_paise >= 0),
  tax_paise bigint not null check (tax_paise >= 0),
  total_paise bigint not null check (total_paise >= 0),
  currency text not null default 'INR',
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- Seed the catalogue only. No prices are invented or activated here.
insert into public.bridge_service_catalog (code,category,name,description,classification,pricing_method,unit_label)
values
('PREP_CONTENT','PREPARE','Content Preparation','Metadata, artwork, promo and conformance preparation','BILLABLE','FIXED_PER_TITLE','title'),
('MASTER_VIDEO','MASTER','Video Mastering','Professional video master preparation','BILLABLE','FIXED_PER_TITLE','title'),
('MASTER_AUDIO','MASTER','Audio Mastering','Professional audio master preparation','BILLABLE','FIXED_PER_TITLE','title'),
('MASTER_TRANSCODE','MASTER','Format Conversion / Transcoding','Destination format conversion','BILLABLE','PER_DESTINATION','destination'),
('QC_TECHNICAL','QC','Technical QC','Technical readiness and compliance review','BILLABLE','FIXED_PER_TITLE','title'),
('QC_RECHECK','QC','Re-QC / Correction QC','Validation after correction','BILLABLE','PER_REVISION','revision'),
('RIGHTS_REVIEW','RIGHTS','Rights / Legal Review','Rights evidence and legal review service','BILLABLE','FIXED_PER_TITLE','title'),
('SUBTITLE_CREATE','LOCALIZE','Subtitle Translation','Subtitle creation when not supplied','BILLABLE','PER_FINISHED_MINUTE','finished minute'),
('SUBTITLE_CORRECT','LOCALIZE','Subtitle Correction','Correction of supplied subtitle assets','BILLABLE','PER_REVISION','revision'),
('DUBBING','LOCALIZE','Dubbing','Localized dubbing service','BILLABLE','PER_FINISHED_MINUTE','finished minute'),
('OTT_PACKAGE','PACKAGE','OTT Packaging','Destination-ready OTT package','BILLABLE','PER_DESTINATION','destination'),
('APP_PACKAGE','PACKAGE','App-specific Package','App-specific package preparation','BILLABLE','PER_DESTINATION','destination'),
('STORE_PACKAGE','PACKAGE','Store / Marketplace Package','Store-specific package preparation','BILLABLE','PER_DESTINATION','destination'),
('BUYER_DELIVERY','DELIVER','Buyer Delivery','Secure buyer delivery','BILLABLE','PER_DESTINATION','destination'),
('OTT_DELIVERY','DELIVER','OTT Delivery','Delivery to an OTT destination','BILLABLE','PER_DESTINATION','destination'),
('APP_DELIVERY','DELIVER','App Delivery','Delivery to an app/web platform','BILLABLE','PER_DESTINATION','destination'),
('BROADCAST_DELIVERY','DELIVER','Broadcaster Delivery','Broadcaster delivery package and transfer','BILLABLE','PER_DESTINATION','destination'),
('STORE_DELIVERY','DELIVER','Store Delivery','Store/marketplace delivery','BILLABLE','PER_DESTINATION','destination'),
('DELIVERY_RESEND','DELIVER','Delivery Re-send / Correction','Re-delivery after approved correction','BILLABLE','PER_REVISION','revision'),
('ARCHIVE_MASTER','ARCHIVE','Master Archive','Long-term master retention','BILLABLE','PER_GB','GB'),
('ARCHIVE_TRANSFER','ARCHIVE','Data Transfer / Egress','Billable transfer where contractually applicable','PASS_THROUGH','PER_GB','GB')
on conflict (code) do nothing;

-- Fail closed: service tables are server-controlled.
alter table public.bridge_service_catalog enable row level security;
alter table public.bridge_service_rates enable row level security;
alter table public.bridge_service_quotes enable row level security;
alter table public.bridge_service_quote_lines enable row level security;
alter table public.bridge_service_orders enable row level security;
alter table public.bridge_service_order_events enable row level security;
alter table public.bridge_service_costs enable row level security;
alter table public.bridge_service_invoices enable row level security;

revoke all on public.bridge_service_catalog from anon, authenticated;
revoke all on public.bridge_service_rates from anon, authenticated;
revoke all on public.bridge_service_quotes from anon, authenticated;
revoke all on public.bridge_service_quote_lines from anon, authenticated;
revoke all on public.bridge_service_orders from anon, authenticated;
revoke all on public.bridge_service_order_events from anon, authenticated;
revoke all on public.bridge_service_costs from anon, authenticated;
revoke all on public.bridge_service_invoices from anon, authenticated;

comment on table public.bridge_service_rates is 'No production rates are seeded. Finance must configure real CRAYONS cost-backed rates before a service quote can become payable.';
