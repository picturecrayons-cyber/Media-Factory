-- Bridge platform membership control plane.
-- Additive, isolated from Loop subscriptions and title-license entitlements.
-- Billing is intentionally hard-disabled; no payment collection is enabled here.
begin;

create table if not exists public.bridge_membership_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null,
  version integer not null check (version > 0),
  display_name text not null,
  account_types text[] not null default array['independent_creator','studio','buyer','investor']::text[],
  trial_days integer not null default 30 check (trial_days between 0 and 90),
  billing_interval text not null default 'unconfigured' check (billing_interval in ('unconfigured','monthly','annual')),
  price_amount_paise bigint null check (price_amount_paise is null or price_amount_paise >= 0),
  gst_basis_points integer null check (gst_basis_points is null or gst_basis_points between 0 and 10000),
  grace_period_days integer null check (grace_period_days is null or grace_period_days between 0 and 90),
  billing_enabled boolean not null default false,
  plan_status text not null default 'draft' check (plan_status in ('draft','active','retired')),
  created_by text null references public.bridge_profiles(user_id),
  created_at timestamptz not null default now(),
  unique (plan_key, version),
  check (cardinality(account_types) > 0),
  check (account_types <@ array['independent_creator','studio','buyer','investor']::text[]),
  check ((billing_interval = 'unconfigured' and price_amount_paise is null)
      or (billing_interval in ('monthly','annual') and price_amount_paise is not null)),
  check (billing_enabled = false)
);

create index if not exists bridge_membership_plans_key_version_idx
  on public.bridge_membership_plans(plan_key, version desc);

create table if not exists public.bridge_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique references public.bridge_profiles(user_id),
  organization_id uuid null references public.bridge_organizations(id),
  account_type text not null check (account_type in ('independent_creator','studio','buyer','investor')),
  plan_id uuid not null references public.bridge_membership_plans(id),
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','suspended','cancelled','expired','complimentary')),
  trial_started_at timestamptz null,
  trial_ends_at timestamptz null,
  current_period_started_at timestamptz null,
  current_period_ends_at timestamptz null,
  grace_ends_at timestamptz null,
  granted_by text null references public.bridge_profiles(user_id),
  suspended_by text null references public.bridge_profiles(user_id),
  suspension_reason text null,
  suspended_from_status text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((trial_started_at is null and trial_ends_at is null) or
         (trial_started_at is not null and trial_ends_at is not null and trial_ends_at > trial_started_at))
);

alter table public.bridge_memberships
  add column if not exists suspended_from_status text;

create index if not exists bridge_memberships_status_idx on public.bridge_memberships(status);
create index if not exists bridge_memberships_org_idx on public.bridge_memberships(organization_id);

create table if not exists public.bridge_membership_events (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.bridge_memberships(id),
  actor_user_id text null references public.bridge_profiles(user_id),
  event_type text not null check (event_type in (
    'trial_granted','complimentary_granted','suspended','reinstated',
    'cancelled','expired','plan_assigned','admin_note'
  )),
  from_status text null,
  to_status text null,
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bridge_membership_events_membership_idx
  on public.bridge_membership_events(membership_id, created_at desc);

create table if not exists public.bridge_membership_payments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.bridge_memberships(id),
  user_id text not null references public.bridge_profiles(user_id),
  provider text not null default 'razorpay',
  provider_payment_id text null,
  provider_order_id text null,
  amount_paise bigint not null check (amount_paise >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'pending'
    check (status in ('pending','authorized','captured','failed','refunded','voided')),
  idempotency_key text not null unique,
  receipt_reference text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create index if not exists bridge_membership_payments_member_idx
  on public.bridge_membership_payments(membership_id, created_at desc);

comment on table public.bridge_membership_plans is
  'Versioned Bridge account membership plans. Billing is hard-disabled until separately approved and certified.';
comment on table public.bridge_memberships is
  'Bridge platform membership lifecycle. Separate from Loop subscriptions and title licensing entitlements.';
comment on table public.bridge_membership_events is
  'Append-only audit history for Bridge membership lifecycle changes.';
comment on table public.bridge_membership_payments is
  'Bridge membership payment ledger; no payment collection is enabled by this schema.';

alter table public.bridge_membership_plans enable row level security;
alter table public.bridge_memberships enable row level security;
alter table public.bridge_membership_events enable row level security;
alter table public.bridge_membership_payments enable row level security;

drop policy if exists bridge_membership_plans_deny_browser on public.bridge_membership_plans;
create policy bridge_membership_plans_deny_browser on public.bridge_membership_plans
  for all to anon, authenticated using (false) with check (false);
drop policy if exists bridge_memberships_deny_browser on public.bridge_memberships;
create policy bridge_memberships_deny_browser on public.bridge_memberships
  for all to anon, authenticated using (false) with check (false);
drop policy if exists bridge_membership_events_deny_browser on public.bridge_membership_events;
create policy bridge_membership_events_deny_browser on public.bridge_membership_events
  for all to anon, authenticated using (false) with check (false);
drop policy if exists bridge_membership_payments_deny_browser on public.bridge_membership_payments;
create policy bridge_membership_payments_deny_browser on public.bridge_membership_payments
  for all to anon, authenticated using (false) with check (false);

revoke all on public.bridge_membership_plans from anon, authenticated;
revoke all on public.bridge_memberships from anon, authenticated;
revoke all on public.bridge_membership_events from anon, authenticated;
revoke all on public.bridge_membership_payments from anon, authenticated;

insert into public.bridge_membership_plans (
  plan_key, version, display_name, account_types, trial_days,
  billing_interval, price_amount_paise, gst_basis_points,
  grace_period_days, billing_enabled, plan_status
)
values (
  'bridge_standard', 1, 'Bridge Membership',
  array['independent_creator','studio','buyer','investor']::text[],
  30, 'unconfigured', null, null, null, false, 'active'
)
on conflict (plan_key, version) do nothing;

update public.bridge_membership_plans
set plan_status = 'active'
where plan_key = 'bridge_standard' and version = 1
  and billing_enabled = false and billing_interval = 'unconfigured'
  and price_amount_paise is null;

commit;
