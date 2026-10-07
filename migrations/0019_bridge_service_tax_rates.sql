create table if not exists public.bridge_tax_rates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  currency text not null default 'INR',
  rate_percent numeric(7,4) not null check (rate_percent >= 0 and rate_percent <= 100),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  active boolean not null default false,
  source_note text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);
create index if not exists bridge_tax_rates_lookup_idx on public.bridge_tax_rates(currency, active, effective_from desc);
alter table public.bridge_tax_rates enable row level security;
revoke all on public.bridge_tax_rates from anon, authenticated;
comment on table public.bridge_tax_rates is 'Finance-controlled tax rates. No rate is seeded until verified against applicable tax treatment.';
