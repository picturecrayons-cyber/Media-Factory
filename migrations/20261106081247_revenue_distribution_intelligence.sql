-- Revenue & Distribution Intelligence
-- Additive, server-only financial read model. Never seed synthetic earnings.

create table if not exists public.bridge_channel_statement_lines (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  channel_code text not null check (channel_code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  channel_name text not null,
  period_start date not null,
  period_end date not null,
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  estimate_amount_minor bigint check (estimate_amount_minor is null or estimate_amount_minor >= 0),
  reported_gross_minor bigint check (reported_gross_minor is null or reported_gross_minor >= 0),
  adjustments_minor bigint not null default 0,
  net_amount_minor bigint check (net_amount_minor is null or net_amount_minor >= 0),
  statement_status text not null default 'ESTIMATED'
    check (statement_status in ('ESTIMATED','REPORTED','RECONCILED','DISPUTED')),
  statement_reference text,
  source_hash text unique,
  received_at timestamptz,
  reconciled_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_channel_statement_period_chk check (period_end >= period_start),
  constraint bridge_channel_statement_amounts_chk check (
    net_amount_minor is null
    or reported_gross_minor is null
    or net_amount_minor = greatest(0, reported_gross_minor + adjustments_minor)
  ),
  constraint bridge_channel_statement_has_amount_chk check (
    estimate_amount_minor is not null or reported_gross_minor is not null
  )
);

create index if not exists bridge_channel_statement_title_period_idx
  on public.bridge_channel_statement_lines(title_id, period_end desc);
create index if not exists bridge_channel_statement_channel_period_idx
  on public.bridge_channel_statement_lines(channel_code, period_end desc);
create index if not exists bridge_channel_statement_status_idx
  on public.bridge_channel_statement_lines(statement_status, period_end desc);

create table if not exists public.bridge_channel_payment_schedule (
  id uuid primary key default gen_random_uuid(),
  statement_line_id uuid not null unique
    references public.bridge_channel_statement_lines(id) on delete restrict,
  estimate_available_at date,
  payment_due_at date,
  payment_posted_at timestamptz,
  paid_amount_minor bigint check (paid_amount_minor is null or paid_amount_minor >= 0),
  payment_reference text,
  payment_status text not null default 'SCHEDULED'
    check (payment_status in ('SCHEDULED','PAYMENT_PENDING','PAID','OVERDUE','DISPUTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bridge_channel_payment_dates_chk check (
    payment_due_at is null or estimate_available_at is null or payment_due_at >= estimate_available_at
  )
);

create index if not exists bridge_channel_payment_due_idx
  on public.bridge_channel_payment_schedule(payment_status, payment_due_at);

alter table public.bridge_channel_statement_lines enable row level security;
alter table public.bridge_channel_payment_schedule enable row level security;
revoke all on public.bridge_channel_statement_lines from public, anon, authenticated;
revoke all on public.bridge_channel_payment_schedule from public, anon, authenticated;

comment on table public.bridge_channel_statement_lines is
  'Channel-reported title-level estimates and statement amounts. Estimates are not payments.';
comment on table public.bridge_channel_payment_schedule is
  'Expected and confirmed channel payment dates linked to a statement line.';
