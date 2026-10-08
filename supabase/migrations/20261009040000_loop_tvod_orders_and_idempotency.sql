-- Loop TVOD order ledger. The checkout service must insert a row after creating
-- the Razorpay order and before returning the order to the browser.
create table if not exists public.loop_payment_orders (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay' check (provider = 'razorpay'),
  provider_order_id text not null unique,
  provider_payment_id text unique,
  user_id uuid not null,
  title_id uuid not null references public.loop_titles(id),
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created'
    check (status in ('created', 'authorized', 'captured', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  captured_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists loop_payment_orders_user_title_idx
  on public.loop_payment_orders (user_id, title_id, created_at desc);

alter table public.loop_payment_orders enable row level security;
-- Intentionally no client-facing RLS policies: service-role server code only.

-- Provider event IDs and payment transaction IDs must be idempotent. Create
-- indexes only after verifying there are no pre-existing duplicates.
create unique index if not exists loop_payment_events_event_id_uidx
  on public.loop_payment_events (event_id);

create unique index if not exists loop_tvod_entitlements_payment_transaction_uidx
  on public.loop_user_tvod_entitlements (payment_transaction_id);

create index if not exists loop_tvod_entitlements_active_lookup_idx
  on public.loop_user_tvod_entitlements (user_id, title_id, status, expires_at);
