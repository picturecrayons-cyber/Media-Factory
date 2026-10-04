-- Delivery trace: additive investor participation + settlement evidence.
-- Production apply is intentionally gated behind exact-head CI/Preview verification.

alter table public.bridge_destination_packages
  add column if not exists commercial_model text not null default 'REVENUE_SHARE',
  add column if not exists distributor_exclusivity text not null default 'NON_EXCLUSIVE',
  add column if not exists revenue_share_percent numeric(7,4),
  add constraint bridge_destination_packages_commercial_model_check
    check (commercial_model in ('REVENUE_SHARE','FIXED_FEE','MINIMUM_GUARANTEE','HYBRID')),
  add constraint bridge_destination_packages_distributor_exclusivity_check
    check (distributor_exclusivity in ('NON_EXCLUSIVE','EXCLUSIVE')),
  add constraint bridge_destination_packages_revenue_share_percent_check
    check (revenue_share_percent is null or (revenue_share_percent >= 0 and revenue_share_percent <= 100));

create unique index if not exists bridge_destination_packages_id_title_uidx
  on public.bridge_destination_packages(id, title_id);

create table if not exists public.bridge_title_investors (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete cascade,
  investor_name text not null,
  investor_user_id text,
  investment_reference text,
  invested_amount_paise bigint,
  currency text not null default 'INR',
  participation_percent numeric(7,4),
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (invested_amount_paise is null or invested_amount_paise >= 0),
  check (participation_percent is null or (participation_percent >= 0 and participation_percent <= 100))
);

create index if not exists bridge_title_investors_title_idx
  on public.bridge_title_investors(title_id);

create table if not exists public.bridge_title_settlements (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete cascade,
  destination_package_id uuid,
  revenue_received_paise bigint not null default 0,
  creator_payable_paise bigint not null default 0,
  investor_payable_paise bigint not null default 0,
  bridge_share_paise bigint not null default 0,
  currency text not null default 'INR',
  status text not null default 'PENDING' check (status in ('PENDING','PARTIAL','SETTLED','ON_HOLD')),
  evidence jsonb not null default '[]'::jsonb,
  settled_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  foreign key (destination_package_id, title_id)
    references public.bridge_destination_packages(id, title_id)
    on delete set null,
  check (revenue_received_paise >= 0),
  check (creator_payable_paise >= 0),
  check (investor_payable_paise >= 0),
  check (bridge_share_paise >= 0)
);

create index if not exists bridge_title_settlements_title_idx
  on public.bridge_title_settlements(title_id);

alter table public.bridge_title_investors enable row level security;
alter table public.bridge_title_settlements enable row level security;

drop policy if exists bridge_title_investors_title_read on public.bridge_title_investors;
create policy bridge_title_investors_title_read
on public.bridge_title_investors for select to authenticated
using (public.bridge_can_read_title(title_id));

drop policy if exists bridge_title_settlements_title_read on public.bridge_title_settlements;
create policy bridge_title_settlements_title_read
on public.bridge_title_settlements for select to authenticated
using (
  public.bridge_can_read_title(title_id)
  and (
    public.bridge_current_internal_role() in ('finance','admin','super_admin')
    or exists (
      select 1 from public.bridge_titles t
      where t.id = title_id
        and t.owner_user_id = public.bridge_current_user_id()
    )
  )
);

revoke all on public.bridge_title_investors from anon, authenticated;
revoke all on public.bridge_title_settlements from anon, authenticated;
