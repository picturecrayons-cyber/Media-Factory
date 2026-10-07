-- CRAYONS BRIDGE commercial control plane
-- Extends the live commercial engine without activating customer prices.
-- Adds cost/margin snapshots, financial idempotency, refund/chargeback tracking,
-- and configurable settlement rules/lines.

alter table public.bridge_service_rates
  add column if not exists cost_basis_paise bigint,
  add column if not exists target_margin_percent numeric(7,4),
  add column if not exists pricing_config jsonb not null default '{}'::jsonb,
  add column if not exists source_note text not null default '',
  add constraint bridge_service_rates_cost_chk
    check (cost_basis_paise is null or cost_basis_paise >= 0),
  add constraint bridge_service_rates_margin_chk
    check (target_margin_percent is null or (target_margin_percent >= 0 and target_margin_percent <= 100));

alter table public.bridge_service_quotes
  add column if not exists pricing_locked_at timestamptz,
  add column if not exists pricing_locked_by text,
  add column if not exists estimated_cost_paise bigint not null default 0,
  add column if not exists estimated_margin_paise bigint not null default 0,
  add column if not exists refunded_amount_paise bigint not null default 0;

alter table public.bridge_service_quote_lines
  add column if not exists cost_basis_paise bigint not null default 0,
  add column if not exists estimated_margin_paise bigint not null default 0,
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb;

alter table public.bridge_service_orders
  add column if not exists refunded_amount_paise bigint not null default 0;

alter table public.bridge_service_invoices
  add column if not exists refunded_amount_paise bigint not null default 0;

alter table public.bridge_payments
  add column if not exists provider_fee_paise bigint,
  add column if not exists provider_tax_paise bigint,
  add column if not exists refunded_amount_paise bigint not null default 0,
  add column if not exists chargeback_amount_paise bigint not null default 0,
  add column if not exists provider_failure_reason text;

create index if not exists bridge_payments_provider_payment_idx
  on public.bridge_payments(provider_payment_id);

create table if not exists public.bridge_service_costs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.bridge_service_orders(id) on delete cascade,
  service_code text references public.bridge_service_catalog(code) on delete set null,
  cost_type text not null check (cost_type in ('INTERNAL_COST','PASS_THROUGH','PAYMENT_PROCESSING')),
  amount_paise bigint not null check (amount_paise >= 0),
  currency text not null default 'INR',
  source text not null default 'ACTUAL',
  vendor_reference text,
  evidence jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists bridge_service_costs_order_idx
  on public.bridge_service_costs(order_id, created_at desc);

create table if not exists public.bridge_service_settlement_rules (
  id uuid primary key default gen_random_uuid(),
  title_id text references public.bridge_titles(id) on delete cascade,
  beneficiary_type text not null check (beneficiary_type in ('CREATOR','RIGHTS_HOLDER','INVESTOR','DISTRIBUTOR','PARTNER','BRIDGE')),
  beneficiary_user_id text,
  basis text not null default 'REVENUE'
    check (basis in ('REVENUE','NET_AFTER_TAX','NET_AFTER_COSTS')),
  percentage_bps integer check (percentage_bps is null or (percentage_bps >= 0 and percentage_bps <= 10000)),
  fixed_amount_paise bigint check (fixed_amount_paise is null or fixed_amount_paise >= 0),
  active boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  version integer not null default 1,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint bridge_settlement_rule_amount_chk
    check (percentage_bps is not null or fixed_amount_paise is not null),
  constraint bridge_settlement_rule_effective_chk
    check (effective_to is null or effective_to > effective_from)
);

create index if not exists bridge_settlement_rules_lookup_idx
  on public.bridge_service_settlement_rules(title_id, beneficiary_type, active, effective_from desc);

create table if not exists public.bridge_service_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.bridge_service_orders(id) on delete cascade,
  rule_id uuid references public.bridge_service_settlement_rules(id) on delete set null,
  beneficiary_type text not null,
  beneficiary_user_id text,
  basis text not null,
  percentage_bps integer,
  amount_paise bigint not null check (amount_paise >= 0),
  status text not null default 'PENDING'
    check (status in ('PENDING','ON_HOLD','APPROVED','PAID','CANCELLED')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(order_id, beneficiary_type, beneficiary_user_id)
);

create index if not exists bridge_service_settlement_lines_order_idx
  on public.bridge_service_settlement_lines(order_id, created_at desc);

alter table public.bridge_financial_ledger
  add column if not exists service_code text references public.bridge_service_catalog(code) on delete set null,
  add column if not exists idempotency_key text,
  add column if not exists source_event_id text;

create unique index if not exists bridge_financial_ledger_idempotency_uq
  on public.bridge_financial_ledger(idempotency_key)
  where idempotency_key is not null;

create index if not exists bridge_financial_ledger_service_idx
  on public.bridge_financial_ledger(service_code, created_at desc);

alter table public.bridge_service_costs enable row level security;
alter table public.bridge_service_settlement_rules enable row level security;
alter table public.bridge_service_settlement_lines enable row level security;

revoke all on public.bridge_service_costs from anon, authenticated;
revoke all on public.bridge_service_settlement_rules from anon, authenticated;
revoke all on public.bridge_service_settlement_lines from anon, authenticated;

revoke all on public.bridge_service_costs from public;
revoke all on public.bridge_service_settlement_rules from public;
revoke all on public.bridge_service_settlement_lines from public;

comment on table public.bridge_service_rates is 'Finance-controlled CRAYONS rate card. cost_basis and pricing_config support automated quote margin logic without activating rates by default.';
comment on table public.bridge_service_costs is 'Actual operating and pass-through costs attributable to a service order.';
comment on table public.bridge_service_settlement_rules is 'Finance-controlled settlement rules. No rule is active until explicitly configured.';
comment on table public.bridge_service_settlement_lines is 'Immutable settlement allocation snapshot for each paid service order.';
